"""시즌별 프로모션 제안 (담당: 이현경) — 가격 위치 화면 '1회분 단가 한눈에' 아래 카드.

- 숫자(1회분 단가 최저 · 보통 · 최고 · 알디콤 위치)와 다가오는 시즌은 서버가 셈 → AI는 시즌마다 프로모션 문장만 씀
- 키가 없으면 만들지 않음 (화면은 안내만)
- 저장: insights_kv의 promo_summary 한 줄 → 이 기능을 지울 때는 이 파일 · routes.py '시즌 프로모션' 묶음 · 화면 카드만 지우면 됨
"""
from datetime import timedelta

from server.catalog import service as catalog
from server.models import iso, utcnow
from . import ai as insights_ai
from . import service
from .models import kv_get, kv_set

KEY = "promo_summary"
HORIZON_DAYS = 120     # 이 기간 안에 시작하는 시즌만
MAX_SEASONS = 4


def _median(vals):
    n = len(vals)
    return round(vals[(n - 1) // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2, 2)


def price_facts():
    """1회분 단가 요약 (회분을 아는 제품만, 화면 '1회분 단가 한눈에'와 같은 기준). 제품이 없으면 None."""
    now, _prev, _info = service.snapshots()
    priced = [x for x in now if x["perServing"] is not None and x["servingsSource"] != "default"]
    if not priced:
        return None
    vals = sorted(x["perServing"] for x in priced)
    own = sorted((x for x in priced if x["own"]), key=lambda x: x["perServing"])
    rivals = sorted((x for x in priced if not x["own"]), key=lambda x: x["perServing"])[:5]
    return {
        "products": len(priced), "min": round(vals[0], 2), "median": _median(vals), "max": round(vals[-1], 2),
        "own": {"title": own[0]["title"], "perServing": round(own[0]["perServing"], 2), "source": own[0]["sourceLabel"]} if own else None,
        "cheapestRivals": [{"title": x["title"], "perServing": round(x["perServing"], 2), "source": x["sourceLabel"]} for x in rivals],
    }


def upcoming_seasons():
    end = service.today() + timedelta(days=HORIZON_DAYS)
    rows = [s for s in catalog.list_seasons() if s["start"] <= end.isoformat()]
    return [{"name": s["name"], "start": s["start"], "end": s["end"], "dday": s["dday"], "ongoing": s["ongoing"],
             "notes": s["notes"] or ""} for s in rows[:MAX_SEASONS]]


def view():
    return {"summary": kv_get(KEY, {}) or None, "aiReady": insights_ai.ready()}


def make(user):
    """→ (view, 오류 문장 또는 None)"""
    if not insights_ai.ready():
        return view(), "OpenAI 키가 없어 만들 수 없어요 (설정 › 연결)."
    prices, seasons = price_facts(), upcoming_seasons()
    if not prices:
        return view(), "회분을 아는 진열대 제품이 없어 만들 수 없어요."
    if not seasons:
        return view(), f"{HORIZON_DAYS}일 안에 시작하는 시즌이 없어요 (설정 › 시즌)."
    items = insights_ai.season_promos({"prices": prices, "seasons": seasons})
    by_name = {s["name"]: s for s in seasons}
    rows = [dict(i, start=by_name[i["season"]]["start"], dday=by_name[i["season"]]["dday"]) for i in items if i["season"] in by_name]
    if not rows:
        return view(), "AI가 제안을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요."
    kv_set(KEY, {"items": rows, "prices": prices, "createdAt": iso(utcnow()), "createdBy": user}, user)
    return view(), None
