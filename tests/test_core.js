const path = require('path');
const C = require(path.join(__dirname, '..', 'core.js'));
const bank = require(path.join(__dirname, '..', 'data', 'bank.json'));
const assert = require('assert');

assert.deepStrictEqual(C.validateBank(bank), []);

// 各年度標準答案（來自考選部答案卡）
const KEYS = {
  "公務人員普通考試|113": "ACBBABDCDBDAABAACACADCBCAACCDCCDAABBDABCBDDCDDBDDA",
  "公務人員普通考試|114": "BCBCDADAABDDBBACCDCBBCBCCDAADDCBCBBDDCCDCDACDACBCB",
  "公務人員普通考試|115": "ADCBCDCBBBACABADBAABBDBADDBCBDADABADCDCBDBCCACBDBC",
  "公務人員初等考試|113": "ACCADCBADACBCBDDAADABBACBBCCDABCCDBABCBDDBCBDADDAA",
  "公務人員初等考試|114": "BACCACCABBCCDCCBABADAABDBDCACBDCBDCAABDDADCBDBDBDD",
  "公務人員初等考試|115": "DCAABCBDACCDACDBBACDBADBDDBBACCACCADCDBDBBADCABBDA"
};
Object.keys(KEYS).forEach(k => {
  const [exam, y] = k.split("|");
  const qs = bank.questions.filter(q => q.exam === exam && String(q.year_roc) === y).sort((a, b) => a.question_no - b.question_no);
  assert.strictEqual(qs.length, 50, k + " 題數");
  assert.strictEqual(qs.map(q => q.answer).join(""), KEYS[k], k + " 答案與考選部答案卡一致");
  qs.forEach((q, i) => assert.strictEqual(q.question_no, i + 1));
});
assert.strictEqual(bank.questions.length, 300);

const pool = C.buildPool(bank.questions, { subject: "經濟學概要", mode: "random" });
assert.strictEqual(pool.length, 150);
assert.strictEqual(C.buildPool(bank.questions, { subject: "經濟學大意", mode: "random" }).length, 150);
const q10 = C.drawQueue(pool, 10);
assert.strictEqual(q10.length, 10); assert.strictEqual(new Set(q10).size, 10);
const all = C.drawQueue(pool, 0); assert.strictEqual(new Set(all).size, 150);
assert.notDeepStrictEqual(all, pool.map(q => q.id));

assert.strictEqual(C.buildPool(bank.questions, { year: "113" }).length, 100);
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
