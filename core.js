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


  /* ================= 申論題 ================= */

  /** 去掉 HTML 標籤並還原常見實體（測試與參考答案比對用）。 */
  function stripHtml(h) {
    return String(h == null ? "" : h).replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }

  /**
   * 比對用的文字正規化：NFKC（全形轉半形、² 轉 2、下標轉一般字）、小寫、
   * 統一各種減號、LaTeX \frac 轉成 a/b，並去掉空白、括號與常見符號，
   * 讓 d²/(2b)、d^2 / 2b、d＾2／（２ｂ） 都落在同一種寫法。
   */
  function normalizeText(s) {
    s = String(s == null ? "" : s);
    try { s = s.normalize("NFKC"); } catch (e) {}
    s = s.toLowerCase()
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/[\u2212\u2010\u2011\u2013\u2014\uFE63]/g, "-")
      .replace(/[\u2044\u00f7]/g, "/")
      .replace(/[\s()\[\]{}\u300c\u300d\u300e\u300f\u3010\u3011,.;:*\u00d7\u00b7\u22c5^_$\\'"`\u2032\u3001\u3002\uff0c\uff1b\uff1a]/g, "");
    return s;
  }

  function roundHalf(x) { return Math.round(x * 2) / 2; }

  function safeRegex(src) { try { return new RegExp(src); } catch (e) { return null; } }

  /**
   * 對單一小題做「評分細目」關鍵字初判。
   * 每個細目有 patterns（正規表示式字串，對正規化後的文字比對）與 min（至少需符合幾條，預設 1）。
   * 符合條數 >= min 得滿分；有符合但不足 min 則按比例給分（每 0.5 分進位到最近的 0.5）。
   * 這只是初判，最後分數由學生對照參考答案自行確認。
   */
  function gradeEssayPart(part, text) {
    var t = normalizeText(text);
    var items = (part.rubric || []).map(function (r) {
      var need = r.min || 1, matched = 0;
      (r.patterns || []).forEach(function (src) { var re = safeRegex(src); if (re && re.test(t)) matched++; });
      var ratio = Math.min(1, matched / need);
      var earned = Math.min(r.points, roundHalf(r.points * ratio));
      var status = matched >= need ? "ok" : (matched > 0 ? "part" : "miss");
      return { id: r.id, points: r.points, earned: earned, matched: matched, need: need, status: status };
    });
    var earned = items.reduce(function (a, x) { return a + x.earned; }, 0);
    var possible = items.reduce(function (a, x) { return a + x.points; }, 0);
    return { items: items, earned: earned, possible: possible, chars: String(text || "").replace(/\s/g, "").length };
  }

  /** 把學生確認後的各細目分數加總（會限制在 0 ~ 該細目配分）。scores: { rubricId: number } */
  function sumPartScores(part, scores) {
    var tot = 0;
    (part.rubric || []).forEach(function (r) {
      var v = Number((scores || {})[r.id]);
      if (!isFinite(v) || v < 0) v = 0;
      tot += Math.min(v, r.points);
    });
    return tot;
  }

  /** 一題申論題的總分。partScores: { partId: { rubricId: number } } */
  function summarizeEssay(essay, partScores) {
    var out = { earned: 0, possible: 0, parts: {} };
    essay.parts.forEach(function (p) {
      var e = sumPartScores(p, (partScores || {})[p.id]);
      out.parts[p.id] = { earned: e, possible: p.points };
      out.earned += e; out.possible += p.points;
    });
    return out;
  }

  /** 檢查申論題資料格式，回傳錯誤訊息陣列。 */
  function validateEssays(data) {
    var errs = [], seen = {};
    if (!data || !Array.isArray(data.essays)) return ["缺少 essays 陣列"];
    data.essays.forEach(function (q, i) {
      var p = "申論第 " + (i + 1) + " 題（" + (q && q.id) + "）";
      if (!q.id) errs.push(p + "缺少 id"); else if (seen[q.id]) errs.push(p + "id 重複"); else seen[q.id] = true;
      ["subject", "question"].forEach(function (k) { if (!q[k]) errs.push(p + "缺少 " + k); });
      if (typeof q.points !== "number" || q.points <= 0) errs.push(p + "points 需為正數");
      if (!Array.isArray(q.parts) || !q.parts.length) { errs.push(p + "缺少 parts"); return; }
      var ps = 0, pid = {};
      q.parts.forEach(function (pt) {
        var pp = p + "小題 " + pt.id;
        if (!pt.id) errs.push(p + "有小題缺少 id"); else if (pid[pt.id]) errs.push(pp + "id 重複"); else pid[pt.id] = true;
        if (!pt.question) errs.push(pp + "缺少 question");
        if (!pt.model_answer) errs.push(pp + "缺少 model_answer");
        if (typeof pt.points !== "number" || pt.points <= 0) errs.push(pp + "points 需為正數");
        ps += pt.points || 0;
        if (!Array.isArray(pt.rubric) || !pt.rubric.length) { errs.push(pp + "缺少 rubric"); return; }
        var rs = 0, rid = {};
        pt.rubric.forEach(function (r) {
          if (!r.id || rid[r.id]) errs.push(pp + "評分細目 id 缺漏或重複"); else rid[r.id] = true;
          if (!r.label) errs.push(pp + "評分細目 " + r.id + " 缺少 label");
          if (typeof r.points !== "number" || r.points <= 0) errs.push(pp + "評分細目 " + r.id + " points 需為正數");
          rs += r.points || 0;
          if (!Array.isArray(r.patterns) || !r.patterns.length) errs.push(pp + "評分細目 " + r.id + " 缺少 patterns");
          else r.patterns.forEach(function (src) { if (!safeRegex(src)) errs.push(pp + "評分細目 " + r.id + " 的 pattern 不合法：" + src); });
          if (r.min && (r.min < 1 || r.min > (r.patterns || []).length)) errs.push(pp + "評分細目 " + r.id + " 的 min 超出 patterns 數量");
        });
        if (Math.abs(rs - pt.points) > 1e-9) errs.push(pp + "評分細目配分合計 " + rs + " 不等於小題配分 " + pt.points);
      });
      if (Math.abs(ps - q.points) > 1e-9) errs.push(p + "小題配分合計 " + ps + " 不等於全題配分 " + q.points);
    });
    return errs;
  }

  var api = { shuffle: shuffle, buildPool: buildPool, drawQueue: drawQueue, grade: grade, summarize: summarize, validateBank: validateBank,
    stripHtml: stripHtml, normalizeText: normalizeText, gradeEssayPart: gradeEssayPart, sumPartScores: sumPartScores, summarizeEssay: summarizeEssay, validateEssays: validateEssays };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MoexCore = api;
})(typeof window !== "undefined" ? window : this);
