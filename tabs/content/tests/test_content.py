"""콘텐츠 제작 API — 인터넷·키 없이 (AI·이미지 호출은 tabs.content.providers를 바꿔 끼움)."""
import base64
import io
import re
import zipfile
from datetime import timedelta
from pathlib import Path

import pytest

from tabs.content import conversation, drafts, heuristics, media, providers, repository
from tabs.content import options as O

from conftest import PASSWORD

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
ROOT = Path(__file__).resolve().parents[3]  # 저장소 맨 위


# ───────── 도우미 ─────────

def sheet(**kw):
    s = {"content_type": "image", "channels": ["instagram"], "brand_focus": True, "product_ids": []}
    s.update(kw)
    return s


def create(client, **kw):
    res = client.post("/api/content/campaigns", json=sheet(**kw))
    assert res.status_code == 201, res.get_json()
    return res.get_json()["campaign"]


def get(client, cid):
    return client.get(f"/api/content/campaigns/{cid}").get_json()["campaign"]


def turn(text="네, 진행할게요.", intent="other", patch=None, cands=None, qs=None, action="none", target=None, instr=""):
    return {"intent": intent, "assistant_text": text, "decision_patch": patch or [], "candidates": cands or [],
            "clarification_questions": qs or [], "action_request": {"type": action, "target_version_id": target,
                                                                    "instructions": instr}}


def draft(body, approach="접근", claims=None):
    return {"approach": approach, "title": "제목", "body": body, "claims": claims or [], "needs_check": []}


def chat(client, camp, message, **kw):
    body = {"message": message, "expected_revision": camp["revision"]}
    body.update(kw)
    return client.post(f"/api/content/campaigns/{camp['id']}/chat", json=body)


class FakeAI:
    """providers.call_json 대역: 작업 이름별로 미리 넣어 둔 응답을 차례로 돌려줌."""

    def __init__(self):
        self.queue = {"content_turn": [], "content_draft": [], "content_image_plan": [], "content_suggest": [],
                      "content_review": []}
        self.calls = []

    def add(self, name, *items):
        self.queue[name].extend(items)

    def __call__(self, system, user, *, schema, name, action, max_tokens=3000, timeout=120):
        self.calls.append({"name": name, "system": system, "user": user, "action": action})
        if not self.queue.get(name):
            raise AssertionError(f"예상하지 못한 AI 호출: {name}")
        return self.queue[name].pop(0)

    def names(self):
        return [c["name"] for c in self.calls]


@pytest.fixture()
def ai(monkeypatch):
    fake = FakeAI()
    monkeypatch.setattr(providers, "ready", lambda: True)
    monkeypatch.setattr(providers, "call_json", fake)
    return fake


@pytest.fixture()
def sync_jobs(monkeypatch):
    """이미지 작업을 요청 안에서 바로 실행 (스레드 없이)."""
    monkeypatch.setattr(media, "launch", lambda app, job_id: media.run_image_job(job_id))


# ───────── 권한 · 화면 파일 ─────────

def test_api_requires_login(client):
    assert client.get("/api/content/campaigns").status_code == 401
    assert client.post("/api/content/campaigns", json=sheet()).status_code == 401
    assert client.get("/api/content/files/c1-abcdef123456-0000aaaa.png").status_code == 401


def test_content_page_loads_data_then_main(auth_client):
    html = auth_client.get("/dashboard/content").get_data(as_text=True)
    assert html.index("/parts/content/data.js") < html.index("/parts/content/content.js")
    assert "/parts/content/content.css" in html


def test_data_js_ids_match_server_options():
    text = (ROOT / "tabs" / "content" / "static" / "data.js").read_text(encoding="utf-8")
    for key in list(O.CONTENT_TYPES) + list(O.CHANNELS) + list(O.STATUSES):
        assert f"'{key}'" in text, key


# ───────── 캠페인 생성 · 목록 ─────────

def test_create_brand_only_and_defaults(auth_client):
    camp = create(auth_client)
    assert re.fullmatch(r"인스타 이미지 · \d\d\.\d\d", camp["title"])
    assert camp["revision"] == 1 and camp["status"] == "제작 중"
    assert camp["sheet"]["brand_focus"] is True and camp["sheet"]["product_ids"] == []
    assert camp["decisions"]["language"]["status"] == "proposed"  # 영어는 초기 제안 (확정 아님)
    assert camp["messages"][0]["role"] == "event" and "Reboot 브랜드 자체" in camp["messages"][0]["text"]
    assert camp["facts"]["products"] == [] and camp["facts"]["brand"]["slogan"] == "Restart Your Day"


