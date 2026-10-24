/* 컴플라이언스 데이터: 규칙 R1~R12, 채널, 검증용 문구, 한국→미국 표현 매핑.
   규칙을 바꾸면 화면의 '규칙·검증' 탭 또는 `node dev/test_parts.js`로 다시 확인합니다.
   근거 구분(basis)은 초안입니다 {확인 필요: 규제 담당 확인 후 확정}. */
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
    // basis: official 공식 근거 · internal 내부 정책 · context 문맥 검토
    rules: [
      {
        code: 'R1', name: '질병·치료 클레임', verdict: 'BLOCK', basis: ['official', 'context'],
        terms: ['cure', 'prevent', 'prevention', 'relief', 'relieve', 'remedy', 'detox', 'detoxify', 'toxin', 'heal'],
        ko: ['치료', '예방', '완화', '해독'],
        reason: '질병을 예방·치료·완화한다는 표현은 일반식품을 미승인 의약품처럼 보이게 함 (2020 숙취 제품 경고장). detox·relief는 문맥 검토',
        alt: '섭취 시점·맛·포맷 등 사실 묘사'
      },
      {
        code: 'R2', name: "'hangover' 직접 언급", verdict: 'BLOCK', basis: ['official', 'internal'],
        terms: ['hangover', 'hang-over'],
        ko: ['숙취'],
        reason: 'FDA 경고장은 숙취 예방·완화 주장을 의약품 표현으로 봄. 단순 언급까지 막는 것은 팀 기준',
        alt: 'After-Party, Morning-After Ritual'
      },
      {
        code: 'R3', name: '안전성 보장·간 보호', verdict: 'BLOCK', basis: ['official', 'context'],
        terms: ['protect your liver', 'protects your liver', 'liver protection', 'liver detox', 'no side effects', 'side-effect free', 'completely safe', '100% safe'],
        ko: ['간 보호', '간 해독', '부작용 없'],
        reason: '간 보호는 질병 예방 성격이고, 안전성 보장은 과학적 근거(실증)가 필요한 주장',
        alt: '"라벨 확인 + 전문가 상담" 안내'
      },
      {
        code: 'R4', name: '알코올 홍조·ALDH2', verdict: 'BLOCK', basis: ['internal'],
        terms: ['asian glow', 'alcohol flush', 'flush reaction', 'flushing', 'ALDH2', 'red face'],
        ko: ['홍조', '얼굴 빨개'],
        reason: '알코올 홍조·ALDH2 언급은 체질·질환 개선 주장으로 읽힐 수 있음 (팀 기준)',
        alt: '판매 문구에서 제외'
      },
      {
        code: 'R5', name: '효과 보장·과장', verdict: 'REVISE', basis: ['official', 'context'],
        terms: ['guarantee', 'clinically proven', 'proven to', '100%', 'works every time', 'instant results', 'miracle'],
        ko: ['효과 보장', '확실한 효과', '기적'],
        reason: '효과 보장·과장은 FTC가 과학적 근거를 요구. 100% juice처럼 효과 주장이 아니면 문맥 검토',
        alt: '용량·포장·맛 같은 검증 가능한 사실'
      },
      {
        code: 'R6', name: '음주 조장', verdict: 'REVISE', basis: ['internal'],
        terms: ['drink all night', 'party harder', 'drink more', 'keep drinking', 'drink without worry', 'outdrink'],
        ko: ['더 마셔', '밤새 마셔', '마음껏 마셔'],
        reason: '음주를 부추기는 표현 (팀 기준 · 브랜드·플랫폼 리스크)',
        alt: '음주량·음주 지속을 언급하지 않음'
      },
      {
        code: 'R7', name: '의약품 오인', verdict: 'REVISE', basis: ['context', 'internal'],
        terms: ['hangover pill', 'pill', 'tablet', 'capsule', 'doctor-formulated', 'pharmacist-formulated', "nature's aspirin", 'aspirin', 'medicine', 'prescription'],
        ko: ['숙취약', '의약품', '알약', '처방'],
        reason: '약처럼 보이는 명칭·표현은 제품의 의도된 용도를 판단하는 요소가 될 수 있음',
        alt: 'jelly stick, shot 등 식품 포맷 명칭'
      },
      {
        code: 'R8', name: '구조·기능 클레임', verdict: 'REVISE', basis: ['internal'],
        terms: ['supports liver health', 'liver health', 'liver function', 'alcohol metabolism', 'metabolize alcohol', 'metabolizes alcohol', 'supports healthy', 'boosts immunity',
          'these statements have not been evaluated by the food and drug administration'],
        ko: ['간 건강', '간 기능', '알코올 대사', '면역력 강화'],
        reason: '일반식품도 영양적 가치에 기반한 구조·기능 표현은 가능함. 근거 자료 확보 전까지 팀은 보수적으로 수정 처리 (보충제용 면책문구는 일반식품에 맞지 않음)',
        alt: '삭제 또는 영양 성분 사실만 (영양 근거가 있으면 규제 담당 검토 후 허용 여부 결정)',
        byCategory: { SUPPLEMENT: 'COND' }
      },
      {
        code: 'R9', name: '인체적용시험 인용', verdict: 'REVISE', basis: ['official', 'internal'],
        terms: ['clinically tested', 'clinical study', 'clinical studies', 'clinical trial', 'human study', 'human trial'],
        ko: ['임상', '인체적용시험', '인체 적용 시험'],
        reason: '임상·시험 인용은 FTC 실증 대상. B2C에서 삭제하는 것은 팀 기준',
        alt: 'B2C에서는 삭제, B2B 자료에서만 (근거 문서와 함께)',
        byChannel: { b2b: 'REVIEW' }
      },
      {
        code: 'R10', name: '후기·리뷰', verdict: 'REVIEW', basis: ['official'],
        terms: ['testimonial', '5-star', 'five-star', 'customer review', 'rated #1', 'top-rated'],
        ko: ['후기', '리뷰', '별점'],
        reason: '후기도 R1~R7로 심의하고 대가 관계를 표시 (FTC 추천·후기 지침)',
        alt: '후기도 R1~R7로 심의, 대가 관계 표시',
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
        alt: '당 함량 수치로 표시: "[N] g of sugar per stick/bottle" · 저감률은 R12 기준 충족 시'
      },
      {
        code: 'R12', name: '당 함량 강조 표시', verdict: 'COND', basis: ['official', 'context'], off: true,
        terms: ['reduced sugar', 'less sugar', 'lower sugar', 'sugar free', 'zero sugar', 'no sugar', 'sugarless', 'no added sugar', 'without added sugar', 'sugar-reduced'],
        ko: ['무설탕', '설탕 무첨가', '당류 저감', '당을 줄인', '제로 슈거', '당 줄인'],
        reason: "reduced·less sugar는 기준 제품보다 당류 25% 이상 적고 비교 대상·수치를 함께 표시해야 함. sugar free는 1회 제공량당 0.5 g 미만, no added sugar는 별도 조건 (21 CFR 101.60(c)). 기준 충족을 확인한 저당 제품만 조건부, 일반 제품은 사용 불가",
        alt: '"25% less sugar than our original jelly ([N] g vs [N] g per stick)" — 수치 확인 후 · 확인 전에는 당 함량 수치만',
        byProduct: { jelly: 'BLOCK', drink: 'BLOCK' }
      }
    ],

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

    // FDA 숙취 제품 경고장 원문 인용 문구 — 원문 그대로(대괄호·말줄임 포함).
    // 시연본(dashboard.html DATA_CLAIMS) 53개 이관 (2026-10-23) · FDA 경고장 7통 (2020-07-23)
    // 원문 대조: Double Wood 11개 · Purple Biosciences 10개 일치 확인 (따옴표 모양 ’ → ' 차이만)
    // '규칙 검증'의 목표는 이 문구 중 PASS 0개 — PASS가 나오면 규칙이 놓친 표현입니다
    warningQuotes: [
      // FDA-2020-HO-01 · Double Wood LLC · Dycetin — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/double-wood-llc-593766-07232020
      { text: 'PREVENT HANGOVERS - No product is more proven or effective at preventing hangover symptoms', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'PROTECT YOUR LIVER AND BRAIN - Research shows Dycetin reduces alcohol induced damage to the liver and brain.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin is the most effective hangover preventing supplement currently available.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Top Rated National Hangover Prevention Supplement', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'NEVER SUFFER ANOTHER HANGOVER', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'ADVANCED HANGOVER PREVENTION FORMULA', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'It may reduce hangover symptoms by up to 99%.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'To reduce feelings of alcohol intoxication, take one tablet before you start drinking,', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: "Simply take 2 tablets 30 minutes before drinking and you'll be able to drink a 2-3 beers", firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'Dycetin is a natural scientifically proven hangover prevention supplement', firm: 'Double Wood LLC', issued: '2020-07-23' },
      { text: 'It will knock out an existing hangover as well.', firm: 'Double Wood LLC', issued: '2020-07-23' },
      // FDA-2020-HO-02 · Ebnsol Inc. · PartyPal — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/ebnsol-inc-593771-07232020
      { text: 'One tested combination of ingredients in unique concentrations proved uniquely effective against hangovers', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'different cultures have traditionally applied a variety of natural remedies for hangover relief and prevention', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'the most effective hangover treatments from 3 different parts of the globe', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'all combined into easy to use tablets that REALLY WORK!', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'after a night of drinking debauchery, you can feel better right away!', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'Dihydromyricetin, or DHM [ingredient in PartyPal], is a truly scientific way to prevent the dreaded hangover.', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      { text: 'GUARANTEED RELIEF – We take this product ourselves, and are proud to present it to you as a true hangover cure.', firm: 'Ebnsol Inc.', issued: '2020-07-23' },
      // FDA-2020-HO-03 · Vita Heaven, LLC dba Hangover Heaven · Hangover Heaven Nightlife Prep Supplement — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/vita-heaven-llc-dba-hangover-heaven-593765-07232020
      { text: 'Hangover Cure through Prevention', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'If you take our supplements you will have much less of a hangover the next morning.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'These supplements contain ingredients that help your body deal with the breakdown products of alcohol, which cause hangovers.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'Dosing depends on how much you plan to drink and the severity of your hangovers.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      { text: 'Best Hangover Pills to Prevent Hangovers', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23' },
      // FDA-2020-HO-04 · Happy Hour Vitamins · Happy Hour Vitamins (H2V) — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/happy-hour-vitamins-593770-07232020
      { text: 'Multivitamin Specially Formulated to Help with Hangovers.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'HELPS AVOID HANGOVERS!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'KILL YOUR HANGOVER BEFORE IT EVEN STARTS with powerful vitamin, mineral, anti-oxidant, herbal blend.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'GET RID OF TOXIC ACETALDEHYDE POISONING that adds to your hangovers with N-acetyl Cysteine', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'These are the hangover cure pills you are looking for!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'Antioxidants can help the body deal with toxins & other effects from alcohol', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'a multivitamin specifically formulated for the drinking population', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'selling the most effective hangover cure on the market.', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'These are the hangover pills you need for the perfect wedding, bachelor, bachelorette, vacation', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      { text: 'The Only Thing You Have To Lose Is Your Hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23' },
      // FDA-2020-HO-05 · LES Labs · DeToxx for Hangovers — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/les-labs-593764-07232020
      { text: 'DETOXX FOR HANGOVERS', firm: 'LES Labs', issued: '2020-07-23' },
      { text: 'DeToxx helps reduce hangover symptoms . . . Natural ingredients including milk thistle, prickly pear and cysteine', firm: 'LES Labs', issued: '2020-07-23' },
      { text: 'Helps prevent hangover symptoms*', firm: 'LES Labs', issued: '2020-07-23' },
      // FDA-2020-HO-06 · Mind, Body & Coal LLC · Miracoal - Ultimate Hangover Relief and Total Body Detox — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/mind-body-coal-llc-593774-07232020
      { text: 'Ultimate Hangover Relief', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'PUT YOUR HANGOVER TO BED', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'we have researched, created and patented an effective formula that detoxes impurities from your system...', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'Miracoal Hangover Prevention and Relief Pills', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'THE ULTIMATE HANGOVER PREVENTION', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: "You'll wake up feeling . . . hangover-free!", firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      { text: 'Now when I go out, if I have a few cocktails, I just take my Miracoal before I go to bed.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23' },
      // FDA-2020-HO-07 · Purple Biosciences LLC · Purple Tree — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/purple-biosciences-llc-593772-07232020
      { text: "Purple Tree® is a natural multivitamin specifically designed to reduce alcohol's negative effects in the body . . .", firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Yes, Purple Tree is a hangover prevention pill that works.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'which has been used for centuries as an anti-alcohol herb and hangover cure in Asia.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Say Goodbye to Hangovers . . . SHOP NOW', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Purple Tree Hangover Cure & Prevention Pills', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'HELPS PREVENT HANGOVER SYMPTOMS', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: "Purple Tree's science-backed formula includes Dihydromyricetin (DHM), a liver detox and hangover prevention ingredient.", firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: "White Willow Bark, also called 'Nature's Aspirin', acts as a natural anti-inflammatory agent in the human body.*", firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Milk Thistle helps to protect the liver from damage.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23' },
      { text: 'Our hangover prevention pills were crafted by Doctors and Scientists with vast experience in natural supplements.', firm: 'Purple Biosciences LLC', issued: '2020-07-23' }
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
