"""규제 모니터링 수집 → monitor-data.js 저장.

HTML은 이 파일을 <script src>로 읽기만 합니다 (키·개인정보 없음). 출처별로 실패해도 나머지는 저장합니다.
Flask 통합: 저장 위치는 DATA_DIR/parts_override/compliance/monitor-data.js (Render 영구 디스크).
/parts/compliance/monitor-data.js 요청은 이 파일이 있으면 이것을, 없으면 저장소의 기본 파일을 줍니다.

  python -m tabs.compliance.refresh          수집 후 저장
  python -m tabs.compliance.refresh --dry    저장하지 않고 개수만 출력

출처
- openFDA 식품 리콜 (food/enforcement): 젤리(구미)·숙취 · 한국산 음료 · 헛개. 키 없이 먼저 부르고 실패하면 OPENFDA_API_KEY로 다시
- Regulations.gov: FDA·FTC 규칙·규칙안 (FDA는 식품·표시·광고 관련 제목만)
- CourtListener: 숙취 제품·건강식품 허위광고 판결 (관련성 낮은 결과가 섞일 수 있음 → 참고용)
- FDA 수입 거부: Data Dashboard API (FDA_DASHBOARD_USER · FDA_DASHBOARD_KEY) · 한국산 식품만
- CBP CROSS: 품목분류 결정 검색 API (키 없음) · 젤리·2106.90 · 음료 2202.10·2202.99 · 헛개
- Federal Register: FTC 전체 + FDA 식품 관련 공고 (키 없음). FTC 보도자료 RSS는 봇 차단이라 대신 씀
- Firecrawl (FIRECRAWL_API_KEY · 2026-10-26): 서버가 직접 못 읽던 곳을 Firecrawl이 화면을 그려 읽음 (주소 1개 = 약 1 크레딧)
  NAD 결정 요약(매일 · 식품·건강 결정의 따옴표 문구는 사례집 후보) · FTC 보도자료(매일 · 광고·후기·건강 관련만) ·
  Prop 65 60일 통지(주 1회 · gummy·jelly·candy) · 올리브영 US 회원 정책(주 1회 · 갱신일이 바뀌면 '새' 표시)
- 자동으로 못 읽는 곳: Prop 65 물질 목록(OEHHA) → 화면의 바로가기 버튼
- FDA 경고장: warning_letters.py (Data Dashboard API · fda.gov XLSX · 사람이 올린 XLSX·본문). fda.gov는 자동 요청을
  봇 차단으로 막을 수 있어, 막히면 이유를 errors에 남기고 올려 둔 경고장은 그대로 보여 줌
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

from server.envkeys import get as env


def out_path():
    return Path(current_app.config["DATA_DIR"]) / "parts_override" / "compliance" / "monitor-data.js"


UA = "REBOOT-compliance-monitor/0.1 (local research)"
FDA_FOOD_WORDS = re.compile(
    r"food|dietary|label|nutrition|beverage|sugar|sodium|allergen|ingredient|additive|claim|import|traceab|gras|infant formula",
    re.I,
)

HEADER = """/* 규제 모니터링 결과 — tabs/compliance/refresh.py가 덮어쓰는 파일입니다 (사람이 고치지 않음).
   HTML은 <script src>로 읽기만 합니다. 키·개인정보는 넣지 않습니다.
   형식: window.REBOOT_MONITOR = { generatedAt, sources: [{ id, label, items: [{ id, date, title, firm, url, summary, quotes? }] }] }
   항목의 id는 바뀌지 않아야 합니다 ('새'·'갱신' 표시 기준). */
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


# 우리 제품군 전체 (2026-10-24): 젤리 · 곤약은 뺌 (2026-10-25 · 우리 젤리는 곤약이 아닌 구미형) · 음료(한국산으로 좁힘 — 음료만으로는 수백 건) · 숙취 연상 성분(헛개)
RECALL_SEARCHES = (
    "product_description:(jelly OR gummy OR gummies OR hangover)",
    "product_description:(drink OR beverage) AND product_description:(korea OR korean)",
    'product_description:(hovenia OR "raisin tree")',
)


def _recall_search(search):
    base = "https://api.fda.gov/food/enforcement.json?" + urllib.parse.urlencode({"search": search, "sort": "report_date:desc", "limit": 30})
    try:
        return _get(base).get("results", [])
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []  # openFDA는 결과 0건을 404로 돌려줌
        key = env("OPENFDA_API_KEY")
        if not key:
            raise
        return _get(base + "&api_key=" + urllib.parse.quote(key)).get("results", [])


