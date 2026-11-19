/* 依作答給意見與建議：單題、一輪、累計、申論題。執行：node tests/test_feedback.js */
const path = require('path');
const assert = require('assert');
const C = require(path.join(__dirname, '..', 'core.js'));
const bank = require(path.join(__dirname, '..', 'data', 'bank.json'));
const essays = require(path.join(__dirname, '..', 'data', 'essays.json'));
const byId = {}; bank.questions.forEach(q => { byId[q.id] = q; });
const has = (lines, kind, re) => (lines.points || lines).some(l => (!kind || l.kind === kind) && re.test(l.text));

const q = bank.questions.find(x => x.subject === '經濟學概要' && x.tags && x.tags.length);
const wrongL = q.answer === 'A' ? 'B' : 'A';
const tag = q.tags[0];

// ---- 單題 ----
let r = { chosen: q.answer, status: 'ok', sec: 8 };
assert.ok(has(C.feedbackQuestion(q, r, {}), 'good', /很熟/));
r = { chosen: q.answer, status: 'ok', sec: 100 };
assert.ok(has(C.feedbackQuestion(q, r, {}), 'warn', /72 秒/));
r = { chosen: q.answer, status: 'ok', sec: 30 };
assert.ok(has(C.feedbackQuestion(q, r, { prev: { bad: 2, last: 'bad' } }), 'good', /答錯過 2 次/));

r = { chosen: wrongL, status: 'bad', sec: 5 };
let f = C.feedbackQuestion(q, r, { prev: { bad: 1, last: 'bad' }, tagBefore: { [tag]: { ok: 1, n: 5 } } });
assert.ok(has(f, 'warn', new RegExp('你選 ' + wrongL)));
assert.ok(has(f, 'tip', /5 秒/));                 // 看太快
assert.ok(has(f, 'warn', /第 2 次答錯/));          // 反覆錯
assert.ok(has(f, 'tip', new RegExp('考點「' + tag + '」累計答對率 20%'))); // 弱項考點
r = { chosen: wrongL, status: 'bad', sec: 150 };
assert.ok(has(C.feedbackQuestion(q, r, {}), 'tip', /觀念本身還不穩/));

const negQ = Object.assign({}, q, { question: '下列敘述何者錯誤？' });
assert.ok(has(C.feedbackQuestion(negQ, { chosen: wrongL, status: 'bad', sec: 40 }, {}), 'tip', /「錯誤」/));
assert.ok(!has(C.feedbackQuestion(Object.assign({}, q, { question: '下列敘述何者正確？' }), { chosen: wrongL, status: 'bad', sec: 40 }, {}), 'tip', /否定字眼/));

assert.ok(has(C.feedbackQuestion(q, { chosen: null, status: 'skip', timeout: true }, {}), 'warn', /時間到/));
assert.ok(has(C.feedbackQuestion(q, { chosen: null, status: 'skip' }, {}), 'warn', /不倒扣/));
assert.ok(has(C.feedbackQuestion(q, { chosen: wrongL, status: 'ok', gift: true }, {}), 'tip', /一律給分/));
// 沒有任何脈絡也不會丟錯，且一定有內容
['ok', 'bad', 'skip'].forEach(s => assert.ok(C.feedbackQuestion(q, { chosen: wrongL, status: s }, undefined).length > 0));

// ---- 一輪 ----
const pool = bank.questions.filter(x => x.subject === '經濟學概要').slice(0, 20);
const queue = pool.map(x => x.id), results = {};
pool.forEach((x, i) => {
  if (i < 6) results[x.id] = { chosen: x.answer, status: 'ok', pts: x.points, sec: 20 };
  else if (i < 14) results[x.id] = { chosen: 'C', status: 'bad', pts: 0, sec: 8 };
  else results[x.id] = { chosen: null, status: 'skip', pts: 0, sec: 0, timeout: true };
});
const sm = C.summarize(byId, queue, results);
const ses = C.feedbackSession({ byId, queue, results, summary: sm, prior: [], wrongMap: { [queue[7]]: { bad: 3, last: 'bad' } }, subject: '經濟學概要' });
assert.strictEqual(ses.level, 'weak');
assert.ok(has(ses, 'warn', /答錯的題目中有 \d+ 題是在 15 秒內/));
assert.ok(has(ses, 'warn', /6 題（30%）沒作答，其中 6 題是時間到/));
assert.ok(has(ses, 'warn', /累計答錯 2 次以上/));
assert.ok(ses.actions.some(a => a.type === 'wrong'));
assert.strictEqual(C.feedbackSession({ byId, queue: [], results: {}, summary: C.summarize(byId, [], {}), prior: [], wrongMap: {}, subject: 'x' }), null);
// 全對：優秀、有稱讚、不會叫人補強
const okRes = {}; queue.forEach(id => okRes[id] = { chosen: byId[id].answer, status: 'ok', pts: byId[id].points, sec: 30 });
const best = C.feedbackSession({ byId, queue, results: okRes, summary: C.summarize(byId, queue, okRes), prior: [], wrongMap: {}, subject: '經濟學概要' });
assert.strictEqual(best.level, 'excellent'); assert.ok(!has(best, 'warn', /.*/));
// 進步：過去 10 題全錯、這輪全對
const priorBad = Array.from({ length: 10 }, (_, i) => ({ id: queue[i], status: 'bad' }));
assert.ok(has(C.feedbackSession({ byId, queue, results: okRes, summary: C.summarize(byId, queue, okRes), prior: priorBad, wrongMap: {}, subject: '經濟學概要' }), 'good', /進步了 100 個百分點/));

