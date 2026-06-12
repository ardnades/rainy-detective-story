# Art Tool — 本地 ComfyUI 美術生成輔助工具

## 1. 這是什麼

- 一個**本地製作端**工具，把已安裝的 ComfyUI 當成「生圖引擎」，用 API 包成遊戲後台的一鍵生圖功能。
- 目前用途：角色圖 / 透明立繪 / 事件 CG / 背景 / SNS 宣傳圖的**候選生成**、metadata 管理、採用（adopt）到正式 assets。
- **不是玩家端功能**。玩家端（`public/*`）是純靜態 HTML/CSS/JS，只讀取已生成的 PNG/WebP。
- **玩家端永遠不呼叫任何 AI API、不含任何 API key**。AI 只在製作端（本工具）使用。

> 你不需要學 ComfyUI 的 node。本工具把 ComfyUI 當黑箱引擎，你只在後台按按鈕。

## 2. 啟動方法

1. 開啟 **ComfyUI Desktop**（本工具不會自動啟動它）。
2. 確認 `COMFYUI_URL`：預設自動偵測 `http://127.0.0.1:8000`（Desktop 版）→ `http://127.0.0.1:8188`（傳統版）。
   要覆蓋就在 `art_tool/.env` 設定（範本見 `.env.example`）。
3. 執行啟動腳本（首次帶 `-Install` 裝依賴）：
   ```powershell
   pwsh -File .\start_art_tool.ps1            # 一般啟動
   pwsh -File .\start_art_tool.ps1 -Install   # 首次：先 pip install -r requirements.txt
   ```
4. 瀏覽器開啟 **http://127.0.0.1:8910/art-studio**。

## 3. checkpoint 放置說明

- 把 `.safetensors` 模型放入 ComfyUI 的 `models/checkpoints/` 目錄。
- 回到 Art Studio **重新整理本頁**。
- checkpoint 下拉出現模型、狀態卡轉**綠燈**後，才可以生成。
- 本工具**不會自動下載任何模型**，也不會自動啟動 ComfyUI。

## 4. 生成流程

1. 選 **畫風 style**
2. 選 **角色 character**
3. 選 **用途 task**（角色初稿 / 透明立繪 / 事件 CG / 背景 / SNS 宣傳圖）
4. 選 **checkpoint**
5. （可選）填 **生成張數 / 寬高 / seed**；seed 留空＝自動隨機
6. 按 **Generate Candidates**
7. 等 job 從 `queued` / `running` 到 `completed`
8. 在 **候選圖 grid** 查看結果
9. 對每張圖 **mark**：採用標記 / 拒絕 / 問題標記（臉不一致、手壞……）
10. 按 **adopt** 把圖複製到正式 assets（characters 或 cg）

也可以先按 **Dry Run Validate** 只驗證表單、不送 ComfyUI。

## 5. 輸出位置

| 內容 | 路徑 |
|---|---|
| 候選圖 | `public/assets/generated/{character_id}/{task_id}/` |
| 候選 metadata（集中式） | `public/assets/generated/metadata.json` |
| 採用：角色圖 | `public/assets/characters/{character_id}/` |
| 採用：CG | `public/assets/cg/` |
| 採用 sidecar metadata | 與採用圖**同名** `.json` |

- 候選圖（`generated/`）**不進 repo**（已 gitignore）。
- 採用圖（`characters/`、`cg/`）是玩家端正式素材，**會進 repo**。

## 6. 限制

- `JOBS` 是 **in-memory**：server 重啟後 job 狀態消失（但 metadata 與圖片會保留在硬碟）。
- 大量並發生成**未做正式 queue 節流**（單機單人工具夠用）。
- **角色一致性仍未解決**（未接 ControlNet / IP-Adapter / LoRA）。
- **TTS / Live2D / Admin Panel 尚未接入**（規格見 `docs/NEXT_PHASE_ADMIN_PANEL.md`）。

## 7. 授權與安全提醒

- **checkpoint / LoRA / Live2D model / TTS voice 的商用授權，請自行確認**。不同模型授權差異很大（部分禁止商用、部分要求標註）。
- 若要**商業上架**，請就模型授權、肖像/IP、分級等諮詢專家——本工具不提供法律意見。
- **不要把大型模型檔（.safetensors / .ckpt / Live2D model）commit 進 repo**。
- 所有角色均為 18 歲以上；生成時遵守各角色設定年齡與 `characters.json` 的 `avoid` 約束。

## 相關文件

- `docs/SMOKE_TEST_0E.md` — 真機驗收清單（有/無 checkpoint、失敗狀態）。
- `docs/NEXT_PHASE_ADMIN_PANEL.md` — 下一階段（Admin Panel / fine-tune / TTS / Live2D）規格與接入順序。