def openfda_recalls():
    period = f"report_date:[{_lookback():%Y%m%d} TO {date.today():%Y%m%d}]"
    seen, items = set(), []
    for search in RECALL_SEARCHES:
        for x in _recall_search(f"{search} AND {period}"):
            rid = x.get("recall_number") or x.get("event_id")
            if not rid or rid in seen:
                continue
            seen.add(rid)
            items.append(_recall_item(rid, x))
    return sorted(items, key=lambda i: i["date"], reverse=True)[:40]


def _recall_item(rid, x):
    return {
        "id": rid,
        "date": _iso(x.get("report_date", "")),
        "title": (x.get("product_description") or "")[:200],
        "firm": x.get("recalling_firm", ""),
        "url": "https://www.accessdata.fda.gov/scripts/ires/index.cfm",
        "summary": f'{x.get("classification", "")} · {x.get("status", "")} · {x.get("reason_for_recall", "")}'[:400],
    }


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
        # 당 표시 관련 허위광고 판결 (2026-10-24 · Balance 제품의 'Zero Sugar' 표기 참고)
        ('("low sugar" OR "sugar free" OR "no sugar added") AND ("false advertising" OR misleading OR misbranded)', _lookback().strftime("%m/%d/%Y")),
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


CROSS_FOOD = re.compile(r"jelly|gumm|confection|candy|beverage|drink|food preparation|dietary supplement|hangover|hovenia|raisin tree", re.I)
# 젤리(2106.90 · 구미형) + 비탄산 음료 HS 후보(2202.10 · 2202.99 — 실제 코드는 관세사 확인) + 헛개 (2026-10-24 제품군 전체)
CROSS_TERMS = ("jelly", "gummy", "2106.90", "2202.10", "2202.99", "hovenia")
CROSS_HTS = re.compile(r"\b(1704|2106|2202|2009)\.")   # 설탕 과자 · 기타 조제 식료품 · 음료 · 주스


def cbp_rulings():
    """CBP CROSS 품목분류 결정 (공식 검색 API · 키 없음). 젤리·음료·헛개 관련 최신 결정."""
    seen, items = set(), []
    for term in CROSS_TERMS:
        q = urllib.parse.urlencode({"term": term, "collection": "ALL", "commodityGrouping": "ALL",
                                    "pageSize": 10, "page": 1, "sortBy": "DATE_DESC"})
        for x in _get("https://rulings.cbp.gov/api/search?" + q).get("rulings", []):
            no = str(x.get("rulingNumber") or "")
            # 전문 검색이라 'jelly roll 배터리' 같은 결과가 섞임 → 제목·HS 코드가 식품인 것만
            if not no or no in seen or not (CROSS_FOOD.search(x.get("subject") or "") or CROSS_HTS.search(x.get("tariffs") or "")):
                continue
            seen.add(no)
            items.append({
                "id": no,
                "date": (x.get("rulingDate") or "")[:10],
                "title": (x.get("subject") or "")[:240],
                "firm": f'{str(x.get("collection") or "").upper()} · {x.get("categories") or ""}',
                "url": f"https://rulings.cbp.gov/ruling/{urllib.parse.quote(no)}",
                "summary": ("HTS " + x["tariffs"])[:300] if x.get("tariffs") else "",
            })
        time.sleep(1)
    return sorted(items, key=lambda i: i["date"], reverse=True)[:30]


def federal_register():
    """Federal Register 공고 (키 없음): FTC 전체 + FDA 식품·표시·광고 관련 제목. FTC 보도자료 RSS는 봇 차단이라 대신 씀."""
    items = []
    for slug, label in (("federal-trade-commission", "FTC"), ("food-and-drug-administration", "FDA")):
        params = [("conditions[agencies][]", slug), ("conditions[publication_date][gte]", _lookback().isoformat()),
                  ("order", "newest"), ("per_page", "40")] + [("fields[]", f) for f in
                  ("document_number", "title", "type", "publication_date", "html_url", "abstract")]
        for x in _get("https://www.federalregister.gov/api/v1/documents.json?" + urllib.parse.urlencode(params)).get("results", []):
            title = x.get("title") or ""
            if label == "FDA" and not FDA_FOOD_WORDS.search(title):
                continue
            items.append({
                "id": x.get("document_number"),
                "date": x.get("publication_date") or "",
                "title": title[:240],
                "firm": f'{label} · {x.get("type") or ""}',
                "url": x.get("html_url") or "",
                "summary": (x.get("abstract") or "")[:400],
            })
    return sorted(items, key=lambda i: i["date"], reverse=True)[:30]