def test_create_validation(auth_client):
    def err(**kw):
        res = auth_client.post("/api/content/campaigns", json=kw)
        assert res.status_code == 400, res.get_json()
        return res.get_json()["error"]
    assert "콘텐츠" in err(channels=["instagram"], brand_focus=True)
    assert "채널" in err(content_type="image", brand_focus=True)
    assert "대상" in err(content_type="image", channels=["instagram"])
    assert "대상" in err(content_type="image", channels=["instagram"], brand_focus=False, product_ids=[])
    assert "알 수 없는 제품" in err(content_type="image", channels=["instagram"], product_ids=["jelly_original", "fake"])
    assert "하나만" in err(content_type="image", channels=["instagram", "tiktok"], brand_focus=True)
    assert "채널" in err(content_type="image", channels=["myspace"], brand_focus=True)
    plan = create(auth_client, content_type="plan", channels=["instagram", "amazon"])
    assert plan["sheet"]["channels"] == ["instagram", "amazon"]
    multi = create(auth_client, brand_focus=False, product_ids=["drink_balance", "jelly_original"])
    assert multi["sheet"]["product_ids"] == ["jelly_original", "drink_balance"]  # 표준 순서 · 브랜드와 분리
    assert [p["entity_id"] for p in multi["facts"]["products"]] == ["jelly_original", "drink_balance"]
    assert multi["labels"]["target"] == "Reboot Jelly Original + Reboot Drink Balance"


def test_list_search_status_and_counts(auth_client):
    a = create(auth_client)
    b = create(auth_client, channels=["amazon"], content_type="product_desc", brand_focus=False, product_ids=["jelly_balance"])
    create(auth_client, content_type="crm", channels=["crm"])
    res = auth_client.patch(f"/api/content/campaigns/{b['id']}", json={"expected_revision": 1, "status": "완료"})
    assert res.status_code == 200
    data = auth_client.get("/api/content/campaigns").get_json()
    assert data["total"] == 3 and data["counts"] == {"제작 중": 2, "검토 중": 0, "완료": 1} and data["active"] == 2
    assert {"id", "title", "status", "updatedAt", "contentTypeLabel", "channelLabels", "targetLabel"} <= set(data["items"][0])
    assert [i["id"] for i in auth_client.get("/api/content/campaigns?status=완료").get_json()["items"]] == [b["id"]]
    assert [i["id"] for i in auth_client.get("/api/content/campaigns?q=아마존").get_json()["items"]] == [b["id"]]
    assert [i["id"] for i in auth_client.get("/api/content/campaigns?q=저당 젤리").get_json()["items"]] == [b["id"]]
    assert a["id"] in [i["id"] for i in auth_client.get("/api/content/campaigns?q=브랜드").get_json()["items"]]


# ───────── 시트 수정 · 리비전 ─────────

def test_patch_revision_conflict_and_sheet_rules(auth_client):
    camp = create(auth_client)
    cid = camp["id"]
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={"expected_revision": 7, "title": "새 이름"})
    assert res.status_code == 409 and res.get_json()["conflict"] and res.get_json()["revision"] == 1
    assert res.get_json()["campaign"]["title"] == camp["title"]  # 조용히 덮어쓰지 않음
    assert auth_client.patch(f"/api/content/campaigns/{cid}", json={"title": "x"}).status_code == 400  # 리비전 없음
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={
        "expected_revision": 1, "sheet": {"product_ids": ["jelly_original", "drink_original"], "goal": "제품 소개"}})
    assert res.status_code == 200
    c = res.get_json()["campaign"]
    assert c["revision"] == 2 and c["sheet"]["goal"] == "제품 소개"
    assert c["messages"][-1]["role"] == "event" and "시트" in c["messages"][-1]["text"]
    assert {e["field"] for e in c["recentChanges"]} >= {"sheet.product_ids", "sheet.goal"}
    # 대상이 모두 빠지면 거절 (리비전 그대로)
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={"expected_revision": 2, "sheet": {"brand_focus": False, "product_ids": []}})
    assert res.status_code == 400 and "대상" in res.get_json()["error"]
    assert get(auth_client, cid)["revision"] == 2
    # 기획서(채널 2개) ↔ 이미지(채널 1개)를 한 번에 바꿔도 순서와 상관없이 검사
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={"expected_revision": 2, "sheet": {"content_type": "plan", "channels": ["instagram", "tiktok"]}})
    assert res.status_code == 200
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={"expected_revision": 3, "sheet": {"content_type": "image", "channels": ["tiktok"]}})
    assert res.status_code == 200 and res.get_json()["campaign"]["sheet"]["channels"] == ["tiktok"]
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={"expected_revision": 4, "settings": {"candidates": 9}})
    assert res.status_code == 400
    res = auth_client.patch(f"/api/content/campaigns/{cid}", json={"expected_revision": 4, "settings": {"candidates": 2}, "status": "검토 중"})
    assert res.status_code == 200 and res.get_json()["campaign"]["settings"]["candidates"] == 2


def test_guarded_bump_detects_concurrent_write(app, auth_client):
    camp = create(auth_client)
    with app.app_context():
        with pytest.raises(repository.Conflict):
            repository.guarded_bump(camp["id"], 0)


