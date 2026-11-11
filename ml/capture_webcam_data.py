"""
OreSentinel AI - Webcam Data Collector for Model Training
Captures rock/boulder images from laptop camera with interactive labeling
"""

import sys
import cv2
import numpy as np
from pathlib import Path
import os
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "ml" / "dataset"
WEBAMCAP_DIR = DATASET_DIR / "webcam_captures"
ANNOTATIONS_DIR = DATASET_DIR / "annotations"

def ensure_dirs():
    """Create necessary directories."""
    WEBAMCAP_DIR.mkdir(parents=True, exist_ok=True)
    ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nDataset Directory: {DATASET_DIR}")
    print(f"Captures will be saved to: {WEBAMCAP_DIR}")
    print(f"Annotations will be saved to: {ANNOTATIONS_DIR}\n")

def draw_box_hint(img, x, y, w, h, color=(0, 255, 0)):
    """Draw a rectangle on the frame."""
    cv2.rectangle(img, (x, y), (x + w, y + h), color, 2)
    cv2.putText(img, f"({x},{y}) ({w}x{h})", (x, max(10, y - 5)), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

class WebCamLabeler:
    def __init__(self):
        self.img_counter = 0
        self.box_counter = 0
        self.current_image = None
        self.current_image_path = None
        self.boxes = []  # List of (x, y, w, h, class_id)
        self.class_names = ["boulder", "rock"]
        self.drawing = False
        self.start_x, self.start_y = 0, 0
        
    def start_capture(self):
        """Start webcam capture and annotation."""
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("ERROR: Could not open webcam!")
            return
        
        # Set resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        print("=" * 65)
        print("   ORESENTINEL AI - WEBCAM DATA COLLECTION & LABELING")
        print("=" * 65)
        print("\nCONTROLS:")
        print("  [SPACE]        - Capture current frame")
        print("  [DRAW] Left Mouse - Draw bounding box (click & drag)")
        print("  [DEL]          - Delete last box")
        print("  [1] / [2]      - Toggle class: Boulder / Rock")
        print("  [ENTER]        - Save image with annotations")
        print("  [R]            - Reload/Restart capture")
        print("  [Q]            - Quit\n")
        print("Current Class:", self.class_names[0])
        
        current_class = 0  # 0 = boulder, 1 = rock
        
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Failed to grab frame")
                break
            
            self.current_image = frame.copy()
            h, w = frame.shape[:2]
            
            # Draw boxes
            for i, (x, y, bw, bh, cls) in enumerate(self.boxes):
                color = (0, 0, 255) if cls == 0 else (0, 255, 0)  # Red=Boulder, Green=Rock
                cv2.rectangle(frame, (x, y), (x + bw, y + bh), color, 2)
                label = f"{self.class_names[cls]} #{i+1}"
                cv2.putText(frame, label, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Show stats
            cv2.putText(frame, f"Images: {self.img_counter} | Boxes: {len(self.boxes)} | Class: {self.class_names[current_class]}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            
            cv2.imshow("OreSentinel AI - Label Collection", frame)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q'):
                break
            elif key == ord(' '):  # Space - capture frame
                self.save_current_frame()
            elif key == 13:  # Enter - save annotations
                if self.current_image_path:
                    self.save_annotations(current_class)
            elif key == ord('d') or key == ord('D'):  # DEL - delete last box
                if self.boxes:
                    self.boxes.pop()
            elif key == ord('1'):
                current_class = 0
                print("Class set to: BOULDER")
            elif key == ord('2'):
                current_class = 1
                print("Class set to: ROCK")
            elif key == ord('r') or key == ord('R'):
                self.boxes.clear()
                print("Cleared all boxes, ready for new image")
        
        cap.release()
        cv2.destroyAllWindows()
    
    def save_current_frame(self):
        """Save current frame with timestamp."""
        self.img_counter += 1
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"webcam_{timestamp}_{self.img_counter:04d}.jpg"
        self.current_image_path = WEBAMCAP_DIR / filename
        
        cv2.imwrite(str(self.current_image_path), self.current_image)
        print(f"Captured: {filename}")
        print("Draw bounding boxes, then press ENTER to save annotations.")
    
    def save_annotations(self, default_class=0):
        """Save YOLO-format annotations for current image."""
        if not self.current_image_path:
            print("No image captured! Press SPACE first.")
            return
        
        label_path = ANNOTATIONS_DIR / (self.current_image_path.stem + ".txt")
        
        with open(label_path, 'w') as f:
            for x, y, bw, bh, cls in self.boxes:
                # Convert to YOLO format (normalized center x, y, width, height)
                img_h, img_w = self.current_image.shape[:2]
                x_center = (x + bw / 2) / img_w
                y_center = (y + bh / 2) / img_h
                width_norm = bw / img_w
                height_norm = bh / img_h
                
                f.write(f"{cls} {x_center:.6f} {y_center:.6f} {width_norm:.6f} {height_norm:.6f}\n")
        
        print(f"Saved annotations: {label_path.name}")
        print(f"Total objects labeled: {len(self.boxes)}\n")
        
        # Clear for next image
        self.boxes.clear()
        self.current_image_path = None


def organize_dataset(source_dir: Path, dest_train: Path, dest_val: Path, val_ratio: float = 0.2):
    """Organize collected images into train/val split."""
    images = list(source_dir.glob("*.jpg")) + list(source_dir.glob("*.png"))
    
    if not images:
        print("No images found to organize!")
        return
    
    # Shuffle
    np.random.seed(42)
    np.random.shuffle(images)
    
    val_count = int(len(images) * val_ratio)
    train_images = images[val_count:]
    val_images = images[:val_count]
    
    # Create destination dirs
    dest_train.mkdir(parents=True, exist_ok=True)
    dest_val.mkdir(parents=True, exist_ok=True)
    (dest_train.parent / "labels" / "train").mkdir(parents=True, exist_ok=True)
    (dest_train.parent / "labels" / "val").mkdir(parents=True, exist_ok=True)
    
    def move_with_annotation(src_imgs, dst_img_dir, dst_label_dir):
        count = 0
        for img_path in src_imgs:
            # Move image
            dst_img = dst_img_dir / img_path.name
            img_path.rename(dst_img)
            
            # Move annotation if exists
            label_path = ANNOTATIONS_DIR / (img_path.stem + ".txt")
            if label_path.exists():
                dst_label = dst_label_dir / label_path.name
                label_path.rename(dst_label)
            
            count += 1
        
        return count
    
    train_count = move_with_annotation(train_images, dest_train, dest_train.parent / "labels" / "train")
    val_count = move_with_annotation(val_images, dest_val, dest_val.parent / "labels" / "val")
    
    print(f"\nDataset organized:")
    print(f"  Train: {train_count} images")
    print(f"  Val: {val_count} images")
    
    return train_count, val_count


def update_data_yaml(dataset_root: Path):
    """Update data.yaml for training."""
    yaml_content = f"""path: {str(dataset_root).replace('/', '/')}
train: images/train
val: images/val

names:
  0: boulder
  1: rock
"""
    yaml_path = dataset_root / "data.yaml"
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    print(f"Updated {yaml_path}")
    return yaml_path


if __name__ == "__main__":
    ensure_dirs()
    
    labeler = WebCamLabeler()
    labeler.start_capture()
    
    # Ask if user wants to organize dataset
    print("\n" + "=" * 65)
    response = input("Organize collected dataset into train/val split? (y/n): ").lower()
    
    if response == 'y':
        train, val = organize_dataset(WEBAMCAP_DIR, 
                                       DATASET_DIR / "images" / "train", 
                                       DATASET_DIR / "images" / "val")
        if train > 0 or val > 0:
            update_data_yaml(DATASET_DIR)
            print("\nDataset ready for training!")