CHARGES_URL = "https://datadashboard.fda.gov/oii/download/ACT_SECTION_CHARGES.CSV"   # FDA 공식 거부 사유 코드표
CHARGE_KIND = {"ADULTERATION": "불량(위생·유해)", "MISBRANDING": "표시 위반"}


def charge_table():
    """거부 사유 코드 → {short, section, kind}. 30일마다 FDA에서 다시 받음 (실패하면 이전 파일 · 없으면 빈 표)."""
    import csv
    import io
    cache = out_path().parent / "act_section_charges.csv"
    fresh = cache.exists() and time.time() - cache.stat().st_mtime < 30 * 86400
    if not fresh:
        try:
            req = urllib.request.Request(CHARGES_URL, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            if b"ASC_ID" in raw[:20]:   # 코드표가 맞을 때만 저장 (앞에 BOM이 붙어 있어도 20바이트 안)
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(raw)
        except Exception:
            pass
    if not cache.exists():
        return {}
    table = {}
    for row in csv.DictReader(io.StringIO(cache.read_text(encoding="utf-8-sig", errors="replace"))):
        sec = (row.get("SCTN_NAME") or "").strip()
        kind = next((v for k, v in CHARGE_KIND.items() if k in sec.upper()), "")
        table[(row.get("ASC_ID") or "").strip()] = {"short": (row.get("CHRG_CODE") or "").strip(),
                                                     "section": sec.split(";")[0].strip(), "kind": kind}
    return table


def _charge_text(codes, table):
    """['251', '9'] → '251 POISONOUS · 불량(위생·유해) §402(a)(1), 801(a)(3) / 9 SALMONELLA …'"""
    out = []
    for c in codes:
        t = table.get(c)
        out.append(f'{c} {t["short"]} · {t["kind"] or "기타"} §{t["section"]}' if t else c)
    return " / ".join(out)


def fda_import_refusals():
    """FDA 수입 거부 (Data Dashboard API · 경고장과 같은 키). 한국산 식품만."""
    user, key = env("FDA_DASHBOARD_USER"), env("FDA_DASHBOARD_KEY")
    if not (user and key):
        raise RuntimeError("FDA_DASHBOARD_USER · FDA_DASHBOARD_KEY 없음 (Data Dashboard 키 신청 필요)")
    body = json.dumps({"start": 1, "rows": 2000, "sort": "RefusalDate", "sortorder": "DESC",
                       "columns": ["FEINumber", "FirmName", "City", "ProductCode", "ProductCodeDescription", "IndustryCodeDescription",
                                   "RefusalDate", "RefusalCharges", "FirmProfile"],
                       "filters": {"ProductCategory": ["Human Foods"], "CountryName": ["South Korea"],   # 2026-10-24 실제 값 확인
                                   "RefusalDateFrom": [_lookback().isoformat()]}}).encode()
    req = urllib.request.Request("https://api-datadashboard.fda.gov/v1/import_refusals", data=body, method="POST", headers={
        "User-Agent": UA, "Content-Type": "application/json", "Authorization-User": user, "Authorization-Key": key})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    # 같은 날 같은 회사·제품은 선적 줄마다 한 행씩 오므로 한 항목으로 묶고 건수만 셈
    groups = {}
    for x in data.get("result") or []:
        gid = f'{x.get("FEINumber") or ""}-{str(x.get("RefusalDate") or "")[:10]}-{x.get("ProductCode") or ""}'
        g = groups.setdefault(gid, {"x": x, "n": 0, "charges": set()})
        g["n"] += 1
        g["charges"].update(c.strip() for c in str(x.get("RefusalCharges") or "").split(",") if c.strip())
    items = []
    table = charge_table()
    for gid, g in groups.items():
        x = g["x"]
        # 사유 코드 뜻은 FDA 공식 코드표(ACT_SECTION_CHARGES.CSV)로 풀어 씀
        codes = sorted(g["charges"], key=lambda c: (len(c), c))
        bits = [x.get("IndustryCodeDescription") or "", f'거부 사유 {_charge_text(codes, table)}' if codes else "",
                f'{g["n"]}줄' if g["n"] > 1 else "", x.get("City") or ""]
        items.append({
            "id": gid,
            "date": str(x.get("RefusalDate") or "")[:10],
            "title": str(x.get("ProductCodeDescription") or x.get("ProductCode") or "")[:240],
            "firm": str(x.get("FirmName") or "")[:160],
            "url": x.get("FirmProfile") if str(x.get("FirmProfile") or "").startswith("https://") else "https://datadashboard.fda.gov/oii/cd/imprefusals.htm",
            "summary": " · ".join(b for b in bits if b)[:600],
        })
    return sorted(items, key=lambda i: i["date"], reverse=True)[:40]


def fda_warning_letters(bodies=False):
    from . import warning_letters
    return warning_letters.collect(bodies=bodies)


# ───────── FDA GRAS 통지 목록 (2026-10-25) ─────────
# 공개 데이터베이스(키 없음)의 '데이터 내려받기' 파일 하나 · 확장자는 xls지만 내용은 CSV (cp1252)
# 하루 1회 작업이 불러도 실제로 내려받는 것은 주 1회 (DATA_DIR/compliance/gras-cache.json)
# 원료 표(static/data.js ingredients)의 id → (화면 이름, FDA 목록 Substance에서 찾을 말 · 소문자)
# 이 목록과 data.js 원료 id가 맞는지는 tests/test_compliance_letters.py가 확인
GRAS_URL = "https://www.hfpappexternal.fda.gov/scripts/fdcc/cfc/XMLService.cfm?method=downloadxls&set=GRASNotices"
GRAS_PAGE = "https://www.hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=GRASNotices&id={}"
GRAS_EVERY = timedelta(days=7)
GRAS_PER_INGREDIENT = 6
GRAS_TERMS = {
    "hovenia": ("헛개", ("hovenia", "raisin tree")),
    "l-fermentum": ("L. fermentum", ("fermentum",)),
    "turmeric": ("강황", ("turmeric", "curcumin")),
    "ginger": ("생강", ("ginger", "zingiber")),
    "jujube": ("대추", ("jujube", "ziziphus")),
    "goji": ("구기자", ("goji", "wolfberry", "lycium")),
    "licorice": ("감초", ("licorice", "glycyrrhiz")),
    "pear": ("배즙", ("pear juice", "pyrus")),
    "maesil": ("매실", ("prunus mume", "maesil")),
    "ginseng": ("홍삼·인삼", ("ginseng", "panax")),
    "green-tea": ("녹차 추출물", ("green tea", "camellia sinensis", "epigallocatechin")),
    "kudzu": ("칡", ("kudzu", "pueraria")),
    "alder": ("오리나무", ("alnus",)),
    "taurine": ("타우린", ("taurine",)),
    "citrus-peel": ("귤껍질", ("citrus peel", "orange peel", "tangerine")),
    "rice-germ": ("미배아·미강", ("rice germ", "rice bran")),
    "dl-alanine": ("DL-알라닌", ("alanine",)),
    "atractylodes": ("창출", ("atractylodes",)),
    "astragalus": ("황기", ("astragalus",)),
    "dhm": ("DHM", ("dihydromyricetin",)),
    "nac": ("NAC", ("acetylcysteine", "acetyl cysteine")),
    "milk-thistle": ("밀크시슬", ("milk thistle", "silymarin", "silybum")),
    "glutathione": ("글루타치온", ("glutathione",)),
    "konjac": ("곤약", ("konjac", "glucomannan")),
    "folic-acid": ("엽산", ("folic acid",)),
    "artichoke": ("아티초크", ("artichoke", "cynara")),
    "allulose": ("알룰로스", ("psicose", "allulose")),
    "stevia": ("스테비아", ("rebaudioside", "stevia", "steviol")),
    "monk-fruit": ("나한과", ("luo han", "siraitia", "monk fruit", "mogroside")),
    "soluble-fiber": ("수용성 옥수수 섬유", ("resistant dextrin", "soluble corn fiber", "resistant maltodextrin")),
    "pectin": ("펙틴", ("pectin",)),
    "spirulina": ("스피루리나", ("spirulina", "arthrospira")),
    "sucralose": ("수크랄로스", ("sucralose",)),
}
GRAS_LETTER_KO = (("fda has no questions", "FDA 질문 없음 (통과)"), ("ceased to evaluate", "신청자 요청으로 검토 중단"),
                  ("does not provide a basis", "GRAS 근거 부족으로 판단"))


def _gras_cache_path():
    return Path(current_app.config["DATA_DIR"]) / "compliance" / "gras-cache.json"


def _parse_gras(raw):
    """FDA 내려받기 파일 → [{grn, substance, use, notifier, closed, letter}]. 앞의 설명 줄은 건너뜀."""
    import csv
    import io
    text = raw.decode("cp1252", errors="replace").lstrip("﻿")
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith("GRAS Notice (GRN) No.")), None)
    if start is None:
        raise ValueError("FDA GRAS 파일 형식이 바뀌었습니다 (머리글 줄 없음)")
    rows = []
    for x in csv.DictReader(io.StringIO("\n".join(lines[start:]))):
        grn = re.sub(r"\D", "", x.get("GRAS Notice (GRN) No.") or "")
        if not grn:
            continue
        m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", (x.get("Date of closure") or "").strip())
        rows.append({"grn": grn, "substance": (x.get("Substance") or "").strip(), "use": (x.get("Intended Use") or "").strip(),
                     "notifier": (x.get("Notifier") or "").strip(), "closed": f"{m[3]}-{m[1]}-{m[2]}" if m else "",
                     "letter": (x.get("FDA's Letter") or "").strip()})
    return rows


