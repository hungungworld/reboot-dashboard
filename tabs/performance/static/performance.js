/* 성과분석 파트 (담당: 혁주) — 설명서 tabs/performance/docs/README.md · 메모 tabs/performance/docs/NOTES.md
   화면 순서: 기간 선택 → 기본 정보 → 핵심 지표 6 → 채널별 성과 표(원화/달러 · 행 클릭) → 차트 → 잘한 점/개선할 점 → AI 제안·다음 주 예산
   보고서: /dashboard/performance?view=report&start=…&end=… (A4 · 브라우저 인쇄로 PDF)
   - 샘플 데이터는 어디서나 '예시' 배지로 표시. AI 결과는 'AI' 배지 + 참고용
   - 계산은 metrics.js (REBOOT.use('performance.metrics')), 서버는 CSV 저장·환율·AI만
   다른 파트에 공개: REBOOT.use('performance').weekSummary() · summary({start, end}) */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  if (!REBOOT) return;
  const ui = REBOOT.ui;
  const { esc, toast, fmt, icon, badge, busy } = ui;
  const doc = global.document;
  let M = null;
  try { M = REBOOT.use('performance.metrics'); } catch (e) { M = null; }

  const S = {
    root: null, view: 'main', data: null, rows: [], rng: null, chans: [], period: null, sum: null,
    currency: 'KRW', fx: null, selected: new Set(), charts: {}, ai: { state: 'idle' }, aiTimer: null, aiCtrl: null,
    insight: { state: 'idle' }, insightTimer: null, insightCtrl: null,
    watching: false
  };
  const KPI_ICONS = { spend: 'dollar', revenue: 'chart', roas: 'up', conversions: 'check', cpa: 'filter', profit: 'spark' };
  const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

  /* ───────── 공개 기능 (홈 KPI) ───────── */
  let weekP = null, weekAt = 0;
  function weekSummary() {
    if (!weekP || Date.now() - weekAt > 60000) {
      weekAt = Date.now();
      weekP = REBOOT.api('/api/performance/summary').catch(e => { weekP = null; throw e; });
    }
    return weekP;
  }
  function summary(range) {
    const q = new URLSearchParams();
    if (range && range.start) q.set('start', range.start);
    if (range && range.end) q.set('end', range.end);
    return REBOOT.api('/api/performance/summary' + (q.toString() ? '?' + q : ''));
  }

  /* ───────── 도우미 ───────── */
  const ref = name => S.root && S.root.querySelector(`[data-ref="${name}"]`);

  function cssVar(name, fallback) {
    const v = global.getComputedStyle(S.root || doc.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  /** 채널 색: 전체 데이터에서 처음 나온 순서로 고정 (기간·선택이 바뀌어도 같은 색) */
  function chColor(ch) {
    const i = S.chans.indexOf(ch);
    return i >= 0 && i < 8 ? cssVar(`--perf-c${i + 1}`, '#2a78d6') : cssVar('--perf-other', '#8b977c');
  }
  /** KPI용 짧은 원화: 2,663만 · 1.25억 */
  function man(n) {
    if (n == null || !isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + '억';
    if (a >= 1e4) return fmt.num(Math.round(n / 1e4)) + '만';
    return fmt.num(Math.round(n));
  }
  const rate = () => (S.fx && S.fx.rate) || 1400;
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    return S.currency === 'USD' ? fmt.usd(n / rate()) : fmt.krw(n);
  }
  function signedKrw(n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+' : n < 0 ? '-' : '') + fmt.krw(Math.abs(n));
  }
  // 달러 표시는 성과분석 화면에서만 — 보고서(A4)는 늘 원화
  const usdOn = () => S.view !== 'report' && S.currency === 'USD';
  function cash(n) { return usdOn() ? money(n) : fmt.krw(n); }
  function signedCash(n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+' : n < 0 ? '-' : '') + cash(Math.abs(n));
  }
  /** 차트 축용 짧은 금액: 원화 2,663만 · 달러 $12.3K */
  function shortCash(n) {
    if (!usdOn()) return man(n);
    const v = n / rate(), a = Math.abs(v);
    return '$' + (a >= 1e6 ? fmt.num(v / 1e6, 1) + 'M' : a >= 1e3 ? fmt.num(v / 1e3, 1) + 'K' : fmt.num(v, 0));
  }
  // AI 문장 속 "₩ 46,706,094"를 화면에서만 달러로 (원문·캐시는 원화 그대로)
  function fxText(t) {
    if (!usdOn() || t == null) return t;
    return String(t).replace(/₩\s?(\d[\d,]*)/g, (m, d) => fmt.usd(Number(d.replace(/,/g, '')) / rate()));
  }
  function renderCurrency() {
    renderTable();
    renderKpis();
    renderInsight();
    renderAi();
    drawCharts();
  }
  function arrow(d) { return d > 0 ? '▲' : d < 0 ? '▼' : '–'; }
  function deltaHtml(metric, d) {
    const t = M.tone(metric, d);
    if (t === 'none') return '';
    return `<span class="perf-delta ${t}">${arrow(d)} ${esc(fmt.num(Math.abs(d), 1))}%</span>`;
  }
  function dayLabel(iso) { return `${iso.slice(5, 7)}.${iso.slice(8, 10)} (${WEEKDAY[M.weekday(iso)]})`; }
  function readCache(k) { try { const v = global.sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeCache(k, v) { try { global.sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 화면은 그대로 */ } }
  function params() { try { return new URLSearchParams(global.location.search); } catch (e) { return new URLSearchParams(); } }

  function applyData(d) {
    S.data = d;
    S.rows = Array.isArray(d.rows) ? d.rows : [];
    S.rng = d.range || M.range(S.rows);
    S.chans = Array.isArray(d.channels) && d.channels.length ? d.channels : M.channels(S.rows);
    S.selected.forEach(ch => { if (!S.chans.includes(ch)) S.selected.delete(ch); });
  }
  function setPeriod(start, end) {
    S.period = M.clampPeriod(start, end, S.rng);
    S.sum = M.summarize(S.rows, S.period.start, S.period.end, { range: S.rng, order: S.chans });
    if (S.view === 'main' && global.history && global.history.replaceState) {
      const q = params();
      q.set('start', S.period.start); q.set('end', S.period.end);
      global.history.replaceState(null, '', '?' + q.toString());
    }
  }
  function sourceBadge() {
    if (!S.data) return '';
    if (S.data.isSample) return badge('예시', 'orange');
    const m = S.data.meta || {};
    return badge(`올린 데이터${m.updatedAt ? ' · ' + fmt.datetime(m.updatedAt) : ''}`, 'green');
  }

  /* ───────── 차트 ───────── */
  function destroyCharts() {
    Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { /* 이미 없음 */ } });
    S.charts = {};
  }
  function chartOptions(legendStyle) {
    const muted = cssVar('--muted', '#858981');
    const line = cssVar('--line', '#e9ece4');
    const family = global.getComputedStyle(doc.body).fontFamily;
    const font = size => ({ family, size });
    return {
      responsive: true, maintainAspectRatio: false,
      animation: S.view === 'report' ? false : { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: muted, font: font(11), boxWidth: 18, boxHeight: 8, padding: 14, usePointStyle: true, pointStyle: legendStyle, pointStyleWidth: legendStyle === 'line' ? 22 : undefined } },
        tooltip: {
          titleFont: font(11), bodyFont: font(12), padding: 10, boxPadding: 4,
          callbacks: { label: c => ` ${c.dataset.label}: ${cash(c.parsed.y)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, font: font(11), maxRotation: 0, autoSkipPadding: 14 } },
        y: { beginAtZero: true, grid: { color: line }, border: { display: false }, ticks: { color: muted, font: font(11), callback: v => shortCash(v) } }
      }
    };
  }
  function drawBar(canvas) {
    const C = global.Chart;
    if (!C || !canvas) return;
    const s = S.sum;
    const bar = { borderRadius: 4, maxBarThickness: 24, categoryPercentage: 0.62, barPercentage: 0.86 };
    S.charts.bar = new C(canvas, {
      type: 'bar',
      data: {
        labels: s.channels.map(c => c.channel),
        datasets: [
          Object.assign({ label: '광고비', data: s.channels.map(c => c.spend), backgroundColor: cssVar('--perf-spend', '#334324') }, bar),
          Object.assign({ label: '매출', data: s.channels.map(c => c.revenue), backgroundColor: cssVar('--perf-rev', '#759a08') }, bar)
        ]
      },
      options: chartOptions('rectRounded')
    });
  }
  function drawLine(canvas) {
    const C = global.Chart;
    if (!C || !canvas) return;
    const s = S.sum;
    const days = M.dates(s.start, s.end);
    const surface = cssVar('--surface', '#ffffff');
    const few = days.length < 3;
    const line = (label, data, color, dashed) => ({
      label, data, borderColor: color, backgroundColor: color, borderWidth: dashed ? 1.6 : 2,
      borderDash: dashed ? [6, 4] : [], pointRadius: few ? 4 : 0, pointHoverRadius: 5,
      pointBackgroundColor: color, pointBorderColor: surface, pointBorderWidth: 2, tension: 0.3, fill: false
    });
    const chosen = s.channels.filter(c => S.selected.has(c.channel));
    const sets = [];
    if (!chosen.length) {
      s.channels.forEach(c => sets.push(line(c.channel, M.daily(S.rows, s.start, s.end, c.channel).map(d => d.revenue), chColor(c.channel), false)));
    } else {
      chosen.forEach(c => {
        const d = M.daily(S.rows, s.start, s.end, c.channel);
        sets.push(line(`${c.channel} 매출`, d.map(x => x.revenue), chColor(c.channel), false));
        sets.push(line(`${c.channel} 광고비`, d.map(x => x.spend), chColor(c.channel), true));
      });
    }
    S.charts.line = new C(canvas, { type: 'line', data: { labels: days.map(dayLabel), datasets: sets }, options: chartOptions('line') });
  }
  function drawCharts() {
    destroyCharts();
    if (!S.sum || !S.sum.rows) return;
    const barUnit = ref('bar-unit');
    if (barUnit) barUnit.textContent = usdOn() ? '단위: 달러 ($K = 천 달러)' : '단위: 원 (만 원 표시)';
    drawBar(ref('bar'));
    drawLine(ref('line'));
    const note = ref('line-note');
    if (note) {
      const chosen = S.sum.channels.filter(c => S.selected.has(c.channel)).map(c => c.channel);
      note.textContent = chosen.length ? `${chosen.join(' · ')} — 매출 실선 · 광고비 점선` : '채널별 매출 — 표에서 행을 누르면 매출·광고비 비교';
    }
  }
  function watchTheme() {
    if (S.watching) return;
    S.watching = true;
    const redraw = () => { if (S.sum) drawCharts(); };
    if (global.MutationObserver) new global.MutationObserver(redraw).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (global.matchMedia) {
      const mq = global.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', redraw);
    }
  }

  /* ───────── 환율 ───────── */
  function fxLabel() {
    const f = S.fx;
    if (!f) return '환율 받는 중…';
    if (f.status === 'ok') {
      return `1$ = ${fmt.num(f.rate, 1)}원 · 수출입은행 ${f.date} 기준${f.warning ? ` (새로 받지 못함: ${f.warning})` : ''}`;
    }
    return `1$ = ${fmt.num(f.rate, 0)}원 · 기본값 (${f.reason || '받기 실패'})`;
  }
  function paintFx() {
    const el = ref('fx-label');
    if (!el) return;
    el.textContent = fxLabel();
    el.classList.toggle('is-default', !!S.fx && S.fx.status !== 'ok');
  }
  async function loadFx(refresh, btn) {
    if (btn) busy(btn, true);
    try {
      S.fx = await REBOOT.api('/api/performance/fx' + (refresh ? '?refresh=1' : ''));
      if (refresh) toast(S.fx.status === 'ok' ? `최신 환율을 받았어요: ${fxLabel()}` : `환율을 받지 못해 기본값을 써요 (${S.fx.reason || S.fx.warning || '받기 실패'})`, S.fx.status === 'ok' ? undefined : 'error');
    } catch (e) {
      S.fx = { status: 'error', rate: 1400, reason: e.message };
    }
    if (btn) busy(btn, false);
    paintFx();
    if (S.currency === 'USD' && S.sum && S.sum.rows) renderCurrency();
  }

  /* ───────── AI 해석 · 예산 제안 ───────── */
  function adviceKey() {
    const m = (S.data && S.data.meta) || {};
    return `reboot-performance-advice:${S.period.start}:${S.period.end}:${REBOOT.today()}:${m.updatedAt || (S.data && S.data.source) || ''}`;
  }
  function scheduleAdvice(force) {
    if (S.view !== 'report') scheduleInsight();
    clearTimeout(S.aiTimer);
    if (S.aiCtrl) { S.aiCtrl.abort(); S.aiCtrl = null; }
    if (!S.sum || !S.sum.rows) { S.ai = { state: 'idle' }; return; }
    const cached = !force && readCache(adviceKey());
    if (cached) {
      S.ai = { state: 'ok', data: cached, cached: true };
      paintAi();
      return;
    }
    S.ai = { state: 'loading' };
    paintAi();
    // 날짜를 연달아 바꿀 때 한 번만 부르도록 잠깐 기다림
    S.aiTimer = setTimeout(() => loadAdvice(), force ? 0 : 900);
  }
  async function loadAdvice() {
    const h = await REBOOT.health();
    if (h && h.openai === false) {
      S.ai = { state: 'nokey' };
      paintAi();
      return;
    }
    const ctrl = global.AbortController ? new global.AbortController() : null;
    S.aiCtrl = ctrl;
    const period = Object.assign({}, S.period);
    const key = adviceKey();
    try {
      const data = await REBOOT.api('/api/performance/advice', period, ctrl ? { signal: ctrl.signal } : {});
      if (S.aiCtrl !== ctrl || data.start !== S.period.start || data.end !== S.period.end) return;
      data.generatedAt = new Date().toISOString();
      writeCache(key, data);
      S.ai = { state: 'ok', data };
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (S.aiCtrl !== ctrl) return;
      S.ai = e.status === 503 ? { state: 'nokey', message: e.message } : { state: 'error', message: e.message };
    }
    S.aiCtrl = null;
    paintAi();
  }

  /* ───────── AI 인사이트 (채널별 성과 표 위, 두괄식) — 예산 제안과 따로 부름 ───────── */
  function insightKey() {
    return adviceKey().replace('reboot-performance-advice:', 'reboot-performance-insight:');
  }
  function scheduleInsight(force) {
    clearTimeout(S.insightTimer);
    if (S.insightCtrl) { S.insightCtrl.abort(); S.insightCtrl = null; }
    if (!S.sum || !S.sum.rows) { S.insight = { state: 'idle' }; return; }
    const cached = !force && readCache(insightKey());
    if (cached && cached.headline) {   // 예전 3줄 형식(lines) 결과는 다시 받음
      S.insight = { state: 'ok', data: cached, cached: true };
      renderInsight();
      return;
    }
    S.insight = { state: 'loading' };
    renderInsight();
    S.insightTimer = setTimeout(() => loadInsight(), force ? 0 : 900);
  }
  async function loadInsight() {
    const h = await REBOOT.health();
    if (h && h.openai === false) {
      S.insight = { state: 'nokey' };
      renderInsight();
      return;
    }
    const ctrl = global.AbortController ? new global.AbortController() : null;
    S.insightCtrl = ctrl;
    const period = Object.assign({}, S.period);
    const key = insightKey();
    try {
      const data = await REBOOT.api('/api/performance/insight', period, ctrl ? { signal: ctrl.signal } : {});
      if (S.insightCtrl !== ctrl || data.start !== S.period.start || data.end !== S.period.end) return;
      writeCache(key, data);
      S.insight = { state: 'ok', data };
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (S.insightCtrl !== ctrl) return;
      S.insight = e.status === 503 ? { state: 'nokey' } : { state: 'error', message: e.message };
    }
    S.insightCtrl = null;
    renderInsight();
  }
  // AI가 **굵게** 감싼 부분만 <strong>으로 (먼저 esc 하므로 다른 태그는 그대로 막힘)
  function boldHtml(t) {
    return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function renderInsight() {
    const box = ref('insight');
    if (!box) return;
    const st = S.insight.state;
    const tag = badge('AI 인사이트', 'purple');
    let body;
    if (st === 'ok') {
      const d = S.insight.data;
      const pts = (d.points || []).map(p => `<li>${p.label ? `<span class="perf-insight-label">${esc(p.label)}</span>` : ''}${boldHtml(fxText(p.text))}</li>`).join('');
      body = `<div><p class="perf-insight-head">${boldHtml(fxText(d.headline))}</p>${pts ? `<ul class="perf-insight-lines">${pts}</ul>` : ''}</div>
        <button type="button" class="btn small ghost" data-act="insight-again" aria-label="AI 인사이트 다시 만들기">${icon('refresh')}</button>`;
    } else if (st === 'nokey') {
      body = `<p class="panel-note">AI 연결 안 됨 — 설정 › 연결에서 OpenAI 키를 넣으면 전체 성과 요약을 볼 수 있어요.</p>`;
    } else if (st === 'error') {
      body = `<p class="panel-note">AI 인사이트를 만들지 못했어요: ${esc(S.insight.message)}</p>
        <button type="button" class="btn small ghost" data-act="insight-again">${icon('refresh')} 다시 만들기</button>`;
    } else if (st === 'loading') {
      body = `<div class="perf-loading"><span class="spinner" aria-hidden="true"></span>AI가 이 기간 성과를 요약하고 있어요…</div>`;
    } else {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = tag + `<div class="perf-insight-body">${body}</div>`;
  }

  function paintAi() {
    if (S.view === 'report') reportAi();
    else { renderReview(); renderAi(); }
  }

  // 잘한 점 · 개선할 점: AI가 "- " 줄로 주면 핵심 요약 목록(굵게 포함), 아니면(숫자 기준 · 예전 결과) 문단 그대로
  function reviewLines(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(l => /^[-•]\s+/.test(l)).map(l => l.replace(/^[-•]\s+/, ''));
  }
  function reviewCard(title, text, ai) {
    const tag = ai ? `<span class="flex">${badge('AI', 'purple')}<span class="small muted">참고용</span></span>` : badge('숫자 기준');
    const lines = reviewLines(text);
    const body = lines.length
      ? `<ul class="perf-insight-lines perf-review-lines">${lines.map(l => `<li>${boldHtml(l)}</li>`).join('')}</ul>`
      : `<p class="perf-review-text">${esc(text || '—')}</p>`;
    return `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${tag}</div>${body}</section>`;
  }
  // 보고서(A4)용: 굵게 표시 기호는 빼고 줄은 그대로
  function reviewPlain(text) {
    const lines = reviewLines(text);
    return lines.length ? `<ul>${lines.map(l => `<li>${esc(l.replace(/\*\*/g, ''))}</li>`).join('')}</ul>` : `<p>${esc(text)}</p>`;
  }
  function renderReview() {
    const box = ref('review');
    if (!box || !S.sum) return;
    const ai = S.ai.state === 'ok' && S.ai.data && S.ai.data.analysis;
    const num = M.insights(S.sum);
    const good = ai && ai.good ? ai.good : num.good;
    const bad = ai && ai.improve ? ai.improve : num.improve;
    box.innerHTML = reviewCard('잘한 점', good, !!(ai && ai.good)) + reviewCard('개선할 점', bad, !!(ai && ai.improve));
  }

  function adviceHtml(a, compact) {
    const b = a.budget || { items: [], notes: [] };
    const when = a.generatedAt ? fmt.datetime(a.generatedAt) : '';
    const items = (b.items || []).map(i => `
      <div class="perf-budget-row">
        <span class="perf-ch"><span class="perf-swatch" style="background:${esc(chColor(i.channel))}"></span>${esc(i.channel)}</span>
        <span class="num"><b>${esc(cash(i.amount))}</b></span>
        <span class="num perf-delta neutral">${esc(signedCash(i.delta))}${i.deltaPct != null ? ` (${esc(fmt.signed(i.deltaPct, 1, '%'))})` : ''}</span>
        <span class="perf-share"><span class="progress-track"><i style="width:${Math.max(0, Math.min(100, Number(i.share) || 0))}%"></i></span>${esc(fmt.pct(i.share, 0))}</span>
        ${i.reason ? `<p>${esc(i.reason)}</p>` : ''}
      </div>`).join('');
    const actions = (a.actions || []).map(x => `
      <div class="result"><h3>${esc(x.title)}</h3><p>${esc(x.detail)}</p>${x.season ? badge(x.season, 'lime') : ''}</div>`).join('');
    return `
      ${a.overview ? `<p class="perf-overview">${esc(a.overview)}</p>` : ''}
      <div class="perf-ai-sum">
        <div class="perf-ai-stat"><span>다음 주 총 예산</span><strong>${esc(cash(b.total))}</strong><small>기준의 80~120%: ${esc(cash(b.min))} ~ ${esc(cash(b.max))}</small></div>
        <div class="perf-ai-stat"><span>${b.scaled ? `이번 기간 광고비 (${esc(b.days)}일 → 7일 환산)` : '이번 주 광고비'}</span><strong>${esc(cash(b.current))}</strong></div>
        <div class="perf-ai-stat"><span>증감</span><strong>${esc(signedCash(b.delta))}</strong><small>${esc(fmt.signed(b.deltaPct, 1, '%'))}</small></div>
      </div>
      <div class="perf-budget">${items || '<p class="panel-note">아직 채널별 예산 제안이 없어요.</p>'}</div>
      ${(b.notes || []).length ? `<p class="panel-note mt-8">${b.notes.map(esc).join(' · ')}</p>` : ''}
      ${actions ? `<div class="perf-actions">${actions}</div>` : ''}
      ${compact ? '' : `<div class="perf-ai-foot"><span class="panel-note">AI · 참고용 · ${esc(a.model || '')}${when ? ` · ${esc(when)} 생성` : ''}${S.ai.cached ? ' (이 탭에 저장된 결과)' : ''}. 예산 총액은 서버가 기준 광고비의 ±20% 안으로 맞춰요.</span></div>`}`;
  }
  function renderAi() {
    const box = ref('ai');
    if (!box) return;
    const st = S.ai.state;
    const again = st === 'ok' || st === 'error'
      ? `<button type="button" class="btn small" data-act="ai-again">${icon('refresh')} 다시 만들기</button>` : '';
    const head = `<div class="card-head"><div class="perf-ai-title"><div class="bot-symbol" aria-hidden="true">✳</div><h2>AI 제안 · 다음 주 예산 배분</h2>${badge('AI', 'purple')}</div>${again}</div>`;
    let body;
    if (st === 'nokey') {
      body = `<p class="note">AI 연결 안 됨 — 설정 › 연결에서 OpenAI 키를 넣으면 AI 해석과 다음 주 예산 제안을 받을 수 있어요. 지금은 위의 숫자 기준 문구만 보여 줘요.</p>`;
    } else if (st === 'error') {
      body = `<p class="note error">AI 제안을 만들지 못했어요: ${esc(S.ai.message)}</p><p class="panel-note mt-8">잘한 점 · 개선할 점은 숫자 기준 문구 그대로예요.</p>`;
    } else if (st === 'ok') {
      body = adviceHtml(S.ai.data);
    } else {
      body = `<div class="perf-loading"><span class="spinner" aria-hidden="true"></span>AI가 이 기간의 숫자를 보고 있어요… (보통 10~30초)</div>`;
    }
    box.innerHTML = head + body;
  }

  /* ───────── 화면: 성과분석 ───────── */
  function renderInfo() {
    const box = ref('info');
    if (!box) return;
    const s = S.sum, d = S.data, m = d.meta || {}, u = REBOOT.user();
    const cmp = s.compare;
    const today = REBOOT.today();
    box.innerHTML = `
      <div class="perf-info-item"><span>보고 기간</span><strong>${esc(M.fmtPeriod(s.start, s.end))}</strong><small>${esc(s.days)}일 · CSV ${esc(s.rows)}행</small></div>
      <div class="perf-info-item"><span>비교 기간</span>${cmp
        ? `<strong>${esc(M.fmtPeriod(cmp.start, cmp.end))}</strong><small>${esc(cmp.label)}</small>`
        : `<strong>데이터 없음</strong><small>비교 기간이 CSV 시작일(${esc(S.rng.start)})보다 앞이라 비교하지 않음</small>`}</div>
      <div class="perf-info-item"><span>작성일</span><strong>${esc(today.replace(/-/g, '.'))}</strong><small>${esc(u.name || '')}</small></div>
      <div class="perf-info-item"><span>데이터</span><strong>${d.isSample ? badge('예시', 'orange') : '올린 데이터'}</strong>
        <small>${esc(M.fmtPeriod(S.rng.start, S.rng.end))} · ${esc(fmt.num(S.rows.length))}행${!d.isSample && m.updatedBy ? ` · ${esc(m.updatedBy)}` : ''}${!d.isSample && m.filename ? ` · ${esc(m.filename)}` : ''}</small>
        <div class="perf-info-actions">
          ${d.isSample ? '' : `<button type="button" class="btn small ghost" data-act="reset">${icon('trash')} 예시로 되돌리기</button>`}
        </div></div>`;
  }

  function renderKpis() {
    const box = ref('kpis');
    if (!box) return;
    const s = S.sum, t = s.totals, cmp = s.compare;
    const card = (key, label, value, unit, featured) => {
      const d = s.change[key];
      const tone = M.tone(key, d);
      return ui.kpi({
        label, value, unit, featured, icon: KPI_ICONS[key],
        change: d == null ? '' : `${arrow(d)} ${fmt.num(Math.abs(d), 1)}%`,
        tone: tone === 'bad' ? 'down' : tone === 'good' ? '' : 'flat',
        foot: cmp ? cmp.label : '비교 데이터 없음'
      });
    };
    const usd = usdOn();
    const big = n => (usd ? fmt.num(Math.round(n / rate())) : man(n));
    const unit = usd ? '달러' : '원';
    box.innerHTML = [
      card('spend', '총 광고비', big(t.spend), unit, true),
      card('revenue', '총 매출', big(t.revenue), unit),
      card('roas', 'ROAS (광고비 대비 매출)', fmt.num(t.roas, 0), '%'),
      card('conversions', '전환수', fmt.num(t.conversions), '건'),
      card('cpa', 'CPA (전환당 비용)', usd ? fmt.num(t.cpa / rate(), 2) : fmt.num(t.cpa), unit),
      card('profit', '순수익 (매출 − 광고비)', big(t.profit), unit)
    ].join('');
  }

  function tableHtml(forReport) {
    const s = S.sum, t = s.totals;
    const usd = !forReport && S.currency === 'USD';
    const cash = n => (usd ? money(n) : fmt.krw(n));
    const best = s.best && s.best.channel, worst = s.worst && s.worst.channel;
    const head = ['채널', '광고비', '노출수', '클릭수', 'CTR', '전환수', 'CVR', 'CPA', '매출', 'ROAS', '순수익'];
    // 머리글 정렬 (화면만 · 보고서는 원래 순서): 누를 때마다 내림차순 ↔ 오름차순
    const sort = !forReport && S.sort;
    const list = sort ? s.channels.slice().sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;   // 값 없는 채널은 늘 아래
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
    }) : s.channels;
    const rows = list.map(c => {
      const sel = !forReport && S.selected.has(c.channel);
      const tags = (c.channel === best ? badge('ROAS 최고', 'green') : '') + (c.channel === worst ? badge('ROAS 최저', 'orange') : '');
      return `<tr${forReport ? '' : ` class="clickable${sel ? ' selected' : ''}" data-ch="${esc(c.channel)}" tabindex="0" aria-selected="${sel}"`}>
        <td><span class="perf-ch"><span class="perf-swatch" style="background:${esc(chColor(c.channel))}" aria-hidden="true"></span>${esc(c.channel)}${tags}</span></td>
        <td class="num">${esc(cash(c.spend))}</td>
        <td class="num">${esc(fmt.num(c.impressions))}</td>
        <td class="num">${esc(fmt.num(c.clicks))}</td>
        <td class="num">${esc(fmt.pct(c.ctr, 2))}</td>
        <td class="num">${esc(fmt.num(c.conversions))}</td>
        <td class="num">${esc(fmt.pct(c.cvr, 2))}</td>
        <td class="num">${esc(cash(c.cpa))}${deltaHtml('cpa', c.change.cpa)}</td>
        <td class="num">${esc(cash(c.revenue))}${deltaHtml('revenue', c.change.revenue)}</td>
        <td class="num">${esc(fmt.pct(c.roas, 0))}${deltaHtml('roas', c.change.roas)}</td>
        <td class="num${c.profit < 0 ? ' perf-loss' : ''}">${esc(cash(c.profit))}</td></tr>`;
    }).join('');
    const foot = `<tr><td>합계</td><td class="num">${esc(cash(t.spend))}</td><td class="num">${esc(fmt.num(t.impressions))}</td>
      <td class="num">${esc(fmt.num(t.clicks))}</td><td class="num">${esc(fmt.pct(t.ctr, 2))}</td><td class="num">${esc(fmt.num(t.conversions))}</td>
      <td class="num">${esc(fmt.pct(t.cvr, 2))}</td><td class="num">${esc(cash(t.cpa))}</td><td class="num">${esc(cash(t.revenue))}</td>
      <td class="num">${esc(fmt.pct(t.roas, 0))}</td><td class="num${t.profit < 0 ? ' perf-loss' : ''}">${esc(cash(t.profit))}</td></tr>`;
    return `<table class="data-table"><caption class="sr-only">채널별 성과 (${esc(M.fmtPeriod(s.start, s.end))})</caption>
      <thead><tr>${head.map((h, i) => {
        const tip = !forReport && HEAD_TIPS[h];
        const sub = HEAD_SUB[h] ? `<span class="perf-th-sub">${HEAD_SUB[h]}</span>` : '';
        if (forReport) return `<th${i ? ' class="num"' : ''} scope="col">${h}${sub}</th>`;
        const k = SORT_KEYS[h], on = sort && sort.k === k;
        const label = `<span class="perf-th-label">${tip ? `<span class="perf-tip" data-tip="${esc(tip)}">${h}</span>` : h}${sub}</span>`;
        return `<th class="${i ? 'num' : ''}${on ? ' sorted' : ''}" scope="col"${on ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>
          <button type="button" class="perf-th-sort" data-act="sort-col" data-k="${k}" title="누를 때마다 내림차순 ↔ 오름차순">${label}<i aria-hidden="true">${on ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</i></button></th>`;
      }).join('')}</tr></thead>
      <tbody>${rows}</tbody><tfoot>${foot}</tfoot></table>`;
  }
  const SORT_KEYS = { 채널: 'channel', 광고비: 'spend', 노출수: 'impressions', 클릭수: 'clicks', CTR: 'ctr', 전환수: 'conversions',
    CVR: 'cvr', CPA: 'cpa', 매출: 'revenue', ROAS: 'roas', 순수익: 'profit' };
  // 영어 약자 머리글 아래에 늘 보이는 짧은 설명 (화면 · 보고서 공통)
  const HEAD_SUB = { CTR: '클릭률', CVR: '전환율', CPA: '전환당 비용', ROAS: '광고비 대비 매출' };
  // 채널별 성과 표 머리글에 마우스를 올리면 보이는 설명
  const HEAD_TIPS = {
    광고비: '이 기간에 광고에 쓴 돈',
    노출수: '광고가 화면에 보인 횟수',
    클릭수: '광고를 누른 횟수',
    CTR: '클릭률 = 클릭수 ÷ 노출수. 광고를 본 사람 중 누른 비율',
    전환수: '광고를 통해 구매(전환)한 건수',
    CVR: '전환율 = 전환수 ÷ 클릭수. 광고를 누른 사람 중 구매한 비율',
    CPA: '전환당 비용 = 광고비 ÷ 전환수. 구매 1건을 얻는 데 든 광고비 (낮을수록 좋음)',
    매출: '광고를 통해 발생한 매출',
    ROAS: '광고비 대비 매출 = 매출 ÷ 광고비. 100%보다 높으면 쓴 광고비보다 매출이 큼',
    순수익: '매출 − 광고비. 제품 원가·배송비 등은 빼지 않은 값'
  };
  function renderTable() {
    const box = ref('table');
    if (box && S.sum) box.innerHTML = tableHtml(false);
    const unit = ref('unit');
    if (unit) unit.textContent = S.currency === 'USD' ? `금액: 달러 (1$ = ${fmt.num(rate(), 1)}원)` : '금액: 원';
  }

  function renderBody() {
    const body = ref('body');
    if (!body) return;
    destroyCharts();
    if (!S.sum.rows) {
      body.innerHTML = `<section class="card">${ui.empty('이 기간에는 CSV 데이터가 없어요. 기간을 바꿔 주세요.', 'calendar')}</section>`;
      return;
    }
    body.innerHTML = `
      <section class="card perf-info" data-ref="info" aria-label="기본 정보"></section>
      <div class="kpis six" data-ref="kpis"></div>
      <section class="card">
        <div class="card-head"><h2><button type="button" class="perf-fold" data-act="fold-table" aria-expanded="${S.tableOpen !== false}" aria-controls="perf-table-body">채널별 성과</button><span class="head-cap" data-ref="unit"></span></h2>
          <div class="perf-table-tools">
            <div class="seg" role="group" aria-label="통화">
              <button type="button" data-cur="KRW" class="${S.currency === 'KRW' ? 'selected' : ''}" aria-pressed="${S.currency === 'KRW'}">원화</button>
              <button type="button" data-cur="USD" class="${S.currency === 'USD' ? 'selected' : ''}" aria-pressed="${S.currency === 'USD'}">달러</button>
            </div>
            <button type="button" class="btn small" data-act="fx">${icon('refresh')} 최신 환율 받기</button>
            <span class="perf-fx" data-ref="fx-label"></span>
          </div></div>
        <div class="perf-insight" data-ref="insight" aria-live="polite" hidden></div>
        <div id="perf-table-body"${S.tableOpen === false ? ' hidden' : ''}><div class="table-wrap" data-ref="table"></div>
        <p class="panel-note mt-8">행을 누르면 아래 일별 추이에 그 채널의 매출(실선)·광고비(점선)가 나와요. 여러 채널을 고를 수 있고, 다시 누르면 해제돼요. 달러를 고르면 핵심 지표·차트·AI 문장도 달러로 보여요 (보고서·인쇄는 원화).</p></div>
      </section>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>채널별 광고비 대비 매출<span class="head-cap" data-ref="bar-unit">단위: 원 (만 원 표시)</span></h2></div>
          <div class="perf-chart"><canvas data-ref="bar" role="img" aria-label="채널별 광고비와 매출 막대 차트 (숫자는 위 표에 있음)"></canvas></div></section>
        <section class="card"><div class="card-head"><h2>일별 매출 추이<span class="head-cap" data-ref="line-note"></span></h2></div>
          <div class="perf-chart"><canvas data-ref="line" role="img" aria-label="일별 매출 추이 선 차트 (범례를 누르면 선을 숨기거나 보임)"></canvas></div></section>
      </div>
      <div class="grid-2" data-ref="review"></div>
      <section class="card tinted perf-ai" data-ref="ai" aria-live="polite"></section>`;
    renderInfo();
    renderKpis();
    renderTable();
    renderInsight();
    paintFx();
    renderReview();
    renderAi();
    drawCharts();
  }

  function renderMain() {
    const p = S.period, d = S.data;
    S.root.innerHTML = `
      <div class="perf-wrap">
        ${d.isSample ? `<p class="note warn" role="note">${badge('예시', 'orange')} 매출 데이터를 업로드하면 실제 데이터로 바뀌어요.</p>` : ''}
        <div class="filters">
          <div class="perf-dates">
            <label><span class="sr-only">시작일</span><input class="input" type="date" data-ref="start" min="${esc(S.rng.start)}" max="${esc(S.rng.end)}" value="${esc(p.start)}"></label>
            <span class="perf-tilde" aria-hidden="true">—</span>
            <label><span class="sr-only">종료일</span><input class="input" type="date" data-ref="end" min="${esc(S.rng.start)}" max="${esc(S.rng.end)}" value="${esc(p.end)}"></label>
            <button type="button" class="btn small" data-act="last7">최근 7일</button>
            ${sourceBadge()}
          </div>
          ${ui.fileActions(
            ui.fileBtn('upload', { label: '매출 데이터 업로드', type: 'CSV', act: 'upload' }) +
            ui.fileMenu('download', { items: [
              { label: '성과 데이터 (CSV)', href: '/api/performance/export.csv' },
              { label: '업로드 양식 (CSV)', act: 'template' }] }) +
            ui.fileBtn('report', { type: 'PDF', act: 'report' }))}
        </div>
        <div class="perf-wrap" data-ref="body"></div>
      </div>`;
    renderBody();
  }

  function changePeriod(start, end) {
    setPeriod(start, end);
    const s = ref('start'), e = ref('end');
    if (s) s.value = S.period.start;
    if (e) e.value = S.period.end;
    renderBody();
    scheduleAdvice();
  }

  /* ───────── 업로드 ───────── */
  function readBytes(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const r = new global.FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  }
  function decodeText(buf) {
    try { return new global.TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { /* 엑셀 한글 CSV */ }
    try { return new global.TextDecoder('euc-kr').decode(buf); } catch (e) { return ''; }
  }
  async function openUpload() {
    let file = null, mode = 'merge', check = null;
    const body = `<div class="part-performance"><div class="perf-upload">
      <p class="small muted">첫 줄(제목)은 <b>${esc(M.HEADER.join(','))}</b> 순서여야 해요. 엑셀에서 저장한 CSV(EUC-KR)도 그대로 올릴 수 있어요.</p>
      <label class="field"><span class="field-label">CSV 파일</span><input type="file" accept=".csv,text/csv" data-ref="file"></label>
      <div class="perf-preview" data-ref="preview" aria-live="polite"></div>
      <div class="field"><span class="field-label">방식</span>
        <div class="choice-grid perf-modes">
          <button type="button" class="choice selected" data-mode="merge" aria-pressed="true"><b>합치기</b><small>기존 데이터에 추가 · 같은 날짜+채널은 새 값으로</small></button>
          <button type="button" class="choice" data-mode="replace" aria-pressed="false"><b>전체 바꾸기</b><small>기존 데이터를 삭제하고 새 파일로</small></button>
        </div></div>
      <p class="panel-note mt-16">덮어쓰기 전 이전 파일은 서버에 날짜·시간별로 자동 보관돼요. ${S.data.isSample ? '지금은 예시 데이터라, 처음 올리는 파일은 예시 데이터와 섞지 않고 새로 시작해요.' : ''}</p>
    </div></div>`;
    const showPreview = (el, html) => { el.querySelector('[data-ref="preview"]').innerHTML = html; };
    const res = await ui.modal({
      title: '매출 데이터 업로드 (CSV)',
      body,
      actions: [
        { label: '취소', value: null },
        {
          label: '업로드', value: 'ok', tone: 'lime',
          onClick: el => {
            if (!file) { showPreview(el, '<p class="note error">CSV 파일을 골라 주세요.</p>'); return false; }
            if (check && !check.ok) return false;
            return true;
          }
        }
      ],
      onOpen: el => {
        const input = el.querySelector('[data-ref="file"]');
        input.addEventListener('change', async () => {
          file = input.files && input.files[0] ? input.files[0] : null;
          check = null;
          if (!file) { showPreview(el, ''); return; }
          if (file.size > 5 * 1024 * 1024) { check = { ok: false }; showPreview(el, '<p class="note error">파일이 너무 커요 (5MB 이하).</p>'); return; }
          let r;
          try { r = M.parseCsv(decodeText(await readBytes(file))); } catch (e) { r = { ok: false, error: '파일을 읽지 못했어요.', errors: [] }; }
          check = r;
          if (!r.ok) {
            const more = r.errors.length > 1 ? ` 외 ${r.errors.length - 1}곳` : '';
            showPreview(el, `<p class="note error">${esc(r.error)}${esc(more)}</p>`);
            return;
          }
          const rng = M.range(r.rows), ch = M.channels(r.rows);
          showPreview(el, `<p class="note lime">✓ ${esc(fmt.num(r.rows.length))}행 · ${esc(M.fmtPeriod(rng.start, rng.end))} · 채널 ${ch.length}개 (${esc(ch.slice(0, 6).join(', '))}${ch.length > 6 ? ' …' : ''})</p>`);
        });
        el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
          mode = b.dataset.mode;
          el.querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        }));
      }
    });
    if (res !== 'ok' || !file) return;
    const btn = S.root.querySelector('[data-act="upload"]');
    busy(btn, true);
    try {
      const fd = new global.FormData();
      fd.append('file', file, file.name);
      fd.append('mode', mode);
      const r = await REBOOT.upload('/api/performance/upload', fd);
      const x = r.result || {};
      toast(`파일을 올렸어요: 전체 ${fmt.num(x.rows)}행 (새 행 ${fmt.num(x.added)} · 바꾼 행 ${fmt.num(x.updated)})`);
      weekP = null;
      applyData(r);
      const inside = S.period && S.period.start >= S.rng.start && S.period.end <= S.rng.end;
      const p = inside ? S.period : M.latestWeek(S.rng);
      setPeriod(p.start, p.end);
      renderMain();
      scheduleAdvice();
    } catch (e) {
      toast(`파일을 올리지 못했어요: ${e.message}`, 'error');
      busy(btn, false);
    }
  }
  async function resetToSample() {
    const ok = await ui.confirm('올린 성과 데이터를 삭제하고 예시 데이터로 되돌릴까요? 지금 파일은 서버에 따로 보관돼요.', { ok: '예시로 되돌리기', danger: true });
    if (!ok) return;
    try {
      await REBOOT.api('/api/performance', undefined, { method: 'DELETE' });
      toast('예시 데이터로 되돌렸어요. 이전 파일은 서버에 따로 보관했어요.');
      weekP = null;
      await load();
    } catch (e) { toast(`예시로 되돌리지 못했어요: ${e.message}`, 'error'); }
  }

  /* ───────── 보고서 (A4) ───────── */
  function reportSummaryText() {
    const s = S.sum, t = s.totals;
    const top = s.channels.slice().sort((a, b) => b.revenue - a.revenue)[0];
    const parts = [`총 매출 ${fmt.krw(t.revenue)}, 광고비 ${fmt.krw(t.spend)}으로 ROAS ${fmt.pct(t.roas, 0)}를 기록했어요.`,
      `전환수는 ${fmt.num(t.conversions)}건, 순수익(매출 − 광고비)은 ${fmt.krw(t.profit)}이에요.`];
    if (top && t.revenue) parts.push(`${top.channel}이(가) 매출의 ${fmt.pct(top.revenue / t.revenue * 100, 1)}를 차지해요.`);
    if (s.compare && s.change.revenue != null) parts.push(`${s.compare.label} 매출 ${fmt.signed(s.change.revenue, 1, '%')}, ROAS ${fmt.signed(s.change.roas, 1, '%')}.`);
    return parts.join(' ');
  }
  function reportKpis() {
    const s = S.sum, t = s.totals;
    const item = (key, label, value) => {
      const d = s.change[key];
      return `<div class="perf-report-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong>${deltaHtml(key, d) || `<span class="perf-delta none">${s.compare ? '—' : '비교 없음'}</span>`}</div>`;
    };
    return `<div class="perf-report-kpis">
      ${item('spend', '총 광고비', fmt.krw(t.spend))}${item('revenue', '총 매출', fmt.krw(t.revenue))}${item('roas', 'ROAS (광고비 대비 매출)', fmt.pct(t.roas, 0))}
      ${item('conversions', '전환수', fmt.num(t.conversions) + '건')}${item('cpa', 'CPA (전환당 비용)', fmt.krw(t.cpa))}${item('profit', '순수익', fmt.krw(t.profit))}</div>`;
  }
  function reportAi() {
    const box = ref('report-ai');
    const rev = ref('report-review');
    if (!box || !rev) return;
    const ai = S.ai.state === 'ok' ? S.ai.data : null;
    const num = M.insights(S.sum);
    const tag = ai ? `${badge('AI', 'purple')}<span class="tiny muted">참고용</span>` : badge('숫자 기준');
    const an = (ai && ai.analysis) || {};
    rev.innerHTML = `<div class="perf-report-box"><h3>잘한 점 ${an.good ? tag : badge('숫자 기준')}</h3>${reviewPlain(an.good || num.good)}</div>
      <div class="perf-report-box"><h3>개선할 점 ${an.improve ? tag : badge('숫자 기준')}</h3>${reviewPlain(an.improve || num.improve)}</div>`;
    if (ai) {
      const b = ai.budget || { items: [] };
      box.innerHTML = `${ai.overview ? `<p>${esc(ai.overview)}</p>` : ''}
        <table class="data-table mt-16"><thead><tr><th scope="col">채널</th><th class="num" scope="col">다음 주 예산</th><th class="num" scope="col">${b.scaled ? '기준(7일 환산)' : '이번 주'}</th><th class="num" scope="col">증감</th><th class="num" scope="col">비중</th><th scope="col">근거</th></tr></thead>
        <tbody>${(b.items || []).map(i => `<tr><td>${esc(i.channel)}</td><td class="num">${esc(fmt.krw(i.amount))}</td><td class="num">${esc(fmt.krw(i.current))}</td>
          <td class="num">${esc(signedKrw(i.delta))}</td><td class="num">${esc(fmt.pct(i.share, 0))}</td><td>${esc(i.reason)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>합계</td><td class="num">${esc(fmt.krw(b.total))}</td><td class="num">${esc(fmt.krw(b.current))}</td><td class="num">${esc(signedKrw(b.delta))}</td><td class="num">100%</td><td></td></tr></tfoot></table>
        ${(ai.actions || []).length ? `<ol>${ai.actions.map(x => `<li><b>${esc(x.title)}</b> — ${esc(x.detail)}${x.season ? ` (${esc(x.season)})` : ''}</li>`).join('')}</ol>` : ''}
        <p class="panel-note mt-8">AI 제안 · 참고용 (${esc(ai.model || '')}). 예산 총액은 기준 광고비의 ±20% 안으로 맞췄어요. 최종 결정은 담당자가 해요.</p>`;
    } else if (S.ai.state === 'loading' || S.ai.state === 'idle') {
      box.innerHTML = `<div class="perf-loading no-print"><span class="spinner" aria-hidden="true"></span>AI 제안을 만드는 중…</div>`;
    } else {
      box.innerHTML = `<p class="note">${S.ai.state === 'nokey' ? 'AI 연결 안 됨 — 설정 › 연결에서 OpenAI 키를 넣으면 다음 주 예산·실행 과제 제안이 들어가요.' : `AI 제안을 만들지 못했어요: ${esc(S.ai.message || '')}`}</p>`;
    }
  }
  function reportOptions(custom) {
    const latest = M.latestWeek(S.rng);
    const opts = [];
    const same = (a, b) => a && b && a.start === b.start && a.end === b.end;
    if (custom) opts.push({ start: custom.start, end: custom.end, label: `${M.fmtPeriod(custom.start, custom.end)} (직접 지정)` });
    if (!same(custom, latest)) opts.push({ start: latest.start, end: latest.end, label: `${M.fmtPeriod(latest.start, latest.end)} (최근 7일)` });
    M.weeks(S.rng).forEach(w => { if (!same(w, custom) && !same(w, latest)) opts.push({ start: w.start, end: w.end, label: `${M.fmtPeriod(w.start, w.end)} (월~일)` }); });
    return opts;
  }
  function renderReportSheet() {
    destroyCharts();
    const sheet = ref('sheet');
    const s = S.sum, d = S.data, m = d.meta || {}, u = REBOOT.user();
    if (!s.rows) {
      sheet.innerHTML = ui.empty('이 기간에는 CSV 데이터가 없어요. 다른 주를 골라 주세요.', 'calendar');
      return;
    }
    sheet.innerHTML = `
      <div class="between"><strong class="perf-wordmark">REB∞T</strong>${d.isSample ? badge('예시', 'orange') : badge('WEEKLY REPORT', 'dark')}</div>
      <p class="eyebrow">WEEKLY MARKETING REPORT</p>
      <h1>미국 채널 주간 성과 보고서</h1>
      <p class="muted small">${esc(M.fmtPeriod(s.start, s.end))} (${esc(s.days)}일) · 비교 ${s.compare ? `${esc(M.fmtPeriod(s.compare.start, s.compare.end))} (${esc(s.compare.label)})` : '없음 (CSV 시작일 이전)'} · 작성 ${esc(u.name || '')} · ${esc(REBOOT.today().replace(/-/g, '.'))}</p>
      <div class="perf-report-rule"></div>
      <h2>01. 핵심 지표 요약</h2>
      ${reportKpis()}
      <p>${esc(reportSummaryText())}</p>
      <h2>02. 채널별 성과</h2>
      <div class="table-wrap">${tableHtml(true)}</div>
      <h2>03. 차트</h2>
      <div class="perf-report-charts">
        <div><p class="small muted">채널별 광고비 대비 매출</p><div class="perf-chart small"><canvas data-ref="bar" role="img" aria-label="채널별 광고비와 매출 막대 차트"></canvas></div></div>
        <div><p class="small muted">일별 매출 추이 (채널별)</p><div class="perf-chart small"><canvas data-ref="line" role="img" aria-label="채널별 일별 매출 선 차트"></canvas></div></div>
      </div>
      <h2>04. 잘한 점 · 개선할 점</h2>
      <div class="perf-report-two" data-ref="report-review"></div>
      <h2>05. 다음 주 예산 · 실행 계획</h2>
      <div data-ref="report-ai"></div>
      <p class="panel-note perf-report-foot">이 보고서는 ${d.isSample ? '예시 데이터' : `올린 성과 데이터${m.filename ? ` (${esc(m.filename)})` : ''}`}를 바탕으로 자동으로 만들었어요. 지표 계산: ROAS(광고비 대비 매출) = 매출 ÷ 광고비 × 100, CPA(전환당 비용) = 광고비 ÷ 전환수, 합계는 채널 합계로 다시 계산. AI 해석은 참고용이고 최종 판단은 담당자가 해요.</p>`;
    S.selected.clear();
    drawBar(ref('bar'));
    drawLine(ref('line'));
    reportAi();
  }
  function renderReport() {
    REBOOT.page.heading(false);
    REBOOT.page.crumb('성과분석 › 주간 보고서');
    const q = params();
    const custom = q.get('start') && q.get('end') ? M.clampPeriod(q.get('start'), q.get('end'), S.rng) : null;
    const p = custom || M.latestWeek(S.rng);
    setPeriod(p.start, p.end);
    const opts = reportOptions(custom);
    S.root.innerHTML = `
      <div class="perf-report-bar no-print">
        <a class="btn" href="/dashboard/performance?start=${encodeURIComponent(S.period.start)}&end=${encodeURIComponent(S.period.end)}" data-ref="back">← 성과분석으로</a>
        <label>보고 기간 <select class="input" data-ref="week">${opts.map((o, i) => `<option value="${i}"${o.start === S.period.start && o.end === S.period.end ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
        ${ui.fileBtn('download', { label: 'PDF 다운로드', type: '인쇄', act: 'print', title: '브라우저 인쇄 창에서 PDF로 저장' })}
      </div>
      <article class="perf-report" data-ref="sheet" aria-label="성과 보고서"></article>`;
    ref('week').addEventListener('change', e => {
      const o = opts[+e.target.value];
      if (!o) return;
      setPeriod(o.start, o.end);
      if (global.history && global.history.replaceState) global.history.replaceState(null, '', `?view=report&start=${o.start}&end=${o.end}`);
      ref('back').setAttribute('href', `/dashboard/performance?start=${encodeURIComponent(o.start)}&end=${encodeURIComponent(o.end)}`);
      renderReportSheet();
      scheduleAdvice();
    });
    renderReportSheet();
    scheduleAdvice();
    // 인쇄할 때 차트 크기를 종이 폭에 맞춤
    const fit = () => Object.keys(S.charts).forEach(k => { try { S.charts[k].resize(); } catch (e) { /* 무시 */ } });
    global.addEventListener('beforeprint', fit);
    global.addEventListener('afterprint', fit);
  }

  /* ───────── 시작 ───────── */
  async function load() {
    S.root.innerHTML = '<div class="skeleton perf-skeleton"></div>';
    try {
      applyData(await REBOOT.api('/api/performance/data'));
    } catch (e) {
      S.root.innerHTML = `<section class="card"><p class="note error">성과 데이터를 불러오지 못했어요. ${esc(e.message)}</p></section>`;
      return;
    }
    if (!S.rows.length) {
      S.root.innerHTML = `<section class="card">${ui.empty('아직 성과 데이터가 없어요. 매출 데이터 업로드를 눌러 시작하세요.', 'upload')}
        <div class="flex mt-16 perf-center">${ui.fileBtn('upload', { label: '매출 데이터 업로드', type: 'CSV', act: 'upload' })}
        ${ui.fileBtn('download', { label: '양식 다운로드', type: 'CSV', act: 'template' })}</div></section>`;
      return;
    }
    if (S.view === 'report') {
      renderReport();
      return;
    }
    const q = params();
    const init = q.get('start') && q.get('end') ? M.clampPeriod(q.get('start'), q.get('end'), S.rng) : M.latestWeek(S.rng);
    setPeriod(init.start, init.end);
    renderMain();
    loadFx(false);
    scheduleAdvice();
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act && S.root.contains(act)) {
      const a = act.dataset.act;
      if (a === 'last7') { const w = M.latestWeek(S.rng); changePeriod(w.start, w.end); }
      else if (a === 'upload') openUpload();
      else if (a === 'template') ui.download('reboot-performance-template.csv', ui.csv([M.HEADER]), 'text/csv;charset=utf-8');
      else if (a === 'report') global.location.href = `/dashboard/performance?view=report&start=${encodeURIComponent(S.period.start)}&end=${encodeURIComponent(S.period.end)}`;
      else if (a === 'fx') loadFx(true, act);
      else if (a === 'fold-table') {   // 채널별 성과 표 접기·펴기
        S.tableOpen = act.getAttribute('aria-expanded') !== 'true';
        act.setAttribute('aria-expanded', String(S.tableOpen));
        S.root.querySelector('#perf-table-body').hidden = !S.tableOpen;
      }
      else if (a === 'ai-again') scheduleAdvice(true);
      else if (a === 'insight-again') scheduleInsight(true);
      else if (a === 'sort-col') {
        // 같은 칸을 다시 누르면 방향만 바뀜 · 다른 칸은 채널 이름은 가나다순, 숫자는 큰 값부터
        const k = act.dataset.k;
        S.sort = S.sort && S.sort.k === k ? { k, dir: -S.sort.dir } : { k, dir: k === 'channel' ? 1 : -1 };
        renderTable();
      }
      else if (a === 'reset') resetToSample();
      else if (a === 'print') global.print();
      return;
    }
    const cur = e.target.closest('[data-cur]');
    if (cur) {
      S.currency = cur.dataset.cur === 'USD' ? 'USD' : 'KRW';
      S.root.querySelectorAll('[data-cur]').forEach(b => { b.classList.toggle('selected', b === cur); b.setAttribute('aria-pressed', String(b === cur)); });
      renderCurrency();
      return;
    }
    const tr = e.target.closest('tr[data-ch]');
    if (tr) toggleChannel(tr.dataset.ch);
  }
  function toggleChannel(ch) {
    if (S.selected.has(ch)) S.selected.delete(ch); else S.selected.add(ch);
    renderTable();
    destroyCharts();
    drawCharts();
    try {
      const again = S.root.querySelector(`tr[data-ch="${global.CSS.escape(ch)}"]`);
      if (again) again.focus();
    } catch (e) { /* 포커스는 못 옮겨도 됨 */ }
  }

  function render(root) {
    S.root = root;
    root.classList.add('part-performance');
    if (!M) {
      root.innerHTML = '<p class="part-error">성과분석 계산 기능을 불러오지 못했어요. 페이지를 새로고침해 주세요.</p>';
      return;
    }
    S.view = params().get('view') === 'report' ? 'report' : 'main';
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => {
      const tr = e.target.closest && e.target.closest('tr[data-ch]');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleChannel(tr.dataset.ch); }
    });
    root.addEventListener('change', e => {
      const r = e.target.dataset && e.target.dataset.ref;
      if (r !== 'start' && r !== 'end') return;
      const s = ref('start').value, en = ref('end').value;
      if (!M.isIso(s) || !M.isIso(en)) return;
      changePeriod(s, en);
    });
    watchTheme();
    load();
  }

  REBOOT.register({
    id: 'performance', label: '성과 분석', order: 70,
    title: '숫자에서 찾는, 다음 성장의 힌트.',
    subtitle: '채널별 성과를 비교하고, 다음 캠페인을 위한 인사이트를 발견하세요.',
    render
  });
  REBOOT.expose('performance', { weekSummary, summary });
})(typeof window !== 'undefined' ? window : globalThis);
