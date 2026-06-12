# 0-I Freeze — Story Inspector 工具凍結檢查點

> **Freeze 日期：2026-06-12（JST）**
> 目的：把 `tools/` 的 Story Inspector / Validator 凍結成「真人改稿前的安全基準」，**防止改稿期間工具行為漂移**。
> 本檢查點**不新增能力、不寫 play/data、不改 engine、不改 validator**。

## 凍結的檔案（行為基準）
- `tools/story_schema.js` — 共用規則 `validateGame` ＋ 關係分析 `analyzeRelations`（純函式、UMD）
- `tools/validate_story.js` — CLI（Node `vm`/`fs` 載入 → 委派規則 → 報告 → exit code）
- `tools/story_inspector.html` / `story_inspector.js` / `story_inspector.css` — 瀏覽器唯讀 QA Inspector ＋ 編輯預覽（0-H/0-I/0-J）＋ Diff（B）＋ Apply Assistant（A+）
- `tools/README.md` — 用法與限制

## 目前工具能力（凍結快照）
**Validator（CLI）**
- 以 `validateGame` 對 `play/data` 做契約檢查（day 完整性、node type、scene mood、line who/speed/cg/bgm/se/add/text、choice options≥2+label+add+reaction、gate cond/then/else+flag/score、ending 4 tone+badge+演出+hidden_pov 依賴、judge tone/flag）。
- issues 帶 `rule` 代碼；有 error → exit 1，否則 exit 0。

**Inspector（瀏覽器，唯讀為主）**
- 結構檢視：Day1–7 node 清單、choice/gate 展開、結局狀態、逐 node issue 標示。
- 關係視圖（QA）：Flags / Gates（含 neverTrue/alwaysTrue）/ Choices / Score deltas。
- 搜尋：node id / text / flag / cg / bgm / se / ending / speaker / score（含前綴搜）。
- Issue filter：all / errors / warnings / info / by file / by rule。
- 不可變性深快照防護（H 與 ART 皆深比對）。

**編輯預覽（實驗，預設 OFF）**
- 可編欄位**僅限**：`meta.days[d].title`、`meta.days[d].subtitle`、`chapters[d].intro/outro` 的 `text`、`H.days[d]` 主劇情 `line.text`。
- 編輯只改**內部 deep clone**；Diff 前後對照（B）；Apply Assistant 分檔 patch（A+）。

## 鎖定行為（不得漂移）
1. 預設**純唯讀**，editable count = 0。
2. 必須手動「編輯預覽 ON」才可編。
3. 編輯只改內部 deep clone，**不 mutate** `window.HOSHINO` / `window.ART`。
4. 可編欄位只限上述四類**文字**欄位；非文字 node（scene/choice/gate）**唯讀**、不自動補欄位。
5. **不開放**：choices / gates / cond / judge / effects(add/set/flag) / score / flags / speaker(who) / route / ending / asset(cg/bgm/se/mood) / art 引用 / node `id` / `type`。
6. **Diff** 可在 Validate 前查看（顯示原文/草稿/來源檔），但**不解鎖** Apply Assistant。
7. **Apply Assistant** 只在 `Validate Draft` PASS 且 **0 error** 後出現。
8. Apply Assistant 只產生**分檔 patch**（meta.js / chapters.js / dayN.js 各一），**不寫入任何檔案**。
9. `dayN.js` patch **只列被改的行**（`window.HOSHINO.days[d][i].text = "...";`），不輸出整個 day array。
10. 無改動時顯示「尚未編輯」或等價提示。
11. validate fail 時：`blocked = 1`、export box = 0、Apply Assistant 不渲染。

## 已驗證測試（2026-06-12，jsdom repo 外 temp harness ＋ CLI）
| 項目 | 結果 |
|---|---|
| defaultEditableBeforeOn | **0** |
| editableCountAfterOn（day1） | **77** |
| diffRowsBeforeValidate | **4** |
| diffHasOldNew / diffHasSrc | **true / true** |
| exportStillGatedDuringDiff | **true** |
| Validate PASS 後 apply files | **meta.js / chapters.js / day1.js** |
| 分檔 copy buttons | **3** |
| Change Summary 表 / Safety banner | **1 / 1** |
| invalid title → blocked / export box | **1 / 0** |
| 原始 H / ART 深快照不變 | **true / true** |
| 不可變性違規橫幅 / JS error | **0 / 0** |
| CLI 現有資料 | **Errors:0 / Warnings:0 / exit 0** |
| CLI 破壞複本 | **exit 1** |

## 不可跨越的邊界（Freeze 紅線）
- 不寫入 / 不覆寫 `play/data/*`、`art.js`、`chapters.js`、`endings.js`、`engine.js`。
- 不 auto-apply、不 git commit、不 backup、不 rollback。
- 不引入任何 runtime / repo dependency（jsdom 僅為 repo 外 optional dev harness）。
- 不在 runtime 接 Comfy / TTS / Live2D / LLM / payment / multi-game / login / DB。

## 真人改稿時的安全使用流程
1. 瀏覽器開 `tools/story_inspector.html`（`file://` 即可）。
2. 用搜尋 / 關係視圖 / Issues 做 QA；確認頂部 summary 為 PASS。
3. 要改文字時按「編輯預覽 ON」，只改 title/subtitle/intro/outro/day line.text。
4. 按「查看變更 Diff」核對原文/草稿/來源檔。
5. 按 `Validate Draft`；**有 error 先修**，0 error 才會出現 Apply Assistant。
6. 用 Apply Assistant 的**分檔 Copy** 把對應 patch **人工**貼回該檔（meta.js / chapters.js / dayN.js）。
7. 貼回後，跑 `node tools/validate_story.js` 確認仍 `Errors:0`；必要時跑專案 `scripts/check-text.ps1`（憲法字檢）。

## C phase 需要另開 phase 的條件（先不做）
真正「工具自動寫檔」屬跨越唯讀邊界，須在**劇本穩定後**另開 phase，且具備：
- 寫檔前**備份**、寫檔後可**還原（rollback）**。
- 與 `validate_story.js` ＋ 專案 `check-text.ps1`（憲法）**整合為寫入閘門**。
- **rollback 測試**與失敗回復策略。

## Post-Freeze backlog（凍結期間不實作，只記錄）
- snippet「一鍵套用」助手的更順流程（仍人工確認）。
- 草稿 diff 的字級高亮（目前為整段原/新對照）。
- 編輯延伸到更多文字欄位前，先評估是否仍屬「低風險純文字」。
- C phase 寫檔系統（備份/還原/憲法整合/rollback）。
