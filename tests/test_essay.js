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

/* ===== 115 年高考三級其餘三份試卷的申論題 ===== */
const by = (subj) => data.essays.filter(q => q.year_roc === 115 && q.subject === subj);
const bank = require(path.join(__dirname, '..', 'data', 'bank.json'));
// 題數與配分：金融保險 50 分（15+15+10+10）、財經廉政 50 分、公共經濟學 100 分（4×25）
assert.deepStrictEqual(by('經濟學與貨幣銀行學').map(q => q.points), [15, 15, 10, 10]);
assert.deepStrictEqual(by('經濟學與財政學概論').map(q => q.points), [25, 25]);
assert.deepStrictEqual(by('公共經濟學').map(q => q.points), [25, 25, 25, 25]);
assert.strictEqual(data.essays.length, 12);
// exam / subject 字串要與選擇題題庫一致（有選擇題的科目），公共經濟學為純申論科目
data.essays.forEach(q => {
  const has = bank.questions.some(b => b.exam === q.exam && b.subject === q.subject);
  assert.strictEqual(has, q.subject !== '公共經濟學', q.id + ' exam/subject 與題庫不一致');
});
// 四份試卷的小題結構（對照試題 PDF）
const shape = (id) => E[id].parts.map(p => p.points).join(',');
assert.strictEqual(shape('115-g3mb-E1'), '10,5'); assert.strictEqual(shape('115-g3mb-E2'), '4,4,4,3');
assert.strictEqual(shape('115-g3mb-E3'), '10'); assert.strictEqual(shape('115-g3mb-E4'), '2,8');
assert.strictEqual(shape('115-g3fin-E1'), '25'); assert.strictEqual(shape('115-g3fin-E2'), '10,15');

// 財經廉政第 2 題（二）：社會福利數值
{
  const Ua = Ma => 1000 + Ma, Ub = Mb => 1000 + 2 * Mb;
  const util = (ma, mb) => Ua(ma) + Ub(mb), rawls = (ma, mb) => Math.min(Ua(ma), Ub(mb));
  assert.strictEqual(util(50, 50), 2150); assert.strictEqual(util(60, 40), 2140);
  assert.strictEqual(rawls(50, 50), 1050); assert.strictEqual(rawls(60, 40), 1060);
  const a = C.stripHtml(E['115-g3fin-E2'].parts[1].model_answer);
  ['2150', '2140', '1050', '1060'].forEach(x => assert.ok(a.includes(x), '參考答案應含 ' + x));
  // 只算對功利主義（2150→2140），不應拿到 Rawls 的分數
  const g = C.gradeEssayPart(E['115-g3fin-E2'].parts[1], '功利主義 W=Ua+Ub，原本 2150，新的 2140，福利減少 10');
  assert.ok(g.earned > 0 && g.earned < 8, '只答功利主義應只拿部分分數，實得 ' + g.earned);
}
// 公共經濟學第 4 題：Lindahl 數值（MBA=120−2G, MBB=80−G, MC=90+αG）
for (const al of [0.5, 1, 2, 4]) {
  const G = 110 / (3 + al), tA = 120 - 2 * G, tB = 80 - G, MC = 90 + al * G;
  assert.ok(Math.abs(tA + tB - MC) < 1e-9, 'tA+tB=MC');
  assert.ok(Math.abs(tA - (140 + 120 * al) / (3 + al)) < 1e-9); assert.ok(Math.abs(tB - (130 + 80 * al) / (3 + al)) < 1e-9);
  assert.ok(Math.abs((tA + tB) * G - (90 * G + al * G * G / 2) - al * G * G / 2) < 1e-9, '預算差額為 αG²/2');
  assert.ok(G < 40 && 120 - 2 * G > 0 && 80 - G > 0);
}
{ const a = C.stripHtml(E['115-g3pe-E4'].parts[0].model_answer); ['27.5', '65', '52.5', '117.5'].forEach(x => assert.ok(a.includes(x), '參考答案 α=1 的數值 ' + x)); }
// 金融保險第 1 題（一）：關稅的福利變化（線性需求供給數值驗算 −(b+d)）
{
  const D = P => 100 - P, S = P => P - 10, PW = 40, T = 10;           // 自由貿易 Qd=60, Qs=30
  const area = (f, p0, p1) => { let s = 0; const n = 20000, h = (p1 - p0) / n; for (let i = 0; i < n; i++) s += f(p0 + (i + 0.5) * h) * h; return s; };
  const dCS = -area(D, PW, PW + T), dPS = area(S, PW, PW + T), rev = T * (D(PW + T) - S(PW + T));
  const b = 0.5 * (S(PW + T) - S(PW)) * T, d = 0.5 * (D(PW) - D(PW + T)) * T;
  assert.ok(Math.abs(dCS + dPS + rev + (b + d)) < 1e-3, '總剩餘變動 = −(b+d)');
}
// 較貼近學生寫法的作答：應得部分分數，不是 0 也不是滿分
{
  const p = E['115-g3mb-E3'].parts[0];
  const g = C.gradeEssayPart(p, '贊成央行獨立的人認為，政治人物為了選舉會要求降息，造成通膨偏高，所以要避免政治干預，維持物價穩定與公信力；反對的人認為央行官員沒有民選，缺乏民主課責。');
  assert.ok(g.earned > 0 && g.earned < p.points, '中央銀行獨立性：部分作答應得部分分數，實得 ' + g.earned);
}
// 評分不可被其他科目的參考答案輕易騙過：拿別科的答案作答，得分應低於一半
data.essays.forEach(q => q.parts.forEach(p => data.essays.forEach(q2 => {
  if (q2.subject === q.subject) return;
  q2.parts.forEach(p2 => { const g = C.gradeEssayPart(p, C.stripHtml(p2.model_answer)); assert.ok(g.earned <= p.points * 0.5, q.id + '/' + p.id + ' 被 ' + q2.id + '/' + p2.id + ' 的答案拿到 ' + g.earned + '/' + p.points); });
})));

console.log('申論題測試通過');
