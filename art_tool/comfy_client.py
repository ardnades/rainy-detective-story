"""ComfyUI client wrapper（0-C）。

建在 0-B config.py 之上：URL 由 config.build_app_config / detect_comfyui_url 決定，
本檔不重寫 URL 偵測，只負責與 ComfyUI 對話。

涵蓋：
- health_check：/system_stats（online/GPU/VRAM）、/prompt（queue_ok）、checkpoints 列表
- load_workflow_template：讀 base_txt2img_api.json
- patch_workflow：對最簡 txt2img 做 6 個 patch 點（deepcopy，不動原物件）
- queue_prompt：POST /prompt 取 prompt_id
- wait_for_result：輪詢 /history/{prompt_id}（sleep 可注入，不真等）

設計原則（沿用 0-B）：
- 所有 HTTP 皆可注入，pytest 不需真 ComfyUI、不真生圖。
- 失敗一律印 stderr warning + 回 result/None，不 raise 到外層。
- checkpoint 為空是已知合法狀態，不可 crash。
本步不下載圖片、不呼叫 /view、不接前端、不動玩家端。
"""
from __future__ import annotations

import copy
import sys
from dataclasses import dataclass, field
from typing import Callable, Optional

# 對外 HTTP 介面型別
HttpGet = Callable[..., object]
HttpPost = Callable[..., object]

DEFAULT_TIMEOUT: float = 5.0
DEFAULT_POST_TIMEOUT: float = 30.0
_HISTORY_REQUEST_TIMEOUT: float = 10.0


def _warn(msg: str) -> None:
    print(f"[art_tool.comfy_client][warning] {msg}", file=sys.stderr)


# =====================================================================
# 預設 HTTP（延遲匯入 httpx，讓本檔在沒裝 httpx 時仍可匯入與被 mock 測）
# =====================================================================
def _default_http_get(url: str, timeout: float = DEFAULT_TIMEOUT) -> object:
    import httpx

    return httpx.get(url, timeout=timeout)


def _default_http_post(url: str, *, json: Optional[dict] = None,
                       timeout: float = DEFAULT_POST_TIMEOUT) -> object:
    import httpx

    return httpx.post(url, json=json, timeout=timeout)


# =====================================================================
# 結果資料結構
# =====================================================================
@dataclass
class ComfyHealth:
    online: bool
    url: Optional[str]
    message: str
    system_ok: bool
    queue_ok: bool
    gpu: Optional[str]
    vram_total_mb: Optional[int]
    vram_free_mb: Optional[int]
    checkpoints: list[str]
    checkpoints_ok: bool
    warnings: list[str] = field(default_factory=list)


@dataclass
class WorkflowPatchResult:
    ok: bool
    workflow: Optional[dict]
    message: str
    patched_nodes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class QueueResult:
    ok: bool
    prompt_id: Optional[str]
    message: str
    raw: Optional[dict] = None


@dataclass
class WaitResult:
    """wait_for_result 的結果。status 為 completed / timeout / error。

    - completed：entry 為含 outputs 的 history entry。
    - error：ComfyUI 執行失敗，message/node_id/node_type/error 帶可 debug 細節。
    - timeout：輪詢用盡仍未完成。
    """
    status: str                       # "completed" | "timeout" | "error"
    entry: Optional[dict] = None      # completed 時的 history entry
    message: str = ""
    node_id: Optional[str] = None
    node_type: Optional[str] = None
    error: Optional[str] = None       # error 時的 exception 摘要

    @property
    def ok(self) -> bool:
        return self.status == "completed"


# =====================================================================
# 共用：安全取 JSON
# =====================================================================
def _safe_get_json(http_get: HttpGet, target: str, timeout: float):
    """回 (data, error_msg)。任何失敗都回 error_msg 而非 raise。"""
    try:
        resp = http_get(target, timeout=timeout)
    except Exception as exc:  # 連線被拒 / timeout 等
        return None, f"請求失敗 {target}：{exc}"
    status = getattr(resp, "status_code", None)
    if status != 200:
        return None, f"{target} 回應狀態 {status}"
    try:
        return resp.json(), None
    except Exception as exc:
        return None, f"{target} JSON 解析失敗：{exc}"


