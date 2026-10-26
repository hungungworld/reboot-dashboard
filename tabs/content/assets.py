"""브랜드 자산 (로고 · 제품 · 캐릭터 Rebu 사진) — tabs/content/data/assets/manifest.json.

- 이미지 생성: 선택 제품 · 맛 · 캐릭터 사용 여부에 맞는 사진을 골라 참고 이미지로 함께 보냄 (media.py)
- 시트에서 제품마다 고른 맛 → decisions.product_flavors (예: "Reboot Jelly Original: 체리 · 라임 | Reboot Drink Balance: 레몬")
- 텍스트 초안: 카드뉴스 · 숏폼 구성안에 자산 ID 목록을 줘서 장·장면마다 어떤 사진을 쓸지 적게 함 (drafts.py)
- 화면: GET /api/content/assets (목록) · /api/content/assets/<ID>.jpg (파일, 로그인 필요)
"""
import itertools
import json
import re
from functools import lru_cache
from pathlib import Path

ASSET_DIR = Path(__file__).resolve().parent / "data" / "assets"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,80}$")
MAX_REFS = 16           # 한 번에 보내는 참고 사진 수 (편집 기준 이미지 포함) — OpenAI 이미지 편집이 받는 최대 장수 (2026-10-25)
HIGGSFIELD_MAX_REFS = 5  # Higgsfield는 참고 사진 상한을 확인하지 못해 예전 값 유지
FLAVORS = {"cherry": ("cherry", "체리"), "lemon": ("lemon", "레몬"), "lime": ("lime", "라임")}
FLAVOR_ORDER = ("cherry", "lime", "lemon")   # 시트 칩 순서
CHARACTER_CHOICES = ("사용", "사용 안 함", "AI 판단")
CHARACTER_TYPES = ("image", "cardnews", "shortform")   # 시트에 캐릭터 칸을 보여 주는 콘텐츠


@lru_cache(maxsize=1)
def manifest():
    return json.loads((ASSET_DIR / "manifest.json").read_text(encoding="utf-8"))


def all_assets():
    return manifest()["assets"]


def get(asset_id):
    if not ID_RE.match(asset_id or ""):
        return None
    return next((a for a in all_assets() if a["id"] == asset_id), None)


def path_of(a):
    return ASSET_DIR / a["file"]


def url_of(a):
    return f"/api/content/assets/{a['id']}.jpg"


def public(a):
    return {"id": a["id"], "type": a["type"], "productId": a.get("product_id"), "flavor": a.get("flavor"),
            "view": a.get("view"), "ref": a["ref"], "desc": a["desc"], "url": url_of(a)}


# ───────── 캐릭터 사용 여부 (decisions.use_character) ─────────

def character_choice(decisions):
    """결정 사항의 값 → 사용 · 사용 안 함 · AI 판단 (없으면 AI 판단)."""
    v = str(((decisions or {}).get("use_character") or {}).get("value") or "").replace(" ", "").lower()
    if not v:
        return "AI 판단"
    if any(w in v for w in ("안함", "안해", "빼", "없이", "제외", "아니요", "false")):
        return "사용 안 함"
    if any(w in v for w in ("판단", "ai", "알아서", "자동")):
        return "AI 판단"
    return "사용"


def norm_character(value):
    """시트에서 온 값 검증 → 저장할 값."""
    v = str(value or "").strip()
    if v not in CHARACTER_CHOICES:
        raise ValueError("캐릭터 Rebu는 사용 · 사용 안 함 · AI 판단 중 하나예요.")
    return v


# ───────── 참고 사진 고르기 ─────────

def flavors_in(*texts):
    """글에서 언급한 맛 (영어·한국어)."""
    t = " ".join(str(x or "") for x in texts).lower()
    return [f for f, words in FLAVORS.items() if any(w in t for w in words)]


def _subset(flavors):
    """맛을 일부만 골랐을 때만 그 맛 목록 (셋 다 · 없음 → 제한 없음)."""
    f = [x for x in FLAVOR_ORDER if x in (flavors or ())]
    return f if f and len(f) < len(FLAVOR_ORDER) else []


def _product_refs(pid, flavors):
    """그 제품의 참고용 사진 전부 (우선순위 순). 맛을 일부만 골랐으면 그 맛 사진 먼저 + 맛 구분 없는 사진(봉지 등).
    세 맛이 다 보이는 3병 사진(trio)은 고르지 않은 맛이 섞이므로 뺌."""
    cands = sorted((a for a in all_assets() if a.get("product_id") == pid and a["ref"]),
                   key=lambda a: (a["priority"], a.get("flavor") is not None))
    flavors = _subset(flavors)
    if not flavors:
        return cands
    return ([a for a in cands if a.get("flavor") in flavors]
            + [a for a in cands if a.get("flavor") is None and a.get("view") != "trio"])


