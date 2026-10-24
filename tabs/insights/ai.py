"""인사이트 AI (OpenAI · server.core.ai.openai_json) — 판단은 규칙, AI는 문장 · 분류 · 요약만.

- 같은 입력이면 저장된 결과를 씀 (insights_ai_cache) → 비용 없음
- 호출은 openai_json이 작업 로그(AI 프롬프트)에 자동으로 남김
- 키가 없으면 부르지 않음 (화면은 규칙 결과 그대로)
"""
import hashlib
import json

from server.core.ai import openai_json, openai_model, openai_ready
from server.extensions import db
from .classify import QUESTION_TOPICS, TOPICS
from .models import AICache, load_json

PART = "insights"
SAFE = ("숙취 해소 · 치료 · 예방 같은 효능 표현(cure, prevent, treat, detox 등)을 새로 만들지 마세요. "
        "주어진 자료에 없는 숫자 · 사실 · 브랜드를 지어내지 마세요. 한국어 존댓말(-요체)로 짧게 쓰세요.")


def _key(kind, payload):
    raw = kind + "\u0001" + json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def cache_get(kind, payload):
    row = db.session.get(AICache, _key(kind, payload))
    return (load_json(row.data, {}), row) if row else (None, None)


def cache_put(kind, payload, data):
    k = _key(kind, payload)
    row = db.session.get(AICache, k) or AICache(key=k, kind=kind)
    row.data, row.model = json.dumps(data, ensure_ascii=False), openai_model()
    db.session.add(row)
    db.session.commit()


def ready():
    return openai_ready()


# ───────── 이번 주 액션 문장 ─────────

ACTIONS_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["id", "fact", "why", "todo"],
        "properties": {"id": {"type": "string"}, "fact": {"type": "string"}, "why": {"type": "string"}, "todo": {"type": "string"}}}}},
}


def _action_payload(actions):
    return [{"id": a["id"], "grade": a["grade"], "rule": a["ruleLabel"], "fact": a["fact"], "why": a["why"], "todo": a["todo"],
             "facts": a["facts"]} for a in actions]


def cached_rewrite(actions):
    """저장된 AI 문장이 있으면 {id: {fact, why, todo}}, 없으면 {}."""
    if not actions:
        return {}, None
    data, row = cache_get("weekly_actions", _action_payload(actions))
    return ((data or {}).get("items") or {}), row


def rewrite_actions(actions):
    """규칙이 고른 신호의 문장만 다듬음 (등급 · 판단은 그대로)."""
    payload = _action_payload(actions)
    data, _ = cache_get("weekly_actions", payload)
    if data:
        return data.get("items") or {}, True
    system = ("너는 미국에 진출한 한국 숙취해소 젤리 · 음료 브랜드(REBOOT, 실제 데이터는 알디콤)의 마케팅 보조야. "
              "규칙이 고른 '이번 주 액션'의 문장을 마케터가 바로 이해하게 다듬어. 등급과 판단은 바꾸지 말고, "
              "각 항목마다 fact(사실 1문장) · why(왜 중요한가 1문장) · todo(할 일 1문장)를 써. id는 그대로 돌려줘. " + SAFE)
    out = openai_json(system, {"actions": payload}, schema=ACTIONS_SCHEMA, schema_name="weekly_actions", part=PART,
                      action="이번 주 액션 문장 작성", max_tokens=2500)
    ids = {a["id"] for a in actions}
    items = {i["id"]: {"fact": i["fact"].strip(), "why": i["why"].strip(), "todo": i["todo"].strip()}
             for i in out.get("items") or [] if i.get("id") in ids and i.get("fact")}
    cache_put("weekly_actions", payload, {"items": items})
    return items, False


# ───────── 리뷰 · 댓글 분류 ─────────

REVIEW_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["id", "topics", "sentiment", "summary_ko"],
        "properties": {"id": {"type": "string"},
                       "topics": {"type": "array", "items": {"type": "string", "enum": list(TOPICS)}},
                       "sentiment": {"type": "string", "enum": ["+", "-", "0"]},
                       "summary_ko": {"type": "string"}}}}},
}


