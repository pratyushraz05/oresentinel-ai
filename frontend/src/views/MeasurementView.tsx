import React, { useState, useRef, useEffect, useCallback } from "react";
import { Zap, Target, Settings, AlertTriangle, CheckCircle2 } from "lucide-react";
import { MeasurementWebcamFeed } from "../components/MeasurementWebcamFeed";
import { CalibrationWizard } from "../components/CalibrationWizard";
import { MeasurementPanel } from "../components/MeasurementPanel";
import { fetchCalibration } from "../api";
import { createMeasurement, type MeasurementConfig } from "../utils/measurementEngine";
import type { RealtimeFrameResponse, RealtimeDetectionBox, CameraCalibrationData, Measurement } from "../types";

export const MeasurementView: React.FC = () => {
  // Refs for video and canvas (shared with calibration wizard)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera state (managed by LiveWebcamFeed internally, but we need access for calibration)
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Calibration state
  const [calibration, setCalibration] = useState<CameraCalibrationData | null>(null);
  const [showCalibrationWizard, setShowCalibrationWizard] = useState(false);
  const cameraId = "CAM-WEBCAM-MEASURE";

  // Measurement state
  const [currentMeasurement, setCurrentMeasurement] = useState<Measurement | null>(null);
  const [currentDetection, setCurrentDetection] = useState<RealtimeDetectionBox | null>(null);

  // Live feed props
  const [calibrationScale, setCalibrationScale] = useState(1.2);
  const [throatLimitMm, setThroatLimitMm] = useState(800);
  const [warningThresholdMm] = useState(640); // 80% of throat limit
  const [isProcessingLoop, setIsProcessingLoop] = useState(false);

  // Load calibration on mount
  useEffect(() => {
    const loadCalibration = async () => {
      const cal = await fetchCalibration(cameraId);
      if (cal) {
        setCalibration(cal);
      }
    };
    loadCalibration();
  }, []);

  // Handle calibration complete
  const handleCalibrationComplete = useCallback((newCalibration: CameraCalibrationData) => {
    setCalibration(newCalibration);
    setShowCalibrationWizard(false);
  }, []);

  // Handle correction submit
  const handleCorrectionSubmit = useCallback(() => {
    // Correction is handled internally by MeasurementPanel
  }, []);

  // Handle frame from LiveWebcamFeed
  const handleFrameResponse = useCallback((response: RealtimeFrameResponse) => {
    if (response.detections.length > 0) {
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
        imageWidth: 1280, // Default, will be updated from video
        imageHeight: 720,
      };

      // Update image dimensions from video if available
      if (videoRef.current) {
        config.imageWidth = videoRef.current.videoWidth || 1280;
        config.imageHeight = videoRef.current.videoHeight || 720;
      }

      // We need a captured image for the measurement record
      // In real implementation, capture canvas frame
      const measurement = createMeasurement(detection, config, "");
      setCurrentMeasurement(measurement);
    } else {
      setCurrentDetection(null);
      setCurrentMeasurement(null);
    }
  }, [calibrationScale, throatLimitMm, calibration]);

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
      }
    } catch (err: any) {
      setCameraError(err.message || "Could not access webcam");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="w-7 h-7 text-emerald-400" />
            Object Measurement
          </h2>
          <p className="text-slate-400 mt-1">Measure physical objects using your camera with calibrated mm accuracy</p>
        </div>

        <div className="flex items-center gap-3">
          {calibration && (
            <div className="px-4 py-2 bg-emerald-950/30 border border-emerald-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-mono">
                  Calibrated: {calibration.mmPerPixelAvg.toFixed(4)} mm/px
                </span>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowCalibrationWizard(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm flex items-center gap-2 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Calibrate
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Live Camera Feed (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
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
            onFrameResponse={handleFrameResponse}
            compact={true}
            showControls={true}
          />

          {/* Measurement Target Guide */}
          {!currentMeasurement && isCameraActive && isProcessingLoop && (
            <div className="p-4 bg-[#091513] border border-slate-800 rounded-xl text-center">
              <Target className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-slate-400 text-sm">
                Position object in the center reticle for measurement
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Ensure good lighting and object fills 20-60% of frame
              </p>
            </div>
          )}

          {/* Calibration Notice */}
          {!calibration && isCameraActive && (
            <div className="p-3 bg-amber-950/50 border border-amber-800 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-sm text-amber-300">
                <span className="font-medium">Uncalibrated:</span> Measurements use approximate scale.
                Click "Calibrate" for accurate mm measurements using a reference object.
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
            onClearClick={() => {}}
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