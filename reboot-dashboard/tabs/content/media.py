"""이미지 생성·편집 작업 (README 7.1·8장 · 설명서 9장).

- 명확한 요청이 있을 때만 대화 턴이 작업을 등록 → 대화 HTTP 요청을 붙잡지 않고 뒤에서 실행 (jobs.run_background)
- 상태: queued → running → saving → succeeded / failed / submission_unknown (응답 시간 초과 · 자동 재제출 없음)
- 편집: 기준 이미지 파일을 실제로 넣어 고침 (GPT 이미지 계열). 지원하지 않으면 '새 시안'으로 표시하고 원본 수정이라 하지 않음
- 글자·로고는 이미지 안에 그리지 않고 텍스트 레이어로 따로 둠 (PL01 · README 7.2)
- 파일: DATA_DIR/uploads/content/<이름>.png → GET /api/content/files/<이름>.png (로그인 필요)
"""
import re
import secrets
import time
from pathlib import Path

from flask import current_app

from server import jobs, worklog
from server.core.ai import AIError
from server.extensions import db
from server.models import utcnow
from . import prompts, providers, repository, review, schemas
from .models import ContentCampaign, ContentJob, ContentVersion

FILE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{5,80}\.png$")
NO_TEXT = ("Do not render any text, letters, numbers, logos, watermarks or labels anywhere in the image; "
           "leave clean negative space for a separate text overlay. Generic unbranded packaging only.")
SLOGAN = "Restart Your Day"


def upload_dir():
    d = Path(current_app.config["DATA_DIR"]) / "uploads" / "content"
    d.mkdir(parents=True, exist_ok=True)
    return d


def image_size(ratio_text):
    """비율 결정값 → 모델이 지원하는 크기 (정확히 같지 않으면 근사값을 기록)."""
    r = str(ratio_text or "").replace(" ", "").lower()
    if any(x in r for x in ("9:16", "4:5", "2:3", "3:4", "세로", "portrait", "스토리", "릴스", "reels", "story")):
        return "1024x1536"
    if any(x in r for x in ("16:9", "3:2", "4:3", "가로", "landscape", "와이드", "wide")):
        return "1536x1024"
    return "1024x1024"


def has_active_job(campaign_id):
    repository.settle_stale_jobs(campaign_id)
    return ContentJob.query.filter(ContentJob.campaign_id == campaign_id,
                                   ContentJob.status.in_(repository.ACTIVE_JOB)).first() is not None


def new_job(campaign, *, kind, base, instructions, snapshot, request_key, user, message_id=None):
    ratio = (snapshot.get("decisions", {}).get("ratio") or {}).get("value")
    job = ContentJob(id=secrets.token_hex(16), campaign_id=campaign.id, kind=kind, status="queued",
                     request_key=request_key, base_version_id=base.id if base is not None else None,
                     model=providers.image_model(), size=image_size(ratio), instructions=(instructions or "")[:2000],
                     created_by=user, message_id=message_id)
    job.snapshot = snapshot
    return job


def launch(app, job_id):
    jobs.run_background(app, f"content-image-{job_id}", run_image_job, job_id)


# ───────── 실행 (뒤에서) ─────────

def _fallback_plan(snap, job):
    dec = {k: (v or {}).get("value") for k, v in (snap.get("decisions") or {}).items()}
    forms = []
    for p in (snap.get("facts") or {}).get("products") or []:
        pid = p.get("entity_id") or ""
        forms.append("a few individually wrapped stick jelly pouches" if pid.startswith("jelly")
                     else "small bottles of a non-carbonated drink")
    bits = ["Marketing key visual for REBOOT, a US food & beverage brand.",
            "Brand palette: deep black with neon lime accents."]
    if dec.get("background"):
        bits.append(f"Background direction (Korean note): {dec['background']}.")
    if forms:
        bits.append("Show " + " and ".join(forms) + " as generic mockups.")
    else:
        bits.append("Brand mood image without products.")
    for k in ("concept", "style", "mood", "layout", "composition", "lighting"):
        if dec.get(k):
            bits.append(f"{k.capitalize()} (Korean note): {dec[k]}.")
    if job.instructions:
        bits.append(f"Art direction (Korean): {job.instructions[:400]}")
    layers = [{"role": "slogan", "text": SLOGAN}]
    if dec.get("headline"):
        layers.insert(0, {"role": "headline", "text": dec["headline"][:120]})
    return {"prompt_en": " ".join(bits), "keep": [], "change": [], "text_layers": layers,
            "notes_ko": "AI 프롬프트 작성에 실패해 결정 사항으로 만든 기본 프롬프트를 썼어요.", "character_draft": False,
            "fallback": True}


