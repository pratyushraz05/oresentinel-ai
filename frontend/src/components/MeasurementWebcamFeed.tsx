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
  isAdjustingBox?: boolean;
  setIsAdjustingBox?: (v: boolean) => void;
  customBox?: [number, number, number, number] | null;
  setCustomBox?: (box: [number, number, number, number] | null) => void;
  calibMmPerPx?: number;
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
  isAdjustingBox = false,
  setIsAdjustingBox,
  customBox = null,
  setCustomBox,
  calibMmPerPx = 0.8,
}) => {
  const [liveFps, setLiveFps] = useState(0);
  const [detectionCount, setDetectionCount] = useState(0);
  const [maxCaliberMm, setMaxCaliberMm] = useState(0);
  const [liveSeverity, setLiveSeverity] = useState("CLEAR_BELT");
  const [showCalibrationDrawer, setShowCalibrationDrawer] = useState(false);

  // Manual box drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [dragBox, setDragBox] = useState<[number, number, number, number] | null>(null);

  const isSendingRef = useRef(false);
  const intervalRef = useRef<any>(null);
  const lastDetectionsRef = useRef<RealtimeDetectionBox[]>([]);

  // Render overlay on canvas
  const renderOverlay = useCallback((
    detections: RealtimeDetectionBox[],
    limitMm: number,
    fps: number,
    activeBox: [number, number, number, number] | null = null
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

    // If not adjusting box, render system detections
    if (!isAdjustingBox) {
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

        // Measurement label in Centimeters (cm)
        const majorCm = (d.major_axis_mm / 10).toFixed(1);
        const minorCm = (d.minor_axis_mm / 10).toFixed(1);
        const label = isOver
          ? `OBJECT #${d.rock_index}: ${majorCm} cm (${Math.round(d.major_axis_mm)} mm) [OVERSIZE]`
          : isWarn
          ? `OBJECT #${d.rock_index}: ${majorCm} cm (${Math.round(d.major_axis_mm)} mm) [NEAR LIMIT]`
          : `OBJECT #${d.rock_index}: ${majorCm} cm (${Math.round(d.major_axis_mm)} mm)`;

        ctx.font = "bold 12px monospace";
        const tagW = Math.max(ctx.measureText(label).width + 16, 210);
        const tagH = 30;
        const tagY = Math.max(tagH + 4, y - 4);

        ctx.fillStyle = "rgba(9, 14, 18, 0.92)";
        ctx.fillRect(x, tagY - tagH, tagW, tagH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, tagY - tagH, tagW, tagH);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x + 6, tagY - 12);

        ctx.font = "10px monospace";
        ctx.fillStyle = color;
        ctx.fillText(
          `W: ${majorCm} cm | H: ${minorCm} cm | ${d.model_name.includes("YOLO") ? "YOLOv8" : "Salient Object"}`,
          x + 6,
          tagY + 4
        );
      });
    }

    // Render User-Adjusted / Drawn Box if active or adjusting
    const boxToDraw = activeBox || dragBox || customBox;
    if (isAdjustingBox && boxToDraw) {
      const [bx, by, bw, bh] = boxToDraw;
      const x = bx * w;
      const y = by * h;
      const boxW = bw * w;
      const boxH = bh * h;

      // Semi-transparent backdrop highlight
      ctx.fillStyle = "rgba(6, 182, 212, 0.12)";
      ctx.fillRect(x, y, boxW, boxH);

      // Neon Cyan Dashed Boundary
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, boxW, boxH);
      ctx.setLineDash([]);

      // 4 Corner Handles
      const handleSize = 8;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      [
        [x, y],
        [x + boxW, y],
        [x, y + boxH],
        [x + boxW, y + boxH],
        [x + boxW / 2, y],
        [x + boxW / 2, y + boxH],
        [x, y + boxH / 2],
        [x + boxW, y + boxH / 2],
      ].forEach(([hx, hy]) => {
        ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      });

      // Calculate approximate cm for drawn box
      const effectiveScale = calibMmPerPx > 0 ? calibMmPerPx : 0.8;
      const estWidthCm = ((boxW * effectiveScale) / 10).toFixed(1);
      const estHeightCm = ((boxH * effectiveScale) / 10).toFixed(1);

      // Dimension Tag
      const userTag = `Selected Object Box: ~${estWidthCm} cm × ~${estHeightCm} cm`;
      ctx.font = "bold 12px monospace";
      const tagW = ctx.measureText(userTag).width + 16;
      const tagH = 28;
      const tagY = Math.max(tagH + 6, y - 6);

      ctx.fillStyle = "rgba(8, 28, 36, 0.95)";
      ctx.fillRect(x, tagY - tagH, tagW, tagH);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, tagY - tagH, tagW, tagH);

      ctx.fillStyle = "#38bdf8";
      ctx.fillText(userTag, x + 8, tagY - 8);
    }
  }, [isAdjustingBox, dragBox, customBox, calibMmPerPx]);

  // Keep last detections in ref
  useEffect(() => {
    if (canvasRef.current && isAdjustingBox) {
      renderOverlay(lastDetectionsRef.current, throatLimitMm, liveFps, customBox);
    }
  }, [isAdjustingBox, customBox, renderOverlay, throatLimitMm, liveFps]);

  // Pointer event helpers for interactive box drawing
  const getNormalizedPoint = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const container = e.currentTarget.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = Math.max(0, Math.min(1, (clientX - container.left) / container.width));
    const y = Math.max(0, Math.min(1, (clientY - container.top) / container.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isAdjustingBox) return;
    const pt = getNormalizedPoint(e);
    setIsDrawing(true);
    setStartPoint(pt);
    const initBox: [number, number, number, number] = [pt.x, pt.y, 0.01, 0.01];
    setDragBox(initBox);
    renderOverlay(lastDetectionsRef.current, throatLimitMm, liveFps, initBox);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isAdjustingBox || !isDrawing || !startPoint) return;
    const pt = getNormalizedPoint(e);
    const minX = Math.min(startPoint.x, pt.x);
    const minY = Math.min(startPoint.y, pt.y);
    const w = Math.max(0.01, Math.abs(pt.x - startPoint.x));
    const h = Math.max(0.01, Math.abs(pt.y - startPoint.y));
    const newBox: [number, number, number, number] = [minX, minY, w, h];
    setDragBox(newBox);
    renderOverlay(lastDetectionsRef.current, throatLimitMm, liveFps, newBox);
  };

  const handlePointerUp = () => {
    if (!isAdjustingBox || !isDrawing || !dragBox) return;
    setIsDrawing(false);
    setStartPoint(null);
    if (setCustomBox && dragBox[2] > 0.02 && dragBox[3] > 0.02) {
      setCustomBox(dragBox);
    }
  };

  // Process frame
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !isCameraActive || !isProcessingLoop || isSendingRef.current || isAdjustingBox) {
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
            autoCreateIncident: false,
            sourceId: "CAM-WEBCAM-MEASURE",
          });

          setLiveFps(resp.fps);
          setDetectionCount(resp.detection_count);
          setMaxCaliberMm(resp.max_caliber_mm);
          setLiveSeverity(resp.severity);
          lastDetectionsRef.current = resp.detections || [];

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
  }, [isCameraActive, isProcessingLoop, isAdjustingBox, calibrationScale, throatLimitMm, renderOverlay, onFrameResponse]);

  // Main loop
  useEffect(() => {
    if (!isCameraActive || !isProcessingLoop || isAdjustingBox) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      processFrame();
    }, 180); // ~5 FPS

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isCameraActive, isProcessingLoop, isAdjustingBox, processFrame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className={`space-y-4 ${compact ? "compact-feed" : ""}`}>
      {/* Box Adjustment Guidance Banner */}
      {isAdjustingBox && (
        <div className="p-3 bg-cyan-950/70 border-2 border-cyan-500 rounded-xl flex items-center justify-between text-cyan-200 text-xs shadow-lg animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-base">✏️</span>
            <div>
              <span className="font-bold text-white uppercase tracking-wider block">Manual Box Selection Active</span>
              <span>Click and drag over the camera image to outline the object. Release when aligned.</span>
            </div>
          </div>
          {setIsAdjustingBox && (
            <button
              onClick={() => setIsAdjustingBox(false)}
              className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded-lg cursor-pointer text-xs transition-colors shrink-0"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Video Viewfinder Container */}
      <div
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        className={`relative rounded-2xl overflow-hidden aspect-video shadow-2xl transition-all duration-300 border-2 ${
          isAdjustingBox
            ? "border-cyan-400 ring-4 ring-cyan-500/30 cursor-crosshair select-none bg-black"
            : isCameraActive
            ? "border-emerald-700/60 bg-black opacity-100"
            : "border-slate-800 bg-[#050c0b]"
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${isCameraActive ? "block" : "hidden"}`}
        />

        {/* Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${isAdjustingBox ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"} ${isCameraActive ? "block" : "hidden"}`}
        />

        {/* Inactive overlay */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
            <Camera className="w-14 h-14 text-slate-700 mx-auto" />
            <h4 className="text-white font-semibold text-lg">Webcam Measurement Offline</h4>
            <p className="text-slate-400 text-xs max-w-sm">
              Click &quot;Connect Camera&quot; to begin real-time mm caliber detection and crusher clearance measurement.
            </p>
            {cameraError && (
              <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-300 max-w-md">
                {cameraError}
              </div>
            )}
            <button
              onClick={startCamera}
              className="mt-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold rounded-lg flex items-center gap-2 shadow-lg hover:from-emerald-400 hover:to-teal-500 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              Connect Camera
            </button>
          </div>
        )}

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
                  {(maxCaliberMm / 10).toFixed(1)} cm <span className="text-[10px] text-slate-400 font-normal">({Math.round(maxCaliberMm)} mm)</span>
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <div>
                <span className="text-slate-400">LIMIT: </span>
                <span className="text-white font-bold">{(throatLimitMm / 10).toFixed(1)} cm</span>
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
              <span>YOLOv8 + Salient</span>
            </div>
          </div>
        </div>

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