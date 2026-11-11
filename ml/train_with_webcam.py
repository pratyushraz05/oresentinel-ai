"""
OreSentinel AI - Train with Webcam Collected Data
Combines synthetic data + user-collected webcam data for improved model training
"""

import os
import shutil
import random
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO

BASE_DIR = Path(r"C:\Users\HP\.gemini\antigravity\scratch\oresentinel-ai")
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "dataset"
WEIGHTS_DIR = ML_DIR / "weights"

# Directories
WEBCAM_IMG_DIR = DATASET_DIR / "webcam_captures"
WEBCAM_LABEL_DIR = DATASET_DIR / "annotations"
TRAIN_IMG_DIR = DATASET_DIR / "images" / "train"
VAL_IMG_DIR = DATASET_DIR / "images" / "val"
TRAIN_LABEL_DIR = DATASET_DIR / "labels" / "train"
VAL_LABEL_DIR = DATASET_DIR / "labels" / "val"

def setup_directories():
    """Ensure all directories exist."""
    for d in [TRAIN_IMG_DIR, VAL_IMG_DIR, TRAIN_LABEL_DIR, VAL_LABEL_DIR]:
        d.mkdir(parents=True, exist_ok=True)
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    print("Directories ready.\n")

def copy_webcam_data(target_dir: Path, label_dir: Path, max_samples: int = 50):
    """Copy webcam captured images to train/val splits."""
    if not WEBCAM_IMG_DIR.exists():
        print("No webcam data directory found.")
        return 0
    
    # Get all webcam images
    webcam_images = list(WEBCAM_IMG_DIR.glob("*.jpg")) + list(WEBCAM_IMG_DIR.glob("*.png"))
    
    if not webcam_images:
        print("No webcam images found in", WEBCAM_IMG_DIR)
        return 0
    
    # Limit samples
    if len(webcam_images) > max_samples:
        random.seed(42)
        webcam_images = random.sample(webcam_images, max_samples)
    
    print(f"Found {len(webcam_images)} webcam images to add to dataset")
    
    # Split: 80% train, 20% val
    split_idx = int(len(webcam_images) * 0.8)
    train_images = webcam_images[:split_idx]
    val_images = webcam_images[split_idx:]
    
    copied = 0
    for img_path in train_images:
        # Copy image
        shutil.copy(img_path, target_dir / img_path.name)
        
        # Copy annotation
        label_name = img_path.stem + ".txt"
        label_src = WEBCAM_LABEL_DIR / label_name
        if label_src.exists():
            shutil.copy(label_src, label_dir / label_name)
        
        copied += 1
    
    for img_path in val_images:
        shutil.copy(img_path, target_dir / img_path.name)
        label_name = img_path.stem + ".txt"
        label_src = WEBCAM_LABEL_DIR / label_name
        if label_src.exists():
            shutil.copy(label_src, label_dir / label_name)
    
    print(f"Added {copied} webcam images to dataset\n")
    return copied

