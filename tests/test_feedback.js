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
  assert.strictEqual(essays.essays.filter(e => e.year_roc === 113 && e.exam === '公務人員高等考試三級考試' && e.subject !== '交通政策與行政').length, 73);  // 含 113 年觀光行政三科 11 題（觀光英語 4、觀光學 4、觀光日語 3）與觀光資源規劃 4 題；113 年高考三級原 7 科 24 題＋財政學 4 題；另含民法 14 題（戶政 3、司法行政 2、法制／智財 2、財稅行政／財稅法務 2、公平交易管理 2、地政 3）；交通政策與行政 4 題另計
}
console.log('113 年申論題回饋測試通過');

/* ===== 115 年高考三級觀光行政（觀光學、觀光英語、觀光日語）：評分、字數上限、語言檢查與回饋 ===== */
{
  const tour = essays.essays.filter(e => /^115-g3t(our|en|ja)-/.test(e.id));
  assert.strictEqual(tour.length, 11);  // 觀光學 4 題、觀光英語 4 題、觀光日語 3 題
  assert.strictEqual(tour.filter(e => e.subject === '觀光學').length, 4);
  assert.strictEqual(tour.filter(e => e.subject === '觀光英語').length, 4);
  assert.strictEqual(tour.filter(e => e.subject === '觀光日語').length, 3);
  // 觀光學兩個類科都要看得到；觀光英語、觀光日語各自只屬於選試語言的類科
  tour.filter(e => e.subject === '觀光學').forEach(e => assert.deepStrictEqual(e.categories, ['觀光行政（選試觀光英語）', '觀光行政（選試觀光日語）']));
  tour.filter(e => e.subject === '觀光英語').forEach(e => assert.deepStrictEqual(e.categories, ['觀光行政（選試觀光英語）']));
  tour.filter(e => e.subject === '觀光日語').forEach(e => assert.deepStrictEqual(e.categories, ['觀光行政（選試觀光日語）']));
  // 原卷配分：觀光學 4×25；觀光英語 20、20、20、40；觀光日語 40、30、30
  assert.deepStrictEqual(tour.filter(e => e.subject === '觀光學').map(e => e.points), [25, 25, 25, 25]);
  assert.deepStrictEqual(tour.filter(e => e.subject === '觀光英語').map(e => e.points), [20, 20, 20, 40]);
  assert.deepStrictEqual(tour.filter(e => e.subject === '觀光日語').map(e => e.points), [40, 30, 30]);

  // 字數與語言工具
  assert.deepStrictEqual(C.countUnits("It's a well-known fact, isn't it?", 'word'), { n: 6, unit: 'word' });
  assert.strictEqual(C.countUnits('国内旅行を 活性化\nする', 'char').n, 10);
  assert.strictEqual(C.countUnits('Tourism is growing fast.').unit, 'word');
  assert.strictEqual(C.countUnits('国内旅行を活性化する方法').unit, 'char');
  assert.ok(C.langWarning('en', '這是一段完全用中文寫成的答案，但是題目要求用英文作答，請注意。'));
  assert.strictEqual(C.langWarning('en', 'This is a complete answer written in English as the question requires.'), null);
  assert.ok(C.langWarning('ja', '這是一段完全用中文寫成的答案但是題目要求用日文作答所以應該被提醒到才對。'));
  assert.strictEqual(C.langWarning('ja', '国内旅行を活性化するには、交通と宿泊の利便性を高めることが大切だと考える。'), null);
  assert.ok(C.langWarning('zh', 'Tourism is growing fast and the government should promote it carefully every year.'));
  assert.strictEqual(C.langWarning('zh', '觀光客應尊重在地文化與居民，並遵守當地法規。'), null);
  assert.strictEqual(C.langWarning('en', 'Hello'), null);  // 太短不判斷

  const grade = (p, text) => { const g = C.gradeEssayPart(p, text), a = {}; g.items.forEach(i => { a[i.id] = i.earned; }); return { text, auto: a, scores: a }; };
  const full = p => grade(p, C.stripHtml(p.model_answer));

  // 參考答案：結構完整、沒有警告
  tour.forEach(e => e.parts.forEach(p => {
    const f = C.feedbackEssayPart(p, full(p));
    assert.strictEqual(f.earned, p.points, e.id + '/' + p.id);
    assert.ok(has(f, 'good', /結構完整/), e.id + '/' + p.id + ' 參考答案應為結構完整');
    assert.ok(!has(f, 'warn', /超過上限|要用(英文|日文|中文)/), e.id + '/' + p.id + ' 參考答案不應有字數或語言警告');
  }));

  // 英文作文：250～300 字的範圍判斷
  const en4 = essays.essays.find(e => e.id === '115-g3ten-E4').parts[0];
  assert.deepStrictEqual(en4.limit, { unit: 'word', min: 250, max: 300 });
  assert.ok(has(C.feedbackEssayPart(en4, full(en4)), 'good', /字數 \d+ 個單字，在要求範圍內/));
  const short = 'Wars hurt tourism because travelers feel unsafe and airlines cancel flights. The 2026 conflict closed airspace in the Middle East and raised fuel prices. The industry should diversify markets and offer flexible booking.';
  assert.ok(has(C.feedbackEssayPart(en4, grade(en4, short)), 'warn', /低於建議的 250 個單字/));
  // 字數不到下限一半：初判分數按字數比例調降（約 34 個單字／125 = 0.27）
  const sg = C.gradeEssayPart(en4, short);
  assert.ok(sg.scale < 0.3 && sg.earned <= 40 * 0.3, '過短的英文作文初判分數應被調降，實得 ' + sg.earned);
  assert.strictEqual(C.gradeEssayPart(en4, full(en4).text).scale, 1);
  const longTxt = full(en4).text + ' ' + full(en4).text;
  assert.ok(has(C.feedbackEssayPart(en4, grade(en4, longTxt)), 'warn', /超過上限 300 個單字/));
  // 用中文回答英文題 → 語言警告
  const zhOnEn = '戰爭會讓旅客覺得不安全，航空公司取消航班並關閉空域，二〇二六年的衝突使中東空域關閉、航油價格上漲，業界應分散市場並提供彈性訂位與退費政策，加強危機溝通。';
  assert.ok(has(C.feedbackEssayPart(en4, grade(en4, zhOnEn)), 'warn', /要用英文作答/));

  // 日文作文：400 字上限（不含空白與換行）
  const ja3 = essays.essays.find(e => e.id === '115-g3tja-E3').parts[0];
  assert.deepStrictEqual(ja3.limit, { unit: 'char', min: 300, max: 400 });
  assert.ok(has(C.feedbackEssayPart(ja3, full(ja3)), 'good', /字數 \d+ 字，在要求範圍內/));
  const over = full(ja3).text + '地方の魅力を発信することも大切である。'.repeat(6);
  assert.ok(has(C.feedbackEssayPart(ja3, grade(ja3, over)), 'warn', /超過上限 400 字/));
  const zhOnJa = '要讓國內旅遊更熱絡，政府可以提供交通優惠與住宿折扣，並且推廣在地特色與使用社群媒體宣傳，這樣就能吸引更多旅客，帶動地方經濟的成長與發展。';
  assert.ok(has(C.feedbackEssayPart(ja3, grade(ja3, zhOnJa)), 'warn', /要用日文作答/));

  // 部分答對：日譯中第（一）小題只翻前半，後半得分點要被指出
  const j1 = essays.essays.find(e => e.id === '115-g3tja-E1').parts[0];
  const half = '結合休閒與醫療，成為旅行的新趨勢。臺灣擁有豐富的自然與文化，醫療界也累積了豐富的醫療經驗。臺灣的醫療機構具備先進的醫療技術與醫療設備，擁有世界頂尖水準的肝臟移植與生殖醫療等技術。';
  const hg = C.gradeEssayPart(j1, half);
  assert.ok(hg.earned > 0 && hg.earned < j1.points * 0.7, '只翻前半應只得部分分數，實得 ' + hg.earned);
  const hf = C.feedbackEssayPart(j1, { text: half, auto: grade(j1, half).auto, scores: grade(j1, half).scores });
  assert.ok(has(hf, 'warn', /完全沒得分的得分點/) || has(hf, 'tip', /只拿到部分分數/));
  assert.ok(has(hf, 'tip', /常見錯誤提醒/));

  // 英譯中：漏掉「僅適用泰國公民、與現行觀光稅分開」會被點名
  const t2 = essays.essays.find(e => e.id === '115-g3ten-E2').parts[0];
  const t2txt = '根據《亞洲旅遊週刊》2026 年報導，泰國旅行社強烈反對政府向泰國旅客徵收約 30 美元出境稅。政府估計稅收可觀，可支持國內旅遊計畫。業界認為這會增加旅遊成本，加重觀光業壓力，在經濟不確定與中東衝突之際尤其如此。泰國旅行社協會也質疑收入如何管理與分配。';
  const t2f = C.feedbackEssayPart(t2, grade(t2, t2txt));
  assert.ok(t2f.earned >= 14 && t2f.earned < 20, '英譯中漏譯最後一句，應扣掉該得分點，實得 ' + t2f.earned);
  assert.ok(has(t2f, 'warn', /僅適用泰國公民/));
  // 英文定義題：只寫「a tour for a group」只得部分分數
  const d1 = essays.essays.find(e => e.id === '115-g3ten-E1').parts[0];
  const d1f = C.gradeEssayPart(d1, 'A Group Inclusive Tour is a tour for a group of people.');
  assert.ok(d1f.earned > 0 && d1f.earned <= 5, 'GIT 定義過於簡略，實得 ' + d1f.earned);

  // 觀光學：離島題要點名離島；只寫「離島」泛稱，該細目不得分
  const i2 = essays.essays.find(e => e.id === '115-g3tour-E3').parts[1];
  const gen = '離島觀光發展會造成環境負荷與垃圾問題，旺季人潮超過承載量，物價與房價上漲，利益外流，居民生活受到干擾。';
  const ig = C.gradeEssayPart(i2, gen);
  assert.strictEqual(ig.items.find(i => i.id === 'r3').earned, 0);
  assert.ok(has(C.feedbackEssayPart(i2, grade(i2, gen)), 'warn', /以具體離島為例/) || has(C.feedbackEssayPart(i2, grade(i2, gen)), 'tip', /點名離島/));
  assert.ok(C.gradeEssayPart(i2, gen + '以澎湖為例。').items.find(i => i.id === 'r3').earned === 2);
}
console.log('115 年觀光行政（觀光學、觀光英語、觀光日語）回饋測試通過');

