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
assert.strictEqual(data.essays.length, 314);  // 含 114 年高考三級貨幣銀行學 4 題與普考貨幣銀行學概要 5 題、115 年高考三級貨幣銀行學與普考貨幣銀行學概要各 4 題（見檔尾）；含 113 年貨幣銀行學（高考三級）與貨幣銀行學概要（普考）各 4 題（見檔尾）；以下為合併前的說明：  // 含 113、115 年普通考試旅運經營學概要各 4 題（見檔尾）；含 113、115 年高考三級旅運經營學各 4 題（見檔尾）；含 113 年普考觀光學概要 4 題、113 年高考三級觀光英語／觀光學／觀光日語 11 題（見檔尾）；含 113 年觀光資源規劃（高考三級）與觀光行銷學概要（普考）各 4 題；  // 含 113 年觀光資源規劃（高考三級）與觀光行銷學概要（普考）各 4 題；  // 含 114 年高考三級觀光學、觀光資源規劃各 4 題；含 115 年觀光類三科申論題 12 題（普考觀光學概要、觀光行銷學概要，高考三級觀光資源規劃，各 4 題）、115 年高考三級觀光學 4 題、觀光英語 4 題、觀光日語 3 題  // 含 113 年民法申論題 24 題（戶政、司法行政 9 題；法制／智財、財稅行政／財稅法務、普考財稅行政 6 題；公平交易管理、地政 9 題）；以下為合併前共同基礎 185 題的說明：  // 高考三級：113、114、115 年各 24 題（7 科）；財政學（財稅行政、會計／審計）113、114、115 年各 4 題；普考：115 年交通政策與行政概要 4 題、高考三級：115 年交通政策與行政 4 題；113 年與 114 年交通政策與行政概要（普考）、交通政策與行政（高考三級）各 4 題；普考：113 年農業經濟學概要、運輸經濟學概要各 4 題，115 年農業經濟學概要、運輸經濟學概要各 4 題，114 年農業經濟學概要 5 題、運輸經濟學概要 4 題；114 年民法申論題 6 題（高考三級財稅行政／財稅法務 2 題、普考財稅行政民法概要 2 題、高考三級公平交易管理 2 題）；另有 114 年地政民法 7 題（高考三級 3、普考 4）、114 年高考三級民法（司法行政 2、法制與智慧財產行政 2）、114 年戶政民法 8 題（高考三級 4、普考 4）
// exam / subject 字串要與選擇題題庫一致（有選擇題的科目）；以下為純申論科目（題庫沒有選擇題）
const ESSAY_ONLY = ['公共經濟學', '產業經濟學', '運輸經濟學', '農業經濟學', '工程經濟學', '運輸經濟學概要', '農業經濟學概要', '交通政策與行政', '交通政策與行政概要', '民法總則、親屬與繼承編', '民法（包括總則、物權、親屬與繼承編）', '民法與民事訴訟法', '民法物權編概要', '民法總則、親屬與繼承編概要', '觀光學', '觀光英語', '觀光日語', '觀光學概要', '觀光行銷學概要', '觀光資源規劃', '旅運經營學', '旅運經營學概要', '貨幣銀行學', '貨幣銀行學概要'];
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
assert.strictEqual(data.essays.filter(q => q.year_roc === 114 && q.exam === '公務人員高等考試三級考試').length, 69);  // 含 114 年貨幣銀行學 4 題、114 年旅運經營學 4 題、114 年觀光學 4 題、觀光資源規劃 4 題、觀光日語 3 題、觀光英語 3 題；9 科（含財政學 財稅行政、會計共 4 題）：經濟學、財政學概論、公共、產業、運輸、農業、工程、交通政策與行政；另加民法 財稅行政／財稅法務、公平交易管理各 2 題、地政 3 題、司法行政 2 題、法制與智慧財產行政 2 題、戶政 4 題
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
  assert.strictEqual(data.essays.filter(q => q.year_roc === 113 && q.exam === '公務人員高等考試三級考試' && q.subject !== '交通政策與行政').length, 65);  // 含 113 年貨幣銀行學 4 題；  // 含 113 年觀光資源規劃 4 題、觀光英語 4 題、觀光學 4 題、觀光日語 3 題；含 113 年民法 14 題（戶政 3、司法行政 2、法制／智財 2、財稅行政／財稅法務 2、公平交易管理 2、地政 3）
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


const y113 = data.essays.filter(q => q.year_roc === 113 && q.exam === '公務人員高等考試三級考試' && q.subject !== '交通政策與行政');  // 交通政策與行政另有測試
assert.strictEqual(y113.length, 65);  // 含 113 年貨幣銀行學 4 題；  // 28 題經濟財政類 + 113 年高考三級民法 14 題 + 113 年觀光資源規劃 4 題
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
  ['113-g3pft-E2', '115-ptmbk-E2'], ['114-g3fin-E2', '115-ptmbk-E2'], ['113-g3agr-E3', '115-ptmbk-E2'],  // 資訊不對稱：逆選擇、道德風險（社會保障金市場、名詞解釋、市場失靈）
  ['115-g3econ-E2', '115-g3mbk-E4'],  // 預期與貨幣政策有效性（菲力普曲線 vs 新興凱因斯／新興古典）
  ['115-g3mb-E4', '115-ptmbk-E4'],  // IS-LM 與政策有效性
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
  ['113-g3pe-E4', '113-g3agr-E1'],  // 碳稅、碳費與減少溫室氣體排放
  // 115 年普考新增題：與高考題主題相近（成本衝擊使供給左移、外部成本與庇古稅、自然獨占與邊際成本定價、補貼與外部效益）
  ['115-pagr-E2', '113-g3te-E2'], ['115-pagr-E2', '115-pte-E3'], ['115-pagr-E2', '113-g3econ-E2'], ['115-pagr-E2', '114-g3fin-E1'],
  ['115-pte-E1', '115-g3econ-E1'], ['115-pte-E1', '115-g3mb-E2'],
  ['115-pte-E2', '115-g3mb-E2'], ['115-pte-E2', '115-g3io-E4'], ['115-pte-E2', '113-g3econ-E1'],
  // 114 年普考新增題：與高考題主題相近（生產函數與技術、邊際成本定價、環境外部性、廣告與市場力、資料與模型）
  ['114-pte-E1', '115-g3io-E1'], ['114-pte-E2', '114-g3ie-E1'], ['114-pte-E2', '114-pagr-E1'],
  ['114-pte-E3', '113-g3agr-E3'], ['114-pte-E3', '114-g3pe-E1'], ['114-pte-E3', '115-g3econ-E1'], ['114-pte-E3', '115-g3pe-E1'], ['114-pte-E3', '115-g3mb-E2'], ['114-pte-E3', '115-g3io-E4'],
  ['114-pte-E4', '115-pagr-E4'], ['114-pte-E4', '113-g3pe-E4'], ['114-pagr-E1', '113-g3io-E1'],
  ['114-pagr-E4', '113-g3te-E3'], ['114-pagr-E4', '115-g3econ-E2'], ['114-pagr-E4', '115-g3io-E2'], ['114-pagr-E4', '115-g3io-E4'], ['114-pagr-E4', '115-pte-E4'],
  // 113 年普考新增題：與高考題主題相近（差別取價與差別訂價、NPV 與 IRR 的計算題、獨占缺點、平台與交叉補貼、需求決定因素與供需移動）
  ['113-pte-E3', '114-g3ie-E2'], ['113-pte-E3', '115-g3io-E3'], ['113-pte-E3', '115-g3io-E4'], ['113-pte-E2', '115-g3io-E4'], ['113-pte-E2', '115-g3econ-E1'],
  ['113-pte-E4', '113-g3fin-E2'], ['113-pte-E4', '113-g3eng-E3'], ['113-pte-E4', '114-g3eng-E1'], ['113-pte-E4', '114-g3eng-E4'], ['113-pte-E1', '114-g3eng-E1'],
  ['113-pte-E1', '115-pagr-E2'], ['113-pte-E1', '114-pagr-E4'],
  // 115 年交通政策與行政（概要）：與其他科目的主題相近（數位平台與雙邊市場、氣候調適與農業減碳）
  ['115-g3io-E4', '115-ptp-E1'], ['115-g3io-E4', '115-g3tp-E2'], ['115-g3tp-E4', '114-g3agr-E1'], ['115-pagr-E2', '115-g3tp-E2'],
  ['115-pte-E3', '113-g3pe-E3'], ['115-pte-E3', '113-g3agr-E2'], ['115-pte-E3', '115-g3mb-E2'], ['115-pte-E4', '115-g3io-E4'],
  // 113 年交通政策與行政概要：航空減碳與氣候調適，與農業減碳、碳稅與碳費的主題相近
  ['113-ptp-E2', '113-g3agr-E1'], ['113-ptp-E2', '113-g3pe-E4'], ['113-ptp-E2', '115-g3pe-E1'],
  // 113 年財政學（財稅行政、會計）：退休金制度、資訊不對稱與市場失靈、外部成本內部化（庇古稅、碳稅與碳費）
  ['113-g3pft-E2', '113-g3pe-E2'], ['113-g3pft-E2', '113-g3agr-E3'], ['113-g3pft-E2', '114-g3fin-E2'],
  ['113-g3pfa-E1', '113-g3te-E2'], ['113-g3pfa-E1', '114-g3pe-E1'], ['113-g3pfa-E1', '115-g3pe-E1'],
  // 114 年財政學（財稅行政、會計）：雙重紅利與碳稅／碳交易、福利函數、超額負擔與租稅歸宿，與其他科目的租稅效率、公平、圖形用語相近
  ['114-g3pf-E2', '113-g3agr-E1'], ['114-g3pf-E2', '113-g3pe-E4'], ['114-g3pf-E2', '115-g3pe-E1'], ['114-g3pf-E2', '115-g3mb-E1'], ['114-g3pf-E1', '115-g3fin-E2'],
  ['114-g3acc-E1', '113-g3econ-E1'], ['114-g3acc-E1', '115-g3fin-E1'], ['114-g3acc-E1', '115-pte-E3'], ['114-g3acc-E1', '115-pte-E4'],
  ['114-g3acc-E2', '113-g3pe-E3'], ['114-g3acc-E2', '115-g3mb-E2'], ['114-g3acc-E2', '115-pte-E2'], ['114-g3acc-E2', '114-g3pe-E4'], ['114-g3acc-E2', '115-g3fin-E1'],
  // 115 年高考三級財政學（財稅行政、會計審計）：與其他科目主題相同（貨物稅與薪資稅的超額負擔、無異曲線與效用、外部成本與減量政策、公共財的 Samuelson 條件、Lindahl 與多數決）
  ['115-g3pf-E1', '115-g3fin-E1'], ['115-g3pf-E1', '115-g3fin-E2'], ['115-g3pf-E2', '115-pte-E1'],
  ['115-g3pfa-E1', '113-g3pe-E1'], ['115-g3pfa-E1', '114-g3pe-E2'], ['115-g3pfa-E1', '115-g3pe-E4'],
  // 115 年民法申論題（戶政、公平交易管理、地政）：不同類科的同一民法概念（特有財產與 §1088、善意第三人與 §107）
  ['115-g3hr-E1', '115-g3land-E3'], ['115-g3hr-E3', '115-g3land-E1'],
  // 113 年戶政民法第 2 題（停車費）與 115 年交通政策與行政概要第 3 題（都市停車問題）：題目都談停車與收費，用語自然重疊
  ['115-ptp-E3', '113-g3hr-E2'],
  // 115 年智慧財產行政與法制（民法、民事訴訟法）：同為民法概念重疊（繼承 §1148、侵權 §184／§196、給付不能 §225／§226、不完全給付 §227、所有物返還 §767、善意取得 §948 與 §107）
  ['115-g3hr-E4', '115-g3law-E1'], ['115-g3ftc-E1', '115-g3law-E2'], ['115-g3land-E1', '115-g3ip-E1'], ['115-g3land-E1', '115-g3law-E3'],
  ['115-g3ip-E1', '115-g3law-E2'], ['115-g3ip-E1', '115-g3hr-E3'], ['115-g3ip-E2', '115-g3law-E2'], ['115-g3law-E1', '115-g3land-E2'], ['115-g3law-E1', '115-g3land-E1'], ['115-g3law-E1', '115-g3ftc-E2'],
  // 115 年觀光學／觀光英語與其他科目：數位化、AI、數位行銷、農村休閒與離島觀光（民宿、餐飲、特產、文化）等概念本來就會重疊
  ['115-ptp-E1', '115-g3tour-E4'], ['115-g3io-E4', '115-g3tour-E4'], ['115-g3io-E4', '115-g3ten-E4'], ['114-pagr-E4', '115-g3tour-E4'],
  ['114-pagr-E5', '115-g3tour-E3'], ['113-g3tp-E4', '115-g3tour-E1']];
// 115 年觀光行政三科：與交通、農業、碳稅等科目的主題本來就相同（低碳運具與減碳措施、承載量、國際旅客與航網、智慧科技風險、需求函數、差別取價、通路）
OVERLAP.push(
  ['115-g3tres-E1', '113-g3agr-E1'], ['115-g3tres-E1', '113-g3tp-E2'], ['115-g3tres-E1', '113-ptp-E2'], ['115-g3tres-E1', '114-g3tre-E2'], ['115-g3tres-E1', '114-ptp-E4'], ['115-g3tres-E1', '115-g3tp-E2'], ['115-g3tres-E1', '115-g3tp-E3'],
  ['115-g3tres-E2', '113-g3tp-E2'], ['115-g3tres-E2', '114-ptp-E4'], ['115-g3tres-E3', '113-g3tp-E1'], ['115-g3tres-E4', '113-g3tp-E2'],
  ['115-pmkt-E1', '114-pagr-E5'], ['115-pmkt-E1', '115-g3io-E4'], ['115-pmkt-E3', '113-g3te-E4'], ['115-pmkt-E3', '113-pte-E3'], ['115-pmkt-E3', '114-g3tre-E1'], ['115-pmkt-E3', '114-pte-E3'], ['115-pmkt-E3', '114-g3ie-E2'],
  ['115-ptour-E1', '113-g3tp-E4'], ['115-ptour-E1', '115-ptp-E4'], ['115-ptour-E1', '114-g3tp-E4'], ['115-ptour-E2', '113-g3pe-E4'], ['115-ptour-E2', '113-pte-E1'], ['115-ptour-E4', '113-g3tp-E1'],
  ['115-ptour-E2', '114-pagr-E5'], ['115-pmkt-E1', '114-pagr-E4'], ['115-pmkt-E3', '113-pte-E1'], ['115-g3tres-E1', '113-pte-E1'], ['115-g3tres-E1', '113-ptp-E1'], ['115-g3tres-E1', '113-g3tp-E1'], ['115-g3tres-E2', '114-g3agr-E1']);  // 農業六級產業（農業觀光）、租車市場訂價與需求、軌道與國際旅客航網等
// 113 年觀光行政（觀光資源規劃、觀光行銷學概要）：觀光資源與農業觀光、自行車與綠運輸、道路安全改善、環島高鐵效益、營運成本與效率等主題本來就會重疊
OVERLAP.push(['113-g3tres-E4', '114-pagr-E5'], ['113-g3tres-E4', '113-g3tp-E2'], ['113-g3tres-E2', '114-ptp-E4'], ['113-g3tres-E2', '114-g3tp-E1'], ['113-pmkt-E4', '113-pte-E3']);
// 113 年觀光學第 4 題（觀光科技與實體環境）：與資訊產業的數位科技、交通政策的智慧運輸與旅遊服務等主題本來就會重疊
OVERLAP.push(['115-g3io-E4', '113-g3tour-E4'], ['113-g3tp-E4', '113-g3tour-E4']);
// 114 年觀光行政（觀光學、觀光資源規劃）：觀光衝擊與農業觀光、交通旅遊、跨部會輔導農漁村休閒等主題本來就會重疊
OVERLAP.push(['114-g3tour-E1', '113-ptp-E1'], ['114-g3tres-E2', '114-g3agr-E1'], ['114-g3tres-E2', '114-ptp-E4']);
// 旅運經營學概要（普考）：旅遊電子商務與數位平臺、旅行業類型與利基市場、SWOT 行銷企劃、人力老化與留才等主題與其他科目本來就會重疊
OVERLAP.push(['115-g3io-E4', '113-ptrv-E1'], ['114-pagr-E4', '115-ptrv-E3'], ['114-pagr-E5', '115-ptrv-E3'], ['113-pte-E3', '113-ptrv-E3'], ['113-pagr-E1', '115-ptrv-E4']);
// 旅運經營學：航空、郵輪、平台、數位化與個資、農業觀光等主題與其他科目本來就會重疊
OVERLAP.push(['115-ptp-E1', '113-g3trv-E2'], ['115-g3tp-E2', '115-g3trv-E3'], ['115-g3io-E4', '115-g3trv-E1'], ['115-g3io-E4', '115-g3trv-E2'], ['115-g3io-E4', '113-g3trv-E2'],
  ['113-pte-E3', '115-g3trv-E3'], ['113-pte-E3', '113-g3trv-E4'], ['113-g3tp-E4', '115-g3trv-E2'], ['113-g3tp-E1', '115-g3trv-E3'], ['113-g3tp-E1', '113-g3trv-E1'], ['113-g3tp-E1', '113-g3trv-E4'],
  ['114-g3agr-E1', '113-g3trv-E1'], ['114-pagr-E5', '113-g3trv-E1'], ['115-ptp-E1', '113-g3trv-E2'], ['114-pagr-E4', '113-g3trv-E2'], ['114-g3tp-E2', '113-g3trv-E2'],
  // 114 年旅運經營學：人力資源、智慧技術與 AI、批發與通路等主題與其他科目重疊
  ['113-pagr-E1', '114-g3trv-E2'], ['115-g3pe-E2', '114-g3trv-E2'], ['115-ptp-E1', '114-g3trv-E2'], ['115-ptp-E1', '114-g3trv-E3'], ['115-ptp-E4', '114-g3trv-E3'], ['113-g3agr-E3', '114-g3trv-E3'],
  ['114-g3agr-E1', '114-g3trv-E3'], ['115-g3pe-E4', '114-g3trv-E3'], ['114-g3tp-E4', '114-g3trv-E3'], ['113-g3io-E4', '114-g3trv-E4'], ['114-pagr-E2', '114-g3trv-E4']);

OVERLAP.push(['113-pmbk-E3', '115-g3mb-E4']);  // 貨幣需求利率彈性、LM 曲線斜率與貨幣政策有效性（IS-LM）
// 114 年貨幣銀行學：總合供需（失業率誤判、日本寬鬆）、通膨目標、央行獨立性、債券供需圖，與經濟學各題概念本來就重疊
OVERLAP.push(['113-g3econ-E2', '114-g3mon-E4'], ['114-g3fin-E1', '114-g3mon-E4'], ['114-g3mon-E1', '115-g3econ-E2'], ['114-g3mon-E4', '115-pagr-E2'], ['114-pagr-E1', '114-pmon-E1'], ['114-g3mon-E1', '115-g3mb-E3'], ['113-g3econ-E2', '114-g3mon-E1'], ['114-g3fin-E1', '114-g3mon-E1'], ['114-g3econ-E2', '114-g3mon-E4'], ['113-g3econ-E2', '114-pmon-E4'], ['114-g3fin-E1', '114-pmon-E4'], ['114-pmon-E5', '115-g3mb-E3']);

const fam = (s) => { s = s.replace(/概要$/, ''); if (/^民法/.test(s)) return '民法'; if (/^(觀光|旅運)/.test(s)) return '觀光'; return /^(運輸經濟學|交通政策與行政)$/.test(s) ? '交通運輸' : s; };  // 運輸經濟學與交通政策與行政同屬交通運輸領域，用語本來就會重疊
const overlap = (a, b) => OVERLAP.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
data.essays.forEach(q => q.parts.forEach(p => data.essays.forEach(q2 => {
  if (fam(q2.subject) === fam(q.subject) || overlap(q.id, q2.id)) return;  // 同領域（含「概要」版）內容本來就會重疊
// 觀光類答案（長篇政策論述）拿去對其他科目既有的較泛用評分細目，門檻放寬為 80%；反過來，觀光類評分細目仍須維持 50%
  q2.parts.forEach(p2 => { const g = C.gradeEssayPart(p, C.stripHtml(p2.model_answer)); assert.ok(g.earned <= p.points * (fam(q2.subject) === '觀光' ? 0.8 : 0.5), q.id + '/' + p.id + ' 被 ' + q2.id + '/' + p2.id + ' 的答案拿到 ' + g.earned + '/' + p.points); });
})));

// 115 年普考（農業行政：農業經濟學概要；交通行政：運輸經濟學概要）各 4 題，每題 25 分
['pagr', 'pte'].forEach(k => {
  const qs = data.essays.filter(q => q.id.startsWith('115-' + k + '-'));
  assert.strictEqual(qs.length, 4); assert.ok(qs.every(q => q.points === 25 && q.exam === '公務人員普通考試'));
});
{ // 農業經濟學概要第 1 題：Qd=50-2P、Qs=20+P，均衡 P=10、Q=30，Ed=2/3、Es=1/3
  const P = 10, Q = 20 + P; assert.strictEqual(50 - 2 * P, Q);
  const g1 = C.gradeEssayPart(part('115-pagr-E1', '1'), '50-2P=20+P，P=10，Q=30。Ed=2×10/30=2/3，小於1，缺乏彈性');
  assert.ok(g1.earned >= 8 && g1.earned < 13);
  assert.ok(C.gradeEssayPart(part('115-pagr-E1', '1'), '需求彈性等於2').earned <= 4);
  assert.ok(C.gradeEssayPart(part('115-pagr-E1', '2'), 'Es=1×10/30=1/3，缺乏彈性').earned >= 4);
}
{ // 114 年普考：農業經濟學概要 5 題（20 分）、運輸經濟學概要 4 題（25 分）
  const a = data.essays.filter(q => q.id.startsWith('114-pagr-')), t = data.essays.filter(q => q.id.startsWith('114-pte-'));
  assert.strictEqual(a.length, 5); assert.ok(a.every(q => q.points === 20)); assert.strictEqual(t.length, 4); assert.ok(t.every(q => q.points === 25));
  assert.strictEqual(shape('114-pagr-E3'), '10,10'); assert.strictEqual(shape('114-pagr-E4'), '8,12');
  // 比較利益：兩題的機會成本皆為稻米 甲 0.5、乙 0.75 棉花
  assert.strictEqual(50 / 100, 0.5); assert.strictEqual(60 / 80, 0.75); assert.strictEqual(45 / 60, 0.75);
  assert.ok(C.gradeEssayPart(part('114-pagr-E3', '2'), '甲稻米乙棉花，機會成本 0.5 與 0.75').earned >= 5);
}