def test_decisions_candidate_manual_undo(auth_client):
    camp = create(auth_client)
    cid = camp["id"]
    url = f"/api/content/campaigns/{cid}/decisions"
    res = auth_client.post(url, json={"expected_revision": 1, "source": "candidate",
                                      "changes": [{"field": "decisions.concept", "value": "After-party ritual", "status": "confirmed"}]})
    assert res.status_code == 200
    c = res.get_json()["campaign"]
    assert c["decisions"]["concept"]["status"] == "confirmed" and c["decisions"]["concept"]["source"] == "candidate"
    assert c["revision"] == 2 and "후보를 골랐어요" in c["messages"][-1]["text"]
    # 제품 사실은 결정 항목으로 바꿀 수 없음
    res = auth_client.post(url, json={"expected_revision": 2, "changes": [{"field": "decisions.price", "value": "$3"}]})
    assert res.status_code == 400 and "확인 대기" in res.get_json()["error"]
    res = auth_client.post(url, json={"expected_revision": 2, "changes": [{"field": "owner", "value": "x"}]})
    assert res.status_code == 400
    # 되돌리기 = 미정으로
    res = auth_client.post(url, json={"expected_revision": 2, "source": "undo",
                                      "changes": [{"field": "decisions.concept", "value": None, "status": "undecided"}]})
    assert res.status_code == 200 and "concept" not in res.get_json()["campaign"]["decisions"]
    assert auth_client.post(url, json={"expected_revision": 1, "changes": [{"field": "decisions.tone", "value": "밝게"}]}).status_code == 409


# ───────── 대화 ─────────

def test_chat_without_key_is_503_and_keeps_state(auth_client):
    camp = create(auth_client)
    res = chat(auth_client, camp, "검정 배경으로 해줘")
    assert res.status_code == 503 and "설정 › 연결" in res.get_json()["error"]
    after = get(auth_client, camp["id"])
    assert after["revision"] == 1 and len(after["messages"]) == 1


def test_chat_applies_valid_patches_and_filters_invalid(auth_client, ai):
    camp = create(auth_client)
    ai.add("content_turn", turn(
        text="배경은 검정으로 정리할게요.", intent="update_decision",
        patch=[{"field": "decisions.background", "value": "검정", "status": "confirmed"},
               {"field": "decisions.concept", "value": "Neon morning", "status": "proposed"},
               {"field": "sheet.product_ids", "value": ["jelly_original", "fake_product"], "status": "confirmed"},
               {"field": "facts.price", "value": "$3.99", "status": "confirmed"},
               {"field": "decisions.ingredients", "value": "vitamin C", "status": "confirmed"},
               {"field": "owner", "value": "someone", "status": "confirmed"}],
        qs=["목적은 무엇인가요?", "어떤 채널에 올릴까요?", "두 제품 중 무엇을 크게 보여 줄까요?"]))
    res = chat(auth_client, camp, "배경은 검정으로 해줘")
    assert res.status_code == 200, res.get_json()
    out = res.get_json()
    pay = out["reply"]["payload"]
    assert [a["field"] for a in pay["applied"]] == ["decisions.background", "decisions.concept"]
    rejected = {r["field"] for r in pay["rejected"]}
    assert {"sheet.product_ids", "facts.price", "decisions.ingredients", "owner"} <= rejected
    assert {f["field"] for f in pay["factRequests"]} == {"facts.price", "decisions.ingredients"}
    c = out["campaign"]
    assert c["revision"] == 2 and c["sheet"]["product_ids"] == []
    bg = c["decisions"]["background"]
    assert bg["status"] == "confirmed" and bg["source"] == "chat" and bg["messageId"] == out["userMessage"]["id"]
    assert c["decisions"]["concept"]["status"] == "proposed"
    # 시트에 이미 있는 채널을 다시 묻지 않음 (목적은 비어 있어 질문 허용) · 최대 2개
    assert "어떤 채널에 올릴까요?" not in pay["questions"] and len(pay["questions"]) <= 2
    assert [m["role"] for m in c["messages"]][-2:] == ["user", "assistant"]
    assert any(e["field"] == "decisions.background" and e["source"] == "chat" for e in c["recentChanges"])
    # 시트에 목적이 있으면 목적 질문은 버림
    assert conversation.filter_questions(["목적은 무엇인가요?"], dict(c["sheet"], goal="구매 유도")) == []


def test_chat_sheet_change_from_chat_updates_sheet(auth_client, ai):
    camp = create(auth_client, brand_focus=False, product_ids=["jelly_original", "drink_original"])
    ai.add("content_turn", turn(intent="update_decision", text="젤리만 남길게요.",
                                patch=[{"field": "sheet.product_ids", "value": ["jelly_original"], "status": "confirmed"}]))
    out = chat(auth_client, camp, "음료는 빼고 젤리만").get_json()
    c = out["campaign"]
    assert c["sheet"]["product_ids"] == ["jelly_original"]
    assert [p["entity_id"] for p in c["facts"]["products"]] == ["jelly_original"]  # 다음 호출엔 최신 대상만
    assert out["reply"]["payload"]["action"]["status"] == "none" and c["versions"] == []


