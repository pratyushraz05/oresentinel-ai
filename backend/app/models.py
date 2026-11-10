from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from .database import Base

class MediaRecord(Base):
    __tablename__ = "media_records"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    original_path = Column(String(512), nullable=False)
    annotated_path = Column(String(512), nullable=True)
    source_id = Column(String(100), default="CAM-01-CHUTE")
    source_type = Column(String(50), default="CAMERA_FEED")  # CAMERA_FEED, MANUAL_UPLOAD, DEMO_SPECIMEN
    resolution = Column(String(50), default="1920x1080")
    file_size_bytes = Column(Integer, default=0)
    validation_status = Column(String(50), default="VALIDATED")  # VALIDATED, REJECTED
    quality_score = Column(Float, default=95.0)  # Blur & contrast score
    validation_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    detections = relationship("Detection", back_populates="media_record", cascade="all, delete-orphan")
    incident = relationship("Incident", back_populates="media_record", uselist=False)

class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    media_record_id = Column(Integer, ForeignKey("media_records.id"), nullable=False)
    rock_index = Column(Integer, default=1)
    
    # Bounding box coordinates normalized (0.0 - 1.0) or pixel
    bbox_x = Column(Float, nullable=False)
    bbox_y = Column(Float, nullable=False)
    bbox_w = Column(Float, nullable=False)
    bbox_h = Column(Float, nullable=False)

    # Physical calibrated metrics (in mm)
    major_axis_mm = Column(Float, nullable=False)
    minor_axis_mm = Column(Float, nullable=False)
    aspect_ratio = Column(Float, default=1.0)
    estimated_volume_dm3 = Column(Float, default=0.0)
    estimated_mass_kg = Column(Float, default=0.0)
    
    confidence = Column(Float, nullable=False)
    is_oversize = Column(Boolean, default=False)
    model_name = Column(String(100), default="OreSentinel-YOLO-RockV3")
    
    media_record = relationship("MediaRecord", back_populates="detections")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    incident_number = Column(String(64), unique=True, index=True, nullable=False)
    media_record_id = Column(Integer, ForeignKey("media_records.id"), nullable=False)
    
    # Severity & Risk
    severity = Column(String(50), default="NORMAL")  # NORMAL, MEDIUM_RISK, HIGH_RISK, CRITICAL_OVERSIZE
    risk_score = Column(Float, default=0.0)  # 0 to 100
    max_boulder_mm = Column(Float, default=0.0)
    bridging_probability = Column(Float, default=0.0)
    explanation = Column(Text, nullable=True)
    
    # Workflow State
    status = Column(String(50), default="PENDING_REVIEW") 
    # PENDING_REVIEW, ACKNOWLEDGED, DIVERTED, OVERRIDDEN, RESOLVED
    
    operator_id = Column(String(100), nullable=True)
    operator_action = Column(String(100), nullable=True)
    operator_notes = Column(Text, nullable=True)
    
    # Timestamps & Lead Time
    created_at = Column(DateTime, default=datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    lead_time_seconds = Column(Float, nullable=True)

    # Relationships
    media_record = relationship("MediaRecord", back_populates="incident")
    outcome = relationship("CrusherOutcome", back_populates="incident", uselist=False, cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="incident", cascade="all, delete-orphan")

class CrusherOutcome(Base):
    __tablename__ = "crusher_outcomes"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, unique=True)
    
    outcome_type = Column(String(50), default="AVOIDED_STOPPAGE")
    # AVOIDED_STOPPAGE, CONFIRMED_JAM, FALSE_ALARM_BYPASSED, SUSPECTED_UNRESOLVED
    
    actual_downtime_minutes = Column(Float, default=0.0)
    avoided_downtime_minutes = Column(Float, default=0.0)
    financial_impact_inr = Column(Float, default=0.0)
    maintenance_log = Column(Text, nullable=True)
    verified_by = Column(String(100), default="Plant Engineer")
    recorded_at = Column(DateTime, default=datetime.utcnow)

    incident = relationship("Incident", back_populates="outcome")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    step_number = Column(Integer, default=1)
    step_name = Column(String(100), nullable=False)
    actor = Column(String(100), default="SYSTEM_AI")
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)

    incident = relationship("Incident", back_populates="audit_logs")
