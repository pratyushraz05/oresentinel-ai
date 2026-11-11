"""
RoomScale AI - General Object Size Measurement System
Trains YOLOv8 to measure ANY object in your room accurately
"""

import cv2
import numpy as np
import json
from pathlib import Path
from datetime import datetime
import random

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "ml" / "dataset"
WEIGHTS_DIR = BASE_DIR / "ml" / "weights"


# Common room objects with typical size ranges (in mm)
ROOM_OBJECTS = {
    "phone": {"size_range_mm": (140, 170), "aspect_ratio": (0.45, 0.55)},
    "laptop": {"size_range_mm": (300, 450), "aspect_ratio": (0.65, 0.75)},
    "book": {"size_range_mm": (150, 300), "aspect_ratio": (0.7, 1.0)},
    "mug": {"size_range_mm": (80, 120), "aspect_ratio": (0.8, 1.2)},
    "bottle": {"size_range_mm": (150, 350), "aspect_ratio": (0.2, 0.4)},
    "mouse": {"size_range_mm": (60, 120), "aspect_ratio": (0.4, 0.6)},
    "keyboard": {"size_range_mm": (350, 500), "aspect_ratio": (0.3, 0.45)},
    "monitor": {"size_range_mm": (400, 700), "aspect_ratio": (1.5, 2.0)},
    "cup": {"size_range_mm": (70, 110), "aspect_ratio": (0.9, 1.3)},
    "remote": {"size_range_mm": (120, 200), "aspect_ratio": (0.25, 0.4)},
}