def pick_refs(product_ids, *, flavors=(), per_product=None, character=False, limit=MAX_REFS, skip=()):
    """선택 제품(·맛)에 맞는 참고용 사진 전부 + 캐릭터 1장, 최대 limit장. 리볼버·글자 많은 사진(ref=false)은 고르지 않음.
    flavors(대화에서 말한 맛)가 있으면 모든 제품에, 없으면 per_product(시트에서 제품마다 고른 맛)를 씀.
    skip: 시트에서 눌러 뺀 사진 ID (decisions.ref_skip). 제품을 번갈아 넣어 상한에서 잘려도 제품마다 고르게 들어감."""
    char_slot = 1 if character else 0
    per_product = per_product or {}
    skip = set(skip or ())
    lists = [[a for a in _product_refs(pid, flavors or per_product.get(pid) or ()) if a["id"] not in skip]
             for pid in product_ids]
    refs = [a for row in itertools.zip_longest(*lists) for a in row if a is not None]
    refs = refs[: max(0, limit - char_slot)]
    if character:
        refs.extend(sorted((a for a in all_assets() if a["type"] == "character" and a["ref"]), key=lambda a: a["priority"])[:1])
    return refs


# ───────── 제품별 맛 (decisions.product_flavors) ─────────

def norm_product_flavors(value, product_ids, products):
    """시트에서 온 {제품 ID: [맛]} 검증 → 결정 값 문자열. 고른 제품마다 맛 하나 이상 (안 보낸 제품은 셋 다)."""
    if not isinstance(value, dict):
        raise ValueError("제품별 맛 선택 형식이 올바르지 않아요.")
    parts = []
    for pid in product_ids:
        raw = value.get(pid, list(FLAVOR_ORDER))
        if not isinstance(raw, list) or any(x not in FLAVORS for x in raw):
            raise ValueError("맛은 체리 · 라임 · 레몬 중에서 골라 주세요.")
        f = [x for x in FLAVOR_ORDER if x in raw]
        name = (products.get(pid) or {}).get("name") or pid
        if not f:
            raise ValueError(f"{name}의 맛을 하나 이상 골라 주세요.")
        parts.append(f"{name}: " + " · ".join(FLAVORS[x][1] for x in f))
    return " | ".join(parts) or None


def product_flavors_of(decisions, product_ids, products):
    """결정 값 → {제품 ID: [맛]} (고른 제품만 · 값에 없는 제품은 셋 다). 대화에서 고친 글도 너그럽게 읽음."""
    v = str(((decisions or {}).get("product_flavors") or {}).get("value") or "")
    out = {pid: list(FLAVOR_ORDER) for pid in product_ids}
    for seg in v.split("|"):
        if ":" not in seg:
            continue
        label, fl = (x.strip().lower() for x in seg.rsplit(":", 1))
        f = [x for x in FLAVOR_ORDER if x in flavors_in(fl)]
        for pid in product_ids:
            p = products.get(pid) or {}
            if f and label in {pid, str(p.get("name") or "").lower(), str(p.get("ko") or "").lower()}:
                out[pid] = f
    return out


# ───────── 뺀 참고 사진 (decisions.ref_skip) ─────────

def norm_ref_skip(value):
    """시트에서 온 [사진 ID] 검증 → 결정 값 문자열 (쉼표로 구분 · 없으면 None). 제품 사진만 뺄 수 있음."""
    if not isinstance(value, list):
        raise ValueError("뺀 참고 사진 형식이 올바르지 않아요.")
    ids = []
    for x in value:
        a = get(str(x))
        if a is None or a["type"] != "product":
            raise ValueError("뺄 수 없는 참고 사진이에요.")
        if a["id"] not in ids:
            ids.append(a["id"])
    return ", ".join(ids) or None


def ref_skip_of(decisions):
    """결정 값 → [사진 ID]."""
    v = str(((decisions or {}).get("ref_skip") or {}).get("value") or "")
    return [x.strip() for x in v.split(",") if x.strip()]


def catalog_for(product_ids, character_choice_value, per_product=None):
    """텍스트 초안용 자산 목록 (선택 제품(·고른 맛) + 캐릭터를 쓸 수 있으면 캐릭터 + 로고)."""
    wanted = set(product_ids or [])
    per_product = per_product or {}
    out = []
    for a in all_assets():
        if a["type"] == "product" and a.get("product_id") not in wanted:
            continue
        f = _subset(per_product.get(a.get("product_id")))
        if a["type"] == "product" and f and ((a.get("flavor") and a["flavor"] not in f) or a.get("view") == "trio"):
            continue
        if a["type"] == "character" and character_choice_value == "사용 안 함":
            continue
        if not a["ref"] and a["type"] != "logo":
            continue
        out.append({"id": a["id"], "desc": a["desc"]})
    return out
