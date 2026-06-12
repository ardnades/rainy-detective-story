"""美術生成 Job pipeline（0-E）。

建在 0-B/0-C 之上：patch_workflow → queue_prompt → wait_for_result → image_importer。
job 用 in-memory store（JOBS）；server 重啟後 job 消失可接受，但落地圖與 metadata 留在硬碟。

安全前置檢查（任一不過就不送生成、回 failed job，不 raise）：
- checkpoint 空 / ComfyUI offline / queue 不可用 / workflow template 缺失 / patch 失敗 / queue 失敗。

設計：comfy_client.* 與 image_importer.* 透過模組屬性呼叫，方便 pytest monkeypatch；
時鐘 / job_id / rng / sleep 等不確定性可注入，測試零依賴真 ComfyUI。
"""
from __future__ import annotations

import random
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import comfy_client
import image_importer

BATCH_MIN, BATCH_MAX = 1, 8
DIM_MIN, DIM_MAX = 512, 1536
SEED_MAX = 2 ** 32 - 1

# in-memory job store
JOBS: dict[str, "GenerationJob"] = {}


def _warn(msg: str) -> None:
    print(f"[art_tool.generation_service][warning] {msg}", file=sys.stderr)


def _now_iso(now: Optional[str] = None) -> str:
    return now if now is not None else datetime.now().isoformat(timespec="seconds")


# =====================================================================
# dataclasses
# =====================================================================
@dataclass
class GenerationRequest:
    style_id: str
    character_id: str
    task_id: str
    checkpoint: str
    batch_count: int
    width: int
    height: int
    seed: Optional[int] = None
    extra_positive_prompt: str = ""
    extra_negative_prompt: str = ""


@dataclass
class GenerationJob:
    job_id: str
    status: str                       # queued / running / completed / failed
    created_at: str
    updated_at: str
    request: GenerationRequest
    message: str = ""
    warnings: list[str] = field(default_factory=list)
    prompt_id: Optional[str] = None
    output_files: list[str] = field(default_factory=list)
    metadata_path: Optional[str] = None
    error: Optional[str] = None
    # 內部輔助（批次）
    prompt_ids: list[str] = field(default_factory=list)
    prompt_seeds: list[int] = field(default_factory=list)
    prompt_summary: Optional[dict] = None


@dataclass
class GenerationResult:
    ok: bool
    job_id: str
    message: str
    warnings: list[str] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    metadata: list[dict] = field(default_factory=list)


# =====================================================================
# 1. 組 prompt（不碰 ComfyUI）
# =====================================================================
def build_generation_prompt(
    request: GenerationRequest,
    *,
    styles: list[dict],
    characters: list[dict],
    tasks: list[dict],
    rng: Optional[random.Random] = None,
) -> dict:
    """組合 positive/negative/seed 等。回 resolved summary（含 warnings），不呼叫 ComfyUI。"""
    warnings: list[str] = []
    style = next((s for s in styles if s.get("id") == request.style_id), None)
    character = next((c for c in characters if c.get("character_id") == request.character_id), None)
    task = next((t for t in tasks if t.get("id") == request.task_id), None)

    if style is None:
        warnings.append(f"找不到畫風 style_id={request.style_id!r}")
    if character is None:
        warnings.append(f"找不到角色 character_id={request.character_id!r}")
    if task is None:
        warnings.append(f"找不到用途 task_id={request.task_id!r}")

    def _join(parts):
        return ", ".join(p.strip() for p in parts if p and str(p).strip())

    positive = _join([
        (style or {}).get("positive_prefix", ""),
        (character or {}).get("visual_core", ""),
        (task or {}).get("prompt_suffix", ""),
        request.extra_positive_prompt,
    ])
    negative = _join([
        (style or {}).get("negative_prompt", ""),
        (task or {}).get("extra_negative", ""),
        request.extra_negative_prompt,
    ])

    if request.seed is not None:
        seed = int(request.seed)
        seed_mode = "fixed"
    else:
        r = rng or random.Random()
        seed = r.randint(0, SEED_MAX)
        seed_mode = "auto"

    return {
        "positive": positive,
        "negative": negative,
        "seed": seed,
        "seed_mode": seed_mode,
        "width": request.width,
        "height": request.height,
        "checkpoint": request.checkpoint,
        "steps": (style or {}).get("steps", 28),
        "cfg": (style or {}).get("cfg", 7.0),
        "sampler": (style or {}).get("sampler", "euler"),
        "scheduler": (style or {}).get("scheduler", "normal"),
        "loras": (style or {}).get("loras") or [],
        "style_id": request.style_id,
        "style_name": (style or {}).get("name"),
        "character_id": request.character_id,
        "character_name": (character or {}).get("name"),
        "task_id": request.task_id,
        "task_name": (task or {}).get("name"),
        "output_kind": (task or {}).get("output_kind"),
        "warnings": warnings,
    }


