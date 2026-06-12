/* story_schema.js —— 《星野灯線》故事資料契約規則 + 關係分析（唯讀、共用）
 *
 * 單一規則來源：CLI（validate_story.js）與瀏覽器 inspector（story_inspector.js）都用本檔，
 * 避免規則分裂。純函式、零副作用：不讀檔、不寫檔、不碰 DOM、不依賴 Node API、不 mutate 輸入。
 *
 * 匯出：
 *   validateGame(H, ART) → { issues:[{level,file,loc,msg,rule}], seDisabledRefs, infos, declaredFlags,
 *                            dayCount, names, endingsStatus, judgeStatus }
 *   analyzeRelations(H)  → { flags, gates, choices, scoreDeltas, judge }（給 inspector 關係視圖）
 *
 * UMD：Node 走 module.exports；瀏覽器掛在 window.StorySchema。
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StorySchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCORE_KEYS = ["affection", "distance", "awareness", "regret"];
  const COND_IDENTS = new Set([...SCORE_KEYS, "warmth"]);
  const MOODS = new Set(["night", "warm", "rain", "stop", "store"]);
  const SPEEDS = new Set(["normal", "slow", "instant"]);
  const NODE_TYPES = new Set(["scene", "line", "choice", "gate"]);
  const REQUIRED_TONES = ["warm_true", "quiet_normal", "bitter", "hidden_pov"];
  const SUSPICIOUS_TEXT = /affection|distance|awareness|regret|warmth|\bscore\b|\bdebug\b|debug mode|開發者模式/i;

  // cond 引用解析（顯示與分析共用）
  function condRefs(cond) {
    cond = String(cond == null ? "" : cond).trim();
    const flags = [], scores = [];
    if (/^!?flag:/.test(cond)) { flags.push(cond.replace(/^!?flag:/, "").trim()); return { flags, scores }; }
    (cond.match(/[A-Za-z_]\w*/g) || []).forEach((id) => {
      if (COND_IDENTS.has(id)) scores.push(id);
      else if (id !== "true" && id !== "false") flags.push(id);
    });
    return { flags: [...new Set(flags)], scores: [...new Set(scores)] };
  }

  function judgeTonesAndFlags(M) {
    const out = { tones: [], flags: [] };
    if (!M || typeof M.judge !== "function") return out;
    const src = M.judge.toString();
    out.tones = [...new Set((src.match(/return\s+["'](\w+)["']/g) || []).map((s) => s.replace(/return\s+["']|["']/g, "")))];
    out.flags = [...new Set(
      (src.match(/flags\.(\w+)/g) || []).map((s) => s.slice(6))
        .concat((src.match(/flags\[["'](\w+)["']\]/g) || []).map((s) => s.replace(/flags\[["']|["']\]/g, "")))
    )];
    return out;
  }

  function validateGame(H, ART) {
    ART = ART || {};
    const issues = [];
    const seDisabledRefs = [];
    const declaredFlags = new Set();
    const add = (level, file, loc, msg, rule) => issues.push({ level, file, loc, msg, rule });
    const err = (f, l, m, r) => add("ERROR", f, l, m, r);
    const warn = (f, l, m, r) => add("WARN", f, l, m, r);

    let endingsStatus = null, judgeStatus = null;
    const result = () => {
      const distinct = [...new Set(seDisabledRefs)].sort();
      const infos = seDisabledRefs.length
        ? [`音效(se) 全域關閉（assets.enabled.se=false）→ ${seDisabledRefs.length} 個 se 參考僅有視覺脈衝（Phase 0 預期）。distinct keys(${distinct.length}): ${distinct.join(", ")}`]
        : [];
      return {
        issues, seDisabledRefs, infos,
        declaredFlags: [...declaredFlags].sort(),
        dayCount: (H && H.meta && H.meta.dayCount) || 0,
        names: H && H.meta ? Object.keys(H.meta.names || {}) : [],
        endingsStatus: endingsStatus || [],
        judgeStatus: judgeStatus || { tones: [], flags: [] },
      };
    };

    if (!H || !H.meta) { err("data/meta.js", "-", "window.HOSHINO.meta 未建立，無法繼續", "meta-missing"); return result(); }
    const M = H.meta, days = H.days || {}, chapters = H.chapters || {}, endings = H.endings || {}, assets = H.assets || {};
    const names = new Set(Object.keys(M.names || {}));
    const dayCount = M.dayCount || 0;

    const cgResolvable = (key) => {
      const cg = (assets && assets.cg) || {};
      return Object.prototype.hasOwnProperty.call(cg, key) || Object.prototype.hasOwnProperty.call(ART, key);
    };
    const checkScoreKeys = (obj, file, loc, label, rule) => {
      if (typeof obj !== "object") { err(file, loc, `${label} 必須是物件`, rule); return; }
      for (const k of Object.keys(obj)) if (!SCORE_KEYS.includes(k)) err(file, loc, `${label} key "${k}" 不在允許分數 {${SCORE_KEYS.join(",")}}`, rule);
    };
    const checkCond = (cond, file, loc) => {
      const c = cond.trim();
      if (c.startsWith("flag:") || c.startsWith("!flag:")) {
        const name = c.replace(/^!?flag:/, "").trim();
        if (!declaredFlags.has(name)) warn(file, loc, `gate.cond 引用未被任何 set/flag 定義的 flag "${name}"（可能 unreachable）`, "gate-cond-flag-undefined");
        return;
      }
      const idents = c.match(/[A-Za-z_]\w*/g) || [];
      for (const id of idents) {
        if (COND_IDENTS.has(id)) continue;
        if (id === "true" || id === "false") continue;
        if (declaredFlags.has(id)) { warn(file, loc, `gate.cond 直接用裸 flag "${id}"（engine 只在 cond 以 "flag:" 開頭時才當 flag；此處會被當變數，恐 evalCond 失敗）`, "gate-cond-bare-flag"); continue; }
        warn(file, loc, `gate.cond 含未知識別字 "${id}"（合法分數變數：${[...COND_IDENTS].join(",")}）`, "gate-cond-unknown-ident");
      }
    };

    const collectFlags = (nodes) => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        if (n.set && typeof n.set === "object") Object.keys(n.set).forEach((k) => declaredFlags.add(k));
        if (n.type === "choice" && Array.isArray(n.options)) {
          for (const op of n.options) {
            if (op && op.flag && typeof op.flag === "object") Object.keys(op.flag).forEach((k) => declaredFlags.add(k));
            if (op && Array.isArray(op.reaction)) collectFlags(op.reaction);
          }
        }
        if (n.type === "gate") { collectFlags(n.then); collectFlags(n.else); }
      }
    };

    const checkNode = (node, file, loc) => {
      if (!node || typeof node !== "object") { err(file, loc, "node 不是物件", "node-not-object"); return; }
      if (!node.type) { err(file, loc, "node 缺少 type", "node-no-type"); return; }
      if (!NODE_TYPES.has(node.type)) { warn(file, loc, `未知 node type "${node.type}"（engine 會忽略）`, "node-unknown-type"); return; }

      if (node.type === "scene") {
        if (node.mood != null && !MOODS.has(node.mood)) err(file, loc, `scene.mood "${node.mood}" 不在合法清單 {${[...MOODS].join(",")}}`, "scene-mood");
      }

      if (node.type === "line") {
        const who = node.who || "narration";
        if (who !== "narration" && (node.text == null || String(node.text).trim() === "")) warn(file, loc, `line.who="${who}" 但 text 空`, "line-text-empty");
        if (node.who != null && !names.has(node.who)) warn(file, loc, `line.who "${node.who}" 不在 M.names`, "line-who");
        if (node.speed != null && !SPEEDS.has(node.speed)) err(file, loc, `line.speed "${node.speed}" 不合法（normal/slow/instant）`, "line-speed");
        if (node.bgm != null && node.bgm !== "" && !MOODS.has(node.bgm)) err(file, loc, `line.bgm "${node.bgm}" 不是合法 mood`, "line-bgm");
        if (node.cg != null && node.cg !== "clear" && !cgResolvable(node.cg)) warn(file, loc, `line.cg "${node.cg}" 無 assets.cg 真圖、也無 ART fallback`, "line-cg");
        if (node.se != null) {
          if (assets.enabled && assets.enabled.se) {
            const se = assets.se || {};
            if (!Object.prototype.hasOwnProperty.call(se, node.se)) warn(file, loc, `line.se "${node.se}" 但 assets.se 無對應音檔（音效已啟用卻缺檔）`, "line-se");
          } else seDisabledRefs.push(node.se);
        }
        if (node.add) checkScoreKeys(node.add, file, loc, "line.add", "line-add-score-key");
        if (node.text != null && SUSPICIOUS_TEXT.test(String(node.text))) warn(file, loc, "line.text 含疑似 debug/分數字樣（玩家 UI 不應顯示分數）", "line-text-suspicious");
      }

      if (node.type === "choice") {
        if (!Array.isArray(node.options) || node.options.length < 2) {
          err(file, loc, `choice.options 必須存在且 ≥2（目前 ${Array.isArray(node.options) ? node.options.length : "缺"}）`, "choice-options");
        } else {
          node.options.forEach((op, j) => {
            const ol = `${loc}.opt[${j}]`;
            if (!op || typeof op !== "object") { err(file, ol, "option 不是物件", "choice-option-not-object"); return; }
            if (op.label == null || String(op.label).trim() === "") err(file, ol, "option 缺 label", "choice-option-label");
            if (op.add) checkScoreKeys(op.add, file, ol, "option.add", "choice-option-add-score-key");
            if (op.reaction != null) {
              if (!Array.isArray(op.reaction)) err(file, ol, "option.reaction 必須是 node 陣列", "choice-reaction-type");
              else op.reaction.forEach((rn, k) => checkNode(rn, file, `${ol}.reaction[${k}]`));
            }
          });
        }
      }

      if (node.type === "gate") {
        if (node.cond == null || String(node.cond).trim() === "") err(file, loc, "gate 缺 cond", "gate-cond-missing");
        else checkCond(String(node.cond), file, loc);
        if (!Array.isArray(node.then)) err(file, loc, "gate.then 必須是 node 陣列", "gate-then-type");
        else { if (node.then.length === 0) warn(file, loc, "gate.then 為空陣列（空分支）", "gate-then-empty"); node.then.forEach((tn, k) => checkNode(tn, file, `${loc}.then[${k}]`)); }
        if (node.else != null) {
          if (!Array.isArray(node.else)) err(file, loc, "gate.else 若存在必須是 node 陣列", "gate-else-type");
          else { if (node.else.length === 0) warn(file, loc, "gate.else 為空陣列（空分支）", "gate-else-empty"); node.else.forEach((en, k) => checkNode(en, file, `${loc}.else[${k}]`)); }
        }
      }
    };

    for (let d = 1; d <= dayCount; d++) {
      collectFlags(days[d]);
      if (chapters[d]) { collectFlags(chapters[d].intro); collectFlags(chapters[d].outro); }
    }
    Object.keys(endings).forEach((k) => collectFlags(endings[k]));

    if (!dayCount) err("data/meta.js", "-", "M.dayCount 缺或為 0", "day-count");
    for (let d = 1; d <= dayCount; d++) {
      const info = M.days && M.days[d];
      if (!info) err("data/meta.js", `days[${d}]`, `M.days 缺少第 ${d} 天`, "day-meta-missing");
      else {
        if (!info.title || String(info.title).trim() === "") err("data/meta.js", `days[${d}]`, "day.title 不可空", "day-title-empty");
        if (info.subtitle == null || String(info.subtitle).trim() === "") warn("data/meta.js", `days[${d}]`, "day.subtitle 空", "day-subtitle-empty");
      }
      if (!Array.isArray(days[d])) err(`data/day${d}.js`, `days[${d}]`, `H.days 缺少第 ${d} 天（或非陣列）`, "day-array-missing");
      const ch = chapters[d];
      if (ch) {
        if (ch.intro != null && !Array.isArray(ch.intro)) err("data/chapters.js", `chapters[${d}].intro`, "intro 必須是陣列", "chapter-intro-type");
        if (ch.outro != null && !Array.isArray(ch.outro)) err("data/chapters.js", `chapters[${d}].outro`, "outro 必須是陣列", "chapter-outro-type");
      }
    }

    for (let d = 1; d <= dayCount; d++) {
      if (Array.isArray(days[d])) days[d].forEach((n, i) => checkNode(n, `data/day${d}.js`, `node[${i}]`));
      const ch = chapters[d];
      if (ch) {
        if (Array.isArray(ch.intro)) ch.intro.forEach((n, i) => checkNode(n, "data/chapters.js", `[${d}].intro[${i}]`));
        if (Array.isArray(ch.outro)) ch.outro.forEach((n, i) => checkNode(n, "data/chapters.js", `[${d}].outro[${i}]`));
      }
    }
    Object.keys(endings).forEach((k) => {
      if (Array.isArray(endings[k])) endings[k].forEach((n, i) => checkNode(n, "data/endings.js", `${k}[${i}]`));
    });

    const endingMeta = M.endingMeta || {};
    for (const tone of REQUIRED_TONES) if (!endingMeta[tone]) err("data/meta.js", "endingMeta", `缺少必備結局 tone "${tone}"`, "ending-required-missing");
    const toneSet = [...new Set([...REQUIRED_TONES, ...Object.keys(endingMeta)])];
    endingsStatus = toneSet.map((tone) => {
      const m = endingMeta[tone];
      const badge = m && m.badge;
      const badgeResolvable = !!(badge && (Object.prototype.hasOwnProperty.call(ART, badge) || (assets.cg || {})[badge]));
      let hasPlayback, deps = null;
      if (tone === "hidden_pov") {
        const w = Array.isArray(endings.warm_true), t = Array.isArray(endings.hidden_pov_tail);
        hasPlayback = w && t; deps = { warm_true: w, hidden_pov_tail: t };
      } else hasPlayback = Array.isArray(endings[tone]);
      return { tone, inMeta: !!m, required: REQUIRED_TONES.includes(tone), title: m && m.title, badge, badgeResolvable, hasPlayback, deps };
    });
    for (const st of endingsStatus) {
      if (st.inMeta && !st.badgeResolvable) warn("data/meta.js", `endingMeta.${st.tone}`, `badge "${st.badge}" 無法由 ART 或 assets 解析`, "ending-badge");
      if (!st.inMeta) continue;
      if (st.tone === "hidden_pov") {
        if (!st.deps.warm_true) err("data/endings.js", "hidden_pov", "hidden_pov 依賴 endings.warm_true，但其不存在", "ending-hidden-dep");
        if (!st.deps.hidden_pov_tail) err("data/endings.js", "hidden_pov", "hidden_pov 依賴 endings.hidden_pov_tail，但其不存在", "ending-hidden-dep");
      } else if (!st.hasPlayback) {
        err("data/endings.js", st.tone, `endingMeta 有 "${st.tone}" 但 endings 無對應演出陣列`, "ending-playback-missing");
      }
    }

    if (typeof M.judge === "function") {
      judgeStatus = judgeTonesAndFlags(M);
      judgeStatus.tones.forEach((t) => { if (!endingMeta[t]) err("data/meta.js", "judge()", `judge 可能回傳 "${t}" 但 endingMeta 無此 tone`, "judge-tone"); });
      judgeStatus.flags.forEach((f) => { if (!declaredFlags.has(f)) warn("data/meta.js", "judge()", `judge 依賴 flag "${f}"，但無任何 node set 過它（該結局恐不可達）`, "judge-flag"); });
    } else {
      judgeStatus = { tones: [], flags: [] };
      err("data/meta.js", "judge", "M.judge 不是函式", "judge-not-fn");
    }

    return result();
  }

  // ---- 關係分析（唯讀；給 inspector 的 QA 關係視圖）----
  function analyzeRelations(H) {
    const empty = { flags: [], gates: [], choices: [], scoreDeltas: [], judge: { tones: [], flags: [] } };
    if (!H || !H.meta) return empty;
    const M = H.meta, days = H.days || {}, chapters = H.chapters || {}, endings = H.endings || {};
    const dayCount = M.dayCount || 0;
    const flagSet = {}, flagRead = {}, choices = [], gates = [], scoreDeltas = [];
    const push = (map, name, ref) => { (map[name] = map[name] || []).push(ref); };

    const walk = (nodes, file, locOf) => { if (Array.isArray(nodes)) nodes.forEach((n, i) => visit(n, file, locOf(i))); };
    function visit(n, file, loc) {
      if (!n || typeof n !== "object") return;
      if (n.set && typeof n.set === "object") Object.keys(n.set).forEach((k) => push(flagSet, k, { file, loc }));
      if (n.add && typeof n.add === "object") Object.keys(n.add).forEach((k) => scoreDeltas.push({ file, loc, key: k, delta: n.add[k], via: "line" }));
      if (n.type === "choice") {
        const opts = (n.options || []).map((op, j) => {
          const ol = `${loc}.opt[${j}]`;
          const setFlags = op && op.flag ? Object.keys(op.flag) : [];
          setFlags.forEach((k) => push(flagSet, k, { file, loc: ol }));
          const addScores = op && op.add ? Object.keys(op.add).map((k) => ({ key: k, delta: op.add[k] })) : [];
          addScores.forEach((s) => scoreDeltas.push({ file, loc: ol, key: s.key, delta: s.delta, via: "choice" }));
          if (op && Array.isArray(op.reaction)) walk(op.reaction, file, (k) => `${ol}.reaction[${k}]`);
          return { loc: ol, label: op && op.label, setFlags, addScores };
        });
        choices.push({ file, loc, id: n.id, prompt: n.prompt, optionCount: (n.options || []).length, options: opts });
      }
      if (n.type === "gate") {
        const refs = condRefs(n.cond);
        refs.flags.forEach((f) => push(flagRead, f, { file, loc }));
        gates.push({
          file, loc, cond: n.cond, flags: refs.flags, scores: refs.scores,
          thenLen: Array.isArray(n.then) ? n.then.length : null,
          elseLen: n.else == null ? undefined : (Array.isArray(n.else) ? n.else.length : null),
        });
        walk(n.then, file, (k) => `${loc}.then[${k}]`);
        walk(n.else, file, (k) => `${loc}.else[${k}]`);
      }
    }

    for (let d = 1; d <= dayCount; d++) {
      walk(days[d], `data/day${d}.js`, (i) => `node[${i}]`);
      const ch = chapters[d];
      if (ch) { walk(ch.intro, "data/chapters.js", (i) => `[${d}].intro[${i}]`); walk(ch.outro, "data/chapters.js", (i) => `[${d}].outro[${i}]`); }
    }
    Object.keys(endings).forEach((k) => walk(endings[k], "data/endings.js", (i) => `${k}[${i}]`));

    const judge = judgeTonesAndFlags(M);
    const allFlags = [...new Set([...Object.keys(flagSet), ...Object.keys(flagRead), ...judge.flags])].sort();
    const flags = allFlags.map((name) => {
      const setBy = flagSet[name] || [], readBy = flagRead[name] || [];
      const usedInJudge = judge.flags.includes(name);
      const status = !setBy.length ? "undefined-read" : (!readBy.length && !usedInJudge ? "unused" : "ok");
      return { name, setBy, readBy, usedInJudge, status };
    });
    gates.forEach((g) => {
      const c = String(g.cond || "").trim();
      const flagOnly = /^!?flag:/.test(c);
      const negated = /^!flag:/.test(c);
      const undefinedFlag = flagOnly && g.scores.length === 0 && g.flags.some((f) => !(flagSet[f] && flagSet[f].length));
      // 引擎 evalCond：flag:未定義 → 恆假（then 不可達）；!flag:未定義 → !undefined===true 恆真（else 不可達）
      g.neverTrue = undefinedFlag && !negated;
      g.alwaysTrue = undefinedFlag && negated;
    });
    return { flags, gates, choices, scoreDeltas, judge };
  }

  return { validateGame, analyzeRelations, condRefs, SCORE_KEYS, COND_IDENTS: [...COND_IDENTS], MOODS: [...MOODS], SPEEDS: [...SPEEDS], NODE_TYPES: [...NODE_TYPES], REQUIRED_TONES };
});
