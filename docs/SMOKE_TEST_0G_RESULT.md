# 0-G 真生圖 Smoke Test 結果

**日期：** 2026-06-13
**範圍：** 0-G 真生圖 smoke test。期間經使用者明確授權，擴展為「為 Anima 模型建置 ComfyUI 生成管線」（見修復 C）。未碰 Admin Panel / DB / TTS / Live2D / player 故事與程式碼。
**結論：✅ 全項通過。** Pipeline 端到端可生圖、採用、落地；玩家端零變動；pytest 114 passed。

---

## 逐項驗證清單

| # | 項目 | 結果 | 說明 |
|---|------|------|------|
| 1 | checkpoint 下拉有模型 | ✅ | `/models/checkpoints` 列出 `anima_baseV10.safetensors`（+2 LoRA） |
| 2 | `/api/diagnostics` green、`can_generate=true` | ✅ | GPU=RTX 4090、VRAM free ≈ 22.9 GB |
| 3 | Generate 可按 / job 建立 | ✅ | `POST /api/generate` 回 `ok:true`、`status:running`、8 張入列 |
| 4 | job：queued/running → completed | ✅ | ~70s 內 8 張全部完成 |
| 5 | 8 張候選圖生成 | ✅ | 柔和戀愛 AVG 風、符合 canon（20 歲偶像、清秀成年臉、seed 變化） |
| 6 | adopt ≥ 1 到 `public/assets/characters/hoshino_akari/` | ✅ | `character_rough_5b98ca66_v001.png` + `.json` sidecar |
| 7 | `generated_count` / `adopted_count` 正確增加 | ✅ | 8 / 1 |
| 8 | `/assets` 可讀 adopted 圖（public_path） | ✅ | HTTP 200, 723418 bytes |
| 9 | **pytest ≥ 113 passed** | ✅ **114 passed** | 含新增回歸測試 |
| 10 | 玩家端 `public/*` 程式碼不變 | ✅ | app.js / *.html / style.css md5 全與基線一致 |
| 11 | 故事 JSON 不變 | ✅ | `content/story.json`、`content/endings.json` md5 與基線一致 |

> 註：`public/assets/characters/` 與 `public/assets/generated/` 收到生成/採用圖屬美術工具預期輸出；玩家端「不變」指遊戲程式碼與故事資料，均已雜湊驗證未動。

---

## 修復 A：workflow `_comment` 導致 ComfyUI `/prompt` 回 500（最小 pipeline bug）

### 根因
`patch_workflow()` 只 deepcopy + patch 節點，未剔除 workflow 頂層的 `_comment` 說明鍵。ComfyUI 把每個頂層鍵當節點驗證，遇字串值 → 500。

### 修復（`art_tool/comfy_client.py`）
deepcopy 後只保留合法節點（`dict` 且含 `class_type`）：
```python
wf = {
    k: v for k, v in copy.deepcopy(workflow).items()
    if isinstance(v, dict) and "class_type" in v
}
```
驗證：修復前 `/prompt`→500；剔除後→`200 {"prompt_id":..., "node_errors":{}}`。新增回歸測試 `test_patch_strips_non_node_keys_for_clean_prompt`。

---

## 阻擋 B → 修復 C：checkpoint 為 Anima DiT，需專屬管線（經授權擴 scope）

### 診斷
修復 A 後，8 個 prompt 進 ComfyUI 全部 `status=error`：`CLIPTextEncode: clip input is invalid: None`。拆 safetensors 標頭發現 `anima_baseV10.safetensors` 為 **Anima Base v1.0**（CircleStone Labs × Comfy Org，2B 動漫文生圖 **DiT**，685 個 `net.*` tensor、含 `llm_adapter`），**不是標準 SD/SDXL all-in-one checkpoint**——`CheckpointLoaderSimple` 無法載入其 CLIP/VAE。

### 正確管線（取自官方 `circlestone-labs/Anima` 內嵌 workflow）
| 元件 | 值 |
|------|----|
| 模型載入 | `UNETLoader`，檔放 `models/diffusion_models/`（非 checkpoints/） |
| 文字編碼器 | `CLIPLoader(clip_name=qwen_3_06b_base.safetensors, type=stable_diffusion)` |
| VAE | `VAELoader(vae_name=qwen_image_vae.safetensors)` |
| latent | `EmptyLatentImage`（標準），無 ModelSamplingAuraFlow |
| 取樣 | `KSampler` sampler=`er_sde`、scheduler=`simple`、cfg=`4.0`、steps=`30` |
| 提示 | 正向加 `score_7, safe`；負向加 `score_1, score_2, score_3, artist name` |

> 初次嘗試誤用 Gemma 編碼器 + Flux VAE（Lumina2 假設），導致 KSampler 維度不符 `(39x2304 and 1024x2048)`；查官方後改用 Qwen3-0.6B 編碼器 + Qwen Image VAE 即成功出圖。錯誤檔已刪除。

### 下載的外部資產（放入 ComfyUI 模型目錄）
- `C:\ComfyUI\models\text_encoders\qwen_3_06b_base.safetensors`（1.19 GB）
- `C:\ComfyUI\models\vae\qwen_image_vae.safetensors`（0.25 GB）
- `C:\ComfyUI\models\diffusion_models\anima_baseV10.safetensors`（由 checkpoints/ 複製 4.18 GB，供 UNETLoader）

### art_tool 變更
| 檔案 | 變更 |
|------|------|
| `art_tool/comfy_client.py` | `patch_workflow()`：(1) 剔除非節點鍵（修復 A）；(2) 模型載入相容 `UNETLoader.unet_name` 或 `CheckpointLoaderSimple.ckpt_name`；(3) width/height 相容 `EmptyLatentImage` 與 `EmptySD3LatentImage` |
| `art_tool/art_workflows/base_txt2img_api.json` | 改為 Anima txt2img 圖（UNETLoader + Qwen CLIP/VAE + EmptyLatentImage + er_sde/simple/cfg4） |
| `art_tool/art_config/art_styles.json` | `soft_romance_avg`：checkpoint 綁 `anima_baseV10.safetensors`、sampler→`er_sde`、scheduler→`simple`、cfg→`4.0`、steps→`30`、加 Anima score tags |
| `art_tool/tests/test_comfy_client.py` | 新增 `_comment` 剔除回歸測試；node 4 斷言由 CheckpointLoaderSimple→UNETLoader |
| `art_tool/tests/test_config.py`、`test_generation_service.py` | 同步更新被 config 變更影響的斷言（checkpoint、sampler） |

---

## 次要觀察（未修，僅記錄）

1. **錯誤偵測延遲**：`wait_for_result()` 只在 history 出現 `outputs` 時回傳，對 `status=error` 無 outputs 的 prompt 會輪詢到逾時。建議日後辨識 `status.status_str == "error"` 提早結束。
2. **診斷準度**：`/api/diagnostics` 的 `can_generate` 只看 checkpoint 數量，不檢查架構相容性（已由本次正確配置 workflow 化解，但偵測邏輯本身未強化）。

---

## 驗證指令摘要
- `pytest`：114 passed。
- 端到端：`POST /api/generate`（8 張）→ job completed → 8 候選 → adopt 1 → `generated_count=8`、`adopted_count=1` → `/assets` 200。
- 不變性：玩家端程式碼 6 檔 + 故事 JSON 2 檔 md5 全與基線一致。
