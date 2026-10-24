/* 컴플라이언스 데이터: 규칙 R1~R12, 채널, 검증용 문구, 한국→미국 표현 매핑.
   규칙을 바꾸면 화면의 '규칙·검증' 탭 또는 `node dev/test_parts.js`로 다시 확인합니다.
   근거 구분(basis)과 근거 조문(law)은 FDA·FTC 공식 문서 기준으로 정리 (2026-10-24). 법률 자문이 아니며 조문 원문으로 확인합니다. */
(function (global) {
  'use strict';
  const NS = global.REBOOT_DATA = global.REBOOT_DATA || {};

  NS.compliance = {
    version: '2026-10-22',

    channels: {
      b2c: 'B2C 광고·SNS',
      amazon: '아마존 상세페이지',
      cs: 'CS 답변',
      b2b: 'B2B 바이어 자료'
    },

    // terms: 영어 표현 (대소문자·하이픈·띄어쓰기·복수형 차이를 함께 잡음)
    // ko: 한국어 표현 (포함 여부로 판정)
    // basis: official 공식 근거 · platform 광고 플랫폼 정책(Meta·Google 등) · internal 내부 정책 · context 문맥 검토
    // law: 근거 조문 { agency, cite, note } — 화면 규칙 표 '근거 조문' 칸과 자세히 창에 표시
    // patterns: 단어 목록(terms)으로 못 잡는 문장 모양 (정규식 · 대소문자 무시)
    rules: [
      {
        code: 'R1', name: '질병·치료 클레임', verdict: 'BLOCK', basis: ['official', 'context'],
        terms: ['cure', 'prevent', 'prevention', 'relief', 'relieve', 'remedy', 'detox', 'detoxify', 'toxin', 'heal',
          'alcohol withdrawal', 'withdrawal syndrome', 'intoxication', "alcohol's negative effects", 'negative effects of alcohol'],
        ko: ['치료', '예방', '완화', '해독', '금단'],
        reason: '질병을 예방·치료·완화한다는 표현은 일반식품을 미승인 의약품처럼 보이게 함 (2020 숙취 제품 경고장). 알코올 금단·취기·음주의 해로운 영향을 줄인다는 말도 같음. detox·relief는 문맥 검토',
        alt: '섭취 시점·맛·포맷 등 사실 묘사',
        law: [
          { agency: 'FDA', cite: 'FD&C Act §201(g)(1)(B) · 21 U.S.C. 321(g)(1)(B)', note: '질병의 진단·치료·완화·예방에 쓰려는 제품은 의약품' },
          { agency: 'FDA', cite: '숙취 제품 경고장 7통 (2020-07-23 발행 · 07-29 공개)', note: '숙취를 치료·완화·예방한다는 제품을 미승인 신약으로 판단' }
        ]
      },
      {
        code: 'R2', name: "'hangover' 직접 언급", verdict: 'BLOCK', basis: ['official', 'internal'],
        terms: ['hangover', 'hang-over'],
        ko: ['숙취'],
        reason: 'FDA 경고장은 숙취 예방·완화 주장을 의약품 표현으로 봄. 단순 언급까지 막는 것은 팀 기준',
        alt: 'After-Party, Morning-After Ritual',
        law: [
          { agency: 'FDA', cite: '숙취 제품 경고장 7통 (2020-07-23)', note: 'hangover 예방·완화 주장 = 의약품 주장 (공식)' },
          { agency: '팀', cite: '내부 기준', note: "주장 없이 'hangover'만 써도 막는 것은 팀 기준 (법 조항 아님)" }
        ]
      },
      {
        code: 'R3', name: '안전성 보장·간 보호', verdict: 'BLOCK', basis: ['official', 'context'],
        terms: ['protect your liver', 'protects your liver', 'protect the liver', 'protects the liver', 'liver protection', 'liver damage', 'liver detox',
          'no side effects', 'side-effect free', 'completely safe', '100% safe'],
        ko: ['간 보호', '간을 보호', '간을 지켜', '간 지킴', '간 해독', '간 손상', '부작용 없'],
        reason: '간을 손상에서 지킨다는 표현은 질병 예방 성격이고, 안전성 보장은 과학적 근거(실증)가 필요한 주장',
        alt: '"라벨 확인 + 전문가 상담" 안내',
        law: [
          { agency: 'FDA', cite: 'FD&C Act §201(g)(1)(B)', note: '간 손상 예방 = 질병 예방 주장' },
          { agency: 'FTC', cite: 'FTC Act §5 · §12 (15 U.S.C. 45, 52)', note: '안전성 보장도 근거가 필요한 주장 · 근거 없으면 기만 광고' }
        ]
      },
      {
        code: 'R4', name: '알코올 홍조·ALDH2', verdict: 'BLOCK', basis: ['official', 'platform', 'internal'],
        terms: ['asian glow', 'alcohol flush', 'drinking flush', 'face flush', 'flush reaction', 'flushing', 'ALDH2', 'red face'],
        ko: ['홍조', '얼굴 빨개'],
        reason: '홍조·ALDH2 결핍을 줄이거나 고친다는 주장은 체질·질환을 완화한다는 의약품 표현. 단순 언급까지 막는 것은 팀 기준',
        alt: '판매 문구에서 제외',
        law: [
          { agency: 'FDA', cite: 'FD&C Act §201(g)(1)(B)', note: '개선·완화 주장일 때 의약품 표현' },
          { agency: 'Meta', cite: '광고 기준 · Privacy Violations and Personal Attributes', note: "광고가 보는 사람의 인종·건강 상태를 단정하거나 암시하면 안 됨 → 'Asian glow'(인종 + 체질)는 해당 소지" },
          { agency: '팀', cite: '내부 기준', note: '언급만 해도 막는 것은 팀 기준' }
        ]
      },
      {
        code: 'R5', name: '효과 보장·과장', verdict: 'REVISE', basis: ['official', 'context'],
        terms: ['guarantee', 'clinically proven', 'proven to', '100%', 'works every time', 'instant results', 'miracle'],
        ko: ['효과 보장', '확실한 효과', '기적'],
        reason: '효과 보장·과장은 FTC가 과학적 근거를 요구. 100% juice처럼 효과 주장이 아니면 문맥 검토',
        alt: '용량·포장·맛 같은 검증 가능한 사실',
        law: [
          { agency: 'FTC', cite: 'FTC Act §5 · §12 (15 U.S.C. 45, 52)', note: '식품 광고의 거짓·기만 금지' },
          { agency: 'FTC', cite: 'Health Products Compliance Guidance (2022-12)', note: '건강 효과 주장은 광고 전에 과학적 근거 필요 · 기본은 사람 대상 무작위 대조 시험' }
        ]
      },
      {
        code: 'R6', name: '음주 조장', verdict: 'REVISE', basis: ['platform', 'internal'],
        terms: ['drink all night', 'party harder', 'drink more', 'keep drinking', 'drink without worry', 'outdrink'],
        ko: ['더 마셔', '밤새 마셔', '마음껏 마셔'],
        reason: '음주를 부추기는 표현 (팀 기준 · 브랜드·플랫폼 리스크)',
        alt: '음주량·음주 지속을 언급하지 않음',
        law: [
          { agency: 'Meta', cite: 'Meta 광고 기준 (술) · Alcohol', note: "술을 홍보하거나 '언급'하는 광고는 현지 법과 업계 자율 규약을 지켜야 합니다. 음주 장면이 나오는 우리 광고도 여기에 해당합니다" },
          { agency: 'Google', cite: "Google Ads '무책임한 음주 광고' 정책 (Irresponsible alcohol advertising)", note: '과음·폭음·음주 시합을 좋게 보이게 하는 광고는 승인 거절됩니다' },
          { agency: '업계', cite: 'DISCUS 규약 (미국 증류주협회) · Code of Responsible Practices', note: '술을 지나치거나 무책임하게 마시는 장면을 보여 주지 않습니다. Meta가 지키라고 하는 업계 규약의 예입니다' },
          { agency: 'FDA', cite: '숙취 제품 경고장 (2020-07-23)', note: "'마셔도 취하지 않게' 같은 음주 효과 주장은 R6이 아니라 R1(의약품 표현)으로 BLOCK" },
          { agency: '팀', cite: '내부 기준', note: '식품 광고의 음주 조장을 직접 금지하는 FDA·FTC 조항은 없음 → REVISE는 플랫폼 정책·업계 규약을 따른 팀 기준' }
        ]
      },
      {
        code: 'R7', name: '의약품 오인', verdict: 'REVISE', basis: ['official', 'context'],
        terms: ['hangover pill', 'pill', 'tablet', 'capsule', 'doctor-formulated', 'pharmacist-formulated', "nature's aspirin", 'aspirin', 'medicine', 'prescription'],
        ko: ['숙취약', '의약품', '알약', '처방'],
        reason: '약처럼 보이는 명칭·표현은 제품의 의도된 용도를 판단하는 요소가 될 수 있음',
        alt: 'jelly stick, shot 등 식품 포맷 명칭',
        law: [
          { agency: 'FDA', cite: '21 CFR 201.128 (의도된 용도)', note: '라벨·광고·판매자 발언으로 의도된 용도를 판단 · 단어 하나로 확정하지 않음 (문맥)' }
        ]
      },
      {
        code: 'R8', name: '구조·기능 클레임', verdict: 'REVISE', basis: ['official', 'internal'],
        terms: ['supports liver health', 'liver health', 'liver function', 'alcohol metabolism', 'metabolize alcohol', 'metabolizes alcohol',
          'process alcohol', 'processes alcohol', 'break down alcohol', 'breaks down alcohol', 'supports healthy', 'boosts immunity',
          'these statements have not been evaluated by the food and drug administration'],
        ko: ['간 건강', '간 기능', '알코올 대사', '알코올 분해', '알코올을 분해', '면역력 강화'],
        reason: '일반식품도 영양적 가치에 기반한 구조·기능 표현은 가능함. 근거 자료 확보 전까지 팀은 보수적으로 수정 처리 (보충제용 면책문구는 일반식품에 맞지 않음)',
        alt: '삭제 또는 영양 성분 사실만 (영양 근거가 있으면 규제 담당 검토 후 허용 여부 결정)',
        byCategory: { SUPPLEMENT: 'COND' },
        law: [
          { agency: 'FDA', cite: 'FDA Structure/Function Claims · 65 FR 1000 (2000-01-06)', note: '일반식품의 구조·기능 표현은 영양적 가치에서 나온 효과여야 함' },
          { agency: 'FDA', cite: '21 CFR 101.93(c)', note: "'These statements have not been evaluated…' 면책문구는 건강기능식품용" },
          { agency: '팀', cite: '내부 기준', note: '근거 확보 전까지 모두 REVISE로 두는 것은 팀 기준' }
        ]
      },
      {
        code: 'R9', name: '인체적용시험 인용', verdict: 'REVISE', basis: ['official', 'internal'],
        terms: ['clinically tested', 'clinically studied', 'clinically shown', 'clinical study', 'clinical studies', 'clinical trial', 'human study', 'human trial', 'research shows', 'studies show'],
        ko: ['임상', '인체적용시험', '인체 적용 시험'],
        reason: '임상·시험 인용은 FTC 실증 대상. B2C에서 삭제하는 것은 팀 기준',
        alt: 'B2C에서는 삭제, B2B 자료에서만 (근거 문서와 함께)',
        byChannel: { b2b: 'REVIEW' },
        law: [
          { agency: 'FTC', cite: 'Health Products Compliance Guidance (2022-12)', note: "'시험했다'고 말하면 말한 수준의 시험 근거가 있어야 함" },
          { agency: '팀', cite: '내부 기준', note: 'B2C에서 삭제하는 것은 팀 기준' }
        ]
      },
      {
        code: 'R10', name: '후기·리뷰', verdict: 'REVIEW', basis: ['official'],
        terms: ['testimonial', '5-star', 'five-star', 'customer review', 'rated #1', 'top-rated'],
        ko: ['후기', '리뷰', '별점'],
        // 1인칭 사용 경험 문장 = 후기 (경고장은 후기 문구도 의도된 용도의 증거로 인용)
        patterns: ["(?:^|[.!?]\\s+)(?:\\. \\. \\. )?[\"“]?(?:I|I'm|I’m|I've|I’ve|My)\\b[^.!?]{0,80}\\b(?:tried|try|take|took|taking|used|use|felt|feel|woke)\\b"],
        reason: '후기도 R1~R7로 심의하고 대가 관계를 표시 (FTC 추천·후기 지침). 1인칭 사용 경험 문장도 후기로 봄',
        alt: '후기도 R1~R7로 심의, 대가 관계 표시',
        law: [
          { agency: 'FTC', cite: 'Endorsement Guides · 16 CFR Part 255 (2023 개정)', note: '대가 관계 표시 · 후기도 광고주 주장으로 봄' },
          { agency: 'FTC', cite: 'Consumer Reviews and Testimonials Rule · 16 CFR Part 465 (2024-10-21 시행)', note: '가짜 후기 금지 · 좋은 후기를 조건으로 한 보상 금지' },
          { agency: 'FDA', cite: '21 CFR 201.128', note: '경고장은 후기 문구도 의도된 용도의 증거로 인용' }
        ],
        // 긍정 후기를 조건으로 한 보상 → BLOCK
        compensated: [
          '(free|discount|coupon|gift|refund|cash)[^.!?]{0,40}(review|5[\\s-]*star|five[\\s-]*star)',
          '(review|5[\\s-]*star|five[\\s-]*star)[^.!?]{0,40}(free|discount|coupon|gift|refund|cash)',
          'in exchange for (a |an |your )?(honest |positive |good )?review',
          '(리뷰|후기)[^.!?]{0,20}(쿠폰|적립|증정|할인|환불)',
          '(쿠폰|적립|증정|할인|환불)[^.!?]{0,20}(리뷰|후기)'
        ],
        compensatedReason: '긍정 후기를 조건으로 한 보상은 FTC 소비자 리뷰 규칙 위반 소지'
      },
      // R11·R12: 저당 젤리·저당 음료 출시에 맞춘 당 함량 표시 규칙 (2026-10-23 초안)
      // off: true → 판정에 쓰지 않음. 2026-10-23 담당(소준희) 결정: 당류 함량 표시는 점검하지 않음 (정할 것 #2).
      // FDA 기준 자체는 그대로이므로 규칙 내용은 지우지 않고 남겨 둠 → 다시 쓰려면 off를 지움
      {
        code: 'R11', name: "정의 없는 당 표시 ('low sugar')", verdict: 'BLOCK', basis: ['official'], off: true,
        terms: ['low sugar', 'low in sugar', 'lite sugar', 'light in sugar'],
        ko: ['저당', '당이 낮은', '당 함량이 낮은'],
        reason: "미국 FDA는 'low sugar'를 영양소 함량 강조 표시로 정의하지 않아 쓸 수 없음 (21 CFR 101.60(c)). 저당 제품이라도 영문 판매 문구에 'low sugar'를 쓰면 안 됨",
        alt: '당 함량 수치로 표시: "[N] g of sugar per stick/bottle" · 저감률은 R12 기준 충족 시',
        law: [{ agency: 'FDA', cite: '21 CFR 101.60(c)', note: "당류 함량 강조 표시 기준 · 'low sugar'는 정의된 표시가 아님" }]
      },
      {
        code: 'R12', name: '당 함량 강조 표시', verdict: 'COND', basis: ['official', 'context'], off: true,
        terms: ['reduced sugar', 'less sugar', 'lower sugar', 'sugar free', 'zero sugar', 'no sugar', 'sugarless', 'no added sugar', 'without added sugar', 'sugar-reduced'],
        ko: ['무설탕', '설탕 무첨가', '당류 저감', '당을 줄인', '제로 슈거', '당 줄인'],
        reason: "reduced·less sugar는 기준 제품보다 당류 25% 이상 적고 비교 대상·수치를 함께 표시해야 함. sugar free는 1회 제공량당 0.5 g 미만, no added sugar는 별도 조건 (21 CFR 101.60(c)). 기준 충족을 확인한 저당 제품만 조건부, 일반 제품은 사용 불가",
        alt: '"25% less sugar than our original jelly ([N] g vs [N] g per stick)" — 수치 확인 후 · 확인 전에는 당 함량 수치만',
        byProduct: { jelly: 'BLOCK', drink: 'BLOCK' },
        law: [{ agency: 'FDA', cite: '21 CFR 101.60(c)', note: 'sugar free 0.5 g 미만 · reduced/less sugar 25% 이상 저감 + 비교 대상 표시' }]
      },
      // R13: 성분을 내세우는 표현 (2026-10-24 추가). 함량을 표시하지 않기로 했으므로 성분 강조 문구는 사람이 한 번 봄
      {
        code: 'R13', name: '성분 강조·숙취 연상 성분', verdict: 'REVIEW', basis: ['official', 'context'],
        terms: ['packed with', 'loaded with', 'rich in', 'high in', 'excellent source of', 'full of', 'powered by', 'dihydromyricetin', 'DHM'],
        ko: ['듬뿍', '가득', '고함량', '풍부한'],
        reason: "성분을 내세우면 미국에서 그 성분의 함량(%) 표시를 요구받을 수 있음. 'rich in·high in'은 영양소가 1일 기준치 20% 이상일 때만 쓰는 정해진 표현이라 헛개 같은 원료에는 쓸 수 없음. DHM은 2020 숙취 경고장이 숙취 예방 성분으로 인용한 이름",
        alt: '"Contains Hovenia dulcis fruit extract."처럼 들어 있다는 사실만 · 함량을 내세우려면 함량 자료와 % 표시 준비',
        law: [
          { agency: 'FDA', cite: '21 CFR 102.5(b)', note: '성분 비율이 가격·소비자 선택에 영향을 주거나 실제보다 많이 든 것처럼 보이게 하면 제품명에 그 성분의 %를 넣어야 함' },
          { agency: 'FDA', cite: '21 CFR 101.54(b)(1)', note: "'high'·'rich in'·'excellent source of'는 1회 기준량에 1일 기준치(RDI·DRV) 20% 이상일 때만" },
          { agency: 'FDA', cite: '21 CFR 101.18(b)', note: '일부 성분만 이름에 넣거나 암시하면 다른 성분을 다 적어도 오해를 줄 수 있음' },
          { agency: 'FDA', cite: '숙취 제품 경고장 (2020-07-23) · Purple Biosciences·Double Wood', note: "DHM(dihydromyricetin)을 '숙취 예방 성분'으로 광고한 문구를 인용" }
        ]
      }
    ],

    // AI 2차 판정 검토자 페르소나 기본값 (2026-10-24 초안 · 담당 검토 전). 화면 '단건 심의 → AI 검토자 페르소나'에서 고치면
    // 팀 공용 저장소(reboot:compliance:persona)에 저장되고 이 기본값보다 우선합니다. 서버는 600자까지 받습니다.
    // 페르소나는 관점·말투만 바꿉니다. 규제 기준·팀 규칙·판정 단계는 서버 지시문이 항상 우선합니다 (ai_review.py).
    aiPersona: '미국 식품 광고 심의 패널. ① FDA·FTC 규제와 2020년 숙취 제품 경고장에 정통한 광고 규제 전문가 ② 숙취해소 식품의 성분·효능 표현 한계를 아는 제품 전문가 ③ 미국 20~30대 음주 문화와 SNS·아마존 반응을 아는 문화 전문가 ④ 미국 광고 카피 전문가. 미국 소비자가 읽는 뜻대로 보수적으로 판정하고, 브랜드 톤을 살린 안전한 대안을 낸다.',

    // 판매 제품 4종 (2026-10-23 팀 표 기준). 맛은 임시, 내부 제품명은 미정.
    // sugarReduced: 기본 제품 대비 당류 저감 목표 (R12가 켜져 있을 때 당 강조 표시가 '조건부'까지 가능, 일반 제품은 BLOCK)
    // 2026-10-23 팀 제품표 기준 (내부 제품명 · 맛은 임시 · 4종 모두 라임·체리·레몬)
    brand: { name: 'REBOOT', slogan: 'Restart Your Day', character: '리부 (Rebu)', cmSong: '니온 앤 리부', colors: '검정 & 네온' },
    products: [
      { id: 'jelly', ko: '젤리', name: 'Reboot Jelly Original', form: '스틱 젤리', flavors: '라임·체리·레몬 (임시)', pack: '개별 포장 스틱 한 팩', sugarReduced: false },
      { id: 'jelly-ls', ko: '저당 젤리', name: 'Reboot Jelly Balance', form: '스틱 젤리', flavors: '라임·체리·레몬 (임시)', pack: '개별 포장 스틱 한 팩', sugarReduced: true },
      { id: 'drink', ko: '음료', name: 'Reboot Drink Original', form: '비탄산 음료', flavors: '라임·체리·레몬 (임시)', pack: '6병/박스 · 소형 병', sugarReduced: false },
      { id: 'drink-ls', ko: '저당 음료', name: 'Reboot Drink Balance', form: '비탄산 음료', flavors: '라임·체리·레몬 (임시)', pack: '6병/박스 · 소형 병', sugarReduced: true }
    ],

    // FDA 숙취 제품 경고장 원문 인용 문구 — 원문 그대로(대괄호·말줄임·굽은 따옴표 포함).
    // FDA 경고장 7통 (2020-07-23 발행 · 07-29 공개) · 87개 = FDA 광고 콘솔 seed.json 원문 (2026-10-22 수집, 2026-10-24 이관)
    // 예전 53개(시연본 DATA_CLAIMS)는 일부가 잘린 문장이라 원문 87개로 바꿈. kind: 'testimonial'은 경고장이 인용한 후기
    // '규칙 검증'의 목표는 이 문구 중 PASS 0개 — PASS가 나오면 규칙이 놓친 표현입니다
    warningQuotes: [
      // FDA-2020-HO-01 · Double Wood LLC · Dycetin — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/double-wood-llc-593766-07232020
      { text: 'PREVENT HANGOVERS - No product is more proven or effective at preventing hangover symptoms including headaches, nausea, brain-fog, and anxiety.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'PROTECT YOUR LIVER AND BRAIN - Research shows Dycetin reduces alcohol induced damage to the liver and brain.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin is the most effective hangover preventing supplement currently available.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Not only does DHM [ingredient in Dycetin] enhance enzymes in the liver responsible for breaking down alcohol and its toxic by-products, but it also reduces the effect alcohol has on GABA receptors in the brain. This keeps you feeling more sober while drinking and greatly reduces hangover symptoms the next day.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Top Rated National Hangover Prevention Supplement', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'NEVER SUFFER ANOTHER HANGOVER', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin tablets protect your liver and brain from alcohol, prevent hangovers . . .', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'ADVANCED HANGOVER PREVENTION FORMULA', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'DYCETIN is a potent hangover prevention supplement which contains both Dihydromyricetin and a blend of electrolytes. It may reduce hangover symptoms by up to 99%.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'To reduce feelings of alcohol intoxication, take one tablet before you start drinking, and one additional tablet after finishing your first two drinks.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin can be used in three main ways - to prevent hangovers after a night of drinking, to reduce feelings of intoxication while drinking, or to raise the alcohol intoxication threshold so you can have a few drinks without becoming intoxicated.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'To prevent hangovers with Dycetin, take 2 tablets at the end of the night with a large glass of water.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'If you’ll be attending a social function where drinking is expected but you’d prefer not to become intoxicated, Dycetin can help. Simply take 2 tablets 30 minutes before drinking and you’ll be able to drink a 2-3 beers without noticing any intoxication.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin is a natural scientifically proven hangover prevention supplement that blocks the affect alcohol has on the brain and allows the liver to process alcohol more quickly. Taking Dycetin after a night on the town will allow you to wake up feeling normal rather than being stuck in bed with a crippling hangover.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin’s main ingredient, Dihydromyricetin, is the only single ingredient scientifically proven to prevent hangovers. It does this both by blocking alcohol’s effect on the brain’s GABA receptors and by allowing the liver to clear alcohol and its toxic byproduct acetaldehyde from the body at a much faster rate than normal. Combined, these effects allow Dycetin to prevent hangovers and reduce feelings of alcohol intoxication.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'To prevent a hangover, take 2 tablets of Dycetin before bed with a large glass of water.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'This stuff really works. Either before you imbibe, or after. If you have had too much to drink, it will stop the spins, and staggers, and you don\'t get a hangover the next morning. It will knock out an existing hangover as well.', firm: 'Double Wood LLC', issued: '2020-07-23', kind: 'testimonial' },
      { text: 'I tried it before drinking once and it was like I was drinking non-alcoholic beer, I wasn\'t even phased. I take it at the end of a long night of partying on a weeknight and am up for work at 7 and even feel more tired than hungover at all. It also does well to take mid-drinking in order to keep from getting out of line.', firm: 'Double Wood LLC', issued: '2020-07-23', kind: 'testimonial' },
      // FDA-2020-HO-02 · Ebnsol Inc. · PartyPal — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/ebnsol-inc-593771-07232020
      { text: 'Understanding the history of alcohol consumption led us to believe that throughout the ages different cultures have traditionally applied a variety of natural remedies for hangover relief and prevention as well as to help nullify the toll nightlife could have on the body.', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'One tested combination of ingredients in unique concentrations proved uniquely effective against hangovers: Prickly Pear Cactus, Succinic Acid, and Oriental Raisin Tree.', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'We bring you 3ContRx [ingredient blend in PartyPal], the most effective hangover treatments from 3 different parts of the globe all combined into easy to use tablets that REALLY WORK!', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'THE SAFER WAY TO ENJOY CACTUS – Having a hangover can really ruin your day. Nausea, dry mouth, dizziness; all of these symptoms we know all too well. However, with Prickly Pear Cactus Extract [ingredient in PartyPal], you can say goodbye to the day-after woes! By reducing inflammation associated with a hangover and increasing the ability for your cells to repair themselves after a night of drinking debauchery, you can feel better right away!', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'Dihydromyricetin, or DHM [ingredient in PartyPal], is a truly scientific way to prevent the dreaded hangover.', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'GUARANTEED RELIEF – We take this product ourselves, and are proud to present it to you as a true hangover cure.', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      // FDA-2020-HO-03 · Vita Heaven, LLC dba Hangover Heaven · Hangover Heaven Nightlife Prep Supplement — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/vita-heaven-llc-dba-hangover-heaven-593765-07232020
      { text: 'Hangover Cure through Prevention', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'If you take our supplements you will have much less of a hangover the next morning.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'These supplements contain ingredients that help your body deal with the breakdown products of alcohol, which cause hangovers.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'Hangover Heaven Nightlife Prep is a physician and PhD formulated hangover prevention product designed to be taken before drinking to reduce hangover symptoms the next day.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'Dosing depends on how much you plan to drink and the severity of your hangovers.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'Hangover Heaven IV Hydration is the first medical practice dedicated to the treatment, prevention, and cure of hangovers. With Hangover Heaven Nightlife Prep Supplements, you can significantly reduce your changes [sic] of having a hangover.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'Best Hangover Pills to Prevent Hangovers', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      // FDA-2020-HO-04 · Happy Hour Vitamins · Happy Hour Vitamins (H2V) — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/happy-hour-vitamins-593770-07232020
      { text: 'Multivitamin Specially Formulated to Help with Hangovers.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Specially formulated to help you Avoid Hangovers . . .', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'HELPS AVOID HANGOVERS!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'MULTIVITAMIN SPECIALLY FORMULATED TO HELP YOU AVOID HANGOVERS', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Convenient individual packets makes hangover prevention easy by taking 1 dose (2 hangover pills) before/while drinking.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'KILL YOUR HANGOVER BEFORE IT EVEN STARTS with powerful vitamin, mineral, anti-oxidant, herbal blend. Preventing hangovers works better than a hangover cure or cures you can try.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'GET RID OF TOXIC ACETALDEHYDE POISONING that adds to your hangovers with N-acetyl Cysteine [ingredient in Happy Hour Vitamins (H2V)]. Protect your liver with milk thistle, kudzu flower powder, and artichoke leaf extract [ingredients in Happy Hour Vitamins (H2V)]. Paired with water makes the perfect hangover kit.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'These are the hangover cure pills you are looking for!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Hangovers are much more than just dehydration . . . Headache often occurs when alcohol in the bloodstream absorbs all the vitamins and nutrients from the body’s organs. . . . Solution: Take in a healthy dose of vitamins & nutrients prior to drinking', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Hangovers are much more than just dehydration . . . Diarrhea, Nausea, and Vomiting all go hand in hand. . . . These are truly the hangover vitamins you need.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Antioxidants can help the body deal with toxins & other effects from alcohol', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Happy Hour Vitamins contains Thiamine which has been used to help calm the effects of alcohol withdrawal syndrome.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Avoid Hangovers . . . with Happy Hour Vitamins', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'I started thinking that it would be great if there was a multivitamin specifically formulated for the drinking population. One that would help support the bar industry lifestyle by focusing on . . . the reduction of hangover symptoms.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'HOW TO STOP THE STRUGGLE WITH HANGOVERS', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'With the H2V Partner Program, you can start making more money by selling the most effective hangover cure on the market.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'I struggled with hangovers while working as bartender for over a decade. Striving to find a hangover cure, I hired a PhD chemist and consulted medical professionals to create Happy Hour Vitamins, hangover vitamins. Now Happy Hour Vitamins allow me to avoid my hangovers . . .', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial' },
      { text: 'I got these for my wedding ‘Emergency Hang-over Kits’. They work wonders; everyone was so excited to wake up the next morning and not feel sluggish or tired or have a major headache.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial' },
      { text: 'I keep the packets in my purse and when I start drinking I just take them its [sic] as easy as that and bam no hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial' },
      { text: 'I am a bartender and always advise my customers to take a couple before beginning their shenanigans for the evening. They always come back and thank me for introducing them to Happy Hour Vitamins. I tell them that is easy to sell, no one wants a hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial' },
      { text: 'Happy Hour Vitamins Formulated for Hangovers . . .', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Forgot to take Happy Hour Vitamins and woke up Hungover? Take a pack of Happy Hour Vitamins as your hangover cure!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'These are the hangover pills you need for the perfect wedding, bachelor, bachelorette, vacation, party or everyday hangover kit!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Avoiding hangovers is easy with Happy Hour Vitamins, just take 1 dose (2 capsules) before/while drinking to help you the next morning.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'We were tired of hangovers and figured there had to be a better way. So we hired a chemist, domestic manufacturer & consulted medical professionals.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'The Only Thing You Have To Lose Is Your Hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      // FDA-2020-HO-05 · LES Labs · DeToxx for Hangovers — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/les-labs-593764-07232020
      { text: 'DETOXX FOR HANGOVERS', firm: 'LES Labs', issued: '2020-07-23' },
      { text: 'DeToxx helps reduce hangover symptoms . . . Natural ingredients including milk thistle, prickly pear and cysteine work while you drink, helping to metabolize the toxins that cause hangover symptoms . . .', firm: 'LES Labs', issued: '2020-07-23' },
      { text: 'Helps prevent hangover symptoms*', firm: 'LES Labs', issued: '2020-07-23' },
      // FDA-2020-HO-06 · Mind, Body & Coal LLC · Miracoal - Ultimate Hangover Relief and Total Body Detox — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/mind-body-coal-llc-593774-07232020
      { text: 'Ultimate Hangover Relief', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'PUT YOUR HANGOVER TO BED', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'Miracoal is the only product on the market that takes this healing process to the next level combining the purest form of organic coconut charcoal with electrolytes to flush away toxins and impurities in your digestive system and provide fast detoxifying rejuvenation, helping you wake up hangover-free.*', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'We know that hangovers don’t concede to a demanding schedule or life. . . . we have researched, created and patented an effective formula that detoxes impurities from your system and provides fast-acting relief the woes of a night well spent. So we invented our ‘Miracoal’ and set out to change the world, one hangover at a time.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'I love using Miracoal! I don’t drink often but every time I do I use Miracoal and I’m back to business in the morning. No hangover feelings at all!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', kind: 'testimonial' },
      { text: '. . . Then I found Miracoal! Now when I go out, if I have a few cocktails, I just take my Miracoal before I go to bed. I wake up the next morning hangover-free and ready to tackle my day!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', kind: 'testimonial' },
      { text: 'Miracoal Hangover Prevention and Relief Pills', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'Each capsule offers much more than just hangover relief . . .', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'THE ULTIMATE HANGOVER PREVENTION', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'Activated charcoal [ingredient in Miracoal – Ultimate Hangover Relief & Total Body Detox] removes impurities from your digestive system, helping you recover from drinking and put your hangover to bed!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'We’ve harnessed its [charcoal’s] healing powers into an easy-to-use capsule, formulated specifically to provide easy hangover relief and prevention.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'You’ll wake up feeling . . . hangover-free!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'Since activated charcoal has long been considered a safe and effective treatment for acute toxic poisoning, we\'ve turned it into a powerful new hangover prevention pill.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      // FDA-2020-HO-07 · Purple Biosciences LLC · Purple Tree — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/purple-biosciences-llc-593772-07232020
      { text: 'Purple Tree® is a natural multivitamin specifically designed to reduce alcohol\'s negative effects in the body . . . Hangovers hinder our work, fitness and family routines, so we embarked on a mission to help health-conscious adults who drink . . .', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Yes, Purple Tree is a hangover prevention pill that works.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Although a hangover cure for heavy-drinking situations like this does not exist, Purple Tree surely helps to mitigate some of the hangover symptoms, if taken beforehand.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Purple Tree’s key ingredient is called Dihydromyricetin (DHM), an extract from the Japanese Raisin Tree, which has been used for centuries as an anti-alcohol herb and hangover cure in Asia.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Say Goodbye to Hangovers . . . SHOP NOW', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Purple Tree – Supplement for Hangover Prevention', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Our hangover prevention pills were crafted by Doctors and Scientists with vast experience in natural supplements.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Purple Tree Hangover Cure & Prevention Pills', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'HELPS PREVENT HANGOVER SYMPTOMS', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Purple Tree’s science-backed formula includes Dihydromyricetin (DHM), a liver detox and hangover prevention ingredient. DHM is a natural extract that has been used as anti-alcohol herb and hangover cure since ancient medicine.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Purple Tree helps to prevent hangover symptoms . . .', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Key Benefits . . . helps to combat alcohol’s negative effects in the body, including hangover*', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'White Willow Bark, also called ‘Nature’s Aspirin’, acts as a natural anti-inflammatory agent in the human body.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Milk Thistle helps to protect the liver from damage.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23' }
    ],

    // 모두 PASS여야 하는 문구
    // 시연본 안전 문구 8개 이관 (2026-10-23). 'Low sugar. Pocket-sized. Made in Korea.'는
    // 당 함량 규칙(R11·R12)을 끈 뒤(정할 것 #2 결정) PASS라 다시 넣음
    safePhrases: [
      { text: 'Low sugar. Pocket-sized. Made in Korea.', kind: '시연본 안전 문구' },
      { text: 'Contains Hovenia dulcis extract.', kind: '오탐 확인' },
      { text: 'Before the first toast.', kind: '오탐 확인' },
      { text: 'Best served chilled.', kind: '오탐 확인' },
      { text: '10 sticks per box.', kind: '오탐 확인' },
      { text: 'Restart Your Day.', kind: '브랜드 슬로건' },
      { text: 'Lime, cherry and lemon jelly sticks.', kind: '제품 사실' },
      { text: 'Non-carbonated lime, cherry and lemon drinks, 6 small bottles per box.', kind: '제품 사실' },
      { text: "Korea's favorite after-party ritual.", kind: '안전 문구' },
      { text: 'A grab-and-go jelly stick with a bright citrus flavor.', kind: '안전 문구' },
      { text: 'Before the first toast, raise a different kind of glass.', kind: '안전 문구' },
      { text: 'Own your morning.', kind: '안전 문구' },
      { text: 'Loved in Korea, now in the U.S.', kind: '안전 문구' },
      { text: '10 sticks per box, individually wrapped.', kind: '안전 문구' },
      { text: 'Enjoy responsibly.', kind: '안전 문구' }
    ],

    // 판정 엔진 자체 점검용 예문 — FDA 경고장 원문이 아니라 팀이 만든 문장입니다.
    selfTest: [
      { text: 'Prevents hangovers fast.', expect: 'BLOCK' },
      { text: 'Protect your liver before the party.', expect: 'BLOCK' },
      { text: 'Say goodbye to Asian glow.', expect: 'BLOCK' },
      { text: 'Guaranteed results every morning.', expect: 'REVISE' },
      { text: 'Drink all night, feel fine.', expect: 'REVISE' },
      { text: 'Doctor-formulated jelly stick.', expect: 'REVISE' },
      { text: 'Supports liver health.', expect: 'REVISE' },
      { text: 'Supports liver health.', expect: 'COND', category: 'SUPPLEMENT' },
      { text: 'Clinically tested formula.', expect: 'REVISE' },
      { text: 'Clinically tested formula.', expect: 'REVIEW', channel: 'b2b' },
      { text: 'Read our 5-star testimonials.', expect: 'REVIEW' },
      { text: 'Get a free box for a 5-star review!', expect: 'BLOCK' },
      { text: 'Mango flavor jelly stick, 10 sticks per box.', expect: 'PASS' },
      { text: '숙취 해소에 좋은 젤리', expect: 'BLOCK' },
      // 당 함량 규칙(R11·R12)은 꺼져 있으므로 당류 표시만 있는 문장은 PASS
      { text: 'Low sugar lemon-lime jelly.', expect: 'PASS', product: 'jelly-ls' },
      { text: 'Reduced sugar lemon-lime drink.', expect: 'PASS', product: 'drink-ls' },
      { text: 'Reduced sugar lemon-lime drink.', expect: 'PASS', product: 'drink' },
      { text: 'Sugar-free jelly sticks.', expect: 'PASS', product: 'jelly' },
      { text: 'Zero sugar, less sugar, low sugar.', expect: 'PASS', product: 'drink-ls' },
      { text: '저당 젤리로 가볍게', expect: 'PASS', product: 'jelly-ls' }
    ],

    // 일괄 심의 시연용 더미 문구 20개 (2026-10-24 · 팀이 지어낸 아마존·SNS 광고 문장, 실제 광고 아님)
    // ko: 마케터가 쓰는 한국어 문구 (화면 더미는 이걸 올림 → 서버 Claude가 영어로 번역 → 영어·한국어 둘 다 점검)
    // channel·product: 줄마다 다른 채널·제품 ('all' = 전체) · copy: 예시 영어 번역 (번역을 못 할 때 · 규칙 확인용)
    // expect: copy(영어)를 그 줄의 채널·제품으로 점검했을 때의 예상 판정
    batchSample: [
      { ko: '리부트 젤리 오리지널: 라임·체리·레몬 맛 젤리 스틱 10개입', channel: 'amazon', product: 'jelly', copy: 'Reboot Jelly Original: lime, cherry and lemon jelly sticks, 10 per box.', expect: 'PASS', note: '제품 사실' },
      { ko: '가방에 쏙 넣어 다니는 개별 포장 젤리 스틱', channel: 'b2c', product: 'jelly', copy: 'Individually wrapped jelly sticks you can toss in your bag.', expect: 'PASS', note: '포장 사실' },
      { ko: '메이드 인 코리아. 밤을 즐기는 사람들이 사랑하는 맛', channel: 'b2c', product: 'all', copy: 'Made in Korea. Loved by night owls everywhere.', expect: 'PASS', note: '원산지·분위기' },
      { ko: '헛개나무 열매 추출물 함유', channel: 'amazon', product: 'all', copy: 'Contains Hovenia dulcis fruit extract.', expect: 'PASS', note: '성분 사실만' },
      { ko: '상큼한 시트러스 젤리 스틱으로 Restart Your Day', channel: 'b2c', product: 'jelly-ls', copy: 'Restart Your Day with a bright citrus jelly stick.', expect: 'PASS', note: '슬로건' },
      { ko: '리부트 드링크 밸런스: 작은 병에 담은 비탄산 레몬 음료', channel: 'amazon', product: 'drink-ls', copy: 'Reboot Drink Balance: a non-carbonated lemon drink in a small bottle.', expect: 'PASS', note: '제품 사실' },
      { ko: '젤리 스틱 하나로 숙취와 작별하세요', channel: 'all', product: 'all', copy: 'Say goodbye to hangovers with one jelly stick.', expect: 'BLOCK', note: 'R2 숙취' },
      { ko: '파티 전에 간을 보호하세요', channel: 'b2c', product: 'jelly', copy: 'Protects your liver before the party.', expect: 'BLOCK', note: 'R3 간 보호' },
      { ko: '헛개나무, 한국 전통 숙취 해소제', channel: 'amazon', product: 'all', copy: "Hovenia dulcis, Korea's traditional hangover cure.", expect: 'BLOCK', note: 'R1 치료 · R2' },
      { ko: '술자리 홍조는 이제 그만', channel: 'b2c', product: 'drink', copy: 'No more Asian glow at the bar.', expect: 'BLOCK', note: 'R4 홍조' },
      { ko: '별점 5개 리뷰를 남기면 한 박스 무료 증정!', channel: 'all', product: 'all', copy: 'Get a free box when you leave a 5-star review!', expect: 'BLOCK', note: 'R10 보상 후기' },
      { ko: '임상으로 연구한 한국 포뮬러', channel: 'b2b', product: 'all', copy: 'Clinically studied Korean formula.', expect: 'REVIEW', note: 'R9 임상 · B2B 자료라 검토 필요 (B2C면 수정 필요)' },
      { ko: '매번 효과 보장', channel: 'amazon', product: 'jelly', copy: 'Guaranteed to work every time.', expect: 'REVISE', note: 'R5 효과 보장' },
      { ko: '밤새 마셔도 아침엔 거뜬하게', channel: 'b2c', product: 'drink', copy: 'Drink all night, wake up ready.', expect: 'REVISE', note: 'R6 음주 조장' },
      { ko: '의사가 처방하듯 만든 파티용 젤리 스틱', channel: 'b2c', product: 'jelly', copy: 'Doctor-formulated jelly stick for party lovers.', expect: 'REVISE', note: 'R7 의약품 오인' },
      { ko: '몸이 알코올 분해를 더 빨리 하도록 도와줘요', channel: 'all', product: 'all', copy: 'Helps your body process alcohol faster.', expect: 'REVISE', note: 'R8 알코올 분해' },
      { ko: '헛개나무 추출물 듬뿍', channel: 'amazon', product: 'jelly-ls', copy: 'Packed with Hovenia dulcis extract.', expect: 'REVIEW', note: 'R13 성분 강조' },
      { ko: '한국산 DHM 파워', channel: 'b2c', product: 'all', copy: 'Powered by DHM from Korea.', expect: 'REVIEW', note: 'R13 숙취 연상 성분' },
      { ko: '고객들이 계속 별점 5개 후기를 남기는 이유', channel: 'cs', product: 'all', copy: 'See why our customers keep leaving 5-star reviews.', expect: 'REVIEW', note: 'R10 후기' },
      { ko: '생일 저녁 먹고 나서 먹어 봤는데 다음 날 아침 정말 개운했어요', channel: 'b2c', product: 'drink-ls', copy: 'I tried it after my birthday dinner and felt great the next morning.', expect: 'REVIEW', note: 'R10 1인칭 후기' }
    ],

    // 한국 표현 → 미국 대안 20쌍 (R1~R12 기준). reviewer·reviewedAt은 규제 담당 검토 후 기록합니다.
    // us가 영어 문장이면 판정 엔진에서 PASS여야 합니다 (`node dev/test_parts.js`가 확인).
    // [확인 필요: …]는 제품 팩트시트로 채울 값입니다. 2026-10-23 초안
    // 시연본 10쌍 대조 (2026-10-23): 8쌍은 이 목록에 같은 뜻으로 있음. 없는 2쌍은 규제 담당 검토 뒤 추가 여부 결정
    //   '다음 날 개운하게' → 'Own your morning' (R1 암시) · '아시아 전통 숙취 해소 비법' → 'Loved in Korea for decades' (R1·R2,
    //   Purple Tree 경고장의 'used for centuries … hangover cure in Asia'와 비슷 · 'for decades'는 사실 확인 필요)
    mappings: [
      { ko: '숙취 해소', us: 'After-Party · Morning-After Ritual', code: 'R2', reviewer: '', reviewedAt: '' },
      { ko: '숙취 예방', us: 'Before the first toast.', code: 'R1', reviewer: '', reviewedAt: '', note: '예방·치료 효과 대신 섭취 시점만 말함' },
      { ko: '숙취 없는 아침', us: 'Start your morning fresh.', code: 'R2', reviewer: '', reviewedAt: '', note: '음주 이미지·해시태그와 함께 쓰지 않음 (AI 2차 판정 REVIEW 사례)' },
      { ko: '숙취해소제 · 숙취약', us: 'Korean after-party jelly stick', code: 'R7', reviewer: '', reviewedAt: '', note: '약이 아닌 식품 포맷 명칭' },
      { ko: '음주 전 섭취', us: "Korea's pre-toast ritual", code: '—', reviewer: '', reviewedAt: '', note: '정할 것 #1 (before drinking 차단 여부)' },
      { ko: '해독 · 디톡스', us: 'Light, fresh-tasting jelly', code: 'R1', reviewer: '', reviewedAt: '' },
      { ko: '피로 회복', us: 'A refreshing treat for your morning routine', code: 'R1', reviewer: '', reviewedAt: '', note: '몸 상태 개선 대신 맛·습관' },
      { ko: '간 보호', us: '삭제 · 라벨 확인 + 전문가 상담 안내', code: 'R3', reviewer: '', reviewedAt: '' },
      { ko: '부작용 없음 · 100% 안전', us: '삭제 · 알레르기 성분과 섭취 방법을 라벨대로 안내', code: 'R3', reviewer: '', reviewedAt: '' },
      { ko: '얼굴 빨개짐(홍조) 개선', us: '판매 문구에서 제외', code: 'R4', reviewer: '', reviewedAt: '' },
      { ko: '효과 100% 보장', us: '10 sticks per box, individually wrapped.', code: 'R5', reviewer: '', reviewedAt: '', note: '효과 대신 검증 가능한 사실' },
      { ko: '즉각적인 효과', us: 'Ready to go: just tear and squeeze.', code: 'R5', reviewer: '', reviewedAt: '', note: '빠른 효과 대신 간편한 포맷' },
      { ko: '기적의 젤리', us: 'Our signature Korean jelly stick', code: 'R5', reviewer: '', reviewedAt: '' },
      { ko: '마음껏 마셔도 OK', us: 'Part of the Korean after-party tradition', code: 'R6', reviewer: '', reviewedAt: '', note: '음주량·지속 언급 없이 문화로' },
      { ko: '의사가 개발한', us: 'Crafted in Korea', code: 'R7', reviewer: '', reviewedAt: '', note: '전문가 권위 대신 원산지 (사실 확인 후)' },
      { ko: '알코올 분해', us: 'Contains Hovenia dulcis extract.', code: 'R8', reviewer: '', reviewedAt: '', note: '기능 대신 성분 사실만' },
      { ko: '간 건강에 좋은', us: 'Made with Hovenia dulcis (oriental raisin tree) extract', code: 'R8', reviewer: '', reviewedAt: '' },
      { ko: '임상으로 입증', us: 'B2C에서는 삭제 · B2B 자료에서만 근거 문서와 함께', code: 'R9', reviewer: '', reviewedAt: '' },
      { ko: '리뷰 쓰면 증정', us: 'Tell us what you think.', code: 'R10', reviewer: '', reviewedAt: '', note: '후기에 대가를 걸지 않음 · 대가가 있으면 관계 표시' },
      { ko: '저당 (저당 젤리·저당 음료)', us: 'Contains [확인 필요: 당 함량] g of sugar per stick.', code: 'R11', reviewer: '', reviewedAt: '', note: "미국에는 'low sugar' 정의 없음 → 수치로 표시 · 음료는 per bottle · 25% 이상 저감 확인 시 R12 비교 표시 가능" }
    ],

    // '기관 안내' 탭: 미국 규제 기관 4곳을 쉬운 말로 요약 (2026-10-23 작성 · 참고용, 공식 사이트로 확인)
    // goto: 이 대시보드에서 관련 내용을 볼 수 있는 탭 (단건 심의 single · 규칙 rules · 규제 모니터링 monitor)
    agencies: [
      {
        code: 'FDA', en: 'Food and Drug Administration', ko: '미국 식품의약국', icon: '🍽️',
        oneLine: '먹는 것과 약을 관리하는 기관입니다. 라벨과 광고 문구를 보고 우리 제품이 "식품"인지 "약"인지 판단합니다.',
        role: [
          '식품·의약품의 안전 기준과 표시(라벨) 규칙을 정하고 단속합니다.',
          '수입 식품을 국경에서 검사하고, 문제가 있으면 통관을 보류하거나 수입을 거부합니다.',
          '규칙을 어긴 회사에 경고장(Warning Letter)을 보내고, 위험한 제품의 리콜을 관리합니다.'
        ],
        forUs: [
          '"숙취 예방·해소"처럼 몸의 문제를 고친다는 표현을 쓰면 식품이 아니라 승인받지 않은 의약품으로 볼 수 있습니다 (2020년 숙취 제품 경고장 7건).',
          '영어 라벨(영양성분표·성분·알레르기)과 당 함량 표시 규칙을 지켜야 합니다. 미국에는 "Low sugar" 표시 기준이 없습니다.',
          '젤리는 질식 위험 젤리 단속(수입 경보 33-15) 대상이 될 수 있습니다.',
          '수출 전에 식품시설 등록, 선적할 때마다 사전 수입 신고(Prior Notice)가 필요합니다.',
          '심각한 부작용이 생기면 Reportable Food Registry 보고 대상인지 판단해야 합니다 (CS → 부작용 접수).'
        ],
        risk: '경고장 · 통관 보류·수입 거부 · 리콜',
        bad: 'Prevents hangovers.', good: 'A Korean after-party ritual in a jelly stick.',
        rules: 'R1 · R2 · R3 · R4 · R7 · R8',
        goto: [['rules', '관련 규칙 보기'], ['monitor', 'openFDA 리콜 조회']],
        url: 'https://www.fda.gov/'
      },
      {
        code: 'FTC', en: 'Federal Trade Commission', ko: '미국 연방거래위원회', icon: '📣',
        oneLine: '광고가 소비자를 속이지 않는지 감시하는 기관입니다. "효과가 있다"고 말하려면 근거가 있어야 합니다.',
        role: [
          '거짓·과장 광고를 단속합니다. 식품은 보통 라벨은 FDA, 광고는 FTC가 주로 봅니다.',
          '효과·안전성을 주장하는 광고에는 과학적 근거(실증)를 요구합니다.',
          '후기·추천 광고 규칙을 정합니다: 대가 관계 표시, 가짜 후기 금지, 좋은 후기를 조건으로 한 보상 금지.'
        ],
        forUs: [
          '아마존 상세페이지·SNS에서 "clinically proven", "guaranteed" 같은 표현은 근거 없이 쓰면 안 됩니다.',
          '인플루언서 협업 게시물에는 대가를 받았다는 표시(#ad 등)가 필요합니다 (인플루언서·파트너 파트와 연결).',
          '"별 5개 리뷰를 쓰면 할인"처럼 좋은 후기를 조건으로 보상하는 이벤트는 하면 안 됩니다.'
        ],
        risk: '시정 명령 · 민사 제재금 · 소비자 환불 명령',
        bad: 'Get a free box for a 5-star review!', good: 'Mango flavor jelly stick, 10 sticks per box.',
        rules: 'R5 · R9 · R10',
        goto: [['rules', '관련 규칙 보기'], ['single', '문구 점검하기']],
        url: 'https://www.ftc.gov/'
      },
      {
        code: 'CBP', en: 'U.S. Customs and Border Protection', ko: '미국 관세국경보호청 (세관)', icon: '🛃',
        oneLine: '미국 국경의 세관입니다. 물건이 들어올 때 통관을 처리하고 관세를 걷습니다.',
        role: [
          '수입 물품의 통관을 처리하고 관세를 걷습니다.',
          '품목분류(HS 코드)와 원산지를 판정합니다. HS 코드가 관세율을 정합니다.',
          'FDA 같은 다른 기관의 수입 요건도 국경에서 함께 확인합니다.'
        ],
        forUs: [
          '젤리 스틱의 HS 코드는 고르는 것이 아니라 제품의 실제 형태·성분으로 정해집니다 (예상 2106.90.99 · README 7장).',
          '잘못된 코드로 신고하면 벌금이나 추가 관세를 낼 수 있습니다.',
          '애매하면 사전 품목분류 결정(binding ruling)을 받아 두고, 비슷한 결정은 CBP CROSS에서 검색합니다.',
          '수입품에는 원산지 표시(Made in Korea)가 필요합니다.'
        ],
        risk: '통관 보류 · 오분류 벌금 · 관세 추징',
        rules: '규칙 없음 (HS 코드·관세는 관세사 확인)',
        goto: [['monitor', 'CBP 공고 조회']],
        url: 'https://www.cbp.gov/'
      },
      {
        code: 'USTR', en: 'Office of the United States Trade Representative', ko: '미국 무역대표부', icon: '🤝',
        oneLine: '미국의 무역 협상 대표입니다. 나라와 나라 사이의 무역 협정과 관세 정책을 정합니다.',
        role: [
          '대통령 직속 기관으로 무역 협정을 협상하고 운영합니다 (한미 FTA = KORUS 포함).',
          '무역법 301조(Section 301) 같은 무역 조치와 추가 관세를 결정합니다.',
          '개별 회사나 제품을 단속하지는 않고, 나라 단위의 규칙을 바꿉니다.'
        ],
        forUs: [
          '한국산 제품에 붙는 관세율이 USTR 결정으로 바뀔 수 있고, 바뀌면 판매 가격과 마진에 영향을 줍니다.',
          'README 7장 조사 기준: 2026-07-24부터 한국산 전 품목에 Section 301 관세 12.5% (KORUS 무관세와 함께 적용될 때의 계산은 관세사 확인 필요).',
          'USTR 결정은 Federal Register에 공고되므로 규제 모니터링 탭에서 확인할 수 있습니다.'
        ],
        risk: '직접 제재는 없음 · 관세 변화로 가격·마진 영향',
        rules: '규칙 없음 (관세 정책 모니터링)',
        goto: [['monitor', 'USTR 공고 조회']],
        url: 'https://ustr.gov/'
      }
    ],

    // 규제 모니터링: 서버가 자동으로 못 읽는 곳 (2026-10-24 확인) → 화면의 바로가기 버튼으로 사람이 확인
    // 자동 수집되는 곳(FDA 경고장·수입 거부·리콜, CBP CROSS, Federal Register, Regulations.gov, CourtListener)은 refresh.py
    manualChecks: [
      { name: 'NAD 광고 심의 결정', url: 'https://bbbprograms.org/media/newsroom/decisions', why: '화면을 자바스크립트로 그려 서버가 못 읽음 · 피드 없음',
        what: '건강·음료·건강기능식품 광고 결정에서 문제 된 표현. 같은 페이지에서 주간 결정 요약 메일을 구독할 수 있음' },
      { name: 'Prop 65 물질 목록 (OEHHA)', url: 'https://oehha.ca.gov/proposition-65/proposition-65-list/', why: '봇 차단 (Incapsula)',
        what: '납 등 경고 문구가 필요한 물질 목록 갱신일 · 원료(젤리 원료·색소)가 목록에 있는지' },
      { name: 'Prop 65 60일 통지 검색 (캘리포니아 법무부)', url: 'https://oag.ca.gov/prop65/60-day-notice-search', why: '검색 결과를 서버가 읽을 수 있는 형태로 주지 않음',
        what: '제품 칸에 jelly · gummy · candy · drink로 검색 → 비슷한 제품이 경고 문구 없이 통지받은 사례' },
      { name: 'FTC 보도자료', url: 'https://www.ftc.gov/news-events/news/press-releases', why: 'FTC RSS가 서버 요청을 막음 (FTC 공고는 Federal Register로 자동 수집 중)',
        what: '건강 광고·후기·인플루언서 단속 소식' },
      { name: 'FDA 수입 경보 33-15 (젤리)', url: 'https://www.accessdata.fda.gov/cms_ia/importalert_105.html', why: '수입 경보 페이지는 자동 수집 대상 아님',
        what: '질식 위험 젤리(곤약 등) 수입 경보 대상 회사·제품 변경' }
    ],

    // 수출 단계별로 어느 기관이 관련되는지
    agencyFlow: [
      { step: '제품 기획', who: ['USTR', 'CBP'], what: '관세율과 HS 코드 확인 → 제품 형태 결정' },
      { step: '라벨·포장', who: ['FDA'], what: '영어 라벨, 영양성분표, 알레르기, 당 함량 표시' },
      { step: '광고·후기', who: ['FTC', 'FDA'], what: '효과 주장 근거, 후기 규칙 · 문구에 따라 FDA가 의약품으로 판단' },
      { step: '선적·통관', who: ['CBP', 'FDA'], what: '사전 수입 신고, 통관 검사, 관세 납부' },
      { step: '판매 후', who: ['FDA', 'FTC'], what: '부작용 접수·보고, 리콜 · 리뷰 관리' }
    ],

    // 쉬운 용어 풀이
    agencyTerms: [
      { term: '경고장 (Warning Letter)', desc: 'FDA가 "이 부분이 규칙 위반이니 고치라"고 공개적으로 보내는 편지. 홈페이지에 공개되어 회사 이름이 알려집니다.' },
      { term: '리콜 (Recall)', desc: '이미 팔린 제품을 회수하는 것. 위험도에 따라 Class I~III로 나눕니다.' },
      { term: '실증 (Substantiation)', desc: '광고에서 주장한 효과를 뒷받침하는 과학적 근거. 광고를 내기 전에 갖고 있어야 합니다.' },
      { term: 'HS 코드', desc: '전 세계 공통 상품 분류 번호. 앞 6자리는 국제 공통, 뒷자리는 나라마다 다르며 관세율이 이 번호로 정해집니다.' },
      { term: 'KORUS', desc: '한미 자유무역협정(FTA). 조건을 충족하는 한국산 제품은 일반 관세를 면제받을 수 있습니다.' },
      { term: 'Section 301', desc: '미국 무역법 301조. USTR이 상대국 무역 관행을 이유로 추가 관세 등을 매길 수 있는 근거 조항입니다.' },
      { term: 'Federal Register', desc: '미국 정부의 관보. FDA·FTC·CBP·USTR의 새 규칙과 공고가 여기에 실립니다.' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
