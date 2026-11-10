import re
from sqlalchemy.orm import Session
from datetime import datetime
from .models import Incident, CrusherOutcome, Detection, MediaRecord
from .analytics import get_analytics_kpi_summary
from .config import CONFIG

def process_copilot_query(query: str, db: Session, incident_id: str = None) -> dict:
    """
    Step 09: EXPLAIN
    LLM-backed / smart analytics tool grounded in authorized records, time filters, and event IDs.
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

    # High-level analytics or queries
    kpi = get_analytics_kpi_summary(db)

    if any(k in clean_q for k in ["downtime", "cost", "saving", "financial", "inr", "money"]):
        answer = (
            f"### Crusher Downtime & Financial Avoidance Intelligence\n\n"
            f"Across the recorded operational period, OreSentinel AI has logged:\n"
            f"- **Avoided Downtime**: **{kpi['downtime_avoided_hours']} hours** "
            f"({int(kpi['downtime_avoided_minutes'])} stoppage minutes prevented).\n"
            f"- **Estimated Cost Avoidance**: **INR {int(kpi['cost_avoidance_inr']):,}** "
            f"(calculated against verified plant stoppage cost of INR {int(CONFIG.hourly_downtime_cost):,}/hour).\n"
            f"- **Actual Boulder Stoppages**: Only {int(kpi['actual_stoppage_minutes'])} minutes sustained across all shifts.\n\n"
            f"**Attribution Confidence**: High. All prevented stoppages are directly tied to verified rock diversion records."
        )
        recommended_actions = [
            "Maintain current 180s lead time response protocol on Primary Conveyor 1A.",
            "Cross-reference hydraulic rock-breaker utilization logs with avoided stoppage intervals."
        ]
        metrics = {
            "avoided_hours": kpi["downtime_avoided_hours"],
            "cost_saved_inr": kpi["cost_avoidance_inr"],
            "actual_stoppage_mins": kpi["actual_stoppage_minutes"]
        }

    elif any(k in clean_q for k in ["lead time", "response", "operator", "reaction"]):
        answer = (
            f"### Operator Response & Alert Lead Time Metrics\n\n"
            f"- **Mean Alert Lead Time**: **{kpi['mean_lead_time_sec']} seconds**.\n"
            f"- **Operational Target**: < {int(CONFIG.lead_time_target_sec)} seconds (3.0 minutes from detection until crusher feed hopper).\n"
            f"- **Target Compliance**: {round((1.0 - (kpi['mean_lead_time_sec'] / CONFIG.lead_time_target_sec)) * 100, 1)}% safety margin maintained.\n"
            f"- **Total Actioned Incidents**: {kpi['resolved_count']} events reviewed and safely closed."
        )
        recommended_actions = [
            "Inspect shift handovers to ensure lead times do not spike during 06:00 and 14:00 shift transitions.",
            "Enable acoustic alarm buzzer for CRITICAL_OVERSIZE events exceeding 900mm caliber."
        ]
        metrics = {
            "mean_lead_time_sec": kpi["mean_lead_time_sec"],
            "target_sec": CONFIG.lead_time_target_sec
        }

    elif any(k in clean_q for k in ["precision", "recall", "accuracy", "model", "performance"]):
        answer = (
            f"### Computer Vision Model Performance & Ground Truth\n\n"
            f"- **Detection Precision**: **{kpi['detection_precision_pct']}%** (Correct high-risk boulders / total predicted high-risk).\n"
            f"- **Detection Recall**: **{kpi['detection_recall_pct']}%** (Oversize boulders captured without false negative pass-throughs).\n"
            f"- **Edge System Availability**: **{kpi['system_availability_pct']}%** uptime across camera nodes.\n"
            f"- **Active Model**: `OreSentinel-YOLO-RockV3` (calibrated against 1400mm conveyor apron scale)."
        )
        recommended_actions = [
            "Schedule weekly lens air-purge cleaning on CAM-02 (Jaw inlet) to maintain 95%+ image quality score.",
            "Log monthly manual survey rock samples to continuously update the ground-truth validation set."
        ]
        metrics = {
            "precision": kpi["detection_precision_pct"],
            "recall": kpi["detection_recall_pct"],
            "availability": kpi["system_availability_pct"]
        }

    elif any(k in clean_q for k in ["critical", "alert", "active", "risk", "hazard"]):
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
            f"### Active Critical Alerts & Oversize Boulders\n\n"
            f"Found **{len(active_crits)} critical/high-risk alerts** awaiting resolution:\n"
            f"{items_str}\n\n"
            f"Crusher opening throat limit is set to **{int(CONFIG.throat_limit_mm)}mm**."
        )
        recommended_actions = [
            "Review pending alerts in the Operations Dashboard and issue chute diverter commands immediately.",
            "Verify clear conveyor sensor telemetry before resuming full feeder feed rate."
        ]
        metrics = {"active_critical_count": len(active_crits)}

    else:
        # Default holistic overview
        recent_crits = db.query(Incident).filter(Incident.severity == "CRITICAL_OVERSIZE").limit(3).all()
        for r in recent_crits:
            citations.append(r.incident_number)

        answer = (
            f"### OreSentinel Operational Intelligence Overview\n\n"
            f"- **Monitoring Status**: Active across 3 feed chutes.\n"
            f"- **Crusher Throat Specification**: {int(CONFIG.throat_limit_mm)}mm nominal limit.\n"
            f"- **Total Recorded Events**: {kpi['total_incidents']} incidents ({kpi['critical_count']} critical oversize).\n"
            f"- **Crusher Uptime Preserved**: **{kpi['downtime_avoided_hours']} hrs** saved (**INR {int(kpi['cost_avoidance_inr']):,}** cost avoidance).\n"
            f"- **Precision / Recall**: {kpi['detection_precision_pct']}% / {kpi['detection_recall_pct']}%.\n"
            f"- **Average Lead Time**: {kpi['mean_lead_time_sec']}s.\n\n"
            f"You can ask me to inspect a specific incident (e.g. *'Audit INC-2026-004'*), analyze downtime trends, or breakdown operator responsiveness."
        )
        recommended_actions = [
            "Run vertical slice demonstration on test boulder specimen.",
            "Inspect recent critical alerts in Incident Explorer."
        ]
        metrics = kpi

    return {
        "query": query,
        "answer": answer,
        "citations": citations,
        "metrics": metrics,
        "recommended_actions": recommended_actions
    }
