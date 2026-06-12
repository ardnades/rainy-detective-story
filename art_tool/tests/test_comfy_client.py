"""0-C comfy_client.py 測試。

完全不依賴真 ComfyUI、不真生圖：HTTP / sleep / opener 全部注入。
"""
import json

import comfy_client as cc
import config


# ----------------------------------------------------------------------
# 假 HTTP 物件
# ----------------------------------------------------------------------
class FakeResp:
    def __init__(self, status_code=200, payload=None, bad_json=False):
        self.status_code = status_code
        self._payload = payload
        self._bad_json = bad_json

    def json(self):
        if self._bad_json:
            raise ValueError("invalid json")
        return self._payload


def route_get(routes, *, calls=None):
    """routes: list of (substring, FakeResp 或 Exception)。比對 URL 子字串。"""
    def _get(url, timeout=None, **kw):
        if calls is not None:
            calls.append(url)
        for sub, r in routes:
            if sub in url:
                if isinstance(r, Exception):
                    raise r
                return r
        return FakeResp(404, None)
    return _get


# 常用 system_stats 範本（4090）
STATS_4090 = {
    "system": {"comfyui_version": "0.24.0"},
    "devices": [{
        "name": "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync",
        "vram_total": 25757220864,   # ~24GB
        "vram_free": 24025176064,
    }],
}


# ======================================================================
# health_check
# ======================================================================
def test_health_offline_when_system_stats_unreachable():
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([("/system_stats", ConnectionError("refused"))]),
    )
    assert health.online is False
    assert health.system_ok is False
    assert health.checkpoints == []
    assert "無法連線" in health.message


def test_health_no_url_returns_offline_no_crash():
    health = cc.health_check(None, http_get=route_get([]))
    assert health.online is False
    assert health.url is None
    assert "COMFYUI_URL" in health.message


def test_health_online_with_queue_and_checkpoints():
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([
            ("/system_stats", FakeResp(200, STATS_4090)),
            ("/prompt", FakeResp(200, {"exec_info": {"queue_remaining": 0}})),
            ("/models/checkpoints", FakeResp(200, ["anime_v1.safetensors", "real_v2.safetensors"])),
        ]),
    )
    assert health.online is True
    assert health.system_ok is True
    assert health.queue_ok is True
    assert health.checkpoints_ok is True
    assert len(health.checkpoints) == 2
    assert "找到 2 個 checkpoint" in health.message


def test_health_parses_gpu_and_vram():
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([
            ("/system_stats", FakeResp(200, STATS_4090)),
            ("/prompt", FakeResp(200, {})),
            ("/models/checkpoints", FakeResp(200, [])),
            ("/object_info", FakeResp(200, {})),
        ]),
    )
    assert health.gpu is not None and "4090" in health.gpu
    assert health.vram_total_mb is not None and health.vram_total_mb > 20000
    assert health.vram_free_mb is not None and health.vram_free_mb > 20000


def test_health_empty_checkpoints_flags_and_hints_safetensors():
    """checkpoints 空 → online 仍 True，checkpoints_ok False，message 提示 .safetensors。"""
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([
            ("/system_stats", FakeResp(200, STATS_4090)),
            ("/prompt", FakeResp(200, {})),
            ("/models/checkpoints", FakeResp(200, [])),
            ("/object_info", FakeResp(200, {"CheckpointLoaderSimple": {
                "input": {"required": {"ckpt_name": [[]]}}}})),
        ]),
    )
    assert health.online is True
    assert health.checkpoints_ok is False
    assert ".safetensors" in health.message
    assert "models/checkpoints" in health.message


def test_health_checkpoints_via_object_info_fallback():
    """/models/checkpoints 不可用，改由 object_info 解析 ckpt_name。"""
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([
            ("/system_stats", FakeResp(200, STATS_4090)),
            ("/prompt", FakeResp(200, {})),
            ("/models/checkpoints", FakeResp(500, None)),
            ("/object_info", FakeResp(200, {"CheckpointLoaderSimple": {
                "input": {"required": {"ckpt_name": [["model_a.safetensors", "model_b.ckpt"]]}}}})),
        ]),
    )
    assert health.checkpoints == ["model_a.safetensors", "model_b.ckpt"]
    assert health.checkpoints_ok is True


def test_health_checkpoints_bad_format_warns_no_crash():
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([
            ("/system_stats", FakeResp(200, STATS_4090)),
            ("/prompt", FakeResp(200, {})),
            ("/models/checkpoints", FakeResp(200, {"unexpected": "dict"})),
            ("/object_info", FakeResp(200, {"wrong": "shape"})),
        ]),
    )
    assert health.checkpoints == []
    assert health.checkpoints_ok is False
    assert any("格式" in w or "解析" in w for w in health.warnings)


def test_health_system_stats_bad_json_is_offline_no_crash():
    health = cc.health_check(
        "http://127.0.0.1:8000",
        http_get=route_get([("/system_stats", FakeResp(200, None, bad_json=True))]),
    )
    assert health.online is False
    assert health.system_ok is False


