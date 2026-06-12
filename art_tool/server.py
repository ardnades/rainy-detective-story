"""Art Tool 本地製作端 Server（0-D）。

只做「狀態檢視」：ComfyUI 健康卡、設定摘要、表單顯示、dry-run 表單驗證。
本步【不】生圖、【不】POST /prompt、【不】queue、【不】wait、【不】下載圖、【不】動玩家端。

設計：
- import 時不連 ComfyUI。所有 ComfyUI / 設定呼叫都在 request handler 內，
  且透過 config.* / comfy_client.* 模組屬性呼叫，方便 pytest monkeypatch。
- ComfyUI offline 不影響 server 啟動；錯誤一律呈現在頁面 / JSON，不 crash。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

# 嚴格非負整數：只允許半形數字（這些欄位皆非負）。
# 拒絕 int() 會默默接受的底線 '8_3_2'→832、正負號 '+6'/'-5' 等畸形輸入。
_INT_RE = re.compile(r"[0-9]+")

from fastapi import BackgroundTasks, FastAPI, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import comfy_client
import config
import generation_service
import image_importer

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
PUBLIC_ASSETS_DIR = BASE_DIR.parent / "public" / "assets"

MODE_LABEL = "0-E generation enabled"
BATCH_MIN, BATCH_MAX = 1, 8
DIM_MIN, DIM_MAX = 512, 1536

CHECKPOINT_EMPTY_HINT = (
    "ComfyUI 已連線，但未找到 checkpoint。"
    "請把 .safetensors 模型放進 ComfyUI 的 models/checkpoints 目錄，然後重新整理本頁。"
)
OFFLINE_HINT = "請先開啟 ComfyUI Desktop，或在 art_tool/.env 設定 COMFYUI_URL，然後重新整理本頁。"
QUEUE_DOWN_HINT = (
    "ComfyUI 已連線，但 queue 不可用（/prompt 無回應），暫時無法送生成。"
    "請稍候重新整理，或重啟 ComfyUI。"
)

app = FastAPI(title="AI 美術生成工具 (0-E)")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
# 唯讀掛載 public/assets，讓後台 grid 能顯示生成圖（不修改玩家端檔案，只是讀取顯示）
PUBLIC_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(PUBLIC_ASSETS_DIR)), name="assets")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# =====================================================================
# 共用：載入清單與狀態
# =====================================================================
def _styles() -> list[dict]:
    return (config.load_art_styles() or {}).get("styles", [])


def _characters() -> list[dict]:
    return (config.load_characters() or {}).get("characters", [])


def _tasks() -> list[dict]:
    return (config.load_art_tasks() or {}).get("tasks", [])


def _status_level(health: comfy_client.ComfyHealth) -> str:
    """green / yellow / red。green 需同時 online + system_ok + queue_ok + checkpoints_ok。"""
    if not health.online or not health.system_ok:
        return "red"
    if not health.checkpoints_ok or not health.queue_ok:
        return "yellow"
    return "green"


def _health_to_dict(health: comfy_client.ComfyHealth) -> dict:
    return {
        "online": health.online,
        "url": health.url,
        "message": health.message,
        "system_ok": health.system_ok,
        "queue_ok": health.queue_ok,
        "gpu": health.gpu,
        "vram_total_mb": health.vram_total_mb,
        "vram_free_mb": health.vram_free_mb,
        "checkpoints": health.checkpoints,
        "checkpoints_ok": health.checkpoints_ok,
        "warnings": health.warnings,
    }


def _lora_status(health: comfy_client.ComfyHealth) -> dict:
    """彙整各畫風需要的 LoRA 與 ComfyUI 實際可用清單，算出 found / missing。

    缺 LoRA 不影響 can_generate（非阻擋），僅供 UI 黃字提示「畫風可能不像」。
    """
    available: list[str] = []
    if getattr(health, "online", False) and getattr(health, "url", None):
        available, _ = comfy_client.get_loras(health.url)
    required: set = set()
    by_style: list[dict] = []
    for s in _styles():
        items = []
        for lora in (s.get("loras") or []):
            name = lora.get("name") if isinstance(lora, dict) else None
            if not name:
                continue
            required.add(name)
            items.append({"name": name, "found": name in available})
        if items:
            by_style.append({
                "id": s.get("id"), "name": s.get("name"), "loras": items,
                "missing": [it["name"] for it in items if not it["found"]],
            })
    missing = sorted(n for n in required if n not in available)
    return {"available": available, "required": sorted(required),
            "missing": missing, "by_style": by_style}


# =====================================================================
# Routes
# =====================================================================
@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/art-studio")


@app.get("/art-studio")
def art_studio(request: Request):
    cfg = config.build_app_config()
    health = comfy_client.health_check(cfg)
    workflow = comfy_client.load_workflow_template(cfg.workflow_path)
    workflow_loaded = workflow is not None
    can_generate = bool(
        health.online and health.system_ok and health.queue_ok
        and health.checkpoints_ok and workflow_loaded
    )
    lora_status = _lora_status(health)

    context = {
        "mode_label": MODE_LABEL,
        "health": health,
        "status_level": _status_level(health),
        "can_generate": can_generate,
        "checkpoint_empty_hint": CHECKPOINT_EMPTY_HINT,
        "offline_hint": OFFLINE_HINT,
        "queue_down_hint": QUEUE_DOWN_HINT,
        "comfyui_path": cfg.comfyui_path,
        "art_config_dir": str(cfg.art_config_dir),
        "workflow_path": str(cfg.workflow_path),
        "workflow_loaded": workflow_loaded,
        "styles": _styles(),
        "characters": _characters(),
        "tasks": _tasks(),
        "batch_min": BATCH_MIN,
        "batch_max": BATCH_MAX,
        "dim_min": DIM_MIN,
        "dim_max": DIM_MAX,
        "lora_status": lora_status,
        "missing_by_style": {b["id"]: b["missing"] for b in lora_status["by_style"]},
    }
    return templates.TemplateResponse(request, "art_studio.html.j2", context)


@app.get("/api/health")
def api_health() -> JSONResponse:
    cfg = config.build_app_config()
    health = comfy_client.health_check(cfg)
    return JSONResponse(_health_to_dict(health))


@app.get("/api/config-summary")
def api_config_summary() -> JSONResponse:
    cfg = config.build_app_config()
    workflow = comfy_client.load_workflow_template(cfg.workflow_path)
    return JSONResponse({
        "comfyui_url": cfg.comfyui.url,
        "comfyui_path": cfg.comfyui_path.path,
        "art_config_dir": str(cfg.art_config_dir),
        "workflow_path": str(cfg.workflow_path),
        "styles_count": len(_styles()),
        "characters_count": len(_characters()),
        "tasks_count": len(_tasks()),
        "workflow_loaded": workflow is not None,
    })


def validate_dry_run(
    *,
    style_id: str,
    character_id: str,
    task_id: str,
    batch_count: str,
    width: str,
    height: str,
    seed: str,
    styles: list[dict],
    characters: list[dict],
    tasks: list[dict],
) -> dict:
    """純驗證，不碰 ComfyUI。回 {ok, message, warnings, resolved}。"""
    warnings: list[str] = []
    resolved: dict = {}

    style = next((s for s in styles if s.get("id") == style_id), None)
    if style is None:
        warnings.append(f"找不到畫風 style_id={style_id!r}")
    else:
        resolved["style"] = {"id": style_id, "name": style.get("name")}

    character = next((c for c in characters if c.get("character_id") == character_id), None)
    if character is None:
        warnings.append(f"找不到角色 character_id={character_id!r}")
    else:
        resolved["character"] = {"id": character_id, "name": character.get("name")}

    task = next((t for t in tasks if t.get("id") == task_id), None)
    if task is None:
        warnings.append(f"找不到用途 task_id={task_id!r}")
    else:
        resolved["task"] = {"id": task_id, "name": task.get("name")}

    def _parse_int(label: str, raw: str, lo: int, hi: int):
        s = str(raw).strip()
        if not _INT_RE.fullmatch(s):
            warnings.append(f"{label} 必須是整數（收到 {raw!r}）")
            return None
        value = int(s)
        if not (lo <= value <= hi):
            warnings.append(f"{label} 需在 {lo}-{hi}（收到 {value}）")
            return None
        return value

    bc = _parse_int("生成張數 batch_count", batch_count, BATCH_MIN, BATCH_MAX)
    if bc is not None:
        resolved["batch_count"] = bc
    w = _parse_int("width", width, DIM_MIN, DIM_MAX)
    if w is not None:
        resolved["width"] = w
    h = _parse_int("height", height, DIM_MIN, DIM_MAX)
    if h is not None:
        resolved["height"] = h

    seed_str = (seed or "").strip()
    if seed_str == "":
        resolved["seed_mode"] = "auto"
        resolved["seed_note"] = "未填 seed，生成時將自動隨機產生。"
    elif _INT_RE.fullmatch(seed_str):
        resolved["seed"] = int(seed_str)
        resolved["seed_mode"] = "fixed"
    else:
        warnings.append(f"seed 必須是整數或留空（收到 {seed!r}）")

    ok = not warnings
    message = "表單驗證通過（dry-run，未送 ComfyUI）。" if ok else "表單有問題，請修正後再試。"
    return {"ok": ok, "message": message, "warnings": warnings, "resolved": resolved}


@app.post("/api/dry-run-form")
def api_dry_run_form(
    style_id: str = Form(...),
    character_id: str = Form(...),
    task_id: str = Form(...),
    batch_count: str = Form(...),
    width: str = Form(...),
    height: str = Form(...),
    seed: str = Form(""),
) -> JSONResponse:
    result = validate_dry_run(
        style_id=style_id, character_id=character_id, task_id=task_id,
        batch_count=batch_count, width=width, height=height, seed=seed,
        styles=_styles(), characters=_characters(), tasks=_tasks(),
    )
    return JSONResponse(result)


# =====================================================================
# 0-E：生成 / job / 候選圖
# =====================================================================
def _job_to_dict(job: generation_service.GenerationJob) -> dict:
    req = job.request
    return {
        "job_id": job.job_id,
        "status": job.status,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "message": job.message,
        "warnings": job.warnings,
        "prompt_id": job.prompt_id,
        "output_files": job.output_files,
        "metadata_path": job.metadata_path,
        "error": job.error,
        "request": {
            "style_id": req.style_id, "character_id": req.character_id,
            "task_id": req.task_id, "checkpoint": req.checkpoint,
            "batch_count": req.batch_count, "width": req.width,
            "height": req.height, "seed": req.seed,
        },
    }


@app.post("/api/generate")
def api_generate(
    background_tasks: BackgroundTasks,
    style_id: str = Form(...),
    character_id: str = Form(...),
    task_id: str = Form(...),
    checkpoint: str = Form(""),
    batch_count: str = Form("8"),
    width: str = Form("832"),
    height: str = Form("1216"),
    seed: str = Form(""),
    extra_positive_prompt: str = Form(""),
    extra_negative_prompt: str = Form(""),
) -> JSONResponse:
    # 先做不碰 ComfyUI 的表單驗證
    dry = validate_dry_run(
        style_id=style_id, character_id=character_id, task_id=task_id,
        batch_count=batch_count, width=width, height=height, seed=seed,
        styles=_styles(), characters=_characters(), tasks=_tasks(),
    )
    if not dry["ok"]:
        return JSONResponse({"ok": False, "message": dry["message"],
                             "warnings": dry["warnings"]}, status_code=400)

    resolved = dry["resolved"]
    req = generation_service.GenerationRequest(
        style_id=style_id, character_id=character_id, task_id=task_id,
        checkpoint=(checkpoint or "").strip(),
        batch_count=resolved["batch_count"], width=resolved["width"], height=resolved["height"],
        seed=resolved.get("seed"),
        extra_positive_prompt=extra_positive_prompt, extra_negative_prompt=extra_negative_prompt,
    )

    cfg = config.build_app_config()
    job = generation_service.create_generation_job(
        req, app_config=cfg, styles=_styles(), characters=_characters(), tasks=_tasks(),
    )
    if job.status == "failed":
        return JSONResponse({"ok": False, "job_id": job.job_id, "status": job.status,
                             "message": job.message, "warnings": job.warnings}, status_code=400)

    # 背景輪詢 + 匯入，不阻塞此 request
    background_tasks.add_task(generation_service.run_generation_job, job, app_config=cfg)
    return JSONResponse({"ok": True, "job_id": job.job_id, "status": job.status,
                         "message": job.message, "status_url": f"/api/jobs/{job.job_id}"})


@app.get("/api/jobs/{job_id}")
def api_job(job_id: str) -> JSONResponse:
    job = generation_service.JOBS.get(job_id)
    if job is None:
        return JSONResponse({"ok": False, "message": f"找不到 job_id={job_id}"}, status_code=404)
    return JSONResponse({"ok": True, **_job_to_dict(job)})


@app.get("/api/generated")
def api_generated(character_id: Optional[str] = None, task_id: Optional[str] = None) -> JSONResponse:
    items = image_importer.load_all_metadata()
    if character_id:
        items = [e for e in items if e.get("character_id") == character_id]
    if task_id:
        items = [e for e in items if e.get("task_id") == task_id]
    return JSONResponse({"ok": True, "count": len(items), "items": items})


@app.post("/api/generated/{asset_id}/mark")
def api_mark(asset_id: str, status: str = Form(...), problems: str = Form("")) -> JSONResponse:
    if status not in ("accepted", "rejected", "problem", "candidate"):
        return JSONResponse({"ok": False, "message": f"不支援的 status={status!r}"}, status_code=400)
    problem_list = [p.strip() for p in problems.split(",") if p.strip()] if problems else None
    entry, warnings = image_importer.update_generated_metadata(
        asset_id, status=status, problems=problem_list)
    if entry is None:
        return JSONResponse({"ok": False, "message": "找不到該候選圖", "warnings": warnings},
                            status_code=404)
    return JSONResponse({"ok": True, "asset_id": asset_id, "status": entry.get("status"),
                         "problems": entry.get("problems")})


@app.post("/api/generated/{asset_id}/annotate")
def api_annotate(
    asset_id: str,
    rating: str = Form(None),
    tags: str = Form(None),
    status: str = Form(None),
    problems: str = Form(None),
) -> JSONResponse:
    """C4-A：更新候選圖的 rating / tags（也可選填 status / problems）。

    與 /mark 並存、不改其行為。rating 非法（非 0-5 整數）回 400。
    tags 做基本清理（trim / 去空 / 去重）。problems 維持缺陷標記語意、不與 tags 混用。
    """
    kwargs: dict = {}
    if rating is not None and str(rating).strip() != "":
        value, err = image_importer.parse_rating(rating)
        if err:
            return JSONResponse({"ok": False, "message": err}, status_code=400)
        kwargs["rating"] = value
    if tags is not None:
        kwargs["tags"] = image_importer.normalize_tags(tags)
    if status is not None and str(status).strip() != "":
        if status not in ("accepted", "rejected", "problem", "candidate"):
            return JSONResponse({"ok": False, "message": f"不支援的 status={status!r}"},
                                status_code=400)
        kwargs["status"] = status
    if problems is not None:
        kwargs["problems"] = [p.strip() for p in problems.split(",") if p.strip()]
    if not kwargs:
        return JSONResponse({"ok": False, "message": "沒有可更新的欄位"}, status_code=400)

    entry, warnings = image_importer.update_generated_metadata(asset_id, **kwargs)
    if entry is None:
        return JSONResponse({"ok": False, "message": "找不到該候選圖", "warnings": warnings},
                            status_code=404)
    return JSONResponse({"ok": True, "asset_id": asset_id,
                         "rating": entry.get("rating"), "tags": entry.get("tags"),
                         "status": entry.get("status"), "problems": entry.get("problems")})


@app.post("/api/generated/{asset_id}/adopt")
def api_adopt(asset_id: str) -> JSONResponse:
    entry = image_importer.get_metadata_entry(asset_id)
    if entry is None:
        return JSONResponse({"ok": False, "message": "找不到該候選圖"}, status_code=404)
    task = next((t for t in _tasks() if t.get("id") == entry.get("task_id")), None)
    result = image_importer.adopt_asset(entry, task)
    if not result["ok"]:
        return JSONResponse({"ok": False, "message": result["message"],
                             "warnings": result["warnings"]}, status_code=400)
    image_importer.update_generated_metadata(
        asset_id, status="accepted", adopted_to=result["dest_public_path"])
    return JSONResponse({"ok": True, "asset_id": asset_id,
                         "adopted_to": result["dest_public_path"], "message": result["message"],
                         "warnings": result["warnings"]})


@app.get("/api/diagnostics")
def api_diagnostics() -> JSONResponse:
    """一站式診斷摘要：health + config counts + 候選/採用計數。

    供 Admin Panel（下一階段）做首頁狀態的單一入口，唯讀、不觸發生成。
    """
    cfg = config.build_app_config()
    health = comfy_client.health_check(cfg)
    workflow = comfy_client.load_workflow_template(cfg.workflow_path)
    workflow_loaded = workflow is not None
    items = image_importer.load_all_metadata()
    adopted = [e for e in items if e.get("adopted_to")]
    can_generate = bool(
        health.online and health.system_ok and health.queue_ok
        and health.checkpoints_ok and workflow_loaded
    )
    return JSONResponse({
        "mode": MODE_LABEL,
        "comfyui": {
            "online": health.online,
            "url": health.url,
            "status_level": _status_level(health),
            "queue_ok": health.queue_ok,
            "checkpoints_ok": health.checkpoints_ok,
            "checkpoint_count": len(health.checkpoints),
            "gpu": health.gpu,
            "vram_free_mb": health.vram_free_mb,
        },
        "config": {
            "styles_count": len(_styles()),
            "characters_count": len(_characters()),
            "tasks_count": len(_tasks()),
            "workflow_loaded": workflow_loaded,
            "can_generate": can_generate,
        },
        "assets": {
            "generated_count": len(items),
            "adopted_count": len(adopted),
            "active_jobs": len(generation_service.JOBS),
        },
        # LoRA：available / required / missing / by_style。缺 LoRA 不影響 can_generate。
        "loras": _lora_status(health),
    })
