const path = require('path');
const C = require(path.join(__dirname, '..', 'core.js'));
const bank = require(path.join(__dirname, '..', 'data', 'bank.json'));
const assert = require('assert');

assert.deepStrictEqual(C.validateBank(bank), []);

// 各年度標準答案（來自考選部答案卡）
const KEYS = {
  "公務人員普通考試|經濟學概要|113": "ACBBABDCDBDAABAACACADCBCAACCDCCDAABBDABCBDDCDDBDDA",
  "公務人員普通考試|經濟學概要|114": "BCBCDADAABDDBBACCDCBBCBCCDAADDCBCBBDDCCDCDACDACBCB",
  "公務人員普通考試|經濟學概要|115": "ADCBCDCBBBACABADBAABBDBADDBCBDADABADCDCBDBCCACBDBC",
  "公務人員初等考試|經濟學大意|113": "ACCADCBADACBCBDDAADABBACBBCCDABCCDBABCBDDBCBDADDAA",
  "公務人員初等考試|經濟學大意|114": "BACCACCABBCCDCCBABADAABDBDCACBDCBDCAABDDADCBDBDBDD",
  "公務人員初等考試|經濟學大意|115": "DCAABCBDACCDACDBBACDBADBDDBBACCACCADCDBDBBADCABBDA",
  // 高等考試三級（答案卡；113 年經濟學第 11 題為更正題，答 C 或 D 均給分，此處以 D 記錄）
  "公務人員高等考試三級考試|經濟學與財政學概論|113": "CDBDABBABBBBAAACDACC",
  "公務人員高等考試三級考試|經濟學與財政學概論|114": "DBCBACBDBABCABAAACAA",
  "公務人員高等考試三級考試|經濟學與財政學概論|115": "CCACBBDBDABADABAADDB",
  "公務人員高等考試三級考試|經濟學|113": "DACDCCDCCDDABCABBACABDBBD",
  "公務人員高等考試三級考試|經濟學|114": "BACACBBCDADABDACBCADBBADB",
  "公務人員高等考試三級考試|經濟學|115": "DADDBCCBBDAABABCCADBBDBAC",
  "公務人員高等考試三級考試|經濟學與貨幣銀行學|115": "DBBDADBBADCBBBDDCADDBABDC",
  // 初等考試統計學大意（單選 40 題，每題 2.5 分）
  "公務人員初等考試|統計學大意|113": "BDDDCBBBAACCDBABBDBCDABBDBCBBCCAADDCCDBA",
  "公務人員初等考試|統計學大意|114": "BCDBAAACADDBDBDACCCAAABBCACCDDCBBDBCABCB",
  "公務人員初等考試|統計學大意|115": "DDCDCBCBAADCABBBABCBACAAADAADDCBCCCCDABD"
};
Object.keys(KEYS).forEach(k => {
  const [exam, subj, y] = k.split("|");
  const qs = bank.questions.filter(q => q.exam === exam && q.subject === subj && String(q.year_roc) === y).sort((a, b) => a.question_no - b.question_no);
  assert.strictEqual(qs.length, KEYS[k].length, k + " 題數");
  assert.strictEqual(qs.map(q => q.answer).join(""), KEYS[k], k + " 答案與考選部答案卡一致");
  qs.forEach((q, i) => assert.strictEqual(q.question_no, i + 1));
});
// 每份試卷的滿分應為 100 分的一半（測驗題 50 分）
const total = {};
bank.questions.filter(q => q.exam === "公務人員高等考試三級考試").forEach(q => { const k = q.subject + q.year_roc; total[k] = (total[k] || 0) + q.points; });
Object.keys(total).forEach(k => assert.strictEqual(total[k], 50, k + " 測驗題滿分 50 分"));
// 初等考試統計學大意每份 40 題 × 2.5 分 = 100 分
const st = bank.questions.filter(q => q.subject === "統計學大意");
assert.strictEqual(st.length, 120);
["113", "114", "115"].forEach(y => assert.strictEqual(st.filter(q => String(q.year_roc) === y).reduce((s, q) => s + q.points, 0), 100, y + " 統計學大意滿分"));
// 考選部更正答案：113 年經濟學第 11 題 C 或 D 均給分
const qc = bank.questions.find(q => q.id === "113-g3econ-11");
assert.deepStrictEqual(qc.accept, ["C", "D"]);
assert.strictEqual(C.grade(qc, "C").status, "ok"); assert.strictEqual(C.grade(qc, "D").status, "ok"); assert.strictEqual(C.grade(qc, "A").status, "bad");
assert.strictEqual(bank.questions.length, 580);