// 113 年普考（農業行政：農業經濟學概要；交通行政：運輸經濟學概要）
{
  const pa = data.essays.filter(q => q.id.startsWith('113-pagr-')), pt = data.essays.filter(q => q.id.startsWith('113-pte-'));
  assert.deepStrictEqual(pa.map(q => q.points), [30, 15, 30, 25]);  // 共 100 分
  assert.deepStrictEqual(pt.map(q => q.points), [25, 25, 25, 25]);
  assert.ok(pa.concat(pt).every(q => q.exam === '公務人員普通考試' && q.year_roc === 113));
  assert.strictEqual(shape('113-pte-E1'), '8,8,9'); assert.strictEqual(shape('113-pte-E3'), '8,9,8'); assert.strictEqual(shape('113-pte-E4'), '9,8,8');
  assert.strictEqual(shape('113-pagr-E1'), '15,15'); assert.strictEqual(shape('113-pagr-E3'), '20,10'); assert.strictEqual(shape('113-pagr-E4'), '15,10');
  // 運輸經濟學概要第 1 題：D = 3000 − 1.5P + 0.08Y
  const D = (P, Y) => 3000 - 1.5 * P + 0.08 * Y;
  assert.strictEqual(D(1000, 30000), 3900); assert.strictEqual(D(1600, 30000), 3000); assert.strictEqual(D(1000, 30000) - D(1600, 30000), 900);
  assert.strictEqual(D(1000, 40000) - D(1000, 30000), 800); assert.strictEqual(D(0, 40000), 6200);
  assert.ok(C.gradeEssayPart(part('113-pte-E1', '1'), 'D=5400-1.5P，P=1000時D=3900，P=1600時D=3000').earned >= 4);
  assert.ok(C.gradeEssayPart(part('113-pte-E1', '1'), '價格上升，需求曲線左移').earned <= 2, '把價格變動寫成曲線移動不應拿高分');
  // 農業經濟學概要第 4 題：成本與利潤極大化
  const Q = [0, 500, 1000, 1500, 2000, 2500, 3000], TC = [5000, 7500, 12500, 20000, 30000, 45000, 65000];
  const MC = Q.slice(1).map((q, i) => (TC[i + 1] - TC[i]) / (q - Q[i])), pi = Q.map((q, i) => 30 * q - TC[i]);
  assert.deepStrictEqual(MC, [5, 10, 15, 20, 30, 40]);
  assert.strictEqual(Math.max.apply(null, pi), 30000); assert.deepStrictEqual([pi[4], pi[5]], [30000, 30000]); assert.strictEqual(pi[6], 25000);
  assert.ok(C.gradeEssayPart(part('113-pagr-E4', '2'), 'MR=MC=30，產量2500，利潤=75000-45000=30000。產量超過2500時MR<MC，利潤減少').earned >= 9);
  assert.ok(C.gradeEssayPart(part('113-pagr-E4', '2'), '生產 3000 單位最賺錢').earned <= 2, '產量 3000 不是利潤極大');
  assert.ok(C.gradeEssayPart(part('113-pagr-E4', '1'), '固定成本5000，變動成本2500、7500、15000、25000、40000、60000').earned >= 4);
}

// 115 年交通政策與行政概要（普考，代號 42450）、交通政策與行政（高考三級，代號 33740）：各 4 題，每題 25 分
{
  ['115-ptp-', '115-g3tp-'].forEach(k => { const qs = data.essays.filter(q => q.id.startsWith(k)); assert.strictEqual(qs.length, 4); assert.ok(qs.every(q => q.points === 25 && q.year_roc === 115 && q.categories[0] === '交通行政')); });
  assert.strictEqual(shape('115-ptp-E1'), '10,15'); assert.strictEqual(shape('115-ptp-E2'), '8,17'); assert.strictEqual(shape('115-g3tp-E1'), '13,12'); assert.strictEqual(shape('115-g3tp-E2'), '15,10');
  // 航運產業升級方案：四大面向各 1 個評分細目，只答兩項不應滿分
  const full = C.gradeEssayPart(part('115-g3tp-E2', '1'), C.stripHtml(part('115-g3tp-E2', '1').model_answer));
  assert.strictEqual(full.earned, 15);
  const two = C.gradeEssayPart(part('115-g3tp-E2', '1'), '航運產業升級方案有綠色轉型，推動海運淨零與減碳；也推動智慧創新，建置港口社群系統數位化。');
  assert.ok(two.earned >= 6 && two.earned <= 9, '只答兩個面向應得約 8 分，實得 ' + two.earned);
  // 只寫概念、沒有具體作法不應高分
  assert.ok(C.gradeEssayPart(part('115-ptp-E2', '2'), '臺鐵要加強行車安全，提升安全').earned <= 17 * 0.5, '空泛答案不應超過一半');
  assert.ok(C.gradeEssayPart(part('115-ptp-E3', '2'), '興建停車場、機車停車格、智慧停車資訊、使用者付費、取締違規停車').earned >= 9);
}
// 113 年交通政策與行政概要（普考，代號 42650）、交通政策與行政（高考三級，代號 33540）：各 4 題，每題 25 分
{
  ['113-ptp-', '113-g3tp-'].forEach(k => { const qs = data.essays.filter(q => q.id.startsWith(k)); assert.strictEqual(qs.length, 4); assert.ok(qs.every(q => q.points === 25 && q.year_roc === 113 && q.categories[0] === '交通行政')); });
  assert.strictEqual(shape('113-g3tp-E1'), '13,12'); assert.strictEqual(shape('113-g3tp-E2'), '12,13'); assert.strictEqual(shape('113-g3tp-E3'), '13,12'); assert.strictEqual(shape('113-g3tp-E4'), '13,12');
  assert.strictEqual(shape('113-ptp-E1'), '12,13'); assert.strictEqual(shape('113-ptp-E2'), '13,12'); assert.strictEqual(shape('113-ptp-E3'), '12,13'); assert.strictEqual(shape('113-ptp-E4'), '25');
  // 汽車運輸業管理規則第 37 條：四項原則，完整答案滿分；漏掉兩項不應超過一半；空泛答案低分
  const p37 = part('113-ptp-E4', '1');
  assert.strictEqual(C.gradeEssayPart(p37, C.stripHtml(p37.model_answer)).earned, 25);
  const two = C.gradeEssayPart(p37, '應與當地政府協議定之，以維護當地交通秩序。市區設站間隔不得少於500公尺。');
  assert.ok(two.earned >= 10 && two.earned <= 15, '只答兩項應得約 13 分，實得 ' + two.earned);
  assert.notStrictEqual(C.gradeEssayPart(p37, '市區設站間隔不得少於 100 公尺').items[2].status, 'ok', '間隔數字寫錯，第三款不應拿滿分');
  assert.ok(C.gradeEssayPart(p37, '公路客運要遵守規定，配合地方').earned <= 5, '空泛答案不應高分');
  // 其餘題：只提一個名詞、沒有內容的答案不得高分
  assert.ok(C.gradeEssayPart(part('113-g3tp-E3', '1'), 'TPASS是通勤月票').earned <= 13 * 0.4, 'TPASS 只寫名詞不應高分');
  assert.ok(C.gradeEssayPart(part('113-g3tp-E4', '1'), 'One ID 就是刷臉').earned <= 13 * 0.5, 'One ID 只寫名詞不應高分');
  assert.ok(C.gradeEssayPart(part('113-g3tp-E3', '1'), '中央交通部公路局訂定政策並編列預算補助地方；地方政府依生活圈提案規劃方案、訂定票價、與公車捷運業者協議整合路網，並跨縣市協調分攤經費、定期檢討').earned >= 9);
  assert.ok(C.gradeEssayPart(part('113-ptp-E2', '1'), '推動永續航空燃料SAF並提供補助誘因，配合ICAO的CORSIA與2050淨零目標，汰換節能機隊、優化航路').earned >= 9);
}
// 114 年交通政策與行政概要（普考，代號 42150）、交通政策與行政（高考三級，代號 23940）：各 4 題，每題 25 分
{
  ['114-ptp-', '114-g3tp-'].forEach(k => { const qs = data.essays.filter(q => q.id.startsWith(k)); assert.strictEqual(qs.length, 4); assert.ok(qs.every(q => q.points === 25 && q.year_roc === 114 && q.categories[0] === '交通行政')); });
  assert.strictEqual(shape('114-g3tp-E1'), '9,9,7'); assert.strictEqual(shape('114-g3tp-E3'), '5,20'); assert.strictEqual(shape('114-ptp-E1'), '8,17'); assert.strictEqual(shape('114-ptp-E3'), '13,12');
  // 鐵路法第 56 條之 5：五款內容各自計分，只答事故檢討不應高分
  const rp = part('114-g3tp-E3', '2');
  assert.ok(C.gradeEssayPart(rp, '鐵路機構應檢討前一年度事故與異常事件，並提出預防措施。').earned <= 6, '只答事故檢討不應超過 6 分');
  assert.ok(C.gradeEssayPart(rp, '一、營運之安全理念及目標；二、安全管理之組織架構及實施方式；三、為確保及提升營運安全所採取或擬採取之措施；四、事故與異常事件之檢討及預防措施；五、其他與營運安全有關之重要事項，如教育訓練').earned >= 17);
  // 韌性：只寫抗災不應高分；三項策略要有
  assert.ok(C.gradeEssayPart(part('114-g3tp-E2', '2'), '加強防災，災後要盡快搶修').earned <= 4);
  assert.ok(C.gradeEssayPart(part('114-g3tp-E2', '2'), '預警與監測、備援與替代路線；迴避高風險潛勢地區、修訂設計與養護規範、提升復建效率；建立風險評估方法、資料庫、培育人才與跨域平台').earned >= 12);
  // 行人專用時相：只寫「為了安全」不應高分
  assert.ok(C.gradeEssayPart(part('114-ptp-E1', '2'), '為了保護行人安全').earned <= 5);
  assert.ok(C.gradeEssayPart(part('114-ptp-E1', '1'), '行人專用時相是路口各方向車輛皆為全紅，行人可同時穿越，分離人車衝突').earned >= 6);
  // 綠運輸：空泛答案不應高分
  assert.ok(C.gradeEssayPart(part('114-ptp-E4', '2'), '為了環保，讓大家愛護地球').earned <= 3);
}

// 115 年高考三級財政學（財稅行政，代號 31950；會計、審計，代號 32250、32350）申論題
{
  const near = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, m + '：' + x + ' ≠ ' + y);
  const tax = ['115-g3pf-E1', '115-g3pf-E2'].map(id => E[id]), acc = ['115-g3pfa-E1', '115-g3pfa-E2'].map(id => E[id]);
  assert.ok(tax.every(q => q.points === 25 && q.year_roc === 115 && q.subject === '財政學' && q.categories.join() === '財稅行政'));
  assert.ok(acc.every(q => q.points === 25 && q.year_roc === 115 && q.subject === '財政學' && q.categories.join() === '會計,審計'));
  assert.strictEqual(shape('115-g3pf-E1'), '25'); assert.strictEqual(shape('115-g3pf-E2'), '25');
  assert.strictEqual(shape('115-g3pfa-E1'), '5,10,10'); assert.strictEqual(shape('115-g3pfa-E2'), '5,10,10');
  // 要求繪圖與計算題旗標（意見與建議會依旗標給提醒）
  assert.ok(part('115-g3pf-E1', '1').figure && part('115-g3pf-E2', '1').figure && part('115-g3pfa-E2', '1').figure);
  ['1', '2', '3'].forEach(k => { assert.ok(part('115-g3pfa-E1', k).numeric && part('115-g3pfa-E1', k).calc); });

  // 會計審計第 1 題：以數值方法驗算
  const bis = (f, lo, hi) => { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; };
  const MBf = { A: G => 20 - G + 0.01 * 1000, B: G => 40 - 2 * G + 0.01 * 1000, C: G => 40 - G + 0.02 * 500 };
  const ideal = {}; ['A', 'B', 'C'].forEach(k => { ideal[k] = bis(G => MBf[k](G) - 60 / 3, 0, 100); });
  near(ideal.A, 10, 'A 理想量'); near(ideal.B, 15, 'B 理想量'); near(ideal.C, 30, 'C 理想量');
  const med = Object.values(ideal).sort((a, b) => a - b)[1]; near(med, 15, '中位數');
  const Gs = bis(G => MBf.A(G) + MBf.B(G) + MBf.C(G) - 60, 0, 100); near(Gs, 17.5, 'Samuelson 最適量');
  near(MBf.A(Gs) + MBf.B(Gs) + MBf.C(Gs), 60, 'Lindahl 價格之和'); near(MBf.A(Gs), 12.5, 'A 的 Lindahl 價格'); near(MBf.B(Gs), 15, 'B'); near(MBf.C(Gs), 32.5, 'C');
  assert.ok(med < Gs, '票決結果低於效率量');
  // 評分：只有結論、錯誤與完整答案
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E1', '1'), 'A偏好10單位，B偏好15單位，C偏好30單位').earned >= 3);
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E1', '1'), '三個人都偏好 20 單位').earned <= 2);
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E1', '2'), '三人平均 (10+15+30)/3 = 18.33').earned <= 2, '取平均不是中位數');
  assert.strictEqual(C.gradeEssayPart(part('115-g3pfa-E1', '3'), '30-G+50-2G+50-G=60，G*=17.5').earned, 6, '只有算式與答案、沒提 Samuelson 條件：r2 滿分、r1 半分');
  assert.strictEqual(C.gradeEssayPart(part('115-g3pfa-E1', '3'), 'Samuelson條件：ΣMB=MC=60，30-G+50-2G+50-G=60，G*=17.5').earned, 8);
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E1', '3'), '所以均衡數量 G = 15').items.find(i => i.id === 'r2').earned === 0, '15 不是 Samuelson 條件的答案');

  // 會計審計第 2 題：由偏好表重算
  const prefs = { A: 'KMNL', B: 'NLMK', C: 'MLNK', D: 'MNLK' }, axis = 'KLMN';
  const util = (v, x) => 4 - prefs[v].indexOf(x);   // 第 1 名 = 4
  const peaks = (v) => { let n = 0; for (let i = 0; i < 4; i++) { const l = i > 0 ? util(v, axis[i - 1]) : -1, r = i < 3 ? util(v, axis[i + 1]) : -1; if (util(v, axis[i]) > l && util(v, axis[i]) > r) n++; } return n; };
  assert.deepStrictEqual(['A', 'B', 'C', 'D'].map(peaks), [2, 2, 1, 1]);   // A、B 雙峰；C、D 單峰
  const beat = (x, y) => { let c = 0; for (const v of 'ABCD') if (prefs[v].indexOf(x) < prefs[v].indexOf(y)) c++; return c; };
  const wins = {}; for (const x of 'KLMN') { wins[x] = 0; for (const y of 'KLMN') if (x !== y) { assert.notStrictEqual(beat(x, y), 2, '無平手'); if (beat(x, y) > beat(y, x)) wins[x]++; } }
  assert.deepStrictEqual(wins, { K: 0, L: 1, M: 3, N: 2 });   // M 為孔多瑟贏家，沒有循環
  assert.strictEqual(beat('L', 'K'), 3); assert.strictEqual(beat('M', 'K'), 3); assert.strictEqual(beat('N', 'K'), 3);
  assert.strictEqual(beat('M', 'L'), 3); assert.strictEqual(beat('N', 'L'), 3); assert.strictEqual(beat('M', 'N'), 3);
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E2', '3'), '兩兩對決結果：K對L，L勝；K對M，M勝；K對N，N勝；L對M，M勝；L對N，N勝；M對N，M勝。M贏過所有計畫，是孔多瑟贏家。').earned >= 9);
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E2', '3'), 'M 是第一名票數最多的計畫（2 票），所以 M 勝出').earned <= 4, '只數第一名票數不是兩兩對決');
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E2', '2'), '會有投票矛盾，因為 A、B 是雙峰偏好，一定會循環').earned <= 3, '雙峰偏好不等於一定循環');
  assert.ok(C.gradeEssayPart(part('115-g3pfa-E2', '1'), 'A董與B董是雙峰偏好，C董與D董是單峰偏好').earned >= 3);

  // 財稅行政第 1 題：Cobb-Douglas U = ln C + ln ℓ 的勞動供給為垂直線（ℓ 固定為一半），仍有超額負擔
  { const w = 10, t = 0.2, Tm = 1;
    const best = (wage, lump) => { const l = bis(x => (-wage / (wage * (Tm - x) - lump)) + 1 / x, 0.01, Tm - lump / wage - 1e-6); return { l, C: wage * (Tm - l) - lump, U: Math.log(wage * (Tm - l) - lump) + Math.log(l) }; };
    const e0 = best(w, 0), e1 = best(w * (1 - t), 0);
    near(e0.l, 0.5, '稅前休閒'); near(e1.l, 0.5, '課稅後休閒不變（勞動供給垂直）');
    const rev = t * w * (Tm - e1.l); near(rev, 1, '稅收');
    const e2 = best(w, rev);   // 同額稅收的定額稅
    assert.ok(e2.U > e1.U + 1e-4, '定額稅下效用較高，代表薪資稅有超額負擔');
    // 等價的定額稅額 X：使定額稅後效用等於薪資稅後效用，超額負擔 = X − 稅收
    const X = bis(x => best(w, x).U - e1.U, 0, 3); near(X, 10 - Math.sqrt(80), 'EV 定額稅額'); assert.ok(X - rev > 0.05, '超額負擔為正');
  }
  assert.ok(C.gradeEssayPart(part('115-g3pf-E1', '1'), '勞動供給垂直表示工時不變，所以課稅不會造成超額負擔').earned <= 9, '結論寫反不應高分');
  assert.strictEqual(C.gradeEssayPart(part('115-g3pf-E1', '1'), '勞動供給垂直表示工時不變，所以課稅不會造成超額負擔').items.find(i => i.id === 'r1').earned, 0);

  // 財稅行政第 2 題：MSB = 100 − bQ，真實 MSC = 20 + Q，政府以 MSC′ = Q 決策（低估 20）
  const dwl = (b) => { const Qs = 80 / (b + 1), Qg = 100 / (b + 1); let a = 0; const n = 100000, h = (Qg - Qs) / n; for (let i = 0; i < n; i++) { const q = Qs + (i + 0.5) * h; a += ((20 + q) - (100 - b * q)) * h; } return { Qs, Qg, a }; };
  [[4, 16, 20, 40], [1, 40, 50, 100], [0.25, 64, 80, 160]].forEach(([b, Qs, Qg, A]) => { const r = dwl(b); near(r.Qs, Qs, 'Q*'); near(r.Qg, Qg, 'Qg'); assert.ok(Math.abs(r.a - A) < 0.01, 'b=' + b + ' DWL 應為 ' + A + '，實得 ' + r.a); near(200 / (b + 1), A, '公式 Δ^2/[2(b+d)]'); });
  assert.ok(dwl(4).a < dwl(1).a && dwl(1).a < dwl(0.25).a, 'MSB 愈陡（缺乏彈性），無謂損失愈小');
  // Weitzman：以價格工具（稅）處理同一低估時，損失 = Δ^2 b^2 /[2 d^2 (b + d)]（d = 1）；MSB 愈陡，稅的損失愈大
  const taxDwl = (b) => 0.5 * 400 * b * b / (b + 1);
  near(taxDwl(1), dwl(1).a, '斜率相等時兩工具損失相同'); assert.ok(taxDwl(0.25) < dwl(0.25).a && taxDwl(4) > dwl(4).a);
  const q2 = part('115-g3pf-E2', '1');
  assert.strictEqual(C.gradeEssayPart(q2, '政府低估成本，MSB 愈平坦，無謂損失愈小').items.find(i => i.id === 'r5').earned, 0, '方向寫反不得分');
  assert.ok(C.gradeEssayPart(q2, '政府低估成本使目標減量Qg大於最適Q*。MSB愈缺乏彈性（愈陡），無謂損失愈小；MSB愈富有彈性（愈平坦），無謂損失愈大').items.find(i => i.id === 'r5').earned === 7);
  assert.ok(C.gradeEssayPart(q2, 'cap-and-trade 會有無謂損失').earned <= 6, '空泛答案不應高分');
}

console.log('申論題測試通過');

