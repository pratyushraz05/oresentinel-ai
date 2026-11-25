import React, { useState, useRef, useEffect, useCallback } from "react";
import { Zap, Target, Settings, AlertTriangle, CheckCircle2, Camera, Upload, Layers, RefreshCw } from "lucide-react";
import { MeasurementWebcamFeed } from "../components/MeasurementWebcamFeed";
import { CalibrationWizard } from "../components/CalibrationWizard";
import { MeasurementPanel } from "../components/MeasurementPanel";
import { fetchCalibration, sendRealtimeFrame, directRecalibrate } from "../api";
import { createMeasurement, type MeasurementConfig } from "../utils/measurementEngine";
import { clearAllData } from "../utils/feedbackSystem";
import type { RealtimeFrameResponse, RealtimeDetectionBox, CameraCalibrationData, Measurement } from "../types";

const SAMPLE_SPECIMENS = [
  {
    id: "specimen_critical_boulder",
    title: "Critical 1120mm Boulder",
    url: "/media/fixtures/specimen_critical_boulder.jpg",
    expectedMajorMm: 1120,
    expectedMinorMm: 710,
    description: "Exceeds 800mm throat limit by 40%",
  },
  {
    id: "specimen_elongated_slab",
    title: "Elongated 940mm Bridging Slab",
    url: "/media/fixtures/specimen_elongated_slab.jpg",
    expectedMajorMm: 940,
    expectedMinorMm: 390,
    description: "2.4:1 aspect ratio bridging hazard",
  },
  {
    id: "specimen_normal_feed",
    title: "Uniform 420mm Feed",
    url: "/media/fixtures/specimen_normal_feed.jpg",
    expectedMajorMm: 420,
    expectedMinorMm: 290,
    description: "Safe fragmented ore pass",
  },
  {
    id: "specimen_cluster_jam",
    title: "Cluster Near-Limit Jam",
    url: "/media/fixtures/specimen_cluster_jam.jpg",
    expectedMajorMm: 780,
    expectedMinorMm: 520,
    description: "Dual rocks approaching hopper together",
  },
];

interface MeasurementViewProps {
  onCalibrationUpdated?: () => void;
}

