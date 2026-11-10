"""
OreSentinel AI - Camera Calibration Module
Computes accurate mm/pixel scale and perspective correction from known reference object.
"""

import cv2
import numpy as np
import json
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass, asdict
from .config import BASE_DIR, CONFIG

CALIBRATION_DIR = BASE_DIR / "calibration"
CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class CameraCalibration:
    """Stores complete calibration for one camera."""
    camera_id: str
    image_width: int
    image_height: int
    # Reference object (physical)
    ref_object_width_mm: float
    ref_object_height_mm: float
    # Pixel coordinates of 4 corners (clockwise from top-left)
    ref_corners_px: List[List[float]]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    # Computed
    mm_per_pixel_x: float
    mm_per_pixel_y: float
    mm_per_pixel_avg: float
    homography_matrix: List[List[float]]  # 3x3 perspective transform
    calibrated_at: str
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'CameraCalibration':
        return cls(**data)

    def save(self, path: Optional[Path] = None) -> Path:
        if path is None:
            path = CALIBRATION_DIR / f"calib_{self.camera_id}.json"
        with open(path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
        return path

    @classmethod
    def load(cls, camera_id: str) -> Optional['CameraCalibration']:
        path = CALIBRATION_DIR / f"calib_{camera_id}.json"
        if not path.exists():
            return None
        with open(path, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)


def compute_calibration(
    image: np.ndarray,
    camera_id: str,
    ref_width_mm: float = 200.0,
    ref_height_mm: float = 200.0,
    corners_px: Optional[List[List[float]]] = None
) -> CameraCalibration:
    """
    Compute calibration from reference object corners.

    Args:
        image: Input image (for dimensions)
        camera_id: Unique camera identifier
        ref_width_mm: Known width of reference object in mm
        ref_height_mm: Known height of reference object in mm
        corners_px: 4 corners [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] clockwise from top-left.
                   If None, opens interactive window for manual selection.

    Returns:
        CameraCalibration with homography and mm/pixel scale
    """
    h, w = image.shape[:2]

    if corners_px is None:
        corners_px = _interactive_corner_selection(image, camera_id)

    if len(corners_px) != 4:
        raise ValueError(f"Need exactly 4 corners, got {len(corners_px)}")

    corners_px = np.array(corners_px, dtype=np.float32)

    # Destination points: perfect rectangle in mm (top-left origin)
    dst_pts = np.array([
        [0, 0],
        [ref_width_mm, 0],
        [ref_width_mm, ref_height_mm],
        [0, ref_height_mm]
    ], dtype=np.float32)

    # Compute homography: pixel -> mm (bird's-eye view)
    H, _ = cv2.findHomography(corners_px, dst_pts, cv2.RANSAC, 5.0)

    if H is None:
        raise RuntimeError("Homography computation failed - check corner order")

    # Compute mm/pixel scale from homography
    # Transform unit vectors to get scale
    test_pts = np.array([[[0, 0]], [[1, 0]], [[0, 1]]], dtype=np.float32)
    transformed = cv2.perspectiveTransform(test_pts, H)

    mm_per_px_x = np.linalg.norm(transformed[1] - transformed[0])  # x-axis scale
    mm_per_px_y = np.linalg.norm(transformed[2] - transformed[0])  # y-axis scale
    mm_per_px_avg = (mm_per_px_x + mm_per_px_y) / 2.0

    from datetime import datetime
    calib = CameraCalibration(
        camera_id=camera_id,
        image_width=w,
        image_height=h,
        ref_object_width_mm=ref_width_mm,
        ref_object_height_mm=ref_height_mm,
        ref_corners_px=corners_px.tolist(),
        mm_per_pixel_x=float(mm_per_px_x),
        mm_per_pixel_y=float(mm_per_px_y),
        mm_per_pixel_avg=float(mm_per_px_avg),
        homography_matrix=H.tolist(),
        calibrated_at=datetime.utcnow().isoformat(),
        notes=f"Ref object: {ref_width_mm}x{ref_height_mm}mm"
    )

    calib.save()
    return calib


def _interactive_corner_selection(image: np.ndarray, camera_id: str) -> List[List[float]]:
    """Open window for user to click 4 corners of reference object."""
    corners = []
    display_img = image.copy()
    h, w = image.shape[:2]

    # Scale down if too large for screen
    max_display = 900
    scale = min(1.0, max_display / max(w, h))
    display_w, display_h = int(w * scale), int(h * scale)
    display_img = cv2.resize(display_img, (display_w, display_h))

    def mouse_callback(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(corners) < 4:
            # Convert back to original image coordinates
            orig_x = x / scale
            orig_y = y / scale
            corners.append([orig_x, orig_y])
            # Draw on display
            cv2.circle(display_img, (x, y), 8, (0, 255, 0), -1)
            cv2.putText(display_img, f"{len(corners)}", (x + 10, y - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            if len(corners) > 1:
                cv2.line(display_img,
                        (int(corners[-2][0] * scale), int(corners[-2][1] * scale)),
                        (x, y), (0, 255, 0), 2)
            if len(corners) == 4:
                # Close the polygon
                cv2.line(display_img, (x, y),
                        (int(corners[0][0] * scale), int(corners[0][1] * scale)),
                        (0, 255, 0), 2)
            cv2.imshow(f"Calibrate {camera_id} - Click 4 corners (TL, TR, BR, BL)", display_img)

    cv2.namedWindow(f"Calibrate {camera_id} - Click 4 corners (TL, TR, BR, BL)", cv2.WINDOW_NORMAL)
    cv2.resizeWindow(f"Calibrate {camera_id} - Click 4 corners (TL, TR, BR, BL)", display_w, display_h)
    cv2.imshow(f"Calibrate {camera_id} - Click 4 corners (TL, TR, BR, BL)", display_img)
    cv2.setMouseCallback(f"Calibrate {camera_id} - Click 4 corners (TL, TR, BR, BL)", mouse_callback)

    print(f"\n[CALIBRATION] {camera_id}")
    print("   Click 4 corners of reference object in order:")
    print("   1. Top-Left  2. Top-Right  3. Bottom-Right  4. Bottom-Left")
    print("   Press 'r' to reset, 'q' to quit without saving\n")

    while True:
        key = cv2.waitKey(100) & 0xFF
        if key == ord('r'):
            corners.clear()
            display_img = cv2.resize(image, (display_w, display_h))
            cv2.imshow(f"Calibrate {camera_id} - Click 4 corners (TL, TR, BR, BL)", display_img)
        elif key == ord('q') or len(corners) == 4:
            break

    cv2.destroyAllWindows()

    if len(corners) != 4:
        raise ValueError("Calibration cancelled - need 4 corners")

    return corners


def apply_calibration(
    detection_bbox: List[float],  # [x, y, w, h] normalized 0-1
    calibration: CameraCalibration,
    image_shape: Tuple[int, int]  # (h, w)
) -> Dict[str, float]:
    """
    Convert normalized YOLO bbox to calibrated mm measurements.

    Returns:
        dict with: center_x_mm, center_y_mm, width_mm, height_mm,
                   major_axis_mm, minor_axis_mm, area_mm2
    """
    h, w = image_shape
    x_norm, y_norm, bw_norm, bh_norm = detection_bbox

    # Denormalize to pixel coordinates
    cx_px = x_norm * w
    cy_px = y_norm * h
    bw_px = bw_norm * w
    bh_px = bh_norm * h

    # Four corners of bbox in pixel coordinates
    corners_px = np.array([
        [cx_px - bw_px/2, cy_px - bh_px/2],
        [cx_px + bw_px/2, cy_px - bh_px/2],
        [cx_px + bw_px/2, cy_px + bh_px/2],
        [cx_px - bw_px/2, cy_px + bh_px/2]
    ], dtype=np.float32).reshape(-1, 1, 2)

    # Transform to mm space using homography
    H = np.array(calibration.homography_matrix, dtype=np.float32)
    corners_mm = cv2.perspectiveTransform(corners_px, H).reshape(4, 2)

    # Compute dimensions in mm
    widths = [
        np.linalg.norm(corners_mm[1] - corners_mm[0]),
        np.linalg.norm(corners_mm[2] - corners_mm[3])
    ]
    heights = [
        np.linalg.norm(corners_mm[3] - corners_mm[0]),
        np.linalg.norm(corners_mm[2] - corners_mm[1])
    ]

    width_mm = float(np.mean(widths))
    height_mm = float(np.mean(heights))
    major_mm = max(width_mm, height_mm)
    minor_mm = min(width_mm, height_mm)
    area_mm2 = width_mm * height_mm

    # Center in mm
    center_mm = corners_mm.mean(axis=0)

    return {
        "center_x_mm": float(center_mm[0]),
        "center_y_mm": float(center_mm[1]),
        "width_mm": width_mm,
        "height_mm": height_mm,
        "major_axis_mm": major_mm,
        "minor_axis_mm": minor_mm,
        "area_mm2": area_mm2,
        "aspect_ratio": major_mm / max(1.0, minor_mm)
    }


def warp_to_birdseye(image: np.ndarray, calibration: CameraCalibration,
                     output_size_mm: Tuple[float, float] = (2000, 1500),
                     ppm: float = 2.0) -> np.ndarray:
    """
    Warp image to bird's-eye view in mm space.

    Args:
        image: Source image
        calibration: CameraCalibration object
        output_size_mm: Desired output size in mm (width, height)
        ppm: Pixels per mm in output image

    Returns:
        Warped image (top-down view, metric scale)
    """
    H = np.array(calibration.homography_matrix, dtype=np.float32)
    out_w = int(output_size_mm[0] * ppm)
    out_h = int(output_size_mm[1] * ppm)

    # Scale homography for output ppm
    scale_matrix = np.array([[ppm, 0, 0], [0, ppm, 0], [0, 0, 1]], dtype=np.float32)
    H_scaled = scale_matrix @ H

    warped = cv2.warpPerspective(image, H_scaled, (out_w, out_h))
    return warped


def list_calibrations() -> List[CameraCalibration]:
    """Load all saved calibrations."""
    calibs = []
    for path in CALIBRATION_DIR.glob("calib_*.json"):
        with open(path, 'r') as f:
            data = json.load(f)
        calibs.append(CameraCalibration.from_dict(data))
    return calibs


def get_calibration(camera_id: str) -> Optional[CameraCalibration]:
    """Get calibration for specific camera."""
    return CameraCalibration.load(camera_id)


if __name__ == "__main__":
    # Quick test with a sample image
    import sys
    test_image = sys.argv[1] if len(sys.argv) > 1 else None

    if test_image and Path(test_image).exists():
        img = cv2.imread(test_image)
        calib = compute_calibration(img, "TEST_CAM", 200.0, 200.0)
        print(f"\n[SAVED] Calibration saved:")
        print(f"   mm/px (avg): {calib.mm_per_pixel_avg:.4f}")
        print(f"   mm/px (x):   {calib.mm_per_pixel_x:.4f}")
        print(f"   mm/px (y):   {calib.mm_per_pixel_y:.4f}")
    else:
        print("Usage: python calibration.py <image_path>")
        print("       Opens interactive window to click 4 corners of 200mm reference plate")