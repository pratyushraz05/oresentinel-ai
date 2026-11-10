import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import MediaRecord, Detection, Incident, CrusherOutcome, AuditLog
from .config import CONFIG, FIXTURES_DIR
from .vision import generate_synthetic_industrial_specimens, detect_boulders_and_measure, validate_image_quality
from .risk_engine import assess_operational_risk

def seed_database(db: Session):
    """
    Seeds initial synthetic specimens, media records, detections, incidents, and audit trails.
    """
    # First generate base specimen image fixtures if not already present
    generate_synthetic_industrial_specimens()

    if db.query(Incident).count() > 0:
        return  # Already seeded

    print("Seeding OreSentinel AI operational database...")

    now = datetime.utcnow()

    # Pre-defined realistic incidents
    scenarios = [
        {
            "num": "INC-2026-0081",
            "fixture": "specimen_critical_boulder.jpg",
            "source": "CAM-01-CHUTE",
            "age_hours": 72,
            "operator": "OP-R.Sharma",
            "action": "DIVERT_CHUTE",
            "notes": "Diverted oversize iron ore boulder into oversize bypass chute. Hydraulic breaker deployed.",
            "status": "DIVERTED",
            "lead_time": 68.0,
            "outcome_type": "AVOIDED_STOPPAGE",
            "avoided_mins": 55.0,
            "actual_mins": 0.0,
        },
        {
            "num": "INC-2026-0082",
            "fixture": "specimen_elongated_slab.jpg",
            "source": "CAM-02-JAW",
            "age_hours": 64,
            "operator": "OP-A.Chatterjee",
            "action": "HALT_CONVEYOR",
            "notes": "Belt temporarily slowed to reposition slab before entering primary jaw throat.",
            "status": "RESOLVED",
            "lead_time": 82.0,
            "outcome_type": "AVOIDED_STOPPAGE",
            "avoided_mins": 40.0,
            "actual_mins": 4.0,
        },
        {
            "num": "INC-2026-0083",
            "fixture": "specimen_normal_feed.jpg",
            "source": "CAM-01-CHUTE",
            "age_hours": 50,
            "operator": "OP-R.Sharma",
            "action": "MANUAL_OVERRIDE",
            "notes": "Feed stream fragmentation within nominal limits. Crushing uninterrupted.",
            "status": "RESOLVED",
            "lead_time": 45.0,
            "outcome_type": "AVOIDED_STOPPAGE",
            "avoided_mins": 0.0,
            "actual_mins": 0.0,
        },
        {
            "num": "INC-2026-0084",
            "fixture": "specimen_cluster_jam.jpg",
            "source": "CAM-03-TRANSFER",
            "age_hours": 36,
            "operator": "OP-K.Mehta",
            "action": "DIVERT_CHUTE",
            "notes": "Cluster feed intercepted at transfer point before primary chute buildup.",
            "status": "DIVERTED",
            "lead_time": 95.0,
            "outcome_type": "AVOIDED_STOPPAGE",
            "avoided_mins": 60.0,
            "actual_mins": 0.0,
        },
        {
            "num": "INC-2026-0085",
            "fixture": "specimen_critical_boulder.jpg",
            "source": "CAM-01-CHUTE",
            "age_hours": 22,
            "operator": "OP-A.Chatterjee",
            "action": "HALT_CONVEYOR",
            "notes": "Overband magnet and diverter gate active. 1080mm boulder safely removed.",
            "status": "DIVERTED",
            "lead_time": 71.0,
            "outcome_type": "AVOIDED_STOPPAGE",
            "avoided_mins": 75.0,
            "actual_mins": 0.0,
        },
        {
            "num": "INC-2026-0086",
            "fixture": "specimen_elongated_slab.jpg",
            "source": "CAM-02-JAW",
            "age_hours": 8,
            "operator": "OP-R.Sharma",
            "action": "DIVERT_CHUTE",
            "notes": "Secondary rock breaker station notified. Stoppage prevented.",
            "status": "RESOLVED",
            "lead_time": 64.0,
            "outcome_type": "AVOIDED_STOPPAGE",
            "avoided_mins": 45.0,
            "actual_mins": 0.0,
        },
        {
            "num": "INC-2026-0087",
            "fixture": "specimen_critical_boulder.jpg",
            "source": "CAM-01-CHUTE",
            "age_hours": 2,
            "operator": None,
            "action": None,
            "notes": None,
            "status": "PENDING_REVIEW",  # Live pending alert for immediate user action!
            "lead_time": None,
            "outcome_type": None,
            "avoided_mins": 0.0,
            "actual_mins": 0.0,
        }
    ]

    for item in scenarios:
        created_time = now - timedelta(hours=item["age_hours"])
        fixture_path = FIXTURES_DIR / item["fixture"]
        annotated_filename = f"annotated_{item['num']}_{item['fixture']}"
        annotated_path = FIXTURES_DIR / annotated_filename

        # Run vision detection
        is_valid, q_score, q_notes = validate_image_quality(str(fixture_path))
        detections_data = detect_boulders_and_measure(
            str(fixture_path),
            str(annotated_path),
            throat_limit_mm=CONFIG.throat_limit_mm,
            conveyor_width_mm=CONFIG.conveyor_width_mm
        )

        severity, risk_score, max_boulder_mm, bridging_prob, explanation = assess_operational_risk(
            detections_data,
            throat_limit_mm=CONFIG.throat_limit_mm,
            warning_threshold_mm=CONFIG.warning_threshold_mm
        )

        media = MediaRecord(
            filename=item["fixture"],
            original_path=str(fixture_path),
            annotated_path=str(annotated_path),
            source_id=item["source"],
            source_type="CAMERA_FEED",
            resolution="1920x1080",
            validation_status="VALIDATED" if is_valid else "QC_WARNING",
            quality_score=q_score,
            validation_notes=q_notes,
            created_at=created_time
        )
        db.add(media)
        db.flush()

        for det in detections_data:
            d_obj = Detection(
                media_record_id=media.id,
                rock_index=det["rock_index"],
                bbox_x=det["bbox_x"],
                bbox_y=det["bbox_y"],
                bbox_w=det["bbox_w"],
                bbox_h=det["bbox_h"],
                major_axis_mm=det["major_axis_mm"],
                minor_axis_mm=det["minor_axis_mm"],
                aspect_ratio=det["aspect_ratio"],
                estimated_volume_dm3=det["estimated_volume_dm3"],
                estimated_mass_kg=det["estimated_mass_kg"],
                confidence=det["confidence"],
                is_oversize=det["is_oversize"],
                model_name=det["model_name"]
            )
            db.add(d_obj)

        ack_time = created_time + timedelta(seconds=item["lead_time"]) if item["lead_time"] else None
        res_time = ack_time + timedelta(minutes=5) if ack_time else None

        incident = Incident(
            incident_number=item["num"],
            media_record_id=media.id,
            severity=severity,
            risk_score=risk_score,
            max_boulder_mm=max_boulder_mm,
            bridging_probability=bridging_prob,
            explanation=explanation,
            status=item["status"],
            operator_id=item["operator"],
            operator_action=item["action"],
            operator_notes=item["notes"],
            created_at=created_time,
            acknowledged_at=ack_time,
            resolved_at=res_time,
            lead_time_seconds=item["lead_time"]
        )
        db.add(incident)
        db.flush()

        # Audit Logs (Step 1 to 9 traceable history)
        audit_steps = [
            (1, "01_CAPTURE", "EDGE_CAMERA", f"Captured high-res feed from {item['source']}"),
            (2, "02_VALIDATE", "QC_SERVICE", f"Image QC passed with score {q_score}%"),
            (3, "03_DETECT", "YOLO_VISION", f"Identified {len(detections_data)} rock contours; max caliber {int(max_boulder_mm)}mm"),
            (4, "04_ASSESS_RISK", "RISK_RULES", f"Calculated severity {severity} (Score {risk_score})"),
            (5, "05_ALERT", "NOTIFICATION", f"Dispatched visual & SCADA alert to Control Room console"),
        ]

        if item["operator"]:
            audit_steps.append(
                (6, "06_ACKNOWLEDGE", item["operator"], f"Operator action executed: {item['action']}")
            )

        for s_num, s_name, actor, details in audit_steps:
            db.add(AuditLog(
                incident_id=incident.id,
                step_number=s_num,
                step_name=s_name,
                actor=actor,
                action=s_name,
                details=details,
                timestamp=created_time + timedelta(seconds=s_num * 5)
            ))

        if item["outcome_type"]:
            fin_impact = (item["avoided_mins"] / 60.0) * CONFIG.hourly_downtime_cost
            outcome = CrusherOutcome(
                incident_id=incident.id,
                outcome_type=item["outcome_type"],
                actual_downtime_minutes=item["actual_mins"],
                avoided_downtime_minutes=item["avoided_mins"],
                financial_impact_inr=fin_impact,
                maintenance_log=f"Verified through SCADA runtime log. Prevention attributed to {item['action']}.",
                verified_by="Shift Incharge - Tata Steel RMH",
                recorded_at=res_time or now
            )
            db.add(outcome)

            db.add(AuditLog(
                incident_id=incident.id,
                step_number=7,
                step_name="07_LINK_OUTCOME",
                actor="PLANT_SCADA",
                action="OUTCOME_VERIFIED",
                details=f"Associated with outcome: {item['outcome_type']} ({item['avoided_mins']} mins avoided)",
                timestamp=res_time or now
            ))

    db.commit()
    print("Database seeding completed successfully.")
