"""
OreSentinel AI - Measurement API Endpoints
Handles camera calibration, user feedback/corrections, and training data export.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pathlib import Path
import json
import base64
import cv2
import numpy as np
from pydantic import BaseModel

from .database import get_db
from .models import CameraCalibration
from .calibration import compute_calibration, get_calibration as get_calibration_file, get_active_system_calibration
from .config import BASE_DIR

router = APIRouter(prefix="/api/measurement", tags=["Measurement"])

# ===== Pydantic Schemas =====

class CalibrationRequest(BaseModel):
    cameraId: str
    refWidthMm: float
    refHeightMm: float
    cornersPx: List[List[float]]  # 4 corners [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    imageWidth: int
    imageHeight: int

class DirectCalibrationRequest(BaseModel):
    camera_id: str = "CAM-WEBCAM-MEASURE"
    box: List[float]  # [x, y, w, h] normalized or pixel coordinates
    actual_width_cm: float
    actual_height_cm: float
    image_width: int = 1280
    image_height: int = 720
    notes: Optional[str] = "Interactive user rectangle calibration"

class CalibrationResponse(BaseModel):
    success: bool
    calibration: Optional[dict] = None
    mmPerPixel: float
    message: Optional[str] = None

class CameraCalibrationSchema(BaseModel):
    camera_id: str
    image_width: int
    image_height: int
    ref_object_width_mm: float
    ref_object_height_mm: float
    ref_corners_px: List[List[float]]
    mm_per_pixel_x: float
    mm_per_pixel_y: float
    mm_per_pixel_avg: float
    homography_matrix: List[List[float]]
    calibrated_at: datetime
    notes: Optional[str] = None

    # camelCase fields for client compatibility
    cameraId: Optional[str] = None
    imageWidth: Optional[int] = None
    imageHeight: Optional[int] = None
    refObjectWidthMm: Optional[float] = None
    refObjectHeightMm: Optional[float] = None
    mmPerPixelX: Optional[float] = None
    mmPerPixelY: Optional[float] = None
    mmPerPixelAvg: Optional[float] = None
    homographyMatrix: Optional[List[List[float]]] = None
    calibratedAt: Optional[str] = None

    class Config:
        from_attributes = True


def to_calib_schema(calib) -> CameraCalibrationSchema:
    """Helper to ensure both snake_case and camelCase fields are populated."""
    cal_dt = calib.calibrated_at
    if isinstance(cal_dt, str):
        cal_dt = datetime.fromisoformat(cal_dt.replace('Z', '+00:00'))
    cal_iso = cal_dt.isoformat()

    return CameraCalibrationSchema(
        camera_id=calib.camera_id,
        image_width=calib.image_width,
        image_height=calib.image_height,
        ref_object_width_mm=calib.ref_object_width_mm,
        ref_object_height_mm=calib.ref_object_height_mm,
        ref_corners_px=calib.ref_corners_px,
        mm_per_pixel_x=calib.mm_per_pixel_x,
        mm_per_pixel_y=calib.mm_per_pixel_y,
        mm_per_pixel_avg=calib.mm_per_pixel_avg,
        homography_matrix=calib.homography_matrix,
        calibrated_at=cal_dt,
        notes=calib.notes,
        cameraId=calib.camera_id,
        imageWidth=calib.image_width,
        imageHeight=calib.image_height,
        refObjectWidthMm=calib.ref_object_width_mm,
        refObjectHeightMm=calib.ref_object_height_mm,
        mmPerPixelX=calib.mm_per_pixel_x,
        mmPerPixelY=calib.mm_per_pixel_y,
        mmPerPixelAvg=calib.mm_per_pixel_avg,
        homographyMatrix=calib.homography_matrix,
        calibratedAt=cal_iso,
    )

class FeedbackRequest(BaseModel):
    measurement_id: str
    camera_id: str
    image_data_url: str
    bbox: List[float]  # [x, y, w, h] normalized
    predicted_width_mm: float
    predicted_height_mm: float
    confidence: float
    calibration_scale: float
    throat_limit_mm: float
    actual_width_mm: float
    actual_height_mm: float
    user_verified: bool
    detection_model: str
    detection_confidence: float
    timestamp: str

class FeedbackResponse(BaseModel):
    success: bool
    correction_id: Optional[int] = None
    message: str

class MeasurementStatsResponse(BaseModel):
    total_measurements: int
    verified_measurements: int
    mean_absolute_error_mm: float
    mean_absolute_percent_error: float

class ExportRequest(BaseModel):
    format: str = "json"  # "json" or "yolo"
    only_verified: bool = True


# ===== Endpoints =====

@router.post("/calibrate", response_model=CalibrationResponse)
async def compute_calibration_endpoint(
    file: UploadFile = File(...),
    camera_id: str = Form(...),
    ref_width_mm: float = Form(...),
    ref_height_mm: float = Form(...),
    corners_px: str = Form(...),  # JSON string of [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    db: Session = Depends(get_db)
):
    """
    Compute camera calibration from reference object corners.
    Expects an image file and corner coordinates in pixels.
    """
    try:
        # Parse corners from JSON string
        corners = json.loads(corners_px)
        if len(corners) != 4:
            raise HTTPException(status_code=400, detail="Need exactly 4 corners")

        # Read image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image")

        # Compute calibration using existing calibration module
        calib = compute_calibration(
            image=img,
            camera_id=camera_id,
            ref_width_mm=ref_width_mm,
            ref_height_mm=ref_height_mm,
            corners_px=corners
        )

        # Save to database
        db_calib = CameraCalibration(
            camera_id=calib.camera_id,
            image_width=calib.image_width,
            image_height=calib.image_height,
            ref_object_width_mm=calib.ref_object_width_mm,
            ref_object_height_mm=calib.ref_object_height_mm,
            ref_corners_px=calib.ref_corners_px,
            mm_per_pixel_x=calib.mm_per_pixel_x,
            mm_per_pixel_y=calib.mm_per_pixel_y,
            mm_per_pixel_avg=calib.mm_per_pixel_avg,
            homography_matrix=calib.homography_matrix,
            calibrated_at=datetime.fromisoformat(calib.calibrated_at.replace('Z', '+00:00')),
            notes=calib.notes
        )

        # Check if calibration already exists for this camera
        existing = db.query(CameraCalibration).filter(
            CameraCalibration.camera_id == camera_id
        ).first()

        if existing:
            # Update existing
            existing.image_width = db_calib.image_width
            existing.image_height = db_calib.image_height
            existing.ref_object_width_mm = db_calib.ref_object_width_mm
            existing.ref_object_height_mm = db_calib.ref_object_height_mm
            existing.ref_corners_px = db_calib.ref_corners_px
            existing.mm_per_pixel_x = db_calib.mm_per_pixel_x
            existing.mm_per_pixel_y = db_calib.mm_per_pixel_y
            existing.mm_per_pixel_avg = db_calib.mm_per_pixel_avg
            existing.homography_matrix = db_calib.homography_matrix
            existing.calibrated_at = db_calib.calibrated_at
            existing.notes = db_calib.notes
        else:
            db.add(db_calib)

        db.commit()

        calib_dict = {
            "camera_id": calib.camera_id,
            "image_width": calib.image_width,
            "image_height": calib.image_height,
            "ref_object_width_mm": calib.ref_object_width_mm,
            "ref_object_height_mm": calib.ref_object_height_mm,
            "ref_corners_px": calib.ref_corners_px,
            "mm_per_pixel_x": calib.mm_per_pixel_x,
            "mm_per_pixel_y": calib.mm_per_pixel_y,
            "mm_per_pixel_avg": calib.mm_per_pixel_avg,
            "homography_matrix": calib.homography_matrix,
            "calibrated_at": calib.calibrated_at,
            "notes": calib.notes,
            # camelCase aliases for frontend clients
            "cameraId": calib.camera_id,
            "imageWidth": calib.image_width,
            "imageHeight": calib.image_height,
            "refObjectWidthMm": calib.ref_object_width_mm,
            "refObjectHeightMm": calib.ref_object_height_mm,
            "refCornersPx": calib.ref_corners_px,
            "mmPerPixelX": calib.mm_per_pixel_x,
            "mmPerPixelY": calib.mm_per_pixel_y,
            "mmPerPixelAvg": calib.mm_per_pixel_avg,
            "homographyMatrix": calib.homography_matrix,
            "calibratedAt": calib.calibrated_at,
        }

        return CalibrationResponse(
            success=True,
            calibration=calib_dict,
            mmPerPixel=calib.mm_per_pixel_avg,
            message=f"Calibration saved for {camera_id}"
        )

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid corners JSON format")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calibrate/direct", response_model=CameraCalibrationSchema)
async def direct_calibration_endpoint(
    req: DirectCalibrationRequest,
    db: Session = Depends(get_db)
):
    """
    Directly recalibrates the measurement camera using the user's adjusted or drawn rectangle
    and real-world centimeter measurements.
    """
    try:
        actual_width_mm = max(1.0, float(req.actual_width_cm) * 10.0)
        actual_height_mm = max(1.0, float(req.actual_height_cm) * 10.0)

        is_norm = all(v <= 1.05 for v in req.box)
        w_px = float(req.box[2] * req.image_width) if is_norm else float(req.box[2])
        h_px = float(req.box[3] * req.image_height) if is_norm else float(req.box[3])
        x_px = float(req.box[0] * req.image_width) if is_norm else float(req.box[0])
        y_px = float(req.box[1] * req.image_height) if is_norm else float(req.box[1])

        w_px = max(5.0, w_px)
        h_px = max(5.0, h_px)

        mm_per_pixel_x = actual_width_mm / w_px
        mm_per_pixel_y = actual_height_mm / h_px
        mm_per_pixel_avg = (mm_per_pixel_x + mm_per_pixel_y) / 2.0

        corners_px = [
            [x_px, y_px],
            [x_px + w_px, y_px],
            [x_px + w_px, y_px + h_px],
            [x_px, y_px + h_px]
        ]
        corners_mm = [
            [0.0, 0.0],
            [actual_width_mm, 0.0],
            [actual_width_mm, actual_height_mm],
            [0.0, actual_height_mm]
        ]

        try:
            H, _ = cv2.findHomography(
                np.array(corners_px, dtype=np.float32),
                np.array(corners_mm, dtype=np.float32)
            )
            homography_matrix = H.tolist() if H is not None else [
                [mm_per_pixel_x, 0.0, -x_px * mm_per_pixel_x],
                [0.0, mm_per_pixel_y, -y_px * mm_per_pixel_y],
                [0.0, 0.0, 1.0]
            ]
        except Exception:
            homography_matrix = [
                [mm_per_pixel_x, 0.0, -x_px * mm_per_pixel_x],
                [0.0, mm_per_pixel_y, -y_px * mm_per_pixel_y],
                [0.0, 0.0, 1.0]
            ]

        calib_obj = CameraCalibration(
            camera_id=req.camera_id,
            image_width=req.image_width,
            image_height=req.image_height,
            ref_object_width_mm=actual_width_mm,
            ref_object_height_mm=actual_height_mm,
            ref_corners_px=corners_px,
            mm_per_pixel_x=mm_per_pixel_x,
            mm_per_pixel_y=mm_per_pixel_y,
            mm_per_pixel_avg=mm_per_pixel_avg,
            homography_matrix=homography_matrix,
            calibrated_at=datetime.utcnow(),
            notes=req.notes or f"Recalibrated: {req.actual_width_cm}x{req.actual_height_cm}cm"
        )

        existing = db.query(CameraCalibration).filter(
            CameraCalibration.camera_id == req.camera_id
        ).first()

        if existing:
            existing.image_width = calib_obj.image_width
            existing.image_height = calib_obj.image_height
            existing.ref_object_width_mm = calib_obj.ref_object_width_mm
            existing.ref_object_height_mm = calib_obj.ref_object_height_mm
            existing.ref_corners_px = calib_obj.ref_corners_px
            existing.mm_per_pixel_x = calib_obj.mm_per_pixel_x
            existing.mm_per_pixel_y = calib_obj.mm_per_pixel_y
            existing.mm_per_pixel_avg = calib_obj.mm_per_pixel_avg
            existing.homography_matrix = calib_obj.homography_matrix
            existing.calibrated_at = calib_obj.calibrated_at
            existing.notes = calib_obj.notes
            calib_saved = existing
        else:
            db.add(calib_obj)
            calib_saved = calib_obj

        db.commit()

        # Save to filesystem
        calib_file = BASE_DIR / "calibration" / f"calib_{req.camera_id}.json"
        active_calib_file = BASE_DIR / "calibration" / "calib_system_active.json"
        try:
            calib_file.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "camera_id": req.camera_id,
                "image_width": req.image_width,
                "image_height": req.image_height,
                "ref_object_width_mm": actual_width_mm,
                "ref_object_height_mm": actual_height_mm,
                "ref_corners_px": corners_px,
                "mm_per_pixel_x": mm_per_pixel_x,
                "mm_per_pixel_y": mm_per_pixel_y,
                "mm_per_pixel_avg": mm_per_pixel_avg,
                "homography_matrix": homography_matrix,
                "calibrated_at": datetime.utcnow().isoformat(),
                "notes": req.notes or ""
            }
            with open(calib_file, "w") as f:
                json.dump(payload, f, indent=2)
            with open(active_calib_file, "w") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass

        return to_calib_schema(calib_saved)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active-calibration", response_model=Optional[CameraCalibrationSchema])
async def get_active_calibration_endpoint(db: Session = Depends(get_db)):
    """
    Get the currently active system-wide camera calibration.
    Returns the calibration scale used for ore measurement across all streams and models.
    """
    active_calib = get_active_system_calibration()
    if active_calib:
        return to_calib_schema(active_calib)
    return None


@router.get("/system-calibration-status")
async def get_system_calibration_status(db: Session = Depends(get_db)):
    """
    Returns system-wide camera calibration status, scale factors, and whether
    initial camera calibration has been completed by the user.
    """
    active_calib = get_active_system_calibration()
    if active_calib:
        schema = to_calib_schema(active_calib)
        return {
            "is_calibrated": True,
            "camera_id": active_calib.camera_id,
            "mm_per_pixel": round(active_calib.mm_per_pixel_avg, 4),
            "cm_per_pixel": round(active_calib.mm_per_pixel_avg / 10.0, 5),
            "calibrated_at": active_calib.calibrated_at,
            "notes": active_calib.notes,
            "active_calibration": schema
        }
    return {
        "is_calibrated": False,
        "camera_id": None,
        "mm_per_pixel": 1.25,
        "cm_per_pixel": 0.125,
        "calibrated_at": None,
        "notes": "Uncalibrated - using system default fallback scale",
        "active_calibration": None
    }


@router.get("/calibration/{camera_id}", response_model=CameraCalibrationSchema)
async def get_calibration_endpoint(camera_id: str, db: Session = Depends(get_db)):
    """Get calibration for a specific camera."""
    calib = db.query(CameraCalibration).filter(
        CameraCalibration.camera_id == camera_id
    ).first()

    if not calib:
        # Try loading from file system
        file_calib = get_calibration_file(camera_id)
        if file_calib:
            return to_calib_schema(file_calib)
        raise HTTPException(status_code=404, detail=f"Calibration not found for camera {camera_id}")

    return to_calib_schema(calib)


@router.get("/calibrations", response_model=List[CameraCalibrationSchema])
async def list_calibrations_endpoint(db: Session = Depends(get_db)):
    """List all saved calibrations."""
    calibs = db.query(CameraCalibration).all()

    # Also include file-based calibrations not in DB
    file_calibs = []
    for calib_file in Path(BASE_DIR / "calibration").glob("calib_*.json"):
        with open(calib_file) as f:
            data = json.load(f)
        camera_id = data.get("camera_id")
        if camera_id and not any(c.camera_id == camera_id for c in calibs):
            from .calibration import CameraCalibration as FileCamCalib
            try:
                fc = FileCamCalib.from_dict(data)
                file_calibs.append(to_calib_schema(fc))
            except Exception:
                pass

    db_results = [to_calib_schema(c) for c in calibs]

    return db_results + file_calibs


@router.delete("/calibration/{camera_id}")
async def delete_calibration_endpoint(camera_id: str, db: Session = Depends(get_db)):
    """Delete a camera calibration."""
    calib = db.query(CameraCalibration).filter(
        CameraCalibration.camera_id == camera_id
    ).first()

    if calib:
        db.delete(calib)
        db.commit()

    # Also delete from file system
    calib_file = BASE_DIR / "calibration" / f"calib_{camera_id}.json"
    if calib_file.exists():
        calib_file.unlink()

    return {"success": True, "message": f"Calibration for {camera_id} deleted"}


# ===== Feedback/Corrections =====

# In-memory storage for corrections (in production, use a proper table)
# For now, we'll store in a JSON file for simplicity
CORRECTIONS_FILE = BASE_DIR / "data" / "measurement_corrections.json"

def load_corrections() -> List[dict]:
    if CORRECTIONS_FILE.exists():
        with open(CORRECTIONS_FILE) as f:
            return json.load(f)
    return []

def save_corrections(corrections: List[dict]):
    CORRECTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CORRECTIONS_FILE, 'w') as f:
        json.dump(corrections, f, indent=2)

@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db)
):
    """
    Submit user correction for a measurement.
    Used for continuous learning and accuracy tracking.
    """
    try:
        correction = {
            "id": f"corr_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}",
            "measurement_id": req.measurement_id,
            "camera_id": req.camera_id,
            "image_data_url": req.image_data_url,
            "bbox": req.bbox,
            "predicted_width_mm": req.predicted_width_mm,
            "predicted_height_mm": req.predicted_height_mm,
            "confidence": req.confidence,
            "calibration_scale": req.calibration_scale,
            "throat_limit_mm": req.throat_limit_mm,
            "actual_width_mm": req.actual_width_mm,
            "actual_height_mm": req.actual_height_mm,
            "error_width_mm": abs(req.predicted_width_mm - req.actual_width_mm),
            "error_height_mm": abs(req.predicted_height_mm - req.actual_height_mm),
            "error_percent": (
                (abs(req.predicted_width_mm - req.actual_width_mm) + abs(req.predicted_height_mm - req.actual_height_mm)) / 2
                / max(1.0, (req.actual_width_mm + req.actual_height_mm) / 2) * 100
            ),
            "user_verified": req.user_verified,
            "detection_model": req.detection_model,
            "detection_confidence": req.detection_confidence,
            "timestamp": req.timestamp,
            "submitted_at": datetime.utcnow().isoformat()
        }

        corrections = load_corrections()
        corrections.append(correction)
        save_corrections(corrections)

        return FeedbackResponse(
            success=True,
            correction_id=len(corrections),
            message="Correction saved successfully"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feedback", response_model=List[dict])
async def get_feedback(camera_id: Optional[str] = None, only_verified: bool = False):
    """Get all feedback/corrections."""
    corrections = load_corrections()

    if camera_id:
        corrections = [c for c in corrections if c.get("camera_id") == camera_id]

    if only_verified:
        corrections = [c for c in corrections if c.get("user_verified")]

    return corrections


@router.get("/stats", response_model=MeasurementStatsResponse)
async def get_measurement_stats(camera_id: Optional[str] = None):
    """Get measurement accuracy statistics."""
    corrections = load_corrections()

    if camera_id:
        corrections = [c for c in corrections if c.get("camera_id") == camera_id]

    verified = [c for c in corrections if c.get("user_verified")]

    if not verified:
        return MeasurementStatsResponse(
            total_measurements=len(corrections),
            verified_measurements=0,
            mean_absolute_error_mm=0.0,
            mean_absolute_percent_error=0.0
        )

    # Calculate MAE
    errors = [(c["error_width_mm"] + c["error_height_mm"]) / 2 for c in verified]
    mae = sum(errors) / len(errors)

    # Calculate MAPE
    mape = sum(c["error_percent"] for c in verified) / len(verified)

    return MeasurementStatsResponse(
        total_measurements=len(corrections),
        verified_measurements=len(verified),
        mean_absolute_error_mm=round(mae, 2),
        mean_absolute_percent_error=round(mape, 2)
    )


# ===== Export for Training =====

@router.post("/export")
async def export_training_data(request: ExportRequest):
    """Export training data in JSON or YOLO format."""
    corrections = load_corrections()

    if request.only_verified:
        corrections = [c for c in corrections if c.get("user_verified")]

    if request.format == "yolo":
        # Export in YOLO format (images + labels)
        # For now, return the data structure
        images = []
        labels = []

        for i, c in enumerate(corrections):
            # Extract base64 image data
            img_data = c["image_data_url"]
            if img_data.startswith("data:image"):
                # Remove data URL prefix
                img_data = img_data.split(",")[1]

            filename = f"meas_{c['id']}_{i}.jpg"
            images.append({
                "filename": filename,
                "data_url": c["image_data_url"]
            })

            # YOLO format: class_id x_center y_center width height (normalized)
            bbox = c["bbox"]  # [x, y, w, h] normalized
            label = f"0 {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}"
            labels.append({
                "filename": f"meas_{c['id']}_{i}.txt",
                "content": label
            })

        return {
            "format": "yolo",
            "images": images,
            "labels": labels,
            "count": len(corrections),
            "note": "Save images and labels to YOLO dataset structure for retraining"
        }

    else:
        # JSON format with full metadata
        export_data = {
            "exported_at": datetime.utcnow().isoformat(),
            "version": "1.0",
            "total_corrections": len(corrections),
            "verified_only": request.only_verified,
            "corrections": corrections
        }

        return export_data


@router.delete("/feedback")
async def clear_feedback():
    """Clear all feedback data (for testing)."""
    save_corrections([])
    return {"success": True, "message": "All feedback cleared"}


# ===== Calibration Correction Factor Learning =====

@router.get("/calibration/factor/{camera_id}")
async def get_calibration_factor(camera_id: str):
    """
    Get learned calibration correction factor based on historical errors.
    Returns a multiplier to apply to future measurements from this camera.
    """
    corrections = load_corrections()
    camera_corrections = [c for c in corrections if c.get("camera_id") == camera_id and c.get("user_verified")]

    if len(camera_corrections) < 5:
        return {
            "camera_id": camera_id,
            "factor": 1.0,
            "sample_size": len(camera_corrections),
            "message": "Insufficient data for correction factor (need 5+ verified corrections)"
        }

    # Calculate average error ratio
    ratios = []
    for c in camera_corrections:
        pred_avg = (c["predicted_width_mm"] + c["predicted_height_mm"]) / 2
        actual_avg = (c["actual_width_mm"] + c["actual_height_mm"]) / 2
        if pred_avg > 0:
            ratios.append(actual_avg / pred_avg)

    if not ratios:
        return {
            "camera_id": camera_id,
            "factor": 1.0,
            "sample_size": 0
        }

    factor = sum(ratios) / len(ratios)

    # Clamp factor to reasonable range
    factor = max(0.5, min(2.0, factor))

    return {
        "camera_id": camera_id,
        "factor": round(factor, 4),
        "sample_size": len(camera_corrections),
        "raw_factor": round(sum(ratios) / len(ratios), 4),
        "individual_ratios": [round(r, 4) for r in ratios]
    }