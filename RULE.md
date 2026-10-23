# 📋 팀 협업 규칙 (RULE.md)

이 문서는 6인 팀이 GitHub에서 브랜치를 나눠 작업하고 안전하게 병합하기 위한 규칙입니다.
모든 팀원은 작업 전에 이 문서를 읽고 따릅니다. AI 코딩 도구 사용 규칙은 [`AI_RULES.md`](./AI_RULES.md)를 따릅니다.

- **프레임워크**: Flask 단독 (Flask + Jinja 템플릿 + HTML/CSS/JS)
- **개발 환경**: Windows (명령어는 `cmd` 기준)
- **브랜치 구조**: `main` ← `pre_main` ← 개인 기능 브랜치

---

## 1. 팀 구성과 역할

| 이니셜 | 이름 | 역할 | 권한·책임 |
|---|---|---|---|
| **JH** | 준희 | 팀장 | 일정 관리, 이슈 우선순위 조정, 파트 분담 확정, PR 리뷰 |
| **HK** | 현경 | PM | PR 최종 리뷰, `pre_main` 병합, `pre_main → main` 승인·병합 |
| **KHS** | 강현서 | PM | PR 최종 리뷰, `pre_main` 병합, `pre_main → main` 승인·병합 |
| **YHS** | 양효선 | 팀원 | 기능 개발, PR 생성, 코드 리뷰 참여 |
| **NW** | 나원 | 팀원 | 기능 개발, PR 생성, 코드 리뷰 참여 |
| **HJ** | 혁주 | 팀원 | 기능 개발, PR 생성, 코드 리뷰 참여 |

- PM 두 명(HK, KHS)은 **동등한 권한**을 가집니다.
- 팀장·PM도 개발할 때는 팀원과 똑같이 기능 브랜치와 PR 절차를 따릅니다.
- 이니셜은 이름의 이니셜이며, 겹치는 사람은 성까지 넣습니다. (강현서 KHS, 양효선 YHS)

---

## 2. 기본 원칙

1. **`main`과 `pre_main`에는 직접 커밋·push하지 않습니다.** 모든 변경은 PR로만 들어갑니다.
2. **다른 사람이 작성한 코드는 임의로 수정·삭제하지 않습니다.** 필요하면 작성자와 먼저 협의합니다.
3. **자기 담당 폴더 안에서 작업합니다.** 공통 파일(§5.2)은 팀장 또는 PM과 협의 후 수정합니다.
4. **같은 기능을 두 번 만들지 않습니다.** 새로 만들기 전에 이미 있는 함수·라우트·템플릿을 먼저 찾아봅니다.
5. **작게, 자주 PR합니다.** 한 PR에는 한 가지 기능 또는 한 가지 수정만 담습니다.

---

## 3. 브랜치 전략

### 3.1 브랜치 종류

| 브랜치 | 용도 | 만드는 곳 → 병합하는 곳 |
|---|---|---|
| `main` | 언제나 실행되는 최종 안정 버전 | `pre_main`에서만 병합 |
| `pre_main` | 통합 브랜치. 모든 기능이 모여 함께 검증되는 곳 | 기능 브랜치에서 병합 |
| `feature/이니셜-기능명` | 새 기능 개발 | `pre_main`에서 생성 → `pre_main`으로 PR |
| `fix/이니셜-버그명` | 버그 수정 | `pre_main`에서 생성 → `pre_main`으로 PR |
| `hotfix/이니셜-버그명` | `main`이 고장 났을 때 긴급 수정 (§4.5) | `main`에서 생성 → `main`으로 PR |

### 3.2 브랜치 이름 규칙

- 형식: `종류/이니셜-기능명` — 영어 소문자와 하이픈(`-`)만 사용, 한글·공백 금지
- 이니셜은 대문자 그대로 씁니다: `JH`, `HK`, `KHS`, `YHS`, `NW`, `HJ`
- 이슈 번호가 있으면 이니셜 뒤에 붙입니다.
- 두 파트를 맡은 사람은 기능명 앞에 파트 이름을 붙여 어느 파트 작업인지 드러냅니다. (예: `feature/JH-cs-reply-draft`, `feature/JH-compliance-batch-review`)

```text
feature/HK-login-page
feature/NW-12-channel-copy-cards
fix/HJ-performance-chart-not-showing
hotfix/HK-app-start-error
```

### 3.3 브랜치 수명

