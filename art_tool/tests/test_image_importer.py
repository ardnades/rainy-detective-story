"""0-E image_importer.py 測試。不需真 ComfyUI、不連網路；HTTP 注入、路徑用 tmp_path。"""
import json
from pathlib import Path

import image_importer as imp


class FakeResp:
    def __init__(self, status_code=200, content=b""):
        self.status_code = status_code
        self.content = content


HISTORY_OK = {
    "outputs": {
        "9": {"images": [
            {"filename": "out_00001_.png", "subfolder": "", "type": "output"},
            {"filename": "out_00002_.png", "subfolder": "sub", "type": "output"},
        ]},
        "10": {"text": "not images"},
    }
}


# ----------------------------------------------------------------------
# parse_comfy_history_for_images
# ----------------------------------------------------------------------
def test_parse_history_common_format():
    refs, warns = imp.parse_comfy_history_for_images(HISTORY_OK)
    assert len(refs) == 2
    assert refs[0]["filename"] == "out_00001_.png"
    assert refs[1]["subfolder"] == "sub"
    assert warns == []


def test_parse_history_no_images_warns():
    refs, warns = imp.parse_comfy_history_for_images({"outputs": {"9": {"text": "x"}}})
    assert refs == []
    assert warns and "找不到任何圖片" in warns[0]


def test_parse_history_non_dict():
    refs, warns = imp.parse_comfy_history_for_images(None)
    assert refs == []
    assert warns


# ----------------------------------------------------------------------
# fetch_comfy_image
# ----------------------------------------------------------------------
def test_fetch_image_success():
    def http_get(target, timeout=None):
        assert "/view?" in target and "filename=out_00001_.png" in target
        return FakeResp(200, b"PNGBYTES")
    data, warn = imp.fetch_comfy_image(
        "http://127.0.0.1:8000", {"filename": "out_00001_.png", "subfolder": "", "type": "output"},
        http_get=http_get)
    assert data == b"PNGBYTES"
    assert warn is None


def test_fetch_image_http_error_no_crash():
    data, warn = imp.fetch_comfy_image(
        "http://127.0.0.1:8000", {"filename": "x.png"},
        http_get=lambda t, timeout=None: FakeResp(404, b""))
    assert data is None
    assert warn is not None


def test_fetch_image_exception_no_crash():
    def boom(t, timeout=None):
        raise ConnectionError("down")
    data, warn = imp.fetch_comfy_image("http://127.0.0.1:8000", {"filename": "x.png"}, http_get=boom)
    assert data is None
    assert "請求失敗" in warn


def test_fetch_image_empty_content():
    data, warn = imp.fetch_comfy_image(
        "http://127.0.0.1:8000", {"filename": "x.png"},
        http_get=lambda t, timeout=None: FakeResp(200, b""))
    assert data is None
    assert warn is not None


# ----------------------------------------------------------------------
# save_generated_image
# ----------------------------------------------------------------------
def test_save_image_writes_to_correct_dir(tmp_path):
    gen = tmp_path / "generated"
    meta = gen / "metadata.json"
    entry = imp.save_generated_image(
        b"PNGDATA", character_id="hoshino_akari", task_id="character_rough",
        source_ref={"filename": "out_00001_.png", "subfolder": "", "type": "output"},
        metadata_fields={"style_id": "soft_romance_avg", "seed": 42},
        generated_dir=gen, metadata_path=meta, now="2026-06-12T10:00:00",
        asset_id="aid123",
    )
    assert entry is not None
    p = Path(entry["local_path"])
    assert p.exists()
    assert p.read_bytes() == b"PNGDATA"
    assert p.parent == (gen / "hoshino_akari" / "character_rough").resolve()
    assert entry["public_path"] == "/assets/generated/hoshino_akari/character_rough/aid123.png"
    assert entry["status"] == "candidate"
    assert entry["style_id"] == "soft_romance_avg"
    assert entry["seed"] == 42
    # metadata.json 有一筆
    data = json.loads(meta.read_text(encoding="utf-8"))
    assert len(data) == 1 and data[0]["asset_id"] == "aid123"