/* ===== 113 年觀光行政（觀光英語、觀光學、觀光日語）回饋 ===== */
{
  const grade = (p, text) => { const g = C.gradeEssayPart(p, text), a = {}; g.items.forEach(i => { a[i.id] = i.earned; }); return { text, auto: a, scores: a }; };
  const part = (id, pid) => essays.essays.find(e => e.id === id).parts.find(p => p.id === pid);
  // 英文作文：太短會提醒字數；用中文作答會被提醒語言
  const es = part('113-g3ten-E4', '1');
  const shortEn = 'Taiwan tourism has similar attractions. I suggest we promote local culture and use social media.';
  const f1 = C.feedbackEssayPart(es, grade(es, shortEn));
  assert.ok(has(f1, null, /字數 \d+ 個單字，低於建議的 250/), '英文作文字數太少應提醒');
  const zhEn = '臺灣的觀光資源同質性很高，我建議各地發展自己的文化特色，並結合數位科技與行銷來吸引國際旅客，讓每個地方都有獨特的故事與體驗。';
  assert.ok(has(C.feedbackEssayPart(es, grade(es, zhEn)), 'warn', /要用英文作答/), '用中文寫英文作文應提醒語言');
  // 英文作文：參考答案落在字數範圍內，回饋會稱讚字數
  const full = C.stripHtml(es.model_answer.replace(/<br>/g, ' '));
  const ff = C.feedbackEssayPart(es, grade(es, full));
  assert.ok(has(ff, 'good', /在要求範圍內/) && ff.earned === 40);
  // 日文作文：超過 400 字會警告
  const ja = part('113-g3tja-E3', '1');
  const longJa = C.stripHtml(ja.model_answer) + C.stripHtml(ja.model_answer).slice(0, 80);
  assert.ok(has(C.feedbackEssayPart(ja, grade(ja, longJa)), 'warn', /超過上限 400/), '日文作文超過 400 字應警告');
  // 日文題用中文作答：提醒語言；日翻中用日文作答：提醒語言
  const jt = part('113-g3tja-E1', '1');
  assert.ok(has(C.feedbackEssayPart(jt, grade(jt, '福隆國際沙雕藝術季昨天開幕，日本沙雕師保坂俊彥與林真理感謝臺灣在311大地震時伸出援手，今年也聯手創作臺灣加油作品。')), 'warn', /要用日文作答/));
  const zt = part('113-g3tja-E2', '3');
  assert.ok(has(C.feedbackEssayPart(zt, grade(zt, '東京都知事選は六月二十日告示、七月七日投開票され、蓮舫参院議員が出馬を表明した。小池百合子都知事も出馬の方針を固めている。')), 'warn', /要用中文（本國文字）作答/));
  // 觀光學：只寫紅海藍海的口號，案例分析小題抓不到案例與結果
  const bo = part('113-g3tour-E3', '2');
  const bf = C.feedbackEssayPart(bo, grade(bo, '藍海策略比較好，紅海策略很競爭。'));
  assert.ok(bf.earned <= 3 && has(bf, 'warn', /沒得分/));
  assert.ok(has(bf, 'tip', /常見錯誤提醒/));
  // 觀光學：名詞解釋寫得完整時幾乎滿分
  const gds = part('113-g3tour-E1', '2');
  const gf = C.feedbackEssayPart(gds, grade(gds, '全球分銷系統GDS是整合航空、旅館、租車等供應商資訊的電腦訂位系統，旅行社與OTA可即時查詢比價並預訂，代表系統有Amadeus、Sabre與Travelport，能降低成本、提升效率，是旅遊配銷通路的核心。'));
  assert.ok(gf.earned >= 6, 'GDS 完整答案應得 6 分以上，實得 ' + gf.earned);
  // 整題總評：只評一個小題時提醒其餘小題未評
  const eo = essays.essays.find(e => e.id === '113-g3tour-E2');
  const fe = C.feedbackEssay(eo, { 1: grade(eo.parts[0], '銀髮族、青年學生、女性、身心障礙者與同志是五大特殊市場，銀髮族規模因高齡化而成長。') });
  assert.ok(fe && has(fe, 'tip', /還有 2 個小題尚未評分/));
}
console.log('113 年觀光行政（觀光英語、觀光學、觀光日語）回饋測試通過');

