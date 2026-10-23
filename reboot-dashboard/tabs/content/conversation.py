"""대화 한 턴 (LangGraph 없이 고정 단계 — 설명서 5.1의 흐름을 서버 함수로).

  1 읽기   캠페인 최신 리비전 · 시트 · 결정 · 버전 (업무 DB가 원본, 매 턴 다시 읽음)
  2 맥락   브랜드(항상) + 선택 제품 사실(상태 포함) + 최근 대화 + 서버 신호 + 작업 지침
  3 판단   대화·제작 AI → intent · assistant_text · decision_patch · candidates · questions · action_request
  4 검증   허용 필드 · 제품 ID · 대상 조건 · 확정 조건("좋네"는 확정 아님) · 실행 의도(사용자가 명확히 요청했을 때만)
  5 실행   텍스트 초안·수정(같은 요청 안) · 이미지(작업 등록 → 뒤에서) · 버전 선택
  6 저장   마지막에 짧은 트랜잭션 한 번 — AI를 부르는 동안에는 DB에 쓰지 않음 (SQLite 잠금 · 실패 시 상태 유지)

재개 지점은 DB 자체입니다. 실패(AI 오류·형식 오류·거절)면 아무것도 저장하지 않고 결정도 바꾸지 않습니다.
"""
import re
import time

from flask import current_app
from sqlalchemy.exc import IntegrityError

from server.catalog import service as catalog
from server.core.ai import AIError
from server.extensions import db
from server.models import utcnow
from server.security import ApiError, clip
from . import drafts, heuristics, media, prompts, providers, repository, schemas
from . import options as O
from .models import ContentCampaign, ContentMessage, ContentVersion

NO_KEY = ("OpenAI 키가 없어 AI 대화를 쓸 수 없습니다. 설정 › 연결에서 OPENAI_API_KEY를 넣으면 사용 가능합니다. "
          "지금은 시트·결정 사항 정리와 초안 직접 작성으로 진행할 수 있어요.")
TURN_BUDGET = 150  # 초 — 이 시간이 지나면 선택 단계(자동 재작성)는 건너뜀 (gunicorn timeout 300초 안에서)
REQ_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")
DONE_PATCH_RE = re.compile(r"(반영했|반영해\s*뒀|반영되었|반영됐|적용했|적용됐|저장했|저장됐|변경했|변경됐|바꿨|바꿔\s*뒀|업데이트했|확정했)")
DONE_MAKE_RE = re.compile(r"(만들었|생성했|생성됐|생성되었|작성했|완성했|그렸|완료했|완료됐)")
FILLED_Q = {
    "goal": re.compile(r"목적(은|이|을)\s*(무엇|뭐|어떻게|정해)|어떤\s*목적|목적을\s*(알려|정해)"),
    "channels": re.compile(r"(어느|어떤)\s*채널|채널(은|을|이)\s*(무엇|뭐|어디)"),
    "content_type": re.compile(r"(어떤|무슨)\s*(콘텐츠|형식)(을|를)?\s*(만들|원하)"),
    "target": re.compile(r"(어떤|어느)\s*제품(을|으로|을\s*대상)?\s*(선택|고르|만들|원하)|제작\s*대상(은|을|이)\s*(무엇|뭐)"),
}


# ───────── 2 맥락 ─────────

def _msg_line(m):
    role = {"user": "사용자", "assistant": "AI", "event": "기록"}.get(m.role, m.role)
    line = f"[{role}] {m.text[:600]}"
    p = m.payload or {}
    extra = []
    if p.get("applied"):
        extra.append("서버 반영: " + repository.describe_applied(p["applied"], 6))
    act = p.get("action") or {}
    if act.get("versionLabels"):
        extra.append("생성 버전: " + ", ".join(act["versionLabels"]))
    if act.get("status") in ("skipped", "failed") and act.get("note"):
        extra.append("실행 안 함: " + act["note"][:120])
    if p.get("candidates"):
        extra.append("후보: " + " / ".join(c.get("label", "") for c in p["candidates"]))
    return line + (" (" + " · ".join(extra) + ")" if extra else "")


