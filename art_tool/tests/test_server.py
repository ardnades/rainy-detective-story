"""0-D server.py 測試。

不需真 ComfyUI、不需真 checkpoint、不連外部網路：
build_app_config / health_check / load_workflow_template 全部 monkeypatch。
並驗證 dry-run 絕不呼叫 queue_prompt。
"""
import pytest
from fastapi.testclient import TestClient

import comfy_client
import config
import generation_service
import image_importer
import server


# ----------------------------------------------------------------------
# 假資料工廠
# ----------------------------------------------------------------------
def make_health(*, online=True, checkpoints=None, queue_ok=True, system_ok=True):
    cps = checkpoints if checkpoints is not None else []
    if not online:
        msg = "無法連線 ComfyUI（http://127.0.0.1:8000）。請確認 ComfyUI 已啟動。"
    elif not cps:
        msg = ("ComfyUI 可連線（http://127.0.0.1:8000），但未找到 checkpoint，"
               "請把 .safetensors 放進 models/checkpoints 後重試。")
    else:
        msg = f"ComfyUI 連線正常，找到 {len(cps)} 個 checkpoint。"
    return comfy_client.ComfyHealth(
        online=online, url="http://127.0.0.1:8000" if online or True else None,
        message=msg, system_ok=system_ok if online else False,
        queue_ok=queue_ok if online else False,
        gpu="cuda:0 NVIDIA GeForce RTX 4090" if online else None,
        vram_total_mb=24563 if online else None,
        vram_free_mb=22988 if online else None,
        checkpoints=cps, checkpoints_ok=bool(cps), warnings=[],
    )


def make_appconfig(url="http://127.0.0.1:8000", path=None):
    return config.AppConfig(
        comfyui=config.UrlDetection(url=url, source="probe", online=True, message="ok"),
        comfyui_path=config.PathDetection(path=path, source="env" if path else "none",
                                          found=bool(path), message="ok"),
    )


@pytest.fixture(autouse=True)
def _mock_loras(monkeypatch):
    """server 測試不連真 ComfyUI：預設 get_loras 回空。需要特定行為的測試可再覆寫。"""
    monkeypatch.setattr(comfy_client, "get_loras", lambda *a, **k: ([], []))


@pytest.fixture
def client(monkeypatch):
    """預設：online、無 checkpoint。各測試可再覆寫 health_check。"""
    monkeypatch.setattr(config, "build_app_config", lambda *a, **k: make_appconfig())
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health(checkpoints=[]))
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: {"3": {}})
    # 任何測試若意外觸發 queue_prompt 立即失敗
    def _boom(*a, **k):
        raise AssertionError("0-D 不可呼叫 queue_prompt！")
    monkeypatch.setattr(comfy_client, "queue_prompt", _boom)
    return TestClient(server.app)


# ----------------------------------------------------------------------
# GET / 與 /art-studio
# ----------------------------------------------------------------------
def test_root_redirects_to_art_studio(client):
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert resp.headers["location"] == "/art-studio"


def test_art_studio_renders_with_status(client):
    resp = client.get("/art-studio")
    assert resp.status_code == 200
    body = resp.text
    assert "ComfyUI 狀態" in body
    assert "0-E generation enabled" in body


def test_art_studio_checkpoint_empty_shows_hint_and_disabled_generate(client):
    resp = client.get("/art-studio")
    body = resp.text
    # checkpoint 空 → .safetensors / models/checkpoints 提示
    assert ".safetensors" in body
    assert "models/checkpoints" in body
    # checkpoint dropdown 顯示 No checkpoint found
    assert "No checkpoint found" in body
    # Generate 按鈕存在且 disabled（checkpoint 空 → can_generate False）
    assert 'id="generate-btn"' in body
    assert "Generate Candidates" in body
    import re as _re
    m = _re.search(r'id="generate-btn"[^>]*', body)
    assert m and "disabled" in m.group(0)


def test_art_studio_generate_enabled_when_ready(monkeypatch):
    monkeypatch.setattr(config, "build_app_config", lambda *a, **k: make_appconfig())
    monkeypatch.setattr(comfy_client, "health_check",
                        lambda *a, **k: make_health(checkpoints=["m.safetensors"]))
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: {"3": {}})
    body = TestClient(server.app).get("/art-studio").text
    import re as _re
    m = _re.search(r'id="generate-btn"[^>]*', body)
    assert m and "disabled" not in m.group(0)


def test_art_studio_offline_still_renders(monkeypatch):
    monkeypatch.setattr(config, "build_app_config", lambda *a, **k: make_appconfig())
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health(online=False))
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: {"3": {}})
    resp = TestClient(server.app).get("/art-studio")
    assert resp.status_code == 200
    assert "ComfyUI Desktop" in resp.text  # 離線提示