def _plan(snap, job, base):
    user = {
        "mode": "edit" if job.kind == "image_edit" else "generate",
        "sheet": snap.get("labels"), "decisions": snap.get("decisions"),
        "brand_facts": (snap.get("facts") or {}).get("brand"), "product_facts": (snap.get("facts") or {}).get("products"),
        "base_version": ({"label": base.label, "notes": base.body[:1500], "image": snap.get("base_image")} if base else None),
        "request": snap.get("request"), "instructions": job.instructions,
        "size": job.size,
    }
    try:
        out = providers.call_json(prompts.CREATIVE_EDIT_V2, prompts.dumps(user), schema=schemas.IMAGE_PLAN,
                                  name="content_image_plan", action="이미지 프롬프트 작성", max_tokens=1500, timeout=90)
    except AIError:
        return _fallback_plan(snap, job)
    layers = []
    for t in out.get("text_layers") or []:
        if not isinstance(t, dict):
            continue
        role = str(t.get("role") or "text")[:20]
        text = str(t.get("text") or "").strip()[:160]
        if role == "slogan" or re.fullmatch(r"restart\s*your\s*day[.!]?", text, re.I):
            role, text = "slogan", SLOGAN  # 슬로건은 원문 그대로
        if text:
            layers.append({"role": role, "text": text})
    return {"prompt_en": str(out.get("prompt_en") or "").strip()[:2500] or _fallback_plan(snap, job)["prompt_en"],
            "keep": [str(x)[:120] for x in out.get("keep") or []][:8],
            "change": [str(x)[:120] for x in out.get("change") or []][:8],
            "text_layers": layers[:4], "notes_ko": str(out.get("notes_ko") or "")[:400],
            "character_draft": bool(out.get("character_draft")), "fallback": False}


def _save_png(data, campaign_id, job_id):
    name = f"c{campaign_id}-{job_id[:12]}-{secrets.token_hex(4)}.png"
    path = upload_dir() / name
    last = None
    for wait in (0, 0.5, 1.5):  # 파일 보관만 다시 시도 (새 생성 비용 없음)
        time.sleep(wait)
        try:
            path.write_bytes(data)
            return name
        except OSError as e:
            last = e
    current_app.logger.error("콘텐츠 이미지 저장 실패: %s", type(last).__name__)
    return None


def _event(job, text, payload):
    c = db.session.get(ContentCampaign, job.campaign_id)
    if c is not None:
        repository.add_event(c, text, payload, user=job.created_by)
    return c


def _fail(job, message, status="failed"):
    job.status = status
    job.error = message[:400]
    job.finished_at = utcnow()
    _event(job, ("이미지 생성 결과를 확인하지 못했어요: " if status == "submission_unknown" else "이미지 생성 실패: ") + message,
           {"kind": "job_failed", "jobId": job.id, "status": status})
    db.session.commit()
    worklog.add("content", "AI 프롬프트", "이미지 생성", status="실패",
                detail={"model": job.model, "size": job.size, "error": message, "campaign": job.campaign_id},
                user_name=job.created_by)


