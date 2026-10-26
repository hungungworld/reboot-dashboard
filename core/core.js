/* REBOOT core (공통 담당) — 팀 README 6장 형식을 그대로 따릅니다.
     REBOOT.register({ id, render(el), title?, subtitle?, summary? })   메뉴 등록
     REBOOT.expose('<파트ID>', { 함수… }) · REBOOT.use('<파트ID>')        파트끼리 기능 빌려 쓰기
     REBOOT.store('<파트ID>').get/set/remove                              저장 (reboot:<파트ID>:<키>)
     REBOOT.ui.toast · card · badge · kpi · modal · confirm · download · markdown · fmt …
     REBOOT.api(path, body?) · REBOOT.log(action, opts) · REBOOT.user() · REBOOT.page.*

   Flask 버전에서 달라진 점 (파트 코드는 그대로 둠)
   - store: 브라우저(localStorage)가 아니라 서버 DB에 저장 → 팀원 모두 같은 값을 봄
     읽기는 페이지를 열 때 받아 둔 값으로 바로(동기), 쓰기는 0.3초 모아서 서버로 보냄
   - 같은 주소로 보내는 쓰기 요청(POST·PUT·PATCH·DELETE)에는 CSRF 토큰을 자동으로 붙임 (fetch 감싸기)
   - 로그인이 풀리면(401) 알림 후 로그인 화면으로 이동 */
