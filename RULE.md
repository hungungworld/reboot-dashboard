# 📋 팀 협업 규칙 (RULE.md)

이 문서는 6인 팀이 GitHub에서 브랜치를 나눠 작업하고 안전하게 병합하기 위한 규칙입니다.
모든 팀원은 작업 전에 이 문서를 읽고 따릅니다. AI 코딩 도구 사용 규칙은 [`AI_RULES.md`](./AI_RULES.md)를 따릅니다.

- **프레임워크**: Flask 단독 (Flask + Jinja 템플릿 + HTML/CSS/JS)
- **개발 환경**: Windows (명령어는 `cmd` 기준)
- **브랜치 구조**: `main` ← `pre_main` ← 개인 브랜치(이니셜)

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
- 팀장·PM도 개발할 때는 팀원과 똑같이 개인 브랜치와 PR 절차를 따릅니다.
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
| `main` | 언제나 실행되는 최종 안정 버전. **배포는 `main`에서만** | `pre_main`에서만 병합 |
| `pre_main` | 통합 브랜치. 모든 사람의 작업이 모여 함께 검증되는 곳 | 개인 브랜치에서 병합 |
| `이니셜` (예: `NW`) | **개인 작업 브랜치.** 기능 추가·버그 수정 모두 여기서 함 | `pre_main`에서 한 번 생성 → `pre_main`으로 PR, **삭제하지 않고 계속 사용** |
| `hotfix/이니셜-버그명` | `main`이 고장 났을 때 긴급 수정 (§4.5) | `main`에서 생성 → `main`으로 PR → 병합 후 삭제 |

### 3.2 브랜치 이름 규칙

- 개인 브랜치 이름은 **자기 이니셜 그대로**입니다: `JH`, `HK`, `KHS`, `YHS`, `NW`, `HJ`
- 기능 추가인지 버그 수정인지는 브랜치 이름이 아니라 **커밋 메시지 타입**(`feat:`, `fix:` 등, §7.1)으로 구분합니다.
- `hotfix/이니셜-버그명`만 예외로 따로 만듭니다. (영어 소문자와 하이픈만 사용, 예: `hotfix/HK-app-start-error`)

### 3.3 개인 브랜치 사용 규칙

- 개인 브랜치는 **한 사람당 하나**이며, PR이 병합되어도 **지우지 않고 계속 씁니다.**
- **작업을 시작할 때마다 먼저 `pre_main`의 최신 내용을 내 브랜치로 가져옵니다.** (§4.2) 다른 사람이 병합한 내용과 멀어지면 나중에 큰 충돌이 납니다.
- 한 브랜치에는 열린 PR이 **하나만** 있을 수 있습니다. PR이 병합되기 전에 같은 브랜치에 커밋을 push하면 그 PR에 같이 들어갑니다. 그래서 **PR 올리기 → 병합 기다리기 → 다음 작업** 순서로 진행합니다.
- 두 파트를 맡은 사람(JH, HK, HJ)도 브랜치는 하나입니다. 대신 **PR 하나에는 한 파트의 작업만** 담고, 그 PR이 병합된 뒤 다른 파트 작업을 올립니다.

---

## 4. 작업 흐름

```text
pre_main ──(처음 한 번 생성)──> NW (개인 브랜치, 계속 사용)
   ▲                              │ ① pre_main 최신 내용 가져오기
   │                              │ ② 개발 · 커밋(feat:/fix:) · push
   │                              ▼
   └──────── 병합 ◀──────── PR → pre_main  (리뷰어 1명 승인)

pre_main ──(실행 확인)──> PR → main  (PM 1명 승인) ──> 배포
```

### 4.1 처음 한 번: 개인 브랜치 만들기 (Windows cmd)

```cmd
git switch pre_main
git pull origin pre_main
git switch -c NW
git push -u origin NW
```

GitHub Desktop: **Current branch**에서 `pre_main` 선택 → **Fetch origin** → **New branch** → 이름에 이니셜 입력 → **Publish branch**

