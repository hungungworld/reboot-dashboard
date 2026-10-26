"""유튜브 크리에이터 추천 (YouTube Data API v3) — 업체 컨택 › 유튜브 크리에이터.

- 키워드마다 미국 채널 검색(search.list 100 units) → 채널 정보(channels.list 1 unit/50개)
  → 최근 영상 10개 평균 조회수(playlistItems 1 + videos 1 unit/채널)
- 이메일은 채널 소개란에 크리에이터가 직접 공개한 주소만 (숨겨진 '비즈니스 문의 이메일'은 가져오지 않음)
- 유튜브 API 정책(보관 기간): 받은 값은 STALE_DAYS가 지나면 목록을 열 때 다시 받고,
  MAX_DAYS 안에 다시 받지 못한 채널은 지움 (refresh)
- 대상(target): US 미국 · EN 영미권(GB·CA·AU·NZ·IE) · EST 미국 타겟 추정(국가 미표시 + 영어 채널, 미국 지역 검색에 걸림)
  — 유튜브 API는 시청자 국가를 알려 주지 않으므로 EST는 추정값. 그 밖의 나라 채널은 저장하지 않음
- 아동용(madeForKids) 채널, 구독자 1,000명 이하(비공개 포함)는 저장하지 않음
- 관련 키워드 AI 추천(suggest_keywords): OpenAI · 참고용
"""
import re
from datetime import timedelta

import requests

from server import envkeys
from server.core.ai import openai_json, openai_model
from server.extensions import db
from server.models import utcnow
from .models import PartnerYoutubeCreator

API = "https://www.googleapis.com/youtube/v3"
TIMEOUT = 15
KEYWORDS = ["bachelorette party", "nightlife vlog", "bar crawl", "21st birthday", "bourbon tasting", "tailgate party",
            "cocktail recipes", "hangover cure"]
MAX_KEYWORDS = 8
PER_KEYWORD = 10
RECENT_VIDEOS = 10
ENGLISH = ("US", "GB", "CA", "AU", "NZ", "IE")
TARGETS = ("US", "EN", "EST")
MIN_SUBSCRIBERS = 1000      # 이 수 이하(또는 비공개)는 추천에서 뺌
STALE_DAYS = 7
MAX_DAYS = 30
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")


class YoutubeError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def ready():
    return envkeys.has("YOUTUBE_API_KEY")


_schema_ok = False


def ensure_schema():
    """먼저 만들어진 표에 나중에 생긴 칸(thumb 프로필 사진 · target 대상)을 한 번 추가 (create_all은 칸을 추가하지 않음)."""
    global _schema_ok
    if _schema_ok:
        return
    from sqlalchemy import inspect, text
    table = PartnerYoutubeCreator.__tablename__
    cols = {c["name"] for c in inspect(db.engine).get_columns(table)}
    added = {"thumb": "VARCHAR(500) NOT NULL DEFAULT ''", "target": "VARCHAR(4) NOT NULL DEFAULT ''"}
    for name, ddl in added.items():
        if name not in cols:
            with db.engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
    _schema_ok = True


def _english(sn):
    """채널 언어가 영어인지: defaultLanguage가 있으면 그걸로, 없으면 이름·소개란 글자의 90% 이상이 영문."""
    lang = str(sn.get("defaultLanguage") or "").lower()
    if lang:
        return lang.startswith("en")
    letters = [c for c in f"{sn.get('title') or ''} {sn.get('description') or ''}" if c.isalpha()]
    return len(letters) >= 3 and sum(c.isascii() for c in letters) / len(letters) >= 0.9


def target_of(sn):
    """US · EN · EST(미국 타겟 추정) · None(대상 아님)"""
    country = str(sn.get("country") or "").upper()
    if country == "US":
        return "US"
    if country in ENGLISH:
        return "EN"
    if not country and _english(sn):
        return "EST"
    return None


def target_from_country(country):
    """CSV 가져오기용: 국가 칸만으로 판단 (빈칸은 추정)."""
    c = str(country or "").strip().upper()
    return "US" if c == "US" else "EN" if c in ENGLISH else "EST" if not c else None