def test_chat_vague_ack_does_not_confirm_or_generate(auth_client, ai):
    camp = create(auth_client)
    ai.add("content_turn", turn(
        text="좋아요! 시안을 만들었어요. 다음엔 톤을 정해요.", intent="draft", action="draft_copy",
        patch=[{"field": "decisions.concept", "value": "Neon morning", "status": "confirmed"},
               {"field": "sheet.goal", "value": "구매 유도", "status": "confirmed"}]))
    out = chat(auth_client, camp, "좋네").get_json()
    assert "content_draft" not in ai.names()
    c = out["campaign"]
    assert c["versions"] == [] and c["decisions"]["concept"]["status"] == "proposed" and c["sheet"]["goal"] == ""
    pay = out["reply"]["payload"]
    assert pay["action"]["status"] == "skipped"
    assert any(cd["field"] == "sheet.goal" for cd in pay["candidates"])  # 시트 변경은 후보로만
    assert "만들었어요" not in out["reply"]["text"] and "톤을 정해요" in out["reply"]["text"]


def test_chat_question_and_excluded_media_do_not_run(auth_client, ai, sync_jobs):
    camp = create(auth_client)
    ai.add("content_turn", turn(intent="question", action="draft_copy", text="검정 배경이 네온과 대비가 커서 그래요."))
    out = chat(auth_client, camp, "왜 이 구도야?").get_json()
    assert out["reply"]["payload"]["action"]["status"] == "skipped" and out["campaign"]["versions"] == []
    camp = out["campaign"]
    ai.add("content_turn", turn(intent="generate_media", action="generate_image", text="이미지도 만들어 볼게요."))
    out = chat(auth_client, camp, "일단 이미지는 말고 카피만 만들어줘").get_json()
    assert out["job"] is None and out["campaign"]["jobs"] == []
    assert "이미지는 만들지 않았어요" in out["reply"]["payload"]["action"]["note"]
    assert "content_draft" not in ai.names()


def test_video_request_becomes_plan_only_script(auth_client, ai):
    camp = create(auth_client, content_type="shortform", channels=["tiktok"])
    ai.add("content_turn", turn(intent="generate_media", action="generate_video", text="15초 영상으로 가 볼게요."))
    ai.add("content_draft", {"note": "", "drafts": [draft("| 장면 | 시간 |\n| --- | --- |\n| SC1 | 0-3s |\n")]})
    out = chat(auth_client, camp, "숏폼 영상 만들어줘").get_json()
    act = out["reply"]["payload"]["action"]
    assert act["type"] == "draft_script" and "실제 영상" in act["note"] and out["job"] is None
    v = out["campaign"]["versions"][0]
    assert v["kind"] == "script" and v["kindLabel"] == "숏폼 구성안" and "실제 영상 아님" in v["note"]


def test_chat_explicit_creation_makes_three_versions_with_review(auth_client, ai):
    camp = create(auth_client, brand_focus=False, product_ids=["jelly_original"])
    ai.add("content_turn", turn(intent="draft", action="draft_copy", text="카피 세 가지 접근으로 쓸게요."))
    ai.add("content_draft", {"note": "", "drafts": [
        draft("**Headline** Restart Your Day.\n**Caption** Stick jelly for your morning.", "아침 루틴",
              [{"text": "stick jelly", "entity_id": "jelly_original", "fact_id": "form"}]),
        draft("**Headline** Low sugar, big energy.", "당 강조"),
        draft("**Headline** Six bottles of fresh start.", "구성",
              [{"text": "6 bottles", "entity_id": "drink_original", "fact_id": "pack"}]),
    ]})
    ai.add("content_draft", {"note": "", "drafts": [draft("**Headline** A neon start for your morning.", "당 강조 → 분위기")]})
    out = chat(auth_client, camp, "카피 바로 만들어줘").get_json()
    c = out["campaign"]
    assert ai.names() == ["content_turn", "content_draft", "content_draft"]  # 초안 + 자동 재작성 1회
    vs = sorted(c["versions"], key=lambda v: v["id"])
    assert [v["label"] for v in vs] == ["A안", "B안", "C안"] and {v["kind"] for v in vs} == {"copy"}
    assert c["selectedVersionId"] == vs[0]["id"] and out["newVersionIds"] == [v["id"] for v in vs]
    assert vs[0]["review"]["keyword"]["status"] == "clear"
    assert vs[1]["review"]["keyword"]["status"] != "error" and "재작성" in vs[1]["note"]
    assert any(i["code"] == "claims" for i in vs[2]["review"]["keyword"]["items"])  # 고르지 않은 제품 근거
    assert all(v["factsVersion"].startswith("user-2026-10-23") and not v["stale"] for v in vs)
    reminder = ai.calls[1]["user"]
    assert "근거 리마인더" in reminder and "Restart Your Day" in ai.calls[1]["system"]
    assert out["reply"]["payload"]["action"]["versionLabels"] == ["A안 (v1)", "B안 (v2)", "C안 (v3)"]


