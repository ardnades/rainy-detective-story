"""候選圖匯入與 metadata 管理（0-E）。

職責：
- 從 ComfyUI history 解析 image outputs
- 透過 /view 抓圖 bytes
- 存到 public/assets/generated/{character_id}/{task_id}/，防路徑穿越、限定安全副檔名
- 維護集中式 metadata.json（壞掉先備份不覆蓋）
- mark 狀態 / adopt 複製到正式 assets 目錄

設計原則（沿用全案）：失敗印 stderr warning + 回值，不 raise 到外層；不動玩家端既有檔案。
本檔只處理「美術工具」資產，不碰故事 JSON。
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlencode

# FastAPI 的同步背景任務 / route handler 跑在 threadpool；
# 用單一鎖序列化 metadata.json 的 read-modify-write，避免併發 lost-update。
_METADATA_LOCK = threading.Lock()

ART_TOOL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ART_TOOL_DIR.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
GENERATED_DIR = PUBLIC_DIR / "assets" / "generated"
CHARACTERS_DIR = PUBLIC_DIR / "assets" / "characters"
CG_DIR = PUBLIC_DIR / "assets" / "cg"
METADATA_PATH = GENERATED_DIR / "metadata.json"

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def _warn(msg: str) -> None:
    print(f"[art_tool.image_importer][warning] {msg}", file=sys.stderr)


def _now_iso(now: Optional[str] = None) -> str:
    return now if now is not None else datetime.now().isoformat(timespec="seconds")


def _safe_segment(value: str, default: str = "unknown") -> str:
    """只保留 [A-Za-z0-9_-]，去掉 .. 與路徑分隔，杜絕路徑穿越。"""
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", str(value or ""))
    return cleaned or default


# =====================================================================
# 1. 解析 history 中的 image outputs
# =====================================================================
def parse_comfy_history_for_images(history: Optional[dict]) -> tuple[list[dict], list[str]]:
    """從 wait_for_result 的 history entry 取 image refs。

    格式：history["outputs"][node_id]["images"] = [{filename, subfolder, type}, ...]
    不假設 node id 固定；無圖回 ([], [warning])。
    """
    warnings: list[str] = []
    if not isinstance(history, dict):
        return [], ["history 非 dict，無法解析"]
    outputs = history.get("outputs")
    if not isinstance(outputs, dict) or not outputs:
        return [], ["history 沒有 outputs"]

    refs: list[dict] = []
    for node_id, node_out in outputs.items():
        if not isinstance(node_out, dict):
            continue
        images = node_out.get("images")
        if not isinstance(images, list):
            continue
        for img in images:
            if not isinstance(img, dict) or "filename" not in img:
                continue
            refs.append({
                "filename": img.get("filename"),
                "subfolder": img.get("subfolder", ""),
                "type": img.get("type", "output"),
                "node_id": node_id,
            })
    if not refs:
        warnings.append("history 的 outputs 內找不到任何圖片")
    return refs, warnings


# =====================================================================
# 2. 抓圖
# =====================================================================
def fetch_comfy_image(url: str, image_ref: dict, *, http_get: Callable) -> tuple[Optional[bytes], Optional[str]]:
    """GET /view 取圖 bytes。HTTP 錯 / 空 bytes → (None, warning)，不 crash。"""
    base = url.rstrip("/")
    query = urlencode({
        "filename": image_ref.get("filename", ""),
        "subfolder": image_ref.get("subfolder", ""),
        "type": image_ref.get("type", "output"),
    })
    target = f"{base}/view?{query}"
    try:
        resp = http_get(target, timeout=30)
    except Exception as exc:
        return None, f"/view 請求失敗：{exc}"
    if getattr(resp, "status_code", None) != 200:
        return None, f"/view 回應狀態 {getattr(resp, 'status_code', None)}"
    data = getattr(resp, "content", None)
    if not data:
        return None, f"/view 回傳空內容（{image_ref.get('filename')}）"
    return data, None


# =====================================================================
# 3. metadata 讀寫（集中式 list；壞掉先備份）
# =====================================================================
def _backup_corrupt(metadata_path: Path, now: Optional[str]) -> None:
    ts = re.sub(r"[^0-9]", "", _now_iso(now)) or "backup"
    backup = metadata_path.with_name(f"metadata.corrupt.{ts}.json")
    try:
        shutil.move(str(metadata_path), str(backup))
        _warn(f"metadata 損壞，已備份為 {backup.name}，改用新檔。")
    except OSError as exc:
        _warn(f"metadata 損壞且備份失敗：{exc}")


def _load_metadata(metadata_path: Path, now: Optional[str] = None) -> list[dict]:
    if not metadata_path.exists():
        return []
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        _warn(f"metadata 讀取/解析失敗：{exc}")
        _backup_corrupt(metadata_path, now)
        return []
    if isinstance(data, list):
        if all(isinstance(e, dict) for e in data):
            return data
        _warn("metadata list 含非 dict 元素，視為損壞。")
        _backup_corrupt(metadata_path, now)
        return []
    _warn("metadata 內容非 list，視為損壞。")
    _backup_corrupt(metadata_path, now)
    return []


def _save_metadata(metadata_path: Path, entries: list[dict]) -> bool:
    try:
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(
            json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except OSError as exc:
        _warn(f"metadata 寫入失敗：{exc}")
        return False


def load_all_metadata(metadata_path: Optional[Path] = None) -> list[dict]:
    return _load_metadata(metadata_path or METADATA_PATH)


def get_metadata_entry(asset_id: str, metadata_path: Optional[Path] = None) -> Optional[dict]:
    for entry in load_all_metadata(metadata_path):
        if entry.get("asset_id") == asset_id:
            return entry
    return None


# =====================================================================
# 4. 儲存生成圖 + metadata
# =====================================================================
def save_generated_image(
    image_bytes: bytes,
    *,
    character_id: str,
    task_id: str,
    source_ref: dict,
    metadata_fields: Optional[dict] = None,
    generated_dir: Optional[Path] = None,
    metadata_path: Optional[Path] = None,
    now: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> Optional[dict]:
    """存圖到 generated/{character}/{task}/，寫入 metadata，回 entry（失敗回 None）。"""
    # 用 abspath（非 resolve）避免 Windows 在長路徑時加上 \\?\ 前綴造成的不一致比較
    gen_dir_abs = os.path.abspath(str(generated_dir or GENERATED_DIR))
    gen_dir = Path(gen_dir_abs)
    meta_path = metadata_path or (gen_dir / "metadata.json")

    # 副檔名安全檢查（依來源檔名判斷）
    ext = Path(str(source_ref.get("filename", ""))).suffix.lower()
    if ext not in ALLOWED_EXT:
        _warn(f"不允許的副檔名 {ext!r}（{source_ref.get('filename')!r}），略過。")
        return None

    # 主防線：清洗每段，移除 .. 與路徑分隔，傳不出 generated_dir
    char_seg = _safe_segment(character_id)
    task_seg = _safe_segment(task_id)
    aid = asset_id or f"{re.sub(r'[^0-9]', '', _now_iso(now))}_{uuid.uuid4().hex[:8]}"
    filename = f"{_safe_segment(aid)}{ext}"

    dest_dir_abs = os.path.abspath(os.path.join(gen_dir_abs, char_seg, task_seg))
    # 第二防線：正規化後必須仍在 generated_dir 內（commonpath 不會加 \\?\ 前綴）
    try:
        contained = os.path.commonpath([gen_dir_abs, dest_dir_abs]) == gen_dir_abs
    except ValueError:  # 不同磁碟機等
        contained = False
    if not contained:
        _warn(f"偵測到路徑穿越企圖：{dest_dir_abs}，略過。")
        return None
    dest_dir = Path(dest_dir_abs)
    local_path = dest_dir / filename
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(image_bytes)
    except OSError as exc:
        _warn(f"圖片寫入失敗：{exc}")
        return None

    entry = {
        "asset_id": aid,
        "source": {
            "filename": source_ref.get("filename"),
            "subfolder": source_ref.get("subfolder", ""),
            "type": source_ref.get("type", "output"),
        },
        "local_path": str(local_path),
        "public_path": f"/assets/generated/{char_seg}/{task_seg}/{filename}",
        "created_at": _now_iso(now),
        "character_id": character_id,
        "task_id": task_id,
        "style_id": None,
        "checkpoint": None,
        "seed": None,
        "width": None,
        "height": None,
        "steps": None,
        "cfg": None,
        "sampler": None,
        "scheduler": None,
        "positive_prompt": None,
        "negative_prompt": None,
        "status": "candidate",
        "problems": [],
        "adopted_to": None,
    }
    if metadata_fields:
        entry.update(metadata_fields)
    # 強制關鍵欄位不被覆蓋成錯值
    entry["asset_id"] = aid
    entry["character_id"] = character_id
    entry["task_id"] = task_id

    with _METADATA_LOCK:
        entries = _load_metadata(meta_path, now)
        entries.append(entry)
        _save_metadata(meta_path, entries)
    return entry


# =====================================================================
# 5. 更新狀態 / problems / adopted_to
# =====================================================================
def update_generated_metadata(
    asset_id: str,
    *,
    status: Optional[str] = None,
    problems: Optional[list] = None,
    adopted_to: Optional[str] = None,
    metadata_path: Optional[Path] = None,
    now: Optional[str] = None,
) -> tuple[Optional[dict], list[str]]:
    """更新指定 asset 的 metadata。找不到回 (None, warnings)。"""
    meta_path = metadata_path or METADATA_PATH
    with _METADATA_LOCK:
        entries = _load_metadata(meta_path, now)
        target = next((e for e in entries if e.get("asset_id") == asset_id), None)
        if target is None:
            return None, [f"找不到 asset_id={asset_id!r}"]
        if status is not None:
            target["status"] = status
        if problems is not None:
            target["problems"] = problems
        if adopted_to is not None:
            target["adopted_to"] = adopted_to
        target["updated_at"] = _now_iso(now)
        _save_metadata(meta_path, entries)
    return target, []


# =====================================================================
# 6. adopt：複製到正式 assets 目錄 + 簡化 metadata sidecar
# =====================================================================
_ADOPT_META_KEYS = (
    "positive_prompt", "negative_prompt", "seed", "checkpoint",
    "width", "height", "steps", "cfg", "sampler", "scheduler",
    "created_at", "style_id", "character_id",
)


def adopt_asset(
    entry: dict,
    task: Optional[dict],
    *,
    characters_dir: Optional[Path] = None,
    cg_dir: Optional[Path] = None,
    now: Optional[str] = None,
) -> dict:
    """依 task.output_kind 把候選圖複製到 characters/ 或 cg/。

    output_kind 不明 → 回 warning 要人工選，不複製。回 {ok, message, warnings, dest_public_path}。
    不修改任何故事 JSON。
    """
    warnings: list[str] = []
    char_dir = (characters_dir or CHARACTERS_DIR)
    cgdir = (cg_dir or CG_DIR)

    local_path = Path(entry.get("local_path", ""))
    if not local_path.exists():
        return {"ok": False, "message": "原始候選圖不存在，無法採用。",
                "warnings": [f"找不到 {local_path}"], "dest_public_path": None}

    ext = local_path.suffix.lower()
    character_id = _safe_segment(entry.get("character_id"))
    task_id = _safe_segment(entry.get("task_id"))
    short = _safe_segment(str(entry.get("asset_id", "")))[-8:] or "x"
    output_kind = (task or {}).get("output_kind")

    if output_kind == "character":
        dest_dir = char_dir / character_id
        filename = f"{task_id}_{short}_v001{ext}"
        public_prefix = f"/assets/characters/{character_id}"
    elif output_kind == "cg":
        dest_dir = cgdir
        filename = f"{task_id}_{short}_v001{ext}"
        public_prefix = "/assets/cg"
    else:
        return {"ok": False,
                "message": "無法判斷採用目的地（output_kind 不明），請人工指定 characters 或 cg。",
                "warnings": [f"task output_kind={output_kind!r} 不明"],
                "dest_public_path": None}

    dest_path = dest_dir / filename
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, dest_path)
    except OSError as exc:
        return {"ok": False, "message": "採用複製失敗。",
                "warnings": [f"複製失敗：{exc}"], "dest_public_path": None}

    # 簡化 metadata sidecar（同名 .json）
    sidecar = {k: entry.get(k) for k in _ADOPT_META_KEYS}
    sidecar["source_task_id"] = entry.get("task_id")
    sidecar["source_asset_id"] = entry.get("asset_id")
    sidecar["adopted_at"] = _now_iso(now)
    sidecar["generated_at"] = entry.get("created_at")
    try:
        dest_path.with_suffix(".json").write_text(
            json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        warnings.append(f"sidecar metadata 寫入失敗：{exc}")

    return {
        "ok": True,
        "message": f"已採用到 {public_prefix}/{filename}",
        "warnings": warnings,
        "dest_public_path": f"{public_prefix}/{filename}",
    }
