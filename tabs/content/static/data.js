/* 콘텐츠 제작 화면용 기준 목록.
   ID는 tabs/content/options.py와 같아야 합니다 (tabs/content/tests/test_content.py가 확인).
   제품 목록은 여기 두지 않고 공용 팩트시트(REBOOT.data.products())를 씁니다. */
(function (global) {
  'use strict';
  const NS = global.REBOOT_DATA = global.REBOOT_DATA || {};

  NS.content = {
    version: '2026-10-23',

    // 01 만들 콘텐츠 (README 2.2) — kind: 기본 텍스트 결과물
    contentTypes: [
      { id: 'image', label: '이미지', icon: 'image', kind: 'copy', hint: '이미지 초안 + 위에 얹을 문구' },
      { id: 'cardnews', label: '카드뉴스', icon: 'doc', kind: 'cardnews', hint: '장별 문구 (S1, S2 …)' },
      { id: 'shortform', label: '숏폼 영상', icon: 'video', kind: 'script', hint: '구성안 · 실제 영상 생성은 연결 안 됨' },
      { id: 'crm', label: 'CRM 메시지', icon: 'mail', kind: 'crm', hint: '이메일·SMS 문안 (발송은 하지 않음) · CRM 채널 전용' }
    ],

    // 02 게시 채널 — 하나만. yamibuy는 다른 탭도 쓰는 ID라 그대로 두고 표시 이름만 Yami
    channels: [
      { id: 'instagram', label: 'Instagram' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'amazon', label: 'Amazon' },
      { id: 'weee', label: 'Weee' },
      { id: 'yamibuy', label: 'Yami' },
      { id: 'oliveyoung', label: 'Global Olive Young' },
      { id: 'crm', label: 'CRM' }
    ],
    // CRM 메시지 ↔ CRM 채널끼리만 (tabs/content/options.py CRM_TYPE · CRM_CHANNEL)
    crm: { type: 'crm', channel: 'crm' },

    // 04 목적 (선택)
    goals: ['브랜드 알리기', '제품 소개', '구매 유도', '재구매'],

    statuses: ['제작 중', '검토 중', '완료'],
    statusTone: { '제작 중': 'orange', '검토 중': 'blue', '완료': 'green' },

    kinds: { copy: '카피', cardnews: '카드뉴스', script: '숏폼 구성안', crm: 'CRM 메시지', image: '이미지', video: '영상' },
    textKinds: ['copy', 'cardnews', 'script', 'crm'],

    sheetLabels: {
      content_type: '콘텐츠', channels: '게시 채널', brand_focus: '브랜드 자체', product_ids: '제작 대상 제품',
      goal: '목적', extra_request: '추가 요청', use_character: '캐릭터 Rebu'
    },

    // 캐릭터 Rebu 사용 여부 — 이미지·카드뉴스·숏폼에서만 시트에 보임 (tabs/content/assets.py와 같은 값)
    character: {
      choices: ['사용', '사용 안 함', 'AI 판단'],
      contentTypes: ['image', 'cardnews', 'shortform'],
      hints: { '사용': '캐릭터 사진을 참고해 Rebu를 넣어요', '사용 안 함': 'Rebu 없이 만들어요', 'AI 판단': '콘셉트에 어울릴 때만 넣어요' },
      thumb: '/api/content/assets/rebu-thumb.jpg'
    },
    decisionLabels: {
      concept: '콘셉트', background: '배경', tone: '말투·톤', style: '스타일', layout: '제품 배치', ratio: '비율',
      language: '결과물 언어', cta: 'CTA', headline: '헤드라인', message: '핵심 메시지', target: '타깃', length: '길이',
      format: '형식', season: '시즌', accent_color: '포인트 색', featured_product: '메인 제품', slide_count: '장 수',
      duration: '영상 길이', lighting: '조명', composition: '구도', mood: '분위기', caption: '캡션', hashtags: '해시태그',
      subtitle: '자막', use_character: '캐릭터 Rebu', flavor: '맛', product_flavors: '제품별 맛', ref_skip: '뺀 참고 사진',
      story: '스토리', design_note: '초안 설명', emphasis: '강조할 내용', content_points: '담을 내용', hook: '멘트',
      slogan_choice: '쓸 슬로건'
    },
    // 오른쪽 '브리프' 표의 항목 설명 (흐름 순서는 서버 options.CONTENT_FLOWS → campaign.flow)
    flowHints: {
      concept: '콘셉트 · 레퍼런스', story: '담을 이야기 · 장면', design_note: '글로 쓰는 초안', emphasis: '꼭 강조할 것',
      ratio: '비율 · 크기 (채널 추천)', content_points: '꼭 넣을 내용', slide_count: '카드뉴스 장 수', duration: '영상 길이',
      format: '이메일 · SMS · 시퀀스', tone: '말투', cta: '행동 유도 문구', target: '받는 고객',
      caption: '게시글 캡션', hook: '첫 줄 훅 · 고정 댓글'
    },
    // 오른쪽 '현재 결정 사항'에 미정으로 보여 줄 항목 (콘텐츠별)
    decisionHints: {
      image: ['concept', 'background', 'style', 'ratio', 'language'],
      cardnews: ['concept', 'tone', 'slide_count', 'ratio', 'language'],
      shortform: ['concept', 'duration', 'ratio', 'tone', 'language'],
      crm: ['format', 'tone', 'cta', 'language']
    },

    // 빠른 버튼 → 입력창에 미리 채움 (같은 대화 경로로 보냄 · README 7.1)
    quick: {
      image: [
        { label: '배경 변경', text: '배경만 [검정]으로 바꿔줘' },
        { label: '문구 수정', text: '그림은 그대로 두고 헤드라인 문구만 [더 짧게] 고쳐줘' },
        { label: '제품 크기·배치', text: '제품을 [가운데 크게] 배치해서 다시 만들어줘' },
        { label: '스타일 변경', text: '스타일을 [밝은 아침 느낌]으로 바꿔줘' },
        { label: '비율 변경', text: '비율을 [4:5 세로]로 바꿔줘' },
        { label: '다른 초안', text: '다른 초안도 만들어줘' }
      ],
      video: [
        { label: '장면 변경', text: '[첫 장면]을 [제품 클로즈업]으로 바꿔줘' },
        { label: '카메라·움직임', text: '카메라를 [더 천천히] 움직여줘' },
        { label: '분위기 변경', text: '분위기를 [밝은 아침 느낌]으로 바꿔줘' },
        { label: '길이 변경', text: '길이를 [10초]로 바꿔줘' },
        { label: '비율 변경', text: '비율을 [9:16 세로]로 바꿔줘' }
      ],
      text: [
        { label: '더 짧게', text: '[B안]을 더 짧게 고쳐줘' },
        { label: '톤 바꾸기', text: '톤을 [더 경쾌하게] 바꿔줘' },
        { label: 'CTA 수정', text: 'CTA를 [Shop now]로 바꿔줘' },
        { label: '다른 접근', text: '다른 접근으로 초안 만들어줘' },
        { label: '카피만 먼저', text: '이미지는 말고 카피만 먼저 만들어줘' }
      ]
    },

    workflow: ['콘텐츠와 채널 선택', '기본 정보 입력 · AI 추천', '대화하며 제작 · 수정'],

    // 내 캠페인 카드 머리 (실제 이미지가 아닌 글자 포스터)
    posters: {
      image: { bg: '', en: 'IMAGE' },
      cardnews: { bg: '#e5eadb', en: 'CARD NEWS' },
      shortform: { bg: '#d9e7ee', en: 'SHORT FORM' },
      crm: { bg: '#e6e8e2', en: 'CRM MESSAGE' }
    },

    // 컴플라이언스 파트 review() 연결 — 채널: Amazon → amazon, 나머지(CRM 포함) → b2c
    // Global Olive Young은 임시로 b2c (별도 규칙 필요 여부는 컴플라이언스 담당 확인 전)
    complianceChannel: { instagram: 'b2c', tiktok: 'b2c', amazon: 'amazon', weee: 'b2c', yamibuy: 'b2c', oliveyoung: 'b2c', crm: 'b2c' },
    complianceLabels: { BLOCK: '사용 불가', REVISE: '수정 필요', COND: '조건부', REVIEW: '검토 필요', PASS: '걸린 표현 없음' },
    complianceTone: { BLOCK: 'red', REVISE: 'orange', COND: 'blue', REVIEW: 'purple', PASS: 'green' },

    keywordStatus: {
      error: { label: '키워드 확인 · 수정 필요', tone: 'red' },
      warn: { label: '키워드 확인 · 검토 필요', tone: 'orange' },
      clear: { label: '키워드 확인 · 걸린 표현 없음', tone: '' }
    },

    // 카드뉴스 편집기 (tabs/content/cardnews.py와 같은 ID) — 템플릿을 늘리려면 templates에 한 줄 + content.css에 .cnt-cn-t-<ID> 변수 묶음
    cardnews: {
      sourceMax: 12000,
      templates: [
        { id: 'neon', label: 'Reboot 블랙 네온', hint: '검정 배경 + 네온 라임 · 후킹 문구형' },
        { id: 'clean', label: '클린 화이트', hint: '흰 배경 + 라임 형광펜 · 정보형' },
        { id: 'photo', label: '제품 포토', hint: '사진을 꽉 채우고 흰 박스 · 사진 위주형' },
        { id: 'block', label: '네온 블록', hint: '검정 · 네온 색 블록 교차 + 버스트 장식' }
      ],
      layouts: [{ id: 'cover', label: '표지' }, { id: 'list', label: '목록' }, { id: 'quote', label: '인용' },
        { id: 'stat', label: '숫자' }, { id: 'outro', label: '마무리' }],
      languages: [{ id: 'en', label: 'English' }, { id: 'ko', label: '한국어' }],
      ratios: [{ id: '4:5', label: '4:5 세로 · 인스타 추천' }, { id: '1:1', label: '1:1 정사각' }],
      counts: [{ id: 0, label: 'AUTO' }, { id: 5, label: '5장' }, { id: 7, label: '7장' }, { id: 9, label: '9장' }],
      tones: [{ id: 'info', label: '정보형' }, { id: 'casual', label: '캐주얼' }, { id: 'hook', label: '후킹형' }],
      placeholders: { kicker: '작은 문구', title: '제목', sub: '부제 한 문장', items: '내용', quote: '인용문', number: '숫자',
        desc: '숫자 설명', cta: '행동 유도 문구' },
      // 키 없이 보는 예시 덱 — 브랜드 키트 사실(제품명 · 맛 · 모양 · Jelly Original 가격 · 슬로건)만 씀. 화면에 '예시' 배지
      sample: {
        deckTitle: 'Meet **Reboot** Jelly', brand: 'REBOOT', demo: true, template: 'neon', ratio: '4:5', language: 'en', tone: 'hook',
        caption: 'Cowboy-shaped jellies, three flavors, one lineup. Which shape is your favorite?\nSave this post for later.',
        hashtags: ['#Reboot', '#RebootJelly', '#CowboyJelly', '#JellyTime', '#RestartYourDay'],
        needsCheck: ['예시 데이터예요. 실제 게시 전에 문구와 사진을 확인하세요.'],
        cards: [
          { layout: 'cover', kicker: 'REBOOT · JELLY', title: 'Meet **Reboot** Jelly', sub: 'Cowboy-shaped jellies in three flavors.', photo: { asset: 'jelly-original-pouch-scene' } },
          { layout: 'list', title: 'Three **shapes**', items: [
            { head: 'Cowboy boot', body: 'Lime, in bright green.' },
            { head: 'Cowboy hat', body: 'Cherry, in pink.' },
            { head: 'Lasso', body: 'Lemon, in sunny yellow.' }], photo: { asset: 'jelly-original-pieces' } },
          { layout: 'list', title: 'Pick your **flavor**', items: [
            { head: 'Cherry', body: 'Bright and bold.' }, { head: 'Lime', body: 'Fresh and zesty.' }, { head: 'Lemon', body: 'Sunny and sweet.' }] },
          { layout: 'stat', title: 'Reboot Jelly Original', number: '$17.99', desc: 'per pouch of 10', photo: { asset: 'jelly-original-pouch-front' } },
          { layout: 'quote', title: 'Our slogan', quote: '**Restart** Your Day', photo: { asset: 'rebu-poses-fullbody' } },
          { layout: 'outro', title: 'Try **Reboot** Jelly', sub: 'Original, or Balance with Zero Sugar (not a low calorie food).', cta: 'Save this post for later', photo: { asset: 'jelly-balance-pouch-front' } }
        ]
      }
    },

    jobStatus: {
      queued: '대기 중', running: '생성 중', saving: '파일 저장 중', succeeded: '완료', failed: '실패',
      submission_unknown: '결과 확인 불가', canceled: '취소됨'
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
