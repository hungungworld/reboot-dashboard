"""컴플라이언스 API (담당: 소준희). 예전 server/app.py와 같은 주소·입력·출력입니다.

  POST /api/compliance/ai-review        {text, channel, category, rule, rules, product?} → AI 2차 판정 (참고용)
  POST /api/compliance/ko               {items:[{id, title, summary, source}]} → 한글 제목·한 줄 요약 (최대 30건)
  POST /api/compliance/translate        {text} → 한국어 광고 문구를 영어로 (뜻 그대로 · 참고용) {text, note_ko, model}
  POST /api/compliance/translate-ko     {text} → 영어를 한국어로 (뜻 확인용 · 크롬 내장 번역을 못 쓸 때) {text, note_ko, model}
  POST /api/compliance/translate-batch  {texts:[...]} → 일괄 심의 한국어 줄들을 한 번에 영어로 {items:[{text, note_ko}], model} (200줄까지)
  POST /api/compliance/monitor/refresh  규제 모니터링 수집 → monitor-data.js 저장 + 결과 반환 (경고장은 목록만)
  POST /api/compliance/letters/xlsx     multipart file=경고장 목록 XLSX (브라우저에서 받은 것) → 식품 경고장 추가 + 수집 결과 반환
  POST /api/compliance/letters/text     {text, url?, firm?, issued?, subject?} → 경고장 본문의 인용 문구 → 사례집 후보 + 수집 결과 반환
  GET  /api/compliance/ai-usage         이번 달 AI 사용량·예상 비용 (컴플라이언스·CS · 기능별) + 예산 한도
하루 1회 작업: 규제 모니터링 수집 (POST /api/jobs/daily) · 경고장 본문도 30초 간격으로 읽음
"""
from flask import Blueprint, current_app, jsonify, request

from server import jobs, worklog
from server.security import ApiError, clip, json_body

bp = Blueprint("compliance", __name__, url_prefix="/api/compliance")


@bp.post("/ai-review")
def ai_review():
    from . import ai_review as ai
    data = json_body(max_bytes=64 * 1024)
    text = data.get("text", "")
    try:
        out = ai.review(text, data.get("channel", ""), data.get("category", "FOOD"),
                        data.get("rule"), data.get("rules"), clip(data.get("product"), 300),
                        persona=clip(data.get("persona"), ai.MAX_PERSONA))
    except ai.ReviewError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "AI 프롬프트", "AI 2차 판정", detail={
        "model": out.get("model"), "verdict": out.get("verdict"), "channel": clip(data.get("channel"), 60),
        "copy": clip(text, 400), "summary": clip(out.get("summary"), 300)})
    return jsonify(out)


@bp.get("/ai-usage")
def ai_usage_summary():
    from . import ai_usage
    return jsonify(ai_usage.summary())


@bp.post("/ko")
def ko_items():
    from . import ko_summary
    data = json_body(max_bytes=64 * 1024)
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise ApiError("요약할 항목이 없습니다.")
    items = [i for i in items[:30] if isinstance(i, dict)]
    try:
        ko = ko_summary.summarize([{"source": clip(i.get("source"), 80), "id": clip(i.get("id"), 80),
                                    "title": clip(i.get("title"), 300), "summary": clip(i.get("summary"), 500)} for i in items])
    except ko_summary.KoError as e:
        raise ApiError(str(e), 502)
    return jsonify(items=[dict(id=clip(i.get("id"), 80), **(k or {})) for i, k in zip(items, ko)])


@bp.post("/translate-ko")
def translate_to_korean():
    """'한글로 번역'(뜻 확인용)이 크롬 내장 번역을 못 쓸 때 서버 AI로 영→한."""
    from . import translate
    data = json_body(max_bytes=64 * 1024)
    try:
        out = translate.to_korean(data.get("text", ""))
    except translate.TranslateError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "AI 프롬프트", "영→한 번역 (뜻 확인)", detail={"model": out.get("model"), "chars": len(str(data.get("text", "")))})
    return jsonify(out)


@bp.post("/translate-batch")
def translate_batch():
    from . import translate
    data = json_body(max_bytes=600 * 1024)
    try:
        out = translate.to_english_batch(data.get("texts"))
    except translate.TranslateError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "AI 프롬프트", "한→영 번역 (일괄 심의)", detail={"model": out.get("model"), "rows": len(out["items"])})
    return jsonify(out)


@bp.post("/translate")
def translate_to_english():
    from . import translate
    data = json_body(max_bytes=64 * 1024)
    text = data.get("text", "")
    try:
        out = translate.to_english(text)
    except translate.TranslateError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "AI 프롬프트", "한→영 번역", detail={
        "model": out.get("model"), "ko": clip(text, 400), "en": clip(out.get("text"), 400)})
    return jsonify(out)


