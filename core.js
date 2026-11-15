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
          if (r.kind != null && ["formula", "concept", "discussion"].indexOf(r.kind) < 0) errs.push(pp + "評分細目 " + r.id + " 的 kind 只能是 formula、concept 或 discussion");
          if (r.advice != null && !String(r.advice).trim()) errs.push(pp + "評分細目 " + r.id + " 的 advice 不可為空字串");
          if (r.min && (r.min < 1 || r.min > (r.patterns || []).length)) errs.push(pp + "評分細目 " + r.id + " 的 min 超出 patterns 數量");
        });
        if (Math.abs(rs - pt.points) > 1e-9) errs.push(pp + "評分細目配分合計 " + rs + " 不等於小題配分 " + pt.points);
      });
      if (Math.abs(ps - q.points) > 1e-9) errs.push(p + "小題配分合計 " + ps + " 不等於全題配分 " + q.points);
    });
    return errs;
  }

  /* ================= 申論題：意見與建議 ================= */

  var KIND_TIPS = {
    formula: "計算與推導題：依序寫出「假設與符號 → 每一步的式子 → 框出結論 → 用極限或特例檢查」。即使最後結果算錯，清楚的步驟仍可拿到過程分。",
    concept: "概念說明題：用「定義 → 機制 → 結論」三段式，每個要點至少一句完整的話；只列名詞（例如只寫「Lucas 批判」）通常拿不到分。",
    discussion: "討論比較題：寫出「機制 ＋ 方向 ＋ 例外或極限」三個要素，最後用一兩句做比較或結論。"
  };
  var LEVELS = [
    { min: 0.85, key: "excellent", title: "表現優良", msg: "核心得分點幾乎都掌握了。接下來把重點放在表達：每一步推導寫清楚，結尾加一句檢驗或比較，避免因為跳步被扣過程分。" },
    { min: 0.65, key: "good", title: "大致掌握", msg: "主要架構是對的，但仍有幾個得分點遺漏或寫得不完整。優先補強下方列出的項目，再重寫一次同一小題，確認補齊。" },
    { min: 0.4, key: "fair", title: "基礎待補強", msg: "你已經寫到一部分重點，但關鍵得分點缺漏較多。建議先對照參考答案，把缺的步驟逐項補寫，再整題重寫。" },
    { min: 0, key: "low", title: "建議先回頭複習", msg: "目前命中的得分點很少。建議先閱讀參考答案與相關教材，理解整體的推導或論述架構，隔天不看答案重寫一次。" }
  ];
  function essayLevel(pct) {
    for (var i = 0; i < LEVELS.length; i++) if (pct >= LEVELS[i].min - 1e-9) return LEVELS[i];
    return LEVELS[LEVELS.length - 1];
  }
  function nonSpaceLen(t) { return String(t == null ? "" : t).replace(/\s/g, "").length; }
  var STRUCT_RE = /(^|\n)\s*([0-9\uff10-\uff19]+[.\u3001)\uff09]|\([0-9\u4e00-\u4e5d]+\)|\uff08[0-9\u4e00-\u4e5d]+\uff09|[\u4e00-\u4e5d]\u3001)|\u9996\u5148|\u5176\u6b21|\u7b2c\u4e00|\u7b2c\u4e8c|\u7b2c\u4e09|\u6700\u5f8c|\u7d9c\u4e0a|\u7e3d\u7d50|\u5c0f\u7d50/;

  /**
   * 單一小題的意見與建議。st = { text, scores, auto }（scores 為學生確認後的各細目分數，auto 為系統初判）。
   * 全部以規則產生：依得分點的得失、篇幅（相對參考答案）、是否寫出推導、分點結構，以及自評與初判的落差。
   */
  function buildPartFeedback(part, st) {
    st = st || {};
    var scores = st.scores || {}, auto = st.auto || {};
    var earned = sumPartScores(part, scores), pct = part.points ? earned / part.points : 0;
    var strengths = [], gaps = [];
    (part.rubric || []).forEach(function (r, idx) {
      var v = Math.min(Math.max(Number(scores[r.id]) || 0, 0), r.points), lost = r.points - v;
      if (lost <= 1e-9) strengths.push({ id: r.id, label: r.label, topic: r.topic || r.label });
      else gaps.push({ id: r.id, idx: idx, label: r.label, topic: r.topic || r.label, kind: r.kind || "concept", advice: r.advice || "", lost: lost, points: r.points, status: v <= 0 ? "miss" : "partial" });
    });
    gaps.sort(function (a, b) { return b.lost - a.lost || a.idx - b.idx; });

    var form = [], text = String(st.text || ""), chars = nonSpaceLen(text), modelLen = nonSpaceLen(stripHtml(part.model_answer));
    if (modelLen && chars) {
      var ratio = chars / modelLen;
      if (ratio < 0.3) form.push("篇幅偏短（約為參考答案的 " + Math.round(ratio * 100) + "%）。每個得分點至少要有一句完整的說明，只寫結論或關鍵字不容易拿到分。");
      else if (ratio > 1.8) form.push("篇幅偏長（約為參考答案的 " + Math.round(ratio * 100) + "%）。考場時間有限，建議刪掉重複的敘述，把時間留給還沒寫到的得分點。");
    }
    var kinds = (part.rubric || []).map(function (r) { return r.kind || "concept"; });
    var nFormula = kinds.filter(function (k) { return k === "formula"; }).length;
    if (nFormula && chars >= 10 && (text.match(/[=\uff1d]/g) || []).length < 2)
      form.push("這是計算推導題，但你的答案裡幾乎沒有等式。只寫結論很難拿到過程分，請把每一步的式子寫出來。");
    if (kinds.length - nFormula >= kinds.length / 2 && chars >= 150 && !STRUCT_RE.test(text))
      form.push("答案是一整段文字。建議用編號或「首先、其次、最後」分點，閱卷者比較容易逐項對照得分點。");

    var autoSum = 0, hasAuto = false;
    (part.rubric || []).forEach(function (r) { if (auto[r.id] != null) { hasAuto = true; autoSum += Number(auto[r.id]) || 0; } });
    var calibration = null;
    if (hasAuto) {
      var diff = earned - autoSum;
      if (diff >= 2) calibration = "你自評的分數比系統初判高 " + (Math.round(diff * 2) / 2) + " 分。請再確認那些得分點是否真的寫出機制或推導，而不只是提到名詞；自評偏鬆是練習時最常見的盲點。";
      else if (diff <= -2) calibration = "你自評的分數比系統初判低 " + (Math.round(-diff * 2) / 2) + " 分。可能是系統誤判（只比對到關鍵字），也可能是你比較嚴格；保守沒有問題，但請確認有沒有低估自己。";
    }
    return { earned: earned, possible: part.points, pct: pct, level: essayLevel(pct), strengths: strengths, gaps: gaps, form: form, calibration: calibration, chars: chars };
  }

  /**
   * 整題的意見與建議。states = { partId: { graded, text, scores, auto } }，只統計已評分的小題。
   */
  function buildEssayFeedback(essay, states) {
    states = states || {};
    var parts = [], earned = 0, possible = 0, ungraded = [], allGaps = [], lostByKind = {};
    essay.parts.forEach(function (p) {
      var st = states[p.id];
      if (!st || !st.graded) { ungraded.push(p.label); return; }
      var fb = buildPartFeedback(p, st);
      parts.push({ id: p.id, label: p.label, fb: fb });
      earned += fb.earned; possible += p.points;
      fb.gaps.forEach(function (g) {
        allGaps.push({ partId: p.id, partLabel: p.label, id: g.id, label: g.label, topic: g.topic, kind: g.kind, advice: g.advice, lost: g.lost, status: g.status });
        lostByKind[g.kind] = (lostByKind[g.kind] || 0) + g.lost;
      });
    });
    allGaps.sort(function (a, b) { return b.lost - a.lost; });
    var pct = possible ? earned / possible : 0;
    var kindTips = Object.keys(lostByKind).sort(function (a, b) { return lostByKind[b] - lostByKind[a]; })
      .filter(function (k) { return KIND_TIPS[k]; }).map(function (k) { return { kind: k, tip: KIND_TIPS[k] }; });
    var time = essay.parts.map(function (p) { return { label: p.label, points: p.points, minutes: Math.max(1, Math.round(p.points / essay.points * 30)) }; });
    return { earned: earned, possible: possible, pct: pct, level: possible ? essayLevel(pct) : null, parts: parts, ungraded: ungraded, priorities: allGaps.slice(0, 3), kindTips: kindTips, time: time };
  }

  /**
   * 跨次練習：統計最近 N 次申論題作答中「常漏的得分點」。
   * attempt.res = { "partId:rubricId": 1（拿滿分）或 0（有失分） }
   */
  function aggregateWeak(attempts, essaysById, opts) {
    opts = opts || {};
    var recent = (attempts || []).slice(-(opts.recent || 30)), acc = {};
    recent.forEach(function (a) {
      var e = essaysById[a.id]; if (!e || !a.res) return;
      Object.keys(a.res).forEach(function (k) {
        var key = a.id + "|" + k, x = acc[key] || (acc[key] = { essayId: a.id, key: k, seen: 0, missed: 0 });
        x.seen++; if (!a.res[k]) x.missed++;
      });
    });
    var out = [];
    Object.keys(acc).forEach(function (key) {
      var x = acc[key], e = essaysById[x.essayId], pr = x.key.split(":"), part = null, r = null;
      e.parts.forEach(function (p) { if (p.id === pr[0]) { part = p; (p.rubric || []).forEach(function (q) { if (q.id === pr[1]) r = q; }); } });
      if (!r || !x.missed) return;
      out.push({ essayId: x.essayId, partLabel: part.label, rid: r.id, label: r.label, topic: r.topic || r.label, advice: r.advice || "", missed: x.missed, seen: x.seen });
    });
    out.sort(function (a, b) { return b.missed - a.missed || (b.missed / b.seen) - (a.missed / a.seen); });
    return out.slice(0, opts.limit || 5);
  }

  var api = { shuffle: shuffle, buildPool: buildPool, drawQueue: drawQueue, grade: grade, summarize: summarize, validateBank: validateBank,
    stripHtml: stripHtml, normalizeText: normalizeText, gradeEssayPart: gradeEssayPart, sumPartScores: sumPartScores, summarizeEssay: summarizeEssay, validateEssays: validateEssays,
    essayLevel: essayLevel, buildPartFeedback: buildPartFeedback, buildEssayFeedback: buildEssayFeedback, aggregateWeak: aggregateWeak };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MoexCore = api;
})(typeof window !== "undefined" ? window : this);
