# RoomScale AI - Quick Start Guide

Measure ANY object in your room using your laptop camera!

## How It Works

This system trains a YOLO model to detect and measure common household/office objects:
- Phone, Laptop, Book, Mug, Bottle
- Mouse, Keyboard, Monitor, Remote
- Box, Pen, Glasses, Watch, Key, and more

## Quick Setup (3 Steps)

### Step 1: Set Your Camera Scale

First, determine how many millimeters each pixel represents in your camera:

```bash
python ml/size_calibration_assistant.py
```

Choose **"Known Object"** method:
- Hold a credit card (85.60mm wide) or ruler in front of camera
- Enter its real size
- System calculates your `mm_per_pixel` scale

**Typical values for laptop cameras:**
- Close distance (~30cm): ~0.8-1.2 mm/pixel
- Medium distance (~60cm): ~0.4-0.6 mm/pixel  
- Far distance (~100cm): ~0.2-0.3 mm/pixel

### Step 2: Generate Initial Dataset & Train

```bash
python ml/train_roomscale.py --mm-per-pixel 0.5
```

This will:
1. Generate 80 synthetic room scenes with known object sizes
2. Train YOLOv8n on the combined dataset
3. Save to `ml/weights/roomscale_model.pt`

### Step 3: Capture Real Photos (Optional but Recommended)

For better accuracy with YOUR specific room:

```bash
python ml/room_labeler.py
```

Controls:
- **SPACE** → Capture photo
- **Mouse drag** → Draw box around object
- **C** → Cycle object class (Phone, Laptop, etc.)
- **ENTER** → Save annotations
- **DEL** → Delete last box
- **Q** → Quit

Then retrain with your captures:
```bash
python ml/train_roomscale.py --mm-per-pixel 0.5
```

## Using the Trained Model

### In the Main App

Copy the model to activate:
```bash
copy ml\weights\roomscale_model.pt ml\weights\oresentinel_yolo.pt
```

Or modify `backend/app/vision.py` to load `roomscale_model.pt` directly.

### Measuring Objects

Once activated, point your camera at any object:
- The system draws bounding boxes
- Shows estimated size in mm
- Classifies the object type

## Accuracy Tips

| For Best Results | Do This |
|-----------------|---------|
| Calibration | Use multiple reference objects at different distances |
| Training Data | Capture 20+ photos of your actual room objects |
| Lighting | Train with similar lighting as you'll measure |
| Angles | Include side views, not just top-down |
| Backround | Include your actual desk/table surfaces |

## Expected Performance

| Dataset Size | Approximate Accuracy |
|--------------|---------------------|
| 80 synthetic only | ±15-20% |
| 80 synthetic + 20 real | ±8-12% |
| 80 synthetic + 50+ real | ±5-8% |

## Troubleshooting

**Measurements too large/small?**
→ Re-run calibration with a more accurate reference object

**Model doesn't recognize your object?**
→ Capture more photos of that specific object type
→ Or use "other" class and manually classify

**Poor detection in your room?**
→ Replicate your room's lighting/colors in synthetic data
→ Increase training with your actual webcam captures
