#!/usr/bin/env python3
"""
OreSentinel AI - Enhanced Synthetic Dataset Generator v2
Domain-randomized synthetic data for rock crusher detection.
Adds: real textures, dust, lighting variation, camera artifacts, occlusions.
"""

import os
import random
import cv2
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, List
import json

ML_DIR = Path(__file__).resolve().parent
DATASET_DIR = ML_DIR / "dataset_v2"
IMAGES_TRAIN = DATASET_DIR / "images" / "train"
IMAGES_VAL = DATASET_DIR / "images" / "val"
IMAGES_TEST = DATASET_DIR / "images" / "test"
LABELS_TRAIN = DATASET_DIR / "labels" / "train"
LABELS_VAL = DATASET_DIR / "labels" / "val"
LABELS_TEST = DATASET_DIR / "labels" / "test"

DATA_YAML_PATH = DATASET_DIR / "data.yaml"

# Target classes (6-class for production)
TARGET_CLASSES = [
    "rock_fragment",      # 0
    "oversize_boulder",   # 1
    "wedging_slab",       # 2
    "conveyor_belt",      # 3 - background class
    "personnel",          # 4 - safety
    "debris"              # 5 - non-ore
]

# Realistic conveyor belt textures (procedural but convincing)
BELT_TEXTURES = [
    {"base": (35, 38, 42), "noise": 12, "grain": 0.8},   # Standard rubber
    {"base": (40, 42, 45), "noise": 15, "grain": 1.0},   # Worn belt
    {"base": (30, 32, 35), "noise": 10, "grain": 0.6},   # New belt
    {"base": (45, 48, 50), "noise": 18, "grain": 1.2},   # Dirty belt
]

# Rock color palettes (hematite/magnetite/goethite variations)
ROCK_PALETTES = {
    "hematite": [(120, 95, 80), (130, 100, 85), (115, 90, 75), (125, 98, 82)],
    "magnetite": [(55, 58, 62), (60, 63, 68), (50, 53, 57), (65, 68, 72)],
    "goethite": [(140, 105, 70), (150, 115, 75), (135, 100, 65), (145, 110, 72)],
    "mixed": [(100, 80, 65), (110, 88, 72), (95, 75, 60), (115, 92, 78)],
}

# Dust/fog overlays
DUST_LAYERS = [
    {"density": 0.15, "color": (180, 175, 170), "blur": 15},
    {"density": 0.08, "color": (200, 195, 190), "blur": 25},
    {"density": 0.03, "color": (220, 215, 210), "blur": 40},
]


def create_dataset_structure():
    for d in [IMAGES_TRAIN, IMAGES_VAL, IMAGES_TEST, LABELS_TRAIN, LABELS_VAL, LABELS_TEST]:
        d.mkdir(parents=True, exist_ok=True)

    yaml_content = f"""path: {DATASET_DIR.as_posix()}
train: images/train
val: images/val
test: images/test

names:
  0: rock_fragment
  1: oversize_boulder
  2: wedging_slab
  3: conveyor_belt
  4: personnel
  5: debris
"""
    with open(DATA_YAML_PATH, "w") as f:
        f.write(yaml_content)
    print(f"Dataset config created at {DATA_YAML_PATH}")


