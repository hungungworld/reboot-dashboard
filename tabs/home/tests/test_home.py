"""홈 · 데일리 브리핑 API — 뉴스 수집(구글 뉴스 RSS는 가짜 응답) · AI 요약 · 이번 주 To-Do (인터넷 · 키 없이)."""
import json
import threading
from datetime import date, datetime, timedelta, timezone
from email.utils import format_datetime
from xml.sax.saxutils import escape

import pytest

from server.extensions import db
from tabs.home import news, routes, rss, todos
from tabs.home.models import HomeNewsArticle, HomeNewsRun

TODAY = date(2026, 10, 23)  # 금요일 → 이번 주 월요일 10-19


@pytest.fixture()
def today(monkeypatch):
    monkeypatch.setattr("server.catalog.service._today", lambda: TODAY)
    return TODAY


@pytest.fixture()
def fast(app):
    app.config["HOME_RSS_INTERVAL"] = 0  # 테스트에서는 요청 사이를 기다리지 않음
    return app


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class FakeRes:
    def __init__(self, status=200, body=b""):
        self.status_code = status
        self.content = body if isinstance(body, bytes) else body.encode("utf-8")


def rss_xml(items):
    def one(i):
        pub = format_datetime(i["date"].replace(tzinfo=timezone.utc), usegmt=True)
        return (f"<item><title>{escape(i['title'])}</title><link>{escape(i['url'])}</link><pubDate>{pub}</pubDate>"
                f"<source url=\"https://src.example.com\">{escape(i['source'])}</source></item>")
    return ("<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>Google News</title>"
            + "".join(one(i) for i in items) + "</channel></rss>").encode("utf-8")


def items_for(group):
    """검색어별 가짜 기사: 공통 기사 1 + 자기 기사 2 + 노이즈 1 + 잘못된 주소 1 (+ hangover는 급증용 기사)."""
    now = _now()
    items = [{"url": "https://www.example-news.com/shared-story", "title": "Non-alcoholic drinks surge before Halloween - Example News",
              "source": "Example News", "date": now - timedelta(hours=3)}]
    items += [{"url": f"https://{group}.example.com/story-{i}", "title": f"{group} story {i} &amp; more - {group.title()} Daily",
               "source": f"{group.title()} Daily", "date": now - timedelta(hours=10 + i)} for i in range(2)]
    items.append({"url": f"https://{group}.example.com/crash", "title": "Two arrested after DUI crash", "source": "Local", "date": now})
    items.append({"url": "javascript:alert(1)", "title": "bad url", "source": "x", "date": now})
    if group == "hangover":  # 최근 7일 6건 · 그 전 7일 1건 → 보도 급증
        items += [{"url": f"https://hangover.example.com/new-{i}", "title": f"Hangover trend {i}", "source": "Trend",
                   "date": now - timedelta(days=1, hours=i)} for i in range(3)]
        items.append({"url": "https://hangover.example.com/old", "title": "Old hangover story", "source": "Trend",
                      "date": now - timedelta(days=10)})
    return items


def valid_new(group):
    return [i for i in items_for(group) if i["url"].startswith("https://") and "DUI" not in i["title"]]


def make_session(monkeypatch, responder):
    calls = []

    class FakeSession:
        def get(self, url, params=None, timeout=None, headers=None):
            calls.append(dict(params))
            assert url == rss.BASE and timeout == 30
            return responder(params)

    monkeypatch.setattr("tabs.home.rss.requests.Session", FakeSession)
    return calls


def group_of(params):
    q = params["q"]
    for g in news.load_queries()["groups"]:
        if q == f"{g['query']} when:14d":
            return g["id"]
    raise AssertionError(q)


def good_responder(params):
    return FakeRes(body=rss_xml(items_for(group_of(params))))


# ───────── 검색어 · RSS 클라이언트 ─────────

def test_queries_are_plain_search_terms():
    cfg = news.load_queries()
    assert 3 <= len(cfg["groups"]) <= 5
    for g in cfg["groups"]:
        assert g.get("label") and news.build_query(cfg, g) == g["query"]
    assert {"DUI", "drunk driving", "crash"} <= set(cfg["exclude"])


