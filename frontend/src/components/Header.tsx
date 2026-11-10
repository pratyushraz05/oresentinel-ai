import React from "react";
import {
  ShieldAlert, Activity, Sliders, PlayCircle,
  Clock, LayoutDashboard, Database, BarChart3, Sparkles
} from "lucide-react";
import type { DashboardSummary } from "../types";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  summary: DashboardSummary | null;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  summary,
  onOpenSettings,
}) => {
  return (
    <header className="border-b border-[#18342e] bg-[#071311]/90 backdrop-blur sticky top-0 z-50">
      {/* Top Banner: Industrial Meta Info */}
      <div className="px-6 py-2 border-b border-[#122823] flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="flex items-center text-emerald-400 font-semibold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-2"></span>
            TATA STEEL / WOMEN OF METTLE 2026
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">
            RAW MATERIAL CRUSHING & SIZING UNIT #2
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-500 font-mono">
            FEED THROAT: {summary?.crusher_throat_limit_mm || 800}mm
          </span>
        </div>

        <div className="flex items-center space-x-5">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>SYSTEM AVAILABILITY: <strong className="text-emerald-400 font-mono">{summary?.system_availability_pct ?? 99.8}%</strong></span>
          </div>
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>AVG LEAD TIME: <strong className="text-amber-400 font-mono">{summary?.mean_lead_time_sec ?? 74.5}s</strong> (TARGET &lt;180s)</span>
          </div>
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
            title="Crusher Calibration & Rules"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>CALIBRATION</span>
          </button>
        </div>
      </div>

      {/* Main Bar: Brand and Navigation */}
      <div className="px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-900/40 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/50">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-mono">
                ORESENTINEL <span className="text-emerald-400">AI</span>
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 tracking-wider">
                EDGE INTELLIGENCE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Boulder Detection to Crusher Downtime Intelligence
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center space-x-1 bg-[#0b1a17] p-1 rounded-xl border border-[#17342d]">
          <button
            onClick={() => setActiveTab("flagship")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "flagship"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950"
                : "text-slate-400 hover:text-white hover:bg-[#122823]"
            }`}
          >
            <PlayCircle className="w-4 h-4 text-emerald-300" />
            <span>9-Step Journey</span>
            <span className="bg-emerald-400/20 text-emerald-200 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold">
              DEMO
            </span>
          </button>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-emerald-700/60 text-emerald-200 border border-emerald-500/50"
                : "text-slate-400 hover:text-white hover:bg-[#122823]"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Operations Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "ledger"
                ? "bg-emerald-700/60 text-emerald-200 border border-emerald-500/50"
                : "text-slate-400 hover:text-white hover:bg-[#122823]"
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Incident Ledger</span>
            {summary && summary.active_alerts > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
                {summary.active_alerts}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-emerald-700/60 text-emerald-200 border border-emerald-500/50"
                : "text-slate-400 hover:text-white hover:bg-[#122823]"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Downtime KPIs</span>
          </button>

          <button
            onClick={() => setActiveTab("copilot")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === "copilot"
                ? "bg-emerald-700/60 text-emerald-200 border border-emerald-500/50"
                : "text-slate-400 hover:text-white hover:bg-[#122823]"
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-300" />
            <span>AI Copilot</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
