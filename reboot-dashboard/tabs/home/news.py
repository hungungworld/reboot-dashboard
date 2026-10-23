"""미국 주류 업계 뉴스 동향 (README 2장) — 배치 수집 → 저장(URL 중복 제거) → 보도량 급증 → AI 필터링·요약.

- 화면을 열 때는 GDELT를 부르지 않음 (저장된 결과만). 수집은 '지금 수집' 버튼(뒤에서 실행) · 하루 1회 작업
- 쿼리 템플릿: tabs/home/data/queries.json (키워드 묶음 3~5개 + sourcecountry:US sourcelang:english + 노이즈 제외)
- AI(OpenAI 키가 있을 때만): 1) 마케팅과 관련 있는 기사만 고름 2) 제목·도메인 기준 핵심 동향 3~5개 + 원문 링크
- 실패하면 마지막 결과를 그대로 두고 화면에 '업데이트 실패' 표시
"""
import json
from datetime import timedelta

from flask import current_app

from server import envkeys, jobs, worklog
from server.config import ROOT
from server.core.ai import AIError, openai_json, openai_model, openai_ready
from server.extensions import db
from server.models import iso, utcnow
from . import gdelt
from .models import HomeNewsArticle, HomeNewsRun

QUERIES_PATH = ROOT / "tabs" / "home" / "data" / "queries.json"
RETENTION_DAYS = 90
STALE_RUN = timedelta(minutes=30)
MAX_FAILS_IN_ROW = 3  # GDELT가 계속 실패하면 나머지 묶음은 건너뜀 (요청 제한 중에 더 부르지 않게)
AI_MAX_ARTICLES = 90
LIMIT_NOTE = "뉴스 보도 기반 시그널입니다. 판매량·가격·소비자 검색 수요는 반영하지 않습니다."

AI_SYSTEM = """당신은 미국 시장에 진출한 한국 숙취해소 젤리·음료 브랜드 REBOOT(일반 식품)의 마케팅 리서처입니다.
미국 매체 기사 목록(제목 · 도메인 · 날짜 · 키워드 묶음)만 보고, 마케터가 이번 주에 알아야 할 '업계 뉴스 동향'을 정리합니다.

규칙
- 기사 제목과 도메인에 있는 내용만 근거로 씁니다. 본문을 읽은 것처럼 쓰거나, 주어지지 않은 숫자·사실을 만들지 않습니다.
- 1단계(관련성): 마케팅과 관련 있는 기사만 relevant_ids에 넣습니다 — 주류·논알코올·숙취·파티/명절 음주·주류 규제와 라벨·소비 트렌드.
  사건·사고·범죄·주가·인물 가십, 'hangover'를 비유로 쓴 기사(예: economic hangover)는 뺍니다.
- 2단계(요약): 고른 기사로 핵심 동향 3~5개를 한국어로 씁니다. 각 동향에는 근거 기사 id를 1~5개 붙입니다.
- signals(보도량 급증)가 있으면 관련 동향에 '보도가 늘었다'고 반영합니다. 판매·수요가 늘었다고 단정하지 않습니다.
- 숙취 해소 효능을 단정하는 표현을 쓰지 않습니다.

출력: relevant_ids · headline(이번 주를 한 문장으로) · trends[{title(짧게), summary(1~2문장), group(키워드 묶음 id), article_ids}]"""

