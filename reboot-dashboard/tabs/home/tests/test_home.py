"""홈 · 데일리 브리핑 API — 뉴스 수집(GDELT는 가짜 응답) · AI 요약 · 이번 주 To-Do (인터넷 · 키 없이)."""
import json
import threading
from datetime import date, datetime, timedelta, timezone
from urllib.parse import unquote

import pytest

from server.extensions import db
from tabs.home import gdelt, news, routes, todos
from tabs.home.models import HomeNewsArticle, HomeNewsRun

TODAY = date(2026, 10, 23)  # 금요일 → 이번 주 월요일 10-19


@pytest.fixture()
def today(monkeypatch):
    monkeypatch.setattr("server.catalog.service._today", lambda: TODAY)
    return TODAY


@pytest.fixture()
def fast(app):
    app.config["HOME_GDELT_INTERVAL"] = 0  # 테스트에서는 5초 간격을 기다리지 않음
    return app


def _gd(dt):
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class FakeRes:
    def __init__(self, status=200, text="", payload=None):
        self.status_code = status
        self.text = json.dumps(payload) if payload is not None else text


def articles_for(group):
    now = _now()
    shared = {"url": "https://www.example-news.com/shared-story", "title": "Non-alcoholic drinks surge before Halloween",
              "domain": "example-news.com", "seendate": _gd(now - timedelta(hours=3)), "language": "English", "sourcecountry": "United States"}
    own = [{"url": f"https://{group}.example.com/story-{i}", "title": f"{group} story {i} &amp; more",
            "domain": f"{group}.example.com", "seendate": _gd(now - timedelta(hours=10 + i)),
            "language": "English", "sourcecountry": "United States"} for i in range(2)]
    junk = {"url": "javascript:alert(1)", "title": "bad url", "domain": "x", "seendate": _gd(now)}
    return [shared] + own + [junk]


def timeline_for(group):
    now = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    pts = []
    for d in range(14):
        day = now - timedelta(days=13 - d)
        recent = d >= 7
        v = (0.30 if recent else 0.10) if group == "hangover" else 0.20
        pts.append({"date": _gd(day), "value": v})
    return {"timeline": [{"series": "Volume Intensity", "data": pts}]}


def make_session(monkeypatch, responder):
    calls = []

    class FakeSession:
        def get(self, url, params=None, timeout=None, headers=None):
            calls.append(dict(params))
            assert url == gdelt.BASE and timeout == 30
            return responder(params)

    monkeypatch.setattr("tabs.home.gdelt.requests.Session", FakeSession)
    return calls


def group_of(params):
    q = unquote(params["query"])
    for g in news.load_queries()["groups"]:
        if q.startswith(g["query"]):
            return g["id"]
    raise AssertionError(q)


def good_responder(params):
    g = group_of(params)
    if params["mode"] == "ArtList":
        return FakeRes(payload={"articles": articles_for(g)})
    return FakeRes(payload=timeline_for(g))


# ───────── 쿼리 템플릿 · GDELT 클라이언트 ─────────

def test_query_templates_follow_gdelt_rules():
    cfg = news.load_queries()
    assert 3 <= len(cfg["groups"]) <= 5
    for g in cfg["groups"]:
        q = news.build_query(cfg, g)
        assert "sourcecountry:US" in q and "sourcelang:english" in q
        assert '-"drunk driving"' in q
        if " OR " in g["query"]:
            assert g["query"].startswith("(") and g["query"].endswith(")")  # OR는 괄호 필수
        assert g.get("label")


def test_client_waits_between_requests_and_retries(monkeypatch):
    slept = []
    seq = [FakeRes(429, "Please limit requests to one every 5 seconds"), FakeRes(payload={"articles": []}),
           FakeRes(payload={"articles": [{"url": "https://a.example.com", "title": "x"}]})]

    class S:
        def get(self, url, params=None, timeout=None, headers=None):
            return seq.pop(0)

    c = gdelt.GdeltClient(interval=5, sleep=slept.append, session=S())
    assert c.articles("(a OR b)") == []          # 429 → 쉬고 한 번 더
    assert len(c.articles("(a OR b)")) == 1
    assert c.calls == 3 and c.rate_limited == 1
    assert c.interval == 10                        # 요청 제한을 받으면 간격을 늘림
    assert slept and all(s >= 4.5 for s in slept)  # 요청 사이 5초 이상 (재시도는 간격의 두 배)


def test_client_rejects_non_json_without_retry():
    class S:
        n = 0

        def get(self, url, params=None, timeout=None, headers=None):
            S.n += 1
            return FakeRes(200, "The specified phrase is too short.")

    c = gdelt.GdeltClient(interval=0, sleep=lambda s: None, session=S())
    with pytest.raises(gdelt.GdeltError) as e:
        c.articles("(ab OR cd)")
    assert "JSON" in str(e.value) and S.n == 1
    with pytest.raises(gdelt.GdeltError):
        gdelt.GdeltClient(interval=0, session=type("E", (), {"get": lambda *a, **k: FakeRes(200, "")})()).timeline("x")