- **기능 하나마다 새 브랜치**를 만듭니다. 한 브랜치를 여러 기능에 계속 쓰지 않습니다.
- PR이 병합되면 해당 브랜치는 삭제합니다. (GitHub의 **Delete branch** 버튼 또는 자동 삭제 설정)
- 다음 작업은 최신 `pre_main`에서 새 브랜치를 만들어 시작합니다.

---

## 4. 작업 흐름

```text
pre_main ──(브랜치 생성)──> feature/YHS-login-page
                                   │ 개발·커밋·push
                                   ▼
                              PR → pre_main  (리뷰어 1명 승인)
                                   │
                                   ▼
                              pre_main ──(실행 확인)──> PR → main  (PM 1명 승인)
```

### 4.1 작업 시작 (Windows cmd)

```cmd
git switch pre_main
git pull origin pre_main
git switch -c feature/YHS-login-page
```

### 4.2 작업 중

```cmd
git status
git add 파일경로
git commit -m "feat: 로그인 페이지 추가"
git push -u origin feature/YHS-login-page
```

- `git add .` 대신 **바꾼 파일을 직접 지정**하는 것을 권장합니다. `.env`, DB 파일 등이 실수로 올라가는 것을 막을 수 있습니다.
- 작업이 하루 이상 걸리면 매일 시작할 때 `pre_main`의 최신 내용을 가져와 충돌을 미리 줄입니다.

```cmd
git fetch origin
git merge origin/pre_main
```

> **rebase와 force push는 사용하지 않습니다.** 충돌은 위처럼 `merge`로 해결합니다. 규칙을 단순하게 유지하고, 이미 올린 기록을 덮어쓰는 사고를 막기 위해서입니다.

### 4.3 기능 브랜치 → `pre_main` PR

1. PR을 올리기 직전에 §4.2의 `git merge origin/pre_main`으로 최신 내용을 반영하고, 로컬에서 앱이 실행되는지 확인합니다.
2. GitHub에서 **base: `pre_main` ← compare: 내 브랜치**로 PR을 엽니다. (base가 `main`이 아닌지 꼭 확인)
3. PR 템플릿(§7.3)을 채웁니다.
4. **작성자를 제외한 1명 이상**이 승인하면 병합할 수 있습니다.
5. 병합은 **PM(HK 또는 KHS)** 이 하며, 방식은 **Squash and merge**로 통일합니다.
6. 본인 PR은 본인이 병합하지 않습니다. (PM이 작성한 PR은 다른 PM이 병합)

### 4.4 `pre_main` → `main` 병합

**주기**: 기능 하나가 완성될 때마다, 그리고 **최소 주 1회** (변경이 없는 주는 생략)

**절차**

1. 팀장 또는 PM이 **base: `main` ← compare: `pre_main`** PR을 엽니다. 제목 예: `release: 2026-10-29 주간 병합`
2. 병합 전 `pre_main`에서 아래 **실행 확인 체크리스트**를 모두 통과합니다.
3. **PM 두 명 중 1명**이 승인합니다. 단, **그 PR을 연 PM 본인은 승인할 수 없습니다.**
   - HK가 PR을 열면 → KHS가 승인
   - KHS가 PR을 열면 → HK가 승인
   - JH(팀장)가 PR을 열면 → HK 또는 KHS 중 1명이 승인
4. 병합 방식은 **Create a merge commit**을 사용합니다. (Squash 금지 — §4.6 참고)

**실행 확인 체크리스트** (PR 본문에 복사해서 체크)

```markdown
- [ ] pre_main을 새로 받아서(git pull) 가상환경에 requirements.txt 설치 완료
- [ ] flask run 으로 앱이 오류 없이 실행됨
- [ ] 이번에 들어간 기능의 화면/라우트를 직접 눌러 확인함
- [ ] 기존 주요 화면(메인, 로그인 등)이 깨지지 않음
- [ ] 테스트가 있으면 pytest 통과
- [ ] .env, DB 파일, 업로드 파일 등 올리면 안 되는 파일이 포함되지 않음
```

### 4.5 긴급 수정 (hotfix)

`main`에서 앱이 실행되지 않는 등 급한 문제가 생겼을 때만 사용합니다.

