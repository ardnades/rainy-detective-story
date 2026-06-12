# tools/ — 開發者工具（唯讀，不影響 player runtime）

全部唯讀：不修改 engine.js / runtime / 任何故事資料，不接 Comfy，不做可寫入的 editor / admin、
不接 payment / multi-game / login / DB。

| 檔案 | 角色 |
|---|---|
| `story_schema.js` | **共用驗證規則**（UMD：Node + 瀏覽器）。CLI 與 inspector 都呼叫 `validateGame(H, ART)`，避免規則分裂 |
| `validate_story.js` | CLI 驗證器（Node：以 `vm`/`fs` 載入 data → 跑規則 → 印報告 → exit code） |
| `story_inspector.html` / `.js` / `.css` | 瀏覽器唯讀 inspector（看 Day1–7 結構 + 驗證結果） |

---

## 1) validate_story.js — CLI 驗證器

```bash
node projects/hoshino-akari/tools/validate_story.js            # 驗證本專案 play/
node projects/hoshino-akari/tools/validate_story.js <play目錄>  # 驗證其他候選輸出（仍唯讀）
```
結束碼：有 error → `1`；只有 warning（或全通過）→ `0`。

## 2) story_inspector.html — 瀏覽器唯讀 QA Inspector

**直接用瀏覽器打開**（不需伺服器；它用相對路徑 `../play/data/*.js` 唯讀載入故事資料）：

```
projects/hoshino-akari/tools/story_inspector.html
```
- macOS：`open projects/hoshino-akari/tools/story_inspector.html`
- Windows：`start projects\hoshino-akari\tools\story_inspector.html`

### 版面
- **頂部 summary**：PASS/FAIL、error / warning / info 數、game id/version/schema/天數、READ-ONLY 標記。
- **搜尋列**（summary 下方，全頁可用）：見下。
- **左欄**：Day1–7（標題、副標、node 數、intro/outro 是否存在、該日 error/warning 計數）＋「關係 Relations」＋「結局 Endings」＋「Issues / QA」。
- **中央**：選定視圖內容。

### 看分支關係（「關係 Relations」）
一頁看清 choice / gate / flag / score / ending 的關係：
- **Flags 表**：每個 flag 被哪些 node `set`、被哪些 gate `read`、是否被 `judge()` 使用、狀態（`未使用` = set 但沒人讀、`讀但從未 set` = 可能 unreachable、`ok`）。
- **Gates 表**：每個 gate 的 `cond`、依賴的 flag/score、then/else 長度、是否「永不為真（依賴未定義 flag）」。
- **Choices 表**：每個 choice 的 id、選項數、prompt、會 set 的 flag（標 `→judge`）、score deltas。
- **Score deltas 摘要**：每個分數鍵出現次數與淨值。
- 表內每個 `loc` 可點 → 跳到對應 node card。

### 搜尋
在搜尋列輸入關鍵字按 Enter，可搜：node id、對白/text、flag、cg、bgm、se、ending key、speaker、score key。
也支援前綴精確搜：`flag:xxx`、`cg:xxx`、`se:xxx`、`who:akari`、`type:gate`、`score:affection`。
結果可點 `loc` 跳到該 Day/section 的 node card（會閃示高亮）。

### Issue filter（「Issues / QA」）
可切換：`all` / `errors` / `warnings` / `info` / `by file`（下拉）/ `by rule`（下拉，rule id 如 `gate-cond-flag-undefined`、`choice-options`…）。每條 issue 可點 `loc` 跳到來源 node。

### Node card（QA 資訊）
type / speaker / text 摘要 / mood / speed / cg / bgm / se / `+score` / `set flag`（若為 judge 依賴的 flag 標 `→judge`）；
choice 展開選項（label / add / flag / reaction）；gate 展開 cond（含引用 flag/score）/ then / else；
底部 `→` 顯示 outgoing（gate 真假分支、choice 匯合）；有 error/warning 的 node/option 就地標示（含 rule id）。

### 不可變性防護
inspector 載入後對 `window.HOSHINO` / `window.ART` 做**深快照**（含函式字串），渲染後若偵測到被改動，頂部會顯示紅色「不可變性違規」橫幅。正常情況不會出現（inspector 全程唯讀）。

### 0-J：編輯預覽 v3（主劇情文字，實驗，預設關閉）
工具列的「編輯預覽：OFF/ON」按鈕。**預設 OFF＝純唯讀**；按下 ON 才進入：
- 開放編輯的欄位（在 Day 視圖編輯面板，逐項顯示、**不需手編 JSON**）：
  - `meta.days[d].title`、`meta.days[d].subtitle`
  - `chapters[d].intro` / `chapters[d].outro` 內**文字節點的 `text`**
  - **`H.days[d]` 主劇情中 `line.text`（string）**：逐句一個輸入框，顯示 node index、原始文字預覽、編輯欄、「● 已修改」標記；附「只看已修改」切換。
  - 非文字節點（scene/choice/gate…）顯示為**唯讀**，不提供輸入、不自動補欄位。
  - **刻意不開放**：choices / gates / cond / judge / effects(add/set/flag) / score / flags / speaker(who) / route / ending / assets / art 引用、node `id` / `type` 等結構欄位。