def test_art_studio_green_when_checkpoints_present(monkeypatch):
    monkeypatch.setattr(config, "build_app_config", lambda *a, **k: make_appconfig())
    monkeypatch.setattr(comfy_client, "health_check",
                        lambda *a, **k: make_health(checkpoints=["m.safetensors"]))
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: {"3": {}})
    resp = TestClient(server.app).get("/art-studio")
    body = resp.text
    assert "status-green" in body
    assert "m.safetensors" in body


def test_art_studio_not_green_when_queue_down(monkeypatch):
    """有 checkpoint 但 queue 不可用 → 不可顯示 green（contract: green 需 queue_ok）。"""
    monkeypatch.setattr(config, "build_app_config", lambda *a, **k: make_appconfig())
    monkeypatch.setattr(comfy_client, "health_check",
                        lambda *a, **k: make_health(checkpoints=["m.safetensors"], queue_ok=False))
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: {"3": {}})
    body = TestClient(server.app).get("/art-studio").text
    assert "status-green" not in body
    assert "status-yellow" in body
    assert "queue 不可用" in body


def test_status_level_requires_queue_ok():
    assert server._status_level(make_health(checkpoints=["m.safetensors"])) == "green"
    assert server._status_level(
        make_health(checkpoints=["m.safetensors"], queue_ok=False)) == "yellow"
    assert server._status_level(make_health(online=False)) == "red"


# ----------------------------------------------------------------------
# /api/health
# ----------------------------------------------------------------------
def test_api_health_checkpoint_empty(client):
    data = client.get("/api/health").json()
    assert data["online"] is True
    assert data["checkpoints_ok"] is False
    assert data["checkpoints"] == []
    assert ".safetensors" in data["message"]
    assert data["gpu"] is not None
    assert data["vram_total_mb"] > 0


def test_api_health_offline(monkeypatch):
    monkeypatch.setattr(config, "build_app_config", lambda *a, **k: make_appconfig())
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health(online=False))
    data = TestClient(server.app).get("/api/health").json()
    assert data["online"] is False
    assert data["system_ok"] is False
    assert data["queue_ok"] is False


# ----------------------------------------------------------------------
# /api/config-summary
# ----------------------------------------------------------------------
def test_api_config_summary(client):
    data = client.get("/api/config-summary").json()
    assert data["styles_count"] == 6
    assert data["characters_count"] == 1
    assert data["tasks_count"] == 6
    assert data["workflow_loaded"] is True
    assert data["comfyui_url"] == "http://127.0.0.1:8000"
    assert data["workflow_path"].endswith("base_txt2img_api.json")


# ----------------------------------------------------------------------
# /api/dry-run-form
# ----------------------------------------------------------------------
VALID_FORM = {
    "style_id": "soft_romance_avg",
    "character_id": "hoshino_akari",
    "task_id": "character_rough",
    "batch_count": "8",
    "width": "832",
    "height": "1216",
    "seed": "",
}


def _post(client, **overrides):
    form = dict(VALID_FORM)
    form.update(overrides)
    return client.post("/api/dry-run-form", data=form).json()


def test_dry_run_valid(client):
    data = _post(client)
    assert data["ok"] is True
    assert data["warnings"] == []
    assert data["resolved"]["style"]["id"] == "soft_romance_avg"
    assert data["resolved"]["seed_mode"] == "auto"   # 空 seed → 自動


def test_dry_run_bad_style(client):
    data = _post(client, style_id="nope")
    assert data["ok"] is False
    assert any("畫風" in w for w in data["warnings"])


def test_dry_run_bad_character(client):
    data = _post(client, character_id="nobody")
    assert data["ok"] is False
    assert any("角色" in w for w in data["warnings"])


def test_dry_run_bad_task(client):
    data = _post(client, task_id="nope")
    assert data["ok"] is False
    assert any("用途" in w for w in data["warnings"])


def test_dry_run_batch_out_of_range(client):
    assert _post(client, batch_count="0")["ok"] is False
    assert _post(client, batch_count="9")["ok"] is False
    assert _post(client, batch_count="abc")["ok"] is False


def test_dry_run_dimension_out_of_range(client):
    assert _post(client, width="100")["ok"] is False
    assert _post(client, height="9999")["ok"] is False


def test_dry_run_fixed_seed(client):
    data = _post(client, seed="123456")
    assert data["ok"] is True
    assert data["resolved"]["seed"] == 123456
    assert data["resolved"]["seed_mode"] == "fixed"


def test_dry_run_bad_seed(client):
    data = _post(client, seed="not-int")
    assert data["ok"] is False
    assert any("seed" in w for w in data["warnings"])


