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

// ===== 意見與建議 =====
// 每個得分點都要有題型、主題與補強建議
data.essays.forEach(q => q.parts.forEach(p => p.rubric.forEach(r => {
  assert.ok(['formula', 'concept', 'discussion'].includes(r.kind), q.id + p.id + r.id + ' kind');
  assert.ok(r.topic && r.advice && r.advice.length >= 20, q.id + p.id + r.id + ' 缺 topic 或 advice');
})));
// 驗證器會擋下不合法的 kind 與空的 advice
const bad = JSON.parse(JSON.stringify(data)); bad.essays[0].parts[0].rubric[0].kind = 'oops'; bad.essays[0].parts[0].rubric[1].advice = '  ';
assert.strictEqual(C.validateEssays(bad).length, 2);

// 評等門檻
[[1, 'excellent'], [0.85, 'excellent'], [0.849, 'good'], [0.65, 'good'], [0.64, 'fair'], [0.4, 'fair'], [0.39, 'low'], [0, 'low']]
  .forEach(([pct, key]) => assert.strictEqual(C.essayLevel(pct).key, key, 'level ' + pct));

const stOf = (part, text) => { const g = C.gradeEssayPart(part, text), sc = {}, au = {}; g.items.forEach(i => { sc[i.id] = i.earned; au[i.id] = i.earned; }); return { text, scores: sc, auto: au, graded: true }; };
const withNl = h => C.stripHtml(h.replace(/<br>/g, '\n'));

// 參考答案：全部得分、無補強項目、無作答表現問題
data.essays.forEach(q => q.parts.forEach(p => {
  const fb = C.buildPartFeedback(p, stOf(p, withNl(p.model_answer)));
  assert.strictEqual(fb.gaps.length, 0, q.id + p.id);
  assert.strictEqual(fb.strengths.length, p.rubric.length);
  assert.strictEqual(fb.level.key, 'excellent');
  assert.deepStrictEqual(fb.form, [], q.id + p.id + ' 參考答案不應有作答表現問題：' + fb.form.join('|'));
  assert.strictEqual(fb.calibration, null);
}));

// 空白或無關答案：全部列為補強項目、評等最低，且依失分高低排序
const e1 = E['115-g3econ-E1'];
const fbBlank = C.buildPartFeedback(p12, stOf(p12, '今天天氣很好'));
assert.strictEqual(fbBlank.level.key, 'low');
assert.strictEqual(fbBlank.gaps.length, p12.rubric.length);
for (let i = 1; i < fbBlank.gaps.length; i++) assert.ok(fbBlank.gaps[i - 1].lost >= fbBlank.gaps[i].lost, '補強項目應依失分排序');
assert.ok(fbBlank.gaps.every(g => g.status === 'miss' && g.advice));

// 部分得分的項目標示為「寫得不完整」
const stPart = stOf(p12, '廠商利潤極大化 MR=MC，反應函數。'); stPart.scores.r6 = 1;
assert.strictEqual(C.buildPartFeedback(p12, stPart).gaps.find(g => g.id === 'r6').status, 'partial');

// 作答表現：篇幅過短、計算題沒有等式、概念題沒有分點、篇幅過長
assert.ok(C.buildPartFeedback(p12, stOf(p12, '外部性與寡占的問題要用社會最適來比較')).form.some(t => /篇幅偏短/.test(t)));
assert.ok(C.buildPartFeedback(p12, stOf(p12, '外部性與寡占的問題要用社會最適來比較')).form.some(t => /等式/.test(t)));
const p22 = part('115-g3econ-E2', '2');
const para = '凱因斯學派認為工資與價格僵固所以短期有取捨而古典學派認為價格彈性所以長期垂直'.repeat(4);
assert.ok(C.buildPartFeedback(p22, stOf(p22, para)).form.some(t => /一整段文字/.test(t)));
assert.ok(!C.buildPartFeedback(p22, stOf(p22, '1. ' + para)).form.some(t => /一整段文字/.test(t)));
assert.ok(C.buildPartFeedback(p11, stOf(p11, withNl(p11.model_answer).repeat(3))).form.some(t => /篇幅偏長/.test(t)));

// 自評校準：比初判高 / 低 2 分以上才提醒
const hi = stOf(p13, '最適污染稅 t = d'); p13.rubric.forEach(r => { hi.scores[r.id] = r.points; });
assert.ok(/自評.*高/.test(C.buildPartFeedback(p13, hi).calibration));
const lo = stOf(p11, withNl(p11.model_answer)); p11.rubric.forEach(r => { lo.scores[r.id] = 0; });
assert.ok(/自評.*低/.test(C.buildPartFeedback(p11, lo).calibration));

// 整題：只統計已評分小題、前三名依失分排序、時間配置合計約 30 分鐘
const efb = C.buildEssayFeedback(e1, { 1: stOf(p11, withNl(p11.model_answer)), 2: stOf(p12, '今天天氣很好') });
assert.deepStrictEqual(efb.ungraded, ['（三）']);
assert.strictEqual(efb.possible, 15); assert.strictEqual(efb.earned, 5);
assert.strictEqual(efb.priorities.length, 3);
for (let i = 1; i < efb.priorities.length; i++) assert.ok(efb.priorities[i - 1].lost >= efb.priorities[i].lost);
assert.ok(efb.priorities.every(g => g.partLabel === '（二）'));
assert.deepStrictEqual(efb.kindTips.map(t => t.kind).sort(), ['discussion', 'formula']);
assert.strictEqual(efb.time.reduce((a, t) => a + t.minutes, 0), 30);
assert.strictEqual(C.buildEssayFeedback(e1, {}).level, null);

// 跨次統計：最近 N 次、漏的次數多者在前、全拿分的項目不列入
const att = [
  { id: e1.id, res: { '2:r6': 0, '2:r1': 1, '1:r4': 0 } },
  { id: e1.id, res: { '2:r6': 0, '2:r1': 1, '1:r4': 1 } },
  { id: e1.id, res: { '2:r6': 1, '2:r1': 1, '1:r4': 1 } },
  { id: 'no-such-essay', res: { '1:r1': 0 } },
  { id: e1.id }
];
const wk = C.aggregateWeak(att, E, { limit: 5 });
assert.deepStrictEqual(wk.map(w => w.rid + ':' + w.missed + '/' + w.seen), ['r6:2/3', 'r4:1/3']);
assert.strictEqual(wk[0].partLabel, '（二）'); assert.ok(wk[0].advice);
assert.strictEqual(C.aggregateWeak(att, E, { recent: 1 }).length, 0);
assert.strictEqual(C.aggregateWeak(att, E, { limit: 1 }).length, 1);

console.log('申論題測試通過');
