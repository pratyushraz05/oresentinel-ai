"""
OreSentinel AI - Rock/Mining Dataset Generator
Creates training data with realistic characteristics
"""

import os
import yaml
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

BASE_DIR = Path.home() / ".gemini" / "antigravity" / "scratch" / "oresentinel-ai"
DATASET_DIR = BASE_DIR / "ml" / "datasets" / "rocks_mining"
OUTPUT_DIR = DATASET_DIR / "yolo_dataset"

# Target classes for mining detection
CLASSES = {
    0: "rock",           # General rocks
    1: "boulder",        # Large boulders  
    2: "ore_fragment",   # Ore fragments
    3: "gravel",         # Small stones
    4: "quarry_debris",  # Quarry debris
    5: "mining_fragment" # Mining fragments
}

def setup_dirs():
    """Create directory structure"""
    dirs = [
        OUTPUT_DIR / "images" / "train",
        OUTPUT_DIR / "images" / "val",
        OUTPUT_DIR / "labels" / "train",
        OUTPUT_DIR / "labels" / "val",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    return dirs

def generate_rock_image(width: int, height: int, class_id: int) -> tuple:
    """Generate a synthetic rock image with realistic textures"""
    # Create base image (ground/scene)
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    # Generate background (soil/gravel ground)
    for y in range(height):
        for x in range(width):
            # Brownish soil color
            base_r = random.randint(120, 180)
            base_g = random.randint(100, 150)
            base_b = random.randint(70, 110)
            pixels[x, y] = (base_r, base_g, base_b)
    
    draw = ImageDraw.Draw(img)
    
    # Object size profiles based on class
    size_profiles = {
        0: {"min": 0.15, "max": 0.4},      # rock - medium
        1: {"min": 0.3, "max": 0.7},       # boulder - large
        2: {"min": 0.05, "max": 0.15},     # ore_fragment - small
        3: {"min": 0.03, "max": 0.1},      # gravel - very small
        4: {"min": 0.1, "max": 0.35},      # quarry_debris - variable
        5: {"min": 0.06, "max": 0.25}      # mining_fragment
    }
    
    profile = size_profiles.get(class_id, size_profiles[0])
    num_objects = random.randint(1, 6)
    annotations = []
    
    for _ in range(num_objects):
        obj_w = int(width * random.uniform(profile["min"], profile["max"]))
        obj_h = int(height * random.uniform(profile["min"], profile["max"]))
        
        # Random position
        x = random.randint(0, width - obj_w)
        y = random.randint(0, height - obj_h)
        
        # Draw irregular rock shape (multiple overlapping circles)
        num_patches = random.randint(3, 8)
        for _ in range(num_patches):
            cx = x + random.randint(0, obj_w)
            cy = y + random.randint(0, obj_h)
            r = random.randint(obj_w//4, obj_w//2)
            
            # Rock colors (grays, browns)
            shade = random.randint(80, 160)
            color = (shade, shade - random.randint(0, 20), shade - random.randint(0, 30))
            
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)
        
        # Normalize coordinates for YOLO format
        x_center = (x + obj_w//2) / width
        y_center = (y + obj_h//2) / height
        w_norm = obj_w / width
        h_norm = obj_h / height
        
        annotations.append(f"{class_id} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}")
    
    # Apply slight blur for realism
    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    
    return img, annotations

def create_dataset(samples_per_class: int = 30):
    """Create complete dataset"""
    print("=" * 60)
    print("OreSentinel AI - Generating Rock/Mining Dataset")
    print("=" * 60)
    
    setup_dirs()
    
    all_annotations = []
    
    # Generate samples for each class
    for class_id, class_name in CLASSES.items():
        print(f"\n[{class_id}] Creating {samples_per_class} '{class_name}' samples...")
        
        for i in range(samples_per_class):
            img, anns = generate_rock_image(640, 480, class_id)
            
            # Split into train/val (80/20)
            is_val = random.random() > 0.8
            split = "val" if is_val else "train"
            
            filename = f"{class_name}_{i+1:04d}"
            
            # Save image
            img_path = OUTPUT_DIR / "images" / split / f"{filename}.jpg"
            img.save(img_path)
            
            # Save annotation
            label_path = OUTPUT_DIR / "labels" / split / f"{filename}.txt"
            with open(label_path, 'w') as f:
                f.write('\n'.join(anns))
            
            # Count annotations in file
            with open(label_path, 'r') as f:
                num_anns = len([line for line in f.readlines() if line.strip()])
            all_annotations.extend([(label_path, is_val)] * num_anns)
        
        print(f"  [+] Created {samples_per_class} images for {class_name}")
    
    # Count results
    train_imgs = len(list((OUTPUT_DIR / "images" / "train").glob("*.jpg")))
    val_imgs = len(list((OUTPUT_DIR / "images" / "val").glob("*.jpg")))
    train_labels = len(list((OUTPUT_DIR / "labels" / "train").glob("*.txt")))
    val_labels = len(list((OUTPUT_DIR / "labels" / "val").glob("*.txt")))
    
    print("\n[DASET] Dataset Summary:")
    print(f"  Total images:  {train_imgs + val_imgs}")
    print(f"  Train:         {train_imgs} images, {train_labels} labels")
    print(f"  Val:           {val_imgs} images, {val_labels} labels")
    
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
    
    print(f"\n[CONFIG] Created: {yaml_path}")
    print(f"[PATH] Dataset ready at: {OUTPUT_DIR}")
    
    return yaml_path, train_imgs + val_imgs

if __name__ == "__main__":
    create_dataset(samples_per_class=30)