### 4.2 매번 작업할 때

**① 시작: `pre_main` 최신 내용 가져오기** (작업을 시작할 때마다, 하루 이상 걸리면 매일)

```cmd
git switch NW
git fetch origin
git merge origin/pre_main
```

GitHub Desktop: 내 브랜치 선택 → **Fetch origin** → 메뉴 **Branch → Update from pre_main**

**② 작업 · 커밋 · push**

```cmd
git status
git add 파일경로
git commit -m "feat: 채널별 카피 카드 추가"
git push
```

- `git add .` 대신 **바꾼 파일을 직접 지정**하는 것을 권장합니다. `.env`, DB 파일 등이 실수로 올라가는 것을 막을 수 있습니다.

> **rebase와 force push는 사용하지 않습니다.** 충돌은 위처럼 `merge`로 해결합니다. 규칙을 단순하게 유지하고, 이미 올린 기록을 덮어쓰는 사고를 막기 위해서입니다.

### 4.3 개인 브랜치 → `pre_main` PR

1. PR을 올리기 직전에 §4.2 ①로 최신 내용을 반영하고, 로컬에서 앱이 실행되는지 확인합니다.
2. GitHub에서 **base: `pre_main` ← compare: 내 브랜치**로 PR을 엽니다. (base가 `main`이 아닌지 꼭 확인)
3. PR 템플릿(§7.3)을 채웁니다. 제목은 이번 작업의 대표 커밋처럼 씁니다. (예: `feat: 채널별 카피 카드 추가`)
4. **작성자를 제외한 1명 이상**이 승인하면 병합할 수 있습니다.
5. 병합은 **PM(HK 또는 KHS)** 이 하며, 방식은 **Create a merge commit**으로 통일합니다. (§4.6)
6. 본인 PR은 본인이 병합하지 않습니다. (PM이 작성한 PR은 다른 PM이 병합)
7. 병합 후에도 개인 브랜치는 **삭제하지 않습니다.** GitHub에 **Delete branch** 버튼이 보여도 누르지 않습니다.

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
- [ ] pre_main을 새로 받아서(git pull) `reboot-dashboard` 폴더 가상환경에 `requirements-dev.txt` 설치 완료
- [ ] `.venv\Scripts\python -m server` 로 앱이 오류 없이 실행됨
- [ ] 이번에 들어간 기능의 화면/라우트를 직접 눌러 확인함
- [ ] 기존 주요 화면(메인, 로그인 등)이 깨지지 않음
- [ ] `python -m pytest` 통과, PR의 GitHub Actions(tests)도 통과
- [ ] .env, DB 파일, 업로드 파일 등 올리면 안 되는 파일이 포함되지 않음
```

### 4.5 긴급 수정 (hotfix)

`main`에서 앱이 실행되지 않는 등 급한 문제가 생겼을 때만 사용합니다.

1. `main`에서 `hotfix/이니셜-버그명` 브랜치를 만들어 수정합니다.
2. **base: `main`** 으로 PR → PM 1명 승인(작성자가 PM이면 다른 PM) → 병합
3. 병합 직후 **`main` → `pre_main` PR**을 만들어 같은 수정을 `pre_main`에도 반영합니다. (빼먹으면 다음 병합 때 문제가 다시 생깁니다)
   - 이 PR은 **Create a merge commit**으로 병합합니다. (§4.6)
4. hotfix 브랜치는 개인 브랜치가 아니므로, 두 PR이 모두 병합되면 GitHub에서 **Delete branch**로 지웁니다.

### 4.6 모든 병합은 Merge commit으로 하는 이유

| 경로 | 방식 |
|---|---|
| 개인 브랜치 → `pre_main` | **Create a merge commit** |
| `pre_main` → `main` | **Create a merge commit** |
| `hotfix` → `main`, `main` → `pre_main` (hotfix 역반영) | **Create a merge commit** |

- **Squash**는 내 커밋들을 하나로 **새로** 만들어 넣습니다. 그러면 계속 쓰는 개인 브랜치(또는 `pre_main`)에 남은 원래 커밋과 기록이 서로 달라져, 다음 PR에 **이미 병합된 내용이 다시 나타나거나 충돌**이 납니다.
- 그래서 GitHub 설정에서 Squash와 Rebase 병합을 꺼 두고 Merge commit만 허용합니다. (§10)
- 대신 `pre_main`에 작은 커밋이 모두 남으므로, 커밋 메시지 규칙(§7.1)을 꼭 지킵니다.

### 4.7 충돌 해결

- 충돌은 **PR을 올린 사람**이 자기 브랜치에서 해결합니다.
- 충돌 부분이 다른 사람의 코드라면, 지우거나 덮어쓰지 말고 **작성자와 상의**해서 해결합니다.
- 해결 후 앱이 실행되는지 다시 확인하고 push합니다.

---

## 5. 폴더 구조와 담당 범위

### 5.1 폴더 구조

대시보드 코드는 `reboot-dashboard/` 폴더에 있습니다. 화면 메뉴(파트)마다 **화면 폴더 · 서버 폴더 · 설명서 폴더**가 하나씩 있고, 각자 자기 파트 폴더 안에서 작업합니다.
자세한 개발 규칙은 [`reboot-dashboard/docs/DEV_GUIDE.md`](reboot-dashboard/docs/DEV_GUIDE.md)를 따릅니다.

```text
저장소 맨 위/
├── README.md / RULE.md / AI_RULES.md        # 프로젝트 소개 · 협업 규칙 · AI 사용 규칙 (공통)
├── AGENTS.md / CLAUDE.md / GEMINI.md        # AI 도구가 자동으로 읽는 규칙 요약 (공통, AI_RULES.md §6)
├── .gitignore / .gitattributes / .geminiignore / .claude/settings.json
├── .github/                                 # CODEOWNERS · workflows(tests.yml 자동 테스트, daily-jobs.yml 하루 1회 수집)
├── render.yaml                              # Render 배포 설정 (rootDir: reboot-dashboard)
├── docs/원본/                               # 팀·파트 README 원본 (보관용)
└── reboot-dashboard/                        # ★ 대시보드 코드
    ├── server/                              # Flask 서버
    │   ├── __init__.py · config.py · registry.py · …   # 공통 (create_app, 메뉴 목록 등)
    │   ├── core/ · auth/ · catalog/ · templates/       # 공통 (셸 · 로그인 · 시즌/팩트시트 · 화면 틀)
    │   └── <파트ID>/                        # 파트 서버 (routes.py · models.py …) ← 파트 담당
    ├── core/                                # 공통 화면: base.css(디자인) · core.js(REBOOT) · assets · vendor
    ├── parts/<파트ID>/                      # 파트 화면 (JS · CSS · data.js) ← 파트 담당
    ├── data/                                # 초기 데이터 (공용 + data/<파트ID>/)
    ├── docs/<파트ID>/                       # 파트 설명서 README.md · 작업 메모 NOTES.md ← 파트 담당
    ├── docs/DEV_GUIDE.md · docs/team/        # 개발 규칙 · 팀 README
    ├── tests/                               # test_<파트ID>.py ← 파트 담당 · *.test.js
    ├── CLAUDE.md                            # 코드 작업 규칙 (Claude Code가 이 폴더에서 자동으로 읽음)
    ├── requirements.txt · requirements-dev.txt · .env.example · wsgi.py · gunicorn.conf.py
    └── instance/                            # 로컬 DB · 업로드 · 캐시 (Git에 올리지 않음)
