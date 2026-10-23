"""시장 · 고객 인사이트 API (담당: 이현경) — 3번째 대시보드.

화면
  GET   /api/insights/weekly                   주간 리뷰 (이번 주 액션 · 진열대 변화 · 새 리뷰 · 다가오는 시즌)
  GET   /api/insights/monthly?month=YYYY-MM    월간 리뷰 (1~7일에는 지난달)
  GET   /api/insights/data/<탭>                 shelf · competitors · reviews · audience · trends
수정 · 올리기
  PATCH /api/insights/shelf/<id>               진열대 한 줄 고치기 {price, in_stock, own}
  PUT   /api/insights/servings                 회분 수 고치기 {key, servings|null} (모든 주차에 적용)
  PUT   /api/insights/watch                    주시 브랜드 {brand, watch}
  POST  /api/insights/reviews/upload           Weee! 리뷰 CSV {csv}
  POST  /api/insights/trends/upload            Google Trends CSV {csv} (SerpApi 키가 없을 때)
데이터 업데이트
  GET   /api/insights/update/plan              항목 · 필요한 키 · 예상 비용 · 이번 달 쓴 양
  POST  /api/insights/update                   {items:[…]} → 뒤에서 실행
  GET   /api/insights/update/status            진행 상황
내려받기
  GET   /api/insights/report/weekly.docx · /report/monthly.docx · /export.xlsx · /templates/weee-reviews.csv
다른 파트 공개 (REBOOT.use('insights'))
  GET   /api/insights/trends                   {keywords:[{keyword, points:[{date, value}]}], updatedAt}
  GET   /api/insights/personas                 [{name, oneLine, needs, message}]
"""
import csv
import io
import re

from flask import Blueprint, Response, jsonify, request, send_file
from flask_login import current_user

from .. import worklog
from ..config import ROOT
from ..extensions import db
from ..models import utcnow
from ..security import ApiError, clip, json_body
from . import reports, service, store, trends, update
from .models import ServingOverride, ShelfItem, kv_get, kv_set
from .util import clean, review_month, week_key

bp = Blueprint("insights", __name__, url_prefix="/api/insights")

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
TEMPLATE = ROOT / "data" / "insights" / "weee_reviews_template.csv"
CSV_HEAD = {
    "product": ("product", "product_title", "제품", "상품", "상품명", "제품명"),
    "brand": ("brand", "브랜드"),
    "rating": ("rating", "stars", "별점", "평점"),
    "date": ("date", "날짜", "작성일"),
    "title": ("title", "제목"),
    "text": ("text", "review", "body", "내용", "리뷰", "본문"),
    "own": ("own", "자사"),
}
YES = {"y", "yes", "true", "1", "예", "o", "자사"}
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _who():
    return current_user.name or current_user.email.split("@")[0]


def _month_arg():
    m = request.args.get("month", "").strip()
    if m and not MONTH_RE.match(m):
        raise ApiError("월은 YYYY-MM 형식으로 주세요.")
    return m or None


# ───────── 화면 ─────────

@bp.get("/weekly")
def weekly():
    return jsonify(service.weekly_view())


@bp.get("/monthly")
def monthly():
    return jsonify(service.monthly_view(_month_arg()))


@bp.get("/data/<tab>")
def data_tab(tab):
    if tab == "shelf":
        return jsonify(service.shelf_view())
    if tab == "competitors":
        return jsonify(service.competitors_view())
    if tab == "reviews":
        return jsonify(service.reviews_view())
    if tab == "audience":
        return jsonify(service.audience_view(_month_arg()))
    if tab == "trends":
        return jsonify(service.trends_view())
    raise ApiError("없는 데이터 탭입니다.", 404)


# ───────── 수정 · 올리기 ─────────