AI_SCHEMA = {
    "type": "object",
    "properties": {
        "relevant_ids": {"type": "array", "items": {"type": "integer"}},
        "headline": {"type": "string"},
        "trends": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "group": {"type": "string"},
                    "article_ids": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["title", "summary", "group", "article_ids"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["relevant_ids", "headline", "trends"],
    "additionalProperties": False,
}


def _dumps(v):
    return json.dumps(v, ensure_ascii=False)


def _loads(text, default):
    try:
        v = json.loads(text or "")
    except ValueError:
        return default
    return v if isinstance(v, type(default)) else default


# ───────── 쿼리 ─────────

def load_queries():
    cfg = json.loads(QUERIES_PATH.read_text(encoding="utf-8"))
    groups = [g for g in cfg.get("groups", []) if isinstance(g, dict) and g.get("id") and g.get("query")]
    cfg["groups"] = groups
    return cfg


def build_query(cfg, group):
    return " ".join(x for x in (group["query"], cfg.get("exclude", ""), cfg.get("common", "")) if x).strip()


def groups_public(cfg=None):
    try:
        cfg = cfg or load_queries()
    except (OSError, ValueError):
        return []
    return [{"id": g["id"], "label": g.get("label") or g["id"]} for g in cfg["groups"]]


def make_client():
    interval = current_app.config.get("HOME_GDELT_INTERVAL")
    if interval is None:
        try:
            interval = float(envkeys.get("GDELT_REQUEST_INTERVAL_SEC") or gdelt.MIN_INTERVAL)
        except ValueError:
            interval = gdelt.MIN_INTERVAL
        interval = max(gdelt.MIN_INTERVAL, interval)  # 5초보다 짧게는 못 줄임 (GDELT 요청 제한)
    return gdelt.GdeltClient(interval=interval)


# ───────── 저장 ─────────

def store_articles(arts, group_id, run_id):
    """기사 저장 (URL 기준 중복 제거). 새로 넣은 개수를 돌려줌."""
    now = utcnow()
    clean = []
    for a in arts:
        url = str(a.get("url") or "").strip()
        title = gdelt.clean_title(a.get("title"))
        if not url.startswith(("http://", "https://")) or len(url) > 1000 or not title:
            continue
        clean.append((url, title, a))
    urls = list({u for u, _, _ in clean})
    existing = {r.url: r for r in HomeNewsArticle.query.filter(HomeNewsArticle.url.in_(urls)).all()} if urls else {}
    added = 0
    for url, title, a in clean:
        row = existing.get(url)
        if row is not None:
            gs = [g for g in row.groups.split(",") if g]
            if group_id not in gs:
                row.groups = ",".join(gs + [group_id])[:200]
            continue
        row = HomeNewsArticle(url=url, title=title[:500], domain=str(a.get("domain") or "")[:200],
                              seen_at=gdelt.parse_date(a.get("seendate")) or now, group_id=group_id, groups=group_id,
                              language=str(a.get("language") or "")[:40], source_country=str(a.get("sourcecountry") or "")[:60],
                              run_id=run_id, collected_at=now)
        db.session.add(row)
        existing[url] = row
        added += 1
    db.session.commit()
    return added


def prune():
    cut = utcnow() - timedelta(days=RETENTION_DAYS)
    HomeNewsArticle.query.filter(HomeNewsArticle.seen_at < cut).delete()
    db.session.commit()


def recent_articles(days=7, limit=AI_MAX_ARTICLES):
    cut = utcnow() - timedelta(days=days)
    return (HomeNewsArticle.query.filter(HomeNewsArticle.seen_at >= cut)
            .order_by(HomeNewsArticle.seen_at.desc()).limit(limit).all())


# ───────── AI ─────────

def summarize(articles, signals, cfg):
    """AI 관련성 필터링 + 요약 → (summary dict, 관련 기사 id 집합)."""
    ids = {a.id for a in articles}
    group_ids = {g["id"] for g in cfg["groups"]}
    data = {
        "articles": [{"id": a.id, "title": a.title, "domain": a.domain, "date": a.seen_at.strftime("%Y-%m-%d"),
                      "group": a.group_id} for a in articles],
        "groups": groups_public(cfg),
        "signals": [{"group": s["group"], "label": s["label"], "changePct": s.get("changePct"), "surge": s.get("surge")}
                    for s in signals],
    }
    raw = openai_json(AI_SYSTEM, data, schema=AI_SCHEMA, schema_name="news_trends", max_tokens=2500,
                      part="home", action="미국 주류 업계 뉴스 필터링·요약")
    relevant = {i for i in (raw.get("relevant_ids") or []) if isinstance(i, int) and i in ids}
    trends = []
    for t in (raw.get("trends") or [])[:5]:
        if not isinstance(t, dict):
            continue
        aids = []
        for i in t.get("article_ids") or []:
            if isinstance(i, int) and i in ids and i not in aids:
                aids.append(i)
        title = str(t.get("title") or "").strip()[:120]
        if not aids or not title:
            continue  # 근거 기사가 없는 동향은 버림
        relevant.update(aids)
        trends.append({"title": title, "summary": str(t.get("summary") or "").strip()[:400],
                       "group": t.get("group") if t.get("group") in group_ids else "", "article_ids": aids[:5]})
    return {"headline": str(raw.get("headline") or "").strip()[:200], "trends": trends,
            "relevant_ids": sorted(relevant)}, relevant


# ───────── 수집 ─────────

def start_run(trigger, user_name):
    run = HomeNewsRun(trigger=trigger, user_name=str(user_name or "")[:100], status="running")
    db.session.add(run)
    db.session.commit()
    return run


def running_run():
    """30분 안에 시작해 아직 끝나지 않은 수집 (서버가 중간에 꺼지면 30분 뒤 실패로 봄)."""
    return (HomeNewsRun.query.filter(HomeNewsRun.status == "running", HomeNewsRun.started_at >= utcnow() - STALE_RUN)
            .order_by(HomeNewsRun.id.desc()).first())


def _finish_failed(run, message):
    run.status = "failed"
    run.errors = _dumps([message])
    run.ai_status = "skipped"
    run.finished_at = utcnow()
    db.session.commit()


def collect(run_id=None, trigger="daily", user_name="시스템", client=None):
    """한 번 수집 (뒤에서 실행). 같은 시간에는 하나만 — 이미 수집 중이면 기록 없이 건너뜀."""
    try:
        with jobs.file_lock("home-news-collect", stale_seconds=1800):
            run = db.session.get(HomeNewsRun, run_id) if run_id else start_run(trigger, user_name)
            rid = run.id
            try:
                return _collect(run, client or make_client(), user_name)
            except Exception:
                db.session.rollback()
                current_app.logger.exception("뉴스 수집 실패")
                run = db.session.get(HomeNewsRun, rid)
                _finish_failed(run, "수집 중 서버 오류")
                worklog.add("home", "수집", "미국 주류 업계 뉴스 수집 (GDELT)", status="실패",
                            detail={"error": "서버 오류"}, user_name=user_name)
                return run
    except jobs.Busy:
        if run_id:  # 화면에서 미리 만든 '수집 중' 기록은 지움 (실패로 남기지 않음)
            row = db.session.get(HomeNewsRun, run_id)
            if row is not None and row.status == "running":
                db.session.delete(row)
                db.session.commit()
        return None


def _collect(run, client, user_name):
    cfg = load_queries()
    counts, errors, signals = {}, [], []
    ok_groups, fails = 0, 0
    for g in cfg["groups"]:
        label = g.get("label") or g["id"]
        if fails >= MAX_FAILS_IN_ROW:
            counts[g["id"]] = {"found": 0, "new": 0, "error": "건너뜀"}
            errors.append(f"{label}: GDELT 응답이 연달아 실패해 건너뜀")
            continue
        q = build_query(cfg, g)
        try:
            arts = client.articles(q, cfg.get("articleTimespan", "7d"), cfg.get("maxrecords", 75))
            counts[g["id"]] = {"found": len(arts), "new": store_articles(arts, g["id"], run.id)}
            ok_groups += 1
            fails = 0
        except gdelt.GdeltError as e:
            counts[g["id"]] = {"found": 0, "new": 0, "error": str(e)}
            errors.append(f"{label} 기사: {e}")
            fails += 1
        if fails >= MAX_FAILS_IN_ROW:
            continue
        try:
            sig = gdelt.surge(client.timeline(q, cfg.get("timelineTimespan", "14d")), float(cfg.get("surgeRatio", 1.5)))
            if sig:
                signals.append(dict(sig, group=g["id"], label=label))
            fails = 0
        except gdelt.GdeltError as e:
            errors.append(f"{label} 보도량: {e}")
            fails += 1
    prune()
    status = "failed" if ok_groups == 0 else ("partial" if errors else "ok")
    run.counts, run.errors, run.signals = _dumps(counts), _dumps(errors[:20]), _dumps(signals)
    # AI 필터링·요약 (키가 있을 때만)
    if status == "failed":
        run.ai_status = "skipped"
    elif not openai_ready():
        run.ai_status = "no_key"
    else:
        arts = recent_articles()
        if not arts:
            run.ai_status, run.ai_error = "skipped", "요약할 최근 기사가 없음"
        else:
            try:
                summary, relevant = summarize(arts, signals, cfg)
                for a in arts:
                    a.relevant = a.id in relevant
                run.summary, run.ai_status, run.model = _dumps(summary), "ok", openai_model()[:80]
            except AIError as e:
                run.ai_status, run.ai_error = "error", str(e)[:300]
    run.status = status
    run.finished_at = utcnow()
    db.session.commit()
    new = sum(c.get("new", 0) for c in counts.values())
    worklog.add("home", "수집", "미국 주류 업계 뉴스 수집 (GDELT)", status="실패" if status == "failed" else "완료",
                detail={"trigger": run.trigger, "new": new, "groups": {k: v.get("found", 0) for k, v in counts.items()},
                        "errors": errors[:10], "requests": client.calls, "rateLimited": client.rate_limited, "ai": run.ai_status,
                        "surges": [s["label"] for s in signals if s.get("surge")]}, user_name=user_name)
    return run


# ───────── 화면용 ─────────

def _article_map(ids):
    if not ids:
        return {}
    return {a.id: a for a in HomeNewsArticle.query.filter(HomeNewsArticle.id.in_(list(ids))).all()}


def payload():
    """GET /api/home/news — 저장된 결과만 (GDELT를 부르지 않음)."""
    cfg_groups = groups_public()
    labels = {g["id"]: g["label"] for g in cfg_groups}
    latest = HomeNewsRun.query.order_by(HomeNewsRun.id.desc()).first()
    running = running_run()
    last_ok = HomeNewsRun.query.filter(HomeNewsRun.status.in_(("ok", "partial"))).order_by(HomeNewsRun.id.desc()).first()
    ai_run = HomeNewsRun.query.filter_by(ai_status="ok").order_by(HomeNewsRun.id.desc()).first()
    ai_ready = openai_ready()

    if running:
        status = "running"
    elif latest is None:
        status = "never"
    elif latest.status == "running":
        status = "failed"  # 30분 넘게 끝나지 않음 → 실패로 봄
    else:
        status = latest.status

    ai = None
    if ai_run and ai_ready:
        s = _loads(ai_run.summary, {})
        amap = _article_map({i for t in s.get("trends", []) for i in t.get("article_ids", [])})
        trends = []
        for t in s.get("trends", []):
            arts = [amap[i].to_dict() for i in t.get("article_ids", []) if i in amap]
            if arts:
                trends.append({"title": t.get("title", ""), "summary": t.get("summary", ""), "group": t.get("group", ""),
                               "groupLabel": labels.get(t.get("group", ""), ""), "articles": arts})
        ai = {"headline": s.get("headline", ""), "trends": trends, "at": iso(ai_run.finished_at), "model": ai_run.model}

    q = HomeNewsArticle.query.filter(HomeNewsArticle.seen_at >= utcnow() - timedelta(days=7))
    total7 = q.count()
    if ai:
        arts = q.filter(HomeNewsArticle.relevant.is_(True)).order_by(HomeNewsArticle.seen_at.desc()).limit(8).all()
    else:
        arts = q.order_by(HomeNewsArticle.seen_at.desc()).limit(8).all()
    if not arts and not ai:
        arts = HomeNewsArticle.query.order_by(HomeNewsArticle.seen_at.desc()).limit(8).all()

    signals = sorted(_loads(last_ok.signals, []) if last_ok else [],
                     key=lambda s: (not s.get("surge"), -(s.get("changePct") or -1e9)))
    return {
        "status": status, "running": bool(running), "aiReady": ai_ready,
        "lastRun": latest.to_dict() if latest else None,
        "lastSuccessAt": iso(last_ok.finished_at) if last_ok else None,
        "aiStatus": (latest.ai_status if latest and latest.status != "running" else (last_ok.ai_status if last_ok else "")),
        "aiError": latest.ai_error if latest and latest.ai_status == "error" else "",
        "ai": ai,
        "signals": [dict(s, label=labels.get(s.get("group"), s.get("label", ""))) for s in signals],
        "articles": [dict(a.to_dict(), groupLabel=labels.get(a.group_id, "")) for a in arts],
        "articleCount7d": total7,
        "groups": cfg_groups,
        "limitNote": LIMIT_NOTE,
    }


def brief():
    """To-Do 생성에 넘길 뉴스 요약 (헤드라인 · 동향 제목 · 급증 시그널)."""
    out = {"headline": "", "trends": [], "signals": []}
    ai_run = HomeNewsRun.query.filter_by(ai_status="ok").order_by(HomeNewsRun.id.desc()).first()
    if ai_run:
        s = _loads(ai_run.summary, {})
        out["headline"] = s.get("headline", "")
        out["trends"] = [{"title": t.get("title", ""), "summary": t.get("summary", "")} for t in s.get("trends", [])][:5]
    last_ok = HomeNewsRun.query.filter(HomeNewsRun.status.in_(("ok", "partial"))).order_by(HomeNewsRun.id.desc()).first()
    if last_ok:
        out["signals"] = [{"label": s.get("label", ""), "changePct": s.get("changePct"), "surge": bool(s.get("surge"))}
                          for s in _loads(last_ok.signals, [])]
    return out