const pool = C.buildPool(bank.questions, { subject: "經濟學概要", mode: "random" });
assert.strictEqual(pool.length, 150);
assert.strictEqual(C.buildPool(bank.questions, { subject: "經濟學大意", mode: "random" }).length, 150);
const q10 = C.drawQueue(pool, 10);
assert.strictEqual(q10.length, 10); assert.strictEqual(new Set(q10).size, 10);
const all = C.drawQueue(pool, 0); assert.strictEqual(new Set(all).size, 150);
assert.notDeepStrictEqual(all, pool.map(q => q.id));

assert.strictEqual(C.buildPool(bank.questions, { year: "113" }).length, 185);
assert.strictEqual(C.buildPool(bank.questions, { subject: "經濟學大意", year: "114" }).length, 50);
assert.strictEqual(C.buildPool(bank.questions, { subject: "經濟學概要", year: "115" }).length, 50);
assert.strictEqual(C.buildPool(bank.questions, { year: "112" }).length, 0);
const tagN = C.buildPool(bank.questions, { tag: "凱因斯模型" }).length;
assert.ok(tagN >= 3, "考點篩選至少含 113 年 3 題");

const wrongMap = { "113-econ-3": { last: "bad" }, "113-econ-4": { last: "ok" }, "114-econ-5": { last: "skip" } };
assert.deepStrictEqual(C.buildPool(bank.questions, { mode: "wrong", wrongMap }).map(q => q.id).sort(), ["113-econ-3", "114-econ-5"]);

const q1 = bank.questions.find(q => q.id === "113-econ-1"); // A
assert.deepStrictEqual(C.grade(q1, "A"), { status: "ok", pts: 2, gift: false });
assert.strictEqual(C.grade(q1, "B").status, "bad");
assert.strictEqual(C.grade(q1, null).status, "skip");
const qa = Object.assign({}, q1, { accept: ["A", "C"] });
assert.strictEqual(C.grade(qa, "C").status, "ok"); assert.strictEqual(C.grade(qa, "B").status, "bad");
const qg = Object.assign({}, q1, { give_all: true });
assert.deepStrictEqual(C.grade(qg, null), { status: "ok", pts: 2, gift: true });

const byId = {}; bank.questions.forEach(q => byId[q.id] = q);
const queue = ["113-econ-1", "113-econ-2", "113-econ-3"];
const results = { "113-econ-1": C.grade(byId["113-econ-1"], "A"), "113-econ-2": C.grade(byId["113-econ-2"], "A"), "113-econ-3": C.grade(byId["113-econ-3"], null) };
const sm = C.summarize(byId, queue, results);
assert.strictEqual(sm.earned, 2); assert.strictEqual(sm.possible, 6);
assert.strictEqual(sm.ok, 1); assert.strictEqual(sm.bad, 1); assert.strictEqual(sm.skip, 1);

assert.ok(C.validateBank({ questions: [{ id: "x", subject: "s", question: "q", answer: "E", explanation: "e", type: "mcq", options: ["a", "b"], points: 2 }] }).length > 0);
assert.ok(C.validateBank({ questions: [bank.questions[0], bank.questions[0]] }).some(e => e.includes("重複")));
console.log("core tests passed (" + bank.questions.length + " questions)");
