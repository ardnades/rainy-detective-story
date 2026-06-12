"""0-E generation_service.py 測試。全程 mock，不需真 ComfyUI、不真生圖。"""
import random

import pytest

import comfy_client
import config
import generation_service as gs
import image_importer


# ----------------------------------------------------------------------
# 共用假物件
# ----------------------------------------------------------------------
def make_cfg(url="http://127.0.0.1:8000"):
    return config.AppConfig(
        comfyui=config.UrlDetection(url=url, source="probe", online=True, message="ok"),
        comfyui_path=config.PathDetection(path=None, source="none", found=False, message="x"),
    )


def make_health(*, online=True, queue_ok=True, checkpoints=("m.safetensors",), system_ok=True):
    cps = list(checkpoints)
    return comfy_client.ComfyHealth(
        online=online, url="http://127.0.0.1:8000", message="x",
        system_ok=system_ok, queue_ok=queue_ok, gpu="4090",
        vram_total_mb=24000, vram_free_mb=22000,
        checkpoints=cps, checkpoints_ok=bool(cps), warnings=[],
    )


def _cfg_lists():
    styles = config.load_art_styles()["styles"]
    characters = config.load_characters()["characters"]
    tasks = config.load_art_tasks()["tasks"]
    return styles, characters, tasks


def make_request(**over):
    base = dict(style_id="soft_romance_avg", character_id="hoshino_akari",
                task_id="character_rough", checkpoint="m.safetensors",
                batch_count=2, width=832, height=1216, seed=1000)
    base.update(over)
    return gs.GenerationRequest(**base)


@pytest.fixture
def happy(monkeypatch):
    """健康、workflow 正常、patch/queue 成功的預設環境。"""
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health())
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: {"3": {"x": 1}})
    monkeypatch.setattr(comfy_client, "patch_workflow",
                        lambda *a, **k: comfy_client.WorkflowPatchResult(
                            ok=True, workflow={"patched": True}, message="ok"))
    calls = {"queue": 0}

    def fake_queue(url, wf, *, http_post=None, timeout=30, client_id=None):
        calls["queue"] += 1
        return comfy_client.QueueResult(ok=True, prompt_id=f"pid-{calls['queue']}",
                                        message="ok", raw={})
    monkeypatch.setattr(comfy_client, "queue_prompt", fake_queue)
    return calls


# ----------------------------------------------------------------------
# build_generation_prompt
# ----------------------------------------------------------------------
def test_build_prompt_combines_and_auto_seed():
    styles, chars, tasks = _cfg_lists()
    req = make_request(seed=None)
    summary = gs.build_generation_prompt(req, styles=styles, characters=chars, tasks=tasks,
                                         rng=random.Random(0))
    assert summary["warnings"] == []
    assert "masterpiece" in summary["positive"]            # style prefix
    assert "idol" in summary["positive"]                   # character visual_core
    assert summary["seed_mode"] == "auto"
    assert isinstance(summary["seed"], int)
    assert summary["sampler"] == "er_sde"                  # 來自畫風（Anima 建議）


def test_build_prompt_fixed_seed():
    styles, chars, tasks = _cfg_lists()
    summary = gs.build_generation_prompt(make_request(seed=555), styles=styles,
                                         characters=chars, tasks=tasks)
    assert summary["seed"] == 555 and summary["seed_mode"] == "fixed"


# ----------------------------------------------------------------------
# create_generation_job：前置安全檢查
# ----------------------------------------------------------------------
def _create(monkeypatch, request, **kw):
    styles, chars, tasks = _cfg_lists()
    jobs = {}
    return gs.create_generation_job(request, app_config=make_cfg(), styles=styles,
                                    characters=chars, tasks=tasks, jobs=jobs,
                                    now="2026-06-12T10:00:00", gen_job_id="job1", **kw)


def test_create_fails_when_checkpoints_empty(monkeypatch, happy):
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health(checkpoints=()))
    job = _create(monkeypatch, make_request())
    assert job.status == "failed"
    assert "checkpoint" in job.message


def test_create_fails_when_offline(monkeypatch, happy):
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health(online=False))
    job = _create(monkeypatch, make_request())
    assert job.status == "failed"
    assert "離線" in job.message


def test_create_fails_when_queue_down(monkeypatch, happy):
    monkeypatch.setattr(comfy_client, "health_check", lambda *a, **k: make_health(queue_ok=False))
    job = _create(monkeypatch, make_request())
    assert job.status == "failed"
    assert "queue" in job.message


