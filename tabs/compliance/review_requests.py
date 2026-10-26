"""문구 검토 요청 (2026-10-25) — 단건 심의 문구를 법무·인허가·품질팀에 보내고 회신을 받음.

흐름: 단건 심의 [검토 요청 보내기] → 팀마다 회신 링크(그 팀·그 요청 전용 · 14일 · 다시 회신하면 덮어씀)를 만들고 Slack 채널(웹훅 SLACK_WEBHOOK_URL)에 알림
     → 담당자가 링크(/review/<토큰> · 로그인 없음)를 열어 승인·수정 필요·반려 + 의견 → 대시보드에 팀별 상태가 보이고
       Slack에도 회신 알림.
보안: 링크 토큰은 저장하지 않고 지문(SHA-256)만 저장 · 14일 뒤 만료 · 링크는 그 팀·그 요청 하나에만 회신 가능.
규칙 판정은 화면이 보낸 값을 믿지 않고 서버가 다시 점검(server_review)해서 함께 보냄.
저장: DATA_DIR/compliance/review-requests.json (깃에 올리지 않음 · 최근 300건)
"""
import hashlib
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import current_app

from server.envkeys import get as env

TEAMS = {"legal": "법무팀", "regulatory": "인허가팀", "quality": "품질팀"}
LIGHTS = {"red": "🔴 법 위반", "yellow": "🟡 법무 확인", "green": "🟢 팀·플랫폼 기준"}   # 법적 신호 (2026-10-25)
DECISIONS = ("승인", "수정 필요", "반려")
EXPIRES = timedelta(days=14)
KEEP = 300
SLACK_RE = re.compile(r"^https://hooks\.slack\.com/services/[A-Za-z0-9/_-]+$")
_lock = threading.Lock()


class RequestError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _hash(token):
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


def _path():
    return Path(current_app.config["DATA_DIR"]) / "compliance" / "review-requests.json"


def _load():
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def _save(items):
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    for attempt in range(3):   # Windows에서 파일이 잠깐 잡혀 있을 수 있음 (번역 캐시와 같은 처리)
        try:
            tmp.write_text(json.dumps(items[:KEEP], ensure_ascii=False), encoding="utf-8")
            tmp.replace(p)
            return
        except OSError:
            time.sleep(0.2 * (attempt + 1))
    raise RequestError("검토 요청을 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.", 500)


def public(r):
    """화면에 보내는 모양 (토큰 지문은 빼고)."""
    return {k: v for k, v in r.items() if k != "teams"} | {
        "teams": {t: {k: v for k, v in x.items() if k != "tokenHash"} for t, x in r["teams"].items()},
        "expired": _now() > datetime.fromisoformat(r["expiresAt"].replace("Z", "+00:00"))}


# ───────── Slack ─────────

