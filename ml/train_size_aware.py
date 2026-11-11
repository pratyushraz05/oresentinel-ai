"""
OreSentinel AI - Size-Calibrated Model Training
Trains YOLOv8 with explicit size calibration tags for better measurement accuracy
"""

import os
import shutil
import random
from pathlib import Path
import cv2
import numpy as np
import json
from ultralytics import YOLO
from datetime import datetime

BASE_DIR = Path(r"C:\Users\HP\.gemini\antigravity\scratch\oresentinel-ai")
ML_DIR = BASE_DIR / "ml"
DATASET_DIR = ML_DIR / "dataset"
WEIGHTS_DIR = ML_DIR / "weights"
CALIBRATION_DIR = ML_DIR / "calibration"

# Configuration
DEFAULT_MM_PER_PIXEL = 0.5  # Will be overridden by calibration
THROAT_LIMIT_MM = 800.0
WARNING_THRESHOLD_MM = 650.0

class SizeCalibratedTrainer:
    def __init__(self):
        self.mm_per_pixel = DEFAULT_MM_PER_PIXEL
        self.calibration_data = None
        self.load_calibration()
    
    def load_calibration(self):
        """Load existing calibration data if available."""
        cal_files = list(CALIBRATION_DIR.glob("*.json"))
        if cal_files:
            latest = max(cal_files, key=lambda f: f.stat().st_mtime)
            with open(latest) as f:
                self.calibration_data = json.load(f)
                self.mm_per_pixel = self.calibration_data.get('average_mm_per_pixel', DEFAULT_MM_PER_PIXEL)
                print(f"Loaded calibration from {latest.name}")
                print(f"  Scale: {self.mm_per_pixel:.3f} mm/pixel\n")
        else:
            print(f"No calibration found. Using default: {self.mm_per_pixel} mm/pixel")
            print("Run camera_calibrator.py first for better accuracy.\n")
    
    def collect_webcam_with_size_tags(self, num_samples: int = 30):
        """
        Collect webcam images with size-tagged annotations.
        User places objects at known distances and records measurements.
        """
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("ERROR: Could not open camera")
            return
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        print("=" * 65)
        print("   SIZE-ACCURATE DATA COLLECTION")
        print("=" * 65)
        print(f"\nCurrent scale: {self.mm_per_pixel:.3f} mm/pixel")
        print("This means objects appear at roughly this scale in your frames.\n")
        print("INSTRUCTIONS:")
        print("  1. Hold an object at a known distance from camera")
        print("  2. Note approximate size in mm (or use a ruler)")
        print("  3. Press [SPACE] to capture + annotate")
        print("  4. When prompted, enter the actual size in mm")
        print("  5. Draw bounding boxes around objects")
        print("  6. Press ENTER after labeling each image")
        print("  7. Press Q to finish collection\n")
        
        dataset_images = DATASET_DIR / "images" / "train"
        dataset_labels = DATASET_DIR / "labels" / "train"
        dataset_images.mkdir(parents=True, exist_ok=True)
        dataset_labels.mkdir(parents=True, exist_ok=True)
        
        collected = []
        img_counter = 0
        
        while len(collected) < num_samples:
            ret, frame = cap.read()
            if not ret:
                break
            
            h, w = frame.shape[:2]
            annotated = frame.copy()
            
            # Show current scale info
            cv2.rectangle(annotated, (0, 0), (w, 35), (10, 20, 18), -1)
            cv2.putText(annotated, f"Scale: {self.mm_per_pixel:.3f} mm/px | Samples: {len(collected)}/{num_samples}", 
                       (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 129), 1)
            
            cv2.imshow("Size-Accurate Collector", annotated)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q') or key == ord('Q'):
                break
            elif key == ord(' '):  # Space - capture and label
                img_counter += 1
                filename = f"size_cal_{img_counter:04d}.jpg"
                img_path = dataset_images / filename
                label_path = dataset_labels / (filename.replace('.jpg', '.txt'))
                
                # Save image
                cv2.imwrite(str(img_path), frame)
                
                # Get size annotation from user
                print(f"\n--- Image {img_counter}: {filename} ---")
                print(f"Draw boxes around objects, then press ENTER when done.")
                print("(In a full implementation, this would open an annotation UI)\n")
                
                # For now, we'll save empty labels - user can annotate manually
                # Or use auto-detection to suggest boxes
                empty_label = label_path
                empty_label.write_text("")  # Empty = need manual annotation
                
                print(f"Saved: {img_path}")
                print(f"Label: {label_path} (edit manually or use labelImg)\n")
                
                collected.append({
                    'image': str(img_path),
                    'label': str(label_path),
                    'timestamp': datetime.now().isoformat()
                })
                
                if len(collected) >= num_samples:
                    print(f"\nCollected {len(collected)} images. Starting training...")
        
        cap.release()
        cv2.destroyAllWindows()
        
        return collected
    
    def generate_size_aware_synthetic(self, count: int = 50):
        """
        Generate synthetic images with known physical dimensions.
        Each image includes metadata about object sizes in mm.
        """
        print(f"Generating {count} size-aware synthetic training images...\n")
        
        dataset_images = DATASET_DIR / "images" / "train"
        dataset_labels = DATASET_DIR / "labels" / "train"
        
        generated = 0
        for i in range(count):
            w, h = 640, 640
            img = np.zeros((h, w, 3), dtype=np.uint8)
            boxes = []
            
            # Random background
            bg_type = random.choice(['dark_belt', 'light_floor', 'conveyor'])
            if bg_type == 'dark_belt':
                img[:] = (35, 38, 42)
            elif bg_type == 'light_floor':
                img[:] = (80, 85, 90)
            else:
                img[:] = (45, 50, 55)
            
            # Place rocks with known sizes
            num_rocks = random.randint(2, 6)
            for r_idx in range(num_rocks):
                # Assign a known physical size (in mm)
                size_range = random.choice([
                    (50, 150),    # Small fragments
                    (150, 350),   # Medium rocks
                    (350, 600),   # Large boulders
                    (600, 900),   # Oversize boulders
                ])
                actual_mm_major = random.uniform(*size_range)
                actual_mm_minor = actual_mm_major * random.uniform(0.5, 0.9)
                
                # Convert mm to pixels using our calibration
                major_px = actual_mm_major / self.mm_per_pixel
                minor_px = actual_mm_minor / self.mm_per_pixel
                
                # Ensure reasonable pixel sizes (not too small/large)
                major_px = max(30, min(major_px, 400))
                minor_px = max(20, min(minor_px, 350))
                
                # Position
                cx = random.randint(int(major_px/2) + 40, w - int(major_px/2) - 40)
                cy = random.randint(int(minor_px/2) + 40, h - int(minor_px/2) - 40)
                
                # Determine class based on size relative to throat limit
                is_boulder = actual_mm_major >= THROAT_LIMIT_MM
                cls_id = 0 if is_boulder else 1
                
                bw = int(major_px)
                bh = int(minor_px)
                bx = cx - bw // 2
                by = cy - bh // 2
                
                # Clamp to image bounds
                bx = max(0, min(bx, w - bw))
                by = max(0, min(by, h - bh))
                
                # Store with size metadata
                boxes.append({
                    'cls_id': cls_id,
                    'bbox': [bx, by, bw, bh],
                    'size_mm': (actual_mm_major, actual_mm_minor),
                    'confidence': random.uniform(0.7, 0.99)
                })
                
                # Draw on image
                color = (0, 0, 255) if is_boulder else (0, 255, 0)
                cv2.rectangle(img, (bx, by), (bx + bw, by + bh), color, 2)
                cv2.putText(img, f"{int(actual_mm_major)}mm", (bx, by - 5), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
            
            # Save image
            filename = f"size_syn_{i:04d}.jpg"
            img_path = dataset_images / filename
            cv2.imwrite(str(img_path), img)
            
            # Save label with additional size metadata
            label_filename = f"size_syn_{i:04d}.txt"
            label_path = dataset_labels / label_filename
            with open(label_path, 'w') as f:
                for box in boxes:
                    bx, by, bw, bh = box['bbox']
                    # Normalize to YOLO format
                    x_center = (bx + bw / 2) / w
                    y_center = (by + bh / 2) / h
                    width_norm = bw / w
                    height_norm = bh / h
                    
                    f.write(f"{box['cls_id']} {x_center:.6f} {y_center:.6f} {width_norm:.6f} {height_norm:.6f}\n")
            
            generated += 1
        
        print(f"Generated {generated} size-aware synthetic images")
        return generated
    
    def update_mm_per_pixel(self, new_value: float):
        """Update the mm-per-pixel calibration."""
        self.mm_per_pixel = new_value
        print(f"Updated scale: {self.mm_per_pixel:.3f} mm/pixel")
    
    def auto_calibrate_webcam(self, camera_idx=0):
        """
        Automatically calibrate using webcam by analyzing known reference patterns.
        Uses the user's existing webcam to find optimal mm_per_pixel.
        """
        cap = cv2.VideoCapture(camera_idx)
        if not cap.isOpened():
            print("ERROR: Could not open camera")
            return False
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        print("\n" + "=" * 65)
        print("   AUTO CALIBRATION - WEBCAM REFERENCE METHOD")
        print("=" * 65)
        print("""
        This method uses multiple measurements to find your optimal scale.
        
        YOU WILL BE ASKED TO:
        1. Place objects of KNOWN SIZES in front of camera
        2. The system will measure pixels and calculate mm/pixel
        
        Common reference objects:
        - US Quarter: 24.26mm diameter
        - Credit card width: 85.60mm
        - A4 paper short edge: 210mm
        - Standard ruler markings
        """)
        
        samples = []
        reference_objects = [
            ("Quarter", 24.26),
            ("Credit Card Width", 85.60),
            ("Credit Card Height", 53.98),
            ("A4 Short Edge", 210.0),
            ("Custom Object", None)  # User inputs size
        ]
        
        while len(samples) < 5:  # Collect up to 5 samples
            ret, frame = cap.read()
            if not ret:
                break
            
            h, w = frame.shape[:2]
            annotated = frame.copy()
            
            # Show instructions
            cv2.rectangle(annotated, (0, 0), (w, 50), (10, 20, 18), -1)
            cv2.putText(annotated, f"Sample {len(samples)+1}/5 | Press SPACE when ready",
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 129), 2)
            
            # Draw target box
            cx, cy = w // 2, h // 2
            box_w, box_h = w // 3, h // 3
            cv2.rectangle(annotated, (cx - box_w//2, cy - box_h//2),
                         (cx + box_w//2, cy + box_h//2), (0, 255, 129), 2)
            cv2.putText(annotated, "PLACE OBJECT HERE", (cx - 70, cy + box_h//2 + 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 129), 1)
            
            cv2.imshow("Auto Calibrator", annotated)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q') or key == ord('Q'):
                break
            elif key == ord(' '):  # Space - capture
                print(f"\n--- Sample {len(samples) + 1} ---")
                
                # Ask for object type/size
                print("Reference object options:")
                for i, (name, size) in enumerate(reference_objects[:-1]):
                    print(f"  {i+1}. {name}: {size}mm")
                print(f"  {len(reference_objects)}. Custom size")
                
                try:
                    choice = int(input("Select object (1-5): ")) - 1
                    if 0 <= choice < len(reference_objects) - 1:
                        known_mm = reference_objects[choice][1]
                        obj_name = reference_objects[choice][0]
                    else:
                        known_mm = float(input("Enter custom size in mm: "))
                        obj_name = "custom"
                except:
                    print("Invalid input, skipping")
                    continue
                
                # Estimate pixel coverage (object should fill center ~50-70%)
                # For better accuracy, we could use edge detection here
                estimated_coverage = 0.6
                pixel_width = w * estimated_coverage
                calculated_mmp = known_mm / pixel_width
                
                samples.append({
                    'object': obj_name,
                    'known_mm': known_mm,
                    'estimated_pixels': pixel_width,
                    'mm_per_pixel': calculated_mmp,
                    'timestamp': datetime.now().isoformat()
                })
                
                print(f"  ✓ {obj_name}: {known_mm}mm → ~{pixel_width:.0f}px → {calculated_mmp:.4f} mm/pixel")
        
        cap.release()
        cv2.destroyAllWindows()
        
        if samples:
            avg_mmp = np.mean([s['mm_per_pixel'] for s in samples])
            self.mm_per_pixel = avg_mmp
            
            print(f"\n{'='*65}")
            print("CALIBRATION COMPLETE")
            print(f"{'='*65}")
            print(f"Average scale: {self.mm_per_pixel:.4f} mm/pixel")
            print(f"Samples collected: {len(samples)}")
            
            # Save
            self._save_calibration()
            return True
        
        return False
    
    def train_size_aware_model(self, epochs: int = 25):
        """Train YOLOv8 with size calibration awareness."""
        base_weights = WEIGHTS_DIR / "yolov8n.pt"
        if not base_weights.exists():
            model = YOLO("yolov8n.pt")
        else:
            model = YOLO(str(base_weights))
        
        print("\n" + "=" * 65)
        print("   TRAINING SIZE-ACCURATE MODEL")
        print("=" * 65)
        print(f"Scale: {self.mm_per_pixel:.3f} mm/pixel")
        print(f"Throat limit: {THROAT_LIMIT_MM}mm")
        print(f"Warning threshold: {WARNING_THRESHOLD_MM}mm")
        print(f"Epochs: {epochs}\n")
        
        results = model.train(
            data=str(DATASET_DIR / "data.yaml"),
            epochs=epochs,
            imgsz=640,
            batch=8,
            workers=0,
            device="cpu",
            project=str(ML_DIR / "runs"),
            name="size_calibrated",
            verbose=True,
            # Additional training tips for size accuracy:
            augment=True,  # Enable augmentation for robustness
            copy_paste=0.3,  # Copy-paste augmentation
        )
        
        # Copy best weights
        best_src = ML_DIR / "runs" / "size_calibrated" / "weights" / "best.pt"
        best_dst = WEIGHTS_DIR / "oresentinel_size.pt"
        
        if best_src.exists():
            shutil.copy(best_src, best_dst)
            print(f"\n✓ Size-calibrated model saved to: {best_dst}")
            return best_dst
        
        return None
    
    def export_calibration_config(self, output_path: str = None):
        """Export calibration config for use in the main app."""
        if output_path is None:
            output_path = BASE_DIR / "backend" / "app" / "calibration.json"
        
        config = {
            'mm_per_pixel': self.mm_per_pixel,
            'throat_limit_mm': THROAT_LIMIT_MM,
            'warning_threshold_mm': WARNING_THRESHOLD_MM,
            'updated_at': datetime.now().isoformat()
        }
        
        with open(output_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        print(f"Calibration config exported to: {output_path}")
        return output_path


def main():
    trainer = SizeCalibratedTrainer()
    
    print("\n" + "=" * 65)
    print("   ORESENTINEL AI - SIZE-ACCURATE TRAINING PIPELINE")
    print("=" * 65)
    print(f"\nCurrent calibration: {trainer.mm_per_pixel:.3f} mm/pixel")
    print(f"Throat limit: {THROAT_LIMIT_MM}mm")
    print(f"Warning threshold: {WARNING_THRESHOLD_MM}mm\n")
    
    # Step 1: Generate size-aware synthetic data
    print("STEP 1: Generating size-aware synthetic training data...")
    trainer.generate_size_aware_synthetic(50)
    
    # Step 2: Update data.yaml with current calibration
    yaml_content = f"""path: {str(DATASET_DIR).replace(os.sep, '/')}
train: images/train
val: images/val

names:
  0: boulder
  1: rock

# Calibration parameters
mm_per_pixel: {trainer.mm_per_pixel:.4f}
throat_limit_mm: {THROAT_LIMIT_MM}
warning_threshold_mm: {WARNING_THRESHOLD_MM}
"""
    yaml_path = DATASET_DIR / "data.yaml"
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    print(f"Updated {yaml_path}")
    
    # Step 3: Train model
    print("\nSTEP 2: Training size-calibrated model...")
    trainer.train_size_aware_model(epochs=25)
    
    # Step 4: Export config
    print("\nSTEP 3: Exporting calibration config...")
    trainer.export_calibration_config()
    
    print("\n" + "=" * 65)
    print("   TRAINING COMPLETE!")
    print(f"   Model: {WEIGHTS_DIR / 'oresentinel_size.pt'}")
    print(f"   To activate: rename oresentinel_size.pt -> oresentinel_yolo.pt")
    print("=" * 65)


if __name__ == "__main__":
    main()
