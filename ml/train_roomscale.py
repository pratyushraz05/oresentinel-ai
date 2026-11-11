"""
RoomScale AI - Complete Training Pipeline
Combines synthetic room data + your captured photos for size-aware training
"""

import sys
import shutil
import os
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "dataset"
WEIGHTS_DIR = ML_DIR / "weights"

# Import our modules
sys.path.insert(0, str(ML_DIR))
from room_dataset_generator import RoomDatasetGenerator, ROOM_OBJECTS
from room_labeler import RoomLabeler, WEB_CAPTURE_DIR, ANNOTATIONS_DIR


def setup_directories():
    """Ensure all directories exist."""
    dirs = [
        DATASET_DIR / "room_images" / "train",
        DATASET_DIR / "room_images" / "val",
        DATASET_DIR / "room_labels" / "train",
        DATASET_DIR / "room_labels" / "val",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    print("Directories ready.\n")


def add_web_captures(target_img_dir, target_lbl_dir, max_samples: int = 50):
    """Add user-captured images to dataset."""
    if not WEB_CAPTURE_DIR.exists():
        print("No webcam captures found.")
        return 0
    
    captures = list(WEB_CAPTURE_DIR.glob("*.jpg")) + list(WEB_CAPTURE_DIR.glob("*.png"))
    
    if not captures:
        print("No captured images found in", WEB_CAPTURE_DIR)
        return 0
    
    if len(captures) > max_samples:
        import random
        random.seed(42)
        captures = random.sample(captures, max_samples)
    
    print(f"Adding {len(captures)} captured images to dataset...\n")
    
    copied = 0
    for img_path in captures:
        shutil.copy(img_path, target_img_dir / img_path.name)
        lbl_path = ANNOTATIONS_DIR / (img_path.stem + ".txt")
        if lbl_path.exists():
            shutil.copy(lbl_path, target_lbl_dir / lbl_path.name)
        copied += 1
    
    return copied


def generate_synthetic_data(mm_per_pixel: float, count: int = 80):
    """Generate synthetic room scenes for training."""
    print(f"Generating {count} synthetic room scenes...")
    print(f"Using scale: {mm_per_pixel:.3f} mm/pixel\n")
    
    generator = RoomDatasetGenerator(mm_per_pixel=mm_per_pixel)
    generator.image_dir = DATASET_DIR / "room_images" / "train"
    generator.label_dir = DATASET_DIR / "room_labels" / "train"
    generator.val_image_dir = DATASET_DIR / "room_images" / "val"
    generator.val_label_dir = DATASET_DIR / "room_labels" / "val"
    
    generator.generate_dataset(count)
    return count


def create_training_yaml():
    """Create/update data.yaml for training."""
    yaml_content = f"""path: {str(DATASET_DIR).replace(os.sep, '/')}
train: room_images/train
val: room_images/val
labels: labels

names:
"""
    # Extract just the object names from ROOM_OBJECTS keys
    object_names = list(ROOM_OBJECTS.keys())
    for i, name in enumerate(object_names):
        yaml_content += f"  {i}: {name}\n"
    
    yaml_path = DATASET_DIR / "data.yaml"
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    
    print(f"Created {yaml_path}")
    return yaml_path


def train_model(data_yaml, epochs: int = 30):
    """Train YOLOv8 on room object dataset."""
    base_weights = WEIGHTS_DIR / "yolov8n.pt"
    if not base_weights.exists():
        print("Downloading YOLOv8n base weights...")
        model = YOLO("yolov8n.pt")
    else:
        model = YOLO(str(base_weights))
    
    print("\n" + "=" * 65)
    print("   TRAINING ROOMSCALE MODEL")
    print("=" * 65)
    print(f"  Epochs: {epochs}")
    print(f"  Batch size: 8")
    print(f"  Image size: 640x640\n")
    
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=640,
        batch=8,
        workers=0,
        device="cpu",
        project=str(ML_DIR / "runs"),
        name="roomscale",
        verbose=True,
        augment=True,
    )
    
    # Copy best weights
    best_src = ML_DIR / "runs" / "roomscale" / "weights" / "best.pt"
    best_dst = WEIGHTS_DIR / "roomscale_model.pt"
    
    if best_src.exists():
        shutil.copy(best_src, best_dst)
        print(f"\n✓ Model saved to: {best_dst}")
        return best_dst
    
    return None


