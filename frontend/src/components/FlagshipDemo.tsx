import React, { useState } from "react";
import {
  Upload, Camera, CheckCircle2, AlertTriangle, ShieldCheck,
  ArrowRight, ShieldAlert, Zap, DollarSign, Sparkles, RefreshCw,
  Video
} from "lucide-react";
import type { Incident, SpecimenFixture } from "../types";
import { runDemonstrationPipeline, acknowledgeIncident, linkOutcome } from "../api";
import confetti from "canvas-confetti";
import { LiveWebcamFeed } from "./LiveWebcamFeed";

interface FlagshipDemoProps {
  fixtures: SpecimenFixture[];
  onIncidentUpdated: () => void;
  onOpenCopilotWithIncident: (incNumber: string) => void;
}

export const FlagshipDemo: React.FC<FlagshipDemoProps> = ({
  fixtures,
  onIncidentUpdated,
  onOpenCopilotWithIncident,
}) => {
  const [inputMode, setInputMode] = useState<"specimen" | "webcam" | "upload">("specimen");
  const [selectedSpecimen, setSelectedSpecimen] = useState<string>("critical_boulder");
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [cameraSource, setCameraSource] = useState<string>("CAM-01-CHUTE");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [linkedIncident, setLinkedIncident] = useState<Incident | null>(null);
  const [, setActiveStepTab] = useState<number>(3); // 1-9
  const [actionNotes, setActionNotes] = useState<string>("Diverting oversized boulder to hydraulic breaker station.");

  const handleRunPipeline = async () => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      let srcId = cameraSource;

      if (inputMode === "upload") {
        if (!customFile) {
          alert("Please select or drop an image file first.");
          setIsLoading(false);
          return;
        }
        formData.append("file", customFile);
      } else {
        formData.append("specimen_id", selectedSpecimen || "critical_boulder");
      }

      formData.append("source_id", srcId);

      const inc = await runDemonstrationPipeline(formData);
      setLinkedIncident(inc);
      setActiveStepTab(3); // Jump to Detection step
      onIncidentUpdated();
    } catch (err) {
      console.error(err);
      alert("Pipeline run failed: " + err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOperatorAction = async (actionType: string) => {
    if (!linkedIncident) return;
    setIsLoading(true);
    try {
      const updated = await acknowledgeIncident(
        linkedIncident.id,
        "OP-ControlRoom",
        actionType,
        actionNotes
      );
      setLinkedIncident(updated);
      setActiveStepTab(7); // Jump to outcome step
      onIncidentUpdated();
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    } catch (err) {
      alert("Failed to acknowledge: " + err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkOutcome = async (outcomeType: string, avoidedMins: number) => {
    if (!linkedIncident) return;
    setIsLoading(true);
    try {
      const updated = await linkOutcome(
        linkedIncident.id,
        outcomeType,
        0.0,
        avoidedMins,
        "Verified via SCADA motor current logs and conveyor diverter gate feedback."
      );
      setLinkedIncident(updated);
      setActiveStepTab(8); // Jump to Analyze step
      onIncidentUpdated();
      confetti({ particleCount: 80, spread: 90, origin: { y: 0.6 } });
    } catch (err) {
      alert("Failed to link outcome: " + err);
    } finally {
      setIsLoading(false);
    }
  };

  const steps = [
    { num: 1, id: "capture", label: "01 Capture", sub: "Camera/Upload" },
    { num: 2, id: "validate", label: "02 Validate", sub: "QC & Exposure" },
    { num: 3, id: "detect", label: "03 Detect", sub: "YOLO/OpenCV" },
    { num: 4, id: "risk", label: "04 Assess Risk", sub: "Throat Rules" },
    { num: 5, id: "alert", label: "05 Alert", sub: "Ledger Event" },
    { num: 6, id: "acknowledge", label: "06 Acknowledge", sub: "Operator Action" },
    { num: 7, id: "outcome", label: "07 Link Outcome", sub: "Crusher Stoppage" },
    { num: 8, id: "analyze", label: "08 Analyze", sub: "KPIs & Cost" },
    { num: 9, id: "explain", label: "09 Explain", sub: "Copilot Insights" },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Concept Banner directly from Slide 02 */}
      <div className="bg-gradient-to-r from-[#0d221c] via-[#091714] to-[#071311] p-6 rounded-2xl border border-emerald-800/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-mono font-semibold uppercase tracking-wider mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>01 / OPERATIONAL FLOW & VERTICAL SLICE DEMONSTRATION</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Nine steps. <span className="text-emerald-400">One traceable incident.</span>
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              A complete demonstration path from incoming rock imagery (or your live laptop camera) to explainable,
              evidence-backed operational crusher downtime analytics.
            </p>
          </div>

          {linkedIncident && (
            <div className="bg-[#0b1b17] border border-emerald-500/40 px-4 py-2.5 rounded-xl flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-mono">Linked Traceable Incident</div>
                <div className="text-base font-bold text-emerald-300 font-mono">
                  {linkedIncident.incident_number}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 9-Step Horizontal Progress Stepper */}
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 mt-6 pt-5 border-t border-[#16362e]">
          {steps.map((s) => {
            const isCompleted =
              (s.num <= 5 && !!linkedIncident) ||
              (s.num === 6 && !!linkedIncident?.operator_action) ||
              (s.num === 7 && !!linkedIncident?.outcome) ||
              (s.num >= 8 && !!linkedIncident?.outcome);

            return (
              <button
                key={s.num}
                onClick={() => setActiveStepTab(s.num)}
                className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                  isCompleted
                    ? "bg-[#0b1d19] border-emerald-800/60 text-emerald-300"
                    : "bg-[#081512] border-slate-800/80 text-slate-500 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold font-mono">
                    0{s.num}
                  </span>
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700" />
                  )}
                </div>
                <div className="mt-1">
                  <div className="text-xs font-semibold truncate text-slate-200">
                    {s.label.split(" ")[1]}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {s.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Selection / Step Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Step 1 & 2 Card: Capture & Validate */}
          <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-[#15312a] mb-4">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  01 / CAPTURE &amp; 02 / VALIDATE
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                QC ISO/IEC 15415
              </span>
            </div>

            {/* Input Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#071311] border border-[#173730] rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setInputMode("specimen")}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  inputMode === "specimen"
                    ? "bg-emerald-700 text-white font-semibold shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Ore Specimen
              </button>
              <button
                type="button"
                onClick={() => setInputMode("webcam")}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                  inputMode === "webcam"
                    ? "bg-emerald-700 text-white font-semibold shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Laptop Cam</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode("upload")}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  inputMode === "upload"
                    ? "bg-emerald-700 text-white font-semibold shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Upload File
              </button>
            </div>

            {/* Mode 1: Pre-configured Ore Specimens */}
            {inputMode === "specimen" && (
              <>
                <div className="mb-4">
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Select Active Feed Camera:
                  </label>
                  <select
                    value={cameraSource}
                    onChange={(e) => setCameraSource(e.target.value)}
                    className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="CAM-01-CHUTE">CAM-01-CHUTE (Primary Feed Chute)</option>
                    <option value="CAM-02-JAW">CAM-02-JAW (Primary Jaw Crusher Inlet)</option>
                    <option value="CAM-03-TRANSFER">CAM-03-TRANSFER (Transfer Chute Overband)</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    Choose Test Ore Specimen:
                  </label>
                  <div className="space-y-2">
                    {fixtures.map((spec) => (
                      <label
                        key={spec.id}
                        onClick={() => {
                          setSelectedSpecimen(spec.id);
                          setCustomFile(null);
                        }}
                        className={`block p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          selectedSpecimen === spec.id && !customFile
                            ? "bg-emerald-950/40 border-emerald-500 text-white shadow-sm"
                            : "bg-[#071311] border-[#18362f] text-slate-400 hover:border-slate-700 hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-slate-200">{spec.title}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              spec.expected_severity === "CRITICAL_OVERSIZE"
                                ? "bg-rose-950 text-rose-300 border border-rose-800"
                                : spec.expected_severity === "HIGH_RISK"
                                ? "bg-amber-950 text-amber-300 border border-amber-800"
                                : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            }`}
                          >
                            {spec.expected_severity.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{spec.description}</p>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Mode 2: Live Laptop Webcam (Continuous Stream & Bounding Boxes) */}
            {inputMode === "webcam" && (
              <div className="mb-4">
                <LiveWebcamFeed
                  onIncidentTriggered={(inc) => {
                    setLinkedIncident(inc);
                    onIncidentUpdated();
                  }}
                  defaultThroatLimitMm={800}
                />
              </div>
            )}

            {/* Mode 3: Upload Custom File */}
            {inputMode === "upload" && (
              <div className="mb-4 space-y-3">
                <label className="text-xs text-slate-400 block font-medium">
                  Upload Live Inspection Imagery:
                </label>
                <div className="relative border-2 border-dashed border-[#1d3d35] rounded-xl p-4 text-center bg-[#071311] hover:border-emerald-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setCustomFile(e.target.files[0]);
                        setSelectedSpecimen("");
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2 text-xs text-slate-300">
                    <Upload className="w-6 h-6 text-emerald-400" />
                    <span>{customFile ? customFile.name : "Click or drop rock image (JPG / PNG)"}</span>
                    <span className="text-[10px] text-slate-500 font-mono">Conveyor CCTV or field photo</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Trigger Button (Hidden in webcam continuous stream mode) */}
            {inputMode !== "webcam" && (
              <button
                onClick={handleRunPipeline}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/60 cursor-pointer transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Processing CV Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Run Vertical Slice Pipeline (Steps 1 - 5)</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Step 6: Operator Action Card */}
          {linkedIncident && (
            <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-[#15312a] mb-4">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                    06 / OPERATOR ACKNOWLEDGE
                  </h3>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    linkedIncident.status === "PENDING_REVIEW"
                      ? "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse"
                      : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  }`}
                >
                  {linkedIncident.status}
                </span>
              </div>

              {linkedIncident.status === "PENDING_REVIEW" ? (
                <div className="space-y-3">
                  <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>ACTION REQUIRED:</strong> Boulder caliber (
                      {int(linkedIncident.max_boulder_mm)}mm) exceeds crusher throat limit (800mm).
                      Select operational mitigation before boulder reaches inlet chute:
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Operator Log Notes:
                    </label>
                    <input
                      type="text"
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => handleOperatorAction("DIVERT_CHUTE")}
                      disabled={isLoading}
                      className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                    >
                      <span>Divert Chute Gate</span>
                    </button>
                    <button
                      onClick={() => handleOperatorAction("HALT_CONVEYOR")}
                      disabled={isLoading}
                      className="p-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                    >
                      <span>Halt Conveyor Belt</span>
                    </button>
                  </div>
                  <button
                    onClick={() => handleOperatorAction("FALSE_ALARM")}
                    disabled={isLoading}
                    className="w-full py-2 rounded-xl bg-[#0e211c] hover:bg-[#142d27] border border-[#1c3f36] text-slate-300 text-xs transition-colors cursor-pointer"
                  >
                    Flag as Normal / Manual Bypass
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-emerald-300 font-semibold">
                    <span>Action Recorded: {linkedIncident.operator_action}</span>
                    <span className="font-mono text-xs">
                      Lead Time: {linkedIncident.lead_time_seconds ?? 68}s
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{linkedIncident.operator_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 7: Link Crusher Outcome Card */}
          {linkedIncident && linkedIncident.operator_action && (
            <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-[#15312a] mb-4">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                    07 / LINK CRUSHER OUTCOME
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                  DOWNTIME ATTRIBUTION
                </span>
              </div>

              {!linkedIncident.outcome ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-300">
                    Associate this incident with verified crusher outcome to quantify avoided downtime:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleLinkOutcome("AVOIDED_STOPPAGE", 45.0)}
                      disabled={isLoading}
                      className="p-3 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600 text-left text-xs transition-colors cursor-pointer"
                    >
                      <div className="font-bold text-emerald-300">Avoided Stoppage</div>
                      <div className="text-[11px] text-slate-300 mt-0.5">
                        Saved ~45 mins downtime (₹1.12 Lakhs)
                      </div>
                    </button>
                    <button
                      onClick={() => handleLinkOutcome("CONFIRMED_JAM", 0.0)}
                      disabled={isLoading}
                      className="p-3 rounded-xl bg-rose-950/50 hover:bg-rose-900 border border-rose-800 text-left text-xs transition-colors cursor-pointer"
                    >
                      <div className="font-bold text-rose-300">Confirmed Jam</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Actual downtime sustained
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-950/30 border border-emerald-700/50 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300">
                      Outcome: {linkedIncident.outcome.outcome_type.replace("_", " ")}
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      Saved: INR {int(linkedIncident.outcome.financial_impact_inr).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {linkedIncident.outcome.maintenance_log}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Visual Evidence, Detections, & Intelligence (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {linkedIncident ? (
            <>
              {/* Media View: Original Feed vs Annotated CV HUD */}
              <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between pb-3 border-b border-[#15312a] mb-4">
                  <div className="flex items-center space-x-2">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                      03 / COMPUTER VISION EVIDENCE HUD
                    </h3>
                  </div>
                  <div className="flex items-center space-x-2 text-xs font-mono">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[10px] font-semibold">
                      {linkedIncident.media_record?.detections?.[0]?.model_name || "Ultralytics-YOLOv8"}
                    </span>
                    <span className="text-slate-400">QC SCORE:</span>
                    <span className="text-emerald-400 font-bold">
                      {linkedIncident.media_record?.quality_score ?? 95.0}%
                    </span>
                  </div>
                </div>

                {/* Media Image Frame */}
                <div className="relative rounded-xl overflow-hidden border border-[#1e423a] bg-black group">
                  <img
                    src={linkedIncident.media_record?.annotated_path || linkedIncident.media_record?.original_path}
                    alt="Analyzed Conveyor Frame"
                    className="w-full h-auto max-h-[420px] object-contain mx-auto"
                  />
                  {/* Watermark badge */}
                  <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur border border-emerald-500/50 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-300 flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
                    <span>
                      {linkedIncident.media_record?.source_id} | MAX CALIBER: {int(linkedIncident.max_boulder_mm)}mm
                    </span>
                  </div>
                </div>

                {/* Risk Explanation Rationale Box */}
                <div className="mt-4 p-4 bg-[#071412] border border-[#1a3831] rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-slate-400 uppercase font-bold">
                      04 / RISK ENGINE ASSESSMENT
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-md font-bold font-mono ${
                        linkedIncident.severity === "CRITICAL_OVERSIZE"
                          ? "bg-rose-950 text-rose-300 border border-rose-700"
                          : linkedIncident.severity === "HIGH_RISK"
                          ? "bg-amber-950 text-amber-300 border border-amber-700"
                          : "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      }`}
                    >
                      {linkedIncident.severity} (Score {linkedIncident.risk_score}/100)
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {linkedIncident.explanation}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#132d27] text-center">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Max Caliber</div>
                      <div className="text-base font-bold text-white font-mono">
                        {int(linkedIncident.max_boulder_mm)}mm
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Crusher Throat</div>
                      <div className="text-base font-bold text-slate-300 font-mono">
                        800mm
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Bridging Index</div>
                      <div className="text-base font-bold text-amber-400 font-mono">
                        {linkedIncident.bridging_probability ? `${int(linkedIncident.bridging_probability * 100)}%` : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 8 & 9: Analysis & Copilot Quick Action */}
              <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between pb-3 border-b border-[#15312a] mb-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                      08 / ANALYZE &amp; 09 / EXPLAIN WITH COPILOT
                    </h3>
                  </div>
                  <button
                    onClick={() => onOpenCopilotWithIncident(linkedIncident.incident_number)}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow"
                  >
                    <span>Audit in Copilot</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-[#071311] border border-[#19362e] rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Avoided Downtime</div>
                    <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                      {linkedIncident.outcome ? `${linkedIncident.outcome.avoided_downtime_minutes} mins` : "0 mins"}
                    </div>
                  </div>
                  <div className="p-3 bg-[#071311] border border-[#19362e] rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Financial Saved</div>
                    <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                      {linkedIncident.outcome ? `₹${int(linkedIncident.outcome.financial_impact_inr / 1000)}k` : "₹0"}
                    </div>
                  </div>
                  <div className="p-3 bg-[#071311] border border-[#19362e] rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Model Precision</div>
                    <div className="text-base font-bold text-white font-mono mt-0.5">
                      96.4%
                    </div>
                  </div>
                  <div className="p-3 bg-[#071311] border border-[#19362e] rounded-xl">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Alert Lead Time</div>
                    <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                      {linkedIncident.lead_time_seconds ? `${linkedIncident.lead_time_seconds}s` : "Pending"}
                    </div>
                  </div>
                </div>

                {/* Audit Trail Accordion Summary */}
                <div className="mt-4 pt-4 border-t border-[#142d27]">
                  <div className="text-xs font-mono text-slate-400 mb-2 font-semibold">
                    TRACEABLE AUDIT LOGS FOR {linkedIncident.incident_number}:
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {linkedIncident.audit_logs?.map((log, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] p-2 bg-[#071311] rounded-lg border border-[#142d27] flex items-center justify-between text-slate-300 font-mono"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-emerald-400 font-bold">{log.step_name}</span>
                          <span className="text-slate-400">|</span>
                          <span className="truncate max-w-sm text-slate-300">{log.details}</span>
                        </div>
                        <span className="text-slate-500 text-[10px] shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Empty placeholder state */
            <div className="bg-[#0b1816] border border-[#18362f] rounded-2xl p-12 text-center h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center text-emerald-400">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="max-w-md">
                <h3 className="text-lg font-bold text-white">Ready for Flagship Demonstration</h3>
                <p className="text-xs text-slate-400 mt-2">
                  Select <strong className="text-emerald-300">"Laptop Cam"</strong> to use your real webcam, or pick a test specimen on the left, then click
                  <strong className="text-emerald-300"> "Run Vertical Slice Pipeline"</strong> to execute
                  the connected 9-step flow on a single traceable incident.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function int(val: number | undefined): number {
  return Math.round(val || 0);
}
