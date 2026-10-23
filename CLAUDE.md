# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

작업 전에 저장소 루트의 `RULE.md`(팀 협업 규칙)와 `AI_RULES.md`(AI 도구 사용 규칙, 특히 §2~§4와 사용하는 도구의 절: Gemini §10.4, Claude Code §11, Codex §12, 그 밖의 도구 §13)를 반드시 읽고 따른다. 두 문서가 다르면 `RULE.md`가 우선한다.

- 파일을 생성·수정·삭제하기 전에 경로와 변경 내용을 한국어로 보고하고 사용자 승인을 기다린다. (보고 형식: `AI_RULES.md` §2.2)
- 사용자의 담당 파트 폴더 밖과 공통 영역(`reboot-dashboard/core/`, `server/` 바로 아래 파일, `server/core·auth·catalog·templates/`, `requirements.txt`, `.env.example`, `render.yaml`, `.github/`, 규칙 문서, AI 도구 설정 파일)은 수정하지 않고 보고만 한다. (`RULE.md` §5.2·§5.3)
- 대시보드 코드를 다룰 때는 `reboot-dashboard/CLAUDE.md`(코드 작업 규칙)와 `reboot-dashboard/docs/DEV_GUIDE.md`도 따른다. 브랜치·PR 규칙이 다르면 이 파일과 `RULE.md`가 우선한다.
- 작업할 파트의 설명서 `reboot-dashboard/docs/<파트ID>/README.md`와 `NOTES.md`를 먼저 읽는다. 다른 파트 기능은 수정하지 않고 `REBOOT.use('<파트ID>')`(화면)나 공용 API(`/api/seasons`, `/api/facts` …)로만 가져다 쓴다.
- 새 함수·파일을 만들기 전에 해당 파트의 `parts/<파트ID>/`, `server/<파트ID>/`와 `core/core.js`, `server/core/`에 같은 역할이 있는지 먼저 찾는다.
- 작업은 사용자의 이니셜 브랜치(예: `NW`)에서 하고, main·pre_main에서는 작업하지 않는다. 시작 전에 pre_main 최신 내용을 merge했는지 확인한다.
- 기능 추가·수정 구분은 커밋 메시지 타입(`feat:`, `fix:`, `docs:` 등)으로 한다. Git 쓰기 명령은 매번 허가를 받는다. force push, reset --hard, rebase는 하지 않는다.
- 명령은 Windows cmd 기준으로 작성한다. (예: `venv\Scripts\activate`, `copy`)
- .env, API 키, DB 파일(instance/, *.db)의 내용을 출력하거나 복사하지 않는다.
- `AGENTS.md`(Codex 등)·`CLAUDE.md`(Claude Code)·`GEMINI.md`(Gemini) 세 파일은 내용이 같다. 고칠 때는 세 파일을 함께 고친다. (`AI_RULES.md` §6)

## 프로젝트 현황

- REBOOT US 마케팅 대시보드: 알디콤을 모티브로 한 숙취해소 젤리·음료 **REBOOT**의 미국 마케팅 업무용 사내 Flask 대시보드. 6인 팀 프로젝트.
- 코드는 `reboot-dashboard/`에 있다. 기능·메뉴·담당은 `README.md`(§5·§6·§11)와 `reboot-dashboard/README.md`, 개발 규칙은 `reboot-dashboard/docs/DEV_GUIDE.md`.
- 구조: Flask 서버 `server/`(`create_app`, 파트별 `server/<파트ID>/`, 메뉴 목록 `server/registry.py`) + 공통 화면 `core/`(`base.css` 디자인, `core.js`의 `REBOOT.register/expose/use/store`) + 파트 화면 `parts/<파트ID>/`.
- 파트 ID와 담당: home·insights·settings·auth(로그인) = HK, content = NW, compliance·cs = JH, partners·performance = HJ. (`RULE.md` §5.3)
- AI: 홈·인사이트·콘텐츠·파트너·성과분석은 OpenAI, 컴플라이언스·CS는 Claude(Anthropic). 키는 `.env` · Render Environment · 설정 › 연결 화면에서만 읽고, 코드·HTML·JS에 넣지 않는다.
- 사실·숫자·FDA 문구를 지어내지 않는다(모르면 `null` · `{확인 필요}`). 컴플라이언스 PASS는 법적 승인이 아니며, 모든 발송은 사람이 최종 확인한다. (`README.md` §12)
- npm · React · 빌드 도구 · `type="module"`·`import`를 쓰지 않는다.
- 배포: Render Blueprint(`render.yaml`, `rootDir: reboot-dashboard`), 배포 브랜치는 `main`.

## 명령

```cmd
cd reboot-dashboard
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
python -m server
python -m pytest
python -m pytest tests\test_content.py -k 테스트이름
node --check parts\<파트ID>\<파일>.js
```

- 테스트는 인터넷·키 없이 통과해야 한다. PR을 올리면 GitHub Actions(`.github/workflows/tests.yml`)가 같은 확인을 자동으로 돌린다.
- 포매터로 파일 전체를 자동 정렬하지 않는다. 바뀐 줄이 많아져 충돌이 난다.
- `pip freeze > requirements.txt`를 쓰지 않는다. 새 패키지는 승인 후 `reboot-dashboard/requirements.txt`에 버전을 고정해 한 줄씩 추가한다.