def build_context(c, sheet, decisions, settings, facts, labels, versions, base, message, sig, kickoff):
    recent = (ContentMessage.query.filter_by(campaign_id=c.id).order_by(ContentMessage.id.desc()).limit(12).all())
    total = ContentMessage.query.filter_by(campaign_id=c.id).count()
    brand = facts.get("brand") or {}
    vlist = sorted(versions, key=lambda v: v.id, reverse=True)[:12]
    upcoming = [{"name": s["name"], "start": s["start"], "dday": s["dday"]} for s in catalog.list_seasons()[:3]]
    return {
        "today": catalog._today().isoformat(),
        "campaign": {"id": c.id, "title": c.title, "revision": c.revision, "status": c.status},
        "sheet": {"content_type": sheet["content_type"], "content_type_label": labels["contentType"],
                  "channels": sheet["channels"], "channel_labels": labels["channels"],
                  "brand_focus": sheet["brand_focus"], "product_ids": sheet["product_ids"], "target_label": labels["target"],
                  "goal": sheet["goal"] or None, "extra_request": sheet["extra_request"] or None},
        "decisions": {k: {"value": v.get("value"), "status": v.get("status"), "label": O.DECISION_LABELS.get(k, k)}
                      for k, v in decisions.items()},
        "brand_facts": {k: brand.get(k) for k in ("name", "slogan", "colors", "character", "cm_song", "category", "intro", "market")},
        "product_facts": facts.get("products") or [],
        "facts_version": facts.get("facts_version"),
        "versions": [{"id": v.id, "label": v.label, "seq": v.seq, "kind": v.kind, "parent_id": v.parent_id, "source": v.source,
                      "excerpt": (v.body or "")[:240], "is_final": v.id == c.final_version_id,
                      "is_selected": v.id == (base.id if base else None)} for v in vlist],
        "selected_version": ({"id": base.id, "label": base.label, "kind": base.kind, "body": base.body[:5000],
                              "image": bool(base.image_file)} if base else None),
        "user_materials": {"reference_text": c.reference_text[:4000]} if c.reference_text else None,
        "recent_messages": [_msg_line(m) for m in reversed(recent)],
        "older_messages_omitted": max(0, total - len(recent)),
        "upcoming_seasons": upcoming,
        "settings": {"answer_length": settings["answer_length"], "candidates": settings["candidates"]},
        "server_signals": {
            "explicit_request": sig["explicit_request"], "vague_ack": sig["vague_ack"], "question": sig["question"],
            "excluded_media": sig["excluded_media"], "unit_targets": sig["unit_targets"],
            "image_generation": "가능 (명확한 요청 시)", "image_edit_supported": providers.image_supports_edit(),
            "video_generation": "미연동 — 숏폼은 구성안(실제 영상 아님)만", "active_image_job": media.has_active_job(c.id),
        },
        "user_message": None if kickoff else message,
        "task": prompts.KICKOFF_TASK if kickoff else prompts.TURN_TASK,
    }


# ───────── 4 검증 ─────────

def _candidate_field(field):
    field = str(field or "").strip()
    if field in ("sheet.goal", "sheet.extra_request"):
        return field
    if field.startswith("decisions."):
        try:
            return "decisions." + repository.decision_key(field[10:])
        except (ValueError, repository.FactChange):
            return None
    return None


