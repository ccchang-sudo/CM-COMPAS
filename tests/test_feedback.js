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
  assert.strictEqual(essays.essays.filter(e => e.year_roc === 113 && e.exam === '公務人員高等考試三級考試' && e.subject !== '交通政策與行政').length, 61);  // 含 113 年觀光行政三科 11 題（觀光英語 4、觀光學 4、觀光日語 3）與觀光資源規劃 4 題；113 年高考三級原 7 科 24 題＋財政學 4 題；另含民法 14 題（戶政 3、司法行政 2、法制／智財 2、財稅行政／財稅法務 2、公平交易管理 2、地政 3）；交通政策與行政 4 題另計
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
