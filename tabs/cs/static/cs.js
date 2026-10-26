/* 고객 응대(CS) 파트: 메일함(새 문의 → ① 문구 검토 → ② CS 검토 → 보낼 준비 → 보냄) · 분류 · 답장 초안 · 부작용 접수 · 템플릿.
   답변은 자동으로 보내지 않습니다. Gmail은 답장 초안까지만 만들고, 실제 발송은 사람이 합니다.
   다른 파트에는 REBOOT.use('cs')로 stats · classify만 공개합니다. */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  const DATA = global.REBOOT_DATA && global.REBOOT_DATA.cs;
  if (!REBOOT || !DATA) throw new Error('cs: REBOOT core와 tabs/cs/static/data.js를 먼저 불러와야 합니다');

  const store = REBOOT.store('cs');   // 저장 키: reboot:cs:*
  const KEY = { inquiries: 'inquiries', adverse: 'adverse-events', defaults: 'reply-defaults', custTags: 'customer-tags', persona: 'persona' };
  // 문의 1건 = 저장 키 1개 (inq.<id>). 예전처럼 문의함 전체를 키 하나에 두면 두 사람이 다른 문의를 동시에 고칠 때
  // 나중에 저장한 사람의 목록이 앞사람 작업을 덮어씀 → 고친 문의만 저장 (2026-10-24)
  const INQ = 'inq.';
  const HOUR = 3600 * 1000;
  const TYPES = {};
  DATA.types.forEach(t => { TYPES[t.code] = t; });
  // 예시 문의 영어 제목의 한글 뜻 — 이미 저장된 문의에도 붙도록 저장값 대신 id로 찾음
  const SUBJECT_KO = {};
  DATA.dummyInquiries.forEach(d => { if (d.subjectKo) SUBJECT_KO[d.id] = d.subjectKo; });
  const subjectKo = i => SUBJECT_KO[i.id] ? ` <span class="cs-muted">(${esc(SUBJECT_KO[i.id])})</span>` : '';
  const DONE = ['발송 완료', '종결'];
  const TODO_RE = /\[확인 필요[^\]]*\]/g;
  const LABEL = { BLOCK: '사용 불가', REVISE: '수정 필요', COND: '조건부', REVIEW: '검토 필요', PASS: '걸린 표현 없음' };
  // 저장된 처리 상태 값은 그대로 두고 화면 이름만 바꿈 (답변 → 답장 · 2026-10-26 문구 통일)
  const STATUS_LABEL = { '답변 대기': '답장 대기' };
  function statusText(s) { return STATUS_LABEL[s] || s; }
  const PLACEHOLDER = {
    name: '고객 이름', orderNo: '주문번호', tracking: '운송장 번호', eta: '도착 예정일', brand: '브랜드명',
    product: '제품명', flavor: '제품 팩트시트의 맛', ingredients: '제품 팩트시트의 성분', allergens: '제품 팩트시트의 알레르기 성분',
    refundPolicy: '환불·교환 정책', qualityDue: '품질팀 회신 기한', salesDue: '영업 회신 기한', pricing: '현재 가격·프로모션'
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
      확정 안 된 값(내부 제품명 미정 · 맛 임시)은 [확인 필요]로 남겨 문구 검토를 막음 */
  const PRODUCT_FACTS = ['ingredients', 'allergens'];
  function facts(inq) {
    let s = {};
    try { s = REBOOT.use('settings').facts() || {}; } catch (e) { s = {}; }
    const p = inq ? productInfo(inq.product) : null;
    const out = { brand: (DATA.brand || {}).name || null };
    if (inq) {
      out.product = !p ? '[확인 필요: 문의한 제품 (Original·Balance 젤리 / Original·Balance 음료)]'
        : p.en || `[확인 필요: ${p.ko} 영문 제품명 (당류 표기는 컴플라이언스 R11·R12 확인)]`;
      out.flavor = !p ? null : p.flavorsFinal ? p.flavors.join(', ') : `[확인 필요: ${p.ko} 맛 확정 (임시: ${p.flavors.join(', ')})]`;
      out.pack = p ? p.pack : null;
      out.unit = p ? p.unit : null;
    }
    Object.keys(s).forEach(k => { if (s[k] != null && String(s[k]).trim() !== '') out[k] = s[k]; });
    // 팀이 '답변 기본값'에 넣은 값이 가장 우선 (맛이 임시라 [확인 필요]였던 것도 여기 값이 있으면 채움)
    const d = replyDefaults();
    Object.keys(d).forEach(k => { if (String(d[k] || '').trim()) out[k] = String(d[k]).trim(); });
    // 성분·알레르기는 제품마다 다를 수 있음 → 어떤 제품 문의인지 모르면 공통값으로 답하지 않음 (GPT 검토 ㉑)
    if (inq && !p) PRODUCT_FACTS.forEach(k => { out[k] = `[확인 필요: 어떤 제품인지 확인한 뒤 ${k === 'allergens' ? '알레르기 성분' : '성분'}]`; });
    return out;
  }

  function replyDefaults() {
    const v = store.get(KEY.defaults, null);
    return v && typeof v === 'object' && v.values && typeof v.values === 'object' ? v.values : {};
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

  /** 초안 위 빈칸 안내: [확인 필요]마다 무엇을 채울지 + 그 문장 (주황 표시) · 누르면 초안의 그 위치로 */
  function todoPanelHTML(text) {
    const src = String(text || '');
    const list = [];
    const re = new RegExp(TODO_RE.source, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const start = src.lastIndexOf('\n', m.index) + 1;
      const endNl = src.indexOf('\n', m.index);
      const line = src.slice(start, endNl < 0 ? src.length : endNl);
      const at = m.index - start;
      const what = m[0].replace(/^\[확인 필요:?\s*/, '').replace(/\]$/, '').trim() || '내용 확인';
      list.push({ what, before: line.slice(0, at), hole: m[0], after: line.slice(at + m[0].length) });
    }
    if (!list.length) return '';
    return `
<div class="cs-todo-panel" role="note">
  <p class="cs-todo-title">${icon('alert')} 채워야 할 빈칸 ${list.length}곳 · 모두 채워야 문구 검토를 마칠 수 있어요</p>
  <ol class="cs-todo-list">${list.map((x, i) => `
    <li><button type="button" class="cs-todo-jump" data-act="todo-jump" data-idx="${i}" title="초안에서 이 빈칸을 선택해요">
      <span class="cs-todo-what">${esc(x.what)}</span>
      <span class="cs-todo-line">${esc(x.before.slice(-70))}<mark>${esc(x.hole)}</mark>${esc(x.after.slice(0, 50))}</span>
      <span class="cs-todo-go">위치로 →</span></button></li>`).join('')}</ol>
</div>`;
  }

  /** 초안 칸에서 idx번째 [확인 필요]를 선택하고 그 줄이 보이게 스크롤 */
  function jumpToTodo(ta, idx) {
    const re = new RegExp(TODO_RE.source, 'g');
    let m, n = 0;
    while ((m = re.exec(ta.value)) !== null && n < idx) n++;
    if (!m) return;
    ta.focus();
    ta.setSelectionRange(m.index, m.index + m[0].length);
    const lineNo = ta.value.slice(0, m.index).split('\n').length - 1;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 24;
    // 초안 칸은 내용 높이만큼 늘어나므로(fitDraft) 칸 안이 아니라 페이지를 그 줄까지 내림
    if (ta.scrollHeight <= ta.clientHeight + 2 && global.scrollTo) {
      global.scrollTo({ top: global.scrollY + ta.getBoundingClientRect().top + lineNo * lh - global.innerHeight / 3, behavior: 'smooth' });
    } else ta.scrollTop = Math.max(0, lineNo * lh - ta.clientHeight / 3);
  }

  /** 초안 칸 높이를 내용에 맞춤 (페이지 스크롤 안에 칸 스크롤이 겹치지 않게) */
  function fitDraft(ta) {
    if (!ta || !ta.offsetParent) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  // 문의 제품 기준으로 점검 (모르면 4종 중 가장 엄격 · 서버 재검사와 같은 기준 · 2026-10-25)
  function recheck(text, product) {
    try { return REBOOT.use('compliance').review(text, { channel: 'cs', product: product || 'all' }); } catch (e) { return null; }
  }

  /* 보내기 전 두 검토 (2026-10-26 메일함 구조)
     ① 문구 검토 = 자동 심의(사용 불가 표현) + 빈칸 · 작성자가 확인하고 '문구 검토 완료'
     ② CS 검토 = 지정 담당이 유형별 확인 항목을 보고 승인 (작성자와 다른 사람) → 서버 승인 기록 · 보내기 */

  /** 본문 지문: 문구 검토를 마친 뒤 본문이 바뀌면 문구 검토가 다시 열림 */
  function fingerprint(text) {
    const s = String(text || '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return `${(h >>> 0).toString(36)}:${s.length}`;
  }
  function phraseDone(inq) { return !!(inq.phrase && inq.phrase.fp === fingerprint(inq.draft)); }
  function samePerson(a, b) { return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

  /** 문의함 단계 (저장된 status 값은 그대로 두고 계산): 새 문의 → 문구 검토 → CS 검토 → 보낼 준비 → 보냄 */
  function stageOf(i) {
    if (DONE.includes(i.status)) return 'sent';
    if (i.status === '승인') return 'ready';
    if (phraseDone(i)) return 'cs';
    return i.status === '답변 대기' ? 'new' : 'phrase';
  }

  /** ① 문구 검토를 마치려면 통과해야 하는 조건 */
  function phraseGates(inq, r) {
    const todos = pendingTodos(inq.draft);
    return [
      { id: 'block', ok: !!r && r.verdict !== 'BLOCK',
        label: !r ? '다시 심의할 수 없음 (컴플라이언스 탭 확인)' : r.verdict === 'BLOCK' ? '사용 불가 표현 있음 → 문장 수정 필요' : '사용 불가 표현 없음' },
      { id: 'todo', ok: todos.length === 0, label: todos.length ? `[확인 필요] ${todos.length}곳 남음` : '[확인 필요] 없음' }
    ];
  }

  function csChecks(inq) {
    const c = DATA.csChecks || {};
    return (c.common || []).concat(c[inq.type] || []);
  }

  /** ② CS 검토를 승인하려면 통과해야 하는 조건 */
  function csGates(inq, r, approver) {
    const items = csChecks(inq);
    const n = items.filter((_, k) => (inq.csChecks || [])[k]).length;
    const who = String(approver || '').trim();
    const writer = inq.phrase && inq.phrase.by;
    const list = [
      { id: 'phrase', ok: phraseDone(inq), label: '문구 검토 완료' },
      { id: 'checks', ok: n === items.length, label: `확인 항목 ${n}/${items.length}` },
      { id: 'approver', ok: !!who && !samePerson(who, writer), label: !who ? '검토자 이름 입력' : `작성자(${writer || '—'})와 다른 사람이 검토` }
    ];
    if (r && (r.verdict === 'REVISE' || r.verdict === 'REVIEW') && DATA.approvalPolicy.reviseNeedsComment) {
      list.push({ id: 'comment', ok: !!(inq.pendingComment || '').trim(), label: `${LABEL[r.verdict] || r.verdict} 판정 → 검토 의견 입력` });
    }
    return list;
  }

  /** 초안 뒤에 같은 글을 깔아 걸린 표현·빈칸에 밑줄 (textarea는 글자마다 색을 칠할 수 없어서) */
  function highlightHTML(text, r) {
    const src = String(text || '');
    const low = src.toLowerCase();
    const marks = [];
    (r ? r.findings : []).forEach(f => f.terms.forEach(term => {
      const t = String(term || '').toLowerCase();
      if (!t || t.startsWith('(')) return;   // '(후기 대가 문구)'처럼 본문에 없는 표시
      for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + t.length)) marks.push({ s: i, e: i + t.length, c: `cs-hl-${f.verdict}` });
    }));
    const re = new RegExp(TODO_RE.source, 'g');
    let m;
    while ((m = re.exec(src)) !== null) marks.push({ s: m.index, e: m.index + m[0].length, c: 'cs-hl-todo' });
    marks.sort((a, b) => a.s - b.s);
    let out = '';
    let at = 0;
    marks.forEach(x => {
      if (x.s < at) return;
      out += `${esc(src.slice(at, x.s))}<mark class="${x.c}">${esc(src.slice(x.s, x.e))}</mark>`;
      at = x.e;
    });
    return `${out}${esc(src.slice(at))}\n`;   // 끝 줄바꿈: textarea 마지막 빈 줄과 높이를 맞춤
  }

  /** 초안 칸에서 걸린 표현을 찾아 선택 */
  function selectInDraft(ta, term) {
    if (!ta) return;
    const i = ta.value.toLowerCase().indexOf(String(term || '').toLowerCase());
    ta.focus();
    if (i < 0) return;
    ta.setSelectionRange(i, i + String(term).length);
    ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

  const inqKey = id => INQ + String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 76);
  function saveInq(inq) { store.set(inqKey(inq.id), inq); }

  function load() {
    let keys = store.keys().filter(k => k.startsWith(INQ));
    if (!keys.length) {
      // 처음: 예전 목록(키 하나)이 있으면 1건씩 옮기고 지움, 없으면 더미 문의로 시작
      const legacy = store.get(KEY.inquiries, null);
      (Array.isArray(legacy) ? legacy : seed()).forEach(saveInq);
      if (Array.isArray(legacy)) store.remove(KEY.inquiries);
      keys = store.keys().filter(k => k.startsWith(INQ));
    }
    const list = keys.map(k => store.get(k, null)).filter(x => x && TYPES[x.type]);
    renameDummies(list);
    return list;
  }

  /** 예전 더미 문의(TEST-NN · 'Test Customer NN')를 새 이름·주문번호로 바꿈 (처리 상태·초안·기록은 그대로) */
  function renameDummies(list) {
    let changed = false;
    DATA.dummyInquiries.forEach(d => {
      const inq = d.legacy && list.find(x => x.dummy && x.id === d.legacy);
      if (!inq) return;
      const swap = s => String(s || '').split(inq.name).join(d.name).split(inq.orderNo || '\u0000').join(d.orderNo || '')
        .split(inq.tracking || '\u0000').join(d.tracking || '');
      inq.draft = swap(inq.draft);
      (inq.log || []).forEach(l => { if (l && typeof l.msg === 'string') l.msg = swap(l.msg); });
      store.remove(inqKey(inq.id));
      Object.assign(inq, { id: d.id, name: d.name, from: d.from, orderNo: d.orderNo || '', tracking: d.tracking || '' });
      saveInq(inq);
      changed = true;
    });
    return changed;
  }

  function patch(id, fn) {
    const inq = store.get(inqKey(id), null);
    if (!inq) return null;
    fn(inq);
    saveInq(inq);
    return inq;
  }

  /** 화면에서 승인이 풀리면 서버 승인 기록도 취소 (Gmail 문의만 · 실패해도 보내기 때 본문 지문이 달라 막힘) */
  function revokeServer(inq) {
    if (inq && inq.gmailId) api('/api/cs/unapprove', { message_id: inq.gmailId }).catch(() => {});
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
    return left < 0 ? `${span(left)} 늦음` : `${span(left)} 남음`;
  }
  function badge(v) {
    if (!LABEL[v]) return `<span class="cs-badge">${esc(v)}</span>`;
    return `<span class="cs-badge cs-v-${v}">${LABEL[v]}</span>`;
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
      throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data;
  }

  async function apiPut(path, body) {
    const res = await fetch(path, { method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .catch(() => { throw new Error('서버에 연결하지 못했어요.'); });
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
    logTo(inq, 'Gmail에서 받음');
    return inq;
  }

  // 답장 페르소나: 팀이 답장 설정에서 고친 값(서버 저장 · 팀 공용)이 있으면 그것, 없으면 data.js 기본값
  const PERSONA_DEFAULT = DATA.persona || {};
  const PERSONA_MAX = 400;   // 서버(ai_draft.py)는 600자까지 받음
  function persona() {
    const v = store.get(KEY.persona, null);
    return v && String(v.text || '').trim() ? v : PERSONA_DEFAULT;
  }
  const LIST_MAX = 5;   // 문의함 · 고객 기록 첫 화면에 보이는 개수 (나머지는 '더 보기')

  function aiNotesHTML(inq) {
    return `<div class="cs-ainotes">
  <p class="cs-ainotes-head">${icon('spark')} ${esc(persona().name || 'AI')}가 다듬은 초안 · ${fmt(inq.aiDraftAt)} · 문구 검토·CS 검토 전 확인할 것</p>
  <ul>${(inq.aiNotes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  ${(inq.aiTruncated || []).length ? `<p class="cs-warn">${inq.aiTruncated.map(esc).join('<br>')}</p>` : ''}
  ${inq.prevDraft ? '<button type="button" class="cs-btn cs-btn-sm" data-act="ai-undo">이전 초안으로 되돌리기</button>' : ''}
</div>`;
  }

  /** 페르소나로 초안 다듬기 → 초안 교체 (이전 초안은 되돌리기용으로 보관), 승인은 풀림 */
  async function runAiDraft(ui, btn) {
    const inq = load().find(x => x.id === ui.selected);
    if (!inq || DONE.includes(inq.status)) return;
    if (inq.edited && !inq.aiDraftAt && !global.confirm('직접 고친 초안을 바탕으로 AI가 다시 써요. 계속할까요? (되돌리기 가능)')) return;
    let banned = [];
    try { banned = REBOOT.use('compliance').bannedTerms().map(b => b.term); } catch (e) { banned = []; }
    const box = ui.root.querySelector('[data-el="ainotes"]');
    btn.disabled = true;
    box.innerHTML = `<p class="cs-muted">${icon('spark')} ${esc(persona().name || 'AI')}가 초안을 다듬는 중이에요… (보통 10~30초)</p>`;
    try {
      const t = TYPES[inq.type];
      const res = await api('/api/cs/ai-draft', {
        persona: (({ name, title, text }) => ({ name, title, text }))(persona()),
        inquiry: { type: inq.type, typeName: t.name, name: inq.name, orderNo: inq.orderNo, subject: inq.subject, body: inq.body },
        current: inq.draft, banned,
        facts: Object.assign({}, facts(inq), {
          inquiry_product: inq.product ? productKo(inq.product) : 'unknown — ask the customer which product if it matters',
          line_up: PRODUCTS.map(p => `${p.ko} (${p.form}; flavors ${p.flavorsFinal ? '' : 'tentative '}${p.flavors.join('/')}; ${p.pack}${!p.zeroSugar ? '; no sugar claims' : DATA.zeroSugarFinal ? '; Zero Sugar — use only the words "Zero Sugar" for this product; no other sugar claims or numbers'
            : '; Zero Sugar wording not final yet (brand guide v1.1) — do not state any sugar fact; if asked, write "[확인 필요: Balance 당 표현 확정]"'})`).join(' | '),
          slogan: (DATA.brand || {}).slogan || ''
        })
      });
      // AI가 쓰는 동안(10~30초) 담당자가 초안을 고쳤거나 처리 상태가 바뀌었으면 자동으로 덮어쓰지 않음 (GPT 검토 ⑪)
      const now = load().find(x => x.id === inq.id);
      if (!now || DONE.includes(now.status)) {
        box.innerHTML = '<p class="cs-warn">AI가 쓰는 동안 이 문의가 처리 완료되어 초안을 바꾸지 않았어요.</p>';
        return;
      }
      if (now.draft !== inq.draft && !global.confirm('AI가 쓰는 동안 초안을 직접 고치셨어요.\nAI 초안으로 바꿀까요? (지금 고친 초안은 [이전 초안으로 되돌리기]로 복구 가능)\n취소하면 지금 초안을 그대로 둬요.')) {
        box.innerHTML = '<p class="cs-muted">AI 초안을 적용하지 않았어요 (직접 고친 초안 유지).</p>';
        btn.disabled = false;
        return;
      }
      patch(inq.id, x => {
        x.prevDraft = x.draft;
        x.draft = res.draft;
        x.edited = true;
        x.aiDraftAt = Date.now();
        x.aiNotes = res.notes_ko || [];
        x.aiTruncated = res.truncated || [];
        if (x.status === '승인') { x.approval = null; revokeServer(x); }
        if (x.status === '답변 대기' || x.status === '승인') x.status = '검토 중';
        logTo(x, `AI 초안 다듬기 (${persona().name || '페르소나'})`);
      });
      toast('AI가 초안을 다듬었어요. 걸린 표현과 [확인 필요]를 확인하고 문구 검토를 다시 하세요.');
      renderDetail(ui);
      renderList(ui);
    } catch (e) {
      box.innerHTML = `<p class="cs-warn">AI 초안을 만들지 못했어요: ${esc(e.message)}</p>`;
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
  /* 한글 번역 (참고용): 번역 엔진은 컴플라이언스 파트의 translate()를 빌려 씀 (크롬 내장 번역 → 안 되면 서버 AI → 그래도 안 되면 Google 번역 링크).
     data-tr-text = 고정 원문, data-tr-from = 지금 입력 칸의 값을 번역 (예: 수정 중인 초안) */
  function trBlock(text, label, from) {
    return `<div class="cs-trblock" ${from ? `data-tr-from="${esc(from)}"` : `data-tr-text="${esc(text)}"`}>
  ${REBOOT.ui.trBtn({ title: label })}
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
      out.innerHTML = '<p class="cs-warn">번역 기능은 컴플라이언스 탭이 함께 열려 있어야 해요.</p>';
      return;
    }
    btn.disabled = true;
    out.innerHTML = '<p class="cs-muted">번역 중…</p>';
    const r = await api.translate(src, loaded => {
      out.innerHTML = `<p class="cs-muted">번역 모델 내려받는 중… ${Math.round(loaded * 100)}% (처음 한 번만)</p>`;
    });
    btn.disabled = false;
    if (r.ok) {
      out.innerHTML = `<div class="cs-tr"><span class="cs-tr-tag">${r.engine === 'already-ko' ? '이미 한국어' : r.engine === 'ai' ? 'AI 번역' : '기계 번역'}</span>
  <p class="cs-tr-text">${esc(r.text)}</p>${r.note ? `<p class="cs-muted">${esc(r.note)}</p>` : ''}</div>`;
    } else if (r.reason === 'empty') {
      out.innerHTML = '<p class="cs-muted">번역할 내용이 없어요.</p>';
    } else {
      const url = /^https:\/\//.test(r.fallbackUrl || '') ? r.fallbackUrl : '';
      out.innerHTML = `<p class="cs-warn">번역하지 못했어요 (크롬 내장 번역·서버 AI 번역 모두 실패)${r.message ? ` · ${esc(r.message)}` : ''}.
  ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Google 번역에서 열기 ↗</a> <b>내용이 Google로 전송돼요.</b> 실제 고객 이름·연락처·주소가 들어 있으면 열지 마세요.` : ''}</p>`;
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

  // 하위 메뉴 = 다루는 대상 (문의 · 부작용 · 고객). 답변 템플릿은 문의함 위 '답장 설정' 버튼으로 (2026-10-26)
  const TABS = [['inbox', '문의함'], ['adverse', '부작용 접수'], ['customers', '고객 기록']];
  // 문의함 단계 = 메일함 폴더 (core가 왼쪽 메뉴의 문의함 아래에 들여 써서 보여 줌). 한 문의는 한 단계에만 · stageOf()로 계산
  // 새 문의 → ① 문구 검토 → ② CS 검토 → 보낼 준비 → 보냄 (2026-10-26 메일함 구조)
  const SUBS = [['new', '새 문의'], ['phrase', '문구 검토'], ['cs', 'CS 검토'], ['ready', '보낼 준비'], ['sent', '보냄']];
  const STAGE_NAME = {};
  SUBS.forEach(([id, label]) => { STAGE_NAME[id] = label; });
  const STAGE_EMPTY = {
    new: '새로 온 문의가 없어요.', phrase: '문구 검토할 답장이 없어요.', cs: 'CS 검토를 기다리는 답장이 없어요.',
    ready: '보낼 답장이 없어요. CS 검토를 승인하면 여기로 와요.', sent: '보낸 답장이 없어요.'
  };
  // 문의 하나 처리 단계 (상세 화면 밑줄 탭) · 오른쪽 칸에 한 단계 카드만 보여 줌
  // 단계 이름은 왼쪽 메뉴 · 단계 탭에만, 할 일은 오른쪽 카드에만 (중복 표시 정리 2026-10-26)
  const STEPS = [['reply', '답장 쓰기'], ['phrase', '문구 검토'], ['cs', 'CS 검토'], ['send', '보내기']];
  // 단계 안 보기 탭 ('all'은 고객 이력 → 문의 보기 전용이라 탭 없음)
  const VIEWS = [['open', '전체'], ['urgent', '긴급 (C1)'], ['overdue', '기한 초과']];
  // 답장 설정 밑줄 탭 · 템플릿 유형 탭 (화면을 다시 그려도 유지 · 새로고침하면 기본값)
  let SET_TAB = null;
  let TPL_CODE = null;
  const CUST_OPEN = new Map();   // 고객 이력 카드 펼침 (이메일 → 열림 · 새로고침하면 접힘)
  const REC_OPEN = new Map();

  function render(root) {
    root.classList.add('part-cs');
    root.innerHTML = `
<div class="cs-wrap">
  <div class="cs-tabs" role="tablist">
    ${TABS.map(([id, label], i) => `<button type="button" role="tab" class="cs-tab" data-tab="${id}" aria-selected="${i === 0}">${label} <span class="count" data-count="${id}"></span></button>`).join('')}
  </div>
  <section class="cs-panel" data-panel="inbox">
    <div class="cs-tabs cs-subtabs" role="tablist" aria-label="처리 단계">
      ${SUBS.map(([id, label], i) => `<button type="button" role="tab" class="cs-tab" data-sub="${id}" aria-selected="${i === 0}">${label} <span class="count" data-count="${id}"></span></button>`).join('')}
    </div>
    <div class="cs-subpanel">
    <div class="cs-inbox" data-view="list">
      <div class="cs-listcol">
        <div class="linetabs cs-viewtabs" data-el="filter" role="group" aria-label="보기"></div>
        <label class="cs-field"><span>정렬</span><select class="cs-input" data-el="sort">
          <option value="priority" selected>처리 우선순위 (긴급·기한 순)</option><option value="newest">받은 시간 · 최신순</option><option value="oldest">받은 시간 · 오래된 순</option></select></label>
        <div class="cs-gmailbar">
          <button type="button" class="cs-btn" data-act="gmail-import" title="Gmail 최신 데이터 받기" disabled>${icon('mail')} Gmail 받기</button>
          <button type="button" class="cs-btn" data-act="open-settings" title="담당자 연락처 · 답장 기본값 · 페르소나 · 템플릿">답장 설정</button>
          <span class="cs-muted" data-el="gmailmsg" aria-live="polite"></span>
        </div>
        <div data-el="setupnote"></div>
        <div data-el="listhead" class="cs-listhead"></div>
        <div data-el="custfilter" class="cs-custfilter"></div>
        <ul class="cs-list" data-el="list"></ul>
      </div>
      <div class="cs-detail" data-el="detail"><p class="cs-muted">목록에서 문의를 골라 주세요.</p></div>
    </div>
    </div>
  </section>
  <section class="cs-panel" data-panel="adverse" hidden></section>
  <section class="cs-panel" data-panel="customers" hidden></section>
  <section class="cs-panel" data-panel="templates" hidden></section>
</div>`;

    // me = 로그인한 사람 (문구 검토 완료자로 기록) · approver = CS 검토자 칸 기본값
    const me = (REBOOT.user && REBOOT.user().name) || '';
    const ui = { root, selected: null, filter: 'open', sort: 'priority', me, approver: me, adverseDraft: null, ctab: 'reply' };
    const panel = name => root.querySelector(`[data-panel="${name}"]`);
    ui.sub = 'new';
    ui.showTab = name => {
      if (name === 'outbox') { ui.sub = 'ready'; name = 'inbox'; }   // 예전 '보내기' 탭 → 문의함 › 보낼 준비
      root.querySelectorAll('.cs-tab[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
      root.querySelectorAll('.cs-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
      if (name === 'inbox') ui.showSub(ui.sub);
      if (name === 'adverse') renderAdverse(ui, panel('adverse'));
      if (name === 'templates') renderTemplates(panel('templates'));
      if (name === 'customers') renderCustomers(ui, panel('customers'));
      paintCounts(ui);
    };
    // 문의함 단계 바꾸기 (예전 이름 work·ready·sent에서 온 호출도 받음 · 모르는 이름은 새 문의)
    ui.showSub = name => {
      ui.sub = STAGE_NAME[name] ? name : 'new';
      paintSubs(ui);
      renderList(ui);
      renderDetail(ui);
    };
    root.querySelectorAll('.cs-tab[data-tab]').forEach(b => b.addEventListener('click', () => ui.showTab(b.dataset.tab)));
    root.querySelectorAll('.cs-tab[data-sub]').forEach(b => b.addEventListener('click', () => {
      if (ui.filter === 'all') { ui.filter = 'open'; ui.custFilter = null; }   // 고객 이력 보기 중이면 풀고 단계로
      setView(ui, 'list');
      ui.showSub(b.dataset.sub);
    }));
    // 담당자에게 전달: 요청 종류·메모를 바꾸면 보낼 내용을 다시 만듦
    const reshare = e => { if (['kind', 'memo'].includes(e.target.dataset.share)) fillShare(e.target.closest('.cs-share')); };
    root.addEventListener('change', reshare);
    root.addEventListener('input', e => { if (e.target.dataset.share === 'memo') reshare(e); });
    loadContacts().then(() => { if (ui.view === 'detail' && ui.selected) renderDetail(ui); });
    root.addEventListener('click', e => {
      const tr = e.target.closest('[data-act="translate"]');
      if (tr && !tr.disabled) {   // 다시 누르면 번역을 접음
        const open = tr.getAttribute('aria-pressed') === 'true';
        REBOOT.ui.trOn(tr, !open);
        if (open) tr.closest('.cs-trblock').querySelector('[data-tr-out]').innerHTML = '';
        else runTranslate(root, tr.closest('.cs-trblock'));
      }
      const sh = e.target.closest('[data-act^="share-"]');
      if (sh && !sh.disabled) { runShare(ui, sh); return; }
      if (e.target.closest('[data-act="list-more"]')) {
        const key = `${ui.sub}|${ui.filter}|${ui.custFilter || ''}`;
        ui.listMore = ui.listMore === key ? null : key;
        renderList(ui);
        return;
      }
      if (e.target.closest('[data-act="cust-clear"]')) { ui.custFilter = null; ui.filter = 'open'; renderList(ui); return; }
      if (e.target.closest('[data-act="open-settings"]')) { ui.showTab('templates'); return; }
      if (e.target.closest('[data-act="edit-persona"]')) { SET_TAB = 'persona'; ui.showTab('templates'); return; }
      if (e.target.closest('[data-act="tpl-back"]')) { ui.showTab('inbox'); return; }
    });

    root.querySelector('[data-el="filter"]').addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (b) { ui.custFilter = null; ui.filter = b.dataset.filter; renderList(ui); }
    });
    root.querySelector('[data-el="sort"]').addEventListener('change', e => { ui.sort = e.target.value; renderList(ui); });

    // Gmail에서 불러오기: 이미 있는 문의(같은 Gmail 번호)는 건드리지 않고 새 메일만 추가.
    // 화면을 열 때 Gmail이 연결돼 있으면 자동으로 한 번 불러오고(auto), 버튼으로 언제든 다시 불러옴
    const gmailBtn = root.querySelector('[data-act="gmail-import"]');
    const gmailMsg = root.querySelector('[data-el="gmailmsg"]');
    const importGmail = async auto => {
      gmailBtn.disabled = true;
      gmailMsg.textContent = auto ? '새 메일 확인 중…' : '받는 중…';
      try {
        const { items } = await api('/api/cs/gmail/inquiries');
        const list = load();
        const have = new Set(list.map(i => i.id));
        const fresh = (items || []).filter(m => !have.has(`GM-${m.id}`)).map(fromGmail);
        fresh.forEach(saveInq);
        gmailMsg.textContent = `${fmt(Date.now())} 확인 · 메일 ${(items || []).length}건 · 새 문의 ${fresh.length}건`;
        if (fresh.length || !auto) toast(fresh.length ? `Gmail에서 새 문의 ${fresh.length}건을 받았어요.` : '새 문의가 없어요.');
        if (fresh.length) {
          // 새로 온 문의가 보이도록 새 문의 단계 · 최신순으로
          ui.sort = 'newest';
          root.querySelector('[data-el="sort"]').value = 'newest';
          ui.custFilter = null;
          ui.filter = 'open';
          ui.sub = 'new';
          paintSubs(ui);
          ui.highlight = new Set(fresh.map(x => x.id));   // 새로 온 메일을 목록에서 잠깐 강조
        }
        renderList(ui);
      } catch (e) {
        if (!auto) toast(`Gmail 최신 데이터를 받지 못했어요: ${e.message}`);
        gmailMsg.textContent = `받기 실패 · ${e.message}`;
      }
      gmailBtn.disabled = false;
    };
    serverHealth().then(h => {
      ui.gmail = !!(h && h.gmail);
      gmailBtn.disabled = !ui.gmail;
      gmailMsg.textContent = !h ? '서버 상태를 확인하지 못했어요 (새로고침해 주세요)' : !h.gmail ? 'Gmail 로그인 필요 (설정 › 연결 › Google로 로그인)' : '';
      if (ui.selected) renderDetail(ui);   // 보낼 준비 문의의 보내기 버튼 상태 갱신
      if (ui.gmail) importGmail(true);
    });
    gmailBtn.addEventListener('click', () => importGmail(false));
    root.querySelector('[data-el="list"]').addEventListener('click', e => {
      const btn = e.target.closest('[data-id]');
      if (btn) openInquiry(ui, btn.dataset.id);
    });
    wireDetail(ui);

    // 처음에는 Gmail처럼 목록만 (메일을 누르면 목록 옆에 대화 · 검토 화면)
    setView(ui, 'list');
    renderList(ui);
  }

  /** 문의함 화면: 'list' = 목록만 (Gmail처럼) · 'detail' = 목록 옆에 문의 하나 (좁은 화면은 문의만) */
  function setView(ui, view) {
    ui.view = view;
    const box = ui.root.querySelector('.cs-inbox');
    if (box) box.dataset.view = view;
  }

  function paintSubs(ui) {
    ui.root.querySelectorAll('.cs-tab[data-sub]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sub === ui.sub)));
  }

  /** 처리 단계가 바뀐 문의를 따라 단계 메뉴도 옮김 (고객 이력 보기 중이면 그대로) */
  function follow(ui) {
    const inq = ui.selected && load().find(x => x.id === ui.selected);
    if (inq && ui.filter !== 'all' && stageOf(inq) !== ui.sub) { ui.sub = stageOf(inq); paintSubs(ui); }
  }

  /** 메일 하나 열기: 읽음 표시 → 검토 화면 */
  function openInquiry(ui, id) {
    if (!id) return;
    ui.selected = id;
    patch(id, x => { if (!x.readAt) x.readAt = Date.now(); });
    follow(ui);
    setView(ui, 'detail');
    renderList(ui);
    renderDetail(ui);
    const box = ui.root.querySelector('.cs-inbox');
    if (box && box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start' });
  }

  /** 왼쪽 메뉴 숫자 (core가 탭 버튼의 .count를 읽어 표시 · 0은 숨김): 단계별 문의 수 (보냄 제외) · 부작용 = 접수 기록 없는 미처리 C1 */
  function paintCounts(ui) {
    const all = load();
    const adv = new Set(loadAdverse().map(a => a.linkedInquiry).filter(Boolean));
    const by = s => all.filter(i => stageOf(i) === s).length;
    const n = {
      new: by('new'), phrase: by('phrase'), cs: by('cs'), ready: by('ready'),
      adverse: all.filter(i => isOpen(i) && i.type === 'C1' && !adv.has(i.id)).length
    };
    ui.root.querySelectorAll('[data-count]').forEach(el => {
      const v = n[el.dataset.count] ? String(n[el.dataset.count]) : '';
      if (el.textContent !== v) el.textContent = v;
    });
    // 답변 기본값이 비어 있으면 초안마다 [확인 필요]가 생김 → 문의함 위에서 바로 알림
    const box = ui.root.querySelector('[data-el="setupnote"]');
    if (box) {
      const dv = replyDefaults();
      const empty = (DATA.replyDefaults || []).filter(f => !String(dv[f.key] || '').trim()).length;
      box.innerHTML = empty ? `<button type="button" class="cs-setupnote" data-act="open-settings"
        title="비어 있으면 초안에 [확인 필요]가 남아 문구 검토가 막혀요">${icon('alert')} 답장 기본값 <b>${empty}개</b> 비어 있음 · 채우기 →</button>` : '';
    }
  }

  /** 목록 줄의 두 검토 표시 (문구 · CS) */
  function gatesMini(i) {
    const st = stageOf(i);
    const p = ['cs', 'ready', 'sent'].includes(st) ? ' is-ok' : '';
    const c = ['ready', 'sent'].includes(st) ? ' is-ok' : '';
    return `<span class="cs-gates-mini" title="문구 검토 · CS 검토">문구<i class="cs-gm${p}"></i>CS<i class="cs-gm${c}"></i></span>`;
  }

  /* 문의함 목록 */

  function renderList(ui) {
    const all = load();
    const now = Date.now();
    paintCounts(ui);

    const custMap = new Map(customers().map(c => [c.email, c]));
    const pass = (i, f) => {
      if (ui.custFilter && emailOf(i.from) !== ui.custFilter) return false;   // 고객 이력 → '문의 보기'
      if (f === 'all') return true;   // 고객 이력 → '문의 보기'는 단계와 상관없이 그 고객 문의 전부
      if (stageOf(i) !== ui.sub) return false;
      if (f === 'urgent') return i.type === 'C1';
      if (f === 'overdue') return isOpen(i) && now > due(i);
      return true;
    };
    const shown = all.filter(i => pass(i, ui.filter)).sort((a, b) =>
      ui.sort === 'newest' ? (b.receivedAt - a.receivedAt)
        : ui.sort === 'oldest' ? (a.receivedAt - b.receivedAt)
          : (isOpen(b) - isOpen(a)) || ((b.type === 'C1') - (a.type === 'C1')) || (due(a) - due(b)));   // priority: 미처리 → 긴급(C1) → 기한 빠른 순

    ui.shownIds = shown.map(i => i.id);   // 검토 화면의 이전·다음 메일
    const fbox = ui.root.querySelector('[data-el="filter"]');
    fbox.hidden = ui.filter === 'all';
    fbox.innerHTML = VIEWS.map(([v, l]) =>
      `<button type="button" data-filter="${v}" aria-pressed="${v === ui.filter}">${l} <span class="n">${all.filter(i => pass(i, v)).length}</span></button>`).join('');
    const unread = i => !i.readAt && i.status === '답변 대기';
    // 처음엔 LIST_MAX건만 (선택한 메일이 뒤쪽이면 모두) · 단계·필터가 바뀌면 다시 접힘
    const moreKey = `${ui.sub}|${ui.filter}|${ui.custFilter || ''}`;
    const all5 = ui.listMore === moreKey || shown.length <= LIST_MAX || shown.findIndex(i => i.id === ui.selected) >= LIST_MAX;
    const visible = all5 ? shown : shown.slice(0, LIST_MAX);
    const moreBtn = shown.length > LIST_MAX ? `<li class="cs-list-more"><button type="button" class="cs-btn cs-btn-sm" data-act="list-more">${all5 ? '접기' : `나머지 ${shown.length - LIST_MAX}건 더 보기`}</button></li>` : '';
    ui.root.querySelector('[data-el="list"]').innerHTML = shown.length ? visible.map(i => {
      const late = isOpen(i) && now > due(i);
      const snippet = String(i.body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      return `
<li><button type="button" class="cs-item cs-mailrow${i.id === ui.selected ? ' is-selected' : ''}${unread(i) ? ' is-unread' : ''}${late ? ' is-late' : ''}${ui.highlight && ui.highlight.has(i.id) ? ' is-new' : ''}" data-id="${esc(i.id)}">
  <span class="cs-avatar" aria-hidden="true">${initials(i.name)}</span>
  <span class="cs-row-from"><span class="cs-item-name">${esc(i.name)}</span>${custMap.has(emailOf(i.from)) ? custChips(custMap.get(emailOf(i.from)), true) : ''}</span>
  <span class="cs-row-main"><span class="cs-row-line"><b class="cs-row-subject">${esc(i.subject)}</b>${subjectKo(i)}<span class="cs-row-snippet"> — ${esc(snippet)}</span></span>
    <span class="cs-item-tags"><span class="cs-type cs-type-${i.type}">${i.type} ${esc(TYPES[i.type].name)}</span>${ui.filter === 'all' ? `<span class="cs-chip">${STAGE_NAME[stageOf(i)]}</span>` : ''}${i.product ? `<span class="cs-chip cs-chip-dim">${esc(productKo(i.product))}</span>` : ''}${i.source === 'gmail' ? '<span class="cs-chip cs-chip-dim">Gmail</span>' : ''}${gatesMini(i)}</span></span>
  <span class="cs-row-side"><span class="cs-row-time" title="받은 시간">${fmt(i.receivedAt)}</span><span class="cs-due${late ? ' is-late' : ''}">${dueText(i)}</span></span>
</button></li>`;
    }).join('') + moreBtn : `<li class="cs-muted cs-list-empty">${ui.filter === 'all' ? '해당하는 문의가 없어요.' : STAGE_EMPTY[ui.sub]}</li>`;
    const head = ui.root.querySelector('[data-el="listhead"]');
    if (head) head.innerHTML = `<b>${ui.filter === 'all' ? '이 고객 문의' : STAGE_NAME[ui.sub]}</b> <span class="cs-muted">${shown.length}건${shown.filter(unread).length ? ` · 안 읽음 <b>${shown.filter(unread).length}</b>` : ''}</span>`;
    const cf = ui.root.querySelector('[data-el="custfilter"]');
    if (cf) cf.innerHTML = ui.custFilter ? `<span class="cs-chip cs-chip-warn">${esc(ui.custFilter)} 고객 문의만</span> <button type="button" class="cs-btn cs-btn-sm" data-act="cust-clear">전체 보기</button>` : '';
    return shown;
  }

  /* 문의 상세: 받은 메일 · 내부 메모 · 답장 작성기(보내기 줄) | ① 문구 검토 · ② CS 검토 */

  function renderDetail(ui) {
    const box = ui.root.querySelector('[data-el="detail"]');
    const inq = ui.selected && load().find(x => x.id === ui.selected);
    if (!inq) { box.innerHTML = '<p class="cs-muted">목록에서 문의를 골라 주세요.</p>'; return; }
    const t = TYPES[inq.type];
    const locked = DONE.includes(inq.status);
    const prod = PRODUCTS.find(x => x.id === inq.product);
    const subject = /^re:/i.test(inq.subject) ? inq.subject : `Re: ${inq.subject}`;
    const notes = inq.notes || [];

    // 문의를 새로 열거나 단계가 바뀌면 지금 할 단계 탭으로 (같은 단계 안에서는 고른 탭 유지)
    const stepKey = `${inq.id}|${stageOf(inq)}`;
    if (ui.stepKey !== stepKey) { ui.stepKey = stepKey; ui.step = autoStep(inq); }

    const pos = (ui.shownIds || []).indexOf(inq.id);
    box.innerHTML = `
<div class="cs-backbar"><button type="button" class="cs-btn cs-btn-sm" data-act="back-list">← 목록</button>
  ${pos >= 0 ? `<span class="cs-muted">${pos + 1} / ${ui.shownIds.length}</span>
  <button type="button" class="cs-btn cs-btn-sm" data-act="nav" data-step="-1" ${pos > 0 ? '' : 'disabled'}>‹ 이전 메일</button>
  <button type="button" class="cs-btn cs-btn-sm" data-act="nav" data-step="1" ${pos < ui.shownIds.length - 1 ? '' : 'disabled'}>다음 메일 ›</button>` : ''}</div>
<article class="cs-card cs-thread" data-id="${esc(inq.id)}">
  <header class="cs-inq">
    <div class="cs-detail-head">
      <div class="cs-chips">
        <span class="cs-type cs-type-${t.code}">${t.code} ${esc(t.name)}</span>
        <span class="cs-chip cs-chip-dim">${prod ? esc(prod.ko) : '제품 미확인'}</span>
        ${inq.dummy ? '<span class="cs-chip cs-chip-dim">예시</span>' : ''}
        ${inq.source === 'gmail' ? '<span class="cs-chip cs-chip-dim">Gmail</span>' : ''}
      </div>
      <span class="cs-ref">#${esc(inq.id)}</span>
    </div>
    <h3 class="cs-subject">${esc(inq.subject)}${subjectKo(inq)}</h3>
    <div class="cs-meta"><span>담당 <b>${esc(t.owner)}</b></span><span>응답 기한 <b>${fmt(due(inq))}</b> (${dueText(inq)})</span><span>처리: ${esc(t.mode)}</span><span>분류: ${esc(t.tag)}</span></div>
    ${(c => c && (c.list.length > 1 || c.signals.length || c.behavior.length || (c.tag && c.tag.tag)) ? `<div class="cs-cust-line">${custChips(c)}
      ${c.signals.map(x => `<span class="cs-muted">${esc(x.label)}</span>`).concat(c.behavior.map(b => `<span class="cs-muted">${esc(b)}</span>`)).join(' · ')}
      ${c.tag && c.tag.note ? `<span class="cs-muted">· 분류 이유: ${esc(c.tag.note)}</span>` : ''}
      <button type="button" class="cs-btn cs-btn-sm" data-act="cust-history">고객 기록 보기</button></div>
      ${inq.type === 'C1' && c.tag && ['watch', 'limit'].includes(c.tag.tag) ? '<p class="cs-note cs-note-block">주의 고객으로 분류돼 있어도 부작용 신고(C1)는 평소처럼 처리하세요 (FDA 보고 대상 판단).</p>' : ''}` : '')(customers().find(c => c.email === emailOf(inq.from)))}
    ${t.code === 'C1' && !locked ? (adv => adv
      ? `<div class="cs-escal is-done">${icon('shield')}<span>부작용 기록 남김 · ${fmt(adv.createdAt)}</span><button type="button" class="cs-btn cs-btn-sm" data-act="to-adverse-records">접수 기록 보기</button></div>`
      : `<div class="cs-escal">${icon('alert')}<span><b>부작용 신고 문의예요.</b> 답장보다 접수 기록을 먼저 남기세요.</span><button type="button" class="cs-btn cs-primary" data-act="to-adverse">부작용 접수 열기</button></div>`
    )(loadAdverse().find(x => x.linkedInquiry === inq.id)) : ''}
    <details class="cs-classify"><summary>분류·제품 바꾸기 <span class="cs-muted">(자동 분류: ${esc(inq.typeAuto)})</span></summary>
      <div class="cs-row">
        <label class="cs-field"><span>문의 유형</span>
          <select class="cs-input" data-el="type" ${locked ? 'disabled' : ''}>${DATA.types.map(x =>
            `<option value="${x.code}"${x.code === inq.type ? ' selected' : ''}>${x.code} ${esc(x.name)}</option>`).join('')}</select></label>
        <label class="cs-field"><span>제품${inq.product ? '' : ' <b class="cs-req">(미확인)</b>'}</span>
          <select class="cs-input" data-el="product" ${locked ? 'disabled' : ''}><option value="">제품 미확인</option>${PRODUCTS.map(x =>
            `<option value="${x.id}"${x.id === inq.product ? ' selected' : ''}>${esc(x.ko)} · ${esc(x.id.startsWith('jelly') ? '모양 젤리' : '비탄산 음료')}</option>`).join('')}</select></label>
        <button type="button" class="cs-btn" data-act="regen" ${locked ? 'disabled' : ''}>템플릿으로 초안 다시 만들기</button>
      </div>
    </details>
  </header>

  <div class="cs-msgs">
    <article class="cs-msg">
      <div class="cs-from"><span class="cs-avatar" aria-hidden="true">${initials(inq.name)}</span>
        <span><b>${esc(inq.name)}</b><small>${esc(inq.from)} → REBOOT Support · ${fmt(inq.receivedAt)}</small></span></div>
      <blockquote class="cs-body">${esc(inq.body)}</blockquote>
      ${trBlock(`${inq.subject}\n${inq.body}`, '문의 한국어로 보기')}
    </article>
    ${notes.map(n => `<article class="cs-msg cs-msg-note"><p class="cs-msg-head"><b>내부 메모</b> ${esc(n.by)} <span class="cs-muted">${fmt(n.at)}</span></p>
      <p class="cs-msg-text">${esc(n.text)}</p></article>`).join('')}
  </div>

  <nav class="linetabs cs-steps" role="tablist" data-subnav="off" aria-label="답장 처리 단계" data-el="steps"></nav>
  <div class="cs-work">
    <section class="cs-composer" aria-label="답장 쓰기">
      <div class="cs-ctabs">
        <button type="button" class="cs-ctab" data-act="ctab" data-ctab="reply" aria-pressed="${ui.ctab !== 'note'}">답장</button>
        <button type="button" class="cs-ctab" data-act="ctab" data-ctab="note" aria-pressed="${ui.ctab === 'note'}">내부 메모${notes.length ? ` ${notes.length}` : ''}</button>
        <span class="cs-ctabs-side"><span class="cs-chip cs-chip-dim">${inq.aiDraftAt ? `AI · ${esc(persona().name || '페르소나')}` : `${t.code} 템플릿`}</span>
          <button type="button" class="cs-btn cs-btn-sm" data-act="ai-draft" disabled
            title="${esc(`${persona().name || ''} 페르소나로 문의에 맞게 다시 써요 · 결과는 문구 검토와 CS 검토를 다시 거쳐요`)}">${icon('spark')} AI로 초안 다듬기</button>
          <button type="button" class="cs-btn cs-btn-sm" data-act="edit-persona" title="답장 설정에서 페르소나 고치기">페르소나 수정</button></span>
      </div>
      <div class="cs-cpane" data-ctab-pane="reply"${ui.ctab === 'note' ? ' hidden' : ''}>
        <dl class="cs-cfields"><div><dt>받는 사람</dt><dd>${esc(inq.from)}</dd></div><div><dt>제목</dt><dd>${esc(subject)}</dd></div></dl>
        <div class="cs-hl">
          <div class="cs-draft cs-hl-back" data-el="hl" aria-hidden="true"></div>
          <textarea class="cs-input cs-draft" rows="14" data-el="draft" aria-label="영문 답장" spellcheck="false" ${locked ? 'readonly' : ''}>${esc(inq.draft)}</textarea>
        </div>
        <div class="cs-cextra">
          <div data-el="ainotes" aria-live="polite">${inq.aiNotes && inq.aiNotes.length ? aiNotesHTML(inq) : ''}</div>
          ${trBlock('', '초안 한국어로 보기', 'draft')}
        </div>
      </div>
      <div class="cs-cpane cs-notepane" data-ctab-pane="note"${ui.ctab === 'note' ? '' : ' hidden'}>
        <textarea class="cs-input" rows="4" data-el="note" aria-label="내부 메모" placeholder="팀에게만 보이는 메모예요. 고객에게는 가지 않아요."></textarea>
        <div class="cs-actions"><button type="button" class="cs-btn cs-primary" data-act="note-add">메모 남기기</button></div>
      </div>
    </section>
    <aside class="cs-review" aria-label="처리 단계 카드">
      <section class="cs-rcard" data-step-pane="reply" data-el="replycard" aria-live="polite"></section>
      <section class="cs-rcard" data-step-pane="phrase" data-el="phrase" aria-live="polite"></section>
      <section class="cs-rcard" data-step-pane="cs" data-el="cscard">${csCardHTML(ui, inq, t)}</section>
      <section class="cs-rcard" data-step-pane="send"><header class="cs-rhead"><h4>04 보내기</h4></header>
        <div class="cs-sendbox" data-el="sendbar" aria-live="polite"></div></section>
    </aside>
  </div>
  ${(inq.log || []).length ? `
  <details class="cs-sec"><summary><span class="cs-sec-title">처리 기록</span><span class="cs-sec-sum"><span class="cs-chip cs-chip-dim">${inq.log.length}건</span></span></summary>
    <div class="cs-sec-body cs-log"><ol>${inq.log.slice().reverse().map(l => `<li><span class="cs-muted">${fmt(l.at)}</span> ${esc(l.msg)}</li>`).join('')}</ol></div>
  </details>` : ''}
</article>`;
    box.querySelectorAll('.cs-share').forEach(fillShare);
    fitDraft(box.querySelector('[data-el="draft"]'));
    renderCheck(ui);
    const aiBtn = box.querySelector('[data-act="ai-draft"]');
    serverHealth().then(h => {
      if (!aiBtn.isConnected) return;
      aiBtn.disabled = locked || !(h && h.ai);
      if (!h) aiBtn.title = '서버 상태를 확인하지 못했어요. 새로고침해 주세요 (키는 서버에만 있음)';
      else if (!h.ai) aiBtn.title = 'AI 연결 안 됨 · 설정 › 연결에서 Anthropic 키를 넣어 주세요';
    });
  }

  /** ① 문구 검토 카드 (입력 칸이 없어 글자를 칠 때마다 다시 그림) */
  function phraseCardHTML(inq, r) {
    const after = inq.status === '승인' || DONE.includes(inq.status);
    const done = phraseDone(inq);
    const g = phraseGates(inq, r);
    const state = done || after ? '<span class="cs-rstate is-ok">통과</span>'
      : r && r.verdict === 'BLOCK' ? '<span class="cs-rstate is-no">사용 불가 표현</span>' : '<span class="cs-rstate">진행 중</span>';
    const head = `<header class="cs-rhead"><h4>02 문구 검토</h4>${state}</header>
<p class="cs-rsub">자동 심의(컴플라이언스 규칙) + 작성자 확인</p>
<div class="cs-chips"><b>다시 심의</b> ${r ? badge(r.verdict) : '<span class="cs-badge">심의 불가</span>'}</div>`;
    const flags = r && r.findings.length ? `<ul class="cs-flags">${r.findings.map(f => `<li>${badge(f.verdict)}<span><b>${esc(f.name)}</b>
  <span class="cs-flag-terms">${f.terms.map(x => String(x).startsWith('(') ? `<code>${esc(x)}</code>`
    : `<button type="button" class="cs-linkbtn" data-act="find-term" data-term="${esc(x)}" title="초안에서 이 표현 찾기">${esc(x)}</button>`).join(' ')}</span>
  <small>→ ${esc(f.alt)}</small></span></li>`).join('')}</ul>` : '';
    const legal = r && r.verdict === 'PASS' ? '<p class="cs-muted">걸린 표현 없음은 법적 승인이 아니에요.</p>' : '';
    if (after) return `${head}${flags}${done ? `<p class="cs-muted">${esc(inq.phrase.by)} 확인 · ${fmt(inq.phrase.at)}</p>` : ''}${legal}`;
    if (done) return `${head}${flags}<p class="cs-muted">${esc(inq.phrase.by)} 확인 · ${fmt(inq.phrase.at)} · 본문을 고치면 다시 열려요.</p>${legal}
<div class="cs-actions"><button type="button" class="cs-btn cs-btn-sm" data-act="phrase-undo">문구 검토 다시 열기</button></div>`;
    const revise = r && (r.verdict === 'REVISE' || r.verdict === 'REVIEW');
    return `${head}${flags}${todoPanelHTML(inq.draft)}
<ul class="cs-gates">${g.map(x => `<li class="${x.ok ? 'is-ok' : 'is-no'}">${x.ok ? '✓' : '✗'} ${esc(x.label)}</li>`).join('')}</ul>
${revise ? '<p class="cs-muted">수정 필요·검토 필요 표현을 그대로 두면 CS 검토 때 의견을 남겨야 해요.</p>' : ''}${legal}
<div class="cs-actions"><button type="button" class="cs-btn cs-btn-dark" data-act="phrase-done" ${g.every(x => x.ok) ? '' : 'disabled'}>문구 검토 완료</button></div>`;
  }

  /** ② CS 검토 카드의 고정 부분 (입력 칸이 있어 다시 그리지 않음 · 남은 조건·버튼 상태는 paintCsCard가 바꿈) */
  function csCardHTML(ui, inq, t) {
    const a = inq.approval || {};
    const head = `<header class="cs-rhead"><h4>03 CS 검토</h4><span class="cs-rstate" data-el="cs-state"></span></header>
<p class="cs-rsub">검토 ${esc(t.owner)} · 작성자와 다른 사람</p>`;
    if (inq.status === '승인' || DONE.includes(inq.status)) {
      return `${head}
<p class="cs-ok">승인 · ${esc(a.by || '')} · ${fmt(a.at)} ${a.verdict ? badge(a.verdict) : ''}</p>
${a.comment ? `<p class="cs-muted">의견: ${esc(a.comment)}</p>` : ''}
${inq.status === '승인' ? `<p class="cs-muted">본문을 고치면 승인이 풀리고 두 검토가 다시 열려요.</p>
<div class="cs-actions"><button type="button" class="cs-btn cs-btn-sm" data-act="copy">승인된 초안 복사</button>
  <button type="button" class="cs-btn cs-btn-sm" data-act="unapprove">승인 취소</button></div>` : ''}`;
    }
    return `${head}
<fieldset class="cs-approve" data-el="csfield" aria-label="CS 검토">
  <div class="cs-checks">${csChecks(inq).map((x, k) => `<label class="cs-check"><input type="checkbox" data-el="cs-check" data-k="${k}" ${(inq.csChecks || [])[k] ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
  <label class="cs-field"><span>검토자</span><input class="cs-input" data-el="approver" value="${esc(ui.approver)}" placeholder="이름"></label>
  <label class="cs-field"><span>검토 의견</span><textarea class="cs-input" rows="2" data-el="comment" placeholder="수정 필요·검토 필요 판정이거나 돌려보낼 때 필수">${esc(inq.pendingComment || '')}</textarea></label>
  <div data-el="cs-need"></div>
  <div class="cs-actions"><button type="button" class="cs-btn cs-primary" data-act="approve" disabled>CS 검토 승인</button>
    <button type="button" class="cs-btn" data-act="send-back">작성자에게 돌려보내기</button></div>
</fieldset>
<details class="cs-share-wrap"><summary>${icon('mail')} 검토 담당자에게 요청 보내기</summary>${shareBoxHTML(`inq:${inq.id}`, t.code === 'C1' ? 'adverse' : 'review', t.owner)}</details>`;
  }

  function paintCsCard(ui, inq, r) {
    const card = ui.root.querySelector('[data-el="detail"] [data-el="cscard"]');
    if (!card) return;
    const after = inq.status === '승인' || DONE.includes(inq.status);
    const waiting = !after && !phraseDone(inq);
    card.classList.toggle('is-locked', waiting);
    const st = card.querySelector('[data-el="cs-state"]');
    if (st) { st.className = `cs-rstate${after ? ' is-ok' : ''}`; st.textContent = after ? '승인' : waiting ? '문구 검토 뒤' : '대기'; }
    const fs = card.querySelector('[data-el="csfield"]');
    if (!fs) return;
    fs.disabled = waiting;
    const need = waiting ? [] : csGates(inq, r, ui.approver).filter(x => !x.ok);
    card.querySelector('[data-el="cs-need"]').innerHTML = need.length
      ? `<ul class="cs-gates">${need.map(x => `<li class="is-no">✗ ${esc(x.label)}</li>`).join('')}</ul>` : '';
    card.querySelector('[data-act="approve"]').disabled = waiting || need.length > 0;
  }

  /** 04 보내기 카드 (두 검토를 지나야 보내기가 열림) */
  function sendbarHTML(ui, inq) {
    const st = stageOf(inq);
    let act;
    if (inq.status === '종결') act = '<span class="cs-muted">종결된 문의예요.</span>';
    else if (inq.status === '발송 완료') {
      act = `<span class="cs-ok">보냄${inq.sentAt ? ` · ${fmt(inq.sentAt)}` : ''}${inq.sentTo ? ` · ${esc(inq.sentTo)}` : ''}${inq.sentMode === 'demo' ? ' (시연)' : ''}</span>
<button type="button" class="cs-btn" data-act="close" title="고객 답이 더 없으면 닫아요">종결</button>`;
    } else if (st === 'ready') {
      const c = sendCheck(inq);
      act = c.ok ? '' : `<span class="cs-note cs-note-block">보낼 수 없음 · ${esc(c.why)}</span>`;
      act += inq.gmailId
        ? `<button type="button" class="cs-btn" data-act="draft-only" ${c.ok && ui.gmail ? '' : 'disabled'}>Gmail 초안으로${inq.gmailDraftAt ? ' (만듦)' : ''}</button>
<button type="button" class="cs-btn cs-primary" data-act="send" ${c.ok && ui.gmail ? '' : 'disabled'}
  title="${!ui.gmail ? '설정 › 연결에서 Google로 로그인한 뒤 사용' : '받는 사람을 확인한 뒤 Gmail로 바로 보내요'}">${icon('mail')} 보내기</button>`
        : `<button type="button" class="cs-btn cs-primary" data-act="mark-sent" ${c.ok ? '' : 'disabled'}
  title="예시 문의는 받는 주소가 example.com이라 실제로 보내지 않아요">보낸 것으로 표시 (시연)</button>`;
    } else {
      const left = [st === 'new' || st === 'phrase' ? '02 문구 검토' : '', st !== 'ready' ? '03 CS 검토' : ''].filter(Boolean);
      act = `<p class="cs-muted">${left.join(' · ')}를 마치면 보낼 수 있어요.</p>
<button type="button" class="cs-btn" disabled title="두 검토를 마쳐야 보낼 수 있어요">보내기</button>`;
    }
    return `<div class="cs-actions">${act}</div>`;
  }

  /** 01 답장 쓰기 카드: 빈칸·사용 불가 표현만 보고 다음 단계로 */
  function replyCardHTML(inq, r) {
    const todos = pendingTodos(inq.draft).length;
    const block = !!r && r.verdict === 'BLOCK';
    const ok = !todos && !block;
    return `<header class="cs-rhead"><h4>01 답장 쓰기</h4><span class="cs-rstate${ok ? ' is-ok' : ''}">${ok ? '준비됨' : '작성 중'}</span></header>
<ul class="cs-gates">
  <li class="${todos ? 'is-no' : 'is-ok'}">${todos ? `✗ 빈칸 [확인 필요] ${todos}곳 남음` : '✓ 빈칸 모두 채움'}</li>
  <li class="${block ? 'is-no' : 'is-ok'}">${block ? '✗ 사용 불가 표현 있음 (빨간 물결 밑줄)' : '✓ 사용 불가 표현 없음'}</li>
</ul>
${todoPanelHTML(inq.draft)}
<p class="cs-muted">「AI로 초안 다듬기」로 문의에 맞게 다시 쓸 수 있어요. 팀에게만 남길 말은 「내부 메모」에 적어요.</p>
<div class="cs-actions"><button type="button" class="cs-btn${ok ? ' cs-btn-dark' : ''}" data-act="step" data-step="phrase">다음: 문구 검토 →</button></div>`;
  }

  /** 문의를 열 때 고를 단계 탭: 새 문의·문구 검토 단계는 빈칸이 남았으면 01, 다 채웠으면 02 */
  function autoStep(inq) {
    const st = stageOf(inq);
    if (st === 'cs') return 'cs';
    if (st === 'ready' || st === 'sent') return 'send';
    return pendingTodos(inq.draft).length ? 'reply' : 'phrase';
  }

  /** 단계 탭 (끝난 단계는 ✓) · 고른 단계 카드만 보이게 */
  function paintSteps(ui, inq, r) {
    const box = ui.root.querySelector('[data-el="detail"]');
    const nav = box.querySelector('[data-el="steps"]');
    if (!nav) return;
    if (inq) {
      const st = stageOf(inq);
      const past = ['cs', 'ready', 'sent'].includes(st);
      const done = {
        reply: past || (!pendingTodos(inq.draft).length && !(r && r.verdict === 'BLOCK')),
        phrase: past, cs: st === 'ready' || st === 'sent', send: st === 'sent'
      };
      nav.innerHTML = STEPS.map(([id, l], k) => `<button type="button" role="tab" data-act="step" data-step="${id}" aria-selected="${id === ui.step}">
  <span class="cs-step-no">0${k + 1}</span>${l}${done[id] ? '<span class="cs-step-ok" aria-label="끝남">✓</span>' : ''}</button>`).join('');
    } else nav.querySelectorAll('[data-step]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.step === ui.step)));
    box.querySelectorAll('[data-step-pane]').forEach(p => { p.hidden = p.dataset.stepPane !== ui.step; });
  }

  /** 글을 고칠 때마다: 밑줄 · 단계 탭 · 01 답장 · 02 문구 검토 카드 · 03 CS 검토 남은 조건 · 04 보내기 */
  function renderCheck(ui) {
    const box = ui.root.querySelector('[data-el="detail"]');
    const inq = load().find(x => x.id === ui.selected);
    if (!inq) return;
    const r = recheck(inq.draft, inq.product);
    const hl = box.querySelector('[data-el="hl"]');
    if (hl) hl.innerHTML = highlightHTML(inq.draft, r);
    const rc = box.querySelector('[data-el="replycard"]');
    if (rc) rc.innerHTML = replyCardHTML(inq, r);
    const pc = box.querySelector('[data-el="phrase"]');
    if (pc) pc.innerHTML = phraseCardHTML(inq, r);
    paintCsCard(ui, inq, r);
    const sb = box.querySelector('[data-el="sendbar"]');
    if (sb) sb.innerHTML = sendbarHTML(ui, inq);
    paintSteps(ui, inq, r);
  }

  function wireDetail(ui) {
    const box = ui.root.querySelector('[data-el="detail"]');
    const redraw = () => { follow(ui); renderDetail(ui); renderList(ui); };

    box.addEventListener('input', e => {
      const el = e.target.dataset.el;
      if (el === 'draft') {
        fitDraft(e.target);
        patch(ui.selected, inq => {
          inq.draft = e.target.value;
          inq.edited = true;
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; logTo(inq, '승인 후 초안 수정 → 승인 취소'); revokeServer(inq); }
          else if (inq.status === '답변 대기') inq.status = '검토 중';
        });
        follow(ui);   // 문구 검토를 마친 뒤 고치면 문구 검토 단계로 돌아감 (본문 지문이 달라짐)
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
          inq.csChecks = [];   // 유형마다 확인 항목이 다름
          if (!inq.edited) inq.draft = draftFor(inq);
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; revokeServer(inq); }
          logTo(inq, `유형 변경 → ${inq.type}`);
        });
        redraw();
      } else if (el === 'product') {
        patch(ui.selected, inq => {
          inq.product = e.target.value;
          if (!inq.edited) inq.draft = draftFor(inq);   // 직접 고친 초안은 그대로 (필요하면 '템플릿으로 다시 만들기')
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; revokeServer(inq); }
          logTo(inq, `제품 → ${productKo(inq.product)}`);
        });
        redraw();
      } else if (el === 'cs-check') {
        patch(ui.selected, inq => {
          const list = Array.isArray(inq.csChecks) ? inq.csChecks.slice() : [];
          list[Number(e.target.dataset.k)] = e.target.checked;
          inq.csChecks = list;
        });
        renderCheck(ui);
      }
    });

    box.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      const id = ui.selected;
      const draftTa = () => box.querySelector('[data-el="draft"]');
      const showReply = () => { if (ui.ctab === 'note') box.querySelector('[data-act="ctab"][data-ctab="reply"]').click(); };

      if (act === 'ctab') {
        ui.ctab = btn.dataset.ctab;
        box.querySelectorAll('[data-act="ctab"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ctab === ui.ctab)));
        box.querySelectorAll('[data-ctab-pane]').forEach(p => { p.hidden = p.dataset.ctabPane !== ui.ctab; });
        if (ui.ctab === 'reply') fitDraft(draftTa()); else box.querySelector('[data-el="note"]').focus();
        return;
      }
      if (act === 'step') {
        ui.step = btn.dataset.step;
        paintSteps(ui);
        const nav = box.querySelector('[data-el="steps"]');
        if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start' });
        return;
      }
      if (act === 'todo-jump') { showReply(); return jumpToTodo(draftTa(), Number(btn.dataset.idx) || 0); }
      if (act === 'find-term') { showReply(); return selectInDraft(draftTa(), btn.dataset.term); }
      if (['send', 'draft-only', 'mark-sent'].includes(act)) return outboxAct(ui, btn, redraw);
      if (act === 'back-list') { setView(ui, 'list'); renderList(ui); return; }
      if (act === 'nav') { const ids = ui.shownIds || []; return openInquiry(ui, ids[ids.indexOf(id) + Number(btn.dataset.step)]); }
      if (act === 'cust-history') { ui.custView = 'all'; ui.custSort = 'count'; return ui.showTab('customers'); }
      if (act === 'regen') {
        const cur = load().find(x => x.id === id);
        if (cur && cur.edited && !global.confirm('수정한 초안이 템플릿으로 바뀌어요. 계속할까요?')) return;
        patch(id, inq => {
          inq.draft = draftFor(inq);
          inq.edited = false;
          inq.aiDraftAt = null;
          inq.aiNotes = [];
          inq.aiTruncated = [];
          inq.prevDraft = '';
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; revokeServer(inq); }
          logTo(inq, '템플릿으로 초안 다시 만들기');
        });
        redraw();
      } else if (act === 'phrase-done') {
        const cur = load().find(x => x.id === id);
        const r = recheck(cur.draft, cur.product);
        if (!phraseGates(cur, r).every(x => x.ok)) { renderCheck(ui); return; }
        const by = ui.me || '작성자';
        patch(id, inq => {
          inq.phrase = { by, at: Date.now(), fp: fingerprint(inq.draft), verdict: r.verdict };
          if (inq.status === '답변 대기') inq.status = '검토 중';
          logTo(inq, `문구 검토 완료 (${by})`);
        });
        toast('문구 검토를 마쳤어요. CS 검토로 넘겼어요.');
        redraw();
      } else if (act === 'phrase-undo') {
        patch(id, inq => { inq.phrase = null; logTo(inq, '문구 검토 다시 열기'); });
        redraw();
      } else if (act === 'approve') {
        const cur = load().find(x => x.id === id);
        const r = recheck(cur.draft, cur.product);
        const who = ui.approver.trim();
        if (!phraseGates(cur, r).every(x => x.ok) || !csGates(cur, r, who).every(x => x.ok)) { renderCheck(ui); return; }
        const done = account => {
          patch(id, inq => {
            inq.status = '승인';
            inq.ownerChecked = true;   // 지정 담당 검토 = CS 검토 (stats.owner_required)
            inq.approval = { by: who, account: account || '', at: Date.now(), comment: (inq.pendingComment || '').trim(), verdict: r.verdict, codes: r.codes, checks: csChecks(inq) };
            logTo(inq, `CS 검토 승인 (${who})`);
          });
          toast('CS 검토를 승인했어요. 이제 보낼 수 있어요.');
          redraw();
        };
        // Gmail 문의는 서버에도 승인 기록 (보내기 때 본문 지문을 대조) · 더미 문의는 화면에만
        if (!cur.gmailId) return done('');
        btn.disabled = true;
        api('/api/cs/approve', { message_id: cur.gmailId, body: cur.draft, approver: who, verdict: r.verdict, product: cur.product || '' })
          .then(res => done(res.account))
          .catch(err => { toast(`승인하지 못했어요: ${err.message}`); btn.disabled = false; });
      } else if (act === 'send-back') {
        const cur = load().find(x => x.id === id);
        const why = String(cur.pendingComment || '').trim();
        if (!why) {
          toast('돌려보내는 이유를 검토 의견에 적어 주세요.');
          const c = box.querySelector('[data-el="comment"]');
          if (c) c.focus();
          return;
        }
        const by = ui.approver.trim() || '검토자';
        patch(id, inq => {
          inq.notes = (inq.notes || []).concat({ by, at: Date.now(), text: `돌려보냄: ${why}` });
          inq.phrase = null;
          inq.csChecks = [];
          inq.pendingComment = '';
          logTo(inq, `CS 검토 → 작성자에게 돌려보냄 (${by})`);
        });
        toast('작성자에게 돌려보냈어요. 문구 검토 단계로 옮겼어요.');
        redraw();
      } else if (act === 'note-add') {
        const ta = box.querySelector('[data-el="note"]');
        const text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        patch(id, inq => {
          inq.notes = (inq.notes || []).concat({ by: ui.me || '팀', at: Date.now(), text });
          logTo(inq, '내부 메모 남김');
        });
        renderDetail(ui);
      } else if (act === 'copy') {
        // 승인된 초안만 복사 (승인 후 초안을 고치면 승인이 풀려 이 버튼이 사라짐)
        const cur = load().find(x => x.id === id);
        if (!cur || cur.status !== '승인' || pendingTodos(cur.draft).length) return;
        copyText(cur.draft).then(ok => {
          if (ok) patch(id, inq => logTo(inq, '승인된 초안 복사'));
          toast(ok ? '초안을 복사했어요. 메일 프로그램에서 직접 확인 후 보내세요.' : '복사하지 못했어요. 초안 칸에서 직접 복사하세요.');
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
          inq.aiTruncated = [];
          inq.aiDraftAt = null;
          if (inq.status === '승인') { inq.status = '검토 중'; inq.approval = null; revokeServer(inq); }
          logTo(inq, 'AI 초안 되돌리기');
        });
        redraw();
      } else if (act === 'unapprove') {
        revokeServer(patch(id, inq => { inq.status = '검토 중'; inq.approval = null; logTo(inq, '승인 취소'); }));
        redraw();
      } else if (act === 'close') {
        patch(id, inq => { inq.status = '종결'; logTo(inq, '종결'); });
        redraw();
      } else if (act === 'to-adverse') {
        const cur = load().find(x => x.id === id);
        ui.adverseDraft = { customer: cur.name, contact: cur.from, symptoms: cur.body, source: `${cur.subject}\n${cur.body}`, linkedInquiry: cur.id, product: cur.product ? `REBOOT ${productKo(cur.product)}` : '' };
        ui.showTab('adverse');
      } else if (act === 'to-adverse-records') {
        ui.showTab('adverse');
      }
    });
  }

  /* 담당자에게 전달 — 문의 검토·승인 요청, 부작용 접수 공유를 팀 담당자에게 (2026-10-24)
     ① Gmail로 보내기(등록된 담당자 주소로만 · 서버가 확인) ② 메신저용 복사 ③ 메일 앱으로 열기
     연락처는 서버 보관(/api/cs/contacts) · 문의함 답장 설정 → 담당자 연락처에서 등록 */

  let CONTACTS = [];
  let contactsP = null;
  function loadContacts(force) {
    if (!contactsP || force) {
      contactsP = api('/api/cs/contacts').then(r => { CONTACTS = r.items || []; return CONTACTS; }).catch(() => CONTACTS);
    }
    return contactsP;
  }
  const SHARE_KIND = { review: '검토 요청', approve: '승인 요청', adverse: '부작용 접수 공유', info: '참고 공유' };

  function defaultContact(role) {
    const r = String(role || '').replace(/\s*\{.*\}\s*/, '').trim();
    return CONTACTS.find(c => c.role && r && (c.role === r || r.includes(c.role) || c.role.includes(r))) || null;
  }

  function shareBoxHTML(key, kind, role) {
    const pick = defaultContact(role);
    return `
<div class="cs-share" data-share-key="${esc(key)}">
  <div class="cs-row">
    <label class="cs-field cs-grow"><span>받는 담당자</span><select class="cs-input" data-share="to">
      <option value="">(받는 사람 없이 복사만)</option>
      ${CONTACTS.map(c => `<option value="${esc(c.email)}"${pick && pick.email === c.email ? ' selected' : ''}>${esc([c.role, c.name].filter(Boolean).join(' · '))} &lt;${esc(c.email)}&gt;</option>`).join('')}</select></label>
    <label class="cs-field"><span>요청 종류</span><select class="cs-input" data-share="kind">
      ${Object.entries(SHARE_KIND).map(([k, l]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>
  <label class="cs-field"><span>요청 메모 (선택)</span><input class="cs-input" data-share="memo" placeholder="예: 환불 정책 기준으로 답해도 될지 확인 부탁드려요"></label>
  <label class="cs-field"><span>보낼 내용 <span class="cs-muted">· 자동 작성 · 직접 고쳐도 됨</span></span><textarea class="cs-input cs-share-body" rows="12" data-share="body"></textarea></label>
  <div class="cs-actions">
    <button type="button" class="cs-btn cs-primary" data-act="share-gmail">${icon('mail')} Gmail로 담당자에게 보내기</button>
    <button type="button" class="cs-btn" data-act="share-copy">메신저용 복사</button>
    <button type="button" class="cs-btn" data-act="share-mailto">메일 앱으로 열기</button>
  </div>
  <p class="cs-muted">${CONTACTS.length ? `담당 '${esc(String(role || '').replace(/\s*\{.*\}\s*/, ''))}'에 맞는 연락처를 자동으로 골랐어요.` : '등록된 담당자가 없어요. <b>답장 설정 → 담당자 연락처</b>에서 이름·이메일을 넣으면 Gmail로 보낼 수 있어요.'}
    Gmail 보내기는 <b>등록된 담당자 주소로만</b> 돼요. 고객 개인정보가 들어 있으니 팀 안에서만 쓰세요.</p>
</div>`;
  }

  /** 전달 내용 만들기: key = 'inq:<문의 id>' 또는 'adv:<부작용 기록 id>' */
  function shareContent(key, kind, memo) {
    const [what, id] = [key.slice(0, 3), key.slice(4)];
    const lines = [];
    const add = (...x) => lines.push(...x);
    const head = `[REBOOT CS · ${SHARE_KIND[kind] || '공유'}]`;
    const link = `${global.location ? global.location.origin : ''}/dashboard/cs`;
    if (what === 'inq') {
      const inq = load().find(x => x.id === id);
      if (!inq) return { subject: head, body: '' };
      const t = TYPES[inq.type];
      const r = recheck(inq.draft, inq.product);
      const todos = pendingTodos(inq.draft);
      const adv = loadAdverse().find(x => x.linkedInquiry === inq.id);
      add(`${SHARE_KIND[kind]} 드려요.`);
      if (memo) add(`요청: ${memo}`);
      add('', '■ 문의', `- 고객: ${inq.name} (${inq.from})`, `- 받은 시각: ${fmt(inq.receivedAt)} · 응답 기한: ${fmt(due(inq))} (${dueText(inq)})`,
        `- 유형: ${inq.type} ${t.name} · 제품: ${productKo(inq.product)} · 상태: ${statusText(inq.status)}`, `- 제목: ${inq.subject}`, '- 내용:', String(inq.body || '').slice(0, 3000));
      if (kind !== 'adverse' || inq.draft) {
        add('', '■ 우리 답장 초안 (영문)', String(inq.draft || '(초안 없음)').slice(0, 4000));
        add('', '■ 문구 심의', `- 다시 심의: ${r ? `${LABEL[r.verdict] || r.verdict}${r.codes.length ? ` (${r.codes.join(', ')})` : ''}` : '불가'}`,
          `- 남은 빈칸: ${todos.length ? todos.join(' / ') : '없음'}`,
          t.ownerRequired ? `- 지정 담당(${t.owner}) 검토: ${inq.ownerChecked ? '완료' : '필요'}` : '- 지정 담당 검토: 해당 없음');
        if (inq.approval) add(`- CS 검토 승인: ${inq.approval.by} · ${fmt(inq.approval.at)}`);
      }
      if (adv || kind === 'adverse') add('', '■ 부작용 접수', adv ? adverseLines(adv).join('\n') : '- 아직 부작용 접수 기록 없음 (C1이면 부작용 접수를 먼저 남기세요)');
      add('', `대시보드: ${link} (문의 #${inq.id})`);
      return { subject: `${head} ${inq.type} ${t.name} · ${inq.name} · 기한 ${fmt(due(inq))}`, body: lines.join('\n') };
    }
    const rec = loadAdverse().find(x => x.id === id);
    if (!rec) return { subject: head, body: '' };
    add(`${SHARE_KIND[kind]} 드려요.`);
    if (memo) add(`요청: ${memo}`);
    add('', '■ 부작용 접수', ...adverseLines(rec), '', `대시보드: ${link} (부작용 접수)`);
    return { subject: `${head} ${rec.serious ? '심각 · ' : ''}${rec.fields.product || '제품 미입력'} · 로트 ${rec.fields.lot || '—'}`, body: lines.join('\n') };
  }

  function adverseLines(rec) {
    const f = rec.fields;
    const s = rec.stages || {};
    return [`- 판정: ${rec.serious ? '심각 (보고 대상 판단 필요)' : '일반'} · 접수 ${fmt(rec.createdAt)}`,
      `- 고객: ${f.customer || '—'} (${f.contact || '—'}) · 제품: ${f.product || '—'} · 로트: ${f.lot || '—'}`,
      `- 섭취일: ${f.intakeDate || '—'} · 진료: ${f.care || '—'} · 결과: ${f.outcome || '—'} · 식품 위해 가능성: ${f.hazard || '—'}`,
      `- 증상: ${String(f.symptoms || '—').slice(0, 1500)}`,
      rec.missing && rec.missing.length ? `- 빠진 항목: ${rec.missing.map(k => FIELD_LABEL[k]).join(', ')}` : '- 빠진 항목: 없음',
      `- 단계: 긴급 검토 ${s.reviewAt ? fmt(s.reviewAt) : '전'} · 보고 대상 판단 ${s.judgedAt ? fmt(s.judgedAt) : '전'} · 보고 ${s.reportedAt ? fmt(s.reportedAt) : '전'}`];
  }

  function fillShare(box) {
    const key = box.dataset.shareKey;
    const c = shareContent(key, box.querySelector('[data-share="kind"]').value, box.querySelector('[data-share="memo"]').value.trim());
    box.dataset.subject = c.subject;
    box.querySelector('[data-share="body"]').value = c.body;
  }

  /** 전달 버튼 (문의함 상세 · 부작용 접수 공통 · render의 위임 처리에서 부름) */
  async function runShare(ui, btn) {
    const box = btn.closest('.cs-share');
    const to = box.querySelector('[data-share="to"]').value;
    const subject = box.dataset.subject || '[REBOOT CS]';
    const body = box.querySelector('[data-share="body"]').value;
    const who = (CONTACTS.find(c => c.email === to) || {}).name || to;
    const logShare = how => {
      const key = box.dataset.shareKey;
      if (key.startsWith('inq:')) patch(key.slice(4), x => logTo(x, `담당자 전달 (${how})${who ? ` → ${who}` : ''}`));
    };
    if (btn.dataset.act === 'share-copy') {
      const ok = await copyText(`${subject}\n\n${body}`);
      if (ok) logShare('메신저용 복사');
      return toast(ok ? '복사했어요. 메신저(슬랙·카톡 등)에 붙여 넣으세요.' : '복사하지 못했어요. 내용 칸에서 직접 복사하세요.');
    }
    if (btn.dataset.act === 'share-mailto') {
      if (!to) return toast('받는 담당자를 고르세요.');
      const max = 1800;   // 메일 앱 주소 길이 제한 → 길면 앞부분만
      global.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.length > max ? body.slice(0, max) + '\n…(내용이 길어 잘림 · 대시보드에서 확인)' : body)}`;
      return logShare('메일 앱');
    }
    if (!to) return toast('받는 담당자를 고르세요.');
    if (!ui.gmail) return toast('Gmail 로그인이 필요해요 (설정 › 연결 › Google로 로그인).');
    if (!global.confirm(`담당자에게 Gmail로 보내요.\n\n받는 사람: ${who} <${to}>\n제목: ${subject}`)) return;
    btn.disabled = true;
    try {
      await api('/api/cs/notify', { to, subject, body });
      logShare('Gmail');
      toast(`${who}에게 보냈어요.`);
    } catch (e) {
      toast(`보내지 못했어요: ${e.message}`);
    }
    btn.disabled = false;
  }

  function contactsHTML() {
    const roles = [...new Set(DATA.types.map(t => String(t.owner || '').replace(/\s*\{.*\}\s*/, '').trim()).filter(Boolean).concat(['품질 담당', '규제 담당']))];
    const rows = CONTACTS.length ? CONTACTS : [{ role: '', name: '', email: '' }];
    return `
<section class="cs-setpane" data-setpane="contacts">
    <p class="cs-muted">문의 검토·승인 요청과 부작용 접수를 보낼 팀 담당자예요. <b>역할</b>을 답장 템플릿의 담당 이름과 같게 쓰면(예: 품질·규제 담당) 문의를 열 때 자동으로 골라져요. Gmail로 보내기는 여기 등록된 주소로만 돼요.</p>
    <datalist id="cs-roles">${roles.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <div class="cs-contacts" data-el="contacts">${rows.map(contactRowHTML).join('')}</div>
    <div class="cs-actions"><button type="button" class="cs-btn cs-btn-sm" data-act="contact-add">+ 담당자 추가</button>
      <button type="button" class="cs-btn cs-primary" data-act="contacts-save">저장</button></div>
</section>`;
  }
  function contactRowHTML(c) {
    return `<div class="cs-row cs-contact">
      <label class="cs-field"><span>역할</span><input class="cs-input" list="cs-roles" data-c="role" value="${esc(c.role || '')}" placeholder="예: 품질·규제 담당"></label>
      <label class="cs-field"><span>이름</span><input class="cs-input" data-c="name" value="${esc(c.name || '')}"></label>
      <label class="cs-field cs-grow"><span>이메일</span><input class="cs-input" type="email" data-c="email" value="${esc(c.email || '')}" placeholder="name@example.com"></label>
      <button type="button" class="cs-btn cs-btn-sm" data-act="contact-del" aria-label="이 담당자 삭제">삭제</button></div>`;
  }

  /* 고객 이력 — 보낸 사람(이메일)별로 문의를 묶어 누가 많이 보냈는지 · 사실에 근거한 '주의 신호' · 담당자 분류 (2026-10-24)
     시스템은 '블랙컨슈머'를 단정하지 않습니다. 신호(문구·횟수)를 보여 주고, 분류는 담당자가 이유와 함께 정합니다.
     분류는 내부 응대 참고용이며, 주의 고객이어도 C1 부작용 신고는 정상 처리합니다 (FDA 보고 대상 판단). */

  const CUST_TAGS = [['', '분류 안 함'], ['vip', '단골'], ['watch', '주의 고객'], ['limit', '응대 제한 검토']];
  const CUST_TAG_LABEL = Object.fromEntries(CUST_TAGS);
  // 문의 본문에서 찾는 신호 (영어·한국어) · 신호가 있다고 악성인 것은 아님 → 담당자가 내용을 보고 판단
  const SIGNALS = [
    { id: 'review', label: '리뷰·별점으로 압박', re: /\b(1|one)[\s-]*star|\b(bad|negative|terrible) review|\bleave (a|an|my) (1|one|bad|honest|negative)?[\s-]*(star )?review|별점 ?1|리뷰 (남기|올리|쓰)|악플/i },
    { id: 'legal', label: '법적 조치·신고 언급', re: /\b(lawyers?|attorneys?|sue|suing|lawsuit|legal action|small claims|BBB|better business bureau|report (you|this)|attorney general)\b|소송|변호사|고소|신고(할|하겠)/i },
    { id: 'chargeback', label: '카드 결제 취소(차지백) 언급', re: /\b(charge ?back|dispute (the|this|my) (charge|payment)|call(ing)? my bank)\b|결제 취소|카드사에/i },
    { id: 'abuse', label: '욕설·모욕', re: /\b(scam(mers?)?|idiots?|stupid|garbage|fraud|f+u+c+k\w*|shit\w*|wtf)\b|사기꾼|쓰레기|미친/i },
    { id: 'freebie', label: '무료·추가 보상 요구', re: /\b(free (box|boxes|product|products)|compensat\w+|send me (another|more|extra)|refund and (a )?(free|another))\b|보상(해|을 요구)|공짜로/i }
  ];

  function emailOf(from) {
    const s = String(from || '');
    return ((s.match(/<([^>]+)>/) || [])[1] || s).trim().toLowerCase();
  }
  function custTags() { return store.get(KEY.custTags, {}) || {}; }

  /** 보낸 사람별 묶음: [{ email, names, list(최신순), types, signals:[{id,label,count}], behavior:[...], tag }] */
  function customers() {
    const map = new Map();
    load().forEach(i => {
      const e = emailOf(i.from);
      if (!e) return;
      const c = map.get(e) || { email: e, names: new Set(), list: [] };
      c.names.add(i.name);
      c.list.push(i);
      map.set(e, c);
    });
    const tags = custTags();
    const now = Date.now();
    return [...map.values()].map(c => {
      c.list.sort((a, b) => b.receivedAt - a.receivedAt);
      const types = {};
      c.list.forEach(i => { types[i.type] = (types[i.type] || 0) + 1; });
      const signals = SIGNALS.map(s => ({ id: s.id, label: s.label, count: c.list.filter(i => s.re.test(`${i.subject}\n${i.body}`)).length })).filter(s => s.count);
      const behavior = [];
      if ((types.C3 || 0) >= 2) behavior.push(`환불·교환 요청 ${types.C3}회`);
      if ((types.C8 || 0) >= 2) behavior.push(`불만·리뷰 문의 ${types.C8}회`);
      const week = c.list.filter(i => now - i.receivedAt < 7 * 24 * HOUR).length;
      if (week >= 3) behavior.push(`7일 안에 ${week}건`);
      return { email: c.email, names: [...c.names], list: c.list, types, signals, behavior, last: c.list[0] ? c.list[0].receivedAt : 0, tag: tags[c.email] || null };
    });
  }

  function custChips(c, compact) {
    const n = c.signals.length + c.behavior.length;
    return `${c.list.length > 1 ? `<span class="cs-chip cs-chip-dim" title="이 고객이 보낸 문의">이 고객 ${c.list.length}건</span>` : ''}`
      + (c.tag && c.tag.tag ? `<span class="cs-chip cs-cust-${esc(c.tag.tag)}">${esc(CUST_TAG_LABEL[c.tag.tag] || c.tag.tag)}</span>` : '')
      + (n && !compact ? `<span class="cs-chip cs-chip-warn" title="${esc(c.signals.map(s => s.label).concat(c.behavior).join(' · '))}">주의 신호 ${n}</span>` : '');
  }

  function renderCustomers(ui, p) {
    const all = customers();
    const isRepeat = c => c.list.length > 1 || c.signals.length || c.behavior.length || (c.tag && c.tag.tag);
    // 처음 열 때 해당 고객이 없으면 빈 화면 대신 전체를 보여 줌
    const f = ui.custView || (all.some(isRepeat) ? 'repeat' : 'all');
    const sort = ui.custSort || 'count';
    const shown = all.filter(c => f === 'all' ? true : f === 'repeat' ? isRepeat(c)
      : f === 'signal' ? c.signals.length || c.behavior.length : f === 'tagged' ? c.tag && ['watch', 'limit'].includes(c.tag.tag) : true)
      .sort((a, b) => sort === 'recent' ? b.last - a.last
        : sort === 'signal' ? (b.signals.length + b.behavior.length) - (a.signals.length + a.behavior.length) || b.list.length - a.list.length
          : b.list.length - a.list.length || b.last - a.last);
    const count = fn => all.filter(fn).length;
    const typeText = c => Object.entries(c.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}${n > 1 ? `×${n}` : ''}`).join(' ');
    p.innerHTML = `
<div class="cs-outbox">
  <div class="cs-card-head"><h3>고객 기록 <span class="cs-chip">${all.length}명</span></h3>
    <span class="cs-muted">2건 이상 ${count(c => c.list.length > 1)}명 · 주의 신호 ${count(c => c.signals.length || c.behavior.length)}명 · 주의·응대 제한 분류 ${count(c => c.tag && ['watch', 'limit'].includes(c.tag.tag))}명</span></div>
  <p class="cs-note">보낸 사람(이메일)별로 문의를 묶었어요. <b>주의 신호</b>는 문의 내용·횟수에서 찾은 사실이고, 신호가 있다고 악성 고객인 것은 아니에요. 분류는 담당자가 내용을 보고 이유와 함께 정하세요.
    분류는 <b>내부 응대 참고용</b>(고객에게 보이지 않음 · 외부 공유 금지)이고, 주의 고객이어도 <b>C1 부작용 신고는 정상 처리</b>해요.</p>
  <div class="cs-row">
    <label class="cs-field"><span>보기</span><select class="cs-input" data-el="cust-view">
      ${[['repeat', '여러 번 보냈거나 신호·분류가 있는 고객'], ['signal', '주의 신호가 있는 고객'], ['tagged', '주의·응대 제한으로 분류한 고객'], ['all', '전체 고객']].map(([v, l]) => `<option value="${v}"${v === f ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="cs-field"><span>정렬</span><select class="cs-input" data-el="cust-sort">
      ${[['count', '문의 많은 순'], ['signal', '주의 신호 많은 순'], ['recent', '최근 문의 순']].map(([v, l]) => `<option value="${v}"${v === sort ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>
  <div class="cs-actions cs-cust-tools"><button type="button" class="cs-btn cs-btn-sm" data-act="cust-all" data-open="1">모두 펼치기</button>
    <button type="button" class="cs-btn cs-btn-sm" data-act="cust-all" data-open="">모두 접기</button></div>
  ${shown.length ? `<div class="cs-custs">${shown.slice(0, ui.custMore ? shown.length : LIST_MAX).map(c => `
  <details class="cs-sec cs-cust" data-email="${esc(c.email)}"${CUST_OPEN.get(c.email) ? ' open' : ''}>
    <summary><span class="cs-avatar" aria-hidden="true">${initials(c.names[0])}</span>
      <span class="cs-sec-title">${esc(c.names.join(' · '))} <span class="cs-muted cs-cust-email">${esc(c.email)}</span></span>
      <span class="cs-sec-sum"><span class="cs-chip">문의 ${c.list.length}건</span><span class="cs-chip cs-chip-dim">${esc(typeText(c))}</span>
        ${c.tag && c.tag.tag ? `<span class="cs-chip cs-cust-${esc(c.tag.tag)}">${esc(CUST_TAG_LABEL[c.tag.tag] || c.tag.tag)}</span>` : ''}
        ${c.signals.length + c.behavior.length ? `<span class="cs-chip cs-chip-warn">주의 신호 ${c.signals.length + c.behavior.length}</span>` : ''}
        <span class="cs-chip cs-chip-dim">마지막 ${fmt(c.last)}</span></span></summary>
    <div class="cs-sec-body">
      ${c.signals.length || c.behavior.length ? `<p class="cs-cust-signals"><b>주의 신호</b> ${c.signals.map(x => `<span class="cs-chip cs-chip-warn">${esc(x.label)}${x.count > 1 ? ` ×${x.count}` : ''}</span>`).join(' ')}
        ${c.behavior.map(b => `<span class="cs-chip cs-chip-warn">${esc(b)}</span>`).join(' ')}</p>` : ''}
      <div class="cs-row cs-cust-tagrow">
        <label class="cs-field"><span>담당자 분류</span><select class="cs-input" data-el="cust-tag">${CUST_TAGS.map(([v, l]) => `<option value="${v}"${(c.tag && c.tag.tag || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="cs-field cs-grow"><span>분류 이유</span><input class="cs-input" data-el="cust-note" placeholder="예: 같은 환불 요청을 3번 반복" value="${esc(c.tag && c.tag.note || '')}"></label>
        ${c.tag && c.tag.at ? `<span class="cs-muted cs-cust-by">${esc(c.tag.by || '')} · ${fmt(c.tag.at)}</span>` : ''}
        <button type="button" class="cs-btn cs-btn-sm" data-act="cust-open">문의함에서 보기</button>
      </div>
      <h4 class="cs-thread-title">주고받은 메일<span class="head-cap">오래된 순 · ${c.list.length}건</span></h4>
      <ol class="cs-thread">${c.list.slice().reverse().map(threadHTML).join('')}</ol>
    </div>
  </details>`).join('')}</div>
  ${shown.length > LIST_MAX ? `<div class="cs-list-more"><button type="button" class="cs-btn cs-btn-sm" data-act="cust-more">${ui.custMore ? '접기' : `나머지 ${shown.length - LIST_MAX}명 더 보기`}</button></div>` : ''}` : '<p class="cs-muted">해당하는 고객이 없어요. 보기를 \'전체 고객\'으로 바꿔 보세요.</p>'}
</div>`;
    p.querySelector('[data-el="cust-view"]').onchange = e => { ui.custView = e.target.value; ui.custMore = false; renderCustomers(ui, p); };
    p.querySelector('[data-el="cust-sort"]').onchange = e => { ui.custSort = e.target.value; renderCustomers(ui, p); };
    const save = row => {
      const email = row.dataset.email;
      const tag = row.querySelector('[data-el="cust-tag"]').value;
      const note = row.querySelector('[data-el="cust-note"]').value.trim().slice(0, 200);
      const tags = custTags();
      if (!tag && !note) delete tags[email];
      else tags[email] = { tag, note, by: (REBOOT.user && REBOOT.user().name) || ui.approver || '', at: Date.now() };
      store.set(KEY.custTags, tags);
      CUST_OPEN.set(email, true);
      renderCustomers(ui, p);
      renderList(ui);
      toast(tag ? `'${CUST_TAG_LABEL[tag]}'로 분류했어요 (내부 참고용).` : '분류를 삭제했어요.');
    };
    const card = el => el.closest('[data-email]');
    p.querySelectorAll('details.cs-cust').forEach(d => d.addEventListener('toggle', () => CUST_OPEN.set(d.dataset.email, d.open)));
    p.onchange = e => { if (e.target.dataset.el === 'cust-tag') save(card(e.target)); };
    p.onkeydown = e => { if (e.target.dataset.el === 'cust-note' && e.key === 'Enter') save(card(e.target)); };
    p.onfocusout = e => { if (e.target.dataset.el === 'cust-note' && e.target.value.trim() !== ((custTags()[card(e.target).dataset.email] || {}).note || '')) save(card(e.target)); };
    p.onclick = e => {
      if (e.target.closest('[data-act="cust-more"]')) { ui.custMore = !ui.custMore; renderCustomers(ui, p); return; }
      const all = e.target.closest('[data-act="cust-all"]');
      if (all) {
        p.querySelectorAll('details.cs-cust').forEach(d => { d.open = !!all.dataset.open; CUST_OPEN.set(d.dataset.email, d.open); });
        return;
      }
      const one = e.target.closest('[data-act="thread-open"]');
      const btn = e.target.closest('[data-act="cust-open"]');
      if (!one && !btn) return;
      ui.custFilter = card(e.target).dataset.email;
      ui.filter = 'all';
      ui.sub = 'work';
      ui.showTab('inbox');
      const shownNow = renderList(ui);
      const pick = one ? shownNow.find(i => i.id === one.dataset.id) : shownNow[0];
      if (pick && one) openInquiry(ui, pick.id); else setView(ui, 'list');   // '문의함에서 보기'는 이 고객 메일 목록
    };
  }

  /** 고객 이력 → 주고받은 메일: 받은 문의 1건 + 우리 답장 (보냄 · 승인됨 · 작성 중) */
  function threadHTML(i) {
    const t = TYPES[i.type];
    const reply = i.status === '발송 완료' || i.sentAt
      ? `<div class="cs-mail cs-mail-out"><div class="cs-mail-head"><b>보낸 답장</b> · ${fmt(i.sentAt)}${i.sentTo ? ` → ${esc(i.sentTo)}` : ''}${i.sentMode === 'demo' ? ' <span class="cs-chip cs-chip-dim">시연 표시 · 실제로 보내지 않음</span>' : ''}
          ${i.approval && i.approval.by ? `<span class="cs-muted">승인 ${esc(i.approval.by)}</span>` : ''}</div><pre class="cs-mail-body">${esc(i.sentBody || i.draft)}</pre></div>`
      : i.status === '승인'
        ? `<div class="cs-mail cs-mail-draft"><div class="cs-mail-head"><b>승인됨 · 아직 안 보냄</b> <span class="cs-muted">문의함 › 보낼 준비에서 보냄</span></div><pre class="cs-mail-body">${esc(i.draft)}</pre></div>`
        : `<details class="cs-mail cs-mail-draft"><summary class="cs-mail-head"><b>답장 아직 안 보냄</b> · ${esc(statusText(i.status))} <span class="cs-muted">초안 보기</span></summary><pre class="cs-mail-body">${esc(i.draft)}</pre></details>`;
    return `
<li class="cs-thread-item">
  <div class="cs-mail cs-mail-in"><div class="cs-mail-head"><b>받은 메일</b> · ${fmt(i.receivedAt)}
    <span class="cs-type cs-type-${i.type}">${i.type} ${esc(t ? t.name : '')}</span><span class="cs-chip">${esc(statusText(i.status))}</span>
    ${i.dummy ? '<span class="cs-chip cs-chip-dim">예시</span>' : i.source === 'gmail' ? '<span class="cs-chip cs-chip-dim">Gmail</span>' : ''}
    <button type="button" class="cs-btn cs-btn-sm" data-act="thread-open" data-id="${esc(i.id)}">이 문의 열기</button></div>
    <p class="cs-mail-subject">${esc(i.subject)}</p><pre class="cs-mail-body">${esc(i.body)}</pre>
    ${trBlock(`${i.subject}
${i.body}`, '받은 메일 한국어로 보기')}</div>
  ${reply}
</li>`;
  }

  /* 보내기 — CS 검토까지 승인된 답장만 모아 받는 사람을 확인하고 Gmail로 바로 보냄 (2026-10-24 담당 결정)
     보내기 전에 한 번 더: 승인 상태 · 지금 초안의 재검사(BLOCK이면 막음) · [확인 필요] 없음. 서버도 같은 조건으로 거절 */

  function sendCheck(inq) {
    const r = recheck(inq.draft, inq.product);
    if (inq.status !== '승인' || !inq.approval) return { ok: false, why: 'CS 검토 승인 전이에요.' };
    if (!r) return { ok: false, why: '다시 심의할 수 없어요 (새로고침해 주세요).' };
    if (r.verdict === 'BLOCK') return { ok: false, why: '다시 심의 결과가 사용 불가예요. 문의함에서 초안을 고치세요.' };
    if (pendingTodos(inq.draft).length) return { ok: false, why: '[확인 필요] 빈칸이 남아 있어요.' };
    return { ok: true, r };
  }

  /** 보내기 줄 버튼 (문의 상세 · 보낼 준비): 다시 확인 → Gmail 보내기 / 초안 / 시연 표시 */
  async function outboxAct(ui, btn, redraw) {
    const id = btn.closest('[data-id]') && btn.closest('[data-id]').dataset.id;
    const inq = id && load().find(x => x.id === id);
    if (!inq) return;
    const act = btn.dataset.act;
    const c = sendCheck(inq);
    if (!c.ok) { toast(c.why); return redraw(); }
    if (act === 'mark-sent') {
      patch(id, x => { x.status = '발송 완료'; x.sentAt = Date.now(); x.sentMode = 'demo'; x.sentBody = x.draft; logTo(x, '보낸 것으로 표시 (시연)'); });
      toast('보낸 것으로 표시했어요 (예시 · 실제로 보내지 않음).');
      return redraw();
    }
    btn.disabled = true;
    try {
      if (act === 'draft-only') {
        const res = await api('/api/cs/gmail/draft', { message_id: inq.gmailId, body: inq.draft });
        patch(id, x => { x.gmailDraftAt = Date.now(); x.gmailDraftId = res.draft_id; logTo(x, 'Gmail 답장 초안 만듦'); });
        toast('Gmail 임시보관함에 답장 초안을 만들었어요.');
        return redraw();
      }
      if (act === 'send') {
        const pv = await api('/api/cs/gmail/preview', { message_id: inq.gmailId });
        if (!global.confirm(`이 답장을 바로 보내요. 보낸 메일은 되돌릴 수 없어요.\n\n받는 사람: ${pv.to}\n제목: ${pv.subject}\n승인: ${inq.approval.by} · 다시 심의 ${LABEL[c.r.verdict] || c.r.verdict}\n\n보낼까요?`)) { btn.disabled = false; return; }
        const res = await api('/api/cs/gmail/send', { message_id: inq.gmailId, body: inq.draft, product: inq.product || '' });
        patch(id, x => { x.status = '발송 완료'; x.sentAt = Date.now(); x.sentId = res.sent_id; x.sentTo = res.to; x.sentMode = 'gmail'; x.sentBody = inq.draft; logTo(x, `Gmail로 보냄 → ${res.to}`); });
        toast(`보냈어요 → ${res.to}`);
        return redraw();
      }
    } catch (err) {
      toast(`${act === 'send' ? '보내지' : '초안을 만들지'} 못했어요: ${err.message}`);
      btn.disabled = false;
    }
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

  // 심각 = 증상이 심함(결과·입원) 또는 식품 자체에 위해 가능성 (둘을 따로 봄 · GPT 검토 ⑤)
  function isSerious(f) {
    return DATA.adverse.seriousOutcomes.includes(f.outcome) || f.care === '입원' || hazardOf(f) !== '';
  }
  function hazardOf(f) {
    const h = String(f.hazard || '');
    return h && !(DATA.adverse.noHazard || []).includes(h) ? h : '';
  }

  // 진료 여부·결과는 심각 판정(FDA 보고 판단)을 바꾸므로 기본값 없이 직접 고르게 함 (2026-10-26)
  const ADV_PICK = ['care', 'outcome'];
  const CARE_RE = /\b(ER|E\.R\.|emergency( room)?|hospital\w*|urgent care|ambulance|911|admitted|clinic|doctor|physician|paramedics?)\b|응급실|병원|입원|119/i;

  function renderAdverse(ui, p) {
    const pre = ui.adverseDraft || {};
    const req = k => (DATA.adverse.required.includes(k) || ADV_PICK.includes(k) ? ' <b class="cs-req">*</b>' : '');
    const product = pre.product || '';
    const careHit = (`${pre.source || pre.symptoms || ''}`.match(CARE_RE) || [])[0];
    const pick = (name, opts) => `<select class="cs-input" name="${name}"><option value="">선택하세요</option>${opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
    const prodOpts = PRODUCTS.map(x => `REBOOT ${x.ko}`);
    p.innerHTML = `
<div class="cs-adverse">
  <form class="cs-card" data-el="form" novalidate>
    <h3 class="cs-subject">부작용 신고 접수</h3>
    <p class="cs-muted">시연·테스트에서는 실제 고객 이름·주소·연락처를 입력하지 않아요.</p>
    ${pre.linkedInquiry ? `<p class="cs-muted">연결된 문의: <button type="button" class="cs-linkbtn" data-act="adv-inq">${esc(pre.linkedInquiry)} 열기 →</button> · 저장하면 이 문의로 돌아가요</p>` : ''}
    ${careHit ? `<p class="cs-note cs-note-block">문의에 진료 언급이 있어요: <b>"${esc(careHit)}"</b> → 진료 여부·결과를 문의 내용대로 고르세요.</p>` : ''}
    <div class="cs-grid2">
      <label class="cs-field"><span>고객${req('customer')}</span><input class="cs-input" name="customer" value="${esc(pre.customer || '')}"></label>
      <label class="cs-field"><span>연락 방법${req('contact')}</span><input class="cs-input" name="contact" value="${esc(pre.contact || '')}"></label>
      <label class="cs-field"><span>제품${req('product')}</span><select class="cs-input" name="product"><option value="">선택하세요</option>${prodOpts.concat(product && !prodOpts.includes(product) ? [product] : []).map(o => `<option${o === product ? ' selected' : ''}>${esc(o)}</option>`).join('')}<option>제품 모름</option></select></label>
      <label class="cs-field"><span>로트 번호${req('lot')}</span><input class="cs-input" name="lot"></label>
      <label class="cs-field"><span>섭취일</span><input class="cs-input" type="date" name="intakeDate"></label>
      <label class="cs-field"><span>진료 여부${req('care')}</span>${pick('care', DATA.adverse.careOptions)}</label>
      <label class="cs-field"><span>결과${req('outcome')}</span>${pick('outcome', DATA.adverse.outcomeOptions)}</label>
      <label class="cs-field"><span>식품 자체 위해 가능성</span><select class="cs-input" name="hazard">${(DATA.adverse.hazardOptions || []).map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
    </div>
    <p class="cs-muted">증상이 가벼워도 표시 안 된 알레르기 성분·이물·오염·같은 로트 반복이면 '심각'으로 올려 규제 담당이 보고 대상 여부를 판단해요 (FDA 보고 대상은 실제 피해가 없어도 위해 가능성으로 판단될 수 있음).</p>
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
      ['customer', 'contact', 'product', 'lot', 'intakeDate', 'care', 'outcome', 'hazard', 'symptoms'].forEach(k => { fields[k] = String(fd.get(k) || '').trim(); });
      const unpicked = ADV_PICK.filter(k => !fields[k]);
      if (unpicked.length) {
        p.querySelector('[data-el="msg"]').innerHTML = `<p class="cs-warn">${unpicked.map(k => ({ care: '진료 여부', outcome: '결과' })[k]).join('·')}를 골라야 저장돼요 (심각 여부 판단에 쓰임).</p>`;
        form.querySelector(`[name="${unpicked[0]}"]`).focus();
        return;
      }
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
      paintCounts(ui);
      // 문의에서 열었으면 그 문의로 돌아감 (상세 위쪽에 '부작용 접수 완료'가 보임)
      if (record.linkedInquiry && load().some(x => x.id === record.linkedInquiry)) {
        toast(`부작용 접수를 저장했어요${missing.length ? ` · 빠진 필수 항목: ${missing.map(k => FIELD_LABEL[k]).join(', ')}` : record.serious ? ' · 심각 사례 → 부작용 접수에서 처리 순서를 진행하세요' : ''}.`);
        ui.sub = 'work';
        ui.showTab('inbox');
        openInquiry(ui, record.linkedInquiry);
        return;
      }
      renderAdverse(ui, p);
      p.querySelector('[data-el="msg"]').innerHTML = missing.length
        ? `<p class="cs-warn">저장했어요. 빠진 필수 항목: ${missing.map(k => FIELD_LABEL[k]).join(', ')}</p>`
        : `<p class="cs-ok">저장했어요${record.serious ? ' · 심각 사례로 판정 → 아래 처리 순서를 진행하세요' : ''}.</p>`;
    });

    const back = p.querySelector('[data-act="adv-inq"]');
    if (back) back.addEventListener('click', () => { ui.sub = 'work'; ui.showTab('inbox'); openInquiry(ui, pre.linkedInquiry); });

    renderRecords(p);
    p.querySelector('[data-el="records"]').onclick = e => {
      const btn = e.target.closest('[data-act]');
      if (!btn || btn.dataset.act.startsWith('share-') || btn.dataset.act === 'translate') return;   // 전달·번역은 render에서 처리
      const card = btn.closest('[data-id]');
      const list = loadAdverse();
      const rec = list.find(x => x.id === card.dataset.id);
      if (!rec) return;
      if (btn.dataset.act === 'review-now') rec.stages.reviewAt = Date.now();
      if (btn.dataset.act === 'escalate') { rec.serious = true; rec.escalatedAt = Date.now(); }   // 일반 → 규제 담당 검토 (같은 로트 반복 등)
      if (btn.dataset.act === 'judge') {
        const by = card.querySelector('[data-el="judgedBy"]').value.trim();
        const val = card.querySelector('[data-el="reportable"]').value;
        if (!by || !val) { card.querySelector('[data-el="judgeMsg"]').textContent = '판단자와 판단 결과를 모두 입력해 주세요.'; return; }
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
          card.querySelector('[data-el="timeMsg"]').textContent = '올바른 일시를 입력해 주세요 (미래 시각은 넣을 수 없음).';
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
      // 처리할 단계가 남은 '심각' 건만 기본으로 펼침 (나머지는 제목 줄 요약만)
      const pending = rec.serious && (!s.reviewAt || !s.judgedAt || (s.reportable && !s.reportedAt));
      const isOpen = REC_OPEN.has(rec.id) ? REC_OPEN.get(rec.id) : pending;
      return `
<details class="cs-sec cs-record" data-id="${esc(rec.id)}"${isOpen ? ' open' : ''}>
  <summary>${rec.serious ? '<span class="cs-badge cs-v-BLOCK">심각</span>' : '<span class="cs-badge cs-v-PASS">일반</span>'}
    <span class="cs-sec-title">${esc(f.product || '제품 미입력')}</span>
    <span class="cs-sec-sum"><span class="cs-chip cs-chip-dim">로트 ${esc(f.lot || '—')} · 접수 ${fmt(rec.createdAt)}</span>
      ${pending ? '<span class="cs-chip cs-chip-warn">처리할 단계 남음</span>' : ''}${rec.missing.length ? `<span class="cs-chip cs-chip-warn">빠진 항목 ${rec.missing.length}</span>` : ''}${repeated ? '<span class="cs-chip cs-chip-warn">같은 로트 반복</span>' : ''}</span></summary>
  <div class="cs-sec-body">
  <p class="cs-muted">진료 ${esc(f.care)} · 결과 ${esc(f.outcome)} · 섭취일 ${esc(f.intakeDate || '—')}</p>
  <p>${esc(f.symptoms || '증상 미입력')}</p>
  ${rec.missing.length ? `<p class="cs-warn">빠진 필수 항목: ${rec.missing.map(k => FIELD_LABEL[k]).join(', ')}</p>` : ''}
  ${repeated ? '<p class="cs-warn">같은 로트 신고가 반복됐어요 → 품질 이슈로 올리세요.</p>' : ''}
  ${hazardOf(f) ? `<p class="cs-warn">식품 자체 위해 가능성: <b>${esc(hazardOf(f))}</b> → 증상과 별개로 보고 대상 여부를 판단해요.</p>` : ''}
  ${!rec.serious ? `<p class="cs-muted">증상이 가벼워도 표시 안 된 알레르기 성분·이물·오염 의심이거나 같은 로트 신고가 반복되면 규제 담당이 봐야 해요.
    <button type="button" class="cs-btn cs-btn-sm" data-act="escalate">규제 담당 검토로 올리기</button></p>` : ''}
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
  ${stageOrderOk(rec) ? '' : '<p class="cs-warn">단계 일시 순서가 맞지 않아요 (접수 → 긴급 검토 → 판단 → 보고). 직접 수정한 일시를 확인하세요.</p>'}
  ${(rec.edits || []).length ? `<p class="cs-muted">일시 직접 수정 ${rec.edits.length}회 · 마지막 ${fmt(rec.edits[rec.edits.length - 1].at)} (${esc(STAGE_LABEL[rec.edits[rec.edits.length - 1].stage] || '')})</p>` : ''}
  <span class="cs-warn-text" data-el="timeMsg" aria-live="polite"></span>
  <p class="cs-muted">24시간은 문의 접수가 아니라 보고 대상으로 판단한 시점부터 계산해요. {확인 필요: RFR 보고 책임 주체(제조사·수입사)와 판단 권한자는 규제 담당과 확정}</p>` :
  '<p class="cs-muted">기록 보관. 같은 로트 신고가 반복되면 품질 이슈로 올려요.</p>'}
  <details class="cs-share-wrap"><summary>${icon('mail')} 담당자에게 전달 (접수 내용 공유)</summary>${shareBoxHTML(`adv:${rec.id}`, 'adverse', '품질·규제 담당')}</details>
  </div>
</details>`;
    }).join('') : '<p class="cs-muted">아직 접수 기록이 없어요.</p>');
    p.querySelectorAll('details.cs-record').forEach(d => d.addEventListener('toggle', () => REC_OPEN.set(d.dataset.id, d.open)));
    p.querySelectorAll('.cs-share').forEach(fillShare);
  }

  /* 답변 템플릿 */

  // 자주 나오는 불만 — 인사이트 파트 REBOOT.use('insights').reviewPriorities() (자사 리뷰 규칙 계산 · 읽기만).
  // 리뷰 원문은 오지 않음. 이 불만이 문의로 들어올 때를 대비해 템플릿을 미리 손볼 때 참고
  let VOC;   // undefined: 아직 안 읽음 · null: 못 읽음 · {items, basis, …}
  function vocSumHTML() {
    if (VOC === undefined) return '<span class="cs-chip cs-chip-dim">불러오는 중</span>';
    if (!VOC || !VOC.items.length) return '<span class="cs-chip cs-chip-dim">없음</span>';
    return `<span class="cs-chip">1위 ${esc(VOC.items[0].topic)} ${esc(VOC.items[0].count)}건</span>`;
  }
  function vocHTML() {
    if (VOC === undefined) return '<p class="cs-muted">불러오는 중…</p>';
    if (!VOC) return '<p class="cs-muted">인사이트 탭의 리뷰 데이터를 불러오지 못했어요.</p>';
    if (!VOC.items.length) return '<p class="cs-muted">아직 알디콤 불만 리뷰가 없어요.</p>';
    const li = VOC.items.slice(0, 3).map((x, i) => `<li><b>${i + 1}. ${esc(x.topic)}</b> · ${esc(x.count)}건
      ${x.check ? '<span class="cs-chip cs-chip-warn">C1 부작용 신고 템플릿 확인</span>' : ''}
      <span class="cs-chip cs-chip-dim">${esc(x.channels.join(' · '))}</span></li>`).join('');
    return `<ol class="cs-voc-list">${li}</ol>
      <p class="cs-muted">${esc(VOC.basis)}. 리뷰 불만은 C8(리뷰·평점 불만) 템플릿에서 먼저 대비하세요. 원문은 <a href="/dashboard/insights#customers/reviews">인사이트 › 구매자 리뷰</a>에서 볼 수 있어요.</p>`;
  }
  async function loadVoc(p) {
    if (VOC !== undefined) return;
    let v = null;
    try { v = await REBOOT.use('insights').reviewPriorities(); } catch (e) { v = null; }
    VOC = v && Array.isArray(v.items) ? v : null;
    const box = p.querySelector('[data-ref="cs-voc"]');
    const sum = p.querySelector('[data-ref="cs-voc-sum"]');
    if (box) box.innerHTML = vocHTML();
    if (sum) sum.innerHTML = vocSumHTML();
  }

  function renderTemplates(p) {
    const sample = { name: 'Alex Morgan', orderNo: 'RB-240000', tracking: '', eta: '' };
    const rows = DATA.types.map(t => {
      const raw = recheck(t.template);
      const filled = fill(t.template, sample);
      return { t, raw, todos: pendingTodos(filled) };
    });
    const blocked = rows.filter(x => x.raw && x.raw.verdict === 'BLOCK').length;
    const unchecked = rows.filter(x => !x.raw).length;

    // 설정 다섯 가지를 밑줄 탭으로 하나씩 (고른 탭은 다시 그려도 유지 · 처음엔 기본값이 비었으면 기본값, 아니면 템플릿)
    const dv = replyDefaults();
    const dmeta = store.get(KEY.defaults, null) || {};
    const dFields = DATA.replyDefaults || [];
    const dFilled = dFields.filter(f => String(dv[f.key] || '').trim()).length;
    const P = persona();
    const pmeta = store.get(KEY.persona, null) || {};
    if (!SET_TAB) SET_TAB = dFilled < dFields.length ? 'defaults' : 'templates';
    if (!rows.some(x => x.t.code === TPL_CODE)) TPL_CODE = rows.length ? rows[0].t.code : null;
    const setTabs = [
      ['defaults', '답장 기본값', `${dFilled}/${dFields.length}`],
      ['persona', '페르소나', ''],
      ['templates', '답변 템플릿', String(rows.length)],
      ['contacts', '담당자 연락처', String(CONTACTS.length)],
      ['voc', '자주 나오는 불만', '']
    ];
    p.innerHTML = `<div class="cs-backbar"><button type="button" class="cs-btn cs-btn-sm" data-act="tpl-back">← 문의함</button><b>답장 설정</b></div>
<div class="linetabs cs-settabs" role="tablist" data-subnav="off" aria-label="답장 설정">${setTabs.map(([id, l, n]) =>
  `<button type="button" role="tab" data-settab="${id}" aria-selected="${id === SET_TAB}">${l}${n ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</div>` + contactsHTML() + `
<section class="cs-setpane cs-defaults" data-setpane="defaults">
    ${dmeta.at ? `<p class="cs-muted">마지막 저장 ${esc(dmeta.by || '')} · ${fmt(dmeta.at)}</p>` : ''}
    <p class="cs-muted">여기 값이 모든 답장 템플릿의 같은 빈칸을 채워요 (팀 공용 · 고객에게 가는 <b>영어</b>로). <b>팀이 정한 값만</b> 넣고, 정하지 않은 값은 비워 두면 그 답장은 [확인 필요]로 남아 승인이 막혀요.
      저장하면 아직 손대지 않은 초안(직접 고치지 않은 · 승인 전)은 새 값으로 다시 만들어져요.</p>
    <div class="cs-defaults-grid">${dFields.map(f => `
      <label class="cs-field${f.long ? ' cs-wide' : ''}"><span>${esc(f.label)} <span class="cs-muted">· ${esc(f.where)}</span></span>
        ${f.long ? `<textarea class="cs-input" rows="2" data-def="${esc(f.key)}" placeholder="${esc(f.placeholder)}">${esc(dv[f.key] || '')}</textarea>`
          : `<input class="cs-input" data-def="${esc(f.key)}" value="${esc(dv[f.key] || '')}" placeholder="${esc(f.placeholder)}">`}</label>`).join('')}</div>
    <div class="cs-actions"><button type="button" class="cs-btn cs-primary" data-act="defaults-save">저장하고 초안에 반영</button></div>
</section>
<section class="cs-setpane cs-persona-body" data-setpane="persona">
    <p class="cs-persona-head"><span class="cs-avatar cs-persona-avatar cs-persona-mini" aria-hidden="true">${initials(P.name || 'AI')}</span>
      <b>${esc(P.name || '없음')}</b> <span class="cs-muted">${esc(P.title || '')} · ${pmeta.at ? `${esc(pmeta.by || '')} · ${fmt(pmeta.at)}` : '기본값'}</span></p>
    <div class="cs-defaults-grid">
      <label class="cs-field"><span>이름</span><input class="cs-input" data-p="name" maxlength="40" value="${esc(P.name || '')}" placeholder="예: Hana"></label>
      <label class="cs-field"><span>직함</span><input class="cs-input" data-p="title" maxlength="80" value="${esc(P.title || '')}" placeholder="예: REBOOT 고객경험 매니저"></label>
      <label class="cs-field cs-wide"><span>설명 <span class="cs-muted" data-el="p-count">${String(P.text || '').length}자 / ${PERSONA_MAX}자</span></span>
        <textarea class="cs-input" rows="6" data-p="text" maxlength="${PERSONA_MAX}" placeholder="말투 · 경력 · 지켜야 할 태도를 한국어로">${esc(P.text || '')}</textarea></label>
    </div>
    <p class="cs-muted">문의함 → 답장 초안의 <b>[AI로 초안 다듬기]</b>가 이 인물로 써요 (팀 공용). 효능 주장 금지·[확인 필요] 유지 같은 안전 규칙은 서버에서 따로 지키고, 결과는 문구 검토와 CS 검토를 다시 거쳐요.</p>
    <div class="cs-actions"><button type="button" class="cs-btn cs-primary" data-act="persona-save">저장</button>
      ${pmeta.at ? '<button type="button" class="cs-btn" data-act="persona-reset">기본값으로 되돌리기</button>' : ''}</div>
</section>
<section class="cs-setpane" data-setpane="voc">
  <p class="cs-voc-sum" data-ref="cs-voc-sum">${vocSumHTML()}</p>
  <div data-ref="cs-voc">${vocHTML()}</div>
</section>
<section class="cs-setpane" data-setpane="templates">
  <p class="cs-summary"><span class="cs-muted">템플릿 ${rows.length}개</span>
    ${blocked ? `<span class="badge red">사용 불가 ${blocked}</span>` : ''}
    ${unchecked ? `<span class="badge orange" title="컴플라이언스 탭이 없어 심의하지 못했어요">심의 못 함 ${unchecked}</span>` : ''}</p>
  <p class="cs-muted">템플릿이 사용 불가면 그 유형의 발송이 전부 막혀요. [확인 필요]는 현재 설정 값으로 채웠을 때 남는 빈칸 수예요 (고객 이름·주문번호는 예시값으로 채움).</p>
  <div class="linetabs cs-tpltabs" role="tablist" data-subnav="off" aria-label="문의 유형">${rows.map(x =>
    `<button type="button" role="tab" data-tplcode="${esc(x.t.code)}" aria-selected="${x.t.code === TPL_CODE}" title="${esc(x.t.name)}">${esc(x.t.code)} ${esc(x.t.name)}${x.raw && x.raw.verdict === 'BLOCK' ? ' <span class="cs-tpl-dot" aria-label="사용 불가">●</span>' : ''}</button>`).join('')}</div>
  ${rows.map(x => `
  <div class="cs-tplpane" data-tplpane="${esc(x.t.code)}"${x.t.code === TPL_CODE ? '' : ' hidden'}>
    <p class="cs-summary">${x.raw ? badge(x.raw.verdict) : '<span class="cs-badge">심의 불가</span>'}
      <span class="cs-chip ${x.todos.length ? 'cs-chip-warn' : ''}">[확인 필요] ${x.todos.length}곳</span>
      <span class="cs-chip cs-chip-dim">${esc(x.t.mode)} · 기한 ${x.t.dueHours}시간</span></p>
    ${x.raw && x.raw.findings.length ? `<p class="cs-muted">${x.raw.findings.map(f => `${f.code} ${f.terms.map(esc).join(', ')}`).join(' · ')}</p>` : ''}
    <pre class="cs-pre">${esc(x.t.template)}</pre>
    ${trBlock(x.t.template, '템플릿 한국어로 보기')}
  </div>`).join('')}
</section>`;
    const showSet = () => {
      p.querySelectorAll('[data-settab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.settab === SET_TAB)));
      p.querySelectorAll('[data-setpane]').forEach(s => { s.hidden = s.dataset.setpane !== SET_TAB; });
    };
    showSet();
    p.querySelector('.cs-settabs').addEventListener('click', e => {
      const b = e.target.closest('[data-settab]');
      if (b) { SET_TAB = b.dataset.settab; showSet(); }
    });
    p.querySelector('.cs-tpltabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tplcode]');
      if (!b) return;
      TPL_CODE = b.dataset.tplcode;
      p.querySelectorAll('[data-tplcode]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tplcode === TPL_CODE)));
      p.querySelectorAll('[data-tplpane]').forEach(x => { x.hidden = x.dataset.tplpane !== TPL_CODE; });
    });
    loadVoc(p);
    const cbox = p.querySelector('[data-el="contacts"]');
    p.querySelector('[data-act="contact-add"]').addEventListener('click', () => cbox.insertAdjacentHTML('beforeend', contactRowHTML({})));
    cbox.addEventListener('click', e => { const b = e.target.closest('[data-act="contact-del"]'); if (b) b.closest('.cs-contact').remove(); });
    p.querySelector('[data-act="contacts-save"]').addEventListener('click', async () => {
      const items = [...cbox.querySelectorAll('.cs-contact')].map(r => ({
        role: r.querySelector('[data-c="role"]').value.trim(), name: r.querySelector('[data-c="name"]').value.trim(), email: r.querySelector('[data-c="email"]').value.trim()
      })).filter(c => c.role || c.name || c.email);
      try {
        const out = await apiPut('/api/cs/contacts', { items });
        CONTACTS = out.items || [];
        contactsP = Promise.resolve(CONTACTS);
        SET_TAB = 'contacts';
        renderTemplates(p);
        toast(`담당자 ${CONTACTS.length}명을 저장했어요.`);
      } catch (e) { toast(`저장하지 못했어요: ${e.message}`); }
    });
    p.querySelector('[data-act="defaults-save"]').addEventListener('click', () => {
      const values = {};
      p.querySelectorAll('[data-def]').forEach(el => { const v = el.value.trim(); if (v) values[el.dataset.def] = v.slice(0, 600); });
      store.set(KEY.defaults, { values, by: (REBOOT.user && REBOOT.user().name) || '', at: Date.now() });
      // 손대지 않은 초안(직접 고치지 않음 · 승인·발송 전)만 새 값으로 다시 만듦
      let n = 0;
      load().filter(i => !i.edited && !['승인', '발송 완료', '종결'].includes(i.status)).forEach(i => {
        const next = draftFor(i);
        if (next !== i.draft) { patch(i.id, x => { x.draft = next; logTo(x, '답장 기본값으로 초안 다시 만듦'); }); n++; }
      });
      SET_TAB = 'defaults';
      renderTemplates(p);
      toast(`답장 기본값을 저장했어요${n ? ` · 초안 ${n}건을 새 값으로 다시 만들었어요` : ''}.`);
    });
    const ptext = p.querySelector('[data-p="text"]');
    ptext.addEventListener('input', () => { p.querySelector('[data-el="p-count"]').textContent = `${ptext.value.length}자 / ${PERSONA_MAX}자`; });
    p.querySelector('[data-act="persona-save"]').addEventListener('click', () => {
      const val = k => p.querySelector(`[data-p="${k}"]`).value.trim();
      const text = val('text').slice(0, PERSONA_MAX);
      if (!text) { toast('설명을 입력해 주세요. 비워 두려면 [기본값으로 되돌리기]를 누르세요.'); return; }
      store.set(KEY.persona, { name: val('name').slice(0, 40), title: val('title').slice(0, 80), text, by: (REBOOT.user && REBOOT.user().name) || '', at: Date.now() });
      SET_TAB = 'persona';
      renderTemplates(p);
      toast('답장 페르소나를 저장했어요. 다음 [AI로 초안 다듬기]부터 적용돼요.');
    });
    const preset = p.querySelector('[data-act="persona-reset"]');
    if (preset) preset.addEventListener('click', () => {
      if (!global.confirm(`팀이 고친 페르소나를 지우고 기본값(${PERSONA_DEFAULT.name || '기본'})으로 되돌릴까요?`)) return;
      store.remove(KEY.persona);
      SET_TAB = 'persona';
      renderTemplates(p);
      toast('기본 페르소나로 되돌렸어요.');
    });
  }

  /* ───────── 공개 기능 · 등록 ───────── */

  function stats(pred) {
    const now = Date.now();
    const open = load().filter(pred || isOpen);
    return {
      open: open.length,
      urgent: open.filter(i => i.type === 'C1').length,
      overdue: open.filter(i => now > due(i)).length,
      owner_required: open.filter(i => TYPES[i.type].ownerRequired && !i.ownerChecked).length
    };
  }

  REBOOT.register({
    id: 'cs', icon: '💬', label: '고객 응대', priority: 'P1', order: 65,
    title: '빠르게 답하고, 안전하게 보내기.',
    subtitle: '문의를 분류하고, 문구 검토와 CS 검토를 거친 답장만 보내요.',
    render,
    summary: () => ({ label: '미처리 문의', value: stats().open })
  });
  REBOOT.expose('cs', { stats, classify });
})(typeof window !== 'undefined' ? window : globalThis);
