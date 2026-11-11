"""
RoomScale AI - Batch Measurement Script
Measure objects from saved images (no display required)
"""

import sys
import cv2
import numpy as np
from pathlib import Path
from ultralytics import YOLO
import json
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "ml" / "weights" / "oresentinel_yolo.pt"
CALIBRATION_FILE = BASE_DIR / "ml" / "calibration" / "active_calibration.json"
OUTPUT_DIR = BASE_DIR / "ml" / "measurement_results"


def load_calibration():
    """Load mm_per_pixel from calibration file."""
    if CALIBRATION_FILE.exists():
        with open(CALIBRATION_FILE) as f:
            data = json.load(f)
            return data.get('mm_per_pixel', 0.2734)
    return 0.2734


def measure_and_save(image_path, mm_per_pixel):
    """Run inference on image and save annotated result."""
    # Load model
    model = YOLO(str(MODEL_PATH))
    
    # Run inference
    results = model(image_path, conf=0.25, verbose=False)
    
    # Read original image
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"ERROR: Could not read {image_path}")
        return None
    
    h, w = img.shape[:2]
    annotations = []
    
    # Process each detection
    for result in results:
        boxes = result.boxes
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            
            # Get class name
            class_names = result.names
            cls_name = class_names.get(cls_id, f"class_{cls_id}")
            
            # Measure in mm
            width_px = x2 - x1
            height_px = y2 - y1
            width_mm = width_px * mm_per_pixel
            height_mm = height_px * mm_per_pixel
            
            # Draw bounding box
            color = (0, 255, 0)
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            
            # Draw label
            label = f"{cls_name}: {int(width_mm)}x{int(height_mm)}mm ({conf:.0%})"
            cv2.putText(img, label, (x1, max(10, y1 - 10)), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Store annotation
            annotations.append({
                'class': cls_name,
                'confidence': conf,
                'bbox_pixels': [x1, y1, x2, y2],
                'size_mm': [width_mm, height_mm],
                'center_px': [(x1+x2)//2, (y1+y2)//2]
            })
    
    # Save result
    output_path = OUTPUT_DIR / f"{image_path.stem}_measured.jpg"
    cv2.imwrite(str(output_path), img)
    
    return {
        'original': str(image_path),
        'output': str(output_path),
        'detections': annotations,
        'scale': mm_per_pixel
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description='RoomScale Measurement Tool')
    parser.add_argument('--image', type=str, help='Single image to measure')
    parser.add_argument('--folder', type=str, help='Folder of images to measure')
    parser.add_argument('--webcam', action='store_true', help='Use webcam snapshots')
    args = parser.parse_args()
    
    print("=" * 65)
    print("   ROOMSCALE AI - MEASUREMENT TOOL")
    print("=" * 65)
    
    # Load calibration
    mm_per_pixel = load_calibration()
    print(f"\nCalibration: {mm_per_pixel:.4f} mm/pixel")
    print(f"1 cm ≈ {10/mm_per_pixel:.1f} pixels\n")
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Mode 1: Single image
    if args.image:
        print(f"Measuring: {args.image}")
        result = measure_and_save(args.image, mm_per_pixel)
        if result:
            print(f"\nResults saved to: {result['output']}")
            print(f"Detections: {len(result['detections'])}")
            for d in result['detections']:
                print(f"  - {d['class']}: {int(d['size_mm'][0])}x{int(d['size_mm'][1])}mm")
        return
    
    # Mode 2: Folder of images
    if args.folder:
        folder = Path(args.folder)
        images = list(folder.glob("*.jpg")) + list(folder.glob("*.png"))
        
        if not images:
            print(f"No images found in {folder}")
            return
        
        print(f"Found {len(images)} images in {folder}")
        
        all_results = []
        for i, img_path in enumerate(images):
            print(f"\n[{i+1}/{len(images)}] Measuring {img_path.name}...")
            result = measure_and_save(img_path, mm_per_pixel)
            if result:
                all_results.append(result)
                print(f"  Saved: {Path(result['output']).name}")
                print(f"  Found {len(result['detections'])} objects")
        
        # Save summary
        summary_path = OUTPUT_DIR / "measurement_summary.json"
        with open(summary_path, 'w') as f:
            json.dump(all_results, f, indent=2)
        
        print(f"\n{'='*65}")
        print(f"SUMMARY: Measured {len(all_results)} images")
        print(f"Results saved to: {OUTPUT_DIR}")
        print(f"{'='*65}")
        return
    
    # Mode 3: Webcam snapshots
    if args.webcam:
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("ERROR: Could not open webcam")
            return
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        
        print("\nWebcam mode:")
        print("  Press SPACE to capture and measure")
        print("  Press Q to quit\n")
        
        snap_count = 1
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Save raw snapshot
            raw_path = OUTPUT_DIR / f"webcam_raw_{snap_count:03d}.jpg"
            cv2.imwrite(str(raw_path), frame)
            
            # Measure
            result = measure_and_save(raw_path, mm_per_pixel)
            
            if result:
                print(f"\n--- Capture {snap_count} ---")
                print(f"Objects detected: {len(result['detections'])}")
                for d in result['detections']:
                    print(f"  {d['class']}: {int(d['size_mm'][0])}x{int(d['size_mm'][1])}mm")
                
                snap_count += 1
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == ord('Q'):
                break
        
        cap.release()
        print(f"\nCaptured {snap_count-1} measurements")
        return
    
    # No arguments - show usage
    print("\nUsage:")
    print("  python ml/webcam_measure.py --image path/to/photo.jpg")
    print("  python ml/webcam_measure.py --folder path/to/images/")
    print("  python ml/webcam_measure.py --webcam")
    print("\nOr run interactive mode:")
    print("  python ml/webcam_measure_interactive.py")


if __name__ == "__main__":
    main()