def generate_synthetic_augmentation(count: int = 30):
    """Generate additional synthetic images for robustness."""
    added = 0
    for idx in range(count):
        w, h = 640, 640
        img = np.zeros((h, w, 3), dtype=np.uint8)
        boxes = []
        
        # Random scene type
        scene_type = random.choice(['conveyor', 'quarry', 'hopper'])
        
        if scene_type == 'conveyor':
            img[:] = (35, 38, 40)
            for _ in range(20):
                gy = random.randint(0, h)
                cv2.line(img, (0, gy), (w, gy), (random.randint(28, 48), random.randint(30, 50), random.randint(32, 52)), 1)
        
        elif scene_type == 'quarry':
            base_col = np.array([30, 45, 90], dtype=np.uint8)
            noise = random.randint(-15, 15, (h, w, 3), dtype=np.int16)
            img = np.clip(base_col + noise, 0, 255).astype(np.uint8)
        
        else:
            img[:] = (55, 60, 65)
        
        # Place rocks
        num_rocks = random.randint(2, 5)
        for r_idx in range(num_rocks):
            is_boulder = random.random() > 0.6
            cls_id = 0 if is_boulder else 1
            
            rw = random.randint(80, 180) if is_boulder else random.randint(40, 90)
            rh = random.randint(60, 150) if is_boulder else random.randint(30, 80)
            
            cx = random.randint(rw // 2 + 40, w - rw // 2 - 40)
            cy = random.randint(rh // 2 + 40, h - rh // 2 - 40)
            
            bx, by = cx - rw // 2, cy - rh // 2
            
            x_center = round((bx + rw / 2.0) / w, 5)
            y_center = round((by + rh / 2.0) / h, 5)
            norm_w = round(rw / w, 5)
            norm_h = round(rh / h, 5)
            
            boxes.append((cls_id, x_center, y_center, norm_w, norm_h))
            
            palette = random.choice([(130, 105, 90), (70, 95, 140), (145, 140, 135)])
            cv2.rectangle(img, (bx, by), (bx + rw, by + rh), palette, -1)
        
        # Save
        filename = f"augmented_{idx:03d}.jpg"
        label_filename = f"augmented_{idx:03d}.txt"
        
        split = "train" if idx < count * 0.8 else "val"
        img_out = (TRAIN_IMG_DIR if split == "train" else VAL_IMG_DIR) / filename
        lbl_out = (TRAIN_LABEL_DIR if split == "train" else VAL_LABEL_DIR) / label_filename
        
        cv2.imwrite(str(img_out), img)
        
        with open(lbl_out, "w") as f:
            for b in boxes:
                f.write(f"{b[0]} {b[1]} {b[2]} {b[3]} {b[4]}\n")
        
        added += 1
    
    print(f"Generated {added} augmented synthetic images")
    return added

def create_data_yaml():
    """Create/update data.yaml for training."""
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
    print(f"Created {yaml_path}\n")
    return yaml_path

def train_model(data_yaml: Path, epochs: int = 20):
    """Train YOLOv8 model on combined dataset."""
    base_weights = WEIGHTS_DIR / "yolov8n.pt"
    if not base_weights.exists():
        print("Downloading YOLOv8n base weights...")
        model = YOLO("yolov8n.pt")
    else:
        model = YOLO(str(base_weights))
    
    print(f"Starting training on {data_yaml}...")
    print(f"  Epochs: {epochs}")
    print(f"  Batch size: 8")
    print(f"  Image size: 640\n")
    
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=640,
        batch=8,
        workers=0,
        device="cpu",
        project=str(ML_DIR / "runs"),
        name="webcam_finetune",
        verbose=True
    )
    
    # Copy best weights
    best_weights_src = ML_DIR / "runs" / "webcam_finetune" / "weights" / "best.pt"
    best_weights_dst = WEIGHTS_DIR / "oresentinel_webcam.pt"
    
    if best_weights_src.exists():
        shutil.copy(best_weights_src, best_weights_dst)
        print(f"\n✓ Model trained successfully!")
        print(f"  Saved to: {best_weights_dst}")
        return best_weights_dst
    else:
        print("Warning: Best weights not found at expected path")
        return None

def main():
    print("=" * 65)
    print("   ORESENTINEL AI - WEBCAM MODEL TRAINING")
    print("=" * 65)
    
    setup_directories()
    
    # Step 1: Copy webcam data if available
    print("STEP 1: Adding webcam collected data...")
    webcam_count = copy_webcam_data(TRAIN_IMG_DIR, TRAIN_LABEL_DIR)
    
    # Step 2: Generate synthetic augmentation
    print("\nSTEP 2: Generating synthetic augmentation...")
    aug_count = generate_synthetic_augmentation(30)
    
    # Count total images
    train_imgs = len(list(TRAIN_IMG_DIR.glob("*.jpg"))) + len(list(TRAIN_IMG_DIR.glob("*.png")))
    val_imgs = len(list(VAL_IMG_DIR.glob("*.jpg"))) + len(list(VAL_IMG_DIR.glob("*.png")))
    
    print(f"\nTotal Dataset Size:")
    print(f"  Train: {train_imgs} images")
    print(f"  Val: {val_imgs} images")
    print(f"  Total: {train_imgs + val_imgs} images\n")
    
    if train_imgs == 0:
        print("No training data available. Please capture some images first using capture_webcam_data.py")
        return
    
    # Step 3: Create data.yaml
    print("STEP 3: Creating dataset configuration...")
    yaml_path = create_data_yaml()
    
    # Step 4: Train model
    print("STEP 4: Training model...")
    print("=" * 65)
    
    trained_weights = train_model(yaml_path, epochs=20)
    
    if trained_weights:
        print("\n" + "=" * 65)
        print("   TRAINING COMPLETE!")
        print(f"   Model saved to: {trained_weights}")
        print("\n   To use this model in the app, rename it to:")
        print(f"   {WEIGHTS_DIR / 'oresentinel_yolo.pt'}")
        print("=" * 65)

if __name__ == "__main__":
    main()
