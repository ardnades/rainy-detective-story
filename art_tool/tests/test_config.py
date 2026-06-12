"""0-B config.py 測試。

完全不依賴本機真的有 ComfyUI 開著：HTTP / 路徑存在 / 環境變數全部以假物件注入。
"""
import json

import config


# ----------------------------------------------------------------------
# 測試輔助：假 HTTP response 與 http_get
# ----------------------------------------------------------------------
class FakeResp:
    def __init__(self, status_code: int):
        self.status_code = status_code


def make_http_get(ok_urls, *, calls=None, raise_urls=()):
    """產生假 http_get。

    ok_urls：呼叫後回 200 的 URL 前綴集合（比對 base，不含 /system_stats）。
    raise_urls：呼叫時丟例外的 base URL（模擬連線被拒）。
    calls：若給 list，會把每次被請求的 target 依序記錄進去（驗證探測順序）。
    """
    ok_targets = {f"{u.rstrip('/')}/system_stats" for u in ok_urls}
    raise_targets = {f"{u.rstrip('/')}/system_stats" for u in raise_urls}

    def _get(target, timeout=None):
        if calls is not None:
            calls.append(target)
        if target in raise_targets:
            raise ConnectionError("connection refused")
        return FakeResp(200 if target in ok_targets else 500)

    return _get


# ----------------------------------------------------------------------
# detect_comfyui_url
# ----------------------------------------------------------------------
def test_url_no_env_falls_back_to_8000_when_reachable():
    """無 .env 時，8000 通就用 8000，source=probe。"""
    res = config.detect_comfyui_url(
        env={},
        http_get=make_http_get({"http://127.0.0.1:8000"}),
    )
    assert res.url == "http://127.0.0.1:8000"
    assert res.source == "probe"
    assert res.online is True


def test_url_env_takes_priority_even_over_reachable_candidate():
    """有 COMFYUI_URL 時優先用 .env，即使 candidate 也通。"""
    res = config.detect_comfyui_url(
        env={"COMFYUI_URL": "http://example:9999"},
        http_get=make_http_get({"http://example:9999", "http://127.0.0.1:8000"}),
    )
    assert res.url == "http://example:9999"
    assert res.source == "env"
    assert res.online is True


def test_url_env_set_but_offline_still_returned_with_online_false():
    """COMFYUI_URL 設了但連不上 → 仍回該 URL，online=False，訊息含修正提示。"""
    res = config.detect_comfyui_url(
        env={"COMFYUI_URL": "http://127.0.0.1:8000"},
        http_get=make_http_get(set()),  # 全部不通
    )
    assert res.url == "http://127.0.0.1:8000"
    assert res.source == "env"
    assert res.online is False
    assert "連不上" in res.message


def test_url_probes_8000_before_8188():
    """探測順序：8000 必須在 8188 之前。"""
    calls: list[str] = []
    res = config.detect_comfyui_url(
        env={},
        http_get=make_http_get({"http://127.0.0.1:8188"}, calls=calls),
    )
    assert res.url == "http://127.0.0.1:8188"  # 8000 不通、8188 通
    assert calls[0] == "http://127.0.0.1:8000/system_stats"
    assert calls[1] == "http://127.0.0.1:8188/system_stats"


def test_url_all_unreachable_returns_none_source_no_crash():
    """全部連不上 → source=none、online=False、給第一個 candidate 當顯示 URL，不 crash。"""
    res = config.detect_comfyui_url(
        env={},
        http_get=make_http_get(set()),
    )
    assert res.online is False
    assert res.source == "none"
    assert res.url == "http://127.0.0.1:8000"
    assert "找不到執行中的 ComfyUI" in res.message


def test_url_probe_exception_is_swallowed(capsys):
    """探測過程拋例外（連線被拒）也不 crash，視為不可用，且印 warning。"""
    res = config.detect_comfyui_url(
        env={},
        http_get=make_http_get(set(), raise_urls={
            "http://127.0.0.1:8000", "http://127.0.0.1:8188"}),
    )
    assert res.online is False
    assert res.source == "none"
    # warn-not-raise 的「warn 半邊」：探測失敗要印到 stderr
    assert "[art_tool.config][warning]" in capsys.readouterr().err


# ----------------------------------------------------------------------
# detect_comfyui_path
# ----------------------------------------------------------------------
def test_path_env_priority_when_exists():
    res = config.detect_comfyui_path(
        env={"COMFYUI_PATH": r"D:\MyComfy"},
        path_exists=lambda p: p == r"D:\MyComfy",
    )
    assert res.found is True
    assert res.source == "env"
    assert res.path == r"D:\MyComfy"


