import React, { useState } from "react";
import {
  CheckCircle2, Save, Download, Trash2,
  Info, AlertTriangle, Ruler, Target,
  ChevronDown, ChevronUp, Edit3, RefreshCw, Zap
} from "lucide-react";
import type { Measurement, Correction, RealtimeDetectionBox, MeasurementStats, FeedbackRequest } from "../types";
import { formatMeasurement, getSeverityLabel, calculateError } from "../utils/measurementEngine";
import { saveCorrection, computeLocalStats } from "../utils/feedbackSystem";
import { submitFeedback, exportTrainingData } from "../api";

interface MeasurementPanelProps {
  measurement: Measurement | null;
  detection: RealtimeDetectionBox | null;
  isCalibrated: boolean;
  calibrationScale: number;
  throatLimitMm: number;
  warningThresholdMm: number;
  onCorrectionSubmit: (correction: Correction) => void;
  onCalibrationClick: () => void;
  onClearClick: () => void;
  isAdjustingBox?: boolean;
  setIsAdjustingBox?: (val: boolean) => void;
  customBox?: [number, number, number, number] | null;
  onDirectRecalibrate?: (actualWidthCm: number, actualHeightCm: number, distanceCm?: number) => Promise<any>;
  recalibrationCount?: number;
  calibMmPerPx?: number;
  objectDistanceCm?: number;
  setObjectDistanceCm?: (d: number) => void;
  onMeasureNextObject?: () => void;
}

