"""미국 주류 업계 뉴스 (README 2장) — 구글 뉴스 RSS 수집 → 규칙 거르기 → 저장(URL·제목 중복 제거) → 보도 급증 → AI 점수·기사별 한국어 요약.

- 화면을 열 때는 구글 뉴스를 부르지 않음 (저장된 결과만). 수집은 '지금 수집' 버튼(뒤에서 실행) · 하루 1회 작업
- 검색어: tabs/home/data/queries.json (분야 7개 · 검색어 9개 · signal/flow)
- 규칙 거르기 (무료): 사고 · 범죄 단어 · 비유 hangover(AI hangover 등) · 인사 소식 · 미국 밖 시장 · 한국어 제목(K-푸드만 허용)
- AI(OpenAI 키가 있을 때만): 관련 기사마다 점수(REBOOT와의 거리 · 실행 가능성 · 출처 · 새로움) + '왜 중요한가'
  → 최대 8개: signal 분야(숙취 · 경쟁사 · 규제)는 2개씩 자리 보장, 한 분야는 3개까지, 나머지는 점수순
  제목만 보고 씀 (본문 추측 금지)
- 실패하면 마지막 결과를 그대로 두고 화면에 '업데이트 실패' 표시
"""
import json
import re
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
AI_PER_GROUP = 20  # 검색어마다 최신 20개까지 → 기사가 많은 분야가 AI 입력을 다 차지하지 않게
MAX_ITEMS = 8
AI_CANDIDATES = 15
SIGNAL_SLOTS = 2   # signal 분야마다 자리 보장
AREA_CAP = 3       # 한 분야 최대
STATS_DAYS = 60    # 검색어 점검 기간 (이 기간 동안 고른 카드가 0개면 교체 후보)
AREAS = (("category", "숙취 카테고리"), ("competitor", "경쟁사"), ("regulation", "규제"), ("behavior", "음주 행태"),
         ("nonalc", "무알코올 · 기능성"), ("sales", "주류 판매"), ("kfood", "K-푸드"))
TOPICS = ("판매 동향", "소비 트렌드", "규제·정책", "경쟁·신제품", "업계 일반")
LIMIT_NOTE = "구글 뉴스 제목 기준 요약이라 기사 본문은 보지 않았어요. 판매량·가격은 인사이트 탭에서 봅니다."