- 編輯只作用於 inspector **內部 clone**（深拷貝），**絕不** mutate `window.HOSHINO` / `window.ART` / 任何專案檔案。
- **Validate Draft** 按鈕呼叫 `story_schema.validateGame(clonedH, clonedART)`：
  - 有 error → 顯示 errors/warnings，**封鎖所有 export / copy**。
  - 0 error → 才出現 **Apply Assistant（套用助手）**。

#### 變更 Diff 前後對照（B）
編輯面板「查看變更 Diff」按鈕：
- 列出**所有已改文字欄位**，每處顯示 `node path`、**來源：`play/data/<檔>`**、**原文（紅、刪除線）/ 草稿（綠）**。
- **只列 changed fields**；非文字 node 不會出現。
- **可在 Validate 前查看**（純對照、不解鎖任何 export）；**Export 仍需 Validate Draft 0 error 才開放**。

#### Apply Assistant 套用助手（A+，Validate PASS 後）
- **安全橫幅**：「本工具不會修改任何檔案；只產生套用草稿。請人工確認後再寫入。」
- **Change Summary**：title / subtitle / intro / outro / day text 各改了幾處。
- **需要更新清單**：依序列出會動到哪些檔，及每檔的具體項目（如 `Day1 title`、`intro[0]`、`line #17`）。
- **分檔 Copy**：每個檔一顆 `Copy <檔名> Patch` 按鈕（不再是單一大 snippet）：
  - `meta.js` → 替換 meta 的 `days:`；`chapters.js` → 替換整個 `window.HOSHINO.chapters = {...};`；
  - `dayN.js` → **只列被改的行**：`window.HOSHINO.days[d][i].text = "...";`。
- **不會自動寫檔 / 不 auto-apply / 無 git / 無 backup / 無 rollback**（那些屬之後的 C 階段）。請人工把對應 patch 貼回該檔。
- **本工具不寫檔、不覆寫專案檔**；要套用請自行把對應段落貼回。

> 規則與 CLI 完全相同（共用 `story_schema.js` 的 `validateGame`）；關係分析用同檔的 `analyzeRelations`。
> inspector 預設唯讀；即便 0-H 編輯預覽也只動內部 clone、不寫任何檔案，可直接 `file://` 開啟。

---

## 檢查項目（對應 `spec/phase1-data-contract.md`）
1. Day 完整性：`1..dayCount` 在 `M.days` 與 `H.days` 皆存在；`day.title` 非空（`subtitle` 空只 warn）；`chapters[d].intro/outro` 若存在須為陣列
2. Node type：只允許 `scene/line/choice/gate`，未知 type warn
3. scene：`mood` 須為合法 mood（night/warm/rain/stop/store）
4. line：`who` ∈ `M.names`；`speed` ∈ normal/slow/instant；`cg` 可由 `assets.cg` 或 `ART` 解析（否則 warn 缺 fallback）；`bgm` 為合法 mood；`add` key 限四分數；`se` 在音效啟用時須有音檔（關閉時彙整成 INFO）；`text` 含 debug/分數字樣 warn
5. choice：`options` ≥2 且各有 `label`；`option.add` key 限四分數；`option.reaction` 遞迴檢查
6. gate：`cond`/`then` 必填、`else` 若存在須為陣列、遞迴檢查；`cond` 引用的 flag 須被 set 過、分數變數須合法
7. Ending：`endingMeta` 必備 4 tone；badge 可解析；`judge()` 回傳 tone 須有 `endingMeta` 與 endings 演出（`hidden_pov` 依賴 `warm_true`+`hidden_pov_tail`）；judge 依賴的 flag 須被 set 過
8. Invariant：玩家 text 不應含 debug/分數字樣（warn）

## 0-I Freeze checklist（真人改稿前手動驗收；詳見 `FREEZE_0I.md`）
- [ ] 開啟 `story_inspector.html`（`file://`）
- [ ] 確認**預設唯讀**（無編輯輸入框）
- [ ] 按「編輯預覽 ON」
- [ ] 改 title / subtitle / intro / day line.text
- [ ] 按「查看變更 Diff」
- [ ] 確認 Diff 有**原文 / 草稿 / 來源檔**
- [ ] 確認此時 **Export / Apply 仍封鎖**
- [ ] 按 `Validate Draft`
- [ ] 確認 **Apply Assistant 顯示分檔 patch**（meta.js / chapters.js / dayN.js）
- [ ] 分別 Copy meta.js patch / chapters.js patch / dayN.js patch
- [ ] 製造非法草稿（title 留空）
- [ ] 確認**封鎖 export / apply**（blocked=1、export box=0）
- [ ] `node tools/validate_story.js` 現有資料 → `Errors:0 / Warnings:0 / exit 0`
- [ ] 破壞複本 → `exit 1`
- [ ] 確認**無 JS error**
- [ ] 確認 **H / ART 深快照不變**（無不可變性違規橫幅）

## 已知限制（TODO）
深層 unreachable / always-true / always-false 可達性分析尚未做（成本較高，留待後續）。