def _gras_rows():
    """주 1회만 새로 받음 · 실패하면 지난번 받은 목록을 씀 (없으면 예외)."""
    path = _gras_cache_path()
    try:
        cache = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    fetched = cache.get("fetchedAt") or ""
    fresh = fetched and datetime.now(timezone.utc) - datetime.fromisoformat(fetched.replace("Z", "+00:00")) < GRAS_EVERY
    if fresh and cache.get("rows"):
        return cache["rows"], fetched, ""
    try:
        req = urllib.request.Request(GRAS_URL, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=90) as r:
            rows = _parse_gras(r.read())
    except Exception as e:
        if cache.get("rows"):   # 받기 실패 → 지난번 목록 (화면에 받은 날짜가 보임)
            return cache["rows"], fetched, f"FDA GRAS 목록 새로 받기 실패 ({type(e).__name__}) · {fetched[:10]}에 받은 목록 사용"
        raise
    fetched = _now_iso()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"fetchedAt": fetched, "rows": rows}, ensure_ascii=False), encoding="utf-8")
    return rows, fetched, ""


def fda_gras_notices():
    """원료 표의 원료별 FDA GRAS 통지 (통과한 통지 먼저 · 원료마다 최대 6건) + 원료별 건수(counts).
    통지가 없어도 자체 GRAS일 수 있으므로 '0건 = 사용 불가'가 아님 (화면에서 안내)."""
    rows, fetched, warn = _gras_rows()
    items, counts = [], {}
    for ing, (label, terms) in GRAS_TERMS.items():
        hit = [r for r in rows if any(t in r["substance"].lower() for t in terms)]
        ok = [r for r in hit if r["letter"].lower().startswith("fda has no questions")]
        counts[ing] = {"label": label, "total": len(hit), "ok": len(ok)}
        hit = sorted(ok, key=lambda r: r["closed"], reverse=True) + sorted([r for r in hit if r not in ok], key=lambda r: r["closed"], reverse=True)
        for r in hit[:GRAS_PER_INGREDIENT]:
            letter = next((ko for en, ko in GRAS_LETTER_KO if en in r["letter"].lower()), r["letter"][:80])
            items.append({"id": f"gras-{ing}-{r['grn']}", "date": r["closed"], "title": f"GRN {r['grn']} · {r['substance']}"[:240],
                          "firm": r["notifier"][:160], "url": GRAS_PAGE.format(r["grn"]),
                          "summary": f"{label} · {letter} · 용도: {r['use']}"[:600],
                          "ingredient": ing, "grn": r["grn"], "ok": r in ok})
    note = "원료별 FDA GRAS 통지 (통과/전체): " + " · ".join(f'{c["label"]} {c["ok"]}/{c["total"]}' for c in counts.values())
    note += f" · FDA 목록 받은 날 {fetched[:10]} (주 1회)"
    return items, [warn] if warn else [], note, {"counts": counts, "fetchedAt": fetched, "noKo": True}


