/* story_inspector.js —— 《星野灯線》Read-only Story QA Inspector（0-G）
 *
 * 唯讀：只讀 window.HOSHINO / window.ART（本頁 <script> 載入的故事資料），呼叫共用規則
 * StorySchema.validateGame / analyzeRelations，把資料結構、關係、驗證結果「畫出來」。
 * 絕不寫檔、不改 runtime、不 mutate 載入物件、不提供任何編輯/匯出功能。
 */
(function () {
  "use strict";
  const H = window.HOSHINO || null;
  const ART = window.ART || {};
  const SS = window.StorySchema;
  const root = document.getElementById("app") || document.body;
  if (!SS) { root.textContent = "錯誤：story_schema.js 未載入。"; return; }
  if (!H || !H.meta) { root.textContent = "錯誤：window.HOSHINO.meta 未載入（請從 tools/ 以相對路徑開啟本頁）。"; return; }

  // 不可變性快照（載入後不得 mutate）
  const snap = (o) => JSON.stringify(o, (k, v) => (typeof v === "function" ? "fn:" + v.toString() : v));
  const BEFORE = snap(H);
  const BEFORE_ART = snap(ART);

  const R = SS.validateGame(H, ART);
  const REL = SS.analyzeRelations(H);
  const judgeFlags = new Set(REL.judge.flags);
  const M = H.meta, days = H.days || {}, chapters = H.chapters || {}, endings = H.endings || {};
  const dayCount = M.dayCount || 0;

  const errCount = R.issues.filter((i) => i.level === "ERROR").length;
  const warnCount = R.issues.filter((i) => i.level === "WARN").length;
  const infoCount = R.infos.length;
  const pass = errCount === 0;

  // ---- 0-I：Edit Preview v2（可編 meta.days[d].title/subtitle + chapters[d].intro/outro 文字；只動內部 clone）----
  let editMode = false, draft = null, clonedART = null, draftValidated = null;
  let editedMeta = false, editedChapters = false, editOnlyModified = false, showDiff = false;
  function buildDraft() {
    draft = JSON.parse(JSON.stringify(H, (k, v) => (typeof v === "function" ? undefined : v))); // 深 clone 資料
    if (H.meta && typeof H.meta.judge === "function") draft.meta.judge = H.meta.judge;            // 函式 reattach（不 mutate 原物件）
    clonedART = Object.assign({}, ART);                                                            // 另一個物件；函式 ref 共享但只讀
    draftValidated = null; editedMeta = false; editedChapters = false; editOnlyModified = false; showDiff = false;
  }
  // 草稿 vs 原始 H 的 diff（只比對可編文字欄位；非文字 node 不會出現）
  function computeDiff() {
    const out = [];
    if (!draft) return out;
    const dc = (H.meta && H.meta.dayCount) || 0;
    for (let d = 1; d <= dc; d++) {
      const od = (H.meta.days || {})[d] || {}, nd = ((draft.meta && draft.meta.days) || {})[d] || {};
      if ((od.title || "") !== (nd.title || "")) out.push({ file: "meta.js", path: `meta.days[${d}].title`, orig: od.title || "", draftVal: nd.title || "" });
      if ((od.subtitle || "") !== (nd.subtitle || "")) out.push({ file: "meta.js", path: `meta.days[${d}].subtitle`, orig: od.subtitle || "", draftVal: nd.subtitle || "" });
      const oc = (H.chapters || {})[d] || {}, nc = (draft.chapters || {})[d] || {};
      ["intro", "outro"].forEach((kind) => {
        const oa = Array.isArray(oc[kind]) ? oc[kind] : [], na = Array.isArray(nc[kind]) ? nc[kind] : [];
        na.forEach((n, i) => { const o = oa[i]; if (n && typeof n.text === "string" && o && typeof o.text === "string" && o.text !== n.text) out.push({ file: "chapters.js", path: `chapters[${d}].${kind}[${i}].text`, orig: o.text, draftVal: n.text }); });
      });
      const oda = Array.isArray((H.days || {})[d]) ? H.days[d] : [], nda = Array.isArray((draft.days || {})[d]) ? draft.days[d] : [];
      nda.forEach((n, i) => { const o = oda[i]; if (n && typeof n.text === "string" && o && typeof o.text === "string" && o.text !== n.text) out.push({ file: `day${d}.js`, path: `days[${d}][${i}].text`, orig: o.text, draftVal: n.text }); });
    }
    return out;
  }
  function renderDiff() {
    const diffs = computeDiff();
    const box = el("div", "diff-box");
    box.appendChild(el("div", "er-head", `變更 Diff：${diffs.length} 處（僅列已改文字欄位。可在 Validate 前查看；Export 仍需 Validate 通過）`));
    if (!diffs.length) { box.appendChild(el("div", "sub", "（尚無變更）")); return box; }
    diffs.forEach((d) => {
      const r = el("div", "diff-row");
      r.appendChild(el("div", "diff-path", d.path));
      r.appendChild(el("div", "diff-src", "來源：play/data/" + d.file));
      const o = el("div", "diff-old"); o.appendChild(el("span", "tag", "原")); o.appendChild(document.createTextNode(" " + d.orig)); r.appendChild(o);
      const n = el("div", "diff-new"); n.appendChild(el("span", "tag", "新")); n.appendChild(document.createTextNode(" " + d.draftVal)); r.appendChild(n);
      box.appendChild(r);
    });
    return box;
  }
  function ensureDraftDay(d) { if (!draft.meta.days) draft.meta.days = {}; if (!draft.meta.days[d]) draft.meta.days[d] = {}; }
  function diffLabel(p) {
    let m;
    if ((m = p.match(/meta\.days\[(\d+)\]\.(title|subtitle)/))) return `Day${m[1]} ${m[2]}`;
    if ((m = p.match(/chapters\[(\d+)\]\.(intro|outro)\[(\d+)\]/))) return `Day${m[1]} ${m[2]}[${m[3]}]`;
    if ((m = p.match(/days\[(\d+)\]\[(\d+)\]/))) return `line #${m[2]}`;
    return p;
  }
  // Apply Assistant：把 diff 依「檔案」分組，每檔給可貼回的 patch（meta/chapters 全段、dayN 只列改動行）。不寫檔。
  function buildPatches() {
    const diffs = computeDiff();
    const byFile = {};
    diffs.forEach((d) => { (byFile[d.file] = byFile[d.file] || []).push(d); });
    const patches = [];
    if (byFile["meta.js"]) patches.push({ file: "play/data/meta.js", shortFile: "meta.js", items: byFile["meta.js"].map((d) => diffLabel(d.path)), text: "// 替換 meta 物件裡的 days:\ndays: " + JSON.stringify(draft.meta.days, null, 2) + "," });
    if (byFile["chapters.js"]) patches.push({ file: "play/data/chapters.js", shortFile: "chapters.js", items: byFile["chapters.js"].map((d) => diffLabel(d.path)), text: "// 替換整個 window.HOSHINO.chapters = {...};\nwindow.HOSHINO.chapters = " + JSON.stringify(draft.chapters, null, 2) + ";" });
    Object.keys(byFile).filter((f) => /^day\d+\.js$/.test(f)).sort((a, b) => parseInt(a.slice(3)) - parseInt(b.slice(3))).forEach((f) => {
      const lines = byFile[f].map((x) => { const m = x.path.match(/days\[(\d+)\]\[(\d+)\]/); return `window.HOSHINO.days[${m[1]}][${m[2]}].text = ${JSON.stringify(x.draftVal)};`; });
      patches.push({ file: "play/data/" + f, shortFile: f, items: byFile[f].map((d) => diffLabel(d.path)), text: "// 套用以下 text 修改（依 index 對應 node）\n" + lines.join("\n") });
    });
    return patches;
  }
  function changeSummary() {
    const c = { title: 0, subtitle: 0, intro: 0, outro: 0, "day text": 0 };
    computeDiff().forEach((d) => {
      if (/\.title$/.test(d.path)) c.title++;
      else if (/\.subtitle$/.test(d.path)) c.subtitle++;
      else if (/\.intro\[/.test(d.path)) c.intro++;
      else if (/\.outro\[/.test(d.path)) c.outro++;
      else if (/^days\[/.test(d.path)) c["day text"]++;
    });
    return c;
  }

  // ---- helpers ----
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const excerpt = (t, n = 64) => { t = String(t == null ? "" : t); return t.length > n ? t.slice(0, n) + "…" : t; };
  const kvChips = (obj, prefix) => Object.keys(obj || {}).map((k) => `${prefix}${k}${typeof obj[k] === "number" ? (obj[k] >= 0 ? "+" + obj[k] : obj[k]) : "=" + obj[k]}`);
  const issuesAt = (file, loc) => R.issues.filter((it) => it.file === file && it.loc === loc);
  const dayCounts = (d) => { const list = R.issues.filter((it) => it.file === `data/day${d}.js`); return { e: list.filter((i) => i.level === "ERROR").length, w: list.filter((i) => i.level === "WARN").length }; };
  const cardId = (file, loc) => "card_" + (file + "_" + loc).replace(/[^A-Za-z0-9]+/g, "_");
  const TOP_RE = /^(\[\d+\]\.(?:intro|outro)\[\d+\]|node\[\d+\]|[A-Za-z_]\w*\[\d+\])/;
  const topLoc = (loc) => { const m = String(loc).match(TOP_RE); return m ? m[0] : loc; };

  // ---- 導覽（key→button）----
  const navMap = {};
  function activate(key) { const b = navMap[key]; if (b) b.click(); }

  function attachIssues(card, file, loc) {
    const its = issuesAt(file, loc);
    if (!its.length) return;
    const box = el("div", "issues");
    its.forEach((it) => box.appendChild(el("div", "issue " + it.level.toLowerCase(), `[${it.level}] (${it.rule || "-"}) ${it.msg}`)));
    card.appendChild(box);
    card.classList.add("has-" + (its.some((i) => i.level === "ERROR") ? "error" : "warn"));
  }

  function renderNode(node, file, loc, depth, isTop) {
    const card = el("div", "node depth-" + (depth || 0));
    if (isTop) card.id = cardId(file, loc);
    if (!node || typeof node !== "object") { card.classList.add("bad"); card.appendChild(el("div", "nhead", `${loc} : (非物件 node)`)); attachIssues(card, file, loc); return card; }

    const head = el("div", "nhead");
    head.appendChild(el("span", "loc", loc));
    head.appendChild(el("span", "type t-" + (node.type || "none"), node.type || "no-type"));
    if (node.who) head.appendChild(el("span", "who", node.who));
    const txt = node.text != null ? node.text : (node.place != null || node.time != null ? [node.time, node.place].filter(Boolean).join(" / ") : (node.prompt != null ? "「" + node.prompt + "」" : ""));
    if (txt) head.appendChild(el("span", "txt", excerpt(txt)));
    card.appendChild(head);

    const chips = [];
    if (node.mood != null) chips.push(["", "mood:" + node.mood]);
    if (node.speed != null) chips.push(["", "speed:" + node.speed]);
    if (node.bgm != null) chips.push(["", "bgm:" + (node.bgm || "(維持)")]);
    if (node.cg != null) chips.push(["", "cg:" + node.cg]);
    if (node.se != null) chips.push(["", "se:" + node.se]);
    if (node.screen != null) chips.push(["", "screen:" + node.screen]);
    if (node.ui != null) chips.push(["", "ui:" + node.ui]);
    if (node.add) kvChips(node.add, "+score ").forEach((c) => chips.push(["hot", c]));
    if (node.set) Object.keys(node.set).forEach((k) => chips.push([judgeFlags.has(k) ? "hot end" : "hot", "set " + k + "=" + node.set[k] + (judgeFlags.has(k) ? " →judge" : "")]));
    if (chips.length) { const cr = el("div", "chips"); chips.forEach(([c, t]) => cr.appendChild(el("span", "chip " + c, t))); card.appendChild(cr); }

    if (node.type === "choice" && Array.isArray(node.options)) {
      const det = el("details", "expand");
      det.appendChild(el("summary", null, `options ×${node.options.length}` + (node.id ? `　id:${node.id}` : "") + (node.prompt ? `　prompt：${excerpt(node.prompt, 40)}` : "")));
      node.options.forEach((op, j) => {
        const ol = `${loc}.opt[${j}]`;
        const obox = el("div", "opt");
        const oh = el("div", "ohead");
        oh.appendChild(el("span", "loc", `opt[${j}]`));
        oh.appendChild(el("span", "label", op && op.label != null ? op.label : "(缺 label)"));
        if (op && op.add) kvChips(op.add, "+score ").forEach((c) => oh.appendChild(el("span", "chip hot", c)));
        if (op && op.flag) Object.keys(op.flag).forEach((k) => oh.appendChild(el("span", "chip " + (judgeFlags.has(k) ? "hot end" : "hot"), "flag " + k + "=" + op.flag[k] + (judgeFlags.has(k) ? " →judge" : ""))));
        obox.appendChild(oh);
        attachIssues(obox, file, ol);
        if (op && Array.isArray(op.reaction)) {
          const rwrap = el("div", "reaction");
          rwrap.appendChild(el("div", "sub", `reaction ×${op.reaction.length}`));
          op.reaction.forEach((rn, k) => rwrap.appendChild(renderNode(rn, file, `${ol}.reaction[${k}]`, (depth || 0) + 1)));
          obox.appendChild(rwrap);
        }
        det.appendChild(obox);
      });
      card.appendChild(det);
      card.appendChild(el("div", "out", "→ 選項分歧，reaction 播畢後匯合到下一個 node"));
    }

    if (node.type === "gate") {
      const det = el("details", "expand");
      det.appendChild(el("summary", null, `gate　cond：${excerpt(node.cond, 50)}`));
      const refs = SS.condRefs(node.cond);
      const meta = el("div", "gmeta");
      meta.appendChild(el("span", "chip", "cond: " + (node.cond || "(缺)")));
      refs.scores.forEach((s) => meta.appendChild(el("span", "chip", "score:" + s)));
      refs.flags.forEach((f) => meta.appendChild(el("span", "chip" + (R.declaredFlags.indexOf(f) < 0 ? " bad" : ""), "flag:" + f + (R.declaredFlags.indexOf(f) < 0 ? "(未定義)" : ""))));
      det.appendChild(meta);
      ["then", "else"].forEach((branch) => {
        const arr = node[branch];
        if (!Array.isArray(arr)) { if (branch === "then" || node[branch] != null) det.appendChild(el("div", "sub", `${branch}: (非陣列/缺)`)); return; }
        det.appendChild(el("div", "sub", `${branch} ×${arr.length}` + (arr.length === 0 ? "（空分支）" : "")));
        arr.forEach((bn, k) => det.appendChild(renderNode(bn, file, `${loc}.${branch}[${k}]`, (depth || 0) + 1)));
      });
      card.appendChild(det);
      const tl = Array.isArray(node.then) ? node.then.length : "?";
      const elc = node.else == null ? "—" : (Array.isArray(node.else) ? node.else.length : "?");
      card.appendChild(el("div", "out", `→ cond 真 → then(${tl})　/　cond 假 → else(${elc})`));
    }

    attachIssues(card, file, loc);
    return card;
  }

  // ---- 視圖：Day ----
  function renderDayView(d) {
    const v = el("div", "view");
    const info = (M.days && M.days[d]) || {};
    const h = el("div", "view-head");
    h.appendChild(el("h2", null, `Day ${d}　${info.title || "(無標題)"}`));
    if (info.subtitle) h.appendChild(el("div", "sub2", info.subtitle));
    const dc = dayCounts(d);
    h.appendChild(el("div", "counts", `nodes: ${Array.isArray(days[d]) ? days[d].length : "缺"}　|　errors: ${dc.e}　warnings: ${dc.w}`));
    v.appendChild(h);
    if (editMode) v.appendChild(renderEditPanel(d));
    const ch = chapters[d];
    if (ch && Array.isArray(ch.intro) && ch.intro.length) { v.appendChild(el("div", "band", `chapter intro ×${ch.intro.length}`)); ch.intro.forEach((n, i) => v.appendChild(renderNode(n, "data/chapters.js", `[${d}].intro[${i}]`, 0, true))); }
    v.appendChild(el("div", "band strong", `day${d} 主線 nodes`));
    if (Array.isArray(days[d])) days[d].forEach((n, i) => v.appendChild(renderNode(n, `data/day${d}.js`, `node[${i}]`, 0, true)));
    else v.appendChild(el("div", "issue error", "H.days 缺少此日或非陣列"));
    if (ch && Array.isArray(ch.outro) && ch.outro.length) { v.appendChild(el("div", "band", `chapter outro ×${ch.outro.length}`)); ch.outro.forEach((n, i) => v.appendChild(renderNode(n, "data/chapters.js", `[${d}].outro[${i}]`, 0, true))); }
    return v;
  }

  // ---- 0-I：編輯預覽面板（僅在 editMode 的 Day 視圖出現）----
  function fieldRow(label, value, onInput, multiline, extraCls) {
    const row = el("div", "edit-title-row");
    row.appendChild(el("label", null, label + "："));
    const base = multiline ? "edit-input edit-area" : "edit-input";
    const inp = el(multiline ? "textarea" : "input", base + (extraCls ? " " + extraCls : ""));
    if (!multiline) inp.type = "text"; else inp.rows = 2;
    inp.value = value == null ? "" : value;
    inp.oninput = () => onInput(inp.value);
    row.appendChild(inp);
    return row;
  }
  function renderEditPanel(d) {
    const p = el("div", "edit-panel");
    p.appendChild(el("div", "edit-banner", `編輯預覽模式：草稿只存在於 inspector 內部 clone，未動 window.HOSHINO / window.ART / 專案檔案。可編：meta.days[${d}].title / subtitle、chapters[${d}].intro/outro 的文字（其餘欄位唯讀）。`));
    ensureDraftDay(d);
    // meta.days 文字欄位
    p.appendChild(el("div", "edit-sec", `meta.days[${d}]（貼回 meta.js）`));
    p.appendChild(fieldRow(`Day ${d} title`, draft.meta.days[d].title, (val) => { draft.meta.days[d].title = val; editedMeta = true; }));
    p.appendChild(fieldRow(`Day ${d} subtitle`, draft.meta.days[d].subtitle, (val) => { draft.meta.days[d].subtitle = val; editedMeta = true; }));
    // chapters intro/outro 文字（逐項，只開放 line.text）
    const ch = (draft.chapters && draft.chapters[d]) || null;
    ["intro", "outro"].forEach((kind) => {
      const arr = ch && Array.isArray(ch[kind]) ? ch[kind] : null;
      p.appendChild(el("div", "edit-sec", `chapters[${d}].${kind}（貼回 chapters.js）` + (arr ? ` ×${arr.length}` : "（無）")));
      if (arr) arr.forEach((n, i) => {
        if (n && typeof n.text === "string") p.appendChild(fieldRow(`${kind}[${i}].text（${n.who || "narration"}）`, n.text, (val) => { n.text = val; editedChapters = true; }, true));
        else p.appendChild(el("div", "sub", `${kind}[${i}]：非文字節點（type:${(n && n.type) || "?"}）— 唯讀`));
      });
    });
    // day 主劇情 line.text（逐句；只開放 string text，其餘唯讀）
    const dayArr = Array.isArray(draft.days && draft.days[d]) ? draft.days[d] : null;
    const origArr = Array.isArray(days[d]) ? days[d] : null;
    p.appendChild(el("div", "edit-sec", `day${d} 主劇情 line.text（貼回 dayN.js）` + (dayArr ? ` ×${dayArr.length} nodes` : "（無）")));
    const tg = el("label", "tog");
    const tgi = el("input"); tgi.type = "checkbox"; tgi.checked = editOnlyModified;
    tgi.onchange = () => { editOnlyModified = tgi.checked; show(renderDayView(d)); };
    tg.appendChild(tgi); tg.appendChild(document.createTextNode(" 只看已修改"));
    p.appendChild(tg);
    if (dayArr) dayArr.forEach((n, i) => {
      const isText = n && typeof n.text === "string";
      const orig = origArr && origArr[i];
      const modified = isText && orig && typeof orig.text === "string" && n.text !== orig.text;
      if (editOnlyModified && !modified) return;
      if (isText) {
        const w = el("div", "line-edit" + (modified ? " modified" : ""));
        const head = el("div", "sub");
        head.appendChild(el("span", "loc", `node[${i}]`));
        head.appendChild(el("span", "who", n.who || "narration"));
        if (modified) head.appendChild(el("span", "mod-badge", "● 已修改"));
        w.appendChild(head);
        if (orig && typeof orig.text === "string") w.appendChild(el("div", "orig-prev", "原: " + (orig.text.length > 80 ? orig.text.slice(0, 80) + "…" : orig.text)));
        const ta = el("textarea", "edit-input edit-area edit-line"); ta.rows = 2; ta.value = n.text;
        ta.oninput = () => { n.text = ta.value; };  // 只改 clone
        w.appendChild(ta);
        p.appendChild(w);
      } else if (!editOnlyModified) {
        p.appendChild(el("div", "sub ro-node", `node[${i}]：非文字節點（type:${(n && n.type) || "?"}）— 唯讀`));
      }
    });
    p.appendChild(el("div", "sub", "編輯後可先「查看變更 Diff」對照原文；Export 仍需 Validate Draft 0 error 才開放。"));
    const dbtn = el("button", "ebtn diffbtn", showDiff ? "隱藏變更 Diff" : "查看變更 Diff");
    dbtn.onclick = () => { showDiff = !showDiff; show(renderDayView(d)); };
    p.appendChild(dbtn);
    const vbtn = el("button", "ebtn", "Validate Draft");
    vbtn.onclick = () => { draftValidated = SS.validateGame(draft, clonedART); show(renderDayView(d)); };
    p.appendChild(vbtn);
    if (showDiff) p.appendChild(renderDiff());
    if (draftValidated) {
      const errs = draftValidated.issues.filter((i) => i.level === "ERROR");
      const warns = draftValidated.issues.filter((i) => i.level === "WARN");
      const res = el("div", "edit-result " + (errs.length ? "bad" : "good"));
      res.appendChild(el("div", "er-head", `Validate Draft → errors ${errs.length} / warnings ${warns.length} / info ${draftValidated.infos.length}`));
      errs.slice(0, 80).forEach((it) => res.appendChild(el("div", "issue error", `[ERROR] (${it.rule || "-"}) ${it.file} ${it.loc} : ${it.msg}`)));
      warns.slice(0, 80).forEach((it) => res.appendChild(el("div", "issue warn", `[WARN] (${it.rule || "-"}) ${it.file} ${it.loc} : ${it.msg}`)));
      p.appendChild(res);
      if (errs.length) p.appendChild(el("div", "export-blocked", "✗ Validate 未通過：export / copy 已封鎖，請先修正 errors 再驗證。"));
      else p.appendChild(renderApplyAssistant());
    }
    return p;
  }
  // A+：Apply Assistant（Validate PASS 後）。只產生草稿、分檔複製；不寫檔、不 auto-apply。
  function renderApplyAssistant() {
    const box = el("div", "export-box");
    box.appendChild(el("div", "safety-banner", "本工具不會修改任何檔案；只產生套用草稿。請人工確認後再寫入。"));
    box.appendChild(el("div", "ok-banner", "✓ Draft Validated"));
    const patches = buildPatches();
    if (!patches.length) { box.appendChild(el("div", "sub", "（尚未編輯任何欄位）")); return box; }

    // A-3 Change Summary
    box.appendChild(el("div", "edit-sec", "變更數 Change Summary"));
    const cs = changeSummary();
    const st = el("table", "etable summary-tbl");
    ["title", "subtitle", "intro", "outro", "day text"].forEach((k) => { const tr = el("tr"); tr.appendChild(el("td", null, k)); tr.appendChild(el("td", cs[k] ? "ok" : null, String(cs[k]))); st.appendChild(tr); });
    box.appendChild(st);

    // A-1 需要更新清單 + A-2 分檔 Copy
    box.appendChild(el("div", "edit-sec", "需要更新（Apply Assistant）"));
    patches.forEach((pt, idx) => {
      const card = el("div", "apply-card");
      card.appendChild(el("div", "apply-file", `${idx + 1}. ${pt.file}`));
      const ul = el("div", "apply-items");
      pt.items.forEach((it) => ul.appendChild(el("div", "apply-item", "└ " + it)));
      card.appendChild(ul);
      const ta = el("textarea", "snippet"); ta.readOnly = true; ta.value = pt.text; ta.rows = Math.min(14, pt.text.split("\n").length + 1);
      const cp = el("button", "ebtn", `Copy ${pt.shortFile} Patch`);
      cp.onclick = () => { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} cp.textContent = ok ? "已複製 ✓" : "請手動選取複製"; setTimeout(() => (cp.textContent = `Copy ${pt.shortFile} Patch`), 1600); };
      card.appendChild(cp);
      card.appendChild(ta);
      box.appendChild(card);
    });
    return box;
  }

  // ---- 視圖：Endings ----
  function renderEndingView() {
    const v = el("div", "view");
    v.appendChild(el("h2", null, "結局 Endings"));
    v.appendChild(el("div", "sub2", `judge() 可能回傳 tone：${R.judgeStatus.tones.join(", ") || "(無)"}　|　judge 依賴 flag：${R.judgeStatus.flags.join(", ") || "(無)"}`));
    const tbl = el("table", "etable");
    const hr = el("tr"); ["tone", "必備", "title", "badge", "badge 可解析", "有演出"].forEach((t) => hr.appendChild(el("th", null, t))); tbl.appendChild(hr);
    R.endingsStatus.forEach((st) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, st.tone));
      tr.appendChild(el("td", null, st.required ? "✔" : ""));
      tr.appendChild(el("td", null, st.inMeta ? (st.title || "") : "(不在 endingMeta)"));
      tr.appendChild(el("td", null, st.badge || ""));
      tr.appendChild(el("td", st.badgeResolvable ? "ok" : "no", st.badgeResolvable ? "✔" : "✗"));
      let play = st.hasPlayback ? "✔" : "✗";
      if (st.tone === "hidden_pov" && st.deps) play += `（warm_true:${st.deps.warm_true ? "✔" : "✗"} / hidden_pov_tail:${st.deps.hidden_pov_tail ? "✔" : "✗"}）`;
      tr.appendChild(el("td", st.hasPlayback ? "ok" : "no", play));
      tbl.appendChild(tr);
    });
    v.appendChild(tbl);
    Object.keys(endings).forEach((k) => {
      if (!Array.isArray(endings[k])) return;
      v.appendChild(el("div", "band strong", `endings.${k} ×${endings[k].length}`));
      endings[k].forEach((n, i) => v.appendChild(renderNode(n, "data/endings.js", `${k}[${i}]`, 0, true)));
    });
    return v;
  }

  // ---- 視圖：Relations（QA 關係）----
  function locLink(file, loc) {
    const a = el("a", "loclink", loc); a.href = "#";
    a.onclick = (e) => { e.preventDefault(); gotoLoc(file, loc); };
    return a;
  }
  function mkTable(headers) { const t = el("table", "etable"); const hr = el("tr"); headers.forEach((h) => hr.appendChild(el("th", null, h))); t.appendChild(hr); return t; }
  function renderRelationsView() {
    const v = el("div", "view");
    v.appendChild(el("h2", null, "關係 Relations（QA）"));

    // Flags
    v.appendChild(el("div", "band strong", `Flags ×${REL.flags.length}（set / read / judge / 狀態）`));
    const ft = mkTable(["flag", "狀態", "judge", "被 set", "被 gate read"]);
    REL.flags.forEach((f) => {
      const tr = el("tr");
      tr.appendChild(el("td", null, f.name));
      const stcls = f.status === "ok" ? "ok" : "no";
      tr.appendChild(el("td", stcls, f.status === "unused" ? "未使用(set 但無人讀)" : f.status === "undefined-read" ? "讀但從未 set" : "ok"));
      tr.appendChild(el("td", f.usedInJudge ? "ok" : null, f.usedInJudge ? "✔" : ""));
      const sc = el("td"); if (!f.setBy.length) sc.textContent = "—"; else f.setBy.forEach((r) => { sc.appendChild(locLink(r.file, r.loc)); sc.appendChild(document.createTextNode(" ")); }); tr.appendChild(sc);
      const rc = el("td"); if (!f.readBy.length) rc.textContent = "—"; else f.readBy.forEach((r) => { rc.appendChild(locLink(r.file, r.loc)); rc.appendChild(document.createTextNode(" ")); }); tr.appendChild(rc);
      if (f.status !== "ok") tr.className = "row-warn";
      ft.appendChild(tr);
    });
    v.appendChild(ft);

    // Gates
    v.appendChild(el("div", "band strong", `Gates ×${REL.gates.length}（cond → then/else；依賴 flag/score）`));
    const gt = mkTable(["loc", "cond", "flags", "scores", "then/else", "可觸發?"]);
    REL.gates.forEach((g) => {
      const tr = el("tr");
      const lc = el("td"); lc.appendChild(locLink(g.file, g.loc)); tr.appendChild(lc);
      tr.appendChild(el("td", null, g.cond || "(缺)"));
      tr.appendChild(el("td", null, g.flags.join(", ") || "—"));
      tr.appendChild(el("td", null, g.scores.join(", ") || "—"));
      tr.appendChild(el("td", null, `${g.thenLen == null ? "?" : g.thenLen} / ${g.elseLen === undefined ? "—" : (g.elseLen == null ? "?" : g.elseLen)}`));
      let reach = "✔", rcls = "ok";
      if (g.neverTrue) { reach = "永不為真(then 不可達；flag 未定義)"; rcls = "no"; }
      else if (g.alwaysTrue) { reach = "永遠為真(else 不可達；!flag 未定義)"; rcls = "no"; }
      tr.appendChild(el("td", rcls, reach));
      if (g.neverTrue || g.alwaysTrue) tr.className = "row-warn";
      gt.appendChild(tr);
    });
    v.appendChild(gt);

    // Choices
    v.appendChild(el("div", "band strong", `Choices ×${REL.choices.length}（選項 → set flag / +score）`));
    const ct = mkTable(["loc", "id", "#opt", "prompt", "set flags", "score deltas"]);
    REL.choices.forEach((c) => {
      const tr = el("tr");
      const lc = el("td"); lc.appendChild(locLink(c.file, c.loc)); tr.appendChild(lc);
      tr.appendChild(el("td", null, c.id || "—"));
      tr.appendChild(el("td", null, String(c.optionCount)));
      tr.appendChild(el("td", null, excerpt(c.prompt, 30) || "—"));
      const sf = [...new Set([].concat(...c.options.map((o) => o.setFlags)))];
      tr.appendChild(el("td", null, sf.map((f) => f + (judgeFlags.has(f) ? "→judge" : "")).join(", ") || "—"));
      const sd = [].concat(...c.options.map((o) => o.addScores.map((s) => `${s.key}${s.delta >= 0 ? "+" : ""}${s.delta}`)));
      tr.appendChild(el("td", null, sd.join(", ") || "—"));
      ct.appendChild(tr);
    });
    v.appendChild(ct);

    // Score deltas 摘要
    const byKey = {}; REL.scoreDeltas.forEach((s) => { const k = byKey[s.key] = byKey[s.key] || { count: 0, net: 0 }; k.count++; k.net += (typeof s.delta === "number" ? s.delta : 0); });
    v.appendChild(el("div", "band strong", "Score deltas 摘要"));
    const st = mkTable(["score", "出現次數", "淨值(粗估)"]);
    Object.keys(byKey).forEach((k) => { const tr = el("tr"); tr.appendChild(el("td", null, k)); tr.appendChild(el("td", null, String(byKey[k].count))); tr.appendChild(el("td", null, (byKey[k].net >= 0 ? "+" : "") + byKey[k].net)); st.appendChild(tr); });
    v.appendChild(st);
    return v;
  }

  // ---- 視圖：Issues（含 filter）----
  let issueFilter = { mode: "all" };
  function renderIssuesView() {
    const v = el("div", "view");
    v.appendChild(el("h2", null, "Issues / QA 報告"));
    if (R.infos.length) { const ib = el("div", "info-banner"); R.infos.forEach((s) => ib.appendChild(el("div", null, "INFO: " + s))); v.appendChild(ib); }

    const bar = el("div", "filters");
    const rules = [...new Set(R.issues.map((i) => i.rule).filter(Boolean))].sort();
    const dayFiles = [...new Set(R.issues.map((i) => i.file))].sort();
    const mk = (label, fn, on) => { const b = el("button", "fbtn" + (on ? " on" : ""), label); b.onclick = fn; return b; };
    bar.appendChild(mk("all", () => { issueFilter = { mode: "all" }; show(renderIssuesView()); }, issueFilter.mode === "all"));
    bar.appendChild(mk(`errors(${errCount})`, () => { issueFilter = { mode: "errors" }; show(renderIssuesView()); }, issueFilter.mode === "errors"));
    bar.appendChild(mk(`warnings(${warnCount})`, () => { issueFilter = { mode: "warnings" }; show(renderIssuesView()); }, issueFilter.mode === "warnings"));
    bar.appendChild(mk(`info(${infoCount})`, () => { issueFilter = { mode: "info" }; show(renderIssuesView()); }, issueFilter.mode === "info"));
    const daySel = el("select", "fsel"); daySel.appendChild(new Option("by file…", "")); dayFiles.forEach((f) => daySel.appendChild(new Option(f, f)));
    daySel.value = issueFilter.mode === "file" ? issueFilter.file : ""; daySel.onchange = () => { issueFilter = daySel.value ? { mode: "file", file: daySel.value } : { mode: "all" }; show(renderIssuesView()); };
    bar.appendChild(daySel);
    const ruleSel = el("select", "fsel"); ruleSel.appendChild(new Option("by rule…", "")); rules.forEach((r) => ruleSel.appendChild(new Option(r, r)));
    ruleSel.value = issueFilter.mode === "rule" ? issueFilter.rule : ""; ruleSel.onchange = () => { issueFilter = ruleSel.value ? { mode: "rule", rule: ruleSel.value } : { mode: "all" }; show(renderIssuesView()); };
    bar.appendChild(ruleSel);
    v.appendChild(bar);

    let list = R.issues.slice();
    if (issueFilter.mode === "errors") list = list.filter((i) => i.level === "ERROR");
    else if (issueFilter.mode === "warnings") list = list.filter((i) => i.level === "WARN");
    else if (issueFilter.mode === "info") list = [];
    else if (issueFilter.mode === "file") list = list.filter((i) => i.file === issueFilter.file);
    else if (issueFilter.mode === "rule") list = list.filter((i) => i.rule === issueFilter.rule);

    if (issueFilter.mode === "info") { if (!R.infos.length) v.appendChild(el("div", "ok-banner", "（無 info）")); }
    else if (!list.length) v.appendChild(el("div", "ok-banner", R.issues.length ? "（此 filter 下無 issue）" : "PASS：故事資料符合 schema 契約（0 error / 0 warning）。"));
    list.sort((a, b) => a.file.localeCompare(b.file) || (a.level === "ERROR" ? 0 : 1) - (b.level === "ERROR" ? 0 : 1));
    list.forEach((it) => {
      const row = el("div", "issue " + it.level.toLowerCase());
      row.appendChild(document.createTextNode(`[${it.level}] (${it.rule || "-"}) ${it.file} `));
      row.appendChild(locLink(it.file, it.loc));
      row.appendChild(document.createTextNode(" : " + it.msg));
      v.appendChild(row);
    });
    return v;
  }

  // ---- 搜尋 ----
  function collect(node, into) {
    if (!node || typeof node !== "object") return;
    if (node.type) into.tags.add("type:" + node.type);
    if (node.who) { into.tags.add("who:" + node.who); into.text.push(node.who); }
    if (node.id) into.tags.add("id:" + node.id);
    if (node.text) into.text.push(String(node.text));
    if (node.prompt) into.text.push(String(node.prompt));
    if (node.place) into.text.push(String(node.place));
    if (node.cg) into.tags.add("cg:" + node.cg);
    if (node.bgm) into.tags.add("bgm:" + node.bgm);
    if (node.se) into.tags.add("se:" + node.se);
    if (node.mood) into.tags.add("mood:" + node.mood);
    if (node.add) Object.keys(node.add).forEach((k) => into.tags.add("score:" + k));
    if (node.set) Object.keys(node.set).forEach((k) => into.tags.add("flag:" + k));
    if (node.type === "choice" && Array.isArray(node.options)) node.options.forEach((op) => {
      if (op && op.label) into.text.push(String(op.label));
      if (op && op.flag) Object.keys(op.flag).forEach((k) => into.tags.add("flag:" + k));
      if (op && op.add) Object.keys(op.add).forEach((k) => into.tags.add("score:" + k));
      if (op && Array.isArray(op.reaction)) op.reaction.forEach((r) => collect(r, into));
    });
    if (node.type === "gate") { SS.condRefs(node.cond).flags.forEach((f) => into.tags.add("flag:" + f)); if (node.cond) into.text.push(String(node.cond)); (node.then || []).forEach((n) => collect(n, into)); (node.else || []).forEach((n) => collect(n, into)); }
  }
  const searchIndex = [];
  function indexNodes(arr, file, locOf, viewKey, label) {
    if (!Array.isArray(arr)) return;
    arr.forEach((n, i) => { const into = { text: [], tags: new Set() }; collect(n, into); searchIndex.push({ file, loc: locOf(i), viewKey, label, type: n && n.type, blob: (into.text.join(" ") + " " + [...into.tags].join(" ")).toLowerCase(), tags: into.tags }); });
  }
  for (let d = 1; d <= dayCount; d++) {
    indexNodes(days[d], `data/day${d}.js`, (i) => `node[${i}]`, "day" + d, "Day " + d);
    const ch = chapters[d];
    if (ch) { indexNodes(ch.intro, "data/chapters.js", (i) => `[${d}].intro[${i}]`, "day" + d, "Day " + d + " intro"); indexNodes(ch.outro, "data/chapters.js", (i) => `[${d}].outro[${i}]`, "day" + d, "Day " + d + " outro"); }
  }
  Object.keys(endings).forEach((k) => indexNodes(endings[k], "data/endings.js", (i) => `${k}[${i}]`, "endings", "ending:" + k));
  // endingMeta tone / badge 也可搜
  Object.keys(M.endingMeta || {}).forEach((tone) => searchIndex.push({ file: "data/meta.js", loc: `endingMeta.${tone}`, viewKey: "endings", label: "endingMeta", type: "ending", blob: (tone + " " + (M.endingMeta[tone].title || "") + " " + (M.endingMeta[tone].badge || "")).toLowerCase(), tags: new Set(["ending:" + tone]) }));

  function renderSearchView(q) {
    const v = el("div", "view");
    v.appendChild(el("h2", null, `搜尋：「${q}」`));
    const needle = q.trim().toLowerCase();
    if (!needle) { v.appendChild(el("div", "sub2", "輸入關鍵字：可搜 node id / 對白 / flag / cg / bgm / se / ending / speaker / score key。也可用前綴：flag:xxx、cg:xxx、who:akari、type:gate。")); return v; }
    const hits = searchIndex.filter((e) => e.blob.indexOf(needle) >= 0 || [...e.tags].some((t) => t.toLowerCase() === needle || t.toLowerCase().indexOf(needle) >= 0));
    v.appendChild(el("div", "counts", `${hits.length} 筆結果`));
    hits.slice(0, 400).forEach((e) => {
      const row = el("div", "sresult");
      row.appendChild(el("span", "type t-" + (e.type || "none"), e.type || "?"));
      row.appendChild(el("span", "slabel", e.label));
      const lk = locLink(e.file, e.loc); row.appendChild(lk);
      const snippet = e.blob.length > 90 ? e.blob.slice(0, 90) + "…" : e.blob;
      row.appendChild(el("span", "ssnip", snippet));
      v.appendChild(row);
    });
    if (hits.length > 400) v.appendChild(el("div", "sub", "（僅顯示前 400 筆）"));
    return v;
  }

  function gotoLoc(file, loc) {
    if (/^data\/day(\d+)\.js$/.test(file)) activate("day" + RegExp.$1);
    else if (file === "data/chapters.js") { const m = loc.match(/^\[(\d+)\]/); if (m) activate("day" + m[1]); }
    else if (file === "data/endings.js" || (file === "data/meta.js" && /endingMeta/.test(loc))) activate("endings");
    else if (file === "data/meta.js") activate("issues");
    const id = cardId(file, topLoc(loc));
    setTimeout(() => { const c = document.getElementById(id); if (c) { c.scrollIntoView({ block: "center" }); c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1600); } }, 0);
  }

  // ---- 版面 ----
  root.innerHTML = "";
  const bar = el("div", "summary " + (pass ? "pass" : "fail"));
  bar.appendChild(el("span", "badge", pass ? "PASS" : "FAIL"));
  bar.appendChild(el("span", "s-e", `errors: ${errCount}`));
  bar.appendChild(el("span", "s-w", `warnings: ${warnCount}`));
  bar.appendChild(el("span", "s-i", `info: ${infoCount}`));
  bar.appendChild(el("span", "s-meta", `game: ${M.gameId || "?"}　v${M.version || "?"}　schema ${M.schemaVersion != null ? M.schemaVersion : "?"}　days ${dayCount}`));
  const immo = el("span", "s-ro", "READ-ONLY"); bar.appendChild(immo);
  root.appendChild(bar);

  const toolbar = el("div", "toolbar");
  const search = el("input", "search"); search.type = "search"; search.placeholder = "搜尋 node/text/flag/cg/se/ending/speaker…（Enter）";
  const doSearch = () => { [...side.querySelectorAll(".nav")].forEach((x) => x.classList.remove("active")); show(renderSearchView(search.value)); };
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  const sbtn = el("button", "sbtn", "搜尋"); sbtn.onclick = doSearch;
  toolbar.appendChild(search); toolbar.appendChild(sbtn);
  // 0-H：Edit Preview 切換（預設 OFF＝純唯讀）
  const editBtn = el("button", "sbtn editbtn", "編輯預覽：OFF");
  editBtn.onclick = () => {
    editMode = !editMode;
    editBtn.textContent = "編輯預覽：" + (editMode ? "ON" : "OFF");
    editBtn.classList.toggle("on", editMode);
    if (editMode) buildDraft(); else { draft = null; clonedART = null; draftValidated = null; }
    const active = side.querySelector(".nav.active");
    if (editMode && !(active && /^Day\s/.test(active.textContent))) activate("day1");
    else if (active) active.click(); else activate("day1");
  };
  toolbar.appendChild(editBtn);
  root.appendChild(toolbar);

  const wrap = el("div", "wrap");
  const side = el("aside", "sidebar");
  const main = el("section", "main");
  wrap.appendChild(side); wrap.appendChild(main);
  root.appendChild(wrap);

  function show(node) { main.innerHTML = ""; main.appendChild(node); main.scrollTop = 0; checkImmutable(); }
  function mkNav(key, label, sub, onClick, badges) {
    const b = el("button", "nav");
    b.appendChild(el("div", "n-title", label));
    if (sub) b.appendChild(el("div", "n-sub", sub));
    if (badges) b.appendChild(el("div", "n-badge", badges));
    b.onclick = () => { [...side.querySelectorAll(".nav")].forEach((x) => x.classList.remove("active")); b.classList.add("active"); onClick(); };
    navMap[key] = b; side.appendChild(b); return b;
  }

  for (let d = 1; d <= dayCount; d++) {
    const info = (M.days && M.days[d]) || {};
    const ch = chapters[d] || {};
    const nodes = Array.isArray(days[d]) ? days[d].length : "缺";
    const io = `${Array.isArray(ch.intro) ? "intro✔" : "intro—"} ${Array.isArray(ch.outro) ? "outro✔" : "outro—"}`;
    const dc = dayCounts(d);
    const badge = dc.e ? `✖${dc.e}` : (dc.w ? `⚠${dc.w}` : "");
    mkNav("day" + d, `Day ${d}　${info.title || "(無標題)"}`, `${info.subtitle || ""}　· nodes ${nodes} · ${io}`, () => show(renderDayView(d)), badge);
  }
  mkNav("relations", "關係 Relations", `flags ${REL.flags.length} · gates ${REL.gates.length} · choices ${REL.choices.length}`, () => show(renderRelationsView()));
  mkNav("endings", "結局 Endings", `tones: ${R.endingsStatus.length}`, () => show(renderEndingView()));
  mkNav("issues", "Issues / QA", `e${errCount} / w${warnCount} / i${infoCount}`, () => show(renderIssuesView()));

  // 不可變性檢查
  let immViolated = false;
  function checkImmutable() {
    if (immViolated) return;
    if (snap(H) !== BEFORE || snap(window.ART || {}) !== BEFORE_ART) {
      immViolated = true;
      const b = el("div", "imm-error", "⚠ 不可變性違規：inspector 在渲染後改動了 window.HOSHINO / window.ART（這不應發生，請回報）。");
      root.insertBefore(b, wrap);
      bar.classList.add("fail");
    }
  }

  // 預設視圖
  if (errCount) activate("issues"); else activate("day1");
  checkImmutable();
})();
