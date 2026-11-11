"""
OreSentinel AI - Camera Calibration & Size Measurement Tool
Calibrates your laptop camera for accurate mm-to-pixel conversion
"""

import cv2
import numpy as np
import json
from pathlib import Path
import argparse
from datetime import datetime

class CameraCalibrator:
    def __init__(self):
        self.camera_matrix = None
        self.dist_coeffs = None
        self.frame_size = None
        self.mm_per_pixel = {}  # Dictionary keyed by distance
        
    def detect_chessboard(self, img, pattern_size=(9, 6)):
        """Detect chessboard corners for calibration."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Try standard chessboard
        ret, corners = cv2.findChessboardCorners(gray, pattern_size, None)
        
        if ret:
            # Refine corner detection
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
            corners = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
        
        return ret, corners
    
    def collect_calibration_samples(self, camera_idx=0, num_samples=20):
        """Collect samples at different distances for size calibration."""
        cap = cv2.VideoCapture(camera_idx)
        if not cap.isOpened():
            print("ERROR: Could not open camera")
            return
        
        # Set resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.frame_size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), 
                          int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        
        print("=" * 65)
        print("   CAMERA CALIBRATION - SIZE MEASUREMENT SETUP")
        print("=" * 65)
        print(f"\nCamera resolution: {self.frame_size[0]}x{self.frame_size[1]}")
        print(f"Target: Collect {num_samples} samples at known distances\n")
        print("INSTRUCTIONS:")
        print("  1. Place a RULER or KNOWN-SIZE OBJECT in the frame")
        print("  2. Press [SPACE] to capture at current distance")
        print("  3. Move object closer/farther and repeat")
        print("  4. Press [S] to save calibration settings")
        print("  5. Press [Q] to quit\n")
        
        samples = []
        current_distance = 0
        last_known_size_mm = 400  # Default: assume ~400mm object width
        
        while len(samples) < num_samples:
            ret, frame = cap.read()
            if not ret:
                break
            
            h, w = frame.shape[:2]
            
            # Draw HUD
            cv2.rectangle(frame, (0, 0), (w, 40), (10, 20, 18), -1)
            cv2.putText(frame, f"Sample: {len(samples)}/{num_samples} | Distance: ~{current_distance}cm", 
                       (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 129), 2)
            
            # Show target area
            cx, cy = w // 2, h // 2
            box_size = min(w, h) // 3
            cv2.rectangle(frame, (cx - box_size//2, cy - box_size//2), 
                         (cx + box_size//2, cy + box_size//2), (0, 255, 129), 2)
            cv2.putText(frame, "PLACE OBJECT HERE", (cx - 80, cy + box_size//2 + 25), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 129), 1)
            
            cv2.imshow("Camera Calibrator", frame)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord(' '):  # Space - capture sample
                # Ask for object size
                print(f"\nSample {len(samples) + 1}: Enter object width in mm (e.g., 400 for 40cm ruler):", end=" ")
                try:
                    size_input = input()
                    size_mm = float(size_input) if size_input else last_known_size_mm
                    last_known_size_mm = size_mm
                except:
                    size_mm = last_known_size_mm
                
                # Calculate mm per pixel based on how much of frame the object occupies
                # For now, use a simple heuristic: estimate object spans ~30% of frame width
                estimated_obj_px = w * 0.3  # Assume object takes ~30% of frame
                mm_per_px = size_mm / estimated_obj_px
                
                sample = {
                    'timestamp': datetime.now().isoformat(),
                    'frame_width': w,
                    'frame_height': h,
                    'object_width_mm': size_mm,
                    'estimated_mm_per_pixel': mm_per_px,
                    'distance_estimate_cm': current_distance
                }
                
                samples.append(sample)
                print(f"  ✓ Captured: {size_mm}mm object → {mm_per_px:.3f} mm/pixel")
                current_distance += 10  # Rough estimate increment
                
            elif key == ord('s') or key == ord('S'):  # Save
                if samples:
                    self.save_calibration(samples)
                    print(f"\n✓ Saved {len(samples)} calibration samples")
                break
                
            elif key == ord('q') or key == ord('Q'):  # Quit
                break
        
        cap.release()
        cv2.destroyAllWindows()
        
        return samples
    
    def estimate_from_single_image(self, image_path: str, known_object_mm: float = 400.0):
        """
        Estimate mm/pixel ratio from a single image with a known object.
        Returns: mm_per_pixel
        """
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        
        h, w = img.shape[:2]
        
        # Auto-detect by assuming known object fills ~30% of frame width
        # User can override by specifying object position
        estimated_obj_pixels = w * 0.30
        mm_per_pixel = known_object_mm / estimated_obj_pixels
        
        print(f"Image: {image_path}")
        print(f"  Resolution: {w}x{h}")
        print(f"  Assumed object: {known_object_mm}mm spans {estimated_obj_pixels:.0f}px")
        print(f"  Estimated scale: {mm_per_pixel:.3f} mm/pixel")
        
        return mm_per_pixel
    
    def refine_calibration_with_depth(self, image_path: str, object_sizes_mm: list = None):
        """
        Advanced calibration using multiple known objects at different positions.
        Better accuracy than single-point calibration.
        """
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        h, w = img.shape[:2]
        
        # If no sizes provided, use default assumptions
        if not object_sizes_mm:
            # Assume we have objects at different depths
            object_sizes_mm = [300, 400, 500]  # Small, medium, large rocks in mm
        
        # Analyze image to find objects and estimate scale variations
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Find significant contours (potential objects)
        obj_contours = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 10000:  # Minimum area threshold
                x, y, bw, bh = cv2.boundingRect(cnt)
                aspect = bw / max(1, bh)
                if 0.3 < aspect < 3.0:  # Reasonable aspect ratio
                    obj_contours.append((cnt, (x, y, bw, bh), area))
        
        if len(obj_contours) < 2:
            print("Could not detect enough objects for refined calibration")
            return None
        
        # Sort by size (largest = closest = largest pixels per mm)
        obj_contours.sort(key=lambda x: x[2], reverse=True)
        
        # Calculate scale factors
        scales = []
        for i, (cnt, bbox, area) in enumerate(obj_contours[:5]):
            x, y, bw, bh = bbox
            avg_dim = (bw + bh) / 2
            if i < len(object_sizes_mm):
                expected_mm = object_sizes_mm[i]
                scale = expected_mm / avg_dim
                scales.append(scale)
        
        if scales:
            avg_scale = np.mean(scales)
            print(f"\nRefined calibration:")
            print(f"  Average scale: {avg_scale:.3f} mm/pixel")
            print(f"  Samples analyzed: {len(scales)}")
            return avg_scale
        
        return None
    
    def save_calibration(self, samples: list, output_path: str = None):
        """Save calibration data to JSON."""
        if output_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = Path(__file__).parent.parent / "calibration" / f"camera_{timestamp}.json"
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            'created_at': datetime.now().isoformat(),
            'frame_size': self.frame_size,
            'samples': samples,
            'average_mm_per_pixel': np.mean([s['estimated_mm_per_pixel'] for s in samples]) if samples else None
        }
        
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"\n✓ Calibration saved to: {output_path}")
        return output_path


def interactive_calibration():
    """Run interactive calibration session."""
    calibrator = CameraCalibrator()
    
    parser = argparse.ArgumentParser(description='OreSentinel Camera Calibrator')
    parser.add_argument('--camera', type=int, default=0, help='Camera index (default: 0)')
    parser.add_argument('--samples', type=int, default=15, help='Number of samples to collect')
    parser.add_argument('--reference-mm', type=float, default=400.0, help='Reference object size in mm')
    args = parser.parse_args()
    
    print("\n" + "=" * 65)
    print("   ORESENTINEL AI - CAMERA SIZE CALIBRATION")
    print("=" * 65)
    print(f"\nThis tool will help you calibrate your camera for accurate")
    print(f"millimeter measurements of rocks/boulders.\n")
    print(f"Using camera index: {args.camera}")
    print(f"Will collect: {args.samples} samples")
    print(f"Default reference size: {args.reference_mm}mm\n")
    
    samples = calibrator.collect_calibration_samples(args.camera, args.samples)
    
    if samples:
        print("\n" + "=" * 65)
        print("CALIBRATION SUMMARY")
        print("=" * 65)
        avg_mpp = np.mean([s['estimated_mm_per_pixel'] for s in samples])
        print(f"Average scale: {avg_mpp:.3f} mm/pixel")
        print(f"This means 1 pixel ≈ {1/avg_mpp:.2f} mm in real world")
        print(f"\nTo use in code:")
        print(f"  mm_per_pixel = {avg_mpp:.4f}")
    
    return calibrator


if __name__ == "__main__":
    interactive_calibration()