/* ===== 113 年貨幣銀行學（高考三級）與貨幣銀行學概要（普考）：依作答的意見與建議 ===== */
{
  const qs = essays.essays.filter(e => /^113-(g3mbk|pmbk)-/.test(e.id));
  assert.strictEqual(qs.length, 8);
  const zero = (p) => { const s = {}; p.rubric.forEach(r => s[r.id] = 0); return s; };
  // 方向寫反的答案：沒有得分的細目與「常見錯誤」都會列出
  const e4 = qs.find(e => e.id === '113-pmbk-E4'), p42 = e4.parts[1], z42 = zero(p42);
  const fb = C.feedbackEssayPart(p42, { text: '地下經濟會讓貨幣供給增加。', auto: z42, scores: z42 });
  assert.ok(has(fb, null, /常見錯誤/) && has(fb, null, /沒有得分|都沒有得分|完全沒得分|部分/), '應列出失分細目與常見錯誤');
  // 整題總評：只評第（一）小題時，提醒其餘小題尚未評分
  const p41 = e4.parts[0], z41 = zero(p41);
  const tot = C.feedbackEssay(e4, { [p41.id]: { text: '不知道', auto: z41, scores: z41 } });
  assert.ok(has(tot, 'tip', /尚未評分/) && has(tot, 'warn', /失分最多/));
  // 參考答案作答、自評滿分時，整題為滿分（8 題皆然）
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
}
console.log('113 年貨幣銀行學申論題回饋測試通過');

