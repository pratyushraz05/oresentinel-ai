"""
RoomScale AI - Interactive Room Object Annotation Tool
Capture photos of objects in your room and annotate them for training
"""

import cv2
import numpy as np
import json
from pathlib import Path
from datetime import datetime
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "ml" / "dataset"
WEB_CAPTURE_DIR = DATASET_DIR / "web_captures"
ANNOTATIONS_DIR = DATASET_DIR / "annotations"

# Available object classes for labeling
OBJECT_CLASSES = [
    ("phone", "Smartphone"),
    ("laptop", "Laptop"),
    ("book", "Book"),
    ("mug", "Mug/Cup"),
    ("bottle", "Bottle"),
    ("mouse", "Computer Mouse"),
    ("keyboard", "Keyboard"),
    ("monitor", "Monitor/Screen"),
    ("remote", "Remote Control"),
    ("box", "Box/Container"),
    ("pen", "Pen/Pencil"),
    ("glasses", "Glasses/Sunglasses"),
    ("watch", "Watch"),
    ("key", "Key"),
    ("other", "Other Object"),
]


class RoomLabeler:
    def __init__(self):
        self.current_image = None
        self.current_image_path = None
        self.boxes = []  # List of (x, y, w, h, class_index)
        self.drawing = False
        self.start_x, self.start_y = 0, 0
        self.selected_class = 0
        self.img_counter = 0
        self.classes = OBJECT_CLASSES
        
        WEB_CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
        ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    
    def start_session(self):
        """Start interactive labeling session."""
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("ERROR: Could not open webcam!")
            return
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        print("\n" + "=" * 65)
        print("   ROOMSCALE AI - INTERACTIVE OBJECT LABELER")
        print("=" * 65)
        print("\nCONTROLS:")
        print("  [SPACE]         - Capture current frame")
        print("  [Click+Drag]    - Draw bounding box")
        print("  [C]             - Cycle through object classes")
        print("  [Enter]         - Save current image annotations")
        print("  [DEL]           - Delete last box")
        print("  [R]             - Reload/restart capture")
        print("  [Q]             - Quit and finalize\n")
        print(f"Current class: {self.classes[self.selected_class][1]} ({self.selected_class})\n")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            self.current_image = frame.copy()
            h, w = frame.shape[:2]
            
            # Draw all boxes
            for i, (x, y, bw, bh, cls_idx) in enumerate(self.boxes):
                color = self._get_class_color(cls_idx)
                cv2.rectangle(frame, (x, y), (x + bw, y + bh), color, 2)
                label = f"{self.classes[cls_idx][1][:8]}"
                cv2.putText(frame, label, (x, max(10, y - 5)), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Show HUD
            cv2.rectangle(frame, (0, 0), (w, 45), (10, 20, 18), -1)
            cv2.putText(frame, f"Objects: {len(self.boxes)} | Class: {self.classes[self.selected_class][1]}", 
                       (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 129), 2)
            
            cv2.imshow("RoomScale AI - Labeler", frame)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q') or key == ord('Q'):
                break
            elif key == ord(' '):  # Space - capture
                self.capture_frame()
            elif key == 13:  # Enter - save
                if self.current_image_path:
                    self.save_annotations()
            elif key == ord('c') or key == ord('C'):  # Cycle class
                self.selected_class = (self.selected_class + 1) % len(self.classes)
                print(f"Class changed to: {self.classes[self.selected_class][1]}")
            elif key == 127 or key == 8:  # DEL - delete last
                if self.boxes:
                    self.boxes.pop()
                    print("Deleted last box")
            elif key == ord('r') or key == ord('R'):
                self.boxes.clear()
                self.current_image_path = None
                print("Cleared all boxes")
        
        cap.release()
        cv2.destroyAllWindows()
    
    def capture_frame(self):
        """Save current camera frame."""
        self.img_counter += 1
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"room_{timestamp}_{self.img_counter:04d}.jpg"
        self.current_image_path = WEB_CAPTURE_DIR / filename
        
        cv2.imwrite(str(self.current_image_path), self.current_image)
        print(f"\nCaptured: {filename}")
        print("Draw boxes around objects, then press ENTER to save.")
    
    def save_annotations(self):
        """Save YOLO-format annotations."""
        if not self.current_image_path:
            print("No image captured! Press SPACE first.")
            return
        
        label_path = ANNOTATIONS_DIR / (self.current_image_path.stem + ".txt")
        h, w = self.current_image.shape[:2]
        
        with open(label_path, 'w') as f:
            for x, y, bw, bh, cls_idx in self.boxes:
                x_center = (x + bw / 2) / w
                y_center = (y + bh / 2) / h
                width_norm = bw / w
                height_norm = bh / h
                
                f.write(f"{cls_idx} {x_center:.6f} {y_center:.6f} {width_norm:.6f} {height_norm:.6f}\n")
        
        print(f"Saved annotations: {label_path.name} ({len(self.boxes)} objects)")
        
        # Clear for next image
        self.boxes.clear()
        self.current_image_path = None
    
    def _get_class_color(self, class_idx: int) -> tuple:
        """Get consistent color for each class."""
        colors = [
            (0, 0, 255),      # Red - phone
            (255, 0, 0),      # Blue - laptop
            (0, 255, 0),      # Green - book
            (0, 255, 255),    # Cyan - mug
            (255, 0, 255),    # Magenta - bottle
            (255, 255, 0),    # Yellow - mouse
            (128, 0, 0),      # Maroon - keyboard
            (0, 128, 0),      # Forest - monitor
            (0, 0, 128),      # Navy - remote
            (128, 128, 0),    # Olive - box
            (128, 0, 128),    # Purple - pen
            (0, 128, 128),    # Teal - glasses
            (200, 150, 100),  # Tan - watch
            (100, 150, 200),  # Steel - key
            (150, 150, 150),  # Gray - other
        ]
        return colors[class_idx % len(colors)]
    
    def organize_dataset(self, val_ratio: float = 0.2):
        """Organize web captures into train/val splits."""
        images = list(WEB_CAPTURE_DIR.glob("*.jpg")) + list(WEB_CAPTURE_DIR.glob("*.png"))
        
        if not images:
            print("No images found to organize!")
            return 0, 0
        
        np.random.seed(42)
        np.random.shuffle(images)
        
        val_count = int(len(images) * val_ratio)
        train_images = images[val_count:]
        val_images = images[:val_count]
        
        target_train_img = DATASET_DIR / "room_images" / "train"
        target_val_img = DATASET_DIR / "room_images" / "val"
        target_train_lbl = DATASET_DIR / "room_labels" / "train"
        target_val_lbl = DATASET_DIR / "room_labels" / "val"
        
        for d in [target_train_img, target_val_img, target_train_lbl, target_val_lbl]:
            d.mkdir(parents=True, exist_ok=True)
        
        import shutil
        copied = 0
        
        def copy_split(imgs, img_dir, lbl_dir):
            count = 0
            for img_path in imgs:
                shutil.copy(img_path, img_dir / img_path.name)
                lbl_path = ANNOTATIONS_DIR / (img_path.stem + ".txt")
                if lbl_path.exists():
                    shutil.copy(lbl_path, lbl_dir / lbl_path.name)
                count += 1
            return count
        
        train_count = copy_split(train_images, target_train_img, target_train_lbl)
        val_count = copy_split(val_images, target_val_img, target_val_lbl)
        
        print(f"\nOrganized dataset:")
        print(f"  Train: {train_count} images")
        print(f"  Val: {val_count} images")
        
        return train_count, val_count


def main():
    labeler = RoomLabeler()
    labeler.start_session()
    
    print("\n" + "=" * 65)
    response = input("Organize collected images into train/val split? (y/n): ").lower()
    
    if response == 'y':
        train, val = labeler.organize_dataset()
        if train > 0:
            print(f"\n✓ Ready for training!")
            print(f"  Images: {train + val}")
            print(f"  Location: ml/dataset/room_images/")


if __name__ == "__main__":
    main()