def test_health_accepts_appconfig():
    cfg = config.build_app_config(
        env={}, http_get=lambda u, timeout=None: FakeResp(200, {}),
        path_exists=lambda p: False, load_dotenv_file=False,
    )
    # cfg.comfyui.url == 8000（probe 成功）
    health = cc.health_check(
        cfg,
        http_get=route_get([
            ("/system_stats", FakeResp(200, STATS_4090)),
            ("/prompt", FakeResp(200, {})),
            ("/models/checkpoints", FakeResp(200, ["m.safetensors"])),
        ]),
    )
    assert health.url == "http://127.0.0.1:8000"
    assert health.online is True


# ======================================================================
# load_workflow_template
# ======================================================================
def test_load_workflow_real_file():
    wf = cc.load_workflow_template(config.WORKFLOW_PATH)
    assert wf is not None
    assert wf["4"]["class_type"] == "UNETLoader"
    assert wf["3"]["class_type"] == "KSampler"


def test_load_workflow_missing_returns_none(tmp_path):
    assert cc.load_workflow_template(tmp_path / "nope.json") is None


def test_load_workflow_bad_json_returns_none(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("{ broken", encoding="utf-8")
    assert cc.load_workflow_template(bad) is None


def test_load_workflow_oserror_returns_none():
    def bad_opener(path, encoding="utf-8"):
        raise PermissionError("denied")
    assert cc.load_workflow_template("x.json", opener=bad_opener) is None


# ======================================================================
# patch_workflow
# ======================================================================
PATCH_KW = dict(
    positive_prompt="a cute girl, masterpiece",
    negative_prompt="bad hands, lowres",
    checkpoint="my_model.safetensors",
    width=768, height=1024, seed=123456,
    steps=30, cfg=7.5, sampler="dpmpp_2m", scheduler="karras",
)


def _load_base():
    return cc.load_workflow_template(config.WORKFLOW_PATH)


def test_patch_all_points_applied():
    base = _load_base()
    res = cc.patch_workflow(base, **PATCH_KW)
    assert res.ok is True
    wf = res.workflow
    assert wf["4"]["inputs"]["unet_name"] == "my_model.safetensors"
    assert wf["6"]["inputs"]["text"] == "a cute girl, masterpiece"   # positive
    assert wf["7"]["inputs"]["text"] == "bad hands, lowres"          # negative
    assert wf["5"]["inputs"]["width"] == 768
    assert wf["5"]["inputs"]["height"] == 1024
    assert wf["3"]["inputs"]["seed"] == 123456
    assert wf["3"]["inputs"]["steps"] == 30
    assert wf["3"]["inputs"]["cfg"] == 7.5
    assert wf["3"]["inputs"]["sampler_name"] == "dpmpp_2m"
    assert wf["3"]["inputs"]["scheduler"] == "karras"


def test_patch_does_not_mutate_input():
    base = _load_base()
    original = json.dumps(base, sort_keys=True)
    cc.patch_workflow(base, **PATCH_KW)
    assert json.dumps(base, sort_keys=True) == original  # 原物件未變（deepcopy）


def test_patch_strips_non_node_keys_for_clean_prompt():
    """patched workflow 只含合法節點；_comment 等頂層 metadata 鍵須剔除，
    否則 ComfyUI /prompt 會把它當節點驗證而回 500。"""
    base = dict(_load_base())
    base["_comment"] = "this is a top-level metadata key, not a node"
    res = cc.patch_workflow(base, **PATCH_KW)
    assert res.ok is True
    assert "_comment" not in res.workflow
    for key, node in res.workflow.items():
        assert isinstance(node, dict) and "class_type" in node, key


def test_patch_positive_negative_resolved_by_links_not_hardcoded_ids():
    """node id 改成非數字也能靠 class_type + KSampler 連線正確 patch。"""
    wf = {
        "loader": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "x"}},
        "lat": {"class_type": "EmptyLatentImage", "inputs": {"width": 1, "height": 1, "batch_size": 1}},
        "posnode": {"class_type": "CLIPTextEncode", "inputs": {"text": "old+", "clip": ["loader", 1]}},
        "negnode": {"class_type": "CLIPTextEncode", "inputs": {"text": "old-", "clip": ["loader", 1]}},
        "samp": {"class_type": "KSampler", "inputs": {
            "seed": 0, "steps": 1, "cfg": 1, "sampler_name": "euler", "scheduler": "normal",
            "model": ["loader", 0], "positive": ["posnode", 0],
            "negative": ["negnode", 0], "latent_image": ["lat", 0]}},
        "save": {"class_type": "SaveImage", "inputs": {"filename_prefix": "x", "images": ["samp", 0]}},
    }
    res = cc.patch_workflow(wf, **PATCH_KW)
    assert res.ok is True
    assert res.workflow["posnode"]["inputs"]["text"] == "a cute girl, masterpiece"
    assert res.workflow["negnode"]["inputs"]["text"] == "bad hands, lowres"


