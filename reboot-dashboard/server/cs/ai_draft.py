"""CS 답장 초안 다듬기 (Claude · 페르소나).

parts/cs/data.js의 persona(300자 이내)로 템플릿 초안을 고객 문의에 맞게 다시 씁니다.
결과는 항상 컴플라이언스 재검사와 담당자 최종 승인을 거칩니다. 발송하지 않습니다.
Flask 통합: 키는 server.envkeys(설정 › 연결 화면 → .env)에서 읽습니다.
"""
import json
import re

import anthropic

from ..envkeys import get as env

MODEL = "claude-opus-5-5"

# 페르소나보다 우선하는 안전 규칙 (페르소나 문구가 바뀌어도 유지)
RULES = """Hard rules (they override the persona):
1. Write the reply email in English only. Plain text, no markdown, no subject line.
2. Never claim or imply the product prevents, treats, cures, relieves or reduces hangovers or any condition, protects the liver, detoxifies, or works "instantly"/"guaranteed". It is a conventional food.
3. Never invent facts: order status, tracking numbers, dates, refund amounts, ingredients, nutrition, allergens, policies or deadlines. Use only facts given in the inquiry, the current draft or the fact sheet. For anything else write a placeholder exactly like "[확인 필요: what is missing]" (Korean inside the brackets). Keep every existing "[확인 필요: ...]" placeholder unless the fact is given.
4. Health or side-effect inquiries (type C1, C2): first ask them to stop using the product and to contact a doctor (or emergency services if severe); do not give medical advice or say the product is safe for them.
5. Do not offer discounts, free products or refunds in exchange for reviews or ratings.
6. Keep the greeting with the customer's name and keep the sign-off of the current draft (brand name) unchanged.
7. Be warm, polite and concise (about 80-180 words). Apologise once when appropriate, state the next step and when they will hear back (use a placeholder if the timing is unknown)."""

SCHEMA = {
    "type": "object",
    "properties": {
        "draft": {"type": "string"},
        "notes_ko": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["draft", "notes_ko"],
    "additionalProperties": False,
}


class DraftError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def available():
    return env("ANTHROPIC_API_KEY") != ""


def _clip(v, n):
    return str(v if v is not None else "")[:n]


def draft(persona, inquiry, current, facts=None, banned=None):
    persona = persona if isinstance(persona, dict) else {}
    inquiry = inquiry if isinstance(inquiry, dict) else {}
    persona_text = _clip(persona.get("text"), 600).strip()
    if not persona_text:
        raise DraftError("페르소나가 없습니다 (parts/cs/data.js persona).", 400)
    if not _clip(inquiry.get("body"), 20000).strip():
        raise DraftError("문의 본문이 없습니다.", 400)
    if not available():
        raise DraftError("ANTHROPIC_API_KEY가 없습니다 (설정 › 연결 또는 .env).", 503)

    facts = {k: _clip(v, 300) for k, v in (facts or {}).items() if v not in (None, "")} if isinstance(facts, dict) else {}
    payload = {
        "inquiry": {
            "type": _clip(inquiry.get("type"), 4), "type_name": _clip(inquiry.get("typeName"), 40),
            "customer_name": _clip(inquiry.get("name"), 80), "order_number": _clip(inquiry.get("orderNo"), 40),
            "subject": _clip(inquiry.get("subject"), 300), "body": _clip(inquiry.get("body"), 6000),
        },
        "fact_sheet": facts,
        "current_draft": _clip(current, 6000),
        "banned_terms": [_clip(t, 60) for t in (banned or [])][:120],
    }
    system = [
        {"type": "text", "text": "You write customer-service reply drafts for REBOOT as this persona (written in Korean):\n" + persona_text},
        {"type": "text", "text": RULES + "\n\nReturn `draft` (the full English email) and `notes_ko`: 1-4 short Korean notes for the human approver "
                                         "(what you changed, which placeholders remain, anything to check)."},
    ]
    client = anthropic.Anthropic(api_key=env("ANTHROPIC_API_KEY"), timeout=120.0)
    try:
        res = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=system,
            messages=[{"role": "user", "content": "Rewrite the current draft as a reply to this inquiry. Input as JSON:\n"
                                                  + json.dumps(payload, ensure_ascii=False)}],
        )
    except anthropic.AuthenticationError:
        raise DraftError("ANTHROPIC_API_KEY가 올바르지 않습니다 (설정 › 연결 확인).", 503)
    except anthropic.RateLimitError:
        raise DraftError("요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도하세요.", 429)
    except anthropic.APIStatusError as e:
        raise DraftError(f"AI 서버 오류 ({e.status_code}). 잠시 뒤 다시 시도하세요.")
    except anthropic.APIConnectionError:
        raise DraftError("AI 서버에 연결하지 못했습니다 (인터넷 확인).")
    if res.stop_reason == "refusal":
        raise DraftError("AI가 이 문의의 초안 작성을 거절했습니다. 템플릿으로 직접 작성하세요.", 422)
    if res.stop_reason == "max_tokens":
        raise DraftError("AI 응답이 잘렸습니다. 다시 시도하세요.")
    text = next((b.text for b in res.content if b.type == "text"), "")
    try:
        out = json.loads(text)
    except ValueError:
        raise DraftError("AI 응답을 읽지 못했습니다. 다시 시도하세요.")
    body = str(out.get("draft", "")).strip()
    if not body:
        raise DraftError("AI가 빈 초안을 돌려줬습니다. 다시 시도하세요.")
    # 영어 이외 빈칸 표기 통일: [확인 필요 …] 형식이 깨지지 않게
    body = re.sub(r"\[\s*확인\s*필요\s*[:：]?\s*(?=[^\]\s])", "[확인 필요: ", body)
    return {"draft": body, "notes_ko": [str(n)[:200] for n in out.get("notes_ko", [])][:4], "model": res.model}
