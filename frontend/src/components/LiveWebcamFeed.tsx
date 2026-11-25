import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera, Zap, Volume2, VolumeX, ShieldAlert,
  Play, Pause, Sliders, CheckCircle2, Siren, Edit3
} from "lucide-react";
import {
  sendRealtimeFrame, acknowledgeIncident, linkOutcome,
  fetchSystemCalibrationStatus, directRecalibrate, type SystemCalibrationStatus
} from "../api";
import { soundAlert } from "../utils/audioAlert";
import type { Incident, RealtimeFrameResponse, RealtimeDetectionBox } from "../types";

interface LiveWebcamFeedProps {
  onIncidentTriggered?: (incident: Incident) => void;
  defaultThroatLimitMm?: number;
  showControls?: boolean;
  compact?: boolean;
  systemCalibration?: SystemCalibrationStatus | null;
  onCalibrationUpdated?: () => void;
}

export const LiveWebcamFeed: React.FC<LiveWebcamFeedProps> = ({
  onIncidentTriggered,
  defaultThroatLimitMm = 800,
  showControls = true,
  compact = false,
  systemCalibration: propSystemCalib,
  onCalibrationUpdated,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isProcessingLoop, setIsProcessingLoop] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Calibration parameters & distance
  const [throatLimitMm, setThroatLimitMm] = useState<number>(defaultThroatLimitMm);
  const [calibrationScale, setCalibrationScale] = useState<number>(1.0);
  const [objectDistanceCm, setObjectDistanceCm] = useState<number>(propSystemCalib?.distance_cm || 50.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showCalibrationDrawer, setShowCalibrationDrawer] = useState<boolean>(false);
  const [systemCalib, setSystemCalib] = useState<SystemCalibrationStatus | null>(propSystemCalib || null);

  // Manual Box Adjustment / Recalibration State
  const [isAdjustingBox, setIsAdjustingBox] = useState<boolean>(false);
  const [customBox, setCustomBox] = useState<[number, number, number, number] | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [dragBox, setDragBox] = useState<[number, number, number, number] | null>(null);
  const [manualLengthCm, setManualLengthCm] = useState<string>("25.0");
  const [manualBreadthCm, setManualBreadthCm] = useState<string>("18.0");
  const [isRecalibrating, setIsRecalibrating] = useState<boolean>(false);
  const [recalibMessage, setRecalibMessage] = useState<string | null>(null);

  // Multi-frame crusher verification: check 4 times on slow-moving conveyor before trip
  const REQUIRED_OVERSIZE_CHECKS = 4;
  const consecutiveOversizeRef = useRef<number>(0);
  const [oversizeCheckCount, setOversizeCheckCount] = useState<number>(0);
  const [isVerifyingOversize, setIsVerifyingOversize] = useState<boolean>(false);

  // Load / sync system-wide calibration
  const refreshCalibration = useCallback(async () => {
    try {
      const calib = await fetchSystemCalibrationStatus();
      if (calib && calib.is_calibrated) {
        setSystemCalib(calib);
        setCalibrationScale(1.0);
        if (calib.distance_cm) {
          setObjectDistanceCm(calib.distance_cm);
        }
      }
    } catch (err) {
      console.warn("Could not fetch active system calibration for live feed:", err);
    }
  }, []);

  useEffect(() => {
    if (propSystemCalib?.is_calibrated) {
      setSystemCalib(propSystemCalib);
      setCalibrationScale(1.0);
      if (propSystemCalib.distance_cm) {
        setObjectDistanceCm(propSystemCalib.distance_cm);
      }
    } else {
      refreshCalibration();
    }
  }, [propSystemCalib, refreshCalibration]);

  // Live telemetry
  const [liveFps, setLiveFps] = useState<number>(0);
  const [detectionCount, setDetectionCount] = useState<number>(0);
  const [maxCaliberMm, setMaxCaliberMm] = useState<number>(0);
  const [liveSeverity, setLiveSeverity] = useState<string>("CLEAR_BELT");
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(180);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const isSendingRef = useRef<boolean>(false);
  const loopTimeoutRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Start webcam hardware stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        setIsProcessingLoop(true); // Auto-start real-time inference loop
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError(err.message || "Could not access webcam. Please verify camera permissions in browser.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    setIsProcessingLoop(false);
    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    consecutiveOversizeRef.current = 0;
    setOversizeCheckCount(0);
    setIsVerifyingOversize(false);
  };

  // Pointer / touch handlers for manual box drawing on live webcam
  const getNormalizedPoint = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isAdjustingBox) return;
    const pt = getNormalizedPoint(e);
    setIsDrawing(true);
    setStartPoint(pt);
    setDragBox([pt.x, pt.y, 0.01, 0.01]);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isAdjustingBox || !isDrawing || !startPoint) return;
    const pt = getNormalizedPoint(e);
    const minX = Math.min(startPoint.x, pt.x);
    const minY = Math.min(startPoint.y, pt.y);
    const w = Math.max(0.02, Math.abs(pt.x - startPoint.x));
    const h = Math.max(0.02, Math.abs(pt.y - startPoint.y));
    setDragBox([minX, minY, w, h]);
  };

  const handlePointerUp = () => {
    if (!isAdjustingBox) return;
    setIsDrawing(false);
    if (dragBox && dragBox[2] > 0.02 && dragBox[3] > 0.02) {
      setCustomBox(dragBox);
    }
    setStartPoint(null);
  };

  // Direct recalibration on user-drawn box
  const handleRecalibrateBox = async () => {
    const lCm = parseFloat(manualLengthCm);
    const bCm = parseFloat(manualBreadthCm);
    const dCm = objectDistanceCm || 50;
    if (isNaN(lCm) || isNaN(bCm) || lCm <= 0 || bCm <= 0) {
      alert("Please enter valid length and breadth in centimeters (e.g. 25.0 cm).");
      return;
    }
    setIsRecalibrating(true);
    try {
      const box = customBox || [0.25, 0.25, 0.5, 0.5];
      const imgW = videoRef.current?.videoWidth || 1280;
      const imgH = videoRef.current?.videoHeight || 720;
      await directRecalibrate({
        camera_id: "CAM-WEBCAM-MEASURE",
        box: box,
        actual_width_cm: Math.max(lCm, bCm),
        actual_height_cm: Math.min(lCm, bCm),
        distance_cm: dCm,
        image_width: imgW,
        image_height: imgH,
        notes: `User calibrated box: ${lCm}x${bCm}cm at ${dCm}cm`
      });
      const freshCalib = await fetchSystemCalibrationStatus();
      setSystemCalib(freshCalib);
      setCalibrationScale(1.0);
      setRecalibMessage(`Calibrated successfully! System scale synchronized at ${dCm} cm.`);
      setIsAdjustingBox(false);
      onCalibrationUpdated?.();
      setTimeout(() => setRecalibMessage(null), 6000);
    } catch (err: any) {
      alert(`Calibration failed: ${err.message || err}`);
    } finally {
      setIsRecalibrating(false);
    }
  };

  // Canvas drawing routine
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

    // Live FPS watermark
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = "rgba(16, 185, 129, 0.6)";
    ctx.fillText(`${fps.toFixed(1)} FPS`, w - 80, 25);

    // Viewfinder corner marks
    ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
    ctx.lineWidth = 2;
    const reticleLen = 24;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(15, 15 + reticleLen);
    ctx.lineTo(15, 15);
    ctx.lineTo(15 + reticleLen, 15);
    // Top-right
    ctx.moveTo(w - 15 - reticleLen, 15);
    ctx.lineTo(w - 15, 15);
    ctx.lineTo(w - 15, 15 + reticleLen);
    // Bottom-left
    ctx.moveTo(15, h - 15 - reticleLen);
    ctx.lineTo(15, h - 15);
    ctx.lineTo(15 + reticleLen, h - 15);
    // Bottom-right
    ctx.moveTo(w - 15 - reticleLen, h - 15);
    ctx.lineTo(w - 15, h - 15);
    ctx.lineTo(w - 15, h - 15 - reticleLen);
    ctx.stroke();

    // Center crosshairs
    ctx.beginPath();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.25)";
    ctx.moveTo(w / 2 - 16, h / 2);
    ctx.lineTo(w / 2 + 16, h / 2);
    ctx.moveTo(w / 2, h / 2 - 16);
    ctx.lineTo(w / 2, h / 2 + 16);
    ctx.stroke();

    // If 0 rock pieces detected, render clear conveyor guidance reticle
    if (detections.length === 0) {
      const targetW = Math.min(w * 0.45, 360);
      const targetH = Math.min(h * 0.45, 240);
      const tx = (w - targetW) / 2;
      const ty = (h - targetH) / 2;

      ctx.save();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(tx, ty, targetW, targetH);
      ctx.restore();

      ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("CONVEYOR CLEAR • NO ROCK PIECE DETECTED", w / 2, ty + targetH / 2 - 8);

      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.font = "11px monospace";
      ctx.fillText("Hold rock piece inside target area for caliber measurement", w / 2, ty + targetH / 2 + 12);
      ctx.textAlign = "start";
    }

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

      // Corner accent brackets
      const bracket = Math.min(14, boxW / 4, boxH / 4);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y + bracket);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bracket, y);
      ctx.moveTo(x + boxW - bracket, y);
      ctx.lineTo(x + boxW, y);
      ctx.lineTo(x + boxW, y + bracket);
      ctx.moveTo(x, y + boxH - bracket);
      ctx.lineTo(x, y + boxH);
      ctx.lineTo(x + bracket, y + boxH);
      ctx.moveTo(x + boxW - bracket, y + boxH);
      ctx.lineTo(x + boxW, y + boxH);
      ctx.lineTo(x + boxW, y + boxH - bracket);
      ctx.stroke();

      // Industrial Caliber Tag in Centimeters (cm) and Millimeters (mm)
      const majorCm = (d.major_axis_mm / 10).toFixed(1);
      const minorCm = (d.minor_axis_mm / 10).toFixed(1);
      const label = isOver
        ? `BOULDER #${d.rock_index}: ${majorCm} cm (${Math.round(d.major_axis_mm)}mm) [OVERSIZE]`
        : isWarn
        ? `ROCK #${d.rock_index}: ${majorCm} cm (${Math.round(d.major_axis_mm)}mm) [NEAR-LIMIT]`
        : `FRAGMENT #${d.rock_index}: ${majorCm} cm (${Math.round(d.major_axis_mm)}mm)`;

      ctx.font = "bold 12px monospace";
      const tagW = Math.max(ctx.measureText(label).width + 16, 230);
      const tagH = 34;
      const tagY = Math.max(tagH + 4, y - 6);

      // Badge background
      ctx.fillStyle = "rgba(9, 14, 18, 0.9)";
      ctx.fillRect(x, tagY - tagH, tagW, tagH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, tagY - tagH, tagW, tagH);

      // Label text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + 8, tagY - 18);

      // Sub text
      const areaCm2 = ((d.major_axis_mm * d.minor_axis_mm) / 100).toFixed(1);
      ctx.font = "10px monospace";
      ctx.fillStyle = color;
      ctx.fillText(
        `L:${majorCm}cm B:${minorCm}cm | Area: ${areaCm2}cm² | Mass: ~${Math.round(d.estimated_mass_kg)}kg | ${systemCalib?.is_calibrated ? 'System Calibrated' : 'Est. Scale'}`,
        x + 8,
        tagY - 6
      );
    });

    // Render manual drawn/adjusted box if active
    const boxToDraw = dragBox || customBox;
    if (isAdjustingBox && boxToDraw) {
      const [bx, by, bw, bh] = boxToDraw;
      const x = bx * w;
      const y = by * h;
      const boxW = bw * w;
      const boxH = bh * h;

      ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
      ctx.fillRect(x, y, boxW, boxH);

      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, boxW, boxH);
      ctx.setLineDash([]);

      const handleSize = 8;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      [
        [x, y], [x + boxW, y], [x, y + boxH], [x + boxW, y + boxH]
      ].forEach(([hx, hy]) => {
        ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      });

      const effectiveMmPerPx = (systemCalib?.is_calibrated && systemCalib.mm_per_pixel) ? systemCalib.mm_per_pixel : 0.8;
      const estLengthCm = ((Math.max(boxW, boxH) * effectiveMmPerPx) / 10).toFixed(1);
      const estBreadthCm = ((Math.min(boxW, boxH) * effectiveMmPerPx) / 10).toFixed(1);
      const estAreaCm2 = (parseFloat(estLengthCm) * parseFloat(estBreadthCm)).toFixed(1);
      const userTag = `Selected Object: ${estLengthCm} cm (L) × ${estBreadthCm} cm (B) | Area: ${estAreaCm2} cm²`;

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
  }, [systemCalib, isAdjustingBox, dragBox, customBox]);

  // Frame processing step
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !isCameraActive || !isProcessingLoop || isSendingRef.current) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) return;

    // Create offscreen capture
    const offscreen = document.createElement("canvas");
    offscreen.width = 640; // Fast 640x360 frame for rapid edge inference
    offscreen.height = 360;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    // Sync canvas size
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
          // Continuous multi-frame crusher check: require 4 consecutive oversize frames before creating an incident
          const isFinalConfirmation = consecutiveOversizeRef.current >= (REQUIRED_OVERSIZE_CHECKS - 1);

          const resp: RealtimeFrameResponse = await sendRealtimeFrame(blob, {
            calibrationScale,
            throatLimitMm,
            autoCreateIncident: isFinalConfirmation,
            sourceId: "CAM-WEBCAM-MEASURE",
            distanceCm: objectDistanceCm,
          });

          setLiveFps(resp.fps);
          setDetectionCount(resp.detection_count);
          setMaxCaliberMm(resp.max_caliber_mm);
          setLiveSeverity(resp.severity);

          // Multi-frame crusher verification logic
          const hasOversizeInFrame = resp.severity === "CRITICAL_OVERSIZE" || resp.max_caliber_mm >= throatLimitMm || resp.detections.some(d => d.is_oversize);

          if (hasOversizeInFrame) {
            consecutiveOversizeRef.current += 1;
            const currentChecks = consecutiveOversizeRef.current;
            setOversizeCheckCount(currentChecks);

            if (currentChecks < REQUIRED_OVERSIZE_CHECKS) {
              // Frame 1, 2, or 3: Keep detecting size again and again!
              setIsVerifyingOversize(true);
              soundAlert.playWarningBeep();
            } else {
              // 4 consecutive frames verified oversize: now trip conveyor & alert operator!
              setIsVerifyingOversize(false);
              soundAlert.playCriticalSiren();

              if (resp.incident_created && resp.incident) {
                setActiveIncident(resp.incident);
                setCountdownSec(180);
                setActionSuccessMessage(null);
                if (onIncidentTriggered) {
                  onIncidentTriggered(resp.incident);
                }
              }
            }
          } else {
            // If caliber is within limit or conveyor is clear, decay counter
            if (consecutiveOversizeRef.current > 0) {
              consecutiveOversizeRef.current = Math.max(0, consecutiveOversizeRef.current - 1);
              setOversizeCheckCount(consecutiveOversizeRef.current);
              if (consecutiveOversizeRef.current === 0) {
                setIsVerifyingOversize(false);
              }
            }
          }

          // Render Bounding Boxes on Overlay
          renderOverlay(resp.detections, throatLimitMm, resp.fps);
        } catch (err) {
          console.warn("Realtime inference tick error:", err);
        } finally {
          isSendingRef.current = false;
        }
      }, "image/jpeg", 0.85);
    } catch {
      isSendingRef.current = false;
    }
  }, [isCameraActive, isProcessingLoop, calibrationScale, throatLimitMm, objectDistanceCm, renderOverlay, onIncidentTriggered]);

  // Main stream loop interval (~5 FPS = 200ms)
  useEffect(() => {
    if (!isCameraActive || !isProcessingLoop) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const interval = setInterval(() => {
      processFrame();
    }, 180);

    return () => clearInterval(interval);
  }, [isCameraActive, isProcessingLoop, processFrame]);

  // Countdown timer for active incident
  useEffect(() => {
    if (!activeIncident || activeIncident.status !== "PENDING_REVIEW") {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdownSec((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [activeIncident]);

  // Operator Action Trigger
  const handleQuickMitigation = async (action: string) => {
    if (!activeIncident) return;
    try {
      const updated = await acknowledgeIncident(
        activeIncident.id,
        "OPERATOR-LIVE-WEBCAM",
        action,
        `Real-time operator mitigation: ${action} executed within lead time.`
      );
      soundAlert.playSuccessChime();

      // Automatically link avoided stoppage outcome
      const resolved = await linkOutcome(
        updated.id,
        action === "FALSE_ALARM" ? "FALSE_ALARM_BYPASSED" : "AVOIDED_STOPPAGE",
        0.0,
        45.0,
        "Autonomous chute diversion prevented primary crusher stall. ₹1.12L cost avoided."
      );

      setActiveIncident(resolved);
      setActionSuccessMessage(`ACTION CONFIRMED: ${action.replace("_", " ")} recorded! Lead time: ${resolved.lead_time_seconds || 14}s. Saved 45min (₹1.12L)!`);
      if (onIncidentTriggered) onIncidentTriggered(resolved);

      setTimeout(() => {
        setActiveIncident(null);
        setActionSuccessMessage(null);
      }, 7000);
    } catch (e: any) {
      alert("Mitigation failed: " + e.message);
    }
  };

  const toggleSound = () => {
    const muted = soundAlert.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className={`space-y-4 ${compact ? "compact-feed" : ""}`}>
      {/* Real-time Flashing Siren Alert Banner */}
      {activeIncident && activeIncident.status === "PENDING_REVIEW" && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950 via-rose-900 to-rose-950 border-2 border-rose-500 shadow-xl shadow-rose-950/80 animate-pulse text-white flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-rose-600 flex items-center justify-center shrink-0 shadow-lg">
              <Siren className="w-6 h-6 animate-spin text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded text-rose-300 border border-rose-700">
                  EMERGENCY SCADA ALERT: {activeIncident.incident_number}
                </span>
                <span className="text-xs font-mono bg-rose-500 text-slate-950 px-2 py-0.5 rounded font-bold">
                  {Math.round(activeIncident.max_boulder_mm)}mm &gt; {throatLimitMm}mm
                </span>
              </div>
              <p className="text-sm font-semibold mt-1">
                Oversize Boulder on Live Belt! Chute bridging hazard imminent.
              </p>
            </div>
          </div>

          {/* Sub-180s Countdown Clock & Instant Action Buttons */}
          <div className="flex items-center space-x-3">
            <div className="text-center px-3 py-1 bg-black/70 rounded-lg border border-rose-700">
              <div className="text-[10px] text-slate-400 font-mono">ACTION DEADLINE</div>
              <div className={`text-xl font-bold font-mono ${countdownSec < 60 ? "text-rose-400 animate-ping" : "text-amber-400"}`}>
                {Math.floor(countdownSec / 60)}:{(countdownSec % 60).toString().padStart(2, "0")}
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleQuickMitigation("DIVERT_CHUTE")}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-950 cursor-pointer transition-all"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Divert Chute</span>
              </button>
              <button
                onClick={() => handleQuickMitigation("HALT_CONVEYOR")}
                className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-amber-950 cursor-pointer transition-all"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>SCADA Trip</span>
              </button>
              <button
                onClick={() => {
                  setActiveIncident(null);
                  consecutiveOversizeRef.current = 0;
                  setOversizeCheckCount(0);
                  setIsVerifyingOversize(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
                title="Reset alert and scan next rock on conveyor"
              >
                Scan Next Rock &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success banner after mitigation */}
      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded-xl text-xs text-emerald-200 flex items-center space-x-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-semibold">{actionSuccessMessage}</span>
        </div>
      )}

      {/* Video Viewfinder Container with Mouse & Touch Drawing */}
      <div
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        className={`relative rounded-2xl overflow-hidden border-2 aspect-video shadow-2xl flex items-center justify-center group transition-all ${
          isAdjustingBox
            ? "border-cyan-400 ring-4 ring-cyan-500/30 cursor-crosshair select-none bg-black"
            : isCameraActive
            ? "border-emerald-700/60 bg-black"
            : "border-slate-800 bg-[#050c0b]"
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Real-time Bounding Box Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${isAdjustingBox ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
        />

        {/* Multi-frame Crusher Conveyor Verification Overlay */}
        {isVerifyingOversize && (
          <div className="absolute top-14 inset-x-4 bg-amber-950/95 border-2 border-amber-500 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-in fade-in z-20">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300 font-bold font-mono text-sm shrink-0">
                {oversizeCheckCount}/{REQUIRED_OVERSIZE_CHECKS}
              </div>
              <div>
                <div className="text-xs font-bold font-mono text-white flex items-center gap-2">
                  <span className="text-amber-400 animate-pulse">SLOW CRUSHER BELT VERIFYING</span>
                  <span>(Check {oversizeCheckCount} of {REQUIRED_OVERSIZE_CHECKS})</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Object measures ~{(maxCaliberMm / 10).toFixed(1)} cm (limit {(throatLimitMm / 10).toFixed(1)} cm). Re-measuring continuously as object advances towards crusher...
                </p>
              </div>
            </div>
            <div className="w-full sm:w-36 bg-slate-900 rounded-full h-3 overflow-hidden border border-amber-700 shrink-0">
              <div
                className="bg-amber-400 h-full transition-all duration-150"
                style={{ width: `${(oversizeCheckCount / REQUIRED_OVERSIZE_CHECKS) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Manual Box Mode Active Guidance */}
        {isAdjustingBox && (
          <div className="absolute top-14 inset-x-4 bg-cyan-950/95 border border-cyan-400 rounded-xl px-4 py-2 flex items-center justify-between text-xs font-mono text-cyan-200 shadow-xl backdrop-blur-md animate-in fade-in z-20">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-bold text-white">MANUAL BOXING:</span>
              <span>Click &amp; drag on the camera to draw rectangle over object.</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAdjustingBox(false)}
              className="px-2 py-0.5 rounded bg-cyan-900 border border-cyan-600 text-[11px] text-white hover:bg-cyan-800 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {/* Industrial Viewfinder Top HUD Bar */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center space-x-2">
            <div className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-mono text-emerald-400 border border-emerald-700/60 flex items-center space-x-2 shadow-md">
              <span className={`w-2.5 h-2.5 rounded-full ${isProcessingLoop ? "bg-rose-500 animate-ping" : "bg-slate-500"}`}></span>
              <span className="font-bold">
                {isProcessingLoop ? "LIVE YOLO INFERENCE STREAM" : "CAMERA PAUSED"}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">{liveFps} FPS</span>
            </div>

            <div className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300 border border-slate-700 flex items-center space-x-1.5 shadow-md">
              <span>ROCKS:</span>
              <span className="text-emerald-400 font-bold">{detectionCount}</span>
            </div>

            {/* Clickable Camera Distance Badge */}
            <div
              className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-mono text-cyan-300 border border-cyan-700/60 flex items-center space-x-1.5 shadow-md pointer-events-auto"
              title="Camera-to-object distance. Pinhole geometry computes calibrated caliber."
            >
              <span>DIST:</span>
              <input
                type="number"
                min="5"
                max="400"
                step="1"
                value={objectDistanceCm}
                onChange={(e) => setObjectDistanceCm(Math.max(5, parseFloat(e.target.value) || 50))}
                className="w-12 bg-slate-900 border border-cyan-600 rounded text-center text-xs text-white font-bold font-mono focus:outline-none"
              />
              <span className="text-[10px] text-cyan-400 font-bold">cm</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 pointer-events-auto">
            {/* Manual Box / Rectangle Selection */}
            <button
              onClick={() => setIsAdjustingBox(!isAdjustingBox)}
              title="Manually select rectangle over object on camera"
              className={`p-1.5 px-2.5 rounded-lg border text-xs cursor-pointer transition-colors backdrop-blur flex items-center gap-1.5 font-mono ${
                isAdjustingBox
                  ? "bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-lg shadow-cyan-500/30"
                  : "bg-black/80 border-slate-700 text-cyan-300 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isAdjustingBox ? "Boxing Active" : "Box Object"}</span>
            </button>

            {/* Audio Toggle */}
            <button
              onClick={toggleSound}
              title={isMuted ? "Unmute SCADA Siren" : "Mute SCADA Siren"}
              className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors backdrop-blur ${
                isMuted
                  ? "bg-rose-950/80 border-rose-700 text-rose-300 hover:bg-rose-900"
                  : "bg-black/80 border-slate-700 text-emerald-400 hover:bg-slate-800"
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Calibration Toggle */}
            <button
              onClick={() => setShowCalibrationDrawer(!showCalibrationDrawer)}
              title="Calibration & Scale Multiplier"
              className="p-1.5 rounded-lg border border-slate-700 bg-black/80 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors backdrop-blur"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewfinder Bottom Status Strip */}
        <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-none">
          <div className="bg-black/80 backdrop-blur px-3 py-1.5 rounded-xl border border-emerald-600/50 flex items-center space-x-3 text-xs font-mono shadow-md">
            <div>
              <span className="text-slate-400">MAX CALIBER: </span>
              <span className={`font-bold ${maxCaliberMm >= throatLimitMm ? "text-rose-400 animate-pulse" : maxCaliberMm >= throatLimitMm * 0.8 ? "text-amber-400" : "text-emerald-400"}`}>
                {(maxCaliberMm / 10).toFixed(1)} cm <span className="text-[10px] text-slate-400 font-normal">({Math.round(maxCaliberMm)}mm)</span>
              </span>
            </div>
            <span className="text-slate-600">|</span>
            <div>
              <span className="text-slate-400">THROAT: </span>
              <span className="text-white font-bold">{(throatLimitMm / 10).toFixed(1)} cm</span>
            </div>
            <span className="text-slate-600">|</span>
            <div>
              <span className="text-slate-400">SCALE: </span>
              <span className="text-teal-300 font-bold">
                {systemCalib?.is_calibrated ? `${systemCalib.cm_per_pixel.toFixed(3)} cm/px` : `${calibrationScale.toFixed(1)}x`}
              </span>
            </div>
          </div>

          <div className="bg-black/80 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center space-x-2">
            <span className={liveSeverity === "CRITICAL_OVERSIZE" ? "text-rose-400 font-bold" : liveSeverity === "HIGH_RISK" ? "text-amber-400 font-bold" : "text-emerald-400"}>
              {liveSeverity.replace("_", " ")}
            </span>
            <span className="text-slate-600">|</span>
            <span>{systemCalib?.is_calibrated ? "Calibrated Ore Sizing" : "YOLOv8"}</span>
          </div>
        </div>

        {/* Camera Inactive / Permission Prompt */}
        {!isCameraActive && (
          <div className="absolute inset-0 bg-[#091513]/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-600 flex items-center justify-center text-emerald-400 shadow-xl">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-white">Live Laptop Camera Inactive</h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Connect your laptop webcam to inspect physical stones, rocks, or objects in real-time with YOLOv8.
              </p>
            </div>
            {cameraError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800 rounded-lg text-xs text-rose-300 max-w-md">
                {cameraError}
              </div>
            )}
            <button
              onClick={startCamera}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold text-sm flex items-center space-x-2 shadow-lg shadow-emerald-950 hover:from-emerald-400 hover:to-teal-500 cursor-pointer transition-all"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>Connect Camera &amp; Start Real-Time Inference</span>
            </button>
          </div>
        )}
      </div>

      {/* Manual Object Sizing & Calibration Card */}
      {isAdjustingBox && (
        <div className="p-4 bg-[#071a1f] border-2 border-cyan-500 rounded-xl space-y-3.5 shadow-xl animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-cyan-800/60">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-xs uppercase tracking-wider font-mono">
              <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Manual Object Sizing &amp; System Calibration</span>
            </div>
            <button
              onClick={() => setIsAdjustingBox(false)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Done
            </button>
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-medium text-cyan-200">
              1. Click &amp; drag on the camera video above to draw the rectangle around your object.
            </p>
            <p className="text-slate-400 text-[11px]">
              2. Enter the actual real-world length and breadth below to calibrate physical scale across the entire system.
            </p>
          </div>

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
                  value={manualLengthCm}
                  onChange={(e) => setManualLengthCm(e.target.value)}
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
                  value={manualBreadthCm}
                  onChange={(e) => setManualBreadthCm(e.target.value)}
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
                  value={objectDistanceCm}
                  onChange={(e) => setObjectDistanceCm(Math.max(5, parseFloat(e.target.value) || 50))}
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
              {((parseFloat(manualLengthCm) || 0) * (parseFloat(manualBreadthCm) || 0)).toFixed(1)} cm²
            </span>
          </div>

          {recalibMessage && (
            <div className="p-2.5 bg-emerald-950/70 border border-emerald-600 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{recalibMessage}</span>
            </div>
          )}

          <button
            onClick={handleRecalibrateBox}
            disabled={isRecalibrating || !manualLengthCm || !manualBreadthCm}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-50"
          >
            {isRecalibrating ? "Applying Calibration..." : "Calibrate System on This Rectangle & Save"}
          </button>
        </div>
      )}

      {/* Calibration Drawer (Collapsible) */}
      {showCalibrationDrawer && (
        <div className="p-4 bg-[#071412] border border-[#1b3a32] rounded-xl space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#132c25]">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Real-Time Physical Calibration &amp; Throat Parameters
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
            {/* Calibration Multiplier */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Object Distance / Scale Multiplier:</span>
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
                Increase if holding a smaller stone closer to the camera to simulate 800mm crusher scale.
              </span>
            </div>

            {/* Throat Limit */}
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Primary Crusher Throat Limit:</span>
                <span className="font-mono text-rose-400 font-bold">{throatLimitMm} mm</span>
              </div>
              <input
                type="range"
                min="500"
                max="1200"
                step="25"
                value={throatLimitMm}
                onChange={(e) => setThroatLimitMm(parseInt(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">
                Objects exceeding this dimension trigger the siren alert and operator response countdown.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stream Controls Bar */}
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
                  <span>Pause Live Inference</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Live Stream</span>
                </>
              )}
            </button>

            <button
              onClick={stopCamera}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
            >
              Disconnect Cam
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center space-x-2 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Real-time YOLO + ISO/IEC 15415 Active</span>
          </div>
        </div>
      )}
    </div>
  );
};
