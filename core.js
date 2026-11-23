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
      if (f.category && (q.categories || []).indexOf(f.category) < 0) return false;
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

  /**
   * 從作答文字抽出所有數字（計算題的數值比對用）。
   * 處理全形數字、千分位逗號（2,876.5）、負號，以及數字後接「萬／億」的寫法
   * （1,006 萬 會同時產生 1006 與 10060000 兩個候選值，讓不同單位寫法都能比對）。
   */
  function extractNumbers(s) {
    s = String(s == null ? "" : s);
    try { s = s.normalize("NFKC"); } catch (e) {}
    s = s.replace(/\u2212|\u2010|\u2011|\u2013|\u2014/g, "-");
    var prev;
    do { prev = s; s = s.replace(/(\d),(\d{3})(?!\d)/g, "$1$2"); } while (s !== prev);
    var out = [], re = /(\d+(?:\.\d+)?)\s*(億|萬)?/g, m;
    while ((m = re.exec(s))) {
      var v = parseFloat(m[1]);
      if (!isFinite(v)) continue;
      out.push(v);
      if (m[2] === "萬") out.push(v * 1e4);
      else if (m[2] === "億") out.push(v * 1e8);
    }
    return out;
  }

  /** 數值規格 { v: 目標值, tol: 相對容許誤差（預設 0.002 = 0.2%）, abs: 絕對容許誤差（選填）}；以絕對值比對，忽略正負號寫法。 */
  function numMatches(spec, nums) {
    var target = Math.abs(spec.v), tol = typeof spec.tol === "number" ? spec.tol : 0.002, ab = spec.abs || 0;
    var lim = Math.max(target * tol, ab);
    for (var i = 0; i < nums.length; i++) if (Math.abs(Math.abs(nums[i]) - target) <= lim + 1e-12) return true;
    return false;
  }

  function safeRegex(src) { try { return new RegExp(src); } catch (e) { return null; } }

  /**
   * 字數計算。unit 為 "word"（英文單字數）或 "char"（不含空白與換行的字元數，中日文用）。
   * 沒指定時依內容判斷：拉丁字母多於 CJK 字元就算單字，否則算字元。
   */
  function countUnits(text, unit) {
    var t = String(text == null ? "" : text);
    if (!unit) unit = ((t.match(/[A-Za-z]/g) || []).length > (t.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length) ? "word" : "char";
    if (unit === "word") return { n: (t.match(/[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g) || []).length, unit: "word" };
    return { n: t.replace(/\s/g, "").length, unit: "char" };
  }

  /** 作答語言是否符合小題要求（lang: "zh"／"ja"／"en"）。符合或無法判斷回傳 null，否則回傳提醒文字。 */
  function langWarning(lang, text) {
    var t = String(text == null ? "" : text), han = (t.match(/[\u3400-\u9fff]/g) || []).length, kana = (t.match(/[\u3040-\u30ff]/g) || []).length, lat = (t.match(/[A-Za-z]/g) || []).length;
    if (han + kana + lat < 20) return null;
    if (lang === "en" && lat < (han + kana) * 2) return "這小題要用英文作答，但你的答案中文字偏多。請確認是否依題目要求使用英文。";
    if (lang === "ja" && kana < Math.max(5, han * 0.15)) return "這小題要用日文作答，但答案中的假名很少，可能寫成中文或只有漢字。請確認是否依題目要求使用日文（助詞、動詞語尾要用假名）。";
    if (lang === "zh" && (kana > han * 0.2 || lat > han)) return "這小題要用中文（本國文字）作答，但你的答案中日文假名或英文偏多。專門名詞可保留原文，其餘請用中文。";
    return null;
  }

  /**
   * 對單一小題做「評分細目」關鍵字初判。
   * 每個細目有 patterns（正規表示式字串，對正規化後的文字比對）與 min（至少需符合幾條，預設 1）。
   * 符合條數 >= min 得滿分；有符合但不足 min 則按比例給分（每 0.5 分進位到最近的 0.5）。
   * 這只是初判，最後分數由學生對照參考答案自行確認。
   */
  function gradeEssayPart(part, text) {
    var t = normalizeText(text), nums = extractNumbers(text);
    var items = (part.rubric || []).map(function (r) {
      var need = r.min || 1, matched = 0;
      (r.patterns || []).forEach(function (src) { var re = safeRegex(src); if (re && re.test(t)) matched++; });
      (r.nums || []).forEach(function (spec) { if (numMatches(spec, nums)) matched++; });
      var ratio = Math.min(1, matched / need);
      var earned = Math.min(r.points, roundHalf(r.points * ratio));
      var status = matched >= need ? "ok" : (matched > 0 ? "part" : "miss");
      return { id: r.id, points: r.points, earned: earned, matched: matched, need: need, status: status };
    });
    // 有字數下限的題目（作文）：字數不到建議下限的一半時，初判分數按字數比例調降，避免幾個關鍵字就拿高分
    var scale = 1;
    if (part.limit && part.limit.min) { var cu = countUnits(text, part.limit.unit).n, halfMin = part.limit.min * 0.5; if (cu < halfMin) scale = cu / halfMin; }
    if (scale < 1) items.forEach(function (x) { x.earned = roundHalf(x.earned * scale); });
    var earned = items.reduce(function (a, x) { return a + x.earned; }, 0);
    var possible = items.reduce(function (a, x) { return a + x.points; }, 0);
    return { items: items, earned: earned, possible: possible, scale: scale, chars: String(text || "").replace(/\s/g, "").length };
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
          var np = (r.patterns || []).length, nn = (r.nums || []).length;
          if (!np && !nn) errs.push(pp + "評分細目 " + r.id + " 缺少 patterns 或 nums");
          else (r.patterns || []).forEach(function (src) { if (!safeRegex(src)) errs.push(pp + "評分細目 " + r.id + " 的 pattern 不合法：" + src); });
          (r.nums || []).forEach(function (sp) { if (!sp || typeof sp.v !== "number" || !isFinite(sp.v)) errs.push(pp + "評分細目 " + r.id + " 的 nums 需為 { v: 數字 }"); });
          if (r.min && (r.min < 1 || r.min > np + nn)) errs.push(pp + "評分細目 " + r.id + " 的 min 超出 patterns 與 nums 的總數");
        });
        if (Math.abs(rs - pt.points) > 1e-9) errs.push(pp + "評分細目配分合計 " + rs + " 不等於小題配分 " + pt.points);
      });
      if (Math.abs(ps - q.points) > 1e-9) errs.push(p + "小題配分合計 " + ps + " 不等於全題配分 " + q.points);
    });
    return errs;
  }

  /* ================= 依作答結果給意見與建議（規則式，不需後端） ================= */

  var FAST_SEC = 15;   // 低於此秒數答錯，視為「可能看太快」
  var PACE_SEC = 72;   // 正式考試步調：每題約 72 秒
  var NEG_RE = /不正確|錯誤|除外|不包括|不包含|不屬於|並非|何者為非|何者不|不是|不得|不能|不會|無關|有誤/;
  var LETTERS = "ABCDEFGH";

  function pct(x) { return Math.round(x * 100); }
  function clip(s, n) { s = stripHtml(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
  function acceptOf(q) { return (q.accept && q.accept.length) ? q.accept : [q.answer]; }
  function optLabel(q, L) {
    var i = LETTERS.indexOf(L);
    return i >= 0 && q.options && q.options[i] != null ? L + "（" + clip(q.options[i], 26) + "）" : L;
  }
  function rateText(o) { return o.ok + "/" + o.n + "，" + pct(o.ok / o.n) + "%"; }

  /** 依 keyFn 分組統計答對率。records: [{id,status}]；filterFn 可選。 */
  function groupStats(records, byId, keyFn, filterFn) {
    var out = {};
    (records || []).forEach(function (r) {
      var q = byId[r.id]; if (!q || (filterFn && !filterFn(q, r))) return;
      var keys = keyFn(q); if (!Array.isArray(keys)) keys = [keys];
      keys.forEach(function (k) {
        if (!k) return;
        var o = out[k] || (out[k] = { ok: 0, n: 0 });
        o.n++; if (r.status === "ok") o.ok++;
      });
    });
    return out;
  }
  function tagKeys(q) { return q.tags && q.tags.length ? q.tags : []; }

  /**
   * 單題回饋。q 題目；r 本題結果 {chosen,status,sec,timeout,gift}；
   * ctx: { prev:{bad,last}|null（本次作答前的錯題紀錄）, tagBefore:{ tag:{ok,n} }（本次作答前的考點統計）, pace }
   * 回傳 [{kind:"good"|"warn"|"tip", text}]
   */
  function feedbackQuestion(q, r, ctx) {
    ctx = ctx || {};
    var out = [], pace = ctx.pace || PACE_SEC, sec = typeof r.sec === "number" ? r.sec : null;
    var prev = ctx.prev || null, prevBad = prev ? (prev.bad || 0) : 0, prevWrong = prev && prev.last !== "ok" && prevBad > 0;
    var tb = ctx.tagBefore || {};
    var weakTag = null;
    (q.tags || []).forEach(function (t) {
      var o = tb[t];
      if (o && o.n >= 3 && o.ok / o.n < 0.6 && (!weakTag || o.ok / o.n < tb[weakTag].ok / tb[weakTag].n)) weakTag = t;
    });
    var neg = NEG_RE.exec(stripHtml(q.question));
    function add(kind, text) { out.push({ kind: kind, text: text }); }

    if (r.gift) {
      add("tip", "本題考選部公告一律給分，不代表你的觀念正確。請讀詳解確認自己是否真的會。");
      return out;
    }
    if (r.status === "ok") {
      if (prevWrong) add("good", "這題你之前答錯過 " + prevBad + " 次，這次答對，代表這個觀念補起來了，已從錯題本移除。過幾天再做一次，確認是真的記住而不是剛看過。");
      else if (sec != null && sec <= FAST_SEC) add("good", "只用 " + sec + " 秒就答對，這個觀念你已經很熟。");
      else add("good", "觀念正確。可以先跳過詳解，把時間留給弱項。");
      if (sec != null && sec > pace) add("warn", "雖然答對，但花了 " + sec + " 秒，超過正式考試約 " + pace + " 秒一題的步調。這類題目在考場上會壓縮後面題目的時間，建議練到 " + pace + " 秒內。");
      if (weakTag) add("tip", "考點「" + weakTag + "」累計答對率只有 " + pct(tb[weakTag].ok / tb[weakTag].n) + "%（" + rateText(tb[weakTag]) + "），整體仍是弱項，這題答對不代表已經穩定，建議再多練幾題。");
      return out;
    }
    if (r.status === "bad") {
      add("warn", "你選 " + optLabel(q, r.chosen) + "，正確答案是 " + acceptOf(q).map(function (L) { return optLabel(q, L); }).join(" 或 ") + "。請先看詳解弄清楚「為什麼自己選的不成立」，再看正確答案為何成立。");
      if (neg) add("tip", "題幹含有「" + neg[0] + "」這類否定字眼，這是常見的失分原因：請確認自己是在找「不對」的選項，下次先圈出否定詞再作答。");
      if (sec != null && sec <= FAST_SEC) add("tip", "你只用了 " + sec + " 秒就作答，可能沒有讀完題幹或每個選項。建議每題至少把四個選項都看過一遍。");
      else if (sec != null && sec > pace) add("tip", "花了 " + sec + " 秒仍然答錯，代表這個觀念本身還不穩，不只是粗心。建議回頭讀對應章節，而不是只背答案。");
      if (prevBad >= 1) add("warn", "這是你第 " + (prevBad + 1) + " 次答錯這一題，通常表示對這個觀念有固定的誤解。請用自己的話寫出「正確答案為什麼對、我選的為什麼錯」。");
      if (weakTag) add("tip", "考點「" + weakTag + "」累計答對率 " + pct(tb[weakTag].ok / tb[weakTag].n) + "%（" + rateText(tb[weakTag]) + "），是你目前的弱項。可以到設定畫面選「依考點練習」集中練。");
      return out;
    }
    // skip
    if (r.timeout) add("warn", "時間到仍未作答。若常發生，表示這類題目讀題或計算太慢，可先跳過難題、最後再回頭。");
    else add("warn", "這題你選擇略過。本系統答錯不倒扣（正式考試請以當次試題須知為準），不確定時先刪去明顯錯誤的選項再選，通常比空白划算。");
    add("tip", "正確答案是 " + acceptOf(q).map(function (L) { return optLabel(q, L); }).join(" 或 ") + "。請讀詳解，並把這題加進複習清單（系統已自動放進錯題本）。");
    if (weakTag) add("tip", "考點「" + weakTag + "」累計答對率 " + pct(tb[weakTag].ok / tb[weakTag].n) + "%，建議集中練習。");
    return out;
  }

  function levelOf(acc, n) {
    var lv, head;
    if (acc >= 0.85) { lv = "excellent"; head = "表現優秀，這一輪幾乎都掌握了。"; }
    else if (acc >= 0.7) { lv = "good"; head = "表現良好，再補強幾個弱點就能更穩。"; }
    else if (acc >= 0.5) { lv = "fair"; head = "及格邊緣，有幾個觀念需要回頭補強。"; }
    else { lv = "weak"; head = "目前基礎還不穩，建議先讀教材與詳解，再做題目驗證。"; }
    if (n < 5) head += "（題數少於 5 題，僅供參考。）";
    return { level: lv, headline: head };
  }
  function worstTags(stats, minN, maxRate, limit) {
    return Object.keys(stats).map(function (t) { return { tag: t, ok: stats[t].ok, n: stats[t].n, rate: stats[t].ok / stats[t].n }; })
      .filter(function (x) { return x.n >= minN && x.rate < maxRate; })
      .sort(function (a, b) { return a.rate - b.rate || b.n - a.n; }).slice(0, limit);
  }
  function stuckCount(wrongMap, byId, subject) {
    return Object.keys(wrongMap || {}).filter(function (id) { var q = byId[id]; return q && (!subject || q.subject === subject) && wrongMap[id].last !== "ok"; }).length;
  }

  /**
   * 一輪練習的整體回饋。info: { byId, queue, results, summary, prior（本輪之前的 records）, wrongMap, subject }
   * 回傳 { level, headline, points:[{kind,text}], actions:[{type:"tag"|"wrong", tag, label}] } 或 null
   */
  function feedbackSession(info) {
    var sm = info.summary, byId = info.byId, queue = info.queue, results = info.results;
    if (!sm || !sm.total) return null;
    var lv = levelOf(sm.accuracy, sm.total), pts = [], actions = [];
    function add(kind, text) { pts.push({ kind: kind, text: text }); }

    // 進步 / 退步（與同科過去累計比較）
    var prior = (info.prior || []).filter(function (x) { return byId[x.id] && byId[x.id].subject === info.subject; });
    if (prior.length >= 10) {
      var pa = prior.filter(function (x) { return x.status === "ok"; }).length / prior.length, d = sm.accuracy - pa;
      if (d >= 0.08) add("good", "這一輪答對率 " + pct(sm.accuracy) + "%，比你這個科目過去累計的 " + pct(pa) + "% 進步了 " + pct(d) + " 個百分點，努力有效果。");
      else if (d <= -0.08) add("tip", "這一輪答對率 " + pct(sm.accuracy) + "%，低於你過去累計的 " + pct(pa) + "%。可能是這輪題目較難或集中在弱項；看下方考點分析找出原因。");
    }
    // 之前錯、這次對
    var rec = queue.filter(function (id) { return results[id] && results[id].recovered; }).length;
    if (rec) add("good", "有 " + rec + " 題是之前答錯、這次答對的，已從錯題本移除。");

    // 穩定的考點
    var strong = sm.weak.filter(function (w) { return w.rate === 1 && w.n >= 2 && w.tag !== "未分類"; }).slice(-3).reverse();
    if (strong.length) add("good", "已經穩定的考點：" + strong.map(function (w) { return w.tag + "（" + w.ok + "/" + w.n + "）"; }).join("、") + "。這些可以降低複習頻率。");

    // 弱項考點
    var weak = sm.weak.filter(function (w) { return w.rate < 0.5 && w.tag !== "未分類"; }).slice(0, 3);
    if (weak.length) {
      add("warn", "需要加強的考點：" + weak.map(function (w) { return w.tag + "（" + w.ok + "/" + w.n + "）"; }).join("、") + "。先讀這些題目的詳解，再用「依考點練習」集中做。");
      weak.slice(0, 2).forEach(function (w) { actions.push({ type: "tag", tag: w.tag, label: "集中練「" + w.tag + "」" }); });
    }
    // 章節層級
    var ar = worstTags(groupStats(queue.map(function (id) { return { id: id, status: results[id].status }; }), byId, function (q) { return q.area; }), 3, 0.5, 1);
    if (ar.length) add("warn", "「" + ar[0].tag + "」這個章節整體只答對 " + ar[0].ok + "/" + ar[0].n + "，不只是單一考點的問題，建議回到這個章節系統複習一次。");

    // 未答與逾時
    var timeouts = queue.filter(function (id) { return results[id].timeout; }).length;
    if (sm.skip && sm.skip / sm.total >= 0.15) add("warn", "有 " + sm.skip + " 題（" + pct(sm.skip / sm.total) + "%）沒作答" + (timeouts ? "，其中 " + timeouts + " 題是時間到" : "") + "。答錯不倒扣的話，空白一定得 0 分；不確定時先排除明顯錯誤選項再猜。");
    else if (timeouts) add("tip", "有 " + timeouts + " 題因時間到而未答，可練習先跳過太費時的題目。");

    // 作答速度
    var secs = queue.filter(function (id) { return results[id].status !== "skip" && typeof results[id].sec === "number"; }).map(function (id) { return results[id].sec; });
    var bad = queue.filter(function (id) { return results[id].status === "bad"; });
    var fastWrong = bad.filter(function (id) { return typeof results[id].sec === "number" && results[id].sec <= FAST_SEC; }).length;
    if (fastWrong >= 2 && fastWrong / bad.length >= 0.4) add("warn", "答錯的題目中有 " + fastWrong + " 題是在 " + FAST_SEC + " 秒內答的，可能讀題太快。放慢一點、把每個選項都看完，常能多拿幾分。");
    if (secs.length >= 5) {
      var avg = Math.round(secs.reduce(function (a, b) { return a + b; }, 0) / secs.length);
      if (avg > PACE_SEC) add("warn", "平均每題 " + avg + " 秒，高於正式考試約 " + PACE_SEC + " 秒的步調。可以用「每題 72 秒」的計時模式練習時間分配。");
    }
    // 否定字眼
    var negMiss = bad.filter(function (id) { return NEG_RE.test(stripHtml(byId[id].question)); }).length;
    if (negMiss >= 2) add("tip", "答錯的題目中有 " + negMiss + " 題的題幹含「錯誤、除外、不包括」等否定字眼。作答時先圈出否定詞，確認是在找對的還是不對的選項。");
    // 反覆錯題
    var rep = queue.filter(function (id) { return results[id].status !== "ok" && info.wrongMap && info.wrongMap[id] && info.wrongMap[id].bad >= 2; }).length;
    if (rep) add("warn", "有 " + rep + " 題是你累計答錯 2 次以上的題目。反覆錯同一題多半是觀念有誤解，建議逐題用自己的話解釋正確答案，再用「錯題重練」驗證。");
    // 選項偏好
    var ans = queue.filter(function (id) { return results[id].chosen; }), cnt = {};
    ans.forEach(function (id) { cnt[results[id].chosen] = (cnt[results[id].chosen] || 0) + 1; });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    if (ans.length >= 12 && top && cnt[top] / ans.length >= 0.55) add("tip", "你有 " + pct(cnt[top] / ans.length) + "% 的答案都選 " + top + "。不確定時如果習慣固定選同一個選項，建議改用排除法。");

    // 行動建議
    var sc = stuckCount(info.wrongMap, byId, info.subject);
    if (sc) actions.push({ type: "wrong", label: "錯題重練（" + sc + " 題）" });
    if (!pts.length) add("good", "這一輪沒有明顯的問題，繼續保持，可以拉高題數或縮短每題時間增加難度。");
    return { level: lv.level, headline: lv.headline, points: pts, actions: actions };
  }

  /**
   * 依累計紀錄給某一科目的學習建議。records: [{id,status,ts}]
   * 回傳 { enough:false, n } 或 { enough:true, n, accuracy, level, headline, points, actions }
   */
  function feedbackOverall(records, byId, wrongMap, subject) {
    var recs = (records || []).filter(function (r) { return byId[r.id] && byId[r.id].subject === subject; });
    if (recs.length < 5) return { enough: false, n: recs.length };
    var ok = recs.filter(function (r) { return r.status === "ok"; }).length, acc = ok / recs.length, lv = levelOf(acc, recs.length);
    var pts = [], actions = [];
    function add(kind, text) { pts.push({ kind: kind, text: text }); }
    var tags = groupStats(recs, byId, tagKeys), areas = groupStats(recs, byId, function (q) { return q.area; });

    // 涵蓋率
    var total = 0, seen = {};
    Object.keys(byId).forEach(function (id) { if (byId[id].subject === subject) total++; });
    recs.forEach(function (r) { seen[r.id] = 1; });
    var cover = Object.keys(seen).length / total;
    if (total >= 20 && cover < 0.5) add("tip", "這個科目的 " + total + " 題中你只練過 " + Object.keys(seen).length + " 題（" + pct(cover) + "%）。結果還不能代表整體實力，建議把沒做過的題目也練過。");
    // 趨勢
    if (recs.length >= 40) {
      var a = recs.slice(-20), b = recs.slice(-40, -20);
      var ra = a.filter(function (r) { return r.status === "ok"; }).length / 20, rb = b.filter(function (r) { return r.status === "ok"; }).length / 20;
      if (ra - rb >= 0.1) add("good", "最近 20 題答對率 " + pct(ra) + "%，比再前 20 題的 " + pct(rb) + "% 進步，目前的複習方式有效。");
      else if (rb - ra >= 0.1) add("warn", "最近 20 題答對率 " + pct(ra) + "%，比再前 20 題的 " + pct(rb) + "% 下滑。是否太久沒複習，或最近練的是比較弱的考點？");
    }
    var strong = Object.keys(tags).map(function (t) { return { tag: t, ok: tags[t].ok, n: tags[t].n, rate: tags[t].ok / tags[t].n }; })
      .filter(function (x) { return x.n >= 3 && x.rate >= 0.85; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 3);
    if (strong.length) add("good", "掌握較好的考點：" + strong.map(function (x) { return x.tag + "（" + x.ok + "/" + x.n + "）"; }).join("、") + "。");
    var weak = worstTags(tags, 3, 0.6, 3);
    if (weak.length) {
      add("warn", "最需要加強的考點（至少作答 3 題）：" + weak.map(function (x) { return x.tag + "（" + x.ok + "/" + x.n + "，" + pct(x.rate) + "%）"; }).join("、") + "。");
      weak.slice(0, 2).forEach(function (x) { actions.push({ type: "tag", tag: x.tag, label: "集中練「" + x.tag + "」" }); });
    }
    var wa = worstTags(areas, 5, 0.6, 1);
    if (wa.length) add("warn", "章節層面較弱的是「" + wa[0].tag + "」（" + wa[0].ok + "/" + wa[0].n + "，" + pct(wa[0].rate) + "%），建議整章重讀而不是只做題。");
    var sc = stuckCount(wrongMap, byId, subject);
    if (sc) { add("tip", "錯題本還有 " + sc + " 題最近一次沒答對。錯題重練答對一次就會移除，累積太多會增加壓力，建議每週清一次。"); actions.push({ type: "wrong", label: "錯題重練（" + sc + " 題）" }); }
    if (!weak.length && !sc) add("good", "目前沒有明顯弱項。可以擴大年度範圍或縮短每題時間，增加練習難度。");
    return { enough: true, n: recs.length, accuracy: acc, level: lv.level, headline: lv.headline, points: pts, actions: actions };
  }

  /**
   * 申論題單一小題的意見。st: { text, auto:{rid:n}, scores:{rid:n} }（scores 為學生確認後的分數）
   * 回傳 { earned, possible, ratio, points:[{kind,text}] }
   */
  function feedbackEssayPart(part, st) {
    var auto = st.auto || {}, sc = st.scores || {}, pts = [], earned = 0;
    var items = (part.rubric || []).map(function (r) {
      var c = Math.min(Math.max(Number(sc[r.id]) || 0, 0), r.points); earned += c;
      return { r: r, got: c, auto: Math.min(Number(auto[r.id]) || 0, r.points) };
    });
    var ratio = part.points ? earned / part.points : 0;
    function add(kind, text) { pts.push({ kind: kind, text: text }); }
    var chars = String(st.text || "").replace(/\s/g, "").length;
    var miss = items.filter(function (x) { return x.got <= 0; }), partial = items.filter(function (x) { return x.got > 0 && x.got < x.r.points; });

    if (ratio >= 0.9) add("good", "這小題得分點幾乎都有寫到，結構完整。");
    else if (ratio === 0) add("warn", "所有得分點都沒有得分，可能答題方向偏了。請先仔細讀參考答案，弄懂解題架構後，隔天重寫一次。");
    else if (ratio < 0.5) add("warn", "得分不到一半，主要的得分點還沒寫到，建議先照參考答案的步驟整理出解題架構，再重寫。");
    if (miss.length && ratio > 0) add("warn", "完全沒得分的得分點：" + miss.slice(0, 4).map(function (x) { return "「" + x.r.label + "」"; }).join("、") + (miss.length > 4 ? " 等 " + miss.length + " 項" : "") + "。");
    if (partial.length) add("tip", "只拿到部分分數：" + partial.slice(0, 4).map(function (x) { return "「" + x.r.label + "」（" + x.got + "/" + x.r.points + "）"; }).join("、") + "。通常是推導步驟不完整，或只寫結論／名詞沒有說明。閱卷看的是過程，建議把關鍵步驟寫出來。");
    var hints = miss.concat(partial).filter(function (x) { return x.r.hint; }).slice(0, 2);
    hints.forEach(function (x) { add("tip", "「" + x.r.label + "」提示：" + x.r.hint); });
    var raised = items.filter(function (x) { return x.got > x.auto + 0.25 && x.auto <= 0; });
    if (raised.length) add("tip", "你把 " + raised.slice(0, 3).map(function (x) { return "「" + x.r.label + "」"; }).join("、") + " 的分數調高，但系統沒偵測到對應寫法。請再確認答案裡真的有明確寫出，閱卷看的是紙上有寫的內容，不是心裡想到的。");
    if (part.calc && (miss.length || partial.length)) add("tip", "這是計算題：系統比對的是關鍵數值與列式。若你的數值只差在四捨五入（例如 24.5 與 24.51），可以手動把該細目調回應得的分數；正式閱卷看列式與過程，列式正確但計算失誤通常仍可得部分分數，所以每一步都要寫出算式，不要只寫答案。");
    if (part.figure && ratio < 0.9 && !/橫軸|縱軸|x軸|y軸|曲線|左移|右移|向左|向右|移動/i.test(String(st.text || ""))) add("tip", "這小題要求繪圖，但你的文字裡沒有說明橫軸、縱軸、曲線與移動方向。正式考試圖形佔不少分數：請先標明兩軸，畫出各曲線與起始均衡點，再用箭頭標示哪條曲線移動、新均衡在哪裡。");
    if (part.numeric && ratio < 0.9 && (String(st.text || "").match(/\d+/g) || []).length < 2) add("tip", "這小題是計算題，但你的答案幾乎沒有數字。請寫出每一步的算式與數字結果（如 MR = MC、均衡產量、利潤、消費者剩餘），只寫文字說明會拿不到計算分。");
    if (part.numeric && ratio > 0 && ratio < 0.9 && miss.length && (String(st.text || "").match(/\d+/g) || []).length >= 2) add("tip", "你有寫出數字，但有些得分點的結果沒對上。請從第一步（反應函數或 MR = MC）開始逐步對照參考答案，找出第一個算錯的地方，後面的錯誤通常都是連鎖影響。");
    var minChars = typeof part.minChars === "number" ? part.minChars : part.points * 12;
    if (chars < minChars && ratio < 0.7 && !part.limit) add("tip", "你只寫了約 " + chars + " 字，以這小題 " + part.points + " 分來說偏少（僅供參考）。申論題常因為推導省略、說明太簡而失分。");
    if (part.lang) { var lw = langWarning(part.lang, st.text); if (lw) add("warn", lw); }
    if (part.limit && String(st.text || "").trim()) {
      var lc = countUnits(st.text, part.limit.unit), un = lc.unit === "word" ? "個單字" : "字", lim = part.limit;
      if (lim.max && lc.n > lim.max) add("warn", "字數 " + lc.n + " " + un + "，超過上限 " + lim.max + " " + un + "。正式考試超過字數限制可能被扣分，請刪減次要的句子，保留論點與例子。");
      else if (lim.min && lc.n < lim.min) add(lc.n < lim.min * 0.5 ? "warn" : "tip", "字數 " + lc.n + " " + un + "，低於建議的 " + lim.min + " " + un + "。內容較少時，容易缺論點、例子或結論，可再補充具體例子與建議。" + (lc.n < lim.min * 0.5 ? "（字數不到建議下限的一半，系統初判分數已按字數比例調降。）" : ""));
      else if (lim.max) add("good", "字數 " + lc.n + " " + un + "，在要求範圍內（" + (lim.min ? lim.min + "～" : "") + lim.max + " " + un + "）。");
    }
    if (part.law && ratio < 0.9) {
      var nt = normalizeText(st.text || "");
      var cited = function (n) { var m = String(n).split("-"); return (m[1] ? new RegExp(m[0] + "(\u689d\u4e4b|\u4e4b|-)" + m[1]) : new RegExp("(\u7b2c|\u00a7)" + m[0] + "(?!\\d)|" + m[0] + "\u689d")).test(nt); };
      var noCite = (part.statutes || []).filter(function (n) { if (n && typeof n === "object") { var re = safeRegex(n.pattern); return !(re && re.test(nt)); } return !cited(n); });
      if (noCite.length) add("tip", "法律題要照「條文 → 要件 → 涵攝（套入題目事實）→ 結論」寫。你的答案沒有明確引用：" + noCite.slice(0, 5).map(function (n) { if (n && typeof n === "object") return n.label; return "民法第 " + String(n).replace("-", " 條之 ") + (String(n).indexOf("-") < 0 ? " 條" : ""); }).join("、") + "。閱卷時條文是基本得分點，請寫出條號與關鍵要件。");
      if (!/\u6709\u7406\u7531|\u7121\u7406\u7531|\u5f97\u8acb\u6c42|\u4e0d\u5f97\u8acb\u6c42|\u7121\u6548|\u6709\u6548|\u4e0d\u6210\u7acb|\u6210\u7acb|\u4e0d\u5f97\u4e3b\u5f35|\u5f97\u4e3b\u5f35|\u4e0d\u751f\u6548\u529b|\u61c9\u8ca0|\u4e0d\u8ca0|\u6709\u4f9d\u64da|\u7121\u4f9d\u64da|\u6709\u6b0a|\u7121\u6b0a/.test(nt)) add("tip", "沒有看到明確結論。法律題最後一定要回答題目問的問題（例如「有理由／無理由」「得請求／不得請求」「有效／無效」），並說明是依哪個條文與事實得出。");
      if (items.some(function (x) { return x.got <= 0; }) && chars >= part.points * 12 && !/\u6d89\u651b|\u56e0\u6b64|\u6545|\u672c\u984c|\u984c\u610f|\u7532|\u4e59|\u4e19|\u4e01/.test(String(st.text || ""))) add("tip", "你的答案偏向背誦法條，較少套用題目事實（人名與情節）。法律題的涵攝（把事實套進要件）通常是得分關鍵。");
    }
    if (part.pitfalls && (miss.length || partial.length)) add("tip", "常見錯誤提醒：" + String(part.pitfalls).replace(/^常見錯誤[：:]\s*/, ""));
    return { earned: earned, possible: part.points, ratio: ratio, points: pts };
  }

  /** 整題申論題的總評。partStates: { partId: st }（只含已評分的小題） */
  function feedbackEssay(essay, partStates) {
    var done = essay.parts.filter(function (p) { return partStates[p.id]; });
    if (!done.length) return null;
    var earned = 0, possible = 0, lost = [], pts = [];
    done.forEach(function (p) {
      var f = feedbackEssayPart(p, partStates[p.id]); earned += f.earned; possible += p.points;
      (p.rubric || []).forEach(function (r) {
        var c = Math.min(Math.max(Number((partStates[p.id].scores || {})[r.id]) || 0, 0), r.points);
        if (c < r.points) lost.push({ part: p.label, label: r.label, lost: r.points - c });
      });
    });
    var ratio = earned / possible, lv = levelOf(ratio, 99);
    function add(kind, text) { pts.push({ kind: kind, text: text }); }
    lost.sort(function (a, b) { return b.lost - a.lost; });
    if (lost.length) add("warn", "失分最多的得分點：" + lost.slice(0, 3).map(function (x) { return x.part + "「" + x.label + "」（失 " + x.lost + " 分）"; }).join("、") + "。優先補這幾項，投資報酬率最高。");
    else add("good", "已評的小題全部拿滿分。");
    if (done.length < essay.parts.length) add("tip", "還有 " + (essay.parts.length - done.length) + " 個小題尚未評分，總分不包含它們。正式考試時整題一起寫完，建議全部練完。");
    return { earned: earned, possible: possible, level: lv.level, headline: lv.headline.replace("這一輪", "這題"), points: pts };
  }

  var api = { shuffle: shuffle, buildPool: buildPool, drawQueue: drawQueue, grade: grade, summarize: summarize, validateBank: validateBank,
    stripHtml: stripHtml, countUnits: countUnits, langWarning: langWarning, normalizeText: normalizeText, extractNumbers: extractNumbers, numMatches: numMatches, gradeEssayPart: gradeEssayPart, sumPartScores: sumPartScores, summarizeEssay: summarizeEssay, validateEssays: validateEssays,
    groupStats: groupStats, feedbackQuestion: feedbackQuestion, feedbackSession: feedbackSession, feedbackOverall: feedbackOverall, feedbackEssayPart: feedbackEssayPart, feedbackEssay: feedbackEssay };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MoexCore = api;
})(typeof window !== "undefined" ? window : this);