def test_client_parses_rss_and_retries(monkeypatch):
    slept = []
    now = _now().replace(microsecond=0)
    seq = [FakeRes(429), FakeRes(body=rss_xml([{"url": "https://a.example.com/x", "title": "Beer sales fall - Reuters",
                                                "source": "Reuters", "date": now}]))]

    class S:
        def get(self, url, params=None, timeout=None, headers=None):
            assert params["hl"] == "en-US" and params["gl"] == "US" and params["ceid"] == "US:en"
            return seq.pop(0)

    c = rss.RssClient(interval=1, sleep=slept.append, session=S())
    arts = c.articles("beer sales")                  # 429 → 쉬고 한 번 더
    assert c.calls == 2 and c.rate_limited == 1 and slept
    assert arts == [{"url": "https://a.example.com/x", "title": "Beer sales fall", "domain": "Reuters", "date": now}]


def test_client_rejects_non_rss_without_retry():
    class S:
        n = 0

        def get(self, url, params=None, timeout=None, headers=None):
            S.n += 1
            return FakeRes(200, "<html>not rss")

    c = rss.RssClient(interval=0, sleep=lambda s: None, session=S())
    with pytest.raises(rss.RssError) as e:
        c.articles("x")
    assert "RSS" in str(e.value) and S.n == 1


def test_noise_and_title_cleanup():
    assert rss.is_noise("Driver arrested after crash", ["arrest"]) and rss.is_noise("DUI checkpoint", ["DUI"])
    assert not rss.is_noise("Non-alcoholic beer sales rise", ["DUI", "crash"])
    assert rss.clean_title("Heineken warns on GLP-1 - Reuters", "Reuters") == "Heineken warns on GLP-1"


def test_surge_signal():
    now = datetime(2026, 10, 22, 12)
    dates = [now - timedelta(days=1)] * 6 + [now - timedelta(days=10)] * 2
    s = rss.surge(dates, now)
    assert s["surge"] is True and s["recent"] == 6 and s["previous"] == 2 and s["changePct"] == 200.0
    few = rss.surge([now - timedelta(days=1)] * 3, now)            # 5건 미만이면 급증 아님
    assert few["surge"] is False and few["changePct"] is None
    flat = rss.surge([now - timedelta(days=1)] * 5 + [now - timedelta(days=9)] * 5, now)
    assert flat["surge"] is False and flat["changePct"] == 0.0
    assert rss.surge([], now) is None


# ───────── 수집 ─────────

def test_requires_login(client):
    assert client.get("/api/home/news").status_code == 401
    assert client.get("/api/home/todos").status_code == 401
    assert client.post("/api/home/todos", json={"title": "x"}).status_code == 401
    assert client.post("/api/home/news/collect").status_code == 401


def test_news_before_first_collection(auth_client):
    j = auth_client.get("/api/home/news").get_json()
    assert j["status"] == "never" and j["articles"] == [] and j["ai"] is None and j["aiReady"] is False
    assert len(j["groups"]) >= 3 and "판매량" in j["limitNote"]


def test_collect_stores_dedupes_and_signals(fast, auth_client, monkeypatch):
    calls = make_session(monkeypatch, good_responder)
    groups = [g["id"] for g in news.load_queries()["groups"]]
    expected = len({i["url"] for g in groups for i in valid_new(g)})
    with fast.app_context():
        run = news.collect(trigger="manual", user_name="테스터")
        assert run.status == "ok" and run.ai_status == "no_key"
        assert len(calls) == len(groups)                       # 검색어마다 RSS 1번
        assert HomeNewsArticle.query.count() == expected        # 같은 기사 한 번만, 노이즈·javascript: 주소는 버림
        shared = HomeNewsArticle.query.filter_by(url="https://www.example-news.com/shared-story").one()
        assert len(shared.groups.split(",")) == len(groups) and shared.domain == "Example News"
        assert shared.title == "Non-alcoholic drinks surge before Halloween"   # " - 매체명" 뗌
        assert "&amp;" not in HomeNewsArticle.query.filter(HomeNewsArticle.url.like("%story-0")).first().title
        assert HomeNewsArticle.query.filter(HomeNewsArticle.title.like("%DUI%")).count() == 0
        again = news.collect(trigger="manual", user_name="테스터")
        assert sum(c["new"] for c in json.loads(again.counts).values()) == 0
    j = auth_client.get("/api/home/news").get_json()
    assert j["status"] == "ok" and j["running"] is False and j["ai"] is None
    assert 0 < len(j["articles"]) <= 8 and all(a["url"].startswith("https://") for a in j["articles"])
    assert j["signals"][0]["group"] == "hangover" and j["signals"][0]["surge"] is True
    assert not any(s["surge"] for s in j["signals"][1:])
    logs = auth_client.get("/api/worklog?part=home&kind=수집").get_json()["items"]
    assert logs and logs[0]["status"] == "완료" and logs[0]["user"] == "테스터"


