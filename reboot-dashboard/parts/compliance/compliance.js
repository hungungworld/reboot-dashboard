/* 컴플라이언스 파트: 판정 엔진 + 화면.
   다른 파트에는 REBOOT.use('compliance')로 review · bannedTerms · rules만 공개합니다.
   판정은 1차 참고용이며 FDA 공식 판단이나 법률 자문이 아닙니다. PASS는 법적 승인이 아닙니다. */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  const DATA = global.REBOOT_DATA && global.REBOOT_DATA.compliance;
  if (!REBOOT || !DATA) throw new Error('compliance: REBOOT core와 parts/compliance/data.js를 먼저 불러와야 합니다');

  const store = REBOOT.store('compliance');   // 저장 키: reboot:compliance:*
  const KEY = { history: 'history', openfda: 'openfda-cache', fedreg: 'fedreg-cache', monitor: 'monitor', journey: 'journey' };
  const RANK = { PASS: 0, COND: 1, REVIEW: 2, REVISE: 3, BLOCK: 4 };
  const LABEL = { BLOCK: '사용 불가', REVISE: '수정 필요', COND: '조건부', REVIEW: '검토 필요', PASS: '규칙 미탐지' };
  const BASIS = { official: '⚖️ 공식 근거', internal: '🏢 내부 정책', context: '🔍 문맥 검토' };
  const MAX_ROWS = 500;
  const MAX_CSV_BYTES = 1024 * 1024;
  const CACHE_TTL = 60 * 1000;
  const STALE_HOURS = 48;
  const FR_AGENCIES = {
    'food-and-drug-administration': 'FDA',
    'federal-trade-commission': 'FTC',
    'u-s-customs-and-border-protection': 'CBP',
    'trade-representative-office-of-united-states': 'USTR'
  };

  /* ───────── 판정 엔진 ───────── */

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 하이픈·띄어쓰기·붙여쓰기, 곧은/굽은 따옴표, 복수형·과거형을 함께 잡고 단어 중간은 잡지 않습니다.
  function termPattern(term) {
    const body = escapeRe(term).replace(/-|\s+/g, '[\\s-]*').replace(/'/g, "['’]?");
    return '(?<![A-Za-z0-9])' + body + '(?:s|es|d|ed|ing)?(?![A-Za-z0-9])';
  }

  const RULES = DATA.rules.map(r => Object.assign({}, r, {
    _re: r.terms.map(t => new RegExp(termPattern(t), 'gi')),
    _comp: (r.compensated || []).map(s => new RegExp(s, 'i'))
  }));

  // 같은 규칙에서 겹치는 표현은 긴 것 하나만 남깁니다 (예: liver health ⊂ supports liver health).
  function dedupe(list) {
    const seen = new Set();
    const out = list.filter(h => { const k = h.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return out.filter(h => {
      const k = h.toLowerCase();
      return !out.some(o => { const ok = o.toLowerCase(); return ok !== k && ok.includes(k); });
    });
  }

  function collect(rule, src) {
    const hits = [];
    rule._re.forEach(re => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) hits.push(m[0]);
    });
    (rule.ko || []).forEach(k => { if (src.includes(k)) hits.push(k); });
    return dedupe(hits);
  }

  /**
   * @param {string} text 점검할 문구
   * @param {{channel?: 'b2c'|'amazon'|'cs'|'b2b', category?: 'FOOD'|'SUPPLEMENT'}} [opts]
   * @returns {{verdict: string, findings: object[], codes: string[], channel: string, category: string}}
   */
  function review(text, opts) {
    opts = opts || {};
    const channel = DATA.channels[opts.channel] ? opts.channel : 'b2c';
    const category = opts.category === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';
    // 제품 (젤리·저당 젤리·음료·저당 음료). 모르면 '' → 제품별 판정 없이 기본 판정
    const product = (DATA.products || []).some(p => p.id === opts.product) ? opts.product : '';
    const src = String(text == null ? '' : text).replace(/\*/g, ' ');   // 면책 별표는 판정에 영향 없음
    const findings = [];

    RULES.forEach(rule => {
      const hits = collect(rule, src);
      const compensated = rule._comp.some(re => re.test(src));
      if (!hits.length && !compensated) return;
      let verdict = rule.verdict;
      if (rule.byChannel && rule.byChannel[channel]) verdict = rule.byChannel[channel];
      if (rule.byCategory && rule.byCategory[category]) verdict = rule.byCategory[category];
      if (product && rule.byProduct && rule.byProduct[product]) verdict = rule.byProduct[product];
      if (compensated) verdict = 'BLOCK';
      findings.push({
        code: rule.code,
        name: rule.name,
        verdict,
        terms: hits.length ? hits : ['(보상 조건 문구)'],
        reason: compensated ? rule.compensatedReason : rule.reason,
        alt: rule.alt,
        basis: rule.basis.slice()
      });
    });

    const verdict = findings.reduce((v, f) => (RANK[f.verdict] > RANK[v] ? f.verdict : v), 'PASS');
    return { verdict, findings, codes: findings.map(f => f.code), channel, category, product };
  }

  function bannedTerms() {
    const out = [];
    DATA.rules.forEach(r => r.terms.forEach(term => out.push({ term, code: r.code, verdict: r.verdict, ko: r.ko.slice() })));
    return out;
  }

  function rules() {
    return DATA.rules.map(r => ({ code: r.code, name: r.name, verdict: r.verdict, basis: r.basis.slice(), reason: r.reason, alt: r.alt }));
  }

  /* ───────── 저장 ───────── */

  function loadHistory() {
    const h = store.get(KEY.history, []);
    return Array.isArray(h) ? h : [];
  }

  function saveHistory(list) { store.set(KEY.history, list.slice(0, 500)); }

  function addHistory(text, r) {
    const list = loadHistory();
    const id = uid();
    list.unshift({
      id, text, channel: r.channel, category: r.category, product: r.product || '', verdict: r.verdict, codes: r.codes,
      status: '검토 요청', requestedAt: Date.now(), decidedAt: null, decidedBy: '', comment: ''
    });
    saveHistory(list);
    return id;
  }

  /* ───────── 한글 번역 (참고용) ─────────
     브라우저 내장 번역(Chrome Translator API)을 씁니다: 키가 필요 없고 문구가 기기 밖으로 나가지 않습니다.
     지원하지 않는 브라우저에서는 fallbackUrl(Google 번역)을 돌려주고, 여는 것은 사람이 결정합니다.
     판정·승인·발송은 언제나 영어 원문 기준입니다. CS 파트도 REBOOT.use('compliance').translate로 씁니다. */

  const trCache = new Map();
  let translatorP = null;

  function mostlyKorean(s) {
    return (s.match(/[가-힣]/g) || []).length > (s.match(/[A-Za-z]/g) || []).length;
  }

  function translateFallbackUrl(text) {
    return 'https://translate.google.com/?sl=auto&tl=ko&op=translate&text=' + encodeURIComponent(String(text).slice(0, 4500));
  }

  /**
   * @param {string} text 영어 문구
   * @param {(loaded:number)=>void} [onProgress] 번역 모델을 처음 내려받을 때 진행률 (0~1)
   * @returns {Promise<{ok:boolean, text?:string, engine?:string, reason?:string, message?:string, fallbackUrl?:string}>}
   */
  async function translate(text, onProgress) {
    const src = String(text == null ? '' : text).trim();
    if (!src) return { ok: false, reason: 'empty' };
    if (mostlyKorean(src)) return { ok: true, text: src, engine: 'already-ko' };
    if (trCache.has(src)) return { ok: true, text: trCache.get(src), engine: 'cache' };
    const fallbackUrl = translateFallbackUrl(src);
    const T = global.Translator;
    if (!T || typeof T.create !== 'function') return { ok: false, reason: 'unsupported', fallbackUrl };
    try {
      const avail = await T.availability({ sourceLanguage: 'en', targetLanguage: 'ko' });
      if (avail === 'unavailable') return { ok: false, reason: 'unsupported', fallbackUrl };
      if (!translatorP) {
        translatorP = T.create({
          sourceLanguage: 'en', targetLanguage: 'ko',
          monitor(m) { m.addEventListener('downloadprogress', e => { if (onProgress) onProgress(e.loaded); }); }
        }).catch(e => { translatorP = null; throw e; });
      }
      const tr = await translatorP;
      const out = [];
      for (const line of src.split('\n')) out.push(line.trim() ? await tr.translate(line) : line);   // 줄바꿈 유지
      const result = out.join('\n');
      trCache.set(src, result);
      return { ok: true, text: result, engine: 'on-device' };
    } catch (e) {
      return { ok: false, reason: 'error', message: e.message, fallbackUrl };
    }
  }

  /* ───────── 화면 도우미 ───────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmt(ts) {
    return ts ? new Date(ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function badge(v) {
    if (!LABEL[v]) return `<span class="cmp-badge">${esc(v)}</span>`;   // 저장소에서 읽은 알 수 없는 값
    return `<span class="cmp-badge cmp-v-${v}">${v} · ${LABEL[v]}</span>`;
  }
  // 선 아이콘 (시안과 같은 1.65 두께 스트로크)
  const ICON_PATH = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5L12 8Z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>'
  };
  function icon(name) {
    return `<svg class="cmp-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATH[name] || ''}</svg>`;
  }

  /* ───────── 서버 (Flask · server/compliance/) ─────────
     키가 필요한 기능(AI 2차 판정 · 모니터링 수집)은 같은 주소의 /api로만 부릅니다. HTML·JS에는 키가 없습니다.
     file://로 열었거나 서버가 꺼져 있으면 health()가 null → 해당 버튼만 꺼짐 */
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
      res = await fetch(path, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
      });
    } catch (e) {
      throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data;
  }
  function channelOptions(selected) {
    return Object.entries(DATA.channels).map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }
  // 제품 4종 (data.js products)
  function productOf(id) { return (DATA.products || []).find(p => p.id === id) || null; }
  function productLabel(id) { const p = productOf(id); return p ? p.ko : '제품 미지정'; }
  function productOptions(selected) {
    return (DATA.products || []).map(p => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>REBOOT ${esc(p.ko)} · ${esc(p.form)}</option>`).join('');
  }
  // AI 2차 판정에 넘기는 제품 설명 (영문)
  function productBrief(id) {
    const p = productOf(id);
    if (!p) return '';
    const form = p.id.startsWith('drink') ? 'non-carbonated drink in small bottles (6 per box)' : 'stick jelly, individually wrapped sticks in one pack';
    return `REBOOT ${form}${p.sugarReduced ? ', sugar-reduced recipe (target: less sugar than the original; criteria for a "reduced sugar" claim not yet verified)' : ', original recipe (not sugar-reduced)'}`;
  }
  function toast(msg) {
    if (REBOOT.ui && typeof REBOOT.ui.toast === 'function') REBOOT.ui.toast(msg);
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

  // 번역 블록: 버튼을 누르면 data-tr-text의 영어 원문을 번역해 바로 아래에 보여 줌 (render의 위임 처리)
  function trBlock(text, label) {
    return `<div class="cmp-trblock" data-tr-text="${esc(text)}">
  <button type="button" class="cmp-btn cmp-btn-sm cmp-btn-tr" data-act="translate">${esc(label || '한글로 번역')}</button>
  <div data-tr-out aria-live="polite"></div></div>`;
  }

  async function runTranslate(block) {
    const btn = block.querySelector('[data-act="translate"]');
    const out = block.querySelector('[data-tr-out]');
    btn.disabled = true;
    out.innerHTML = '<p class="cmp-muted">번역 중…</p>';
    const r = await translate(block.dataset.trText, loaded => {
      out.innerHTML = `<p class="cmp-muted">번역 모델 내려받는 중… ${Math.round(loaded * 100)}% (처음 한 번만)</p>`;
    });
    btn.disabled = false;
    if (r.ok) {
      out.innerHTML = `<div class="cmp-tr"><span class="cmp-tr-tag">${r.engine === 'already-ko' ? '이미 한국어 문구' : '기계 번역 · 참고용'}</span>
  <p class="cmp-tr-text">${esc(r.text)}</p>
  <p class="cmp-muted">판정·승인은 영어 원문 기준입니다. 번역문을 광고에 쓰지 마세요.</p></div>`;
    } else {
      out.innerHTML = `<p class="cmp-note">이 브라우저에서는 기기 안 번역을 쓸 수 없습니다 (Chrome 138 이상 데스크톱에서 지원)${r.message ? ` · ${esc(r.message)}` : ''}.
  ${r.fallbackUrl ? `${link(r.fallbackUrl, 'Google 번역에서 열기 ↗')} <b>문구가 Google로 전송됩니다.</b> 실제 고객 정보가 들어 있으면 열지 마세요.` : ''}</p>`;
    }
  }

  // 서버·외부 자료의 링크는 https만 엽니다.
  function link(url, text) {
    return /^https:\/\//i.test(String(url || '')) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
  }

  function highlight(text, terms) {
    const list = terms.filter(t => !t.startsWith('(')).sort((a, b) => b.length - a.length).map(escapeRe);
    if (!list.length) return esc(text);
    const re = new RegExp(list.join('|'), 'gi');
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  // 다운로드 파일명은 reboot-compliance-내용.확장자 (팀 README 1장)
  function download(what, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reboot-compliance-${what}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* ───────── CSV ───────── */

  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
  }

  function toCSV(rows) {
    const cell = v => {
      v = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(v)) v = "'" + v;   // 엑셀 수식으로 실행되지 않게
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  }

  /* ───────── 화면 ───────── */

  const TABS = [['single', '단건 심의'], ['batch', '일괄 심의'], ['history', '심의 이력'], ['rules', '규칙·검증'], ['monitor', '규제 모니터링'], ['agencies', '기관 안내']];

  function render(root) {
    root.classList.add('part-compliance');
    root.innerHTML = `
<div class="cmp-wrap">
  <div class="cmp-kpis" data-el="kpis" aria-label="심의 현황"></div>
  <div class="cmp-tabs" role="tablist">
    ${TABS.map(([id, label], i) => `<button type="button" role="tab" class="cmp-tab" data-tab="${id}" aria-selected="${i === 0}">${label}</button>`).join('')}
  </div>
  <section class="cmp-panel" data-panel="single">${singleHTML()}</section>
  <section class="cmp-panel" data-panel="batch" hidden>${batchHTML()}</section>
  <section class="cmp-panel" data-panel="history" hidden></section>
  <section class="cmp-panel" data-panel="rules" hidden>${rulesHTML()}</section>
  <section class="cmp-panel" data-panel="monitor" hidden>${monitorHTML()}</section>
  <section class="cmp-panel" data-panel="agencies" hidden>${agenciesHTML()}</section>
</div>`;

    const showTab = id => {
      root.querySelectorAll('.cmp-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
      root.querySelectorAll('.cmp-panel').forEach(p => { p.hidden = p.dataset.panel !== id; });
      if (id === 'single') paintSingle(root);   // 심의 이력에서 승인·반려하면 로드맵에 반영
      if (id === 'history') renderHistory(root);
      if (id === 'monitor') renderServer(root);
    };
    root.querySelectorAll('.cmp-tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

    // 모든 탭 공통: 한글 번역 버튼, 다른 탭으로 이동하는 버튼
    root.addEventListener('click', e => {
      const tr = e.target.closest('[data-act="translate"]');
      if (tr && !tr.disabled) { runTranslate(tr.closest('[data-tr-text]')); return; }
      const td = e.target.closest('[data-act="term-detail"]');
      if (td) { openDetail(root, td.dataset.code, td.dataset.term); return; }
      const btn = e.target.closest('[data-act="goto"]');
      if (!btn) return;
      showTab(btn.dataset.goto);
      if (btn.dataset.agency) {
        const sel = root.querySelector('[data-el="fra"]');
        if (sel) sel.value = btn.dataset.agency;
      }
      root.querySelector(`.cmp-tab[data-tab="${btn.dataset.goto}"]`).focus();
    });

    wireSingle(root);
    wireBatch(root);
    renderHistory(root);
    wireRules(root);
    wireMonitor(root);
  }

  /* 단건 심의 — 로드맵: ① 문구 입력 → ② 자동 점검 → ③ 수정·재점검 → ④ 검토 요청 → ⑤ 담당자 승인 → ⑥ 사용
     진행 상태(문구·채널·점검한 문구·검토 요청 id)는 reboot:compliance:journey에 저장해 탭을 옮겨도 이어집니다. */

  const STEPS = [['input', '문구 입력'], ['check', '자동 점검'], ['fix', '수정·재점검'], ['request', '검토 요청'], ['approve', '담당자 승인'], ['use', '사용']];
  const STEP_ICON = { done: '✓', skip: '–', blocked: '✗' };

  function loadJourney() {
    const j = store.get(KEY.journey, {}) || {};
    return {
      text: String(j.text || ''), channel: DATA.channels[j.channel] ? j.channel : 'b2c',
      category: j.category === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD', checkedKey: j.checkedKey || '', historyId: j.historyId || null,
      product: productOf(j.product) ? j.product : 'jelly',
      ai: j.ai && typeof j.ai === 'object' && j.ai.result ? j.ai : null   // { key, at, result } — 같은 문구·채널·기준일 때만 보여 줌
    };
  }
  function saveJourney(j) { store.set(KEY.journey, j); }
  function journeyKey(j) { return JSON.stringify([j.text.trim(), j.channel, j.category, j.product || '']); }

  /** 지금 문구가 로드맵 어느 단계인지 계산 */
  function journeyState(j) {
    const text = j.text.trim();
    const r = text && j.checkedKey === journeyKey(j) ? review(text, { channel: j.channel, category: j.category, product: j.product }) : null;
    const item = r && j.historyId ? loadHistory().find(x => x.id === j.historyId) || null : null;
    const st = { input: 'todo', check: 'todo', fix: 'todo', request: 'todo', approve: 'todo', use: 'todo' };
    let msg = '';
    let tone = 'info';
    let canRequest = false;
    let action = '';

    if (!text) {
      st.input = 'current';
      msg = '미국에 쓸 영어 문구를 입력하고, 쓰일 채널을 고르세요.';
    } else if (!r) {
      st.input = 'done'; st.check = 'current';
      msg = j.checkedKey ? '문구가 바뀌었습니다. [문구 점검하기]를 다시 눌러 주세요.' : '[문구 점검하기]를 눌러 R1~R12 규칙으로 점검하세요.';
    } else {
      st.input = st.check = 'done';
      const fixCount = r.findings.filter(f => f.verdict === 'BLOCK' || f.verdict === 'REVISE').length;
      if (item && item.status === '승인') {
        st.fix = fixCount ? 'done' : 'skip'; st.request = st.approve = 'done'; st.use = 'current'; tone = 'ok';
        msg = `사용할 수 있습니다 · ${esc(item.decidedBy)} 승인 (${fmt(item.decidedAt)}) · ${esc(DATA.channels[item.channel] || item.channel)} 기준. 문구나 채널을 바꾸면 다시 점검·승인을 받아야 합니다.`;
        action = '<button type="button" class="cmp-btn cmp-primary" data-act="copy-approved">승인된 문구 복사</button> <button type="button" class="cmp-btn" data-act="new">새 문구 시작</button>';
      } else if (item && item.status === '검토 요청') {
        st.fix = fixCount ? 'done' : 'skip'; st.request = 'done'; st.approve = 'current';
        msg = `담당자 승인을 기다리는 중입니다 (요청 ${fmt(item.requestedAt)}). '심의 이력' 탭에서 승인하거나 반려합니다.`;
        action = '<button type="button" class="cmp-btn" data-act="goto" data-goto="history">심의 이력으로 가기</button>';
      } else if (item && item.status === '반려') {
        st.request = 'done'; st.approve = 'blocked'; st.fix = 'current'; tone = 'block';
        msg = `반려되었습니다${item.comment ? `: "${esc(item.comment)}"` : ''} → 문구를 고친 뒤 다시 점검하세요.`;
      } else if (r.verdict === 'BLOCK') {
        st.fix = 'current'; tone = 'block';
        msg = '사용 불가(BLOCK) 표현이 있습니다 → 아래 "대신 쓸 방향"을 참고해 문장을 바꾼 뒤 다시 점검하세요. BLOCK 문구는 검토 요청을 할 수 없습니다.';
      } else if (r.verdict === 'REVISE') {
        st.fix = 'current'; tone = 'warn'; canRequest = true;
        msg = '수정 필요(REVISE) 표현이 있습니다 → 고쳐서 다시 점검하는 것을 권장합니다. 그대로 올리면 담당자가 판단합니다.';
      } else {
        st.fix = 'skip'; st.request = 'current'; canRequest = true;
        msg = r.verdict === 'PASS'
          ? '걸린 표현이 없습니다. 하지만 PASS는 법적 승인이 아니므로 [검토 요청]으로 담당자 승인을 받으세요.'
          : `${r.verdict} · ${LABEL[r.verdict]} 판정입니다. 사람이 판단해야 하니 [검토 요청]을 누르세요.`;
      }
    }
    return { r, item, st, msg, tone, canRequest, action };
  }

  function roadHTML(st) {
    const current = STEPS.findIndex(([id]) => st[id] === 'current');
    return STEPS.map(([id, label], i) => `
  <li class="cmp-road-step is-${st[id]}"${st[id] === 'current' ? ' aria-current="step"' : ''}>
    <span class="cmp-road-dot" aria-hidden="true">${STEP_ICON[st[id]] || i + 1}</span>
    <span class="cmp-road-label">${label}</span></li>`).join('') +
      (current >= 0 ? `<li class="cmp-sr">현재 ${current + 1}단계 · ${STEPS[current][1]}</li>` : '');
  }

  function singleHTML() {
    return `
<div class="cmp-bench">
  <div class="cmp-card">
    <div class="cmp-card-head"><h3>점검할 문구를 입력하세요</h3><span class="cmp-tag" data-el="cattag">일반식품 기준</span></div>
    <div class="cmp-grid2 cmp-grid3">
      <label class="cmp-field"><span>사용 채널</span><select class="cmp-input" data-el="channel">${channelOptions('b2c')}</select></label>
      <label class="cmp-field"><span>제품</span><select class="cmp-input" data-el="product">${productOptions('jelly')}</select></label>
      <label class="cmp-field"><span>기준</span><select class="cmp-input" data-el="category">
        <option value="FOOD">일반식품 (기본)</option><option value="SUPPLEMENT">건강기능식품 기준 비교</option></select></label>
    </div>
    <label class="cmp-field"><span>광고 카피</span>
      <textarea class="cmp-input" rows="5" data-el="text" placeholder="예: A Korean after-party ritual in a jelly stick."></textarea></label>
    <div class="cmp-foot">
      <p class="cmp-muted">입력한 문구와 심의 이력은 팀 공용 서버에 저장됩니다 (팀원 모두 볼 수 있음). 규칙 점검은 이 화면에서 하고, AI 2차 판정을 누를 때만 문구를 Claude로 보냅니다.</p>
      <div class="cmp-actions">
        <button type="button" class="cmp-btn" data-act="ai" disabled title="먼저 [문구 점검하기]를 누르세요">${icon('spark')} AI 2차 판정</button>
        <button type="button" class="cmp-btn" data-act="request" disabled>검토 요청</button>
        <button type="button" class="cmp-btn cmp-primary" data-act="run">${icon('shield')} 문구 점검하기</button>
      </div>
    </div>
    <div class="cmp-road-msg" data-el="roadmsg" aria-live="polite"></div>
    <div data-el="result"></div>
    <div data-el="ai" aria-live="polite"></div>
  </div>
  <aside class="cmp-side">
    <div class="cmp-card"><div class="cmp-card-head"><h3>검토 흐름</h3></div>
      <ol class="cmp-road" data-el="road" aria-label="문구 심의 진행 단계"></ol></div>
    <div class="cmp-card cmp-notes"><div class="cmp-card-head"><h3>알아두세요</h3></div>
      <p><b>PASS</b>는 R1~R12 규칙에서 위험 표현을 찾지 못했다는 뜻이며 법적 승인을 의미하지 않습니다.</p>
      <p>이 점검은 1차 참고용입니다. FDA 공식 판단이나 법률 자문이 아니며, 사용 여부는 담당자 승인으로 정합니다.</p></div>
  </aside>
</div>`;
  }

  /** 상단 KPI 카드 4장 — 심의 이력 기준 */
  function paintKpis(root) {
    const box = root.querySelector('[data-el="kpis"]');
    if (!box) return;
    const list = loadHistory();
    const n = s => list.filter(x => x.status === s).length;
    const cards = [
      { label: '검토 대기', icon: 'clock', value: n('검토 요청'), sub: '<b>승인 필요</b>심의 이력에서 처리', featured: true },
      { label: '승인 완료', icon: 'check', value: n('승인'), sub: '<b>사용 가능</b>승인된 채널 기준' },
      { label: '반려', icon: 'pencil', value: n('반려'), sub: '<b>수정 필요</b>고친 뒤 다시 점검' },
      { label: '전체 심의 이력', icon: 'list', value: list.length, sub: '<b>누적</b>팀 공용 기준' }
    ];
    box.innerHTML = cards.map(c => `
<div class="cmp-kpi${c.featured ? ' is-featured' : ''}">
  <div class="cmp-kpi-top"><span>${c.label}</span><span class="cmp-kpi-icon">${icon(c.icon)}</span></div>
  <div class="cmp-kpi-num">${c.value}<small>건</small></div>
  <div class="cmp-kpi-sub">${c.sub}</div>
</div>`).join('');
  }

  function resultHTML(text, r) {
    return `
<div class="cmp-result">
  <div class="cmp-result-head">${badge(r.verdict)}
    <span class="cmp-muted">${esc(DATA.channels[r.channel])} · ${esc(productLabel(r.product))} · ${r.category === 'FOOD' ? '일반식품' : '건강기능식품 기준 비교'}</span></div>
  <p class="cmp-quote">${highlightHits(text, r.findings)}</p>
  ${r.findings.length ? '<p class="cmp-muted cmp-hint">밑줄 친 표현을 누르면 이유·대신 쓸 표현·관련 기관을 자세히 볼 수 있습니다.</p>' : ''}
  ${trBlock(text)}
  ${r.findings.map(f => `
  <article class="cmp-finding">
    <div class="cmp-finding-head"><b>${f.code} ${esc(f.name)}</b> ${badge(f.verdict)}
      <span class="cmp-basis">${f.basis.map(b => BASIS[b]).join(' · ')}</span>
      <button type="button" class="cmp-btn cmp-btn-sm cmp-more" data-act="term-detail" data-code="${f.code}" data-term="${esc(f.terms[0])}">자세히</button></div>
    <p><span class="cmp-label">걸린 표현</span> ${f.terms.map(t => hitButton(f, t, `<code>${esc(t)}</code>`)).join(' ')}</p>
    <p><span class="cmp-label">이유</span> ${esc(f.reason)}</p>
    <p><span class="cmp-label">대신 쓸 방향</span> ${esc(f.alt)}</p>
  </article>`).join('')}
</div>`;
  }

  /* ── 걸린 표현 자세히 보기 (단건 심의) ── */

  function hitButton(f, term, inner) {
    return `<button type="button" class="cmp-hit cmp-hit-${f.verdict}" data-act="term-detail" data-code="${f.code}" data-term="${esc(term)}"
      aria-haspopup="dialog" title="${esc(`${f.code} ${f.name} · ${LABEL[f.verdict]} — 눌러서 자세히 보기`)}">${inner}</button>`;
  }

  /** 문구 안의 걸린 표현을 누를 수 있는 버튼으로 표시 (한 표현이 여러 규칙에 걸리면 더 엄격한 규칙 기준) */
  function highlightHits(text, findings) {
    const byTerm = new Map();
    findings.forEach(f => f.terms.filter(t => !t.startsWith('(')).forEach(t => {
      const k = t.toLowerCase();
      if (!byTerm.has(k) || RANK[f.verdict] > RANK[byTerm.get(k).verdict]) byTerm.set(k, f);
    }));
    if (!byTerm.size) return esc(text);
    const re = new RegExp([...byTerm.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'gi');
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const f = byTerm.get(m[0].toLowerCase());
      out += esc(text.slice(last, m.index)) + (f ? hitButton(f, m[0], esc(m[0])) : `<mark>${esc(m[0])}</mark>`);
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  /** 기관 안내 데이터에서 이 규칙을 맡는 기관 (예: R1 → FDA) */
  function agenciesFor(code) {
    return (DATA.agencies || []).filter(a => (String(a.rules || '').match(/R\d+/g) || []).includes(code));
  }

  /** 문구에서 표현이 들어 있는 문장 (앞뒤 문맥) */
  function contextOf(text, term) {
    const i = text.toLowerCase().indexOf(String(term).toLowerCase());
    if (i < 0) return '';
    const start = Math.max(text.lastIndexOf('\n', i), Math.max(...['. ', '! ', '? '].map(s => text.lastIndexOf(s, i)))) + 1;
    const endCands = ['\n', '. ', '! ', '? '].map(s => text.indexOf(s, i + term.length)).filter(x => x >= 0);
    const end = endCands.length ? Math.min(...endCands) + 1 : text.length;
    const sentence = text.slice(start, end).trim();
    const j = sentence.toLowerCase().indexOf(String(term).toLowerCase());
    return j < 0 ? esc(sentence)
      : esc(sentence.slice(0, j)) + `<mark>${esc(sentence.slice(j, j + term.length))}</mark>` + esc(sentence.slice(j + term.length));
  }

  const BASIS_HELP = {
    official: 'FDA·FTC 규정이나 경고장 등 공식 문서에 근거가 있습니다.',
    internal: '법 기준보다 보수적으로 정한 팀 내부 기준입니다.',
    context: '같은 단어라도 문맥에 따라 문제가 되지 않을 수 있어 사람이 판단합니다.'
  };

  function detailHTML(f, term, j, s) {
    const rule = DATA.rules.find(x => x.code === f.code) || {};
    const text = j.text.trim();
    const ctx = contextOf(text, term);
    const changed = rule.verdict && rule.verdict !== f.verdict;
    const agencies = agenciesFor(f.code);
    const maps = (DATA.mappings || []).filter(m => m.code === f.code);
    const quotes = (DATA.warningQuotes || []).filter(q => String(q.text || '').toLowerCase().includes(String(term).toLowerCase())).slice(0, 3);
    const siblings = (rule.terms || []).concat(rule.ko || []).filter(t => t.toLowerCase() !== String(term).toLowerCase());
    const ai = j.ai && j.ai.key === journeyKey(j) && j.ai.result && Array.isArray(j.ai.result.issues)
      ? j.ai.result.issues.filter(x => x.code === f.code || String(x.phrase || '').toLowerCase().includes(String(term).toLowerCase())) : [];
    const others = s.r.findings.filter(x => x.code !== f.code && x.terms.some(t => t.toLowerCase() === String(term).toLowerCase()));
    return `
<div class="cmp-dlg-head">
  <div>
    <p class="cmp-dlg-eyebrow">${esc(f.code)} · ${esc(f.name)}</p>
    <h3 id="cmp-dlg-title" class="cmp-dlg-title"><code>${esc(term)}</code> ${badge(f.verdict)}</h3>
  </div>
  <button type="button" class="cmp-dlg-x" data-act="dlg-close" aria-label="닫기">×</button>
</div>
<div class="cmp-dlg-body">
  ${ctx ? `<section><h4>문구 속 위치</h4><p class="cmp-quote">${ctx}</p></section>` : ''}
  <section><h4>왜 문제인가요?</h4><p>${esc(f.reason)}</p>
    ${changed ? `<p class="cmp-note">이 규칙의 기본 판정은 ${badge(rule.verdict)}이고, 지금 고른 채널·제품·기준(${esc(DATA.channels[j.channel] || j.channel)} · ${esc(productLabel(j.product))} · ${j.category === 'FOOD' ? '일반식품' : '건강기능식품 비교'})에서는 ${badge(f.verdict)}입니다.</p>` : ''}
    ${others.length ? `<p class="cmp-muted">이 표현은 ${others.map(x => `${x.code} ${esc(x.name)}`).join(', ')}에도 걸립니다.</p>` : ''}</section>
  <section><h4>근거 구분</h4><ul class="cmp-dlg-list">${f.basis.map(b => `<li><b>${BASIS[b]}</b> — ${BASIS_HELP[b] || ''}</li>`).join('')}</ul></section>
  <section><h4>대신 이렇게 써 보세요</h4><p>${esc(f.alt)}</p>
    ${maps.length ? `<ul class="cmp-dlg-list">${maps.map(m => `<li>${esc(m.ko)} → <b>${esc(m.us)}</b>${m.note ? ` <span class="cmp-muted">(${esc(m.note)})</span>` : ''}</li>`).join('')}</ul>` : ''}</section>
  ${siblings.length ? `<section><h4>같은 규칙에 걸리는 다른 표현</h4><p class="cmp-dlg-chips">${siblings.slice(0, 16).map(t => `<code>${esc(t)}</code>`).join(' ')}</p></section>` : ''}
  ${agencies.length ? `<section><h4>관련 기관</h4>${agencies.map(a => `<p><b>${esc(a.icon || '')} ${esc(a.code)} · ${esc(a.ko)}</b><br><span class="cmp-muted">${esc(a.oneLine || '')}</span>${a.risk ? `<br><span class="cmp-muted">어기면: ${esc(a.risk)}</span>` : ''}</p>`).join('')}</section>` : ''}
  ${quotes.length ? `<section><h4>FDA 경고장 사례</h4>${quotes.map(q => `<p class="cmp-quote">${esc(q.text)}<br><span class="cmp-muted">${esc(q.firm || '')} ${esc(q.issued || '')}</span></p>`).join('')}</section>` : ''}
  ${ai.length ? `<section><h4>${icon('spark')} AI 2차 판정 의견 <span class="cmp-muted">(참고용)</span></h4>${ai.map(x => `<p>${badge(LABEL[x.verdict] ? x.verdict : 'REVIEW')} ${esc(x.reason)}${x.suggestion ? `<br><span class="cmp-muted">제안: ${esc(x.suggestion)}</span>` : ''}</p>`).join('')}</section>` : ''}
</div>
<div class="cmp-dlg-foot">
  <button type="button" class="cmp-btn" data-act="goto" data-goto="rules">규칙·검증 탭에서 보기</button>
  ${agencies.length ? `<button type="button" class="cmp-btn" data-act="goto" data-goto="agencies">기관 안내 보기</button>` : ''}
  <button type="button" class="cmp-btn cmp-primary" data-act="select-term" data-term="${esc(term)}">문구 칸에서 이 표현 고치기</button>
</div>`;
  }

  /** 걸린 표현 자세히 보기 창 열기 (<dialog>: Esc·바깥 클릭·닫기 버튼으로 닫힘) */
  function openDetail(root, code, term) {
    const j = loadJourney();
    const s = journeyState(j);
    const f = s.r && s.r.findings.find(x => x.code === code);
    if (!f) return;
    let dlg = root.querySelector('dialog.cmp-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'cmp-dialog';
      dlg.setAttribute('aria-labelledby', 'cmp-dlg-title');
      root.querySelector('.cmp-wrap').appendChild(dlg);
      dlg.addEventListener('click', e => {
        if (e.target === dlg) return dlg.close();   // 바깥(배경) 클릭
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'dlg-close') dlg.close();
        else if (btn.dataset.act === 'goto') { dlg._opener = null; dlg.close(); }   // 탭 이동은 render의 공통 처리기가 함
        else if (btn.dataset.act === 'select-term') {
          dlg._opener = null;   // 포커스는 문구 칸으로
          dlg.close();
          const ta = root.querySelector('[data-panel="single"] [data-el="text"]');
          const i = ta.value.toLowerCase().indexOf(btn.dataset.term.toLowerCase());
          ta.focus();
          if (i >= 0) ta.setSelectionRange(i, i + btn.dataset.term.length);
        }
      });
      dlg.addEventListener('close', () => { if (dlg._opener && dlg._opener.isConnected) dlg._opener.focus(); });
    }
    dlg.innerHTML = detailHTML(f, term, j, s);
    dlg._opener = document.activeElement;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    const x = dlg.querySelector('[data-act="dlg-close"]');
    if (x) x.focus();
  }

  /** 저장된 진행 상태로 로드맵·안내·결과를 다시 그림 */
  function paintSingle(root) {
    const p = root.querySelector('[data-panel="single"]');
    const el = n => p.querySelector(`[data-el="${n}"]`);
    const j = loadJourney();
    const s = journeyState(j);
    el('road').innerHTML = roadHTML(s.st);
    el('roadmsg').className = `cmp-road-msg cmp-road-${s.tone}`;
    el('roadmsg').innerHTML = `<p>${s.msg}</p>${s.action ? `<div class="cmp-actions">${s.action}</div>` : ''}`;
    // 요청할 수 없을 때도 누르면 이유를 알려 주도록 disabled 대신 aria-disabled (점검 전에만 진짜로 끔)
    const reqBtn = p.querySelector('[data-act="request"]');
    reqBtn.disabled = !s.r;
    reqBtn.setAttribute('aria-disabled', String(!s.canRequest));
    reqBtn.classList.toggle('cmp-primary', s.canRequest);
    reqBtn.title = s.canRequest ? '담당자에게 승인을 요청하고 심의 이력으로 넘어갑니다'
      : !s.r ? '먼저 [문구 점검하기]를 누르세요'
      : s.item && s.item.status !== '반려' ? '이미 요청한 문구 · 눌러서 심의 이력 보기'
      : s.r.verdict === 'BLOCK' ? 'BLOCK 문구는 검토 요청 불가 · 표현을 고친 뒤 다시 점검' : '지금은 검토 요청 불가';
    el('cattag').textContent = `REBOOT ${productLabel(j.product)} · ${j.category === 'SUPPLEMENT' ? '건강기능식품 기준 비교' : '일반식품 기준'}`;
    const key = s.r ? journeyKey(j) : '-';
    if (el('result').dataset.key !== key) {   // 결과가 같으면 다시 그리지 않음 (열어 둔 번역 유지)
      el('result').innerHTML = s.r ? resultHTML(j.text.trim(), s.r)
        : `<div class="cmp-empty">${icon('shield')}<span>점검 결과와 대신 쓸 표현이 여기에 표시됩니다.</span></div>`;
      el('result').dataset.key = key;
    }
    // AI 2차 판정: 지금 문구·채널·기준으로 받은 결과만 보여 줌
    const ai = s.r && j.ai && j.ai.key === journeyKey(j) ? j.ai : null;
    const aiKey = ai ? `${ai.key}|${ai.at}` : '-';
    const aiErrShown = el('ai').dataset.key === 'error' && el('ai').dataset.errFor === journeyKey(j);   // 실패 안내는 문구가 바뀔 때까지 유지
    if (p.dataset.aiBusy !== '1' && !aiErrShown && el('ai').dataset.key !== aiKey) {
      el('ai').innerHTML = ai ? aiHTML(ai, s.r.verdict) : '';
      el('ai').dataset.key = aiKey;
    }
    const aiBtn = p.querySelector('[data-act="ai"]');
    serverHealth().then(h => {
      const busy = p.dataset.aiBusy === '1';
      aiBtn.disabled = busy || !s.r || !(h && h.ai);
      aiBtn.title = !h ? '서버 상태를 확인하지 못했습니다. 새로고침해 주세요 (키는 서버에만 있음)'
        : !h.ai ? 'ANTHROPIC_API_KEY가 없습니다 (설정 › 연결에서 입력)'
        : !s.r ? '먼저 [문구 점검하기]를 누르세요' : 'Claude가 규칙이 놓친 위험과 더 안전한 문장을 참고용으로 제안합니다';
    });
    paintKpis(root);
  }

  function aiHTML(ai, ruleVerdict) {
    const r = ai.result || {};
    const v = LABEL[r.verdict] ? r.verdict : 'REVIEW';
    const conf = { low: '낮음', medium: '보통', high: '높음' }[r.confidence] || '—';
    const cmp = RANK[v] > RANK[ruleVerdict]
      ? `<p class="cmp-note cmp-note-warn">AI가 규칙 판정(${ruleVerdict})보다 엄격하게 봤습니다 → 검토 요청 때 담당자가 함께 확인하세요.</p>`
      : RANK[v] < RANK[ruleVerdict]
        ? `<p class="cmp-note">규칙 판정(${ruleVerdict})이 우선합니다. AI가 더 느슨하게 봐도 규칙에 걸린 표현은 고쳐야 합니다.</p>` : '';
    const issues = Array.isArray(r.issues) ? r.issues : [];
    return `
<div class="cmp-ai">
  <div class="cmp-result-head"><b class="cmp-ai-title">${icon('spark')} AI 2차 판정</b>${badge(v)}
    <span class="cmp-tag">확신 ${conf}</span><span class="cmp-muted">${esc(ai.model || '')} · ${fmt(ai.at)} · 참고용</span></div>
  ${r.summary ? `<p class="cmp-ai-summary">${esc(r.summary)}</p>` : ''}
  ${cmp}
  ${issues.map(x => `
  <article class="cmp-finding">
    <div class="cmp-finding-head"><code>${esc(x.phrase)}</code> ${badge(LABEL[x.verdict] ? x.verdict : 'REVIEW')} <span class="cmp-basis">${esc(x.code)}</span></div>
    <p><span class="cmp-label">이유</span> ${esc(x.reason)}</p>
    ${x.suggestion ? `<p><span class="cmp-label">제안</span> ${esc(x.suggestion)}</p>` : ''}
  </article>`).join('')}
  ${r.rewrite ? `
  <div class="cmp-ai-rewrite">
    <span class="cmp-label">더 안전한 문장 (제안)</span>
    <p class="cmp-quote">${esc(r.rewrite)}</p>
    <div class="cmp-actions"><button type="button" class="cmp-btn" data-act="ai-apply">이 문장으로 바꾸고 다시 점검</button></div>
  </div>` : ''}
  <p class="cmp-muted">AI 판정은 규칙 판정을 대신하지 않으며 법률 자문이 아닙니다. 제안 문장도 규칙 점검과 담당자 승인을 거쳐야 합니다.</p>
</div>`;
  }

  function wireSingle(root) {
    const p = root.querySelector('[data-panel="single"]');
    const el = n => p.querySelector(`[data-el="${n}"]`);
    const saved = loadJourney();
    el('text').value = saved.text;
    el('channel').value = saved.channel;
    el('product').value = saved.product;
    el('category').value = saved.category;

    // 입력값을 진행 상태에 반영. 문구·채널·기준이 바뀌면 이전 검토 요청과의 연결을 끊음
    const sync = () => {
      const cur = loadJourney();
      const next = { text: el('text').value, channel: el('channel').value, product: el('product').value, category: el('category').value, checkedKey: cur.checkedKey, historyId: cur.historyId, ai: cur.ai };
      if (journeyKey(next) !== journeyKey(cur)) next.historyId = linkedHistoryId(next);   // 같은 문구로 되돌리면 기존 요청·승인과 다시 연결
      saveJourney(next);
      return next;
    };

    const run = () => {
      const j = sync();
      j.checkedKey = j.text.trim() ? journeyKey(j) : '';
      saveJourney(j);
      paintSingle(root);
    };

    p.querySelector('[data-act="run"]').addEventListener('click', run);
    el('text').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); });
    el('text').addEventListener('input', () => { sync(); paintSingle(root); });
    el('channel').addEventListener('change', () => { sync(); paintSingle(root); });
    el('category').addEventListener('change', () => { sync(); paintSingle(root); });
    el('product').addEventListener('change', () => { sync(); paintSingle(root); });

    p.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const j = loadJourney();
      if (btn.dataset.act === 'request') {
        const s = journeyState(j);
        if (!s.canRequest) {
          // 요청할 수 없는 이유를 바로 알려 줌 (버튼이 반응하지 않는 것처럼 보이지 않게)
          if (s.item && s.item.status !== '반려') return goHistory(root, s.item.id, s.item.status === '승인' ? '이미 승인된 문구입니다.' : '이미 검토 요청한 문구입니다. 심의 이력에서 확인하세요.');
          const msg = !s.r ? '먼저 [문구 점검하기]를 눌러 주세요.'
            : s.item ? '반려된 문구입니다. 반려 의견대로 고친 뒤 다시 점검하고 요청하세요.'
            : s.r.verdict === 'BLOCK' ? 'BLOCK(사용 불가) 문구는 검토 요청을 할 수 없습니다. 걸린 표현을 고친 뒤 다시 점검하세요.'
            : '지금 단계에서는 검토 요청을 할 수 없습니다.';
          toast(msg);
          const rm = el('roadmsg');
          rm.classList.remove('cmp-flash'); void rm.offsetWidth; rm.classList.add('cmp-flash');
          return;
        }
        j.historyId = linkedHistoryId(j, true) || addHistory(j.text.trim(), s.r);   // 같은 문구가 이미 대기 중이면 중복 요청하지 않음
        saveJourney(j);
        paintSingle(root);
        goHistory(root, j.historyId, '검토 요청을 보냈습니다. 검토자 이름을 넣고 승인하거나 반려하세요.');
      } else if (btn.dataset.act === 'copy-approved') {
        const s = journeyState(j);
        if (!s.item || s.item.status !== '승인') return;
        copyText(s.item.text).then(ok => toast(ok ? '승인된 문구를 복사했습니다.' : '복사하지 못했습니다. 문구 칸에서 직접 복사하세요.'));
      } else if (btn.dataset.act === 'new') {
        saveJourney({ text: '', channel: j.channel, product: j.product, category: j.category, checkedKey: '', historyId: null });
        el('text').value = '';
        paintSingle(root);
        el('text').focus();
      } else if (btn.dataset.act === 'ai') {
        runAi(root, j);
      } else if (btn.dataset.act === 'ai-apply') {
        const rw = j.ai && j.ai.result && j.ai.result.rewrite;
        if (!rw) return;
        el('text').value = rw;
        run();   // 바꾼 문장은 규칙으로 다시 점검 (AI 결과는 문구가 바뀌어 자동으로 숨김)
        el('text').focus();
      }
    });

    paintSingle(root);
  }

  /** 같은 문구·채널·기준으로 이미 요청(대기)했거나 승인된 이력 id. pendingOnly면 대기 중인 것만 */
  function linkedHistoryId(j, pendingOnly) {
    const text = j.text.trim();
    if (!text) return null;
    const hit = loadHistory().find(x => x.text === text && x.channel === j.channel && (x.category || 'FOOD') === j.category && (x.product || '') === (j.product || '')
      && (x.status === '검토 요청' || (!pendingOnly && x.status === '승인')));
    return hit ? hit.id : null;
  }

  /** 심의 이력 탭으로 넘어가서 해당 요청을 눈에 띄게 표시 */
  function goHistory(root, id, msg) {
    const tab = root.querySelector('.cmp-tab[data-tab="history"]');
    if (tab) tab.click();
    const p = root.querySelector('[data-panel="history"]');
    const card = id && p.querySelector(`.cmp-hist[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.add('cmp-hist-new');
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const reviewer = p.querySelector('[data-el="reviewer"]');
    if (reviewer && !reviewer.value) reviewer.focus({ preventScroll: true });
    if (msg) toast(msg);
  }

  /** AI 2차 판정 요청 → 진행 상태(journey.ai)에 저장 */
  async function runAi(root, j) {
    const p = root.querySelector('[data-panel="single"]');
    const box = p.querySelector('[data-el="ai"]');
    const s = journeyState(j);
    if (!s.r || p.dataset.aiBusy === '1') return;
    const key = journeyKey(j);
    p.dataset.aiBusy = '1';
    p.querySelector('[data-act="ai"]').disabled = true;
    box.innerHTML = `<div class="cmp-ai cmp-ai-wait"><p class="cmp-muted">${icon('spark')} AI가 문구를 검토하는 중입니다… (보통 10~40초)</p></div>`;
    box.dataset.key = 'busy';
    try {
      const result = await api('/api/compliance/ai-review', {
        text: j.text.trim(), channel: DATA.channels[j.channel] || j.channel, category: j.category, product: productBrief(j.product),
        rule: { verdict: s.r.verdict, codes: s.r.codes, terms: s.r.findings.flatMap(f => f.terms) },
        rules: rules().map(r => ({ code: r.code, name: r.name, verdict: r.verdict, reason: r.reason }))
      });
      const cur = loadJourney();
      if (journeyKey(cur) === key) {   // 기다리는 동안 문구가 바뀌었으면 버림
        cur.ai = { key, at: Date.now(), model: result.model || '', result };
        saveJourney(cur);
      }
      p.dataset.aiBusy = '';
      box.dataset.key = '';
      paintSingle(root);
    } catch (e) {
      p.dataset.aiBusy = '';
      box.innerHTML = `<p class="cmp-note cmp-note-block">AI 2차 판정 실패: ${esc(e.message)}</p>`;
      box.dataset.key = 'error';
      box.dataset.errFor = key;
      paintSingle(root);
    }
  }

  /* 일괄 심의 */

  function batchHTML() {
    return `
<div class="cmp-card-head"><h3>CSV 일괄 심의</h3><span class="cmp-tag">R1~R12 · 1차 참고용</span></div>
<p class="cmp-muted"><code>copy</code> 열이 있는 CSV를 올리면 한 줄씩 판정합니다 (최대 1MB · ${MAX_ROWS}행 · UTF-8 권장). <b>PASS(규칙 미탐지)는 법적 승인이 아닙니다.</b></p>
<div class="cmp-row">
  <label class="cmp-field"><span>CSV 파일</span><input type="file" accept=".csv,text/csv" class="cmp-input" data-el="file"></label>
  <label class="cmp-field"><span>채널</span><select class="cmp-input" data-el="channel">${channelOptions('amazon')}</select></label>
  <label class="cmp-field"><span>제품</span><select class="cmp-input" data-el="product">${productOptions('jelly')}</select></label>
</div>
<div class="cmp-actions">
  <button type="button" class="cmp-btn" data-act="sample">양식 CSV 받기</button>
  <button type="button" class="cmp-btn cmp-primary" data-act="download" disabled>결과 CSV 받기</button>
</div>
<div data-el="out" aria-live="polite"></div>`;
  }

  function wireBatch(root) {
    const p = root.querySelector('[data-panel="batch"]');
    const el = n => p.querySelector(`[data-el="${n}"]`);
    const dlBtn = p.querySelector('[data-act="download"]');
    let copies = null;
    let results = null;

    function run() {
      if (!copies) return;
      const channel = el('channel').value;
      const product = el('product').value;
      results = copies.map(text => ({ text, r: review(text, { channel, product }) }));
      const count = { BLOCK: 0, REVISE: 0, COND: 0, REVIEW: 0, PASS: 0 };
      results.forEach(x => { count[x.r.verdict]++; });
      el('out').innerHTML = `
<p class="cmp-summary">${results.length}행 판정 · ${Object.keys(count).map(v => `${badge(v)} ${count[v]}`).join(' ')}</p>
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>#</th><th>문구</th><th>판정</th><th>규칙</th><th>걸린 표현</th></tr></thead>
  <tbody>${results.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.text)}</td><td>${badge(x.r.verdict)}</td>
    <td>${x.r.codes.join(', ') || '—'}</td><td>${esc(x.r.findings.flatMap(f => f.terms).join(', ')) || '—'}</td></tr>`).join('')}</tbody>
</table></div>`;
      dlBtn.disabled = false;
    }

    function reject(msg) {
      copies = null; results = null; dlBtn.disabled = true;
      el('out').innerHTML = `<p class="cmp-note cmp-note-block">${msg}</p>`;
    }

    el('file').addEventListener('change', async () => {
      const file = el('file').files[0];
      if (!file) return;
      if (file.size > MAX_CSV_BYTES) return reject(`파일이 1MB를 넘습니다 (${Math.ceil(file.size / 1024)}KB). 나눠서 올려 주세요.`);
      const rows = parseCSV(await file.text());
      const header = (rows[0] || []).map(h => h.trim().toLowerCase());
      const col = header.indexOf('copy');
      if (col === -1) return reject('첫 줄에 <code>copy</code> 열이 없습니다.');
      const body = rows.slice(1);
      copies = body.slice(0, MAX_ROWS).map(r => (r[col] || '').trim()).filter(Boolean);
      run();
      if (body.length > MAX_ROWS) {
        el('out').insertAdjacentHTML('afterbegin', `<p class="cmp-note">${body.length}행 중 앞의 ${MAX_ROWS}행만 판정했습니다.</p>`);
      }
    });
    el('channel').addEventListener('change', run);
    el('product').addEventListener('change', run);

    dlBtn.addEventListener('click', () => {
      if (!results) return;
      const rows = [['copy', 'verdict', 'label', 'codes', 'terms']].concat(
        results.map(x => [x.text, x.r.verdict, LABEL[x.r.verdict], x.r.codes.join(' '), x.r.findings.flatMap(f => f.terms).join('; ')]));
      download('review', toCSV(rows));
    });

    p.querySelector('[data-act="sample"]').addEventListener('click', () => {
      const rows = [['copy']].concat(DATA.safePhrases.map(s => [s.text]), DATA.selfTest.filter(t => !t.channel && !t.category).map(t => [t.text]));
      download('sample', toCSV(rows));
    });
  }

  /* 심의 이력 */

  function historyItemHTML(item) {
    const pending = item.status === '검토 요청';
    return `
<article class="cmp-hist" data-id="${esc(item.id)}">
  <div class="cmp-finding-head">${badge(item.verdict)} <span class="cmp-chip">${esc(item.status)}</span>
    <span class="cmp-muted">${esc(DATA.channels[item.channel] || item.channel)}${item.product ? ` · ${esc(productLabel(item.product))}` : ''} · 요청 ${fmt(item.requestedAt)}</span></div>
  <p class="cmp-quote">${esc(item.text)}</p>
  ${trBlock(item.text)}
  ${pending ? `
  <div class="cmp-row">
    <label class="cmp-field cmp-grow"><span>코멘트</span><input class="cmp-input" data-el="comment" placeholder="승인·반려 이유"></label>
  </div>
  <div class="cmp-actions">
    <button type="button" class="cmp-btn cmp-primary" data-act="approve" ${item.verdict === 'BLOCK' ? 'disabled title="BLOCK 판정은 승인할 수 없습니다"' : ''}>승인</button>
    <button type="button" class="cmp-btn" data-act="reject">반려</button>
    ${item.verdict === 'BLOCK' ? '<span class="cmp-muted">BLOCK 판정은 승인할 수 없습니다. 문구를 고쳐 다시 심의하세요.</span>' : ''}
  </div>` : `
  <p class="cmp-muted">${esc(item.status)} · ${esc(item.decidedBy)} · ${fmt(item.decidedAt)}${item.comment ? ' · ' + esc(item.comment) : ''}</p>`}
</article>`;
  }

  function renderHistory(root) {
    const p = root.querySelector('[data-panel="history"]');
    const list = loadHistory();
    const reviewer = p.dataset.reviewer || '';
    paintKpis(root);
    p.innerHTML = `
<div class="cmp-card-head"><h3>심의 이력</h3><span class="cmp-tag">검토 요청 → 담당자 승인·반려</span></div>
<div class="cmp-row">
  <label class="cmp-field"><span>검토자</span><input class="cmp-input" data-el="reviewer" value="${esc(reviewer)}" placeholder="이름"></label>
</div>
<p data-el="msg" aria-live="polite"></p>
${list.length ? '' : '<p class="cmp-muted">아직 이력이 없습니다. 단건 심의에서 판정한 뒤 "검토 요청"을 누르세요.</p>'}
<div class="cmp-list">${list.map(historyItemHTML).join('')}</div>`;

    p.oninput = e => { if (e.target.dataset.el === 'reviewer') p.dataset.reviewer = e.target.value; };
    p.onclick = e => {
      const btn = e.target.closest('[data-act="approve"], [data-act="reject"]');   // 번역 버튼은 render에서 처리
      if (!btn) return;
      const card = btn.closest('[data-id]');
      const name = (p.dataset.reviewer || '').trim();
      if (!name) {
        p.querySelector('[data-el="msg"]').innerHTML = '<span class="cmp-note cmp-note-block">검토자 이름을 먼저 입력하세요.</span>';
        const rv = p.querySelector('[data-el="reviewer"]');
        rv.focus();
        rv.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const all = loadHistory();
      const item = all.find(x => x.id === card.dataset.id);
      if (!item || item.status !== '검토 요청') return;
      if (btn.dataset.act === 'approve' && item.verdict === 'BLOCK') return;
      item.status = btn.dataset.act === 'approve' ? '승인' : '반려';
      item.decidedAt = Date.now();
      item.decidedBy = name;
      item.comment = (card.querySelector('[data-el="comment"]').value || '').trim();
      saveHistory(all);
      renderHistory(root);
      toast(item.status === '승인' ? '승인했습니다. 단건 심의에서 승인된 문구를 복사할 수 있습니다.' : '반려했습니다. 요청자는 단건 심의에서 반려 의견을 봅니다.');
    };
  }

  /* 규칙·검증 */

  function rulesHTML() {
    return `
<h3 class="cmp-h3">규칙 R1~R12</h3>
<p class="cmp-muted">근거 구분은 초안입니다 {확인 필요: 규제 담당 확인 후 확정}. 면책 별표(*)를 붙여도 판정은 바뀌지 않습니다.</p>
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>코드</th><th>이름</th><th>기본 판정</th><th>근거 구분</th><th>걸리는 예</th><th>대신 쓸 방향</th></tr></thead>
  <tbody>${DATA.rules.map(r => `<tr><td><b>${r.code}</b></td><td>${esc(r.name)}</td><td>${badge(r.verdict)}</td>
    <td>${r.basis.map(b => BASIS[b]).join('<br>')}</td><td>${esc(r.terms.slice(0, 4).concat(r.ko.slice(0, 2)).join(', '))}</td><td>${esc(r.alt)}</td></tr>`).join('')}</tbody>
</table></div>

<h3 class="cmp-h3">한국 → 미국 표현 매핑 · ${DATA.mappings.length}쌍</h3>
<p class="cmp-muted">R1~R12 기준 초안입니다 (영어 대안은 모두 규칙 점검 PASS 확인). 검토자·검토일이 빈 항목은 규제 담당 검토 전이며, <code>[확인 필요]</code>는 제품 팩트시트로 채웁니다.</p>
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>한국 표현</th><th>미국 대안</th><th>규칙</th><th>검토자</th><th>검토일</th></tr></thead>
  <tbody>${DATA.mappings.map(m => `<tr><td>${esc(m.ko)}</td><td>${esc(m.us)}${m.note ? `<br><span class="cmp-muted">${esc(m.note)}</span>` : ''}</td>
    <td>${esc(m.code)}</td><td>${esc(m.reviewer) || '—'}</td><td>${esc(m.reviewedAt) || '—'}</td></tr>`).join('')}</tbody>
</table></div>

<h3 class="cmp-h3">규칙 검증</h3>
<p class="cmp-muted">규칙·데이터를 바꿀 때마다 실행합니다. 목표: 경고장 문구 PASS 0개 · 안전 문구 PASS 아닌 것 0개.</p>
<div class="cmp-actions"><button type="button" class="cmp-btn cmp-primary" data-act="validate">규칙 검증 실행</button></div>
<div data-el="validation" aria-live="polite"></div>`;
  }

  function validate() {
    const quotes = DATA.warningQuotes.map(q => ({ q, r: review(q.text, { channel: 'b2c' }) }));
    const safe = DATA.safePhrases.map(s => ({ s, r: review(s.text, { channel: 'b2c' }) }));
    const self = DATA.selfTest.map(t => ({ t, r: review(t.text, { channel: t.channel || 'b2c', category: t.category }) }));
    return {
      quotes, quotesPass: quotes.filter(x => x.r.verdict === 'PASS'),
      safe, safeBad: safe.filter(x => x.r.verdict !== 'PASS'),
      self, selfBad: self.filter(x => x.r.verdict !== x.t.expect)
    };
  }

  function wireRules(root) {
    const p = root.querySelector('[data-panel="rules"]');
    p.querySelector('[data-act="validate"]').addEventListener('click', () => {
      const v = validate();
      const ok = b => (b ? '<span class="cmp-ok">통과</span>' : '<span class="cmp-fail">실패</span>');
      p.querySelector('[data-el="validation"]').innerHTML = `
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>항목</th><th>대상</th><th>결과</th><th>상태</th></tr></thead>
  <tbody>
    <tr><td>경고장 원문 중 PASS</td><td>${v.quotes.length}개</td>
      <td>${v.quotes.length ? `${v.quotesPass.length}개` : '자료 없음'}</td>
      <td>${v.quotes.length ? ok(v.quotesPass.length === 0) : '<span class="cmp-fail">실행 불가 · 시연본 경고장 문구 이관 필요</span>'}</td></tr>
    <tr><td>안전 문구 중 PASS 아닌 것</td><td>${v.safe.length}개 <span class="cmp-muted">(목표 12개)</span></td><td>${v.safeBad.length}개</td><td>${ok(v.safeBad.length === 0)}</td></tr>
    <tr><td>엔진 자체 점검 예문 (팀 작성)</td><td>${v.self.length}개</td><td>기대와 다름 ${v.selfBad.length}개</td><td>${ok(v.selfBad.length === 0)}</td></tr>
  </tbody>
</table></div>
${v.quotesPass.concat(v.safeBad).length ? `<h4>확인할 문구</h4><ul>${v.quotesPass.map(x => `<li>경고장 문구가 PASS: ${esc(x.q.text)}</li>`).join('')}
  ${v.safeBad.map(x => `<li>안전 문구가 ${x.r.verdict}: ${esc(x.s.text)} (${x.r.codes.join(', ')})</li>`).join('')}</ul>` : ''}
${v.selfBad.length ? `<h4>기대와 다른 예문</h4><ul>${v.selfBad.map(x => `<li>${esc(x.t.text)} → 기대 ${x.t.expect}, 결과 ${x.r.verdict}</li>`).join('')}</ul>` : ''}
<p class="cmp-muted">CS 답변 템플릿 C1~C10 점검은 '고객 응대 → 답변 템플릿'에서 확인합니다.</p>`;
    });
  }

  /* ───────── 규제 모니터링 ─────────
     ① 서버 수집 결과: server/compliance/가 만든 parts/compliance/monitor-data.js(window.REBOOT_MONITOR)를 읽기만 함
        첫 확인은 '기준 저장'만, 이후 🆕 새 항목 · 🔄 변경 표시. 경고장 문구는 '사례집 후보' → 사람이 승인
     ② Federal Register: 키 없이 브라우저에서 바로 (CORS 허용 확인 2026-10-23)
     ③ openFDA 식품 리콜: 키 없이 브라우저에서 바로 (404는 0건) */

  function monitorHTML() {
    return `
<div class="cmp-card-head"><h3>서버 수집 결과 · 사례집 후보</h3>
  <button type="button" class="cmp-btn" data-act="monitor-refresh" disabled>${icon('refresh')} 지금 수집</button></div>
<div data-el="refreshmsg" aria-live="polite"></div>
<div data-el="server"></div>

<h3 class="cmp-h3">Federal Register 새 공고</h3>
<p class="cmp-muted">FDA·FTC·CBP·USTR 공고를 최신순으로 조회합니다. 키 없이 조회하며 결과는 1분 동안 캐시합니다.
  <button type="button" class="cmp-btn cmp-btn-sm" data-act="goto" data-goto="agencies">각 기관이 하는 일 보기</button></p>
<div class="cmp-row">
  <label class="cmp-field cmp-grow"><span>검색어</span><input class="cmp-input" data-el="frq" value="food labeling"></label>
  <label class="cmp-field"><span>기관</span><select class="cmp-input" data-el="fra">
    <option value="">4개 기관 전체</option>${Object.entries(FR_AGENCIES).map(([slug, name]) => `<option value="${slug}">${name}</option>`).join('')}</select></label>
  <div class="cmp-actions"><button type="button" class="cmp-btn cmp-primary" data-act="fr-search">조회</button></div>
</div>
<div data-el="frout" aria-live="polite"></div>

<h3 class="cmp-h3">openFDA 식품 리콜</h3>
<p class="cmp-muted">openFDA 식품 리콜(<code>food/enforcement</code>)을 리콜 사유로 조회합니다. 키 없이 조회하며 결과는 1분 동안 캐시합니다.</p>
<div class="cmp-row">
  <label class="cmp-field cmp-grow"><span>리콜 사유 검색어</span><input class="cmp-input" data-el="q" value="undeclared"></label>
  <div class="cmp-actions"><button type="button" class="cmp-btn cmp-primary" data-act="search">조회</button></div>
</div>
<div data-el="out" aria-live="polite"></div>`;
  }

  /* ① 서버 수집 결과 */

  function monitorData() {
    const m = global.REBOOT_MONITOR;
    return m && Array.isArray(m.sources) && m.sources.length ? m : null;
  }

  // 항목 내용이 바뀌었는지 비교하는 짧은 지문 (보안 용도 아님)
  function sig(item) {
    const s = JSON.stringify([item.title || '', item.date || '', item.summary || '', item.quotes || []]);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function loadMonitor() {
    const m = store.get(KEY.monitor, {}) || {};
    return { baseline: m.baseline || null, baselineAt: m.baselineAt || null, candidates: m.candidates || {} };
  }
  function saveMonitor(m) { store.set(KEY.monitor, m); }

  /** 기준과 비교해 항목마다 mark: 'new' | 'changed' | 'same' | null(기준 없음) */
  function diffMonitor(data, baseline) {
    return data.sources.map(src => {
      const base = baseline && baseline[src.id];
      const items = (Array.isArray(src.items) ? src.items : []).map(item => {
        let mark = null;
        if (base) mark = !(item.id in base) ? 'new' : base[item.id] !== sig(item) ? 'changed' : 'same';
        return Object.assign({}, item, { mark });
      });
      return { id: src.id, label: src.label || src.id, items };
    });
  }

  function baselineOf(data) {
    const out = {};
    data.sources.forEach(src => {
      out[src.id] = {};
      (Array.isArray(src.items) ? src.items : []).forEach(item => { out[src.id][item.id] = sig(item); });
    });
    return out;
  }

  /** 경고장 원문 문구 → 사례집 후보. 판정 결과가 PASS면 규칙 보강이 필요하다는 뜻 */
  function candidatesOf(sources, saved) {
    const list = [];
    sources.forEach(src => src.items.forEach(item => (Array.isArray(item.quotes) ? item.quotes : []).forEach((text, i) => {
      const id = `${src.id}:${item.id}:${i}`;
      const st = saved[id] || {};
      list.push({ id, text: String(text), item, source: src.label, r: review(text, { channel: 'b2c' }), status: st.status || '후보', by: st.by || '', at: st.at || null });
    })));
    return list;
  }

  const MARK = { new: '🆕 새 항목', changed: '🔄 변경', same: '', null: '' };
  // 한글 제목·요약 (서버가 Claude로 만든 참고용 · 원문이 기준)
  function koLine(s) { return s ? `<span class="cmp-ko" lang="ko">${esc(s)}</span>` : ''; }

  /** 조회 결과 표(브라우저에서 바로 부른 Federal Register·openFDA)에 한글 제목·요약을 나중에 채움 */
  async function fillKo(out, rows) {
    const h = await serverHealth();
    if (!h || !h.ai || !rows.length) return;
    const note = out.querySelector('[data-ko-note]');
    if (note) note.textContent = ' · 한글 요약 만드는 중…';
    try {
      const { items } = await api('/api/compliance/ko', { items: rows.map(r => ({ id: r.id, source: r.source, title: r.title, summary: r.summary })) });
      items.forEach(k => {
        const cells = out.querySelectorAll(`[data-ko-id="${CSS.escape(k.id)}"]`);
        cells.forEach(c => { c.innerHTML = koLine(c.dataset.koField === 'title' ? k.title_ko : k.summary_ko); });
      });
      if (note) note.textContent = ' · 한글 요약: AI 참고용';
    } catch (e) {
      if (note) note.textContent = ` · 한글 요약 실패 (${e.message})`;
    }
  }
  const FOLD_OPEN = new Map();   // 출처 id → 펼침 여부 (이 화면을 연 동안만 기억)

  function renderServer(root) {
    const box = root.querySelector('[data-panel="monitor"] [data-el="server"]');
    const data = monitorData();
    if (!data) {
      box.innerHTML = `<p class="cmp-note">아직 서버 수집 결과가 없습니다. 위의 [지금 수집]을 누르면(30초~1분) 서버에 저장되어 여기에 표시됩니다. 하루 1회 자동 수집을 켜 두었다면 매일 08:00에도 모읍니다. 그 전에는 아래 Federal Register·openFDA 조회를 쓰세요.</p>`;
      return;
    }
    const m = loadMonitor();
    const sources = diffMonitor(data, m.baseline);
    const all = sources.flatMap(s => s.items);
    const nNew = all.filter(i => i.mark === 'new').length;
    const nChanged = all.filter(i => i.mark === 'changed').length;
    const gen = data.generatedAt ? Date.parse(data.generatedAt) : NaN;
    const stale = !isNaN(gen) && Date.now() - gen > STALE_HOURS * 3600 * 1000;
    const cands = candidatesOf(sources, m.candidates);
    const approved = cands.filter(c => c.status === '승인');
    const reviewer = box.dataset.reviewer || '';

    box.innerHTML = `
<p class="cmp-summary">서버 수집 ${isNaN(gen) ? '시각 미상' : fmt(gen)}${stale ? ` <span class="cmp-fail">· ${STALE_HOURS}시간 넘게 갱신 안 됨</span>` : ''}
  · 항목 ${all.length}개${m.baseline ? ` · 🆕 ${nNew} · 🔄 ${nChanged} <span class="cmp-muted">(기준 ${fmt(m.baselineAt)})</span>` : ''}</p>
${m.baseline ? '' : '<p class="cmp-note">첫 확인입니다. 지금 목록을 기준으로 저장하면 다음부터 새 항목·변경 항목이 표시됩니다.</p>'}
<div class="cmp-actions">
  <button type="button" class="cmp-btn${m.baseline ? '' : ' cmp-primary'}" data-act="baseline">${m.baseline ? '확인 완료 · 기준 다시 저장' : '기준 저장'}</button>
  <button type="button" class="cmp-btn" data-act="fold-all" data-open="1">모두 펼치기</button>
  <button type="button" class="cmp-btn" data-act="fold-all" data-open="">모두 접기</button>
</div>
<div class="cmp-folds">${sources.map(src => {
    const hot = src.items.filter(i => i.mark === 'new' || i.mark === 'changed').length;
    // 펼침 상태는 다시 그려도 유지 (처음에는 🆕·🔄 항목이 있는 출처만 펼침)
    const open = FOLD_OPEN.has(src.id) ? FOLD_OPEN.get(src.id) : hot > 0;
    return `
<details class="cmp-fold" data-src="${esc(src.id)}"${open ? ' open' : ''}>
  <summary><span class="cmp-fold-title">${esc(src.label)}</span>
    <span class="cmp-tag">${src.items.length}개</span>${hot ? `<span class="cmp-chip">🆕·🔄 ${hot}</span>` : ''}
    <span class="cmp-fold-latest cmp-muted">${src.items[0] && src.items[0].date ? `최근 ${esc(src.items[0].date)}` : ''}</span></summary>
  <div class="cmp-table-wrap"><table class="cmp-table">
    <thead><tr><th></th><th>날짜</th><th>제목</th><th>요약</th></tr></thead>
    <tbody>${src.items.length ? src.items.map(i => `<tr${i.mark === 'new' || i.mark === 'changed' ? ' class="cmp-row-hot"' : ''}>
      <td class="cmp-nowrap">${MARK[i.mark]}</td><td class="cmp-nowrap">${esc(i.date || '—')}</td>
      <td>${link(i.url, i.title || i.id)}${koLine(i.title_ko)}${i.firm ? `<span class="cmp-firm cmp-muted">${esc(i.firm)}</span>` : ''}</td>
      <td>${esc(String(i.summary || '').slice(0, 240))}${koLine(i.summary_ko)}</td></tr>`).join('') : '<tr><td colspan="4" class="cmp-muted">항목 없음</td></tr>'}</tbody>
  </table></div>
</details>`;
  }).join('')}</div>

<h4 class="cmp-h4">사례집 후보 ${cands.length}개 · 승인 ${approved.length}개</h4>
<p class="cmp-muted">수집한 경고장 문구는 자동으로 사례집이나 규칙에 들어가지 않습니다. 사람이 승인한 문구만 내려받아 <code>data.js</code>의 <code>warningQuotes</code>에 옮기고 규칙 검증을 다시 실행합니다. <b>PASS로 나온 후보</b>는 규칙이 놓친 문구이니 규칙 보강이 필요합니다.</p>
${cands.length ? `
<div class="cmp-row">
  <label class="cmp-field"><span>검토자</span><input class="cmp-input" data-el="reviewer" value="${esc(reviewer)}" placeholder="이름"></label>
  <div class="cmp-actions"><button type="button" class="cmp-btn" data-act="export-cands" ${approved.length ? '' : 'disabled'}>승인된 후보 CSV 받기</button></div>
</div>
<p data-el="cmsg" aria-live="polite"></p>
<div class="cmp-list">${cands.map(c => `
  <article class="cmp-hist" data-cid="${esc(c.id)}">
    <div class="cmp-finding-head">${badge(c.r.verdict)} <span class="cmp-chip">${esc(c.status)}</span>
      ${c.r.verdict === 'PASS' ? '<span class="cmp-fail">규칙이 놓친 문구 → 규칙 보강 필요</span>' : ''}
      <span class="cmp-muted">${esc(c.source)} · ${esc(c.item.firm || c.item.title || '')} · ${esc(c.item.date || '')}</span></div>
    <p class="cmp-quote">${highlight(c.text, c.r.findings.flatMap(f => f.terms))}</p>
    ${trBlock(c.text)}
    ${c.status === '후보' ? `<div class="cmp-actions">
      <button type="button" class="cmp-btn cmp-primary" data-act="cand-approve">사례집 후보 승인</button>
      <button type="button" class="cmp-btn" data-act="cand-reject">제외</button></div>` :
      `<p class="cmp-muted">${esc(c.status)} · ${esc(c.by)} · ${fmt(c.at)} <button type="button" class="cmp-btn cmp-btn-sm" data-act="cand-reset">되돌리기</button></p>`}
  </article>`).join('')}</div>` : '<p class="cmp-muted">이번 수집 결과에 경고장 원문 문구(quotes)가 없습니다.</p>'}`;

    box.oninput = e => { if (e.target.dataset.el === 'reviewer') box.dataset.reviewer = e.target.value; };
    box.querySelectorAll('details.cmp-fold').forEach(d => d.addEventListener('toggle', () => FOLD_OPEN.set(d.dataset.src, d.open)));
    box.onclick = e => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled || btn.dataset.act === 'translate') return;   // 번역 버튼은 render에서 처리
      const act = btn.dataset.act;
      if (act === 'fold-all') {
        box.querySelectorAll('details.cmp-fold').forEach(d => { d.open = !!btn.dataset.open; });
        return;
      }
      const cur = loadMonitor();

      if (act === 'baseline') {
        cur.baseline = baselineOf(data);
        cur.baselineAt = Date.now();
        saveMonitor(cur);
        toast('지금 목록을 기준으로 저장했습니다');
        return renderServer(root);
      }
      if (act === 'export-cands') {
        const rows = [['text', 'firm', 'issued', 'url', 'source', 'verdict', 'codes', 'approvedBy', 'approvedAt']].concat(
          approved.map(c => [c.text, c.item.firm || '', c.item.date || '', c.item.url || '', c.source, c.r.verdict, c.r.codes.join(' '), c.by, c.at ? new Date(c.at).toISOString() : '']));
        return download('casebook-candidates', toCSV(rows));
      }
      const card = btn.closest('[data-cid]');
      if (!card) return;
      const id = card.dataset.cid;
      if (act === 'cand-reset') {
        delete cur.candidates[id];
      } else {
        const name = (box.dataset.reviewer || '').trim();
        if (!name) { box.querySelector('[data-el="cmsg"]').innerHTML = '<span class="cmp-note cmp-note-block">검토자 이름을 먼저 입력하세요.</span>'; return; }
        cur.candidates[id] = { status: act === 'cand-approve' ? '승인' : '제외', by: name, at: Date.now() };
      }
      saveMonitor(cur);
      renderServer(root);
    };
  }

  /* ② ③ 외부 API 조회 (키 없음) */

  async function cached(cacheKey, q, fetcher) {
    const cache = store.get(cacheKey, {}) || {};
    const hit = cache[q];
    if (hit && Date.now() - hit.at < CACHE_TTL) return { results: hit.results, cached: true };
    const results = await fetcher();
    const next = {};
    Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at).slice(0, 9).forEach(k => { next[k] = cache[k]; });
    next[q] = { at: Date.now(), results };
    store.set(cacheKey, next);
    return { results, cached: false };
  }

  function searchFedReg(term, agency) {
    const q = term.trim();
    const agencies = FR_AGENCIES[agency] ? [agency] : Object.keys(FR_AGENCIES);
    return cached(KEY.fedreg, `${agency || 'all'}|${q}`, async () => {
      const params = ['per_page=10', 'order=newest', 'conditions[term]=' + encodeURIComponent(q)]
        .concat(agencies.map(a => 'conditions[agencies][]=' + a))
        .concat(['title', 'type', 'publication_date', 'html_url', 'document_number', 'agencies', 'abstract'].map(f => 'fields[]=' + f));
      const res = await fetch('https://www.federalregister.gov/api/v1/documents.json?' + params.join('&'));
      if (!res.ok) throw new Error(`Federal Register 응답 ${res.status}`);
      return ((await res.json()).results || []).map(x => ({
        id: x.document_number, title: x.title, type: x.type, date: x.publication_date, url: x.html_url,
        agencies: (x.agencies || []).map(a => FR_AGENCIES[a.slug]).filter(Boolean),
        abstract: x.abstract || ''
      }));
    });
  }

  function searchRecalls(query) {
    const q = query.replace(/["\\]/g, '').trim();
    return cached(KEY.openfda, q, async () => {
      const url = 'https://api.fda.gov/food/enforcement.json?search=' +
        encodeURIComponent(`reason_for_recall:"${q}"`) + '&sort=report_date:desc&limit=10';
      const res = await fetch(url);
      if (res.status === 404) return [];          // openFDA는 결과 0건을 404로 돌려줍니다
      if (!res.ok) throw new Error(`openFDA 응답 ${res.status}`);
      return ((await res.json()).results || []).map(x => ({
        recall_number: x.recall_number, firm: x.recalling_firm, product: x.product_description,
        reason: x.reason_for_recall, classification: x.classification, date: x.report_date, status: x.status
      }));
    });
  }

  function wireMonitor(root) {
    const p = root.querySelector('[data-panel="monitor"]');
    const el = n => p.querySelector(`[data-el="${n}"]`);
    const fail = (out, e) => {
      out.innerHTML = `<p class="cmp-note cmp-note-block">조회하지 못했습니다: ${esc(e.message)}. 인터넷 연결을 확인하세요.</p>`;
    };

    const goFR = async () => {
      const q = el('frq').value.trim();
      if (!q) return;
      const out = el('frout');
      out.innerHTML = '<p class="cmp-muted">조회 중…</p>';
      try {
        const { results, cached: fromCache } = await searchFedReg(q, el('fra').value);
        out.innerHTML = `<p class="cmp-muted">${results.length}건${fromCache ? ' · 캐시' : ''}<span data-ko-note></span></p>` + (results.length ? `
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>게시일</th><th>기관</th><th>유형</th><th>제목</th></tr></thead>
  <tbody>${results.map((x, i) => `<tr><td class="cmp-nowrap">${esc(x.date)}</td><td>${esc(x.agencies.join(', '))}</td><td>${esc(x.type)}</td>
    <td>${link(x.url, x.title)}<span data-ko-id="fr-${i}" data-ko-field="title"></span>
      ${x.abstract ? `<br><span class="cmp-muted">${esc(x.abstract.slice(0, 220))}${x.abstract.length > 220 ? '…' : ''}</span><span data-ko-id="fr-${i}" data-ko-field="summary"></span>` : ''}
      ${trBlock(x.abstract ? `${x.title}\n${x.abstract}` : x.title, '제목·요약 번역')}</td></tr>`).join('')}</tbody>
</table></div>` : '');
        fillKo(out, results.map((x, i) => ({ id: `fr-${i}`, source: 'Federal Register', title: x.title, summary: x.abstract || '' })));
      } catch (e) { fail(out, e); }
    };

    const goRecall = async () => {
      const q = el('q').value.trim();
      if (!q) return;
      const out = el('out');
      out.innerHTML = '<p class="cmp-muted">조회 중…</p>';
      try {
        const { results, cached: fromCache } = await searchRecalls(q);
        const date = d => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : esc(d));
        out.innerHTML = `<p class="cmp-muted">${results.length}건${fromCache ? ' · 캐시' : ''}<span data-ko-note></span></p>` + (results.length ? `
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>보고일</th><th>등급</th><th>업체</th><th>제품</th><th>리콜 사유</th></tr></thead>
  <tbody>${results.map((x, i) => `<tr><td class="cmp-nowrap">${date(x.date)}</td><td>${esc(x.classification)}</td><td>${esc(x.firm)}</td>
    <td>${esc((x.product || '').slice(0, 160))}<span data-ko-id="fda-${i}" data-ko-field="title"></span></td>
    <td>${esc((x.reason || '').slice(0, 200))}<span data-ko-id="fda-${i}" data-ko-field="summary"></span></td></tr>`).join('')}</tbody>
</table></div>` : '');
        fillKo(out, results.map((x, i) => ({ id: `fda-${i}`, source: 'openFDA food recall', title: x.product || '', summary: `${x.firm || ''} · ${x.reason || ''}` })));
      } catch (e) { fail(out, e); }
    };

    p.querySelector('[data-act="fr-search"]').addEventListener('click', goFR);
    el('frq').addEventListener('keydown', e => { if (e.key === 'Enter') goFR(); });
    p.querySelector('[data-act="search"]').addEventListener('click', goRecall);
    el('q').addEventListener('keydown', e => { if (e.key === 'Enter') goRecall(); });

    // 서버에서 지금 수집 (키가 필요한 Regulations.gov · CourtListener 포함) → monitor-data.js 저장 + 화면 갱신
    const refreshBtn = p.querySelector('[data-act="monitor-refresh"]');
    serverHealth().then(h => {
      refreshBtn.disabled = !h;
      refreshBtn.title = h ? 'openFDA · Regulations.gov · CourtListener를 지금 수집합니다 (30초~1분)'
        : '서버 상태를 확인하지 못했습니다. 새로고침해 주세요';
    });
    refreshBtn.addEventListener('click', async () => {
      const msg = el('refreshmsg');
      refreshBtn.disabled = true;
      msg.innerHTML = '<p class="cmp-muted">수집 중… 출처 3곳을 차례로 확인합니다 (30초~1분).</p>';
      try {
        const data = await api('/api/compliance/monitor/refresh');
        global.REBOOT_MONITOR = data;
        const errs = Array.isArray(data.errors) ? data.errors : [];
        msg.innerHTML = errs.length
          ? `<p class="cmp-note cmp-note-block">일부 출처 수집 실패: ${errs.map(x => `${esc(x.label)} (${esc(x.error)})`).join(' · ')}</p>`
          : '<p class="cmp-note">수집 완료 · parts/compliance/monitor-data.js에 저장했습니다.</p>';
        renderServer(root);
      } catch (e) {
        msg.innerHTML = `<p class="cmp-note cmp-note-block">수집 실패: ${esc(e.message)}</p>`;
      }
      refreshBtn.disabled = false;
    });
  }

  /* ───────── 기관 안내 ───────── */

  const FR_SLUG = {};
  Object.entries(FR_AGENCIES).forEach(([slug, code]) => { FR_SLUG[code] = slug; });

  function agenciesHTML() {
    const list = DATA.agencies || [];
    const byCode = {};
    list.forEach(a => { byCode[a.code] = a; });
    const chip = code => `<span class="cmp-agency-chip cmp-ag-${esc(code)}">${esc(code)}</span>`;

    return `
<p class="cmp-muted">미국에 제품을 팔 때 만나는 기관 4곳을 쉬운 말로 정리했습니다 (2026-10-23 작성). 참고용 요약이며 법률 자문이 아닙니다. 정확한 기준은 각 기관 공식 사이트와 관세사·규제 전문가에게 확인하세요.</p>

<h3 class="cmp-h3">한눈에 보기</h3>
<div class="cmp-table-wrap"><table class="cmp-table">
  <thead><tr><th>기관</th><th>한 줄 요약</th><th>어기면</th><th>대시보드 규칙</th></tr></thead>
  <tbody>${list.map(a => `<tr><td class="cmp-nowrap">${chip(a.code)}<br><span class="cmp-muted">${esc(a.ko)}</span></td>
    <td>${esc(a.oneLine)}</td><td>${esc(a.risk)}</td><td>${esc(a.rules)}</td></tr>`).join('')}</tbody>
</table></div>

<h3 class="cmp-h3">수출 단계별로 보면</h3>
<ol class="cmp-flow">${(DATA.agencyFlow || []).map((f, i) => `
  <li class="cmp-flow-step"><span class="cmp-flow-no">${i + 1}</span>
    <b>${esc(f.step)}</b><span class="cmp-flow-who">${f.who.map(chip).join(' ')}</span>
    <span class="cmp-muted">${esc(f.what)}</span></li>`).join('')}</ol>

<h3 class="cmp-h3">기관별 자세히</h3>
<div class="cmp-agencies">${list.map(a => `
  <article class="cmp-agency cmp-ag-border-${esc(a.code)}">
    <header class="cmp-agency-head"><span class="cmp-agency-icon" aria-hidden="true">${esc(a.icon)}</span>
      <div><h4>${esc(a.code)} · ${esc(a.ko)}</h4><p class="cmp-muted">${esc(a.en)}</p></div></header>
    <p class="cmp-agency-one">${esc(a.oneLine)}</p>
    <h5>이 기관이 하는 일</h5>
    <ul>${a.role.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h5>REBOOT에 해당하는 것</h5>
    <ul>${a.forUs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${a.bad ? `<h5>문구 예시</h5>
    <p class="cmp-ex"><span class="cmp-badge cmp-v-BLOCK">피할 문구</span> <code>${esc(a.bad)}</code></p>
    <p class="cmp-ex"><span class="cmp-badge cmp-v-PASS">쓸 수 있는 방향</span> <code>${esc(a.good)}</code></p>` : ''}
    <p class="cmp-muted"><b>어기면</b> ${esc(a.risk)}</p>
    <div class="cmp-actions">
      ${(a.goto || []).map(([tab, label]) => `<button type="button" class="cmp-btn" data-act="goto" data-goto="${esc(tab)}"${tab === 'monitor' && FR_SLUG[a.code] ? ` data-agency="${FR_SLUG[a.code]}"` : ''}>${esc(label)}</button>`).join('')}
      ${link(a.url, '공식 사이트 ↗')}
    </div>
  </article>`).join('')}</div>

<h3 class="cmp-h3">자주 나오는 용어</h3>
<dl class="cmp-terms">${(DATA.agencyTerms || []).map(t => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.desc)}</dd></div>`).join('')}</dl>`;
  }

  /* ───────── 등록 ───────── */

  function pendingCount() {
    return loadHistory().filter(x => x.status === '검토 요청').length;
  }

  REBOOT.register({
    id: 'compliance', icon: '🛡️', label: '컴플라이언스', priority: 'P0', order: 30,
    title: '좋은 카피의 시작, 안전한 표현.',
    subtitle: '광고 문구를 점검하고 미국 시장에 맞는 표현을 준비하세요.',
    render,
    summary: () => ({ label: '검토 대기 카피', value: pendingCount() })
  });
  REBOOT.expose('compliance', { review, bannedTerms, rules, translate });
})(typeof window !== 'undefined' ? window : globalThis);
