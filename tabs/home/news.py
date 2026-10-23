"""미국 주류 업계 뉴스 (README 2장) — 구글 뉴스 RSS 수집 → 저장(URL·제목 중복 제거) → 보도 급증 → AI 필터링·기사별 한국어 요약.

- 화면을 열 때는 구글 뉴스를 부르지 않음 (저장된 결과만). 수집은 '지금 수집' 버튼(뒤에서 실행) · 하루 1회 작업
- 검색어: tabs/home/data/queries.json (검색어 5개 + 노이즈 제외 단어)
- AI(OpenAI 키가 있을 때만): 1) 마케팅과 관련 있는 기사만 고름 2) 최대 8개를 한국어 제목·한 줄 요약·주제로 + 한 줄 정리
  제목만 보고 씀 (본문 추측 금지)
- 실패하면 마지막 결과를 그대로 두고 화면에 '업데이트 실패' 표시
"""
import json
from datetime import timedelta

from flask import current_app

from server import jobs, worklog
from server.config import ROOT
from server.core.ai import AIError, openai_json, openai_model, openai_ready
from server.extensions import db
from server.models import iso, utcnow
from . import rss
from .models import HomeNewsArticle, HomeNewsRun

QUERIES_PATH = ROOT / "tabs" / "home" / "data" / "queries.json"
RETENTION_DAYS = 90
STALE_RUN = timedelta(minutes=30)
MAX_FAILS_IN_ROW = 3  # 구글 뉴스가 계속 실패하면 나머지 검색어는 건너뜀
AI_MAX_ARTICLES = 150
MAX_ITEMS = 8
TOPICS = ("판매 동향", "소비 트렌드", "규제·정책", "경쟁·신제품", "업계 일반")
LIMIT_NOTE = "구글 뉴스 제목 기준 요약이라 기사 본문은 보지 않았어요. 판매량·가격은 인사이트 탭에서 봅니다."

AI_SYSTEM = """당신은 미국 시장에 진출한 한국 숙취해소 젤리·음료 브랜드 REBOOT(일반 식품)의 마케팅 리서처입니다.
미국 매체 기사 목록(제목 · 매체 · 날짜 · 검색어 묶음)만 보고, 마케터가 이번 주에 알아야 할 업계 뉴스를 고르고 한국어로 정리합니다.

규칙
- 기사 제목과 매체에 있는 내용만 근거로 씁니다. 본문을 읽은 것처럼 쓰거나, 주어지지 않은 숫자·사실을 만들지 않습니다.
- 고를 기사: 미국 주류 판매·소비 변화, 무알코올·절주 트렌드, 숙취 제품·보조제, 주류·광고 규제, 경쟁 제품·신제품.
- 버릴 기사: 'hangover'를 비유로 쓴 기사(예: AI hangover, tariff hangover, DOGE hangover, post-election hangover — 술과 무관하면 모두 뺌),
  음주 사고·범죄, 주가·인물 가십, 무관한 산업.
- relevant_ids: 관련 있는 기사 id 전부.
- articles: 그중 마케터에게 가장 중요한 기사 최대 8개. 같은 소식은 하나만.
  title_ko(한국어 제목 30자 안팎) · summary_ko(제목에서 알 수 있는 사실 한 줄) · topic(판매 동향 / 소비 트렌드 / 규제·정책 / 경쟁·신제품 / 업계 일반)
- headline: 전체를 한국어 2문장 이내로 — 무엇이 일어나고 REBOOT 마케팅에 무슨 의미인지.
- signals(보도 급증)가 있으면 '보도가 늘었다'고만 쓰고, 판매·수요가 늘었다고 단정하지 않습니다.
- 숙취 해소 효능을 단정하는 표현(cure · prevent · treat)을 쓰지 않습니다."""

