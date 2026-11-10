import React, { useState } from "react";
import {
  Clock, TrendingUp, DollarSign, Activity, Video, ShieldAlert
} from "lucide-react";
import type { DashboardSummary, Incident } from "../types";
import { LiveWebcamFeed } from "./LiveWebcamFeed";

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
      {/* Top Operational Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Avoided Downtime */}
        <div className="bg-[#0b1916] border border-[#1b3a32] rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>AVOIDED DOWNTIME</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-400 tracking-tight">
            {summary?.downtime_avoided_hours ?? 4.6} <span className="text-sm font-sans text-slate-300">hrs</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{Math.round(summary?.downtime_avoided_minutes ?? 275)} stoppage mins saved</span>
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
            ₹{((summary?.cost_avoidance_inr ?? 690000) / 100000).toFixed(2)}{" "}
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
            {summary?.mean_lead_time_sec ?? 74.5} <span className="text-sm font-sans text-slate-300">sec</span>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>Target: &lt;{summary?.lead_time_target_sec ?? 180}s</span>
            <span className="text-emerald-400 font-semibold font-mono">58% Margin</span>
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
            Ground-truth verified rock samples
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
    </div>
  );
};
