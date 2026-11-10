"""
OreSentinel AI - YOLO Model Fine-Tuning Pipeline
Tata Steel / Women of Mettle 2026

Trains or fine-tunes Ultralytics YOLO on open-source rock crusher / boulder reference dataset:
- Classes: rock_fragment, oversize_boulder, wedging_slab
- Outputs calibrated weights: backend/ml/weights/oresentinel_yolo.pt
"""

import os
import sys
from pathlib import Path

# Add backend directory
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

# Ensure writable matplotlib cache dir
cache_dir = BASE_DIR / "ml" / ".cache"
cache_dir.mkdir(parents=True, exist_ok=True)
os.environ["MPLCONFIGDIR"] = str(cache_dir)

from ml.dataset_loader import generate_open_source_reference_samples, DATA_YAML_PATH, ML_DIR
from ultralytics import YOLO

WEIGHTS_DIR = ML_DIR / "weights"
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_MODEL_PATH = WEIGHTS_DIR / "oresentinel_yolo.pt"

def train_oresentinel_yolo(epochs=3, imgsz=640, batch=4):
    print("=" * 65)
    print("   ORESENTINEL AI - YOLO MODEL TRAINING PIPELINE")
    print("   Open-Source Reference: Rock Crusher & Boulder Detection")
    print("=" * 65)

    # 1. Ensure dataset exists
    data_yaml = generate_open_source_reference_samples(num_train=24, num_val=6)
    print(f"Using dataset definition: {data_yaml}")

    # 2. Load base YOLOv8 model (Nano architecture for fast training)
    print("\nLoading YOLOv8 base model...")
    base_weights = WEIGHTS_DIR / "yolov8n.pt"
    if base_weights.exists():
        model = YOLO(str(base_weights))
    else:
        model = YOLO("yolov8n.pt")

    # 3. Train on open reference dataset
    print(f"\nStarting training for {epochs} epochs (imgsz={imgsz}, batch={batch})...")
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device="cpu",  # Works reliably on any machine
        plots=False,
        save=True,
        workers=0,     # Safe on Windows main thread
        project=str(WEIGHTS_DIR / "runs"),
        name="oresentinel_run",
        exist_ok=True
    )

    # 4. Save best trained model to standardized weights location
    best_pt = WEIGHTS_DIR / "runs" / "oresentinel_run" / "weights" / "best.pt"
    if best_pt.exists():
        import shutil
        shutil.copyfile(best_pt, OUTPUT_MODEL_PATH)
        print(f"\nSUCCESS: Fine-tuned model weights saved to:\n-> {OUTPUT_MODEL_PATH}")
    else:
        # Fallback to saving current model state
        model.save(str(OUTPUT_MODEL_PATH))
        print(f"\nModel state saved to:\n-> {OUTPUT_MODEL_PATH}")

    # 5. Validation metrics
    print("\nValidating trained model on test holdout...")
    metrics = model.val()
    print("\n" + "=" * 45)
    print("   YOLO TRAINING METRICS SUMMARY")
    print("=" * 45)
    try:
        p = metrics.box.mp
        r = metrics.box.mr
        map50 = metrics.box.map50
        print(f"Mean Precision (P): {p*100:.1f}%")
        print(f"Mean Recall (R):    {r*100:.1f}%")
        print(f"mAP@50:             {map50*100:.1f}%")
    except Exception as e:
        print(f"Metrics: {metrics}")

    return OUTPUT_MODEL_PATH

if __name__ == "__main__":
    train_oresentinel_yolo(epochs=3)