def _collect_and_save(bodies=False):
    from . import refresh
    data = refresh.collect(bodies=bodies)
    refresh.write(data)
    worklog.add("compliance", "수집", "규제 모니터링 수집", status="실패" if not any(s["items"] for s in data["sources"]) and data["errors"] else "완료",
                detail={"counts": {s["id"]: len(s["items"]) for s in data["sources"]},
                        "errors": [f'{e["label"]}: {e["error"]}' for e in data["errors"]]})
    return data


@bp.post("/monitor/refresh")
def monitor_refresh():
    try:
        with jobs.file_lock("compliance-monitor", stale_seconds=1800):
            return jsonify(_collect_and_save())
    except jobs.Busy:
        raise ApiError("이미 수집 중입니다. 잠시 뒤 다시 확인하세요.", 409)


def _letters_saved(kind, detail):
    from . import refresh, warning_letters
    with jobs.file_lock("compliance-monitor", stale_seconds=1800):
        data = refresh.update_source(warning_letters.as_source())
    worklog.add("compliance", "수집", kind, detail=detail)
    return data


@bp.post("/letters/xlsx")
def letters_xlsx():
    from . import warning_letters
    f = request.files.get("file")
    if f is None or not f.filename:
        raise ApiError("경고장 목록 XLSX 파일을 골라 주세요.")
    try:
        out = warning_letters.import_xlsx(f.read(warning_letters.MAX_XLSX + 1))
        data = _letters_saved("FDA 경고장 목록 올리기", out)
    except warning_letters.LetterError as e:
        raise ApiError(str(e))
    except jobs.Busy:
        raise ApiError("지금 수집 중입니다. 잠시 뒤 다시 올려 주세요.", 409)
    return jsonify(dict(data, letters=out))


@bp.post("/letters/text")
def letters_text():
    from . import warning_letters
    data = json_body(max_bytes=warning_letters.MAX_TEXT * 4 + 4096)
    try:
        out = warning_letters.add_text(data.get("text", ""), clip(data.get("url"), 400), clip(data.get("firm"), 160),
                                       clip(data.get("issued"), 20), clip(data.get("subject"), 200))
        saved = _letters_saved("FDA 경고장 본문 올리기", out)
    except warning_letters.LetterError as e:
        raise ApiError(str(e))
    except jobs.Busy:
        raise ApiError("지금 수집 중입니다. 잠시 뒤 다시 올려 주세요.", 409)
    return jsonify(dict(saved, letters=out))


@jobs.daily("compliance-monitor", "규제 모니터링 수집 (FDA 경고장·수입 거부 · openFDA · Regulations.gov · CourtListener · CBP CROSS · Federal Register · Firecrawl: NAD·FTC 보도자료·Prop 65 통지·올리브영 정책)")
def daily_monitor():
    current_app.logger.info("규제 모니터링 수집 시작")
    _collect_and_save(bodies=True)


# ───────── 문구 검토 요청 (2026-10-25) — 법무·인허가·품질팀에 Slack으로 보내고 1회용 링크로 회신 받음 ─────────
#   POST /api/compliance/review-requests   {text, ko?, channel, product?, aiVerdict?, teams:[legal|regulatory|quality], memo?}
#                                          → {request, links:{팀: 링크}, slack:{ok, error}} (링크는 이 응답에서만 보임)
#   GET  /api/compliance/review-requests   최근 요청과 팀별 회신 상태
#   GET·POST /review/<토큰>                 회신 페이지 (로그인 없음 · 14일 · /api 밖이라 화면 주소 그대로)

@bp.post("/review-requests")
def review_request_create():
    from flask_login import current_user
    from . import review_requests as rr
    data = json_body(max_bytes=32 * 1024)
    who = getattr(current_user, "name", "") or getattr(current_user, "email", "") or "담당자"
    try:
        req, links, slack_error = rr.create(data.get("text"), data.get("ko"), clip(data.get("channel"), 20),
                                            clip(data.get("product"), 20), clip(data.get("aiVerdict"), 10),
                                            data.get("teams") if isinstance(data.get("teams"), list) else [],
                                            data.get("memo"), who, request.host_url)
    except rr.RequestError as e:
        raise ApiError(str(e), e.status)
    worklog.add("compliance", "검토 요청", "문구 검토 요청 보냄", detail={
        "id": req["id"], "teams": list(req["teams"]), "ruleVerdict": req["ruleVerdict"], "copy": clip(req["text"], 300)})
    return jsonify(request=req, links=links, slack={"ok": not slack_error, "error": slack_error})


@bp.get("/review-requests")
def review_request_list():
    from . import review_requests as rr
    return jsonify(items=rr.recent())


