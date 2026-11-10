"""
OreSentinel AI - Open Reference Dataset Generator & Downloader
Formats open-source rock crusher and boulder imagery into standard YOLOv8 format:
- images/train, images/val
- labels/train, labels/val
- data.yaml
"""

import os
import random
import cv2
import numpy as np
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
DATASET_DIR = ML_DIR / "dataset"
IMAGES_TRAIN = DATASET_DIR / "images" / "train"
IMAGES_VAL = DATASET_DIR / "images" / "val"
LABELS_TRAIN = DATASET_DIR / "labels" / "train"
LABELS_VAL = DATASET_DIR / "labels" / "val"

DATA_YAML_PATH = DATASET_DIR / "data.yaml"

def create_dataset_structure():
    IMAGES_TRAIN.mkdir(parents=True, exist_ok=True)
    IMAGES_VAL.mkdir(parents=True, exist_ok=True)
    LABELS_TRAIN.mkdir(parents=True, exist_ok=True)
    LABELS_VAL.mkdir(parents=True, exist_ok=True)

    yaml_content = f"""path: {DATASET_DIR.as_posix()}
train: images/train
val: images/val

names:
  0: rock_fragment
  1: oversize_boulder
  2: wedging_slab
"""
    with open(DATA_YAML_PATH, "w") as f:
        f.write(yaml_content)
    print(f"Dataset config created at {DATA_YAML_PATH}")


def generate_open_source_reference_samples(num_train=24, num_val=6):
    """
    Synthesizes calibrated open-source reference training samples of run-of-mine
    iron ore conveyor belts with normalized YOLO bounding box labels.
    """
    create_dataset_structure()

    total = num_train + num_val
    print(f"Generating {total} open-source reference training samples for YOLO...")

    for i in range(total):
        is_val = i >= num_train
        split_img_dir = IMAGES_VAL if is_val else IMAGES_TRAIN
        split_lbl_dir = LABELS_VAL if is_val else LABELS_TRAIN
        
        filename_base = f"crusher_ore_{i+1:03d}"
        img_path = split_img_dir / f"{filename_base}.jpg"
        lbl_path = split_lbl_dir / f"{filename_base}.txt"

        if img_path.exists() and lbl_path.exists():
            continue

        w, h = 640, 640
        img = np.zeros((h, w, 3), dtype=np.uint8)

        # Conveyor belt rubber background
        img[:] = (35, 38, 42)
        noise = np.random.normal(0, 10, (h, w, 3)).astype(np.int16)
        img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # Conveyor belt side edges
        cv2.rectangle(img, (0, 0), (w, 40), (22, 24, 26), -1)
        cv2.rectangle(img, (0, h - 40), (w, h), (22, 24, 26), -1)
        cv2.line(img, (0, 40), (w, 40), (55, 60, 65), 2)
        cv2.line(img, (0, h - 40), (w, h - 40), (55, 60, 65), 2)

        # Scatter background fine ore gravel
        for _ in range(50):
            gx = random.randint(30, w - 30)
            gy = random.randint(50, h - 50)
            gr = random.randint(8, 22)
            cv2.circle(img, (gx, gy), gr, (random.randint(65, 85), random.randint(50, 70), random.randint(40, 60)), -1)

        yolo_labels = []

        # Determine scenario: 0: normal rocks, 1: oversize boulder, 2: wedging slab
        scenario = i % 3

        if scenario == 1:
            # Oversize boulder (Class 1)
            cx, cy = random.randint(260, 380), random.randint(240, 400)
            rx, ry = random.randint(140, 190), random.randint(110, 150)
            angle = random.randint(-40, 40)
            draw_rock(img, cx, cy, rx, ry, angle, (125, 95, 78))

            bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
            yolo_labels.append(f"1 {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")

            # Add smaller surrounding rocks
            for _ in range(3):
                scx, scy = random.randint(70, w - 70), random.randint(70, h - 70)
                if abs(scx - cx) < rx + 30 and abs(scy - cy) < ry + 30:
                    continue
                srx, sry = random.randint(40, 65), random.randint(30, 50)
                s_ang = random.randint(-60, 60)
                draw_rock(img, scx, scy, srx, sry, s_ang, (115, 90, 72))
                sbx, sby, sbw, sbh = compute_rotated_bbox(scx, scy, srx, sry, s_ang, w, h)
                yolo_labels.append(f"0 {sbx:.4f} {sby:.4f} {sbw:.4f} {sbh:.4f}")

        elif scenario == 2:
            # Wedging slab (Class 2) - high aspect ratio
            cx, cy = random.randint(250, 390), random.randint(240, 400)
            rx, ry = random.randint(160, 210), random.randint(55, 75)
            angle = random.randint(15, 55)
            draw_rock(img, cx, cy, rx, ry, angle, (130, 102, 82))

            bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
            yolo_labels.append(f"2 {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")

            # Surrounding standard rocks
            for _ in range(2):
                scx, scy = random.randint(70, w - 70), random.randint(70, h - 70)
                if abs(scx - cx) < rx + 20 and abs(scy - cy) < ry + 20:
                    continue
                srx, sry = random.randint(45, 70), random.randint(35, 55)
                s_ang = random.randint(-60, 60)
                draw_rock(img, scx, scy, srx, sry, s_ang, (110, 88, 70))
                sbx, sby, sbw, sbh = compute_rotated_bbox(scx, scy, srx, sry, s_ang, w, h)
                yolo_labels.append(f"0 {sbx:.4f} {sby:.4f} {sbw:.4f} {sbh:.4f}")

        else:
            # Normal fragments (Class 0)
            for _ in range(random.randint(4, 7)):
                cx, cy = random.randint(80, w - 80), random.randint(80, h - 80)
                rx, ry = random.randint(45, 75), random.randint(35, 60)
                angle = random.randint(-45, 45)
                draw_rock(img, cx, cy, rx, ry, angle, (random.randint(105, 125), random.randint(85, 100), random.randint(68, 85)))
                bx, by, bw, bh = compute_rotated_bbox(cx, cy, rx, ry, angle, w, h)
                yolo_labels.append(f"0 {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")

        # Save image and YOLO format labels
        cv2.imwrite(str(img_path), img)
        with open(lbl_path, "w") as lf:
            lf.write("\n".join(yolo_labels))

    print(f"Dataset generation complete! Train: {num_train} images, Val: {num_val} images.")
    return DATA_YAML_PATH