```

### 5.2 공통 영역

다음 파일·폴더는 여러 사람에게 영향을 주므로 **팀장 또는 PM과 협의 후** 수정하고, PR에 공통 영역 수정임을 표시합니다. 필요한 변경은 직접 고치지 말고 GitHub Issue에 `[공통 요청]`으로 올려도 됩니다.

- `reboot-dashboard/core/` 전체 (디자인 `base.css`, 공통 기능 `core.js`)
- `reboot-dashboard/server/` 바로 아래 파일 (`__init__.py`, `config.py`, `registry.py`, `models.py` 등), `server/core/`·`server/auth/`·`server/catalog/`·`server/templates/`
- `reboot-dashboard/requirements.txt`, `requirements-dev.txt`, `.env.example`, `data/`의 공용 파일(`seasons.csv`, `products.json`)
- 저장소 맨 위 `render.yaml`, `.github/`, `.gitignore`, `.gitattributes`
- 규칙 문서: 맨 위 `README.md`, `RULE.md`, `AI_RULES.md`, `reboot-dashboard/README.md`, `reboot-dashboard/CLAUDE.md`, `docs/DEV_GUIDE.md`, `docs/team/README.md`
- AI 도구 설정: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.geminiignore`, `.claude/settings.json` (그 밖의 도구 규칙 파일은 `AI_RULES.md` §13)

