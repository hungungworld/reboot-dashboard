/* 인플루언서 · 파트너 — 업체 컨택(3-1) · 협업 메일(3-2) · 협업 가이드(3-3)
   대표 파일(partners.js)이 탭을 그리고 REBOOT.use('partners.outreach').render(el, 'contacts' | 'mail')로 부릅니다.
   저장 키(REBOOT.store('partners')): outreach.draft.u<id> · outreach.guide.u<id> · outreach.filters.u<id> (사용자별),
   outreach.prompts (팀 공용 — 등록한 생성 프롬프트)
   메일은 '확인' 체크 + 발송 버튼을 사람이 눌러야만 보냅니다. AI 결과는 참고용 배지를 붙입니다. */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  const P = global.REBOOT_DATA && global.REBOOT_DATA.partners;
  const D = P && P.outreach;
  if (!REBOOT || !D) throw new Error('partners.outreach: core.js와 data-outreach.js를 먼저 불러와야 합니다');

  const doc = global.document;
  const ui = REBOOT.ui;
  const { esc, toast, badge, fmt, icon } = ui;
  const store = REBOOT.store('partners');
  const me = REBOOT.user() || {};
  const myName = me.name || String(me.email || '').split('@')[0] || '';
  const K = {
    draft: `outreach.draft.u${me.id || 0}`,
    guide: `outreach.guide.u${me.id || 0}`,
    filters: `outreach.filters.u${me.id || 0}`,
    prompts: 'outreach.prompts'
  };
  const TYPES = D.types;
  const MB = 1024 * 1024;
  const RD = P.records || { progress: [], mailStatus: [] };
  const PROG = {};
  (RD.progress || []).forEach(x => { PROG[x.v] = x; });
  const MAILS = {};
  (RD.mailStatus || []).forEach(x => { MAILS[x.v] = x; });
  const VERDICT = { BLOCK: ['사용 불가', 'red'], REVISE: ['수정 필요', 'orange'], COND: ['조건부', 'purple'], REVIEW: ['검토 필요', 'blue'], PASS: ['걸린 표현 없음', 'green'] };
  const COND_FIELDS = ['purpose', 'proposal', 'requests'];

  /* ───────── 도우미 ───────── */

  const pad = n => String(n).padStart(2, '0');
  function addDays(iso, n) {
    const p = String(iso || '').split('-').map(Number);
    const d = p.length === 3 && p.every(x => !isNaN(x)) ? new Date(p[0], p[1] - 1, p[2]) : new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function initials(name) {
    const words = String(name || '').replace(/^예시\)\s*/, '').split(/[\s·,&/()\-]+/).filter(w => /[A-Za-z0-9가-힣]/.test(w));
    if (!words.length) return '?';
    if (/^[A-Za-z0-9]/.test(words[0])) return (words[0][0] + (words[1] ? words[1][0] : (words[0][1] || ''))).toUpperCase();
    return words[0].slice(0, 2);
  }
  function avIndex(key) {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 5;
  }
  function fmtBytes(n) { return n >= MB ? (n / MB).toFixed(1) + 'MB' : Math.max(1, Math.round((n || 0) / 1024)) + 'KB'; }
  function safeUrl(u) {
    try { const x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; }
  }
  function shortUrl(u) {
    try { const x = new URL(u); return x.host + (x.pathname !== '/' ? x.pathname : ''); } catch (e) { return String(u || ''); }
  }
  function emailsOk(s) {
    const parts = String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
    return parts.length > 0 && parts.length <= 5 && parts.every(p => {
      const m = p.match(/<([^<>]+)>\s*$/);
      return /^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/.test(m ? m[1] : p);
    });
  }
  function replyAddress(from) {
    const m = String(from || '').match(/<([^<>]+)>/);
    const s = (m ? m[1] : String(from || '')).trim();
    return /^[^\s@<>]+@[^\s@<>]+\.[A-Za-z]{2,}$/.test(s) ? s : '';
  }
  // 업체 로고: 공식 사이트 도메인의 아이콘(DuckDuckGo 아이콘 서비스) · 예시 업체는 가상 로고 · 못 불러오면 이니셜
  const SAMPLE_LOGO = '/parts/partners/sample-logo-hjkwon.svg';
  function logoUrl(c) {
    if (c.example) return SAMPLE_LOGO;
    const raw = String(c.url || '').trim();
    if (!raw) return '';
    try {
      const host = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw).hostname.replace(/^www\./, '');
      return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://icons.duckduckgo.com/ip3/${host}.ico` : '';
    } catch (e) { return ''; }
  }
  function contactAvatar(c, big) {
    const init = `<span class="initial${big ? '' : ` ptn-av${avIndex(c.id)}`}" aria-hidden="true">${esc(initials(c.name))}</span>`;
    const src = logoUrl(c);
    return src ? `<span class="ptn-logo${big ? ' big' : ''}" aria-hidden="true"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-logo-fallback="${esc(initials(c.name))}"></span>` : init;
  }
  // 아이콘을 못 불러오면 이니셜로 바꿈 (그린 뒤 한 번 연결)
  function logoFallback(root) {
    root.querySelectorAll('img[data-logo-fallback]').forEach(img => img.addEventListener('error', () => {
      const box = img.parentElement;
      box.classList.add('is-initial');
      box.textContent = img.dataset.logoFallback;
    }, { once: true }));
  }
  const typeBadge = t => badge(`${D.typeIcon[t] || ''} ${t || '구분 없음'}`, D.typeTone[t] || '');
  const progressBadge = v => (v ? badge(`${PROG[v] ? PROG[v].emoji + ' ' : ''}${v}`, PROG[v] ? PROG[v].tone : '') : '');
  const mailBadge = v => (v ? badge(`${MAILS[v] ? MAILS[v].emoji + ' ' : ''}${v}`, MAILS[v] ? MAILS[v].tone : '') : '');
  const settingsLink = '<a class="link" href="/dashboard/settings">설정 › 연결</a>';
  function errorBox(message) {
    return `<section class="card"><p class="note error">${esc(message)}</p><button type="button" class="btn small soft mt-16" data-act="retry">${icon('refresh')} 다시 불러오기</button></section>`;
  }
  // 다른 탭으로 이동 (대표 파일이 ptn:go를 받아 탭을 바꿈)
  function go(tab) {
    const root = doc && doc.querySelector('.part-partners');
    if (root) root.dispatchEvent(new CustomEvent('ptn:go', { detail: { tab } }));
  }
  // 이전 화면 이벤트를 떼어 내려고 같은 자리에 새 요소를 둠
  function fresh(node) {
    const n = node.cloneNode(false);
    node.replaceWith(n);
    return n;
  }

  /* ───────── 서버 데이터 ───────── */

  let cfgP = null;
  function config() {
    if (!cfgP) cfgP = REBOOT.api('/api/partners/config').catch(e => { cfgP = null; throw e; });
    return cfgP;
  }
  let contactsP = null;
  function contacts(force) {
    if (!contactsP || force) contactsP = REBOOT.api('/api/partners/contacts').catch(e => { contactsP = null; throw e; });
    return contactsP;
  }
  function refreshSummary() {
    try { REBOOT.use('partners.records').refreshSummary(); } catch (e) { /* records.js 없음 */ }
  }

  /* ───────── 저장 (사용자별 초안 · 팀 공용 프롬프트) ───────── */

  function freshDraft() {
    const t = REBOOT.today();
    const ideal = {};
    const cond = {};
    TYPES.forEach(ty => {
      const d = D.defaults[ty];
      ideal[ty] = d.ideal;
      cond[ty] = { purpose: d.purpose, proposal: d.proposal, requests: d.requests };
    });
    return { v: 1, type: TYPES[1], sub: 'compose', partnerId: '', partnerName: '', to: '', subject: '', body: '', ai: false, ko: '',
      ideal, cond, start: t, end: addDays(t, D.periodDays), owner: myName, reply: null, attachOff: [] };
  }
  function getDraft() {
    const d = store.get(K.draft, null);
    if (!d || typeof d !== 'object' || d.v !== 1) return freshDraft();
    const base = freshDraft();
    const out = Object.assign(base, d);
    TYPES.forEach(ty => {
      out.ideal[ty] = typeof (d.ideal || {})[ty] === 'string' ? d.ideal[ty] : base.ideal[ty];
      out.cond[ty] = Object.assign({}, freshDraft().cond[ty], (d.cond || {})[ty] || {});
    });
    if (!TYPES.includes(out.type)) out.type = TYPES[1];
    if (!Array.isArray(out.attachOff)) out.attachOff = [];
    return out;
  }
  function saveDraft(d) { store.set(K.draft, d); }

  function promptFor(type, cfg) {
    const all = store.get(K.prompts, {}) || {};
    return typeof all[type] === 'string' && all[type].trim() ? all[type] : ((cfg && cfg.prompts && cfg.prompts[type]) || '');
  }
  function promptCustom(type) {
    const all = store.get(K.prompts, {}) || {};
    return typeof all[type] === 'string' && !!all[type].trim();
  }
  function setPrompt(type, text, cfg) {
    const all = store.get(K.prompts, {}) || {};
    if (!String(text || '').trim() || (cfg && cfg.prompts && text === cfg.prompts[type])) delete all[type];
    else all[type] = text;
    store.set(K.prompts, all);
  }

  function getFilters() {
    const f = store.get(K.filters, null);
    const out = Object.assign({ types: [], tags: [], q: '', view: 'list', selected: '' }, f && typeof f === 'object' ? f : {});
    if (!Array.isArray(out.types)) out.types = [];
    if (!Array.isArray(out.tags)) out.tags = [];
    return out;
  }
  function saveFilters(f) { store.set(K.filters, f); }

  /* ───────── 다른 파일·탭에서 부르는 기능 ───────── */

  /** 업체로 협업 메일 쓰기: 다른 업체면 제목·본문·번역을 비우고, 같은 업체면 그대로 둠 (README 3-1) */
  function compose(c) {
    const d = getDraft();
    if (d.partnerId !== c.id) Object.assign(d, { subject: '', body: '', ko: '', ai: false });
    d.reply = null;
    if (TYPES.includes(c.type)) d.type = c.type;
    Object.assign(d, { partnerId: c.id, partnerName: c.name, to: c.email || '', sub: 'compose' });
    saveDraft(d);
    go('mail');
  }

  /** 협업 이력의 회신 → 메일 화면 답장 모드 (같은 Gmail 대화로 첨부와 함께 발송) */
  function openReply(h) {
    const d = getDraft();
    const r = h.reply || {};
    d.reply = { historyId: h.id, partnerName: h.partnerName || '', from: r.from || '', at: r.at || '', body: r.body || '', subject: r.subject || h.subject || '' };
    Object.assign(d, { partnerId: h.partnerId || '', partnerName: h.partnerName || '', body: '', ko: '', ai: false, sub: 'compose' });
    if (TYPES.includes(h.partnerType)) d.type = h.partnerType;
    d.to = replyAddress(r.from) || h.to || '';
    d.subject = 'Re: ' + String(r.subject || h.subject || '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '');
    saveDraft(d);
    go('mail');
  }

  let wantImport = false;
  let importNote = null;
  /** 상단 '업체 파일 가져오기' 버튼: 업체 컨택 화면이 그려지면 가져오기 카드를 엶 */
  function openImport() { wantImport = true; }

  /* ═════════ 3-1 업체 컨택 ═════════ */

  async function renderContacts(el) {
    el.innerHTML = '<div class="ptn-out-hero ptn-skel-hero" aria-hidden="true"></div><div class="skeleton ptn-skel"></div>';
    let data;
    let ov;
    try {
      [data, ov] = await Promise.all([contacts(true), REBOOT.api('/api/partners/overview')]);
    } catch (e) {
      if (!el.isConnected) return;
      el.innerHTML = errorBox(`업체 목록을 불러오지 못했어요. ${e.message}`);
      el.querySelector('[data-act="retry"]').addEventListener('click', () => renderContacts(fresh(el)));
      return;
    }
    if (!el.isConnected) return;
    const st = { el, data, ov, f: getFilters(), files: {} };
    el.innerHTML = `${hero(ov)}<div data-ref="note"></div><div data-ref="main"></div><div data-ref="import"></div>`;
    if (importNote) {
      el.querySelector('[data-ref="note"]').innerHTML = importNote;
      importNote = null;
    }
    wireContacts(st);
    if (data.total) paintMain(st);
    paintImport(st, !data.total, wantImport);
    wantImport = false;
  }

  function hero(ov) {
    const c = ov.contacts || {};
    const b = ov.activeBreakdown || {};
    const pct = ov.contacted ? Math.min(100, Math.round(ov.active / ov.contacted * 100)) : 0;
    const rate = ov.sentPartners ? `발송 ${fmt.num(ov.sentPartners)}곳 중 · 회신율 ${fmt.pct(ov.replyRate)}` : '아직 발송한 메일이 없어요';
    const sample = (ov.partners || []).some(p => p.sample) ? ' · 예시 기록은 숫자에서 뺌' : '';
    return `<section class="ptn-out-hero" aria-label="협업 현황 (실제 기록 기준 · 예시 제외)">
      <div><h3>연락한 업체 수</h3><div class="number">${fmt.num(ov.contacted)} <span class="small">곳</span></div>
        <p>올린 업체 ${fmt.num(c.total)}곳 · 이메일 보유 ${fmt.num(c.withEmail)}곳${sample}</p></div>
      <div><h3>진행 중인 협업</h3><div class="number ptn-out-lime">${fmt.num(ov.active)} <span class="small">곳</span></div>
        <p>협의 ${fmt.num(b['협의 중'] || 0)} · 협업 ${fmt.num(b['협업 중'] || 0)} · 마케팅 ${fmt.num(b['마케팅 진행 중'] || 0)}</p>
        <div class="progress-track" role="img" aria-label="연락한 업체 중 진행 중 ${pct}%"><i style="width:${pct}%"></i></div></div>
      <div><h3>회신 받음</h3><div class="number">${fmt.num(ov.replied)} <span class="small">곳</span></div>
        <p>${rate} · 회신 대기 ${fmt.num(ov.awaiting)}건</p></div>
    </section>`;
  }

  /* 업체 파일 가져오기 (업체가 0곳일 때만 · 평소엔 파트너 목록의 업로드 · 다운로드 팝업을 씀) */
  function paintImport(st, empty, scroll) {
    const box = st.el.querySelector('[data-ref="import"]');
    if (!empty) { box.innerHTML = ''; return; }
    const im = st.data.imports || {};
    const file = s => String(s || '').replace(/ · [0-9a-f]{8}$/, '');   // 기본 파일 표시에서 내용 해시는 뺌
    const now = t => (im[t] && im[t].count ? `${fmt.num(im[t].count)}곳 · ${esc(file(im[t].file))} · ${esc(fmt.datetime(im[t].at))}` : '아직 없음');
    box.innerHTML = `<details class="card ptn-out-import${empty ? ' is-empty' : ''}"${empty || scroll ? ' open' : ''}>
      <summary class="card-head"><h2>${empty ? '업체 목록을 업로드해 주세요' : '업체 목록 업로드'}</h2>
        ${empty ? badge('업체 0곳', 'orange') : `<span class="small muted">케이터링 ${now('케이터링')} · 인플루언서 ${now('인플루언서')}</span>`}</summary>
      <p class="panel-note">기본 업체 파일은 따로 올리지 않아도 자동으로 불러와요. 케이터링 CSV와 인플루언서 XLSX·CSV를 직접 올리면 그 구분 목록만 새 파일로 바뀌고, 협업 기록은 그대로 남아요.</p>
      <div class="flex wrap mt-16">
        ${empty ? '<button type="button" class="btn soft" data-act="example">예시 데이터로 둘러보기</button>' : ''}
        ${ui.fileActions(
          ui.fileBtn('upload', { label: '업체 목록 업로드', type: 'CSV · XLSX', act: 'csv-open' }) +
          ui.fileBtn('download', { label: '케이터링 양식 다운로드', type: 'CSV', href: '/api/partners/template/catering.csv' }) +
          ui.fileBtn('download', { label: '인플루언서 양식 다운로드', type: 'XLSX', href: '/api/partners/template/influencer.xlsx' }))}
      </div>
      <p class="panel-note mt-8">공개된 업체 연락처만 올려요. 예시 데이터는 지어낸 업체(example.com)이고 화면에 '예시' 배지로 표시되며, 판매 실적에는 쓰이지 않아요.</p>
    </details>`;
    if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 업체 목록 › CSV 팝업: 지금 목록 내보내기 · CSV(또는 XLSX) 가져오기
     내보낸 파일에 줄을 추가해 다시 가져오면 그 구분 목록이 파일 내용으로 바뀜 (협업 이력은 그대로) */
  function csvModal(st) {
    const im = st.data.imports || {};
    const n = t => fmt.num((im[t] && im[t].count) || 0);
    const body = doc.createElement('div');
    body.className = 'part-partners ptn-csv';
    body.innerHTML = `
      <h3 class="ptn-csv-h">업로드 (추가 · 바꾸기)</h3>
      <p class="small muted">CSV 또는 XLSX를 고르면 머리글을 보고 케이터링 · 인플루언서를 알아서 구분해요.
        <b>그 구분의 목록이 파일 내용으로 바뀌니</b>, 업체를 추가하려면 아래에서 다운로드한 파일에 줄을 더해 업로드하세요. 협업 기록은 그대로 남아요.</p>
      <label class="dropzone ptn-out-drop mt-8">${icon('upload')}<span data-ref="csv-picked">파일을 눌러 고르세요</span>
        <input type="file" class="sr-only" accept=".csv,.xlsx" data-ref="csv-file" aria-label="업체 CSV · XLSX 고르기"></label>
      <h3 class="ptn-csv-h mt-24">다운로드</h3>
      <p class="small muted">지금 업체 목록을 업로드와 같은 형식의 CSV로 받아요. 엑셀에서 열어 줄을 추가 · 수정할 수 있어요.</p>
      ${ui.fileActions(
        ui.fileBtn('download', { label: `케이터링 업체 다운로드 (${n('케이터링')}곳)`, type: 'CSV', href: '/api/partners/export/catering.csv' }) +
        ui.fileBtn('download', { label: `인플루언서 업체 다운로드 (${n('인플루언서')}곳)`, type: 'CSV', href: '/api/partners/export/influencer.csv' }) +
        ui.fileBtn('download', { label: '케이터링 양식 다운로드', type: 'CSV', href: '/api/partners/template/catering.csv' }) +
        ui.fileBtn('download', { label: '인플루언서 양식 다운로드', type: 'XLSX', href: '/api/partners/template/influencer.xlsx' }))}`;
    let file = null;
    const ok = ui.modal({
      title: '업체 목록 업로드 · 다운로드 (CSV)', body,
      onOpen: b => b.querySelector('[data-ref="csv-file"]').addEventListener('change', e => {
        file = e.target.files && e.target.files[0];
        b.querySelector('[data-ref="csv-picked"]').textContent = file ? `선택: ${file.name} (${fmtBytes(file.size)})` : '파일을 눌러 고르세요';
      }),
      actions: [{ label: '닫기', value: false }, { label: '업로드', value: true, tone: 'lime', onClick: () => {
        if (!file) { toast('올릴 파일을 고르세요.', 'error'); return false; }
        return true;
      } }]
    });
    ok.then(async v => {
      if (v !== true || !file) return;
      const fd = new FormData();
      fd.append('file', file, file.name);
      try {
        const out = await REBOOT.upload('/api/partners/import', fd);
        const warns = [];
        out.results.forEach(r => (r.warnings || []).forEach(w => warns.push(`${r.type}: ${w}`)));
        importNote = `<p class="note lime mb-16">파일을 올렸어요 — ${out.results.map(r => `${esc(r.type)} ${fmt.num(r.count)}곳 (이메일 ${fmt.num(r.withEmail)}곳, ${esc(r.file)})`).join(' · ')}</p>` +
          (warns.length ? `<p class="note warn mb-16">${warns.map(esc).join('<br>')}</p>` : '');
        toast('업체 파일을 올렸어요.');
        contactsP = null;
        if (st.el.isConnected) renderContacts(fresh(st.el));
      } catch (e) {
        toast(`업체 파일을 올리지 못했어요: ${e.message}`, 'error');
      }
    });
  }

  async function loadExample(st, btn) {
    ui.busy(btn, true);
    try {
      const out = await REBOOT.api('/api/partners/example', {});
      importNote = `<p class="note lime mb-16">예시 데이터(지어낸 업체 · example.com)를 불러왔어요${out.samples ? ` — 협업 기록 예시 ${out.samples}건 포함` : ''}. 실제 파일을 올리면 같은 구분의 예시는 바뀌어요.</p>`;
      contactsP = null;
      refreshSummary();
      if (st.el.isConnected) renderContacts(fresh(st.el));   // 새 요소로 (이벤트 중복 방지)
    } catch (e) {
      toast(`예시 데이터를 불러오지 못했어요: ${e.message}`, 'error');
      ui.busy(btn, false);
    }
  }

  function paintMain(st) {
    const f = st.f;
    if (f.view === 'board') f.view = 'list';   // 협업 보드는 협업 관리 메뉴로 옮김 (2026-10-26)
    st.el.querySelector('[data-ref="main"]').innerHTML = `
      <div class="filters ptn-out-bar">
        <div class="flex wrap">
          <span class="ptn-out-count" data-ref="count" aria-live="polite"></span>
        </div>
      </div>
      <div data-ref="body"></div>`;
    paintBody(st);
  }

  function paintBody(st) {
    const body = st.el.querySelector('[data-ref="body"]');
    if (st.f.view !== 'board' && st.f.yt) {
      paintYoutube(st);
      return;
    }
    if (st.f.view === 'board') {
      body.innerHTML = '<div></div>';
      paintCount(st);
      try {
        REBOOT.use('partners.records').board(body.firstChild, {
          onPick: id => {
            if (!st.data.items.some(c => c.id === id)) { toast('업체 목록에 없는 업체예요 (직접 입력했거나 다시 올린 파일에 없음).'); return; }
            Object.assign(st.f, { view: 'list', selected: id, types: [], tags: [], q: '' });
            saveFilters(st.f);
            paintMain(st);
          }
        });
      } catch (e) {
        body.innerHTML = ui.empty('협업 보드를 불러오지 못했어요. 새로고침해 주세요.', 'grid');
      }
      return;
    }
    // 시장·고객 인사이트 › 경쟁사 비교와 같은 짜임: 제목 줄(제목 · 개수 / 버튼) → 한 줄 필터 바 → 한 줄 행 표 → 페이지
    body.innerHTML = `<div class="workbench ptn-out-bench">
      <section class="card ptn-out-listcard ptn-cf-card">
        <div class="card-head wrap"><div class="ptn-head-title"><h2>파트너 목록</h2><span data-ref="total"></span></div>
          ${ui.fileActions(ui.fileBtn('upload', { label: '업체 목록 업로드 · 다운로드', type: 'CSV', act: 'csv-open' }))}</div>
        <div data-ref="bar"></div>
        <div data-ref="rows"></div>
        <p class="panel-note mt-8" data-ref="foot"></p>
      </section>
      <aside class="ptn-out-detail" data-ref="detail" aria-live="polite" aria-label="업체 상세"></aside>
    </div>`;
    paintFilters(st);
    paintRows(st);
    paintDetail(st);
  }

  function tagMeta(st) {
    const out = {};
    const subs = st.data.subcategories || {};
    Object.keys(subs).forEach(t => (subs[t] || []).forEach(s => { out[s.key] = s; }));
    return out;
  }

  // 정렬 기준: key → [이름, 기본 방향(1 = 오름차순 · -1 = 내림차순)] — 머리글을 다시 누르면 방향이 바뀜
  const CONTACT_SORTS = { file: ['기본 순서', 1], name: ['업체', 1], type: ['구분', 1], tag: ['세부 카테고리', 1], email: ['이메일', 1] };
  function contactKey(st, k) {
    const meta = tagMeta(st);
    return {
      name: c => c.name.toLowerCase(), type: c => c.type,
      tag: c => (c.tags[0] && meta[c.tags[0]] ? meta[c.tags[0]].label : null), email: c => (c.email ? c.email.toLowerCase() : null)
    }[k];
  }
  // 값 없는 행은 방향과 관계없이 늘 아래 · 글자는 가나다/ABC, 숫자는 크기로
  function sortList(list, getter, dir) {
    return list.sort((a, b) => {
      const x = getter(a), y = getter(b);
      const ex = x == null || x === '', ey = y == null || y === '';
      if (ex || ey) return ex && ey ? 0 : ex ? 1 : -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
  }
  function sortState(f, yt) {
    const sorts = yt ? YT_SORTS : CONTACT_SORTS;
    const k = (yt ? f.ytSort : f.sort) in sorts ? (yt ? f.ytSort : f.sort) : (yt ? 'subscribers' : 'file');
    const d = Number(yt ? f.ytDir : f.dir);
    return { k, dir: d === 1 || d === -1 ? d : sorts[k][1] };
  }
  function filtered(st, ignoreTags) {
    const f = st.f;
    const q = String(f.q || '').trim().toLowerCase();
    const list = st.data.items.filter(c => (!f.types.length || f.types.includes(c.type)) &&
      (ignoreTags || !f.tags.length || c.tags.some(t => f.tags.includes(t))) && (!f.hasEmail || c.email) &&
      (!q || [c.name, c.location, c.category, c.email].join(' ').toLowerCase().includes(q)));
    const { k, dir } = sortState(f, false);
    if (k === 'file') return dir < 0 ? list.reverse() : list;
    return sortList(list, contactKey(st, k), dir);
  }

  /* ───────── 한 줄 필터 바 · 정렬 머리글 · 페이지 (시장·고객 인사이트 › 경쟁사 비교와 같은 모양) ───────── */
  const PAGE = 5, SLOTS = 5;   // 한 화면 줄 수: 유튜브 크리에이터 5 · 업체 목록은 최소 5 (fitRows가 상세 박스 높이만큼 늘림)
  function cfSelect(key, all, opts, cur) {
    return `<select class="ptn-cf${cur ? ' on' : ''}" data-cf="${key}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>${opts.map(([v, l]) =>
      `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  function cfToggle(key, label, on) {
    return `<button type="button" class="ptn-cf${on ? ' on' : ''}" data-act="cf-tog" data-k="${key}" aria-pressed="${!!on}">${esc(label)}</button>`;
  }
  // 정렬 상자: 칸마다 오름차순 ↑ · 내림차순 ↓ 두 가지 (값 'key|방향')
  function cfSort(sorts, s) {
    return `<select class="ptn-cf sort" data-cf="sort" aria-label="정렬">${Object.keys(sorts).flatMap(k => [1, -1].map(d =>
      `<option value="${k}|${d}"${s.k === k && s.dir === d ? ' selected' : ''}>정렬: ${esc(sorts[k][0])} ${d > 0 ? '↑ 오름차순' : '↓ 내림차순'}</option>`)).join('')}</select>`;
  }
  // 구분: 케이터링 · 인플루언서 · 유튜브 크리에이터 (고르면 아래 표가 크리에이터 추천으로 바뀜)
  function typeSelect(st) {
    const items = st.data.items;
    const opts = TYPES.map(t => [t, `${D.typeIcon[t]} ${t} (${fmt.num(items.filter(c => c.type === t).length)})`])
      .concat([['yt', `유튜브 크리에이터${st.yt ? ` (${fmt.num(st.yt.items.length)})` : ''}`]]);
    return cfSelect('type', '구분 전체', opts, st.f.yt ? 'yt' : (st.f.types[0] || ''));
  }
  function cfBar(parts, any, sortHtml) {
    return `<div class="ptn-cf-bar"><span class="ptn-cf-icon" aria-hidden="true">${icon('filter')}</span>${parts.join('')}
      ${any ? '<button type="button" class="ptn-link" data-act="reset-filters">필터 지우기</button>' : ''}<span class="ptn-cf-gap"></span>${sortHtml}</div>`;
  }
  // 정렬되는 머리글: 누르면 그 기준으로 정렬, 지금 기준은 라임 세모
  function sortTh(label, k, s, cls) {
    const on = s.k === k;
    return `<th scope="col" class="${cls || ''}${on ? ' sorted' : ''}"${on ? ` aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" class="ptn-th-sort" data-act="cf-sort" data-k="${k}" title="누를 때마다 오름차순 ↔ 내림차순">${esc(label)}<i aria-hidden="true">${on ? (s.dir > 0 ? '▲' : '▼') : '↕'}</i></button></th>`;
  }
  // 페이지 버튼: 칸 수(SLOTS) 고정, 1–5 · 6–10 묶음 — 없는 페이지 칸은 흐리게
  function pager(cur, pages, total, from, to, unit) {
    const first = Math.floor((cur - 1) / SLOTS) * SLOTS + 1;
    const btn = (p, label, extra) => `<button type="button" class="ptn-pg${p === cur && !extra ? ' on' : ''}" data-act="cf-page" data-p="${p}"${p < 1 || p > pages || (p === cur && !extra) ? ' disabled' : ''}${p === cur && !extra ? ' aria-current="page"' : ''}${extra ? ` aria-label="${extra}"` : ''}>${label}</button>`;
    return `<div class="ptn-pg-row"><span class="small muted">${total ? `${fmt.num(total)}${unit} 중 ${fmt.num(from)}–${fmt.num(to)}` : `0${unit}`}</span>
      <nav class="ptn-pg-nav" aria-label="표 페이지">${btn(cur - 1, '‹', '이전 페이지')}${Array.from({ length: SLOTS }, (_, k) => first + k).map(p => btn(p, p)).join('')}${btn(cur + 1, '›', '다음 페이지')}</nav></div>`;
  }
  function pageOf(list, page, size) {
    size = size || PAGE;
    const pages = Math.max(1, Math.ceil(list.length / size));
    const cur = Math.min(Math.max(1, page || 1), pages);
    return { cur, pages, shown: list.slice((cur - 1) * size, cur * size), from: (cur - 1) * size + 1 };
  }
  // 업체 목록 줄 수: 목록 카드가 오른쪽 상세 박스 높이(최대 화면 높이)를 넘지 않을 만큼 채움 — 상세를 다시 그릴 때마다 맞춤
  function fitRows(st) {
    const box = st.el.querySelector('[data-ref="detail"]');
    const card = box && box.parentElement.querySelector('.ptn-out-listcard');
    const body = card && card.querySelector('[data-ref="rows"] tbody');
    const row = body && body.querySelector('tr');
    if (!row) return;
    const cs = getComputedStyle(box);
    const n = cs.position === 'sticky'   // 좁은 화면(한 줄 배치)은 기본 줄 수
      ? Math.max(PAGE, Math.floor((box.offsetHeight - (card.offsetHeight - body.offsetHeight)) / row.offsetHeight) || PAGE)
      : PAGE;
    if (n !== (st.rowsN || PAGE)) { st.rowsN = n; paintRows(st); }
  }
  let fitSt = null, fitTimer = 0;
  global.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { if (fitSt && fitSt.el.isConnected) fitRows(fitSt); }, 150);
  });

  function paintFilters(st) {
    const f = st.f;
    const subs = st.data.subcategories || {};
    const meta = tagMeta(st);
    const base = filtered(st, true);
    const tagOpts = (f.types.length ? f.types : TYPES).flatMap(t => (subs[t] || []).map(s =>
      [s.key, `${s.emoji} ${s.label} (${fmt.num(base.filter(c => c.tags.includes(s.key)).length)})`]));
    const any = f.types.length || f.tags.length || f.hasEmail || f.q;
    st.el.querySelector('[data-ref="bar"]').innerHTML = cfBar([
      `<label class="search ptn-cf-q">${icon('search')}<input class="input" type="search" data-ref="q" placeholder="이름, 분야, 지역으로 검색" aria-label="파트너 검색 (이름 · 지역 · 분야 · 이메일)" value="${esc(f.q)}"></label>`,
      typeSelect(st), cfSelect('tag', '세부 카테고리', tagOpts, f.tags[0] && meta[f.tags[0]] ? f.tags[0] : ''),
      cfToggle('hasEmail', '이메일 있는 것만', f.hasEmail)
    ], any, cfSort(CONTACT_SORTS, sortState(f, false)));
    st.el.querySelector('[data-ref="total"]').innerHTML = badge(`${fmt.num(st.data.items.length)}곳`);
  }

  function paintRows(st) {
    const list = filtered(st);
    const subs = tagMeta(st);
    const size = st.rowsN || PAGE;
    const p = pageOf(list, st.page, size);
    st.page = p.cur;
    const ss = sortState(st.f, false);
    const pad = p.pages > 1 ? '<tr class="ptn-pad" aria-hidden="true"><td colspan="4"></td></tr>'.repeat(size - p.shown.length) : '';   // 마지막 페이지도 표 높이 그대로
    st.el.querySelector('[data-ref="rows"]').innerHTML = list.length ? `<div class="table-wrap"><table class="data-table ptn-cf-table">
      <thead><tr>${sortTh('업체', 'name', ss)}${sortTh('구분', 'type', ss)}${sortTh('세부 카테고리', 'tag', ss)}${sortTh('이메일', 'email', ss)}</tr></thead>
      <tbody>${p.shown.map(c => `
      <tr class="clickable${c.id === st.f.selected ? ' selected' : ''}" data-id="${esc(c.id)}" tabindex="0" aria-label="${esc(c.name)} 상세 보기">
        <td><div class="ptn-1l">${contactAvatar(c)}
          <b class="ptn-1l-name" title="${esc(c.name)} · ${esc(c.location || '지역 정보 없음')}">${esc(c.name)}</b>${c.example ? badge('예시', 'orange') : ''}</div></td>
        <td>${typeBadge(c.type)}</td>
        <td><div class="ptn-1l">${c.tags.map(k => (subs[k] ? `<span class="ptn-out-tag">${esc(subs[k].emoji)} ${esc(subs[k].label)}</span>` : '')).join('') || '<span class="faint">—</span>'}</div></td>
        <td><div class="ptn-1l">${c.email ? `<button type="button" class="link ptn-out-emailbtn" data-act="compose" data-id="${esc(c.id)}" title="이 주소로 제안 작성">${icon('mail')}${esc(c.email)}</button>` : '<span class="faint">없음</span>'}</div></td>
      </tr>`).join('')}${pad}</tbody></table></div>${pager(p.cur, p.pages, list.length, p.from, p.from + p.shown.length - 1, '곳')}`
      : `<div class="mt-16">${ui.empty('조건에 맞는 업체가 없어요. 검색어나 필터를 바꿔 보세요.', 'search')}</div>`;
    logoFallback(st.el.querySelector('[data-ref="rows"]'));
    st.el.querySelector('[data-ref="foot"]').textContent = '행을 누르면 오른쪽에 업체 카드가 열려요. 이메일을 누르면 제안 작성으로 이동하고 수신자가 자동으로 들어가요. 로고는 공식 사이트 아이콘이고, 예시 업체는 지어낸 로고예요.';
    paintCount(st, list);
    fitSt = st;
    fitRows(st);
  }

  function paintCount(st, list) {
    const el = st.el.querySelector('[data-ref="count"]');
    if (!el) return;
    list = list || filtered(st);
    el.innerHTML = `업체 <b>${fmt.num(list.length)}</b>곳 · 이메일 보유 <b>${fmt.num(list.filter(c => c.email).length)}</b>곳`;
  }

  async function paintDetail(st) {
    const box = st.el.querySelector('[data-ref="detail"]');
    if (!box) return;
    const c = st.data.items.find(x => x.id === st.f.selected);
    if (!c) {
      box.innerHTML = `<div class="ptn-out-detail-empty">${ui.empty('목록에서 파트너를 고르면 다음 할 일과 최근 활동이 여기에 보여요.', 'users')}</div>`;
      return;
    }
    const subs = tagMeta(st);
    const url = safeUrl(c.url);
    box.innerHTML = `
      <div class="between">${contactAvatar(c, true)}${typeBadge(c.type)}</div>
      <h2 class="ptn-out-dname">${esc(c.name)}</h2>
      <p class="small muted">${esc(c.location || '지역 정보 없음')} · ${esc(c.id)}${c.example ? ' · 예시 업체' : ''}</p>
      <div class="ptn-out-stats" data-ref="dstats">
        <div><strong>—</strong><small>협업 기록</small></div><div><strong class="is-text">—</strong><small>진행 상태</small></div><div><strong class="is-text">—</strong><small>최근 메일</small></div>
      </div>
      <div class="ptn-out-info">
        ${ui.row('이메일', c.email ? `<button type="button" class="link" data-act="compose" data-id="${esc(c.id)}">${esc(c.email)}</button>` : '<span class="faint">없음</span>')}
        ${ui.row('전화', c.phone ? esc(c.phone) : '<span class="faint">없음</span>')}
        ${ui.row('URL', url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(url))} ${icon('up')}</a>` : (c.url ? esc(c.url) : '<span class="faint">없음</span>'))}
      </div>
      ${c.category ? `<div class="ptn-out-block"><h3>카테고리</h3><p>${esc(c.category)}</p>${c.tags.length ? `<div class="ptn-out-tags mt-8">${c.tags.map(k => (subs[k] ? `<span class="ptn-out-tag">${esc(subs[k].emoji)} ${esc(subs[k].label)}</span>` : '')).join('')}</div>` : ''}</div>` : ''}
      ${c.note ? `<div class="ptn-out-block"><h3>비고</h3><p>${esc(c.note)}</p></div>` : ''}
      <div class="ptn-out-block"><h3>최근 활동</h3><div data-ref="dhist"><div class="skeleton ptn-skel-sm"></div></div></div>
      <button type="button" class="btn dark block mt-16" data-act="compose" data-id="${esc(c.id)}">제안 작성 ↗</button>
      ${c.email ? '' : '<p class="panel-note mt-8">이메일이 없는 업체예요. 메일 화면에서 수신자를 직접 넣거나, 전화·미팅은 협업 기록에 직접 남기세요.</p>'}`;
    logoFallback(box);
    fitRows(st);
    try {
      const h = await REBOOT.api('/api/partners/history?partner_id=' + encodeURIComponent(c.id));
      if (!box.isConnected || st.f.selected !== c.id) return;
      const items = h.items || [];
      const last = items[0];
      const lastMail = items.find(x => x.mailStatus);
      box.querySelector('[data-ref="dstats"]').innerHTML = `
        <div><strong>${fmt.num(items.length)}</strong><small>협업 기록</small></div>
        <div><strong class="is-text">${last ? `${PROG[last.progress] ? PROG[last.progress].emoji + ' ' : ''}${esc(last.progress)}` : '—'}</strong><small>진행 상태</small></div>
        <div><strong class="is-text">${lastMail ? esc(lastMail.mailStatus) : '—'}</strong><small>최근 메일</small></div>`;
      box.querySelector('[data-ref="dhist"]').innerHTML = items.length ? `<ul class="activity">${items.slice(0, 5).map(x => `
          <li><b>${esc(x.activity || '기록')}</b> ${mailBadge(x.mailStatus)} ${progressBadge(x.progress)}${x.kind === '샘플' ? ' ' + badge('예시', 'orange') : ''}
            <small>${esc(fmt.datetime(x.at))} · ${esc(x.owner || '—')}${x.subject ? ' · ' + esc(x.subject) : ''}</small></li>`).join('')}</ul>
          <button type="button" class="link mt-8" data-act="goto-history" data-id="${esc(c.id)}">협업 관리에서 ${fmt.num(items.length)}건 모두 보기 ${icon('arrow')}</button>`
        : '<p class="small muted">아직 기록이 없어요.</p>';
    } catch (e) {
      if (box.isConnected) box.querySelector('[data-ref="dhist"]').innerHTML = `<p class="small muted">협업 기록을 불러오지 못했어요. ${esc(e.message)}</p>`;
    }
    if (box.isConnected && st.f.selected === c.id) fitRows(st);
  }

  /* ───────── 유튜브 크리에이터 추천 (서버 youtube.py — 소개란 공개 이메일만, 30일 안에 갱신 · 못 하면 삭제) ───────── */
  const YT_SORTS = {
    name: ['크리에이터', 1], subscribers: ['구독자', -1], avgViews: ['평균 조회수', -1], engage: ['조회수÷구독자', -1],
    email: ['이메일', 1], kw: ['매칭 키워드', 1], statsAt: ['기준일', -1]
  };
  function ytEngage(c) { return c.subscribers && c.avgViews != null ? c.avgViews / c.subscribers : null; }
  const YT_KEY = {
    name: c => String(c.title || '').toLowerCase(), subscribers: c => c.subscribers, avgViews: c => c.avgViews, engage: ytEngage,
    email: c => (c.email ? c.email.toLowerCase() : null), kw: c => ((c.keywords || [])[0] || null), statsAt: c => c.statsAt || null
  };
  function ytSorted(st) {
    const { k, dir } = sortState(st.f, true);
    // 키워드 · 대상을 고르면 그 크리에이터만 (검색: 이름 · 핸들 · 이메일)
    const pick = Array.isArray(st.f.ytTags) ? st.f.ytTags : [];
    const tg = Array.isArray(st.f.ytTargets) ? st.f.ytTargets : [];
    const q = String(st.f.ytQ || '').trim().toLowerCase();
    return sortList(st.yt.items.filter(c => (!pick.length || (c.keywords || []).some(w => pick.includes(w))) &&
      (!tg.length || tg.includes(c.target)) && (!st.f.ytEmail || c.email) &&
      (!q || [c.title, c.handle, c.email].join(' ').toLowerCase().includes(q))), YT_KEY[k], dir);
  }
  // 대상 선택지 (미국 · 영미권 · 미국 타겟 추정)
  function ytTargetOpts(st) {
    return Object.keys(D.ytTargets).map(k => [k, `${D.ytTargets[k].label} (${fmt.num(st.yt.items.filter(c => c.target === k).length)})`]);
  }
  function ytTargetBadge(c) {
    const t = D.ytTargets[c.target];
    if (!t) return c.country ? esc(c.country) : '';
    return c.target === 'EST' ? `<span title="${esc(t.help)}">${badge('국가 미표시 · 영어', t.tone)}</span>` : badge(`${c.target === 'US' ? '' : ''} ${c.country}`, t.tone);
  }
  // 키워드 선택지: 검색 키워드 + 저장된 크리에이터에 붙은 키워드 (예전 키워드로 찾은 채널도 거를 수 있게)
  function ytKwOpts(st) {
    const all = [];
    ytKeywords(st).concat(...st.yt.items.map(c => c.keywords || [])).forEach(k => { if (!all.includes(k)) all.push(k); });
    return all.map(k => [k, `${k} (${fmt.num(st.yt.items.filter(c => (c.keywords || []).includes(k)).length)})`]);
  }
  function ytKeywords(st) {
    return Array.isArray(st.f.ytKw) && st.f.ytKw.length ? st.f.ytKw : (st.yt ? st.yt.keywords : []);
  }
  function ytDate(iso) { return iso ? fmt.date(iso) : '—'; }

  async function paintYoutube(st, note) {
    const body = st.el.querySelector('[data-ref="body"]');
    // 업체 목록 · 경쟁사 비교와 같은 짜임: 제목 줄(제목 · 개수 / 버튼) → 한 줄 필터 바 → 표 → 페이지
    body.innerHTML = `<section class="card ptn-out-listcard ptn-cf-card ptn-yt">
      <div class="card-head wrap"><div class="ptn-head-title"><h2>유튜브 크리에이터</h2><span data-ref="total"></span></div><div class="flex wrap" data-ref="yt-tools"></div></div>
      <div data-ref="yt"><div class="skeleton ptn-skel"></div></div>
    </section>`;
    st.ytSel = st.ytSel || new Set();
    try {
      st.yt = await REBOOT.api('/api/partners/youtube');
    } catch (e) {
      const box = st.el.querySelector('[data-ref="yt"]');
      if (box) box.innerHTML = `<p class="note error">유튜브 크리에이터를 불러오지 못했어요. ${esc(e.message)}</p>`;
      return;
    }
    if (!st.el.isConnected || !st.f.yt) return;
    const msgs = [];
    if (note) msgs.push(note);
    if (st.yt.refreshed) msgs.push(`오래된 값 ${fmt.num(st.yt.refreshed)}개를 다시 받았어요.`);
    if (st.yt.removed) msgs.push(`보관 기간(${st.yt.maxDays}일)이 지난 ${fmt.num(st.yt.removed)}개를 삭제했어요.`);
    st.ytNote = msgs.join(' ') + (st.yt.warning ? `<!--w-->${st.yt.warning}` : '');
    paintYtTable(st);
  }

  function paintYtTable(st) {
    const box = st.el.querySelector('[data-ref="yt"]');
    if (!box || !st.yt) return;
    const d = st.yt;
    const ids = new Set(d.items.map(c => c.id));
    st.ytSel.forEach(id => { if (!ids.has(id)) st.ytSel.delete(id); });
    const [note, warn] = String(st.ytNote || '').split('<!--w-->');
    const kws = ytKeywords(st);
    const f = st.f;
    const tools = st.el.querySelector('[data-ref="yt-tools"]');
    if (tools) tools.innerHTML = `
      <button type="button" class="btn small" data-act="yt-kw" title="추천 받기에 쓸 검색 키워드: ${esc(kws.join(', '))}">${icon('edit')}검색 키워드 · 추천</button>
      <button type="button" class="btn small dark" data-act="yt-search"${d.ready ? '' : ' disabled title="설정 › 연결에서 YouTube 키를 넣어 주세요"'}>${icon('search')}추천 받기</button>
      <button type="button" class="btn small ghost" data-act="yt-delete" disabled>선택 삭제</button>
      <details class="ptn-export"><summary class="btn small file-btn">${icon('upload')}크리에이터 목록 업로드 · 다운로드 <span class="tiny muted">CSV</span></summary>
        <div class="ptn-export-menu"><button type="button" data-act="yt-upload">${icon('upload')} 업로드</button>
          <a href="/api/partners/youtube/export.csv" download>${icon('download')} 다운로드</a></div></details>`;
    const total = st.el.querySelector('[data-ref="total"]');
    if (total) total.innerHTML = badge(`${fmt.num(d.items.length)}명`);
    const tgCur = Array.isArray(f.ytTargets) && f.ytTargets[0] ? f.ytTargets[0] : '';
    const kwCur = Array.isArray(f.ytTags) && f.ytTags[0] ? f.ytTags[0] : '';
    const any = tgCur || kwCur || f.ytEmail || f.ytQ;
    const bar = cfBar([
      `<label class="search ptn-cf-q">${icon('search')}<input class="input" type="search" data-ref="ytq" placeholder="크리에이터 검색" aria-label="크리에이터 검색 (이름 · 핸들 · 이메일)" value="${esc(f.ytQ || '')}"></label>`,
      typeSelect(st), cfSelect('kw', '키워드 전체', ytKwOpts(st), kwCur), cfSelect('target', '대상 전체', ytTargetOpts(st), tgCur),
      cfToggle('ytEmail', '이메일 공개만', f.ytEmail)
    ], any, cfSort(YT_SORTS, sortState(f, true)));
    box.innerHTML = `
      ${d.ready ? '' : `<p class="note warn mb-16">YouTube 키가 없어 새로 추천 받을 수 없어요. ${settingsLink}에서 YouTube 키를 넣어 주세요. (CSV 업로드는 돼요)</p>`}
      ${note ? `<p class="note lime mb-16">${esc(note)}</p>` : ''}${warn ? `<p class="note warn mb-16">${esc(warn)}</p>` : ''}
      ${bar}<div data-ref="yt-rows"></div>
      <p class="panel-note mt-8">유튜브 공개 정보예요. 이메일은 크리에이터가 채널 소개란에 직접 공개한 주소만 가져오고, 숨겨진 비즈니스 이메일은 가져오지 않아요.
        구독자·조회수는 기준일 값이고 ${d.staleDays}일이 지나면 다시 받으며, ${d.maxDays}일 안에 다시 받지 못하면 삭제해요 (YouTube API 정책).
        크리에이터가 삭제를 요청하면 체크 후 선택 삭제를 누르세요. CSV는 팀 노션에만 공유하고 ${d.maxDays}일이 지나면 삭제해 주세요.</p>`;
    paintYtRows(st);
  }

  // 표 · 페이지만 다시 그림 (검색창은 그대로 두어 입력 중 글자가 끊기지 않게)
  function paintYtRows(st) {
    const box = st.el.querySelector('[data-ref="yt-rows"]');
    if (!box || !st.yt) return;
    const d = st.yt;
    const list = ytSorted(st);
    const cnt = st.el.querySelector('[data-ref="count"]');
    if (cnt) cnt.innerHTML = `크리에이터 <b>${fmt.num(list.length)}</b>명 · 이메일 공개 <b>${fmt.num(list.filter(c => c.email).length)}</b>명`;
    if (!list.length) {
      box.innerHTML = `<div class="mt-16">${ui.empty(!d.items.length ? (d.ready ? '아직 추천 받은 크리에이터가 없어요. 추천 받기를 눌러 시작하세요.' : '아직 크리에이터가 없어요.') : '조건에 맞는 크리에이터가 없어요. 검색어나 필터를 바꿔 보세요.', 'search')}</div>`;
      ytSelState(st);
      return;
    }
    const p = pageOf(list, st.ytPage);
    st.ytPage = p.cur;
    const sk = sortState(st.f, true);
    const pad = p.pages > 1 ? '<tr class="ptn-pad" aria-hidden="true"><td colspan="8"></td></tr>'.repeat(PAGE - p.shown.length) : '';
    box.innerHTML = `<div class="table-wrap"><table class="data-table ptn-cf-table ptn-yt-table">
      <thead><tr><th class="ptn-rec-chk"><input type="checkbox" data-yt-all aria-label="조건에 맞는 ${fmt.num(list.length)}명 모두 선택"${list.every(c => st.ytSel.has(c.id)) ? ' checked' : ''}></th>
        ${sortTh('크리에이터', 'name', sk)}${sortTh('구독자', 'subscribers', sk, 'num')}${sortTh('평균 조회수', 'avgViews', sk, 'num')}
        ${sortTh('조회수÷구독자', 'engage', sk, 'num')}${sortTh('이메일', 'email', sk)}${sortTh('매칭 키워드', 'kw', sk)}${sortTh('기준일', 'statsAt', sk)}</tr></thead>
      <tbody>${p.shown.map(c => ytRow(st, c)).join('')}${pad}</tbody></table></div>
      ${pager(p.cur, p.pages, list.length, p.from, p.from + p.shown.length - 1, '명')}`;
    ytImgFallback(st);
    ytSelState(st);
  }

  function ytRow(st, c) {
    const url = safeUrl(c.url);
    const eng = ytEngage(c);
    const old = c.statsAt && (Date.now() - new Date(c.statsAt).getTime()) / 86400000 > st.yt.staleDays;
    return `<tr${st.ytSel.has(c.id) ? ' class="selected"' : ''}>
      <td class="ptn-rec-chk"><input type="checkbox" data-yt-sel="${esc(c.id)}"${st.ytSel.has(c.id) ? ' checked' : ''} aria-label="${esc(c.title)} 선택"></td>
      <td><div class="flex ptn-out-who">${ytAvatar(c)}
        <div class="ptn-out-name">${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(c.title || c.id)}</a>` : esc(c.title || c.id)}
          <small>${esc(c.handle || '')}${c.videos != null ? ' · 영상 ' + fmt.num(c.videos) + '개' : ''}</small><span class="ptn-yt-target">${ytTargetBadge(c)}</span></div></div></td>
      <td class="num">${c.subscribers != null ? fmt.num(c.subscribers) : '<span class="faint">비공개</span>'}</td>
      <td class="num">${c.avgViews != null ? fmt.num(c.avgViews) : '—'}</td>
      <td class="num">${eng >= 0 ? fmt.pct(eng * 100, 1) : '—'}</td>
      <td>${c.email ? `<button type="button" class="link ptn-out-emailbtn" data-act="yt-compose" data-id="${esc(c.id)}" title="이 주소로 제안 작성">${icon('mail')}${esc(c.email)}</button><small class="ptn-yt-sub2">가져온 날짜 ${esc(ytDate(c.emailAt))}</small>`
        : `<span class="faint">공개 안 함</span>${url ? `<small class="ptn-yt-sub2"><a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">채널에서 확인 ↗</a></small>` : ''}`}</td>
      <td><div class="ptn-out-tags">${(c.keywords || []).map(k => `<span class="ptn-out-tag">${esc(k)}</span>`).join('') || '<span class="faint">—</span>'}</div></td>
      <td class="nowrap">${esc(ytDate(c.statsAt))}${old ? ' ' + badge('갱신 필요', 'orange') : ''}</td>
    </tr>`;
  }

  // 프로필 사진 (유튜브 이미지 서버 주소만 허용) · 없거나 못 불러오면 이니셜
  const YT_IMG_HOST = /^https:\/\/([a-z0-9-]+\.)*(ggpht\.com|ytimg\.com|googleusercontent\.com)\//i;
  function ytInitial(c) {
    return `<span class="initial ptn-av${avIndex(c.id)}" aria-hidden="true">${esc(initials(c.title))}</span>`;
  }
  function ytAvatar(c) {
    return YT_IMG_HOST.test(c.thumb || '')
      ? `<img class="ptn-yt-av" src="${esc(c.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-yt-img="${esc(c.id)}">`
      : ytInitial(c);
  }
  function ytImgFallback(st) {
    st.el.querySelectorAll('img[data-yt-img]').forEach(img => img.addEventListener('error', () => {
      const c = st.yt.items.find(x => x.id === img.dataset.ytImg);
      if (c) img.outerHTML = ytInitial(c);
    }, { once: true }));
  }

  function ytSelState(st) {
    const btn = st.el.querySelector('[data-act="yt-delete"]');
    if (btn) {
      btn.disabled = !st.ytSel.size;
      btn.textContent = st.ytSel.size ? `선택 삭제 (${st.ytSel.size})` : '선택 삭제';
    }
    st.el.querySelectorAll('[data-yt-sel]').forEach(c => c.closest('tr').classList.toggle('selected', c.checked));
  }

  async function ytAction(st, a, btn) {
    if (a === 'yt-compose') {
      const c = st.yt && st.yt.items.find(x => x.id === btn.dataset.id);
      // 협업 이력의 업체 번호(20자)에 채널 id가 들어가지 않으므로 이름으로 기록됨
      if (c) compose({ id: '', type: '인플루언서', name: c.title, email: c.email });
    } else if (a === 'yt-upload') {
      const menu = btn.closest('details');
      if (menu) menu.open = false;
      const got = await ui.uploadModal({
        title: '유튜브 크리에이터 목록 업로드', type: 'CSV', accept: '.csv,text/csv',
        help: '<p>다운로드한 크리에이터 목록에 줄을 더하거나 고쳐서 올려요. 기준일이 30일 넘은 값 · 형식이 틀린 줄은 건너뛰어요.</p>'
      });
      if (got) ytImport(st, got.files[0]);
    } else if (a === 'yt-kw') {
      let text = null;
      const ok = await ui.modal({
        title: '검색 키워드 편집',
        wide: true,
        body: `<div class="part-partners">
          <label class="field"><span>쉼표로 구분 · 최대 8개 (키워드 하나에 약 100 units, 하루 10,000 units)</span>
            <input class="input" data-yt-kwinput value="${esc(ytKeywords(st).join(', '))}" maxlength="500"></label>
          <p class="small muted mt-16">누르면 위 칸에 추가돼요.</p>
          ${D.ytSuggest.map(g => `<div class="ptn-yt-sgroup"><span class="ptn-out-flabel">${esc(g.label)}</span><div class="chips">${g.items.map(k => `<button type="button" class="chip" data-kwadd="${esc(k)}">＋ ${esc(k)}</button>`).join('')}</div></div>`).join('')}
          <div class="ptn-yt-sgroup"><span class="ptn-out-flabel">AI 관련 키워드</span>
            <div data-kwai><button type="button" class="btn small soft" data-kwai-go>지금 키워드로 관련 키워드 추천 받기</button></div></div>
        </div>`,
        onOpen: b => ytKwModal(st, b),
        actions: [{ label: '취소', value: false }, { label: '저장', value: true, tone: 'lime', onClick: b => { text = b.querySelector('[data-yt-kwinput]').value; } }]
      });
      if (ok !== true || text == null) return;
      st.f.ytKw = String(text).split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
      saveFilters(st.f);
      paintYtTable(st);
    } else if (a === 'yt-search') {
      const kws = ytKeywords(st);
      ui.busy(btn, true);
      try {
        const out = await REBOOT.api('/api/partners/youtube/search', { keywords: kws });
        toast(`채널 ${out.found}개를 찾았어요 (새로 ${out.added}개).`);
        paintYoutube(st, `키워드 ${out.keywords.length}개로 채널 ${fmt.num(out.found)}개를 찾았어요 (새로 ${fmt.num(out.added)}개).`);
      } catch (e) {
        toast(`크리에이터를 추천 받지 못했어요: ${e.message}`, 'error');
        ui.busy(btn, false);
      }
    } else if (a === 'yt-delete') {
      const ids = Array.from(st.ytSel);
      if (!ids.length) return;
      const ok = await ui.confirm(`선택한 크리에이터 ${ids.length}명의 정보(이메일 포함)를 삭제할까요? 되돌릴 수 없어요.`, { title: '삭제 확인', ok: '삭제', danger: true });
      if (!ok) return;
      try {
        const out = await REBOOT.api('/api/partners/youtube/delete', { ids });
        st.ytSel.clear();
        toast(`${out.deleted}명을 삭제했어요.`);
        paintYoutube(st);
      } catch (e) {
        toast(`삭제하지 못했어요: ${e.message}`, 'error');
      }
    }
  }

  // 키워드 편집 창: 추천 칩을 누르면 입력 칸에 추가 · AI 관련 키워드 (참고용)
  function ytKwModal(st, b) {
    const input = b.querySelector('[data-yt-kwinput]');
    const words = () => input.value.split(',').map(s => s.trim()).filter(Boolean);
    b.addEventListener('click', async e => {
      const add = e.target.closest('[data-kwadd]');
      if (add) {
        const list = words();
        const k = add.dataset.kwadd;
        if (list.some(x => x.toLowerCase() === k.toLowerCase())) return;
        if (list.length >= 8) { toast('키워드는 최대 8개예요. 하나를 삭제한 뒤 추가하세요.', 'error'); return; }
        input.value = list.concat(k).join(', ');
        return;
      }
      const go = e.target.closest('[data-kwai-go]');
      if (!go) return;
      const box = b.querySelector('[data-kwai]');
      ui.busy(go, true);
      try {
        const out = await REBOOT.api('/api/partners/youtube/keywords', { current: words() });
        box.innerHTML = out.keywords.length
          ? `<div class="flex"><span>${badge('AI', 'purple')}</span><span class="small muted">참고용 · ${esc(out.model || '')} · 마우스를 올리면 이유가 보여요</span></div>
             <div class="chips mt-8">${out.keywords.map(k => `<button type="button" class="chip" data-kwadd="${esc(k.keyword)}" title="${esc(k.reason)}">＋ ${esc(k.keyword)}</button>`).join('')}</div>`
          : '<p class="small muted">새로 추천할 키워드가 없어요.</p>';
      } catch (err) {
        box.innerHTML = `<p class="note error">관련 키워드를 추천 받지 못했어요: ${esc(err.message)}</p>`;
      }
    });
  }

  async function ytImport(st, file) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    try {
      const out = await REBOOT.upload('/api/partners/youtube/import', fd);
      paintYoutube(st, `CSV를 업로드했어요 — 새로 ${fmt.num(out.added)} · 갱신 ${fmt.num(out.updated)} · 건너뜀 ${fmt.num(out.skipped)} (기준일이 30일 넘은 값·형식이 틀린 줄은 건너뜀)`);
    } catch (e) {
      toast(`CSV를 업로드하지 못했어요: ${e.message}`, 'error');
    }
  }

  function select(st, id) {
    st.f.selected = id;
    saveFilters(st.f);
    st.el.querySelectorAll('tr[data-id]').forEach(tr => tr.classList.toggle('selected', tr.dataset.id === id));
    paintDetail(st);
    const box = st.el.querySelector('[data-ref="detail"]');
    if (box && global.matchMedia && global.matchMedia('(max-width: 950px)').matches) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 필터 바 선택 상자: 구분 · 세부 카테고리 · 키워드 · 대상 · 정렬
  function cfChange(st, key, v) {
    const f = st.f;
    if (key === 'type') {
      if (v === 'yt') f.yt = true;
      else Object.assign(f, { yt: false, types: v ? [v] : [], tags: [] });
      st.page = st.ytPage = 1;
      saveFilters(f);
      paintBody(st);
      return;
    }
    if (key === 'tag') f.tags = v ? [v] : [];
    else if (key === 'kw') f.ytTags = v ? [v] : [];
    else if (key === 'target') f.ytTargets = v ? [v] : [];
    else if (key === 'sort') {
      const [k, d] = String(v).split('|');
      if (f.yt) Object.assign(f, { ytSort: k, ytDir: Number(d) }); else Object.assign(f, { sort: k, dir: Number(d) });
    }
    cfRepaint(st);
  }
  // 토글 · 정렬 머리글 · 페이지 버튼
  function cfAction(st, a, btn) {
    const f = st.f;
    if (a === 'cf-tog') { f[btn.dataset.k] = !f[btn.dataset.k]; cfRepaint(st); }
    else if (a === 'cf-sort') {
      // 같은 머리글을 다시 누르면 방향만 바꾸고, 다른 머리글이면 그 칸의 기본 방향으로
      const k = btn.dataset.k;
      const s = sortState(f, !!f.yt);
      const dir = s.k === k ? -s.dir : (f.yt ? YT_SORTS : CONTACT_SORTS)[k][1];
      if (f.yt) Object.assign(f, { ytSort: k, ytDir: dir }); else Object.assign(f, { sort: k, dir });
      cfRepaint(st);
    }
    else if (a === 'cf-page') {
      if (f.yt) { st.ytPage = Number(btn.dataset.p); paintYtRows(st); } else { st.page = Number(btn.dataset.p); paintRows(st); }
    }
  }
  function cfRepaint(st) {
    st.page = st.ytPage = 1;
    saveFilters(st.f);
    if (st.f.yt) paintYtTable(st);
    else { paintFilters(st); paintRows(st); }
  }

  function wireContacts(st) {
    const el = st.el;
    el.addEventListener('click', e => {
      const t = e.target;
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'compose') {
          const c = st.data.items.find(x => x.id === act.dataset.id);
          if (c) compose(c);
        } else if (a === 'import-open') paintImport(st, !st.data.total, true);
        else if (a === 'csv-open') csvModal(st);
        else if (a === 'example') loadExample(st, act);
        else if (a.startsWith('yt-')) ytAction(st, a, act);
        else if (a.startsWith('cf-')) cfAction(st, a, act);
        else if (a === 'reset-filters') {
          // 필터 지우기: 지금 화면(업체 목록 / 유튜브)의 필터만
          if (st.f.yt) Object.assign(st.f, { ytTags: [], ytTargets: [], ytEmail: false, ytQ: '' });
          else Object.assign(st.f, { types: [], tags: [], q: '', hasEmail: false });
          st.page = st.ytPage = 1;
          saveFilters(st.f);
          paintBody(st);
        } else if (a === 'goto-history') {
          try { REBOOT.use('partners.records').focus(act.dataset.id); } catch (err) { /* 무시 */ }
          go('history');
        }
        return;
      }
      const v = t.closest('[data-view]');
      if (v) {
        st.f.view = v.dataset.view === 'board' ? 'board' : 'list';
        saveFilters(st.f);
        paintMain(st);
        return;
      }
      const tr = t.closest('tr[data-id]');
      if (tr && !t.closest('a')) select(st, tr.dataset.id);
    });
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-id]')) {
        e.preventDefault();
        select(st, e.target.dataset.id);
      }
    });
    el.addEventListener('input', e => {
      // 검색: 표만 다시 그림 (필터 바는 그대로 두어 입력이 끊기지 않게)
      if (e.target.matches('[data-ref="q"]')) {
        st.f.q = e.target.value;
        st.page = 1;
        saveFilters(st.f);
        paintRows(st);
      } else if (e.target.matches('[data-ref="ytq"]')) {
        st.f.ytQ = e.target.value;
        st.ytPage = 1;
        saveFilters(st.f);
        paintYtRows(st);
      }
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-cf]')) { cfChange(st, t.dataset.cf, t.value); return; }
      if (t.matches('[data-yt-sel]')) { if (t.checked) st.ytSel.add(t.dataset.ytSel); else st.ytSel.delete(t.dataset.ytSel); ytSelState(st); return; }
      if (t.matches('[data-yt-all]')) { ytSorted(st).forEach(c => { if (t.checked) st.ytSel.add(c.id); else st.ytSel.delete(c.id); }); paintYtRows(st); return; }
    });
  }

  /* ═════════ 3-2 협업 메일 · 3-3 협업 가이드 ═════════ */

  async function renderMail(el) {
    el.innerHTML = '<div class="skeleton ptn-skel"></div>';
    let cfg;
    let list;
    try {
      [cfg, list] = await Promise.all([config(), contacts()]);
    } catch (e) {
      if (!el.isConnected) return;
      el.innerHTML = errorBox(`협업 메일 화면을 불러오지 못했어요. ${e.message}`);
      el.querySelector('[data-act="retry"]').addEventListener('click', () => renderMail(fresh(el)));
      return;
    }
    if (!el.isConnected) return;
    const d = getDraft();
    const st = { el, cfg, contacts: list.items || [], atts: null };
    pickOpen = null;   // 파트너 찾기에서 고르고 들어오면 한 줄로 접힌 채 시작
    el.innerHTML = `
      <div class="ptn-out-statusline" aria-label="연결 상태">${statusLine(cfg.status)}</div>
      <div class="between ptn-out-subbar">
        <div class="linetabs" role="group" aria-label="제안 작성 화면">
          <button type="button" data-sub="compose" aria-pressed="${d.sub !== 'guide'}">제안 메일</button>
          <button type="button" data-sub="guide" aria-pressed="${d.sub === 'guide'}">협업 가이드</button>
        </div>
        <span class="panel-note">입력값은 탭이나 메뉴를 옮겨도 그대로 남아요 (내 계정에 저장).</span>
      </div>
      <div data-ref="sub"></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-sub]');
      if (!b) return;
      const dd = getDraft();
      dd.sub = b.dataset.sub === 'guide' ? 'guide' : 'compose';
      saveDraft(dd);
      paintSub(st);
    });
    paintSub(st);
  }

  function statusLine(s) {
    const pill = (on, text) => `<span class="ptn-out-pill${on ? ' is-on' : ''}">${text}</span>`;
    // 규제 DB: 컴플라이언스 파트의 규칙 DB · 규제 모니터링을 서버가 실제로 읽어 확인한 결과
    const r = s.regulation || {};
    const reg = s.regulationDb
      ? `규제 DB 연결 · 컴플라이언스 규칙 ${esc(r.rulesVersion || '')} (${fmt.num(r.ruleCount || 0)}개)${r.monitorAt ? ` · 규제 모니터링 ${esc(fmt.date(r.monitorAt))}` : ''}`
      : `규제 DB 연결 안 됨${r.error ? ' — ' + esc(r.error) : ''}`;
    return pill(s.regulationDb, reg) +
      pill(s.openai, s.openai ? `OpenAI 연결 · ${esc(s.model)}` : `OpenAI 키 없음 — ${settingsLink}`) +
      pill(s.smtp, s.smtp ? `Gmail 발송 · ${esc(s.sender)}` : `Gmail 연결 안 됨 — ${settingsLink}`);
  }

  function paintSub(st) {
    const sub = getDraft().sub === 'guide' ? 'guide' : 'compose';
    st.el.querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sub === sub)));
    const box = fresh(st.el.querySelector('[data-ref="sub"]'));
    if (sub === 'guide') renderGuide(box, st);
    else renderCompose(box, st);
  }

  /* ───────── 메일 작성 ───────── */

  // 제안 작성 단계 (V2 시안): 1 대상·조건 → 2 메일 작성 → 3 확인 · 발송. 메뉴를 옮겨도 이번 접속 동안은 그 단계 유지
  const STEPS = ['대상·조건', '메일 작성', '확인'];
  let composeStep = 1;
  let pickOpen = null;   // 받는 파트너 목록 펼침 (null이면 아직 아무것도 안 골랐을 때만 펼침)

  function renderCompose(box, st) {
    const d = getDraft();
    const cfg = st.cfg;
    const s = cfg.status || {};
    const cond = d.cond[d.type];
    const custom = promptCustom(d.type);
    box.innerHTML = `
    <div class="ptn-v2-compose">
      ${d.reply ? replyBanner(d.reply) : ''}
      <section class="card ptn-v2-pick">
        <div class="ptn-v2-pick-head">
          <h2>받는 파트너</h2>
          <div class="seg" role="group" aria-label="업체 구분">${TYPES.map(t => `<button type="button" data-mtype="${esc(t)}" aria-pressed="${d.type === t}">${D.typeIcon[t]} ${esc(t)} <span class="ptn-v2-count">${st.contacts.filter(c => c.type === t).length}</span></button>`).join('')}</div>
          <span class="ptn-v2-tag">파트너별 초안 유지 · 내 계정에 저장</span>
        </div>
        <div data-ref="pick"></div>
      </section>
      <nav class="ptn-v2-steps" aria-label="제안 작성 단계">${STEPS.map((x, i) =>
        `<button type="button" data-step="${i + 1}" aria-current="${composeStep === i + 1 ? 'step' : 'false'}"><span>0${i + 1}</span>${x}</button>`).join('')}</nav>
      <div class="ptn-v2-compose-layout">
        <div class="ptn-v2-step-body">
          <section class="card ptn-v2-paper" data-step-panel="1"${composeStep === 1 ? '' : ' hidden'}>
            <div class="between"><h2>어떤 협업을 제안할까요?</h2><button type="button" class="btn small ghost" data-act="reset-cond">↺ ${esc(d.type)} 기본 문구</button></div>
            <label class="field"><span>업체 이름</span><input class="input" data-f="partnerName" value="${esc(d.partnerName)}" placeholder="직접 입력할 때 업체 이름"${d.partnerId ? ' readonly' : ''}></label>
            <label class="field"><span>협업 목적</span><input class="input" data-f="purpose" value="${esc(cond.purpose)}"></label>
            <div class="ptn-v2-dates">
              <label class="field"><span>시작일</span><input type="date" class="input" data-f="start" value="${esc(d.start)}"></label>
              <label class="field"><span>종료일</span><input type="date" class="input" data-f="end" value="${esc(d.end)}"></label>
            </div>
            <label class="field"><span>제안 내용</span><textarea class="input" rows="3" data-f="proposal">${esc(cond.proposal)}</textarea></label>
            <label class="field"><span>요청사항</span><textarea class="input" rows="2" data-f="requests">${esc(cond.requests)}</textarea><small>한국어로 써도 돼요 — 목적 · 제안 · 요청의 모든 항목이 영어 메일에 반영돼요.</small></label>
            <label class="field"><span>우리가 원하는 ${d.type === '케이터링' ? '케이터링 업체' : '인플루언서'}</span>
              <textarea class="input" rows="2" data-f="ideal">${esc(d.ideal[d.type] || '')}</textarea></label>
            <div class="flex wrap ptn-v2-step-acts">
              <button type="button" class="btn dark" data-step="2">메일 작성으로 →</button>
            </div>
          </section>

          <section class="card ptn-v2-paper" data-step-panel="2"${composeStep === 2 ? '' : ' hidden'}>
            <div class="between"><h2>제안 메일 <span data-ref="ai-badge">${d.ai ? badge('AI 초안 · 참고용', 'purple') : ''}</span></h2>
              <button type="button" class="btn small soft" data-act="generate"${s.openai ? '' : ` disabled title="설정 › 연결에서 OpenAI 키를 넣으면 쓸 수 있어요"`}>AI 초안 넣기</button></div>
            ${s.openai ? '' : `<p class="panel-note">${settingsLink}에서 OpenAI 키를 넣으면 AI 초안을 쓸 수 있어요 · 지금은 직접 쓸 수 있어요.</p>`}
            <label class="field"><span>수신자</span><input class="input" type="text" inputmode="email" data-f="to" value="${esc(d.to)}" placeholder="partner@example.com (여러 명은 쉼표로, 5명까지)" autocomplete="off"></label>
            <label class="field"><span>제목</span><input class="input" data-f="subject" value="${esc(d.subject)}" maxlength="300" placeholder="협업 제안 제목"></label>
            <label class="field"><span>본문</span><textarea class="input ptn-out-body" rows="12" data-f="body" placeholder="메일을 직접 작성하거나 AI 초안을 넣으세요.">${esc(d.body)}</textarea><small data-ref="wc"></small></label>
            <details class="ptn-v2-tools">
              <summary>첨부파일 · 번역 · 문구 심의 도구 <span data-ref="att-sum"></span></summary>
              <div class="flex wrap mt-8">
                <button type="button" class="btn soft small" data-act="to-ko"${s.openai ? '' : ' disabled'}>한국어로 보기</button>
                <button type="button" class="btn soft small" data-act="to-en"${s.openai ? '' : ' disabled'}>영어로 변환</button>
                <button type="button" class="btn soft small" data-act="review">문구 심의</button>
              </div>
              <label class="dropzone ptn-out-attdrop mt-8" data-drop="attach">${icon('upload')}
                <span>첨부파일 업로드 — 끌어다 놓거나 눌러서 고르세요. 보관함에 저장되고 다음 메일에도 기본으로 체크돼요</span>
                <small class="muted">PDF · CSV · Word · Excel · PowerPoint · PNG · JPG · ZIP · TXT (파일당 ${D.attach.maxFileMB}MB)</small>
                <input type="file" class="sr-only" multiple accept="${esc(D.attach.accept)}" data-ref="att-input" aria-label="첨부파일 고르기"></label>
              <ul class="ptn-out-attlist" data-ref="att-list"><li class="small muted">보관함을 불러오는 중…</li></ul>
              <div data-ref="att-warn"></div>
            </details>
            <details class="ptn-v2-tools">
              <summary>AI 초안 작성 기준 · 고급 설정 <span data-ref="prompt-badge">${custom ? badge('팀에서 수정함', 'orange') : badge('기본')}</span></summary>
              <div class="ptn-out-steps" aria-label="메일 구조"><span class="ptn-out-steps-title">메일 구조</span>
                ${(cfg.mailSteps || D.mailSteps).map((x, i) => `<span class="ptn-out-step"><b>${i + 1}</b>${esc(x)}</span>`).join('<span class="ptn-out-arrow" aria-hidden="true">→</span>')}</div>
              <textarea class="input mono ptn-out-prompttext" rows="9" data-f="prompt" aria-label="생성 프롬프트 원문">${esc(promptFor(d.type, cfg))}</textarea>
              <small class="hint">중괄호 자리는 보낼 때 실제 값으로 바뀌어요 · 팀 공용으로 저장 · 공통 규칙(150–200단어 · 의학 주장·과음 조장 금지 등)은 서버가 항상 덧붙여요.</small>
              <div class="flex wrap">
                <button type="button" class="btn small ghost" data-act="reset-prompt">↺ 기본 프롬프트로 되돌리기</button>
                <details><summary class="small">프롬프트에 들어가는 제품 설명</summary><p class="small muted mt-8">${esc(cfg.productDesc || '')}</p></details>
              </div>
            </details>
            <div data-ref="ko">${d.ko ? koBox(d.ko) : ''}</div>
            <div class="flex wrap ptn-v2-step-acts"><button type="button" class="btn dark" data-step="3">확인 단계로 →</button></div>
          </section>

          <section class="card ptn-v2-paper ptn-out-send" data-step-panel="3"${composeStep === 3 ? '' : ' hidden'}>
            <h2>제안 내용을 확인하세요.</h2>
            <div data-ref="check"></div>
            <div data-ref="review" class="ptn-v2-review"><div class="card-head"><h2>문구 심의</h2>${badge('B2B 기준', 'blue')}</div>
              <p class="panel-note">‘문구 심의’를 누르면 제목·본문의 금지·주의 표현을 찾아 등급 · 사유 · 수정 후보를 보여 줘요. 1차 참고용이고 최종 판단은 담당자가 해요.</p>
              <button type="button" class="btn soft small" data-act="review">문구 심의</button></div>
            <div class="field-grid">
              <label class="field"><span>담당자</span><input class="input" data-f="owner" value="${esc(d.owner)}" placeholder="이름" maxlength="60"></label>
              <div class="field"><span class="field-label">발송 계정</span><p class="small${s.smtp ? '' : ' muted'}">${s.smtp ? esc(s.sender) : 'Gmail 연결 안 됨'}</p></div>
            </div>
            <label class="check"><input type="checkbox" data-ref="confirm"${s.smtp ? '' : ' disabled'}> 수신자 · 제목 · 본문 · 첨부파일을 확인했고, 이 내용으로 보내요.</label>
            <div class="flex wrap">
              <button type="button" class="btn dark" data-act="send" disabled>Gmail로 보내기</button>
              <span class="hint" data-ref="send-hint"></span>
            </div>
            <details class="ptn-v2-tools"><summary>발송 안내</summary>
              <ul class="ptn-out-tips">
                <li>발송 성공·실패 모두 협업 기록에 자동 저장돼요 (첨부 이름 · 발송 계정 또는 오류 · Message-ID).</li>
                <li>회신 · 반송은 협업 관리의 새 회신 확인으로 갱신해요.</li>
                <li>첨부 합계가 ${D.attach.maxTotalMB}MB(Gmail 한도)를 넘으면 보낼 수 없어요.</li>
                <li>개인 Gmail은 하루 약 500통까지 보낼 수 있어요.</li>
              </ul></details>
          </section>
        </div>

        <aside class="stack tight ptn-v2-side">
          <section class="card ptn-v2-paper ptn-v2-guide-card">
            <h2>협업 가이드</h2>
            <p class="panel-note">01 단계 조건으로 이어서 만들어요.</p>
            <button type="button" class="btn soft block" data-sub="guide">가이드 만들기 →</button>
          </section>
          <section class="card ptn-v2-paper tinted" data-ref="target"></section>
        </aside>
      </div>
    </div>`;
    paintPick(st, box);
    paintTarget(st, box);
    wordCount(box, d.body);
    wireCompose(st, box);
    updateSend(st, box);
    loadAttachments(st, box);
    paintCheck(box);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (b) showStep(box, Number(b.dataset.step));
      else if (e.target.closest('[data-act="review"]') && composeStep !== 3) showStep(box, 3);   // 심의 결과는 확인 단계에 보임
    });
  }

  /** 단계 바꾸기 (날짜가 거꾸로면 막음) */
  function showStep(box, n) {
    const d = getDraft();
    if (n > 1 && d.start && d.end && d.start > d.end) { toast('종료일은 시작일 이후로 선택하세요.', 'error'); return; }
    composeStep = n;
    box.querySelectorAll('[data-step-panel]').forEach(x => { x.hidden = Number(x.dataset.stepPanel) !== n; });
    box.querySelectorAll('.ptn-v2-steps [data-step]').forEach(x => x.setAttribute('aria-current', Number(x.dataset.step) === n ? 'step' : 'false'));
    if (n === 3) paintCheck(box);
  }

  /** 3단계 확인: 지금 초안의 파트너 · 목적 · 일정 · 제목 · 본문 */
  function paintCheck(box) {
    const el = box.querySelector('[data-ref="check"]');
    if (!el) return;
    const d = getDraft();
    const cond = d.cond[d.type] || {};
    el.innerHTML = `<dl class="ptn-v2-check"><dt>파트너</dt><dd>${esc(d.partnerName || '미정')}</dd><dt>수신자</dt><dd>${esc(d.to || '미작성')}</dd>
      <dt>협업 목적</dt><dd>${esc(cond.purpose || '미작성')}</dd><dt>일정</dt><dd>${esc(d.start || '미정')} ~ ${esc(d.end || '미정')}</dd></dl>
      <h3>${esc(d.subject || '제목 미작성')}</h3><p class="ptn-v2-email-preview">${esc(d.body || '본문 미작성')}</p>`;
  }

  function replyBanner(r) {
    return `<section class="card ptn-out-reply">
      <div class="card-head"><h2>↩️ 답장 모드</h2><button type="button" class="btn small ghost" data-act="reply-cancel">답장 취소</button></div>
      <p class="small">${esc(r.partnerName || '상대방')}의 회신에 같은 Gmail 대화로 답장해요. 첨부파일도 함께 보낼 수 있어요.</p>
      <details class="ptn-out-quote mt-8" open><summary class="small">상대방 회신 · ${esc(r.from || '')} · ${esc(fmt.datetime(r.at))}</summary>
        <pre class="ptn-out-pre">${esc(r.body || '(본문 없음)')}</pre></details>
    </section>`;
  }

  function koBox(text) {
    return `<div class="result ptn-out-ko mt-16">
      <div class="between"><strong class="small">한국어 번역</strong>${badge('AI 번역 · 참고용 (발송 본문은 영어 그대로)', 'purple')}</div>
      <pre class="ptn-out-pre mt-8">${esc(text)}</pre>
      <button type="button" class="link mt-8" data-act="ko-close">번역 닫기</button>
    </div>`;
  }

  // 받는 파트너: 고르기 전에는 검색 + 목록, 고른 뒤에는 한 줄(바꾸기)
  function paintPick(st, box) {
    const d = getDraft();
    const el = box.querySelector('[data-ref="pick"]');
    const c = st.contacts.find(x => x.id === d.partnerId);
    if (pickOpen === null) pickOpen = !c && !d.partnerName;
    if (!pickOpen) {
      el.innerHTML = `<div class="ptn-v2-picked">
        ${c ? `${contactAvatar(c)}<div class="ptn-out-name"><strong>${esc(c.name)}</strong>${c.email ? `<small>${esc(c.email)}</small>` : badge('이메일 없음', 'orange')}</div>`
          : `<div class="ptn-out-name"><strong>직접 입력${d.partnerName ? ` · ${esc(d.partnerName)}` : ''}</strong><small>업체 이름은 01 단계, 수신자는 02 단계에서 써요.</small></div>`}
        <button type="button" class="btn small soft" data-act="pick-open">${c ? '바꾸기' : '목록에서 고르기'}</button></div>`;
      logoFallback(el);
      return;
    }
    const opts = st.contacts.filter(x => x.type === d.type);
    const row = x => `<li data-search="${esc(`${x.name} ${x.email || ''}`.toLowerCase())}">
      <button type="button" data-pick="${esc(x.id)}" aria-pressed="${x.id === d.partnerId}">${contactAvatar(x)}
        <span class="ptn-out-name"><strong>${esc(x.name)}</strong>${x.email ? `<small>${esc(x.email)}</small>` : ''}</span>
        ${x.email ? '' : badge('이메일 없음', 'orange')}${x.example ? badge('예시', 'orange') : ''}</button></li>`;
    el.innerHTML = `<input class="input" type="search" data-ref="pick-q" placeholder="${esc(d.type)} ${opts.length}곳에서 이름·이메일 검색" aria-label="받는 파트너 검색" autocomplete="off">
      <ul class="ptn-v2-picklist">
        <li data-search=""><button type="button" data-pick="" class="ptn-v2-pick-manual">✏️ 직접 입력 <small>목록에 없는 업체</small></button></li>
        ${opts.map(row).join('')}
        <li class="small muted ptn-v2-pick-none" hidden>찾는 업체가 없어요. 직접 입력을 고르세요.</li>
      </ul>`;
    logoFallback(el);
  }

  function filterPick(box, q) {
    const s = q.trim().toLowerCase();
    let shown = 0;
    box.querySelectorAll('.ptn-v2-picklist li[data-search]').forEach(li => {
      const ok = !s || !li.dataset.search || li.dataset.search.includes(s);
      li.hidden = !ok;
      if (ok && li.dataset.search) shown += 1;
    });
    const none = box.querySelector('.ptn-v2-pick-none');
    if (none) none.hidden = !s || shown > 0;
  }

  function paintTarget(st, box) {
    const d = getDraft();
    const el = box.querySelector('[data-ref="target"]');
    const c = st.contacts.find(x => x.id === d.partnerId);
    if (c) {
      el.innerHTML = `<div class="card-head"><h2>받는 파트너</h2>${typeBadge(c.type)}</div>
        <div class="flex"><span class="initial ptn-av${avIndex(c.id)}" aria-hidden="true">${esc(initials(c.name))}</span>
          <div class="ptn-out-name"><strong>${esc(c.name)}</strong>${c.example ? ' ' + badge('예시', 'orange') : ''}<small>${esc(c.location || '지역 정보 없음')}</small></div></div>
        ${c.category ? `<p class="small mt-8">${esc(c.category)}</p>` : ''}
        ${c.note ? `<p class="small muted mt-8">${esc(c.note)}</p>` : ''}`;
    } else {
      el.innerHTML = `<div class="card-head"><h2>받는 파트너</h2></div>
        <p class="panel-note">파트너 찾기에서 파트너를 고르거나 이메일을 누르면 수신자가 자동으로 들어가요. 직접 입력해도 돼요.</p>
        <button type="button" class="btn small soft mt-8" data-act="goto-contacts">파트너 찾기로</button>`;
    }
  }

  function wordCount(box, text) {
    const el = box.querySelector('[data-ref="wc"]');
    if (!el) return;
    const n = String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0;
    el.textContent = n ? `${n}단어${n < 150 || n > 200 ? ' · 권장 150–200단어' : ''}` : '';
  }

  function setField(box, name, value) {
    const el = box.querySelector(`[data-f="${name}"]`);
    if (el) el.value = value;
  }

  function unconfirm(box) {
    const c = box.querySelector('[data-ref="confirm"]');
    if (c) c.checked = false;
  }

  function clearReview(box) {
    const card = box.querySelector('[data-ref="review"]');
    if (card && card.dataset.done) {
      delete card.dataset.done;
      card.innerHTML = `<div class="card-head"><h2>문구 심의</h2>${badge('B2B 기준', 'blue')}</div><p class="panel-note">내용이 바뀌었어요. 발송 전에 다시 심의하세요.</p>`;
    }
  }

  function onField(st, box, t) {
    const f = t.dataset && t.dataset.f;
    if (!f || f === 'partnerId') return;
    const d = getDraft();
    if (f === 'prompt') {
      setPrompt(d.type, t.value, st.cfg);
      const b = box.querySelector('[data-ref="prompt-badge"]');
      if (b) b.innerHTML = promptCustom(d.type) ? badge('팀에서 수정함', 'orange') : badge('기본');
      return;
    }
    if (f === 'ideal') d.ideal[d.type] = t.value;
    else if (COND_FIELDS.includes(f)) d.cond[d.type][f] = t.value;
    else d[f] = t.value;
    if (f === 'to' || f === 'subject' || f === 'body') {
      unconfirm(box);
      if (f !== 'to') clearReview(box);
      if (f === 'body') wordCount(box, t.value);
    }
    saveDraft(d);
    updateSend(st, box);
  }

  async function pickPartner(st, box, id) {
    const d = getDraft();
    if (id === d.partnerId) {   // 같은 업체(또는 이미 직접 입력)면 목록만 닫음
      pickOpen = false;
      paintPick(st, box);
      return;
    }
    if ((d.subject.trim() || d.body.trim()) && !(await ui.confirm('다른 업체를 고르면 작성 중인 제목·본문·번역이 지워져요. 계속할까요?', { ok: '업체 바꾸기' }))) return;
    const c = st.contacts.find(x => x.id === id);
    Object.assign(d, { partnerId: c ? c.id : '', partnerName: c ? c.name : '', to: c ? (c.email || '') : '', subject: '', body: '', ko: '', ai: false, reply: null });
    saveDraft(d);
    pickOpen = false;
    paintSub(st);
  }

  function wireCompose(st, box) {
    box.addEventListener('input', e => {
      if (e.target.matches('[data-ref="pick-q"]')) filterPick(box, e.target.value);
      else onField(st, box, e.target);
    });
    box.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-ref="att-input"]')) { uploadFiles(st, box, Array.from(t.files || [])); t.value = ''; }
      else if (t.matches('[data-ref="confirm"]')) updateSend(st, box);
      else if (t.matches('[data-att]')) toggleAttach(st, box, t.dataset.att, t.checked);
      else if (t.matches('[data-f="start"], [data-f="end"]')) onField(st, box, t);
    });
    box.addEventListener('click', e => {
      const typeBtn = e.target.closest('[data-mtype]');
      if (typeBtn) return switchType(st, typeBtn.dataset.mtype);
      const pick = e.target.closest('[data-pick]');
      if (pick) return pickPartner(st, box, pick.dataset.pick);
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'generate') generate(st, box, b);
      else if (a === 'to-ko') toKo(box, b);
      else if (a === 'to-en') toEn(st, box, b);
      else if (a === 'ko-close') { const d = getDraft(); d.ko = ''; saveDraft(d); box.querySelector('[data-ref="ko"]').innerHTML = ''; }
      else if (a === 'review') reviewMail(box);
      else if (a === 'send') doSend(st, box, b);
      else if (a === 'att-del') deleteAttachment(st, box, b.dataset.id);
      else if (a === 'reset-prompt') resetPrompt(st, box);
      else if (a === 'reset-cond') resetCond(st);
      else if (a === 'reply-cancel') cancelReply(st);
      else if (a === 'goto-contacts') go('contacts');
      else if (a === 'pick-open') {
        pickOpen = true;
        paintPick(st, box);
        const q = box.querySelector('[data-ref="pick-q"]');
        if (q) q.focus();
      }
    });
    const zone = box.querySelector('[data-drop="attach"]');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      uploadFiles(st, box, Array.from((e.dataTransfer && e.dataTransfer.files) || []));
    });
  }

  function switchType(st, type) {
    if (!TYPES.includes(type)) return;
    const d = getDraft();
    if (d.type === type) return;
    d.type = type;
    const c = st.contacts.find(x => x.id === d.partnerId);
    if (c && c.type !== type) d.partnerId = '';   // 다른 구분의 업체는 '직접 입력'으로 (이름·수신자는 남김)
    saveDraft(d);
    pickOpen = true;   // 구분을 바꾸면 그 구분 목록을 바로 보여 줌
    paintSub(st);
  }

  function resetPrompt(st, box) {
    const d = getDraft();
    setPrompt(d.type, '', st.cfg);
    setField(box, 'prompt', promptFor(d.type, st.cfg));
    const b = box.querySelector('[data-ref="prompt-badge"]');
    if (b) b.innerHTML = badge('기본');
    toast(`${d.type} 기본 프롬프트로 되돌렸어요.`);
  }

  function resetCond(st) {
    const d = getDraft();
    const def = D.defaults[d.type];
    d.ideal[d.type] = def.ideal;
    d.cond[d.type] = { purpose: def.purpose, proposal: def.proposal, requests: def.requests };
    d.start = REBOOT.today();
    d.end = addDays(d.start, D.periodDays);
    saveDraft(d);
    paintSub(st);
  }

  async function cancelReply(st) {
    const d = getDraft();
    if (d.body.trim() && !(await ui.confirm('답장 모드를 끝내면 작성 중인 본문이 지워져요. 계속할까요?', { ok: '답장 취소' }))) return;
    Object.assign(d, { reply: null, subject: '', body: '', ko: '', ai: false });
    saveDraft(d);
    paintSub(st);
  }

  async function generate(st, box, btn) {
    const d = getDraft();
    if ((d.subject.trim() || d.body.trim()) && !(await ui.confirm('작성 중인 제목·본문을 새 AI 초안으로 바꿀까요?', { ok: '바꾸기' }))) return;
    const cond = d.cond[d.type];
    ui.busy(btn, true);
    try {
      const out = await REBOOT.api('/api/partners/email/generate', {
        type: d.type, partner: { id: d.partnerId, name: d.partnerName || '' }, ideal: d.ideal[d.type] || '',
        prompt: promptFor(d.type, st.cfg), purpose: cond.purpose, period: { start: d.start, end: d.end },
        proposal: cond.proposal, requests: cond.requests, reply_to: d.reply ? d.reply.historyId : null
      });
      const dd = getDraft();
      const keepRe = dd.reply && /^re:/i.test(dd.subject.trim());
      Object.assign(dd, { subject: keepRe ? dd.subject : out.subject, body: out.body, ai: true, ko: '' });
      saveDraft(dd);
      if (box.isConnected) {
        setField(box, 'subject', dd.subject);
        setField(box, 'body', dd.body);
        wordCount(box, dd.body);
        box.querySelector('[data-ref="ai-badge"]').innerHTML = badge('AI 초안 · 참고용', 'purple');
        box.querySelector('[data-ref="ko"]').innerHTML = '';
        unconfirm(box);
        clearReview(box);
        updateSend(st, box);
      }
      toast(`AI 초안을 만들었어요 (${out.words}단어). 검토하고 고친 뒤 보내세요.`);
    } catch (e) {
      toast(`AI 초안을 만들지 못했어요: ${e.message}`, 'error');
    } finally {
      ui.busy(btn, false);
    }
  }

  async function toKo(box, btn) {
    const d = getDraft();
    const text = [d.subject, d.body].filter(x => String(x || '').trim()).join('\n\n');
    if (!text) return toast('번역할 제목·본문이 없어요.', 'error');
    ui.busy(btn, true);
    try {
      const out = await REBOOT.api('/api/partners/translate', { text, to: 'ko' });
      const dd = getDraft();
      dd.ko = out.text;
      saveDraft(dd);
      if (box.isConnected) box.querySelector('[data-ref="ko"]').innerHTML = koBox(out.text);
    } catch (e) {
      toast(`번역하지 못했어요: ${e.message}`, 'error');
    } finally {
      ui.busy(btn, false);
    }
  }

  async function toEn(st, box, btn) {
    const d = getDraft();
    if (!d.subject.trim() && !d.body.trim()) return toast('바꿀 제목·본문이 없어요.', 'error');
    ui.busy(btn, true);
    try {
      const tr = text => (String(text || '').trim() ? REBOOT.api('/api/partners/translate', { text, to: 'en' }).then(r => r.text) : Promise.resolve(''));
      const [subject, body] = await Promise.all([tr(d.subject), tr(d.body)]);
      const dd = getDraft();
      if (subject) dd.subject = subject.replace(/[\r\n]+/g, ' ').trim();
      if (body) dd.body = body;
      Object.assign(dd, { ai: true, ko: '' });
      saveDraft(dd);
      if (box.isConnected) {
        setField(box, 'subject', dd.subject);
        setField(box, 'body', dd.body);
        wordCount(box, dd.body);
        box.querySelector('[data-ref="ai-badge"]').innerHTML = badge('AI 번역 포함 · 참고용', 'purple');
        box.querySelector('[data-ref="ko"]').innerHTML = '';
        unconfirm(box);
        clearReview(box);
        updateSend(st, box);
      }
      toast('영어로 바꿨어요. 검토한 뒤 보내세요.');
    } catch (e) {
      toast(`영어로 바꾸지 못했어요: ${e.message}`, 'error');
    } finally {
      ui.busy(btn, false);
    }
  }

  /* 컴플라이언스 파트 판정 엔진 (클라이언트) — 파트너 메일·가이드는 B2B 채널 */
  function complianceReview(text) {
    try { return REBOOT.use('compliance').review(text, { channel: 'b2b' }); } catch (e) { return null; }
  }

  function findingsHtml(r, what) {
    if (!r) return ui.empty('컴플라이언스 탭을 불러오지 못해 문구 심의를 할 수 없어요.', 'shield');
    if (!r.findings.length) return `<p class="small">${esc(what)}에서 금지·주의 표현을 찾지 못했어요.</p>`;
    return `<ul class="ptn-out-findings">${r.findings.map(f => {
      const fv = VERDICT[f.verdict] || [f.verdict, ''];
      return `<li><div class="between"><strong>${esc(f.code)} · ${esc(f.name)}</strong>${badge(fv[0], fv[1])}</div>
        <p class="small mt-8">찾은 표현: ${f.terms.map(t => `<mark>${esc(t)}</mark>`).join(', ')}</p>
        <p class="small muted">${esc(f.reason)}</p>
        <p class="small"><b>수정 후보</b> ${esc(f.alt)}</p></li>`;
    }).join('')}</ul>`;
  }

  function reviewMail(box) {
    const d = getDraft();
    const text = [d.subject, d.body].filter(x => String(x || '').trim()).join('\n');
    if (!text) return toast('심의할 제목·본문이 없어요.', 'error');
    const r = complianceReview(text);
    const card = box.querySelector('[data-ref="review"]');
    const v = r ? (VERDICT[r.verdict] || [r.verdict, '']) : null;
    card.dataset.done = '1';
    card.innerHTML = `<div class="card-head"><h2>문구 심의</h2>${v ? badge(v[0], v[1]) : ''}</div>
      ${findingsHtml(r, '제목·본문')}
      <p class="panel-note mt-8">컴플라이언스 탭 규칙 · B2B 바이어 자료 기준 · 1차 참고용이고, 걸린 표현 없음은 법적 승인이 아니에요.</p>`;
    if (global.matchMedia && global.matchMedia('(max-width: 950px)').matches) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 첨부파일 보관함 */

  async function loadAttachments(st, box) {
    try {
      const r = await REBOOT.api('/api/partners/attachments');
      st.atts = r.items || [];
    } catch (e) {
      st.atts = [];
      toast(`첨부파일 보관함을 불러오지 못했어요. ${e.message}`, 'error');
    }
    if (box.isConnected) paintAttachments(st, box);
  }

  function selectedAtts(st, d) {
    const off = new Set(d.attachOff || []);
    return (st.atts || []).filter(a => !off.has(a.id));
  }

  function paintAttachments(st, box) {
    const d = getDraft();
    const off = new Set(d.attachOff || []);
    const list = box.querySelector('[data-ref="att-list"]');
    list.innerHTML = st.atts.length ? st.atts.map(a => `<li class="ptn-out-att">
        <label class="check"><input type="checkbox" data-att="${esc(a.id)}"${off.has(a.id) ? '' : ' checked'}><span>${a.source === 'guide' ? '' : ''} ${esc(a.name)}</span></label>
        <span class="small muted nowrap">${fmtBytes(a.size)}</span>
        <a class="icon-btn ptn-out-iconbtn" href="/api/partners/attachments/${esc(a.id)}" download title="다운로드" aria-label="${esc(a.name)} 다운로드">${icon('download')}</a>
        <button type="button" class="icon-btn ptn-out-iconbtn" data-act="att-del" data-id="${esc(a.id)}" title="보관함에서 삭제" aria-label="${esc(a.name)} 삭제">${icon('trash')}</button>
      </li>`).join('') : '<li class="small muted">아직 보관함에 파일이 없어요. 위에서 첨부파일을 올려 시작하세요.</li>';
    const sel = selectedAtts(st, d);
    const total = sel.reduce((n, a) => n + a.size, 0);
    const over = total > D.attach.maxTotalMB * MB;
    box.querySelector('[data-ref="att-sum"]').innerHTML = badge(`선택 ${sel.length}개 · ${fmtBytes(total)}`, over ? 'red' : sel.length ? 'green' : '');
    box.querySelector('[data-ref="att-warn"]').innerHTML = over
      ? `<p class="note warn mt-8">선택한 첨부파일 합계가 ${fmtBytes(total)}로 Gmail 한도 ${D.attach.maxTotalMB}MB를 넘어요. 일부 파일의 체크를 해제하세요.</p>` : '';
    updateSend(st, box);
  }

  function toggleAttach(st, box, id, on) {
    const d = getDraft();
    const off = new Set(d.attachOff || []);
    if (on) off.delete(id); else off.add(id);
    d.attachOff = Array.from(off);
    saveDraft(d);
    unconfirm(box);
    paintAttachments(st, box);
  }

  async function uploadFiles(st, box, files) {
    if (!files.length) return;
    const ok = [];
    for (const f of files) {
      const ext = String(f.name).split('.').pop().toLowerCase();
      if (!D.attach.exts.includes(ext)) { toast(`올릴 수 없는 형식이에요: ${f.name}`, 'error'); return; }
      if (f.size > D.attach.maxFileMB * MB) { toast(`파일이 너무 커요: ${f.name} (${D.attach.maxFileMB}MB까지)`, 'error'); return; }
      if (!f.size) { toast(`빈 파일이에요: ${f.name}`, 'error'); return; }
      ok.push(f);
    }
    const fd = new FormData();
    ok.forEach(f => fd.append('file', f, f.name));
    const zone = box.querySelector('[data-drop="attach"]');
    if (zone) zone.classList.add('is-busy');
    try {
      const out = await REBOOT.upload('/api/partners/attachments', fd);
      st.atts = (out.items || []).concat(st.atts || []);
      toast(`${ok.length}개 파일을 보관함에 올렸어요 (이번 메일에 체크됨).`);
      unconfirm(box);
    } catch (e) {
      toast(`첨부파일을 올리지 못했어요: ${e.message}`, 'error');
    } finally {
      if (zone) zone.classList.remove('is-busy');
    }
    if (box.isConnected) paintAttachments(st, box);
  }

  async function deleteAttachment(st, box, id) {
    const a = (st.atts || []).find(x => x.id === id);
    if (!a || !(await ui.confirm(`'${a.name}'을(를) 첨부파일 보관함에서 삭제할까요? 이미 보낸 메일에는 영향이 없어요.`, { ok: '삭제', danger: true }))) return;
    try {
      await REBOOT.api('/api/partners/attachments/' + encodeURIComponent(id), undefined, { method: 'DELETE' });
      st.atts = st.atts.filter(x => x.id !== id);
      const d = getDraft();
      d.attachOff = (d.attachOff || []).filter(x => x !== id);
      saveDraft(d);
      toast('보관함에서 삭제했어요.');
    } catch (e) {
      toast(`삭제하지 못했어요: ${e.message}`, 'error');
    }
    if (box.isConnected) paintAttachments(st, box);
  }

  /* 발송 — '확인' 체크 + 버튼을 사람이 눌러야만 */

  function updateSend(st, box) {
    const btn = box.querySelector('[data-act="send"]');
    if (!btn || btn.classList.contains('is-busy')) return;
    const d = getDraft();
    const s = st.cfg.status || {};
    const confirmEl = box.querySelector('[data-ref="confirm"]');
    const total = selectedAtts(st, d).reduce((n, a) => n + a.size, 0);
    let why = '';
    if (!s.smtp) why = `Gmail이 연결되지 않았어요 — ${settingsLink}에서 Gmail 주소와 앱 비밀번호를 넣으면 보낼 수 있어요.`;
    else if (!emailsOk(d.to)) why = '수신자 이메일을 확인하세요.';
    else if (!d.subject.trim() || !d.body.trim()) why = '제목과 본문을 입력하세요.';
    else if (!String(d.owner || '').trim()) why = '담당자를 입력하세요.';
    else if (st.atts === null) why = '첨부파일 보관함을 불러오는 중이에요.';
    else if (total > D.attach.maxTotalMB * MB) why = `첨부파일 합계가 ${D.attach.maxTotalMB}MB를 넘어요.`;
    else if (!confirmEl || !confirmEl.checked) why = '확인 체크를 하면 보낼 수 있어요.';
    btn.disabled = !!why;
    box.querySelector('[data-ref="send-hint"]').innerHTML = why;
  }

  async function doSend(st, box, btn) {
    const confirmEl = box.querySelector('[data-ref="confirm"]');
    if (!confirmEl || !confirmEl.checked) return;   // 확인 체크 없이는 보내지 않음
    const d = getDraft();
    const atts = selectedAtts(st, d);
    ui.busy(btn, true);
    try {
      const out = await REBOOT.api('/api/partners/email/send', {
        to: d.to, subject: d.subject, body: d.body, owner: d.owner, confirm: true,
        partner_id: d.partnerId, partner_name: d.partnerName, partner_type: d.type,
        attachment_ids: atts.map(a => a.id), reply_to: d.reply ? d.reply.historyId : null
      });
      refreshSummary();
      if (out.ok) {
        toast(`보냈어요 — ${d.partnerName || d.to}. 협업 기록에 저장했어요.`);
        const dd = getDraft();
        Object.assign(dd, { subject: '', body: '', ko: '', ai: false, reply: null, attachOff: [] });   // 다음 메일은 보관함 파일 모두 기본 체크
        saveDraft(dd);
        ui.busy(btn, false);
        if (box.isConnected) paintSub(st);
        return;
      }
      toast(`보내지 못했어요: ${out.error} (협업 기록에 '발송 실패'로 저장했어요)`, 'error');
      confirmEl.checked = false;
    } catch (e) {
      if (e.data && e.data.sent && e.data.record) {
        if (await ui.confirm(`${e.message} 기록만 다시 저장할까요?`, { ok: '기록만 다시 저장' })) {
          try {
            await REBOOT.api('/api/partners/history', { restore: e.data.record });
            toast('발송 기록을 저장했어요.');
          } catch (e2) { toast(`발송 기록을 저장하지 못했어요: ${e2.message}`, 'error'); }
        }
      } else toast(`보내지 못했어요: ${e.message}`, 'error');
      confirmEl.checked = false;
    }
    ui.busy(btn, false);
    updateSend(st, box);
  }

  /* ───────── 협업 가이드 ───────── */

  function freshGuide(type) {
    const g = D.guideDefaults[type] || D.guideDefaults[TYPES[1]];
    return { v: 1, type, products: [], purpose: '', custom: '', schedule: g.schedule, must: g.must, deliverables: g.deliverables,
      md: '', view: 'preview', ai: false, prev: '', attached: '' };
  }
  function getGuide() {
    const g = store.get(K.guide, null);
    if (!g || typeof g !== 'object' || g.v !== 1) return freshGuide(getDraft().type);   // 처음엔 메일 탭의 구분
    const out = Object.assign(freshGuide(TYPES.includes(g.type) ? g.type : TYPES[1]), g);
    if (!TYPES.includes(out.type)) out.type = TYPES[1];
    return out;
  }
  function saveGuide(g) { store.set(K.guide, g); }
  function purposeText(g, cfg) {
    if (g.purpose === '__custom') return String(g.custom || '').trim();
    const list = (cfg.guidePurposes || {})[g.type] || [];
    return g.purpose && list.includes(g.purpose) ? g.purpose : (list[0] || '');
  }

  function bannedList() {
    try {
      const c = REBOOT.use('compliance');
      const alt = {};
      c.rules().forEach(r => { alt[r.code] = r.alt; });
      const seen = new Set();
      return c.bannedTerms().filter(t => (t.verdict === 'BLOCK' || t.verdict === 'REVISE') && !seen.has(t.term.toLowerCase()) && seen.add(t.term.toLowerCase()))
        .slice(0, 40).map(t => ({ term: t.term, alt: alt[t.code] || '' }));
    } catch (e) {
      return [];
    }
  }

  function renderGuide(box, st) {
    const g = getGuide();
    const cfg = st.cfg;
    const s = cfg.status || {};
    const purposes = (cfg.guidePurposes || {})[g.type] || [];
    const current = g.purpose === '__custom' ? '__custom' : (purposes.includes(g.purpose) ? g.purpose : purposes[0]);
    const banned = bannedList();
    box.innerHTML = `
    <div class="workbench ptn-out-guide">
      <div class="stack tight">
        <section class="card">
          <div class="card-head"><h2>협업 가이드 조건</h2>
            <div class="seg" role="group" aria-label="협업 유형">${TYPES.slice().reverse().map(t => `<button type="button" data-gtype="${esc(t)}" aria-pressed="${g.type === t}">${D.typeIcon[t]} ${esc(t)}</button>`).join('')}</div></div>
          <div class="field"><span class="field-label">협업 개요 · 제품 <small class="muted">(여러 개 선택 · 안 고르면 전체)</small></span>
            <div class="chips" role="group" aria-label="제품">${(cfg.products || []).map(p => `<button type="button" class="chip" data-gproduct="${esc(p.id)}" aria-pressed="${(g.products || []).includes(p.id)}" title="${esc(p.form)}">${esc(p.name)}</button>`).join('') || '<span class="small muted">설정 › 팩트시트에 제품이 없어요.</span>'}</div></div>
          <div class="field"><span class="field-label">협업 목적</span>
            <div class="chips" role="group" aria-label="협업 목적">${purposes.map(p => `<button type="button" class="chip" data-purpose="${esc(p)}" aria-pressed="${current === p}">${esc(p)}</button>`).join('')}
              <button type="button" class="chip" data-purpose="__custom" aria-pressed="${current === '__custom'}">직접 입력</button></div>
            <input class="input mt-8" data-g="custom" value="${esc(g.custom)}" placeholder="협업 목적을 직접 입력" maxlength="200"${current === '__custom' ? '' : ' hidden'}></div>
          <label class="field"><span>일정</span><textarea class="input" rows="4" data-g="schedule">${esc(g.schedule)}</textarea></label>
          <label class="field"><span>필수 전달사항</span><textarea class="input" rows="4" data-g="must">${esc(g.must)}</textarea></label>
          <label class="field"><span>결과물 · 제출 기준</span><textarea class="input" rows="3" data-g="deliverables">${esc(g.deliverables)}</textarea></label>
          <div class="flex wrap mt-16">
            <button type="button" class="btn lime" data-act="g-generate"${s.openai ? '' : ' disabled'}>협업 가이드 초안 생성</button>
            <span class="hint">${s.openai ? '구성은 고정이에요 (오른쪽). 금지 표현은 Do & Don\'t 표에 들어가요.' : `${settingsLink}에서 OpenAI 키를 넣으면 쓸 수 있어요 · 아래 원문 편집에서 직접 써도 돼요.`}</span>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>협업 가이드 <span class="tiny muted">같은 조건으로 만드는</span></h2><span data-ref="g-badge">${g.ai ? badge('AI 초안 · 참고용', 'purple') : ''}</span></div>
          <div class="linetabs" role="group" aria-label="보기">
            <button type="button" data-gview="preview" aria-pressed="${g.view !== 'edit'}">문서 미리보기</button>
            <button type="button" data-gview="edit" aria-pressed="${g.view === 'edit'}">원문 편집</button>
          </div>
          <div class="mt-16" data-ref="g-view"></div>
          <div class="flex wrap mt-16">
            <button type="button" class="btn soft small" data-act="g-en"${s.openai ? '' : ' disabled'}>영어로 번역</button>
            <button type="button" class="btn soft small" data-act="g-ko"${s.openai ? '' : ' disabled'}>한국어로 번역</button>
            <button type="button" class="btn ghost small" data-act="g-undo"${g.prev ? '' : ' hidden'}>↶ 번역 전으로</button>
          </div>
          <details class="ptn-out-gcheck mt-16">
            <summary>문구 심의</summary>
            <label class="check mt-8"><input type="checkbox" data-ref="g-exclude" checked> 'Do &amp; Don't' 표는 빼고 심의 (금지 표현 예시가 들어 있어 항상 걸림)</label>
            <div><button type="button" class="btn small soft mt-8" data-act="g-check">문구 심의</button></div>
            <div class="mt-8" data-ref="g-findings"></div>
          </details>
          <div class="flex wrap mt-16 ptn-out-gactions">
            <button type="button" class="btn lime" data-act="g-attach">이메일에 첨부하기</button>
            ${ui.fileActions(
              ui.fileBtn('download', { label: '가이드 다운로드', type: 'Word', act: 'g-docx' }) +
              ui.fileBtn('download', { label: '가이드 다운로드', type: 'MD', act: 'g-md' }))}
          </div>
          <div data-ref="g-attached">${g.attached ? attachedNote(g.attached) : ''}</div>
          <p class="panel-note mt-8">첨부하면 REBOOT_${esc(g.type)}_협업가이드_날짜.docx로 첨부파일 보관함에 저장되고, 메일 작성 탭에서 체크된 상태로 함께 보내져요. 다운로드는 보관함에 저장하지 않아요.</p>
        </section>
      </div>

      <aside class="stack tight ptn-out-aside">
        <section class="card tinted">
          <div class="card-head"><h2>가이드 구성 (고정)</h2></div>
          <ol class="ptn-out-sections">${(cfg.guideSections || []).map(x => `<li><b>${esc(x.title)}</b><small>${esc(x.how)}</small></li>`).join('')}</ol>
        </section>
        <section class="card">
          <div class="card-head"><h2>Do &amp; Don't 기준</h2>${badge('컴플라이언스', 'blue')}</div>
          <p class="small">금지·수정 표현 ${fmt.num(banned.length)}개와 대신 쓸 표현을 AI에 넘겨 Don't 칸에 넣어요.</p>
          <div class="ptn-out-terms mt-8">${banned.slice(0, 14).map(t => `<span class="ptn-out-term">${esc(t.term)}</span>`).join('') || '<span class="small muted">컴플라이언스 탭을 불러오지 못했어요.</span>'}</div>
          <p class="panel-note mt-8">Word 서식: 표지(제목·발행일) · 브랜드 색 머리행 표 · 요약 콜아웃 · 머리글 REBOOT · 바닥글 Confidential · 페이지 번호 · 맑은 고딕</p>
        </section>
      </aside>
    </div>`;
    paintGuideView(box);
    wireGuide(st, box);
  }

  function attachedNote(name) {
    return `<p class="note lime mt-16">${esc(name)} — 첨부파일 보관함에 넣었어요 (메일 작성 탭에서 체크됨). <button type="button" class="link" data-act="g-tocompose">메일 작성으로</button></p>`;
  }

  function paintGuideView(box) {
    const g = getGuide();
    const view = box.querySelector('[data-ref="g-view"]');
    box.querySelectorAll('[data-gview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gview === (g.view === 'edit' ? 'edit' : 'preview'))));
    if (g.view === 'edit') {
      view.innerHTML = `<textarea class="input mono ptn-out-mdedit" rows="24" data-g="md" aria-label="가이드 Markdown 원문" placeholder="# REBOOT 협업 가이드&#10;&#10;## 1. 한 줄 요약&#10;> …">${esc(g.md)}</textarea>`;
    } else {
      // 미리보기에서 바로 고치기: 문서를 눌러 고치면 Markdown 원문으로 바꿔 저장 (Word 변환 · 문구 점검이 그대로 씀)
      view.innerHTML = g.md.trim()
        ? `<p class="small muted mb-8">문서를 눌러 바로 고칠 수 있어요. 표 칸 · 제목 · 문단 모두 돼요. 줄 추가 · 표 모양 바꾸기는 원문 편집에서 하세요.</p>
           <article class="prose ptn-out-prose ptn-out-editable" contenteditable="true" spellcheck="false" data-gedit aria-label="가이드 문서 (바로 수정)">${ui.markdown(g.md)}</article>`
        : ui.empty('아직 협업 가이드가 없어요. 위에서 협업 가이드 초안 생성을 눌러 시작하거나 원문 편집에서 직접 쓰세요.', 'doc');
    }
  }

  /* 미리보기 HTML → Markdown (가이드에 쓰는 모양만: 제목 · 문단 · 인용 · 목록 · 표 · 굵게/기울임 · 코드 · 링크 · 구분선) */
  function inlineMd(node) {
    return Array.from(node.childNodes).map(n => {
      if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
      if (n.nodeType !== 1) return '';
      const tag = n.tagName.toLowerCase();
      const inner = inlineMd(n);
      if (tag === 'br') return '  \n';
      if (!inner.trim()) return inner;
      if (tag === 'strong' || tag === 'b') return `**${inner.trim()}**`;
      if (tag === 'em' || tag === 'i') return `*${inner.trim()}*`;
      if (tag === 'code') return '`' + n.textContent + '`';
      if (tag === 'a') return `[${inner.trim()}](${n.getAttribute('href') || ''})`;
      return inner;
    }).join('');
  }
  function blockMd(el) {
    const out = [];
    Array.from(el.children).forEach(n => {
      const tag = n.tagName.toLowerCase();
      const h = tag.match(/^h([1-6])$/);
      if (h) out.push('#'.repeat(+h[1]) + ' ' + inlineMd(n).trim());
      else if (tag === 'p') out.push(inlineMd(n).trim());
      else if (tag === 'blockquote') out.push(blockMd(n).split('\n').map(l => '> ' + l).join('\n'));
      else if (tag === 'ul' || tag === 'ol') {
        out.push(Array.from(n.children).map((li, i) => `${tag === 'ol' ? (i + 1) + '.' : '-'} ${inlineMd(li).trim()}`).join('\n'));
      } else if (tag === 'table') {
        const rows = Array.from(n.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => inlineMd(c).trim().replace(/\|/g, '\\|')));
        if (rows.length) {
          const line = r => `| ${r.join(' | ')} |`;
          out.push([line(rows[0]), line(rows[0].map(() => '---'))].concat(rows.slice(1).map(line)).join('\n'));
        }
      } else if (tag === 'hr') out.push('---');
      else if (tag === 'pre') out.push('```\n' + n.textContent.replace(/\n$/, '') + '\n```');
      else if (tag === 'div') { const inner = blockMd(n); if (inner) out.push(inner); }
      else { const t = inlineMd(n).trim(); if (t) out.push(t); }
    });
    return out.filter(x => x.trim()).join('\n\n');
  }

  function stripDoDont(md) {
    const out = [];
    let skip = 0;
    String(md || '').split('\n').forEach(line => {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        if (skip && m[1].length <= skip) skip = 0;
        if (!skip && /do\s*&(amp;)?\s*don['’]?t|표현 가이드/i.test(m[2])) { skip = m[1].length; return; }
      }
      if (!skip) out.push(line);
    });
    return out.join('\n');
  }

  function wireGuide(st, box) {
    let editTimer = null;
    box.addEventListener('input', e => {
      const ed = e.target.closest && e.target.closest('[data-gedit]');
      if (ed) {
        // 미리보기에서 고친 내용 → 잠깐 기다렸다가 Markdown으로 저장 (입력마다 바꾸면 느려짐)
        clearTimeout(editTimer);
        editTimer = setTimeout(() => {
          const g = getGuide();
          g.md = blockMd(ed) + '\n';
          g.prev = '';
          const u = box.querySelector('[data-act="g-undo"]');
          if (u) u.hidden = true;
          saveGuide(g);
        }, 400);
        return;
      }
      const f = e.target.dataset && e.target.dataset.g;
      if (!f) return;
      const g = getGuide();
      g[f] = e.target.value;
      if (f === 'md') { g.prev = ''; const u = box.querySelector('[data-act="g-undo"]'); if (u) u.hidden = true; }
      saveGuide(g);
    });
    box.addEventListener('click', e => {
      const t = e.target;
      const gt = t.closest('[data-gtype]');
      if (gt) return switchGuideType(st, box, gt.dataset.gtype);
      const gp = t.closest('[data-gproduct]');
      if (gp) {
        const g = getGuide();
        const id = gp.dataset.gproduct;
        const set = new Set(Array.isArray(g.products) ? g.products : []);
        if (set.has(id)) set.delete(id); else set.add(id);
        g.products = [...set];
        saveGuide(g);
        gp.setAttribute('aria-pressed', String(set.has(id)));
        return;
      }
      const pp = t.closest('[data-purpose]');
      if (pp) {
        const g = getGuide();
        g.purpose = pp.dataset.purpose;
        saveGuide(g);
        box.querySelectorAll('[data-purpose]').forEach(b => b.setAttribute('aria-pressed', String(b === pp)));
        const inp = box.querySelector('[data-g="custom"]');
        inp.hidden = g.purpose !== '__custom';
        if (!inp.hidden) inp.focus();
        return;
      }
      const gv = t.closest('[data-gview]');
      if (gv) {
        const g = getGuide();
        g.view = gv.dataset.gview === 'edit' ? 'edit' : 'preview';
        saveGuide(g);
        paintGuideView(box);
        return;
      }
      const b = t.closest('[data-act]');
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'g-generate') guideGenerate(st, box, b);
      else if (a === 'g-en' || a === 'g-ko') guideTranslate(box, b, a === 'g-en' ? 'en' : 'ko');
      else if (a === 'g-undo') {
        const g = getGuide();
        if (!g.prev) return;
        g.md = g.prev;
        g.prev = '';
        saveGuide(g);
        b.hidden = true;
        paintGuideView(box);
      } else if (a === 'g-check') guideCheck(box);
      else if (a === 'g-attach') guideDocx(st, box, b, true);
      else if (a === 'g-docx') guideDocx(st, box, b, false);
      else if (a === 'g-md') {
        const g = getGuide();
        if (!g.md.trim()) return toast('내려받을 협업 가이드가 없어요.', 'error');
        ui.download(`reboot-partners-guide-${REBOOT.today().replace(/-/g, '')}.md`, g.md, 'text/markdown;charset=utf-8');
      } else if (a === 'g-tocompose') {
        const d = getDraft();
        d.sub = 'compose';
        saveDraft(d);
        paintSub(st);
      }
    });
  }

  function switchGuideType(st, box, type) {
    if (!TYPES.includes(type)) return;
    const g = getGuide();
    if (g.type === type) return;
    const old = D.guideDefaults[g.type] || {};
    const neu = D.guideDefaults[type] || {};
    ['schedule', 'must', 'deliverables'].forEach(k => { if (!String(g[k] || '').trim() || g[k] === old[k]) g[k] = neu[k]; });   // 손대지 않은 칸만 바꿈
    g.type = type;
    if (g.purpose !== '__custom') g.purpose = '';
    saveGuide(g);
    renderGuide(fresh(box), st);
  }

  async function guideGenerate(st, box, btn) {
    const g = getGuide();
    const purpose = purposeText(g, st.cfg);
    if (!purpose) return toast('협업 목적을 고르거나 입력하세요.', 'error');
    if (g.md.trim() && !(await ui.confirm('지금 협업 가이드를 새 AI 초안으로 바꿀까요?', { ok: '바꾸기' }))) return;
    ui.busy(btn, true);
    try {
      const out = await REBOOT.api('/api/partners/guide/generate', {
        type: g.type, product_ids: g.products || [], purpose, schedule: g.schedule, must_include: g.must, deliverables: g.deliverables, banned: bannedList()
      });
      const gg = getGuide();
      Object.assign(gg, { md: out.markdown, ai: true, prev: '', view: 'preview', attached: '' });
      saveGuide(gg);
      if (box.isConnected) {
        box.querySelector('[data-ref="g-badge"]').innerHTML = badge('AI 초안 · 참고용', 'purple');
        box.querySelector('[data-ref="g-attached"]').innerHTML = '';
        const u = box.querySelector('[data-act="g-undo"]');
        if (u) u.hidden = true;
        paintGuideView(box);
      }
      toast('협업 가이드 초안을 만들었어요. 미리보기에서 확인하고 원문 편집에서 고치세요.');
    } catch (e) {
      toast(`협업 가이드 초안을 만들지 못했어요: ${e.message}`, 'error');
    } finally {
      ui.busy(btn, false);
    }
  }

  async function guideTranslate(box, btn, to) {
    const g = getGuide();
    if (!g.md.trim()) return toast('번역할 협업 가이드가 없어요.', 'error');
    ui.busy(btn, true);
    try {
      const out = await REBOOT.api('/api/partners/translate', { text: g.md, to });
      const gg = getGuide();
      Object.assign(gg, { prev: gg.md, md: out.text, ai: true, attached: '' });
      saveGuide(gg);
      if (box.isConnected) {
        const u = box.querySelector('[data-act="g-undo"]');
        if (u) u.hidden = false;
        box.querySelector('[data-ref="g-badge"]').innerHTML = badge('AI 번역 · 참고용', 'purple');
        paintGuideView(box);
      }
      toast(to === 'en' ? '영어로 번역했어요.' : '한국어로 번역했어요.');
    } catch (e) {
      toast(`번역하지 못했어요: ${e.message}`, 'error');
    } finally {
      ui.busy(btn, false);
    }
  }

  function guideCheck(box) {
    const g = getGuide();
    if (!g.md.trim()) return toast('심의할 협업 가이드가 없어요.', 'error');
    const exclude = box.querySelector('[data-ref="g-exclude"]').checked;
    const r = complianceReview(exclude ? stripDoDont(g.md) : g.md);
    const v = r ? (VERDICT[r.verdict] || [r.verdict, '']) : null;
    box.querySelector('[data-ref="g-findings"]').innerHTML = (v ? `<p class="mb-8">${badge(v[0], v[1])}</p>` : '') + findingsHtml(r, '협업 가이드') +
      '<p class="panel-note mt-8">B2B 기준 · 1차 참고용이고, 걸린 표현 없음은 법적 승인이 아니에요. 최종 판단은 담당자가 해요.</p>';
  }

  async function guideDocx(st, box, btn, attach) {
    const g = getGuide();
    if (!g.md.trim()) return toast('협업 가이드 내용이 없어요. 먼저 초안을 만들거나 원문을 입력하세요.', 'error');
    const body = { markdown: g.md, type: g.type, purpose: purposeText(g, st.cfg), attach };
    ui.busy(btn, true);
    try {
      if (attach) {
        const out = await REBOOT.api('/api/partners/guide/docx', body);
        const gg = getGuide();
        gg.attached = out.attachment.name;
        saveGuide(gg);
        const d = getDraft();
        d.attachOff = (d.attachOff || []).filter(x => x !== out.attachment.id);
        saveDraft(d);
        if (box.isConnected) box.querySelector('[data-ref="g-attached"]').innerHTML = attachedNote(out.attachment.name);
        toast('협업 가이드를 Word로 만들어 첨부파일 보관함에 넣었어요.' + ((out.replaced || []).length ? ' (같은 이름의 예전 가이드는 새 파일로 바꿨어요)' : ''));
      } else {
        const res = await REBOOT.api('/api/partners/guide/docx', body, { raw: true });
        ui.download(`reboot-partners-guide-${REBOOT.today().replace(/-/g, '')}.docx`, await res.blob());
      }
    } catch (e) {
      toast(`Word 파일을 만들지 못했어요: ${e.message}`, 'error');
    } finally {
      ui.busy(btn, false);
    }
  }

  /* ───────── 공개 ───────── */

  function render(el, view) {
    el.classList.add('ptn-out');
    if (view === 'mail') return renderMail(el);
    return renderContacts(el);
  }

  REBOOT.expose('partners.outreach', { render, compose, openReply, openImport });
})(typeof window !== 'undefined' ? window : globalThis);
