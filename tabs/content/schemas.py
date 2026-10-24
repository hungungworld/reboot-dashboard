"""AI 구조화 출력 (OpenAI Structured Outputs · strict).

strict 규칙: 모든 속성을 required에 넣고 additionalProperties: false. 형식만 맞출 뿐 내용의 사실성은 서버가 따로 검사합니다.
"""
from .options import ACTION_TYPES, INTENTS

_STR = {"type": "string"}
_STR_LIST = {"type": "array", "items": _STR}


def _obj(props):
    return {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}


# 대화 한 턴 (설명서 6.1)
TURN = _obj({
    "intent": {"type": "string", "enum": list(INTENTS)},
    "assistant_text": _STR,
    "decision_patch": {"type": "array", "items": _obj({
        "field": _STR,
        "value": {"anyOf": [_STR, {"type": "boolean"}, _STR_LIST, {"type": "null"}]},
        "status": {"type": "string", "enum": ["confirmed", "proposed", "undecided"]},
    })},
    "candidates": {"type": "array", "items": _obj({"field": _STR, "label": _STR, "value": _STR, "reason": _STR})},
    "clarification_questions": _STR_LIST,
    "action_request": _obj({
        "type": {"type": "string", "enum": list(ACTION_TYPES)},
        "target_version_id": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
        "instructions": _STR,
    }),
})

# 텍스트 초안 (content_draft_v2)
DRAFT = _obj({
    "note": _STR,
    "drafts": {"type": "array", "items": _obj({
        "approach": _STR,
        "title": _STR,
        "body": _STR,
        "claims": {"type": "array", "items": _obj({"text": _STR, "entity_id": _STR, "fact_id": _STR})},
        "needs_check": _STR_LIST,
    })},
})

# 시트 추천 (sheet_suggestion_v2)
SUGGEST = _obj({"items": {"type": "array", "items": _obj({"value": _STR, "reason": _STR})}})

# 이미지 프롬프트 (creative_edit_v2)
IMAGE_PLAN = _obj({
    "prompt_en": _STR,
    "keep": _STR_LIST,
    "change": _STR_LIST,
    "text_layers": {"type": "array", "items": _obj({"role": _STR, "text": _STR})},
    "notes_ko": _STR,
    "flavors": {"type": "array", "items": {"type": "string", "enum": ["cherry", "lemon", "lime"]}},
    "include_character": {"type": "boolean"},
})

# 영상 프롬프트 (video_v1) — Higgsfield Seedance 2.0
VIDEO_PLAN = _obj({
    "prompt_en": _STR,
    "notes_ko": _STR,
    "flavors": {"type": "array", "items": {"type": "string", "enum": ["cherry", "lemon", "lime"]}},
    "include_character": {"type": "boolean"},
})

# 인터뷰 질문 하나 (interview_v1) — 보기는 서버가 정확히 3개만 씀
INTERVIEW = _obj({
    "done": {"type": "boolean"},
    "ready": {"type": "boolean"},
    "intro": _STR,
    "field": _STR,
    "label": _STR,
    "question": _STR,
    "options": {"type": "array", "items": _obj({"label": _STR, "value": _STR, "reason": _STR})},
})

# 보조 검토 (review_v2)
REVIEW = _obj({
    "summary": _STR,
    "issues": {"type": "array", "items": _obj({"location": _STR, "problem": _STR, "suggestion": _STR, "basis": _STR})},
    "checked_scope": _STR,
})
