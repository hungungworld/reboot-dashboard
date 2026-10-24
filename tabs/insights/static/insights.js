/* 시장 · 고객 인사이트 (담당: 이현경) — tabs/insights/docs/README.md '3번째 대시보드'.
   탭: 주간 리뷰 · 월간 리뷰 · 데이터(진열대 · 경쟁사 · 구매자 리뷰 · 유튜브 댓글 · 뉴스 수집 · 정확도 검증)
   - 뉴스 수집: 홈 › 미국 시장 브리핑에서 '보관'한 기사 (홈 API /api/home/news/saved를 읽기만 · 보관 해제)
   - 검색 수요 탭은 2026-10-25 삭제 → '다음 급등 예상'은 홈 › 콘텐츠 캘린더 맨 아래로 옮김
   - 판단은 규칙(서버 rules.py), AI는 문장 · 분류 · 요약만 (AI 배지 · 참고용)
   - 데이터 업데이트는 서버가 뒤에서 실행 → 이 화면은 진행 상황만 봄
   - 다른 파트에는 REBOOT.use('insights')로 searchTrend · personas 공개 (Promise · 없으면 빈 값)
   주소: #weekly · #monthly · #data/shelf 처럼 탭을 바로 열 수 있음 */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  if (!REBOOT) throw new Error('insights: REBOOT core를 먼저 불러와야 합니다');
  const ui = REBOOT.ui;
  const { esc, badge, icon, fmt, toast } = ui;
  const api = REBOOT.api;
  const store = REBOOT.store('insights');   // 저장 키: reboot:insights:summary (메뉴 숫자용)

  const TABS = [['weekly', '주간 리뷰'], ['monthly', '월간 리뷰'], ['data', '데이터']];
  const DATA_TABS = [['shelf', '진열대'], ['competitors', '경쟁사'], ['reviews', '구매자 리뷰'], ['audience', '유튜브 댓글'],
    ['news', '뉴스 수집'], ['accuracy', '정확도 검증']];
  const QUESTIONS = {
    shelf: '누가 얼마에, 무슨 말로 팔고 있나', competitors: '누구와 경쟁하고 있나', reviews: '고객은 무엇에 만족하고, 무엇에 실망하나',
    audience: '사기 전에 무엇을 궁금해하나', news: '눈여겨본 업계 소식은 무엇인가', accuracy: 'AI 분류를 믿어도 되나'
  };
  const GRADE_TONE = { '긴급': 'red', '기회': 'green', '참고': 'blue' };
  const GRADE_CLASS = { '긴급': 'urgent', '기회': 'chance', '참고': 'info' };
  const BUCKETS = [['low', '$3 미만'], ['mid', '$3~6'], ['high', '$6 이상']];
  const SRC_LABEL = { amazon: 'Amazon', weee: 'Weee!', yami: 'Yami' };
  const ITEM_LABEL = { weee: 'Weee! 진열대 · 리뷰', amazon: 'Amazon 진열대 · 리뷰', yami: 'Yami 진열대', channel_reviews: '채널 리뷰 (Olive Young · Amazon · Yami)', trends: '검색 트렌드', reviews: '리뷰 분류', actions: '이번 주 액션',
    youtube: '유튜브 수집', voc: 'VOC 분류', competitors: '경쟁사 분석', monthly: '요약 · 전략' };
  const KEY_LABEL = { SERPAPI_KEY: 'SerpApi', FIRECRAWL_API_KEY: 'Firecrawl', YOUTUBE_API_KEY: 'YouTube', OPENAI_API_KEY: 'OpenAI' };
  const USE_LABEL = { serpapi: 'SerpApi', firecrawl: 'Firecrawl', youtube: 'YouTube', openai: 'OpenAI' };
  const USE_UNIT = { serpapi: '회', firecrawl: ' 크레딧', youtube: ' units', openai: '회' };
  const SERVING_SRC = { manual: '직접 수정', parsed: '문구에서 읽음', default: '확인 필요 (1회분으로 계산)' };
  const RV_F_EMPTY = { source: '', brand: '', line: '', topic: '', s: '', cs: '' };
  const RV_VIEWS = [['list', '리뷰 목록'], ['compare', '브랜드 × 주제']];
  const RV_SORTS = [['todo', '대응 필요부터'], ['new', '최신순'], ['low', '별점 낮은 순'], ['high', '별점 높은 순']];
  const RV_PAGE = 10;   // 리뷰 표 한 페이지

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
  REBOOT.expose('insights', { searchTrend, personas });

  /* ───────── 상태 ───────── */
  const S = {
    root: null, tab: 'weekly', sub: 'shelf', weekly: null, monthly: null, month: null, data: {}, open: {},
    poll: null, wasRunning: false, showResult: false, run: null, loading: {}, tbl: { q: '', page: 1 }, comp: { q: '', page: 1, sort: 'reviews', dir: -1, f: { form: '', price: '', tier: '', watch: false, ai: false } }, chg: 'all',
    shelfView: 'pantry', rv: { view: store.get('rvView', 'list'), scope: 'own', q: '', f: Object.assign({}, RV_F_EMPTY), todo: false, shared: false, sort: 'todo', page: 1 }, news: { q: '', kind: '' }, board: { src: '', stock: '', sort: 'signal', page: 1 }
  };
  const SHELF_VIEWS = [['pantry', '진열대'], ['cards', '가격 · 재고'], ['board', '상품 목록']];
  S.shelfView = SHELF_VIEWS.some(v => v[0] === store.get('shelfView', '')) ? store.get('shelfView', '') : 'pantry';
  const panel = id => $(S.root, `[data-panel="${id}"]`);
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
    own: '진열대에서 찾은 알디콤 상품 중\n한 번 먹을 때 가장 싼 가격이에요.',
    bulk: '같은 제품을 큰 통으로 사면\n작은 통보다 한 번 먹는 값이 얼마나 싼지예요.\n알디콤과 비교한 값은 아니에요.',
    low: 'Amazon에 "몇 개 안 남음"이라고 뜬 상품이에요.\nWeee! · Yami는 남은 개수를 알려 주지 않아요.',
    unknown: '판매처가 재고를 알려 주지 않았어요.\n품절이라는 뜻은 아니에요.',
    change: '지난주와 비교해\n가격이 얼마나 바뀌었는지예요.'
  };
  // 재고 상태 하나로: 품절 · 곧 품절 · 재고 있음 · 정보 없음
  const STOCK = { oos: ['품절', 'red'], low: ['곧 품절', 'orange'], in: ['재고 있음', 'green'], unknown: ['재고 정보 없음', ''] };
  function stockState(x, limit) {
    if (x.in_stock === false) return 'oos';
    if (x.stockLeft != null && x.stockLeft <= limit) return 'low';
    return x.in_stock === true ? 'in' : 'unknown';
  }
  function topicsText(list) { return (list || []).map(x => `${x.topic} ${x.count}`).join(' · ') || '없음'; }

  /* ───────── 화면 ───────── */
  function render(root) {
    S.root = root;
    root.classList.add('part-insights');
    root.innerHTML = `
      <div class="kpis" data-ref="kpis">${'<div class="kpi"><div class="skeleton ins-skel-sm"></div></div>'.repeat(4)}</div>
      <div class="ins-run" data-ref="run" hidden></div>
      <div class="tabs" role="tablist" aria-label="인사이트 보기">${TABS.map(([id, l]) =>
        `<button type="button" role="tab" data-tab="${id}" aria-selected="false">${esc(l)}</button>`).join('')}</div>
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
      if (ref === 'comp-q') { S.comp.q = e.target.value; S.comp.page = 1; drawCompTable(); }
      if (ref === 'rv-q') { S.rv.q = e.target.value; S.rv.page = 1; drawRvTable(); }
      if (ref === 'news-q') { S.news.q = e.target.value; drawNewsList(); }
    });
    root.addEventListener('mouseover', swarmTip);
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
    route();
    loadWeekly();
    checkRun(true);
  }

  function parseHash() {
    const h = String(global.location ? global.location.hash : '').replace(/^#/, '').split('/');
    const tab = TABS.some(t => t[0] === h[0]) ? h[0] : '';
    const sub = DATA_TABS.some(t => t[0] === h[1]) ? h[1] : '';
    return { tab, sub };
  }

  function route() {
    const h = parseHash();
    show(h.tab || S.tab || 'weekly', h.sub);
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
    if (tab === 'data') fitSwarm();   // 숨어 있을 때 그린 차트는 폭을 못 재서
    const kpis = $(S.root, '[data-ref="kpis"]');
    if (kpis) kpis.hidden = tab !== 'weekly';   // 주간 카드는 주간 리뷰에서만 (월간은 자체 카드)
    drawActions();
    if (tab === 'weekly') { drawWeekly(); setHash('weekly'); }
    if (tab === 'monthly') { if (S.monthly) drawMonthly(); else loadMonthly(S.month); setHash('monthly'); }
    if (tab === 'data') showSub(sub || S.sub || 'shelf');
  }

  function drawActions() {
    const box = REBOOT.page.actions();
    if (!box) return;
    const dl = (href, label) => `<a class="btn" href="${esc(href)}" download>${icon('download')}${esc(label)}</a>`;
    const month = S.monthly ? S.monthly.month : '';
    const extra = S.tab === 'weekly' ? dl('/api/insights/report/weekly.docx', '주간 리포트 받기')
      : S.tab === 'monthly' ? `<button type="button" class="btn" data-act="ins-monthly-run">${icon('spark')}월간 분석 실행</button>` +
        dl('/api/insights/report/monthly.docx' + (month ? `?month=${encodeURIComponent(month)}` : ''), '월간 리포트 받기') +
        dl('/api/insights/export.xlsx', '데이터 받기')
        : dl('/api/insights/export.xlsx', '데이터 받기');
    box.innerHTML = `${extra}<button type="button" class="btn lime" data-act="ins-update">${icon('refresh')}데이터 업데이트</button>`;
  }

  /* ───────── 이벤트 ───────── */
  function onClick(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && S.root.contains(tabBtn)) { show(tabBtn.dataset.tab); return; }
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
      case 'ins-update-only': openUpdate('weekly', (d.items || '').split(',')); break;
      case 'run-close': S.showResult = false; drawRun(S.run); break;
      case 'prod': openProduct(findShelf(d.id)); break;
      case 'shelf-view': S.shelfView = d.v; store.set('shelfView', d.v); drawSub('shelf'); break;
      case 'tbl-page': S.tbl.page = Number(d.p) || 1; drawShelfTable(); break;
      case 'pantry-more': S.open['pantry-' + d.k] = !S.open['pantry-' + d.k]; drawSub('shelf'); break;
      case 'bucket-more': S.open['bucket-' + d.k] = !S.open['bucket-' + d.k]; drawSub('shelf'); break;
      case 'bucket-sort': S.bucketSort = d.v; drawSub('shelf'); break;
      case 'board-reset': S.board.src = ''; S.board.stock = ''; S.board.page = 1; drawSub('shelf'); break;
      case 'board-more': S.open.board = !S.open.board; S.board.page = 1; drawSub('shelf'); break;
      case 'board-page': S.board.page = Number(d.p) || 1; drawSub('shelf'); break;
      case 'watch': toggleWatch(b, d.brand, d.on === '1'); break;
      case 'comp-discover': compAction(b, 'discover'); break;
      case 'comp-research-all': compAction(b, 'all'); break;
      case 'comp-research': compAction(b, 'one', d.id); break;
      case 'comp-status': compAction(b, 'status', d.id, d.status); break;
      case 'comp-detail': if (!e.target.closest('a')) openCompDetail(findComp(d.id)); break;
      case 'comp-chan': S.compChannel = d.ch; S.comp.page = 1; drawCompTable(); break;
      case 'comp-page': S.comp.page = Number(d.p) || 1; drawCompTable(); break;
      case 'comp-sort': S.comp.dir = S.comp.sort === d.k ? -S.comp.dir : COMP_SORTS[d.k][1]; S.comp.sort = d.k; S.comp.page = 1; drawCompTable(); break;
      case 'comp-ftog': S.comp.f[d.k] = !S.comp.f[d.k]; S.comp.page = 1; drawCompTable(); break;
      case 'comp-fclear': S.comp.f = { form: '', price: '', tier: '', watch: false, ai: false }; S.comp.page = 1; drawCompTable(); break;
      case 'chg-group': S.chg = S.chg === d.g ? 'all' : d.g; drawSub('competitors'); break;
      case 'chg-more': S.open['chg-' + d.g] = !S.open['chg-' + d.g]; drawSub('competitors'); break;
      case 'rv': jumpToReviews(d.brand, d.own === '1', d.topic, d.s); break;
      case 'rv-view': S.rv.view = d.v; store.set('rvView', d.v); drawSub('reviews'); break;
      case 'rv-scope': Object.assign(S.rv, { scope: d.v, page: 1, todo: false, shared: false, sort: d.v === 'own' ? 'todo' : 'new', f: Object.assign({}, RV_F_EMPTY) }); drawSub('reviews'); break;
      case 'rv-todo': S.rv.todo = !S.rv.todo; S.rv.page = 1; drawRvTable(); break;
      case 'rv-shared': S.rv.shared = !S.rv.shared; S.rv.page = 1; drawRvTable(); break;
      case 'rv-fclear': S.rv.f = Object.assign({}, RV_F_EMPTY); S.rv.todo = false; S.rv.shared = false; S.rv.page = 1; drawRvTable(); break;
      case 'rv-page': S.rv.page = Number(d.p) || 1; drawRvTable(); break;
      case 'rv-open': openReview(d.id); break;
      case 'month': S.monthly = null; S.month = d.month; loadMonthly(d.month); break;
      case 'aud-month': loadData('audience', d.month); break;
      case 'aud-q': openAudQuestion(Number(d.i)); break;
      case 'weee-raw': openWeeeRaw(); break;
      case 'lines-confirm': confirmLines(b); break;
      case 'reload-sub': loadData(S.sub); break;
      case 'news-unsave': unsaveNews(b, d.id); break;
      case 'news-kind': S.news.kind = d.kind; drawNewsList(); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.ref === 'aud-month') { loadData('audience', t.value); return; }
    if (t.dataset.board) { S.board[t.dataset.board] = t.value; S.board.page = 1; drawSub('shelf'); return; }
    if (t.dataset.rvf) { if (t.dataset.rvf === 'sort') S.rv.sort = t.value; else S.rv.f[t.dataset.rvf] = t.value; S.rv.page = 1; drawRvTable(); return; }
    if (t.dataset.cf) {
      if (t.dataset.cf === 'sort') { S.comp.sort = t.value; S.comp.dir = COMP_SORTS[t.value][1]; } else S.comp.f[t.dataset.cf] = t.value;
      S.comp.page = 1; drawCompTable(); return;
    }
    if (t.dataset.edit) editShelf(t);
    if (t.dataset.line) editLine(t);
  }

  /* ═════════ 주간 리뷰 ═════════ */
  async function loadWeekly() {
    try {
      S.weekly = await api('/api/insights/weekly');
    } catch (err) {
      const el = panel('weekly');
      if (el) el.innerHTML = `<div class="note error">주간 리뷰를 불러오지 못했어요: ${esc(err.message)}</div>`;
      return;
    }
    drawKpis();
    if (S.tab === 'weekly') drawWeekly();
    const urgent = S.weekly.actions.filter(a => a.grade === '긴급').length;
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
    const n = g => w.actions.filter(a => a.grade === g).length;
    const next = w.seasons[0];
    const s = w.shelf;
    // 첫 카드는 같은 화면의 이번 주 액션으로 스크롤
    const links = ['#weekly', '#data/shelf', '#data/reviews', '/dashboard/home#calendar'];
    box.innerHTML = [
      ui.kpi({ label: '이번 주 액션', value: w.actions.length, unit: '개', featured: true, icon: 'spark',
        change: n('긴급') ? `긴급 ${n('긴급')}` : '', foot: w.actions.length ? `기회 ${n('기회')} · 참고 ${n('참고')}` : (w.hasData ? '특이사항 없음' : '데이터 업데이트 필요') }),
      ui.kpi({ label: '진열대 상품', value: s.total, unit: '개', icon: 'grid', change: s.oos ? `품절 ${s.oos}` : '', tone: s.oos ? 'down' : '',
        foot: s.compare ? `가격 변동 ${s.priceChanges} · 신규 ${s.newEntries}` : (s.total ? '변화 비교는 2주차부터' : '아직 수집 전') }),
      ui.kpi({ label: '새 리뷰 (7일)', value: w.reviews.count, unit: '개', icon: 'chat', foot: `자사 ${w.reviews.own} · 경쟁사 ${w.reviews.other}` }),
      ui.kpi({ label: '다음 시즌', value: next ? next.name : '—', icon: 'calendar', change: next ? fmt.dday(next.start) : '',
        foot: next ? fmt.date(next.start) : '모니터링 시즌 없음' })
    ].map((html, i) => kpiLink(links[i], html)).join('');
  }

  // KPI 카드를 해당 화면으로 가는 링크로 감쌈 (주간 · 월간)
  function kpiLink(href, html) {
    return `<a class="ins-kpi-link" href="${href}"${href === '#weekly' ? ' data-act="ins-goto-actions"' : ''}>${html}</a>`;
  }

  // 시연 전용 DB일 때만 (kv 'demo') — 가짜 주차가 섞여 있음을 화면 맨 위에 표시
  function demoNote(d) {
    return d ? `<div class="note warn mb-16">${badge('예시 데이터', 'orange')} ${esc(d.note || '시연용 DB예요.')}</div>` : '';
  }

  function factValue(v) {
    if (Array.isArray(v)) {
      return v.map(x => {
        if (x && typeof x === 'object') {
          if ('line' in x && 'oos' in x) return esc(`${x.line} — ${x.oos.join(' · ')} 품절 (판매 채널: ${x.channels.join(' · ')})${x.again ? ' · 지난 수집부터 계속' : ''}`);
          if ('before' in x && 'after' in x) return esc(`${x.title} (${x.source}) ${money(x.before)} → ${money(x.after)} (${fmt.signed(x.pct, 0, '%')})`);
          return esc([x.title, x.source, x.price != null ? money(x.price) : null].filter(Boolean).join(' · '));
        }
        return esc(x);
      }).join('<br>');
    }
    if (v && typeof v === 'object') return esc(JSON.stringify(v));
    return esc(v);
  }

  function actionCard(a) {
    return `<article class="ins-action ${GRADE_CLASS[a.grade] || ''}">
      <div class="between"><div class="flex">${badge(a.grade, GRADE_TONE[a.grade])}${a.ai ? badge('AI 문장 · 참고용', 'purple') : ''}</div>
        <span class="small muted">${esc(a.ruleLabel)}</span></div>
      <p class="ins-fact">${esc(a.fact)}</p>
      <dl class="ins-steps"><div><dt>왜 중요한가</dt><dd>${esc(a.why)}</dd></div><div><dt>할 일</dt><dd>${esc(a.todo)}</dd></div></dl>
    </article>`;
  }

  function drawWeekly() {
    const el = panel('weekly');
    if (!el) return;
    const w = S.weekly;
    if (!w) { el.innerHTML = `<div class="workbench"><div class="stack">${skel}</div><aside class="stack">${skel}</aside></div>`; return; }
    const acts = w.actions;
    const s = w.shelf;
    const r = w.reviews;
    const head = `<div class="card-head"><h2>이번 주 액션 <span class="muted small">${esc(w.week)} · ${esc(w.weekLabel)}</span></h2>
      <div class="flex">${w.aiUsed ? badge('AI 문장 · 참고용', 'purple') : badge('규칙 문장')}</div></div>`;
    let list;
    if (acts.length) list = `<div class="stack tight">${acts.map(actionCard).join('')}</div>`;
    else if (w.hasData) list = `<div class="empty-art">${icon('check')}<span><b>특이사항 없음</b><br>이번 주에는 규칙에 걸린 신호가 없어요. 데이터 › 진열대에서 흐름을 확인하세요.</span></div>`;
    else list = `<div class="empty-art">${icon('refresh')}<span><b>특이사항 없음</b><br>아직 모은 데이터가 없어서 걸린 신호가 없어요. 오른쪽 위 <b>데이터 업데이트</b>로 진열대 · 리뷰 · 검색 트렌드를 모으면 이번 주 액션이 계산돼요.</span>
      <button type="button" class="btn lime small" data-act="ins-update">${icon('refresh')}데이터 업데이트</button></div>`;
    const stale = w.stale ? `<div class="note warn mb-16">이번 주(${esc(w.week)}) 진열대 데이터가 아직 없어 ${esc(w.stale.week)} (${esc(w.stale.label)}) 수집 기준으로 계산했어요.</div>` : '';
    const signals = acts.length ? `<details class="ins-fold mt-16" data-fold="signals"${S.open.signals ? ' open' : ''}><summary>규칙에 걸린 신호 보기</summary>
      ${acts.map(a => `<div class="ins-signal"><div class="flex">${badge(a.grade, GRADE_TONE[a.grade])}<b>${esc(a.ruleLabel)}</b></div>
        <div class="ins-facts">${Object.keys(a.facts || {}).map(k => `<div><span>${esc(k)}</span><span>${factValue(a.facts[k])}</span></div>`).join('')}</div>
        ${a.ai ? `<p class="small muted mt-8">규칙 문장 · ${esc(a.base.fact)} ${esc(a.base.why)} ${esc(a.base.todo)}</p>` : ''}</div>`).join('')}
      <p class="panel-note mt-8">판단(등급)은 규칙이 해요. AI는 키가 있을 때 문장만 다듬어요 (데이터 업데이트 › 이번 주 액션).${w.aiReady ? '' : ' 지금은 OpenAI 키가 없어 규칙 문장 그대로예요.'}</p>
    </details>` : '';
    const stat = (label, value, tone, sub) => `<div class="ins-stat${tone ? ' ' + tone : ''}"><span>${esc(label)}</span><b>${esc(value)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    const weeks = Object.keys(s.weeks || {}).map(src => `${SRC_LABEL[src] || src} ${s.weeks[src].now}${s.weeks[src].prev ? ` (지난 ${s.weeks[src].prev})` : ''}`).join(' · ');
    const own = s.ownWeee;
    const noPrev = s.compare ? '' : '지난 수집 없음';
    const watch = (s.watchLines || []).map(g => {
      const what = g.oosChannels.length ? [badge(g.oosChannels.length > 1 ? `${g.oosChannels.length}채널 품절` : '품절', 'red'), `${g.oosChannels.join(' · ')}에서 품절`]
        : g.partialOos ? [badge('옵션 품절', 'orange'), `옵션 ${g.partialOos}개 품절 · 다른 옵션은 재고 있음`]
          : [badge('곧 품절', 'orange'), g.low.map(v => `${v.source} ${v.servings}회분 ${v.left}개 남음`).join(' · ')];
      return `<a class="ins-watch-row" href="#data/shelf"><span class="flex">${what[0]}<b>${esc(g.label)}</b></span><span class="small muted">${esc(what[1])}</span></a>`;
    }).join('');
    const reasons = shelfReasons(s);
    const shelfCard = `<section class="card">
      <div class="card-head"><h2>진열대 변화</h2><a class="link" href="#data/shelf">진열대 보기 ${icon('arrow')}</a></div>
      ${s.total ? `<div class="ins-stats">
          ${stat('경쟁 제품 품절', s.oosLines, s.oosLines ? 'red' : '', s.restocks ? `재입고 ${s.restocks}` : `제품 ${s.lines}개 중`)}
          ${stat(`곧 품절 (${s.lowLimit}개 이하 남음)`, s.lowStock, s.lowStock ? 'orange' : '', s.unknownStock ? `재고 정보 없음 ${s.unknownStock}` : '')}
          ${stat('가격 변동 (±10%)', s.compare ? s.priceChanges : '—', '', noPrev)}
          ${stat('신규 진입', s.compare ? s.newEntries : '—', '', noPrev)}
        </div>
        ${watch ? `<div class="ins-watch mt-16">${watch}</div>` : ''}
        <p class="panel-note mt-8">${s.compare ? '지난 수집 대비' : '이번 수집 기준'} · ${esc(weeks)}</p>
        ${s.ownOos ? `<div class="note error mt-16">자사 상품 ${esc(s.ownOos)}개가 품절이에요. 판매처에 재입고 일정을 확인하세요.</div>` : ''}
        ${own ? `<div class="note lime mt-16">Weee!에서 자사 1회분 단가 <b>${esc(money(own.perServing))}</b> — ${esc(own.total)}개 중 ${esc(own.rank)}번째로 저렴해요 (${esc(own.bucketLabel)}).</div>` : ''}`
        : ui.empty('진열대 데이터가 없어요. 데이터 업데이트에서 Weee! · Amazon 진열대를 모으세요.', 'grid')}
      ${reasons.length ? `<details class="ins-fold mt-16" data-fold="shelfWhy"${S.open.shelfWhy !== false ? ' open' : ''}><summary>데이터가 부족한 곳 (${reasons.length})</summary>
        <div class="ins-why-list">${reasons.map(r => `<div class="ins-why"><b>${esc(r.label)}</b><div>${esc(r.text)}<small>할 일 · ${esc(r.todo)}</small></div></div>`).join('')}</div></details>` : ''}
    </section>`;
    el.innerHTML = `${demoNote(w.demo)}
      <div class="workbench">
        <div class="stack">
          <section class="card" data-ref="actions">${head}${stale}${list}${signals}</section>
          ${shelfCard}
        </div>
        <aside class="stack">
          <section class="card">
            <div class="card-head"><h2>새 리뷰</h2><span class="small muted">지난 7일 새로 모은 리뷰</span></div>
            ${r.count ? `<div class="ins-big">${esc(r.count)}<span>개</span></div><p class="small muted">자사 ${esc(r.own)} · 경쟁사 ${esc(r.other)}</p>
              <div class="mt-8">${ui.row('칭찬 상위', esc(topicsText(r.praise)))}${ui.row('불만 상위', esc(topicsText(r.complaint)))}</div>`
              : '<p class="small muted">지난 7일 새로 모은 리뷰가 없어요.</p>'}
            <a class="link mt-8" href="#data/reviews">구매자 리뷰 보기 ${icon('arrow')}</a>
          </section>
          ${lastRunCard(w.lastRun)}
        </aside>
      </div>`;
  }

  // 진열대 변화 카드가 비어 보이는 이유 + 할 일 (판매처 수집 결과 · 첫 수집 · 재고 미확인 · 자사 · 묶음 확인)
  function shelfReasons(s) {
    const out = [];
    const last = s.lastCollect || {};
    ['weee', 'amazon', 'yami'].forEach(src => {
      if ((s.weeks || {})[src]) return;
      const lc = last[src];
      const label = SRC_LABEL[src];
      if (!lc) out.push({ label, text: '아직 수집한 적 없어요.', todo: `데이터 업데이트에서 ${label} 진열대를 고르세요.` });
      else if (!lc.ok) out.push({ label, text: `마지막 수집이 실패했어요: ${lc.message}`, todo: '설정 › 연결에서 키를 확인하고 다시 수집하세요.' });
      else out.push({ label, text: `마지막 수집(${fmt.date(lc.at)})에서 상품을 0개 읽었어요.`, todo: src === 'weee' ? '진열대 › 표로 보기 › Weee! 원문 보기로 페이지를 확인하고, 설정 › 수집 설정의 주소를 고치세요.' : '설정 › 수집 설정의 검색어 · 주소를 확인하세요.' });
    });
    if (s.total && !s.compare) out.push({ label: '비교', text: '첫 수집이라 가격 변동 · 신규 진입 · 재입고는 다음 수집부터 계산해요.', todo: '다음 주에 데이터 업데이트를 한 번 더 돌리세요.' });
    if (s.unknownStock) out.push({ label: '재고', text: `경쟁 상품 ${s.unknownStock}개는 판매처가 재고를 보여 주지 않아 품절 계산에서 빠졌어요.`, todo: '꼭 볼 상품은 설정 › 수집 설정 › 추적 ASIN에 넣으면 상세 조회로 재고를 확인해요.' });
    if (s.total && !s.ownCount) out.push({ label: '자사', text: '진열대에서 자사(알디콤) 상품을 찾지 못해 1회분 단가 위치를 계산하지 못했어요.', todo: '설정 › 수집 설정에 알디콤 Weee! 상품 주소나 추적 ASIN을 넣고, 진열대 › 표로 보기에서 자사 표시를 확인하세요.' });
    if (s.unconfirmed) out.push({ label: '묶음', text: `제품 묶음 ${s.unconfirmed}개가 아직 확인 전이에요 (자동 묶음).`, todo: '진열대 › 표로 보기에서 묶음을 확인하거나 고치세요.' });
    return out;
  }

  function lastRunCard(run) {
    if (!run) {
      return `<section class="card"><h3>마지막 업데이트</h3><p class="small muted mt-8">아직 데이터 업데이트를 한 적이 없어요.</p></section>`;
    }
    const tone = { done: 'green', partial: 'orange', failed: 'red', running: 'blue' }[run.status];
    const label = { done: '완료', partial: '일부 실패', failed: '실패', running: '진행 중' }[run.status] || run.status;
    const keys = Object.keys(run.results || {});
    return `<section class="card">
      <div class="card-head"><h2>마지막 업데이트</h2>${badge(label, tone)}</div>
      <p class="small muted">${esc(fmt.datetime(run.startedAt))} · ${esc(run.user || '')}</p>
      ${keys.length ? `<details class="ins-fold mt-16" data-fold="lastRun"${S.open.lastRun ? ' open' : ''}><summary>항목별 결과 (${keys.length})</summary>
        <ul class="ins-results">${keys.map(k => {
          const x = run.results[k];
          return `<li class="${x.ok ? 'ok' : 'fail'}"><b>${esc(ITEM_LABEL[k] || '중단')}</b> ${esc(x.message)}</li>`;
        }).join('')}</ul></details>` : ''}
    </section>`;
  }

  /* ═════════ 월간 리뷰 ═════════ */
  async function loadMonthly(month) {
    const el = panel('monthly');
    if (!S.monthly && el) el.innerHTML = `<div class="kpis">${'<div class="kpi"><div class="skeleton ins-skel-sm"></div></div>'.repeat(4)}</div>${skel}`;
    try {
      S.monthly = await api('/api/insights/monthly' + (month ? `?month=${encodeURIComponent(month)}` : ''));
      S.month = S.monthly.month;
    } catch (e) {
      if (el) el.innerHTML = `<div class="note error">월간 리뷰를 불러오지 못했어요: ${esc(e.message)}</div>`;
      return;
    }
    if (S.tab === 'monthly') { drawMonthly(); drawActions(); }
  }

  function shiftMonth(m, n) {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function drawMonthly() {
    const el = panel('monthly');
    const m = S.monthly;
    if (!el || !m) return;
    const mt = m.metrics;
    const se = mt.search;
    const pc = mt.priceChanges;
    const thisMonth = REBOOT.today().slice(0, 7);
    const aiBadge = on => (on ? badge('AI · 참고용', 'purple') : badge('규칙 요약'));
    const kpis = [
      ui.kpi({ label: '자사 품절 주수', value: mt.ownOosWeeks == null ? '—' : mt.ownOosWeeks, unit: mt.ownOosWeeks == null ? '' : '주', featured: true,
        icon: 'clock', foot: mt.hasShelf ? '이달 수집한 주 기준' : '이달 진열대 데이터 없음' }),
      ui.kpi({ label: '경쟁사 가격 변동', value: pc == null ? '—' : pc, unit: pc == null ? '' : '회', icon: 'dollar',
        foot: pc == null ? '2주차부터 계산 (비교할 지난주 필요)' : '±10% 이상 변동' }),
      ui.kpi({ label: '새 리뷰', value: mt.newReviews.total, unit: '개', icon: 'chat', foot: `자사 ${mt.newReviews.own} · 경쟁사 ${mt.newReviews.other}` }),
      ui.kpi({ label: '검색 지수', value: se ? fmt.num(se.value, 1) : '—', icon: 'chart',
        change: se && se.changePct != null ? fmt.signed(se.changePct, 0, '%') : '', tone: se && se.changePct < 0 ? 'down' : '',
        foot: se ? `지난달 대비 · 키워드 ${se.keywords}개 평균` : '검색 트렌드 데이터 없음' })
    ].map((html, i) => kpiLink(['#data/shelf', '#data/shelf', '#data/reviews', '/dashboard/home#calendar'][i], html)).join('');
    const summary = m.summary.length
      ? `<ol class="ins-summary">${m.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="panel-note mt-8">${esc(m.model || 'AI')} · ${esc(fmt.datetime(m.createdAt))} · 근거 데이터와 함께 확인하세요.</p>`
      : `<div class="empty-art">${icon('spark')}<span><b>AI 요약이 아직 없어요</b><br>${m.aiReady ? '월간 분석 실행에서 \'요약 · 전략\'을 고르면 3줄 요약이 생겨요.' : 'OpenAI 키를 설정 › 연결에 넣으면 월간 분석 실행으로 3줄 요약을 만들 수 있어요.'}</span>
        <button type="button" class="btn small" data-act="ins-monthly-run">${icon('spark')}월간 분석 실행</button></div>`;
    const insights = m.insights.length ? m.insights.map((x, i) => `<details class="ins-insight" data-fold="insight-${i}"${S.open['insight-' + i] ? ' open' : ''}>
        <summary><span class="ins-idx">${i + 1}</span><span class="grow"><b>${esc(x.title)}</b><small>${esc(x.detail || '')}</small></span></summary>
        <div class="ins-insight-body">
          ${x.faq && x.faq.length ? `<div><span class="field-label">FAQ</span><ul>${x.faq.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          ${x.expressions && x.expressions.length ? `<div><span class="field-label">고객 표현</span><ul>${x.expressions.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          <div><span class="field-label">분류 정확도</span><p class="small muted">아직 검증 전이에요 (데이터 › 정확도 검증).</p></div>
        </div></details>`).join('')
      : ui.empty('아직 고객 데이터가 없어요. 월간 분석 실행으로 유튜브 댓글을 모으거나 리뷰를 모으세요.', 'users');
    const st = m.strategy;
    const swot = st && st.swot ? `<div class="ins-swot">${[['S', '강점'], ['W', '약점'], ['O', '기회'], ['T', '위협']].map(([k, l]) =>
      `<div class="ins-swot-cell s-${k}"><b>${k} · ${l}</b><ul>${(st.swot[k] || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div>`).join('')}</div>` : '';
    const strategy = st ? `
        ${st.changes && st.changes.length ? `<div class="note lime"><b>지난달 대비 바뀐 점</b><ul class="ins-ul">${st.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`
          : `<p class="small muted">${m.prevStrategy ? '지난달 전략과 비교해 바뀐 점이 없어요.' : '지난달 전략이 없어 비교는 다음 달부터예요.'}</p>`}
        <h3 class="ins-h3">페르소나</h3>
        <div class="grid-3 ins-personas">${(st.personas || []).map(p => `<div class="ins-persona"><b>${esc(p.name)}</b><p>${esc(p.oneLine)}</p>
          <small><span>핵심 니즈</span>${esc(p.needs)}</small><small><span>쓸 메시지</span>${esc(p.message)}</small></div>`).join('') || '<p class="small muted">없음</p>'}</div>
        <h3 class="ins-h3">SWOT</h3>${swot}
        <div class="mt-16">${ui.row('타깃', esc(st.target || '—'))}${ui.row('포지셔닝', esc(st.positioning || '—'))}</div>
        <p class="panel-note mt-8">AI 결과 · 참고용. 소비자에게 보이는 문구는 컴플라이언스 검토를 거쳐요.</p>`
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
      <div class="kpis">${kpis}</div>
      <div class="workbench">
        <div class="stack">
          <section class="card tinted"><div class="card-head"><h2>이달의 요약</h2>${m.summary.length ? badge('AI · 참고용', 'purple') : ''}</div>${summary}</section>
          <section class="card"><div class="card-head"><h2>고객 인사이트</h2>${aiBadge(m.insightsAi)}</div>${insights}</section>
          <section class="card"><div class="card-head"><h2>전략 업데이트</h2>${st ? badge('AI · 참고용', 'purple') : ''}</div>${strategy}</section>
        </div>
        <aside class="stack">
          <section class="card"><div class="card-head"><h2>경쟁사 동향</h2>${aiBadge(m.competitorAi)}</div>
            ${m.competitorTrends.length ? `<ul class="ins-ul">${m.competitorTrends.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">경쟁사 데이터가 없어요.</p>'}
            <a class="link mt-8" href="#data/competitors">경쟁사 보기 ${icon('arrow')}</a></section>
        </aside>
      </div>`;
  }

  /* ═════════ 데이터 ═════════ */
  function showSub(sub) {
    S.sub = sub;
    const el = panel('data');
    if (!$(el, '[data-ref="data-body"]')) {
      el.innerHTML = `<div class="chips ins-subtabs" role="tablist" aria-label="데이터 탭">${DATA_TABS.map(([id, l]) =>
        `<button type="button" class="chip" role="tab" data-sub="${id}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>
        <div data-ref="data-body"></div>`;
    }
    $$(el, '[data-sub]').forEach(b => {
      const on = b.dataset.sub === sub;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-selected', String(on));
    });
    setHash('data/' + sub);
    if (sub === 'accuracy') { drawAccuracy(); return; }
    if (S.data[sub] && sub !== 'news') drawSub(sub); else loadData(sub);   // 뉴스 수집은 홈에서 새로 보관했을 수 있어 매번 다시 읽음
  }

  async function loadData(sub, month) {
    const body = $(panel('data'), '[data-ref="data-body"]');
    if (body && S.sub === sub && !S.data[sub]) body.innerHTML = skel;
    S.loading[sub] = true;
    try {
      S.data[sub] = await api(sub === 'news' ? '/api/home/news/saved' : `/api/insights/data/${sub}` + (month ? `?month=${encodeURIComponent(month)}` : ''));
    } catch (e) {
      if (body && S.sub === sub) body.innerHTML = `<div class="note error">불러오지 못했어요: ${esc(e.message)}</div>`;
      return;
    } finally {
      S.loading[sub] = false;
    }
    if (S.tab === 'data' && S.sub === sub) drawSub(sub);
  }

  function drawSub(sub) {
    const body = $(panel('data'), '[data-ref="data-body"]');
    if (!body) return;
    const d = S.data[sub];
    body.innerHTML = { shelf: shelfHtml, competitors: competitorsHtml, reviews: reviewsHtml, audience: audienceHtml, news: newsHtml }[sub](d);
    if (sub === 'news') drawNewsList();
    if (sub === 'shelf') fitSwarm();
  }

  // more = 요약 줄 아래에 붙일 HTML (예: 진열대 요약 숫자 칸) — oneLine 없이 more만 주면 요약 줄은 생략
  function qHead(sub, oneLine, extra, more) {
    return `<section class="card ins-q">
      <div class="between"><div><div class="eyebrow">질문</div><h2>${esc(QUESTIONS[sub])}</h2></div><div class="flex wrap">${extra || ''}</div></div>
      ${oneLine || !more ? `<p class="ins-oneline">${oneLine ? esc(oneLine) : '<span class="muted">아직 모은 데이터가 없어요. 오른쪽 위 데이터 업데이트를 눌러 주세요.</span>'}</p>` : ''}
      ${more || ''}
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

  function shortNum(n) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n); }

  // 카드 = 브랜드 · 별점 · 리뷰 중심. 계산식(가격 ÷ 회분)은 상세 모달에만
  function prodCard(x, o) {
    const cls = ['ins-prod', x.own ? 'own' : '', x.in_stock === false ? 'oos' : '', x.watched ? 'watched' : ''].filter(Boolean).join(' ');
    const flags = [o.multiSource ? badge(x.sourceLabel) : '', x.own ? badge('자사', 'green') : '', x.watched ? '<span class="ins-star" title="주시 중">★</span>' : '',
      x.in_stock === false ? badge('품절', 'red') : '', o.top.has(x.id) ? badge('인기', 'lime') : '', changeBadge(x.change)].join('');
    const meta = [x.rating != null ? `★ ${x.rating}` : '', x.reviews != null ? `리뷰 ${shortNum(x.reviews)}` : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="${cls}" data-act="prod" data-id="${esc(x.id)}">
      ${flags ? `<span class="ins-prod-top">${flags}</span>` : ''}
      <span class="ins-prod-head"><b class="ins-prod-brand${x.brandGuessed ? ' guessed' : ''}"${x.brandGuessed ? ' title="상품명에서 추정한 브랜드"' : ''}>${esc(x.brand || '브랜드 모름')}</b>${meta ? `<span class="ins-prod-meta">${esc(meta)}</span>` : ''}</span>
      <span class="ins-prod-title" title="${esc(x.title)}">${esc(x.title)}</span>
      <span class="ins-prod-price"><b>${esc(money(x.perServing))}</b> / 1회분${x.servingsSource === 'default' ? ' <span class="muted">· 회분 확인 필요</span>' : ''}</span>
    </button>`;
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
    return `<div class="ins-stats three">
      <div class="ins-stat"><span>최저 1회분</span><b>${esc(money(low.perServing))}</b><small>${esc(low.brand)}</small></div>
      <div class="ins-stat"><span>보통 가격 ${infoTip(TIP.median)}</span><b>${esc(money(median))}</b><small>${n}개 기준</small></div>
      <div class="ins-stat${own ? '' : ' red'}"><span>자사 1회분</span><b>${own ? esc(money(own.perServing)) : '—'}</b><small>${esc(ownSub)}</small></div>
    </div>`;
  }

  // 가격 축 벌떼 차트: 점 하나 = 상품 하나, 크기 = 리뷰 수, 누르면 상세
  // 첫 화면에 $0~SWARM_FULL이 꽉 차게 — 상자 폭을 재서 $1 폭(px)을 정하고(fitSwarm), 더 비싼 상품은 가로 스크롤로 봐요
  const SWARM_PX = 64, SWARM_FULL = 8, SWARM_PL = 28;
  function shelfStrip(priced) {
    S.swarm = { priced, px: SWARM_PX };
    S.swarmInfo = Object.fromEntries(priced.map(x => [x.id, x]));   // 말풍선(swarmTip)용
    // 말풍선은 스크롤 상자 밖(ins-sw-wrap)에 두어 상자 가장자리에서 잘리지 않게
    return `<div class="ins-sw-wrap"><div class="ins-sw-scroll" data-ref="swarm">${swarmSvg(priced, SWARM_PX)}</div><div class="ins-sw-tip" role="tooltip" hidden></div></div>
      <div class="ins-sw-key small">
        <div class="ins-sw-key-g"><span class="ins-sw-key-h">색상</span><span><i class="ins-lg"></i>경쟁 상품</span><span><i class="ins-lg own"></i>자사</span>
          <span><i class="ins-lg watched"></i>주시</span><span><i class="ins-lg oos"></i>품절</span><span title="중앙값"><i class="ins-lg med"></i>보통 가격</span></div>
        <div class="ins-sw-key-g"><span class="ins-sw-key-h">크기</span><span class="ins-sw-key-size" aria-hidden="true"><i></i><i></i><i></i></span><span>리뷰 많을수록 크게</span></div>
        <div class="ins-sw-key-g"><span class="ins-sw-key-h">사용법</span><span>점에 올리면 미리보기, 누르면 상세</span></div>
      </div>`;
  }
  // 화면에 붙은 뒤 상자 폭에 맞춰 다시 그림 (창 크기가 바뀔 때도)
  function fitSwarm() {
    const box = $(panel('data'), '[data-ref="swarm"]');
    if (!box || !box.clientWidth || !S.swarm) return;
    const px = Math.max(40, (box.clientWidth - SWARM_PL - 18) / SWARM_FULL);
    if (Math.abs(px - S.swarm.px) < 1) return;
    S.swarm.px = px;
    box.innerHTML = swarmSvg(S.swarm.priced, px);
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
    const grid = ticks.map(v => `<line class="ins-sw-grid${v % 3 === 0 && v <= 6 ? ' major' : ''}" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${head}" y2="${axisY}"></line>
      <text class="ins-sw-tick" x="${X(v).toFixed(1)}" y="${axisY + 18}" text-anchor="middle">$${v}</text>`).join('');
    // 보통 가격(중앙값) 선
    const vals = priced.map(x => x.perServing).sort((a, b) => a - b), n = vals.length;
    const median = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    const medLine = `<line class="ins-sw-med" x1="${X(median)}" x2="${X(median)}" y1="${head + 4}" y2="${axisY}"></line>
      <text class="ins-sw-med-t" x="${X(median) + 5}" y="${head + 14}">보통 ${esc(money(median))}</text>`;
    const dots = placed.slice().sort((a, b) => (a.x.own - b.x.own) || (b.r - a.r)).map(({ x, r, cx, off }) => {
      const cls = ['ins-dot', x.own ? 'own' : '', x.watched ? 'watched' : '', x.in_stock === false ? 'oos' : ''].filter(Boolean).join(' ');
      return `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${(mid + off).toFixed(1)}" r="${r.toFixed(1)}" data-act="prod" data-id="${esc(x.id)}" data-tip="${esc(x.id)}"></circle>`;
    }).join('');
    // 자사 이름표: 점 위 말풍선 (마우스는 통과 — 아래 깔린 같은 가격대 점도 올리고 누를 수 있게)
    const tags = placed.filter(p => p.x.own).map(({ x, r, cx, off }) => {
      const t = `자사 ${money(x.perServing)}`, w = t.length * 6.6 + 14, y = mid + off - r - 8;
      return `<g class="ins-sw-own" aria-hidden="true"><rect x="${(cx - w / 2).toFixed(1)}" y="${(y - 16).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="9"></rect>
        <text x="${cx.toFixed(1)}" y="${(y - 3.5).toFixed(1)}" text-anchor="middle">${esc(t)}</text></g>`;
    }).join('');
    return `<div class="ins-sw-in" style="width:${W}px">
        <svg class="ins-sw-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="1회분 단가 분포: 점 하나가 상품 하나, 점이 클수록 리뷰가 많아요">
          ${bands}${grid}<line class="ins-sw-axis" x1="${PL}" x2="${W - PR / 2}" y1="${axisY}" y2="${axisY}"></line>${medLine}${dots}${tags}</svg></div>`;
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
    tip.innerHTML = `<span class="ins-sw-tip-h"><b>${esc(x.brand || '브랜드 모름')}${x.own ? ' · 자사' : ''}</b>
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

  // 제품 라인 카드: 옵션(회분) × 판매처 표 — 같은 제품을 채널 · 용량과 상관없이 한 장에 (lines.py)
  const CELL = { in: ['재고', 'in'], oos: ['품절', 'oos'], partial: ['일부 품절', 'partial'], low: ['', 'low'], unknown: ['정보 없음', 'unknown'] };
  function lineCell(c) {
    if (!c) return '<td class="ins-mx-none">—</td>';
    const [text, cls] = CELL[c.state] || CELL.unknown;
    const label = c.state === 'low' ? `${c.left}개 남음` : c.state === 'partial' ? `${c.count}개 중 ${c.oos}개 품절` : text;
    return `<td><button type="button" class="ins-mx-cell" data-act="prod" data-id="${esc(c.ids[0])}" title="${esc(c.titles.join('\n'))}">
      <i class="ins-st ${cls}"></i>${esc(label)}${c.count > 1 && c.state !== 'partial' ? `<small> · ${c.count}개</small>` : ''}</button></td>`;
  }
  function lineStatus(g) {
    if (g.oosChannels.length) return badge(g.oosChannels.length > 1 ? `${g.oosChannels.length}채널 품절` : `${SRC_LABEL[g.oosChannels[0]]} 품절`, 'red');
    if (g.partialOos) return badge('옵션 품절', 'orange');
    if (g.low.length) return badge('곧 품절', 'orange');
    return '';
  }
  // 묶음 할인: 큰 용량 1회분이 작은 용량보다 몇 % 싼지 (같은 제품 안 비교)
  function bulkText(b) {
    if (!b) return '—';
    if (b.suspect) return '회분 확인 필요';
    if (Math.abs(b.pct) < 1) return '차이 없음';
    return b.pct < 0 ? `${Math.round(-b.pct)}% 저렴` : `${Math.round(b.pct)}% 비쌈`;
  }
  function lineCard(g) {
    const avail = g.channels.length - g.oosChannels.length;
    const ps = g.perServing ? (g.perServing.min === g.perServing.max ? money(g.perServing.min) : `${money(g.perServing.min)}–${money(g.perServing.max).replace('$', '')}`) : '—';
    const bulk = bulkText(g.bulk);
    const tip = g.low.length ? `<p class="ins-line-tip">경쟁 제품 품절에 대비하세요. ${esc(SRC_LABEL[g.low[0].source])} ${esc(g.low[0].servings)}회분이 ${esc(g.low[0].left)}개 남았어요.</p>`
      : g.oosChannels.length ? `<p class="ins-line-tip red">${esc(g.oosChannels.map(s => SRC_LABEL[s]).join(' · '))}에서 이 제품을 찾던 고객을 데려올 기회예요. 이번 주 액션을 확인하세요.</p>` : '';
    return `<article class="ins-line${g.own ? ' own' : ''}">
      <div class="between"><div><b class="ins-line-name">${esc(g.label)}</b>
        <small class="ins-sub">${g.own ? '자사 · ' : ''}판매처 ${g.channels.length} · 용량 ${g.options.length} · 상품 ${g.products}${g.confirmed ? '' : ' · 같은 제품인지 확인 필요'}</small></div>${lineStatus(g)}</div>
      <div class="ins-line-stats"><div><span>판매 중인 곳</span><b>${avail} / ${g.channels.length}</b></div><div><span>1회분 가격 ${infoTip(TIP.perServing)}</span><b>${esc(ps)}</b></div>
        <div><span>묶음 할인 ${infoTip(TIP.bulk)}</span><b>${esc(bulk)}</b></div></div>
      <table class="ins-mx"><thead><tr><th>용량</th>${g.channels.map(s => `<th>${esc(SRC_LABEL[s])}</th>`).join('')}<th class="num">1회분</th></tr></thead>
        <tbody>${g.options.map(o => `<tr><td>${esc(o.label)}</td>${g.channels.map(s => lineCell(o.cells[s])).join('')}<td class="num">${esc(money(o.perServing))}</td></tr>`).join('')}</tbody></table>
      ${tip}
    </article>`;
  }
  function linesSection(d) {
    const ls = (d.lines || []).filter(g => !g.own || g.channels.length);
    if (!ls.length) return '';
    const hot = ls.filter(g => g.oosChannels.length || g.partialOos || g.low.length);
    const big = ls.filter(g => !hot.includes(g) && (g.channels.length > 1 || g.options.length > 1));
    const first = hot.concat(big).slice(0, 6);
    const rest = ls.filter(g => !first.includes(g));
    return `<section class="card mt-24"><div class="card-head"><h2>제품별 재고</h2><span class="small muted">판매처 · 용량이 달라도 같은 제품은 한 장 · 맛은 나누지 않아요 · 곧 품절 = ${esc(d.lowStock)}개 이하 남음 ${infoTip(TIP.low)}</span></div>
      <div class="ins-lines">${first.map(lineCard).join('')}</div>
      ${rest.length ? `<details class="ins-fold mt-16" data-fold="lines-rest"${S.open['lines-rest'] ? ' open' : ''}><summary>나머지 제품 ${rest.length}개</summary><div class="ins-lines mt-16">${rest.map(lineCard).join('')}</div></details>` : ''}
      <div class="ins-legend small mt-16"><span><i class="ins-st in"></i>재고</span><span><i class="ins-st low"></i>곧 품절</span><span><i class="ins-st partial"></i>일부 품절</span><span><i class="ins-st oos"></i>품절</span><span><i class="ins-st unknown"></i>재고 정보 없음</span></div>
    </section>`;
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
    <td class="ins-title-cell">${x.own ? badge('자사', 'green') + ' ' : ''}${esc(x.title)}<small class="ins-sub">${esc(x.brand)}${x.brandGuessed ? ' (브랜드 추정)' : ''}${x.editedBy ? ` · 수정 ${esc(x.editedBy)}` : ''}</small></td>
    <td class="ins-line-cell">${lineEdit(x, d.forms || [])}</td>
    <td><input class="input ins-num" type="number" min="0" step="0.01" data-edit="price" data-id="${esc(x.id)}" value="${x.price == null ? '' : esc(x.price)}" aria-label="가격 (달러)"></td>
    <td><input class="input ins-num" type="number" min="1" max="500" data-edit="servings" data-key="${esc(x.key)}" value="${x.servingsSource === 'manual' ? esc(x.servings) : ''}" placeholder="${esc(x.servings)}" aria-label="회분 수">
      <small class="ins-sub">${esc(SERVING_SRC[x.servingsSource])}${x.servingsRule && x.servingsSource === 'parsed' ? ` · ${esc(x.servingsRule)}` : ''}</small></td>
    <td class="num">${esc(money(x.perServing))}</td>
    <td><select class="input ins-sel" data-edit="in_stock" data-id="${esc(x.id)}" aria-label="재고">
      <option value="true"${x.in_stock === true ? ' selected' : ''}>재고 있음</option><option value="false"${x.in_stock === false ? ' selected' : ''}>품절</option><option value=""${x.in_stock == null ? ' selected' : ''}>모름</option></select></td>
    <td><label class="check"><input type="checkbox" data-edit="own" data-id="${esc(x.id)}"${x.own ? ' checked' : ''}>자사</label></td>
    <td>${changeBadge(x.change) || '<span class="muted">—</span>'}</td>
    <td>${extLink(x.link)}</td></tr>`;
  }

  // 페이지 버튼 ‹ 1 2 3 … › — act = 누를 때 보낼 data-act (data-p에 페이지 번호)
  function pagerHtml(cur, pages, act) {
    if (pages <= 1) return '';
    const btn = (p, label, on) => `<button type="button" class="btn small${on ? ' lime' : ' ghost'}" data-act="${act}" data-p="${p}"${on ? ' aria-current="page"' : ''}${p < 1 || p > pages ? ' disabled' : ''}>${label}</button>`;
    const nums = Array.from({ length: pages }, (_, k) => k + 1).filter(p => p === 1 || p === pages || Math.abs(p - cur) <= 2);
    return `<nav class="ins-pager" aria-label="표 페이지">${btn(cur - 1, '‹', false)}${nums.map((p, k) =>
      (k && p - nums[k - 1] > 1 ? '<span class="muted">…</span>' : '') + btn(p, p, p === cur)).join('')}${btn(cur + 1, '›', false)}</nav>`;
  }

  // 표로 보기: 검색(상품명 · 브랜드 · 판매처) + 한 페이지 TABLE_PAGE개 — 검색창은 그대로 두고 표만 다시 그림
  const TABLE_PAGE = 5;
  function shelfTable(d) {
    const q = S.tbl.q.trim().toLowerCase();
    const list = q ? d.items.filter(x => `${x.title} ${x.brand} ${x.sourceLabel}`.toLowerCase().includes(q)) : d.items;
    const pages = Math.max(1, Math.ceil(list.length / TABLE_PAGE));
    S.tbl.page = Math.min(Math.max(1, S.tbl.page), pages);
    const cur = S.tbl.page;
    const shown = list.slice((cur - 1) * TABLE_PAGE, cur * TABLE_PAGE);
    if (!shown.length) return `<p class="small muted">${q ? `'${esc(S.tbl.q.trim())}'에 맞는 상품이 없어요.` : '수집된 상품이 없어요.'}</p>`;
    const pager = pagerHtml(cur, pages, 'tbl-page');
    return `<p class="small muted mb-8">${q ? `검색 결과 ${list.length}개 · ` : ''}전체 ${d.items.length}개 중 ${(cur - 1) * TABLE_PAGE + 1}–${(cur - 1) * TABLE_PAGE + shown.length}번째</p>
      <div class="table-wrap"><table class="data-table ins-table"><thead><tr><th>판매처</th><th>상품</th><th>묶음 (브랜드 · 제형)</th><th>가격 ($)</th><th>회분</th><th class="num">1회분</th><th>재고</th><th>자사</th><th>변화</th><th></th></tr></thead><tbody>${shown.map(x => shelfRow(x, d)).join('')}</tbody></table></div>${pager}`;
  }
  function drawShelfTable() {
    const box = $(panel('data'), '[data-ref="tbl-body"]');
    if (box && S.data.shelf) box.innerHTML = shelfTable(S.data.shelf);
  }

  const BUCKET_SHOW = 2;
  const BUCKET_SORTS = [['asc', '싼 순', (a, b) => a.perServing - b.perServing], ['desc', '비싼 순', (a, b) => b.perServing - a.perServing],
    ['reviews', '리뷰 많은 순', (a, b) => (b.reviews || 0) - (a.reviews || 0)]];
  // 보기 바꾸기 (진열대 · 가격 · 재고 · 상품 목록) — 질문 카드와 내용 사이, 왼쪽 끝 한 줄
  function shelfSeg() {
    return `<div class="ins-view-bar"><div class="seg" role="group" aria-label="진열대 보기 방식">${SHELF_VIEWS.map(([k, l]) =>
      `<button type="button" data-act="shelf-view" data-v="${k}" aria-pressed="${S.shelfView === k}">${esc(l)}</button>`).join('')}</div></div>`;
  }
  function shelfHtml(d) {
    const priced = d.items.filter(x => x.perServing != null);
    const top = new Set(d.items.filter(x => !x.own && x.reviews).sort((a, b) => b.reviews - a.reviews).slice(0, 3).map(x => x.id));
    const opt = { top, multiSource: new Set(d.items.map(x => x.source)).size > 1 };
    // 구간별 상품: 단가 박스 안에서 구간마다 BUCKET_SHOW개만, 정렬 바꾸기 · 더 보기
    const sorter = (BUCKET_SORTS.find(s => s[0] === S.bucketSort) || BUCKET_SORTS[0])[2];
    const cols = BUCKETS.map(([k, label]) => {
      const list = d.groups[k].slice().sort(sorter);
      const all = S.open['bucket-' + k];
      const more = list.length > BUCKET_SHOW ? `<button type="button" class="ins-bk-more" data-act="bucket-more" data-k="${k}">${all ? '접기' : `${list.length - BUCKET_SHOW}개 더 보기`}</button>` : '';
      return `<div class="ins-bk-col"><div class="between ins-bk-h"><b>1회분 ${esc(label)}</b>${badge(`${list.length}개`)}</div>
        <div class="stack tight${all ? ' ins-bk-scroll' : ''}">${(all ? list : list.slice(0, BUCKET_SHOW)).map(x => prodCard(x, opt)).join('') || '<p class="small muted">없음</p>'}</div>${more}</div>`;
    }).join('');
    const buckets = `<div class="between ins-bk-top"><b>구간별 상품</b><div class="seg" role="group" aria-label="구간별 상품 정렬">${BUCKET_SORTS.map(([k, l]) =>
      `<button type="button" data-act="bucket-sort" data-v="${k}" aria-pressed="${(S.bucketSort || BUCKET_SORTS[0][0]) === k}">${esc(l)}</button>`).join('')}</div></div>
      <div class="grid-3 ins-bk">${cols}</div>`;
    const overview = priced.length ? `<section class="card mt-24"><div class="card-head"><h2>1회분 단가 한눈에 <span class="ins-sw-sub">점 1개 = 상품 1개</span></h2></div>${shelfSummary(priced)}${shelfStrip(priced)}${buckets}</section>` : '';
    const unknown = d.unknown.length ? `<div class="note mt-16">가격을 읽지 못한 상품 ${d.unknown.length}개는 구간에서 뺐어요 — 아래 표에서 가격을 넣을 수 있어요.</div>` : '';
    const table = `<div class="flex wrap mb-16">
        <button type="button" class="btn small" data-act="ins-update-only" data-items="weee">${icon('refresh')}Weee! 수집</button>
        <button type="button" class="btn small" data-act="ins-update-only" data-items="amazon">${icon('refresh')}Amazon 수집</button>
        ${d.weeeRaw.length ? `<button type="button" class="btn small ghost" data-act="weee-raw">${icon('doc')}Weee! 원문 보기</button>` : ''}
        ${d.items.length ? `<button type="button" class="btn small" data-act="lines-confirm">${icon('check')}묶음 모두 확인</button>` : ''}
        <span class="small muted">회분 · 가격 · 재고 · 자사 · 묶음은 바로 고칠 수 있어요. 회분 수와 묶음은 한 번 고치면 모든 주차에 적용돼요.</span>
      </div>
      ${d.items.length ? `<input class="input ins-tbl-q mb-8" type="search" data-ref="tbl-q" value="${esc(S.tbl.q)}" placeholder="상품명 · 브랜드 · 판매처 검색" aria-label="표 검색">` : ''}
      <div data-ref="tbl-body">${shelfTable(d)}</div>`;
    const view = !d.items.length ? `<div class="mt-24">${ui.empty('진열대 데이터가 없어요. 데이터 업데이트에서 Weee! · Amazon 진열대를 모으세요 (Firecrawl · SerpApi 키 필요).', 'grid')}</div>`
      : S.shelfView === 'board' ? boardHtml(d)
        : S.shelfView === 'cards' ? overview + unknown + linesSection(d)
          : pantryHtml(d);
    return demoNote(d.demo) + qHead('shelf', d.items.length ? '' : d.oneLine, '', d.items.length ? shelfKpis(d, priced) : '') + (d.items.length ? shelfSeg() : '') + view +
      fold('shelf-table', '표로 보기 · 수집 · 고치기', table);
  }

  /* 선반 보기: 1회분 가격대마다 카드 한 줄(가로 스크롤), 같은 제품(라인)은 판매처가 여러 곳이어도 한 번만 (가장 싼 쪽) */
  const PANTRY_SHELVES = [['low', '저렴한 편', '1회분 $3 미만'], ['mid', '보통', '1회분 $3~6'], ['high', '비싼 편', '1회분 $6 이상']];
  const PANTRY_MAX = 8;
  // 제형 선 아이콘 (24 × 24, 글자색을 따라감) — 분말은 가루 더미
  const FORM_ICON = {
    liquid: '<path d="M10 2h4v3h-4z"/><path d="M10 5c-2 1.5-3 3.5-3 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9c0-2.5-1-4.5-3-6"/><path d="M7 13h10"/>',
    tablet: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    pellet: '<circle cx="8" cy="15.5" r="3.5"/><circle cx="16" cy="15.5" r="3.5"/><circle cx="12" cy="8" r="3.5"/>',
    powder: '<path d="M3 20h18"/><path d="M5 20c.8-4.5 3.6-7.5 7-7.5s6.2 3 7 7.5"/><circle class="dot" cx="8" cy="9" r="1"/><circle class="dot" cx="12" cy="6" r="1"/><circle class="dot" cx="16" cy="9" r="1"/><circle class="dot" cx="10" cy="3.5" r=".8"/><circle class="dot" cx="14.5" cy="3.5" r=".8"/>',
    stick: '<rect x="9" y="2" width="6" height="20" rx="1.5"/><path d="M9 6.5h6"/><path d="M11 2v4.5"/>',
    gummy: '<path d="M5 19c-.5-4 0-8 1.5-11 1-2 2.5-3 5.5-3s4.5 1 5.5 3c1.5 3 2 7 1.5 11z"/><path d="M9 19c-.5-4-.3-8.5 1-12.5M15 19c.5-4 .3-8.5-1-12.5M12 19V5"/><path d="M3.5 19h17"/>',
    other: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  };
  const formIcon = f => `<svg class="ins-pc-ico" viewBox="0 0 24 24" aria-hidden="true">${FORM_ICON[f] || FORM_ICON.other}</svg>`;
  const FORM_KO = { liquid: '음료', powder: '분말', stick: '스틱', gummy: '젤리', pellet: '환', tablet: '캡슐 · 정제', other: '기타' };

  function pantryLines(d) {
    const by = {};
    d.items.forEach(x => { const id = (x.line && x.line.id) || x.key; (by[id] = by[id] || []).push(x); });
    return Object.values(by).map(its => {
      const priced = its.filter(x => x.perServing != null);
      const rep = priced.length ? priced.reduce((a, b) => (b.perServing < a.perServing ? b : a)) : its[0];
      const states = its.map(x => stockState(x, d.lowStock));
      const state = states.every(s => s === 'oos') ? 'oos' : states.includes('low') ? 'low' : states.includes('in') ? 'in' : 'unknown';
      const pct = its.map(x => x.change && x.change.pricePct).filter(v => v != null && Math.abs(v) >= 10);
      return { rep, its, state, own: its.some(x => x.own), watched: its.some(x => x.watched), pricePct: pct.length ? pct[0] : null,
        reviews: its.reduce((n, x) => n + (x.reviews || 0), 0), form: (rep.line && rep.line.form) || 'other' };
    });
  }

  function pantryItem(p) {
    const x = p.rep;
    const flag = p.own ? ['우리', 'own'] : p.state === 'oos' ? ['품절', 'oos'] : p.state === 'low' ? ['곧 품절', 'low']
      : p.pricePct != null ? [`가격 ${fmt.signed(p.pricePct, 0, '%')}`, p.pricePct < 0 ? 'cut' : 'up'] : null;
    const chans = [...new Set(p.its.map(i => i.sourceLabel))];
    const tipText = [x.brand || '브랜드 모름', FORM_KO[p.form], `1회분 ${money(x.perServing)}`, `판매처 ${chans.join(' · ')}`,
      STOCK[p.state][0], p.pricePct != null ? `지난 수집 대비 ${fmt.signed(p.pricePct, 0, '%')}` : '', '누르면 자세히'].filter(Boolean).join(' · ');
    const cls = ['ins-pc', p.own ? 'own' : '', p.state === 'oos' ? 'oos' : '', p.watched ? 'watched' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-act="prod" data-id="${esc(x.id)}" title="${esc(tipText)}" aria-label="${esc(tipText)}">
      <span class="ins-pc-top">${formIcon(p.form)}
        <span class="ins-pc-form">${esc(FORM_KO[p.form] || '기타')}</span>${flag ? `<span class="ins-pc-flag ${flag[1]}">${esc(flag[0])}</span>` : ''}</span>
      <span class="ins-pc-name">${esc(x.brand || '브랜드 모름')}</span>
      <span class="ins-pc-price">${esc(money(x.perServing))}<small> /1회</small></span>
      <span class="ins-pc-src">${esc(chans.join(' · '))}</span>
    </button>`;
  }

  function pantryHtml(d) {
    const all = pantryLines(d);
    const rank = p => (p.own ? 0 : p.state === 'oos' ? 1 : p.state === 'low' ? 2 : p.pricePct != null ? 3 : 4);
    const shelves = PANTRY_SHELVES.map(([k, label, range]) => {
      const ps = all.filter(p => p.rep.bucket === k).sort((a, b) => rank(a) - rank(b) || b.reviews - a.reviews);
      const open = S.open['pantry-' + k];
      const shown = open ? ps : ps.slice(0, PANTRY_MAX);
      const more = ps.length - shown.length;
      return `<div class="ins-shelf">
        <div class="ins-shelf-head"><b>${esc(label)}</b><span>${esc(range)} · ${ps.length}개</span></div>
        <div class="ins-shelf-row">${shown.map(pantryItem).join('') || '<span class="small muted ins-shelf-empty">이 가격대에는 제품이 없어요</span>'}
          ${more > 0 ? `<button type="button" class="ins-pc-more" data-act="pantry-more" data-k="${k}">+${more}개 더</button>`
            : open && ps.length > PANTRY_MAX ? `<button type="button" class="ins-pc-more" data-act="pantry-more" data-k="${k}">접기</button>` : ''}</div></div>`;
    }).join('');
    const unpriced = all.filter(p => !p.rep.bucket).length;
    return `<section class="card mt-24 ins-pantry">
      ${shelves}
      <div class="ins-legend small mt-16"><span><i class="ins-lg own"></i>우리 제품</span><span><i class="ins-lg oos"></i>품절 (빈자리)</span>
        <span><i class="ins-lg low"></i>곧 품절</span></div>
      <p class="panel-note mt-8">같은 제품은 판매처가 여러 곳이어도 1회분이 가장 싼 곳 기준으로 한 번만 놓았어요.${unpriced ? ` 가격을 못 읽은 제품 ${unpriced}개는 진열대에서 뺐어요.` : ''} 숫자로 비교하려면 위의 상품 목록을 누르세요.</p>
    </section>`;
  }

  // 진열대 질문 카드의 요약 숫자 4칸 (세 보기 공통) — 긴 요약 문장 대신
  function shelfKpis(d, priced) {
    const all = pantryLines(d);
    const comp = all.filter(p => !p.own);
    const oos = comp.filter(p => p.state === 'oos').length;
    const low = comp.filter(p => p.state === 'low').length;
    const vals = priced.map(x => x.perServing).sort((a, b) => a - b);
    const median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
    const own = priced.filter(x => x.own).sort((a, b) => a.perServing - b.perServing)[0];
    const gap = own && median != null ? own.perServing - median : null;
    const ownSub = gap == null ? '진열대에서 아직 못 찾았어요' : Math.abs(gap) < 0.005 ? '보통 가격과 같아요'
      : `보통(${money(median)})보다 ${money(Math.abs(gap))} ${gap > 0 ? '비싸요' : '저렴해요'}`;
    const srcs = new Set(d.items.map(x => x.source)).size;
    // 1회분 가격대: 가장 많은 구간을 크게, 나머지는 아래 한 줄 + 비율 막대
    const bands = BUCKETS.map(([k, label]) => ({ k, label, n: d.groups[k].length }));
    const top = bands.reduce((a, b) => (b.n > a.n ? b : a));
    const sum = Math.max(1, bands.reduce((t, b) => t + b.n, 0));
    const bar = `<i class="ins-band-bar" aria-hidden="true">${bands.map(b => `<i class="${b.k}" style="width:${(b.n / sum * 100).toFixed(1)}%"></i>`).join('')}</i>`;
    return `<div class="ins-stats mt-16">
      <div class="ins-stat"><span>진열대 상품</span><b>${esc(d.items.length)}개</b><small>판매처 ${esc(srcs)}곳</small></div>
      <div class="ins-stat"><span>가장 많은 1회분 가격대</span><b>${esc(top.label)} ${top.n}개</b>
        ${bar}<small>${bands.filter(b => b !== top).map(b => `${esc(b.label)} ${b.n}개`).join(' · ')}</small></div>
      <div class="ins-stat${own ? '' : ' red'}"><span>알디콤 1회분 ${infoTip(TIP.own)}</span><b>${own ? esc(money(own.perServing)) : '—'}</b><small>${esc(ownSub)}</small></div>
      <div class="ins-stat${oos ? ' red' : low ? ' orange' : ''}"><span>경쟁 제품 품절</span><b>${oos}개</b><small>곧 품절 ${low}개</small></div>
    </div>`;
  }

  /* 상품 목록: 한 줄 = 상품 × 판매처 (읽기 전용 · 고치기는 아래 표에서) */
  const BOARD_FIRST = 3, BOARD_PAGE = 5;   // 상품 목록: 처음 3줄 → 더보기 누르면 5줄씩 페이지
  function boardHtml(d) {
    const f = S.board;
    const srcs = [...new Set(d.items.map(x => x.source))];
    const rank = { oos: 0, low: 1, in: 3, unknown: 4 };
    const all = d.items.map(x => Object.assign({ st: stockState(x, d.lowStock) }, x));
    let rows = all.filter(x => (!f.src || x.source === f.src) && (!f.stock || x.st === f.stock));
    // 필터 · 정렬은 한 줄짜리 선택 상자 (옵션 옆 숫자 = 그 조건의 줄 수)
    const pick = (k, label, opts) => `<label class="ins-bf${k === 'sort' ? ' sort' : ''}"><span>${esc(label)}</span><select class="input" data-board="${k}" aria-label="${esc(label)}">
      ${opts.map(([v, l]) => `<option value="${esc(v)}"${f[k] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const cnt = fn => all.filter(fn).length;
    const tools = pick('src', '판매처', [['', `전체 (${all.length})`], ...srcs.map(s => [s, `${SRC_LABEL[s] || s} (${cnt(x => x.source === s)})`])]) +
      pick('stock', '재고', [['', '전체'], ...['oos', 'low', 'in', 'unknown'].map(s => [s, `${STOCK[s][0]} (${cnt(x => x.st === s)})`])]) +
      (f.src || f.stock ? '<button type="button" class="btn small ghost" data-act="board-reset">필터 지우기</button>' : '') +
      pick('sort', '정렬', [['signal', '신호 순'], ['cheap', '1회분 싼 순'], ['change', '가격 변동 큰 순']]);
    const pct = x => (x.change && x.change.pricePct != null ? x.change.pricePct : null);
    if (f.sort === 'cheap') rows.sort((a, b) => (a.perServing == null) - (b.perServing == null) || (a.perServing || 0) - (b.perServing || 0));
    else if (f.sort === 'change') rows.sort((a, b) => Math.abs(pct(b) || 0) - Math.abs(pct(a) || 0));
    else rows.sort((a, b) => (b.own - a.own) || (rank[a.st] - rank[b.st]) || Math.abs(pct(b) || 0) - Math.abs(pct(a) || 0) || (b.reviews || 0) - (a.reviews || 0));
    const chg = x => {
      if (!x.change) return '<span class="muted">—</span>';
      if (x.change.new) return badge('신규', 'blue');
      const p = pct(x);
      return p == null || Math.abs(p) < 0.5 ? '<span class="muted">변동 없음</span>'
        : `<span class="${p < 0 ? 'ins-down' : 'ins-up'}">${p < 0 ? '↓' : '↑'} ${Math.abs(p).toFixed(1)}%</span><small class="ins-sub">${esc(money(x.change.before))}에서</small>`;
    };
    const open = S.open.board;
    const pages = open ? Math.max(1, Math.ceil(rows.length / BOARD_PAGE)) : 1;
    f.page = Math.min(Math.max(1, f.page), pages);
    const shown = open ? rows.slice((f.page - 1) * BOARD_PAGE, f.page * BOARD_PAGE) : rows.slice(0, BOARD_FIRST);
    const more = rows.length > BOARD_FIRST
      ? `<button type="button" class="btn small lime mt-8" data-act="board-more">${open ? '접기' : `${rows.length - BOARD_FIRST}개 더 보기`}</button>` : '';
    const body = shown.map(x => `<tr data-act="prod" data-id="${esc(x.id)}" tabindex="0">
      <td class="ins-title-cell"><b>${esc(x.brand || '브랜드 모름')}</b>${x.own ? ' ' + badge('자사', 'green') : ''}<small class="ins-sub">${esc(x.title)}</small></td>
      <td>${esc(x.sourceLabel)}</td>
      <td class="num">${esc(money(x.price))}</td>
      <td class="num"><b>${esc(money(x.perServing))}</b></td>
      <td>${chg(x)}</td>
      <td>${badge(STOCK[x.st][0], STOCK[x.st][1])}</td>
      <td class="num">${x.stockLeft != null ? `${esc(x.stockLeft)}개` : '<span class="muted">—</span>'}</td></tr>`).join('');
    return `<section class="card mt-24">
      <div class="card-head"><h2>상품 목록 <span class="small muted">${rows.length} / ${d.items.length}줄 · 줄을 누르면 자세히</span></h2></div>
      <div class="ins-board-f">${tools}</div>
      ${rows.length ? `<div class="table-wrap mt-16"><table class="data-table ins-table ins-board"><thead><tr><th>브랜드 · 상품</th><th>판매처</th><th class="num">판매가</th>
        <th class="num">1회분 ${infoTip(TIP.perServing)}</th><th>지난 수집 대비 ${infoTip(TIP.change)}</th><th>재고</th><th class="num">남은 수량 ${infoTip(TIP.low)}</th></tr></thead>
        <tbody>${body}</tbody></table></div>${pagerHtml(f.page, pages, 'board-page')}${more}` : `<div class="mt-16">${ui.empty('조건에 맞는 상품이 없어요. 위 필터를 바꿔 보세요.', 'grid')}</div>`}
      <p class="panel-note mt-8">남은 수량은 Amazon에 "Only N left"가 뜰 때만 보여요. 재고 정보 없음은 품절이 아니에요. 가격은 USD · 배송비 · 세금 제외예요.</p>
    </section>`;
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
    return `<h3 class="ins-h3">최근 5주 판매가 ${badge(`앞 ${fake}주는 예시 데이터 · 실제 수집 아님`, 'orange')}</h3>
      <svg class="ins-trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 5주 판매가 추이 (앞 ${fake}주는 예시)">
        <path class="ins-tr-line demo" d="${seg(0, fake)}"></path>${real > 1 ? `<path class="ins-tr-line" d="${seg(fake, pts.length - 1)}"></path>` : ''}${dots}</svg>
      <p class="small muted">4주 전보다 ${Math.abs(pct) < 0.5 ? '변동 없음' : `${pct < 0 ? '↓' : '↑'} ${Math.abs(pct).toFixed(1)}%`} · ${realText}이고, 점선 구간은 시연용 예시예요. 주 1회 수집이 쌓이면 실제 값으로 바꿀 수 있어요.</p>`;
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
      <div class="flex wrap mb-16">${badge(x.sourceLabel)}${x.own ? badge('자사 (알디콤)', 'green') : ''}${x.watched ? badge('★ 주시', 'lime') : ''}${stockBadge(x.in_stock)}${changeBadge(x.change)}</div>
      <div class="ins-modal-price"><div><span>1회분 가격 ${infoTip(TIP.perServing)}</span><b>${esc(money(x.perServing))}</b></div>
        <div><span>판매가</span><b>${esc(money(x.price))}</b><small>${esc(x.servings)}회분</small></div></div>
      ${trendHtml(x)}
      ${where}
      <h3 class="ins-h3">상품 정보</h3>
      ${ui.row('브랜드', esc(x.brand + (x.brandGuessed ? ' (상품명에서 추정)' : '')))}
      ${ui.row('가격 계산', esc(`${money(x.price)} ÷ ${x.servings}회분 = ${money(x.perServing)} / 1회분`))}
      ${ui.row('회분 근거', esc(SERVING_SRC[x.servingsSource] + (x.servingsRule ? ` · ${x.servingsRule}` : '')))}
      ${ui.row('재고 (판매처 문구)', esc(x.availability || (x.in_stock === false ? '품절' : x.in_stock ? '재고 있음' : '재고 정보 없음')))}
      ${ui.row('판매 신호', esc(sig || '—'))}
      ${ui.row('검색어 · 주소', esc(x.queries || '—'))}
      ${x.change && x.change.pricePct != null ? ui.row('지난 수집 대비', esc(`${money(x.change.before)} → ${money(x.price)} (${fmt.signed(x.change.pricePct, 0, '%')})`)) : ''}
      <h3 class="ins-h3">판매 문구 (원문)</h3>
      <p class="ins-quote">${x.message ? esc(x.message) : '<span class="muted">상세 조회를 하지 않았거나 문구가 없어요.</span>'}</p>
      <p class="panel-note mt-8">원문 그대로예요. 우리 광고 문구에 옮겨 쓸 때는 컴플라이언스 검토를 거쳐요. ${extLink(x.link, '판매 페이지')}</p>
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
      toast(e.message, 'error');
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
      toast(e.message, 'error');
      t.disabled = false;
    }
  }

  async function confirmLines(b) {
    b.disabled = true;
    try {
      const r = await api('/api/insights/lines/confirm', {}, { method: 'POST' });
      await afterShelfChange(`묶음 ${r.confirmed}개를 확인했어요.`);
    } catch (e) {
      toast(e.message, 'error');
      b.disabled = false;
    }
  }

  function openWeeeRaw() {
    const raw = ((S.data.shelf || {}).weeeRaw) || [];
    const body = `<div class="part-insights ins-modal"><p>Firecrawl이 읽은 Weee! 페이지 앞부분이에요 (상품을 못 찾았을 때 확인용).</p>
      ${raw.map(r => `<h3 class="ins-h3">${esc(r.url)}</h3><p class="small muted">${esc(fmt.datetime(r.at))} · ${esc(fmt.num(r.chars))}자</p><pre class="ins-pre">${esc(r.snippet)}</pre>`).join('')}</div>`;
    ui.modal({ title: 'Weee! 원문 (앞부분)', body, wide: true });
  }

  /* 경쟁사 — 이번 주 변화 · 비교 표(알디콤 맨 위) · 브랜드 카드 (competitors.py) */
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
    const flags = c.own ? badge('자사', 'green') : [c.watched ? '<span class="ins-star" title="주시 중">★</span>' : '', c.isNew ? badge('새', 'blue') : ''].join('');
    const forms = (c.forms || []).map(f => esc(f.label.split(' (')[0])).join(', ') || '—';
    const fb = c.feedback || {};
    const fbt = [fb.praise ? `<span class="ins-fb pos">+ ${esc(fb.praise.topic)}</span>` : '', fb.complaint ? `<span class="ins-fb neg">− ${esc(fb.complaint.topic)}</span>` : ''].join('') || '<span class="muted">—</span>';
    const one = (html, title) => `<div class="ins-1l"${title ? ` title="${esc(title)}"` : ''}>${html}</div>`;
    return `<tr class="${c.own ? 'ins-own-row' : ''}" data-act="comp-detail" data-id="${c.own ? 'own' : esc(c.id == null ? 'b:' + c.brand : c.id)}" tabindex="0">
      <td>${one(`<strong>${esc(c.brand)}</strong>${flags}`, `${c.brand} · ${c.tierLabel}`)}</td>
      <td>${one(`<span class="ins-chans">${chanChips(c)}</span>`)}</td>
      <td class="num nowrap">${esc(compPop(c))}</td>
      <td class="num nowrap">${c.perServing != null ? esc(money(c.perServing)) : '—'}</td>
      <td>${one(forms)}</td>
      <td class="ins-field">${one(compField(c, 'message'), c.analyzed ? fieldText(c, 'message') : '')}</td>
      <td class="ins-field">${one(compField(c, 'ingredients'), c.analyzed ? fieldText(c, 'ingredients') : '')}</td>
      <td>${one(fbt)}</td>
      <td class="num">${c.youtube == null ? '—' : fmt.num(c.youtube)}</td></tr>`;
  }

  // 이번 주 변화: 알디콤 입장(위협 · 기회 · 관찰)으로 나눈 카드 — 진열대는 '지금 값', 여기는 '누가 움직였고 우리한테 무슨 뜻인지'
  const CHG_GROUPS = [['threat', '위협', '우리 고객을 뺏을 수 있어요'], ['chance', '기회', '빈자리가 생겼어요'], ['watch', '관찰', '말하는 방식이 바뀌었어요']];
  const CHG_FIRST = 3;
  function chgMain(x) {
    if (x.kind === 'price') return `<s>${esc(money(x.prevPrice))}</s><b>${esc(money(x.price))}</b><em class="${x.pct < 0 ? 'down' : 'up'}">${x.pct < 0 ? '▼' : '▲'} ${Math.abs(Math.round(x.pct))}%</em>`;
    if (x.kind === 'message') return (x.added || []).map(t => `<mark>+ ${esc(t)}</mark>`).join('') + (x.removed || []).map(t => `<del>− ${esc(t)}</del>`).join('') || esc(x.text);
    if (x.kind === 'new' && x.price != null) return `<b>${esc(money(x.price))}</b>`;
    return `<b>${x.kind === 'oos' ? '재고 없음' : '다시 판매 중'}</b>`;
  }
  function chgCard(x) {
    const sub = x.kind === 'price' || x.kind === 'message' ? '' : `<small class="ins-chg-title" title="${esc(x.title)}">${esc(x.title)}</small>`;
    return `<article class="ins-chg-card ${esc(x.group)}">
      <div class="between"><span class="ins-chg-kind">${esc(x.label)}</span>${extLink(x.link, '보기')}</div>
      <div class="ins-chg-brand"><b>${esc(x.brand || '브랜드 모름')}</b><span class="muted"> · ${esc(x.source)}</span></div>
      <div class="ins-chg-main${x.kind === 'message' ? ' msg' : ''}">${chgMain(x)}</div>${sub}
      ${x.impact ? `<p class="ins-chg-impact">→ ${esc(x.impact)}</p>` : ''}
    </article>`;
  }
  function changesHtml(list) {
    if (list == null) return '<p class="small muted">지난주 진열대와 비교할 수 있을 때부터 보여요 (2주차부터).</p>';
    if (!list.length) return '<p class="small muted">이번 주 경쟁사 변화가 없어요.</p>';
    const by = g => list.filter(x => (x.group || 'watch') === g);
    const tiles = CHG_GROUPS.map(([g, name, desc]) => {
      const its = by(g);
      const kinds = {};
      its.forEach(x => { kinds[x.label] = (kinds[x.label] || 0) + 1; });
      return `<button type="button" class="ins-chg-tile ${g}${S.chg === g ? ' on' : ''}" data-act="chg-group" data-g="${g}" aria-pressed="${S.chg === g}"${its.length ? '' : ' disabled'}>
        <span>${esc(name)} · ${esc(desc)}</span><b>${its.length}</b><small>${esc(Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · ') || '없음')}</small></button>`;
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
      <p class="panel-note mt-8">지난주 진열대의 같은 상품과 비교했어요. '→' 줄은 수집한 가격 · 재고로 계산한 알디콤 입장이에요 (1회분은 알디콤 최저 1회분과 비교). 위 칸을 누르면 그 종류만 모아 봐요.</p>`;
  }

  // 경쟁사 비교 표: 필터 · 정렬 · COMP_PAGE개씩 페이지 (알디콤 행은 늘 맨 위) — 검색창은 그대로 두고 표만 다시 그림
  const COMP_PAGE = 5, COMP_SLOTS = 5;
  const COMP_SORTS = {   // key: [이름, 기본 방향(-1 = 큰 값 먼저)]
    reviews: ['리뷰 · 판매 많은 순', -1], ps: ['1회분 싼 순', 1], name: ['이름순', 1], watch: ['주시 먼저', -1] };
  const COMP_PRICE = [['under1', '$1 미만', v => v < 1], ['1to3', '$1–3', v => v >= 1 && v < 3], ['over3', '$3 이상', v => v >= 3]];
  function compSortVal(c, k) {
    if (k === 'ps') return c.perServing;
    if (k === 'name') return c.brand.toLowerCase();
    if (k === 'watch') return (c.watched ? 1e9 : 0) + (c.reviews || 0);
    return (c.reviews || 0) * 1000 + compSold(c);
  }
  function compSorted(rows) {
    const { sort: k, dir } = S.comp;
    return rows.slice().sort((a, b) => {
      const x = compSortVal(a, k), y = compSortVal(b, k);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;   // 값 없는 행은 늘 아래
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.brand.localeCompare(b.brand);
    });
  }
  const COMP_COLS = [['브랜드', 'name'], ['판매 채널 (최저가)'], ['리뷰 · 판매', 'reviews', 'num'], ['1회분', 'ps', 'num'], ['제형'], ['핵심 메시지'], ['주력 성분'], ['고객 칭찬 / 불만'], ['유튜브', '', 'num']];
  function compHead(sortable) {
    return '<tr>' + COMP_COLS.map(([label, k, cls]) => {
      if (!sortable || !k) return `<th${cls ? ` class="${cls}"` : ''}>${esc(label)}</th>`;
      const on = S.comp.sort === k;
      return `<th class="${cls || ''}${on ? ' sorted' : ''}"><button type="button" class="ins-th-sort" data-act="comp-sort" data-k="${k}" aria-label="${esc(label)} 정렬">${esc(label)}<i>${on ? (S.comp.dir < 0 ? '▼' : '▲') : '↕'}</i></button></th>`;
    }).join('') + '</tr>';
  }
  const compTableHtml = (rows, sortable) => `<div class="table-wrap"><table class="data-table ins-table ins-comp-table"><thead>${compHead(sortable)}</thead><tbody>${rows.map(compRow).join('')}</tbody></table></div>`;
  function compSearchText(c) {
    return [c.brand, c.tierLabel, fieldText(c, 'message'), fieldText(c, 'ingredients'), (c.channels || []).map(x => x.label).join(' '),
      (c.forms || []).map(f => f.label).join(' ')].join(' ').toLowerCase();
  }
  function compFilterBar(d) {
    const f = S.comp.f;
    const sel = (k, all, opts) => `<select class="ins-cf${f[k] ? ' on' : ''}" data-cf="${k}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>${opts.map(([v, l]) =>
      `<option value="${esc(v)}"${f[k] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const forms = Object.entries(d.formLabels || {}).filter(([k]) => d.table.some(c => (c.forms || []).some(x => x.key === k))).map(([k, l]) => [k, l.split(' (')[0]]);
    const tiers = [...new Map(d.table.map(c => [c.tier, c.tierLabel])).entries()];
    const tog = (k, l) => `<button type="button" class="ins-cf${f[k] ? ' on' : ''}" data-act="comp-ftog" data-k="${k}" aria-pressed="${!!f[k]}">${esc(l)}</button>`;
    const any = f.form || f.price || f.tier || f.watch || f.ai;
    return `<div class="ins-cf-bar"><span class="ins-cf-icon" aria-hidden="true">${icon('filter')}</span>
      ${sel('form', '제형', forms)}${sel('price', '1회분 가격', COMP_PRICE.map(([v, l]) => [v, l]))}${sel('tier', '경쟁 구분', tiers)}
      ${tog('watch', '주시 중만')}${tog('ai', 'AI 분석된 것만')}${any ? '<button type="button" class="ins-link" data-act="comp-fclear">필터 지우기</button>' : ''}
      <span class="ins-cf-gap"></span>
      <select class="ins-cf sort" data-cf="sort" aria-label="정렬">${Object.entries(COMP_SORTS).map(([k, [l]]) => `<option value="${k}"${S.comp.sort === k ? ' selected' : ''}>정렬: ${esc(l)}</option>`).join('')}</select></div>`;
  }
  // 페이지 버튼: 위치 · 크기 · 칸 수(COMP_SLOTS) 고정, 번호는 1–5 · 6–10 묶음으로 (가운데 따라 밀리지 않음) — 없는 페이지 칸은 흐리게
  function compPager(cur, pages, total, from, to, act = 'comp-page', label = '경쟁사 표 페이지') {
    const first = Math.floor((cur - 1) / COMP_SLOTS) * COMP_SLOTS + 1;
    const btn = (p, label, extra) => `<button type="button" class="ins-pg${p === cur && !extra ? ' on' : ''}" data-act="${act}" data-p="${p}"${p < 1 || p > pages || (p === cur && !extra) ? ' disabled' : ''}${p === cur && !extra ? ' aria-current="page"' : ''}${extra ? ` aria-label="${extra}"` : ''}>${label}</button>`;
    const slots = Array.from({ length: COMP_SLOTS }, (_, k) => first + k).map(p => btn(p, p)).join('');
    return `<div class="ins-pg-row"><span class="small muted">${total ? `${total}개 중 ${from}–${to}` : '0개'}</span>
      <nav class="ins-pg-nav" aria-label="${label}">${btn(cur - 1, '‹', '이전 페이지')}${slots}${btn(cur + 1, '›', '다음 페이지')}</nav></div>`;
  }
  function compTable(d) {
    const ch = S.compChannel || 'all';
    const f = S.comp.f;
    const q = S.comp.q.trim().toLowerCase();
    const price = COMP_PRICE.find(x => x[0] === f.price);
    const ok = c => (ch === 'all' || (c.channels || []).some(x => x.source === ch)) && (!q || compSearchText(c).includes(q)) &&
      (!f.form || (c.forms || []).some(x => x.key === f.form)) && (!price || (c.perServing != null && price[2](c.perServing))) &&
      (!f.tier || c.tier === f.tier) && (!f.watch || c.watched) && (!f.ai || c.analyzed);
    const rows = compSorted(d.table.filter(ok));
    const own = d.own && !q && (ch === 'all' || (d.own.channels || []).some(x => x.source === ch)) ? [d.own] : [];
    const bar = d.table.length ? compFilterBar(d) : '';
    if (!rows.length) {
      return bar + `<div class="mt-16">${ui.empty(!d.table.length ? '아직 등록된 경쟁사가 없어요. 진열대를 모은 뒤 다시 불러오기를 누르세요.' : '조건에 맞는 경쟁사가 없어요. 검색어나 필터를 바꿔 보세요.', 'users')}</div>`;
    }
    const pages = Math.max(1, Math.ceil(rows.length / COMP_PAGE));
    S.comp.page = Math.min(Math.max(1, S.comp.page), pages);
    const cur = S.comp.page;
    const shown = rows.slice((cur - 1) * COMP_PAGE, cur * COMP_PAGE);
    const pad = pages > 1 ? '<tr class="ins-pad" aria-hidden="true"><td colspan="9"></td></tr>'.repeat(COMP_PAGE - shown.length) : '';   // 마지막 페이지도 표 높이 그대로
    return bar + compTableHtml(own.concat(shown), true).replace('</tbody>', pad + '</tbody>') + compPager(cur, pages, rows.length, (cur - 1) * COMP_PAGE + 1, (cur - 1) * COMP_PAGE + shown.length);
  }
  function drawCompTable() {
    const box = $(panel('data'), '[data-ref="comp-body"]');
    if (box && S.data.competitors) box.innerHTML = compTable(S.data.competitors);
    const ch = S.compChannel || 'all';
    panel('data').querySelectorAll('[data-act="comp-chan"]').forEach(b => { const on = b.dataset.ch === ch; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); });
  }

  function competitorsHtml(d) {
    const ch = S.compChannel || 'all';
    const table = compTableHtml;
    const chips = [['all', '전체']].concat(Object.entries(d.channelLabels)).map(([k, l]) =>
      `<button type="button" class="chip${ch === k ? ' selected' : ''}" aria-pressed="${ch === k}" data-act="comp-chan" data-ch="${esc(k)}">${esc(l)}</button>`).join('');
    const tools = `<div class="flex wrap">
      <button type="button" class="btn small" data-act="comp-discover" title="이번 주 진열대에 새로 보인 브랜드를 표에 넣어요 (무료)">${icon('refresh')}다시 불러오기</button>
      <button type="button" class="btn small dark" data-act="comp-research-all"${d.aiReady ? '' : ' disabled'} title="리뷰 상위 ${d.deepTop}개 브랜드의 핵심 메시지 · 성분을 AI로 새로 채워요 (API 사용)">${icon('spark')}AI 분석</button>
      <details class="ins-export"><summary class="btn small ghost" aria-label="내보내기" title="내보내기">${icon('download')}</summary>
        <div class="ins-export-menu"><a href="/api/insights/competitors.csv" download>CSV</a><a href="/api/insights/competitors.json" download>JSON</a></div></details></div>`;
    const notes = [!d.aiReady ? '<div class="note warn mt-16">OpenAI 키가 없어 핵심 메시지 · 성분 분석은 할 수 없어요. 판매 채널 · 단가 · 칭찬/불만은 그대로 보여요 (설정 › 연결).</div>' : '',
      d.aiReady && !d.firecrawlReady ? '<div class="note mt-16">Firecrawl 키가 없어 홈페이지 · 뉴스는 읽지 않고, 진열대 자료와 AI 웹 검색으로 채워요.</div>' : ''].join('');
    const changes = `<section class="card mt-24"><div class="card-head"><h2>이번 주 경쟁사 변화</h2>${d.changes && d.changes.length ? badge(`${d.changes.length}건`, 'blue') : ''}</div>${changesHtml(d.changes)}</section>`;
    const list = `<section class="card mt-24"><div class="card-head"><h2>경쟁사 비교</h2>${badge(`${d.table.length}개`)}</div>
      <div class="between wrap mb-16"><div class="ins-comp-filter"><div class="chips">${chips}</div>
        ${d.table.length ? `<input class="input ins-tbl-q" type="search" data-ref="comp-q" value="${esc(S.comp.q)}" placeholder="브랜드 · 핵심 메시지 · 성분 · 판매 채널 검색" aria-label="경쟁사 검색">` : ''}</div>${tools}</div>
      <div data-ref="comp-body">${compTable(d)}</div>
      <p class="panel-note mt-8">행을 누르면 브랜드 카드가 열려요. 핵심 메시지 · 주력 성분은 리뷰 상위 ${d.deepTop}개 브랜드만 AI가 채워요. 나머지는 '분석 대상 밖'이고, 지금 분석을 누르면 그 브랜드만 채워요.</p></section>`;
    const subs = d.substitutes.length ? fold('comp-subs', `대체재 ${d.substitutes.length}개 (전해질 음료 · 간 영양제 등)`, table(compSorted(d.substitutes))) : '';
    const arch = d.archived.length ? fold('comp-arch', `보관함 ${d.archived.length}개 · 브랜드 카드에서 '보관'한 브랜드 (다시 불러와도 표에 안 올라와요)`, table(d.archived)) : '';
    return qHead('competitors', d.oneLine, d.watch.length ? badge(`주시 ${d.watch.length}개`, 'lime') : '') + notes + changes + list + subs + arch;
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
        <p class="small muted">주제별: ${topics || '—'} (리뷰 ${fmt.num(fb.reviews)}개 기준)</p>` : '<p class="small muted">수집한 구매자 리뷰가 없어요.</p>'}
      ${prods ? `<h3 class="ins-h3">진열대 상품</h3><ul class="ins-ul">${prods}</ul>` : ''}
      ${c.own ? '' : `<h3 class="ins-h3">근거 자료</h3>${srcs.length ? `<ul class="ins-ul">${srcs.map(s => `<li><b>${esc(s.id)}</b> ${esc(s.type)} · ${esc(s.title)} ${extLink(s.url)}</li>`).join('')}</ul>` : '<p class="small muted">아직 분석 전이에요.</p>'}
      <label class="field-label mt-8" for="comp-site">브랜드 홈페이지 (자동으로 찾고, 틀리면 고치세요)</label>
      <div class="flex"><input id="comp-site" class="grow" data-ref="site" value="${esc(c.website || '')}" placeholder="https://"><button type="button" class="btn small" data-ref="site-save">저장</button></div>
      <h3 class="ins-h3">다시 조사 기록</h3>${hist ? `<ul class="ins-ul">${hist}</ul>` : '<p class="small muted">기록이 없어요.</p>'}
      ${c.id != null ? `<div class="flex wrap mt-16">
        <button type="button" class="btn small" data-ref="research">${icon('refresh')}다시 조사</button>
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
            toast('홈페이지 주소를 저장했어요. 다시 조사하면 이 주소를 읽어요.');
            loadData('competitors');
          } catch (e) { toast(e.message, 'error'); }
          ui.busy(btn, false);
        });
        on('research', btn => { close(); compAction(btn, 'one', c.id); });
        on('watch', btn => { close(); toggleWatch(btn, c.brand, !c.watched); });
        on('status', btn => { close(); compAction(btn, 'status', c.id, c.status === 'archived' ? 'active' : 'archived'); });
      }
    });
  }

  async function compAction(btn, act, id, status) {
    if (act === 'all' && !(await ui.confirm(`리뷰 상위 ${S.data.competitors.deepTop}개 브랜드를 모두 다시 조사해요. 브랜드마다 OpenAI 1~2회 · Firecrawl 2~3회를 써요. 진행할까요?`))) return;
    ui.busy(btn, true);
    try {
      if (act === 'discover') {
        const r = await api('/api/insights/competitors/discover', {});
        toast(r.added.length ? `새 경쟁사 ${r.added.length}개를 등록했어요: ${r.added.slice(0, 5).join(', ')}` : '새로 등록할 경쟁사가 없어요. 새 상품을 모으려면 데이터 업데이트에서 Amazon · Yami 진열대를 돌리세요.');
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
      toast('경쟁사 조사를 시작했어요. 끝나면 표가 새로 그려져요.');
      S.showResult = true;
      checkRun(false);
      ui.busy(btn, false);
    } catch (e) {
      ui.busy(btn, false);
      toast(e.message, 'error');
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
      toast(e.message, 'error');
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
    const tabs = `<div class="seg ins-rv-tabs mt-16" role="group" aria-label="구매자 리뷰 보기">${RV_VIEWS.map(([k, l]) =>
      `<button type="button" data-act="rv-view" data-v="${k}" aria-pressed="${view === k}">${esc(l)} <span class="n">${n[k]}</span></button>`).join('')}</div>`;
    return qHead('reviews', d.oneLine, d.stats.total ? badge(`AI 분류 ${d.stats.ai} · 규칙 ${d.stats.total - d.stats.ai}`) : '') + tabs +
      (view === 'list' ? rvListHtml(d) : compareHtml(d));
  }

  // 대상(알디콤 · 경쟁사 · 전체)별 리뷰. 알디콤 리뷰는 CS 값(제품 라인 · 대응 · 메모)이 붙은 d.cs를 씀
  function rvRows(d, scope) {
    d.cs.forEach(x => { x.own = true; x.brand = x.brand || '자사 (알디콤)'; });   // CS 목록엔 자사 표시 · 브랜드가 없음
    const comp = d.items.filter(r => !r.own);
    return scope === 'own' ? d.cs : scope === 'comp' ? comp : d.cs.concat(comp);
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
    }[S.rv.sort] || newer;
    return list.slice().sort(by);
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
    return `<div class="ins-cf-bar"><span class="ins-cf-icon" aria-hidden="true">${icon('filter')}</span>
      ${sel('source', '채널', sources)}${own ? sel('line', '제품', lines) : sel('brand', '브랜드', brands)}${sel('topic', '주제', d.topics.map(t => [t, hashTag(t)]))}
      ${sel('s', '반응', [['+', '칭찬'], ['-', '불만'], ['0', '중립']])}
      ${own ? sel('cs', '대응', d.csStatus) + `<button type="button" class="ins-cf${S.rv.todo ? ' on' : ''}" data-act="rv-todo" aria-pressed="${S.rv.todo}">대응 필요만</button>` : ''}
      ${nShared ? `<button type="button" class="ins-cf ins-cf-slack${S.rv.shared ? ' on' : ''}" data-act="rv-shared" aria-pressed="${S.rv.shared}">${icon('chat')}슬랙 공유한 것만 <span class="n">${nShared}</span></button>` : ''}
      ${any ? '<button type="button" class="ins-link" data-act="rv-fclear">필터 지우기</button>' : ''}
      <span class="ins-cf-gap"></span>
      <select class="ins-cf sort" data-rvf="sort" aria-label="정렬">${RV_SORTS.filter(([k]) => own || k !== 'todo').map(([k, l]) =>
        `<option value="${k}"${S.rv.sort === k ? ' selected' : ''}>정렬: ${esc(l)}</option>`).join('')}</select></div>`;
  }

  function rvRow(r, own) {
    const pre = r.summaryKo || (r.title ? r.title + ' — ' : '') + r.text;
    const st = (S.data.reviews.csStatus.find(([k]) => k === r.cs) || [])[1];
    return `<tr class="${r.cs === 'todo' ? 'ins-rv-todo-row' : ''}" data-act="rv-open" data-id="${esc(r.id)}" tabindex="0">
      <td class="nowrap small">${esc(r.date || '—')}</td><td class="nowrap">${esc(r.sourceLabel || r.source)}</td>
      ${own ? `<td class="nowrap"><span class="ins-tag">${esc(hashTag(r.line))}</span></td>` : `<td><div class="ins-1l"><strong>${esc(r.brand || '—')}</strong>${r.own ? badge('자사', 'green') : ''}</div></td>`}
      <td class="nowrap">${stars(r.rating)}</td><td class="nowrap">${sentBadge(r.sentiment)}</td>
      <td><div class="ins-1l">${r.topics.map(t => `<span class="ins-tag">${esc(hashTag(t))}</span>`).join(' ') || '<span class="muted">—</span>'}</div></td>
      <td><div class="ins-1l" title="${esc(clip(pre, 300))}">${r.slackBy ? `<span class="ins-sl" title="${esc(`${r.slackBy} · ${fmt.datetime(r.slackAt)} 슬랙 공유`)}">${icon('chat')}공유</span>` : ''}${esc(pre)}</div></td>
      ${S.rv.scope !== 'comp' ? `<td class="nowrap"><span class="ins-rv-st ${esc(r.cs || '')}">${esc(st || '—')}</span>${r.memo ? ` <span class="muted" title="${esc(r.memo)}">✎</span>` : ''}</td>` : ''}</tr>`;
  }

  function rvTable(d) {
    const own = S.rv.scope === 'own';
    const rows = rvFiltered(d);
    const bar = rvRows(d, S.rv.scope).length ? rvFilterBar(d) : '';
    if (!rows.length) {
      const none = !rvRows(d, S.rv.scope).length;
      return bar + `<div class="mt-16">${ui.empty(none ? (own ? '아직 알디콤 리뷰가 없어요. 데이터 업데이트에서 \'채널 리뷰 (Olive Young · Amazon · Yami)\'를 고르세요.' : '아직 경쟁사 리뷰가 없어요. 데이터 업데이트에서 Amazon · Weee! 진열대를 모으세요.')
        : '조건에 맞는 리뷰가 없어요. 검색어나 필터를 바꿔 보세요.', 'chat')}</div>`;
    }
    const cols = ['날짜', '채널', own ? '제품' : '브랜드', '별점', '반응', '주제', '리뷰 (한국어 요약)'].concat(S.rv.scope !== 'comp' ? ['대응'] : []);
    const pages = Math.max(1, Math.ceil(rows.length / RV_PAGE));
    S.rv.page = Math.min(Math.max(1, S.rv.page), pages);
    const cur = S.rv.page;
    const shown = rows.slice((cur - 1) * RV_PAGE, cur * RV_PAGE);
    const pad = pages > 1 ? `<tr class="ins-pad" aria-hidden="true"><td colspan="${cols.length}"></td></tr>`.repeat(RV_PAGE - shown.length) : '';   // 마지막 페이지도 표 높이 그대로
    return bar + `<div class="table-wrap"><table class="data-table ins-table ins-rv-table${own ? ' own' : ''}"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${shown.map(r => rvRow(r, own)).join('')}${pad}</tbody></table></div>` +
      compPager(cur, pages, rows.length, (cur - 1) * RV_PAGE + 1, (cur - 1) * RV_PAGE + shown.length, 'rv-page', '리뷰 표 페이지');
  }
  function drawRvTable() {
    const box = $(panel('data'), '[data-ref="rv-body"]');
    if (box && S.data.reviews) box.innerHTML = rvTable(S.data.reviews);
  }

  function rvListHtml(d) {
    const scopes = [['own', '알디콤', d.cs.length], ['comp', '경쟁사', d.items.filter(r => !r.own).length], ['all', '전체', d.cs.length + d.items.filter(r => !r.own).length]];
    const chips = scopes.map(([k, l, c]) => `<button type="button" class="chip${S.rv.scope === k ? ' selected' : ''}" aria-pressed="${S.rv.scope === k}" data-act="rv-scope" data-v="${k}">${esc(l)}<span class="n">${c}</span></button>`).join('');
    const ch = d.channels.map(c => `<tr><td>${esc(c.channelLabel)}</td><td>${esc(hashTag(c.line))}</td><td>${extLink(c.url, c.title || '상품')}</td>
      <td class="num">${c.total == null ? '—' : esc(c.total)}</td><td class="num">${c.avg == null ? '—' : esc(c.avg)}</td><td class="num">${esc(c.got)}</td><td class="small muted">${esc(fmt.date(c.at))}</td></tr>`).join('');
    return `<section class="card mt-24"><div class="card-head"><h2>구매자 리뷰</h2>${d.stats.csTodo ? badge(`대응 필요 ${d.stats.csTodo}`, 'red') : ''}</div>
        <div class="between wrap mb-16"><div class="ins-comp-filter"><div class="chips">${chips}</div>
          <input class="input ins-tbl-q" type="search" data-ref="rv-q" value="${esc(S.rv.q)}" placeholder="리뷰 내용 · 브랜드 · 상품 검색" aria-label="리뷰 검색"></div></div>
        <div data-ref="rv-body">${rvTable(d)}</div>
        <p class="panel-note mt-8">행을 누르면 리뷰 카드가 열려요. 알디콤 리뷰는 불만 · 부작용 · 배송/파손 말이 있으면 '대응 필요'가 자동으로 붙어요. 상태 · 메모는 이름 · 시간과 함께 저장되고, 답글은 각 사이트에서 직접 남겨 주세요.</p></section>` +
      (ch ? fold('cs-channels', '채널별 리뷰 수 (사이트 숫자 · 모은 수)', `<div class="table-wrap"><table class="data-table"><thead><tr><th>채널</th><th>제품</th><th>상품</th><th class="num">사이트 리뷰</th><th class="num">평균 별점</th><th class="num">모은 수</th><th>확인</th></tr></thead><tbody>${ch}</tbody></table></div>
        <p class="panel-note mt-8">Olive Young은 영어 리뷰(Global Reviews)만, Amazon은 대표 리뷰(최대 8개 · 매주 새 것만 더함)를 모아요. Amazon '사이트 리뷰'는 별점 평가 수예요. Weee!는 진열대 상품의 공개 리뷰를 모아요.</p>`) : '');
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
          <button type="button" class="btn small" data-rv="ko">번역 보기</button>
          ${d.slackReady ? `<button type="button" class="btn small${x.slackBy ? ' ins-slack-done' : ''}" data-rv="slack"${slack ? ' aria-pressed="true"' : ''}${x.slackBy ? ' title="누르면 다시 보낼 수 있어요"' : ''}>${x.slackBy
            ? `${icon('check')}슬랙 공유됨 · ${esc(x.slackBy)} ${esc(fmt.date(x.slackAt))}` : `${icon('chat')}슬랙으로 보내기`}</button>` : ''}
          ${x.csBy ? `<span class="small muted">${esc(x.csBy)} · ${esc(fmt.datetime(x.csAt))}</span>` : ''}
</div>
        ${x.own ? `<input class="input ins-memo mt-8" data-rv="memo" value="${esc(x.memo)}" maxlength="1000" placeholder="메모 (예: 답글 남김 · 교환 안내)" aria-label="메모">` : ''}
        ${slack ? `<div class="ins-slack mt-16"><div class="field-label">슬랙에 이렇게 올라가요 (확인 후 보내기)</div>
          <pre class="ins-slack-pre">${esc(slack.text)}</pre>
          <input class="input mt-8" data-rv="note" maxlength="500" value="${esc(slack.note)}" placeholder="한마디 덧붙이기 (선택 · 예: 이 불만 대응 논의 필요)" aria-label="슬랙에 덧붙일 말">
          <div class="flex wrap mt-8"><button type="button" class="btn small lime" data-rv="slack-send">보내기</button><button type="button" class="btn small ghost" data-rv="slack-cancel">취소</button></div></div>` : ''}
        ${d.slackReady ? '' : '<p class="small muted mt-8">설정 › 연결에 Slack 웹훅 주소(SLACK_WEBHOOK_URL)를 넣으면 이 리뷰를 슬랙 채널로 보낼 수 있어요.</p>'}
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
      } catch (e) { ui.busy(btn, false); toast(e.message, 'error'); }
    }
    async function slackSend(btn, r) {
      ui.busy(btn, true);
      try {
        const res = await api(`/api/insights/reviews/${encodeURIComponent(r.id)}/slack`, { note: (slack.note || '').trim() });
        [r, csItem(r.id), (d.items || []).find(y => String(y.id) === String(r.id))].forEach(y => { if (y) Object.assign(y, { slackBy: res.slackBy, slackAt: res.slackAt }); });
        slack = null;
        toast('슬랙 채널에 보냈어요.');
        draw();
      } catch (e) { ui.busy(btn, false); toast(e.message, 'error'); }
    }
    draw();
    ui.modal({ title: '리뷰 카드', body: box, wide: true });
  }

  function compareHtml(d) {
    const head = `<tr><th>브랜드</th><th class="num">리뷰</th><th class="num">평균 별점</th>${d.topics.map(t => `<th>${esc(t)}</th>`).join('')}</tr>`;
    const cell = (b, t) => {
      const c = b.topics[t];
      if (!c.pos && !c.neg) return '<td class="muted">—</td>';
      return `<td class="nowrap">${c.pos ? `<button type="button" class="ins-cell pos" data-act="rv" data-brand="${esc(b.brand)}" data-own="${b.own ? 1 : ''}" data-topic="${esc(t)}" data-s="+">+${c.pos}</button>` : ''}` +
        `${c.neg ? `<button type="button" class="ins-cell neg" data-act="rv" data-brand="${esc(b.brand)}" data-own="${b.own ? 1 : ''}" data-topic="${esc(t)}" data-s="-">−${c.neg}</button>` : ''}</td>`;
    };
    const rows = d.table.map(b => `<tr><td>${b.own ? badge('자사', 'green') + ' ' : ''}${b.watched ? '<span class="ins-star">★</span> ' : ''}${esc(b.brand)}</td>
      <td class="num">${esc(b.total)}</td><td class="num">${b.avgRating == null ? '—' : esc(b.avgRating)}</td>${d.topics.map(t => cell(b, t)).join('')}</tr>`).join('');
    const sums = d.summaries.map(s => `<li><details class="ins-rv" data-fold="sum-${esc(s.asin)}"${S.open['sum-' + s.asin] ? ' open' : ''}>
      <summary><b>${esc(s.title || s.asin)}</b><span class="ins-rv-pre">${esc(clip(s.text, 120))}</span></summary><div class="ins-rv-body"><p class="ins-quote">${esc(s.text)}</p></div></details></li>`).join('');
    return `<section class="card mt-24"><div class="card-head"><h2>브랜드 × 주제</h2><span class="small muted">+칭찬 / −불만을 누르면 리뷰 목록에서 그 리뷰만 보여요</span></div>
        ${d.table.length ? `<div class="table-wrap"><table class="data-table ins-matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`
          : ui.empty('리뷰가 없어요. 데이터 업데이트에서 Amazon · Weee! 진열대를 모으세요.', 'chat')}
        <p class="panel-note mt-8">Amazon은 전체가 아니라 대표 리뷰 기준이에요. Weee!는 진열대 상품의 공개 리뷰를 모두 모아요. 주제 · 칭찬/불만은 규칙(단어 · 별점)으로 나누고, OpenAI 키가 있으면 '리뷰 분류'가 AI로 다시 나눠요.</p></section>
      <section class="card mt-24"><div class="card-head"><h2>아마존 리뷰 요약</h2>${badge('원문')}</div>
        ${sums ? `<ul class="ins-reviews ins-rv-list">${sums}</ul>` : '<p class="small muted">아마존 상품 상세 조회 때 리뷰 요약이 있으면 여기에 보여요.</p>'}</section>`;
  }

  // 브랜드 × 주제 칸 → 리뷰 목록으로 넘어가 그 브랜드 · 주제 · 반응만
  function jumpToReviews(brand, own, topic, s) {
    Object.assign(S.rv, { view: 'list', scope: own ? 'own' : 'comp', q: '', todo: false, shared: false, page: 1, f: Object.assign({}, RV_F_EMPTY, { brand: own ? '' : brand, topic, s }) });
    store.set('rvView', 'list');
    drawSub('reviews');
    const t = $(panel('data'), '[data-ref="rv-body"]');
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
      toast(e.message, 'error');
    }
  }

  async function showKo(btn, id, box) {
    if (!box) return;
    if (box.dataset.loaded) { box.hidden = !box.hidden; btn.textContent = box.hidden ? '번역 보기' : '번역 숨기기'; return; }
    ui.busy(btn, true);
    try {
      const res = await api(`/api/insights/reviews/${encodeURIComponent(id)}/translate`, {});
      box.innerHTML = `${badge('AI 번역 · 참고용', 'purple')}<p>${esc(res.textKo)}</p>`;
      box.dataset.loaded = '1';
      box.hidden = false;
      ui.busy(btn, false);
      btn.textContent = '번역 숨기기';
    } catch (e) {
      ui.busy(btn, false);
      toast(e.message, 'error');
    }
  }

  /* 유튜브 댓글: 숙취해소 영상 댓글 중 구매 전 질문을 주제별로 셈 */
  function audienceHtml(d) {
    if (!d.month) {
      return qHead('audience', '') + `<div class="mt-24">${ui.empty('유튜브 데이터가 없어요. 월간 분석 실행에서 \'유튜브 수집\'을 고르세요 (YouTube 키 필요 · 약 1,000 units).', 'video')}</div>`;
    }
    const months = d.months.length > 1 ? `<select class="input ins-sel" data-ref="aud-month" aria-label="월">${d.months.map(m => `<option${m === d.month ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>` : '';
    const qTotal = d.questions.reduce((s, x) => s + x.count, 0);
    const qMax = d.questions.length ? d.questions[0].count : 1;
    const q = d.questions.map((x, i) => `<button type="button" class="ins-aq" data-act="aud-q" data-i="${i}">
        <span class="ins-aq-rank">${i + 1}</span><b>${esc(x.label)}</b>
        <span class="progress-track"><i style="width:${Math.round(x.count / qMax * 100)}%"></i></span>
        <span class="ins-aq-n">${esc(x.count)}건 <small>${Math.round(x.count / qTotal * 100)}%</small></span></button>`).join('');
    const ex = d.expressions.map(x => `<li><div class="between"><b>"${esc(x.phrase)}"</b>${badge(`${x.count}개 댓글`)}</div><small>${esc(x.example)}</small></li>`).join('');
    const cr = d.creators.map(c => `<li><div class="between"><b>${esc(c.channel)}</b>${extLink(c.url, '채널')}</div><small>영상 ${esc(c.videos)}개 · 조회수 ${esc(fmt.num(c.views))} · 관련 댓글 ${esc(c.relevant)}</small></li>`).join('');
    const p = d.process;
    const sets = p.queries || {};
    const proc = `${ui.row('검색어 세트', esc(['A', 'B', 'K'].map(k => `${k} ${(sets[k] || []).length}개`).join(' · ')))}
      ${ui.row('찾은 영상', esc(`${p.found}개 (세트별 ${Object.keys(p.bySet || {}).map(k => `${k} ${p.bySet[k]}`).join(' · ') || '—'})`))}
      ${ui.row(`조회수 ${fmt.num(p.minViews)} 이상`, esc(`${p.kept}개`))}
      ${ui.row('댓글', esc(`${p.comments}개 중 관련 ${p.relevant}개 (AI 분류 ${p.ai}개)`))}
      <p class="panel-note mt-8">무관한 댓글(유튜버 칭찬 · 잡담)은 규칙으로 거르고, OpenAI 키가 있으면 'VOC 분류'가 AI로 다시 걸러요. 작성자 이름은 저장하지 않아요.</p>`;
    const comments = d.comments.map(c => audComment(c, true)).join('');
    return qHead('audience', d.oneLine, months) +
      `<div class="ins-aud-grid mt-24">
        <section class="card"><div class="card-head"><h2>사기 전에 묻는 것</h2>${badge(`질문 ${qTotal}건`)}</div>
          <p class="small muted">숙취해소 영상 댓글 중 질문만 주제별로 셌어요. 누르면 실제 댓글을 볼 수 있어요.</p>
          ${q ? `<div class="ins-aq-list">${q}</div>` : '<p class="small muted mt-16">질문 댓글이 없어요.</p>'}</section>
        <section class="card"><div class="card-head"><h2>협업 후보 크리에이터</h2>${badge('Top 5')}</div>${cr ? `<ul class="ins-list">${cr}</ul>` : '<p class="small muted">기준을 넘은 영상이 없어요.</p>'}</section>
      </div>` + fold('aud-expr', '자주 쓰는 표현', ex ? `<ul class="ins-list">${ex}</ul>` : '<p class="small muted">반복되는 표현이 없어요.</p>') +
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

  /* 뉴스 수집: 홈 › 미국 시장 브리핑에서 보관(책갈피)한 기사. 화면에 보인 내용을 보관할 때 그대로 복사해 둔 것 */
  const BOOKMARK = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4.2-6 4.2z"/></svg>';
  function newsHtml(d) {
    const items = (d && d.items) || [];
    const one = items.length ? `보관한 기사 ${items.length}건 · 최근 보관 ${fmt.relative(items[0].savedAt)}` : '';
    const head = qHead('news', one, '<a class="btn small" href="/dashboard#briefing">홈 › 미국 시장 브리핑</a>');
    if (!items.length) {
      return head.replace('오른쪽 위 데이터 업데이트를 눌러 주세요.', '홈 › 미국 시장 브리핑의 기사 카드에서 보관을 눌러 주세요.');
    }
    const ai = items.some(x => x.summaryKo || x.whyKo);
    return head + `<section class="card mt-24"><div class="card-head"><h2>보관한 기사</h2>${ai ? badge('AI 요약 · 참고용', 'purple') : ''}</div>
      <div class="ins-news-tools"><input class="input" type="search" data-ref="news-q" value="${esc(S.news.q)}" placeholder="제목 · 요약 · 마케터의 시선 · 매체 · 분야 검색" aria-label="보관한 기사 검색">
        <div class="chips" data-ref="news-kinds"></div></div>
      <div data-ref="news-list"></div>
      ${ai ? '<p class="panel-note mt-8">한국어 제목 · 요약 · 마케터의 시선은 보관할 때의 AI 요약이에요. 사실 확인은 원문으로 해 주세요.</p>' : ''}</section>`;
  }
  // 보관한 기사 검색: 띄어쓰기로 나눈 낱말이 모두 들어간 기사만 (대소문자 무시) + 업계 뉴스 / 트렌드 고르기
  const NEWS_KINDS = [['', '전체'], ['flow', '업계 뉴스'], ['trend', '트렌드']];
  const newsText = x => [x.titleKo, x.title, x.summaryKo, x.whyKo, x.domain, x.areaLabel, x.savedBy].join(' ').toLowerCase();
  function drawNewsList() {
    const box = $(panel('data'), '[data-ref="news-list"]');
    if (!box) return;
    const items = (S.data.news && S.data.news.items) || [];
    const f = S.news;
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const byKind = items.filter(x => !f.kind || x.kind === f.kind);
    const rows = byKind.filter(x => { const t = newsText(x); return words.every(w => t.includes(w)); });
    $(panel('data'), '[data-ref="news-kinds"]').innerHTML = NEWS_KINDS.map(([k, l]) =>
      `<button type="button" class="chip${f.kind === k ? ' selected' : ''}" aria-pressed="${f.kind === k}" data-act="news-kind" data-kind="${k}">${esc(l)}<span class="n">${k ? items.filter(x => x.kind === k).length : items.length}</span></button>`).join('');
    // 찾은 낱말 강조: 원문을 낱말로 나눠 조각마다 esc (HTML 엔티티가 깨지지 않게)
    const re = words.length ? new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
    const mark = text => (re ? String(text == null ? '' : text).split(re).map((p, i) => (i % 2 ? `<mark>${esc(p)}</mark>` : esc(p))).join('') : esc(text));
    const li = x => `<li class="ins-news"><div class="ins-news-main">
        <b>${safeUrl(x.url) ? `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${mark(x.titleKo || x.title)}</a>` : mark(x.titleKo || x.title)}</b>
        ${x.summaryKo ? `<small>${mark(x.summaryKo)}</small>` : ''}
        ${x.whyKo ? `<small class="ins-news-why"><b>${x.kind === 'trend' ? '적용점' : '마케터의 시선'}</b> ${mark(x.whyKo)}</small>` : ''}
        <small>${[x.kind === 'trend' ? '트렌드' : '업계 뉴스', x.areaLabel, x.domain, x.date ? fmt.relative(x.date) : ''].filter(Boolean).map(mark).join(' · ')}</small>
        ${x.titleKo && x.title ? `<small lang="en">${mark(x.title)}</small>` : ''}
        <small class="muted">${esc(x.savedBy || '')} · ${esc(fmt.datetime(x.savedAt))} 보관</small></div>
      <button type="button" class="btn small ins-news-unsave" data-act="news-unsave" data-id="${esc(x.id)}" title="보관 해제">${BOOKMARK} 보관됨</button></li>`;
    box.innerHTML = (words.length || f.kind ? `<p class="small muted ins-news-count">${byKind.length}건 중 ${rows.length}건</p>` : '') +
      (rows.length ? `<ul class="ins-list">${rows.map(li).join('')}</ul>` : `<p class="small muted mt-16">${words.length ? `'${esc(f.q)}'에 맞는 보관 기사가 없어요. 다른 낱말로 찾아보세요.` : '이 종류로 보관한 기사가 없어요.'}</p>`);
  }
  async function unsaveNews(btn, id) {
    btn.disabled = true;
    try {
      await api(`/api/home/news/saved/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' });
      toast('보관을 해제했어요.');
      loadData('news');
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  }

  /* 정확도 검증 (자리만 · README '정확도 검증') */
  function drawAccuracy() {
    const body = $(panel('data'), '[data-ref="data-body"]');
    if (!body) return;
    body.innerHTML = qHead('accuracy', '아직 검증 전이에요. 지금 분류는 규칙(단어 · 별점) 또는 AI 결과이고, 둘 다 사람 확인이 필요해요.') + `
      <div class="workbench mt-24">
        <section class="card">
          <div class="card-head"><h2>검증 방법</h2>${badge('준비 중', 'orange')}</div>
          <div class="workflow-step"><span class="stepnum">01</span>리뷰 · 댓글 30건을 골라 사람이 정답(주제 · 칭찬/불만 · 질문 여부)을 붙여요</div>
          <div class="workflow-step"><span class="stepnum">02</span>같은 30건을 규칙 / AI(예시 없이) / AI(예시 포함) 세 방식으로 분류해요</div>
          <div class="workflow-step"><span class="stepnum">03</span>정답과 맞은 비율로 채점해요</div>
          <div class="workflow-step"><span class="stepnum">04</span>이긴 방식으로 전체를 분류해요</div>
          <p class="panel-note mt-8">정답 30건을 모으면 시작할 수 있어요. 그 전까지 AI 분류 결과는 '참고용'으로만 보세요.</p>
        </section>
        <aside class="stack"><section class="card"><h3>지금 분류 상태</h3>
          <p class="small muted mt-8">${S.data.reviews ? esc(`리뷰 ${S.data.reviews.stats.total}개 중 AI 분류 ${S.data.reviews.stats.ai}개 · 나머지는 규칙`) : '구매자 리뷰 탭을 열면 분류 상태가 보여요.'}</p></section></aside>
      </div>`;
  }

  /* ═════════ 데이터 업데이트 ═════════ */
  function costText(cost) {
    const parts = Object.keys(cost || {}).filter(k => cost[k]).map(k => `${USE_LABEL[k]} 약 ${fmt.num(cost[k])}${USE_UNIT[k]}`);
    return parts.join(' · ') || '무료';
  }

  async function openUpdate(preset, only) {
    let plan;
    try { plan = await api('/api/insights/update/plan'); } catch (e) { toast(e.message, 'error'); return; }
    if (plan.running) { toast('데이터 업데이트가 이미 진행 중이에요.'); checkRun(false); return; }
    const want = only && only.length ? new Set(only)
      : new Set(plan.items.filter(i => (preset === 'monthly' ? i.group === 'monthly' || i.id === 'reviews' : i.group === 'weekly')).map(i => i.id));
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
      <h3 class="ins-h3">주간 데이터 업데이트 <span class="small muted">${esc(plan.week)}</span></h3>${weekly.map(row).join('')}
      <h3 class="ins-h3">월간 분석 <span class="small muted">${esc(plan.reviewMonth)} 기준 (1~7일에는 지난달)</span></h3>${monthly.map(row).join('')}
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
      title: preset === 'monthly' ? '월간 분석 실행' : '데이터 업데이트', body, wide: true,
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
      toast('데이터 업데이트를 시작했어요. 끝나면 화면이 새로 그려져요.');
      S.showResult = true;
      checkRun(false);
    } catch (e) {
      ui.busy(btn, false);
      err.textContent = e.message;
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
      const label = { done: '데이터 업데이트가 끝났어요.', partial: '데이터 업데이트가 끝났어요 (일부 실패 · 결과 확인).', failed: '데이터 업데이트가 실패했어요. 결과를 확인하세요.' }[r.status] || '데이터 업데이트가 끝났어요.';
      toast(label, r.status === 'done' ? undefined : 'error');
      S.data = {};
      S.monthly = null;
      trendP = null;
      personaP = null;
      await loadWeekly();
      if (S.tab === 'monthly') loadMonthly(S.month);
      if (S.tab === 'data') showSub(S.sub);
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
      return `<li class="${state}"><span class="ins-mark">${mark}</span><b>${esc(ITEM_LABEL[id] || id)}</b>${r ? `<span class="small">${esc(r.message)}</span>` : state === 'now' ? '<span class="small muted">진행 중…</span>' : '<span class="small muted">대기</span>'}</li>`;
    };
    const tone = running ? 'blue' : { done: 'green', partial: 'orange', failed: 'red' }[run.status];
    const label = running ? '진행 중' : { done: '완료', partial: '일부 실패', failed: '실패' }[run.status] || run.status;
    box.hidden = false;
    box.className = `ins-run card ${running ? 'is-running' : ''}`;
    box.innerHTML = `<div class="between"><div class="flex"><h2>데이터 업데이트</h2>${badge(label, tone)}<span class="small muted">${esc(fmt.datetime(run.startedAt))} · ${esc(run.user || '')}</span></div>
        ${running ? '' : '<button type="button" class="btn small ghost" data-act="run-close" aria-label="닫기">닫기</button>'}</div>
      <ul class="ins-steps-list">${items.map(li).join('')}</ul>
      ${res._ ? `<p class="small">${esc(res._.message)}</p>` : ''}`;
  }

  REBOOT.register({
    id: 'insights', label: '시장 · 고객 인사이트', order: 20,
    render,
    summary: () => {
      const s = store.get('summary', null);
      return s && typeof s.urgent === 'number' ? { label: '이번 주 긴급 액션', value: s.urgent } : null;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