def run_image_job(job_id):
    job = db.session.get(ContentJob, job_id)
    if job is None or job.status != "queued":
        return  # 이미 실행했거나 취소 — 다시 제출하지 않음
    job.status, job.started_at = "running", utcnow()
    db.session.commit()
    snap = job.snapshot
    base = db.session.get(ContentVersion, job.base_version_id) if job.base_version_id else None
    started = time.time()
    try:
        plan = _plan(snap, job, base)
        prompt = plan["prompt_en"] + "\n\n" + NO_TEXT
        if plan.get("character_draft"):
            prompt += " Any mascot is an original concept sketch, not an official character."
        job.prompt = prompt
        db.session.commit()
        if job.kind == "image_edit" and base is not None and base.image_file:
            png, usage = providers.edit_image(str(upload_dir() / base.image_file), prompt, job.size, job.model)
        else:
            png, usage = providers.generate_image(prompt, job.size, job.model)
    except providers.SubmissionUnknown as e:
        return _fail(job, str(e), status="submission_unknown")
    except providers.ProviderError as e:
        return _fail(job, str(e))
    except Exception:  # 예상 못 한 오류 — 원문은 서버 로그에만
        current_app.logger.exception("콘텐츠 이미지 작업 실패")
        return _fail(job, "이미지 생성 중 알 수 없는 오류가 났습니다.")

    job.status = "saving"
    db.session.commit()
    name = _save_png(png, job.campaign_id, job.id)
    if not name:
        return _fail(job, "이미지는 생성됐지만 파일을 저장하지 못했습니다 (서버 저장 공간 확인).")

    c = db.session.get(ContentCampaign, job.campaign_id)
    if c is None:  # 작업 중 캠페인이 지워짐
        (upload_dir() / name).unlink(missing_ok=True)
        job.status, job.finished_at, job.error = "failed", utcnow(), "캠페인이 삭제되어 결과를 버렸습니다."
        db.session.commit()
        return
    edit = job.kind == "image_edit" and base is not None
    requested_ratio = (snap.get("decisions", {}).get("ratio") or {}).get("value")
    note_bits = []
    if edit:
        note_bits.append(f"{base.label} · v{base.seq}을 기준 이미지로 넣어 편집 (모델 편집 — 영역 밖 픽셀 완전 보존은 보장하지 않음)")
    elif job.base_version_id:
        note_bits.append("새 시안 (원본 편집 아님)")
    if requested_ratio and image_size(requested_ratio) != "1024x1024":
        note_bits.append(f"요청 비율 {requested_ratio} → {job.size}로 생성 · 게시 전 크롭 필요할 수 있음")
    if plan.get("character_draft"):
        note_bits.append("캐릭터 시안 · 공식 외형 아님")
    note_bits.append("제품 형태는 시안 (실제 패키지 아님)")
    layers_text = "\n".join(t["text"] for t in plan["text_layers"])
    image_meta = {"model": job.model, "size": job.size, "mode": "edit" if edit else "generate", "prompt": job.prompt[:3000],
                  "requested_ratio": requested_ratio, "text_layers": plan["text_layers"], "keep": plan["keep"],
                  "change": plan["change"], "prompt_fallback": plan.get("fallback", False), "usage": usage,
                  "seconds": round(time.time() - started, 1), "job_id": job.id}
    v = ContentVersion(
        campaign_id=c.id, seq=repository.next_seq(c.id), kind="image",
        label=base.label if edit else repository.next_image_label(c.id), title=(plan["notes_ko"] or "이미지 시안")[:200],
        body=plan["notes_ko"] or "", image_file=name, parent_id=base.id if edit else None, source="ai",
        approach="; ".join(plan["change"])[:300], note=" · ".join(note_bits)[:500],
        facts_version=(snap.get("facts") or {}).get("facts_version") or "", created_by=job.created_by, message_id=job.message_id)
    v.snapshot = dict(snap.get("snapshot") or {}, image=image_meta, model=job.model)
    v.snapshot_hash = snap.get("snapshot_hash") or ""
    v.review = {"keyword": review.keyword_check(layers_text, "copy", snap.get("sheet") or {}, snap.get("facts") or {}),
                "imageScope": "이미지 속 픽셀·글자는 검사하지 않음 (텍스트 레이어만 확인)"}
    db.session.add(v)
    db.session.flush()
    job.status, job.result_version_id, job.finished_at = "succeeded", v.id, utcnow()
    # 요청한 뒤 사용자가 다른 버전으로 옮겨 가지 않았으면 새 결과를 보여 줌 (최종본은 바꾸지 않음 · A19)
    if c.selected_version_id in (None, job.base_version_id, snap.get("selected_at_request")):
        c.selected_version_id = v.id
    repository.add_event(c, f"이미지 {'편집' if edit else '시안'}이 준비됐어요 · {v.label} (v{v.seq})",
                         {"kind": "job_done", "jobId": job.id, "versionId": v.id}, user=job.created_by)
    c.updated_at = utcnow()
    db.session.commit()
    worklog.add("content", "AI 프롬프트", "이미지 편집" if edit else "이미지 생성",
                detail={"model": job.model, "size": job.size, "prompt": job.prompt[:1500], "campaign": c.id,
                        "version": v.id, "usage": usage, "seconds": image_meta["seconds"]},
                user_name=job.created_by)


def delete_files(names):
    d = upload_dir()
    for n in names:
        if n and FILE_RE.match(n):
            (d / n).unlink(missing_ok=True)