// ===== 113 年高考三級 財政學（財稅行政、會計）申論題 =====
{
  const g = (id, pid, t) => C.gradeEssayPart(part(id, pid), t);
  ['113-g3pft-E1', '113-g3pft-E2'].forEach(id => assert.deepStrictEqual(E[id].categories, ['財稅行政']));
  ['113-g3pfa-E1', '113-g3pfa-E2'].forEach(id => assert.deepStrictEqual(E[id].categories, ['會計']));
  ['113-g3pft-E1', '113-g3pft-E2', '113-g3pfa-E1', '113-g3pfa-E2'].forEach(id => { assert.strictEqual(E[id].points, 25); assert.strictEqual(E[id].subject, '財政學'); assert.strictEqual(E[id].exam, '公務人員高等考試三級考試'); });
  assert.strictEqual(shape('113-g3pft-E1'), '10,15'); assert.strictEqual(shape('113-g3pft-E2'), '10,15');
  assert.strictEqual(shape('113-g3pfa-E1'), '13,12'); assert.strictEqual(shape('113-g3pfa-E2'), '15,10');
  assert.ok(part('113-g3pft-E1', '1').figure && part('113-g3pft-E1', '2').figure, '生命週期模型兩小題皆要求繪圖');
  // 題庫已有同科目的選擇題，exam／subject 需一致（上方 ESSAY_ONLY 檢查已涵蓋）；類科在題庫為 [財稅行政, 會計]
  assert.ok(bank.questions.some(q => q.year_roc === 113 && q.subject === '財政學' && q.categories.includes('財稅行政') && q.categories.includes('會計')));

  // 生命週期模型：借款者的替代效果與所得效果同方向；非邊際影響要講出轉折點與兩個切點
  assert.ok(g('113-g3pft-E1', '1', '借款者的稅後利率 r(1-t) 下降，預算線變平坦。替代效果使現在消費增加，所得效果也使現在消費增加，所以借款增加。').earned >= 6);
  assert.ok(g('113-g3pft-E1', '1', '課稅使儲蓄減少').earned <= 2);
  const w1 = g('113-g3pft-E1', '2', '利息所得免稅，儲蓄端預算線不變；利息費用可扣除，借款端利率變成 r(1-t)，預算線在稟賦點轉折，左陡右平，成為非凸。原本儲蓄者在 A 點，新的借款段有 B 點，若 UB>UA，儲蓄者跳到 B 變成借款者，是非邊際的離散跳躍。');
  assert.ok(w1.earned >= 12, '完整的非邊際影響說明應得高分，實得 ' + w1.earned);
  assert.ok(g('113-g3pft-E1', '2', '課稅會使儲蓄者減少儲蓄，因為替代效果與所得效果').earned <= 4);

  // 社會保障金：條列 5 項理論依據，只寫一項只拿一部分
  const s5 = g('113-g3pft-E2', '1', '1.短視；2.逆選擇；3.道德風險與搭便車；4.所得重分配；5.市場不完全與規模經濟');
  assert.strictEqual(s5.earned, 10);
  assert.ok(g('113-g3pft-E2', '1', '個人會短視，儲蓄不足，所以政府要強制').earned <= 4);
  // 勞保與勞退新制：把兩制說反或只寫一邊，不能拿滿分
  assert.ok(g('113-g3pft-E2', '2', '勞保是確定給付制，隨收隨付，年金為平均月投保薪資乘年資乘 1.55%，少子高齡化使基金耗盡，政府要撥補。').earned >= 6);
  assert.ok(g('113-g3pft-E2', '2', '勞保是確定給付制，隨收隨付').earned <= 6);
  assert.ok(g('113-g3pft-E2', '2', '勞退新制是個人專戶確定提撥制，雇主提繳 6%，按專戶本金與收益除以平均餘命，沒有基金缺口但有投資風險').earned >= 6);

  // 外部性政策工具
  assert.ok(g('113-g3pfa-E1', '1', '皮古稅的稅額等於邊際外部成本，使外部成本內部化，達到社會最適產量。').earned >= 3);
  assert.ok(g('113-g3pfa-E1', '1', '排放費是對每單位排放量收費，先訂排放標準，廠商比較邊際減量成本與費率。').earned >= 3);
  assert.ok(g('113-g3pfa-E1', '1', '政府要管制污染').earned <= 2);
  const c2 = g('113-g3pfa-E1', '2', '皮古稅與排放費都是價格工具，使外部成本內部化；差別在皮古稅追求社會最適、稅率等於邊際外部成本，排放費為達成既定標準。排放費與總量管制與交易都是市場誘因，成本有效；差別是排放費是價格工具，總量管制是數量工具，排放總量確定、價格不確定。');
  assert.strictEqual(c2.earned, 12);
  // 預算：追加預算與特別預算的條件不能互換
  assert.ok(g('113-g3pfa-E2', '1', '特別預算是國防緊急設施或戰爭、國家經濟重大變故、重大災變，在年度總預算之外另行編列。').earned >= 5);
  assert.ok(g('113-g3pfa-E2', '1', '追加預算是依法律增加業務、增設新機關，或重大事故經費超過法定預算，是總預算通過後的補充，準用總預算程序。').earned >= 6);
  assert.ok(g('113-g3pfa-E2', '1', '兩種預算都是政府的預算').earned <= 2);
  assert.strictEqual(g('113-g3pfa-E2', '2', '預算法第 23 條公債收入不得充經常支出；公共債務法債限為前三年度名目 GDP 平均數的 40.6%，每年舉債額度不得超過歲出總額 15%；舉債須編入預算並經立法院審議。').earned, 10);
  assert.ok(g('113-g3pfa-E2', '2', '可以發行公債來籌措財源').earned <= 2);
  // 數字內容在參考答案中
  has2('113-g3pfa-E2', '2', ['40.6%', '15%', '第 23 條']);
  has2('113-g3pft-E2', '2', ['1.55%', '0.775%', '3,000', '6%']);
  has2('113-g3pfa-E2', '1', ['第 79', '第 83', '國防緊急設施', '重大災變']);
}
console.log('113 年財政學（財稅行政、會計）申論題測試通過');

/* ===== 114 年高考三級財政學（財稅行政 22250、會計 22550）申論題 ===== */
(function () {
  const pf1 = part('114-g3pf-E1', '1'), pf2 = part('114-g3pf-E1', '2');
  assert.deepStrictEqual(['114-g3pf-E1', '114-g3pf-E2', '114-g3acc-E1', '114-g3acc-E2'].map(i => E[i].points), [25, 25, 25, 25]);
  assert.deepStrictEqual(E['114-g3pf-E1'].categories, ['財稅行政']);
  assert.deepStrictEqual(E['114-g3acc-E2'].categories, ['會計']);
  // 數學驗算：W = 2Ma + Mb → 角解；W = min{2Ma, Mb} → Ma = M/3
  for (let M = 1; M <= 300; M += 7) {
    let b1 = -1, a1 = 0, b2 = -1, a2 = 0;
    for (let k = 0; k <= 3000; k++) {
      const ma = M * k / 3000, mb = M - ma;
      if (2 * ma + mb > b1) { b1 = 2 * ma + mb; a1 = ma; }
      if (Math.min(2 * ma, mb) > b2 + 1e-12) { b2 = Math.min(2 * ma, mb); a2 = ma; }
    }
    assert.ok(Math.abs(a1 - M) < 1e-9 && Math.abs(b1 - 2 * M) < 1e-9);
    assert.ok(Math.abs(a2 - M / 3) < M / 3000 + 1e-9 && Math.abs(b2 - 2 * M / 3) < 2e-3 * M);
  }
  // 評分初判：正確寫法得分；常見錯誤（平均分配、權重寫反）不得高分
  assert.strictEqual(C.gradeEssayPart(pf1, 'W=2Ma+Mb，Mb=M-Ma，W=M+Ma，Ma=M，Mb=0，W=2M；效用線性，a 權重較大，全給 a').earned, 10);
  assert.ok(C.gradeEssayPart(pf1, '應該平均分配，Ma=Mb=M/2，這樣最公平').items.find(i => i.id === 'r2').earned <= 1, '(一)平均分配不應拿到角解分數');
  assert.strictEqual(C.gradeEssayPart(pf2, 'Leontief 型，頂點 2Ma=Mb，Ma=M/3，Mb=2M/3，W=2M/3').items.find(i => i.id === 'r3').earned, 5);
  assert.strictEqual(C.gradeEssayPart(pf2, '2Ma=Mb，所以 Ma=2M/3，Mb=M/3').items.find(i => i.id === 'r3').earned, 0, '權重寫反不得分');
  // 會計：EV 與 EB 的區別
  const ae = part('114-g3acc-E1', '2');
  assert.strictEqual(C.gradeEssayPart(ae, '均等變量 EV 是在原價格下使效用降到 U1 需拿走的所得。EB = EV - T。').items.find(i => i.id === 'r3').earned >= 2, true);
  assert.strictEqual(C.gradeEssayPart(part('114-g3acc-E1', '1'), '今天天氣很好').earned, 0);
  // 歸宿與超額負擔：分類寫反不得該細目分數
  const cl = part('114-g3acc-E2', '1');
  assert.strictEqual(C.gradeEssayPart(cl, '租稅歸宿屬租稅公平；超額負擔屬租稅效率').items.find(i => i.id === 'r3').earned, 3);
  assert.ok(C.gradeEssayPart(cl, '租稅歸宿屬租稅效率；超額負擔屬租稅公平').items.find(i => i.id === 'r3').earned <= 1.5);
  // 公式驗算：EB ≈ ½ t² (Q/P) εs|εd|/(εs+|εd|) 與線性供需的三角形面積一致
  for (const [a, b, c, d, t] of [[100, 2, 10, 1, 6], [200, 1, 20, 3, 8], [80, 0.5, 5, 0.5, 3]]) {
    // D: P = a - bQ ; S: P = c + dQ
    const Q0 = (a - c) / (b + d), P0 = a - b * Q0, Q1 = (a - c - t) / (b + d);
    const eb = 0.5 * t * (Q0 - Q1);
    const ed = P0 / (b * Q0), es = P0 / (d * Q0);
    const f = 0.5 * t * t * (Q0 / P0) * es * ed / (es + ed);
    assert.ok(Math.abs(eb - f) / eb < 1e-9, '超額負擔公式');
    assert.ok(Math.abs(es / (es + ed) - b / (b + d)) < 1e-9, '消費者負擔比例 = εs/(εs+|εd|) = b/(b+d)');
  }
  console.log('114 年財政學（財稅行政、會計）申論題測試通過');
})();

/* ===== 115 年民法申論題（戶政 4 題、公平交易管理 2 題、地政 3 題）：配分、評分、法律題回饋 ===== */
{
  const civ = data.essays.filter(q => /^115-g3(hr|ftc|land)-E/.test(q.id));
  assert.strictEqual(civ.length, 9);
  assert.deepStrictEqual(civ.filter(q => q.id.startsWith('115-g3hr')).map(q => q.points), [25, 25, 25, 25]);
  assert.deepStrictEqual(civ.filter(q => q.id.startsWith('115-g3ftc')).map(q => q.points), [30, 20]);
  assert.deepStrictEqual(civ.filter(q => q.id.startsWith('115-g3land')).map(q => q.points), [33, 33, 34]);
  civ.forEach(q => q.parts.forEach(p => {
    assert.ok(p.law, q.id + '/' + p.id + ' 應標 law');
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, q.id + '/' + p.id + ' 參考答案應拿滿分');
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0);
  }));
  // 戶政第 4 題：只寫 §1173 歸扣（常見錯誤）不應拿到 §1148-1 的分數
  const p41 = part('115-g3hr-E4', '1');
  assert.ok(C.gradeEssayPart(p41, '依民法第1173條，乙應將贈與歸扣。').earned < 4);
  assert.ok(C.gradeEssayPart(p41, '依第1148條之1，繼承人在繼承開始前二年內受贈與，視為所得遺產，乙為配偶，贈與在一年前。').earned >= 7);
  // 回饋：沒引用條文、沒有結論時要提醒；引用條文並有結論則不提醒
  const weak = '甲未成年，所以不能自己決定，要父母同意。';
  const fb = C.feedbackEssayPart(part('115-g3hr-E1', '1'), { text: weak, auto: {}, scores: {} });
  assert.ok(fb.points.some(x => /沒有明確引用/.test(x.text) && /1087/.test(x.text)), '應提醒未引用條文');
  assert.ok(fb.points.some(x => /沒有看到明確結論/.test(x.text)), '應提醒缺少結論');
  const ok = '依民法第1087條，A屋為特有財產；依第1088條父母共同管理，依第77條限制行為能力人須法定代理人允許，所以甲無權單獨決定，主張無依據。';
  const g = C.gradeEssayPart(part('115-g3hr-E1', '1'), ok), sc = {}; g.items.forEach(i => { sc[i.id] = i.earned; });
  const fb2 = C.feedbackEssayPart(part('115-g3hr-E1', '1'), { text: ok, auto: sc, scores: sc });
  assert.ok(!fb2.points.some(x => /沒有明確引用|沒有看到明確結論/.test(x.text)));
  // 「第1148條之1」「§1148-1」兩種寫法都算有引用
  const p4 = part('115-g3hr-E4', '1');
  [ '依第1148條之1，贈與視為遺產', '依§1148-1，贈與視為遺產' ].forEach(t => {
    const f = C.feedbackEssayPart(p4, { text: t, auto: {}, scores: {} });
    assert.ok(!f.points.some(x => /沒有明確引用/.test(x.text) && /1148 條之 1/.test(x.text)), t);
  });
  console.log('115 年民法申論題測試通過');
}

// ===== 115 年智慧財產行政民法（2 題）與法制民法與民事訴訟法（4 題）=====
{
  const ids = ['115-g3ip-E1', '115-g3ip-E2', '115-g3law-E1', '115-g3law-E2', '115-g3law-E3', '115-g3law-E4'];
  const ess = ids.map(id => data.essays.find(q => q.id === id));
  assert.ok(ess.every(Boolean), '新增申論題缺漏');
  assert.deepStrictEqual(ess.map(q => q.points), [25, 25, 25, 25, 25, 25]);
  assert.deepStrictEqual(ess.slice(0, 2).map(q => q.categories[0]), ['智慧財產行政', '智慧財產行政']);
  assert.ok(ess.slice(2).every(q => q.categories[0] === '法制' && q.subject === '民法與民事訴訟法'));
  assert.deepStrictEqual(ess.map(q => q.parts.map(p => p.points).join(',')), ['8,10,7', '10,10,5', '6,9,10', '10,10,5', '10,15', '12,13']);
  // 智慧財產行政的民法選擇題已在題庫（類科含智慧財產行政），exam／subject 需一致
  assert.ok(bank.questions.some(b => b.subject === '民法' && b.categories.includes('智慧財產行政') && b.year_roc === 115));
  ess.forEach(q => q.parts.forEach(p => {
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0, q.id + '/' + p.id + ' 空白答案應為 0 分');
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, q.id + '/' + p.id + ' 參考答案應拿滿分');
    assert.ok(p.law === true && Array.isArray(p.statutes) && p.statutes.length, q.id + '/' + p.id + ' 法律題需有 law 與 statutes');
  }));
  // 重點關鍵字：沒寫到核心概念不應拿滿分
  const part = (id, n) => data.essays.find(q => q.id === id).parts.find(p => p.id === n);
  assert.ok(C.gradeEssayPart(part('115-g3law-E1', '3'), '丁善意取得，所以取得所有權').earned <= 2, '漏掉繼承與 §118 Ⅱ 不應高分');
  assert.ok(C.gradeEssayPart(part('115-g3law-E3', '2'), '丁法院可以直接再移送丙高等行政法院').earned <= 2, '直接再移送不應高分');
  assert.ok(C.gradeEssayPart(part('115-g3law-E4', '2'), '乙上訴有利益，依民事訴訟法第56條第1項第1款，效力及於丙，丙視為上訴人，須合一確定。').earned >= 9, '正確要點應得高分');
  // 回饋：物件式條文（非民法）要能顯示完整條名，且寫到時不再提醒
  const weak = C.feedbackEssayPart(part('115-g3law-E3', '2'), { text: '丁法院沒有審判權，應該移送行政法院，所以可以再移送。', auto: {}, scores: {} });
  assert.ok(weak.points.some(x => /法院組織法第 7 條之 4/.test(x.text)), '應提醒引用法院組織法第 7 條之 4');
  const full = C.stripHtml(part('115-g3law-E3', '2').model_answer);
  const g = C.gradeEssayPart(part('115-g3law-E3', '2'), full), sc = {}; g.items.forEach(i => { sc[i.id] = i.earned; });
  const ok = C.feedbackEssayPart(part('115-g3law-E3', '2'), { text: full, auto: sc, scores: sc });
  assert.ok(!ok.points.some(x => /沒有明確引用/.test(x.text)), '已引用條文不應再提醒');
  const old = C.feedbackEssayPart(part('115-g3law-E1', '3'), { text: '丁善意取得', auto: {}, scores: {} });
  assert.ok(old.points.some(x => /民法第 118 條/.test(x.text)), '民法條號仍以「民法第 N 條」顯示');
  // 取得時點題：必須同時有繼承、§118 Ⅱ、時點
  assert.ok(/自始有效/.test(C.stripHtml(part('115-g3law-E1', '3').model_answer)) && /6 月 1 日/.test(C.stripHtml(part('115-g3law-E1', '3').model_answer)));
  console.log('115 年智慧財產行政、法制民法申論題測試通過');
}

// ===== 115 年普考：地政（民法物權編概要）、戶政（民法總則、親屬與繼承編概要）、財稅行政（民法概要）申論題 =====
(() => {
  const sub = (s) => data.essays.filter(q => q.year_roc === 115 && q.exam === '公務人員普通考試' && q.subject === s);
  const shapeOf = (s) => sub(s).map(q => q.parts.map(p => p.points).join(','));
  assert.deepStrictEqual(sub('民法物權編概要').map(q => q.points), [25, 25, 25, 25]);
  assert.deepStrictEqual(shapeOf('民法物權編概要'), ['10,7,8', '8,8,9', '8,7,10', '12,13']);        // 對照試題 PDF（代號 42650）
  assert.deepStrictEqual(sub('民法總則、親屬與繼承編概要').map(q => q.points), [25, 25, 25, 25]);
  assert.deepStrictEqual(sub('民法概要').map(q => q.points), [50]);
  sub('民法物權編概要').forEach(q => assert.deepStrictEqual(q.categories, ['地政']));
  sub('民法總則、親屬與繼承編概要').forEach(q => assert.deepStrictEqual(q.categories, ['戶政']));
  sub('民法概要').forEach(q => assert.deepStrictEqual(q.categories, ['財稅行政']));  // 與題庫 115 年民法概要選擇題的類科一致
  const g = (id, pid, text) => C.gradeEssayPart(part(id, pid), text);
  const item = (r, rid) => r.items.find(i => i.id === rid).earned;

  // 容易混淆的答法：不應拿滿分
  // 地政第 4 題（一）：只引用 875-1「債務人所有先受償」而沒有處理「同時拍賣」，不應拿到 r2 滿分
  assert.ok(item(g('115-pland-E4', '1', '丙有理由，因為 A 屋是債務人甲所有，應先拍賣 A 屋'), 'r2') < 5);
  // 地政第 3 題（三）：只寫按應有部分比例，沒有抽籤，r1 不應滿分
  assert.ok(item(g('115-pland-E3', '3', '應按應有部分比例承買，法院不准'), 'r1') < 5);
  // 地政第 2 題（二）：把乙當相對人，不應拿到 r1 滿分
  assert.ok(item(g('115-pland-E2', '2', '相對人是乙，因為乙是原建造人，甲依所有物返還請求權請求乙拆屋還地'), 'r1') < 4);
  // 地政第 1 題（一）：只寫成立，沒有 345 與 166-1，只得部分分數
  assert.ok(g('115-pland-E1', '1', '買賣契約有效成立，因為雙方已就價金合意').earned < 10);
  // 戶政第 3 題（二）：主張可請求返還不當得利，不應拿到 r1 的滿分
  assert.ok(item(g('115-phh-E3', '2', '甲不知時效完成而還款，成立非債清償，可依不當得利請求返還'), 'r1') < 6);
  // 戶政第 2 題（二）：只寫繼承回復請求權，沒有算期間，不應拿滿分
  assert.ok(g('115-phh-E2', '2', '丁可以主張繼承回復請求權請求丙返還遺產').earned < 12);
  // 財稅行政：只寫第 184 條，不應拿滿分
  assert.ok(g('115-pcivil-E1', '1', '乙過失侵害甲的所有權，依第 184 條應負損害賠償責任').earned < 20);

  // 學生式作答：部分得分（不是 0 也不是滿分）
  const stu = g('115-pcivil-E1', '2', '甲的計程車維修 5 天無法營業，這是所失利益，依民法第 216 條可請求，但要舉證每日平均營業收入。');
  assert.ok(stu.earned > 0 && stu.earned < 15, '營業損失學生答案應得部分分數，實得 ' + stu.earned);
  const stu2 = g('115-phh-E4', '2', '丙丁有理由，殯葬費用應由遺產支付。');
  assert.ok(stu2.earned > 0 && stu2.earned < 13, '殯葬費用學生答案應得部分分數，實得 ' + stu2.earned);

  // 回饋：漏掉的得分點會被指出
  const f = C.feedbackEssayPart(part('115-pland-E4', '2'), { text: '丁有先訴抗辯權。', auto: {}, scores: { r1: 3 } });
  assert.ok(f.points.length > 0 && f.ratio < 0.5);
  console.log('115 年普考地政、戶政、財稅行政申論題測試通過');
})();