def generate_belt_background(w: int, h: int, texture_idx: int = None) -> np.ndarray:
    """Generate realistic conveyor belt background with texture."""
    if texture_idx is None:
        texture_idx = random.randint(0, len(BELT_TEXTURES) - 1)

    tex = BELT_TEXTURES[texture_idx]
    base_color = np.array(tex["base"], dtype=np.uint8)
    noise_level = tex["noise"]
    grain = tex["grain"]

    # Base
    img = np.full((h, w, 3), base_color, dtype=np.uint8)

    # Multi-scale noise for rubber texture
    noise1 = np.random.normal(0, noise_level * grain, (h, w, 3)).astype(np.int16)
    noise2 = np.random.normal(0, noise_level * 0.5, (h//4, w//4, 3)).astype(np.int16)
    noise2 = cv2.resize(noise2.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC).astype(np.int16)

    img = np.clip(img.astype(np.int16) + noise1 + noise2, 0, 255).astype(np.uint8)

    # Belt edges (steel skirts)
    skirt_h = max(30, h // 20)
    cv2.rectangle(img, (0, 0), (w, skirt_h), (20, 22, 24), -1)
    cv2.rectangle(img, (0, h - skirt_h), (w, h), (20, 22, 24), -1)
    cv2.line(img, (0, skirt_h), (w, skirt_h), (55, 60, 65), 2)
    cv2.line(img, (0, h - skirt_h), (w, h - skirt_h), (55, 60, 65), 2)

    # Belt texture lines (longitudinal grooves)
    for y in range(skirt_h + 10, h - skirt_h - 10, random.randint(8, 15)):
        line_color = (int(base_color[0]) - 5, int(base_color[1]) - 5, int(base_color[2]) - 5)
        cv2.line(img, (0, y), (w, y), line_color, 1)

    return img


def add_fine_ore_bed(img: np.ndarray, density: float = 1.0):
    """Scatter fine ore particles on belt."""
    h, w = img.shape[:2]
    n_particles = int(80 * density * (w * h) / (640 * 640))

    for _ in range(n_particles):
        gx = random.randint(30, w - 30)
        gy = random.randint(50, h - 50)
        gr = random.randint(3, 12)
        # Fine ore color (darker than belt)
        color = (random.randint(45, 75), random.randint(40, 65), random.randint(35, 55))
        cv2.circle(img, (gx, gy), gr, color, -1)
        # Tiny highlight
        cv2.circle(img, (gx - gr//3, gy - gr//3), max(1, gr//3),
                   (min(255, color[0]+30), min(255, color[1]+25), min(255, color[2]+20)), -1)


def draw_realistic_rock(img: np.ndarray, cx: int, cy: int, rx: int, ry: int,
                         angle: int, palette: str = "hematite", rock_id: int = 0) -> np.ndarray:
    """Draw rock with realistic texture, facets, and 3D shading."""
    h, w = img.shape[:2]
    colors = ROCK_PALETTES.get(palette, ROCK_PALETTES["hematite"])
    base_col = colors[rock_id % len(colors)]

    # Generate irregular polygon (16-24 vertices)
    num_pts = random.randint(16, 24)
    angles = np.linspace(0, 2 * np.pi, num_pts, endpoint=False)
    pts = []

    for a in angles:
        # Per-vertex jitter for irregularity
        jitter = random.uniform(0.75, 1.25)
        # Ellipse base
        px = rx * np.cos(a) * jitter
        py = ry * np.sin(a) * jitter

        # Add mid-edge perturbation
        if random.random() < 0.3:
            px *= random.uniform(0.85, 1.15)
            py *= random.uniform(0.85, 1.15)

        rad = np.radians(angle)
        rx_rot = px * np.cos(rad) - py * np.sin(rad)
        ry_rot = px * np.sin(rad) + py * np.cos(rad)
        pts.append([int(cx + rx_rot), int(cy + ry_rot)])

    pts = np.array(pts, dtype=np.int32)

    # Clip to image bounds
    pts[:, 0] = np.clip(pts[:, 0], 0, w - 1)
    pts[:, 1] = np.clip(pts[:, 1], 0, h - 1)

    # Shadow (offset, blurred)
    shadow_offset = max(8, int((rx + ry) / 30))
    shadow_pts = pts + np.array([shadow_offset, shadow_offset])
    cv2.fillPoly(img, [shadow_pts], (12, 12, 14))

    # Rock body with base color
    cv2.fillPoly(img, [pts], (base_col[2], base_col[1], base_col[0]))

    # Surface facets (internal cracks/planes)
    n_facets = random.randint(3, 8)
    for _ in range(n_facets):
        p1 = pts[random.randint(0, num_pts - 1)]
        p2 = pts[random.randint(0, num_pts - 1)]
        facet_col = (max(0, base_col[2] - 35), max(0, base_col[1] - 35), max(0, base_col[0] - 35))
        cv2.line(img, (p1[0], p1[1]), (p2[0], p2[1]), facet_col, random.randint(1, 3))

    # Highlight edges (catch light)
    highlight_col = (min(255, base_col[2] + 50), min(255, base_col[1] + 45), min(255, base_col[0] + 40))
    cv2.drawContours(img, [pts], -1, highlight_col, 1)

    # Specular highlights (wet ore spots)
    if random.random() < 0.3:
        for _ in range(random.randint(1, 3)):
            hx = cx + random.randint(-rx//2, rx//2)
            hy = cy + random.randint(-ry//2, ry//2)
            if 0 <= hx < w and 0 <= hy < h:
                cv2.circle(img, (hx, hy), random.randint(2, 6), (220, 220, 220), -1)

    return pts


def apply_dust_overlay(img: np.ndarray, severity: float = 1.0) -> np.ndarray:
    """Add dust/fog atmospheric effect."""
    h, w = img.shape[:2]
    dust = DUST_LAYERS[int(severity * 2) % len(DUST_LAYERS)]

    # Generate dust texture
    dust_img = np.full((h, w, 3), dust["color"], dtype=np.uint8)
    noise = np.random.normal(0, 25 * dust["density"] * severity, (h, w, 3)).astype(np.int16)
    dust_img = np.clip(dust_img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # Blur for atmospheric look
    dust_img = cv2.GaussianBlur(dust_img, (dust["blur"] | 1, dust["blur"] | 1), 0)

    # Alpha blend (more dust in upper portion - conveyor dust rises)
    alpha_mask = np.linspace(dust["density"] * severity * 0.8, dust["density"] * severity * 0.3, h).reshape(-1, 1, 1)
    alpha_mask = np.repeat(alpha_mask, w, axis=1)

    result = cv2.addWeighted(img, 1.0, dust_img, 1.0, 0, dtype=cv2.CV_8U)
    # Actually blend properly
    result = (img.astype(np.float32) * (1 - alpha_mask) + dust_img.astype(np.float32) * alpha_mask).astype(np.uint8)

    return result


def apply_lighting_variation(img: np.ndarray, scenario: str = "normal") -> np.ndarray:
    """Apply realistic lighting: directional, glare, shadows, underexposure."""
    h, w = img.shape[:2]
    img_f = img.astype(np.float32)

    if scenario == "bright_sun":
        # Strong directional light from top-right
        gradient = np.linspace(1.3, 0.8, w).reshape(1, -1, 1)
        img_f *= gradient
        # Glare spot
        cv2.ellipse(img_f, (w - 50, 50), (100, 80), 0, 0, 360, (1.5, 1.5, 1.5), -1)

    elif scenario == "low_light":
        # Underexposed
        img_f *= random.uniform(0.4, 0.7)
        # Add sensor noise
        noise = np.random.normal(0, 15, img_f.shape).astype(np.float32)
        img_f = np.clip(img_f + noise, 0, 255)

    elif scenario == "glare":
        # Specular reflection on wet rocks
        glare_x = random.randint(w//3, 2*w//3)
        glare_y = random.randint(h//3, 2*h//3)
        cv2.ellipse(img_f, (glare_x, glare_y), (80, 60), random.randint(0, 180), 0, 360,
                    (2.0, 2.0, 2.0), -1)

    elif scenario == "night_ir":
        # IR/night vision look - green tint, high contrast
        img_f = cv2.cvtColor(img_f.astype(np.uint8), cv2.COLOR_BGR2GRAY)
        img_f = cv2.cvtColor(img_f, cv2.COLOR_GRAY2BGR)
        img_f[:, :, 1] *= 1.5  # Green channel boost
        img_f = np.clip(img_f, 0, 255)

    elif scenario == "wet_ore":
        # Wet look - higher specularity, darker base
        img_f *= 0.85
        # Add random bright streaks (water reflection)
        for _ in range(random.randint(5, 15)):
            x1 = random.randint(0, w)
            y1 = random.randint(0, h)
            x2 = x1 + random.randint(-30, 30)
            y2 = y1 + random.randint(-10, 10)
            cv2.line(img_f, (x1, y1), (x2, y2), (1.8, 1.8, 1.8), 1)

    return np.clip(img_f, 0, 255).astype(np.uint8)


def apply_camera_artifacts(img: np.ndarray, severity: float = 1.0) -> np.ndarray:
    """Add camera artifacts: motion blur, lens vignette, sensor noise, compression."""
    h, w = img.shape[:2]

    # Vignette
    if random.random() < 0.7 * severity:
        center_x, center_y = w // 2, h // 2
        max_dist = np.sqrt(center_x**2 + center_y**2)
        y, x = np.ogrid[:h, :w]
        dist = np.sqrt((x - center_x)**2 + (y - center_y)**2)
        vignette = 1 - 0.3 * severity * (dist / max_dist)**2
        vignette = np.clip(vignette, 0.5, 1.0).reshape(h, w, 1)
        img = (img.astype(np.float32) * vignette).astype(np.uint8)

    # Motion blur (horizontal - belt movement)
    if random.random() < 0.3 * severity:
        kernel_size = random.randint(3, 9)
        kernel = np.zeros((kernel_size, kernel_size))
        kernel[kernel_size // 2, :] = 1.0 / kernel_size
        img = cv2.filter2D(img, -1, kernel)

    # Sensor noise (ISO grain)
    if random.random() < 0.5 * severity:
        noise = np.random.normal(0, 5 * severity, img.shape).astype(np.int16)
        img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # JPEG compression artifacts (blocking)
    if random.random() < 0.2 * severity:
        # Simulate by down/up scaling
        small = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_LINEAR)
        img = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)

    return img


def add_occlusions(img: np.ndarray, bboxes: List, severity: float = 1.0) -> Tuple[np.ndarray, List]:
    """Add partial occlusions (overlapping rocks, idlers, structure). Returns updated bboxes."""
    h, w = img.shape[:2]
    updated_bboxes = bboxes.copy()

    # Rock-on-rock overlap (most common)
    if len(bboxes) >= 2 and random.random() < 0.4 * severity:
        # Pick two rocks, make one partially cover another
        i, j = random.sample(range(len(bboxes)), 2)
        # This is complex - skip for now, handled by placement logic

    # Conveyor structure (idlers, stringers)
    if random.random() < 0.3 * severity:
        # Draw idler roller shadows across top
        n_idlers = random.randint(1, 3)
        for _ in range(n_idlers):
            y = random.randint(10, h // 5)
            cv2.line(img, (0, y), (w, y), (15, 15, 18), random.randint(2, 5))

    # Spillage / buildup on skirt
    if random.random() < 0.2 * severity:
        side = random.choice(["left", "right"])
        if side == "left":
            cv2.ellipse(img, (10, h//2), (30, h//3), 0, 0, 360, (30, 28, 25), -1)
        else:
            cv2.ellipse(img, (w - 10, h//2), (30, h//3), 0, 0, 360, (30, 28, 25), -1)

    return img, updated_bboxes


def compute_rotated_bbox(cx: int, cy: int, rx: int, ry: int, angle: int, img_w: int, img_h: int):
    """Computes normalized YOLO bounding box [x_center, y_center, width, height]."""
    rad = np.radians(angle)
    w_box = 2 * np.sqrt((rx * np.cos(rad))**2 + (ry * np.sin(rad))**2) * 1.08
    h_box = 2 * np.sqrt((rx * np.sin(rad))**2 + (ry * np.cos(rad))**2) * 1.08

    norm_x = max(0.0, min(1.0, float(cx) / img_w))
    norm_y = max(0.0, min(1.0, float(cy) / img_h))
    norm_w = max(0.01, min(1.0, float(w_box) / img_w))
    norm_h = max(0.01, min(1.0, float(h_box) / img_h))
    return norm_x, norm_y, norm_w, norm_h


def generate_enhanced_samples(
    num_train: int = 2000,
    num_val: int = 400,
    num_test: int = 200,
    img_size: Tuple[int, int] = (640, 640)
):
    """
    Generate domain-randomized synthetic dataset.
    """
    create_dataset_structure()

    w, h = img_size
    total = num_train + num_val + num_test
    print(f"Generating {total} enhanced synthetic samples ({num_train} train, {num_val} val, {num_test} test)...")

    # Lighting scenarios distribution
    lighting_scenarios = ["normal"] * 50 + ["bright_sun"] * 15 + ["low_light"] * 15 + ["glare"] * 10 + ["wet_ore"] * 10

    for i in range(total):
        if i < num_train:
            split_img_dir = IMAGES_TRAIN
            split_lbl_dir = LABELS_TRAIN
        elif i < num_train + num_val:
            split_img_dir = IMAGES_VAL
            split_lbl_dir = LABELS_VAL
        else:
            split_img_dir = IMAGES_TEST
            split_lbl_dir = LABELS_TEST

        filename_base = f"crusher_ore_v2_{i+1:06d}"
        img_path = split_img_dir / f"{filename_base}.jpg"
        lbl_path = split_lbl_dir / f"{filename_base}.txt"

        if img_path.exists() and lbl_path.exists():
            continue

        # 1. Generate belt background
        tex_idx = random.randint(0, len(BELT_TEXTURES) - 1)
        img = generate_belt_background(w, h, tex_idx)

        # 2. Add fine ore bed
        add_fine_ore_bed(img, density=random.uniform(0.5, 1.5))

        # 3. Determine scenario
        scenario_type = random.choices(
            ["normal", "oversize", "wedging", "cluster", "empty"],
            weights=[0.45, 0.15, 0.15, 0.15, 0.10]
        )[0]

        yolo_labels = []
        rock_bboxes = []  # For occlusion logic

        if scenario_type == "oversize":
            # Single large boulder
            cx, cy = random.randint(200, 440), random.randint(150, 490)
            rx, ry = random.randint(150, 220), random.randint(100, 160)
            angle = random.randint(-50, 50)
            palette = random.choice(list(ROCK_PALETTES.keys()))
            pts = draw_realistic_rock(img, cx, cy, rx, ry, angle, palette, 0)
            bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
            yolo_labels.append(f"1 {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")
            rock_bboxes.append((cx, cy, rx, ry))

            # Surrounding smaller rocks
            for _ in range(random.randint(2, 5)):
                scx, scy = random.randint(60, w-60), random.randint(60, h-60)
                if abs(scx - cx) < rx + 40 and abs(scy - cy) < ry + 40:
                    continue
                srx, sry = random.randint(30, 70), random.randint(25, 55)
                s_ang = random.randint(-60, 60)
                draw_realistic_rock(img, scx, scy, srx, sry, s_ang, palette, random.randint(1,3))
                sbx, sby, sbw, sbh = compute_rotated_bbox(scx, scy, srx, sry, s_ang, w, h)
                yolo_labels.append(f"0 {sbx:.4f} {sby:.4f} {sbw:.4f} {sbh:.4f}")

        elif scenario_type == "wedging":
            # High aspect ratio slab
            cx, cy = random.randint(200, 440), random.randint(150, 490)
            rx, ry = random.randint(160, 240), random.randint(40, 70)
            angle = random.randint(20, 70)
            palette = random.choice(list(ROCK_PALETTES.keys()))
            pts = draw_realistic_rock(img, cx, cy, rx, ry, angle, palette, 0)
            bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
            yolo_labels.append(f"2 {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")
            rock_bboxes.append((cx, cy, rx, ry))

            for _ in range(random.randint(1, 3)):
                scx, scy = random.randint(60, w-60), random.randint(60, h-60)
                if abs(scx - cx) < rx + 30 and abs(scy - cy) < ry + 30:
                    continue
                srx, sry = random.randint(35, 75), random.randint(25, 50)
                s_ang = random.randint(-60, 60)
                draw_realistic_rock(img, scx, scy, srx, sry, s_ang, palette, random.randint(1,3))
                sbx, sby, sbw, sbh = compute_rotated_bbox(scx, scy, srx, sry, s_ang, w, h)
                yolo_labels.append(f"0 {sbx:.4f} {sby:.4f} {sbw:.4f} {sbh:.4f}")

        elif scenario_type == "cluster":
            # Multiple near-limit rocks (choke hazard)
            n_rocks = random.randint(3, 6)
            centers = []
            for _ in range(n_rocks):
                attempts = 0
                while attempts < 20:
                    cx = random.randint(150, w-150)
                    cy = random.randint(100, h-100)
                    if all(np.sqrt((cx-c[0])**2 + (cy-c[1])**2) > 180 for c in centers):
                        centers.append((cx, cy))
                        break
                    attempts += 1

            for idx, (cx, cy) in enumerate(centers):
                rx = random.randint(90, 160)
                ry = random.randint(70, 130)
                angle = random.randint(-60, 60)
                palette = random.choice(list(ROCK_PALETTES.keys()))
                cls = 1 if max(rx, ry) * 2 > 180 else 0  # oversize if major axis > 180px (~900mm)
                draw_realistic_rock(img, cx, cy, rx, ry, angle, palette, idx)
                bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
                yolo_labels.append(f"{cls} {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")

        elif scenario_type == "empty":
            # Empty belt (background class)
            yolo_labels.append(f"3 0.5 0.5 0.9 0.8")  # Full belt as conveyor_belt

        else:  # normal
            n_rocks = random.randint(3, 8)
            for idx in range(n_rocks):
                cx = random.randint(80, w-80)
                cy = random.randint(80, h-80)
                rx = random.randint(35, 85)
                ry = random.randint(25, 65)
                angle = random.randint(-50, 50)
                palette = random.choice(list(ROCK_PALETTES.keys()))
                draw_realistic_rock(img, cx, cy, rx, ry, angle, palette, idx)
                bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
                yolo_labels.append(f"0 {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")

        # 4. Apply domain randomization
        lighting = random.choice(lighting_scenarios)
        img = apply_lighting_variation(img, lighting)

        dust_severity = random.uniform(0, 1.5)
        img = apply_dust_overlay(img, dust_severity)

        cam_severity = random.uniform(0, 1.2)
        img = apply_camera_artifacts(img, cam_severity)

        # 5. Add timestamp/watermark (industrial camera style)
        cv2.putText(img, f"TATA STEEL CRUSHER CCTV - CAM-{random.randint(1,3):02d}",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 170, 170), 1)
        cv2.putText(img, f"REC [{random.randint(1,30):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}]",
                    (w - 180, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 200), 1)

        # 6. Save
        cv2.imwrite(str(img_path), img)
        with open(lbl_path, "w") as lf:
            lf.write("\n".join(yolo_labels))

        if (i + 1) % 500 == 0:
            print(f"  Generated {i+1}/{total}...")

    print(f"\n[OK] Enhanced dataset generation complete!")
    print(f"  Train: {num_train} images")
    print(f"  Val:   {num_val} images")
    print(f"  Test:  {num_test} images")
    print(f"  Location: {DATASET_DIR}")
    return DATA_YAML_PATH


def merge_with_existing(real_dataset_path: Path, output_path: Path = None):
    """Merge enhanced synthetic with real labeled data."""
    if output_path is None:
        output_path = ML_DIR / "dataset_merged"

    # This would combine the two datasets - implement based on needs
    pass


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate enhanced synthetic OreSentinel dataset")
    parser.add_argument("--train", type=int, default=2000, help="Training samples")
    parser.add_argument("--val", type=int, default=400, help="Validation samples")
    parser.add_argument("--test", type=int, default=200, help="Test samples")
    parser.add_argument("--size", type=int, nargs=2, default=[640, 640], help="Image size W H")
    args = parser.parse_args()

    generate_enhanced_samples(
        num_train=args.train,
        num_val=args.val,
        num_test=args.test,
        img_size=tuple(args.size)
    )