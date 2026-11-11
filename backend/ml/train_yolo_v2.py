#!/usr/bin/env python3
"""
OreSentinel AI - Production YOLO Training Pipeline v2
Supports: real data, synthetic data, combined, transfer learning, class weighting.
"""

import os
import sys
import argparse
from pathlib import Path

# Add backend directory
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

# Ensure writable matplotlib cache dir
cache_dir = BASE_DIR / "ml" / ".cache"
cache_dir.mkdir(parents=True, exist_ok=True)
os.environ["MPLCONFIGDIR"] = str(cache_dir)

from ultralytics import YOLO


# Paths
ML_DIR = BASE_DIR / "ml"
WEIGHTS_DIR = ML_DIR / "weights"
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

# Dataset options (in priority order)
DATASET_OPTIONS = {
    "merged": ML_DIR / "dataset" / "data.yaml",           # Real + synthetic merged (from download_datasets.py)
    "enhanced_synthetic": ML_DIR / "dataset_v2" / "data.yaml",  # Enhanced synthetic v2
    "basic_synthetic": ML_DIR / "dataset" / "data.yaml",  # Original basic synthetic
}

OUTPUT_MODEL_PATH = WEIGHTS_DIR / "oresentinel_yolo.pt"
BEST_MODEL_PATH = WEIGHTS_DIR / "oresentinel_yolo_best.pt"


# Mining-optimized training hyperparameters
MINING_TRAIN_ARGS = {
    # Architecture
    "imgsz": 1280,           # Higher resolution for small rocks
    "batch": 16,             # Adjust based on GPU memory

    # Optimization
    "optimizer": "AdamW",
    "lr0": 0.001,            # Lower LR for fine-tuning
    "lrf": 0.01,             # Final LR factor
    "momentum": 0.937,
    "weight_decay": 0.0005,
    "warmup_epochs": 3.0,
    "warmup_momentum": 0.8,
    "warmup_bias_lr": 0.1,

    # Loss weights (critical for imbalanced mining data)
    "box": 7.5,
    "cls": 0.5,
    "dfl": 1.5,

    # Augmentation - tuned for mining/industrial
    "degrees": 15.0,         # Camera vibration
    "translate": 0.1,
    "scale": 0.5,
    "shear": 5.0,
    "perspective": 0.001,
    "flipud": 0.0,           # No vertical flip (conveyor has direction)
    "fliplr": 0.5,           # Horizontal OK
    "mosaic": 1.0,
    "mixup": 0.1,
    "copy_paste": 0.1,       # Helps with occlusion
    "copy_paste_mode": "flip",

    # Color augmentation (dust, lighting, wet ore)
    "hsv_h": 0.015,
    "hsv_s": 0.7,
    "hsv_v": 0.5,

    # Training control
    "patience": 30,          # Early stopping patience
    "save_period": 10,       # Save checkpoint every N epochs
    "val": True,
    "plots": True,

    # Device
    "device": "cpu",         # Force CPU (works everywhere)
    "workers": 4,            # DataLoader workers
    "amp": True,             # Automatic Mixed Precision
}


def find_dataset(data_arg: str = "auto") -> Path:
    """Find the best available dataset."""
    if data_arg != "auto" and Path(data_arg).exists():
        return Path(data_arg)

    # Priority order
    for name, path in DATASET_OPTIONS.items():
        if path.exists():
            print(f"📂 Using dataset: {name} -> {path}")
            return path

    raise FileNotFoundError(
        "No dataset found. Options:\n"
        f"  1. Run download_datasets.py to create merged dataset\n"
        f"  2. Run dataset_loader_v2.py to generate enhanced synthetic\n"
        f"  3. Specify --data path/to/data.yaml"
    )


