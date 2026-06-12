"""art_tool 設定與健康檢查層（0-B）。

職責：
- 載入 .env（若有）
- 偵測 ComfyUI 的 URL：優先 .env 的 COMFYUI_URL，否則依序探測 8000 → 8188
- 偵測 ComfyUI 安裝路徑：優先 .env 的 COMFYUI_PATH，否則試常見 Windows 位置
- 讀取 art_config/*.json 與 workflow 樣板路徑

設計原則（沿用全域偏好）：
- 失敗時印 warning，不 raise；對外回傳明確狀態與修正提示。
- 所有對外依賴（HTTP、檔案是否存在、環境變數）皆可注入，方便 pytest mock，
  不需本機真的有 ComfyUI 開著就能測。
本步「不」真的生圖、「不」要求 checkpoint 必須存在。
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping, Optional, Sequence

# ---- 路徑常數 ----
BASE_DIR: Path = Path(__file__).resolve().parent
ART_CONFIG_DIR: Path = BASE_DIR / "art_config"
WORKFLOW_PATH: Path = BASE_DIR / "art_workflows" / "base_txt2img_api.json"
ENV_PATH: Path = BASE_DIR / ".env"

# 探測順序：Desktop 版實際在 8000，故 8000 放前面，再 fallback 8188
DEFAULT_CANDIDATE_URLS: tuple[str, ...] = (
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8188",
)
DEFAULT_PROBE_TIMEOUT: float = 4.0

CHECKPOINT_PLACEHOLDER: str = "<請填入你的checkpoint檔名>"


def _warn(msg: str) -> None:
    """印 warning 到 stderr，不中斷流程。"""
    print(f"[art_tool.config][warning] {msg}", file=sys.stderr)


# =====================================================================
# 型別注入點：HTTP / 檔案存在 / 環境變數
# =====================================================================
HttpGet = Callable[..., object]
PathExists = Callable[[str], bool]


def _default_http_get(url: str, timeout: float = DEFAULT_PROBE_TIMEOUT) -> object:
    """預設 HTTP GET（延遲匯入 httpx，讓 config 在沒裝 httpx 時仍可匯入）。"""
    import httpx

    return httpx.get(url, timeout=timeout)


# =====================================================================
# 結果資料結構
# =====================================================================
@dataclass
class UrlDetection:
    """ComfyUI URL 偵測結果。"""

    url: Optional[str]          # 最終採用的 URL（即使離線也會給一個供 UI 顯示）
    source: str                 # "env" | "probe" | "none"
    online: bool                # 是否探測到可連線
    message: str                # 給使用者看的中文狀態 / 修正提示
    tried: list[str] = field(default_factory=list)  # 實際嘗試過的 URL（依序）


@dataclass
class PathDetection:
    """ComfyUI 安裝路徑偵測結果。"""

    path: Optional[str]
    source: str                 # "env" | "common" | "none"
    found: bool
    message: str
    tried: list[str] = field(default_factory=list)


@dataclass
class AppConfig:
    """彙整後的 app 設定。"""

    comfyui: UrlDetection
    comfyui_path: PathDetection
    base_dir: Path = BASE_DIR
    art_config_dir: Path = ART_CONFIG_DIR
    workflow_path: Path = WORKFLOW_PATH


# =====================================================================
# .env 載入
# =====================================================================
def load_env(dotenv_path: Optional[os.PathLike | str] = None) -> bool:
    """載入 .env（若存在）。未裝 python-dotenv 或檔案不存在皆只 warn、回 False。"""
    path = Path(dotenv_path) if dotenv_path is not None else ENV_PATH
    if not path.exists():
        return False
    try:
        from dotenv import load_dotenv
    except ImportError:
        _warn("未安裝 python-dotenv，略過 .env 載入（pip install python-dotenv）")
        return False
    load_dotenv(path)
    return True


# =====================================================================
# URL 偵測
# =====================================================================
def probe_url(
    url: str,
    *,
    http_get: HttpGet = _default_http_get,
    timeout: float = DEFAULT_PROBE_TIMEOUT,
) -> bool:
    """探測單一 URL 是否為可用的 ComfyUI（GET /system_stats == 200）。失敗只 warn。"""
    target = f"{url.rstrip('/')}/system_stats"
    try:
        resp = http_get(target, timeout=timeout)
    except Exception as exc:  # 連不上、逾時等一律視為不可用，不 raise
        _warn(f"探測 {target} 失敗：{exc}")
        return False
    return getattr(resp, "status_code", None) == 200


def detect_comfyui_url(
    *,
    env: Mapping[str, str] = os.environ,
    candidates: Sequence[str] = DEFAULT_CANDIDATE_URLS,
    http_get: HttpGet = _default_http_get,
    timeout: float = DEFAULT_PROBE_TIMEOUT,
) -> UrlDetection:
    """偵測 ComfyUI URL。

    1. .env 的 COMFYUI_URL 優先（即使離線也採用它，只標 online=False）。
    2. 否則依序探測 candidates（預設 8000 → 8188），第一個通的就用。
    3. 都不通 → 採第一個 candidate 當顯示用 URL，online=False，附修正提示。
    """
    tried: list[str] = []
    configured = (env.get("COMFYUI_URL") or "").strip()
    if configured:
        online = probe_url(configured, http_get=http_get, timeout=timeout)
        tried.append(configured)
        if online:
            msg = f"使用 .env 的 COMFYUI_URL：{configured}（連線正常）"
        else:
            msg = (
                f"使用 .env 的 COMFYUI_URL：{configured}，但目前連不上。"
                "請確認 ComfyUI 已啟動，或修正 COMFYUI_URL。"
            )
        return UrlDetection(url=configured, source="env", online=online, message=msg, tried=tried)

    for url in candidates:
        tried.append(url)
        if probe_url(url, http_get=http_get, timeout=timeout):
            return UrlDetection(
                url=url,
                source="probe",
                online=True,
                message=f"自動偵測到 ComfyUI：{url}",
                tried=tried,
            )

    fallback = candidates[0] if candidates else None
    return UrlDetection(
        url=fallback,
        source="none",
        online=False,
        message=(
            "找不到執行中的 ComfyUI（已嘗試："
            + ", ".join(candidates)
            + "）。請啟動 ComfyUI，或在 art_tool/.env 設定 COMFYUI_URL。"
        ),
        tried=tried,
    )


# =====================================================================
# 安裝路徑偵測
# =====================================================================
def common_comfyui_paths(env: Mapping[str, str] = os.environ) -> list[str]:
    """常見 Windows ComfyUI 安裝位置（不硬性假設，只是候選）。"""
    paths: list[str] = [r"M:\ComfyUI", r"M:\ai-games\ComfyUI", r"C:\ComfyUI"]
    userprofile = env.get("USERPROFILE")
    if userprofile:
        paths.append(os.path.join(userprofile, "ComfyUI"))
        paths.append(os.path.join(userprofile, "Documents", "ComfyUI"))
    localappdata = env.get("LOCALAPPDATA")
    if localappdata:
        # ComfyUI Desktop（Electron 版）常見安裝目錄
        paths.append(os.path.join(localappdata, "Programs", "@comfyorgcomfyui-electron"))
    return paths


def detect_comfyui_path(
    *,
    env: Mapping[str, str] = os.environ,
    path_exists: PathExists = os.path.exists,
) -> PathDetection:
    """偵測 ComfyUI 安裝路徑。找不到不報 fatal，只回明確提示。"""
    tried: list[str] = []
    configured = (env.get("COMFYUI_PATH") or "").strip()
    if configured:
        tried.append(configured)
        if path_exists(configured):
            return PathDetection(
                path=configured, source="env", found=True,
                message=f"使用 .env 的 COMFYUI_PATH：{configured}", tried=tried,
            )
        return PathDetection(
            path=configured, source="env", found=False,
            message=f".env 的 COMFYUI_PATH 不存在：{configured}，請修正。", tried=tried,
        )

    for candidate in common_comfyui_paths(env):
        tried.append(candidate)
        if path_exists(candidate):
            return PathDetection(
                path=candidate, source="common", found=True,
                message=f"自動偵測到 ComfyUI 路徑：{candidate}", tried=tried,
            )

    return PathDetection(
        path=None, source="none", found=False,
        message="找不到 ComfyUI 安裝路徑。請在 art_tool/.env 填入 COMFYUI_PATH=<你的 ComfyUI 資料夾>。",
        tried=tried,
    )


# =====================================================================
# JSON 設定讀取
# =====================================================================
def load_json_config(
    path: os.PathLike | str,
    *,
    opener: Callable = open,
) -> Optional[dict]:
    """讀取 JSON 設定。找不到或格式錯誤只 warn 回 None，不 raise。"""
    try:
        with opener(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        _warn(f"設定檔不存在：{path}")
        return None
    except json.JSONDecodeError as exc:
        _warn(f"設定檔 JSON 格式錯誤：{path}：{exc}")
        return None
    except OSError as exc:
        _warn(f"設定檔讀取失敗：{path}：{exc}")
        return None


def load_art_styles(art_config_dir: Path = ART_CONFIG_DIR) -> Optional[dict]:
    return load_json_config(art_config_dir / "art_styles.json")


def load_characters(art_config_dir: Path = ART_CONFIG_DIR) -> Optional[dict]:
    return load_json_config(art_config_dir / "characters.json")


def load_art_tasks(art_config_dir: Path = ART_CONFIG_DIR) -> Optional[dict]:
    return load_json_config(art_config_dir / "art_tasks.json")


# =====================================================================
# 彙整
# =====================================================================
def build_app_config(
    *,
    env: Optional[Mapping[str, str]] = None,
    http_get: HttpGet = _default_http_get,
    path_exists: PathExists = os.path.exists,
    candidates: Sequence[str] = DEFAULT_CANDIDATE_URLS,
    timeout: float = DEFAULT_PROBE_TIMEOUT,
    load_dotenv_file: bool = True,
) -> AppConfig:
    """一次取得完整設定。load_dotenv_file=False 時不碰 .env（測試用）。"""
    if load_dotenv_file:
        load_env()
    effective_env: Mapping[str, str] = env if env is not None else os.environ
    url = detect_comfyui_url(
        env=effective_env, candidates=candidates, http_get=http_get, timeout=timeout
    )
    path = detect_comfyui_path(env=effective_env, path_exists=path_exists)
    return AppConfig(comfyui=url, comfyui_path=path)
