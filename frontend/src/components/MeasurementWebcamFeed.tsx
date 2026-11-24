import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Zap, Play, Pause, Sliders, AlertTriangle } from "lucide-react";
import { sendRealtimeFrame } from "../api";
import type { RealtimeFrameResponse, RealtimeDetectionBox } from "../types";

interface MeasurementWebcamFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isCameraActive: boolean;
  cameraError: string | null;
  calibrationScale: number;
  setCalibrationScale: (v: number) => void;
  throatLimitMm: number;
  setThroatLimitMm: (v: number) => void;
  isProcessingLoop: boolean;
  setIsProcessingLoop: (v: boolean) => void;
  startCamera: () => void;
  stopCamera: () => void;
  onFrameResponse: (response: RealtimeFrameResponse) => void;
  compact?: boolean;
  showControls?: boolean;
}

export const MeasurementWebcamFeed: React.FC<MeasurementWebcamFeedProps> = ({
  videoRef,
  canvasRef,
  isCameraActive,
  cameraError,
  calibrationScale,
  setCalibrationScale,
  throatLimitMm,
  setThroatLimitMm,
  isProcessingLoop,
  setIsProcessingLoop,
  startCamera,
  stopCamera,
  onFrameResponse,
  compact = false,
  showControls = true,
}) => {
  const [liveFps, setLiveFps] = useState(0);
  const [detectionCount, setDetectionCount] = useState(0);
  const [maxCaliberMm, setMaxCaliberMm] = useState(0);
  const [liveSeverity, setLiveSeverity] = useState("CLEAR_BELT");
  const [showCalibrationDrawer, setShowCalibrationDrawer] = useState(false);

  const isSendingRef = useRef(false);
  const intervalRef = useRef<any>(null);

  // Render overlay on canvas
  const renderOverlay = useCallback((
    detections: RealtimeDetectionBox[],
    limitMm: number,
    fps: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    // FPS watermark
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = "rgba(16, 185, 129, 0.6)";
    ctx.fillText(`${fps.toFixed(1)} FPS`, w - 80, 25);

    // Center crosshairs (measurement target)
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(w / 2 - 20, h / 2);
    ctx.lineTo(w / 2 + 20, h / 2);
    ctx.moveTo(w / 2, h / 2 - 20);
    ctx.lineTo(w / 2, h / 2 + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner reticles
    const reticleLen = 20;
    ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
    ctx.lineWidth = 2;
    // TL
    ctx.beginPath(); ctx.moveTo(15, 15 + reticleLen); ctx.lineTo(15, 15); ctx.lineTo(15 + reticleLen, 15); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(w - 15 - reticleLen, 15); ctx.lineTo(w - 15, 15); ctx.lineTo(w - 15, 15 + reticleLen); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(15, h - 15 - reticleLen); ctx.lineTo(15, h - 15); ctx.lineTo(15 + reticleLen, h - 15); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(w - 15 - reticleLen, h - 15); ctx.lineTo(w - 15, h - 15); ctx.lineTo(w - 15, h - 15 - reticleLen); ctx.stroke();

    // Target zone (center area for measurement)
    const targetW = Math.min(w * 0.5, 400);
    const targetH = Math.min(h * 0.5, 300);
    const tx = (w - targetW) / 2;
    const ty = (h - targetH) / 2;
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(tx, ty, targetW, targetH);
    ctx.setLineDash([]);

    // Render detections
    detections.forEach((d) => {
      const [bx, by, bw, bh] = d.bbox;
      const x = bx * w;
      const y = by * h;
      const boxW = bw * w;
      const boxH = bh * h;

      const isOver = d.major_axis_mm >= limitMm || d.is_oversize;
      const isWarn = d.major_axis_mm >= limitMm * 0.8 || d.is_warning;

      const color = isOver ? "#ef4444" : isWarn ? "#f59e0b" : "#10b981";

      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = isOver ? 3 : 2;
      ctx.strokeRect(x, y, boxW, boxH);

      // Corner brackets
      const bracket = Math.min(12, boxW / 4, boxH / 4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y + bracket); ctx.lineTo(x, y); ctx.lineTo(x + bracket, y);
      ctx.moveTo(x + boxW - bracket, y); ctx.lineTo(x + boxW, y); ctx.lineTo(x + boxW, y + bracket);
      ctx.moveTo(x, y + boxH - bracket); ctx.lineTo(x, y + boxH); ctx.lineTo(x + bracket, y + boxH);
      ctx.moveTo(x + boxW - bracket, y + boxH); ctx.lineTo(x + boxW, y + boxH); ctx.lineTo(x + boxW, y + boxH - bracket);
      ctx.stroke();

      // Measurement label
      const label = isOver
        ? `OBJECT #${d.rock_index}: ${Math.round(d.major_axis_mm)}mm [OVERSIZE]`
        : isWarn
        ? `OBJECT #${d.rock_index}: ${Math.round(d.major_axis_mm)}mm [NEAR LIMIT]`
        : `OBJECT #${d.rock_index}: ${Math.round(d.major_axis_mm)}mm`;

      ctx.font = "bold 11px monospace";
      const tagW = Math.max(ctx.measureText(label).width + 12, 180);
      const tagH = 28;
      const tagY = Math.max(tagH + 4, y - 4);

      ctx.fillStyle = "rgba(9, 14, 18, 0.9)";
      ctx.fillRect(x, tagY - tagH, tagW, tagH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, tagY - tagH, tagW, tagH);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + 6, tagY - 10);

      ctx.font = "9px monospace";
      ctx.fillStyle = color;
      ctx.fillText(
        `W:${Math.round(d.major_axis_mm)}mm H:${Math.round(d.minor_axis_mm)}mm | ${d.model_name.includes("YOLO") ? "YOLOv8" : "CV"}`,
        x + 6,
        tagY + 6
      );
    });
  }, []);

  // Process frame
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !isCameraActive || !isProcessingLoop || isSendingRef.current) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) return;

    // Offscreen capture for inference
    const offscreen = document.createElement("canvas");
    offscreen.width = 640;
    offscreen.height = 360;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    // Sync display canvas size
    if (canvasRef.current) {
      if (canvasRef.current.width !== video.videoWidth || canvasRef.current.height !== video.videoHeight) {
        canvasRef.current.width = video.videoWidth || 1280;
        canvasRef.current.height = video.videoHeight || 720;
      }
    }

    isSendingRef.current = true;
    try {
      offscreen.toBlob(async (blob) => {
        if (!blob) {
          isSendingRef.current = false;
          return;
        }

        try {
          const resp: RealtimeFrameResponse = await sendRealtimeFrame(blob, {
            calibrationScale,
            throatLimitMm,
            autoCreateIncident: false, // Don't create incidents in measurement mode
            sourceId: "CAM-WEBCAM-MEASURE",
          });

          setLiveFps(resp.fps);
          setDetectionCount(resp.detection_count);
          setMaxCaliberMm(resp.max_caliber_mm);
          setLiveSeverity(resp.severity);

          // Render overlay
          renderOverlay(resp.detections, throatLimitMm, resp.fps);

          // Callback with response
          onFrameResponse(resp);
        } catch (err) {
          console.warn("Measurement inference error:", err);
        } finally {
          isSendingRef.current = false;
        }
      }, "image/jpeg", 0.85);
    } catch {
      isSendingRef.current = false;
    }
  }, [isCameraActive, isProcessingLoop, calibrationScale, throatLimitMm, renderOverlay, onFrameResponse]);

  // Main loop
  useEffect(() => {
    if (!isCameraActive || !isProcessingLoop) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      processFrame();
    }, 180); // ~5 FPS

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isCameraActive, isProcessingLoop, processFrame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className={`space-y-4 ${compact ? "compact-feed" : ""}`}>
      {/* Status Banner */}
      {!isCameraActive && (
        <div className="p-4 bg-[#091513] border border-slate-800 rounded-xl text-center space-y-3">
          <Camera className="w-12 h-12 mx-auto text-slate-600" />
          <h4 className="text-white font-semibold">Camera Inactive</h4>
          <p className="text-slate-400 text-sm">Click "Connect Camera" to start measurement</p>
          {cameraError && (
            <div className="p-2 bg-rose-950/40 border border-rose-800 rounded-lg text-xs text-rose-300">
              {cameraError}
            </div>
          )}
          <button
            onClick={startCamera}
            className="mx-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold rounded-lg flex items-center gap-2 shadow-lg hover:from-emerald-400 hover:to-teal-500 transition-all"
          >
            <Zap className="w-4 h-4 fill-current" />
            Connect Camera
          </button>
        </div>
      )}

      {/* Video Viewfinder */}
      {isCameraActive && (
        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-700/60 bg-black aspect-video shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Top HUD */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
            <div className="flex items-center space-x-2">
              <div className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-mono text-emerald-400 border border-emerald-700/60 flex items-center space-x-2 shadow-md">
                <span className={`w-2.5 h-2.5 rounded-full ${isProcessingLoop ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                <span className="font-bold">
                  {isProcessingLoop ? "LIVE MEASUREMENT" : "PAUSED"}
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-300">{liveFps} FPS</span>
              </div>

              <div className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300 border border-slate-700 flex items-center space-x-1.5 shadow-md">
                <span>DETECTED:</span>
                <span className="text-emerald-400 font-bold">{detectionCount}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 pointer-events-auto">
              <button
                onClick={() => setShowCalibrationDrawer(!showCalibrationDrawer)}
                title="Calibration Settings"
                className="p-1.5 rounded-lg border border-slate-700 bg-black/80 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors backdrop-blur"
              >
                <Sliders className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bottom Status */}
          <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-none">
            <div className="bg-black/80 backdrop-blur px-3 py-1.5 rounded-xl border border-emerald-600/50 flex items-center space-x-3 text-xs font-mono shadow-md">
              <div>
                <span className="text-slate-400">MAX SIZE: </span>
                <span className={`font-bold ${maxCaliberMm >= throatLimitMm ? "text-rose-400 animate-pulse" : maxCaliberMm >= throatLimitMm * 0.8 ? "text-amber-400" : "text-emerald-400"}`}>
                  {Math.round(maxCaliberMm)}mm
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <div>
                <span className="text-slate-400">LIMIT: </span>
                <span className="text-white font-bold">{throatLimitMm}mm</span>
              </div>
              <span className="text-slate-600">|</span>
              <div>
                <span className="text-slate-400">SCALE: </span>
                <span className="text-teal-300 font-bold">{calibrationScale.toFixed(1)}x</span>
              </div>
            </div>

            <div className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center space-x-2">
              <span className={
                liveSeverity === "CRITICAL_OVERSIZE" ? "text-rose-400 font-bold" :
                liveSeverity === "HIGH_RISK" ? "text-amber-400 font-bold" :
                liveSeverity === "CLEAR_BELT" ? "text-slate-400" : "text-emerald-400"
              }>
                {liveSeverity.replace("_", " ")}
              </span>
              <span className="text-slate-600">|</span>
              <span>YOLOv8</span>
            </div>
          </div>
        </div>
      )}

      {/* Calibration Drawer */}
      {showCalibrationDrawer && (
        <div className="p-4 bg-[#071412] border border-[#1b3a32] rounded-xl space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#132c25]">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Calibration & Measurement Settings
              </span>
            </div>
            <button
              onClick={() => setShowCalibrationDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Done
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Distance / Scale Multiplier:</span>
                <span className="font-mono text-emerald-400 font-bold">{calibrationScale.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={calibrationScale}
                onChange={(e) => setCalibrationScale(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">
                Adjust if object appears larger/smaller than actual. Increase for closer objects.
              </span>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Size Alert Threshold:</span>
                <span className="font-mono text-rose-400 font-bold">{throatLimitMm} mm</span>
              </div>
              <input
                type="range"
                min="100"
                max="2000"
                step="25"
                value={throatLimitMm}
                onChange={(e) => setThroatLimitMm(parseInt(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">
                Objects exceeding this show OVERSIZE warning.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      {showControls && isCameraActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#081513] border border-[#173830] rounded-xl">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsProcessingLoop(!isProcessingLoop)}
              className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center space-x-2 cursor-pointer transition-all ${
                isProcessingLoop
                  ? "bg-amber-600 hover:bg-amber-500 text-white shadow"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
              }`}
            >
              {isProcessingLoop ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause Inference</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Stream</span>
                </>
              )}
            </button>

            <button
              onClick={stopCamera}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
            >
              Disconnect
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center space-x-2 font-mono">
            <span className={`w-2 h-2 rounded-full ${isProcessingLoop ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <span>Real-time YOLOv8 Measurement</span>
          </div>
        </div>
      )}

      {/* Guidance when no detection */}
      {isCameraActive && isProcessingLoop && detectionCount === 0 && (
        <div className="p-3 bg-[#091513] border border-slate-800 rounded-lg text-center">
          <AlertTriangle className="w-6 h-6 mx-auto text-slate-600 mb-1" />
          <p className="text-slate-400 text-sm">No object detected</p>
          <p className="text-xs text-slate-500">Position object in center target area</p>
        </div>
      )}
    </div>
  );
};

export default MeasurementWebcamFeed;