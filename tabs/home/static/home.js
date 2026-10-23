/* 홈 · 데일리 브리핑 (담당: 이현경) — 설명서 tabs/home/docs/README.md · 메모 tabs/home/docs/NOTES.md
   화면 3개 (시안 v3 · 왼쪽 메뉴): 시작하기 · 데일리 브리핑 · 콘텐츠 캘린더
   데일리 브리핑: 히어로(뉴스 신호 · 할 일 · 다음 시즌) → 시즌 카드 3 → KPI 4 → 왼쪽: 성과 차트 · 업계 뉴스 / 오른쪽: To-Do · 최근 활동
   - 뉴스: 저장된 결과만 읽음 (구글 뉴스는 '지금 수집' 버튼·하루 1회 작업만 부름)
   - To-Do: 그 주 처음 열면 자동 생성 (OpenAI 키가 없으면 규칙), 항목마다 근거 표시
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

  const S = { root: null, view: '', briefing: false, resumeLoaded: false, chart: null, range: 'cur', week: null, prevWeek: null, todos: null, news: null, poll: null, calMonth: '', watching: false };
  const ref = name => S.root && S.root.querySelector(`[data-ref="${name}"]`);

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
  function cssVar(name, fallback) {
    const v = global.getComputedStyle(S.root || doc.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  const isUrl = u => /^https?:\/\//i.test(String(u || ''));
  const arrow = d => (d > 0 ? '▲' : d < 0 ? '▼' : '–');

  /* ───────── KPI ───────── */
  async function paintKpis() {
    const box = ref('kpis');
    const [week, camp] = await Promise.all([weekSummary(), campaigns()]);
    S.week = week && !week.empty ? week : null;
    const w = S.week;
    const tone = d => (d == null ? 'flat' : d > 0 ? '' : d < 0 ? 'down' : 'flat');
    const foot = w ? `${w.compare ? w.compare.label : '비교 없음'} · ${w.sample ? '샘플 데이터' : `${md(w.start)}—${md(w.end)}`}` : '성과 데이터 없음';
    const cards = [];
    cards.push(ui.kpi({
      label: '이번 주 매출', icon: 'dollar', featured: true, value: w ? fmt.num(w.revenue) : '—', unit: w ? '원' : '',
      change: w && w.change && w.change.revenue != null ? `${arrow(w.change.revenue)} ${fmt.num(Math.abs(w.change.revenue), 1)}%` : '',
      tone: w && w.change ? tone(w.change.revenue) : 'flat', foot
    }));
    cards.push(ui.kpi({
      label: '광고 수익률 (ROAS)', icon: 'chart', value: w && w.roas != null ? fmt.num(w.roas, 0) : '—', unit: w && w.roas != null ? '%' : '',
      change: w && w.change && w.change.roas != null ? `${arrow(w.change.roas)} ${fmt.num(Math.abs(w.change.roas), 1)}%` : '',
      tone: w && w.change ? tone(w.change.roas) : 'flat', foot
    }));
    if (camp && Number.isFinite(Number(camp.active))) {
      cards.push(ui.kpi({ label: '진행 중인 캠페인', icon: 'spark', value: fmt.num(camp.active), unit: '개', foot: `전체 ${fmt.num(camp.total || 0)}개 · 콘텐츠 제작` }));
    } else {
      const list = seasons().filter(s => s.inLead || s.ongoing).sort((a, b) => a.dday - b.dday);
      const near = list[0];
      cards.push(ui.kpi({
        label: '준비 중인 시즌', icon: 'calendar', value: fmt.num(list.length), unit: '개', tone: 'flat',
        change: near ? `${near.name} ${near.ongoing ? '진행 중' : fmt.dday(near.start)}` : '', foot: '준비 기간에 들어온 시즌'
      }));
    }
    const cs = csStats();
    const comp = compliancePending();
    const parts = [];
    if (cs && Number.isFinite(Number(cs.open))) parts.push(`CS ${cs.open}`);
    if (comp != null) parts.push(`카피 ${comp}`);
    const total = (cs && Number(cs.open) || 0) + (comp || 0);
    cards.push(ui.kpi({
      label: '검토가 필요한 업무', icon: 'clock', value: parts.length ? fmt.num(total) : '—', unit: parts.length ? '건' : '', tone: 'flat',
      change: parts.join(' · '), foot: parts.length ? '담당자 확인 필요' : '연결된 파트 없음'
    }));
    box.innerHTML = cards.join('');
  }

  /* ───────── 이번 주 성과 차트 ───────── */
  function destroyChart() { if (S.chart) { try { S.chart.destroy(); } catch (e) { /* 이미 없음 */ } S.chart = null; } }
  async function paintChart() {
    const card = ref('chart-card');
    const w = S.week;
    if (!w) {
      destroyChart();
      ref('chart-body').innerHTML = ui.empty('성과 데이터가 없어요. 성과분석에서 매출 CSV를 올리면 여기에 이번 주 매출·광고비가 나옵니다.', 'chart');
      return;
    }
    const prevBtn = card.querySelector('[data-range="prev"]');
    if (prevBtn) prevBtn.disabled = !w.compare;
    let s = w;
    if (S.range === 'prev' && w.compare) {
      if (!S.prevWeek) S.prevWeek = await safe(() => REBOOT.use('performance').summary({ start: w.compare.start, end: w.compare.end }));
      if (S.prevWeek) s = S.prevWeek;
    }
    ref('chart-tag').innerHTML = w.sample ? badge('샘플 데이터', 'orange') : '';
    ref('chart-value').textContent = fmt.krw(s.revenue);
    const ch = s.change && s.change.revenue;
    ref('chart-change').innerHTML = ch != null ? badge(`${arrow(ch)} ${fmt.num(Math.abs(ch), 1)}%`, ch >= 0 ? 'green' : 'red') : '';
    ref('chart-range').textContent = `${s.start.replace(/-/g, '.')} — ${md(s.end)} 매출 합계 · 광고비 ${fmt.krw(s.spend)}`;
    drawChart(s.daily || []);
  }
  function drawChart(daily) {
    destroyChart();
    const C = global.Chart;
    const canvas = ref('chart');
    if (!C || !canvas) return;
    const muted = cssVar('--muted', '#858981'), line = cssVar('--line', '#e9ece4');
    const rev = cssVar('--home-rev', '#759a08'), spend = cssVar('--home-spend', '#334324');
    const fillTop = cssVar('--home-rev-fill', 'rgba(215,255,63,.35)'), surface = cssVar('--surface', '#ffffff');
    const family = global.getComputedStyle(doc.body).fontFamily;
    const font = size => ({ family, size });
    S.chart = new C(canvas, {
      type: 'line',
      data: {
        labels: daily.map(d => `${md(d.date)} ${WEEKDAY[dow(d.date)]}`),
        datasets: [
          {
            label: '매출', data: daily.map(d => d.revenue), borderColor: rev, borderWidth: 2, tension: 0.35,
            pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: rev, pointBorderColor: surface, pointBorderWidth: 2,
            fill: 'origin',
            backgroundColor: ctx => {
              const area = ctx.chart.chartArea;
              if (!area) return 'transparent';
              const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              g.addColorStop(0, fillTop);
              g.addColorStop(1, 'rgba(215,255,63,0)');
              return g;
            }
          },
          {
            label: '광고비', data: daily.map(d => d.spend), borderColor: spend, backgroundColor: spend, borderWidth: 1.6,
            borderDash: [5, 5], tension: 0.35, pointRadius: 0, pointHoverRadius: 4, pointBorderColor: surface, pointBorderWidth: 2, fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },  // 범례는 카드 위 HTML (매출 · 광고비)
          tooltip: { titleFont: font(11), bodyFont: font(12), padding: 10, callbacks: { label: c => ` ${c.dataset.label}: ${fmt.krw(c.parsed.y)}` } }
        },
        scales: {
          x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, font: font(10), maxRotation: 0 } },
          y: {
            beginAtZero: true, grid: { color: line }, border: { display: false },
            ticks: { color: muted, font: font(10), maxTicksLimit: 5, callback: v => (Math.abs(v) >= 10000 ? fmt.num(Math.round(v / 10000)) + '만' : fmt.num(v)) }
          }
        }
      }
    });
  }

  /* ───────── 시즌 (브리핑 히어로 · 시즌 카드 · 콘텐츠 캘린더) ───────── */
  const seasonKey = s => (s.ongoing ? -1 : s.dday);
  function upcomingSeasons() {
    return seasons().filter(s => s.ongoing || s.dday >= 0).sort((a, b) => seasonKey(a) - seasonKey(b));
  }
  const pad2 = v => (v == null ? '—' : String(v).padStart(2, '0'));
  function paintHero() {
    const title = ref('hero-title');
    if (!title) return;
    const s = upcomingSeasons()[0];
    title.textContent = !s ? '이번 주 우선순위를 정해 보세요.'
      : s.ongoing ? `${s.name}, 지금이 바로 그 시즌.`
        : s.dday === 0 ? `오늘은 ${s.name}.` : `${s.name}까지 ${s.dday}일, 준비는 지금부터.`;
    const n = S.news;
    ref('hero-news').textContent = n ? pad2((n.signals || []).filter(x => x.surge).length) : '—';
    ref('hero-todo').textContent = S.todos ? pad2(S.todos.items.filter(i => !i.done).length) : '—';
    ref('hero-season').textContent = s ? (s.ongoing ? 'NOW' : fmt.dday(s.start)) : '—';
  }
  function paintSeasonCards() {
    const box = ref('season-cards');
    const list = upcomingSeasons().slice(0, 3);
    if (!list.length) {
      box.innerHTML = `<div class="card" style="grid-column:1/-1">${ui.empty('다가오는 시즌이 없어요. 설정 › 수집 설정에서 시즌을 추가하세요.', 'calendar')}</div>`;
      return;
    }
    box.innerHTML = list.map((s, i) => {
      const status = s.ongoing ? badge('진행 중', 'green') : s.inLead ? badge('준비 기간', 'green') : badge('다가오는 시즌');
      const range = s.end && s.end !== s.start ? `${s.start.replace(/-/g, '.')} — ${md(s.end)}` : s.start.replace(/-/g, '.');
      const note = s.notes || (s.ongoing ? '게시 일정과 재고를 확인하세요.' : `준비 시작 ${md(addDays(s.start, -s.leadDays))} · 준비 기간 ${s.leadDays}일`);
      return `<div class="season-card${i === 0 && (s.inLead || s.ongoing) ? ' featured' : ''}">
        <div class="between">${status}<span class="days-left">${s.ongoing ? 'NOW' : esc(fmt.dday(s.start))}</span></div>
        <h3>${esc(s.name)}</h3><p>${esc(range)} (${WEEKDAY[dow(s.start)]})</p><div class="rule"></div><p>${esc(note)}</p>
        <a class="link" href="/dashboard/content">캠페인 준비 ${icon('arrow')}</a></div>`;
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
    const list = seasons();
    const html = [];
    for (let i = 0; i < cells; i++) {
      const iso = addDays(first, i - lead);
      const pills = list.filter(s => iso >= s.start && iso <= s.end)
        .map(s => `<a class="event-pill" href="/dashboard/content" title="${esc(s.name)}${s.notes ? ` · ${esc(s.notes)}` : ''}">${esc(s.name)}</a>`)
        .concat(list.filter(s => s.leadDays > 0 && addDays(s.start, -s.leadDays) === iso)
          .map(s => `<span class="event-pill lead" title="${esc(s.name)} ${esc(fmt.dday(s.start))} · 준비 기간 ${esc(s.leadDays)}일 시작">${esc(s.name)} 준비 시작</span>`));
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
        <div><p>${esc(s.name)}${s.inLead ? badge('준비 중', 'lime') : s.ongoing ? badge('진행 중', 'green') : ''}</p><span>${esc(info)}</span></div></div>`;
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
        <p class="source-label">시즌 일정은 설정 › 수집 설정의 시즌 캘린더에서 고칩니다. 준비 시작일 = 시즌 시작일 − 준비 기간.</p>
      </section>
      <section class="card section-gap"><div class="card-head"><h2>다가오는 일정</h2>${badge(`시즌 ${upcoming.length}개`)}</div>
        <div class="home-sched-grid">${upcoming.length ? upcoming.map(item).join('') : '<p class="panel-note">다가오는 시즌이 없습니다. 설정 › 수집 설정에서 추가하세요.</p>'}</div></section>`;
  }
  function moveMonth(n) {
    const cur = S.calMonth || REBOOT.today().slice(0, 7);
    let y = +cur.slice(0, 4), m = +cur.slice(5, 7) + n;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    S.calMonth = `${y}-${String(m).padStart(2, '0')}`;
    paintCalendar();
  }

  /* ───────── 최근 활동 ───────── */
  async function paintActivity() {
    const box = ref('activity');
    try {
      const { items } = await REBOOT.api('/api/worklog?limit=5');
      box.innerHTML = (items || []).length
        ? items.map(x => `<li>${esc(x.action)}${x.status === '실패' ? ` ${badge('실패', 'red')}` : ''}<small>${esc(partLabel(x.part))} · ${esc(fmt.relative(x.at))} · ${esc(x.user)}</small></li>`).join('')
        : '<li>아직 기록이 없습니다.<small>작업을 하면 여기에 쌓입니다.</small></li>';
    } catch (e) {
      box.innerHTML = `<li>활동을 불러오지 못했습니다.<small>${esc(e.message)}</small></li>`;
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
    const v = { week: t.week.start, open: t.items.filter(i => !i.done).length };
    const old = store.get('todoBadge', null);
    if (!old || old.week !== v.week || old.open !== v.open) store.set('todoBadge', v);
    const el = doc.querySelector('[data-count="home"]');
    if (el) { el.textContent = v.open > 99 ? '99+' : String(v.open); el.hidden = v.open <= 0; }
  }
  function todoHtml(t) {
    const tag = t.origin === 'ai' ? badge('AI', 'purple') : t.origin === 'rule' ? badge('규칙') : badge('직접', 'blue');
    const src = t.source && t.source !== 'home' && t.source !== 'manual'
      ? ` · <a class="link" href="/dashboard/${encodeURIComponent(t.source)}">${esc(partLabel(t.source))}</a>` : '';
    return `<div class="task${t.done ? ' done' : ''}" data-id="${esc(t.id)}">
      <label class="home-task-main"><input type="checkbox" data-act="todo-toggle"${t.done ? ' checked' : ''} aria-label="완료 표시: ${esc(t.title)}">
        <span class="grow"><span class="task-title">${esc(t.title)}</span><span class="meta">근거: ${esc(t.reason || '—')}${src}${t.done && t.doneBy ? ` · 완료 ${esc(t.doneBy)}` : ''}</span></span></label>
      ${tag}<button type="button" class="home-todo-del" data-act="todo-del" aria-label="삭제: ${esc(t.title)}">${icon('x')}</button></div>`;
  }
  function paintTodos() {
    const t = S.todos;
    const list = ref('todos');
    if (!t) return;
    const open = t.items.filter(i => !i.done).length;
    ref('todo-count').textContent = t.items.length ? `${open}개 남음` : '';
    const how = !t.generated ? '아직 만들지 않음' : t.origin === 'ai' ? 'AI가 시즌·뉴스·현황을 종합 (참고용)' : `규칙으로 생성${t.aiReady ? '' : ' (AI 미연결)'}`;
    ref('todo-meta').textContent = `${md(t.week.start)} — ${md(t.week.end)} · ${how}`;
    list.innerHTML = t.items.length ? t.items.map(todoHtml).join('') : ui.empty('이번 주 할 일이 없어요. + 로 추가하거나 다시 만들기를 누르세요.', 'check');
    saveBadge();
    paintHero();
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
      ref('todos').innerHTML = `<p class="note error">할 일을 불러오지 못했습니다: ${esc(e.message)}</p>`;
    }
  }
  async function regenerate(btn) {
    const ok = await ui.confirm('완료하지 않은 자동 항목을 새로 만듭니다. 직접 추가한 항목과 완료한 항목은 그대로 둡니다.', { ok: '다시 만들기' });
    if (!ok) return;
    busy(btn, true);
    try {
      const data = await REBOOT.api('/api/home/todos/generate', { auto: false, context: await buildContext() });
      S.todos = data;
      paintTodos();
      toast(data.warning || (data.origin === 'ai' ? 'AI가 이번 주 할 일을 다시 만들었습니다 (참고용).' : '규칙으로 이번 주 할 일을 다시 만들었습니다.'), data.warning ? 'error' : undefined);
    } catch (e) { toast(e.message, 'error'); }
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
      toast(e.message, 'error');
    }
  }
  async function deleteTodo(id) {
    const item = S.todos.items.find(i => String(i.id) === String(id));
    if (!item || !(await ui.confirm(`'${item.title}'을(를) 지울까요?`, { ok: '지우기', danger: true }))) return;
    try {
      await REBOOT.api(`/api/home/todos/${encodeURIComponent(id)}`, undefined, { method: 'DELETE' });
      S.todos.items = S.todos.items.filter(i => i !== item);
      paintTodos();
    } catch (e) { toast(e.message, 'error'); }
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
    } catch (e) { toast(e.message, 'error'); }
    busy(btn, false);
  }

  /* ───────── 미국 주류 업계 뉴스 ───────── */
  function newsBadges(n) {
    const out = [];
    if (n.running) out.push(badge('수집 중…', 'blue'));
    else if (n.status === 'failed') out.push(badge('업데이트 실패', 'red'));
    else if (n.status === 'partial') out.push(badge('일부 실패', 'orange'));
    else if (n.status === 'never') out.push(badge('수집 전', 'orange'));
    if (n.ai) out.push(badge('AI 요약 · 참고용', 'purple'));
    else if (!n.aiReady) out.push(badge('AI 요약 미연결'));
    else if (n.aiStatus === 'error') out.push(badge('AI 요약 실패', 'orange'));
    return out.join(' ');
  }
  function articleLink(a, text) {
    return isUrl(a.url) ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
  }
  function signalsHtml(n) {
    const up = (n.signals || []).filter(s => s.surge);
    if (!up.length) return (n.signals || []).length ? '<p class="panel-note home-signal-none">보도량 급증 키워드 없음 (최근 7일 vs 그 전 7일)</p>' : '';
    return `<div class="home-signals" aria-label="보도량 급증">${up.map(s =>
      `<span class="home-signal" title="최근 7일 기사 ${esc(s.recent)}건 · 그 전 7일 ${esc(s.previous)}건">${icon('up')} ${esc(s.label)} ${s.changePct != null ? esc(fmt.signed(s.changePct, 0, '%')) : '새로 등장'}</span>`).join('')}</div>`;
  }
  function paintNews() {
    const n = S.news;
    if (!n) return;
    ref('news-badges').innerHTML = newsBadges(n);
    const body = ref('news-body');
    const btn = ref('news-collect');
    busy(btn, !!n.running);
    if (!n.lastSuccessAt && !(n.articles || []).length) {
      const msg = n.running ? '처음 수집하는 중이에요 (보통 1분 안팎).'
        : n.status === 'never' ? "아직 수집한 뉴스가 없어요. '지금 수집'을 누르면 보통 1분 안팎 걸립니다."
          : "아직 받은 뉴스가 없어요 (마지막 수집 실패). 잠시 뒤 '지금 수집'을 다시 눌러 주세요.";
      body.innerHTML = ui.empty(msg, 'globe');
    } else if (n.ai) {
      // 기사 카드: 기존 동향 카드와 같은 모양 (한국어 제목 · 한 줄 요약 · 주제/보도 급증 · 매체 · 날짜 · 영어 원제목)
      const items = (n.ai.items || []).map(a => `
        <div class="market-item"><div class="market-symbol">${icon(a.surge ? 'up' : 'globe')}</div>
          <div><p>${articleLink(a, a.titleKo || a.title)}</p><small>${esc(a.summaryKo)}</small>
          <small class="home-links">${[a.topic, a.surge ? '보도 급증' : '', a.domain, fmt.relative(a.date)].filter(Boolean).map(esc).join(' · ')}</small>
          <small class="home-links" lang="en">${esc(a.title)}</small></div></div>`).join('');
      body.innerHTML = `${n.ai.headline ? `<div class="home-headline">${icon('spark')}<span>${esc(n.ai.headline)}</span></div>` : ''}
        ${signalsHtml(n)}${items || '<p class="panel-note mt-8">이번 주에는 마케팅과 관련된 기사를 찾지 못했습니다.</p>'}`;
    } else {
      const arts = (n.articles || []).slice(0, 5).map(a => `
        <div class="market-item"><div class="market-symbol">${icon('globe')}</div>
          <div><p>${articleLink(a, a.title)}</p><small>${esc(a.domain)}${a.groupLabel ? ` · ${esc(a.groupLabel)}` : ''} · ${esc(fmt.relative(a.date))}</small></div></div>`).join('');
      body.innerHTML = `${signalsHtml(n)}${arts || '<p class="panel-note">최근 7일 기사가 없습니다.</p>'}
        ${n.aiReady ? (n.aiStatus === 'error' ? `<p class="note warn mt-8">AI 요약 실패: ${esc(n.aiError)} — 다음 수집 때 다시 시도합니다.</p>` : '')
          : '<p class="panel-note mt-8">설정 › 연결에서 OPENAI_API_KEY를 넣으면 관련 기사만 골라 최대 8개를 한국어 제목·한 줄 요약으로 정리합니다. 지금은 최근 기사 제목만 보여 줍니다 (관련 없는 기사가 섞일 수 있음).</p>'}`;
    }
    const last = n.lastRun;
    const bits = [];
    if (n.running) bits.push('구글 뉴스에서 수집 중… 끝나면 자동으로 바뀝니다');
    else if (last) {
      bits.push(`수집 ${fmt.datetime(last.finishedAt || last.startedAt)}${last.trigger === 'daily' ? ' (자동)' : ''}`);
      if (n.status === 'failed' && n.lastSuccessAt) bits.push(`마지막 성공 ${fmt.datetime(n.lastSuccessAt)}`);
    }
    if (n.articleCount7d) bits.push(`최근 7일 기사 ${fmt.num(n.articleCount7d)}건`);
    ref('news-meta').textContent = bits.join(' · ');
    const errs = last && !n.running && (n.status === 'failed' || n.status === 'partial') ? (last.errors || []) : [];
    ref('news-errors').innerHTML = errs.length ? `<details class="home-errors"><summary>실패 이유 ${errs.length}건</summary><ul>${errs.slice(0, 6).map(e => `<li>${esc(e)}</li>`).join('')}</ul></details>` : '';
    ref('news-note').textContent = n.limitNote || '';
    paintHero();
  }
  async function loadNews() {
    try {
      S.news = await REBOOT.api('/api/home/news');
      paintNews();
      if (S.news.running) startPolling();
    } catch (e) {
      ref('news-body').innerHTML = `<p class="note error">뉴스를 불러오지 못했습니다: ${esc(e.message)}</p>`;
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
      toast(ok ? '뉴스 수집을 마쳤습니다.' : '뉴스를 새로 받지 못했습니다. 마지막 결과를 그대로 보여 줍니다.', ok ? undefined : 'error');
      paintActivity();
    }, 4000);
  }
  async function collectNews(btn) {
    busy(btn, true);
    try {
      await REBOOT.api('/api/home/news/collect', {});
      toast('뉴스 수집을 시작했습니다. 보통 1분 안팎 걸립니다.');
      S.news = Object.assign({}, S.news, { running: true });
      paintNews();
      startPolling();
    } catch (e) {
      toast(e.message, 'error');
      busy(btn, false);
      if (e.status === 409) startPolling();
    }
  }

  /* ───────── 화면 ───────── */
  function watchTheme() {
    if (S.watching) return;
    S.watching = true;
    const redraw = () => { if (S.chart && S.week) paintChart(); };
    if (global.MutationObserver) new global.MutationObserver(redraw).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (global.matchMedia) {
      const mq = global.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', redraw);
    }
  }

  /* 홈의 하위 화면 (시안 v3): 시작하기 · 데일리 브리핑 · 콘텐츠 캘린더
     탭 줄(role="tablist")은 core.js가 왼쪽 메뉴로 옮겨 보여 줍니다. 주소 #briefing · #calendar로 바로 열 수 있음 */
  const VIEWS = [['start', '시작하기', 'home'], ['briefing', '데일리 브리핑', 'chart'], ['calendar', '콘텐츠 캘린더', 'calendar']];
  const viewFromHash = () => { const h = (global.location.hash || '').replace('#', ''); return VIEWS.some(v => v[0] === h) ? h : null; };
  function longDate(iso) {
    return new Date(toTime(iso)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
  }
  const koDate = iso => `${iso.slice(0, 4)}년 ${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일 ${WEEKDAY[dow(iso)]}요일`;
  function userName() { const u = REBOOT.user(); return u.name || String(u.email || '').split('@')[0] || ''; }

  function paintHeading(id) {
    const page = REBOOT.page;
    const actions = page.actions();
    const ws = weekStartOf(REBOOT.today());
    page.heading(id !== 'start');
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
  async function paintStart() {
    const s = upcomingSeasons()[0];
    const next = ref('next-text');
    if (next) next.textContent = s ? `${+s.start.slice(5, 7)}월 ${+s.start.slice(8, 10)}일 · ${s.name} (${s.ongoing ? '진행 중' : fmt.dday(s.start)})` : '등록된 시즌이 없어요 · 설정에서 추가';
    if (S.resumeLoaded) return;
    S.resumeLoaded = true;
    const c = await campaigns();
    const items = c && Array.isArray(c.items) ? c.items.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) : [];
    const box = ref('resume-text');
    if (box) box.textContent = items.length ? `${items[0].title || '제목 없는 캠페인'}${items[0].status ? ` · ${items[0].status}` : ''}` : '새 캠페인을 시작해 보세요 · 콘텐츠 제작';
  }
  function paintBriefing() {
    paintHero();
    paintSeasonCards();
    paintActivity();
    loadNews();
    watchTheme();
    const noop = () => {};
    paintKpis().catch(noop).then(() => paintChart()).catch(noop).then(loadTodos);
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
    if (id === 'start') paintStart();
    if (id === 'briefing' && !S.briefing) { S.briefing = true; paintBriefing(); }
    if (id === 'calendar') paintCalendar();
    if (!opts || opts.hash !== false) {
      const h = id === 'start' ? '' : `#${id}`;
      if ((global.location.hash || '') !== h && global.history && global.history.replaceState) {
        global.history.replaceState(null, '', global.location.pathname + global.location.search + h);
      }
    }
  }

  function render(root) {
    S.root = root;
    root.classList.add('part-home');
    const today = REBOOT.today();
    root.innerHTML = `
      <div class="subtabs" role="tablist" aria-label="홈 화면">${VIEWS.map(([id, label, ic]) =>
        `<button type="button" role="tab" data-view="${id}" data-icon="${ic}" aria-selected="false">${esc(label)}</button>`).join('')}</div>

      <div data-view-panel="start" role="tabpanel" hidden>
        <div class="intro-greeting"><h1>반가워요, ${esc(userName())}님.</h1>
          <div class="date"><b>${esc(longDate(today))}</b>오늘도 새로운 가능성을 만나보세요.</div></div>
        <div class="intro-section-head"><h2>오늘은 어디서 시작할까요?</h2><span>YOUR WORKSPACE, YOUR FLOW</span></div>
        <div class="launch-grid">${[
          ['01', '/dashboard/insights', 'globe', '시장을 살펴볼까요?', '고객의 목소리와 시장의 변화에서<br>새로운 기회를 발견하세요.'],
          ['02', '/dashboard/content', 'spark', '아이디어를 만들어볼까요?', '짧은 대화로 시작해, 우리다운<br>콘텐츠를 완성해보세요.'],
          ['03', '/dashboard/partners', 'users', '함께할 파트너를 찾을까요?', '좋은 연결을 시작하고<br>협업의 다음 단계를 준비하세요.']
        ].map(([n, href, ic, t, d]) => `<a class="launch-card${n === '02' ? ' featured' : ''}" href="${href}">
          <div class="launch-top"><span class="launch-icon">${icon(ic)}</span><span class="launch-num">${n}</span></div>
          <h3>${t}<span class="corner-arrow">${icon('up')}</span></h3><p>${d}</p></a>`).join('')}</div>
        <div class="continue-row">
          <a class="continue-card" href="/dashboard/content"><span class="continue-icon">${icon('image')}</span>
            <div><h3>이어서 작업하기</h3><p data-ref="resume-text">콘텐츠 제작 · 내 캠페인</p></div>${icon('arrow')}</a>
          <button type="button" class="continue-card" data-go-view="calendar"><span class="continue-icon">${icon('calendar')}</span>
            <div><h3>다가오는 콘텐츠 일정</h3><p data-ref="next-text">—</p></div>${icon('arrow')}</button>
        </div>
        <p class="intro-tip">상단에서 업무 영역을 고르고, 왼쪽 메뉴에서 필요한 화면으로 이동하세요.</p>
      </div>

      <div data-view-panel="briefing" role="tabpanel" hidden>
        <section class="brief-hero">
          <div><span class="eyebrow">YOUR DAILY START</span><h2 data-ref="hero-title">—</h2>
            <p>시즌의 타이밍과 업계의 이야기를 연결해 이번 주 우선순위를 정해보세요.</p>
            <div class="flex wrap" style="margin-top:19px"><a class="btn lime" href="/dashboard/content">${icon('spark')} 캠페인 준비하기</a>
              <a class="btn small" href="/dashboard/insights">시장 인사이트 보기</a></div></div>
          <div class="hero-stat">
            <div><strong data-ref="hero-news">—</strong><small>뉴스 시그널</small></div>
            <div><strong data-ref="hero-todo">—</strong><small>이번 주 할 일</small></div>
            <div><strong data-ref="hero-season">—</strong><small>다음 주요 시즌</small></div>
          </div>
        </section>
        <div class="section-title"><h2>다가오는 미국 시즌</h2>${badge('시즌 캘린더 · 설정에서 편집')}</div>
        <div class="three-col" data-ref="season-cards"></div>
        <div class="kpis section-gap" data-ref="kpis" aria-label="이번 주 요약">${'<div class="kpi"><div class="skeleton" style="height:100%"></div></div>'.repeat(4)}</div>
        <div class="home-layout">
          <div class="stack">
            <section class="card" data-ref="chart-card">
              <div class="card-head"><h2>이번 주 성과 <span data-ref="chart-tag"></span></h2>
                <div class="flex wrap">
                  <div class="period" role="group" aria-label="기간">
                    <button type="button" class="selected" data-range="cur" aria-pressed="true">최근 7일</button>
                    <button type="button" data-range="prev" aria-pressed="false">직전 7일</button>
                  </div>
                  <a class="link" href="/dashboard/performance">자세히 보기 ${icon('arrow')}</a>
                </div></div>
              <div data-ref="chart-body">
                <div class="between home-chart-top">
                  <div class="home-chart-summary"><strong data-ref="chart-value">—</strong><span data-ref="chart-change"></span><small data-ref="chart-range"></small></div>
                  <div class="home-legend" aria-hidden="true"><span class="rev">매출</span><span class="spend">광고비</span></div>
                </div>
                <div class="home-chart"><canvas data-ref="chart" role="img" aria-label="최근 7일 일별 매출(실선)과 광고비(점선) — 자세한 숫자는 성과분석"></canvas></div>
              </div>
            </section>
            <section class="card">
              <div class="card-head"><div><h2>미국 주류 업계 뉴스</h2><p class="panel-note" style="margin-top:5px">보도량과 기사 주제로 보는 업계의 움직임</p></div>
                <span class="flex home-news-badges" data-ref="news-badges"></span></div>
              <div data-ref="news-body"><div class="skeleton" style="height:120px"></div></div>
              <div data-ref="news-errors"></div>
              <div class="between home-news-foot"><span class="panel-note" data-ref="news-meta"></span>
                <button type="button" class="btn small" data-ref="news-collect" data-act="news-collect">${icon('refresh')} 지금 수집</button></div>
              <p class="panel-note" data-ref="news-note"></p>
            </section>
          </div>
          <aside class="stack">
            <section class="card">
              <div class="card-head home-todo-head"><h2>이번 주 To-Do <span class="muted small" data-ref="todo-count"></span></h2>
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
            <section class="card"><div class="card-head"><h2>최근 워크스페이스 활동</h2></div><ul class="activity" data-ref="activity"><li>불러오는 중…</li></ul></section>
            <section class="card"><h3 class="home-side-title">더 깊은 시장 정보가 필요하다면</h3>
              <p class="panel-note" style="margin:10px 0 16px">진열대 · 구매자 리뷰 · 검색 수요는 시장·고객 인사이트에서 확인하세요.</p>
              <a class="btn small" href="/dashboard/insights">시장·고객 인사이트 ${icon('arrow')}</a></section>
          </aside>
        </div>
      </div>

      <div data-view-panel="calendar" role="tabpanel" hidden><div data-ref="calendar"></div></div>`;

    root.addEventListener('click', e => {
      const v = e.target.closest('[data-view], [data-go-view]');
      if (v) {
        showView(v.dataset.view || v.dataset.goView);
        if (v.dataset.goView && global.scrollTo) global.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const r = e.target.closest('[data-range]');
      if (r && !r.disabled) {
        S.range = r.dataset.range;
        root.querySelectorAll('[data-range]').forEach(b => { b.classList.toggle('selected', b === r); b.setAttribute('aria-pressed', String(b === r)); });
        paintChart();
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      const row = b.closest('[data-id]');
      if (act === 'todo-toggle') toggleTodo(row.dataset.id, b.checked, b);
      else if (act === 'todo-del') deleteTodo(row.dataset.id);
      else if (act === 'todo-regen') regenerate(b);
      else if (act === 'todo-add') { const f = ref('todo-form'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('[name="title"]').focus(); }
      else if (act === 'todo-cancel') { ref('todo-form').hidden = true; }
      else if (act === 'news-collect') collectNews(b);
      else if (act === 'cal-prev') moveMonth(-1);
      else if (act === 'cal-next') moveMonth(1);
      else if (act === 'cal-today') { S.calMonth = ''; paintCalendar(); }
    });
    const actions = REBOOT.page.actions();
    if (actions) actions.addEventListener('click', e => {
      const v = e.target.closest('[data-go-view]');
      if (v) showView(v.dataset.goView);
    });
    ref('todo-form').addEventListener('submit', e => { e.preventDefault(); addTodo(e.currentTarget); });
    global.addEventListener('hashchange', () => { const v = viewFromHash() || 'start'; if (v !== S.view) showView(v, { hash: false }); });
    showView(viewFromHash() || 'start', { hash: false });
  }

  REBOOT.register({
    id: 'home', label: '홈 · 데일리 브리핑', order: 10, render,
    summary: () => {
      const b = store.get('todoBadge', null);
      const week = weekStartOf(REBOOT.today());
      return { label: '이번 주 할 일', value: b && b.week === week ? b.open : 0 };
    }
  });
  REBOOT.expose('home', { seasons: () => REBOOT.data.seasons() });
})(typeof window !== 'undefined' ? window : globalThis);