1. `main`에서 `hotfix/이니셜-버그명` 브랜치를 만들어 수정합니다.
2. **base: `main`** 으로 PR → PM 1명 승인(작성자가 PM이면 다른 PM) → 병합
3. 병합 직후 **`main` → `pre_main` PR**을 만들어 같은 수정을 `pre_main`에도 반영합니다. (빼먹으면 다음 병합 때 문제가 다시 생깁니다)
   - 이 PR은 **Create a merge commit**으로 병합합니다. Squash하면 `main`과 `pre_main`의 기록이 어긋납니다. (§4.6)

### 4.6 병합 방식을 나누는 이유

| 경로 | 방식 | 이유 |
|---|---|---|
| 기능 브랜치 → `pre_main` | **Squash and merge** | 기능 하나가 커밋 하나로 정리되어 기록이 깔끔함 |
| `pre_main` → `main` | **Create a merge commit** | Squash하면 `main`과 `pre_main`의 기록이 서로 달라져, 다음 병합 때마다 이미 들어간 내용이 충돌로 다시 나타남 |
| `main` → `pre_main` (hotfix 역반영) | **Create a merge commit** | 위와 같은 이유 |

### 4.7 충돌 해결

- 충돌은 **PR을 올린 사람**이 자기 브랜치에서 해결합니다.
- 충돌 부분이 다른 사람의 코드라면, 지우거나 덮어쓰지 말고 **작성자와 상의**해서 해결합니다.
- 해결 후 앱이 실행되는지 다시 확인하고 push합니다.

---

## 5. 폴더 구조와 담당 범위

### 5.1 기본 폴더 구조 (Flask)

파트 분담이 확정되면 파트마다 **Blueprint 폴더 하나**를 만들고, 각자 자기 폴더 안에서 작업합니다.
이렇게 나누면 서로 같은 파일을 고칠 일이 줄어 충돌이 크게 줄어듭니다.

```text
project-root/
├── app.py                  # 앱 생성, Blueprint 등록 (공통)
├── config.py               # 설정값 (공통)
├── requirements.txt        # 패키지 목록 (공통)
├── .env.example            # 환경변수 예시 (공통, 실제 값 없음)
├── .gitignore / .gitattributes
├── README.md / RULE.md / AI_RULES.md
├── AGENTS.md / CLAUDE.md / GEMINI.md / .geminiignore   # AI 도구 설정 (공통, AI_RULES.md §6)
├── core/                   # 공통 기능: DB 연결, AI 호출, 공통 유틸
│   ├── services/           # llm.py, db.py 등
│   ├── templates/          # base.html 등 공통 레이아웃
│   └── static/             # 공통 CSS/JS
├── content/                # 파트별 Blueprint 하나 (파트 목록은 README.md §6)
│   ├── __init__.py         # Blueprint 정의 (url_prefix="/content")
│   ├── routes.py
│   ├── services/
│   ├── models.py           # 이 파트 전용 DB 테이블 (테이블 이름 앞에 파트 이름)
│   ├── prompts/            # 이 파트의 AI 프롬프트
│   ├── templates/content/  # 템플릿 이름 충돌 방지를 위해 한 번 더 폴더로 감쌈
│   ├── static/content/
│   ├── data/               # 수동 · 더미 데이터
│   └── README.md           # 파트 README (담당자 작성, §5.4)
├── home/ insight/ compliance/ cs/ influencer/ performance/   # 나머지 탭 (§5.3)
├── auth/ settings/         # 탭이 아닌 화면 (로그인, 설정)
├── tests/                  # 파트별 하위 폴더 (tests/content/ ...)
└── instance/               # 로컬 DB 등 (Git에 올리지 않음)
```

### 5.2 공통 영역

다음 파일·폴더는 여러 사람에게 영향을 주므로 **팀장 또는 PM과 협의 후** 수정하고, PR에 공통 영역 수정임을 표시합니다.