/* ===== 114、115 年高考三級財務管理與投資學：依作答的意見與建議 ===== */
{
  const qs = essays.essays.filter(e => /^11[45]-g3fmi-/.test(e.id));
  assert.strictEqual(qs.length, 8);
  const zero = (p) => { const s = {}; p.rubric.forEach(r => s[r.id] = 0); return s; };
  const E = (id) => qs.find(e => e.id === id);
  // 計算題寫錯：列出沒得分的細目、常見錯誤，並提醒要寫出數字與算式
  const p5 = E('114-g3fmi-E1').parts[4], z5 = zero(p5);
  const fb = C.feedbackEssayPart(p5, { text: 'FCF 是營運產生的自由現金，越多越好。', auto: z5, scores: z5 });
  assert.ok(has(fb, null, /常見錯誤/) && has(fb, null, /計算題|數字/), '應提醒常見錯誤與計算題要寫數字');
  // 只寫一半（算了 NOPAT 卻沒算 OCF 與 FCF）：整題總評提醒其餘小題尚未評分
  const p1 = E('114-g3fmi-E1').parts[0], z1 = zero(p1);
  const tot = C.feedbackEssay(E('114-g3fmi-E1'), { [p1.id]: { text: 'NOPAT = 50,000×(1-20%) = 40,000', auto: z1, scores: z1 } });
  assert.ok(has(tot, 'tip', /尚未評分/) && has(tot, 'warn', /失分最多/));
  // 論述題（行為財務學）：缺漏的得分點會被列出
  const p3 = E('115-g3fmi-E3').parts[2], z3 = zero(p3);
  const fb3 = C.feedbackEssayPart(p3, { text: '我覺得第一種比較公平。', auto: z3, scores: z3 });
  assert.ok(has(fb3, null, /沒有得分|都沒有得分|完全沒得分|部分/), '論述題應列出失分細目');
  // 參考答案作答、自評滿分時，整題為滿分（8 題皆然）
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const gr = C.gradeEssayPart(p, C.stripHtml(p.model_answer)), sc = {}; gr.items.forEach(i => { sc[i.id] = i.earned; }); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: sc, scores: sc }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
}
console.log('114、115 年財務管理與投資學申論題回饋測試通過');

