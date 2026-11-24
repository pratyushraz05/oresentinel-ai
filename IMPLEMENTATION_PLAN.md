# Camera-Based Object Measurement Feature - Implementation Plan

## Project: OreSentinel AI
**Path:** `C:/Users/HP/.gemini/antigravity/scratch/oresentinel-ai/`

---

## Overview

Integrate a web-based camera measurement feature into the existing OreSentinel AI frontend as a new "Measurement" tab. Users can measure physical objects using their laptop camera, get real-time mm measurements via existing calibration system, provide corrections, and build a training dataset for continuous improvement.

---

## Architecture

### Existing Components to Leverage
| Component | Purpose | Location |
|-----------|---------|----------|
| `LiveWebcamFeed.tsx` | Real-time webcam + YOLO inference + calibration UI | `frontend/src/components/` |
| `RoomScaleCapture.tsx` | Photo capture + auto-labeling + dataset save | `frontend/src/components/` |
| `calibration.py` | Homography-based mm/pixel calibration | `backend/app/` |
| `vision.py` | Object detection with calibrated measurements | `backend/app/` |
| `roomscale_api.py` | Backend API for captures & stats | `backend/app/` |
| `RoomScaleView.tsx` | Dataset management UI | `frontend/src/views/` |

### New Components to Create
| Component | Purpose |
|-----------|---------|
| `MeasurementView.tsx` | Main measurement tab (new route) |
| `MeasurementEngine.ts` | Frontend measurement logic (calibration, pixel→mm) |
| `FeedbackSystem.ts` | User correction collection & storage |
| `CalibrationWizard.tsx` | Reference object calibration workflow |
| `TrainingDataManager.ts` | IndexedDB storage for training examples |
| `measurement_api.py` | Backend endpoints for calibration & feedback |

---

## Implementation Phases

### Phase 1: Core Measurement View (Week 1)
- [ ] Create `MeasurementView.tsx` as new tab in `App.tsx`
- [ ] Integrate `LiveWebcamFeed` component with measurement-specific config
- [ ] Add measurement display overlay (width/height in mm, confidence)
- [ ] Connect to existing `/api/vision/realtime-frame` endpoint
- [ ] Add "Measurement" tab to Header navigation

### Phase 2: Calibration System (Week 1-2)
- [ ] Create `CalibrationWizard.tsx` component
- [ ] Implement reference object detection (ArUco marker / known-size card)
- [ ] Add `/api/calibration/compute` endpoint in `measurement_api.py`
- [ ] Store calibration per camera in backend (`calibration.py`)
- [ ] Auto-load calibration in `LiveWebcamFeed` for measurement mode

### Phase 3: User Feedback Loop (Week 2)
- [ ] Add "Correct/Incorrect" buttons after measurement
- [ ] Create correction input modal (actual width/height + units)
- [ ] Implement `FeedbackSystem.ts` with IndexedDB storage
- [ ] Store: image, bbox, predicted dims, actual dims, distance, calibration, timestamp
- [ ] Add "View Training Data" panel

### Phase 4: Training Data & Model Improvement (Week 2-3)
- [ ] Create `/api/measurement/feedback` endpoint
- [ ] Export training data in YOLO format (images + labels)
- [ ] Add "Retrain with Corrections" button → triggers `train_roomscale.py`
- [ ] Implement calibration correction factor learning (simple regression)
- [ ] Version model checkpoints

### Phase 5: Polish & Evaluation (Week 3)
- [ ] Add measurement uncertainty display
- [ ] Test with known objects (credit card, phone, A4 paper)
- [ ] Document calibration procedure
- [ ] Add error handling for edge cases (tilted objects, occlusion)
- [ ] Performance optimization

---

## Data Models

### Frontend Types (Add to `frontend/src/types.ts`)

```typescript
interface Measurement {
  id: string;
  timestamp: string;
  imageDataUrl: string;  // base64 captured frame
  bbox: [number, number, number, number]; // normalized x,y,w,h
  predictedWidthMm: number;
  predictedHeightMm: number;
  confidence: number;
  calibrationScale: number;
  throatLimitMm: number;
  cameraId: string;
}

interface Correction extends Measurement {
  actualWidthMm: number;
  actualHeightMm: number;
  errorWidthMm: number;
  errorHeightMm: number;
  errorPercent: number;
  userVerified: boolean;
}

interface CameraCalibration {
  cameraId: string;
  mmPerPixelX: number;
  mmPerPixelY: number;
  mmPerPixelAvg: number;
  homographyMatrix: number[][];
  refObjectWidthMm: number;
  refObjectHeightMm: number;
  calibratedAt: string;
}
```

### Backend Models (Add to `backend/app/models.py`)

```python
class MeasurementFeedback(Base):
    __tablename__ = "measurement_feedback"
    id = Column(Integer, primary_key=True)
    camera_id = Column(String(64), index=True)
    image_path = Column(String(256))
    bbox_x = Column(Float)
    bbox_y = Column(Float)
    bbox_w = Column(Float)
    bbox_h = Column(Float)
    predicted_width_mm = Column(Float)
    predicted_height_mm = Column(Float)
    actual_width_mm = Column(Float)
    actual_height_mm = Column(Float)
    calibration_scale = Column(Float)
    calibration_mm_per_pixel = Column(Float)
    error_width_mm = Column(Float)
    error_height_mm = Column(Float)
    user_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

---

## API Endpoints (New: `backend/app/measurement_api.py`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/measurement/calibrate` | POST | Compute calibration from reference corners |
| `/api/measurement/calibrate/aruco` | POST | Auto-detect ArUco marker for calibration |
| `/api/measurement/feedback` | POST | Save user correction |
| `/api/measurement/feedback` | GET | List training examples |
| `/api/measurement/export` | GET | Export dataset for retraining |
| `/api/measurement/stats` | GET | Get accuracy stats (MAE, MAPE) |

