#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
batch_cutout.py — 批次白底去背 + QC + 頭髮 alpha review（本機工具，非破壞）

把已驗證的單張流程整理成可批次、可 review、可重跑的 CLI：
  pass1  邊界連通白底移除
  pass2  內部負空間白洞移除（保留圍巾/口罩/連帽衣/鞋/rim light）
  hair   頭髮 alpha review（只標記紅/黃/青，不自動改 alpha）

設計原則（本輪明確邊界）：
  - 不重畫、不用 AI、不改 RGB 角色本體、canvas 尺寸不變、feather 維持已驗證版本
  - 不更新 manifest、不接遊戲、不放回 approved、不覆蓋原圖或既有成果
  - 全部輸出到 gitignored 的 generated 區

用法：
  python batch_cutout.py --input <dir> --output <dir>           # 主：掃描資料夾
  python batch_cutout.py --files a.png,b.png --output <dir>     # 選用：明確檔案清單
  python batch_cutout.py --filelist list.txt --output <dir>    # 選用：清單檔（每行一路徑）
  python batch_cutout.py --input <dir> --glob "*v002*.png" --output <dir>
  可選：--batch-name NAME  --overwrite  --no-hair  --quiet

門檻值集中於下方 CONFIG，日後要調只改這裡。
"""

import argparse
import csv
import glob as globmod
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# ============================== CONFIG（已驗證門檻，集中於此） ==============================
CFG = {
    # --- pass1：white 偵測 ---
    "white_min": 244,          # near-white：min channel >= 此值
    "white_sat": 14,           # near-white：max-min <= 此值（低飽和）

    # --- pass2：內部負空間白洞（只刪確定是背景的封閉洞，保護髮絲/rim/圍巾/鞋） ---
    "p2_min_area": 250,        # 元件最小面積
    "p2_flat_std": 1.5,        # 灰階 std 必須 < 此值（背景極平）
    "p2_min_bright": 248,      # 平均亮度 >= 此值
    "p2_color_dist": 6.0,      # 與背景白色距離 < 此值
    "p2_min_med_dist": 30,     # 到外背景的 median 距離 >= 此值（深藏=真洞；rim light 很淺被排除）

    # --- feather（輕羽化，已驗證版本） ---
    "feather_sigma": 0.8,
    "feather_resolidify_above": 250,

    # --- 合成背景色 ---
    "bg_dark": (25, 28, 34),
    "bg_mid": (128, 128, 128),
    "checker_a": (200, 200, 200),
    "checker_b": (120, 120, 120),
    "checker_size": 24,

    # --- hair review：候選偵測 ---
    "hair_dark_lt": 95,        # 暗髮/帽偵測：gray < 此值
    "hair_roi_dilate": 20,     # 頭髮 ROI 外擴
    "hair_near_dilate": 8,     # 候選需在暗髮附近此 px 內
    "hair_bg_edge_dilate": 2,  # 或在去背邊界此 px 內（髮尾 halo）
    "hair_bright": 228,        # 候選亮度 >= 此值
    "hair_sat": 26,            # 候選 max-min <= 此值
    "hair_min_area": 3,

    # --- hair review：紅/黃/青分類（已驗證規則） ---
    "hair_cyan_elong": 3.0,    # 細長 → rim/髮絲高光（青，保留）
    "hair_cyan_warm": 0.5,     # 暖色比例 >= → rim light（青）
    "hair_cyan_deep_dist": 30, # 深藏髮內 dist > → 髮絲高光（青）
    "hair_yellow_edge_dist": 2,# dmin <= → 髮緣 halo（黃，人判）
    "hair_red_elong_lt": 2.0,  # 紅：緊湊
    "hair_red_dmed_lo": 4,     # 紅：4 <= dmed <= 30
    "hair_red_dmed_hi": 30,
    "hair_red_std_lt": 7,      # 紅：std < 此值

    # --- recommended_status 分級 ---
    "status_autopass_red_max": 0,
    "status_autopass_yellow_max": 2,
    "status_fast_red_max": 3,
    "status_fast_total_max": 8,

    # --- 期望尺寸（用於 size 異常 warning；不符仍跑） ---
    "expected_dims": {"full": (832, 1216), "bust": (910, 904)},
}

# 標記色
RED = np.array([235, 30, 40], np.uint8)
YEL = np.array([245, 220, 30], np.uint8)
CYN = np.array([0, 210, 235], np.uint8)


# ============================== 檔名解析 ==============================
def parse_meta(fname):
    """從檔名推 sprite_type(full/bust) 與 mask_state(maskoff/maskon/maskhalf)。
    同時容忍 mask_off / mask_on / mask_half 與 bustup 寫法。回傳 (sprite, mask, warnings)。"""
    n = fname.lower()
    warns = []
    if "full" in n:
        sprite = "full"
    elif "bust" in n:  # 含 bust / bustup
        sprite = "bust"
    else:
        sprite = "unknown"
        warns.append("filename 未含 full/bust，sprite_type=unknown")
    if "maskhalf" in n or "mask_half" in n:
        mask = "maskhalf"
    elif "maskoff" in n or "mask_off" in n:
        mask = "maskoff"
    elif "maskon" in n or "mask_on" in n:
        mask = "maskon"
    else:
        mask = "unknown"
        warns.append("filename 未含 mask 狀態，mask_state=unknown")
    return sprite, mask, warns


# ============================== 核心影像處理 ==============================
def near_white(rgb):
    mx = rgb.max(2).astype(np.int16)
    mn = rgb.min(2).astype(np.int16)
    return (mn >= CFG["white_min"]) & ((mx - mn) <= CFG["white_sat"])


def compute_alpha(rgb):
    """pass1 + pass2 + feather。回傳 alpha(uint8) 與統計 dict。"""
    h, w = rgb.shape[:2]
    white = near_white(rgb)

    # pass1：邊界連通白底
    lbl, _ = ndimage.label(white)
    border_ids = set(np.unique(np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]])))
    border_ids.discard(0)
    bg1 = np.isin(lbl, list(border_ids))
    bg_color = rgb[bg1].mean(0) if bg1.any() else np.array([252.0, 252.0, 252.0])

    # pass2：內部負空間白洞
    dist = ndimage.distance_transform_edt(~bg1)
    interior = white & (~bg1)
    ilbl, ni = ndimage.label(interior)
    gray = rgb.mean(2)
    bg2 = np.zeros_like(bg1)
    removed = []
    for i in range(1, ni + 1):
        m = ilbl == i
        sz = int(m.sum())
        if sz < CFG["p2_min_area"]:
            continue
        st = float(gray[m].std())
        br = float(gray[m].mean())
        if st >= CFG["p2_flat_std"] or br < CFG["p2_min_bright"]:
            continue
        cdist = float(((rgb[m].mean(0) - bg_color) ** 2).sum() ** 0.5)
        if cdist > CFG["p2_color_dist"]:
            continue
        med = float(np.median(dist[m]))
        if med < CFG["p2_min_med_dist"]:
            continue
        bg2[m] = True
        removed.append({"size": sz, "std": round(st, 2), "median_dist": round(med, 1)})

    bg = bg1 | bg2
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # feather（已驗證）
    af = ndimage.gaussian_filter(alpha.astype(np.float32), CFG["feather_sigma"])
    alpha = np.minimum(alpha, af.round().astype(np.uint8))
    alpha = np.where((~bg) & (af > CFG["feather_resolidify_above"]), 255, alpha).astype(np.uint8)

    stats = {
        "pass1_removed_ratio": round(float(bg1.mean()), 4),
        "pass2_removed_components": len(removed),
        "pass2_removed_pixels": int(bg2.sum()),
        "pass2_detail": removed,
    }
    return alpha, bg1, bg2, white, stats


# ============================== QC 合成 ==============================
def _over(rgb, alpha, bg):
    a = (alpha / 255.0)[..., None]
    return (rgb.astype(np.float32) * a + np.array(bg, np.float32) * (1 - a)).round().astype(np.uint8)


def _checker(h, w):
    yy, xx = np.mgrid[0:h, 0:w]
    c = (((xx // CFG["checker_size"]) + (yy // CFG["checker_size"])) % 2)
    return np.where(c[..., None] == 0, np.array(CFG["checker_a"]), np.array(CFG["checker_b"])).astype(np.float32)


def make_qc(rgb, alpha, bg1, bg2, white):
    h, w = alpha.shape
    out = {}
    out["qc_dark"] = _over(rgb, alpha, CFG["bg_dark"])
    out["qc_midgray"] = _over(rgb, alpha, CFG["bg_mid"])
    out["qc_checker"] = _over(rgb, alpha, _checker(h, w))
    ov = rgb.copy()
    ov[bg1] = (ov[bg1] * 0.45 + np.array([90, 90, 90]) * 0.55).astype(np.uint8)
    ov[bg2] = np.array([230, 30, 160])
    out["removed_overlay"] = ov
    kept = white & (alpha == 255)
    ov2 = rgb.copy()
    ov2[kept] = np.array([0, 200, 230])
    out["protected_white_overlay"] = ov2
    return out


# ============================== hair review ==============================
def _skin(rgb):
    r, g, b = [rgb[..., i].astype(int) for i in range(3)]
    return (r > 150) & (r >= g) & (g >= b) & ((r - b) > 12) & ((r - b) < 90)


def _warm(rgb):
    return (rgb[..., 0].astype(int) - rgb[..., 2].astype(int)) >= 8


def hair_review(rgb, alpha):
    """回傳 (overlay, redmask, counts, points, warnings)。只標記不改 alpha。"""
    h, w = alpha.shape
    gray = rgb.mean(2)
    opaque = alpha == 255
    bg = alpha == 0
    warns = []
    dark = (gray < CFG["hair_dark_lt"]) & opaque
    if not dark.any():
        return None, None, {"red": 0, "yellow": 0, "cyan": 0}, [], ["無暗髮像素，hair review 略過"]
    dl, _ = ndimage.label(dark)
    ys, xs = np.where(dark)
    hid = dl[ys[ys.argmin()], xs[ys.argmin()]]      # 含最上方暗像素的連通塊=頭部(髮+帽)
    head = dl == hid
    hy, hx = np.where(head)
    r0, r1, c0, c1 = hy.min(), hy.max(), hx.min(), hx.max()
    roi = ndimage.binary_dilation(head, iterations=CFG["hair_roi_dilate"])
    near_hair = ndimage.binary_dilation(head, iterations=CFG["hair_near_dilate"])
    bg_edge = ndimage.binary_dilation(bg, iterations=CFG["hair_bg_edge_dilate"]) & opaque
    distbg = ndimage.distance_transform_edt(~bg)

    bl = (gray >= CFG["hair_bright"]) & ((rgb.max(2).astype(int) - rgb.min(2).astype(int)) <= CFG["hair_sat"])
    cand = bl & opaque & roi & (~_skin(rgb)) & (near_hair | bg_edge)
    cl, cn = ndimage.label(cand)

    a = (alpha / 255.0)[..., None]
    base = (rgb.astype(np.float32) * a + np.array(CFG["bg_dark"], np.float32) * (1 - a))
    base[~roi] = base[~roi] * 0.45 + np.array(CFG["bg_dark"], np.float32) * 0.55
    overlay = base.astype(np.uint8).copy()
    redmask = np.zeros((h, w), bool)

    counts = {"red": 0, "yellow": 0, "cyan": 0}
    points = []
    for i in range(1, cn + 1):
        m = cl == i
        sz = int(m.sum())
        if sz < CFG["hair_min_area"]:
            continue
        yy, xx = np.where(m)
        bh = yy.max() - yy.min() + 1
        bw = xx.max() - xx.min() + 1
        elong = max(bh, bw) / max(1, min(bh, bw))
        dmin = float(distbg[m].min())
        dmed = float(np.median(distbg[m]))
        st = float(gray[m].std())
        warmf = float(_warm(rgb)[m].mean())
        cy, cx = int(yy.mean()), int(xx.mean())
        side = "L" if cx < (c0 + c1) // 2 else "R"
        if elong >= CFG["hair_cyan_elong"] or warmf >= CFG["hair_cyan_warm"] or dmed > CFG["hair_cyan_deep_dist"]:
            col, kind = CYN, "cyan"
        elif dmin <= CFG["hair_yellow_edge_dist"]:
            col, kind = YEL, "yellow"
        elif elong < CFG["hair_red_elong_lt"] and CFG["hair_red_dmed_lo"] <= dmed <= CFG["hair_red_dmed_hi"] and st < CFG["hair_red_std_lt"]:
            col, kind = RED, "red"
            redmask |= m
        else:
            col, kind = YEL, "yellow"
        counts[kind] += 1
        overlay[ndimage.binary_dilation(m, iterations=2)] = col
        if kind in ("red", "yellow"):
            points.append({"kind": kind, "row": cy, "col": cx, "size": sz, "side": side,
                           "elong": round(elong, 1), "median_dist": round(dmed, 1), "std": round(st, 1)})
    # ROI 外框
    overlay[max(0, r0 - 1):r0 + 1, c0:c1 + 1] = [120, 120, 120]
    overlay[r1:r1 + 2, c0:c1 + 1] = [120, 120, 120]
    overlay[r0:r1 + 1, max(0, c0 - 1):c0 + 1] = [120, 120, 120]
    overlay[r0:r1 + 1, c1:c1 + 2] = [120, 120, 120]

    rm = None
    if redmask.any():
        rm = np.zeros((h, w, 4), np.uint8)
        rm[redmask] = [255, 0, 0, 255]
        ring = ndimage.binary_dilation(redmask, iterations=2) & (~redmask)
        rm[ring] = [255, 0, 0, 90]
    return overlay, rm, counts, points, warns


# ============================== 分級 ==============================
def classify(has_valid_alpha_before, counts, warnings):
    if has_valid_alpha_before:
        return "skip_existing_alpha"
    blocking = [w for w in warnings if w.startswith("BLOCK:")]
    if blocking:
        return "manual_fix_needed"
    red, yel = counts["red"], counts["yellow"]
    if red <= CFG["status_autopass_red_max"] and yel <= CFG["status_autopass_yellow_max"]:
        return "auto_pass"
    if red <= CFG["status_fast_red_max"] and (red + yel) <= CFG["status_fast_total_max"]:
        return "review_fast"
    return "manual_fix_needed"


# ============================== 單張處理 ==============================
def save_png(arr, path, overwrite):
    if os.path.exists(path) and not overwrite:
        return False
    Image.fromarray(arr).save(path)
    return True


def process_one(src, dirs, do_hair, overwrite, quiet):
    fname = os.path.basename(src)
    stem = os.path.splitext(fname)[0]
    sprite, mask, warns = parse_meta(fname)
    im = Image.open(src)
    input_mode = im.mode
    rgba = np.asarray(im.convert("RGBA"))
    rgb = rgba[..., :3].copy()
    alpha_in = rgba[..., 3]
    h, w = rgb.shape[:2]
    has_valid_alpha_before = bool(alpha_in.min() < 255)

    # size 異常 warning（仍跑）
    exp = CFG["expected_dims"].get(sprite)
    if exp and (w, h) != exp:
        warns.append(f"尺寸 {w}x{h} 與 {sprite} 期望 {exp[0]}x{exp[1]} 不符")

    summary = {
        "source_file": src.replace("\\", "/"),
        "sprite_type": sprite,
        "mask_state": mask,
        "width": w, "height": h,
        "input_mode": input_mode,
        "has_valid_alpha_before": has_valid_alpha_before,
    }

    if has_valid_alpha_before:
        # 特例：已是有效 alpha → 不重切、不覆蓋。採用既有 alpha 當 candidate，照樣出 QC + hair review。
        warns.append("輸入已是有效 alpha：採用既有 alpha，不重切（review_only）")
        alpha = alpha_in
        white = near_white(rgb)
        bg1 = alpha == 0
        bg2 = np.zeros_like(bg1)
        stats = {"pass1_removed_ratio": round(float((alpha == 0).mean()), 4),
                 "pass2_removed_components": 0, "pass2_removed_pixels": 0, "pass2_detail": []}
    else:
        alpha, bg1, bg2, white, stats = compute_alpha(rgb)

    # alpha candidate（RGB 不變）
    out_alpha = os.path.join(dirs["alpha"], f"{stem}_alpha.png")
    wrote = save_png(np.dstack([rgb, alpha]).astype(np.uint8), out_alpha, overwrite)
    if not wrote:
        warns.append(f"既有輸出存在，未覆蓋：{os.path.basename(out_alpha)}")

    # QC
    qc = make_qc(rgb, alpha, bg1, bg2, white)
    for k, arr in qc.items():
        save_png(arr, os.path.join(dirs["qc"], f"{stem}_{k}.png"), overwrite)

    # hair review
    counts = {"red": 0, "yellow": 0, "cyan": 0}
    points = []
    if do_hair:
        overlay, rm, counts, points, hwarns = hair_review(rgb, alpha)
        warns += hwarns
        if overlay is not None:
            save_png(overlay, os.path.join(dirs["review"], f"{stem}_qc_hair_alpha_review.png"), overwrite)
        if rm is not None:
            save_png(rm, os.path.join(dirs["review"], f"{stem}_hair_redmask.png"), overwrite)

    status = classify(has_valid_alpha_before, counts, warns)

    summary.update({
        "output_file": out_alpha.replace("\\", "/"),
        "pass1_removed_ratio": stats["pass1_removed_ratio"],
        "pass2_removed_components": stats["pass2_removed_components"],
        "pass2_removed_pixels": stats["pass2_removed_pixels"],
        "hair_red_count": counts["red"],
        "hair_yellow_count": counts["yellow"],
        "hair_cyan_count": counts["cyan"],
        "recommended_status": status,
        "warnings": warns,
        "hair_points": points,
        "pass2_detail": stats["pass2_detail"],
    })
    # 每張 summary json
    with open(os.path.join(dirs["reports"], f"{stem}.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    if not quiet:
        print(f"  [{status:18s}] {sprite}/{mask:8s} p1={stats['pass1_removed_ratio']:.3f} "
              f"p2px={stats['pass2_removed_pixels']:6d} hair R/Y/C={counts['red']}/{counts['yellow']}/{counts['cyan']}  {fname}")
    return summary


# ============================== 輸入收集 ==============================
def collect_inputs(args):
    files = []
    if args.files:
        files += [p.strip() for p in args.files.split(",") if p.strip()]
    if args.filelist:
        with open(args.filelist, encoding="utf-8") as f:
            files += [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    if args.input:
        pat = args.glob or "*.png"
        files += sorted(globmod.glob(os.path.join(args.input, pat)))
    # 去重保序
    seen, uniq = set(), []
    for p in files:
        ap = os.path.abspath(p)
        if ap not in seen and os.path.isfile(p):
            seen.add(ap)
            uniq.append(p)
    return uniq


# ============================== 主程式 ==============================
def main():
    ap = argparse.ArgumentParser(description="批次白底去背 + QC + 頭髮 alpha review（非破壞）")
    ap.add_argument("--input", help="輸入資料夾（主模式：掃描）")
    ap.add_argument("--glob", help="搭配 --input 的檔名樣式，預設 *.png")
    ap.add_argument("--files", help="逗號分隔的檔案清單（選用）")
    ap.add_argument("--filelist", help="清單檔，每行一路徑（選用）")
    ap.add_argument("--output", required=True, help="輸出根目錄（會建 <output>/<batch_name>/）")
    ap.add_argument("--batch-name", default="batch", help="批次名（輸出子目錄）")
    ap.add_argument("--overwrite", action="store_true", help="允許覆蓋既有輸出（預設不覆蓋）")
    ap.add_argument("--no-hair", action="store_true", help="略過 hair review")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    inputs = collect_inputs(args)
    if not inputs:
        print("沒有找到輸入檔。請用 --input <dir> 或 --files / --filelist。", file=sys.stderr)
        sys.exit(2)

    root = os.path.join(args.output, args.batch_name)
    dirs = {k: os.path.join(root, k) for k in ("alpha", "qc", "review", "reports")}
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    print(f"批次：{args.batch_name}  輸入 {len(inputs)} 張  → {root}")
    rows = []
    for src in inputs:
        try:
            rows.append(process_one(src, dirs, not args.no_hair, args.overwrite, args.quiet))
        except Exception as e:
            print(f"  [ERROR] {os.path.basename(src)}: {e}", file=sys.stderr)
            rows.append({"source_file": src, "recommended_status": "error", "warnings": [f"BLOCK:例外 {e}"]})

    # 整批 CSV
    cols = ["source_file", "output_file", "sprite_type", "mask_state", "width", "height",
            "input_mode", "has_valid_alpha_before", "pass1_removed_ratio",
            "pass2_removed_components", "pass2_removed_pixels",
            "hair_red_count", "hair_yellow_count", "hair_cyan_count",
            "recommended_status", "warnings"]
    csv_path = os.path.join(dirs["reports"], "summary.csv")
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        wr = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        wr.writeheader()
        for r in rows:
            rr = dict(r)
            if isinstance(rr.get("warnings"), list):
                rr["warnings"] = " | ".join(rr["warnings"])
            wr.writerow(rr)

    # 總表 json
    agg = {
        "batch_name": args.batch_name,
        "input_count": len(inputs),
        "config": CFG,
        "by_status": {},
        "items": rows,
    }
    for r in rows:
        s = r.get("recommended_status", "error")
        agg["by_status"][s] = agg["by_status"].get(s, 0) + 1
    with open(os.path.join(dirs["reports"], "summary.json"), "w", encoding="utf-8") as f:
        json.dump(agg, f, ensure_ascii=False, indent=2)

    print(f"完成。分級統計：{agg['by_status']}")
    print(f"報表：{csv_path}")


if __name__ == "__main__":
    main()