(function (global) {
  'use strict';

  const doc = global.document;
  const bootEl = doc && doc.getElementById('reboot-boot');
  let BOOT = {};
  try { BOOT = bootEl ? JSON.parse(bootEl.textContent || '{}') : {}; } catch (e) { BOOT = {}; }
  const meta = doc && doc.querySelector('meta[name="csrf-token"]');
  const CSRF = BOOT.csrf || (meta ? meta.getAttribute('content') : '') || '';
  const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
  let current = BOOT.part || '';

  /* ───────── fetch: CSRF 토큰 · 로그인 만료 ───────── */
  let expiredShown = false;
  function sessionExpired() {
    if (expiredShown) return;
    expiredShown = true;
    ui.toast('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'error');
    setTimeout(() => {
      global.location.href = '/login?next=' + encodeURIComponent(global.location.pathname + global.location.search);
    }, 1400);
  }
  const nativeFetch = global.fetch ? global.fetch.bind(global) : null;
  if (nativeFetch) {
    global.fetch = function (input, init) {
      let same = false;
      try {
        const raw = typeof input === 'string' ? input : (input && input.url) || String(input);
        const url = new URL(raw, global.location.href);
        same = url.origin === global.location.origin;
        const method = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
        if (same && !SAFE.has(method) && CSRF) {
          init = Object.assign({}, init || {});
          const headers = new Headers(init.headers || (input && typeof input === 'object' && input.headers) || undefined);
          if (!headers.has('X-CSRFToken')) headers.set('X-CSRFToken', CSRF);
          init.headers = headers;
        }
      } catch (e) { /* 주소를 해석하지 못하면 그대로 보냄 */ }
      return nativeFetch(input, init).then(res => {
        if (same && res.status === 401) sessionExpired();
        return res;
      });
    };
  }

  /* ───────── 메뉴 등록 · 파트 간 연결 ───────── */
  let parts = [];
  const apis = {};
  const loadErrors = {};

  function register(def) {
    if (!def || !def.id || typeof def.render !== 'function') {
      throw new Error('REBOOT.register: { id, render(el) }가 필요합니다');
    }
    parts = parts.filter(p => p.id !== def.id);
    parts.push(Object.assign({ order: 100, label: def.id, icon: '', title: '', subtitle: '' }, def));
    parts.sort((a, b) => a.order - b.order);
  }

  function expose(id, api) {
    apis[id] = Object.assign(apis[id] || {}, api);
  }

  function use(id) {
    if (!apis[id]) throw new Error(`REBOOT.use: "${id}" 파트가 공개한 기능이 없습니다`);
    return apis[id];
  }

  /* 공용 기준 데이터 (서버가 페이지에 실어 줌) — 원본 API: /api/seasons · /api/facts
     파트가 같은 이름으로 다시 expose하면 그 함수가 우선합니다 (팀 README 5장의 소유 파트: 시즌=홈, 팩트시트=설정). */
  const FACTS = BOOT.facts || { brand: {}, products: [], flat: { brand: 'REBOOT', product: null, flavor: null, ingredients: null, allergens: null } };
  const SEASONS = Array.isArray(BOOT.seasons) ? BOOT.seasons : [];
  const data = {
    facts: () => clone(FACTS.flat),
    brand: () => clone(FACTS.brand),
    products: () => clone(FACTS.products),
    factsVersion: () => FACTS.version || '',
    seasons: () => clone(SEASONS)
  };
  expose('settings', { facts: data.facts, brand: data.brand, products: data.products });
  expose('home', { seasons: data.seasons });

  /* ───────── 저장소 (서버 · 팀 공용) ───────── */
  const SNAP = BOOT.store && typeof BOOT.store === 'object' ? BOOT.store : {};
  const pending = new Map();
  let flushTimer = null;
  let failCount = 0;
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function queueWrite(part, key, value, del) {
    pending.set(part + '\u0000' + key, { part, key, value, del });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 300);
  }

  async function flush(opts) {
    clearTimeout(flushTimer);
    const items = Array.from(pending.values());
    pending.clear();
    for (const it of items) {
      const url = `/api/store/${encodeURIComponent(it.part)}/${encodeURIComponent(it.key)}`;
      const body = it.del ? undefined : JSON.stringify(it.value);
      const init = { method: it.del ? 'DELETE' : 'PUT', headers: { 'Content-Type': 'application/json' }, body };
      if (opts && opts.keepalive && (!body || body.length < 60000)) init.keepalive = true;
      try {
        const res = await fetch(url, init);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `저장 실패 (${res.status})`);
        }
        failCount = 0;
      } catch (e) {
        const k = it.part + '\u0000' + it.key;
        if (!pending.has(k)) pending.set(k, it);  // 더 새 값이 없으면 다시 시도
        failCount += 1;
        if (failCount === 1 || failCount % 5 === 0) ui.toast('서버에 저장하지 못했습니다. 잠시 뒤 다시 저장합니다.', 'error');
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, Math.min(30000, 2000 * failCount));
        break;
      }
    }
  }

  function store(id) {
    if (!/^[a-z0-9-]+$/.test(String(id))) throw new Error(`REBOOT.store: 파트 ID가 올바르지 않습니다 (${id})`);
    const bucket = SNAP[id] || (SNAP[id] = {});
    const okKey = key => {
      key = String(key);
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(key)) throw new Error(`REBOOT.store: 키 이름이 올바르지 않습니다 (${key})`);
      return key;
    };
    return {
      get(key, fallback) {
        key = okKey(key);
        return Object.prototype.hasOwnProperty.call(bucket, key) ? clone(bucket[key]) : fallback;
      },
      set(key, value) {
        key = okKey(key);
        const v = value === undefined ? null : clone(value);
        bucket[key] = v;
        queueWrite(id, key, v, false);
      },
      remove(key) {
        key = okKey(key);
        delete bucket[key];
        queueWrite(id, key, null, true);
      },
      keys() { return Object.keys(bucket); }
    };
  }
  store.persistent = true;
  store.shared = true;
  store.flush = () => flush();

  if (doc) {
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden' && pending.size) flush({ keepalive: true }); });
    global.addEventListener('pagehide', () => { if (pending.size) flush({ keepalive: true }); });
  }

  /* ───────── 화면 도우미 (ui) ───────── */
  const ICONS = {
    grid: 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
    home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z m-4 9 3 3 5-6',
    chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2 M7 9h10 M7 13h6',
    users: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4',
    chart: 'M3 3v18h18 M7 16v-5 M12 16V6 M17 16V9',
    calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M7 3v4 M17 3v4 M3 11h18',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M10 2h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1z',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M9 21h6',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    up: 'M6 17 17 6 M6 6h11v11',
    plus: 'M12 5v14 M5 12h14',
    image: 'M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M16 7h.01',
    video: 'M3 4h13v16H3z M16 9l5-3v12l-5-3',
    doc: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h5',
    mail: 'M3 5h18v14H3z M3 5l9 8 9-8',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2c-6 5-6 15 0 20 M12 2c6 5 6 15 0 20',
    check: 'm5 12 4 4L19 6',
    download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2',
    filter: 'M4 6h16 M7 12h10 M10 18h4',
    edit: 'm15 3 6 6-12 12H3v-6z M12 6l6 6',
    dollar: 'M12 2v20 M18 6c-6-6-16 2-6 6s0 12-6 6',
    refresh: 'M20 11a8 8 0 0 0-14.6-4.5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.6 4.5L20 16 M20 20v-4h-4',
    trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
    upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10 M3 22a9 9 0 0 1 18 0',
    x: 'M6 6l12 12 M18 6 6 18',
    chevron: 'm6 9 6 6 6-6',
    translate: 'M4 6h9 M8.5 4v2c0 4-2 7-4.5 8.5 M6 9.5c1.3 2.2 3.3 3.8 5.5 4.5 M13 20l4-9 4 9 M14.5 17h5'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function icon(name, cls) {
    return `<svg class="${cls || 'icon'}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.grid}"/></svg>`;
  }

  let toastTimer = null;
  const openModals = [];
  const nf =(d, opts) => new Intl.NumberFormat('ko-KR', Object.assign({ maximumFractionDigits: d, minimumFractionDigits: 0 }, opts || {}));
  const toDate = v => (v instanceof Date ? v : new Date(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v));
  const fmt = {
    num: (n, d) => (n == null || isNaN(n) ? '—' : nf(d == null ? 0 : d).format(n)),
    krw: n => (n == null || isNaN(n) ? '—' : '₩ ' + nf(0).format(Math.round(n))),
    usd: n => (n == null || isNaN(n) ? '—' : '$ ' + nf(2, { minimumFractionDigits: 2 }).format(n)),
    pct: (n, d) => (n == null || isNaN(n) ? '—' : nf(d == null ? 1 : d).format(n) + '%'),
    signed: (n, d, unit) => (n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + nf(d == null ? 1 : d).format(n) + (unit || '')),
    date: v => { if (!v) return '—'; const d = toDate(v); return isNaN(d) ? String(v) : d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }); },
    datetime: v => { if (!v) return '—'; const d = toDate(v); return isNaN(d) ? String(v) : d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); },
    relative: v => {
      const d = toDate(v); if (!v || isNaN(d)) return '—';
      const s = Math.round((Date.now() - d.getTime()) / 1000);
      if (s < 60) return '방금 전'; if (s < 3600) return Math.floor(s / 60) + '분 전';
      if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
      return fmt.date(d);
    },
    dday: v => {
      const t = toDate(BOOT.today || new Date()); const d = toDate(v);
      t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
      const n = Math.round((d - t) / 86400000);
      return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
    }
  };

  const ui = {
    esc,
    icon,
    fmt,
    card(title, html, headExtra) {
      const head = title ? `<div class="card-head"><h2>${esc(title)}</h2>${headExtra || ''}</div>` : '';
      return `<section class="card">${head}${html || ''}</section>`;
    },
    row: (label, valueHtml) => `<div class="row"><span>${esc(label)}</span><span>${valueHtml}</span></div>`,
    badge: (text, tone) => `<span class="badge ${tone || ''}">${esc(text)}</span>`,
    stat: (label, value, sub) => `<div class="kpi"><label>${esc(label)}</label><div class="metric">${esc(value)}</div>${sub ? `<div class="trend">${esc(sub)}</div>` : ''}</div>`,
    kpi(o) {
      o = o || {};
      const tone = o.tone === 'down' ? 'down' : o.tone === 'flat' ? 'flat' : '';
      return `<div class="kpi${o.featured ? ' featured' : ''}"><div class="between"><label>${esc(o.label)}</label>` +
        `<span class="mini-icon">${icon(o.icon || 'up')}</span></div>` +
        `<div class="metric">${esc(o.value)}${o.unit ? `<span>${esc(o.unit)}</span>` : ''}</div>` +
        `<div class="trend">${o.change ? `<b class="${tone}">${esc(o.change)}</b>` : ''}${esc(o.foot || '')}</div></div>`;
    },
    empty: (text, iconName) => `<div class="empty-art">${icon(iconName || 'doc')}<span>${esc(text)}</span></div>`,
    /** 파일 버튼 (모든 탭 같은 이름·모양 · SAP Fiori 툴바 버튼처럼): kind = 'upload' | 'download' | 'report'
        o = { label: '매출 데이터 업로드', type: 'CSV', act, href(있으면 <a download>), download(저장 파일 이름), attrs, cls, title, disabled }
        버튼 하나에 동작 하나 — '… 업로드 · 다운로드'처럼 묶지 않음 (둘 다 필요하면 버튼 둘, 같은 동작의 형식만 다르면 fileMenu)
        형식(type)은 버튼 글자 대신 툴팁으로. lime은 보고서 만들기만 */
    fileBtn(kind, o) {
      o = o || {};
      const K = { upload: ['upload', '업로드'], download: ['download', '다운로드'], report: ['doc', '보고서 만들기'] }[kind] || ['download', '다운로드'];
      const cls = `btn small file-btn${kind === 'report' ? ' lime' : ''}${o.cls ? ' ' + o.cls : ''}`;
      const inner = `${icon(K[0])}${esc(o.label || K[1])}`;
      const title = [o.title, o.type ? `${o.type} 파일` : ''].filter(Boolean).join(' · ');
      const attrs = `${o.act ? ` data-act="${esc(o.act)}"` : ''}${title ? ` title="${esc(title)}"` : ''}${o.attrs ? ' ' + o.attrs : ''}`;
      return o.href
        ? `<a class="${cls}" href="${esc(o.href)}" download${o.download ? `="${esc(o.download)}"` : ''}${attrs}>${inner}</a>`
        : `<button type="button" class="${cls}"${attrs}${o.disabled ? ' disabled' : ''}>${inner}</button>`;
    },
    /** 파일 메뉴 버튼 (SAP Menu Button): 같은 동작을 형식·대상별로 고를 때 — '다운로드 ▾' 하나에 항목 여럿
        o = { label, cls, items: [{ label: 'CSV', act | href, attrs, title }] } · 항목을 누르면 메뉴는 닫힘 */
    fileMenu(kind, o) {
      o = o || {};
      const K = kind === 'upload' ? ['upload', '업로드'] : ['download', '다운로드'];
      const items = (o.items || []).map(it => {
        const attrs = `${it.act ? ` data-act="${esc(it.act)}"` : ''}${it.title ? ` title="${esc(it.title)}"` : ''}${it.attrs ? ' ' + it.attrs : ''}`;
        return it.href
          ? `<a role="menuitem" href="${esc(it.href)}" download${attrs}>${esc(it.label)}</a>`
          : `<button type="button" role="menuitem"${attrs}>${esc(it.label)}</button>`;
      }).join('');
      return `<details class="file-menu${o.cls ? ' ' + o.cls : ''}"><summary class="btn small file-btn">${icon(K[0])}${esc(o.label || K[1])}${icon('chevron', 'icon file-menu-caret')}</summary>` +
        `<div class="file-menu-list" role="menu">${items}</div></details>`;
    },
    /** AI 번역 버튼 (모든 탭 같은 모양: 네모 아이콘 버튼 하나, 글자는 툴팁으로)
        o = { act(기본 'translate' · false면 없음), title(기본 '한국어로 보기'), on(번역이 펼쳐진 채 그림), attrs, cls, disabled } · 번역을 펼치면 ui.trOn(btn, true) → 툴팁 '번역 닫기' */
    trBtn(o) {
      o = o || {};
      const t = o.title || '한국어로 보기', now = o.on ? '번역 닫기' : t;
      return `<button type="button" class="tr-btn${o.cls ? ' ' + o.cls : ''}"${o.act === false ? '' : ` data-act="${esc(o.act || 'translate')}"`} data-tr-title="${esc(t)}" aria-pressed="${!!o.on}" aria-label="${esc(now)}" title="${esc(now)}"` +
        `${o.attrs ? ' ' + o.attrs : ''}${o.disabled ? ' disabled' : ''}>${icon('translate')}</button>`;
    },
    trOn(btn, on) {
      if (!btn) return;
      const t = on ? '번역 닫기' : btn.dataset.trTitle || '한국어로 보기';
      btn.setAttribute('aria-pressed', String(!!on));
      btn.setAttribute('aria-label', t);
      btn.title = t;
    },
    /** 파일 버튼 줄: 카드 머리 오른쪽 · 순서는 업로드 → 다운로드 → 보고서 만들기 */
    fileActions: (html) => `<div class="file-actions">${html}</div>`,
    toast(msg, tone) {
      if (!doc) return;
      let box = doc.getElementById('reboot-toast');
      if (!box) {
        box = doc.createElement('div');
        box.id = 'reboot-toast';
        box.className = 'toast';
        box.setAttribute('role', 'status');
        doc.body.appendChild(box);
      }
      box.textContent = msg;
      box.classList.toggle('error', tone === 'error');
      box.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => box.classList.remove('is-on'), 3200);
    },
    busy(btn, on) {
      if (!btn) return;
      btn.classList.toggle('is-busy', !!on);
      btn.disabled = !!on;
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
    },
    download(filename, content, mime) {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      doc.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    csv(rows) {
      const cell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
    },
    markdown(md) {
      const text = String(md || '');
      if (global.marked && global.DOMPurify) {
        return global.DOMPurify.sanitize(global.marked.parse(text, { gfm: true, breaks: true }));
      }
      return esc(text).replace(/\n/g, '<br>');
    },
    /** 모달: ui.modal({ title, body(html|Element), actions:[{label, value, tone}], wide }) → Promise(누른 버튼의 value | null) */
    modal(o) {
      o = o || {};
      return new Promise(resolve => {
        const prev = doc.activeElement;
        const wrap = doc.createElement('div');
        wrap.className = 'modal-backdrop';
        const actions = (o.actions && o.actions.length ? o.actions : [{ label: '확인', value: true, tone: 'lime' }]);
        wrap.innerHTML = `<section class="modal${o.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
          <div class="between modal-head"><h2>${esc(o.title || '')}</h2><button type="button" class="modal-close" data-modal-close aria-label="닫기">${icon('x')}</button></div>
          <div class="modal-body"></div>
          <div class="modal-actions">${actions.map((a, i) => `<button type="button" class="btn ${esc(a.tone || '')}" data-modal-act="${i}">${esc(a.label)}</button>`).join('')}</div>
        </section>`;
        const bodyEl = wrap.querySelector('.modal-body');
        if (o.body instanceof global.Element) bodyEl.appendChild(o.body); else bodyEl.innerHTML = o.body || '';
        let closed = false;
        const close = value => {
          if (closed) return;
          closed = true;
          const i = openModals.indexOf(close);
          if (i >= 0) openModals.splice(i, 1);
          doc.removeEventListener('keydown', onKey);
          wrap.remove();
          if (prev && prev.focus) prev.focus();
          resolve(value);
        };
        openModals.push(close);
        const onKey = e => {
          if (e.key === 'Escape') close(null);
          if (e.key === 'Tab') {
            const f = Array.from(wrap.querySelectorAll('button,input,select,textarea,a[href]')).filter(x => !x.disabled && x.offsetParent !== null);
            if (!f.length) return;
            if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
          }
        };
        wrap.addEventListener('click', e => {
          if (e.target === wrap || e.target.closest('[data-modal-close]')) return close(null);
          const b = e.target.closest('[data-modal-act]');
          if (!b) return;
          const a = actions[+b.dataset.modalAct];
          if (a.onClick) {
            const r = a.onClick(bodyEl, b);
            if (r === false) return;  // onClick이 false면 닫지 않음 (입력 확인 실패 등)
          }
          close(a.value === undefined ? true : a.value);
        });
        doc.addEventListener('keydown', onKey);
        doc.body.appendChild(wrap);
        if (o.onOpen) o.onOpen(bodyEl);
        const first = wrap.querySelector('input,select,textarea') || wrap.querySelector('[data-modal-act]');
        if (first) first.focus({ preventScroll: true });  // 버튼에 포커스가 가도 창은 맨 위부터 보이게
        wrap.querySelector('.modal').scrollTop = 0;
      });
    },
    /** 코드에서 맨 위 모달 닫기 (ui.modal의 Promise는 value로 끝남) */
    closeModal(value) {
      const close = openModals[openModals.length - 1];
      if (close) close(value === undefined ? null : value);
    },
    confirm(message, o) {
      o = o || {};
      // "삭제할까요? 되돌릴 수 없어요."처럼 질문 뒤에 설명이 붙으면 질문 줄과 설명 줄을 나눔
      const qa = String(message).match(/^([^?]*\?)\s+(\S[\s\S]*)$/);
      return ui.modal({
        title: o.title || '확인',
        body: qa ? `<p><b>${esc(qa[1])}</b></p><p class="muted mt-8">${esc(qa[2])}</p>` : `<p>${esc(message)}</p>`,
        actions: [{ label: o.cancel || '취소', value: false }, { label: o.ok || '확인', value: true, tone: o.danger ? 'danger' : 'lime' }]
      }).then(v => v === true);
    },
    /** 업로드 팝업 (모든 탭 같은 모양): 끌어다 놓거나 눌러서 파일을 고르고 [올리기]
        o = { title, accept, type('CSV' 등 작은 글씨), multiple, help(html, 칸 위), extra(html, 칸 아래), okLabel, wide, onOpen(body) }
        → Promise({ files, body }) · 닫으면 null. body는 닫힌 뒤에도 extra 입력값을 읽을 수 있음 */
    uploadModal(o) {
      o = o || {};
      let files = [];
      let bodyEl = null;
      const hint = '파일을 끌어다 놓거나 눌러서 고르세요';
      const size = n => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1048576).toFixed(1)}MB`);
      return ui.modal({
        title: o.title || '파일 업로드',
        wide: o.wide,
        body: `${o.help || ''}
          <label class="dropzone upload-drop" data-upload-drop>${icon('upload')}
            <strong data-upload-picked>${hint}</strong>${o.type ? `<span class="tiny muted">${esc(o.type)}</span>` : ''}
            <input type="file" class="sr-only" accept="${esc(o.accept || '')}"${o.multiple ? ' multiple' : ''} data-upload-input aria-label="${esc(o.title || '파일')} 고르기"></label>
          ${o.extra || ''}`,
        actions: [{ label: '취소', value: null }, { label: o.okLabel || '올리기', value: 'ok', tone: 'lime', onClick: () => files.length > 0 }],
        onOpen(b) {
          bodyEl = b;
          const zone = b.querySelector('[data-upload-drop]');
          const okBtn = b.closest('.modal').querySelector('[data-modal-act="1"]');
          const pick = list => {
            files = Array.from(list || []).slice(0, o.multiple ? undefined : 1);
            zone.querySelector('[data-upload-picked]').textContent = files.length
              ? files.map(f => `${f.name} (${size(f.size)})`).join(' · ') : hint;
            zone.classList.toggle('picked', files.length > 0);
            okBtn.disabled = !files.length;
          };
          okBtn.disabled = true;
          zone.querySelector('[data-upload-input]').addEventListener('change', e => pick(e.target.files));
          zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
          zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
          zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag');
            if (e.dataTransfer) pick(e.dataTransfer.files);
          });
          if (o.onOpen) o.onOpen(b);
        }
      }).then(v => (v === 'ok' && files.length ? { files, body: bodyEl } : null));
    }
  };

  /* ───────── 서버 호출 ───────── */
  async function api(path, body, opts) {
    opts = opts || {};
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const method = opts.method || (body === undefined ? 'GET' : 'POST');
    const init = { method, cache: 'no-store', headers: {} };
    if (body !== undefined && method !== 'GET') {
      if (isForm) init.body = body;
      else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    }
    if (opts.signal) init.signal = opts.signal;
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.');
    }
    const type = res.headers.get('Content-Type') || '';
    const data = type.includes('application/json') ? await res.json().catch(() => ({})) : (opts.raw ? res : {});
    if (!res.ok) {
      const err = new Error((data && data.error) || `서버 오류 (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return opts.raw ? res : data;
  }

  let healthP = null;
  function health(force) {
    if (!healthP || force) {
      healthP = fetch('/api/health', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    }
    return healthP;
  }

  function log(action, o) {
    o = o || {};
    return api('/api/worklog', {
      part: o.part || current, kind: o.kind || '기타', action, status: o.status || '완료',
      approval: o.approval, detail: o.detail || {}
    }).catch(() => null);
  }

  const user = () => Object.assign({}, BOOT.user || {});

  /* ───────── 페이지 제목 · 버튼 자리 ───────── */
  const $ = id => (doc ? doc.getElementById(id) : null);
  const page = {
    title(t) { const el = $('page-title'); if (el) el.textContent = t; },
    subtitle(s) { const el = $('page-sub'); if (el) el.textContent = s; },
    actions() { return $('page-actions'); },
    crumb(t) { const el = $('crumb'); if (el) el.textContent = t; },
    heading(show) { const el = doc && doc.querySelector('.page-heading'); if (el) el.hidden = show === false; },
    /** 왼쪽 하위 메뉴를 지금 다시 맞춤 (보통은 자동) */
    syncNav: () => requestNavSync()
  };

  /* ───────── 왼쪽 하위 메뉴 (시안 v3: 상단 = 업무 영역, 왼쪽 = 그 영역의 하위 메뉴) ─────────
     파트가 그린 탭 줄(role="tablist" 안의 role="tab")을 왼쪽 메뉴로 옮겨 보여 줍니다. 파트 코드는 그대로 둡니다.
     - 왼쪽 항목을 누르면 원래 탭 버튼을 누른 것과 같음 (tab.click())
     - 옮긴 탭 줄은 화면에서 숨김 (.is-subnav-mirrored). 탭이 바뀌면(aria-selected · class) 왼쪽도 따라 바뀜
     - 탭 패널 안의 두 번째 탭 줄(예: 인사이트 › 데이터의 세부 탭)은 고른 항목 아래에 들여 써서 보여 줌
     - 옮기지 않을 탭 줄: data-subnav="off" · 아이콘 없이 순서대로 01, 02 … 번호를 붙임
     - 탭에 data-group="이름"이 있으면 묶음이 바뀌는 자리에 회색 작은 이름표를 넣음 (누르는 항목 아님)
     - data-quiet가 있는 탭은 흐린 글씨 (자주 안 가는 관리 화면)
     - 탭이 없는 파트는 서버가 그린 기본 항목(파트 이름) 하나가 그대로 보임 */
  const isOn = el => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' ||
    el.classList.contains('active') || el.classList.contains('selected') || el.classList.contains('is-active');
  let navState = { items: [], subs: [], sig: "" };
  let navQueued = false;

  function tabInfo(el) {
    const c = el.cloneNode(true);
    let count = '';
    c.querySelectorAll('svg, .icon, .sr-only').forEach(x => x.remove());
    c.querySelectorAll('.count, .n, .badge, .muted, .small').forEach(x => {
      const t = x.textContent.trim();
      if (!count && /^\(?\d[\d,]*\+?\)?$/.test(t)) count = t.replace(/[()]/g, '');
      if (count === '0') count = '';  // 0은 숨김
      x.remove();
    });
    let label = c.textContent.replace(/\s+/g, ' ').trim() || el.textContent.replace(/\s+/g, ' ').trim();
    label = label.replace(/^[^\p{L}\p{N}]+/u, '').trim();  // 앞의 이모지·기호 (🔎 업체 컨택 → 업체 컨택)
    return { el, label, count, on: isOn(el), disabled: !!el.disabled, group: el.dataset.group || '', quiet: 'quiet' in el.dataset };
  }
  function hiddenUpTo(el, root) {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (p.hidden) return true;
    return false;
  }
  function renderNav() {
    const box = $('subnav');
    const root = $('part-root');
    if (!box || !root) return;
    const lists = Array.from(root.querySelectorAll('[role="tablist"]')).filter(l => l.dataset.subnav !== 'off');
    if (!lists.length) return;
    const primary = lists[0];
    const nested = lists.slice(1).find(l => l.closest('[role="tabpanel"], [data-panel]') && !hiddenUpTo(l, root)) || null;
    [primary, nested].forEach(l => { if (l && !l.classList.contains('is-subnav-mirrored')) l.classList.add('is-subnav-mirrored'); });
    const items = Array.from(primary.querySelectorAll('[role="tab"]')).map(tabInfo);
    const subs = nested ? Array.from(nested.querySelectorAll('[role="tab"]')).map(tabInfo) : [];
    const sig = JSON.stringify([items.map(i => [i.label, i.count, i.on, i.disabled, i.group]), subs.map(i => [i.label, i.on, i.disabled])]);
    navState.items = items;
    navState.subs = subs;
    if (sig === navState.sig) return;
    navState.sig = sig;
    // 아이콘 없이 이름 + 오른쪽 번호(01, 02 …). 세부 메뉴는 번호 없이 이름만
    const btn = (it, key, no) => `<button type="button" data-subnav="${key}" class="${it.on ? 'active' : ''}${it.count ? ' has-count' : ''}${it.quiet ? ' sub-quiet' : ''}"` +
      `${it.on ? ' aria-current="page"' : ''}${it.disabled ? ' disabled' : ''}><span class="label">${esc(it.label)}</span>` +
      `${it.count ? `<span class="sub-count">${esc(it.count)}</span>` : ''}${no ? `<span class="sub-no" aria-hidden="true">${no}</span>` : ''}</button>`;
    const groupLabel = (it, i) => it.group && (i === 0 || items[i - 1].group !== it.group) ? `<div class="sub-section-label">${esc(it.group)}</div>` : '';
    box.innerHTML = items.map((it, i) => groupLabel(it, i) + btn(it, 'p' + i, String(i + 1).padStart(2, '0')) +
      (it.on && subs.length ? `<div class="nested">${subs.map((s, j) => btn(s, 's' + j)).join('')}</div>` : '')).join('');
    const on = items.find(x => x.on);
    const subOn = subs.find(x => x.on);
    if (on) page.crumb(on.label + (subOn ? ' · ' + subOn.label : ''));
  }
  function requestNavSync() {
    if (navQueued) return;
    navQueued = true;
    (global.requestAnimationFrame || (f => setTimeout(f, 16)))(() => { navQueued = false; renderNav(); });
  }
  function watchNav(root) {
    renderNav();
    const box = $('subnav');
    if (box) box.addEventListener('click', e => {
      const b = e.target.closest('button[data-subnav]');
      if (!b || b.disabled) return;
      const key = b.dataset.subnav;
      const it = (key[0] === 's' ? navState.subs : navState.items)[+key.slice(1)];
      if (!it || !it.el.isConnected) return;
      it.el.click();
      closeSidebar();
      requestNavSync();
      if (global.scrollY > 0 && global.scrollTo) global.scrollTo({ top: 0, behavior: 'smooth' });
    });
    if (global.MutationObserver) {
      new global.MutationObserver(requestNavSync).observe(root, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-pressed', 'class', 'hidden', 'disabled']
      });
    }
  }
  function closeSidebar() {
    const side = $('sidebar');
    const toggle = $('menu-toggle');
    if (side) side.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  /* ───────── 표: 머리글 끝을 끌어 칸 너비 조절 · 마우스 휠로 가로 스크롤 (모든 탭 공통) ─────────
     - 탭이 직접 너비 조절을 붙인 표(data-cols)는 건드리지 않음
     - 너비는 이 브라우저에 표(머리글 이름)별로 기억, 손잡이를 두 번 누르면 처음 너비로 */
  const COLW_KEY = 'reboot-colw';
  const colwAll = () => { try { return JSON.parse(global.localStorage.getItem(COLW_KEY)) || {}; } catch (e) { return {}; } };
  const colwSave = (key, w) => {
    const all = colwAll();
    if (w) all[key] = w; else delete all[key];
    try { global.localStorage.setItem(COLW_KEY, JSON.stringify(all)); } catch (e) { /* 저장 못 해도 화면은 그대로 */ }
  };
  const headRow = t => (t.tHead && t.tHead.rows.length === 1 ? t.tHead.rows[0] : null);
  const tableKey = t => (current || '') + ':' + [...headRow(t).cells].map(c => c.textContent.trim()).join('|');
  function setColWidths(table, w) {
    let group = table.querySelector(':scope > colgroup');
    if (!group || group.children.length !== w.length) {
      if (group) group.remove();
      group = doc.createElement('colgroup');
      group.innerHTML = w.map(() => '<col>').join('');
      table.insertBefore(group, table.firstChild);
    }
    [...group.children].forEach((c, i) => { c.style.width = w[i] + 'px'; });
    table.style.width = w.reduce((a, b) => a + b, 0) + 'px';
    table.classList.add('rb-fixed');
  }
  function enhanceTable(table) {
    if (table.dataset.rbCols || table.dataset.cols) return;
    table.dataset.rbCols = '1';
    const row = headRow(table);
    if (!row || [...row.cells].some(c => c.colSpan > 1)) return;
    const box = table.parentElement;
    if (box && !/auto|scroll/.test(getComputedStyle(box).overflowX)) {
      const wrap = doc.createElement('div');
      wrap.className = 'table-wrap';
      box.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
    [...row.cells].forEach((th, i) => {
      th.classList.add('rb-col-th');
      th.insertAdjacentHTML('beforeend', `<span class="rb-col-rs" data-col="${i}" title="끌어서 칸 너비 조절 · 두 번 누르면 처음대로" aria-hidden="true"></span>`);
    });
    const saved = colwAll()[tableKey(table)];
    if (Array.isArray(saved) && saved.length === row.cells.length) setColWidths(table, saved);
  }
  function enhanceTables() {
    doc.querySelectorAll('#part-root table, .modal table, dialog table').forEach(enhanceTable);
  }
  function watchTables() {
    enhanceTables();
    let queued = false;
    if (global.MutationObserver) {
      new global.MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => { queued = false; enhanceTables(); }, 30);
      }).observe(doc.body, { subtree: true, childList: true });
    }
    doc.addEventListener('mousedown', e => {
      const h = e.target.closest && e.target.closest('.rb-col-rs');
      if (!h) return;
      e.preventDefault();
      e.stopPropagation();
      const table = h.closest('table');
      const i = Number(h.dataset.col);
      const w = [...headRow(table).cells].map(c => Math.round(c.getBoundingClientRect().width));
      setColWidths(table, w);
      const x0 = e.clientX, w0 = w[i];
      let moved = false;
      h.classList.add('on');
      const move = ev => {
        moved = true;
        w[i] = Math.max(48, Math.round(w0 + ev.clientX - x0));
        setColWidths(table, w);
      };
      const up = () => {
        doc.removeEventListener('mousemove', move);
        doc.removeEventListener('mouseup', up);
        h.classList.remove('on');
        if (moved) colwSave(tableKey(table), w);
      };
      doc.addEventListener('mousemove', move);
      doc.addEventListener('mouseup', up);
    }, true);
    // 손잡이를 눌러도 머리글 정렬 등이 같이 눌리지 않게
    doc.addEventListener('click', e => { if (e.target.closest && e.target.closest('.rb-col-rs')) { e.preventDefault(); e.stopPropagation(); } }, true);
    doc.addEventListener('dblclick', e => {
      const h = e.target.closest && e.target.closest('.rb-col-rs');
      if (!h) return;
      const table = h.closest('table');
      colwSave(tableKey(table), null);
      const group = table.querySelector(':scope > colgroup');
      if (group) group.remove();
      table.style.width = '';
      table.classList.remove('rb-fixed');
    }, true);
    // 표가 옆으로 넘치면 휠(위아래)을 가로 스크롤로 — 끝에 닿으면 원래대로 화면이 내려감
    doc.addEventListener('wheel', e => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const wrap = e.target.closest && e.target.closest('.table-wrap');
      if (!wrap || wrap.scrollHeight > wrap.clientHeight + 1) return;
      const max = wrap.scrollWidth - wrap.clientWidth;
      if (max < 2) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? wrap.clientWidth : 1);
      if ((dy > 0 && wrap.scrollLeft >= max - 1) || (dy < 0 && wrap.scrollLeft <= 0)) return;
      e.preventDefault();
      wrap.scrollLeft += dy;
    }, { passive: false });
  }

  /* ───────── 시작: 현재 파트 그리기 · 메뉴 숫자 · 상단 바 ───────── */
  if (global.addEventListener) {
    global.addEventListener('error', e => {
      const m = e && e.filename && e.filename.match(/\/parts\/([a-z0-9-]+)\//);
      if (m) loadErrors[m[1]] = e.message || '스크립트 오류';
    });
  }

  function summaries() {
    const out = [];
    parts.forEach(p => {
      if (typeof p.summary !== 'function') return;
      try {
        const s = p.summary();
        if (s && s.label != null) out.push({ id: p.id, label: p.label, summary: s });
      } catch (e) { /* 요약 실패는 무시 */ }
    });
    return out;
  }

  function updateCounts() {
    const list = summaries();
    list.forEach(({ id, summary }) => {
      const el = doc.querySelector(`[data-count="${id}"]`);
      if (!el) return;
      const n = Number(summary.value);
      const show = Number.isFinite(n) && n > 0;
      if (show) el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = !show;  // 0이 되면 숨김 (처리 후 다시 그릴 때)
    });
    const dot = doc.querySelector('[data-bell-dot]');
    if (dot) dot.hidden = !list.some(x => Number(x.summary.value) > 0);
    return list;
  }

  function applyTheme(t) {
    const root = doc.documentElement;
    if (t === 'dark') root.setAttribute('data-theme', 'dark');
    else if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', 'light');
    const label = doc.querySelector('[data-theme-label]');
    if (label) label.textContent = { light: '밝게', dark: '어둡게', auto: '시스템 따라' }[t] || '밝게';
  }

  function setupChrome() {
    const side = $('sidebar');
    const toggle = $('menu-toggle');
    if (toggle && side) toggle.addEventListener('click', () => {
      const open = side.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && side && side.classList.contains('open')) closeSidebar(); });
    // 좁은 화면: 상단 알약 메뉴에서 지금 영역이 보이도록 가로 스크롤 (페이지는 움직이지 않음)
    const topNav = $('top-nav');
    const activeTop = topNav && topNav.querySelector('.active');
    if (activeTop && topNav.scrollWidth > topNav.clientWidth) {
      const delta = activeTop.getBoundingClientRect().left - topNav.getBoundingClientRect().left;
      topNav.scrollLeft = Math.max(0, topNav.scrollLeft + delta - (topNav.clientWidth - activeTop.offsetWidth) / 2);
    }
    // 파일 메뉴 (ui.fileMenu): 항목을 누르거나 바깥을 누르면 닫힘
    doc.addEventListener('click', e => {
      const inItem = e.target.closest('.file-menu-list');
      doc.querySelectorAll('details.file-menu[open]').forEach(d => { if (inItem ? d.contains(inItem) : !d.contains(e.target)) d.open = false; });
    });
    doc.addEventListener('click', e => {
      if (e.target.closest('[data-close-sidebar]')) { closeSidebar(); return; }
      if (side && side.classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('#menu-toggle')) closeSidebar();
    });

    const prof = $('profile-btn');
    const menu = $('profile-menu');
    if (prof && menu) {
      prof.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; prof.setAttribute('aria-expanded', String(!menu.hidden)); });
      doc.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#profile-menu')) { menu.hidden = true; prof.setAttribute('aria-expanded', 'false'); } });
    }
    let theme = 'light';
    try { theme = global.localStorage.getItem('reboot:theme') || 'light'; } catch (e) { /* 무시 */ }
    applyTheme(theme);
    const themeBtn = $('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const order = ['light', 'dark', 'auto'];
      theme = order[(order.indexOf(theme) + 1) % order.length];
      try { global.localStorage.setItem('reboot:theme', theme); } catch (e) { /* 무시 */ }
      applyTheme(theme);
    });

    const bell = $('bell-btn');
    if (bell) bell.addEventListener('click', () => {
      const list = summaries();
      const body = list.length
        ? list.map(x => `<div class="decision"><label>${esc(x.label)}</label><div class="between"><span>${esc(x.summary.label)}</span><strong>${esc(x.summary.value)}</strong></div></div>`).join('')
        : '<p>지금 확인할 알림이 없습니다.</p>';
      ui.modal({ title: '오늘 확인할 일', body: `<p>각 메뉴의 요약입니다.</p>${body}` });
    });
  }

  function renderMissing(root, id) {
    const info = (BOOT.parts || []).find(p => p.id === id) || { label: id, owner: '' };
    const err = loadErrors[id];
    root.innerHTML = `<section class="card part-missing">
      <div class="card-head"><h2>${esc(info.label)} 화면을 준비 중입니다</h2>${ui.badge(err ? '불러오기 오류' : '준비 중', err ? 'red' : 'orange')}</div>
      ${err ? `<p class="part-error">parts/${esc(id)}/ 파일을 실행하다 오류가 났습니다.\n${esc(err)}</p>` :
        `<p class="panel-note">담당: ${esc(info.owner || '—')} · <code>tabs/${esc(id)}/static/${esc(id)}.js</code>에서 <code>REBOOT.register({ id: '${esc(id)}', render })</code>를 부르면 이 자리에 화면이 그려집니다.</p>`}
    </section>`;
  }

  function start() {
    if (!doc) return;
    setupChrome();
    const root = $('part-root');
    if (root && current) {
      const part = parts.find(p => p.id === current);
      if (!part) renderMissing(root, current);
      else {
        if (current !== 'home') {
          if (part.title) page.title(part.title);
          if (part.subtitle) page.subtitle(part.subtitle);
        }
        try {
          part.render(root);
        } catch (e) {
          console.error(e);
          root.innerHTML = `<p class="part-error">${esc(part.label || current)} 화면을 그리지 못했습니다.\n${esc(e && e.message)}</p>`;
        }
        watchNav(root);
      }
    }
    watchTables();
    updateCounts();
    // 파트가 비동기로 값을 바꿀 수 있어 한 번 더
    setTimeout(updateCounts, 1500);
  }

  global.REBOOT = {
    register,
    expose,
    use,
    store,
    ui,
    api,
    upload: (path, formData) => api(path, formData, { method: 'POST' }),
    health,
    log,
    user,
    page,
    data,
    today: () => BOOT.today || new Date().toISOString().slice(0, 10),
    current: () => current,
    parts: () => parts.slice(),
    meta: () => (BOOT.parts || []).slice(),
    env: () => Object.assign({}, BOOT.env || {}),
    refreshCounts: updateCounts,
    _parts: () => parts.slice(),
    _boot: BOOT
  };

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else setTimeout(start, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
