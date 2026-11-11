"""
RoomScale AI - Photo Collection Script
Process photos from your room and prepare them for training
"""

import argparse
import shutil
import cv2
import numpy as np
from pathlib import Path
import random
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "ml" / "dataset"
USER_PHOTOS_DIR = DATASET_DIR / "user_photos"


def analyze_photo(photo_path: Path):
    """Analyze a photo and suggest improvements."""
    img = cv2.imread(str(photo_path))
    if img is None:
        return None
    
    h, w = img.shape[:2]
    issues = []
    
    # Check resolution
    if w < 640 or h < 480:
        issues.append("Low resolution")
    
    # Check brightness
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean_brightness = np.mean(gray)
    if mean_brightness < 30:
        issues.append("Too dark")
    elif mean_brightness > 220:
        issues.append("Overexposed")
    
    # Check sharpness (Laplacian variance)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if lap_var < 50:
        issues.append("Blurry")
    
    return {
        'path': str(photo_path),
        'size': f"{w}x{h}",
        'brightness': round(mean_brightness, 1),
        'sharpness': round(lap_var, 1),
        'issues': issues
    }


def auto_label_photo(photo_path: Path, output_dir: Path, class_name: str = None):
    """
    Auto-label a photo by detecting objects.
    Uses simple color/edge detection to suggest bounding boxes.
    Returns list of (x, y, w, h, class_id) tuples.
    """
    img = cv2.imread(str(photo_path))
    if img is None:
        return []
    
    h, w = img.shape[:2]
    labels = []
    
    # Convert to grayscale and detect edges
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Filter and collect significant contours
    detected_boxes = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 10000:  # Minimum area
            x, y, bw, bh = cv2.boundingRect(cnt)
            
            # Skip border-touching boxes (likely background)
            if x < 20 or y < 20 or (x + bw) > (w - 20) or (y + bh) > (h - 20):
                continue
            
            # Check aspect ratio
            aspect = bw / max(1, bh)
            if 0.3 < aspect < 3.0:  # Reasonable object shape
                detected_boxes.append((x, y, bw, bh, area))
    
    # Sort by size (largest first)
    detected_boxes.sort(key=lambda x: x[4], reverse=True)
    
    # Assign classes based on size heuristics
    class_map = {
        'phone': (50, 100),      # pixels wide
        'laptop': (150, 300),
        'book': (80, 200),
        'mug': (40, 100),
        'bottle': (30, 150),
        'mouse': (30, 80),
        'keyboard': (150, 400),
        'monitor': (200, 500),
        'cup': (30, 80),
        'remote': (40, 120),
    }
    
    # If user specified class, use that for largest objects
    if class_name and class_name in class_map:
        min_w, max_w = class_map[class_name]
        for i, (x, y, bw, bh, area) in enumerate(detected_boxes[:5]):
            if min_w <= bw <= max_w:
                class_id = list(class_map.keys()).index(class_name) if class_name in class_map else 0
                labels.append((x, y, bw, bh, class_id))
    else:
        # Auto-detect based on size
        for i, (x, y, bw, bh, area) in enumerate(detected_boxes[:10]):
            if bw > 200:
                cls = 7  # monitor
            elif bw > 150:
                cls = 6  # keyboard/laptop
            elif bw > 100:
                cls = 2  # book
            elif bw > 60:
                cls = 0  # phone
            else:
                cls = 9  # remote/cup/mouse
            
            labels.append((x, y, bw, bh, cls))
    
    return labels


