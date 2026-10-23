"""한→영 번역 (Claude): 마케터가 한국어로 쓴 광고 문구를 미국용 영어 문구로 옮깁니다.

뜻을 그대로 옮기는 것이 목적입니다. 효능 표현을 빼거나 더하지 않아야 번역한 뒤의 규칙 점검이 의미가 있습니다.
판정은 화면의 규칙 점검이 하고, 번역 결과는 참고용입니다.
Flask 통합: 키는 server.envkeys(설정 › 연결 화면 → .env)에서 읽습니다.
"""
import json

import anthropic

from server.envkeys import get as env

MODEL = "claude-opus-5-5"
MAX_TEXT = 2000

SYSTEM = """You translate Korean marketing copy into natural US English for REBOOT ("Restart Your Day"), a Korean after-party brand of stick jelly and non-carbonated drinks sold in the US as conventional foods.

Translate faithfully:
- Keep the meaning, tone and every claim exactly as written. Do not soften, remove, add or "fix" any claim, including health, hangover, safety, sugar or effectiveness claims. A separate compliance check runs on your translation, so it must show what the Korean actually says.
- Write it the way a US marketer would phrase the same message (natural, concise, not word-for-word), keeping line breaks.
- Keep brand and product names, numbers, hashtags, @handles and URLs as written. Keep "REBOOT" in capitals.
- Do not invent facts that are not in the Korean text.

Return `text` (the English copy) and `note_ko`: one short Korean sentence only if something could not be translated directly (a pun, a Korea-only reference, an ambiguous phrase); otherwise an empty string."""

SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "note_ko": {"type": "string"},
    },
    "required": ["text", "note_ko"],
    "additionalProperties": False,
}


class TranslateError(Exception):
    """화면에 그대로 보여 줄 수 있는 실패 (키·내부 정보 없음)."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def available():
    return env("ANTHROPIC_API_KEY") != ""


def to_english(text):
    text = str(text or "").strip()
    if not text:
        raise TranslateError("번역할 한국어 문구가 없습니다.", 400)
    if len(text) > MAX_TEXT:
        raise TranslateError(f"문구가 너무 깁니다 ({MAX_TEXT}자 이하).", 400)
    if not available():
        raise TranslateError("ANTHROPIC_API_KEY가 없습니다 (설정 › 연결 또는 .env).", 503)

    client = anthropic.Anthropic(api_key=env("ANTHROPIC_API_KEY"), timeout=120.0)
    try:
        res = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": "Translate this Korean copy into English:\n" + text}],
        )
    except anthropic.AuthenticationError:
        raise TranslateError("ANTHROPIC_API_KEY가 올바르지 않습니다 (설정 › 연결 확인).", 503)
    except anthropic.PermissionDeniedError:
        raise TranslateError("이 API 키로는 해당 모델을 쓸 수 없습니다.", 503)
    except anthropic.RateLimitError:
        raise TranslateError("요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도하세요.", 429)
    except anthropic.APIStatusError as e:
        raise TranslateError(f"AI 서버 오류 ({e.status_code}). 잠시 뒤 다시 시도하세요.")
    except anthropic.APIConnectionError:
        raise TranslateError("AI 서버에 연결하지 못했습니다 (인터넷 확인).")

    if res.stop_reason == "refusal":
        raise TranslateError("AI가 이 문구의 번역을 거절했습니다. 직접 영어로 써서 점검하세요.", 422)
    if res.stop_reason == "max_tokens":
        raise TranslateError("AI 응답이 길어 잘렸습니다. 문구를 줄여 다시 시도하세요.")
    body = next((b.text for b in res.content if b.type == "text"), "")
    try:
        out = json.loads(body)
    except ValueError:
        raise TranslateError("AI 응답을 읽지 못했습니다. 다시 시도하세요.")
    english = str(out.get("text", "")).strip()
    if not english:
        raise TranslateError("AI가 빈 번역을 돌려줬습니다. 다시 시도하세요.")
    return {"text": english[:4000], "note_ko": str(out.get("note_ko", ""))[:300], "model": res.model}