def test_create_fails_when_workflow_missing(monkeypatch, happy):
    monkeypatch.setattr(comfy_client, "load_workflow_template", lambda *a, **k: None)
    job = _create(monkeypatch, make_request())
    assert job.status == "failed"
    assert "workflow" in job.message


def test_create_fails_when_patch_fails_and_does_not_queue(monkeypatch, happy):
    monkeypatch.setattr(comfy_client, "patch_workflow",
                        lambda *a, **k: comfy_client.WorkflowPatchResult(
                            ok=False, workflow=None, message="缺 node",
                            warnings=["EmptyLatentImage"]))
    job = _create(monkeypatch, make_request())
    assert job.status == "failed"
    assert "patch" in job.message
    assert happy["queue"] == 0          # patch 失敗就不可 queue


def test_create_fails_when_queue_fails(monkeypatch, happy):
    monkeypatch.setattr(comfy_client, "queue_prompt",
                        lambda *a, **k: comfy_client.QueueResult(
                            ok=False, prompt_id=None, message="bad"))
    job = _create(monkeypatch, make_request())
    assert job.status == "failed"
    assert "佇列" in job.message


def test_create_fails_when_checkpoint_not_in_list(monkeypatch, happy):
    job = _create(monkeypatch, make_request(checkpoint="ghost.safetensors"))
    assert job.status == "failed"
    assert "checkpoint" in job.message


def test_create_batch_out_of_range(monkeypatch, happy):
    job = _create(monkeypatch, make_request(batch_count=99))
    assert job.status == "failed"
    assert "batch_count" in job.message


def test_create_success_queues_batch(monkeypatch, happy):
    job = _create(monkeypatch, make_request(batch_count=3))
    assert job.status == "running"
    assert len(job.prompt_ids) == 3
    assert happy["queue"] == 3
    assert job.prompt_id == "pid-1"
    # batch 用不同 seed
    assert job.prompt_seeds == [1000, 1001, 1002]


# ----------------------------------------------------------------------
# run_generation_job
# ----------------------------------------------------------------------
def _running_job():
    req = make_request(batch_count=1)
    job = gs.GenerationJob(job_id="job1", status="running", created_at="t", updated_at="t",
                           request=req)
    job.prompt_ids = ["pid-1"]
    job.prompt_seeds = [1000]
    job.prompt_summary = gs.build_generation_prompt(
        req, *(), styles=_cfg_lists()[0], characters=_cfg_lists()[1], tasks=_cfg_lists()[2])
    return job


def test_run_success_flow(monkeypatch):
    history = {"outputs": {"9": {"images": [{"filename": "o_1.png", "subfolder": "", "type": "output"}]}}}
    monkeypatch.setattr(comfy_client, "wait_for_result", lambda *a, **k: history)
    monkeypatch.setattr(image_importer, "fetch_comfy_image", lambda *a, **k: (b"PNG", None))
    saved = {}

    def fake_save(data, **k):
        saved.update(k)
        return {"public_path": "/assets/generated/c/t/x.png", "asset_id": "x"}
    monkeypatch.setattr(image_importer, "save_generated_image", fake_save)

    job = _running_job()
    result = gs.run_generation_job(job, app_config=make_cfg(), sleep=lambda s: None,
                                   http_get=lambda *a, **k: None, now="2026-06-12T10:00:00")
    assert result.ok is True
    assert job.status == "completed"
    assert len(result.files) == 1
    # 落地時帶上 per-image seed 與 prompt 摘要
    assert saved["metadata_fields"]["seed"] == 1000
    assert "positive_prompt" in saved["metadata_fields"]


def test_run_timeout_fails(monkeypatch):
    monkeypatch.setattr(comfy_client, "wait_for_result", lambda *a, **k: None)
    job = _running_job()
    result = gs.run_generation_job(job, app_config=make_cfg(), sleep=lambda s: None,
                                   http_get=lambda *a, **k: None)
    assert result.ok is False
    assert job.status == "failed"
    assert any("逾時" in w for w in result.warnings)


def test_run_no_images_fails(monkeypatch):
    monkeypatch.setattr(comfy_client, "wait_for_result",
                        lambda *a, **k: {"outputs": {"9": {"text": "x"}}})
    job = _running_job()
    result = gs.run_generation_job(job, app_config=make_cfg(), sleep=lambda s: None,
                                   http_get=lambda *a, **k: None)
    assert result.ok is False
    assert job.status == "failed"
