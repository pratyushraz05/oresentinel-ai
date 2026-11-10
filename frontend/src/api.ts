import type {
  Incident, DashboardSummary, DashboardTrends, SpecimenFixture, PlantConfig,
  RealtimeFrameResponse
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function fetchSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${BASE_URL}/api/dashboard/summary`);
  if (!res.ok) throw new Error("Failed to fetch dashboard summary");
  return res.json();
}

export async function fetchTrends(): Promise<DashboardTrends> {
  const res = await fetch(`${BASE_URL}/api/dashboard/trends`);
  if (!res.ok) throw new Error("Failed to fetch trends");
  return res.json();
}

export async function fetchIncidents(params?: { status?: string; severity?: string; source_id?: string }): Promise<Incident[]> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.severity && params.severity !== "ALL") query.append("severity", params.severity);
  if (params?.source_id && params.source_id !== "ALL") query.append("source_id", params.source_id);

  const res = await fetch(`${BASE_URL}/api/incidents?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch incidents");
  return res.json();
}

export async function fetchIncident(id: number): Promise<Incident> {
  const res = await fetch(`${BASE_URL}/api/incidents/${id}`);
  if (!res.ok) throw new Error("Failed to fetch incident details");
  return res.json();
}

export async function fetchFixtures(): Promise<SpecimenFixture[]> {
  const res = await fetch(`${BASE_URL}/api/fixtures`);
  if (!res.ok) throw new Error("Failed to fetch fixtures");
  return res.json();
}

export async function fetchPlantConfig(): Promise<PlantConfig> {
  const res = await fetch(`${BASE_URL}/api/config`);
  if (!res.ok) throw new Error("Failed to fetch plant config");
  return res.json();
}

export async function updatePlantConfig(config: PlantConfig): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to update plant config");
  return res.json();
}

export async function runDemonstrationPipeline(formData: FormData): Promise<Incident> {
  const res = await fetch(`${BASE_URL}/api/pipeline/demonstration`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Server returned ${res.status}: ${errorText || res.statusText}`);
  }
  return res.json();
}

export async function acknowledgeIncident(
  incidentId: number,
  operatorId: string,
  action: string,
  notes?: string
): Promise<Incident> {
  const res = await fetch(`${BASE_URL}/api/incidents/${incidentId}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operator_id: operatorId,
      action,
      notes,
    }),
  });
  if (!res.ok) throw new Error("Failed to acknowledge incident");
  return res.json();
}

export async function linkOutcome(
  incidentId: number,
  outcomeType: string,
  actualDowntimeMins: number,
  avoidedDowntimeMins: number,
  notes?: string
): Promise<Incident> {
  const res = await fetch(`${BASE_URL}/api/incidents/${incidentId}/outcome`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      outcome_type: outcomeType,
      actual_downtime_minutes: actualDowntimeMins,
      avoided_downtime_minutes: avoidedDowntimeMins,
      maintenance_log: notes,
      verified_by: "Plant Shift Engineer",
    }),
  });
  if (!res.ok) throw new Error("Failed to link crusher outcome");
  return res.json();
}

export async function queryCopilot(query: string, incidentId?: string): Promise<{
  query: string;
  answer: string;
  citations: string[];
  metrics: any;
  recommended_actions: string[];
}> {
  const res = await fetch(`${BASE_URL}/api/copilot/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, incident_id: incidentId }),
  });
  if (!res.ok) throw new Error("Failed to execute Copilot query");
  return res.json();
}

export async function sendRealtimeFrame(
  blob: Blob,
  params: {
    calibrationScale?: number;
    throatLimitMm?: number;
    autoCreateIncident?: boolean;
    sourceId?: string;
  }
): Promise<RealtimeFrameResponse> {
  const formData = new FormData();
  formData.append("file", blob, "webcam_frame.jpg");
  if (params.calibrationScale !== undefined) {
    formData.append("calibration_scale", params.calibrationScale.toString());
  }
  if (params.throatLimitMm !== undefined) {
    formData.append("throat_limit_mm", params.throatLimitMm.toString());
  }
  if (params.autoCreateIncident !== undefined) {
    formData.append("auto_create_incident", params.autoCreateIncident ? "true" : "false");
  }
  if (params.sourceId) {
    formData.append("source_id", params.sourceId);
  }

  const res = await fetch(`${BASE_URL}/api/vision/realtime-frame`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to process realtime frame");
  return res.json();
}
