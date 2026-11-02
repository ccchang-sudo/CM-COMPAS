const C=require(require('path').join(__dirname,'..','core.js'));
const bank=require(require('path').join(__dirname,'..','data','bank.json'));
const assert=require('assert');
assert.deepStrictEqual(C.validateBank(bank),[]);
// 標準答案與考選部答案卡一致
const KEY="ACBBABDCDBDAABAACACADCBCAACCDCCDAABBDABCBDDCDDBDDA";
assert.strictEqual(bank.questions.map(q=>q.answer).join(""),KEY);
// 出題：不重複、數量正確、洗牌是排列
const pool=C.buildPool(bank.questions,{subject:"經濟學概要",mode:"random"});
assert.strictEqual(pool.length,50);
const q10=C.drawQueue(pool,10);
assert.strictEqual(q10.length,10); assert.strictEqual(new Set(q10).size,10);
const all=C.drawQueue(pool,0); assert.strictEqual(new Set(all).size,50);
// 洗牌確實會變動順序（50 題原序出現的機率可忽略）
assert.notDeepStrictEqual(all, pool.map(q=>q.id));
// 篩選
assert.strictEqual(C.buildPool(bank.questions,{year:"113"}).length,50);
assert.strictEqual(C.buildPool(bank.questions,{year:"112"}).length,0);
const tagN=C.buildPool(bank.questions,{tag:"凱因斯模型"}).length; assert.strictEqual(tagN,3);
const wrongMap={"113-econ-3":{last:"bad"},"113-econ-4":{last:"ok"},"113-econ-5":{last:"skip"}};
assert.deepStrictEqual(C.buildPool(bank.questions,{mode:"wrong",wrongMap}).map(q=>q.id),["113-econ-3","113-econ-5"]);
// 評分
const q1=bank.questions[0]; // A
assert.deepStrictEqual(C.grade(q1,"A"),{status:"ok",pts:2,gift:false});
assert.strictEqual(C.grade(q1,"B").status,"bad");
assert.strictEqual(C.grade(q1,null).status,"skip");
// 更正答案：兩個都給分、一律給分
const qa=Object.assign({},q1,{accept:["A","C"]});
assert.strictEqual(C.grade(qa,"C").status,"ok"); assert.strictEqual(C.grade(qa,"B").status,"bad");
const qg=Object.assign({},q1,{give_all:true});
assert.deepStrictEqual(C.grade(qg,null),{status:"ok",pts:2,gift:true});
// 統計
const byId={}; bank.questions.forEach(q=>byId[q.id]=q);
const queue=["113-econ-1","113-econ-2","113-econ-3"];
const results={"113-econ-1":C.grade(byId["113-econ-1"],"A"),"113-econ-2":C.grade(byId["113-econ-2"],"A"),"113-econ-3":C.grade(byId["113-econ-3"],null)};
const sm=C.summarize(byId,queue,results);
assert.strictEqual(sm.earned,2); assert.strictEqual(sm.possible,6); assert.strictEqual(sm.ok,1); assert.strictEqual(sm.bad,1); assert.strictEqual(sm.skip,1);
// 壞題庫要被擋下
assert.ok(C.validateBank({questions:[{id:"x",subject:"s",question:"q",answer:"E",explanation:"e",type:"mcq",options:["a","b"],points:2}]}).length>0);
assert.ok(C.validateBank({questions:[bank.questions[0],bank.questions[0]]}).some(e=>e.includes("重複")));
console.log("core tests passed");
