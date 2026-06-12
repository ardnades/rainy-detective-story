# SMOKE_TEST_0E — 0-E 生成管線手動驗收清單

手動逐項打勾。自動化測試見 `pytest`（113 passed），本清單補的是「真機 / UI 層」驗收。

前置：`pwsh -File .\start_art_tool.ps1` 啟動後台，瀏覽器開 http://127.0.0.1:8910/art-studio。

---

## A. 無 checkpoint 狀態（ComfyUI 已開、models/checkpoints 為空）

| # | 檢查項 | 預期 |
|---|---|---|
| A1 | ComfyUI online | 狀態卡顯示「線上 online」、URL 正確 |
| A2 | checkpoint count | = 0 |
| A3 | Art Studio 燈號 | **黃燈**（可連線但缺模型） |
| A4 | checkpoint 下拉 | 顯示「No checkpoint found」且 disabled |
| A5 | Generate 按鈕 | **disabled**（文案 Generate Candidates） |
| A6 | 黃字提示 | 出現「請把 .safetensors 放進 models/checkpoints」 |
| A7 | `POST /api/generate`（無 checkpoint） | 回 `ok:false`、HTTP 400、訊息「未指定 checkpoint」 |
| A8 | 圖片 | 不產生任何圖片，`generated/` 維持只有 `.gitkeep` |
| A9 | `pytest` | 113 passed |

> 目前本機即為此狀態（ComfyUI `models/checkpoints` 回傳 `[]`）。

---

## B. 有 checkpoint 狀態（放入 .safetensors 後）

| # | 檢查項 | 預期 |
|---|---|---|
| B1 | 放入 `.safetensors` | 置於 ComfyUI `models/checkpoints/` |
| B2 | refresh ComfyUI / 重整 Art Studio | checkpoint 清單更新 |
| B3 | Art Studio 燈號 | **綠燈**（online + queue + checkpoint 都就緒） |
| B4 | checkpoint 下拉 | 出現模型、可選 |
| B5 | Generate 按鈕 | **可按** |
| B6 | 選 style/character/task/checkpoint → Generate Candidates | 回 `ok:true` + `job_id` + `status_url` |
| B7 | job 狀態 | 由 `queued`/`running` → `completed`（前端每 2s 輪詢 `/api/jobs/{id}`） |
| B8 | generated 圖落地 | `public/assets/generated/{character_id}/{task_id}/` 出現 PNG |
| B9 | metadata.json | `public/assets/generated/metadata.json` 新增對應項目 |
| B10 | grid 顯示 | 候選圖 grid 顯示圖片與 seed/checkpoint/status 等 |
| B11 | mark accepted/rejected/problem | 卡片 status 更新；problem 寫入 problems |
| B12 | adopt | 圖複製到 `public/assets/characters/` 或 `public/assets/cg/`（依 task output_kind） |
| B13 | adopt sidecar | 採用圖旁出現同名 `.json`（prompt/seed/checkpoint/...） |
| B14 | adopt 不改故事 JSON | `content/story.json` 等故事資料**完全不變** |

**MVP 終點**：星野灯 + 柔和戀愛 AVG 風 + 角色初稿 → 8 張 → grid → adopt 到 `public/assets/characters/hoshino_akari/`。

---

## C. 失敗狀態（每項的預期 UI / JSON 行為）

| # | 觸發 | 預期行為（不可 crash server） |
|---|---|---|
| C1 | ComfyUI offline | 狀態卡紅燈 + 離線提示；`/api/generate` 回 `ok:false`、不 queue |
| C2 | queue down（/prompt 不通） | 黃燈 + queue 提示；`/api/generate` 回 `ok:false`「queue 不可用」 |
| C3 | wait timeout | job → `failed`，warnings 含「逾時」；無圖落地 |
| C4 | no image in history | job → `failed`「未產出任何候選圖」 |
| C5 | image fetch failed（/view 錯） | 該張 warning，其餘照常；無圖則 job failed |
| C6 | metadata.json 損壞（手動弄壞或塞非 dict） | 自動備份為 `metadata.corrupt.{ts}.json`，改用新檔；路由回正常 JSON，不 500 |
| C7 | patch_workflow 失敗（workflow 缺 node） | `/api/generate` 回 `ok:false`「patch 失敗」，**不送 queue** |
| C8 | workflow template 缺失 | `/api/generate` 回 `ok:false`「workflow 樣板缺失」 |

---

## 快速 API 自測（PowerShell）

```powershell
# 健康
irm http://127.0.0.1:8910/api/health
# 設定摘要
irm http://127.0.0.1:8910/api/config-summary
# 一站式診斷（Admin Panel 之後可直接吃這支）
irm http://127.0.0.1:8910/api/diagnostics
# 候選圖清單
irm http://127.0.0.1:8910/api/generated
```