# ───────── Firecrawl 수집 (2026-10-26) — 사람이 바로가기로 보던 곳 중 4곳 ─────────
FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape"
WEEKLY = timedelta(days=7)   # 주 1회 출처: 마지막 정상 수집이 이보다 최근이면 다시 부르지 않음 (크레딧 절약)


def _firecrawl_md(url):
    """Firecrawl로 페이지 하나 → 본문 마크다운."""
    key = env("FIRECRAWL_API_KEY")
    if not key:
        raise RuntimeError("FIRECRAWL_API_KEY 없음")
    body = json.dumps({"url": url, "formats": ["markdown"], "onlyMainContent": True, "waitFor": 3000}).encode("utf-8")
    req = urllib.request.Request(FIRECRAWL_URL, data=body, method="POST", headers={
        "User-Agent": UA, "Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        msg = {401: "Firecrawl이 키를 거절함", 403: "Firecrawl이 키를 거절함", 402: "Firecrawl 크레딧을 모두 씀",
               429: "Firecrawl 요청이 많음 · 잠시 뒤 다시"}.get(e.code)
        raise RuntimeError(msg) if msg else e
    if not data.get("success"):
        raise RuntimeError(f"Firecrawl이 페이지를 읽지 못함 ({str(data.get('error') or '')[:80]})")
    return str((data.get("data") or {}).get("markdown") or "")


def _us_date(s):
    # "October 22, 2026" → 2026-10-22 · "09/18/2026" → 2026-09-18 (못 읽으면 빈칸)
    for fmt in ("%B %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return ""


def _sig(text):
    import hashlib
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


NAD_URL = "https://bbbprograms.org/media/newsroom/decisions"
# "New York, NY – October 22, 2026 – The National Advertising Division recommended ..." (구분 기호는 – 또는 -)
NAD_LINE = re.compile(r"^[A-Z][^\n–]{1,40}?\s[–-]\s([A-Z][a-z]+ \d{1,2}, \d{4})\s[–-]\s(.+)$", re.M)
NAD_PROGRAMS = re.compile(r"National Advertising (Division|Review Board)|\bNARB\b")   # 광고 심의만 (개인정보·직판 프로그램은 뺌)
# 우리와 가까운 결정만 사례집 후보로 (식품·음료·건강). 크루즈·통신 같은 결정의 문구는 후보로 올리지 않음
NAD_FOOD = re.compile(r"food|beverage|drink|juice|snack|gumm|candy|sugar|nutrition|supplement|vitamin|probiotic|protein|"
                      r"hangover|alcohol|energy|hydration|electrolyte|immun|liver|digest", re.I)   # 'health'는 보청기·병원까지 걸려 뺌
QUOTE = re.compile(r"[“\"]([^”\"]{6,200})[”\"]")


def nad_decisions():
    """NAD·NARB 결정 요약 (BBB National Programs). 결정문 전문은 유료라 요약만. 개별 링크가 없어 목록 주소로 연결."""
    items = []
    for when, text in NAD_LINE.findall(_firecrawl_md(NAD_URL)):
        text = text.strip()
        if not NAD_PROGRAMS.search(text):
            continue
        d = _us_date(when)
        item = {"id": f"nad-{d}-{_sig(text)}", "date": d, "title": text[:240], "firm": "NAD · 자율 광고 심의",
                "url": NAD_URL, "summary": text[:400]}
        if NAD_FOOD.search(text):
            quotes = [q.strip() for q in QUOTE.findall(text)]
            if quotes:
                item["quotes"] = quotes   # → 사례집 후보 (지금 규칙으로 판정해 보여 주고 사람이 승인)
        items.append(item)
    return items[:20]


FTC_PRESS_URL = "https://www.ftc.gov/news-events/news/press-releases"
FTC_PRESS = re.compile(r"^### \[(.+?)\]\((https://www\.ftc\.gov/news-events/news/press-releases/[^)\s]+)\)\s+Date\s+"
                       r"([A-Z][a-z]+ \d{1,2}, \d{4})\s+(.*?)\s*$", re.M)
# 제목으로 광고·후기·건강·식품 관련만 (FTC는 '기만' 사건이 너무 많아 그 단어로는 거르지 않음 · 합병·경쟁 소식은 뺌)
FTC_AD_WORDS = re.compile(r"\bads?\b|advertis|review|endorse|influencer|testimonial|health|supplement|dietary|"
                          r"food|drink|beverage|weight|\bcures?\b|made in usa|unsubstantiated", re.I)
FTC_SKIP = re.compile(r"acqui|merger|competition|antitrust", re.I)


def ftc_press():
    """FTC 보도자료 목록 1쪽 (최신 20건) 중 광고·건강 관련. FTC 공식 규칙·공고는 Federal Register로 따로 수집."""
    items = []
    for title, url, when, summary in FTC_PRESS.findall(_firecrawl_md(FTC_PRESS_URL)):
        if not FTC_AD_WORDS.search(title) or FTC_SKIP.search(title):
            continue
        items.append({"id": url.rsplit("/", 1)[-1], "date": _us_date(when), "title": title[:240],
                      "firm": "FTC · 보도자료", "url": url, "summary": summary[:400]})
    return items


PROP65_URL = "https://oag.ca.gov/prop65/60-day-notice-search-results?"
PROP65_TERMS = ("gummy", "jelly", "candy")
PROP65_SKIP = re.compile(r"delta-?\s?[89]|\bTHC\b|tetrahydrocannabinol|cannabi|\bCBD\b|marijuana|hemp|kratom", re.I)   # 대마 제품은 우리와 무관


def _prop65_field(block, label):
    m = re.search(rf"^{label}:\s*\n+\s*(.+?)\s*$", block, re.M)
    return m.group(1).strip() if m else ""


def prop65_notices():
    """캘리포니아 법무부 Prop 65 60일 통지 (제품 칸 검색). 비슷한 제품이 경고 문구 없이 통지받은 사례 · 라벨·원료 참고."""
    since = _lookback().isoformat()
    seen, items = set(), []
    for term in PROP65_TERMS:
        md = _firecrawl_md(PROP65_URL + urllib.parse.urlencode({"field_prop65_product_value": term}))
        for block in re.split(r"^### \[AG Number ", md, flags=re.M)[1:]:
            m = re.match(r"([\d-]+) \(View Details\)\]\((\S+?)\)", block)
            if not m or m.group(1) in seen:
                continue
            chem, source = _prop65_field(block, "Chemical"), _prop65_field(block, "Source")
            d = _us_date(_prop65_field(block, "Date Filed"))
            if PROP65_SKIP.search(f"{chem} {source}") or (d and d < since):
                continue
            seen.add(m.group(1))
            items.append({"id": m.group(1), "date": d, "title": f"{source} · {chem}"[:240],
                          "firm": _prop65_field(block, "Alleged Violators")[:200], "url": m.group(2),
                          "summary": f"Prop 65 60일 통지 · 물질: {chem} · 통지한 곳: {_prop65_field(block, 'Noticing Party')}"[:400]})
    return sorted(items, key=lambda i: i["date"], reverse=True)[:30]


OY_POLICY_URL = "https://us.oliveyoung.com/terms/oy-members-policy"


def oliveyoung_policy():
    """올리브영 US 회원 정책 (후기 적립 · R10 참고). 갱신일이 id라 약관이 바뀌면 '새'로 보임."""
    md = _firecrawl_md(OY_POLICY_URL)
    m = re.search(r"Last Updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})", md)
    if not m:
        raise RuntimeError("올리브영 정책 페이지에서 갱신일(Last Updated)을 찾지 못함 · 페이지 모양이 바뀌었을 수 있음")
    d = _us_date(m.group(1))
    # 후기를 써서 적립하는 문장 ("writing a review on the US Online Store")
    review_re = re.compile(r"\b(?:writ|post|submit)\w* (?:a |your )?(?:product )?reviews?\b", re.I)
    review = [line.strip() for line in md.splitlines() if review_re.search(line)][:2]
    return [{"id": f"oy-members-{d}", "date": d, "title": f"O.Y MEMBERS Policy · Last Updated {m.group(1)}",
             "firm": "Olive Young US · 회원 정책", "url": OY_POLICY_URL,
             "summary": (" ".join(review) or "후기 관련 문장 없음 · 원문 확인")[:400]}]


SOURCES = [
    ("fda-warning-letters", "FDA 경고장 (식품 분야 전체 · 숙취·음주 관련 표시)", fda_warning_letters),
    ("openfda-food-recalls", "openFDA 식품 리콜 (젤리·음료·헛개)", openfda_recalls),
    ("regulations-gov", "Regulations.gov FDA·FTC 규칙·규칙안", regulations_gov),
    ("courtlistener", "CourtListener 허위광고 판결 (참고)", courtlistener),
    ("fda-import-refusals", "FDA 수입 거부 (한국산 식품)", fda_import_refusals),
    ("cbp-cross", "CBP CROSS 품목분류 결정 (젤리·음료·헛개)", cbp_rulings),
    ("federal-register", "Federal Register FTC·FDA 공고", federal_register),
    ("fda-gras", "FDA GRAS 통지 (원료 표의 원료별 · 주 1회)", fda_gras_notices),
    ("nad-decisions", "NAD 광고 심의 결정 요약", nad_decisions),
    ("ftc-press", "FTC 보도자료 (광고·후기·건강 관련)", ftc_press),
    ("prop65-notices", "Prop 65 60일 통지 (젤리·구미·사탕 · 주 1회)", prop65_notices, "weekly"),
    ("oliveyoung-policy", "올리브영 US 회원 정책 (주 1회)", oliveyoung_policy, "weekly"),
]
# 네 번째 칸 "weekly": 주 1회만 새로 부름 (그 사이 수집은 지난번 정상 자료를 그대로 씀 · Firecrawl 크레딧 절약)


def _recent(src, within):
    try:
        at = datetime.strptime(src.get("updatedAt") or "", "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return not src.get("stale") and datetime.now(timezone.utc) - at < within


def collect(bodies=False):
    """bodies=True면 경고장 본문까지 읽음 (30초 간격 · 하루 1회 작업에서만).
    출처가 실패하면 빈 목록 대신 지난번 정상 자료를 그대로 두고 stale 표시 (2026-10-24).
    출처마다 updatedAt = 마지막으로 정상 수집한 시각."""
    sources, errors = [], []
    now = _now_iso()
    prev = {s.get("id"): s for s in _current().get("sources", [])}
    for sid, label, fn, *opt in SOURCES:
        if "weekly" in opt and _recent(prev.get(sid) or {}, WEEKLY):
            sources.append(dict(prev[sid], label=label))   # 주 1회 출처 · 아직 7일이 안 됨 → 지난번 자료 (갱신 시각도 그대로)
            continue
        try:
            items = fn(bodies=bodies) if fn is fda_warning_letters else fn()
            note, extra = "", None
            if isinstance(items, tuple):   # (항목, 실패[, 참고 안내[, 출처에 덧붙일 값]]) — 일부 경로만 실패해도 항목은 저장
                items, warns, note, extra = (items + ("", None))[:4]
                errors.extend({"id": sid, "label": label, "error": w} for w in warns)
            sources.append({"id": sid, "label": label, "items": items, "updatedAt": now, **({"note": note} if note else {}), **(extra or {})})
        except Exception as e:  # 한 출처가 실패해도 나머지는 저장
            msg = f"{type(e).__name__}: {getattr(e, 'code', '') or str(e)[:120]}"
            errors.append({"id": sid, "label": label, "error": msg})
            old = prev.get(sid) or {}
            sources.append({"id": sid, "label": label, "items": old.get("items") or [], "stale": True,
                            "updatedAt": old.get("updatedAt") or "", **({"note": old["note"]} if old.get("note") else {}),
                            **{k: old[k] for k in ("counts", "fetchedAt", "noKo") if k in old}})
    # 제목·요약 한글 (참고용). 실패해도 영어 원문은 그대로 저장
    try:
        from . import ko_summary
        if ko_summary.available():
            ko_summary.enrich_sources(sources)
    except Exception as e:
        errors.append({"id": "ko", "label": "한글 요약", "error": f"{type(e).__name__}: {str(e)[:120]}"})
    return {
        "generatedAt": now,
        "sources": sources,
        "errors": errors,
    }


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write(data):
    body = json.dumps(data, ensure_ascii=False, indent=1)
    js = HEADER + "(function (global) {\n  'use strict';\n  global.REBOOT_MONITOR = " + body + ";\n})(typeof window !== 'undefined' ? window : globalThis);\n"
    out = out_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    for path, text in ((out.with_suffix(".json"), body), (out, js)):   # .json은 출처 하나만 바꿀 때 읽는 사본
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)


def _current():
    """지금 화면이 읽는 수집 결과: 서버 사본(.json) → 서버 저장본(.js) → 저장소 기본 파일 순서."""
    out = out_path()
    try:
        return json.loads(out.with_suffix(".json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    for path in (out, Path(__file__).parent / "static" / "monitor-data.js"):
        try:
            js = path.read_text(encoding="utf-8")
            return json.loads(js[js.index("REBOOT_MONITOR = ") + len("REBOOT_MONITOR = "):js.rindex(";\n})(")])
        except (OSError, ValueError):
            continue
    return {"sources": [], "errors": []}


def update_source(source):
    """출처 하나만 바꿔 다시 저장 (경고장 XLSX·본문을 올렸을 때 · 다른 출처는 다시 수집하지 않음)."""
    data = _current()
    old = next((s for s in data.get("sources", []) if s.get("id") == source["id"]), {})
    if old.get("note") and "note" not in source:
        source = dict(source, note=old["note"])   # 참고 안내는 다음 수집 때까지 유지
    sources = [s for s in data.get("sources", []) if s.get("id") != source["id"]]
    # 이 출처만 갱신 시각을 바꿈. 전체 수집 시각(generatedAt)은 그대로 → 다른 출처의 '오래됨' 경고가 사라지지 않음
    data["sources"] = [dict(source, updatedAt=_now_iso())] + sources
    data["errors"] = [e for e in data.get("errors", []) if e.get("id") != source["id"]]
    write(data)
    return data


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
