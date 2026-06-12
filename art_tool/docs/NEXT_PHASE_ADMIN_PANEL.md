# NEXT_PHASE — Admin Panel / Fine-tune / TTS / Live2D 規格與接入順序

本文件記錄 art_tool 之後的階段需求，作為 1-A 等後續 prompt 的入口。
**核心定位：Admin Panel 先服務「單人本地製作者」，不做雲端 SaaS、不做 multi-tenant。**

接入順序：**1-A → 1-B → 1-C → 1-D**，最後才碰「Later」清單。
每階段都沿用 art_tool 既有原則：失敗印 warning 不 crash、玩家端零 AI 呼叫、不把模型檔 commit。

---

## 1-A：Admin Panel MVP

單機本地的故事製作後台。範圍：

- story / chapter / scene 管理
- dialogue 編輯
- branch（分支）編輯
- image reference 選擇（從 adopted assets 挑圖綁到 scene/dialogue）
- adopted asset browser（瀏覽已採用素材）
- validation report（缺圖、壞分支、缺角色等）
- import / export（故事 JSON 進出）
- preview player（用玩家端引擎預覽）

**1-A 明確不做**：不接真 TTS、不接真 Live2D、不做 payment、不做 multi-tenant。

> 1-A 會大量引用 art_tool 0-E 產出的 adopted assets 與 metadata（見下方「Admin Panel 引用適配性」）。

---

## 1-B：Fine-tune UI

把美術微調直接接進 Admin Panel：

- 從 Admin Panel 直接看到 generated / adopted assets
- 可為 scene / dialogue 指定圖片
- 可記錄該圖的 prompt / seed / checkpoint
- 可重抽（re-generate）/ 採用 / 替換
- 可檢查 missing asset（被引用但檔案不存在）

> 1-B 會直接重用 art_tool 的 `/api/generate`、`/api/generated`、`/api/generated/{asset_id}/adopt`，外加「scene→asset 綁定」層。

---

## 1-C：TTS Placeholder

**第一版只做 metadata / UI 欄位，不生成語音。** 預留欄位：

- `voice_id`
- `tts_engine`
- `tts_text_override`
- `audio_path`
- `auto_generate_voice`

> 介面先定義好，實際 TTS 引擎接入延後；玩家端只讀 `audio_path` 指向的已生成音檔。

---

## 1-D：Live2D / 半 2.5D Adapter

先做 **adapter interface**，不把遊戲邏輯寫死進任何 Live2D SDK。預留欄位：

- `model_id`
- `expression`
- `motion`
- `mouth_sync`
- `eye_target`
- `enter_animation`
- `exit_animation`
- `camera_zoom`
- `camera_pan`

> 用 adapter 抽象層隔離 SDK，未來可替換實作而不動故事資料。

---

## Later（不在近期）

multi-tenant、multi-game、payment、DLC、lootbox、subscription、time-limited event、
真 Live2D 商用整合、真 TTS 商用整合。

---

## Admin Panel 引用適配性審查（0-E 產出是否好被引用）

針對需求「檢查 0-E 的 adopt / metadata / generated 目錄是否適合被 Admin Panel 引用」：

### 現況（可直接重用）

- **集中式 metadata**：`public/assets/generated/metadata.json` 為一個 list，每筆有穩定 `asset_id`，
  欄位齊全（character_id / task_id / style_id / checkpoint / seed / width / height / steps / cfg /
  sampler / scheduler / positive_prompt / negative_prompt / status / problems / adopted_to）。
  → Admin Panel 可直接讀此檔或打 `GET /api/generated?character_id=&task_id=` 過濾。
- **採用 sidecar**：採用圖旁同名 `.json` 已含完整生成參數 → asset browser 可顯示來源。
- **public_path**：每筆都有 web 相對路徑（`/assets/...`），可直接放進 `<img>`。
- **唯讀掛載**：art_tool server 已 `mount /assets`，預覽圖片不需額外搬檔。
- **狀態欄位**：`status`（candidate/accepted/rejected/problem）+ `adopted_to` 足以做 asset browser 篩選。
- **一站式診斷**：`GET /api/diagnostics` 已彙整 health + config counts + generated/adopted 計數，
  Admin Panel 可用單一呼叫做首頁狀態。

### 引用前建議補強（留給 1-A/1-B，本階段不做）

1. **adopted 反查**：目前 adopted 圖只有 sidecar `.json`，沒有集中式 `adopted index`。
   1-B 若要「列出所有已採用、綁到哪個 scene」，建議加一份 `characters/`+`cg/` 的彙整索引或 API。
2. **asset 被引用計數**：metadata 尚無「被哪些 scene 引用」欄位；scene→asset 綁定屬 1-A/1-B 新增層，
   不應回頭污染 art_tool 的生成 metadata（保持單一職責）。
3. **版本管理**：adopt 命名為 `{task}_{short}_v001`，但 v002+ 的滾動與「設為基準圖」尚未實作 → 1-B 處理。
4. **並發**：metadata 寫入已用 threading.Lock 保護；若 Admin Panel 與 art_tool 同時寫，仍是同程序內安全，
   跨程序（兩個 server）則需檔案鎖——目前單機單程序不需，列為已知前提。

**結論**：0-E 的 generated / metadata / adopt 介面**已適合被 Admin Panel 引用**，
建議透過 `GET /api/generated`、`GET /api/diagnostics`、`POST /api/generated/{asset_id}/adopt` 對接，
新增的「scene 綁定 / 版本 / 引用計數」一律放在 Admin Panel 新層，不回頭改 art_tool 既有 metadata 結構。

---

## 不做雲端、不做付費（重申）

Admin Panel 與後續階段在近期**只服務單人本地製作者**：本機執行、本機檔案、無登入、無 multi-tenant、
無 payment / DLC / 訂閱。雲端 SaaS 與商業化整合一律列入「Later」，要做前先單獨立案評估授權與合規。