def _manual(client, cid, kind, body, label, parent_id=None):
    res = client.post(f"/api/content/campaigns/{cid}/versions",
                      json={"kind": kind, "body": body, "label": label, "parent_id": parent_id})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_chat_edit_only_the_named_version(auth_client, ai):
    camp = create(auth_client)
    for lab in ("A안", "B안", "C안"):
        _manual(auth_client, camp["id"], "copy", f"{lab} copy body that is long", lab)
    camp = get(auth_client, camp["id"])
    before = {v["label"]: v for v in camp["versions"]}
    ai.add("content_turn", turn(intent="edit", action="draft_copy", text="B안만 줄일게요."))
    ai.add("content_draft", {"note": "", "drafts": [draft("B short")]})
    out = chat(auth_client, camp, "B안 더 짧게").get_json()
    c = out["campaign"]
    assert len(c["versions"]) == 4
    new = next(v for v in c["versions"] if v["id"] == out["newVersionIds"][0])
    assert new["label"] == "B안" and new["parentId"] == before["B안"]["id"] and new["body"] == "B short"
    still = {v["id"]: v["body"] for v in c["versions"]}
    assert still[before["A안"]["id"]] == before["A안"]["body"] and still[before["C안"]["id"]] == before["C안"]["body"]
    assert "base_version" in ai.calls[1]["user"] and "B안 copy body" in ai.calls[1]["user"]
    # 모델이 엉뚱한 버전(A안)을 가리켜도 사용자가 말한 C안을 고침
    c = out["campaign"]
    ai.add("content_turn", turn(intent="edit", action="draft_copy", target=before["A안"]["id"]))
    ai.add("content_draft", {"note": "", "drafts": [draft("C short")]})
    out = chat(auth_client, c, "C안 더 짧게").get_json()
    new = next(v for v in out["campaign"]["versions"] if v["id"] == out["newVersionIds"][0])
    assert new["label"] == "C안" and new["parentId"] == before["C안"]["id"]


def test_cardnews_partial_edit_keeps_other_slides(auth_client, ai):
    camp = create(auth_client, content_type="cardnews")
    base_body = "## S1 · 훅\nHeadline: One\n\n## S2 · 소개\nHeadline: Two\n\n## S3 · 마무리\nHeadline: Three\n"
    made = _manual(auth_client, camp["id"], "cardnews", base_body, "A안")
    camp = made["campaign"]
    ai.add("content_turn", turn(intent="edit", action="draft_cardnews", target=made["versionId"]))
    ai.add("content_draft", {"note": "", "drafts": [draft(
        "## S1 · 훅\nHeadline: CHANGED ONE\n\n## S2 · 소개\nHeadline: New two\n\n## S3 · 마무리\nHeadline: CHANGED THREE\n")]})
    out = chat(auth_client, camp, "2장만 문구 바꿔줘", base_version_id=made["versionId"]).get_json()
    new = next(v for v in out["campaign"]["versions"] if v["id"] == out["newVersionIds"][0])
    assert "Headline: New two" in new["body"]
    assert "Headline: One" in new["body"] and "Headline: Three" in new["body"] and "CHANGED" not in new["body"]
    assert new["parentId"] == made["versionId"] and "S2만" in new["note"]


def test_merge_scenes_unit():
    base = "| 장면 | 시간 |\n| --- | --- |\n| SC1 | 0-3s A |\n| SC2 | 3-8s B |\n| SC3 | 8-15s C |\n"
    new = "| 장면 | 시간 |\n| --- | --- |\n| SC1 | X |\n| SC2 | 3-8s NEW |\n| SC3 | Y |\n"
    out = drafts.merge_scenes(base, new, {2})
    assert "| SC2 | 3-8s NEW |" in out["body"] and "| SC1 | 0-3s A |" in out["body"] and "| SC3 | 8-15s C |" in out["body"]


def test_select_version_and_duplicate_request(auth_client, ai):
    camp = create(auth_client)
    a = _manual(auth_client, camp["id"], "copy", "A body", "A안")
    _manual(auth_client, camp["id"], "copy", "B body", "B안")
    camp = get(auth_client, camp["id"])
    ai.add("content_turn", turn(intent="select_version", action="select_version", text="A안으로 돌아갈게요."))
    out = chat(auth_client, camp, "아까 A안으로 돌아가자", client_request_id="req-000001").get_json()
    assert out["campaign"]["selectedVersionId"] == a["versionId"] and len(out["campaign"]["versions"]) == 2
    res = chat(auth_client, out["campaign"], "아까 A안으로 돌아가자", client_request_id="req-000001")
    assert res.status_code == 409 and res.get_json()["duplicate"]


def test_kickoff_turn_no_user_message_no_action(auth_client, ai):
    camp = create(auth_client, extra_request="검정 배경, 영어로")
    ai.add("content_turn", turn(
        text="브랜드 자체 인스타 이미지로 시작할게요. 검정 배경에 네온 포인트를 제안해요.", action="draft_copy",
        patch=[{"field": "decisions.background", "value": "검정", "status": "confirmed"},
               {"field": "sheet.goal", "value": "브랜드 알리기", "status": "confirmed"}],
        cands=[{"field": "decisions.concept", "label": "Neon morning", "value": "Neon morning", "reason": "브랜드 색"},
               {"field": "decisions.price", "label": "x", "value": "$1", "reason": "사실"}]))
    out = auth_client.post(f"/api/content/campaigns/{camp['id']}/chat",
                           json={"kickoff": True, "expected_revision": 1}).get_json()
    c = out["campaign"]
    assert out["userMessage"] is None and [m["role"] for m in c["messages"]] == ["event", "assistant"]
    assert c["decisions"]["background"]["status"] == "confirmed" and c["sheet"]["goal"] == ""
    pay = out["reply"]["payload"]
    assert pay["action"]["type"] == "none"
    # 시트 제안은 거절 줄 대신 후보 카드로 · 사실 키 후보는 버림
    assert [cd["field"] for cd in pay["candidates"]] == ["decisions.concept", "sheet.goal"]
    assert not any(r["field"].startswith("sheet.") for r in pay["rejected"])


