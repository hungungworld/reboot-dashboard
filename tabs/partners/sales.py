"""크리에이터별 판매 실적 — 더미 데이터 (README 3-5). Shopify 연동 전 화면·성과분석 연결 확인용.

- 인플루언서 상위 12곳(가져온 순서, 번호가 숫자가 아닌 IX 예시 행 제외) × 최근 60일
  가져온 인플루언서가 없으면 'Creator A' … 'Creator L' (실존 인물 아님)
- 이름·날짜마다 고정 시드 → 같은 이름·날짜는 언제 불러도 같은 값 (결정적)
- 크리에이터별 할인코드 주문 (환불 약 5% → 합계에서 제외) · 방문(접속량) · 가상 단가 UNIT_PRICE 달러
Shopify를 연동하면 _day()를 Orders API(discount_codes) 집계로, 접속량은 UTM·추적 링크 집계로 바꿉니다.

시연 사이트(reboot-us) 관리자 CSV를 올리면 그 값으로 집계 (shop_report)
- 주문: Order details(orders.csv) 또는 influencer order lines — 주문 한 줄씩, link_code/discount_code로 묶음
- 크리에이터: Creator performance(creator-performance.csv) — 방문(clicks)은 기간 구분 없는 전체 누적
- 전환율 = 기간 주문 ÷ 전체 누적 방문 (시연 사이트 관리자 화면과 같은 계산) · paid만 매출, refunded는 환불 건수
- is_dummy 열이 True인 줄이 있으면 dummy=True (화면에 예시 배지 유지)
"""
import csv
import hashlib
import io
import random
import re
from datetime import date, timedelta
from functools import lru_cache

DAYS = 60
TOP = 12
UNIT_PRICE = 24.0          # 가상 단가 (실제 가격 미정 · 팩트시트 price가 null)
REFUND_RATE = 0.05
PLACEHOLDERS = tuple(f"Creator {c}" for c in "ABCDEFGHIJKL")
WEEKDAY = (0.85, 0.85, 0.9, 1.0, 1.25, 1.35, 1.1)   # 월~일 (주말 접속 많음)


def creator_list(names):
    names = [str(n).strip() for n in (names or []) if str(n or "").strip()][:TOP]
    return (names, "imported") if names else (list(PLACEHOLDERS), "placeholder")


def _code(name, i, used):
    base = re.sub(r"[^A-Z0-9]", "", name.upper())[:10] or f"RB{i + 1:02d}"
    code, k = base + "10", 2
    while code in used:
        code, k = f"{base}{k}10", k + 1
    used.add(code)
    return code


