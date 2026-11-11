"""
Quick test - Measure sample images and verify calibration
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ml.webcam_measure import measure_and_save, load_calibration

# Test with generated synthetic images
dataset_dir = Path("C:/Users/HP/.gemini/antigravity/scratch/oresentinel-ai/ml/dataset/room_images/train")
test_images = list(dataset_dir.glob("room_*.jpg"))[:5]  # Test first 5

if test_images:
    print("Testing with synthetic sample images...\n")
    mm_per_pixel = load_calibration()
    print(f"Using calibration: {mm_per_pixel:.4f} mm/pixel\n")
    
    for img_path in test_images:
        print(f"Measuring: {img_path.name}")
        result = measure_and_save(img_path, mm_per_pixel)
        if result:
            print(f"  Found {len(result['detections'])} objects")
            for d in result['detections'][:3]:  # Show first 3
                print(f"    - {d['class']}: ~{int(d['size_mm'][0])}mm wide")
        print()

print("Test complete!")
