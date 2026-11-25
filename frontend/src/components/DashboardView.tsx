import React, { useState, useEffect } from "react";
import {
  Clock, TrendingUp, DollarSign, Activity, Video, ShieldAlert,
  Sliders, RotateCcw, X, CheckCircle2, Trash2
} from "lucide-react";
import type { DashboardSummary, Incident } from "../types";
import { LiveWebcamFeed } from "./LiveWebcamFeed";
import { resetDashboardMetrics, updateKpiOverrides, clearKpiOverrides } from "../api";

interface DashboardViewProps {
  summary: DashboardSummary | null;
  incidents: Incident[];
  onSelectIncident: (inc: Incident) => void;
  onOpen9StepWithSpecimen: (specimenId: string) => void;
  onIncidentUpdated?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  incidents,
  onSelectIncident,
  onOpen9StepWithSpecimen,
  onIncidentUpdated,
}) => {
  const [activeCam, setActiveCam] = useState<string>("CAM-01-CHUTE");
  const [showKpiModal, setShowKpiModal] = useState<boolean>(false);
  const [isUpdatingKpi, setIsUpdatingKpi] = useState<boolean>(false);
  const [kpiSuccess, setKpiSuccess] = useState<string | null>(null);

  // Form states for custom KPI editing
  const [customDowntimeHours, setCustomDowntimeHours] = useState<string>("");
  const [customCostSavingsInr, setCustomCostSavingsInr] = useState<string>("");
  const [customActualStoppageMins, setCustomActualStoppageMins] = useState<string>("");
  const [customTotalIncidents, setCustomTotalIncidents] = useState<string>("");
  const [customCriticalDiverted, setCustomCriticalDiverted] = useState<string>("");
  const [customLeadTime, setCustomLeadTime] = useState<string>("");
  const [customPrecision, setCustomPrecision] = useState<string>("");
  const [customRecall, setCustomRecall] = useState<string>("");

  useEffect(() => {
    if (summary) {
      setCustomDowntimeHours(String(summary.downtime_avoided_hours ?? 0.0));
      setCustomCostSavingsInr(String(summary.cost_avoidance_inr ?? 0));
      setCustomActualStoppageMins(String(summary.actual_stoppage_minutes ?? 0));
      setCustomTotalIncidents(String(summary.total_incidents ?? 0));
      setCustomCriticalDiverted(String(summary.critical_count ?? 0));
      setCustomLeadTime(String(summary.mean_lead_time_sec ?? 0.0));
      setCustomPrecision(String(summary.detection_precision_pct ?? 96.4));
      setCustomRecall(String(summary.detection_recall_pct ?? 98.2));
    }
  }, [summary]);

  const handleSetAllToZero = async () => {
    setIsUpdatingKpi(true);
    try {
      await updateKpiOverrides({
        downtime_avoided_hours: 0.0,
        downtime_avoided_minutes: 0.0,
        cost_avoidance_inr: 0.0,
        actual_stoppage_minutes: 0.0,
        critical_boulders_diverted: 0,
        total_incidents: 0,
      });
      setKpiSuccess("All dashboard KPIs successfully set to 0.0!");
      onIncidentUpdated?.();
      setTimeout(() => setShowKpiModal(false), 900);
    } catch (err: any) {
      alert("Failed to zero metrics: " + err.message);
    } finally {
      setIsUpdatingKpi(false);
    }
  };

  const handleSaveCustomKpis = async () => {
    setIsUpdatingKpi(true);
    try {
      const overrides: Record<string, number> = {};
      if (customDowntimeHours !== "") overrides.downtime_avoided_hours = parseFloat(customDowntimeHours) || 0;
      if (customDowntimeHours !== "") overrides.downtime_avoided_minutes = (parseFloat(customDowntimeHours) || 0) * 60;
      if (customCostSavingsInr !== "") overrides.cost_avoidance_inr = parseFloat(customCostSavingsInr) || 0;
      if (customActualStoppageMins !== "") overrides.actual_stoppage_minutes = parseFloat(customActualStoppageMins) || 0;
      if (customTotalIncidents !== "") overrides.total_incidents = parseInt(customTotalIncidents, 10) || 0;
      if (customCriticalDiverted !== "") overrides.critical_boulders_diverted = parseInt(customCriticalDiverted, 10) || 0;
      if (customLeadTime !== "") overrides.mean_lead_time_sec = parseFloat(customLeadTime) || 0;
      if (customPrecision !== "") overrides.detection_precision_pct = parseFloat(customPrecision) || 0;
      if (customRecall !== "") overrides.detection_recall_pct = parseFloat(customRecall) || 0;

      await updateKpiOverrides(overrides);
      setKpiSuccess("Custom KPI values successfully applied!");
      onIncidentUpdated?.();
      setTimeout(() => setShowKpiModal(false), 900);
    } catch (err: any) {
      alert("Failed to save KPI overrides: " + err.message);
    } finally {
      setIsUpdatingKpi(false);
    }
  };

  const handleResetSystemAndPurgeStorage = async () => {
    if (!window.confirm("Are you sure? This will delete past fake incidents, purge uploaded test images, and set avoided downtime / cost avoidance to zero.")) {
      return;
    }
    setIsUpdatingKpi(true);
    try {
      await resetDashboardMetrics({
        downtime_avoided_hours: 0.0,
        downtime_avoided_minutes: 0.0,
        cost_avoidance_inr: 0.0,
        actual_stoppage_minutes: 0.0,
        critical_boulders_diverted: 0,
        total_incidents: 0,
      });
      setKpiSuccess("System completely reset! Fake incidents, uploads purged, and metrics set to zero.");
      onIncidentUpdated?.();
      setTimeout(() => setShowKpiModal(false), 1200);
    } catch (err: any) {
      alert("Failed to reset system: " + err.message);
    } finally {
      setIsUpdatingKpi(false);
    }
  };

  const handleRevertToLiveDb = async () => {
    setIsUpdatingKpi(true);
    try {
      await clearKpiOverrides();
      setKpiSuccess("KPI overrides cleared. Dashboard restored to live database telemetry.");
      onIncidentUpdated?.();
      setTimeout(() => setShowKpiModal(false), 900);
    } catch (err: any) {
      alert("Failed to revert overrides: " + err.message);
    } finally {
      setIsUpdatingKpi(false);
    }
  };

  const cameraConfigs = [
    {
      id: "CAM-01-CHUTE",
      title: "Primary Feed Chute 1A",
      feedUrl: "/media/fixtures/specimen_critical_boulder.jpg",
      status: "LIVE 1080p 30FPS",
      boulders: "1 Critical",
      quality: "98% QC",
    },
    {
      id: "CAM-02-JAW",
      title: "Jaw Crusher Throat Inlet 2B",
      feedUrl: "/media/fixtures/specimen_elongated_slab.jpg",
      status: "LIVE 1080p 30FPS",
      boulders: "1 High Risk",
      quality: "94% QC",
    },
    {
      id: "CAM-03-TRANSFER",
      title: "Transfer Chute Overband 3C",
      feedUrl: "/media/fixtures/specimen_cluster_jam.jpg",
      status: "LIVE 720p 30FPS",
      boulders: "Cluster Feed",
      quality: "96% QC",
    },
    {
      id: "LAPTOP-CAM",
      title: "Live Laptop Webcam Node",
      feedUrl: "",
      status: "LIVE WEBCAM 30FPS",
      boulders: "Interactive",
      quality: "99% QC",
    },
  ];

  const selectedCamObj = cameraConfigs.find((c) => c.id === activeCam) || cameraConfigs[0];

  return (
    <div className="space-y-6">
      {/* Operational Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#081513] border border-[#142e27] rounded-2xl px-5 py-3 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <div>
            <div className="text-xs font-mono font-bold text-white tracking-wide flex items-center space-x-2">
              <span>TATA STEEL RMH PRIMARY ORE CRUSHING UNIT #2</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">
                CRUSHER THROAT: 800mm
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Real-time computer vision conveyor monitoring, rock sizing &amp; stoppage avoidance.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => {
              setKpiSuccess(null);
              setShowKpiModal(true);
            }}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/10 hover:from-emerald-500/30 hover:to-teal-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-semibold transition-all shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reset / Customize KPIs</span>
          </button>
        </div>
      </div>

      {/* Top Operational Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Avoided Downtime */}
        <div className="bg-[#0b1916] border border-[#1b3a32] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>AVOIDED DOWNTIME</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-400 tracking-tight">
            {summary?.downtime_avoided_hours ?? 0.0} <span className="text-sm font-sans text-slate-300">hrs</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{Math.round(summary?.downtime_avoided_minutes ?? 0)} stoppage mins saved</span>
            <span className="text-emerald-400 font-bold font-mono">
              +100% Attributed
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Metric 2: Cost Avoidance */}
        <div className="bg-[#0b1916] border border-[#1b3a32] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>COST AVOIDANCE (EST.)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-400 tracking-tight">
            ₹{((summary?.cost_avoidance_inr ?? 0) / 100000).toFixed(2)}{" "}
            <span className="text-sm font-sans text-slate-300">Lakhs</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>Rate: ₹{((summary?.hourly_cost_rate ?? 150000) / 1000).toFixed(0)}k/hr</span>
            <span className="text-emerald-400 font-mono font-semibold">TATA STEEL RMH</span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-teal-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Metric 3: Alert Lead Time */}
        <div className="bg-[#0b1916] border border-[#1b3a32] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>MEAN ALERT LEAD TIME</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-amber-400 tracking-tight">
            {summary?.mean_lead_time_sec ?? 0.0} <span className="text-sm font-sans text-slate-300">sec</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>Target: &lt;{summary?.lead_time_target_sec ?? 180}s</span>
            <span className="text-emerald-400 font-semibold font-mono">
              {(summary?.mean_lead_time_sec ?? 0) > 0 ? "Compliant" : "Standby"}
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Metric 4: Model Precision & Recall */}
        <div className="bg-[#0b1916] border border-[#1b3a32] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>DETECTION RELIABILITY</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-3">
            <div>
              <div className="text-2xl font-bold font-mono text-white">
                {summary?.detection_precision_pct ?? 96.4}%
              </div>
              <div className="text-[10px] text-slate-400 font-mono uppercase">Precision</div>
            </div>
            <div className="text-slate-600">|</div>
            <div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {summary?.detection_recall_pct ?? 98.2}%
              </div>
              <div className="text-[10px] text-slate-400 font-mono uppercase">Recall</div>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Fine-tuned on rock/mining fragments
          </div>
        </div>
      </div>

      {/* Main Grid: Live Industrial Cameras & Active Incidents Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Vision Node & Camera Feeds (7 cols) */}
        <div className="lg:col-span-7 bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#142e27]">
            <div className="flex items-center space-x-2">
              <Video className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                EDGE COMPUTER VISION FEED MONITOR
              </h3>
            </div>
            {/* Camera Switcher Buttons */}
            <div className="flex space-x-1.5 bg-[#061210] p-1 rounded-lg border border-[#132c25]">
              {cameraConfigs.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => setActiveCam(cam.id)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                    activeCam === cam.id
                      ? "bg-emerald-600 text-white font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {cam.id === "LAPTOP-CAM" ? "💻 WEBCAM" : cam.id.split("-")[1]}
                </button>
              ))}
            </div>
          </div>

          {/* Active Camera Video / Frame Canvas */}
          {activeCam === "LAPTOP-CAM" ? (
            <LiveWebcamFeed
              onIncidentTriggered={() => onIncidentUpdated?.()}
              defaultThroatLimitMm={summary?.crusher_throat_limit_mm || 800}
            />
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-[#1a3831] bg-black group aspect-video flex items-center justify-center">
              <img
                src={selectedCamObj.feedUrl}
                alt={selectedCamObj.title}
                className="w-full h-full object-cover"
              />

              {/* Live Camera HUD Overlays */}
              <div className="absolute top-3 left-3 bg-black/75 backdrop-blur px-2.5 py-1 rounded text-xs font-mono text-white border border-[#1e423a] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <span className="font-bold">{selectedCamObj.id}</span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-300">{selectedCamObj.title}</span>
              </div>

              <div className="absolute top-3 right-3 bg-black/75 backdrop-blur px-2.5 py-1 rounded text-xs font-mono text-emerald-400 border border-[#1e423a]">
                {selectedCamObj.status}
              </div>

              {/* Bottom HUD info */}
              <div className="absolute bottom-3 inset-x-3 bg-[#081513]/90 backdrop-blur border border-[#1e423a] rounded-lg p-2 px-3 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-3 text-slate-300">
                  <span>FEED STATUS: <strong className="text-emerald-400">{selectedCamObj.quality}</strong></span>
                  <span className="text-slate-600">|</span>
                  <span>DETECTED: <strong className="text-amber-400">{selectedCamObj.boulders}</strong></span>
                </div>
                <button
                  onClick={() => {
                    onOpen9StepWithSpecimen("critical_boulder");
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-sans text-xs font-semibold cursor-pointer transition-colors"
                >
                  Inspect in 9-Step Pipeline &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Camera Telemetry Mini Strip */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs font-mono">
            <div className="p-2.5 bg-[#071311] border border-[#15312a] rounded-xl">
              <div className="text-slate-400 text-[10px]">THROAT OPENING LIMIT</div>
              <div className="text-emerald-400 font-bold text-sm mt-0.5">800 mm</div>
            </div>
            <div className="p-2.5 bg-[#071311] border border-[#15312a] rounded-xl">
              <div className="text-slate-400 text-[10px]">CALIBRATED BELT WIDTH</div>
              <div className="text-white font-bold text-sm mt-0.5">1400 mm</div>
            </div>
            <div className="p-2.5 bg-[#071311] border border-[#15312a] rounded-xl">
              <div className="text-slate-400 text-[10px]">CONVEYOR BELT SPEED</div>
              <div className="text-emerald-400 font-bold text-sm mt-0.5">2.4 m/s</div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Incident Stream & Stoppage Risk (5 cols) */}
        <div className="lg:col-span-5 bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#142e27]">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                RECENT OPERATIONAL INCIDENTS
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#061210] text-slate-400 border border-[#142e27]">
              {incidents.length} Records
            </span>
          </div>

          {/* Incident List */}
          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {incidents.slice(0, 7).map((inc) => (
              <div
                key={inc.id}
                onClick={() => onSelectIncident(inc)}
                className="p-3 bg-[#071311] hover:bg-[#0c1f1a] border border-[#16332c] hover:border-emerald-600/60 rounded-xl transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs text-white group-hover:text-emerald-400 transition-colors">
                      {inc.incident_number}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        inc.severity === "CRITICAL_OVERSIZE"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : inc.severity === "HIGH_RISK"
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      }`}
                    >
                      {inc.severity.replace("_", " ")}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs mt-2 text-slate-300 font-sans">
                  <span>
                    Max Caliber: <strong className="font-mono text-emerald-300">{Math.round(inc.max_boulder_mm)}mm</strong>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {inc.operator_action || "Pending Operator"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] mt-1 text-slate-400">
                  <span className="truncate max-w-[220px]">
                    {inc.media_record?.source_id}
                  </span>
                  <span
                    className={`font-semibold ${
                      inc.status === "PENDING_REVIEW"
                        ? "text-rose-400 animate-pulse"
                        : "text-emerald-400"
                    }`}
                  >
                    {inc.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Reset & Customization Modal */}
      {showKpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0b1a17] border border-[#1b3e34] rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col text-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#16332a] bg-[#071311] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">
                    OPERATIONAL KPI CONTROL PANEL
                  </h3>
                  <p className="text-xs text-slate-400">
                    Set metrics to zero for fresh baseline or specify custom target KPIs.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowKpiModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-5">
              {kpiSuccess && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{kpiSuccess}</span>
                </div>
              )}

              {/* Quick Preset Actions */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-slate-400 font-semibold uppercase">
                  QUICK PRESETS &amp; STORAGE PURGE:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isUpdatingKpi}
                    onClick={handleSetAllToZero}
                    className="flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold transition-all"
                  >
                    <span>⚡ Set All KPIs to Zero (0.0)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdatingKpi}
                    onClick={handleResetSystemAndPurgeStorage}
                    className="flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Wipe Fake Records &amp; Uploads</span>
                  </button>
                </div>
              </div>

              {/* Custom Metric Fields */}
              <div className="space-y-3 pt-2 border-t border-[#16332a]">
                <div className="text-xs font-mono text-slate-400 font-semibold uppercase">
                  CUSTOM METRIC VALUES (EDIT ANY NUMBER):
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Avoided Downtime (hours):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customDowntimeHours}
                      onChange={(e) => setCustomDowntimeHours(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Cost Avoidance (INR):</label>
                    <input
                      type="number"
                      step="1000"
                      value={customCostSavingsInr}
                      onChange={(e) => setCustomCostSavingsInr(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Actual Stoppage (minutes):</label>
                    <input
                      type="number"
                      step="1"
                      value={customActualStoppageMins}
                      onChange={(e) => setCustomActualStoppageMins(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Total Incidents Counter:</label>
                    <input
                      type="number"
                      step="1"
                      value={customTotalIncidents}
                      onChange={(e) => setCustomTotalIncidents(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Boulders Diverted Count:</label>
                    <input
                      type="number"
                      step="1"
                      value={customCriticalDiverted}
                      onChange={(e) => setCustomCriticalDiverted(e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Mean Alert Lead Time (sec):</label>
                    <input
                      type="number"
                      step="0.5"
                      value={customLeadTime}
                      onChange={(e) => setCustomLeadTime(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Detection Precision (%):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customPrecision}
                      onChange={(e) => setCustomPrecision(e.target.value)}
                      placeholder="96.4"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Detection Recall (%):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customRecall}
                      onChange={(e) => setCustomRecall(e.target.value)}
                      placeholder="98.2"
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-[#16332a] bg-[#071311] flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                disabled={isUpdatingKpi}
                onClick={handleRevertToLiveDb}
                className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 font-mono"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert to Live Database</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowKpiModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUpdatingKpi}
                  onClick={handleSaveCustomKpis}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all shadow-lg"
                >
                  {isUpdatingKpi ? "Applying..." : "Apply Custom KPIs"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
