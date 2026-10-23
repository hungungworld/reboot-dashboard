"""규제 모니터링 수집 → monitor-data.js 저장.

HTML은 이 파일을 <script src>로 읽기만 합니다 (키·개인정보 없음). 출처별로 실패해도 나머지는 저장합니다.
Flask 통합: 저장 위치는 DATA_DIR/parts_override/compliance/monitor-data.js (Render 영구 디스크).
/parts/compliance/monitor-data.js 요청은 이 파일이 있으면 이것을, 없으면 저장소의 기본 파일을 줍니다.

  python -m server.compliance.refresh          수집 후 저장
  python -m server.compliance.refresh --dry    저장하지 않고 개수만 출력

출처
- openFDA 식품 리콜 (food/enforcement): 젤리·곤약·숙취 제품. 키 없이 먼저 부르고 실패하면 OPENFDA_API_KEY로 다시
- Regulations.gov: FDA·FTC 규칙·규칙안 (FDA는 식품·표시·광고 관련 제목만)
- CourtListener: 숙취 제품·건강식품 허위광고 판결 (관련성 낮은 결과가 섞일 수 있음 → 참고용)
FDA 경고장 크롤링은 README 부록 B 4단계에서 옮길 예정이라 아직 없습니다.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import current_app

from ..envkeys import get as env


def out_path():
    return Path(current_app.config["DATA_DIR"]) / "parts_override" / "compliance" / "monitor-data.js"


UA = "REBOOT-compliance-monitor/0.1 (local research)"
FDA_FOOD_WORDS = re.compile(
    r"food|dietary|label|nutrition|beverage|sugar|sodium|allergen|ingredient|additive|claim|import|traceab|gras|infant formula",
    re.I,
)

HEADER = """/* 규제 모니터링 결과 — server/compliance/refresh.py가 덮어쓰는 파일입니다 (사람이 고치지 않음).
   HTML은 <script src>로 읽기만 합니다. 키·개인정보는 넣지 않습니다.
   형식: window.REBOOT_MONITOR = { generatedAt, sources: [{ id, label, items: [{ id, date, title, firm, url, summary, quotes? }] }] }
   항목의 id는 바뀌지 않아야 합니다 (🆕·🔄 표시 기준). */
