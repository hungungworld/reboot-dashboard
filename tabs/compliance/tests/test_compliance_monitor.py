"""Firecrawl 수집 4곳 (NAD · FTC 보도자료 · Prop 65 60일 통지 · 올리브영 정책) — 인터넷·키 없이 확인.
페이지 모양은 2026-10-26 실제 Firecrawl 응답을 줄여 만든 가짜 (회사·제품 이름은 지어낸 것)."""
from datetime import datetime, timedelta, timezone

from tabs.compliance import refresh

NAD_MD = """# Decision Summaries

New York, NY – October 22, 2026 – The National Advertising Division recommended that Sample Drinks discontinue its “cures your hangover by morning” claim for Sample Recovery Shot.

McLean, VA – October 21, 2026 – The National Advertising Division recommended that Sample Cruises modify its “all-inclusive” advertising.

McLean, VA – October 20, 2026 – The Digital Advertising Accountability Program (DAAP) worked with Sample Retail Co. on interest-based advertising.
"""

FTC_MD = """# Press Releases

### [FTC Sues Sample Co. Over Fake Reviews and Deceptive Ads](https://www.ftc.gov/news-events/news/press-releases/2026/10/ftc-sues-sample-co-fake-reviews)

Date

October 22, 2026

The Federal Trade Commission sued Sample Co. for posting fake reviews...

### [FTC Sues to Block Sample Merger of Playground Makers](https://www.ftc.gov/news-events/news/press-releases/2026/10/ftc-sues-block-sample-merger)

Date

October 19, 2026

Today, the Federal Trade Commission sued to block...

### [FTC Secures Settlement with Sample Dealership Group](https://www.ftc.gov/news-events/news/press-releases/2026/10/ftc-secures-settlement-sample-dealership)

Date

October 8, 2026

The FTC secured a settlement...
"""


def _prop65_block(no, date, source, chem):
    return f"""### [AG Number {no} (View Details)](https://oag.ca.gov/prop65/60-Day-Notice-{no})

Notice PDF:

Date Filed:

{date}

Noticing Party:

Sample Advocates, Inc.

Alleged Violators:

Sample Candies, Inc.

Chemical:

{chem}

Source:

{source}

Complaint (0)   Settlement (0)   Judgment (0)
"""


def _prop65_md():
    recent = (datetime.now() - timedelta(days=30)).strftime("%m/%d/%Y")
    old = (datetime.now() - timedelta(days=900)).strftime("%m/%d/%Y")
    return ("# 60-Day Notice Search Results\n\n" + _prop65_block("2026-01099", recent, "Gummy Candy", "Lead")
            + _prop65_block("2026-04466", recent, "Sample Delta 9 Gummy", "delta-9-tetrahydrocannabinol")
            + _prop65_block("2023-00001", old, "Old Jelly Cup", "Lead"))


OY_MD = """# O.Y MEMBERS Policy

Last Updated: August 24, 2026

You must have the capacity to enter into a legally binding contract, and your parent or legal guardian must review and agree to these Terms.

We may credit reward points to your account for eligible activities, including writing a review on the US Online Store, or celebrating your birthday.
"""


def _fake_pages(monkeypatch, calls=None):
    def fake(url):
        if calls is not None:
            calls.append(url)
        if "bbbprograms" in url:
            return NAD_MD
        if "press-releases" in url:
            return FTC_MD
        if "oag.ca.gov" in url:
            return _prop65_md()
        if "oliveyoung" in url:
            return OY_MD
        raise AssertionError(url)
    monkeypatch.setattr(refresh, "_firecrawl_md", fake)


def test_nad_keeps_ad_decisions_and_food_quotes(monkeypatch):
    _fake_pages(monkeypatch)
    items = refresh.nad_decisions()
    assert [i["date"] for i in items] == ["2026-10-22", "2026-10-21"]   # DAAP(개인정보) 결정은 뺌
    assert items[0]["quotes"] == ["cures your hangover by morning"]     # 음료 결정 → 사례집 후보
    assert "quotes" not in items[1]                                     # 크루즈 결정 문구는 후보로 안 올림
    assert items[0]["id"] == refresh.nad_decisions()[0]["id"]           # id는 다시 읽어도 같아야 함 (🆕 기준)


