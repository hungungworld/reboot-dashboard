/* 시장 · 고객 인사이트 (담당: 이현경) — tabs/insights/docs/README.md '3번째 대시보드'.
   탭: 주간 리뷰 · 월간 리뷰 · 데이터(진열대 · 경쟁사 · 구매자 리뷰 · 잠재 고객 · 검색 수요 · 정확도 검증)
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
  const DATA_TABS = [['shelf', '진열대'], ['competitors', '경쟁사'], ['reviews', '구매자 리뷰'], ['audience', '잠재 고객 (유튜브)'],
    ['trends', '검색 수요'], ['accuracy', '정확도 검증']];
  const QUESTIONS = {
    shelf: '누가 얼마에, 무슨 말로 팔고 있나', competitors: '누구와 경쟁하고 있나', reviews: '고객은 무엇에 만족하고, 무엇에 실망하나',
    audience: '사기 전에 무엇을 궁금해하나', trends: '언제 찾고, 왜 늘었나', accuracy: 'AI 분류를 믿어도 되나'
  };
  const GRADE_TONE = { '긴급': 'red', '기회': 'green', '참고': 'blue' };
  const GRADE_CLASS = { '긴급': 'urgent', '기회': 'chance', '참고': 'info' };
  const BUCKETS = [['low', '$3 미만'], ['mid', '$3~6'], ['high', '$6 이상']];
  const ITEM_LABEL = { weee: 'Weee! 진열대', amazon: 'Amazon 진열대 · 리뷰', trends: '검색 트렌드', reviews: '리뷰 분류', actions: '이번 주 액션',
    youtube: '유튜브 수집', voc: 'VOC 분류', monthly: '요약 · 전략' };
  const KEY_LABEL = { SERPAPI_KEY: 'SerpApi', FIRECRAWL_API_KEY: 'Firecrawl', YOUTUBE_API_KEY: 'YouTube', OPENAI_API_KEY: 'OpenAI' };
  const USE_LABEL = { serpapi: 'SerpApi', firecrawl: 'Firecrawl', youtube: 'YouTube', openai: 'OpenAI' };
  const USE_UNIT = { serpapi: '회', firecrawl: ' 크레딧', youtube: ' units', openai: '회' };
  const SERVING_SRC = { manual: '직접 수정', parsed: '문구에서 읽음', default: '확인 필요 (1회분으로 계산)' };
  const LINE_COLORS = ['--lime-deep', '--blue', '--orange', '--purple', '--red', '--gray'];

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
    poll: null, wasRunning: false, showResult: false, run: null, chart: null, loading: {}
  };
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
  function stockBadge(v) { return v === false ? badge('품절', 'red') : v === true ? '' : badge('재고 모름'); }
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
    root.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.fold) S.open[d.dataset.fold] = d.open; }, true);
    global.addEventListener('hashchange', route);
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
      case 'ins-monthly-run': openUpdate('monthly'); break;
      case 'ins-update-only': openUpdate('weekly', (d.items || '').split(',')); break;
      case 'run-close': S.showResult = false; drawRun(S.run); break;
      case 'prod': openProduct(findShelf(d.id)); break;
      case 'watch': toggleWatch(b, d.brand, d.on === '1'); break;
      case 'rv': openReviews(d.brand, d.topic, d.s); break;
      case 'month': S.monthly = null; S.month = d.month; loadMonthly(d.month); break;
      case 'aud-month': loadData('audience', d.month); break;
      case 'upload-reviews': uploadCsv(b, 'reviews'); break;
      case 'upload-trends': uploadCsv(b, 'trends'); break;
      case 'weee-raw': openWeeeRaw(); break;
      case 'reload-sub': loadData(S.sub); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.ref === 'aud-month') { loadData('audience', t.value); return; }
    if (t.dataset.edit) editShelf(t);
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
    box.innerHTML = [
      ui.kpi({ label: '이번 주 액션', value: w.actions.length, unit: '개', featured: true, icon: 'spark',
        change: n('긴급') ? `긴급 ${n('긴급')}` : '', foot: w.actions.length ? `기회 ${n('기회')} · 참고 ${n('참고')}` : (w.hasData ? '특이사항 없음' : '데이터 업데이트 필요') }),
      ui.kpi({ label: '진열대 상품', value: s.total, unit: '개', icon: 'grid', change: s.oos ? `품절 ${s.oos}` : '', tone: s.oos ? 'down' : '',
        foot: s.compare ? `가격 변동 ${s.priceChanges} · 신규 ${s.newEntries}` : (s.total ? '변화 비교는 2주차부터' : '아직 수집 전') }),
      ui.kpi({ label: '새 리뷰 (7일)', value: w.reviews.count, unit: '개', icon: 'chat', foot: `자사 ${w.reviews.own} · 경쟁사 ${w.reviews.other}` }),
      ui.kpi({ label: '다음 시즌', value: next ? next.name : '—', icon: 'calendar', change: next ? fmt.dday(next.start) : '',
        foot: next ? fmt.date(next.start) : '모니터링 시즌 없음' })
    ].join('');
  }

  function factValue(v) {
    if (Array.isArray(v)) {
      return v.map(x => {
        if (x && typeof x === 'object') {
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
    else if (w.hasData) list = `<div class="empty-art">${icon('check')}<span><b>특이사항 없음</b><br>이번 주에는 규칙에 걸린 신호가 없어요. 데이터 › 진열대 · 검색 수요에서 흐름을 확인하세요.</span></div>`;
    else list = `<div class="empty-art">${icon('refresh')}<span><b>특이사항 없음</b><br>아직 모은 데이터가 없어서 걸린 신호가 없어요. 오른쪽 위 <b>데이터 업데이트</b>로 진열대 · 리뷰 · 검색 트렌드를 모으면 이번 주 액션이 계산돼요.</span>
      <button type="button" class="btn lime small" data-act="ins-update">${icon('refresh')}데이터 업데이트</button></div>`;
    const stale = w.stale ? `<div class="note warn mb-16">이번 주(${esc(w.week)}) 진열대 데이터가 아직 없어 ${esc(w.stale.week)} (${esc(w.stale.label)}) 수집 기준으로 계산했어요.</div>` : '';
    const signals = acts.length ? `<details class="ins-fold mt-16" data-fold="signals"${S.open.signals ? ' open' : ''}><summary>규칙에 걸린 신호 보기</summary>
      ${acts.map(a => `<div class="ins-signal"><div class="flex">${badge(a.grade, GRADE_TONE[a.grade])}<b>${esc(a.ruleLabel)}</b></div>
        <div class="ins-facts">${Object.keys(a.facts || {}).map(k => `<div><span>${esc(k)}</span><span>${factValue(a.facts[k])}</span></div>`).join('')}</div>
        ${a.ai ? `<p class="small muted mt-8">규칙 문장 · ${esc(a.base.fact)} ${esc(a.base.why)} ${esc(a.base.todo)}</p>` : ''}</div>`).join('')}
      <p class="panel-note mt-8">판단(등급)은 규칙이 해요. AI는 키가 있을 때 문장만 다듬어요 (데이터 업데이트 › 이번 주 액션).${w.aiReady ? '' : ' 지금은 OpenAI 키가 없어 규칙 문장 그대로예요.'}</p>
    </details>` : '';
    const stat = (label, value, tone) => `<div class="ins-stat${tone ? ' ' + tone : ''}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    const weeks = Object.keys(s.weeks || {}).map(src => `${src === 'amazon' ? 'Amazon' : 'Weee!'} ${s.weeks[src].now}${s.weeks[src].prev ? ` (지난 ${s.weeks[src].prev})` : ''}`).join(' · ');
    const own = s.ownWeee;
    const shelfCard = `<section class="card">
      <div class="card-head"><h2>진열대 변화</h2><a class="link" href="#data/shelf">진열대 보기 ${icon('arrow')}</a></div>
      ${s.total ? `<div class="ins-stats">
          ${stat('경쟁 상품 품절', s.oos, s.oos ? 'red' : '')}
          ${stat('가격 변동 (±10%)', s.compare ? s.priceChanges : '—')}
          ${stat('신규 진입', s.compare ? s.newEntries : '—')}
          ${stat('자사 품절', s.ownOos, s.ownOos ? 'red' : '')}
        </div>
        <p class="panel-note mt-8">${s.compare ? '지난 수집 대비' : '첫 수집이라 가격 · 품절 · 신규 변화는 다음 수집부터 비교해요.'} ${esc(weeks)}</p>
        ${own ? `<div class="note lime mt-16">Weee!에서 자사 1회분 단가 <b>${esc(money(own.perServing))}</b> — ${esc(own.total)}개 중 ${esc(own.rank)}번째로 저렴해요 (${esc(own.bucketLabel)}).</div>`
          : `<div class="note mt-16">Weee!에서 자사 상품의 1회분 단가 위치를 아직 계산하지 못했어요. ${s.ownCount ? '' : '설정 › 수집 설정에 알디콤 Weee! 상품 주소나 추적 ASIN을 넣고, 진열대 › 표로 보기에서 자사 표시를 확인하세요.'}</div>`}`
        : ui.empty('진열대 데이터가 없어요. 데이터 업데이트에서 Weee! · Amazon 진열대를 모으세요.', 'grid')}
    </section>`;
    const next = w.seasons[0];
    const ly = x => (x && x.lastYear ? `작년 같은 시기 '${x.lastYear.keyword}' 검색 평균 대비 ${fmt.signed(x.lastYear.pct, 0, '%')}` : '작년 검색 비교 없음 (검색 트렌드 수집 필요)');
    const seasonCard = next ? `<section class="card season">
        <span class="badge">SEASON · ${esc(fmt.dday(next.start))}</span>
        <h2>${esc(next.name)}</h2>
        <p>${esc(fmt.date(next.start))} · ${esc(ly(next))}</p>
        <a class="arrow" href="/dashboard/content" aria-label="콘텐츠 제작에서 캠페인 준비">${icon('up')}</a>
      </section>` : '';
    const others = w.seasons.slice(1);
    el.innerHTML = `
      <div class="workbench">
        <div class="stack">
          <section class="card">${head}${stale}${list}${signals}</section>
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
          ${seasonCard}
          <section class="card">
            <div class="card-head"><h2>다가오는 시즌</h2><a class="link" href="/dashboard/settings#collect">시즌 편집</a></div>
            ${others.length ? others.map(x => `<div class="ins-season-row"><div><b>${esc(x.name)}</b><small>${esc(fmt.date(x.start))} · ${esc(ly(x))}</small></div>${x.inLead ? badge(fmt.dday(x.start), 'orange') : `<span class="small muted">${esc(fmt.dday(x.start))}</span>`}</div>`).join('')
              : '<p class="small muted">모니터링 중인 다른 시즌이 없어요.</p>'}
            <p class="panel-note mt-8">캠페인 기획은 콘텐츠 제작 탭에서 해요.</p>
          </section>
          ${lastRunCard(w.lastRun)}
        </aside>
      </div>`;
  }

  function lastRunCard(run) {
    if (!run) {
      return `<section class="card"><h3>마지막 업데이트</h3><p class="small muted mt-8">아직 데이터 업데이트를 한 적이 없어요.</p></section>`;
    }
    const tone = { done: 'green', partial: 'orange', failed: 'red', running: 'blue' }[run.status];
    const label = { done: '완료', partial: '일부 실패', failed: '실패', running: '진행 중' }[run.status] || run.status;
    return `<section class="card">
      <div class="card-head"><h2>마지막 업데이트</h2>${badge(label, tone)}</div>
      <p class="small muted">${esc(fmt.datetime(run.startedAt))} · ${esc(run.user || '')}</p>
      <ul class="ins-results">${Object.keys(run.results || {}).map(k => {
        const x = run.results[k];
        return `<li class="${x.ok ? 'ok' : 'fail'}"><b>${esc(ITEM_LABEL[k] || '중단')}</b> ${esc(x.message)}</li>`;
      }).join('')}</ul>
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
    ].join('');
    const summary = m.summary.length
      ? `<ol class="ins-summary">${m.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="panel-note mt-8">${esc(m.model || 'AI')} · ${esc(fmt.datetime(m.createdAt))} · 근거 데이터와 함께 확인하세요.</p>`
      : `<div class="empty-art">${icon('spark')}<span><b>AI 요약이 아직 없어요</b><br>${m.aiReady ? '월간 분석 실행에서 \'요약 · 전략\'을 고르면 3줄 요약이 생겨요.' : 'OpenAI 키를 설정 › 연결에 넣으면 월간 분석 실행으로 3줄 요약을 만들 수 있어요.'}</span>
        <button type="button" class="btn small" data-act="ins-monthly-run">${icon('spark')}월간 분석 실행</button></div>`;
    const insights = m.insights.length ? m.insights.map((x, i) => `<details class="ins-insight" data-fold="insight-${i}"${S.open['insight-' + i] ? ' open' : ''}>
        <summary><span class="ins-idx">${i + 1}</span><span class="grow"><b>${esc(x.title)}</b><small>${esc(x.detail || '')}</small></span></summary>
        <div class="ins-insight-body">
          ${x.faq && x.faq.length ? `<div><span class="field-label">FAQ</span><ul>${x.faq.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          ${x.expressions && x.expressions.length ? `<div><span class="field-label">고객 표현</span><ul>${x.expressions.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          ${m.creators.length ? `<div><span class="field-label">협업 후보 크리에이터</span><ul>${m.creators.slice(0, 3).map(c => `<li>${esc(c.channel)} <span class="muted small">조회수 ${esc(fmt.num(c.views))}</span></li>`).join('')}</ul></div>` : ''}
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
    const creators = m.creators.length ? m.creators.map(c => `<div class="ins-season-row"><div><b>${esc(c.channel)}</b><small>영상 ${esc(c.videos)}개 · 조회수 ${esc(fmt.num(c.views))} · 관련 댓글 ${esc(c.relevant)}</small></div>${extLink(c.url, '채널')}</div>`).join('')
      : '<p class="small muted">유튜브 수집 후에 보여요.</p>';
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
          <section class="card"><div class="card-head"><h2>협업 후보 크리에이터</h2></div>${creators}<a class="link mt-8" href="#data/audience">잠재 고객 보기 ${icon('arrow')}</a></section>
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
    if (S.data[sub]) drawSub(sub); else loadData(sub);
  }

  async function loadData(sub, month) {
    const body = $(panel('data'), '[data-ref="data-body"]');
    if (body && S.sub === sub && !S.data[sub]) body.innerHTML = skel;
    S.loading[sub] = true;
    try {
      S.data[sub] = await api(`/api/insights/data/${sub}` + (month ? `?month=${encodeURIComponent(month)}` : ''));
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
    if (S.chart) { try { S.chart.destroy(); } catch (e) { /* 무시 */ } S.chart = null; }
    const d = S.data[sub];
    body.innerHTML = { shelf: shelfHtml, competitors: competitorsHtml, reviews: reviewsHtml, audience: audienceHtml, trends: trendsHtml }[sub](d);
    if (sub === 'trends') drawChart(d);
  }

  function qHead(sub, oneLine, extra) {
    return `<section class="card ins-q">
      <div class="between"><div><div class="eyebrow">질문</div><h2>${esc(QUESTIONS[sub])}</h2></div><div class="flex wrap">${extra || ''}</div></div>
      <p class="ins-oneline">${oneLine ? esc(oneLine) : '<span class="muted">아직 모은 데이터가 없어요. 오른쪽 위 데이터 업데이트를 눌러 주세요.</span>'}</p>
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

  function prodCard(x) {
    const cls = ['ins-prod', x.own ? 'own' : '', x.in_stock === false ? 'oos' : '', x.watched ? 'watched' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-act="prod" data-id="${esc(x.id)}">
      <span class="ins-prod-top">${badge(x.sourceLabel)}${x.own ? badge('자사', 'green') : ''}${x.watched ? '<span class="ins-star" title="주시 중">★</span>' : ''}${x.in_stock === false ? badge('품절', 'red') : ''}${changeBadge(x.change)}</span>
      <span class="ins-prod-title">${esc(x.title)}</span>
      <span class="ins-prod-price"><b>${esc(money(x.perServing))}</b> / 1회분 <span class="muted">· ${esc(money(x.price))} ÷ ${esc(x.servings)}회분${x.servingsSource === 'default' ? ' (확인 필요)' : ''}</span></span>
    </button>`;
  }

  function shelfHtml(d) {
    const legend = `${badge('자사', 'green')}<span class="small muted">★ 주시</span>${badge('품절', 'red')}`;
    const cols = BUCKETS.map(([k, label]) => `<section class="card ins-bucket"><div class="card-head"><h2>1회분 ${esc(label)}</h2>${badge(`${d.groups[k].length}개`)}</div>
      <div class="stack tight">${d.groups[k].map(prodCard).join('') || '<p class="small muted">없음</p>'}</div></section>`).join('');
    const unknown = d.unknown.length ? `<div class="note mt-16">가격을 읽지 못한 상품 ${d.unknown.length}개는 구간에서 뺐어요 — 아래 표에서 가격을 넣을 수 있어요.</div>` : '';
    const rows = d.items.map(x => `<tr>
      <td>${esc(x.sourceLabel)}${x.position ? `<small class="ins-sub">${esc(x.position)}위</small>` : ''}</td>
      <td class="ins-title-cell">${x.own ? badge('자사', 'green') + ' ' : ''}${esc(x.title)}<small class="ins-sub">${esc(x.brand)}${x.brandGuessed ? ' (브랜드 추정)' : ''}${x.editedBy ? ` · 수정 ${esc(x.editedBy)}` : ''}</small></td>
      <td><input class="input ins-num" type="number" min="0" step="0.01" data-edit="price" data-id="${esc(x.id)}" value="${x.price == null ? '' : esc(x.price)}" aria-label="가격 (달러)"></td>
      <td><input class="input ins-num" type="number" min="1" max="500" data-edit="servings" data-key="${esc(x.key)}" value="${x.servingsSource === 'manual' ? esc(x.servings) : ''}" placeholder="${esc(x.servings)}" aria-label="회분 수">
        <small class="ins-sub">${esc(SERVING_SRC[x.servingsSource])}${x.servingsRule && x.servingsSource === 'parsed' ? ` · ${esc(x.servingsRule)}` : ''}</small></td>
      <td class="num">${esc(money(x.perServing))}</td>
      <td><select class="input ins-sel" data-edit="in_stock" data-id="${esc(x.id)}" aria-label="재고">
        <option value="true"${x.in_stock === true ? ' selected' : ''}>재고 있음</option><option value="false"${x.in_stock === false ? ' selected' : ''}>품절</option><option value=""${x.in_stock == null ? ' selected' : ''}>모름</option></select></td>
      <td><label class="check"><input type="checkbox" data-edit="own" data-id="${esc(x.id)}"${x.own ? ' checked' : ''}>자사</label></td>
      <td>${changeBadge(x.change) || '<span class="muted">—</span>'}</td>
      <td>${extLink(x.link)}</td></tr>`).join('');
    const table = `<div class="flex wrap mb-16">
        <button type="button" class="btn small" data-act="ins-update-only" data-items="weee">${icon('refresh')}Weee! 수집</button>
        <button type="button" class="btn small" data-act="ins-update-only" data-items="amazon">${icon('refresh')}Amazon 수집</button>
        ${d.weeeRaw.length ? `<button type="button" class="btn small ghost" data-act="weee-raw">${icon('doc')}Weee! 원문 보기</button>` : ''}
        <span class="small muted">회분 · 가격 · 재고 · 자사 표시는 바로 고칠 수 있어요. 회분 수는 한 번 고치면 모든 주차에 적용돼요.</span>
      </div>
      ${d.items.length ? `<div class="table-wrap"><table class="data-table ins-table"><thead><tr><th>판매처</th><th>상품</th><th>가격 ($)</th><th>회분</th><th class="num">1회분</th><th>재고</th><th>자사</th><th>변화</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="small muted">수집된 상품이 없어요.</p>'}`;
    return qHead('shelf', d.oneLine, legend) +
      (d.items.length ? `<div class="grid-3 mt-24">${cols}</div>${unknown}` : `<div class="mt-24">${ui.empty('진열대 데이터가 없어요. 데이터 업데이트에서 Weee! · Amazon 진열대를 모으세요 (Firecrawl · SerpApi 키 필요).', 'grid')}</div>`) +
      fold('shelf-table', '표로 보기 · 수집 · 고치기', table);
  }

  function openProduct(x) {
    if (!x) return;
    const sig = [x.rating != null ? `별점 ${x.rating}` : '', x.reviews != null ? `리뷰 ${fmt.num(x.reviews)}개` : '', x.position ? `검색 ${x.position}위` : ''].filter(Boolean).join(' · ');
    const body = `<div class="part-insights ins-modal">
      <div class="flex wrap mb-16">${badge(x.sourceLabel)}${x.own ? badge('자사 (알디콤)', 'green') : ''}${x.watched ? badge('★ 주시', 'lime') : ''}${stockBadge(x.in_stock)}${changeBadge(x.change)}</div>
      ${ui.row('브랜드', esc(x.brand + (x.brandGuessed ? ' (상품명에서 추정)' : '')))}
      ${ui.row('가격 계산', esc(`${money(x.price)} ÷ ${x.servings}회분 = ${money(x.perServing)} / 1회분`))}
      ${ui.row('회분 근거', esc(SERVING_SRC[x.servingsSource] + (x.servingsRule ? ` · ${x.servingsRule}` : '')))}
      ${ui.row('재고', esc(x.availability || (x.in_stock === false ? '품절' : x.in_stock ? '재고 있음' : '모름')))}
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

  function openWeeeRaw() {
    const raw = ((S.data.shelf || {}).weeeRaw) || [];
    const body = `<div class="part-insights ins-modal"><p>Firecrawl이 읽은 Weee! 페이지 앞부분이에요 (상품을 못 찾았을 때 확인용).</p>
      ${raw.map(r => `<h3 class="ins-h3">${esc(r.url)}</h3><p class="small muted">${esc(fmt.datetime(r.at))} · ${esc(fmt.num(r.chars))}자</p><pre class="ins-pre">${esc(r.snippet)}</pre>`).join('')}</div>`;
    ui.modal({ title: 'Weee! 원문 (앞부분)', body, wide: true });
  }

  /* 경쟁사 */
  function compCard(c) {
    const sig = (label, v) => `<span class="ins-sig${v ? ' on' : ''}">${v ? icon('check') : ''}${esc(label)}${typeof v === 'number' && v ? ` ${v}` : ''}</span>`;
    return `<article class="ins-comp${c.watched ? ' watched' : ''}">
      <div class="between"><strong>${c.watched ? '<span class="ins-star">★</span> ' : ''}${esc(c.brand)}</strong>
        <div class="flex">${c.recommended && !c.watched ? badge('추천', 'lime') : ''}${badge(`신호 ${c.score}/3`, c.score >= 2 ? 'green' : c.score ? 'blue' : '')}</div></div>
      <p class="small ins-reason">${esc(c.reason)}</p>
      <div class="ins-sigs">${sig('같은 판매처', c.signals.sameSeller)}${sig('고객 언급', c.signals.mention)}${sig('가격대 비슷', c.signals.similarPrice)}</div>
      <details class="ins-mini" data-fold="comp-${esc(c.brand)}"${S.open['comp-' + c.brand] ? ' open' : ''}><summary>근거 보기</summary>
        <ul class="ins-ul">${c.products.map(p => `<li>${esc(p.title)} <span class="muted small">· ${esc(p.source)} · ${esc(money(p.price))} (1회분 ${esc(money(p.perServing))})${p.in_stock === false ? ' · 품절' : ''}</span> ${extLink(p.link)}</li>`).join('')}</ul>
        ${c.mentions.length ? `<span class="field-label mt-8">고객 언급 (원문)</span><ul class="ins-ul">${c.mentions.map(m => `<li class="small">"${esc(m)}"</li>`).join('')}</ul>` : ''}
        ${c.brandGuessed ? '<p class="panel-note">브랜드는 상품명 첫 단어로 추정했어요. 틀릴 수 있어요.</p>' : ''}
      </details>
      <button type="button" class="btn small${c.watched ? '' : ' dark'}" data-act="watch" data-brand="${esc(c.brand)}" data-on="${c.watched ? '0' : '1'}">${c.watched ? '주시 해제' : '★ 주시하기'}</button>
    </article>`;
  }

  function competitorsHtml(d) {
    const cols = ['direct', 'category', 'substitute'].map(k => `<section class="card"><div class="card-head"><h2>${esc(d.tierLabels[k])}</h2>${badge(`${d.columns[k].length}개`)}</div>
      <div class="stack tight">${d.columns[k].map(compCard).join('') || '<p class="small muted">없음</p>'}</div></section>`).join('');
    const any = Object.values(d.columns).some(c => c.length);
    return qHead('competitors', d.oneLine, d.watch.length ? badge(`주시 ${d.watch.length}개`, 'lime') : '') +
      (d.ownFound ? '' : '<div class="note warn mt-16">자사 상품이 진열대에 없어 \'같은 판매처 · 가격대 비슷\' 신호는 계산하지 못했어요. 설정 › 수집 설정에서 추적 ASIN · Weee! 상품 주소를 넣거나, 진열대 표에서 자사 표시를 하세요.</div>') +
      (any ? `<div class="grid-3 mt-24">${cols}</div>` : `<div class="mt-24">${ui.empty('진열대 데이터가 있어야 경쟁사를 묶을 수 있어요.', 'users')}</div>`) +
      `<p class="panel-note mt-16">신호 3개(같은 판매처 · 고객 언급 · 가격대 비슷)가 많을수록 위에 보여요. 주시하기로 고른 브랜드는 다른 화면에서도 먼저 보여요 (5~6개 추천). 구분(직접 · 카테고리 · 대체재)은 상품명 단어로 나눈 규칙 결과예요.</p>`;
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

  /* 구매자 리뷰 */
  function reviewsHtml(d) {
    const head = `<tr><th>브랜드</th><th class="num">리뷰</th><th class="num">평균 별점</th>${d.topics.map(t => `<th>${esc(t)}</th>`).join('')}</tr>`;
    const cell = (b, t) => {
      const c = b.topics[t];
      if (!c.pos && !c.neg) return '<td class="muted">—</td>';
      return `<td class="nowrap">${c.pos ? `<button type="button" class="ins-cell pos" data-act="rv" data-brand="${esc(b.brand)}" data-topic="${esc(t)}" data-s="+">+${c.pos}</button>` : ''}` +
        `${c.neg ? `<button type="button" class="ins-cell neg" data-act="rv" data-brand="${esc(b.brand)}" data-topic="${esc(t)}" data-s="-">−${c.neg}</button>` : ''}</td>`;
    };
    const rows = d.table.map(b => `<tr><td>${b.own ? badge('자사', 'green') + ' ' : ''}${b.watched ? '<span class="ins-star">★</span> ' : ''}${esc(b.brand)}</td>
      <td class="num">${esc(b.total)}</td><td class="num">${b.avgRating == null ? '—' : esc(b.avgRating)}</td>${d.topics.map(t => cell(b, t)).join('')}</tr>`).join('');
    const sums = d.summaries.length ? d.summaries.map(s => `<div class="ins-quote-block"><b>${esc(s.title || s.asin)}</b><p class="ins-quote">${esc(s.text)}</p></div>`).join('')
      : '<p class="small muted">아마존 상품 상세 조회 때 리뷰 요약이 있으면 여기에 보여요.</p>';
    const upload = `<section class="card"><div class="card-head"><h2>Weee! 리뷰 CSV 올리기</h2><a class="link" href="/api/insights/templates/weee-reviews.csv" download>${icon('download')}양식 받기</a></div>
      <p class="small muted">Weee!는 상품 페이지에 리뷰가 없어 직접 모아 올려요. 열: product · brand · rating(1~5) · date · title · text · own(자사면 Y). 고객 이름 · 연락처는 넣지 마세요.</p>
      <div class="flex wrap mt-16"><input type="file" accept=".csv,text/csv" data-ref="file-reviews" aria-label="Weee! 리뷰 CSV 파일"><button type="button" class="btn small lime" data-act="upload-reviews">${icon('upload')}올리기</button></div></section>`;
    const latest = d.items.slice(0, 60).map(r => `<li><div class="flex wrap">${badge(r.source === 'amazon' ? 'Amazon' : 'Weee!')}${r.own ? badge('자사', 'green') : ''}${sentBadge(r.sentiment)}<b>${esc(r.brand)}</b>${r.rating != null ? `<span class="small muted">별점 ${esc(r.rating)}</span>` : ''}${r.by === 'ai' ? badge('AI 분류', 'purple') : ''}</div>
      ${r.summaryKo ? `<p>${esc(r.summaryKo)}</p>` : ''}<p class="small muted">${esc(r.title ? r.title + ' — ' : '')}${esc(r.text)}</p></li>`).join('');
    return qHead('reviews', d.oneLine, d.stats.total ? badge(`AI 분류 ${d.stats.ai} · 규칙 ${d.stats.total - d.stats.ai}`) : '') +
      `<section class="card mt-24"><div class="card-head"><h2>브랜드 × 주제</h2><span class="small muted">+칭찬 / −불만을 누르면 리뷰가 보여요</span></div>
        ${d.table.length ? `<div class="table-wrap"><table class="data-table ins-matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`
          : ui.empty('리뷰가 없어요. Amazon 수집(대표 리뷰)이나 Weee! CSV로 모으세요.', 'chat')}
        <p class="panel-note mt-8">Amazon은 전체가 아니라 대표 리뷰 기준이에요. 주제 · 칭찬/불만은 규칙(단어 · 별점)으로 나누고, OpenAI 키가 있으면 '리뷰 분류'가 AI로 다시 나눠요.</p></section>
      <div class="grid-2 mt-24"><section class="card"><div class="card-head"><h2>아마존 리뷰 요약</h2>${badge('원문')}</div>${sums}</section>${upload}</div>` +
      fold('reviews-raw', `원본 리뷰 (최근 ${Math.min(60, d.items.length)}개)`, latest ? `<ul class="ins-reviews">${latest}</ul>` : '<p class="small muted">없음</p>');
  }

  function sentBadge(s) { return s === '+' ? badge('칭찬', 'green') : s === '-' ? badge('불만', 'red') : badge('중립'); }

  function openReviews(brand, topic, s) {
    const items = ((S.data.reviews || {}).items || []).filter(r => r.brand === brand && r.topics.includes(topic) && r.sentiment === s);
    const body = `<div class="part-insights ins-modal"><p>${esc(brand)} · ${esc(topic)} · ${s === '+' ? '칭찬' : '불만'} ${items.length}개</p>
      <ul class="ins-reviews">${items.map(r => `<li><div class="flex wrap">${badge(r.source === 'amazon' ? 'Amazon' : 'Weee!')}${r.rating != null ? `<span class="small muted">별점 ${esc(r.rating)}</span>` : ''}<span class="small muted">${esc(r.product)}</span></div>
        ${r.summaryKo ? `<p><b>${esc(r.summaryKo)}</b> ${badge('AI 요약', 'purple')}</p>` : ''}
        <p class="ins-quote">${esc(r.title ? r.title + ' — ' : '')}${esc(r.text)}</p></li>`).join('') || '<li class="muted">없음</li>'}</ul>
      ${items.some(r => r.summaryKo) ? '' : '<p class="panel-note">한국어 요약은 OpenAI 키가 있을 때 \'리뷰 분류\'에서 만들어져요.</p>'}</div>`;
    ui.modal({ title: `${brand} · ${topic}`, body, wide: true });
  }

  /* 잠재 고객 (유튜브) */
  function audienceHtml(d) {
    if (!d.month) {
      return qHead('audience', '') + `<div class="mt-24">${ui.empty('유튜브 데이터가 없어요. 월간 분석 실행에서 \'유튜브 수집\'을 고르세요 (YouTube 키 필요 · 약 1,000 units).', 'video')}</div>`;
    }
    const months = d.months.length > 1 ? `<select class="input ins-sel" data-ref="aud-month" aria-label="월">${d.months.map(m => `<option${m === d.month ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>` : '';
    const q = d.questions.map(x => `<li><div class="between"><b>${esc(x.label)}</b>${badge(`${x.count}건`)}</div>${x.examples.slice(0, 2).map(e => `<small>"${esc(e)}"</small>`).join('')}</li>`).join('');
    const ex = d.expressions.map(x => `<li><div class="between"><b>"${esc(x.phrase)}"</b>${badge(`${x.count}개 댓글`)}</div><small>${esc(x.example)}</small></li>`).join('');
    const cr = d.creators.map(c => `<li><div class="between"><b>${esc(c.channel)}</b>${extLink(c.url, '채널')}</div><small>영상 ${esc(c.videos)}개 · 조회수 ${esc(fmt.num(c.views))} · 관련 댓글 ${esc(c.relevant)}</small></li>`).join('');
    const p = d.process;
    const sets = p.queries || {};
    const proc = `${ui.row('검색어 세트', esc(['A', 'B', 'K'].map(k => `${k} ${(sets[k] || []).length}개`).join(' · ')))}
      ${ui.row('찾은 영상', esc(`${p.found}개 (세트별 ${Object.keys(p.bySet || {}).map(k => `${k} ${p.bySet[k]}`).join(' · ') || '—'})`))}
      ${ui.row(`조회수 ${fmt.num(p.minViews)} 이상`, esc(`${p.kept}개`))}
      ${ui.row('댓글', esc(`${p.comments}개 중 관련 ${p.relevant}개 (AI 분류 ${p.ai}개)`))}
      <p class="panel-note mt-8">무관한 댓글(유튜버 칭찬 · 잡담)은 규칙으로 거르고, OpenAI 키가 있으면 'VOC 분류'가 AI로 다시 걸러요. 작성자 이름은 저장하지 않아요.</p>`;
    const comments = d.comments.map(c => `<li><p>${esc(c.text)}</p><small class="muted">${c.question ? `질문 · ${esc(c.topic)} · ` : ''}좋아요 ${esc(c.likes == null ? 0 : c.likes)} · ${esc(c.video)}</small></li>`).join('');
    return qHead('audience', d.oneLine, months) +
      `<div class="grid-3 mt-24">
        <section class="card"><div class="card-head"><h2>자주 묻는 질문</h2>${badge('Top 5')}</div>${q ? `<ul class="ins-list">${q}</ul>` : '<p class="small muted">질문 댓글이 없어요.</p>'}</section>
        <section class="card"><div class="card-head"><h2>자주 쓰는 표현</h2>${badge('Top 5')}</div>${ex ? `<ul class="ins-list">${ex}</ul>` : '<p class="small muted">반복되는 표현이 없어요.</p>'}</section>
        <section class="card"><div class="card-head"><h2>협업 후보 크리에이터</h2>${badge('Top 5')}</div>${cr ? `<ul class="ins-list">${cr}</ul>` : '<p class="small muted">기준을 넘은 영상이 없어요.</p>'}</section>
      </div>` + fold('aud-comments', `댓글 원문 (관련 ${d.comments.length}개)`, comments ? `<ul class="ins-reviews">${comments}</ul>` : '<p class="small muted">없음</p>') +
      fold('aud-process', '수집 과정', proc);
  }

  /* 검색 수요 */
  function trendsHtml(d) {
    const next = d.next.map(n => `<li><div class="between"><b>${esc(n.name)}</b><span class="flex">${n.opportunity ? badge('기회', 'green') : ''}<span class="small muted">${esc(fmt.dday(n.start))}</span></span></div>
      <small>${n.lift ? esc(`작년 같은 시기 '${n.lift.keyword}' 검색이 12개월 평균 대비 ${fmt.signed(n.lift.pct, 0, '%')} (${n.lift.date} 주)`) : '작년 같은 시기 데이터 없음'}</small></li>`).join('');
    const spikes = d.spikes.map(s => `<li><div class="between"><b>${esc(s.keyword)}</b>${badge(fmt.signed(s.pct, 0, '%'), 'orange')}</div><small>${esc(s.date)} 주 · 지수 ${esc(s.value)} · ${esc(s.reason)}</small></li>`).join('');
    const dates = Array.from(new Set(d.series.flatMap(s => s.points.map(p => p.date)))).sort();
    const table = d.series.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>주 시작</th>${d.series.map(s => `<th class="num">${esc(s.keyword)}</th>`).join('')}</tr></thead>
      <tbody>${dates.map(dt => `<tr><td>${esc(dt)}</td>${d.series.map(s => { const p = s.points.find(x => x.date === dt); return `<td class="num">${p ? esc(p.value) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="small muted">없음</p>';
    const upload = `<section class="card"><div class="card-head"><h2>Google Trends CSV 올리기</h2>${badge('SerpApi 키가 없을 때')}</div>
      <p class="small muted">trends.google.com에서 키워드를 <b>하나씩</b> 조회(미국 · 지난 12개월)한 뒤 '내려받기'로 받은 CSV를 올리세요.</p>
      <div class="flex wrap mt-16"><input type="file" accept=".csv,text/csv" data-ref="file-trends" aria-label="Google Trends CSV 파일"><button type="button" class="btn small lime" data-act="upload-trends">${icon('upload')}올리기</button></div></section>`;
    const srcs = d.series.map(s => `${s.keyword} (${s.source === 'csv' ? 'CSV' : 'SerpApi'} · ${s.week})`).join(' · ');
    return qHead('trends', d.oneLine) +
      `<div class="grid-2 mt-24">
        <section class="card"><div class="card-head"><h2>다음 급등 예상</h2><a class="link" href="/dashboard/settings#collect">시즌 편집 (설정)</a></div>${next ? `<ul class="ins-list">${next}</ul>` : '<p class="small muted">모니터링 중인 다가오는 시즌이 없어요.</p>'}</section>
        <section class="card"><div class="card-head"><h2>지난 12개월 급등과 이유</h2>${badge('이유는 추정')}</div>${spikes ? `<ul class="ins-list">${spikes}</ul>` : '<p class="small muted">평균보다 30% 넘게 오른 주가 없거나 데이터가 없어요.</p>'}</section>
      </div>
      <section class="card mt-24"><div class="card-head"><h2>12개월 검색 추이</h2><span class="small muted">미국 · 키워드마다 따로 조회 (0~100)</span></div>
        ${d.series.length ? `<div class="ins-chart"><canvas data-ref="chart" role="img" aria-label="키워드별 12개월 검색 추이"></canvas></div><p class="panel-note mt-8">${esc(srcs)}</p>`
          : ui.empty('검색 트렌드 데이터가 없어요. 데이터 업데이트(SerpApi)나 아래 CSV 올리기로 채우세요.', 'chart')}
      </section>
      <div class="grid-2 mt-24">${upload}<section class="card"><h3>알아두세요</h3><p class="panel-note mt-8">키워드마다 따로 조회해서 키워드끼리 크기를 비교하면 안 돼요 (각자 최고점이 100). 급등 이유는 시즌 날짜로 붙인 추정이에요. 시즌은 설정 › 수집 설정에서만 편집해요.</p></section></div>` +
      fold('trend-table', '숫자 표', table);
  }

  function cssVar(name, fallback) {
    try {
      const v = global.getComputedStyle(global.document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function drawChart(d) {
    const canvas = $(panel('data'), '[data-ref="chart"]');
    if (!canvas || !global.Chart || !d.series.length) return;
    const dates = Array.from(new Set(d.series.flatMap(s => s.points.map(p => p.date)))).sort();
    const grid = cssVar('--line', '#e9ece4');
    const text = cssVar('--muted', '#858981');
    S.chart = new global.Chart(canvas, {
      type: 'line',
      data: {
        labels: dates,
        datasets: d.series.map((s, i) => {
          const color = cssVar(LINE_COLORS[i % LINE_COLORS.length], '#637c13');
          const byDate = {};
          s.points.forEach(p => { byDate[p.date] = p.value; });
          return { label: s.keyword, data: dates.map(dt => (dt in byDate ? byDate[dt] : null)), borderColor: color, backgroundColor: color,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25, spanGaps: true };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: text, boxWidth: 12 } } },
        scales: {
          x: { ticks: { color: text, maxTicksLimit: 12 }, grid: { color: grid } },
          y: { beginAtZero: true, suggestedMax: 100, ticks: { color: text }, grid: { color: grid } }
        }
      }
    });
  }

  /* 정확도 검증 (자리만 · README '정확도 검증') */
  function drawAccuracy() {
    const body = $(panel('data'), '[data-ref="data-body"]');
    if (!body) return;
    if (S.chart) { try { S.chart.destroy(); } catch (e) { /* 무시 */ } S.chart = null; }
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

  /* CSV 올리기 (Weee! 리뷰 · Google Trends) */
  async function uploadCsv(btn, kind) {
    const input = $(panel('data'), `[data-ref="file-${kind}"]`);
    const f = input && input.files && input.files[0];
    if (!f) { toast('CSV 파일을 먼저 고르세요.', 'error'); return; }
    if (f.size > 2 * 1024 * 1024) { toast('CSV 파일이 너무 커요 (2MB 이하).', 'error'); return; }
    ui.busy(btn, true);
    try {
      const csv = (await f.text()).replace(/^﻿/, '');
      const r = await api(`/api/insights/${kind}/upload`, { csv });
      toast(kind === 'reviews' ? `리뷰 ${r.rows}줄 중 새 리뷰 ${r.added}개를 넣었어요.` : `키워드 ${r.keywords.length}개 (${r.keywords.join(', ')})를 넣었어요.`);
      S.data = {};
      trendP = null;
      loadData(kind);
      loadWeekly();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      ui.busy(btn, false);
    }
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
      ${missing ? '<div class="note warn mt-8">키가 없는 항목은 <a class="link" href="/dashboard/settings#connections">설정 › 연결</a>에서 키를 넣으면 쓸 수 있어요. 검색 트렌드는 데이터 › 검색 수요에서 Google Trends CSV를 올려 대신할 수 있어요.</div>' : ''}
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