/* ===== 113 年財務管理與投資學（高考三級金融保險）：依作答的意見與建議 ===== */
{
  const qs = essays.essays.filter(e => /^113-g3fmi-/.test(e.id));
  assert.strictEqual(qs.length, 4);
  const zero = (p) => { const s = {}; p.rubric.forEach(r => s[r.id] = 0); return s; };
  const sc = (p, text) => { const g = C.gradeEssayPart(p, text), s = {}; g.items.forEach(i => { s[i.id] = i.earned; }); return s; };
  // 計算題：答案沒有數字 → 提醒要寫算式與數字
  const p21 = qs[1].parts[0];
  const fb0 = C.feedbackEssayPart(p21, { text: '這個專案可以賺錢，所以應該接受。', auto: zero(p21), scores: zero(p21) });
  assert.ok(has(fb0, 'tip', /幾乎沒有數字/) && has(fb0, 'warn', /沒有得分/));
  // 以期望增長率 0% 代入：有數字但結果沒對上，並列出常見錯誤
  const wrong = '期望成長率=(3%+0%-3%)/3=0%，PV=100/5%=2000，NPV=2000-2200=-200，拒絕。';
  const fbw = C.feedbackEssayPart(p21, { text: wrong, auto: sc(p21, wrong), scores: sc(p21, wrong) });
  assert.ok(has(fbw, 'tip', /有寫出數字/), '有數字但結果沒對上應提醒逐步對照');
  assert.ok(has(fbw, 'tip', /先把增長率取期望值/), '應列出常見錯誤');
  assert.ok(has(fbw, null, /完全沒得分的得分點|只拿到部分分數/));
  // 概念題：只寫名詞沒有得分點時，列出失分細目與提示
  const p11 = qs[0].parts[1], t11 = 'S&P 500 只有 500 檔股票，所以不夠。';
  const fb11 = C.feedbackEssayPart(p11, { text: t11, auto: sc(p11, t11), scores: sc(p11, t11) });
  assert.ok(has(fb11, 'warn', /沒有得分|都沒有得分|完全沒得分/) && has(fb11, 'tip', /提示：/) && has(fb11, 'tip', /常見錯誤/));
  // 整題總評：只評第（一）小題，其餘小題尚未評分，且指出失分最多的得分點
  const p41 = qs[3].parts[0], t41 = '分為持有至到期、備供出售、交易目的與放款及應收款四類。';
  const tot = C.feedbackEssay(qs[3], { [p41.id]: { text: t41, auto: sc(p41, t41), scores: sc(p41, t41) } });
  assert.ok(has(tot, 'tip', /尚未評分/) && has(tot, 'warn', /失分最多/));
  // 學生把細目分數調高、但系統沒偵測到對應寫法時，會提醒
  const p31 = qs[2].parts[0], z31 = zero(p31), up = Object.assign({}, z31, { r1: 3 });
  assert.ok(has(C.feedbackEssayPart(p31, { text: '不知道', auto: z31, scores: up }), 'tip', /調高/));
  // 參考答案作答、自評滿分時，整題為滿分
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const s = sc(p, C.stripHtml(p.model_answer)); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: s, scores: s }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
  });
}
console.log('113 年財務管理與投資學回饋測試通過');

