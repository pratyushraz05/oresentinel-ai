"""
OreSentinel AI - Collect Real Rock/Mining Images
Downloads images from Unsplash (free, no auth needed)
Creates synthetic annotations as placeholders
"""

import os
import yaml
from pathlib import Path
import requests
from PIL import Image
import random
import json
import time

BASE_DIR = Path.home() / ".gemini" / "antigravity" / "scratch" / "oresentinel-ai"
DATASET_DIR = BASE_DIR / "ml" / "datasets" / "rocks_mining"
OUTPUT_DIR = DATASET_DIR / "yolo_dataset"
RAW_DIR = DATASET_DIR / "raw_images"

# Target classes
CLASSES = {
    0: "rock",
    1: "boulder", 
    2: "ore_fragment",
    3: "gravel",
    4: "quarry_debris",
    5: "mining_fragment"
}

# Unsplash search queries for each class
UNSPLASH_QUERIES = {
    "rock": ["rock formation", "stone", "pebble", "granite"],
    "boulder": ["large boulder", "boulder field", "mountain rock"],
    "ore_fragment": ["ore sample", "mineral specimen", "rock fragment"],
    "gravel": ["gravel road", "crushed stone", "gravel pit"],
    "quarry_debris": ["quarry site", "mine debris", "rock rubble"],
    "mining_fragment": ["mining equipment", "ore processing", "crushed ore"]
}

def setup_dirs():
    """Create directory structure"""
    dirs = [
        OUTPUT_DIR / "images" / "train",
        OUTPUT_DIR / "images" / "val",
        OUTPUT_DIR / "labels" / "train",
        OUTPUT_DIR / "labels" / "val",
        RAW_DIR
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    return dirs

def download_unsplash_image(query: str, save_path: Path, count: int = 15):
    """Download images from Unsplash using their source API"""
    downloaded = 0
    
    for i in range(count):
        try:
            # Unsplash random image by keyword
            url = f"https://source.unsplash.com/640x480/?{query.replace(' ', ',')}&sig={random.randint(1,9999)}"
            
            response = requests.get(url, timeout=30, stream=True)
            if response.status_code == 200:
                img = Image.open(response.content)
                img = img.convert('RGB')
                
                filename = f"{save_path.stem}_{i+1:03d}.jpg"
                img.save(save_path.parent / filename)
                downloaded += 1
                print(f"  [+] Downloaded: {filename}")
            
            time.sleep(0.5)  # Rate limiting
            
        except Exception as e:
            print(f"  [!] Failed: {e}")
            continue
    
    return downloaded

def generate_realistic_annotations(img_width: int, img_height: int, 
                                    class_id: int, num_objects: int) -> list:
    """Generate realistic YOLO annotations based on object type"""
    annotations = []
    
    # Different size profiles for different classes
    size_profiles = {
        0: {"min_w": 0.15, "max_w": 0.6, "min_h": 0.1, "max_h": 0.5},  # rocks - medium
        1: {"min_w": 0.3, "max_w": 0.8, "min_h": 0.2, "max_h": 0.6},  # boulders - large
        2: {"min_w": 0.05, "max_w": 0.2, "min_h": 0.05, "max_h": 0.15},  # ore fragments - small
        3: {"min_w": 0.03, "max_w": 0.15, "min_h": 0.03, "max_h": 0.1},  # gravel - very small
        4: {"min_w": 0.1, "max_w": 0.5, "min_h": 0.08, "max_h": 0.4},  # quarry debris - variable
        5: {"min_w": 0.08, "max_w": 0.4, "min_h": 0.06, "max_h": 0.3}   # mining fragments
    }
    
    profile = size_profiles.get(class_id, size_profiles[0])
    
    for _ in range(num_objects):
        x_center = random.uniform(profile["min_w"]/2, 1 - profile["min_w"]/2)
        y_center = random.uniform(profile["min_h"]/2, 1 - profile["min_h"]/2)
        width = random.uniform(profile["min_w"], profile["max_w"])
        height = random.uniform(profile["min_h"], profile["max_h"])
        
        # Ensure bounds
        x_center = max(0, min(1, x_center))
        y_center = max(0, min(1, y_center))
        width = max(0, min(1 - x_center, width))
        height = max(0, min(1 - y_center, height))
        
        annotations.append(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
    
    return annotations

def collect_dataset():
    """Main collection process"""
    print("=" * 60)
    print("OreSentinel AI - Rock/Mining Dataset Collector")
    print("=" * 60)
    
    setup_dirs()
    
    total_downloaded = 0
    total_images = 0
    
    # Download images for each class
    for class_id, class_name in CLASSES.items():
        print(f"\n[{class_id}] Collecting '{class_name}' images...")
        
        query = UNSPLASH_QUERIES[class_name][0]  # Primary query
        save_dir = RAW_DIR / class_name
        
        downloaded = download_unsplash_image(query, save_dir, count=10)
        total_downloaded += downloaded
        total_images += downloaded
        
        print(f"     Downloaded {downloaded} images for {class_name}")
    
    # Organize into train/val split
    print("\n[ORGANIZE] Splitting into train/val sets...")
    
    all_images = []
    for class_name in CLASSES.keys():
        class_dir = RAW_DIR / class_name
        if class_dir.exists():
            for img in class_dir.glob("*.jpg"):
                all_images.append((img, class_name))
    
    random.shuffle(all_images)
    
    # 80/20 split
    split_point = int(len(all_images) * 0.8)
    train_images = all_images[:split_point]
    val_images = all_images[split_point:]
    
    # Copy and annotate
    print("[ANNOTATE] Creating YOLO-format annotations...")
    
    for idx, (img_path, class_name) in enumerate(train_images + val_images):
        is_val = idx >= split_point
        split = "val" if is_val else "train"
        
        # Move/copy to output
        target_img = OUTPUT_DIR / "images" / split / img_path.name
        target_lbl = OUTPUT_DIR / "labels" / split / f"{img_path.stem}.txt"
        
        # Copy image
        img = Image.open(img_path)
        img = img.convert('RGB')
        img.save(target_img)
        
        # Create annotation
        class_id = CLASSES.get_next_index(lambda k, v: v == class_name) if False else next(k for k, v in CLASSES.items() if v == class_name)
        num_objects = random.randint(1, 8)
        annotations = generate_realistic_annotations(
            img.width, img.height, class_id, num_objects
        )
        
        with open(target_lbl, 'w') as f:
            f.write('\n'.join(annotations))
    
    print(f"\n[OK] Total images collected: {len(all_images)}")
    print(f"      Train: {len(train_images)}")
    print(f"      Val: {len(val_images)}")
    
    # Create data.yaml
    data_config = {
        "path": str(OUTPUT_DIR),
        "train": "images/train",
        "val": "images/val",
        "names": CLASSES
    }
    
    yaml_path = OUTPUT_DIR / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(data_config, f, default_flow_style=False)
    
    print(f"[CONFIG] Created: {yaml_path}")
    return yaml_path, len(all_images)

if __name__ == "__main__":
    collect_dataset()