def test_strip_unsupported_claims():
    text = "배경을 검정으로 반영했어요. 카피 3안을 만들었어요! 다음엔 톤을 정해 볼까요?"
    assert conversation.strip_unsupported_claims(text, patched=False, made=False) == "다음엔 톤을 정해 볼까요?"
    assert "반영했어요" in conversation.strip_unsupported_claims(text, patched=True, made=False)


@pytest.mark.parametrize("msg,base,expected", [
    ("좋네", False, False), ("좋아요!", False, False), ("바로 만들어줘", False, True), ("왜 이 구도야?", False, False),
    ("카피만 먼저", False, True), ("일단 이미지는 말고 카피만", False, True), ("B안 더 짧게", False, True),
    ("배경만 검정으로", True, True), ("배경만 검정으로", False, False), ("음료는 빼고 젤리만", False, False),
    ("이미지 생성해줘", False, True), ("생성된 이유가 뭐야?", False, False), ("검정도 괜찮겠다", False, False),
])
def test_explicit_request_heuristic(msg, base, expected):
    assert heuristics.is_explicit_request(msg, base) is expected


def test_unit_targets_heuristic():
    assert heuristics.unit_targets("2장만 수정해줘")["slides"] == [2]
    assert heuristics.unit_targets("1, 3장만 바꿔")["slides"] == [1, 3]
    assert heuristics.unit_targets("5장 구성으로 만들어줘")["slides"] == []
    assert heuristics.unit_targets("장면 2랑 SC4 수정")["scenes"] == [2, 4]
    assert heuristics.excluded_media("영상 없이 대본만") == ["video"]


# ───────── 이미지 작업 · 파일 ─────────

def test_image_generate_then_edit_with_base_file(auth_client, ai, sync_jobs, monkeypatch, app):
    calls = {}

    def fake_generate(prompt, size, model):
        calls["generate"] = (prompt, size, model)
        return PNG, {"total": 10}

    def fake_edit(path, prompt, size, model):
        calls["edit"] = (path, prompt, size, model)
        assert Path(path).is_file()
        return PNG, {}
    monkeypatch.setattr(providers, "generate_image", fake_generate)
    monkeypatch.setattr(providers, "edit_image", fake_edit)
    camp = create(auth_client, brand_focus=False, product_ids=["jelly_original"])
    camp = auth_client.post(f"/api/content/campaigns/{camp['id']}/decisions", json={
        "expected_revision": 1, "changes": [{"field": "decisions.ratio", "value": "4:5 세로"}]}).get_json()["campaign"]
    ai.add("content_turn", turn(intent="generate_media", action="generate_image", text="이미지 시안을 준비할게요."))
    ai.add("content_image_plan", {"prompt_en": "Neon lime jelly sticks on black.", "keep": [], "change": ["background"],
                                  "text_layers": [{"role": "slogan", "text": "RESTART YOUR DAY!"}, {"role": "headline", "text": "Hello"}],
                                  "notes_ko": "검정 배경 시안", "character_draft": False})
    out = chat(auth_client, camp, "이미지 만들어줘").get_json()
    assert out["job"]["status"] == "queued"
    c = get(auth_client, camp["id"])
    img = next(v for v in c["versions"] if v["kind"] == "image")
    assert img["label"] == "시안 1" and img["imageUrl"].startswith("/api/content/files/")
    assert img["image"]["size"] == "1024x1536" and calls["generate"][1] == "1024x1536"
    assert "Do not render any text" in calls["generate"][0]
    assert {"role": "slogan", "text": "Restart Your Day"} in img["image"]["text_layers"]  # 슬로건 원문 그대로
    assert "실제 패키지 아님" in img["note"] and c["jobs"][0]["status"] == "succeeded"
    assert any("이미지 시안이 준비됐어요" in m["text"] for m in c["messages"])
    res = auth_client.get(img["imageUrl"])
    assert res.status_code == 200 and res.mimetype == "image/png" and res.data == PNG
    job = auth_client.get(f"/api/content/jobs/{c['jobs'][0]['id']}").get_json()["job"]
    assert job["versionId"] == img["id"]
    # 기준 이미지를 넣어 편집 → 새 버전 · 부모 연결 · 원본 보존
    ai.add("content_turn", turn(intent="edit", action="edit_image", text="배경만 바꿔 볼게요."))
    ai.add("content_image_plan", {"prompt_en": "Same jelly sticks, white background.", "keep": ["products"],
                                  "change": ["background"], "text_layers": [], "notes_ko": "흰 배경", "character_draft": False})
    out = chat(auth_client, c, "배경만 흰색으로", base_version_id=img["id"]).get_json()
    c = get(auth_client, camp["id"])
    edited = next(v for v in c["versions"] if v["kind"] == "image" and v["id"] != img["id"])
    assert edited["parentId"] == img["id"] and edited["label"] == "시안 1" and edited["image"]["mode"] == "edit"
    assert calls["edit"][0].endswith(img["imageUrl"].rsplit("/", 1)[1])
    assert auth_client.get(img["imageUrl"]).status_code == 200  # 원본 파일 유지


