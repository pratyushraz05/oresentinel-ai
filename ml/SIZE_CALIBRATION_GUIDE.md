# Size-Accurate Training Guide

This guide explains how to train OreSentinel AI to accurately measure rock sizes from your laptop camera.

## The Challenge

Default calibration assumes a fixed relationship between pixels and millimeters:
```
1600mm (conveyor width) / frame_width = mm_per_pixel
```

But real-world conditions vary:
- Different camera distances
- Lens distortion
- Angle of view
- Varying lighting conditions

## The Solution: Calibration Pipeline

### Option 1: Quick Calibration (Recommended Start)

Run the interactive calibration assistant:

```bash
cd C:\Users\HP\.gemini\antigravity\scratch\oresentinel-ai
python ml/size_calibration_assistant.py
```

**Choose option 1 (Ruler Method):**
1. Place a physical ruler in front of your camera
2. Align it within the green box shown
3. Enter how many mm are visible
4. System calculates optimal scale

**Choose option 2 (Known Object):**
- Use any object with known dimensions:
  - US Quarter: 24.26mm
  - Credit card: 85.60mm × 53.98mm
  - A4 paper edge: 210mm
  - Any ruler marking

### Option 2: Automated Calibration

For a more automated approach:

```bash
python ml/train_size_aware.py
```

This will:
1. Run auto-calibration using common reference objects
2. Generate size-aware synthetic training data
3. Train a model calibrated to your specific setup

### Option 3: Full Pipeline

Complete workflow for best results:

```bash
# Step 1: Collect diverse webcam images
python ml/capture_webcam_data.py

# Step 2: Calibrate your camera
python ml/size_calibration_assistant.py

# Step 3: Train with calibrated data
python ml/train_size_aware.py
```

## How Size Calibration Works

### Mathematical Model

The system converts pixel measurements to real-world units:

```
real_mm = pixel_distance × mm_per_pixel
```

Where `mm_per_pixel` is determined through:

1. **Single-point calibration:**
   - Known object size ÷ observed pixel size
   - Fast but less accurate

2. **Multi-sample averaging:**
   - Multiple measurements at different distances
   - Reduces error from perspective distortion

3. **Synthetic augmentation:**
   - Generate training images with exact known sizes
   - Improve model's size discrimination ability

### Example Calculation

If you place a 100mm ruler and it spans 200 pixels:

```
mm_per_pixel = 100mm / 200px = 0.5 mm/px
```

So:
- 50mm object → 100 pixels wide
- 800mm boulder (throat limit) → 1600 pixels wide

## Improving Accuracy

### Tips for Better Calibration

1. **Use flat, rigid objects** - Rulers, cards, coins
2. **Keep perpendicular to camera** - Avoid angles
3. **Fill 50-70% of frame** - Not too close, not too far
4. **Take multiple samples** - Average reduces error
5. **Match training conditions** - Similar lighting/distance as production

### Accuracy Expectations

| Method | Expected Error | Notes |
|--------|---------------|-------|
| Single reference | ±10-15% | Good starting point |
| Multi-sample average | ±5-8% | Recommended minimum |
| Full calibration pipeline | ±3-5% | Best results |

## Integration with Main App

Once calibrated, the system uses the stored scale automatically:

```python
# backend/app/vision.py
def detect_boulders_and_measure(image_path, ...):
    # Load calibration
    calibration = get_calibration(source_id)
    
    if calibration:
        mm_per_pixel = calibration.mm_per_pixel_avg
    else:
        # Fallback to default
        mm_per_pixel = 1600.0 / image_width
    
    # Convert pixel bounds to mm
    major_axis_mm = bbox_width_px × mm_per_pixel
```

## Troubleshooting

### Measurements seem wrong?

1. Check if calibration was saved:
   ```bash
   cat ml/calibration/active_calibration.json
   ```

2. Re-run calibration with ruler method (most accurate)

3. Ensure reference object is truly known size

### Model detects rocks but measures wrong size?

- The YOLO model classifies well, but size estimation needs calibration
- Run `size_calibration_assistant.py` to fix
- Or manually set `mm_per_pixel` in config

### Want faster training?

- Use fewer synthetic samples (change count in `train_size_aware.py`)
- Start with 20 epochs instead of 25
- Use GPU if available: change `device="cpu"` to `device="0"`

## Next Steps

After completing calibration:

1. **Test live measurements:**
   ```bash
   python run_app.py
   ```
   Upload or webcam-capture images to see calibrated measurements

2. **Fine-tune with real data:**
   Capture more webcam images and retrain periodically

3. **Monitor accuracy:**
   Compare measured sizes against actual rocks over time
   Adjust calibration as needed