def process_user_photos(input_folder: str, max_photos: int = 30):
    """Process photos from user's folder."""
    input_path = Path(input_folder)
    
    if not input_path.exists():
        print(f"ERROR: Folder not found: {input_path}")
        return
    
    # Get all image files
    images = list(input_path.glob("*.jpg")) + list(input_path.glob("*.jpeg"))
    images += list(input_path.glob("*.png"))
    images += list(input_path.glob("*.webp"))
    
    if not images:
        print(f"No images found in {input_path}")
        return
    
    print(f"Found {len(images)} photos in {input_path}")
    
    # Limit to max_photos
    if len(images) > max_photos:
        random.seed(42)
        images = random.sample(images, max_photos)
        print(f"Using {len(images)} photos (limited from {len(images)})")
    
    # Create output directories
    train_img_dir = DATASET_DIR / "room_images" / "train"
    val_img_dir = DATASET_DIR / "room_images" / "val"
    train_lbl_dir = DATASET_DIR / "labels" / "train"
    val_lbl_dir = DATASET_DIR / "labels" / "val"
    
    for d in [train_img_dir, val_img_dir, train_lbl_dir, val_lbl_dir]:
        d.mkdir(parents=True, exist_ok=True)
    
    processed = 0
    for i, photo_path in enumerate(images):
        print(f"\nProcessing [{i+1}/{len(images)}]: {photo_path.name}")
        
        # Analyze
        analysis = analyze_photo(photo_path)
        if analysis:
            print(f"  Size: {analysis['size']}, Brightness: {analysis['brightness']}%, Sharpness: {analysis['sharpness']}")
            if analysis['issues']:
                print(f"  Issues: {', '.join(analysis['issues'])}")
        
        # Copy to dataset
        new_name = f"user_{processed:04d}_{photo_path.stem}.jpg"
        
        split = "train" if processed < int(len(images) * 0.8) else "val"
        if split == "train":
            dest_img = train_img_dir / new_name
            dest_lbl_dir = train_lbl_dir
        else:
            dest_img = val_img_dir / new_name
            dest_lbl_dir = val_lbl_dir
        
        # Resize to standard 640x480
        img = cv2.imread(str(photo_path))
        if img is not None:
            img_resized = cv2.resize(img, (640, 480))
            cv2.imwrite(str(dest_img), img_resized)
            processed += 1
            
            # Auto-generate labels
            labels = auto_label_photo(photo_path, dest_lbl_dir)
            
            if labels:
                label_file = dest_lbl_dir / (new_name.replace('.jpg', '.txt'))
                with open(label_file, 'w') as f:
                    for x, y, bw, bh, cls in labels:
                        # Normalize to YOLO format
                        x_center = (x + bw/2) / 640
                        y_center = (y + bh/2) / 480
                        w_norm = bw / 640
                        h_norm = bh / 480
                        f.write(f"{cls} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")
                print(f"  Generated {len(labels)} labels")
            else:
                print(f"  Could not auto-label, creating empty label file")
                # Create empty label file (no objects)
                label_file = dest_lbl_dir / (new_name.replace('.jpg', '.txt'))
                label_file.write_text("")
        else:
            print(f"  ERROR: Could not read image")
    
    print(f"\n{'='*65}")
    print(f"PROCESSED {processed} photos")
    print(f"Train: {len(list(train_img_dir.glob('*.jpg')))} images")
    print(f"Val: {len(list(val_img_dir.glob('*.jpg')))} images")
    print(f"{'='*65}")
    
    return processed


def main():
    parser = argparse.ArgumentParser(description='RoomScale Photo Collector')
    parser.add_argument('--input', type=str, required=True, help='Path to folder with photos')
    parser.add_argument('--max', type=int, default=30, help='Maximum photos to process')
    args = parser.parse_args()
    
    print("=" * 65)
    print("   ROOMSCALE AI - PHOTO COLLECTION")
    print("=" * 65)
    
    process_user_photos(args.input, args.max)
    
    print("\nNext steps:")
    print("  1. Review the processed photos in ml/dataset/room_images/")
    print("  2. Retrain with: python ml/train_roomscale.py --mm-per-pixel 0.2734")
    print("  3. Test with: python ml/webcam_measure.py --folder ml/dataset/room_images/train/")


if __name__ == "__main__":
    main()
