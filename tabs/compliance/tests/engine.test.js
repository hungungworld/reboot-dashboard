/* 컴플라이언스 판정 엔진 확인 (인터넷·브라우저 없이) — GitHub 자동 테스트가 `node tabs/compliance/tests/engine.test.js`로 실행.
   규칙(data.js)을 고친 뒤 아래 중 하나라도 어긋나면 실패합니다.
   ① FDA 경고장 원문 87개 중 PASS 0개 (놓친 표현 없음)   ② 안전 문구는 모두 PASS (오탐 없음)
   ③ 자체 점검 예문 · 일괄 심의 더미 20개는 예상 판정대로   ④ 표현 매핑의 영어 대안은 PASS
   ⑤ CS 답변 템플릿 C1~C10은 BLOCK 없음   ⑥ '전체 채널·전체 제품'은 가장 엄격한 판정 */
'use strict';
const assert = require('assert');
const path = require('path');

const api = {};
global.window = global;
global.REBOOT = {
  store: () => ({ get: () => null, set: () => {}, remove: () => {}, keys: () => [] }),
  register: () => {},
  expose: (id, o) => { if (id === 'compliance') Object.assign(api, o); },
  use: () => ({}),
  user: () => ({}),
  ui: {}
};
const here = p => path.join(__dirname, p);
require(here('../static/data.js'));
require(here('../static/compliance.js'));
require(here('../../cs/static/data.js'));
const C = global.REBOOT_DATA.compliance;
const CS = global.REBOOT_DATA.cs;

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const verdict = (text, opts) => api.review(text, opts || {}).verdict;

check('경고장 원문 87개 중 PASS 0개', () => {
  assert.strictEqual(C.warningQuotes.length, 87, `경고장 문구 수 ${C.warningQuotes.length}`);
  const missed = C.warningQuotes.filter(q => verdict(q.text, { channel: 'b2c' }) === 'PASS').map(q => q.text);
  assert.deepStrictEqual(missed, [], `규칙이 놓친 문구: ${missed.join(' | ')}`);
});

check('안전 문구는 모두 PASS', () => {
  const bad = C.safePhrases.concat(C.humanReviewPhrases || []).filter(p => verdict(p.text, { channel: 'b2c' }) !== 'PASS').map(p => p.text);
  assert.deepStrictEqual(bad, [], `잘못 걸린 안전 문구: ${bad.join(' | ')}`);
});

check('자체 점검 예문은 예상 판정대로', () => {
  const bad = C.selfTest.filter(t => verdict(t.text, t) !== t.expect).map(t => `${t.text} → ${verdict(t.text, t)} (예상 ${t.expect})`);
  assert.deepStrictEqual(bad, [], bad.join(' | '));
});

check('원료 표: 확정 원료 사실 문장은 PASS · 후보·금지는 REVIEW · 후보를 확정으로 바꾸면 PASS', () => {
  const fs = require('fs');
  const vm = require('vm');
  const sentence = x => `Contains ${x.en[0]}.`;
  const wrong = C.ingredients.filter(x => verdict(sentence(x)) !== (x.status === 'confirmed' || x.status === 'base' ? 'PASS' : 'REVIEW')).map(x => `${x.id}(${x.status}) → ${verdict(sentence(x))}`);
  assert.deepStrictEqual(wrong, [], wrong.join(' | '));
  // data.js에서 status 한 줄만 바꿔 다시 불러오면 판정이 바뀌는지 (원료 확정 시나리오)
  const box = { api: {} };
  box.window = box;
  box.REBOOT = { store: () => ({ get: () => null, set() {}, remove() {}, keys: () => [] }), register() {},
    expose: (id, o) => { if (id === 'compliance') Object.assign(box.api, o); }, use: () => ({}), user: () => ({}), ui: {} };
  vm.createContext(box);
  const src = fs.readFileSync(here('../static/data.js'), 'utf8').replace("{ id: 'turmeric', status: 'candidate'", "{ id: 'turmeric', status: 'confirmed'");
  vm.runInContext(src, box);
  vm.runInContext(fs.readFileSync(here('../static/compliance.js'), 'utf8'), box);
  assert.strictEqual(box.api.review('Contains turmeric.', {}).verdict, 'PASS');
  assert.strictEqual(box.api.review('Packed with turmeric.', {}).verdict, 'REVIEW');
  assert.strictEqual(box.api.review('Turmeric supports liver health.', {}).verdict, 'REVISE');
});

