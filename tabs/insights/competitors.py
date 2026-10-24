"""경쟁사 분석 (README '경쟁사 분석') — 등록 · 상품 분류 · 브랜드 분석 · 포지셔닝 매트릭스.

- 등록: 최신 진열대의 브랜드를 insights_competitors에 넣음 (무료). 대체재 검색어로만 잡힌 브랜드는 '대체재'
- 상품 분류: 제형은 상품명 규칙, 섭취 타이밍 · 웰니스는 문구 규칙 → 규칙으로 못 정한 상품만 AI 묶음 호출
- 브랜드 분석: 리뷰 상위 15개 브랜드. 근거 = Amazon 판매 문구 · 리뷰 요약 · 홈페이지(Firecrawl)
  AI는 근거 안에서만 7개 항목을 채우고, 근거가 없으면 {확인 필요}. 다시 조사하면 바뀐 항목을 기록
- 매트릭스: X = 섭취 타이밍(Pre ↔ Post), Y = 제형(Liquid ↔ Powder/Gummy), 점 = 상품 하나
"""
import json
import re
from datetime import timedelta
from urllib.parse import urlparse

from server import envkeys
from server.config import ROOT
from server.extensions import db
from server.models import iso, utcnow
from . import ai as insights_ai
from . import http
from .http import CollectError
from .models import Competitor, CompetitorHistory, ProductPosition, Review, kv_get, kv_set, load_json
from .util import clean, month_key, short_hash

KEYWORDS_FILE = ROOT / "tabs" / "insights" / "data" / "competitor_keywords.json"
FIRECRAWL_SEARCH = "https://api.firecrawl.dev/v1/search"
FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v1/scrape"
DEEP_TOP = 15                      # 깊은 분석은 리뷰 상위 15개 브랜드
STALE_DAYS = 25                    # 데이터 업데이트 때 다시 조사하는 간격 (월 1회 안팎)
CLASSIFY_BATCH = 60
CHECK = "{확인 필요}"

FIELDS = [("positioning", "핵심 포지셔닝 축"), ("formats", "제품 제형"), ("channels", "주력 유통 채널"),
          ("usp", "핵심 소구 소스 / USP"), ("marketing", "주요 마케팅 채널 · 버즈 포인트"), ("implication", "마케터 관점 시사점")]
FIELD_LABEL = dict(FIELDS)
LIST_FIELDS = ("positioning", "formats", "channels")
NEED_SOURCE = ("positioning", "formats", "channels", "usp", "marketing")  # 근거 없으면 {확인 필요}

LIQUID = re.compile(r"\b(shots?|drinks?|liquid|beverages?|tonic|elixir|bottles?|ready to drink|rtd|ml|fl\.?\s*oz|sparkling|can)\b", re.I)
SOLID = re.compile(r"\b(gumm(?:y|ies)|powders?|tablets?|capsules?|caps|pills?|chew(?:s|able)?|jell(?:y|ies)|lozenges?|"
                   r"softgels?|drink mix|stick packs?|packets?|sachets?|patch(?:es)?)\b", re.I)
SOLID_WINS = re.compile(r"\b(powders?|drink mix|stick packs?|packets?|sachets?|capsules?|tablets?|gumm(?:y|ies)|jell(?:y|ies))\b", re.I)
PRE = re.compile(r"before (?:you )?(?:drink|drinking|a night|the party|party|going out)|pre[- ]?(?:drink|party|game)|"
                 r"take (?:it )?before|ahead of (?:drinking|the night)|prevent(?:ion|ive|s)?\b", re.I)
POST = re.compile(r"morning after|after (?:drinking|a night|the party|party)|next[- ]day|recover(?:y|s)?\b|rehydrat|"
                  r"wake up|bounce back|hangover relief|relief\b", re.I)
WELLNESS = re.compile(r"\b(herbal|ayurved\w*|probiotics?|liver|milk thistle|botanical|plant[- ]based|natural|organic|"
                      r"adaptogen\w*|ginseng|turmeric|detox)\b", re.I)
SKIP_HOSTS = ("amazon.", "walmart.", "target.", "ebay.", "reddit.", "youtube.", "facebook.", "instagram.", "tiktok.",
              "cvs.", "walgreens.", "iherb.", "wikipedia.", "google.", "pinterest.", "x.com", "twitter.", "linkedin.",
              "costco.", "gnc.", "vitaminshoppe.", "sayweee.", "trustpilot.", "yelp.")
