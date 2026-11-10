import React, { useState } from "react";
import { Database, Filter, Eye, X, Sparkles } from "lucide-react";
import type { Incident } from "../types";
import { acknowledgeIncident, linkOutcome } from "../api";

interface IncidentLedgerProps {
  incidents: Incident[];
  onRefresh: () => void;
  onOpenCopilot: (incNumber: string) => void;
  selectedIncident: Incident | null;
  onSelectIncident: (inc: Incident | null) => void;
}

export const IncidentLedger: React.FC<IncidentLedgerProps> = ({
  incidents,
  onRefresh,
  onOpenCopilot,
  selectedIncident,
  onSelectIncident,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterSource, setFilterSource] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isActing, setIsActing] = useState<boolean>(false);

  const filtered = incidents.filter((inc) => {
    if (filterSeverity !== "ALL" && inc.severity !== filterSeverity) return false;
    if (filterStatus !== "ALL" && inc.status !== filterStatus) return false;
    if (filterSource !== "ALL" && inc.media_record?.source_id !== filterSource) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNum = inc.incident_number.toLowerCase().includes(q);
      const matchNotes = inc.operator_notes?.toLowerCase().includes(q);
      if (!matchNum && !matchNotes) return false;
    }
    return true;
  });

  const handleAction = async (actionType: string) => {
    if (!selectedIncident) return;
    setIsActing(true);
    try {
      const updated = await acknowledgeIncident(
        selectedIncident.id,
        "OP-SiteEngineer",
        actionType,
        "Processed via Operational Incident Ledger."
      );
      onSelectIncident(updated);
      onRefresh();
    } catch (err) {
      alert("Error: " + err);
    } finally {
      setIsActing(false);
    }
  };

  const handleLink = async (outcomeType: string, avoidedMins: number) => {
    if (!selectedIncident) return;
    setIsActing(true);
    try {
      const updated = await linkOutcome(
        selectedIncident.id,
        outcomeType,
        0.0,
        avoidedMins,
        "Verified through SCADA stoppage attribution ledger."
      );
      onSelectIncident(updated);
      onRefresh();
    } catch (err) {
      alert("Error: " + err);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Controls */}
      <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#142e27]">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 font-bold mb-1">
              <Database className="w-4 h-4" />
              <span>03 / OPERATIONAL LEDGER &amp; AUDIT TRAIL</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Incident Explorer &amp; Immutable Audit Trail
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Every rock detection event is persistently recorded with source metadata, operator responses, and crusher outcomes.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search INC-2026-..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#071311] border border-[#1b3b33] rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-3 pt-3 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Severity */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-[#071311] border border-[#1b3b33] rounded-lg px-2.5 py-1 text-slate-300 font-mono focus:outline-none"
          >
            <option value="ALL">Severity: All</option>
            <option value="CRITICAL_OVERSIZE">Critical Oversize</option>
            <option value="HIGH_RISK">High Risk</option>
            <option value="MEDIUM_RISK">Medium Risk</option>
            <option value="NORMAL">Normal</option>
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#071311] border border-[#1b3b33] rounded-lg px-2.5 py-1 text-slate-300 font-mono focus:outline-none"
          >
            <option value="ALL">Status: All</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="DIVERTED">Diverted</option>
            <option value="RESOLVED">Resolved</option>
            <option value="OVERRIDDEN">Overridden</option>
          </select>

          {/* Camera Source */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="bg-[#071311] border border-[#1b3b33] rounded-lg px-2.5 py-1 text-slate-300 font-mono focus:outline-none"
          >
            <option value="ALL">Camera: All Nodes</option>
            <option value="CAM-01-CHUTE">CAM-01 Primary Chute</option>
            <option value="CAM-02-JAW">CAM-02 Jaw Throat</option>
            <option value="CAM-03-TRANSFER">CAM-03 Overband</option>
          </select>

          <span className="text-slate-500 font-mono ml-auto">
            Showing {filtered.length} of {incidents.length} incidents
          </span>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 font-sans">
            <thead className="bg-[#061210] border-b border-[#142e27] text-slate-400 font-mono text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">Incident ID</th>
                <th className="py-3 px-4">Camera / Time</th>
                <th className="py-3 px-4">Caliber (mm)</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Operator Action</th>
                <th className="py-3 px-4">Lead Time</th>
                <th className="py-3 px-4">Crusher Outcome</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#122822]">
              {filtered.map((inc) => (
                <tr
                  key={inc.id}
                  onClick={() => onSelectIncident(inc)}
                  className="hover:bg-[#0c1f1a] transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4 font-mono font-bold text-white group-hover:text-emerald-400">
                    {inc.incident_number}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-mono text-slate-300">{inc.media_record?.source_id}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(inc.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-emerald-300 font-bold text-sm">
                      {Math.round(inc.max_boulder_mm)}mm
                    </span>
                    <span className="text-[10px] text-slate-500 block">Limit: 800mm</span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        inc.severity === "CRITICAL_OVERSIZE"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : inc.severity === "HIGH_RISK"
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      }`}
                    >
                      {inc.severity.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {inc.operator_action ? (
                      <span className="font-semibold text-slate-200">
                        {inc.operator_action}
                      </span>
                    ) : (
                      <span className="text-rose-400 font-semibold animate-pulse font-mono">
                        PENDING
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {inc.lead_time_seconds ? (
                      <span className="text-amber-300">{inc.lead_time_seconds}s</span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {inc.outcome ? (
                      <span className="text-emerald-400 font-semibold">
                        {inc.outcome.outcome_type.replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-slate-500">Unlinked</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectIncident(inc);
                      }}
                      className="p-1.5 rounded-lg bg-[#0e241f] hover:bg-emerald-700 hover:text-white text-slate-400 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Detail Inspection Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a1815] border border-emerald-600/50 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#16362e]">
              <div className="flex items-center space-x-3">
                <span className="text-lg font-mono font-bold text-white">
                  {selectedIncident.incident_number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                    selectedIncident.severity === "CRITICAL_OVERSIZE"
                      ? "bg-rose-950 text-rose-300 border border-rose-800"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  }`}
                >
                  {selectedIncident.severity}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Score: {selectedIncident.risk_score}/100
                </span>
              </div>
              <button
                onClick={() => onSelectIncident(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#122c25] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media & Detection Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Photo Frame */}
              <div className="border border-[#17372f] rounded-xl overflow-hidden bg-black">
                <img
                  src={selectedIncident.media_record?.annotated_path || selectedIncident.media_record?.original_path}
                  alt="Incident CV Frame"
                  className="w-full h-auto object-contain max-h-[340px]"
                />
              </div>

              {/* Telemetry and Explanation */}
              <div className="space-y-4">
                <div className="p-3 bg-[#061210] border border-[#142d27] rounded-xl">
                  <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                    Risk Engine Rationale
                  </div>
                  <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                    {selectedIncident.explanation}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-[#061210] border border-[#142d27] rounded-xl">
                    <span className="text-slate-400 text-[10px] block">Max Caliber</span>
                    <strong className="text-white text-base">
                      {Math.round(selectedIncident.max_boulder_mm)} mm
                    </strong>
                  </div>
                  <div className="p-2.5 bg-[#061210] border border-[#142d27] rounded-xl">
                    <span className="text-slate-400 text-[10px] block">Crusher Throat Limit</span>
                    <strong className="text-emerald-400 text-base">800 mm</strong>
                  </div>
                  <div className="p-2.5 bg-[#061210] border border-[#142d27] rounded-xl">
                    <span className="text-slate-400 text-[10px] block">Alert Lead Time</span>
                    <strong className="text-amber-400 text-base">
                      {selectedIncident.lead_time_seconds ? `${selectedIncident.lead_time_seconds}s` : "Pending"}
                    </strong>
                  </div>
                  <div className="p-2.5 bg-[#061210] border border-[#142d27] rounded-xl">
                    <span className="text-slate-400 text-[10px] block">Bridging Probability</span>
                    <strong className="text-white text-base">
                      {selectedIncident.bridging_probability ? `${Math.round(selectedIncident.bridging_probability * 100)}%` : "N/A"}
                    </strong>
                  </div>
                </div>

                {/* Operator Actions if Pending */}
                {selectedIncident.status === "PENDING_REVIEW" && (
                  <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-xl space-y-2">
                    <div className="text-xs font-semibold text-rose-300">
                      Record Mitigation Action:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAction("DIVERT_CHUTE")}
                        disabled={isActing}
                        className="p-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs cursor-pointer"
                      >
                        Divert Chute Gate
                      </button>
                      <button
                        onClick={() => handleAction("HALT_CONVEYOR")}
                        disabled={isActing}
                        className="p-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs cursor-pointer"
                      >
                        Halt Conveyor
                      </button>
                    </div>
                  </div>
                )}

                {/* Link Outcome if Actioned but unlinked */}
                {selectedIncident.operator_action && !selectedIncident.outcome && (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-2">
                    <div className="text-xs font-semibold text-emerald-300">
                      Link Crusher Stoppage Outcome:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleLink("AVOIDED_STOPPAGE", 45.0)}
                        disabled={isActing}
                        className="p-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs cursor-pointer"
                      >
                        Avoided Stoppage (45m)
                      </button>
                      <button
                        onClick={() => handleLink("CONFIRMED_JAM", 0.0)}
                        disabled={isActing}
                        className="p-2 rounded-lg bg-rose-800 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer"
                      >
                        Confirmed Jam
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Audit Trail (Steps 1 to 9) */}
            <div className="pt-4 border-t border-[#16362e]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400 font-bold uppercase">
                  Persistent Audit Logs ({selectedIncident.audit_logs?.length || 0} Events)
                </span>
                <button
                  onClick={() => {
                    onOpenCopilot(selectedIncident.incident_number);
                    onSelectIncident(null);
                  }}
                  className="flex items-center space-x-1.5 text-xs text-emerald-400 hover:underline font-mono"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ask Copilot about this event &rarr;</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {selectedIncident.audit_logs?.map((log, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-[#061210] rounded-lg border border-[#142d27] flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-emerald-400 font-bold">{log.step_name}</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-300 text-[11px]">{log.details}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-slate-500 text-[10px]">
                      <span>{log.actor}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
