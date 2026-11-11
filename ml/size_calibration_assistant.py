"""
OreSentinel AI - Interactive Size Calibration Assistant
Guide users through the process of calibrating their camera for accurate measurements
"""

import cv2
import numpy as np
import json
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
CALIBRATION_DIR = BASE_DIR / "ml" / "calibration"
CALIBRATION_FILE = CALIBRATION_DIR / "active_calibration.json"

class SizeCalibrationAssistant:
    def __init__(self):
        self.mm_per_pixel = None
        self.throat_limit_mm = 800.0
        self.warning_threshold_mm = 650.0
        self.frame_width = 1280
        self.frame_height = 720
        self._load_calibration()
    
    def _load_calibration(self):
        """Load existing calibration if available."""
        if CALIBRATION_FILE.exists():
            with open(CALIBRATION_FILE) as f:
                data = json.load(f)
                self.mm_per_pixel = data.get('mm_per_pixel')
                self.throat_limit_mm = data.get('throat_limit_mm', 800.0)
                self.warning_threshold_mm = data.get('warning_threshold_mm', 650.0)
                print(f"Loaded calibration: {self.mm_per_pixel:.3f} mm/pixel")
        else:
            print("No existing calibration found. Starting fresh calibration.")
    
    def calibrate_with_ruler(self, camera_idx=0):
        """
        Calibrate using a physical ruler placed in front of camera.
        Most accurate method for laptop cameras.
        """
        print("\n" + "=" * 65)
        print("   SIZE CALIBRATION - RULER METHOD")
        print("=" * 65)
        print("""
        INSTRUCTIONS:
        1. Place a PHYSICAL RULER or TAPE MEASURE in front of your camera
        2. Make sure at least 200mm (20cm) is visible in the frame
        3. Hold it steady and level with the camera
        4. Follow the prompts below
        
        The system will calculate: mm_per_pixel = real_mm / visible_pixels
        """)
        
        cap = cv2.VideoCapture(camera_idx)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
        
        if not cap.isOpened():
            print("ERROR: Could not open camera")
            return
        
        samples = []
        
        print("\nPosition your ruler and press SPACE when ready...")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            h, w = frame.shape[:2]
            annotated = frame.copy()
            
            # Draw guides
            cv2.rectangle(annotated, (w//4, h//3), (w*3//4, h*2//3), (0, 255, 129), 2)
            cv2.putText(annotated, "ALIGN RULER WITHIN BOX", (w//4, h//3 - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 129), 2)
            
            # Show instructions
            cv2.rectangle(annotated, (0, h-40), (w, h), (10, 20, 18), -1)
            cv2.putText(annotated, "SPACE: Capture | Q: Done | C: Clear", (10, h-12), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 129), 1)
            
            cv2.imshow("Ruler Calibration", annotated)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q') or key == ord('Q'):
                if samples:
                    break
                else:
                    continue
            elif key == ord(' '):  # Space - capture
                # Ask user to specify visible length
                print(f"\n--- Sample {len(samples) + 1} ---")
                print(f"Frame size: {w}x{h}")
                
                # Try to auto-detect ruler markings
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                
                # Simple edge detection to find ruler
                edges = cv2.Canny(gray, 50, 150)
                
                # Ask user for visible ruler length
                print("How many CENTIMETERS are visible in the frame? (e.g., 30 for 30cm)")
                try:
                    visible_cm = float(input("> "))
                    visible_mm = visible_cm * 10  # Convert cm to mm
                except:
                    print("Invalid input, skipping sample")
                    continue
                
                # Estimate pixels covered by ruler (assume it spans ~60% of frame horizontally)
                estimated_coverage = 0.6
                visible_pixels = w * estimated_coverage
                
                calculated_mmp = visible_mm / visible_pixels
                
                samples.append({
                    'visible_cm': visible_cm,
                    'visible_mm': visible_mm,
                    'visible_pixels': visible_pixels,
                    'mm_per_pixel': calculated_mmp,
                    'timestamp': datetime.now().isoformat()
                })
                
                print(f"  Visible: {visible_cm}cm ({visible_mm}mm) over ~{visible_pixels:.0f}px")
                print(f"  Calculated: {calculated_mmp:.3f} mm/pixel\n")
                
                if len(samples) >= 3:
                    print("Collected enough samples. Proceeding to final calculation...\n")
                    break
        
        cap.release()
        cv2.destroyAllWindows()
        
        if samples:
            # Average the samples
            avg_mmp = np.mean([s['mm_per_pixel'] for s in samples])
            self.mm_per_pixel = avg_mmp
            
            print("=" * 65)
            print("CALIBRATION RESULT")
            print("=" * 65)
            print(f"Averaged scale: {self.mm_per_pixel:.4f} mm/pixel")
            print(f"Inverse: 1 pixel = {1/self.mm_per_pixel:.2f} mm")
            print(f"\nThis means:")
            print(f"  - A 10cm object appears as ~{(100/self.mm_per_pixel):.0f} pixels wide")
            print(f"  - A 20cm object appears as ~{(200/self.mm_per_pixel):.0f} pixels wide")
            
            # Save calibration
            self._save_calibration()
        
        return self.mm_per_pixel
    
    def calibrate_with_known_object(self, camera_idx=0):
        """
        Calibrate using any object of known size (coin, card, etc.)
        Uses CM as input (user-friendly).
        """
        print("\n" + "=" * 65)
        print("   SIZE CALIBRATION - KNOWN OBJECT METHOD")
        print("=" * 65)
        print("""
        INSTRUCTIONS:
        1. Use ANY object with KNOWN dimensions
           Examples:
           - US Quarter: 24.26mm diameter
           - Credit card: 85.60mm x 53.98mm
           - A4 paper (short edge): 210mm
           - Standard ruler: any marked length
        
        2. Place the object flat, facing the camera
        3. Fill the center of the frame
        4. Press SPACE to calibrate
        """)
        
        cap = cv2.VideoCapture(camera_idx)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
        
        if not cap.isOpened():
            print("ERROR: Could not open camera")
            return
        
        print("\nReady when you are. Press SPACE to start...")
        
        input("Press ENTER when object is positioned...")
        
        ret, frame = cap.read()
        if not ret:
            print("Failed to capture frame")
            cap.release()
            return
        
        h, w = frame.shape[:2]
        
        # Ask for known dimension
        print(f"\nFrame size: {w}x{h}")
        print("What is the REAL-WORLD WIDTH of your object in CENTIMETERS?")
        
        try:
            known_width_cm = float(input("> "))
            known_width_mm = known_width_cm * 10  # Convert to mm
        except:
            print("Invalid input")
            cap.release()
            return
        
        # Estimate pixel width (assuming object fills ~50-70% of frame)
        pixel_coverage = 0.6  # Assume 60% coverage
        estimated_pixels = w * pixel_coverage
        
        mm_per_pixel = known_width_mm / estimated_pixels
        
        print(f"\n{'='*65}")
        print("CALIBRATION RESULT")
        print(f"{'='*65}")
        print(f"Known width: {known_width_cm}cm ({known_width_mm}mm)")
        print(f"Estimated pixel width: {estimated_pixels:.0f}px")
        print(f"Result: {mm_per_pixel:.4f} mm/pixel")
        print(f"Inverse: 1 pixel = {1/mm_per_pixel:.2f} mm")
        
        # Confirm with user
        print(f"\nDoes this look right?")
        print(f"  - A {known_width_cm}cm object should appear ~{estimated_pixels:.0f} pixels wide")
        print(f"  - Adjust the coverage estimate above if measurements seem off\n")
        
        response = input("Use this calibration? (y/n): ").lower()
        
        if response == 'y':
            self.mm_per_pixel = mm_per_pixel
            self._save_calibration()
        
        cap.release()
        return self.mm_per_pixel
    
    def test_measurement(self, image_path: str = None):
        """
        Test the calibration by measuring objects in an image.
        """
        if image_path:
            img = cv2.imread(image_path)
        else:
            # Live test
            cap = cv2.VideoCapture(0)
            ret, img = cap.read()
            cap.release()
            if not ret:
                print("Failed to capture image")
                return
        
        if img is None:
            print("Failed to load image")
            return
        
        h, w = img.shape[:2]
        
        print(f"\n{'='*65}")
        print(f"MEASUREMENT TEST")
        print(f"{'='*65}")
        print(f"Image: {w}x{h} pixels")
        print(f"Scale: {self.mm_per_pixel:.4f} mm/pixel")
        print(f"\nClick on two points to measure distance (press ESC to quit)")
        
        points = []
        
        def mouse_callback(event, x, y, flags, param):
            if event == cv2.EVENT_LBUTTONDOWN:
                points.append((x, y))
                if len(points) == 2:
                    p1, p2 = points
                    dist_px = ((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)**0.5
                    dist_mm = dist_px / self.mm_per_pixel
                    print(f"Distance: {dist_px:.1f} pixels = {dist_mm:.1f} mm")
                    points.clear()
        
        cv2.namedWindow("Measurement Test")
        cv2.setMouseCallback("Measurement Test", mouse_callback)
        
        while True:
            display = img.copy()
            
            # Draw points
            for i, (x, y) in enumerate(points):
                cv2.circle(display, (x, y), 5, (0, 255, 0), -1)
            
            # Draw distance line if 2 points
            if len(points) == 2:
                p1, p2 = points
                cv2.line(display, p1, p2, (0, 255, 0), 2)
                mid_x, mid_y = (p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2
                dist_px = ((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)**0.5
                dist_mm = dist_px / self.mm_per_pixel
                cv2.putText(display, f"{dist_mm:.1f}mm", (mid_x, mid_y - 10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Show scale
            cv2.rectangle(display, (10, 10), (210, 45), (0, 0, 0), -1)
            cv2.putText(display, f"Scale: {self.mm_per_pixel:.3f} mm/px", (15, 35), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1)
            
            cv2.imshow("Measurement Test", display)
            
            key = cv2.waitKey(1) & 0xFF
            if key == 27:  # ESC
                break
        
        cv2.destroyAllWindows()
    
    def _save_calibration(self):
        """Save calibration to file."""
        CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)
        
        data = {
            'mm_per_pixel': self.mm_per_pixel,
            'throat_limit_mm': self.throat_limit_mm,
            'warning_threshold_mm': self.warning_threshold_mm,
            'frame_width': self.frame_width,
            'frame_height': self.frame_height,
            'updated_at': datetime.now().isoformat()
        }
        
        with open(CALIBRATION_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"✓ Calibration saved to {CALIBRATION_FILE}")
    
    def get_calibration(self):
        """Get current calibration values."""
        return {
            'mm_per_pixel': self.mm_per_pixel,
            'throat_limit_mm': self.throat_limit_mm,
            'warning_threshold_mm': self.warning_threshold_mm
        }


def main():
    assistant = SizeCalibrationAssistant()
    
    print("\n" + "=" * 65)
    print("   ORESENTINEL AI - SIZE CALIBRATION ASSISTANT")
    print("=" * 65)
    
    while True:
        print("\nOPTIONS:")
        print("  1. Calibrate with RULER (most accurate)")
        print("  2. Calibrate with KNOWN OBJECT")
        print("  3. TEST measurements")
        print("  4. View current calibration")
        print("  5. Exit")
        
        choice = input("\nSelect option (1-5): ").strip()
        
        if choice == '1':
            assistant.calibrate_with_ruler()
        elif choice == '2':
            assistant.calibrate_with_known_object()
        elif choice == '3':
            assistant.test_measurement()
        elif choice == '4':
            cal = assistant.get_calibration()
            print(f"\nCurrent Calibration:")
            print(f"  mm/pixel: {cal['mm_per_pixel']:.4f}")
            print(f"  Throat limit: {cal['throat_limit_mm']}mm")
            print(f"  Warning threshold: {cal['warning_threshold_mm']}mm")
        elif choice == '5':
            break
        else:
            print("Invalid option")


if __name__ == "__main__":
    main()
