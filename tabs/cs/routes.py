"""고객 응대(CS) API (담당: 소준희). 예전 server/app.py와 같은 주소·입력·출력입니다.

  GET  /api/cs/gmail/inquiries   GMAIL_QUERY에 맞는 문의 (최대 50건)
  POST /api/cs/gmail/draft       {message_id, body} → Gmail 답장 초안 ([확인 필요]가 남으면 거절)
  POST /api/cs/gmail/preview     {message_id} → 보내기 전 받는 사람·제목 확인 (보내지 않음)
  POST /api/cs/gmail/send        {message_id, body, approved_by, verdict} → 승인된 답장을 바로 보냄 (BLOCK·[확인 필요]·미승인은 거절)
  POST /api/cs/ai-draft          {persona, inquiry, current, facts, banned} → 페르소나로 다듬은 영문 초안
  GET  /api/cs/gmail/status      Gmail 로그인 상태 (연결된 주소)
  GET  /api/cs/gmail/connect     Google 로그인 시작 (웹 · GOOGLE_CLIENT_ID/SECRET 필요)
  GET  /api/cs/gmail/callback    Google 로그인 돌아오는 주소 (Google Cloud에 이 주소를 등록)
  POST /api/cs/gmail/disconnect  연결 해제 (token 삭제)
"""
import os
import re

from flask import Blueprint, abort, current_app, jsonify, redirect, request, session, url_for

from server import envkeys, worklog
from server.extensions import limiter
from server.security import ApiError, clip, json_body

bp = Blueprint("cs", __name__, url_prefix="/api/cs")

GMAIL_ID = re.compile(r"^[A-Za-z0-9]{6,64}$")
TODO = re.compile(r"\[확인 필요")

# 로컬(http://127.0.0.1)에서도 Google 로그인 시험이 되게. 운영(https)에서는 쓰이지 않음
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")


@bp.get("/gmail/inquiries")
def gmail_inquiries():
    from . import gmail
    try:
        svc = gmail.service(interactive=False)
        items = gmail.list_inquiries(svc, limit=50)
    except gmail.LoginRequired as e:
        raise ApiError(str(e), 401)
    except Exception as e:  # googleapiclient.errors.HttpError 등
        raise ApiError(f"Gmail 읽기 실패: {type(e).__name__}", 502)
    # 화면에 필요한 값만, 길이 제한
    return jsonify(items=[{
        "id": m["id"], "thread_id": m["thread_id"], "from": m["from"][:200], "subject": m["subject"][:300],
        "date": m["date"][:80], "received_ms": m.get("received_ms", 0), "body": m["body"][:20000],
    } for m in items])


@bp.post("/gmail/draft")
def gmail_draft():
    from . import gmail
    data = json_body(max_bytes=64 * 1024)
    message_id = str(data.get("message_id", ""))
    body = str(data.get("body", ""))
    if not GMAIL_ID.match(message_id):
        raise ApiError("Gmail 문의 번호가 올바르지 않습니다.")
    if not body.strip() or len(body) > 20000:
        raise ApiError("초안 내용이 비었거나 너무 깁니다.")
    if TODO.search(body):
        raise ApiError("[확인 필요] 빈칸이 남아 있어 초안을 만들 수 없습니다.")
    try:
        svc = gmail.service(interactive=False)
        draft_id = gmail.create_reply_draft(svc, message_id, body)
    except gmail.LoginRequired as e:
        raise ApiError(str(e), 401)
    except Exception as e:
        raise ApiError(f"Gmail 초안 만들기 실패: {type(e).__name__}", 502)
    worklog.add("cs", "승인 · 선정", "Gmail 답장 초안 생성", approval=None, detail={"draft_id": draft_id})
    return jsonify(draft_id=draft_id)


def _gmail_input(data):
    message_id = str(data.get("message_id", ""))
    if not GMAIL_ID.match(message_id):
        raise ApiError("Gmail 문의 번호가 올바르지 않습니다.")
    return message_id


@bp.post("/gmail/preview")
def gmail_preview():
    """보내기 전 확인: 받는 사람·제목 (보내지 않음)."""
    from . import gmail
    message_id = _gmail_input(json_body(max_bytes=4 * 1024))
    try:
        out = gmail.reply_preview(gmail.service(interactive=False), message_id)
    except gmail.LoginRequired as e:
        raise ApiError(str(e), 401)
    except Exception as e:
        raise ApiError(f"Gmail 확인 실패: {type(e).__name__}", 502)
    return jsonify(to=clip(out["to"], 300), subject=clip(out["subject"], 300))