def _validate_request(request: GenerationRequest) -> list[str]:
    errs: list[str] = []
    if not (BATCH_MIN <= request.batch_count <= BATCH_MAX):
        errs.append(f"batch_count 需在 {BATCH_MIN}-{BATCH_MAX}（收到 {request.batch_count}）")
    if not (DIM_MIN <= request.width <= DIM_MAX):
        errs.append(f"width 需在 {DIM_MIN}-{DIM_MAX}（收到 {request.width}）")
    if not (DIM_MIN <= request.height <= DIM_MAX):
        errs.append(f"height 需在 {DIM_MIN}-{DIM_MAX}（收到 {request.height}）")
    if not (request.checkpoint or "").strip():
        errs.append("未指定 checkpoint")
    return errs


def _fail(job: GenerationJob, message: str, warnings: Optional[list[str]] = None,
          now: Optional[str] = None) -> GenerationJob:
    job.status = "failed"
    job.message = message
    job.error = message
    if warnings:
        job.warnings.extend(warnings)
    job.updated_at = _now_iso(now)
    return job


# =====================================================================
# 2. 建立 job（驗證 + 前置檢查 + queue；不阻塞輪詢）
# =====================================================================
def create_generation_job(
    request: GenerationRequest,
    *,
    app_config,
    styles: list[dict],
    characters: list[dict],
    tasks: list[dict],
    jobs: Optional[dict] = None,
    now: Optional[str] = None,
    gen_job_id: Optional[str] = None,
    rng: Optional[random.Random] = None,
) -> GenerationJob:
    store = JOBS if jobs is None else jobs
    job_id = gen_job_id or uuid.uuid4().hex
    ts = _now_iso(now)
    job = GenerationJob(job_id=job_id, status="queued", created_at=ts, updated_at=ts,
                        request=request)
    store[job_id] = job

    # a. 基本驗證
    errs = _validate_request(request)
    if errs:
        return _fail(job, "表單驗證失敗：" + "；".join(errs), errs, now)

    # b. health 前置檢查
    health = comfy_client.health_check(app_config)
    if not health.online or not health.system_ok:
        return _fail(job, "ComfyUI 離線或系統不通，無法生成。", now=now)
    if not health.queue_ok:
        return _fail(job, "ComfyUI queue 不可用，無法生成。", now=now)
    if not health.checkpoints_ok:
        return _fail(job, "ComfyUI 未找到任何 checkpoint，請放入 .safetensors 後再試。", now=now)
    if request.checkpoint not in (health.checkpoints or []):
        return _fail(job, f"指定的 checkpoint 不在可用清單中：{request.checkpoint!r}",
                     [f"可用：{health.checkpoints}"], now)

    # c. workflow 樣板
    workflow_tpl = comfy_client.load_workflow_template(app_config.workflow_path)
    if workflow_tpl is None:
        return _fail(job, "workflow 樣板缺失或讀取失敗，無法生成。", now=now)

    # d. 組 prompt
    prompt = build_generation_prompt(request, styles=styles, characters=characters,
                                     tasks=tasks, rng=rng)
    if prompt["warnings"]:
        return _fail(job, "設定解析失敗。", prompt["warnings"], now)
    job.prompt_summary = prompt

    # e. 逐張 patch + queue（batch 用不同 seed）
    url = app_config.comfyui.url
    # 畫風有指定 LoRA 才查可用清單；缺的 LoRA 由 patch_workflow skip + warning（不擋生成）。
    style_loras = prompt.get("loras") or []
    available_loras = comfy_client.get_loras(url)[0] if style_loras else []
    for i in range(request.batch_count):
        seed_i = (prompt["seed"] + i) % (SEED_MAX + 1)
        patched = comfy_client.patch_workflow(
            workflow_tpl,
            positive_prompt=prompt["positive"], negative_prompt=prompt["negative"],
            checkpoint=prompt["checkpoint"], width=prompt["width"], height=prompt["height"],
            seed=seed_i, steps=prompt["steps"], cfg=prompt["cfg"],
            sampler=prompt["sampler"], scheduler=prompt["scheduler"],
            loras=style_loras, available_loras=available_loras,
        )
        if patched.warnings:
            job.warnings.extend(w for w in patched.warnings if w not in job.warnings)
        if not patched.ok:
            return _fail(job, "workflow patch 失敗，未送出生成。", patched.warnings, now)
        qr = comfy_client.queue_prompt(url, patched.workflow, client_id=job_id)
        if not qr.ok:
            return _fail(job, f"送入 ComfyUI 佇列失敗：{qr.message}", now=now)
        job.prompt_ids.append(qr.prompt_id)
        job.prompt_seeds.append(seed_i)

    job.status = "running"
    job.prompt_id = job.prompt_ids[0] if job.prompt_ids else None
    job.message = f"已送入佇列，共 {len(job.prompt_ids)} 張，等待 ComfyUI 生成中。"
    job.updated_at = _now_iso(now)
    return job