/* ===== 115 年高考三級保險學、普考保險學概要：依作答的意見與建議 ===== */
{
  const E = (id) => essays.essays.find(e => e.id === id);
  const sc = (p, t) => { const g = C.gradeEssayPart(p, t), o = {}; g.items.forEach(i => { o[i.id] = i.earned; }); return o; };
  const zero = (p) => { const o = {}; p.rubric.forEach(r => { o[r.id] = 0; }); return o; };
  const qs = ['115-g3ins-E1', '115-g3ins-E2', '115-g3ins-E3', '115-g3ins-E4', '115-pins-E1', '115-pins-E2', '115-pins-E3', '115-pins-E4'].map(E);
  // 參考答案作答、自評滿分時，整題為滿分，且只評一小題時提醒尚未評分
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const s = sc(p, C.stripHtml(p.model_answer)); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: s, scores: s }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
    const h = C.feedbackEssay(q, { [q.parts[0].id]: ps[q.parts[0].id] });
    assert.ok(q.parts.length === 1 || has(h, 'tip', /尚未評分/));
  });
  // 空泛答案：沒得分，列出失分提示與常見錯誤
  const p31 = qs[2].parts[2], t31 = '兩者都是保險的重要原則。';
  const f31 = C.feedbackEssayPart(p31, { text: t31, auto: sc(p31, t31), scores: sc(p31, t31) });
  assert.ok(has(f31, 'warn', /沒有得分|都沒有得分/) && has(f31, 'tip', /常見錯誤/));
  // 法律題：沒引用條文、沒有明確結論時提醒（高考 3（二）代位，應引用保險法第 53 條）
  const p32 = qs[2].parts[1], t32 = '保險公司賠錢以後可以向別人要錢。';
  const f32 = C.feedbackEssayPart(p32, { text: t32, auto: sc(p32, t32), scores: sc(p32, t32) });
  assert.ok(has(f32, 'tip', /保險法第 53 條/), '應提醒引用保險法第 53 條');
  // 已引用條文時不再提醒該條
  const t32b = '依保險法第53條，保險人賠付後得代位求償，以賠償金額為限，應負責任的是第三人。';
  const f32b = C.feedbackEssayPart(p32, { text: t32b, auto: sc(p32, t32b), scores: sc(p32, t32b) });
  assert.ok(!has(f32b, 'tip', /保險法第 53 條/), '已引用第 53 條不應再提醒');
  // 普考 1（三）無效與解除：寫反（解除向後）時列出失分的得分點與常見錯誤
  const p53 = qs[4].parts[2], t53 = '解除是向後消滅，終止是溯及既往。';
  const f53 = C.feedbackEssayPart(p53, { text: t53, auto: sc(p53, t53), scores: sc(p53, t53) });
  assert.ok(has(f53, 'tip', /常見錯誤/) && has(f53, null, /沒得分|沒有得分|得分不到一半/));
  // 學生自行調高系統沒偵測到的細目時提醒
  const p11 = qs[0].parts[0], z11 = zero(p11), up = Object.assign({}, z11, { r1: 3 });
  assert.ok(has(C.feedbackEssayPart(p11, { text: '不知道', auto: z11, scores: up }), 'tip', /調高/));
}
console.log('115 年保險學與保險學概要回饋測試通過');

