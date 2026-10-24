"""컴플라이언스 API (담당: 소준희). 예전 server/app.py와 같은 주소·입력·출력입니다.

  POST /api/compliance/ai-review        {text, channel, category, rule, rules, product?} → AI 2차 판정 (참고용)
  POST /api/compliance/ko               {items:[{id, title, summary, source}]} → 한글 제목·한 줄 요약 (최대 30건)
  POST /api/compliance/translate        {text} → 한국어 광고 문구를 영어로 (뜻 그대로 · 참고용) {text, note_ko, model}
  POST /api/compliance/monitor/refresh  규제 모니터링 수집 → monitor-data.js 저장 + 결과 반환
하루 1회 작업: 규제 모니터링 수집 (POST /api/jobs/daily)
"""
from flask import Blueprint, current_app, jsonify

from server import jobs, worklog
from server.security import ApiError, clip, json_body

bp = Blueprint("compliance", __name__, url_prefix="/api/compliance")


@bp.post("/ai-review")
def ai_review():
    from . import ai_review as ai
    data = json_body(max_bytes=64 * 1024)
    text = data.get("text", "")
    try:
        out = ai.review(text, data.get("channel", ""), data.get("category", "FOOD"),
                        data.get("rule"), data.get("rules"), clip(data.get("product"), 300))
    except ai.ReviewError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "AI 프롬프트", "AI 2차 판정", detail={
        "model": out.get("model"), "verdict": out.get("verdict"), "channel": clip(data.get("channel"), 60),
        "copy": clip(text, 400), "summary": clip(out.get("summary"), 300)})
    return jsonify(out)


@bp.post("/ko")
def ko_items():
    from . import ko_summary
    data = json_body(max_bytes=64 * 1024)
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise ApiError("요약할 항목이 없습니다.")
    items = [i for i in items[:30] if isinstance(i, dict)]
    try:
        ko = ko_summary.summarize([{"source": clip(i.get("source"), 80), "id": clip(i.get("id"), 80),
                                    "title": clip(i.get("title"), 300), "summary": clip(i.get("summary"), 500)} for i in items])
    except ko_summary.KoError as e:
        raise ApiError(str(e), 502)
    return jsonify(items=[dict(id=clip(i.get("id"), 80), **(k or {})) for i, k in zip(items, ko)])


@bp.post("/translate")
def translate_to_english():
    from . import translate
    data = json_body(max_bytes=64 * 1024)
    text = data.get("text", "")
    try:
        out = translate.to_english(text)
    except translate.TranslateError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "AI 프롬프트", "한→영 번역", detail={
        "model": out.get("model"), "ko": clip(text, 400), "en": clip(out.get("text"), 400)})
    return jsonify(out)


def _collect_and_save():
    from . import refresh
    data = refresh.collect()
    refresh.write(data)
    worklog.add("compliance", "수집", "규제 모니터링 수집", status="실패" if not any(s["items"] for s in data["sources"]) and data["errors"] else "완료",
                detail={"counts": {s["id"]: len(s["items"]) for s in data["sources"]},
                        "errors": [f'{e["label"]}: {e["error"]}' for e in data["errors"]]})
    return data


@bp.post("/monitor/refresh")
def monitor_refresh():
    try:
        with jobs.file_lock("compliance-monitor", stale_seconds=1800):
            return jsonify(_collect_and_save())
    except jobs.Busy:
        raise ApiError("이미 수집 중입니다. 잠시 뒤 다시 확인하세요.", 409)


@jobs.daily("compliance-monitor", "규제 모니터링 수집 (openFDA · Regulations.gov · CourtListener)")
def daily_monitor():
    current_app.logger.info("규제 모니터링 수집 시작")
    _collect_and_save()
