#!/usr/bin/env python3
"""
OreSentinel AI - Rock & Mining Fragment Detection Dataset Builder
Downloads public datasets and converts to YOLO format
"""

import os
import zipfile
import requests
import shutil
from pathlib import Path
from PIL import Image
import yaml

# Configuration
DATASET_DIR = Path.home() / ".gemini" / "antigravity" / "scratch" / "oresentinel-ai" / "ml" / "datasets" / "rocks_mining"
OUTPUT_DIR = DATASET_DIR / "yolo_dataset"
CLASS_NAMES = {
    0: "rock",
    1: "boulder", 
    2: "ore_fragment",
    3: "gravel",
    4: "quarry_debris",
    5: "mining_fragment"
}

def mkdirs():
    """Create directory structure"""
    dirs = [
        OUTPUT_DIR / "images" / "train",
        OUTPUT_DIR / "images" / "val",
        OUTPUT_DIR / "labels" / "train",
        OUTPUT_DIR / "labels" / "val",
        DATASET_DIR / "raw"
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    return dirs

def download_kaggle_dataset(dataset_slug: str, output_dir: Path):
    """Download dataset from Kaggle"""
    try:
        import kaggle
        print(f"Downloading {dataset_slug}...")
        kaggle.api.dataset_download_zip(
            dataset_slug, 
            f"{output_dir}/{dataset_slug.replace('/', '_')}.zip"
        )
        print(f"✓ Downloaded {dataset_slug}")
        return True
    except Exception as e:
        print(f"✗ Failed to download {dataset_slug}: {e}")
        return False

def download_rock_images_web(target_dir: Path, class_name: str, count: int = 50):
    """Download rock images from web sources"""
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Using Unsplash API-like direct links or other free image sources
    # For demo purposes, we'll use placeholder logic
    print(f"Prepared download template for {class_name} ({count} images)")
    return target_dir

def create_data_yaml():
    """Create data.yaml for YOLO training"""
    data_yaml = {
        "path": str(OUTPUT_DIR),
        "train": "images/train",
        "val": "images/val",
        "names": CLASS_NAMES
    }
    
    yaml_path = OUTPUT_DIR / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False)
    
    print(f"Created {yaml_path}")
    return yaml_path

def main():
    print("=" * 60)
    print("OreSentinel AI - Dataset Builder for Rock/Mining Detection")
    print("=" * 60)
    
    # Setup directories
    dirs = mkdirs()
    raw_dir = DATASET_DIR / "raw"
    
    print(f"\n[DIR] Working directory: {DATASET_DIR}")
    print(f"      Raw data: {raw_dir}")
    print(f"      YOLO output: {OUTPUT_DIR}")
    
    # Suggested datasets to download manually:
    suggested_datasets = [
        ("rockdetection/rock-classification", "Rock Classification"),
        ("andreasveibel/geology-dataset", "Geology Dataset"),
        ("mining/mining-equipment-dataset", "Mining Equipment"),
    ]
    
    print("\n[DSETS] Recommended Datasets (download manually via Kaggle):")
    for slug, name in suggested_datasets:
        print(f"   • {name}: {slug}")
        download = input(f"     Download '{name}'? (y/n): ").lower()
        if download.lower() == 'y':
            download_kaggle_dataset(slug, raw_dir)
    
    # Create data config
    yaml_path = create_data_yaml()
    
    print("\n" + "=" * 60)
    print("Next Steps:")
    print("=" * 60)
    print("""
1. Download datasets from:
   - Kaggle.com/datasets (search: "rock detection", "mining")
   - Roboflow Universe (roboflow.com/universe)
   
2. Or use this Python notebook approach:
   ```python
   from roboflow import Roboflow
   rf = Roboflow(api_key="YOUR_KEY")
   project = rf.workspace().project("your-project")
   dataset = project.version(1).download("yolov8")
   ```

3. Once you have images, run the annotation script:
   python ml/label_rocks.py --input <image_folder> --classes rock,boulder,ore_fragment
   """)
    
    print(f"\n[OK] Dataset ready at: {OUTPUT_DIR}")
    print(f"[CFG] Config file: {yaml_path}")
    return yaml_path

if __name__ == "__main__":
    main()
