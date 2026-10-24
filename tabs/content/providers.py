"""OpenAI 어댑터 (텍스트 · 이미지).

- 텍스트: 공통 server.core.ai.openai_json (작업 로그 자동 기록). 모델은 CONTENT_TEXT_MODEL → OPENAI_MODEL 순서 (하나만)
- 이미지: OpenAI Images (CONTENT_IMAGE_MODEL, 기본 gpt-image-1). 유료 호출이라 자동 재시도하지 않음 (max_retries=0)
  응답 시간 초과는 '제출 여부 불명'(SubmissionUnknown)으로 따로 알려 다시 제출하지 않게 함 (README 8장)
- 연결 확인: 모델 조회(models.retrieve)만 — 생성 비용 없음
테스트는 이 모듈의 call_json · ready · generate_image · edit_image · check_connection을 바꿔 끼웁니다 (인터넷·키 없이).
"""
import base64

from server import envkeys
from server.core.ai import AIError, openai_json, openai_model, openai_ready

DEFAULT_IMAGE_MODEL = "gpt-image-1"
IMAGE_TIMEOUT = 240


class ProviderError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


class SubmissionUnknown(ProviderError):
    """요청은 보냈지만 결과를 받지 못함 — 생성 여부를 알 수 없으니 자동으로 다시 제출하지 않음."""


def ready():
    return openai_ready()


def text_model():
    return envkeys.get("CONTENT_TEXT_MODEL") or openai_model()


def image_model():
    return envkeys.get("CONTENT_IMAGE_MODEL") or DEFAULT_IMAGE_MODEL


def image_supports_edit(model=None):
    """기준 이미지를 넣어 고치는 편집을 지원하는 모델인가 (GPT 이미지 계열)."""
    m = (model or image_model()).lower()
    return m.startswith(("gpt-image", "chatgpt-image"))


def call_json(system, user, *, schema, name, action, max_tokens=3000, timeout=120):
    return openai_json(system, user, schema=schema, schema_name=name, model=text_model(), max_tokens=max_tokens,
                       timeout=timeout, part="content", action=action)


def _client():
    import openai
    if not ready():
        raise ProviderError("OpenAI 키가 없습니다. 설정 › 연결에서 OPENAI_API_KEY를 넣어 주세요.", 503)
    return openai.OpenAI(api_key=envkeys.get("OPENAI_API_KEY"), timeout=IMAGE_TIMEOUT, max_retries=0)


def _png_from(res):
    data = getattr(res, "data", None) or []
    b64 = getattr(data[0], "b64_json", None) if data else None
    if not b64:
        raise ProviderError("이미지 결과(파일)를 받지 못했습니다.")
    try:
        return base64.b64decode(b64)
    except ValueError:
        raise ProviderError("이미지 결과를 읽지 못했습니다.")


def _run(fn, model):
    import openai
    try:
        return fn()
    except openai.APITimeoutError:
        raise SubmissionUnknown("이미지 응답이 늦어 연결을 끊었습니다. 생성 여부를 확인할 수 없어 자동으로 다시 제출하지 않습니다.", 504)
    except openai.AuthenticationError:
        raise ProviderError("OpenAI 키가 올바르지 않습니다 (설정 › 연결 확인).", 503)
    except (openai.PermissionDeniedError, openai.NotFoundError):
        raise ProviderError(f"이 키로는 이미지 모델 '{model}'을 쓸 수 없습니다 (CONTENT_IMAGE_MODEL 확인 · 조직 인증 필요 여부 확인).", 503)
    except openai.RateLimitError:
        raise ProviderError("요청이 많거나 사용 한도를 넘었습니다. 잠시 뒤 다시 요청하세요.", 429)
    except openai.BadRequestError as e:
        code = getattr(e, "code", None) or "bad_request"
        if "moderation" in str(code) or "safety" in str(code):
            raise ProviderError("이미지 모델의 안전 정책에 걸려 만들지 못했습니다. 요청 표현을 바꿔 보세요.", 400)
        raise ProviderError(f"이미지 요청을 처리하지 못했습니다 ({code}).", 400)
    except openai.APIConnectionError:
        raise SubmissionUnknown("이미지 서버 연결이 끊겼습니다. 생성 여부를 확인할 수 없어 자동으로 다시 제출하지 않습니다.", 502)
    except openai.APIStatusError as e:
        raise ProviderError(f"이미지 서버 오류 ({e.status_code}). 잠시 뒤 다시 요청하세요.", 502)


def generate_image(prompt, size, model):
    client = _client()
    res = _run(lambda: client.images.generate(model=model, prompt=prompt, size=size, n=1), model)
    return _png_from(res), _usage(res)


def edit_image(path, prompt, size, model):
    """기준 이미지 파일을 넣어 편집 (GPT 이미지 계열만)."""
    if not image_supports_edit(model):
        raise ProviderError(f"이미지 모델 '{model}'은 기준 이미지 편집을 지원하지 않습니다.", 400)
    client = _client()

    def call():
        with open(path, "rb") as f:
            return client.images.edit(model=model, image=f, prompt=prompt, size=size, n=1)
    res = _run(call, model)
    return _png_from(res), _usage(res)


def check_connection():
    """키가 실제로 동작하는지 — 모델 조회만 함 (토큰·생성 비용 없음). 반환: {ok, message, models:{이름: ok}}"""
    if not ready():
        return {"ok": False, "message": "OpenAI 키가 없습니다 (설정 › 연결).", "models": {}}
    import openai
    client = openai.OpenAI(api_key=envkeys.get("OPENAI_API_KEY"), timeout=15, max_retries=0)
    models, msg = {}, ""
    for m in dict.fromkeys([text_model(), image_model()]):
        try:
            client.models.retrieve(m)
            models[m] = True
        except openai.AuthenticationError:
            return {"ok": False, "message": "OpenAI 키가 올바르지 않습니다 (설정 › 연결 확인).", "models": {}}
        except (openai.PermissionDeniedError, openai.NotFoundError):
            models[m], msg = False, f"이 키로는 '{m}' 모델을 쓸 수 없습니다."
        except (openai.APIConnectionError, openai.APITimeoutError):
            return {"ok": False, "message": "OpenAI 서버에 연결하지 못했습니다 (인터넷 확인).", "models": {}}
        except openai.APIStatusError as e:
            models[m], msg = False, f"OpenAI 서버 오류 ({e.status_code})."
    ok = all(models.values())
    return {"ok": ok, "message": "키와 모델 접근을 확인했어요." if ok else msg, "models": models}


def _usage(res):
    u = getattr(res, "usage", None)
    if not u:
        return {}
    return {"input": getattr(u, "input_tokens", None), "output": getattr(u, "output_tokens", None),
            "total": getattr(u, "total_tokens", None)}


__all__ = ["AIError", "ProviderError", "SubmissionUnknown", "ready", "text_model", "image_model", "image_supports_edit",
           "call_json", "generate_image", "edit_image", "check_connection"]
