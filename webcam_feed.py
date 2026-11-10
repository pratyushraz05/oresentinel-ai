"""
OreSentinel AI - Real-time Desktop Webcam Feed & Boulder Inference
Tata Steel / Women of Mettle 2026

Runs OpenCV directly on your laptop camera (camera index 0)
and renders real-time boulder segmentation, millimeter caliber, and crusher throat alerts!
"""

import sys
import math
from pathlib import Path

# Add backend directory
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import cv2
import numpy as np
from app.config import CONFIG
from app.risk_engine import assess_operational_risk
from app.vision import get_yolo_model, is_valid_rock_candidate

def run_desktop_webcam():
    print("=" * 65)
    print("   ORESENTINEL AI - REAL-TIME LAPTOP WEBCAM ROCK DETECTOR")
    print("   Engine: Ultralytics YOLOv8 + Calibrated Ellipse Segmentation")
    print("   Press 'q' to exit | Press 's' to snapshot & save incident")
    print("=" * 65)

    yolo_model = get_yolo_model()
    if yolo_model is not None:
        print("Ultralytics YOLO model loaded successfully!")
    else:
        print("YOLO weights not found, using calibrated edge segmentation fallback.")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Could not open laptop webcam (index 0).")
        print("Please ensure your camera is not in use by another app.")
        return

    # Set 1280x720 resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    throat_limit_mm = CONFIG.throat_limit_mm
    snap_count = 1

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab camera frame.")
            break

        h, w = frame.shape[:2]
        mm_per_pixel = 1600.0 / float(w)
        annotated = frame.copy()
        rock_idx = 1
        yolo_detected = False

        # 1. Try YOLO detection if loaded
        if yolo_model is not None:
            try:
                results = yolo_model(frame, conf=0.25, verbose=False)
                if results and len(results[0].boxes) > 0:
                    for box in results[0].boxes:
                        xyxy = box.xyxy[0].cpu().numpy()
                        x1, y1, x2, y2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])
                        bw, bh = max(10, x2 - x1), max(10, y2 - y1)

                        # Skip full-frame or border background boxes
                        if bw > (w * 0.78) or bh > (h * 0.78) or (bw * bh) > (w * h * 0.48):
                            continue
                        m_b = 6
                        touches = sum([x1 <= m_b, y1 <= m_b, x2 >= (w - m_b), y2 >= (h - m_b)])
                        if touches >= 3:
                            continue

                        yolo_detected = True
                        conf = float(box.conf[0].cpu().numpy())
                        cls_id = int(box.cls[0].cpu().numpy())
                        cls_name = getattr(yolo_model, "names", {}).get(cls_id, "rock")

                        major_px = max(bw, bh)
                        minor_px = min(bw, bh)
                        major_mm = round(major_px * mm_per_pixel, 1)
                        minor_mm = round(minor_px * mm_per_pixel, 1)
                        aspect_ratio = round(major_mm / max(1.0, minor_mm), 2)
                        
                        is_boulder_cls = (cls_id == 0 and "boulder" in str(cls_name).lower())
                        is_oversize = major_mm >= throat_limit_mm or (is_boulder_cls and major_mm >= (throat_limit_mm * 0.88))
                        is_warning = not is_oversize and (major_mm >= CONFIG.warning_threshold_mm or aspect_ratio >= 2.0)

                        if is_oversize:
                            color = (0, 0, 240)
                            label = f"BOULDER #{rock_idx}: {int(major_mm)}mm [OVERSIZE]"
                        elif is_warning:
                            color = (0, 180, 255)
                            label = f"ROCK #{rock_idx}: {int(major_mm)}mm [WARNING]"
                        else:
                            color = (80, 210, 80)
                            label = f"ROCK #{rock_idx}: {int(major_mm)}mm"

                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(annotated, f"{label} ({int(conf*100)}%)", (x1, max(25, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
                        rock_idx += 1
                        if rock_idx > 8:
                            break
            except Exception:
                yolo_detected = False

        # 2. Contour fallback if no YOLO hits
        if not yolo_detected or rock_idx == 1:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            smoothed = cv2.bilateralFilter(gray, 9, 75, 75)
            edges = cv2.Canny(smoothed, 35, 125)

            # Zero outer 3.5% margin to prevent frame edges from forming a giant border rock
            m_y = max(6, int(h * 0.035))
            m_x = max(6, int(w * 0.035))
            edges[:m_y, :] = 0
            edges[-m_y:, :] = 0
            edges[:, :m_x] = 0
            edges[:, -m_x:] = 0

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            closed = cv2.morphologyEx(cv2.dilate(edges, kernel, iterations=1), cv2.MORPH_CLOSE, kernel)
            closed[:m_y, :] = 0
            closed[-m_y:, :] = 0
            closed[:, :m_x] = 0
            closed[:, -m_x:] = 0

            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            sorted_contours = sorted(contours, key=cv2.contourArea, reverse=True)

            accepted_webcam_boxes = []

            for cnt in sorted_contours:
                is_valid, props = is_valid_rock_candidate(cnt, w, h, mm_per_pixel, min_caliber_mm=75.0, max_area_fraction=0.45)
                if not is_valid:
                    continue

                x, y, bw, bh = props["x"], props["y"], props["bw"], props["bh"]
                # Duplicate check
                is_dup = False
                for ox, oy, obw, obh in accepted_webcam_boxes:
                    ix1, iy1 = max(x, ox), max(y, oy)
                    ix2, iy2 = min(x + bw, ox + obw), min(y + bh, oy + obh)
                    if ix2 > ix1 and iy2 > iy1:
                        inter = (ix2 - ix1) * (iy2 - iy1)
                        union = (bw * bh) + (obw * obh) - inter
                        if union > 0 and (inter / union) > 0.40:
                            is_dup = True
                            break
                if is_dup:
                    continue
                accepted_webcam_boxes.append((x, y, bw, bh))

                major_mm = props["major_mm"]
                minor_mm = props["minor_mm"]
                is_oversize = major_mm >= throat_limit_mm

                if is_oversize:
                    color = (0, 0, 240)
                    label = f"CRITICAL BOULDER #{rock_idx}: {int(major_mm)}mm [OVERSIZE]"
                elif major_mm >= CONFIG.warning_threshold_mm:
                    color = (0, 180, 255)
                    label = f"NEAR-LIMIT ROCK #{rock_idx}: {int(major_mm)}mm"
                else:
                    color = (80, 210, 80)
                    label = f"ROCK #{rock_idx}: {int(major_mm)}mm"

                cv2.rectangle(annotated, (x, y), (x + bw, y + bh), color, 2)
                cv2.putText(annotated, label, (x, max(25, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
                rock_idx += 1
                if rock_idx > 8:
                    break

        # Center target guide and status when conveyor is clear
        if rock_idx == 1:
            cv2.putText(
                annotated,
                "CONVEYOR CLEAR - NO ROCK PIECE DETECTED",
                (int(w * 0.18), int(h * 0.48)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (80, 220, 120),
                2
            )
            cx, cy = w // 2, h // 2
            box_sz = int(min(w, h) * 0.45)
            cv2.rectangle(annotated, (cx - box_sz // 2, cy - box_sz // 2), (cx + box_sz // 2, cy + box_sz // 2), (16, 185, 129), 1)
            cv2.putText(
                annotated,
                "PLACE ROCK PIECE INSIDE TARGET AREA",
                (cx - 160, cy + box_sz // 2 + 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (16, 185, 129),
                1
            )

        # Industrial HUD Overlay
        cv2.rectangle(annotated, (0, 0), (w, 45), (10, 20, 18), -1)
        status_txt = "CONVEYOR CLEAR" if rock_idx == 1 else f"DETECTED: {rock_idx - 1} ROCKS"
        cv2.putText(
            annotated,
            f"ORESENTINEL AI | LIVE LAPTOP WEBCAM | THROAT LIMIT: {int(throat_limit_mm)}mm | {status_txt}",
            (16, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (16, 185, 129),
            2
        )

        cv2.imshow("OreSentinel AI - Real-time Laptop Camera Feed", annotated)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            save_path = BASE_DIR / "backend" / "data" / "uploads" / f"webcam_snap_{snap_count}.jpg"
            cv2.imwrite(str(save_path), frame)
            print(f"Captured snapshot saved to {save_path}")
            snap_count += 1

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_desktop_webcam()