### 5.3 파트 분담표

화면 메뉴 하나가 파트 하나입니다. 분담이 바뀌면 **팀장(JH)** 이 이 표, `README.md` §6·§11, `reboot-dashboard/docs/team/README.md` §4, `docs/DEV_GUIDE.md` §1을 같은 PR로 고칩니다. (화면에 보이는 담당 이름은 `server/registry.py`에 있어 공통 영역 PR로 고칩니다.)

| 메뉴 (화면 순서) | 파트 ID | 담당자 | 수정하는 폴더 |
|---|---|---|---|
| 🏠 홈 · 데일리 브리핑 | `home` | HK (현경) | `parts/home/` · `server/home/` · `docs/home/` · `data/home/` · `tests/test_home.py` |
| 🔍 시장 · 고객 인사이트 | `insights` | HK (현경) | `parts/insights/` · `server/insights/` · `docs/insights/` · `data/insights/` · `tests/test_insights.py` |
| ✍️ 콘텐츠 제작 | `content` | NW (나원) | `parts/content/` · `server/content/` · `docs/content/` · `tests/test_content.py` |
| 🛡️ 컴플라이언스 | `compliance` | JH (준희) | `parts/compliance/` · `server/compliance/` · `docs/compliance/` |
| 💬 고객 응대 (CS) | `cs` | JH (준희) | `parts/cs/` · `server/cs/` · `tests/test_compliance_cs_api.py` |
| 🤝 인플루언서 · 파트너 | `partners` | HJ (혁주) | `parts/partners/` · `server/partners/` · `docs/partners/` · `data/partners/` · `tests/test_partners.py` |
| 📊 성과분석 | `performance` | HJ (혁주) | `parts/performance/` · `server/performance/` · `docs/performance/` · `data/performance/` · `tests/test_performance.py` |
| 🔐 로그인 (메뉴 아님) | `auth` | HK (현경) | `docs/login/` · `tests/test_auth.py` (로그인 서버 `server/auth/`는 공통 영역) |
| ⚙️ 설정 및 브랜드 관리 | `settings` | HK (현경) | `parts/settings/` · `server/settings/` · `docs/settings/` · `tests/test_settings.py` |

- 폴더 경로는 모두 `reboot-dashboard/` 기준입니다.
- KHS(강현서), YHS(양효선)는 개발 파트 없이 다른 업무를 맡습니다. KHS는 PM으로서 PR 리뷰·병합 역할(§1)은 그대로 합니다.
- 두 파트를 맡은 사람도 브랜치는 개인 브랜치 하나만 쓰고, PR 하나에는 한 파트의 작업만 담습니다. (§3.3)
- 다른 파트의 기능이 필요하면 그 폴더의 파일을 직접 고치지 말고, 화면은 `REBOOT.use('<파트ID>')`, 서버는 공용 API(`/api/seasons`, `/api/facts` …)로만 가져다 씁니다. (`DEV_GUIDE.md` §3)
- 파트 사이에 주고받는 데이터(함수 이름, 요청/응답 형식)가 바뀌면 영향을 받는 담당자에게 먼저 알립니다.

