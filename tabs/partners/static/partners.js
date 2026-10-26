/* 인플루언서 · 파트너 (대표 파일) — 메뉴 등록 · 탭 틀만 둡니다. 기능 코드는 넣지 않습니다 (팀 README 4장).
   파트너 찾기 · 제안 작성 → outreach.js  REBOOT.use('partners.outreach').render(el, 'contacts' | 'mail')
   협업 관리 · 성과     → records.js   REBOOT.use('partners.records').render(el, 'history' | 'sales')
   다른 파일은 탭을 바꿀 때 .part-partners 요소에 CustomEvent('ptn:go', {detail:{tab}})를 보냅니다.
   첫 화면은 항상 파트너 찾기 (주소에 #mail · #history · #sales가 있으면 그 탭) */
(function (global) {
  'use strict';

  const REBOOT = global.REBOOT;
  const doc = global.document;
  const { esc, icon } = REBOOT.ui;
  const TABS = [
    // V2 시안 이름·순서 (2026-10-26): 파트너 찾기 → 협업 관리 → 제안 작성 → 성과. id는 예전 주소(#contacts …) 그대로
    { id: 'contacts', label: '파트너 찾기', file: 'partners.outreach', view: 'contacts',
      head: ['다음 파트너를 만나보세요.', '후보를 고르고, 함께할 일을 제안하세요.'] },
    { id: 'history', label: '협업 관리', file: 'partners.records', view: 'history',
      head: ['협업의 다음 단계를 이어가세요.', '진행 상태와 지난 대화를 한곳에서 확인하세요.'] },
    { id: 'mail', label: '제안 작성', file: 'partners.outreach', view: 'mail',
      head: ['좋은 제안은, 명확한 조건에서.', '대상과 조건을 정리하고, 메일과 가이드로 이어가세요.'] },
    { id: 'sales', label: '성과', file: 'partners.records', view: 'sales',
      head: ['누가 성과를 만들고 있나요?', '예시 누적 실적 · 실제 매출 및 정산 자료가 아닙니다.'] }
  ];
  const tabOf = id => TABS.find(t => t.id === id);

  function render(root) {
    root.classList.add('part-partners');
    root.innerHTML = `
      <div class="tabs ptn-tabs" role="tablist" aria-label="인플루언서 · 파트너">
        ${TABS.map(t => `<button type="button" role="tab" id="ptn-tab-${t.id}" data-tab="${t.id}" aria-selected="false" aria-controls="ptn-panel" tabindex="-1">${esc(t.label)}</button>`).join('')}
      </div>
      <div class="ptn-panel" id="ptn-panel" role="tabpanel"></div>`;

    let current = '';
    function show(id, opts) {
      const t = tabOf(id) || TABS[0];
      current = t.id;
      root.querySelectorAll('[data-tab]').forEach(b => {
        const on = b.dataset.tab === t.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      // 이전 탭 화면의 이벤트가 남지 않게 새 요소로 바꿈
      const old = root.querySelector('.ptn-panel');
      const panel = old.cloneNode(false);
      panel.setAttribute('aria-labelledby', `ptn-tab-${t.id}`);
      old.replaceWith(panel);
      if (global.history && global.history.replaceState && global.location.hash !== '#' + t.id) {
        global.history.replaceState(null, '', '#' + t.id);
      }
      REBOOT.page.title(t.head[0]);
      REBOOT.page.subtitle(t.head[1]);
      if (opts && opts.scroll) global.scrollTo({ top: 0, behavior: 'smooth' });   // 메뉴를 바꾸면 맨 위로 (README 3장)
      try {
        REBOOT.use(t.file).render(panel, t.view);
      } catch (e) {
        panel.innerHTML = `<p class="part-error">${esc(t.label)} 화면을 불러오지 못했어요. ${esc(e && e.message)}</p>`;
      }
    }

    const tablist = root.querySelector('.ptn-tabs');
    tablist.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) show(b.dataset.tab);
    });
    tablist.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = TABS.findIndex(t => t.id === current);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      show(TABS[next].id);
      root.querySelector(`[data-tab="${TABS[next].id}"]`).focus();
    });
    root.addEventListener('ptn:go', e => show(e.detail && e.detail.tab, { scroll: true }));
    global.addEventListener('hashchange', () => {
      const id = global.location.hash.slice(1);
      if (tabOf(id) && id !== current) show(id);
    });

    // 제목 오른쪽 버튼은 두지 않음 — 업체 파일 가져오기는 업체 컨택 › 업체 목록 카드 머리와 맨 아래 가져오기 카드에서

    const hash = (global.location.hash || '').slice(1);
    // 메뉴로 들어오면 항상 업체 컨택부터 (주소에 #탭이 있을 때만 그 탭)
    show(tabOf(hash) ? hash : 'contacts');
  }

  REBOOT.register({
    id: 'partners', label: '인플루언서', icon: '', priority: 'P1', order: 60,
    title: '다음 파트너를 만나보세요.',
    subtitle: '후보를 고르고, 함께할 일을 제안하세요.',
    render,
    // 메뉴 배지 · 종 알림: 회신을 기다리는 발송 기록 수 (records.js가 저장소에 캐시한 값 — 동기)
    summary: () => {
      let n = 0;
      try { n = REBOOT.use('partners.records').awaitingCount(); } catch (e) { n = 0; }
      return { label: '회신 대기', value: n };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