def test_ftc_press_only_ad_related_titles(monkeypatch):
    _fake_pages(monkeypatch)
    items = refresh.ftc_press()
    assert [i["id"] for i in items] == ["ftc-sues-sample-co-fake-reviews"]   # 합병 · 'Secures'(cure)는 빠짐
    assert items[0]["date"] == "2026-10-22" and items[0]["url"].startswith("https://www.ftc.gov/")


def test_prop65_skips_cannabis_and_old_notices(app, monkeypatch):
    calls = []
    _fake_pages(monkeypatch, calls)
    with app.app_context():
        items = refresh.prop65_notices()
    assert len(calls) == len(refresh.PROP65_TERMS)
    assert [i["id"] for i in items] == ["2026-01099"]   # 같은 통지는 한 줄 · 대마 · 1년 넘은 통지 제외
    assert items[0]["title"] == "Gummy Candy · Lead" and "Sample Candies" in items[0]["firm"]


def test_oliveyoung_policy_date_is_id(monkeypatch):
    _fake_pages(monkeypatch)
    [item] = refresh.oliveyoung_policy()
    assert item["id"] == "oy-members-2026-08-24" and item["date"] == "2026-08-24"
    assert "writing a review" in item["summary"] and "legal guardian" not in item["summary"]
    monkeypatch.setattr(refresh, "_firecrawl_md", lambda url: "# 다른 모양 페이지")
    try:
        refresh.oliveyoung_policy()
        raise AssertionError("갱신일이 없으면 실패로 남겨야 함")
    except RuntimeError as e:
        assert "Last Updated" in str(e)


def test_no_firecrawl_key_fails_only_that_source(app, monkeypatch):
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    with app.app_context():
        monkeypatch.setattr(refresh, "SOURCES", [("nad-decisions", "NAD", refresh.nad_decisions),
                                                 ("ok", "다른 출처", lambda: [{"id": "a", "date": "", "title": "t"}])])
        data = refresh.collect()
    assert [e["id"] for e in data["errors"]] == ["nad-decisions"] and "FIRECRAWL_API_KEY" in data["errors"][0]["error"]
    assert next(s for s in data["sources"] if s["id"] == "ok")["items"]


def test_weekly_source_reuses_recent_result(app, monkeypatch):
    calls = []

    def fn():
        calls.append(1)
        return [{"id": f"x{len(calls)}", "date": "", "title": "t"}]
    with app.app_context():
        monkeypatch.setattr(refresh, "SOURCES", [("prop65-notices", "Prop 65", fn, "weekly")])
        refresh.write(refresh.collect())
        second = refresh.collect()                 # 7일 안 → 다시 부르지 않음
        assert len(calls) == 1 and second["sources"][0]["items"][0]["id"] == "x1"
        old = (datetime.now(timezone.utc) - timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%SZ")
        second["sources"][0]["updatedAt"] = old
        refresh.write(second)
        third = refresh.collect()                  # 7일 지남 → 새로 부름
        assert len(calls) == 2 and third["sources"][0]["items"][0]["id"] == "x2"


def test_monitor_sources_listed_in_data_js():
    """refresh.py SOURCES의 id는 모두 data.js monitorSources에 있어야 함 (화면에서 기관·설명이 '기타'로 빠지지 않게)."""
    import re
    from pathlib import Path
    js = (Path(refresh.__file__).parent / "static" / "data.js").read_text(encoding="utf-8")
    block = js[js.index("monitorSources: ["):js.index("monitorTagSkip")]
    ids = set(re.findall(r"\{ id: '([^']+)'", block))
    assert {s[0] for s in refresh.SOURCES} <= ids
