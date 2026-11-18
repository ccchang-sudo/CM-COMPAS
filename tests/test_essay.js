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
assert.strictEqual(data.essays.length, 48);  // 114 年 24 題（7 科）＋ 115 年 24 題（7 科）
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

// 評分不可被其他科目的參考答案輕易騙過：拿別科的答案作答，得分應低於一半
// 例外：概念或數字本來就相同的題目（不同科目的同一概念，或數字同構的計算題），不列入此檢查
const OVERLAP = [['114-g3econ-E1', '114-g3ie-E4'],            // 兩題 Cournot 數字同構（均衡 40、30、利潤 1600）
  ['114-g3fin-E2', '115-g3pe-E2'],                              // 道德風險
  ['114-g3fin-E2', '115-g3pe-E3'],                              // 租稅資本化（財產稅）
  ['114-g3ie-E4', '115-g3mb-E1'],                              // 關稅與配額的福利比較
  ['114-g3ie-E2', '114-g3tre-E1'],                              // 差別取價與 Ramsey 定價（加成與需求彈性）
  ['114-g3agr-E3', '114-g3econ-E2'],                            // 供需曲線移動的圖形分析（短期／長期、均衡價格變動）
  ['115-g3io-E4', '115-g3te-E2']];                              // 雙邊市場／平台與交叉補貼（兩市場需求關聯、補貼）
const overlap = (a, b) => OVERLAP.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
data.essays.forEach(q => q.parts.forEach(p => data.essays.forEach(q2 => {
  if (q2.subject === q.subject || overlap(q.id, q2.id)) return;
  q2.parts.forEach(p2 => { const g = C.gradeEssayPart(p, C.stripHtml(p2.model_answer)); assert.ok(g.earned <= p.points * 0.5, q.id + '/' + p.id + ' 被 ' + q2.id + '/' + p2.id + ' 的答案拿到 ' + g.earned + '/' + p.points); });
})));

console.log('申論題測試通過');