def test_surge_signal():
    base = datetime(2026, 10, 22)
    pts = [(base - timedelta(days=13 - d), 0.3 if d >= 7 else 0.1) for d in range(14)]
    s = gdelt.surge(pts)
    assert s["surge"] is True and s["changePct"] == 200.0 and len(s["daily"]) == 14
    flat = gdelt.surge([(base - timedelta(days=d), 0.2) for d in range(14)])
    assert flat["surge"] is False and flat["changePct"] == 0.0
    assert gdelt.surge([]) is None


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
    with fast.app_context():
        run = news.collect(trigger="manual", user_name="테스터")
        assert run.status == "ok" and run.ai_status == "no_key"
        n_groups = len(news.load_queries()["groups"])
        assert len(calls) == n_groups * 2 and {c["mode"] for c in calls} == {"ArtList", "TimelineVol"}
        assert all(c["format"] == "json" and c["maxrecords"] == 75 for c in calls if c["mode"] == "ArtList")
        assert HomeNewsArticle.query.count() == 1 + 2 * n_groups  # 같은 URL은 한 번만, javascript: 주소는 버림
        shared = HomeNewsArticle.query.filter_by(url="https://www.example-news.com/shared-story").one()
        assert len(shared.groups.split(",")) == n_groups
        assert "&amp;" not in HomeNewsArticle.query.filter(HomeNewsArticle.url.like("%story-0")).first().title
        again = news.collect(trigger="manual", user_name="테스터")
        assert sum(c["new"] for c in json.loads(again.counts).values()) == 0
    j = auth_client.get("/api/home/news").get_json()
    assert j["status"] == "ok" and j["running"] is False and j["ai"] is None
    assert 0 < len(j["articles"]) <= 8 and all(a["url"].startswith("https://") for a in j["articles"])
    assert j["signals"][0]["group"] == "hangover" and j["signals"][0]["surge"] is True
    assert j["articleCount7d"] == 1 + 2 * len(j["groups"])
    logs = auth_client.get("/api/worklog?part=home&kind=수집").get_json()["items"]
    assert logs and logs[0]["status"] == "완료" and logs[0]["user"] == "테스터"


def test_failure_keeps_last_results(fast, auth_client, monkeypatch):
    make_session(monkeypatch, good_responder)
    with fast.app_context():
        news.collect(trigger="manual")
    calls = make_session(monkeypatch, lambda p: FakeRes(200, "The specified phrase is too short."))
    with fast.app_context():
        run = news.collect(trigger="daily")
        assert run.status == "failed" and run.ai_status == "skipped"
        errs = json.loads(run.errors)
        assert any("JSON" in e for e in errs)
        assert len(calls) == news.MAX_FAILS_IN_ROW and any("건너뜀" in e for e in errs)  # 연달아 실패하면 더 부르지 않음
    j = auth_client.get("/api/home/news").get_json()
    assert j["status"] == "failed" and j["lastSuccessAt"] and j["articles"]  # 마지막 결과 유지
    assert j["signals"]
    logs = auth_client.get("/api/worklog?part=home").get_json()["items"]
    assert logs[0]["status"] == "실패"


def test_partial_failure(fast, auth_client, monkeypatch):
    def responder(p):
        if group_of(p) == "policy":
            return FakeRes(503, "busy")
        return good_responder(p)

    make_session(monkeypatch, responder)
    with fast.app_context():
        run = news.collect()
        assert run.status == "partial"
    assert auth_client.get("/api/home/news").get_json()["status"] == "partial"


def test_ai_filter_and_summary(fast, auth_client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    make_session(monkeypatch, good_responder)
    seen = {}

    def fake_openai_json(system, user, **kw):
        ids = [a["id"] for a in user["articles"]]
        seen.update(system=system, user=user, kw=kw)
        return {"relevant_ids": ids[:3] + [99999], "headline": "핼러윈 앞두고 논알코올 보도 증가",
                "trends": [{"title": "논알코올 음료 보도 증가", "summary": "보도가 늘었습니다.", "group": "nonalc", "article_ids": [ids[0], 99999]},
                           {"title": "근거 없는 동향", "summary": "x", "group": "nope", "article_ids": [12345]}]}

    monkeypatch.setattr("tabs.home.news.openai_json", fake_openai_json)
    with fast.app_context():
        run = news.collect()
        assert run.ai_status == "ok"
        relevant = HomeNewsArticle.query.filter(HomeNewsArticle.relevant.is_(True)).count()
        assert relevant == 3
    assert "제목과 도메인" in seen["system"] and seen["kw"]["schema"]["additionalProperties"] is False
    assert seen["kw"]["part"] == "home" and seen["user"]["signals"]
    j = auth_client.get("/api/home/news").get_json()
    assert j["aiReady"] is True and j["ai"]["headline"].startswith("핼러윈")
    assert len(j["ai"]["trends"]) == 1  # 근거 기사가 없는 동향은 버림
    t = j["ai"]["trends"][0]
    assert t["groupLabel"] and len(t["articles"]) == 1 and t["articles"][0]["url"].startswith("https://")
    assert all(a["relevant"] for a in j["articles"])


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