def test_failure_keeps_last_results(fast, auth_client, monkeypatch):
    make_session(monkeypatch, good_responder)
    with fast.app_context():
        news.collect(trigger="manual")
    calls = make_session(monkeypatch, lambda p: FakeRes(200, "<html>blocked"))
    with fast.app_context():
        run = news.collect(trigger="daily")
        assert run.status == "failed" and run.ai_status == "skipped"
        errs = json.loads(run.errors)
        assert any("RSS" in e for e in errs)
        assert len(calls) == news.MAX_FAILS_IN_ROW and any("건너뜀" in e for e in errs)  # 연달아 실패하면 더 부르지 않음
    j = auth_client.get("/api/home/news").get_json()
    assert j["status"] == "failed" and j["lastSuccessAt"] and j["articles"]  # 마지막 결과 유지
    assert j["signals"]
    logs = auth_client.get("/api/worklog?part=home").get_json()["items"]
    assert logs[0]["status"] == "실패"


def test_partial_failure(fast, auth_client, monkeypatch):
    def responder(p):
        if group_of(p) == "nonalc":
            return FakeRes(503)
        return good_responder(p)

    make_session(monkeypatch, responder)
    with fast.app_context():
        run = news.collect()
        assert run.status == "partial"
    assert auth_client.get("/api/home/news").get_json()["status"] == "partial"


