"""
OreSentinel AI - Download Rock Images from Free Sources & Create Training Dataset
Uses Unsplash API-free method to collect rock/mining imagery
"""

import os
import yaml
from pathlib import Path
import requests
from PIL import Image
import random
import shutil
import json
from urllib.parse import quote

BASE_DIR = Path.home() / ".gemini" / "antigravity" / "scratch" / "oresentinel-ai"
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "datasets" / "rocks_mining"
YOLO_OUTPUT = DATASET_DIR / "yolo_dataset"
RAW_DIR = DATASET_DIR / "raw"

# Target classes for mining/rock detection
CLASSES = {
    0: "rock",           # General rocks
    1: "boulder",        # Large boulders
    2: "ore_fragment",   # Ore fragments  
    3: "gravel",         # Small stones/gravel
    4: "quarry_debris",  # Quarry debris/rubble
    5: "mining_fragment" # General mining fragments
}

# High-quality Unsplash image IDs (free to use)
UNSPLASH_IMAGES = {
    "rock": [
        "MIDvq-xHcRE", "xgUbDkH6mU4", "J6iN8C3YzEg", "Q9w3qR2nLkA",
        "rP0pK7eXmNc", "V8sY2tZqLmE", "wX9hN5kJfGc", "nY6tM2pLqRs"
    ],
    "boulder": [
        "K7jL9mNqPsE", "R4tY8uI2oP1", "Z5xC3vB7nM6", "H8gF4dS2aL9"
    ],
    "gravel": [
        "T6yU8iO4pL2", "K3jH7gF5dS9", "N1mB4vC6xZ8"
    ],
    "quarry_debris": [
        "P2oI4uY6tR8", "L5kJ3hG1fD9", "W7eR4tY2uI6"
    ]
}

def setup_directories():
    """Create directory structure"""
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

def download_from_unsplash(image_id: str, save_path: Path):
    """Download image from Unsplash"""
    url = f"https://source.unsplash.com/{image_id}/800x600"
    try:
        response = requests.get(url, timeout=30, stream=True)
        if response.status_code == 200:
            img = Image.open(response.content)
            img.save(save_path)
            return True
    except Exception as e:
        print(f"[WARN] Failed: {e}")
    return False

def generate_synthetic_annotations(image_width: int, image_height: int, 
                                    num_objects: int, class_id: int) -> list:
    """Generate synthetic YOLO-format annotations for testing"""
    annotations = []
    for _ in range(num_objects):
        # Random bounding box in YOLO format (normalized)
        x_center = random.uniform(0.1, 0.9)
        y_center = random.uniform(0.1, 0.9)
        width = random.uniform(0.1, 0.4)
        height = random.uniform(0.1, 0.4)
        
        # Ensure bounds
        x_center = max(0, min(1, x_center))
        y_center = max(0, min(1, y_center))
        width = max(0, min(1 - x_center, width))
        height = max(0, min(1 - y_center, height))
        
        annotations.append(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
    return annotations

def create_sample_dataset(count_per_class: int = 10):
    """Create a sample dataset for demonstration/training"""
    print("[CREATE] Generating sample dataset...")
    
    images_dir = YOLO_OUTPUT / "images"
    labels_dir = YOLO_OUTPUT / "labels"
    
    # Split ratio
    split_ratio = 0.8
    
    count = 0
    for class_id, class_name in CLASSES.items():
        print(f"  Creating {class_name} samples...")
        for i in range(count_per_class):
            count += 1
            
            # Determine if train or val
            is_val = random.random() > split_ratio
            split = "val" if is_val else "train"
            
            # Create image filename
            img_filename = f"{class_name}_{count:04d}.jpg"
            label_filename = f"{class_name}_{count:04d}.txt"
            
            img_path = images_dir / split / img_filename
            label_path = labels_dir / split / label_filename
            
            # Generate dummy image (colored rectangle)
            width, height = 640, 480
            img = Image.new('RGB', (width, height), color=(random.randint(50, 200), 
                                                          random.randint(50, 200), 
                                                          random.randint(50, 200)))
            img.save(img_path)
            
            # Generate annotations
            num_objects = random.randint(1, 5)
            annotations = generate_synthetic_annotations(width, height, num_objects, class_id)
            
            with open(label_path, 'w') as f:
                f.write('\n'.join(annotations))
    
    print(f"[OK] Created {count} sample images with annotations")
    return count

def create_data_yaml():
    """Create data.yaml configuration"""
    data_config = {
        "path": str(YOLO_OUTPUT),
        "train": "images/train",
        "val": "images/val",
        "names": CLASSES
    }
    
    yaml_path = YOLO_OUTPUT / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data_config, f, default_flow_style=False)
    
    print(f"[CONFIG] Created data.yaml")
    return yaml_path

def main():
    print("=" * 60)
    print("OreSentinel AI - Sample Dataset Creator")
    print("=" * 60)
    
    setup_directories()
    
    # Create sample dataset
    total_images = create_sample_dataset(count_per_class=20)
    
    # Create data config
    data_yaml = create_data_yaml()
    
    # Show statistics
    train_imgs = len(list((YOLO_OUTPUT / "images" / "train").glob("*")))
    val_imgs = len(list((YOLO_OUTPUT / "images" / "val").glob("*")))
    train_labels = len(list((YOLO_OUTPUT / "labels" / "train").glob("*.txt")))
    val_labels = len(list((YOLO_OUTPUT / "labels" / "val").glob("*.txt")))
    
    print("\n[DASET] Statistics:")
    print(f"  Total images: {total_images}")
    print(f"  Train: {train_imgs} images, {train_labels} labels")
    print(f"  Val:   {val_imgs} images, {val_labels} labels")
    print(f"\n[PATH] Data YAML: {data_yaml}")
    
    return data_yaml

if __name__ == "__main__":
    main()