def sanitize_turn(raw):
    raw = raw if isinstance(raw, dict) else {}
    intent = raw.get("intent") if raw.get("intent") in O.INTENTS else "other"
    text = clip(raw.get("assistant_text"), 2000).strip()
    patches = [p for p in raw.get("decision_patch") or [] if isinstance(p, dict)][:12]
    cands = []
    for cd in raw.get("candidates") or []:
        if not isinstance(cd, dict):
            continue
        field = _candidate_field(cd.get("field"))
        value = clip(cd.get("value"), 300).strip()
        if not field or not value:
            continue
        cands.append({"field": field, "label": clip(cd.get("label"), 80).strip() or value[:80], "value": value,
                      "reason": clip(cd.get("reason"), 200).strip()})
        if len(cands) >= 3:
            break
    questions = [clip(q, 200).strip() for q in raw.get("clarification_questions") or [] if isinstance(q, str) and q.strip()]
    ar = raw.get("action_request") if isinstance(raw.get("action_request"), dict) else {}
    t = ar.get("type") if ar.get("type") in O.ACTION_TYPES else "none"
    tv = ar.get("target_version_id")
    tv = tv if isinstance(tv, int) and not isinstance(tv, bool) else None
    return {"intent": intent, "assistant_text": text, "decision_patch": patches, "candidates": cands,
            "clarification_questions": questions,
            "action_request": {"type": t, "target_version_id": tv, "instructions": clip(ar.get("instructions"), 1000).strip()}}


def filter_questions(questions, sheet):
    """이미 시트에 있는 값을 다시 묻는 질문은 버림 (A06) · 최대 2개."""
    out = []
    for q in questions:
        if sheet["goal"] and FILLED_Q["goal"].search(q):
            continue
        if sheet["channels"] and FILLED_Q["channels"].search(q):
            continue
        if sheet["content_type"] and FILLED_Q["content_type"].search(q):
            continue
        if (sheet["brand_focus"] or sheet["product_ids"]) and FILLED_Q["target"].search(q):
            continue
        out.append(q)
    return out[:2]


def strip_unsupported_claims(text, *, patched, made):
    """서버가 실제로 반영·생성하지 않았는데 '반영했어요/만들었어요'라고 쓴 문장은 뺌 (README 6장)."""
    lines = []
    for line in (text or "").split("\n"):
        parts = re.split(r"(?<=[.!?。])\s+", line)
        kept = [p for p in parts if not ((not patched and DONE_PATCH_RE.search(p)) or (not made and DONE_MAKE_RE.search(p)))]
        if kept or not line.strip():
            lines.append(" ".join(kept))
    out = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return out


def decide_action(turn, sig, sheet, base, versions, force):
    """모델의 실행 요청안 + 사용자 발화 신호 → 실제로 할 일. 모델 출력만으로는 실행하지 않음 (설명서 5.3)."""
    ar = turn["action_request"]
    t = ar["type"]
    vmap = {v.id: v for v in versions}
    model_target = vmap.get(ar["target_version_id"]) if ar["target_version_id"] else None
    # 사용자가 'B안'·'v5'처럼 직접 가리킨 버전이 모델의 추측보다 우선 (모델 대상이 그중 하나면 그대로)
    referred = [v for v in versions if any((r.get("label") and v.label == r["label"]) or (r.get("seq") and v.seq == r["seq"])
                                           for r in sig["version_refs"])]
    if model_target is not None and (not referred or model_target in referred):
        target = model_target
    else:
        target = repository.resolve_version_ref(sig["version_refs"], versions) or model_target
    default_kind = O.CONTENT_TYPES[sheet["content_type"]]["kind"]
    if force == "draft" and not t.startswith("draft_"):
        t = "draft_" + default_kind
    if force == "image" and t not in ("generate_image", "edit_image"):
        t = "edit_image" if (base is not None and base.kind == "image") else "generate_image"
    out = {"type": t, "run": None, "status": "none", "note": "", "target": None, "kind": None, "mode": None}
    if t == "none":
        return out
    if t == "select_version":
        if target is not None:
            out.update(run="select", target=target, status="done")
        else:
            out.update(status="skipped", note="어느 버전인지 찾지 못했어요. 오른쪽 결과 목록에서 골라 주세요.")
        return out
    if not (sig["explicit_request"] or force):
        out.update(status="skipped", reason="not_explicit",
                   note="생성·수정은 '만들어줘', 'B안 더 짧게'처럼 요청하시면 바로 시작할게요.")
        return out
    if t == "generate_video":
        if "video" in sig["excluded_media"]:
            out.update(status="skipped", note="요청대로 영상 작업은 하지 않았어요.")
            return out
        t = "draft_script"
        out.update(type=t, note="실제 영상 생성은 아직 연결되지 않아(Higgsfield 미연동) 숏폼 구성안(실제 영상 아님)으로 만들어요.")
    if t in ("generate_image", "edit_image"):
        if "image" in sig["excluded_media"]:
            out.update(status="skipped", note="요청대로 이미지는 만들지 않았어요.")
            return out
        img = target if (target is not None and target.kind == "image") else (base if base is not None and base.kind == "image" else None)
        if t == "edit_image" and img is None:
            t, out["note"] = "generate_image", "기준 이미지가 없어 새 시안으로 만들어요."
        elif t == "edit_image" and not providers.image_supports_edit():
            t, out["note"] = "generate_image", "선택한 이미지 모델은 기준 이미지 편집을 지원하지 않아 새 시안으로 만들어요 (원본 수정 아님)."
        out.update(run="image", type=t, target=img if t == "edit_image" else None, status="queued")
        return out
    if t in O.ACTION_KINDS:
        kind = O.ACTION_KINDS[t]
        edit_target = None
        if target is not None and target.kind == kind:
            edit_target = target
        elif turn["intent"] == "edit" and base is not None and base.kind == kind:
            edit_target = base
        out.update(run="draft", type=t, kind=kind, mode="edit" if edit_target is not None else "new",
                   target=edit_target, status="pending")
    return out


