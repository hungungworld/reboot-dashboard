"""Weee! 진열대 (Firecrawl → 마크다운에서 상품 · 가격 · 품절 읽기, 최선 노력).

- 목록 페이지: 상품 주소(/product/<이름>/<번호>)마다 바로 뒤의 첫 $가격 · 'Sold out' 여부
- 상품 페이지(주소에 /product/): 제목(# …) · 가격 · 품절 · 설명 앞부분(핵심 메시지)
- 읽기가 불안정할 수 있어 원문 앞부분을 저장해 두고, 진열대 › 표로 보기에서 가격 · 재고를 고칠 수 있게 함
"""
import re

from ..models import iso, utcnow
from . import http, store
from .http import CollectError
from .models import kv_get, kv_set
from .util import clean, has_any

FIRECRAWL = "https://api.firecrawl.dev/v1/scrape"
URL_RE = re.compile(r"https?://(?:www\.)?sayweee\.com/[^\s)\]\"'<>]*?/product/([^/\s)\]\"'<>]+)/(\d+)[^\s)\]\"'<>]*", re.I)
PRICE_RE = re.compile(r"\$\s?(\d{1,4}(?:\.\d{1,2})?)")
SOLD_OUT_RE = re.compile(r"sold\s*out|out of stock|품절|currently unavailable", re.I)
LINK_TEXT_RE = re.compile(r"\[([^\[\]]{2,300})\]\($")
IMG_ALT_RE = re.compile(r"!\[([^\[\]]{2,300})\]\([^()]*\)\]\($")


def scrape(key, url):
    status, data = http.post_json("Firecrawl", FIRECRAWL, {"url": url, "formats": ["markdown"], "onlyMainContent": True},
                                  headers={"Authorization": f"Bearer {key}"})
    if status in (401, 403):
        raise CollectError("Firecrawl이 키를 거절했어요. 설정 › 연결에서 키를 확인하세요.")
    if status == 402:
        raise CollectError("Firecrawl 크레딧을 모두 썼어요.")
    if status == 429:
        raise CollectError("Firecrawl 요청이 많아요. 잠시 뒤 다시 시도하세요.")
    if status != 200 or not isinstance(data, dict) or data.get("success") is False:
        raise CollectError(f"Firecrawl이 페이지를 읽지 못했어요 ({status}).")
    return str(((data.get("data") or {}).get("markdown")) or "")


def _slug_title(slug):
    return clean(re.sub(r"[-_]+", " ", slug), 300)


def _title_before(md, start):
    before = md[max(0, start - 400):start]
    m = IMG_ALT_RE.search(before)
    alt = m.group(1) if m else ""
    m = LINK_TEXT_RE.search(before)
    text = m.group(1) if m and not m.group(1).startswith("!") else ""
    return clean(text or alt, 300)


def parse_listing(md):
    """목록 마크다운 → [{id, title, price, in_stock, link}] (주소가 나온 순서)."""
    marks = [(m.group(2), m.group(1), m.start(), m.end(), m.group(0)) for m in URL_RE.finditer(md)]
    out, order = {}, []
    for i, (pid, slug, start, end, link) in enumerate(marks):
        title = _title_before(md, start)
        it = out.get(pid)
        if it is None:
            it = {"id": pid, "slug": slug, "title": "", "price": None, "in_stock": None, "link": link.split("?")[0]}
            out[pid] = it
            order.append(pid)
        if title and (not it["title"] or len(title) > len(it["title"])):
            it["title"] = title
        nxt = next((m[2] for m in marks[i + 1:] if m[0] != pid), len(md))
        seg = md[end:nxt]
        if it["price"] is None:
            pm = PRICE_RE.search(seg)
            if pm:
                it["price"] = round(float(pm.group(1)), 2)
        if SOLD_OUT_RE.search(seg):
            it["in_stock"] = False
    items = []
    for pid in order:
        it = out[pid]
        it["title"] = it["title"] or _slug_title(it["slug"])
        if it["in_stock"] is None and it["price"] is not None:
            it["in_stock"] = True
        items.append(it)
    return items


def parse_product_page(md, url):
    m = URL_RE.search(url)
    pid = m.group(2) if m else re.sub(r"\W+", "", url)[-20:]
    title = ""
    hm = re.search(r"^#\s+(.+)$", md, re.M)
    if hm:
        title = clean(hm.group(1), 300)
    after = md[hm.end():] if hm else md
    pm = PRICE_RE.search(after)
    paras = [clean(p, 400) for p in re.split(r"\n\s*\n", after)
             if p.strip() and not p.strip().startswith(("!", "[", "#", "|", "$")) and len(p.strip()) > 30]
    return {"id": pid, "slug": m.group(1) if m else "", "title": title or (_slug_title(m.group(1)) if m else ""),
            "price": round(float(pm.group(1)), 2) if pm else None,
            "in_stock": False if SOLD_OUT_RE.search(md[:6000]) else (True if pm else None),
            "link": url.split("?")[0], "message": paras[0] if paras else ""}


def collect(cfg, key, week):
    own_terms, exclude = cfg.get("own_terms") or [], cfg.get("exclude_terms") or []
    raw = kv_get("weee_raw", {})
    items, calls, warnings = {}, 0, []
    for url in cfg.get("weee_urls") or []:
        try:
            md = scrape(key, url)
        except CollectError as e:
            calls += 1
            if "키" in str(e) or "크레딧" in str(e) or not items:
                raise
            warnings.append(str(e))
            continue
        calls += 1
        raw[url] = {"at": iso(utcnow()), "chars": len(md), "snippet": md[:3000]}
        is_product = "/product/" in url
        found = [parse_product_page(md, url)] if is_product else parse_listing(md)
        if not found or not found[0].get("title"):
            warnings.append(f"상품을 찾지 못했어요: {url[:80]} (원문 앞부분을 저장했어요)")
            continue
        for pos, it in enumerate(found, start=1):
            if has_any(it["title"], exclude):
                continue
            k = f"weee:{it['id']}"
            cur = items.get(k)
            row = {"key": k, "position": None if is_product else pos, "queries": [url], "title": it["title"],
                   "price": it["price"], "price_text": f"${it['price']:.2f}" if it["price"] is not None else "",
                   "in_stock": it["in_stock"], "availability": "Sold out" if it["in_stock"] is False else "",
                   "link": it["link"], "message": it.get("message", ""), "detailed": is_product,
                   "own": has_any(it["title"], own_terms)}
            if cur is None:
                items[k] = row
            elif is_product:  # 상품 페이지 값이 목록보다 정확
                cur.update({kk: v for kk, v in row.items() if v not in (None, "", []) and kk != "queries"})
                cur["queries"].append(url)
    kv_set("weee_raw", raw)
    store.save_shelf(week, "weee", list(items.values()))
    return {"count": len(items), "calls": calls, "warnings": warnings}
