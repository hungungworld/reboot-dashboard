"""서버 재검사 (2026-10-24) — 브라우저 판정 엔진(compliance.js)과 같은 규칙으로 서버에서 다시 판정.

CS 답장을 승인·발송할 때 화면이 보낸 판정 값(PASS 등)을 그대로 믿지 않고, 서버가 본문을 직접 점검합니다.
규칙은 server_rules.json (tools/export_server_rules.js가 data.js에서 만듦). pytest가 JSON 안의 golden 문장으로
서버 판정 = 브라우저 판정인지 확인합니다.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

RANK = {"PASS": 0, "COND": 1, "REVIEW": 2, "REVISE": 3, "BLOCK": 4}
LIGHT_RANK = {"": 0, "green": 1, "yellow": 2, "red": 3}   # 법적 신호 (2026-10-25 · 브라우저 LIGHT_RANK와 같음)
RULES_FILE = Path(__file__).parent / "server_rules.json"


@lru_cache(maxsize=1)
def _rules():
    data = json.loads(RULES_FILE.read_text(encoding="utf-8"))
    out = []
    for r in data["rules"]:
        out.append({
            **r,
            "_re": [re.compile(p, re.I) for p in r["regex"]],
            "_comp": [re.compile(p, re.I) for p in r["compensated"]],
            "_inc": [re.compile(p, re.I) for p in r.get("incentive", [])],
            "_allow": [re.compile(p, re.I) for p in r.get("allow", [])],
        })
    return out


def _mask(rule, src):
    """괜찮은 문맥(allow)은 같은 길이 공백으로 지움 (브라우저 maskAllowed와 같음)."""
    for rx in rule["_allow"]:
        src = rx.sub(lambda m: " " * len(m.group(0)), src)
    return src


def products():
    return json.loads(RULES_FILE.read_text(encoding="utf-8")).get("products", [])


def review(text, channel="cs", product=""):
    """{verdict, legal, codes, hits}. 브라우저 review(text, {channel, product})와 같은 판정 (일반식품).
    product: 제품 id면 그 제품 기준(byProduct · 예: Original에 Zero Sugar → BLOCK) · "all"이면 4종 중 가장 엄격 (2026-10-25)"""
    if product == "all":
        res = [review(text, channel, p) for p in products()] or [review(text, channel)]
        worst = max(res, key=lambda r: RANK[r["verdict"]])
        codes = list(dict.fromkeys(c for r in res for c in r["codes"]))
        hits = {}
        for r in res:
            for c, h in r["hits"].items():
                hits.setdefault(c, h)
        legal = max((r["legal"] for r in res), key=lambda x: LIGHT_RANK[x])
        return {"verdict": worst["verdict"], "legal": legal, "codes": codes, "hits": hits}
    src = str(text or "").replace("*", " ")
    verdict, legal, codes, hits = "PASS", "", [], {}
    for r in _rules():
        text = _mask(r, src)
        found = [m.group(0).strip() for rx in r["_re"] for m in rx.finditer(text)]
        found += [k for k in r["ko"] if k in text]
        compensated = any(rx.search(text) for rx in r["_comp"])
        incentive = not compensated and any(rx.search(text) for rx in r["_inc"])
        if not found and not compensated and not incentive:
            continue
        v = r["byChannel"].get(channel, r["verdict"])
        if product and product in r.get("byProduct", {}):
            v = r["byProduct"][product]
        if incentive and RANK.get(r.get("incentiveVerdict"), -1) > RANK[v]:
            v = r["incentiveVerdict"]
        if compensated:
            v = "BLOCK"
        if v == "PASS":   # 이 제품에서는 괜찮은 표현 (예: Balance의 Zero Sugar · 브라우저와 같음)
            continue
        light = r.get("legal") or "yellow"
        if product and product in r.get("legalByProduct", {}):
            light = r["legalByProduct"][product]
        if compensated and r.get("compensatedLegal"):
            light = r["compensatedLegal"]
        if LIGHT_RANK[light] > LIGHT_RANK[legal]:
            legal = light
        codes.append(r["code"])
        hits[r["code"]] = found[:5] or ["(보상 조건 문구)" if compensated else "(후기 대가 문구)"]
        if RANK[v] > RANK[verdict]:
            verdict = v
    return {"verdict": verdict, "legal": legal, "codes": codes, "hits": hits}
