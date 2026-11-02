/* 題庫核心邏輯：出題、評分、統計。不碰 DOM，可在 Node 內單獨測試。 */
(function (root) {
  "use strict";

  /** Fisher-Yates 洗牌，回傳新陣列。rnd 可注入以便測試。 */
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * 依條件篩選題目。
   * f: { subject, year, tag, area, mode, wrongMap }
   * mode === "wrong" 時只留下「最近一次作答未答對」的題目。
   */
  function buildPool(questions, f) {
    return questions.filter(function (q) {
      if (f.subject && q.subject !== f.subject) return false;
      if (f.year && String(q.year_roc) !== String(f.year)) return false;
      if (f.area && q.area !== f.area) return false;
      if (f.tag && (q.tags || []).indexOf(f.tag) < 0) return false;
      if (f.mode === "wrong") {
        var w = (f.wrongMap || {})[q.id];
        if (!w || w.last === "ok") return false;
      }
      return true;
    });
  }

  /** 從題池亂數抽出 n 題（同一輪不重複）。n 為 0 或超過題池時取全部。 */
  function drawQueue(pool, n, rnd) {
    var s = shuffle(pool, rnd);
    if (n > 0 && n < s.length) s = s.slice(0, n);
    return s.map(function (q) { return q.id; });
  }

  /**
   * 評分。chosen 為 "A"~"D" 或 null（未答）。
   * 支援考選部「更正答案」：accept 為可接受的多個答案；give_all 為一律給分。
   */
  function grade(q, chosen) {
    var accept = (q.accept && q.accept.length) ? q.accept : [q.answer];
    if (q.give_all) {
      return { status: "ok", pts: q.points, gift: true };
    }
    if (chosen == null || chosen === "") {
      return { status: "skip", pts: 0, gift: false };
    }
    var ok = accept.indexOf(chosen) >= 0;
    return { status: ok ? "ok" : "bad", pts: ok ? q.points : 0, gift: false };
  }

  /** 彙整一次練習：得分、答對率、各考點弱點。results: { id: {chosen,status,pts} } */
  function summarize(questionsById, queue, results) {
    var out = { total: 0, possible: 0, earned: 0, ok: 0, bad: 0, skip: 0, answered: 0, tags: {} };
    queue.forEach(function (id) {
      var q = questionsById[id], r = results[id];
      if (!q || !r) return;
      out.total++;
      out.possible += q.points;
      out.earned += r.pts;
      out[r.status]++;
      if (r.status !== "skip") out.answered++;
      (q.tags && q.tags.length ? q.tags : ["未分類"]).forEach(function (t) {
        var o = out.tags[t] || (out.tags[t] = { ok: 0, n: 0 });
        o.n++;
        if (r.status === "ok") o.ok++;
      });
    });
    out.accuracy = out.total ? out.ok / out.total : 0;
    out.weak = Object.keys(out.tags).map(function (t) {
      return { tag: t, ok: out.tags[t].ok, n: out.tags[t].n, rate: out.tags[t].ok / out.tags[t].n };
    }).sort(function (a, b) { return a.rate - b.rate || b.n - a.n; });
    return out;
  }

  /** 檢查題庫格式，回傳錯誤訊息陣列（空陣列代表通過）。 */
  function validateBank(bank) {
    var errs = [], seen = {};
    if (!bank || !Array.isArray(bank.questions)) return ["缺少 questions 陣列"];
    bank.questions.forEach(function (q, i) {
      var p = "第 " + (i + 1) + " 題（" + (q && q.id) + "）";
      if (!q.id) errs.push(p + "缺少 id");
      else if (seen[q.id]) errs.push(p + "id 重複");
      else seen[q.id] = true;
      ["subject", "question", "answer", "explanation"].forEach(function (k) {
        if (!q[k]) errs.push(p + "缺少 " + k);
      });
      if (q.type !== "mcq") errs.push(p + "type 目前只支援 mcq");
      if (!Array.isArray(q.options) || q.options.length < 2) errs.push(p + "options 至少 2 個");
      else if ("ABCDEFGH".indexOf(q.answer) < 0 || "ABCDEFGH".indexOf(q.answer) >= q.options.length) errs.push(p + "answer 不在選項範圍內");
      if (typeof q.points !== "number" || q.points <= 0) errs.push(p + "points 需為正數");
    });
    return errs;
  }

  var api = { shuffle: shuffle, buildPool: buildPool, drawQueue: drawQueue, grade: grade, summarize: summarize, validateBank: validateBank };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MoexCore = api;
})(typeof window !== "undefined" ? window : this);
