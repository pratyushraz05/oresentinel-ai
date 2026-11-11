# Webcam Data Collection & Training Guide

## Quick Start

### Step 1: Collect Images from Your Laptop Camera

```bash
cd .gemini/antigravity/scratch/oresentinel-ai
python ml/capture_webcam_data.py
```

**While capturing:**
- Press **SPACEBAR** to capture a frame
- Use your **mouse** to draw bounding boxes around rocks/boulders
- Press **1** or **2** to toggle between classes (Boulder/Rock)
- Press **ENTER** to save annotations
- Press **DEL** to delete last box
- Press **Q** to quit

### Step 2: Train with New Data

```bash
python ml/train_with_webcam.py
```

This will:
1. Add your webcam images to the dataset
2. Generate synthetic augmentation for robustness
3. Train YOLOv8n on the combined dataset
4. Save the new model weights

### Step 3: Use the Trained Model

The trained model is saved as `ml/weights/oresentinel_webcam.pt`

To use it in the main app, either:
- Rename it: `rename oresentinel_webcam.pt oresentinel_yolo.pt`
- Or modify `backend/app/vision.py` to load the new weight path

---

## Dataset Structure

```
ml/dataset/
├── webcam_captures/     # Raw images from laptop camera
├── annotations/          # YOLO-format labels (.txt files)
├── images/
│   ├── train/           # Training images
│   └── val/             # Validation images
├── labels/
│   ├── train/           # Training labels
│   └── val/             # Validation labels
└── data.yaml            # Dataset configuration
```

---

## Tips for Better Results

1. **Capture diverse conditions:**
   - Different lighting (bright, dim, mixed)
   - Various rock sizes and types
   - Different backgrounds (conveyor, ground, trucks)

2. **Aim for at least 50+ labeled images** for meaningful improvement

3. **Balance your classes:**
   - Class 0 = Boulder (oversize rocks > critical size)
   - Class 1 = Rock (normal fragments)

4. **Add negative samples** (images with NO rocks) to reduce false positives

---

## Expected Timeline

| Dataset Size | Approximate Training Time (CPU) |
|--------------|--------------------------------|
| 20-50 images | ~10-20 minutes                |
| 50-100 images| ~20-40 minutes                |
| 100+ images  | ~40-60 minutes                |