def classify_reviews(rows):
    """rows: [{id, rating, title, text}] → {id: {topics, sentiment, summary_ko}}."""
    system = ("구매자 리뷰를 주제와 감정으로 분류해. 주제는 효과 · 맛·향 · 복용 편의 · 부작용 · 가격 중 해당하는 것 모두(없으면 빈 목록), "
              "감정은 + (칭찬) · - (불만) · 0 (중립), summary_ko는 한국어 한 문장 요약. " + SAFE)
    out = openai_json(system, {"reviews": rows}, schema=REVIEW_SCHEMA, schema_name="review_topics", part=PART,
                      action="리뷰 주제 분류", max_tokens=4000)
    return {str(i["id"]): i for i in out.get("items") or []}


COMMENT_TOPICS = [k for k, _l, _w in QUESTION_TOPICS] + ["none"]
COMMENT_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["id", "relevant", "question", "topic"],
        "properties": {"id": {"type": "string"}, "relevant": {"type": "boolean"}, "question": {"type": "boolean"},
                       "topic": {"type": "string", "enum": COMMENT_TOPICS}}}}},
}


def classify_comments(rows):
    """rows: [{id, text}] → {id: {relevant, question, topic}}."""
    topics = ", ".join(f"{k}={label}" for k, label, _w in QUESTION_TOPICS)
    system = ("유튜브 댓글이 숙취해소 제품 · 해결책과 관련 있는지(relevant), 제품을 사기 전 궁금증을 묻는 질문인지(question) 판단하고 "
              f"질문이면 주제(topic)를 골라: {topics}. 어느 주제에도 맞지 않으면 question=false, topic=none. "
              "숙취 공감 · 한탄 · 농담('anyone else hungover?' 등), 유튜버 칭찬 · 잡담 · 광고는 relevant=false.")
    out = openai_json(system, {"comments": rows}, schema=COMMENT_SCHEMA, schema_name="voc", part=PART,
                      action="VOC(유튜브 댓글) 분류", max_tokens=4000)
    return {str(i["id"]): i for i in out.get("items") or []}


# ───────── 경쟁사: 상품 위치 분류 · 브랜드 분석 ─────────

POSITION_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["id", "form", "timing", "wellness"],
        "properties": {"id": {"type": "string"},
                       "form": {"type": "string", "enum": ["liquid", "solid", "unknown"]},
                       "timing": {"type": "string", "enum": ["pre", "post", "both", "unknown"]},
                       "wellness": {"type": "boolean"}}}}},
}


def classify_positions(rows):
    """rows: [{id, title, text}] → ({id: {form, timing, wellness}}, 저장된 결과였는지)."""
    data, _ = cache_get("product_positions", rows)
    if data:
        return data.get("items") or {}, True
    system = ("숙취 관련 상품의 상품명 · 판매 문구를 보고 분류해. form: 마시는 액상(샷 · 음료 · 병)=liquid, "
              "분말 · 구미 · 젤리 · 정제 · 캡슐 · 스틱 분말=solid. timing: 판매 문구가 음주 전 섭취를 말하면 pre, "
              "음주 후 · 다음 날 회복을 말하면 post, 둘 다면 both. wellness: 허브 · 아유르베다 · 프로바이오틱스 · 간 건강 같은 "
              "기능성 웰니스를 내세우면 true. 문구로 알 수 없으면 unknown (추측하지 마).")
    out = openai_json(system, {"products": rows}, schema=POSITION_SCHEMA, schema_name="product_positions", part=PART,
                      action="경쟁 상품 위치 분류", max_tokens=4000)
    ids = {r["id"] for r in rows}
    items = {i["id"]: {"form": i["form"], "timing": i["timing"], "wellness": bool(i["wellness"])}
             for i in out.get("items") or [] if i.get("id") in ids}
    cache_put("product_positions", rows, {"items": items})
    return items, False


_SRC = {"type": "array", "items": {"type": "string"}}


def _vals(enum):
    return {"type": "object", "additionalProperties": False, "required": ["values", "sources"],
            "properties": {"values": {"type": "array", "items": {"type": "string", "enum": enum}}, "sources": _SRC}}


_TEXT = {"type": "object", "additionalProperties": False, "required": ["text", "sources"],
         "properties": {"text": {"type": "string"}, "sources": _SRC}}
COMPETITOR_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["positioning", "formats", "channels", "usp", "marketing", "implication"],
    "properties": {
        "positioning": _vals(["Pre-Drinking", "Post-Drinking", "Functional Wellness"]),
        "formats": _vals(["Liquid Shot", "Drink", "Powder", "Gummy", "Jelly", "Tablet/Capsule", "기타"]),
        "channels": _vals(["D2C 중심", "Amazon", "대형 오프라인 리테일", "편의점 · 주류점", "아시안 마켓", "기타 온라인몰"]),
        "usp": _TEXT, "marketing": _TEXT, "implication": _TEXT,
    },
}


