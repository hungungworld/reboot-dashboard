"""콘텐츠 브리프 (담당: 이현경) — 리뷰 · 유튜브 질문을 주제로 묶고, 사람이 승인한 요약만 콘텐츠 탭에 넘김.

규칙 → AI → 검사 → 승인 → 공개 (README '콘텐츠 브리프')
- 근거(개수 · 신뢰도)는 규칙이 셈. AI는 각도 · 말할 방향 · 피할 말 문장만 쓰고, 숫자는 서버가 붙임
- 효능 · 안전 · 비교 주제는 처음부터 뺌 (컴플라이언스 영역), 근거 5건 미만 주제도 뺌
- 지난 승인본에 있던 주제는 그 문장을 그대로 이어 씀 → 새 주제만 AI · 사람 확인
- 문장은 컴플라이언스 서버 판정(tabs.compliance.server_review, 읽기만)으로 검사 → REVISE · BLOCK이면 승인 불가
- 저장: insights_kv의 content_brief:<월>(초안) · content_brief:approved(공개본) 두 줄뿐
  → 이 기능을 지울 때는 이 파일 · routes.py의 '콘텐츠 브리프' 묶음 · 화면 카드 · 이 kv 두 줄만 지우면 됨
"""
from collections import Counter, defaultdict

from server.models import iso, utcnow
from . import ai as insights_ai
from .models import Review, kv_get, kv_set
from .util import clean

# (id, 이름, 유튜브 질문 주제, 리뷰 주제)
THEMES = [
    ("timing", "복용 시점 · 방법", ["when"], []),
    ("ease", "휴대 · 복용 편의", [], ["복용 편의"]),
    ("taste", "맛 · 향", ["taste"], ["맛·향"]),
    ("price", "가격 · 가성비", ["price"], ["가격"]),
    ("buy", "구매처", ["buy"], []),
    ("ingredients", "성분", ["ingredients"], []),
]
EXCLUDED = [
    ("효능", "효과 질문 · 효과 리뷰", "효능 주장이 될 수 있어요"),
    ("안전 · 부작용", "안전 질문 · 부작용 리뷰", "컴플라이언스 탭이 다뤄요"),
    ("다른 제품과 비교", "비교 질문", "경쟁사 비교 · 비방이 될 수 있어요"),
]
GLOBAL_AVOID = ["효능 단정 (숙취 · 치료 · 예방 · 해독)", "과음 조장", "리뷰 · 댓글 원문 인용", "경쟁사 이름 · 비교", "검증 안 된 숫자"]
MIN_COUNT = 5          # 이보다 근거가 적으면 브리프에서 뺌
HIGH_COUNT = 20        # 이 이상이면 신뢰도 '높음'
MAX_THEMES = 5
BLOCKING = ("REVISE", "BLOCK")
BASIS = "규칙 분류 개수 + AI 문장 · 사람 승인 · 참고용 (법적 검토 아님)"


def _draft_key(month):
    return f"content_brief:{month}"


APPROVED_KEY = "content_brief:approved"


# ───────── 근거 (규칙) ─────────

def evidence(month, questions):
    """주제별 근거. questions = service.top_questions(month, limit=20) 결과 (순환 import를 피해 받아 씀)."""
    q = {x["key"]: x["count"] for x in questions}
    rows = Review.query.order_by(Review.collected_at.desc()).limit(1000).all()
    own_pos, own_neg, comp_pos = Counter(), Counter(), Counter()
    examples = defaultdict(list)
    for r in rows:
        for t in r.topic_list():
            if r.own:
                if r.sentiment in ("+", "-"):
                    (own_pos if r.sentiment == "+" else own_neg)[t] += 1
                    if r.summary_ko and len(examples[t]) < 3:
                        examples[t].append(r.summary_ko[:200])
            elif r.sentiment == "+":
                comp_pos[t] += 1
    out, dropped = [], []
    for tid, name, qkeys, topics in THEMES:
        nq = sum(q.get(k, 0) for k in qkeys)
        pos, neg, cp = (sum(c[t] for t in topics) for c in (own_pos, own_neg, comp_pos))
        total = nq + pos + neg + cp
        parts = []
        if nq:
            parts.append(f"유튜브 질문 {nq}건")
        if pos or neg:
            parts.append(f"자사 리뷰 칭찬 {pos} · 불만 {neg}")
        if cp:
            parts.append(f"경쟁사 칭찬 {cp}")
        if total < MIN_COUNT:
            if total:
                dropped.append({"theme": name, "reason": f"근거 {total}건 (5건 미만)"})
            continue
        out.append({"id": tid, "theme": name, "evidence": " · ".join(parts), "count": total,
                    "confidence": "높음" if total >= HIGH_COUNT else "중간",
                    "examples": [e for t in topics for e in examples[t]][:3]})
    out.sort(key=lambda x: -x["count"])
    return out[:MAX_THEMES], dropped


# ───────── 검사 ─────────