def test_save_image_prevents_path_traversal(tmp_path):
    gen = tmp_path / "generated"
    entry = imp.save_generated_image(
        b"X", character_id="../../evil", task_id="../escape",
        source_ref={"filename": "a.png"}, generated_dir=gen,
        metadata_path=gen / "metadata.json", asset_id="aid", now="2026-06-12T10:00:00",
    )
    assert entry is not None
    local = Path(entry["local_path"]).resolve()
    # 必須仍在 generated_dir 內，且不含 ..
    assert str(local).startswith(str(gen.resolve()))
    assert ".." not in entry["public_path"]
    # 不可在 generated 外建立檔案
    assert not (tmp_path / "evil").exists()


def test_save_image_rejects_bad_ext(tmp_path):
    gen = tmp_path / "generated"
    entry = imp.save_generated_image(
        b"X", character_id="c", task_id="t",
        source_ref={"filename": "malware.exe"}, generated_dir=gen,
        metadata_path=gen / "metadata.json")
    assert entry is None


# ----------------------------------------------------------------------
# metadata：更新 / 損壞備份
# ----------------------------------------------------------------------
def _seed_one(tmp_path, asset_id="aid1"):
    gen = tmp_path / "generated"
    meta = gen / "metadata.json"
    imp.save_generated_image(
        b"X", character_id="c", task_id="t", source_ref={"filename": "a.png"},
        generated_dir=gen, metadata_path=meta, asset_id=asset_id, now="2026-06-12T10:00:00")
    return meta


def test_update_metadata_status_and_problems(tmp_path):
    meta = _seed_one(tmp_path)
    entry, warns = imp.update_generated_metadata(
        "aid1", status="problem", problems=["手壞"], metadata_path=meta, now="2026-06-12T11:00:00")
    assert warns == []
    assert entry["status"] == "problem"
    assert entry["problems"] == ["手壞"]
    # 落地檔有更新
    data = json.loads(meta.read_text(encoding="utf-8"))
    assert data[0]["status"] == "problem"


def test_update_metadata_adopted_to(tmp_path):
    meta = _seed_one(tmp_path)
    entry, _ = imp.update_generated_metadata(
        "aid1", status="accepted", adopted_to="/assets/characters/c/x.png", metadata_path=meta)
    assert entry["adopted_to"] == "/assets/characters/c/x.png"


def test_update_metadata_missing_asset(tmp_path):
    meta = _seed_one(tmp_path)
    entry, warns = imp.update_generated_metadata("nope", status="accepted", metadata_path=meta)
    assert entry is None
    assert warns


def test_corrupt_metadata_backed_up_not_overwritten(tmp_path):
    gen = tmp_path / "generated"
    gen.mkdir(parents=True)
    meta = gen / "metadata.json"
    meta.write_text("{ this is broken json", encoding="utf-8")
    # 觸發一次寫入（save），應先備份損壞檔再寫新檔
    imp.save_generated_image(
        b"X", character_id="c", task_id="t", source_ref={"filename": "a.png"},
        generated_dir=gen, metadata_path=meta, asset_id="new1", now="2026-06-12T10:00:00")
    backups = list(gen.glob("metadata.corrupt.*.json"))
    assert backups, "損壞的 metadata 應被備份"
    assert backups[0].read_text(encoding="utf-8").startswith("{ this is broken")
    # 新 metadata.json 為合法 list，含新項目
    data = json.loads(meta.read_text(encoding="utf-8"))
    assert isinstance(data, list) and data[0]["asset_id"] == "new1"


# ----------------------------------------------------------------------
# adopt_asset
# ----------------------------------------------------------------------
def _make_entry(tmp_path, character_id="hoshino_akari", task_id="character_rough"):
    src = tmp_path / "src.png"
    src.write_bytes(b"IMG")
    return {
        "asset_id": "aid-abcdef12", "character_id": character_id, "task_id": task_id,
        "local_path": str(src), "style_id": "soft_romance_avg", "checkpoint": "m.safetensors",
        "seed": 7, "width": 832, "height": 1216, "steps": 28, "cfg": 6.5,
        "sampler": "dpmpp_2m", "scheduler": "karras",
        "positive_prompt": "p", "negative_prompt": "n", "created_at": "2026-06-12T10:00:00",
    }