class RoomDatasetGenerator:
    def __init__(self, mm_per_pixel: float = 0.5):
        self.mm_per_pixel = mm_per_pixel
        self.dataset_dir = DATASET_DIR
        self.image_dir = DATASET_DIR / "room_images" / "train"
        self.label_dir = DATASET_DIR / "room_labels" / "train"
        self.val_image_dir = DATASET_DIR / "room_images" / "val"
        self.val_label_dir = DATASET_DIR / "room_labels" / "val"
        
        for d in [self.image_dir, self.label_dir, self.val_image_dir, self.val_label_dir]:
            d.mkdir(parents=True, exist_ok=True)
    
    def generate_room_scene(self, scene_id: int) -> tuple[np.ndarray, list[dict]]:
        """Generate a realistic room scene with multiple objects."""
        w, h = 640, 480
        img = np.zeros((h, w, 3), dtype=np.uint8)
        
        # Random room type
        scene_type = random.choice(['desk', 'table', 'floor', 'shelf'])
        
        if scene_type == 'desk':
            # Wooden desk surface
            img[:] = (120, 90, 60)  # Brown wood
            # Add wood grain
            for _ in range(50):
                y = random.randint(0, h)
                cv2.line(img, (0, y), (w, y), 
                        (random.randint(100, 130), random.randint(75, 100), random.randint(50, 70)), 1)
            
        elif scene_type == 'table':
            # White/light table
            img[:] = (200, 200, 195)
            # Table texture
            for _ in range(30):
                x = random.randint(0, w)
                y = random.randint(0, h)
                cv2.circle(img, (x, y), random.randint(1, 3), (190, 190, 185), -1)
        
        elif scene_type == 'floor':
            # Carpet/floor
            img[:] = (80, 85, 90)
            for _ in range(100):
                x = random.randint(0, w)
                y = random.randint(0, h)
                color = (random.randint(70, 95), random.randint(75, 100), random.randint(80, 105))
                cv2.circle(img, (x, y), random.randint(2, 5), color, -1)
        
        else:  # shelf
            # Shelf background
            img[:] = (60, 55, 50)
        
        boxes = []
        num_objects = random.randint(2, 6)
        
        placed_regions = []
        
        for obj_idx in range(num_objects):
            # Pick random object type
            obj_type = random.choice(list(ROOM_OBJECTS.keys()))
            obj_config = ROOM_OBJECTS[obj_type]
            
            # Get size in mm
            size_mm = random.uniform(*obj_config["size_range_mm"])
            aspect_min, aspect_max = obj_config["aspect_ratio"]
            aspect = random.uniform(aspect_min, aspect_max)
            
            # Convert mm to pixels using calibration
            size_px = size_mm / self.mm_per_pixel
            width_px = int(size_px * min(1, aspect))
            height_px = int(size_px / max(1, aspect))
            
            # Ensure reasonable pixel sizes
            width_px = max(30, min(width_px, 250))
            height_px = max(20, min(height_px, 200))
            
            # Position with overlap checking
            max_attempts = 10
            for attempt in range(max_attempts):
                x = random.randint(width_px // 2 + 20, w - width_px // 2 - 20)
                y = random.randint(height_px // 2 + 30, h - height_px // 2 - 20)
                
                # Check overlap with existing objects
                overlap = False
                for px, py, pw, ph in placed_regions:
                    # Simple box intersection check
                    if (x - width_px//2 < px + pw//2 and 
                        x + width_px//2 > px - pw//2 and
                        y - height_px//2 < py + ph//2 and
                        y + height_px//2 > py - ph//2):
                        overlap = True
                        break
                
                if not overlap:
                    placed_regions.append((x, y, width_px, height_px))
                    break
            
            # Generate object appearance based on type
            obj_img = self._create_object(obj_type, width_px, height_px, scene_type)
            
            # Place on image
            x1, y1 = x - width_px // 2, y - height_px // 2
            x2, y2 = x1 + width_px, y1 + height_px
            
            # Handle boundaries
            if x1 < 0:
                x1, width_px = 0, x2
            if y1 < 0:
                y1, height_px = 0, y2
            if x2 > w:
                width_px = w - x1
            if y2 > h:
                height_px = h - y1
            
            if width_px > 0 and height_px > 0:
                # Create shadow
                shadow_offset = 5
                shadow_pts = []
                # Simplified shadow - just draw under object
                cv2.rectangle(img, (x1 + shadow_offset, y1 + shadow_offset),
                             (x1 + width_px + shadow_offset, y1 + height_px + shadow_offset),
                             (20, 20, 20), -1)
                
                # Draw object
                img[y1:y1+height_px, x1:x1+width_px] = obj_img
                
                # Store box info
                boxes.append({
                    'class': obj_type,
                    'bbox': [x1, y1, width_px, height_px],
                    'size_mm': size_mm,
                    'actual_pixels': (width_px, height_px)
                })
        
        return img, boxes
    
    def _create_object(self, obj_type: str, width: int, height: int, bg_type: str) -> np.ndarray:
        """Create a synthetic representation of a room object."""
        obj = np.zeros((height, width, 3), dtype=np.uint8)
        
        if obj_type == 'phone':
            # Smartphone shape
            color = (30, 30, 35)  # Dark phone
            obj[:] = color
            # Screen
            screen_h = int(height * 0.85)
            screen_w = int(width * 0.9)
            sx, sy = (width - screen_w) // 2, (height - screen_h) // 2
            obj[sy:sy+screen_h, sx:sx+screen_w] = (20, 40, 80)  # Blue-ish screen
            # Camera dot
            cv2.circle(obj, (width // 2, 8), 3, (50, 50, 50), -1)
        
        elif obj_type == 'laptop':
            # Laptop from above
            color = (100, 100, 110)
            obj[:] = color
            # Screen area
            screen_h = int(height * 0.7)
            obj[:screen_h, :] = (60, 60, 70)
            # Keyboard area
            kb_y = int(height * 0.75)
            obj[kb_y:, :] = (80, 80, 90)
        
        elif obj_type == 'book':
            # Book/spine view
            colors = [(180, 50, 50), (50, 100, 180), (50, 150, 50), (180, 150, 50)]
            obj[:] = random.choice(colors)
            # Spine detail
            cv2.rectangle(obj, (5, 5), (width-5, height-5), (0, 0, 0), 2)
            # Title lines
            for i in range(3):
                y = int(height * 0.3) + i * int(height * 0.2)
                cv2.line(obj, (int(width*0.2), y), (int(width*0.8), y), (255, 255, 255), 2)
        
        elif obj_type == 'mug' or obj_type == 'cup':
            # Cylinder shape
            color = (220, 220, 210)  # White ceramic
            obj[:] = color
            # Rim
            cv2.ellipse(obj, (width//2, 10), (width//2 - 5, 8), 0, 0, 360, (180, 180, 170), 2)
            # Handle
            cv2.ellipse(obj, (width - 15, height//2), (10, 15), -90, -90, 90, (180, 180, 170), 2)
        
        elif obj_type == 'bottle':
            # Bottle shape
            color = (100, 150, 100)  # Green bottle
            obj[:] = color
            # Label
            label_y = int(height * 0.3)
            obj[label_y:label_y+int(height*0.3), :] = (200, 200, 180)
            # Cap
            cap_color = (200, 50, 50)
            obj[:10, :] = cap_color
        
        elif obj_type == 'mouse':
            # Computer mouse
            color = (40, 40, 45)
            obj[:] = color
            # Scroll wheel
            cv2.ellipse(obj, (width//2, int(height*0.3)), (8, 12), 0, 0, 360, (80, 80, 85), -1)
        
        elif obj_type == 'keyboard':
            # Keyboard
            color = (50, 50, 55)
            obj[:] = color
            # Keys rows
            for row in range(4):
                y = int(height * 0.2) + row * int(height * 0.2)
                for col in range(8):
                    x = int(width * 0.1) + col * int(width * 0.11)
                    cv2.rectangle(obj, (x, y), (x + int(width*0.08), y + int(height*0.12)), (70, 70, 75), -1)
        
        elif obj_type == 'monitor':
            # Monitor/screen
            color = (30, 30, 35)
            obj[:] = color
            # Screen
            screen_margins = 15
            obj[screen_margins:-screen_margins, screen_margins:-screen_margins] = (20, 30, 50)
            # Stand
            cv2.rectangle(obj, (width//2 - 20, height - 30), (width//2 + 20, height), (50, 50, 55), -1)
        
        elif obj_type == 'remote':
            # Remote control
            color = (40, 40, 45)
            obj[:] = color
            # Buttons
            for row in range(5):
                for col in range(3):
                    bx = int(width * 0.2) + col * int(width * 0.25)
                    by = int(height * 0.2) + row * int(height * 0.15)
                    cv2.circle(obj, (bx, by), 6, (60, 60, 65), -1)
        
        else:
            # Generic object
            colors = [(150, 100, 80), (100, 120, 150), (120, 80, 120)]
            obj[:] = random.choice(colors)
        
        return obj
    
    def generate_dataset(self, num_images: int = 100):
        """Generate full dataset with images and annotations."""
        print(f"Generating {num_images} room scene images...")
        print(f"Using scale: {self.mm_per_pixel:.3f} mm/pixel\n")
        
        total_objects = 0
        object_counts = {obj: 0 for obj in ROOM_OBJECTS.keys()}
        
        for i in range(num_images):
            img, boxes = self.generate_room_scene(i)
            
            split = "train" if i < num_images * 0.8 else "val"
            img_dir = self.image_dir if split == "train" else self.val_image_dir
            label_dir = self.label_dir if split == "train" else self.val_label_dir
            
            # Save image
            filename = f"room_{i:04d}.jpg"
            cv2.imwrite(str(img_dir / filename), img)
            
            # Save annotations
            label_filename = f"room_{i:04d}.txt"
            with open(label_dir / label_filename, 'w') as f:
                for box in boxes:
                    x1, y1, bw, bh = box['bbox']
                    
                    # Normalize to YOLO format
                    x_center = (x1 + bw / 2) / img.shape[1]
                    y_center = (y1 + bh / 2) / img.shape[0]
                    width_norm = bw / img.shape[1]
                    height_norm = bh / img.shape[0]
                    
                    # Map class name to ID
                    class_id = list(ROOM_OBJECTS.keys()).index(box['class'])
                    
                    f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {width_norm:.6f} {height_norm:.6f}\n")
                    
                    object_counts[box['class']] += 1
                    total_objects += 1
            
            if (i + 1) % 20 == 0:
                print(f"  Generated {i + 1}/{num_images} images, {total_objects} objects...")
        
        print(f"\n[OK] Dataset complete!")
        print(f"  Total images: {num_images}")
        print(f"  Total objects: {total_objects}")
        print(f"  Objects per class:")
        for cls, count in object_counts.items():
            print(f"    {cls}: {count}")
        
        return num_images, total_objects
    
    def update_data_yaml(self):
        """Update data.yaml for training."""
        yaml_content = f"""path: {str(DATASET_DIR).replace('/', '/')}
train: room_images/train
val: room_images/val

names:
"""
        for i, obj_name in enumerate(ROOM_OBJECTS.keys()):
            yaml_content += f"  {i}: {obj_name}\n"
        
        yaml_path = DATASET_DIR / "data.yaml"
        with open(yaml_path, 'w') as f:
            f.write(yaml_content)
        
        print(f"Updated {yaml_path}")
        return yaml_path


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='RoomScale AI Dataset Generator')
    parser.add_argument('--mm-per-pixel', type=float, default=0.5, help='mm per pixel scale')
    parser.add_argument('--count', type=int, default=100, help='Number of images to generate')
    args = parser.parse_args()
    
    generator = RoomDatasetGenerator(mm_per_pixel=args.mm_per_pixel)
    generator.generate_dataset(args.count)
    generator.update_data_yaml()
    
    print("\n" + "=" * 65)
    print("Dataset ready for training!")
    print(f"Location: {DATASET_DIR}")
    print("=" * 65)