def test_patch_missing_node_reports_not_ok():
    base = _load_base()
    del base["5"]  # 移除 EmptyLatentImage
    res = cc.patch_workflow(base, **PATCH_KW)
    assert res.ok is False
    assert any("EmptyLatentImage" in w or "width/height" in w for w in res.warnings)
    assert "找不到" in res.message


def test_patch_none_workflow_not_ok_no_crash():
    res = cc.patch_workflow(None, **PATCH_KW)
    assert res.ok is False
    assert res.workflow is None


# ======================================================================
# queue_prompt
# ======================================================================
def route_post(resp, *, captured=None):
    def _post(url, json=None, timeout=None, **kw):
        if captured is not None:
            captured["url"] = url
            captured["json"] = json
            captured["timeout"] = timeout
        if isinstance(resp, Exception):
            raise resp
        return resp
    return _post


def test_queue_success_payload_and_prompt_id():
    captured = {}
    wf = {"3": {"class_type": "KSampler"}}
    res = cc.queue_prompt(
        "http://127.0.0.1:8000", wf,
        http_post=route_post(FakeResp(200, {"prompt_id": "abc-123"}), captured=captured),
        client_id="client-xyz",
    )
    assert res.ok is True
    assert res.prompt_id == "abc-123"
    assert captured["url"].endswith("/prompt")
    assert captured["json"]["prompt"] == wf
    assert captured["json"]["client_id"] == "client-xyz"


def test_queue_no_client_id_omits_field():
    captured = {}
    res = cc.queue_prompt(
        "http://127.0.0.1:8000", {"x": 1},
        http_post=route_post(FakeResp(200, {"prompt_id": "p1"}), captured=captured),
    )
    assert res.ok is True
    assert "client_id" not in captured["json"]


def test_queue_missing_prompt_id_not_ok():
    res = cc.queue_prompt(
        "http://127.0.0.1:8000", {},
        http_post=route_post(FakeResp(200, {"node_errors": {"3": "bad"}})),
    )
    assert res.ok is False
    assert res.prompt_id is None
    assert res.raw == {"node_errors": {"3": "bad"}}


def test_queue_http_status_error_not_ok():
    res = cc.queue_prompt(
        "http://127.0.0.1:8000", {},
        http_post=route_post(FakeResp(400, {"error": "invalid"})),
    )
    assert res.ok is False
    assert "狀態 400" in res.message


def test_queue_exception_not_ok_no_raise():
    res = cc.queue_prompt(
        "http://127.0.0.1:8000", {},
        http_post=route_post(ConnectionError("down")),
    )
    assert res.ok is False
    assert res.prompt_id is None


def test_queue_bad_json_not_ok():
    res = cc.queue_prompt(
        "http://127.0.0.1:8000", {},
        http_post=route_post(FakeResp(200, None, bad_json=True)),
    )
    assert res.ok is False


# ======================================================================
# wait_for_result
# ======================================================================
def make_history_get(payloads):
    """每次呼叫回 payloads 的下一筆；用盡後固定回最後一筆。"""
    seq = list(payloads)
    def _get(url, timeout=None, **kw):
        p = seq.pop(0) if len(seq) > 1 else seq[0]
        return FakeResp(200, p)
    return _get


def test_wait_returns_when_history_ready_on_second_poll():
    pid = "p-1"
    sleeps = []
    payloads = [
        {},  # 第一次：還沒好
        {pid: {"outputs": {"9": {"images": [{"filename": "out_00001_.png",
                                             "subfolder": "", "type": "output"}]}}}},
    ]
    result = cc.wait_for_result(
        "http://127.0.0.1:8000", pid,
        http_get=make_history_get(payloads),
        sleep=lambda s: sleeps.append(s),
        timeout_seconds=10, interval_seconds=1,
    )
    assert result is not None
    assert result["outputs"]["9"]["images"][0]["filename"] == "out_00001_.png"
    assert len(sleeps) >= 1  # 有等過一次（mock，不真睡）


def test_wait_timeout_returns_none():
    sleeps = []
    result = cc.wait_for_result(
        "http://127.0.0.1:8000", "p-x",
        http_get=make_history_get([{}]),       # 永遠空
        sleep=lambda s: sleeps.append(s),
        timeout_seconds=3, interval_seconds=1,
    )
    assert result is None
    assert len(sleeps) >= 1                     # sleep 是 mock，沒真等


def test_wait_does_not_sleep_after_last_attempt():
    sleeps = []
    cc.wait_for_result(
        "http://127.0.0.1:8000", "p-x",
        http_get=make_history_get([{}]),
        sleep=lambda s: sleeps.append(s),
        timeout_seconds=3, interval_seconds=1,
    )
    assert len(sleeps) == 2                      # 3 次嘗試之間只 sleep 2 次


def test_wait_http_error_does_not_crash():
    result = cc.wait_for_result(
        "http://127.0.0.1:8000", "p-x",
        http_get=route_get([("/history", ConnectionError("boom"))]),
        sleep=lambda s: None,
        timeout_seconds=2, interval_seconds=1,
    )
    assert result is None