def _get(path, **params):
    key = envkeys.get("YOUTUBE_API_KEY")
    if not key:
        raise YoutubeError("YouTube 키가 없습니다. 설정 › 연결에서 YOUTUBE_API_KEY를 넣어 주세요.", 503)
    try:
        r = requests.get(f"{API}/{path}", params=dict(params, key=key), timeout=TIMEOUT)
    except requests.RequestException:
        raise YoutubeError("YouTube에 연결하지 못했습니다. 인터넷 연결을 확인하세요.")
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code != 200:
        reasons = {e.get("reason") for e in ((data.get("error") or {}).get("errors") or []) if isinstance(e, dict)}
        if reasons & {"quotaExceeded", "dailyLimitExceeded"}:
            raise YoutubeError("YouTube 오늘 사용량(하루 10,000 units)을 모두 썼어요. 내일 다시 시도하세요.", 429)
        if "accessNotConfigured" in reasons:
            raise YoutubeError("Google Cloud 콘솔에서 YouTube Data API v3를 '사용'으로 켜 주세요.")
        raise YoutubeError(f"YouTube 응답 오류 ({r.status_code}). 설정 › 연결에서 키를 확인하세요.")
    return data


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def find_email(text):
    """소개란에 공개된 첫 이메일 (없으면 '')."""
    m = EMAIL_RE.search(str(text or ""))
    return m.group(0).strip(".").lower() if m else ""


def search_channels(keywords):
    """키워드별 채널 검색 → {channel_id: [매칭 키워드…]}"""
    found = {}
    for kw in keywords:
        data = _get("search", part="snippet", type="channel", q=kw, regionCode="US", relevanceLanguage="en",
                    maxResults=PER_KEYWORD, safeSearch="moderate")
        for it in data.get("items") or []:
            cid = ((it.get("id") or {}).get("channelId") or (it.get("snippet") or {}).get("channelId") or "")
            if cid:
                found.setdefault(cid, [])
                if kw not in found[cid]:
                    found[cid].append(kw)
    return found