@bp.patch("/shelf/<int:row_id>")
def shelf_edit(row_id):
    row = db.session.get(ShelfItem, row_id)
    if row is None:
        raise ApiError("없는 진열대 항목입니다.", 404)
    data = json_body()
    changed = []
    if "price" in data:
        v = data["price"]
        if v in (None, ""):
            row.price = None
        else:
            try:
                v = round(float(v), 2)
            except (TypeError, ValueError):
                raise ApiError("가격은 숫자(달러)로 입력하세요.")
            if not 0 <= v <= 10000:
                raise ApiError("가격은 0~10,000달러 사이로 입력하세요.")
            row.price = v
        row.price_text = f"${row.price:.2f}" if row.price is not None else ""
        changed.append("price")
    if "in_stock" in data:
        v = data["in_stock"]
        if v not in (True, False, None):
            raise ApiError("재고는 있음 · 품절 · 모름 중 하나입니다.")
        row.in_stock = v
        changed.append("in_stock")
    if "own" in data:
        ovr = kv_get("own_overrides", {})
        ovr[row.key] = bool(data["own"])
        kv_set("own_overrides", ovr, _who())
        changed.append("own")
    if not changed:
        raise ApiError("고칠 값이 없습니다.")
    row.edited_by = _who()
    db.session.commit()
    worklog.add("insights", "기타", f"진열대 값 수정: {row.title[:60]}", detail={"fields": changed, "week": row.week})
    return jsonify(service.shelf_dict(row))


@bp.put("/servings")
def servings_edit():
    data = json_body()
    key = clip(data.get("key"), 200)
    if not key or db.session.query(ShelfItem.id).filter_by(key=key).first() is None:
        raise ApiError("없는 상품입니다.", 404)
    v = data.get("servings")
    row = db.session.get(ServingOverride, key)
    if v in (None, ""):
        if row:
            db.session.delete(row)
        db.session.commit()
        return jsonify(key=key, servings=None)
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ApiError("회분 수는 숫자로 입력하세요.")
    if not 1 <= n <= 500:
        raise ApiError("회분 수는 1~500 사이로 입력하세요.")
    row = row or ServingOverride(key=key)
    row.servings, row.updated_by, row.updated_at = n, _who(), utcnow()
    db.session.add(row)
    db.session.commit()
    title = (ShelfItem.query.filter_by(key=key).order_by(ShelfItem.id.desc()).first() or ShelfItem(title=key)).title
    worklog.add("insights", "기타", f"회분 수 수정: {title[:60]} → {n}회분")
    return jsonify(key=key, servings=n)


@bp.put("/watch")
def watch_edit():
    data = json_body()
    brand = clean(data.get("brand"), 60)
    if not brand:
        raise ApiError("브랜드 이름이 없습니다.")
    watch = [b for b in kv_get("watch", []) if b.lower() != brand.lower()]
    on = bool(data.get("watch", True))
    if on:
        if len(watch) >= 12:
            raise ApiError("주시 브랜드는 12개까지 고를 수 있어요 (5~6개 추천).")
        watch.append(brand)
    kv_set("watch", watch, _who())
    worklog.add("insights", "승인 · 선정", f"주시 브랜드 {'선정' if on else '해제'}: {brand}", approval=_who())
    return jsonify(watch=watch)


def _csv_rows(text):
    reader = csv.reader(io.StringIO(text.replace("﻿", "")))
    try:
        header = [h.strip().lower() for h in next(reader)]
    except StopIteration:
        raise ApiError("CSV가 비어 있어요.")
    idx = {}
    for field, names in CSV_HEAD.items():
        for i, h in enumerate(header):
            if h in names:
                idx[field] = i
                break
    if "text" not in idx:
        raise ApiError("CSV 첫 줄에 리뷰 내용 열(text 또는 내용)이 있어야 해요. 양식을 내려받아 쓰세요.")
    rows = []
    for n, r in enumerate(reader, start=2):
        if not any(c.strip() for c in r):
            continue
        get = lambda f: r[idx[f]].strip() if f in idx and idx[f] < len(r) else ""  # noqa: E731
        rating = None
        if get("rating"):
            try:
                rating = float(get("rating"))
            except ValueError:
                raise ApiError(f"{n}번째 줄: 별점은 1~5 숫자로 입력하세요.")
            if not 1 <= rating <= 5:
                raise ApiError(f"{n}번째 줄: 별점은 1~5 사이예요.")
        product = get("product")
        rows.append({"source": "weee", "product_key": "weee-csv:" + product.lower()[:150], "product_title": product,
                     "brand": get("brand"), "rating": rating, "date_text": get("date"), "title": get("title"),
                     "text": get("text"), "own": get("own").lower() in YES})
        if len(rows) > 2000:
            raise ApiError("한 번에 2,000줄까지 올릴 수 있어요.")
    if not rows:
        raise ApiError("올릴 리뷰가 없어요.")
    return rows