- `app.py`, `config.py`, `requirements.txt`, `.env.example`, `.gitignore`, `.gitattributes`
- `core/` 전체 (특히 DB 구조, 공통 템플릿 `base.html`, 공통 CSS/JS)
- 루트의 `README.md`, `RULE.md`, `AI_RULES.md` (파트 폴더의 `README.md`는 해당 담당자가 관리, §5.4)
- AI 도구 설정: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.geminiignore`, `.claude/settings.json` (그 밖의 도구 규칙 파일은 `AI_RULES.md` §13)

### 5.3 파트 분담표

화면 상단 탭 하나가 파트 하나입니다. 분담이 바뀌면 **팀장(JH)** 이 이 표와 `README.md` §6·§11을 같은 PR로 고칩니다.

| 탭 (화면 순서) | 전용 폴더 | 담당자 |
|---|---|---|
| 🏠 홈 · 데일리 브리핑 | `home/` | HK (현경) |
| 🔍 시장 · 고객 인사이트 | `insight/` | HK (현경) |
| ✍️ 콘텐츠 제작 | `content/` | NW (나원) |
| 🛡️ 컴플라이언스 | `compliance/` | JH (준희) |
| 💬 고객 응대 (CS) | `cs/` | JH (준희) |
| 🤝 인플루언서 · 파트너 | `influencer/` | HJ (혁주) |
| 📊 성과분석 | `performance/` | HJ (혁주) |
| 🔐 로그인 (탭 아님) | `auth/` | HK (현경) |
| ⚙️ 설정 (탭 아님) | `settings/` | HK (현경) |

- KHS(강현서), YHS(양효선)는 개발 파트 없이 다른 업무를 맡습니다. KHS는 PM으로서 PR 리뷰·병합 역할(§1)은 그대로 합니다.
- 두 파트를 맡은 사람도 파트마다 브랜치·PR을 따로 만듭니다.

- 다른 파트의 기능이 필요하면 그 폴더의 파일을 직접 고치지 말고, **담당자에게 함수나 API를 요청**해서 가져다 씁니다.
- 파트 사이에 주고받는 데이터(함수 이름, 요청/응답 형식)가 바뀌면 영향을 받는 담당자에게 먼저 알립니다.

### 5.4 파트 README

각 파트(기능 탭) 폴더에는 그 파트 담당자가 관리하는 `README.md`를 둡니다. 공통 영역이 아니므로 담당자가 직접 수정합니다.

- 적을 내용: 담당자, 기능(화면), 라우트, 주요 파일, 다른 파트에 제공하는 함수, 사용하는 데이터·외부 API
- 파트의 기능·라우트·제공 함수가 바뀌면 **같은 PR에서 README도 고칩니다.**
- 다른 파트 기능이 필요하면 먼저 그 파트 README의 "다른 파트에 제공하는 함수"를 확인합니다.

---

## 6. 네이밍 컨벤션

### 6.1 Python
- 변수·함수: `snake_case` (예: `user_name`, `get_user_data()`)
- 클래스: `PascalCase` (예: `UserService`)
- 상수: `UPPER_SNAKE_CASE` (예: `MAX_RETRY_COUNT`), 하드코딩 대신 `config.py` 또는 파트의 `constants.py`에 모음
- 불리언: `is_`, `has_`, `should_` 접두어 (예: `is_valid`)
- 약어 지양: `usr` ❌ → `user` ✅
- 파일명: `snake_case.py`

### 6.2 JavaScript (템플릿 안 스크립트, static/js)
- 변수·함수: `camelCase` (예: `userName`, `loadChart()`)
- 파일명: `snake_case.js` 또는 `kebab-case.js` 중 파트 안에서 통일

### 6.3 템플릿·정적 파일
- 템플릿: `templates/파트명/페이지명.html` (예: `content/templates/content/detail.html`)
- 정적 파일: `static/파트명/` (예: `content/static/content/copy_card.js`)
- 다른 파트와 같은 이름의 템플릿을 쓰지 않도록 반드시 파트 폴더로 감쌉니다.

### 6.4 라우트(URL)
- 화면 라우트: Blueprint 접두어 사용 (예: `/content/`, `/content/detail/<id>`). 파트별 접두어는 README.md §6
- API 라우트: `/파트명/api/명사-복수형` (예: `/cs/api/inquiries`, `/cs/api/inquiries/<id>`)
- 동사 대신 명사 사용: `/cs/getInquiry` ❌ → `/cs/api/inquiries/<id>` ✅

---

## 7. 커밋 · 이슈 · PR

### 7.1 커밋 메시지

형식: `타입: 무엇을 왜 바꿨는지` (한국어 가능, 명사형 종결 권장)

| 타입 | 용도 | 예시 |
|---|---|---|
| `feat` | 새 기능 추가, 기존 기능 변경 | `feat: 상품 검색 페이지 추가` |
| `fix` | 버그·에러·화면 깨짐 수정 | `fix: 로그인 후 리다이렉트 오류 수정` |
| `refactor` | 동작은 그대로, 코드 구조만 정리 | `refactor: 검색 로직을 services로 분리` |
| `docs` | 문서 작성·수정 | `docs: README 실행 방법 추가` |
| `chore` | 설정, 패키지, 잡무 | `chore: requirements에 pandas 추가` |

- 한 커밋에는 한 가지 목적의 변경만 담습니다.
- `수정`, `asdf`, `final` 같은 의미 없는 메시지는 쓰지 않습니다.

### 7.2 이슈 관리

- 작업 시작 전에 GitHub Issue를 만들고 본인을 Assignee로 지정합니다.
- 라벨: `feature`, `bug`, `docs`, `urgent`, `pm-review`
- 팀장(JH)이 이슈 보드(Projects)에서 우선순위와 일정을 관리합니다.

### 7.3 PR 작성

- 제목은 커밋 메시지 규칙과 동일하게 작성합니다. (예: `feat: 상품 검색 페이지 추가`)
- 본문 템플릿:

```markdown
## 무엇을 바꿨나요
-