// ===== 115 年高考三級民法：財稅行政／財稅法務（1 題 50 分）、司法行政（2 題各 25 分） =====
(() => {
  const sub = (cat) => data.essays.filter(q => q.year_roc === 115 && q.exam === '公務人員高等考試三級考試' && q.subject === '民法' && q.categories.includes(cat));
  assert.deepStrictEqual(sub('財稅行政').map(q => q.points), [50]);
  assert.deepStrictEqual(sub('財稅法務').map(q => q.id), ['115-g3civ-E1']);
  assert.deepStrictEqual(sub('司法行政').map(q => q.points), [25, 25]);
  assert.deepStrictEqual(E['115-g3civ-E1'].parts.map(p => p.points), [30, 20]);
  assert.deepStrictEqual(E['115-g3civj-E1'].parts.map(p => p.points), [8, 9, 8]);
  assert.deepStrictEqual(E['115-g3civj-E2'].parts.map(p => p.points), [15, 10]);  // 對照試題 PDF（代號 32520）：（一）15 分、（二）10 分
  // 類科要在題庫的民法選擇題類科之內（選單才會把申論題與選擇題放在同一科目）
  const bankCats = new Set(bank.questions.filter(b => b.exam === '公務人員高等考試三級考試' && b.subject === '民法' && b.year_roc === 115).flatMap(b => b.categories));
  ['115-g3civ-E1', '115-g3civj-E1', '115-g3civj-E2'].forEach(id => E[id].categories.forEach(c => assert.ok(bankCats.has(c), id + ' 類科 ' + c + ' 不在題庫民法類科內')));
  const g = (id, pid, text) => C.gradeEssayPart(part(id, pid), text);
  const item = (r, rid) => r.items.find(i => i.id === rid).earned;

  // 財稅行政第 1 題（一）：容易混淆的答法不應拿滿分
  // 只寫「乙是債權人、受清償合法」，沒有討論有償行為、代物清償與主觀要件
  assert.ok(g('115-g3civ-E1', '1', '乙是債權人，甲清償債務是天經地義，丙丁不能撤銷。').earned < 10);
  // 當成無償行為（第 244 條第 1 項），沒有主觀要件
  assert.ok(g('115-g3civ-E1', '1', '甲把 A 屋移轉給乙是無償行為，依第 244 條第 1 項丙丁可以撤銷。').earned < 20);
  // 有討論有償行為與主觀要件，但漏了債權人適格與除斥期間，應得部分分數而非滿分
  const stu1 = g('115-g3civ-E1', '1', '甲已無資力，A 屋是唯一財產，移轉後有害及債權。甲以 A 屋抵償債務是代物清償，屬有償行為，依第 244 條第 2 項，甲明知有害債權且乙受益時亦知情，丙丁可以撤銷。');
  assert.ok(stu1.earned >= 15 && stu1.earned < 30, '財稅行政（一）學生答案應得部分分數，實得 ' + stu1.earned);
  // （二）：只說得撤銷，沒有回復原狀（塗銷登記）
  assert.ok(g('115-g3civ-E1', '2', '丙丁得聲請法院撤銷甲乙間的行為。').earned < 10);
  assert.ok(item(g('115-g3civ-E1', '2', '依第 244 條第 4 項，丙丁得請求乙塗銷登記，回復為甲所有。'), 'r2') >= 5);

  // 司法行政第 1 題
  assert.ok(g('115-g3civj-E1', '1', '買賣契約無效。').earned < 5);                              // 沒引第 87 條、沒說明通謀
  assert.ok(item(g('115-g3civj-E1', '1', '甲乙通謀虛偽，依第 87 條第 1 項買賣契約無效。'), 'r1') >= 4);
  assert.ok(g('115-g3civj-E1', '2', '買賣無效，所以整個行為無效，乙沒有取得任何權利。').earned < 4);  // 漏掉隱藏贈與
  assert.ok(g('115-g3civj-E1', '3', '乙沒有取得所有權，因為買賣無效。').earned < 4);            // 錯誤結論不應得分
  // 司法行政第 2 題（一）：配偶互相繼承的錯誤答案、把丙算成丁的繼承人，都不應拿滿分
  assert.ok(g('115-g3civj-E2', '1', '乙的遺產由丁、丙、戊平均繼承，丁的遺產由乙、丙、戊平均繼承。').earned < 8);
  const stu2 = g('115-g3civj-E2', '1', '二人不能證明死亡先後，推定同時死亡（第 11 條），互不繼承。乙的遺產由第一順位的丙、戊各 1/2。');
  assert.ok(stu2.earned > 5 && stu2.earned < 15, '司法行政 2（一）學生答案應得部分分數，實得 ' + stu2.earned);
  // 司法行政第 2 題（二）：只引第 194 條，沒套進人物，不應拿滿分
  assert.ok(g('115-g3civj-E2', '2', '依民法第 194 條，父母、子女、配偶得請求慰撫金。').earned < 7);

  // 回饋：漏掉的得分點會被指出，且會帶出常見錯誤提醒
  const f = C.feedbackEssayPart(part('115-g3civ-E1', '1'), { text: '乙是債權人，清償合法。', auto: {}, scores: { r1: 2 } });
  assert.ok(f.points.length > 0 && f.ratio < 0.5);
  assert.ok(f.points.some(x => /常見錯誤/.test(x.text)));
  const fe = C.feedbackEssay(E['115-g3civj-E2'], { '1': { text: '丁乙推定同時死亡。', auto: {}, scores: { r1: 5 } } });
  assert.ok(fe && fe.earned === 5 && fe.points.some(x => /尚未評分/.test(x.text)));
  console.log('115 年高考三級民法（財稅行政、財稅法務、司法行政）申論題測試通過');
})();

// ===== 114 年民法申論題：高考三級財稅行政／財稅法務（2 題）、普考財稅行政民法概要（2 題）、高考三級公平交易管理（2 題） =====
(() => {
  const ids = ['114-g3civ-E1', '114-g3civ-E2', '114-pcivil-E1', '114-pcivil-E2', '114-g3ftc-E1', '114-g3ftc-E2'];
  ids.forEach(id => assert.ok(E[id], id + ' 不存在'));
  assert.deepStrictEqual(ids.map(id => E[id].points), [25, 25, 25, 25, 25, 25]);
  // 小題結構：對照試題 PDF（代號 22220、41350、23220）；原題有分小題者依原配分，未分者為編者拆分
  assert.deepStrictEqual(E['114-g3civ-E1'].parts.map(p => p.points), [8, 9, 8]);   // 編者拆分
  assert.deepStrictEqual(E['114-g3civ-E2'].parts.map(p => p.points), [10, 15]);    // 原題 10 分、15 分
  assert.deepStrictEqual(E['114-pcivil-E1'].parts.map(p => p.points), [10, 15]);   // 原題 10 分、15 分
  assert.deepStrictEqual(E['114-pcivil-E2'].parts.map(p => p.points), [8, 10, 7]); // 編者拆分
  assert.deepStrictEqual(E['114-g3ftc-E1'].parts.map(p => p.points), [9, 9, 7]);   // 編者拆分
  assert.deepStrictEqual(E['114-g3ftc-E2'].parts.map(p => p.points), [8, 9, 8]);   // 編者拆分
  // exam／subject／類科要與題庫的 114 年民法選擇題一致（選單才會把申論題與選擇題放在同一科目）
  ids.forEach(id => {
    const q = E[id];
    const cats = new Set(bank.questions.filter(b => b.exam === q.exam && b.subject === q.subject && b.year_roc === 114).flatMap(b => b.categories));
    assert.ok(cats.size > 0, id + ' 題庫沒有對應的 114 年選擇題');
    q.categories.forEach(c => assert.ok(cats.has(c), id + ' 類科 ' + c + ' 不在題庫類科內'));
  });
  ids.forEach(id => E[id].parts.forEach(p => {
    assert.ok(p.law && p.statutes && p.statutes.length, id + '/' + p.id + ' 應標 law 與 statutes');
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, id + '/' + p.id + ' 參考答案應拿滿分');
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0);
  }));
  const g = (id, pid, text) => C.gradeEssayPart(part(id, pid), text);
  const item = (r, rid) => r.items.find(i => i.id === rid).earned;

  // 高考三級民法第 1 題：租賃
  assert.ok(g('114-g3civ-E1', '1', '乙是承租人，要保管好房子。').earned < 4);
  assert.ok(g('114-g3civ-E1', '2', '丙是乙的受僱人，乙已盡選任監督之責，所以不用負責。').earned < 4);   // 用侵權行為的免責當結論
  assert.ok(item(g('114-g3civ-E1', '2', '依民法第 224 條，履行輔助人丙的過失，視同債務人乙的過失，負同一責任。'), 'r2') >= 3);
  assert.ok(g('114-g3civ-E1', '3', '房子被毀損，乙要賠 300 萬。').earned < 4);   // 沒有發現只是價值減損的爭點
  // 第 2 題（一）（二）
  assert.ok(g('114-g3civ-E2', '1', '乙沒有處分權，所以贈與契約無效。').earned < 4);
  assert.ok(g('114-g3civ-E2', '2', '丙善意且無重大過失，依第 948 條善意取得 A 錶，甲不得請求返還。').earned < 8);   // 漏掉第 949 條
  const s1 = g('114-g3civ-E2', '2', '依第 767 條第 1 項前段，甲得請求無權占有人丙返還。丙雖善意，但 A 錶是遺失物，依第 949 條，甲在二年內得請求回復，未逾期限。');
  assert.ok(s1.earned >= 8 && s1.earned < 15, '第 2 題（二）部分正確答案應得部分分數，實得 ' + s1.earned);
  assert.ok(item(g('114-g3civ-E2', '2', '丙是贈與取得，不是從公共市場買的，依第 950 條不必償還價金。'), 'r4') >= 2);

  // 普考民法概要第 1 題：附停止條件、債權相對性
  assert.ok(g('114-pcivil-E1', '1', '108 年 8 月 1 日贈與契約就生效了。').earned < 3);
  assert.ok(item(g('114-pcivil-E1', '1', '考上律師是附停止條件，依第 99 條第 1 項，條件成就時發生效力。'), 'r1') >= 3);
  assert.ok(g('114-pcivil-E1', '2', '乙有贈與契約，所以丙要塗銷登記，甲要移轉 A 地給乙。').earned < 5);   // 結論錯誤
  assert.ok(item(g('114-pcivil-E1', '2', 'A 地已移轉給丙，甲給付不能，依第 225 條、第 226 條，乙只能請求損害賠償。'), 'r3') >= 2);
  // 第 2 題：公同共有人單獨請求
  assert.ok(g('114-pcivil-E2', '2', '公同共有物的處分要全體同意，乙不能單獨請求。').earned < 5);   // 錯誤結論
  assert.ok(item(g('114-pcivil-E2', '2', '依第 828 條第 3 項準用第 821 條，各公同共有人得單獨對第三人請求。'), 'r2') >= 4);
  assert.ok(g('114-pcivil-E2', '3', '戊應把 A 地還給乙。').earned < 4);   // 沒有說返還於全體

  // 公平交易管理民法第 1 題：連帶保證與人事保證
  assert.ok(g('114-g3ftc-E1', '1', '丙有先訴抗辯權，甲要先對乙強制執行。').earned < 5);   // 漏掉連帶保證排除
  assert.ok(g('114-g3ftc-E1', '2', '丙是基於職務關係保證，未定期間，三年後失效，所以丙不用負責。').earned < 4);   // 沒檢查是否為人事保證
  assert.ok(item(g('114-g3ftc-E1', '2', '本件不是人事保證，保證標的是訓練費用與違約金，不適用第 756 條之 3 的三年限制。'), 'r2') >= 3);
  // 第 2 題：只看登記、忽略買賣契約與繼承
  assert.ok(g('114-g3ftc-E2', '3', '甲 1 已登記取得 A 地所有權，乙 1 是無權占有，應拆屋還地。').earned < 4);
  assert.ok(item(g('114-g3ftc-E2', '3', '甲 1 為甲之繼承人，概括承受出賣人義務，乙 1 得以買賣契約作為有權占有，甲 1 請求拆屋違反誠信原則。'), 'r1') >= 3);

  // 回饋：漏掉的得分點會被指出，法律題會提醒引用條文與常見錯誤
  const f = C.feedbackEssayPart(part('114-g3ftc-E1', '2'), { text: '丙基於職務關係保證，三年後失效。', auto: {}, scores: { r1: 0, r2: 1 } });
  assert.ok(f.points.length > 0 && f.ratio < 0.5);
  assert.ok(f.points.some(x => /常見錯誤/.test(x.text)));
  assert.ok(f.points.some(x => /沒有明確引用/.test(x.text)), '法律題應提醒引用條文');
  const fe = C.feedbackEssay(E['114-g3civ-E2'], { '1': { text: '贈與有效。', auto: {}, scores: { r1: 4 } } });
  assert.ok(fe && fe.earned === 4 && fe.points.some(x => /尚未評分/.test(x.text)));
  console.log('114 年民法申論題（財稅行政、財稅法務、普考民法概要、公平交易管理）測試通過');
})();

// ===== 114 年地政：高考三級民法（3 題）、普考民法物權編概要（4 題） =====
(() => {
  const hi = data.essays.filter(q => /^114-g3land-E/.test(q.id)), lo = data.essays.filter(q => /^114-pland-E/.test(q.id));
  assert.deepStrictEqual(hi.map(q => q.points), [30, 35, 35]);                       // 對照試題 PDF（代號 24120）
  assert.deepStrictEqual(hi.map(q => q.parts.map(p => p.points).join(',')), ['10,10,10', '7,7,7,7,7', '10,12,13']);
  assert.deepStrictEqual(lo.map(q => q.points), [25, 25, 25, 25]);                   // 對照試題 PDF（代號 42350）
  assert.deepStrictEqual(lo.map(q => q.parts.map(p => p.points).join(',')), ['8,10,7', '12,13', '13,12', '15,10']);
  hi.forEach(q => { assert.strictEqual(q.exam, '公務人員高等考試三級考試'); assert.strictEqual(q.subject, '民法（包括總則、物權、親屬與繼承編）'); assert.deepStrictEqual(q.categories, ['地政']); });
  lo.forEach(q => { assert.strictEqual(q.exam, '公務人員普通考試'); assert.strictEqual(q.subject, '民法物權編概要'); assert.deepStrictEqual(q.categories, ['地政']); });
  [...hi, ...lo].forEach(q => q.parts.forEach(p => {
    assert.ok(p.law, q.id + '/' + p.id + ' 應標 law');
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, q.id + '/' + p.id + ' 參考答案應拿滿分');
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0);
  }));
  const g = (id, pid, text) => C.gradeEssayPart(part(id, pid), text);
  const item = (r, rid) => r.items.find(i => i.id === rid).earned;

  // 數字驗算：乙死亡時的分配（對照題目假設：甲、丙各 600 萬；乙婚後財產 600 萬；丁婚後財產 300 萬）
  const jia = 600, bing = 600, yiOwn = 600, ding = 300;
  const xinEach = bing / 2, yiFromJia = jia / 2, xinFromJia = (jia / 2) / 2;              // 辛、壬各 300；乙得 300；辛、壬代位各 150
  const surplus = (yiOwn - ding) / 2;                                                       // 丁的剩餘財產差額分配 150（繼承所得不列入）
  const yiEstate = yiOwn + yiFromJia - surplus, each = yiEstate / 3;                        // 750，丁戊己各 250
  assert.deepStrictEqual([xinEach, yiFromJia, xinFromJia, surplus, yiEstate, each], [300, 300, 150, 150, 750, 250]);
  assert.strictEqual(surplus + each + each + each + 2 * (xinEach + xinFromJia), jia + bing + yiOwn);   // 分配總額 = 三人遺產總額 1,800
  hi[2].parts[2].model_answer.includes('750'); assert.ok(/丁 150 \+ 250 = 400/.test(hi[2].parts[2].model_answer));

  // 容易混淆的答法：不應拿滿分
  assert.ok(g('114-g3land-E1', '1', '甲未成年，所以買賣契約無效。').earned < 5);                         // 沒有 §77、§79
  assert.ok(item(g('114-g3land-E1', '2', '買賣契約無效，所以乙交付機車也無效，乙仍是機車所有人。'), 'r2') < 5);   // 誤認物權行為隨債權行為無效
  assert.ok(item(g('114-g3land-E1', '3', '乙得依第 767 條請求甲返還機車。'), 'r1') < 5);                 // 機車所有權已屬甲，應依不當得利
  assert.ok(item(g('114-g3land-E2', '3', '蘋果歸乙，依第 70 條樹的所有人取得天然孳息。'), 'r1') < 4);       // 漏了 §798
  assert.ok(g('114-g3land-E2', '4', '歸甲所有，因為是甲採摘的。').earned < 4);
  assert.ok(g('114-g3land-E3', '3', '乙的遺產 900 萬元由丁、戊、己平分，各得 300 萬元。').earned < 7);        // 漏了剩餘財產分配
  assert.ok(g('114-g3land-E3', '2', '三人同時死亡，互不繼承，甲的遺產由戊、己代位繼承。').earned < 5);
  assert.ok(item(g('114-pland-E1', '2', '依買賣不破租賃，租約對丁繼續存在，丁不得請求返還。'), 'r2') < 5);   // 漏了 §425 Ⅱ
  assert.ok(g('114-pland-E2', '2', '國產署可以請求補償，補償款由其他共有人給付。').earned < 7);
  assert.ok(item(g('114-pland-E3', '2', '丁未參加訴訟，抵押權消滅。'), 'r1') < 6);
  assert.ok(item(g('114-pland-E4', '2', '約定價金各二分之一，所以甲乙共有畫作。'), 'r1') < 6);

  // 學生式作答：部分得分（不是 0 也不是滿分）
  const s1 = g('114-g3land-E2', '5', '甲得依民法第 816 條請求乙償金，因為樹附合在 B 地，甲喪失樹的所有權。');
  assert.ok(s1.earned > 0 && s1.earned <= 7, '實得 ' + s1.earned);
  const s2 = g('114-g3land-E3', '1', '壬是胎兒，非死產，視為已出生，可以繼承丙；辛也是丙的子女。');
  assert.ok(s2.earned > 0 && s2.earned < 10, '實得 ' + s2.earned);
  const s3 = g('114-pland-E4', '1', '畫作是加工，依第 814 條，價值顯逾材料，所有權屬乙，乙可依第 767 條請求甲返還。');
  assert.ok(s3.earned >= 12, '完整答案應得高分，實得 ' + s3.earned);

  // 回饋：漏掉的得分點與條文會被指出
  const f = C.feedbackEssayPart(part('114-pland-E2', '2'), { text: '國產署可以請求補償。', auto: {}, scores: { r1: 2 } });
  assert.ok(f.points.length > 0 && f.ratio < 0.5);
  assert.ok(f.points.some(x => /824/.test(x.text)), '應提醒未引用 §824 之 1');
  console.log('114 年地政（高考三級民法、普考民法物權編概要）申論題測試通過');
})();

// ===== 114 年高考三級民法申論題：司法行政（2 題）、法制與智慧財產行政（2 題）=====
{
  const ids = ['114-g3civj-E1', '114-g3civj-E2', '114-g3civl-E1', '114-g3civl-E2'];
  const ess = ids.map(id => data.essays.find(q => q.id === id));
  assert.ok(ess.every(Boolean), '114 年民法申論題缺漏');
  assert.ok(ess.every(q => q.year_roc === 114 && q.exam === '公務人員高等考試三級考試' && q.subject === '民法' && q.points === 25));
  assert.deepStrictEqual(ess.slice(0, 2).map(q => q.categories), [['司法行政'], ['司法行政']]);
  assert.deepStrictEqual(ess.slice(2).map(q => q.categories), [['法制', '智慧財產行政'], ['法制', '智慧財產行政']]);
  assert.deepStrictEqual(ess.map(q => q.parts.map(p => p.points).join(',')), ['9,9,7', '9,8,8', '9,11,5', '8,10,7']);  // 原題未分小題，配分為編者拆分
  // 題庫已有 114 年民法選擇題，類科需涵蓋這三個類科（exam／subject 一致由上方檢查涵蓋）
  const mc = bank.questions.filter(b => b.year_roc === 114 && b.subject === '民法' && b.exam === '公務人員高等考試三級考試');
  ['司法行政', '法制', '智慧財產行政'].forEach(c => assert.ok(mc.some(b => b.categories.includes(c)), '114 年民法選擇題類科應含 ' + c));
  ess.forEach(q => q.parts.forEach(p => {
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0, q.id + '/' + p.id + ' 空白答案應為 0 分');
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, q.id + '/' + p.id + ' 參考答案應拿滿分');
    assert.ok(p.law === true && Array.isArray(p.statutes) && p.statutes.length, q.id + '/' + p.id + ' 法律題需有 law 與 statutes');
  }));
  const part = (id, n) => data.essays.find(q => q.id === id).parts.find(p => p.id === n);
  const g = (id, n, t) => C.gradeEssayPart(part(id, n), t).earned;
  // 司法行政第 1 題：撤回未通知、限制行為能力人為代理人、代理人受詐欺
  assert.ok(g('114-g3civj-E1', '1', '乙 16 歲依第 104 條仍可為代理人。甲撤回代理權（第 173 條）但未通知丙，依第 107 條不得對抗善意第三人，丙無過失，契約依第 103 條對甲發生效力。') >= 8);
  assert.ok(g('114-g3civj-E1', '1', '乙未成年，代理行為無效，甲不受拘束。') <= 2, '誤認乙未成年代理無效不應高分');
  assert.ok(g('114-g3civj-E1', '2', '丙詐欺，依第 92 條甲得撤銷；乙為代理人，依第 105 條就代理人決定；須於一年內為之（第 93 條）。') >= 8);
  assert.ok(g('114-g3civj-E1', '2', '丙詐欺，所以契約無效。') <= 3, '只寫詐欺而沒有條文與撤銷不應高分');
  // 司法行政第 2 題：繼親收養只須長 16 歲、同意與法院認可
  assert.ok(g('114-g3civj-E2', '1', '依第 1073 條，夫妻一方收養他方子女須長 16 歲以上，乙 30 歲、丙 13 歲相差 17 歲符合；第 1073-1 條直系姻親但書；第 1074 條不須共同收養。') >= 8);
  assert.ok(g('114-g3civj-E2', '1', '收養須長於被收養者二十歲，乙只長 17 歲，所以不得收養。') <= 3, '漏掉繼親收養 16 歲但書不應高分');
  assert.ok(g('114-g3civj-E2', '2', '丙滿七歲以上，應得法定代理人同意（第 1076-2 條），生父丁的同意依第 1076-1 條須書面並經公證。') >= 7);
  assert.ok(g('114-g3civj-E2', '3', '收養應以書面並向法院聲請認可（第 1079 條），法院依第 1079-1 條以最佳利益審酌丙的意願與叛逆期。') >= 7);
  // 法制、智慧財產行政第 1 題：特定物不得換貨
  assert.ok(g('114-g3civl-E1', '2', '甲得依第 359 條解除契約。但換貨依第 364 條僅限種類物，本件展示品為特定物，不得請求換新品。') >= 10);
  assert.ok(g('114-g3civl-E1', '2', 'A 冰箱有瑕疵，甲可以要求換新的冰箱，乙要負責。') <= 2, '直接認定可換貨不應高分');
  assert.ok(g('114-g3civl-E1', '1', '門把痕跡甲明知且已折價，依第 355 條乙不負責；製冰功能屬廣告保證品質，依第 354 條為瑕疵。') >= 8);
  assert.ok(g('114-g3civl-E1', '3', '依第 356 條應從速檢查並通知，否則視為承認；第 365 條通知後六個月不行使消滅。') >= 4);
  // 法制、智慧財產行政第 2 題：解除條件、同樣條件
  assert.ok(g('114-g3civl-E2', '2', '此為解除條件（第 99 條第 2 項），條件成就時失其效力，契約已生效，乙已出賣土地，乙主張無理由，甲得主張優先承買權。') >= 9);
  assert.ok(g('114-g3civl-E2', '2', '此為停止條件，條件未成就契約不生效，甲不得主張。') <= 2, '採乙的停止條件說不應高分');
  assert.ok(g('114-g3civl-E2', '3', '貸款成數屬丙個人信用的融資約款，具屬人性，不屬同樣條件；甲得主張優先承買權，須書面通知，未通知登記不得對抗甲。') >= 6);
  // 回饋：法律題少寫條文時會提醒，且 §99 能被辨識
  const weak = C.feedbackEssayPart(part('114-g3civl-E2', '2'), { text: '我認為甲可以主張優先承買權。', auto: {}, scores: {} });
  assert.ok(weak.points.some(x => /沒有明確引用/.test(x.text) && /民法第 99 條/.test(x.text)), '應提醒引用民法第 99 條');
  const full = C.stripHtml(part('114-g3civl-E2', '2').model_answer);
  const gr = C.gradeEssayPart(part('114-g3civl-E2', '2'), full), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; });
  const ok = C.feedbackEssayPart(part('114-g3civl-E2', '2'), { text: full, auto: sc, scores: sc });
  assert.ok(!ok.points.some(x => /沒有明確引用/.test(x.text)), '已引用條文不應再提醒');
  console.log('114 年高考三級民法申論題測試通過');
}

