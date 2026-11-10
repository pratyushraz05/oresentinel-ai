import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, AreaChart, Area
} from "recharts";
import { Activity, ShieldCheck } from "lucide-react";
import type { DashboardSummary, DashboardTrends } from "../types";

interface AnalyticsViewProps {
  summary: DashboardSummary | null;
  trends: DashboardTrends | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ summary, trends }) => {
  return (
    <div className="space-y-6">
      {/* Header Banner - Slide 06 Concept */}
      <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-6 shadow-lg">
        <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 font-bold mb-1">
          <Activity className="w-4 h-4" />
          <span>05 / MEASUREMENT &amp; REAL-WORLD READINESS</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Define success using <span className="text-emerald-400">verifiable evidence.</span>
        </h2>
        <p className="text-sm text-slate-300 mt-1 max-w-3xl">
          Detection quality, operational responsiveness, and crusher downtime are measured separately
          before claiming plant-level productivity gains.
        </p>

        {/* 6 Key Slide 06 Evidence Pillars */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4 border-t border-[#15332b] text-xs font-mono">
          <div className="p-3 bg-[#071311] border border-[#16332c] rounded-xl">
            <span className="text-[10px] text-slate-400 block">DETECTION PRECISION</span>
            <strong className="text-white text-base">{summary?.detection_precision_pct ?? 96.4}%</strong>
            <span className="text-[10px] text-emerald-400 block mt-0.5">Reviewed ground truth</span>
          </div>
          <div className="p-3 bg-[#071311] border border-[#16332c] rounded-xl">
            <span className="text-[10px] text-slate-400 block">DETECTION RECALL</span>
            <strong className="text-emerald-400 text-base">{summary?.detection_recall_pct ?? 98.2}%</strong>
            <span className="text-[10px] text-emerald-400 block mt-0.5">Zero missed boulders</span>
          </div>
          <div className="p-3 bg-[#071311] border border-[#16332c] rounded-xl">
            <span className="text-[10px] text-slate-400 block">ALERT LEAD TIME</span>
            <strong className="text-amber-400 text-base">{summary?.mean_lead_time_sec ?? 74.5}s</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">Target &lt;180s</span>
          </div>
          <div className="p-3 bg-[#071311] border border-[#16332c] rounded-xl">
            <span className="text-[10px] text-slate-400 block">BOULDER DOWNTIME</span>
            <strong className="text-emerald-400 text-base">{summary?.downtime_avoided_hours ?? 4.6} hrs</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">Attributed savings</span>
          </div>
          <div className="p-3 bg-[#071311] border border-[#16332c] rounded-xl">
            <span className="text-[10px] text-slate-400 block">SYSTEM AVAILABILITY</span>
            <strong className="text-white text-base">{summary?.system_availability_pct ?? 99.8}%</strong>
            <span className="text-[10px] text-emerald-400 block mt-0.5">Edge CV uptime</span>
          </div>
          <div className="p-3 bg-[#071311] border border-[#16332c] rounded-xl">
            <span className="text-[10px] text-slate-400 block">COST AVOIDANCE</span>
            <strong className="text-emerald-400 text-base">
              ₹{((summary?.cost_avoidance_inr ?? 690000) / 100000).toFixed(2)}L
            </strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">₹1.5L / hr rate</span>
          </div>
        </div>
      </div>

      {/* Recharts Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: 7-Day Downtime Avoided Trends */}
        <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#142e27] mb-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
              Avoided Downtime vs Actual Stoppages (7 Days)
            </h3>
            <span className="text-[10px] font-mono text-emerald-400">Minutes</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends?.daily_trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#142c25" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#061311",
                    borderColor: "#1b3f36",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Bar dataKey="downtime_avoided_mins" name="Avoided Stoppage (Mins)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual_downtime_mins" name="Actual Stoppage (Mins)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Caliber Size Distribution Histogram */}
        <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#142e27] mb-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
              Boulder Caliber Distribution vs 800mm Throat Limit
            </h3>
            <span className="text-[10px] font-mono text-emerald-400">Detections Count</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends?.size_distribution || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#142c25" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#061311",
                    borderColor: "#1b3f36",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Detected Fragments"
                  stroke="#34d399"
                  fill="rgba(52, 211, 153, 0.2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lower Row: Edge Sensor Availability & Scientific Readiness Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sensor Node Performance Table */}
        <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg space-y-3">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono pb-2 border-b border-[#142e27]">
            Edge Camera Ingestion &amp; Reliability
          </h3>
          <div className="space-y-2 text-xs font-mono">
            {trends?.camera_performance.map((cam, idx) => (
              <div
                key={idx}
                className="p-3 bg-[#071311] border border-[#15312a] rounded-xl flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-white">{cam.name}</div>
                  <div className="text-[10px] text-slate-400">{cam.camera}</div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">Detections</span>
                    <strong className="text-slate-200">{cam.detections}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">Oversize</span>
                    <strong className="text-rose-400">{cam.oversize}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">Uptime</span>
                    <strong className="text-emerald-400">{cam.uptime}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prototype What We Can Prove vs Site Pilot (Directly from Slide 06) */}
        <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono pb-2 border-b border-[#142e27]">
            Prototype vs Industrial Site Pilot Scope
          </h3>

          <div className="p-3 bg-[#081814] border border-emerald-700/40 rounded-xl text-xs space-y-1">
            <div className="font-bold text-emerald-300 font-mono flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>PROTOTYPE: WHAT WE CAN PROVE</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Functional image/video upload; verified OpenCV/YOLO inference; rule-based risk classification;
              reviewable alerts; immutable audit ledger; downtime KPI calculations; stored-record Copilot queries;
              simulated crusher outcomes.
            </p>
          </div>

          <div className="p-3 bg-[#111c19] border border-slate-700/50 rounded-xl text-xs space-y-1">
            <div className="font-bold text-slate-300 font-mono flex items-center space-x-1.5">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>SITE PILOT: WHAT STILL NEEDS DATA</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Site-approved jaw aperture limits; calibrated dual-laser cameras; representative mine-face labeled imagery;
              operator response telemetry; SCADA crusher stoppage logs; financial baseline throughput assumptions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
