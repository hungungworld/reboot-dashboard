/* 시장 · 고객 인사이트 (담당: 이현경) — tabs/insights/docs/README.md '3번째 대시보드'.
   왼쪽 메뉴 (2026-10-26 묶음): TO DO = 주간 · 월간 / 데이터 = 시장 · 고객 · 데이터 관리 (2026-10-25 진열대 + 경쟁사를 '시장'으로 합침)
   - 시장: 변화 · 가격 위치 · 브랜드 비교 / 고객: 구매자 리뷰 · 유튜브 댓글
   - 데이터 관리: 마지막 업데이트 · 진열대 수집 · 고치기 · AI 정확도 검증 (예전엔 머리글 버튼으로만 열렸음)
   - 보관한 기사는 2026-10-26 홈 › 미국 시장 브리핑 보관함 창으로 옮김 (옛 주소는 홈으로 넘김)
   - 검색 수요 탭은 2026-10-25 삭제 → '다음 급등 예상'은 홈 › 콘텐츠 캘린더 맨 아래로 옮김
   - 판단은 규칙(서버 rules.py), AI는 문장 · 분류 · 요약만 (AI 배지 · 참고용)
   - 데이터 업데이트는 서버가 뒤에서 실행 → 이 화면은 진행 상황만 봄
   - 다른 파트에는 REBOOT.use('insights')로 searchTrend · personas · weeklySignals · contentBrief · reviewPriorities 공개 (Promise · 없으면 빈 값)
   - 콘텐츠 브리프(월간 리뷰 맨 아래 카드 · 서버 brief.py): 사람이 승인한 것만 contentBrief()로 콘텐츠 탭에 넘김
   주소: #weekly · #market/brands · #customers/reviews 처럼 바로 열 수 있음 (옛 #data/… 주소는 새 주소로 넘김) */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  if (!REBOOT) throw new Error('insights: REBOOT core를 먼저 불러와야 합니다');
  const ui = REBOOT.ui;
  const { esc, badge, icon, fmt, toast } = ui;
  const api = REBOOT.api;
  const store = REBOOT.store('insights');   // 저장 키: reboot:insights:summary (메뉴 숫자용)

  // [id, 이름, 왼쪽 메뉴 묶음, 흐린 글씨] — 묶음 이름표는 core.js가 data-group으로 그림
  const TABS = [['weekly', '주간', 'TO DO'], ['monthly', '월간', 'TO DO'],
    ['market', '시장', '데이터'], ['customers', '고객', '데이터'], ['manage', '데이터 관리', '데이터', true]];
  // 화면 안 탭
  const SUBS = {
    market: [['changes', '변화'], ['price', '가격 위치'], ['brands', '브랜드 비교']],
    customers: [['reviews', '구매자 리뷰'], ['audience', '유튜브 댓글']],
    manage: [['edit', '진열대 수집 · 고치기'], ['accuracy', 'AI 정확도 검증']]
  };
  // 화면 안 탭 → 읽어야 할 데이터 (/api/insights/data/<이름>)
  const NEEDS = { changes: ['shelf', 'competitors'], price: ['shelf', 'competitors'], brands: ['shelf', 'competitors'], edit: ['shelf'],
    reviews: ['reviews'], audience: ['audience'], accuracy: ['accuracy'] };
  // 옛 주소 → 새 주소 (홈 할 일 · 즐겨찾기 링크가 깨지지 않게). 보관한 기사는 홈으로 (NEWS_HASH)
  const OLD_HASH = { data: 'market/changes', 'data/shelf': 'market/price', 'data/competitors': 'market/brands', 'data/reviews': 'customers/reviews',
    'data/audience': 'customers/audience', 'data/accuracy': 'manage/accuracy' };
  const NEWS_HASH = ['data/news', 'saved', 'saved/news'];
  const GRADE_TONE = { '긴급': 'red', '기회': 'green', '참고': 'blue' };
  const GRADE_CLASS = { '긴급': 'urgent', '기회': 'chance', '참고': 'info' };
  const BUCKETS = [['low', '$3 미만'], ['mid', '$3~6'], ['high', '$6 이상']];
  const SRC_LABEL = { amazon: 'Amazon', weee: 'Weee!', yami: 'Yami' };
  const ITEM_LABEL = { weee: 'Weee! 진열대 · 리뷰', amazon: 'Amazon 진열대 · 리뷰', yami: 'Yami 진열대', channel_reviews: '판매처 리뷰 (Olive Young · Amazon · Yami)', trends: '검색 트렌드', reviews: '리뷰 분류', actions: '이번 주 액션',
    youtube: '유튜브 댓글', voc: 'VOC 분류', competitors: '경쟁 브랜드 분석', monthly: '요약 · 전략' };
  const KEY_LABEL = { SERPAPI_KEY: 'SerpApi', FIRECRAWL_API_KEY: 'Firecrawl', YOUTUBE_API_KEY: 'YouTube', OPENAI_API_KEY: 'OpenAI' };
  const USE_LABEL = { serpapi: 'SerpApi', firecrawl: 'Firecrawl', youtube: 'YouTube', openai: 'OpenAI' };
  const USE_UNIT = { serpapi: '회', firecrawl: ' 크레딧', youtube: ' units', openai: '회' };
  const SERVING_SRC = { manual: '직접 수정', parsed: '문구에서 읽음', default: '확인 필요 (1회분으로 계산)' };
  const RV_F_EMPTY = { source: '', brand: '', line: '', topic: '', s: '', cs: '' };
  const RV_VIEWS = [['list', '리뷰 목록'], ['compare', '브랜드 × 주제']];
  const RV_SORTS = [['todo', '대응 필요부터'], ['new', '최신순'], ['low', '별점 낮은 순'], ['high', '별점 높은 순']];
  const RV_PAGE = 5;   // 리뷰 표 한 페이지 (진열대 · 경쟁사와 같게)
  const MK_F_EMPTY = { q: '', ch: '', form: '', stock: '', tier: '', price: '', watch: false, ai: false };   // 브랜드 비교 필터

  const $ = (el, sel) => (el ? el.querySelector(sel) : null);
  const $$ = (el, sel) => (el ? Array.from(el.querySelectorAll(sel)) : []);
  const copy = v => JSON.parse(JSON.stringify(v == null ? null : v));

  /* ───────── 다른 파트 공개 (홈 · 콘텐츠) ───────── */
  let trendP = null;
  let personaP = null;
  function searchTrend() {
    if (!trendP) trendP = api('/api/insights/trends').catch(() => null);
    return trendP.then(v => (v && Array.isArray(v.keywords) ? copy(v) : { keywords: [], updatedAt: null }));
  }
  function personas() {
    if (!personaP) personaP = api('/api/insights/personas').catch(() => null);
    return personaP.then(v => (Array.isArray(v) ? copy(v) : []));
  }
  // 이번 주 액션 중 긴급 · 기회만 (홈 이번 주 할 일 맨 위) — 읽기 전용, 근거 화면 주소 포함 · 화면과 같은 한 줄(actionRows) 기준
  let weeklyP = null;
  function weeklySignals() {
    if (!weeklyP) weeklyP = api('/api/insights/weekly').catch(() => { weeklyP = null; return null; });
    return weeklyP.then(w => (w && Array.isArray(w.actions) ? {
      week: w.week,
      items: actionRows(w.actions).filter(r => r.grade !== '참고').map(r => {
        const src = ACTION_SRC[r.rule];
        return { id: r.key, grade: r.grade, title: r.title, todo: r.steps.join(' → '),
          href: `/dashboard/insights${src ? src[0] : '#weekly'}`, src: src ? src[1] : '주간' };
      })
    } : null));
  }
  // 콘텐츠 브리프 승인본 (콘텐츠 탭 제작 프롬프트용) — 승인 전 · 오류면 null. 승인하면 바로 바뀌므로 저장해 두지 않음
  function contentBrief() {
    return api('/api/insights/brief').then(v => (v && Array.isArray(v.themes) ? copy(v) : null)).catch(() => null);
  }
  // 자사 불만 주제 순위 (규칙 계산 · CS 답변 템플릿 참고용) — 오류면 null
  let prioP = null;
  function reviewPriorities() {
    if (!prioP) prioP = api('/api/insights/priorities').catch(() => { prioP = null; return null; });
    return prioP.then(v => (v && Array.isArray(v.items) ? copy(v) : null));
  }
  REBOOT.expose('insights', { searchTrend, personas, weeklySignals, contentBrief, reviewPriorities });

  /* ───────── 상태 ───────── */
  const S = {
    root: null, tab: 'weekly', subs: { market: 'changes', customers: 'reviews', manage: 'edit' }, weekly: null, monthly: null, month: null, data: {}, open: {},
    poll: null, wasRunning: false, showResult: false, run: null, runFold: store.get('runFold', false), loading: {}, tbl: { q: '', page: 1, f: '' }, chg: 'all',
    rv: { view: store.get('rvView', 'list'), scope: 'own', q: '', f: Object.assign({}, RV_F_EMPTY), todo: false, shared: false, sort: 'todo', dir: 1, page: 1 }, pf: 'all',
    sum: { q: '', dir: 1, page: 1 },   // 아마존 리뷰 요약 표 (제품 이름순)
    rvm: { sort: '', dir: 1 },         // 브랜드 × 주제 표 ('' = 서버 순서: 주시 중 → 리뷰 많은 순)
    mk: Object.assign({ sort: 'signal', dir: 1, page: 1, more: false, open: {}, items: {}, focus: '', cache: null }, MK_F_EMPTY)
  };
  const panel = id => $(S.root, `[data-panel="${id}"]`);
  const curSub = () => (SUBS[S.tab] ? S.subs[S.tab] : '');
  const curBody = () => $(panel(S.tab), '[data-ref="data-body"]');
  const skel = '<div class="skeleton ins-skel"></div>';

  function safeUrl(u) {
    const s = String(u || '');
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function extLink(u, label) {
    const s = safeUrl(u);
    return s ? `<a class="link" href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(label || '열기')} ${icon('up')}</a>` : '';
  }
  function money(v) { return v == null ? '—' : fmt.usd(v); }
  function stockBadge(v) { return v === false ? badge('품절', 'red') : v === true ? '' : badge('재고 정보 없음'); }
  // 마우스를 올리거나(키보드 · 터치는 포커스) 하면 뜨는 설명 — 뜻은 화면 문구에 먼저 쓰고, 이건 보충만
  function infoTip(text, label) {
    return `<span class="ins-tip" tabindex="0" data-tip="${esc(text)}">${label == null ? '<i aria-hidden="true">?</i>' : label}</span>`;
  }
  // \n은 의미 단위 줄바꿈 — CSS pre-line으로 그대로 보임
  const TIP = {
    perServing: '한 번 먹을 때 드는 돈이에요.\n(판매가 ÷ 먹을 수 있는 횟수)\n용량이 달라도 똑같이 비교할 수 있어요.',
    median: '다른 회사 제품들의 1회분 가격 중\n딱 중간에 있는 가격이에요.\n절반은 이보다 싸고, 절반은 비싸요.',
    own: '진열대에서 찾은 알디콤 제품 중\n한 번 먹을 때 가장 싼 가격이에요.',
    bulk: '같은 제품을 큰 통으로 사면\n작은 통보다 한 번 먹는 값이 얼마나 싼지예요.\n알디콤과 비교한 값은 아니에요.',
    low: 'Amazon에 "몇 개 안 남음"이라고 뜬 제품이에요.\nWeee! · Yami는 남은 개수를 알려 주지 않아요.',
    unknown: '판매처가 재고를 알려 주지 않았어요.\n품절이라는 뜻은 아니에요.',
    change: '지난주와 비교해\n가격이 얼마나 바뀌었는지예요.'
  };
  // 재고 상태 하나로: 품절 · 곧 품절 · 재고 있음 · 정보 없음
  const STOCK = { oos: ['품절', 'red'], low: ['곧 품절', 'orange'], in: ['재고 있음', 'green'], unknown: ['재고 정보 없음', ''] };   // '재고 정보 없음'은 품절이 아님(모름)이라 그대로
  function stockState(x, limit) {
    if (x.in_stock === false) return 'oos';
    if (x.stockLeft != null && x.stockLeft <= limit) return 'low';
    return x.in_stock === true ? 'in' : 'unknown';
  }

  /* ───────── 줄바꿈: 문장 · 반점 단위 ─────────
     글 묶음(p · li · .note …) 속 글자를 문장 끝 · 반점 뒤에서 나눠 <span class="ins-ph">로 감쌈
     → 문장이 바뀌는 곳에서 먼저 줄이 바뀌고, 한 문장이 길면 그 안에서 줄 길이를 고르게 (insights.css)
     숫자(1,234 · 3.5)는 뒤에 띄어쓰기가 없어 안 나뉨. 표 · 버튼 · 배지 · 입력칸 · 툴팁 · 한 줄 칸은 건드리지 않음 */
  const PH_BLOCK = 'p, li, dd, small, figcaption, blockquote, .note, .panel-note, .hint';
  const PH_SKIP = 'table, button, .btn, label, .badge, .ins-tip, input, textarea, select, code, pre, svg, [contenteditable], .ins-ph';
  // 문장 끝: 한글 뒤 . ! ? · 소문자 · 닫는 괄호 뒤 . 만 (U.S. · I.V. 약어, 10. 25. 날짜, Weee! 이름은 안 나눔)
  // 반점: 연결 어미(…하고, …며, …지만, …는데) 뒤만 — 나열(맛, 패키지)은 안 나눔
  const PH_CUT = /(?<=[가-힣][.!?]|[a-z)\]'"”’]\.|(?:고|며|면|서|지만|는데|은데|니|도|게|요|다|해|어|아|죠),)(\s+)/;
  function phrase(el) {
    const blocks = el.matches(PH_BLOCK) ? [el] : [];
    blocks.push(...el.querySelectorAll(PH_BLOCK));
    blocks.forEach(b => {
      if (b.closest(PH_SKIP)) return;
      const cs = global.getComputedStyle(b);
      if (cs.whiteSpace === 'nowrap' || cs.textWrapMode === 'nowrap' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) return;
      const walk = doc.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      const texts = [];
      for (let t = walk.nextNode(); t; t = walk.nextNode()) {
        if (PH_CUT.test(t.nodeValue) && !t.parentElement.closest(PH_SKIP)) texts.push(t);
      }
      texts.forEach(t => {
        const frag = doc.createDocumentFragment();
        t.nodeValue.split(PH_CUT).forEach((s, i) => {
          if (i % 2 || !s.trim()) { frag.append(s); return; }
          const sp = doc.createElement('span');
          sp.className = 'ins-ph';
          sp.textContent = s;
          frag.append(sp);
        });
        t.replaceWith(frag);
      });
    });
  }
  // 화면은 innerHTML로 자주 다시 그려지므로, 새로 붙은 노드를 모아 한 번에 처리 (모달 .part-insights 포함)
  function phraseAll(nodes) {
    const todo = new Set();
    nodes.forEach(n => {
      const el = n.nodeType === 3 ? n.parentElement : n;
      if (el && el.nodeType === 1 && el.isConnected && el.closest('.part-insights')) todo.add(el.closest(PH_BLOCK) || el);
    });
    todo.forEach(phrase);
  }
  const doc = global.document;
  if (doc && global.MutationObserver) {
    const start = () => {
      new global.MutationObserver(ms => phraseAll(ms.flatMap(m => [...m.addedNodes]))).observe(doc.body, { childList: true, subtree: true });
      phraseAll([...doc.querySelectorAll('.part-insights')]);
    };
    if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
  }

  /* ───────── 화면 ───────── */
  function render(root) {
    S.root = root;
    root.classList.add('part-insights');
    root.innerHTML = `
      <div class="kpis" data-ref="kpis">${'<div class="kpi"><div class="skeleton ins-skel-sm"></div></div>'.repeat(4)}</div>
      <div class="ins-run" data-ref="run" hidden></div>
      <div class="tabs" role="tablist" aria-label="인사이트 보기">${TABS.map(([id, l, g, quiet]) =>
        `<button type="button" role="tab" data-tab="${id}" data-group="${esc(g)}"${quiet ? ' data-quiet' : ''} aria-selected="false">${esc(l)}</button>`).join('')}</div>
      ${TABS.map(([id]) => `<div class="ins-panel" data-panel="${id}" role="tabpanel" hidden></div>`).join('')}`;
    const actions = REBOOT.page.actions();
    if (actions) {
      actions.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'ins-update') openUpdate('weekly');
        if (b.dataset.act === 'ins-monthly-run') openUpdate('monthly');
      });
    }
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', e => {
      const ref = e.target.dataset && e.target.dataset.ref;
      if (ref === 'tbl-q') { S.tbl.q = e.target.value; S.tbl.page = 1; drawShelfTable(); }
      if (ref === 'mk-q') { S.mk.q = e.target.value; S.mk.page = 1; drawBrandTable(); }
      if (ref === 'rv-q') { S.rv.q = e.target.value; S.rv.page = 1; drawRvTable(); }
      if (ref === 'sum-q') { S.sum.q = e.target.value; S.sum.page = 1; drawSumTable(); }
    });
    root.addEventListener('dragstart', dockStart);
    root.addEventListener('mouseover', swarmTip);
    root.addEventListener('mousedown', colResize);
    root.addEventListener('mouseout', e => {
      const box = e.target.closest && e.target.closest('.ins-sw-wrap');
      if (box && !box.contains(e.relatedTarget)) $(box, '.ins-sw-tip').hidden = true;
    });
    // 차트를 옆으로 밀면 말풍선 위치가 어긋나므로 닫음
    root.addEventListener('scroll', e => {
      const box = e.target.closest && e.target.closest('.ins-sw-wrap');
      if (box) $(box, '.ins-sw-tip').hidden = true;
    }, true);
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-act]')) e.target.click(); });
    root.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.fold) S.open[d.dataset.fold] = d.open; }, true);
    global.addEventListener('hashchange', route);
    global.addEventListener('resize', fitSwarm);
    global.addEventListener('resize', () => { if (pfRender) pfRender(); });
    route();
    loadWeekly();
    checkRun(true);
  }

  function parseHash() {
    let h = String(global.location ? global.location.hash : '').replace(/^#/, '');
    if (NEWS_HASH.includes(h)) { global.location.replace('/dashboard#briefing'); return { tab: '', sub: '' }; }
    if (OLD_HASH[h]) { h = OLD_HASH[h]; setHash(h); }
    const [tab, sub] = h.split('/');
    const ok = TABS.some(t => t[0] === tab);
    return { tab: ok ? tab : '', sub: ok && SUBS[tab] && SUBS[tab].some(x => x[0] === sub) ? sub : '' };
  }

  // 주소(#…)로 화면을 옮기면 항상 맨 위부터 보여 줌 (이전 화면의 스크롤 위치가 남지 않게)
  function route() {
    const h = parseHash();
    show(h.tab || S.tab || 'weekly', h.sub);
    toTop();
  }

  function toTop() {
    if (!S.mk.focus && !S.focusChg) global.scrollTo(0, 0);
  }

  function setHash(h) {
    try { global.history.replaceState(null, '', '#' + h); } catch (e) { /* 무시 */ }
  }

  function show(tab, sub) {
    S.tab = tab;
    $$(S.root, '[data-tab]').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $$(S.root, '[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
    if (tab === 'market') fitSwarm();   // 숨어 있을 때 그린 차트는 폭을 못 재서
    const kpis = $(S.root, '[data-ref="kpis"]');
    if (kpis) kpis.hidden = tab !== 'weekly';   // 주간 카드는 주간 리뷰에서만 (월간은 자체 카드)
    drawActions();
    paintTitle();
    if (tab === 'weekly') { drawWeekly(); setHash('weekly'); }
    if (tab === 'monthly') { if (S.monthly) drawMonthly(); else loadMonthly(S.month); setHash('monthly'); }
    if (SUBS[tab]) showSub(sub || S.subs[tab]);
  }

  // 화면마다 제목 (주간은 이번 주 긴급 · 기회 수)
  function paintTitle() {
    const page = REBOOT.page;
    const w = S.weekly;
    const n = g => rowCount(actionRows(w.actions), g);
    if (S.tab === 'weekly') {
      page.title(!w ? '이번 주 시장 신호' : w.actions.length ? `이번 주 긴급 ${n('긴급')} · 기회 ${n('기회')}` : '이번 주는 특이사항이 없어요');
      page.subtitle(w ? `${w.week} · ${w.weekLabel} · 진열대 · 고객 반응 · 검색 수요에서 고른 할 일` : '진열대 · 고객 반응 · 검색 수요를 모아 할 일을 정리해요.');
    } else if (S.tab === 'monthly') {
      page.title('지난 한 달, 무엇이 달라졌나');
      page.subtitle('요약 · 고객 인사이트 · 경쟁 브랜드 동향 · 전략을 한 달 단위로 봐요.');
    } else if (S.tab === 'market') {
      page.title('시장 — 경쟁 제품과 가격');
      page.subtitle('Amazon · Weee! · Yami 진열대와 경쟁 브랜드를 한곳에서 봐요.');
    } else if (S.tab === 'customers') {
      page.title('고객 — 리뷰와 사기 전 질문');
      page.subtitle('구매자 리뷰의 칭찬 · 불만과 유튜브 댓글의 질문을 봐요.');
    } else if (S.tab === 'manage') {
      page.title('데이터 관리');
      page.subtitle('수집한 진열대를 고치고, AI 분류가 맞는지 확인해요. 매주 볼 화면은 아니에요.');
    }
  }

  function drawActions() {
    const box = REBOOT.page.actions();
    if (!box) return;
    const dl = (href, label, type) => ui.fileBtn('download', { label, type, href });
    const month = S.monthly ? S.monthly.month : '';
    const extra = S.tab === 'weekly' ? dl('/api/insights/report/weekly.docx', '주간 리포트 다운로드', 'Word')
      : S.tab === 'monthly' ? `<button type="button" class="btn" data-act="ins-monthly-run">${icon('spark')}월간 분석 실행</button>` +
        dl('/api/insights/report/monthly.docx' + (month ? `?month=${encodeURIComponent(month)}` : ''), '월간 리포트 다운로드', 'Word') +
        dl('/api/insights/export.xlsx', '모은 데이터 다운로드', 'XLSX')
        : dl('/api/insights/export.xlsx', '모은 데이터 다운로드', 'XLSX');
    box.innerHTML = `${extra}<button type="button" class="btn lime" data-act="ins-update">${icon('refresh')}최신 데이터 받기</button>`;
  }

  /* ───────── 이벤트 ───────── */
  function onClick(e) {
    // '필터 +' 창 밖을 누르면 닫음 (창 안 · 버튼 자신은 그대로)
    if (S.mk.more && !e.target.closest('.ins-cf-pop, [data-act="mk-more"]')) {
      S.mk.more = false;
      const pop = $(S.root, '.ins-cf-pop'), btn = $(S.root, '[data-act="mk-more"]');
      if (pop) pop.remove();
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && S.root.contains(tabBtn)) { show(tabBtn.dataset.tab); toTop(); return; }
    const subBtn = e.target.closest('[data-sub]');
    if (subBtn && S.root.contains(subBtn)) { showSub(subBtn.dataset.sub); return; }
    const b = e.target.closest('[data-act]');
    if (!b || !S.root.contains(b) || b.disabled) return;
    const d = b.dataset;
    switch (d.act) {
      case 'ins-update': openUpdate('weekly'); break;
      case 'ins-goto-actions': {
        e.preventDefault();
        if (S.tab !== 'weekly') show('weekly');
        const t = $(S.root, '[data-ref="actions"]');
        if (t) t.scrollIntoView({ block: 'start' });
        break;
      }
      case 'ins-monthly-run': openUpdate('monthly'); break;
      case 'act-row': S.actOpen = S.actOpen === d.key || (S.actOpen === undefined && b.getAttribute('aria-expanded') === 'true') ? null : d.key; drawWeekly(); break;
      case 'act-f': S.actF = d.f; drawWeekly(); break;
      case 'ins-goto-line':
        // 재고 주의 제품 → 시장 › 브랜드 비교에서 그 브랜드를 펼쳐서 (묶음 id = '브랜드|제형')
        e.preventDefault();
        openBrand(String(d.line).split('|')[0]);
        break;
      case 'ins-goto-chg':
        // 이번 주 변화 요약 › 경쟁사 변화 → 시장 › 변화
        e.preventDefault();
        S.chg = 'all';
        S.focusChg = true;
        show('market', 'changes');
        break;
      case 'persona-flip': {
        const on = b.getAttribute('aria-pressed') !== 'true';
        S.open['persona-' + d.i] = on;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('flipped', on);
        break;
      }
      case 'ins-update-only': openUpdate('weekly', (d.items || '').split(',')); break;
      case 'run-close': S.showResult = false; drawRun(S.run); break;
      case 'run-fold': S.runFold = !S.runFold; store.set('runFold', S.runFold); drawRun(S.run, S.wasRunning); break;
      case 'prod': openProduct(findShelf(d.id)); break;
      case 'tbl-page': S.tbl.page = Number(d.p) || 1; drawShelfTable(); break;
      case 'tbl-todo': S.tbl.f = S.tbl.f === d.f ? '' : d.f; S.tbl.page = 1; drawSub('edit'); break;
      case 'pf-tier': S.pf = d.k; drawSub('price'); break;
      case 'sw-zoom': if (S.swarm) zoomSwarm(d.z === 'fit' ? 1 : d.z === 'in' ? S.swarm.zoom * 1.5 : S.swarm.zoom / 1.5); break;
      case 'brand-go': openBrand(d.brand); break;
      case 'mk-toggle': S.mk.open[d.brand] = !S.mk.open[d.brand]; drawBrandTable(); break;
      case 'mk-items': S.mk.items[d.k] = !S.mk.items[d.k]; drawBrandTable(); break;
      case 'mk-page': S.mk.page = Number(d.p) || 1; drawBrandTable(); break;
      case 'mk-sort': S.mk.dir = S.mk.sort === d.k ? -S.mk.dir : MK_COL_SORTS[d.k][1]; S.mk.sort = d.k; S.mk.page = 1; drawBrandTable(); break;
      case 'mk-more': S.mk.more = !S.mk.more; drawBrandTable(); break;
      case 'mk-ftog': S.mk[d.k] = !S.mk[d.k]; S.mk.page = 1; drawBrandTable(); break;
      case 'mk-fclear': Object.assign(S.mk, MK_F_EMPTY, { page: 1 }); drawBrandTable(); break;
      case 'mk-fix': S.tbl.q = d.q || ''; S.tbl.f = ''; S.tbl.page = 1; show('manage', 'edit'); toTop(); break;
      case 'watch': toggleWatch(b, d.brand, d.on === '1'); break;
      case 'comp-discover': compAction(b, 'discover'); break;
      case 'comp-research-all': compAction(b, 'all'); break;
      case 'comp-research': compAction(b, 'one', d.id); break;
      case 'comp-status': compAction(b, 'status', d.id, d.status); break;
      case 'comp-detail': if (!e.target.closest('a')) openCompDetail(findComp(d.id)); break;
      case 'chg-group': S.chg = S.chg === d.g ? 'all' : d.g; drawSub('changes'); break;
      case 'chg-more': S.open['chg-' + d.g] = !S.open['chg-' + d.g]; drawSub('changes'); break;
      case 'rv': jumpToReviews(d.brand, d.own === '1', d.topic, d.s); break;
      case 'rv-view': S.rv.view = d.v; store.set('rvView', d.v); drawSub('reviews'); break;
      case 'rv-scope': rvScope(d.v); break;
      case 'rh-brand': S.rv.cmpOpen = S.rv.cmpOpen === d.b ? '' : d.b; drawSub('reviews'); break;
      case 'rh-cmp': S.rv.cmp = d.b; rvScope('own'); break;
      case 'rh-topic': S.rv.f.topic = S.rv.f.topic === d.t ? '' : d.t; S.rv.view = 'list'; S.rv.page = 1; drawSub('reviews'); break;
      case 'rv-sort': { const [hk, hd] = rvHeadSort(); S.rv.dir = hk === d.k ? -hd : RV_COL_SORTS[d.k][1]; S.rv.sort = d.k; S.rv.page = 1; drawRvTable(); break; }
      case 'rv-todo': S.rv.todo = !S.rv.todo; S.rv.page = 1; drawRvTable(); break;
      case 'rv-shared': S.rv.shared = !S.rv.shared; S.rv.page = 1; drawRvTable(); break;
      case 'rv-fclear': S.rv.f = Object.assign({}, RV_F_EMPTY); S.rv.todo = false; S.rv.shared = false; S.rv.page = 1; drawRvTable(); break;
      case 'rv-page': S.rv.page = Number(d.p) || 1; drawRvTable(); break;
      case 'rv-open': openReview(d.id); break;
      case 'sum-sort': S.sum.dir = -S.sum.dir; S.sum.page = 1; drawSumTable(); break;
      case 'rvm-sort': S.rvm.dir = S.rvm.sort === d.k ? -S.rvm.dir : (d.k === 'brand' ? 1 : -1); S.rvm.sort = d.k; drawRvmTable(); break;
      case 'sum-page': S.sum.page = Number(d.p) || 1; drawSumTable(); break;
      case 'sum-open': openSum(d.asin); break;
      case 'month': S.monthly = null; S.brief = null; S.month = d.month; loadMonthly(d.month); break;
      case 'brief-make': makeBrief(b); break;
      case 'brief-save': saveBrief(b, false); break;
      case 'brief-approve': saveBrief(b, true); break;
      case 'dock-add': e.preventDefault(); dockAdd(d.id); break;   // 접는 칸(summary) 안에서 눌러도 펼쳐지지 않게
      case 'promo-make': makePromo(b); break;
      case 'aud-month': loadData('audience', d.month); break;
      case 'aud-q': openAudQuestion(Number(d.i)); break;
      case 'weee-raw': openWeeeRaw(); break;
      case 'lines-confirm': confirmLines(b); break;
      case 'reload-sub': NEEDS[curSub()].forEach(k => loadData(k)); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.ref === 'aud-month') { loadData('audience', t.value); return; }
    if (t.dataset.mk) { S.mk[t.dataset.mk] = t.value; if (t.dataset.mk === 'sort') S.mk.dir = MK_COL_SORTS[t.value][1]; S.mk.page = 1; drawBrandTable(); return; }
    if (t.dataset.ref === 'rh-vs') { S.rv.cmp = t.value; drawSub('reviews'); return; }
    if (t.dataset.rvf === 'scope') { rvScope(t.value); return; }
    if (t.dataset.rvf) { if (t.dataset.rvf === 'sort') { S.rv.sort = t.value; S.rv.dir = RV_COL_SORTS[t.value] ? RV_COL_SORTS[t.value][1] : 1; } else S.rv.f[t.dataset.rvf] = t.value; S.rv.page = 1; drawRvTable(); return; }
    if (t.dataset.edit) editShelf(t);
    if (t.dataset.line) editLine(t);
  }

  /* ═════════ 주간 리뷰 ═════════ */
  async function loadWeekly() {
    try {
      S.weekly = await api('/api/insights/weekly');
    } catch (err) {
      const el = panel('weekly');
      if (el) el.innerHTML = `<div class="note error">이번 주 화면을 불러오지 못했어요. ${esc(err.message)}</div>`;
      return;
    }
    drawKpis();
    paintTitle();
    if (S.tab === 'weekly') drawWeekly();
    else if (S.tab === 'manage' && curSub() === 'edit') drawSub('edit');   // 마지막 업데이트 카드
    const urgent = rowCount(actionRows(S.weekly.actions), '긴급');
    const prev = store.get('summary', null);
    if (!prev || prev.urgent !== urgent || prev.week !== S.weekly.week) {
      store.set('summary', { urgent, week: S.weekly.week });
      if (typeof REBOOT.refreshCounts === 'function') REBOOT.refreshCounts();
    }
  }

  function drawKpis() {
    const box = $(S.root, '[data-ref="kpis"]');
    const w = S.weekly;
    if (!box || !w) return;
    const rows = actionRows(w.actions);
    const n = g => rowCount(rows, g);
    // 시즌 검색 기회: 작년 같은 시기 검색이 늘었던 가장 가까운 시즌 (없으면 가장 가까운 시즌) — 이번 주 액션의 시즌과 같은 곳
    const next = w.seasons.find(x => x.lastYear && x.lastYear.pct > 0) || w.seasons[0];
    const lift = next && next.lastYear && next.lastYear.pct > 0 ? next.lastYear : null;
    const s = w.shelf;
    // 첫 카드는 같은 화면의 이번 주 액션으로 스크롤
    const links = ['#weekly', '#market/price', '#customers/reviews', '#monthly'];
    box.innerHTML = [
      ui.kpi({ label: '이번 주 액션', value: rows.length, unit: '개', featured: true, icon: 'spark',
        change: n('긴급') ? `긴급 ${n('긴급')}` : '', foot: rows.length ? `기회 ${n('기회')} · 참고 ${n('참고')}` : (w.hasData ? '특이사항 없음' : '최신 데이터 받기 필요') }),
      ui.kpi({ label: '진열대 제품', value: s.total, unit: '개', icon: 'grid', tone: s.oosAll || s.oosSome ? 'down' : '',
        change: s.oosAll ? `모든 판매처 품절 ${s.oosAll}` : s.oosSome ? `일부 판매처 품절 ${s.oosSome}` : '',
        foot: s.compare && s.compChanges ? `가격 변동 ${s.compChanges.price} · 새 제품 ${s.compChanges.new}` : (s.total ? '변화 비교는 2주차부터' : '아직 받기 전') }),
      ui.kpi({ label: '새 리뷰 (7일)', value: w.reviews.count, unit: '개', icon: 'chat', foot: `알디콤 ${w.reviews.own} · 경쟁 브랜드 ${w.reviews.other}` }),
      ui.kpi({ label: '시즌 검색 기회', value: lift ? fmt.signed(lift.pct, 0, '%') : '—', icon: 'calendar',
        change: next ? `${next.name} ${fmt.dday(next.start)}` : '',
        foot: lift ? `작년 같은 시기 '${lift.keyword}' 검색` : next ? '작년 같은 시기 검색 데이터 없음' : '모니터링 시즌 없음' })
    ].map((html, i) => kpiLink(links[i], html)).join('');
  }

  // KPI 카드를 해당 화면으로 가는 링크로 감쌈 (주간 · 월간)
  function kpiLink(href, html) {
    return `<a class="ins-kpi-link" href="${href}"${href === '#weekly' ? ' data-act="ins-goto-actions"' : ''}>${html}</a>`;
  }

  // 시연 전용 DB일 때만 (kv 'demo') — 가짜 주차가 섞여 있음을 화면 맨 위에 표시
  function demoNote(d) {
    return d ? `<div class="note warn mb-16">${badge('예시', 'orange')} ${esc(d.note || '')}</div>` : '';
  }

  function factValue(v) {
    if (Array.isArray(v)) {
      return v.map(x => {
        if (x && typeof x === 'object') {
          if ('line' in x && 'oos' in x) return esc(`${x.line} — ${x.oos.join(' · ')} 품절 (판매처: ${x.channels.join(' · ')})${x.again ? ' · 지난주에 이어 계속' : ''}`);
          // 상품 이름은 판매처 상품 페이지로 (link 있을 때)
          const u = safeUrl(x.link);
          const name = u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ${icon('up')}</a>` : esc(x.title);
          const src = SRC_LABEL[x.source] || x.source;
          if ('before' in x && 'after' in x) return `${name} ${esc(`(${src}) ${money(x.before)} → ${money(x.after)} (${fmt.signed(x.pct, 0, '%')})`)}`;
          return [name, ...[src, x.price != null ? money(x.price) : null].filter(Boolean).map(esc)].join(' · ');
        }
        return esc(x);
      }).join('<br>');
    }
    if (v && typeof v === 'object') return esc(JSON.stringify(v));
    return esc(v);
  }

  /* ───────── 노란 체크 패널로 담기 (홈 dock · REBOOT.use('home').dockAdd) ─────────
     그릴 때 dockable()로 자료를 등록 → 그 요소를 끌면 dragstart가 등록한 값을 넘김 (HTML 속성에 큰 JSON을 넣지 않음)
     끌기 어려운 경우를 위해 dockBtn() [패널에 담기] 버튼도 같은 값을 씀 */
  const DOCK = {};
  const DOCK_MIME = 'application/x-reboot-insight';
  const dockId = (kind, key) => `${kind}:${key}`;
  function dockable(kind, key, p) {
    const id = dockId(kind, key);
    DOCK[id] = Object.assign({ kind, sourceKey: id, sourceTab: 'insights', text: '', data: {}, href: '', url: '' }, p);
    return ` draggable="true" data-dock-id="${esc(id)}"`;
  }
  const dockBtn = (kind, key) => `<button type="button" class="ins-dock-btn" data-act="dock-add" data-id="${esc(dockId(kind, key))}"
    title="노란 체크 패널 › 인사이트 자료에 담아요 (끌어다 놓아도 돼요)">${icon('plus')}패널에 담기</button>`;
  // 월간 화면처럼 항목이 많은 곳: 아이콘만 있는 작은 버튼 (항목에 마우스를 올리거나 키보드로 오면 보임 · 터치 화면은 늘 보임)
  const dockMini = (kind, key) => `<button type="button" class="ins-dock-mini" data-act="dock-add" data-id="${esc(dockId(kind, key))}"
    aria-label="노란 체크 패널에 담기" title="노란 체크 패널 › 인사이트 자료에 담기 (끌어다 놓아도 돼요)">${icon('plus')}</button>`;
  const DOCK_KIND_LABEL = { action: '주간 액션', brief: '콘텐츠 브리프', price: '1회분 단가', promo: '시즌 프로모션', brand: '브랜드', change: '경쟁사 변화',
    review: '리뷰', summary: '이달의 요약', insight: '고객 인사이트', trend: '경쟁 동향', priority: '개선 우선순위', persona: '페르소나', swot: 'SWOT', strategy: '전략' };
  // 끌 때 마우스를 따라오는 작은 카드 (종류 + 제목) — 화면 밖에 잠깐 그렸다가 지움
  function dockGhost(e, p) {
    if (!e.dataTransfer.setDragImage || !document.body) return;
    const g = document.createElement('div');
    g.className = 'ins-drag-ghost';
    g.innerHTML = `<span>${esc(DOCK_KIND_LABEL[p.kind] || '인사이트')}</span><b>${esc(clip(p.title, 60))}</b><small>노란 체크 패널로 끌어다 놓으세요</small>`;
    document.body.appendChild(g);
    e.dataTransfer.setDragImage(g, 18, 18);
    setTimeout(() => g.remove(), 0);
  }
  function dockStart(e) {
    const el = e.target.closest && e.target.closest('[data-dock-id]');
    const p = el && DOCK[el.dataset.dockId];
    if (!p) return;
    e.dataTransfer.setData(DOCK_MIME, JSON.stringify(p));
    e.dataTransfer.setData('text/plain', [p.title, p.text].filter(Boolean).join('\n'));
    e.dataTransfer.effectAllowed = 'copy';
    dockGhost(e, p);
    el.classList.add('ins-dragging');
    const done = () => { el.classList.remove('ins-dragging'); el.removeEventListener('dragend', done); };
    el.addEventListener('dragend', done);
  }
  async function dockAdd(id) {
    const p = DOCK[id];
    let home = null;
    try { home = REBOOT.use('home'); } catch (e) { home = null; }
    if (!p || !home || typeof home.dockAdd !== 'function') { toast('노란 체크 패널을 쓸 수 없어요. 새로고침 후 다시 해 보세요.', 'error'); return; }
    await home.dockAdd(p);
  }

  // 액션의 근거 화면 (규칙 → 대시보드 안 주소)
  const ACTION_SRC = {
    own_oos_season: ['#market/brands', '시장 › 브랜드 비교'], price_cut: ['#market/changes', '시장 › 변화'], price_up: ['#market/changes', '시장 › 변화'],
    comp_oos: ['#market/changes', '시장 › 변화'], comp_oos_multi: ['#market/changes', '시장 › 변화'], low_stock: ['#market/changes', '시장 › 변화'],
    restock: ['#market/changes', '시장 › 변화'], new_entry: ['#market/changes', '시장 › 변화'], own_complaint: ['#customers/reviews', '고객 › 구매자 리뷰'],
    top_question: ['#customers/audience', '고객 › 유튜브 댓글'], season_search: ['#monthly', '월간 · 검색 트렌드']
  };

  // 사실 문장의 첫 문장만 (참고 한 줄 · 홈 할 일 제목)
  const firstSentence = t => { const m = String(t || '').match(/^.+?[.!?](?=\s|$)/); return m ? m[0] : String(t || ''); };

  // 할 일을 맡을 탭 (펼친 칸의 'OO 열기')
  const ACTION_GO = {
    own_complaint: ['/dashboard/cs', '고객 응대 열기'], season_search: ['/dashboard/content', '콘텐츠 제작 열기'], top_question: ['/dashboard/content', '콘텐츠 제작 열기'],
    comp_oos: ['/dashboard/performance', '성과분석 열기'], comp_oos_multi: ['/dashboard/performance', '성과분석 열기']
  };
  const ACT_CHEV = '<svg class="ins-aw-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  // 이번 주 액션 → 한 줄 목록. 같은 규칙(시즌 검색 여러 개)은 한 줄로 합침 — 제목 · 숫자 · 개수 모두 이 줄 기준
  function actionRows(acts) {
    const by = {}, rows = [];
    (acts || []).forEach(a => {
      if (!by[a.rule]) rows.push(by[a.rule] = { key: a.id, rule: a.rule, grade: a.grade, acts: [] });
      by[a.rule].acts.push(a);
    });
    return rows.map(r => {
      const a = r.acts[0];
      const season = r.rule === 'season_search';
      return Object.assign(r, {
        title: a.title || firstSentence(a.fact), metric: a.metric || '', metricLabel: a.metricLabel || '',
        sub: season ? r.acts.map(x => `${x.facts['시즌']} D-${x.facts['남은 날']}`).join(' · ') : a.why,
        steps: a.steps && a.steps.length ? a.steps : [a.todo]
      });
    });
  }
  const rowCount = (rows, g) => rows.filter(r => r.grade === g).length;

  // 펼친 칸의 근거 칩 (수집한 값 그대로 · 상품은 판매처 링크)
  function actionChips(a) {
    const f = a.facts || {};
    const src = x => SRC_LABEL[x.source] || x.source || '';
    const short = t => { t = String(t || ''); return t.length > 30 ? t.slice(0, 29) + '…' : t; };
    const item = (x, text) => { const u = safeUrl(x.link); return `<span class="ins-aw-chip">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>` : esc(text)}</span>`; };
    const out = [];
    (f['가격 변동 제품'] || f['변동 상품'] || []).slice(0, 3).forEach(x => out.push(item(x, `${short(x.title)} (${src(x)}) ${money(x.before)} → ${money(x.after)}`)));
    (f['알디콤 품절 제품'] || f['품절 상품'] || []).slice(0, 3).forEach(x => out.push(item(x, `${short(x.title)} (${src(x)})`)));
    (f['새 제품'] || f['새 상품'] || []).slice(0, 3).forEach(x => out.push(item(x, `${short(x.title)} (${src(x)})${x.price != null ? ' ' + money(x.price) : ''}`)));
    (f['재입고'] || []).slice(0, 3).forEach(x => out.push(item(x, `${short(x.title)} (${src(x)})`)));
    (f['재고 임박'] || []).slice(0, 3).forEach((x, i) => out.push(item(x, `${short(x.title)} (${src(x)}) ${(f['남은 개수'] || [])[i]}개 남음`)));
    (f['품절 제품'] || []).slice(0, 2).forEach(x => out.push(`<span class="ins-aw-chip">${esc(`${x.line} · 판매 ${x.channels.join(' · ')} · 품절 ${x.oos.join(' · ')}`)}</span>`));
    (f['예시'] || []).slice(0, 3).forEach(t => out.push(`<span class="ins-aw-chip">"${esc(short(t))}"</span>`));
    return out.length ? `<div class="ins-aw-chips">${out.join('')}</div>` : '';
  }

  function actionRow(r, open) {
    const src = ACTION_SRC[r.rule], go = ACTION_GO[r.rule];
    const comp = r.acts.some(a => /컴플라이언스/.test(a.todo));
    const seasons = r.rule === 'season_search' ? `<ul class="ins-aw-subs">${r.acts.map(a => `<li><span>${esc(a.facts['시즌'])} · D-${esc(a.facts['남은 날'])}</span>
      <b>'${esc(a.facts['키워드'])}' ${esc(a.metric || '')}</b></li>`).join('')}</ul>` : '';
    const drag = dockable('action', r.rule, { title: r.title, text: [r.sub, r.metric ? `${r.metric} ${r.metricLabel}`.trim() : '', ...r.steps.map(t => '할 일: ' + t)].filter(Boolean).join('\n'),
      href: src ? '/dashboard/insights' + src[0] : '/dashboard/insights#weekly', data: { grade: r.grade, rule: r.rule, metric: r.metric, metricLabel: r.metricLabel, steps: r.steps } });
    return `<div class="ins-aw-row ${GRADE_CLASS[r.grade] || ''}${open ? ' open' : ''}"${drag}>
      <button type="button" class="ins-aw-btn" data-act="act-row" data-key="${esc(r.key)}" aria-expanded="${open}">
        <span class="ins-aw-dot" aria-hidden="true"></span>
        <span class="ins-aw-text"><span class="ins-aw-t">${esc(r.title)}</span><span class="ins-aw-s">${esc(r.sub)}</span></span>
        <span class="ins-aw-num"><b>${esc(r.metric)}</b><small>${esc(r.metricLabel)}</small></span>${ACT_CHEV}</button>
      ${open ? `<div class="ins-aw-detail">${seasons || actionChips(r.acts[0])}
        <p class="ins-aw-lbl">할 일</p><ol class="ins-aw-steps">${r.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        ${comp ? '<p class="ins-aw-comp">ⓘ 광고 문구에 효능 표현이나 경쟁 브랜드 이름을 넣을 때는 컴플라이언스 탭에서 문구 심의를 거쳐요.</p>' : ''}
        <div class="ins-aw-foot">${src ? `<a class="link small" href="${src[0]}">${esc(src[1])}에서 근거 보기 ${icon('arrow')}</a>` : '<span></span>'}
          <span class="flex">${dockBtn('action', r.rule)}${go ? `<a class="btn small" href="${go[0]}">${esc(go[1])}</a>` : ''}</span></div></div>` : ''}
    </div>`;
  }

  // 참고: 맨 아래 접은 상자 안에 제목 + 숫자 한 줄씩
  function actionRefs(refs) {
    if (!refs.length) return '';
    return `<details class="ins-aw-ref" data-fold="refs"${S.open.refs ? ' open' : ''}><summary>참고 ${refs.length}개 더 보기 ${ACT_CHEV}</summary>
      ${refs.map(r => { const src = ACTION_SRC[r.rule]; return `<div class="ins-aw-refrow"><span class="ins-aw-dot" aria-hidden="true"></span>
        <span class="ins-aw-t">${src ? `<a href="${src[0]}">${esc(r.title)}</a>` : esc(r.title)}</span><small>${esc(r.metric)}${r.metricLabel ? ' ' + esc(r.metricLabel) : ''}</small></div>`; }).join('')}</details>`;
  }

  function drawWeekly() {
    const el = panel('weekly');
    if (!el) return;
    const w = S.weekly;
    if (!w) { el.innerHTML = `<div class="stack">${skel}${skel}</div>`; return; }
    const acts = w.actions;
    const s = w.shelf;
    // 긴급 · 기회는 한 줄 목록(누르면 펼침, 처음엔 모두 접힘), 참고는 맨 아래 접기 · 위 칸으로 등급 고르기
    const rows = actionRows(acts);
    const main = rows.filter(r => r.grade !== '참고'), refs = rows.filter(r => r.grade === '참고');
    const f = S.actF || 'all';
    const openKey = S.actOpen === undefined ? null : S.actOpen;   // 처음엔 모두 접힘
    const seg = main.length ? `<div class="linetabs ins-aw-seg" role="group" aria-label="등급 고르기">${[['all', '전체', main.length], ['긴급', '긴급', rowCount(main, '긴급')], ['기회', '기회', rowCount(main, '기회')]]
      .map(([k, l, n]) => `<button type="button" data-act="act-f" data-f="${k}" aria-pressed="${f === k}"${f === k ? ' class="on"' : ''}>${l} <span class="n">${n}</span></button>`).join('')}</div>` : '';
    const head = `<div class="card-head"><h2>이번 주 액션<span class="head-cap">${esc(w.weekLabel)}</span></h2>
      <div class="flex">${w.aiUsed ? badge('AI 문장', 'purple') : ''}${seg}</div></div>`;
    let list;
    const shown = main.filter(r => f === 'all' || r.grade === f);
    if (acts.length) list = `<div class="ins-aw">${shown.map(r => actionRow(r, r.key === openKey)).join('')}${f === 'all' ? actionRefs(refs) : ''}</div>`;
    else if (w.hasData) list = `<div class="empty-art">${icon('check')}<span><b>특이사항 없음</b><br>이번 주에는 규칙에 걸린 신호가 없어요. 시장 › 가격 위치에서 흐름을 확인하세요.</span></div>`;
    else list = `<div class="empty-art">${icon('refresh')}<span><b>특이사항 없음</b><br>아직 모은 데이터가 없어서 걸린 신호가 없어요. 오른쪽 위 <b>최신 데이터 받기</b>로 진열대 · 리뷰 · 검색 트렌드를 받으면 이번 주 액션이 계산돼요.</span>
      <button type="button" class="btn lime small" data-act="ins-update">${icon('refresh')}최신 데이터 받기</button></div>`;
    const stale = w.stale ? `<div class="note warn mb-16">이번 주(${esc(w.week)}) 진열대 데이터가 아직 없어 ${esc(w.stale.week)} (${esc(w.stale.label)}) 수집 기준으로 계산했어요.</div>` : '';
    const signals = acts.length ? `<details class="ins-fold mt-16" data-fold="signals"${S.open.signals ? ' open' : ''}><summary>규칙에 걸린 신호 보기</summary>
      ${acts.map(a => `<div class="ins-signal"><div class="flex">${badge(a.grade, GRADE_TONE[a.grade])}<b>${esc(a.ruleLabel)}</b></div>
        <div class="ins-facts">${Object.keys(a.facts || {}).map(k => `<div><span>${esc(k)}</span><span>${factValue(a.facts[k])}</span></div>`).join('')}</div>
        ${a.ai ? `<p class="small muted mt-8">규칙 문장 · ${esc(a.base.fact)} ${esc(a.base.why)} ${esc(a.base.todo)}</p>` : ''}</div>`).join('')}
      <p class="panel-note mt-8">등급은 규칙이 정하고, AI는 문장만 다듬어요.${w.aiReady ? '' : ' 지금은 OpenAI 키가 없어 규칙 문장 그대로예요.'}</p>
    </details>` : '';
    const own = s.ownRank;   // 모든 판매처 · 같은 제품은 한 줄 (진열대 탭과 같은 기준)
    // 재고 주의 제품: 한 줄 설명 (품절 채널 · 옵션 품절 · 남은 개수)
    const watchLines = s.watchLines || [];
    const watchWhat = g => g.oosChannels.length ? `${g.oosChannels.join(' · ')}에서 품절`
      : g.partialOos ? `옵션 ${g.partialOos}개 품절` : g.low.map(v => `${v.source} ${v.left}개 남음`).join(' · ');
    // 이번 주 변화 요약 — 1행 3칸, 숫자는 경쟁사 탭 · 진열대 탭과 같은 계산, 칸을 누르면 그 화면으로
    const cc = s.compChanges;
    const tile = (label, value, text, attrs, tone) => `<a class="ins-sum-tile${tone ? ' ' + tone : ''}" ${attrs}>
      <span class="ins-sum-label">${esc(label)}</span><b>${value}</b><small>${text}</small><span class="ins-sum-go">${icon('arrow')}</span></a>`;
    const w1 = watchLines[0];
    const summary = s.total ? `<div class="ins-sum">
        ${tile('경쟁 브랜드 변화', cc ? `${esc(cc.total)}건${cc.demo ? ' ' + badge('예시', 'orange') : ''}` : '—',
          esc(cc ? CHG_GROUPS.map(([g, name]) => `${name} ${cc[g]}`).join(' · ') : '2주차부터 비교해요'),
          'href="#market/changes" data-act="ins-goto-chg"')}
        ${tile('재고 주의 제품', `${esc(watchLines.length)}개`,
          w1 ? esc(`${w1.label} — ${watchWhat(w1)}${watchLines.length > 1 ? ` 외 ${watchLines.length - 1}개` : ''}`) : '품절 · 곧 품절 없음',
          w1 ? `href="#market/brands" data-act="ins-goto-line" data-line="${esc(w1.id)}"` : 'href="#market/brands"', w1 ? 'red' : '')}
        ${tile('알디콤 가격 순위', own ? `${esc(own.rank)}위 <span class="ins-sum-of">/ ${esc(own.total)}</span>` : '—',
          own ? esc(`${own.source} ${money(own.perServing)} · ${own.bucketLabel} · 1위가 가장 저렴`) : '진열대에서 알디콤 제품을 못 찾았어요',
          'href="#market/price"')}
      </div>
      ${s.ownOos ? `<div class="note error mt-16">알디콤 제품 ${esc(s.ownOos)}개가 품절이에요. 판매처에 재입고 일정을 확인하세요.</div>` : ''}`
      : ui.empty('아직 진열대 데이터가 없어요. 최신 데이터 받기를 눌러 Weee! · Amazon 진열대를 받아 오세요.', 'grid');
    const shelfCard = `<section class="card">
      <div class="card-head"><h2>이번 주 변화 요약</h2><a class="link" href="#market/changes">시장 보기 ${icon('arrow')}</a></div>
      ${summary}
    </section>`;
    // 새 리뷰는 위 숫자 칸, 마지막 업데이트는 데이터 관리 › 진열대 수집 · 고치기 (runStatus)
    el.innerHTML = `${demoNote(w.demo)}
      <div class="stack">
        ${shelfCard}
        <section class="card" data-ref="actions">${head}${stale}${list}${signals}</section>
      </div>`;
  }

  // 마지막 업데이트 + 수집 상태 (수집 기준 주차 · 데이터가 부족한 곳) — 데이터 관리 › 진열대 수집 · 고치기 맨 위
  function runStatus() {
    const w = S.weekly;
    if (!w) return '';
    const s = w.shelf;
    const weeks = Object.keys(s.weeks || {}).map(src => `${SRC_LABEL[src] || src} ${s.weeks[src].now}${s.weeks[src].prev ? ` (지난 ${s.weeks[src].prev})` : ''}`).join(' · ');
    const reasons = shelfReasons(s);
    const collect = `${weeks ? `<p class="panel-note mt-8">${s.compare ? '지난 수집 대비' : '이번 수집 기준'} · ${esc(weeks)}</p>` : ''}
      ${reasons.length ? `<details class="ins-fold mt-16" data-fold="shelfWhy"${S.open.shelfWhy ? ' open' : ''}><summary>데이터가 부족한 곳 (${reasons.length})</summary>
        <div class="ins-why-list">${reasons.map(r => `<div class="ins-why"><b>${esc(r.label)}</b><div>${esc(r.text)}<small>할 일 · ${esc(r.todo)}</small></div></div>`).join('')}</div></details>` : ''}`;
    return `<div class="mt-24">${lastRunCard(w.lastRun, collect)}</div>`;
  }

  // 진열대 변화 카드가 비어 보이는 이유 + 할 일 (판매처 수집 결과 · 첫 수집 · 재고 미확인 · 자사 · 묶음 확인)
  function shelfReasons(s) {
    const out = [];
    const last = s.lastCollect || {};
    ['weee', 'amazon', 'yami'].forEach(src => {
      if ((s.weeks || {})[src]) return;
      const lc = last[src];
      const label = SRC_LABEL[src];
      if (!lc) out.push({ label, text: '아직 받은 적이 없어요.', todo: `최신 데이터 받기에서 ${label} 진열대를 고르세요.` });
      else if (!lc.ok) out.push({ label, text: `마지막에 받지 못했어요: ${lc.message}`, todo: '설정 › 연결에서 키를 확인하고 최신 데이터 받기를 다시 눌러 주세요.' });
      else out.push({ label, text: `마지막 수집(${fmt.date(lc.at)})에서 제품을 0개 읽었어요.`, todo: src === 'weee' ? '데이터 관리 › 진열대 수집 · 고치기 › Weee! 원문 보기로 페이지를 확인하고, 설정 › 수집 설정의 주소를 고치세요.' : '설정 › 수집 설정의 검색어 · 주소를 확인하세요.' });
    });
    if (s.total && !s.compare) out.push({ label: '비교', text: '첫 수집이라 가격 변동 · 신규 진입 · 재입고는 다음 수집부터 계산해요.', todo: '다음 주에 최신 데이터 받기를 한 번 더 눌러 주세요.' });
    if (s.unknownStock) out.push({ label: '재고', text: `경쟁 제품 ${s.unknownStock}개는 판매처가 재고를 보여 주지 않아 품절 계산에서 빠졌어요.`, todo: '꼭 볼 제품은 설정 › 수집 설정 › 추적 ASIN에 넣으면 상세 조회로 재고를 확인해요.' });
    if (s.total && !s.ownCount) out.push({ label: '알디콤', text: '진열대에서 알디콤 제품을 찾지 못해 1회분 단가 위치를 계산하지 못했어요.', todo: '설정 › 수집 설정에 알디콤 Weee! 제품 주소나 추적 ASIN을 넣고, 데이터 관리 › 진열대 수집 · 고치기에서 알디콤 표시를 확인하세요.' });
    if (s.unconfirmed) out.push({ label: '묶음', text: `제품 묶음 ${s.unconfirmed}개가 아직 확인 전이에요 (자동 묶음).`, todo: '데이터 관리 › 진열대 수집 · 고치기에서 묶음을 확인하거나 고치세요.' });
    return out;
  }

  function lastRunCard(run, extra) {
    if (!run) {
      return `<section class="card"><h3>마지막 업데이트</h3><p class="small muted mt-8">아직 최신 데이터를 받은 적이 없어요. 최신 데이터 받기를 눌러 시작하세요.</p>${extra || ''}</section>`;
    }
    const tone = { done: 'green', partial: 'orange', failed: 'red', running: 'blue' }[run.status];
    const label = { done: '완료', partial: '일부 받기 실패', failed: '받기 실패', running: '받는 중…' }[run.status] || run.status;
    const keys = Object.keys(run.results || {});
    return `<section class="card">
      <div class="card-head"><h2>마지막 업데이트</h2>${badge(label, tone)}</div>
      <p class="small muted">${esc(fmt.datetime(run.startedAt))} · ${esc(run.user || '')}</p>
      ${keys.length ? `<details class="ins-fold mt-16" data-fold="lastRun"${S.open.lastRun ? ' open' : ''}><summary>항목별 결과 (${keys.length})</summary>
        <ul class="ins-results">${keys.map(k => {
          const x = run.results[k];
          return `<li class="${x.ok ? 'ok' : 'fail'}"><b>${esc(ITEM_LABEL[k] || '중단')}</b> ${esc(x.message)}</li>`;
        }).join('')}</ul></details>` : ''}
      ${extra || ''}
    </section>`;
  }

  /* ═════════ 월간 리뷰 ═════════ */
  async function loadMonthly(month) {
    const el = panel('monthly');
    if (!S.monthly && el) el.innerHTML = skel;
    try {
      S.monthly = await api('/api/insights/monthly' + (month ? `?month=${encodeURIComponent(month)}` : ''));
      S.month = S.monthly.month;
    } catch (e) {
      if (el) el.innerHTML = `<div class="note error">이번 달 화면을 불러오지 못했어요. ${esc(e.message)}</div>`;
      return;
    }
    if (S.tab === 'monthly') { drawMonthly(); drawActions(); }
  }

  function shiftMonth(m, n) {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // 페르소나 얼굴(SVG): 이름으로 머리 모양 · 머리색 · 피부 · 옷 · 안경 · 귀걸이 · 입을 고름 (같은 이름이면 매달 같은 얼굴) · 옷 색은 카드 색
  const FACE = {
    skin: ['#F7D2BF', '#EDB98A', '#D08B5B', '#8D5524'],
    hair: ['#2C2C2A', '#4A2E1A', '#7A4A26', '#B5832F'],
    shirt: ['#639922', '#7F77DD', '#D85A30'],
    back: {   // 얼굴 뒤로 내려오는 머리 (단발 · 긴 머리)
      1: 'M28 46C26 26 36 18 48 18S70 26 68 46V60Q62 63 58 58V48H38V58Q34 63 28 60Z',
      2: 'M28 44C26 24 36 17 48 17S70 24 68 44L71 70Q62 74 57 66V50H39V66Q34 74 25 70Z'
    },
    front: [
      'M30 44C28 26 37 19 49 19C61 19 68 27 66 44C64 36 61 31 56 29C50 33 40 34 32 40Z',
      'M30 42C30 26 38 20 48 20S66 26 66 42C60 34 52 30 44 31C38 32 33 36 30 42Z',
      'M31 44C30 27 38 20 48 20S66 27 65 44C63 34 56 28 48 27C47 33 40 38 31 44Z',
      '',
      'M30 42C30 27 38 21 48 21S66 27 66 42C62 33 55 29 48 29S34 33 30 42Z',
      'M31 40C31 27 39 21 48 21S65 27 65 40C62 32 56 29 48 29S34 32 31 40Z'
    ],
    cloth: [   // 라운드넥 · 셔츠 깃 · 후드
      '<path d="M38 73q10 9 20 0" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="2"/>',
      '<path d="M40 72l8 9 8-9-3-2-5 5-5-5z" fill="#fff" fill-opacity=".9"/>',
      '<path d="M34 75q14 12 28 0" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="3"/><path d="M44 80v8M52 80v8" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round"/>'
    ]
  };
  function nameHash(name) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
  }

  // Open Peeps 그림 (static/peeps/peep-01~12.svg · Pablo Stanley, CC0 · 옷 색 = currentColor) — 받기 전 · 실패하면 personaFace 그대로
  const PEEPS = 12;
  const peepCache = {};
  function loadPeep(n) {
    if (!peepCache[n]) {
      peepCache[n] = fetch(`/parts/insights/peeps/peep-${String(n).padStart(2, '0')}.svg`)
        .then(r => (r.ok ? r.text() : null))
        .then(t => (t && t.trim().startsWith('<svg') ? t : null))
        .catch(() => null);
    }
    return peepCache[n];
  }
  function fillPeeps(el) {
    for (const box of el.querySelectorAll('[data-peep]')) {
      loadPeep(box.dataset.peep).then(svg => { if (svg && box.isConnected) box.innerHTML = svg; });
    }
  }

  function personaFace(name, i) {
    const h = nameHash(name);
    const cut = h % 6;
    const tone = (h >>> 5) % 4;
    const skin = FACE.skin[tone];
    const hair = FACE.hair[tone === 3 ? 0 : (h >>> 3) % 4];   // 가장 어두운 피부엔 검은 머리 (머리 · 얼굴 구분)
    const curls = [[33, 37, 7], [38, 28, 8], [48, 24, 9], [58, 28, 8], [63, 37, 7]];
    const earrings = [1, 2, 4].includes(cut) && (h >>> 11) % 2
      ? '<circle cx="31" cy="51" r="1.6" fill="#EF9F27"/><circle cx="65" cy="51" r="1.6" fill="#EF9F27"/>' : '';
    const glasses = (h >>> 9) % 3 === 0
      ? '<g fill="none" stroke="#2C2C2A" stroke-width="1.5"><circle cx="40" cy="43" r="5"/><circle cx="56" cy="43" r="5"/><path d="M45 43h6M35 42l-4-1M61 42l4-1"/></g>' : '';
    const mouth = (h >>> 12) % 2
      ? '<path d="M43 53.5q5 6 10 0z" fill="#993C1D"/>'
      : '<path d="M43 54q5 4 10 0" fill="none" stroke="#993C1D" stroke-width="1.6" stroke-linecap="round"/>';
    return `<svg viewBox="0 0 96 96" aria-hidden="true">
      ${FACE.back[cut] ? `<path d="${FACE.back[cut]}" fill="${hair}"/>` : ''}
      <path d="M10 98C12 80 26 72 48 72S84 80 86 98Z" fill="${FACE.shirt[i % 3]}"/>${FACE.cloth[(h >>> 7) % 3]}
      <path d="M41 58h14v12q-7 6-14 0z" fill="${skin}"/><path d="M41 58h14v5q-7 5-14 0z" fill="#000" fill-opacity=".08"/>
      <circle cx="31" cy="45" r="4.5" fill="${skin}"/><circle cx="65" cy="45" r="4.5" fill="${skin}"/>
      ${cut === 4 ? `<circle cx="48" cy="18" r="8" fill="${hair}"/>` : ''}
      <ellipse cx="48" cy="43" rx="17" ry="19" fill="${skin}"/>
      ${cut === 3 ? curls.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hair}"/>`).join('') : `<path d="${FACE.front[cut]}" fill="${hair}"/>`}
      <path d="M36 37q4-2.5 8-.5M52 36.5q4-2 8 .5" stroke="${hair}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="40" cy="43" rx="2" ry="2.4" fill="#2C2C2A"/><ellipse cx="56" cy="43" rx="2" ry="2.4" fill="#2C2C2A"/>
      <circle cx="40.7" cy="42.2" r=".7" fill="#fff"/><circle cx="56.7" cy="42.2" r=".7" fill="#fff"/>
      <path d="M48 46q-2 4 .5 4.5" stroke="#000" stroke-opacity=".2" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="35.5" cy="51" rx="3.2" ry="1.9" fill="#F0997B" fill-opacity=".35"/><ellipse cx="60.5" cy="51" rx="3.2" ry="1.9" fill="#F0997B" fill-opacity=".35"/>
      ${mouth}${glasses}${earrings}</svg>`;
  }

  // 페르소나 카드(가로형): 앞면 얼굴 · 이름 · 한 줄, 누르면 뒤집혀 니즈 · 메시지
  function personaCard(p, i, used) {
    const on = !!S.open['persona-' + i];
    let n = nameHash(p.name) % PEEPS + 1;
    while (used.has(n) && used.size < PEEPS) n = n % PEEPS + 1;   // 같은 달 카드끼리 얼굴이 겹치지 않게
    used.add(n);
    const face = `<span class="ins-persona-face" data-peep="${n}" style="color:${FACE.shirt[i % 3]}">${personaFace(p.name, i)}</span>`;
    return `<button type="button" class="ins-persona p${i % 3}${on ? ' flipped' : ''}" data-act="persona-flip" data-i="${i}" aria-pressed="${on}">
      <span class="ins-persona-in">
        <span class="ins-persona-side">${face}
          <span class="ins-persona-body"><b>${esc(p.name)}</b><span class="ins-persona-quote">“${esc(p.oneLine)}”</span></span>
          <span class="ins-persona-hint">니즈 · 메시지 ›</span></span>
        <span class="ins-persona-side ins-persona-back">${face}
          <span class="ins-persona-body ins-persona-cols"><small><span>핵심 니즈</span>${esc(p.needs)}</small><small><span>쓸 메시지</span>${esc(p.message)}</small></span>
          <span class="ins-persona-hint">‹ 앞면</span></span>
      </span></button>`;
  }

  // 개선 우선순위 카드 (서버 review_priorities · 규칙 계산): 자사 불만 건수 × 심각도. 부작용은 CS · 컴플라이언스 확인 표시
  function prioritiesCard(p) {
    const items = p && p.items ? p.items : [];
    const month = S.monthly ? S.monthly.month : '';
    const rows = items.map((x, i) => `<tr${dockable('priority', `${month}:${x.topic}`, { title: `개선 우선순위 ${i + 1} · ${x.topic}`,
        text: `자사 불만 ${x.count}건 × 심각도 ${x.weight} = ${x.score}점 · 판매처 ${x.channels.join(' · ')}${x.check ? ' · CS · 컴플라이언스 확인 필요' : ''}`,
        href: '/dashboard/insights#monthly', data: { month, topic: x.topic, count: x.count, weight: x.weight, score: x.score, channels: x.channels } })}><td>${i + 1}</td><td><b>${esc(x.topic)}</b>
        ${x.check ? ' ' + badge('CS · 컴플라이언스 확인', 'red') : ''}${dockMini('priority', `${month}:${x.topic}`)}</td>
        <td class="num">${esc(x.count)}건</td><td class="num">×${esc(x.weight)} = <b>${esc(x.score)}</b></td>
        <td class="small">${esc(x.channels.join(' · '))}</td></tr>`).join('');
    const body = items.length
      ? `<div class="table-wrap"><table class="data-table ins-table"><thead><tr><th>#</th><th>불만 주제</th><th class="num">건수</th><th class="num">점수</th><th>판매처</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <p class="small muted mt-8">${esc(p.basis)} · 불만 리뷰 ${esc(p.total)}건 기준이에요.
          <a class="link" href="#customers/reviews">리뷰 목록 보기</a></p>`
      : '<p class="small muted">아직 알디콤 불만 리뷰가 없어요.</p>';
    return `<section class="card"><div class="card-head"><h2>개선 우선순위</h2>${badge('규칙 계산')}</div>${body}</section>`;
  }

  // 자료 출처 카드 (월간 리뷰 맨 아래, 가로형): 어떤 칸이 AI 분석인지 + AI가 읽은 자료 개수(월간 분석 실행 때 실제로 넘긴 값 · 0개는 뺌)
  function sourcesCard(m) {
    const ai = [m.summary.length && '이달의 요약', m.insightsAi && '고객 인사이트', m.competitorAi && '경쟁 브랜드 동향', m.strategy && '전략 업데이트'].filter(Boolean);
    const rule = [!m.insightsAi && m.insights.length && '고객 인사이트', !m.competitorAi && m.competitorTrends.length && '경쟁 브랜드 동향'].filter(Boolean);
    const join = a => a.map(x => `<b>${x}</b>`).join(' · ');
    const eun = a => { const c = a[a.length - 1].slice(-1).charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? '은' : '는'; };   // 받침 있으면 '은'
    const lead = (ai.length ? `${join(ai)}${eun(ai)} 아래 자료로 AI가 만든 분석이에요.` : '이달 AI 분석은 아직 실행 전이에요.') +
      (rule.length ? ` ${rule.join(' · ')}${eun(rule)} 모은 데이터로 만든 규칙 요약이에요.` : '');
    const s = m.sources;
    let body = '';
    if (s) {
      const items = [['진열대 제품', s.shelf, '개'], ['구매자 리뷰', s.reviews, '개'], ['유튜브 질문', s.questions, '건'],
        ['고객 표현', s.expressions, '개'], ['경쟁 브랜드 동향', s.competitors, '줄'], ['검색 키워드', s.trends, '개']]
        .filter(([, n]) => n).map(([k, n, u]) => `<li>${k} <b>${esc(n)}</b>${u}</li>`);
      if (s.lastMonth) items.push('<li>지난달 전략</li>');
      body = `<span class="ins-msrc-label">AI가 읽은 자료</span><ul class="ins-msrc-list">${items.join('')}</ul>`;
    } else if (m.ai) {
      body = '<p class="ins-msrc-note">월간 분석을 다시 실행하면 AI가 읽은 자료 개수가 여기에 보여요.</p>';
    }
    const meta = m.ai ? `${esc(fmt.datetime(m.createdAt))} 실행 · ${esc(m.model || 'AI')}<br>` : '';
    return `<section class="card ins-msrc"><div class="card-head"><h2>자료 출처</h2></div>
      <div class="ins-msrc-grid"><div><p class="ins-msrc-lead">${lead}</p>${body}</div>
      <p class="ins-msrc-note">${meta}진열대 · 리뷰는 분석을 실행한 시점의 최신 수집분이에요. 판단 전에 시장 · 고객 화면의 원본과 함께 확인하세요.</p></div></section>`;
  }

  function drawMonthly() {
    const el = panel('monthly');
    const m = S.monthly;
    if (!el || !m) return;
    const thisMonth = REBOOT.today().slice(0, 7);
    const aiBadge = on => (on ? badge('AI 분석', 'purple') : badge('규칙 요약'));
    const summary = m.summary.length
      ? `<ol class="ins-summary">${m.summary.map((s, i) => `<li${dockable('summary', `${m.month}:${i}`, { title: `${m.label} 요약 · ${clip(s, 60)}`, text: s,
        href: '/dashboard/insights#monthly', data: { month: m.month } })}><span class="grow">${esc(s)}</span>${dockMini('summary', `${m.month}:${i}`)}</li>`).join('')}</ol>`
      : `<div class="empty-art">${icon('spark')}<span><b>AI 요약이 아직 없어요</b><br>${m.aiReady ? '월간 분석 실행에서 \'요약 · 전략\'을 고르면 3줄 요약이 생겨요.' : 'OpenAI 키를 설정 › 연결에 넣으면 월간 분석 실행으로 3줄 요약을 만들 수 있어요.'}</span>
        <button type="button" class="btn small" data-act="ins-monthly-run">${icon('spark')}월간 분석 실행</button></div>`;
    const insights = m.insights.length ? m.insights.map((x, i) => `<details class="ins-insight" data-fold="insight-${i}"${S.open['insight-' + i] ? ' open' : ''}>
        <summary${dockable('insight', `${m.month}:${i}`, { title: `고객 인사이트 · ${x.title}`, href: '/dashboard/insights#monthly',
          text: [x.detail, (x.faq || []).length && 'FAQ: ' + x.faq.join(' / '), (x.expressions || []).length && '고객 표현: ' + x.expressions.join(' / ')].filter(Boolean).join('\n'),
          data: { month: m.month, title: x.title, detail: x.detail || '', faq: x.faq || [], expressions: x.expressions || [] } })}><span class="ins-idx">${i + 1}</span><span class="grow"><b>${esc(x.title)}</b><small>${esc(x.detail || '')}</small></span>${dockMini('insight', `${m.month}:${i}`)}</summary>
        <div class="ins-insight-body">
          ${x.faq && x.faq.length ? `<div><span class="field-label">FAQ</span><ul>${x.faq.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          ${x.expressions && x.expressions.length ? `<div><span class="field-label">고객 표현</span><ul>${x.expressions.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          <div><span class="field-label">분류 정확도</span><p class="small muted">사람 정답으로 채점한 결과는 <a class="link" href="#manage/accuracy">데이터 관리 › AI 정확도 검증</a>에서 볼 수 있어요.</p></div>
        </div></details>`).join('')
      : ui.empty('아직 고객 데이터가 없어요. 월간 분석 실행을 눌러 유튜브 댓글 · 리뷰를 모으세요.', 'users');
    const st = m.strategy;
    const usedPeeps = new Set();
    const swot = st && st.swot ? `<div class="ins-swot">${[['S', '강점'], ['W', '약점'], ['O', '기회'], ['T', '위협']].map(([k, l]) =>
      `<div class="ins-swot-cell s-${k}"><b>${k} · ${l}</b><ul>${(st.swot[k] || []).map((x, i) => `<li${dockable('swot', `${m.month}:${k}:${i}`, { title: `SWOT ${l} · ${clip(x, 60)}`, text: x,
        href: '/dashboard/insights#monthly', data: { month: m.month, kind: k } })}><span class="grow">${esc(x)}</span>${dockMini('swot', `${m.month}:${k}:${i}`)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div>`).join('')}</div>` : '';
    const strategy = st ? `
        ${st.changes && st.changes.length ? `<div class="note lime"><b>지난달 대비 바뀐 점</b><ul class="ins-ul">${st.changes.map((c, i) => `<li${dockable('strategy', `${m.month}:change:${i}`, { title: `지난달 대비 바뀐 점 · ${clip(c, 60)}`, text: c,
          href: '/dashboard/insights#monthly', data: { month: m.month } })}><span class="grow">${esc(c)}</span>${dockMini('strategy', `${m.month}:change:${i}`)}</li>`).join('')}</ul></div>`
          : m.prevStrategy ? '<p class="small muted">지난달 전략과 비교해 바뀐 점이 없어요.</p>' : ''}
        <h3 class="ins-h3">페르소나</h3>
        <div class="grid-3 ins-personas">${(st.personas || []).map((p, i) => `<div class="ins-dock-wrap"${dockable('persona', `${m.month}:${p.name}`, { title: `페르소나 · ${p.name}`,
          text: [`“${p.oneLine}”`, '핵심 니즈: ' + p.needs, '쓸 메시지: ' + p.message].join('\n'), href: '/dashboard/insights#monthly', data: Object.assign({ month: m.month }, p) })}>${personaCard(p, i, usedPeeps)}${dockMini('persona', `${m.month}:${p.name}`)}</div>`).join('') || '<p class="small muted">없음</p>'}</div>
        <h3 class="ins-h3">SWOT</h3>${swot}
        <div class="mt-16">${[['target', '타깃', st.target], ['positioning', '포지셔닝', st.positioning]].map(([k, l, v]) => v
          ? `<div class="ins-dock-wrap"${dockable('strategy', `${m.month}:${k}`, { title: `${l} (${m.label})`, text: v, href: '/dashboard/insights#monthly', data: { month: m.month } })}>${ui.row(l, esc(v))}${dockMini('strategy', `${m.month}:${k}`)}</div>`
          : ui.row(l, '—')).join('')}</div>
        <p class="panel-note mt-8">소비자에게 보이는 문구는 컴플라이언스 탭에서 문구 심의를 거쳐요.</p>`
      : `<div class="empty-art">${icon('doc')}<span><b>전략 업데이트가 없어요</b><br>월간 분석 실행의 '요약 · 전략'을 돌리면 페르소나(최대 3개) · SWOT · 타깃 · 포지셔닝이 채워져요${m.aiReady ? '' : ' (OpenAI 키 필요)'}.</span></div>`;
    el.innerHTML = `
      <div class="filters">
        <div class="flex wrap">
          <button type="button" class="btn small ghost" data-act="month" data-month="${esc(shiftMonth(m.month, -1))}" aria-label="이전 달">‹</button>
          <strong class="ins-month">${esc(m.label)}</strong>
          <button type="button" class="btn small ghost" data-act="month" data-month="${esc(shiftMonth(m.month, 1))}" aria-label="다음 달"${m.month >= thisMonth ? ' disabled' : ''}>›</button>
          ${m.isPrevMonth ? badge('지난달 리뷰', 'blue') : ''}
        </div>
        <span class="small muted">매월 첫 주(1~7일)에는 지난달을 보여줘요.</span>
      </div>
      <div class="ins-mstack">
      <section class="card ins-msummary"><div class="card-head"><h2>이달의 요약</h2>${m.summary.length ? badge('AI 분석', 'purple') : ''}</div>${summary}</section>
      <div class="ins-mrow">
        <section class="card"><div class="card-head"><h2>고객 인사이트</h2>${aiBadge(m.insightsAi)}</div>${insights}</section>
        <section class="card ins-mcomp"><div class="card-head"><h2>경쟁 브랜드 동향</h2>${aiBadge(m.competitorAi)}</div>
          ${m.competitorTrends.length ? `<ul class="ins-ul">${m.competitorTrends.map((x, i) => `<li${dockable('trend', `${m.month}:${i}`, { title: `경쟁 브랜드 동향 · ${clip(x, 60)}`, text: x,
            href: '/dashboard/insights#monthly', data: { month: m.month } })}><span class="grow">${esc(x)}</span>${dockMini('trend', `${m.month}:${i}`)}</li>`).join('')}</ul>` : '<p class="small muted">아직 경쟁 브랜드 데이터가 없어요.</p>'}
          <a class="link mt-8" href="#market/brands">브랜드 비교 보기 ${icon('arrow')}</a></section>
      </div>
      ${prioritiesCard(m.priorities)}
      <section class="card"><div class="card-head"><h2>전략 업데이트</h2>${st ? badge('AI 분석', 'purple') : ''}</div>${strategy}</section>
      <details class="ins-fold ins-fold-h card ins-brief" data-fold="brief"${S.open.brief !== false ? ' open' : ''}><summary><h2>콘텐츠 브리프</h2>${badge('콘텐츠 탭에 넘김', 'lime')}</summary>
        <div class="ins-fold-body" data-ref="brief">${skel}</div></details>
      ${sourcesCard(m)}
      </div>`;
    fillPeeps(el);
    if (S.brief && S.brief.month === m.month) drawBrief(); else loadBrief(m.month);
  }

  /* ───────── 콘텐츠 브리프 (월간 리뷰 맨 아래 · 서버 brief.py) ─────────
     규칙이 고른 주제(최대 5개) → AI 문장 → 컴플라이언스 검사 → 사람이 [전체 승인] → 콘텐츠 탭에 공개
     지난 승인 문장을 이은 주제는 접어 둠 → 새 주제만 보면 됨 */
  const VERDICT = { PASS: ['걸린 표현 없음', 'green'], COND: ['걸린 표현 없음 (조건)', 'green'], REVIEW: ['검토 필요', 'orange'],
    REVISE: ['수정 필요', 'red'], BLOCK: ['사용 불가', 'red'] };
  async function loadBrief(month) {
    try { S.brief = await api('/api/insights/brief/draft' + (month ? `?month=${encodeURIComponent(month)}` : '')); }
    catch (e) { S.brief = { month, error: e.message }; }
    drawBrief();
  }

  function briefTheme(t) {
    const v = VERDICT[t.check.verdict];
    const hits = Object.values(t.check.hits || {}).flat();
    const by = t.carried ? badge('지난 승인 문장', 'blue') : t.by === 'AI' ? badge('AI 초안', 'purple') : t.by === '사람' ? badge('직접 고침') : badge('비어 있음', 'orange');
    const field = (k, label, val, ph) => `<label class="ins-brief-f"><span class="field-label">${label}</span>
      <input class="input" data-bf="${k}" value="${esc(val)}" placeholder="${esc(ph)}" maxlength="${k === 'avoid' ? 250 : 200}"></label>`;
    const open = t.carried ? S.open['brief-' + t.id] : S.open['brief-' + t.id] !== false;
    const drag = dockable('brief', `${S.brief ? S.brief.month : ''}:${t.id}`, { title: `콘텐츠 브리프 · ${t.theme}`,
      text: [t.angle && '콘텐츠 각도: ' + t.angle, t.say && '말할 방향: ' + t.say, (t.avoid || []).length && '피할 말: ' + t.avoid.join(', '), '근거: ' + t.evidence].filter(Boolean).join('\n'),
      href: '/dashboard/insights#monthly', data: { theme: t.theme, angle: t.angle, say: t.say, avoid: t.avoid || [], evidence: t.evidence, confidence: t.confidence } });
    return `<details class="ins-brief-t" data-brief-id="${esc(t.id)}" data-fold="brief-${esc(t.id)}"${open ? ' open' : ''}>
      <summary${drag}><input type="checkbox" data-bf="use"${t.use ? ' checked' : ''} aria-label="${esc(t.theme)} 공개">
        <b>${esc(t.theme)}</b> ${badge('신뢰도 ' + t.confidence, t.confidence === '높음' ? 'green' : '')} ${v ? badge(v[0], v[1]) : ''} ${by}
        <span class="small muted ins-brief-ev">${esc(t.evidence)}</span></summary>
      ${hits.length ? `<div class="note error">문구 심의에 걸린 말: ${esc(hits.join(', '))}</div>` : ''}${t.check.note ? `<div class="note warn">${esc(t.check.note)}</div>` : ''}
      ${field('angle', '콘텐츠 각도', t.angle, '예: 언제 · 어떻게 먹는지 한눈에 보여 주기')}
      ${field('say', '말할 방향', t.say, '예: 모임 전후 루틴, 가방 속 하나')}
      ${field('avoid', '피할 말 (쉼표로 구분 · 최대 3개)', (t.avoid || []).join(', '), '예: 맛있다고 단정')}
      <div class="mt-8">${dockBtn('brief', `${S.brief ? S.brief.month : ''}:${t.id}`)}</div>
    </details>`;
  }

  function drawBrief() {
    const el = $(panel('monthly'), '[data-ref="brief"]');
    const b = S.brief;
    if (!el || !b) return;
    if (b.error) { el.innerHTML = `<div class="note error">브리프를 불러오지 못했어요. ${esc(b.error)}</div>`; return; }
    const d = b.draft;
    const p = b.published;
    const pub = p
      ? `<p class="small">지금 공개 중: <b>${esc(p.month)}</b> 승인본 · ${esc(p.approvedBy)} · ${esc(fmt.date(p.approvedAt))} · 주제 ${esc(p.themes)}개</p>`
      : '<p class="small muted">아직 공개한 브리프가 없어요. 승인 전에는 콘텐츠 탭에 아무것도 넘어가지 않아요.</p>';
    const make = `<button type="button" class="btn small" data-act="brief-make">${icon('spark')}${d ? '초안 다시 만들기' : '초안 만들기'}</button>`;
    if (!d) {
      el.innerHTML = `<p class="small muted">리뷰 · 유튜브 질문을 주제로 묶어 콘텐츠 팀이 쓸 각도 · 말할 방향 · 피할 말을 만들어요. 매달 한 번 확인하고 [전체 승인]을 누르면 돼요.${b.aiReady ? '' : ' OpenAI 키가 없으면 빈 칸으로 만들어져 직접 써요.'}</p>
        ${pub}<div class="flex wrap mt-8">${make}</div>`;
      return;
    }
    el.innerHTML = `${pub}
      ${d.status === 'approved' ? `<div class="note lime">이 달 브리프는 승인됐어요 (${esc(d.approvedBy)}). 고친 뒤 다시 승인하면 공개본이 바뀌어요.</div>` : ''}
      <div class="ins-brief-list">${d.themes.map(briefTheme).join('') || '<p class="small muted">근거가 5건 이상인 주제가 없어요.</p>'}</div>
      <p class="panel-note mt-8">AI 초안 · 참고용 · 법적 승인 아님. 건수는 규칙 분류로 센 값이고, 소비자에게 보이는 문구는 콘텐츠 탭에서 다시 문구 심의를 거쳐요.</p>
      <div class="flex wrap mt-8">${make}<button type="button" class="btn small" data-act="brief-save">저장</button>
        <button type="button" class="btn small lime" data-act="brief-approve">${icon('check')}전체 승인</button></div>`;
  }

  function briefInputs() {
    return $$(S.root, '.ins-brief-t').map(box => {
      const v = k => { const i = $(box, `[data-bf="${k}"]`); return i ? (i.type === 'checkbox' ? i.checked : i.value) : ''; };
      return { id: box.dataset.briefId, angle: v('angle'), say: v('say'), use: v('use'),
        avoid: String(v('avoid')).split(',').map(x => x.trim()).filter(Boolean) };
    });
  }

  async function makeBrief(btn) {
    if (S.brief && S.brief.draft && !(await ui.confirm('지금 초안을 버리고 새로 만들어요. 지난 승인 문장이 있는 주제는 그대로 이어져요. 진행할까요?'))) return;
    ui.busy(btn, true);
    try {
      S.brief = await api('/api/insights/brief/draft', { month: S.brief ? S.brief.month : S.month });
      toast(S.brief.draft.ai ? '새 주제는 AI가 초안을 썼어요. 확인하고 승인하세요.' : '초안을 만들었어요. 빈 칸을 채우고 승인하세요.');
    } catch (e) { toast('초안을 만들지 못했어요: ' + e.message, 'error'); }
    ui.busy(btn, false);
    drawBrief();
  }

  async function saveBrief(btn, approve) {
    const month = S.brief.month;
    ui.busy(btn, true);
    try {
      S.brief = await api('/api/insights/brief/draft', { month, themes: briefInputs(), approve }, { method: 'PUT' });
      toast(approve ? '승인했어요. 콘텐츠 탭에 이 브리프가 넘어가요.' : '저장했어요. 고친 문장은 다시 심의했어요.');
      drawBrief();
    } catch (e) {
      toast((approve ? '승인하지 못했어요: ' : '저장하지 못했어요: ') + e.message, 'error');
      await loadBrief(month);   // 승인이 막혀도 고친 문장은 서버에 남아 있음 → 검사 결과를 다시 보여 줌
    }
  }

  /* ═════════ 시장 · 고객 · 데이터 관리: 화면 안 탭 ═════════ */
  function showSub(sub) {
    const tab = S.tab;
    S.subs[tab] = sub;
    const el = panel(tab);
    // 화면 안 탭은 각 화면이 질문 카드 아래에 그림 (pageTabs) — 왼쪽 하위 메뉴로 옮기지 않음
    if (!$(el, '[data-ref="data-body"]')) el.innerHTML = '<div data-ref="data-body"></div>';
    setHash(`${tab}/${sub}`);
    const need = NEEDS[sub].filter(k => !S.data[k]);
    if (!need.length) drawSub(sub);
    else need.forEach(k => loadData(k));
  }

  async function loadData(key, month) {
    const shows = () => SUBS[S.tab] && NEEDS[curSub()].includes(key);
    const body = curBody();
    if (body && shows() && !S.data[key]) body.innerHTML = skel;
    S.loading[key] = true;
    try {
      S.data[key] = await api(`/api/insights/data/${key}` + (month ? `?month=${encodeURIComponent(month)}` : ''));
    } catch (e) {
      if (curBody() && shows()) curBody().innerHTML = `<div class="note error">데이터를 불러오지 못했어요. ${esc(e.message)}</div>`;
      return;
    } finally {
      S.loading[key] = false;
    }
    if (shows() && NEEDS[curSub()].every(k => S.data[k])) drawSub(curSub());
  }

  function drawSub(sub) {
    const body = curBody();
    if (!body || curSub() !== sub || !NEEDS[sub].every(k => S.data[k])) return;
    const D = S.data;
    body.innerHTML = {
      changes: () => marketHtml('changes'), price: () => marketHtml('price'), brands: () => marketHtml('brands'),
      edit: () => editHtml(D.shelf), reviews: () => reviewsHtml(D.reviews), audience: () => audienceHtml(D.audience),
      accuracy: () => accuracyHtml(D.accuracy)
    }[sub]();
    if (sub === 'price') { fitSwarm(); initSwarm(); initPantryFlow(); drawPromo(); }
    if (sub === 'brands') focusBrand();
    if (sub === 'changes' && S.focusChg) {
      S.focusChg = false;
      const t = $(S.root, '[data-ref="chg"]');
      if (t) t.scrollIntoView({ block: 'start' });
    }
  }

  // 시장 · 고객 · 데이터 관리 화면 안 탭: 질문 카드 바로 아래. 컴플라이언스처럼 왼쪽 메뉴로 옮기지 않음 (data-subnav="off")
  function pageTabs(tab, sub) {
    return `<div class="ins-ptabs"><div class="linetabs ins-ptabs-in" role="tablist" data-subnav="off" aria-label="${esc((TABS.find(t => t[0] === tab) || [])[1] || tab)} 보기">${SUBS[tab].map(([k, l]) =>
      `<button type="button" role="tab" data-sub="${k}" aria-selected="${sub === k}">${esc(l)}</button>`).join('')}</div></div>`;
  }

  // 화면 맨 위 요약 카드: 한 줄 요약 · 오른쪽 배지/버튼(extra) · 아래 HTML(more, 예: 시장 요약 숫자 칸)
  // oneLine 없이 more만 주면 요약 줄은 생략, 보여 줄 것이 하나도 없으면 카드를 그리지 않음 (질문 제목은 2026-10-26 뺌)
  function qHead(sub, oneLine, extra, more) {
    const line = oneLine ? esc(oneLine) : more ? '' : '<span class="muted">아직 모은 데이터가 없어요. 오른쪽 위 최신 데이터 받기를 눌러 시작하세요.</span>';
    const body = (more || '').trim();
    if (!line && !extra && !body) return '';
    return `<section class="card ins-q">
      ${line || extra ? `<div class="between"><p class="ins-oneline">${line}</p>${extra ? `<div class="flex wrap">${extra}</div>` : ''}</div>` : ''}
      ${body}
    </section>`;
  }

  function fold(id, title, inner) {
    return `<details class="ins-fold card mt-24" data-fold="${id}"${S.open[id] ? ' open' : ''}><summary>${esc(title)}</summary><div class="ins-fold-body">${inner}</div></details>`;
  }

  /* 진열대 */
  function findShelf(id) { return ((S.data.shelf || {}).items || []).find(x => String(x.id) === String(id)); }

  function changeBadge(c) {
    if (!c) return '';
    if (c.new) return badge('신규', 'blue');
    if (c.pricePct != null && Math.abs(c.pricePct) >= 10) return badge(`가격 ${fmt.signed(c.pricePct, 0, '%')}`, c.pricePct < 0 ? 'red' : 'orange');
    return '';
  }



  // 요약 숫자 3개: 최저 · 중앙값 · 자사 (1회분 단가)
  function shelfSummary(priced) {
    const vals = priced.map(x => x.perServing).sort((a, b) => a - b);
    const n = vals.length;
    const median = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    const low = priced.reduce((a, b) => (b.perServing < a.perServing ? b : a));
    const own = priced.filter(x => x.own).sort((a, b) => a.perServing - b.perServing)[0];
    let ownSub = '진열대에서 아직 찾지 못했어요';
    if (own) {
      const gap = own.perServing - median;
      ownSub = Math.abs(gap) < 0.005 ? '보통 가격과 같아요' : `보통 가격보다 ${money(Math.abs(gap))} ${gap > 0 ? '비싸요' : '저렴해요'}`;
    }
    // 최저 ~ 최고 사이 알디콤 위치 막대 (세로 눈금 = 보통 가격)
    const at = v => (vals[n - 1] > vals[0] ? (v - vals[0]) / (vals[n - 1] - vals[0]) * 100 : 50).toFixed(1);
    const gauge = own ? `<div class="ins-gauge" title="왼쪽 끝 최저 ${esc(money(vals[0]))} · 오른쪽 끝 최고 ${esc(money(vals[n - 1]))} · 세로 눈금 보통 가격">
      <u style="left:${at(median)}%"></u><i style="left:${at(own.perServing)}%"></i></div>` : '';
    const drag = dockable('price', 'summary-' + REBOOT.today(), { title: `1회분 단가 요약 (${REBOOT.today()})`,
      text: `최저 ${money(low.perServing)} (${low.brand}) · 보통 ${money(median)} (${n}개 기준) · 알디콤 ${own ? money(own.perServing) : '—'} (${ownSub})`,
      href: '/dashboard/insights#market/price', data: { min: low.perServing, minBrand: low.brand, median, products: n, own: own ? own.perServing : null } });
    // REBOOT (출시 전 · 사양서 가격) — 알디콤과 따로 · 순위 · 보통 가격 계산에는 안 넣음
    const rb = S.data.shelf && S.data.shelf.reboot;
    const rbStat = rb && rb.perUnit != null ? `<div class="ins-stat" title="${esc(rb.basis)}"><span>REBOOT 1개 · 1병당 ${badge('예시', 'orange')}</span>
      <b>${esc(money(rb.perUnit))}${rb.maxUnit > rb.perUnit ? `<small class="ins-sub"> ~ ${esc(money(rb.maxUnit))}</small>` : ''}</b><small>출시 전 · 사양서 가격 · 순위에 안 넣음</small></div>` : '';
    return `<div class="ins-stats${rbStat ? '' : ' three'}"${drag}>
      <div class="ins-stat"><span>최저 1회분</span><b>${esc(money(low.perServing))}</b><small>${esc(low.brand)}</small></div>
      <div class="ins-stat"><span>보통 가격 ${infoTip(TIP.median)}</span><b>${esc(money(median))}</b><small>${n}개 기준</small></div>
      <div class="ins-stat${own ? ' own-soft' : ' red'}"><span>알디콤 1회분</span><b>${own ? esc(money(own.perServing)) : '—'}</b><small>${esc(ownSub)}</small>${own ? gauge : ''}</div>
      ${rbStat}
    </div>`;
  }

  // 가격 축 벌떼 차트: 점 하나 = 상품 하나, 크기 = 리뷰 수, 누르면 상세
  // 첫 화면에 $0~SWARM_FULL이 꽉 차게 — 상자 폭을 재서 $1 폭(px)을 정하고(fitSwarm), 더 비싼 상품은 가로 스크롤로 봐요
  const SWARM_PX = 64, SWARM_FULL = 8, SWARM_PL = 28;
  function shelfStrip(priced) {
    S.swarm = { priced, px: SWARM_PX, zoom: 1 };
    S.swarmInfo = Object.fromEntries(priced.map(x => [x.id, x]));   // 말풍선(swarmTip)용
    // 말풍선은 스크롤 상자 밖(ins-sw-wrap)에 두어 상자 가장자리에서 잘리지 않게
    return `<div class="ins-sw-wrap"><div class="ins-sw-zoom" role="group" aria-label="차트 확대">
        <button type="button" data-act="sw-zoom" data-z="out" aria-label="축소">−</button><span data-ref="sw-z" aria-live="polite">1×</span>
        <button type="button" data-act="sw-zoom" data-z="in" aria-label="확대">+</button><button type="button" data-act="sw-zoom" data-z="fit">전체</button></div>
      <div class="ins-sw-scroll" data-ref="swarm">${swarmSvg(priced, SWARM_PX)}</div><div class="ins-sw-tip" role="tooltip" hidden></div></div>
      <div class="ins-sw-key small">
        <div class="ins-sw-key-g"><span class="ins-sw-key-h">색상</span>${formLegend(priced.map(formOf))}<span><i class="ins-lg own"></i>알디콤</span>
          <span><i class="ins-lg watched"></i>주시</span><span><i class="ins-lg oos"></i>품절</span><span title="중앙값"><i class="ins-lg med"></i>보통 가격</span></div>
        <div class="ins-sw-key-g"><span class="ins-sw-key-h">크기</span><span class="ins-sw-key-size" aria-hidden="true"><i></i><i></i><i></i></span><span>리뷰 많을수록 크게</span></div>
        <div class="ins-sw-key-g"><span class="ins-sw-key-h">사용법</span><span>휠로 확대 · 끌어서 이동 · 두 손가락으로 확대 · 빈 곳 두 번 누르면 2배 · 점에 올리면(터치는 한 번) 미리보기, 누르면 상세</span></div>
      </div>`;
  }
  // 화면에 붙은 뒤 상자 폭에 맞춰 다시 그림 (창 크기가 바뀔 때도)
  // 확대(zoom)는 1~8배: 상자 폭에 맞춘 $1 폭 × zoom. 확대 중에는 anchorX(화면 x)에 있던 가격이 그 자리에 남게 스크롤을 맞춤
  // 1배(처음 · 창 크기 변경 · '전체')는 항상 맨 앞($0)부터
  const SWARM_ZMAX = 8;
  function fitSwarm(anchorX) {
    const box = $(panel(S.tab), '[data-ref="swarm"]');
    if (!box || !box.clientWidth || !S.swarm) return;
    const zoom = S.swarm.zoom || 1;
    const px = Math.max(40, (box.clientWidth - SWARM_PL - 18) / SWARM_FULL) * zoom;
    if (Math.abs(px - S.swarm.px) < 1) return;
    const r = box.getBoundingClientRect(), ax = (anchorX == null ? r.left + r.width / 2 : anchorX) - r.left;
    const v = (box.scrollLeft + ax - SWARM_PL) / S.swarm.px;
    S.swarm.px = px;
    box.innerHTML = swarmSvg(S.swarm.priced, px);
    box.scrollLeft = zoom <= 1 ? 0 : SWARM_PL + v * px - ax;
    const wrap = box.parentNode, z = $(wrap, '[data-ref="sw-z"]'), tip = $(wrap, '.ins-sw-tip');
    if (z) z.textContent = `${Math.round(S.swarm.zoom * 10) / 10}×`;
    if (tip) tip.hidden = true;
  }
  function zoomSwarm(z, anchorX) {
    if (!S.swarm) return;
    S.swarm.zoom = Math.max(1, Math.min(SWARM_ZMAX, z));
    fitSwarm(anchorX);
  }
  // 차트 손 조작: 마우스 끌기(+관성) · 휠 줌(마우스 자리 중심) · 두 손가락 벌리기 · 빈 곳 두 번 누르기 · 터치는 점 한 번 = 미리보기
  // 휠: 1배에서 아래로 · 8배에서 위로는 막지 않음(페이지 스크롤), 좌우 휠 · Shift+휠은 좌우 이동. 한 손가락 끌기는 브라우저 기본 가로 스크롤
  function initSwarm() {
    const box = $(panel(S.tab), '[data-ref="swarm"]');
    if (!box || box._sw) return;
    box._sw = true;
    let drag = null, dragged = false, raf = 0, ptype = 'mouse', pinch = null, wheelZ = null;
    box.addEventListener('wheel', e => {
      if (!e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) return;
      const dy = e.deltaMode ? e.deltaY * 40 : e.deltaY, cur = wheelZ != null ? wheelZ : S.swarm.zoom;
      if (!e.ctrlKey && ((dy > 0 && cur <= 1) || (dy < 0 && cur >= SWARM_ZMAX))) return;
      e.preventDefault();
      // 트랙패드 벌리기(ctrlKey)는 작은 값이 자주 와서 더 민감하게, 마우스 휠은 한 칸에 약 1.3배
      wheelZ = Math.max(1, Math.min(SWARM_ZMAX, cur * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025))));
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; zoomSwarm(wheelZ, e.clientX); wheelZ = null; });
    }, { passive: false });
    box.addEventListener('pointerdown', e => {
      ptype = e.pointerType;
      if (e.pointerType !== 'mouse' || e.button) return;
      cancelAnimationFrame(raf); raf = 0;
      drag = { x: e.clientX, s: box.scrollLeft, lx: e.clientX, lt: performance.now(), v: 0, id: e.pointerId };
      dragged = false;
    });
    box.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!dragged && Math.abs(dx) > 4) { dragged = true; box.classList.add('drag'); box.setPointerCapture(drag.id); }
      if (!dragged) return;
      box.scrollLeft = drag.s - dx;
      const now = performance.now(), dt = now - drag.lt;
      if (dt > 0) drag.v = 0.8 * drag.v + 0.2 * ((e.clientX - drag.lx) / dt);
      drag.lx = e.clientX; drag.lt = now;
    });
    const end = () => {
      if (!drag) return;
      box.classList.remove('drag');
      let v = performance.now() - drag.lt > 80 ? 0 : drag.v, prev = performance.now();
      drag = null;
      if (!dragged || Math.abs(v) < 0.05) return;
      const step = now => {
        const dt = Math.min(32, now - prev); prev = now;
        box.scrollLeft -= v * dt;
        v *= Math.pow(0.94, dt / 16);
        raf = Math.abs(v) > 0.02 && box.isConnected ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    // 끈 뒤의 클릭은 상세 창을 열지 않음 · 터치는 처음 누른 점은 미리보기만 (root 클릭 처리보다 먼저)
    box.addEventListener('click', e => {
      const dot = e.target.closest('.ins-dot[data-tip]');
      if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); return; }
      if (!dot || ptype === 'mouse') return;
      if (S.swarmTapped !== dot.dataset.tip) {
        S.swarmTapped = dot.dataset.tip;
        e.stopPropagation(); e.preventDefault();
        swarmTip({ target: dot });
      }
    }, true);
    box.addEventListener('dblclick', e => {
      if (e.target.closest('.ins-dot')) return;
      zoomSwarm(S.swarm.zoom >= SWARM_ZMAX ? 1 : S.swarm.zoom * 2, e.clientX);
    });
    // 두 손가락 벌리기 (터치): 두 손가락 사이 가운데를 기준으로
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    box.addEventListener('touchstart', e => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: S.swarm.zoom };
    }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const mid = (e.touches[0].clientX + e.touches[1].clientX) / 2, z = pinch.z * dist(e.touches) / pinch.d;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; zoomSwarm(z, mid); });
    }, { passive: false });
    box.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });
  }
  function swarmSvg(priced, px) {
    const PL = SWARM_PL, PR = 44, head = 44, gapY = 14, maxOff = 72;
    const vmax = Math.max(...priced.map(x => x.perServing));
    const end = Math.max(SWARM_FULL, Math.ceil(vmax + 0.5));
    const W = Math.round(PL + end * px + PR);
    const X = v => PL + v * px;
    // 겹치지 않게 위아래로 비켜 쌓기 (큰 점부터 가운데에)
    const maxRev = Math.max(1, ...priced.map(x => x.reviews || 0));
    const placed = [];
    priced.slice().sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).forEach(x => {
      const r = 4 + 6 * Math.sqrt((x.reviews || 0) / maxRev);
      const cx = X(x.perServing);
      const near = placed.filter(p => Math.abs(p.cx - cx) < p.r + r + 1);
      const fits = o => near.every(p => Math.hypot(p.cx - cx, p.off - o) >= p.r + r + 1);
      let off = 0;
      for (let k = 0; k <= maxOff; k++) {
        if (fits(k)) { off = k; break; }
        if (fits(-k)) { off = -k; break; }
        off = k;   // 끝까지 자리가 없으면 맨 끝에 겹쳐 둠
      }
      placed.push({ x, r, cx, off });
    });
    const ext = Math.max(16, ...placed.map(p => Math.abs(p.off) + p.r));
    const mid = head + gapY + ext, axisY = mid + ext + gapY, H = axisY + 26;
    // 가격 구간 배경 + 구간 이름
    const bands = [[0, 3, 'low'], [3, 6, 'mid'], [6, end, 'high']].map(([a, b, k], i) => {
      const count = priced.filter(x => x.bucket === k).length;
      return `<rect class="ins-sw-band ${k}" x="${X(a)}" y="${head}" width="${X(b) - X(a)}" height="${axisY - head}"></rect>
        <text class="ins-sw-band-t" x="${X(a) + 10}" y="${head - 10}"><tspan class="ins-sw-band-n">${esc(BUCKETS[i][1])}</tspan> ${count}개</text>`;
    }).join('');
    // 눈금: $20까지는 $1마다, 그 위로는 $5마다
    const ticks = [];
    for (let v = 0; v <= end; v++) if (v <= 20 || v % 5 === 0) ticks.push(v);
    // 점선 격자 없이 가격대 바탕색으로 나눔 — 눈금은 아래 글자만
    const grid = ticks.map(v => `<text class="ins-sw-tick" x="${X(v).toFixed(1)}" y="${axisY + 18}" text-anchor="middle">$${v}</text>`).join('');
    // 보통 가격(중앙값) 선
    const vals = priced.map(x => x.perServing).sort((a, b) => a - b), n = vals.length;
    const median = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    const medLine = `<line class="ins-sw-med" x1="${X(median)}" x2="${X(median)}" y1="${head + 4}" y2="${axisY}"></line>
      <text class="ins-sw-med-t" x="${X(median) + 5}" y="${head + 14}">보통 ${esc(money(median))}</text>`;
    const dots = placed.slice().sort((a, b) => (a.x.own - b.x.own) || (b.r - a.r)).map(({ x, r, cx, off }) => {
      const cls = ['ins-dot', `f-${formOf(x)}`, x.own ? 'own' : '', x.watched ? 'watched' : '', x.in_stock === false ? 'oos' : ''].filter(Boolean).join(' ');
      return `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${(mid + off).toFixed(1)}" r="${r.toFixed(1)}" data-act="prod" data-id="${esc(x.id)}" data-tip="${esc(x.id)}"></circle>`;
    }).join('');
    // 알디콤 기둥: 점에서 가격 축까지 (가격 위치를 바로 읽게)
    const pillars = placed.filter(p => p.x.own).map(({ cx, off, r }) =>
      `<line class="ins-sw-pillar" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${(mid + off + r).toFixed(1)}" y2="${axisY}"></line>`).join('');
    // 자사 이름표: 점 위 말풍선 (마우스는 통과 — 아래 깔린 같은 가격대 점도 올리고 누를 수 있게)
    const tags = placed.filter(p => p.x.own).map(({ x, r, cx, off }) => {
      const t = `알디콤 ${money(x.perServing)}`, w = t.length * 6.6 + 14, y = mid + off - r - 8;
      return `<g class="ins-sw-own" aria-hidden="true"><rect x="${(cx - w / 2).toFixed(1)}" y="${(y - 16).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="9"></rect>
        <text x="${cx.toFixed(1)}" y="${(y - 3.5).toFixed(1)}" text-anchor="middle">${esc(t)}</text></g>`;
    }).join('');
    return `<div class="ins-sw-in" style="width:${W}px">
        <svg class="ins-sw-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="1회분 단가 분포: 점 하나가 제품 하나, 점이 클수록 리뷰가 많아요">
          ${bands}${grid}<line class="ins-sw-axis" x1="${PL}" x2="${W - PR / 2}" y1="${axisY}" y2="${axisY}"></line>${medLine}${pillars}${dots}${tags}</svg></div>`;
  }
  // 점에 마우스를 올리면 말풍선: 1줄 브랜드 · 1회분 가격 / 2줄 제품명(최대 2줄) / 3줄 판매처 · 별점 · 리뷰
  // 보이는 영역 안으로 맞추고, 점 위에 자리가 없을 때만 아래로
  function swarmTip(e) {
    const dot = e.target.closest && e.target.closest('.ins-dot[data-tip]');
    const wrap = e.target.closest && e.target.closest('.ins-sw-wrap');
    const tip = wrap && $(wrap, '.ins-sw-tip');
    if (!tip) return;
    const x = dot && (S.swarmInfo || {})[dot.dataset.tip];
    if (!x) { tip.hidden = true; return; }
    const sub = [x.sourceLabel, x.rating != null ? `★ ${x.rating}` : '', x.reviews != null ? `리뷰 ${fmt.num(x.reviews)}` : ''].filter(Boolean).join(' · ');
    tip.innerHTML = `<span class="ins-sw-tip-h"><b>${esc(x.brand || '브랜드 모름')}${x.own ? ' · 알디콤' : ''}</b>
        <span class="ins-sw-tip-p"><b>${esc(money(x.perServing))}</b> / 1회분</span></span>
      <span class="ins-sw-tip-t">${esc(x.title)}</span>
      ${sub || x.in_stock === false ? `<small>${esc(sub)}${x.in_stock === false ? `${sub ? ' · ' : ''}<em>품절</em>` : ''}</small>` : ''}`;
    tip.hidden = false;
    const d = dot.getBoundingClientRect(), b = wrap.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight, gap = 8;
    const cx = d.left + d.width / 2 - b.left;
    tip.style.left = `${Math.max(4, Math.min(b.width - w - 4, cx - w / 2))}px`;
    tip.style.top = `${d.top - h - gap < 4 ? d.bottom - b.top + gap : d.top - b.top - h - gap}px`;
  }

  // 묶음 할인: 큰 용량 1회분이 작은 용량보다 몇 % 싼지 (같은 제품 안 비교)
  function bulkText(b) {
    if (!b) return '—';
    if (b.suspect) return '회분 확인 필요';
    if (Math.abs(b.pct) < 1) return '차이 없음';
    return b.pct < 0 ? `${Math.round(-b.pct)}% 저렴` : `${Math.round(b.pct)}% 비쌈`;
  }

  function lineEdit(x, forms) {
    const ln = x.line || {};
    const ko = l => ((/\(([^)]*)\)/.exec(l) || [])[1] || l);   // 'Pellet (환)' → '환'
    const opts = forms.map(([k, l]) => `<option value="${esc(k)}"${ln.edited && ln.form === k ? ' selected' : ''}>${esc(ko(l))}</option>`).join('');
    return `<input class="input ins-line-in" data-line="brand" data-key="${esc(x.key)}" value="${ln.edited ? esc(ln.brand) : ''}" placeholder="${esc(ln.brand || '')}" aria-label="브랜드 (묶음)">
      <select class="input ins-sel" data-line="form" data-key="${esc(x.key)}" aria-label="제형 (묶음)"><option value="">자동 (${esc(ko((forms.find(f => f[0] === ln.form) || ['', ln.form || ''])[1]))})</option>${opts}</select>
      <small class="ins-sub">${esc(ln.label || '')} · ${ln.confirmed ? `확인됨${ln.checkedBy ? ' · ' + esc(ln.checkedBy) : ''}` : '<b class="ins-warn">확인 필요</b>'}</small>`;
  }

  function shelfRow(x, d) {
    return `<tr>
    <td>${esc(x.sourceLabel)}${x.position ? `<small class="ins-sub">${esc(x.position)}위</small>` : ''}</td>
    <td class="ins-title-cell">${x.own ? badge('알디콤', 'green') + ' ' : ''}${esc(x.title)}<small class="ins-sub">${esc(x.brand)}${x.brandGuessed ? ' (브랜드 추정)' : ''}${x.editedBy ? ` · 수정 ${esc(x.editedBy)}` : ''}</small></td>
    <td class="ins-line-cell">${lineEdit(x, d.forms || [])}</td>
    <td><input class="input ins-num" type="number" min="0" step="0.01" data-edit="price" data-id="${esc(x.id)}" value="${x.price == null ? '' : esc(x.price)}" aria-label="가격 (달러)"></td>
    <td><input class="input ins-num" type="number" min="1" max="500" data-edit="servings" data-key="${esc(x.key)}" value="${x.servingsSource === 'manual' ? esc(x.servings) : ''}" placeholder="${esc(x.servings)}" aria-label="회분 수">
      <small class="ins-sub">${esc(SERVING_SRC[x.servingsSource])}${x.servingsRule && x.servingsSource === 'parsed' ? ` · ${esc(x.servingsRule)}` : ''}</small></td>
    <td class="num">${esc(money(x.perServing))}</td>
    <td><select class="input ins-sel" data-edit="in_stock" data-id="${esc(x.id)}" aria-label="재고">
      <option value="true"${x.in_stock === true ? ' selected' : ''}>재고 있음</option><option value="false"${x.in_stock === false ? ' selected' : ''}>품절</option><option value=""${x.in_stock == null ? ' selected' : ''}>모름</option></select></td>
    <td><label class="check"><input type="checkbox" data-edit="own" data-id="${esc(x.id)}"${x.own ? ' checked' : ''}>알디콤</label></td>
    <td>${changeBadge(x.change) || '<span class="muted">—</span>'}</td>
    <td>${extLink(x.link)}</td></tr>`;
  }

  // 표로 보기: 검색(상품명 · 브랜드 · 판매처) + 한 페이지 TABLE_PAGE개 — 검색창은 그대로 두고 표만 다시 그림
  const TABLE_PAGE = 5;
  // 할 일 배지로 거르기: 회분을 못 읽은 행 · 묶음을 아직 확인 안 한 행
  const TBL_TODO = { serv: x => x.servingsSource === 'default', line: x => x.line && !x.line.confirmed };
  function shelfTable(d) {
    const q = S.tbl.q.trim().toLowerCase();
    const base = TBL_TODO[S.tbl.f] ? d.items.filter(TBL_TODO[S.tbl.f]) : d.items;
    const list = q ? base.filter(x => `${x.title} ${x.brand} ${x.sourceLabel}`.toLowerCase().includes(q)) : base;
    const pages = Math.max(1, Math.ceil(list.length / TABLE_PAGE));
    S.tbl.page = Math.min(Math.max(1, S.tbl.page), pages);
    const cur = S.tbl.page;
    const shown = list.slice((cur - 1) * TABLE_PAGE, cur * TABLE_PAGE);
    if (!shown.length) return `<p class="small muted">${q ? `'${esc(S.tbl.q.trim())}'에 맞는 제품이 없어요.` : base !== d.items ? '이 항목은 모두 처리했어요.' : '아직 받은 제품이 없어요. 위 최신 데이터 받기를 눌러 시작하세요.'}</p>`;
    const pager = compPager(cur, pages, list.length, (cur - 1) * TABLE_PAGE + 1, (cur - 1) * TABLE_PAGE + shown.length, 'tbl-page', '표 페이지');
    return `${q ? `<p class="small muted mb-8">검색 결과 ${list.length}개 (전체 ${d.items.length}개)</p>` : ''}
      <div class="table-wrap"><table class="data-table ins-table"><thead><tr><th>판매처</th><th>제품</th><th>묶음 (브랜드 · 제형)</th><th>가격 ($)</th><th>회분</th><th class="num">1회분</th><th>재고</th><th>알디콤</th><th>변화</th><th></th></tr></thead><tbody>${shown.map(x => shelfRow(x, d)).join('')}</tbody></table></div>${pager}`;
  }
  function drawShelfTable() {
    const box = $(panel(S.tab), '[data-ref="tbl-body"]');
    if (box && S.data.shelf) box.innerHTML = shelfTable(S.data.shelf);
  }

  // 데이터 관리 › 진열대 수집 · 고치기: 판매처별 수집 · 묶음 확인 · 표에서 바로 고치기 (시장 화면 숫자의 원본)
  // 수량 표시 규칙: 총 개수는 제목 옆 작은 글씨, 처리할 일은 0보다 클 때만 배지(누르면 그 행만), 0이면 숨김
  function editHtml(d) {
    const todo = [['serv', '회분 입력'], ['line', '묶음 확인']].map(([f, l]) => [f, l, d.items.filter(TBL_TODO[f]).length]).filter(t => t[2]);
    if (!todo.some(t => t[0] === S.tbl.f)) S.tbl.f = '';
    const chips = todo.map(([f, l, n]) => `<button type="button" class="badge orange ins-todo" data-act="tbl-todo" data-f="${f}" aria-pressed="${S.tbl.f === f}" title="${S.tbl.f === f ? '다시 누르면 전체 보기' : `${l}할 제품만 보기`}">${esc(l)} ${n}</button>`).join('');
    return qHead('edit', '', '', d.items.length ? ' ' : '') + pageTabs('manage', 'edit') + runStatus() + fold('edit-shelf', `진열대 제품${d.items.length ? ` · ${d.items.length}개` : ''}`, `
      ${chips ? `<div class="flex wrap mb-16">${chips}</div>` : ''}
      <div class="flex wrap mb-16">
        <button type="button" class="btn small" data-act="ins-update-only" data-items="weee">${icon('refresh')}Weee! 최신 데이터 받기</button>
        <button type="button" class="btn small" data-act="ins-update-only" data-items="amazon">${icon('refresh')}Amazon 최신 데이터 받기</button>
        ${d.weeeRaw.length ? `<button type="button" class="btn small ghost" data-act="weee-raw">${icon('doc')}Weee! 원문 보기</button>` : ''}
        ${d.items.length ? `<button type="button" class="btn small" data-act="lines-confirm">${icon('check')}묶음 모두 확인</button>` : ''}
        <span class="small muted">회분 · 가격 · 재고 · 알디콤 · 묶음은 바로 고칠 수 있어요. 회분 수와 묶음은 한 번 고치면 모든 주차에 적용돼요.</span>
      </div>
      ${d.items.length ? `<input class="input ins-tbl-q mb-8" type="search" data-ref="tbl-q" value="${esc(S.tbl.q)}" placeholder="제품명 · 브랜드 · 판매처 검색" aria-label="표 검색">` : ''}
      <div data-ref="tbl-body">${shelfTable(d)}</div>`);
  }

  // 보기 바꾸기 버튼 줄 (진열대 · 구매자 리뷰 공통) — 질문 카드와 내용 사이, 왼쪽 끝 한 줄 · 크기 · 간격 같게
  // items: [[값, 이름, 개수(없으면 생략)]]
  function viewSeg(act, items, cur, label) {
    return `<div class="ins-view-bar"><div class="linetabs" role="group" aria-label="${esc(label)}">${items.map(([k, l, n]) =>
      `<button type="button" data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${esc(l)}${n == null ? '' : ` <span class="n">${esc(n)}</span>`}</button>`).join('')}</div></div>`;
  }

  /* 선반 보기 (커버플로우, 2026-10-26): 1회분 싼 순서로 한 줄 · 처음엔 REBOOT가 가운데 · 가격대 버튼으로 거름
     같은 제품(라인)은 판매처가 여러 곳이어도 한 번만 (가장 싼 쪽) */
  const PANTRY_SHELVES = [['low', '저렴한 편', '1회분 $3 미만', '$3 미만'], ['mid', '보통', '1회분 $3~6', '$3–6'], ['high', '비싼 편', '1회분 $6 이상', '$6 이상']];
  // 제형 선 아이콘 (24 × 24, 글자색을 따라감) — 분말은 가루 더미
  const FORM_ICON = {
    // 액상 · 분말 · 젤리: 사용자가 준 200칸 그림을 24칸 틀에 맞춤 (scale .12, 선 굵기 비율 그대로)
    liquid: '<g transform="scale(.12)"><rect x="66" y="14" width="68" height="40" rx="10" stroke-width="7.5"/><path d="M76 54v12c0 8-24 16-24 34v76c0 7 5 12 12 12h72c7 0 12-5 12-12V100c0-18-24-26-24-34V54" stroke-width="7.5"/><path d="M52 118h96M52 160h96" stroke-width="6.5"/><path d="M106 124L89 143h12l-6 15 17-20h-12z" stroke-width="5.5"/></g>',
    tablet: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    pellet: '<circle cx="8" cy="15.5" r="3.5"/><circle cx="16" cy="15.5" r="3.5"/><circle cx="12" cy="8" r="3.5"/>',
    powder: '<g transform="scale(.12)"><path d="M26 160C30 150 62 124 98 122c38 0 68 24 76 36 4 8-6 14-74 14-66 0-78-4-74-12z" stroke-width="7.5"/><circle class="dot" cx="52" cy="160" r="3"/><circle class="dot" cx="66" cy="152" r="3.2"/><circle class="dot" cx="80" cy="160" r="3"/><circle class="dot" cx="94" cy="150" r="3.4"/><circle class="dot" cx="108" cy="160" r="3"/><circle class="dot" cx="122" cy="151" r="3.2"/><circle class="dot" cx="136" cy="160" r="3"/><circle class="dot" cx="150" cy="153" r="3"/><circle class="dot" cx="160" cy="162" r="2.6"/><circle class="dot" cx="40" cy="164" r="2.4"/><circle class="dot" cx="74" cy="140" r="3"/><circle class="dot" cx="88" cy="134" r="2.6"/><circle class="dot" cx="102" cy="138" r="3.2"/><circle class="dot" cx="116" cy="140" r="2.8"/><circle class="dot" cx="130" cy="140" r="3"/><circle class="dot" cx="144" cy="146" r="2.6"/><circle class="dot" cx="60" cy="142" r="2.4"/><circle class="dot" cx="96" cy="164" r="2.4"/><circle class="dot" cx="124" cy="166" r="2.4"/><circle class="dot" cx="110" cy="128" r="2.4"/><circle class="dot" cx="86" cy="112" r="3.4"/><circle class="dot" cx="118" cy="108" r="3.8"/><circle class="dot" cx="100" cy="96" r="3"/><circle class="dot" cx="134" cy="96" r="2.6"/><circle class="dot" cx="76" cy="96" r="2.4"/><circle class="dot" cx="112" cy="84" r="3.6"/><circle class="dot" cx="90" cy="80" r="2.2"/><circle class="dot" cx="128" cy="78" r="2.4"/><circle class="dot" cx="104" cy="66" r="2.2"/><circle class="dot" cx="144" cy="108" r="2"/><circle class="dot" cx="68" cy="112" r="2"/><circle class="dot" cx="120" cy="60" r="1.8"/><circle class="dot" cx="96" cy="50" r="2"/><circle class="dot" cx="138" cy="62" r="1.6"/><circle class="dot" cx="82" cy="64" r="1.6"/><circle class="dot" cx="110" cy="42" r="1.6"/><circle class="dot" cx="150" cy="88" r="1.6"/></g>',
    stick: '<rect x="9" y="2" width="6" height="20" rx="1.5"/><path d="M9 6.5h6"/><path d="M11 2v4.5"/>',
    gummy: '<g transform="scale(.12)"><path d="M58 68C58 55 142 55 142 68l14 68c2 12-14 20-30 14-12 8-40 8-52 0-16 6-32-2-30-14z" stroke-width="7.5"/><path d="M58 68c14 8 32 8 42 2 10 6 28 6 42-2" stroke-width="6.5"/><path d="M76 74l-2 76M124 74l2 76" stroke-width="6"/></g>',
    other: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  };
  const formIcon = f => `<svg class="ins-pc-ico" viewBox="0 0 24 24" aria-hidden="true">${FORM_ICON[f] || FORM_ICON.other}</svg>`;
  // 제형 이름 · 늘 이 순서로 보여 줌 (lines.py FORM_SHORT와 같은 이름) — 한 제형 안의 다른 이름은 '/', 서로 다른 제형은 ' · '
  const FORM_KO = { liquid: '액상', powder: '분말', stick: '스틱', gummy: '젤리/구미', pellet: '환', tablet: '캡슐/정제', other: '기타' };
  const FORM_ORDER = Object.keys(FORM_KO);
  const formRank = f => { const i = FORM_ORDER.indexOf(f); return i < 0 ? FORM_ORDER.length : i; };
  // 제형 색 범례 (진열대 · 단가 차트 공통) — 지금 보이는 제형만, 늘 같은 순서
  const formLegend = forms => FORM_ORDER.filter(f => f !== 'other' && forms.includes(f))
    .map(f => `<span class="f-${f}"><i class="ins-lg form"></i>${esc(FORM_KO[f])}</span>`).join('');
  const formOf = x => (x.line && x.line.form) || 'other';

  // 1회분 비교에 넣어도 되는 상품: 회분을 못 읽어 1개 = 1회로 놓은 것(default)은 뺌 (브랜드 비교 competitors.py와 같은 기준)
  // 예) 'Hovenia Drink Extract 870 g' $87.99 → 1회분 $87.99로 보이던 문제
  const knownPs = x => x.perServing != null && x.servingsSource !== 'default';

  function pantryLines(d) {
    const by = {};
    d.items.forEach(x => { const id = (x.line && x.line.id) || x.key; (by[id] = by[id] || []).push(x); });
    return Object.values(by).map(its => {
      const priced = its.filter(knownPs);
      const rep = priced.length ? priced.reduce((a, b) => (b.perServing < a.perServing ? b : a)) : its[0];
      const states = its.map(x => stockState(x, d.lowStock));
      const state = states.every(s => s === 'oos') ? 'oos' : states.includes('low') ? 'low' : states.includes('in') ? 'in' : 'unknown';
      const pct = its.map(x => x.change && x.change.pricePct).filter(v => v != null && Math.abs(v) >= 10);
      return { rep, its, state, own: its.some(x => x.own), watched: its.some(x => x.watched), pricePct: pct.length ? pct[0] : null,
        reviews: its.reduce((n, x) => n + (x.reviews || 0), 0), form: (rep.line && rep.line.form) || 'other' };
    });
  }

  // 타일 한 장 = 제품 하나: 제형 아이콘 + 상태 배지만 (Cover Flow의 앨범 아트처럼). 글자 정보는 data-*에 담아 가운데 아래 캡션이 읽음
  function pantryTile(p) {
    const x = p.rep;
    const flag = p.own ? null : p.state === 'oos' ? ['품절', 'oos'] : p.state === 'low' ? ['곧 품절', 'low']
      : p.pricePct != null ? [fmt.signed(p.pricePct, 0, '%'), p.pricePct < 0 ? 'cut' : 'up'] : null;
    const chans = [...new Set(p.its.map(i => i.sourceLabel))];
    const name = p.own ? '알디콤' : x.brand || '브랜드 모름';
    const status = !flag ? '' : flag[1] === 'cut' || flag[1] === 'up' ? `가격 ${flag[0]}` : flag[0];
    const tipText = [name, FORM_KO[p.form], `1회분 ${money(x.perServing)}`, `판매처 ${chans.join(' · ')}`,
      STOCK[p.state][0], p.pricePct != null ? `지난 수집 대비 ${fmt.signed(p.pricePct, 0, '%')}` : '', '누르면 브랜드 비교에서 펼쳐요'].filter(Boolean).join(' · ');
    const cls = ['ins-pf-tile', `f-${p.form}`, p.own ? 'own' : '', p.state === 'oos' ? 'oos' : '', p.watched ? 'watched' : ''].filter(Boolean).join(' ');
    const brand = p.own ? '알디콤' : (x.line && x.line.brand) || x.brand || '브랜드 모름';
    return `<button type="button" class="${cls}" data-act="brand-go" data-brand="${esc(brand)}" data-name="${esc(name)}" data-form="${esc(FORM_KO[p.form] || '기타')}"
      data-ps="${x.perServing}" data-src="${esc(chans.join(' · '))}" data-flag="${flag ? flag[1] : ''}" data-status="${esc(status)}" title="${esc(tipText)}" aria-label="${esc(tipText)}">
      ${formIcon(p.form)}${flag ? `<span class="ins-pf-pill ${flag[1]}">${esc(flag[0])}</span>` : ''}${p.own ? '<span class="ins-pf-own">알디콤</span>' : ''}
    </button>`;
  }

  function pantryHtml(d) {
    const all = pantryLines(d);
    const priced = all.filter(p => p.rep.bucket && knownPs(p.rep)).sort((a, b) => a.rep.perServing - b.rep.perServing || b.reviews - a.reviews);
    const tier = PANTRY_SHELVES.some(([k]) => k === S.pf) ? S.pf : 'all';
    const ps = tier === 'all' ? priced : priced.filter(p => p.rep.bucket === tier);
    const own = priced.filter(p => p.own)[0];
    const tierBtn = (k, label, n) => `<button type="button" data-act="pf-tier" data-k="${k}" aria-pressed="${tier === k}">${esc(label)}<span class="n">${n}</span></button>`;
    const tiers = `<div class="ins-pf-bar"><div class="seg ins-pf-tiers" role="group" aria-label="1회분 가격대">${tierBtn('all', '전체', priced.length)}${PANTRY_SHELVES.map(([k, , , short]) =>
      tierBtn(k, short, priced.filter(p => p.rep.bucket === k).length)).join('')}</div></div>`;
    const flow = ps.length ? `<div class="ins-pf" data-ref="pf" tabindex="0" data-own-ps="${own ? own.rep.perServing : ''}"
        aria-label="진열대 ${ps.length}개, 1회분 싼 순서. 끌거나 왼쪽 · 오른쪽 화살표 키로 넘겨요">${ps.map(pantryTile).join('')}</div>
      <div class="ins-pf-cap" data-ref="pf-cap" aria-live="polite"></div>
      <div class="ins-pf-scrub" data-ref="pf-scrub" role="slider" tabindex="0" aria-label="진열대 위치 (1회분 싼 순서)" aria-valuemin="1" aria-valuemax="${ps.length}">
        <span class="ins-pf-end">${esc(money(ps[0].rep.perServing))}</span>
        <div class="ins-pf-track"><div class="ins-pf-dots" aria-hidden="true">${ps.map(p => `<span${p.own ? ' class="own"' : ''}></span>`).join('')}</div>
          <span class="ins-pf-tip" hidden></span></div>
        <span class="ins-pf-end">${esc(money(ps[ps.length - 1].rep.perServing))}</span>
      </div>`
      : '<div class="ins-pf-empty small muted">이 가격대에는 제품이 없어요</div>';
    const unpriced = all.filter(p => !p.rep.bucket).length;
    return `<section class="card mt-24 ins-pantry">
      ${tiers}
      ${flow}
      <div class="ins-legend small mt-16">${formLegend(priced.map(p => p.form))}<span><i class="ins-lg own"></i>알디콤</span><span><i class="ins-lg oos"></i>품절 (빈자리)</span>
        <span><i class="ins-lg low"></i>곧 품절</span></div>
      <p class="panel-note mt-8">같은 제품은 1회분이 가장 싼 판매처 한 곳만 놓았어요.${unpriced ? ` 가격을 못 읽은 ${unpriced}개는 뺐어요 (데이터 관리에서 가격을 넣을 수 있어요).` : ''} 타일이나 아래 점 줄을 끌어 넘겨 보고, 가운데 타일을 누르면 브랜드 비교에서 판매처별 제품을 펼쳐 봐요.</p>
    </section>`;
  }

  // 커버플로우 움직임: 끌기 · 던지면 관성 · 카드에 맞춰 멈춤 · 양끝 고무줄 · ← → 키 · 트랙패드 옆으로 쓸기
  // pos = 가운데에 온 카드 순번(소수 가능). 움직임 줄이기 설정이면 관성 없이 바로 그 카드로
  const PF_TILT = 48;
  let pfRaf = 0, pfRender = null;
  function initPantryFlow() {
    cancelAnimationFrame(pfRaf);
    pfRender = null;
    const stage = $(S.root, '[data-ref="pf"]');
    if (!stage) return;
    const cards = $$(stage, '.ins-pf-tile'), dots = $$(S.root, '.ins-pf-dots span'), cap = $(S.root, '[data-ref="pf-cap"]');
    const scrub = $(S.root, '[data-ref="pf-scrub"]'), track = $(scrub, '.ins-pf-track'), tip = $(scrub, '.ins-pf-tip');
    const n = cards.length, ownPs = parseFloat(stage.dataset.ownPs);
    const still = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ownAt = cards.findIndex(c => c.classList.contains('own'));
    let pos = ownAt >= 0 ? ownAt : Math.floor((n - 1) / 2), vel = 0, target = null, drag = null, moved = false, shown = -1;
    const clamp = v => Math.max(0, Math.min(n - 1, v));
    const center = () => clamp(Math.round(pos));

    // 간격은 진열대 폭에 맞춤: 가운데 ↔ 첫 옆 타일 g, 그 뒤로 st씩 (한쪽 4장이 진열대 끝까지 차게)
    const geo = () => {
      const w = stage.clientWidth, tw = cards[0].offsetWidth;
      const g = Math.min(tw * 0.95, w * 0.24);
      return [g, Math.min(tw * 0.5, Math.max(28, (w / 2 - g - tw / 2) / 4))];
    };
    const gap = () => geo()[0];
    function caption(c) {
      const ps = parseFloat(c.dataset.ps), isOwn = c.classList.contains('own');
      const vs = isOwn ? '이 줄의 기준점'
        : Number.isFinite(ownPs) ? `알디콤보다 ${money(Math.abs(ps - ownPs))} ${ps < ownPs ? '싸요' : ps > ownPs ? '비싸요' : '같아요'}` : '';
      cap.innerHTML = `<div class="ins-pf-form">${esc(c.dataset.form)}</div><div class="ins-pf-name">${esc(c.dataset.name)}</div>
        <div class="ins-pf-price">${esc(money(ps))}<small> / 1회</small></div>
        <div class="ins-pf-meta">${esc(c.dataset.src)}${c.dataset.status ? ` · <span class="${esc(c.dataset.flag)}">${esc(c.dataset.status)}</span>` : ''}</div>
        ${vs ? `<span class="ins-pf-vs${isOwn ? ' own' : ''}">${esc(vs)}</span>` : ''}`;
    }
    // 점이 트랙보다 많으면 간격을 줄여 양끝 점이 잘리지 않게 (폭이 바뀔 때만 다시 계산)
    let dotsW = -1;
    const fitDots = () => {
      const box = dots.length && dots[0].parentNode, w = box ? box.clientWidth : 0;
      if (!box || w === dotsW) return;
      dotsW = w;
      const gap = Math.max(1, Math.min(4, Math.floor((w - 18) / n) - 2));
      box.style.gap = `${gap}px`;
    };
    function render() {
      fitDots();
      const [g, st] = geo();
      cards.forEach((c, k) => {
        const r = k - pos, a = Math.abs(r), s = Math.sign(r), m = Math.min(a, 1);
        const x = a <= 1 ? r * g : s * (g + (a - 1) * st);
        c.style.transform = `translateX(${x}px) translateZ(${-120 * m}px) rotateY(${-Math.max(-1, Math.min(1, r)) * PF_TILT}deg)`;
        c.style.opacity = a > 4.5 ? 0 : a > 3.5 ? (4.5 - a) * 0.64 : 1 - 0.12 * Math.min(a, 3);
        c.style.visibility = a > 4.5 ? 'hidden' : '';
        c.style.zIndex = Math.round(100 - a * 10);
      });
      const ci = center();
      if (ci === shown) return;
      shown = ci;
      cards.forEach((c, k) => { c.tabIndex = k === ci ? 0 : -1; });
      dots.forEach((t, k) => t.classList.toggle('cur', k === ci));
      if (scrub) {
        scrub.setAttribute('aria-valuenow', ci + 1);
        scrub.setAttribute('aria-valuetext', `${ci + 1} / ${n}, ${cards[ci].dataset.name} ${money(parseFloat(cards[ci].dataset.ps))}`);
      }
      if (!cap) return;
      // 캡션은 살짝 사라졌다 바뀜 (움직임 줄이기면 바로)
      if (still || !cap.innerHTML) { caption(cards[ci]); return; }
      cap.classList.add('swap');
      clearTimeout(cap._t);
      cap._t = setTimeout(() => { caption(cards[shown]); cap.classList.remove('swap'); }, 120);
    }
    pfRender = render;
    function run() {
      cancelAnimationFrame(pfRaf);
      if (still) { pos = target != null ? target : center(); target = null; vel = 0; render(); return; }
      let prev = performance.now();
      const step = now => {
        if (!stage.isConnected) return;
        const dt = Math.min(32, now - prev);
        prev = now;
        if (target == null) {
          pos += vel * dt;
          vel *= Math.pow(0.94, dt / 16);
          if (pos < 0 || pos > n - 1) { vel *= 0.7; pos += (clamp(pos) - pos) * 0.2; }
          if (Math.abs(vel) < 0.0015) target = center();
        } else {
          pos += (target - pos) * Math.min(1, dt / 90);
          if (Math.abs(target - pos) < 0.002) { pos = target; target = null; vel = 0; render(); return; }
        }
        render();
        pfRaf = requestAnimationFrame(step);
      };
      pfRaf = requestAnimationFrame(step);
    }
    const goTo = k => { vel = 0; target = clamp(k); run(); };

    stage.addEventListener('pointerdown', e => {
      if (e.button) return;
      cancelAnimationFrame(pfRaf);
      target = null; vel = 0; moved = false;
      drag = { x: e.clientX, p: pos, lx: e.clientX, lt: performance.now(), id: e.pointerId };
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!moved && Math.abs(dx) > 5) { moved = true; stage.classList.add('drag'); stage.setPointerCapture(drag.id); }
      if (!moved) return;
      let p = drag.p - dx / gap();
      if (p < 0) p /= 3; else if (p > n - 1) p = n - 1 + (p - (n - 1)) / 3;
      pos = p;
      const now = performance.now(), dt = now - drag.lt;
      if (dt > 0) vel = 0.8 * vel + 0.2 * (-(e.clientX - drag.lx) / gap() / dt);
      drag.lx = e.clientX; drag.lt = now;
      render();
    });
    const end = () => {
      if (!drag) return;
      stage.classList.remove('drag');
      if (performance.now() - drag.lt > 80) vel = 0;
      drag = null;
      if (!moved) return;
      if (still) target = clamp(Math.round(pos + Math.sign(vel)));
      run();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // 끌고 난 뒤의 클릭 · 옆 카드 클릭은 브랜드 비교로 가지 않게 (root 클릭 처리보다 먼저)
    stage.addEventListener('click', e => {
      const dragged = moved, c = e.target.closest('.ins-pf-tile');
      moved = false;
      if (!c) return;
      const k = cards.indexOf(c);
      if (dragged || k !== center()) { e.stopPropagation(); e.preventDefault(); if (!dragged) goTo(k); }
    }, true);
    // 진열대 위 휠: 트랙패드 좌우 쓸기 · Shift+휠만 (세로 휠은 페이지 스크롤로 둠)
    stage.addEventListener('wheel', e => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!d) return;
      e.preventDefault();
      if (still) { if (Math.abs(d) > 20 && target == null) goTo(center() + Math.sign(d)); return; }
      target = null;
      vel += d / gap() / 400;
      run();
    }, { passive: false });
    if (scrub) initScrub();
    // 점 줄 = 스크러버: 누르면 그 상품으로 · 누른 채 끌면 따라감 · 올리면 말풍선 · 휠 한 칸씩 · ← → Home End
    function initScrub() {
      const at = x => {
        const a = dots[0].getBoundingClientRect(), b = dots[n - 1].getBoundingClientRect();
        const x0 = a.left + a.width / 2, x1 = b.left + b.width / 2;
        return x1 > x0 ? clamp(Math.round(((x - x0) / (x1 - x0)) * (n - 1))) : 0;
      };
      const showTip = k => {
        const c = cards[k], r = dots[k].getBoundingClientRect(), t = track.getBoundingClientRect();
        tip.textContent = `${c.dataset.name} · ${money(parseFloat(c.dataset.ps))}`;
        tip.hidden = false;
        tip.style.left = `${Math.max(0, Math.min(t.width, r.left + r.width / 2 - t.left))}px`;
      };
      let scrubbing = null, acc = 0, accT = 0;
      track.addEventListener('pointerdown', e => {
        if (e.button) return;
        e.preventDefault();
        scrubbing = e.pointerId;
        track.setPointerCapture(e.pointerId);
        scrub.classList.add('on');
        const k = at(e.clientX);
        goTo(k); showTip(k);
      });
      track.addEventListener('pointermove', e => {
        const k = at(e.clientX);
        if (scrubbing != null && k !== target && k !== center()) goTo(k);
        if (e.pointerType === 'mouse' || scrubbing != null) showTip(k);
      });
      const stop = e => {
        if (scrubbing == null || e.pointerId !== scrubbing) return;
        scrubbing = null;
        scrub.classList.remove('on');
        if (e.pointerType !== 'mouse') tip.hidden = true;
      };
      track.addEventListener('pointerup', stop);
      track.addEventListener('pointercancel', stop);
      track.addEventListener('pointerleave', () => { if (scrubbing == null) tip.hidden = true; });
      // 휠은 40만큼 모일 때마다 한 칸 · 끝에 닿으면 막지 않고 페이지 스크롤로 넘김
      scrub.addEventListener('wheel', e => {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const cur = target != null ? target : center();
        if (!d || (d < 0 && cur <= 0) || (d > 0 && cur >= n - 1)) return;
        e.preventDefault();
        if (performance.now() - accT > 250) acc = 0;
        accT = performance.now();
        acc += e.deltaMode ? d * 40 : d;
        const steps = Math.trunc(acc / 40);
        if (!steps) return;
        acc -= steps * 40;
        goTo(cur + steps);
      }, { passive: false });
      scrub.addEventListener('keydown', e => {
        const cur = target != null ? target : center();
        const to = { ArrowRight: cur + 1, ArrowUp: cur + 1, ArrowLeft: cur - 1, ArrowDown: cur - 1, PageUp: cur + 5, PageDown: cur - 5, Home: 0, End: n - 1 }[e.key];
        if (to == null) return;
        e.preventDefault();
        goTo(to);
      });
    }
    stage.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      goTo((target != null ? target : center()) + (e.key === 'ArrowRight' ? 1 : -1));
      const c = cards[clamp(target != null ? target : center())];
      if (stage.contains(document.activeElement) && c) c.focus({ preventScroll: true });
    });
    render();
  }


  // 정렬되는 머리글 (리뷰 표): 지금 정렬 칸은 ▲(작은 값 먼저) / ▼(큰 값 먼저), 아니면 ↕
  function sortTh(label, act, k, cur, dir, cls, extra) {
    const on = cur === k;
    return `<th class="${cls || ''}${on ? ' sorted' : ''}"><button type="button" class="ins-th-sort" data-act="${act}" data-k="${k}" aria-label="${esc(label)} 정렬">${esc(label)}<i>${on ? (dir < 0 ? '▼' : '▲') : '↕'}</i></button>${extra || ''}</th>`;
  }
  // 값 없는 행은 방향과 상관없이 늘 아래
  function byVal(val, dir, tie) {
    return (a, b) => {
      const x = val(a), y = val(b);
      if (x == null || y == null) return x == null && y == null ? tie(a, b) : x == null ? 1 : -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir || tie(a, b);
    };
  }

  /* 고정 칸 표 (브랜드 비교 · 구매자 리뷰 · 경쟁사 보관함 공통): 칸 너비 고정 → 페이지를 넘겨도 표 모양 그대로, 긴 글자는 …
     머리글 오른쪽 끝을 끌어 너비 조절(엑셀처럼) · 표 종류(key)별로 이 브라우저에 기억 */
  function colWidths(key, defaults) {
    const saved = store.get('colW-' + key, null);
    return Array.isArray(saved) && saved.length === defaults.length ? saved : defaults.slice();
  }
  // <table>에 붙일 속성과 <colgroup>
  function fixedCols(key, widths) {
    return {
      attr: ` data-cols="${esc(key)}" style="width:${widths.reduce((a, b) => a + b, 0)}px"`,
      group: `<colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>`
    };
  }
  const colHandle = i => `<span class="ins-col-rs" data-col="${i}" title="끌어서 칸 너비 조절" aria-hidden="true"></span>`;
  // 칸 너비 끌어서 조절 — 표는 다시 그리지 않고 <col> 너비만 바꿈
  function colResize(e) {
    const h = e.target.closest && e.target.closest('.ins-col-rs');
    if (!h) return;
    e.preventDefault();
    e.stopPropagation();
    const table = h.closest('table');
    const cols = table.querySelectorAll('col');
    const i = Number(h.dataset.col);
    const w = [...cols].map(c => parseFloat(c.style.width) || c.getBoundingClientRect().width);
    const x0 = e.clientX, w0 = w[i];
    h.classList.add('on');
    const move = ev => {
      w[i] = Math.max(60, Math.round(w0 + ev.clientX - x0));
      cols[i].style.width = `${w[i]}px`;
      table.style.width = `${w.reduce((a, b) => a + b, 0)}px`;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      h.classList.remove('on');
      if (table.dataset.cols) store.set('colW-' + table.dataset.cols, w);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  // 필터 줄 맨 앞 검색창 (상품 목록 · 경쟁사 · 구매자 리뷰 공통)
  function headSearch(ref, value, placeholder, label) {
    return `<label class="search ins-head-q">${icon('search')}<input class="input" type="search" data-ref="${ref}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}"></label>`;
  }
  // 검색창도 필터 줄과 함께 다시 그려지므로, 입력 중이던 검색창의 커서를 그대로 돌려줌
  function keepFocus(draw) {
    const a = document.activeElement;
    const ref = a && a.matches && a.matches('.ins-head-q input') ? a.dataset.ref : '';
    const pos = ref ? a.selectionStart : 0;
    draw();
    const el = ref && $(S.root, `[data-ref="${ref}"]`);
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }

  /* 가격 추이 (예시): 아직 쌓인 주차가 적어 시연용 더미 — 화면에서만 만들고 서버 · 규칙 · 보고서에는 쓰지 않음.
     실제 수집과 같은 주 단위 5주. 이번 주(와 있으면 지난주)는 실제 수집값, 그 앞만 예시 — 상품 key로 모양을 고정 (새로고침해도 같음) */
  function demoTrend(x) {
    let h = 2166136261;
    for (const c of String(x.key || x.id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const prev = x.change && !x.change.new && x.change.before != null ? x.change.before : null;
    const pts = prev != null ? [prev, x.price] : [x.price];
    const real = pts.length;
    const anchor = pts[0];
    while (pts.length < 5) {
      const step = rnd() < 0.4 ? 0 : (rnd() - 0.5) * 0.12;   // 주마다 40%는 그대로, 나머지는 ±6% 안
      pts.unshift(Math.min(anchor * 1.1, Math.max(anchor * 0.9, pts[0] * (1 + step))));
    }
    return { pts: pts.map(v => Math.round(v * 100) / 100), real };
  }
  function trendHtml(x) {
    if (x.price == null) return '';
    const { pts, real } = demoTrend(x);
    const fake = pts.length - real;   // 앞쪽 예시 점 개수
    const labels = ['4주 전', '3주 전', '2주 전', '지난주', '이번 주'];
    const W = 520, H = 150, L = 34, R = 34, T = 24, B = 30;
    const lo = Math.min(...pts), hi = Math.max(...pts), pad = Math.max((hi - lo) * 0.25, x.price * 0.03);
    const Y = v => T + (hi + pad - v) / (hi - lo + pad * 2) * (H - T - B);
    const X = i => L + i * (W - L - R) / (pts.length - 1);
    const seg = (a, b) => pts.slice(a, b + 1).map((v, j) => `${j ? 'L' : 'M'}${X(a + j).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const first = pts[0], pct = first ? (x.price - first) / first * 100 : 0;
    const dots = pts.map((v, i) => `<circle class="ins-tr-dot${i === pts.length - 1 ? ' now' : ''}${i < fake ? ' demo' : ''}" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3.5}"><title>${esc(labels[i])} ${esc(money(v))}${i < fake ? ' (예시)' : ' (실제 수집)'}</title></circle>
      <text class="ins-tr-v" x="${X(i).toFixed(1)}" y="${(Y(v) - 10).toFixed(1)}" text-anchor="middle">${esc(money(v))}</text>
      <text class="ins-axis" x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`).join('');
    const realText = real > 1 ? '지난주 · 이번 주는 실제 수집값' : '이번 주만 실제 수집값';
    return `<h3 class="ins-h3">최근 5주 판매가 ${badge(`예시 · 앞 ${fake}주`, 'orange')}</h3>
      <svg class="ins-trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 5주 판매가 추이 (앞 ${fake}주는 예시)">
        <path class="ins-tr-line demo" d="${seg(0, fake)}"></path>${real > 1 ? `<path class="ins-tr-line" d="${seg(fake, pts.length - 1)}"></path>` : ''}${dots}</svg>
      <p class="small muted">4주 전보다 ${Math.abs(pct) < 0.5 ? '변동 없음' : `${pct < 0 ? '↓' : '↑'} ${Math.abs(pct).toFixed(1)}%`} · ${realText}이고, 점선 구간은 예시예요. 주 1회 수집이 쌓이면 실제 값으로 바꿀 수 있어요.</p>`;
  }

  function openProduct(x) {
    if (!x) return;
    const sig = [x.rating != null ? `별점 ${x.rating}` : '', x.reviews != null ? `리뷰 ${fmt.num(x.reviews)}개` : '', x.position ? `검색 ${x.position}위` : ''].filter(Boolean).join(' · ');
    const d = S.data.shelf || {};
    const lid = x.line && x.line.id;
    const line = lid ? (d.lines || []).find(g => g.id === lid) : null;
    const sibs = lid ? (d.items || []).filter(i => i.line && i.line.id === lid) : [x];
    const where = sibs.length > 1 || line ? `<h3 class="ins-h3">판매처별 재고 · 가격</h3>
      <div class="table-wrap"><table class="data-table ins-table"><thead><tr><th>판매처</th><th>용량</th><th class="num">판매가</th><th class="num">1회분</th><th>재고</th></tr></thead>
      <tbody>${sibs.map(i => { const st = stockState(i, d.lowStock || 20); return `<tr${i.id === x.id ? ' class="ins-here"' : ''}><td>${esc(i.sourceLabel)}</td><td>${esc(i.servings)}회분</td>
        <td class="num">${esc(money(i.price))}</td><td class="num">${esc(money(i.perServing))}</td>
        <td>${badge(st === 'low' && i.stockLeft != null ? `${i.stockLeft}개 남음` : STOCK[st][0], STOCK[st][1])}</td></tr>`; }).join('')}</tbody></table></div>
      ${line && line.bulk ? `<p class="small mt-8">묶음 할인 ${infoTip(TIP.bulk)} <b>${esc(bulkText(line.bulk))}</b> <span class="muted">(${esc(line.bulk.small)} → ${esc(line.bulk.large)})</span></p>` : ''}` : '';
    const body = `<div class="part-insights ins-modal">
      <div class="flex wrap mb-16">${badge(x.sourceLabel)}${x.own ? badge('알디콤', 'green') : ''}${x.watched ? badge('★ 주시', 'lime') : ''}${stockBadge(x.in_stock)}${changeBadge(x.change)}</div>
      <div class="ins-modal-price"><div><span>1회분 가격 ${infoTip(TIP.perServing)}</span><b>${esc(money(x.perServing))}</b></div>
        <div><span>판매가</span><b>${esc(money(x.price))}</b><small>${esc(x.servings)}회분</small></div></div>
      ${trendHtml(x)}
      ${where}
      <h3 class="ins-h3">제품 정보</h3>
      ${ui.row('브랜드', esc(x.brand + (x.brandGuessed ? ' (제품명에서 추정)' : '')))}
      ${ui.row('가격 계산', esc(`${money(x.price)} ÷ ${x.servings}회분 = ${money(x.perServing)} / 1회분`))}
      ${ui.row('회분 근거', esc(SERVING_SRC[x.servingsSource] + (x.servingsRule ? ` · ${x.servingsRule}` : '')))}
      ${ui.row('재고 (판매처 문구)', esc(x.availability || (x.in_stock === false ? '품절' : x.in_stock ? '재고 있음' : '재고 정보 없음')))}
      ${ui.row('판매 신호', esc(sig || '—'))}
      ${ui.row('검색어 · 주소', esc(x.queries || '—'))}
      ${x.change && x.change.pricePct != null ? ui.row('지난 수집 대비', esc(`${money(x.change.before)} → ${money(x.price)} (${fmt.signed(x.change.pricePct, 0, '%')})`)) : ''}
      <h3 class="ins-h3">판매 문구 (원문)</h3>
      <p class="ins-quote">${x.message ? esc(x.message) : '<span class="muted">상세 조회를 하지 않았거나 문구가 없어요.</span>'}</p>
      <p class="panel-note mt-8">원문 그대로예요. 광고에 쓰려면 컴플라이언스 탭에서 문구 심의를 거쳐요. ${extLink(x.link, '판매 페이지')}</p>
    </div>`;
    ui.modal({ title: x.title, body, wide: true });
  }

  async function editShelf(t) {
    const d = t.dataset;
    let req;
    if (d.edit === 'servings') {
      const v = t.value.trim();
      if (v && !(Number(v) >= 1 && Number(v) <= 500)) { toast('회분 수는 1~500 사이로 입력하세요.', 'error'); return; }
      req = api('/api/insights/servings', { key: d.key, servings: v === '' ? null : Number(v) }, { method: 'PUT' });
    } else {
      let value;
      if (d.edit === 'price') value = t.value.trim() === '' ? null : Number(t.value);
      if (d.edit === 'in_stock') value = t.value === '' ? null : t.value === 'true';
      if (d.edit === 'own') value = t.checked;
      req = api(`/api/insights/shelf/${encodeURIComponent(d.id)}`, { [d.edit]: value }, { method: 'PATCH' });
    }
    t.disabled = true;
    try {
      await req;
      toast('고쳤어요. 이번 주 액션에도 반영돼요.');
      S.open['shelf-table'] = true;
      await loadData('shelf');
      S.data.competitors = null;
      loadWeekly();
    } catch (e) {
      toast('고치지 못했어요: ' + e.message, 'error');
      t.disabled = false;
    }
  }

  async function afterShelfChange(msg) {
    toast(msg);
    S.open['shelf-table'] = true;
    await loadData('shelf');
    S.data.competitors = null;
    loadWeekly();
  }

  async function editLine(t) {
    const cell = t.closest('td');
    const brand = $(cell, '[data-line="brand"]').value.trim();
    const form = $(cell, '[data-line="form"]').value;
    t.disabled = true;
    try {
      await api('/api/insights/lines', { key: t.dataset.key, brand: brand || null, form: form || null }, { method: 'PUT' });
      await afterShelfChange(brand || form ? '묶음을 고쳤어요. 모든 주차에 적용돼요.' : '자동 묶음으로 되돌렸어요.');
    } catch (e) {
      toast('묶음을 고치지 못했어요: ' + e.message, 'error');
      t.disabled = false;
    }
  }

  async function confirmLines(b) {
    b.disabled = true;
    try {
      const r = await api('/api/insights/lines/confirm', {}, { method: 'POST' });
      await afterShelfChange(`묶음 ${r.confirmed}개를 확인했어요.`);
    } catch (e) {
      toast('묶음을 확인하지 못했어요: ' + e.message, 'error');
      b.disabled = false;
    }
  }

  function openWeeeRaw() {
    const raw = ((S.data.shelf || {}).weeeRaw) || [];
    const body = `<div class="part-insights ins-modal"><p>Firecrawl이 읽은 Weee! 페이지 앞부분이에요 (제품을 못 찾았을 때 확인용).</p>
      ${raw.map(r => `<h3 class="ins-h3">${esc(r.url)}</h3><p class="small muted">${esc(fmt.datetime(r.at))} · ${esc(fmt.num(r.chars))}자</p><pre class="ins-pre">${esc(r.snippet)}</pre>`).join('')}</div>`;
    ui.modal({ title: 'Weee! 원문 (앞부분)', body, wide: true });
  }

  /* ═════════ 시장 (진열대 + 경쟁사) ═════════
     질문 카드 · 숫자 4칸 → 보기 [변화 | 가격 위치 | 브랜드 비교]
     - 변화: 경쟁사 이번 주 변화 + 곧 품절 (기회 칸)
     - 가격 위치: 가격대별 선반 + 1회분 단가 분포 (카드를 누르면 그 브랜드 줄로)
     - 브랜드 비교: 브랜드 한 줄(경쟁사 표 + 대체재 + 진열대에만 있는 브랜드) → ▸로 판매처별 상품을 제형별로 펼침,
       브랜드 이름 = 브랜드 카드. 상품은 진열대 묶음(lines)의 브랜드 · 제형을 따름 */
  const MK_PAGE = 5, MK_ITEMS = 4;   // 한 페이지 브랜드 수 (구매자 리뷰 표와 같게)
  // 머리글 정렬: [이름, 기본 방향(-1 = 큰 값 먼저)] — 신호 = 이번 주 변화 · 재고 중 급한 쪽
  const MK_COL_SORTS = { name: ['브랜드', 1], form: ['제형', 1], price: ['최저가', 1], ps: ['1회분', 1], signal: ['신호 순', 1], stock: ['재고 (품절 먼저)', 1], reviews: ['리뷰 · 판매', -1] };
  const CHG_RANK = { threat: 0, chance: 1, watch: 2 };

  // 이번 주 변화 (곧 품절 포함) — 서버가 한 번만 계산해 주간 리뷰 요약과 같은 숫자
  function mkChanges() { return S.data.competitors.changes; }

  // 브랜드 재고: 모든 판매처 품절 → 일부 판매처 품절 → 곧 품절 순으로 하나만 (나머지는 '외 N')
  // 품절은 제품(묶음 = 브랜드 · 제형)마다 판매처별로 봄 — 이번 주 리뷰 '재고 주의 제품'과 같은 기준
  function brandStock(items, limit) {
    const st = items.map(x => stockState(x, limit));
    const lineOf = x => (x.line && x.line.id) || x.key;
    const oos = [];   // [제형, 판매처]: 이 판매처에서 그 제품이 모두 품절
    [...new Set(items.map(lineOf))].forEach(l => {
      const its = items.filter(x => lineOf(x) === l);
      [...new Set(its.map(x => x.source))].forEach(s => {
        if (its.every(x => x.source !== s || stockState(x, limit) === 'oos')) oos.push([(its[0].line && its[0].line.form) || 'other', s]);
      });
    });
    const all = items.length > 0 && st.every(v => v === 'oos');
    const some = !all && oos.length > 0;
    const lefts = items.filter((x, i) => st[i] === 'low').map(x => x.stockLeft);
    const list = [all ? ['모든 판매처 품절', 'red'] : null,
      some ? [`일부 품절 · ${oos.map(([f, s]) => `${FORM_KO[f] || '기타'} ${SRC_LABEL[s] || s}`).join(', ')}`, 'orange'] : null,
      lefts.length ? [`곧 품절 · ${Math.min(...lefts)}개`, 'orange'] : null].filter(Boolean);
    const known = st.some(v => v !== 'unknown');
    return { all, some, low: lefts.length > 0, list, level: all || some ? 1 : lefts.length ? 2 : 9,
      text: list.length ? badge(list[0][0], list[0][1]) + (list.length > 1 ? ` <span class="muted small">외 ${list.length - 1}</span>` : '')
        : `<span class="muted">${known ? '재고 있음' : '정보 없음'}</span>` };
  }

  function mkRow(c, items, sh, name, chgs) {
    const own = c ? !!c.own : items.some(x => x.own);
    const brand = own ? '알디콤' : c ? c.brand : name;
    const byForm = {};
    items.forEach(x => { const f = (x.line && x.line.form) || 'other'; (byForm[f] = byForm[f] || []).push(x); });
    const forms = Object.entries(byForm).map(([f, its]) => {
      const priced = its.filter(i => i.perServing != null);
      return { f, its, best: priced.length ? priced.reduce((a, b) => (b.perServing < a.perServing ? b : a)) : null };
    }).sort((a, b) => formRank(a.f) - formRank(b.f));   // 행마다 같은 순서 (위아래로 훑어 비교)
    const priced = items.filter(x => x.price != null);
    const cheapest = priced.length ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    const best = forms.filter(g => g.best).reduce((a, g) => (!a || g.best.perServing < a.best.perServing ? g : a), null);
    const ch = (chgs || []).slice().sort((a, b) => CHG_RANK[a.group || 'watch'] - CHG_RANK[b.group || 'watch']);
    const stock = brandStock(items, sh.lowStock);
    const reviews = c ? (c.reviews || 0) : items.reduce((n, x) => n + (x.reviews || 0), 0);
    return {
      c, own, brand, items, forms, best, cheapest, ch, stock, reviews,
      formKey: forms.length ? forms.map(g => formRank(g.f)).join(',') : null,   // 제형 칸 정렬 (순서 고정이라 글자 비교로 충분)
      id: own ? 'own' : c ? (c.id == null ? 'b:' + c.brand : c.id) : null,
      ps: best ? best.best.perServing : c && c.perServing != null ? c.perServing : null,
      pop: c ? compPop(c) : reviews ? `리뷰 ${fmt.num(reviews)}` : '—', popN: reviews * 1000 + (c ? compSold(c) : 0),
      sub: !!(c && c._sub), unlisted: !c && !own, watched: !!(c && c.watched), isNew: !!(c && c.isNew), analyzed: !!(c && c.analyzed),
      tierKey: own ? 'own' : !c ? 'none' : c._sub ? 'sub' : c.tier, tier: own ? '알디콤' : !c ? '분석 전' : c._sub ? '대체재' : c.tierLabel,
      signal: own ? -1 : Math.min(ch.length ? CHG_RANK[ch[0].group || 'watch'] : 9, stock.level),
      text: [brand, c ? fieldText(c, 'message') : '', ...items.map(x => x.title)].join(' ').toLowerCase()
    };
  }

  // 브랜드 비교의 줄 (데이터가 같으면 다시 만들지 않음)
  function brandRows() {
    const sh = S.data.shelf, cp = S.data.competitors;
    if (S.mk.cache && S.mk.cache.sh === sh && S.mk.cache.cp === cp) return S.mk.cache.rows;
    const OWN = '\u0000own';
    const byBrand = {};
    sh.items.forEach(x => { const b = x.own ? OWN : (x.line && x.line.brand) || x.brand || '브랜드 모름'; (byBrand[b] = byBrand[b] || []).push(x); });
    const chgBy = {};
    (mkChanges() || []).forEach(x => { (chgBy[x.brand] = chgBy[x.brand] || []).push(x); });
    const seen = new Set((cp.archived || []).map(c => c.brand));   // 보관한 브랜드는 표에 안 올림
    const comps = [cp.own].concat(cp.table || [], (cp.substitutes || []).map(c => Object.assign({ _sub: true }, c))).filter(Boolean);
    const rows = comps.filter(c => !seen.has(c.brand)).map(c => {
      const k = c.own ? OWN : c.brand;
      seen.add(k);
      return mkRow(c, byBrand[k] || [], sh, c.brand, c.own ? [] : chgBy[c.brand]);
    });
    Object.keys(byBrand).filter(k => !seen.has(k)).forEach(k => rows.push(mkRow(null, byBrand[k], sh, k, chgBy[k])));
    S.mk.cache = { sh, cp, rows };
    return rows;
  }

  function mkSorted(rows) {
    const val = { name: r => r.brand.toLowerCase(), form: r => r.formKey, price: r => (r.cheapest ? r.cheapest.price : null), ps: r => r.ps, signal: r => r.signal,
      stock: r => r.stock.level, reviews: r => r.popN }[S.mk.sort] || (r => r.signal);
    return rows.slice().sort(byVal(val, S.mk.dir, (a, b) => (b.popN - a.popN) || a.brand.localeCompare(b.brand)));
  }

  // 숫자 4칸: 이번 주 변화 · REBOOT 1회분 · 경쟁 제품 품절 · 브랜드
  function marketKpis(sh, cp) {
    const rows = brandRows();
    const chg = mkChanges() || [];
    const n = g => chg.filter(x => (x.group || 'watch') === g).length;
    const priced = sh.items.filter(knownPs);
    const vals = priced.filter(x => !x.own).map(x => x.perServing).sort((a, b) => a - b);
    const median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
    const own = priced.filter(x => x.own).sort((a, b) => a.perServing - b.perServing)[0];
    const rank = S.weekly && S.weekly.shelf && S.weekly.shelf.ownRank;
    const gap = own && median != null ? own.perServing - median : null;
    const ownSub = !own ? '진열대에서 아직 못 찾았어요' : [rank ? `${rank.rank}위 / ${rank.total}` : '',
      gap == null || Math.abs(gap) < 0.005 ? '' : `보통보다 ${money(Math.abs(gap))} ${gap > 0 ? '비싸요' : '싸요'}`].filter(Boolean).join(' · ');
    const comp = rows.filter(r => !r.own);
    const all = comp.filter(r => r.stock.all).length, some = comp.filter(r => r.stock.some).length, low = comp.filter(r => r.stock.low).length;
    const stat = (sub, label, value, foot, tone) => `<button type="button" class="ins-stat ins-stat-go${tone ? ' ' + tone : ''}" data-sub="${sub}">
      <span>${label}</span><b>${value}</b><small>${foot}</small></button>`;
    return `<div class="ins-stats mt-16">
      ${stat('changes', '이번 주 변화', `${chg.length}건`, `위협 ${n('threat')} · 기회 ${n('chance')} · 관찰 ${n('watch')}`)}
      ${stat('price', '알디콤 1회분', own ? esc(money(own.perServing)) : '—', esc(ownSub), own ? 'lime' : 'red')}
      ${stat('brands', '경쟁 제품 품절', `${all + some}개`, `모든 판매처 ${all} · 일부 판매처 ${some} · 곧 품절 ${low}`, all ? 'red' : some || low ? 'orange' : '')}
      ${stat('brands', '경쟁 브랜드', `${comp.length}개`, `AI 분석 ${comp.filter(r => r.analyzed).length} · 주시 ${(cp.watch || []).length} · 분석 전 ${comp.filter(r => r.unlisted).length}`)}
    </div>`;
  }

  function marketHtml(sub) {
    const sh = S.data.shelf, cp = S.data.competitors;
    const head = demoNote(sh.demo) + qHead('market', sh.items.length ? '' : sh.oneLine, '',
      sh.items.length ? marketKpis(sh, cp) : '');
    if (!sh.items.length) return head + `<div class="mt-24">${ui.empty('아직 진열대 데이터가 없어요. 최신 데이터 받기를 눌러 Weee! · Amazon · Yami 진열대를 받아 오세요 (설정 › 연결에 Firecrawl · SerpApi 키 필요).', 'grid')}</div>`;
    return head + pageTabs('market', sub) + (sub === 'changes' ? changesView(cp) : sub === 'price' ? priceView(sh) : brandsView(cp));
  }

  function changesView(cp) {
    // 예시 비교면 제목 옆에 '예시' 배지 + 작은 회색 한 줄 (자세한 설명은 마우스를 올리면)
    const demoTip = cp.changesDemo ? badge('예시', 'orange') + `<span class="ins-tip ins-demo-tip" tabindex="0"
      data-tip="지난주 수집이 아직 없어 이번 주 진열대로 만든 예시와 비교했어요. 실제 변화가 아니에요.&#10;다음 주 수집부터 실제 비교로 바뀌어요."><i aria-hidden="true">i</i>예시 지난주와 비교한 결과예요</span>` : '';
    const list = mkChanges();
    return `<section class="card mt-24" data-ref="chg"><div class="card-head"><div class="ins-head-title"><h2>이번 주 경쟁 브랜드 변화</h2>${demoTip}</div>${list && list.length ? badge(`${list.length}건`, 'blue') : ''}</div>${changesHtml(list)}</section>`;
  }

  function priceView(sh) {
    const priced = sh.items.filter(knownPs);
    const overview = priced.length ? `<section class="card mt-24"><div class="card-head"><h2>1회분 단가 한눈에<span class="head-cap">점 1개 = 제품 1개</span></h2>${dockBtn('price', 'summary-' + REBOOT.today())}</div>${shelfSummary(priced)}${shelfStrip(priced)}</section>` : '';
    const promoCard = `<section class="card mt-24 ins-promo"><div class="card-head"><h2>시즌별 프로모션 제안</h2>${badge('AI 제안', 'purple')}</div>
      <div data-ref="promo">${skel}</div></section>`;
    return pantryHtml(sh) + overview + promoCard;
  }

  /* ───────── 시즌별 프로모션 제안 ('1회분 단가 한눈에' 아래 · 서버 promo.py) ─────────
     단가 요약 · 다가오는 시즌은 서버가 셈 → AI는 시즌마다 아이디어 · 가격 전략 · 채널 문장만 */
  async function loadPromo() {
    try { S.promo = await api('/api/insights/promo'); } catch (e) { S.promo = { error: e.message }; }
    drawPromo();
  }

  function drawPromo() {
    const el = $(S.root, '[data-ref="promo"]');
    if (!el) return;
    const p = S.promo;
    if (!p) { loadPromo(); return; }
    if (p.error) { el.innerHTML = `<div class="note error">불러오지 못했어요. ${esc(p.error)}</div>`; return; }
    const make = (label) => `<button type="button" class="btn small dark" data-act="promo-make"${p.aiReady ? '' : ' disabled'}>${icon('spark')}${label}</button>`;
    const sm = p.summary;
    if (!sm) {
      el.innerHTML = `<p class="small muted">위 1회분 단가와 다가오는 시즌(설정 › 시즌)을 보고 AI가 시즌마다 프로모션 아이디어 · 가격 전략 · 먼저 할 채널을 정리해요.</p>
        ${p.aiReady ? '' : '<div class="note warn mt-8">OpenAI 키가 없어 만들 수 없어요 (설정 › 연결).</div>'}<div class="flex wrap mt-8">${make('AI로 제안 받기')}</div>`;
      return;
    }
    const pr = sm.prices || {};
    const rows = sm.items.map(x => `<li class="ins-promo-row"${dockable('promo', `${x.season}:${x.start}`, { title: `${x.season} 프로모션 제안`,
        text: [x.idea, '가격: ' + x.price, '채널: ' + x.channel].join('\n'), href: '/dashboard/insights#market/price', data: x })}>
        <div class="ins-promo-when"><b>${esc(x.season)}</b><span class="small muted">${esc(x.start)}</span>${x.dday > 0 ? badge('D-' + x.dday, x.dday <= 30 ? 'orange' : '') : badge('진행 중', 'lime')}</div>
        <div class="ins-promo-body"><p>${esc(x.idea)}</p>
          <p class="small"><span class="field-label">가격</span>${esc(x.price)}</p>
          <p class="small"><span class="field-label">채널</span>${esc(x.channel)}</p>
          <div>${dockBtn('promo', `${x.season}:${x.start}`)}</div></div></li>`).join('');
    el.innerHTML = `<ul class="ins-promo-list">${rows}</ul>
      <p class="panel-note mt-8">기준: 1회분 단가 최저 ${esc(money(pr.min))} · 보통 ${esc(money(pr.median))} · 최고 ${esc(money(pr.max))}${pr.own ? ` · 알디콤 ${esc(money(pr.own.perServing))}` : ''} (제품 ${esc(pr.products)}개)
        · ${esc(fmt.date(sm.createdAt))} ${esc(sm.createdBy || '')}</p>
      <div class="flex wrap mt-8">${make('다시 만들기')}</div>`;
  }

  async function makePromo(btn) {
    ui.busy(btn, true);
    try {
      S.promo = await api('/api/insights/promo', {});
      toast('시즌별 프로모션 제안을 만들었어요.');
    } catch (e) { toast('만들지 못했어요: ' + e.message, 'error'); }
    ui.busy(btn, false);
    drawPromo();
  }

  function brandsView(cp) {
    const notes = [!cp.aiReady ? '<div class="note warn mt-16">OpenAI 키가 없어 핵심 메시지 · 성분 분석은 할 수 없어요. 판매처 · 단가 · 칭찬/불만은 그대로 보여요 (설정 › 연결).</div>' : '',
      cp.aiReady && !cp.firecrawlReady ? '<div class="note mt-16">Firecrawl 키가 없어 홈페이지 · 뉴스는 읽지 않고, 진열대 자료와 AI 웹 검색으로 채워요.</div>' : ''].join('');
    const tools = `<div class="flex wrap">
      <button type="button" class="btn small" data-act="comp-discover" title="진열대에 새로 보인 브랜드를 경쟁 브랜드로 넣어요 (무료)">${icon('refresh')}새 브랜드 넣기</button>
      <button type="button" class="btn small dark" data-act="comp-research-all"${cp.aiReady ? '' : ' disabled'} title="리뷰 상위 ${cp.deepTop}개 브랜드의 핵심 메시지 · 성분을 AI로 새로 채워요 (API 사용)">${icon('spark')}AI 분석 실행</button>
      ${ui.fileMenu('download', { label: '브랜드 비교 다운로드', items: [
        { label: 'CSV', href: '/api/insights/competitors.csv' }, { label: 'JSON', href: '/api/insights/competitors.json' }] })}</div>`;
    const arch = (cp.archived || []).length ? fold('comp-arch', `보관함 ${cp.archived.length}개 · 브랜드 카드에서 '보관'한 브랜드 (표에 안 올라와요)`, compTableHtml(cp.archived)) : '';
    return `${notes}<section class="card mt-24"><div class="card-head wrap"><div class="ins-head-title"><h2>브랜드 비교</h2>${badge(`${brandRows().length}개`)}</div>${tools}</div>
      <div data-ref="brand-body">${brandTable()}</div>
      <p class="panel-note mt-8">▸를 누르면 판매처별 제품이 제형별로 펼쳐지고, 브랜드 이름을 누르면 브랜드 카드(핵심 메시지 · 주력 성분 · 칭찬/불만 · 유튜브 · AI 의견)가 열려요.
        메시지 · 성분은 리뷰 상위 ${cp.deepTop}개 브랜드만 AI가 채워요. 제형은 제품명에 쓴 말(스틱 · 젤리 · 정제 · 환)을 먼저 따라요.</p></section>${arch}`;
  }

  function brandBar(all) {
    const f = S.mk;
    const sel = (k, label, opts) => `<select class="ins-cf${f[k] ? ' on' : ''}" data-mk="${k}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(([v, l]) =>
      `<option value="${esc(v)}"${f[k] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const cnt = fn => all.filter(r => !r.own && fn(r)).length;
    const srcs = [...new Set(S.data.shelf.items.map(x => x.source))];
    const forms = [...new Set(all.flatMap(r => r.forms.map(g => g.f)))].sort((a, b) => formRank(a) - formRank(b));
    const tiers = [...new Map(all.filter(r => !r.own).map(r => [r.tierKey, r.tier])).entries()];
    const tog = (k, l) => `<button type="button" class="ins-cf${f[k] ? ' on' : ''}" data-act="mk-ftog" data-k="${k}" aria-pressed="${!!f[k]}">${esc(l)}</button>`;
    const any = f.ch || f.form || f.stock || f.tier || f.price || f.watch || f.ai;
    // 자주 안 쓰는 필터 3개는 '필터 +' 작은 창에 — 걸린 개수를 버튼에 보여 줘서 창을 닫아도 숨지 않음
    const extra = [f.tier, f.watch, f.ai].filter(Boolean).length;
    const pop = f.more ? `<div class="ins-cf-pop" role="group" aria-label="필터 더">${sel('tier', '경쟁 구분', tiers)}${tog('watch', '주시 중만')}${tog('ai', 'AI 분석된 것만')}</div>` : '';
    return `<div class="ins-cf-wrap"><div class="ins-cf-bar"><span class="ins-cf-icon" aria-hidden="true">${icon('filter')}</span>
      ${headSearch('mk-q', f.q, '브랜드 · 제품 검색', '브랜드 · 제품 검색 (제품명 · 핵심 메시지 포함)')}
      ${sel('ch', '판매처 전체', srcs.map(s => [s, SRC_LABEL[s] || s]))}${sel('form', '제형 전체', forms.map(k => [k, FORM_KO[k] || k]))}
      ${sel('stock', '재고 전체', [['all', `모든 판매처 품절 (${cnt(r => r.stock.all)})`], ['some', `일부 품절 (${cnt(r => r.stock.some)})`], ['low', `곧 품절 (${cnt(r => r.stock.low)})`]])}
      ${sel('price', '1회분 가격', COMP_PRICE.map(([v, l]) => [v, l]))}
      <button type="button" class="ins-cf${extra ? ' on' : ''}" data-act="mk-more" aria-expanded="${!!f.more}" title="경쟁 구분 · 주시 중만 · AI 분석된 것만">${extra ? `필터 ${extra}` : '필터 +'}</button>
      ${any ? '<button type="button" class="ins-link" data-act="mk-fclear">필터 지우기</button>' : ''}
      <span class="ins-cf-gap"></span>
      <select class="ins-cf sort" data-mk="sort" aria-label="정렬">${Object.entries(MK_COL_SORTS).map(([k, [l, d0]]) =>
        `<option value="${k}"${f.sort === k ? ' selected' : ''}>정렬: ${esc(l)}${k === 'signal' ? '' : ((f.sort === k ? f.dir : d0) < 0 ? ' ▼' : ' ▲')}</option>`).join('')}</select></div>${pop}</div>`;
  }
  // '필터 +' 창을 버튼 바로 아래로 (필터 줄이 옆으로 밀려 있어도)
  function placeMkPop(box) {
    const pop = box && $(box, '.ins-cf-pop'), btn = box && $(box, '[data-act="mk-more"]');
    if (!pop || !btn) return;
    const bar = btn.closest('.ins-cf-bar');
    pop.style.left = `${Math.max(0, btn.offsetLeft - bar.scrollLeft)}px`;
  }

  function brandTable() {
    const all = brandRows();
    const f = S.mk;
    const q = f.q.trim().toLowerCase();
    const price = COMP_PRICE.find(x => x[0] === f.price);
    const ok = r => (!q || r.text.includes(q)) && (!f.ch || r.items.some(x => x.source === f.ch)) && (!f.form || r.forms.some(g => g.f === f.form)) &&
      (!f.stock || r.stock[f.stock]) && (!f.tier || r.tierKey === f.tier) && (!price || (r.ps != null && price[2](r.ps))) && (!f.watch || r.watched) && (!f.ai || r.analyzed);
    const own = all.filter(r => r.own && ok(r));
    const rows = mkSorted(all.filter(r => !r.own && ok(r)));
    const bar = brandBar(all);
    if (!rows.length && !own.length) return bar + `<div class="mt-16">${ui.empty('조건에 맞는 브랜드가 없어요. 검색어나 필터를 바꿔 보세요.', 'users')}</div>`;
    if (f.focus) { const i = rows.findIndex(r => r.brand === f.focus); if (i >= 0) f.page = Math.floor(i / MK_PAGE) + 1; }
    const pages = Math.max(1, Math.ceil(rows.length / MK_PAGE));
    f.page = Math.min(Math.max(1, f.page), pages);
    const cur = f.page;
    const shown = rows.slice((cur - 1) * MK_PAGE, cur * MK_PAGE);
    // 칸: [이름, 정렬 키, 정렬 칸 class, 설명] — 너비는 끌어서 조절 · 이 브라우저에 기억 (구매자 리뷰 표와 같음)
    const cols = [['브랜드', 'name'], ['제형', 'form'], ['최저가', 'price'], ['1회분', 'ps', 'num', TIP.perServing], ['이번 주 변화', 'signal'], ['재고', 'stock', '', TIP.low],
      ['리뷰 · 판매', 'reviews', 'num'], ['구분']];
    const fc = fixedCols('brands', colWidths('brands', [220, 140, 140, 120, 190, 170, 110, 100]));
    const head = cols.map(([label, k, cls, tip], i) => (k ? sortTh(label, 'mk-sort', k, f.sort, f.dir, cls, (tip ? infoTip(tip) : '') + colHandle(i))
      : `<th>${esc(label)}${colHandle(i)}</th>`)).join('');
    const pad = pages > 1 ? `<tr class="ins-pad" aria-hidden="true"><td colspan="${cols.length}"></td></tr>`.repeat(MK_PAGE - shown.length) : '';   // 마지막 페이지도 표 높이 그대로
    return bar + `<div class="table-wrap"><table class="data-table ins-table ins-fixed ins-brands"${fc.attr}>${fc.group}
      <thead><tr>${head}</tr></thead>
      <tbody>${own.map(brandRow).join('')}${rebootRow(q, f)}${shown.map(brandRow).join('')}${pad}</tbody></table></div>` +
      compPager(cur, pages, rows.length, (cur - 1) * MK_PAGE + 1, (cur - 1) * MK_PAGE + shown.length, 'mk-page', '브랜드 표 페이지');
  }
  function drawBrandTable() {
    const box = $(panel('market'), '[data-ref="brand-body"]');
    if (box && S.data.shelf && S.data.competitors) { keepFocus(() => { box.innerHTML = brandTable(); }); placeMkPop(box); }
  }

  // REBOOT 줄 (알디콤 바로 아래 · 출시 전이라 진열대 데이터 없음 · 설정 › 제품 정보 사양서 가격 · 예시)
  // 판매처 · 재고 · 주시 · AI · 구분 필터를 켜면 숨김 (진열대 값이 없어 그 조건으로 고를 수 없음)
  function rebootRow(q, f) {
    const rb = S.data.shelf && S.data.shelf.reboot;
    if (!rb || !rb.items.length || f.ch || f.stock || f.watch || f.ai || f.tier || (q && !'reboot 리부트'.includes(q))) return '';
    if (f.form && !rb.items.some(x => x.form === f.form)) return '';
    const price = COMP_PRICE.find(x => x[0] === f.price);
    if (price && !price[2](rb.perUnit)) return '';
    const forms = [...new Set(rb.items.map(x => FORM_KO[x.form] || '기타'))].join(' · ');
    const prices = rb.items.map(x => `${x.ko || x.title} ${money(x.price)}${x.priceBox ? ` · 3병 ${money(x.priceBox)}` : ''}`).join('\n');
    return `<tr class="ins-br ins-own-row" data-brand-row="REBOOT" title="${esc(rb.basis)}">
      <td><div class="ins-br-name"><span class="ins-tg none" aria-hidden="true"></span><b class="ins-bn-t ins-own-name">REBOOT</b>${badge('예시', 'orange')}</div></td>
      <td class="ins-fms">${esc(forms)}</td>
      <td title="${esc(prices)}">사양서 ${esc(money(Math.min(...rb.items.map(x => x.price))))}~</td>
      <td class="num"><span class="ins-ps">${esc(money(rb.perUnit))}</span><small class="ins-ps-f">1개 · 1병당</small></td>
      <td><span class="muted">—</span></td><td><span class="muted">출시 전</span></td><td class="num">—</td><td>${esc(rb.label)}</td></tr>`;
  }

  // 회분을 못 읽어 1회로 계산한 값 → 데이터 관리에서 고치기
  const fixBadge = x => `<button type="button" class="ins-fix" data-act="mk-fix" data-q="${esc(x.title)}" title="회분을 못 읽어 1개 = 1회로 계산했어요. 누르면 데이터 관리에서 고쳐요">확인 필요</button>`;

  function brandRow(r) {
    const open = !!S.mk.open[r.brand] && r.items.length > 0;
    const flags = r.own ? '' : [r.watched ? '<span class="ins-star" title="주시 중">★</span>' : '', r.isNew ? badge('새', 'blue') : '',
      r.unlisted ? badge('분석 전') : ''].join('');
    const tog = r.items.length ? `<button type="button" class="ins-tg" data-act="mk-toggle" data-brand="${esc(r.brand)}" aria-expanded="${open}" aria-label="${esc(r.brand)} 제품 ${open ? '접기' : '펼치기'}">${open ? '▾' : '▸'}</button>`
      : '<span class="ins-tg none" aria-hidden="true"></span>';
    const ownCls = r.own ? ' ins-own-name' : '';
    const name = r.id != null ? `<button type="button" class="ins-bn${ownCls}" data-act="comp-detail" data-id="${esc(r.id)}" title="${esc(r.brand)} · 브랜드 카드 열기">${esc(r.brand)}</button>` : `<b class="ins-bn-t${ownCls}" title="${esc(r.brand)}">${esc(r.brand)}</b>`;
    const forms = r.forms.length ? esc(r.forms.map(g => FORM_KO[g.f] || '기타').join(' · ')) : '<span class="muted">—</span>';
    const add = r.unlisted ? '<div class="ins-br-add"><button type="button" class="ins-link small" data-act="comp-discover" title="진열대에 새로 보인 브랜드를 경쟁 브랜드로 넣어요">경쟁 브랜드로 넣기</button></div>' : '';
    // 1회분은 가장 싼 값 하나 (제형별 값은 ▸ 펼침에) · 제형이 여럿이면 어느 제형인지 아래에 작게
    const b = r.best && r.best.best;
    const ps = b ? `<span class="ins-ps">${esc(money(b.perServing))}${b.servingsSource === 'default' ? fixBadge(b) : ''}</span>${r.forms.length > 1 ? `<small class="ins-ps-f">${esc(FORM_KO[r.best.f] || '기타')}</small>` : ''}`
      : (r.ps != null ? esc(money(r.ps)) : '—');
    const c0 = r.ch[0];
    const chg = c0 ? `${badge(`${(CHG_GROUPS.find(g => g[0] === (c0.group || 'watch')) || [])[1]} · ${c0.label}${c0.kind === 'price' && c0.pct != null ? ' ' + fmt.signed(c0.pct, 1, '%') : ''}`,
      { threat: 'red', chance: 'green', watch: '' }[c0.group || 'watch'])}${r.ch.length > 1 ? ` <span class="muted small">외 ${r.ch.length - 1}</span>` : ''}` : '<span class="muted">—</span>';
    const cheap = r.cheapest ? `${esc(r.cheapest.sourceLabel)} ${esc(money(r.cheapest.price))}` : '<span class="muted">이번 진열대에 없음</span>';
    const drag = dockable('brand', r.brand, { title: `브랜드 · ${r.brand}`,
      text: [r.forms.length ? '제형: ' + r.forms.map(g => FORM_KO[g.f] || '기타').join(' · ') : '', b ? '1회분 ' + money(b.perServing) : '',
        r.cheapest ? `최저가 ${r.cheapest.sourceLabel} ${money(r.cheapest.price)}` : '', c0 ? '최근 변화: ' + c0.label : ''].filter(Boolean).join(' · '),
      href: '/dashboard/insights#market/brands', data: { brand: r.brand, own: !!r.own, perServing: b ? b.perServing : r.ps } });
    return `<tr class="ins-br${r.own ? ' ins-own-row' : ''}${open ? ' open' : ''}" data-brand-row="${esc(r.brand)}"${drag}>
      <td><div class="ins-br-name">${tog}${name}${flags}</div>${add}</td>
      <td class="ins-fms">${forms}</td><td>${cheap}</td><td class="num">${ps}</td><td>${chg}</td><td>${r.stock.text}</td><td class="num">${esc(r.pop)}</td><td>${esc(r.tier)}</td></tr>${open ? brandItems(r) : ''}`;
  }

  // 펼침: 제형마다 상품 줄 (품절 · 곧 품절 · 가격 변동 먼저, MK_ITEMS개 + 더 보기)
  function brandItems(r) {
    const sh = S.data.shelf;
    const rank = x => { const st = stockState(x, sh.lowStock); return st === 'oos' ? 0 : st === 'low' ? 1 : x.change && x.change.pricePct ? 2 : 3; };
    const groups = r.forms.map(g => {
      const its = g.its.slice().sort((a, b) => rank(a) - rank(b) || (a.perServing == null ? 1e9 : a.perServing) - (b.perServing == null ? 1e9 : b.perServing));
      const key = `${r.brand}|${g.f}`;
      const all = !!S.mk.items[key];
      const shown = all ? its : its.slice(0, MK_ITEMS);
      const line = (sh.lines || []).find(l => g.its[0].line && l.id === g.its[0].line.id);
      const bulk = line && line.bulk ? ` · 묶음 할인 ${bulkText(line.bulk)}` : '';
      return `<p class="ins-fh"><b>${esc(FORM_KO[g.f] || '기타')}</b> · ${its.length > shown.length ? `${its.length}개 중 ${shown.length}개` : `${its.length}개`}${esc(bulk)}</p>
        <table class="ins-items"><thead><tr><th>제품</th><th>판매처</th><th>회분</th><th class="num">판매가</th><th class="num">1회분</th><th>지난 수집 대비 ${infoTip(TIP.change)}</th><th>재고</th></tr></thead>
        <tbody>${shown.map(x => itemRow(x, sh.lowStock)).join('')}</tbody></table>
        ${its.length > MK_ITEMS ? `<button type="button" class="ins-link small" data-act="mk-items" data-k="${esc(key)}">${all ? '접기' : `${esc(FORM_KO[g.f] || '기타')} ${its.length - MK_ITEMS}개 더 보기`}</button>` : ''}`;
    }).join('');
    return `<tr class="ins-br-sub"><td colspan="8">${groups}</td></tr>`;
  }
  function itemRow(x, limit) {
    const st = stockState(x, limit);
    const pct = x.change && x.change.pricePct;
    const chg = x.change && x.change.new ? badge('신규', 'blue') : pct == null || Math.abs(pct) < 0.5 ? '<span class="muted">변동 없음</span>'
      : `<span class="${pct < 0 ? 'ins-down' : 'ins-up'}">${pct < 0 ? '↓' : '↑'} ${Math.abs(pct).toFixed(1)}%</span> <small class="muted">${esc(money(x.change.before))}에서</small>`;
    const sv = x.servingsSource === 'default' ? fixBadge(x) : `${esc(x.servings)}${x.servingsSource === 'manual' ? ' <small class="muted">직접 수정</small>' : ''}`;
    const stock = st === 'in' ? '<span class="muted">재고 있음</span>' : badge(st === 'low' && x.stockLeft != null ? `곧 품절 · ${x.stockLeft}개` : STOCK[st][0], STOCK[st][1]);
    return `<tr><td class="ins-title-cell"><button type="button" class="ins-item-name" data-act="prod" data-id="${esc(x.id)}" title="${esc(x.title)}">${esc(x.title)}</button></td>
      <td>${esc(x.sourceLabel)}</td><td>${sv}</td><td class="num">${esc(money(x.price))}</td><td class="num">${esc(money(x.perServing))}</td><td>${chg}</td><td>${stock}</td></tr>`;
  }

  // 가격 선반 카드 · 이번 주 '재고 주의 제품' → 브랜드 비교에서 그 브랜드를 펼쳐 보여 줌
  function openBrand(brand) {
    Object.assign(S.mk, MK_F_EMPTY, { focus: brand });
    S.mk.open[brand] = true;
    if (S.tab === 'market' && S.subs.market === 'brands' && S.data.shelf && S.data.competitors) drawSub('brands'); else show('market', 'brands');
  }
  function focusBrand() {
    const brand = S.mk.focus;
    if (!brand) return;
    S.mk.focus = '';
    const row = $$(S.root, '[data-brand-row]').find(el => el.dataset.brandRow === brand);
    if (!row) { global.scrollTo(0, 0); return; }
    row.scrollIntoView({ block: 'center' });
    row.classList.add('ins-flash');
    setTimeout(() => row.classList.remove('ins-flash'), 2000);
  }

  /* 경쟁사 — 이번 주 변화 카드 · 브랜드 카드 (competitors.py) */
  const NOT_FOUND = '공개 자료에서 찾지 못함';
  function fieldText(c, key) {
    const v = (c.analysis || {})[key] || {};
    return Array.isArray(v.values) && v.values.length ? v.values.join(', ') : (v.text || '');
  }
  function fieldHtml(c, key, withSrc) {
    if (!c.analyzed) return '<span class="muted small">분석 전</span>';
    const text = fieldText(c, key);
    if (!text || text === NOT_FOUND) return `<span class="ins-none">${esc(NOT_FOUND)}</span>`;
    const src = ((c.analysis[key] || {}).sources || []);
    return esc(text) + (withSrc && src.length ? ` <span class="ins-src">${esc(src.join(' '))}</span>` : '');
  }
  function chanChips(c) {
    return (c.channels || []).map(ch => {
      const label = `${ch.label}${ch.minPrice != null ? ' ' + money(ch.minPrice) : ''}${ch.sold ? ' · ' + ch.sold : ''}${ch.inStock ? '' : ' · 품절'}`;
      const u = safeUrl(ch.link);
      return u ? `<a class="ins-chan ${esc(ch.source)}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
        : `<span class="ins-chan ${esc(ch.source)}">${esc(label)}</span>`;
    }).join('') || '<span class="muted small">이번 진열대에 없음</span>';
  }
  function findComp(id) {
    const d = S.data.competitors || {};
    if (id === 'own') return d.own;
    const all = [].concat(d.table || [], d.substitutes || [], d.archived || []);
    if (String(id).startsWith('b:')) return all.find(c => c.id == null && c.brand === String(id).slice(2));
    return all.find(c => String(c.id) === String(id));
  }

  // 판매량: Yami 'N+ Sold' 중 가장 큰 수 (리뷰 수가 없는 채널의 인기 지표)
  function compSold(c) {
    return Math.max(0, ...(c.channels || []).map(ch => Number((/(\d[\d,]*)\+?\s*sold/i.exec(ch.sold || '') || [])[1]?.replace(/,/g, '')) || 0));
  }
  function compPop(c) {
    if (c.reviews) return `리뷰 ${fmt.num(c.reviews)}`;
    const n = compSold(c);
    return n ? `${n}+ 판매` : '—';
  }
  // AI 칸: 분석 대상이 아니면 이유 + 바로 분석 (등록된 브랜드만)
  function compField(c, key) {
    if (c.own) return '<span class="muted">—</span>';
    if (c.analyzed) return fieldHtml(c, key);
    const why = c.deep ? '분석 전' : '분석 대상 밖';
    return `<span class="muted">${why}</span>${c.id != null ? ` · <button type="button" class="ins-link" data-act="comp-research" data-id="${esc(c.id)}">${icon('spark')}지금 분석</button>` : ''}`;
  }
  function compRow(c) {
    const flags = c.own ? '' : [c.watched ? '<span class="ins-star" title="주시 중">★</span>' : '', c.isNew ? badge('새', 'blue') : ''].join('');
    const forms = (c.forms || []).map(f => esc(f.label.split(' (')[0])).join(', ') || '—';
    const fb = c.feedback || {};
    const fbt = [fb.praise ? `<span class="ins-fb pos">+ ${esc(fb.praise.topic)}</span>` : '', fb.complaint ? `<span class="ins-fb neg">− ${esc(fb.complaint.topic)}</span>` : ''].join('') || '<span class="muted">—</span>';
    const one = (html, title) => `<div class="ins-1l"${title ? ` title="${esc(title)}"` : ''}>${html}</div>`;
    return `<tr class="${c.own ? 'ins-own-row' : ''}" data-act="comp-detail" data-id="${c.own ? 'own' : esc(c.id == null ? 'b:' + c.brand : c.id)}" tabindex="0">
      <td>${one(`<strong${c.own ? ' class="ins-own-name"' : ''}>${esc(c.brand)}</strong>${flags}`, `${c.brand} · ${c.tierLabel}`)}</td>
      <td>${one(`<span class="ins-chans">${chanChips(c)}</span>`)}</td>
      <td class="num nowrap">${esc(compPop(c))}</td>
      <td class="num nowrap">${c.perServing != null ? esc(money(c.perServing)) : '—'}</td>
      <td>${one(forms)}</td>
      <td class="ins-field">${one(compField(c, 'message'), c.analyzed ? fieldText(c, 'message') : '')}</td>
      <td class="ins-field">${one(compField(c, 'ingredients'), c.analyzed ? fieldText(c, 'ingredients') : '')}</td>
      <td>${one(fbt)}</td>
      <td class="num">${c.youtube == null ? '—' : fmt.num(c.youtube)}</td></tr>`;
  }

  // 이번 주 변화: REBOOT 입장(위협 · 기회 · 관찰)으로 나눈 카드 — 칸마다 마케터가 할 일 (곧 품절은 기회)
  const CHG_GROUPS = [['threat', '위협', '맞대응 검토'], ['chance', '기회', '공략하기'], ['watch', '관찰', '지켜보기']];
  // 변화 종류(label) → 이번 주 할 일
  const CHG_TODO = {
    '새 제품': '상세페이지 차별점 점검', '새 상품': '상세페이지 차별점 점검', '가격 인하': '가격·프로모션 비교', '재입고': '재구매 혜택 점검',
    '품절': '그 키워드 광고 늘리기', '곧 품절': '즉시 출고 소재 준비', '가격 인상': '가격 우위 메시지 쓰기',
    '판매 문구 변경': '알디콤 카피와 비교',
  };
  const CHG_FIRST = 3;
  function chgMain(x) {
    if (x.kind === 'price') return `<s>${esc(money(x.prevPrice))}</s><b>${esc(money(x.price))}</b><em class="${x.pct < 0 ? 'down' : 'up'}">${x.pct < 0 ? '▼' : '▲'} ${Math.abs(Math.round(x.pct))}%</em>`;
    if (x.kind === 'message') return (x.added || []).map(t => `<mark>+ ${esc(t)}</mark>`).join('') + (x.removed || []).map(t => `<del>− ${esc(t)}</del>`).join('') || esc(x.text);
    if (x.kind === 'new' && x.price != null) return `<b>${esc(money(x.price))}</b>`;
    if (x.kind === 'low') return `<b>${esc(x.left)}개 남음</b>`;
    return `<b>${x.kind === 'oos' ? '품절' : '다시 판매 중'}</b>`;
  }
  function chgCard(x) {
    const sub = x.kind === 'price' || x.kind === 'message' ? '' : `<small class="ins-chg-title" title="${esc(x.title)}">${esc(x.title)}</small>`;
    const key = [x.brand, x.label, x.title, x.source].join('|');
    const drag = dockable('change', key, { title: `${x.brand || '브랜드 모름'} · ${x.label}`,
      text: [x.title, x.kind === 'price' ? `${money(x.prevPrice)} → ${money(x.price)}` : '', x.impact ? '→ ' + x.impact : ''].filter(Boolean).join('\n'),
      href: '/dashboard/insights#market/changes', url: safeUrl(x.link), data: { brand: x.brand, label: x.label, source: x.source, kind: x.kind, price: x.price, prevPrice: x.prevPrice } });
    return `<article class="ins-chg-card ${esc(x.group)}"${drag}>
      <div class="between"><span class="ins-chg-kind">${esc(x.label)}${CHG_TODO[x.label] ? `<span class="ins-chg-do">${esc(CHG_TODO[x.label])}</span>` : ''}</span>${extLink(x.link, '판매 페이지 보기')}</div>
      <div class="ins-chg-brand"><b>${esc(x.brand || '브랜드 모름')}</b><span class="muted"> · ${esc(x.source)}</span></div>
      <div class="ins-chg-main${x.kind === 'message' ? ' msg' : ''}">${chgMain(x)}</div>${sub}
      ${x.impact ? `<p class="ins-chg-impact">→ ${esc(x.impact)}</p>` : ''}
      <div class="mt-8">${dockBtn('change', key)}</div>
    </article>`;
  }
  // demo: 지난주 수집이 없어 서버가 만든 예시 지난주와 비교한 결과 (competitors.demo_prev)
  function changesHtml(list, demo) {
    if (list == null) return '<p class="small muted">지난주 진열대와 비교할 수 있을 때부터 보여요 (2주차부터).</p>';
    if (!list.length) return '<p class="small muted">이번 주 경쟁 브랜드 변화가 없어요.</p>';
    const by = g => list.filter(x => (x.group || 'watch') === g);
    const tiles = CHG_GROUPS.map(([g, name, desc]) => {
      const its = by(g);
      const kinds = {};
      its.forEach(x => { kinds[x.label] = (kinds[x.label] || 0) + 1; });
      return `<button type="button" class="ins-chg-tile ${g}${S.chg === g ? ' on' : ''}" data-act="chg-group" data-g="${g}" aria-pressed="${S.chg === g}"${its.length ? '' : ' disabled'}>
        <span class="ins-chg-t"><b>${esc(name)}</b>${esc(desc)}</span><strong>${its.length}</strong><small>${Object.entries(kinds).map(([k, n]) =>
          `<span>${esc(`${k} ${n}`)}${CHG_TODO[k] ? `<em> → ${esc(CHG_TODO[k])}</em>` : ''}</span>`).join('') || '<span>없음</span>'}</small></button>`;
    }).join('');
    const groups = S.chg === 'all' ? CHG_GROUPS : CHG_GROUPS.filter(g => g[0] === S.chg);
    const cols = groups.map(([g, name]) => {
      const its = by(g);
      const all = S.chg !== 'all' || S.open['chg-' + g];
      const more = its.length > CHG_FIRST && S.chg === 'all'
        ? `<button type="button" class="btn small ghost" data-act="chg-more" data-g="${g}">${all ? '접기' : `${its.length - CHG_FIRST}개 더 보기`}</button>` : '';
      return `<div class="ins-chg-col"><p class="ins-chg-h ${g}">${esc(name)} ${its.length}</p>
        ${(all ? its : its.slice(0, CHG_FIRST)).map(chgCard).join('') || '<p class="small muted">없음</p>'}${more}</div>`;
    }).join('');
    return `<div class="ins-chg-sum">${tiles}</div><div class="ins-chg-cols${S.chg === 'all' ? '' : ' one'}">${cols}</div>
      <p class="panel-note mt-8">지난주 같은 제품과 비교했어요. '→'는 알디콤에 주는 의미예요. 곧 품절은 Amazon '몇 개 안 남음' 기준이에요. 위협 · 기회 · 관찰 칸을 누르면 그것만 보여요.</p>`;
  }

  const COMP_PAGE_SLOTS = 5;   // 페이지 번호 칸 수
  const COMP_PRICE = [['under1', '$1 미만', v => v < 1], ['1to3', '$1–3', v => v >= 1 && v < 3], ['over3', '$3 이상', v => v >= 3]];
  const COMP_COLS = [['브랜드', 'name'], ['판매처 (최저가)'], ['리뷰 · 판매', 'reviews', 'num'], ['1회분', 'ps', 'num'], ['제형'], ['핵심 메시지'], ['주력 성분'], ['고객 칭찬 / 불만'], ['유튜브', '', 'num']];
  const COMP_W = [170, 250, 95, 80, 130, 230, 175, 140, 70];   // 칸 기본 너비(px)
  // 경쟁사 표 (보관함에서만 씀 · 정렬 없음)
  const compTableHtml = rows => {
    const fc = fixedCols('comp', colWidths('comp', COMP_W));
    const head = COMP_COLS.map(([label, , cls], i) => `<th${cls ? ` class="${cls}"` : ''}>${esc(label)}${colHandle(i)}</th>`).join('');
    return `<div class="table-wrap"><table class="data-table ins-table ins-fixed ins-comp-table"${fc.attr}>${fc.group}<thead><tr>${head}</tr></thead><tbody>${rows.map(compRow).join('')}</tbody></table></div>`;
  };
  // 페이지 버튼: 위치 · 크기 · 칸 수(COMP_PAGE_SLOTS) 고정, 번호는 1–5 · 6–10 묶음으로 (가운데 따라 밀리지 않음) — 없는 페이지 칸은 흐리게
  function compPager(cur, pages, total, from, to, act = 'comp-page', label = '경쟁 브랜드 표 페이지') {
    const first = Math.floor((cur - 1) / COMP_PAGE_SLOTS) * COMP_PAGE_SLOTS + 1;
    const btn = (p, label, extra) => `<button type="button" class="ins-pg${p === cur && !extra ? ' on' : ''}" data-act="${act}" data-p="${p}"${p < 1 || p > pages || (p === cur && !extra) ? ' disabled' : ''}${p === cur && !extra ? ' aria-current="page"' : ''}${extra ? ` aria-label="${extra}"` : ''}>${label}</button>`;
    const slots = Array.from({ length: COMP_PAGE_SLOTS }, (_, k) => first + k).map(p => btn(p, p)).join('');
    return `<div class="ins-pg-row"><span class="small muted">${total ? `${total}개 중 ${from}–${to}` : '0개'}</span>
      <nav class="ins-pg-nav" aria-label="${label}">${btn(cur - 1, '‹', '이전 페이지')}${slots}${btn(cur + 1, '›', '다음 페이지')}</nav></div>`;
  }


  function openCompDetail(c) {
    if (!c) return;
    const srcs = c.sources || [];
    const srcLink = ids => (ids || []).map(id => { const s = srcs.find(x => x.id === id); const u = s && safeUrl(s.url);
      return u ? `<a class="ins-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(id)}</a>` : `<span class="ins-src">${esc(id)}</span>`; }).join(' ');
    const fact = (key, label) => `<div class="ins-bc-item"><span class="field-label">${esc(label)}</span>
      <div>${fieldHtml(c, key)} ${srcLink(((c.analysis || {})[key] || {}).sources)}</div></div>`;
    const fb = c.feedback || {};
    const topics = Object.entries(fb.topics || {}).map(([t, v]) => `${esc(t)} +${v.pos} / −${v.neg}`).join(' · ');
    const prods = (c.products || []).map(p => `<li>${esc(p.title)} <span class="muted small">· ${esc(p.source)} · ${esc(money(p.price))}${p.perServing != null ? ` (1회분 ${esc(money(p.perServing))})` : ''} · ${esc(p.form)}${p.availability ? ' · ' + esc(p.availability) : ''}</span> ${extLink(p.link)}</li>`).join('');
    const hist = (c.history || []).map(h => `<li>${esc(fmt.date(h.savedAt))}: ${h.changed.length ? esc(h.changed.join(', ')) + ' 바뀜' : '바뀐 항목 없음'}</li>`).join('');
    const ai = c.own ? '' : `<h3 class="ins-h3">무슨 말로 파나 ${c.analyzed ? badge('AI 분석', 'purple') : ''}</h3>
      <div class="ins-bc-grid">${fact('message', '핵심 메시지')}${fact('ingredients', '주력 성분')}${fact('retail', '기타 판매처 (오프라인 · 자사몰)')}${fact('news', '최근 소식')}</div>
      <h3 class="ins-h3">알디콤은 ${badge('AI 의견', 'purple')}</h3>
      <div class="ins-bc-grid">${fact('use', '쓸 말')}${fact('avoid', '피할 말 · 주의 표현')}</div>`;
    const body = `<div class="part-insights ins-modal">
      <div class="ins-chans mb-16">${chanChips(c)}</div>
      <p class="small muted">${esc(c.tierLabel)} · 1회분 최저 ${c.perServing != null ? esc(money(c.perServing)) : '—'} · 진열대 리뷰 ${fmt.num(c.reviews || 0)}개${c.rating ? ` · 별점 ${c.rating}` : ''} · 유튜브 언급 ${c.youtube == null ? '—' : fmt.num(c.youtube)}건</p>
      ${ai}
      <h3 class="ins-h3">고객은 어떻게 보나</h3>
      ${fb.reviews ? `<div class="ins-bc-grid">
        <div class="ins-bc-item"><span class="field-label">칭찬 ${fb.praise ? `· ${esc(fb.praise.topic)} ${fb.praise.count}건` : ''}</span><div>${fb.praise ? esc(fb.praise.example) : '<span class="ins-none">칭찬 리뷰 없음</span>'}</div></div>
        <div class="ins-bc-item"><span class="field-label">불만 ${fb.complaint ? `· ${esc(fb.complaint.topic)} ${fb.complaint.count}건` : ''}</span><div>${fb.complaint ? esc(fb.complaint.example) : '<span class="ins-none">불만 리뷰 없음</span>'}</div></div></div>
        <p class="small muted">주제별: ${topics || '—'} (리뷰 ${fmt.num(fb.reviews)}개 기준)</p>` : '<p class="small muted">아직 모은 구매자 리뷰가 없어요.</p>'}
      ${prods ? `<details class="ins-fold mt-16"><summary>진열대 제품 ${(c.products || []).length}개</summary><ul class="ins-ul">${prods}</ul></details>` : ''}
      ${c.own ? '' : `<details class="ins-fold mt-16"><summary>근거 자료 ${srcs.length ? srcs.length + '개' : ''}</summary>${srcs.length ? `<ul class="ins-ul">${srcs.map(s => `<li><b>${esc(s.id)}</b> ${esc(s.type)} · ${esc(s.title)} ${extLink(s.url)}</li>`).join('')}</ul>` : '<p class="small muted">아직 분석 전이에요.</p>'}</details>
      <label class="field-label mt-8" for="comp-site">브랜드 홈페이지 (자동으로 찾고, 틀리면 고치세요)</label>
      <div class="flex"><input id="comp-site" class="grow" data-ref="site" value="${esc(c.website || '')}" placeholder="https://"><button type="button" class="btn small" data-ref="site-save">저장</button></div>
      <h3 class="ins-h3">분석 기록</h3>${hist ? `<ul class="ins-ul">${hist}</ul>` : '<p class="small muted">아직 기록이 없어요.</p>'}
      ${c.id != null ? `<div class="flex wrap mt-16">
        <button type="button" class="btn small" data-ref="research">${icon('refresh')}최신 데이터 받기</button>
        <button type="button" class="btn small ghost" data-ref="watch">${c.watched ? '주시 해제' : '★ 주시'}</button>
        <button type="button" class="btn small ghost" data-ref="status">${c.status === 'archived' ? '복원' : '보관'}</button></div>` : ''}`}</div>`;
    ui.modal({
      title: c.brand, body, wide: true,
      onOpen: el => {
        const close = () => { const x = el.closest('.modal-backdrop'); const b = x && x.querySelector('[data-modal-close]'); if (b) b.click(); };
        const on = (ref, fn) => { const b = $(el, `[data-ref="${ref}"]`); if (b) b.addEventListener('click', () => fn(b)); };
        on('site-save', async btn => {
          ui.busy(btn, true);
          try {
            await api(`/api/insights/competitors/${c.id}`, { website: $(el, '[data-ref="site"]').value }, { method: 'PATCH' });
            toast('홈페이지 주소를 저장했어요. 최신 데이터 받기를 누르면 이 주소를 읽어요.');
            loadData('competitors');
          } catch (e) { toast('홈페이지 주소를 저장하지 못했어요: ' + e.message, 'error'); }
          ui.busy(btn, false);
        });
        on('research', btn => { close(); compAction(btn, 'one', c.id); });
        on('watch', btn => { close(); toggleWatch(btn, c.brand, !c.watched); });
        on('status', btn => { close(); compAction(btn, 'status', c.id, c.status === 'archived' ? 'active' : 'archived'); });
      }
    });
  }

  async function compAction(btn, act, id, status) {
    if (act === 'all' && !(await ui.confirm(`리뷰 상위 ${S.data.competitors.deepTop}개 브랜드를 모두 AI로 다시 분석해요. 브랜드마다 OpenAI 1~2회 · Firecrawl 2~3회를 써요. 진행할까요?`))) return;
    ui.busy(btn, true);
    try {
      if (act === 'discover') {
        const r = await api('/api/insights/competitors/discover', {});
        toast(r.added.length ? `새 경쟁 브랜드 ${r.added.length}개를 등록했어요: ${r.added.slice(0, 5).join(', ')}` : '새로 등록할 경쟁 브랜드가 없어요. 새 제품을 받으려면 최신 데이터 받기에서 Amazon · Yami 진열대를 고르세요.');
        await loadData('competitors');
        return;
      }
      if (act === 'status') {
        await api(`/api/insights/competitors/${id}`, { status }, { method: 'PATCH' });
        toast(status === 'archived' ? '보관함으로 옮겼어요.' : '다시 관리 목록에 넣었어요.');
        await loadData('competitors');
        return;
      }
      await api(act === 'all' ? '/api/insights/competitors/research-all' : `/api/insights/competitors/${id}/research`, {});
      toast('경쟁 브랜드 분석을 시작했어요. 끝나면 표가 새로 그려져요.');
      S.showResult = true;
      checkRun(false);
      ui.busy(btn, false);
    } catch (e) {
      ui.busy(btn, false);
      toast('경쟁 브랜드를 처리하지 못했어요: ' + e.message, 'error');
    }
  }

  async function toggleWatch(btn, brand, on) {
    ui.busy(btn, true);
    try {
      await api('/api/insights/watch', { brand, watch: on }, { method: 'PUT' });
      toast(on ? `${brand}를 주시 목록에 넣었어요.` : `${brand} 주시를 해제했어요.`);
      S.data.shelf = null;
      await loadData('competitors');
    } catch (e) {
      ui.busy(btn, false);
      toast('주시 목록을 바꾸지 못했어요: ' + e.message, 'error');
    }
  }

  /* 구매자 리뷰 — 하위 탭 2개(리뷰 목록 · 브랜드 × 주제). 리뷰 목록은 경쟁사 비교와 같은 짜임:
     대상 버튼 + 검색 → 필터 줄(고르기 칸 · 정렬) → 표 → 칸 고정 페이지 버튼. 행을 누르면 리뷰 카드 창(원문 · 번역 · 대응 · 메모) */
  const hashTag = t => `#${String(t).replace(/\s+/g, '')}`;
  const clip = (t, n) => { const v = String(t || '').replace(/\s+/g, ' ').trim(); return v.length > n ? v.slice(0, n - 1) + '…' : v; };
  function stars(rating) {
    const r = rating == null ? null : Math.round(rating);
    return r == null ? '<span class="muted">—</span>' : `<span class="ins-stars" title="별점 ${esc(rating)}" aria-label="별점 ${esc(rating)}">${'★'.repeat(r)}${'☆'.repeat(Math.max(0, 5 - r))}</span>`;
  }
  function sentBadge(s) { return s === '+' ? badge('칭찬', 'green') : s === '-' ? badge('불만', 'red') : badge('중립'); }

  function reviewsHtml(d) {
    const view = RV_VIEWS.some(([k]) => k === S.rv.view) ? S.rv.view : 'list';
    const n = { list: d.cs.length + d.items.filter(r => !r.own).length, compare: d.table.length };
    const tabs = viewSeg('rv-view', RV_VIEWS.map(([k, l]) => [k, l, n[k]]), view, '구매자 리뷰 보기');
    // 한 줄 답은 맨 위 카드(rvHero)가 맡음 — 질문 카드(qHead)는 두지 않음
    return pageTabs('customers', 'reviews') + rvHero(d) + tabs +
      (view === 'list' ? rvListHtml(d) : compareHtml(d));
  }

  // 맨 위 카드: [알디콤] 한 줄 답 · 평점 · 별점 분포 · 주제 막대(세로선 = 고른 경쟁 브랜드) / [경쟁사] 브랜드마다 잘하는 점 · 약한 점
  // 경쟁사는 제품이 서로 달라 평균으로 묶지 않고 브랜드별로 봄 (아마존 전체 리뷰 기준)
  function rhBars(topics, vs, vsName) {
    return topics.map(t => {
      // 부작용은 비교 안 함: 아마존은 '부작용 없음'을 칭찬으로 세지만 우리 분류는 불만만 셈
      const o = vs && t.name !== '부작용' ? vs.find(y => y.name === t.name) : null;
      const g = o ? t.pct - o.pct : null;
      const on = S.rv.scope !== 'comp' && S.rv.f.topic === t.name;
      return `<button type="button" class="ins-rh-t${on ? ' on' : ''}" data-act="rh-topic" data-t="${esc(t.name)}" aria-pressed="${on}"
          title="칭찬 ${fmt.num(t.pos)} · 불만 ${fmt.num(t.neg)}${o ? ` · ${vsName} 칭찬 ${o.pct}%` : ''}">
        <span class="ins-rh-tn">${esc(hashTag(t.name))}</span>
        <span class="ins-rh-bar"><i class="pos" style="width:${t.pct}%"></i><i class="neg" style="width:${100 - t.pct}%"></i>${o ? `<em style="left:${o.pct}%"></em>` : ''}</span>
        <span class="ins-rh-pct">${t.pct}%${g != null ? ` <small${Math.abs(g) >= 10 ? ' class="big"' : ''}>${g > 0 ? '+' : g < 0 ? '−' : '±'}${Math.abs(g)}%p</small>` : ''}</span></button>`;
    }).join('');
  }
  const rhLegend = vsName => `<p class="ins-rh-lg"><span><i class="pos"></i>칭찬</span><span><i class="neg"></i>불만</span>${vsName ? `<span><i class="tick"></i>${esc(vsName)} 칭찬 비율</span>` : ''}</p>`;
  function rvHero(d) {
    const sm = d.summary;
    if (!sm) return '';
    const own = S.rv.scope !== 'comp';
    const seg = `<div class="linetabs" role="group" aria-label="누구의 리뷰">${[['own', '알디콤'], ['comp', `경쟁 브랜드 ${sm.brands.length}곳`]].map(([k, l]) =>
      `<button type="button" data-act="rv-scope" data-v="${k}"${(k === 'own') === own ? ' class="selected"' : ''} aria-pressed="${(k === 'own') === own}">${l}</button>`).join('')}</div>`;
    return `<section class="card mt-24 ins-rh">${seg}${own ? rhOwn(sm) : rhBrands(sm)}</section>`;
  }
  function rhOwn(sm) {
    const x = sm.own;
    if (!x.topics.length) return '<p class="mt-16">아직 알디콤 리뷰가 없어요. 최신 데이터 받기에서 판매처 리뷰를 고르세요.</p>';
    const vs = sm.brands.find(b => b.brand === S.rv.cmp) || sm.brands.find(b => b.brand === sm.compareDefault);
    const quotes = x.quotes.map(q => `<button type="button" class="ins-rh-q ${q.s === '+' ? 'pos' : 'neg'}" data-act="rv-open" data-id="${esc(q.id)}">
      ${q.ko ? `<b>${esc(q.ko)}</b>` : ''}<span lang="en">“${esc(q.text)}”</span></button>`).join('');
    const pick = sm.brands.length ? `<select class="ins-cf ins-rh-vs" data-ref="rh-vs" aria-label="비교할 경쟁 브랜드">${sm.brands.map(b =>
      `<option value="${esc(b.brand)}"${vs && vs.brand === b.brand ? ' selected' : ''}>${b.watched ? '★ ' : ''}${esc(b.brand)}</option>`).join('')}</select>` : '';
    const starRows = x.stars.map(s => `<div class="ins-rh-s"><span>${s.stars}</span><span class="ins-rh-sb"><i style="width:${s.percent}%"></i></span><span>${s.percent}%</span></div>`).join('');
    return `<h2 class="ins-rh-h">${esc(x.line)}</h2>${quotes ? `<div class="ins-rh-qs">${quotes}</div>` : ''}
      <div class="ins-rh-grid">
        <div><div class="ins-rh-avg">${x.rating == null ? '—' : esc(x.rating.toFixed(1))}</div><p class="ins-rh-who">알디콤 리뷰 ${fmt.num(x.count)}개 · ${esc(x.basis)}</p>${starRows}</div>
        <div><div class="ins-rh-cap"><span>주제별 칭찬 비율</span>${pick ? `<span class="ins-rh-vsl">비교 ${pick}</span>` : ''}</div>
          ${rhBars(x.topics, vs && vs.topics, vs && vs.brand)}${rhLegend(vs && vs.brand)}</div>
      </div>`;
  }
  function rhBrands(sm) {
    if (!sm.brands.length) return '<p class="mt-16">아직 경쟁 브랜드 리뷰가 없어요. 최신 데이터 받기에서 Amazon 진열대를 고르세요.</p>';
    const chip = (v, cls) => v ? `<span class="ins-rh-chip ${cls}">${esc(v.text)} <b>${v.pct}%</b></span>` : '<span></span>';
    const rows = sm.brands.map(b => {
      const open = S.rv.cmpOpen === b.brand;
      return `<li class="${open ? 'open' : ''}"><button type="button" class="ins-rh-b" data-act="rh-brand" data-b="${esc(b.brand)}" aria-expanded="${open}">
          <span class="ins-rh-bn">${b.watched ? '<span class="ins-star">★</span> ' : ''}${esc(b.brand)}</span>
          <span class="ins-rh-br">${b.rating == null ? '—' : esc(b.rating.toFixed(1))} ★ · ${fmt.num(b.count)}개</span>
          ${chip(b.voicePos, 'pos')}${chip(b.voiceNeg, 'neg')}</button>
        ${open ? `<div class="ins-rh-bd">${rhBars(b.topics, sm.own.topics, '알디콤')}${rhLegend('알디콤')}
          <button type="button" class="btn small ghost mt-8" data-act="rh-cmp" data-b="${esc(b.brand)}">알디콤 화면에서 이 브랜드와 비교</button></div>` : ''}</li>`;
    }).join('');
    return `<h2 class="ins-rh-h">경쟁 브랜드마다 잘하는 점 · 약한 점</h2>
      <p class="ins-rh-who">아마존 리뷰 기준 · 리뷰 많은 순 · 누르면 주제별로 알디콤과 비교해요</p>
      <ul class="ins-rh-list">${rows}</ul>`;
  }

  // 대상(알디콤 · 경쟁사 · 전체)별 리뷰. 알디콤 리뷰는 CS 값(제품 라인 · 대응 · 메모)이 붙은 d.cs를 씀
  function rvRows(d, scope) {
    d.cs.forEach(x => { x.own = true; x.brand = x.brand || '알디콤'; });   // CS 목록엔 자사 표시 · 브랜드가 없음
    const comp = d.items.filter(r => !r.own);
    return scope === 'own' ? d.cs : scope === 'comp' ? comp : d.cs.concat(comp);
  }
  // 머리글 정렬 키: [이름, 기본 방향] — 위 정렬 상자의 todo · new · low · high는 머리글 표시만 맞춤 (rvHeadSort)
  const RV_COL_SORTS = { date: ['날짜', -1], src: ['판매처', 1], who: ['브랜드 · 제품', 1], rating: ['별점', -1], s: ['반응', 1], cs: ['대응', 1] };
  function rvHeadSort() {
    return { todo: ['cs', 1], new: ['date', -1], low: ['rating', 1], high: ['rating', -1] }[S.rv.sort] || [S.rv.sort, S.rv.dir];
  }
  function rvScope(v) {
    Object.assign(S.rv, { scope: v || 'own', page: 1, todo: false, shared: false, sort: v === 'own' ? 'todo' : 'new', dir: 1, f: Object.assign({}, RV_F_EMPTY) });
    drawSub('reviews');
  }
  const rvTime = r => { const t = Date.parse(String(r.date || '').replace(/\//g, '-')); return Number.isNaN(t) ? null : t; };
  function rvFiltered(d) {
    const { scope, f, todo } = S.rv;
    const q = S.rv.q.trim().toLowerCase();
    const own = scope === 'own';
    const list = rvRows(d, scope).filter(r => (!f.source || r.source === f.source) && (!f.brand || own || r.brand === f.brand) &&
      (!f.line || !own || r.line === f.line) && (!f.topic || r.topics.includes(f.topic)) && (!f.s || r.sentiment === f.s) &&
      (!f.cs || !own || r.cs === f.cs) && (!todo || r.cs === 'todo') && (!S.rv.shared || r.slackBy) &&
      (!q || `${r.text} ${r.title || ''} ${r.summaryKo || ''} ${r.brand || ''} ${r.product || ''}`.toLowerCase().includes(q)));
    const order = { todo: 0, new: 1, done: 2, skip: 3 };
    const newer = (a, b) => (rvTime(b) || 0) - (rvTime(a) || 0) || b.id - a.id;
    const by = {
      todo: (a, b) => (order[a.cs] ?? 4) - (order[b.cs] ?? 4) || newer(a, b),
      new: newer,
      low: (a, b) => (a.rating ?? 9) - (b.rating ?? 9) || newer(a, b),
      high: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || newer(a, b),
    }[S.rv.sort];
    // 머리글을 눌러 고른 정렬 (RV_COL_SORTS)
    const sent = { '-': 0, '0': 1, '+': 2 };
    const val = { date: rvTime, src: r => r.sourceLabel || r.source, who: r => (own ? r.line : r.brand) || null, rating: r => r.rating,
      s: r => sent[r.sentiment], cs: r => order[r.cs] }[S.rv.sort];
    return list.slice().sort(by || (val ? byVal(val, S.rv.dir, newer) : newer));
  }

  function rvFilterBar(d) {
    const { f, scope } = S.rv;
    const own = scope === 'own';
    const rows = rvRows(d, scope);
    const sel = (k, all, opts) => `<select class="ins-cf${f[k] ? ' on' : ''}" data-rvf="${k}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>${opts.map(([v, l]) =>
      `<option value="${esc(v)}"${f[k] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const sources = [...new Map(rows.map(r => [r.source, r.sourceLabel || r.source])).entries()];
    const brands = [...new Set(rows.map(r => r.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(b => [b, b]);
    const lines = d.lines.filter(l => d.cs.some(x => x.line === l)).map(l => [l, hashTag(l)]);
    const any = f.source || f.topic || f.s || S.rv.shared || (!own && f.brand) || (own && (f.line || f.cs || S.rv.todo));
    const nShared = rows.filter(r => r.slackBy).length;
    const nComp = d.items.filter(r => !r.own).length;
    const scopeSel = `<select class="ins-cf" data-rvf="scope" aria-label="리뷰 대상">${[['own', '알디콤', d.cs.length], ['comp', '경쟁 브랜드', nComp], ['all', '전체', d.cs.length + nComp]].map(([k, l, c]) =>
      `<option value="${k}"${scope === k ? ' selected' : ''}>${esc(l)} 리뷰 (${c})</option>`).join('')}</select>`;
    const sorts = RV_SORTS.filter(([k]) => own || k !== 'todo').concat(RV_COL_SORTS[S.rv.sort] ? [[S.rv.sort, `${RV_COL_SORTS[S.rv.sort][0]} ${S.rv.dir < 0 ? '▼' : '▲'}`]] : []);
    return `<div class="ins-cf-bar"><span class="ins-cf-icon" aria-hidden="true">${icon('filter')}</span>
      ${headSearch('rv-q', S.rv.q, '리뷰 검색', '리뷰 검색 (내용 · 브랜드 · 제품)')}${scopeSel}${sel('source', '판매처', sources)}${own ? sel('line', '제품', lines) : sel('brand', '브랜드', brands)}${sel('topic', '주제', d.topics.map(t => [t, hashTag(t)]))}
      ${sel('s', '반응', [['+', '칭찬'], ['-', '불만'], ['0', '중립']])}
      ${own ? sel('cs', '대응', d.csStatus) + `<button type="button" class="ins-cf${S.rv.todo ? ' on' : ''}" data-act="rv-todo" aria-pressed="${S.rv.todo}">대응 필요만</button>` : ''}
      ${nShared ? `<button type="button" class="ins-cf ins-cf-slack${S.rv.shared ? ' on' : ''}" data-act="rv-shared" aria-pressed="${S.rv.shared}">${icon('chat')}슬랙 공유한 것만 <span class="n">${nShared}</span></button>` : ''}
      ${any ? '<button type="button" class="ins-link" data-act="rv-fclear">필터 지우기</button>' : ''}
      <span class="ins-cf-gap"></span>
      <select class="ins-cf sort" data-rvf="sort" aria-label="정렬">${sorts.map(([k, l]) =>
        `<option value="${k}"${S.rv.sort === k ? ' selected' : ''}>정렬: ${esc(l)}</option>`).join('')}</select></div>`;
  }

  function rvRow(r, own) {
    const pre = r.summaryKo || (r.title ? r.title + ' — ' : '') + r.text;
    const st = (S.data.reviews.csStatus.find(([k]) => k === r.cs) || [])[1];
    const drag = dockable('review', r.id, { title: `리뷰 · ${r.brand || r.sourceLabel || r.source} ${r.rating != null ? '★' + r.rating : ''}`.trim(),
      text: clip(pre, 600), href: '/dashboard/insights#customers/reviews',
      data: { date: r.date, source: r.sourceLabel || r.source, brand: r.brand, rating: r.rating, sentiment: r.sentiment, topics: r.topics } });
    return `<tr class="${r.cs === 'todo' ? 'ins-rv-todo-row' : ''}" data-act="rv-open" data-id="${esc(r.id)}" tabindex="0"${drag}>
      <td class="nowrap small">${esc(r.date || '—')}</td><td class="nowrap">${esc(r.sourceLabel || r.source)}</td>
      ${own ? `<td class="nowrap"><span class="ins-tag">${esc(hashTag(r.line))}</span></td>` : `<td><div class="ins-1l"><strong${r.own ? ' class="ins-own-name"' : ''}>${esc(r.brand || '—')}</strong></div></td>`}
      <td class="nowrap">${stars(r.rating)}</td><td class="nowrap">${sentBadge(r.sentiment)}</td>
      <td><div class="ins-1l">${r.topics.map(t => `<span class="ins-tag">${esc(hashTag(t))}</span>`).join(' ') || '<span class="muted">—</span>'}</div></td>
      <td><div class="ins-1l" title="${esc(clip(pre, 300))}">${r.slackBy ? `<span class="ins-sl" title="${esc(`${r.slackBy} · ${fmt.datetime(r.slackAt)} 슬랙 공유`)}">${icon('chat')}공유</span>` : ''}${esc(pre)}</div></td>
      ${S.rv.scope !== 'comp' ? `<td class="nowrap"><span class="ins-rv-st ${esc(r.cs || '')}">${esc(st || '—')}</span>${r.memo ? ` <span class="muted" title="${esc(r.memo)}">✎</span>` : ''}</td>` : ''}</tr>`;
  }

  function rvTable(d) {
    const own = S.rv.scope === 'own';
    const rows = rvFiltered(d);
    const bar = rvFilterBar(d);
    if (!rows.length) {
      const none = !rvRows(d, S.rv.scope).length;
      return bar + `<div class="mt-16">${ui.empty(none ? (own ? '아직 알디콤 리뷰가 없어요. 최신 데이터 받기에서 \'판매처 리뷰 (Olive Young · Amazon · Yami)\'를 고르세요.' : '아직 경쟁 브랜드 리뷰가 없어요. 최신 데이터 받기에서 Amazon · Weee! 진열대를 고르세요.')
        : '조건에 맞는 리뷰가 없어요. 검색어나 필터를 바꿔 보세요.', 'chat')}</div>`;
    }
    const cols = ['날짜', '판매처', own ? '제품' : '브랜드', '별점', '반응', '주제', '리뷰 (한국어 요약)'].concat(S.rv.scope !== 'comp' ? ['대응'] : []);
    const keys = ['date', 'src', 'who', 'rating', 's', '', '', 'cs'];
    const [hk, hd] = rvHeadSort();
    const fc = fixedCols('rv-' + S.rv.scope, colWidths('rv-' + S.rv.scope, [120, 90, 150, 90, 70, 160, 360, 90].slice(0, cols.length)));
    const pages = Math.max(1, Math.ceil(rows.length / RV_PAGE));
    S.rv.page = Math.min(Math.max(1, S.rv.page), pages);
    const cur = S.rv.page;
    const shown = rows.slice((cur - 1) * RV_PAGE, cur * RV_PAGE);
    const pad = pages > 1 ? `<tr class="ins-pad" aria-hidden="true"><td colspan="${cols.length}"></td></tr>`.repeat(RV_PAGE - shown.length) : '';   // 마지막 페이지도 표 높이 그대로
    return bar + `<div class="table-wrap"><table class="data-table ins-table ins-fixed ins-rv-table${own ? ' own' : ''}"${fc.attr}>${fc.group}<thead><tr>${cols.map((c, i) => (keys[i] ? sortTh(c, 'rv-sort', keys[i], hk, hd, '', colHandle(i)) : `<th>${esc(c)}${colHandle(i)}</th>`)).join('')}</tr></thead>
      <tbody>${shown.map(r => rvRow(r, own)).join('')}${pad}</tbody></table></div>` +
      compPager(cur, pages, rows.length, (cur - 1) * RV_PAGE + 1, (cur - 1) * RV_PAGE + shown.length, 'rv-page', '리뷰 표 페이지');
  }
  function drawRvTable() {
    const box = $(panel(S.tab), '[data-ref="rv-body"]');
    if (box && S.data.reviews) keepFocus(() => { box.innerHTML = rvTable(S.data.reviews); });
  }

  function rvListHtml(d) {
    const ch = d.channels.map(c => `<tr><td>${esc(c.channelLabel)}</td><td>${esc(hashTag(c.line))}</td><td>${extLink(c.url, c.title || '판매 페이지')}</td>
      <td class="num">${c.total == null ? '—' : esc(c.total)}</td><td class="num">${c.avg == null ? '—' : esc(c.avg)}</td><td class="num">${esc(c.got)}</td><td class="small muted">${esc(fmt.date(c.at))}</td></tr>`).join('');
    return `<section class="card mt-24"><div class="card-head wrap"><div class="ins-comp-filter"><div class="ins-head-title"><h2>구매자 리뷰</h2>${badge(`${d.stats.total}개`)}${d.stats.csTodo ? badge(`대응 필요 ${d.stats.csTodo}개`, 'red') : ''}</div></div></div>
        <div data-ref="rv-body">${rvTable(d)}</div>
        <p class="panel-note mt-8">행을 누르면 리뷰 카드가 열려요. 불만 · 부작용 · 배송 문제가 있는 알디콤 리뷰엔 '대응 필요'가 붙어요. 답글은 각 사이트에서 남겨 주세요.</p></section>` +
      (ch ? fold('cs-channels', '판매처별 리뷰 수 (사이트 숫자 · 모은 수)', `<div class="table-wrap"><table class="data-table"><thead><tr><th>판매처</th><th>제품</th><th>판매 페이지</th><th class="num">사이트 리뷰</th><th class="num">평균 별점</th><th class="num">모은 수</th><th>확인</th></tr></thead><tbody>${ch}</tbody></table></div>
        <p class="panel-note mt-8">Olive Young은 영어 리뷰만, Amazon은 대표 리뷰(최대 8개)만 모아요. '사이트 리뷰'는 사이트에 표시된 평가 수예요.</p>`) : '');
  }

  // 리뷰 카드 창: 지금 표의 순서대로 이전 · 다음 리뷰로 넘어감. 대응 · 메모 · 번역은 창 안에서 바로 저장
  function openReview(id) {
    const d = S.data.reviews;
    if (!d) return;
    const list = rvFiltered(d);
    let i = list.findIndex(r => String(r.id) === String(id));
    if (i < 0) return;
    const box = document.createElement('div');
    box.className = 'part-insights ins-modal ins-rv-card';
    let slack = null;   // 열린 슬랙 확인 칸: { text: 서버가 만든 미리 보기, note }
    const draw = () => {
      const r = list[i];
      const x = r.own ? csItem(r.id) || r : r;
      const seg = x.own ? d.csStatus.map(([k, l]) => `<button type="button" data-rv="cs" data-status="${k}"${x.cs === k ? ' class="selected"' : ''} aria-pressed="${x.cs === k}">${esc(l)}</button>`).join('') : '';
      box.innerHTML = `<p class="small muted">${[x.date, x.sourceLabel || x.source, x.own ? hashTag(x.line) : x.brand].filter(Boolean).map(esc).join(' · ')} · ${stars(x.rating)} ${sentBadge(x.sentiment)}
          ${x.topics.map(t => `<span class="ins-tag">${esc(hashTag(t))}</span>`).join(' ')}${x.by === 'ai' ? ' ' + badge('AI 분류', 'purple') : ''}</p>
        ${x.product ? `<p class="small muted mt-8">${esc(x.product)}</p>` : ''}
        ${x.summaryKo ? `<p class="mt-8"><b>${esc(x.summaryKo)}</b> ${badge('AI 요약', 'purple')}</p>` : ''}
        <p class="ins-quote mt-8">${esc(x.title ? x.title + ' — ' : '')}${esc(x.text)}</p>
        <div class="ins-quote ins-ko" data-ko hidden></div>
        <div class="ins-cs-bar">${seg ? `<div class="seg" role="group" aria-label="대응 상태">${seg}</div>` : ''}
          ${ui.trBtn({ act: false, attrs: 'data-rv="ko"' })}
          ${d.slackReady ? `<button type="button" class="btn small${x.slackBy ? ' ins-slack-done' : ''}" data-rv="slack"${slack ? ' aria-pressed="true"' : ''}${x.slackBy ? ' title="누르면 다시 보낼 수 있어요"' : ''}>${x.slackBy
            ? `${icon('check')}슬랙 공유됨 · ${esc(x.slackBy)} ${esc(fmt.date(x.slackAt))}` : `${icon('chat')}슬랙으로 보내기`}</button>` : ''}
          ${x.csBy ? `<span class="small muted">${esc(x.csBy)} · ${esc(fmt.datetime(x.csAt))}</span>` : ''}
</div>
        ${x.own ? `<input class="input ins-memo mt-8" data-rv="memo" value="${esc(x.memo)}" maxlength="1000" placeholder="메모 (예: 답글 남김 · 교환 안내)" aria-label="메모">` : ''}
        ${slack ? `<div class="ins-slack mt-16"><div class="field-label">슬랙에 이렇게 올라가요 (확인 후 보내기)</div>
          <pre class="ins-slack-pre">${esc(slack.text)}</pre>
          <input class="input mt-8" data-rv="note" maxlength="500" value="${esc(slack.note)}" placeholder="한마디 덧붙이기 (선택 · 예: 이 불만 대응 논의 필요)" aria-label="슬랙에 덧붙일 말">
          <div class="flex wrap mt-8"><button type="button" class="btn small lime" data-rv="slack-send">보내기</button><button type="button" class="btn small ghost" data-rv="slack-cancel">취소</button></div></div>` : ''}
        ${d.slackReady ? '' : '<p class="small muted mt-8">설정 › 연결에 Slack 웹훅 주소를 넣으면 이 리뷰를 슬랙 채널로 보낼 수 있어요.</p>'}
        <div class="between mt-16"><button type="button" class="btn small ghost" data-rv="prev"${i ? '' : ' disabled'}>‹ 이전 리뷰</button>
          <span class="small muted">${i + 1} / ${list.length}</span>
          <button type="button" class="btn small ghost" data-rv="next"${i < list.length - 1 ? '' : ' disabled'}>다음 리뷰 ›</button></div>`;
    };
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-rv]');
      if (!b || b.disabled) return;
      const r = list[i];
      if (b.dataset.rv === 'prev' || b.dataset.rv === 'next') { i += b.dataset.rv === 'next' ? 1 : -1; slack = null; draw(); }
      if (b.dataset.rv === 'cs') saveCs(r.id, b.dataset.status, null, b).then(draw);
      if (b.dataset.rv === 'ko') showKo(b, r.id, $(box, '[data-ko]'));
      if (b.dataset.rv === 'slack') slackPreview(b, r.id);
      if (b.dataset.rv === 'slack-cancel') { slack = null; draw(); }
      if (b.dataset.rv === 'slack-send') slackSend(b, r);
    });
    box.addEventListener('change', e => { if (e.target.dataset.rv === 'memo') saveCs(list[i].id, null, e.target.value.trim()); });
    box.addEventListener('input', e => { if (e.target.dataset.rv === 'note' && slack) slack.note = e.target.value; });
    // 슬랙: 미리 보기(서버가 만든 글) → 사람이 '보내기'를 눌러야 보냄
    async function slackPreview(btn, id) {
      if (slack) { slack = null; draw(); return; }
      ui.busy(btn, true);
      try {
        const res = await api(`/api/insights/reviews/${encodeURIComponent(id)}/slack`, { preview: true });
        slack = { text: res.text, note: '' };
        draw();
      } catch (e) { ui.busy(btn, false); toast('슬랙 미리 보기를 만들지 못했어요: ' + e.message, 'error'); }
    }
    async function slackSend(btn, r) {
      ui.busy(btn, true);
      try {
        const res = await api(`/api/insights/reviews/${encodeURIComponent(r.id)}/slack`, { note: (slack.note || '').trim() });
        [r, csItem(r.id), (d.items || []).find(y => String(y.id) === String(r.id))].forEach(y => { if (y) Object.assign(y, { slackBy: res.slackBy, slackAt: res.slackAt }); });
        slack = null;
        toast('슬랙 채널에 보냈어요.');
        draw();
      } catch (e) { ui.busy(btn, false); toast('슬랙에 보내지 못했어요: ' + e.message, 'error'); }
    }
    draw();
    ui.modal({ title: '리뷰 카드', body: box, wide: true });
  }

  /* 브랜드 × 주제 표: 경쟁사 표와 같은 고정 칸(끌어서 너비 조절 · 기억) + 머리글 정렬.
     알디콤은 늘 맨 위, 행이 많으면 표 안에서 스크롤(머리글 고정) */
  const RVM_W = [200, 80, 90];   // 브랜드 · 리뷰 · 평균 별점 — 주제 칸은 RVM_TOPIC_W씩
  const RVM_TOPIC_W = 110;
  function rvmVal(b, k) {
    if (k === 'brand') return b.brand.toLowerCase();
    if (k === 'total') return b.total;
    if (k === 'avg') return b.avgRating;
    const c = b.topics[k.slice(2)];   // 't:주제' → 칭찬 + 불만 수
    return c ? c.pos + c.neg : 0;
  }
  function rvmTable(d) {
    if (!d.table.length) return ui.empty('아직 리뷰가 없어요. 최신 데이터 받기에서 Amazon · Weee! 진열대를 고르세요.', 'chat');
    const { sort, dir } = S.rvm;
    const own = d.table.filter(b => b.own);
    const rest = d.table.filter(b => !b.own);
    const rows = own.concat(sort ? rest.slice().sort(byVal(b => rvmVal(b, sort), dir, (a, b) => b.total - a.total)) : rest);
    const fc = fixedCols('rvm', colWidths('rvm', RVM_W.concat(d.topics.map(() => RVM_TOPIC_W))));
    const head = [['브랜드', 'brand', ''], ['리뷰', 'total', 'num'], ['평균 별점', 'avg', 'num']].concat(d.topics.map(t => [t, 't:' + t, '']))
      .map(([label, k, cls], i) => sortTh(label, 'rvm-sort', k, sort, dir, cls, colHandle(i))).join('');
    const cell = (b, t) => {
      const c = b.topics[t];
      if (!c.pos && !c.neg) return '<td class="muted">—</td>';
      return `<td class="nowrap">${c.pos ? `<button type="button" class="ins-cell pos" data-act="rv" data-brand="${esc(b.brand)}" data-own="${b.own ? 1 : ''}" data-topic="${esc(t)}" data-s="+">+${c.pos}</button>` : ''}` +
        `${c.neg ? `<button type="button" class="ins-cell neg" data-act="rv" data-brand="${esc(b.brand)}" data-own="${b.own ? 1 : ''}" data-topic="${esc(t)}" data-s="-">−${c.neg}</button>` : ''}</td>`;
    };
    const tr = b => `<tr class="${b.own ? 'ins-own-row' : ''}"><td><div class="ins-1l" title="${esc(b.brand)}">${b.watched ? '<span class="ins-star">★</span> ' : ''}${b.own ? `<span class="ins-own-name">${esc(b.brand)}</span>` : esc(b.brand)}</div></td>
      <td class="num">${esc(b.total)}</td><td class="num">${b.avgRating == null ? '—' : esc(b.avgRating)}</td>${d.topics.map(t => cell(b, t)).join('')}</tr>`;
    return `<p class="small muted mb-8">브랜드 ${d.table.length}개</p><div class="table-wrap ins-rvm-scroll"><table class="data-table ins-table ins-fixed ins-matrix"${fc.attr}>${fc.group}<thead><tr>${head}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  }
  function drawRvmTable() {
    const box = $(panel(S.tab), '[data-ref="rvm-body"]');
    if (box && S.data.reviews) keepFocus(() => { box.innerHTML = rvmTable(S.data.reviews); });
  }

  function compareHtml(d) {
    // 브랜드 × 주제 · 아마존 리뷰 요약: 제목 줄을 눌러 접기 · 펴기 (처음엔 펼침, 접은 상태는 화면에 남김)
    return `<details class="ins-fold ins-fold-h card mt-24" data-fold="rv-matrix"${S.open['rv-matrix'] !== false ? ' open' : ''}><summary><h2>브랜드 × 주제<span class="head-cap">+칭찬 / −불만을 누르면 리뷰 목록에서 그 리뷰만 보여요 · 머리글을 누르면 정렬</span></h2></summary>
        <div class="ins-fold-body"><div data-ref="rvm-body">${rvmTable(d)}</div>
        <p class="panel-note mt-8">Amazon은 대표 리뷰만 모아요. 주제 · 칭찬/불만은 단어와 별점(4~5 칭찬 · 1~2 불만 · 3점은 빼요)으로 나누고, OpenAI 키가 있으면 AI가 다시 나눠요. 주제 칸 정렬은 칭찬 + 불만 수 기준이에요.</p></div></details>
      <details class="ins-fold ins-fold-h card mt-24" data-fold="rv-sum"${S.open['rv-sum'] !== false ? ' open' : ''}><summary><h2>아마존 리뷰 요약</h2>${badge(`${d.summaries.length}개`)}${badge('원문')}</summary>
        <div class="ins-fold-body"><div data-ref="sum-body">${sumTable(d)}</div>
        ${d.summaries.length ? '<p class="panel-note mt-8">행을 누르면 요약 원문과 번역 · 아마존 리뷰 링크가 열려요.</p>' : ''}</div></details>`;
  }

  // 아마존 리뷰 요약 표: 구매자 리뷰 표와 같은 규칙 (검색 · 고정 칸 · 한 페이지 RV_PAGE개 · 마지막 페이지도 높이 그대로)
  function sumRows(d) {
    const q = S.sum.q.trim().toLowerCase();
    return d.summaries.filter(s => !q || `${s.title} ${s.asin} ${s.text}`.toLowerCase().includes(q))
      .sort((a, b) => (a.title || a.asin).localeCompare(b.title || b.asin) * S.sum.dir);
  }
  function sumTable(d) {
    if (!d.summaries.length) return '<p class="small muted">아마존 제품 상세 조회 때 리뷰 요약이 있으면 여기에 보여요.</p>';
    const bar = `<div class="ins-cf-bar">${headSearch('sum-q', S.sum.q, '요약 검색', '아마존 리뷰 요약 검색 (제품 · 내용)')}</div>`;
    const rows = sumRows(d);
    if (!rows.length) return bar + `<div class="mt-16">${ui.empty('조건에 맞는 요약이 없어요. 검색어를 바꿔 보세요.', 'chat')}</div>`;
    const cols = ['제품', '리뷰 요약 (원문)'];
    const fc = fixedCols('sum', colWidths('sum', [300, 600]));
    const pages = Math.max(1, Math.ceil(rows.length / RV_PAGE));
    S.sum.page = Math.min(Math.max(1, S.sum.page), pages);
    const cur = S.sum.page;
    const shown = rows.slice((cur - 1) * RV_PAGE, cur * RV_PAGE);
    const pad = pages > 1 ? `<tr class="ins-pad" aria-hidden="true"><td colspan="${cols.length}"></td></tr>`.repeat(RV_PAGE - shown.length) : '';
    const tr = s => `<tr data-act="sum-open" data-asin="${esc(s.asin)}" tabindex="0">
      <td><div class="ins-1l" title="${esc(s.title || s.asin)}"><strong>${esc(s.title || s.asin)}</strong></div></td>
      <td><div class="ins-1l" title="${esc(clip(s.text, 300))}">${esc(s.text)}</div></td></tr>`;
    return bar + `<div class="table-wrap"><table class="data-table ins-table ins-fixed ins-rv-table"${fc.attr}>${fc.group}<thead><tr>${sortTh(cols[0], 'sum-sort', 'title', 'title', S.sum.dir, '', colHandle(0))}<th>${esc(cols[1])}${colHandle(1)}</th></tr></thead>
      <tbody>${shown.map(tr).join('')}${pad}</tbody></table></div>` +
      compPager(cur, pages, rows.length, (cur - 1) * RV_PAGE + 1, (cur - 1) * RV_PAGE + shown.length, 'sum-page', '아마존 리뷰 요약 페이지');
  }
  function drawSumTable() {
    const box = $(panel(S.tab), '[data-ref="sum-body"]');
    if (box && S.data.reviews) keepFocus(() => { box.innerHTML = sumTable(S.data.reviews); });
  }
  // 요약 창: 원문 + 번역 보기(AI · 한 번 받은 번역은 창에 남김) + 아마존 리뷰 원문 링크
  function openSum(asin) {
    const s = ((S.data.reviews || {}).summaries || []).find(x => String(x.asin) === String(asin));
    if (!s) return;
    const box = document.createElement('div');
    box.className = 'part-insights ins-modal';
    box.innerHTML = `<p class="small muted">ASIN ${esc(s.asin)}</p><p class="ins-quote mt-8">${esc(s.text)}</p>
      <div class="ins-sum-act">${ui.trBtn({ act: false, attrs: 'data-sum="ko"' })}
        ${extLink(`https://www.amazon.com/dp/${encodeURIComponent(s.asin)}#customerReviews`, '아마존에서 리뷰 보기')}</div>
      <div class="ins-sum-ko" data-ko hidden></div>`;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-sum="ko"]');
      if (b) showKo(b, null, $(box, '[data-ko]'), `/api/insights/amazon-summaries/${encodeURIComponent(s.asin)}/translate`);
    });
    ui.modal({ title: s.title || s.asin, body: box, wide: true });
  }

  // 브랜드 × 주제 칸 → 리뷰 목록으로 넘어가 그 브랜드 · 주제 · 반응만
  function jumpToReviews(brand, own, topic, s) {
    Object.assign(S.rv, { view: 'list', scope: own ? 'own' : 'comp', q: '', todo: false, shared: false, page: 1, f: Object.assign({}, RV_F_EMPTY, { brand: own ? '' : brand, topic, s }) });
    store.set('rvView', 'list');
    drawSub('reviews');
    const t = $(panel(S.tab), '[data-ref="rv-body"]');
    if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function csItem(id) { return ((S.data.reviews || {}).cs || []).find(x => String(x.id) === String(id)); }

  async function saveCs(id, status, memo, btn) {
    const x = csItem(id);
    if (!x) return;
    if (btn) ui.busy(btn, true);
    try {
      const res = await api(`/api/insights/reviews/${encodeURIComponent(id)}/cs`, { status: status || x.cs, memo: memo == null ? x.memo : memo });
      Object.assign(x, { cs: res.cs, csAuto: res.csAuto, memo: res.memo, csBy: res.csBy, csAt: res.csAt });
      S.data.reviews.stats.csTodo = S.data.reviews.cs.filter(y => y.cs === 'todo').length;
      drawRvTable();
      if (!status) toast('메모를 저장했어요.');
    } catch (e) {
      if (btn) ui.busy(btn, false);
      toast('저장하지 못했어요: ' + e.message, 'error');
    }
  }

  // url을 주면 그 주소로 번역 (아마존 리뷰 요약), 없으면 리뷰 번호로
  async function showKo(btn, id, box, url) {
    if (!box) return;
    if (box.dataset.loaded) { box.hidden = !box.hidden; ui.trOn(btn, !box.hidden); return; }
    ui.busy(btn, true);
    try {
      const res = await api(url || `/api/insights/reviews/${encodeURIComponent(id)}/translate`, {});
      box.innerHTML = `${badge('AI 번역', 'purple')}<p>${esc(res.textKo)}</p>`;
      box.dataset.loaded = '1';
      box.hidden = false;
      ui.busy(btn, false);
      ui.trOn(btn, true);
    } catch (e) {
      ui.busy(btn, false);
      toast('번역하지 못했어요: ' + e.message, 'error');
    }
  }

  /* 유튜브 댓글: 숙취해소 영상 댓글 중 구매 전 질문을 주제별로 셈 */
  function audienceHtml(d) {
    if (!d.month) {
      return qHead('audience', '') + pageTabs('customers', 'audience') + `<div class="mt-24">${ui.empty('아직 유튜브 데이터가 없어요. 월간 분석 실행에서 \'유튜브 댓글\'을 고르세요 (설정 › 연결에 YouTube 키 필요 · 약 1,000 units).', 'video')}</div>`;
    }
    const months = d.months.length > 1 ? `<select class="input ins-sel" data-ref="aud-month" aria-label="월">${d.months.map(m => `<option${m === d.month ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>` : '';
    const qTotal = d.questions.reduce((s, x) => s + x.count, 0);
    const qMax = d.questions.length ? d.questions[0].count : 1;
    const q = d.questions.map((x, i) => `<button type="button" class="ins-aq" data-act="aud-q" data-i="${i}">
        <span class="ins-aq-rank">${i + 1}</span><b>${esc(x.label)}</b>
        <span class="progress-track"><i style="width:${Math.round(x.count / qMax * 100)}%"></i></span>
        <span class="ins-aq-n">${esc(x.count)}건 <small>${Math.round(x.count / qTotal * 100)}%</small></span></button>`).join('');
    const ex = d.expressions.map(x => `<li><div class="between"><b>"${esc(x.phrase)}"</b>${badge(`${x.count}개 댓글`)}</div><small>${esc(x.example)}</small></li>`).join('');
    const p = d.process;
    const sets = p.queries || {};
    const proc = `${ui.row('검색어 세트', esc(['A', 'B', 'K'].map(k => `${k} ${(sets[k] || []).length}개`).join(' · ')))}
      ${ui.row('찾은 영상', esc(`${p.found}개 (세트별 ${Object.keys(p.bySet || {}).map(k => `${k} ${p.bySet[k]}`).join(' · ') || '—'})`))}
      ${ui.row(`조회수 ${fmt.num(p.minViews)} 이상`, esc(`${p.kept}개`))}
      ${ui.row('댓글', esc(`${p.comments}개 중 관련 ${p.relevant}개 (AI 분류 ${p.ai}개)`))}
      <p class="panel-note mt-8">잡담 같은 무관한 댓글은 걸러요(키가 있으면 AI로 한 번 더). 작성자 이름은 저장하지 않아요.</p>`;
    const comments = d.comments.map(c => audComment(c, true)).join('');
    return qHead('audience', d.oneLine, months) + pageTabs('customers', 'audience') +
      `<section class="card mt-24"><div class="card-head"><h2>사기 전에 묻는 것</h2>${badge(`질문 ${qTotal}건`)}</div>
          <p class="small muted">숙취해소 영상 댓글 중 질문만 주제별로 셌어요. 누르면 실제 댓글을 볼 수 있어요.</p>
          ${q ? `<div class="ins-aq-list">${q}</div>` : '<p class="small muted mt-16">질문 댓글이 없어요.</p>'}</section>` + fold('aud-expr', '자주 쓰는 표현', ex ? `<ul class="ins-list">${ex}</ul>` : '<p class="small muted">반복되는 표현이 없어요.</p>') +
      fold('aud-comments', `댓글 원문 (${d.comments.length}개)`, comments ? `<ul class="ins-reviews">${comments}</ul>` : '<p class="small muted">없음</p>') +
      fold('aud-process', '수집 과정', proc);
  }

  /* 댓글 한 줄: 누르면 유튜브 영상의 그 댓글 위치로 (lc=댓글 id) */
  function audComment(c, withTopic) {
    const url = c.videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}${c.id ? `&lc=${encodeURIComponent(c.id)}` : ''}` : '';
    const inner = `<p>${esc(c.text)}</p><small class="muted">${withTopic && c.question && c.topic ? `질문 ·${esc(c.topic)} · ` : ''}좋아요 ${esc(c.likes == null ? 0 : c.likes)} · ${esc(c.video)}${url ? ` ${icon('up')}` : ''}</small>`;
    return url ? `<li><a class="ins-aud-cm" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="유튜브에서 보기">${inner}</a></li>` : `<li>${inner}</li>`;
  }

  function openAudQuestion(i) {
    const d = S.data.audience || {};
    const x = (d.questions || [])[i];
    if (!x) return;
    const items = (d.comments || []).filter(c => c.question && c.topic === x.label);
    const list = items.length ? items.map(c => audComment(c, false))
      : x.examples.map(e => `<li><p>${esc(e)}</p></li>`);
    const body = `<div class="part-insights ins-modal"><p>${esc(x.label)} · 질문 ${esc(x.count)}건</p><ul class="ins-reviews">${list.join('')}</ul></div>`;
    ui.modal({ title: x.label, body, wide: true });
  }

  /* 정확도 검증: 유튜브 댓글 VOC 분류를 사람 정답 76건으로 채점 (README '정확도 검증') */
  function accuracyHtml(d) {
    const s = d.saved;
    const name = Object.fromEntries(d.methods);
    const tl = k => (k === 'none' ? '-' : d.topicLabels[k] || k);
    const ox = v => (v ? 'O' : 'X');
    const ans = a => `${ox(a.relevant)} · ${ox(a.question)} · ${esc(tl(a.topic))}`;
    const run = `<button type="button" class="btn small" data-act="ins-update-only" data-items="accuracy">${icon('refresh')}채점 실행</button>`;
    const one = s ? `${Object.keys(s.methods).length > 1 ? '가장 높은 ' : ''}${name[s.winner]} 방식이 정답 ${s.tests}건 중 ${s.methods[s.winner].exact}%를 맞혔어요 (세 칸 모두 일치 기준).`
      : '아직 채점 전이에요. 채점 실행을 누르면 세 방식을 같은 정답으로 비교해요.';
    const ec = d.exampleCounts, tc = d.testCounts;
    const how = `<section class="card"><div class="card-head"><h2>검증 방법</h2>${badge('사람 정답', 'lime')}</div>
      <div class="workflow-step"><span class="stepnum">01</span>유튜브 댓글 100건에 사람이 정답(관련 · 질문 · 주제)을 붙였어요</div>
      <div class="workflow-step"><span class="stepnum">02</span>그중 ${ec.total}건은 AI 프롬프트에 예시(퓨샷)로 넣고, 나머지 ${tc.total}건은 채점에만 써요 (겹치지 않음)</div>
      <div class="workflow-step"><span class="stepnum">03</span>같은 ${tc.total}건을 규칙 / AI 예시 없이 / AI 예시 포함으로 분류해 맞은 비율을 봐요</div>
      <div class="workflow-step"><span class="stepnum">04</span>VOC 분류(최신 데이터 받기)는 예시 포함 방식을 써요. AI는 답마다 판단 근거를 먼저 써요</div>
      <p class="panel-note mt-8">채점용: 관련 ${tc.relevant} · 질문 ${tc.question}건 / 예시: 관련 ${ec.relevant} · 질문 ${ec.question}건.
        정답이 적은 주제(구매처 · 가격 · 맛 · 비교 질문은 0건)는 정확도를 말하기 어려워요.</p></section>`;
    let table = '';
    if (s) {
      const keys = d.methods.map(m => m[0]).filter(k => s.methods[k]);
      table = `<section class="card"><div class="card-head"><h2>채점 결과<span class="head-cap">${esc(fmt.datetime(s.at))}${s.model ? ` · ${esc(s.model)}` : ''}</span></h2></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>방식</th>${d.fields.map(f => `<th>${esc(f[1])}</th>`).join('')}<th>틀린 댓글</th></tr></thead>
        <tbody>${keys.map(k => { const m = s.methods[k]; return `<tr${k === s.winner ? ' class="selected"' : ''}><td><b>${esc(name[k])}</b>${k === s.winner && keys.length > 1 ? ` ${badge('가장 높음', 'lime')}` : ''}</td>
          ${d.fields.map(f => `<td>${esc(m[f[0]])}%</td>`).join('')}<td>${esc(m.wrong.length)}건</td></tr>`; }).join('')}</tbody></table></div>
        ${s.methods.few ? '' : '<p class="panel-note mt-8">AI 키가 없어 규칙만 채점했어요.</p>'}</section>`;
      table += keys.map(k => fold(`acc-wrong-${k}`, `${name[k]} · 틀린 댓글 ${s.methods[k].wrong.length}건 (정답 / 분류 결과: 관련 · 질문 · 주제)`,
        `<ul class="ins-reviews">${s.methods[k].wrong.map(w => `<li><p>#${esc(w.no)} ${esc(w.text)}</p>
          <small class="muted">정답 ${ans(w.gold)} / 분류 ${ans(w.pred)}</small></li>`).join('')}</ul>`)).join('');
    }
    const ex = fold('acc-examples', `프롬프트에 넣는 예시 ${d.examples.length}건 (퓨샷)`,
      `<ul class="ins-reviews">${d.examples.map(x => `<li><p>${esc(x.text)}</p><small class="muted">${ans(x)} · 근거: ${esc(x.reason)}</small></li>`).join('')}</ul>`);
    return qHead('accuracy', one, run) + pageTabs('manage', 'accuracy') + `<div class="stack mt-24">${table}${how}</div>${ex}
      ${d.aiReady ? '' : '<p class="panel-note mt-8">AI 키가 없으면 규칙만 채점해요 (설정 › 연결).</p>'}`;
  }

  /* ═════════ 데이터 업데이트 ═════════ */
  function costText(cost) {
    const parts = Object.keys(cost || {}).filter(k => cost[k]).map(k => `${USE_LABEL[k]} 약 ${fmt.num(cost[k])}${USE_UNIT[k]}`);
    return parts.join(' · ') || '무료';
  }

  async function openUpdate(preset, only) {
    let plan;
    try { plan = await api('/api/insights/update/plan'); } catch (e) { toast('받을 항목을 불러오지 못했어요: ' + e.message, 'error'); return; }
    if (plan.running) { toast('이미 최신 데이터를 받는 중이에요.'); checkRun(false); return; }
    const want = only && only.length ? new Set(only)
      : new Set(plan.items.filter(i => !i.manual && (preset === 'monthly' ? i.group === 'monthly' || i.id === 'reviews' : i.group === 'weekly')).map(i => i.id));
    const row = i => `<label class="ins-item${i.ready ? '' : ' off'}">
      <input type="checkbox" data-item="${esc(i.id)}"${want.has(i.id) && i.ready ? ' checked' : ''}${i.ready ? '' : ' disabled'}>
      <span class="grow"><b>${esc(i.label)}</b> <span class="small muted">${esc(i.desc)}</span>
        ${i.missing.length ? `<span class="ins-miss">${i.missing.map(k => badge(`${KEY_LABEL[k] || k} 키 없음`, 'red')).join(' ')}</span>` : ''}
        ${i.note ? `<small class="hint">${esc(i.note)}</small>` : ''}</span>
      <span class="ins-cost">${esc(costText(i.cost))}</span></label>`;
    const weekly = plan.items.filter(i => i.group === 'weekly');
    const monthly = plan.items.filter(i => i.group === 'monthly');
    const used = plan.usage || {};
    const lim = plan.limits || {};
    const missing = plan.items.some(i => i.missing.length);
    const body = `<div class="part-insights ins-modal">
      <p>항목을 골라 시작하세요. 수집은 서버가 뒤에서 하고, 이 화면에서 진행 상황을 볼 수 있어요. 같은 주에 다시 모으면 그 주 결과를 새로 바꿔요.</p>
      <h3 class="ins-h3">이번 주 데이터<span class="head-cap">${esc(plan.week)}</span></h3>${weekly.map(row).join('')}
      <h3 class="ins-h3">월간 분석<span class="head-cap">${esc(plan.reviewMonth)} 기준 (1~7일에는 지난달)</span></h3>${monthly.map(row).join('')}
      <div class="note lime mt-16" data-ref="total"></div>
      <div class="ins-usage mt-8">
        <span>이 대시보드가 쓴 양</span>
        <span>SerpApi ${esc(fmt.num(used.serpapi))} / ${esc(fmt.num(lim.serpapi))}회 (이번 달)</span>
        <span>Firecrawl ${esc(fmt.num(used.firecrawl))} / ${esc(fmt.num(lim.firecrawl))} (이번 달)</span>
        <span>YouTube ${esc(fmt.num(used.youtube))} / ${esc(fmt.num(lim.youtube))} units (24시간)</span>
        <span>OpenAI ${esc(fmt.num(used.openai))}회</span>
      </div>
      ${missing ? '<div class="note warn mt-8">키가 없는 항목은 <a class="link" href="/dashboard/settings#connections">설정 › 연결</a>에서 키를 넣으면 쓸 수 있어요.</div>' : ''}
      <div class="note error mt-8" data-ref="err" hidden></div>
    </div>`;
    const drawTotal = el => {
      const total = {};
      $$(el, '[data-item]:checked').forEach(c => {
        const it = plan.items.find(i => i.id === c.dataset.item);
        Object.keys(it.cost || {}).forEach(k => { total[k] = (total[k] || 0) + (it.cost[k] || 0); });
      });
      const box = $(el, '[data-ref="total"]');
      const n = $$(el, '[data-item]:checked').length;
      box.textContent = n ? `선택한 ${n}개 항목 예상 비용: ${costText(total)}` : '항목을 하나 이상 고르세요.';
    };
    ui.modal({
      title: preset === 'monthly' ? '월간 분석 실행' : '최신 데이터 받기', body, wide: true,
      onOpen: el => { el.addEventListener('change', () => drawTotal(el)); drawTotal(el); },
      actions: [{ label: '취소', value: null }, {
        label: '시작', tone: 'lime',
        onClick: (el, btn) => { startUpdate(el, btn); return false; }
      }]
    });
  }

  async function startUpdate(el, btn) {
    const items = $$(el, '[data-item]:checked').map(c => c.dataset.item);
    const err = $(el, '[data-ref="err"]');
    if (!items.length) { err.textContent = '항목을 하나 이상 고르세요.'; err.hidden = false; return; }
    ui.busy(btn, true);
    try {
      await api('/api/insights/update', { items });
      const x = el.closest('.modal-backdrop');
      const close = x && x.querySelector('[data-modal-close]');
      if (close) close.click();
      toast('최신 데이터를 받기 시작했어요. 끝나면 화면이 새로 그려져요.');
      S.showResult = true;
      checkRun(false);
    } catch (e) {
      ui.busy(btn, false);
      err.textContent = '시작하지 못했어요: ' + e.message;
      err.hidden = false;
    }
  }

  async function checkRun(initial) {
    clearTimeout(S.poll);
    let st;
    try { st = await api('/api/insights/update/status'); } catch (e) { return; }
    S.run = st.run;
    if (st.running) {
      S.showResult = true;
      S.wasRunning = true;
      drawRun(st.run, true);
      S.poll = setTimeout(() => checkRun(false), 2500);
      return;
    }
    if (S.wasRunning && !initial) {
      S.wasRunning = false;
      const r = st.run || {};
      const label = { done: '최신 데이터를 다 받았어요.', partial: '최신 데이터를 받았어요 (일부 받기 실패 · 결과를 확인하세요).', failed: '받기 실패 — 최신 데이터를 받지 못했어요. 결과를 확인하세요.' }[r.status] || '최신 데이터를 다 받았어요.';
      toast(label, r.status === 'done' ? undefined : 'error');
      S.data = {};
      S.monthly = null;
      trendP = null;
      personaP = null;
      await loadWeekly();
      if (S.tab === 'monthly') loadMonthly(S.month);
      if (SUBS[S.tab]) showSub(curSub());
    }
    drawRun(st.run, false);
  }

  function drawRun(run, running) {
    const box = $(S.root, '[data-ref="run"]');
    if (!box) return;
    if (!run || (!running && !S.showResult)) { box.hidden = true; box.innerHTML = ''; return; }
    const items = run.items || [];
    const res = run.results || {};
    const li = id => {
      const r = res[id];
      const state = r ? (r.ok ? 'ok' : 'fail') : (run.current === id ? 'now' : 'wait');
      const mark = { ok: icon('check'), fail: icon('x'), now: '<span class="spinner" aria-hidden="true"></span>', wait: '' }[state];
      return `<li class="${state}"><span class="ins-mark">${mark}</span><b>${esc(ITEM_LABEL[id] || id)}</b>${r ? `<span class="small">${esc(r.message)}</span>` : state === 'now' ? '<span class="small muted">받는 중…</span>' : '<span class="small muted">대기</span>'}</li>`;
    };
    const tone = running ? 'blue' : { done: 'green', partial: 'orange', failed: 'red' }[run.status];
    const label = running ? '받는 중…' : { done: '완료', partial: '일부 받기 실패', failed: '받기 실패' }[run.status] || run.status;
    box.hidden = false;
    box.className = `ins-run card ${running ? 'is-running' : ''}`;
    box.innerHTML = `<div class="between"><div class="flex"><h2>최신 데이터 받기</h2>${badge(label, tone)}<span class="small muted">${esc(fmt.datetime(run.startedAt))} · ${esc(run.user || '')}</span></div>
        <div class="flex"><button type="button" class="btn small ghost" data-act="run-fold" aria-expanded="${!S.runFold}">${S.runFold ? '펼치기' : '접기'}</button>
        ${running ? '' : '<button type="button" class="btn small ghost" data-act="run-close" aria-label="닫기">닫기</button>'}</div></div>
      <ul class="ins-steps-list"${S.runFold ? ' hidden' : ''}>${items.map(li).join('')}</ul>
      ${res._ && !S.runFold ? `<p class="small">${esc(res._.message)}</p>` : ''}`;
  }

  REBOOT.register({
    id: 'insights', label: '인사이트', order: 20,
    render,
    summary: () => {
      const s = store.get('summary', null);
      return s && typeof s.urgent === 'number' ? { label: '이번 주 긴급 액션', value: s.urgent } : null;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