/* ===== 114 年戶政民法總則、親屬與繼承編（高考三級 20420、普考 40350）申論題各 4 題 ===== */
['114-g3hr', '114-phh'].forEach(pre => {
  const qs = data.essays.filter(q => q.id.startsWith(pre + '-E'));
  assert.strictEqual(qs.length, 4, pre);
  qs.forEach(q => {
    assert.deepStrictEqual(q.categories, ['戶政']); assert.strictEqual(q.points, 25); assert.strictEqual(q.year_roc, 114);
    q.parts.forEach(p => assert.ok(p.law && p.statutes.length >= 2, q.id + '/' + p.id + ' 應有 law 旗標與應引用條文'));
  });
});
assert.strictEqual(E['114-g3hr-E1'].exam, '公務人員高等考試三級考試'); assert.strictEqual(E['114-phh-E1'].exam, '公務人員普通考試');
assert.strictEqual(E['114-g3hr-E1'].subject, '民法總則、親屬與繼承編'); assert.strictEqual(E['114-phh-E1'].subject, '民法總則、親屬與繼承編概要');
// 部分答對與常見錯誤：只答結論、缺關鍵概念，不應拿滿分
{
  const gp = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t);
  // 高考 Q1 (二)：只說密封遺囑無效，漏掉 §1193 方式轉換，B 屋遺贈不應拿到轉換分
  let g = gp('114-g3hr-E1', '2', '密封遺囑的見證人缺格，依第1198條無效，所以 B 屋的遺贈無效，B 屋歸繼承人。');
  assert.strictEqual(g.items.find(i => i.id === 'r2').earned, 0); assert.ok(g.earned < 8);
  // 高考 Q2 (一)：把 5 歲當限制行為能力人，不應得到無行為能力的分數
  g = gp('114-g3hr-E2', '1', '乙是限制行為能力人，純獲法律上利益，贈與有效。');
  assert.ok(g.items.find(i => i.id === 'r1').earned < 5);
  // 普考 Q3 (一)：乙丙套同一要件，缺少 §1117 Ⅱ
  g = gp('114-phh-E3', '1', '乙和丙都必須不能維持生活而且無謀生能力，才可以請求甲扶養。');
  assert.ok(g.items.find(i => i.id === 'r2').earned < 5);
  // 普考 Q4 (三)：只寫母親代理胎兒，漏掉特別代理人
  g = gp('114-phh-E4', '3', '胎兒關於遺產分割以其母為代理人，由乙代理丁，全體繼承人協議即可。');
  assert.strictEqual(g.items.find(i => i.id === 'r2').earned, 0);
  // 不同寫法也要認得
  g = gp('114-g3hr-E4', '3', '乙丙丁平均繼承，各三分之一，每人四百萬；戊是第二順位繼承人，不得繼承。');
  assert.strictEqual(g.items.find(i => i.id === 'r2').earned, 4);
}
console.log('114 年戶政申論題測試通過');

/* ===== 113 年民法申論題（高考三級戶政 3 題、司法行政 2 題；普考戶政 4 題）：配分、評分、法律題回饋 ===== */
{
  const hr = data.essays.filter(q => q.id.startsWith('113-g3hr-E')), ph = data.essays.filter(q => q.id.startsWith('113-phh-E')), cj = data.essays.filter(q => q.id.startsWith('113-g3civj-E'));
  assert.deepStrictEqual(hr.map(q => q.points), [30, 30, 40]);
  assert.deepStrictEqual(ph.map(q => q.points), [25, 25, 25, 25]);
  assert.deepStrictEqual(cj.map(q => q.points), [25, 25]);
  [...hr, ...ph, ...cj].forEach(q => q.parts.forEach(p => {
    assert.ok(p.law === true && Array.isArray(p.statutes) && p.statutes.length, q.id + '/' + p.id + ' 法律題需有 law 與 statutes');
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, q.id + '/' + p.id + ' 參考答案應拿滿分');
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0);
    assert.strictEqual(C.gradeEssayPart(p, '今天天氣很好，我想吃牛肉麵').earned, 0);
  }));
  assert.deepStrictEqual(cj[1].parts.map(p => p.points), [13, 12]);   // 原題配分
  // 常見錯誤：只寫「拒絕有效」「撤銷權消滅丁勝訴」「孫輩代位繼承」不應拿高分
  const g1 = C.gradeEssayPart(E['113-phh-E1'].parts[1], '拒絕受贈只是不接受利益，沒有不利，所以 B 的拒絕有效');
  assert.ok(g1.earned <= 3, '拒絕有效的常見錯誤不應拿高分');
  const g2 = C.gradeEssayPart(E['113-g3civj-E2'].parts[1], '撤銷權依 §93 一年除斥期間已消滅，所以丁有理由，甲乙丙須給付');
  assert.strictEqual(g2.items.find(i => i.id === 'r3').earned, 0, '沒提 §198 不應拿 r3 分數');
  const g3 = C.gradeEssayPart(E['113-phh-E4'].parts[1], 'C、D 拋棄後由 E、F 代位繼承 C 的三分之一，G、H 代位繼承 D 的三分之一');
  assert.strictEqual(g3.items.find(i => i.id === 'r3').earned, 0, '代位繼承的錯誤結論不應拿 1/5 的分數');
  // 回饋：法律題沒引條文、沒結論時要提醒
  const fb = C.feedbackEssayPart(E['113-g3hr-E3'].parts[2], { text: '輔助人有同意權，所以聲請有理由', auto: {}, scores: {} });
  assert.ok(fb.points.some(x => /條文|引用/.test(x.text)), '應提醒引用條文');
  console.log('113 年民法申論題（戶政、司法行政）測試通過');
}

/* ===== 113 年民法申論題：高考三級法制／智慧財產行政（32420、33120）、財稅行政／財稅法務（31820、32020）、普考財稅行政民法概要（41650），各 2 題 ===== */
{
  const gp = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t);
  const grp = [
    ['113-g3civl-E', '公務人員高等考試三級考試', '民法', ['法制', '智慧財產行政']],
    ['113-g3civ-E', '公務人員高等考試三級考試', '民法', ['財稅法務', '財稅行政']],
    ['113-pcivil-E', '公務人員普通考試', '民法概要', ['財稅行政']]
  ];
  grp.forEach(([pre, exam, subj, cats]) => {
    const qs = data.essays.filter(q => q.id.startsWith(pre));
    assert.strictEqual(qs.length, 2, pre);
    qs.forEach((q, i) => {
      assert.strictEqual(q.year_roc, 113); assert.strictEqual(q.exam, exam); assert.strictEqual(q.subject, subj);
      assert.deepStrictEqual(q.categories, cats); assert.strictEqual(q.points, 25); assert.strictEqual(q.question_no, i + 1);
      q.parts.forEach(p => assert.ok(p.law && p.statutes.length >= 1, q.id + '/' + p.id + ' 應有 law 旗標與應引用條文'));
      // exam/subject 與選擇題題庫一致，類科也都在題庫內
      assert.ok(bank.questions.some(b => b.year_roc === 113 && b.exam === exam && b.subject === subj && cats.every(c => b.categories.includes(c))), q.id + ' 與題庫不一致');
    });
  });
  // 小題結構（配分）
  assert.strictEqual(shape('113-g3civl-E1'), '13,12'); assert.strictEqual(shape('113-g3civl-E2'), '13,12');
  assert.strictEqual(shape('113-g3civ-E1'), '15,10'); assert.strictEqual(shape('113-g3civ-E2'), '12,13');
  assert.strictEqual(shape('113-pcivil-E1'), '10,15'); assert.strictEqual(shape('113-pcivil-E2'), '15,10');

  // 部分答對與常見錯誤：不應拿滿分，也不應是 0
  let g = gp('113-g3civl-E1', '2', '乙的抵押權成立在先，依第 874 條乙先受償，丙是承攬人只有報酬債權。');
  assert.strictEqual(g.items.find(i => i.id === 'r2').earned, 0, '只答先成立先受償，漏掉第 513 條第 4 項'); assert.ok(g.earned < 6);
  g = gp('113-g3civl-E1', '1', '丙是承攬人，B 屋重大修繕，依民法第 513 條得請求甲為抵押權登記；A 地是另一個不動產，不在工作所附範圍。');
  assert.ok(g.earned >= 6 && g.earned < 13, '部分作答應得部分分數，實得 ' + g.earned);
  g = gp('113-g3civl-E2', '2', '丙是保證人，A 銀行同意甲乙延期，丙沒有同意，依第 755 條丙不負保證責任。');
  assert.ok(g.items.find(i => i.id === 'r1').earned >= 4 && g.items.find(i => i.id === 'r2').earned >= 3);
  g = gp('113-g3civl-E2', '1', '丙得依侵權行為請求乙賠償 600 萬元。');
  assert.ok(g.earned < 5, '只寫侵權行為，漏掉第 979 條之 1');
  g = gp('113-g3civ-E1', '1', '丙已登記為所有權人，乙只是承租人，丙得請求乙搬離。');
  assert.strictEqual(g.earned, 0, '以所有權人身分請求搬離是錯誤方向');
  g = gp('113-g3civ-E2', '2', '丁無權占有，甲可以請求丁把租金全部返還給甲，共 105 萬元。');
  assert.ok(g.items.find(i => i.id === 'r2').earned === 0, '請求全部租金不得拿到可分債權分數');
  g = gp('113-pcivil-E1', '2', '夫妻之間時效不進行，離婚後重新起算兩年，所以乙有理由。');
  assert.ok(g.earned < 5, '重新起算兩年是錯誤的時效計算，實得 ' + g.earned);
  g = gp('113-pcivil-E1', '2', '乙的侵權請求權兩年，109 年 3 月起算，但依第 143 條婚姻關係消滅後一年內時效不完成，離婚 111 年 2 月，所以到 112 年 2 月才完成，乙 112 年 10 月才請求，甲得依第 144 條拒絕，甲有理由。');
  assert.strictEqual(g.earned, 15);
  g = gp('113-pcivil-E2', '1', '贈與人得任意撤銷，所以甲可以拒絕履行。');
  assert.ok(g.items.find(i => i.id === 'r2').earned === 0 && g.earned < 5, '漏掉公證與第 408 條第 2 項');
  g = gp('113-pcivil-E2', '1', '贈與契約已經公證，屬立有字據，依第 408 條第 2 項甲不得任意撤銷。');
  assert.ok(g.items.find(i => i.id === 'r2').earned === 6);

  // 回饋：法律題的條文、結論與涵攝提醒會依答案產生
  const stt = (qid, pid, text) => { const gg = C.gradeEssayPart(part(qid, pid), text), auto = {}, sc = {}; gg.items.forEach(i => { auto[i.id] = i.earned; sc[i.id] = i.earned; }); return { text, auto, scores: sc }; };
  let fb = C.feedbackEssayPart(part('113-pcivil-E2', '1'), stt('113-pcivil-E2', '1', '贈與人得任意撤銷，所以甲可以拒絕履行。'));
  assert.ok(fb.points.some(x => /民法第 408 條|第 408 條/.test(x.text)), '應提醒引用第 408 條');
  fb = C.feedbackEssayPart(part('113-pcivil-E1', '2'), stt('113-pcivil-E1', '2', '乙的請求權時效完成。'));
  assert.ok(fb.points.some(x => /第 143 條|143/.test(x.text)), '應提醒引用第 143 條');
  const full = (qid, pid) => stt(qid, pid, C.stripHtml(part(qid, pid).model_answer));
  ['113-g3civl-E1', '113-g3civl-E2', '113-g3civ-E1', '113-g3civ-E2', '113-pcivil-E1', '113-pcivil-E2'].forEach(qid => {
    const ps = {}; E[qid].parts.forEach(p => { ps[p.id] = full(qid, p.id); });
    const te = C.feedbackEssay(E[qid], ps);
    assert.strictEqual(te.earned, te.possible, qid + ' 參考答案總分應為滿分');
  });
}
console.log('113 年民法申論題（法制／智財、財稅行政）測試通過');

/* ===== 113 年民法申論題：公平交易管理（32820）2 題、地政高考 3 題、地政普考民法物權編概要（42850）4 題 ===== */
{
  const sel = (re) => data.essays.filter(q => re.test(q.id));
  const ftc = sel(/^113-g3ftc-E/), hi = sel(/^113-g3land-E/), lo = sel(/^113-pland-E/);
  assert.deepStrictEqual([ftc.length, hi.length, lo.length], [2, 3, 4]);
  assert.deepStrictEqual(ftc.map(q => q.points), [25, 25]); assert.deepStrictEqual(hi.map(q => q.points), [30, 40, 30]);
  assert.deepStrictEqual(lo.map(q => q.points), [25, 25, 25, 25]);
  ftc.concat(hi, lo).forEach(q => { assert.strictEqual(q.year_roc, 113); q.parts.forEach(p => assert.ok(p.law && p.statutes.length >= 1, q.id + '/' + p.id + ' 應有 law 旗標與應引用條文')); });
  assert.deepStrictEqual(ftc[0].categories, ['公平交易管理']); assert.strictEqual(ftc[0].subject, '民法（包括民法總則、債編與物權編）');
  assert.ok(hi.every(q => q.categories[0] === '地政' && q.exam === '公務人員高等考試三級考試' && q.subject === '民法（包括總則、物權、親屬與繼承編）'));
  assert.ok(lo.every(q => q.categories[0] === '地政' && q.exam === '公務人員普通考試' && q.subject === '民法物權編概要'));
  assert.strictEqual(shape('113-g3ftc-E1'), '8,9,8'); assert.strictEqual(shape('113-g3land-E1'), '10,10,10');
  assert.strictEqual(shape('113-g3land-E2'), '12,14,14'); assert.strictEqual(shape('113-g3land-E3'), '15,15');
  // 部分答對與常見錯誤：只答結論、缺關鍵概念，不應拿滿分
  const g = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t), it = (r, id) => r.items.find(i => i.id === id).earned;
  assert.ok(g('113-g3ftc-E1', '2', '丙須返還 A 屋，並按每月 2 萬元付租金給甲。').earned < 5);   // 漏了第 952 條與第 959 條
  assert.ok(it(g('113-g3ftc-E2', '2', '材料滅失，乙給付不能，所以免除給付義務。'), 'r1') < 5);   // 忽略可歸責
  assert.ok(g('113-g3land-E1', '1', '乙脅迫甲，買賣契約無效。').earned < 6);                   // 沒有第 92、93 條
  assert.ok(it(g('113-g3land-E2', '2', '戊占有已 6 年，請求權罹於時效消滅。'), 'r2') < 4);       // 誤認時效
  assert.ok(g('113-g3land-E3', '1', 'A 地已賣給丙，乙的抵押權消滅，不得對丙主張。').earned < 6);   // 忽略追及效力
  assert.ok(g('113-pland-E1', '3', '丙是繼承人，可以單獨請求乙給付 50 萬元。').earned < 4);
  assert.ok(it(g('113-pland-E2', '2', '丙是善意第三人，甲不得對抗。'), 'r2') < 5);
  assert.ok(g('113-pland-E3', '2', '法院應降價拍賣。').earned < 5);                            // 沒有第 866 條第 2 項
  assert.ok(it(g('113-pland-E4', '3', 'B 屋價金乙也有優先受償權。'), 'r2') < 4);
  // 不同寫法也要認得
  assert.strictEqual(it(g('113-pland-E3', '2', '依民法§866Ⅱ，抵押權實行受有影響，法院得除去丙的地上權後拍賣，因無人應買。'), 'r1'), 5);
  // 回饋：法律題少寫條文時會提醒；已引用條文則不再提醒
  const weak = C.feedbackEssayPart(part('113-g3land-E3', '1'), { text: '我認為乙可以請求丙移轉。', auto: {}, scores: {} });
  assert.ok(weak.points.some(x => /沒有明確引用/.test(x.text) && /867/.test(x.text)), '應提醒引用民法第 867 條');
  const full = C.stripHtml(part('113-g3land-E3', '1').model_answer), gr = g('113-g3land-E3', '1', full), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; });
  const ok = C.feedbackEssayPart(part('113-g3land-E3', '1'), { text: full, auto: sc, scores: sc });
  assert.ok(!ok.points.some(x => /沒有明確引用/.test(x.text)), '已引用條文不應再提醒');
  console.log('113 年民法申論題（公平交易管理、地政）測試通過');
}

