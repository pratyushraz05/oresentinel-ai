from typing import List, Dict, Tuple
from .config import CONFIG

def assess_operational_risk(
    detections: List[Dict],
    throat_limit_mm: float = None,
    warning_threshold_mm: float = None
) -> Tuple[str, float, float, float, str]:
    """
    Step 04: ASSESS RISK
    Applies site-configured rules to validated size evidence.
    Returns:
        (severity, risk_score, max_boulder_mm, bridging_probability, explanation)
    """
    if throat_limit_mm is None:
        throat_limit_mm = CONFIG.throat_limit_mm
    if warning_threshold_mm is None:
        warning_threshold_mm = CONFIG.warning_threshold_mm

    if not detections:
        return "NORMAL", 10.0, 0.0, 0.05, "Clear conveyor feed: no oversize fragments detected."

    # Identify maximum caliber boulder
    max_det = max(detections, key=lambda d: d["major_axis_mm"])
    max_boulder_mm = max_det["major_axis_mm"]
    max_aspect = max(d["aspect_ratio"] for d in detections)
    oversize_count = sum(1 for d in detections if d["is_oversize"])

    # Calculate Bridging Probability (wedging between crusher jaws)
    # Bridging probability increases when boulder diameter approaches throat limit AND aspect ratio is high
    relative_size = max_boulder_mm / max(1.0, throat_limit_mm)
    bridging_factor = min(1.0, (relative_size ** 1.8) * (max_aspect / 1.5) * 0.7)
    bridging_probability = round(max(0.05, min(0.98, bridging_factor)), 2)

    # Calculate Risk Score (0 - 100)
    if max_boulder_mm >= throat_limit_mm:
        overshoot = max_boulder_mm - throat_limit_mm
        score = 75.0 + min(25.0, (overshoot / 300.0) * 25.0)
    elif max_boulder_mm >= warning_threshold_mm:
        gap = max_boulder_mm - warning_threshold_mm
        score = 45.0 + (gap / (throat_limit_mm - warning_threshold_mm)) * 25.0
    else:
        score = max(5.0, (max_boulder_mm / warning_threshold_mm) * 40.0)

    # Adjust for multiple boulders or extreme elongation
    if oversize_count > 1:
        score = min(100.0, score + 8.0)
    if max_aspect >= 2.2:
        score = min(100.0, score + 6.0)

    risk_score = round(score, 1)

    # Classify Severity and Formulate Explainable Insight
    if max_boulder_mm >= (throat_limit_mm * 1.15) or (max_boulder_mm >= throat_limit_mm and max_aspect >= 1.7):
        severity = "CRITICAL_OVERSIZE"
        diff_pct = round(((max_boulder_mm - throat_limit_mm) / throat_limit_mm) * 100, 1)
        explanation = (
            f"CRITICAL HAZARD: Detected boulder caliber of {int(max_boulder_mm)}mm exceeds primary crusher "
            f"throat opening limit ({int(throat_limit_mm)}mm) by +{diff_pct}%. "
            f"Bridging index is {max_aspect}:1 with calculated jam probability of {int(bridging_probability*100)}%. "
            f"Estimated mass {int(max_det['estimated_mass_kg'])}kg will cause mechanical stalling if unmitigated."
        )
    elif max_boulder_mm >= throat_limit_mm:
        severity = "HIGH_RISK"
        diff_pct = round(((max_boulder_mm - throat_limit_mm) / throat_limit_mm) * 100, 1)
        explanation = (
            f"HIGH RISK: Rock caliber of {int(max_boulder_mm)}mm exceeds crusher nominal throat limit "
            f"({int(throat_limit_mm)}mm) by +{diff_pct}%. Stalling or liner gouging likely. "
            f"Operator diversion recommended before reaching conveyor discharge chute."
        )
    elif max_boulder_mm >= warning_threshold_mm or max_aspect >= 2.0:
        severity = "MEDIUM_RISK"
        explanation = (
            f"ELEVATED RISK: Maximum rock fragment is {int(max_boulder_mm)}mm (warning threshold: {int(warning_threshold_mm)}mm). "
            f"Aspect ratio {max_aspect}:1 indicates slab geometry capable of slotting or wedging at hopper throat."
        )
    else:
        severity = "NORMAL"
        explanation = (
            f"NORMAL OPERATION: All detected rock fragments ({int(max_boulder_mm)}mm max) are safely within "
            f"the {int(throat_limit_mm)}mm throat specification. Feed stream fragmentation optimal."
        )

    return severity, risk_score, max_boulder_mm, bridging_probability, explanation
