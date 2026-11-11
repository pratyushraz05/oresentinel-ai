"""
RoomScale AI - Photo Capture API Endpoint
Captures webcams snapshots for training data collection
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pathlib import Path
import base64
import json
from datetime import datetime
import cv2
import numpy as np
from ultralytics import YOLO
import sys

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATASET_DIR = BASE_DIR / "ml" / "dataset"
CAPTURES_DIR = DATASET_DIR / "webcam_captures"
TRAIN_IMG_DIR = DATASET_DIR / "full_train" / "images" / "train"
VAL_IMG_DIR = DATASET_DIR / "full_train" / "images" / "val"
TRAIN_LBL_DIR = DATASET_DIR / "labels" / "train"
VAL_LBL_DIR = DATASET_DIR / "labels" / "val"
CALIBRATION_FILE = BASE_DIR / "ml" / "calibration" / "active_calibration.json"
MODEL_PATH = BASE_DIR / "ml" / "weights" / "oresentinel_yolo.pt"

router = APIRouter(prefix="/api/roomscale", tags=["RoomScale"])

# Object classes
CLASS_NAMES = ["phone", "laptop", "book", "mug", "bottle", "mouse", "keyboard", "monitor", "cup", "remote"]
CLASS_MAP = {name: i for i, name in enumerate(CLASS_NAMES)}


def load_calibration():
    """Load mm_per_pixel calibration."""
    if CALIBRATION_FILE.exists():
        with open(CALIBRATION_FILE) as f:
            return json.load(f).get('mm_per_pixel', 0.2734)
    return 0.2734


def auto_label_image(img_path: Path):
    """Auto-label image using trained model."""
    if not MODEL_PATH.exists():
        return []
    
    model = YOLO(str(MODEL_PATH))
    results = model(img_path, conf=0.25, verbose=False)
    
    labels = []
    for result in results:
        boxes = result.boxes
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            
            # Get image dimensions for normalization
            img = cv2.imread(str(img_path))
            h, w = img.shape[:2]
            
            # Normalize to YOLO format
            x_center = (x1 + x2) / 2 / w
            y_center = (y1 + y2) / 2 / h
            width = (x2 - x1) / w
            height = (y2 - y1) / h
            
            labels.append(f"{cls_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
    
    return labels


@router.post("/capture-snapshot")
async def capture_snapshot(
    file: UploadFile = File(...),
    class_override: str = None
):
    """
    Save a captured snapshot to the training dataset with auto-labeling.
    Returns detection info and metadata.
    """
    try:
        # Ensure directories exist
        CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
        TRAIN_IMG_DIR.mkdir(parents=True, exist_ok=True)
        VAL_IMG_DIR.mkdir(parents=True, exist_ok=True)
        TRAIN_LBL_DIR.mkdir(parents=True, exist_ok=True)
        VAL_LBL_DIR.mkdir(parents=True, exist_ok=True)
        
        # Read image data
        contents = await file.read()
        
        # Decode and process
        img_array = np.frombuffer(contents, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode image")
        
        h, w = img.shape[:2]
        
        # Resize to standard size
        img_resized = cv2.resize(img, (640, 480))
        
        # Generate timestamp-based filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Split between train/val (90% train, 10% val)
        if len(list(TRAIN_IMG_DIR.glob("*.jpg"))) < len(list(VAL_IMG_DIR.glob("*.jpg"))) * 9:
            dest_img = TRAIN_IMG_DIR / f"snap_{timestamp}.jpg"
            dest_lbl_dir = TRAIN_LBL_DIR
        else:
            dest_img = VAL_IMG_DIR / f"snap_{timestamp}.jpg"
            dest_lbl_dir = VAL_LBL_DIR
        
        # Save original and resized versions
        cv2.imwrite(str(dest_img), img_resized)
        
        # Auto-label using model
        mm_per_pixel = load_calibration()
        labels = auto_label_image(dest_img)
        
        # If class override provided, adjust labels
        if class_override and labels:
            cls_id = CLASS_MAP.get(class_override.lower(), 0)
            # Update first detected object or create new label
            if labels:
                parts = labels[0].split()
                parts[0] = str(cls_id)
                labels[0] = " ".join(parts)
            else:
                labels.append(f"{cls_id} 0.5 0.5 0.3 0.4")
        
        # Save label file
        label_file = dest_lbl_dir / f"snap_{timestamp}.txt"
        if labels:
            label_file.write_text("\n".join(labels))
        else:
            # Create empty label file (image with no objects)
            label_file.write_text("")
        
        # Count total images
        total_train = len(list(TRAIN_IMG_DIR.glob("*.jpg")))
        total_val = len(list(VAL_IMG_DIR.glob("*.jpg")))
        
        return JSONResponse({
            "success": True,
            "message": f"Snapshot saved and labeled ({len(labels)} objects detected)",
            "filename": f"snap_{timestamp}.jpg",
            "detections": len(labels),
            "class_override": class_override,
            "mm_per_pixel": mm_per_pixel,
            "image_size": f"{w}x{h}",
            "dataset_stats": {
                "train_images": total_train,
                "val_images": total_val,
                "total": total_train + total_val
            },
            "next_steps": {
                "retrain": f"python ml/train_roomscale.py --mm-per-pixel {mm_per_pixel:.4f}",
                "measure": "python ml/webcam_measure.py --folder ml/dataset/room_images/train/"
            }
        })
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dataset-stats")
async def get_dataset_stats():
    """Get current dataset statistics."""
    try:
        train_imgs = list(TRAIN_IMG_DIR.glob("*.jpg")) + list(TRAIN_IMG_DIR.glob("*.png"))
        val_imgs = list(VAL_IMG_DIR.glob("*.jpg")) + list(VAL_IMG_DIR.glob("*.png"))
        trainlbls = list(TRAIN_LBL_DIR.glob("*.txt"))
        vallbls = list(VAL_LBL_DIR.glob("*.txt"))
        
        return {
            "train_images": len(train_imgs),
            "val_images": len(val_imgs),
            "total_images": len(train_imgs) + len(val_imgs),
            "train_labels": len(trainlbls),
            "val_labels": len(vallbls),
            "calibration_mm_per_pixel": load_calibration(),
            "model_exists": MODEL_PATH.exists(),
            "class_names": CLASS_NAMES
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-process-captures")
async def batch_process_captures():
    """Process all uncaptured images in the captures folder."""
    try:
        if not CAPTURES_DIR.exists():
            return {"processed": 0, "message": "No captures folder"}
        
        pending = list(CAPTURES_DIR.glob("*"))
        processed = 0
        
        for img_file in pending:
            if img_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                # Move to dataset and label
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                dest_img = TRAIN_IMG_DIR / f"batch_{timestamp}.jpg"
                
                img = cv2.imread(str(img_file))
                if img is not None:
                    img_resized = cv2.resize(img, (640, 480))
                    cv2.imwrite(str(dest_img), img_resized)
                    
                    # Auto-label
                    labels = auto_label_image(dest_img)
                    label_file = TRAIN_LBL_DIR / f"batch_{timestamp}.txt"
                    label_file.write_text("\n".join(labels) if labels else "")
                    
                    processed += 1
        
        return {
            "processed": processed,
            "message": f"Processed {processed} captures into training dataset"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
