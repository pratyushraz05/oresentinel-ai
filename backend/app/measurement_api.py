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
from .calibration import compute_calibration, get_calibration as get_calibration_file
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

    class Config:
        from_attributes = True

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

        return CalibrationResponse(
            success=True,
            calibration={
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
                "notes": calib.notes
            },
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
            return CameraCalibrationSchema(
                camera_id=file_calib.camera_id,
                image_width=file_calib.image_width,
                image_height=file_calib.image_height,
                ref_object_width_mm=file_calib.ref_object_width_mm,
                ref_object_height_mm=file_calib.ref_object_height_mm,
                ref_corners_px=file_calib.ref_corners_px,
                mm_per_pixel_x=file_calib.mm_per_pixel_x,
                mm_per_pixel_y=file_calib.mm_per_pixel_y,
                mm_per_pixel_avg=file_calib.mm_per_pixel_avg,
                homography_matrix=file_calib.homography_matrix,
                calibrated_at=datetime.fromisoformat(file_calib.calibrated_at.replace('Z', '+00:00')),
                notes=file_calib.notes
            )
        raise HTTPException(status_code=404, detail=f"Calibration not found for camera {camera_id}")

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
        calibrated_at=calib.calibrated_at,
        notes=calib.notes
    )


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
            file_calibs.append(CameraCalibrationSchema(
                camera_id=data["camera_id"],
                image_width=data["image_width"],
                image_height=data["image_height"],
                ref_object_width_mm=data["ref_object_width_mm"],
                ref_object_height_mm=data["ref_object_height_mm"],
                ref_corners_px=data["ref_corners_px"],
                mm_per_pixel_x=data["mm_per_pixel_x"],
                mm_per_pixel_y=data["mm_per_pixel_y"],
                mm_per_pixel_avg=data["mm_per_pixel_avg"],
                homography_matrix=data["homography_matrix"],
                calibrated_at=datetime.fromisoformat(data["calibrated_at"].replace('Z', '+00:00')),
                notes=data.get("notes")
            ))

    db_results = [CameraCalibrationSchema(
        camera_id=c.camera_id,
        image_width=c.image_width,
        image_height=c.image_height,
        ref_object_width_mm=c.ref_object_width_mm,
        ref_object_height_mm=c.ref_object_height_mm,
        ref_corners_px=c.ref_corners_px,
        mm_per_pixel_x=c.mm_per_pixel_x,
        mm_per_pixel_y=c.mm_per_pixel_y,
        mm_per_pixel_avg=c.mm_per_pixel_avg,
        homography_matrix=c.homography_matrix,
        calibrated_at=c.calibrated_at,
        notes=c.notes
    ) for c in calibs]

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
    measurement_id: str = Form(...),
    camera_id: str = Form(...),
    image_data_url: str = Form(...),
    bbox: str = Form(...),  # JSON string [x,y,w,h]
    predicted_width_mm: float = Form(...),
    predicted_height_mm: float = Form(...),
    confidence: float = Form(...),
    calibration_scale: float = Form(...),
    throat_limit_mm: float = Form(...),
    actual_width_mm: float = Form(...),
    actual_height_mm: float = Form(...),
    user_verified: bool = Form(...),
    detection_model: str = Form(...),
    detection_confidence: float = Form(...),
    timestamp: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Submit user correction for a measurement.
    Used for continuous learning and accuracy tracking.
    """
    try:
        bbox_list = json.loads(bbox)

        correction = {
            "id": f"corr_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}",
            "measurement_id": measurement_id,
            "camera_id": camera_id,
            "image_data_url": image_data_url,
            "bbox": bbox_list,
            "predicted_width_mm": predicted_width_mm,
            "predicted_height_mm": predicted_height_mm,
            "confidence": confidence,
            "calibration_scale": calibration_scale,
            "throat_limit_mm": throat_limit_mm,
            "actual_width_mm": actual_width_mm,
            "actual_height_mm": actual_height_mm,
            "error_width_mm": abs(predicted_width_mm - actual_width_mm),
            "error_height_mm": abs(predicted_height_mm - actual_height_mm),
            "error_percent": (
                (abs(predicted_width_mm - actual_width_mm) + abs(predicted_height_mm - actual_height_mm)) / 2
                / max(1.0, (actual_width_mm + actual_height_mm) / 2) * 100
            ),
            "user_verified": user_verified,
            "detection_model": detection_model,
            "detection_confidence": detection_confidence,
            "timestamp": timestamp,
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