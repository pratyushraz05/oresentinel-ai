import React, { useState, useRef, useCallback } from "react";
import { Camera, X, Check, RotateCcw, HelpCircle, ArrowRight, ArrowLeft } from "lucide-react";
import type { CameraCalibrationData } from "../types";
import { REFERENCE_OBJECTS } from "../utils/measurementEngine";
import { computeCalibration } from "../api";

interface CalibrationWizardProps {
  cameraId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isCameraActive: boolean;
  onCalibrationComplete: (calibration: CameraCalibrationData) => void;
  onClose: () => void;
}

type CalibrationStep = "select" | "position" | "capture" | "corners" | "compute" | "done";

type ReferenceObject = typeof REFERENCE_OBJECTS[number];

export const CalibrationWizard: React.FC<CalibrationWizardProps> = ({
  cameraId,
  videoRef,
  canvasRef,
  isCameraActive,
  onCalibrationComplete,
  onClose,
}) => {
  const [step, setStep] = useState<CalibrationStep>("select");
  const [selectedObject, setSelectedObject] = useState<ReferenceObject | null>(null);
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [corners, setCorners] = useState<[number, number][]>([]);
  const [calibration, setCalibration] = useState<CameraCalibrationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cornerOrder = ["Top-Left", "Top-Right", "Bottom-Right", "Bottom-Left"];
  const canvasScaleRef = useRef({ x: 1, y: 1 });
  // Separate canvas ref for corner selection to avoid conflict with MeasurementWebcamFeed
  const cornerCanvasRef = useRef<HTMLCanvasElement>(null);

  const refWidth = selectedObject?.widthMm || parseFloat(customWidth) || 0;
  const refHeight = selectedObject?.heightMm || parseFloat(customHeight) || 0;
  const isCustom = selectedObject?.name === "Custom";
  const canProceed = isCustom ? (refWidth > 0 && refHeight > 0) : !!selectedObject;
  const cornersComplete = corners.length === 4;

  // Draw captured image to corner canvas when step changes to "corners"
  React.useEffect(() => {
    if (step === "corners" && capturedImage && cornerCanvasRef.current) {
      const cornerCtx = cornerCanvasRef.current.getContext("2d");
      if (cornerCtx) {
        const img = new Image();
        img.src = capturedImage;
        img.onload = () => {
          cornerCanvasRef.current!.width = img.width;
          cornerCanvasRef.current!.height = img.height;
          cornerCtx.drawImage(img, 0, 0);
        };
      }
    }
  }, [step, capturedImage]);

  // Capture reference image (uses shared canvasRef)
  const captureReference = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2) {
      setError("Camera not ready");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Calculate scale for corner mapping
    const rect = canvas.getBoundingClientRect();
    canvasScaleRef.current = {
      x: canvas.width / rect.width,
      y: canvas.height / rect.height,
    };

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
    setCorners([]);
    setStep("corners");
  }, [videoRef, canvasRef]);

  // Handle corner clicks (uses dedicated cornerCanvasRef)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (step !== "corners" || cornersComplete) return;

      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();

      const x = (e.clientX - rect.left) * canvasScaleRef.current.x;
      const y = (e.clientY - rect.top) * canvasScaleRef.current.y;

      setCorners((prev) => [...prev, [x, y]]);
    },
    [step, cornersComplete]
  );

  // Reset corners
  const resetCorners = () => setCorners([]);

  // Compute calibration
  const handleCompute = async () => {
    if (!capturedImage || corners.length !== 4 || refWidth <= 0 || refHeight <= 0) return;

    setLoading(true);
    setError(null);

    try {
      // Convert capturedImage (data URL) to Blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();

      const apiResponse = await computeCalibration(
        blob,
        cameraId,
        refWidth,
        refHeight,
        corners
      );

      if (apiResponse.success && apiResponse.calibration) {
        setCalibration(apiResponse.calibration);
        setStep("done");
      } else {
        setError(apiResponse.message || "Calibration computation failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to compute calibration");
    } finally {
      setLoading(false);
    }
  };

  // Complete calibration
  const handleComplete = () => {
    if (calibration) {
      onCalibrationComplete(calibration);
    }
  };

  // Navigation
  const goBack = () => {
    switch (step) {
      case "position":
        setStep("select");
        break;
      case "capture":
        setStep("position");
        break;
      case "corners":
        setStep("capture");
        setCapturedImage(null);
        break;
      case "compute":
        setStep("corners");
        setCorners([]);
        break;
      default:
        break;
    }
  };

  const goNext = () => {
    switch (step) {
      case "select":
        setStep("position");
        break;
      case "position":
        setStep("capture");
        break;
      default:
        break;
    }
  };

  // Render step indicator
  const steps: CalibrationStep[] = ["select", "position", "capture", "corners", "compute", "done"];
  const stepLabels = ["Select", "Position", "Capture", "Corners", "Compute", "Done"];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#091513] border border-emerald-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-emerald-800">
          <div className="flex items-center gap-3">
            <Camera className="w-6 h-6 text-emerald-400" />
            <h3 className="text-xl font-bold text-white">Camera Calibration Wizard</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-4 py-3 border-b border-emerald-800">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      i < currentStepIndex
                        ? "bg-emerald-500 text-black"
                        : i === currentStepIndex
                        ? "bg-emerald-500 text-black ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#091513]"
                        : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {i < currentStepIndex ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`w-16 h-1 mx-1 ${i < currentStepIndex ? "bg-emerald-500" : "bg-slate-700"}`}
                    />
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-2 text-center text-xs text-slate-400">
            Step {currentStepIndex + 1} of {steps.length}: {stepLabels[currentStepIndex]}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-300 text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Select Reference Object */}
          {step === "select" && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-slate-300">Choose a reference object with known dimensions</p>
                <p className="text-xs text-slate-500 mt-1">Place it flat, facing the camera</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {REFERENCE_OBJECTS.map((obj) => (
                  <button
                    key={obj.name}
                    onClick={() => {
                      setSelectedObject(obj);
                      setCustomWidth("");
                      setCustomHeight("");
                    }}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedObject?.name === obj.name
                        ? "border-emerald-400 bg-emerald-950/30"
                        : "border-slate-700 hover:border-emerald-700"
                    }`}
                  >
                    <div className="font-medium text-white">{obj.name}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {obj.widthMm > 0
                        ? `${obj.widthMm} × ${obj.heightMm} mm`
                        : "Custom dimensions"}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">{obj.description}</div>
                  </button>
                ))}
              </div>

              {isCustom && (
                <div className="grid grid-cols-2 gap-3 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Width (mm)</label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      placeholder="e.g., 85.6"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Height (mm)</label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      placeholder="e.g., 53.98"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Position Object */}
          {step === "position" && (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-emerald-950/30 border border-emerald-800 rounded-xl">
                <div className="w-16 h-16 mx-auto mb-3 bg-emerald-900/50 rounded-full flex items-center justify-center">
                  <Camera className="w-8 h-8 text-emerald-400" />
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">Position Reference Object</h4>
                <p className="text-slate-300">
                  Place the <span className="text-emerald-400 font-mono">
                    {selectedObject?.name || "reference object"}
                  </span> in the camera view
                </p>
              </div>

              <ul className="text-left text-sm text-slate-400 space-y-2 max-w-md mx-auto">
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> Object flat and facing camera</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> Good lighting, no glare</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> Entire object visible in frame</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">✓</span> Minimal background clutter</li>
              </ul>
            </div>
          )}

          {/* Step 3: Capture */}
          {step === "capture" && (
            <div className="space-y-4">
              <p className="text-center text-slate-300">Capture a clear photo of the reference object</p>

              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-700">
                {isCameraActive && videoRef.current && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <p>Camera not active</p>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <button
                  onClick={captureReference}
                  disabled={!isCameraActive || loading}
                  className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
                >
                  <Camera className="w-5 h-5" />
                  Capture Reference Photo
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Mark Corners */}
          {step === "corners" && capturedImage && (
            <div className="space-y-4">
              <p className="text-center text-slate-300">
                Click the 4 corners in order: <span className="text-emerald-400 font-mono">Top-Left → Top-Right → Bottom-Right → Bottom-Left</span>
              </p>

              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-700">
                <canvas
                  ref={cornerCanvasRef}
                  className="w-full h-full"
                  onClick={handleCanvasClick}
                  data-corner-canvas="true"
                />
                {corners.map((corner, i) => (
                  <div
                    key={i}
                    className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      left: `${(corner[0] / (cornerCanvasRef.current?.width || 1)) * 100}%`,
                      top: `${(corner[1] / (cornerCanvasRef.current?.height || 1)) * 100}%`,
                    }}
                  >
                    <div className="w-full h-full bg-emerald-500 rounded-full flex items-center justify-center text-black font-bold text-xs shadow-lg">
                      {i + 1}
                    </div>
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-emerald-400 font-mono">
                      {cornerOrder[i]}
                    </div>
                  </div>
                ))}
                {corners.length > 1 && (
                  <>
                    {corners.slice(0, -1).map((corner, i) => (
                      <svg key={`line-${i}`} className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
                        <line
                          x1={`${(corner[0] / (cornerCanvasRef.current?.width || 1)) * 100}%`}
                          y1={`${(corner[1] / (cornerCanvasRef.current?.height || 1)) * 100}%`}
                          x2={`${(corners[i + 1][0] / (cornerCanvasRef.current?.width || 1)) * 100}%`}
                          y2={`${(corners[i + 1][1] / (cornerCanvasRef.current?.height || 1)) * 100}%`}
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeDasharray="6,4"
                        />
                      </svg>
                    ))}
                    {corners.length === 4 && (
                      <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
                        <line
                          x1={`${(corners[3][0] / (cornerCanvasRef.current?.width || 1)) * 100}%`}
                          y1={`${(corners[3][1] / (cornerCanvasRef.current?.height || 1)) * 100}%`}
                          x2={`${(corners[0][0] / (cornerCanvasRef.current?.width || 1)) * 100}%`}
                          y2={`${(corners[0][1] / (cornerCanvasRef.current?.height || 1)) * 100}%`}
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeDasharray="6,4"
                        />
                      </svg>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={resetCorners}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset Corners
                </button>
                <button
                  onClick={handleCompute}
                  disabled={!cornersComplete || loading}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Computing...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Compute Calibration
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Compute / Results */}
          {step === "compute" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto flex items-center justify-center">
                <svg className="animate-spin w-16 h-16 text-emerald-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-white">Computing homography and scale...</p>
              <p className="text-xs text-slate-400">This takes a moment</p>
            </div>
          )}

          {/* Step 6: Done */}
          {step === "done" && calibration && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto bg-emerald-950/50 border border-emerald-600 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h4 className="text-lg font-semibold text-white">Calibration Complete!</h4>
              <p className="text-slate-300">Camera <code className="bg-slate-800 px-1 rounded">{cameraId}</code> is now calibrated</p>

              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-900/50 rounded-xl border border-slate-700 text-left">
                <div>
                  <div className="text-xs text-slate-400">Scale (avg)</div>
                  <div className="text-emerald-400 font-mono font-bold">{calibration.mmPerPixelAvg.toFixed(4)} mm/px</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Scale X / Y</div>
                  <div className="text-teal-400 font-mono font-bold">{calibration.mmPerPixelX.toFixed(4)} / {calibration.mmPerPixelY.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Reference</div>
                  <div className="text-white font-mono">{refWidth} × {refHeight} mm</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Image Size</div>
                  <div className="text-white font-mono">{calibration.imageWidth} × {calibration.imageHeight}</div>
                </div>
              </div>

              <button
                onClick={handleComplete}
                className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-lg text-lg transition-all"
              >
                Apply Calibration & Continue
              </button>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="px-4 py-3 border-t border-emerald-800 flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={step === "select" || loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            onClick={goNext}
            disabled={step !== "select" && step !== "position" || !canProceed || loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationWizard;