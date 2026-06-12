# Phase 1 編輯器：要鎖定的最小資料介面（資料契約）

> **前提**：編輯器**不改 `engine.js`**，只產出符合 `runDay()` 契約的資料，讓現有 player 原封不動跑。
> 本文全部以實際程式碼為準（`engine.js` / `meta.js` / `chapters.js` / `assets.js` / `day1–7.js` / `endings.js` / `art.js`）。
> 路徑：`ai-interactive-story-factory/projects/hoshino-akari/play/`
> 產出日期：2026-06-12（以 graphify 知識圖譜 + 逐檔反推）

---

## A. `runDay()` 依賴地圖

`runDay(d, opts)`（engine.js:237）是唯一把資料串起來的橋。

**直接讀取的資料**
- `M.days[d]`（經 `dayInfo()`）→ 章節 `title` / `subtitle`（章節卡、dayTag、存檔/重玩/跳天/回想 label）
- `H.chapters[d]`（經 `chapterOf()`）→ `.intro` / `.outro` node 陣列
- `H.days[d]` → 當日 node 陣列（主劇情）
- `M.dayCount` → 是否還有下一天 / 是否進結局
- `M.initScores`、`M.judge()`、`M.endingMeta`、`H.endings`（在 `finale()` 內）

**呼叫的函式（graphify 實測）**
`persist` → `dayInfo` → `showDayCard("start")` → `playNodes(intro)` → `playNodes(days[d])` → `playNodes(outro)` → `markChapterCleared` → `showDayCard("end")` →（`replay` 時 `openGallery`，否則）`runDay(d+1)` 或 `finale`。
舞台重置：`clearCG / setExpr / setSprite / hideSNS / setBlack / setMood`。

**`playNodes` → `playNode`（engine.js:216）只認 4 種 type**：`scene→showScene`、`line→playLine`、`choice→playChoice`、`gate→evalCond ? then : else`。其他 type 一律 no-op。

**`playLine()` 接收（engine.js:163）**：`who, text, speed, pause, expr, se, bgm, cg, screen, shake, ui/sns, add, set`。

**狀態讀寫點**
- **score**：`line.add` / `choice option.add`（`state.scores[k] += n`）
- **flag**：`line.set` / `choice option.flag`（`state.flags[k] = bool`）
- **branch**：只有 `gate.cond`（`evalCond`, engine.js:53）與 `choice option.reaction`（播完即匯合，不分岔）
- **ending_tone**：**不是 node**，由 `finale()` 的 `M.judge(scores, flags)` 結算（engine.js:256）

**生命週期點**
- Day 開始：`runDay` 進入 → `showDayCard(d,"start")`
- Day 結束：`showDayCard(d,"end")`（Day7 顯示「全七日　終」）
- 跳日：`refreshDbg()` 的 Day 按鈕 → `runDay(d)`（dev mode）
- 存檔點：`persist()`（engine.js:228）僅在 `runDay` 進入時、且**非 replay** 才寫 `HOSHINO_SAVE`
- CG/asset resolve：`showCG()`（`assets.cg[key]` 圖優先，否則 `ART[key]()` SVG）；`setMood()`（背景 `assets.background[mood]` 否則 CSS 漸層 + `playBGM`）；`setSprite()`（需 `#spriteLayer`，現不存在 → no-op）
- chapter / day title / metadata 來源：`meta.js` 的 `M.days[d]`（標題）＋ `chapters.js` 的 `H.chapters[d]`（intro/outro）

---

## B. 最小資料契約

### B1. Game meta（`meta.js`）

| 欄位 | 現狀 | 說明 |
|---|---|---|
| `gameId` | `"hoshino-akari"` | 已預留 |
| `version` / `schemaVersion` | `"1.0.0"` / `1` | 已預留 |
| `title` / `subtitle` | ⚠️ 目前寫死在 `index.html`，meta 無 | 編輯器要補進 meta 才能單一來源 |
| default start day | 隱含 `1`（`btnStart` 寫死） | 可選新增 `startDay` |
| `dayCount` | `7` | |
| available endings | `endingMeta`（4 tone）＋ `judge()` 邏輯 | endings 由 judge 決定，非清單驅動 |

### B2. Chapter / Day meta（`meta.days[d]` ＋ `chapters[d]`）

`day number` = key、`title`、`subtitle`(hook)、`intro`(node[])、`outro`(node[])。
replay label / save label / dayTag / 跳天 label **全部**由 `dayInfo(d)` 衍生 → 編輯器只要編 `title`，這些 UI 自動共用（已集中，無需各別填）。

### B3. Scene / line node（反推自實際 day1–7.js，**只有 4 種**）

> **重要**：`cg / sns / flag / score / jump / ending` **都不是獨立 node type**。cg/sns 是 `line` 欄位；flag/score 是 `add`/`set`/`flag` 欄位；branch 是 `gate`；ending 由 `judge()` 算。**沒有 jump，也沒有 ending node。**

| type | 必填 | 可選 | 影響 runtime（state） | editor 可安全改 | 不應碰 |
|---|---|---|---|---|---|
| **scene** | `type` | `place`, `time`, `mood` | `mood`（背景/BGM） | place / time / mood | type |
| **line** | `type`（實務 `who`,`text` 必備） | `speed`,`pause`,`expr`,`se`,`bgm`,`shake`,`ui`+`sns`,`cg`,`screen`,`add`,`set` | **`add`(分數)**、**`set`(旗標)**、`cg`(解鎖圖鑑)、`screen`、`bgm` | text/speed/pause/expr/se/shake/who/ui+sns/cg(限合法 key)/bgm(限 mood) | type；`add`/`set` 的 **key** 必須在允許清單 |
| **choice** | `type`,`options`(≥2),每項 `label` | `id`,`prompt`,每項 `_dbg`/`add`/`flag`/`reaction` | `option.add`、`option.flag`、`option.reaction` | label/prompt/_dbg/reaction/add/flag(限 key) | type、options 結構 |
| **gate** | `type`,`cond`,`then` | `else` | `cond`（對 scores/flags 求值）、`then`/`else` 分支 | cond(限文法+key)/then/else | type |

**列舉值（以程式碼為準）**
- `who ∈ {narration, me, akari, manager}`（`M.names`）
- `speed ∈ {normal, slow, instant}`
- `mood / bgm ∈ {night, warm, rain, stop, store}`
- dev 提示欄位實際是 **`_dbg`**（engine 讀這個）；meta 註解寫的 `hint` 其實沒被讀 → **以 `_dbg` 為準**

### B4. Branch / choice contract
- 形態：`{type:"choice", id:"d7s3", prompt?, options:[{label, _dbg?, add?:{score:n}, flag?:{key:bool}, reaction:[node…]}]}`
- 選項 → flag：`option.flag`（`state.flags[k]=bool`）；→ score：`option.add`（`+=n`）
- **choice 不跳**：所有選項播完 `reaction` 後**匯合**到下一個 node；真正分支只有 `gate`
- branch id 命名規則：`d<day>s<seq>`（`d4s1`,`d6s2`,`d7s3`…）；**只有 choice 有 `id`**，scene/line/gate 沒有
- orphan / unreachable 風險：**低**（無 id 跳轉、node 順序播、choice 必匯合）。唯一風險：`gate.cond` 恆真/恆假（某分支不可達）或 `gate` 缺 `then`/`else` 內容 → warning 級別

### B5. Asset contract
- `assets.js` 分組：`enabled{bgm,se}`、`characters{who:{expr:url}}`、`cg{cgKey:url}`、`background{mood:url}`、`bgm{mood:url}`、`se{seKey:url}` —— **目前全空、音訊關**
- `art.js`（`window.ART`）內建 inline SVG，keys = `title, cat_meet, oden, pudding, cocoa, lipbalm, receipt, note, akari_studio, end_warm, end_quiet, end_bitter, end_hidden, locked`
- 分工：**`art.js` 是永遠存在的 SVG 基底；`assets.js` 是可選的真圖覆蓋**。`showCG(key)` 先查 `assets.cg[key]`（真圖），沒有才用 `ART[key]()`（SVG），再沒有則空
- day node 引用：`line.cg = "<key>"`（同時是 ART key、圖鑑 key、cg manifest key，三者共用同一字串）
- 缺圖 fallback：**安全**（CG→SVG；背景→CSS 漸層；sprite→無 `#spriteLayer` no-op；SE→只剩視覺脈衝；`<img onerror>` 自動移除壞圖）
- 未來 Comfy 產物進法：art_tool 產圖 → 寫檔到 `play/assets/...` → **只更新 `assets.js` 的對應 key**（runtime 不 import 任何 Comfy；圖譜已證實兩側 0 連線）

### B6. Save / replay / dev contract
- `HOSHINO_SAVE = {day, scores, flags}`；另有 `HOSHINO_GAL`(解鎖圖鑑 key 集)、`HOSHINO_END`(已達成 tone 集)、`HOSHINO_CH`(已通關日 number 集)
- replay 本日：`replayChapter(d)` 依 **day number**，重置 initScores/空 flags、`runDay(d,{replay:true})`，**不存檔、不續播、不進結局**
- dev 跳天：`refreshDbg` 按鈕依 `M.dayCount` + `dayInfo(d)`，`runDay(d)`（會存檔、會續播）
- 加 day title 後共用 title 的 UI（**已全部接到 `dayInfo()`，無遺漏**）：`dayTag`、`contLabel`、`mRestartDay`、跳天按鈕、回想室章節格、`showDayCard`
- 編輯器產出的 day title **唯一來源 = `meta.days[d].title`**，其餘 UI 全部衍生

---

## C. Editor MVP read/write whitelist

