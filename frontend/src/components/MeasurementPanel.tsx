import React, { useState } from "react";
import {
  CheckCircle2, XCircle, Save, Download, Trash2,
  Info, AlertTriangle, Ruler, Target,
  ChevronDown, ChevronUp
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
}) => {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionWidth, setCorrectionWidth] = useState("");
  const [correctionHeight, setCorrectionHeight] = useState("");
  const [correctionUnit, setCorrectionUnit] = useState<"mm" | "cm" | "m">("mm");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<MeasurementStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load stats on mount
  React.useEffect(() => {
    computeLocalStats().then(setStats);
  }, []);

  // Handle correction submit
  const handleSubmitCorrection = async (userVerified: boolean) => {
    if (!measurement || !detection) return;

    const width = parseFloat(correctionWidth);
    const height = parseFloat(correctionHeight);

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      alert("Please enter valid dimensions");
      return;
    }

    // Convert to mm
    let actualWidthMm = width;
    let actualHeightMm = height;
    if (correctionUnit === "cm") {
      actualWidthMm = width * 10;
      actualHeightMm = height * 10;
    } else if (correctionUnit === "m") {
      actualWidthMm = width * 1000;
      actualHeightMm = height * 1000;
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
      // Save locally first
      await saveCorrection(correction);

      // Also submit to backend for training data collection
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
        ? "Thank you! Your verified correction has been saved and will improve future measurements."
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
    return (
      <div className="bg-[#091513] border border-slate-800 rounded-xl p-6 text-center">
        <Target className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h4 className="text-white font-semibold mb-2">No Measurement Yet</h4>
        <p className="text-slate-400 text-sm">
          Point camera at an object to see real-time measurements
        </p>
        {!isCalibrated && (
          <button
            onClick={onCalibrationClick}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm flex items-center gap-2 mx-auto transition-colors"
          >
            <Ruler className="w-4 h-4" />
            Calibrate Camera
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
            <span className="text-white font-semibold">Live Measurement</span>
            <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${isOversize ? "bg-rose-500/20 text-rose-400" : isWarning ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
              {severity.label}
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Conf: {(measurement.confidence * 100).toFixed(0)}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
            <div className="text-xs text-slate-400">Width</div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatMeasurement(measurement.predictedWidthMm)}
            </div>
            <div className="text-[10px] text-slate-500">± {measurement.detection.bbox[2] * 640 * 0.1} px</div>
          </div>
          <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
            <div className="text-xs text-slate-400">Height</div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatMeasurement(measurement.predictedHeightMm)}
            </div>
            <div className="text-[10px] text-slate-500">± {measurement.detection.bbox[3] * 480 * 0.1} px</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-2 bg-slate-900/30 rounded border border-slate-800">
            <div className="text-xs text-slate-400">Major Axis</div>
            <div className="text-lg font-bold font-mono text-white">
              {formatMeasurement(Math.max(measurement.predictedWidthMm, measurement.predictedHeightMm))}
            </div>
          </div>
          <div className="p-2 bg-slate-900/30 rounded border border-slate-800">
            <div className="text-xs text-slate-400">Minor Axis</div>
            <div className="text-lg font-bold font-mono text-white">
              {formatMeasurement(Math.min(measurement.predictedWidthMm, measurement.predictedHeightMm))}
            </div>
          </div>
        </div>

        {/* Detection Info */}
        <div className="p-2 bg-slate-900/30 rounded border border-slate-800 text-[10px] text-slate-400 grid grid-cols-2 gap-2">
          <div>Model: <span className="text-slate-300 font-mono">{detection.model_name}</span></div>
          <div>Class: <span className="text-slate-300">Rock #{detection.rock_index}</span></div>
          <div>Aspect: <span className="text-slate-300 font-mono">{detection.aspect_ratio.toFixed(2)}</span></div>
          <div>Mass: <span className="text-slate-300 font-mono">~{Math.round(detection.estimated_mass_kg)} kg</span></div>
        </div>
      </div>

      {/* Feedback Buttons */}
      <div className="pt-2 border-t border-slate-800">
        <p className="text-xs text-slate-400 text-center mb-2">Is this measurement correct?</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleSubmitCorrection(true)}
            disabled={saving}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Yes, Correct
          </button>
          <button
            onClick={() => setShowCorrection(true)}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            No, Fix It
          </button>
        </div>
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
                  <label className="text-xs text-slate-400 block mb-1">Actual Width</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={correctionWidth}
                      onChange={(e) => setCorrectionWidth(e.target.value)}
                      placeholder="e.g., 245"
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-400 focus:outline-none"
                    />
                    <select
                      value={correctionUnit}
                      onChange={(e) => setCorrectionUnit(e.target.value as "mm" | "cm" | "m")}
                      className="px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-emerald-400 focus:outline-none"
                    >
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                      <option value="m">m</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Actual Height</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={correctionHeight}
                    onChange={(e) => setCorrectionHeight(e.target.value)}
                    placeholder="e.g., 190"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

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