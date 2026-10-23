/* 콘텐츠 제작 파트 (담당: 나원) — tabs/content/docs/README.md · 챗봇_구성_설명서.md
   탭 두 개: AI와 함께 제작 (5항목 시트 → 대화 → 초안·이미지 → 버전·최종본) · 내 캠페인 (목록·검색·복원)
   상태 원본은 서버(DB)입니다. 화면은 서버가 돌려준 캠페인 상태를 그대로 그리고, "반영"은 서버 저장 뒤에만 표시합니다.
   다른 파트에는 REBOOT.use('content').campaigns()만 공개합니다. */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  const DATA = global.REBOOT_DATA && global.REBOOT_DATA.content;
  if (!REBOOT || !DATA) throw new Error('content: REBOOT core와 tabs/content/static/data.js를 먼저 불러와야 합니다');

  const ui = REBOOT.ui;
  const { esc, badge, icon, fmt, toast } = ui;
  const API = '/api/content';
  const LS = 'reboot:content:';           // 브라우저 임시 저장 (작성 중 시트 · 새 캠페인 기본 설정)
  const RANK = { PASS: 0, COND: 1, REVIEW: 2, REVISE: 3, BLOCK: 4 };
  const ACTIVE_JOB = ['queued', 'running', 'saving'];

  const S = {
    root: null,
    tab: 'create',
    sheet: emptySheet(),     // 새 캠페인 시트
    edit: null,              // 열린 캠페인의 시트 수정본
    camp: null,              // 열린 캠페인 (서버 상태)
    list: null, listMeta: null, listErr: '', filter: '전체', query: '',
    meta: null, health: null,
    sending: false, pending: null, retryId: null, retryText: '',
    baseOff: false, showLayers: true,
    flash: new Set(), flashTimer: null,
    reviews: {},             // versionId → 컴플라이언스 판정 (이번 화면에서 실행)
    folds: { sheet: false, ai: false, facts: false },
    pollTimer: null, searchTimer: null,
    personas: null
  };

  /* ───────── 작은 도우미 ───────── */

  function emptySheet() {
    return { content_type: '', channels: [], brand_focus: false, product_ids: [], goal: '', extra_request: '', reference_text: '' };
  }
  const rid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function lsGet(k, d) { try { const v = global.localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { global.localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 화면은 동작 */ } }
  function lsDel(k) { try { global.localStorage.removeItem(LS + k); } catch (e) { /* 무시 */ } }
  const ref = name => (S.root ? S.root.querySelector(`[data-ref="${name}"]`) : null);
  function products() { try { return REBOOT.data.products() || []; } catch (e) { return []; } }
  const productById = id => products().find(p => p.id === id) || null;
  const typeOf = id => DATA.contentTypes.find(t => t.id === id) || null;
  const typeLabel = id => (typeOf(id) ? typeOf(id).label : id || '—');
  const channelLabel = id => { const c = DATA.channels.find(x => x.id === id); return c ? c.label : id; };
  const decisionLabel = k => DATA.decisionLabels[k] || k;
  function fieldLabel(f) {
    f = String(f || '');
    if (f.startsWith('sheet.')) return DATA.sheetLabels[f.slice(6)] || f.slice(6);
    if (f.startsWith('decisions.')) return decisionLabel(f.slice(10));
    return f;
  }
  function shortValue(v) {
    if (Array.isArray(v)) {
      return v.map(x => (DATA.channels.some(c => c.id === x) ? channelLabel(x) : productById(x) ? productById(x).name : typeOf(x) ? typeLabel(x) : x)).join(', ') || '없음';
    }
    if (v === true) return '예';
    if (v === false) return '아니요';
    if (v == null || v === '') return '비움';
    return typeOf(v) ? typeLabel(v) : String(v);
  }
  function statusBadge(st) {
    if (st === 'confirmed') return badge('확정', 'green');
    if (st === 'proposed') return badge('제안');
    return '<span class="badge cnt-undecided">미정</span>';
  }
  const statusTone = st => DATA.statusTone[st] || '';
  const textReady = () => !!(S.meta ? S.meta.textReady : S.health && S.health.openai);
  const textModel = () => (S.meta && S.meta.textModel) || (S.health && S.health.openaiModel) || '—';
  function targetLabel(s) {
    const names = (s.product_ids || []).map(id => { const p = productById(id); return p ? (p.ko || p.name) : id; });
    return (s.brand_focus ? ['Reboot 브랜드 자체'] : []).concat(names).join(' + ') || '미선택';
  }
  function sheetMissing(s) {
    const out = [];
    if (!s.content_type) out.push('콘텐츠');
    if (!s.channels.length) out.push('게시 채널');
    if (!s.brand_focus && !s.product_ids.length) out.push('제작 대상');
    return out;
  }
  function sheetPayload(s) {
    return { content_type: s.content_type, channels: s.channels.slice(), brand_focus: !!s.brand_focus,
      product_ids: s.product_ids.slice(), goal: s.goal || '', extra_request: s.extra_request || '' };
  }
  // 모달 본문도 .part-content 범위로 (CSS는 .part-content .cnt-… 로만)
  function modal(o) {
    const userOpen = o.onOpen;
    return ui.modal(Object.assign({}, o, { onOpen: el => { el.classList.add('part-content'); if (userOpen) userOpen(el); } }));
  }
  function selectRange(el, text) {
    const a = text.indexOf('['), b = text.indexOf(']');
    el.focus();
    if (a >= 0 && b > a) el.setSelectionRange(a + 1, b); else el.setSelectionRange(text.length, text.length);
  }

  /* ───────── 렌더 진입 ───────── */

  function render(root) {
    S.root = root;
    root.classList.add('part-content');
    const saved = lsGet('sheet', null);
    if (saved && typeof saved === 'object') S.sheet = Object.assign(emptySheet(), saved);
    const hash = parseHash();
    if (hash.tab) S.tab = hash.tab;
    root.innerHTML = '<div data-ref="tabs"></div><div data-ref="main"></div>';
    bind(root);
    setupActions();
    renderTabs();
    renderMain();
    loadMeta();
    loadList();
    loadPersonas();
    if (hash.campaign) openCampaign(hash.campaign, { silent: true });
  }

  function parseHash() {
    const h = String(global.location && global.location.hash || '').replace(/^#/, '');
    const m = h.match(/^campaign=(\d+)$/);
    if (m) return { tab: 'create', campaign: +m[1] };
    if (h === 'campaigns') return { tab: 'campaigns' };
    return {};
  }
  function setHash(h) {
    try { global.history.replaceState(null, '', h ? '#' + h : global.location.pathname + global.location.search); } catch (e) { /* 무시 */ }
  }

  function setupActions() {
    const el = REBOOT.page.actions();
    if (!el) return;
    el.innerHTML = `<button type="button" class="btn" data-act="ai-settings">${icon('settings')}AI 설정</button>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act="ai-settings"]');
      if (b) aiSettingsModal();
    });
  }

  async function loadMeta() {
    try { S.meta = await REBOOT.api(`${API}/meta`); } catch (e) { S.meta = null; }
    try { S.health = await REBOOT.health(); } catch (e) { S.health = null; }
    if (S.tab === 'create') { renderAsideParts(); updateComposer(); renderMessages(); }
  }

  async function loadList() {
    const qs = new URLSearchParams();
    if (S.query) qs.set('q', S.query);
    if (S.filter && S.filter !== '전체') qs.set('status', S.filter);
    try {
      const d = await REBOOT.api(`${API}/campaigns${qs.toString() ? '?' + qs : ''}`);
      S.list = d.items;
      S.listMeta = { total: d.total, counts: d.counts, active: d.active };
      S.listErr = '';
    } catch (e) {
      S.listErr = e.message;
      if (!S.list) S.list = [];
    }
    renderTabs();
    if (S.tab === 'campaigns') renderCampaignGrid();
    REBOOT.refreshCounts();
  }

  async function loadPersonas() {
    try {
      const api = REBOOT.use('insights');
      if (!api || typeof api.personas !== 'function') return;
      const list = await Promise.resolve(api.personas());
      S.personas = Array.isArray(list) ? list.filter(p => p && p.name).slice(0, 6) : null;
      if (S.camp) renderQuick();
    } catch (e) { S.personas = null; }
  }

  function upcomingSeasons() {
    try {
      const list = REBOOT.use('home').seasons();
      if (!Array.isArray(list)) return [];
      return list.filter(s => s && !s.past && (s.inLead || s.ongoing || s.dday >= 0)).slice(0, 3);
    } catch (e) { return []; }
  }

  /* ───────── 탭 ───────── */

  function renderTabs() {
    const el = ref('tabs');
    if (!el) return;
    const n = S.listMeta ? S.listMeta.total : '';
    el.innerHTML = `<div class="tabs" role="tablist">
      <button type="button" role="tab" data-act="tab" data-value="create" class="${S.tab === 'create' ? 'active' : ''}" aria-selected="${S.tab === 'create'}">AI와 함께 제작</button>
      <button type="button" role="tab" data-act="tab" data-value="campaigns" class="${S.tab === 'campaigns' ? 'active' : ''}" aria-selected="${S.tab === 'campaigns'}">내 캠페인 <span class="muted small">${esc(n)}</span></button>
    </div>`;
  }

  function renderMain() {
    const el = ref('main');
    if (!el) return;
    if (S.tab === 'campaigns') {
      el.innerHTML = campaignsHtml();
      renderCampaignGrid();
      return;
    }
    el.innerHTML = `<div class="workbench cnt-bench">
      <section class="card cnt-studio" data-ref="studio">${S.camp ? studioHtml() : sheetStudioHtml()}</section>
      <aside class="stack cnt-aside" data-ref="aside">${S.camp ? studioAsideHtml() : sheetAsideHtml()}</aside>
    </div>`;
    if (S.camp) { scrollMessages(); updateComposer(); }
  }

  /* ───────── 1단계: 기본 정보 시트 ───────── */

  function sheetStudioHtml() {
    const s = S.sheet;
    return `<div class="cnt-studio-bar"><div class="flex">${icon('spark')}<strong>새 콘텐츠 만들기</strong></div>${badge('STEP 01 / 03')}</div>
      <div class="cnt-studio-body">
        <div class="cnt-welcome"><div class="cnt-spark" aria-hidden="true">✳</div><h2>어떤 이야기를 만들어볼까요?</h2>
          <p>콘텐츠와 채널, 제작 대상만 고르면 시작할 수 있어요. 나머지는 대화하면서 정해요.</p></div>
        ${sheetFormHtml(s, 'new')}
      </div>
      <div class="cnt-sheet-footer" data-ref="sheet-footer">${sheetFooterHtml()}</div>`;
  }

  function sheetFooterHtml() {
    const s = S.sheet;
    const missing = sheetMissing(s);
    const summary = missing.length ? `${missing.join(' · ')}을(를) 골라 주세요.`
      : `${typeLabel(s.content_type)} · ${s.channels.map(channelLabel).join(', ')} · ${targetLabel(s)}${s.goal ? ' · ' + s.goal : ''}`;
    return `<div class="cnt-sheet-summary"><span class="panel-note">${missing.length ? '필수 3개' : '선택한 정보'}</span><span class="cnt-summary-text">${esc(summary)}</span>
        <span class="panel-note">미정인 내용은 AI와 함께 정해요.</span></div>
      <button type="button" class="btn lime" data-act="start" ${missing.length ? 'disabled' : ''}>이 정보로 시작${icon('arrow')}</button>`;
  }

  function sheetFormHtml(s, ctx) {
    const isPlan = s.content_type === 'plan';
    const t = typeOf(s.content_type);
    const goalIsPreset = DATA.goals.includes(s.goal);
    const seasons = upcomingSeasons();
    return `<div class="cnt-sheet ${ctx === 'edit' ? 'compact' : ''}" data-sheet="${ctx}">
      <div class="field-label cnt-q">01 &nbsp; 만들 콘텐츠 <span class="cnt-req">필수</span></div>
      <div class="choice-grid cnt-types">${DATA.contentTypes.map(x => `<button type="button" class="choice" data-act="sheet-type" data-value="${esc(x.id)}" aria-pressed="${s.content_type === x.id}">${icon(x.icon)}<span>${esc(x.label)}</span>${s.content_type === x.id ? '<span class="cnt-check" aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>
      ${t ? `<p class="hint">${esc(t.hint)}</p>` : ''}
      <div class="field-label cnt-q">02 &nbsp; 게시 채널 <span class="cnt-req">필수</span>${isPlan ? '<span class="cnt-opt">기획서는 여러 개 선택 가능</span>' : ''}</div>
      <div class="chips">${DATA.channels.map(c => `<button type="button" class="chip" data-act="sheet-channel" data-value="${esc(c.id)}" aria-pressed="${s.channels.includes(c.id)}">${esc(c.label)}</button>`).join('')}</div>
      <div class="field-label cnt-q">03 &nbsp; 제작 대상 <span class="cnt-req">필수 · 하나 이상</span><span class="cnt-opt">제품은 여러 개 선택 가능</span></div>
      <div class="cnt-targets">
        <label class="cnt-target${s.brand_focus ? ' on' : ''}"><input type="checkbox" data-sheet-check="brand" ${s.brand_focus ? 'checked' : ''}>
          <span><b>Reboot 브랜드 자체</b><small>브랜드가 주제 · 제품 자동 선택 아님</small></span></label>
        ${products().map(p => { const on = s.product_ids.includes(p.id); return `<label class="cnt-target${on ? ' on' : ''}"><input type="checkbox" data-sheet-check="product" value="${esc(p.id)}" ${on ? 'checked' : ''}>
          <span><b>${esc(p.ko || p.name)}</b><small>${esc(p.name)} · ${esc(p.form || '')}</small></span></label>`; }).join('')}
      </div>
      <div class="between cnt-q-row"><span class="field-label cnt-q">04 &nbsp; 목적 <span class="cnt-opt">선택</span></span>
        <button type="button" class="link cnt-ai-link" data-act="suggest" data-field="goal">${icon('spark')}AI 추천</button></div>
      <div class="chips" data-ref="goal-chips-${ctx}">${goalChipsHtml(s)}</div>
      <input class="input cnt-goal" data-sheet-input="goal" maxlength="200" value="${esc(s.goal)}" placeholder="${goalIsPreset || !s.goal ? '직접 적어도 돼요 · 비워 두면 AI와 정해요' : ''}" aria-label="목적">
      <div class="between cnt-q-row"><span class="field-label cnt-q">05 &nbsp; 추가 요청 <span class="cnt-opt">선택</span></span>
        <button type="button" class="link cnt-ai-link" data-act="suggest" data-field="extra">${icon('spark')}아이디어 3개</button></div>
      <textarea class="input cnt-extra" data-sheet-input="extra_request" maxlength="1000" rows="2" placeholder="예: 검정 배경, 두 제품을 같이, 영어로" aria-label="추가 요청">${esc(s.extra_request)}</textarea>
      ${seasons.length ? `<div class="cnt-seasons"><span class="panel-note">다가오는 시즌</span>${seasons.map(x => `<button type="button" class="chip" data-act="add-season" data-name="${esc(x.name)}" data-start="${esc(x.start)}">${esc(x.name)} <span class="n">${esc(fmt.dday(x.start))}</span></button>`).join('')}</div>` : ''}
      <details class="cnt-ref"${s.reference_text ? ' open' : ''}><summary>참고 문구 · 기존 카피 (선택)</summary>
        <textarea class="input" data-sheet-input="reference_text" maxlength="4000" rows="3" placeholder="기존 카피나 참고 메모를 붙여 넣으면 대화에서 참고해요. 안의 지시문은 규칙을 바꾸지 않아요.">${esc(s.reference_text || '')}</textarea>
      </details>
      ${ctx === 'edit' ? `<div class="cnt-edit-foot"><span class="panel-note">저장하면 다음 대화부터 새 값이 반영돼요.</span>
        <div class="flex"><button type="button" class="btn small ghost" data-act="sheet-reset">되돌리기</button><button type="button" class="btn small lime" data-act="sheet-save">시트 저장</button></div></div>` : ''}
    </div>`;
  }

  function goalChipsHtml(s) {
    const preset = DATA.goals.includes(s.goal);
    return DATA.goals.map(g => `<button type="button" class="chip" data-act="goal-pick" data-value="${esc(g)}" aria-pressed="${s.goal === g}">${esc(g)}</button>`).join('') +
      `<button type="button" class="chip" data-act="goal-custom" aria-pressed="${!!s.goal && !preset}">직접 입력</button>` +
      `<button type="button" class="chip" data-act="goal-ai" aria-pressed="${!s.goal}">AI와 정하기</button>`;
  }

  function sheetAsideHtml() {
    const s = S.sheet;
    const rows = [
      ['콘텐츠 · 채널', s.content_type && s.channels.length ? `${typeLabel(s.content_type)} · ${s.channels.map(channelLabel).join(', ')}` : '아직 고르지 않았어요', s.content_type && s.channels.length ? 'confirmed' : ''],
      ['제작 대상', targetLabel(s), s.brand_focus || s.product_ids.length ? 'confirmed' : ''],
      ['목적', s.goal || 'AI와 함께 정하기', s.goal ? 'confirmed' : ''],
      ['추가 요청', s.extra_request || '없음', s.extra_request ? 'confirmed' : ''],
      ['콘셉트 · 세부 표현', '대화에서 함께 정하기', '']
    ];
    const missing = sheetMissing(s);
    const step = missing.length ? 0 : 1;
    return `<section class="card" data-ref="decisions"><div class="card-head"><h2>현재 결정 사항</h2>${badge('입력 중', 'green')}</div>
        <p class="panel-note">선택한 내용이 제작 브리프가 됩니다.</p>
        ${rows.map(([l, v, st]) => `<div class="decision"><label>${esc(l)}</label><div class="between"><span class="cnt-dval">${esc(v)}</span>${statusBadge(st)}</div></div>`).join('')}
      </section>
      <section class="card"><div class="card-head"><h2>이렇게 만들어져요</h2></div>
        ${DATA.workflow.map((t, i) => `<div class="workflow-step ${i === step ? 'current' : i < step ? 'done' : ''}"><span class="stepnum">${i < step ? '✓' : '0' + (i + 1)}</span>${esc(t)}</div>`).join('')}
        <div class="empty-art cnt-empty">${icon('image')}<span>완성된 콘텐츠가 여기에 표시됩니다.</span></div>
        <p class="panel-note mt-8">AI 결과는 참고용 초안이에요. 게시 전 담당자가 확인합니다.</p>
      </section>`;
  }

  /* 시트 입력 처리 (새 시트 · 수정 시트 공통) */
  function sheetCtx(el) {
    const box = el.closest('[data-sheet]');
    if (!box) return null;
    const ctx = box.dataset.sheet;
    return { ctx, box, s: ctx === 'edit' ? S.edit : S.sheet };
  }

  // 다시 그려도 키보드 초점이 같은 버튼·체크박스에 남게
  function rerenderKeepFocus(container, html) {
    const a = global.document.activeElement;
    let sel = null;
    if (a && container.contains(a)) {
      const v = s => (global.CSS && global.CSS.escape ? global.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
      if (a.dataset.act) sel = `[data-act="${v(a.dataset.act)}"]` + (a.dataset.value ? `[data-value="${v(a.dataset.value)}"]` : '') + (a.dataset.field ? `[data-field="${v(a.dataset.field)}"]` : '');
      else if (a.dataset.sheetCheck) sel = `[data-sheet-check="${v(a.dataset.sheetCheck)}"]` + (a.dataset.sheetCheck === 'product' ? `[value="${v(a.value)}"]` : '');
    }
    container.innerHTML = html;
    if (sel) { const el = container.querySelector(sel); if (el) el.focus(); }
  }

  function afterSheetChange(ctx, rerenderForm) {
    if (ctx === 'new') {
      lsSet('sheet', S.sheet);
      if (rerenderForm) {
        const studio = ref('studio');
        if (studio) {
          const body = studio.querySelector('.cnt-studio-body');
          const y = body ? body.scrollTop : 0;
          rerenderKeepFocus(studio, sheetStudioHtml());
          const b = studio.querySelector('.cnt-studio-body');
          if (b) b.scrollTop = y;
        }
      } else {
        const f = ref('sheet-footer');
        if (f) f.innerHTML = sheetFooterHtml();
        const chips = ref('goal-chips-new');
        if (chips) chips.innerHTML = goalChipsHtml(S.sheet);
      }
      const aside = ref('aside');
      if (aside && !S.camp) aside.innerHTML = sheetAsideHtml();
    } else if (S.edit) {
      const fold = ref('fold-sheet');
      if (rerenderForm && fold) rerenderKeepFocus(fold, foldSheetInner());
      else { const chips = ref('goal-chips-edit'); if (chips) chips.innerHTML = goalChipsHtml(S.edit); }
    }
  }

  function onSheetClick(act, b) {
    const c = sheetCtx(b);
    if (!c || !c.s) return false;
    const s = c.s;
    if (act === 'sheet-type') {
      s.content_type = b.dataset.value;
      if (s.content_type !== 'plan' && s.channels.length > 1) s.channels = s.channels.slice(0, 1);
    } else if (act === 'sheet-channel') {
      const id = b.dataset.value;
      if (s.content_type === 'plan') s.channels = s.channels.includes(id) ? s.channels.filter(x => x !== id) : s.channels.concat(id);
      else s.channels = s.channels.includes(id) ? [] : [id];
    } else if (act === 'goal-pick') {
      s.goal = b.dataset.value;
    } else if (act === 'goal-ai') {
      s.goal = '';
    } else if (act === 'goal-custom') {
      if (DATA.goals.includes(s.goal)) s.goal = '';
      afterSheetChange(c.ctx, true);
      const input = (c.ctx === 'edit' ? ref('fold-sheet') : ref('studio'));
      const el = input && input.querySelector('[data-sheet-input="goal"]');
      if (el) el.focus();
      return true;
    } else if (act === 'add-season') {
      const add = `시즌: ${b.dataset.name} (${b.dataset.start})`;
      if (!s.extra_request.includes(b.dataset.name)) s.extra_request = s.extra_request ? `${s.extra_request}, ${add}` : add;
    } else return false;
    afterSheetChange(c.ctx, true);
    return true;
  }

  function onSheetInput(el) {
    const c = sheetCtx(el);
    if (!c || !c.s) return;
    if (el.dataset.sheetInput) {
      c.s[el.dataset.sheetInput] = el.value;
      afterSheetChange(c.ctx, false);
    }
  }

  function onSheetCheck(el) {
    const c = sheetCtx(el);
    if (!c || !c.s) return;
    if (el.dataset.sheetCheck === 'brand') c.s.brand_focus = el.checked;
    else {
      const id = el.value;
      const set = new Set(c.s.product_ids);
      if (el.checked) set.add(id); else set.delete(id);
      c.s.product_ids = products().map(p => p.id).filter(x => set.has(x));
    }
    afterSheetChange(c.ctx, true);
  }

  async function startCampaign(btn) {
    const s = S.sheet;
    if (sheetMissing(s).length) return;
    ui.busy(btn, true);
    try {
      const body = Object.assign(sheetPayload(s), { reference_text: s.reference_text || '', settings: lsGet('settings', {}) });
      const res = await REBOOT.api(`${API}/campaigns`, body);
      S.sheet = emptySheet();
      lsDel('sheet');
      S.reviews = {};
      setCampaign(res.campaign);
      renderMain();
      loadList();
      if (textReady()) send('', { kickoff: true });
    } catch (e) {
      toast(e.message, 'error');
    } finally { ui.busy(btn, false); }
  }

  /* ───────── 2단계: 대화 스튜디오 ───────── */

  function setCampaign(c, opts) {
    const prev = S.camp && S.camp.id;
    S.camp = c;
    if (prev !== c.id) {
      S.edit = editCopy(c);
      S.baseOff = false;
      S.reviews = {};
    }
    setHash('campaign=' + c.id);
    if (opts && opts.applied) flashFields(opts.applied.map(a => a.field));
    if (c.jobs.some(j => ACTIVE_JOB.includes(j.status))) startPolling(); else stopPolling();
  }

  function editCopy(c) {
    return Object.assign(emptySheet(), JSON.parse(JSON.stringify(c.sheet)), { reference_text: c.referenceText || '' });
  }

  function flashFields(fields) {
    S.flash = new Set(fields);
    clearTimeout(S.flashTimer);
    S.flashTimer = setTimeout(() => { S.flash = new Set(); renderDecisions(); }, 8000);
  }

  async function openCampaign(id, opts) {
    try {
      const res = await REBOOT.api(`${API}/campaigns/${id}`);
      S.tab = 'create';
      setCampaign(res.campaign);
      renderTabs();
      renderMain();
    } catch (e) {
      if (!(opts && opts.silent)) toast(e.message, 'error');
      else { setHash(''); }
    }
  }

  function applyCampaign(c, opts) {
    setCampaign(c, opts);
    refreshStudio();
  }

  function refreshStudio() {
    if (S.tab !== 'create' || !S.camp) return;
    const studio = ref('studio');
    if (!studio || !studio.querySelector('[data-ref="messages"]')) { renderMain(); return; }
    const bar = ref('bar'); if (bar) bar.innerHTML = barHtml();
    const head = ref('head'); if (head) head.innerHTML = headHtml();
    renderMessages();
    renderQuick();
    updateComposer();
    renderAsideParts();
  }

  function renderAsideParts() {
    if (S.tab !== 'create') return;
    const aside = ref('aside');
    if (!aside) return;
    if (!S.camp) { aside.innerHTML = sheetAsideHtml(); return; }
    if (!aside.querySelector('[data-ref="results"]')) { aside.innerHTML = studioAsideHtml(); return; }
    renderDecisions();
    renderResults();
    renderFold('ai');
    renderFold('facts');
  }

  function studioHtml() {
    return `<div class="cnt-studio-bar" data-ref="bar">${barHtml()}</div>
      <div class="cnt-studio-head" data-ref="head">${headHtml()}</div>
      <div class="cnt-messages" data-ref="messages" aria-live="polite">${messagesHtml()}</div>
      <div class="cnt-dock">
        <div class="cnt-quick" data-ref="quick">${quickHtml()}</div>
        <div class="composer cnt-composer">
          <textarea data-ref="input" rows="2" aria-label="AI에게 보낼 메시지"></textarea>
          <div class="cnt-composer-bottom">
            <div class="flex wrap cnt-tools" data-ref="tools">${toolsHtml()}</div>
            <button type="button" class="send" data-act="send" aria-label="메시지 보내기">${icon('arrow')}</button>
          </div>
        </div>
      </div>`;
  }

  function barHtml() {
    const c = S.camp;
    return `<div class="flex cnt-bar-title">${icon('spark')}<strong title="${esc(c.title)}">${esc(c.title)}</strong>
        <button type="button" class="link" data-act="rename" aria-label="캠페인명 바꾸기 · 삭제">${icon('edit')}</button></div>
      <div class="flex cnt-bar-right">
        <label class="sr-only" for="cnt-status-select">상태</label>
        <select id="cnt-status-select" class="cnt-status ${statusTone(c.status)}" data-change="status">${DATA.statuses.map(st => `<option ${st === c.status ? 'selected' : ''}>${esc(st)}</option>`).join('')}</select>
        <span class="cnt-saved" title="서버에 저장됨 · 리비전 ${esc(c.revision)}">${icon('check')}저장됨 · ${esc(fmt.relative(c.updatedAt))}</span>
        <button type="button" class="btn small ghost" data-act="new-campaign">${icon('plus')}새로 만들기</button>
      </div>`;
  }

  function headHtml() {
    const c = S.camp, s = c.sheet;
    const chips = [`<span class="cnt-tag strong">${esc(typeLabel(s.content_type))}</span>`]
      .concat(s.channels.map(ch => `<span class="cnt-tag">${esc(channelLabel(ch))}</span>`))
      .concat(s.brand_focus ? ['<span class="cnt-tag lime">Reboot 브랜드</span>'] : [])
      .concat(s.product_ids.map(id => { const p = productById(id); return `<span class="cnt-tag lime" title="${esc(p ? p.name : id)}">${esc(p ? p.ko || p.name : id)}</span>`; }));
    return `<div class="cnt-tags">${chips.join('')}</div><span class="faint small">r${esc(c.revision)} · 만든 사람 ${esc(c.createdBy || '—')}</span>`;
  }

  function messagesHtml() {
    const c = S.camp;
    const out = [];
    if (c.messagesOmitted) out.push(`<div class="cnt-event">${icon('clock')}이전 대화 ${esc(c.messagesOmitted)}개는 줄여서 보여요.</div>`);
    c.messages.forEach(m => out.push(messageHtml(m)));
    if (!textReady() && !S.sending) out.push(noKeyHtml());
    if (S.pending) {
      if (!S.pending.kickoff) out.push(`<div class="message user cnt-pending"><div class="bubble">${esc(S.pending.text)}</div></div>`);
      out.push(`<div class="message"><div class="bot-symbol">✳</div><div class="cnt-bot"><div class="cnt-typing"><span></span><span></span><span></span>
        <em>${S.pending.kickoff ? '시트를 읽고 첫 제안을 준비하는 중…' : S.pending.force === 'image' ? '이미지 작업을 등록하는 중…' : '생각하는 중… 초안을 쓰면 30초쯤 걸려요'}</em></div></div></div>`);
    }
    return out.join('');
  }

  function noKeyHtml() {
    return `<div class="note warn cnt-nokey">${icon('settings')}<div><b>AI 대화를 쓰려면 OpenAI 키가 필요해요.</b>
      설정 › 연결에서 OPENAI_API_KEY를 넣으면 사용 가능합니다. 지금은 결정 사항을 정리하고 초안을 직접 작성할 수 있어요.
      <div class="flex wrap mt-8"><button type="button" class="btn small" data-act="manual-version">${icon('edit')}초안 직접 작성</button>
      <button type="button" class="btn small" data-act="add-decision">${icon('plus')}결정 사항 추가</button></div></div></div>`;
  }

  function messageHtml(m) {
    const time = `<span class="faint small">${esc(fmt.datetime(m.createdAt))}</span>`;
    if (m.role === 'user') {
      const p = m.payload || {};
      const tag = p.forceAction ? `<span class="cnt-msg-tag">${p.forceAction === 'image' ? '이미지 생성 버튼' : '초안 만들기 버튼'}</span>` : '';
      return `<div class="message user"><div class="bubble">${esc(m.text)}</div></div>${tag ? `<div class="cnt-user-meta">${tag}</div>` : ''}`;
    }
    if (m.role === 'event') {
      const p = m.payload || {};
      const tone = p.kind === 'job_failed' ? ' error' : p.kind === 'job_done' ? ' done' : '';
      const view = p.versionId ? ` <button type="button" class="link" data-act="select-version" data-id="${esc(p.versionId)}">보기</button>` : '';
      return `<div class="cnt-event${tone}">${icon(p.kind === 'job_failed' ? 'x' : p.kind === 'job_done' ? 'image' : 'clock')}<span>${esc(m.text)}</span>${view}${time}</div>`;
    }
    const p = m.payload || {};
    return `<div class="message cnt-msg-bot"><div class="bot-symbol" aria-hidden="true">✳</div><div class="cnt-bot">
      <div class="cnt-bot-head"><strong>REBOOT AI</strong>${badge('AI', 'lime')}${time}</div>
      <div class="prose cnt-bot-text">${ui.markdown(m.text)}</div>
      ${resultLinesHtml(p)}
      ${(p.questions || []).length ? `<ul class="cnt-questions">${p.questions.map(q => `<li><button type="button" class="link" data-act="answer" data-q="${esc(q)}">${icon('chat')}${esc(q)}</button></li>`).join('')}</ul>` : ''}
      ${candidatesHtml(m)}
    </div></div>`;
  }

  function resultLinesHtml(p) {
    const lines = [];
    (p.applied || []).forEach(a => {
      lines.push(`<li class="ok">${icon('check')}반영: ${esc(a.label)} → ${esc(a.new ? shortValue(a.new.value) : '미정')} ${a.new ? statusBadge(a.new.status) : ''}</li>`);
    });
    (p.rejected || []).forEach(r => lines.push(`<li class="no">반영 안 함: ${esc(r.label || r.field)} — ${esc(r.reason)}</li>`));
    if ((p.factRequests || []).length) lines.push(`<li class="wait">${icon('shield')}제품·브랜드 사실 변경 요청 ${esc(p.factRequests.length)}건은 확인 대기로 기록했어요 (설정 › 제품 정보에서 확인).</li>`);
    const a = p.action || {};
    if (a.status === 'done' && (a.versionIds || []).length) {
      const btns = a.versionIds.map((id, i) => `<button type="button" class="link" data-act="select-version" data-id="${esc(id)}">${esc((a.versionLabels || [])[i] || 'v' + id)}</button>`).join(' · ');
      lines.push(`<li class="ok">${icon('doc')}${a.type === 'select_version' ? '선택한 버전' : a.mode === 'edit' ? '수정본' : '초안'}: ${btns}</li>`);
    } else if (a.status === 'queued') {
      lines.push(`<li class="run"><span class="spinner"></span>이미지 작업을 등록했어요 — 진행 상황은 오른쪽 '진행 과정 & 결과'에서 볼 수 있어요.</li>`);
    }
    if (a.note) lines.push(`<li class="${a.status === 'failed' ? 'no' : 'info'}">${esc(a.note)}</li>`);
    return lines.length ? `<ul class="cnt-results">${lines.join('')}</ul>` : '';
  }

  function candidatesHtml(m) {
    const cands = (m.payload && m.payload.candidates) || [];
    if (!cands.length) return '';
    const c = S.camp;
    return `<div class="cnt-concepts">${cands.map((cd, i) => {
      const key = cd.field.startsWith('decisions.') ? cd.field.slice(10) : null;
      const cur = key ? c.decisions[key] : null;
      const chosen = key ? !!(cur && cur.value === cd.value && cur.status === 'confirmed') : c.sheet[cd.field.slice(6)] === cd.value;
      return `<button type="button" class="cnt-concept${chosen ? ' selected' : ''}" data-act="pick-candidate" data-msg="${esc(m.id)}" data-i="${i}" aria-pressed="${chosen}">
        <small>제안 0${i + 1} · ${esc(fieldLabel(cd.field))}</small><strong>${esc(cd.label)}</strong><span>${esc(cd.reason)}</span>${chosen ? '<em>✓ 선택됨</em>' : ''}</button>`;
    }).join('')}</div><p class="panel-note">카드를 고르면 확정으로 저장돼요. 고르기 전까지는 제안이에요.</p>`;
  }

  function renderMessages() {
    const el = ref('messages');
    if (!el || !S.camp) return;
    el.innerHTML = messagesHtml();
    scrollMessages();
  }
  function scrollMessages() {
    const el = ref('messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function quickHtml() {
    const ct = S.camp ? S.camp.sheet.content_type : '';
    const set = ct === 'image' ? DATA.quick.image : DATA.quick.text;
    const persona = S.personas && S.personas.length ? `<button type="button" class="chip" data-act="persona">${icon('users')}타깃 참고</button>` : '';
    return `<div class="chips">${set.map((q, i) => `<button type="button" class="chip" data-act="quick" data-i="${i}">${esc(q.label)}</button>`).join('')}${persona}</div>`;
  }
  function renderQuick() { const el = ref('quick'); if (el) el.innerHTML = quickHtml(); }

  function currentBase() {
    const c = S.camp;
    if (!c || S.baseOff || !c.selectedVersionId) return null;
    return c.versions.find(v => v.id === c.selectedVersionId) || null;
  }

  function toolsHtml() {
    const base = currentBase();
    const baseChip = base ? `<span class="cnt-base" title="수정 요청은 이 버전을 기준으로 해요">기준: ${esc(base.label)} · v${esc(base.seq)}
      <button type="button" data-act="base-off" aria-label="기준 버전 해제">✕</button></span>` : '';
    const mode = textReady() ? `AI 대화 · ${esc(textModel())}` : '키 없음 · 직접 작성 모드';
    return `${baseChip}<button type="button" class="cnt-tool" data-act="reference">${icon('plus')}참고 문구</button>
      <button type="button" class="cnt-tool" data-act="ai-settings">${icon('settings')}설정</button><span class="cnt-mode">${mode}</span>`;
  }

  function updateComposer() {
    const input = ref('input');
    if (!input || !S.camp) return;
    const ok = textReady();
    input.disabled = !ok || S.sending;
    input.placeholder = ok ? '원하는 방향이나 수정할 내용을 편하게 말해주세요. (Enter 보내기 · Shift+Enter 줄바꿈)'
      : 'OpenAI 키가 없어 AI 대화를 쓸 수 없어요 — 설정 › 연결에서 키를 넣으면 사용 가능';
    const send = S.root.querySelector('[data-act="send"]');
    if (send) send.disabled = !ok || S.sending;
    const tools = ref('tools');
    if (tools) tools.innerHTML = toolsHtml();
  }

  async function send(text, opts) {
    opts = opts || {};
    const c = S.camp;
    if (!c || S.sending) return;
    text = String(text || '').trim();
    if (!text && !opts.kickoff) return;
    if (!textReady()) { toast('OpenAI 키가 없어 AI 대화를 쓸 수 없어요. 설정 › 연결에서 키를 넣어 주세요.', 'error'); return; }
    if (!opts.kickoff && (!S.retryId || S.retryText !== text)) { S.retryId = rid(); S.retryText = text; }
    const base = currentBase();
    const body = { message: text, expected_revision: c.revision, base_version_id: base ? base.id : null };
    if (!opts.kickoff) body.client_request_id = S.retryId;
    if (opts.force) body.force_action = opts.force;
    if (opts.kickoff) body.kickoff = true;
    const input = ref('input');
    S.sending = true;
    S.pending = opts.kickoff ? { kickoff: true } : { text, force: opts.force };
    if (input && !opts.kickoff && input.value.trim() === text) input.value = '';
    renderMessages();
    updateComposer();
    let restore = '';
    try {
      const res = await REBOOT.api(`${API}/campaigns/${c.id}/chat`, body);
      S.retryId = null; S.retryText = '';
      S.sending = false; S.pending = null;
      applyCampaign(res.campaign, { applied: (res.reply && res.reply.payload && res.reply.payload.applied) || [] });
      if (res.job) startPolling();
      loadList();
    } catch (e) {
      S.sending = false; S.pending = null;
      if (e.status === 409 && e.data && e.data.campaign) {
        applyCampaign(e.data.campaign);
        if (e.data.duplicate) S.retryId = null; else { restore = text; S.retryId = null; }
      } else {
        restore = text;
        if (e.status === 503 && S.meta) S.meta.textReady = false;
      }
      toast(e.message, 'error');
    } finally {
      S.sending = false; S.pending = null;
      renderMessages();
      updateComposer();
      const inp = ref('input');
      if (inp && restore && !inp.value.trim()) { inp.value = restore; }
      if (inp && !inp.disabled) inp.focus();
    }
  }

  /* ───────── 오른쪽: 현재 결정 사항 · 진행 과정 & 결과 · 접이식 ───────── */

  function studioAsideHtml() {
    return `<section class="card" data-ref="decisions">${decisionsInner()}</section>
      <section class="card" data-ref="results">${resultsInner()}</section>
      <details class="card cnt-fold" data-fold="sheet"${S.folds.sheet ? ' open' : ''}><summary>${icon('edit')}기본 정보 시트 수정</summary><div data-ref="fold-sheet">${foldSheetInner()}</div></details>
      <details class="card cnt-fold" data-fold="ai"${S.folds.ai ? ' open' : ''}><summary>${icon('settings')}AI 설정</summary><div data-ref="fold-ai">${aiSettingsInner(false)}</div></details>
      <details class="card cnt-fold" data-fold="facts"${S.folds.facts ? ' open' : ''}><summary>${icon('shield')}제품 근거</summary><div data-ref="fold-facts">${factsInner()}</div></details>`;
  }

  function renderDecisions() { const el = ref('decisions'); if (el && S.camp) el.innerHTML = decisionsInner(); }
  function renderResults() { const el = ref('results'); if (el && S.camp) el.innerHTML = resultsInner(); }
  function renderFold(name) {
    const el = ref('fold-' + name);
    if (!el || !S.camp) return;
    el.innerHTML = name === 'sheet' ? foldSheetInner() : name === 'ai' ? aiSettingsInner(false) : factsInner();
  }

  function decisionRow(label, value, status, opts) {
    opts = opts || {};
    const flash = opts.field && S.flash.has(opts.field);
    const undo = flash && opts.field ? lastChange(opts.field) : null;
    const acts = [];
    if (status === 'proposed' && opts.key) acts.push(`<button type="button" class="link" data-act="confirm-decision" data-key="${esc(opts.key)}">확정</button>`);
    if (undo) acts.push(`<button type="button" class="link" data-act="undo" data-event="${esc(undo.id)}">되돌리기</button>`);
    if (opts.key && status) acts.push(`<button type="button" class="link cnt-x" data-act="clear-decision" data-key="${esc(opts.key)}" aria-label="${esc(label)} 미정으로">✕</button>`);
    return `<div class="decision${flash ? ' cnt-flash' : ''}"${opts.title ? ` title="${esc(opts.title)}"` : ''}><label>${esc(label)}</label>
      <div class="between"><span class="cnt-dval">${esc(value)}</span><span class="flex cnt-dact">${statusBadge(status)}${acts.join('')}</span></div></div>`;
  }

  function lastChange(field) {
    return (S.camp.recentChanges || []).find(e => e.field === field) || null;
  }

  function decisionsInner() {
    const c = S.camp, s = c.sheet;
    const rows = [
      decisionRow('콘텐츠 · 채널', `${typeLabel(s.content_type)} · ${s.channels.map(channelLabel).join(', ')}`, 'confirmed',
        { field: S.flash.has('sheet.channels') ? 'sheet.channels' : 'sheet.content_type' }),
      decisionRow('제작 대상', c.labels.target, 'confirmed', { field: S.flash.has('sheet.brand_focus') ? 'sheet.brand_focus' : 'sheet.product_ids' }),
      decisionRow('목적', s.goal || 'AI와 함께 정하기', s.goal ? 'confirmed' : '', { field: 'sheet.goal' }),
      decisionRow('추가 요청', s.extra_request || '없음', s.extra_request ? 'confirmed' : '', { field: 'sheet.extra_request' })
    ];
    const keys = (DATA.decisionHints[s.content_type] || []).slice();
    Object.keys(c.decisions).forEach(k => { if (!keys.includes(k)) keys.push(k); });
    keys.forEach(k => {
      const d = c.decisions[k];
      const title = d ? `출처: ${sourceLabel(d.source)} · ${d.by || '—'} · ${fmt.datetime(d.at)} · r${d.revision}` : '';
      rows.push(decisionRow(decisionLabel(k), d ? d.value : 'AI와 함께 정하기', d ? d.status : '', { key: k, field: 'decisions.' + k, title }));
    });
    const recent = (c.recentChanges || []).slice(0, 4);
    return `<div class="card-head"><h2>현재 결정 사항</h2>${badge(c.status, statusTone(c.status))}</div>
      <p class="panel-note">확정은 내가 고른 값, 제안은 AI 후보, 미정은 아직 없는 값이에요.</p>
      ${rows.join('')}
      <div class="flex wrap cnt-dlinks"><button type="button" class="link" data-act="add-decision">${icon('plus')}결정 추가</button>
        <button type="button" class="link" data-act="open-fold" data-fold="sheet">${icon('edit')}기본 정보 시트 수정</button></div>
      ${recent.length ? `<details class="cnt-recent"><summary>최근 변경 ${esc(recent.length)}건</summary><ul>${recent.map(e => `<li>
          <span>${esc(e.label)}: ${esc(e.old ? shortValue(e.old.value) : '미정')} → ${esc(e.new ? shortValue(e.new.value) : '미정')}</span>
          <small>${esc(sourceLabel(e.source))} · ${esc(e.user || '—')} · ${esc(fmt.relative(e.at))} · r${esc(e.revision)}</small>
          <button type="button" class="link" data-act="undo" data-event="${esc(e.id)}">되돌리기</button></li>`).join('')}</ul></details>` : ''}`;
  }

  function sourceLabel(src) {
    return { chat: '대화', candidate: '후보 선택', manual: '직접 입력', undo: '되돌리기', default: '기본값', sheet: '시트' }[src] || src || '—';
  }

  function selectedVersion() {
    const c = S.camp;
    if (!c || !c.versions.length) return null;
    return c.versions.find(v => v.id === c.selectedVersionId) || c.versions[0];
  }

  function resultsInner() {
    const c = S.camp;
    const vs = c.versions;
    const sel = selectedVersion();
    const hasDec = Object.values(c.decisions).some(d => d.status === 'confirmed');
    const steps = [
      ['브리프 정리', '완료'],
      ['방향 정하기', hasDec || vs.length ? '완료' : '진행 중'],
      ['초안 · 시안', vs.length ? '완료' : hasDec ? '진행 중' : '대기'],
      ['검토 · 최종본', c.finalVersionId ? '완료' : vs.length ? '진행 중' : '대기']
    ];
    const jobs = c.jobs.filter(j => ACTIVE_JOB.includes(j.status) || j.status === 'failed' || j.status === 'submission_unknown').slice(0, 3);
    const canImage = ['image', 'cardnews'].includes(c.sheet.content_type);
    const ready = textReady();
    const head = sel ? (sel.stale ? badge('변경 사항 미반영', 'orange') : badge('최신 결정 반영', 'green')) : badge(vs.length ? '결과 있음' : '방향 정하는 중', 'green');
    return `<div class="card-head"><h2>진행 과정 & 결과</h2>${head}</div>
      ${steps.map(([t, st], i) => `<div class="workflow-step ${st === '진행 중' ? 'current' : st === '완료' ? 'done' : ''}"><span class="stepnum">${st === '완료' ? '✓' : i + 1}</span>${esc(t)}<span class="cnt-step-st">${esc(st)}</span></div>`).join('')}
      ${jobs.map(jobHtml).join('')}
      <div class="flex wrap cnt-make">
        <button type="button" class="btn small lime" data-act="make-draft" ${ready ? '' : 'disabled title="OpenAI 키가 필요해요"'}>${icon('spark')}초안 만들기</button>
        ${canImage ? `<button type="button" class="btn small dark" data-act="make-image" ${ready ? '' : 'disabled title="OpenAI 키가 필요해요"'}>${icon('image')}이미지 생성</button>` : ''}
        <button type="button" class="btn small" data-act="manual-version">${icon('edit')}직접 작성</button>
      </div>
      ${sel ? previewHtml(sel) : `<div class="empty-art cnt-empty">${icon(canImage ? 'image' : 'doc')}<span>아직 결과물이 없어요.<br>대화에서 "만들어줘"라고 하거나 위 버튼을 눌러 보세요.</span></div>`}
      ${vs.length ? `<div class="cnt-vhead"><span class="field-label">버전 ${esc(vs.length)}개</span><button type="button" class="link" data-act="export">${icon('download')}전체 내보내기 (ZIP)</button></div>
        <div class="cnt-versions">${vs.map(v => versionRowHtml(v, sel)).join('')}</div>` : ''}`;
  }

  function jobHtml(j) {
    const active = ACTIVE_JOB.includes(j.status);
    const label = DATA.jobStatus[j.status] || j.status;
    return `<div class="cnt-job ${active ? 'run' : 'bad'}">${active ? '<span class="spinner"></span>' : icon('x')}
      <div><b>이미지 ${j.kind === 'image_edit' ? '편집' : '생성'} · ${esc(label)}</b>
      <small>${esc(j.model)} · ${esc(j.size)} · ${esc(fmt.relative(j.createdAt))}</small>
      ${j.error ? `<small class="cnt-job-err">${esc(j.error)}</small>` : ''}
      ${!active ? `<button type="button" class="link" data-act="retry-image">다시 요청하기</button>` : ''}</div></div>`;
  }

  function seqOf(id) {
    const v = S.camp.versions.find(x => x.id === id);
    return v ? v.seq : '?';
  }

  function versionRowHtml(v, sel) {
    return `<button type="button" class="cnt-version${sel && sel.id === v.id ? ' on' : ''}" data-act="select-version" data-id="${esc(v.id)}">
      <span class="cnt-vlabel">${esc(v.label)}</span>
      <span class="cnt-vmeta">v${esc(v.seq)} · ${esc(v.kindLabel)}${v.parentId ? ` · ← v${esc(seqOf(v.parentId))}` : ''} · ${esc(v.source === 'ai' ? 'AI' : '직접')}</span>
      <span class="cnt-vbadges">${v.isFinal ? badge('최종본', 'lime') : ''}${v.stale ? badge('미반영', 'orange') : ''}${keywordBadge(v, true)}</span></button>`;
  }

  function keywordBadge(v, mini) {
    const kw = v.review && v.review.keyword;
    if (!kw) return mini ? '' : badge('키워드 미확인');
    const st = DATA.keywordStatus[kw.status] || DATA.keywordStatus.clear;
    if (mini) return kw.status === 'clear' ? '' : badge(kw.status === 'error' ? '수정 필요' : '확인 필요', st.tone);
    return badge(st.label, st.tone);
  }

  function previewHtml(v) {
    const c = S.camp;
    const img = v.kind === 'image' && v.imageUrl;
    const layers = (v.image && v.image.text_layers) || [];
    const body = img
      ? `<div class="cnt-preview${S.showLayers && layers.length ? ' layers' : ''}"><img src="${esc(v.imageUrl)}" alt="${esc(v.label)} 이미지 시안" loading="lazy">
          ${layers.length ? `<div class="cnt-layer-box" aria-hidden="${!S.showLayers}">${layers.map(t => `<span class="cnt-layer ${esc(t.role)}">${esc(t.text)}</span>`).join('')}</div>` : ''}</div>
         <div class="between cnt-img-foot"><span class="panel-note">${badge('시안')} 글자·로고는 이미지에 그리지 않고 텍스트 레이어로 따로 둬요.</span>
          ${layers.length ? `<button type="button" class="link" data-act="toggle-layers">텍스트 레이어 ${S.showLayers ? '숨기기' : '보기'}</button>` : ''}</div>`
      : `<div class="prose cnt-doc">${ui.markdown(v.body)}</div>`;
    const cmp = complianceOf(v);
    const ai = v.review && v.review.ai;
    const kw = v.review && v.review.keyword;
    return `<div class="cnt-selected">
      <div class="between cnt-sel-head"><div><strong>${esc(v.label)} · v${esc(v.seq)}</strong> <span class="muted small">${esc(v.kindLabel)} · ${esc(v.source === 'ai' ? 'AI 생성' : '직접 작성')} · ${esc(fmt.datetime(v.createdAt))}</span></div>
        <div class="flex">${v.isFinal ? badge('최종본', 'lime') : ''}${v.source === 'ai' ? badge('AI · 참고용', 'purple') : ''}</div></div>
      ${v.stale ? `<p class="note warn cnt-stale">${icon('refresh')}변경 사항 미반영 — 이 버전을 만든 뒤 바뀐 항목: ${esc(v.staleFields.join(', '))}. 다시 만들면 반영돼요.</p>` : ''}
      ${v.note ? `<p class="panel-note">${esc(v.note)}</p>` : ''}
      ${v.approach && v.kind !== 'image' ? `<p class="panel-note">접근: ${esc(v.approach)}</p>` : ''}
      ${body}
      ${(v.needsCheck || []).length ? `<div class="note cnt-check-list"><b>확인 필요</b><ul>${v.needsCheck.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="cnt-review">
        <div class="cnt-review-row"><span>키워드 확인</span>${keywordBadge(v, false)}</div>
        ${kw && kw.items && kw.items.length ? `<ul class="cnt-review-items">${kw.items.map(i => `<li class="${esc(i.level)}">${esc(i.label)}${i.terms && i.terms.length ? ` <code>${esc(i.terms.join(', '))}</code>` : ''}</li>`).join('')}</ul>` : ''}
        <div class="cnt-review-row"><span>컴플라이언스</span>${cmp ? badge(cmp.label || cmp.verdict, DATA.complianceTone[cmp.verdict] || '') : badge('미검토')}
          <button type="button" class="link" data-act="compliance" data-id="${esc(v.id)}">${cmp ? '다시 검사' : '검사하기'}</button></div>
        ${cmp && cmp.findings && cmp.findings.length ? `<ul class="cnt-review-items">${cmp.findings.map(f => `<li class="${f.verdict === 'BLOCK' ? 'error' : 'warn'}">${esc(f.code)} ${esc(f.name)}${f.terms && f.terms.length ? ` <code>${esc(f.terms.join(', '))}</code>` : ''}${f.alt ? ` → ${esc(f.alt)}` : ''}</li>`).join('')}</ul>` : ''}
        ${v.kind !== 'image' ? `<div class="cnt-review-row"><span>AI 보조 검토</span>${ai ? badge(`${(ai.issues || []).length}건 지적`, (ai.issues || []).length ? 'orange' : '') : badge('미검토')}
          <button type="button" class="link" data-act="ai-review" data-id="${esc(v.id)}" ${textReady() ? '' : 'disabled title="OpenAI 키가 필요해요"'}>${ai ? '다시 검토' : '검토하기'}</button></div>
          ${ai ? `<div class="cnt-ai-review"><p>${esc(ai.summary)}</p>${(ai.issues || []).length ? `<ul class="cnt-review-items">${ai.issues.map(i => `<li class="warn">${esc(i.location)}: ${esc(i.problem)} → ${esc(i.suggestion)}</li>`).join('')}</ul>` : ''}<p class="panel-note">${esc(ai.note)}</p></div>` : ''}` : ''}
        <p class="panel-note">${esc((kw && kw.scope) || '텍스트만 확인')} · 결과는 참고용이며 법적 승인이 아니에요.</p>
      </div>
      <div class="flex wrap cnt-sel-actions">
        <button type="button" class="btn small ${v.isFinal ? '' : 'lime'}" data-act="final" data-id="${esc(v.id)}">${icon('check')}${v.isFinal ? '최종본 해제' : '최종본 지정'}</button>
        <button type="button" class="btn small" data-act="use-base" data-id="${esc(v.id)}">${icon('chat')}이 버전 기준으로 수정</button>
        ${compareCandidates(v).length ? `<button type="button" class="btn small" data-act="compare" data-id="${esc(v.id)}">비교</button>` : ''}
        ${v.kind !== 'image' ? `<button type="button" class="btn small" data-act="manual-edit" data-id="${esc(v.id)}">${icon('edit')}직접 수정</button>
          <button type="button" class="btn small" data-act="view-version" data-id="${esc(v.id)}">크게 보기</button>
          <button type="button" class="btn small ghost" data-act="copy" data-id="${esc(v.id)}">복사</button>` : `<a class="btn small ghost" href="${esc(v.imageUrl)}" target="_blank" rel="noopener">원본 열기</a>`}
        <button type="button" class="btn small ghost" data-act="export-one" data-id="${esc(v.id)}">${icon('download')}이 버전만</button>
      </div>
      ${c.finalVersionId === v.id ? '<p class="panel-note">최종본 지정은 팀이 고른 버전이라는 뜻이에요. 법적 승인이나 사실 확인 완료가 아니에요.</p>' : ''}
    </div>`;
  }

  function foldSheetInner() {
    if (!S.edit) S.edit = editCopy(S.camp);
    return sheetFormHtml(S.edit, 'edit');
  }

  function factsInner() {
    const f = S.camp.facts || {};
    const b = f.brand || {};
    const prods = f.products || [];
    const cell = (label, v, extra) => `<div class="row"><span>${esc(label)}</span><span>${v == null || v === '' ? `<em class="cnt-missing">미제공 · 확인 필요</em>` : esc(v)}${extra || ''}</span></div>`;
    return `<p class="panel-note">AI는 아래 값만 사실 근거로 써요 (기준 ${esc(f.facts_version || '—')}). 바꾸려면 설정 › 제품 정보에서 고칩니다.</p>
      <div class="cnt-fact"><b>Reboot 브랜드 ${badge('항상 포함')}</b>
        ${cell('슬로건', b.slogan)}${cell('브랜드 색', b.colors)}${cell('캐릭터', b.character)}${cell('CM송', b.cm_song)}${cell('구분', b.category)}</div>
      ${prods.length ? prods.map(p => `<div class="cnt-fact"><b>${esc(p.internal_name)} ${badge(p.evidence || '확인 필요', p.evidence === '확인 완료' ? 'green' : 'orange')}</b>
        ${cell('제형', p.form)}
        ${cell('맛', p.flavors && p.flavors.value, p.flavors && p.flavors.status === 'provisional' ? ' ' + badge('임시', 'orange') : '')}
        ${cell('포장', p.pack)}
        ${cell('개발 방향', p.development_direction, p.sugar_reduction === 'development_goal' ? ' ' + badge('개발 목표 · 저당 표현 금지', 'red') : '')}
        ${cell('성분', p.ingredients)}${cell('용량', p.volume)}${cell('외부 출시명', p.consumer_name === '미정' ? null : p.consumer_name)}
      </div>`).join('') : '<p class="panel-note">선택한 제품이 없어요 — 브랜드 정보만 근거로 써요.</p>'}`;
  }

  function aiSettingsInner(inModal) {
    const meta = S.meta || {};
    const camp = !inModal || S.camp ? S.camp : null;
    const st = camp ? camp.settings : Object.assign({}, (meta.defaults || { answer_length: 'short', candidates: 3, rewrite_max: 1 }), lsGet('settings', {}));
    const ready = textReady();
    const lengths = meta.answerLengths || { short: '짧게', normal: '보통', long: '자세히' };
    return `<div class="cnt-ai-settings">
      <div class="setting-row"><div><b>대화·제작 AI</b><p>대화 · 추천 · 기획 · 카피 · 보조 검토를 모델 하나로 해요.</p></div>
        <div class="cnt-model">${esc(textModel())} ${ready ? badge('연결됨', 'green') : badge('키 없음', 'orange')}</div></div>
      <div class="setting-row"><div><b>이미지 AI</b><p>이미지 작업 때만 써요. ${meta.imageEdit ? '기준 이미지를 넣어 편집할 수 있어요.' : '편집 미지원 모델이면 새 시안으로 만들어요.'}</p></div>
        <div class="cnt-model">OpenAI · ${esc(meta.imageModel || 'gpt-image-1')}</div></div>
      <div class="setting-row"><div><b>영상 AI</b><p>${esc((meta.video && meta.video.label) || '구성안만 (실제 영상 생성 미연동)')}</p></div>${badge('구성안만')}</div>
      <p class="panel-note">모델은 서버 설정이에요: 대화·제작 = CONTENT_TEXT_MODEL 또는 공통 OPENAI_MODEL(설정 › 연결) · 이미지 = CONTENT_IMAGE_MODEL.</p>
      <details class="cnt-adv"${inModal ? ' open' : ''}><summary>고급 옵션 ${camp ? '(이 캠페인)' : '(새 캠페인 기본값)'}</summary>
        <div class="field-grid three">
          <label class="field"><span>답변 길이</span><select data-setting="answer_length">${Object.keys(lengths).map(k => `<option value="${esc(k)}" ${st.answer_length === k ? 'selected' : ''}>${esc(lengths[k])}</option>`).join('')}</select></label>
          <label class="field"><span>콘셉트·카피 제안 수</span><select data-setting="candidates">${[1, 2, 3].map(n => `<option ${+st.candidates === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="field"><span>텍스트 자동 재작성</span><select data-setting="rewrite_max">${[0, 1, 2].map(n => `<option value="${n}" ${+st.rewrite_max === n ? 'selected' : ''}>최대 ${n}회</option>`).join('')}</select></label>
        </div>
        <p class="hint">자동 재작성은 키워드 확인에서 '수정 필요'가 나온 텍스트에만 써요. 유료 이미지 재생성은 자동으로 하지 않아요.</p>
        ${inModal ? '' : `<button type="button" class="btn small lime mt-8" data-act="save-settings">고급 옵션 저장</button>`}
      </details>
    </div>`;
  }

  function readSettings(el) {
    const out = {};
    el.querySelectorAll('[data-setting]').forEach(s => { out[s.dataset.setting] = s.dataset.setting === 'answer_length' ? s.value : +s.value; });
    return out;
  }

  async function saveSettings(values) {
    if (!S.camp) {
      lsSet('settings', values);
      toast('새 캠페인 기본값으로 저장했어요 (이 브라우저).');
      return true;
    }
    try {
      const res = await REBOOT.api(`${API}/campaigns/${S.camp.id}`, { expected_revision: S.camp.revision, settings: values }, { method: 'PATCH' });
      applyCampaign(res.campaign);
      toast('AI 설정을 저장했어요.');
      return true;
    } catch (e) { conflictOr(e); return false; }
  }

  function aiSettingsModal() {
    modal({
      title: 'AI 제작 설정',
      wide: false,
      body: `<p>모델은 하나만 골라 쓰고, 이미지·영상 설정은 해당 작업 때만 펼쳐요.</p>${aiSettingsInner(true)}`,
      actions: [{ label: '닫기', value: null }, { label: '설정 저장', value: 'save', tone: 'lime', onClick: el => { pendingSettings = readSettings(el); } }]
    }).then(v => { if (v === 'save' && pendingSettings) saveSettings(pendingSettings); });
  }
  let pendingSettings = null;

  /* ───────── 버전 · 검토 · 내보내기 ───────── */

  function complianceOf(v) {
    return S.reviews[v.id] || (v.review && v.review.compliance) || null;
  }

  function complianceProducts() {
    const ids = [];
    (S.camp.sheet.product_ids || []).forEach(id => { const p = productById(id); if (p && p.compliance_id) ids.push(p.compliance_id); });
    return ids;
  }

  async function runCompliance(v) {
    let api = null;
    try { api = REBOOT.use('compliance'); } catch (e) { api = null; }
    let result;
    if (!api || typeof api.review !== 'function') {
      result = { verdict: 'UNAVAILABLE', label: '미연동', findings: [] };
    } else {
      const text = v.kind === 'image' ? ((v.image && v.image.text_layers) || []).map(t => t.text).join('\n') : v.body;
      if (!String(text || '').trim()) { toast('검사할 문구가 없어요 (이미지 속 글자는 검사하지 않아요).', 'error'); return; }
      const channels = Array.from(new Set(S.camp.sheet.channels.map(ch => DATA.complianceChannel[ch] || 'b2c')));
      const prods = complianceProducts();
      try {
        const runs = [];
        channels.forEach(ch => (prods.length ? prods : ['']).forEach(pid => runs.push(api.review(text, pid ? { channel: ch, category: 'FOOD', product: pid } : { channel: ch, category: 'FOOD' }))));
        const byCode = {};
        let verdict = 'PASS';
        runs.forEach(r => {
          if (RANK[r.verdict] > RANK[verdict]) verdict = r.verdict;
          (r.findings || []).forEach(f => { if (!byCode[f.code] || RANK[f.verdict] > RANK[byCode[f.code].verdict]) byCode[f.code] = f; });
        });
        result = { verdict, label: DATA.complianceLabels[verdict] || verdict, findings: Object.values(byCode), channel: channels.join(','), products: prods };
      } catch (e) {
        result = { verdict: 'ERROR', label: '미검토 (검사 오류)', findings: [] };
      }
    }
    S.reviews[v.id] = result;
    renderResults();
    try {
      const res = await REBOOT.api(`${API}/versions/${v.id}/review`, {
        verdict: result.verdict, label: result.label, channel: result.channel || '', products: result.products || [],
        findings: result.findings.map(f => ({ code: f.code, name: f.name, verdict: f.verdict, terms: f.terms || [] }))
      });
      setCampaign(res.campaign);
      renderResults();
    } catch (e) { toast('검사 결과를 서버에 기록하지 못했어요: ' + e.message, 'error'); }
  }

  async function runAiReview(btn, v) {
    ui.busy(btn, true);
    try {
      const res = await REBOOT.api(`${API}/versions/${v.id}/ai-review`, {});
      applyCampaign(res.campaign);
    } catch (e) { toast(e.message, 'error'); } finally { ui.busy(btn, false); }
  }

  async function selectVersion(id) {
    const c = S.camp;
    if (!c) return;
    S.baseOff = false;
    if (c.selectedVersionId === id) { renderResults(); updateComposer(); return; }
    try {
      const res = await REBOOT.api(`${API}/campaigns/${c.id}/select`, { version_id: id });
      setCampaign(res.campaign);
      renderResults();
      updateComposer();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function toggleFinal(btn, v) {
    ui.busy(btn, true);
    try {
      const res = await REBOOT.api(`${API}/versions/${v.id}/final`, { final: !v.isFinal });
      applyCampaign(res.campaign);
      toast(v.isFinal ? '최종본 지정을 해제했어요.' : '최종본으로 지정했어요. 승인·사실 확인 완료를 뜻하지는 않아요.');
      loadList();
    } catch (e) { toast(e.message, 'error'); } finally { ui.busy(btn, false); }
  }

  function manualModal(parent) {
    const c = S.camp;
    if (!c) return;
    const defKind = parent ? parent.kind : (typeOf(c.sheet.content_type) || {}).kind || 'copy';
    let values = null;
    modal({
      title: parent ? `${parent.label} · v${parent.seq} 직접 수정` : '초안 직접 작성',
      wide: true,
      body: `<p>${parent ? '고친 내용은 새 버전으로 저장되고, 원래 버전은 그대로 남아요.' : '키가 없어도 초안을 직접 쓰고 버전으로 관리할 수 있어요.'} 저장할 때 키워드 확인을 거쳐요.</p>
        <div class="field-grid three">
          <label class="field"><span>종류</span><select data-m="kind">${DATA.textKinds.map(k => `<option value="${esc(k)}" ${k === defKind ? 'selected' : ''}>${esc(DATA.kinds[k])}</option>`).join('')}</select></label>
          <label class="field"><span>라벨</span><input data-m="label" maxlength="30" value="${esc(parent ? parent.label : '직접 작성')}"></label>
          <label class="field"><span>제목 (선택)</span><input data-m="title" maxlength="200" value="${esc(parent ? parent.title : '')}"></label>
        </div>
        <label class="field"><span>본문 (마크다운)</span><textarea data-m="body" rows="14" maxlength="20000">${esc(parent ? parent.body : '')}</textarea></label>`,
      actions: [{ label: '취소', value: null }, {
        label: '새 버전으로 저장', value: 'save', tone: 'lime',
        onClick: el => {
          const get = k => el.querySelector(`[data-m="${k}"]`).value;
          if (!get('body').trim()) { toast('본문을 입력하세요.', 'error'); return false; }
          values = { kind: get('kind'), label: get('label'), title: get('title'), body: get('body'), parent_id: parent ? parent.id : null };
          return true;
        }
      }]
    }).then(async v => {
      if (v !== 'save' || !values) return;
      try {
        const res = await REBOOT.api(`${API}/campaigns/${c.id}/versions`, values);
        S.baseOff = false;
        applyCampaign(res.campaign);
        toast('새 버전으로 저장했어요.');
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function compareCandidates(v) {
    const image = v.kind === 'image';
    return S.camp.versions.filter(x => x.id !== v.id && (x.kind === 'image') === image);
  }

  function compareBody(v) {
    const head = `<div class="cnt-cmp-head"><b>${esc(v.label)} · v${esc(v.seq)}</b> <span class="muted small">${esc(v.kindLabel)} · ${esc(fmt.datetime(v.createdAt))}</span>
      ${v.isFinal ? badge('최종본', 'lime') : ''}${v.stale ? badge('미반영', 'orange') : ''}</div>`;
    const body = v.kind === 'image' && v.imageUrl
      ? `<img src="${esc(v.imageUrl)}" alt="${esc(v.label)} 이미지 시안">`
      : `<div class="prose">${ui.markdown(v.body)}</div>`;
    return head + (v.approach ? `<p class="panel-note">접근: ${esc(v.approach)}</p>` : '') + body;
  }

  function compareModal(v) {
    const others = compareCandidates(v);
    if (!others.length) return;
    const parent = others.find(x => x.id === v.parentId);
    const first = parent || others[0];
    modal({
      title: '버전 비교',
      wide: true,
      body: `<label class="field"><span>비교할 버전</span><select data-m="other">${others.map(x => `<option value="${esc(x.id)}" ${x.id === first.id ? 'selected' : ''}>${esc(x.label)} · v${esc(x.seq)} · ${esc(x.kindLabel)}</option>`).join('')}</select></label>
        <div class="cnt-compare"><div class="cnt-cmp">${compareBody(v)}</div><div class="cnt-cmp" data-m="right">${compareBody(first)}</div></div>`,
      actions: [{ label: '닫기', value: null }],
      onOpen: el => {
        el.querySelector('[data-m="other"]').addEventListener('change', e => {
          const o = others.find(x => String(x.id) === e.target.value);
          if (o) el.querySelector('[data-m="right"]').innerHTML = compareBody(o);
        });
      }
    });
  }

  function viewVersion(v) {
    modal({
      title: `${v.label} · v${v.seq} — ${v.kindLabel}`,
      wide: true,
      body: `${v.approach ? `<p>접근: ${esc(v.approach)}</p>` : ''}${v.stale ? `<p class="note warn">변경 사항 미반영: ${esc(v.staleFields.join(', '))}</p>` : ''}
        <div class="prose">${ui.markdown(v.body)}</div>`,
      actions: [{ label: '닫기', value: null }]
    });
  }

  async function exportZip(versionId) {
    const c = S.camp;
    if (!c) return;
    try {
      const res = await REBOOT.api(`${API}/campaigns/${c.id}/export${versionId ? '?version=' + versionId : ''}`, undefined, { raw: true });
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/);
      ui.download(m ? m[1] : `reboot-content-${c.id}.zip`, blob);
      toast('내보냈어요. 파일 머리말에 미검토·임시 상태가 함께 적혀 있어요.');
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ───────── 결정 변경 (후보 · 직접 · 되돌리기) ───────── */

  async function changeDecisions(changes, source, messageId) {
    const c = S.camp;
    try {
      const res = await REBOOT.api(`${API}/campaigns/${c.id}/decisions`, { expected_revision: c.revision, changes, source, message_id: messageId || null });
      applyCampaign(res.campaign, { applied: res.applied || [] });
      return true;
    } catch (e) { conflictOr(e); return false; }
  }

  function conflictOr(e) {
    if (e.status === 409 && e.data && e.data.campaign) {
      applyCampaign(e.data.campaign);
      S.edit = editCopy(e.data.campaign);
      renderFold('sheet');
    }
    toast(e.message, 'error');
  }

  function pickCandidate(b) {
    const m = S.camp.messages.find(x => String(x.id) === b.dataset.msg);
    const cd = m && m.payload && (m.payload.candidates || [])[+b.dataset.i];
    if (!cd) return;
    changeDecisions([{ field: cd.field, value: cd.value, status: 'confirmed' }], 'candidate', m.id);
  }

  function undoChange(eventId) {
    const ev = (S.camp.recentChanges || []).find(e => String(e.id) === String(eventId));
    if (!ev) return;
    const ch = ev.old ? { field: ev.field, value: ev.old.value, status: ev.old.status || 'confirmed' } : { field: ev.field, value: null, status: 'undecided' };
    changeDecisions([ch], 'undo');
  }

  function addDecisionModal() {
    const keys = Object.keys(DATA.decisionLabels);
    let values = null;
    modal({
      title: '결정 사항 추가',
      body: `<p>대화 없이도 결정을 적어 둘 수 있어요. 확정은 내가 정한 값, 제안은 아직 논의 중인 값이에요.</p>
        <label class="field"><span>항목</span><select data-m="key">${keys.map(k => `<option value="${esc(k)}">${esc(DATA.decisionLabels[k])}</option>`).join('')}</select></label>
        <label class="field"><span>값</span><input data-m="value" maxlength="300" placeholder="예: 검정 배경에 네온 라임 포인트"></label>
        <label class="field"><span>상태</span><select data-m="status"><option value="confirmed">확정</option><option value="proposed">제안</option></select></label>
        <p class="hint">제품 사실(성분·가격·용량·맛 라인업 등)은 여기서 바꿀 수 없어요 — 설정 › 제품 정보.</p>`,
      actions: [{ label: '취소', value: null }, {
        label: '저장', value: 'save', tone: 'lime',
        onClick: el => {
          const get = k => el.querySelector(`[data-m="${k}"]`).value;
          if (!get('value').trim()) { toast('값을 입력하세요.', 'error'); return false; }
          values = { field: 'decisions.' + get('key'), value: get('value').trim(), status: get('status') };
          return true;
        }
      }]
    }).then(v => { if (v === 'save' && values) changeDecisions([values], 'manual'); });
  }

  async function saveSheetEdit(btn) {
    const c = S.camp, e = S.edit;
    if (!c || !e) return;
    const missing = sheetMissing(e);
    if (missing.length) { toast(`${missing.join(' · ')}을(를) 골라 주세요.`, 'error'); return; }
    const sheet = {};
    const cur = c.sheet;
    ['content_type', 'brand_focus', 'goal', 'extra_request'].forEach(k => { if (e[k] !== cur[k]) sheet[k] = e[k]; });
    ['channels', 'product_ids'].forEach(k => { if (e[k].join(',') !== cur[k].join(',')) sheet[k] = e[k].slice(); });
    const body = { expected_revision: c.revision };
    if (Object.keys(sheet).length) body.sheet = sheet;
    if ((e.reference_text || '') !== (c.referenceText || '')) body.reference_text = e.reference_text || '';
    if (Object.keys(body).length === 1) { toast('바뀐 내용이 없어요.'); return; }
    ui.busy(btn, true);
    try {
      const res = await REBOOT.api(`${API}/campaigns/${c.id}`, body, { method: 'PATCH' });
      const applied = Object.keys(sheet).map(k => ({ field: 'sheet.' + k }));
      applyCampaign(res.campaign, { applied });
      S.edit = editCopy(res.campaign);
      renderFold('sheet');
      toast('시트를 저장했어요. 다음 대화부터 반영돼요.');
      loadList();
    } catch (err) { conflictOr(err); } finally { ui.busy(btn, false); }
  }

  function renameModal() {
    const c = S.camp;
    let title = null, del = false;
    const me = REBOOT.user();
    const canDelete = me.isAdmin || (c.createdById && c.createdById === me.id);
    modal({
      title: '캠페인 정보',
      body: `<label class="field"><span>캠페인명</span><input data-m="title" maxlength="80" value="${esc(c.title)}"></label>
        <p class="hint">캠페인명은 결과물에 영향을 주지 않아 '변경 사항 미반영' 비교에서 빠져요.</p>
        ${canDelete ? '<div class="note error mt-16">캠페인을 삭제하면 대화·버전·이미지 파일이 함께 지워지고 되돌릴 수 없어요.</div>' : ''}`,
      actions: [{ label: '취소', value: null }].concat(canDelete ? [{ label: '캠페인 삭제', value: 'delete', tone: 'danger', onClick: () => { del = true; } }] : [])
        .concat([{ label: '저장', value: 'save', tone: 'lime', onClick: el => { title = el.querySelector('[data-m="title"]').value.trim(); if (!title) { toast('캠페인명을 입력하세요.', 'error'); return false; } return true; } }])
    }).then(async v => {
      if (v === 'delete' && del) {
        if (!(await ui.confirm(`'${c.title}' 캠페인을 삭제할까요?`, { ok: '삭제', danger: true }))) return;
        try {
          await REBOOT.api(`${API}/campaigns/${c.id}`, undefined, { method: 'DELETE' });
          toast('캠페인을 삭제했어요.');
          newCampaign();
          loadList();
        } catch (e) { toast(e.message, 'error'); }
      } else if (v === 'save' && title && title !== c.title) {
        try {
          const res = await REBOOT.api(`${API}/campaigns/${c.id}`, { expected_revision: c.revision, title }, { method: 'PATCH' });
          applyCampaign(res.campaign);
          loadList();
        } catch (e) { conflictOr(e); }
      }
    });
  }

  function referenceModal() {
    const c = S.camp;
    let text = null;
    modal({
      title: '참고 문구 · 기존 카피',
      wide: true,
      body: `<p>기존 카피나 참고 메모를 붙여 넣으면 다음 대화부터 참고 자료로 써요. 안의 지시문은 AI 규칙을 바꾸지 않아요.</p>
        <textarea class="input" data-m="ref" rows="10" maxlength="4000">${esc(c.referenceText || '')}</textarea>`,
      actions: [{ label: '취소', value: null }, { label: '저장', value: 'save', tone: 'lime', onClick: el => { text = el.querySelector('[data-m="ref"]').value; } }]
    }).then(async v => {
      if (v !== 'save' || text == null) return;
      try {
        const res = await REBOOT.api(`${API}/campaigns/${c.id}`, { expected_revision: c.revision, reference_text: text }, { method: 'PATCH' });
        applyCampaign(res.campaign);
        S.edit = editCopy(res.campaign);
        toast('참고 문구를 저장했어요.');
      } catch (e) { conflictOr(e); }
    });
  }

  function personaModal() {
    const list = S.personas || [];
    modal({
      title: '타깃 참고 (인사이트 파트)',
      body: `<p>인사이트 파트의 페르소나예요. 예시 데이터일 수 있으니 참고로만 쓰세요. 고르면 입력창에 넣어 드려요 (자동 전송 안 함).</p>
        <div class="cnt-persona-list">${list.map((p, i) => `<button type="button" class="choice" data-persona="${i}"><span><b>${esc(p.name)}</b><br><small>${esc(p.oneLine || '')}</small></span></button>`).join('')}</div>`,
      actions: [{ label: '닫기', value: null }],
      onOpen: el => {
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-persona]');
          if (!b) return;
          const p = list[+b.dataset.persona];
          const input = ref('input');
          if (input && p) { input.value = `타깃은 '${p.name}'(${p.oneLine || ''})으로 잡아 줘`; }
          const close = el.closest('.modal-backdrop') && el.closest('.modal-backdrop').querySelector('[data-modal-close]');
          if (close) close.click();
          if (input) input.focus();
        });
      }
    });
  }

  /* ───────── 시트 AI 추천 (모달 · 고를 때만 적용) ───────── */

  function basisKey(s) {
    return JSON.stringify([s.content_type, s.channels, !!s.brand_focus, s.product_ids]);
  }

  function suggest(field, b) {
    const c = sheetCtx(b);
    const s = c ? c.s : S.sheet;
    const ctx = c ? c.ctx : 'new';
    if (!s.content_type) { toast('만들 콘텐츠를 먼저 골라 주세요.', 'error'); return; }
    const basis = basisKey(s);
    const title = field === 'goal' ? '목적 AI 추천' : '추가 요청 아이디어';
    let items = [];
    modal({
      title,
      body: `<div class="cnt-suggest" data-ref-s="box"><div class="flex"><span class="spinner"></span>현재 콘텐츠·채널·대상에 맞는 후보를 만드는 중…</div></div>`,
      actions: [{ label: '닫기', value: null }],
      onOpen: el => {
        const box = el.querySelector('[data-ref-s="box"]');
        REBOOT.api(`${API}/suggest`, { field, sheet: sheetPayload(s) }).then(res => {
          items = res.items || [];
          const cur = field === 'goal' ? s.goal : s.extra_request;
          box.innerHTML = `<div class="flex wrap cnt-suggest-meta">${res.source === 'ai' ? badge('AI 추천', 'purple') : badge('예시 추천')}<span class="panel-note">${esc(res.note || '제작 아이디어예요. 시장 분석 결과가 아니에요.')}</span></div>
            ${cur ? `<p class="hint">지금 입력: "${esc(cur)}" — ${field === 'goal' ? '고르면 이 값을 바꿔요' : '고르면 뒤에 덧붙여요'}. 고르기 전에는 바뀌지 않아요.</p>` : ''}
            <div class="cnt-suggest-list">${items.map((it, i) => `<button type="button" class="cnt-concept" data-pick="${i}"><small>후보 0${i + 1}</small><strong>${esc(it.value)}</strong><span>${esc(it.reason)}</span></button>`).join('')}</div>`;
        }).catch(e => { box.innerHTML = `<p class="note error">${esc(e.message)}</p>`; });
        el.addEventListener('click', e => {
          const pb = e.target.closest('[data-pick]');
          if (!pb) return;
          const it = items[+pb.dataset.pick];
          const live = ctx === 'edit' ? S.edit : S.sheet;
          if (!it || !live) return;
          if (basisKey(live) !== basis) {
            toast('추천을 받은 뒤 콘텐츠·채널·대상이 바뀌었어요. 다시 추천받아 주세요.', 'error');
            return;
          }
          if (field === 'goal') live.goal = it.value;
          else live.extra_request = live.extra_request ? `${live.extra_request}, ${it.value}` : it.value;
          afterSheetChange(ctx, true);
          const close = el.closest('.modal-backdrop') && el.closest('.modal-backdrop').querySelector('[data-modal-close]');
          if (close) close.click();
        });
      }
    });
  }

  /* ───────── 이미지 작업 확인 ───────── */

  function startPolling() {
    if (S.pollTimer) return;
    S.pollTimer = setInterval(pollJobs, 3000);
  }
  function stopPolling() {
    clearInterval(S.pollTimer);
    S.pollTimer = null;
  }
  async function pollJobs() {
    const c = S.camp;
    const active = c ? c.jobs.filter(j => ACTIVE_JOB.includes(j.status)) : [];
    if (!active.length) { stopPolling(); return; }
    try {
      let changed = false;
      for (const j of active) {
        const res = await REBOOT.api(`${API}/jobs/${j.id}`);
        if (res.job.status !== j.status) changed = true;
      }
      if (changed && S.camp && S.camp.id === c.id) {
        const res = await REBOOT.api(`${API}/campaigns/${c.id}`);
        if (S.sending) { S.camp.jobs = res.campaign.jobs; return; }  // 보내는 중이면 응답이 상태를 다시 줌
        applyCampaign(res.campaign);
      }
    } catch (e) { /* 다음 확인 때 다시 */ }
  }

  /* ───────── 내 캠페인 ───────── */

  function campaignsHtml() {
    return `<div class="filters cnt-filters">
        <div class="chips" data-ref="filter-chips">${filterChipsHtml()}</div>
        <div class="flex wrap"><label class="search cnt-search">${icon('search')}<input class="input" data-ref="search" type="search" placeholder="캠페인명 · 제품 · 채널 · 콘텐츠 검색" value="${esc(S.query)}" aria-label="캠페인 검색"></label>
          <button type="button" class="btn lime" data-act="new-campaign">${icon('plus')}새 캠페인</button></div>
      </div>
      <div data-ref="grid"></div>`;
  }

  function filterChipsHtml() {
    const counts = (S.listMeta && S.listMeta.counts) || {};
    const total = S.listMeta ? S.listMeta.total : '';
    return ['전체'].concat(DATA.statuses).map(st => `<button type="button" class="chip" data-act="filter" data-value="${esc(st)}" aria-pressed="${S.filter === st}">${esc(st)} <span class="n">${esc(st === '전체' ? total : counts[st] || 0)}</span></button>`).join('');
  }

  function renderCampaignGrid() {
    const chips = ref('filter-chips');
    if (chips) chips.innerHTML = filterChipsHtml();
    const el = ref('grid');
    if (!el) return;
    if (S.list == null) { el.innerHTML = '<div class="skeleton" style="height:220px"></div>'; return; }
    if (S.listErr) { el.innerHTML = `<p class="note error">캠페인 목록을 불러오지 못했어요: ${esc(S.listErr)}</p>`; return; }
    if (!S.list.length) {
      el.innerHTML = ui.empty(S.query || S.filter !== '전체' ? '조건에 맞는 캠페인이 없어요.' : "아직 캠페인이 없어요. 'AI와 함께 제작'에서 시작해 보세요.", 'spark');
      return;
    }
    el.innerHTML = `<div class="cnt-campaign-grid">${S.list.map(cardHtml).join('')}</div>`;
  }

  function cardHtml(c) {
    const p = DATA.posters[c.contentType] || { en: 'CONTENT' };
    const head = c.cover
      ? `<div class="cnt-cover"><img src="${esc(c.cover)}" alt="${esc(c.title)} 대표 이미지" loading="lazy"></div>`
      : `<div class="poster cnt-poster t-${esc(c.contentType)}"><div class="wordmark">REB∞T</div><strong>${esc(p.en)}</strong><small>${esc(c.channelLabels.join(' · ').toUpperCase())}</small></div>`;
    const targets = (c.brandFocus ? ['브랜드'] : []).concat((c.products || []).map(x => x.ko || x.name));
    return `<button type="button" class="card cnt-campaign-card" data-act="open-campaign" data-id="${esc(c.id)}">
      ${head}
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.channelLabels.join(', '))} · ${esc(c.contentTypeLabel)} · ${esc(fmt.date(c.updatedAt))}</p>
      <div class="cnt-tags">${targets.map(t => `<span class="cnt-tag">${esc(t)}</span>`).join('')}${c.versionCount ? `<span class="cnt-tag strong">버전 ${esc(c.versionCount)}</span>` : ''}</div>
      <div class="between cnt-card-foot">${badge(c.status, statusTone(c.status))}<span class="small muted">작업 열기 ↗</span></div>
    </button>`;
  }

  function newCampaign() {
    stopPolling();
    S.camp = null;
    S.edit = null;
    S.tab = 'create';
    setHash('');
    renderTabs();
    renderMain();
  }

  /* ───────── 이벤트 (data-act · onclick 없음) ───────── */

  function bind(root) {
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || !root.contains(b) || b.disabled) return;
      const act = b.dataset.act;
      if (onSheetClick(act, b)) return;
      const v = b.dataset.id ? (S.camp && S.camp.versions.find(x => String(x.id) === b.dataset.id)) : null;
      switch (act) {
        case 'tab':
          S.tab = b.dataset.value;
          setHash(S.tab === 'campaigns' ? 'campaigns' : S.camp ? 'campaign=' + S.camp.id : '');
          renderTabs(); renderMain();
          if (S.tab === 'campaigns') loadList();
          break;
        case 'start': startCampaign(b); break;
        case 'suggest': suggest(b.dataset.field, b); break;
        case 'send': { const inp = ref('input'); if (inp) send(inp.value); break; }
        case 'quick': {
          const set = S.camp && S.camp.sheet.content_type === 'image' ? DATA.quick.image : DATA.quick.text;
          const q = set[+b.dataset.i];
          const inp = ref('input');
          if (q && inp && !inp.disabled) { inp.value = q.text; selectRange(inp, q.text); }
          break;
        }
        case 'persona': personaModal(); break;
        case 'answer': { const inp = ref('input'); if (inp && !inp.disabled) { inp.value = ''; inp.placeholder = b.dataset.q; inp.focus(); } break; }
        case 'pick-candidate': pickCandidate(b); break;
        case 'confirm-decision': {
          const d = S.camp.decisions[b.dataset.key];
          if (d) changeDecisions([{ field: 'decisions.' + b.dataset.key, value: d.value, status: 'confirmed' }], 'manual');
          break;
        }
        case 'clear-decision': changeDecisions([{ field: 'decisions.' + b.dataset.key, value: null, status: 'undecided' }], 'manual'); break;
        case 'undo': undoChange(b.dataset.event); break;
        case 'add-decision': if (S.camp) addDecisionModal(); break;
        case 'open-fold': {
          const d = root.querySelector(`details[data-fold="${b.dataset.fold}"]`);
          if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          break;
        }
        case 'sheet-save': saveSheetEdit(b); break;
        case 'sheet-reset': S.edit = editCopy(S.camp); renderFold('sheet'); break;
        case 'save-settings': { const box = ref('fold-ai'); if (box) saveSettings(readSettings(box)); break; }
        case 'ai-settings': aiSettingsModal(); break;
        case 'reference': if (S.camp) referenceModal(); break;
        case 'rename': renameModal(); break;
        case 'new-campaign': newCampaign(); break;
        case 'open-campaign': openCampaign(+b.dataset.id); break;
        case 'filter': S.filter = b.dataset.value; loadList(); renderCampaignGrid(); break;
        case 'select-version': selectVersion(+b.dataset.id); break;
        case 'use-base': if (v) { selectVersion(v.id); const inp = ref('input'); if (inp && !inp.disabled) { inp.focus(); inp.placeholder = `${v.label} · v${v.seq}을 어떻게 고칠까요? 예: 더 짧게, CTA만 바꿔줘`; } } break;
        case 'base-off': S.baseOff = true; updateComposer(); break;
        case 'final': if (v) toggleFinal(b, v); break;
        case 'compliance': if (v) runCompliance(v); break;
        case 'ai-review': if (v) runAiReview(b, v); break;
        case 'manual-version': manualModal(null); break;
        case 'manual-edit': if (v) manualModal(v); break;
        case 'view-version': if (v) viewVersion(v); break;
        case 'compare': if (v) compareModal(v); break;
        case 'copy':
          if (v && global.navigator && global.navigator.clipboard) {
            global.navigator.clipboard.writeText(v.body).then(() => toast('복사했어요.'), () => toast('복사하지 못했어요.', 'error'));
          }
          break;
        case 'export': exportZip(null); break;
        case 'export-one': if (v) exportZip(v.id); break;
        case 'toggle-layers': S.showLayers = !S.showLayers; renderResults(); break;
        case 'make-draft': send('초안 만들어줘', { force: 'draft' }); break;
        case 'make-image': send('이미지 시안 만들어줘', { force: 'image' }); break;
        case 'retry-image': { const inp = ref('input'); if (inp && !inp.disabled) { inp.value = '이미지 시안 다시 만들어줘'; inp.focus(); } break; }
        default: break;
      }
    });

    root.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.sheetInput) { onSheetInput(el); return; }
      if (el.dataset.ref === 'search') {
        clearTimeout(S.searchTimer);
        S.searchTimer = setTimeout(() => { S.query = el.value.trim(); loadList(); }, 300);
      }
    });

    root.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.sheetCheck) { onSheetCheck(el); return; }
      if (el.dataset.change === 'status' && S.camp) {
        const status = el.value;
        REBOOT.api(`${API}/campaigns/${S.camp.id}`, { expected_revision: S.camp.revision, status }, { method: 'PATCH' })
          .then(res => { applyCampaign(res.campaign); loadList(); toast(`상태를 '${status}'(으)로 바꿨어요.`); })
          .catch(err => { conflictOr(err); refreshStudio(); });
      }
    });

    root.addEventListener('keydown', e => {
      const el = e.target;
      if (el.dataset.ref !== 'input' || e.key !== 'Enter' || e.shiftKey) return;
      if (e.isComposing || e.keyCode === 229) return;  // 한글 조합 중에는 보내지 않음
      e.preventDefault();
      send(el.value);
    });

    root.addEventListener('toggle', e => {
      const d = e.target;
      if (d && d.dataset && d.dataset.fold) S.folds[d.dataset.fold] = d.open;
    }, true);
  }

  /* ───────── 등록 · 공개 ───────── */

  function campaigns() {
    return REBOOT.api(`${API}/campaigns`).then(d => ({
      total: d.total,
      active: d.active,
      items: (d.items || []).map(c => ({ id: c.id, title: c.title, status: c.status, updatedAt: c.updatedAt }))
    }));
  }

  REBOOT.register({
    id: 'content', label: '콘텐츠 제작', order: 30,
    title: '아이디어에서 콘텐츠까지.',
    subtitle: 'REBOOT AI와 함께, 브랜드의 다음 이야기를 만들어보세요.',
    render,
    summary: () => (S.listMeta ? { label: '진행 중 캠페인', value: S.listMeta.active } : null)
  });
  REBOOT.expose('content', { campaigns });
})(typeof window !== 'undefined' ? window : globalThis);
