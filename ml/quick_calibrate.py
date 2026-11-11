"""
Headless Camera Calibration - No display required
Estimate mm/pixel from photo metadata and object size
"""

import argparse
import json
from pathlib import Path
from datetime import datetime
import cv2
import numpy as np

BASE_DIR = Path(__file__).resolve().parent.parent
CALIBRATION_DIR = BASE_DIR / "ml" / "calibration"
CALIBRATION_FILE = CALIBRATION_DIR / "active_calibration.json"


def estimate_camera_fov(camera_index=0):
    """
    Estimate camera field of view using common laptop webcam specs.
    Returns estimated mm_per_pixel for typical distances.
    """
    # Common laptop webcam specs
    webcams = {
        0: {"fov_horizontal": 60, "resolution": (1280, 720), "name": "Standard HD Webcam"},
        1: {"fov_horizontal": 70, "resolution": (1920, 1080), "name": "FHD Webcam"},
        2: {"fov_horizontal": 55, "resolution": (640, 480), "name": "Older Webcam"},
    }
    
    if camera_index in webcams:
        return webcams[camera_index]
    
    # Default estimate
    return {"fov_horizontal": 60, "resolution": (1280, 720), "name": "Estimated"}


def calculate_scale_from_photo(photo_path: str, object_size_cm: float, distance_cm: float = None):
    """
    Calculate mm/pixel from a single photo.
    
    Args:
        photo_path: Path to photo with known-size object
        object_size_cm: Real width of object in cm
        distance_cm: Approximate distance from camera (optional, defaults to 50cm)
    """
    img = cv2.imread(photo_path)
    if img is None:
        raise ValueError(f"Cannot read image: {photo_path}")
    
    h, w = img.shape[:2]
    
    # Detect edges and find the largest horizontal feature (likely our object)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Try to detect the object boundaries
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Find largest contour that could be our object
    max_area = 0
    best_box = None
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 10000:  # Minimum area threshold
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect = bw / max(1, bh)
            
            # Look for horizontal objects (most room objects are wider than tall)
            if 0.5 < aspect < 4.0 and area > max_area:
                max_area = area
                best_box = (x, y, bw, bh)
    
    if best_box:
        x, y, bw, bh = best_box
        object_pixels = bw
    else:
        # Fallback: assume object fills ~50% of frame width
        object_pixels = w * 0.5
        print(f"Warning: Could not auto-detect object. Assuming {object_pixels:.0f} pixels coverage.")
    
    # Calculate scale
    object_size_mm = object_size_cm * 10
    mm_per_pixel = object_size_mm / object_pixels
    
    print(f"\nImage analysis:")
    print(f"  Resolution: {w}x{h}")
    print(f"  Object width: ~{object_pixels:.0f} pixels")
    print(f"  Known size: {object_size_cm}cm ({object_size_mm}mm)")
    print(f"  Calculated: {mm_per_pixel:.4f} mm/pixel")
    print(f"  Inverse: 1 pixel = {1/mm_per_pixel:.2f} mm")
    
    return mm_per_pixel


def quick_estimate(object_size_cm: float, frame_width_px: int = 1280):
    """
    Quick calculation without image analysis.
    Assumes object fills ~60% of frame.
    """
    estimated_pixels = frame_width_px * 0.60
    object_size_mm = object_size_cm * 10
    mm_per_pixel = object_size_mm / estimated_pixels
    
    print(f"\nQuick estimate (assuming 60% frame coverage):")
    print(f"  Frame width: {frame_width_px}px")
    print(f"  Object: {object_size_cm}cm = {object_size_mm}mm")
    print(f"  Estimated pixels: {estimated_pixels:.0f}")
    print(f"  Result: {mm_per_pixel:.4f} mm/pixel")
    
    return mm_per_pixel


def save_calibration(mm_per_pixel: float, method: str, source: str = None):
    """Save calibration to file."""
    CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)
    
    data = {
        'mm_per_pixel': mm_per_pixel,
        'method': method,
        'source': source,
        'updated_at': datetime.now().isoformat()
    }
    
    with open(CALIBRATION_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n[OK] Calibration saved to: {CALIBRATION_FILE}")
    return CALIBRATION_FILE


def main():
    parser = argparse.ArgumentParser(description='RoomScale Headless Calibrator')
    parser.add_argument('--size-cm', type=float, required=True,
                       help='Object size in centimeters (e.g., 21 for A4 paper)')
    parser.add_argument('--photo', type=str, help='Path to photo with reference object')
    parser.add_argument('--coverage', type=float, default=0.6,
                       help='Expected object coverage of frame (0.0-1.0, default: 0.6)')
    parser.add_argument('--width-px', type=int, default=1280,
                       help='Frame width in pixels (default: 1280)')
    args = parser.parse_args()
    
    print("\n" + "=" * 65)
    print("   ROOMSCALE - HEADLESS CALIBRATION")
    print("=" * 65)
    
    if args.photo:
        # Method 1: Analyze photo
        print(f"\nAnalyzing photo: {args.photo}")
        try:
            mm_per_pixel = calculate_scale_from_photo(args.photo, args.size_cm)
            method = "photo_analysis"
        except Exception as e:
            print(f"Photo analysis failed: {e}")
            print("Falling back to quick estimate...")
            mm_per_pixel = quick_estimate(args.size_cm, args.width_px)
            method = "quick_estimate"
    else:
        # Method 2: Quick estimate
        print(f"\nReference object: {args.size_cm} cm")
        mm_per_pixel = quick_estimate(args.size_cm, args.width_px)
        method = "quick_estimate"
    
    # Save
    save_calibration(mm_per_pixel, method, args.photo)
    
    print("\n" + "=" * 65)
    print("CALIBRATION COMPLETE")
    print("=" * 65)
    print(f"\nUse this value for training:")
    print(f"  python ml/train_roomscale.py --mm-per-pixel {mm_per_pixel:.4f}")
    print(f"\nFor better accuracy, take a photo with your object and re-run:")
    print(f"  python ml/quick_calibrate.py --size-cm {args.size_cm} --photo path/to/photo.jpg")


if __name__ == "__main__":
    main()