def test_path_env_set_but_missing_gives_clear_message():
    res = config.detect_comfyui_path(
        env={"COMFYUI_PATH": r"D:\NotThere"},
        path_exists=lambda p: False,
    )
    assert res.found is False
    assert res.source == "env"
    assert "不存在" in res.message


def test_path_common_location_detected():
    res = config.detect_comfyui_path(
        env={},
        path_exists=lambda p: p == r"M:\ComfyUI",
    )
    assert res.found is True
    assert res.source == "common"
    assert res.path == r"M:\ComfyUI"


def test_path_not_found_returns_hint_no_crash():
    """找不到任何路徑 → found=False、message 提示填 COMFYUI_PATH，不 crash。"""
    res = config.detect_comfyui_path(
        env={},
        path_exists=lambda p: False,
    )
    assert res.found is False
    assert res.source == "none"
    assert res.path is None
    assert "COMFYUI_PATH" in res.message


# ----------------------------------------------------------------------
# JSON 設定讀取（讀 0-A 真實檔案）
# ----------------------------------------------------------------------
def test_load_art_styles_real_file():
    data = config.load_art_styles()
    assert data is not None
    ids = [s["id"] for s in data["styles"]]
    assert "soft_romance_avg" in ids
    assert len(data["styles"]) == 3
    # soft_romance_avg 已綁定實際 Anima 模型；其餘畫風仍可為佔位字串（皆不可因此失敗）
    by_id = {s["id"]: s for s in data["styles"]}
    assert by_id["soft_romance_avg"]["checkpoint"] == "anima_baseV10.safetensors"
    assert all(
        s["checkpoint"] == config.CHECKPOINT_PLACEHOLDER
        for s in data["styles"] if s["id"] != "soft_romance_avg"
    )


def test_load_characters_real_file():
    data = config.load_characters()
    assert data is not None
    ids = [c["character_id"] for c in data["characters"]]
    assert "hoshino_akari" in ids


def test_load_art_tasks_real_file():
    data = config.load_art_tasks()
    assert data is not None
    ids = [t["id"] for t in data["tasks"]]
    assert ids == ["character_rough", "transparent_standee", "event_cg", "background", "sns_promo"]


def test_load_json_missing_file_returns_none(tmp_path):
    res = config.load_json_config(tmp_path / "nope.json")
    assert res is None


def test_load_json_bad_format_returns_none(tmp_path, capsys):
    bad = tmp_path / "bad.json"
    bad.write_text("{ not valid json", encoding="utf-8")
    res = config.load_json_config(bad)
    assert res is None
    # warn-not-raise 的「warn 半邊」：訊息要印到 stderr
    err = capsys.readouterr().err
    assert "[art_tool.config][warning]" in err
    assert "JSON 格式錯誤" in err


def test_load_json_oserror_returns_none(capsys):
    """OSError（如權限不足）分支：回 None、不 raise、印 warning。

    同時這是唯一行使 opener 注入參數的測試。
    """
    def bad_opener(path, encoding="utf-8"):
        raise PermissionError("denied")

    res = config.load_json_config("whatever.json", opener=bad_opener)
    assert res is None
    err = capsys.readouterr().err
    assert "[art_tool.config][warning]" in err
    assert "讀取失敗" in err


# ----------------------------------------------------------------------
# build_app_config 彙整（不碰 .env、不需真 ComfyUI）
# ----------------------------------------------------------------------
def test_build_app_config_offline_no_crash():
    cfg = config.build_app_config(
        env={},
        http_get=make_http_get(set()),
        path_exists=lambda p: False,
        load_dotenv_file=False,
    )
    assert cfg.comfyui.online is False
    assert cfg.comfyui_path.found is False
    # workflow 樣板路徑指得到真實檔
    assert cfg.workflow_path.name == "base_txt2img_api.json"


def test_build_app_config_online_path_found():
    cfg = config.build_app_config(
        env={"COMFYUI_PATH": r"M:\ComfyUI"},
        http_get=make_http_get({"http://127.0.0.1:8000"}),
        path_exists=lambda p: p == r"M:\ComfyUI",
        load_dotenv_file=False,
    )
    assert cfg.comfyui.online is True
    assert cfg.comfyui.url == "http://127.0.0.1:8000"
    assert cfg.comfyui_path.found is True
