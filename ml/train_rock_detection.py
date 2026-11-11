"""
OreSentinel AI - Rock & Mining Fragment Detection Training Pipeline
Downloads public datasets, prepares data, and trains YOLOv8 model
"""

import os
import yaml
from pathlib import Path
import requests
from PIL import Image
import zipfile
import shutil
from ultralytics import YOLO
import subprocess

# Configuration
BASE_DIR = Path.home() / ".gemini" / "antigravity" / "scratch" / "oresentinel-ai"
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "datasets" / "rocks_mining"
YOLO_OUTPUT = DATASET_DIR / "yolo_dataset"
RAW_DIR = DATASET_DIR / "raw"

# Define classes for mining/rock detection
CLASSES = {
    0: "rock",           # General rocks
    1: "boulder",        # Large boulders
    2: "ore_fragment",   # Ore fragments
    3: "gravel",         # Small stones/gravel
    4: "quarry_debris",  # Quarry debris/rubble
    5: "mining_fragment" # General mining fragments
}

def create_directory_structure():
    """Create necessary directories"""
    dirs = [
        YOLO_OUTPUT / "images" / "train",
        YOLO_OUTPUT / "images" / "val",
        YOLO_OUTPUT / "labels" / "train",
        YOLO_OUTPUT / "labels" / "val",
        RAW_DIR
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    return dirs

def download_kaggle_dataset(dataset_slug: str, output_dir: Path):
    """Download dataset from Kaggle using CLI"""
    try:
        print(f"[DOWNLOAD] Fetching {dataset_slug}...")
        result = subprocess.run(
            ["kaggle", "datasets", "download", "-d", dataset_slug, 
             "--path", str(output_dir), "--unzip"],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            print(f"[OK] Downloaded: {dataset_slug}")
            return True
        else:
            print(f"[WARN] Failed to download {dataset_slug}: {result.stderr}")
            return False
    except Exception as e:
        print(f"[ERROR] Error downloading {dataset_slug}: {e}")
        return False

def download_robflow_dataset(api_key: str, workspace: str, project: str, version: int = 1):
    """Download dataset from Roboflow Universe"""
    try:
        from roboflow import Roboflow
        print(f"[DOWNLOAD] Fetching from Roboflow: {workspace}/{project}...")
        
        rf = Roboflow(api_key=api_key)
        project_obj = rf.workspace(workspace).project(project)
        dataset = project_obj.version(version).download("yolov8", location=str(RAW_DIR))
        
        print(f"[OK] Downloaded from Roboflow")
        return True
    except Exception as e:
        print(f"[ERROR] Roboflow error: {e}")
        return False

def create_data_yaml():
    """Create YOLO data.yaml configuration"""
    data_config = {
        "path": str(YOLO_OUTPUT),
        "train": "images/train",
        "val": "images/val",
        "names": CLASSES
    }
    
    yaml_path = YOLO_OUTPUT / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data_config, f, default_flow_style=False)
    
    print(f"[CONFIG] Created data.yaml at: {yaml_path}")
    return yaml_path

def train_model(data_yaml: Path, epochs: int = 20, batch_size: int = 8, imgsz: int = 640):
    """Train YOLOv8 model on rock/mining dataset"""
    print("\n" + "=" * 60)
    print("[TRAIN] Starting Rock/Mining Detection Training")
    print("=" * 60)
    
    # Load pre-trained model
    model = YOLO("yolov8n.pt")
    
    # Train
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        project=str(BASE_DIR / "runs" / "detect"),
        name="rock_mining_detection",
        pretrained=True,
        verbose=True,
        patience=100,  # Early stopping patience
        augment=True,  # Data augmentation
        close_mosaic=10,  # Disable mosaic near end
    )
    
    print(f"\n[TRAIN] Training complete!")
    print(f"[INFO] Best model saved to: {results.save_dir}/weights/best.pt")
    return results

def main():
    print("=" * 60)
    print("OreSentinel AI - Rock & Mining Detection Training")
    print("=" * 60)
    
    # Setup directories
    create_directory_structure()
    print(f"\n[SETUP] Working directory: {DATASET_DIR}")
    
    # Create data config
    data_yaml = create_data_yaml()
    
    # Check if we have any existing datasets
    existing_data = []
    for zip_file in RAW_DIR.glob("*.zip"):
        existing_data.append(zip_file)
    
    # Try to download some common rock datasets
    print("\n[DSETS] Attempting to fetch public datasets...")
    
    # Option 1: Try Kaggle datasets (if user has kaggle credentials)
    # Uncomment below and add your kaggle.json to ~/.kaggle/
    # Kaggle datasets related to rocks/mining:
    # - rockdetection/rock-classification
    # - minelab/rock-image-detection
    
    # Option 2: Roboflow Universe datasets
    # You'll need a Roboflow API key from https://app.roboflow.com
    # Uncomment below:
    # download_robflow_dataset(
    #     api_key="YOUR_ROBOFLOW_API_KEY",
    #     workspace="robflow-universe",
    #     project="rock-classification",
    #     version=1
    # )
    
    # Option 3: Manual dataset preparation
    print("""
[METHOD] Dataset Sources:
---------
1. Kaggle Datasets (free):
   - Search: "rock classification", "geology images", "mining"
   - URL: https://www.kaggle.com/datasets
   
2. Roboflow Universe (free tier):
   - Many rock/mining datasets available
   - Requires free API key from app.roboflow.com
   
3. Direct image collection:
   - Use web scraping for quarry/mining site images
   - Collect samples of different rock types

[SUGGEST] Recommended next steps:
----------------------------------
1. Visit https://www.kaggle.com/datasets?search=rock+classification
2. Download a suitable dataset to: {raw_dir}
3. Extract and organize into train/val structure
4. Or use Roboflow to label your own images
   """.format(raw_dir=RAW_DIR))
    
    # For now, let's create a placeholder dataset if none exists
    # This allows testing the pipeline
    if not any(RAW_DIR.iterdir()):
        print("[INFO] No raw data found. Using existing clean_test dataset structure...")
        # Copy existing structure as template
        src = ML_DIR / "dataset" / "clean_test"
        if src.exists():
            shutil.copytree(src, YOLO_OUTPUT, dirs_exist_ok=True)
            print("[COPY] Copied template dataset structure")
    
    # Update yaml path if needed
    data_yaml = create_data_yaml()
    
    # Run training
    print("\n" + "-" * 60)
    print("[START] Beginning training...")
    print("-" * 60)
    
    try:
        results = train_model(data_yaml, epochs=15, batch_size=8, imgsz=640)
        
        print("\n" + "=" * 60)
        print("[COMPLETE] Training finished successfully!")
        print("=" * 60)
        print(f"\n[MODEL] Save location: {results.save_dir}")
        print(f"[METRICS] See results in TensorBoard: tensorboard --logdir={results.save_dir}")
        
    except Exception as e:
        print(f"[ERROR] Training failed: {e}")
        raise

if __name__ == "__main__":
    main()