export const MeasurementPanel: React.FC<MeasurementPanelProps> = ({
  measurement,
  detection,
  isCalibrated,
  calibrationScale,
  throatLimitMm,
  warningThresholdMm,
  onCorrectionSubmit,
  onCalibrationClick,
  onClearClick,
  isAdjustingBox = false,
  setIsAdjustingBox,
  customBox = null,
  onDirectRecalibrate,
  recalibrationCount = 0,
  calibMmPerPx = 0.8,
  objectDistanceCm = 50,
  setObjectDistanceCm,
  onMeasureNextObject,
}) => {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionWidth, setCorrectionWidth] = useState("");
  const [correctionHeight, setCorrectionHeight] = useState("");
  const [correctionUnit, setCorrectionUnit] = useState<"mm" | "cm" | "m">("cm");
  const [saving, setSaving] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [recalibrationSuccess, setRecalibrationSuccess] = useState<string | null>(null);
  const [userConfirmed, setUserConfirmed] = useState(false);

  // Recalibration inputs in Centimeters (cm)
  const [actualWidthCmInput, setActualWidthCmInput] = useState<string>("");
  const [actualHeightCmInput, setActualHeightCmInput] = useState<string>("");
  const [distanceCmInput, setDistanceCmInput] = useState<string>((objectDistanceCm || 50).toString());

  const [stats, setStats] = useState<MeasurementStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load stats on mount
  React.useEffect(() => {
    computeLocalStats().then(setStats);
  }, []);

  // Set default recalibration inputs when measurement or customBox changes
  React.useEffect(() => {
    if (measurement) {
      if (!actualWidthCmInput) {
        setActualWidthCmInput((measurement.predictedWidthMm / 10).toFixed(1));
      }
      if (!actualHeightCmInput) {
        setActualHeightCmInput((measurement.predictedHeightMm / 10).toFixed(1));
      }
    }
  }, [measurement]);

  // Handle direct continuous recalibration on user adjusted box
  const handleRecalibrateClick = async () => {
    if (!onDirectRecalibrate) return;
    const wCm = parseFloat(actualWidthCmInput);
    const hCm = parseFloat(actualHeightCmInput);
    const dCm = parseFloat(distanceCmInput) || objectDistanceCm || 50;

    if (isNaN(wCm) || isNaN(hCm) || wCm <= 0 || hCm <= 0) {
      alert("Please enter valid width and height in centimeters (e.g. 25.0 cm).");
      return;
    }

    setRecalibrating(true);
    setRecalibrationSuccess(null);
    try {
      if (setObjectDistanceCm && dCm > 0) {
        setObjectDistanceCm(dCm);
      }
      await onDirectRecalibrate(wCm, hCm, dCm);
      setUserConfirmed(true);
      setRecalibrationSuccess(`Iteration #${recalibrationCount + 1} calibrated successfully! Physical scale updated at ${dCm} cm.`);
      setTimeout(() => setRecalibrationSuccess(null), 8000);
    } catch (err: any) {
      alert(`Recalibration failed: ${err.message || "Unknown error"}`);
    } finally {
      setRecalibrating(false);
    }
  };

  // Handle correction submit
  const handleSubmitCorrection = async (userVerified: boolean, usePredicted: boolean = false) => {
    if (!measurement || !detection) return;

    let actualWidthMm = measurement.predictedWidthMm;
    let actualHeightMm = measurement.predictedHeightMm;

    if (!usePredicted) {
      const width = parseFloat(correctionWidth);
      const height = parseFloat(correctionHeight);

      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        alert("Please enter valid dimensions");
        return;
      }

      actualWidthMm = width;
      actualHeightMm = height;
      if (correctionUnit === "cm") {
        actualWidthMm = width * 10;
        actualHeightMm = height * 10;
      } else if (correctionUnit === "m") {
        actualWidthMm = width * 1000;
        actualHeightMm = height * 1000;
      }
    }

    const error = calculateError(
      { width: measurement.predictedWidthMm, height: measurement.predictedHeightMm },
      { width: actualWidthMm, height: actualHeightMm }
    );

    const correction: Correction = {
      ...measurement,
      actualWidthMm,
      actualHeightMm,
      errorWidthMm: error.widthMm,
      errorHeightMm: error.heightMm,
      errorPercent: error.percent,
      userVerified,
    };

    // Prepare feedback request for backend
    const feedbackRequest: FeedbackRequest = {
      measurement_id: measurement.id,
      camera_id: measurement.cameraId,
      image_data_url: measurement.imageDataUrl,
      bbox: measurement.bbox,
      predicted_width_mm: measurement.predictedWidthMm,
      predicted_height_mm: measurement.predictedHeightMm,
      confidence: measurement.confidence,
      calibration_scale: measurement.calibrationScale,
      throat_limit_mm: measurement.throatLimitMm,
      actual_width_mm: actualWidthMm,
      actual_height_mm: actualHeightMm,
      user_verified: userVerified,
      detection_model: measurement.detection.model_name,
      detection_confidence: measurement.detection.confidence,
      timestamp: measurement.timestamp,
    };

    setSaving(true);
    try {
      await saveCorrection(correction);

      try {
        await submitFeedback(feedbackRequest);
      } catch (backendErr) {
        console.warn("Backend feedback submission failed (local save succeeded):", backendErr);
      }

      onCorrectionSubmit(correction);
      setShowCorrection(false);
      setCorrectionWidth("");
      setCorrectionHeight("");
      setStats(await computeLocalStats());
      alert(userVerified
        ? "✓ Thank you! Bounding box and object measurement verified. Recorded to system training database."
        : "Correction saved. Mark as verified when you confirm the actual dimensions."
      );
    } catch (err) {
      console.error("Failed to save correction:", err);
      alert("Failed to save correction. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!measurement || !detection) {
    if (isAdjustingBox) {
      return (
        <div className="bg-[#091513] border-2 border-cyan-500 rounded-xl p-4 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-cyan-800/60">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs uppercase tracking-wider font-mono">
              <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Manual Object Sizing &amp; Calibration</span>
            </div>
            {setIsAdjustingBox && (
              <button
                type="button"
                onClick={() => setIsAdjustingBox(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-medium text-cyan-200">
              1. Drag/draw the rectangle over your object on the camera screen.
            </p>
            <p className="text-slate-400 text-[11px]">
              2. Enter the actual real-world length and breadth below to calibrate.
            </p>
          </div>

          {/* Actual Dimension Inputs (in Centimeters) & Distance */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Actual Length
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={actualWidthCmInput || "25.0"}
                  onChange={(e) => setActualWidthCmInput(e.target.value)}
                  placeholder="e.g. 25.0"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-700 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <span className="absolute right-2 top-1.5 text-[10px] font-mono text-cyan-500">cm</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Actual Breadth
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={actualHeightCmInput || "18.0"}
                  onChange={(e) => setActualHeightCmInput(e.target.value)}
                  placeholder="e.g. 18.0"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-700 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <span className="absolute right-2 top-1.5 text-[10px] font-mono text-cyan-500">cm</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Distance
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="5"
                  value={distanceCmInput}
                  onChange={(e) => setDistanceCmInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-700 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <span className="absolute right-2 top-1.5 text-[10px] font-mono text-cyan-500">cm</span>
              </div>
            </div>
          </div>

          {/* Live Calculated Area at Bottom */}
          <div className="p-2.5 bg-slate-900/90 border border-cyan-800/80 rounded-lg text-xs font-mono flex items-center justify-between text-cyan-200">
            <span>Calculated Surface Area:</span>
            <span className="text-cyan-400 font-bold">
              {((parseFloat(actualWidthCmInput || "25.0") || 0) * (parseFloat(actualHeightCmInput || "18.0") || 0)).toFixed(1)} cm²
            </span>
          </div>

          {recalibrationSuccess && (
            <div className="p-2.5 bg-emerald-950/70 border border-emerald-600 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{recalibrationSuccess}</span>
            </div>
          )}

          <button
            onClick={handleRecalibrateClick}
            disabled={recalibrating}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-50"
          >
            {recalibrating ? "Applying Calibration..." : "Calibrate System on This Rectangle & Save"}
          </button>
        </div>
      );
    }

    return (
      <div className="bg-[#091513] border border-slate-800 rounded-xl p-5 text-center space-y-4">
        <Target className="w-10 h-10 mx-auto text-slate-600" />
        <div>
          <h4 className="text-white font-semibold text-sm">Waiting for Object</h4>
          <p className="text-slate-400 text-xs mt-0.5">
            Hold rock or object inside camera target area
          </p>
        </div>

        {/* Feature requested: If camera is not able to detect it in a proper rectangle */}
        <div className="p-3 bg-cyan-950/40 border border-cyan-700/60 rounded-xl text-left space-y-2">
          <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 font-mono">
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Not detecting in a proper rectangle?</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Select the rectangle yourself on the camera view and enter its actual dimensions to calibrate the system.
          </p>
          <button
            type="button"
            onClick={() => setIsAdjustingBox && setIsAdjustingBox(true)}
            className="w-full py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow transition-all"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Select Rectangle Manually on Camera</span>
          </button>
        </div>

        {!isCalibrated && (
          <button
            onClick={onCalibrationClick}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 mx-auto transition-colors cursor-pointer"
          >
            <Ruler className="w-3.5 h-3.5" />
            Calibrate with Reference Card
          </button>
        )}
      </div>
    );
  }

  const severity = getSeverityLabel(measurement.predictedWidthMm, throatLimitMm, warningThresholdMm);
  const isOversize = measurement.predictedWidthMm >= throatLimitMm;
  const isWarning = measurement.predictedWidthMm >= warningThresholdMm && !isOversize;

  return (
    <div className="bg-[#091513] border border-emerald-800 rounded-xl p-4 space-y-4">
      {/* Calibration Status */}
      <div className={`flex items-center gap-3 p-3 rounded-lg ${isCalibrated ? "bg-emerald-950/30 border border-emerald-800" : "bg-amber-950/30 border border-amber-800"}`}>
        <div className={`w-2.5 h-2.5 rounded-full ${isCalibrated ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
        <div className="flex-1">
          <div className="text-xs font-medium text-white">
            {isCalibrated ? "Camera Calibrated" : "Using Fallback Scale"}
          </div>
          <div className="text-[10px] text-slate-400">
            {isCalibrated
              ? `Perspective-correct homography active`
              : `Scale multiplier: ${calibrationScale.toFixed(1)}x (approx.)`}
          </div>
        </div>
        {!isCalibrated && (
          <button
            onClick={onCalibrationClick}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded transition-colors"
          >
            Calibrate
          </button>
        )}
      </div>

      {/* Current Measurement */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold">Object Measurement</span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${isOversize ? "bg-rose-500/20 text-rose-400" : isWarning ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
              {severity.label}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Conf: {(measurement.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Primary Centimeter (cm) Readout */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-emerald-900/60 shadow-inner">
            <div className="text-xs font-mono uppercase text-slate-400">Length</div>
            <div className="text-2xl font-black font-mono text-emerald-300">
              {(Math.max(measurement.predictedWidthMm, measurement.predictedHeightMm) / 10).toFixed(1)} <span className="text-sm font-normal text-emerald-500">cm</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {Math.round(Math.max(measurement.predictedWidthMm, measurement.predictedHeightMm))} mm <span className="text-[10px] text-slate-600">± {Math.round((measurement.detection.bbox[2] || 0.1) * 640 * 0.1)}px</span>
            </div>
          </div>
          <div className="p-3 bg-slate-900/60 rounded-xl border border-emerald-900/60 shadow-inner">
            <div className="text-xs font-mono uppercase text-slate-400">Breadth</div>
            <div className="text-2xl font-black font-mono text-emerald-300">
              {(Math.min(measurement.predictedWidthMm, measurement.predictedHeightMm) / 10).toFixed(1)} <span className="text-sm font-normal text-emerald-500">cm</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {Math.round(Math.min(measurement.predictedWidthMm, measurement.predictedHeightMm))} mm <span className="text-[10px] text-slate-600">± {Math.round((measurement.detection.bbox[3] || 0.1) * 480 * 0.1)}px</span>
            </div>
          </div>
        </div>

        {/* Surface Area Display */}
        <div className="p-3 bg-slate-900/50 rounded-xl border border-teal-800/60 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono uppercase text-teal-400 font-semibold">Surface Area</div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">Length × Breadth projection</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold font-mono text-teal-300">
              {((measurement.predictedWidthMm * measurement.predictedHeightMm) / 100).toFixed(1)} <span className="text-xs font-normal text-teal-500">cm²</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {((measurement.predictedWidthMm * measurement.predictedHeightMm) / 1000000).toFixed(4)} m²
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-2.5 bg-slate-900/40 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400">Major Caliber (Length)</div>
            <div className="text-lg font-bold font-mono text-white">
              {(Math.max(measurement.predictedWidthMm, measurement.predictedHeightMm) / 10).toFixed(1)} cm
              <span className="text-[10px] text-slate-500 block font-normal font-sans">
                ({Math.round(Math.max(measurement.predictedWidthMm, measurement.predictedHeightMm))} mm)
              </span>
            </div>
          </div>
          <div className="p-2.5 bg-slate-900/40 rounded-lg border border-slate-800">
            <div className="text-[11px] text-slate-400">Minor Caliber (Breadth)</div>
            <div className="text-lg font-bold font-mono text-white">
              {(Math.min(measurement.predictedWidthMm, measurement.predictedHeightMm) / 10).toFixed(1)} cm
              <span className="text-[10px] text-slate-500 block font-normal font-sans">
                ({Math.round(Math.min(measurement.predictedWidthMm, measurement.predictedHeightMm))} mm)
              </span>
            </div>
          </div>
        </div>

        {/* Detection Metadata */}
        <div className="p-2 bg-slate-900/30 rounded border border-slate-800 text-[10px] text-slate-400 grid grid-cols-2 gap-2">
          <div>Detector: <span className="text-slate-300 font-mono">{detection.model_name.includes("YOLO") ? "YOLOv8 Segmentation" : "Salient Full Object"}</span></div>
          <div>Target: <span className="text-slate-300">Object #{detection.rock_index}</span></div>
          <div>Aspect Ratio: <span className="text-slate-300 font-mono">{detection.aspect_ratio.toFixed(2)}:1</span></div>
          <div>Est. Mass: <span className="text-slate-300 font-mono">~{Math.round(detection.estimated_mass_kg)} kg</span></div>
        </div>
      </div>

      {/* Verification: User feedback on measurement and bounding box correctness */}
      <div className="p-4 bg-[#0a1f1b] border-2 border-emerald-500 rounded-xl space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider font-mono">
            <Target className="w-4 h-4 text-emerald-400" />
            <span>System Measurement Verification</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300">
            Distance: {objectDistanceCm} cm
          </span>
        </div>

        <div className="text-xs text-slate-200">
          According to the system, the measurement is:
          <div className="mt-1 text-base font-bold text-white font-mono bg-black/50 px-3 py-2.5 rounded-lg border border-emerald-900 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span>Length: <strong className="text-emerald-400">{(Math.max(measurement.predictedWidthMm, measurement.predictedHeightMm) / 10).toFixed(1)} cm</strong></span>
              <span className="text-slate-500">×</span>
              <span>Breadth: <strong className="text-emerald-400">{(Math.min(measurement.predictedWidthMm, measurement.predictedHeightMm) / 10).toFixed(1)} cm</strong></span>
            </div>
            <div className="pt-1.5 border-t border-emerald-950 flex items-center justify-between text-xs text-teal-300">
              <span>Surface Area:</span>
              <strong className="text-teal-400 font-bold">{((measurement.predictedWidthMm * measurement.predictedHeightMm) / 100).toFixed(1)} cm²</strong>
            </div>
          </div>
        </div>

        {!userConfirmed ? (
          <>
            <p className="text-xs text-slate-300 font-medium">
              Is this measurement correct for the object?
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await handleSubmitCorrection(true, true);
                  setUserConfirmed(true);
                }}
                disabled={saving}
                className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                Yes, It&apos;s Correct
              </button>
              <button
                onClick={() => {
                  if (setIsAdjustingBox) setIsAdjustingBox(true);
                }}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow"
              >
                <Edit3 className="w-4 h-4 text-amber-400" />
                No, It&apos;s Wrong (Adjust)
              </button>
            </div>
          </>
        ) : (
          <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded-lg text-xs text-emerald-200 space-y-2.5 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-white">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Measurement Verified &amp; Calibrated!</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Next time another object is kept there, the system will detect it and ask you to confirm again.
            </p>
            {onMeasureNextObject && (
              <button
                onClick={() => {
                  setUserConfirmed(false);
                  onMeasureNextObject();
                }}
                className="w-full py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Measure Next Object &rarr;</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Interactive Box Adjustment & Continuous Recalibration Section */}
      {isAdjustingBox && (
        <div className="p-4 bg-[#071a1f] border-2 border-cyan-500 rounded-xl space-y-3.5 shadow-xl animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-cyan-800/60">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs uppercase tracking-wider font-mono">
              <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Continuous Recalibration</span>
            </div>
            <span className="px-2 py-0.5 bg-cyan-900/60 border border-cyan-700 rounded text-[10px] font-mono text-cyan-300">
              Iter #{recalibrationCount + 1}
            </span>
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-medium text-cyan-200">
              1. Drag/adjust the rectangle over the object on the camera screen.
            </p>
            <p className="text-slate-400 text-[11px]">
              2. Enter the actual real-world size and camera distance below.
            </p>
          </div>

          {/* Actual Dimension Inputs (in Centimeters) & Distance */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Actual Length
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={actualWidthCmInput}
                  onChange={(e) => setActualWidthCmInput(e.target.value)}
                  placeholder="e.g. 25.0"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-700 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <span className="absolute right-2 top-1.5 text-[10px] font-mono text-cyan-500">cm</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Actual Breadth
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={actualHeightCmInput}
                  onChange={(e) => setActualHeightCmInput(e.target.value)}
                  placeholder="e.g. 18.0"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-700 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <span className="absolute right-2 top-1.5 text-[10px] font-mono text-cyan-500">cm</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 block mb-1">
                Distance
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="5"
                  value={distanceCmInput}
                  onChange={(e) => setDistanceCmInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-700 rounded-lg text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                />
                <span className="absolute right-2 top-1.5 text-[10px] font-mono text-cyan-500">cm</span>
              </div>
            </div>
          </div>

          {/* Live Calculated Area at Bottom */}
          <div className="p-2.5 bg-slate-900/90 border border-cyan-800/80 rounded-lg text-xs font-mono flex items-center justify-between text-cyan-200">
            <span>Calculated Block Surface Area:</span>
            <span className="text-cyan-400 font-bold">
              {((parseFloat(actualWidthCmInput) || 0) * (parseFloat(actualHeightCmInput) || 0)).toFixed(1)} cm²
            </span>
          </div>

          {/* Custom Drawn Box Coordinates Info */}
          {customBox && (
            <div className="p-2 bg-slate-900/80 border border-cyan-800/60 rounded-lg text-[10px] font-mono text-cyan-300 flex justify-between items-center">
              <span>Selected ROI:</span>
              <span>
                X:{(customBox[0] * 100).toFixed(0)}% Y:{(customBox[1] * 100).toFixed(0)}% | W:{(customBox[2] * 100).toFixed(0)}% H:{(customBox[3] * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Recalibration Status Message */}
          {recalibrationSuccess && (
            <div className="p-2.5 bg-emerald-950/70 border border-emerald-600 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{recalibrationSuccess}</span>
            </div>
          )}

          {/* Action Button: Recalibrate */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleRecalibrateClick}
              disabled={recalibrating || !actualWidthCmInput || !actualHeightCmInput}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-50"
            >
              {recalibrating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Computing Homography &amp; Recalibrating...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>Calibrate System on This Object</span>
                </>
              )}
            </button>

            {setIsAdjustingBox && (
              <button
                onClick={() => setIsAdjustingBox(false)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                &check; Done Adjustment &amp; Resume Stream
              </button>
            )}

            {onMeasureNextObject && (
              <button
                onClick={() => {
                  if (setIsAdjustingBox) setIsAdjustingBox(false);
                  setUserConfirmed(false);
                  onMeasureNextObject();
                }}
                className="w-full py-2 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Ready for Next Object &rarr;</span>
              </button>
            )}
          </div>

          <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1">
            <span>Active Scale:</span>
            <span className="text-cyan-400 font-bold">{((calibMmPerPx || 0.8) / 10).toFixed(4)} cm/pixel</span>
          </div>
        </div>
      )}

      {/* Traditional Correction / Fine-tune modal trigger */}
      <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-xs text-slate-400">
        <span>Manual override log:</span>
        <button
          onClick={() => setShowCorrection(true)}
          className="text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
        >
          Submit numeric correction
        </button>
      </div>

      {/* Correction Modal */}
      {showCorrection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#091513] border border-emerald-700 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-semibold">Enter Actual Dimensions</h4>
              <button onClick={() => setShowCorrection(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Actual Length</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={correctionWidth}
                      onChange={(e) => setCorrectionWidth(e.target.value)}
                      placeholder="e.g., 25"
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-400 focus:outline-none"
                    />
                    <select
                      value={correctionUnit}
                      onChange={(e) => setCorrectionUnit(e.target.value as "mm" | "cm" | "m")}
                      className="px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-emerald-400 focus:outline-none"
                    >
                      <option value="cm">cm</option>
                      <option value="mm">mm</option>
                      <option value="m">m</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Actual Breadth</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={correctionHeight}
                    onChange={(e) => setCorrectionHeight(e.target.value)}
                    placeholder="e.g., 18"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              {correctionWidth && correctionHeight && (
                <div className="p-2.5 bg-slate-900 border border-teal-800 rounded-lg text-xs font-mono flex items-center justify-between text-teal-300">
                  <span>Calculated Area:</span>
                  <span className="font-bold">
                    {((parseFloat(correctionWidth) || 0) * (parseFloat(correctionHeight) || 0)).toFixed(1)} {correctionUnit}²
                  </span>
                </div>
              )}

              <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-xs text-slate-400">
                <div className="flex items-center gap-1 mb-1">
                  <Info className="w-3 h-3" />
                  Predicted: {formatMeasurement(measurement.predictedWidthMm)} × {formatMeasurement(measurement.predictedHeightMm)}
                </div>
                {correctionWidth && correctionHeight && (
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Error will be calculated after submit
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleSubmitCorrection(false)}
                  disabled={saving || !correctionWidth || !correctionHeight}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save as Unverified"}
                </button>
                <button
                  onClick={() => handleSubmitCorrection(true)}
                  disabled={saving || !correctionWidth || !correctionHeight}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save as Verified"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Panel */}
      <div className="border-t border-slate-800 pt-3">
        <button
          onClick={() => setShowStats(!showStats)}
          className="w-full flex items-center justify-between text-sm text-slate-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Training Data & Accuracy
          </span>
          <span className={showStats ? "text-emerald-400" : "text-slate-500"}>
            {showStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {showStats && stats && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
              <div>
                <div className="text-xs text-slate-400">Total Corrections</div>
                <div className="text-white font-bold">{stats.totalMeasurements}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Verified</div>
                <div className="text-emerald-400 font-bold">{stats.verifiedMeasurements}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Mean Abs Error</div>
                <div className="text-white font-bold font-mono">{stats.meanAbsoluteErrorMm.toFixed(1)} mm</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">MAPE</div>
                <div className="text-white font-bold font-mono">{stats.meanAbsolutePercentError.toFixed(1)}%</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setExporting(true);
                  try {
                    const data = await exportTrainingData("json", true);
                    const json = JSON.stringify(data, null, 2);
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `oresentinel-training-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error("Export failed:", err);
                    alert("Export failed");
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
                className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
              <button
                onClick={async () => {
                  setExporting(true);
                  try {
                    const data = await exportTrainingData("yolo", true);
                    // Create zip or download individual files
                    alert(`YOLO Export: ${data.images?.length || 0} images + ${data.labels?.length || 0} labels\n(Implement zip download for production)`);
                    console.log("YOLO Export Data:", data);
                  } catch (err) {
                    console.error("YOLO export failed:", err);
                    alert("YOLO export failed");
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting || stats.verifiedMeasurements === 0}
                className="flex-1 px-3 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Export YOLO
              </button>
            </div>

            <button
              onClick={onClearClick}
              className="w-full px-3 py-2 bg-rose-900/50 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear All Local Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeasurementPanel;