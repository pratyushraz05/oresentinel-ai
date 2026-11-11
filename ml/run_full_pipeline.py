"""
OreSentinel AI - Complete Size-Accurate Training Pipeline
One-command setup from calibration to trained model
"""

import sys
from pathlib import Path

# Add paths
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "ml"))

from train_size_aware import SizeCalibratedTrainer
from size_calibration_assistant import SizeCalibrationAssistant

def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║         ORESENTINEL AI - SIZE-ACCURATE TRAINING PIPELINE       ║
║                                                                  ║
║         Calibrate your camera → Collect data → Train model     ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
""")


def step1_calibrate():
    """Step 1: Camera Calibration"""
    print("\n" + "═" * 65)
    print("STEP 1: CAMERA CALIBRATION")
    print("═" * 65)
    print("""
This step determines how many millimeters each pixel represents.
Your laptop camera will be used to establish the scale.

METHODS AVAILABLE:
  A) Ruler Method - Most accurate (recommended)
     Place a physical ruler in front of camera
  
  B) Known Object - Quick calibration
     Use coins, cards, or any object with known dimensions
  
  C) Skip - Use default scale (0.5 mm/pixel)
""")
    
    choice = input("Select method [A/B/C]: ").upper()
    
    assistant = SizeCalibrationAssistant()
    
    if choice == 'A':
        assistant.calibrate_with_ruler()
    elif choice == 'B':
        assistant.calibrate_with_known_object()
    else:
        print("\nUsing default calibration: 0.5 mm/pixel")
        print("(Run size_calibration_assistant.py later to refine)")
    
    return assistant.get_calibration()


def step2_collect_data(mm_per_pixel: float):
    """Step 2: Collect Webcam Data"""
    print("\n" + "═" * 65)
    print("STEP 2: COLLECT WEBCAM DATA")
    print("═" * 65)
    print(f"\nCurrent scale: {mm_per_pixel:.4f} mm/pixel\n")
    print("This step collects rock images from your webcam for training.")
    print("The more diverse your samples, the better the model.\n")
    
    choice = input("Collect webcam data now? [y/n]: ").lower()
    
    if choice == 'y':
        try:
            from capture_webcam_data import WebCamLabeler
            labeler = WebCamLabeler()
            labeler.start_capture()
            print("\nData collection complete!")
        except Exception as e:
            print(f"Note: Could not start interactive collector: {e}")
            print("Will proceed with synthetic augmentation only.\n")
    else:
        print("\nSkipping webcam collection. Will generate synthetic data.\n")


def step3_train(mm_per_pixel: float):
    """Step 3: Train Model"""
    print("\n" + "═" * 65)
    print("STEP 3: MODEL TRAINING")
    print("═" * 65)
    
    trainer = SizeCalibratedTrainer()
    trainer.mm_per_pixel = mm_per_pixel
    
    # Generate size-aware synthetic data
    print("\nGenerating size-aware synthetic training data...")
    trainer.generate_size_aware_synthetic(50)
    
    # Update config
    yaml_content = f"""path: {str(trainer.dataset_dir).replace('/', '/')}
train: images/train
val: images/val

names:
  0: boulder
  1: rock

# Calibration parameters
mm_per_pixel: {mm_per_pixel:.4f}
throat_limit_mm: 800
warning_threshold_mm: 650
"""
    (trainer.dataset_dir / "data.yaml").write_text(yaml_content)
    print(f"Updated dataset configuration")
    
    # Train
    print("\nStarting model training...")
    print("This may take 20-40 minutes on CPU.\n")
    
    # Show options
    print("Training Options:")
    print("  1. Quick train (10 epochs) ~15 min")
    print("  2. Standard train (20 epochs) ~30 min (recommended)")
    print("  3. Full train (30 epochs) ~45 min")
    
    choice = input("\nSelect training depth [1/2/3]: ")
    
    epochs = {"1": 10, "2": 20, "3": 30}.get(choice, 20)
    
    trainer.train_size_aware_model(epochs=epochs)
    
    # Export config
    trainer.export_calibration_config()
    
    print("\n✓ Training complete!")
    print(f"  Model saved to: {Path('ml/weights/oresentinel_size.pt')}")
    print(f"  Config exported to: backend/app/calibration.json")


def step4_activate():
    """Step 4: Activate New Model"""
    print("\n" + "═" * 65)
    print("STEP 4: ACTIVATE NEW MODEL")
    print("═" * 65)
    
    print("""
To use your newly trained model:

Option A: Replace existing model
  Copy: ml/weights/oresentinel_size.pt
  To:   ml/weights/oresentinel_yolo.pt
  
Option B: Use new model path (modify vision.py)
  Change get_yolo_model() to load oresentinel_size.pt

""")
    
    choice = input("Activate now? [y/n]: ").lower()
    
    if choice == 'y':
        import shutil
        src = BASE_DIR / "ml" / "weights" / "oresentinel_size.pt"
        dst = BASE_DIR / "ml" / "weights" / "oresentinel_yolo.pt"
        
        if src.exists():
            shutil.copy(src, dst)
            print(f"\n✓ Activated! New model is now at: {dst}")
        else:
            print("\n✗ Model file not found. Run training first.")


def main():
    print_banner()
    
    try:
        # Step 1: Calibrate
        calib = step1_calibrate()
        
        # Step 2: Collect data
        step2_collect_data(calib['mm_per_pixel'])
        
        # Step 3: Train
        step3_train(calib['mm_per_pixel'])
        
        # Step 4: Activate
        step4_activate()
        
        print("\n" + "═" * 65)
        print("PIPELINE COMPLETE!")
        print("═" * 65)
        print("""
Next steps:
  1. Test the app: python run_app.py
  2. Upload webcam images to see calibrated measurements
  3. Compare against actual rocks to verify accuracy

For troubleshooting, see:
  ml/SIZE_CALIBRATION_GUIDE.md
""")
        
    except KeyboardInterrupt:
        print("\n\nPipeline interrupted.")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