def _profile(name):
    h = int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:12], 16)
    popularity = 40 + h % 260                  # 하루 평균 접속 40~300
    conv = 0.012 + (h // 260) % 30 / 1000      # 전환율 1.2%~4.1%
    return popularity, conv


@lru_cache(maxsize=8192)
def _day(name, day_iso):
    popularity, conv = _profile(name)
    d = date.fromisoformat(day_iso)
    rng = random.Random(f"{name}|{day_iso}")   # 문자열 시드는 sha512 기반 → 실행마다 같음
    visits = max(0, int(round(popularity * WEEKDAY[d.weekday()] * rng.uniform(0.6, 1.4))))
    orders = units = refunds = 0
    for _ in range(visits):
        if rng.random() < conv:
            u = rng.choice((1, 1, 1, 2, 2, 3))
            if rng.random() < REFUND_RATE:
                refunds += 1
                continue
            orders += 1
            units += u
    return visits, orders, units, round(units * UNIT_PRICE, 2), refunds


def window(today):
    return today - timedelta(days=DAYS - 1), today


def _pct(a, b):
    return round(a / b * 100, 2) if b else 0.0


def _change(cur, prev):
    """이전 같은 길이 기간 대비 증감률(%) — 이전 값이 0이면 None"""
    return round((cur - prev) / prev * 100, 1) if prev else None


def report(names, today, start=None, end=None):
    lo, hi = window(today)
    end = min(max(end or hi, lo), hi)
    start = min(max(start or max(lo, end - timedelta(days=29)), lo), hi)
    if start > end:
        start, end = end, start
    creators, source = creator_list(names)
    used, rows = set(), []
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    daily = {d: {"date": d.isoformat(), "visits": 0, "orders": 0, "units": 0, "revenue": 0.0} for d in days}
    prev_days = [start - timedelta(days=i) for i in range(len(days), 0, -1)]   # 바로 앞 같은 길이 기간 (상승률용)
    prev_total = 0.0
    for i, name in enumerate(creators):
        t = {"visits": 0, "orders": 0, "units": 0, "revenue": 0.0, "refunds": 0}
        cdaily = []
        prev = sum(_day(name, d.isoformat())[3] for d in prev_days)
        prev_total += prev
        for d in days:
            v, o, u, r, f = _day(name, d.isoformat())
            cdaily.append({"date": d.isoformat(), "visits": v, "orders": o, "revenue": r})
            t["visits"] += v
            t["orders"] += o
            t["units"] += u
            t["revenue"] += r
            t["refunds"] += f
            dd = daily[d]
            dd["visits"] += v
            dd["orders"] += o
            dd["units"] += u
            dd["revenue"] += r
        rows.append({"name": name, "code": _code(name, i, used), "visits": t["visits"], "orders": t["orders"],
                     "units": t["units"], "revenue": round(t["revenue"], 2), "refunds": t["refunds"],
                     "conversion": _pct(t["orders"], t["visits"]), "daily": cdaily,
                     "prevRevenue": round(prev, 2), "change": _change(t["revenue"], prev)})
    rows.sort(key=lambda r: (-r["revenue"], r["name"]))
    totals = {k: sum(r[k] for r in rows) for k in ("visits", "orders", "units", "refunds")}
    totals["revenue"] = round(sum(r["revenue"] for r in rows), 2)
    totals["conversion"] = _pct(totals["orders"], totals["visits"])
    totals["prevRevenue"] = round(prev_total, 2)
    totals["change"] = _change(totals["revenue"], prev_total)
    for dd in daily.values():
        dd["revenue"] = round(dd["revenue"], 2)
    return {"dummy": True, "source": source, "start": start.isoformat(), "end": end.isoformat(),
            "range": {"min": lo.isoformat(), "max": hi.isoformat()}, "unitPrice": UNIT_PRICE, "currency": "USD",
            "creators": rows, "daily": [daily[d] for d in days], "totals": totals,
            "note": "Shopify · UTM 연동 전 (환불 주문 제외)"}


# ───────── 시연 사이트 관리자 CSV ─────────

SHOP_MAX_BYTES = 5 * 1024 * 1024
ORDER_COLS = ("order_id", "ordered_at", "status", "quantity", "line_total_usd")
CREATOR_COLS = ("creator", "discount_code", "clicks")


class ShopCsvError(ValueError):
    """화면에 그대로 보여 줄 CSV 오류."""


def read_csv(raw):
    """bytes → (머리글, 줄 목록). UTF-8(BOM) → 엑셀 한글(CP949) 순서."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp949", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return [h.strip() for h in (reader.fieldnames or [])], list(reader)


def csv_kind(header):
    """'orders' | 'creators' | None — 머리글로 파일 종류 판단."""
    cols = set(header)
    if all(c in cols for c in ORDER_COLS) and ("link_code" in cols or "discount_code" in cols):
        return "orders"
    if all(c in cols for c in CREATOR_COLS):
        return "creators"
    return None


def _num(v, cast=float):
    try:
        return cast(str(v or "0").replace(",", "").strip() or 0)
    except ValueError:
        return cast(0)


def _yes(v):
    return str(v or "").strip().lower() in ("true", "1", "yes")


def _order_lines(rows):
    """주문 줄 → [(날짜, 코드, 이름, 플랫폼, 주문번호, 상태, 수량, 금액, 예시여부)] — 크리에이터 링크 주문만."""
    out = []
    for r in rows:
        code = str(r.get("link_code") or r.get("discount_code") or "").strip().upper()
        try:
            d = date.fromisoformat(str(r.get("ordered_at") or "")[:10])
        except ValueError:
            continue
        if not code or code == "DIRECT":
            continue
        out.append((d, code, str(r.get("influencer_name") or "").strip(), str(r.get("platform") or "").strip(),
                    str(r.get("order_id") or "").strip(), str(r.get("status") or "").strip().lower(),
                    _num(r.get("quantity"), int), _num(r.get("line_total_usd")), _yes(r.get("is_dummy"))))
    return out


def shop_report(order_rows, creator_rows, start=None, end=None, uploaded_at=None):
    lines = _order_lines(order_rows)
    if not lines:
        raise ShopCsvError("주문 CSV에 크리에이터 링크 주문이 없어요.")
    info = {}
    for r in creator_rows or []:
        code = str(r.get("discount_code") or "").strip().upper()
        if code:
            info[code] = {"name": str(r.get("creator") or "").strip(), "platform": str(r.get("platform") or "").strip(),
                          "visits": _num(r.get("clicks"), int)}
    lo, hi = min(x[0] for x in lines), max(x[0] for x in lines)
    end = min(max(end or hi, lo), hi)
    start = min(max(start or max(lo, end - timedelta(days=29)), lo), hi)
    if start > end:
        start, end = end, start
    n = (end - start).days + 1
    prev_lo = start - timedelta(days=n)
    days = [start + timedelta(days=i) for i in range(n)]
    for _, code, name, platform, *_ in lines:   # CSV에 크리에이터 파일이 없거나 빠진 코드는 주문 줄 이름 사용
        c = info.setdefault(code, {"name": name or code, "platform": platform, "visits": 0})
        c["name"] = c["name"] or name or code
        c["platform"] = c["platform"] or platform

    def blank():
        return {"orders": set(), "units": 0, "revenue": 0.0, "refunds": set()}

    cur = {code: {d: blank() for d in days} for code in info}
    prev = {code: 0.0 for code in info}
    dummy = any(x[8] for x in lines)
    for d, code, _, _, oid, status, qty, amount, _ in lines:
        if prev_lo <= d < start and status == "paid":
            prev[code] += amount
        if not (start <= d <= end):
            continue
        b = cur[code][d]
        if status == "paid":
            b["orders"].add(oid)
            b["units"] += qty
            b["revenue"] += amount
        elif status == "refunded":
            b["refunds"].add(oid)
    rows = []
    daily = {d: {"date": d.isoformat(), "visits": None, "orders": 0, "units": 0, "revenue": 0.0} for d in days}
    for code, c in info.items():
        cd, t = [], {"orders": 0, "units": 0, "revenue": 0.0, "refunds": 0}
        for d in days:
            b = cur[code][d]
            o, rev = len(b["orders"]), round(b["revenue"], 2)
            cd.append({"date": d.isoformat(), "visits": None, "orders": o, "revenue": rev})
            t["orders"] += o
            t["units"] += b["units"]
            t["revenue"] += b["revenue"]
            t["refunds"] += len(b["refunds"])
            dd = daily[d]
            dd["orders"] += o
            dd["units"] += b["units"]
            dd["revenue"] += b["revenue"]
        rows.append({"name": c["name"], "code": code, "platform": c["platform"], "visits": c["visits"],
                     "orders": t["orders"], "units": t["units"], "revenue": round(t["revenue"], 2), "refunds": t["refunds"],
                     "conversion": _pct(t["orders"], c["visits"]), "daily": cd,
                     "prevRevenue": round(prev[code], 2), "change": _change(t["revenue"], prev[code])})
    rows.sort(key=lambda r: (-r["revenue"], r["name"]))
    totals = {k: sum(r[k] for r in rows) for k in ("visits", "orders", "units", "refunds")}
    totals["revenue"] = round(sum(r["revenue"] for r in rows), 2)
    totals["conversion"] = _pct(totals["orders"], totals["visits"])
    totals["prevRevenue"] = round(sum(prev.values()), 2)
    totals["change"] = _change(totals["revenue"], totals["prevRevenue"])
    for dd in daily.values():
        dd["revenue"] = round(dd["revenue"], 2)
    return {"dummy": dummy, "source": "shop", "start": start.isoformat(), "end": end.isoformat(),
            "range": {"min": lo.isoformat(), "max": hi.isoformat()}, "unitPrice": None, "currency": "USD",
            "creators": rows, "daily": [daily[d] for d in days], "totals": totals, "hasVisits": bool(creator_rows),
            "uploadedAt": uploaded_at,
            "note": "시연 사이트 관리자 CSV 기준 (paid 주문만 매출 · 접속량은 전체 기간 누적)"}