def test_dry_run_rejects_underscore_and_plus_ints(client):
    """int() 會把 '8_3_2' 解析成 832、'+6' 成 6；驗證須拒絕這類畸形輸入。"""
    assert _post(client, width="8_3_2")["ok"] is False     # 不可被當成 832
    assert _post(client, height="1_2_1_6")["ok"] is False
    assert _post(client, batch_count="+6")["ok"] is False
    assert _post(client, seed="1_000")["ok"] is False


def test_dry_run_does_not_call_queue_prompt(client):
    # client fixture 已把 queue_prompt 換成會 raise 的版本；
    # 這裡多送一次合法表單，確認不觸發。
    data = _post(client)
    assert data["ok"] is True   # 若內部誤呼 queue_prompt 會 AssertionError


# ======================================================================
# 0-E：/api/generate /api/jobs /api/generated /mark /adopt
# ======================================================================
GEN_FORM = dict(VALID_FORM, checkpoint="m.safetensors")


def _make_job(status="running", job_id="job-xyz"):
    req = generation_service.GenerationRequest(
        style_id="soft_romance_avg", character_id="hoshino_akari", task_id="character_rough",
        checkpoint="m.safetensors", batch_count=8, width=832, height=1216, seed=None)
    return generation_service.GenerationJob(
        job_id=job_id, status=status, created_at="t", updated_at="t", request=req,
        message="ok", prompt_id="pid-1", prompt_ids=["pid-1"])


def test_generate_valid_returns_job_id(client, monkeypatch):
    job = _make_job()
    monkeypatch.setattr(generation_service, "create_generation_job", lambda *a, **k: job)
    monkeypatch.setattr(generation_service, "run_generation_job", lambda *a, **k: None)  # 背景 noop
    data = client.post("/api/generate", data=GEN_FORM).json()
    assert data["ok"] is True
    assert data["job_id"] == "job-xyz"
    assert data["status_url"] == "/api/jobs/job-xyz"


def test_generate_checkpoint_empty_rejected(client, monkeypatch):
    """checkpoint 空 → 真 create 走 health_check（client fixture 為空 checkpoint）→ failed。"""
    monkeypatch.setattr(generation_service, "run_generation_job", lambda *a, **k: None)
    resp = client.post("/api/generate", data=dict(GEN_FORM, checkpoint=""))
    data = resp.json()
    assert resp.status_code == 400
    assert data["ok"] is False


def test_generate_bad_form_rejected(client):
    resp = client.post("/api/generate", data=dict(GEN_FORM, batch_count="999"))
    assert resp.status_code == 400
    assert resp.json()["ok"] is False


def test_get_job(client):
    job = _make_job(status="completed", job_id="job-get")
    generation_service.JOBS["job-get"] = job
    try:
        data = client.get("/api/jobs/job-get").json()
        assert data["ok"] is True
        assert data["status"] == "completed"
        assert data["request"]["character_id"] == "hoshino_akari"
    finally:
        generation_service.JOBS.pop("job-get", None)


def test_get_job_missing(client):
    resp = client.get("/api/jobs/nope")
    assert resp.status_code == 404
    assert resp.json()["ok"] is False


def test_api_generated_lists_and_filters(client, monkeypatch):
    items = [
        {"asset_id": "a1", "character_id": "hoshino_akari", "task_id": "character_rough"},
        {"asset_id": "a2", "character_id": "other", "task_id": "event_cg"},
    ]
    monkeypatch.setattr(image_importer, "load_all_metadata", lambda *a, **k: items)
    all_data = client.get("/api/generated").json()
    assert all_data["count"] == 2
    filtered = client.get("/api/generated?character_id=hoshino_akari").json()
    assert filtered["count"] == 1
    assert filtered["items"][0]["asset_id"] == "a1"


def test_api_mark_updates(client, monkeypatch):
    monkeypatch.setattr(image_importer, "update_generated_metadata",
                        lambda asset_id, **k: ({"asset_id": asset_id, "status": k.get("status"),
                                                "problems": k.get("problems")}, []))
    data = client.post("/api/generated/a1/mark", data={"status": "problem", "problems": "手壞"}).json()
    assert data["ok"] is True
    assert data["status"] == "problem"
    assert data["problems"] == ["手壞"]


def test_api_mark_bad_status(client):
    resp = client.post("/api/generated/a1/mark", data={"status": "weird"})
    assert resp.status_code == 400


def test_api_mark_missing_asset(client, monkeypatch):
    monkeypatch.setattr(image_importer, "update_generated_metadata",
                        lambda asset_id, **k: (None, ["找不到"]))
    resp = client.post("/api/generated/ghost/mark", data={"status": "accepted"})
    assert resp.status_code == 404


