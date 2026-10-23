/* CS 데이터: 문의 유형 C1~C10, 분류 규칙, 영문 답변 템플릿, 부작용 접수 기준, 더미 문의.
   템플릿을 바꾸면 화면의 'CS → 답변 템플릿' 또는 `node dev/test_parts.js`로 BLOCK이 없는지 확인합니다.
   {name}·{orderNo} 같은 빈칸은 문의·설정 값으로 채우고, 값이 없으면 [확인 필요: …]로 남깁니다. */
(function (global) {
  'use strict';
  const NS = global.REBOOT_DATA = global.REBOOT_DATA || {};

  const SIGN = ['', 'Best regards,', '{brand} Customer Care'];
  const t = lines => lines.concat(SIGN).join('\n');

  NS.cs = {
    version: '2026-10-23',

    // 판매 제품 4종 (2026-10-23 팀 표 기준). 답변 템플릿의 {product}·{flavor}·{pack}을 채웁니다.
    // en은 2026-10-23 팀 제품표의 내부 제품명. flavorsFinal이 false면 맛이 [확인 필요]로 남아 최종 승인이 막힙니다 (맛은 임시).
    brand: { name: 'REBOOT', slogan: 'Restart Your Day' },
    products: [
      { id: 'jelly', ko: '젤리', en: 'Reboot Jelly Original', form: 'stick jelly', flavors: ['lime', 'cherry', 'lemon'], flavorsFinal: false,
        pack: 'individually wrapped sticks in one pack', unit: 'stick', sugarReduced: false },
      { id: 'jelly-ls', ko: '저당 젤리', en: 'Reboot Jelly Balance', form: 'stick jelly', flavors: ['lime', 'cherry', 'lemon'], flavorsFinal: false,
        pack: 'individually wrapped sticks in one pack', unit: 'stick', sugarReduced: true },
      { id: 'drink', ko: '음료', en: 'Reboot Drink Original', form: 'non-carbonated drink', flavors: ['lime', 'cherry', 'lemon'], flavorsFinal: false,
        pack: '6 small bottles per box', unit: 'bottle', sugarReduced: false },
      { id: 'drink-ls', ko: '저당 음료', en: 'Reboot Drink Balance', form: 'non-carbonated drink', flavors: ['lime', 'cherry', 'lemon'], flavorsFinal: false,
        pack: '6 small bottles per box', unit: 'bottle', sugarReduced: true }
    ],
    // 문의 본문으로 제품 추정 (순서대로 검사, 못 찾으면 '' → 담당자가 선택)
    productHints: [
      { id: 'drink-ls', re: '(reduced|less|low|lower)[ -]*sugar[^.!?]{0,40}(drink|bottle|beverage)|(drink|bottle|beverage)[^.!?]{0,40}(reduced|less|low|lower)[ -]*sugar' },
      { id: 'jelly-ls', re: '(reduced|less|low|lower)[ -]*sugar[^.!?]{0,40}(jelly|stick)|(jelly|stick)[^.!?]{0,40}(reduced|less|low|lower)[ -]*sugar|저당 ?젤리' },
      { id: 'drink', re: '(^|[^a-z])(drinks?|bottles?|beverages?|caps?)([^a-z]|$)|음료|병' },
      { id: 'jelly', re: '(^|[^a-z])(jelly|jellies|sticks?)([^a-z]|$)|젤리|스틱' }
    ],

    // 답장 초안 페르소나: 'AI로 초안 다듬기'(tabs/cs/ai_draft.py)가 이 인물로 씁니다. text는 300자 이내.
    // 효능 주장 금지·[확인 필요] 유지 같은 안전 규칙은 서버 프롬프트에도 따로 들어 있습니다.
    persona: {
      name: 'Hana',
      title: 'REBOOT 고객경험 매니저 · 마케팅·CS·언어 전문가',
      text: "REBOOT 고객경험 매니저 '하나(Hana)'. 미국 식품 마케팅·CS 10년 경력, 한·영 원어민급. 젤리·음료 4종(저당 포함)의 맛·성분·섭취법·보관·알레르기와 주문·배송·환불 정책을 꿰고 있다. 첫 문장에서 고객 이름을 부르며 불편에 공감하고, 따뜻한 미국식 비즈니스 영어로 정중히 답한다. 사과는 진심으로 한 번, 다음 할 일과 회신 시점을 약속한다. 모르는 사실은 지어내지 않고 [확인 필요]로 남긴다. 숙취 해소·예방·치료 같은 효능 주장은 절대 쓰지 않고, 건강·부작용 문의에는 섭취 중단과 의료 상담 안내를 먼저 한다."
    },

    // ownerRequired: 지정 담당의 추가 검토 체크 전에는 최종 승인 불가 (즉시 에스컬레이션·담당자 필수 유형)
    types: [
      {
        code: 'C1', name: '부작용 신고', mode: '🔴 즉시 에스컬레이션', owner: '품질·규제 담당', dueHours: 1, tag: '불만·건강', ownerRequired: true,
        keywords: ['rash', 'hives', 'itchy', 'allergic reaction', 'swelling', 'swollen', 'vomit', 'threw up', 'throw up', 'dizzy', 'faint',
          'hospital', 'emergency', 'chest pain', 'trouble breathing', 'felt sick', 'got sick', 'side effect'],
        keywordsKo: ['부작용', '두드러기', '가려', '구토', '어지러', '응급', '병원', '입원'],
        template: t([
          'Hi {name},',
          '',
          'Thank you for telling us about this, and we are sorry you felt unwell. Your safety comes first.',
          '',
          'Please stop using the product for now. If your symptoms continue or get worse, please contact a doctor or call your local emergency number.',
          '',
          'So our quality team can look into this right away, could you reply with:',
          '- the lot number printed on the package',
          '- the date you had the product',
          '- what symptoms you noticed and when they started',
          '',
          'Order number: {orderNo}',
          '',
          'A member of our quality team will follow up with you within [확인 필요: 품질팀 회신 기한].'
        ])
      },
      {
        code: 'C2', name: '건강·복용·효능', mode: '🟠 담당자 필수', owner: 'CS 리드(건강)', dueHours: 24, tag: '효과', ownerRequired: true,
        keywords: ['pregnant', 'pregnancy', 'breastfeeding', 'nursing', 'medication', 'safe to take', 'okay to have', 'how many',
          'dosage', 'children', 'kids', 'does it work', 'effective', 'health condition'],
        keywordsKo: ['임신', '수유', '복용', '효과'],
        template: t([
          'Hi {name},',
          '',
          'Thanks for your question. We are not able to give personal medical advice, so please check the full ingredient list on the label and talk with your doctor or pharmacist before trying {product}, especially if you are pregnant or nursing, take regular medication, or have a health condition.',
          '',
          'Ingredients: {ingredients}',
          'Allergens: {allergens}',
          '',
          'If you have any other questions about the product itself, we are happy to help.'
        ])
      },
      {
        code: 'C3', name: '환불·교환', mode: '🟠 담당자 필수', owner: 'CS 리드', dueHours: 24, tag: '환불', ownerRequired: true,
        keywords: ['refund', 'return', 'exchange', 'money back', 'cancel', 'cancellation'],
        keywordsKo: ['환불', '교환', '반품', '취소'],
        template: t([
          'Hi {name},',
          '',
          'Thank you for reaching out about order {orderNo}. We are sorry it did not work out.',
          '',
          'Our refund and exchange policy: [확인 필요: 환불·교환 정책 확정 전].',
          '',
          'Once you let us know whether you would like a refund or an exchange, we will take care of the next steps.'
        ])
      },
      {
        code: 'C4', name: '포장·품질 불량', mode: '🟠 담당자 필수', owner: '품질 담당', dueHours: 24, tag: '포장', ownerRequired: true,
        keywords: ['damaged', 'leaking', 'leak', 'broken', 'expired', 'mold', 'moldy', 'defective', 'wrong item', 'missing item', 'melted', 'loose cap', 'cap was loose', 'spilled', 'cracked bottle'],
        keywordsKo: ['파손', '불량', '유통기한', '곰팡이', '누락'],
        template: t([
          'Hi {name},',
          '',
          'We are sorry your order {orderNo} arrived in this condition. Could you send us a photo of the package and the lot number printed on it? This helps our quality team look into what happened.',
          '',
          'Please do not use any item that is damaged or leaking. Once we receive the photo, we will arrange a replacement or refund under our policy: [확인 필요: 환불·교환 정책].'
        ])
      },
      {
        code: 'C5', name: '배송', mode: '🟢 자동 초안', owner: 'CS 담당', dueHours: 24, tag: '배송', ownerRequired: false,
        keywords: ['shipping', 'ship', 'shipped', 'delivery', 'deliver', 'delivered', 'tracking', 'where is my order',
          "haven't received", 'not received', 'arrive', 'arrived'],
        keywordsKo: ['배송', '택배', '도착'],
        template: t([
          'Hi {name},',
          '',
          'Thanks for checking in on order {orderNo}.',
          '',
          'Tracking number: {tracking}',
          'Estimated delivery: {eta}',
          '',
          'If the tracking page has not updated in a few days, just reply to this email and we will contact the carrier for you.'
        ])
      },
      {
        code: 'C6', name: '제품 정보 (맛·성분·알레르기)', mode: '🟢 자동 초안', owner: 'CS 담당', dueHours: 24, tag: '맛', ownerRequired: false,
        keywords: ['flavor', 'flavour', 'taste', 'ingredient', 'allergen', 'allergy', 'nuts', 'gluten', 'vegan', 'sugar', 'calories', 'caffeine'],
        keywordsKo: ['맛', '성분', '알레르기'],
        template: t([
          'Hi {name},',
          '',
          'Thanks for your interest in {product}!',
          '',
          'Flavor: {flavor}',
          'Ingredients: {ingredients}',
          'Allergens: {allergens}',
          '',
          'Please check the label on the package for the most up-to-date information.'
        ])
      },
      {
        code: 'C7', name: '가격·프로모션', mode: '🟢 자동 초안', owner: 'CS 담당', dueHours: 24, tag: '가격', ownerRequired: false,
        keywords: ['price', 'pricing', 'discount', 'coupon', 'promo', 'promotion', 'sale', 'code', 'deal'],
        keywordsKo: ['가격', '할인', '쿠폰', '프로모션'],
        template: t([
          'Hi {name},',
          '',
          'Thanks for asking! Current pricing and promotions: [확인 필요: 현재 가격·프로모션].',
          '',
          'Promotions can change, so the price shown at checkout is the final price.'
        ])
      },
      {
        code: 'C8', name: '리뷰·평점 (불만)', mode: '🟠 담당자 필수', owner: 'CS 리드', dueHours: 24, tag: '불만', ownerRequired: true,
        keywords: ['1-star', 'one star', 'terrible', 'worst', 'awful', 'disappointed', 'waste of money', 'scam', 'rip-off'],
        keywordsKo: ['최악', '실망', '별점'],
        template: t([
          'Hi {name},',
          '',
          'Thank you for your honest feedback, and we are sorry {product} did not meet your expectations. We read every message and share it with our team.',
          '',
          'Could you tell us a little more about what went wrong with order {orderNo}? We would like to make it right.'
        ])
      },
      {
        code: 'C9', name: 'B2B·대량 구매', mode: '🔵 영업 전달', owner: '해외영업 {확인 필요}', dueHours: 48, tag: '—', ownerRequired: false,
        keywords: ['wholesale', 'bulk', 'distributor', 'distribution', 'B2B', 'MOQ', 'retail partner', 'reseller', 'carry your'],
        keywordsKo: ['도매', '대량', '유통', '입점'],
        template: t([
          'Hi {name},',
          '',
          'Thank you for your interest in carrying {brand}. We have passed your message to our business team, and they will contact you within [확인 필요: 영업 회신 기한] with wholesale details.'
        ])
      },
      {
        code: 'C10', name: '기타·협업 제안', mode: '⚪ 다른 파트 전달', owner: '인플루언서·파트너 (혁주·효선)', dueHours: 72, tag: '—', ownerRequired: false,
        keywords: ['collab', 'collaborate', 'collaboration', 'partnership', 'influencer', 'sponsor', 'sponsorship', 'creator', 'PR package', 'affiliate'],
        keywordsKo: ['협업', '제휴', '협찬'],
        template: t([
          'Hi {name},',
          '',
          'Thank you for reaching out! We have shared your message with the right team, and they will get back to you soon.'
        ])
      }
    ],

    classifyOrder: ['C1', 'C9', 'C8', 'C10', 'C2', 'C3', 'C4', 'C5', 'C7', 'C6'],
    fallbackType: 'C10',

    statuses: ['답변 대기', '검토 중', '승인', '발송 완료', '종결'],

    // 정할 것 #7 확정 전 임시 기준: REVISE·REVIEW 판정이 남은 초안은 승인 의견을 남겨야 승인 가능
    approvalPolicy: { reviseNeedsComment: true },

    adverse: {
      required: ['customer', 'contact', 'product', 'lot', 'symptoms'],
      careOptions: ['없음', '외래', '응급진료', '입원', '모름'],
      outcomeOptions: ['회복', '진행 중', '모름', '의료 처치 필요했음', '입원', '생명 위협', '장애', '사망'],
      seriousOutcomes: ['의료 처치 필요했음', '입원', '생명 위협', '장애', '사망'],
      urgentReviewHours: 1,   // 팀 내부 기준 (C1 응답 기한)
      rfrHours: 24            // 보고 대상으로 판단한 시점부터
    },

    // 시연·테스트용 가짜 문의. 실제 고객 정보는 넣지 않습니다. expect는 분류 테스트용.
    dummyInquiries: [
      { id: 'TEST-01', expect: 'C1', hoursAgo: 0.4, name: 'Test Customer 01', from: 'test01@example.com', orderNo: 'TEST-1001',
        subject: 'Itchy spots after the jelly stick', body: 'I had one stick last night and this morning I have red, itchy spots on my arms. Is this an allergic reaction?' },
      { id: 'TEST-02', expect: 'C1', hoursAgo: 2, name: 'Test Customer 02', from: 'test02@example.com', orderNo: 'TEST-1002',
        subject: 'Went to the ER', body: 'My partner felt dizzy and threw up after having two sticks, so we went to the emergency room. What is in this product?' },
      { id: 'TEST-03', expect: 'C2', hoursAgo: 3, name: 'Test Customer 03', from: 'test03@example.com', orderNo: '',
        subject: 'Question before buying', body: "I'm 5 months pregnant. Is it okay to have these?" },
      { id: 'TEST-04', expect: 'C3', hoursAgo: 20, name: 'Test Customer 04', from: 'test04@example.com', orderNo: 'TEST-1004',
        subject: 'Refund request', body: "I'd like to send back my unopened box and get a refund." },
      { id: 'TEST-05', expect: 'C4', hoursAgo: 30, name: 'Test Customer 05', from: 'test05@example.com', orderNo: 'TEST-1005',
        subject: 'Box arrived leaking', body: 'Two of the sticks were leaking and the box was damaged.' },
      { id: 'TEST-06', expect: 'C5', hoursAgo: 5, name: 'Test Customer 06', from: 'test06@example.com', orderNo: 'TEST-1006',
        tracking: 'TEST-TRK-1006', eta: 'Oct 27',
        subject: 'Where is my order?', body: "I ordered last week and still haven't received it." },
      { id: 'TEST-07', expect: 'C6', hoursAgo: 8, name: 'Test Customer 07', from: 'test07@example.com', orderNo: '',
        subject: 'Flavor and allergens', body: 'What flavor is it, and does it contain nuts or gluten?' },
      { id: 'TEST-08', expect: 'C7', hoursAgo: 12, name: 'Test Customer 08', from: 'test08@example.com', orderNo: '',
        subject: 'First order', body: 'Is there a discount for first orders? My code did not go through.' },
      { id: 'TEST-09', expect: 'C8', hoursAgo: 26, name: 'Test Customer 09', from: 'test09@example.com', orderNo: 'TEST-1009',
        subject: 'Not happy', body: 'Tastes terrible. Worst purchase this month.' },
      { id: 'TEST-10', expect: 'C9', hoursAgo: 6, name: 'Test Customer 10', from: 'test10@example.com', orderNo: '',
        subject: 'Wholesale inquiry', body: 'We run a few convenience stores in LA and are interested in wholesale pricing and your MOQ.' },
      { id: 'TEST-11', expect: 'C10', hoursAgo: 40, name: 'Test Customer 11', from: 'test11@example.com', orderNo: '',
        subject: 'Hello from a creator', body: "I'm a creator with 80k followers and would love to collaborate." },
      { id: 'TEST-12', expect: 'C10', hoursAgo: 1, name: 'Test Customer 12', from: 'test12@example.com', orderNo: '',
        subject: 'Question', body: 'Hi, I have a quick question about your company. Who should I contact?' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