REVIEW_PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>REBOOT 문구 검토 회신</title>
<style>
 body{margin:0;background:#f4f5f0;color:#191c18;font:15px/1.7 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}
 main{max-width:720px;margin:0 auto;padding:28px 16px 48px}
 h1{font-size:20px;margin:0 0 4px} .muted{color:#6b7065;font-size:13px}
 .card{background:#fff;border:1px solid #e3e6dc;border-radius:12px;padding:18px 20px;margin-top:16px}
 .quote{background:#f4f5f0;border-radius:8px;padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere}
 .badge{display:inline-block;padding:2px 8px;border-radius:6px;background:#191c18;color:#d7ff3f;font-size:12px;font-weight:700}
 label{display:block;margin-top:12px;font-weight:600} input[type=text],textarea{width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #cfd3c7;border-radius:8px;font:inherit}
 .opts label{display:inline-flex;gap:6px;align-items:center;margin-right:16px;font-weight:500}
 button{margin-top:16px;padding:10px 20px;border:0;border-radius:8px;background:#191c18;color:#d7ff3f;font:inherit;font-weight:700;cursor:pointer}
 .ok{background:#eef7d6;border-color:#cfe59a} .err{background:#fdeceb;border-color:#f3c3be}
</style></head><body><main>
<h1>REBOOT 문구 검토 회신 · {{ team }}</h1>
<p class="muted">요청 {{ r.requester }} · {{ r.createdAt[:10] }} · 회신 기한 {{ r.expiresAt[:10] }} · 이 링크는 {{ team }} 회신 전용입니다.</p>
{% if msg %}<div class="card ok">{{ msg }}</div>{% endif %}
{% if err %}<div class="card err">{{ err }}</div>{% endif %}
<div class="card"><p class="muted">검토할 영어 문구</p><div class="quote">{{ r.text }}</div>
 {% if r.ko %}<p class="muted">한국어 원문</p><div class="quote">{{ r.ko }}</div>{% endif %}
 <p>대시보드 규칙 판정 <span class="badge">{{ r.ruleVerdict }}</span>{% if r.ruleCodes %} <span class="muted">{{ r.ruleCodes|join(' · ') }}</span>{% endif %}
 {% if r.aiVerdict %} · AI 2차 판정 <span class="badge">{{ r.aiVerdict }}</span>{% endif %}</p>
 <p class="muted">규칙·AI 판정은 1차 참고용입니다. 최종 판단은 회신하시는 팀이 합니다.</p>
 {% if r.memo %}<p class="muted">요청 메모</p><div class="quote">{{ r.memo }}</div>{% endif %}</div>
<form class="card" method="post">
 <input type="hidden" name="csrf_token" value="{{ csrf_token() }}">
 {% if cur.status != '대기' %}<p class="muted">지금 회신: <b>{{ cur.status }}</b> · {{ cur.by }} · {{ cur.at[:16].replace('T', ' ') }} (다시 보내면 바뀝니다)</p>{% endif %}
 <div class="opts">{% for d in decisions %}<label><input type="radio" name="decision" value="{{ d }}" required{% if cur.status == d %} checked{% endif %}> {{ d }}</label>{% endfor %}</div>
 <label>이름<input type="text" name="name" maxlength="60" required value="{{ cur.by }}"></label>
 <label>의견 (수정 필요·반려는 필수)<textarea name="comment" rows="4" maxlength="1000">{{ cur.comment }}</textarea></label>
 <button type="submit">회신 보내기</button>
</form></main></body></html>"""


def _review_page(token):
    from flask import render_template_string
    from . import review_requests as rr
    msg = err = ""
    status = 200
    if request.method == "POST":
        try:
            r, team, slack_error = rr.respond(token, request.form.get("decision", ""), request.form.get("comment", ""),
                                              request.form.get("name", ""))
            worklog.add("compliance", "검토 회신", f"{rr.TEAMS[team]} {r['teams'][team]['status']}",
                        detail={"id": r["id"], "team": team, "by": r["teams"][team]["by"]})
            msg = "회신을 보냈습니다. 요청한 사람의 대시보드에 바로 보입니다." + ("" if not slack_error else " (Slack 알림은 보내지 못했습니다.)")
        except rr.RequestError as e:
            if e.status in (404, 410):
                return render_template_string("<!doctype html><meta charset=utf-8><title>REBOOT 문구 검토</title>"
                                              "<p style='font:16px sans-serif;padding:32px'>{{ m }}</p>", m=str(e)), e.status
            err, status = str(e), 400
    try:
        r, team = rr.find(token)
    except rr.RequestError as e:
        return render_template_string("<!doctype html><meta charset=utf-8><title>REBOOT 문구 검토</title>"
                                      "<p style='font:16px sans-serif;padding:32px'>{{ m }}</p>", m=str(e)), e.status
    return render_template_string(REVIEW_PAGE, r=r, team=rr.TEAMS[team], cur=r["teams"][team], decisions=rr.DECISIONS,
                                  msg=msg, err=err), status


def _register_review_page(state):
    """회신 페이지는 /api 밖 주소(/review/<토큰>)라 로그인 없이 열림 (공용 security.py는 /api만 막음)."""
    from server.extensions import limiter
    view = limiter.limit("30 per minute")(_review_page)
    state.app.add_url_rule("/review/<token>", "compliance_review_page", view, methods=["GET", "POST"])


bp.record_once(_register_review_page)