def test_adopt_character_copies_to_characters_dir(tmp_path):
    entry = _make_entry(tmp_path)
    task = {"id": "character_rough", "output_kind": "character"}
    res = imp.adopt_asset(entry, task, characters_dir=tmp_path / "characters",
                          cg_dir=tmp_path / "cg", now="2026-06-12T12:00:00")
    assert res["ok"] is True
    dest = tmp_path / "characters" / "hoshino_akari"
    pngs = list(dest.glob("*.png"))
    assert len(pngs) == 1
    assert pngs[0].read_bytes() == b"IMG"
    # sidecar metadata
    sidecar = pngs[0].with_suffix(".json")
    assert sidecar.exists()
    meta = json.loads(sidecar.read_text(encoding="utf-8"))
    assert meta["seed"] == 7 and meta["source_task_id"] == "character_rough"
    assert res["dest_public_path"].startswith("/assets/characters/hoshino_akari/")


def test_adopt_cg_copies_to_cg_dir(tmp_path):
    entry = _make_entry(tmp_path, task_id="event_cg")
    task = {"id": "event_cg", "output_kind": "cg"}
    res = imp.adopt_asset(entry, task, characters_dir=tmp_path / "characters",
                          cg_dir=tmp_path / "cg")
    assert res["ok"] is True
    assert list((tmp_path / "cg").glob("*.png"))
    assert res["dest_public_path"].startswith("/assets/cg/")


def test_adopt_unknown_kind_requires_manual(tmp_path):
    entry = _make_entry(tmp_path)
    res = imp.adopt_asset(entry, {"id": "x", "output_kind": "weird"},
                          characters_dir=tmp_path / "characters", cg_dir=tmp_path / "cg")
    assert res["ok"] is False
    assert res["dest_public_path"] is None
    assert any("output_kind" in w for w in res["warnings"])


# ----------------------------------------------------------------------
# 防護：list 含非 dict 視為損壞（避免下游 .get() 500）
# ----------------------------------------------------------------------
def test_metadata_list_of_non_dicts_treated_as_corrupt(tmp_path):
    gen = tmp_path / "generated"
    gen.mkdir(parents=True)
    meta = gen / "metadata.json"
    meta.write_text(json.dumps([1, 2, "x"]), encoding="utf-8")  # 合法 JSON list，但元素非 dict
    items = imp.load_all_metadata(meta)
    assert items == []                                          # 不可把垃圾當正常資料回傳
    assert list(gen.glob("metadata.corrupt.*.json"))           # 應已備份


def test_get_entry_on_corrupt_list_does_not_crash(tmp_path):
    gen = tmp_path / "generated"
    gen.mkdir(parents=True)
    meta = gen / "metadata.json"
    meta.write_text(json.dumps([1, 2]), encoding="utf-8")
    assert imp.get_metadata_entry("whatever", metadata_path=meta) is None  # 不 raise


# ----------------------------------------------------------------------
# 併發：多執行緒同時 save，metadata 不可遺失條目（lock 保護）
# ----------------------------------------------------------------------
def test_concurrent_saves_keep_all_entries(tmp_path):
    import threading
    gen = tmp_path / "generated"
    meta = gen / "metadata.json"
    n = 24

    def worker(i):
        imp.save_generated_image(
            b"X", character_id="c", task_id="t",
            source_ref={"filename": f"o_{i}.png"}, generated_dir=gen,
            metadata_path=meta, asset_id=f"aid{i}", now="2026-06-12T10:00:00")

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    data = json.loads(meta.read_text(encoding="utf-8"))
    assert len(data) == n                                       # 無 lost-update
    assert {e["asset_id"] for e in data} == {f"aid{i}" for i in range(n)}