/* ===== 114 年高考三級保險學、普考保險學概要：依作答的意見與建議 ===== */
{
  const E = (id) => essays.essays.find(e => e.id === id);
  const sc = (p, x) => { const g = C.gradeEssayPart(p, x), o = {}; g.items.forEach(i => { o[i.id] = i.earned; }); return o; };
  const qs = ['114-g3ins-E1', '114-g3ins-E2', '114-g3ins-E3', '114-g3ins-E4', '114-pins-E1', '114-pins-E2', '114-pins-E3', '114-pins-E4'].map(E);
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const s = sc(p, C.stripHtml(p.model_answer)); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: s, scores: s }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
    assert.ok(q.parts.length === 1 || has(C.feedbackEssay(q, { [q.parts[0].id]: ps[q.parts[0].id] }), 'tip', /尚未評分/));
  });
  // 法律題：特約條款第 68 條。沒引用條文、沒結論時提醒；已引用則不提醒
  const p3 = qs[1].parts[2], x3 = '違反特約條款對方可以處理。';
  const f3 = C.feedbackEssayPart(p3, { text: x3, auto: sc(p3, x3), scores: sc(p3, x3) });
  assert.ok(has(f3, 'tip', /保險法第 68 條/) && has(f3, 'tip', /常見錯誤/));
  const x3b = '依保險法第68條，違背特約條款他方得解除契約，危險發生後亦同。';
  assert.ok(!has(C.feedbackEssayPart(p3, { text: x3b, auto: sc(p3, x3b), scores: sc(p3, x3b) }), 'tip', /保險法第 68 條/));
  // 空泛答案：列出失分的得分點與常見錯誤
  const p7 = qs[7].parts[0], x7 = '費率要公平合理。';
  const f7 = C.feedbackEssayPart(p7, { text: x7, auto: sc(p7, x7), scores: sc(p7, x7) });
  assert.ok(has(f7, null, /沒有得分|完全沒得分|只拿到部分/) && has(f7, 'tip', /常見錯誤/));
}
console.log('114 年保險學與保險學概要回饋測試通過');


