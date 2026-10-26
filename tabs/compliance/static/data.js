/* 컴플라이언스 데이터: 규칙 R1~R12, 채널, 검증용 문구, 한국→미국 표현 매핑.
   규칙을 바꾸면 화면의 '규칙·검증' 탭 또는 `node dev/test_parts.js`로 다시 확인합니다.
   근거 구분(basis)과 근거 조문(law)은 FDA·FTC 공식 문서 기준으로 정리 (2026-10-24). 법률 자문이 아니며 조문 원문으로 확인합니다. */
(function (global) {
  'use strict';
  const NS = global.REBOOT_DATA = global.REBOOT_DATA || {};

  NS.compliance = {
    version: '2026-10-24',   // 규칙 버전 — 규칙을 바꾸면 날짜를 바꿈 (점검 기록에 같이 저장)

    // 단건·일괄 심의에서 고르는 채널 (2026-10-24): CS 답변은 CS 파트가 'cs'로 자동 재점검하고, 아마존은 B2C와 판정이 같아 합침.
    // amazon·cs 키는 그대로 둠 (콘텐츠 파트가 'amazon', CS 파트가 'cs'로 부름 · 옛 점검 기록 이름 표시)
    pickChannels: ['b2c', 'b2b'],

    channels: {
      b2c: 'B2C 광고·SNS·아마존·올리브영 (Meta·Google·TikTok·Amazon·Olive Young US 공통 기준)',
      amazon: '아마존 상세페이지',
      cs: 'CS 답변',
      b2b: 'B2B 바이어 자료'
    },

    // terms: 영어 표현 (대소문자·하이픈·띄어쓰기·복수형 차이를 함께 잡음)
    // ko: 한국어 표현 (포함 여부로 판정)
    // basis: official 공식 근거 · platform 광고 플랫폼 정책(Meta·Google 등) · internal 내부 정책 · context 문맥 검토
    // legal: 법적 신호 (2026-10-25 · 판정과 별도) red 법 위반 — 근거 자료가 있어도 못 씀 · yellow 법무 확인 — 근거·조건·문맥에 따라 쓸 수 있음 · green 팀·플랫폼 기준 — 법 위반은 아님
    //   legalNote 왜 그 신호인지 · legalByProduct 제품별 신호 · compensatedLegal 좋은 후기 조건 보상일 때 신호
    // law: 근거 조문 { agency, cite, note } — 화면 규칙 표 '근거 조문' 칸과 자세히 창에 표시
    // patterns: 단어 목록(terms)으로 못 잡는 문장 모양 (정규식 · 대소문자 무시)
    rules: [
      {
        code: 'R1', name: '질병·치료 클레임', verdict: 'BLOCK', basis: ['official', 'context'],
        legal: 'red', legalNote: '일반식품에 질병 예방·치료 주장 = 미승인 의약품 (FD&C §201(g)). 근거 자료가 있어도 식품 광고에는 쓸 수 없음',
        terms: ['cure', 'prevent', 'prevention', 'relief', 'relieve', 'remedy', 'detox', 'detoxify', 'toxin', 'heal',
          'alcohol withdrawal', 'withdrawal syndrome', 'intoxication', "alcohol's negative effects", 'negative effects of alcohol',
          'inflammation', 'anti-inflammatory'],   // 2026-10-25 경쟁 구미(건강기능식품) 효능 문구에서 놓친 것
        ko: ['치료', '예방', '완화', '해독', '금단', '염증'],
        // 2026-10-24 (GPT 검토 ⑦): 금지 단어 없이 증상·혈중 알코올을 없앤다는 문장 · 술 깨게 한다는 문장
        patterns: [
          "\\b(?:eliminat|reduc|stop|eas|eras|banish|fight|beat|cure|treat|lower|decreas|block|neutraliz)\\w*\\s+(?:the\\s+|your\\s+)?(?:morning\\s+|next[\\s-]*day\\s+)?(?:nause?a|nausia|headaches?|vomiting|dizziness|bloating|blood[\\s-]*alcohol|BAC|alcohol\\s+absorption|alcohol\\s+levels?|acetaldehyde|toxins?)\\b",
          "\\bsobers?\\s+(?:you\\s+)?up\\b",
          // 2026-10-25 브랜드 가이드 v1.1 '피할 표현': 많이 마셔도 해결해 준다 = 음주 뒤 증상을 책임진다는 암시
          "\\b(?:drink\\w*\\s+as\\s+much\\s+as\\s+you\\s+(?:want|like)|no\\s+matter\\s+how\\s+much\\s+you\\s+drink|however\\s+much\\s+you\\s+drink)[^.!?]{0,60}\\b(?:covered|got\\s+(?:you|your\\s+back)|fine|okay|solved?|fix\\w*|handle\\w*|take\\s+care)",
          "(?:많이|얼마나|실컷|마음껏)\\s*마셔도[^.!?]{0,30}(?:해결|책임|걱정\\s*없|괜찮|끄떡없)",
          // 2026-10-25 원료 문구: '술 마신 뒤 도와준다' · 'after-party care' = 음주 뒤 상태를 고친다는 암시
          "\\b(?:help|helps|helping|support|supports|aid|aids|care|ease|eases)\\b[^.!?]{0,30}\\b(?:after|following)\\s+(?:drinking|a\\s+night\\s+out|a\\s+big\\s+night|alcohol|a\\s+party|partying)\\b",
          "\\bafter[\\s-]*(?:party|drinking)\\s+care\\b",
          "(?:음주|술자리|술\\s*마신)\\s*(?:후|뒤|다음)[^.!?]{0,15}(?:케어|관리|도움|챙겨)"
        ],
        // 질병 예방이 아닌 '보관·안전' 문맥의 prevent는 R1에서 뺌 (GPT 검토 ⑧)
        allow: ["\\bprevent(?:s|ed|ing)?\\s+(?:spoilage|melting|leaks?|leaking|freezing|sticking|clumping|damage|mold|contamination|choking)\\b"],
        reason: '질병을 예방·치료·완화한다는 표현은 일반식품을 미승인 의약품처럼 보이게 함 (2020 숙취 제품 경고장). 알코올 금단·취기·음주의 해로운 영향을 줄인다는 말, 메스꺼움·두통·혈중 알코올을 없앤다는 말도 같음. detox·relief는 문맥 검토',
        alt: '섭취 시점·맛·포맷 등 사실 묘사',
        law: [
          { agency: 'FDA', cite: 'FD&C Act §201(g)(1)(B) · 21 U.S.C. 321(g)(1)(B)', note: '질병의 진단·치료·완화·예방에 쓰려는 제품은 의약품' },
          { agency: 'FDA', cite: '숙취 제품 경고장 7통 (2020-07-23 발행 · 07-29 공개)', note: '숙취를 치료·완화·예방한다는 제품을 미승인 신약으로 판단' }
        ]
      },
      {
        code: 'R2', name: "'hangover' 직접 언급", verdict: 'BLOCK', basis: ['official', 'internal'],
        legal: 'red', legalNote: "숙취 제품 광고에 'hangover'를 쓰면 숙취 예방·완화 용도로 읽힘 (2020 경고장 · 21 CFR 201.128 의도된 용도) → 법무 검토로도 풀기 어려움",
        terms: ['hangover', 'hang-over', 'morning after', 'hungover'],
        ko: ['숙취'],
        reason: "FDA 경고장은 숙취 예방·완화 주장을 의약품 표현으로 봄. 단순 언급까지 막는 것은 팀 기준. 'the morning after'는 미국에서 숙취를 뜻하는 관용 표현(피임약 'morning-after pill'도 연상)이라 같이 막음",
        alt: '한 단어 대안: After-Party · Reset · Refresh · Restart · Afterglow (Recovery·Revive·Bounce-back·Rehydrate는 회복 효과를 암시해 피함)',
        law: [
          { agency: 'FDA', cite: '숙취 제품 경고장 7통 (2020-07-23)', note: 'hangover 예방·완화 주장 = 의약품 주장 (공식)' },
          { agency: '팀', cite: '내부 기준', note: "주장 없이 'hangover'만 써도 막는 것은 팀 기준 (법 조항 아님)" }
        ]
      },
      {
        code: 'R3', name: '안전성 보장·간 보호', verdict: 'BLOCK', basis: ['official', 'context'],
        legal: 'red', legalNote: "간 손상 예방 = 질병 예방 주장 (FD&C §201(g)) · '부작용 없음·100% 안전'은 실증할 수 없는 보장",
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
        legal: 'red', legalNote: '홍조·ALDH2를 줄인다는 주장 = 체질·질환 완화(의약품 표현) · 인종 체질 암시는 Meta 정책 위반',
        terms: ['asian glow', 'alcohol flush', 'drinking flush', 'face flush', 'flush reaction', 'flushing', 'ALDH2', 'red face'],
        ko: ['홍조', '얼굴 빨개'],
        patterns: ["\\b(?:alcohol|drinking)\\W{1,3}flush"],   // 'Alcohol "Flush"'처럼 따옴표가 끼어도 (2026-10-25)
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
        legal: 'yellow', legalNote: '사람 대상 시험 같은 과학적 근거가 있으면 쓸 수 있음 (FTC 실증) → 근거 자료와 함께 법무 확인',
        terms: ['guarantee', 'clinically proven', 'proven to', '100%', 'works every time', 'instant results', 'miracle',
          'No.1', 'No. 1', '#1', 'number one',   // 최상급 표현도 근거 필요 (2026-10-25)
          'works fast', 'fast-acting', 'acts fast', 'works quickly'],
        ko: ['효과 보장', '확실한 효과', '기적', '1위', '넘버원', '빠른 효과', '즉효'],
        reason: '효과 보장·과장은 FTC가 과학적 근거를 요구. 100% juice처럼 효과 주장이 아니면 문맥 검토',
        alt: '용량·포장·맛 같은 검증 가능한 사실',
        law: [
          { agency: 'FTC', cite: 'FTC Act §5 · §12 (15 U.S.C. 45, 52)', note: '식품 광고의 거짓·기만 금지' },
          { agency: 'FTC', cite: 'Health Products Compliance Guidance (2022-12)', note: '건강 효과 주장은 광고 전에 과학적 근거 필요 · 기본은 사람 대상 무작위 대조 시험' }
        ]
      },
      {
        code: 'R6', name: '음주 조장', verdict: 'REVISE', basis: ['platform', 'internal'],
        legal: 'green', legalNote: '식품 광고의 음주 조장을 직접 금지하는 FDA·FTC 조항은 없음 → 플랫폼 정책·팀 기준 (법무 검토 불필요 · 광고 거절 위험)',
        terms: ['drink all night', 'party harder', 'drink more', 'keep drinking', 'drink without worry', 'outdrink',
          'as much as you want', 'no matter how much you drink'],
        ko: ['더 마셔', '밤새 마셔', '마음껏 마셔', '많이 마셔도', '실컷 마셔'],
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
        legal: 'yellow', legalNote: "약처럼 보이는 표현은 '의도된 용도'를 판단하는 요소 → 문맥에 따라 갈리므로 법무 확인",
        terms: ['hangover pill', 'pill', 'tablet', 'capsule', 'doctor-formulated', 'pharmacist-formulated', "nature's aspirin", 'aspirin', 'medicine', 'prescription',
          'trusted by pharmacists', 'pharmacist recommended', 'recommended by pharmacists'],   // 약사 권위 (2026-10-25 · 테스트 문구에서 PASS였음)
        ko: ['숙취약', '의약품', '알약', '처방'],
        // 약이 '아니라'고 밝히는 문장은 R7에서 뺌 (2026-10-25 · CS 답장 "Reboot is a food, not a medicine."이 REVISE였음)
        allow: ["\\bnot\\s+(?:a\\s+)?medicine\\b", "의약품이\\s*아(?:니|닙)"],
        reason: '약처럼 보이는 명칭·표현은 제품의 의도된 용도를 판단하는 요소가 될 수 있음',
        alt: 'jelly, drink 등 식품 포맷 명칭',
        law: [
          { agency: 'FDA', cite: '21 CFR 201.128 (의도된 용도)', note: '라벨·광고·판매자 발언으로 의도된 용도를 판단 · 단어 하나로 확정하지 않음 (문맥)' }
        ]
      },
      {
        code: 'R8', name: '구조·기능 클레임', verdict: 'REVISE', basis: ['official', 'internal'],
        legal: 'yellow', legalNote: '영양적 가치에서 나온 구조·기능 표현은 일반식품도 가능 → 영양 근거 자료와 함께 법무 확인',
        terms: ['supports liver health', 'liver health', 'liver function', 'alcohol metabolism', 'metabolize alcohol', 'metabolizes alcohol',
          'process alcohol', 'processes alcohol', 'break down alcohol', 'breaks down alcohol', 'supports healthy', 'boosts immunity',
          'these statements have not been evaluated by the food and drug administration',
          // 2026-10-25 브랜드 가이드 v1.1: 피로·회복·몸 상태 리셋 · 장 건강 (리셋·리부트는 태도의 은유로만)
          'fatigue', 'recovery', 'recover', 'recharge your body', 'recharge your energy', 'restore your energy', 'boost your energy',
          'gut health', 'digestive health',
          // 2026-10-25 경쟁 구미 효능 문구: 아세트알데히드 처리 · GABA · 붓기 · 술 마시기 전용
          'acetaldehyde', 'GABA', 'brain fog', 'bloating', 'pre-alcohol', 'pre-drinking', 'pre-drink',
          'liver support', 'liver care', 'support your liver', 'supports your liver', 'support the liver', 'supports the liver',
          'liver'],   // 검토 반영 (2026-10-25): 'Good for your liver' · 'keeps your liver happy'처럼 일반어로 간을 말해도 구조·기능 암시
        ko: ['간 건강', '간 기능', '알코올 대사', '알코올 분해', '알코올을 분해', '면역력 강화',
          '피로', '회복', '컨디션 리셋', '컨디션 완벽', '몸을 리셋', '몸 리셋', '장 건강', '원기',
          '간에 좋', '간을 위한', '간 케어', '음주 전', '음주 후', '음주 전후', '술 마시기 전', '술 마신 후', '술 마신 뒤'],
        patterns: ["\\breset\\w*\\s+(?:your\\s+|the\\s+)?(?:body|system|liver|stomach|gut|condition)\\b", "\\b(?:condition|body|system)\\s+reset\\b",
          // 2026-10-25: '다음 날 가뿐' 류 = 몸 상태가 좋아진다는 암시 (음주와 직접 이어지면 R1)
          "\\b(?:feel|feels|felt|feeling|wake\\s+up|woke\\s+up|waking\\s+up)\\s+(?:feeling\\s+)?(?:fresh|great|fine|good|clear[\\s-]*headed|light)\\s+(?:the\\s+)?next\\s+(?:day|morning)\\b",
          "\\b(?:wake|waking|woke)\\s+up\\s+(?:feeling\\s+)?(?:fresh|clear[\\s-]*headed|good\\s+as\\s+new)\\b",
          // 'Wake up to a fresh, clear morning tomorrow' (2026-10-25 · 담당 시험 문장이 PASS였음)
          "\\b(?:wake|waking|woke)\\s+up\\s+to\\s+(?:a\\s+|an\\s+)?(?:fresh|clear|bright|better|easy)[^.!?]{0,25}\\bmorning\\b",
          "\\b(?:fresh|clear)[^.!?]{0,15}\\bmorning\\s+(?:tomorrow|after)\\b",
          // 검토 반영 (2026-10-25): 음주 전후에 먹으라는 시점 안내 = 숙취 대비 용도 암시 ('Take before drinking' · 'after drinking')
          "\\b(?:before|after|following|while)\\s+(?:drinking|you\\s+drink|alcohol)\\b",
          "다음\\s*날[^.!?]{0,15}(?:가뿐|개운|상쾌|멀쩡|거뜬|쌩쌩)", "(?:가뿐|개운|멀쩡|거뜬|쌩쌩)한\\s*(?:다음\\s*날|아침)"],
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
        legal: 'yellow', legalNote: '말한 수준의 시험 근거가 있으면 가능 (FTC) → 시험 보고서와 함께 법무 확인 · B2C에서 삭제하는 것은 팀 기준',
        terms: ['clinically tested', 'clinically studied', 'clinically shown', 'clinical study', 'clinical studies', 'clinical trial', 'human study', 'human trial', 'research shows', 'studies show',
          'science-backed', 'backed by science', 'scientifically formulated', 'scientifically proven'],
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
        code: 'R10', name: '후기·리뷰', verdict: 'REVIEW', basis: ['official', 'platform', 'internal'],
        legal: 'yellow', legalNote: '대가 관계 표시 등 조건을 지키면 후기를 쓸 수 있음 → 법무 확인 · 좋은 후기를 조건으로 한 보상은 16 CFR 465 위반(법 위반 신호)', compensatedLegal: 'red',
        terms: ['testimonial', '5-star', 'five-star', 'customer review', 'rated #1', 'top-rated'],
        ko: ['후기', '리뷰', '별점'],
        // 1인칭 사용 경험 문장 = 후기 (경고장은 후기 문구도 의도된 용도의 증거로 인용)
        patterns: ["(?:^|[.!?]\\s+)(?:\\. \\. \\. )?[\"“]?(?:I|I'm|I’m|I've|I’ve|My)\\b[^.!?]{0,80}\\b(?:tried|try|take|took|taking|used|use|felt|feel|woke)\\b"],
        reason: '후기도 R1~R7로 심의하고 대가 관계를 표시 (FTC 추천·후기 지침). 1인칭 사용 경험 문장도 후기로 봄',
        alt: '후기도 R1~R7로 심의, 대가 관계 표시',
        law: [
          { agency: 'FTC', cite: 'Endorsement Guides · 16 CFR Part 255 (2023 개정)', note: '대가 관계 표시 · 후기도 광고주 주장으로 봄' },
          { agency: 'FTC', cite: 'Consumer Reviews and Testimonials Rule · 16 CFR Part 465 (2024-10-21 시행)', note: '가짜 후기 금지 · 긍정(또는 부정) 등 특정 내용의 후기를 조건으로 한 보상 금지 → BLOCK' },
          { agency: 'FDA', cite: '21 CFR 201.128', note: '경고장은 후기 문구도 의도된 용도의 증거로 인용' },
          { agency: 'Amazon', cite: 'Amazon 고객 리뷰 정책 (Community Guidelines)', note: '판매자가 대가를 주고 리뷰를 받는 것 금지 (Vine 등 공식 프로그램 제외)' },
          { agency: '팀', cite: '내부 기준', note: '조건 없는 후기 보상은 법으로 일괄 금지는 아님 → 대가 표시 + 플랫폼 정책 때문에 REVISE (2026-10-24 · GPT 검토 ㉔로 BLOCK과 나눔)' }
        ],
        // 좋은 후기(별점 5점 등)를 조건으로 한 보상 → BLOCK (법)
        compensated: [
          '(free|discount|coupon|gift|refund|cash|reward|credit|points|% off|off your)[^.!?]{0,60}(5[\\s-]*star|five[\\s-]*star|positive review|good review|great review)',
          '(5[\\s-]*star|five[\\s-]*star|positive review|good review|great review)[^.!?]{0,60}(free|discount|coupon|gift|refund|cash|reward|credit|points|% off|off your)',
          'in exchange for (a |an |your )?(positive |good |great |5[\\s-]*star |five[\\s-]*star )review',
          '(별점 ?5|5점|좋은 (리뷰|후기)|긍정)[^.!?]{0,20}(쿠폰|적립|증정|할인|환불)',
          '(쿠폰|적립|증정|할인|환불)[^.!?]{0,20}(별점 ?5|5점|좋은 (리뷰|후기)|긍정)'
        ],
        compensatedReason: '좋은 후기(별점 5점 등)를 조건으로 한 보상은 FTC 소비자 리뷰 규칙(16 CFR Part 465) 위반',
        // 조건 없는 후기 보상 (솔직한 후기면 무엇이든) → REVISE (대가 표시 · 플랫폼 정책 · 팀 기준)
        incentive: [
          '(free|discount|coupon|gift|refund|cash|reward|credit|points|% off)[^.!?]{0,40}(review|rating)',
          '(review|rating)[^.!?]{0,40}(free|discount|coupon|gift|refund|cash|reward|credit|points|% off)',
          'in exchange for (a |an |your )?(honest )?review',
          '(리뷰|후기)[^.!?]{0,20}(쿠폰|적립|증정|할인|환불)',
          '(쿠폰|적립|증정|할인|환불)[^.!?]{0,20}(리뷰|후기)'
        ],
        incentiveVerdict: 'REVISE',
        incentiveReason: '조건 없는 후기 보상은 법으로 일괄 금지는 아니지만 대가 관계를 분명히 표시해야 함 (FTC 추천·후기 지침). Amazon 등 플랫폼은 보상 후기를 금지 → 팀 기준상 수정',
        // 보상을 '주지 않는다'는 부정문은 R10에서 뺌 (GPT 검토 ⑧)
        allow: [
          "\\b(?:do|does|did|will|would|can)(?:n['’]t|\\s+not)\\s+(?:offer|give|provide|pay|send)[^.!?]{0,60}reviews?",
          "\\bnever\\s+(?:offer|give|provide|pay|send)[^.!?]{0,60}reviews?",
          '(리뷰|후기)[^.!?]{0,20}(쿠폰|적립|증정|할인|환불)[^.!?]{0,15}(않|없|안 )'
        ]
      },
      // R11·R12: 당류 표시 규칙. 2026-10-23에는 제품 사실이 정해지지 않아 꺼 두었다가(off),
      // 2026-10-25 브랜드 가이드 v1.1(Balance만 'Zero Sugar' · 조건부 · '저당'과 섞지 않음)이 나와 다시 켬 (담당 결정)
      {
        code: 'R11', name: "가이드에 없는 당 표시 ('low sugar'·저당·reduced sugar)", verdict: 'BLOCK', basis: ['official', 'internal'],
        legal: 'red', legalNote: "'low sugar'는 FDA 정의가 없는 표시이고 reduced·no added sugar는 비교·조건이 필요 (21 CFR 101.60(c)) · 가이드상 쓰지 않는 표현",
        terms: ['low sugar', 'low in sugar', 'lite sugar', 'light in sugar', 'reduced sugar', 'less sugar', 'lower sugar', 'sugar-reduced',
          'no added sugar', 'no sugar added', 'without added sugar'],
        ko: ['저당', '당이 낮은', '당 함량이 낮은', '당류 저감', '당을 줄인', '당 줄인', '설탕 무첨가', '무가당'],
        reason: "미국 FDA는 'low sugar'를 정의하지 않아 쓸 수 없고, reduced·less sugar는 기준 제품보다 25% 이상 적다는 비교·수치가, no added sugar는 별도 조건이 필요함 (21 CFR 101.60(c)). 브랜드 가이드 v1.1은 Balance에 'Zero Sugar'만 쓰고 '저당'과 섞어 쓰지 않음 → 이 표현들은 사용 불가",
        alt: 'Balance 제품이면 "Zero Sugar"만 (조건부 · R12) · Original은 당 표현 없이 맛·포장 사실',
        law: [
          { agency: 'FDA', cite: '21 CFR 101.60(c)', note: "'low sugar'는 정의된 표시가 아님 · reduced/less sugar 25% 이상 저감 + 비교 대상 표시 · no added sugar 조건" },
          { agency: '팀', cite: '브랜드 가이드 v1.1 9장·13장', note: "'저당'과 '제로슈가'를 섞어 쓰지 않음 · ZERO SUGAR는 Balance 두 제품만" }
        ]
      },
      {
        code: 'R12', name: "'Zero Sugar' 표시 (Balance만)", verdict: 'COND', basis: ['official', 'internal'],
        legal: 'yellow', legalNote: 'Balance는 당 0.5 g 미만 + 저칼로리가 아니면 그 사실 표시 조건으로 가능 → 영양성분 시험 확인 · 당이 있는 Original·브랜드 전체에 쓰면 거짓 표시(법 위반 신호)', legalByProduct: { jelly: 'red', drink: 'red' },
        terms: ['zero sugar', 'sugar free', 'no sugar', 'sugarless'],
        ko: ['제로 슈거', '제로슈거', '제로 슈가', '제로슈가', '무설탕'],
        allow: ["\\bno\\s+sugar\\s+alcohols?\\b"],   // '당알코올 없음'은 당 함량 주장이 아님
        reason: "'Zero Sugar'(= sugar free)는 1회 제공량당 당류 0.5 g 미만이어야 하고, 저칼로리가 아니면 'Not a low calorie food' 같은 문구를 함께 표시해야 함 (21 CFR 101.60(c)(1)). Balance 두 제품만 · 당류 0.5 g 미만 측정 확인 · 1회 섭취 기준량·라벨 1회 제공량 둘 다 · PM 확인 2026-10-25 → Balance는 사용 가능(PASS · 칼로리 값이 미정이라 저칼로리가 확인되기 전까지 'Not a low calorie food' 함께 표시), Original·브랜드 전체에는 사용 불가, 제품을 모르면 확인(COND). 표기는 'Zero Sugar'로 통일",
        alt: 'Balance 제품 문구에서만 "Zero Sugar" (출시 전 영양성분 시험으로 당 0.5 g 미만 확인) · 수치(당 0 g·칼로리)는 쓰지 않음',
        byProduct: { jelly: 'BLOCK', drink: 'BLOCK', 'jelly-ls': 'PASS', 'drink-ls': 'PASS' },   // 2026-10-25 담당 결정: Balance는 PASS
        law: [
          { agency: 'FDA', cite: '21 CFR 101.60(c)(1)', note: 'sugar free(= zero sugar) 1회 제공량당 0.5 g 미만 · 저칼로리 아니면 그 사실을 함께 표시' },
          { agency: '팀', cite: '브랜드 가이드 v1.1 13장 02', note: 'ZERO SUGAR는 Balance 두 제품군만 · 당류 0.5 g 미만 측정 확인 · 1회 섭취 기준량·라벨 1회 제공량 둘 다 · PM 확인 2026-10-25 (시험 성적서 보관)' }
        ]
      },
      // R13: 성분을 내세우는 표현 (2026-10-24 추가). 함량을 표시하지 않기로 했으므로 성분 강조 문구는 사람이 한 번 봄
      {
        code: 'R13', name: '성분 강조·숙취 연상 성분', verdict: 'REVIEW', basis: ['official', 'context'],
        legal: 'yellow', legalNote: "'rich in·high in'은 1일 기준치 20% 이상일 때만, 성분 강조는 함량(%) 표시 조건 (21 CFR 101.54·102.5) → 함량 자료와 함께 법무 확인",
        terms: ['packed with', 'loaded with', 'rich in', 'high in', 'excellent source of', 'full of', 'powered by', 'dihydromyricetin', 'DHM',
          // 2026-10-25 브랜드 가이드 v1.1: 공통 원료 A-HAT = 헛개 추출물 + 유산균(Lactobacillus fermentum) · 함량 미제공
          'probiotic', 'probiotics', 'lactobacillus', 'live cultures', 'A-HAT'],
        ko: ['듬뿍', '가득', '고함량', '풍부한', '유산균', '프로바이오틱'],
        reason: "성분을 내세우면 미국에서 그 성분의 함량(%) 표시를 요구받을 수 있음. 'rich in·high in'은 영양소가 1일 기준치 20% 이상일 때만 쓰는 정해진 표현이라 헛개 같은 원료에는 쓸 수 없음. DHM은 2020 숙취 경고장이 숙취 예방 성분으로 인용한 이름. 유산균(프로바이오틱)은 '장 건강' 같은 효과로 읽히기 쉽고 함량(균 수) 자료가 없음 (브랜드 가이드 v1.1: A-HAT 함량 미제공)",
        alt: '"Contains Hovenia dulcis fruit extract."처럼 들어 있다는 사실만 · 함량을 내세우려면 함량 자료와 % 표시 준비',
        law: [
          { agency: 'FDA', cite: '21 CFR 102.5(b)', note: '성분 비율이 가격·소비자 선택에 영향을 주거나 실제보다 많이 든 것처럼 보이게 하면 제품명에 그 성분의 %를 넣어야 함' },
          { agency: 'FDA', cite: '21 CFR 101.54(b)(1)', note: "'high'·'rich in'·'excellent source of'는 1회 기준량에 1일 기준치(RDI·DRV) 20% 이상일 때만" },
          { agency: 'FDA', cite: '21 CFR 101.18(b)', note: '일부 성분만 이름에 넣거나 암시하면 다른 성분을 다 적어도 오해를 줄 수 있음' },
          { agency: 'FDA', cite: '숙취 제품 경고장 (2020-07-23) · Purple Biosciences·Double Wood', note: "DHM(dihydromyricetin)을 '숙취 예방 성분'으로 광고한 문구를 인용" }
        ]
      },
      // R14: 정부 승인·인증 주장 (2026-10-24 · GPT 검토 ⑦ 'FDA approved jelly'가 PASS였음)
      {
        code: 'R14', name: '정부 승인·인증 주장', verdict: 'BLOCK', basis: ['official'],
        legal: 'red', legalNote: "FDA는 일반식품을 시판 전에 승인하지 않음 → 'FDA 승인·인증'은 사실이 아닌 표시 (FD&C §403(a)(1))",
        terms: ['FDA approved', 'FDA certified', 'FDA cleared', 'FDA endorsed', 'government approved'],
        ko: ['FDA 승인', 'FDA 인증', 'FDA 허가', 'FDA 공인'],
        patterns: ["\\b(?:approved|certified|cleared|endorsed|recommended)\\s+by\\s+(?:the\\s+)?(?:FDA|U\\.?S\\.?\\s+government|USDA|FTC)\\b"],
        reason: "FDA는 일반식품을 시판 전에 '승인'하지 않음 → 'FDA 승인·인증'은 사실이 아닌 표시. 정부가 보증한 것처럼 보이게 하는 말도 같음",
        alt: '승인 대신 확인 가능한 사실 (예: 원산지 · 포장 · 성분)',
        law: [
          { agency: 'FDA', cite: 'FD&C Act §403(a)(1) · 21 U.S.C. 343(a)(1)', note: '라벨링이 거짓이거나 오해를 주면 부정표시(misbranded) 식품' },
          { agency: 'FTC', cite: 'FTC Act §5 · §12 (15 U.S.C. 45, 52)', note: '정부 승인처럼 보이게 하는 거짓·기만 광고 금지' }
        ]
      },
      // R15: 브랜드 가이드 v1.1(2026-10) 사용 제한 — 미확정 정보·제품으로 소개하지 않는 것·행사 공식 참여 암시 (2026-10-25)
      {
        code: 'R15', name: '미확정 정보·공식 제휴 암시', verdict: 'REVIEW', basis: ['internal', 'official'],
        legal: 'yellow', legalNote: '특허·인증(organic·gluten-free)·공식 제휴·영양 수치는 사실이면 쓸 수 있음 → 증빙(특허 번호·인증서·계약서·영양성분표)과 함께 확인',
        terms: ['revolver', 'pistol', 'gun-shaped', 'official partner', 'official sponsor', 'official drink', 'official jelly', 'official snack',
          'patented', 'patent', 'Coachella',
          // 인증·시험 표시: 가이드상 인증 미정 → 사실(인증서·시험 성적)이 있을 때만 (2026-10-25)
          'gluten-free', 'gluten free', 'non-GMO', 'GMO-free', 'organic', 'all natural', '100% natural', 'lab tested', 'third-party tested', '3rd party lab tested', 'kosher', 'halal'],
        ko: ['리볼버', '권총', '공식 후원', '공식 파트너', '공식 음료', '공식 젤리', '특허', '코첼라', '글루텐 프리', '유기농', '무농약', '할랄'],
        patterns: [
          "\\b\\d+(?:\\.\\d+)?\\s*(?:kcal|calories|cals?)\\b",
          "\\b\\d+(?:\\.\\d+)?\\s*(?:g|grams?|mg)\\s+(?:of\\s+)?(?:sugars?|carbs?|carbohydrates?|protein|fat|sodium|caffeine)\\b",
          "\\b(?!10\\b)\\d+\\s+(?:jellies|pieces|pcs)\\s+(?:per|in\\s+(?:a|each|every))\\s+(?:pouch|bag)\\b",   // 봉지당 10개는 확정 (2026-10-25 제품 최종 정보)
          "\\d+(?:\\.\\d+)?\\s*(?:kcal|칼로리)", "(?:당류?|설탕)\\s*(?:약\\s*)?\\d+(?:\\.\\d+)?\\s*g"
        ],
        reason: '브랜드 가이드 v1.1 사용 제한: 참고 이미지의 영양 수치(Original 약 43 kcal · 당 약 10 g/100 ml)와 원료 함량·특허 범위는 확정되지 않았고, 리볼버 모양은 제품 구성으로 소개하지 않으며, 행사(코첼라 등) 공식 참여·제휴는 확정된 경우에만 씀 → 사람이 사실 여부 확인',
        alt: '확정된 사실만: 맛 Lime·Lemon·Cherry · 젤리 모양 카우보이 모자·올가미·부츠 · 100 ml 비탄산 음료(낱개·3병 박스) · 개별 포장 젤리 한 봉지',
        law: [
          { agency: '팀', cite: '브랜드 가이드 v1.1 (2026-10) · 13장 모든 채널에서 지킬 기준', note: '참고 이미지 영양 수치 사용 금지 · 미정 정보(입수·함량·영양·효능)를 채우지 않음 · 리볼버 모양 제외 · 행사 공식 참여처럼 표현하지 않음' },
          { agency: 'FTC', cite: 'FTC Act §5 (15 U.S.C. 45)', note: '행사 공식 후원·제휴처럼 보이게 하거나 사실과 다른 특허 주장은 기만 광고' },
          { agency: 'FDA', cite: '21 CFR 101.9 · 101.13', note: '열량·당류 등 수치는 확정 영양성분표와 같아야 하고, 광고에 쓰면 영양소 함량 표시 규칙 대상' }
        ]
      }
    ],

    // AI 2차 판정 검토자 페르소나 기본값 (2026-10-24 초안 · 담당 검토 전). 화면 '단건 심의 → AI 검토자 페르소나'에서 고치면
    // 팀 공용 저장소(reboot:compliance:persona)에 저장되고 이 기본값보다 우선합니다. 서버는 600자까지 받습니다.
    // 페르소나는 관점·말투만 바꿉니다. 규제 기준·팀 규칙·판정 단계는 서버 지시문이 항상 우선합니다 (ai_review.py).
    aiPersona: '미국 식품 광고 심의 패널. ① FDA·FTC 규제와 2020년 숙취 제품 경고장에 정통한 광고 규제 전문가 ② 숙취해소 식품의 성분·효능 표현 한계를 아는 제품 전문가 ③ 미국 20~30대 음주 문화와 SNS·아마존 반응을 아는 문화 전문가 ④ 미국 광고 카피 전문가. 미국 소비자가 읽는 뜻대로 보수적으로 판정하고, 브랜드 톤을 살린 안전한 대안을 낸다.',

    // 판매 제품 4종 (2026-10-23 팀 표 기준). 맛은 임시, 내부 제품명은 미정.
    // zeroSugar: 'Zero Sugar' 표기 제품 (Balance 2종 · 브랜드 가이드 v1.1: 조건부 — 당 표현 검토 후 출시 문구 확정) · 다른 당 표현·수치는 쓰지 않음
    // 2026-10-25 브랜드 키트 기준으로 형태·맛·구성 수정 (예전: 스틱 젤리 · 6병 · 4종 같은 맛 임시)
    brand: { name: 'REBOOT', slogan: 'Restart Your Day', character: '리부 (Rebu)', cmSong: '니온 앤 리부', colors: '검정 & 네온' },
    products: [
      // 브랜드 키트(tabs/content/data/brand_kit.json · 2026-10-24) 기준 · id는 다른 파트가 쓰므로 그대로
      { id: 'jelly', ko: 'Original 젤리', name: 'Reboot Jelly Original', form: '개별 포장 모양 젤리 (카우보이 부츠·모자·올가미)', flavors: '라임·레몬·체리', pack: '한 봉지 (10개)', zeroSugar: false },
      { id: 'jelly-ls', ko: 'Balance 젤리', name: 'Reboot Jelly Balance', form: '개별 포장 모양 젤리 (카우보이 부츠·모자·올가미)', flavors: '체리·라임·레몬', pack: '한 봉지 (10개)', zeroSugar: true },
      { id: 'drink', ko: 'Original 음료', name: 'Reboot Drink Original', form: '비탄산 음료 · 100 ml 플라스크형 유리병', flavors: '레몬·체리·라임', pack: '1병 · 3병 박스', zeroSugar: false },
      { id: 'drink-ls', ko: 'Balance 음료', name: 'Reboot Drink Balance', form: '비탄산 음료 · 100 ml 플라스크형 유리병', flavors: '레몬·라임·체리', pack: '1병 · 3병 박스', zeroSugar: true }
    ],

    // FDA 숙취 제품 경고장 원문 인용 문구 — 원문 그대로(대괄호·말줄임·굽은 따옴표 포함).
    // FDA 경고장 7통 (2020-07-23 발행 · 07-29 공개) · 87개 = FDA 광고 콘솔 seed.json 원문 (2026-10-22 수집, 2026-10-24 이관)
    // 예전 53개(시연본 DATA_CLAIMS)는 일부가 잘린 문장이라 원문 87개로 바꿈. kind: 'testimonial'은 경고장이 인용한 후기
    // ko: 뜻 확인용 한국어 번역 (2026-10-24 Claude로 한 번 만들어 저장 · 판정은 영어 원문 기준)
    // '규칙 검증'의 목표는 이 문구 중 PASS 0개 — PASS가 나오면 규칙이 놓친 표현입니다
    warningQuotes: [
      // FDA-2020-HO-01 · Double Wood LLC · Dycetin — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/double-wood-llc-593766-07232020
      { text: 'PREVENT HANGOVERS - No product is more proven or effective at preventing hangover symptoms including headaches, nausea, brain-fog, and anxiety.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '숙취 예방 - 두통, 메스꺼움, 머리가 멍한 증상(브레인 포그), 불안 등 숙취 증상 예방에 이보다 더 입증되고 효과적인 제품은 없습니다.' },
      { text: 'PROTECT YOUR LIVER AND BRAIN - Research shows Dycetin reduces alcohol induced damage to the liver and brain.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '간과 뇌를 보호하세요 - 연구에 따르면 Dycetin은 알코올로 인한 간과 뇌 손상을 줄여줍니다.' },
      { text: 'Dycetin is the most effective hangover preventing supplement currently available.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'Dycetin은 현재 시중에 나와 있는 숙취 예방 보충제 중 가장 효과적입니다.' },
      { text: 'Not only does DHM [ingredient in Dycetin] enhance enzymes in the liver responsible for breaking down alcohol and its toxic by-products, but it also reduces the effect alcohol has on GABA receptors in the brain. This keeps you feeling more sober while drinking and greatly reduces hangover symptoms the next day.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'DHM [Dycetin 성분]은 알코올과 그 독성 부산물을 분해하는 간 효소를 강화할 뿐 아니라, 알코올이 뇌의 GABA 수용체에 미치는 영향도 줄여줍니다. 그래서 술을 마시는 동안 덜 취한 느낌을 유지하고, 다음 날 숙취 증상을 크게 줄여줍니다.' },
      { text: 'Top Rated National Hangover Prevention Supplement', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '전국 최고 평점의 숙취 예방 보충제' },
      { text: 'NEVER SUFFER ANOTHER HANGOVER', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '다시는 숙취로 고생하지 마세요' },
      { text: 'Dycetin tablets protect your liver and brain from alcohol, prevent hangovers . . .', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'Dycetin 정제는 알코올로부터 간과 뇌를 보호하고, 숙취를 예방하며 . . .' },
      { text: 'ADVANCED HANGOVER PREVENTION FORMULA', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '고급 숙취 예방 포뮬러' },
      { text: 'DYCETIN is a potent hangover prevention supplement which contains both Dihydromyricetin and a blend of electrolytes. It may reduce hangover symptoms by up to 99%.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'DYCETIN은 디하이드로미리세틴(Dihydromyricetin)과 전해질 혼합물을 함께 함유한 강력한 숙취 예방 보충제입니다. 숙취 증상을 최대 99%까지 줄일 수 있습니다.' },
      { text: 'To reduce feelings of alcohol intoxication, take one tablet before you start drinking, and one additional tablet after finishing your first two drinks.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '취한 느낌을 줄이려면 술을 마시기 시작하기 전에 1정, 처음 두 잔을 마신 후에 1정을 추가로 복용하세요.' },
      { text: 'Dycetin can be used in three main ways - to prevent hangovers after a night of drinking, to reduce feelings of intoxication while drinking, or to raise the alcohol intoxication threshold so you can have a few drinks without becoming intoxicated.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'Dycetin은 크게 세 가지 방법으로 사용할 수 있습니다. 밤새 술을 마신 후 숙취를 예방하거나, 음주 중 취한 느낌을 줄이거나, 알코올에 취하는 한계치를 높여 몇 잔 마셔도 취하지 않도록 하는 것입니다.' },
      { text: 'To prevent hangovers with Dycetin, take 2 tablets at the end of the night with a large glass of water.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'Dycetin으로 숙취를 예방하려면 밤이 끝날 무렵 큰 컵의 물과 함께 2정을 복용하세요.' },
      { text: 'If you’ll be attending a social function where drinking is expected but you’d prefer not to become intoxicated, Dycetin can help. Simply take 2 tablets 30 minutes before drinking and you’ll be able to drink a 2-3 beers without noticing any intoxication.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '술을 마셔야 하는 사교 모임에 참석하지만 취하고 싶지 않다면 Dycetin이 도움이 됩니다. 음주 30분 전에 2정만 복용하면 맥주 2~3잔을 마셔도 전혀 취기를 느끼지 않을 것입니다.' },
      { text: 'Dycetin is a natural scientifically proven hangover prevention supplement that blocks the affect alcohol has on the brain and allows the liver to process alcohol more quickly. Taking Dycetin after a night on the town will allow you to wake up feeling normal rather than being stuck in bed with a crippling hangover.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'Dycetin은 과학적으로 입증된 천연 숙취 예방 보충제로, 알코올이 뇌에 미치는 영향을 차단하고 간이 알코올을 더 빨리 처리하도록 해줍니다. 밤새 놀고 난 뒤 Dycetin을 복용하면 극심한 숙취로 침대에 갇혀 있는 대신 평소처럼 개운하게 일어날 수 있습니다.' },
      { text: 'Dycetin’s main ingredient, Dihydromyricetin, is the only single ingredient scientifically proven to prevent hangovers. It does this both by blocking alcohol’s effect on the brain’s GABA receptors and by allowing the liver to clear alcohol and its toxic byproduct acetaldehyde from the body at a much faster rate than normal. Combined, these effects allow Dycetin to prevent hangovers and reduce feelings of alcohol intoxication.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: 'Dycetin의 주성분인 디하이드로미리세틴(Dihydromyricetin)은 숙취 예방 효과가 과학적으로 입증된 유일한 단일 성분입니다. 이 성분은 알코올이 뇌의 GABA 수용체에 미치는 영향을 차단하고, 간이 알코올과 그 독성 부산물인 아세트알데히드를 평소보다 훨씬 빠른 속도로 체내에서 제거하도록 함으로써 작용합니다. 이러한 효과가 합쳐져 Dycetin은 숙취를 예방하고 취한 느낌을 줄여줍니다.' },
      { text: 'To prevent a hangover, take 2 tablets of Dycetin before bed with a large glass of water.', firm: 'Double Wood LLC', issued: '2020-07-23', ko: '숙취를 예방하려면 잠자리에 들기 전 큰 컵의 물과 함께 Dycetin 2정을 복용하세요.' },
      { text: 'This stuff really works. Either before you imbibe, or after. If you have had too much to drink, it will stop the spins, and staggers, and you don\'t get a hangover the next morning. It will knock out an existing hangover as well.', firm: 'Double Wood LLC', issued: '2020-07-23', kind: 'testimonial', ko: '이거 정말 효과 있어요. 마시기 전이든 후든요. 술을 너무 많이 마셨을 때 빙빙 도는 어지러움과 비틀거림을 멈춰주고, 다음 날 아침 숙취도 없어요. 이미 생긴 숙취도 싹 날려줍니다.' },
      { text: 'I tried it before drinking once and it was like I was drinking non-alcoholic beer, I wasn\'t even phased. I take it at the end of a long night of partying on a weeknight and am up for work at 7 and even feel more tired than hungover at all. It also does well to take mid-drinking in order to keep from getting out of line.', firm: 'Double Wood LLC', issued: '2020-07-23', kind: 'testimonial', ko: '한 번은 술 마시기 전에 먹어봤는데 무알코올 맥주를 마시는 것 같았고, 전혀 끄떡없었어요. 평일 밤 늦게까지 파티한 후 마지막에 먹으면 아침 7시에 출근하려고 일어나도 숙취보다는 그냥 좀 피곤한 정도예요. 술 마시는 중간에 먹어도 선 넘지 않게 해줘서 좋아요.' },
      // FDA-2020-HO-02 · Ebnsol Inc. · PartyPal — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/ebnsol-inc-593771-07232020
      { text: 'Understanding the history of alcohol consumption led us to believe that throughout the ages different cultures have traditionally applied a variety of natural remedies for hangover relief and prevention as well as to help nullify the toll nightlife could have on the body.', firm: 'Ebnsol Inc.', issued: '2020-07-23', ko: '음주의 역사를 이해하면서, 우리는 시대를 거쳐 여러 문화권에서 전통적으로 다양한 천연 요법을 숙취 해소와 예방, 그리고 밤 문화가 몸에 끼칠 수 있는 타격을 무효화하는 데 사용해 왔다고 믿게 되었습니다.' },
      { text: 'One tested combination of ingredients in unique concentrations proved uniquely effective against hangovers: Prickly Pear Cactus, Succinic Acid, and Oriental Raisin Tree.', firm: 'Ebnsol Inc.', issued: '2020-07-23', ko: '독특한 농도로 배합해 시험한 한 성분 조합이 숙취에 유난히 뛰어난 효과를 보였습니다. 바로 백년초(Prickly Pear Cactus), 숙신산(Succinic Acid), 헛개나무(Oriental Raisin Tree)입니다.' },
      { text: 'We bring you 3ContRx [ingredient blend in PartyPal], the most effective hangover treatments from 3 different parts of the globe all combined into easy to use tablets that REALLY WORK!', firm: 'Ebnsol Inc.', issued: '2020-07-23', ko: '전 세계 3개 지역에서 온 가장 효과적인 숙취 치료법을 모두 결합해 간편하게 복용할 수 있는 정제로 만든 3ContRx [PartyPal의 성분 혼합물]를 소개합니다. 정말로 효과가 있습니다!' },
      { text: 'THE SAFER WAY TO ENJOY CACTUS – Having a hangover can really ruin your day. Nausea, dry mouth, dizziness; all of these symptoms we know all too well. However, with Prickly Pear Cactus Extract [ingredient in PartyPal], you can say goodbye to the day-after woes! By reducing inflammation associated with a hangover and increasing the ability for your cells to repair themselves after a night of drinking debauchery, you can feel better right away!', firm: 'Ebnsol Inc.', issued: '2020-07-23', ko: '선인장을 더 안전하게 즐기는 방법 – 숙취는 하루를 완전히 망칠 수 있습니다. 메스꺼움, 입마름, 어지러움 등 우리 모두 너무나 잘 아는 증상이죠. 하지만 백년초 추출물 [PartyPal의 성분]이 있다면 다음 날의 괴로움과 작별할 수 있습니다! 숙취와 관련된 염증을 줄이고, 방탕하게 술을 마신 밤 이후 세포의 자가 회복 능력을 높여 즉시 상태가 좋아지는 것을 느낄 수 있습니다!' },
      { text: 'Dihydromyricetin, or DHM [ingredient in PartyPal], is a truly scientific way to prevent the dreaded hangover.', firm: 'Ebnsol Inc.', issued: '2020-07-23', ko: '디하이드로미리세틴, 즉 DHM [PartyPal의 성분]은 끔찍한 숙취를 예방하는 진정 과학적인 방법입니다.' },
      { text: 'GUARANTEED RELIEF – We take this product ourselves, and are proud to present it to you as a true hangover cure.', firm: 'Ebnsol Inc.', issued: '2020-07-23', ko: '확실한 해소 보장 – 저희도 이 제품을 직접 복용하며, 진정한 숙취 치료제로 자신 있게 소개해 드립니다.' },
      // FDA-2020-HO-03 · Vita Heaven, LLC dba Hangover Heaven · Hangover Heaven Nightlife Prep Supplement — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/vita-heaven-llc-dba-hangover-heaven-593765-07232020
      { text: 'Hangover Cure through Prevention', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: '예방을 통한 숙취 치료' },
      { text: 'If you take our supplements you will have much less of a hangover the next morning.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: '저희 보충제를 복용하시면 다음 날 아침 숙취가 훨씬 덜할 것입니다.' },
      { text: 'These supplements contain ingredients that help your body deal with the breakdown products of alcohol, which cause hangovers.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: '이 보충제에는 숙취를 일으키는 알코올 분해 산물을 몸이 처리하도록 돕는 성분이 들어 있습니다.' },
      { text: 'Hangover Heaven Nightlife Prep is a physician and PhD formulated hangover prevention product designed to be taken before drinking to reduce hangover symptoms the next day.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: 'Hangover Heaven Nightlife Prep은 의사와 박사(PhD)가 개발한 숙취 예방 제품으로, 음주 전에 복용하여 다음 날 숙취 증상을 줄이도록 고안되었습니다.' },
      { text: 'Dosing depends on how much you plan to drink and the severity of your hangovers.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: '복용량은 마실 예정인 술의 양과 숙취의 심한 정도에 따라 달라집니다.' },
      { text: 'Hangover Heaven IV Hydration is the first medical practice dedicated to the treatment, prevention, and cure of hangovers. With Hangover Heaven Nightlife Prep Supplements, you can significantly reduce your changes [sic] of having a hangover.', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: 'Hangover Heaven IV Hydration은 숙취의 치료, 예방, 완치를 전문으로 하는 최초의 의료기관입니다. Hangover Heaven Nightlife Prep 보충제와 함께라면 숙취가 생길 가능성을 크게 줄일 수 있습니다.' },
      { text: 'Best Hangover Pills to Prevent Hangovers', firm: 'Vita Heaven, LLC dba Hangover Heaven', issued: '2020-07-23', ko: '숙취 예방을 위한 최고의 숙취 알약' },
      // FDA-2020-HO-04 · Happy Hour Vitamins · Happy Hour Vitamins (H2V) — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/happy-hour-vitamins-593770-07232020
      { text: 'Multivitamin Specially Formulated to Help with Hangovers.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취 해소에 도움이 되도록 특별히 배합된 멀티비타민.' },
      { text: 'Specially formulated to help you Avoid Hangovers . . .', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취를 피할 수 있도록 특별히 배합되었습니다 . . .' },
      { text: 'HELPS AVOID HANGOVERS!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취를 피하는 데 도움을 줍니다!' },
      { text: 'MULTIVITAMIN SPECIALLY FORMULATED TO HELP YOU AVOID HANGOVERS', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취를 피할 수 있도록 특별히 배합된 멀티비타민' },
      { text: 'Convenient individual packets makes hangover prevention easy by taking 1 dose (2 hangover pills) before/while drinking.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '편리한 개별 포장으로, 음주 전/음주 중에 1회분(숙취 알약 2정)만 복용하면 숙취 예방이 쉬워집니다.' },
      { text: 'KILL YOUR HANGOVER BEFORE IT EVEN STARTS with powerful vitamin, mineral, anti-oxidant, herbal blend. Preventing hangovers works better than a hangover cure or cures you can try.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '강력한 비타민, 미네랄, 항산화제, 허브 블렌드로 숙취가 시작되기도 전에 없애 버리세요. 숙취를 예방하는 것이 시도해 볼 수 있는 숙취 해소제나 해소법보다 더 효과적입니다.' },
      { text: 'GET RID OF TOXIC ACETALDEHYDE POISONING that adds to your hangovers with N-acetyl Cysteine [ingredient in Happy Hour Vitamins (H2V)]. Protect your liver with milk thistle, kudzu flower powder, and artichoke leaf extract [ingredients in Happy Hour Vitamins (H2V)]. Paired with water makes the perfect hangover kit.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: 'N-아세틸시스테인[Happy Hour Vitamins (H2V)의 성분]으로 숙취를 악화시키는 독성 아세트알데히드 중독을 없애세요. 밀크시슬, 칡꽃 분말, 아티초크 잎 추출물[Happy Hour Vitamins (H2V)의 성분]로 간을 보호하세요. 물과 함께하면 완벽한 숙취 키트가 됩니다.' },
      { text: 'These are the hangover cure pills you are looking for!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '바로 여러분이 찾던 숙취 해소 알약입니다!' },
      { text: 'Hangovers are much more than just dehydration . . . Headache often occurs when alcohol in the bloodstream absorbs all the vitamins and nutrients from the body’s organs. . . . Solution: Take in a healthy dose of vitamins & nutrients prior to drinking', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취는 단순한 탈수 그 이상입니다 . . . 두통은 혈중 알코올이 신체 장기의 모든 비타민과 영양소를 흡수할 때 자주 발생합니다. . . . 해결책: 음주 전에 충분한 양의 비타민과 영양소를 섭취하세요' },
      { text: 'Hangovers are much more than just dehydration . . . Diarrhea, Nausea, and Vomiting all go hand in hand. . . . These are truly the hangover vitamins you need.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취는 단순한 탈수 그 이상입니다 . . . 설사, 메스꺼움, 구토가 모두 함께 따라옵니다. . . . 이것이야말로 진정 여러분에게 필요한 숙취 비타민입니다.' },
      { text: 'Antioxidants can help the body deal with toxins & other effects from alcohol', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '항산화제는 신체가 알코올로 인한 독소 및 기타 영향에 대처하도록 도울 수 있습니다' },
      { text: 'Happy Hour Vitamins contains Thiamine which has been used to help calm the effects of alcohol withdrawal syndrome.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: 'Happy Hour Vitamins에는 알코올 금단 증후군의 영향을 진정시키는 데 사용되어 온 티아민이 함유되어 있습니다.' },
      { text: 'Avoid Hangovers . . . with Happy Hour Vitamins', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취를 피하세요 . . . Happy Hour Vitamins와 함께' },
      { text: 'I started thinking that it would be great if there was a multivitamin specifically formulated for the drinking population. One that would help support the bar industry lifestyle by focusing on . . . the reduction of hangover symptoms.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '음주하는 사람들을 위해 특별히 배합된 멀티비타민이 있다면 정말 좋겠다는 생각이 들기 시작했습니다. . . . 숙취 증상 감소에 초점을 맞춰 바 업계의 라이프스타일을 지원하는 제품 말이죠.' },
      { text: 'HOW TO STOP THE STRUGGLE WITH HANGOVERS', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취와의 싸움을 끝내는 방법' },
      { text: 'With the H2V Partner Program, you can start making more money by selling the most effective hangover cure on the market.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: 'H2V 파트너 프로그램으로 시중에서 가장 효과적인 숙취 해소제를 판매하여 더 많은 돈을 벌기 시작할 수 있습니다.' },
      { text: 'I struggled with hangovers while working as bartender for over a decade. Striving to find a hangover cure, I hired a PhD chemist and consulted medical professionals to create Happy Hour Vitamins, hangover vitamins. Now Happy Hour Vitamins allow me to avoid my hangovers . . .', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial', ko: '저는 10년 넘게 바텐더로 일하며 숙취에 시달렸습니다. 숙취 해소제를 찾기 위해 애쓰던 끝에 박사 학위를 가진 화학자를 고용하고 의료 전문가들의 자문을 받아 숙취 비타민인 Happy Hour Vitamins를 만들었습니다. 이제 Happy Hour Vitamins 덕분에 숙취를 피할 수 있습니다 . . .' },
      { text: 'I got these for my wedding ‘Emergency Hang-over Kits’. They work wonders; everyone was so excited to wake up the next morning and not feel sluggish or tired or have a major headache.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial', ko: '제 결혼식 \'응급 숙취 키트\'용으로 이걸 샀어요. 효과가 놀라워요. 다음 날 아침 일어났을 때 나른하거나 피곤하지 않고 심한 두통도 없어서 모두가 정말 신나 했어요.' },
      { text: 'I keep the packets in my purse and when I start drinking I just take them its [sic] as easy as that and bam no hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial', ko: '지갑에 포장 팩을 넣고 다니다가 술을 마시기 시작할 때 그냥 먹으면 돼요, 그렇게 간단해요, 그러면 짠, 숙취가 없어요!' },
      { text: 'I am a bartender and always advise my customers to take a couple before beginning their shenanigans for the evening. They always come back and thank me for introducing them to Happy Hour Vitamins. I tell them that is easy to sell, no one wants a hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', kind: 'testimonial', ko: '저는 바텐더인데, 손님들에게 늘 그날 밤 신나게 놀기 전에 두어 알 먹으라고 권해요. 손님들은 항상 다시 와서 Happy Hour Vitamins를 소개해 줘서 고맙다고 해요. 저는 이건 팔기 쉽다고 말해요, 숙취를 원하는 사람은 없으니까요!' },
      { text: 'Happy Hour Vitamins Formulated for Hangovers . . .', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '숙취를 위해 배합된 Happy Hour Vitamins . . .' },
      { text: 'Forgot to take Happy Hour Vitamins and woke up Hungover? Take a pack of Happy Hour Vitamins as your hangover cure!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: 'Happy Hour Vitamins 먹는 걸 잊어서 숙취와 함께 깨어났나요? Happy Hour Vitamins 한 팩을 숙취 해소제로 드세요!' },
      { text: 'These are the hangover pills you need for the perfect wedding, bachelor, bachelorette, vacation, party or everyday hangover kit!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '완벽한 결혼식, 총각 파티, 처녀 파티, 휴가, 파티 또는 일상용 숙취 키트에 필요한 숙취 알약이 바로 이것입니다!' },
      { text: 'Avoiding hangovers is easy with Happy Hour Vitamins, just take 1 dose (2 capsules) before/while drinking to help you the next morning.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: 'Happy Hour Vitamins로 숙취를 쉽게 피하세요. 음주 전/음주 중에 1회분(캡슐 2개)만 복용하면 다음 날 아침에 도움이 됩니다.' },
      { text: 'We were tired of hangovers and figured there had to be a better way. So we hired a chemist, domestic manufacturer & consulted medical professionals.', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '우리는 숙취에 지쳤고 더 나은 방법이 분명 있을 거라고 생각했습니다. 그래서 화학자와 국내 제조업체를 고용하고 의료 전문가들의 자문을 받았습니다.' },
      { text: 'The Only Thing You Have To Lose Is Your Hangover!', firm: 'Happy Hour Vitamins', issued: '2020-07-23', ko: '잃을 것은 숙취뿐입니다!' },
      // FDA-2020-HO-05 · LES Labs · DeToxx for Hangovers — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/les-labs-593764-07232020
      { text: 'DETOXX FOR HANGOVERS', firm: 'LES Labs', issued: '2020-07-23', ko: '숙취를 위한 DETOXX' },
      { text: 'DeToxx helps reduce hangover symptoms . . . Natural ingredients including milk thistle, prickly pear and cysteine work while you drink, helping to metabolize the toxins that cause hangover symptoms . . .', firm: 'LES Labs', issued: '2020-07-23', ko: 'DeToxx는 숙취 증상 감소에 도움을 줍니다 . . . 밀크시슬, 백년초, 시스테인 등 천연 성분이 음주하는 동안 작용하여 숙취 증상을 일으키는 독소의 대사를 돕습니다 . . .' },
      { text: 'Helps prevent hangover symptoms*', firm: 'LES Labs', issued: '2020-07-23', ko: '숙취 증상 예방에 도움을 줍니다*' },
      // FDA-2020-HO-06 · Mind, Body & Coal LLC · Miracoal - Ultimate Hangover Relief and Total Body Detox — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/mind-body-coal-llc-593774-07232020
      { text: 'Ultimate Hangover Relief', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '최고의 숙취 해소제' },
      { text: 'PUT YOUR HANGOVER TO BED', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '숙취를 재워 버리세요' },
      { text: 'Miracoal is the only product on the market that takes this healing process to the next level combining the purest form of organic coconut charcoal with electrolytes to flush away toxins and impurities in your digestive system and provide fast detoxifying rejuvenation, helping you wake up hangover-free.*', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: 'Miracoal은 가장 순수한 형태의 유기농 코코넛 숯과 전해질을 결합하여 소화기관 내 독소와 불순물을 씻어내고 빠른 해독 회복 효과를 제공함으로써 이 치유 과정을 한 단계 끌어올린 시장 유일의 제품으로, 숙취 없이 깨어나도록 도와줍니다.*' },
      { text: 'We know that hangovers don’t concede to a demanding schedule or life. . . . we have researched, created and patented an effective formula that detoxes impurities from your system and provides fast-acting relief the woes of a night well spent. So we invented our ‘Miracoal’ and set out to change the world, one hangover at a time.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '숙취는 바쁜 일정이나 삶을 봐주지 않는다는 것을 저희는 잘 압니다. . . . 저희는 체내 불순물을 해독하고 즐겁게 보낸 밤의 괴로움을 빠르게 덜어주는 효과적인 포뮬러를 연구하고 개발하여 특허를 받았습니다. 그래서 저희는 \'Miracoal\'을 발명했고, 숙취 하나하나씩 세상을 바꾸기 위해 나섰습니다.' },
      { text: 'I love using Miracoal! I don’t drink often but every time I do I use Miracoal and I’m back to business in the morning. No hangover feelings at all!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', kind: 'testimonial', ko: 'Miracoal 정말 좋아요! 술을 자주 마시진 않지만 마실 때마다 Miracoal을 먹는데, 아침이면 바로 일상으로 복귀해요. 숙취 느낌이 전혀 없어요!' },
      { text: '. . . Then I found Miracoal! Now when I go out, if I have a few cocktails, I just take my Miracoal before I go to bed. I wake up the next morning hangover-free and ready to tackle my day!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', kind: 'testimonial', ko: '. . . 그러다 Miracoal을 발견했어요! 이제는 외출해서 칵테일 몇 잔을 마시면 자기 전에 Miracoal만 먹으면 돼요. 다음 날 아침 숙취 없이 일어나서 하루를 거뜬히 시작해요!' },
      { text: 'Miracoal Hangover Prevention and Relief Pills', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: 'Miracoal 숙취 예방 및 해소 알약' },
      { text: 'Each capsule offers much more than just hangover relief . . .', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '캡슐 하나하나가 단순한 숙취 해소 이상의 것을 제공합니다 . . .' },
      { text: 'THE ULTIMATE HANGOVER PREVENTION', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '최고의 숙취 예방제' },
      { text: 'Activated charcoal [ingredient in Miracoal – Ultimate Hangover Relief & Total Body Detox] removes impurities from your digestive system, helping you recover from drinking and put your hangover to bed!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '활성탄[Miracoal – Ultimate Hangover Relief & Total Body Detox의 성분]은 소화기관의 불순물을 제거하여 음주 후 회복을 돕고 숙취를 재워 버립니다!' },
      { text: 'We’ve harnessed its [charcoal’s] healing powers into an easy-to-use capsule, formulated specifically to provide easy hangover relief and prevention.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '저희는 숯의 치유력을 간편하게 복용할 수 있는 캡슐에 담았으며, 손쉬운 숙취 해소와 예방을 위해 특별히 배합했습니다.' },
      { text: 'You’ll wake up feeling . . . hangover-free!', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '숙취 없이 . . . 개운하게 깨어나실 거예요!' },
      { text: 'Since activated charcoal has long been considered a safe and effective treatment for acute toxic poisoning, we\'ve turned it into a powerful new hangover prevention pill.', firm: 'Mind, Body & Coal LLC', issued: '2020-07-23', ko: '활성탄은 오랫동안 급성 독극물 중독에 안전하고 효과적인 치료제로 여겨져 왔기에, 저희는 이를 강력한 새로운 숙취 예방 알약으로 만들었습니다.' },
      // FDA-2020-HO-07 · Purple Biosciences LLC · Purple Tree — https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/purple-biosciences-llc-593772-07232020
      { text: 'Purple Tree® is a natural multivitamin specifically designed to reduce alcohol\'s negative effects in the body . . . Hangovers hinder our work, fitness and family routines, so we embarked on a mission to help health-conscious adults who drink . . .', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: 'Purple Tree®는 체내에서 알코올의 부정적 영향을 줄이도록 특별히 설계된 천연 종합비타민입니다 . . . 숙취는 우리의 일, 운동, 가족 일상을 방해하기에, 저희는 술을 마시는 건강을 생각하는 성인들을 돕기 위한 사명에 나섰습니다 . . .' },
      { text: 'Yes, Purple Tree is a hangover prevention pill that works.', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '네, Purple Tree는 효과가 있는 숙취 예방 알약입니다.' },
      { text: 'Although a hangover cure for heavy-drinking situations like this does not exist, Purple Tree surely helps to mitigate some of the hangover symptoms, if taken beforehand.', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '이처럼 과음하는 상황을 위한 숙취 치료제는 존재하지 않지만, Purple Tree를 미리 복용하면 일부 숙취 증상을 확실히 완화하는 데 도움이 됩니다.' },
      { text: 'Purple Tree’s key ingredient is called Dihydromyricetin (DHM), an extract from the Japanese Raisin Tree, which has been used for centuries as an anti-alcohol herb and hangover cure in Asia.', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: 'Purple Tree의 핵심 성분은 디하이드로미리세틴(DHM)으로, 아시아에서 수 세기 동안 항알코올 약초이자 숙취 치료제로 사용되어 온 헛개나무(Japanese Raisin Tree) 추출물입니다.' },
      { text: 'Say Goodbye to Hangovers . . . SHOP NOW', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '숙취여 안녕 . . . 지금 구매하기' },
      { text: 'Purple Tree – Supplement for Hangover Prevention', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: 'Purple Tree – 숙취 예방 보충제' },
      { text: 'Our hangover prevention pills were crafted by Doctors and Scientists with vast experience in natural supplements.', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '저희 숙취 예방 알약은 천연 보충제 분야에 풍부한 경험을 가진 의사와 과학자들이 만들었습니다.' },
      { text: 'Purple Tree Hangover Cure & Prevention Pills', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: 'Purple Tree 숙취 치료 및 예방 알약' },
      { text: 'HELPS PREVENT HANGOVER SYMPTOMS', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '숙취 증상 예방에 도움' },
      { text: 'Purple Tree’s science-backed formula includes Dihydromyricetin (DHM), a liver detox and hangover prevention ingredient. DHM is a natural extract that has been used as anti-alcohol herb and hangover cure since ancient medicine.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: 'Purple Tree의 과학적으로 입증된 포뮬러에는 간 해독 및 숙취 예방 성분인 디하이드로미리세틴(DHM)이 들어 있습니다. DHM은 고대 의학 시대부터 항알코올 약초이자 숙취 치료제로 사용되어 온 천연 추출물입니다.*' },
      { text: 'Purple Tree helps to prevent hangover symptoms . . .', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: 'Purple Tree는 숙취 증상 예방에 도움을 줍니다 . . .' },
      { text: 'Key Benefits . . . helps to combat alcohol’s negative effects in the body, including hangover*', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '주요 효능 . . . 숙취를 포함해 체내에서 알코올의 부정적 영향에 대항하도록 도와줍니다*' },
      { text: 'White Willow Bark, also called ‘Nature’s Aspirin’, acts as a natural anti-inflammatory agent in the human body.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '\'자연의 아스피린\'이라고도 불리는 화이트 윌로우 바크는 인체에서 천연 항염증제 역할을 합니다.*' },
      { text: 'Milk Thistle helps to protect the liver from damage.*', firm: 'Purple Biosciences LLC', issued: '2020-07-23', ko: '밀크시슬은 간을 손상으로부터 보호하는 데 도움을 줍니다.*' }
    ],

    // 모두 PASS여야 하는 문구
    // 시연본 안전 문구 이관 (2026-10-23) · 2026-10-25 브랜드 키트(10-24) 기준으로 제품 사실 수정:
    // 젤리는 개별 포장 모양 젤리(봉지) · 음료는 100 ml 플라스크형 유리병(1병·3병 박스) · 당 표현은 'Zero Sugar'(Balance)만 →
    // 'low sugar'·스틱·10개입·6병 문장은 뺐고, 한국 판매·인기 사실이 없는 문장(미국 전용 라인)은 삭제
    safePhrases: [
      { text: 'Pocket-sized.', kind: '시연본 안전 문구' },
      { text: 'Contains Hovenia dulcis extract.', kind: '오탐 확인' },
      { text: 'Before the first toast.', kind: '오탐 확인' },
      { text: 'Best served chilled.', kind: '오탐 확인' },
      { text: 'Individually wrapped jellies.', kind: '오탐 확인' },
      { text: 'Restart Your Day.', kind: '브랜드 슬로건' },
      { text: 'Lime, lemon and cherry jellies.', kind: '제품 사실' },
      { text: 'Non-carbonated drinks in 100 ml glass flask bottles, single or 3-bottle box.', kind: '제품 사실' },
      { text: 'A grab-and-go jelly with a bright citrus flavor.', kind: '안전 문구' },
      { text: 'Individually wrapped. Just tear and enjoy.', kind: '안전 문구' },
      { text: 'Enjoy responsibly.', kind: '안전 문구' },
      // 브랜드 가이드 v1.1 (2026-10) 10장 '바로 쓰는 브랜드 소개' · 9장 권장 표현
      { text: 'Meet Reboot. Drinks and individually wrapped jellies with bold color, playful Western details, and three flavors to explore.', kind: '브랜드 가이드 문구' },
      { text: 'Pick your flavor. Meet your Reboot.', kind: '브랜드 가이드 문구' },
      { text: 'Explore Drinks / Explore Jellies / Meet Rebu', kind: '브랜드 가이드 문구' },
      { text: '오늘의 다음 장면을, 나답게.', kind: '브랜드 가이드 문구' },
      { text: '세 가지 맛. 오늘은 어떤 맛?', kind: '브랜드 가이드 문구' },
      { text: '모자 챙겼어. 이제 네 차례야!', kind: '브랜드 가이드 문구' }
    ],

    // 규칙은 PASS지만 사람이 한 번 봐야 하는 문구 (2026-10-25 · 안전 문구에서 분리)
    // 규칙 검증에서 'PASS인지'만 확인하고, 화면에는 안전 문구와 따로 보여 줌
    humanReviewPhrases: [
      { text: 'Before the first toast, raise a different kind of glass.', kind: '규칙 PASS · 사람 검토', note: '다음 날 회복·음주 직전 시점 암시 가능' },
      { text: 'Own your morning.', kind: '규칙 PASS · 사람 검토', note: '다음 날 회복·음주 직전 시점 암시 가능' }
    ],

    // 판정 엔진 자체 점검용 예문 — FDA 경고장 원문이 아니라 팀이 만든 문장입니다.
    selfTest: [
      { text: 'Prevents hangovers fast.', expect: 'BLOCK' },
      { text: 'Protect your liver before the party.', expect: 'BLOCK' },
      { text: 'Say goodbye to Asian glow.', expect: 'BLOCK' },
      { text: 'Guaranteed results every morning.', expect: 'REVISE' },
      { text: 'Drink all night, feel fine.', expect: 'REVISE' },
      { text: 'Doctor-formulated jelly.', expect: 'REVISE' },
      { text: 'Supports liver health.', expect: 'REVISE' },
      { text: 'Supports liver health.', expect: 'COND', category: 'SUPPLEMENT' },
      { text: 'Clinically tested formula.', expect: 'REVISE' },
      { text: 'Clinically tested formula.', expect: 'REVIEW', channel: 'b2b' },
      { text: 'Read our 5-star testimonials.', expect: 'REVIEW' },
      { text: 'Get a free box for a 5-star review!', expect: 'BLOCK' },
      { text: 'Lime flavor jelly shaped like a cowboy boot, in a 3-bottle box with our drinks.', expect: 'PASS' },
      { text: '숙취 해소에 좋은 젤리', expect: 'BLOCK' },
      // 당류 규칙 R11·R12 (2026-10-25 다시 켬 · 브랜드 가이드 v1.1): Balance만 'Zero Sugar' 조건부, 나머지 당 표현은 사용 불가
      { text: 'Low sugar lemon-lime jelly.', expect: 'BLOCK', product: 'jelly-ls' },
      { text: 'Reduced sugar lemon-lime drink.', expect: 'BLOCK', product: 'drink-ls' },
      { text: 'Reduced sugar lemon-lime drink.', expect: 'BLOCK', product: 'drink' },
      { text: 'Sugar-free jellies.', expect: 'BLOCK', product: 'jelly' },
      { text: 'Zero sugar, less sugar, low sugar.', expect: 'BLOCK', product: 'drink-ls' },
      { text: '저당 젤리로 가볍게', expect: 'BLOCK', product: 'jelly-ls' },
      { text: 'Zero Sugar cherry, lime and lemon jellies.', expect: 'PASS', product: 'jelly-ls' },
      { text: 'Zero Sugar cherry, lime and lemon jellies.', expect: 'BLOCK', product: 'jelly' },
      { text: 'Sweetened with allulose and stevia, no sugar alcohols.', expect: 'PASS', product: 'drink-ls' },
      { text: 'Wake up to a fresh, clear morning tomorrow.', expect: 'REVISE' },
      // 브랜드 가이드 v1.1 9장 '피할 표현' (2026-10-25 · 전에는 '피로와 숙취…'만 잡히고 나머지 3개는 PASS였음)
      { text: '컨디션 완벽 리셋.', expect: 'REVISE' },
      { text: '맛마다 다른 회복 효과.', expect: 'REVISE' },
      { text: '피로와 숙취를 한 병으로 해결.', expect: 'BLOCK' },
      { text: '많이 마셔도 리부가 해결해 줄게!', expect: 'BLOCK' },
      { text: 'Drink as much as you want, Rebu has you covered!', expect: 'BLOCK' },
      // 브랜드 가이드 13장 사용 제한 (R15 · 사람이 사실 확인)
      { text: 'Only 43 kcal and 10g sugar per bottle.', expect: 'REVIEW' },
      { text: 'Our revolver-shaped jelly.', expect: 'REVIEW' },
      { text: 'Official partner of Coachella.', expect: 'REVIEW' },
      // 원료 표 (2026-10-25): 확정 원료가 '들어 있다'는 사실은 PASS · 강조·효과·미확정·금지 성분은 계속 걸림
      { text: 'Contains Hovenia dulcis fruit extract and Lactobacillus fermentum.', expect: 'PASS' },
      { text: 'Made with A-HAT.', expect: 'PASS' },
      { text: '헛개나무 열매와 유산균을 담은 A-HAT', expect: 'PASS' },
      { text: '원재료: 헛개나무 열매 추출물, 유산균', expect: 'PASS' },
      { text: 'Packed with A-HAT.', expect: 'REVIEW' },
      { text: '헛개를 듬뿍 담은 젤리', expect: 'REVIEW' },
      { text: 'Made with A-HAT to support liver health.', expect: 'REVISE' },
      { text: 'Contains turmeric and ginger.', expect: 'REVIEW' },
      { text: 'Made with milk thistle.', expect: 'REVIEW' },
      { text: 'Hovenia dulcis has been used for centuries to help after drinking.', expect: 'BLOCK' },
      { text: "Korea's No.1 ingredient for after-party care.", expect: 'BLOCK' },
      { text: 'A-HAT 특허 성분으로 다음 날도 가뿐하게', expect: 'REVISE' },
      // 경쟁 구미(미국 건강기능식품) 효능 문구 (2026-10-25 · 전에는 아래 PASS였음)
      { text: 'Supports Processing of Acetaldehyde', expect: 'REVISE' },
      { text: 'Reduces Alcohol "Flush"', expect: 'BLOCK' },
      { text: 'Supports GABA Rebound', expect: 'REVISE' },
      { text: 'Reduces Morning Nausia', expect: 'BLOCK' },
      { text: 'Reduces Bloating & Inflammation', expect: 'BLOCK' },
      { text: 'Pre-Alcohol Gummies', expect: 'REVISE' },
      { text: 'Science-Backed Formula', expect: 'REVISE' },
      { text: 'Gluten Free · Non GMO', expect: 'REVIEW' },
      { text: 'Science-backed liver support.', expect: 'REVISE' },
      // 파트 검토(2026-10-25)에서 CS 서버 검사를 통과하던 문장
      { text: 'Good for your liver.', expect: 'REVISE' },
      { text: 'Reboot keeps your liver happy.', expect: 'REVISE' },
      { text: 'Take before drinking.', expect: 'REVISE' },
      { text: 'Used in Korea for centuries after drinking.', expect: 'REVISE' },
      { text: 'Reboot Jelly Original is Zero Sugar.', expect: 'BLOCK', product: 'jelly' }
    ],

    // 처음 보는 문장 시험 (2026-10-24) — 규칙을 만들 때 쓰지 않은 문장으로 '진짜 실력'을 잼.
    // src 'gpt': GPT 검토가 찾은 문제 문장 (이번에 규칙을 고친 대상) · src 'new': 새로 쓴 문장 (규칙을 이 문장에 맞춰 고치지 않음)
    // 당 함량 표현(low sugar 등)은 점검하지 않기로 했으므로 넣지 않음. expect는 팀이 정한 정답 (B2C 채널 기준)
    evalSet: [
      { text: 'Our jelly eliminates nausea after drinking.', expect: 'BLOCK', src: 'gpt', note: '음주 후 증상 제거 = 의약품 주장' },
      { text: 'Reduces blood alcohol concentration.', expect: 'BLOCK', src: 'gpt', note: '혈중 알코올을 낮춘다 = 의약품 주장' },
      { text: 'FDA approved jelly.', expect: 'BLOCK', src: 'gpt', note: 'FDA는 일반식품을 승인하지 않음' },
      { text: 'Store in a cool place to prevent spoilage.', expect: 'PASS', src: 'gpt', note: '보관 안내 (prevent가 질병 예방이 아님)' },
      { text: 'We do not offer refunds in exchange for reviews.', expect: 'PASS', src: 'gpt', note: '부정문 · 보상을 거절하는 문장' },
      { text: 'We send a free sample for an honest review, positive or negative.', expect: 'REVISE', src: 'gpt', note: '조건 없는 후기 보상: 법 위반은 아니지만 대가 표시 필요 · 플랫폼·팀 기준상 수정' },
      { text: 'Wake up without the headache.', expect: 'BLOCK', src: 'new', note: '숙취 단어 없이 숙취 완화를 암시' },
      { text: 'Helps your body process alcohol faster.', expect: 'BLOCK', src: 'new', note: '알코올 대사 = 의약품 주장' },
      { text: 'Clinically proven to reduce hangover symptoms.', expect: 'BLOCK', src: 'new' },
      { text: 'Get 20% off your next order when you leave a 5-star review!', expect: 'BLOCK', src: 'new', note: '좋은 후기를 조건으로 한 보상' },
      { text: 'Leave us a review and get a free gift.', expect: 'REVISE', src: 'new', note: '조건 없는 후기 보상' },
      { text: 'Approved by the FDA for daily use.', expect: 'BLOCK', src: 'new' },
      { text: 'Tastes like lime and cherry.', expect: 'PASS', src: 'new' },
      { text: 'Each stick is individually wrapped for on-the-go snacking.', expect: 'PASS', src: 'new' },
      { text: 'Made in Korea with Hovenia dulcis extract.', expect: 'PASS', src: 'new', note: '성분 사실만' },
      { text: 'Keep out of reach of children to prevent choking.', expect: 'PASS', src: 'new', note: '안전 안내' },
      { text: 'Drink responsibly.', expect: 'PASS', src: 'new' },
      { text: 'Party all night and feel fine tomorrow.', expect: 'BLOCK', src: 'new', note: '음주 조장 + 숙취 없음 암시' },
      { text: 'Supports healthy liver function.', expect: 'REVISE', src: 'new', note: '구조·기능 표현' },
      { text: 'Say goodbye to the morning-after struggle.', expect: 'BLOCK', src: 'new' },
      { text: 'Doctors recommend our jelly.', expect: 'REVISE', src: 'new', note: '전문가 권위 = 의약품 오인' },
      { text: 'No artificial colors or flavors.', expect: 'PASS', src: 'new' },
      { text: 'Detoxifies your body after a night out.', expect: 'BLOCK', src: 'new' },
      { text: 'We are sorry you felt nauseous. Please stop using the product and contact a doctor.', expect: 'PASS', src: 'new', note: 'CS 사과·안내 문장' },
      { text: 'Absorbs alcohol so you stay sharp.', expect: 'BLOCK', src: 'new' },
      { text: 'Try it risk-free with our 30-day money-back guarantee.', expect: 'PASS', src: 'new', note: '환불 보장은 효과 보장이 아님' },
      { text: '저희 젤리는 숙취 해소에 도움을 줍니다.', expect: 'BLOCK', src: 'new' },
      { text: '리뷰 남기면 쿠폰 드려요', expect: 'REVISE', src: 'new', note: '조건 없는 후기 보상' },
      { text: '별점 5점 리뷰 남기시면 전액 환불해 드려요', expect: 'BLOCK', src: 'new', note: '좋은 후기를 조건으로 한 보상' }
    ],

    // 일괄 심의 시연용 더미 문구 30개 (2026-10-24 · 2026-10-25 30개로 · 팀이 지어낸 아마존·SNS 광고 문장, 실제 광고 아님)
    // 판정별 6개씩: BLOCK 6 · REVISE 6 · COND 6 · REVIEW 6 · PASS 6
    // category: 'SUPPLEMENT' = 건강기능식품 기준 비교 (우리 제품은 일반식품 · 같은 문장이 건강기능식품이라면 '조건부'가 되는 예) · 없으면 일반식품
    // ko: 마케터가 쓰는 한국어 문구 (화면 더미는 이걸 올림 → 서버 Claude가 영어로 번역 → 영어·한국어 둘 다 점검)
    // channel·product: 줄마다 다른 채널·제품 ('all' = 전체) · copy: 예시 영어 번역 (번역을 못 할 때 · 규칙 확인용)
    // expect: copy(영어)를 그 줄의 채널·제품으로 점검했을 때의 예상 판정
    batchSample: [
      { ko: '리부트 젤리 오리지널: 라임·레몬·체리 맛 모양 젤리를 하나씩 포장한 한 봉지', channel: 'amazon', product: 'jelly', copy: 'Reboot Jelly Original: lime, lemon and cherry shaped jellies, individually wrapped, in one pouch.', expect: 'PASS', note: '제품 사실' },
      { ko: '가방에 쏙 넣어 다니는 개별 포장 젤리', channel: 'b2c', product: 'jelly', copy: 'Individually wrapped jellies you can toss in your bag.', expect: 'PASS', note: '포장 사실' },
      { ko: '헛개나무 열매 추출물 함유', channel: 'amazon', product: 'all', copy: 'Contains Hovenia dulcis fruit extract.', expect: 'PASS', note: '성분 사실만' },
      { ko: '상큼한 시트러스 젤리로 Restart Your Day', channel: 'b2c', product: 'jelly-ls', copy: 'Restart Your Day with a bright citrus jelly.', expect: 'PASS', note: '슬로건' },
      { ko: '리부트 드링크 밸런스: 작은 병에 담은 비탄산 레몬 음료', channel: 'amazon', product: 'drink-ls', copy: 'Reboot Drink Balance: a non-carbonated lemon drink in a small bottle.', expect: 'PASS', note: '제품 사실' },
      { ko: '젤리 하나로 숙취와 작별하세요', channel: 'all', product: 'all', copy: 'Say goodbye to hangovers with one jelly.', expect: 'BLOCK', note: 'R2 숙취' },
      { ko: '파티 전에 간을 보호하세요', channel: 'b2c', product: 'jelly', copy: 'Protects your liver before the party.', expect: 'BLOCK', note: 'R3 간 보호' },
      { ko: '헛개나무, 한국 전통 숙취 해소제', channel: 'amazon', product: 'all', copy: "Hovenia dulcis, Korea's traditional hangover cure.", expect: 'BLOCK', note: 'R1 치료 · R2' },
      { ko: '술자리 홍조는 이제 그만', channel: 'b2c', product: 'drink', copy: 'No more Asian glow at the bar.', expect: 'BLOCK', note: 'R4 홍조' },
      { ko: '별점 5개 리뷰를 남기면 한 박스 무료 증정!', channel: 'all', product: 'all', copy: 'Get a free box when you leave a 5-star review!', expect: 'BLOCK', note: 'R10 보상 후기' },
      { ko: '임상으로 연구한 한국 포뮬러', channel: 'b2b', product: 'all', copy: 'Clinically studied Korean formula.', expect: 'REVIEW', note: 'R9 임상 · B2B 자료라 검토 필요 (B2C면 수정 필요)' },
      { ko: '매번 효과 보장', channel: 'amazon', product: 'jelly', copy: 'Guaranteed to work every time.', expect: 'REVISE', note: 'R5 효과 보장' },
      { ko: '밤새 마셔도 아침엔 거뜬하게', channel: 'b2c', product: 'drink', copy: 'Drink all night, wake up ready.', expect: 'REVISE', note: 'R6 음주 조장' },
      { ko: '의사가 처방하듯 만든 파티용 젤리', channel: 'b2c', product: 'jelly', copy: 'Doctor-formulated jelly for party lovers.', expect: 'REVISE', note: 'R7 의약품 오인' },
      { ko: '몸이 알코올 분해를 더 빨리 하도록 도와줘요', channel: 'all', product: 'all', copy: 'Helps your body process alcohol faster.', expect: 'REVISE', note: 'R8 알코올 분해' },
      { ko: '헛개나무 추출물 듬뿍', channel: 'amazon', product: 'jelly-ls', copy: 'Packed with Hovenia dulcis extract.', expect: 'REVIEW', note: 'R13 성분 강조' },
      { ko: '한국산 DHM 파워', channel: 'b2c', product: 'all', copy: 'Powered by DHM from Korea.', expect: 'REVIEW', note: 'R13 숙취 연상 성분' },
      { ko: '고객들이 계속 별점 5개 후기를 남기는 이유', channel: 'cs', product: 'all', copy: 'See why our customers keep leaving 5-star reviews.', expect: 'REVIEW', note: 'R10 후기' },
      { ko: '생일 파티에서 먹어 봤는데 친구들이 다들 맛있대요 (구매 후기)', channel: 'b2c', product: 'drink-ls', copy: 'I tried it at my birthday party and everyone loved the flavors.', expect: 'REVIEW', note: "R10 1인칭 후기 (2026-10-25: '다음 날 아침 개운'은 R8 암시라 문장 교체)" },
      { ko: 'FDA 승인 받은 파티 젤리', channel: 'b2c', product: 'jelly', copy: 'FDA approved jelly for your night out.', expect: 'BLOCK', note: 'R14 정부 승인 주장' },
      { ko: '후기를 남기면 감사 선물을 증정해요', channel: 'amazon', product: 'all', copy: 'Leave a review and get a thank-you gift.', expect: 'REVISE', note: 'R10 조건 없는 후기 보상 · 대가 표시 필요' },
      { ko: '파티용 알약 대신 젤리', channel: 'b2c', product: 'jelly', copy: 'Your party pill, now in a jelly.', expect: 'REVISE', note: 'R7 의약품 오인' },
      { ko: '리부트 드링크 오리지널: 100ml 유리병에 담은 비탄산 음료, 레몬·체리·라임 맛', channel: 'amazon', product: 'drink', copy: 'Reboot Drink Original: a non-carbonated drink in a 100 ml glass bottle, in lemon, cherry and lime.', expect: 'PASS', note: '제품 사실 (브랜드 키트)' },
      { ko: '임상 시험한 원료, 바이어용 자료 제공', channel: 'b2b', product: 'all', copy: 'Clinically tested ingredients, data available for buyers.', expect: 'REVIEW', note: 'R9 임상 · B2B 자료라 검토 필요' },
      { ko: '간 건강을 돕는 헛개나무', channel: 'amazon', product: 'jelly-ls', category: 'SUPPLEMENT', copy: 'Supports liver health with Hovenia dulcis.', expect: 'COND', note: 'R8 구조·기능 · 건강기능식품 기준 비교 (일반식품이면 수정 필요)' },
      { ko: '정상적인 알코올 대사를 도와요', channel: 'b2c', product: 'drink', category: 'SUPPLEMENT', copy: 'Supports normal alcohol metabolism.', expect: 'COND', note: 'R8 구조·기능 · 건강기능식품 기준 비교' },
      { ko: '간 기능을 위한 데일리 루틴', channel: 'b2c', product: 'drink-ls', category: 'SUPPLEMENT', copy: 'A daily routine for healthy liver function.', expect: 'COND', note: 'R8 구조·기능 · 건강기능식품 기준 비교' },
      { ko: '젤리 하나로 면역력 강화', channel: 'b2c', product: 'jelly', category: 'SUPPLEMENT', copy: 'Boosts immunity with every jelly.', expect: 'COND', note: 'R8 구조·기능 · 건강기능식품 기준 비교' },
      { ko: '아침까지 간 건강을 챙겨요', channel: 'amazon', product: 'drink', category: 'SUPPLEMENT', copy: 'Supports liver health through the morning.', expect: 'COND', note: 'R8 구조·기능 · 건강기능식품 기준 비교' },
      { ko: '알코올 분해를 도와요', channel: 'b2c', product: 'jelly', category: 'SUPPLEMENT', copy: 'Helps break down alcohol.', expect: 'COND', note: 'R8 구조·기능 · 건강기능식품 기준 비교 (일반식품이면 수정 필요)' }
    ],

    // 한국 표현 → 미국 대안 20쌍 (R1~R12 기준). reviewer·reviewedAt은 규제 담당 검토 후 기록합니다.
    // us가 영어 문장이면 판정 엔진에서 PASS여야 합니다 (`node dev/test_parts.js`가 확인).
    // [확인 필요: …]는 제품 팩트시트로 채울 값입니다. 2026-10-23 초안
    // 시연본 10쌍 대조 (2026-10-23): 8쌍은 이 목록에 같은 뜻으로 있음. 없는 2쌍은 규제 담당 검토 뒤 추가 여부 결정
    //   '다음 날 개운하게' → 'Own your morning' (R1 암시) · '아시아 전통 숙취 해소 비법' → 'Loved in Korea for decades' (R1·R2,
    //   Purple Tree 경고장의 'used for centuries … hangover cure in Asia'와 비슷 · 'for decades'는 사실 확인 필요)
    mappings: [
      { ko: '숙취 해소', us: 'After-Party · Reset · Refresh', code: 'R2', reviewer: '', reviewedAt: '', note: "'Morning-After'는 미국에서 숙취·사후 피임약을 떠올려 쓰지 않음 (2026-10-24)" },
      { ko: '숙취 예방', us: 'Before the first toast.', code: 'R1', reviewer: '', reviewedAt: '', note: '예방·치료 효과 대신 섭취 시점만 말함' },
      { ko: '숙취 없는 아침', us: 'Start your morning fresh.', code: 'R2', reviewer: '', reviewedAt: '', note: '음주 이미지·해시태그와 함께 쓰지 않음 (AI 2차 판정 REVIEW 사례)' },
      { ko: '숙취해소제 · 숙취약', us: 'Korean after-party jelly', code: 'R7', reviewer: '', reviewedAt: '', note: '약이 아닌 식품 포맷 명칭' },
      { ko: '음주 전 섭취', us: "Korea's pre-toast ritual", code: '—', reviewer: '', reviewedAt: '', note: '정할 것 #1 (before drinking 차단 여부)' },
      { ko: '해독 · 디톡스', us: 'Light, fresh-tasting jelly', code: 'R1', reviewer: '', reviewedAt: '' },
      { ko: '피로 회복', us: 'A refreshing treat for your morning routine', code: 'R1', reviewer: '', reviewedAt: '', note: '몸 상태 개선 대신 맛·습관' },
      { ko: '간 보호', us: '삭제 · 라벨 확인 + 전문가 상담 안내', code: 'R3', reviewer: '', reviewedAt: '' },
      { ko: '부작용 없음 · 100% 안전', us: '삭제 · 알레르기 성분과 섭취 방법을 라벨대로 안내', code: 'R3', reviewer: '', reviewedAt: '' },
      { ko: '얼굴 빨개짐(홍조) 개선', us: '판매 문구에서 제외', code: 'R4', reviewer: '', reviewedAt: '' },
      { ko: '효과 100% 보장', us: 'Individually wrapped. Just tear and enjoy.', code: 'R5', reviewer: '', reviewedAt: '', note: '효과 대신 검증 가능한 사실' },
      { ko: '즉각적인 효과', us: 'Ready to go: just tear and enjoy.', code: 'R5', reviewer: '', reviewedAt: '', note: '빠른 효과 대신 간편한 포맷' },
      { ko: '기적의 젤리', us: 'Our signature Korean jelly', code: 'R5', reviewer: '', reviewedAt: '' },
      { ko: '마음껏 마셔도 OK', us: 'Part of the Korean after-party tradition', code: 'R6', reviewer: '', reviewedAt: '', note: '음주량·지속 언급 없이 문화로' },
      { ko: '의사가 개발한', us: 'Crafted in Korea', code: 'R7', reviewer: '', reviewedAt: '', note: '전문가 권위 대신 원산지 (사실 확인 후)' },
      { ko: '알코올 분해', us: 'Contains Hovenia dulcis extract.', code: 'R8', reviewer: '', reviewedAt: '', note: '기능 대신 성분 사실만' },
      { ko: '간 건강에 좋은', us: 'Made with Hovenia dulcis (oriental raisin tree) extract', code: 'R8', reviewer: '', reviewedAt: '' },
      { ko: '임상으로 입증', us: 'B2C에서는 삭제 · B2B 자료에서만 근거 문서와 함께', code: 'R9', reviewer: '', reviewedAt: '' },
      { ko: '리뷰 쓰면 증정', us: 'Tell us what you think.', code: 'R10', reviewer: '', reviewedAt: '', note: '후기에 대가를 걸지 않음 · 대가가 있으면 관계 표시' },
      { ko: 'Zero Sugar (Balance 2종)', us: 'Zero Sugar', code: 'R12', expect: 'COND', reviewer: '', reviewedAt: '', note: 'Jelly·Drink Balance에만 · Original과 브랜드 전체에는 당 표현 없음 · 당류 0.5 g 미만 측정 확인 · 1회 섭취 기준량·라벨 1회 제공량 둘 다 · PM 확인 2026-10-25 · Balance 제품 기준 PASS · "저당"과 섞어 쓰지 않음 · 라벨·광고 전 21 CFR 101.60 사람 확인' }
    ],

    // '기관 안내' 탭: 미국 규제 기관 4곳을 쉬운 말로 요약 (2026-10-23 작성 · 참고용, 공식 사이트로 확인)
    // goto: 이 대시보드에서 관련 내용을 볼 수 있는 탭 (단건 심의 single · 규칙 rules · 규제 모니터링 monitor)
    agencies: [
      {
        code: 'FDA', en: 'Food and Drug Administration', ko: '미국 식품의약국', icon: 'FDA',
        oneLine: '먹는 것과 약을 관리하는 기관입니다. 라벨과 광고 문구를 보고 우리 제품이 "식품"인지 "약"인지 판단합니다.',
        role: [
          '식품·의약품의 안전 기준과 표시(라벨) 규칙을 정하고 단속합니다.',
          '수입 식품을 국경에서 검사하고, 문제가 있으면 통관을 보류하거나 수입을 거부합니다.',
          '규칙을 어긴 회사에 경고장(Warning Letter)을 보내고, 위험한 제품의 리콜을 관리합니다.'
        ],
        forUs: [
          '"숙취 예방·해소"처럼 몸의 문제를 고친다는 표현을 쓰면 식품이 아니라 승인받지 않은 의약품으로 볼 수 있습니다 (2020년 숙취 제품 경고장 7건).',
          '영어 라벨(영양성분표·성분·알레르기)과 당 함량 표시 규칙을 지켜야 합니다. 미국에는 "Low sugar" 표시 기준이 없습니다.',
          '수출 전에 식품시설 등록, 선적할 때마다 사전 수입 신고(Prior Notice)가 필요합니다. 금액과 상관없이 모든 식품이 대상입니다 (FDA 규제 품목 소액 면세 폐지 2025-07-09).',
          '심각한 부작용이 생기면 Reportable Food Registry 보고 대상인지 판단해야 합니다 (CS → 부작용 접수).'
        ],
        risk: '경고장 · 통관 보류·수입 거부 · 리콜',
        bad: 'Prevents hangovers.', good: 'Part of the Korean after-party tradition.',
        rules: 'R1 · R2 · R3 · R4 · R7 · R8',
        goto: [['rules', '관련 규칙 보기'], ['monitor', 'openFDA 리콜 조회']],
        url: 'https://www.fda.gov/'
      },
      {
        code: 'FTC', en: 'Federal Trade Commission', ko: '미국 연방거래위원회', icon: 'FTC',
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
        bad: 'Get a free box for a 5-star review!', good: 'Cherry, lemon and lime jellies, individually wrapped.',
        rules: 'R5 · R9 · R10',
        goto: [['rules', '관련 규칙 보기'], ['single', '단건 심의로 가기']],
        url: 'https://www.ftc.gov/'
      },
      {
        code: 'CBP', en: 'U.S. Customs and Border Protection', ko: '미국 관세국경보호청 (세관)', icon: 'CBP',
        oneLine: '미국 국경의 세관입니다. 물건이 들어올 때 통관을 처리하고 관세를 걷습니다.',
        role: [
          '수입 물품의 통관을 처리하고 관세를 걷습니다.',
          '품목분류(HS 코드)와 원산지를 판정합니다. HS 코드가 관세율을 정합니다.',
          'FDA 같은 다른 기관의 수입 요건도 국경에서 함께 확인합니다.'
        ],
        forUs: [
          '젤리의 HS 코드는 고르는 것이 아니라 제품의 실제 형태·성분으로 정해집니다 (예상 2106.90.99 · README 7장).',
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
        code: 'USTR', en: 'Office of the United States Trade Representative', ko: '미국 무역대표부', icon: 'USTR',
        oneLine: '미국의 무역 협상 대표입니다. 나라와 나라 사이의 무역 협정과 관세 정책을 정합니다.',
        role: [
          '대통령 직속 기관으로 무역 협정을 협상하고 운영합니다 (한미 FTA = KORUS 포함).',
          '무역법 301조(Section 301) 같은 무역 조치와 추가 관세를 결정합니다.',
          '개별 회사나 제품을 단속하지는 않고, 나라 단위의 규칙을 바꿉니다.'
        ],
        forUs: [
          '한국산 제품에 붙는 관세율이 USTR 결정으로 바뀔 수 있고, 바뀌면 판매 가격과 마진에 영향을 줍니다.',
          '2026-07-24 이후 한국산 일반 상품의 추가 관세는 Section 301에 따라 기존 관세 포함 12.5% 상한으로 안내하는 자료가 많지만 10%로 적은 자료도 있고, 자동차·철강 등은 따로입니다 (2026-10-24 확인). 우리 제품의 확정 HTS 코드로 USTR 고시와 통관일·면제 여부를 관세사와 확인하세요.',
          'USTR 결정은 Federal Register에 공고되므로 규제 모니터링 탭에서 확인할 수 있습니다.'
        ],
        risk: '직접 제재는 없음 · 관세 변화로 가격·마진 영향',
        rules: '규칙 없음 (관세 정책 모니터링)',
        goto: [['monitor', 'USTR 공고 조회']],
        url: 'https://ustr.gov/'
      }
    ],

    // '기관 안내 → 광고 플랫폼': 정부 기관은 아니지만(사기업) 자기 광고 정책을 어기면 광고 거절·계정 제한 (2026-10-24 작성)
    // 법은 아니므로 근거 구분은 플랫폼 정책 · 정책은 자주 바뀌니 공식 페이지(url)로 확인
    platforms: [
      {
        code: 'Meta', ko: '페이스북 · 인스타그램 광고', icon: 'Meta',
        oneLine: '광고가 보는 사람의 특성(인종·건강 상태 등)을 단정하면 안 되고, 술을 언급하는 광고는 법과 업계 규약을 지켜야 합니다.',
        forUs: [
          "'Are you hungover?'처럼 보는 사람의 상태를 짚는 문구, 'Asian glow'처럼 인종·체질을 암시하는 문구는 '개인 특성' 정책에 걸릴 수 있습니다.",
          '음주 장면·술을 언급하는 광고는 술 광고 기준(나이 제한 타기팅, 업계 자율 규약)을 따라야 합니다.'
        ],
        risk: '광고 거절 · 계정 제한', rules: 'R4 · R6',
        url: 'https://transparency.meta.com/policies/ad-standards/'
      },
      {
        code: 'Google', ko: '구글 검색 · 유튜브 광고', icon: 'G',
        oneLine: '과음·폭음·음주 시합을 좋게 보이게 하는 광고와, 술로 건강·사회적 이득이 있다는 광고를 거절합니다.',
        forUs: ["'Drink all night'처럼 많이 마시는 것을 부추기는 표현은 '무책임한 음주 광고' 정책에 걸릴 수 있습니다."],
        risk: '광고 거절 · 경고 후 계정 정지', rules: 'R6',
        url: 'https://support.google.com/adspolicy/answer/16427712'
      },
      {
        code: 'TikTok', ko: '틱톡 광고', icon: 'TT',
        oneLine: '미국에서 술 광고는 받지만(25세 이상 타기팅), 숙취 해소 제품 광고는 받지 않는 것으로 알려져 있습니다 (2024 업계 보도 기준).',
        forUs: [
          '숙취 해소 제품으로 보이면 광고 자체가 거절될 수 있어, 틱톡에서는 숙취를 떠올리는 표현을 특히 피해야 합니다.',
          '과음 장면, 술의 효능 주장, 숙취 언급도 금지로 보도됨 → 공식 광고 정책 원문으로 다시 확인 필요.'
        ],
        risk: '광고 거절 · 브랜드 콘텐츠 삭제', rules: 'R2 · R6',
        url: 'https://ads.tiktok.com/help/'   // 광고 정책은 도움말 센터 › Advertising Policies
      },
      {
        code: 'Amazon', ko: '아마존 상세페이지', icon: 'AMZ',
        oneLine: '상세페이지에서 질병을 진단·치료·완화·예방한다는 주장을 금지하고, 성분 함량은 라벨과 같아야 합니다.',
        forUs: [
          '숙취 해소·간 보호 같은 표현은 상세페이지·검색 키워드 모두에서 빼야 합니다 (FDA 기준과 같음).',
          '성분·함량을 쓰면 라벨(영양·성분 표시)과 똑같아야 합니다 (2026-03-31부터 강화된 것으로 보도 · 건강기능식품 기준).'
        ],
        risk: '상품 비활성화 · 판매 계정 경고', rules: 'R1 · R2 · R3 · R13',
        url: 'https://sellercentral.amazon.com/help/hub/reference/external/G200164330'
      },
      // 2026-10-25 추가: Olive Young Global은 2026-05-29부터 미국 배송 중단 → 미국 판매는 별도 법인 Olive Young US
      // (us.oliveyoung.com · LA 매장 Pasadena·Century City, 영양제·간식 코너 있음). 입점 요구 서류는 공개되지 않아 알디콤 입점 담당에게 받아야 함
      {
        code: 'Olive Young', ko: '올리브영 US (온라인 · LA 매장)', icon: 'OY',
        oneLine: '미국 판매는 Olive Young US(us.oliveyoung.com)와 캘리포니아 매장입니다. Global 사이트는 2026-05-29부터 미국으로 배송하지 않습니다.',
        forUs: [
          "상품명·상세 문구도 같은 기준입니다. Global에 올라간 'Hangover Helper'·'Hangover Cure Stick' 같은 이름은 우리 규칙에서 상품명 자체가 BLOCK(R1·R2)이라, 같은 이름으로 US에 올리면 안 됩니다.",
          '올리브영은 별점과 상관없이 후기에 포인트를 줍니다(텍스트·사진 후기 적립). 이건 플랫폼 제도라 괜찮지만, 브랜드가 따로 "좋은 후기 쓰면 선물"을 붙이면 R10 위반입니다.',
          '매장이 캘리포니아에 있어 Prop 65(납 등 경고 문구) 대상이 될 수 있습니다. 2026년에도 수입 간식 판매점까지 함께 통지받은 사례가 많습니다 (규제 모니터링 수집 결과의 Prop 65 60일 통지에서 확인).',
          '입점 서류(식품시설 등록 · 영문 라벨 · 제조물 책임보험 증명 등)는 공개 자료가 없습니다 → 알디콤 입점 담당에게 받아 확인.'
        ],
        risk: '상품 등록 거절 · 판매 중단 · 매장(캘리포니아) Prop 65 통지', rules: 'R1 · R2 · R10 · R15',
        url: 'https://us.oliveyoung.com/'
      }
    ],

    // 규제 모니터링 출처 안내 (2026-10-24): 기관 · 통로(어디서 받나) · 방식 · 가져오는 정보(입력) · 대시보드에서 쓰는 곳(출력) · 필요한 키
    // id는 refresh.py SOURCES의 id와 같아야 함. agency가 'FDA·FTC'인 출처는 항목의 firm 앞부분(FDA/FTC)으로 기관을 나눔
    monitorSources: [
      { id: 'fda-warning-letters', range: '최근 1년 · 최대 80건 (본문 문구가 있는 경고장은 개수와 상관없이 남김)', agency: 'FDA', name: 'FDA 경고장', via: 'FDA Data Dashboard API (공식) · 직접 업로드', modes: ['auto', 'manual'],
        key: 'FDA_DASHBOARD_USER · FDA_DASHBOARD_KEY',
        gets: '식품 분야 경고장 목록 (회사 · 발행일 · 담당 부서 · 나라). 직접 올리면 경고장 제목과 본문 속 광고 문구까지',
        gives: '목록 · ‘새’ 경고장 표시 → 본문 문구는 사례집 후보 → 승인하면 경고장 사례·규칙 검증에 반영' },
      { id: 'fda-import-refusals', range: '최근 순 · 최대 40건 (같은 회사·날짜·품목은 한 줄)', agency: 'FDA', name: 'FDA 수입 거부 (한국산 식품)', via: 'FDA Data Dashboard API (공식)', modes: ['auto'],
        key: 'FDA_DASHBOARD_USER · FDA_DASHBOARD_KEY',
        gets: '한국산 식품이 미국 통관에서 거부된 기록 (회사 · 제품 · 거부일 · 사유 코드)',
        gives: '목록 · 거부 사유 뜻(FDA 공식 코드표로 풀어 씀) → 라벨·통관 준비 참고' },
      { id: 'openfda-food-recalls', range: '최근 1년 · 검색어 3개 × 30건 → 최대 40건', agency: 'FDA', name: '식품 리콜', via: 'openFDA API (FDA 공개 데이터 · food/enforcement)', modes: ['auto'],
        key: '없음 (막히면 OPENFDA_API_KEY)',
        gets: '젤리(구미)·숙취 + 한국산 음료 + 헛개 관련 식품 리콜 (제품 · 회사 · 리콜 등급 · 사유)',
        gives: '목록 · 한글 요약 → 비슷한 제품이 왜 리콜됐는지 참고' },
      { id: 'regulations-gov', range: '최근 1년 · 최대 30건 (FDA는 식품·표시 관련 제목만)', agency: 'FDA·FTC', name: '규칙 · 규칙안', via: 'Regulations.gov API', modes: ['auto'],
        key: 'REGULATIONS_GOV_API_KEY',
        gets: 'FDA(식품·표시·광고 관련)와 FTC가 낸 규칙·규칙안 (의견 접수 마감일)',
        gives: '목록 · 한글 요약 → 규칙 R1~R15를 고칠지 검토' },
      { id: 'federal-register', range: '최근 1년 · 기관별 40건 중 최대 30건 (FDA는 식품 관련 제목만)', agency: 'FDA·FTC', name: '관보 공고', via: 'Federal Register API', modes: ['auto'],
        key: '없음',
        gets: 'FTC 전체 공고 + FDA 식품 관련 공고 (제목 · 요약 · 종류)',
        gives: '목록 · 한글 요약 → 단속·지침 변화 확인' },
      { id: 'fda-gras', range: '원료 표의 원료별 최대 6건 (통과한 통지 먼저) · FDA 목록은 주 1회 새로 받음', agency: 'FDA', name: 'GRAS 통지 (원료 근거)', via: 'FDA GRAS Notices 공개 데이터베이스 · 데이터 내려받기 (2026-10-25)', modes: ['auto'],
        key: '없음',
        gets: '원료 이름·별칭이 들어간 GRAS 통지 (GRN 번호 · 물질 · 신청 회사 · FDA 답변 · 종결일 · 용도)',
        gives: '규칙·검증 › 원료 표의 "FDA GRAS 통지" 칸 · 통지가 없어도 자체 GRAS일 수 있어 "0건 = 사용 불가"는 아님 (회사 근거 문서로 확인)' },
      { id: 'cbp-cross', range: '기간 제한 없음 · 검색어 6개 × 최신 10건 → 최대 30건', agency: 'CBP', name: '품목분류 결정', via: 'CBP CROSS API', modes: ['auto'],
        key: '없음',
        gets: '젤리(HS 2106.90 · 구미) · 음료(HS 2202.10 · 2202.99 후보) · 헛개 관련 품목분류 결정 (HTS 코드)',
        gives: '목록 → HS 코드·관세 판단 참고 (최종은 관세사 확인)' },
      { id: 'courtlistener', range: '검색어 3개 × 15건 (2·3번째는 최근 1년) · 관련성은 사람이 확인', agency: '법원', name: '허위광고 판결', via: 'CourtListener API', modes: ['auto'],
        key: 'COURTLISTENER_TOKEN',
        gets: '숙취·건강식품·기능성 음료 · 저당 표시(low sugar·sugar free) 허위광고 판결 검색 결과',
        gives: '참고 목록 (관련성은 사람이 확인)' },
      // 2026-10-26: 예전 '사람이 확인' 바로가기 4곳 → Firecrawl로 자동 수집 (주소 1개 = 약 1 크레딧 · 인사이트 Weee!와 월 1,000 같이 씀)
      { id: 'nad-decisions', range: '결정 요약 목록 첫 쪽 (최신 약 10건) · NAD·NARB만', agency: 'NAD', name: 'NAD 광고 심의 결정', via: 'BBB National Programs 결정 요약 (Firecrawl)', modes: ['auto'],
        key: 'FIRECRAWL_API_KEY',
        gets: '광고 자율 심의 결정 요약 (날짜 · 회사 · 문제 된 광고 문구). 결정문 전문은 유료라 요약만',
        gives: '목록 · 식품·음료·건강 결정의 따옴표 문구는 사례집 후보 → 지금 규칙이 잡는지 보고 승인하면 사례집·규칙 검증에 반영' },
      { id: 'ftc-press', range: '보도자료 첫 쪽 (최신 20건) 중 제목에 광고·후기·건강·식품이 있는 것', agency: 'FTC', name: 'FTC 보도자료', via: 'ftc.gov 보도자료 목록 (Firecrawl)', modes: ['auto'],
        key: 'FIRECRAWL_API_KEY',
        gets: '광고·후기·인플루언서·건강 광고 단속 소식 (제목 · 날짜 · 요약)',
        gives: '목록 · 한글 요약 → 규칙(R10 후기 등)을 고칠지 검토 · 공식 규칙·공고는 Federal Register' },
      { id: 'prop65-notices', range: '주 1회 · gummy·jelly·candy 검색 × 최신 20건 · 최근 1년 · 대마 제품은 뺌', agency: 'CA', name: 'Prop 65 60일 통지', via: '캘리포니아 법무부 60일 통지 검색 (Firecrawl)', modes: ['auto'],
        key: 'FIRECRAWL_API_KEY',
        gets: '비슷한 제품(젤리·구미·사탕)이 경고 문구 없이 통지받은 사례 (제품 · 물질 · 회사 · 통지 PDF)',
        gives: '목록 → 라벨 경고 문구·원료(납 등) 점검 참고 · 문구 판정과는 관계없음' },
      { id: 'oliveyoung-policy', range: '주 1회 · 회원 정책 1쪽', agency: '플랫폼', name: '올리브영 US 회원 정책', via: 'us.oliveyoung.com 약관 (Firecrawl)', modes: ['auto'],
        key: 'FIRECRAWL_API_KEY',
        gets: '약관 갱신일(Last Updated) · 후기 작성 적립 문장',
        gives: '갱신일이 바뀌면 ‘새’ 표시 · 기준·참고 › 기관·플랫폼의 올리브영 카드에 갱신일 표시 → 후기 이벤트를 따로 붙여도 되는지 (R10)' }
    ],
    // range: 가져오는 범위 — 모든 결과가 아니라 '최근 최대 N건'임을 화면에 밝힘 (GPT 검토 ⑰ · 기간은 REFRESH_LOOKBACK_DAYS 기본 365일)
    // 수집 항목에 붙이는 우리 제품군 태그 (2026-10-24). 제목·회사·요약·한글 요약에서 찾음 · 어느 것도 아니면 '공통'
    // 동물 사료·음용수 같은 공고는 우리 제품이 아니므로 제품군 태그를 붙이지 않음
    monitorTagSkip: 'animal|livestock|veterinar|pet food|\\bfeed\\b|동물|사료|가축',
    monitorProductTags: [
      { id: 'jelly', ko: '젤리', re: 'jelly|konjac|gumm|confection|candy|\\b2106\\.90|젤리|곤약|구미|사탕|과자' },
      { id: 'drink', ko: '음료', re: 'beverage|drink|juice|\\b2202\\.|음료|주스|드링크' },
      { id: 'sugar', ko: '당·저당', re: 'sugar|sweeten|nutrition|healthy|calorie|설탕|당류|저당|무설탕|감미|영양' },
      { id: 'hangover', ko: '숙취·성분', re: 'hangover|hovenia|raisin tree|alcohol|dihydromyricetin|\\bDHM\\b|after[\\s-]party|숙취|헛개|알코올|음주' }
    ],

    monitorAgencies: [
      { code: 'FDA', ko: '미국 식품의약국' }, { code: 'FTC', ko: '미국 연방거래위원회' },
      { code: 'CBP', ko: '미국 관세국경보호청' }, { code: '법원', ko: '미국 법원 판결' },
      { code: 'NAD', ko: '광고 자율 심의 (BBB National Programs)' }, { code: 'CA', ko: '캘리포니아 Prop 65' },
      { code: '플랫폼', ko: '판매 플랫폼 정책' }
    ],

    // 규제 모니터링: 서버가 자동으로 못 읽는 곳 (2026-10-24 확인) → 화면의 바로가기 버튼으로 사람이 확인
    // 자동 수집되는 곳(FDA 경고장·수입 거부·리콜, CBP CROSS, Federal Register, Regulations.gov, CourtListener)은 refresh.py
    // 2026-10-26: NAD · FTC 보도자료 · Prop 65 60일 통지 · 올리브영 회원 정책은 Firecrawl 자동 수집으로 옮김 (monitorSources)
    // 2026-10-25: 수입 경보 33-15(곤약 젤리) 바로가기는 뺌 — 우리 젤리는 곤약이 아닌 구미형 (담당 확인)
    manualChecks: [
      { name: 'Prop 65 물질 목록 (OEHHA)', url: 'https://oehha.ca.gov/proposition-65/proposition-65-list/', why: '원료와 맞춰 보는 기준을 아직 정하지 않음 (이름만 같다고 해당이라 할 수 없음 · 시험 성적서 필요)',
        what: '납 등 경고 문구가 필요한 물질 목록 갱신일 · 원료(젤리 원료·색소)가 목록에 있는지' }
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
    ],

    // 원료 표 (2026-10-25) — 단건·일괄 심의가 원료 문장을 판정하는 기준. 원료가 확정되면 status만 'confirmed'로 바꾸고
    // `node tabs/compliance/tools/export_server_rules.js`로 서버 규칙을 다시 만듭니다 (CS 재점검도 같은 기준).
    //   confirmed 확정: 원료 이름·들어 있다는 사실 문장은 PASS. 강조(packed with·듬뿍)·효과·특허 표현은 계속 점검
    //   candidate 후보: 아직 확정 아님 → 이름이 나오면 R15 '미확정 정보' 검토 필요
    //   avoid 금지: 넣지 않기로 한 성분 → R13 '숙취 연상 성분' 검토 필요
    // en·ko: 문구에서 찾을 이름 (영어는 하이픈·띄어쓰기·복수형 차이를 함께 잡음 · 한국어는 포함 여부)
    ingredients: [
      { id: 'hovenia', status: 'confirmed', jelly: 'cond', drink: 'cond', name: '헛개나무 열매 · 추출물 (Hovenia dulcis)',
        en: ['Hovenia dulcis fruit extract', 'Hovenia dulcis extract', 'Hovenia dulcis fruit', 'Hovenia dulcis', 'Hovenia fruit extract', 'Hovenia extract', 'raisin tree fruit', 'raisin tree extract', 'Japanese raisin tree', 'oriental raisin tree'],
        ko: ['헛개나무 열매 추출물', '헛개나무열매 추출물', '헛개나무 열매', '헛개나무열매', '헛개나무 추출물', '헛개 추출물', '헛개나무', '헛개'],
        source: '브랜드 가이드 v1.1 12장 공통 원료 · 함량 미제공', note: '미국 일반식품 원료 근거(GRAS) 확인 필요 — 알디콤', gras: 'FDA 공개 통지 0건 · 알디콤 근거 문서 확인 불가 (2026-10-25 · 출시 전 확인 필요)' },
      { id: 'l-fermentum', status: 'confirmed', jelly: 'cond', drink: 'cond', name: '유산균 Lactobacillus fermentum',
        en: ['Lactobacillus fermentum', 'Limosilactobacillus fermentum', 'L. fermentum'], ko: ['락토바실러스 퍼멘텀', '유산균'],
        source: '브랜드 가이드 v1.1 12장 (A-HAT 구성)', note: "균주명·근거 확인 필요 · 산성 음료에서는 살아남기 어려움(열처리균 여부 확인) · 'probiotic' 같은 기능 범주어는 계속 검토", gras: '통지된 균주: LfQi6 (GRN 988) · CECT5716 (GRN 531) — 우리 균주 미확인 (2026-10-25)' },
      { id: 'a-hat', status: 'confirmed', jelly: 'cond', drink: 'cond', name: 'A-HAT (알디콤 조성물)', en: ['A-HAT'], ko: ['A-HAT'],
        source: '브랜드 가이드 v1.1 12장 (헛개 추출물 + L. fermentum)', note: "성분표에는 실제 원료 이름으로 적음 · 'patented'(특허)는 R15 검토 (특허 범위 미검증)", gras: '헛개 추출물(공개 GRAS 통지 0건)과 L. fermentum(균주 미확인)으로 구성 → 두 원료 근거가 확인돼야 사용 (2026-10-25 검토 반영)' },
      // 후보: 같은 종류 제품에 흔한 원료 (확정 아님)
      { id: 'turmeric', status: 'candidate', jelly: 'ok', name: '강황·울금 (커큐민)', en: ['turmeric', 'curcumin'], ko: ['강황', '울금', '커큐민'], note: '향신료는 GRAS · 젤리 노랑(레몬) 색을 내는 용도는 가능 · 고농도 추출물을 기능 원료로 쓰면 따로 확인', cfr: '21 CFR 182.10 (향신료) · 73.600 (색소)' },
      { id: 'ginger', status: 'candidate', jelly: 'cond', drink: 'ok', name: '생강', en: ['ginger'], ko: ['생강'], note: 'GRAS 향신료', cfr: '21 CFR 182.10 · 182.20 (향신료·정유 GRAS)' },
      { id: 'jujube', status: 'candidate', name: '대추', en: ['jujube'], ko: ['대추'], note: '과일 식품' },
      { id: 'goji', status: 'candidate', name: '구기자', en: ['goji berry', 'goji', 'wolfberry'], ko: ['구기자'], note: '과일 식품' },
      { id: 'licorice', status: 'candidate', drink: 'cond', name: '감초', en: ['licorice', 'liquorice'], ko: ['감초'], note: 'GRAS · 글리시리진 양 제한 (음료에 쓸 때 양 확인)', cfr: '21 CFR 184.1408 (감초 GRAS · 양 제한)' },
      { id: 'pear', status: 'candidate', name: '배즙', en: ['pear juice', 'Korean pear'], ko: ['배즙'], note: '일반 과즙' },
      { id: 'maesil', status: 'candidate', name: '매실', en: ['green plum', 'maesil'], ko: ['매실'], note: '일반 과일' },
      { id: 'ginseng', status: 'candidate', name: '홍삼·인삼', en: ['red ginseng', 'ginseng'], ko: ['홍삼', '인삼'], note: '양·근거 확인' },
      { id: 'green-tea', status: 'candidate', name: '녹차 추출물', en: ['green tea extract'], ko: ['녹차 추출물', '녹차추출물'], note: '고농도 카테킨은 간 관련 안전 이슈 · 양 주의' },
      { id: 'kudzu', status: 'candidate', name: '칡(갈근) 추출물', en: ['kudzu', 'pueraria'], ko: ['칡', '갈근'], note: '추출물은 근거 확인 필요' },
      { id: 'alder', status: 'candidate', name: '오리나무 추출물', en: ['alder'], ko: ['오리나무'], note: '미국 식품 원료 근거가 거의 없음 → 피하는 쪽 권장' },
      { id: 'taurine', status: 'candidate', jelly: 'cond', drink: 'cond', name: '타우린', en: ['taurine'], ko: ['타우린'], note: '미국 음료에 흔함 · 효능 표현 금지' },
      { id: 'vitamins', status: 'candidate', jelly: 'cond', drink: 'cond', name: '비타민 C·B군', en: ['vitamin C', 'vitamin B6', 'vitamin B12', 'B vitamins'], ko: ['비타민 C', '비타민C', '비타민 B', '비타민B'], note: '함량 강조는 영양소 표시 규칙(R13)' },
      { id: 'electrolytes', status: 'candidate', name: '전해질 (나트륨·칼륨)', en: ['electrolytes'], ko: ['전해질'], note: '일반 성분' },
      // 2026-10-25 기본 원료 (배합안 · 심의 규칙과 무관 → status 'base') — FDA GRAS 통지·규정 확인용으로 표에 둠
      { id: 'allulose', status: 'base', jelly: 'ok', drink: 'ok', name: '알룰로스 (D-psicose)', en: ['allulose', 'D-psicose'], ko: ['알룰로스'], note: 'FDA 지침상 총당류·첨가당에 넣지 않음 (0.4 kcal/g) · Balance 당 0.5 g 미만 설계' },
      { id: 'stevia', status: 'base', jelly: 'ok', drink: 'ok', name: '스테비아 (Reb M)', en: ['stevia', 'rebaudioside M'], ko: ['스테비아'], note: '고순도 스테비올 배당체' },
      { id: 'monk-fruit', status: 'base', jelly: 'ok', drink: 'ok', name: '나한과 (monk fruit)', en: ['monk fruit', 'luo han guo'], ko: ['나한과'], note: '감미료 대안' },
      { id: 'soluble-fiber', status: 'base', jelly: 'ok', name: '수용성 옥수수 섬유 (resistant dextrin)', en: ['soluble corn fiber', 'resistant dextrin'], ko: ['수용성 식이섬유'], note: '구미 식감·몸체 · 섬유 강조 문구는 쓰지 않음 (R13)' },
      { id: 'pectin', status: 'base', jelly: 'ok', name: '펙틴', en: ['pectin'], ko: ['펙틴'], cfr: '21 CFR 184.1588 (GRAS)', note: '구미 겔화제 · 곤약 대신' },
      { id: 'sucralose', status: 'base', jelly: 'ok', drink: 'ok', name: '수크랄로스', en: ['sucralose'], ko: ['수크랄로스'], cfr: '21 CFR 172.831 (승인 감미료 · GRAS 통지 대상 아님)', note: '감미료 대안' },
      { id: 'spirulina', status: 'base', jelly: 'ok', name: '스피루리나 추출물 (색소)', en: ['spirulina extract'], ko: ['스피루리나'], cfr: '21 CFR 73.530 (색소 · 사탕 등 허용)', note: '라임 연두색 (강황과 섞음)' },
      // 2026-10-25 음료 검토 (참고: 국내 헛개 음료 100 mL 원재료) — drink: ok 바로 사용 가능 · cond 조건부 · no 쓰지 않음
      { id: 'citrus-peel', status: 'candidate', drink: 'ok', name: '귤껍질 (진피)', en: ['citrus peel', 'tangerine peel', 'orange peel'], ko: ['귤껍질', '진피'], note: '식품 원료' },
      { id: 'rice-germ', status: 'candidate', drink: 'cond', name: '미배아발효추출물 (미강·쌀눈·대두펩타이드)', en: ['rice germ extract', 'rice bran extract', 'fermented rice germ'], ko: ['미배아', '미강', '쌀눈'], note: '발효 추출물 GRAS 근거 확인 · 대두 포함 → 라벨에 "Contains: Soy" 의무' },
      { id: 'dl-alanine', status: 'candidate', drink: 'cond', name: 'DL-알라닌', en: ['DL-alanine', 'alanine'], ko: ['알라닌'], note: '미국은 쓸 수 있는 용도가 제한된 첨가물 → 용도·양 확인' },
      { id: 'atractylodes', status: 'avoid', jelly: 'no', drink: 'no', name: '창출 (모창출 뿌리줄기)', en: ['atractylodes'], ko: ['창출'], note: '한약재 · 미국 일반식품 원료 근거 거의 없음' },
      { id: 'astragalus', status: 'avoid', jelly: 'no', drink: 'no', name: '황기 추출물', en: ['astragalus'], ko: ['황기'], note: '미국에서는 건강기능식품 원료 · 일반식품 근거 없음' },
      // 2026-10-25 구미 검토 (참고: 미국 '술 마시기 전' 구미 = 건강기능식품 라벨) — jelly: ok · cond · no
      { id: 'zinc', status: 'candidate', jelly: 'cond', name: '아연 (Zinc citrate)', en: ['zinc'], ko: ['아연'], note: '영양 강화 정책(21 CFR 104.20)상 사탕·간식에 넣는 것은 적절하지 않다고 봄 · %DV 표시 의무' },
      { id: 'magnesium', status: 'candidate', jelly: 'cond', drink: 'cond', name: '마그네슘 (구연산·산화마그네슘)', en: ['magnesium'], ko: ['마그네슘'], note: 'GRAS지만 영양 강화 정책·%DV 표시 문제는 아연과 같음' },
      // 2026-10-25 젤리 검토 (참고: 미국 스틱 젤리 = 건강기능식품 라벨)에서 나온 금지 — 제품과 상관없이 일반식품에 쓰지 않음
      { id: 'konjac', status: 'avoid', jelly: 'no', drink: 'no', name: '곤약', en: ['konjac', 'glucomannan'], ko: ['곤약', '글루코만난'], note: '우리 젤리는 곤약이 아닌 구미형 · 곤약 젤리는 FDA 수입 경보 33-15 대상' },
      { id: 'folic-acid', status: 'avoid', jelly: 'no', drink: 'no', name: '엽산 (Folic acid)', en: ['folic acid'], ko: ['엽산'], note: '일반식품에 넣을 수 있는 식품이 정해져 있음 (21 CFR 172.345) · 젤리·음료는 해당 없음', cfr: '21 CFR 172.345 (넣을 수 있는 식품이 정해져 있음)' },
      { id: 'artichoke', status: 'avoid', jelly: 'no', drink: 'no', name: '아티초크 잎 추출물', en: ['artichoke extract', 'artichoke leaf'], ko: ['아티초크'], note: '건강기능식품용 식물 원료 · 간 건강 이미지' },
      // 금지: 넣지 않기로 한 성분
      { id: 'dhm', status: 'avoid', jelly: 'no', drink: 'no', name: 'DHM (디하이드로미리세틴)', en: ['dihydromyricetin', 'DHM'], ko: ['디하이드로미리세틴'], note: '2020 FDA 숙취 경고장이 숙취 예방 성분 광고로 인용' },
      { id: 'nac', status: 'avoid', jelly: 'no', drink: 'no', name: 'NAC (N-아세틸시스테인)', en: ['N-acetylcysteine', 'N-acetyl cysteine', 'NAC'], ko: ['N-아세틸시스테인', '아세틸시스테인'], note: 'FDA는 의약품 성분으로 봄 → 일반식품에 넣을 수 없음' },
      { id: 'milk-thistle', status: 'avoid', jelly: 'no', drink: 'no', name: '밀크시슬 (실리마린)', en: ['milk thistle', 'silymarin'], ko: ['밀크시슬', '실리마린'], note: '간 보호 이미지 · 일반식품 근거 필요' },
      { id: 'glutathione', status: 'avoid', jelly: 'no', drink: 'no', name: '글루타치온', en: ['glutathione'], ko: ['글루타치온'], note: '미국 일반식품 근거가 약함' }
    ]
  };

  // 원료 표 → 규칙 연결 (2026-10-25). 브라우저 판정·서버 재검사(export_server_rules.js)가 같은 결과를 쓰도록 여기서 규칙을 만듦
  //   확정: 이름만 나오면 걸리지 않음 (R13의 'A-HAT'·'lactobacillus'·'유산균'처럼 확정 원료 이름에 든 일반 용어도 뺌)
  //         강조(packed with·듬뿍)·효과(간 건강·다음 날 가뿐)·특허(R15)는 다른 규칙이 계속 잡음
  //   후보 → R15 검토 필요 · 금지 → R13 검토 필요
  (function wireIngredients(C) {
    const pick = st => C.ingredients.filter(x => x.status === st);
    const flat = (list, k) => [].concat(...list.map(x => x[k] || []));
    const r13 = C.rules.find(r => r.code === 'R13');
    const r15 = C.rules.find(r => r.code === 'R15');
    const okNames = flat(pick('confirmed'), 'en').concat(flat(pick('confirmed'), 'ko')).map(n => n.toLowerCase());
    const covered = t => okNames.some(n => n.includes(t.toLowerCase()));
    r13.terms = r13.terms.filter(t => !covered(t)).concat(flat(pick('avoid'), 'en'));
    r13.ko = r13.ko.filter(t => !covered(t)).concat(flat(pick('avoid'), 'ko'));
    r15.terms = r15.terms.concat(flat(pick('candidate'), 'en'));
    r15.ko = r15.ko.concat(flat(pick('candidate'), 'ko'));
  })(NS.compliance);

  /* 화면에 보이는 말 3층 (2026-10-26): ① say = 한 줄 결론(20자 안팎) · ② todo = 할 일 1~3개(동사로 시작)
     ③ 근거는 기존 reason · legalNote · law · forUs 그대로 (화면에서 접힘). 새 사실을 쓰지 않고 기존 글을 줄이기만 함
     키: 규칙 code · 기관 code · 플랫폼 code. 없으면 화면이 기존 reason·oneLine을 씀 */
  NS.compliance.plain = {
    rules: {
      R1: { say: '병을 고친다고 하면 못 써요', todo: ['먹는 때·맛·형태만 말하기', "'예방·치료·완화' · '두통·메스꺼움 해소' 빼기"] },
      R2: { say: '숙취를 직접 말하면 못 써요', todo: ['After-Party · Reset · Refresh 같은 말로 바꾸기', "'the morning after'도 빼기", 'Recovery · Revive 같은 회복 단어 피하기'] },
      R3: { say: "'간 보호' · '100% 안전'은 못 써요", todo: ["'라벨 확인 + 전문가 상담' 안내로 바꾸기"] },
      R4: { say: '홍조 · ALDH2는 판매 문구에 못 써요', todo: ['홍조 · 체질 이야기 빼기'] },
      R5: { say: '효과를 장담하려면 근거가 있어야 해요', todo: ['용량 · 포장 · 맛 같은 사실로 바꾸기', '그대로 쓰려면 근거 자료로 검토 요청'] },
      R6: { say: '음주를 부추기는 말은 고쳐 주세요', todo: ['마시는 양 · 계속 마시기 이야기 빼기'] },
      R7: { say: '약처럼 보이는 이름은 고쳐 주세요', todo: ['jelly · drink 같은 식품 이름 쓰기', '애매하면 검토 요청'] },
      R8: { say: '몸의 기능을 말하려면 근거가 있어야 해요', todo: ['빼거나 영양 성분 사실만 쓰기', '영양 근거가 있으면 검토 요청'] },
      R9: { say: '시험 결과를 말하려면 근거가 있어야 해요', todo: ['광고 · SNS에서는 빼기', '바이어 자료에는 시험 보고서와 함께 검토 요청'] },
      R10: { say: '후기도 같은 기준으로 심의해요', todo: ['후기 문장도 걸리는 표현이 없는지 보기', '대가를 받았으면 #ad처럼 표시하기', '좋은 후기를 조건으로 보상하지 않기'] },
      R11: { say: "'low sugar' · 저당은 못 써요", todo: ["Balance면 'Zero Sugar'만 쓰기", 'Original은 당 표현 없이 맛 · 포장만'] },
      R12: { say: "'Zero Sugar'는 Balance에만 써요", todo: ['제품을 Balance로 고르기', "'Not a low calorie food'를 함께 표시하기", '당 · 칼로리 숫자는 쓰지 않기'] },
      R13: { say: '성분은 들어 있다는 사실만 써요', todo: ["'Contains Hovenia dulcis fruit extract.'처럼 쓰기", "'rich in · high in' 빼기", '함량을 내세우려면 함량 자료로 검토 요청'] },
      R14: { say: "'FDA 승인 · 인증'은 사실이 아니라 못 써요", todo: ['원산지 · 포장 · 성분 같은 사실로 바꾸기'] },
      R15: { say: '확정되지 않은 정보는 확인하고 써요', todo: ['확정된 맛 · 모양 · 포장만 쓰기', '특허 · 인증 · 제휴는 증빙과 함께 검토 요청'] }
    },
    agencies: {
      FDA: { say: '식품인지 약인지 판단하는 기관이에요', todo: ["'숙취 예방 · 해소'라고 쓰지 않기", '영어 라벨 · 당 표시 규칙 지키기', '선적할 때마다 사전 수입 신고하기'] },
      FTC: { say: '광고에 근거가 있는지 보는 기관이에요', todo: ["근거 없이 'clinically proven' 쓰지 않기", '협찬 게시물에 #ad 표시하기', '좋은 후기를 조건으로 보상하지 않기'] },
      CBP: { say: '통관과 관세를 맡는 세관이에요', todo: ['제품 형태 · 성분에 맞는 HS 코드로 신고하기', '애매하면 사전 품목분류 받기', "'Made in Korea' 원산지 표시하기"] },
      USTR: { say: '관세 정책을 정하는 곳이에요', todo: ['관세 변화를 가격 · 마진에 반영하기', '확정 HTS 코드로 관세사와 확인하기', '규제 모니터링에서 공고 확인하기'] }
    },
    platforms: {
      Meta: { say: '보는 사람의 상태 · 인종을 짚으면 거절돼요', todo: ["'Are you hungover?' 같은 질문 빼기", "'Asian glow' 같은 체질 암시 빼기", '술 장면은 나이 제한 타기팅하기'] },
      Google: { say: '과음을 부추기면 광고가 거절돼요', todo: ["'Drink all night' 같은 표현 빼기"] },
      TikTok: { say: '숙취 제품으로 보이면 광고를 안 받아요', todo: ['숙취를 떠올리는 표현 특히 피하기', '집행 전에 공식 정책 원문 확인하기'] },
      Amazon: { say: '상세페이지 · 키워드 모두 FDA 기준과 같아요', todo: ['숙취 해소 · 간 보호를 키워드에서도 빼기', '성분 · 함량은 라벨과 똑같이 쓰기'] },
      'Olive Young': { say: 'US 사이트 · LA 매장 모두 같은 기준이에요', todo: ["'Hangover'가 들어간 상품명 쓰지 않기", "'좋은 후기 쓰면 선물' 붙이지 않기", '입점 서류는 알디콤 담당에게 받기'] }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