# ───────── 1~6 한 턴 ─────────

def _request_id(raw):
    raw = str(raw or "").strip()
    return raw if REQ_ID_RE.match(raw) else None


def parse_revision(data):
    raw = data.get("expected_revision", data.get("expectedRevision"))
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ApiError("expected_revision(현재 리비전)이 필요합니다. 새로고침 후 다시 시도하세요.")


def run_turn(c, data, user):
    if not providers.ready():
        raise ApiError(NO_KEY, 503)
    kickoff = bool(data.get("kickoff"))
    message = clip(data.get("message"), 4000).strip()
    if not kickoff and not message:
        raise ApiError("메시지를 입력하세요.")
    expected = parse_revision(data)
    if expected != c.revision:
        raise repository.Conflict(c.id)
    req_id = _request_id(data.get("client_request_id") or data.get("clientRequestId"))
    if req_id and ContentMessage.query.filter_by(campaign_id=c.id, client_request_id=req_id).first():
        raise repository.Duplicate(c.id)
    force = data.get("force_action") if data.get("force_action") in ("draft", "image") else None
    try:
        base_id = int(data.get("base_version_id")) if data.get("base_version_id") not in (None, "") else None
    except (TypeError, ValueError):
        base_id = None

    # 1 읽기
    started = time.monotonic()
    cid, rev0 = c.id, c.revision
    products = repository.products_index()
    sheet, decisions, settings = repository.sheet_of(c), c.decisions, repository.settings_of(c)
    versions = ContentVersion.query.filter_by(campaign_id=cid).order_by(ContentVersion.id).all()
    base = next((v for v in versions if v.id == base_id), None)
    labels = repository.labels_of(sheet, products)
    facts = catalog.product_facts(sheet["product_ids"])
    sig = heuristics.signals(message, has_base=base is not None, force=force, kickoff=kickoff)

    # 2·3 맥락 → 판단
    ctx = build_context(c, sheet, decisions, settings, facts, labels, versions, base, message, sig, kickoff)
    raw = providers.call_json(prompts.turn_system(settings), ctx, schema=schemas.TURN, name="content_turn",
                              action="콘텐츠 대화 (첫 답변)" if kickoff else "콘텐츠 대화", max_tokens=2500, timeout=60)
    turn = sanitize_turn(raw)

    # 4 검증 — 결정 변경안
    plan = repository.plan_changes(sheet, decisions, turn["decision_patch"], user=user, source="chat", revision=rev0,
                                   vague=sig["vague_ack"], allow_sheet=not kickoff, protect_confirmed=True,
                                   products=products)
    new_sheet, new_dec = plan["sheet"], plan["decisions"]
    candidates = list(turn["candidates"])
    for d in plan["demoted"]:
        if len(candidates) < 3 and d.get("value"):
            candidates.append({"field": d["field"], "label": d["value"][:80], "value": d["value"],
                               "reason": "AI 제안 — 고르면 시트에 반영돼요"})
    questions = filter_questions(turn["clarification_questions"], new_sheet)
    if kickoff:  # 첫 답변: 실행 없음 · 시트 제안은 후보 카드로만 (거절 줄은 숨김)
        turn["action_request"]["type"] = "none"
        plan["rejected"] = [r for r in plan["rejected"] if not r["field"].startswith("sheet.")]

    # 5 실행
    act = decide_action(turn, sig, new_sheet, base, versions, force)
    new_labels = repository.labels_of(new_sheet, products)
    new_facts = facts if new_sheet["product_ids"] == sheet["product_ids"] else catalog.product_facts(new_sheet["product_ids"])
    drafts_out, draft_meta, job_spec = [], None, None
    if act["run"] == "draft":
        try:
            drafts_out, draft_meta = drafts.generate(
                act["kind"], mode=act["mode"], sheet=new_sheet, decisions=new_dec, settings=settings, facts=new_facts,
                labels=new_labels, base=act["target"], request=message, instructions=turn["action_request"]["instructions"],
                targets=sig["unit_targets"], reference=c.reference_text or "", deadline=started + TURN_BUDGET)
            act["status"] = "done"
        except AIError as e:
            act.update(status="failed", note=f"초안을 만들지 못했어요: {e}")
    elif act["run"] == "image":
        if media.has_active_job(cid):
            act.update(run=None, status="skipped", note="이미지 작업이 이미 진행 중이에요. 끝난 뒤 다시 요청해 주세요.")
        else:
            job_spec = act

    made = bool(drafts_out) or job_spec is not None
    text = strip_unsupported_claims(turn["assistant_text"], patched=bool(plan["applied"]), made=made)
    if not text:
        text = "요청을 확인했어요." if not kickoff else "기본 정보 시트를 확인했어요."

    # 6 저장 (짧은 트랜잭션) — 같은 요청 ID가 동시에 두 번 오면 UNIQUE 제약으로 하나만 저장
    try:
        bot, user_msg, new_versions, job = _persist(
            cid, rev0, user=user, message=message, kickoff=kickoff, req_id=req_id, base=base, force=force, plan=plan,
            settings=settings, facts=new_facts, labels=new_labels, act=act, drafts_out=drafts_out, draft_meta=draft_meta,
            job_spec=job_spec, turn=turn, text=text, candidates=candidates, questions=questions, sig=sig)
    except IntegrityError:
        db.session.rollback()
        raise repository.Duplicate(cid)
    job_out = repository.job_dict(job)  # 등록 시점 상태 (작업은 이제부터 뒤에서)
    if job is not None:
        media.launch(current_app._get_current_object(), job_out["id"])
    c = db.session.get(ContentCampaign, cid)
    return {"campaign": repository.campaign_state(c), "reply": repository.message_dict(bot),
            "userMessage": repository.message_dict(user_msg), "newVersionIds": [v.id for v in new_versions],
            "job": job_out}