def export_calibration(mm_per_pixel: float):
    """Export calibration config."""
    output_path = BASE_DIR / "backend" / "app" / "calibration.json"
    
    config = {
        'model_type': 'roomscale',
        'object_classes': list(ROOM_OBJECTS.keys()),
        'mm_per_pixel': mm_per_pixel,
        'updated_at': datetime.now().isoformat()
    }
    
    import json
    with open(output_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"Exported calibration to: {output_path}")
    return output_path


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='RoomScale AI Training Pipeline')
    parser.add_argument('--mm-per-pixel', type=float, default=0.5, help='Calibration scale')
    parser.add_argument('--epochs', type=int, default=30, help='Training epochs')
    parser.add_argument('--skip-synthetic', action='store_true', help='Skip synthetic data generation')
    parser.add_argument('--skip-web', action='store_true', help='Skip adding webcam captures')
    args = parser.parse_args()
    
    print("""
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              ROOMSCALE AI - SIZE MEASUREMENT TRAINER           ║
║                                                                  ║
║       Measure ANY object in your room with your camera         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
""")
    
    setup_directories()
    
    mm_per_pixel = args.mm_per_pixel
    
    # Step 1: Synthetic data
    if not args.skip_synthetic:
        generate_synthetic_data(mm_per_pixel, 80)
    
    # Step 2: Add webcam captures
    if not args.skip_web:
        added = add_web_captures(
            DATASET_DIR / "room_images" / "train",
            DATASET_DIR / "room_labels" / "train"
        )
        if added > 0:
            print(f"Added {added} captured images\n")
        else:
            print("No webcam captures to add. Run room_labeler.py first!\n")
    
    # Count total images
    train_imgs = len(list((DATASET_DIR / "room_images" / "train").glob("*.jpg")))
    val_imgs = len(list((DATASET_DIR / "room_images" / "val").glob("*.jpg")))
    
    print(f"Total dataset: {train_imgs + val_imgs} images")
    print(f"  Train: {train_imgs}")
    print(f"  Val: {val_imgs}\n")
    
    if train_imgs == 0:
        print("No training data available!")
        return
    
    # Step 3: Copy labels to YOLO format (room_labels -> labels)
    print("Copying labels to training structure...")
    import shutil as _shutil
    lbl_train = DATASET_DIR / "labels" / "train"
    lbl_val = DATASET_DIR / "labels" / "val"
    room_lbl_train = DATASET_DIR / "room_labels" / "train"
    room_lbl_val = DATASET_DIR / "room_labels" / "val"
    
    lbl_train.mkdir(parents=True, exist_ok=True)
    lbl_val.mkdir(parents=True, exist_ok=True)
    
    # Copy train labels
    for f in room_lbl_train.glob("*.txt"):
        _shutil.copy(f, lbl_train / f.name)
    
    # Copy val labels
    for f in room_lbl_val.glob("*.txt"):
        _shutil.copy(f, lbl_val / f.name)
    
    print(f"  Copied {len(list(lbl_train.glob('*.txt')))} train labels")
    print(f"  Copied {len(list(lbl_val.glob('*.txt')))} val labels\n")
    
    # Step 4: Create config
    yaml_path = create_training_yaml()
    
    # Step 4: Train
    model_path = train_model(yaml_path, args.epochs)
    
    if model_path:
        print("\n" + "=" * 65)
        print("TRAINING COMPLETE!")
        print("=" * 65)
        print(f"\nModel location: {model_path}")
        print(f"To activate: rename to roomscale_model.pt in ml/weights/")
        
        # Export calibration
        export_calibration(mm_per_pixel)
    
    print("\nNext steps:")
    print("  1. Test: python run_app.py")
    print("  2. Use room_labeler.py to capture more real data")
    print("  3. Retrain periodically with new captures for better accuracy")


if __name__ == "__main__":
    main()
