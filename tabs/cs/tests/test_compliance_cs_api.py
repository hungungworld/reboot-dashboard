"""컴플라이언스 · CS API — 키가 없을 때의 동작과 입력 검증 (인터넷 · 키 없이)."""


def test_ai_review_without_key(auth_client):
    res = auth_client.post("/api/compliance/ai-review", json={"text": "Prevents hangovers.", "channel": "b2c"})
    assert res.status_code == 503
    assert "ANTHROPIC_API_KEY" in res.get_json()["error"]


def test_ai_review_input_checks(auth_client):
    assert auth_client.post("/api/compliance/ai-review", json={"text": ""}).status_code == 400
    assert auth_client.post("/api/compliance/ai-review", json={"text": "x" * 2001}).status_code == 400
    assert auth_client.post("/api/compliance/ai-review", data="x", content_type="text/plain").status_code == 415


def test_ko_requires_items(auth_client):
    assert auth_client.post("/api/compliance/ko", json={"items": []}).status_code == 400


def test_translate_without_key(auth_client):
    res = auth_client.post("/api/compliance/translate", json={"text": "파티 전에 가볍게 챙기는 젤리"})
    assert res.status_code == 503
    assert "ANTHROPIC_API_KEY" in res.get_json()["error"]


def test_translate_input_checks(auth_client):
    assert auth_client.post("/api/compliance/translate", json={"text": "  "}).status_code == 400
    assert auth_client.post("/api/compliance/translate", json={"text": "가" * 2001}).status_code == 400
    assert auth_client.post("/api/compliance/translate", data="x", content_type="text/plain").status_code == 415


def test_cs_draft_blocks_todo_placeholders(auth_client):
    res = auth_client.post("/api/cs/gmail/draft", json={"message_id": "abc12345", "body": "Hi [확인 필요: 주문번호]"})
    assert res.status_code == 400 and "확인 필요" in res.get_json()["error"]


def test_cs_draft_validates_message_id(auth_client):
    res = auth_client.post("/api/cs/gmail/draft", json={"message_id": "../../x", "body": "Hello"})
    assert res.status_code == 400


def test_cs_gmail_requires_login_token(auth_client):
    res = auth_client.get("/api/cs/gmail/inquiries")
    assert res.status_code == 401 and "Gmail 로그인" in res.get_json()["error"]
    assert auth_client.get("/api/cs/gmail/status").get_json()["connected"] is False


def test_cs_ai_draft_checks(auth_client):
    assert auth_client.post("/api/cs/ai-draft", json={"inquiry": {"body": "hi"}}).status_code == 400
    res = auth_client.post("/api/cs/ai-draft", json={"persona": {"text": "친절한 상담원"}, "inquiry": {"body": "Where is my order?"}})
    assert res.status_code == 503


def test_google_connect_needs_client(auth_client):
    res = auth_client.get("/api/cs/gmail/connect")
    assert res.status_code == 503


# ───────── Gmail 바로 보내기 (실제로 보내지 않게 Gmail 연결을 가짜로 바꿈) ─────────

def _fake_gmail(monkeypatch):
    from tabs.cs import gmail
    sent = []
    monkeypatch.setattr(gmail, "service", lambda interactive=False: object())
    monkeypatch.setattr(gmail, "send_reply", lambda svc, mid, body: (sent.append((mid, body)) or ("sent123", "Lauren <lauren@example.com>")))
    monkeypatch.setattr(gmail, "reply_preview", lambda svc, mid: {"to": "Lauren <lauren@example.com>", "subject": "Re: Hi"})
    return sent


def test_gmail_send_requires_approval_and_clean_body(auth_client, monkeypatch):
    sent = _fake_gmail(monkeypatch)
    ok = {"message_id": "abc123def", "body": "Hello Lauren,\nThanks for writing.", "approved_by": "소준희", "verdict": "PASS"}
    assert auth_client.post("/api/cs/gmail/send", json=dict(ok, message_id="../x")).status_code == 400
    assert auth_client.post("/api/cs/gmail/send", json=dict(ok, body="within [확인 필요: 기한].")).status_code == 400
    assert auth_client.post("/api/cs/gmail/send", json=dict(ok, approved_by="")).status_code == 400
    assert auth_client.post("/api/cs/gmail/send", json=dict(ok, verdict="BLOCK")).status_code == 400
    assert sent == []   # 위 경우에는 하나도 보내지 않음
    res = auth_client.post("/api/cs/gmail/send", json=ok)
    assert res.status_code == 200 and res.get_json()["sent_id"] == "sent123"
    assert sent == [("abc123def", ok["body"])]


def test_gmail_preview(auth_client, monkeypatch):
    _fake_gmail(monkeypatch)
    out = auth_client.post("/api/cs/gmail/preview", json={"message_id": "abc123def"}).get_json()
    assert out == {"to": "Lauren <lauren@example.com>", "subject": "Re: Hi"}


def test_translate_batch_checks(auth_client):
    assert auth_client.post("/api/compliance/translate-batch", json={"texts": []}).status_code == 400
    assert auth_client.post("/api/compliance/translate-batch", json={"texts": ["가"] * 201}).status_code == 400
    res = auth_client.post("/api/compliance/translate-batch", json={"texts": ["파티 전에 챙기는 젤리"]})
    assert res.status_code == 503 and "ANTHROPIC_API_KEY" in res.get_json()["error"]
