# AGENTS.md

작업 전에 저장소 루트의 `RULE.md`(팀 협업 규칙)와 `AI_RULES.md`(AI 도구 사용 규칙, 특히 §2~§4와 사용하는 도구의 절: Gemini §10.4, Claude Code §11, Codex §12, 그 밖의 도구 §13)를 반드시 읽고 따른다. 두 문서가 다르면 `RULE.md`가 우선한다.

- 파일을 생성·수정·삭제하기 전에 경로와 변경 내용을 한국어로 보고하고 사용자 승인을 기다린다. (보고 형식: `AI_RULES.md` §2.2)
- 사용자의 담당 폴더 밖과 공통 영역(app.py, config.py, requirements.txt, .env.example, core/, 규칙 문서, AI 도구 설정 파일)은 수정하지 않고 보고만 한다.
- 작업할 파트 폴더의 `README.md`를 먼저 읽는다. 다른 파트 기능은 그 파트 README의 "다른 파트에 제공하는 함수"를 확인하고 가져다 쓴다. (`RULE.md` §5.4)
- 새 함수·파일을 만들기 전에 해당 파트의 README.md, routes.py, services/, templates/, static/와 core/에서 같은 역할이 있는지 먼저 찾는다.
- 작업은 사용자의 이니셜 브랜치(예: `NW`)에서 하고, main·pre_main에서는 작업하지 않는다. 시작 전에 pre_main 최신 내용을 merge했는지 확인한다.
- 기능 추가·수정 구분은 커밋 메시지 타입(`feat:`, `fix:`, `docs:` 등)으로 한다. Git 쓰기 명령은 매번 허가를 받는다. force push, reset --hard, rebase는 하지 않는다.
- 명령은 Windows cmd 기준으로 작성한다. (예: `venv\Scripts\activate`, `copy`)
- .env, API 키, DB 파일(instance/, *.db)의 내용을 출력하거나 복사하지 않는다.
- `AGENTS.md`(Codex 등)·`CLAUDE.md`(Claude Code)·`GEMINI.md`(Gemini) 세 파일은 내용이 같다. 고칠 때는 세 파일을 함께 고친다. (`AI_RULES.md` §6)

## 프로젝트 현황

- REBOOT US 마케팅 대시보드: 숙취해소제 '알디콤'의 미국 마케팅 담당자용 사내 Flask 대시보드(Flask + Jinja + HTML/CSS/JS). 6인 팀 프로젝트이며 코드는 아직 없다.
- 기능·메뉴·우선순위·파트 담당은 `README.md`(§5 메뉴, §6 폴더 구조, §10 로드맵, §11 팀)를 따른다.
- 구조: 루트 `app.py`의 `create_app()`이 파트 Blueprint를 등록한다. 공통 기능은 `core/`(`services/llm.py`, `services/db.py`, `templates/base.html`, `static/`)에 둔다.
- AI 기능은 OpenAI API를 쓴다. 파트 코드에서 `openai`를 직접 호출하지 않고 `core/services/llm.py`의 공통 함수를 거친다. 키는 `.env`의 `OPENAI_API_KEY`.
- 탭(파트) 폴더는 화면 순서대로 home, insight, content, compliance, cs, influencer, performance이고, 탭이 아닌 auth(로그인), settings(설정)가 있다. 담당은 `RULE.md` §5.3. 각 폴더는 `__init__.py`(url_prefix=`/<파트>`), routes.py, services/, models.py, prompts/, `templates/<파트>/`, `static/<파트>/`, data/, README.md로 구성한다.
- DB 테이블 이름은 파트 이름으로 시작한다. (예: `cs_inquiry`) 다른 파트 기능은 수정하지 않고 가져다 쓴다. (예: CS·콘텐츠·인플루언서 → `compliance.services`의 심의 함수)
- 광고 문구 관련 기능은 FDA 질병 주장 규제를 전제로 한다. (`README.md` §12)

## 명령 (코드가 생긴 뒤)

```cmd
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
flask init-db
flask seed-dummy
flask run --debug
pytest
pytest tests\content\test_파일.py::test_함수명
black 바꾼파일.py
```

- `black .`처럼 전체 포맷하지 않고, 바꾼 파일만 포맷한다.
- `pip freeze > requirements.txt`를 쓰지 않는다. 새 패키지는 승인 후 버전을 고정해 한 줄씩 추가한다.
