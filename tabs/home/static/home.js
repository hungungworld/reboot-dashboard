/* 홈 · 데일리 브리핑 (담당: 이현경) — 설명서 tabs/home/docs/README.md · 메모 tabs/home/docs/NOTES.md
   화면 2개 (왼쪽 메뉴): 데일리 브리핑 · 콘텐츠 캘린더 (시작하기는 2026-10-24 삭제)
   콘텐츠 캘린더 맨 아래: 다음 급등 예상 (접기 · 인사이트 검색 수요 탭에서 2026-10-25 옮김)
   모든 화면 오른쪽 아래: 이번 주 To-Do 버튼 → 사이드 패널 (home.js가 모든 페이지에서 불리므로 여기서 붙임)
   데일리 브리핑: 히어로(긴급 · 기회 · 다음 시즌) → 4칸: 작은 달력 · 다가오는 시즌 · 한눈에 보기 · 최근 활동 → 2단: 업계 뉴스 · 이번 주 할 일
   (2026-10-25 다시 배치: 시즌 카드 3 · KPI 4 · 성과 차트를 오른쪽 한 줄 요약으로 — 성과 차트는 성과분석 탭에)
   - 뉴스: 저장된 결과만 읽음 (구글 뉴스는 '지금 수집' 버튼·하루 1회 작업만 부름) · 규제 기사는 컴플라이언스 바로가기
   - 이번 주 할 일: 인사이트 긴급 · 기회(REBOOT.use('insights').weeklySignals, 읽기 전용) → 홈 할 일
     홈 할 일은 그 주 처음 열면 자동 생성 (OpenAI 키가 없으면 규칙), 항목마다 근거 표시
   다른 파트에 공개: REBOOT.use('home').seasons() — 시즌 캘린더(D-day · 준비 기간 포함) */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  if (!REBOOT) return;
  const store = REBOOT.store('home');   // 저장 키: todoBadge (메뉴 숫자용 · 이번 주 남은 할 일)
  const ui = REBOOT.ui;
  const { esc, toast, fmt, icon, badge, busy } = ui;
  const doc = global.document;
  const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY = 86400000;

  const S = { root: null, view: '', briefing: false, week: null, todos: null, signals: null, news: null, newsOpen: {}, saved: null, poll: null, calMonth: '' };
  const ref = name => S.root && S.root.querySelector(`[data-ref="${name}"]`);

  /* ───────── 줄바꿈: 문장 · 반점 단위 ─────────
     글 묶음(p · li · .note …) 속 글자를 문장 끝 · 반점 뒤에서 나눠 <span class="home-ph">로 감쌈
     → 문장이 바뀌는 곳에서 먼저 줄이 바뀌고, 한 문장이 길면 그 안에서 줄 길이를 고르게 (home.css)
     숫자(1,234 · 3.5)는 뒤에 띄어쓰기가 없어 안 나뉨. 표 · 버튼 · 배지 · 입력칸 · 한 줄 칸은 건드리지 않음 */
  const PH_BLOCK = 'p, li, dd, small, figcaption, blockquote, .note, .panel-note, .hint';
  const PH_SKIP = 'table, button, .btn, label, .badge, input, textarea, select, code, pre, svg, [contenteditable], .home-ph';
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
          sp.className = 'home-ph';
          sp.textContent = s;
          frag.append(sp);
        });
        t.replaceWith(frag);
      });
    });
  }
  // 화면은 innerHTML로 자주 다시 그려지므로, 새로 붙은 노드를 모아 한 번에 처리
  function phraseAll(nodes) {
    const todo = new Set();
    nodes.forEach(n => {
      const el = n.nodeType === 3 ? n.parentElement : n;
      if (el && el.nodeType === 1 && el.isConnected && el.closest('.part-home')) todo.add(el.closest(PH_BLOCK) || el);
    });
    todo.forEach(phrase);
  }
  if (doc && global.MutationObserver) {
    const start = () => {
      new global.MutationObserver(ms => phraseAll(ms.flatMap(m => [...m.addedNodes]))).observe(doc.body, { childList: true, subtree: true });
      phraseAll([...doc.querySelectorAll('.part-home')]);
    };
    if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
  }

  /* ───────── 날짜 (YYYY-MM-DD 문자열, UTC로 계산) ───────── */
  const toTime = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const fromTime = t => new Date(t).toISOString().slice(0, 10);
  const addDays = (iso, n) => fromTime(toTime(iso) + n * DAY);
  const dow = iso => new Date(toTime(iso)).getUTCDay();
  const md = iso => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
  function weekStartOf(iso) { const d = dow(iso); return addDays(iso, d === 0 ? -6 : 1 - d); }

  /* ───────── 다른 파트 값 (없거나 실패하면 빈 값) ───────── */
  async function safe(fn) { try { return await Promise.resolve(fn()); } catch (e) { return null; } }
  function csStats() { try { return REBOOT.use('cs').stats() || null; } catch (e) { return null; } }
  function compliancePending() {
    try {
      const p = REBOOT.parts().find(x => x.id === 'compliance');
      const v = p && typeof p.summary === 'function' ? Number(p.summary().value) : NaN;
      return Number.isFinite(v) ? v : null;
    } catch (e) { return null; }
  }
  const weekSummary = () => safe(() => REBOOT.use('performance').weekSummary());
  const campaigns = () => safe(() => REBOOT.use('content').campaigns());
  function seasons() { try { return REBOOT.data.seasons() || []; } catch (e) { return []; } }
  function partLabel(id) {
    const p = (REBOOT.meta() || []).find(x => x.id === id);
    return p ? p.label : id ? id : '워크스페이스';
  }
  const isUrl = u => /^https?:\/\//i.test(String(u || ''));
  const arrow = d => (d > 0 ? '▲' : d < 0 ? '▼' : '–');

  /* ───────── 한눈에 보기 (오른쪽 · 시장 신호 · 성과 · 검토 대기) — 숫자는 각 탭이 원본, 여기는 한 줄 요약 + 바로가기 ───────── */
  async function paintGlance() {
    const box = ref('glance');
    if (!box) return;
    if (!S.week) {
      const week = await weekSummary();
      S.week = week && !week.empty ? week : null;
    }
    const w = S.week;
    const row = (href, label, value, tag) => `<a class="home-glance-row" href="${href}"><span>${esc(label)}${tag || ''}</span><b>${value}</b>${icon('arrow')}</a>`;
    const rows = [];
    const sig = S.signals;
    const n = g => (sig ? sig.items.filter(i => i.grade === g).length : 0);
    rows.push(row('/dashboard/insights#weekly', '시장 신호', sig ? esc(`긴급 ${n('긴급')} · 기회 ${n('기회')}`) : '—'));
    const ch = w && w.change && w.change.revenue;
    rows.push(row('/dashboard/performance', '이번 주 매출', w ? esc(`${fmt.krw(w.revenue)}${ch != null ? ` ${arrow(ch)}${fmt.num(Math.abs(ch), 1)}%` : ''}`) : '—',
      w && w.sample ? ' ' + badge('예시', 'orange') : ''));
    const cs = csStats();
    const comp = compliancePending();
    const csOpen = cs && Number.isFinite(Number(cs.open)) ? Number(cs.open) : null;
    const parts = [csOpen != null ? `CS ${csOpen}` : '', comp != null ? `카피 ${comp}` : ''].filter(Boolean);
    // 대기 건수가 더 많은 파트로 (같으면 컴플라이언스)
    rows.push(row((csOpen || 0) > (comp || 0) ? '/dashboard/cs' : '/dashboard/compliance', '검토 대기', parts.length ? esc(parts.join(' · ')) : '—'));
    box.innerHTML = rows.join('');
  }

  /* ───────── 시즌 (브리핑 히어로 · 시즌 카드 · 콘텐츠 캘린더) ───────── */
  const seasonKey = s => (s.ongoing ? -1 : s.dday);
  // 시즌 이모지 (2026-10-26): 이름에 든 낱말로 찾음, 없으면 구분(holiday · sports · occasion)별 기본 1개
  const SEASON_EMOJI = [
    [/halloween/i, ['🎃', '👻', '🍬']], [/thanksgiving/i, ['🦃', '🥧', '🍂']], [/christmas/i, ['🎄', '🎅', '🎁']],
    [/new year/i, ['🎆', '🥂', '🎉']], [/mardi gras/i, ['🎭', '📿', '🎺']], [/super bowl/i, ['🏈', '🍗', '🍺']],
    [/patrick/i, ['🍀', '🍺', '🌈']], [/cinco de mayo/i, ['🌮', '🪅', '🌶️']], [/memorial/i, ['🇺🇸', '🎖️', '🌭']],
    [/independence|fourth of july|july 4/i, ['🎆', '🇺🇸', '🍔']], [/labor day/i, ['🌭', '☀️', '🛠️']],
    [/valentine/i, ['💘', '🍫', '🌹']], [/easter/i, ['🐣', '🥚', '🌷']], [/spring break/i, ['🏖️', '🍹', '🌴']],
    [/march madness/i, ['🏀', '🍕', '🍺']], [/derby/i, ['🏇', '🌹', '🥃']], [/mother/i, ['💐', '💝', '🥞']],
    [/father/i, ['👔', '🍖', '🍺']], [/graduation/i, ['🎓', '🎉', '🥂']], [/black friday|cyber monday/i, ['🛍️', '🏷️', '💳']],
    [/oktoberfest/i, ['🍺', '🥨', '🎪']], [/world cup|soccer/i, ['⚽', '🏟️', '🍺']], [/pride/i, ['🏳️‍🌈', '🎉', '🥂']],
  ];
  const CAT_EMOJI = { holiday: '📅', sports: '🏆', occasion: '🎉' };
  function seasonEmoji(name, category) {
    const hit = SEASON_EMOJI.find(([re]) => re.test(String(name || '')));
    if (hit) return hit[1];
    const s = category ? null : seasons().find(x => x.name === name);
    return [CAT_EMOJI[category || (s && s.category)] || '📅'];
  }
  // 캘린더 띠 색 — 시즌 이름으로 6색 중 하나 (같은 시즌은 늘 같은 색)
  const EV_COLORS = ['ev-green', 'ev-pink', 'ev-orange', 'ev-purple', 'ev-cyan', 'ev-blue'];
  const seasonColor = name => EV_COLORS[[...String(name || '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7) % EV_COLORS.length];
  const emojiOne = s => `<span class="home-emoji" aria-hidden="true">${seasonEmoji(s.name, s.category)[0]}</span>`;
  const emojiAll = s => `<span class="home-emoji" aria-hidden="true">${seasonEmoji(s.name, s.category).join('')}</span>`;
  function upcomingSeasons() {
    return seasons().filter(s => s.ongoing || s.dday >= 0).sort((a, b) => seasonKey(a) - seasonKey(b));
  }
  const pad2 = v => (v == null ? '—' : String(v).padStart(2, '0'));
  // 히어로: 긴급 할 일이 있으면 '오늘 먼저 할 일 N개', 없으면 다음 시즌 / 숫자: 긴급 · 기회 · 다음 시즌
  function paintHero() {
    const title = ref('hero-title');
    if (!title) return;
    const s = upcomingSeasons()[0];
    const when = !s ? '' : s.ongoing ? `${s.name} 진행 중` : `${s.name} ${fmt.dday(s.start)}`;
    const urgent = urgentCount();
    title.textContent = urgent ? `오늘 먼저 할 일 ${urgent}개${when ? `, ${when}` : ''}`
      : !s ? '이번 주 우선순위를 정해 보세요.'
        : s.ongoing ? `${s.name}, 지금이 바로 그 시즌.`
          : s.dday === 0 ? `오늘은 ${s.name}.` : `${s.name}까지 ${s.dday}일, 준비는 지금부터.`;
    const sig = S.signals;
    ref('hero-urgent').textContent = sig || S.todos ? pad2(urgent) : '—';
    ref('hero-chance').textContent = sig ? pad2(sig.items.filter(i => i.grade === '기회').length) : '—';
    ref('hero-season').textContent = s ? (s.ongoing ? 'NOW' : fmt.dday(s.start)) : '—';
  }
  // 긴급 = 인사이트 긴급 신호 + CS 긴급 건이 있으면 1 (CS 할 일은 AI 할 일 안에 있음)
  function urgentCount() {
    const sig = S.signals ? S.signals.items.filter(i => i.grade === '긴급').length : 0;
    const cs = csStats();
    return sig + (cs && Number(cs.urgent) > 0 ? 1 : 0);
  }
  // 다가오는 시즌 (오른쪽 · 한 줄씩) — 달력 · 준비 기간 자세히는 콘텐츠 캘린더
  function paintSeasons() {
    const box = ref('seasons');
    const list = upcomingSeasons().slice(0, 3);
    if (!list.length) {
      box.innerHTML = ui.empty('다가오는 시즌이 없어요. 설정 › 수집 설정에서 시즌을 추가하세요.', 'calendar');
      return;
    }
    box.innerHTML = list.map(s => {
      const status = s.ongoing ? badge('진행 중', 'green') : s.inLead ? badge('준비 기간', 'green') : '';
      const tip = s.notes || (s.ongoing ? '게시 일정과 재고를 확인하세요.' : `준비 시작 ${md(addDays(s.start, -s.leadDays))} · 준비 기간 ${s.leadDays}일`);
      return `<button type="button" class="home-season-row${s.inLead || s.ongoing ? ' on' : ''}" data-go-view="calendar" title="${esc(tip)}">
        <b>${s.ongoing ? 'NOW' : esc(fmt.dday(s.start))}</b><span class="grow">${emojiAll(s)} ${esc(s.name)}<small>${esc(s.start.replace(/-/g, '.'))} (${WEEKDAY[dow(s.start)]})</small></span>${status}</button>`;
    }).join('');
  }

  function paintCalendar() {
    const box = ref('calendar');
    const today = REBOOT.today();
    const ym = S.calMonth || today.slice(0, 7);
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const first = `${ym}-01`;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = dow(first);
    const cells = Math.ceil((lead + days) / 7) * 7;
    const list = seasons().slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.name < b.name ? -1 : 1));
    const html = [];
    let lanes = [];
    for (let i = 0; i < cells; i++) {
      const iso = addDays(first, i - lead);
      const wd = i % 7;
      // 주마다 줄(lane)을 정해 여러 날 시즌이 같은 높이로 이어지게
      if (wd === 0) {
        const we = addDays(iso, 6);
        lanes = [];
        list.filter(s => s.start <= we && s.end >= iso).forEach(s => {
          const free = lanes.findIndex(l => l.every(o => o.end < s.start || o.start > s.end));
          if (free < 0) lanes.push([s]); else lanes[free].push(s);
        });
      }
      const band = lanes.map(l => {
        const s = l.find(o => iso >= o.start && iso <= o.end);
        if (!s) return '<span class="home-ev-gap" aria-hidden="true"></span>';
        const from = iso > s.start && wd > 0, to = iso < s.end && wd < 6;
        const label = iso === s.start || wd === 0;
        const cls = `event-pill ev ${seasonColor(s.name)}${from ? ' from' : ''}${to ? ' to' : ''}`;
        return `<a class="${cls}" href="/dashboard/content" data-act="season-go" data-name="${esc(s.name)}" data-start="${esc(s.start)}" aria-label="${esc(s.name)}" title="${esc(seasonEmoji(s.name, s.category).join(''))} ${esc(s.name)}${s.notes ? ` · ${esc(s.notes)}` : ''} · 눌러서 콘텐츠 준비">${label ? `${emojiOne(s)} ${esc(s.name)}` : ''}</a>`;
      });
      const pills = band.concat(list.filter(s => s.leadDays > 0 && addDays(s.start, -s.leadDays) === iso)
          .map(s => `<a class="event-pill ev lead ${seasonColor(s.name)}" href="/dashboard/content" data-act="season-go" data-name="${esc(s.name)}" data-start="${esc(s.start)}" title="${esc(s.name)} ${esc(fmt.dday(s.start))} · 준비 기간 ${esc(s.leadDays)}일 시작 · 눌러서 콘텐츠 준비">${emojiOne(s)} ${esc(s.name)} 준비 시작</a>`));
      html.push(`<div class="day${iso.slice(0, 7) === ym ? '' : ' dim'}${iso === today ? ' today' : ''}">
        <div class="between"><span>${+iso.slice(8, 10)}</span>${iso === today ? badge('오늘', 'green') : ''}</div>${pills.join('')}</div>`);
    }
    const upcoming = upcomingSeasons().slice(0, 6);
    const item = s => {
      const lt = addDays(s.start, -s.leadDays);
      const info = s.ongoing ? `진행 중${s.end !== s.start ? ` · ~${md(s.end)}` : ''}`
        : s.inLead ? `${fmt.dday(s.start)} · 준비 기간 ${s.leadDays}일 (${md(lt)}부터)`
          : `${fmt.dday(s.start)} · 준비 시작 ${md(lt)}`;
      return `<div class="schedule-item home-sched${s.inLead || s.ongoing ? ' is-lead' : ''}">
        <div class="date-box">${+s.start.slice(8, 10)}<small>${+s.start.slice(5, 7)}월 ${WEEKDAY[dow(s.start)]}</small></div>
        <div><p>${emojiAll(s)} ${esc(s.name)}${s.inLead ? badge('준비 중', 'lime') : s.ongoing ? badge('진행 중', 'green') : ''}</p><span>${esc(info)}</span></div></div>`;
    };
    box.innerHTML = `
      <section class="card">
        <div class="card-head home-cal-head">
          <div class="flex"><h2 class="home-cal-title">${y}년 ${m}월</h2>
            <button type="button" class="btn small" data-act="cal-prev" aria-label="이전 달">‹</button>
            <button type="button" class="btn small" data-act="cal-next" aria-label="다음 달">›</button>
            <button type="button" class="btn small" data-act="cal-today">오늘</button></div>
          <div class="flex">${badge('시즌', 'green')}${badge('준비 시작')}</div></div>
        <div class="calendar-scroll">
          <div class="weekdays home-cal-weekdays" aria-hidden="true">${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="calendar-large" aria-label="${y}년 ${m}월 콘텐츠 캘린더 (미국 시즌 · 준비 시작일)">${html.join('')}</div>
        </div>
        <p class="source-label">시즌 일정은 설정 › 수집 설정의 시즌 캘린더에서 고쳐요. 준비 시작일 = 시즌 시작일 − 준비 기간.</p>
      </section>
      <section class="card section-gap"><div class="card-head"><h2>다가오는 일정</h2>${badge(`시즌 ${upcoming.length}개`)}</div>
        <div class="home-sched-grid">${upcoming.length ? upcoming.map(item).join('') : '<p class="panel-note">다가오는 시즌이 없어요. 설정 › 수집 설정에서 추가하세요.</p>'}</div></section>`;
  }
  // 캘린더 시즌을 누르면 안내 토스트 → 콘텐츠 제작 탭 (시즌은 주소 #season=이름|시작일로 넘김, 콘텐츠 탭이 추가 요청에 넣음)
  function goContent(name, start) {
    ui.toast(`${seasonEmoji(name)[0]} ${name} — 콘텐츠 준비하러 가요`);
    setTimeout(() => { global.location.href = `/dashboard/content#season=${encodeURIComponent(name)}|${start}`; }, 600);
  }
  const shiftMonth = (ym, n) => {
    let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + n;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  function moveMonth(n) {
    S.calMonth = shiftMonth(S.calMonth || REBOOT.today().slice(0, 7), n);
    paintCalendar();
  }

  // 작은 달력 (브리핑 · 이번 주 할 일 왼쪽) — 시즌 = 초록 점 · 준비 시작 = 회색 점, 날짜를 누르면 콘텐츠 캘린더
  function paintMiniCalendar() {
    const box = ref('mini-cal');
    if (!box) return;
    const today = REBOOT.today();
    const ym = S.miniMonth || today.slice(0, 7);
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const first = `${ym}-01`;
    const lead = dow(first);
    const cells = Math.ceil((lead + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7;
    const ws = weekStartOf(today), we = addDays(ws, 6);
    const list = seasons();
    const html = [];
    for (let i = 0; i < cells; i++) {
      const iso = addDays(first, i - lead);
      const on = list.filter(s => iso >= s.start && iso <= s.end);
      const starts = list.filter(s => s.leadDays > 0 && addDays(s.start, -s.leadDays) === iso);
      const tip = on.map(s => s.name).concat(starts.map(s => `${s.name} 준비 시작`)).join(' · ');
      const cls = ['home-mini-day', iso.slice(0, 7) === ym ? '' : 'dim', iso === today ? 'today' : '', iso >= ws && iso <= we ? 'week' : ''].filter(Boolean).join(' ');
      html.push(`<button type="button" class="${cls}" data-go-view="calendar" data-month="${iso.slice(0, 7)}" title="${esc(tip || md(iso))}">
        ${+iso.slice(8, 10)}<span class="home-mini-dots">${on.length ? '<i class="dot-season"></i>' : ''}${starts.length ? '<i class="dot-lead"></i>' : ''}</span></button>`);
    }
    const inMonth = list.filter(s => s.start.slice(0, 7) === ym || addDays(s.start, -s.leadDays).slice(0, 7) === ym)
      .sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 3);
    box.innerHTML = `
      <div class="card-head"><h2>${y}년 ${m}월</h2>
        <div class="flex"><button type="button" class="icon-btn small" data-act="mini-prev" aria-label="이전 달">‹</button>
          <button type="button" class="icon-btn small" data-act="mini-next" aria-label="다음 달">›</button></div></div>
      <div class="home-mini-week" aria-hidden="true">${WEEKDAY.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="home-mini-grid" aria-label="${y}년 ${m}월 콘텐츠 캘린더">${html.join('')}</div>
      <div class="home-mini-legend"><span><i class="dot-season"></i>시즌</span><span><i class="dot-lead"></i>준비 시작</span><span><i class="dot-week"></i>이번 주</span></div>
      ${inMonth.length ? `<ul class="home-mini-list">${inMonth.map(s => `<li><b>${esc(md(s.start))}</b><span class="grow">${esc(s.name)}</span><small>${s.ongoing ? '진행 중' : esc(fmt.dday(s.start))}</small></li>`).join('')}</ul>` : ''}
      <button type="button" class="link small home-mini-more" data-go-view="calendar" data-month="${ym}">콘텐츠 캘린더 ${icon('arrow')}</button>`;
  }

  /* 다음 급등 예상 (캘린더 맨 아래 · 접기) — 인사이트 검색 트렌드(/api/insights/data/trends)의 next */
  async function paintSurge() {
    const box = ref('surge');
    if (!box || box.dataset.loaded) return;
    box.dataset.loaded = '1';
    const fold = inner => `<details class="card section-gap home-surge"><summary><h2>다음 급등 예상</h2>${badge('작년 같은 시기 검색 · Google Trends')}</summary>
      <div class="home-surge-body">${inner}<a class="link" href="/dashboard/settings#collect">시즌 편집 (설정)</a></div></details>`;
    let d;
    try { d = await REBOOT.api('/api/insights/data/trends'); } catch (e) {
      box.innerHTML = fold(`<p class="panel-note">급등 예상을 불러오지 못했어요. ${esc(e.message)}</p>`);
      delete box.dataset.loaded;
      return;
    }
    const next = ((d && d.next) || []).map(n => `<li><div class="between"><b>${emojiAll(n)} ${esc(n.name)}</b><span class="flex">${n.opportunity ? badge('기회', 'green') : ''}<span class="small muted">${esc(fmt.dday(n.start))}</span></span></div>
      <small>${n.lift ? esc(`작년 같은 시기 '${n.lift.keyword}' 검색이 12개월 평균 대비 ${fmt.signed(n.lift.pct, 0, '%')} (${n.lift.date} 주)`) : '작년 같은 시기 데이터가 없어요.'}</small></li>`).join('');
    box.innerHTML = fold(next ? `<ul class="home-surge-list">${next}</ul>` : '<p class="panel-note">모니터링 중인 다가오는 시즌이 없어요.</p>');
  }

  /* ───────── 최근 활동 ───────── */
  async function paintActivity() {
    const box = ref('activity');
    try {
      const { items } = await REBOOT.api('/api/worklog?limit=5');
      box.innerHTML = (items || []).length
        ? items.map(x => `<li>${esc(x.action)}${x.status === '실패' ? ` ${badge('실패', 'red')}` : ''}<small>${esc(partLabel(x.part))} · ${esc(fmt.relative(x.at))} · ${esc(x.user)}</small></li>`).join('')
        : '<li>아직 기록이 없어요.<small>작업을 하면 여기에 쌓여요.</small></li>';
    } catch (e) {
      box.innerHTML = `<li>활동을 불러오지 못했어요.<small>${esc(e.message)}</small></li>`;
    }
  }

  /* ───────── 이번 주 To-Do ───────── */
  async function buildContext() {
    const ctx = {};
    const cs = csStats();
    if (cs) ctx.cs = { open: cs.open, urgent: cs.urgent, overdue: cs.overdue, owner_required: cs.owner_required };
    const comp = compliancePending();
    if (comp != null) ctx.compliance = { pending: comp };
    const w = S.week || (await weekSummary());
    if (w && !w.empty) {
      ctx.performance = { start: w.start, end: w.end, revenue: w.revenue, spend: w.spend, roas: w.roas, conversions: w.conversions,
        change: { revenue: w.change && w.change.revenue, roas: w.change && w.change.roas }, sample: !!w.sample };
    }
    const c = await campaigns();
    if (c && Number.isFinite(Number(c.active))) ctx.content = { active: c.active, total: c.total };
    return ctx;
  }
  function saveBadge() {
    const t = S.todos;
    if (!t) return;
    const v = { week: t.week.start, open: t.items.filter(i => !i.done).length + (S.signals ? S.signals.items.length : 0) };
    const old = store.get('todoBadge', null);
    if (!old || old.week !== v.week || old.open !== v.open) store.set('todoBadge', v);
    const el = doc.querySelector('[data-count="home"]');
    if (el) { el.textContent = v.open > 99 ? '99+' : String(v.open); el.hidden = v.open <= 0; }
    dock.sync(t, S.signals);
  }
  const TODO_MAX = 4;   // 이번 주 할 일 첫 화면 개수
  function todoHtml(t) {
    const tag = t.origin === 'ai' ? badge('AI', 'purple') : t.origin === 'rule' ? badge('규칙') : badge('직접', 'blue');
    const src = t.source && t.source !== 'home' && t.source !== 'manual'
      ? ` · <a class="link" href="/dashboard/${encodeURIComponent(t.source)}">${esc(partLabel(t.source))}</a>` : '';
    return `<div class="task${t.done ? ' done' : ''}" data-id="${esc(t.id)}">
      <label class="home-task-main"><input type="checkbox" data-act="todo-toggle"${t.done ? ' checked' : ''} aria-label="완료 표시: ${esc(t.title)}">
        <span class="grow"><span class="task-title">${esc(t.title)}</span><span class="meta">${tag}근거: ${esc(t.reason || '—').replace(/\bD-(\d)/g, 'D‑$1')}${src}${t.done && t.doneBy ? ` · 완료 ${esc(t.doneBy)}` : ''}</span></span></label>
      <button type="button" class="home-todo-del" data-act="todo-del" aria-label="삭제: ${esc(t.title)}">${icon('x')}</button></div>`;
  }
  // 인사이트 신호 한 줄 (읽기 전용 · 체크 없음 — 데이터가 바뀌면 다음 주간 계산에서 빠짐)
  function signalHtml(x) {
    return `<div class="task home-signal ${x.grade === '긴급' ? 'urgent' : 'chance'}">
      <span class="grow"><span class="task-title"><span class="home-grade">${esc(x.grade)}</span>${esc(x.title)}</span>
        <span class="meta">할 일: ${esc(x.todo)}</span></span>
      <a class="link home-signal-go" href="${esc(x.href)}">${esc(x.src)} ${icon('arrow')}</a></div>`;
  }
  // 이번 주 할 일 = 인사이트 긴급 → 인사이트 기회 → 홈 할 일(AI · 규칙 · 직접)
  function paintTodos() {
    const t = S.todos;
    const list = ref('todos');
    if (!t) return;
    const sig = S.signals ? S.signals.items.slice().sort((a, b) => (a.grade === '긴급' ? 0 : 1) - (b.grade === '긴급' ? 0 : 1)) : [];
    const open = t.items.filter(i => !i.done).length;
    ref('todo-count').textContent = t.items.length || sig.length ? `${open + sig.length}개` : '';
    const how = !t.generated ? '아직 만들지 않음' : t.origin === 'ai' ? 'AI 할 일은 시즌·뉴스·현황 종합 (참고용)' : `규칙으로 생성${t.aiReady ? '' : ' (AI 연결 안 됨)'}`;
    ref('todo-meta').textContent = `${md(t.week.start)} — ${md(t.week.end)} · ${sig.length ? '긴급 → 기회 → 홈 할 일 · ' : ''}${how}`;
    // 위에서 TODO_MAX개만 보이고 나머지는 접어 둠 (펼침 상태는 다시 그려도 유지)
    const rows = sig.map(signalHtml).concat(t.items.map(todoHtml));
    const rest = rows.slice(TODO_MAX);
    const more = rest.length ? `<details class="home-todo-more" data-ref="todo-more"${S.todoMoreOpen ? ' open' : ''}>
      <summary>나머지 ${rest.length}개</summary>${rest.join('')}</details>` : '';
    list.innerHTML = rows.length ? rows.slice(0, TODO_MAX).join('') + more : ui.empty('이번 주 할 일이 없어요. + 로 추가하거나 다시 만들기를 누르세요.', 'check');
    const fold = list.querySelector('[data-ref="todo-more"]');
    if (fold) fold.addEventListener('toggle', () => { S.todoMoreOpen = fold.open; });
    saveBadge();
    paintHero();
  }
  async function loadSignals() {
    S.signals = await safe(() => REBOOT.use('insights').weeklySignals());
    paintTodos();
    paintHero();
    paintGlance();
  }
  async function loadTodos() {
    try {
      let data = await REBOOT.api('/api/home/todos');
      if (!data.generated) {
        // 이번 주 처음 열면 자동 생성 (키가 없으면 규칙)
        data = await REBOOT.api('/api/home/todos/generate', { auto: true, context: await buildContext() });
        if (data.warning) toast(data.warning, 'error');
        if (!data.skipped) paintActivity();
      }
      S.todos = data;
      paintTodos();
    } catch (e) {
      ref('todos').innerHTML = `<p class="note error">할 일을 불러오지 못했어요. ${esc(e.message)}</p>`;
    }
  }
  async function regenerate(btn) {
    const ok = await ui.confirm('완료하지 않은 자동 항목을 새로 만들어요. 직접 추가한 항목과 완료한 항목은 그대로 둬요.', { ok: '다시 만들기' });
    if (!ok) return;
    busy(btn, true);
    try {
      const data = await REBOOT.api('/api/home/todos/generate', { auto: false, context: await buildContext() });
      S.todos = data;
      paintTodos();
      toast(data.warning || (data.origin === 'ai' ? 'AI가 이번 주 할 일을 다시 만들었어요 (참고용).' : '규칙으로 이번 주 할 일을 다시 만들었어요.'), data.warning ? 'error' : undefined);
    } catch (e) { toast(`할 일을 다시 만들지 못했어요: ${e.message}`, 'error'); }
    busy(btn, false);
  }
  async function toggleTodo(id, done, box) {
    const item = S.todos.items.find(i => String(i.id) === String(id));
    if (!item) return;
    try {
      const u = await REBOOT.api(`/api/home/todos/${encodeURIComponent(id)}`, { done }, { method: 'PATCH' });
      Object.assign(item, u);
      S.todos.items.sort((a, b) => (a.done - b.done));
      paintTodos();
    } catch (e) {
      if (box) box.checked = !done;
      toast(`완료 표시를 바꾸지 못했어요: ${e.message}`, 'error');
    }
  }
  async function deleteTodo(id) {
    const item = S.todos.items.find(i => String(i.id) === String(id));
    if (!item || !(await ui.confirm(`'${item.title}'을(를) 삭제할까요?`, { ok: '삭제', danger: true }))) return;
    try {
      await REBOOT.api(`/api/home/todos/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' });
      S.todos.items = S.todos.items.filter(i => i !== item);
      paintTodos();
    } catch (e) { toast(`할 일을 삭제하지 못했어요: ${e.message}`, 'error'); }
  }
  async function addTodo(form) {
    const title = form.querySelector('[name="title"]').value.trim();
    const reason = form.querySelector('[name="reason"]').value.trim();
    if (!title) { toast('할 일을 입력하세요.', 'error'); return; }
    const btn = form.querySelector('button[type="submit"]');
    busy(btn, true);
    try {
      const t = await REBOOT.api('/api/home/todos', { title, reason });
      S.todos.items.splice(S.todos.items.findIndex(i => i.done) < 0 ? S.todos.items.length : S.todos.items.findIndex(i => i.done), 0, t);
      form.reset();
      form.hidden = true;
      paintTodos();
    } catch (e) { toast(`할 일을 추가하지 못했어요: ${e.message}`, 'error'); }
    busy(btn, false);
  }

  /* ───────── 미국 시장 브리핑 (업계 뉴스 · 트렌드 · 시즌) ───────── */
  function newsBadges(n) {
    const out = [];
    if (n.running) out.push(badge('받는 중…', 'blue'));
    else if (n.status === 'failed') out.push(badge('받기 실패', 'red'));
    else if (n.status === 'partial') out.push(badge('일부 받기 실패', 'orange'));
    else if (n.status === 'never') out.push(badge('받기 전', 'orange'));
    if (n.ai) out.push(badge('AI 요약 · 참고용', 'purple'));
    else if (!n.aiReady) out.push(badge('AI 요약 연결 안 됨'));
    else if (n.aiStatus === 'error') out.push(badge('AI 요약 실패', 'orange'));
    return out.join(' ');
  }
  function articleLink(a, text) {
    return isUrl(a.url) ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
  }
  // 규제 기사는 컴플라이언스 탭으로 바로 (표시 문구 점검)
  const isRegulation = a => a.area === 'regulation' || a.topic === '규제·정책';
  const compLink = a => (isRegulation(a) ? `<a class="home-comp-link" href="/dashboard/compliance">컴플라이언스에서 문구 심의 ${icon('arrow')}</a>` : '');

  /* 기사 보관 (책갈피): /api/home/news/saved — 브리핑 아래 '보관함 N건'을 누르면 창으로 모아 봄 (openSaved) */
  const BOOKMARK = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4.2-6 4.2z"/></svg>';
  const savedOf = url => (S.saved || []).find(s => s.url === url);
  function saveBtn(a) {
    if (!isUrl(a.url) || !S.saved) return '';
    const on = !!savedOf(a.url);
    return `<button type="button" class="home-save${on ? ' on' : ''}" data-act="news-save" data-url="${esc(a.url)}" aria-pressed="${on}"
      aria-label="${on ? '보관 해제' : '보관'}" title="${on ? '보관됨 · 누르면 해제' : '보관 (브리핑 아래 보관함)'}">${BOOKMARK}</button>`;
  }
  async function loadSaved() {
    const r = await safe(() => REBOOT.api('/api/home/news/saved'));
    S.saved = r ? r.items || [] : null;
  }
  async function toggleSave(btn) {
    const url = btn.dataset.url;
    const a = ((S.news && S.news.ai && S.news.ai.items) || []).concat((S.news && S.news.articles) || []).find(x => x.url === url);
    const cur = savedOf(url);
    busy(btn, true);
    try {
      if (cur) {
        await REBOOT.api(`/api/home/news/saved/${cur.id}`, undefined, { method: 'DELETE' });
        S.saved = S.saved.filter(s => s.id !== cur.id);
        toast('보관을 해제했어요.');
      } else if (a) {
        const s = await REBOOT.api('/api/home/news/saved', { url, title: a.title, titleKo: a.titleKo || '', summaryKo: a.summaryKo || '',
          whyKo: a.whyKo || '', kind: a.kind || 'flow', areaLabel: areaText(a), domain: a.domain || '', date: a.date || '' });
        S.saved = [s].concat(S.saved.filter(x => x.url !== url));
        toast('보관했어요. 브리핑 아래 보관함에서 볼 수 있어요.');
      }
    } catch (e) { toast(`보관 상태를 바꾸지 못했어요: ${e.message}`, 'error'); }
    paintNews();
  }

  // 보관함 창: 검색(띄어쓰기로 나눈 낱말이 모두 들어간 기사, 대소문자 무시) + 업계 뉴스 / 트렌드 고르기 + 보관 해제
  const SAVED_KINDS = [['', '전체'], ['flow', '업계 뉴스'], ['trend', '트렌드'], ['season', '시즌']];
  const KIND_LABEL = { flow: '업계 뉴스', trend: '트렌드', season: '시즌' };
  const savedText = x => [x.titleKo, x.title, x.summaryKo, x.whyKo, x.domain, x.areaLabel, x.savedBy].join(' ').toLowerCase();
  function openSaved() {
    const f = { q: '', kind: '' };
    const box = doc.createElement('div');
    box.className = 'part-home home-saved';
    const ai = (S.saved || []).some(x => x.summaryKo || x.whyKo);
    box.innerHTML = `<div class="home-saved-tools"><input class="input" type="search" data-ref="saved-q" placeholder="제목 · 요약 · 마케터의 시선 · 매체 · 분야 검색" aria-label="보관한 기사 검색">
        <div class="linetabs" data-ref="saved-kinds" role="group" aria-label="기사 종류"></div></div><div data-ref="saved-list"></div>
      ${ai ? '<p class="panel-note mt-8">제목 · 요약 · 마케터의 시선은 AI가 정리했어요. 사실은 원문으로 확인해 주세요.</p>' : ''}`;
    const paint = () => {
      const items = S.saved || [];
      const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const byKind = items.filter(x => !f.kind || x.kind === f.kind);
      const rows = byKind.filter(x => { const t = savedText(x); return words.every(w => t.includes(w)); });
      const title = box.closest('.modal') && box.closest('.modal').querySelector('.modal-head h2');
      if (title) title.textContent = `보관한 기사 ${fmt.num(items.length)}건`;   // 보관 해제 뒤 숫자
      box.querySelector('[data-ref="saved-kinds"]').innerHTML = SAVED_KINDS.map(([k, l]) =>
        `<button type="button" aria-pressed="${f.kind === k}" data-kind="${k}">${esc(l)} <span class="n">${k ? items.filter(x => x.kind === k).length : items.length}</span></button>`).join('');
      // 찾은 낱말 강조: 원문을 낱말로 나눠 조각마다 esc (HTML 엔티티가 깨지지 않게)
      const re = words.length ? new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
      const mark = text => (re ? String(text == null ? '' : text).split(re).map((p, i) => (i % 2 ? `<mark>${esc(p)}</mark>` : esc(p))).join('') : esc(text));
      const li = x => `<li class="home-saved-item"><div class="home-saved-main">
          <b>${isUrl(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${mark(x.titleKo || x.title)}</a>` : mark(x.titleKo || x.title)}</b>
          ${x.summaryKo ? `<small>${mark(x.summaryKo)}</small>` : ''}
          ${x.whyKo ? `<small class="home-saved-why"><b>${x.kind === 'flow' ? '마케터의 시선' : '적용점'}</b> ${mark(x.whyKo)}</small>` : ''}
          <small>${[KIND_LABEL[x.kind] || '업계 뉴스', x.areaLabel, x.domain, x.date ? fmt.relative(x.date) : ''].filter(Boolean).map(mark).join(' · ')}</small>
          ${x.titleKo && x.title ? `<small lang="en">${mark(x.title)}</small>` : ''}
          <small class="muted">${esc(x.savedBy || '')} · ${esc(fmt.datetime(x.savedAt))} 보관</small></div>
        <button type="button" class="btn small home-saved-unsave" data-unsave="${esc(x.id)}" title="보관 해제">${BOOKMARK} 보관됨</button></li>`;
      box.querySelector('[data-ref="saved-list"]').innerHTML = !items.length
        ? '<p class="small muted mt-16">아직 보관한 기사가 없어요. 브리핑 기사 카드의 책갈피를 누르면 여기 모여요.</p>'
        : (words.length || f.kind ? `<p class="small muted home-saved-count">${byKind.length}건 중 ${rows.length}건</p>` : '') +
          (rows.length ? `<ul class="home-saved-list">${rows.map(li).join('')}</ul>` : `<p class="small muted mt-16">${words.length ? `'${esc(f.q)}'에 맞는 보관 기사가 없어요. 다른 낱말로 찾아보세요.` : '이 종류로 보관한 기사가 없어요.'}</p>`);
    };
    box.addEventListener('input', e => { if (e.target.dataset.ref === 'saved-q') { f.q = e.target.value; paint(); } });
    box.addEventListener('click', async e => {
      const k = e.target.closest('[data-kind]');
      if (k) { f.kind = k.dataset.kind; paint(); return; }
      const u = e.target.closest('[data-unsave]');
      if (!u) return;
      busy(u, true);
      try {
        await REBOOT.api(`/api/home/news/saved/${encodeURIComponent(u.dataset.unsave)}`, undefined, { method: 'DELETE' });
        S.saved = S.saved.filter(s => String(s.id) !== u.dataset.unsave);
        toast('보관을 해제했어요.');
        paint();
        paintNews();
      } catch (err) { toast(`보관을 해제하지 못했어요: ${err.message}`, 'error'); busy(u, false); }
    });
    paint();
    ui.modal({ title: `보관한 기사 ${fmt.num((S.saved || []).length)}건`, body: box, wide: true, actions: [{ label: '닫기', value: null }] });
  }
  // 목록은 처음 3개만. 나머지는 목록 끝 얇은 한 줄('N건 더 보기')로 그 자리에서 펼침 (펼친 기사도 위와 같은 모양: 제목 · → 마케터의 시선)
  // 업계 · 트렌드 칸마다 펼친 상태를 따로 기억
  const NEWS_SHOW = 3;
  function newsList(list, key = 'news', show = NEWS_SHOW) {
    if (list.length <= show) return list.join('');
    const open = !!S.newsOpen[key];
    return `${list.slice(0, show).join('')}<div class="home-rows-more" ${open ? '' : 'hidden'}>${list.slice(show).join('')}</div>
      <button type="button" class="home-news-more" data-act="news-more" data-key="${key}" aria-expanded="${open}">${open ? '접기' : `${list.length - show}건 더 보기`}<span class="home-news-more-ic" aria-hidden="true">${open ? '⌃' : '⌄'}</span></button>`;
  }

  // 검색어 점검 (최근 60일): 찾은 기사 · 규칙 통과 · 카드로 고른 수 · 교체 후보
  function queryStatsHtml(list, signals) {
    if (!list.length) return '';
    const sig = {};
    (signals || []).forEach(s => { sig[s.group] = s; });
    const change = q => { const s = sig[q.id]; return !s ? '' : `${s.surge ? badge('급증', 'orange') + ' ' : ''}${s.changePct != null ? esc(fmt.signed(s.changePct, 0, '%')) : '—'}`; };
    const flagged = list.filter(q => q.replace).length;
    const rows = list.map(q => `<tr><td>${esc(q.areaLabel)}${q.kind === 'signal' ? ' ' + badge('자리 보장', 'lime') : ''}</td>
      <td>${q.feed ? `${badge('업계지 피드')} ${esc(q.label)}` : `<code>${esc(q.query)}</code>`}</td><td class="num">${fmt.num(q.found)}</td><td class="num">${fmt.num(q.kept)}</td>
      <td class="num">${fmt.num(q.picked)}</td><td class="num">${change(q)}</td><td>${q.replace ? badge('교체 후보', 'orange') : ''}</td></tr>`).join('');
    return `<details class="home-qstats"><summary>검색어 점검 (최근 60일)${flagged ? ` · 교체 후보 ${flagged}개` : ''}</summary>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>분야</th><th>검색어 · 피드</th><th class="num">찾은 기사</th><th class="num">규칙 통과</th><th class="num">카드</th><th class="num" title="최근 7일 vs 그 전 7일 기사 수">보도 변화</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="panel-note">30일 동안 고른 기사가 0개면 교체 후보예요. 검색어 · 피드를 바꾸려면 홈 담당자에게 요청해 주세요.</p></details>`;
  }

  /* 미국 시장 브리핑 — 3초 안에 훑어보기 (2026-10-25 다시 설계)
     헤더 한 줄(제목 · 배송일 · 새 소식 · 업계/트렌드 · 새로고침) → 오늘의 핵심 1개(점수가 가장 높은 기사, 크게)
     → 나머지는 짧은 목록(번호 · 제목 · → 마케터의 시선 · 분야 · 시간 · 책갈피) → 하단 한 줄(보관함 · 수집 정보 · 검색어 점검)
     읽은 기사는 회색 (읽음 기록은 각자 브라우저에만: REBOOT.store('home') 'newsRead', 최근 300건) */
  const READ_MAX = 300;
  // 10.25 09:12 처럼 짧게 (내 컴퓨터 시간)
  function shortStamp(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const readSet = () => new Set(store.get('newsRead', []) || []);
  function markRead(url) {
    if (!isUrl(url)) return;
    const list = (store.get('newsRead', []) || []).filter(u => u !== url);
    list.unshift(url);
    store.set('newsRead', list.slice(0, READ_MAX));
  }
  const NEWS_KINDS = [['flow', '업계'], ['trend', '트렌드'], ['season', '시즌']];
  const newsKind = () => { const k = store.get('newsKind', 'flow'); return NEWS_KINDS.some(([id]) => id === k) ? k : 'flow'; };
  function kindTabs(k, counts) {
    const chip = (id, label, count) => `<button type="button" aria-pressed="${k === id}" data-act="news-kind" data-kind="${id}"${count ? '' : ' disabled'}>${label} <span class="n">${count}</span></button>`;
    return `<div class="linetabs home-kind" role="group" aria-label="뉴스 종류">${NEWS_KINDS.map(([id, label]) => chip(id, label, counts[id] || 0)).join('')}</div>`;
  }
  const viewLabel = a => (a.kind === 'trend' || a.kind === 'season' ? '적용점' : '마케터의 시선');
  // 분야 표시: 시즌 기사는 '🎃 Halloween'처럼 시즌 이모지 + 이름
  const areaText = a => (a.kind === 'season' ? `${seasonEmoji(a.season)[0]} ${a.season || '시즌'}` : a.areaLabel || a.topic || a.groupLabel || '');
  // 마우스를 올리면 보이는 설명: 요약 · 영어 원제목
  const tipText = a => [a.whyKo ? `${viewLabel(a)}: ${a.whyKo}` : '', a.summaryKo, a.titleKo && !a.fallback ? a.title : ''].filter(Boolean).join('\n');
  function leadHtml(a, read) {
    const meta = ['오늘의 핵심', areaText(a), a.domain, fmt.relative(a.date)].filter(Boolean).map(esc).join(' · ');
    return `<article class="home-lead${isUrl(a.url) ? ' home-news-card' : ''}${read ? ' read' : ''}"${isUrl(a.url) ? ` data-href="${esc(a.url)}"` : ''} title="${esc(a.titleKo && !a.fallback ? a.title : '')}">
        <div class="home-lead-top"><span class="home-lead-meta">${meta}${a.surge ? ` · <b>보도 급증</b>` : ''}</span>${saveBtn(a)}</div>
        <p class="home-lead-title">${articleLink(a, a.titleKo || a.title)}</p>
        ${a.summaryKo ? `<p class="home-lead-sum">${esc(a.summaryKo)}</p>` : ''}
        ${a.whyKo ? `<p class="home-lead-view"><span class="sr-only">${viewLabel(a)}: </span>${esc(a.whyKo)}</p>` : ''}
        ${compLink(a)}
      </article>`;
  }
  function rowHtml(a, i, read) {
    const side = [areaText(a), fmt.relative(a.date)].filter(Boolean).map(esc).join(' · ');
    return `<article class="home-row${isUrl(a.url) ? ' home-news-card' : ''}${read ? ' read' : ''}"${isUrl(a.url) ? ` data-href="${esc(a.url)}"` : ''} title="${esc(tipText(a))}">
        <span class="home-row-no">${i}</span>
        <div class="home-row-main"><p class="home-row-title">${articleLink(a, a.titleKo || a.title)}${a.fallback ? ' ' + badge('요약 없음') : ''}</p>
          ${a.whyKo ? `<p class="home-row-view"><span aria-hidden="true">→</span> <span class="sr-only">${viewLabel(a)}: </span>${esc(a.whyKo)}</p>` : a.domain && !a.titleKo ? `<p class="home-row-view">${esc(a.domain)}</p>` : ''}
          ${compLink(a)}</div>
        <span class="home-row-side">${a.surge ? '<b>급증</b> · ' : ''}${side}</span>${saveBtn(a)}</article>`;
  }

  function paintNews() {
    const n = S.news;
    if (!n) return;
    const body = ref('news-body');
    busy(ref('news-collect'), !!n.running);
    const read = readSet();
    const all = n.ai ? (n.ai.items || []) : (n.articles || []);
    const by = { flow: all.filter(a => a.kind !== 'trend' && a.kind !== 'season'), trend: all.filter(a => a.kind === 'trend'), season: all.filter(a => a.kind === 'season') };
    const counts = { flow: by.flow.length, trend: by.trend.length, season: by.season.length };
    const want = newsKind();
    const k = counts[want] ? want : (NEWS_KINDS.find(([id]) => counts[id]) || ['flow'])[0];   // 고른 칸이 비면 기사가 있는 첫 칸
    const list = by[k];
    const unread = n.lastSuccessAt ? all.filter(a => isUrl(a.url) && !read.has(a.url)).length : 0;
    const sub = n.running ? '받는 중…' : n.lastSuccessAt ? [`${shortStamp(n.lastSuccessAt)} 배송`, unread ? `새 소식 ${unread}` : ''].filter(Boolean).join(' · ') : '';
    ref('news-sub').textContent = sub;
    if (!n.lastSuccessAt && !(n.articles || []).length) {
      const msg = n.running ? '첫 브리핑을 준비하고 있어요 (보통 1분 안팎).'
        : n.status === 'never' ? '아직 받은 브리핑이 없어요. 오른쪽 위 최신 데이터 받기를 누르면 보통 1분 안팎 걸려요.'
          : '아직 받은 브리핑이 없어요 (마지막 받기 실패). 잠시 뒤 최신 데이터 받기를 다시 눌러 주세요.';
      body.innerHTML = ui.empty(msg, 'mail');
    } else if (!list.length) {
      body.innerHTML = `<p class="panel-note home-brief-empty">${n.ai ? '이번에는 마케팅과 관련된 기사를 찾지 못했어요.' : '최근 7일 기사가 없어요.'}</p>`;
    } else {
      // AI 요약이 있으면 점수가 가장 높은 기사를 '오늘의 핵심'으로 크게, 나머지는 짧은 목록
      const lead = n.ai ? list.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] : null;
      const rest = list.filter(a => a !== lead);
      const rows = rest.map((a, i) => rowHtml(a, i + (lead ? 2 : 1), read.has(a.url)));
      body.innerHTML = `${lead ? leadHtml(lead, read.has(lead.url)) : ''}${rows.length ? `<div class="home-rows">${newsList(rows, k)}</div>` : ''}
        ${!n.ai ? (n.aiReady ? (n.aiStatus === 'error' ? `<p class="note warn mt-8">AI 요약을 만들지 못했어요: ${esc(n.aiError)} — 다음에 받을 때 다시 시도해요.</p>` : '')
          : '<p class="panel-note mt-8">지금은 최근 기사 제목만 보여 줘요(관련 없는 기사가 섞일 수 있어요). 설정 › 연결에 OpenAI 키를 넣으면 관련 기사만 골라 정리해요.</p>') : ''}`;
    }
    ref('news-tabs').innerHTML = n.ai && all.length ? kindTabs(k, counts) : '';
    const last = n.lastRun;
    const bits = [];
    if (n.issueNo) bits.push(`REBOOT 마켓 레터 제 ${fmt.num(n.issueNo)}호`);
    if (n.running) bits.push('구글 뉴스 · 업계지에서 받는 중… 끝나면 자동으로 바뀌어요');
    else if (last) {
      bits.push(`마지막 수집 ${fmt.datetime(last.finishedAt || last.startedAt)}${last.trigger === 'daily' ? ' (자동)' : ''}`);
      if (n.status === 'failed' && n.lastSuccessAt) bits.push(`마지막 성공 ${fmt.datetime(n.lastSuccessAt)}`);
    }
    if (n.articleCount7d) bits.push(`최근 7일 기사 ${fmt.num(n.articleCount7d)}건`);
    ref('news-saved').innerHTML = S.saved ? `<button type="button" class="home-saved-open" data-act="saved-open">${BOOKMARK} 보관함 ${fmt.num(S.saved.length)}건</button>` : '';
    ref('news-badges').innerHTML = newsBadges(n);
    ref('news-meta').textContent = bits.join(' · ');
    const errs = last && !n.running && (n.status === 'failed' || n.status === 'partial') ? (last.errors || []) : [];
    ref('news-errors').innerHTML = errs.length ? `<details class="home-errors"><summary>실패 이유 ${errs.length}건</summary><ul>${errs.slice(0, 6).map(e => `<li>${esc(e)}</li>`).join('')}</ul></details>` : '';
    ref('news-note').textContent = n.limitNote || '';
    ref('news-stats').innerHTML = queryStatsHtml(n.queryStats || [], n.signals);
    paintHero();
  }
  async function loadNews() {
    try {
      const [n] = await Promise.all([REBOOT.api('/api/home/news'), loadSaved()]);
      S.news = n;
      paintNews();
      if (S.news.running) startPolling();
    } catch (e) {
      ref('news-body').innerHTML = `<p class="note error">뉴스를 불러오지 못했어요. ${esc(e.message)}</p>`;
    }
  }
  function startPolling() {
    if (S.poll) return;
    const started = Date.now();
    S.poll = setInterval(async () => {
      if (!S.root || !doc.body.contains(S.root) || Date.now() - started > 10 * 60 * 1000) { clearInterval(S.poll); S.poll = null; return; }
      const st = await safe(() => REBOOT.api('/api/home/news/status'));
      if (!st || st.running) return;
      clearInterval(S.poll);
      S.poll = null;
      await loadNews();
      const ok = st.lastRun && st.lastRun.status !== 'failed';
      toast(ok ? '최신 뉴스를 받았어요.' : '뉴스를 새로 받지 못했어요. 마지막 결과를 그대로 보여 줘요.', ok ? undefined : 'error');
      paintActivity();
    }, 4000);
  }
  async function collectNews(btn) {
    busy(btn, true);
    try {
      await REBOOT.api('/api/home/news/collect', {});
      toast('최신 뉴스를 받기 시작했어요. 보통 1분 안팎 걸려요.');
      S.news = Object.assign({}, S.news, { running: true });
      paintNews();
      startPolling();
    } catch (e) {
      toast(`최신 뉴스를 받지 못했어요: ${e.message}`, 'error');
      busy(btn, false);
      if (e.status === 409) startPolling();
    }
  }

  /* ───────── 화면 ───────── */
  /* 홈의 하위 화면: 데일리 브리핑 · 콘텐츠 캘린더
     탭 줄(role="tablist")은 core.js가 왼쪽 메뉴로 옮겨 보여 줍니다. 주소 #briefing · #calendar로 바로 열 수 있음 */
  const VIEWS = [['briefing', '데일리 브리핑', 'chart'], ['calendar', '콘텐츠 캘린더', 'calendar']];
  const viewFromHash = () => { const h = (global.location.hash || '').replace('#', ''); return VIEWS.some(v => v[0] === h) ? h : null; };
  const koDate = iso => `${iso.slice(0, 4)}년 ${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일 ${WEEKDAY[dow(iso)]}요일`;
  function userName() { const u = REBOOT.user(); return u.name || String(u.email || '').split('@')[0] || ''; }

  function paintHeading(id) {
    const page = REBOOT.page;
    const actions = page.actions();
    const ws = weekStartOf(REBOOT.today());
    page.heading(true);
    if (id === 'briefing') {
      page.title('오늘의 흐름을 읽고, 다음을 준비해요.');
      page.subtitle(`${koDate(REBOOT.today())} · ${userName()}님을 위한 데일리 브리핑`);
      if (actions) actions.innerHTML = `<span class="btn" role="note" aria-label="이번 주">${icon('calendar')} ${esc(ws.replace(/-/g, '. '))} — ${esc(md(addDays(ws, 6)).replace('.', '. '))}</span>
        <button type="button" class="btn" data-go-view="calendar">${icon('calendar')} 콘텐츠 캘린더</button>`;
    } else if (id === 'calendar') {
      page.title('콘텐츠의 타이밍을, 한눈에.');
      page.subtitle('미국 시즌과 준비 기간을 함께 보며 다음 게시물을 준비하세요.');
      if (actions) actions.innerHTML = `<a class="btn" href="/dashboard/settings#collect">${icon('edit')} 시즌 편집</a>
        <button type="button" class="btn lime" data-go-view="briefing">${icon('chart')} 데일리 브리핑</button>`;
    } else if (actions) actions.innerHTML = '';
  }
  function paintBriefing() {
    paintHero();
    paintSeasons();
    paintMiniCalendar();
    paintActivity();
    loadNews();
    const noop = () => {};
    paintGlance().catch(noop).then(loadTodos);
    loadSignals();
  }
  function showView(id, opts) {
    S.view = id;
    S.root.querySelectorAll('[data-view]').forEach(b => {
      const on = b.dataset.view === id;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('active', on);
      b.tabIndex = on ? 0 : -1;
    });
    S.root.querySelectorAll('[data-view-panel]').forEach(p => { p.hidden = p.dataset.viewPanel !== id; });
    paintHeading(id);
    if (id === 'briefing' && !S.briefing) { S.briefing = true; paintBriefing(); }
    if (id === 'calendar') { paintCalendar(); paintSurge(); }
    if (!opts || opts.hash !== false) {
      const h = `#${id}`;
      if ((global.location.hash || '') !== h && global.history && global.history.replaceState) {
        global.history.replaceState(null, '', global.location.pathname + global.location.search + h);
      }
    }
  }

  function render(root) {
    S.root = root;
    root.classList.add('part-home');
    root.innerHTML = `
      <div class="subtabs" role="tablist" aria-label="홈 화면">${VIEWS.map(([id, label, ic]) =>
        `<button type="button" role="tab" data-view="${id}" data-icon="${ic}" aria-selected="false">${esc(label)}</button>`).join('')}</div>

      <div data-view-panel="briefing" role="tabpanel" hidden>
        <section class="brief-hero" data-go-view="calendar" title="콘텐츠 캘린더 보기">
          <div><span class="eyebrow">YOUR DAILY START</span><h2 data-ref="hero-title">—</h2>
            <p>시장 신호 · 시즌 · 고객 응대를 모아 이번 주 우선순위를 정리했어요.</p>
            <div class="flex wrap" style="margin-top:19px"><a class="btn lime" href="/dashboard/content">${icon('spark')} 캠페인 준비하기</a>
              <a class="btn" href="/dashboard/insights">시장 인사이트 보기</a></div></div>
          <div class="hero-stat">
            <div><strong data-ref="hero-urgent">—</strong><small>긴급</small></div>
            <div><strong data-ref="hero-chance">—</strong><small>기회</small></div>
            <div><strong data-ref="hero-season">—</strong><small>다음 주요 시즌</small></div>
          </div>
        </section>
        <div class="home-top4 section-gap">
          <section class="card home-mini-cal" data-ref="mini-cal" aria-label="콘텐츠 캘린더 (작게)"></section>
          <section class="card"><div class="card-head"><h2>다가오는 시즌</h2><button type="button" class="link small" data-go-view="calendar">캘린더 ${icon('arrow')}</button></div>
            <div class="home-seasons home-box-body" data-ref="seasons"></div></section>
          <section class="card"><div class="card-head"><h2>한눈에 보기</h2></div>
            <div class="home-glance home-box-body" data-ref="glance"><div class="skeleton" style="height:96px"></div></div></section>
          <section class="card"><div class="card-head"><h2>최근 워크스페이스 활동</h2></div><ul class="activity home-box-body" data-ref="activity"><li>불러오는 중…</li></ul></section>
        </div>
        <div class="home-main2 section-gap">
            <section class="card home-brief" aria-label="미국 시장 브리핑">
              <div class="home-brief-head"><div class="home-brief-title"><h2>미국 시장 브리핑</h2><span class="head-cap" data-ref="news-sub"></span></div>
                <button type="button" class="icon-btn home-brief-refresh" data-ref="news-collect" data-act="news-collect" aria-label="최신 데이터 받기" title="최신 데이터 받기">${icon('refresh')}</button></div>
              <div class="home-brief-tabs" data-ref="news-tabs"></div>
              <div data-ref="news-body"><div class="skeleton" style="height:120px"></div></div>
              <div data-ref="news-errors"></div>
              <div class="home-brief-foot"><span class="home-brief-saved" data-ref="news-saved"></span><span class="flex home-news-badges" data-ref="news-badges"></span>
                <details class="home-brief-info"><summary>수집 정보 · 검색어 점검</summary>
                  <p class="panel-note" data-ref="news-meta"></p><p class="panel-note" data-ref="news-note"></p><div data-ref="news-stats"></div></details></div>
            </section>
            <section class="card">
              <div class="card-head home-todo-head"><h2>이번 주 할 일<span class="head-cap" data-ref="todo-count"></span></h2>
                <div class="flex"><button type="button" class="btn small ghost" data-act="todo-regen" title="완료 안 한 자동 항목을 새로 만들기">${icon('refresh')} 다시 만들기</button>
                <button type="button" class="icon-btn" data-act="todo-add" aria-label="할 일 추가">${icon('plus')}</button></div></div>
              <p class="panel-note home-todo-meta" data-ref="todo-meta"></p>
              <form class="home-todo-form" data-ref="todo-form" hidden>
                <input class="input" name="title" maxlength="200" placeholder="할 일 (예: 핼러윈 릴스 2편 게시)" aria-label="할 일">
                <input class="input" name="reason" maxlength="500" placeholder="근거 (선택)" aria-label="근거">
                <div class="flex"><button type="submit" class="btn small lime">추가</button><button type="button" class="btn small ghost" data-act="todo-cancel">취소</button></div>
              </form>
              <div data-ref="todos"><div class="skeleton" style="height:120px"></div></div>
            </section>
        </div>
      </div>

      <div data-view-panel="calendar" role="tabpanel" hidden><div data-ref="calendar"></div><div data-ref="surge"></div></div>`;

    root.addEventListener('click', e => {
      const v = e.target.closest('a') ? null : e.target.closest('[data-view], [data-go-view]');
      if (v) {
        if (v.dataset.month) S.calMonth = v.dataset.month;
        showView(v.dataset.view || v.dataset.goView);
        if (v.dataset.goView && global.scrollTo) global.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const card = e.target.closest('.home-news-card');
      if (card && !e.target.closest('button, .home-comp-link')) {
        markRead(card.dataset.href);
        if (!e.target.closest('a')) global.open(card.dataset.href, '_blank', 'noopener');
        paintNews();
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      const row = b.closest('[data-id]');
      if (act === 'season-go') { e.preventDefault(); goContent(b.dataset.name, b.dataset.start); }
      else if (act === 'todo-toggle') toggleTodo(row.dataset.id, b.checked, b);
      else if (act === 'todo-del') deleteTodo(row.dataset.id);
      else if (act === 'todo-regen') regenerate(b);
      else if (act === 'todo-add') { const f = ref('todo-form'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('[name="title"]').focus(); }
      else if (act === 'todo-cancel') { ref('todo-form').hidden = true; }
      else if (act === 'news-collect') collectNews(b);
      else if (act === 'news-save') toggleSave(b);
      else if (act === 'saved-open') openSaved();
      else if (act === 'news-kind') { store.set('newsKind', b.dataset.kind); paintNews(); }
      else if (act === 'news-more') { const k = b.dataset.key || 'news'; S.newsOpen[k] = !S.newsOpen[k]; paintNews(); }
      else if (act === 'cal-prev') moveMonth(-1);
      else if (act === 'cal-next') moveMonth(1);
      else if (act === 'cal-today') { S.calMonth = ''; paintCalendar(); }
      else if (act === 'mini-prev' || act === 'mini-next') { S.miniMonth = shiftMonth(S.miniMonth || REBOOT.today().slice(0, 7), act === 'mini-prev' ? -1 : 1); paintMiniCalendar(); }
    });
    const actions = REBOOT.page.actions();
    if (actions) actions.addEventListener('click', e => {
      const v = e.target.closest('[data-go-view]');
      if (v) showView(v.dataset.goView);
    });
    ref('todo-form').addEventListener('submit', e => { e.preventDefault(); addTodo(e.currentTarget); });
    global.addEventListener('hashchange', () => { const v = viewFromHash() || 'briefing'; if (v !== S.view) showView(v, { hash: false }); });
    showView(viewFromHash() || 'briefing', { hash: false });
  }

  /* ───────── 이번 주 To-Do 버튼 (모든 화면 오른쪽 아래) ─────────
     버튼 → 오른쪽 사이드 패널: 세 묶음을 각각 접고 펼침 (열 때마다 모두 접은 상태로 시작)
     - 이번 주 할 일: 확인 · 체크 · 직접 추가 · 고치기 · 지우기 (다시 만들기는 데일리 브리핑에서)
     - 저장한 뉴스: 기사 주소 · 제목으로 저장 · 보관 해제 (홈 브리핑 '보관함'과 같은 목록 /api/home/news/saved)
     - 인사이트 자료: 인사이트 탭 자료를 노란 버튼 · 이 묶음으로 끌어다 놓거나 [패널에 담기] → /api/home/dock/items
       끌 때 넘기는 값: dataTransfer 'application/x-reboot-insight' = {kind, sourceKey, title, text, data, href, url} (DOCK_MIME)
       다른 탭은 REBOOT.use('home').dockAdd(payload) · dockItems(kind) 로 씀 (콘텐츠 제작에서 참고용으로 읽을 예정)
     홈 화면이 열려 있으면 브리핑의 To-Do 카드 · 보관 표시를 함께 고침 */
  const DOCK_MIME = 'application/x-reboot-insight';
  const dock = (() => {
    const D = { el: null, todos: null, signals: null, saved: null, notes: null, kinds: {}, open: false, loading: false };
    const hasDockData = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(DOCK_MIME));
    const q = name => D.el && D.el.querySelector(`[data-dock="${name}"]`);

    function itemHtml(t) {
      if (String(D.editing) === String(t.id)) {   // 패널에서 바로 고치기 (제목 · 근거)
        return `<form class="home-dock-form home-dock-edit" data-dock="todo-edit" data-id="${esc(t.id)}">
          <input class="input" name="title" maxlength="200" value="${esc(t.title)}" aria-label="할 일">
          <input class="input" name="reason" maxlength="500" value="${esc(t.reason || '')}" placeholder="근거 (선택)" aria-label="근거">
          <span class="flex"><button type="submit" class="btn small lime">저장</button><button type="button" class="btn small" data-dock-edit-cancel>취소</button></span></form>`;
      }
      return `<label class="home-dock-item${t.done ? ' done' : ''}" data-id="${esc(t.id)}">
        <input type="checkbox" data-dock-toggle${t.done ? ' checked' : ''} aria-label="완료 표시: ${esc(t.title)}">
        <span class="grow"><span class="home-dock-title">${esc(t.title)}</span><span class="home-dock-reason">근거: ${esc(t.reason || '—')}</span></span>
        <button type="button" class="home-dock-close" data-dock-edit aria-label="수정: ${esc(t.title)}" title="수정">${icon('edit')}</button>
        <button type="button" class="home-dock-close" data-dock-del aria-label="삭제: ${esc(t.title)}" title="삭제">${icon('x')}</button></label>`;
    }
    // 인사이트 긴급 · 기회 (읽기 전용) — 누르면 근거 화면
    function signalHtml(x) {
      return `<a class="home-dock-item home-dock-signal ${x.grade === '긴급' ? 'urgent' : 'chance'}" href="${esc(x.href)}">
        <span class="home-grade">${esc(x.grade)}</span><span class="grow"><span class="home-dock-title">${esc(x.title)}</span><span class="home-dock-reason">${esc(x.src)}에서 근거 보기</span></span></a>`;
    }
    function newsHtml(x) {
      const title = x.titleKo || x.title;
      return `<div class="home-dock-item home-dock-news" data-sid="${esc(x.id)}">
        <span class="grow">${isUrl(x.url) ? `<a class="home-dock-title" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>` : `<span class="home-dock-title">${esc(title)}</span>`}
          <span class="home-dock-reason">${esc([x.domain, x.savedBy, x.savedAt ? fmt.date(x.savedAt) : ''].filter(Boolean).join(' · '))}</span></span>
        <button type="button" class="home-dock-close" data-dock-unsave aria-label="보관 해제: ${esc(title)}">${icon('x')}</button></div>`;
    }
    function noteHtml(x) {
      return `<div class="home-dock-item home-dock-note" data-nid="${esc(x.id)}">
        <span class="grow"><span class="home-dock-kind">${esc(D.kinds[x.kind] || x.kind)}</span><span class="home-dock-title">${esc(x.title)}</span>
          ${x.text ? `<span class="home-dock-note-text">${esc(x.text)}</span>` : ''}
          <span class="home-dock-reason">${x.href ? `<a href="${esc(x.href)}">근거 보기</a> · ` : ''}${isUrl(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">링크</a> · ` : ''}${esc([x.savedBy, x.savedAt ? fmt.date(x.savedAt) : ''].filter(Boolean).join(' · '))}</span></span>
        <button type="button" class="home-dock-close" data-dock-unnote aria-label="삭제: ${esc(x.title)}">${icon('x')}</button></div>`;
    }
    function paint() {
      if (!D.el) return;
      const t = D.todos;
      const sig = D.signals ? D.signals.items.slice().sort((a, b) => (a.grade === '긴급' ? 0 : 1) - (b.grade === '긴급' ? 0 : 1)) : [];
      const open = (t ? t.items.filter(i => !i.done).length : 0) + sig.length;
      const count = q('count');
      count.textContent = open > 99 ? '99+' : String(open);
      count.hidden = !t || open <= 0;
      q('left').textContent = open ? `${open}개 남음` : '';
      q('meta').textContent = t ? `${md(t.week.start)} — ${md(t.week.end)}` : '';
      const list = q('list');
      if (!t) list.innerHTML = D.loading ? '<div class="skeleton" style="height:120px"></div>' : '';
      else {
        list.innerHTML = !t.generated && !t.items.length
          ? ui.empty('이번 주 할 일이 아직 없어요. 아래에서 직접 추가하거나 데일리 브리핑을 열면 자동으로 만들어져요.', 'check')
          : t.items.length || sig.length ? sig.map(signalHtml).join('') + t.items.map(itemHtml).join('') : ui.empty('이번 주 할 일이 없어요.', 'check');
      }
      const sv = D.saved;
      q('news-n').textContent = sv ? `${sv.length}건` : '';
      q('news').innerHTML = !sv ? (D.loading ? '<div class="skeleton" style="height:60px"></div>' : '')
        : sv.length ? sv.map(newsHtml).join('') : '<p class="small muted">저장한 뉴스가 없어요. 기사 주소와 제목을 넣어 저장하세요.</p>';
      const nt = D.notes;
      q('notes-n').textContent = nt ? `${nt.length}건` : '';
      q('notes').innerHTML = !nt ? (D.loading ? '<div class="skeleton" style="height:60px"></div>' : '')
        : nt.length ? nt.map(noteHtml).join('') : '';
    }
    async function load() {
      D.loading = true;
      paint();
      try {
        const [t, sig, sv, nt] = await Promise.all([REBOOT.api('/api/home/todos'), safe(() => REBOOT.use('insights').weeklySignals()),
          safe(() => REBOOT.api('/api/home/news/saved')), safe(() => REBOOT.api('/api/home/dock/items'))]);
        D.todos = t;
        D.signals = sig;
        D.saved = sv ? sv.items || [] : [];
        D.notes = nt ? nt.items || [] : [];
        if (nt) D.kinds = nt.kinds || {};
      }
      catch (e) { const list = q('list'); if (list) list.innerHTML = `<p class="note error">할 일을 불러오지 못했어요. ${esc(e.message)}</p>`; return; }
      finally { D.loading = false; }
      paint();
    }
    function setOpen(on) {
      D.open = on;
      q('panel').hidden = !on;
      q('scrim').hidden = !on;
      q('fab').setAttribute('aria-expanded', String(on));
      // 열 때마다 세 묶음 모두 접은 상태로 시작
      if (on) { D.el.querySelectorAll('.home-dock-sec').forEach(s => { s.open = false; }); D.editing = null; load(); q('close').focus(); } else q('fab').focus();
    }
    async function toggle(box) {
      const id = box.closest('[data-id]').dataset.id;
      const done = box.checked;
      try {
        const u = await REBOOT.api(`/api/home/todos/${encodeURIComponent(id)}`, { done }, { method: 'PATCH' });
        [D.todos, S.todos].forEach(t => {
          const it = t && t.items.find(i => String(i.id) === String(id));
          if (it) { Object.assign(it, u); t.items.sort((a, b) => (a.done - b.done)); }
        });
        if (S.root && S.todos) paintTodos(); else paint();
      } catch (e) { box.checked = !done; toast(`완료 표시를 바꾸지 못했어요: ${e.message}`, 'error'); }
    }
    async function addTodo(form) {
      const title = form.elements.title.value.trim();
      if (!title) { toast('할 일을 입력하세요.', 'error'); form.elements.title.focus(); return; }
      const btn = form.querySelector('button[type="submit"]');
      busy(btn, true);
      try {
        const t = await REBOOT.api('/api/home/todos', { title, reason: form.elements.reason.value.trim() });
        // 홈 화면이 열려 있으면 같은 목록(S.todos)에도 — 완료한 항목 앞에 넣음
        [D.todos, S.todos].filter((x, i, a) => x && a.indexOf(x) === i).forEach(w => {
          const at = w.items.findIndex(i => i.done);
          w.items.splice(at < 0 ? w.items.length : at, 0, Object.assign({}, t));
        });
        form.reset();
        toast('할 일을 추가했어요.');
        if (S.root && S.todos) paintTodos(); else paint();
      } catch (e) { toast(`할 일을 추가하지 못했어요: ${e.message}`, 'error'); }
      busy(btn, false);
    }
    // 패널에서 할 일 고치기 · 지우기 → 홈 화면이 열려 있으면 같은 목록(S.todos)도
    async function saveEdit(form) {
      const id = form.dataset.id, title = form.elements.title.value.trim();
      if (!title) { toast('할 일을 입력하세요.', 'error'); form.elements.title.focus(); return; }
      const btn = form.querySelector('button[type="submit"]');
      busy(btn, true);
      try {
        const u = await REBOOT.api(`/api/home/todos/${encodeURIComponent(id)}`, { title, reason: form.elements.reason.value.trim() }, { method: 'PATCH' });
        [D.todos, S.todos].forEach(t => { const it = t && t.items.find(i => String(i.id) === String(id)); if (it) Object.assign(it, u); });
        D.editing = null;
        toast('할 일을 고쳤어요.');
        if (S.root && S.todos) paintTodos(); else paint();
      } catch (e) { busy(btn, false); toast(`할 일을 고치지 못했어요: ${e.message}`, 'error'); }
    }
    async function removeTodo(btn) {
      const id = btn.closest('[data-id]').dataset.id;
      busy(btn, true);
      try {
        await REBOOT.api(`/api/home/todos/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' });
        [D.todos, S.todos].filter((x, i, a) => x && a.indexOf(x) === i).forEach(t => { t.items = t.items.filter(i => String(i.id) !== String(id)); });
        toast('할 일을 지웠어요.');
        if (S.root && S.todos) paintTodos(); else paint();
      } catch (e) { busy(btn, false); toast(`할 일을 지우지 못했어요: ${e.message}`, 'error'); }
    }
    // 홈 브리핑의 보관 표시도 같이 (홈이 열려 있을 때만)
    function syncHome() {
      if (S.root && S.saved) { S.saved = D.saved.slice(); paintNews(); }
    }
    async function saveNews(form) {
      const url = form.elements.url.value.trim(), title = form.elements.title.value.trim();
      if (!isUrl(url)) { toast('기사 주소(http/https)를 넣으세요.', 'error'); form.elements.url.focus(); return; }
      if (!title) { toast('기사 제목을 넣으세요.', 'error'); form.elements.title.focus(); return; }
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { domain = ''; }
      const btn = form.querySelector('button[type="submit"]');
      busy(btn, true);
      try {
        const s = await REBOOT.api('/api/home/news/saved', { url, title, domain });
        D.saved = [s].concat((D.saved || []).filter(x => x.url !== s.url));
        form.reset();
        toast('뉴스를 저장했어요.');
        paint();
        syncHome();
      } catch (e) { toast(`뉴스를 저장하지 못했어요: ${e.message}`, 'error'); }
      busy(btn, false);
    }
    async function unsave(btn) {
      const id = btn.closest('[data-sid]').dataset.sid;
      busy(btn, true);
      try {
        await REBOOT.api(`/api/home/news/saved/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' });
        D.saved = D.saved.filter(x => String(x.id) !== id);
        toast('보관을 해제했어요.');
        paint();
        syncHome();
      } catch (e) { busy(btn, false); toast(`보관을 해제하지 못했어요: ${e.message}`, 'error'); }
    }
    // 인사이트 자료 담기 (끌어다 놓기 · [패널에 담기] · 다른 탭 dockAdd 공통) → 저장한 한 줄
    async function addNote(p) {
      if (!p || !p.title || !p.sourceKey) { toast('담을 수 없는 자료예요.', 'error'); return null; }
      try {
        const r = await REBOOT.api('/api/home/dock/items', p);
        D.notes = [r].concat((D.notes || []).filter(x => x.id !== r.id));
        if (!D.kinds[r.kind]) { const k = await safe(() => REBOOT.api('/api/home/dock/items?kind=_')); if (k) D.kinds = k.kinds || {}; }
        toast(`'${r.title}'을(를) 인사이트 자료에 담았어요.`);
        paint();
        return r;
      } catch (e) { toast(`인사이트 자료를 담지 못했어요: ${e.message}`, 'error'); return null; }
    }
    async function removeNote(btn) {
      const id = btn.closest('[data-nid]').dataset.nid;
      busy(btn, true);
      try {
        await REBOOT.api(`/api/home/dock/items/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' });
        D.notes = D.notes.filter(x => String(x.id) !== id);
        toast('인사이트 자료에서 뺐어요.');
        paint();
      } catch (e) { busy(btn, false); toast(`삭제하지 못했어요: ${e.message}`, 'error'); }
    }
    // 끌어다 놓기: 끌기 시작하면 노란 버튼을 강조 → 버튼 위로 오면 패널 · 인사이트 자료 묶음을 열고 → 패널 안에 놓으면 담기
    function openNotes() {
      if (!D.open) setOpen(true);
      const sec = D.el.querySelector('.home-dock-sec[data-sec="insight"]');
      if (sec) sec.open = true;
    }
    function bindDrop() {
      doc.addEventListener('dragstart', e => { if (hasDockData(e)) doc.body.classList.add('home-dock-dragging'); });
      doc.addEventListener('dragend', () => { doc.body.classList.remove('home-dock-dragging'); D.el.querySelector('.home-dock-panel').classList.remove('drop-on'); });
      const fab = q('fab'), panel = q('panel');
      ['dragenter', 'dragover'].forEach(ev => {
        fab.addEventListener(ev, e => { if (!hasDockData(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; openNotes(); });
        panel.addEventListener(ev, e => { if (!hasDockData(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; panel.classList.add('drop-on'); });
      });
      panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-on'); });
      const drop = e => {
        if (!hasDockData(e)) return;
        e.preventDefault();
        panel.classList.remove('drop-on');
        doc.body.classList.remove('home-dock-dragging');
        let p = null;
        try { p = JSON.parse(e.dataTransfer.getData(DOCK_MIME)); } catch (err) { p = null; }
        openNotes();
        addNote(p);
      };
      fab.addEventListener('drop', drop);
      panel.addEventListener('drop', drop);
    }
    function mount() {
      if (D.el || !doc.body || !REBOOT.user || !REBOOT.user()) return;
      D.el = doc.createElement('div');
      D.el.className = 'home-dock';
      D.el.innerHTML = `
        <button type="button" class="home-fab" data-dock="fab" aria-expanded="false" aria-controls="home-dock-panel" aria-label="이번 주 할 일 열기">
          ${icon('check')}<span class="home-fab-count" data-dock="count" hidden></span></button>
        <div class="home-dock-scrim" data-dock="scrim" hidden></div>
        <aside class="home-dock-panel" id="home-dock-panel" data-dock="panel" role="dialog" aria-modal="true" aria-labelledby="home-dock-title" hidden>
          <div class="home-dock-head"><h2 id="home-dock-title">이번 주</h2>
            <button type="button" class="home-dock-close" data-dock="close" aria-label="닫기">${icon('x')}</button></div>
          <div class="home-dock-body">
            <details class="home-dock-sec" data-sec="todo">
              <summary>이번 주 할 일<span class="head-cap" data-dock="left"></span></summary>
              <p class="panel-note" data-dock="meta"></p>
              <div class="home-dock-list" data-dock="list"></div>
              <form class="home-dock-form" data-dock="todo-form">
                <input class="input" name="title" maxlength="200" placeholder="할 일 (예: 핼러윈 릴스 2편 게시)" aria-label="할 일">
                <input class="input" name="reason" maxlength="500" placeholder="근거 (선택)" aria-label="근거">
                <button type="submit" class="btn small lime">${icon('plus')} 할 일 추가</button>
              </form>
            </details>
            <details class="home-dock-sec" data-sec="news">
              <summary>저장한 뉴스<span class="head-cap" data-dock="news-n"></span></summary>
              <form class="home-dock-form" data-dock="news-form">
                <input class="input" name="url" type="url" maxlength="1000" placeholder="기사 주소 (https://…)" aria-label="기사 주소">
                <input class="input" name="title" maxlength="500" placeholder="기사 제목" aria-label="기사 제목">
                <button type="submit" class="btn small lime">${icon('plus')} 뉴스 저장</button>
              </form>
              <div class="home-dock-list" data-dock="news"></div>
            </details>
            <details class="home-dock-sec" data-sec="insight">
              <summary>인사이트 자료<span class="head-cap" data-dock="notes-n"></span></summary>
              <div class="home-dock-drop">인사이트 탭의 자료를 이 패널이나 노란 버튼으로 끌어다 놓으면 담겨요. 끌기 어려우면 자료 옆 [패널에 담기]를 누르세요.</div>
              <div class="home-dock-list" data-dock="notes"></div>
              <div class="home-dock-tools">${ui.fileMenu('download', { label: '파일로 받기', items: [
                { label: 'Markdown (.md)', href: '/api/home/dock/items.md' }, { label: 'CSV (엑셀)', href: '/api/home/dock/items.csv' },
                { label: 'JSON', href: '/api/home/dock/items.json' }] })}</div>
            </details>
          </div>
          <a class="btn small home-dock-go" href="/dashboard#briefing">${icon('chart')} 데일리 브리핑에서 보기</a>
        </aside>`;
      doc.body.appendChild(D.el);
      D.el.addEventListener('click', e => {
        const un = e.target.closest('[data-dock-unsave]');
        const unn = e.target.closest('[data-dock-unnote]');
        const ed = e.target.closest('[data-dock-edit]'), del = e.target.closest('[data-dock-del]');
        if (ed || del) e.preventDefault();   // label 안 버튼: 체크 표시가 바뀌지 않게
        if (ed) { D.editing = ed.closest('[data-id]').dataset.id; paint(); const f = q('todo-edit'); if (f) f.elements.title.focus(); }
        else if (del) { if (global.confirm('이 할 일을 지울까요?')) removeTodo(del); }
        else if (e.target.closest('[data-dock-edit-cancel]')) { D.editing = null; paint(); }
        else if (un) unsave(un);
        else if (unn) removeNote(unn);
        else if (e.target.closest('[data-dock="fab"]')) setOpen(!D.open);
        else if (e.target.closest('[data-dock="close"], [data-dock="scrim"], .home-dock-go')) setOpen(false);
      });
      D.el.addEventListener('change', e => { if (e.target.matches('[data-dock-toggle]')) toggle(e.target); });
      D.el.addEventListener('submit', e => {
        e.preventDefault();
        if (e.target.dataset.dock === 'todo-form') addTodo(e.target);
        else if (e.target.dataset.dock === 'news-form') saveNews(e.target);
        else if (e.target.dataset.dock === 'todo-edit') saveEdit(e.target);
      });
      doc.addEventListener('keydown', e => { if (e.key === 'Escape' && D.open) setOpen(false); });
      bindDrop();
      const b = store.get('todoBadge', null);
      if (b && b.week === weekStartOf(REBOOT.today())) { q('count').textContent = b.open > 99 ? '99+' : String(b.open); q('count').hidden = b.open <= 0; }
    }
    if (doc) {
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
      else mount();
    }
    return {
      sync(t, sig) { D.todos = t; if (sig) D.signals = sig; paint(); },
      add: addNote,
      async items(kind) {
        const r = await REBOOT.api('/api/home/dock/items' + (kind ? `?kind=${encodeURIComponent(kind)}` : ''));
        return r.items || [];
      }
    };
  })();

  REBOOT.register({
    id: 'home', label: '홈 · 데일리 브리핑', order: 10, render,
    summary: () => {
      const b = store.get('todoBadge', null);
      const week = weekStartOf(REBOOT.today());
      return { label: '이번 주 할 일', value: b && b.week === week ? b.open : 0 };
    }
  });
  // dockAdd(payload) → 담은 한 줄(실패하면 null) · dockItems(kind?) → Promise<[{kind, title, text, data, href, url, memo, …}]> · DOCK_MIME = 끌 때 쓰는 형식
  REBOOT.expose('home', { seasons: () => REBOOT.data.seasons(), dockAdd: p => dock.add(p), dockItems: kind => dock.items(kind), DOCK_MIME });
})(typeof window !== 'undefined' ? window : globalThis);