### 5.4 파트 설명서 (파트 README)

각 파트의 설명서는 `reboot-dashboard/docs/<파트ID>/README.md`, 작업 메모는 같은 폴더의 `NOTES.md`입니다. 공통 영역이 아니므로 그 파트 담당자가 직접 수정합니다.

- 적을 내용: 담당자, 기능(화면), 쓰는 API, 주요 파일, 다른 파트에 공개하는 기능(`REBOOT.expose`), 사용하는 데이터·외부 API
- 파트의 기능·API·공개 기능이 바뀌면 **같은 PR에서 설명서도 고칩니다.**
- 다른 파트 기능이 필요하면 먼저 그 파트 설명서와 `DEV_GUIDE.md` §3의 공개 기능 표를 확인합니다.

---

## 6. 네이밍 컨벤션

### 6.1 Python
- 변수·함수: `snake_case` (예: `user_name`, `get_user_data()`)
- 클래스: `PascalCase` (예: `UserService`)
- 상수: `UPPER_SNAKE_CASE` (예: `MAX_RETRY_COUNT`), 하드코딩 대신 파트 서버 폴더 안 한 곳에 모음 (공통 설정은 `server/config.py`)
- 불리언: `is_`, `has_`, `should_` 접두어 (예: `is_valid`)
- 약어 지양: `usr` ❌ → `user` ✅
- 파일명: `snake_case.py`

### 6.2 화면(JS · CSS) · 서버 이름 규칙

화면과 서버의 이름 규칙은 [`reboot-dashboard/docs/DEV_GUIDE.md`](reboot-dashboard/docs/DEV_GUIDE.md) 「이름 규칙」과 `docs/team/README.md` 6-2장을 따릅니다. 핵심만 적으면:

- JS: 변수·함수 `camelCase`, 전역 변수 금지(`REBOOT`만 공통), 즉시실행 함수로 감싸기, `type="module"`·`import`·npm 금지
- CSS: `.part-<파트ID> .<접두사>-…` 로만 (접두사 예: 홈 `home-`, 인사이트 `ins-`, 콘텐츠 `cnt-`, 컴플라이언스 `cmp-`, CS `cs-`, 파트너 `ptn-`, 성과 `perf-`, 설정 `set-`). `core/base.css` 클래스는 다시 정의하지 않고 가져다 씀
- 저장: `REBOOT.store('<파트ID>')`만 사용 · 다운로드 파일명 `reboot-<파트ID>-내용.확장자`
- 서버 API: `/api/<파트ID>/…` (예: `/api/cs/gmail/callback`), 공용 API는 `/api/seasons`·`/api/facts`·`/api/worklog`
- 키·비밀번호는 JS·HTML에 넣지 않고 서버(`.env` · 설정 › 연결 화면)에서만

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

- 브랜치 이름은 이니셜뿐이므로, **기능 추가인지 버그 수정인지는 커밋 타입으로만 구분됩니다.** 타입을 빠뜨리지 않습니다.
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
git clone https://github.com/hungungworld/reboot-us-dashboard.git
cd reboot-us-dashboard\reboot-dashboard
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
python -m server
```

- 브라우저에서 http://127.0.0.1:5000 접속. 처음 실행할 때 계정이 없으면 `.env`의 `ADMIN_EMAIL`·`ADMIN_PASSWORD`(8자 이상)로 관리자 계정이 만들어집니다. 팀원 계정은 **설정 › 계정**에서 추가합니다.
- 테스트: `python -m pytest` (인터넷·키 없이 통과해야 함) · JS 문법: `node --check parts\<파트ID>\<파일>.js`
- `.env`에는 각자 받은 실제 값을 채웁니다. **`.env`는 절대 커밋하지 않습니다.**
- Python 버전은 `reboot-dashboard/.python-version`(3.14)에 고정되어 있습니다. 모두 같은 버전을 씁니다.
- clone한 뒤 push 차단 훅(§10.1)을 설치합니다.

### 8.2 패키지 추가

- 새 패키지가 필요하면 PR에 이유를 적고 `reboot-dashboard/requirements.txt`에 버전과 함께 추가합니다. (예: `pandas==2.2.3`) 공통 영역이므로 팀장·PM과 먼저 협의합니다.
- `pip freeze > requirements.txt`로 파일 전체를 덮어쓰지 않습니다. 개인 환경의 불필요한 패키지까지 섞여 충돌이 생깁니다.
- npm · React · 빌드 도구는 도입하지 않습니다.

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

저장소 맨 위 `.gitignore` 내용입니다. `reboot-dashboard/.gitignore`가 대시보드 폴더 규칙(`instance/`, `dev/`, `_incoming/` 등)을 더합니다.

```gitignore
# 저장소 전체 공통 — 대시보드 폴더 규칙은 reboot-dashboard/.gitignore (RULE.md §8.4)

