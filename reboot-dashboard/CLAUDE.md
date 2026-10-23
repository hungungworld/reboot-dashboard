# CLAUDE.md · REBOOT US 마케팅 대시보드 (3조 · Flask · Render)

> Claude Code가 이 폴더에서 일할 때 먼저 읽는 공통 규칙입니다. 바꿀 때는 팀 단톡에 먼저 알리고 PR로 올립니다.

## 상황
- 알디콤을 모티브로 한 숙취해소 젤리·음료 **REBOOT**의 미국 마케팅 대시보드 (무역 AX2기 2차 미니프로젝트 3조)
- 구조: Flask 서버(`server/`) + 공통 화면(`core/`) + 파트 화면(`parts/<파트ID>/`) · Render에 배포 (저장소 맨 위 `../render.yaml`, `rootDir: reboot-dashboard`)
- 작업자는 코딩 비전공자 → **설명은 쉬운 말로, 짧게** (바뀐 점 3줄 + 표)
- 자세한 개발 규칙: `docs/DEV_GUIDE.md` · 파트별 설명서: `docs/<파트ID>/README.md`

## 이미 정한 것 (바꾸지 않음)
- 미국 제품 분류는 **일반식품(Conventional Food)**. 건강기능식품은 비교용 옵션
- 컴플라이언스 규칙 R1~R10 · 판정 5단계 BLOCK · REVISE · COND · REVIEW · PASS. **PASS는 법적 승인이 아님**
- BLOCK 문구는 승인 불가 · CS 답장은 BLOCK이면 발송 불가 · 모든 발송은 사람이 최종 확인
- 화면 디자인은 시안 「REBOOT — Marketing Workspace」(`core/base.css`) 기준
- 파트 계약은 팀 README 6장 형식: `REBOOT.register / expose / use / store / ui`

## 작업 범위 (매번 지킬 것)
- **자기 파트 폴더만 수정**: `parts/<파트ID>/` · `server/<파트ID>/` · `tests/test_<파트ID>.py` · `docs/<파트ID>/` · `data/<파트ID>/`
- 공통 파일(`core/`, `server/` 바로 아래 파일, `server/core|auth|catalog/`, `server/templates/`, `requirements.txt`, 저장소 맨 위의 `render.yaml`·`.github/`)은 공통 담당만. 필요하면 고치지 말고 **"공통 요청 Issue 문안"**으로 써 줌
- 다른 파트 데이터는 `REBOOT.use('<파트ID>')`(화면) 또는 공용 API(`/api/seasons` · `/api/facts` …)로만
- 고치기 전에 **바꿀 파일과 이유를 먼저 보여 주고 허락받기**. 한 번에 한 가지 작업, 작업마다 새 브랜치 `<파트ID>/<할일>`

## 하지 않는 것
- npm · React · 빌드 도구 도입, `type="module"`·`import` (팀 README 3장)
- API 키·비밀번호를 코드·HTML·JS에 넣기 → `.env`(로컬) · Render Environment · 설정 › 연결 화면만
- 사실·숫자·FDA 문구 지어내기 → 모르면 `null` · `{확인 필요}` · 빈 상태. 더미는 `예시`·`더미` 배지
- 규칙을 사람 확인 없이 자동으로 바꾸는 기능, 자동 발송
- 우리 제품 성분명을 사실대로 적었을 뿐인데 막히는 오탐
- 저장할 때 파일 전체 자동 정렬(포맷터) — 바뀐 줄이 많아져 충돌남

## 확인 (작업이 끝날 때마다)
```bash
.venv\Scripts\python -m pytest                    # 서버 테스트 (인터넷·키 없이 통과해야 함)
node --check parts\<파트ID>\<파일>.js              # JS 문법
.venv\Scripts\python -m server                    # 화면 확인 http://127.0.0.1:5000
```

## 보고 형식
1. 바뀐 파일 목록
2. 바뀐 점 3줄
3. 확인 결과 (테스트 통과 수 · 직접 확인한 화면)
4. 사람이 결정해야 할 것 (있으면)