AI_SCHEMA = {
    "type": "object",
    "properties": {
        "relevant_ids": {"type": "array", "items": {"type": "integer"}},
        "headline": {"type": "string"},
        "articles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "title_ko": {"type": "string"},
                    "summary_ko": {"type": "string"},
                    "topic": {"type": "string", "enum": list(TOPICS)},
                },
                "required": ["id", "title_ko", "summary_ko", "topic"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["relevant_ids", "headline", "articles"],
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


# ───────── 검색어 ─────────

def load_queries():
    cfg = json.loads(QUERIES_PATH.read_text(encoding="utf-8"))
    groups = [g for g in cfg.get("groups", []) if isinstance(g, dict) and g.get("id") and g.get("query")]
    cfg["groups"] = groups
    return cfg


def build_query(cfg, group):
    return str(group["query"]).strip()


def groups_public(cfg=None):
    try:
        cfg = cfg or load_queries()
    except (OSError, ValueError):
        return []
    return [{"id": g["id"], "label": g.get("label") or g["id"]} for g in cfg["groups"]]


def make_client():
    interval = current_app.config.get("HOME_RSS_INTERVAL")
    if interval is None:
        interval = rss.MIN_INTERVAL
    return rss.RssClient(interval=interval)


# ───────── 저장 ─────────

def _norm_title(t):
    return " ".join(str(t or "").lower().split())


def store_articles(arts, group_id, run_id):
    """기사 저장 (URL · 제목 기준 중복 제거). 새로 넣은 개수를 돌려줌."""
    now = utcnow()
    clean = []
    for a in arts:
        url = str(a.get("url") or "").strip()
        title = rss.clean_title(a.get("title"))
        if not url.startswith(("http://", "https://")) or len(url) > 1000 or not title:
            continue
        clean.append((url, title, a))
    urls = list({u for u, _, _ in clean})
    titles = list({t[:500] for _, t, _ in clean})
    existing = {r.url: r for r in HomeNewsArticle.query.filter(HomeNewsArticle.url.in_(urls)).all()} if urls else {}
    by_title = {}
    if titles:
        for r in HomeNewsArticle.query.filter(HomeNewsArticle.title.in_(titles)).all():
            by_title.setdefault(_norm_title(r.title), r)
    added = 0
    for url, title, a in clean:
        row = existing.get(url) or by_title.get(_norm_title(title))
        if row is not None:
            gs = [g for g in row.groups.split(",") if g]
            if group_id not in gs:
                row.groups = ",".join(gs + [group_id])[:200]
            existing[url] = row
            continue
        row = HomeNewsArticle(url=url, title=title[:500], domain=str(a.get("domain") or "")[:200],
                              seen_at=a.get("date") or now, group_id=group_id, groups=group_id,
                              language="English", source_country="United States", run_id=run_id, collected_at=now)
        db.session.add(row)
        existing[url] = row
        by_title[_norm_title(title)] = row
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
    """AI 관련성 필터링 + 기사별 한국어 요약 → (summary dict, 관련 기사 id 집합)."""
    ids = {a.id for a in articles}
    data = {
        "articles": [{"id": a.id, "title": a.title, "source": a.domain, "date": a.seen_at.strftime("%Y-%m-%d"),
                      "group": a.group_id} for a in articles],
        "groups": groups_public(cfg),
        "signals": [{"group": s["group"], "label": s["label"], "recent": s.get("recent"), "previous": s.get("previous"),
                     "surge": s.get("surge")} for s in signals],
    }
    raw = openai_json(AI_SYSTEM, data, schema=AI_SCHEMA, schema_name="news_items", max_tokens=3000,
                      part="home", action="미국 주류 업계 뉴스 필터링·요약")
    relevant = {i for i in (raw.get("relevant_ids") or []) if isinstance(i, int) and i in ids}
    items, used = [], set()
    for it in raw.get("articles") or []:
        if not isinstance(it, dict):
            continue
        aid = it.get("id")
        title_ko = str(it.get("title_ko") or "").strip()[:120]
        if not isinstance(aid, int) or aid not in ids or aid in used or not title_ko:
            continue  # 없는 기사 · 겹친 기사 · 제목 없는 항목은 버림
        used.add(aid)
        relevant.add(aid)
        items.append({"id": aid, "title_ko": title_ko, "summary_ko": str(it.get("summary_ko") or "").strip()[:300],
                      "topic": it.get("topic") if it.get("topic") in TOPICS else "업계 일반"})
        if len(items) >= MAX_ITEMS:
            break
    return {"headline": str(raw.get("headline") or "").strip()[:300], "items": items,
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
                worklog.add("home", "수집", "미국 주류 업계 뉴스 수집 (구글 뉴스)", status="실패",
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
    now = utcnow()
    for g in cfg["groups"]:
        label = g.get("label") or g["id"]
        if fails >= MAX_FAILS_IN_ROW:
            counts[g["id"]] = {"found": 0, "new": 0, "error": "건너뜀"}
            errors.append(f"{label}: 구글 뉴스 응답이 연달아 실패해 건너뜀")
            continue
        try:
            arts = client.articles(build_query(cfg, g), cfg.get("when", "14d"))
        except rss.RssError as e:
            counts[g["id"]] = {"found": 0, "new": 0, "error": str(e)}
            errors.append(f"{label}: {e}")
            fails += 1
            continue
        fails = 0
        ok_groups += 1
        arts = [a for a in arts if not rss.is_noise(a.get("title"), cfg.get("exclude"))]
        sig = rss.surge([a.get("date") for a in arts], now, float(cfg.get("surgeRatio", 1.5)),
                        int(cfg.get("surgeMinRecent", 5)))
        if sig:
            signals.append(dict(sig, group=g["id"], label=label))
        counts[g["id"]] = {"found": len(arts), "new": store_articles(arts, g["id"], run.id)}
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
    worklog.add("home", "수집", "미국 주류 업계 뉴스 수집 (구글 뉴스)", status="실패" if status == "failed" else "완료",
                detail={"trigger": run.trigger, "new": new, "groups": {k: v.get("found", 0) for k, v in counts.items()},
                        "errors": errors[:10], "requests": client.calls, "rateLimited": client.rate_limited, "ai": run.ai_status,
                        "surges": [s["label"] for s in signals if s.get("surge")]}, user_name=user_name)
    return run


# ───────── 화면용 ─────────

def _article_map(ids):
    if not ids:
        return {}
    return {a.id: a for a in HomeNewsArticle.query.filter(HomeNewsArticle.id.in_(list(ids))).all()}


def _surge_groups(last_ok):
    return {s.get("group") for s in (_loads(last_ok.signals, []) if last_ok else []) if s.get("surge")}


def payload():
    """GET /api/home/news — 저장된 결과만 (구글 뉴스를 부르지 않음)."""
    cfg_groups = groups_public()
    labels = {g["id"]: g["label"] for g in cfg_groups}
    latest = HomeNewsRun.query.order_by(HomeNewsRun.id.desc()).first()
    running = running_run()
    last_ok = HomeNewsRun.query.filter(HomeNewsRun.status.in_(("ok", "partial"))).order_by(HomeNewsRun.id.desc()).first()
    ai_run = HomeNewsRun.query.filter_by(ai_status="ok").order_by(HomeNewsRun.id.desc()).first()
    ai_ready = openai_ready()
    surging = _surge_groups(last_ok)

    if running:
        status = "running"
    elif latest is None:
        status = "never"
    elif latest.status == "running":
        status = "failed"  # 30분 넘게 끝나지 않음 → 실패로 봄
    else:
        status = latest.status

    ai = None
    s = _loads(ai_run.summary, {}) if ai_run and ai_ready else {}
    if "items" in s:  # 예전(GDELT 시절) 요약은 형식이 달라 쓰지 않음
        amap = _article_map({it.get("id") for it in s.get("items", [])})
        items = []
        for it in s.get("items", []):
            a = amap.get(it.get("id"))
            if a is None:
                continue
            d = a.to_dict()
            items.append(dict(d, titleKo=it.get("title_ko", ""), summaryKo=it.get("summary_ko", ""),
                              topic=it.get("topic", ""), groupLabel=labels.get(a.group_id, ""),
                              surge=bool(surging & set(d["groups"]))))
        ai = {"headline": s.get("headline", ""), "items": items, "at": iso(ai_run.finished_at), "model": ai_run.model}

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
    """To-Do 생성에 넘길 뉴스 요약 (한 줄 정리 · 주요 기사 · 급증 시그널)."""
    out = {"headline": "", "trends": [], "signals": []}
    ai_run = HomeNewsRun.query.filter_by(ai_status="ok").order_by(HomeNewsRun.id.desc()).first()
    if ai_run:
        s = _loads(ai_run.summary, {})
        out["headline"] = s.get("headline", "")
        out["trends"] = [{"title": i.get("title_ko", ""), "summary": i.get("summary_ko", "")}
                         for i in s.get("items", [])][:5]
    last_ok = HomeNewsRun.query.filter(HomeNewsRun.status.in_(("ok", "partial"))).order_by(HomeNewsRun.id.desc()).first()
    if last_ok:
        out["signals"] = [{"label": s.get("label", ""), "changePct": s.get("changePct"), "surge": bool(s.get("surge"))}
                          for s in _loads(last_ok.signals, [])]
    return out
