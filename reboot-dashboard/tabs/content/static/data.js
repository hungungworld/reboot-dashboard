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
      { id: 'image', label: '이미지', icon: 'image', kind: 'copy', hint: '이미지 시안 + 위에 얹을 문구' },
      { id: 'cardnews', label: '카드뉴스', icon: 'doc', kind: 'cardnews', hint: '장별 문구 (S1, S2 …)' },
      { id: 'shortform', label: '숏폼 영상', icon: 'video', kind: 'script', hint: '구성안 · 실제 영상 생성은 미연동' },
      { id: 'product_desc', label: '상품 설명', icon: 'edit', kind: 'desc', hint: '채널 형식의 제목·특징·설명' },
      { id: 'crm', label: 'CRM 메시지', icon: 'mail', kind: 'crm', hint: '이메일·SMS 문안 (발송은 하지 않음)' },
      { id: 'plan', label: '캠페인 기획서', icon: 'calendar', kind: 'plan', hint: '미니 기획 · 상세 10개 항목 · 채널 여러 개' }
    ],

    // 02 게시 채널 — 기획서만 여러 개
    channels: [
      { id: 'instagram', label: 'Instagram' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'amazon', label: 'Amazon' },
      { id: 'weee', label: 'Weee' },
      { id: 'yamibuy', label: 'Yamibuy' },
      { id: 'crm', label: 'CRM' }
    ],

    // 04 목적 (선택)
    goals: ['브랜드 알리기', '제품 소개', '구매 유도', '재구매'],

    statuses: ['제작 중', '검토 중', '완료'],
    statusTone: { '제작 중': 'orange', '검토 중': 'blue', '완료': 'green' },

    kinds: { copy: '카피', cardnews: '카드뉴스', script: '숏폼 구성안', desc: '상품 설명', crm: 'CRM 메시지', plan: '기획서', image: '이미지' },
    textKinds: ['copy', 'cardnews', 'script', 'desc', 'crm', 'plan'],

    sheetLabels: {
      content_type: '콘텐츠', channels: '게시 채널', brand_focus: '브랜드 자체', product_ids: '제작 대상 제품',
      goal: '목적', extra_request: '추가 요청'
    },
    decisionLabels: {
      concept: '콘셉트', background: '배경', tone: '말투·톤', style: '스타일', layout: '제품 배치', ratio: '비율',
      language: '결과물 언어', cta: 'CTA', headline: '헤드라인', message: '핵심 메시지', target: '타깃', length: '길이',
      format: '형식', season: '시즌', accent_color: '포인트 색', featured_product: '메인 제품', slide_count: '장 수',
      duration: '영상 길이', lighting: '조명', composition: '구도', mood: '분위기', caption: '캡션', hashtags: '해시태그',
      subtitle: '자막'
    },
    // 오른쪽 '현재 결정 사항'에 미정으로 보여 줄 항목 (콘텐츠별)
    decisionHints: {
      image: ['concept', 'background', 'style', 'ratio', 'language'],
      cardnews: ['concept', 'tone', 'slide_count', 'language'],
      shortform: ['concept', 'duration', 'tone', 'language'],
      product_desc: ['tone', 'message', 'language'],
      crm: ['format', 'tone', 'cta', 'language'],
      plan: ['concept', 'target', 'season', 'language']
    },

    // 빠른 버튼 → 입력창에 미리 채움 (같은 대화 경로로 보냄 · README 7.1)
    quick: {
      image: [
        { label: '배경 변경', text: '배경만 [검정]으로 바꿔줘' },
        { label: '문구 수정', text: '문구를 [더 짧게] 고쳐줘' },
        { label: '제품 크기·배치', text: '제품을 [가운데 크게] 배치해서 다시 만들어줘' },
        { label: '스타일 변경', text: '스타일을 [밝은 아침 느낌]으로 바꿔줘' },
        { label: '비율 변경', text: '비율을 [4:5 세로]로 바꿔줘' },
        { label: '다른 시안', text: '다른 시안도 만들어줘' }
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
      product_desc: { bg: '#e8e2d6', en: 'PRODUCT PAGE' },
      crm: { bg: '#e6e8e2', en: 'CRM MESSAGE' },
      plan: { bg: '#eef3d6', en: 'CAMPAIGN PLAN' }
    },

    // 컴플라이언스 파트 review() 연결 — 채널: Amazon → amazon, 나머지(CRM 포함) → b2c
    complianceChannel: { instagram: 'b2c', tiktok: 'b2c', amazon: 'amazon', weee: 'b2c', yamibuy: 'b2c', crm: 'b2c' },
    complianceLabels: { BLOCK: '사용 불가', REVISE: '수정 필요', COND: '조건부', REVIEW: '검토 필요', PASS: '규칙 미탐지' },
    complianceTone: { BLOCK: 'red', REVISE: 'orange', COND: 'blue', REVIEW: 'purple', PASS: 'green' },

    keywordStatus: {
      error: { label: '키워드 확인 · 수정 필요', tone: 'red' },
      warn: { label: '키워드 확인 · 확인 필요', tone: 'orange' },
      clear: { label: '키워드 미탐지', tone: '' }
    },

    jobStatus: {
      queued: '대기 중', running: '생성 중', saving: '파일 저장 중', succeeded: '완료', failed: '실패',
      submission_unknown: '결과 확인 불가'
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