check('일괄 심의 더미 30개는 예상 판정대로 · 판정별 6개씩 (예시 영어 · 줄마다 채널·제품·기준)', () => {
  assert.strictEqual(C.batchSample.length, 30);
  const opts = x => ({ channel: x.channel, product: x.product, category: x.category || 'FOOD' });
  const bad = C.batchSample.filter(x => verdict(x.copy, opts(x)) !== x.expect)
    .map(x => `${x.copy} → ${verdict(x.copy, opts(x))} (예상 ${x.expect})`);
  assert.deepStrictEqual(bad, [], bad.join(' | '));
  // 한국어 원문 판정과 합쳐도(더 엄격한 쪽) 예상과 같아야 함 → AI 번역이 달라도 결과가 흔들리지 않게
  const R = { PASS: 0, COND: 1, REVIEW: 2, REVISE: 3, BLOCK: 4 };
  const mixed = C.batchSample.filter(x => { const a = verdict(x.copy, opts(x)), k = verdict(x.ko, opts(x)); return (R[k] > R[a] ? k : a) !== x.expect; })
    .map(x => x.ko);
  assert.deepStrictEqual(mixed, [], `한국어와 합치면 달라지는 줄: ${mixed.join(' | ')}`);
  const count = {};
  C.batchSample.forEach(x => { count[x.expect] = (count[x.expect] || 0) + 1; });
  assert.deepStrictEqual(count, { PASS: 6, BLOCK: 6, REVIEW: 6, REVISE: 6, COND: 6 });
  assert.ok(C.batchSample.every(x => /[가-힣]/.test(x.ko)), '더미 문구는 한국어(ko)가 있어야 함');
});

check('표현 매핑의 영어 대안은 PASS', () => {
  const bad = C.mappings.filter(m => /^[A-Za-z]/.test(m.us) && verdict(m.us, { channel: 'b2c' }) !== (m.expect || 'PASS')).map(m => m.us);   // Zero Sugar는 조건부(COND)
  assert.deepStrictEqual(bad, [], bad.join(' | '));
});

check('CS 답변 템플릿 C1~C10은 BLOCK 없음', () => {
  const bad = CS.types.filter(t => verdict([].concat(t.template).join('\n'), { channel: 'cs' }) === 'BLOCK').map(t => t.code);
  assert.deepStrictEqual(bad, [], `BLOCK 템플릿: ${bad.join(', ')}`);
});

check("'전체 채널·전체 제품'은 가장 엄격한 판정 + 조합 8개 (B2C·B2B × 제품 4)", () => {
  const r = api.review('Clinically tested formula.', { channel: 'all', product: 'all' });
  assert.strictEqual(r.verdict, 'REVISE');
  assert.strictEqual(r.variants.length, 8);
  assert.ok(r.variants.some(v => v.channel === 'b2b' && v.verdict === 'REVIEW'), 'B2B는 REVIEW');
  assert.strictEqual(verdict('Say goodbye to hangovers.', { channel: 'all', product: 'all' }), 'BLOCK');
});

check('규칙마다 근거 조문(law)이 있음', () => {
  const none = C.rules.filter(r => !(r.law || []).length).map(r => r.code);
  assert.deepStrictEqual(none, [], `근거 조문 없는 규칙: ${none.join(', ')}`);
});

check('규제 모니터링 제품군 태그 (젤리·음료·당·숙취)', () => {
  const tags = text => C.monitorProductTags.filter(t => new RegExp(t.re, 'i').test(text)).map(t => t.id);
  assert.deepStrictEqual(tags('Konjac jelly cups'), ['jelly']);
  assert.deepStrictEqual(tags('HTS 2202.99.9000'), ['drink']);
  assert.deepStrictEqual(tags('저당 음료 표시'), ['drink', 'sugar']);
  assert.deepStrictEqual(tags('Hovenia dulcis extract'), ['hangover']);
  assert.deepStrictEqual(tags('Rules of Practice'), []);
  assert.deepStrictEqual(tags('HTS 2106.90.9997'), ['jelly']);
  assert.ok(new RegExp(C.monitorTagSkip, 'i').test('Food Additives Permitted in Feed and Drinking Water of Animals'), '동물 사료 공고는 태그 제외');
});

