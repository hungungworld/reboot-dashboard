"""CS Gmail 연동: 문의 읽기 + 답장 초안 만들기.

발송 기능은 일부러 넣지 않았습니다. 초안만 만들고, 실제 발송은 사람이 Gmail에서 직접 합니다.

Flask 통합 (원본: JUNHEE/server/cs/gmail.py — 읽기·초안 로직은 같음)
- 로그인 정보 위치: DATA_DIR/google/token.json (Render 영구 디스크). 깃에 올리지 않습니다.
  파일 대신 환경변수 GMAIL_TOKEN_JSON(token.json 내용)으로도 줄 수 있습니다.
- 로그인 방법
  1) 웹: 설정 › 연결 › Google로 로그인  (GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET, 웹 애플리케이션 클라이언트)
  2) 로컬: flask --app server gmail-login  (DATA_DIR/google/credentials.json = 데스크톱 앱 클라이언트 JSON)
- OAuth 동의 화면이 '테스트'면 7일마다 다시 로그인합니다.
"""
import base64
import json
import os
from email.message import EmailMessage
from pathlib import Path

from flask import current_app

from server.envkeys import get as env

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
]


class LoginRequired(Exception):
    """token.json이 없거나 만료됨 → 다시 로그인."""


def google_dir():
    d = Path(current_app.config["DATA_DIR"]) / "google"
    d.mkdir(parents=True, exist_ok=True)
    return d


def token_path():
    return google_dir() / "token.json"


def credentials_path():
    return google_dir() / "credentials.json"


def ready():
    """로그인 정보가 있는지만 빠르게 확인 (만료 여부는 실제 호출 때 확인)."""
    return token_path().exists() or bool(os.environ.get("GMAIL_TOKEN_JSON", "").strip())


def save_credentials(creds):
    tmp = token_path().with_suffix(".tmp")
    tmp.write_text(creds.to_json(), encoding="utf-8")
    tmp.replace(token_path())


def disconnect():
    token_path().unlink(missing_ok=True)


def _load_credentials():
    from google.oauth2.credentials import Credentials
    if token_path().exists():
        return Credentials.from_authorized_user_file(str(token_path()), SCOPES)
    raw = os.environ.get("GMAIL_TOKEN_JSON", "").strip()
    if raw:
        return Credentials.from_authorized_user_info(json.loads(raw), SCOPES)
    return None


def service(interactive=False):
    # interactive=False (웹 요청): 브라우저 로그인을 띄우지 않고 LoginRequired를 냄
    from google.auth.exceptions import RefreshError
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = _load_credentials()
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            save_credentials(creds)
        except RefreshError:
            creds = None  # 테스트 모드 7일 만료 → 다시 로그인
    if not creds or not creds.valid:
        if not interactive:
            raise LoginRequired("Gmail 로그인이 필요합니다. 설정 › 연결에서 Google로 로그인하거나, "
                                "로컬에서 flask --app server gmail-login 을 실행하세요.")
        from google_auth_oauthlib.flow import InstalledAppFlow
        if not credentials_path().exists():
            raise LoginRequired(f"{credentials_path()} 가 없습니다. Google Cloud에서 데스크톱 앱 클라이언트 JSON을 받아 "
                                "이 이름으로 저장하세요.")
        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path()), SCOPES)
        creds = flow.run_local_server(port=0)
        save_credentials(creds)
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _headers(msg):
    return {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}


def _body_text(payload):
    # text/plain 본문을 우선으로 찾음 (multipart 안까지)
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", "replace")
    for part in payload.get("parts", []):
        text = _body_text(part)
        if text:
            return text
    return ""


def list_inquiries(svc, query=None, limit=20):
    """GMAIL_QUERY에 맞는 문의를 [{id, thread_id, from, subject, date, received_ms, body}]로 돌려줌."""
    query = query if query is not None else env("GMAIL_QUERY", "newer_than:30d")
    res = svc.users().messages().list(userId="me", q=query, maxResults=limit).execute()
    out = []
    for ref in res.get("messages", []):
        msg = svc.users().messages().get(userId="me", id=ref["id"], format="full").execute()
        h = _headers(msg)
        out.append({
            "id": msg["id"],
            "thread_id": msg["threadId"],
            "from": h.get("from", ""),
            "subject": h.get("subject", ""),
            "date": h.get("date", ""),
            "received_ms": int(msg.get("internalDate", 0)),
            "body": _body_text(msg["payload"]),
        })
    return out


def create_reply_draft(svc, message_id, body):
    """원래 문의와 같은 스레드에 답장 '초안'을 만듦. 발송하지 않음."""
    orig = svc.users().messages().get(
        userId="me", id=message_id, format="metadata",
        metadataHeaders=["From", "Reply-To", "Subject", "Message-ID", "References"],
    ).execute()
    h = _headers(orig)
    subject = h.get("subject", "")
    reply = EmailMessage()
    reply["To"] = h.get("reply-to") or h.get("from", "")
    reply["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    if h.get("message-id"):
        reply["In-Reply-To"] = h["message-id"]
        reply["References"] = f'{h.get("references", "")} {h["message-id"]}'.strip()
    reply.set_content(body)
    raw = base64.urlsafe_b64encode(reply.as_bytes()).decode()
    draft = svc.users().drafts().create(
        userId="me", body={"message": {"raw": raw, "threadId": orig["threadId"]}},
    ).execute()
    return draft["id"]


def profile_email(svc):
    return svc.users().getProfile(userId="me").execute().get("emailAddress", "")
