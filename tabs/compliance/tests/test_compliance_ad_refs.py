"""실제 미국 광고 문구 모으기 · 대체 문장 3개 — 인터넷·키 없이 확인 (외부 요청은 모두 가짜로 바꿈).
페이지 모양은 2026-10-27 실제 Firecrawl 응답을 줄여 만든 가짜 (브랜드 이름은 지어낸 것)."""
import json
from types import SimpleNamespace

from tabs.compliance import ad_refs, ai_review

HOME_MD = """# Your first drink of the night, engineered.

[Skip to content](https://sample.example/#main)

## BEST SELLERS

## Stay Chill. Get Hydrated.

Our growing lineup is designed to enrich busy lives everywhere.

- Free shipping on orders over $40

Zesty and bright, with a punch of citrus tang and a perfectly balanced, light acidity.](https://sample.example/products/lemon-lime

## The Science

**Better living through biotechnology**

Drinkwel 90-Capsule Bottle (30 servings)
"""


def test_lines_from_markdown_keeps_copy_and_drops_menu():
    lines = ad_refs.lines_from_markdown(HOME_MD)
    assert lines == [
        "Your first drink of the night, engineered.",
        "Stay Chill. Get Hydrated.",
        "Our growing lineup is designed to enrich busy lives everywhere.",
        "Zesty and bright, with a punch of citrus tang and a perfectly balanced, light acidity.",
        "Better living through biotechnology",
    ]


def test_collect_saves_lines_and_errors(app, monkeypatch):
    from tabs.insights import weee
    from tabs.insights.http import CollectError

    def fake(key, payload):
        if "broken" in payload["url"]:
            raise CollectError("Firecrawl이 페이지를 읽지 못했어요 (500).")
        return {"markdown": HOME_MD}

    monkeypatch.setenv("FIRECRAWL_API_KEY", "test-key")
    monkeypatch.setattr(weee, "firecrawl", fake)
    monkeypatch.setattr(ad_refs, "sites", lambda: [{"brand": "Sample", "url": "https://sample.example/"},
                                                    {"brand": "Broken", "url": "https://broken.example/"}])
    with app.app_context():
        assert ad_refs.due()
        data = ad_refs.collect()
        assert len(data["items"]) == 5 and data["items"][0]["brand"] == "Sample"
        assert data["errors"] == [{"brand": "Broken", "error": "Firecrawl이 페이지를 읽지 못했어요 (500)."}]
        assert ad_refs.load()["items"] == data["items"] and not ad_refs.due()


def test_ad_refs_route_returns_empty_before_collect(auth_client):
    res = auth_client.get("/api/compliance/ad-refs")
    assert res.status_code == 200 and res.get_json()["items"] == []


def test_rewrites_keeps_three_options_and_known_refs(app, monkeypatch):
    sent = {}

    class Fake:
        def __init__(self, **kw):
            self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

        def create(self, **kw):
            sent.update(kw)
            body = {"note_ko": "", "options": [
                {"style": "safe", "text": "Restart your day.", "basis_ko": "숙취 주장을 뺌", "refs": ["ad:1", "ad:made-up"]},
                {"style": "bold", "text": "Big night? Bright morning.", "basis_ko": "말투만 빌림", "refs": ["fda:3"]},
                {"style": "short", "text": "Restart Your Day", "basis_ko": "슬로건", "refs": []},
                {"style": "short", "text": "extra", "basis_ko": "", "refs": []}]}
            return SimpleNamespace(stop_reason="end_turn", model="claude-test", content=[SimpleNamespace(type="text", text=json.dumps(body))])

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai_review.anthropic, "Anthropic", Fake)
    with app.app_context():
        out = ai_review.rewrites("Cure your hangover fast.", refs=[
            {"id": "ad:1", "brand": "Sample", "text": "Stay Chill. Get Hydrated."},
            {"id": "fda:3", "brand": "Double Wood LLC", "text": "NEVER SUFFER ANOTHER HANGOVER"}])
        assert [o["style"] for o in out["options"]] == ["safe", "bold", "short"]
        assert out["options"][0]["refs"] == ["ad:1"]   # 넘기지 않은 근거 id는 지움
        payload = json.loads(sent["messages"][0]["content"].split("\n", 1)[1])
        assert payload["references"][1]["id"] == "fda:3"
        assert sent["system"][0]["text"] == ai_review.REWRITE_SYSTEM


def test_rewrite_route_without_key(auth_client, monkeypatch):
    monkeypatch.setattr(ai_review, "available", lambda: False)
    res = auth_client.post("/api/compliance/rewrite", json={"text": "Cure your hangover fast."})
    assert res.status_code == 503
