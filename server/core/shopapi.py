"""자사 홈페이지(시연 사이트 reboot-us) 데이터 API — 파트너 판매 실적 · 성과분석 자사몰 매출이 같이 씀.

  GET <SHOP_EXPORT_URL>/api/export/<이름>.csv?start=YYYY-MM-DD&end=YYYY-MM-DD
  헤더 Authorization: Bearer <SHOP_EXPORT_TOKEN>  (토큰은 .env 또는 설정 › 연결)
- 컬럼은 시연 사이트 관리자 화면 CSV와 같음 (UTF-8 BOM) · 토큰이 틀리면 401
- 무료 서버라 잠들어 있으면 첫 요청이 50초쯤 걸림 → TIMEOUT 넉넉히 · 같은 요청은 CACHE_SEC 동안 재사용
"""
import csv
import hashlib
import io
import time
from datetime import datetime, timezone

import requests

from server import envkeys

TIMEOUT = 90
CACHE_SEC = 600
_cache = {}


class ShopApiError(RuntimeError):
    """화면에 그대로 보여 줄 API 오류."""


def ready():
    return bool(envkeys.get("SHOP_EXPORT_TOKEN"))


def read_csv(raw):
    """bytes → 줄 목록 (dict)."""
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace"))))


def fetch(name, start=None, end=None, refresh=False):
    """export 파일 하나 → (줄 목록, 받은 시각 UTC naive). 토큰이 없으면 ShopApiError."""
    token = envkeys.get("SHOP_EXPORT_TOKEN")
    if not token:
        raise ShopApiError("자사 홈페이지 데이터 API 토큰이 없어요. 설정 › 연결에서 넣어 주세요.")
    base = str(envkeys.get("SHOP_EXPORT_URL") or "").rstrip("/")
    params = {k: v.isoformat() if hasattr(v, "isoformat") else v for k, v in (("start", start), ("end", end)) if v}
    key = (base, hashlib.sha256(token.encode()).hexdigest(), name, tuple(sorted(params.items())))
    hit = _cache.get(key)
    if hit and not refresh and time.time() - hit[0] < CACHE_SEC:
        return hit[1]
    try:
        res = requests.get(f"{base}/api/export/{name}.csv", params=params, timeout=TIMEOUT,
                           headers={"Authorization": f"Bearer {token}"})
    except requests.RequestException:
        raise ShopApiError("자사 홈페이지에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.") from None
    if res.status_code == 401:
        raise ShopApiError("자사 홈페이지 데이터 API 토큰이 맞지 않아요. 설정 › 연결에서 토큰을 확인해 주세요.")
    if res.status_code != 200:
        raise ShopApiError(f"자사 홈페이지 데이터 API 오류 ({name} · {res.status_code})")
    out = (read_csv(res.content), datetime.now(timezone.utc).replace(tzinfo=None))
    _cache[key] = (time.time(), out)
    return out
