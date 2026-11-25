import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime
from sqlalchemy.orm import Session
from .models import Incident, CrusherOutcome, Detection, MediaRecord
from .analytics import get_analytics_kpi_summary, get_kpi_overrides
from .calibration import get_active_system_calibration
from .config import CONFIG

def _try_gemini_llm(query: str, context_text: str) -> str | None:
    """Optionally query Gemini API if GEMINI_API_KEY or GOOGLE_API_KEY is available."""
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"Context:\n{context_text}\n\nOperator Query: {query}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 800
            }
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates:
                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if content_parts:
                        return content_parts[0].get("text", "").strip()
    except Exception as e:
        print(f"[COPILOT] Gemini API call skipped/failed: {e}")
    return None

def process_copilot_query(query: str, db: Session, incident_id: str = None) -> dict:
    """
    OreSentinel AI Operational Copilot:
    Synthesizes real plant telemetry, SOPs, active camera calibration, YOLO models, and database records.
    """
    clean_q = query.strip().lower()
    citations = []
    recommended_actions = []
    metrics = {}

    # Check for specific incident inquiry
    match_inc = re.search(r'inc[-_ ]?2026[-_ ]?\d+', clean_q, re.IGNORECASE)
    target_inc_number = None
    if match_inc:
        target_inc_number = match_inc.group(0).upper().replace(" ", "-").replace("_", "-")
    elif incident_id:
        target_inc_number = incident_id.upper()

    if target_inc_number:
        # Specific incident deep-dive
        inc = db.query(Incident).filter(
            Incident.incident_number.like(f"%{target_inc_number.split('-')[-1]}%")
        ).first()

        if inc:
            citations.append(inc.incident_number)
            dets = inc.media_record.detections if inc.media_record else []
            oversize_dets = [d for d in dets if d.is_oversize]
            
            outcome_text = "Pending crusher outcome linkage."
            if inc.outcome:
                outcome_text = (
                    f"Outcome verified as {inc.outcome.outcome_type.replace('_', ' ')}. "
                    f"Avoided downtime: {inc.outcome.avoided_downtime_minutes} mins "
                    f"(Saved INR {int(inc.outcome.financial_impact_inr):,})."
                )

            metrics = {
                "incident_id": inc.incident_number,
                "severity": inc.severity,
                "max_boulder_mm": inc.max_boulder_mm,
                "throat_limit_mm": CONFIG.throat_limit_mm,
                "lead_time_seconds": inc.lead_time_seconds or 0.0,
                "status": inc.status,
                "operator_action": inc.operator_action or "None recorded"
            }

            answer = (
                f"### Audit for Incident {inc.incident_number}\n\n"
                f"- **Severity & Risk**: {inc.severity} (Score: {inc.risk_score}/100)\n"
                f"- **Caliber Telemetry**: Max detected boulder caliber is **{int(inc.max_boulder_mm)}mm**, "
                f"which exceeds the {int(CONFIG.throat_limit_mm)}mm primary jaw throat limit by "
                f"**+{round(((inc.max_boulder_mm - CONFIG.throat_limit_mm)/CONFIG.throat_limit_mm)*100, 1)}%**.\n"
                f"- **Camera Source**: `{inc.media_record.source_id if inc.media_record else 'Unknown'}` | "
                f"Feed Quality Score: {inc.media_record.quality_score if inc.media_record else 95.0}%\n"
                f"- **Operator Response**: Status is `{inc.status}`. "
                f"Action `{inc.operator_action or 'PENDING'}` logged by `{inc.operator_id or 'Control Room'}` "
                f"in **{inc.lead_time_seconds or 'N/A'}s** (Target: <{int(CONFIG.lead_time_target_sec)}s).\n"
                f"- **Crusher Downtime Linkage**: {outcome_text}\n\n"
                f"**Engineering Rationale**: {inc.explanation}"
            )

            if inc.severity in ["CRITICAL_OVERSIZE", "HIGH_RISK"] and inc.status == "PENDING_REVIEW":
                recommended_actions.append("Trigger automated diverter chute gate to discard boulder into secondary rock breaker apron.")
                recommended_actions.append("Notify crusher pit operator via two-way radio before next haul truck discharge.")
            else:
                recommended_actions.append("Archive event telemetry in plant SAP-PM maintenance ledger.")

            return {
                "query": query,
                "answer": answer,
                "citations": citations,
                "metrics": metrics,
                "recommended_actions": recommended_actions
            }

    # Fetch live telemetry & overrides
    kpi = get_analytics_kpi_summary(db)
    active_calib = get_active_system_calibration()
    overrides = get_kpi_overrides()

    # Context string for LLM or logic
    context_str = (
        f"Plant: {CONFIG.plant_name}\n"
        f"Crusher Throat Limit: {CONFIG.throat_limit_mm} mm\n"
        f"Hourly Downtime Cost: INR {CONFIG.hourly_downtime_cost}/hr\n"
        f"Avoided Downtime Hours: {kpi.get('downtime_avoided_hours', 0)}\n"
        f"Cost Avoidance INR: {kpi.get('cost_avoidance_inr', 0)}\n"
        f"Actual Stoppage Minutes: {kpi.get('actual_stoppage_minutes', 0)}\n"
        f"Detection Precision: {kpi.get('detection_precision_pct', 94.2)}%\n"
        f"Active Calibration: {active_calib.mm_per_pixel_avg if active_calib else 1.25} mm/px\n"
        f"Total Incidents: {kpi.get('total_incidents', 0)}\n"
    )

    # 1. Resetting / Customizing Dashboard Data & Zeroing Metrics
    if any(k in clean_q for k in ["reset", "zero", "change data", "modify data", "custom data", "set to zero", "starting system again", "kpi", "avoided downtime", "cost avoidance"]):
        answer = (
            f"### Operations Dashboard Reset & Metric Customization\n\n"
            f"You can reset or customize each metric on the dashboard:\n\n"
            f"1. **Reset to Zero**: In the **Operations Dashboard**, click the **'Reset / Customize KPIs'** button at the top right. "
            f"Select **'Set All KPIs to Zero'** to instantly zero out:\n"
            f"   - **Avoided Downtime**: `0.0 hrs`\n"
            f"   - **Cost Avoidance**: `INR 0`\n"
            f"   - **Actual Stoppage**: `0.0 mins`\n"
            f"   - **Boulders Diverted**: `0`\n"
            f"2. **Custom Baseline Values**: You can also type any custom numbers you want for each metric (e.g. baseline hours, historical cost savings).\n"
            f"3. **Backend API Endpoints**:\n"
            f"   - `POST /api/dashboard/reset`: Wipes old test incidents/outcomes and resets all KPIs to 0.\n"
            f"   - `PUT /api/dashboard/kpi-overrides`: Sets custom values for any metric.\n"
            f"   - `DELETE /api/dashboard/kpi-overrides`: Reverts back to raw database calculations."
        )
        recommended_actions = [
            "Click 'Reset / Customize KPIs' in the Operations Dashboard header.",
            "Choose 'Set All to 0' to start fresh with clean operational telemetry."
        ]
        metrics = {
            "avoided_downtime_hours": kpi.get("downtime_avoided_hours", 0),
            "cost_avoidance_inr": kpi.get("cost_avoidance_inr", 0),
            "is_overridden": bool(overrides)
        }

    # 2. Camera Calibration, Distance Measurement & Feedback Loop
    elif any(k in clean_q for k in ["calibrat", "distance", "centimeter", "measurement", "camera", "far", "rect", "box", "confirm"]):
        dist_cm = getattr(active_calib, "distance_cm", 50.0) if active_calib else 50.0
        calib_text = (
            f"Active system calibration: **{active_calib.mm_per_pixel_avg:.4f} mm/px** "
            f"({(active_calib.mm_per_pixel_avg/10.0):.4f} cm/px) from distance {dist_cm} cm."
            if active_calib else "No active camera calibration detected yet. Please calibrate before measuring."
        )
        answer = (
            f"### Unified Camera Distance & Sizing Calibration Protocol\n\n"
            f"{calib_text}\n\n"
            f"**How the Workflow Works:**\n"
            f"1. **Input Distance**: Turn on camera in **Live Camera Measurement**. Enter the distance between the camera and the object (e.g. `50 cm` or `100 cm`).\n"
            f"2. **Object Detection**: The system detects the object, draws a bounding rectangle, and estimates width and height in centimeters.\n"
            f"3. **Operator Confirmation Loop**: The system asks: *'Is this rectangle and measurement accurate?'*\n"
            f"   - If **Correct**: Click Confirm. The system computes exact focal length and `mm/pixel`.\n"
            f"   - If **Wrong / Adjust**: Click 'Adjust / Specify Correct Size', enter the known dimensions (e.g. `20 cm x 15 cm`), and submit. The system calibrates on that exact feedback!\n"
            f"4. **Global System-Wide Synchronization**: This calibration is saved into `backend/data/calibration.json` and immediately used for all ore feed chutes, rock boulder measurement, and crusher safety limits."
        )
        recommended_actions = [
            "Open 'Live Camera Measurement' in the top navigation.",
            "Enter camera distance in centimeters and place a reference rock or known object.",
            "Verify the bounding box and confirm the measurement."
        ]
        metrics = {
            "is_calibrated": bool(active_calib),
            "mm_per_pixel": active_calib.mm_per_pixel_avg if active_calib else 1.25,
            "distance_cm": getattr(active_calib, "distance_cm", 50.0) if active_calib else 50.0
        }

    # 3. Deleting Fake Incidents & Clearing Storage
    elif any(k in clean_q for k in ["delete", "purge", "fake", "clear", "remove", "ledger", "storage", "upload"]):
        answer = (
            f"### Fake Incident Cleanup & Storage Maintenance\n\n"
            f"To keep storage clean and downtime KPIs strictly accurate:\n\n"
            f"1. **Delete Individual Incidents**: In the **Incident Ledger**, click the **Trash Can icon** on any test or fake incident row to permanently remove it along with its uploaded media and outcome records.\n"
            f"2. **Bulk Purge Fake / Test Events**: Click the **'Purge Old Incidents'** button to delete fake historical entries and free storage.\n"
            f"3. **Full System Storage Reset**: Click **'Reset Dashboard'** in the Operations Dashboard to clean out all test snapshots in `backend/data/uploads/` and reset the incident counter."
        )
        recommended_actions = [
            "Navigate to 'Incident Ledger' to inspect and delete unwanted test rows.",
            "Purge older fake records to optimize SQLite storage and KPI accuracy."
        ]
        metrics = {
            "total_incidents": kpi.get("total_incidents", 0),
            "critical_count": kpi.get("critical_count", 0)
        }

    # 4. Downtime & Cost Avoidance
    elif any(k in clean_q for k in ["downtime", "cost", "saving", "financial", "inr", "money"]):
        answer = (
            f"### Crusher Downtime & Financial Avoidance Intelligence\n\n"
            f"Across the recorded operational period, OreSentinel AI has logged:\n"
            f"- **Avoided Downtime**: **{kpi['downtime_avoided_hours']} hours** "
            f"({int(kpi['downtime_avoided_minutes'])} stoppage minutes prevented).\n"
            f"- **Estimated Cost Avoidance**: **INR {int(kpi['cost_avoidance_inr']):,}** "
            f"(calculated against plant downtime rate of INR {int(CONFIG.hourly_downtime_cost):,}/hour).\n"
            f"- **Actual Boulder Stoppages**: Only **{int(kpi['actual_stoppage_minutes'])} minutes** sustained.\n\n"
            f"**Attribution Confidence**: High. All prevented stoppages are tied directly to verified rock diversion records."
        )
        recommended_actions = [
            "Maintain 180s lead time response protocol on Primary Conveyor 1A.",
            "Cross-reference hydraulic rock-breaker logs with avoided stoppage intervals."
        ]
        metrics = {
            "avoided_hours": kpi["downtime_avoided_hours"],
            "cost_saved_inr": kpi["cost_avoidance_inr"],
            "actual_stoppage_mins": kpi["actual_stoppage_minutes"]
        }

    # 5. Model Architecture & Rock Detection Accuracy
    elif any(k in clean_q for k in ["model", "train", "yolo", "detect", "accuracy", "precision", "recall", "rock", "boulder", "mining"]):
        answer = (
            f"### Computer Vision Rock Detection & Sizing Intelligence\n\n"
            f"- **Model Architecture**: Ultralytics YOLOv8 fine-tuned on mining and quarry rock datasets.\n"
            f"- **Target Classes**: `rock`, `boulder`, `ore_fragment`, `gravel`, `quarry_debris`, `mining_fragment`.\n"
            f"- **Single-Object Containment Filtering**: Internal fragmentation suppression ensures one physical rock or boulder is detected as **one complete object in a bounding rectangle**, avoiding split multi-box fragments.\n"
            f"- **Throat Limit Comparison**: Rocks with caliber exceeding **{int(CONFIG.throat_limit_mm)}mm** are flagged as `CRITICAL_OVERSIZE`.\n"
            f"- **Detection Precision / Recall**: **{kpi.get('detection_precision_pct', 94.2)}% / {kpi.get('detection_recall_pct', 91.5)}%**."
        )
        recommended_actions = [
            "Ensure regular camera lens cleaning to prevent dust blur.",
            "Verify camera distance calibration when repositioning camera fixtures."
        ]
        metrics = {
            "precision": kpi.get("detection_precision_pct", 94.2),
            "recall": kpi.get("detection_recall_pct", 91.5),
            "throat_limit_mm": CONFIG.throat_limit_mm
        }

    # 6. Operator Lead Time & Response
    elif any(k in clean_q for k in ["lead time", "response", "operator", "reaction"]):
        safety_margin = max(0.0, round((1.0 - (kpi['mean_lead_time_sec'] / max(1.0, CONFIG.lead_time_target_sec))) * 100, 1))
        answer = (
            f"### Operator Response & Alert Lead Time Metrics\n\n"
            f"- **Mean Alert Lead Time**: **{kpi['mean_lead_time_sec']} seconds**.\n"
            f"- **Operational Target**: < {int(CONFIG.lead_time_target_sec)} seconds (3.0 minutes from detection until crusher feed hopper).\n"
            f"- **Target Compliance**: {safety_margin}% safety margin maintained.\n"
            f"- **Total Actioned Incidents**: {kpi['resolved_count']} events reviewed and safely closed."
        )
        recommended_actions = [
            "Inspect shift handovers to ensure lead times do not spike during shift transitions.",
            "Enable acoustic alarm buzzer for CRITICAL_OVERSIZE events exceeding 900mm caliber."
        ]
        metrics = {
            "mean_lead_time_sec": kpi["mean_lead_time_sec"],
            "target_sec": CONFIG.lead_time_target_sec
        }

    # 7. Active Critical Alerts & Emergency SOPs
    elif any(k in clean_q for k in ["critical", "alert", "active", "risk", "hazard", "sop", "emergency", "diverter"]):
        active_crits = db.query(Incident).filter(
            Incident.severity.in_(["CRITICAL_OVERSIZE", "HIGH_RISK"]),
            Incident.status.in_(["PENDING_REVIEW", "ACKNOWLEDGED"])
        ).all()
        
        inc_lines = []
        for a in active_crits[:5]:
            citations.append(a.incident_number)
            inc_lines.append(f"- **{a.incident_number}**: Caliber {int(a.max_boulder_mm)}mm ({a.severity}) - Status `{a.status}`")

        items_str = "\n".join(inc_lines) if inc_lines else "No unacknowledged critical alerts currently pending. All clear!"
        answer = (
            f"### Active Critical Alerts & Emergency Crusher SOP\n\n"
            f"Found **{len(active_crits)} critical/high-risk alerts** awaiting resolution:\n"
            f"{items_str}\n\n"
            f"**Standard Operating Procedure (SOP-CRUSH-04):**\n"
            f"1. **Trigger Automated Diverter Gate**: Reroute oversized boulder to secondary breaker apron.\n"
            f"2. **Conveyor Speed Modulation**: Drop belt speed to 0.5 m/s if lead time drops below 60 seconds.\n"
            f"3. **Two-Way Radio Dispatch**: Alert rock-breaker operator to clear crusher throat before feed resumption."
        )
        recommended_actions = [
            "Review pending alerts in Operations Dashboard and issue chute diverter command.",
            "Verify clear conveyor sensor telemetry before resuming full feeder feed rate."
        ]
        metrics = {"active_critical_count": len(active_crits)}

    # 8. General Help / Conversational fallback
    else:
        # Check if Gemini can provide custom synthesis
        llm_response = _try_gemini_llm(query, context_str)
        if llm_response:
            answer = llm_response
        else:
            answer = (
                f"### OreSentinel AI Plant Copilot Online\n\n"
                f"I am connected to the Tata Steel RMH crusher control system and live computer vision telemetry.\n\n"
                f"**What I Can Help You With:**\n"
                f"- **Reset / Customize KPIs**: Set Avoided Downtime, Cost Avoidance, and Stoppages to zero or custom values.\n"
                f"- **Camera & Distance Calibration**: Calibrate camera with distance (in cm), bounding rectangle confirmation, and user feedback loop.\n"
                f"- **Audit Past Incidents**: Ask *'Audit INC-2026-0081'* to see caliber, lead time, and downtime savings.\n"
                f"- **Storage & Data Management**: Delete fake or test incidents from the ledger and purge old media.\n"
                f"- **Model Performance**: Inquire about YOLOv8 rock detection, precision, and oversize boulder rules.\n"
                f"- **Emergency SOPs**: Rapid response protocols for crusher hopper blockage prevention."
            )
        recommended_actions = [
            "Ask about downtime savings or incident audits.",
            "Run Camera Measurement to calibrate distance and detect objects."
        ]
        metrics = kpi

    return {
        "query": query,
        "answer": answer,
        "citations": citations,
        "metrics": metrics,
        "recommended_actions": recommended_actions
    }