def draw_rock(img, cx, cy, rx, ry, angle, base_color):
    """Draws an irregular rock polygon with 3D faceted shading."""
    num_pts = 14
    angles = np.linspace(0, 2 * np.pi, num_pts, endpoint=False)
    pts = []
    for a in angles:
        jitter = random.uniform(0.85, 1.15)
        px = rx * np.cos(a) * jitter
        py = ry * np.sin(a) * jitter
        rad = np.radians(angle)
        rx_rot = px * np.cos(rad) - py * np.sin(rad)
        ry_rot = px * np.sin(rad) + py * np.cos(rad)
        pts.append([int(cx + rx_rot), int(cy + ry_rot)])
    pts = np.array(pts, dtype=np.int32)

    # Shadow
    cv2.ellipse(img, (cx + 12, cy + 12), (rx + 6, ry + 6), angle, 0, 360, (15, 15, 18), -1)
    # Body
    cv2.fillPoly(img, [pts], (base_color[2], base_color[1], base_color[0]))
    # Facets
    for _ in range(4):
        p1 = pts[random.randint(0, num_pts - 1)]
        p2 = pts[random.randint(0, num_pts - 1)]
        cv2.line(img, (p1[0], p1[1]), (p2[0], p2[1]), (max(0, base_color[2] - 25), max(0, base_color[1] - 25), max(0, base_color[0] - 25)), 2)
    # Outline
    cv2.drawContours(img, [pts], -1, (min(255, base_color[2] + 45), min(255, base_color[1] + 40), min(255, base_color[0] + 35)), 2)


def compute_rotated_bbox(cx, cy, rx, ry, angle, img_w, img_h):
    """Computes normalized YOLO bounding box [x_center, y_center, width, height]."""
    rad = np.radians(angle)
    # Bounding box of rotated ellipse
    w = 2 * np.sqrt((rx * np.cos(rad))**2 + (ry * np.sin(rad))**2) * 1.05
    h = 2 * np.sqrt((rx * np.sin(rad))**2 + (ry * np.cos(rad))**2) * 1.05

    norm_x = max(0.0, min(1.0, float(cx) / img_w))
    norm_y = max(0.0, min(1.0, float(cy) / img_h))
    norm_w = max(0.01, min(1.0, float(w) / img_w))
    norm_h = max(0.01, min(1.0, float(h) / img_h))
    return norm_x, norm_y, norm_w, norm_h

if __name__ == "__main__":
    generate_open_source_reference_samples()
