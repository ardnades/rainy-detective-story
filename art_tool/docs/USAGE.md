# art_tool 使用手順（ComfyUI 美術生成後台）

本文件說明如何啟動 art_tool 後台、生成候選圖、用 C4-A 的評分/標籤/篩選管理、以及採用（adopt）到正式素材目錄。僅操作說明，不含玩家端內容。

> ⚠️ **Port 重點**：官方啟動腳本 `start_art_tool.ps1` 預設 **8910**。文件全程以 **8910** 為準。
> （開發過程中曾用 8099 做臨時 smoke test，那只是手動指定的暫時 port，非官方預設。）

---

## 1. 啟動後台

在 `art_tool` 目錄執行：

```powershell
# 首次（安裝依賴 requirements.txt）
pwsh -File .\start_art_tool.ps1 -Install

# 之後（直接啟動，預設 port 8910）
pwsh -File .\start_art_tool.ps1

# 自訂 port（例如 8099）
pwsh -File .\start_art_tool.ps1 -Port 8099
```

等價的手動指令（須在 `art_tool` 目錄）：

```powershell
python -m uvicorn server:app --host 127.0.0.1 --port 8910
```

腳本不會自動啟動 ComfyUI、也不會自動下載模型。

---

## 2. 開哪個 URL

- 後台 Art Studio：**http://127.0.0.1:8910/art-studio**
- 根路徑 **`/`** 會 **redirect（302/307）到 `/art-studio`**，兩者都能進。

---

## 3. 確認服務在線

| 服務 | 檢查方式 |
|------|----------|
| **ComfyUI Desktop** | 開 ComfyUI Desktop；瀏覽 **http://127.0.0.1:8000**（`/system_stats` 回 JSON 200）。或看後台「ComfyUI 狀態」卡：**綠燈＝正常**、黃燈＝缺 checkpoint/queue、紅燈＝離線。 |
| **art_tool 後台** | 開 **http://127.0.0.1:8910/api/diagnostics** 回 JSON（含 `comfyui.status_level`、`config.can_generate`、`assets.generated_count/adopted_count`）。或頁面能載入即在線。 |

---

## 4. 設定生成參數（「生成設定」卡）

### 選畫風
「**畫風**」下拉選 **「柔和戀愛 AVG 風」**（value = `soft_romance_avg`）。

### 選角色
「**角色**」下拉選 **「星野灯」**（value = `hoshino_akari`）。

### 選用途
「**用途**」下拉選 **「角色初稿」**（value = `character_rough`，output_kind = character）。

### 其他欄位
- 生成張數、寬 / 高、Seed（留空＝自動隨機）
- **Checkpoint**：選 `anima_baseV10.safetensors`

---

## 5. 生成候選圖

1.（可選）按 **「Dry Run Validate」**：純表單驗證，不送 ComfyUI。
2. 確認狀態卡為**綠燈**（online + queue + checkpoint + workflow 都就緒，`can_generate=true`），**「Generate Candidates」** 才可按。
3. 按下後「**生成工作 (Job)**」面板顯示 `queued → running → completed`；完成後候選圖自動載入下方「候選圖」grid。
4. 失敗時 Job 面板會顯示訊息；若 ComfyUI 執行錯誤，會顯示「ComfyUI 生成失敗：…」含 node / 例外細節（非只 timeout）。

---

## 6. 用 C4-A 管理候選圖（「候選圖」區）

### 星等 rating
每張卡的 ★★★★★：點第 N 顆＝設 N 星；**再點同一星等＝清回 0**。

### tags
卡上「**加 tag…**」輸入框打字 + **Enter** 新增；tag chip 上的 **×** 移除。
（tags＝正向標籤，與「**標記問題…**」下拉寫入的缺陷標記 `problems` **分開**，互不混用。）

### filter（篩選）
上方「篩選」下拉：
- **全部**
- **已採用**：以 `adopted_to` 判斷（不只看 status）
- **已拒絕**：`status = rejected`
- **未審**：`status = candidate` 且尚未採用

### sort（排序）
上方「排序」下拉：
- **最新**：依 `created_at` 由新到舊
- **評分**：依 `rating` 由高到低

右側顯示「篩選後 N / 總數 張」。

---

## 7. 採用（adopt）

點該候選卡的 **「採用 (adopt)」**。因 `character_rough` 的 `output_kind = character`，會複製成正式素材：

```
public/assets/characters/hoshino_akari/character_rough_<asset末8碼>_v001.png
public/assets/characters/hoshino_akari/character_rough_<asset末8碼>_v001.json   ← sidecar（prompt / seed / rating / tags 等）
```

同時該候選 `status` 轉 `accepted`、`adopted_to` 設為該路徑，diagnostics 的 `adopted_count` +1。

---

## 8. adopted 後玩家端讀圖路徑

```
/assets/characters/hoshino_akari/character_rough_<...>_v001.png
```

玩家端網站以 `public/` 為根，故 public path 去掉 `public` 前綴即為玩家端網址路徑。

---

## 9. 後台打不開時的檢查順序

1. **server 有沒有啟動**：跑 `start_art_tool.ps1` 的終端是否還開著、有無錯誤；用 `http://127.0.0.1:8910/api/diagnostics` 測。
2. **依賴缺不缺**：若提示缺套件 → `pwsh -File .\start_art_tool.ps1 -Install`（或 `python -m pip install -r requirements.txt`）。
3. **port 被占用 / 開錯 port**：確認瀏覽的是啟動時印出的 port（預設 8910）；衝突就用 `-Port 其他號碼`。
4. **看終端錯誤訊息**：uvicorn 啟動失敗會直接印原因（語法錯、import 失敗等）。

> **重要註記：ComfyUI 離線「不會」導致後台打不開。**
> 後台頁面照常開啟，只是「ComfyUI 狀態」卡顯示離線、且 **「Generate Candidates」按鈕變灰（disabled）**。
> 因此「後台打不開」通常是 server / 依賴 / port 的問題，**不是** ComfyUI 的問題。

---

## 附：常用 URL 速查

| 用途 | URL |
|------|-----|
| Art Studio 後台 | http://127.0.0.1:8910/art-studio |
| 後台診斷 JSON | http://127.0.0.1:8910/api/diagnostics |
| ComfyUI Desktop | http://127.0.0.1:8000 |
| ComfyUI 系統狀態 | http://127.0.0.1:8000/system_stats |
