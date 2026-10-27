"""실제 미국 광고 문구 모으기 (2026-10-27) — 광고심의 '실제 미국 광고와 비교'와 '대체 문장 3개'의 근거.

- 출처: data/ad_ref_sites.json의 경쟁사 공개 홈페이지를 Firecrawl로 읽어 제목·짧은 문장만 옮김 (1곳 = 약 1크레딧)
- 주 1회 (하루 작업이 부르지만 7일이 안 지났으면 건너뜀) · 화면의 '지금 다시 모으기'는 바로 수집
- 저장: DATA_DIR/compliance_ad_refs.json (깃에 올라가지 않음) · 문구는 160자까지만, 원문 주소를 함께 둠
- Meta·TikTok 광고 라이브러리는 약관상 자동 수집하지 않음 → 화면에 바로가기만
"""
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import current_app

from server.envkeys import get as env

SITES_FILE = Path(__file__).parent / "data" / "ad_ref_sites.json"
STORE_NAME = "compliance_ad_refs.json"
EVERY = timedelta(days=7)
MAX_SITES = 8
MAX_LINES = 12          # 한 곳에서 옮기는 문구 수
MAX_CHARS = 160

HEADING_RE = re.compile(r"^#{1,3}\s+(.+)$")
BOLD_RE = re.compile(r"^\*\*(.+?)\*\*$")
LINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
JUNK_RE = re.compile(r"cookie|cart|sign ?in|log ?in|subscribe|newsletter|blocked|privacy|terms|shipping|account|"
                     r"©|\$\s?\d|sold out|add to|checkout|javascript|menu|skip to|search|best ?sellers?|featured|"
                     r"popular|suggest|sounds good|bundle|bottle|capsule|\bduo\b|delivery|% off|money back|guarantee|"
                     r"seek the care|medical professional|statements have not been evaluated", re.I)   # 면책 문구도 뺌
LINK_TAIL_RE = re.compile(r"\]\(.*$")   # 줄 끝에서 잘린 링크 주소


def _now():
    return datetime.now(timezone.utc)


def _path():
    return Path(current_app.config["DATA_DIR"]) / STORE_NAME


def sites():
    try:
        data = json.loads(SITES_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [s for s in data.get("sites", []) if isinstance(s, dict) and s.get("url")][:MAX_SITES]


def lines_from_markdown(md):
    """페이지 마크다운 → 광고 문구 후보 (3단어 이상 제목 · 굵은 한 줄 · 5~22단어 짧은 문장). 메뉴·상품명·가격 줄은 뺌."""
    out, seen = [], set()
    for raw in (md or "").splitlines():
        line = raw.strip()
        m = HEADING_RE.match(line) or BOLD_RE.match(line)
        text = m.group(1) if m else line
        if not m and (line.startswith(("-", "*", "|", ">", "!", "[")) or not 5 <= len(line.split()) <= 22):
            continue
        text = LINK_TAIL_RE.sub("", LINK_RE.sub(r"\1", text)).replace("**", "").replace("\\", "").strip(" #*_\"'")
        text = re.sub(r"\s+", " ", text)
        if len(text.split()) < 3 or JUNK_RE.search(text) or not re.search(r"[A-Za-z]", text):
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text[:MAX_CHARS])
        if len(out) >= MAX_LINES:
            break
    return out


def _item_id(url, text):
    return hashlib.sha1(f"{url}|{text}".encode("utf-8")).hexdigest()[:12]


def collect():
    """경쟁사 홈페이지를 읽어 {generatedAt, items, errors}를 만들고 저장."""
    from tabs.insights.weee import firecrawl   # 인사이트 탭의 Firecrawl 호출 함수를 가져다 씀 (읽기만)
    from tabs.insights.http import CollectError
    key = env("FIRECRAWL_API_KEY")
    if not key:
        raise RuntimeError("FIRECRAWL_API_KEY가 없습니다 (설정 › 연결).")
    at = _now().strftime("%Y-%m-%dT%H:%M:%SZ")
    items, errors = [], []
    for s in sites():
        brand, url = str(s.get("brand", ""))[:80], str(s["url"])[:300]
        try:
            page = firecrawl(key, {"url": url, "formats": ["markdown"], "onlyMainContent": True})
        except CollectError as e:
            errors.append({"brand": brand, "error": str(e)})
            continue
        found = lines_from_markdown(page.get("markdown", ""))
        if not found:
            errors.append({"brand": brand, "error": "옮길 문구를 찾지 못함"})
        items += [{"id": _item_id(url, t), "brand": brand, "url": url, "text": t, "source": "공식 홈페이지", "collectedAt": at}
                  for t in found]
    data = {"generatedAt": at, "items": items, "errors": errors}
    _path().write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


def load():
    try:
        return json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"generatedAt": None, "items": [], "errors": []}


def due():
    at = load().get("generatedAt")
    if not at:
        return True
    try:
        return _now() - datetime.strptime(at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) >= EVERY
    except ValueError:
        return True