/* ===== 113 年高考三級保險學、普考保險學概要：依作答的意見與建議 ===== */
{
  const E = (id) => essays.essays.find(e => e.id === id);
  const sc = (p, t) => { const g = C.gradeEssayPart(p, t), o = {}; g.items.forEach(i => { o[i.id] = i.earned; }); return o; };
  const zero = (p) => { const o = {}; p.rubric.forEach(r => { o[r.id] = 0; }); return o; };
  const qs = ['113-g3ins-E1', '113-g3ins-E2', '113-g3ins-E3', '113-g3ins-E4', '113-pins-E1', '113-pins-E2', '113-pins-E3', '113-pins-E4'].map(E);
  // 參考答案作答、自評滿分時，整題為滿分，且只評一小題時提醒尚未評分
  qs.forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const s = sc(p, C.stripHtml(p.model_answer)); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: s, scores: s }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
    const h = C.feedbackEssay(q, { [q.parts[0].id]: ps[q.parts[0].id] });
    assert.ok(q.parts.length === 1 || has(h, 'tip', /尚未評分/));
  });
  // 計算題寫錯（平分損失）：沒得分，列出失分得分點與常見錯誤
  const p11 = qs[0].parts[0], t11 = '兩家保險公司各賠 300 萬。';
  const f11 = C.feedbackEssayPart(p11, { text: t11, auto: sc(p11, t11), scores: sc(p11, t11) });
  assert.ok(has(f11, 'warn', /沒有得分|都沒有得分/) && has(f11, 'tip', /常見錯誤/));
  // 法律題：沒引用條文時提醒（普考 2（二）應引用保險法第 21 條與第 44 條）
  const p62 = qs[5].parts[1], t62 = '保險契約是諾成契約，因為雙方同意就成立，不須交付保險費。';
  const f62 = C.feedbackEssayPart(p62, { text: t62, auto: sc(p62, t62), scores: sc(p62, t62) });
  assert.ok(has(f62, 'tip', /保險法第 21 條/) && has(f62, 'tip', /保險法第 44 條/), '應提醒引用第 21、44 條');
  // 已引用條文時不再提醒該條
  const t62b = '依保險法第44條，保險人同意要保人聲請後簽訂即成立，為諾成契約；第21條保險費應於生效前交付，但書另有訂定者不在此限。';
  const f62b = C.feedbackEssayPart(p62, { text: t62b, auto: sc(p62, t62b), scores: sc(p62, t62b) });
  assert.ok(!has(f62b, 'tip', /保險法第 21 條/) && !has(f62b, 'tip', /保險法第 44 條/), '已引用不應再提醒');
  // 學生自行調高系統沒偵測到的細目時提醒
  const p41 = qs[3].parts[0], z41 = zero(p41), up = Object.assign({}, z41, { r1: 2 });
  assert.ok(has(C.feedbackEssayPart(p41, { text: '不知道', auto: z41, scores: up }), 'tip', /調高/));
}
console.log('113 年保險學與保險學概要回饋測試通過');

// 115 年高考三級運輸規劃學與運輸學：參考答案滿分、空泛答案的回饋
{
  const E = (id) => essays.essays.find(e => e.id === id);
  const sc = (p, x) => { const g = C.gradeEssayPart(p, x), o = {}; g.items.forEach(i => { o[i.id] = i.earned; }); return o; };
  ['115-g3tpl-E1', '115-g3tpl-E2', '115-g3tpl-E3', '115-g3tpl-E4', '115-g3tr-E1', '115-g3tr-E2', '115-g3tr-E3', '115-g3tr-E4'].map(E).forEach(q => {
    const ps = {};
    q.parts.forEach(p => { const s = sc(p, C.stripHtml(p.model_answer)); ps[p.id] = { text: C.stripHtml(p.model_answer), auto: s, scores: s }; });
    const te = C.feedbackEssay(q, ps);
    assert.strictEqual(te.earned, te.possible, q.id + ' 參考答案總分應為滿分');
    assert.ok(has(te, 'good', /全部拿滿分/));
  });
  // 空泛答案：列出沒得分的得分點、提示與常見錯誤，並提醒字數偏少
  const p = E('115-g3tr-E3').parts[1], x = '要有無障礙與性別平等。';
  const f = C.feedbackEssayPart(p, { text: x, auto: sc(p, x), scores: sc(p, x) });
  assert.ok(has(f, 'warn', /沒有得分|完全沒得分|只拿到部分/) && has(f, 'tip', /常見錯誤/) && has(f, 'tip', /偏少/));
  // 只寫一個小題：整題總評提醒另一小題尚未評分，並指出失分最多的得分點
  const q4 = E('115-g3tr-E4'), p1 = q4.parts[0], x1 = '臺鐵局改制為國營公司，附屬事業可以轉投資。';
  const te = C.feedbackEssay(q4, { [p1.id]: { text: x1, auto: sc(p1, x1), scores: sc(p1, x1) } });
  assert.ok(has(te, 'tip', /尚未評分/) && has(te, 'warn', /失分最多/));
}
console.log('115 年運輸規劃學與運輸學回饋測試通過');