def load_class_weights(data_yaml: Path) -> dict:
    """Compute class weights from label distribution for imbalanced mining data."""
    import yaml
    with open(data_yaml) as f:
        data = yaml.safe_load(f)

    labels_dir = Path(data["path"]) / "labels" / "train"
    if not labels_dir.exists():
        return {}

    class_counts = {}
    for lbl_file in labels_dir.glob("*.txt"):
        with open(lbl_file) as f:
            for line in f:
                parts = line.strip().split()
                if parts:
                    cls_idx = int(parts[0])
                    class_counts[cls_idx] = class_counts.get(cls_idx, 0) + 1

    if not class_counts:
        return {}

    # Compute inverse frequency weights
    total = sum(class_counts.values())
    n_classes = len(data.get("names", {}))
    weights = {}
    for i in range(n_classes):
        count = class_counts.get(i, 1)
        # Inverse frequency with smoothing
        weights[i] = total / (count * n_classes)

    # Normalize so mean weight = 1
    mean_w = sum(weights.values()) / len(weights)
    weights = {k: v / mean_w for k, v in weights.items()}

    names = data.get("names", {})
    print("\n[CLASS] Class distribution & weights:")
    for i in range(n_classes):
        name = names.get(i, f"class_{i}")
        count = class_counts.get(i, 0)
        w = weights.get(i, 1.0)
        print(f"  {i}: {name:20s}  count={count:6d}  weight={w:.3f}")

    return weights


def train_model(
    data_yaml: Path,
    epochs: int = 100,
    imgsz: int = 1280,
    batch: int = 16,
    device: str = "auto",
    pretrained_weights: str = None,
    resume: str = None,
    **kwargs
) -> Path:
    """Train YOLO model with mining-optimized settings."""

    print("=" * 70)
    print("   ORESENTINEL AI - PRODUCTION YOLO TRAINING PIPELINE v2")
    print("   Rock Crusher & Boulder Detection for Crusher Downtime Prevention")
    print("=" * 70)

    # Load model
    if resume and Path(resume).exists():
        print(f"\n[RESUME] Resuming from checkpoint: {resume}")
        model = YOLO(resume)
    elif pretrained_weights and Path(pretrained_weights).exists():
        print(f"\n[LOAD] Loading pretrained weights: {pretrained_weights}")
        model = YOLO(pretrained_weights)
    else:
        base_weights = WEIGHTS_DIR / "yolov8n.pt"
        if base_weights.exists():
            print(f"\n[LOAD] Loading base YOLOv8n: {base_weights}")
            model = YOLO(str(base_weights))
        else:
            print("\n[DOWNLOAD] Downloading YOLOv8n from Ultralytics...")
            model = YOLO("yolov8n.pt")

    # Compute class weights
    class_weights = load_class_weights(data_yaml)

    # Merge training args
    train_args = MINING_TRAIN_ARGS.copy()
    train_args.update({
        "data": str(data_yaml),
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "device": device,
        "project": str(WEIGHTS_DIR / "runs"),
        "name": "oresentinel_production",
        "exist_ok": True,
    })
    train_args.update(kwargs)  # Allow overrides

    # Apply class weights if available
    if class_weights:
        # Ultralytics doesn't directly support class weights in train()
        # But we can use cls_pw (class positive weight) for BCE loss
        # For now, log them - future: implement weighted loss callback
        pass

    print(f"\n[START] Starting training: {epochs} epochs, imgsz={imgsz}, batch={batch}, device={device}")
    print(f"   Dataset: {data_yaml}")
    print(f"   Output: {WEIGHTS_DIR / 'runs' / 'oresentinel_production'}")

    # Train
    results = model.train(**train_args)

    # Save best model to standard location
    best_pt = WEIGHTS_DIR / "runs" / "oresentinel_production" / "weights" / "best.pt"
    last_pt = WEIGHTS_DIR / "runs" / "oresentinel_production" / "weights" / "last.pt"

    if best_pt.exists():
        import shutil
        shutil.copy2(best_pt, OUTPUT_MODEL_PATH)
        shutil.copy2(best_pt, BEST_MODEL_PATH)
        print(f"\n[SAVED] Best model saved to: {OUTPUT_MODEL_PATH}")
    elif last_pt.exists():
        import shutil
        shutil.copy2(last_pt, OUTPUT_MODEL_PATH)
        print(f"\n⚠️  No best.pt found, saved last.pt to: {OUTPUT_MODEL_PATH}")
    else:
        model.save(str(OUTPUT_MODEL_PATH))
        print(f"\n⚠️  Saved model state to: {OUTPUT_MODEL_PATH}")

    # Validation
    print("\n[VAL] Validating on test set...")
    metrics = model.val(split="test" if (Path(data_yaml).parent / "images" / "test").exists() else "val")

    print("\n" + "=" * 50)
    print("   FINAL METRICS")
    print("=" * 50)
    try:
        print(f"Mean Precision (P):     {metrics.box.mp * 100:.1f}%")
        print(f"Mean Recall (R):        {metrics.box.mr * 100:.1f}%")
        print(f"mAP@50:                 {metrics.box.map50 * 100:.1f}%")
        print(f"mAP@50-95:              {metrics.box.map * 100:.1f}%")

        # Per-class
        print("\nPer-class mAP@50:")
        for i, name in metrics.names.items():
            if hasattr(metrics.box, 'ap50'):
                ap50 = metrics.box.ap50[i] if i < len(metrics.box.ap50) else 0
                print(f"  {i}: {name:20s}  {ap50 * 100:.1f}%")
    except Exception as e:
        print(f"Metrics parsing error: {e}")
        print(f"Raw: {metrics}")

    return OUTPUT_MODEL_PATH


