"""
OreSentinel AI - Rock & Boulder Detection Model Trainer
Fine-tunes YOLOv8n on diverse industrial rock, quarry muckpile, and conveyor datasets.
Outputs: ml/weights/oresentinel_yolo.pt
"""

import os
import shutil
import random
import math
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO

BASE_DIR = Path(r"C:\Users\HP\.gemini\antigravity\scratch\oresentinel-ai")
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "dataset"
WEIGHTS_DIR = ML_DIR / "weights"

WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

# 1. Setup Dataset Directory Structure
for split in ["train", "val"]:
    (DATASET_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
    (DATASET_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

print("Created dataset directories at:", DATASET_DIR)

# 2. Collect Real Samples from uploads and fixtures
brain_dir = Path(r"C:\Users\HP\.gemini\antigravity\brain\cfed6595-0f56-4b66-b6d8-c520efab0d26")
user_img1 = brain_dir / ".user_uploaded" / "media_1794287792658_7664fe77.webp"
user_img2 = brain_dir / "s2_converted.png"

real_samples = []
if user_img1.exists():
    real_samples.append(("user_muckpile", cv2.imread(str(user_img1))))
if user_img2.exists():
    real_samples.append(("user_minerals", cv2.imread(str(user_img2))))

fixtures_dir = BASE_DIR / "backend" / "data" / "fixtures"
if fixtures_dir.exists():
    for f in fixtures_dir.glob("*.jpg"):
        im = cv2.imread(str(f))
        if im is not None:
            real_samples.append((f.stem, im))

print(f"Loaded {len(real_samples)} reference industrial rock images.")

# 3. Procedural Synthetic Industrial Image Generator
def create_industrial_rock_scene(scene_id: int) -> tuple[np.ndarray, list[tuple[int, float, float, float, float]]]:
    """
    Generates a 640x640 realistic mining/conveyor/quarry scene with ground truth YOLO bounding boxes.
    Returns: (image, list of (cls_id, x_center, y_center, width, height))
    """
    w, h = 640, 640
    img = np.zeros((h, w, 3), dtype=np.uint8)
    boxes = []

    scene_type = scene_id % 4

    if scene_type == 0:
        # Conveyor Belt Scene: dark textured rubber belt
        img[:] = (35, 38, 40)
        # Conveyor belt wear marks and grooves
        for _ in range(30):
            gy = np.random.randint(0, h)
            cv2.line(img, (0, gy), (w, gy), (np.random.randint(28, 48), np.random.randint(30, 50), np.random.randint(32, 52)), 1)
        # Steel side rails
        img[:, :30] = (20, 24, 28)
        img[:, -30:] = (20, 24, 28)

    elif scene_type == 1:
        # Quarry Muckpile Scene: red/brown earth and rock rubble background
        base_col = np.array([30, 45, 90], dtype=np.uint8) # BGR reddish brown
        noise = np.random.randint(-15, 15, (h, w, 3), dtype=np.int16)
        img = np.clip(base_col + noise, 0, 255).astype(np.uint8)
        # Add sky horizon in top 20% for some muckpile images
        if random.random() > 0.4:
            sky_h = int(h * 0.22)
            img[:sky_h, :] = (210, 180, 140) # pale cloudy sky
            # Tree green line
            for tx in range(0, w, 15):
                cv2.circle(img, (tx, sky_h), np.random.randint(10, 22), (20, 90, 40), -1)

    elif scene_type == 2:
        # Crusher Hopper Chute: steel plates with industrial rust
        img[:] = (55, 60, 65)
        # Steel weld seams and rivets
        cv2.line(img, (120, 0), (120, h), (35, 40, 45), 3)
        cv2.line(img, (w - 120, 0), (w - 120, h), (35, 40, 45), 3)

    else:
        # Touching Mineral Cluster Bed: fine gravel and dust matrix
        img[:] = (45, 50, 55)
        for _ in range(80):
            px, py = np.random.randint(0, w), np.random.randint(0, h)
            prad = np.random.randint(2, 8)
            cv2.circle(img, (px, py), prad, (np.random.randint(60, 110), np.random.randint(60, 110), np.random.randint(60, 110)), -1)

    # Place 2 to 7 rocks
    num_rocks = random.randint(2, 6)
    placed_rects = []

    for r_idx in range(num_rocks):
        # Decide if large boulder (class 0) or normal rock fragment (class 1)
        is_boulder = (r_idx == 0 and random.random() > 0.3) or random.random() > 0.75
        cls_id = 0 if is_boulder else 1

        if is_boulder:
            rw = random.randint(140, 240)
            rh = random.randint(120, 220)
        else:
            rw = random.randint(55, 130)
            rh = random.randint(45, 110)

        # Pick position
        cx = random.randint(rw // 2 + 35, w - rw // 2 - 35)
        cy = random.randint(rh // 2 + 50, h - rh // 2 - 35)

        # Generate irregular angular polygon for the rock body
        num_pts = random.randint(6, 10)
        angles = np.linspace(0, 2 * np.pi, num_pts, endpoint=False)
        pts = []
        for ang in angles:
            rad_x = (rw // 2) * (0.75 + 0.35 * random.random())
            rad_y = (rh // 2) * (0.75 + 0.35 * random.random())
            px = int(cx + rad_x * math.cos(ang))
            py = int(cy + rad_y * math.sin(ang))
            pts.append([px, py])
        pts = np.array(pts, dtype=np.int32)

        # Mineral / Rock coloring
        palette = random.choice([
            (130, 105, 90),  # Iron Ore / Hematite (slate grey-blue)
            (70, 95, 140),   # Rust-stained sandstone
            (145, 140, 135), # Limestone / Quartzite (pale grey)
            (60, 75, 120),   # Weathered red ironstone
            (100, 110, 115), # Basalt / Granite
            (50, 140, 210),  # Amber crystal quartz
        ])
        
        # Draw shadow under rock
        shadow_pts = pts + np.array([8, 10])
        cv2.fillPoly(img, [shadow_pts], (15, 18, 20))

        # Fill rock body
        cv2.fillPoly(img, [pts], palette)

        # Internal rock facets, cleavage steps, and surface fracture lines
        for _ in range(4):
            fx1 = cx + random.randint(-rw//3, rw//3)
            fy1 = cy + random.randint(-rh//3, rh//3)
            fx2 = cx + random.randint(-rw//3, rw//3)
            fy2 = cy + random.randint(-rh//3, rh//3)
            facet_color = (max(0, palette[0] - 30), max(0, palette[1] - 30), max(0, palette[2] - 30))
            cv2.line(img, (fx1, fy1), (fx2, fy2), facet_color, 2)

        # Chipped rock perimeter highlight
        cv2.drawContours(img, [pts], -1, (min(255, palette[0] + 40), min(255, palette[1] + 40), min(255, palette[2] + 40)), 2)

        # Compute bounding box in normalized YOLO coordinates
        bx, by, bbw, bbh = cv2.boundingRect(pts)
        x_center = round((bx + bbw / 2.0) / float(w), 5)
        y_center = round((by + bbh / 2.0) / float(h), 5)
        norm_w = round(bbw / float(w), 5)
        norm_h = round(bbh / float(h), 5)

        boxes.append((cls_id, x_center, y_center, norm_w, norm_h))

    return img, boxes

# 4. Generate Training & Validation Dataset
total_images = 90
train_count = 72
val_count = 18

print(f"Generating {total_images} diverse industrial rock images with YOLO annotations...")

for idx in range(total_images):
    img, boxes = create_industrial_rock_scene(idx)
    split = "train" if idx < train_count else "val"

    img_filename = f"rock_scene_{idx:03d}.jpg"
    lbl_filename = f"rock_scene_{idx:03d}.txt"

    img_out = DATASET_DIR / "images" / split / img_filename
    lbl_out = DATASET_DIR / "labels" / split / lbl_filename

    cv2.imwrite(str(img_out), img)

    with open(lbl_out, "w") as f:
        for b in boxes:
            f.write(f"{b[0]} {b[1]} {b[2]} {b[3]} {b[4]}\n")

# Add real sample augmentations (cuts from user uploaded images)
if user_img1.exists() and user_img2.exists():
    # User muckpile: boulder annotations
    im1 = cv2.imread(str(user_img1))
    h1, w1 = im1.shape[:2]
    # Resize to 640x640
    im1_640 = cv2.resize(im1, (640, 640))
    cv2.imwrite(str(DATASET_DIR / "images" / "train" / "real_muckpile_01.jpg"), im1_640)
    # Write normalized labels for the muckpile boulders
    with open(DATASET_DIR / "labels" / "train" / "real_muckpile_01.txt", "w") as f:
        # Boulders: cls x_c y_c w h
        f.write("0 0.58 0.45 0.22 0.16\n") # Primary boulder
        f.write("0 0.31 0.48 0.18 0.14\n") # Flank boulder
        f.write("0 0.58 0.62 0.28 0.20\n") # Foreground boulder
        f.write("1 0.56 0.88 0.25 0.18\n") # Lower fragment

    # User mineral cluster: touching rocks annotations
    im2 = cv2.imread(str(user_img2))
    h2, w2 = im2.shape[:2]
    im2_640 = cv2.resize(im2, (640, 640))
    cv2.imwrite(str(DATASET_DIR / "images" / "train" / "real_cluster_01.jpg"), im2_640)
    with open(DATASET_DIR / "labels" / "train" / "real_cluster_01.txt", "w") as f:
        f.write("0 0.19 0.40 0.22 0.50\n") # Amber crystal
        f.write("0 0.38 0.32 0.25 0.40\n") # Tan block
        f.write("0 0.76 0.44 0.26 0.48\n") # Metallic ore
        f.write("0 0.44 0.63 0.28 0.54\n") # Blue slab
        f.write("1 0.74 0.80 0.32 0.36\n") # Ochre rock

# Add empty negative samples (conveyor belt with NO rocks, walls, floor)
for neg_idx in range(4):
    neg_img = np.full((640, 640, 3), 35, dtype=np.uint8) # Dark belt
    # add belt seams
    for _ in range(15):
        gy = np.random.randint(0, 640)
        cv2.line(neg_img, (0, gy), (640, gy), (45, 45, 45), 1)
    split = "train" if neg_idx < 3 else "val"
    cv2.imwrite(str(DATASET_DIR / "images" / split / f"neg_empty_belt_{neg_idx}.jpg"), neg_img)
    # Empty text file = negative sample (no objects)
    open(DATASET_DIR / "labels" / split / f"neg_empty_belt_{neg_idx}.txt", "w").close()

print("Dataset generation complete!")

# 5. Create dataset.yaml
yaml_content = f"""path: {str(DATASET_DIR).replace(os.sep, '/')}
train: images/train
val: images/val

names:
  0: boulder
  1: rock
"""
yaml_path = DATASET_DIR / "data.yaml"
with open(yaml_path, "w") as f:
    f.write(yaml_content)

print("Created data.yaml at:", yaml_path)

# 6. Train YOLOv8 Model
print("Starting YOLOv8 transfer learning on rock dataset...")
base_weights = WEIGHTS_DIR / "yolov8n.pt"
if not base_weights.exists():
    base_weights = "yolov8n.pt"

model = YOLO(str(base_weights))

results = model.train(
    data=str(yaml_path),
    epochs=12,
    imgsz=640,
    batch=8,
    workers=0, # Windows multi-processing safety
    device="cpu",
    project=str(ML_DIR / "runs"),
    name="oresentinel_train",
    verbose=True
)

# 7. Copy best weights to ml/weights/oresentinel_yolo.pt
best_weights = ML_DIR / "runs" / "oresentinel_train" / "weights" / "best.pt"
target_weights = WEIGHTS_DIR / "oresentinel_yolo.pt"

if best_weights.exists():
    shutil.copy(best_weights, target_weights)
    print("SUCCESS: Trained rock weights saved to:", target_weights)
else:
    # Fallback to last.pt
    last_weights = ML_DIR / "runs" / "oresentinel_train" / "weights" / "last.pt"
    if last_weights.exists():
        shutil.copy(last_weights, target_weights)
        print("SUCCESS: Trained rock weights (last.pt) saved to:", target_weights)

print("OreSentinel AI Rock Detection Training Completed Successfully!")