AI_SYSTEM = """당신은 미국 시장에 진출한 한국 숙취해소 젤리·음료 브랜드 REBOOT(일반 식품)의 마케팅 리서처입니다.
미국 매체 기사 목록(제목 · 매체 · 날짜 · 검색어 묶음)만 보고, 마케터가 이번 주에 알아야 할 업계 뉴스를 고르고 한국어로 정리합니다.

규칙
- 기사 제목과 매체에 있는 내용만 근거로 씁니다. 본문을 읽은 것처럼 쓰거나, 주어지지 않은 숫자·사실을 만들지 않습니다.
- 기사마다 검색한 분야(area)가 붙어 있지만, 기사 내용에 맞는 분야를 다시 고릅니다 (area: category 숙취 카테고리 · competitor 경쟁사 ·
  regulation 규제 · behavior 음주 행태 · nonalc 무알코올·기능성 · sales 주류 판매 · kfood K-푸드). 예: FDA로 찾았어도 Z세대 음주 기사면 behavior.
- 고를 기사 (넓게 고르고 점수로 가립니다): 숙취 제품 · 성분(DHM · 전해질 등), 경쟁 브랜드 소식(Liquid I.V. · ZBiotics 등의 협찬 · 신제품 · 캠페인),
  식품 · 영양제 규제(FDA 신규 성분 신고 · 표시 지침 등), 음주 행태 변화(절주 · Z세대 · GLP-1), 무알코올 · 기능성 음료, 미국 주류 판매, 미국 안의 K-푸드.
- 미국 밖 시장만 다룬 기사(필리핀 · 영국 등 매출)는 관련 기사로 치지 않습니다.
- 버릴 기사: 'hangover'를 비유로 쓴 기사(예: AI hangover, tariff hangover, DOGE hangover, post-election hangover — 술과 무관하면 모두 뺌),
  음주 사고·범죄, 주가·인물 가십, 인사 소식, 미국 밖 시장만 다룬 기사, 무관한 산업.
- relevant_ids: 관련 있는 기사 id 전부.
- articles: 관련 기사 중 후보 10~15개. 같은 소식은 하나만. 관련 기사가 있는 분야는 분야마다 최소 1개씩 넣습니다
  (특히 숙취 카테고리 · 경쟁사 · 규제는 기사 수가 적어도 꼭 확인). 기사마다 점수를 매깁니다 (점수 합으로 서버가 최종 8개를 고름).
  distance(REBOOT와의 거리): 2 = 숙취 제품·성분 · 경쟁 브랜드 · 영양제/식품 규제, 1 = 음주 행태 · 무알코올·기능성 음료 · K-푸드, 0 = 주류 업계 일반
  action(실행 가능성): 2 = 이번 주 카피·캠페인·채널에 바로 반영할 수 있음, 1 = 참고, 0 = 없음
  source(출처): 2 = 공공기관(FDA 등) · 업계지(BevNET, NutraIngredients 등) · 연구·조사, 1 = 주요 언론, 0 = 보도자료 · 블로그 · 쇼핑 추천글
  novelty(새로움): 1 = 처음 나온 소식, 0 = 이미 알려진 내용 반복
  title_en(그 id 기사의 영어 제목을 그대로 복사 — 서버가 id와 맞는지 확인) · title_ko(한국어 제목 30자 안팎) · summary_ko(제목에서 알 수 있는 사실 한 줄) · why_ko(REBOOT 마케터가 이번에 무엇을 확인하거나 바꿀지 한 줄 — 카피 · 채널 · 타깃 · 시즌 · 규제 표현 중 하나를 구체적으로.
  "기회가 될 수 있다" · "마케팅 전략을 세워야 한다"처럼 막연한 문장은 쓰지 않음. 제목 근거 안에서.
  좋은 예: "DHM 성분 관심 기사 — 우리 상세페이지에 성분 설명이 있는지 확인" · "Liquid I.V.가 F1 협찬 — 스포츠 관람 시즌 채널 검토"
  · "FDA 신규 성분 신고 지침 — 성분 표기 · 효능 문구를 컴플라이언스 탭에서 다시 점검")
  topic(판매 동향 / 소비 트렌드 / 규제·정책 / 경쟁·신제품 / 업계 일반)
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
                    "title_en": {"type": "string"},
                    "title_ko": {"type": "string"},
                    "summary_ko": {"type": "string"},
                    "why_ko": {"type": "string"},
                    "area": {"type": "string", "enum": [a for a, _ in AREAS]},
                    "topic": {"type": "string", "enum": list(TOPICS)},
                    "distance": {"type": "integer", "enum": [0, 1, 2]},
                    "action": {"type": "integer", "enum": [0, 1, 2]},
                    "source": {"type": "integer", "enum": [0, 1, 2]},
                    "novelty": {"type": "integer", "enum": [0, 1]},
                },
                "required": ["id", "title_en", "title_ko", "summary_ko", "why_ko", "area", "topic", "distance", "action", "source", "novelty"],
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
    areas = {a["id"]: a for a in cfg.get("areas", []) if isinstance(a, dict) and a.get("id")}
    groups = [g for g in cfg.get("groups", []) if isinstance(g, dict) and g.get("id") and g.get("query")]
    for g in groups:
        a = areas.get(g.get("area")) or {}
        g["area"], g["areaLabel"], g["kind"] = a.get("id", g["id"]), a.get("label", g.get("label") or g["id"]), a.get("kind", "flow")
    cfg["groups"] = groups
    cfg["filters"] = cfg.get("filters") or {}
    return cfg


def _words_re(words, flags=re.I, after=""):
    """단어 목록 → 앞뒤가 영문자 · 숫자가 아닌 곳에서만 맞는 정규식 (after: 단어 뒤에 붙일 패턴)."""
    words = [str(w).strip() for w in words or [] if str(w).strip()]
    if not words:
        return None
    return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(re.escape(w) for w in words) + r")" + (after or r"(?![A-Za-z0-9])"), flags)


HANGUL = re.compile(r"[가-힣]")


def make_filter(cfg):
    """규칙 거르기 → fn(title, group) = 버린 이유(사고 · 비유 · 인사 · 해외 · 한국어) 또는 None."""
    f = cfg.get("filters") or {}
    meta = _words_re(f.get("metaphor"), after=r"\s+hangovers?\b")
    verbs, roles = _words_re(f.get("personnel")), _words_re(f.get("roles"))
    foreign, us = _words_re(f.get("foreign"), 0), _words_re(f.get("usWords"), 0)

    def reason(title, group=None):
        t = str(title or "")
        if rss.is_noise(t, cfg.get("exclude")):
            return "incident"
        if meta and meta.search(t):
            return "metaphor"
        if verbs and roles and verbs.search(t) and roles.search(t):
            return "personnel"
        if foreign and foreign.search(t) and not (us and us.search(t)):
            return "foreign"
        if HANGUL.search(t) and not (group or {}).get("allowKorean"):
            return "korean"
        return None
    return reason


def build_query(cfg, group):
    return str(group["query"]).strip()


def groups_public(cfg=None):
    try:
        cfg = cfg or load_queries()
    except (OSError, ValueError):
        return []
    return [{"id": g["id"], "label": g.get("label") or g["id"], "area": g["area"], "areaLabel": g["areaLabel"], "kind": g["kind"],
             "query": g["query"]} for g in cfg["groups"]]


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


def recent_articles(days=7, limit=AI_MAX_ARTICLES, per_group=AI_PER_GROUP, cfg=None, signal_days=14):
    """최근 기사 → 지금 설정의 검색어로 모은 기사만 · 규칙 거르기 다시 적용 · 검색어마다 최신 per_group개 · 전체 limit개 (최신순).
    기사가 적은 signal 검색어는 signal_days일까지 봄."""
    now = utcnow()
    rows = (HomeNewsArticle.query.filter(HomeNewsArticle.seen_at >= now - timedelta(days=max(days, signal_days if cfg else days)))
            .order_by(HomeNewsArticle.seen_at.desc()).all())
    groups = {g["id"]: g for g in cfg["groups"]} if cfg else None
    drop = make_filter(cfg) if cfg else None
    out, per = [], {}
    for a in rows:
        if groups is not None and (a.group_id not in groups or drop(a.title, groups[a.group_id])):
            continue  # 지운 검색어 · 예전 규칙으로 들어온 기사
        g = (groups or {}).get(a.group_id) or {}
        if a.seen_at < now - timedelta(days=signal_days if g.get("kind") == "signal" else days):
            continue
        if per.get(a.group_id, 0) < per_group:
            out.append(a)
            per[a.group_id] = per.get(a.group_id, 0) + 1
    return out[:limit]


# ───────── AI ─────────

def _words(t):
    return set(re.findall(r"[a-z0-9]+", str(t or "").lower()))


def same_title(echo, title):
    """AI가 돌려준 영어 제목이 그 id 기사 제목과 맞는지 (단어 절반 이상 겹침). 번호를 헷갈린 항목을 버리려고 씀."""
    a, b = _words(echo), _words(title)
    return bool(a and b) and len(a & b) >= 0.5 * min(len(a), len(b))


def score_of(it):
    return int(it.get("distance") or 0) + int(it.get("action") or 0) + int(it.get("source") or 0) + int(it.get("novelty") or 0)


def pick(cands, kind_of, limit=MAX_ITEMS):
    """점수순 후보 → signal 분야는 SIGNAL_SLOTS개씩 먼저, 한 분야는 AREA_CAP개까지, 나머지는 점수순 (최대 limit개)."""
    cands = sorted(cands, key=lambda c: -c["score"])
    out, per = [], {}

    def take(c):
        out.append(c)
        per[c["area"]] = per.get(c["area"], 0) + 1
    for c in cands:
        if len(out) < limit and kind_of(c["area"]) == "signal" and per.get(c["area"], 0) < SIGNAL_SLOTS:
            take(c)
    for c in cands:
        if len(out) < limit and c not in out and per.get(c["area"], 0) < AREA_CAP:
            take(c)
    return sorted(out, key=lambda c: -c["score"])


def summarize(articles, signals, cfg):
    """AI 관련성 필터링 + 점수 · 기사별 한국어 요약 → 자리 규칙으로 최대 8개 → (summary dict, 관련 기사 id 집합)."""
    ids = {a.id for a in articles}
    by_group = {g["id"]: g for g in cfg["groups"]}
    kinds = {g["area"]: g["kind"] for g in cfg["groups"]}  # AI가 고른 분야도 여기 있는 것만 씀
    area_of = {a.id: (by_group.get(a.group_id) or {}).get("area", a.group_id) for a in articles}
    data = {
        "articles": [{"id": a.id, "title": a.title, "source": a.domain, "date": a.seen_at.strftime("%Y-%m-%d"),
                      "group": a.group_id, "area": (by_group.get(a.group_id) or {}).get("areaLabel", "")} for a in articles],
        "groups": groups_public(cfg),
        "signals": [{"group": s["group"], "label": s["label"], "recent": s.get("recent"), "previous": s.get("previous"),
                     "surge": s.get("surge")} for s in signals],
    }
    raw = openai_json(AI_SYSTEM, data, schema=AI_SCHEMA, schema_name="news_items", max_tokens=5000,
                      part="home", action="미국 주류 업계 뉴스 필터링·요약")
    relevant = {i for i in (raw.get("relevant_ids") or []) if isinstance(i, int) and i in ids}
    cands, used = [], set()
    titles = {a.id: a.title for a in articles}
    for it in raw.get("articles") or []:
        if not isinstance(it, dict):
            continue
        aid = it.get("id")
        if aid in titles and "title_en" in it and not same_title(it.get("title_en"), titles[aid]):
            continue  # 번호를 헷갈린 항목 (다른 기사 제목) → 엉뚱한 링크가 되지 않게 버림
        title_ko = str(it.get("title_ko") or "").strip()[:120]
        if not isinstance(aid, int) or aid not in ids or aid in used or not title_ko:
            continue  # 없는 기사 · 겹친 기사 · 제목 없는 항목은 버림
        used.add(aid)
        relevant.add(aid)
        cands.append({"id": aid, "title_ko": title_ko, "summary_ko": str(it.get("summary_ko") or "").strip()[:300],
                      "why_ko": str(it.get("why_ko") or "").strip()[:200],
                      "topic": it.get("topic") if it.get("topic") in TOPICS else "업계 일반",
                      "score": score_of(it), "area": it.get("area") if it.get("area") in kinds else area_of[aid]})
        if len(cands) >= AI_CANDIDATES:
            break
    items = pick(cands, lambda area: kinds.get(area, "flow"))
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
    drop = make_filter(cfg)
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
        found, kept, dropped = len(arts), [], {}
        for a in arts:
            why = drop(a.get("title"), g)
            if why:
                dropped[why] = dropped.get(why, 0) + 1
            else:
                kept.append(a)
        arts = kept
        sig = rss.surge([a.get("date") for a in arts], now, float(cfg.get("surgeRatio", 1.5)),
                        int(cfg.get("surgeMinRecent", 5)))
        if sig:
            signals.append(dict(sig, group=g["id"], label=label))
        counts[g["id"]] = {"found": found, "kept": len(arts), "dropped": dropped, "new": store_articles(arts, g["id"], run.id)}
    prune()
    status = "failed" if ok_groups == 0 else ("partial" if errors else "ok")
    run.counts, run.errors, run.signals = _dumps(counts), _dumps(errors[:20]), _dumps(signals)
    # AI 필터링·요약 (키가 있을 때만)
    if status == "failed":
        run.ai_status = "skipped"
    elif not openai_ready():
        run.ai_status = "no_key"
    else:
        arts = recent_articles(cfg=cfg)
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
    areas = {g["area"]: g["areaLabel"] for g in cfg_groups}
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
                              whyKo=it.get("why_ko", ""), score=it.get("score"), areaLabel=areas.get(it.get("area"), ""),
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
        "queryStats": query_stats(cfg_groups),
        "limitNote": LIMIT_NOTE,
    }


def query_stats(groups):
    """검색어마다 최근 STATS_DAYS일: 찾은 기사 · 규칙 통과 · 카드로 고른 수 → 고른 카드 0개 + 30일 넘게 돌렸으면 교체 후보."""
    if not groups:
        return []
    since = utcnow() - timedelta(days=STATS_DAYS)
    runs = (HomeNewsRun.query.filter(HomeNewsRun.started_at >= since, HomeNewsRun.status.in_(("ok", "partial")))
            .order_by(HomeNewsRun.id).all())
    stat = {g["id"]: {"found": 0, "kept": 0, "picked": 0} for g in groups}
    picked_ids = set()
    for r in runs:
        for gid, c in _loads(r.counts, {}).items():
            if gid in stat and isinstance(c, dict):
                stat[gid]["found"] += int(c.get("found") or 0)
                stat[gid]["kept"] += int(c.get("kept", c.get("found")) or 0)
        picked_ids |= {it.get("id") for it in _loads(r.summary, {}).get("items", []) if isinstance(it, dict)}
    for a in _article_map(picked_ids).values():
        if a.group_id in stat:
            stat[a.group_id]["picked"] += 1
    enough = bool(runs) and runs[0].started_at <= utcnow() - timedelta(days=30)
    return [dict(g, runs=len(runs), **stat[g["id"]], replace=enough and stat[g["id"]]["picked"] == 0) for g in groups]


def brief():
    """To-Do 생성에 넘길 뉴스 요약 (한 줄 정리 · 주요 기사 · 급증 시그널)."""
    out = {"headline": "", "trends": [], "signals": []}
    ai_run = HomeNewsRun.query.filter_by(ai_status="ok").order_by(HomeNewsRun.id.desc()).first()
    if ai_run:
        s = _loads(ai_run.summary, {})
        out["headline"] = s.get("headline", "")
        out["trends"] = [{"title": i.get("title_ko", ""), "summary": i.get("summary_ko", ""), "why": i.get("why_ko", "")}
                         for i in s.get("items", [])][:5]
    last_ok = HomeNewsRun.query.filter(HomeNewsRun.status.in_(("ok", "partial"))).order_by(HomeNewsRun.id.desc()).first()
    if last_ok:
        out["signals"] = [{"label": s.get("label", ""), "changePct": s.get("changePct"), "surge": bool(s.get("surge"))}
                          for s in _loads(last_ok.signals, [])]
    return out
