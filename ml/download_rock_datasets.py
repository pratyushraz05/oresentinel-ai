"""
OreSentinel AI - Download Rock/Mining Datasets from Public Sources
Uses Roboflow Universe and other public datasets
"""

import os
import yaml
from pathlib import Path
import shutil
import zipfile
import requests
from ultralytics import YOLO

BASE_DIR = Path.home() / ".gemini" / "antigravity" / "scratch" / "oresentinel-ai"
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "datasets" / "rocks_mining"
YOLO_OUTPUT = DATASET_DIR / "yolo_dataset"
RAW_DIR = DATASET_DIR / "raw"

# Target classes for mining/rock detection
CLASSES = {
    0: "rock",
    1: "boulder", 
    2: "ore_fragment",
    3: "gravel",
    4: "quarry_debris",
    5: "mining_fragment"
}

def setup_directories():
    """Create directory structure"""
    dirs = [
        YOLO_OUTPUT / "images" / "train",
        YOLO_OUTPUT / "images" / "val",
        YOLO_OUTPUT / "labels" / "train",
        YOLO_OUTPUT / "labels" / "val",
        RAW_DIR / "downloaded"
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    return dirs

def download_roboflow_dataset(workspace: str, project: str, version: int, format: str = "yolov8", dest: Path = None):
    """Download dataset from Roboflow Universe"""
    try:
        from roboflow import Roboflow
        
        print(f"[ROBOFLOW] Downloading {workspace}/{project}:v{version}...")
        
        rf = Roboflow()
        dataset = rf.workspace(workspace).project(project).version(version).download(
            format=format,
            location=str(dest) if dest else str(RAW_DIR)
        )
        
        print(f"[OK] Downloaded to: {dataset}")
        return True
    except Exception as e:
        print(f"[ERROR] Roboflow error: {e}")
        return False

def download_image(url: str, dest: Path, filename: str):
    """Download a single image"""
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            img_path = dest / filename
            img_path.write_bytes(response.content)
            print(f"[IMG] Downloaded: {img_path.name}")
            return True
    except Exception as e:
        print(f"[WARN] Failed to download {url}: {e}")
    return False

def prepare_dataset_structure():
    """Organize downloaded data into YOLO format"""
    downloaded_dir = RAW_DIR / "downloaded"
    
    # Check what was downloaded
    images_dir = YOLO_OUTPUT / "images"
    labels_dir = YOLO_OUTPUT / "labels"
    
    # Move images from raw to proper locations
    for item in downloaded_dir.rglob("*"):
        if item.is_file():
            if item.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
                # Determine if train or val based on folder name or random split
                src = str(item)
                rel = item.relative_to(downloaded_dir)
                
                # Simple split: first 80% train, 20% val
                parts = str(rel).replace('\\', '/').split('/')
                is_val = 'val' in parts or 'test' in parts or 'validation' in parts
                
                target_dir = images_dir / "val" if is_val else images_dir / "train"
                target_dir.mkdir(parents=True, exist_ok=True)
                
                # Copy file
                shutil.copy2(item, target_dir / item.name)
                
                # If there's a corresponding label file, copy it too
                label_path = item.with_suffix('.txt')
                if label_path.exists():
                    label_target = labels_dir / ("val" if is_val else "train")
                    label_target.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(label_path, label_target / label_path.name)

def create_data_yaml():
    """Create/update data.yaml configuration"""
    data_config = {
        "path": str(YOLO_OUTPUT),
        "train": "images/train",
        "val": "images/val",
        "names": CLASSES
    }
    
    yaml_path = YOLO_OUTPUT / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data_config, f, default_flow_style=False)
    
    print(f"[CONFIG] Created: {yaml_path}")
    return yaml_path

def main():
    print("=" * 60)
    print("OreSentinel AI - Dataset Download & Preparation")
    print("=" * 60)
    
    setup_directories()
    
    # Try to download datasets from various sources
    print("\n[FETCH] Attempting to download public datasets...\n")
    
    # Suggested Roboflow datasets (free/universe datasets)
    datasets_to_try = [
        # Format: (workspace, project, version)
        ("roboflow-universe", "rock-classification", 1),
        ("roboflow-universe", "geology-images", 1),
        ("roboflow-universe", "boulder-detection", 1),
    ]
    
    success = []
    for workspace, project, version in datasets_to_try:
        print(f"\n[Try] {workspace}/{project}:v{version}")
        result = download_roboflow_dataset(workspace, project, version)
        if result:
            success.append((workspace, project))
    
    # If no datasets were found/downloaded, provide manual instructions
    if not success:
        print("\n" + "=" * 60)
        print("[INFO] No datasets auto-downloaded.")
        print("=" * 60)
        print("""
Next Steps - Manual Dataset Collection:

1. Visit these public datasets on Roboflow Universe:
   • https://universe.roboflow.com/search?q=rock
   • https://universe.roboflow.com/search?q=mining
   • https://universe.roboflow.com/search?q=boulder
   
2. Click "Download" -> Choose "YOLOv8 PyTorch" format
   -> Extract to: ml/datasets/rocks_mining/raw/
   
3. Alternative sources:
   • Kaggle: https://www.kaggle.com/datasets?search=rock+detection
   • Hugging Face: https://huggingface.co/datasets?search=rock
   
4. For quick start, you can also use our existing data:
   • The current clean_test dataset can serve as a template
   • Just update the class names in data.yaml to your targets
""")
    
    # Prepare dataset structure
    prepare_dataset_structure()
    
    # Create data config
    data_yaml = create_data_yaml()
    
    # Show stats
    train_images = len(list((YOLO_OUTPUT / "images" / "train").glob("*")))
    val_images = len(list((YOLO_OUTPUT / "images" / "val").glob("*")))
    train_labels = len(list((YOLO_OUTPUT / "labels" / "train").glob("*.txt")))
    
    print(f"\n[DASET] Dataset Summary:")
    print(f"        Train images: {train_images}")
    print(f"        Val images:   {val_images}")
    print(f"        Training labels: {train_labels}")
    
    return data_yaml, success

if __name__ == "__main__":
    main()