# =====================================================================
# 3. 執行 job（輪詢 + 匯入；可在背景跑）
# =====================================================================
def run_generation_job(
    job: GenerationJob,
    *,
    app_config,
    now: Optional[str] = None,
    sleep=None,
    http_get=None,
    generated_dir=None,
    metadata_path=None,
    timeout_seconds: float = 180.0,
    interval_seconds: float = 2.0,
) -> GenerationResult:
    sleep_fn = sleep if sleep is not None else time.sleep
    get_fn = http_get if http_get is not None else comfy_client._default_http_get
    url = app_config.comfyui.url

    job.status = "running"
    job.updated_at = _now_iso(now)

    files: list[str] = []
    metas: list[dict] = []
    warnings: list[str] = []
    errors: list[str] = []   # ComfyUI 執行錯誤的可 debug 細節（供失敗訊息分流）

    for idx, prompt_id in enumerate(job.prompt_ids):
        result = comfy_client.wait_for_result(
            url, prompt_id, http_get=get_fn, sleep=sleep_fn,
            timeout_seconds=timeout_seconds, interval_seconds=interval_seconds,
        )
        if result.status == "error":
            warnings.append(result.message)
            errors.append(result.message)
            continue
        if result.status != "completed" or result.entry is None:
            warnings.append(f"prompt_id={prompt_id} 等待結果逾時。")
            continue

        refs, w = image_importer.parse_comfy_history_for_images(result.entry)
        warnings.extend(w)
        seed_i = job.prompt_seeds[idx] if idx < len(job.prompt_seeds) else None
        summary = job.prompt_summary or {}
        meta_fields = {
            "style_id": summary.get("style_id"),
            "checkpoint": summary.get("checkpoint"),
            "seed": seed_i,
            "width": summary.get("width"),
            "height": summary.get("height"),
            "steps": summary.get("steps"),
            "cfg": summary.get("cfg"),
            "sampler": summary.get("sampler"),
            "scheduler": summary.get("scheduler"),
            "positive_prompt": summary.get("positive"),
            "negative_prompt": summary.get("negative"),
            "job_id": job.job_id,
        }
        for ref in refs:
            data, fw = image_importer.fetch_comfy_image(url, ref, http_get=get_fn)
            if fw:
                warnings.append(fw)
                continue
            entry = image_importer.save_generated_image(
                data,
                character_id=job.request.character_id,
                task_id=job.request.task_id,
                source_ref=ref,
                metadata_fields=meta_fields,
                generated_dir=generated_dir,
                metadata_path=metadata_path,
                now=now,
            )
            if entry is None:
                warnings.append(f"圖片儲存失敗：{ref.get('filename')}")
                continue
            files.append(entry["public_path"])
            metas.append(entry)

    job.output_files = files
    job.warnings.extend(warnings)
    job.metadata_path = str(metadata_path or image_importer.METADATA_PATH)
    job.updated_at = _now_iso(now)

    if files:
        job.status = "completed"
        job.message = f"完成，產出 {len(files)} 張候選圖。"
        ok = True
    else:
        job.status = "failed"
        if errors:
            # 有 ComfyUI 執行錯誤 → 訊息明確顯示「生成失敗」與細節，而非籠統「未產出」。
            job.message = errors[0]
            job.error = job.error or errors[0]
        else:
            job.message = "未產出任何候選圖（等待逾時或無圖輸出）。"
            job.error = job.error or "no images produced"
        ok = False

    return GenerationResult(ok=ok, job_id=job.job_id, message=job.message,
                            warnings=warnings, files=files, metadata=metas)
