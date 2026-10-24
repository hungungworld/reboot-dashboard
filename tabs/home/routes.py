"""홈 · 데일리 브리핑 API (담당: 이현경).

  GET    /api/home/news              저장된 뉴스 (구글 뉴스를 부르지 않음) — 기사 · AI 한국어 요약 · 급증 시그널 · 수집 상태
  POST   /api/home/news/collect      지금 수집 (뒤에서 실행, 바로 응답) → 화면이 /news/status로 끝났는지 확인
  GET    /api/home/news/status       수집 중인지 · 마지막 수집 결과
  GET    /api/home/todos             이번 주 To-Do (?week=YYYY-MM-DD 그 주 월요일)
  POST   /api/home/todos/generate    {auto, context} → AI(키 있을 때) 또는 규칙으로 생성
  POST   /api/home/todos             {title, reason} 직접 추가
  PATCH  /api/home/todos/<id>        {done, title, reason}
  DELETE /api/home/todos/<id>
하루 1회 작업: 뉴스 수집 → 이번 주 To-Do가 없으면 자동 생성 (POST /api/jobs/daily)
"""
from datetime import date

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user

from server import jobs
from server.extensions import db
from server.models import utcnow
from server.security import ApiError, clip, json_body
from . import news, todos
from .models import HomeTodo

bp = Blueprint("home", __name__, url_prefix="/api/home")


def _who():
    return current_user.name or current_user.email.split("@")[0]


# ───────── 뉴스 ─────────

@bp.get("/news")
def news_get():
    return jsonify(news.payload())


@bp.get("/news/status")
def news_status():
    run = news.running_run()
    latest = run or news.HomeNewsRun.query.order_by(news.HomeNewsRun.id.desc()).first()
    return jsonify(running=run is not None, lastRun=latest.to_dict() if latest else None)


@bp.post("/news/collect")
def news_collect():
    if news.running_run() is not None or jobs.is_running("home-news-collect"):
        raise ApiError("이미 수집 중입니다. 끝나면 화면이 바뀝니다 (보통 2~5분).", 409)
    run = news.start_run("manual", _who())
    if jobs.run_background(current_app._get_current_object(), "home-news", news.collect,
                           run_id=run.id, user_name=_who()) is None:
        # 확인과 시작 사이에 다른 요청이 먼저 시작한 경우 → 이 실행 기록은 닫음
        news._finish_failed(run, "이미 수집 중이라 건너뜀")
        raise ApiError("이미 수집 중입니다. 끝나면 화면이 바뀝니다 (보통 2~5분).", 409)
    return jsonify(started=True, runId=run.id), 202


@jobs.daily("home-news", "홈 데일리 브리핑: 미국 주류 업계 뉴스 수집(구글 뉴스) · AI 요약 → 이번 주 To-Do 자동 생성")
def daily_briefing():
    news.collect(trigger="daily", user_name="시스템")
    todos.generate({}, auto=True, user="시스템")


# ───────── To-Do ─────────

def _todo(tid):
    t = db.session.get(HomeTodo, tid)
    if t is None:
        raise ApiError("없는 할 일입니다.", 404)
    return t


@bp.get("/todos")
def todos_get():
    ws = None
    if request.args.get("week"):
        try:
            ws = todos.week_start(date.fromisoformat(request.args["week"][:10]))
        except ValueError:
            raise ApiError("week는 YYYY-MM-DD 형식이어야 합니다.")
    return jsonify(todos.week_payload(ws))


@bp.post("/todos/generate")
def todos_generate():
    data = json_body(max_bytes=64 * 1024)
    return jsonify(todos.generate(data.get("context"), auto=bool(data.get("auto")), user=_who()))


@bp.post("/todos")
def todos_add():
    data = json_body()
    title = clip(data.get("title"), 200).strip()
    if not title:
        raise ApiError("할 일을 입력하세요.")
    ws = todos.week_start()
    top = db.session.query(db.func.max(HomeTodo.sort)).filter(HomeTodo.week_start == ws).scalar() or 0
    src = str(data.get("source") or "home")
    t = HomeTodo(week_start=ws, title=title, reason=clip(data.get("reason"), 500).strip() or "직접 추가",
                 source=src if src in todos.SOURCES else "home", origin="manual", sort=top + 1, created_by=_who())
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@bp.patch("/todos/<int:tid>")
def todos_update(tid):
    t = _todo(tid)
    data = json_body()
    if "title" in data:
        title = clip(data.get("title"), 200).strip()
        if not title:
            raise ApiError("할 일을 입력하세요.")
        t.title = title
    if "reason" in data:
        t.reason = clip(data.get("reason"), 500).strip()
    if "done" in data:
        done = bool(data.get("done"))
        if done != t.done:
            t.done = done
            t.done_at = utcnow() if done else None
            t.done_by = _who() if done else ""
    db.session.commit()
    return jsonify(t.to_dict())


@bp.delete("/todos/<int:tid>")
def todos_delete(tid):
    t = _todo(tid)
    db.session.delete(t)
    db.session.commit()
    return jsonify(ok=True)