@bp.post("/gmail/send")
@limiter.limit("20 per minute", methods=["POST"], error_message="보내기 요청이 너무 많습니다. 1분 뒤 다시 시도하세요.")
def gmail_send():
    """최종 승인된 답장을 Gmail로 바로 보냄. 화면 검사와 별도로 서버도 막음:
    승인자·승인 판정이 없거나, 승인 판정이 BLOCK이거나, [확인 필요] 빈칸이 남았으면 거절."""
    from . import gmail
    data = json_body(max_bytes=64 * 1024)
    message_id = _gmail_input(data)
    body = str(data.get("body", ""))
    approved_by, verdict = clip(data.get("approved_by"), 60).strip(), clip(data.get("verdict"), 8)
    if not body.strip() or len(body) > 20000:
        raise ApiError("답장 내용이 비었거나 너무 깁니다.")
    if TODO.search(body):
        raise ApiError("[확인 필요] 빈칸이 남아 있어 보낼 수 없습니다.")
    if not approved_by or verdict not in ("PASS", "REVISE", "REVIEW", "COND"):
        raise ApiError("최종 승인된 답장만 보낼 수 있습니다 (승인자·재검사 판정 필요 · BLOCK은 보낼 수 없음).")
    try:
        svc = gmail.service(interactive=False)
        sent_id, to = gmail.send_reply(svc, message_id, body)
    except gmail.LoginRequired as e:
        raise ApiError(str(e), 401)
    except Exception as e:
        raise ApiError(f"Gmail 보내기 실패: {type(e).__name__}", 502)
    worklog.add("cs", "승인 · 선정", "Gmail 답장 보냄", approval=approved_by,
                detail={"sent_id": sent_id, "to": clip(to, 200), "verdict": verdict})
    return jsonify(sent_id=sent_id, to=clip(to, 300))


@bp.post("/ai-draft")
def ai_draft():
    from . import ai_draft as drafting
    data = json_body(max_bytes=64 * 1024)
    try:
        out = drafting.draft(data.get("persona"), data.get("inquiry"), data.get("current", ""),
                             data.get("facts"), data.get("banned"))
    except drafting.DraftError as e:
        raise ApiError(str(e), e.status)
    inquiry = data.get("inquiry") if isinstance(data.get("inquiry"), dict) else {}
    worklog.add("cs", "AI 프롬프트", "CS 답장 초안 다듬기", detail={
        "model": out.get("model"), "type": clip(inquiry.get("type"), 4), "notes": out.get("notes_ko")})
    return jsonify(out)


# ───────── Gmail 로그인 (웹) ─────────

def _flow(state=None):
    from google_auth_oauthlib.flow import Flow

    from . import gmail
    client_id, secret = envkeys.get("GOOGLE_CLIENT_ID"), envkeys.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not secret:
        raise ApiError("GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET이 없습니다 (설정 › 연결 또는 .env).", 503)
    cfg = {"web": {"client_id": client_id, "client_secret": secret,
                   "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                   "token_uri": "https://oauth2.googleapis.com/token"}}
    flow = Flow.from_client_config(cfg, scopes=gmail.SCOPES, state=state)
    flow.redirect_uri = url_for("cs.gmail_callback", _external=True)
    return flow


@bp.get("/gmail/status")
def gmail_status():
    from . import gmail
    if not gmail.ready():
        return jsonify(connected=False, email="", webLogin=envkeys.has("GOOGLE_CLIENT_ID") and envkeys.has("GOOGLE_CLIENT_SECRET"))
    try:
        email = gmail.profile_email(gmail.service(interactive=False))
        return jsonify(connected=True, email=email, webLogin=True)
    except gmail.LoginRequired as e:
        return jsonify(connected=False, email="", error=str(e), webLogin=True)
    except Exception as e:
        return jsonify(connected=False, email="", error=f"Gmail 확인 실패: {type(e).__name__}", webLogin=True)


@bp.get("/gmail/connect")
def gmail_connect():
    if not current_app.config.get("IS_PRODUCTION"):
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
    flow = _flow()
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    session["gmail_oauth_state"] = state
    session["gmail_oauth_verifier"] = getattr(flow, "code_verifier", None)
    return redirect(auth_url)


@bp.get("/gmail/callback")
def gmail_callback():
    from . import gmail
    state = session.pop("gmail_oauth_state", None)
    verifier = session.pop("gmail_oauth_verifier", None)
    if not state or request.args.get("state") != state:
        abort(400)
    if request.args.get("error"):
        return redirect(url_for("core.part_page", part_id="settings", gmail="denied"))
    flow = _flow(state)
    if verifier:
        flow.code_verifier = verifier
    try:
        flow.fetch_token(authorization_response=request.url)
    except Exception as e:
        current_app.logger.warning("Gmail 로그인 실패: %s", type(e).__name__)
        return redirect(url_for("core.part_page", part_id="settings", gmail="failed"))
    gmail.save_credentials(flow.credentials)
    worklog.add("settings", "기타", "Gmail(Google) 로그인 연결")
    return redirect(url_for("core.part_page", part_id="settings", gmail="connected"))


@bp.post("/gmail/disconnect")
def gmail_disconnect():
    from . import gmail
    gmail.disconnect()
    worklog.add("settings", "기타", "Gmail(Google) 연결 해제")
    return jsonify(ok=True)
