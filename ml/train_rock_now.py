import os
import sys
from pathlib import Path
from ultralytics import YOLO

def main():
    base_dir = Path(__file__).resolve().parent.parent
    data_yaml = base_dir / "ml" / "datasets" / "rocks_mining" / "yolo_dataset" / "data.yaml"
    weights_dir = base_dir / "ml" / "weights"
    base_weights = weights_dir / "yolov8n.pt"
    
    print(f"[TRAIN] Data YAML: {data_yaml}")
    print(f"[TRAIN] Base weights: {base_weights}")
    
    if not data_yaml.exists():
        print(f"[ERROR] {data_yaml} does not exist!")
        sys.exit(1)
        
    model = YOLO(str(base_weights) if base_weights.exists() else "yolov8n.pt")
    
    print("[TRAIN] Starting training on real rock/mining dataset (12 epochs)...")
    results = model.train(
        data=str(data_yaml),
        epochs=12,
        batch=8,
        imgsz=416,
        project=str(base_dir / "ml" / "runs"),
        name="rock_mining_v1",
        pretrained=True,
        verbose=True,
        patience=20,
        plots=False
    )
    
    best_pt = Path(results.save_dir) / "weights" / "best.pt"
    if not best_pt.exists():
        best_pt = Path(results.save_dir) / "weights" / "last.pt"
        
    print(f"[TRAIN] Training finished! Best weights at: {best_pt}")
    
    dest_yolo = weights_dir / "oresentinel_yolo.pt"
    dest_rock = weights_dir / "oresentinel_rock_best.pt"
    
    import shutil
    shutil.copy(best_pt, dest_yolo)
    shutil.copy(best_pt, dest_rock)
    print(f"[DEPLOY] Copied best weights to:\n  - {dest_yolo}\n  - {dest_rock}")

    # Verify model classes
    trained_model = YOLO(str(dest_yolo))
    print(f"[DEPLOY] Trained classes: {trained_model.names}")

if __name__ == "__main__":
    main()