# --- C4-A：annotate（rating / tags）---
def test_api_annotate_updates_rating_tags(client, monkeypatch):
    captured = {}

    def fake_update(asset_id, **k):
        captured.update({"asset_id": asset_id, **k})
        return ({"asset_id": asset_id, "rating": k.get("rating"),
                 "tags": k.get("tags"), "status": k.get("status"),
                 "problems": k.get("problems")}, [])
    monkeypatch.setattr(image_importer, "update_generated_metadata", fake_update)
    data = client.post("/api/generated/a1/annotate",
                       data={"rating": "4", "tags": " a , a , b , "}).json()
    assert data["ok"] is True
    assert data["rating"] == 4
    assert data["tags"] == ["a", "b"]        # endpoint 已清理 tags
    assert captured["rating"] == 4
    assert captured["tags"] == ["a", "b"]


def test_api_annotate_bad_rating(client):
    for bad in ("6", "-1", "x", "1.5"):
        resp = client.post("/api/generated/a1/annotate", data={"rating": bad})
        assert resp.status_code == 400, bad


def test_api_annotate_no_fields(client):
    resp = client.post("/api/generated/a1/annotate", data={})
    assert resp.status_code == 400


def test_api_annotate_missing_asset(client, monkeypatch):
    monkeypatch.setattr(image_importer, "update_generated_metadata",
                        lambda asset_id, **k: (None, ["找不到"]))
    resp = client.post("/api/generated/ghost/annotate", data={"rating": "3"})
    assert resp.status_code == 404


def test_api_generated_passes_through_rating_tags(client, monkeypatch):
    items = [{"asset_id": "a1", "character_id": "hoshino_akari", "task_id": "character_rough",
              "rating": 5, "tags": ["fav"]}]
    monkeypatch.setattr(image_importer, "load_all_metadata", lambda *a, **k: items)
    data = client.get("/api/generated").json()
    assert data["items"][0]["rating"] == 5
    assert data["items"][0]["tags"] == ["fav"]


def test_api_adopt(client, monkeypatch):
    entry = {"asset_id": "a1", "task_id": "character_rough", "character_id": "hoshino_akari"}
    monkeypatch.setattr(image_importer, "get_metadata_entry", lambda *a, **k: entry)
    monkeypatch.setattr(image_importer, "adopt_asset",
                        lambda *a, **k: {"ok": True, "message": "done", "warnings": [],
                                         "dest_public_path": "/assets/characters/hoshino_akari/x.png"})
    captured = {}
    monkeypatch.setattr(image_importer, "update_generated_metadata",
                        lambda asset_id, **k: (captured.update({"asset_id": asset_id, **k}) or (entry, [])))
    data = client.post("/api/generated/a1/adopt").json()
    assert data["ok"] is True
    assert data["adopted_to"].endswith("x.png")
    assert captured["status"] == "accepted"
    assert captured["adopted_to"].endswith("x.png")


def test_api_adopt_missing_asset(client, monkeypatch):
    monkeypatch.setattr(image_importer, "get_metadata_entry", lambda *a, **k: None)
    resp = client.post("/api/generated/ghost/adopt")
    assert resp.status_code == 404


def test_api_diagnostics_summary(client, monkeypatch):
    items = [
        {"asset_id": "a1", "adopted_to": "/assets/characters/x/y.png"},
        {"asset_id": "a2", "adopted_to": None},
    ]
    monkeypatch.setattr(image_importer, "load_all_metadata", lambda *a, **k: items)
    data = client.get("/api/diagnostics").json()
    assert data["mode"] == "0-E generation enabled"
    # client fixture：online 但無 checkpoint → 不可生成、黃燈
    assert data["comfyui"]["online"] is True
    assert data["comfyui"]["checkpoints_ok"] is False
    assert data["comfyui"]["status_level"] == "yellow"
    assert data["config"]["styles_count"] == 6
    assert data["config"]["can_generate"] is False
    assert data["assets"]["generated_count"] == 2
    assert data["assets"]["adopted_count"] == 1


def test_api_diagnostics_loras_found_missing(client, monkeypatch):
    """diagnostics 列出 available / required / missing；缺 LoRA 不改 can_generate。"""
    monkeypatch.setattr(comfy_client, "get_loras",
                        lambda *a, **k: (["dogma_animaV1.6.safetensors"], []))
    data = client.get("/api/diagnostics").json()
    loras = data["loras"]
    assert "dogma_animaV1.6.safetensors" in loras["available"]
    # anima_airbrush_editorial（D 版）需要 gpt-image-2 + dogma：dogma found、gpt-image-2 missing
    assert "gpt-image-2_anima-base1_v1.safetensors" in loras["missing"]
    assert "dogma_animaV1.6.safetensors" not in loras["missing"]
    assert "AnimaNEWNSS8.safetensors" not in loras["required"]   # D 版已移除 NSS
    assert "anima_airbrush_editorial" in [b["id"] for b in loras["by_style"]]
    # 缺 LoRA 不影響 can_generate（此處 False 是因無 checkpoint，與 lora 無關）
    assert data["config"]["can_generate"] is False