---

## UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│  OreSentinel Header (add "Measurement" tab)                 │
├─────────────────────────────────────────────────────────────┤
│  MeasurementView                                            │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ LiveWebcamFeed      │  │ Measurement Panel           │  │
│  │ (measurement mode)  │  │ ┌─────────────────────────┐ │  │
│  │ - YOLO detection    │  │ │ Detected: Rock #1       │ │  │
│  │ - Calibration loaded│  │ │ Width:  245.3 mm  ▼     │ │  │
│  │ - mm overlay        │  │ │ Height: 189.7 mm  ▼     │ │  │
│  │ - Target reticle    │  │ │ Confidence: 87%         │ │  │
│  └─────────────────────┘  │ ├─────────────────────────┤ │  │
│                           │ │ [✓ Correct] [✗ Correct] │ │  │
│  ┌─────────────────────┐  │ └─────────────────────────┘ │  │
│  │ Calibration Wizard  │  │ ┌─────────────────────────┐ │  │
│  │ [Start Calibration] │  │ │ Training Data: 47       │ │  │
│  │ - Place reference   │  │ │ MAE: 12.3 mm (4.2%)     │ │  │
│  │ - Click 4 corners   │  │ │ [Export] [Retrain]      │ │  │
│  │ - Auto-compute H    │  │ └─────────────────────────┘ │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Details

### Measurement Formula (from `calibration.py`)

```python
# Using homography for perspective-correct measurement
corners_px = bbox_to_corners(bbox, image_shape)
corners_mm = cv2.perspectiveTransform(corners_px, homography_matrix)
width_mm = mean(||corners_mm[1]-corners_mm[0]||, ||corners_mm[2]-corners_mm[3]||)
height_mm = mean(||corners_mm[3]-corners_mm[0]||, ||corners_mm[2]-corners_mm[1]||)
```

### Fallback (no calibration)
```python
mm_per_pixel = (conveyor_width_mm / image_width) * calibration_scale
width_mm = bbox_w * image_width * mm_per_pixel
height_mm = bbox_h * image_height * mm_per_pixel
```

### Confidence Calculation
```python
confidence = detection.confidence * calibration_quality * visibility_factor
# calibration_quality: 1.0 if calibrated, 0.7 if fallback
# visibility_factor: based on bbox area, occlusion, edge proximity
```

---

## Files to Create/Modify

### New Files
1. `frontend/src/views/MeasurementView.tsx` - Main view
2. `frontend/src/components/CalibrationWizard.tsx` - Calibration UI
3. `frontend/src/components/MeasurementPanel.tsx` - Results + feedback
4. `frontend/src/utils/measurementEngine.ts` - Core logic
5. `frontend/src/utils/feedbackSystem.ts` - IndexedDB storage
6. `frontend/src/utils/trainingDataManager.ts` - Export/format
7. `backend/app/measurement_api.py` - New API router
8. `backend/app/models.py` - Add MeasurementFeedback model

### Modified Files
1. `frontend/src/App.tsx` - Add Measurement tab + import
2. `frontend/src/components/Header.tsx` - Add tab button
3. `frontend/src/types.ts` - Add new interfaces
4. `frontend/src/api.ts` - Add measurement API calls
5. `backend/app/main.py` - Include measurement_router
6. `backend/app/database.py` - Create tables
7. `backend/requirements.txt` - Add any new deps

---

## Testing Checklist

- [ ] Credit card (85.6mm × 53.98mm) measures within 5%
- [ ] A4 paper (210mm × 297mm) measures within 5%
- [ ] Phone (known dimensions) measures within 5%
- [ ] Calibration persists across sessions
- [ ] Corrections save to IndexedDB
- [ ] Export produces valid YOLO dataset
- [ ] Retrain script runs without errors
- [ ] Model versioning works

---

## Success Criteria

1. **Accuracy**: MAE < 15mm for objects 100-500mm at 30-100cm distance
2. **Usability**: Calibration completes in < 60 seconds
3. **Feedback Loop**: User correction → dataset → retrain in < 5 min
4. **Performance**: > 10 FPS real-time inference on laptop
5. **Privacy**: No images leave browser without explicit consent

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| No camera calibration → poor accuracy | Mandatory calibration wizard on first use |
| Tilted objects → perspective distortion | Homography correction + tilt warning |
| Varying lighting → detection failures | Quality validation + adaptive threshold |
| Browser camera permissions | Clear permission UI + fallback message |
| Model drift from bad corrections | Validation split + human review before retrain |

---

## Next Steps

1. Start with **Phase 1**: Create `MeasurementView.tsx` and wire into `App.tsx`
2. Reuse `LiveWebcamFeed` with `compact={true}` and measurement-specific props
3. Add calibration loading from backend on mount
4. Build measurement display panel
5. Test end-to-end with existing YOLO model

---

*Generated: 2026-01-24*
*Project: OreSentinel AI - Camera Measurement Feature*