// ---- 累計 ----
assert.strictEqual(C.feedbackOverall([], byId, {}, '經濟學概要').enough, false);
const recs = []; pool.forEach((x, i) => { for (let k = 0; k < 3; k++) recs.push({ id: x.id, status: i < 5 ? 'ok' : 'bad', ts: recs.length }); });
const ov = C.feedbackOverall(recs, byId, { [queue[10]]: { bad: 3, last: 'bad' } }, '經濟學概要');
assert.ok(ov.enough && ov.n === 60);
assert.ok(has(ov, 'warn', /最需要加強的考點/));
assert.ok(has(ov, 'tip', /只練過 20 題/));       // 涵蓋率
assert.ok(has(ov, 'tip', /錯題本還有 1 題/));
assert.ok(ov.actions.some(a => a.type === 'tag'));
// 只統計該科
assert.strictEqual(C.feedbackOverall(recs, byId, {}, '行政法概要').enough, false);

// ---- 申論題 ----
const E = essays.essays.find(x => x.id === '114-g3fin-E1'), p1 = E.parts[0];
const full = {}, none = {}; p1.rubric.forEach(r => { full[r.id] = r.points; none[r.id] = 0; });
const model = C.stripHtml(p1.model_answer);
let ef = C.feedbackEssayPart(p1, { text: model, auto: full, scores: full });
assert.ok(ef.ratio === 1 && has(ef, 'good', /結構完整/));
ef = C.feedbackEssayPart(p1, { text: '不知道', auto: none, scores: none });
assert.ok(has(ef, 'warn', /答題方向偏了/) && has(ef, 'tip', /偏少/));
// 部分得分 + 自行調高但系統沒偵測 → 提醒
const mid = Object.assign({}, none); mid[p1.rubric[0].id] = p1.rubric[0].points; mid[p1.rubric[1].id] = 0.5;
ef = C.feedbackEssayPart(p1, { text: model.slice(0, 200), auto: none, scores: mid });
assert.ok(has(ef, 'tip', /系統沒偵測到對應寫法/));
assert.ok(has(ef, 'warn', /完全沒得分的得分點/));
// 整題總評
const tot = C.feedbackEssay(E, { [p1.id]: { text: '不知道', auto: none, scores: none } });
assert.ok(has(tot, 'warn', /失分最多/) && has(tot, 'tip', /尚未評分/));
assert.strictEqual(C.feedbackEssay(E, {}), null);
// 所有題目的參考答案自評滿分時，各小題都應被評為「結構完整」
essays.essays.forEach(e => e.parts.forEach(p => {
  const s = {}; p.rubric.forEach(r => s[r.id] = r.points);
  assert.ok(has(C.feedbackEssayPart(p, { text: C.stripHtml(p.model_answer), auto: s, scores: s }), 'good', /結構完整/));
}));


// 計算題（calc）：沒得分的細目會多一則數值與列式的提醒；非計算題不會
{
  const calcPart = essays.essays.find(e => e.id === '114-g3eng-E2').parts[0];
  const none2 = {}; calcPart.rubric.forEach(r => none2[r.id] = 0);
  assert.ok(has(C.feedbackEssayPart(calcPart, { text: '不知道怎麼算', auto: none2, scores: none2 }), 'tip', /這是計算題.*四捨五入/));
  const full2 = {}; calcPart.rubric.forEach(r => full2[r.id] = r.points);
  assert.ok(!has(C.feedbackEssayPart(calcPart, { text: C.stripHtml(calcPart.model_answer), auto: full2, scores: full2 }), 'tip', /這是計算題/));
  assert.ok(!has(C.feedbackEssayPart(p1, { text: '不知道', auto: none, scores: none }), 'tip', /這是計算題/));
}

