"""유튜브 크리에이터 추천 — YouTube API는 흉내만 냄 (인터넷·실제 키 없이 통과). 데이터는 모두 가짜."""
import io
from datetime import timedelta

import pytest

from server.extensions import db
from server.models import utcnow
from tabs.partners import youtube
from tabs.partners.models import PartnerYoutubeCreator

CH1 = "UC" + "a" * 22
CH2 = "UC" + "b" * 22
KIDS = "UC" + "k" * 22
FOREIGN = "UC" + "f" * 22
SMALL = "UC" + "s" * 22      # 구독자 1,000명 (이하라서 뺌)
HIDDEN = "UC" + "h" * 22     # 구독자 비공개 (뺌)
GB_CH = "UC" + "g" * 22      # 영국 → 영미권(EN)
EST_CH = "UC" + "e" * 22     # 국가 미표시 + 영어 → 미국 타겟 추정(EST)
NON_EN = "UC" + "x" * 22     # 국가 미표시 + 한국어 → 뺌
OVERRIDE = {
    GB_CH: {"title": "Test Pub Crawl UK", "country": "GB"},
    EST_CH: {"title": "Test Nightlife Diaries", "description": "Weekend bar crawls and cocktails", "country": ""},
    NON_EN: {"title": "테스트 파티 채널", "description": "주말 파티 브이로그 모음", "country": ""},
}


class FakeResp:
    def __init__(self, data, status=200):
        self.data, self.status_code = data, status

    def json(self):
        return self.data


def fake_youtube(calls):
    def get(url, params=None, timeout=None):
        path = url.rsplit("/", 1)[-1]
        calls.append(path)
        if path == "search":
            return FakeResp({"items": [{"id": {"channelId": CH1}}, {"id": {"channelId": CH2}}, {"id": {"channelId": KIDS}},
                                     {"id": {"channelId": FOREIGN}}, {"id": {"channelId": SMALL}},
                                     {"id": {"channelId": HIDDEN}}] + [{"id": {"channelId": c}} for c in OVERRIDE]})
        if path == "channels":
            items = []
            for cid in params["id"].split(","):
                if cid == KIDS:
                    items.append({"id": KIDS, "snippet": {"title": "Kids Channel", "country": "US"}, "status": {"madeForKids": True}})
                    continue
                if cid == FOREIGN:
                    items.append({"id": FOREIGN, "snippet": {"title": "Festival Vlogs Test", "country": "IN"},
                                  "statistics": {"subscriberCount": "999999"}, "status": {"madeForKids": False}})
                    continue
                snippet = {"title": "Test Party Creator" if cid == CH1 else "Test Whiskey Talk",
                           "customUrl": "@testparty" if cid == CH1 else "",
                           "description": "Party tips! For business: Test@Example.com" if cid == CH1 else "no contact here",
                           "country": "US",
                           "thumbnails": {"default": {"url": "https://yt3.ggpht.com/test-avatar-" + cid[-1]}}}
                snippet.update(OVERRIDE.get(cid, {}))
                items.append({
                    "id": cid,
                    "snippet": snippet,
                    "statistics": {"subscriberCount": {CH1: "120000", CH2: "5000"}.get(cid, "3000" if cid in OVERRIDE else "1000"),
                                   "videoCount": "50",
                                   "viewCount": "9000000", "hiddenSubscriberCount": cid == HIDDEN},
                    "contentDetails": {"relatedPlaylists": {"uploads": "UU" + cid[2:]}},
                    "status": {"madeForKids": False},
                })
            return FakeResp({"items": items})
        if path == "playlistItems":
            return FakeResp({"items": [{"contentDetails": {"videoId": f"v{i}"}} for i in range(3)]})
        if path == "videos":
            return FakeResp({"items": [{"statistics": {"viewCount": n}} for n in ("1000", "2000", "3000")]})
        raise AssertionError(path)
    return get


