export interface Detection {
  id?: number;
  rock_index: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  major_axis_mm: number;
  minor_axis_mm: number;
  aspect_ratio: number;
  estimated_volume_dm3: number;
  estimated_mass_kg: number;
  confidence: number;
  is_oversize: boolean;
  model_name: string;
}

export interface MediaRecord {
  id: number;
  filename: string;
  original_path: string;
  annotated_path?: string;
  source_id: string;
  source_type: string;
  resolution: string;
  validation_status: string;
  quality_score: number;
  validation_notes?: string;
  created_at: string;
  detections?: Detection[];
}

export interface AuditLog {
  id: number;
  incident_id: number;
  timestamp: string;
  step_number: number;
  step_name: string;
  actor: string;
  action: string;
  details?: string;
}

export interface CrusherOutcome {
  id: number;
  incident_id: number;
  outcome_type: string;
  actual_downtime_minutes: number;
  avoided_downtime_minutes: number;
  financial_impact_inr: number;
  maintenance_log?: string;
  verified_by: string;
  recorded_at: string;
}

export interface Incident {
  id: number;
  incident_number: string;
  media_record_id: number;
  severity: "NORMAL" | "MEDIUM_RISK" | "HIGH_RISK" | "CRITICAL_OVERSIZE";
  risk_score: number;
  max_boulder_mm: number;
  bridging_probability: number;
  explanation?: string;
  status: "PENDING_REVIEW" | "ACKNOWLEDGED" | "DIVERTED" | "OVERRIDDEN" | "RESOLVED";
  operator_id?: string;
  operator_action?: string;
  operator_notes?: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  lead_time_seconds?: number;
  media_record?: MediaRecord;
  outcome?: CrusherOutcome;
  audit_logs: AuditLog[];
}

export interface DashboardSummary {
  total_incidents: number;
  active_alerts: number;
  critical_count: number;
  high_risk_count: number;
  resolved_count: number;
  downtime_avoided_minutes: number;
  downtime_avoided_hours: number;
  actual_stoppage_minutes: number;
  cost_avoidance_inr: number;
  mean_lead_time_sec: number;
  lead_time_target_sec: number;
  detection_precision_pct: number;
  detection_recall_pct: number;
  system_availability_pct: number;
  crusher_throat_limit_mm: number;
  hourly_cost_rate: number;
}

export interface DailyTrend {
  date: string;
  incidents: number;
  boulders_detected: number;
  downtime_avoided_mins: number;
  actual_downtime_mins: number;
  cost_saved_lakhs: number;
}

export interface SizeDistribution {
  range: string;
  count: number;
}

export interface CameraPerformance {
  camera: string;
  name: string;
  detections: number;
  oversize: number;
  uptime: string;
}

export interface DashboardTrends {
  daily_trends: DailyTrend[];
  size_distribution: SizeDistribution[];
  camera_performance: CameraPerformance[];
}

export interface SpecimenFixture {
  id: string;
  filename: string;
  title: string;
  source_id: string;
  description: string;
  expected_severity: string;
  image_url: string;
}

export interface RealtimeDetectionBox {
  rock_index: number;
  bbox: [number, number, number, number]; // [x, y, w, h] normalized 0-1
  major_axis_mm: number;
  minor_axis_mm: number;
  aspect_ratio: number;
  estimated_volume_dm3: number;
  estimated_mass_kg: number;
  confidence: number;
  is_oversize: boolean;
  is_warning: boolean;
  model_name: string;
}

export interface RealtimeFrameResponse {
  timestamp: string;
  fps: number;
  detection_count: number;
  max_caliber_mm: number;
  severity: "NORMAL" | "HIGH_RISK" | "CRITICAL_OVERSIZE" | "CLEAR_BELT";
  alert_triggered: boolean;
  alert_message?: string;
  detections: RealtimeDetectionBox[];
  incident_created: boolean;
  incident_number?: string;
  incident?: Incident;
}

export interface PlantConfig {
  plant_name: string;
  crusher_type: string;
  throat_limit_mm: number;
  warning_threshold_mm: number;
  conveyor_width_mm: number;
  hourly_downtime_cost: number;
  lead_time_target_sec: number;
  active_cameras: {
    id: string;
    name: string;
    location: string;
    resolution: string;
  }[];
}
