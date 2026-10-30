"""자사 홈페이지(시연 사이트) 매출 — 성과분석 '자사 홈페이지 매출' 카드용 (README 자사 홈페이지 연동).

데이터 API(server/core/shopapi.py)에서 고른 기간만 받음 · 금액은 달러(할인 후 net) · 광고비 CSV(원화)와 섞지 않음
- 채널: 자사몰 직접(direct-orders, paid 줄만) + 인플루언서 플랫폼별(influencer-sales 합계 · 크리에이터 수수료 포함)
- 상품: product-sales (via_link = 크리에이터 링크로 팔린 매출)
- is_dummy 줄이나 '(Fictional)' 크리에이터가 있으면 dummy=True → 화면 '예시' 배지
"""
from server.core import shopapi
from server.models import iso

DIRECT = "자사몰 직접"


def _num(v, cast=float):
    try:
        return cast(str(v or "0").replace(",", "").strip() or 0)
    except ValueError:
        return cast(0)


def _yes(v):
    return str(v or "").strip().lower() in ("true", "1", "yes")


def summary(start, end, refresh=False):
    direct, at = shopapi.fetch("direct-orders", start, end, refresh)
    infl, at2 = shopapi.fetch("influencer-sales", start, end, refresh)
    prods, at3 = shopapi.fetch("product-sales", start, end, refresh)
    dummy = any(_yes(r.get("is_dummy")) for r in direct) or any("(Fictional)" in str(r.get("influencer_name") or "") for r in infl)

    d_orders, d_units, d_rev = set(), 0, 0.0
    for r in direct:
        if str(r.get("status") or "").strip().lower() != "paid":
            continue
        d_orders.add(str(r.get("order_id") or "").strip())
        d_units += _num(r.get("quantity"), int)
        d_rev += _num(r.get("line_total_usd"))
    channels = [{"channel": DIRECT, "orders": len(d_orders), "units": d_units, "revenue": round(d_rev, 2),
                 "commission": 0.0, "creators": 0}]
    by = {}
    for r in infl:
        name = str(r.get("platform") or "").strip() or "기타"
        c = by.setdefault(name, {"channel": name, "orders": 0, "units": 0, "revenue": 0.0, "commission": 0.0, "creators": 0})
        c["orders"] += _num(r.get("order_count"), int)
        c["units"] += _num(r.get("units_sold"), int)
        c["revenue"] += _num(r.get("net_sales_usd"))
        c["commission"] += _num(r.get("commission_usd"))
        c["creators"] += 1
    channels += sorted(by.values(), key=lambda c: -c["revenue"])
    for c in channels:
        c["revenue"], c["commission"] = round(c["revenue"], 2), round(c["commission"], 2)
    total = round(sum(c["revenue"] for c in channels), 2)
    for c in channels:
        c["share"] = round(c["revenue"] / total * 100, 1) if total else None

    products = sorted(({"name": str(r.get("product_name") or r.get("product_slug") or "").strip(),
                        "orders": _num(r.get("order_count"), int), "units": _num(r.get("units_sold"), int),
                        "revenue": round(_num(r.get("net_sales_usd")), 2), "viaLink": round(_num(r.get("via_link_sales_usd")), 2)}
                       for r in prods), key=lambda p: -p["revenue"])
    totals = {"revenue": total, "orders": sum(c["orders"] for c in channels), "units": sum(c["units"] for c in channels),
              "commission": round(sum(c["commission"] for c in channels), 2)}
    return {"ready": True, "start": str(start), "end": str(end), "currency": "USD", "dummy": dummy,
            "fetchedAt": iso(min(at, at2, at3)), "channels": channels, "products": products, "totals": totals}