def _esc(t):
    return str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _slack(text):
    """보내면 '', 못 보내면 화면에 보여 줄 이유. 요청 자체는 Slack 실패와 상관없이 저장됨."""
    url = env("SLACK_WEBHOOK_URL").strip()
    if not url:
        return "Slack 웹훅 주소(SLACK_WEBHOOK_URL)가 없어 Slack에는 보내지 못했습니다 → 아래 링크를 직접 전달하세요."
    if not SLACK_RE.match(url):
        return "Slack 웹훅 주소 모양이 다릅니다 (https://hooks.slack.com/services/… ) → 링크를 직접 전달하세요."
    req = urllib.request.Request(url, data=json.dumps({"text": text}).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return "" if r.status == 200 else f"Slack이 메시지를 받지 않았습니다 ({r.status})."
    except urllib.error.HTTPError as e:
        return f"Slack이 메시지를 받지 않았습니다 ({e.code})."
    except (urllib.error.URLError, TimeoutError) as e:
        return f"Slack에 연결하지 못했습니다 ({type(e).__name__})."


def _cut(t, n):
    t = str(t or "").strip()
    return t if len(t) <= n else t[:n - 1] + "…"


# ───────── 요청 · 회신 ─────────

def create(text, ko, channel, product, ai_verdict, teams, memo, requester, base_url):
    """요청 저장 + Slack 알림 → (요청, {팀: 회신 링크}, Slack 실패 이유 또는 '')."""
    from . import server_review
    text = str(text or "").strip()
    if not text or len(text) > 2000:
        raise RequestError("검토를 요청할 영어 문구가 없거나 너무 깁니다 (2000자 이하).")
    teams = [t for t in dict.fromkeys(teams or []) if t in TEAMS]
    if not teams:
        raise RequestError("검토할 팀을 하나 이상 고르세요 (법무 · 인허가 · 품질).")
    product = product if product in server_review.products() else "all"
    rule = server_review.review(text, "b2b" if channel == "b2b" else "cs", product)
    now = _now()
    links, team_rows = {}, {}
    for t in teams:
        token = secrets.token_urlsafe(24)
        links[t] = f"{base_url.rstrip('/')}/review/{token}"
        team_rows[t] = {"label": TEAMS[t], "tokenHash": _hash(token), "status": "대기", "comment": "", "by": "", "at": ""}
    r = {"id": secrets.token_hex(6), "createdAt": _iso(now), "expiresAt": _iso(now + EXPIRES),
         "text": text, "ko": _cut(ko, 2000), "channel": str(channel or "")[:20], "product": product,
         "ruleVerdict": rule["verdict"], "ruleLegal": rule["legal"], "ruleCodes": rule["codes"], "aiVerdict": str(ai_verdict or "")[:10],
         "memo": _cut(memo, 1000), "requester": _cut(requester, 60), "teams": team_rows}
    with _lock:
        items = _load()
        items.insert(0, r)
        _save(items)
    lines = [f"*[REBOOT 문구 검토 요청]* {_esc(r['requester'])} · 규칙 판정 *{r['ruleVerdict']}*"
             + (f" ({', '.join(r['ruleCodes'])})" if r["ruleCodes"] else "")
             + (f" · {LIGHTS[r['ruleLegal']]}" if r["ruleLegal"] in LIGHTS else "")
             + (f" · AI 2차 {r['aiVerdict']}" if r["aiVerdict"] else ""),
             f">{_esc(_cut(text, 600))}"]
    if r["ko"]:
        lines.append(f"한국어: {_esc(_cut(r['ko'], 300))}")
    if r["memo"]:
        lines.append(f"메모: {_esc(r['memo'])}")
    lines.append("회신 (팀별 링크 · 로그인 없음 · 14일): " + " · ".join(f"<{links[t]}|{TEAMS[t]} 확인하러 가기>" for t in teams))
    slack_error = _slack("\n".join(lines))
    return public(r), links, slack_error


def find(token):
    """(요청, 팀) — 없거나 만료면 RequestError."""
    h = _hash(token)
    for r in _load():
        for t, x in r["teams"].items():
            if secrets.compare_digest(x.get("tokenHash", ""), h):
                if _now() > datetime.fromisoformat(r["expiresAt"].replace("Z", "+00:00")):
                    raise RequestError("회신 기간(14일)이 지난 링크입니다. 요청한 사람에게 다시 보내 달라고 하세요.", 410)
                return r, t
    raise RequestError("없는 링크입니다. 주소가 잘렸는지 확인하세요.", 404)


def respond(token, decision, comment, name):
    """회신 저장 (같은 링크로 다시 회신하면 덮어씀) + Slack 알림 → (요청, 팀, Slack 실패 이유)."""
    if decision not in DECISIONS:
        raise RequestError("승인 · 수정 필요 · 반려 중 하나를 고르세요.")
    name = _cut(name, 60)
    if not name:
        raise RequestError("회신하는 사람 이름을 적어 주세요.")
    comment = _cut(comment, 1000)
    if decision != "승인" and not comment:
        raise RequestError("수정 필요·반려는 이유를 적어 주세요.")
    with _lock:
        items = _load()
        r, team = find(token)
        r = next(x for x in items if x["id"] == r["id"])
        r["teams"][team].update({"status": decision, "comment": comment, "by": name, "at": _iso(_now())})
        _save(items)
    slack_error = _slack(f"*[REBOOT 문구 검토 회신]* {TEAMS[team]} *{decision}* · {_esc(name)}"
                         + (f"\n의견: {_esc(comment)}" if comment else "") + f"\n>{_esc(_cut(r['text'], 300))}")
    return r, team, slack_error


def recent(limit=50):
    return [public(r) for r in _load()[:limit]]