def analyze_competitor(payload):
    """payload: {brand, tier, evidence:[{id, type, title, text}]} → (7개 항목, 저장된 결과였는지)."""
    data, _ = cache_get("competitor_analysis", payload)
    if data:
        return data, True
    system = ("너는 글로벌 웰니스 · 숙취해소제 시장을 분석하는 수석 브랜드 마케터야. 당사는 미국에 진출한 한국 숙취해소 젤리 · 음료 "
              "브랜드(REBOOT, 실제 데이터는 알디콤)야. 주어진 경쟁사의 evidence(근거 자료)만 보고 아래 항목을 채워. "
              "positioning(1~2개) · formats · channels는 목록에서 고르고, usp(핵심 소구 성분 · 차별점) · "
              "marketing(주요 마케팅 채널 · 버즈 포인트)은 한국어 1~2문장, implication은 알디콤이 벤치마킹하거나 방어할 점 1~2문장. "
              "항목마다 sources에 근거 id(P1 · S1 · R1 · W1 …)를 넣어. 근거에 없는 내용은 쓰지 말고 "
              "text는 '{확인 필요}', values는 빈 목록, sources는 빈 목록으로 둬. 판매 채널은 근거의 판매처 · 홈페이지 문구로만 판단해. " + SAFE)
    out = openai_json(system, payload, schema=COMPETITOR_SCHEMA, schema_name="competitor_analysis", part=PART,
                      action=f"경쟁사 분석: {payload.get('brand', '')}", max_tokens=2000, timeout=90)
    cache_put("competitor_analysis", payload, out)
    return out, False


# ───────── 월간 요약 · 전략 ─────────

_STR = {"type": "string"}
_STRS = {"type": "array", "items": _STR}
MONTHLY_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["summary", "insights", "competitor_trends", "changes", "personas", "swot", "target", "positioning"],
    "properties": {
        "summary": _STRS,
        "insights": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["title", "detail", "faq", "expressions"],
            "properties": {"title": _STR, "detail": _STR, "faq": _STRS, "expressions": _STRS}}},
        "competitor_trends": _STRS,
        "changes": _STRS,
        "personas": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["name", "oneLine", "needs", "message"],
            "properties": {"name": _STR, "oneLine": _STR, "needs": _STR, "message": _STR}}},
        "swot": {"type": "object", "additionalProperties": False, "required": ["S", "W", "O", "T"],
                 "properties": {"S": _STRS, "W": _STRS, "O": _STRS, "T": _STRS}},
        "target": _STR,
        "positioning": _STR,
    },
}


def monthly_analysis(payload):
    system = ("너는 미국 시장에 진출한 한국 숙취해소 젤리 · 음료 브랜드(발표용 이름 REBOOT, 실제 데이터는 알디콤)의 시장 분석가야. "
              "주어진 한 달치 자료(진열대 · 리뷰 · 유튜브 댓글 · 검색 추이 · 지난달 전략)만 근거로 써. "
              "summary는 정확히 3줄, insights는 3개(각각 faq · expressions는 자료에 있는 고객 질문 · 표현 그대로 최대 3개), "
              "competitor_trends는 3줄(주시 중인 경쟁사 먼저), changes는 지난달 전략 대비 바뀐 점(없으면 빈 목록), "
              "personas는 최대 3개(name · oneLine · needs · message), SWOT는 칸마다 최대 3개, target과 positioning은 1문장. "
              "자료가 부족한 항목은 '자료 부족'이라고 써. " + SAFE)
    out = openai_json(system, payload, schema=MONTHLY_SCHEMA, schema_name="monthly_review", part=PART,
                      action="월간 요약 · 전략", max_tokens=6000, timeout=120)
    out["summary"] = [s for s in out.get("summary") or [] if s][:3]
    out["insights"] = (out.get("insights") or [])[:3]
    out["competitor_trends"] = (out.get("competitor_trends") or [])[:3]
    out["personas"] = (out.get("personas") or [])[:3]
    out["swot"] = {k: ((out.get("swot") or {}).get(k) or [])[:3] for k in ("S", "W", "O", "T")}
    return out