| 檔案 | 可否寫入 | 註記 |
|---|---|---|
| `data/meta.js` | ✅ 可寫 | 含 days；建議補 title/subtitle/startDay；`judge()` 屬邏輯，**最好不改**、先唯讀 |
| `data/chapters.js` | ✅ 可寫 | intro/outro |
| `data/assets.js` | ✅ 可寫 | 只填 manifest key→url |
| `data/day1.js … day7.js` | ✅ 可寫 | node 陣列 |
| `data/endings.js` | ✅ 可寫 | 結局演出文字 |
| `art.js` | ⚠️ 最好不改 | inline SVG 屬美術程式，editor 不該生 SVG；改走 assets.js 覆蓋 |
| `index.html` | ⚠️ 最好不改 | 唯一可能要改一處：把寫死的 `<h1>title</h1>`/subtitle 改讀 meta；非 MVP 必要，可延後 |
| `engine.js` | ❌ 不可寫 | 執行層 |
| save logic / payment / Comfy backend / GitHub Pages deploy 設定 | ❌ 不可寫 | 超出 Phase 1 |

`meta.judge()` 標「**最好不改**」：結局邏輯，編輯器初期唯讀顯示，不提供 GUI 改判定式（避免破壞既有 4 結局可達性）。

---

## D. Validation rules（設計，不實裝）

1. **day 完整**：`H.days[d]` 與 `M.days[d]` 對 `1..dayCount` 全部存在（error）
2. **gate 分支**：每個 `gate` 有 `cond` 且至少有 `then`；`then`/`else` 內 node 合法（error/warn）
3. **asset 可解**：每個 `line.cg` ∈ `ART` 或 `assets.cg`；`scene.mood`/`line.bgm` ∈ {night,warm,rain,stop,store}；ending badge ∈ ART（缺 fallback 才 error，否則 warn）
4. **ending 可達**：`judge()` 可能回傳的 4 tone 都有 `endingMeta` 與 `endings` 演出（`hidden_pov` → `warm_true` + `hidden_pov_tail`）（error）
5. **key allowlist**：所有 `add` key ∈ {affection,distance,awareness,regret}；所有 `set`/`flag` key ∈ flag 允許清單（**需建立 flag registry**；judge 依賴的 `sns_post_seen`、`almost_confession_flag` 必須存在）（score 用 error、unknown flag 用 warn）
6. **choice ≥2 選項**，每選項有 `label`（error）
7. **unreachable branch warning**：`gate.cond` 在合理分數域恆真/恆假（heuristic warn）
8. **orphan node warning**：無內容的 `gate` 分支、空 reaction（warn）
9. **title/label 非空**：`meta.days[d].title` 不可空（error）
10. **玩家 UI 不得顯示分數**：分數只能出現在 `dbgPanel`；`_dbg` 提示只在 dev mode（`dbgChk`）顯示（invariant）
11. **dev-only debug**：debug/score 顯示一律 gated by dev mode（invariant）

---

## E. Phase 1 第一個 coding prompt（建議）

兩個選項中，**明確推薦 (1) Story Schema Inspector / Validator（唯讀）**。
理由：把 A–D 的契約固化成可執行檢查，零 runtime 風險；任何未來編輯器的「匯出驗證」都得靠它；能立刻揪出現有資料問題（未知 flag、缺 fallback 的 cg）。預覽（選項 2）價值較低，可日後當 validator 的 human-readable 輸出附帶。

> **下一個 coding prompt（建議原文）**
>
> 「在 `projects/hoshino-akari/` 下新增一個**獨立、唯讀**的 story schema validator（純 Node script 或單一靜態頁皆可，**不得修改 `engine.js` 或任何 runtime 檔**）。它載入現有 `data/meta.js`、`chapters.js`、`assets.js`、`day1–7.js`、`endings.js`、`art.js`，依下列契約輸出 error/warning 清單（不自動修正、不寫回）：
> (a) day 1..dayCount 在 days/meta 皆存在；
> (b) node type ∈ {scene,line,choice,gate}，未知 type 警告；
> (c) 每個 `line.cg` 能由 `ART` 或 `assets.cg` 解析，否則警告缺 fallback；
> (d) `scene.mood`/`line.bgm` ∈ 合法 mood；
> (e) `add` key ∈ {affection,distance,awareness,regret}，`set`/`flag` key 對照一份由實際資料掃出的 flag registry（judge 依賴的 flag 必須存在）；
> (f) choice ≥2 選項且各有 label；
> (g) gate 有 cond 與 then；
> (h) `judge()` 可能回傳的 4 個 ending tone 都有 endingMeta 與 endings 演出；
> (i) 每個 `meta.days[d].title` 非空。
> 輸出格式：分檔分類的 error/warning 文字報告。**不做 UI 編輯、不寫檔、不接後端、不碰 Comfy。**」

---

## F. 禁止事項（本輪皆未做）

multi-tenant / multi-game / payment / subscription / lootbox / TTS runtime / Live2D runtime / LLM runtime / editor 實作 / Comfy 串接 / engine.js 大重構。

---

## 一句話總結

> **Phase 1 editor 的最小安全切入點，是先做一個唯讀的 story schema validator——把 `runDay()` 的資料契約固化成可檢查的規則（node 只有 scene/line/choice/gate、分數只有四項、結局由 judge 算、資產一律可 fallback），在不碰 runtime 的前提下先讓「資料正確性」可被驗證，之後任何編輯器都建在它上面。**