check('당류 규칙 R11·R12 (2026-10-25 다시 켬 · Balance Zero Sugar PASS)', () => {
  assert.strictEqual(verdict('Low sugar jelly.'), 'BLOCK');                                 // R11 · 가이드에 없는 당 표현
  assert.strictEqual(verdict('저당 음료'), 'BLOCK');
  assert.strictEqual(verdict('Zero Sugar lime jellies.', { product: 'jelly-ls' }), 'PASS');  // R12 · Balance는 사용 가능 (2026-10-25 담당 결정)
  assert.strictEqual(verdict('Zero Sugar lime jellies.'), 'COND');                           // 제품을 모르면 확인
  assert.strictEqual(verdict('Zero Sugar lime jellies.', { product: 'jelly' }), 'BLOCK');    // Original은 사용 불가
  assert.strictEqual(verdict('Zero Sugar lime jellies.', { channel: 'all', product: 'all' }), 'BLOCK');   // 브랜드 전체 = 가장 엄격
  assert.strictEqual(verdict('No sugar alcohols.', { product: 'drink-ls' }), 'PASS');        // 당알코올 없음은 당 함량 주장이 아님
  assert.deepStrictEqual(api.review('Low sugar jelly. Sugar free too.', { channel: 'b2c' }).unchecked, []);   // 꺼 둔 규칙 없음
});

check('법적 신호 (2026-10-25): 규칙마다 신호 · 법으로 막히는 표현 🔴 · 회색지대 🟡 · 팀·플랫폼 기준 🟢 · 판정과 별도', () => {
  const legal = (text, opts) => api.review(text, opts || {}).legal;
  const missing = C.rules.filter(r => !['red', 'yellow', 'green'].includes(r.legal) || !r.legalNote).map(r => r.code);
  assert.deepStrictEqual(missing, [], `신호·설명이 없는 규칙: ${missing.join(', ')}`);
  assert.strictEqual(legal('Prevents hangovers.'), 'red');                          // R1·R2 질병·숙취 주장
  assert.strictEqual(legal('FDA approved jelly.'), 'red');                          // R14
  assert.strictEqual(legal('Clinically proven formula.'), 'yellow');                // R5 근거가 있으면 가능
  assert.strictEqual(legal('Drink all night with Reboot.'), 'green');               // R6 플랫폼·팀 기준
  assert.strictEqual(legal('Read our customer reviews.'), 'yellow');                 // R10 후기
  assert.strictEqual(legal('We give a free sample if you leave a 5-star review.'), 'red');   // 좋은 후기 조건 보상 (16 CFR 465)
  assert.strictEqual(legal('Zero Sugar lime jellies.'), 'yellow');                  // 제품 미지정
  assert.strictEqual(legal('Zero Sugar lime jellies.', { product: 'jelly' }), 'red');      // Original에 Zero Sugar = 거짓 표시
  assert.strictEqual(legal('Zero Sugar lime jellies.', { product: 'all' }), 'red');        // 브랜드 전체 = 가장 높은 신호
  assert.strictEqual(legal('Drink all night. Clinically proven.'), 'yellow');       // 여러 규칙 → 가장 높은 신호
  assert.strictEqual(legal('Lime, lemon and cherry jellies.'), '');                 // PASS는 신호 없음
  const r = api.review('Drink all night. Prevents hangovers.');
  assert.deepStrictEqual(r.findings.map(f => [f.code, f.legal]), [['R1', 'red'], ['R2', 'red'], ['R6', 'green']]);
});

check('처음 보는 문장 시험: GPT가 찾은 문장은 모두 맞고, 새 문장 점수는 떨어지지 않음', () => {
  const run = list => list.map(t => ({ t, v: verdict(t.text, { channel: 'b2c' }) }));
  const gpt = run(C.evalSet.filter(t => t.src === 'gpt'));
  const fresh = run(C.evalSet.filter(t => t.src !== 'gpt'));
  const bad = gpt.filter(x => x.v !== x.t.expect).map(x => `${x.t.text} → ${x.v}`);
  assert.deepStrictEqual(bad, [], `GPT 문장 틀림: ${bad.join(' | ')}`);
  const ok = fresh.filter(x => x.v === x.t.expect).length;
  console.log(`     새 문장 ${ok}/${fresh.length} (${Math.round(ok / fresh.length * 100)}점) · 규칙 보강 전 11/23`);
  assert.ok(ok >= 17, `새 문장 점수가 떨어짐: ${ok}/${fresh.length}`);   // 2026-10-24 기준 17/23
});

check('서버 재검사 규칙(server_rules.json)이 data.js와 같음 — 다르면 node tabs/compliance/tools/export_server_rules.js', () => {
  const fs = require('fs');
  const { build, OUT } = require(here('../tools/export_server_rules.js'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(OUT, 'utf8')), JSON.parse(JSON.stringify(build())));
});

if (failed) { console.log(`\n${failed}개 실패`); process.exit(1); }
console.log('\n모두 통과');
