"""규제(검열) DB — 컴플라이언스 파트(담당 JH)의 규제 DB를 그대로 가져와 씀 (읽기만, 고치지 않음).

- 규칙 DB: tabs/compliance/server_rules.json (compliance data.js에서 만든 서버용 규칙 · 버전)
- 규제 모니터링: tabs/compliance/static/monitor-data.js (openFDA · 연방 관보 · FDA 경고장, 하루 1회 수집)
- 문구 점검 판정은 화면에서 REBOOT.use('compliance').review(…, {channel: 'b2b'})로 같은 규칙을 씀
"""
import json
import re
from pathlib import Path

from tabs.compliance import server_review

MONITOR_FILE = Path(server_review.__file__).parent / "static" / "monitor-data.js"
_GENERATED = re.compile(r'"generatedAt"\s*:\s*"([^"]+)"')


def status():
    """{connected, source, rulesVersion, ruleCount, monitorAt, error} — 규칙 파일을 실제로 읽어 확인."""
    try:
        data = json.loads(server_review.RULES_FILE.read_text(encoding="utf-8"))
        rules = data.get("rules") or []
    except (OSError, ValueError) as e:
        return {"connected": False, "source": "compliance", "rulesVersion": "", "ruleCount": 0, "monitorAt": None,
                "error": f"컴플라이언스 규칙 DB를 읽지 못했습니다 ({type(e).__name__})."}
    monitor_at = None
    try:
        m = _GENERATED.search(MONITOR_FILE.read_text(encoding="utf-8")[:4000])
        monitor_at = m.group(1) if m else None
    except OSError:
        pass
    return {"connected": bool(rules), "source": "compliance", "rulesVersion": str(data.get("version") or ""),
            "ruleCount": len(rules), "monitorAt": monitor_at, "error": "" if rules else "규칙이 비어 있습니다."}