CELLS = [("pre-liquid", "Pre × Liquid"), ("post-liquid", "Post × Liquid"), ("pre-solid", "Pre × Powder/Gummy"),
         ("post-solid", "Post × Powder/Gummy")]
FORM_LABEL = {"liquid": "Liquid", "solid": "Powder/Gummy", "": "모름"}
TIMING_LABEL = {"pre": "Pre", "post": "Post", "both": "둘 다", "": "모름"}


# ───────── 검색어 역할 ─────────

def keyword_roles():
    """검색어 → 역할 (대표 · 제형 · 타이밍 · 대체재). 파일이 없거나 깨지면 빈 값."""
    try:
        data = json.loads(KEYWORDS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {str(k.get("keyword", "")).strip().lower(): str(k.get("role", "")) for k in data.get("keywords") or []
            if isinstance(k, dict) and k.get("keyword")}


def _queries(text):
    return [q.strip() for q in str(text or "").split(",") if q.strip()]


def substitute_only(items, roles=None):
    """브랜드 상품이 모두 대체재 검색어로만 잡혔으면 True (검색어 기록이 없으면 False)."""
    roles = keyword_roles() if roles is None else roles
    qs = {q.lower() for x in items for q in _queries(x.get("queries"))}
    return bool(qs) and all(roles.get(q) == "대체재" for q in qs)


# ───────── 상품 분류 (규칙) ─────────

def rule_form(text):
    t = str(text or "")
    liquid, solid = bool(LIQUID.search(t)), bool(SOLID.search(t))
    if liquid and solid:
        return "solid" if SOLID_WINS.search(t) else ""
    return "liquid" if liquid else "solid" if solid else ""


def rule_timing(text):
    t = str(text or "")
    pre, post = bool(PRE.search(t)), bool(POST.search(t))
    return "both" if pre and post else "pre" if pre else "post" if post else ""


def rule_wellness(text):
    return bool(WELLNESS.search(str(text or "")))


def _item_text(x):
    return f"{x.get('title', '')} {x.get('message', '')}"


def _sig(x):
    return short_hash(x.get("title", ""), str(x.get("message", ""))[:800])


def position_of(x, stored=None):
    """진열대 한 줄 → {form, timing, wellness, by}. 저장된 분류가 있고 문구가 같으면 그것, 아니면 규칙."""
    row = (stored or {}).get(x["key"])
    if row is not None and row.sig == _sig(x):
        return {"form": row.form, "timing": row.timing, "wellness": bool(row.wellness), "by": row.classified_by}
    text = _item_text(x)
    return {"form": rule_form(text), "timing": rule_timing(text), "wellness": rule_wellness(text), "by": "rule"}


def stored_positions():
    return {p.key: p for p in ProductPosition.query.all()}


# ───────── 등록 ─────────

def _brand_groups(rows):
    groups = {}
    for x in rows:
        if not x["own"] and x["brand"]:
            groups.setdefault(x["brand"], []).append(x)
    return groups


def sync(rows, tier_of):
    """최신 진열대 rows(service.shelf_dict)의 브랜드를 등록 → 새로 넣은 브랜드 이름 목록.

    tier_of(상품명 목록) → direct · category · substitute (service._tier). 대체재 검색어로만 잡히면 substitute."""
    roles = keyword_roles()
    have = {c.brand.lower(): c for c in Competitor.query.all()}
    added, now = [], utcnow()
    for brand, items in _brand_groups(rows).items():
        qs = sorted({q for x in items for q in _queries(x.get("queries"))})
        tier = "substitute" if substitute_only(items, roles) else tier_of([x["title"] for x in items])
        if tier == "substitute" and any(roles.get(q.lower()) not in (None, "대체재") for q in qs):
            tier = "category"  # 숙취 검색어(대표 · 제형 · 타이밍)로 잡혔으면 적어도 카테고리 경쟁
        c = have.get(brand.lower())
        if c is None:
            c = Competitor(brand=brand[:120], tier=tier, keywords=json.dumps(qs, ensure_ascii=False), first_seen=now)
            db.session.add(c)
            have[brand.lower()] = c
            added.append(brand)
        else:
            old = load_json(c.keywords, [])
            c.keywords = json.dumps(sorted(set(old) | set(qs)), ensure_ascii=False)
            c.tier = tier
        c.last_seen = now
    db.session.commit()
    return added


# ───────── 상품 분류 (AI는 규칙으로 못 정한 것만) ─────────

def classify_products(rows):
    """→ {"rule": n, "ai": n, "calls": n}. 분류 결과를 insights_product_positions에 저장."""
    stored = stored_positions()
    todo, rule_n = [], 0
    for x in rows:
        sig = _sig(x)
        row = stored.get(x["key"])
        if row is not None and row.sig == sig and (row.classified_by == "ai" or not insights_ai.ready()
                                                   or (row.form and row.timing)):
            continue
        text = _item_text(x)
        pos = {"form": rule_form(text), "timing": rule_timing(text), "wellness": rule_wellness(text)}
        row = row or ProductPosition(key=x["key"][:200])
        row.brand, row.sig, row.updated_at = (x["brand"] or "")[:120], sig, utcnow()
        row.form, row.timing, row.wellness, row.classified_by = pos["form"], pos["timing"], pos["wellness"], "rule"
        db.session.add(row)
        stored[x["key"]] = row
        rule_n += 1
        if not pos["form"] or not pos["timing"]:
            todo.append(x)
    db.session.commit()
    calls, ai_n = 0, 0
    if insights_ai.ready():
        for i in range(0, len(todo), CLASSIFY_BATCH):
            batch = todo[i:i + CLASSIFY_BATCH]
            out, cached = insights_ai.classify_positions(
                [{"id": x["key"], "title": x["title"][:300], "text": str(x.get("message") or "")[:600]} for x in batch])
            calls += 0 if cached else 1
            for x in batch:
                o = out.get(x["key"])
                row = stored[x["key"]]
                if not o:
                    continue
                row.form = row.form or ("" if o["form"] == "unknown" else o["form"])
                row.timing = row.timing or ("" if o["timing"] == "unknown" else o["timing"])
                row.wellness = bool(row.wellness or o["wellness"])
                row.classified_by = "ai"
                ai_n += 1
            db.session.commit()
    return {"rule": rule_n, "ai": ai_n, "calls": calls}


# ───────── 브랜드 분석 ─────────

def deep_targets(rows, limit=DEEP_TOP):
    """분석 대상: 대체재 · 보관을 뺀 브랜드 중 진열대 리뷰 합계 상위 limit개."""
    comps = {c.brand.lower(): c for c in Competitor.query.filter_by(status="active").all() if c.tier != "substitute"}
    totals = {}
    for brand, items in _brand_groups(rows).items():
        if brand.lower() in comps:
            totals[brand.lower()] = sum(x["reviews"] or 0 for x in items)
    ranked = sorted(totals, key=lambda b: -totals[b])[:limit]
    return [comps[b] for b in ranked]


def stale(c, force=False):
    return force or not c.researched_at or c.researched_at < utcnow() - timedelta(days=STALE_DAYS)


def _host(url):
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _firecrawl_error(status):
    if status in (401, 403):
        return "Firecrawl이 키를 거절했어요. 설정 › 연결에서 키를 확인하세요."
    if status == 402:
        return "Firecrawl 크레딧을 모두 썼어요."
    if status == 429:
        return "Firecrawl 요청이 많아요. 잠시 뒤 다시 시도하세요."
    return None


def find_website(key, brand):
    """Firecrawl 검색으로 공식 홈페이지 찾기 (주소에 브랜드 이름이 들어간 첫 결과만) → (주소 또는 "", 쓴 크레딧)."""
    status, data = http.post_json("Firecrawl", FIRECRAWL_SEARCH, {"query": f"{brand} hangover official site", "limit": 5},
                                  headers={"Authorization": f"Bearer {key}"})
    err = _firecrawl_error(status)
    if err:
        raise CollectError(err)
    if status != 200 or not isinstance(data, dict):
        return "", 1
    token = re.sub(r"[^a-z0-9]", "", brand.lower())[:8]
    results = data.get("data")
    for r in results if isinstance(results, list) else []:
        url = str((r if isinstance(r, dict) else {}).get("url") or "")
        host = _host(url)
        if not url.startswith("http") or not host or any(s in host for s in SKIP_HOSTS):
            continue
        if len(token) >= 3 and token in re.sub(r"[^a-z0-9]", "", host):
            return f"{urlparse(url).scheme}://{host}/", 1
    return "", 1


def scrape_site(key, url):
    status, data = http.post_json("Firecrawl", FIRECRAWL_SCRAPE, {"url": url, "formats": ["markdown"], "onlyMainContent": True},
                                  headers={"Authorization": f"Bearer {key}"})
    err = _firecrawl_error(status)
    if err:
        raise CollectError(err)
    if status != 200 or not isinstance(data, dict) or data.get("success") is False:
        return ""
    return str(((data.get("data") or {}).get("markdown")) or "")


def evidence(c, rows):
    """근거 목록 [{id, type, title, url, text}] — Amazon · Weee! 판매 문구, 리뷰 요약, 대표 리뷰."""
    items = [x for x in rows if x["brand"].lower() == c.brand.lower() and not x["own"]]
    items.sort(key=lambda x: -(x["reviews"] or 0))
    out = []
    for i, x in enumerate(items[:5], start=1):
        price = f" · ${x['price']:.2f}" if x.get("price") is not None else ""
        out.append({"id": f"P{i}", "type": x["sourceLabel"], "title": x["title"][:200], "url": x.get("link") or "",
                    "text": clean(f"{x['title']}{price} · 리뷰 {x['reviews'] or 0}개 · {x.get('message') or ''}", 900)})
    summaries = kv_get("amazon_summaries", {})
    keys = [x["key"] for x in items]
    n = 0
    for k in keys:
        s = summaries.get(k.split(":", 1)[-1])
        if s and s.get("text"):
            n += 1
            out.append({"id": f"S{n}", "type": "Amazon 리뷰 요약", "title": clean(s.get("title"), 200), "url": "",
                        "text": clean(s["text"], 600)})
    revs = (Review.query.filter(Review.product_key.in_(keys)).order_by(Review.collected_at.desc()).limit(6).all()
            if keys else [])
    for i, r in enumerate(revs, start=1):
        out.append({"id": f"R{i}", "type": "구매자 리뷰", "title": clean(r.product_title, 200), "url": "",
                    "text": clean(f"별점 {r.rating or '?'} · {r.title} · {r.text}", 400)})
    return out


def _norm(field, v):
    if field in LIST_FIELDS:
        return sorted(v.get("values") or [])
    return clean(v.get("text"), 2000)


def changed_fields(old, new):
    if not old:
        return []
    return [FIELD_LABEL[f] for f, _ in FIELDS if _norm(f, old.get(f) or {}) != _norm(f, new.get(f) or {})]


def clean_analysis(out, ids):
    """AI 결과 정리: 없는 출처 번호는 지우고, 근거가 없는 항목은 {확인 필요}."""
    res = {}
    for f, _ in FIELDS:
        v = out.get(f) or {}
        src = [s for s in v.get("sources") or [] if s in ids]
        if f in LIST_FIELDS:
            vals = [str(x) for x in v.get("values") or []][:3]
            if f == "positioning":
                vals = vals[:2]
            if f in NEED_SOURCE and not src:
                vals = []
            res[f] = {"values": vals, "sources": src}
        else:
            text = clean(v.get("text"), 600)
            if (f in NEED_SOURCE and not src) or not text:
                text, src = CHECK, []
            res[f] = {"text": text, "sources": src}
    return res


def research(c, rows):
    """경쟁사 한 곳 분석 → {usage, cached, changed, warnings}. OpenAI 키가 없으면 CollectError."""
    if not insights_ai.ready():
        raise CollectError("OpenAI 키가 없어 경쟁사 분석을 할 수 없어요 (설정 › 연결).")
    usage, warnings = {"firecrawl": 0, "openai": 0}, []
    ev = evidence(c, rows)
    fc = envkeys.get("FIRECRAWL_API_KEY")
    if fc:
        searched = kv_get("comp_site_searched", {})
        if not c.website and c.brand.lower() not in searched:
            try:
                site, n = find_website(fc, c.brand)
                usage["firecrawl"] += n
                c.website = site[:500]
            except CollectError as e:
                warnings.append(str(e))
            searched[c.brand.lower()] = iso(utcnow())
            kv_set("comp_site_searched", searched)
        if c.website:
            try:
                md = scrape_site(fc, c.website)
                usage["firecrawl"] += 1
                if md:
                    ev.append({"id": "W1", "type": "브랜드 홈페이지", "title": c.website, "url": c.website, "text": clean(md, 6000)})
            except CollectError as e:
                warnings.append(f"{c.brand} 홈페이지: {e}")
    if not ev:
        raise CollectError(f"{c.brand}: 근거로 쓸 진열대 · 홈페이지 자료가 없어요.")
    payload = {"brand": c.brand, "tier": c.tier, "evidence": [{k: e[k] for k in ("id", "type", "title", "text")} for e in ev]}
    out, cached = insights_ai.analyze_competitor(payload)
    usage["openai"] += 0 if cached else 1
    new = clean_analysis(out, {e["id"] for e in ev})
    old = load_json(c.analysis, {})
    changed = changed_fields(old, new)
    if old:
        db.session.add(CompetitorHistory(competitor_id=c.id, analysis=c.analysis, changed=json.dumps(changed, ensure_ascii=False),
                                         researched_at=c.researched_at))
    c.analysis = json.dumps(new, ensure_ascii=False)
    c.sources = json.dumps([{k: e[k] for k in ("id", "type", "title", "url")} for e in ev], ensure_ascii=False)
    c.model, c.researched_at = insights_ai.openai_model(), utcnow()
    db.session.commit()
    return {"usage": usage, "cached": cached, "changed": changed, "warnings": warnings}


def run(rows, tier_of, force=False, only=None):
    """데이터 업데이트 '경쟁사 분석' — 등록 → 상품 분류 → 분석(오래된 것 · force면 상위 15개 모두 · only면 한 곳)."""
    added = sync(rows, tier_of)
    cls = classify_products(rows)
    usage = {"firecrawl": 0, "openai": cls["calls"]}
    warnings, done, changed = [], 0, 0
    if only is not None:
        c = db.session.get(Competitor, only)
        targets = [c] if c is not None else []
    else:
        targets = [c for c in deep_targets(rows) if stale(c, force)]
    if targets and not insights_ai.ready():
        warnings.append("OpenAI 키가 없어 브랜드 분석은 건너뛰었어요.")
        targets = []
    for c in targets:
        try:
            r = research(c, rows)
        except CollectError as e:
            warnings.append(str(e))
            if "크레딧" in str(e) or "키를 거절" in str(e):
                break
            continue
        for k, v in r["usage"].items():
            usage[k] += v
        warnings += r["warnings"]
        done += 1
        changed += bool(r["changed"])
    save_snapshot(matrix(rows))
    msg = (f"새 경쟁사 {len(added)}개 · 상품 분류 {cls['rule']}개(AI {cls['ai']}개) · 브랜드 분석 {done}개"
           + (f" (바뀐 곳 {changed}개)" if changed else "") + ".")
    return {"count": done, "added": added, "usage": {k: v for k, v in usage.items() if v}, "warnings": warnings, "message": msg}


# ───────── 매트릭스 ─────────

def _jitter(key, lo, hi):
    h = int(short_hash(key)[:8], 16) / 0xFFFFFFFF
    return round(lo + (hi - lo) * h, 3)


def _cells_of(p):
    sides = ["pre", "post"] if p["timing"] == "both" else [p["timing"]]
    return [f"{s}-{p['form']}" for s in sides]


def matrix(rows, substitutes=None):
    """→ {points, cells, unknown, blueOcean}. 대체재 브랜드 · 제형이나 타이밍을 모르는 상품은 점을 찍지 않음."""
    substitutes = substitutes if substitutes is not None else {c.brand.lower() for c in Competitor.query.all()
                                                               if c.tier == "substitute" or c.status == "archived"}
    stored = stored_positions()
    points, unknown = [], 0
    cells = {k: {"key": k, "label": label, "products": 0, "reviews": 0, "own": 0} for k, label in CELLS}
    for x in rows:
        if not x["own"] and (not x["brand"] or x["brand"].lower() in substitutes):
            continue
        p = position_of(x, stored)
        if not p["form"] or not p["timing"]:
            unknown += 1
            continue
        xs = {"pre": (0.06, 0.40), "both": (0.44, 0.56), "post": (0.60, 0.94)}[p["timing"]]
        ys = {"liquid": (0.58, 0.94), "solid": (0.06, 0.42)}[p["form"]]
        points.append({"key": x["key"], "brand": x["brand"], "title": x["title"][:120], "source": x["sourceLabel"],
                       "reviews": x["reviews"] or 0, "own": x["own"], "watched": x["watched"], "form": p["form"],
                       "timing": p["timing"], "wellness": p["wellness"], "by": p["by"], "link": x.get("link") or "",
                       "x": _jitter(x["key"] + "x", *xs), "y": _jitter(x["key"] + "y", *ys)})
        for k in _cells_of(p):
            cells[k]["products"] += 0 if x["own"] else 1
            cells[k]["reviews"] += 0 if x["own"] else (x["reviews"] or 0)
            cells[k]["own"] += 1 if x["own"] else 0
    return {"points": points, "cells": [cells[k] for k, _ in CELLS], "unknown": unknown, "blueOcean": blue_ocean(cells)}


def blue_ocean(cells):
    """경쟁 밀도(리뷰 합계 → 제품 수)가 가장 낮은 칸. 검색 수요 확인은 2단계라 '후보'로만 표시."""
    vals = list(cells.values()) if isinstance(cells, dict) else list(cells)
    if not any(c["products"] for c in vals):
        return None
    best = min(vals, key=lambda c: (c["reviews"], c["products"]))
    busiest = max(vals, key=lambda c: (c["reviews"], c["products"]))
    reason = (f"경쟁 제품 {best['products']}개 · 리뷰 합계 {best['reviews']:,}개로 4칸 중 가장 적어요 "
              f"(가장 붐비는 칸은 {busiest['label']} · 리뷰 {busiest['reviews']:,}개). 검색 수요는 아직 확인 전이에요.")
    return {"key": best["key"], "label": best["label"], "reason": reason, "own": best["own"]}


def save_snapshot(m):
    snaps = kv_get("matrix_snapshots", {})
    snaps[month_key(utcnow().date())] = {c["key"]: {"products": c["products"], "reviews": c["reviews"]} for c in m["cells"]}
    kv_set("matrix_snapshots", dict(sorted(snaps.items())[-12:]))


def with_trend(m, month):
    """칸마다 지난달 스냅숏과 비교한 제품 수 변화 (없으면 None)."""
    snaps = kv_get("matrix_snapshots", {})
    prev = [k for k in sorted(snaps) if k < month]
    base = snaps[prev[-1]] if prev else None
    for c in m["cells"]:
        b = (base or {}).get(c["key"])
        c["prevProducts"] = b["products"] if b else None
        c["delta"] = c["products"] - b["products"] if b else None
    m["prevMonth"] = prev[-1] if prev else None
    return m


# ───────── 화면 · 내려받기 ─────────

def comp_dict(c):
    a = load_json(c.analysis, {})
    return {"id": c.id, "brand": c.brand, "tier": c.tier, "status": c.status, "website": c.website,
            "keywords": load_json(c.keywords, []), "analysis": a, "analyzed": bool(a), "sources": load_json(c.sources, []),
            "model": c.model, "firstSeen": iso(c.first_seen), "lastSeen": iso(c.last_seen), "researchedAt": iso(c.researched_at),
            "isNew": bool(c.first_seen and c.first_seen >= utcnow() - timedelta(days=7)),
            "history": [{"changed": load_json(h.changed, []), "researchedAt": iso(h.researched_at), "savedAt": iso(h.created_at)}
                        for h in CompetitorHistory.query.filter_by(competitor_id=c.id).order_by(CompetitorHistory.id.desc()).limit(3)]}


def field_text(a, f):
    v = (a or {}).get(f) or {}
    if f in LIST_FIELDS:
        return ", ".join(v.get("values") or []) or (CHECK if a else "")
    return v.get("text") or ""


def export_rows():
    """CSV · JSON · Excel용: 보관하지 않은 경쟁사 전부 (분석 전이면 빈 칸)."""
    out = []
    for c in Competitor.query.order_by(Competitor.status, Competitor.brand).all():
        a = load_json(c.analysis, {})
        src = load_json(c.sources, [])
        out.append({"brand": c.brand, "tier": c.tier, "status": c.status,
                    **{f: field_text(a, f) for f, _ in FIELDS},
                    "website": c.website, "keywords": ", ".join(load_json(c.keywords, [])),
                    "sources": " ".join(s["url"] for s in src if s.get("url")), "researched_at": iso(c.researched_at) or "",
                    "ai": bool(a)})
    return out