@bp.post("/reviews/upload")
def reviews_upload():
    data = json_body(max_bytes=2 * 1024 * 1024)
    rows = _csv_rows(str(data.get("csv", "")))
    added = store.save_reviews(rows, week_key(service.today()))
    worklog.add("insights", "수집", "Weee! 리뷰 CSV 올리기", detail={"rows": len(rows), "added": added})
    return jsonify(ok=True, rows=len(rows), added=added)


@bp.post("/trends/upload")
def trends_upload():
    data = json_body(max_bytes=2 * 1024 * 1024)
    try:
        parsed = trends.parse_csv(str(data.get("csv", "")))
    except ValueError as e:
        raise ApiError(str(e))
    week = week_key(service.today())
    for kw, pts in parsed.items():
        trends.save(kw, week, "csv", pts)
    worklog.add("insights", "수집", "검색 트렌드 CSV 올리기", detail={"keywords": list(parsed), "points": sum(map(len, parsed.values()))})
    return jsonify(ok=True, keywords=list(parsed))


# ───────── 데이터 업데이트 ─────────

@bp.get("/update/plan")
def update_plan():
    return jsonify(update.plan())


@bp.post("/update")
def update_start():
    data = json_body()
    items = data.get("items")
    if not isinstance(items, list) or not all(isinstance(i, str) for i in items):
        raise ApiError("항목 목록이 올바르지 않습니다.")
    unknown = [i for i in items if i not in update.BY_ID]
    if unknown:
        raise ApiError("없는 항목이 있습니다: " + ", ".join(clip(u, 20) for u in unknown[:3]))
    try:
        run = update.start(items, _who())
    except ValueError as e:
        raise ApiError(str(e))
    except RuntimeError as e:
        raise ApiError(str(e), 409)
    return jsonify(ok=True, runId=run.id), 202


@bp.get("/update/status")
def update_status():
    return jsonify(update.status())


# ───────── 내려받기 ─────────

@bp.get("/report/weekly.docx")
def report_weekly():
    buf, name = reports.weekly_docx()
    return send_file(buf, as_attachment=True, download_name=name, mimetype=DOCX)


@bp.get("/report/monthly.docx")
def report_monthly():
    buf, name = reports.monthly_docx(_month_arg())
    return send_file(buf, as_attachment=True, download_name=name, mimetype=DOCX)


@bp.get("/export.xlsx")
def export_xlsx():
    buf, name = reports.data_xlsx()
    return send_file(buf, as_attachment=True, download_name=name, mimetype=XLSX)


@bp.get("/templates/weee-reviews.csv")
def weee_template():
    text = TEMPLATE.read_text(encoding="utf-8") if TEMPLATE.exists() else "product,brand,rating,date,title,text,own\n"
    return Response("﻿" + text, content_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=reboot-insights-weee-reviews-template.csv"})


# ───────── 다른 파트 공개 ─────────

@bp.get("/trends")
def trends_expose():
    return jsonify(service.trend_expose())


@bp.get("/personas")
def personas_expose():
    return jsonify(service.personas_expose())


@bp.get("/meta")
def meta():
    """화면 머리글용 작은 요약: 오늘 · 볼 주차 · 볼 달."""
    t = service.today()
    return jsonify(today=t.isoformat(), week=week_key(t), month=review_month(t))