## 바꾼 파일 / 폴더
-

## 확인 방법
- [ ] 로컬에서 앱 실행 확인
- [ ] 확인한 화면/라우트:
- [ ] 파트 README 갱신 (기능·라우트·제공 함수가 바뀐 경우)

## 공통 영역·다른 파트 영향
- 없음 / 있음 (내용, 확인 요청할 담당자)

## 패키지·환경변수 변경
- 없음 / 있음 (requirements.txt, .env.example 반영 여부)

## AI 도구 사용
- 없음 / 있음 (사용한 도구, 사용한 부분)

## 관련 이슈
- #
```

### 7.4 리뷰

- 리뷰어는 **24시간 안에** 승인 또는 코멘트를 남기는 것을 목표로 합니다.
- 리뷰는 코드에 대해서만 하고, 수정 요청은 이유와 함께 구체적으로 적습니다.
- 수정 요청을 받은 경우 같은 브랜치에 커밋을 추가해 push하면 PR에 자동 반영됩니다.

---

## 8. 개발 환경 (Windows)

### 8.1 처음 받기

```cmd
git clone 저장소주소
cd 프로젝트폴더
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

- `.env`에는 각자 받은 실제 값을 채웁니다. **`.env`는 절대 커밋하지 않습니다.**
- Python 버전은 팀장이 확정해 README에 적고, 모두 같은 버전을 사용합니다.

### 8.2 패키지 추가

- 새 패키지가 필요하면 PR에 이유를 적고 `requirements.txt`에 버전과 함께 추가합니다. (예: `pandas==2.2.3`)
- `pip freeze > requirements.txt`로 파일 전체를 덮어쓰지 않습니다. 개인 환경의 불필요한 패키지까지 섞여 충돌이 생깁니다.

### 8.3 줄바꿈(CRLF/LF) 설정

Windows에서 줄바꿈 차이 때문에 바꾸지 않은 줄까지 변경된 것으로 보이는 문제를 막기 위해, 저장소 루트에 `.gitattributes`를 둡니다.

```gitattributes
* text=auto
*.py text eol=lf
*.html text eol=lf
*.css text eol=lf
*.js text eol=lf
*.md text eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
```

### 8.4 `.gitignore` 필수 항목

```gitignore
__pycache__/
*.pyc
venv/
.venv/
.env
instance/
*.db
*.sqlite3
uploads/
.vscode/
.idea/
.claude/settings.local.json
.DS_Store
Thumbs.db
```

---

## 9. 코드 스타일

- 들여쓰기: Python 4칸, HTML/CSS/JS 2칸
- 포매터: `black` (Python). 커밋 전에 **내가 바꾼 파일만** 포맷합니다.

```cmd
black 내가바꾼파일.py
```

- `black .`처럼 **프로젝트 전체를 한 번에 포맷하지 않습니다.** 다른 사람 파일까지 바뀌어 대량 충돌이 납니다.
- 주석은 "무엇을"보다 "왜"를 적습니다.

---

## 10. GitHub 저장소 설정 (PM이 최초 1회)

규칙을 말로만 정하면 실수로 `main`에 push되는 일을 막을 수 없습니다. GitHub에서 아래를 설정해 실제로 막습니다.

**Settings → Rules → Rulesets** (또는 Settings → Branches → Branch protection rules)

