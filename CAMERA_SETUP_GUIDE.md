# OreSentinel AI - Camera Feed Connection Guide
## For Training Data Capture & Production Deployment

---

## 📷 Supported Camera Input Types

| Source Type | Format Example | Use Case |
|-------------|----------------|----------|
| **USB/Built-in Webcam** | `0`, `1`, `2` (device index) | Laptop testing, dev machines |
| **Industrial IP Camera (RTSP)** | `rtsp://user:pass@192.168.1.100:554/stream1` | Production plant cameras |
| **HTTP/MJPEG Stream** | `http://192.168.1.101:8080/video` | Some IP cameras |
| **Video File** | `C:/footage/crusher_feed.mp4` | Offline analysis, replay |
| **GStreamer Pipeline** | `v4l2src device=/dev/video0 ! video/x-raw,width=1920,height=1080 ! appsink` | Linux/Jetson advanced |

---

## ⚙️ Configuration: `cameras.yaml`

Edit this file with your actual camera sources:

```yaml
cameras:
  - camera_id: "CAM-01-CHUTE"       # Must match your plant SCADA tag
    source: "0"                      # Device index OR RTSP URL
    name: "Primary Feed Chute Camera"
    location: "Conveyor Belt 1A"
    resolution: "1920x1080"
    fps_target: 30
    enabled: true

  - camera_id: "CAM-02-JAW"
    source: "rtsp://admin:password@192.168.1.50:554/Streaming/Channels/101"
    name: "Jaw Crusher Throat Camera"
    location: "Inlet Hopper 2B"
    resolution: "1920x1080"
    fps_target: 30
    enabled: true

  - camera_id: "CAM-03-TRANSFER"
    source: "rtsp://user:pass@192.168.1.100:554/stream1"
    name: "Transfer Chute Overband Camera"
    location: "Belt 3 Transfer"
    resolution: "1280x720"
    fps_target: 25
    enabled: false   # Set true when camera is installed

output_dir: "training_data"
interval_seconds: 5.0
duration_seconds: null        # null = run until Ctrl+C
max_frames_per_camera: null   # null = unlimited
save_metadata: true
organize_by_date: true
organize_by_camera: true
```

### Key Fields:
- **`camera_id`**: Must match your SCADA/plant naming (used for calibration + incident linking)
- **`source`**: Device index (`"0"`) or full RTSP URL with credentials
- **`enabled`**: Set `false` for cameras not yet installed

---

## 🚀 Running Capture

### Quick Test (Laptop Webcam)
```bash
cd C:\Users\HP\.gemini\antigravity\scratch\oresentinel-ai
python capture_training_data.py --camera 0 --interval 2 --duration 60 --camera-id CAM-TEST
```

### Production Multi-Camera
```bash
# 1. Edit cameras.yaml with real RTSP URLs
# 2. Run on each camera PC at the plant:
python capture_training_data.py --config cameras.yaml
```

### Background/Service Mode (Linux/Plant PC)
```bash
# Using systemd (create /etc/systemd/system/oresentinel-capture.service)
[Unit]
Description=OreSentinel Training Data Capture
After=network.target

[Service]
Type=simple
User=plantuser
WorkingDirectory=/opt/oresentinel
ExecStart=/opt/conda/bin/python capture_training_data.py --config cameras.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 📁 Output Structure

```
training_data/
├── 2026-11-11/
│   ├── CAM-01-CHUTE/
│   │   ├── CAM-01-CHUTE_20261111_060000_123.jpg
│   │   ├── CAM-01-CHUTE_20261111_060005_456.jpg
│   │   └── ...
│   ├── CAM-02-JAW/
│   │   └── ...
│   └── CAM-03-TRANSFER/
│       └── ...
└── capture_metadata.jsonl   # One line per frame for labeling
```

### Metadata Format (`capture_metadata.jsonl`)
```json
{"camera_id":"CAM-01-CHUTE","camera_name":"Primary Feed Chute Camera","location":"Conveyor Belt 1A","filename":"CAM-01-CHUTE_20261111_060000_123.jpg","relative_path":"2026-11-11/CAM-01-CHUTE/CAM-01-CHUTE_20261111_060000_123.jpg","timestamp_utc":"2026-11-11T06:00:00.123456","resolution":"1920x1080","interval_seconds":5.0}
```

---

## 🔧 Camera Calibration (Required for Accurate Sizing)

### 1. Prepare Reference Object
- **200mm × 200mm** high-contrast plate (checkerboard or reflective)
- Mount **permanently** on conveyor side wall, visible in camera FOV
- Same physical object at each camera location

### 2. Capture Calibration Frame
```bash
# Option A: Use capture script (saves frame)
python capture_training_data.py --camera 0 --interval 1 --duration 10 --max-frames 1

