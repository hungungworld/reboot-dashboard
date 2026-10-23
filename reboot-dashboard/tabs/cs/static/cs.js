/* 고객 응대(CS) 파트: 문의함 · 분류 · 답변 초안 · 컴플라이언스 재검사 · 최종 승인 · 부작용 접수 · 템플릿.
   답변은 자동으로 보내지 않습니다. Gmail은 답장 초안까지만 만들고, 실제 발송은 사람이 합니다.
   다른 파트에는 REBOOT.use('cs')로 stats · classify만 공개합니다. */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  const DATA = global.REBOOT_DATA && global.REBOOT_DATA.cs;
  if (!REBOOT || !DATA) throw new Error('cs: REBOOT core와 tabs/cs/static/data.js를 먼저 불러와야 합니다');

  const store = REBOOT.store('cs');   // 저장 키: reboot:cs:*
  const KEY = { inquiries: 'inquiries', adverse: 'adverse-events' };
  const HOUR = 3600 * 1000;
  const TYPES = {};
  DATA.types.forEach(t => { TYPES[t.code] = t; });
  const DONE = ['발송 완료', '종결'];
  const TODO_RE = /\[확인 필요[^\]]*\]/g;
  const LABEL = { BLOCK: '사용 불가', REVISE: '수정 필요', COND: '조건부', REVIEW: '검토 필요', PASS: '규칙 미탐지' };
  const PLACEHOLDER = {
    name: '고객 이름', orderNo: '주문번호', tracking: '운송장 번호', eta: '도착 예정일', brand: '브랜드명',
    product: '제품명', flavor: '제품 팩트시트의 맛', ingredients: '제품 팩트시트의 성분', allergens: '제품 팩트시트의 알레르기 성분'
  };

  /* ───────── 분류 ───────── */

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function termPattern(term) {
    const body = escapeRe(term).replace(/-|\s+/g, '[\\s-]*').replace(/'/g, "['’]?");
    return '(?<![A-Za-z0-9])' + body + '(?:s|es|d|ed|ing)?(?![A-Za-z0-9])';
  }

  const KEYWORDS = {};
  DATA.types.forEach(t => {
    KEYWORDS[t.code] = { re: t.keywords.map(k => new RegExp(termPattern(k), 'i')), ko: t.keywordsKo || [] };
  });

  /** 제목·본문 키워드로 C1~C10 분류. 순서: C1 → C9 → C8 → C10 → C2 → C3 → C4 → C5 → C7 → C6, 없으면 C10 */
  function classify(text) {
    const s = String(text == null ? '' : text);
    for (const code of DATA.classifyOrder) {
      const k = KEYWORDS[code];
      if (k.re.some(re => re.test(s)) || k.ko.some(w => s.includes(w))) return code;
    }
    return DATA.fallbackType;
  }

  /* ───────── 초안 ───────── */

  const PRODUCTS = DATA.products || [];
  function productInfo(id) { return PRODUCTS.find(p => p.id === id) || null; }
  function productKo(id) { const p = productInfo(id); return p ? p.ko : '제품 미확인'; }

  /** 문의 본문으로 제품 추정 (data.js productHints 순서) */
  function detectProduct(text) {
    const s = String(text || '');
    const hit = (DATA.productHints || []).find(h => new RegExp(h.re, 'i').test(s));
    return hit ? hit.id : '';
  }

  /** 템플릿 빈칸 값: 제품 사실(data.js products) → 설정 파트 팩트시트(값이 있으면 우선).
      확정 안 된 값(내부 제품명 미정 · 맛 임시)은 [확인 필요]로 남겨 최종 승인을 막음 */
  function facts(inq) {
    let s = {};
    try { s = REBOOT.use('settings').facts() || {}; } catch (e) { s = {}; }
    const p = inq ? productInfo(inq.product) : null;
    const out = { brand: (DATA.brand || {}).name || null };
    if (inq) {
      out.product = !p ? '[확인 필요: 문의한 제품 (젤리·저당 젤리·음료·저당 음료)]'
        : p.en || `[확인 필요: ${p.ko} 영문 제품명 (저당 표기는 컴플라이언스 R11·R12 확인)]`;
      out.flavor = !p ? null : p.flavorsFinal ? p.flavors.join(', ') : `[확인 필요: ${p.ko} 맛 확정 (임시: ${p.flavors.join(', ')})]`;
      out.pack = p ? p.pack : null;
      out.unit = p ? p.unit : null;
    }
    Object.keys(s).forEach(k => { if (s[k] != null && String(s[k]).trim() !== '') out[k] = s[k]; });
    return out;
  }

  function fill(template, inq) {
    const values = Object.assign({}, facts(inq), { name: inq.name, orderNo: inq.orderNo, tracking: inq.tracking, eta: inq.eta });
    return template.replace(/\{(\w+)\}/g, (m, k) => {
      const v = values[k];
      return v != null && String(v).trim() !== '' ? String(v) : `[확인 필요: ${PLACEHOLDER[k] || k}]`;
    });
  }

  function draftFor(inq) { return fill(TYPES[inq.type].template, inq); }

  function pendingTodos(text) { return String(text || '').match(TODO_RE) || []; }

  function recheck(text) {
    try { return REBOOT.use('compliance').review(text, { channel: 'cs' }); } catch (e) { return null; }
  }

  /** 최종 승인 전에 모두 통과해야 하는 조건 */
  function gates(inq, r) {
    const t = TYPES[inq.type];
    const todos = pendingTodos(inq.draft);
    const list = [
      { id: 'block', ok: !!r && r.verdict !== 'BLOCK',
        label: !r ? '컴플라이언스 재검사를 할 수 없음 (컴플라이언스 파트 확인)' : r.verdict === 'BLOCK' ? 'BLOCK 표현 있음 → 문장 수정 필요' : 'BLOCK 표현 없음' },
      { id: 'todo', ok: todos.length === 0, label: todos.length ? `[확인 필요] ${todos.length}곳 남음` : '[확인 필요] 없음' }
    ];
    if (t.ownerRequired) list.push({ id: 'owner', ok: !!inq.ownerChecked, label: `지정 담당(${t.owner}) 추가 검토` });
    if (r && (r.verdict === 'REVISE' || r.verdict === 'REVIEW') && DATA.approvalPolicy.reviseNeedsComment) {
      list.push({ id: 'comment', ok: !!(inq.pendingComment || '').trim(), label: `${r.verdict} 판정 → 승인 의견 입력 (정할 것 #7 확정 전 임시 기준)` });
    }
    return list;
  }

  /* ───────── 저장 ───────── */

  function seed() {
    const now = Date.now();
    return DATA.dummyInquiries.map(d => {
      const type = classify(d.subject + '\n' + d.body);
      const inq = {
        id: d.id, name: d.name, from: d.from, subject: d.subject, body: d.body,
        orderNo: d.orderNo || '', tracking: d.tracking || '', eta: d.eta || '',
        receivedAt: Math.round(now - d.hoursAgo * HOUR), type, typeAuto: type, product: detectProduct(`${d.subject} ${d.body}`),
        status: '답변 대기', draft: '', edited: false, ownerChecked: false, pendingComment: '',
        approval: null, dummy: true, log: []
      };
      inq.draft = draftFor(inq);
      return inq;
    });
  }

  function load() {
    let list = store.get(KEY.inquiries, null);
    if (!Array.isArray(list)) { list = seed(); store.set(KEY.inquiries, list); }
    return list.filter(i => TYPES[i.type]);
  }

  function patch(id, fn) {
    const list = load();
    const inq = list.find(x => x.id === id);
    if (!inq) return null;
    fn(inq);
    store.set(KEY.inquiries, list);
    return inq;
  }

  function logTo(inq, msg) { inq.log = (inq.log || []).concat({ at: Date.now(), msg }).slice(-50); }

  function loadAdverse() {
    const list = store.get(KEY.adverse, []);
    return Array.isArray(list) ? list : [];
  }

  function isOpen(i) { return !DONE.includes(i.status); }
  function due(i) { return i.receivedAt + TYPES[i.type].dueHours * HOUR; }

  /* ───────── 화면 도우미 ───────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmt(ts) {
    return ts ? new Date(ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function span(ms) {
    const m = Math.max(0, Math.round(Math.abs(ms) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
  }
  function dueText(i) {
    if (!isOpen(i)) return '처리됨';
    const left = due(i) - Date.now();
    return left < 0 ? `기한 ${span(left)} 초과` : `${span(left)} 남음`;
  }
  function badge(v) {
    if (!LABEL[v]) return `<span class="cs-badge">${esc(v)}</span>`;
    return `<span class="cs-badge cs-v-${v}">${v} · ${LABEL[v]}</span>`;
  }
  // 선 아이콘 (시안과 같은 1.65 두께 스트로크)
  const ICON_PATH = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5L12 8Z"/>'
  };
  function icon(name) {
    return `<svg class="cs-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATH[name] || ''}</svg>`;
  }
  /* 서버 (Flask · tabs/cs/): Gmail 읽기·답장 초안은 같은 주소의 /api로만 부릅니다 (토큰은 서버에만).
     file://로 열었거나 서버가 꺼져 있으면 serverHealth()가 null → Gmail 버튼만 꺼짐 */
  let healthP = null;
  function serverHealth() {
    if (!healthP) {
      healthP = /^https?:$/.test(global.location ? global.location.protocol : '')
        ? fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) })
          .then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null);
    }
    return healthP;
  }
  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, body === undefined ? { cache: 'no-store' } : {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data;
  }

  /** Gmail 메일 → 문의. 보낸 사람 표시 이름은 테스트 계정 주인 이름이라 본문 끝 서명을 고객 이름으로 씀 */
  function fromGmail(m) {
    const lines = String(m.body || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
    const sign = lines.slice(-3).reverse().find(s => /^[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){1,3}$/.test(s)
      && !/^(Thanks|Thank you|Best|Regards)/i.test(s)
      && !/\b(Manager|Director|Owner|Founder|CEO|Team|Buyer|Inc|LLC|Ltd|Co)\b/i.test(s));   // 서명 아래 직함·회사명은 건너뜀
    const addr = (String(m.from).match(/<([^>]+)>/) || [])[1] || String(m.from);
    const order = (String(m.body).match(/Order(?: number)?:\s*([A-Z0-9-]{4,})/i) || [])[1] || '';
    const type = classify(`${m.subject}\n${m.body}`);
    const inq = {
      id: `GM-${m.id}`, name: sign || addr.split('@')[0], from: addr, subject: m.subject || '(제목 없음)', body: m.body || '',
      orderNo: order, tracking: '', eta: '',
      receivedAt: m.received_ms || Date.parse(m.date) || Date.now(), type, typeAuto: type, product: detectProduct(`${m.subject} ${m.body}`),
      status: '답변 대기', draft: '', edited: false, ownerChecked: false, pendingComment: '',
      approval: null, dummy: false, source: 'gmail', gmailId: m.id, threadId: m.thread_id, log: []
    };
    inq.draft = draftFor(inq);
    logTo(inq, 'Gmail에서 불러옴');
    return inq;
  }

  const PERSONA = DATA.persona || {};

  function aiNotesHTML(inq) {
    return `<div class="cs-ainotes">
  <p class="cs-ainotes-head">${icon('spark')} ${esc(PERSONA.name || 'AI')}가 다듬은 초안 · ${fmt(inq.aiDraftAt)} · 재검사·최종 승인 전 확인할 것</p>
  <ul>${(inq.aiNotes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  ${inq.prevDraft ? '<button type="button" class="cs-btn cs-btn-sm" data-act="ai-undo">이전 초안으로 되돌리기</button>' : ''}
</div>`;
  }

  /** 페르소나로 초안 다듬기 → 초안 교체 (이전 초안은 되돌리기용으로 보관), 승인은 풀림 */
  async function runAiDraft(ui, btn) {
    const inq = load().find(x => x.id === ui.selected);
    if (!inq || DONE.includes(inq.status)) return;
    if (inq.edited && !inq.aiDraftAt && !global.confirm('직접 고친 초안을 바탕으로 AI가 다시 씁니다. 계속할까요? (되돌리기 가능)')) return;
    let banned = [];
    try { banned = REBOOT.use('compliance').bannedTerms().map(b => b.term); } catch (e) { banned = []; }
    const box = ui.root.querySelector('[data-el="ainotes"]');
    btn.disabled = true;
    box.innerHTML = `<p class="cs-muted">${icon('spark')} ${esc(PERSONA.name || 'AI')}가 초안을 다듬는 중입니다… (보통 10~30초)</p>`;
    try {
      const t = TYPES[inq.type];
      const res = await api('/api/cs/ai-draft', {
        persona: PERSONA,
        inquiry: { type: inq.type, typeName: t.name, name: inq.name, orderNo: inq.orderNo, subject: inq.subject, body: inq.body },
        current: inq.draft, banned,
        facts: Object.assign({}, facts(inq), {
          inquiry_product: inq.product ? productKo(inq.product) : 'unknown — ask the customer which product if it matters',
          line_up: PRODUCTS.map(p => `${p.ko} (${p.form}; flavors ${p.flavorsFinal ? '' : 'tentative '}${p.flavors.join('/')}; ${p.pack}${p.sugarReduced ? '; sugar-reduced recipe — do not say "low sugar"; no sugar claims until verified' : ''})`).join(' | '),
          slogan: (DATA.brand || {}).slogan || ''
        })
      });
      patch(inq.id, x => {
        x.prevDraft = x.draft;
        x.draft = res.draft;
        x.edited = true;
        x.aiDraftAt = Date.now();
        x.aiNotes = res.notes_ko || [];
        if (x.status === '승인') { x.approval = null; }
        if (x.status === '답변 대기' || x.status === '승인') x.status = '검토 중';
        logTo(x, `AI 초안 다듬기 (${PERSONA.name || '페르소나'})`);
      });
      toast('AI가 초안을 다듬었습니다. 재검사 결과와 [확인 필요]를 확인한 뒤 승인하세요.');
      renderDetail(ui);
      renderList(ui);
    } catch (e) {
      box.innerHTML = `<p class="cs-warn">AI 초안 실패: ${esc(e.message)}</p>`;
      btn.disabled = false;
    }
  }

  function initials(name) {
    const w = String(name || '').trim().split(/\s+/).filter(x => /^\p{L}/u.test(x));   // 'Customer 02'의 숫자는 빼고 글자로 시작하는 단어만
    return esc(((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase());
  }
  function toast(msg) {
    if (REBOOT.ui && typeof REBOOT.ui.toast === 'function') REBOOT.ui.toast(msg);
  }
  // <input type="datetime-local">용 현지 시각 문자열
  function toLocalInput(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  /* 한글 번역 (참고용): 번역 엔진은 컴플라이언스 파트의 translate()를 빌려 씀 (기기 안 번역, 없으면 Google 번역 링크).
     data-tr-text = 고정 원문, data-tr-from = 지금 입력 칸의 값을 번역 (예: 수정 중인 초안) */
  function trBlock(text, label, from) {
    return `<div class="cs-trblock" ${from ? `data-tr-from="${esc(from)}"` : `data-tr-text="${esc(text)}"`}>
  <button type="button" class="cs-btn cs-btn-sm cs-btn-tr" data-act="translate">${esc(label || '한글로 번역')}</button>
  <div data-tr-out aria-live="polite"></div></div>`;
  }

  async function runTranslate(root, block) {
    const btn = block.querySelector('[data-act="translate"]');
    const out = block.querySelector('[data-tr-out]');
    const src = block.dataset.trFrom
      ? ((root.querySelector(`[data-el="${block.dataset.trFrom}"]`) || {}).value || '')
      : block.dataset.trText;
    let api = null;
    try { api = REBOOT.use('compliance'); } catch (e) { api = null; }
    if (!api || typeof api.translate !== 'function') {
      out.innerHTML = '<p class="cs-warn">번역 기능은 컴플라이언스 파트가 함께 열려 있어야 합니다.</p>';
      return;
    }
    btn.disabled = true;
    out.innerHTML = '<p class="cs-muted">번역 중…</p>';
    const r = await api.translate(src, loaded => {
      out.innerHTML = `<p class="cs-muted">번역 모델 내려받는 중… ${Math.round(loaded * 100)}% (처음 한 번만)</p>`;
    });
    btn.disabled = false;
    if (r.ok) {
      out.innerHTML = `<div class="cs-tr"><span class="cs-tr-tag">${r.engine === 'already-ko' ? '이미 한국어' : '기계 번역 · 참고용'}</span>
  <p class="cs-tr-text">${esc(r.text)}</p>
  <p class="cs-muted">뜻 확인용입니다. 재검사·승인·발송은 영어 원문 기준입니다.</p></div>`;
    } else if (r.reason === 'empty') {
      out.innerHTML = '<p class="cs-muted">번역할 내용이 없습니다.</p>';
    } else {
      const url = /^https:\/\//.test(r.fallbackUrl || '') ? r.fallbackUrl : '';
      out.innerHTML = `<p class="cs-warn">이 브라우저에서는 기기 안 번역을 쓸 수 없습니다 (Chrome 138 이상 데스크톱에서 지원).
  ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Google 번역에서 열기 ↗</a> <b>내용이 Google로 전송됩니다.</b> 실제 고객 이름·연락처·주소가 들어 있으면 열지 마세요.` : ''}</p>`;
    }
  }

  async function copyText(text) {
    try {
      await global.navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ───────── 화면 ───────── */

  const TABS = [['inbox', '문의함'], ['adverse', '부작용 접수'], ['templates', '답변 템플릿']];

  function render(root) {
    root.classList.add('part-cs');
    root.innerHTML = `
<div class="cs-wrap">
  <div class="cs-kpis" data-el="kpis" aria-label="문의 현황"></div>
  <div class="cs-tabs" role="tablist">
    ${TABS.map(([id, label], i) => `<button type="button" role="tab" class="cs-tab" data-tab="${id}" aria-selected="${i === 0}">${label}</button>`).join('')}
  </div>
  <section class="cs-panel" data-panel="inbox">
    <div class="cs-inbox">
      <div class="cs-listcol">
        <label class="cs-field"><span>보기</span><select class="cs-input" data-el="filter">
          <option value="open">미처리</option><option value="urgent">긴급 (C1)</option><option value="overdue">기한 초과</option><option value="all">전체</option></select></label>
        <div class="cs-gmailbar">
          <button type="button" class="cs-btn" data-act="gmail-import" disabled>${icon('mail')} Gmail에서 불러오기</button>
          <span class="cs-muted" data-el="gmailmsg" aria-live="polite"></span>
        </div>
        <ul class="cs-list" data-el="list"></ul>
      </div>
      <div class="cs-detail" data-el="detail"><p class="cs-muted">왼쪽에서 문의를 고르세요.</p></div>
    </div>
  </section>
  <section class="cs-panel" data-panel="adverse" hidden></section>
  <section class="cs-panel" data-panel="templates" hidden></section>
</div>`;

    const ui = { root, selected: null, filter: 'open', approver: '', adverseDraft: null };
    const panel = name => root.querySelector(`[data-panel="${name}"]`);
    ui.showTab = name => {
      root.querySelectorAll('.cs-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
      root.querySelectorAll('.cs-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
      if (name === 'inbox') { renderList(ui); renderDetail(ui); }
      if (name === 'adverse') renderAdverse(ui, panel('adverse'));
      if (name === 'templates') renderTemplates(panel('templates'));
    };
    root.querySelectorAll('.cs-tab').forEach(b => b.addEventListener('click', () => ui.showTab(b.dataset.tab)));
    root.addEventListener('click', e => {
      const tr = e.target.closest('[data-act="translate"]');
      if (tr && !tr.disabled) runTranslate(root, tr.closest('.cs-trblock'));
    });

    root.querySelector('[data-el="filter"]').addEventListener('change', e => { ui.filter = e.target.value; renderList(ui); });

    // Gmail에서 불러오기: 이미 있는 문의(같은 Gmail 번호)는 건드리지 않고 새 메일만 추가
    const gmailBtn = root.querySelector('[data-act="gmail-import"]');
    const gmailMsg = root.querySelector('[data-el="gmailmsg"]');
    serverHealth().then(h => {
      ui.gmail = !!(h && h.gmail);
      gmailBtn.disabled = !ui.gmail;
      gmailMsg.textContent = !h ? '서버 상태를 확인하지 못했습니다 (새로고침)' : !h.gmail ? 'Gmail 로그인 필요 (설정 › 연결 › Google로 로그인)' : '';
      if (ui.selected) renderDetail(ui);   // 승인된 문의의 'Gmail 답장 초안' 버튼 상태 갱신
    });
    gmailBtn.addEventListener('click', async () => {
      gmailBtn.disabled = true;
      gmailMsg.textContent = '불러오는 중…';
      try {
        const { items } = await api('/api/cs/gmail/inquiries');
        const list = load();
        const have = new Set(list.map(i => i.id));
        const fresh = (items || []).filter(m => !have.has(`GM-${m.id}`)).map(fromGmail);
        if (fresh.length) store.set(KEY.inquiries, fresh.concat(list));
        gmailMsg.textContent = `메일 ${(items || []).length}건 확인 · 새 문의 ${fresh.length}건`;
        toast(fresh.length ? `Gmail에서 새 문의 ${fresh.length}건을 불러왔습니다.` : '새 문의가 없습니다.');
        const shown = renderList(ui);
        if (fresh.length && shown[0]) { ui.selected = shown[0].id; renderList(ui); renderDetail(ui); }
      } catch (e) {
        toast(`Gmail 불러오기 실패: ${e.message}`);
        gmailMsg.textContent = e.message;
      }
      gmailBtn.disabled = false;
    });
    root.querySelector('[data-el="list"]').addEventListener('click', e => {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      ui.selected = btn.dataset.id;
      renderList(ui);
      renderDetail(ui);
    });
    wireDetail(ui);

    // 처음 열 때는 맨 위 문의를 바로 보여 줌 (시안처럼 목록 + 상세가 함께 보이게)
    const shown = renderList(ui);
    if (shown[0]) { ui.selected = shown[0].id; renderList(ui); renderDetail(ui); }
  }

  /** 상단 KPI 카드 4장 */
  function paintKpis(ui) {
    const s = stats();
    const cards = [
      { label: '답변 대기', icon: 'mail', value: s.open, sub: '<b>미처리</b>발송·종결 전 문의', featured: true },
      { label: '긴급 확인', icon: 'alert', value: s.urgent, sub: '<b>C1</b>건강·부작용 문의' },
      { label: '기한 초과', icon: 'clock', value: s.overdue, sub: '<b>응답 기한</b>지난 문의', alert: s.overdue > 0 },
      { label: '담당 확인 대기', icon: 'shield', value: s.owner_required, sub: '<b>지정 담당</b>추가 검토 필요' }
    ];
    ui.root.querySelector('[data-el="kpis"]').innerHTML = cards.map(c => `
<div class="cs-kpi${c.featured ? ' is-featured' : ''}${c.alert ? ' is-alert' : ''}">
  <div class="cs-kpi-top"><span>${c.label}</span><span class="cs-kpi-icon">${icon(c.icon)}</span></div>
  <div class="cs-kpi-num">${c.value}<small>건</small></div>
  <div class="cs-kpi-sub">${c.sub}</div>
</div>`).join('');
  }

  /* 문의함 목록 */

  function renderList(ui) {
    const all = load();
    const now = Date.now();
    paintKpis(ui);

    const shown = all.filter(i => {
      if (ui.filter === 'open') return isOpen(i);
      if (ui.filter === 'urgent') return isOpen(i) && i.type === 'C1';
      if (ui.filter === 'overdue') return isOpen(i) && now > due(i);
      return true;
    }).sort((a, b) =>
      (isOpen(b) - isOpen(a)) || ((b.type === 'C1') - (a.type === 'C1')) || (due(a) - due(b)));

    ui.root.querySelector('[data-el="list"]').innerHTML = shown.length ? shown.map(i => {
      const late = isOpen(i) && now > due(i);
      return `
<li><button type="button" class="cs-item${i.id === ui.selected ? ' is-selected' : ''}" data-id="${esc(i.id)}">
  <span class="cs-item-top"><span class="cs-avatar" aria-hidden="true">${initials(i.name)}</span>
    <span class="cs-item-name">${esc(i.name)}</span>
    <span class="cs-due${late ? ' is-late' : ''}">${dueText(i)}</span></span>
  <span class="cs-item-subject">${esc(i.subject)}</span>
  <span class="cs-item-tags"><span class="cs-type cs-type-${i.type}">${i.type} ${esc(TYPES[i.type].name)}</span><span class="cs-chip">${esc(i.status)}</span>${i.product ? `<span class="cs-chip cs-chip-dim">${esc(productKo(i.product))}</span>` : ''}</span>
</button></li>`;
    }).join('') : '<li class="cs-muted">해당하는 문의가 없습니다.</li>';
    return shown;
  }

  /* 문의 상세 */

  function renderDetail(ui) {
    const box = ui.root.querySelector('[data-el="detail"]');
    const inq = ui.selected && load().find(x => x.id === ui.selected);
    if (!inq) { box.innerHTML = '<p class="cs-muted">왼쪽에서 문의를 고르세요.</p>'; return; }
    const t = TYPES[inq.type];
    const locked = DONE.includes(inq.status);

    box.innerHTML = `
<article class="cs-card" data-id="${esc(inq.id)}">
  <div class="cs-detail-head">
    <div class="cs-chips">
      <span class="cs-type cs-type-${t.code}">${t.code} ${esc(t.name)}</span>
      <span class="cs-chip">${esc(inq.status)}</span>
      ${inq.dummy ? '<span class="cs-chip cs-chip-dim">더미 문의</span>' : ''}
      ${inq.source === 'gmail' ? '<span class="cs-chip cs-chip-dim">Gmail</span>' : ''}
    </div>
    <span class="cs-ref">#${esc(inq.id)}</span>
  </div>
  <h3 class="cs-subject">${esc(inq.subject)}</h3>
  <div class="cs-from"><span class="cs-avatar" aria-hidden="true">${initials(inq.name)}</span>
    <span><b>${esc(inq.name)}</b><small>${esc(inq.from)} → REBOOT Support · ${fmt(inq.receivedAt)}</small></span></div>
  <div class="cs-meta"><span>응답 기한 <b>${fmt(due(inq))}</b> (${dueText(inq)})</span><span>${esc(t.mode)}</span><span>담당 <b>${esc(t.owner)}</b></span><span>팀 태그 ${esc(t.tag)}</span></div>
  <blockquote class="cs-body">${esc(inq.body)}</blockquote>
  ${trBlock(`${inq.subject}\n${inq.body}`, '문의 한글 번역')}

  <div class="cs-row">
    <label class="cs-field"><span>문의 유형 (자동 분류: ${esc(inq.typeAuto)})</span>
      <select class="cs-input" data-el="type" ${locked ? 'disabled' : ''}>${DATA.types.map(x =>
        `<option value="${x.code}"${x.code === inq.type ? ' selected' : ''}>${x.code} ${esc(x.name)}</option>`).join('')}</select></label>
    <label class="cs-field"><span>제품${inq.product ? '' : ' <b class="cs-req">(미확인)</b>'}</span>
      <select class="cs-input" data-el="product" ${locked ? 'disabled' : ''}><option value="">제품 미확인</option>${PRODUCTS.map(x =>
        `<option value="${x.id}"${x.id === inq.product ? ' selected' : ''}>${esc(x.ko)} · ${esc(x.form === 'stick jelly' ? '스틱 젤리' : '비탄산 음료')}</option>`).join('')}</select></label>
    <div class="cs-actions">
      <button type="button" class="cs-btn" data-act="regen" ${locked ? 'disabled' : ''}>템플릿으로 초안 다시 만들기</button>
      ${t.code === 'C1' ? '<button type="button" class="cs-btn" data-act="to-adverse">부작용 접수 열기</button>' : ''}
    </div>
  </div>

  <div class="cs-draftbox">
    <div class="cs-draftbox-head"><b>${icon('spark')} 영문 답변 초안</b>
      <span class="cs-chips"><span class="cs-chip">${inq.aiDraftAt ? `AI · ${esc(PERSONA.name || '페르소나')}` : `${t.code} 템플릿`}</span>
        <button type="button" class="cs-btn cs-btn-sm" data-act="ai-draft" disabled
          title="${esc(`${PERSONA.name || ''} 페르소나로 문의에 맞게 다시 씁니다 · 결과는 재검사와 최종 승인을 거칩니다`)}">${icon('spark')} AI로 초안 다듬기</button></span></div>
    <textarea class="cs-input cs-draft" rows="14" data-el="draft" aria-label="영문 답변 초안" ${locked ? 'readonly' : ''}>${esc(inq.draft)}</textarea>
    <div data-el="ainotes" aria-live="polite">${inq.aiNotes && inq.aiNotes.length ? aiNotesHTML(inq) : ''}</div>
    ${trBlock('', '초안 한글 번역 (보내기 전 뜻 확인)', 'draft')}
  </div>

  <div data-el="check" aria-live="polite"></div>

  <fieldset class="cs-approve" ${locked ? 'disabled' : ''}>
    <legend>최종 승인</legend>
    ${t.ownerRequired ? `<label class="cs-check"><input type="checkbox" data-el="owner" ${inq.ownerChecked ? 'checked' : ''}> 지정 담당(${esc(t.owner)}) 추가 검토 완료</label>` : ''}
    <div class="cs-row">
      <label class="cs-field"><span>승인자</span><input class="cs-input" data-el="approver" value="${esc(ui.approver)}" placeholder="이름"></label>
      <label class="cs-field cs-grow"><span>승인 의견</span><input class="cs-input" data-el="comment" value="${esc(inq.pendingComment || '')}" placeholder="REVISE·REVIEW 판정이면 필수"></label>
    </div>
  </fieldset>
  <div class="cs-footbar">
    <p class="cs-muted">자동 발송되지 않습니다. 재검사·담당자 승인을 거친 초안만 Gmail 초안으로 넘기고, 발송은 사람이 합니다.</p>
    <div class="cs-actions" data-el="actions"></div>
  </div>
  ${(inq.log || []).length ? `
  <details class="cs-log"><summary>처리 기록 ${inq.log.length}건</summary>
    <ol>${inq.log.slice().reverse().map(l => `<li><span class="cs-muted">${fmt(l.at)}</span> ${esc(l.msg)}</li>`).join('')}</ol>
  </details>` : ''}
</article>`;
    renderCheck(ui);
    const aiBtn = box.querySelector('[data-act="ai-draft"]');
    serverHealth().then(h => {
      if (!aiBtn.isConnected) return;
      aiBtn.disabled = locked || !(h && h.ai);
      if (!h) aiBtn.title = '서버 상태를 확인하지 못했습니다. 새로고침해 주세요 (키는 서버에만 있음)';
      else if (!h.ai) aiBtn.title = 'ANTHROPIC_API_KEY가 없습니다 (설정 › 연결에서 입력)';
    });
  }

  function renderCheck(ui) {
    const box = ui.root.querySelector('[data-el="detail"]');
    const inq = load().find(x => x.id === ui.selected);
    if (!inq) return;
    const r = recheck(inq.draft);
    const g = gates(inq, r);
    const todos = pendingTodos(inq.draft);

    box.querySelector('[data-el="check"]').innerHTML = `
<div class="cs-checkbox">
  <div class="cs-chips"><b>컴플라이언스 재검사 (channel: cs)</b> ${r ? badge(r.verdict) : '<span class="cs-badge">불가</span>'}</div>
  ${r && r.findings.length ? `<ul class="cs-findings">${r.findings.map(f =>
    `<li>${badge(f.verdict)} <b>${f.code}</b> ${esc(f.name)} · ${f.terms.map(x => `<code>${esc(x)}</code>`).join(' ')} → ${esc(f.alt)}</li>`).join('')}</ul>` : ''}
  ${r && r.verdict === 'PASS' ? '<p class="cs-muted">규칙 미탐지는 법적 승인이 아닙니다. 담당자 최종 승인이 필요합니다.</p>' : ''}
  ${todos.length ? `<p class="cs-muted">남은 빈칸: ${todos.map(x => `<code>${esc(x)}</code>`).join(' ')}</p>` : ''}
  <ul class="cs-gates">${g.map(x => `<li class="${x.ok ? 'is-ok' : 'is-no'}">${x.ok ? '✓' : '✗'} ${esc(x.label)}</li>`).join('')}</ul>
</div>`;
    renderActions(ui, inq, r, g);
  }

  function renderActions(ui, inq, r, g) {
    const box = ui.root.querySelector('[data-el="detail"] [data-el="actions"]');
    if (!box) return;
    if (inq.status === '승인') {
      const a = inq.approval || {};
      box.innerHTML = `
<p class="cs-ok">승인됨 · ${esc(a.by)} · ${fmt(a.at)} · ${badge(a.verdict)}${a.comment ? ' · ' + esc(a.comment) : ''}</p>
${inq.gmailDraftAt ? `<p class="cs-ok">Gmail 답장 초안 만듦 · ${fmt(inq.gmailDraftAt)} → Gmail 임시보관함에서 확인 후 직접 보내세요.</p>` : ''}
<button type="button" class="cs-btn${inq.gmailId && !inq.gmailDraftAt ? ' cs-primary' : ''}" data-act="gmail-draft" ${inq.gmailId && ui.gmail ? '' : 'disabled'}
  title="${!inq.gmailId ? 'Gmail에서 불러온 문의만 답장 초안을 만들 수 있습니다' : !ui.gmail ? '설정 › 연결에서 Google로 로그인한 뒤 사용' : '같은 스레드에 답장 초안을 만듭니다 (발송하지 않음)'}">${icon('mail')} ${inq.gmailDraftAt ? 'Gmail 답장 초안 다시 만들기' : 'Gmail 답장 초안 만들기'}</button>
<button type="button" class="cs-btn" data-act="copy">승인된 초안 복사</button>
<button type="button" class="cs-btn cs-primary" data-act="sent">발송 완료 표시 (시연)</button>
<button type="button" class="cs-btn" data-act="unapprove">승인 취소</button>`;
      return;
    }
    if (inq.status === '발송 완료') {
      box.innerHTML = '<button type="button" class="cs-btn cs-primary" data-act="close">종결</button>';
      return;
    }
    if (inq.status === '종결') { box.innerHTML = '<p class="cs-muted">종결된 문의입니다.</p>'; return; }

    const ready = g.every(x => x.ok) && ui.approver.trim() !== '';
    box.innerHTML = `
<button type="button" class="cs-btn cs-primary" data-act="approve" ${ready ? '' : 'disabled'}>최종 승인</button>
${!ui.approver.trim() ? '<span class="cs-muted">승인자 이름을 입력하세요.</span>' : ''}`;
  }

  function wireDetail(ui) {
    const box = ui.root.querySelector('[data-el="detail"]');

    box.addEventListener('input', e => {
      const el = e.target.dataset.el;
      if (el === 'draft') {
        patch(ui.selected, inq => {
          inq.draft = e.target.value;
          inq.edited = true;
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; logTo(inq, '승인 후 초안 수정 → 승인 취소'); }
          else if (inq.status === '답변 대기') inq.status = '검토 중';
        });
        renderCheck(ui);
        renderList(ui);
      } else if (el === 'approver') {
        ui.approver = e.target.value;
        renderCheck(ui);
      } else if (el === 'comment') {
        patch(ui.selected, inq => { inq.pendingComment = e.target.value; });
        renderCheck(ui);
      }
    });

    box.addEventListener('change', e => {
      const el = e.target.dataset.el;
      if (el === 'type') {
        patch(ui.selected, inq => {
          inq.type = e.target.value;
          inq.ownerChecked = false;
          if (!inq.edited) inq.draft = draftFor(inq);
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; }
          logTo(inq, `유형 변경 → ${inq.type}`);
        });
        renderList(ui);
        renderDetail(ui);
      } else if (el === 'product') {
        patch(ui.selected, inq => {
          inq.product = e.target.value;
          if (!inq.edited) inq.draft = draftFor(inq);   // 직접 고친 초안은 그대로 (필요하면 '템플릿으로 다시 만들기')
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; }
          logTo(inq, `제품 → ${productKo(inq.product)}`);
        });
        renderList(ui);
        renderDetail(ui);
      } else if (el === 'owner') {
        patch(ui.selected, inq => {
          inq.ownerChecked = e.target.checked;
          if (inq.status === '답변 대기') inq.status = '검토 중';
          logTo(inq, e.target.checked ? '지정 담당 추가 검토 완료' : '지정 담당 추가 검토 해제');
        });
        renderCheck(ui);
        renderList(ui);
      }
    });

    box.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      const id = ui.selected;

      if (act === 'regen') {
        const cur = load().find(x => x.id === id);
        if (cur && cur.edited && !global.confirm('수정한 초안이 템플릿으로 바뀝니다. 계속할까요?')) return;
        patch(id, inq => {
          inq.draft = draftFor(inq);
          inq.edited = false;
          inq.aiDraftAt = null;
          inq.aiNotes = [];
          inq.prevDraft = '';
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; }
          logTo(inq, '템플릿으로 초안 다시 만들기');
        });
        renderDetail(ui);
        renderList(ui);
      } else if (act === 'approve') {
        const cur = load().find(x => x.id === id);
        const r = recheck(cur.draft);
        if (!gates(cur, r).every(x => x.ok) || !ui.approver.trim()) { renderCheck(ui); return; }
        patch(id, inq => {
          inq.status = '승인';
          inq.approval = { by: ui.approver.trim(), at: Date.now(), comment: (inq.pendingComment || '').trim(), verdict: r.verdict, codes: r.codes };
          logTo(inq, `최종 승인 (${ui.approver.trim()})`);
        });
        renderDetail(ui);
        renderList(ui);
      } else if (act === 'copy') {
        // 승인된 초안만 복사 (승인 후 초안을 고치면 승인이 풀려 이 버튼이 사라짐)
        const cur = load().find(x => x.id === id);
        if (!cur || cur.status !== '승인' || pendingTodos(cur.draft).length) return;
        copyText(cur.draft).then(ok => {
          if (ok) patch(id, inq => logTo(inq, '승인된 초안 복사'));
          toast(ok ? '초안을 복사했습니다. 메일 프로그램에서 직접 확인 후 보내세요.' : '복사하지 못했습니다. 초안 칸에서 직접 복사하세요.');
          if (ok) renderDetail(ui);
        });
      } else if (act === 'ai-draft') {
        runAiDraft(ui, btn);
      } else if (act === 'ai-undo') {
        patch(id, inq => {
          if (!inq.prevDraft) return;
          inq.draft = inq.prevDraft;
          inq.prevDraft = '';
          inq.aiNotes = [];
          inq.aiDraftAt = null;
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; }
          logTo(inq, 'AI 초안 되돌리기');
        });
        renderDetail(ui);
        renderList(ui);
      } else if (act === 'gmail-draft') {
        // 승인된 초안만 Gmail 답장 '초안'으로. 발송은 사람이 Gmail에서 직접 (서버도 [확인 필요]가 남으면 거절)
        const cur = load().find(x => x.id === id);
        if (!cur || cur.status !== '승인' || !cur.gmailId || pendingTodos(cur.draft).length) return;
        if (cur.gmailDraftAt && !global.confirm('이미 만든 Gmail 초안이 있습니다. 하나 더 만들까요? (이전 초안은 Gmail에서 지우세요)')) return;
        btn.disabled = true;
        api('/api/cs/gmail/draft', { message_id: cur.gmailId, body: cur.draft }).then(res => {
          patch(id, inq => { inq.gmailDraftAt = Date.now(); inq.gmailDraftId = res.draft_id; logTo(inq, 'Gmail 답장 초안 만듦'); });
          toast('Gmail 임시보관함에 답장 초안을 만들었습니다. 확인 후 직접 보내세요.');
          renderDetail(ui);
        }).catch(e => {
          toast(`Gmail 초안 만들기 실패: ${e.message}`);
          btn.disabled = false;
        });
      } else if (act === 'unapprove') {
        patch(id, inq => { inq.status = '검토 중'; inq.approval = null; logTo(inq, '승인 취소'); });
        renderDetail(ui);
        renderList(ui);
      } else if (act === 'sent') {
        patch(id, inq => { inq.status = '발송 완료'; logTo(inq, '발송 완료 표시 (시연)'); });
        renderDetail(ui);
        renderList(ui);
      } else if (act === 'close') {
        patch(id, inq => { inq.status = '종결'; logTo(inq, '종결'); });
        renderDetail(ui);
        renderList(ui);
      } else if (act === 'to-adverse') {
        const cur = load().find(x => x.id === id);
        ui.adverseDraft = { customer: cur.name, contact: cur.from, symptoms: cur.body, linkedInquiry: cur.id, product: cur.product ? `REBOOT ${productKo(cur.product)}` : '' };
        ui.showTab('adverse');
      }
    });
  }

  /* 부작용 접수 */

  const FIELD_LABEL = { customer: '고객', contact: '연락 방법', product: '제품', lot: '로트 번호', symptoms: '증상' };

  const STAGE_LABEL = { createdAt: '① 접수', reviewAt: '② 긴급 검토', judgedAt: '③ 판단', reportedAt: '④ 보고' };

  // 버튼으로 자동 기록한 일시를 실제 시각으로 고칠 수 있게 합니다 (수정 이력은 rec.edits에 남김).
  function timeEdit(stage, ts) {
    return `<details class="cs-edit"><summary>일시 수정</summary>
      <span class="cs-row cs-inline"><input type="datetime-local" class="cs-input" data-time="${stage}" value="${toLocalInput(ts)}" max="${toLocalInput(Date.now())}" aria-label="${STAGE_LABEL[stage]} 일시">
      <button type="button" class="cs-btn" data-act="set-time" data-stage="${stage}">저장</button></span></details>`;
  }

  function stageOrderOk(rec) {
    const s = rec.stages;
    const seq = [rec.createdAt, s.reviewAt, s.judgedAt, s.reportedAt].filter(Boolean);
    return seq.every((t, i) => i === 0 || t >= seq[i - 1]);
  }

  function isSerious(f) {
    return DATA.adverse.seriousOutcomes.includes(f.outcome) || f.care === '입원';
  }

  function renderAdverse(ui, p) {
    const pre = ui.adverseDraft || {};
    const req = k => (DATA.adverse.required.includes(k) ? ' <b class="cs-req">*</b>' : '');
    const product = pre.product || '';
    p.innerHTML = `
<div class="cs-adverse">
  <form class="cs-card" data-el="form" novalidate>
    <h3 class="cs-subject">부작용 신고 접수</h3>
    <p class="cs-muted">시연·테스트에서는 실제 고객 이름·주소·연락처를 입력하지 않습니다.</p>
    ${pre.linkedInquiry ? `<p class="cs-muted">연결된 문의: <b>${esc(pre.linkedInquiry)}</b></p>` : ''}
    <div class="cs-grid2">
      <label class="cs-field"><span>고객${req('customer')}</span><input class="cs-input" name="customer" value="${esc(pre.customer || '')}"></label>
      <label class="cs-field"><span>연락 방법${req('contact')}</span><input class="cs-input" name="contact" value="${esc(pre.contact || '')}"></label>
      <label class="cs-field"><span>제품${req('product')}</span><input class="cs-input" name="product" value="${esc(product)}"></label>
      <label class="cs-field"><span>로트 번호${req('lot')}</span><input class="cs-input" name="lot"></label>
      <label class="cs-field"><span>섭취일</span><input class="cs-input" type="date" name="intakeDate"></label>
      <label class="cs-field"><span>진료 여부</span><select class="cs-input" name="care">${DATA.adverse.careOptions.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
      <label class="cs-field"><span>결과</span><select class="cs-input" name="outcome">${DATA.adverse.outcomeOptions.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
    </div>
    <label class="cs-field"><span>증상${req('symptoms')}</span><textarea class="cs-input" rows="4" name="symptoms">${esc(pre.symptoms || '')}</textarea></label>
    <div data-el="msg" aria-live="polite"></div>
    <div class="cs-actions"><button type="submit" class="cs-btn cs-primary">접수 저장</button></div>
  </form>
  <div data-el="records" class="cs-records"></div>
</div>`;

    const form = p.querySelector('[data-el="form"]');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const fields = {};
      ['customer', 'contact', 'product', 'lot', 'intakeDate', 'care', 'outcome', 'symptoms'].forEach(k => { fields[k] = String(fd.get(k) || '').trim(); });
      const missing = DATA.adverse.required.filter(k => !fields[k]);
      const record = {
        id: uid(), createdAt: Date.now(), linkedInquiry: pre.linkedInquiry || null, fields, missing,
        serious: isSerious(fields),
        stages: { reviewAt: null, judgedAt: null, judgedBy: '', reportable: null, reportedAt: null }
      };
      const list = loadAdverse();
      list.unshift(record);
      store.set(KEY.adverse, list);
      ui.adverseDraft = null;
      renderAdverse(ui, p);
      p.querySelector('[data-el="msg"]').innerHTML = missing.length
        ? `<p class="cs-warn">저장했습니다. 빠진 필수 항목: ${missing.map(k => FIELD_LABEL[k]).join(', ')}</p>`
        : `<p class="cs-ok">저장했습니다${record.serious ? ' · 심각 사례로 판정 → 아래 처리 순서를 진행하세요' : ''}.</p>`;
    });

    renderRecords(p);
    p.querySelector('[data-el="records"]').onclick = e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const card = btn.closest('[data-id]');
      const list = loadAdverse();
      const rec = list.find(x => x.id === card.dataset.id);
      if (!rec) return;
      if (btn.dataset.act === 'review-now') rec.stages.reviewAt = Date.now();
      if (btn.dataset.act === 'judge') {
        const by = card.querySelector('[data-el="judgedBy"]').value.trim();
        const val = card.querySelector('[data-el="reportable"]').value;
        if (!by || !val) { card.querySelector('[data-el="judgeMsg"]').textContent = '판단자와 판단 결과를 모두 입력하세요.'; return; }
        rec.stages.judgedAt = Date.now();
        rec.stages.judgedBy = by;
        rec.stages.reportable = val === 'yes';
      }
      if (btn.dataset.act === 'report-now') rec.stages.reportedAt = Date.now();
      if (btn.dataset.act === 'set-time') {
        const stage = btn.dataset.stage;
        if (!STAGE_LABEL[stage]) return;
        const value = card.querySelector(`[data-time="${stage}"]`).value;
        const ts = value ? new Date(value).getTime() : NaN;
        if (isNaN(ts) || ts > Date.now() + 60 * 1000) {
          card.querySelector('[data-el="timeMsg"]').textContent = '올바른 일시를 입력하세요 (미래 시각은 넣을 수 없음).';
          return;
        }
        const prev = stage === 'createdAt' ? rec.createdAt : rec.stages[stage];
        if (stage === 'createdAt') rec.createdAt = ts; else rec.stages[stage] = ts;
        rec.edits = (rec.edits || []).concat({ stage, from: prev, to: ts, at: Date.now() });
      }
      store.set(KEY.adverse, list);
      renderRecords(p);
    };
  }

  function renderRecords(p) {
    const list = loadAdverse();
    const lotCount = {};
    list.forEach(r => { const k = (r.fields.lot || '').toLowerCase(); if (k) lotCount[k] = (lotCount[k] || 0) + 1; });
    const now = Date.now();

    p.querySelector('[data-el="records"]').innerHTML = `<h3 class="cs-subject">접수 기록 ${list.length}건</h3>` + (list.length ? list.map(rec => {
      const f = rec.fields;
      const s = rec.stages;
      const repeated = f.lot && lotCount[f.lot.toLowerCase()] > 1;
      const reviewTarget = rec.createdAt + DATA.adverse.urgentReviewHours * HOUR;
      const rfrDeadline = s.judgedAt ? s.judgedAt + DATA.adverse.rfrHours * HOUR : null;
      return `
<article class="cs-card cs-record" data-id="${esc(rec.id)}">
  <div class="cs-chips">${rec.serious ? '<span class="cs-badge cs-v-BLOCK">심각</span>' : '<span class="cs-badge cs-v-PASS">일반</span>'}
    <b>${esc(f.product || '제품 미입력')}</b> <span class="cs-muted">로트 ${esc(f.lot || '—')} · 접수 ${fmt(rec.createdAt)}</span></div>
  <p class="cs-muted">진료 ${esc(f.care)} · 결과 ${esc(f.outcome)} · 섭취일 ${esc(f.intakeDate || '—')}</p>
  <p>${esc(f.symptoms || '증상 미입력')}</p>
  ${rec.missing.length ? `<p class="cs-warn">빠진 필수 항목: ${rec.missing.map(k => FIELD_LABEL[k]).join(', ')}</p>` : ''}
  ${repeated ? '<p class="cs-warn">같은 로트 신고가 반복되었습니다 → 품질 이슈로 올리세요.</p>' : ''}
  ${rec.serious ? `
  <ol class="cs-stages">
    <li class="is-ok">① 접수 · ${fmt(rec.createdAt)} ${timeEdit('createdAt', rec.createdAt)}</li>
    <li class="${s.reviewAt ? 'is-ok' : ''}">② 긴급 검토 (목표 ${fmt(reviewTarget)}까지 · 팀 기준)
      ${s.reviewAt ? ` · 시작 ${fmt(s.reviewAt)}${s.reviewAt > reviewTarget ? ' <b class="cs-late">목표 초과</b>' : ''} ${timeEdit('reviewAt', s.reviewAt)}` :
        `<button type="button" class="cs-btn" data-act="review-now">지금 시작 기록</button>`}
      <span class="cs-muted">같은 로트 이상, 표시 안 된 알레르기 성분, 오염 확인</span></li>
    <li class="${s.judgedAt ? 'is-ok' : ''}">③ RFR 보고 대상 판단
      ${s.judgedAt ? ` · ${s.reportable ? '<b>보고 대상</b>' : '보고 대상 아님'} · ${esc(s.judgedBy)} · ${fmt(s.judgedAt)} ${timeEdit('judgedAt', s.judgedAt)}` : `
      <span class="cs-row cs-inline">
        <select class="cs-input" data-el="reportable"><option value="">판단 결과</option><option value="yes">보고 대상</option><option value="no">보고 대상 아님</option></select>
        <input class="cs-input" data-el="judgedBy" placeholder="판단자">
        <button type="button" class="cs-btn" data-act="judge">판단 기록</button>
      </span><span class="cs-warn-text" data-el="judgeMsg"></span>`}</li>
    ${s.reportable ? `
    <li class="${s.reportedAt ? 'is-ok' : ''}">④ FDA Reportable Food Registry 보고 · 기한 ${fmt(rfrDeadline)}
      ${s.reportedAt ? ` · 보고 ${fmt(s.reportedAt)}${s.reportedAt > rfrDeadline ? ' <b class="cs-late">기한 초과 보고</b>' : ''} ${timeEdit('reportedAt', s.reportedAt)}` : ` (<b class="${now > rfrDeadline ? 'cs-late' : ''}">${now > rfrDeadline ? '기한 초과' : span(rfrDeadline - now) + ' 남음'}</b>)
      <button type="button" class="cs-btn" data-act="report-now">보고 일시 기록</button>`}</li>` : ''}
  </ol>
  ${stageOrderOk(rec) ? '' : '<p class="cs-warn">단계 일시 순서가 맞지 않습니다 (접수 → 긴급 검토 → 판단 → 보고). 직접 수정한 일시를 확인하세요.</p>'}
  ${(rec.edits || []).length ? `<p class="cs-muted">일시 직접 수정 ${rec.edits.length}회 · 마지막 ${fmt(rec.edits[rec.edits.length - 1].at)} (${esc(STAGE_LABEL[rec.edits[rec.edits.length - 1].stage] || '')})</p>` : ''}
  <span class="cs-warn-text" data-el="timeMsg" aria-live="polite"></span>
  <p class="cs-muted">24시간은 문의 접수가 아니라 보고 대상으로 판단한 시점부터 계산합니다. {확인 필요: RFR 보고 책임 주체(제조사·수입사)와 판단 권한자는 규제 담당과 확정}</p>` :
  '<p class="cs-muted">기록 보관. 같은 로트 신고가 반복되면 품질 이슈로 올립니다.</p>'}
</article>`;
    }).join('') : '<p class="cs-muted">아직 접수 기록이 없습니다.</p>');
  }

  /* 답변 템플릿 */

  function renderTemplates(p) {
    const sample = { name: 'Test Customer', orderNo: 'TEST-0000', tracking: '', eta: '' };
    const rows = DATA.types.map(t => {
      const raw = recheck(t.template);
      const filled = fill(t.template, sample);
      return { t, raw, todos: pendingTodos(filled) };
    });
    const blocked = rows.filter(x => x.raw && x.raw.verdict === 'BLOCK').length;
    const unchecked = rows.filter(x => !x.raw).length;

    p.innerHTML = `
<section class="cs-persona" aria-label="답장 페르소나">
  <span class="cs-avatar cs-persona-avatar" aria-hidden="true">${initials(PERSONA.name || 'AI')}</span>
  <div><p class="cs-persona-name">${esc(PERSONA.name || '페르소나 없음')} <span class="cs-chip">답장 페르소나</span></p>
    <p class="cs-muted">${esc(PERSONA.title || '')}</p>
    <p class="cs-persona-text">${esc(PERSONA.text || 'tabs/cs/static/data.js에 persona를 넣으세요.')}</p>
    <p class="cs-muted">문의함 → 답변 초안의 <b>[AI로 초안 다듬기]</b>가 이 인물로 씁니다. 효능 주장 금지·[확인 필요] 유지 같은 안전 규칙은 서버에서 따로 지키며, 결과는 재검사와 최종 승인을 거칩니다. (${String(PERSONA.text || '').length}자 / 300자)</p></div>
</section>
<p class="cs-summary">템플릿 ${rows.length}개 · BLOCK <b class="${blocked ? 'cs-late' : 'cs-ok'}">${blocked}개</b> (목표 0개)
  ${unchecked ? ` · <span class="cs-warn-text">컴플라이언스 파트가 없어 ${unchecked}개 점검 불가</span>` : ''}</p>
<p class="cs-muted">템플릿이 BLOCK이면 그 유형의 발송이 전부 막힙니다. [확인 필요]는 현재 설정 값으로 채웠을 때 남는 빈칸 수입니다 (고객 이름·주문번호는 예시값으로 채움).</p>
<div class="cs-templates">${rows.map(x => `
  <article class="cs-card">
    <div class="cs-chips"><span class="cs-type cs-type-${x.t.code}">${x.t.code} ${esc(x.t.name)}</span>
      ${x.raw ? badge(x.raw.verdict) : '<span class="cs-badge">점검 불가</span>'}
      <span class="cs-muted">[확인 필요] ${x.todos.length}곳 · ${esc(x.t.mode)} · 기한 ${x.t.dueHours}시간</span></div>
    ${x.raw && x.raw.findings.length ? `<p class="cs-muted">${x.raw.findings.map(f => `${f.code} ${f.terms.map(esc).join(', ')}`).join(' · ')}</p>` : ''}
    <pre class="cs-pre">${esc(x.t.template)}</pre>
    ${trBlock(x.t.template, '템플릿 한글 번역')}
  </article>`).join('')}</div>`;
  }

  /* ───────── 공개 기능 · 등록 ───────── */

  function stats() {
    const now = Date.now();
    const open = load().filter(isOpen);
    return {
      open: open.length,
      urgent: open.filter(i => i.type === 'C1').length,
      overdue: open.filter(i => now > due(i)).length,
      owner_required: open.filter(i => TYPES[i.type].ownerRequired && !i.ownerChecked).length
    };
  }

  REBOOT.register({
    id: 'cs', icon: '💬', label: '고객 응대', priority: 'P1', order: 40,
    title: '빠르게 답하고, 안전하게 보내기.',
    subtitle: '문의를 분류하고 답변 초안을 컴플라이언스로 재검사한 뒤 담당자가 승인합니다.',
    render,
    summary: () => ({ label: '미처리 문의', value: stats().open })
  });
  REBOOT.expose('cs', { stats, classify });
})(typeof window !== 'undefined' ? window : globalThis);