| 설정 | `main` | `pre_main` |
|---|---|---|
| Require a pull request before merging | ✅ | ✅ |
| Required approvals | 1 | 1 |
| Require review from Code Owners | ✅ | ❌ |
| Dismiss stale approvals when new commits are pushed | ✅ | ✅ |
| Block force pushes | ✅ | ✅ |
| Restrict deletions | ✅ | ✅ |
| 허용 병합 방식 | Merge commit | Squash, Merge commit (hotfix 역반영 전용) |

**`.github/CODEOWNERS`** — `main`으로 가는 PR은 PM이 승인해야 하도록 지정합니다. (GitHub 아이디로 교체)

```text
* @HK의깃허브아이디 @KHS의깃허브아이디
```

- GitHub는 PR 작성자가 자기 PR을 승인하는 것을 허용하지 않으므로, "PR을 연 PM은 승인 불가" 규칙은 자동으로 지켜집니다.
- **Settings → General → Pull Requests**에서 *Automatically delete head branches*를 켜면 병합된 브랜치가 자동 삭제됩니다.
  - `pre_main → main`, `main → pre_main` PR에서는 `pre_main`·`main`이 head 브랜치가 됩니다. 위의 *Restrict deletions*로 보호된 브랜치는 삭제되지 않지만, 설정 후 첫 병합 때 두 브랜치가 남아 있는지 확인합니다.
- 기본 브랜치(default branch)를 `pre_main`으로 바꿔 두면 PR을 열 때 base가 자동으로 `pre_main`으로 잡혀 실수가 줄어듭니다.

### 10.1 공개(Public) 저장소로 운영

이 프로젝트는 **공개 저장소**로 운영합니다. 무료 플랜에서도 위의 브랜치 보호 규칙을 모두 사용할 수 있습니다.
대신 **인터넷의 누구나 코드와 커밋 기록 전체를 볼 수 있으므로** 아래를 반드시 지킵니다.

- **비밀 정보는 한 번이라도 커밋하면 유출된 것으로 봅니다.** 나중에 파일을 지워도 커밋 기록에 남습니다. 실수로 올렸다면 즉시 팀장·PM에게 알리고 해당 키를 **폐기 후 재발급**합니다. (§11)
- **Settings → Code security**(또는 Security)에서 *Secret scanning*과 *Push protection*을 켜 둡니다. API 키로 보이는 값이 push되면 GitHub가 차단·경고합니다. 완벽하지 않으므로 `.gitignore`와 직접 확인이 우선입니다.
- 실제 사용자 데이터, 개인정보(이름·연락처·학번 등), 회의록·내부 문서는 저장소에 올리지 않습니다. 테스트에는 가짜 데이터를 씁니다.
- 외부 사람도 저장소를 Fork하고 PR을 보낼 수 있습니다. 팀원이 아닌 사람의 PR은 병합하지 않고 닫습니다.
- 첫 커밋 전에 PM이 `.gitignore`(§8.4)가 들어 있는지 확인한 뒤 코드를 올립니다.

브랜치 보호와 별개로, 각자 PC에 아래 **push 차단 훅**을 설치해 실수로 `main`/`pre_main`에 push하는 것을 한 번 더 막습니다. (본인 PC에서만 동작하는 안전장치입니다)

`.git\hooks\pre-push` 파일 (확장자 없음):

```sh
#!/bin/sh
while read local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/main|refs/heads/pre_main)
      echo "main/pre_main에는 직접 push할 수 없습니다. PR을 이용하세요."
      exit 1 ;;
  esac
done
exit 0
```

> Windows에서도 Git for Windows가 이 파일을 실행하므로 그대로 동작합니다. `.git` 폴더 안은 Git으로 공유되지 않으므로 **각자 직접** 만들어야 합니다.

---

## 11. 비밀 정보와 데이터

- `.env`, API 키, 비밀번호, DB 파일, 사용자 업로드 파일은 **커밋·메신저·AI 채팅에 올리지 않습니다.**
- 새 환경변수가 필요하면 `.env.example`에 **이름만** 추가하고(값은 비움), PR에 적습니다.
- 실수로 비밀 정보를 push했다면 즉시 팀장·PM에게 알리고 해당 키를 **폐기 후 재발급**합니다. (커밋을 지워도 기록에 남기 때문)
- 테스트에는 실제 사용자 데이터가 아닌 가짜(합성) 데이터를 사용합니다.

---

## 12. 규칙 변경

- 이 문서는 `docs:` PR로만 수정하며, 팀장과 PM 1명 이상의 승인이 필요합니다.
- 규칙이 실제 작업과 맞지 않으면 언제든 이슈로 제안합니다.