def check(theme):
    """각도 · 말할 방향 문장을 컴플라이언스 서버 판정으로 검사 (피할 말은 일부러 나쁜 말을 적으니 검사하지 않음)."""
    text = f"{theme.get('angle', '')} {theme.get('say', '')}".strip()
    if not text:
        return {"verdict": "", "codes": [], "hits": {}}
    try:
        from tabs.compliance import server_review   # 다른 탭 기능은 가져다 쓰기만 (CS 탭과 같은 방식)
        r = server_review.review(text, "b2c")
    except Exception:  # 컴플라이언스 파일이 없거나 고장 나도 브리프는 열림 → 사람이 확인
        return {"verdict": "REVIEW", "codes": [], "hits": {}, "note": "자동 검사를 못 했어요. 직접 확인하세요."}
    return {"verdict": r["verdict"], "codes": r["codes"], "hits": r["hits"]}


def _blocked(theme):
    return theme["check"]["verdict"] in BLOCKING


# ───────── 초안 · 승인 ─────────

def get_draft(month):
    return kv_get(_draft_key(month), {}) or None


def public():
    """콘텐츠 탭에 넘기는 승인본 (없으면 None). 쓰지 않은 주제 · 검사 기록 · 예시는 빼고 꼭 필요한 것만."""
    b = kv_get(APPROVED_KEY, {}) or None
    if not b:
        return None
    return {"month": b["month"], "approvedBy": b.get("approvedBy", ""), "approvedAt": b.get("approvedAt"),
            "themes": [{k: t[k] for k in ("theme", "evidence", "confidence", "angle", "say", "avoid")}
                       for t in b["themes"] if t.get("use")],
            "avoid": list(GLOBAL_AVOID), "basis": BASIS}


def make_draft(month, questions, user):
    """초안 만들기. 지난 승인본에 있던 주제는 그 문장을 잇고, 새 주제만 AI가 씀 (키가 없으면 빈 칸 → 사람이 씀)."""
    themes, dropped = evidence(month, questions)
    prev = {t["id"]: t for t in kv_get(APPROVED_KEY, {}).get("themes", [])}
    new = [t for t in themes if t["id"] not in prev]
    written, ai_used = {}, False
    if new and insights_ai.ready():
        written = insights_ai.content_brief([{"id": t["id"], "theme": t["theme"], "evidence": t["evidence"],
                                              "examples": t["examples"]} for t in new])
        ai_used = bool(written)
    for t in themes:
        p = prev.get(t["id"])
        w = p or written.get(t["id"]) or {}
        t.update(angle=clean(w.get("angle"), 200), say=clean(w.get("say"), 200),
                 avoid=[clean(a, 80) for a in (w.get("avoid") or []) if clean(a, 80)][:3],
                 carried=bool(p), by="지난 승인" if p else "AI" if t["id"] in written else "")
        t["check"] = check(t)
        t["use"] = bool(t["angle"] and t["say"]) and not _blocked(t)   # 통과한 주제는 미리 체크
        t.pop("count")
    draft = {"month": month, "status": "draft", "themes": themes, "dropped": dropped,
             "excluded": [{"theme": a, "what": b, "reason": c} for a, b, c in EXCLUDED],
             "ai": ai_used, "aiReady": insights_ai.ready(), "createdAt": iso(utcnow()), "createdBy": user}
    kv_set(_draft_key(month), draft, user)
    return draft


def save_draft(month, items, approve, user):
    """주제 문장 고치기 · 쓸지 말지 · 승인. 승인하면 공개본을 바꿈 → (초안, 오류 문장 또는 None)."""
    draft = get_draft(month)
    if not draft:
        return None, "먼저 초안을 만드세요."
    by_id = {str(i.get("id")): i for i in items if isinstance(i, dict)}
    for t in draft["themes"]:
        i = by_id.get(t["id"])
        if i is None:
            continue
        before = (t["angle"], t["say"])
        t["angle"], t["say"] = clean(i.get("angle"), 200), clean(i.get("say"), 200)
        t["avoid"] = [clean(a, 80) for a in (i.get("avoid") or []) if clean(a, 80)][:3]
        t["use"] = bool(i.get("use"))
        if (t["angle"], t["say"]) != before:
            t["check"], t["by"], t["carried"] = check(t), "사람", False
    draft["status"] = "draft"
    err = _approve_error(draft) if approve else None
    if approve and not err:
        draft.update(status="approved", approvedBy=user, approvedAt=iso(utcnow()))
        kv_set(APPROVED_KEY, draft, user)
    kv_set(_draft_key(month), draft, user)   # 승인이 막혀도 고친 문장은 남김
    return draft, err


def _approve_error(draft):
    used = [t for t in draft["themes"] if t["use"]]
    if not used:
        return "공개할 주제를 하나 이상 고르세요."
    if any(not (t["angle"] and t["say"]) for t in used):
        return "쓰기로 고른 주제에 각도 · 말할 방향을 채우세요."
    bad = [t["theme"] for t in used if _blocked(t)]
    return f"검사에 걸린 주제를 고치거나 빼세요: {', '.join(bad)}" if bad else None


def view(month):
    """화면용: 이 달 초안 + 지금 공개 중인 승인본 요약."""
    pub = kv_get(APPROVED_KEY, {}) or None
    return {"month": month, "draft": get_draft(month), "aiReady": insights_ai.ready(),
            "published": {"month": pub["month"], "approvedBy": pub.get("approvedBy", ""), "approvedAt": pub.get("approvedAt"),
                          "themes": sum(1 for t in pub["themes"] if t.get("use"))} if pub else None}

