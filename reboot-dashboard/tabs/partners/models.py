"""파트너 파트 표 (표 이름은 partners_ 로 시작).

- PartnerContact     업체 목록 (파일을 다시 가져오면 같은 구분만 바뀜)
- PartnerHistory     협업 이력 (자동 · 수기 · 샘플). 업체 id·이름을 복사해 두어 업체 목록이 바뀌어도 이력은 남음
- PartnerAttachment  메일 첨부파일 보관함 (파일은 DATA_DIR/uploads/partners/attachments/)
"""
import json

from server.extensions import db
from server.models import iso, utcnow


def _json(text, default):
    try:
        value = json.loads(text or "")
    except ValueError:
        return default
    if default is None:
        return value if isinstance(value, dict) else None
    return value if isinstance(value, type(default)) else default


class PartnerContact(db.Model):
    __tablename__ = "partners_contacts"

    id = db.Column(db.String(20), primary_key=True)            # C001 · I001 · IX01
    ptype = db.Column(db.String(10), nullable=False, index=True)  # 케이터링 · 인플루언서
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(255), nullable=False, default="")
    phone = db.Column(db.String(100), nullable=False, default="")
    url = db.Column(db.String(500), nullable=False, default="")
    location = db.Column(db.String(200), nullable=False, default="")
    category = db.Column(db.Text, nullable=False, default="")
    note = db.Column(db.Text, nullable=False, default="")
    tags = db.Column(db.Text, nullable=False, default="[]")      # 세부 카테고리 키 (JSON)
    sort = db.Column(db.Integer, nullable=False, default=0)      # 파일 안 순서
    source_file = db.Column(db.String(200), nullable=False, default="")
    imported_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    imported_by = db.Column(db.String(100), nullable=False, default="")

    @property
    def is_example(self):
        # 번호가 숫자가 아닌 행 (예: '예시)' 테스트 행) → CX01 · IX01
        return self.id[1:2] == "X"

    def to_dict(self):
        return {"id": self.id, "type": self.ptype, "name": self.name, "email": self.email, "phone": self.phone,
                "url": self.url, "location": self.location, "category": self.category, "note": self.note,
                "tags": _json(self.tags, []), "example": self.is_example, "sourceFile": self.source_file,
                "importedAt": iso(self.imported_at)}


class PartnerHistory(db.Model):
    __tablename__ = "partners_history"

    id = db.Column(db.Integer, primary_key=True)
    partner_id = db.Column(db.String(20), nullable=False, default="", index=True)
    partner_name = db.Column(db.String(200), nullable=False, default="")
    partner_type = db.Column(db.String(10), nullable=False, default="")
    kind = db.Column(db.String(10), nullable=False, default="자동")         # 자동 · 수기 · 샘플
    activity = db.Column(db.String(40), nullable=False, default="")        # 메일 발송 · 답장 발송 · 전화 · 미팅 …
    mail_status = db.Column(db.String(10), nullable=False, default="")     # 발송 성공 · 발송 실패 · 반송 · 회신 받음 · 회신 대기
    progress = db.Column(db.String(12), nullable=False, default="컨택 중")  # 컨택 중 → … → 협업 완료 / 보류 / 협업 중단
    owner = db.Column(db.String(60), nullable=False, default="")
    at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    memo = db.Column(db.Text, nullable=False, default="")
    # 메일 기록
    to_addr = db.Column(db.String(600), nullable=False, default="")
    sender = db.Column(db.String(255), nullable=False, default="")
    subject = db.Column(db.String(300), nullable=False, default="")
    body = db.Column(db.Text, nullable=False, default="")
    message_id = db.Column(db.String(300), nullable=False, default="", index=True)
    in_reply_to = db.Column(db.String(300), nullable=False, default="")
    refs = db.Column(db.Text, nullable=False, default="")                 # References 헤더
    attachments = db.Column(db.Text, nullable=False, default="[]")        # 첨부파일 이름 (JSON)
    error = db.Column(db.String(500), nullable=False, default="")
    reply_of = db.Column(db.Integer, nullable=True)                       # 답장이면 원래 이력 id
    # 상대방 회신 (📥 답장 확인)
    reply_from = db.Column(db.String(300), nullable=False, default="")
    reply_subject = db.Column(db.String(300), nullable=False, default="")
    reply_body = db.Column(db.Text, nullable=False, default="")
    reply_at = db.Column(db.DateTime, nullable=True)
    reply_message_id = db.Column(db.String(300), nullable=False, default="")
    reply_estimated = db.Column(db.Boolean, nullable=False, default=False)
    reply_summary = db.Column(db.Text, nullable=False, default="")        # AI 요약 (JSON)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    created_by = db.Column(db.String(100), nullable=False, default="")

    def to_dict(self):
        reply = None
        if self.reply_body or self.reply_from:
            reply = {"from": self.reply_from, "subject": self.reply_subject, "body": self.reply_body,
                     "at": iso(self.reply_at), "messageId": self.reply_message_id,
                     "estimated": bool(self.reply_estimated), "summary": _json(self.reply_summary, None)}
        return {"id": self.id, "partnerId": self.partner_id, "partnerName": self.partner_name,
                "partnerType": self.partner_type, "kind": self.kind, "activity": self.activity,
                "mailStatus": self.mail_status, "progress": self.progress, "owner": self.owner, "at": iso(self.at),
                "memo": self.memo, "to": self.to_addr, "sender": self.sender, "subject": self.subject, "body": self.body,
                "messageId": self.message_id, "attachments": _json(self.attachments, []), "error": self.error,
                "replyOf": self.reply_of, "reply": reply, "createdAt": iso(self.created_at),
                "updatedAt": iso(self.updated_at), "createdBy": self.created_by}


class PartnerAttachment(db.Model):
    __tablename__ = "partners_attachments"

    id = db.Column(db.String(32), primary_key=True)          # uuid4 hex
    filename = db.Column(db.String(200), nullable=False)      # 화면·메일에 보이는 이름
    stored_name = db.Column(db.String(120), nullable=False)   # 디스크 이름: <id>_<안전한 이름>.<확장자>
    size = db.Column(db.Integer, nullable=False, default=0)
    source = db.Column(db.String(10), nullable=False, default="upload")  # upload · guide
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    created_by = db.Column(db.String(100), nullable=False, default="")

    def to_dict(self):
        return {"id": self.id, "name": self.filename, "size": self.size, "source": self.source,
                "createdAt": iso(self.created_at), "createdBy": self.created_by}