@pytest.fixture()
def yt(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key-not-real")
    calls = []
    monkeypatch.setattr(youtube.requests, "get", fake_youtube(calls))
    return calls


def test_youtube_requires_login(client):
    assert client.get("/api/partners/youtube").status_code == 401
    assert client.post("/api/partners/youtube/delete", json={"ids": [CH1]}).status_code == 401


def test_search_without_key_is_503(auth_client, monkeypatch):
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    assert auth_client.post("/api/partners/youtube/search", json={"keywords": ["party"]}).status_code == 503
    assert auth_client.get("/api/partners/youtube").get_json()["ready"] is False


def test_search_saves_public_info_and_filters_targets(auth_client, yt):
    out = auth_client.post("/api/partners/youtube/search", json={"keywords": ["house party", "whiskey"]}).get_json()
    assert (out["found"], out["added"]) == (4, 4)
    items = {c["id"]: c for c in auth_client.get("/api/partners/youtube").get_json()["items"]}
    # 아동용 · 인도 · 구독자 1,000명 · 비공개 · 국가 미표시+한국어는 빠지고, 미국 · 영국 · 미국 타겟 추정만 남음
    assert {k: v["target"] for k, v in items.items()} == {CH1: "US", CH2: "US", GB_CH: "EN", EST_CH: "EST"}
    a, b = items[CH1], items[CH2]
    assert a["email"] == "test@example.com" and a["emailAt"] and a["statsAt"]
    assert (a["subscribers"], a["avgViews"], a["url"]) == (120000, 2000, "https://www.youtube.com/@testparty")
    assert a["keywords"] == ["house party", "whiskey"] and a["thumb"] == "https://yt3.ggpht.com/test-avatar-a"
    assert b["email"] == "" and b["emailAt"] is None and b["subscribers"] == 5000
    assert b["url"] == f"https://www.youtube.com/channel/{CH2}"


def test_stale_rows_refresh_and_expired_rows_are_deleted(auth_client, app, yt):
    auth_client.post("/api/partners/youtube/search", json={"keywords": ["party"]})
    with app.app_context():
        db.session.get(PartnerYoutubeCreator, CH1).stats_at = utcnow() - timedelta(days=10)
        db.session.get(PartnerYoutubeCreator, CH2).stats_at = utcnow() - timedelta(days=40)
        db.session.commit()
    yt.clear()
    data = auth_client.get("/api/partners/youtube").get_json()
    assert data["refreshed"] == 2 and "channels" in yt        # 둘 다 다시 받아 기준일이 새로워짐
    assert {c["id"] for c in data["items"]} == {CH1, CH2, GB_CH, EST_CH}


def test_expired_rows_deleted_when_refresh_fails(auth_client, app, monkeypatch):
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    with app.app_context():
        def add(cid, title, days, country="US", subs=5000, **kw):
            db.session.add(PartnerYoutubeCreator(id=cid, title=title, country=country, subscribers=subs,
                                                 thumb="https://yt3.ggpht.com/t", stats_at=utcnow() - timedelta(days=days), **kw))
        add(CH1, "Old Test", 31, email="test@example.com")
        add(CH2, "Recent Test", 2)
        add(FOREIGN, "Saved Before Target Rule", 1, country="IN")
        add(SMALL, "Saved Before Subscriber Rule", 1, subs=800)
        db.session.commit()
    data = auth_client.get("/api/partners/youtube").get_json()
    assert data["removed"] == 3 and [c["id"] for c in data["items"]] == [CH2]   # 31일 지난 것 · 미국 아닌 것 · 구독자 1,000명 이하


def test_delete_export_import_roundtrip(auth_client, yt):
    auth_client.post("/api/partners/youtube/search", json={"keywords": ["party"]})
    res = auth_client.get("/api/partners/youtube/export.csv")
    assert res.status_code == 200 and "attachment" in res.headers["Content-Disposition"]
    csv_text = res.get_data(as_text=True)
    assert "channel_id" in csv_text and "test@example.com" in csv_text

    ids = [CH1, CH2, GB_CH, EST_CH]
    assert auth_client.post("/api/partners/youtube/delete", json={"ids": ids}).get_json()["deleted"] == 4
    assert auth_client.get("/api/partners/youtube?refresh=0").get_json()["items"] == []

    bad_rows = (f"UC{'z' * 22},Too Old Test,,US,5000,1,1,1,,,party,2020-01-01,\n"
                f"UC{'y' * 22},India Test,,IN,5000,1,1,1,,,party,2099-01-01,\n")
    data = {"file": (io.BytesIO((csv_text + bad_rows).encode("utf-8")), "creators.csv")}
    out = auth_client.post("/api/partners/youtube/import", data=data, content_type="multipart/form-data").get_json()
    assert (out["added"], out["skipped"]) == (4, 2)            # 30일 넘은 기준일 · 대상 아닌 나라는 건너뜀
    items = {c["id"]: c for c in auth_client.get("/api/partners/youtube?refresh=0").get_json()["items"]}
    assert items[CH1]["email"] == "test@example.com" and items[CH1]["subscribers"] == 120000
    assert (items[GB_CH]["target"], items[EST_CH]["target"]) == ("EN", "EST")


def test_ai_keyword_suggestions(auth_client, monkeypatch):
    assert auth_client.post("/api/partners/youtube/keywords", json={"current": []}).status_code == 503
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    seen = {}

    def fake(system, user, **kw):
        seen["user"] = user
        return {"keywords": [{"keyword": "rooftop bar vlog", "reason": "도시 나이트라이프"},
                             {"keyword": "Bar Crawl", "reason": "이미 있음"},
                             {"keyword": "kids party ideas", "reason": "막아야 함"}]}
    monkeypatch.setattr(youtube, "openai_json", fake)
    out = auth_client.post("/api/partners/youtube/keywords", json={"current": ["bar crawl"]}).get_json()
    assert [k["keyword"] for k in out["keywords"]] == ["rooftop bar vlog"]   # 중복 · 아이 관련은 뺌
    assert seen["user"]["current"] == ["bar crawl"]


def test_import_rejects_other_csv(auth_client):
    data = {"file": (io.BytesIO("name,email\nTest,test@example.com\n".encode()), "other.csv")}
    assert auth_client.post("/api/partners/youtube/import", data=data, content_type="multipart/form-data").status_code == 400