def _persist(cid, rev0, *, user, message, kickoff, req_id, base, force, plan, settings, facts, labels, act, drafts_out,
             draft_meta, job_spec, turn, text, candidates, questions, sig):
    c = db.session.get(ContentCampaign, cid)
    if c is None:
        raise ApiError("캠페인이 삭제되었습니다.", 404)
    if plan["applied"] and c.revision != rev0:
        raise repository.Conflict(cid)
    new_sheet, new_dec = plan["sheet"], plan["decisions"]
    user_msg = None
    if not kickoff:
        user_msg = ContentMessage(campaign_id=cid, role="user", text=message, revision=rev0, client_request_id=req_id,
                                  user_name=user)
        user_msg.payload = {"baseVersionId": base.id if base else None, "forceAction": force}
        db.session.add(user_msg)
        db.session.flush()
    msg_id = user_msg.id if user_msg else None
    if plan["applied"]:
        repository.commit_changes(c, plan, source="chat", user=user, message_id=msg_id)

    new_versions = []
    if drafts_out:
        snap, shash = repository.make_snapshot(new_sheet, new_dec, settings, facts.get("facts_version"),
                                               model=draft_meta["model"], mode=act["mode"], request=message[:500],
                                               language=draft_meta["language"])
        labels_for = ([act["target"].label] if act["mode"] == "edit"
                      else repository.next_letter_labels(cid, len(drafts_out)))
        seq = repository.next_seq(cid)
        for i, d in enumerate(drafts_out):
            note_bits = []
            if act["kind"] == "script":
                note_bits.append("구성안 · 실제 영상 아님")
            if draft_meta.get("merge") and draft_meta["merge"].get("note"):
                note_bits.append(draft_meta["merge"]["note"])
            if d.get("rewritten"):
                note_bits.append("키워드 확인 후 자동 재작성")
            v = ContentVersion(campaign_id=cid, seq=seq + i, kind=act["kind"], label=labels_for[min(i, len(labels_for) - 1)],
                               title=d["title"], body=d["body"], parent_id=act["target"].id if act["mode"] == "edit" else None,
                               source="ai", approach=d["approach"], note=" · ".join(note_bits)[:500],
                               facts_version=facts.get("facts_version") or "", snapshot_hash=shash, created_by=user,
                               message_id=msg_id)
            v.snapshot = snap
            v.claims, v.needs_check = d["claims"], d["needs_check"]
            v.review = {"keyword": d["review"], "rewrites": 1 if d.get("rewritten") else 0}
            db.session.add(v)
            new_versions.append(v)
        db.session.flush()
        c.selected_version_id = new_versions[0].id
    if act["run"] == "select" and act["target"] is not None:
        c.selected_version_id = act["target"].id

    job = None
    if job_spec is not None:
        jsnap, jhash = repository.make_snapshot(new_sheet, new_dec, settings, facts.get("facts_version"))
        tgt = job_spec["target"]
        job = media.new_job(
            c, kind="image_edit" if job_spec["type"] == "edit_image" else "image", base=tgt,
            instructions=turn["action_request"]["instructions"] or message,
            snapshot={"sheet": new_sheet, "labels": labels, "decisions": new_dec, "facts": facts,
                      "request": message[:1000], "snapshot": jsnap, "snapshot_hash": jhash,
                      "base_image": {"label": tgt.label, "seq": tgt.seq} if tgt is not None else None,
                      "selected_at_request": c.selected_version_id},
            request_key=f"{cid}:{req_id}" if req_id else None, user=user, message_id=msg_id)
        db.session.add(job)

    action_payload = {"type": act["type"], "status": act["status"], "note": act["note"],
                      "versionIds": [v.id for v in new_versions], "versionLabels": [f"{v.label} (v{v.seq})" for v in new_versions],
                      "jobId": job.id if job is not None else None, "mode": act.get("mode"), "kind": act.get("kind")}
    if act["run"] == "select" and act["target"] is not None:
        action_payload["versionIds"] = [act["target"].id]
        action_payload["versionLabels"] = [f"{act['target'].label} (v{act['target'].seq})"]
    bot = ContentMessage(campaign_id=cid, role="assistant", text=text, revision=rev0 + (1 if plan["applied"] else 0),
                         user_name="REBOOT AI")
    bot.payload = {"intent": turn["intent"], "candidates": candidates, "questions": questions,
                   "applied": plan["applied"], "rejected": plan["rejected"], "factRequests": plan["fact_requests"],
                   "action": action_payload, "model": providers.text_model(), "kickoff": kickoff,
                   "signals": {"explicit": sig["explicit_request"], "vagueAck": sig["vague_ack"]},
                   "promptVersion": prompts.PROMPT_BUNDLE_VERSION}
    db.session.add(bot)
    c.updated_at, c.updated_by = utcnow(), user
    if plan["applied"]:
        repository.guarded_bump(cid, rev0)
    db.session.commit()
    return bot, user_msg, new_versions, job