/* ===== 115 年觀光行政：普考觀光學概要（42320）、觀光行銷學概要（42330）、高考三級觀光資源規劃（33540）：各 4 題，每題 25 分 ===== */
{
  const sel = (k) => data.essays.filter(q => q.id.startsWith(k));
  const a = sel('115-ptour-E'), b = sel('115-pmkt-E'), c = sel('115-g3tres-E');
  assert.deepStrictEqual([a.length, b.length, c.length], [4, 4, 4]);
  [a, b, c].forEach(qs => assert.ok(qs.every(q => q.points === 25 && q.year_roc === 115)));
  assert.ok(a.concat(b).every(q => q.exam === '公務人員普通考試' && q.categories.join() === '觀光行政'));
  assert.ok(c.every(q => q.exam === '公務人員高等考試三級考試' && q.categories.length === 2 && q.categories.every(x => /^觀光行政（選試觀光(英語|日語)）$/.test(x))));
  assert.ok(a.every(q => q.subject === '觀光學概要') && b.every(q => q.subject === '觀光行銷學概要') && c.every(q => q.subject === '觀光資源規劃'));
  // 小題結構（對照試題 PDF：觀光學概要第 3 題為 10 分＋15 分；其餘各題不分小題，配分為編者拆分）
  assert.strictEqual(shape('115-ptour-E3'), '10,15'); assert.strictEqual(shape('115-ptour-E1'), '12,13');
  assert.strictEqual(shape('115-pmkt-E4'), '8,9,8'); assert.strictEqual(shape('115-g3tres-E2'), '8,8,9');
  // 概念重疊的跨科目題（交通、低碳、差別訂價、永續、需求）不計入「別科答案不得過半」檢查，已在 OVERLAP 列出
  const g = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t), it = (r, id) => r.items.find(i => i.id === id).earned;
  // 部分作答：只答優點或只提名詞，不應拿滿分
  assert.ok(g('115-ptour-E1', '2', '智慧觀光的風險是個資外洩與資安問題。').earned < 13 * 0.6);
  assert.ok(g('115-ptour-E1', '1', '智慧觀光很方便。').earned <= 2);
  assert.ok(it(g('115-ptour-E2', '1', '觀光需求是人們想去旅遊。'), 'r1') < 4);
  assert.ok(g('115-pmkt-E3', '2', '旺季時價格調高，淡季時降價。').earned < 17 * 0.6);
  assert.ok(it(g('115-pmkt-E4', '1', '馬斯洛認為人有生理與安全需要。'), 'r1') < 5);
  assert.ok(g('115-g3tres-E3', '2', '觀光圈是整合平臺。').earned < 12 * 0.5);   // 沒有舉例
  assert.ok(it(g('115-g3tres-E4', '2', '原住民旅遊要注意文化商品化與真實性，舞台化會扭曲祭儀。'), 'r1') < 6);  // 只寫一個議題不得滿分
  assert.ok(g('115-g3tres-E1', '2', '日月潭要少開車。').earned < 15 * 0.5);
  // 不同寫法也要認得
  assert.ok(g('115-ptour-E4', '2', '交通部推出平日住宿券、Taiwan Pass 聯票與台灣好行優惠，並推動觀光圈與臺灣觀光100亮點、四季活動。').earned >= 8);
  assert.ok(it(g('115-pmkt-E3', '2', '航空與飯店採收益管理與動態訂價，依需求預測調整房價與住房率。'), 'r3') === 4);
  assert.ok(it(g('115-g3tres-E3', '2', '例如大東北角觀光圈，整合東北角海岸與山城資源，開發套裝行程。'), 'r3') === 4);
  // 回饋：失分的細目與常見錯誤提醒會出現
  const t0 = '觀光圈是區域觀光的整合平臺，負責協調跨域合作。', gr0 = g('115-g3tres-E3', '2', t0), sc0 = {}; gr0.items.forEach(i => { sc0[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('115-g3tres-E3', '2'), { text: t0, auto: sc0, scores: sc0 });
  assert.ok(gr0.earned > 0 && gr0.earned < 12);
  assert.ok(fb.points.some(x => /常見錯誤/.test(x.text)) && fb.points.some(x => /完全沒得分/.test(x.text)), '失分時應提示未得分的細目與常見錯誤');
  // 整題回饋：參考答案滿分
  data.essays.filter(q => /^115-(ptour|pmkt|g3tres)-/.test(q.id)).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('115 年觀光行政申論題測試通過');
}

/* ===== 114 年高考三級觀光行政：觀光日語（23760）、觀光英語（23660） ===== */
{
  const ja = data.essays.filter(q => q.id.startsWith('114-g3tja-')), en = data.essays.filter(q => q.id.startsWith('114-g3ten-'));
  assert.deepStrictEqual(ja.map(q => q.points), [35, 30, 35]); assert.deepStrictEqual(en.map(q => q.points), [30, 30, 40]);
  assert.ok(ja.every(q => q.year_roc === 114 && q.exam === '公務人員高等考試三級考試' && q.subject === '觀光日語' && q.categories.join() === '觀光行政（選試觀光日語）'));
  assert.ok(en.every(q => q.year_roc === 114 && q.exam === '公務人員高等考試三級考試' && q.subject === '觀光英語' && q.categories.join() === '觀光行政（選試觀光英語）'));
  assert.strictEqual(shape('114-g3tja-E1'), '20,15'); assert.strictEqual(shape('114-g3tja-E2'), '15,15'); assert.strictEqual(shape('114-g3tja-E3'), '35');
  assert.strictEqual(shape('114-g3ten-E1'), '30'); assert.strictEqual(shape('114-g3ten-E2'), '30'); assert.strictEqual(shape('114-g3ten-E3'), '40');
  // 作答語言與英文作文字數範圍
  assert.deepStrictEqual(ja.concat(en).map(q => q.parts.map(p => p.lang).join()), ['zh,zh', 'ja,ja', 'ja', 'zh', 'en', 'en']);
  assert.deepStrictEqual(part('114-g3ten-E3', '1').limit, { unit: 'word', min: 250, max: 300 });
  const wc = C.countUnits(C.stripHtml(part('114-g3ten-E3', '1').model_answer).replace(/<br>/g, ' '), 'word').n;
  assert.ok(wc >= 250 && wc <= 300, '英文作文參考答案應在 250–300 字，實為 ' + wc);
  // 部分作答：得部分分數，不是 0 也不是滿分
  const sc = (id, pid, t) => C.gradeEssayPart(part(id, pid), t).earned;
  const mid = [
    ['114-g3tja-E1', '1', '外國駕照換成日本駕照的制度，國會有人指出觀光客可以用飯店當住址申請，知識確認太簡單，警察廳正在檢討。'],
    ['114-g3tja-E1', '2', '因為米價上漲，超市有美國、台灣、韓國的米。這些米大部分不在最低進口量的零關稅配額內，要課高關稅。'],
    ['114-g3tja-E2', '2', '近年、ヨーロッパで竹ブームが起きている。竹は軽くて丈夫で耐震性があり、成長が速い。'],
    ['114-g3ten-E1', '1', '當人們聽到達文西的名字，常常想到他是畫家，畫了蒙娜麗莎和最後的晚餐。'],
    ['114-g3ten-E2', '1', 'Egypt scenery is fascinating. Muslims pray five times a day and call to prayer is heard.']];
  mid.forEach(([id, pid, t]) => { const e = sc(id, pid, t), pts = part(id, pid).points; assert.ok(e > 0 && e < pts, id + '/' + pid + ' 部分作答應得部分分數，實得 ' + e); });
  // 日文作文：只有幾句關鍵字（字數遠低於下限）不應拿高分；英文作文字數太少會按比例調降
  assert.ok(sc('114-g3tja-E3', '1', '台湾は観光のDXを進めるべきだと思う。まず、アプリで多言語の情報を出す。次に、キャッシュレス決済を広げる。例えば悠遊カードを使う。') < 35 * 0.6);
  assert.ok(sc('114-g3ten-E3', '1', 'I disagree. Tourists want to enjoy themselves.') < 40 * 0.1);
  // 常見錯誤：翻譯題用錯語言會被提醒
  assert.ok(C.langWarning('ja', 'The main idea of bamboo boom in Europe is that bamboo is light and strong and fast growing.'));
  assert.ok(C.langWarning('en', '埃及的景觀真的令人著迷，有個聲音我也相當熟悉，那就是回教的祈禱召喚。'));
  // 整題回饋：參考答案總分為滿分
  ja.concat(en).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), s = {}; gr.items.forEach(i => { s[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: s, scores: s }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('114 年觀光行政（觀光日語、觀光英語）申論題測試通過');
}

/* ===== 114 年高考三級觀光行政：觀光學（23620、23720）、觀光資源規劃（23640、23740）：各 4 題，每題 25 分 ===== */
{
  const tour = data.essays.filter(q => q.id.startsWith('114-g3tour-')), res = data.essays.filter(q => q.id.startsWith('114-g3tres-'));
  assert.strictEqual(tour.length, 4); assert.strictEqual(res.length, 4);
  assert.ok(tour.every(q => q.year_roc === 114 && q.exam === '公務人員高等考試三級考試' && q.subject === '觀光學' && q.points === 25 && q.categories.length === 2 && q.categories.every(x => /^觀光行政（選試觀光(英語|日語)）$/.test(x))));
  assert.ok(res.every(q => q.year_roc === 114 && q.exam === '公務人員高等考試三級考試' && q.subject === '觀光資源規劃' && q.points === 25 && q.categories.length === 2));
  const sh = (id) => data.essays.find(q => q.id === id).parts.map(p => p.points).join(',');
  assert.strictEqual(sh('114-g3tres-E4'), '10,10,5');  // 對照試題：10＋10＋5 分
  ['114-g3tour-E1', '114-g3tour-E2', '114-g3tour-E3', '114-g3tour-E4', '114-g3tres-E1', '114-g3tres-E2', '114-g3tres-E3'].forEach(id => assert.strictEqual(data.essays.find(q => q.id === id).parts.reduce((a, p) => a + p.points, 0), 25));
  // 參考答案對自己的評分細目要滿分；空泛答案拿不到分
  [...tour, ...res].forEach(q => q.parts.forEach(p => {
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer)).earned, p.points, q.id + '/' + p.id + ' 參考答案未拿滿分');
    assert.ok(C.gradeEssayPart(p, '這題很重要，觀光需要發展。').earned <= 1, q.id + '/' + p.id + ' 空泛答案不應得分');
  }));
  const g = (id, pid, txt) => C.gradeEssayPart(data.essays.find(q => q.id === id).parts.find(p => p.id === pid), txt);
  assert.ok(g('114-g3tour-E4', '1', '觀光前瞻建設計畫屬前瞻基礎建設，110至114年，分為國際魅力景區、區域旅遊品牌與臺鐵車站美學與功能提升三項。').earned >= 6);
  assert.ok(g('114-g3tres-E3', '2', '新臺幣升值使外國旅客來臺旅遊成本提高，價格競爭力下降；國人出國旅遊變便宜，國旅被分流。').earned >= 5);
  assert.ok(g('114-g3tres-E4', '3', '文化資產管理要訂定承載量與預約制、分區管理，並讓社區參與、加強解說教育。').earned >= 3);
  assert.ok(g('114-g3tres-E1', '2', '黑鮪魚要遵守配額與體長限制，保護幼魚與產卵場，並建立漁獲追溯。').earned >= 3);
  assert.ok(g('114-g3tour-E2', '2', '觀光倫理規範第6條要求業者提供誠實資訊、契約透明、安全與保險救援；政府要保障旅客安全，旅遊警示須公正準確。').earned >= 6);
  console.log('114 年觀光行政（觀光學、觀光資源規劃）申論題測試通過');
}

