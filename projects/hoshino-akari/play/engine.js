/* engine.js —— 星野灯線 VN 播放器（零後端，localStorage 存檔以「天」為單位） */
(function () {
  const H = window.HOSHINO, M = H.meta, ART = window.ART;
  const $ = (id) => document.getElementById(id);
  const SAVE = "HOSHINO_SAVE", GAL = "HOSHINO_GAL", ENDK = "HOSHINO_END", CH = "HOSHINO_CH";

  // ---- 狀態 ----
  let state = { day: 1, scores: { ...M.initScores }, flags: {} };
  let unlocked = new Set(JSON.parse(localStorage.getItem(GAL) || "[]"));
  let cleared = new Set(JSON.parse(localStorage.getItem(ENDK) || "[]"));
  let chapterCleared = new Set(JSON.parse(localStorage.getItem(CH) || "[]"));
  let autoMode = false, skipMode = false;

  // ---- 素材解析（assets.js manifest；缺素材一律 fallback，不報錯）----
  const A = () => (H.assets || {});
  function assetUrl(group, key) { const g = A()[group]; return (g && key != null && g[key]) || null; }
  let bgmAudio = null, bgmCur = null;
  function playBGM(m) {
    const en = A().enabled || {}; if (!en.bgm) return;                 // 未啟用音訊 → 靜音 fallback
    const url = assetUrl("bgm", m);
    if (m === "stop" || !url) { if (bgmAudio) { try { bgmAudio.pause(); } catch (e) {} } bgmCur = null; return; }
    if (url === bgmCur) return;
    try { if (!bgmAudio) { bgmAudio = new Audio(); bgmAudio.loop = true; bgmAudio.volume = 0.5; } bgmAudio.src = url; bgmAudio.play().catch(() => {}); bgmCur = url; } catch (e) {}
  }
  function playSE(key) {
    const en = A().enabled || {}; const url = en.se ? assetUrl("se", key) : null;
    if (url) { try { const a = new Audio(url); a.volume = 0.6; a.play().catch(() => {}); } catch (e) {} }
    flashSE();                                                          // 視覺脈衝永遠保留（即使沒音檔）
  }
  function setSprite(who, expr) {
    const el = $("spriteLayer"); if (!el) return;
    const c = A().characters || {}; const url = (expr != null && c[who]) ? c[who][expr] : null;
    if (url) { el.innerHTML = `<img class="sprite" src="${url}" alt="" onerror="this.parentNode.classList.add('hidden')">`; el.classList.remove("hidden"); }
    else { el.classList.add("hidden"); el.innerHTML = ""; }
  }

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
  function setMood(m) {
    if (!m) return;
    const bg = $("moodbg"); bg.className = m;
    const url = assetUrl("background", m); bg.style.backgroundImage = url ? `url(${url})` : "";  // 無圖 → CSS 漸層
    playBGM(m);
  }
  function flashSE() { const f = $("seFlash"); f.classList.remove("pulse"); void f.offsetWidth; f.classList.add("pulse"); }
  function setExpr(e) {
    const b = $("exprBadge");
    if (e) { b.textContent = e; b.classList.remove("hidden"); } else { b.classList.add("hidden"); }
  }
  function showCG(key) {
    if (!key || key === "clear") { $("cgLayer").classList.add("hidden"); return; }
    unlockCG(key);
    const cap = capFor(key);
    const url = assetUrl("cg", key);                                    // 有真 CG 用圖，否則 inline SVG
    const art = url ? `<img class="cg-img" src="${url}" alt="" onerror="this.outerHTML=''">` : (ART[key] ? ART[key]() : "");
    $("cgLayer").innerHTML = art + (cap ? `<div class="cg-cap">${cap}</div>` : "");
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

  // 場景卡 / 章節卡共用的淡入淡出
  async function fadeCard(html, hold) {
    const c = $("sceneCard");
    c.innerHTML = html;
    c.classList.remove("hidden"); c.style.opacity = 0; c.style.transition = "opacity 1s"; void c.offsetWidth; c.style.opacity = 1;
    $("textbox").style.visibility = "hidden";
    await Promise.race([delay(hold), waitAdvance(0)]);
    c.style.opacity = 0; await delay(skipMode ? 4 : 600); c.classList.add("hidden");
    $("textbox").style.visibility = "visible";
  }

  // 場景轉換（VN 標準 fade/dissolve）：中央 scrim 淡入蓋住 → scrim 下換背景 → scrim 淡出露出新場景，
  // 配地點/時間標籤上滑＋底線展開。比換日全黑大卡輕，但清楚可見。（換日 showDayCard 才用全板大卡。）
  async function showScene(node) {
    clearCG(); setExpr("");
    const el = $("sceneTag");
    if (!el) { if (node.mood) setMood(node.mood); return; }
    el.innerHTML = `${node.time ? `<span class="st-time">${node.time}</span>` : ""}<span class="st-line"></span><span class="st-place">${node.place || ""}</span>`;
    $("speaker").classList.add("hidden"); $("dialogue").textContent = ""; $("advanceHint").classList.remove("show");
    el.classList.remove("hidden"); void el.offsetWidth; el.classList.add("show");   // scrim＋標籤上滑＋底線展開
    await delay(skipMode ? 4 : 200);
    if (node.mood) setMood(node.mood);                                               // 在 scrim 下換背景（dissolve 感）
    await Promise.race([delay(skipMode ? 4 : 520), waitAdvance(0)]);                 // 較短的停留
    el.classList.remove("show");                                                     // 開始淡出——但不等它淡完
    setTimeout(() => el.classList.add("hidden"), skipMode ? 4 : 460);                // 讓地點卡淡出與下一句旁白「同時發生」，更爽快、不拖重複
  }

  // 章節卡（Day Start／Day End）。標題缺省時仍可運作（只顯示 Day 編號）
  function dayInfo(d) { return (M.days && M.days[d]) || { title: "", subtitle: "" }; }
  async function showDayCard(d, kind) {
    const info = dayInfo(d);
    const tail = d >= M.dayCount ? "全七日　終" : "本日終";              // Day7 終章感
    const html = kind === "end"
      ? `<div class="day-card day-end"><div class="dc-no">Day ${d}</div><div class="dc-rule"></div><div class="dc-tail">${tail}</div></div>`
      : `<div class="day-card"><div class="dc-no">Day ${d}</div><div class="dc-rule"></div><div class="dc-title">${info.title}</div>${info.subtitle ? `<div class="dc-sub">${info.subtitle}</div>` : ""}</div>`;
    await fadeCard(html, kind === "end" ? 1400 : 1900);
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
    if (node.expr !== undefined) { setExpr(node.expr); setSprite(node.who, node.expr); }
    if (node.se) playSE(node.se);
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

  function chapterOf(d) { return (H.chapters && H.chapters[d]) || {}; }
  function markChapterCleared(d) { chapterCleared.add(d); localStorage.setItem(CH, JSON.stringify([...chapterCleared])); }

  async function runDay(d, opts) {
    opts = opts || {};
    state.day = d; if (!opts.replay) persist();      // 章節回想不覆蓋正式存檔
    const info = dayInfo(d);
    $("dayTag").textContent = "Day " + d + (info.title ? "　" + info.title : "") + (opts.replay ? "（回想）" : ""); refreshDbg();
    clearCG(); setExpr(""); setSprite(null, null); hideSNS(); setBlack(false);
    setMood("night");
    await showDayCard(d, "start");                  // 必做1：每日章節標題卡
    await playNodes(chapterOf(d).intro || []);      // 必做3：當日極短引子
    await playNodes(H.days[d] || [{ type: "line", who: "narration", text: "（Day" + d + " 尚未實裝）" }]);
    await playNodes(chapterOf(d).outro || []);      // 必做4：當日極短收束
    if (!opts.replay) markChapterCleared(d);
    await showDayCard(d, "end");                     // 必做2：Day End 轉場（含 Day7 終章卡）
    if (opts.replay) { openGallery(); return; }      // 回想：只重看一日，不續播、不進結局
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
    // 章節回想（必做5）：每格顯示 Day X + 標題；該日通關後解鎖，可重看
    const chEl = $("galChapters");
    if (chEl) {
      chEl.innerHTML = "";
      for (let d = 1; d <= M.dayCount; d++) {
        const info = dayInfo(d), open = chapterCleared.has(d);
        const c = document.createElement("div");
        c.className = "gal-cell ch-cell" + (open ? "" : " locked");
        if (open) { c.innerHTML = `<div class="ch-no">Day ${d}</div><div class="ch-ti">${info.title}</div>`; c.onclick = () => replayChapter(d); }
        else c.textContent = "🔒";
        chEl.appendChild(c);
      }
    }
    const endItems = Object.keys(M.endingMeta).map((k) => ({ key: M.endingMeta[k].badge, cap: M.endingMeta[k].title, note: M.endingMeta[k].note }));
    fill("galEndings", endItems);
    fill("galAnchors", M.gallery.anchors);
    fill("galSigns", M.gallery.signs);
    fill("galHidden", M.gallery.hidden);
  }
  function replayChapter(d) {
    state = { day: d, scores: { ...M.initScores }, flags: {} };  // 章節回想＝從該日重看（不影響正式存檔分數）
    showScreen("game"); runDay(d, { replay: true });
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
    for (let d = 1; d <= M.dayCount; d++) {
      const info = dayInfo(d);
      const b = document.createElement("button");
      b.innerHTML = `Day ${d}　<span style="color:var(--ink-dim)">${info.title}</span>`;  // 跳天也顯示日標題
      b.onclick = () => { closeMenu(); runDay(d); };
      j.appendChild(b);
    }
  }

  // ---- 選單 ----
  function openMenu() {
    $("menuModal").classList.remove("hidden");
    const info = dayInfo(state.day);
    $("mRestartDay").textContent = "重玩本日（Day " + state.day + "　" + info.title + "）";  // 必做5：重玩顯示日標題
    refreshDbg();
  }
  function closeMenu() { $("menuModal").classList.add("hidden"); }

  // ---- 綁定 ----
  function boot() {
    $("titleArt").innerHTML = ART.title();
    const save = JSON.parse(localStorage.getItem(SAVE) || "null");
    if (save) {
      const info = dayInfo(save.day);
      $("contLabel").textContent = "　Day " + save.day + (info.title ? "《" + info.title + "》" : "");
      $("btnContinue").disabled = false;
    } else { $("contLabel").textContent = "　（尚無進度）"; $("btnContinue").disabled = true; }

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
    $("mRestartDay").onclick = () => { closeMenu(); const sv = JSON.parse(localStorage.getItem(SAVE) || "null") || { scores: state.scores, flags: state.flags }; state.scores = { ...sv.scores }; state.flags = { ...sv.flags }; runDay(state.day); };
    $("mTitle").onclick = () => location.reload();
    $("dbgChk").onchange = (e) => { $("dbgPanel").classList.toggle("hidden", !e.target.checked); refreshDbg(); };

    $("btnAuto").onclick = () => { autoMode = !autoMode; $("btnAuto").classList.toggle("on", autoMode); if (autoMode) userAdvance(); };
    $("btnSkip").onclick = () => { skipMode = !skipMode; $("btnSkip").classList.toggle("on", skipMode); if (skipMode) userAdvance(); };

    showScreen("title");
  }
  boot();
})();