# 비밀 정보 — 어느 폴더에 있어도 올리지 않음
.env
.env.*
!.env.example
credentials.json
token.json
client_secret*.json

# 실행 데이터 (DB · 업로드)
instance/
*.db
*.sqlite3
uploads/

# 파이썬 · 도구 · 캐시
__pycache__/
*.pyc
venv/
.venv/
.playwright-mcp/

# 편집기 · AI 개인 설정
.vscode/*
!.vscode/settings.json
.idea/
.claude/settings.local.json

# OS
.DS_Store
Thumbs.db
```

---

## 9. 코드 스타일

- 들여쓰기: Python 4칸, HTML/CSS/JS 2칸 (파일에 이미 있는 방식을 따름)
- **저장할 때 포매터로 파일 전체를 자동 정렬하지 않습니다.** (`black .`, 편집기의 "저장 시 서식 지정" 등) 바뀐 줄이 많아져 다른 사람과 충돌이 납니다. 내가 고친 줄만 손으로 정리합니다.
- 주석은 "무엇을"보다 "왜"를 적습니다.
- 사실·숫자·FDA 문구는 지어내지 않습니다. 모르면 `null` · `{확인 필요}` · 빈 상태로 두고, 더미 데이터는 화면에 `예시`·`더미` 배지를 붙입니다.

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
| 허용 병합 방식 | Merge commit | Merge commit |

**`.github/CODEOWNERS`** — `main`으로 가는 PR은 PM이 승인해야 하도록 지정합니다. (HK: `hungungworld`, KHS: `hyxxns0131`)

```text
* @hungungworld @hyxxns0131
```

- GitHub는 PR 작성자가 자기 PR을 승인하는 것을 허용하지 않으므로, "PR을 연 PM은 승인 불가" 규칙은 자동으로 지켜집니다.
- **Settings → General → Pull Requests**에서 *Allow merge commits*만 켜고 *Allow squash merging*, *Allow rebase merging*은 끕니다. (§4.6)
- 같은 화면의 *Automatically delete head branches*는 **끕니다.** 켜 두면 PR이 병합될 때마다 개인 브랜치가 지워집니다. (§3.3)
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
- 새 환경변수가 필요하면 `reboot-dashboard/.env.example`에 **이름만** 추가하고(값은 비움), PR에 적습니다. 키는 `.env` · Render Environment · 대시보드 **설정 › 연결** 화면에만 넣습니다.
- 실수로 비밀 정보를 push했다면 즉시 팀장·PM에게 알리고 해당 키를 **폐기 후 재발급**합니다. (커밋을 지워도 기록에 남기 때문)
- 테스트에는 실제 사용자 데이터가 아닌 가짜(합성) 데이터를 사용합니다.

---

## 12. 규칙 변경

- 이 문서는 `docs:` PR로만 수정하며, 팀장과 PM 1명 이상의 승인이 필요합니다.
- 규칙이 실제 작업과 맞지 않으면 언제든 이슈로 제안합니다.