# Option B: Use webcam feed
python webcam_feed.py  # Press 's' to save frame
```

### 3. Run Interactive Calibration
```bash
cd backend
python -m app.calibration ../training_data/2026-11-11/CAM-01-CHUTE/frame.jpg
```
- Window opens → Click **4 corners** in order: **Top-Left, Top-Right, Bottom-Right, Bottom-Left**
- Press `r` to reset, `q` to quit
- Saves to `backend/calibration/calib_CAM-01-CHUTE.json`

### 4. Verify Calibration Applied
- Restart main app: `python run_app.py`
- Run detection on test image
- Logs show: `[CALIB] Using calibration for CAM-01-CHUTE: 0.5234 mm/px`
- Without calibration: `[WARN] No calibration for CAM-01-CHUTE, using fallback: 0.8333 mm/px`

---

## 🏷️ Labeling Workflow (Roboflow Recommended)

### 1. Upload to Roboflow
```bash
# Zip training_data folder, upload to roboflow.com
# Or use Roboflow CLI:
pip install roboflow
roboflow login
roboflow upload --project ore-crusher --dataset-dir training_data
```

### 2. Configure Classes
| Class ID | Name | Description |
|----------|------|-------------|
| 0 | `rock_fragment` | Normal ore pieces (< 650mm) |
| 1 | `oversize_boulder` | ≥ 800mm, crusher throat hazard |
| 2 | `wedging_slab` | High aspect ratio (> 2.0), bridging risk |
| 3 | `conveyor_belt` | Background class (helps reduce false positives) |
| 4 | `personnel` | Safety - operators in frame |
| 5 | `debris` | Non-ore objects (wood, metal, tools) |

### 3. Labeling Tips
- **Box tightly** around rock contour (not loose rectangle)
- **Label partial rocks** at frame edges (visible portion)
- **Minimum 200 images per class** for decent baseline
- **Include adverse conditions**: dust, rain, night, wet ore, glare
- **Invite plant operators** — they know the material best

### 4. Export for Training
- Format: **YOLOv8** (`.txt` labels, `images/train`, `images/val`)
- Download → Extract to `backend/ml/dataset/`
- Structure:
```
backend/ml/dataset/
├── data.yaml          # Update paths!
├── images/
│   ├── train/
│   └── val/
└── labels/
    ├── train/
    └── val/
```

### 5. Update `data.yaml`
```yaml
path: C:/Users/HP/.gemini/antigravity/scratch/oresentinel-ai/backend/ml/dataset
train: images/train
val: images/val

names:
  0: rock_fragment
  1: oversize_boulder
  2: wedging_slab
  3: conveyor_belt
  4: personnel
  5: debris
```

---

## 🏋️ Retraining Pipeline

### Baseline Training (Open Source + Your Data)
```bash
cd backend
# 1. Pre-train on open source (if available)
python ml/train_yolo.py --epochs 50 --data open_source_data.yaml

