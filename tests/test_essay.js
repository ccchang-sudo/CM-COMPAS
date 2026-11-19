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
assert.strictEqual(data.essays.length, 72);  // 113 年 24 題（7 科）＋ 114 年 24 題（7 科）＋ 115 年 24 題（7 科）
// exam / subject 字串要與選擇題題庫一致（有選擇題的科目）；以下為純申論科目（題庫沒有選擇題）
const ESSAY_ONLY = ['公共經濟學', '產業經濟學', '運輸經濟學', '農業經濟學', '工程經濟學'];
data.essays.forEach(q => {
  const has = bank.questions.some(b => b.exam === q.exam && b.subject === q.subject);
  assert.strictEqual(has, !ESSAY_ONLY.includes(q.subject), q.id + ' exam/subject 與題庫不一致');
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
/* ===== 114 年高考三級：運輸經濟學、農業經濟學、工程經濟學；115 年高考三級：產業經濟學 ===== */
const sub = (y, subj) => data.essays.filter(q => q.year_roc === y && q.subject === subj);
['運輸經濟學', '農業經濟學', '工程經濟學'].forEach(s => { assert.deepStrictEqual(sub(114, s).map(q => q.points), [25, 25, 25, 25], s); });
assert.deepStrictEqual(sub(115, '產業經濟學').map(q => q.points), [25, 25, 25, 25]);
assert.deepStrictEqual(sub(114, '運輸經濟學')[0].categories, ['交通行政']);
assert.deepStrictEqual(sub(114, '農業經濟學')[0].categories, ['農業行政']);
assert.deepStrictEqual(sub(114, '工程經濟學')[0].categories, ['工業工程']);
assert.deepStrictEqual(sub(115, '產業經濟學')[0].categories, ['公平交易管理', '工業行政']);
// 小題結構（對照試題 PDF）
assert.strictEqual(shape('114-g3tre-E1'), '25'); assert.strictEqual(shape('114-g3agr-E2'), '5,5,15');
assert.strictEqual(shape('114-g3eng-E1'), '10,15'); assert.strictEqual(shape('115-g3io-E1'), '5,5,5,5,5');
assert.strictEqual(shape('115-g3io-E2'), '6,6,7,6'); assert.strictEqual(shape('115-g3io-E3'), '10,8,7');
assert.strictEqual(shape('115-g3io-E4'), '8,7,5,5');
// 計算題標記 calc（回饋會提醒數值與列式）
['114-g3eng-E1', '114-g3eng-E2', '114-g3eng-E3', '114-g3eng-E4', '115-g3io-E3'].forEach(id => E[id].parts.forEach(p => { if (id !== '115-g3io-E3' || p.id !== '3') assert.ok(p.calc, id + '/' + p.id + ' 應標記 calc'); }));

// ---- 工程經濟學：數值驗算 ----
{
  const pv = (cf, r) => cf.reduce((a, c, t) => a + c / Math.pow(1 + r, t), 0);
  const X = Math.round((12500 - 6200 / 1.25 - 5600 / 1.25 ** 2) * 1.25 ** 3), Y = Math.round((12500 - 3860 / 1.24 - 9500 / 1.24 ** 3) * 1.24 ** 2);
  assert.strictEqual(X, 7727); assert.strictEqual(Y, 6772);
  assert.ok(Math.abs(pv([-12500, 6200, 5600, X], 0.25)) < 1 && Math.abs(pv([-12500, 3860, Y, 9500], 0.24)) < 1);
  const d = [0, 6200 - 3860, 5600 - Y, X - 9500];
  assert.deepStrictEqual(d, [0, 2340, -1172, -1773]);
  let lo = 0.01, hi = 1; for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (pv(d, m) < 0) lo = m; else hi = m; }
  assert.ok(Math.abs(lo - 0.1562) < 5e-4, '增額 IRR ≈ 15.62%，實得 ' + lo);
  assert.ok(pv(d, 0.10) < 0 && pv(d, 0.20) > 0, 'MARR 低於 15.6% 時 B 較佳、高於時 A 較佳');
  // 損益平衡
  const ap = 0.05 * 1.05 ** 5 / (1.05 ** 5 - 1), af = 0.05 / (1.05 ** 5 - 1);
  const fixed = 1800000 * ap - 35000 * af + 200000;
  assert.ok(Math.abs(fixed - 609421) < 1); assert.strictEqual(Math.ceil(fixed / 50), 12189);
  // 債務整合
  const pva = (A, r, n) => A * (1 - (1 + r) ** -n) / r;
  const tot = pva(20000, 0.01, 24) + pva(10000, 1.01 ** 3 - 1, 12) + pva(60000, 1.01 ** 6 - 1, 4);
  assert.ok(Math.abs(tot - 731414) < 1);
  assert.ok(Math.abs(tot * 0.01 / (1 - 1.01 ** -50) - 18660) < 1);
  // 實際貨幣與定值貨幣
  const fa = [120000, 130000, 145000, 165000], fb = [100000, 120000, 135000, 150000], ri = 1.05 / 1.03 - 1;
  const pwA = 1500000 + fa.reduce((a, c, t) => a + c / 1.05 ** (t + 1), 0);
  const pwB = 1200000 + fb.reduce((a, c, t) => a + c * 1.03 ** (t + 1) / 1.05 ** (t + 1), 0);
  const pwB2 = 1200000 + fb.reduce((a, c, t) => a + c / (1 + ri) ** (t + 1), 0);
  assert.ok(Math.abs(pwA - 1993202) < 1 && Math.abs(pwB - 1679893) < 1 && Math.abs(pwB - pwB2) < 1e-6 && pwB < pwA);
}
// ---- 產業經濟學：賽局與差別訂價 ----
{
  const pay = { 'CC': [100, 100], 'CD': [20, 150], 'DC': [150, 20], 'DD': [50, 50] };
  const ne = [];['C', 'D'].forEach(a => ['C', 'D'].forEach(b => {
    const [u, v] = pay[a + b], alt = x => (x === 'C' ? 'D' : 'C');
    if (pay[alt(a) + b][0] <= u && pay[a + alt(b)][1] <= v) ne.push(a + b);
  }));
  assert.deepStrictEqual(ne, ['DD'], '唯一的納許均衡為（降價，降價）');
  // 單一定價 vs 差別訂價（MC=2；P1=10-Q1，P2=8-Q2）
  const profit = (P) => { const q1 = Math.max(0, 10 - P), q2 = Math.max(0, 8 - P); return (P - 2) * (q1 + q2); };
  let best = 0, bp = 0; for (let P = 2; P <= 10; P += 0.01) { const v = profit(P); if (v > best) { best = v; bp = P; } }
  assert.ok(Math.abs(bp - 5.5) < 0.011 && Math.abs(best - 24.5) < 0.01);
  const cs = (a, P) => Math.max(0, a - P) ** 2 / 2;
  const W1 = best + cs(10, 5.5) + cs(8, 5.5), W2 = (6 - 2) * 4 + (5 - 2) * 3 + cs(10, 6) + cs(8, 5);
  assert.ok(Math.abs(W1 - 37.75) < 0.01 && Math.abs(W2 - 37.5) < 1e-9, '福利 37.75 → 37.5');
  assert.strictEqual(4 + 3, 7); assert.ok(Math.abs(4.5 + 2.5 - 7) < 1e-9);
  // 互補財需求：聯合定價 vs 獨立定價
  const MC = 10, jp = (P) => 2 * (P - MC) * (100 - 3 * P);
  let bj = 0, pj = 0; for (let P = 10; P <= 33; P += 0.001) { if (jp(P) > bj) { bj = jp(P); pj = P; } }
  assert.ok(Math.abs(pj - 130 / 6) < 0.01 && Math.abs(bj - 816.67) < 0.05);
  const Pn = 24, Qn = 100 - 3 * Pn; assert.strictEqual(Qn, 28); assert.strictEqual(2 * (Pn - MC) * Qn, 784);
  assert.ok(Pn > pj && 784 < bj, '獨立定價價格較高、利潤較低');
}
// ---- 模擬學生作答：應得部分分數，不是 0 也不是滿分 ----
{
  const gp = (id, pid, text) => C.gradeEssayPart(part(id, pid), text);
  let g = gp('114-g3eng-E1', '1', '方案A：-12500+6200/1.25+5600/1.25^2+X/1.25^3=0，X=7,727；方案B 同樣令 NPV=0，Y=6,772');
  assert.strictEqual(g.earned, 10);
  g = gp('114-g3eng-E1', '2', '增額現金流量 A-B：2,340、-1,172、-1,773，增額 IRR 約 15.6%，所以 MARR 在 15.6% 到 25% 之間選 A');
  assert.strictEqual(g.earned, 15, '工程經濟學第 1 題（二）完整作答應滿分，實得 ' + g.earned);
  g = gp('114-g3eng-E1', '2', '因為 A 的 IRR 25% 比 B 的 24% 高，所以 MARR 小於 25% 時都選 A');
  assert.ok(g.earned < 9, '只比較 IRR 而沒有增額分析，不應高分，實得 ' + g.earned);
  g = gp('114-g3eng-E2', '1', '單位變動成本 0.5×100=50，貢獻 50。1,800,000(A/P,5%,5)=415,755，殘值 35,000(A/F,5%,5)=6,334，固定成本 415,755-6,334+200,000=609,421，Q=609,421/50=12,189 件');
  assert.ok(g.earned >= 22, '工程經濟學第 2 題完整作答應接近滿分，實得 ' + g.earned);
  g = gp('114-g3eng-E2', '1', '1,800,000/5=360,000，加 200,000 為 560,000，除以 50 得 11,200 件');
  assert.ok(g.earned <= 8, '忽略利息與殘值，不應高分，實得 ' + g.earned);
  g = gp('114-g3eng-E3', '1', '月利率 1%，季利率 3.0301%，半年 6.152%。汽車 424,868，助學 99,361，貨款 207,185，合計 731,414，每月 18,660');
  assert.ok(g.earned >= 22, '工程經濟學第 3 題完整作答，實得 ' + g.earned);
  g = gp('114-g3eng-E4', '1', '市場利率含通膨，實質利率=1.05/1.03-1=1.94%。A 用 5% 折現，PW=1,993,202。B 先乘 1.03^t 換成實際貨幣，PW=1,679,893。選方案 B');
  assert.ok(g.earned >= 21, '工程經濟學第 4 題完整作答，實得 ' + g.earned);
  g = gp('114-g3eng-E4', '1', 'A 的成本 120000+130000+145000+165000，B 的成本 100000+120000+135000+150000，B 比較低所以選 B');
  assert.ok(g.earned <= 6, '直接加總不折現，不應高分，實得 ' + g.earned);
  g = gp('115-g3io-E1', '2', '納許均衡是在對方策略不變時，沒有人想單獨改變策略。本賽局為雙方都偷偷降價，報酬 (50, 50)。');
  assert.strictEqual(g.earned, 5);
  g = gp('115-g3io-E1', '1', '優勢策略就是不管對手怎麼選，自己選這個策略報酬都比較高。對甲：乙遵守時 150>100，乙降價時 50>20，所以偷偷降價是優勢策略。');
  assert.strictEqual(g.earned, 5);
  g = gp('115-g3io-E3', '1', '加總需求 Q=18-2P，P=9-Q/2，MR=9-Q=2，Q=7，P=5.5，Q1=4.5，Q2=2.5，兩族群都購買（5.5<8），利潤=(5.5-2)×7=24.5');
  assert.ok(g.earned >= 9, '產業經濟學第 3 題（一）完整作答，實得 ' + g.earned);
  g = gp('115-g3io-E3', '2', 'MR1=10-2Q1=2 得 Q1=4，P1=6；MR2=8-2Q2=2 得 Q2=3，P2=5；利潤 16+9=25');
  assert.strictEqual(g.earned, 8);
  g = gp('115-g3io-E3', '3', '差別訂價要提高福利，必須使總產量增加。本題單一定價福利 37.75，差別訂價 37.5，總產量都是 7 不變，所以福利下降 0.25');
  assert.ok(g.earned >= 6, '實得 ' + g.earned);
  g = gp('115-g3io-E4', '1', 'Q_A = 100 - 2P_A - P_B；Q_B = 100 - 2P_B - P_A。交叉價格係數為負，表示 A 與 B 互補');
  assert.ok(g.earned >= 4 && g.earned < 8, '產業經濟學第 4 題（一）部分作答，實得 ' + g.earned);
  g = gp('114-g3tre-E4', '1', 'Logit 假設誤差項為 Gumbel 分配，機率有封閉解，但有 IIA 問題；Probit 假設誤差項為常態分配，需要用積分或模擬，計算複雜，但允許誤差相關，沒有 IIA。兩者都以隨機效用理論和最大概似法估計。');
  assert.ok(g.earned >= 14 && g.earned < 25, '運輸經濟學第 4 題部分作答，實得 ' + g.earned);
  g = gp('114-g3agr-E4', '1', '地租是使用土地的報酬，土地供給固定，是經濟租。差額地租來自土地肥沃度差異，邊際土地沒有地租。農作物價格上升，優良土地的超額利潤增加，差額地租上升，邊際土地外移。是價格決定地租，不是地租決定價格。');
  assert.ok(g.earned >= 14, '農業經濟學第 4 題部分作答，實得 ' + g.earned);
  g = gp('114-g3agr-E2', '2', '基本型：全面納保，政府全額補助保費，區域減產超過兩成定額理賠。加強型：自願加保，政府補助二分之一保費，農民最低繳一成，減產超過 5% 或 10% 理賠。');
  assert.strictEqual(g.earned, 5);
  g = gp('114-g3tre-E1', '1', 'Ramsey 定價是在廠商損益平衡的限制下的次佳定價，加成與彈性成反比（逆彈性法則），彈性小的價格較高。');
  assert.ok(g.earned >= 8 && g.earned < 18, '運輸經濟學第 1 題只答原則，實得 ' + g.earned);
}

/* ===== 115 年高考三級：運輸經濟學（交通行政）、工程經濟學（工業工程） ===== */
// 題數、配分與小題結構（對照試題 PDF：運輸經濟學 4×25；工程經濟學 4×25，各題 12+13）
assert.deepStrictEqual(by('運輸經濟學').map(q => q.points), [25, 25, 25, 25]);
assert.deepStrictEqual(by('工程經濟學').map(q => q.points), [25, 25, 25, 25]);
['115-g3ee-E1', '115-g3ee-E2', '115-g3ee-E3', '115-g3ee-E4'].forEach(id => assert.strictEqual(shape(id), '12,13'));
data.essays.filter(q => q.subject === '運輸經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['交通行政']));
data.essays.filter(q => q.subject === '工程經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['工業工程']));

// 數值抽取：千分位、全形、萬／億、負號
assert.deepStrictEqual(C.extractNumbers('總現值 5,131.62 萬元').slice(0, 1), [5131.62]);
assert.ok(C.extractNumbers('１，００６．０７萬').includes(1006.07));
assert.ok(C.extractNumbers('1,006 萬元').includes(10060000));
assert.ok(C.extractNumbers('AW = -1,372,183').includes(1372183));
assert.ok(C.numMatches({ v: 1372183, tol: 0.001 }, C.extractNumbers('約 -1,371,800 元')));      // 查表四位數因子的誤差
assert.ok(!C.numMatches({ v: 1372183, tol: 0.001 }, C.extractNumbers('約 1,400,000 元')));

// 數學驗算：以數值方法驗證參考答案的數字
const pvOf = (cf, rates) => { let df = 1, pv = cf[0], sdf = 0; for (let t = 1; t < cf.length; t++) { df /= 1 + rates[t]; pv += cf[t] * df; sdf += df; } return { pv, sdf }; };
{
  const r = pvOf([500, 600, 800, 1100, 1200, 800, 1000], [0, .04, .04, .05, .05, .08, .08]);
  assert.ok(Math.abs(r.pv - 5131.62) < 0.01); assert.ok(Math.abs(r.sdf - 5.1007) < 1e-4); assert.ok(Math.abs(r.pv / r.sdf - 1006.07) < 0.01);
}
{
  const i = 0.1; let f1 = 0, f2 = 0;
  for (let t = 0; t <= 20; t++) { f1 += 20 * Math.pow(1 + i, 20 - t); f2 += (t <= 10 ? 10 : 10 * Math.pow(1.2, t - 10)) * Math.pow(1 + i, 20 - t); }
  assert.ok(Math.abs(f1 - 1280.05) < 0.01); assert.ok(Math.abs(f2 - 912.41) < 0.01);
  let f1b = 0; for (let t = 1; t <= 20; t++) f1b += 20 * Math.pow(1 + i, 20 - t); assert.ok(Math.abs(f1b - 1145.5) < 0.01);
}
{
  const i = 0.05, apf = n => i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1), aff = n => i / (Math.pow(1 + i, n) - 1);
  const awX = 1e7 * apf(20) - 1e6 * aff(20) + 6e5, awY = 2e7 * apf(40) - 1e6 * aff(40) + 3.2e5, ccZ = 2.8e7 + 5e4 / i + 1e5 * aff(10) / i;
  assert.ok(Math.abs(awX / i - 27443666) < 1); assert.ok(Math.abs(awY / i - 29545701) < 1); assert.ok(Math.abs(ccZ - 29159009) < 1);
  assert.ok(Math.abs(awX - 1372183) < 1); assert.ok(Math.abs(awY - 1477285) < 1); assert.ok(Math.abs(ccZ * i - 1457950) < 1);
  assert.ok(awX < ccZ * i && ccZ * i < awY, 'X 最佳');
  // 直接以 CC 定義驗算：P + 更新現值（無限期）+ 年度成本現值
  const ccX = 1e7 + 9e6 * (1 / (Math.pow(1 + i, 20) - 1)) + 6e5 / i; assert.ok(Math.abs(ccX - awX / i) < 1);
}
{
  const B = 88000 + 5 * 16000, S = B - 10 * 16000; assert.strictEqual(B, 168000); assert.strictEqual(S, 8000);
  const bv4 = B * Math.pow(0.8, 4), d5 = 0.2 * bv4, bv5 = B * Math.pow(0.8, 5);
  assert.ok(Math.abs(bv4 - 68812.8) < 1e-6); assert.ok(Math.abs(d5 - 13762.56) < 1e-6); assert.ok(Math.abs(bv5 - 55050.24) < 1e-6 && bv5 > S);
}
{ // 運輸經濟學第 3 題：規模報酬與規模經濟
  const Q = (K, L) => 2 * Math.pow(K, 0.6) * Math.pow(L, 0.5);
  assert.ok(Math.abs(Q(3 * 4, 3 * 9) / Q(4, 9) - Math.pow(3, 1.1)) < 1e-9 && Math.pow(3, 1.1) > 3);
  let prev = Infinity; for (let q = 1; q <= 2000; q *= 2) { const ac = (500 + q) / q; assert.ok(ac < prev); prev = ac; }
  assert.ok(Math.abs(1 / 1.1 - 0.909) < 1e-3);
}

// 學生作答情境：部分正確應得部分分數（不是 0，也不是滿分）
{
  const g = (id, pid, txt) => C.gradeEssayPart(part(id, pid), txt);
  // 工程經濟學第 1 題：只算總現值正確，沒寫逐年過程 → 只有 r3 得分
  let r = g('115-g3ee-E1', '1', '總現值約為 5,131.6 萬元');
  assert.strictEqual(r.items.find(i => i.id === 'r3').earned, 5); assert.ok(r.earned <= 5);
  // 每年只用當年利率折現的典型錯誤：總現值錯誤 → r3 為 0
  r = g('115-g3ee-E1', '1', '總現值 = 500+600/1.04+800/1.04^2+1100/1.05^3+1200/1.05^4+800/1.08^5+1000/1.08^6 = 5,190 萬元');
  assert.strictEqual(r.items.find(i => i.id === 'r3').earned, 0);
  // 查表取四位小數的年金值，仍應判對（0.1% 容許誤差）
  r = g('115-g3ee-E3', '2', 'X 的年金成本 = 10,000,000×0.0802 − 1,000,000×0.0302 + 600,000 = 1,372,000 元');
  assert.strictEqual(r.items.find(i => i.id === 'r1').earned, 4);
  // 資本化成本寫成「萬」單位也應判對
  r = g('115-g3ee-E3', '1', '方案 X 的資本化成本為 2,744.37 萬元');
  assert.strictEqual(r.items.find(i => i.id === 'r2').earned, 3);
  // 常見錯誤：以 88,000 當原始成本 → r1 不得分
  r = g('115-g3ee-E4', '1', '原始成本為 88,000，殘值為 8,000');
  assert.strictEqual(r.items.find(i => i.id === 'r1').earned, 0);
  // DDB 常見錯誤：用 (B−S)×20% 當第 5 年折舊
  r = g('115-g3ee-E4', '2', '第 5 年折舊 = (168,000−8,000)×0.8^4×0.2 = 13,107.2');
  assert.strictEqual(r.items.find(i => i.id === 'r2').earned, 0);
  // 運輸經濟學第 3 題（二）：只判斷規模報酬遞增，沒算規模經濟 → 部分分數
  r = g('115-g3te-E3', '2', '因為 0.6 + 0.5 = 1.1 大於 1，所以規模報酬遞增');
  assert.ok(r.earned > 0 && r.earned < 15 * 0.6, '只答規模報酬應得部分分數，實得 ' + r.earned);
  // 運輸經濟學第 1 題（一）：只寫密度經濟 → 不應拿滿分
  r = g('115-g3te-E1', '1', '密度經濟是指在網路規模固定時，運量增加使單位成本下降。');
  assert.ok(r.earned >= 3 && r.earned < 10, '只答密度經濟，實得 ' + r.earned);
  // 運輸經濟學第 2 題（二）：只分析補貼者市場，漏了受補貼市場 → r2 不應滿分
  r = g('115-g3te-E2', '2', '市場A價格高於邊際成本，消費不足，需求曲線與MC之間的三角形為無謂損失。');
  assert.strictEqual(r.items.find(i => i.id === 'r1').status, 'ok'); assert.notStrictEqual(r.items.find(i => i.id === 'r2').status, 'ok');
}
// 新增科目的意見與建議：缺漏得分點與提示
{
  const p = part('115-g3ee-E3', '1');
  const f = C.feedbackEssayPart(p, { text: '方案 X 資本化成本 27,443,666', auto: {}, scores: { r2: 3 } });
  assert.ok(f.ratio > 0 && f.ratio < 0.5); assert.ok(f.points.some(x => /完全沒得分/.test(x.text)));
  assert.ok(f.points.some(x => /常見錯誤/.test(x.text)));
}

/* ===== 114 年高考三級四份試卷的申論題 ===== */
const by114 = (subj) => data.essays.filter(q => q.year_roc === 114 && q.subject === subj);
assert.deepStrictEqual(by114('經濟學與財政學概論').map(q => q.points), [25, 25]);
assert.deepStrictEqual(by114('經濟學').map(q => q.points), [25, 25]);
assert.deepStrictEqual(by114('公共經濟學').map(q => q.points), [20, 40, 20, 20]);       // 共 100 分
assert.deepStrictEqual(by114('產業經濟學').map(q => q.points), [25, 25, 25, 25]);
assert.strictEqual(data.essays.filter(q => q.year_roc === 114).length, 24);  // 7 科：經濟學、財政學概論、公共、產業、運輸、農業、工程
assert.strictEqual(shape('114-g3fin-E2'), '5,5,5,5,5'); assert.strictEqual(shape('114-g3econ-E1'), '10,10,5');
assert.strictEqual(shape('114-g3econ-E2'), '2,2,21'); assert.strictEqual(shape('114-g3pe-E2'), '20,20');
assert.strictEqual(shape('114-g3ie-E1'), '10,10,5'); assert.strictEqual(shape('114-g3ie-E2'), '5,10,10');
assert.strictEqual(shape('114-g3ie-E3'), '12,8,5'); assert.strictEqual(shape('114-g3ie-E4'), '10,10,5');
// 類科：產業經濟學只給公平交易管理、工業行政；公共經濟學只給經建行政；財經廉政概論只給財經廉政
by114('產業經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['公平交易管理', '工業行政']));
by114('公共經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['經建行政']));
by114('經濟學與財政學概論').forEach(q => assert.deepStrictEqual(q.categories, ['財經廉政']));
by114('經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['金融保險', '統計', '經建行政']));

const cn = (x) => C.normalizeText(C.stripHtml(x));
const ans = (id, pid) => C.stripHtml(E[id].parts.find(p => p.id === pid).model_answer);
const has2 = (id, pid, list) => list.forEach(x => assert.ok(ans(id, pid).includes(x), id + '/' + pid + ' 參考答案應含 ' + x));

// ---- 經濟學第 1 題：Cournot 與新技術（用公式解 2x2 線性方程驗算）----
function cournot(a, c1, c2) {                       // p = a - q1 - q2；回傳均衡
  const q1 = (a - 2 * c1 + c2) / 3, q2 = (a - 2 * c2 + c1) / 3, Q = q1 + q2, p = a - Q;
  return { q1, q2, Q, p, pi1: (p - c1) * q1, pi2: (p - c2) * q2, cs: Q * Q / 2 };
}
{
  const e0 = cournot(120, 10, 20), e1 = cournot(120, 10, 10);
  const near = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, m + '：' + x + ' ≠ ' + y);
  near(e0.q1, 40, 'q1'); near(e0.q2, 30, 'q2'); near(e0.p, 50, 'p'); near(e0.pi1, 1600, 'π1'); near(e0.pi2, 900, 'π2'); near(e0.cs, 2450, 'CS');
  near(e1.q1, 110 / 3, 'q1 新'); near(e1.p, 140 / 3, 'p 新'); near(e1.pi1, 12100 / 9, 'π1 新'); near(e1.pi2, 12100 / 9, 'π2 新'); near(e1.cs, 24200 / 9, 'CS 新');
  near(e1.pi2 - e0.pi2, 4000 / 9, '採用的私人利益（C 的上限）');
  const sv = (e1.pi1 - e0.pi1) + (e1.pi2 - e0.pi2) + (e1.cs - e0.cs);
  near(sv, 3850 / 9, '社會價值'); assert.ok(e1.pi2 - e0.pi2 > sv, '私人利益大於社會價值');
  // 以數值方式再驗一次：反應函數疊代收斂到同一個均衡
  let q1 = 0, q2 = 0; for (let i = 0; i < 200; i++) { q1 = (110 - q2) / 2; q2 = (100 - q1) / 2; }
  near(q1, 40, '疊代 q1'); near(q2, 30, '疊代 q2');
}
has2('114-g3econ-E1', '1', ['q1 = 40', 'q2 = 30', '1600', '900', '2450']);
has2('114-g3econ-E1', '2', ['12100/9', '24200/9', '4000/9']); has2('114-g3econ-E1', '3', ['3850/9', '2150/9']);
// 只答對（一）的數字，（二）（三）不應拿高分
{
  const only = 'q1=40, q2=30, P=50, π1=1600, π2=900, CS=2450';
  assert.ok(C.gradeEssayPart(part('114-g3econ-E1', '2'), only).earned <= 2, '（二）不應只靠（一）的數字拿分');
  assert.ok(C.gradeEssayPart(part('114-g3econ-E1', '3'), only).earned <= 1, '（三）不應只靠（一）的數字拿分');
  // 學生常見寫法：直接列出 MR=MC 兩式也算有反應函數
  assert.ok(C.gradeEssayPart(part('114-g3econ-E1', '1'), '廠商1：120-2q1-q2=10；廠商2：120-q1-2q2=20').items.find(i => i.id === 'r1').earned > 0);
}

// ---- 經濟學第 2 題：開放經濟圖形 ----
{
  const full = '可貸資金市場：供給是國民儲蓄S，需求是國內投資I加淨資本流出NCO，NCO增加使需求右移，均衡實質利率上升。外匯市場：本國貨幣供給來自NCO向右移，需求來自淨出口NX，實質匯率下降，本國貨幣貶值，淨出口增加，NX=NCO。';
  const g = C.gradeEssayPart(part('114-g3econ-E2', '3'), full);
  assert.ok(g.earned >= 14, '完整作答應拿高分，實得 ' + g.earned);
  const wrong = '利率下降，本國貨幣升值，淨出口減少';
  assert.ok(C.gradeEssayPart(part('114-g3econ-E2', '3'), wrong).earned <= 3, '方向全錯不應拿分');
  assert.ok(C.gradeEssayPart(part('114-g3econ-E2', '1'), '減少').earned >= 1 && C.gradeEssayPart(part('114-g3econ-E2', '2'), '增加').earned >= 1);
}

// ---- 公共經濟學：Lindahl 數值例與 Samuelson ----
{
  const MC = 6, G = (8 + 4 - MC) / 2, tA = 8 - G, tB = 4 - G;
  assert.strictEqual(G, 3); assert.strictEqual(tA, 5); assert.strictEqual(tB, 1); assert.strictEqual(tA + tB, MC);
  assert.strictEqual(8 - 5, 3); assert.strictEqual(4 - 5, -1);       // 各付一半（t=3）時 A 要 5 盞、B 要 1 盞，兩者不一致
  assert.strictEqual(8 - 3, 5); assert.strictEqual(4 - 3, 1);
}
has2('114-g3pe-E2', '1', ['G* = 3', '5/6', '1/6']);
{
  const stu = '兩戶A、B共享路燈，公共財同量消費。協商人提出分攤比例hA+hB=1，每戶依自己的價格決定想要的盞數，MBA=tA。若gA不一致就重新調整分攤比例，直到數量一致，雙方都同意，達到柏瑞圖效率。';
  const g = C.gradeEssayPart(part('114-g3pe-E2', '1'), stu);
  assert.ok(g.earned >= 10 && g.earned < 20, 'Lindahl 協商：一般作答應得部分到多數分數，實得 ' + g.earned);
  const s2 = 'MBi=ti，各人價格相加tA+tB=MC，所以ΣMB=MC，即 Samuelson 條件。Lindahl 有搭便車與偏好顯示問題。';
  assert.ok(C.gradeEssayPart(part('114-g3pe-E2', '2'), s2).earned >= 10, 'Samuelson 推導應拿到多數分數');
}
// Ramsey：稅收固定、彈性相同時，把稅基從 1 種商品擴大到 2 種，超額負擔減半
{
  const eb = (ts) => ts.reduce((a, t) => a + t * t, 0), R1 = eb([2]), R2 = eb([1, 1]);
  assert.strictEqual(R1, 4); assert.strictEqual(R2, 2);
  assert.ok(ans('114-g3pe-E4', '1').includes('4t') && ans('114-g3pe-E4', '1').includes('2t'));
}

// ---- 產業經濟學：差別取價、集中度、關稅與配額（數值驗算）----
{
  const near = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, m + '：' + x + ' ≠ ' + y);
  const MC = 30;
  const QA = (100 - MC) / 2, PA = 100 - QA, QB = (90 - MC) / 6, PB = 90 - 3 * QB;
  near(QA, 35, 'QA'); near(PA, 65, 'PA'); near(QB, 10, 'QB'); near(PB, 60, 'PB');
  const piA = (PA - MC) * QA, piB = (PB - MC) * QB, csA = QA * (100 - PA) / 2, csB = QB * (90 - PB) / 2;
  near(piA, 1225, 'πA'); near(piB, 300, 'πB'); near(csA, 612.5, 'CSA'); near(csB, 150, 'CSB');
  near(piA + piB + csA + csB, 2287.5, '社會福利');
  const eA = 1 * PA / QA, eB = (1 / 3) * PB / QB;                  // |ε| = |dQ/dP| × P/Q
  near(eA, 13 / 7, 'εA'); near(eB, 2, 'εB');
  near((PA - MC) / PA, 1 / eA, '勒納 A'); near((PB - MC) / PB, 1 / eB, '勒納 B');
  assert.ok(eA < eB && PA > PB, '彈性較小的市場價格較高');
  // 數值法再驗一次：在每個市場掃描價格，利潤最大的價格要等於上面的解
  const best = (f) => { let b = null, bp = -1e9; for (let p = 31; p < 100; p += 0.01) { const v = f(p); if (v > bp) { bp = v; b = p; } } return b; };
  assert.ok(Math.abs(best(p => (p - MC) * (100 - p)) - 65) < 0.02); assert.ok(Math.abs(best(p => (p - MC) * (90 - p) / 3) - 60) < 0.02);
  // 若只能訂單一價格，利潤較低（差別取價提高利潤）
  const uni = (p) => (p - MC) * (Math.max(0, 100 - p) + Math.max(0, (90 - p) / 3)); let pu = best(uni);
  assert.ok(uni(pu) < piA + piB, '單一價格利潤應低於差別取價');
}
has2('114-g3ie-E2', '2', ['1525', '612.5', '762.5', '2287.5']);
{
  const hhi = (n) => n * Math.pow(100 / n, 2), cr4 = (n) => Math.min(4, n) * (100 / n);
  assert.deepStrictEqual([100, 10, 5].map(cr4), [4, 40, 80]); assert.deepStrictEqual([100, 10, 5].map(hhi), [100, 1000, 2000]);
  const g = C.gradeEssayPart(part('114-g3ie-E3', '1'), '市場A：CR4=4%，HHI=100；市場B：CR4=40%，HHI=1000；市場C：CR4=80%，HHI=2000');
  assert.strictEqual(g.earned, 12);
  const half = C.gradeEssayPart(part('114-g3ie-E3', '1'), '市場A：CR4=4%，HHI=100；市場B：CR4=40%，HHI=1000；市場C：CR4=100%，HHI=2000');
  assert.strictEqual(half.earned, 8, 'CR4 算錯一個市場只扣該市場的分數');
  const ent = C.gradeEssayPart(part('114-g3ie-E3', '3'), '熵指數 E = Σ s_i ln(1/s_i)，市占越平均 E 越大');
  assert.strictEqual(ent.earned, 5);
  const gini = C.gradeEssayPart(part('114-g3ie-E3', '3'), '吉尼係數：畫洛倫茲曲線，Gini = 洛倫茲曲線與 45 度線之間的面積除以 45 度線下方面積');
  assert.ok(gini.earned >= 4, '吉尼係數作答應拿到多數分數，實得 ' + gini.earned);
}
{
  // 關稅與配額：Cournot（P=110−Q，邊際成本 0，外國廠商有效成本 10）
  const q1 = 40, q2 = 30, Q = q1 + q2, P = 110 - Q, pi1 = P * q1, cs = Q * Q / 2, rev = 10 * q2;
  assert.strictEqual(P, 40); assert.strictEqual(pi1, 1600); assert.strictEqual(cs, 2450); assert.strictEqual(rev, 300);
  assert.strictEqual(cs + pi1 + rev, 4350);
  // 反應函數疊代
  let a = 0, b = 0; for (let i = 0; i < 200; i++) { a = (110 - b) / 2; b = (100 - a) / 2; }
  assert.ok(Math.abs(a - 40) < 1e-9 && Math.abs(b - 30) < 1e-9);
  // 配額 q2 = 30：本國廠商最適 q1 = (110−30)/2 = 40；配額具約束力（外國廠商想生產 35 > 30）
  assert.strictEqual((110 - 30) / 2, 40); assert.strictEqual((110 - 40) / 2, 35); assert.ok(35 > 30);
  const wQuota = cs + pi1; assert.strictEqual(wQuota, 4050); assert.strictEqual(4350 - 4050, rev);
  assert.strictEqual((P - 0) * q2, 1200);                           // 配額租：外國廠商利潤 1200（關稅下為 900）
}
has2('114-g3ie-E4', '1', ['4350']); has2('114-g3ie-E4', '2', ['4050']);
{
  const g1 = C.gradeEssayPart(part('114-g3ie-E4', '1'), 'q1=(110-q2)/2，q2=(100-q1)/2，q1=40，q2=30，P=40，利潤1600，CS=2450，福利 2450+1600+300=4350');
  assert.strictEqual(g1.earned, 10);
  const g2 = C.gradeEssayPart(part('114-g3ie-E4', '1'), 'q1=40，q2=30，P=40，利潤1600，CS=2450（忘了加關稅收入）');
  assert.ok(g2.earned === 6 || g2.earned === 8, '漏掉關稅收入應只扣福利那一項，實得 ' + g2.earned);
  const g3 = C.gradeEssayPart(part('114-g3ie-E4', '3'), '關稅下福利較高，因為關稅收入300歸政府，配額租歸外國廠商');
  assert.strictEqual(g3.earned, 5);
}
// 停滯性通膨：只有物價上升沒有產出下降，不應拿滿分；兩個面向都寫到才得定義分
{
  const p = part('114-g3fin-E1', '1');
  const lo = C.gradeEssayPart(p, '停滯性通膨就是物價一直上漲。');
  assert.ok(lo.earned <= 1, '只寫物價上漲不應拿到定義分數，實得 ' + lo.earned);
  const hi = C.gradeEssayPart(p, '停滯性通膨是產出下降、失業上升，同時物價上升。橫軸是實質產出，縱軸是物價，AD 負斜率，SRAS 正斜率。原油價格上漲使成本上升，SRAS 向左移，新均衡物價上升、產出下降。');
  assert.ok(hi.earned >= 7, '完整作答應拿高分，實得 ' + hi.earned);
}
// 名詞解釋：逆選擇不應被道德風險的答案拿滿分（兩個概念要區分）
{
  const mh = ans('114-g3fin-E2', '2');
  assert.ok(C.gradeEssayPart(part('114-g3fin-E2', '1'), mh).earned <= 2.5, '道德風險的答案不應在逆選擇拿到高分');
  assert.ok(C.gradeEssayPart(part('114-g3fin-E2', '2'), ans('114-g3fin-E2', '1')).earned <= 2.5, '逆選擇的答案不應在道德風險拿到高分');
}


/* ===== 113 年高考三級（產業經濟學、運輸經濟學；經濟學、經濟學與財政學概論、公共經濟學；農業經濟學、工程經濟學） ===== */
assert.deepStrictEqual(sub(113, '產業經濟學').map(q => q.points), [20, 30, 20, 30]);
assert.deepStrictEqual(sub(113, '運輸經濟學').map(q => q.points), [25, 25, 25, 25]);
assert.deepStrictEqual(sub(113, '產業經濟學')[0].categories, ['公平交易管理']);
assert.deepStrictEqual(sub(113, '運輸經濟學')[0].categories, ['交通行政']);
assert.strictEqual(shape('113-g3io-E1'), '10,10'); assert.strictEqual(shape('113-g3io-E2'), '10,10,10');
assert.strictEqual(shape('113-g3io-E3'), '10,10'); assert.strictEqual(shape('113-g3io-E4'), '10,10,10');
assert.strictEqual(shape('113-g3te-E1'), '12,13'); assert.strictEqual(shape('113-g3te-E2'), '12,13');
assert.strictEqual(shape('113-g3te-E3'), '10,15'); assert.strictEqual(shape('113-g3te-E4'), '12,13');
assert.strictEqual(part('113-g3te-E2', '1').figure, true);

// 產業經濟學第 2 題：Cournot n 家廠商（數值驗證公式）
for (const [a, c, n] of [[100, 20, 1], [100, 20, 3], [90, 10, 5], [60, 6, 9]]) {
  const q = (a - c) / (n + 1), Q = n * q, P = a - Q, cs = Q * Q / 2, pi = (P - c) * q;
  assert.ok(Math.abs(P - (a + n * c) / (n + 1)) < 1e-9);
  assert.ok(Math.abs(cs - n * n * (a - c) * (a - c) / (2 * (n + 1) * (n + 1))) < 1e-9);
  const W = cs + n * pi, Wc = (a - c) * (a - c) / 2;
  assert.ok(Math.abs((Wc - W) - (a - c) * (a - c) / (2 * (n + 1) * (n + 1))) < 1e-9, 'DWL = (a-c)^2/(2(n+1)^2)');
  // 對任一廠商偏離產量，利潤不會更高（Nash 均衡）
  for (const dq of [-3, -1, 1, 3]) { const qq = q + dq; if (qq < 0) continue; assert.ok((a - (Q - q + qq) - c) * qq <= pi + 1e-9); }
}
assert.ok(Math.abs((100 - 20) * (100 - 20) / 8 - 800) < 1e-9);  // 獨占 DWL（n=1）
// 第 3 題：外國獨占廠商與從量關稅
{
  const A = 100 - 30, W = (t) => { const Q = (A - t) / 2, P = 100 - Q; return Q * Q / 2 + t * Q; };
  let best = 0, bt = 0; for (let t = 0; t <= A; t += 0.01) { if (W(t) > best) { best = W(t); bt = t; } }
  assert.ok(Math.abs(bt - A / 3) < 0.02, '最適關稅 t* = (100−c)/3'); assert.ok(Math.abs(W(A / 3) - A * A / 6) < 1e-9); assert.ok(Math.abs(W(0) - A * A / 8) < 1e-9);
  for (const t of [0, 10, 20]) assert.ok(Math.abs(W(t) - (A - t) * (A + 3 * t) / 8) < 1e-9);
  assert.ok(Math.abs(W(A)) < 1e-9);
}
// 第 4 題：雙重邊際化數值
{
  const w = 60, Q = (100 - w) / 2, P = 100 - Q;
  assert.strictEqual(Q, 20); assert.strictEqual(P, 80); assert.strictEqual(Q * Q / 2, 200);
  assert.strictEqual((P - w) * Q, 400); assert.strictEqual((w - 20) * Q, 800); assert.strictEqual(3200 - (200 + 400 + 800), 1800);
  let bw = 0, bv = -1; for (let x = 20; x <= 100; x += 0.5) { const q = (100 - x) / 2, v = (x - 20) * q; if (v > bv) { bv = v; bw = x; } } assert.strictEqual(bw, 60);
  assert.strictEqual((100 - 20) / 2, 40); assert.strictEqual((60 - 20) * 40, 1600); assert.strictEqual(40 * 40 / 2, 800); assert.strictEqual(800 + 1600, 2400);
}
{ const a = C.stripHtml(E['113-g3io-E4'].parts[1].model_answer); ['40', '60', '1,600', '800', '2,400'].forEach(x => assert.ok(a.includes(x), '垂直整合答案應含 ' + x)); }
// 運輸經濟學第 1 題：Cobb-Douglas 規模報酬與成本彈性（α+β>1 ⇔ 規模經濟）
for (const [al, be] of [[0.6, 0.5], [0.3, 0.4], [0.5, 0.5], [0.8, 0.9]]) {
  const r = 2, w = 3, A = 1.7, f = (K, L) => A * Math.pow(K, al) * Math.pow(L, be);
  assert.ok(Math.abs(f(2 * 5, 2 * 7) / f(5, 7) - Math.pow(2, al + be)) < 1e-9);
  const tc = (Q) => { let best = Infinity; for (let K = 0.05; K < 400; K *= 1.002) { const L = Math.pow(Q / (A * Math.pow(K, al)), 1 / be); best = Math.min(best, r * K + w * L); } return best; };
  const e = (Math.log(tc(1.01 * 50)) - Math.log(tc(50))) / Math.log(1.01);
  assert.ok(Math.abs(e - 1 / (al + be)) < 0.02, '成本彈性應為 1/(α+β)，得 ' + e);
  assert.strictEqual(e < 0.99, al + be > 1.02 || (al + be > 1));
}
// 學生式作答：得到部分分數，不是 0 也不是滿分
{
  const g1 = C.gradeEssayPart(part('113-g3io-E4', '1'), '下游 Q=(100-w)/2，上游選 w=60，Q=20，P=80，CS=200，下游利潤400');
  assert.ok(g1.earned >= 6 && g1.earned < 10, '漏掉上游利潤與 DWL，實得 ' + g1.earned);
  const g2 = C.gradeEssayPart(part('113-g3io-E3', '2'), '最適關稅 t=(100-c)/3，c 越高最適關稅越低');
  assert.ok(g2.earned >= 4 && g2.earned < 10, '只有公式與成本關係，實得 ' + g2.earned);
  const g3 = C.gradeEssayPart(part('113-g3io-E2', '3'), 'DWL=(a-c)^2/(2(n+1)^2)，n 越多福利損失越少');
  assert.ok(g3.earned >= 5 && g3.earned < 10, '缺原因說明，實得 ' + g3.earned);
  const g4 = C.gradeEssayPart(part('113-g3te-E1', '2'), '規模報酬遞增：α+β>1。');
  assert.ok(g4.earned > 0 && g4.earned < 7, '只有規模報酬判斷，沒有成本面，實得 ' + g4.earned);
  const g5 = C.gradeEssayPart(part('113-g3te-E3', '2'), '市場力就是廠商訂價高於邊際成本的能力。');
  assert.ok(g5.earned < 5, '沒有談彈性，不應拿高分，實得 ' + g5.earned);
}


/* ===== 113 年高考三級：經濟學、經濟學與財政學概論、公共經濟學的申論題 ===== */
{
  const by113 = (subj) => data.essays.filter(q => q.year_roc === 113 && q.subject === subj);
  assert.strictEqual(data.essays.filter(q => q.year_roc === 113).length, 24);
  assert.deepStrictEqual(by113('經濟學').map(q => q.points), [25, 25]);
  assert.deepStrictEqual(by113('經濟學與財政學概論').map(q => q.points), [20, 30]);        // 50 分
  assert.deepStrictEqual(by113('公共經濟學').map(q => q.points), [25, 25, 25, 25]);         // 100 分
  by113('經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['金融保險', '統計', '經建行政']));
  by113('經濟學與財政學概論').forEach(q => assert.deepStrictEqual(q.categories, ['財經廉政']));
  by113('公共經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['經建行政']));
  assert.strictEqual(shape('113-g3fin-E1'), '10,10'); assert.strictEqual(shape('113-g3fin-E2'), '15,15');
  assert.strictEqual(shape('113-g3econ-E1'), '13,12'); assert.strictEqual(shape('113-g3econ-E2'), '13,12');
  assert.strictEqual(shape('113-g3pe-E1'), '8,8,9'); assert.strictEqual(shape('113-g3pe-E2'), '13,12');
  assert.strictEqual(shape('113-g3pe-E3'), '10,7,8'); assert.strictEqual(shape('113-g3pe-E4'), '13,12');
  // 圖形題與計算題的旗標
  ['113-g3econ-E1/1', '113-g3econ-E2/1'].forEach(k => { const [i, p] = k.split('/'); assert.strictEqual(part(i, p).figure, true, k); });
  ['113-g3fin-E1/1', '113-g3fin-E1/2', '113-g3fin-E2/1', '113-g3fin-E2/2', '113-g3pe-E1/1', '113-g3pe-E1/2', '113-g3pe-E3/1']
    .forEach(k => { const [i, p] = k.split('/'); assert.strictEqual(part(i, p).numeric, true, k); });

  // ---- 數值驗算 ----
  // 財經廉政第 1 題：效用極大化
  {
    const I = 300, grid = (U) => { let best = null, bu = -Infinity; for (let x = 0; x <= I; x += 0.5) { const y = I - x, u = U(x, y); if (u > bu + 1e-9) { bu = u; best = [x, y]; } } return best; };
    assert.deepStrictEqual(grid((x, y) => 2 * x + 3 * y), [0, 300]);
    assert.deepStrictEqual(grid((x, y) => Math.min(x, 2 * y)), [200, 100]);
  }
  // 財經廉政第 2 題：NPV 與 IRR
  {
    const npvX = r => -1000 + 1300 / (1 + r), npvY = r => -1000 + 1440 / Math.pow(1 + r, 2);
    assert.ok(Math.abs(npvX(0.3)) < 1e-9 && Math.abs(npvY(0.2)) < 1e-9);                       // IRR 為 30%、20%
    assert.ok(npvX(0.29) > 0 && npvX(0.31) < 0 && npvY(0.19) > 0 && npvY(0.21) < 0);
    const cross = 1440 / 1300 - 1; assert.ok(Math.abs(cross - 7 / 65) < 1e-12 && Math.abs(cross - 0.1077) < 1e-4);
    assert.ok(npvY(0.10) > npvX(0.10) && npvX(0.11) > npvY(0.11));                              // 交叉點兩側
    for (let r = 0.1078; r <= 0.2; r += 0.001) assert.ok(npvX(r) > npvY(r) && npvY(r) >= -1e-9);  // 10.77% < r ≤ 20%：兩法皆選 X
    for (let r = 0; r < 0.1076; r += 0.001) assert.ok(npvY(r) > npvX(r));                       // r < 10.77%：NPV 選 Y、IRR 選 X
    // 以第 0 期為基期，結論不變
    for (const r of [0.05, 0.1, 0.15, 0.25]) assert.ok((npvX(r) > npvY(r)) === (npvX(r) / (1 + r) > npvY(r) / (1 + r)));
  }
  // 公共經濟學第 1 題：多數決與 Lindahl
  {
    const MB = { 甲: [300, 260, 225, 170], 乙: [200, 150, 75, 50], 丙: [75, 60, 30, 0], 丁: [75, 50, 30, 0], 戊: [50, 30, 0, 0] };
    const price = 250 / 5; assert.strictEqual(price, 50);
    // 逐單位表決：MB > 價格者贊成，過半通過
    let qMajority = 0; for (let g = 1; g <= 4; g++) { const yes = Object.values(MB).filter(v => v[g - 1] > price).length; if (yes >= 3) qMajority = g; else break; }
    assert.strictEqual(qMajority, 2);
    // 各人偏好數量的中位數 = 丙（2 單位）
    const pref = Object.values(MB).map(v => { let q = 0; v.forEach((m, i) => { if (m > price) q = i + 1; }); return q; }).sort();
    assert.deepStrictEqual(pref, [0, 1, 2, 3, 4]);   // MB > 價格才贊成：戊 0、丁 1、丙 2、乙 3、甲 4
    assert.strictEqual(pref[2], 2);
    // Lindahl／效率：ΣMB 與 MC = 250
    const sums = [0, 1, 2, 3].map(i => Object.values(MB).reduce((a, v) => a + v[i], 0)); assert.deepStrictEqual(sums, [700, 550, 360, 220]);
    let qEff = 0; sums.forEach((s, i) => { if (s >= 250) qEff = i + 1; }); assert.strictEqual(qEff, 3);
    assert.strictEqual(sums[2] - 250, 110);                                                   // 多數決少提供第 3 單位的淨效益損失
    ['700', '550', '360', '220', '110'].forEach(x => assert.ok(ans('113-g3pe-E1', '2').includes(x) || ans('113-g3pe-E1', '3').includes(x), x));
  }
  // 公共經濟學第 3 題：資本稅的超額負擔
  {
    const total = 50, vc = k => 100 - k, vn = k => 80 - 2 * k;
    const solve = (t) => { let lo = 0, hi = total; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (vc(m) - t > vn(total - m)) lo = m; else hi = m; } return (lo + hi) / 2; };
    const k0 = solve(0), k1 = solve(6);
    assert.ok(Math.abs(k0 - 40) < 1e-9 && Math.abs(k1 - 38) < 1e-9);
    assert.ok(Math.abs(vc(k1) - 62) < 1e-9 && Math.abs(vn(total - k1) - 56) < 1e-9);
    const out = k => k * 100 - k * k / 2 + (total - k) * 80 - (total - k) * (total - k);   // 總產值（積分）
    assert.ok(Math.abs((out(k0) - out(k1)) - 6) < 1e-9, '超額負擔 = 6');
    assert.strictEqual(6 * k1, 228);
  }

  // ---- 學生作答情境：部分正確應得部分分數；常見錯誤不得拿到關鍵分數 ----
  {
    const g = (id, pid, txt) => C.gradeEssayPart(part(id, pid), txt), it = (r, rid) => r.items.find(i => i.id === rid).earned;
    // 完全替代：用相切條件求解（常見錯誤）不得拿分
    assert.strictEqual(g('113-g3fin-E1', '1', 'MRS=Px/Py，2/3=1 不成立，所以 X=150、Y=150').earned, 0);
    assert.strictEqual(g('113-g3fin-E1', '1', 'U=2X+3Y 是完全替代，MUx/Px=2<MUy/Py=3，全部買Y，X*=0，Y*=300').earned, 10);
    // 完全互補：L 型，X=2Y 且預算線
    assert.strictEqual(g('113-g3fin-E1', '2', '完全互補，X=2Y，X+Y=300，所以 Y=100，X=200').earned, 10);
    assert.ok(g('113-g3fin-E1', '2', 'X=2Y 但沒有代入預算線').earned <= 4);
    // NPV：Y 只折現一期（常見錯誤）→ 不得拿 r4
    const w = g('113-g3fin-E2', '1', 'NPVx=-1000+1300/(1+r)，NPVy=-1000+1440/(1+r)，所以 X 的 r<=30%，Y 的 r<=44%');
    assert.strictEqual(it(w, 'r4'), 0); assert.strictEqual(it(w, 'r3'), 4);
    // 部分作答：寫了 IRR 的比較，但沒有算 NPV 交叉點
    const g2 = g('113-g3fin-E2', '2', 'IRRx=30%，IRRy=20%，所以 IRR 一律選 X，兩者皆可行時 r<=20%');
    assert.ok(g2.earned >= 6 && g2.earned < 12, '只答 IRR 應拿部分分數，實得 ' + g2.earned);
    assert.strictEqual(it(g('113-g3fin-E2', '2', 'NPV_X>NPV_Y 要 r>10.8%，所以 10.8%<r<=20% 兩法一致'), 'r4'), 3);
    // 多數決：以邊際價值加總判斷（混淆效率條件）不得拿多數決的結論分
    assert.strictEqual(it(g('113-g3pe-E1', '1', '邊際價值加總 360 大於 250，所以提供 3 單位'), 'r3'), 0);
    // 只寫「Lindahl」名詞、結論錯誤（也是 2 單位）→ 低分
    assert.ok(g('113-g3pe-E1', '2', 'Lindahl 均衡也是2單位').earned <= 2);
    // 超額負擔：把稅收 228 當成超額負擔 → 0
    assert.strictEqual(g('113-g3pe-E3', '1', '稅收=6×38=228，超額負擔=228').earned, 0);
    assert.strictEqual(it(g('113-g3pe-E3', '1', '課稅前 Kc=40，Kn=10；課稅後 Kc=38，Kn=12，超額負擔=1/2×6×2=6'), 'r3'), 3);
    // 綠色通膨：畫成 AD 右移（需求拉動）不得拿成因分
    assert.strictEqual(it(g('113-g3econ-E2', '1', '碳中和使總合需求右移，物價上升且產出增加'), 'r2'), 0);
  }
  // 圖形題、計算題的「意見與建議」
  {
    const stateOf = (p, text) => { const gr = C.gradeEssayPart(p, text), st = { text, auto: {}, scores: {} }; gr.items.forEach(i => { st.auto[i.id] = i.earned; st.scores[i.id] = i.earned; }); return st; };
    const has = (f, kind, re) => f.points.some(x => x.kind === kind && re.test(x.text));
    const pf = part('113-g3econ-E2', '1');
    let f = C.feedbackEssayPart(pf, stateOf(pf, '碳中和使成本上升，所以物價上升。'));
    assert.ok(has(f, 'tip', /要求繪圖.*橫軸/));
    const pc = part('113-g3pe-E3', '1');
    f = C.feedbackEssayPart(pc, stateOf(pc, '超額負擔就是課稅造成的福利損失，資本會移到非營利事業。'));
    assert.ok(has(f, 'tip', /幾乎沒有數字/) && has(f, 'tip', /這是計算題/) && f.points.some(x => /常見錯誤/.test(x.text)));
    f = C.feedbackEssayPart(pc, stateOf(pc, '無稅時 Kc=40，Kn=10；課稅後 Kc=45，Kn=5，超額負擔=12'));
    assert.ok(has(f, 'tip', /結果沒對上/));
    const full = C.feedbackEssayPart(pc, stateOf(pc, C.stripHtml(pc.model_answer)));
    assert.ok(has(full, 'good', /幾乎都有寫到/));
  }
}


const y113 = data.essays.filter(q => q.year_roc === 113);
assert.strictEqual(y113.length, 24);
assert.deepStrictEqual(sub(113, '農業經濟學').map(q => q.points), [15, 30, 30, 25]);          // 共 100 分
assert.deepStrictEqual(sub(113, '工程經濟學').map(q => q.points), [25, 25, 25, 25]);
sub(113, '農業經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['農業行政']));
sub(113, '工程經濟學').forEach(q => assert.deepStrictEqual(q.categories, ['工業工程']));
assert.strictEqual(shape('113-g3agr-E1'), '15'); assert.strictEqual(shape('113-g3agr-E2'), '15,15');
assert.strictEqual(shape('113-g3agr-E3'), '15,15'); assert.strictEqual(shape('113-g3agr-E4'), '10,15');
assert.ok(E['113-g3agr-E2'].parts.every(p => p.figure), '113 農業經濟學第 2 題兩小題都要求繪圖');
assert.ok(!part('113-g3agr-E4', '1').figure && part('113-g3agr-E4', '2').figure, '第 4 題（二）要求繪圖');
['113-g3eng-E1', '113-g3eng-E2', '113-g3eng-E3', '113-g3eng-E4'].forEach(id => E[id].parts.forEach(p => assert.ok(p.calc, id + ' 應標記 calc')));
// 純申論科目，題庫沒有選擇題
assert.ok(!bank.questions.some(q => q.year_roc === 113 && (q.subject === '農業經濟學' || q.subject === '工程經濟學')));

// --- 工程經濟學：以程式獨立驗算參考答案 ---
{
  const f = (i, n) => ({ ap: i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1), af: i / (Math.pow(1 + i, n) - 1), ag: 1 / i - n / (Math.pow(1 + i, n) - 1) });
  const pv = (cf, i) => cf.reduce((a, c, t) => a + c / Math.pow(1 + i, t), 0);
  const irr = (cf) => { let lo = -0.9, hi = 5; for (let k = 0; k < 300; k++) { const m = (lo + hi) / 2; if (pv(cf, m) > 0) lo = m; else hi = m; } return lo; };
  // 第 1 題：年等值成本
  const q1 = f(0.10, 5), eac = 450000 * q1.ap - 90000 * q1.af + 150000 + 20000 * q1.ag;
  assert.ok(Math.abs(eac - 290170) < 1 && Math.abs(eac / 10000 - 29.017) < 0.001);
  has2('113-g3eng-E1', '1', ['118,709', '14,742', '36,203', '290,170', '29.02']);
  // 第 2 題：稅後現金流量（權益與不含融資）
  const dep = [200000, 320000, 192000, 57600], intr = [40000, 30000, 20000, 10000];
  const bv = 1000000 - dep.reduce((a, b) => a + b, 0), gainTax = (400000 - bv) * 0.3;
  const eq = [-200000], un = [-1000000];
  for (let t = 0; t < 4; t++) {
    const tax = (420000 - dep[t] - intr[t]) * 0.3;
    eq.push(420000 - 200000 - intr[t] - tax + (t === 3 ? 400000 - gainTax : 0));
    un.push(420000 - (420000 - dep[t]) * 0.3 + (t === 3 ? 400000 - gainTax : 0));
  }
  assert.strictEqual(bv, 230400); assert.strictEqual(gainTax, 50880);
  assert.deepStrictEqual(eq, [-200000, 126000, 169000, 137600, 453400]);
  assert.deepStrictEqual(un, [-1000000, 354000, 390000, 351600, 660400]);
  assert.ok(Math.abs(pv(eq, 0.1) - 467274) < 1 && Math.abs(pv(un, 0.1) - 359357) < 1);
  has2('113-g3eng-E2', '1', ['230,400', '169,600', '50,880', '453,400', '467,274', '359,357']);
  // 第 3 題：增量 IRR
  const A1 = [-5000, 3200, 4000], A2 = [-7500, 5000, 5200], A3 = [-6000, 4500, 3850], d = (a, b) => a.map((x, k) => x - b[k]);
  assert.ok(Math.abs(irr(A1) - 0.2699) < 1e-3 && Math.abs(irr(A2) - 0.2302) < 1e-3 && Math.abs(irr(A3) - 0.2595) < 1e-3);
  assert.deepStrictEqual(d(A3, A1), [-1000, 1300, -150]); assert.deepStrictEqual(d(A2, A3), [-1500, 500, 1350]);
  assert.ok(Math.abs(irr(d(A3, A1)) - 0.172) < 1e-3 && Math.abs(irr(d(A2, A3)) - 0.1299) < 1e-3);
  assert.ok(pv(A2, 0.1) > pv(A3, 0.1) && pv(A3, 0.1) > pv(A1, 0.1), 'NPV 排序應為 A2 > A3 > A1');
  has2('113-g3eng-E3', '1', ['17.2%', '12.99%', '選擇 A2']);
  // 第 4 題：終值與年金
  const F = 4500000 * Math.pow(1.02, 3), A = F * 0.03 / (Math.pow(1.03, 3) - 1);
  assert.ok(Math.abs(F - 4775436) < 1 && Math.abs(A - 1544999) < 2);
  has2('113-g3eng-E4', '1', ['4,775,436', '1,544,999']);
}

// --- 工程經濟學：學生答案的評分 ---
{
  const g = (id, text) => C.gradeEssayPart(part(id, '1'), text);
  // 第 1 題：算對
  let r = g('113-g3eng-E1', '年等值：450,000(A/P,10%,5)=118,709；殘值 90,000(A/F,10%,5)=14,742；梯度 20,000(A/G,10%,5)=36,203。EAC=118,709-14,742+150,000+36,203=290,170，除以 10,000 得 29.02 元/件');
  assert.ok(r.earned >= 22, '第 1 題完整答案應得高分，實得 ' + r.earned);
  // 第 1 題：把梯度當成每年增加 20,000 的錯誤列式（忘了 A/G）
  r = g('113-g3eng-E1', '期初成本 450,000×0.2638=118,709，殘值 14,742，操作維護成本每年 150,000，每年加 20,000，平均約 160,000，總成本約 263,967，每件 26.4 元');
  assert.ok(r.earned <= 12, '梯度與總成本錯誤不應拿高分，實得 ' + r.earned);
  assert.strictEqual(r.items.find(i => i.id === 'r4').earned, 0);
  assert.strictEqual(r.items.find(i => i.id === 'r6').earned, 0);
  // 第 1 題：忽略利息（450,000 / 5）
  r = g('113-g3eng-E1', '450,000/5=90,000，加上 150,000 與平均 40,000，減殘值 18,000，每年約 262,000，每件 26.2 元');
  assert.ok(r.earned <= 4, '忽略利息的答案不應拿分，實得 ' + r.earned);
  // 第 1 題：用現值法（PW）也要認
  r = g('113-g3eng-E1', '現值成本 PW=450,000+150,000(P/A,10%,5)+20,000(P/G,10%,5)-90,000(P/F,10%,5)=1,099,9' + '63，換算年值 EAC=290,170，每件 29.02 元');
  assert.ok(r.items.find(i => i.id === 'r5').earned === 4, 'PW 或 EAC 都應得分');
  // 第 2 題：完整答案
  r = g('113-g3eng-E2', '利息 40,000、30,000、20,000、10,000；折舊 200,000、320,000、192,000、57,600，帳面價值 230,400；所得稅 54,000、21,000、62,400、105,720；殘值利得 169,600，稅 50,880；稅後現金流量 -200,000、126,000、169,000、137,600、453,400；NPV=467,274>0，應購買');
  assert.ok(r.earned >= 22, '第 2 題完整答案應得高分，實得 ' + r.earned);
  // 第 2 題：不含融資的做法也應認得
  r = g('113-g3eng-E2', '折舊 200,000、320,000、192,000、57,600，帳面價值 230,400，殘值利得 169,600，利得稅 50,880。稅後現金流量 -1,000,000、354,000、390,000、351,600、660,400，NPV=359,357>0，值得購買');
  assert.ok(r.earned >= 14, '不含融資的稅後分析應得相當分數，實得 ' + r.earned);
  // 第 2 題：只算稅前淨現值（忘了折舊、利息與所得稅），不應拿高分
  r = g('113-g3eng-E2', '每年淨收益 540,000-120,000=420,000，殘值 400,000，NPV=-1,000,000+420,000(P/A,10%,4)+400,000(P/F,10%,4)=604,740>0，應購買');
  assert.ok(r.earned <= 4, '忽略稅與融資的答案不應拿高分，實得 ' + r.earned);
  // 第 3 題：完整答案與常見錯誤（直接選 IRR 最大者）
  r = g('113-g3eng-E3', '三方案 IRR 均大於 MARR，依投資額 A1、A3、A2 排序。A3-A1 現金流 -1,000、1,300、-150，增量 IRR=17.2%>10%，A3 優於 A1。A2-A3 現金流 -1,500、500、1,350，增量 IRR=12.99%>10%，A2 優於 A3。選擇 A2');
  assert.ok(r.earned >= 22, '第 3 題完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3eng-E3', 'A1 的 IRR 26.99% 最高，所以選 A1');
  assert.ok(r.earned <= 4, '只看 IRR 最大不應拿高分，實得 ' + r.earned);
  r = g('113-g3eng-E3', 'A2 比 A1 多投資 2,500，增額現金流 -2,500、1,800、1,200，增量 IRR=14.08%>10%，所以 A2 比 A1 好，選 A2');
  assert.ok(r.items.find(i => i.id === 'r6').earned === 4 && r.earned <= 12, 'A2 對 A1 的做法結論正確，但缺少 A3 的比較');
  // 第 4 題：完整答案與常見錯誤（忘了通膨）
  r = g('113-g3eng-E4', '第 3 年底設備價格 F=4,500,000×1.02^3=4,775,436。A=F(A/F,3%,3)=4,775,436×0.3235=1,545,000。從下一年底開始存，共 3 筆');
  assert.ok(r.earned >= 22, '第 4 題完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3eng-E4', 'A=4,500,000×(A/F,3%,3)=4,500,000×0.3235=1,455,750');
  assert.ok(r.earned <= 10, '忘了通貨膨脹不應拿高分，實得 ' + r.earned);
  assert.strictEqual(r.items.find(i => i.id === 'r5').earned, 0);
}

// --- 農業經濟學：學生答案的評分 ---
{
  const g = (id, pid, text) => C.gradeEssayPart(part(id, pid), text);
  // 第 1 題：完整與只寫碳稅
  let r = g('113-g3agr-E1', '1', '農業排放來源有稻田甲烷、畜牧糞尿與肥料氧化亞氮，占全國比重小且涉及糧食安全。工具：碳費、碳稅、排放交易；農業可透過自願減量專案與增量抵換取得碳權。補貼：綠色環境給付、稻田間歇灌溉、沼氣發電、電動農機汰換補助。輔助：MRV、碳足跡與碳標籤、技術輔導。評估成本效益與小農負擔。');
  assert.ok(r.earned >= 12, '第 1 題完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E1', '1', '政府可以對農民課碳稅，排放越多的人繳越多。');
  assert.ok(r.earned <= 3, '只寫碳稅一句不應拿高分，實得 ' + r.earned);
  // 第 2 題（一）：完整答案；常見錯誤（畫成農產品價格支持）
  r = g('113-g3agr-E2', '1', '目的是保障勞工最低生活與所得。橫軸為僱用量，縱軸為工資，勞動供給與需求交於均衡工資，最低工資高於均衡工資（價格下限）。完全競爭下工資上升、僱用量減少、產生失業（超額供給）。若為買方獨占市場，就業可增加。就業者所得提高但部分人失業，目的僅部分達成，雇主可能機械化或改用外籍移工。');
  assert.ok(r.earned >= 12, '第 2 題（一）完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E2', '1', '政府訂定最低價格收購稻穀，價格高於均衡價格，供給量大於需求量，政府收購過剩的稻穀，農民所得提高。');
  assert.ok(r.earned <= 6, '把最低工資當成農產品價格支持不應拿高分，實得 ' + r.earned);
  // 第 2 題（一）：完全競爭下只寫「保障勞工、工資提高」，沒有就業與失業分析
  r = g('113-g3agr-E2', '1', '最低工資可以保障勞工的基本生活，提高低薪者的所得，改善所得分配，所以政策有效。');
  assert.ok(r.earned <= 4 && r.items.find(i => i.id === 'r3').earned === 0, '沒有分析就業與失業不應拿高分，實得 ' + r.earned);
  // 第 2 題（二）：供給左移、價格上升、數量減少
  r = g('113-g3agr-E2', '2', '稻米供過於求，休耕減少耕地面積，供給線向左移，價格上升、產量減少。稻米需求缺乏彈性，農民總收益增加，並領休耕補貼，穩定稻價與所得，目的達成；但補貼有財政負擔，休耕地閒置，影響糧食安全。橫軸數量縱軸價格，均衡點由 E 移到 E\'。');
  assert.ok(r.earned >= 12, '第 2 題（二）完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E2', '2', '休耕之後需求線向左移動，價格下降，數量減少，所以政策失敗。');
  assert.ok(r.earned <= 6 && r.items.find(i => i.id === 'r3').earned <= 1.5, '方向錯誤（價格下降）不應拿高分，實得 ' + r.earned);
  // 第 3 題（一）與（二）
  r = g('113-g3agr-E3', '1', '市場失靈是指價格機能無法達到資源有效配置的社會最適狀態。原因有公共財（非排他、搭便車）、外部性、獨占等不完全競爭、資訊不對稱，以及共有資源過度使用，造成私人成本與社會成本不一致與無謂損失。');
  assert.ok(r.earned >= 12, '第 3 題（一）完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E3', '1', '市場失靈就是市場出了問題，政府要管。');
  assert.ok(r.earned <= 3, '空泛的答案不應拿高分，實得 ' + r.earned);
  r = g('113-g3agr-E3', '2', '案例：畜牧場糞尿與廢水污染，造成河川污染的外部成本，私人成本低於社會成本，養殖過度，市場失靈。政府以法規管制、稽查裁罰、課徵水污染防治費（污染者付費）、補貼沼氣發電與廢水處理設備，使外部成本內部化，雖有成效，但執行成本與小農負擔仍是問題。');
  assert.ok(r.earned >= 12, '第 3 題（二）完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E3', '2', '政府補貼農民，管制價格，進口調節，使市場失靈改善。');
  assert.ok(r.items.find(i => i.id === 'r2').earned <= 2 && r.earned <= 7, '沒有案例與失靈原因說明，不應拿高分，實得 ' + r.earned);
  // 第 4 題（一）（二）
  r = g('113-g3agr-E4', '1', '自由貿易協定是兩個以上的國家簽署協定，相互取消關稅與非關稅障礙，但對非會員國各自維持獨立的關稅與貿易政策，與關稅同盟不同，並需要原產地規則。效果有貿易創造與貿易轉向。');
  assert.ok(r.earned >= 8, '第 4 題（一）完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E4', '2', '臺灣是小國，紐西蘭液態乳免關稅後進口價降為國際價格 Pw。橫軸為鮮乳數量，縱軸為價格，畫出國內供給與需求。國內價格下降，消費量增加，國內生產量減少，進口量增加。消費者剩餘增加，生產者剩餘減少，關稅收入減少，社會淨福利增加。酪農與乳業受衝擊，政府應輔導與補償，並做產地標示。');
  assert.ok(r.earned >= 12, '第 4 題（二）完整答案應得高分，實得 ' + r.earned);
  r = g('113-g3agr-E4', '2', '免關稅後國內鮮乳價格上升，國內酪農獲利增加。');
  assert.ok(r.earned <= 4, '方向錯誤（價格上升）不應拿高分，實得 ' + r.earned);
}


// 評分不可被其他科目的參考答案輕易騙過：拿別科的答案作答，得分應低於一半
// 例外：概念或數字本來就相同的題目（不同科目的同一概念，或數字同構的計算題），不列入此檢查
const OVERLAP = [
  ['114-g3econ-E1', '114-g3ie-E4'],  // 兩題 Cournot 數字同構（均衡 40、30、利潤 1600）
  ['114-g3fin-E2', '115-g3pe-E2'],  // 道德風險
  ['114-g3fin-E2', '115-g3pe-E3'],  // 租稅資本化（財產稅）
  ['114-g3ie-E4', '115-g3mb-E1'],  // 關稅與配額的福利比較
  ['114-g3ie-E2', '114-g3tre-E1'],  // 差別取價與 Ramsey 定價（加成與需求彈性）
  ['114-g3agr-E3', '114-g3econ-E2'],  // 供需曲線移動的圖形分析（短期／長期、均衡價格變動）
  ['115-g3io-E4', '115-g3te-E2'],  // 雙邊市場／平台與交叉補貼（兩市場需求關聯、補貼）
  ['113-g3io-E1', '115-g3mb-E1'],  // 供需移動下價格、產量、消費者與生產者剩餘的變化
  ['113-g3io-E1', '113-g3te-E2'],  // 需求增加、廠商進入與長期供給曲線
  ['113-g3io-E1', '115-g3mb-E2'],  // 長期零利潤與廠商進入
  ['113-g3io-E2', '115-g3econ-E1'],  // Cournot 數量競爭與無謂損失
  ['113-g3te-E1', '114-g3ie-E1'],  // 規模經濟、平均成本與最小有效規模
  ['113-g3te-E1', '115-g3mb-E2'],  // 規模經濟下 MC < AC 與自然獨占
  ['113-g3te-E2', '114-g3agr-E3'],  // 供需曲線移動的圖形分析
  ['113-g3te-E2', '114-g3pe-E1'],  // 外部成本與庇古稅
  ['113-g3te-E3', '114-g3ie-E1'],  // 進入障礙、規模經濟與市場力
  ['113-g3te-E4', '115-g3mb-E2'],  // 自然獨占的 MC、AC 定價與無謂損失
  ['113-g3te-E4', '115-g3io-E3'],  // 差別訂價、價格高於邊際成本的無謂損失
  ['113-g3te-E4', '114-g3fin-E2'],  // 補貼與租稅扭曲
  ['113-g3econ-E1', '114-g3ie-E2'],  // 加價與勒納指數（獨占訂價、需求彈性）
  ['113-g3econ-E1', '115-g3mb-E2'],  // 獨占廠商 MR = MC 訂價
  ['113-g3econ-E2', '114-g3fin-E1'],  // 供給面衝擊：綠色通膨與停滯性通膨（SRAS 左移）
  ['113-g3econ-E2', '115-g3mb-E3'],  // 央行在物價與產出之間的取捨
  ['114-g3fin-E2', '113-g3agr-E3'],  // 市場失靈的原因：資訊不對稱、逆選擇、道德風險
  ['115-g3mb-E1', '113-g3agr-E4'],  // 關稅（免關稅）對國內價格、消費、生產與福利的影響
  ['115-g3pe-E1', '113-g3agr-E1'],  // 碳費、碳稅與庇古稅（外部成本內部化）
  ['113-g3agr-E1', '113-g3econ-E2'],  // 碳中和、減碳對成本與總合供給的影響（溫室氣體減量）
  ['113-g3te-E3', '113-g3econ-E1'],  // 市場力、加價與價格彈性（勒納指數）
  ['113-g3te-E4', '113-g3agr-E3'],  // 邊際成本定價與市場失靈下的政府介入
  ['113-g3econ-E1', '113-g3io-E2'],  // 獨占與 Cournot 下價格高於邊際成本、加價
  ['113-g3econ-E1', '113-g3te-E4'],  // 價格高於邊際成本與邊際成本定價
  ['113-g3pe-E4', '113-g3agr-E1']];  // 碳稅、碳費與減少溫室氣體排放
const overlap = (a, b) => OVERLAP.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
data.essays.forEach(q => q.parts.forEach(p => data.essays.forEach(q2 => {
  if (q2.subject === q.subject || overlap(q.id, q2.id)) return;
  q2.parts.forEach(p2 => { const g = C.gradeEssayPart(p, C.stripHtml(p2.model_answer)); assert.ok(g.earned <= p.points * 0.5, q.id + '/' + p.id + ' 被 ' + q2.id + '/' + p2.id + ' 的答案拿到 ' + g.earned + '/' + p.points); });
})));

console.log('申論題測試通過');
