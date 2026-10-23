"""GDELT DOC 2.0 API 호출 (README 2장 운영 주의사항).

- 키 없음 · 무료. IP당 약 5초에 1회 → 요청 사이 5초 이상 쉬고, 요청 제한·서버 오류는 쉬었다가 다시 시도
  (요청 제한을 받으면 그 수집이 끝날 때까지 간격을 늘림, 최대 20초)
- 잘못된 쿼리에도 HTTP 200 + 텍스트(또는 빈 응답)를 줄 수 있음 → JSON인지 확인하고 아니면 실패
- ArtList: 기사 목록(제목·URL·도메인·날짜, 본문 없음) · TimelineVol: 전체 기사 대비 보도량 비율
"""
import html
import json
import re
import time
from datetime import datetime, timedelta

import requests

BASE = "https://api.gdeltproject.org/api/v2/doc/doc"
UA = "REBOOT-dashboard/1.0 (home daily briefing)"
MIN_INTERVAL = 5.0
MAX_INTERVAL = 20.0


class GdeltError(Exception):
    """화면에 보여 줄 수 있는 짧은 실패 이유."""


class GdeltClient:
    def __init__(self, interval=MIN_INTERVAL, timeout=30, retries=1, sleep=time.sleep, session=None):
        self.interval = max(0.0, float(interval))
        self.timeout = timeout
        self.retries = retries
        self.sleep = sleep
        self.session = session or requests.Session()
        self.calls = 0
        self.rate_limited = 0
        self._last = None

    def _wait(self):
        if self._last is None or self.interval <= 0:
            return
        gap = time.monotonic() - self._last
        if gap < self.interval:
            self.sleep(self.interval - gap)

    def _once(self, params):
        """요청 1번 → (dict, None) 또는 (None, (오류, 다시 시도할지))."""
        self._wait()
        try:
            res = self.session.get(BASE, params=params, timeout=self.timeout, headers={"User-Agent": UA})
        except requests.RequestException as e:
            return None, (GdeltError(f"연결 실패 ({type(e).__name__})"), True)
        finally:
            self._last = time.monotonic()
            self.calls += 1
        text = (res.text or "").strip()
        if res.status_code == 429 or "limit requests" in text.lower():
            self.rate_limited += 1
            if self.interval > 0:
                self.interval = min(MAX_INTERVAL, self.interval + 5)
            return None, (GdeltError("요청 제한 (잠시 뒤 다시)"), True)
        if res.status_code >= 500:
            return None, (GdeltError(f"서버 오류 ({res.status_code})"), True)
        if res.status_code != 200:
            return None, (GdeltError(f"응답 오류 ({res.status_code})"), False)
        if not text:
            return None, (GdeltError("빈 응답"), False)
        try:
            data = json.loads(text, strict=False)
        except ValueError:
            return None, (GdeltError("JSON이 아닌 응답: " + re.sub(r"\s+", " ", text)[:80]), False)
        if not isinstance(data, dict):
            return None, (GdeltError("응답 형식 오류"), False)
        return data, None

    def get(self, params):
        err = None
        for attempt in range(self.retries + 1):
            data, fail = self._once(params)
            if fail is None:
                return data
            err, retry = fail
            if not retry:
                break
            if attempt < self.retries:
                self.sleep(self.interval * 2)  # 요청 제한·서버 오류 → 간격의 두 배를 쉬고 한 번 더
        raise err

    def articles(self, query, timespan="7d", maxrecords=75):
        data = self.get({"query": query, "mode": "ArtList", "format": "json", "maxrecords": int(maxrecords),
                         "timespan": timespan, "sort": "DateDesc"})
        arts = data.get("articles") or []
        if not isinstance(arts, list):
            raise GdeltError("응답 형식 오류 (articles)")
        return [a for a in arts if isinstance(a, dict)]

    def timeline(self, query, timespan="14d"):
        data = self.get({"query": query, "mode": "TimelineVol", "format": "json", "timespan": timespan})
        series = data.get("timeline") or []
        if not isinstance(series, list):
            raise GdeltError("응답 형식 오류 (timeline)")
        points = []
        for s in series:
            for p in (s.get("data") or []) if isinstance(s, dict) else []:
                d = parse_date(p.get("date")) if isinstance(p, dict) else None
                try:
                    v = float(p.get("value"))
                except (TypeError, ValueError, AttributeError):
                    continue
                if d is not None:
                    points.append((d, v))
        return points


def parse_date(v):
    """GDELT 날짜 '20261022T143000Z' → UTC datetime (시간대 정보 없음)."""
    s = str(v or "").strip()
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%d%H%M%S", "%Y%m%dT%H%M%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def clean_title(v):
    return re.sub(r"\s+", " ", html.unescape(str(v or ""))).strip()


def surge(points, ratio=1.5):
    """최근 7일 평균 vs 그 전 7일 평균 → 급증 여부. 날짜별 평균도 함께 (작은 추이 표시용)."""
    if not points:
        return None
    last = max(d for d, _ in points)
    cut1, cut2 = last - timedelta(days=7), last - timedelta(days=14)
    recent = [v for d, v in points if d > cut1]
    prev = [v for d, v in points if cut2 < d <= cut1]
    r = sum(recent) / len(recent) if recent else 0.0
    p = sum(prev) / len(prev) if prev else 0.0
    change = round((r - p) / p * 100, 1) if p > 0 else None
    is_surge = (p > 0 and r / p >= ratio) or (p == 0 and r > 0 and len(prev) > 0)
    days = {}
    for d, v in points:
        days.setdefault(d.date().isoformat(), []).append(v)
    daily = [{"date": k, "value": round(sum(vs) / len(vs), 5)} for k, vs in sorted(days.items())][-14:]
    return {"recent": round(r, 5), "previous": round(p, 5), "changePct": change, "surge": bool(is_surge), "daily": daily}