# 2. Fine-tune on YOUR plant data
python ml/train_yolo.py --epochs 20 --lr 0.001
```

### Production Training Config (`train_yolo.py` args)
```python
model.train(
    data="ml/dataset/data.yaml",
    epochs=100,
    imgsz=1280,          # Higher res for small rocks
    batch=16,
    device=0,            # GPU
    # Mining-specific augmentations:
    degrees=15,          # Camera vibration
    translate=0.1,
    scale=0.3,
    shear=5,
    perspective=0.001,
    fliplr=0.5,
    mosaic=1.0,
    mixup=0.1,
    hsv_h=0.015,
    hsv_s=0.7,           # Dust/lighting variation
    hsv_v=0.4,
    # Class weights (oversize rare):
    cls_pw=1.0,          # Adjust per-class weights
    patience=20,
    save_period=10
)
```

---

## 📊 Validation Checklist Before Deployment

| Check | Target | How to Verify |
|-------|--------|---------------|
| **Oversize Recall** | > 99% | Zero missed boulders on test set |
| **Size Accuracy** | ±5% | Place known rocks, measure detected mm |
| **False Positive Rate** | < 2% | Run on 1hr empty belt footage |
| **Inference Latency** | < 100ms | `detect_frame_in_memory` benchmark |
| **Calibration Drift** | < 2% | Re-calibrate weekly, compare mm/px |
| **Night/Dust Performance** | > 90% recall | Test on adverse condition subset |

---

## 🔌 Production Integration Points

| System | Interface | Purpose |
|--------|-----------|---------|
| **SCADA/Historian** | OPC-UA / Modbus TCP | Push alerts, read crusher status |
| **PLC (Chute Diverter)** | Modbus/Profibus | Receive `DIVERT_CHUTE` command |
| **HMI/Operator Panel** | REST API + WebSocket | Show alerts, acknowledge, log actions |
| **Maintenance CMMS** | REST API | Auto-create work orders on outcomes |
| **Data Lake** | Kafka / MQTT | Stream detections for analytics |

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| `cv2.VideoCapture` fails on RTSP | Install `opencv-python-headless` with FFMPEG: `pip install opencv-python-headless --force-reinstall` |
| "Only one usage of socket address" | Kill existing process: `taskkill /F /PID <pid>` (Windows) or `pkill -f uvicorn` (Linux) |
| Calibration gives wrong mm/px | Re-click corners carefully; ensure reference object is flat on belt plane |
| YOLO detects belt as rock | Add `conveyor_belt` class, label background aggressively |
| Low FPS on Jetson/Edge | Export to TensorRT: `model.export(format="engine", device=0, half=True)` |
| GPU OOM | Reduce `batch`, `imgsz=640`, enable `amp=True` |

---

## 📞 Quick Commands Reference

```bash
# Start full app
cd C:\Users\HP\.gemini\antigravity\scratch\oresentinel-ai
python run_app.py

# Capture training data (multi-camera)
python capture_training_data.py --config cameras.yaml

# Capture single camera quick test
python capture_training_data.py --camera 0 --interval 2 --duration 120 --camera-id CAM-TEST

# Calibrate camera (interactive)
cd backend
python -m app.calibration ../path/to/frame.jpg

# Train model
cd backend
python ml/train_yolo.py

# Test detection on image
python -c "
from app.vision import detect_boulders_and_measure
dets = detect_boulders_and_measure('test.jpg', 'out.jpg', source_id='CAM-01-CHUTE')
for d in dets: print(f'{d[major_axis_mm]:.0f}mm {d[is_oversize]}')
"

# View API docs
# Open http://localhost:8080/docs in browser
```

---

## 📅 Recommended Timeline

| Week | Milestone |
|------|-----------|
| 1 | Install cameras, verify RTSP streams, mount 200mm calibration plates |
| 1-2 | Capture 2-3 shifts of footage per camera (~5000 frames each) |
| 2-3 | Label in Roboflow (200+ per class), export YOLOv8 |
| 3 | Calibrate all cameras, verify mm accuracy with known rocks |
| 3-4 | Train/fine-tune model, validate on held-out test set |
| 4-5 | Deploy to edge boxes, integrate SCADA alerts, operator HMI |
| 5-6 | Shadow mode (alert only, no auto-action), measure KPIs |
| 6+ | Go live with auto-divert, continuous monitoring |

---

*Generated for OreSentinel AI — Tata Steel Women of Mettle 2026*