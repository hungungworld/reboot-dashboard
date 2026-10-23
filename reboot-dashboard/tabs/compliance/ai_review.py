"""컴플라이언스 AI 2차 판정 (Claude).

규칙 판정(R1~R12)을 대신하지 않습니다. 규칙 결과를 함께 넘겨 '규칙이 놓친 위험'과
'더 안전한 문장'을 참고용으로 받습니다. 최종 사용 여부는 담당자 승인으로 정합니다.

Flask 통합: 키는 server.envkeys(설정 › 연결 화면 → .env)에서 읽습니다. 로직은 원본(JUNHEE/server)과 같습니다.
"""
import json
import sys

import anthropic

from server.envkeys import get as env

MODEL = "claude-opus-5-5"
VERDICTS = ["BLOCK", "REVISE", "COND", "REVIEW", "PASS"]
MAX_TEXT = 2000

SYSTEM = """You review English advertising copy for REBOOT (slogan "Restart Your Day"), a Korean after-party brand sold in the United States.
The line-up is four conventional foods, not dietary supplements and not drugs: Reboot Jelly Original (stick jelly, individually wrapped sticks),
Reboot Jelly Balance (a sugar-reduced stick jelly), Reboot Drink Original (a non-carbonated drink in small bottles, 6 per box) and Reboot Drink Balance (a sugar-reduced version of that drink).
All four come in lime, cherry and lemon (flavors are tentative).
The request names which product the copy is for.

Assess the copy the way a careful US food-advertising compliance reviewer would:
- FDA: a conventional food must not claim to prevent, treat, cure or mitigate a disease or condition (a hangover claim reads as a drug claim); structure/function claims on a conventional food must come from the food's nutritive value; no implied medical or clinical authority.
- FTC: every objective claim needs competent and reliable substantiation; testimonials, reviews and endorsements must be genuine and disclosed; no incentivised reviews; no claims that encourage excessive drinking.
- Sugar claims (21 CFR 101.60(c)): "low sugar" is not a defined claim and must not be used; "reduced/less sugar" needs at least 25% less sugar than a named reference product with the amounts; "sugar free" needs under 0.5 g per serving; "no added sugar" has its own conditions. Only the sugar-reduced products may make a comparative sugar claim, and only once the numbers are verified.
- The team's own rules R1-R12 are listed below. Use their codes when an issue matches one; use "OTHER" for a risk the rules do not cover.

Verdict scale (pick the strictest that applies):
BLOCK = must not be used as written; REVISE = needs rewording; COND = acceptable only under a stated condition (channel, substantiation, disclosure); REVIEW = a human must judge; PASS = no issue found.
When you are unsure, choose REVIEW rather than PASS. PASS never means legal approval.

Write `summary` and each `reason` in Korean (plain, short sentences for a marketer). Write `phrase`, `suggestion` and `rewrite` in English.
`rewrite` is one safer version of the whole copy that keeps its intent; leave it empty when the verdict is PASS.
Do not invent product facts (ingredients, test results, certifications) in suggestions or the rewrite."""

SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": VERDICTS},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "summary": {"type": "string"},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "phrase": {"type": "string"},
                    "code": {"type": "string"},
                    "verdict": {"type": "string", "enum": VERDICTS},
                    "reason": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
                "required": ["phrase", "code", "verdict", "reason", "suggestion"],
                "additionalProperties": False,
            },
        },
        "rewrite": {"type": "string"},
    },
    "required": ["verdict", "confidence", "summary", "issues", "rewrite"],
    "additionalProperties": False,
}


class ReviewError(Exception):
    """화면에 그대로 보여 줄 수 있는 실패 (키·내부 정보 없음)."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def available():
    return env("ANTHROPIC_API_KEY") != ""


def _rules_text(rules):
    lines = []
    for r in (rules or [])[:30]:
        if not isinstance(r, dict):
            continue
        lines.append(f'{str(r.get("code", ""))[:8]} {str(r.get("name", ""))[:80]} — default {str(r.get("verdict", ""))[:8]}: {str(r.get("reason", ""))[:300]}')
    return "Team rules:\n" + ("\n".join(lines) if lines else "(not provided)")


def review(text, channel="", category="FOOD", rule=None, rules=None, product=""):
    text = str(text or "").strip()
    if not text:
        raise ReviewError("점검할 문구가 없습니다.", 400)
    if len(text) > MAX_TEXT:
        raise ReviewError(f"문구가 너무 깁니다 ({MAX_TEXT}자 이하).", 400)
    if not available():
        raise ReviewError("ANTHROPIC_API_KEY가 없습니다 (설정 › 연결 또는 .env).", 503)

    rule = rule if isinstance(rule, dict) else {}
    payload = {
        "copy": text,
        "channel": str(channel)[:60],
        "standard": "dietary supplement (comparison only)" if category == "SUPPLEMENT" else "conventional food",
        "product": str(product)[:300],
        "rule_engine": {
            "verdict": str(rule.get("verdict", ""))[:8],
            "codes": [str(c)[:8] for c in (rule.get("codes") or [])][:10],
            "matched_terms": [str(t)[:60] for t in (rule.get("terms") or [])][:20],
        },
    }
    client = anthropic.Anthropic(api_key=env("ANTHROPIC_API_KEY"), timeout=120.0)
    try:
        res = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            # 규칙 목록은 매번 같으니 시스템 프롬프트 끝에 캐시 지점
            system=[
                {"type": "text", "text": SYSTEM},
                {"type": "text", "text": _rules_text(rules), "cache_control": {"type": "ephemeral"}},
            ],
            messages=[{"role": "user", "content": "Review this ad copy. Input as JSON:\n" + json.dumps(payload, ensure_ascii=False)}],
        )
    except anthropic.AuthenticationError:
        raise ReviewError("ANTHROPIC_API_KEY가 올바르지 않습니다 (설정 › 연결 확인).", 503)
    except anthropic.PermissionDeniedError:
        raise ReviewError("이 API 키로는 해당 모델을 쓸 수 없습니다.", 503)
    except anthropic.RateLimitError:
        raise ReviewError("요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도하세요.", 429)
    except anthropic.APIStatusError as e:
        raise ReviewError(f"AI 서버 오류 ({e.status_code}). 잠시 뒤 다시 시도하세요.")
    except anthropic.APIConnectionError:
        raise ReviewError("AI 서버에 연결하지 못했습니다 (인터넷 확인).")

    if res.stop_reason == "refusal":
        raise ReviewError("AI가 이 문구의 판정을 거절했습니다. 규칙 판정과 담당자 검토로 진행하세요.", 422)
    if res.stop_reason == "max_tokens":
        raise ReviewError("AI 응답이 길어 잘렸습니다. 문구를 줄여 다시 시도하세요.")
    body = next((b.text for b in res.content if b.type == "text"), "")
    try:
        out = json.loads(body)
    except ValueError:
        raise ReviewError("AI 응답을 읽지 못했습니다. 다시 시도하세요.")
    out["model"] = res.model
    return out


if __name__ == "__main__":
    # 한 문장 시험: python -m tabs.compliance.ai_review "Prevents hangovers."
    from server import create_app
    with create_app().app_context():
        sample = " ".join(sys.argv[1:]) or "Prevents hangovers."
        try:
            print(json.dumps(review(sample, channel="B2C 광고·SNS"), ensure_ascii=False, indent=2))
        except ReviewError as e:
            sys.exit(f"실패: {e}")