def channel_details(ids):
    """채널 id 목록 → {id: 정보}. 아동용 채널은 뺌."""
    out = {}
    ids = list(ids)
    for i in range(0, len(ids), 50):
        data = _get("channels", part="snippet,statistics,contentDetails,status", id=",".join(ids[i:i + 50]), maxResults=50)
        for it in data.get("items") or []:
            sn, stt = it.get("snippet") or {}, it.get("statistics") or {}
            if (it.get("status") or {}).get("madeForKids"):
                continue
            target = target_of(sn)
            if target is None:
                continue        # 영미권 · 미국 타겟(추정)이 아닌 채널
            subs = None if stt.get("hiddenSubscriberCount") else _int(stt.get("subscriberCount"))
            if subs is None or subs <= MIN_SUBSCRIBERS:
                continue        # 구독자 1,000명 이하 · 비공개는 뺌
            handle = sn.get("customUrl") or ""
            thumbs = sn.get("thumbnails") or {}
            out[it["id"]] = {
                "thumb": ((thumbs.get("default") or thumbs.get("medium") or {}).get("url") or "")[:500],
                "target": target,
                "title": (sn.get("title") or "")[:200],
                "handle": handle[:100],
                "country": (sn.get("country") or "")[:10],
                "subscribers": subs,
                "videos": _int(stt.get("videoCount")),
                "views": _int(stt.get("viewCount")),
                "email": find_email(sn.get("description")),
                "uploads": ((it.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads") or "",
            }
    return out


def recent_avg_views(uploads):
    """업로드 목록의 최근 영상 RECENT_VIDEOS개 평균 조회수 (영상이 없으면 None)."""
    if not uploads:
        return None
    items = _get("playlistItems", part="contentDetails", playlistId=uploads, maxResults=RECENT_VIDEOS).get("items") or []
    vids = [(x.get("contentDetails") or {}).get("videoId") for x in items]
    vids = [v for v in vids if v]
    if not vids:
        return None
    stats = _get("videos", part="statistics", id=",".join(vids)).get("items") or []
    counts = [_int((v.get("statistics") or {}).get("viewCount")) for v in stats]
    counts = [c for c in counts if c is not None]
    return round(sum(counts) / len(counts)) if counts else None


def _apply(row, info, now):
    row.title, row.handle, row.country, row.thumb = info["title"], info["handle"], info["country"], info["thumb"]
    row.target = info["target"]
    row.subscribers, row.video_count, row.total_views = info["subscribers"], info["videos"], info["views"]
    try:
        row.avg_views = recent_avg_views(info["uploads"])
    except YoutubeError as e:
        if e.status == 429:
            raise
    if info["email"] != row.email:
        row.email = info["email"]
        row.email_at = now if info["email"] else None
    elif info["email"]:
        row.email_at = now
    row.stats_at = now


def search(keywords, user=""):
    """추천 받기: 키워드 검색 → 채널 정보 저장(있으면 갱신). 새로 찾은 채널 수와 전체 수를 돌려줌."""
    kws = [k.strip()[:60] for k in keywords if str(k or "").strip()][:MAX_KEYWORDS] or KEYWORDS
    found = search_channels(kws)
    info = channel_details(found)
    now = utcnow()
    added = 0
    for cid, d in info.items():
        row = db.session.get(PartnerYoutubeCreator, cid)
        if row is None:
            row = PartnerYoutubeCreator(id=cid, created_by=user)
            db.session.add(row)
            added += 1
        row.set_keywords(sorted(set(row.keyword_list()) | set(found.get(cid, []))))
        _apply(row, d, now)
    db.session.commit()
    return {"keywords": kws, "found": len(info), "added": added}


def refresh():
    """오래된 값 다시 받기 (STALE_DAYS) · 정책 기간(MAX_DAYS) 안에 못 받은 채널은 지움.
    돌려줌: {refreshed, removed, warning}"""
    now = utcnow()
    # 프로필 사진 칸이 생기기 전에 저장한 채널(thumb 없음)도 한 번 다시 받음
    stale = PartnerYoutubeCreator.query.filter(db.or_(PartnerYoutubeCreator.stats_at < now - timedelta(days=STALE_DAYS),
                                                      PartnerYoutubeCreator.thumb == "")).all()
    refreshed, warning = 0, ""
    if stale and ready():
        try:
            info = channel_details([r.id for r in stale])
            for r in stale:
                if r.id in info:
                    _apply(r, info[r.id], now)
                    refreshed += 1
            gone = {r.id for r in stale} - set(info)
            # 채널이 사라졌거나 아동용으로 바뀐 경우 → 더 보관하지 않음
            for r in stale:
                if r.id in gone:
                    db.session.delete(r)
        except YoutubeError as e:
            warning = f"오래된 값을 다시 받지 못했습니다: {e}"
    Y = PartnerYoutubeCreator
    # 대상 칸이 생기기 전에 저장한 채널은 국가로 대상을 채움 (API 호출 없음)
    for r in Y.query.filter(Y.target == "").all():
        r.target = target_from_country(r.country) or ""
    # 보관 기간이 지났거나 조건(영미권·미국 타겟 · 구독자 1,000명 초과)에 안 맞는 것은 지움 (조건이 생기기 전에 저장된 채널 포함)
    expired = Y.query.filter(db.or_(Y.stats_at < now - timedelta(days=MAX_DAYS), Y.target.notin_(TARGETS),
                                    Y.subscribers.is_(None), Y.subscribers <= MIN_SUBSCRIBERS)).all()
    for r in expired:
        db.session.delete(r)
    db.session.commit()
    return {"refreshed": refreshed, "removed": len(expired), "warning": warning}


# ───────── 관련 키워드 AI 추천 (참고용) ─────────
KW_SYSTEM = """You suggest YouTube search keywords to find US-facing, English-speaking adult (21+) lifestyle creators
for REBOOT, a Korean food brand (jelly sticks and drinks) positioned as an after-party / morning-after ritual.

Rules
- Return 6 to 8 short English search phrases (2-4 words) that are NOT already in "current".
- Focus on adult party, nightlife, cocktails, whiskey/bourbon, US event seasons (tailgate, spring break, festivals), and the morning after a party.
- Use "performing" (keywords that already found many creators) as hints for what works.
- Never suggest kids, family, baby, school, or gender reveal topics.
- Do not claim health effects; plain topic phrases only (e.g. "hangover cure" as a search topic is fine).
- reason: one short Korean sentence per keyword explaining why it fits."""

KW_SCHEMA = {
    "type": "object",
    "properties": {"keywords": {"type": "array", "items": {
        "type": "object",
        "properties": {"keyword": {"type": "string"}, "reason": {"type": "string"}},
        "required": ["keyword", "reason"], "additionalProperties": False}}},
    "required": ["keywords"],
    "additionalProperties": False,
}
KW_BLOCK = re.compile(r"\b(kid|kids|child|children|baby|toddler|family|school|nursery|gender reveal)\b", re.I)


def suggest_keywords(current):
    """지금 키워드 + 크리에이터가 많이 걸린 키워드를 보고 관련 키워드 6~8개 (OpenAI). [{keyword, reason}]"""
    counts = {}
    for r in PartnerYoutubeCreator.query.all():
        for k in r.keyword_list():
            counts[k] = counts.get(k, 0) + 1
    performing = sorted(counts.items(), key=lambda x: -x[1])[:10]
    cur = [str(k).strip()[:60] for k in current if str(k or "").strip()][:20]
    raw = openai_json(KW_SYSTEM, {"current": cur, "performing": [{"keyword": k, "creators": n} for k, n in performing]},
                      schema=KW_SCHEMA, schema_name="youtube_keywords", max_tokens=800,
                      part="partners", action="유튜브 관련 키워드 AI 추천")
    seen = {k.lower() for k in cur}
    out = []
    for it in raw.get("keywords") or []:
        kw = re.sub(r"\s+", " ", str((it or {}).get("keyword") or "")).strip()[:60]
        if not kw or kw.lower() in seen or KW_BLOCK.search(kw):
            continue
        seen.add(kw.lower())
        out.append({"keyword": kw, "reason": str(it.get("reason") or "").strip()[:200]})
    return {"keywords": out[:8], "model": openai_model()}
