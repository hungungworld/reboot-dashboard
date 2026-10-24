"""FDA 경고장 수집 · AI 페르소나 — 인터넷·키 없이 확인 (외부 요청은 모두 가짜로 바꿈)."""
import io
import json
from datetime import date, timedelta
from types import SimpleNamespace

from openpyxl import Workbook

from tabs.compliance import ai_review, refresh, warning_letters

LETTER = """WARNING LETTER  MARCS-CMS 612345  Product: Party Gummies
Your website makes claims such as: “Party Gummies prevent hangovers so you can drink all night” and
“Protects your liver from alcohol damage”. See section 201(g)(1) of the Act, 21 U.S.C. 321(g)(1)."""


def _xlsx():
    wb = Workbook()
    ws = wb.active
    ws.append(["Posted Date", "Letter Issue Date", "Company Name", "Issuing Office", "Subject"])
    recent = (date.today() - timedelta(days=10)).strftime("%m/%d/%Y")
    old = (date.today() - timedelta(days=900)).strftime("%m/%d/%Y")
    ws.append([recent, recent, "Party Gummies LLC", "Human Foods Program", "Unapproved New Drugs/Misbranded"])
    ws["C2"].hyperlink = "/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/party-gummies-llc-612345-10012026"
    ws.append([recent, recent, "Pill Maker Inc", "Center for Drug Evaluation and Research", "CGMP/Finished Pharmaceuticals"])
    ws.append([old, old, "Old Juice Co", "Human Foods Program", "Juice HACCP/Adulterated"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _offline(monkeypatch):
    """자동 경로는 fda.gov 봇 차단처럼, 다른 출처는 0건으로."""
    def blocked(*a, **k):
        raise warning_letters.Blocked("fda.gov가 자동 요청을 막았습니다 (봇 차단).")
    monkeypatch.setattr(warning_letters, "_fetch", blocked)
    monkeypatch.setattr(refresh, "SOURCES", [refresh.SOURCES[0]])
    for k in ("FDA_DASHBOARD_USER", "FDA_DASHBOARD_KEY"):   # .env의 실제 키로 FDA를 부르지 않게
        monkeypatch.delenv(k, raising=False)


def test_extract_claims_skips_legal_text():
    quotes = warning_letters.extract_claims(LETTER)
    assert quotes == ["Party Gummies prevent hangovers so you can drink all night", "Protects your liver from alcohol damage"]


def test_xlsx_upload_keeps_recent_food_letters(auth_client):
    res = auth_client.post("/api/compliance/letters/xlsx", data={"file": (io.BytesIO(_xlsx()), "letters.xlsx")},
                           content_type="multipart/form-data")
    assert res.status_code == 200, res.get_json()
    out = res.get_json()
    assert out["letters"] == {"rows": 3, "food": 1, "added": 1}
    src = next(s for s in out["sources"] if s["id"] == "fda-warning-letters")
    assert [i["id"] for i in src["items"]] == ["612345"]
    assert src["items"][0]["url"].startswith("https://www.fda.gov/")


def test_xlsx_upload_rejects_other_files(auth_client):
    res = auth_client.post("/api/compliance/letters/xlsx", data={"file": (io.BytesIO(b"hello"), "a.xlsx")},
                           content_type="multipart/form-data")
    assert res.status_code == 400
    assert auth_client.post("/api/compliance/letters/xlsx", data={}, content_type="multipart/form-data").status_code == 400


def test_text_upload_becomes_casebook_candidates(auth_client):
    res = auth_client.post("/api/compliance/letters/text", json={
        "text": LETTER, "url": "https://www.fda.gov/x/party-gummies-llc-612345-10012026", "firm": "Party Gummies LLC", "issued": "2026-10-01"})
    assert res.status_code == 200, res.get_json()
    item = next(s for s in res.get_json()["sources"] if s["id"] == "fda-warning-letters")["items"][0]
    assert item["id"] == "612345" and len(item["quotes"]) == 2 and item["date"] == "2026-10-01"


def test_text_upload_input_checks(auth_client):
    assert auth_client.post("/api/compliance/letters/text", json={"text": "short"}).status_code == 400
    assert auth_client.post("/api/compliance/letters/text", json={"text": LETTER, "url": "https://evil.example/x"}).status_code == 400
    assert auth_client.post("/api/compliance/letters/text", json={"text": "x" * 100}).status_code == 400   # 인용 문구 없음


def test_refresh_reports_block_but_keeps_uploaded(auth_client, monkeypatch):
    _offline(monkeypatch)
    auth_client.post("/api/compliance/letters/text", json={"text": LETTER, "firm": "Party Gummies LLC"})
    out = auth_client.post("/api/compliance/monitor/refresh", json={}).get_json()
    src = next(s for s in out["sources"] if s["id"] == "fda-warning-letters")
    assert src["items"] and src["items"][0]["quotes"]
    errs = " ".join(e["error"] for e in out["errors"])
    assert "봇 차단" in errs and "Data Dashboard 키 없음" in errs


def test_ai_review_sends_persona(app, monkeypatch):
    sent = {}

    class Fake:
        def __init__(self, **kw):
            self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

        def create(self, **kw):
            sent.update(kw)
            body = {"verdict": "BLOCK", "confidence": "high", "summary": "s", "issues": [], "rewrite": "r"}
            return SimpleNamespace(stop_reason="end_turn", model="claude-test", content=[SimpleNamespace(type="text", text=json.dumps(body))])

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai_review.anthropic, "Anthropic", Fake)
    with app.app_context():
        ai_review.review("Prevents hangovers.", persona="미국 광고 전문가 " + "가" * 700)
        texts = [b["text"] for b in sent["system"]]
        assert texts[0] == ai_review.SYSTEM and "never makes a verdict less strict" in texts[1]
        assert len(texts[1]) == len(ai_review.PERSONA_INTRO) + ai_review.MAX_PERSONA   # 600자에서 자름
        assert "cache_control" in sent["system"][-1]
        sent.clear()
        ai_review.review("Prevents hangovers.")
        assert len(sent["system"]) == 2   # 페르소나가 없으면 블록도 없음