def test_ai_filter_and_korean_items(fast, auth_client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    make_session(monkeypatch, good_responder)
    seen = {}

    def fake_openai_json(system, user, **kw):
        ids = [a["id"] for a in user["articles"]]
        hang = next(a["id"] for a in user["articles"] if a["title"].startswith("Hangover trend"))
        seen.update(system=system, user=user, kw=kw)
        return {"relevant_ids": ids[:3] + [99999], "headline": "핼러윈 앞두고 무알코올 보도가 늘었습니다.",
                "articles": [{"id": hang, "title_ko": "숙취 관련 보도 증가", "summary_ko": "숙취 관련 기사가 늘었습니다.", "topic": "소비 트렌드"},
                             {"id": hang, "title_ko": "중복", "summary_ko": "x", "topic": "업계 일반"},
                             {"id": 12345, "title_ko": "없는 기사", "summary_ko": "x", "topic": "판매 동향"}]}

    monkeypatch.setattr("tabs.home.news.openai_json", fake_openai_json)
    with fast.app_context():
        run = news.collect()
        assert run.ai_status == "ok"
        assert HomeNewsArticle.query.filter(HomeNewsArticle.relevant.is_(True)).count() == 4
    assert "본문" in seen["system"] and seen["kw"]["schema"]["additionalProperties"] is False
    assert seen["kw"]["part"] == "home" and seen["user"]["signals"] and seen["user"]["articles"][0]["source"]
    j = auth_client.get("/api/home/news").get_json()
    assert j["aiReady"] is True and j["ai"]["headline"].startswith("핼러윈")
    assert len(j["ai"]["items"]) == 1  # 겹친 기사 · 없는 기사는 버림
    it = j["ai"]["items"][0]
    assert it["titleKo"] == "숙취 관련 보도 증가" and it["topic"] == "소비 트렌드" and it["surge"] is True
    assert it["url"].startswith("https://") and it["title"].startswith("Hangover trend") and it["domain"] == "Trend"
    assert all(a["relevant"] for a in j["articles"])
    with fast.app_context():
        b = news.brief()
    assert b["trends"][0]["title"] == "숙취 관련 보도 증가" and any(s["surge"] for s in b["signals"])


def test_ai_error_keeps_articles(fast, auth_client, monkeypatch):
    from server.core.ai import AIError
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    make_session(monkeypatch, good_responder)

    def boom(*a, **k):
        raise AIError("AI 서버 오류 (500). 잠시 뒤 다시 시도하세요.")

    monkeypatch.setattr("tabs.home.news.openai_json", boom)
    with fast.app_context():
        run = news.collect()
        assert run.status == "ok" and run.ai_status == "error"
    j = auth_client.get("/api/home/news").get_json()
    assert j["aiStatus"] == "error" and "AI 서버 오류" in j["aiError"] and j["articles"]


def test_collect_endpoint_runs_in_background(fast, auth_client, monkeypatch):
    make_session(monkeypatch, good_responder)
    res = auth_client.post("/api/home/news/collect")
    assert res.status_code == 202 and res.get_json()["started"] is True
    for t in threading.enumerate():
        if t.name == "job-home-news":
            t.join(20)
    s = auth_client.get("/api/home/news/status").get_json()
    assert s["running"] is False and s["lastRun"]["status"] == "ok" and s["lastRun"]["trigger"] == "manual"
    # 수집 중이면 409
    with fast.app_context():
        news.start_run("manual", "다른 사람")
    assert auth_client.post("/api/home/news/collect").status_code == 409
    assert auth_client.get("/api/home/news").get_json()["status"] == "running"


def test_busy_collection_is_skipped_without_record(fast, auth_client, monkeypatch):
    from server import jobs
    make_session(monkeypatch, good_responder)
    with fast.app_context():
        pre = news.start_run("manual", "테스터")
        with jobs.file_lock("home-news-collect"):
            assert news.collect(trigger="daily") is None          # 다른 수집 중 → 건너뜀
            assert news.collect(run_id=pre.id) is None
        assert HomeNewsRun.query.count() == 0                       # 실패 기록을 남기지 않음


def test_server_error_marks_run_failed(fast, auth_client, monkeypatch):
    make_session(monkeypatch, good_responder)
    monkeypatch.setattr("tabs.home.news.store_articles", lambda *a: 1 / 0)
    with fast.app_context():
        run = news.collect(trigger="manual", user_name="테스터")
        assert run.status == "failed" and "서버 오류" in run.errors
    assert auth_client.get("/api/home/news").get_json()["status"] == "failed"


def test_stale_running_run_counts_as_failed(app, auth_client):
    with app.app_context():
        run = news.start_run("manual", "x")
        run.started_at = run.started_at - timedelta(hours=2)
        db.session.commit()
    j = auth_client.get("/api/home/news").get_json()
    assert j["status"] == "failed" and j["running"] is False


# ───────── To-Do ─────────

CTX = {"cs": {"open": 5, "urgent": 1, "overdue": 2, "owner_required": 0}, "compliance": {"pending": 2},
       "performance": {"start": "2026-10-15", "end": "2026-10-21", "revenue": 26632200, "spend": 7295000,
                       "roas": 365.07, "conversions": 875, "change": {"revenue": 2.6, "roas": 3.18}, "sample": True},
       "evil": {"x": "<script>"}}


def test_rule_todos_without_key(auth_client, today):
    j = auth_client.get("/api/home/todos").get_json()
    assert j["week"] == {"start": "2026-10-19", "end": "2026-10-25"} and j["items"] == [] and j["generated"] is False
    j = auth_client.post("/api/home/todos/generate", json={"auto": True, "context": CTX}).get_json()
    assert j["skipped"] is False and j["origin"] == "rule" and j["generated"] is True
    titles = [i["title"] for i in j["items"]]
    by = {i["title"]: i for i in j["items"]}
    assert "Halloween 캠페인 소재·카피 준비" in titles
    assert "D-8" in by["Halloween 캠페인 소재·카피 준비"]["reason"]          # 근거
    assert any("Thanksgiving Eve 준비 일정 잡기" == t for t in titles)       # 준비 시작이 2주 안
    assert by["미처리 CS 문의 5건 답변"]["source"] == "cs" and "긴급 1" in by["미처리 CS 문의 5건 답변"]["reason"]
    assert "검토 대기 카피 2건 확인" in titles and "실제 성과 CSV 올리기" in titles
    assert all(i["origin"] == "rule" and i["ai"] is False and i["reason"] for i in j["items"])
    assert j["open"] == len(j["items"])
    # 같은 주 자동 생성은 한 번만
    again = auth_client.post("/api/home/todos/generate", json={"auto": True, "context": {}}).get_json()
    assert again["skipped"] is True and [i["id"] for i in again["items"]] == [i["id"] for i in j["items"]]


def test_regenerate_keeps_manual_and_done(auth_client, today):
    j = auth_client.post("/api/home/todos/generate", json={"auto": True, "context": CTX}).get_json()
    first = j["items"][0]
    assert auth_client.patch(f"/api/home/todos/{first['id']}", json={"done": True}).get_json()["done"] is True
    mine = auth_client.post("/api/home/todos", json={"title": "파트너 미팅 자료 준비", "reason": "목요일 미팅"})
    assert mine.status_code == 201 and mine.get_json()["origin"] == "manual"
    j2 = auth_client.post("/api/home/todos/generate", json={"auto": False, "context": {}}).get_json()
    titles = [i["title"] for i in j2["items"]]
    assert "파트너 미팅 자료 준비" in titles
    assert titles.count(first["title"]) == 1                     # 완료 항목은 남고 중복으로 다시 생기지 않음
    assert "미처리 CS 문의 5건 답변" not in titles                # 현황이 없으니 빠짐
    done = [i for i in j2["items"] if i["done"]]
    assert done and done[0]["id"] == first["id"] and done[0]["doneBy"] == "테스터"
    assert j2["items"][-1]["done"] is True                       # 완료 항목은 아래로


def test_todo_crud_and_validation(auth_client, today):
    assert auth_client.post("/api/home/todos", json={"title": "  "}).status_code == 400
    assert auth_client.post("/api/home/todos", data="x", content_type="text/plain").status_code == 415
    t = auth_client.post("/api/home/todos", json={"title": "<b>굵게</b> 할 일", "source": "nope"}).get_json()
    assert t["source"] == "home" and t["reason"] == "직접 추가" and t["weekStart"] == "2026-10-19"
    assert auth_client.patch(f"/api/home/todos/{t['id']}", json={"title": ""}).status_code == 400
    u = auth_client.patch(f"/api/home/todos/{t['id']}", json={"title": "고친 할 일", "reason": "근거", "done": True}).get_json()
    assert u["title"] == "고친 할 일" and u["done"] is True and u["doneAt"]
    u = auth_client.patch(f"/api/home/todos/{t['id']}", json={"done": False}).get_json()
    assert u["done"] is False and u["doneAt"] is None and u["doneBy"] == ""
    assert auth_client.delete(f"/api/home/todos/{t['id']}").get_json()["ok"] is True
    assert auth_client.delete(f"/api/home/todos/{t['id']}").status_code == 404
    assert auth_client.patch("/api/home/todos/999", json={"done": True}).status_code == 404
    assert auth_client.get("/api/home/todos?week=bad").status_code == 400
    assert auth_client.get("/api/home/todos?week=2026-10-21").get_json()["week"]["start"] == "2026-10-19"


def test_ai_todos(auth_client, today, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    seen = {}

    def fake(system, user, **kw):
        seen.update(user=user, kw=kw)
        return {"items": [{"title": "핼러윈 릴스 2편 게시", "reason": "Halloween D-8", "source": "content"},
                          {"title": "이상한 출처", "reason": "x", "source": "hacker"},
                          {"title": "", "reason": "빈 제목", "source": "home"}]}

    monkeypatch.setattr("tabs.home.todos.openai_json", fake)
    j = auth_client.post("/api/home/todos/generate", json={"auto": True, "context": CTX}).get_json()
    assert j["origin"] == "ai" and [i["title"] for i in j["items"]] == ["핼러윈 릴스 2편 게시", "이상한 출처"]
    assert j["items"][1]["source"] == "home" and all(i["ai"] for i in j["items"])
    u = seen["user"]
    assert u["week"] == {"start": "2026-10-19", "end": "2026-10-25"}
    assert any(s["name"] == "Halloween" and s["inLead"] for s in u["seasons"])
    assert u["parts"]["cs"]["open"] == 5 and "evil" not in u["parts"]
    assert seen["kw"]["schema"]["properties"]["items"]["items"]["properties"]["source"]["enum"]


def test_ai_todo_failure_falls_back_to_rules(auth_client, today, monkeypatch):
    from server.core.ai import AIError
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")

    def boom(*a, **k):
        raise AIError("요청이 많거나 사용 한도를 넘었습니다.", 429)

    monkeypatch.setattr("tabs.home.todos.openai_json", boom)
    j = auth_client.post("/api/home/todos/generate", json={"auto": False, "context": CTX}).get_json()
    assert j["origin"] == "rule" and "규칙으로" in j["warning"] and j["items"]


def test_daily_job_collects_then_generates(fast, monkeypatch, today):
    make_session(monkeypatch, good_responder)
    with fast.app_context():
        routes.daily_briefing()
        assert HomeNewsRun.query.one().trigger == "daily"
        payload = todos.week_payload()
        assert payload["generated"] is True and payload["items"]
        # 급증 시그널이 규칙 To-Do 근거로 들어감
        assert any(i["source"] == "home" and "보도량" in i["reason"] for i in payload["items"])


def test_home_page_loads_part_files(auth_client):
    html = auth_client.get("/dashboard").get_data(as_text=True)
    assert "/parts/home/home.js" in html and "/parts/home/home.css" in html
    assert html.index("/parts/performance/metrics.js") < html.index("/parts/performance/performance.js")
    for f in ("home/home.js", "home/home.css", "performance/metrics.js", "performance/performance.js", "performance/performance.css"):
        assert auth_client.get(f"/parts/{f}").status_code == 200, f