export const MeasurementView: React.FC<MeasurementViewProps> = ({ onCalibrationUpdated }) => {
  // Mode selection: live webcam vs sample specimen/upload
  const [activeMode, setActiveMode] = useState<"webcam" | "specimen">("webcam");

  // Refs for video and canvas (shared with calibration wizard)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const specimenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [objectDistanceCm, setObjectDistanceCm] = useState<number>(50.0);
  const [hasConfirmedDistance, setHasConfirmedDistance] = useState<boolean>(false);

  // Calibration state
  const [calibration, setCalibration] = useState<CameraCalibrationData | null>(null);
  const [showCalibrationWizard, setShowCalibrationWizard] = useState(false);
  const cameraId = "CAM-WEBCAM-MEASURE";

  // Measurement state
  const [currentMeasurement, setCurrentMeasurement] = useState<Measurement | null>(null);
  const [currentDetection, setCurrentDetection] = useState<RealtimeDetectionBox | null>(null);

  // Manual box adjustment & continuous recalibration state
  const [isAdjustingBox, setIsAdjustingBox] = useState(false);
  const [customBox, setCustomBox] = useState<[number, number, number, number] | null>(null);
  const [recalibrationCount, setRecalibrationCount] = useState(0);

  // Live feed props
  const [calibrationScale, setCalibrationScale] = useState(1.2);
  const [throatLimitMm, setThroatLimitMm] = useState(800);
  const [warningThresholdMm] = useState(640); // 80% of throat limit
  const [isProcessingLoop, setIsProcessingLoop] = useState(false);

  // Specimen drawing state
  const [isSpecimenDrawing, setIsSpecimenDrawing] = useState(false);
  const [specimenStartPt, setSpecimenStartPt] = useState<{ x: number; y: number } | null>(null);

  const getSpecimenNormalizedPoint = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleSpecimenMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdjustingBox) return;
    const pt = getSpecimenNormalizedPoint(e);
    setIsSpecimenDrawing(true);
    setSpecimenStartPt(pt);
    setCustomBox([pt.x, pt.y, 0.01, 0.01]);
  };

  const handleSpecimenMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdjustingBox || !isSpecimenDrawing || !specimenStartPt) return;
    const pt = getSpecimenNormalizedPoint(e);
    const minX = Math.min(specimenStartPt.x, pt.x);
    const minY = Math.min(specimenStartPt.y, pt.y);
    const w = Math.max(0.01, Math.abs(pt.x - specimenStartPt.x));
    const h = Math.max(0.01, Math.abs(pt.y - specimenStartPt.y));
    setCustomBox([minX, minY, w, h]);
  };

  const handleSpecimenMouseUp = () => {
    setIsSpecimenDrawing(false);
    setSpecimenStartPt(null);
  };

  // Specimen mode state
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<string>("specimen_critical_boulder");
  const [isSpecimenProcessing, setIsSpecimenProcessing] = useState(false);

  // Load calibration on mount
  useEffect(() => {
    const loadCalibration = async () => {
      try {
        const cal = await fetchCalibration(cameraId);
        if (cal) {
          setCalibration(cal);
        }
      } catch (err) {
        console.warn("Could not load calibration:", err);
      }
    };
    loadCalibration();
  }, []);

  // Handle calibration complete
  const handleCalibrationComplete = useCallback((newCalibration: CameraCalibrationData) => {
    setCalibration(newCalibration);
    setShowCalibrationWizard(false);
    onCalibrationUpdated?.();
  }, [onCalibrationUpdated]);

  // Handle direct continuous recalibration from user-drawn box and cm dimensions
  const handleDirectRecalibrate = useCallback(async (actualWidthCm: number, actualHeightCm: number, distanceCm?: number) => {
    const box = customBox || (currentDetection ? currentDetection.bbox : [0.25, 0.25, 0.5, 0.5]);
    const imgW = videoRef.current?.videoWidth || 1280;
    const imgH = videoRef.current?.videoHeight || 720;
    const distCm = distanceCm || objectDistanceCm || 50.0;

    const updatedCalib = await directRecalibrate({
      camera_id: cameraId,
      box: box as [number, number, number, number],
      actual_width_cm: actualWidthCm,
      actual_height_cm: actualHeightCm,
      distance_cm: distCm,
      image_width: imgW,
      image_height: imgH,
      notes: `User iteration #${recalibrationCount + 1}: ${actualWidthCm}x${actualHeightCm}cm at ${distCm}cm`,
    });

    setCalibration(updatedCalib);
    setRecalibrationCount((prev) => prev + 1);
    onCalibrationUpdated?.();
    return updatedCalib;
  }, [customBox, currentDetection, cameraId, objectDistanceCm, recalibrationCount, onCalibrationUpdated]);

  const handleMeasureNextObject = useCallback(() => {
    setCurrentDetection(null);
    setCurrentMeasurement(null);
    setCustomBox(null);
    setIsAdjustingBox(false);
  }, []);

  // Handle correction submit
  const handleCorrectionSubmit = useCallback(() => {
    // Handled internally by MeasurementPanel
  }, []);

  // Handle frame response
  const handleFrameResponse = useCallback((response: RealtimeFrameResponse, fallbackImgUrl?: string) => {
    if (response.detections && response.detections.length > 0) {
      // Use the largest detection (by major_axis_mm)
      const detection = response.detections.reduce((max, d) =>
        d.major_axis_mm > max.major_axis_mm ? d : max
      );

      setCurrentDetection(detection);

      // Create measurement
      const config: MeasurementConfig = {
        calibrationScale,
        throatLimitMm,
        cameraId,
        calibration: calibration || undefined,
        imageWidth: 1280,
        imageHeight: 720,
      };

      if (videoRef.current && videoRef.current.videoWidth > 0) {
        config.imageWidth = videoRef.current.videoWidth;
        config.imageHeight = videoRef.current.videoHeight;
      }

      const imgDataUrl = fallbackImgUrl || "";
      const measurement = createMeasurement(detection, config, imgDataUrl);
      setCurrentMeasurement(measurement);
    } else {
      setCurrentDetection(null);
      setCurrentMeasurement(null);
    }
  }, [calibrationScale, throatLimitMm, calibration]);

  // Process specimen or uploaded image
  const processSpecimenImage = useCallback(async (imageSrc: string) => {
    setIsSpecimenProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageSrc;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load specimen image"));
      });

      const canvas = specimenCanvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Convert to blob for backend inference
      canvas.toBlob(async (blob) => {
        if (!blob) return;

        try {
          const resp = await sendRealtimeFrame(blob, {
            calibrationScale,
            throatLimitMm,
            autoCreateIncident: false,
            sourceId: "CAM-WEBCAM-MEASURE",
          });

          // Draw detection bounding box and caliber tag on specimen canvas
          if (resp.detections && resp.detections.length > 0) {
            resp.detections.forEach((d) => {
              const [bx, by, bw, bh] = d.bbox;
              const x = bx * canvas.width;
              const y = by * canvas.height;
              const w = bw * canvas.width;
              const h = bh * canvas.height;

              const isOver = d.major_axis_mm >= throatLimitMm || d.is_oversize;
              const isWarn = d.major_axis_mm >= throatLimitMm * 0.8 || d.is_warning;
              const color = isOver ? "#ef4444" : isWarn ? "#f59e0b" : "#10b981";

              ctx.strokeStyle = color;
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, w, h);

              // Tag
              const tagText = `ROCK #${d.rock_index}: ${Math.round(d.major_axis_mm)}mm (${isOver ? 'OVERSIZE' : isWarn ? 'NEAR LIMIT' : 'OK'})`;
              ctx.font = "bold 16px monospace";
              const tagW = ctx.measureText(tagText).width + 16;
              ctx.fillStyle = "rgba(9, 14, 18, 0.9)";
              ctx.fillRect(x, Math.max(0, y - 32), tagW, 30);
              ctx.strokeStyle = color;
              ctx.strokeRect(x, Math.max(0, y - 32), tagW, 30);
              ctx.fillStyle = "#ffffff";
              ctx.fillText(tagText, x + 8, Math.max(20, y - 10));
            });
          }

          handleFrameResponse(resp, imageSrc);
        } catch (err) {
          console.warn("Specimen inference error:", err);
        } finally {
          setIsSpecimenProcessing(false);
        }
      }, "image/jpeg", 0.9);
    } catch (err) {
      console.error("Specimen processing failed:", err);
      setIsSpecimenProcessing(false);
    }
  }, [calibrationScale, throatLimitMm, handleFrameResponse]);

  // Load initial specimen when switching to specimen mode
  useEffect(() => {
    if (activeMode === "specimen") {
      const match = SAMPLE_SPECIMENS.find(s => s.id === selectedSpecimenId);
      if (match) {
        processSpecimenImage(match.url);
      }
    }
  }, [activeMode, selectedSpecimenId, processSpecimenImage]);

  // Handle image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        processSpecimenImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Camera control handlers
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        setIsProcessingLoop(true);
        setHasConfirmedDistance(false);
      }
    } catch (err: any) {
      setCameraError(err.message || "Could not access webcam. Check browser permissions.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    setIsProcessingLoop(false);
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const handleClearAllData = async () => {
    if (confirm("Clear all local measurement feedback and accuracy data?")) {
      try {
        await clearAllData();
        setCurrentMeasurement(null);
        setCurrentDetection(null);
        alert("All local measurement history has been cleared.");
      } catch (err) {
        console.error("Clear failed:", err);
      }
    }
  };

  const calibMmPerPx = calibration?.mmPerPixelAvg ?? (calibration as any)?.mm_per_pixel_avg ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="w-7 h-7 text-emerald-400" />
            Physical Object Measurement
          </h2>
          <p className="text-slate-400 mt-1">
            Millimeter caliber sizing using YOLOv8 contour segmentation, homography matrix &amp; perspective correction
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {calibration && (
            <div className="px-4 py-2 bg-emerald-950/40 border border-emerald-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-mono font-semibold">
                  Scale: {(Number(calibMmPerPx) / 10).toFixed(4)} cm/px ({Number(calibMmPerPx).toFixed(3)} mm/px)
                </span>
                {recalibrationCount > 0 && (
                  <span className="text-[10px] bg-cyan-900/60 border border-cyan-700 text-cyan-300 px-2 py-0.5 rounded font-mono">
                    Iter #{recalibrationCount}
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            onClick={() => setShowCalibrationWizard(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Settings className="w-4 h-4 text-teal-400" />
            <span>Calibrate Camera</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-[#091513] border border-slate-800 rounded-xl w-fit">
        <button
          onClick={() => {
            setActiveMode("webcam");
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeMode === "webcam"
              ? "bg-emerald-600 text-white shadow-md"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Live Webcam Stream</span>
        </button>

        <button
          onClick={() => {
            stopCamera();
            setActiveMode("specimen");
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            activeMode === "specimen"
              ? "bg-emerald-600 text-white shadow-md"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Sample Specimen / Upload</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Viewfinder / Specimen Canvas (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          {activeMode === "webcam" ? (
            <>
              <MeasurementWebcamFeed
                videoRef={videoRef}
                canvasRef={canvasRef}
                isCameraActive={isCameraActive}
                cameraError={cameraError}
                calibrationScale={calibrationScale}
                setCalibrationScale={setCalibrationScale}
                throatLimitMm={throatLimitMm}
                setThroatLimitMm={setThroatLimitMm}
                isProcessingLoop={isProcessingLoop}
                setIsProcessingLoop={setIsProcessingLoop}
                startCamera={startCamera}
                stopCamera={stopCamera}
                onFrameResponse={(res) => handleFrameResponse(res)}
                compact={true}
                showControls={true}
                isAdjustingBox={isAdjustingBox}
                setIsAdjustingBox={setIsAdjustingBox}
                customBox={customBox}
                setCustomBox={setCustomBox}
                calibMmPerPx={Number(calibMmPerPx)}
                objectDistanceCm={objectDistanceCm}
                setObjectDistanceCm={setObjectDistanceCm}
                hasConfirmedDistance={hasConfirmedDistance}
                setHasConfirmedDistance={setHasConfirmedDistance}
              />

              {/* Measurement Target Guide */}
              {!currentMeasurement && isCameraActive && isProcessingLoop && (
                <div className="p-4 bg-[#091513] border border-slate-800 rounded-xl text-center">
                  <Target className="w-8 h-8 mx-auto text-emerald-500 mb-2 animate-pulse" />
                  <p className="text-slate-300 text-sm font-medium">
                    Position rock or object in the center reticle
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ensure adequate lighting. Object caliber and crusher clearance will display in real time.
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Sample Specimen / Image Upload Mode */
            <div className="space-y-4">
              {/* Specimen Selector Carousel */}
              <div className="p-4 bg-[#091513] border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider">
                    Select Test Ore Specimen:
                  </span>
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Custom Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SAMPLE_SPECIMENS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSpecimenId(s.id);
                        processSpecimenImage(s.url);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        selectedSpecimenId === s.id
                          ? "border-emerald-500 bg-emerald-950/40 text-white"
                          : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <div className="font-semibold text-xs truncate">{s.title}</div>
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5">~{s.expectedMajorMm}mm</div>
                      <div className="text-[9px] text-slate-500 truncate mt-1">{s.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Specimen Viewfinder Canvas */}
              <div
                onMouseDown={handleSpecimenMouseDown}
                onMouseMove={handleSpecimenMouseMove}
                onMouseUp={handleSpecimenMouseUp}
                className={`relative rounded-2xl overflow-hidden aspect-video bg-black border-2 shadow-2xl flex items-center justify-center transition-all ${
                  isAdjustingBox
                    ? "border-cyan-400 ring-4 ring-cyan-500/30 cursor-crosshair select-none"
                    : "border-emerald-700/60"
                }`}
              >
                <canvas
                  ref={specimenCanvasRef}
                  className="w-full h-full object-contain"
                />

                {/* Drawn Custom Box Overlay on Specimen */}
                {isAdjustingBox && customBox && (
                  <div
                    className="absolute border-2 border-dashed border-cyan-400 bg-cyan-400/10 pointer-events-none"
                    style={{
                      left: `${customBox[0] * 100}%`,
                      top: `${customBox[1] * 100}%`,
                      width: `${customBox[2] * 100}%`,
                      height: `${customBox[3] * 100}%`,
                    }}
                  >
                    <div className="absolute -top-7 left-0 bg-slate-900/90 border border-cyan-400 text-cyan-300 text-[10px] font-mono px-2 py-0.5 rounded shadow whitespace-nowrap">
                      Selected: ~{((customBox[2] * 1280 * (calibMmPerPx || 0.8)) / 10).toFixed(1)} cm × ~{((customBox[3] * 720 * (calibMmPerPx || 0.8)) / 10).toFixed(1)} cm
                    </div>
                  </div>
                )}

                {isSpecimenProcessing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Computing millimeter measurements...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Calibration Notice */}
          {!calibration && (
            <div className="p-3 bg-amber-950/50 border border-amber-800 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-sm text-amber-300">
                <span className="font-medium">Uncalibrated Camera:</span> Measurements are using approximate scale (1.2x).
                Click &quot;Calibrate Camera&quot; to apply true homography perspective correction using a standard reference card.
              </div>
            </div>
          )}
        </div>

        {/* Right: Measurement Panel (1/3 width) */}
        <div className="lg:col-span-1">
          <MeasurementPanel
            measurement={currentMeasurement}
            detection={currentDetection}
            isCalibrated={!!calibration}
            calibrationScale={calibrationScale}
            throatLimitMm={throatLimitMm}
            warningThresholdMm={warningThresholdMm}
            onCorrectionSubmit={handleCorrectionSubmit}
            onCalibrationClick={() => setShowCalibrationWizard(true)}
            onClearClick={handleClearAllData}
            isAdjustingBox={isAdjustingBox}
            setIsAdjustingBox={setIsAdjustingBox}
            customBox={customBox}
            onDirectRecalibrate={handleDirectRecalibrate}
            recalibrationCount={recalibrationCount}
            calibMmPerPx={Number(calibMmPerPx)}
            objectDistanceCm={objectDistanceCm}
            setObjectDistanceCm={setObjectDistanceCm}
            onMeasureNextObject={handleMeasureNextObject}
          />
        </div>
      </div>

      {/* Calibration Wizard Modal */}
      {showCalibrationWizard && (
        <CalibrationWizard
          cameraId={cameraId}
          videoRef={videoRef}
          canvasRef={canvasRef}
          isCameraActive={isCameraActive}
          onCalibrationComplete={handleCalibrationComplete}
          onClose={() => setShowCalibrationWizard(false)}
        />
      )}
    </div>
  );
};

export default MeasurementView;
