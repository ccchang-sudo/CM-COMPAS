/* 申論題：資料格式、評分初判、參考答案數學驗算。執行：node tests/test_essay.js */
const path = require('path');
const assert = require('assert');
const C = require(path.join(__dirname, '..', 'core.js'));
const data = require(path.join(__dirname, '..', 'data', 'essays.json'));

assert.deepStrictEqual(C.validateEssays(data), []);
const E = {}; data.essays.forEach(q => { E[q.id] = q; });
const part = (qid, pid) => E[qid].parts.find(p => p.id === pid);

// 115 年高考三級經濟學：申論題 2 題各 25 分，合計 50 分
const y115 = data.essays.filter(q => q.year_roc === 115 && q.subject === '經濟學');
assert.strictEqual(y115.length, 2);
assert.strictEqual(y115.reduce((a, q) => a + q.points, 0), 50);

// 正規化：不同寫法落在同一種形式
const n = C.normalizeText;
assert.strictEqual(n('d²/(2b)'), n('d^2 / 2b'));
assert.strictEqual(n('ｄ２／（２ｂ）'), n('d2/2b'));
assert.strictEqual(n('Q* = (a − c − d)/b'), n('q=(a-c-d)/b'));
assert.strictEqual(n('\\frac{d^2}{2b}'), n('d2/2b'));

// 參考答案本身必須拿到滿分（自我一致性）
data.essays.forEach(q => q.parts.forEach(p => {
  const g = C.gradeEssayPart(p, C.stripHtml(p.model_answer));
  assert.strictEqual(g.earned, p.points, q.id + ' 小題 ' + p.id + ' 參考答案應得滿分，實得 ' + g.earned + '：' +
    g.items.filter(i => i.status !== 'ok').map(i => i.id).join(','));
}));

// 空白與無關內容得 0
data.essays.forEach(q => q.parts.forEach(p => {
  assert.strictEqual(C.gradeEssayPart(p, '').earned, 0);
  assert.strictEqual(C.gradeEssayPart(p, '今天天氣很好，我想吃牛肉麵').earned, 0);
}));

// 部分答對：只寫完全競爭的結論，(一)全中，(二)(三)不應拿高分
const p11 = part('115-g3econ-E1', '1'), p12 = part('115-g3econ-E1', '2'), p13 = part('115-g3econ-E1', '3');
const only = 'SMC=c+d，Q*=(a-c-d)/b；完全競爭 P=MC=c，Q=(a-c)/b，超額生產 d/b，福利損失 d^2/(2b)';
assert.strictEqual(C.gradeEssayPart(p11, only).earned, 5);
assert.ok(C.gradeEssayPart(p12, only).earned <= 3, '(二)不應只靠(一)的結論拿高分');
assert.ok(C.gradeEssayPart(p13, only).earned <= 1, '(三)不應只靠(一)的結論拿高分');

// 常見錯誤：只答 t = d 不應拿到最適稅公式分數
const g = C.gradeEssayPart(p13, '最適污染稅 t = d，因為要把外部成本內部化');
assert.strictEqual(g.items.find(i => i.id === 'r4').earned, 0);

// 不同寫法也要認得
assert.strictEqual(C.gradeEssayPart(p11, '福利損失 = ½ × d × d/b = d²／2b').items.find(i => i.id === 'r4').earned, 1);
assert.strictEqual(C.gradeEssayPart(p12, 'DWL = [(n+1)d-(a-c)]^2 / (2b(n+1)^2)').items.find(i => i.id === 'r6').earned, 2);
assert.strictEqual(C.gradeEssayPart(p13, 't* = d - (a-c-d)/n').items.find(i => i.id === 'r4').earned, 2);

// 自評分數加總：超出配分或負數會被限制
const r = p11.rubric;
assert.strictEqual(C.sumPartScores(p11, { r1: 99, r2: -3, r3: 1, r4: 0.5 }), r[0].points + 0 + 1 + 0.5);
const sm = C.summarizeEssay(E['115-g3econ-E1'], { 1: { r1: 1.5 }, 2: {}, 3: { r1: 1 } });
assert.strictEqual(sm.earned, 2.5); assert.strictEqual(sm.possible, 25);

// 數學驗算：以數值方法驗證參考答案的公式
function W(Q, a, b, c, d) { return (a - c - d) * Q - b * Q * Q / 2; }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let k = 0; k < 200; k++) {
  const a = 50 + rnd() * 50, c = 5 + rnd() * 25, b = 0.5 + rnd() * 2.5, d = 1 + rnd() * (a - c) * 0.6, nn = 1 + Math.floor(rnd() * 9);
  const Qs = (a - c - d) / b, Qc = (a - c) / b, Qn = nn * (a - c) / ((nn + 1) * b);
  assert.ok(Math.abs((W(Qs, a, b, c, d) - W(Qc, a, b, c, d)) - d * d / (2 * b)) < 1e-8);
  assert.ok(Math.abs((W(Qs, a, b, c, d) - W(Qn, a, b, c, d)) - Math.pow((nn + 1) * d - (a - c), 2) / (2 * b * Math.pow(nn + 1, 2))) < 1e-8);
  const t = ((nn + 1) * d - (a - c)) / nn;
  assert.ok(Math.abs(nn * (a - c - t) / ((nn + 1) * b) - Qs) < 1e-8, '最適稅使 Cournot 產量等於社會最適產量');
  assert.ok(Math.abs(t - (d - (a - c - d) / nn)) < 1e-9);
  // 最適稅隨 n 遞增
  const t2 = ((nn + 2) * d - (a - c)) / (nn + 1);
  assert.ok(t2 > t);
}
console.log('申論題測試通過');
