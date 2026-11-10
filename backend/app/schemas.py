from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

class DetectionSchema(BaseModel):
    id: Optional[int] = None
    rock_index: int
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    major_axis_mm: float
    minor_axis_mm: float
    aspect_ratio: float
    estimated_volume_dm3: float
    estimated_mass_kg: float
    confidence: float
    is_oversize: bool
    model_name: str

    class Config:
        from_attributes = True

class AuditLogSchema(BaseModel):
    id: Optional[int] = None
    timestamp: datetime
    step_number: int
    step_name: str
    actor: str
    action: str
    details: Optional[str] = None

    class Config:
        from_attributes = True

class CrusherOutcomeSchema(BaseModel):
    id: Optional[int] = None
    incident_id: int
    outcome_type: str
    actual_downtime_minutes: float
    avoided_downtime_minutes: float
    financial_impact_inr: float
    maintenance_log: Optional[str] = None
    verified_by: str
    recorded_at: datetime

    class Config:
        from_attributes = True

class MediaRecordSchema(BaseModel):
    id: int
    filename: str
    original_path: str
    annotated_path: Optional[str] = None
    source_id: str
    source_type: str
    resolution: str
    validation_status: str
    quality_score: float
    validation_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class IncidentSchema(BaseModel):
    id: int
    incident_number: str
    media_record_id: int
    severity: str
    risk_score: float
    max_boulder_mm: float
    bridging_probability: float
    explanation: Optional[str] = None
    status: str
    operator_id: Optional[str] = None
    operator_action: Optional[str] = None
    operator_notes: Optional[str] = None
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    lead_time_seconds: Optional[float] = None
    media_record: Optional[MediaRecordSchema] = None
    outcome: Optional[CrusherOutcomeSchema] = None
    audit_logs: List[AuditLogSchema] = []

    class Config:
        from_attributes = True

class OperatorActionRequest(BaseModel):
    operator_id: str
    action: str  # DIVERT_CHUTE, HALT_CONVEYOR, MANUAL_OVERRIDE, FALSE_ALARM
    notes: Optional[str] = None

class OutcomeLinkRequest(BaseModel):
    outcome_type: str  # AVOIDED_STOPPAGE, CONFIRMED_JAM, FALSE_ALARM_BYPASSED, SUSPECTED_UNRESOLVED
    actual_downtime_minutes: float = 0.0
    avoided_downtime_minutes: float = 45.0
    maintenance_log: Optional[str] = None
    verified_by: str = "Shift Incharge"

class CopilotQueryRequest(BaseModel):
    query: str
    time_filter: Optional[str] = "today"
    incident_id: Optional[str] = None

class CopilotResponse(BaseModel):
    query: str
    answer: str
    citations: List[str] = []
    metrics: dict = {}
    recommended_actions: List[str] = []

class RealtimeDetectionBox(BaseModel):
    rock_index: int
    bbox: List[float]  # [x, y, w, h] normalized 0.0 - 1.0
    major_axis_mm: float
    minor_axis_mm: float
    aspect_ratio: float
    is_oversize: bool
    is_warning: bool
    confidence: float
    model_name: str

class RealtimeFrameResponse(BaseModel):
    timestamp: str
    fps: float
    detection_count: int
    max_caliber_mm: float
    severity: str
    alert_triggered: bool
    alert_message: Optional[str] = None
    detections: List[RealtimeDetectionBox] = []
    incident_created: bool = False
    incident_number: Optional[str] = None
    incident: Optional[IncidentSchema] = None