def test_image_timeout_is_submission_unknown_not_retried(auth_client, ai, sync_jobs, monkeypatch):
    n = {"calls": 0}

    def boom(prompt, size, model):
        n["calls"] += 1
        raise providers.SubmissionUnknown("이미지 응답이 늦어 연결을 끊었습니다.")
    monkeypatch.setattr(providers, "generate_image", boom)
    camp = create(auth_client)
    ai.add("content_turn", turn(action="generate_image"))
    ai.add("content_image_plan", {"prompt_en": "x", "keep": [], "change": [], "text_layers": [], "notes_ko": "", "character_draft": False})
    chat(auth_client, camp, "이미지 만들어줘")
    c = get(auth_client, camp["id"])
    assert n["calls"] == 1 and c["jobs"][0]["status"] == "submission_unknown"
    assert not any(v["kind"] == "image" for v in c["versions"])
    assert "확인하지 못했어요" in c["messages"][-1]["text"]


def test_stale_running_job_becomes_unknown(app, auth_client):
    camp = create(auth_client)
    from tabs.content.models import ContentJob
    from server.extensions import db
    from server.models import utcnow
    old = utcnow() - timedelta(hours=1)
    with app.app_context():
        db.session.add(ContentJob(id="a" * 32, campaign_id=camp["id"], status="running", prompt="sent", updated_at=old,
                                  created_at=old))
        db.session.add(ContentJob(id="b" * 32, campaign_id=camp["id"], status="queued", updated_at=old,
                                  created_at=old - timedelta(minutes=1)))
        db.session.commit()
    jobs = {j["id"]: j for j in get(auth_client, camp["id"])["jobs"]}
    assert jobs["a" * 32]["status"] == "submission_unknown" and "자동으로 다시 제출하지 않" in jobs["a" * 32]["error"]
    assert jobs["b" * 32]["status"] == "failed" and "보내기 전" in jobs["b" * 32]["error"]  # 보내지 않은 작업은 비용 없음


def test_file_serving_path_safety(app, auth_client):
    folder = Path(app.config["DATA_DIR"]) / "uploads" / "content"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "c1-orphan000000-aaaa0000.png").write_bytes(PNG)  # DB에 없는 파일
    for url in ("/api/content/files/..%2F..%2Ftest.db", "/api/content/files/test.db", "/api/content/files/c1-orphan000000-aaaa0000.png",
                "/api/content/files/%2e%2e%2freboot.db", "/api/content/files/x.png"):
        res = auth_client.get(url)
        assert res.status_code == 404, url
    assert auth_client.get("/api/content/files/../../test.db").status_code == 404


# ───────── 직접 작성 · 최종본 · 내보내기 · 검토 기록 ─────────

def test_manual_version_final_and_export(auth_client):
    camp = create(auth_client, brand_focus=True, product_ids=["jelly_balance"])
    cid = camp["id"]
    url = f"/api/content/campaigns/{cid}/versions"
    assert auth_client.post(url, json={"kind": "poem", "body": "x"}).status_code == 400
    assert auth_client.post(url, json={"kind": "copy", "body": "  "}).status_code == 400
    other = create(auth_client)
    ov = _manual(auth_client, other["id"], "copy", "other", "A안")
    assert auth_client.post(url, json={"kind": "copy", "body": "x", "parent_id": ov["versionId"]}).status_code == 400
    made = _manual(auth_client, cid, "copy", "**Headline** Restart Your Day with Reboot Jelly Balance. Less sugar!", "A안")
    v = made["campaign"]["versions"][0]
    assert v["source"] == "manual" and v["review"]["keyword"]["status"] == "error"
    res = auth_client.post(f"/api/content/versions/{v['id']}/final", json={})
    assert res.status_code == 200 and res.get_json()["campaign"]["finalVersionId"] == v["id"]
    assert "승인" in res.get_json()["campaign"]["messages"][-1]["text"]
    res = auth_client.post(f"/api/content/versions/{v['id']}/review", json={
        "verdict": "BLOCK", "label": "사용 불가", "channel": "b2c", "products": ["jelly-ls"],
        "findings": [{"code": "R11", "name": "당 표시", "verdict": "BLOCK", "terms": ["Less sugar"]}]})
    assert res.status_code == 200
    assert res.get_json()["campaign"]["versions"][0]["review"]["compliance"]["verdict"] == "BLOCK"
    assert auth_client.post(f"/api/content/versions/{v['id']}/review", json={"verdict": "OK"}).status_code == 400
    res = auth_client.get(f"/api/content/campaigns/{cid}/export")
    assert res.status_code == 200 and res.mimetype == "application/zip"
    assert re.search(r'filename="reboot-content-\d+-\d{8}\.zip"', res.headers["Content-Disposition"])
    z = zipfile.ZipFile(io.BytesIO(res.data))
    names = z.namelist()
    assert {"00_README.txt", "campaign.md", "facts.json", "versions.json", "settings.json"} <= set(names)
    every = "\n".join(z.read(n).decode("utf-8") for n in names)
    assert "승인본이 아닙니다" in every and "user-2026-10-23" in every and "최종본으로 지정됨 (승인 아님)" in every
    assert "development_goal" in every  # Balance 당류 저감 = 개발 목표 상태 유지
    assert "sk-" not in every and "OPENAI_API_KEY" not in every and "password" not in every.lower()
    one = auth_client.get(f"/api/content/campaigns/{cid}/export?version={v['id']}")
    assert one.status_code == 200
    assert auth_client.get(f"/api/content/campaigns/{cid}/export?version={ov['versionId']}").status_code == 404
    res = auth_client.post(f"/api/content/versions/{v['id']}/final", json={"final": False})
    assert res.get_json()["campaign"]["finalVersionId"] is None


