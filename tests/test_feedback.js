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
const E = essays.essays[0], p1 = E.parts[0];
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

console.log('feedback tests passed');