"""


def _get(url, headers=None, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _lookback():
    try:
        days = int(env("REFRESH_LOOKBACK_DAYS", "365"))
    except ValueError:
        days = 365
    return date.today() - timedelta(days=max(1, days))


def _iso(d8):
    # openFDA 날짜 20260513 → 2026-05-13
    return f"{d8[:4]}-{d8[4:6]}-{d8[6:8]}" if re.fullmatch(r"\d{8}", d8 or "") else (d8 or "")


def openfda_recalls():
    since = _lookback().strftime("%Y%m%d")
    search = f"product_description:(jelly OR konjac OR hangover OR gummy) AND report_date:[{since} TO {date.today():%Y%m%d}]"
    base = "https://api.fda.gov/food/enforcement.json?" + urllib.parse.urlencode({"search": search, "sort": "report_date:desc", "limit": 30})
    try:
        data = _get(base)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []  # openFDA는 결과 0건을 404로 돌려줌
        key = env("OPENFDA_API_KEY")
        if not key:
            raise
        data = _get(base + "&api_key=" + urllib.parse.quote(key))
    items = []
    for x in data.get("results", []):
        rid = x.get("recall_number") or x.get("event_id")
        if not rid:
            continue
        items.append({
            "id": rid,
            "date": _iso(x.get("report_date", "")),
            "title": (x.get("product_description") or "")[:200],
            "firm": x.get("recalling_firm", ""),
            "url": "https://www.accessdata.fda.gov/scripts/ires/index.cfm",
            "summary": f'{x.get("classification", "")} · {x.get("status", "")} · {x.get("reason_for_recall", "")}'[:400],
        })
    return items


def regulations_gov():
    key = env("REGULATIONS_GOV_API_KEY")
    if not key:
        raise RuntimeError("REGULATIONS_GOV_API_KEY 없음")
    q = urllib.parse.urlencode({
        "filter[agencyId]": "FDA,FTC",
        "filter[documentType]": "Rule,Proposed Rule",
        "filter[postedDate][ge]": _lookback().isoformat(),
        "sort": "-postedDate",
        "page[size]": 100,
    })
    data = _get("https://api.regulations.gov/v4/documents?" + q, {"X-Api-Key": key})
    items = []
    for x in data.get("data", []):
        a = x.get("attributes", {})
        title = a.get("title") or ""
        agency = a.get("agencyId", "")
        if agency == "FDA" and not FDA_FOOD_WORDS.search(title):
            continue  # 의료기기·동물약 등은 제외
        items.append({
            "id": x.get("id"),
            "date": (a.get("postedDate") or "")[:10],
            "title": title[:240],
            "firm": f'{agency} · {a.get("documentType", "")}',
            "url": f'https://www.regulations.gov/document/{x.get("id")}',
            "summary": ("의견 접수 마감 " + a["commentEndDate"][:10]) if a.get("commentEndDate") else "",
        })
    return items[:30]


def courtlistener():
    token = env("COURTLISTENER_TOKEN")
    if not token:
        raise RuntimeError("COURTLISTENER_TOKEN 없음")
    queries = [
        ('"hangover" AND ("false advertising" OR "Lanham Act" OR misbranded OR "unfair competition")', None),
        ('("dietary supplement" OR "functional beverage") AND ("false advertising" OR misbranded)', _lookback().strftime("%m/%d/%Y")),
    ]
    seen, items = set(), []
    for q, filed_after in queries:
        params = {"q": q, "type": "o", "order_by": "dateFiled desc"}
        if filed_after:
            params["filed_after"] = filed_after
        data = _get("https://www.courtlistener.com/api/rest/v4/search/?" + urllib.parse.urlencode(params),
                    {"Authorization": "Token " + token}, timeout=60)
        for x in data.get("results", [])[:15]:
            cid = str(x.get("cluster_id") or "")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            items.append({
                "id": cid,
                "date": x.get("dateFiled") or "",
                "title": (x.get("caseName") or "")[:200],
                "firm": x.get("court_citation_string") or x.get("court") or "",
                "url": "https://www.courtlistener.com" + (x.get("absolute_url") or ""),
                "summary": "판결문 검색 결과 · 관련성은 사람이 확인",
            })
        time.sleep(1)
    return items


SOURCES = [
    ("openfda-food-recalls", "openFDA 식품 리콜 (젤리·곤약·숙취)", openfda_recalls),
    ("regulations-gov", "Regulations.gov FDA·FTC 규칙·규칙안", regulations_gov),
    ("courtlistener", "CourtListener 허위광고 판결 (참고)", courtlistener),
]


def collect():
    sources, errors = [], []
    for sid, label, fn in SOURCES:
        try:
            items = fn()
            sources.append({"id": sid, "label": label, "items": items})
        except Exception as e:  # 한 출처가 실패해도 나머지는 저장
            msg = f"{type(e).__name__}: {getattr(e, 'code', '') or str(e)[:120]}"
            errors.append({"id": sid, "label": label, "error": msg})
            sources.append({"id": sid, "label": label + " · 수집 실패", "items": []})
    # 제목·요약 한글 (참고용). 실패해도 영어 원문은 그대로 저장
    try:
        from . import ko_summary
        if ko_summary.available():
            ko_summary.enrich_sources(sources)
    except Exception as e:
        errors.append({"id": "ko", "label": "한글 요약", "error": f"{type(e).__name__}: {str(e)[:120]}"})
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": sources,
        "errors": errors,
    }


def write(data):
    body = json.dumps(data, ensure_ascii=False, indent=1)
    js = HEADER + "(function (global) {\n  'use strict';\n  global.REBOOT_MONITOR = " + body + ";\n})(typeof window !== 'undefined' ? window : globalThis);\n"
    out = out_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".js.tmp")
    tmp.write_text(js, encoding="utf-8")
    tmp.replace(out)


if __name__ == "__main__":
    from server import create_app
    with create_app().app_context():
        data = collect()
        for s in data["sources"]:
            print(f'{s["label"]}: {len(s["items"])}개')
        for e in data["errors"]:
            print(f'  실패 {e["label"]}: {e["error"]}')
        if "--dry" not in sys.argv:
            write(data)
            print("저장:", out_path())