def _resolve_url(config_or_url) -> Optional[str]:
    """接受 AppConfig / UrlDetection / str / None，取出 URL。"""
    if config_or_url is None:
        return None
    if isinstance(config_or_url, str):
        return config_or_url.strip() or None
    comfy = getattr(config_or_url, "comfyui", None)  # AppConfig
    if comfy is not None:
        return getattr(comfy, "url", None)
    return getattr(config_or_url, "url", None)        # UrlDetection 直接傳入


def _bytes_to_mb(value) -> Optional[int]:
    if isinstance(value, (int, float)) and value >= 0:
        return int(value / 1024 / 1024)
    return None


# =====================================================================
# checkpoints 取得（不硬依賴單一 endpoint）
# =====================================================================
def get_checkpoints(url: str, *, http_get: HttpGet = _default_http_get,
                    timeout: float = DEFAULT_TIMEOUT) -> tuple[list[str], list[str]]:
    """回 (checkpoints, warnings)。

    1. 先試 GET /models/checkpoints（回 list[str]）。
    2. 取不到或空 → fallback 解析 /object_info/CheckpointLoaderSimple 的 ckpt_name 清單。
    3. 兩者都不行 → 回 ([], warnings)，不 crash。
    """
    base = url.rstrip("/")
    warnings: list[str] = []

    data, err = _safe_get_json(http_get, f"{base}/models/checkpoints", timeout=timeout)
    if err:
        warnings.append(f"/models/checkpoints 取得失敗：{err}")
    elif isinstance(data, list):
        names = [x for x in data if isinstance(x, str)]
        if names:
            return names, warnings
        # 空 list → 可能真的沒模型，往下 fallback 再確認一次
    elif data is not None:
        warnings.append("/models/checkpoints 回應格式非預期（非 list）")

    data2, err2 = _safe_get_json(
        http_get, f"{base}/object_info/CheckpointLoaderSimple", timeout=timeout)
    if err2:
        warnings.append(f"/object_info 取得失敗：{err2}")
        return [], warnings
    try:
        ckpt = data2["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    except (KeyError, TypeError, IndexError) as exc:
        warnings.append(f"/object_info ckpt_name 解析失敗：{exc}")
        return [], warnings
    if isinstance(ckpt, list):
        return [x for x in ckpt if isinstance(x, str)], warnings
    warnings.append("/object_info ckpt_name 格式非預期")
    return [], warnings


def get_loras(url: str, *, http_get: HttpGet = _default_http_get,
              timeout: float = DEFAULT_TIMEOUT) -> tuple[list[str], list[str]]:
    """回 (loras, warnings)。

    1. 先試 GET /models/loras（回 list[str]）。
    2. 取不到 → fallback 解析 /object_info/LoraLoader 的 lora_name 清單。
    3. 兩者都不行 → 回 ([], warnings)，不 crash。空 LoRA 是合法狀態。
    """
    base = url.rstrip("/")
    warnings: list[str] = []

    data, err = _safe_get_json(http_get, f"{base}/models/loras", timeout=timeout)
    if err:
        warnings.append(f"/models/loras 取得失敗：{err}")
    elif isinstance(data, list):
        return [x for x in data if isinstance(x, str)], warnings
    elif data is not None:
        warnings.append("/models/loras 回應格式非預期（非 list）")

    data2, err2 = _safe_get_json(
        http_get, f"{base}/object_info/LoraLoader", timeout=timeout)
    if err2:
        warnings.append(f"/object_info/LoraLoader 取得失敗：{err2}")
        return [], warnings
    try:
        names = data2["LoraLoader"]["input"]["required"]["lora_name"][0]
    except (KeyError, TypeError, IndexError) as exc:
        warnings.append(f"/object_info lora_name 解析失敗：{exc}")
        return [], warnings
    if isinstance(names, list):
        return [x for x in names if isinstance(x, str)], warnings
    warnings.append("/object_info lora_name 格式非預期")
    return [], warnings


def _parse_system_stats(data) -> tuple[Optional[str], Optional[int], Optional[int]]:
    if not isinstance(data, dict):
        return None, None, None
    devices = data.get("devices")
    if isinstance(devices, list) and devices and isinstance(devices[0], dict):
        d0 = devices[0]
        return d0.get("name"), _bytes_to_mb(d0.get("vram_total")), _bytes_to_mb(d0.get("vram_free"))
    return None, None, None


def _check_queue(base: str, http_get: HttpGet, timeout: float) -> tuple[bool, Optional[str]]:
    """GET /prompt：200 視為 queue 可用。"""
    try:
        resp = http_get(f"{base}/prompt", timeout=timeout)
    except Exception as exc:
        return False, f"/prompt 請求失敗：{exc}"
    if getattr(resp, "status_code", None) == 200:
        return True, None
    return False, f"/prompt 回應狀態 {getattr(resp, 'status_code', None)}"


# =====================================================================
# health_check
# =====================================================================
def health_check(config_or_url, *, http_get: HttpGet = _default_http_get,
                 timeout: float = DEFAULT_TIMEOUT) -> ComfyHealth:
    """檢查 ComfyUI 健康狀態。checkpoint 為空仍可 online=True。"""
    url = _resolve_url(config_or_url)
    if not url:
        return ComfyHealth(
            online=False, url=None,
            message="尚未設定 ComfyUI URL，請啟動 ComfyUI 或在 art_tool/.env 設定 COMFYUI_URL。",
            system_ok=False, queue_ok=False, gpu=None,
            vram_total_mb=None, vram_free_mb=None,
            checkpoints=[], checkpoints_ok=False, warnings=[],
        )

    base = url.rstrip("/")
    data, err = _safe_get_json(http_get, f"{base}/system_stats", timeout=timeout)
    if err:
        _warn(err)
        return ComfyHealth(
            online=False, url=url,
            message=f"無法連線 ComfyUI（{url}）。請確認 ComfyUI 已啟動。",
            system_ok=False, queue_ok=False, gpu=None,
            vram_total_mb=None, vram_free_mb=None,
            checkpoints=[], checkpoints_ok=False, warnings=[err],
        )

    warnings: list[str] = []
    gpu, vram_total_mb, vram_free_mb = _parse_system_stats(data)

    queue_ok, qerr = _check_queue(base, http_get, timeout)
    if qerr:
        warnings.append(qerr)
        _warn(qerr)

    checkpoints, cwarn = get_checkpoints(base, http_get=http_get, timeout=timeout)
    warnings.extend(cwarn)
    for w in cwarn:
        _warn(w)
    checkpoints_ok = len(checkpoints) > 0

    if not checkpoints_ok:
        message = (
            f"ComfyUI 可連線（{url}），但未找到 checkpoint，"
            "請把 .safetensors 放進 models/checkpoints 後重試。"
        )
    else:
        message = f"ComfyUI 連線正常（{url}），找到 {len(checkpoints)} 個 checkpoint。"

    return ComfyHealth(
        online=True, url=url, message=message,
        system_ok=True, queue_ok=queue_ok, gpu=gpu,
        vram_total_mb=vram_total_mb, vram_free_mb=vram_free_mb,
        checkpoints=checkpoints, checkpoints_ok=checkpoints_ok, warnings=warnings,
    )


# =====================================================================
# workflow 載入
# =====================================================================
def load_workflow_template(path, *, opener: Callable = open) -> Optional[dict]:
    """讀 workflow JSON。缺檔 / JSON 錯 / OSError → None + warning。"""
    import json
    try:
        with opener(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        _warn(f"workflow 樣板不存在：{path}")
        return None
    except json.JSONDecodeError as exc:
        _warn(f"workflow JSON 格式錯誤：{path}：{exc}")
        return None
    except OSError as exc:
        _warn(f"workflow 讀取失敗：{path}：{exc}")
        return None


# =====================================================================
# workflow patch（依 class_type 搜尋，不寫死 node id）
# =====================================================================
def _find_node_by_class(wf: dict, class_type: str) -> tuple[Optional[str], Optional[dict]]:
    for nid, node in wf.items():
        if isinstance(node, dict) and node.get("class_type") == class_type:
            return nid, node
    return None, None


def _link_node_id(link) -> Optional[str]:
    """ComfyUI 連線格式為 [node_id, output_index]，取 node_id。"""
    if isinstance(link, (list, tuple)) and link:
        return str(link[0])
    return None


def _inject_loras(wf, ksid, ks, pos_id, neg_id, loras, available_loras) -> tuple[list[str], list[str]]:
    """在 model/clip 來源與 KSampler/CLIPTextEncode 之間動態串接 0～N 個 LoraLoader。

    - 只注入存在於 available_loras 的 LoRA；不存在的 skip + warning（不讓生成失敗）。
    - available_loras 為 None 時不做存在性過濾（注入全部，供單元測試）。
    - 0 個有效 LoRA → 不動 workflow（行為與無 LoRA 一致）。
    回 (patched, warnings)。
    """
    patched: list[str] = []
    warnings: list[str] = []
    if not loras or not isinstance(ks, dict):
        return patched, warnings

    model_link = ks.get("inputs", {}).get("model")
    pos_node = wf.get(pos_id) if pos_id else None
    neg_node = wf.get(neg_id) if neg_id else None
    clip_link = None
    for node in (pos_node, neg_node):
        if isinstance(node, dict) and isinstance(node.get("inputs"), dict) and "clip" in node["inputs"]:
            clip_link = node["inputs"]["clip"]
            break
    if model_link is None or clip_link is None:
        warnings.append("LoRA 注入略過：找不到 model/clip 來源連線。")
        return patched, warnings

    prev_model, prev_clip = model_link, clip_link
    injected = 0
    for lora in loras:
        if not isinstance(lora, dict):
            continue
        name = lora.get("name")
        if not name:
            warnings.append("LoRA 條目缺少 name，已略過。")
            continue
        if available_loras is not None and name not in available_loras:
            warnings.append(f"LoRA 缺失，已略過：{name}（不在 ComfyUI loras 清單，畫風可能不像）")
            continue
        nid = f"lora_{injected}"
        wf[nid] = {
            "class_type": "LoraLoader",
            "inputs": {
                "model": prev_model,
                "clip": prev_clip,
                "lora_name": name,
                "strength_model": lora.get("strength_model", 1.0),
                "strength_clip": lora.get("strength_clip", 1.0),
            },
        }
        prev_model, prev_clip = [nid, 0], [nid, 1]
        patched.append(f"{nid}:lora({name})")
        injected += 1

    if injected > 0:
        ks["inputs"]["model"] = prev_model
        for node in (pos_node, neg_node):
            if isinstance(node, dict) and isinstance(node.get("inputs"), dict) and "clip" in node["inputs"]:
                node["inputs"]["clip"] = prev_clip
    return patched, warnings


def patch_workflow(
    workflow: Optional[dict],
    *,
    positive_prompt: str,
    negative_prompt: str,
    checkpoint: str,
    width: int,
    height: int,
    seed: int,
    steps: int,
    cfg: float,
    sampler: str,
    scheduler: str,
    loras: Optional[list] = None,
    available_loras: Optional[list] = None,
) -> WorkflowPatchResult:
    """對 base_txt2img_api.json 做最小 patch。找不到 patch 點不 silent fail。"""
    if not isinstance(workflow, dict):
        return WorkflowPatchResult(
            ok=False, workflow=None, message="workflow 非有效 dict（可能讀取失敗回 None）。",
            patched_nodes=[], warnings=["workflow 為 None 或非 dict"],
        )

    # 只保留合法節點（dict 且含 class_type），剔除 _comment 等頂層 metadata 鍵。
    # ComfyUI /prompt 會把每個頂層鍵當節點驗證，殘留非節點鍵會導致 500。
    wf = {
        k: v for k, v in copy.deepcopy(workflow).items()
        if isinstance(v, dict) and "class_type" in v
    }
    patched: list[str] = []
    missing: list[str] = []

    # 1. 模型載入：相容 all-in-one checkpoint（CheckpointLoaderSimple.ckpt_name）
    #    與 DiT/UNet 單檔（UNETLoader.unet_name，如 Anima）。擇一存在即可。
    uid, unode = _find_node_by_class(wf, "UNETLoader")
    if unode and "unet_name" in unode.get("inputs", {}):
        unode["inputs"]["unet_name"] = checkpoint
        patched.append(f"{uid}:unet_name")
    else:
        cid, cnode = _find_node_by_class(wf, "CheckpointLoaderSimple")
        if cnode and "ckpt_name" in cnode.get("inputs", {}):
            cnode["inputs"]["ckpt_name"] = checkpoint
            patched.append(f"{cid}:ckpt_name")
        else:
            missing.append("模型（UNETLoader.unet_name 或 CheckpointLoaderSimple.ckpt_name）")

    # 2. KSampler 設定：seed / steps / cfg / sampler_name / scheduler
    ksid, ks = _find_node_by_class(wf, "KSampler")
    if ks:
        ki = ks.get("inputs", {})
        for field_name, value in (
            ("seed", seed), ("steps", steps), ("cfg", cfg),
            ("sampler_name", sampler), ("scheduler", scheduler),
        ):
            if field_name in ki:
                ki[field_name] = value
                patched.append(f"{ksid}:{field_name}")
            else:
                missing.append(f"KSampler.{field_name}")
    else:
        missing.append("sampler 設定（KSampler）")

    # 3/4. positive / negative：循 KSampler 的 positive/negative 連線找 CLIPTextEncode
    pos_id = _link_node_id(ks["inputs"].get("positive")) if ks else None
    neg_id = _link_node_id(ks["inputs"].get("negative")) if ks else None

    def _patch_text(node_id: Optional[str], text: str, label: str):
        node = wf.get(node_id) if node_id else None
        if (isinstance(node, dict) and node.get("class_type") == "CLIPTextEncode"
                and "text" in node.get("inputs", {})):
            node["inputs"]["text"] = text
            patched.append(f"{node_id}:text({label})")
        else:
            missing.append(f"{label} prompt（CLIPTextEncode via KSampler.{label}）")

    _patch_text(pos_id, positive_prompt, "positive")
    _patch_text(neg_id, negative_prompt, "negative")

    # 5. width / height（支援標準 EmptyLatentImage 與 SD3/Lumina2 的 EmptySD3LatentImage）
    lid, lnode = _find_node_by_class(wf, "EmptyLatentImage")
    if lnode is None:
        lid, lnode = _find_node_by_class(wf, "EmptySD3LatentImage")
    if lnode:
        li = lnode.get("inputs", {})
        if "width" in li:
            li["width"] = width
            patched.append(f"{lid}:width")
        else:
            missing.append("EmptyLatentImage.width")
        if "height" in li:
            li["height"] = height
            patched.append(f"{lid}:height")
        else:
            missing.append("EmptyLatentImage.height")
    else:
        missing.append("width/height（EmptyLatentImage）")

    # 6. LoRA：動態注入（缺失 skip + warning，不算 patch 失敗）
    lora_patched, lora_warnings = _inject_loras(
        wf, ksid, ks, pos_id, neg_id, loras or [], available_loras)
    patched.extend(lora_patched)
    for w in lora_warnings:
        _warn(w)

    ok = not missing
    if ok:
        message = f"patch 成功，共更新 {len(patched)} 個欄位。"
        warnings: list[str] = list(lora_warnings)
    else:
        message = "部分 patch 點找不到：" + "；".join(missing)
        warnings = list(missing) + list(lora_warnings)
        for m in missing:
            _warn(f"patch 點缺失：{m}")

    return WorkflowPatchResult(
        ok=ok, workflow=wf, message=message, patched_nodes=patched, warnings=warnings)


# =====================================================================
# queue prompt
# =====================================================================
def queue_prompt(
    url: str,
    workflow: dict,
    *,
    http_post: HttpPost = _default_http_post,
    timeout: float = DEFAULT_POST_TIMEOUT,
    client_id: Optional[str] = None,
) -> QueueResult:
    """POST /prompt 取 prompt_id。任何失敗 ok=False、不 raise。"""
    base = url.rstrip("/")
    payload: dict = {"prompt": workflow}
    if client_id:
        payload["client_id"] = client_id

    try:
        resp = http_post(f"{base}/prompt", json=payload, timeout=timeout)
    except Exception as exc:
        _warn(f"/prompt 請求失敗：{exc}")
        return QueueResult(ok=False, prompt_id=None, message=f"/prompt 請求失敗：{exc}", raw=None)

    status = getattr(resp, "status_code", None)
    try:
        data = resp.json()
    except Exception:
        data = None

    if status != 200:
        msg = f"/prompt 回應狀態 {status}"
        _warn(msg)
        return QueueResult(ok=False, prompt_id=None, message=msg,
                           raw=data if isinstance(data, dict) else None)

    if not isinstance(data, dict) or not data.get("prompt_id"):
        msg = "/prompt 回應缺少 prompt_id（可能 workflow 驗證失敗）。"
        _warn(msg)
        return QueueResult(ok=False, prompt_id=None, message=msg,
                           raw=data if isinstance(data, dict) else None)

    return QueueResult(ok=True, prompt_id=str(data["prompt_id"]),
                       message="已送入 ComfyUI 佇列。", raw=data)


# =====================================================================
# wait for result
# =====================================================================
def _extract_history_error(entry, prompt_id: str) -> Optional[WaitResult]:
    """從 history entry 偵測 ComfyUI 執行錯誤。

    命中（status_str=="error" 或 messages 內有 execution_error）→ 回 error WaitResult，
    細節能抽多少抽多少（prompt_id / status / node_id / node_type / exception_type / exception_message）。
    格式異常一律防禦處理、不丟例外；非錯誤狀態回 None。
    """
    if not isinstance(entry, dict):
        return None
    status = entry.get("status")
    status_str = status.get("status_str") if isinstance(status, dict) else None
    messages = status.get("messages") if isinstance(status, dict) else None

    exec_err: dict = {}
    if isinstance(messages, list):
        for m in messages:
            if (isinstance(m, (list, tuple)) and len(m) >= 2
                    and m[0] == "execution_error" and isinstance(m[1], dict)):
                exec_err = m[1]
                break

    if status_str != "error" and not exec_err:
        return None

    node_id = exec_err.get("node_id")
    node_type = exec_err.get("node_type")
    exc_type = exec_err.get("exception_type")
    exc_msg = exec_err.get("exception_message")

    parts = [f"prompt_id={prompt_id}", f"status={status_str}"]
    if node_id is not None:
        parts.append(f"node_id={node_id}")
    if node_type:
        parts.append(f"node_type={node_type}")
    if exc_type:
        parts.append(f"exception_type={exc_type}")
    if exc_msg:
        parts.append(f"exception_message={str(exc_msg).strip()}")
    message = "ComfyUI 生成失敗：" + " | ".join(parts)

    error_detail = None
    if exc_type or exc_msg:
        error_detail = f"{exc_type or ''}: {str(exc_msg or '').strip()}".strip(": ").strip()

    return WaitResult(
        status="error", entry=entry if isinstance(entry, dict) else None,
        message=message,
        node_id=str(node_id) if node_id is not None else None,
        node_type=node_type, error=error_detail,
    )


def wait_for_result(
    url: str,
    prompt_id: str,
    *,
    http_get: HttpGet = _default_http_get,
    sleep: Callable[[float], None],
    timeout_seconds: float = 120.0,
    interval_seconds: float = 1.0,
) -> WaitResult:
    """輪詢 /history/{prompt_id}，回 WaitResult（completed / error / timeout）。

    - 出現 outputs → completed（entry 帶 history）。
    - ComfyUI 回報執行錯誤 → 立即回 error，不再空等到 timeout。
    - 輪詢用盡 → timeout。
    sleep 可注入；測試不真等。本步不下載圖、不呼叫 /view，只取到結果 metadata。
    """
    base = url.rstrip("/")
    target = f"{base}/history/{prompt_id}"
    if interval_seconds > 0:
        max_attempts = max(1, int(timeout_seconds / interval_seconds))
    else:
        max_attempts = 1

    for attempt in range(max_attempts):
        data, err = _safe_get_json(http_get, target, timeout=_HISTORY_REQUEST_TIMEOUT)
        if err:
            _warn(err)
        elif isinstance(data, dict) and prompt_id in data:
            entry = data[prompt_id]
            # 先驗錯誤：ComfyUI 執行失敗時立即停止，不等 timeout。
            err_result = _extract_history_error(entry, prompt_id)
            if err_result is not None:
                _warn(err_result.message)
                return err_result
            if isinstance(entry, dict) and entry.get("outputs"):
                return WaitResult(status="completed", entry=entry,
                                  message=f"prompt_id={prompt_id} 完成。")
        if attempt < max_attempts - 1 and interval_seconds > 0:
            sleep(interval_seconds)

    msg = f"等待 prompt_id={prompt_id} 結果逾時（{timeout_seconds}s）。"
    _warn(msg)
    return WaitResult(status="timeout", message=msg)