def test_ai_review_needs_key_then_records(auth_client, ai, monkeypatch):
    camp = create(auth_client)
    made = _manual(auth_client, camp["id"], "copy", "Restart Your Day.", "A안")
    ai.add("content_review", {"summary": "슬로건 표기는 원문과 같아요.", "issues": [
        {"location": "1행", "problem": "CTA 없음", "suggestion": "Shop now 추가", "basis": "brand"}], "checked_scope": "텍스트"})
    res = auth_client.post(f"/api/content/versions/{made['versionId']}/ai-review", json={})
    assert res.status_code == 200
    rv = res.get_json()["campaign"]["versions"][0]["review"]["ai"]
    assert rv["issues"][0]["problem"] == "CTA 없음" and "독립" in rv["note"]
    monkeypatch.setattr(providers, "ready", lambda: False)
    assert auth_client.post(f"/api/content/versions/{made['versionId']}/ai-review", json={}).status_code == 503


# ───────── 시트 추천 ─────────

def test_suggest_examples_without_key_and_ai_with_key(auth_client, monkeypatch):
    res = auth_client.post("/api/content/suggest", json={"field": "goal", "sheet": sheet()})
    data = res.get_json()
    assert res.status_code == 200 and data["source"] == "example" and len(data["items"]) == 3
    assert data["basis"]["brand_focus"] is True and "키" in data["note"]
    assert auth_client.post("/api/content/suggest", json={"field": "title", "sheet": sheet()}).status_code == 400
    assert auth_client.post("/api/content/suggest", json={"field": "goal", "sheet": {}}).status_code == 400
    assert auth_client.post("/api/content/suggest", json={"field": "extra", "sheet": sheet(product_ids=["nope"])}).status_code == 400
    fake = FakeAI()
    fake.add("content_suggest", {"items": [{"value": "브랜드 첫인상", "reason": "브랜드 자체 선택"},
                                           {"value": "슬로건 소개", "reason": "확인된 슬로건"},
                                           {"value": "색 소개", "reason": "검정 & 네온"}, {"value": "4번째", "reason": "버림"}]})
    monkeypatch.setattr(providers, "ready", lambda: True)
    monkeypatch.setattr(providers, "call_json", fake)
    data = auth_client.post("/api/content/suggest", json={"field": "goal", "sheet": sheet()}).get_json()
    assert data["source"] == "ai" and [i["value"] for i in data["items"]] == ["브랜드 첫인상", "슬로건 소개", "색 소개"]


def test_example_suggestions_never_invent_facts():
    for ct in O.CONTENT_TYPES:
        for s in (sheet(content_type=ct), sheet(content_type=ct, brand_focus=False, product_ids=["jelly_original", "drink_balance"])):
            for field in ("goal", "extra"):
                items = O.example_suggestions(field, s)
                assert len(items) == 3
                text = " ".join(i["value"] + i["reason"] for i in items).lower()
                assert not re.search(r"low sugar|sugar free|hangover|숙취|\d+\s?(g|ml|kcal)|\$", text)


# ───────── 삭제 권한 ─────────

def test_delete_only_creator_or_admin(app, auth_client):
    camp = create(auth_client)
    member = app.test_client()
    assert member.post("/login", data={"email": "member@reboot.test", "password": PASSWORD}).status_code == 302
    res = member.delete(f"/api/content/campaigns/{camp['id']}")
    assert res.status_code == 403
    mine = member.post("/api/content/campaigns", json=sheet()).get_json()["campaign"]
    assert member.delete(f"/api/content/campaigns/{mine['id']}").status_code == 200
    assert auth_client.delete(f"/api/content/campaigns/{camp['id']}").status_code == 200
    assert auth_client.get(f"/api/content/campaigns/{camp['id']}").status_code == 404