/* ===== 113 年觀光行政：高考三級觀光資源規劃（33240、33340）、普考觀光行銷學概要（42530） ===== */
{
  const sel = (k) => data.essays.filter(q => q.id.startsWith(k));
  const res = sel('113-g3tres-E'), mkt = sel('113-pmkt-E');
  assert.strictEqual(res.length, 4); assert.strictEqual(mkt.length, 4);
  assert.ok(res.every(q => q.year_roc === 113 && q.exam === '公務人員高等考試三級考試' && q.subject === '觀光資源規劃' && q.points === 25 && q.categories.length === 2 && q.categories.every(x => /^觀光行政（選試觀光(英語|日語)）$/.test(x))));
  assert.ok(mkt.every(q => q.year_roc === 113 && q.exam === '公務人員普通考試' && q.subject === '觀光行銷學概要' && q.categories.join() === '觀光行政'));
  assert.deepStrictEqual(mkt.map(q => q.points), [20, 25, 30 - 5, 30].map((x, i) => [20, 25, 25, 30][i]));  // 對照試題：10＋10、25、25、30 分
  const sh = (id) => data.essays.find(q => q.id === id).parts.map(p => p.points).join();
  assert.strictEqual(sh('113-g3tres-E1'), '5,5,5,5,5');   // 脫碳五項手段
  assert.strictEqual(sh('113-g3tres-E3'), '5,5,15');       // 原題 10 分（遊憩與生態因素）＋15 分（管制）
  assert.strictEqual(sh('113-pmkt-E1'), '10,10');          // 原題 10＋10 分
  assert.strictEqual(sh('113-pmkt-E3'), '5,5,5,5,5');      // 五種缺口
  assert.strictEqual(sh('113-pmkt-E4'), '10,10,10');       // 三個交叉體系
  const g = (id, pid, t) => C.gradeEssayPart(data.essays.find(q => q.id === id).parts.find(p => p.id === pid), t);
  const it = (r, rid) => r.items.find(x => x.id === rid).earned;
  // 空泛答案不得分
  res.concat(mkt).forEach(q => q.parts.forEach(p => assert.ok(C.gradeEssayPart(p, '這題很重要，觀光需要發展。').earned <= 1, q.id + '/' + p.id + ' 空泛答案不應得分')));
  // 各題合理的簡答可得分、單一名詞不可滿分
  assert.ok(g('113-g3tres-E1', '1', '旅宿業應汰換為LED照明與高效率變頻空調，並導入能源管理系統監測用電。').earned >= 4);
  assert.ok(g('113-g3tres-E1', '4', '旅館應裝設太陽光電、購買綠電憑證，並以熱泵取代燃油鍋爐。').earned >= 4);
  assert.ok(g('113-g3tres-E1', '5', '旅館要減少用電。').earned <= 1);
  assert.ok(g('113-g3tres-E2', '1', '舉辦臺灣自行車節與登山王挑戰，並加強東西向挑戰路線的安全與國際行銷。').earned >= 6);
  assert.ok(g('113-g3tres-E2', '3', '自行車道要改善鋪面、護欄與視距不佳的險坡，並縫合斷鏈、串聯路網與臺鐵車站。').earned >= 4);  // 簡短但切題，可得部分分
  assert.ok(g('113-g3tres-E2', '3', '自行車環島路網要優化安全：整修鋪面、加高護欄、在隧道增設智慧偵測，並設置慢車道；同時盤整既有路網、縫合斷鏈、串聯地方路線，改善臺鐵場站與補給站的友善服務設施。').earned >= 7);
  assert.ok(g('113-g3tres-E2', '2', '政府要蓋很多自行車道。').earned <= 2);
  assert.ok(g('113-g3tres-E3', '3', '綠島應採總量管制與預約制，依船班運量限制每日人數，並收取環境費、推動淡季旅遊與限制機車數量。').earned >= 9);
  assert.ok(g('113-g3tres-E3', '3', '限制遊客人數。').earned < 15 * 0.4);
  assert.ok(it(g('113-g3tres-E4', '1', '觀光資源有多樣性與地域性。'), 'r3') === 0);
  assert.ok(g('113-g3tres-E4', '2', '觀光資源能帶動就業與稅收，促進區域平衡發展，也要推動保育與永續。').earned >= 6);
  assert.ok(g('113-pmkt-E1', '2', '觀光產品最大的不同是無形性，看不見摸不到，所有權不移轉，購買前無法試用。').earned >= 4);
  assert.ok(g('113-pmkt-E1', '2', '觀光產品比較貴。').earned <= 1);
  assert.ok(g('113-pmkt-E2', '2', '內部行銷是公司對員工，透過教育訓練與激勵提高員工滿意，才能兌現對顧客的承諾。').earned >= 6);
  assert.ok(g('113-pmkt-E3', '1', '缺口一是顧客期望與管理者認知之間的落差，原因是缺乏市場研究，應加強顧客調查。').earned >= 4);
  assert.ok(g('113-pmkt-E3', '4', '缺口四是廣告承諾與實際服務傳遞的落差，因為過度承諾，需與營運部門協調。').earned >= 4);
  assert.ok(g('113-pmkt-E3', '2', '服務有五個缺口。').earned <= 1);
  assert.ok(g('113-pmkt-E4', '1', '服務營運系統是顧客看不見的後台，包含設施設備與作業流程，負責生產服務。').earned >= 4);
  // 回饋：失分細目會被點名、並顯示常見錯誤
  const part = (id, pid) => data.essays.find(q => q.id === id).parts.find(p => p.id === pid);
  const t0 = '缺口五是顧客期望與知覺服務之間的落差。', gr0 = g('113-pmkt-E3', '5', t0), sc0 = {}; gr0.items.forEach(i => { sc0[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('113-pmkt-E3', '5'), { text: t0, auto: sc0, scores: sc0 });
  assert.ok(gr0.earned > 0 && gr0.earned < 5);
  assert.ok(fb.points.some(x => /常見錯誤/.test(x.text)) && fb.points.some(x => /完全沒得分/.test(x.text)), '失分時應提示未得分的細目與常見錯誤');
  // 整題回饋：參考答案總分應為滿分
  res.concat(mkt).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('113 年觀光行政（觀光資源規劃、觀光行銷學概要）申論題測試通過');
}
/* ===== 113 年普通考試觀光行政：觀光學概要（42520）4 題 ===== */
{
  const tour = data.essays.filter(q => q.id.startsWith('113-ptour-E'));
  assert.strictEqual(tour.length, 4);
  assert.ok(tour.every(q => q.year_roc === 113 && q.exam === '公務人員普通考試' && q.subject === '觀光學概要' && q.categories.join() === '觀光行政' && q.points === 25));
  const sh = (id) => E[id].parts.map(p => p.points).join(',');
  assert.strictEqual(sh('113-ptour-E1'), '7,7,6,5');   // 四個名詞：原題 7、7、6、5 分
  assert.strictEqual(sh('113-ptour-E2'), '9,8,8');     // 編者拆分：資源、市場、服務
  assert.strictEqual(sh('113-ptour-E3'), '8,8,9');     // 編者拆分：一階、二階、三階與差別
  assert.strictEqual(sh('113-ptour-E4'), '7,10,8');    // 編者拆分：架構、成本領導與差異化、集中與選擇
  const g = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t);
  const it = (r, id) => r.items.find(x => x.id === id).earned;
  // 名詞解釋：定義正確可得高分，空泛或只寫名詞者低分
  assert.ok(g('113-ptour-E1', '1', 'RSO 是地接社，受國外旅行社委託，在當地接待入境旅客，安排住宿、餐飲、交通與導遊行程。').earned >= 5);
  assert.ok(g('113-ptour-E1', '1', 'RSO 是旅行社。').earned <= 2);
  assert.ok(g('113-ptour-E1', '2', 'tailor-made tour 是依客戶的需求、偏好與預算量身設計行程，不同於標準化的套裝行程，彈性高但價格較高。').earned >= 5);
  assert.ok(g('113-ptour-E1', '2', '客製化旅遊。').earned <= 3);   // 只寫名詞，不得拿到滿分
  assert.ok(g('113-ptour-E1', '3', 'rack rate 是旅館公告的牌價，是未打折的最高房價，作為各種折扣與議價的基準，實際成交價通常較低。').earned >= 5);
  assert.ok(g('113-ptour-E1', '3', 'rack rate 是最便宜的促銷價。').earned <= 2);
  assert.ok(g('113-ptour-E1', '4', 'mass tourism 是大眾觀光，大量旅客參加標準化套裝行程集中旅遊，帶動經濟但造成擁擠與環境衝擊。').earned >= 4);
  assert.ok(g('113-ptour-E1', '4', 'mass tourism 是很多人去玩。').earned <= 1);
  // 申論題：各小題的關鍵得分點
  assert.ok(g('113-ptour-E2', '1', '觀光資源包括自然與人文資源，是吸引遊客的基礎，也要保育與永續利用，管制承載量。').earned >= 6);
  assert.ok(g('113-ptour-E2', '1', '觀光資源很重要。').earned <= 2);
  assert.ok(g('113-ptour-E2', '2', '觀光市場是客源與需求，規模與消費力影響收益，要做市場區隔、選擇目標市場並加強行銷。').earned >= 5);
  assert.ok(g('113-ptour-E2', '3', '觀光服務連結資源與市場，包含住宿、餐飲與導遊；服務品質影響滿意度與重遊；三者相輔相成，缺一不可。').earned >= 6);
  assert.ok(g('113-ptour-E2', '3', '要提供好的服務。').earned <= 2);
  assert.ok(g('113-ptour-E3', '1', '一階通路是供應商透過零售旅行社賣給旅客，只有一個中間商，供應商支付佣金，例如航空公司機票。').earned >= 6);
  assert.ok(g('113-ptour-E3', '2', '二階通路是供應商先賣給躉售商（批發商），包裝成套裝行程後再交給零售旅行社銷售給旅客，通路較長、價格較高。').earned >= 6);
  assert.ok(g('113-ptour-E3', '3', '三階通路是供應商、地接社、國外躉售商、零售旅行社到旅客，通路越長，加價越多，控制力越低，但可觸及跨國客源。').earned >= 7);
  assert.ok(g('113-ptour-E3', '3', '通路越長越複雜。').earned <= 3);
  assert.ok(g('113-ptour-E4', '1', 'Porter 的一般性策略有成本領導、差異化與集中，並以五力分析競爭環境。').earned >= 5);
  assert.ok(g('113-ptour-E4', '2', '成本領導以規模經濟降低成本並提供低價，如廉價航空；差異化以品牌與服務品質建立特色，讓顧客願意付較高價格。').earned >= 7);
  assert.ok(g('113-ptour-E4', '2', '我會降低成本、提高品質。').earned <= 5);
  assert.ok(g('113-ptour-E4', '3', '我會採集中策略，聚焦親子客群，並依自身資源選擇，避免卡在中間。').earned >= 5);
  // 只寫一階，二階與三階不應拿高分（不被別的小題的內容蒙混）
  const only1 = '一階通路是供應商透過零售旅行社賣給旅客，只有一個中間商，支付佣金。';
  assert.ok(g('113-ptour-E3', '2', only1).earned <= 3);
  assert.ok(g('113-ptour-E3', '3', only1).earned <= 2);
  // 回饋：失分時列出未得分細目與常見錯誤
  const t0 = 'RSO 是旅行社。', gr0 = g('113-ptour-E1', '1', t0), sc0 = {}; gr0.items.forEach(i => { sc0[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('113-ptour-E1', '1'), { text: t0, auto: sc0, scores: sc0 });
  assert.ok(fb.points.some(x => /常見錯誤/.test(x.text)) && fb.points.some(x => /完全沒得分|部分/.test(x.text)), '失分時應提示未得分的細目與常見錯誤');
  // 整題回饋：參考答案總分應為滿分；只寫一個小題時總分明顯偏低
  tour.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('113 年普通考試觀光學概要（42520）申論題測試通過');
}

/* ===== 113 年高考三級觀光行政：觀光英語（33260）、觀光學（33220、33320）、觀光日語（33360） ===== */
{
  const en = data.essays.filter(q => q.id.startsWith('113-g3ten-')), tour = data.essays.filter(q => q.id.startsWith('113-g3tour-')), ja = data.essays.filter(q => q.id.startsWith('113-g3tja-'));
  assert.strictEqual(en.length, 4); assert.strictEqual(tour.length, 4); assert.strictEqual(ja.length, 3);
  assert.deepStrictEqual(en.map(q => q.points), [20, 20, 20, 40]); assert.deepStrictEqual(tour.map(q => q.points), [25, 25, 25, 25]); assert.deepStrictEqual(ja.map(q => q.points), [40, 30, 30]);
  assert.ok(en.concat(tour, ja).every(q => q.year_roc === 113 && q.exam === '公務人員高等考試三級考試'));
  assert.ok(en.every(q => q.subject === '觀光英語' && q.categories.join() === '觀光行政（選試觀光英語）'));
  assert.ok(ja.every(q => q.subject === '觀光日語' && q.categories.join() === '觀光行政（選試觀光日語）'));
  assert.ok(tour.every(q => q.subject === '觀光學' && q.categories.join() === '觀光行政（選試觀光英語）,觀光行政（選試觀光日語）'));
  // 小題配分（依原試題）
  assert.strictEqual(shape('113-g3ten-E1'), '10,10'); assert.strictEqual(shape('113-g3ten-E4'), '40');
  assert.strictEqual(shape('113-g3tour-E1'), '5,7,8,5'); assert.strictEqual(shape('113-g3tour-E3'), '10,15'); assert.strictEqual(shape('113-g3tour-E4'), '12,13');
  assert.strictEqual(shape('113-g3tja-E1'), '10,10,10,10'); assert.strictEqual(shape('113-g3tja-E2'), '10,10,10'); assert.strictEqual(shape('113-g3tja-E3'), '30');
  // 作答語言與字數範圍
  assert.deepStrictEqual(en.map(q => q.parts.map(p => p.lang).join()), ['en,en', 'zh', 'en', 'en']);
  assert.deepStrictEqual(tour.map(q => q.parts.map(p => p.lang).join()), ['zh,zh,zh,zh', 'zh,zh,zh', 'zh,zh', 'zh,zh']);
  assert.deepStrictEqual(ja.map(q => q.parts.map(p => p.lang).join()), ['ja,ja,ja,ja', 'zh,zh,zh', 'ja']);
  assert.deepStrictEqual(part('113-g3ten-E4', '1').limit, { unit: 'word', min: 250, max: 300 });
  assert.deepStrictEqual(part('113-g3tja-E3', '1').limit, { unit: 'char', min: 300, max: 400 });
  const wc = C.countUnits(C.stripHtml(part('113-g3ten-E4', '1').model_answer).replace(/<br>/g, ' '), 'word').n;
  assert.ok(wc >= 250 && wc <= 300, '英文作文參考答案應在 250–300 字，實為 ' + wc);
  const jc = C.countUnits(C.stripHtml(part('113-g3tja-E3', '1').model_answer), 'char').n;
  assert.ok(jc >= 300 && jc <= 400, '日文作文參考答案應在 300–400 字，實為 ' + jc);
  // 參考答案拿滿分、空白與無關答案得 0、泛泛而談不得高分
  en.concat(tour, ja).forEach(q => q.parts.forEach(p => {
    assert.strictEqual(C.gradeEssayPart(p, C.stripHtml(p.model_answer.replace(/<br>/g, ' '))).earned, p.points, q.id + '/' + p.id + ' 參考答案應得滿分');
    assert.strictEqual(C.gradeEssayPart(p, '').earned, 0);
    assert.ok(C.gradeEssayPart(p, '這題很重要，觀光需要發展，我認為大家都要努力。').earned <= p.points * 0.2, q.id + '/' + p.id + ' 空泛答案不應得高分');
  }));
  const g = (id, pid, t) => C.gradeEssayPart(part(id, pid), t);
  const mid = (id, pid, t, lo, hi) => { const e = g(id, pid, t).earned; assert.ok(e >= lo && e <= hi, id + '/' + pid + ' 部分作答應得 ' + lo + '～' + hi + ' 分，實得 ' + e); };
  // 部分作答：得部分分數，不是 0 也不是滿分
  mid('113-g3ten-E1', '1', 'A DMO is an organization that markets and promotes a destination to attract visitors.', 3, 7);
  mid('113-g3ten-E1', '2', 'A Tourism Satellite Account is a statistical framework to measure the economic contribution of tourism.', 3, 7);
  mid('113-g3ten-E2', '1', '位於臺灣東部的太魯閣國家公園是國內外遊客熱門的旅遊地點，今年4月發生25年來最強烈的地震，園區將關閉至另行通知。', 5, 14);
  mid('113-g3ten-E3', '1', 'The rapid development of artificial intelligence has created unprecedented opportunities for all walks of life, and tourism operators are actively introducing AI and robots to improve service quality and efficiency.', 5, 12);
  mid('113-g3tour-E1', '4', '改良式美式計價（MAP）的房價包含客房與兩餐，通常是早餐與晚餐。', 3, 4);
  mid('113-g3tour-E3', '1', '紅海策略是在既有市場中與對手正面競爭，常打價格戰；藍海策略是開創新市場與新需求，讓競爭變得無關緊要。', 4, 8);
  mid('113-g3tja-E2', '2', '在世界經濟論壇（WEF）的性別差距指數2023年版中，日本在146個國家中排名第125位。', 3, 5);
  mid('113-g3tja-E3', '1', '台湾の一番美しい風景は人だとよく言われます。私は賛成だと思います。例えば、道に迷った時に親切に案内してもらったことがあります。', 4, 18);
  // 作文字數不到下限一半時，初判分數按比例調降
  const shortJa = g('113-g3tja-E3', '1', 'まず、台湾の人は親切です。例えば、道を教えてくれます。しかし、期待しすぎも問題です。このように、人を大切にしたいと思います。');
  assert.ok(shortJa.scale < 1 && shortJa.earned <= 15);
  // 常見錯誤：MAP 寫成三餐（那是 AP）只能拿到部分分數
  assert.ok(g('113-g3tour-E1', '4', 'MAP 是房價包含三餐的美式計價。').earned <= 2);
  console.log('113 年觀光行政（觀光英語、觀光學、觀光日語）申論題測試通過');
}

/* ===== 115、113 年高考三級觀光行政：旅運經營學（33450／33550、33250／33350）各 4 題 ===== */
{
  const sel = (yr) => data.essays.filter(q => q.id.startsWith(yr + '-g3trv-E'));
  const a = sel(115), b = sel(113);
  assert.strictEqual(a.length, 4); assert.strictEqual(b.length, 4);
  assert.ok(a.concat(b).every(q => q.points === 25 && q.subject === '旅運經營學' && q.exam === '公務人員高等考試三級考試' && q.categories.length === 2));
  assert.strictEqual(shape('115-g3trv-E1'), '5,5,5,5,5'); assert.strictEqual(shape('115-g3trv-E2'), '9,8,8');
  assert.strictEqual(shape('115-g3trv-E3'), '5,10,10'); assert.strictEqual(shape('115-g3trv-E4'), '13,12');
  assert.strictEqual(shape('113-g3trv-E1'), '12,13'); assert.strictEqual(shape('113-g3trv-E2'), '10,15');
  assert.strictEqual(shape('113-g3trv-E3'), '9,9,7'); assert.strictEqual(shape('113-g3trv-E4'), '5,5,5,5,5');
  const g = (id, pid, t) => C.gradeEssayPart(part(id, pid), t);
  const mid = (id, pid, t, lo, hi) => { const e = g(id, pid, t).earned; assert.ok(e >= lo && e <= hi, id + '/' + pid + ' 應得 ' + lo + '～' + hi + ' 分，實得 ' + e); };
  // 名詞：寫出重點得高分，只寫一句空泛話不得高分
  mid('115-g3trv-E1', '1', 'Disintermediation 是去中介化，航空公司與旅館繞過旅行社，透過官網直接銷售給消費者，旅行社要轉型提供加值服務。', 4, 5);
  mid('115-g3trv-E1', '1', 'Disintermediation 是沒有中間商。', 0, 3);
  mid('115-g3trv-E1', '2', 'SDGs 是 Sustainable Development Goals，聯合國 17 項永續發展目標；ESG 是 Environmental、Social、Governance，環境、社會與公司治理，用來評估企業永續。', 4, 5);
  mid('115-g3trv-E1', '2', 'SDGs 與 ESG 都是永續。', 0, 2);
  mid('115-g3trv-E1', '4', 'ESTA 是 Electronic System for Travel Authorization，美國免簽證計畫的電子旅行授權，赴美前要上網申請，停留 90 天內，不是簽證。', 4, 5);
  mid('115-g3trv-E1', '4', 'ESTA 是美國簽證。', 0, 3);
  mid('115-g3trv-E1', '5', 'Biosecurity 是生物安全，防止疫病與外來種經旅客行李傳入，入境要檢疫申報，違規會被罰款。', 4, 5);
  mid('113-g3trv-E4', '1', '第七航權是航空公司在兩個外國之間載運客貨，且不以本國為起點或終點，是最開放的航權。', 4, 5);
  mid('113-g3trv-E4', '1', '第七航權是很重要的航權。', 0, 2);
  mid('113-g3trv-E4', '2', '黃皮書是國際預防接種證明書，WHO 格式，證明已接種黃熱病疫苗，前往非洲或南美疫區可能入境時要出示。', 4, 5);
  mid('113-g3trv-E4', '3', 'FAM tour 是熟悉旅遊，邀請旅行業者與媒體免費體驗目的地產品，目的是促銷與提升銷售信心。', 4, 5);
  mid('113-g3trv-E4', '4', 'Charter flight 是包機，旅行社向航空公司租用整架飛機的不定期航班，成本較低較彈性，但要承擔空位風險。', 4, 5);
  mid('113-g3trv-E4', '5', '乙種旅行社是旅行業三類中業務範圍最小的一種，只能辦國內旅遊，招攬接待本國人，代理綜合旅行業招攬國內團體，不得辦出國。', 4, 5);
  mid('113-g3trv-E4', '5', '乙種旅行社不得辦理出國旅遊。', 0, 3);
  // 申論題：完整重點得高分，空泛答案不得高分
  mid('115-g3trv-E2', '1', '網站要載明公司名稱、種類、註冊編號、地址電話，投保責任保險與履約保證保險及金額，行程、出發日、費用，並登載旅遊契約與退費條件、交付收據。', 7, 9);
  mid('115-g3trv-E2', '1', '網站要寫公司資訊和行程內容。', 0, 4);
  mid('115-g3trv-E2', '2', '依個資法第5條要以誠實信用方法，不得逾越特定目的必要範圍；蒐集要依第8條告知並取得同意，目的外利用受限，並要有安全維護與事故通報。', 6, 8);
  mid('115-g3trv-E2', '2', '旅行社要保護旅客個資。', 0, 3);
  mid('115-g3trv-E2', '3', '大數據可做精準行銷與個人化推薦，但有外洩與大數據殺熟風險；應最小蒐集、告知同意與退出、去識別化，並做好資安與資料治理。', 6, 8);
  mid('115-g3trv-E3', '1', '全部套裝內含是船票一次付費就包含航行、住宿艙房、餐飲與娛樂表演，船本身是目的地；另有岸上觀光、酒水、SPA 等自費項目。', 4, 5);
  mid('115-g3trv-E3', '2', '傳統套裝由旅行社自行整合航空與旅館並議價；郵輪由郵輪公司統籌，旅行社多為銷售通路；郵輪航線與港口固定，受天候影響，彈性低；郵輪採艙等收益管理，有船上消費與包艙風險。', 7, 10);
  mid('115-g3trv-E3', '2', '郵輪比較貴，傳統套裝比較便宜。', 0, 3);
  mid('115-g3trv-E3', '3', '針對親子與銀髮客群做主題，推出機加郵輪與登船前後行程、岸上觀光選擇，採早鳥與包艙定價，配置中文領隊，並與郵輪公司合作分散風險。', 7, 10);
  mid('115-g3trv-E3', '3', '郵輪要降價促銷。', 0, 4);
  mid('115-g3trv-E4', '1', 'PAK 是航空公司與多家旅行社聯營的套裝，航空公司提供團體機位配額，旅行社統一產品與品牌、各自收客，由 PAK 中心彙整名單湊團訂位，領隊出團後結帳分潤，並定期開會檢討。', 10, 13);
  mid('115-g3trv-E4', '1', 'PAK 是旅行社聯合銷售。', 0, 5);
  mid('115-g3trv-E4', '2', '困境包括機位與利益分配不公、私心搶客與湊票、各社品質與價格不一、客訴責任歸屬不清、資訊不透明、依賴航空公司；建議訂定契約規則、設 PAK 中心與退出機制。', 9, 12);
  mid('113-g3trv-E1', '1', '臺灣有高山、海岸、離島、溫泉與國家公園等自然資源，原住民與客家文化、宗教節慶、古蹟、夜市美食等人文資源，休閒農業、鐵道自行車等特色，交通便利、安全友善且多元密集。', 9, 12);
  mid('113-g3trv-E1', '1', '臺灣風景很美，景點很多。', 0, 4);
  mid('113-g3trv-E1', '2', '先定位品牌與區隔客源，發展主題套裝與觀光圈，重視永續與承載量，利用旅展、FAM tour 與數位行銷，公私協力整合，並檢討季節集中與風險。', 9, 13);
  mid('113-g3trv-E2', '1', '旅行社用 GDS 與 CRS 訂機票旅館，官網、APP 與 OTA 銷售，後台用 ERP 管理團務與會計，CRM 管理會員。', 8, 10);
  mid('113-g3trv-E2', '2', '運用 SEO 與社群行銷、大數據個人化推薦，即時訂位付款並以 API 串接動態套裝，CRM 與 AI 客服經營會員，雲端 ERP 管理並注意資安與個資，培訓員工。', 11, 15);
  mid('113-g3trv-E2', '2', '旅行社要用網路賣旅遊。', 0, 5);
  mid('113-g3trv-E3', '1', '地接社先對國外旅行社報價簽約，確認名單與班機，辦理簽證或入境許可，預訂旅館餐廳遊覽車門票，安排有執業證的導遊並投保，行前確認。', 7, 9);
  mid('113-g3trv-E3', '2', '機場接機核對名單，送旅客入住旅館；導遊帶領行程與解說，掌控時間交通品質；遇到緊急事件延誤傷病要處理通報；最後退房送機出境。', 7, 9);
  mid('113-g3trv-E3', '3', '結團後要向國外旅行社結帳請款，與供應商結算，做滿意度調查並處理客訴、歸檔；導遊要有執業證、投保責任險，保護個資，不得強迫購物。', 5, 7);
  mid('113-g3trv-E3', '2', '導遊帶旅客玩。', 0, 3);
  // 失分時：列出未得分細目與常見錯誤
  const t0 = '網站要寫公司資訊和行程內容。', gr0 = g('115-g3trv-E2', '1', t0), sc0 = {}; gr0.items.forEach(i => { sc0[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('115-g3trv-E2', '1'), { text: t0, auto: sc0, scores: sc0 });
  assert.ok(fb.points.some(x => /常見錯誤/.test(x.text)) && fb.points.some(x => /完全沒得分|部分/.test(x.text)), '失分時應提示未得分的細目與常見錯誤');
  // 整題回饋：參考答案總分應為滿分
  a.concat(b).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('115、113 年高考三級旅運經營學申論題測試通過');
}

/* ===== 113、115 年普通考試觀光行政：旅運經營學概要（42550、42350）：各 4 題，每題 25 分 ===== */
{
  const a = data.essays.filter(q => q.id.startsWith('113-ptrv-E')), b = data.essays.filter(q => q.id.startsWith('115-ptrv-E'));
  assert.deepStrictEqual([a.length, b.length], [4, 4]);
  assert.ok(a.concat(b).every(q => q.points === 25 && q.exam === '公務人員普通考試' && q.categories.join() === '觀光行政' && q.subject === '旅運經營學概要'));
  assert.ok(a.every(q => q.year_roc === 113) && b.every(q => q.year_roc === 115));
  // 小題結構：113 年第 2、3 題為原題配分（15＋10、9＋16），第 4 題五個名詞各 5 分；其餘為編者拆分
  assert.strictEqual(shape('113-ptrv-E1'), '9,8,8'); assert.strictEqual(shape('113-ptrv-E2'), '15,10');
  assert.strictEqual(shape('113-ptrv-E3'), '9,16'); assert.strictEqual(shape('113-ptrv-E4'), '5,5,5,5,5');
  assert.strictEqual(shape('115-ptrv-E1'), '5,5,5,5,5'); assert.strictEqual(shape('115-ptrv-E2'), '9,10,6');
  assert.strictEqual(shape('115-ptrv-E3'), '12,13'); assert.strictEqual(shape('115-ptrv-E4'), '8,9,8');
  const g = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t), it = (r, id) => r.items.find(i => i.id === id).earned;
  // 部分作答：只寫一兩個重點或空泛敘述，不應拿滿分
  assert.ok(g('113-ptrv-E1', '1', '旅遊電子商務可以讓旅客在網站上查詢資料。').earned < 9 * 0.6);
  assert.ok(g('113-ptrv-E1', '3', '旅遊電子商務可以用 AI 聊天機器人當客服。').earned < 8 * 0.6);
  assert.ok(g('113-ptrv-E2', '1', '導遊要有熱忱與耐心，還要會說外語。').earned < 15 * 0.5);
  assert.ok(g('113-ptrv-E2', '2', '解說的時候聲音要大，要有趣。').earned < 10 * 0.6);
  assert.ok(g('113-ptrv-E3', '1', '旅行社分成綜合旅行社、甲種旅行社與乙種旅行社。').earned < 9 * 0.6);   // 只列類型，沒有業務範圍與未來方向
  assert.ok(g('113-ptrv-E3', '2', '中小型旅行社要多做廣告、降低價格，吸引更多旅客。').earned < 16 * 0.4);
  assert.ok(g('115-ptrv-E2', '2', '旅行業要投保履約保證保險與責任保險。').earned < 10 * 0.5);
  assert.ok(g('115-ptrv-E3', '2', '旅行社可以用 SWOT 分析優勢、劣勢、機會與威脅。').earned < 13 * 0.6);
  assert.ok(g('115-ptrv-E4', '1', '旅行業薪水很低，所以人才不足。').earned < 8 * 0.6);
  // 名詞：只寫一半的得分點（5 分名詞）不應拿滿分
  assert.ok(g('113-ptrv-E4', '5', '第一航權是飛越權。').earned < 5);
  assert.ok(g('113-ptrv-E4', '2', '芝加哥公約是航空的公約。').earned < 5);
  assert.ok(g('115-ptrv-E1', '1', 'FIT 是自由行。').earned < 5);
  assert.ok(g('115-ptrv-E1', '2', 'MICE 是會議與展覽。').earned < 5);
  assert.ok(g('115-ptrv-E1', '3', '海景房是看得到海的房間。').earned < 5);
  // 不同寫法也要認得
  assert.ok(it(g('113-ptrv-E4', '5', '第一航權（飛越權）指航空器可不降落而飛越他國領空。'), 'r1') === 3);
  assert.ok(it(g('113-ptrv-E4', '4', 'ICH 由 IATA 營運，替各航空公司的聯運債權債務做多邊淨額清算。'), 'r1') >= 2);
  assert.ok(it(g('115-ptrv-E1', '1', 'FIT 是 Free Independent Traveler，指不參加團體的散客。'), 'r1') === 2);
  assert.ok(it(g('115-ptrv-E1', '2', 'MICE 代表 Meetings、Incentives、Conventions、Exhibitions，即會議、獎勵旅遊、大型會議與展覽。'), 'r1') === 3);
  assert.ok(g('115-ptrv-E1', '5', '台灣觀巴是觀光署輔導旅行業推出的預約制半日、一日遊套裝行程，含導覽解說；台灣好行是景點接駁公車，定線定班，可用悠遊卡搭乘。').earned >= 4);
  assert.ok(it(g('115-ptrv-E2', '2', '責任保險的法定給付範圍為每位旅客意外死亡250萬至500萬元、傷害醫療10萬至20萬元、家屬善後費用10萬元、證件遺失2000元，且依第31條不論有無過失，可直接向保險人請求給付。'), 'r4') === 4);
  // 回饋：失分的細目與常見錯誤提醒會出現
  const t0 = '旅行業的薪資很低，所以人才不足。', gr0 = g('115-ptrv-E4', '1', t0), sc0 = {}; gr0.items.forEach(i => { sc0[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('115-ptrv-E4', '1'), { text: t0, auto: sc0, scores: sc0 });
  assert.ok(gr0.earned > 0 && gr0.earned < 8);
  assert.ok(fb.points.some(x => /常見錯誤/.test(x.text)) && fb.points.some(x => /完全沒得分|部分/.test(x.text)), '失分時應提示未得分的細目與常見錯誤');
  // 整題回饋：參考答案總分應為滿分
  a.concat(b).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('113、115 年普通考試旅運經營學概要申論題測試通過');
}

/* ===== 114 年高考三級觀光行政：旅運經營學（23650／23750）4 題 ===== */
{
  const qs = data.essays.filter(q => q.id.startsWith('114-g3trv-E'));
  assert.strictEqual(qs.length, 4);
  assert.ok(qs.every(q => q.points === 25 && q.subject === '旅運經營學' && q.year_roc === 114 && q.categories.length === 2));
  assert.strictEqual(shape('114-g3trv-E1'), '12,13'); assert.strictEqual(shape('114-g3trv-E2'), '8,17');
  assert.strictEqual(shape('114-g3trv-E3'), '8,17'); assert.strictEqual(shape('114-g3trv-E4'), '5,5,5,5,5');
  const g = (id, pid, t) => C.gradeEssayPart(part(id, pid), t);
  const mid = (id, pid, t, lo, hi) => { const e = g(id, pid, t).earned; assert.ok(e >= lo && e <= hi, id + '/' + pid + ' 應得 ' + lo + '～' + hi + ' 分，實得 ' + e); };
  mid('114-g3trv-E1', '1', 'TSA 是觀光衛星帳戶，以國民經濟會計為基礎，從需求面旅客消費與供給面產業衡量觀光對GDP、就業的貢獻；旅行業可據以掌握市場規模與消費結構，做市場區隔與產品規劃，並評估績效與投資決策。', 9, 12);
  mid('114-g3trv-E1', '1', 'TSA 是觀光統計。', 0, 4);
  mid('114-g3trv-E1', '2', 'TSA 量化觀光對GDP與就業的貢獻，提升觀光地位並爭取預算；分析消費結構與客源，作為政策規劃並評估補助與振興成效；可與國際比較，但編製有落差，需結合永續指標。', 9, 13);
  mid('114-g3trv-E2', '1', '疫情期間旅行業裁員減薪，人員轉職流失；疫後出團復甦但人力不足、人才斷層；原因是薪資福利偏低、工時長假日出團、職涯發展有限、年輕人意願低。', 6, 8);
  mid('114-g3trv-E2', '2', '招募多元管道與校企合作實習，培訓證照與師徒制；調整薪資與績效分潤、保險福利；改善工時排班與彈性，建立職涯晉升與員工關懷；用自動化與AI減少重複工作，建立雇主品牌。', 12, 17);
  mid('114-g3trv-E2', '2', '提高薪水就能解決缺工。', 0, 5);
  mid('114-g3trv-E3', '2', '依旅程運用：行前用大數據分析偏好做個人化推薦與客製行程；AI客服與聊天機器人全天候多語回應，複雜問題轉人工；旅程中即時推播與導覽翻譯；旅後分析評論、需求預測與動態訂價、CRM；注意個資資安與人性化服務。', 12, 17);
  mid('114-g3trv-E3', '2', '用 AI 提升效率。', 0, 5);
  mid('114-g3trv-E4', '1', '旅行業履約保證保險是為保障旅客，旅行業倒閉或無法履約時由保險公司賠償旅客預付的團費，不同於責任保險，依旅行業管理規則投保並標示。', 4, 5);
  mid('114-g3trv-E4', '1', '履約保證保險是旅遊平安險。', 0, 3);
  mid('114-g3trv-E4', '2', 'Scheduled flight 是定期航班，依公布的班表、航線與班次營運並公開售票，與包機相對。', 4, 5);
  mid('114-g3trv-E4', '3', 'Wholesaler tour 是躉售商大量採購並包裝套裝行程，透過零售旅行社銷售給旅客，付佣金並承擔風險。', 4, 5);
  mid('114-g3trv-E4', '4', 'CRS 是 Computerized Reservation System 電腦訂位系統，儲存班表座位票價，即時查詢訂位出票，後來發展為 GDS，提高效率。', 4, 5);
  mid('114-g3trv-E4', '5', 'Bundle selling 是把兩項以上產品組合成單一價格銷售，如機加酒，可提高客單價與帶動淡季，但不得強迫搭售。', 4, 5);
  mid('114-g3trv-E4', '5', 'Bundle selling 是團體折扣。', 0, 3);
  const t0 = 'TSA 是觀光統計。', gr0 = g('114-g3trv-E1', '1', t0), sc0 = {}; gr0.items.forEach(i => { sc0[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('114-g3trv-E1', '1'), { text: t0, auto: sc0, scores: sc0 });
  assert.ok(fb.points.some(x => /常見錯誤/.test(x.text)) && fb.points.some(x => /都沒有得分|完全沒得分|部分/.test(x.text)));
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('114 年高考三級旅運經營學申論題測試通過');
}

/* ===== 113 年貨幣銀行學（高考三級，代號 31950、32750）與貨幣銀行學概要（普考，代號 41720、42220）：金融保險、經建行政 ===== */
{
  const g3 = data.essays.filter(q => q.id.startsWith('113-g3mbk-')), pg = data.essays.filter(q => q.id.startsWith('113-pmbk-'));
  assert.strictEqual(g3.length, 4); assert.strictEqual(pg.length, 4);
  assert.ok(g3.every(q => q.points === 25 && q.year_roc === 113 && q.exam === '公務人員高等考試三級考試' && q.subject === '貨幣銀行學'));
  assert.ok(pg.every(q => q.points === 25 && q.year_roc === 113 && q.exam === '公務人員普通考試' && q.subject === '貨幣銀行學概要'));
  g3.concat(pg).forEach(q => assert.deepStrictEqual(q.categories, ['金融保險', '經建行政']));
  // 題庫沒有這兩科的選擇題（純申論科目，已列入 ESSAY_ONLY）
  assert.ok(!bank.questions.some(q => q.subject === '貨幣銀行學' || q.subject === '貨幣銀行學概要'));
  assert.strictEqual(shape('113-g3mbk-E1'), '13,12'); assert.strictEqual(shape('113-g3mbk-E2'), '13,12');
  assert.strictEqual(shape('113-g3mbk-E3'), '12,13'); assert.strictEqual(shape('113-g3mbk-E4'), '10,8,7');
  assert.strictEqual(shape('113-pmbk-E1'), '12,13'); assert.strictEqual(shape('113-pmbk-E2'), '10,15');
  assert.strictEqual(shape('113-pmbk-E3'), '12,13'); assert.strictEqual(shape('113-pmbk-E4'), '9,8,8');
  const gr = (id, pid, t) => C.gradeEssayPart(part(id, pid), t).earned;
  const mid = (id, pid, t, lo, hi) => { const e = gr(id, pid, t); assert.ok(e >= lo && e <= hi, id + '/' + pid + ' 預期 ' + lo + '~' + hi + '，實得 ' + e + '：' + t.slice(0, 20)); };

  // 高考三級第 1 題：缺口分析寫對可得約 2/3；方向寫反或空泛答案不得分
  mid('113-g3mbk-E1', '1', '淨利息收入＝利息收入－利息支出。重定價缺口 GAP = RSA − RSL，ΔNII = GAP × Δi。正缺口時利率上升獲利增加，負缺口時利率上升獲利減少。', 8, 10);
  mid('113-g3mbk-E1', '1', '利率上升銀行賺比較多', 0, 2);
  mid('113-g3mbk-E1', '2', '預期利率上升應建立正缺口，增加浮動利率放款與短期資產，出售長期固定利率債券；發行長期固定利率存單鎖定資金成本；利用利率交換付固定收浮動。', 11, 12);
  mid('113-g3mbk-E1', '2', '預期利率上升，銀行要增加長期固定利率放款。', 0, 2);  // 方向寫反
  // 第 2 題：只寫貿易順差等於賺外匯，沒有國際收支架構與資本外流 → 0 分
  mid('113-g3mbk-E2', '1', '國際收支：經常帳＋資本與金融帳＋準備資產變動＝0。貿易順差只是經常帳一部分，若資本與金融帳逆差，例如企業對外投資、外資匯出，會抵銷順差，整體國際收支沒有盈餘，央行不必買進外匯，外匯存底沒有增加。', 12, 13);
  mid('113-g3mbk-E2', '1', '貿易順差表示賺很多錢，外匯存底應該增加。', 0, 1);
  mid('113-g3mbk-E2', '2', '浮動匯率下新台幣升值，央行未干預；出口商把外匯留在外匯存款與海外帳戶，沒有結匯；央行也可能賣出外匯干預。', 9, 12);
  // 第 3 題：M1B 與 M2 的內容；M2 減少須說明資金流出 M2 的範圍
  mid('113-g3mbk-E3', '1', 'M1B 是通貨淨額加支票存款、活期存款與活期儲蓄存款；M2 是 M1B 加準貨幣，包含定期存款、外匯存款等。', 11, 12);
  mid('113-g3mbk-E3', '2', '股市活絡時，民眾把定期存款轉到活期存款與交割帳戶，M1B 增加；M2 減少是因為外資賣股匯出資金、交易稅繳政府，資金流出 M2 範圍。', 8, 11);
  mid('113-g3mbk-E3', '2', '股市很熱，大家都有錢，所以貨幣增加。', 0, 1);
  // 第 4 題：三個理論各一小題
  mid('113-g3mbk-E4', '1', '預期理論認為長期利率等於未來各期預期短期利率的平均。長期利率低於短期利率，表示市場預期未來短期利率下降，例如預期景氣衰退、央行降息，殖利率曲線反轉。', 9, 10);
  mid('113-g3mbk-E4', '2', '流動性貼水理論：長期利率等於預期短期利率平均加貼水，要預期短期利率大幅下降才會反轉；市場區隔理論：壽險與退休基金偏好長期債券，需求大，利率低。', 7, 8);
  mid('113-g3mbk-E4', '3', '景氣不好。', 0, 1);
  // 普考第 1 題：自選四項因素，前兩項（利率、提領風險）與後兩項（貼現借款、準備金利率）
  mid('113-pmbk-E1', '1', '利率上升，持有超額準備的機會成本增加，銀行會減少超額準備；存款不穩定、提款風險高時，銀行為了預防提款而多持有超額準備。', 11, 12);
  mid('113-pmbk-E1', '2', '央行重貼現率低、向央行借款容易，銀行就會減少超額準備；央行對準備金付息，超額準備會增加。', 5, 9);
  // 第 2 題：每種方法都要寫成本；只列方法最多拿一半
  mid('113-pmbk-E2', '1', '持有超額準備，成本是放棄放款的利息收入（機會成本）；出售證券，需付手續費，也可能有價格損失。', 10, 10);
  mid('113-pmbk-E2', '1', '持有超額準備；出售證券。', 4, 6);
  mid('113-pmbk-E2', '2', '向其他銀行拆款，要支付拆款利率；向央行貼現借款，要付重貼現率並受央行監督；發行定期存單，要付較高利息。', 12, 15);
  // 第 3 題：彈性大小與貨幣政策效果的方向寫對才得分
  mid('113-pmbk-E3', '1', '貨幣需求的利率彈性是貨幣需求量變動百分比除以利率變動百分比，衡量貨幣需求對利率的敏感程度。利率上升，持有貨幣的機會成本增加，貨幣需求減少。流動性陷阱時彈性無窮大。', 9, 12);
  mid('113-pmbk-E3', '2', '彈性小時 LM 陡，貨幣政策效果大；彈性大時 LM 平坦，貨幣政策效果小；流動性陷阱時貨幣政策無效。', 6, 9);
  mid('113-pmbk-E3', '2', '貨幣政策很重要。', 0, 1);
  // 第 4 題：金融恐慌、地下經濟、財富增加的貨幣供給方向
  mid('113-pmbk-E4', '1', '金融恐慌時民眾擠兌，提領存款換成現金，通貨存款比率上升；銀行也增加超額準備，貨幣乘數下降，貨幣供給減少。', 7, 9);
  mid('113-pmbk-E4', '2', '地下經濟用現金交易以逃稅，通貨存款比率上升，貨幣乘數下降，貨幣供給減少。', 5, 8);
  mid('113-pmbk-E4', '2', '地下經濟會讓貨幣供給增加。', 0, 1);  // 方向寫反
  mid('113-pmbk-E4', '3', '財富增加，民眾存款增加，通貨存款比率下降，貨幣乘數上升，貨幣供給增加。', 5, 8);
  // 貨幣乘數公式 m = (1+c)/(r+e+c)：c、e 同時上升則乘數下降，r 不變時 c 下降則乘數上升（驗算參考答案的方向）
  const m = (c, r, e) => (1 + c) / (r + e + c);
  assert.ok(m(0.4, 0.1, 0.1) < m(0.2, 0.1, 0.1) && m(0.2, 0.1, 0.3) < m(0.2, 0.1, 0.1) && m(0.1, 0.1, 0.1) > m(0.2, 0.1, 0.1));
  // 長期利率等於預期短期利率平均加貼水：預期短期利率由 5%、3%、2% 下降，平均 3.33%，低於目前短期利率 5%（貼水 0.3%）
  assert.ok((5 + 3 + 2) / 3 + 0.3 < 5);
  // 重定價缺口：GAP = RSA − RSL，利率上升 2 個百分點、負缺口 −500 億時淨利息收入約減少 10 億
  assert.strictEqual((300 - 800) * 0.02, -10);
}
console.log('113 年貨幣銀行學申論題測試通過');

/* ===== 114 年高考三級貨幣銀行學（4 題）與普考貨幣銀行學概要（5 題）===== */
{
  const gq = data.essays.filter(q => q.id.startsWith('114-g3mon-E')), pq = data.essays.filter(q => q.id.startsWith('114-pmon-E'));
  assert.deepStrictEqual(gq.map(q => q.points), [25, 20, 30, 25]);          // 共 100 分
  assert.deepStrictEqual(pq.map(q => q.points), [20, 20, 20, 20, 20]);      // 共 100 分
  assert.ok(gq.every(q => q.exam === '公務人員高等考試三級考試' && q.subject === '貨幣銀行學' && q.year_roc === 114 && q.categories.join() === '金融保險,經建行政'));
  assert.ok(pq.every(q => q.exam === '公務人員普通考試' && q.subject === '貨幣銀行學概要' && q.year_roc === 114 && q.categories.join() === '金融保險,經建行政'));
  const sh = (id) => E[id].parts.map(x => x.points).join(',');
  assert.strictEqual(sh('114-g3mon-E2'), '10,10'); assert.strictEqual(sh('114-pmon-E1'), '10,10'); assert.strictEqual(sh('114-pmon-E2'), '10,10');
  assert.strictEqual(sh('114-pmon-E4'), '5,5,5,5'); assert.strictEqual(sh('114-pmon-E3'), '20');
  const g = (qid, pid, t) => C.gradeEssayPart(part(qid, pid), t), it = (r, id) => r.items.find(i => i.id === id).earned;

  // 數學驗算（參考答案的數字）
  const A = 300, L = 80, DA = 2, DL = 4, di = 0.03;
  const dA = -DA * di * A, dL = -DL * di * L;
  assert.ok(Math.abs(dA + 18) < 1e-9 && Math.abs(dL + 9.6) < 1e-9 && Math.abs((dA - dL) + 8.4) < 1e-9);
  assert.ok(Math.abs(-(DA - (L / A) * DL) * A * di + 8.4) < 1e-9);          // 存續期間缺口寫法與逐項計算相同
  const gap = 30 - 50; assert.strictEqual(gap, -20); assert.ok(Math.abs(gap * -0.05 - 1) < 1e-9);  // 缺口 × Δi ＝ +1
  assert.ok(Math.abs((50 * 0.05) - (30 * 0.05) - 1) < 1e-9);
  assert.strictEqual(3 + 3 + 0.5 * (3 - 2) + 0.5 * 1, 7);                  // 泰勒法則 7%
  const req0 = 1000 * 0.2, tot = req0 + 90, req1 = 1000 * 0.25; assert.deepStrictEqual([req0, tot, req1, tot - req1], [200, 290, 250, 40]);

  // 計算題：正確答案得分、典型錯誤不得滿分
  assert.strictEqual(g('114-g3mon-E2', '1', '存續期間模型：價值變動≈-存續期間×利率變動。資產減少 ΔA=-2×3%×300=-18，ΔL=-4×3%×80=-9.6，淨值變動=-18-(-9.6)=-8.4 億元，淨值減少').earned, 10);
  assert.ok(g('114-g3mon-E2', '1', '資產減少18億元，負債減少9.6億元，淨值減少27.6億元').earned < 8);     // 把負債變動加進去
  assert.ok(g('114-g3mon-E2', '1', '淨值減少8.4億元').earned >= 3);
  assert.strictEqual(g('114-g3mon-E2', '2', '缺口=30-50=-20 億元（負缺口），利潤變動=(-20)×(-5%)=+1 億元，利潤增加').earned, 10);
  assert.ok(g('114-g3mon-E2', '2', '缺口=50-30=20，利潤減少1億元').earned < 6);                         // 方向寫反
  assert.strictEqual(it(g('114-g3mon-E3', '2', '聯邦基金利率=3%+3%+0.5×(3%-2%)+0.5×1%=7%'), 'r3'), 4);
  assert.ok(g('114-g3mon-E3', '2', '3%+0.5×1%+0.5×1%=4%').earned < 8);                                  // 漏加目前通膨率
  assert.strictEqual(g('114-pmon-E3', '1', '法定準備=1000×20%=200，總準備=200+90=290，新法定準備=1000×25%=250，超額準備=290-250=40 億元').earned, 20);
  assert.ok(g('114-pmon-E3', '1', '超額準備=90-50=40億元').earned < 12);
  assert.ok(g('114-pmon-E3', '1', '超額準備變為 190 億元').earned < 10);

  // 概念題：時點寫反、方向寫反、只寫名詞不得滿分
  assert.ok(g('114-pmon-E2', '1', '逆選擇是借貸之後借款人從事高風險活動；道德危險是借貸之前選到壞借款人。').earned < 10);
  assert.ok(it(g('114-pmon-E2', '2', '大到不能倒會加劇逆選擇。'), 'r1') === 0);
  assert.ok(g('114-pmon-E2', '2', '大到不能倒會加劇道德危險。').earned <= 3);
  assert.ok(g('114-pmon-E4', '4', '金本位屬於貨幣目標機制。').earned < 5);
  assert.ok(g('114-g3mon-E1', '1', '決策者低估自然失業率，所以採擴張政策，通膨會上升。').earned < 8);
  assert.ok(g('114-pmon-E1', '1', '政府擔保使公司債價格上升。').earned < 10 * 0.6);   // 沒答公債

  // 繪圖題：沒有說明軸與曲線時，意見與建議要提醒
  const tf = '緊縮政策會讓產出減少、物價下降。';
  const gr = g('114-g3mon-E1', '2', tf), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; });
  const fb = C.feedbackEssayPart(part('114-g3mon-E1', '2'), { text: tf, auto: sc, scores: sc });
  assert.ok(fb.points.some(x => /繪圖/.test(x.text)), '繪圖題答案沒有說明軸與曲線時應提醒');

  // 整題回饋：參考答案總分為滿分
  gq.concat(pq).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr2 = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc2 = {}; gr2.items.forEach(i => { sc2[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc2, scores: sc2 }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
  console.log('114 年高考三級貨幣銀行學與普考貨幣銀行學概要申論題測試通過');
}

/* ===== 115 年經建行政：高考三級貨幣銀行學、普考貨幣銀行學概要（純申論，各 4 題） ===== */
{
  const g3 = data.essays.filter(q => q.id.startsWith('115-g3mbk-')), pt = data.essays.filter(q => q.id.startsWith('115-ptmbk-'));
  assert.strictEqual(g3.length, 4); assert.strictEqual(pt.length, 4);
  g3.forEach(q => { assert.strictEqual(q.exam, '公務人員高等考試三級考試'); assert.strictEqual(q.subject, '貨幣銀行學'); assert.deepStrictEqual(q.categories, ['經建行政']); });
  pt.forEach(q => { assert.strictEqual(q.exam, '公務人員普通考試'); assert.strictEqual(q.subject, '貨幣銀行學概要'); assert.deepStrictEqual(q.categories, ['經建行政']); });
  assert.strictEqual(g3.reduce((a, q) => a + q.points, 0), 100); assert.strictEqual(pt.reduce((a, q) => a + q.points, 0), 100);
  // 小題結構（對照試題 PDF：高考 10+15、5+5+15、10+15、15+10；普考 15+10、10+15、25、25）
  assert.strictEqual(shape('115-g3mbk-E1'), '10,15'); assert.strictEqual(shape('115-g3mbk-E2'), '5,5,15');
  assert.strictEqual(shape('115-g3mbk-E3'), '10,15'); assert.strictEqual(shape('115-g3mbk-E4'), '15,10');
  assert.strictEqual(shape('115-ptmbk-E1'), '15,10'); assert.strictEqual(shape('115-ptmbk-E2'), '10,15');
  assert.strictEqual(shape('115-ptmbk-E3'), '25'); assert.strictEqual(shape('115-ptmbk-E4'), '25');
  E['115-g3mbk-E2'].parts.forEach(p => assert.ok(p.calc, '資本適足率計算題應標記 calc'));

  // 數值驗算：資本適足率
  const rwa = 4000 * 1 + 1500 * 0.5 + 1250 * 0.2, car = 550 / rwa;
  assert.strictEqual(rwa, 5000); assert.ok(Math.abs(car - 0.11) < 1e-12);
  const rwa2 = rwa - 500 * (1 - 0.2), car2 = 550 / rwa2;
  assert.strictEqual(rwa2, 4600); assert.ok(Math.abs(car2 * 100 - 11.9565) < 1e-3); assert.ok(Math.abs((car2 - car) * 100 - 0.9565) < 1e-3);
  const rwa3 = rwa - 100, car3 = (550 - 100) / rwa3;
  assert.strictEqual(rwa3, 4900); assert.ok(Math.abs(car3 * 100 - 9.1837) < 1e-3);
  assert.ok(car3 < 0.105 && car3 > 0.08, '事件後低於 10.5% 但仍高於 8%');
  // IS-LM：Y = α(A − br)，M/P = kY − hr；公開市場賣出使 M 下降，b 愈大所得降幅愈大、利率升幅愈小
  const eff = (b, dM) => { const al = 2.5, k = 0.5, h = 40, A = 1000, M = 300;
    const Y = M_ => (M_ + h * A / b) / (k + h / (al * b)), r = M_ => (A - Y(M_) / al) / b;
    return { dY: Y(M + dM) - Y(M), dr: r(M + dM) - r(M), formula: al * b / (k * al * b + h) * dM }; };
  const lo = eff(10, -20), hi = eff(40, -20);
  assert.ok(Math.abs(lo.dY - lo.formula) < 1e-9 && Math.abs(hi.dY - hi.formula) < 1e-9);
  assert.ok(hi.dY < lo.dY && hi.dr < lo.dr, '彈性大：所得降幅較大（dY 更負）、利率升幅較小（dr 較小）');
  assert.ok(lo.dr > 0 && hi.dr > 0 && lo.dY < 0 && hi.dY < 0);
  // 參考答案與評分
  const a = id => C.stripHtml(E[id].parts[E[id].parts.length - 1].model_answer);
  ['9.18', '4,900', '450'].forEach(x => assert.ok(a('115-g3mbk-E2').includes(x), '(三)參考答案應含 ' + x));
  const pp = (id, pid, txt) => C.gradeEssayPart(part(id, pid), txt);
  // 學生式作答：部分得分
  assert.strictEqual(pp('115-g3mbk-E2', '1', 'RWA=4000+750+250=5000億，CAR=550/5000=11%，高於8%及10.5%，符合規定。').earned, 5);
  assert.ok(pp('115-g3mbk-E2', '1', 'CAR=550/6750=8.15%，符合8%。').earned <= 1, '用總資產當分母不應拿高分');
  assert.strictEqual(pp('115-g3mbk-E2', '2', 'RWA減少500*0.8=400，變成4600，CAR=550/4600=11.96%，提高0.96個百分點。').earned, 5);
  assert.strictEqual(pp('115-g3mbk-E2', '2', '提高 5 個百分點').earned, 0);
  { const g = pp('115-g3mbk-E2', '3', '金管會會要求銀行增資，不能發股利。'); assert.ok(g.earned > 0 && g.earned < 8, '口語寫法應得部分分數，實得 ' + g.earned); }
  assert.strictEqual(pp('115-g3mbk-E1', '1', '駝峰型代表中期利率最高，央行升息使短中期利率上升，但市場預期未來降息、景氣轉弱所以長期利率較低。這通常表示景氣在擴張末期的高峰，即將進入衰退。').earned, 10);
  assert.strictEqual(pp('115-g3mbk-E1', '1', '這代表景氣即將復甦，進入擴張階段。').earned, 0);
  assert.ok(pp('115-g3mbk-E3', '1', '公開市場操作透過買賣債券影響準備貨幣；重貼現率改變銀行向央行借款成本，影響準備貨幣；法定準備率影響貨幣乘數。').earned >= 9);
  assert.ok(pp('115-g3mbk-E4', '2', '新興古典學派認為價格與工資完全彈性且有理性預期，廠商只會因為無法分辨一般物價與相對價格而產生錯誤認知，預料到的貨幣政策會被預期完全吸收，因此無效。').earned >= 9);
  assert.strictEqual(pp('115-ptmbk-E3', '1', '預期通膨上升會使債券價格上漲，殖利率下降。').earned, 0, '方向錯誤不應得分');
  assert.ok(pp('115-ptmbk-E3', '1', '依費雪效果，預期通膨上升使名目利率上升，債券價格下跌。長天期債券存續期間較長，價格跌幅大於短天期。殖利率曲線整體上移，長端上升較多而變陡。').earned >= 20);
  assert.ok(pp('115-ptmbk-E4', '1', '賣出公債會使貨幣供給增加，所得上升。').earned <= 2);
  assert.ok(pp('115-ptmbk-E4', '1', '賣債使貨幣供給減少，LM左移，利率上升所得下降。投資利率彈性大時IS平坦，利率上升較小，所得減少較大，貨幣政策效果較強；彈性小時IS陡峭，利率上升較大，所得減少較小，效果較弱。').earned >= 15);
  // 整題回饋：只評一小題時，總評要提醒尚未評分的小題；全部滿分時沒有警告
  const st = {}; E['115-g3mbk-E1'].parts.forEach(p => { const g = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}, au = {}; g.items.forEach(i => { sc[i.id] = i.earned; au[i.id] = i.earned; }); st[p.id] = { text: C.stripHtml(p.model_answer), auto: au, scores: sc }; });
  const full = C.feedbackEssay(E['115-g3mbk-E1'], st); assert.strictEqual(full.earned, full.possible);
  const half = C.feedbackEssay(E['115-g3mbk-E1'], { 1: st['1'] }); assert.ok(half.points.some(x => /尚未評分/.test(x.text)));
  console.log('115 年貨幣銀行學申論題測試通過');
}
