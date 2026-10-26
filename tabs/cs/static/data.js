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

    // 판매 제품 4종 — 브랜드 키트(tabs/content/data/brand_kit.json · 2026-10-24) 기준. 답변 템플릿의 {product}·{flavor}·{pack}을 채웁니다.
    // 맛은 확정(flavorsFinal: true) · "Zero Sugar"는 Balance 2종에만(zeroSugar) · 봉지 안 개수·함량·인증·원산지·알레르기는 미정 → 답장에서 [확인 필요]
    // 2026-10-25 브랜드 가이드 v1.1: 젤리는 구미형(곤약 아님) · 맛별 모양 체리=카우보이 모자 · 레몬=올가미 · 라임=부츠 (리볼버 모양은 소개 안 함)
    // ZERO SUGAR: 당류 0.5 g 미만 측정 확인 · 1회 섭취 기준량·라벨 1회 제공량 둘 다 · PM 확인 2026-10-25 → zeroSugarFinal true (Balance 문의에 'Zero Sugar'라고 답함)
    // 젤리는 봉지당 10개 (제품 최종 정보) · 함량·인증·원산지·알레르기·영양 수치는 미정 → 답장에서 [확인 필요]
    brand: { name: 'REBOOT', slogan: 'Restart Your Day' },
    zeroSugarFinal: true,
    products: [
      { id: 'jelly', ko: 'Original 젤리', en: 'Reboot Jelly Original', form: 'individually wrapped gummy-type shaped jelly (cherry = cowboy hat, lemon = lasso, lime = cowboy boot)', flavors: ['lime', 'lemon', 'cherry'], flavorsFinal: true,
        pack: 'one pouch of 10 individually wrapped jellies', unit: 'jelly', zeroSugar: false },
      { id: 'jelly-ls', ko: 'Balance 젤리', en: 'Reboot Jelly Balance', form: 'individually wrapped gummy-type shaped jelly (cherry = cowboy hat, lemon = lasso, lime = cowboy boot)', flavors: ['cherry', 'lime', 'lemon'], flavorsFinal: true,
        pack: 'one pouch of 10 individually wrapped jellies', unit: 'jelly', zeroSugar: true },
      { id: 'drink', ko: 'Original 음료', en: 'Reboot Drink Original', form: 'non-carbonated drink', flavors: ['lemon', 'cherry', 'lime'], flavorsFinal: true,
        pack: 'single 100 ml bottle or 3-bottle box', unit: 'bottle', zeroSugar: false },
      { id: 'drink-ls', ko: 'Balance 음료', en: 'Reboot Drink Balance', form: 'non-carbonated drink', flavors: ['lemon', 'lime', 'cherry'], flavorsFinal: true,
        pack: 'single 100 ml bottle or 3-bottle box', unit: 'bottle', zeroSugar: true }
    ],
    // 문의 본문으로 제품 추정 (순서대로 검사, 못 찾으면 '' → 담당자가 선택)
    productHints: [
      // 2026-10-24 (GPT 검토 ㉚): 정식 제품명(Drink Balance 등)·한국어 '저당 음료'를 먼저 봄 · 저당 제품을 일반 제품으로 잘못 추정하던 문제
      { id: 'drink-ls', re: 'drink[ -]*balance|zero[ -]*sugar[^.!?]{0,40}(drink|bottle|beverage)|(drink|bottle|beverage)[^.!?]{0,40}zero[ -]*sugar|(reduced|less|low|lower)[ -]*sugar[^.!?]{0,40}(drink|bottle|beverage)|(drink|bottle|beverage)[^.!?]{0,40}(reduced|less|low|lower)[ -]*sugar|저당 ?음료|음료[^.!?]{0,10}저당' },
      { id: 'jelly-ls', re: 'jelly[ -]*balance|zero[ -]*sugar[^.!?]{0,40}(jelly|jellies|stick|pouch)|(jelly|jellies|stick|pouch)[^.!?]{0,40}zero[ -]*sugar|(reduced|less|low|lower)[ -]*sugar[^.!?]{0,40}(jelly|stick)|(jelly|stick)[^.!?]{0,40}(reduced|less|low|lower)[ -]*sugar|저당 ?젤리|젤리[^.!?]{0,10}저당' },
      { id: 'drink', re: 'drink[ -]*original|(^|[^a-z])(drinks?|bottles?|beverages?|caps?)([^a-z]|$)|음료|병' },
      { id: 'jelly', re: 'jelly[ -]*original|(^|[^a-z])(jelly|jellies|sticks?)([^a-z]|$)|젤리|스틱' }
    ],

    // 답장 초안 페르소나: 'AI로 초안 다듬기'(tabs/cs/ai_draft.py)가 이 인물로 씁니다. text는 400자 이내 (답장 설정에서 팀이 고칠 수 있고, 고친 값이 우선).
    // 효능 주장 금지·[확인 필요] 유지 같은 안전 규칙은 서버 프롬프트에도 따로 들어 있습니다.
    persona: {
      name: 'Hana',
      title: 'REBOOT 고객경험 매니저 · 마케팅·CS·언어 전문가',
      text: "REBOOT 고객경험 매니저 '하나(Hana)'. 미국 식품 마케팅·CS 10년 경력, 한·영 원어민급. 젤리·음료 4종(Original·Balance)의 맛·성분·섭취법·보관·알레르기와 주문·배송·환불 정책을 꿰고 있다. 첫 문장에서 고객 이름을 부르며 불편에 공감하고, 따뜻한 미국식 비즈니스 영어로 정중히 답한다. 사과는 진심으로 한 번, 다음 할 일과 회신 시점을 약속한다. 모르는 사실은 지어내지 않고 [확인 필요]로 남긴다. 숙취 해소·예방·치료 같은 효능 주장은 절대 쓰지 않고, 건강·부작용 문의에는 섭취 중단과 의료 상담 안내를 먼저 한다."
    },

    // ownerRequired: 지정 담당의 추가 검토 체크 전에는 최종 승인 불가 (즉시 에스컬레이션·담당자 필수 유형)
    types: [
      {
        code: 'C1', name: '부작용 신고', mode: '즉시 에스컬레이션', owner: '품질·규제 담당', dueHours: 1, tag: '불만·건강', ownerRequired: true,
        keywords: ['rash', 'hives', 'itchy', 'allergic reaction', 'swelling', 'swollen', 'vomit', 'threw up', 'throw up', 'dizzy', 'faint',
          'hospital', 'emergency', 'chest pain', 'trouble breathing', 'felt sick', 'got sick', 'side effect',
          // 2026-10-24 보강 (GPT 검토 ④: 설사·호흡곤란이 C3·C10으로 빠짐) · 젤리라 질식(choke)도 C1
          'diarrhea', 'diarrhoea', 'nausea', 'nauseous', 'stomach ache', 'stomachache', 'stomach pain', 'abdominal pain', 'cramps',
          'breathe', 'breathing', 'short of breath', 'choke', 'choking', 'throat', 'swell', 'headache', 'migraine', 'palpitations',
          'heart racing', 'passed out', 'seizure', 'anaphylaxis', 'the ER', 'urgent care', 'food poisoning', 'made me sick',
          'feel sick', 'feeling sick', 'sick after', 'numb', 'tingling', 'fever', 'bleeding'],
        keywordsKo: ['부작용', '두드러기', '가려', '구토', '어지러', '응급', '병원', '입원',
          '알레르기 반응', '알러지 반응', '알레르기가 올라', '알레르기 올라', '알러지 올라', '알레르기가 생', '알러지가 생', '발진', '부었', '붓기', '부어', '토했', '토할', '설사', '복통', '배탈', '숨이', '호흡', '식중독', '이상 반응',
          '숨쉬', '숨 쉬', '메스꺼', '울렁', '두통', '열이', '기절', '경련', '질식', '목에 걸', '체했', '저리'],   // 2026-10-24 보강: '알러지 올라오는데'가 C2로 분류된 사례 · 2026-10-26 '알레르기' 단독은 C6
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
          'A member of our quality team will follow up with you within {qualityDue}.'
        ])
      },
      {
        code: 'C2', name: '건강·복용·효능', mode: '담당자 필수', owner: 'CS 리드(건강)', dueHours: 24, tag: '효과', ownerRequired: true,
        keywords: ['pregnant', 'pregnancy', 'breastfeeding', 'nursing', 'medication', 'safe to take', 'okay to have',
          'how many can', 'how many should', 'how many per day', 'how many a day',
          'dosage', 'children', 'kids', 'does it work', 'effective', 'health condition',
          // 2026-10-26 최종 검토: 처음 보는 문의에서 '기타'로 떨어진 효능·숙취·음주 시점·나이 질문
          'hangover', 'hangovers', 'hungover', 'cure', 'does it help', 'before drinking', 'after drinking', 'before or after', 'night out',
          'year-old', 'years old', 'toddler', 'safe for'],
        keywordsKo: ['임신', '수유', '복용', '효과', '숙취', '효능', '술 마시기', '음주 전', '음주 후', '아이가', '어린이'],
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
        code: 'C3', name: '환불·교환', mode: '담당자 필수', owner: 'CS 리드', dueHours: 24, tag: '환불', ownerRequired: true,
        keywords: ['refund', 'return', 'exchange', 'money back', 'cancel', 'cancellation', 'charged twice', 'double charged', 'overcharged', 'chargeback'],
        keywordsKo: ['환불', '교환', '반품', '취소'],
        template: t([
          'Hi {name},',
          '',
          'Thank you for reaching out about order {orderNo}. We are sorry it did not work out.',
          '',
          'Our refund and exchange policy: {refundPolicy}.',
          '',
          'Once you let us know whether you would like a refund or an exchange, we will take care of the next steps.'
        ])
      },
      {
        code: 'C4', name: '포장·품질 불량', mode: '담당자 필수', owner: '품질 담당', dueHours: 24, tag: '포장', ownerRequired: true,
        keywords: ['damaged', 'leaking', 'leak', 'broken', 'expired', 'mold', 'moldy', 'defective', 'wrong item', 'missing item', 'melted', 'loose cap', 'cap was loose', 'spilled', 'cracked bottle',
          'only got', 'only received', 'instead of', 'short shipped', 'missing'],   // 2026-10-26 수량 부족
        keywordsKo: ['파손', '불량', '유통기한 지', '유통기한이 지', '기한 지난', '상했', '곰팡이', '누락', '개만 왔', '덜 왔'],
        template: t([
          'Hi {name},',
          '',
          'We are sorry your order {orderNo} arrived in this condition. Could you send us a photo of the package and the lot number printed on it? This helps our quality team look into what happened.',
          '',
          'Please do not use any item that is damaged or leaking. Once we receive the photo, we will arrange a replacement or refund under our policy: {refundPolicy}.'
        ])
      },
      {
        code: 'C5', name: '배송', mode: '자동 초안', owner: 'CS 담당', dueHours: 24, tag: '배송', ownerRequired: false,
        keywords: ['shipping', 'ship', 'shipped', 'delivery', 'deliver', 'delivered', 'tracking', 'where is my order',
          "haven't received", 'not received', 'arrive', 'arrived', 'late', 'delay', 'delayed', 'still waiting', 'order status'],   // 2026-10-26 지연
        keywordsKo: ['배송', '택배', '도착', '안 와', '안 왔', '늦어'],
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
        code: 'C6', name: '제품 정보 (맛·성분·알레르기)', mode: '자동 초안', owner: 'CS 담당', dueHours: 24, tag: '맛', ownerRequired: false,
        keywords: ['flavor', 'flavour', 'taste', 'ingredient', 'allergen', 'allergy', 'allergic', 'nuts', 'gluten', 'vegan', 'sugar', 'calories', 'calorie', 'caffeine',
          'expiration', 'expiration date', 'shelf life', 'best by', 'made in', 'where is it made', 'halal', 'kosher', 'sweetener', 'soy', 'peanut'],   // 2026-10-26
        keywordsKo: ['맛', '성분', '알레르기', '알러지', '칼로리', '열량', '유통기한', '원산지', '감미료'],
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
        code: 'C7', name: '가격·프로모션', mode: '자동 초안', owner: 'CS 담당', dueHours: 24, tag: '가격', ownerRequired: false,
        keywords: ['price', 'pricing', 'discount', 'coupon', 'promo', 'promotion', 'sale', 'code', 'deal'],
        keywordsKo: ['가격', '할인', '쿠폰', '프로모션'],
        template: t([
          'Hi {name},',
          '',
          'Thanks for asking! Current pricing and promotions: {pricing}.',
          '',
          'Promotions can change, so the price shown at checkout is the final price.'
        ])
      },
      {
        code: 'C8', name: '리뷰·평점 (불만)', mode: '담당자 필수', owner: 'CS 리드', dueHours: 24, tag: '불만', ownerRequired: true,
        keywords: ['1-star', 'one star', 'terrible', 'worst', 'awful', 'disappointed', 'waste of money', 'scam', 'rip-off',
          'leave a review', 'leaving a review', 'write a review', 'for a review', 'for leaving', 'in exchange for a review'],   // 2026-10-26 리뷰 보상 요구
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
        code: 'C9', name: 'B2B·대량 구매', mode: '영업 전달', owner: '해외영업 {확인 필요}', dueHours: 48, tag: '—', ownerRequired: false,
        keywords: ['wholesale', 'bulk', 'distributor', 'distribution', 'B2B', 'MOQ', 'retail partner', 'reseller', 'carry your'],
        keywordsKo: ['도매', '대량', '유통사', '유통업체', '유통 계약', '유통 채널', '입점'],   // 2026-10-26 '유통' 단독은 '유통기한'과 겹침
        template: t([
          'Hi {name},',
          '',
          'Thank you for your interest in carrying {brand}. We have passed your message to our business team, and they will contact you within {salesDue} with wholesale details.'
        ])
      },
      {
        code: 'C10', name: '기타·협업 제안', mode: '다른 탭 전달', owner: '인플루언서·파트너 (혁주)', dueHours: 72, tag: '—', ownerRequired: false,
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

    // ② CS 검토 확인 항목 (문의 유형별 · 모두 체크해야 CS 검토 승인 · 2026-10-26 메일함 구조)
    // ① 문구 검토(표현·빈칸)는 자동 심의가 보고, 여기는 사람이 보는 내용·정책·말투
    csChecks: {
      common: ['분류가 맞다', '말투가 브랜드 톤이다 (페르소나)'],
      C1: ['부작용 접수 기록을 남겼다', '품질·규제 담당에게 알렸다', '증상·제품에 대한 판단을 답장에 쓰지 않았다'],
      C2: ['의료 조언으로 읽히지 않는다 (의사·약사 상담 안내)', '성분·용량은 라벨 기준이다'],
      C3: ['주문번호 상태를 확인했다', '환불·교환 정책과 맞다'],
      C4: ['사진·로트 번호를 요청하거나 확인했다', '품질 담당 회신 기한과 맞다'],
      C5: ['운송사 조회 결과와 맞다'],
      C6: ['제품표·팩트시트와 맞다'],
      C7: ['현재 가격·프로모션과 맞다'],
      C8: ['리뷰 삭제·수정을 요청하지 않았다', '보상과 후기를 엮지 않았다'],
      C9: ['영업 담당에게 넘겼다'],
      C10: ['담당 탭(파트너 등)에 넘겼다']
    },

    adverse: {
      required: ['customer', 'contact', 'product', 'lot', 'symptoms'],
      careOptions: ['없음', '외래', '응급진료', '입원', '모름'],
      outcomeOptions: ['회복', '진행 중', '모름', '의료 처치 필요했음', '입원', '생명 위협', '장애', '사망'],
      seriousOutcomes: ['의료 처치 필요했음', '입원', '생명 위협', '장애', '사망'],
      // 식품 자체의 위해 가능성 (2026-10-24 · GPT 검토 ⑤): FDA RFR은 실제 피해가 없어도 '심각한 위해의 합리적 가능성'이면 보고 대상일 수 있음
      // → 증상이 가벼워도 아래 중 하나면 '심각'(보고 대상 판단 필요)으로 올려 규제 담당이 봄
      hazardOptions: ['없음', '모름', '표시 안 된 알레르기 성분 의심', '이물·오염 의심', '같은 로트 반복 신고', '포장 손상·변질 의심'],
      noHazard: ['없음', '모름'],
      urgentReviewHours: 1,   // 팀 내부 기준 (C1 응답 기한)
      rfrHours: 24            // 보고 대상으로 판단한 시점부터
    },

    // 답변 기본값 (팀 공용 · '답변 템플릿 → 답변 기본값'에서 입력 → 저장소 reboot:cs:reply-defaults)
    // 템플릿의 {키} 빈칸을 채움. 우선순위: 여기 값 → 설정 파트 팩트시트 → 제품표(products). 비어 있으면 [확인 필요]로 남아 승인 막힘
    // 값은 고객에게 가는 영어 문장/단어로 씁니다. 팀이 정하지 않은 값은 비워 두세요.
    replyDefaults: [
      { key: 'refundPolicy', label: '환불·교환 정책', where: 'C3 환불·교환 · C4 포장·품질 불량', placeholder: 'e.g. Unopened boxes can be returned within 30 days of delivery for a full refund.', long: true },
      { key: 'qualityDue', label: '품질팀 회신 기한', where: 'C1 부작용 신고', placeholder: 'e.g. 2 business days' },
      { key: 'salesDue', label: '영업(B2B) 회신 기한', where: 'C9 B2B·대량 구매', placeholder: 'e.g. 3 business days' },
      { key: 'pricing', label: '현재 가격·프로모션', where: 'C7 가격·프로모션', placeholder: 'e.g. Reboot Jelly Original is $16 per pack. There is no promotion running right now.', long: true },
      { key: 'flavor', label: '맛 (4종 공통)', where: 'C6 제품 정보', placeholder: 'e.g. lime, cherry and lemon' },
      { key: 'ingredients', label: '성분 (4종 공통일 때만 · 제품을 모르는 문의에는 쓰지 않음)', where: 'C2 건강·복용 · C6 제품 정보', placeholder: 'e.g. the full ingredient list printed on the package', long: true },
      { key: 'allergens', label: '알레르기 성분 (4종 공통일 때만 · 제품을 모르는 문의에는 쓰지 않음)', where: 'C2 건강·복용 · C6 제품 정보', placeholder: 'e.g. Please see the allergen statement on the package.' }
    ],

    // 시연·테스트용 가짜 문의. 이름은 지어낸 흔한 미국식 이름이고 주소는 예시용 도메인(example.com)이라 실제 고객 정보가 아닙니다.
    // legacy: 예전 id(TEST-NN) — 이미 저장된 더미 문의를 새 이름으로 바꿀 때 씀 (cs.js load). expect는 분류 테스트용.
    dummyInquiries: [
      { id: 'CS-24101', legacy: 'TEST-01', expect: 'C1', hoursAgo: 0.4, name: 'Lauren Mitchell', from: 'lauren.mitchell@example.com', orderNo: 'RB-241001',
        subject: 'Itchy spots after the jelly', body: 'I had one jelly last night and this morning I have red, itchy spots on my arms. Is this an allergic reaction?' },
      { id: 'CS-24102', legacy: 'TEST-02', expect: 'C1', hoursAgo: 2, name: 'Kevin Park', from: 'kevin.park@example.com', orderNo: 'RB-241002',
        subject: 'Went to the ER', body: 'My partner felt dizzy and threw up after having two jellies, so we went to the emergency room. What is in this product?' },
      { id: 'CS-24103', legacy: 'TEST-03', expect: 'C2', hoursAgo: 3, name: 'Megan Foster', from: 'megan.foster@example.com', orderNo: '',
        subject: 'Question before buying', body: "I'm 5 months pregnant. Is it okay to have these?" },
      { id: 'CS-24104', legacy: 'TEST-04', expect: 'C3', hoursAgo: 20, name: 'Tyler Brooks', from: 'tyler.brooks@example.com', orderNo: 'RB-241004',
        subject: 'Refund request', body: "I'd like to send back my unopened box and get a refund." },
      { id: 'CS-24105', legacy: 'TEST-05', expect: 'C4', hoursAgo: 30, name: 'Rachel Simmons', from: 'rachel.simmons@example.com', orderNo: 'RB-241005',
        subject: 'Box arrived leaking', body: 'Two of the bottles were leaking and the box was damaged.' },
      { id: 'CS-24106', legacy: 'TEST-06', expect: 'C5', hoursAgo: 5, name: 'Brandon Hughes', from: 'brandon.hughes@example.com', orderNo: 'RB-241006',
        tracking: 'RBX-48210-US', eta: 'Oct 27',
        subject: 'Where is my order?', body: "I ordered last week and still haven't received it." },
      { id: 'CS-24107', legacy: 'TEST-07', expect: 'C6', hoursAgo: 8, name: 'Natalie Rivera', from: 'natalie.rivera@example.com', orderNo: '',
        subject: 'Flavor and allergens', body: 'What flavor is it, and does it contain nuts or gluten?' },
      { id: 'CS-24108', legacy: 'TEST-08', expect: 'C7', hoursAgo: 12, name: 'Jordan Bennett', from: 'jordan.bennett@example.com', orderNo: '',
        subject: 'First order', body: 'Is there a discount for first orders? My code did not go through.' },
      { id: 'CS-24109', legacy: 'TEST-09', expect: 'C8', hoursAgo: 26, name: 'Samantha Price', from: 'samantha.price@example.com', orderNo: 'RB-241009',
        subject: 'Not happy', body: 'Tastes terrible. Worst purchase this month.' },
      { id: 'CS-24110', legacy: 'TEST-10', expect: 'C9', hoursAgo: 6, name: 'Daniel Cho', from: 'daniel.cho@example.com', orderNo: '',
        subject: 'Wholesale inquiry', body: 'We run a few convenience stores in LA and are interested in wholesale pricing and your MOQ.' },
      { id: 'CS-24111', legacy: 'TEST-11', expect: 'C10', hoursAgo: 40, name: 'Ashley Morgan', from: 'ashley.morgan@example.com', orderNo: '',
        subject: 'Hello from a creator', body: "I'm a creator with 80k followers and would love to collaborate." },
      { id: 'CS-24112', legacy: 'TEST-12', expect: 'C10', hoursAgo: 1, name: 'Ethan Collins', from: 'ethan.collins@example.com', orderNo: '',
        subject: 'Question', body: 'Hi, I have a quick question about your company. Who should I contact?' }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