// ---- 114 年申論題：繪圖題與計算題的個人化意見 ----
{
  const E114 = {}; essays.essays.filter(x => x.year_roc === 114).forEach(x => { E114[x.id] = x; });
  const stateOf = (p, text) => { const g = C.gradeEssayPart(p, text), st = { text, auto: {}, scores: {} }; g.items.forEach(i => { st.auto[i.id] = i.earned; st.scores[i.id] = i.earned; }); return st; };
  // 繪圖題：只寫結論、沒說明軸與曲線 → 提醒要說明圖形
  const pf = E114['114-g3fin-E1'].parts[0];
  assert.strictEqual(pf.figure, true);
  let fb = C.feedbackEssayPart(pf, stateOf(pf, '停滯性通膨是物價上升而且失業增加，產出下降。'));
  assert.ok(has(fb, 'tip', /要求繪圖.*橫軸/));
  // 有講到橫軸縱軸與曲線移動 → 不再提醒圖形
  fb = C.feedbackEssayPart(pf, stateOf(pf, '橫軸是產出，縱軸是物價，供給曲線向左移，物價上升、產出下降，失業增加。'));
  assert.ok(!has(fb, 'tip', /要求繪圖/));
  // 計算題：沒有數字 → 提醒寫算式；有數字但錯 → 提醒逐步對照
  const pc = E114['114-g3econ-E1'].parts[0];
  assert.strictEqual(pc.numeric, true);
  fb = C.feedbackEssayPart(pc, stateOf(pc, '兩家廠商成本不同，所以利潤也不同，消費者剩餘就是需求線以下的面積。'));
  assert.ok(has(fb, 'tip', /幾乎沒有數字/));
  fb = C.feedbackEssayPart(pc, stateOf(pc, '反應函數 q1=(110-q2)/2，q2=(100-q1)/2，解得 q1=35、q2=35，P=50，利潤 1400 與 1050，CS=2000'));
  assert.ok(has(fb, 'tip', /有寫出數字，但有些得分點的結果沒對上/));
  assert.ok(!has(fb, 'tip', /幾乎沒有數字/));
  // 全對：不出現這兩種提醒
  fb = C.feedbackEssayPart(pc, stateOf(pc, 'q1=(110-q2)/2，q2=(100-q1)/2，q1=40，q2=30，P=50；π1=1600，π2=900；CS=1/2×70×70=2450'));
  assert.ok(has(fb, 'good', /幾乎都有寫到/)); assert.ok(!has(fb, 'tip', /要求繪圖|幾乎沒有數字|結果沒對上/));
  // 整題總評：失分最多的得分點
  const e = E114['114-g3econ-E1'];
  const states = { 1: stateOf(e.parts[0], 'q1=40，q2=30，P=50'), 2: stateOf(e.parts[1], '只寫了幾個字不知道怎麼算') };
  const ef = C.feedbackEssay(e, states);
  assert.ok(ef && has(ef, 'warn', /失分最多的得分點/) && has(ef, 'tip', /還有 1 個小題尚未評分/));
}

console.log('feedback tests passed');

// 113 年高考三級（農業經濟學、工程經濟學）：依學生作答的回饋
{
  const get = (id, pid) => essays.essays.find(e => e.id === id).parts.find(p => p.id === pid);
  const zero = (p) => { const s = {}; p.rubric.forEach(r => s[r.id] = 0); return s; };
  // 工程經濟學計算題：忽略利息的錯誤答案 → 數值與列式提醒、常見錯誤提醒（含「忽略利息」）
  const eng1 = get('113-g3eng-E1', '1'), z1 = zero(eng1);
  const fb1 = C.feedbackEssayPart(eng1, { text: '450000/5=90000，每年成本約 262000', auto: z1, scores: z1 });
  assert.ok(has(fb1, 'tip', /這是計算題/) && has(fb1, 'tip', /忽略利息/) && has(fb1, 'warn', /答題方向偏了/));
  // 農業經濟學第 2 題（一）要求繪圖：沒說明橫縱軸與曲線 → 繪圖提醒；有說明 → 不再提醒
  const agr2 = get('113-g3agr-E2', '1'), z2 = zero(agr2);
  assert.ok(has(C.feedbackEssayPart(agr2, { text: '最低工資可以保障勞工，工資變高。', auto: z2, scores: z2 }), 'tip', /要求繪圖/));
  assert.ok(!has(C.feedbackEssayPart(agr2, { text: '橫軸為僱用量，縱軸為工資，勞動供給與需求曲線交於均衡點。', auto: z2, scores: z2 }), 'tip', /要求繪圖/));
  // 整題總評：農業經濟學第 4 題只評（一）時，提醒（二）尚未評分
  const e4 = essays.essays.find(e => e.id === '113-g3agr-E4'), p41 = e4.parts[0], z41 = zero(p41);
  const tot4 = C.feedbackEssay(e4, { [p41.id]: { text: '不知道', auto: z41, scores: z41 } });
  assert.ok(has(tot4, 'tip', /尚未評分/) && has(tot4, 'warn', /失分最多/));
  // 全對時：農業經濟學、工程經濟學 8 題都是「結構完整」（上方迴圈已涵蓋全部題目；此處再確認 113 年有被涵蓋）
  assert.strictEqual(essays.essays.filter(e => e.year_roc === 113 && e.exam === '公務人員高等考試三級考試').length, 24);
}
console.log('113 年申論題回饋測試通過');