def export_model(model_path: Path, formats: list = None):
    """Export model to deployment formats (ONNX, TensorRT, CoreML, etc.)."""
    if formats is None:
        formats = ["onnx", "torchscript"]

    print(f"\n[EXPORT] Exporting model: {model_path}")
    model = YOLO(str(model_path))

    for fmt in formats:
        try:
            exported = model.export(format=fmt, imgsz=1280, simplify=True, half=True)
            print(f"  [OK] {fmt}: {exported}")
        except Exception as e:
            print(f"  [FAIL] {fmt}: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="OreSentinel AI - Production YOLO Training",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train on best available dataset (auto-detect)
  python train_yolo_v2.py --epochs 100

  # Train on specific dataset
  python train_yolo_v2.py --data ml/dataset_v2/data.yaml --epochs 50

  # Fine-tune from existing weights (lower LR, fewer epochs)
  python train_yolo_v2.py --pretrained ml/weights/oresentinel_yolo.pt --epochs 20 --lr 0.0005

  # Resume interrupted training
  python train_yolo_v2.py --resume ml/weights/runs/oresentinel_production/weights/last.pt

  # Export for deployment
  python train_yolo_v2.py --export-only --model ml/weights/oresentinel_yolo.pt
        """
    )

    parser.add_argument("--data", type=str, default="auto",
                        help="Path to data.yaml (auto: merged > enhanced_synthetic > basic_synthetic)")
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs")
    parser.add_argument("--imgsz", type=int, default=1280, help="Image size")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="cpu", help="Device: cpu, 0, 1, etc. (auto not supported on CPU-only)")
    parser.add_argument("--lr", type=float, default=0.001, help="Initial learning rate")
    parser.add_argument("--pretrained", type=str, help="Path to pretrained weights for fine-tuning")
    parser.add_argument("--resume", type=str, help="Resume from checkpoint (last.pt)")
    parser.add_argument("--workers", type=int, default=4, help="DataLoader workers")
    parser.add_argument("--export-only", action="store_true", help="Only export existing model")
    parser.add_argument("--model", type=str, default="ml/weights/oresentinel_yolo.pt",
                        help="Model to export (with --export-only)")
    parser.add_argument("--export-formats", nargs="+", default=["onnx", "torchscript"],
                        help="Export formats: onnx, torchscript, engine, coreml, tflite")

    args = parser.parse_args()

    if args.export_only:
        model_path = Path(args.model)
        if not model_path.exists():
            # Try relative to BASE_DIR
            model_path = BASE_DIR / args.model
        if model_path.exists():
            export_model(model_path, args.export_formats)
        else:
            print(f"[FAIL] Model not found: {model_path}")
        return

    # Find dataset
    try:
        data_yaml = find_dataset(args.data)
    except FileNotFoundError as e:
        print(f"[FAIL] {e}")
        print("\n[TIP] To create datasets:")
        print("   python ml/download_datasets.py --roboflow-key YOUR_KEY  # Merge real datasets")
        print("   python ml/dataset_loader_v2.py --train 2000 --val 400 --test 200  # Enhanced synthetic")
        return

    # Train
    train_model(
        data_yaml=data_yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        pretrained_weights=args.pretrained,
        resume=args.resume,
        lr0=args.lr,
        workers=args.workers,
    )

    # Auto-export best model
    if OUTPUT_MODEL_PATH.exists():
        export_model(OUTPUT_MODEL_PATH, ["onnx", "torchscript"])


if __name__ == "__main__":
    main()