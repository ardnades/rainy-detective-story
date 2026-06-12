/* engine.js —— 星野灯線 VN 播放器（零後端，localStorage 存檔以「天」為單位） */
(function () {
  const H = window.HOSHINO, M = H.meta, ART = window.ART;
  const $ = (id) => document.getElementById(id);
  const SAVE = "HOSHINO_SAVE", GAL = "HOSHINO_GAL", ENDK = "HOSHINO_END";

  // ---- 狀態 ----
  let state = { day: 1, scores: { ...M.initScores }, flags: {} };
  let unlocked = new Set(JSON.parse(localStorage.getItem(GAL) || "[]"));
  let cleared = new Set(JSON.parse(localStorage.getItem(ENDK) || "[]"));
  let autoMode = false, skipMode = false;

  // ---- 前進控制（點擊 / 鍵盤 / auto / skip）----
  let pendingAdvance = null, typing = false, finishTyping = null;
  function userAdvance() {
    if (typing && finishTyping) { finishTyping(); return; }
    if (pendingAdvance) { const r = pendingAdvance; pendingAdvance = null; r(); }
  }
  function waitAdvance(ms) {
    return new Promise((res) => {
      pendingAdvance = () => { pendingAdvance = null; res(); };
      if (skipMode) { const r = pendingAdvance; pendingAdvance = null; setTimeout(r, 12); }
      else if (autoMode && ms) { setTimeout(() => { if (pendingAdvance) userAdvance(); }, ms); }
    });
  }
  const delay = (ms) => new Promise((r) => setTimeout(r, skipMode ? 4 : ms));

  // ---- 條件評估 ----
  function evalCond(cond) {
    cond = (cond || "").trim();
    if (cond.startsWith("flag:")) return !!state.flags[cond.slice(5)];
    if (cond.startsWith("!flag:")) return !state.flags[cond.slice(6)];
    const s = state.scores, scope = { affection: s.affection, distance: s.distance, awareness: s.awareness, regret: s.regret, warmth: s.affection - s.distance };
    try { return Function(...Object.keys(scope), "return (" + cond + ")")(...Object.values(scope)); }
    catch (e) { console.warn("cond err", cond, e); return false; }
  }

  // ---- 舞台繪製 ----
  function setMood(m) { if (m) $("moodbg").className = m; }
  function flashSE() { const f = $("seFlash"); f.classList.remove("pulse"); void f.offsetWidth; f.classList.add("pulse"); }
  function setExpr(e) {
    const b = $("exprBadge");
    if (e) { b.textContent = e; b.classList.remove("hidden"); } else { b.classList.add("hidden"); }
  }
  function showCG(key) {
    if (!key || key === "clear") { $("cgLayer").classList.add("hidden"); return; }
    unlockCG(key);
    const cap = capFor(key);
    $("cgLayer").innerHTML = (ART[key] ? ART[key]() : "") + (cap ? `<div class="cg-cap">${cap}</div>` : "");
    $("cgLayer").classList.remove("hidden");
  }
  function clearCG() { $("cgLayer").classList.add("hidden"); $("cgLayer").innerHTML = ""; }
  function capFor(key) {
    for (const g of ["anchors", "signs", "hidden"]) {
      const it = M.gallery[g].find((x) => x.key === key); if (it) return it.cap;
    } return "";
  }
  let blackout;
  function setBlack(on) {
    if (!blackout) { blackout = document.createElement("div"); blackout.style.cssText = "position:absolute;inset:0;background:#000;z-index:7;opacity:0;transition:opacity .7s;pointer-events:none"; $("stage").appendChild(blackout); }
    blackout.style.opacity = on ? "1" : "0";
  }

  async function showScene(node) {
    clearCG(); setExpr("");
    if (node.mood) setMood(node.mood);
    const c = $("sceneCard");
    c.innerHTML = `${node.time ? `<div class="sc-time">${node.time}</div>` : ""}<div class="sc-rule"></div><div class="sc-place">${node.place || ""}</div><div class="sc-rule"></div>`;
    c.classList.remove("hidden"); c.style.opacity = 0; c.style.transition = "opacity 1s"; void c.offsetWidth; c.style.opacity = 1;
    $("textbox").style.visibility = "hidden";
    await Promise.race([delay(1500), waitAdvance(0)]);
    c.style.opacity = 0; await delay(skipMode ? 4 : 600); c.classList.add("hidden");
    $("textbox").style.visibility = "visible";
  }

  async function showSNS(line) {
    const data = line.sns || { title: "推薦欄", posts: [] };
    const wrap = $("snsLayer");
    wrap.innerHTML = `<div class="phone"><div class="phone-bar"><span class="dot"></span>${data.title || "推薦欄"}</div><div id="snsPosts"></div></div>`;
    wrap.classList.remove("hidden");
    const host = wrap.querySelector("#snsPosts");
    for (const p of data.posts) {
      const d = document.createElement("div");
      d.className = "post" + (p.acct ? " acct" : "") + (p.reply ? " reply" : "");
      d.innerHTML = p.num ? p.text.replace(/\[(.+?)\]/g, '<span class="num">$1</span>') : p.text;
      host.appendChild(d);
      await delay(skipMode ? 4 : 360);
    }
  }
  function hideSNS() { $("snsLayer").classList.add("hidden"); $("snsLayer").innerHTML = ""; }

  // ---- 打字機 ----
  function typewriter(text, speed) {
    const el = $("dialogue");
    const per = speed === "instant" ? 0 : speed === "slow" ? 68 : 26;
    return new Promise((res) => {
      if (per === 0 || skipMode) { el.textContent = text; res(); return; }
      typing = true; let i = 0; el.textContent = "";
      const done = () => { clearInterval(t); el.textContent = text; typing = false; finishTyping = null; res(); };
      finishTyping = done;
      const t = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) done(); }, per);
    });
  }

  async function playLine(node) {
    if (node.add) { for (const k in node.add) state.scores[k] = (state.scores[k] || 0) + node.add[k]; refreshDbg(); }
    if (node.set) { for (const k in node.set) state.flags[k] = node.set[k]; refreshDbg(); }
    if (node.screen === "black") { setBlack(true); await delay(700); }
    else if (node.screen === "clear") setBlack(false);
    if (node.bgm) setMood(node.bgm);
    if (node.cg !== undefined) showCG(node.cg);
    if (node.expr !== undefined) setExpr(node.expr);
    if (node.se) flashSE();
    if (node.shake) { $("stage").classList.add("shake"); setTimeout(() => $("stage").classList.remove("shake"), 420); }

    const nm = M.names[node.who] || M.names.narration;
    const sp = $("speaker");
    if (nm.label) { sp.textContent = nm.label; sp.className = nm.cls; sp.classList.remove("hidden"); }
    else sp.classList.add("hidden");
    $("dialogue").className = node.who === "narration" ? "narration" : "";
    $("advanceHint").classList.remove("show");

    if (node.screen === "black") { setBlack(false); }
    if (node.ui === "sns") await showSNS(node);

    await typewriter(node.text || "", node.speed || "normal");
    if (node.pause && !skipMode) await Promise.race([delay(node.pause * 1000), waitAdvance(0)]);
    $("advanceHint").classList.add("show");
    await waitAdvance(autoMode ? 1100 + (node.pause || 0) * 1000 : 0);
    if (node.ui === "sns") hideSNS();
  }

  // ---- 選項 ----
  function playChoice(node) {
    return new Promise((resolve) => {
      const box = $("choices");
      box.innerHTML = node.prompt ? `<div class="choice-prompt">${node.prompt}</div>` : "";
      $("advanceHint").classList.remove("show");
      const showHint = $("dbgChk") && $("dbgChk").checked;
      node.options.forEach((op) => {
        const b = document.createElement("button");
        b.innerHTML = op.label + (showHint && op._dbg ? `<span class="hint">${op._dbg}</span>` : "");
        b.onclick = async () => {
          box.classList.add("hidden"); box.innerHTML = "";
          if (op.add) for (const k in op.add) state.scores[k] = (state.scores[k] || 0) + op.add[k];
          if (op.flag) for (const k in op.flag) state.flags[k] = op.flag[k];
          refreshDbg();
          if (op.reaction) await playNodes(op.reaction);
          resolve();
        };
        box.appendChild(b);
      });
      box.classList.remove("hidden");
    });
  }

  // ---- 走訪 ----
  async function playNode(node) {
    switch (node.type) {
      case "scene": return showScene(node);
      case "line": return playLine(node);
      case "choice": return playChoice(node);
      case "gate": return evalCond(node.cond) ? playNodes(node.then || []) : playNodes(node.else || []);
      default: return;
    }
  }
  async function playNodes(nodes) { for (const n of (nodes || [])) await playNode(n); }

  // ---- 流程 ----
  function persist() { localStorage.setItem(SAVE, JSON.stringify({ day: state.day, scores: state.scores, flags: state.flags })); }
  function unlockCG(key) {
    if (!key || unlocked.has(key)) return;
    unlocked.add(key); localStorage.setItem(GAL, JSON.stringify([...unlocked]));
  }

  async function runDay(d) {
    state.day = d; persist();
    $("dayTag").textContent = "Day " + d; refreshDbg();
    clearCG(); setExpr(""); hideSNS(); setBlack(false);
    setMood("night");
    await playNodes(H.days[d] || [{ type: "line", who: "narration", text: "（Day" + d + " 尚未實裝）" }]);
    if (d < M.dayCount) { await runDay(d + 1); }
    else { await finale(); }
  }

  async function finale() {
    const tone = M.judge(state.scores, state.flags);
    cleared.add(tone); localStorage.setItem(ENDK, JSON.stringify([...cleared]));
    if (tone === "hidden_pov") {
      await playNodes(H.endings.warm_true || []);
      await playNodes(H.endings.hidden_pov_tail || []);
    } else {
      await playNodes(H.endings[tone] || []);
    }
    const em = M.endingMeta[tone]; unlockCG(em.badge.replace("end_", "") === tone ? em.badge : em.badge);
    unlocked.add(em.badge); localStorage.setItem(GAL, JSON.stringify([...unlocked]));
    showEndingCard(tone);
  }

  function showEndingCard(tone) {
    const em = M.endingMeta[tone];
    const box = $("choices");
    box.innerHTML =
      `<div style="text-align:center;max-width:460px">
        <div style="width:160px;margin:0 auto 14px">${ART[em.badge]()}</div>
        <h2 style="letter-spacing:.18em;color:var(--akari);margin-bottom:10px">${em.title}</h2>
        <p style="color:var(--ink-dim);font-size:14px;line-height:1.9;margin-bottom:22px">${em.note}</p>
      </div>`;
    const mk = (t, fn) => { const b = document.createElement("button"); b.textContent = t; b.onclick = fn; b.style.width = "min(80vw,300px)"; box.appendChild(b); };
    mk("回想室", openGallery);
    mk("回到標題", () => location.reload());
    box.classList.remove("hidden");
  }

  // ---- 回想室 ----
  function renderGallery() {
    const fill = (host, items, group) => {
      const el = $(host); el.innerHTML = "";
      items.forEach((it) => {
        const open = unlocked.has(it.key) || unlocked.has("end_" + it.key);
        const c = document.createElement("div");
        c.className = "gal-cell" + (open ? "" : " locked");
        if (open) { c.innerHTML = (ART[it.key] ? ART[it.key]() : "") + `<div class="cap">${it.cap}</div>`; c.onclick = () => openView(it); }
        else c.textContent = "🔒";
        el.appendChild(c);
      });
    };
    const endItems = Object.keys(M.endingMeta).map((k) => ({ key: M.endingMeta[k].badge, cap: M.endingMeta[k].title, note: M.endingMeta[k].note }));
    fill("galEndings", endItems);
    fill("galAnchors", M.gallery.anchors);
    fill("galSigns", M.gallery.signs);
    fill("galHidden", M.gallery.hidden);
  }
  function openView(it) {
    $("galViewArt").innerHTML = ART[it.key] ? ART[it.key]() : "";
    $("galViewText").textContent = it.note || "";
    $("galView").classList.remove("hidden");
  }
  function openGallery() { showScreen("gallery"); renderGallery(); }

  // ---- 畫面切換 ----
  function showScreen(id) { ["title", "game", "gallery"].forEach((s) => $(s).classList.toggle("hidden", s !== id)); }

  // ---- 開發者面板 ----
  function refreshDbg() {
    const p = $("dbgPanel"); if (!p || p.classList.contains("hidden")) return;
    const s = state.scores;
    const flags = Object.keys(state.flags).filter((k) => state.flags[k]);
    p.innerHTML =
      `<div class="row"><span>affection</span><b>${s.affection}</b></div>
       <div class="row"><span>distance</span><b>${s.distance}</b></div>
       <div class="row"><span>awareness</span><b>${s.awareness}</b></div>
       <div class="row"><span>regret</span><b>${s.regret}</b></div>
       <div class="row"><span>warmth(aff-dist)</span><b>${s.affection - s.distance}</b></div>
       <div class="row"><span>預測結局</span><b style="color:var(--accent)">${M.endingMeta[M.judge(s, state.flags)].title}</b></div>
       <div style="margin-top:6px;color:#6b7785">flags: ${flags.join(", ") || "（無）"}</div>
       <div class="jump"></div>`;
    const j = p.querySelector(".jump");
    for (let d = 1; d <= 7; d++) { const b = document.createElement("button"); b.textContent = "D" + d; b.onclick = () => { closeMenu(); runDay(d); }; j.appendChild(b); }
  }

  // ---- 選單 ----
  function openMenu() { $("menuModal").classList.remove("hidden"); refreshDbg(); }
  function closeMenu() { $("menuModal").classList.add("hidden"); }

  // ---- 綁定 ----
  function boot() {
    $("titleArt").innerHTML = ART.title();
    const save = JSON.parse(localStorage.getItem(SAVE) || "null");
    if (save) { $("contDay").textContent = save.day; $("btnContinue").disabled = false; }
    else $("btnContinue").disabled = true;

    $("btnStart").onclick = () => { state = { day: 1, scores: { ...M.initScores }, flags: {} }; showScreen("game"); runDay(1); };
    $("btnContinue").onclick = () => { if (!save) return; state = { day: save.day, scores: save.scores, flags: save.flags }; showScreen("game"); runDay(save.day); };
    $("btnGallery").onclick = openGallery;
    $("btnGalleryG").onclick = openGallery;
    $("gBack").onclick = () => showScreen($("game").classList.contains("hidden") ? "title" : "game");
    $("galViewClose").onclick = () => $("galView").classList.add("hidden");

    $("textbox").onclick = userAdvance;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); userAdvance(); }
      if (e.key.toLowerCase() === "d") { $("dbgChk").checked = !$("dbgChk").checked; $("dbgPanel").classList.toggle("hidden", !$("dbgChk").checked); openMenu(); }
    });

    $("btnMenu").onclick = openMenu;
    $("mResume").onclick = closeMenu;
    $("mGallery").onclick = () => { closeMenu(); openGallery(); };
    $("mRestartDay").onclick = () => { closeMenu(); const sv = JSON.parse(localStorage.getItem(SAVE)); state.scores = { ...sv.scores }; state.flags = { ...sv.flags }; runDay(state.day); };
    $("mTitle").onclick = () => location.reload();
    $("dbgChk").onchange = (e) => { $("dbgPanel").classList.toggle("hidden", !e.target.checked); refreshDbg(); };

    $("btnAuto").onclick = () => { autoMode = !autoMode; $("btnAuto").classList.toggle("on", autoMode); if (autoMode) userAdvance(); };
    $("btnSkip").onclick = () => { skipMode = !skipMode; $("btnSkip").classList.toggle("on", skipMode); if (skipMode) userAdvance(); };

    showScreen("title");
  }
  boot();
})();
