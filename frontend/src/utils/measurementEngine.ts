/**
 * Measurement Engine - Core logic for camera-based object measurement
 * Handles calibration, pixel-to-mm conversion, and confidence calculation
 */

import type {
  RealtimeDetectionBox,
  CameraCalibrationData,
  Measurement
} from "../types";

export interface MeasurementConfig {
  calibrationScale: number;
  throatLimitMm: number;
  cameraId: string;
  calibration?: CameraCalibrationData;
  imageWidth: number;
  imageHeight: number;
}

export interface MeasurementResult {
  widthMm: number;
  heightMm: number;
  majorAxisMm: number;
  minorAxisMm: number;
  confidence: number;
  uncertaintyMm: number;
  isCalibrated: boolean;
}

/**
 * Convert normalized bbox to pixel coordinates
 */
export function denormalizeBbox(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; w: number; h: number } {
  const [nx, ny, nw, nh] = bbox;
  return {
    x: nx * imageWidth,
    y: ny * imageHeight,
    w: nw * imageWidth,
    h: nh * imageHeight,
  };
}

/**
 * Calculate measurement using homography (perspective-correct)
 */
export function measureWithHomography(
  bbox: [number, number, number, number],
  calibration: CameraCalibrationData,
  imageWidth: number,
  imageHeight: number
): { widthMm: number; heightMm: number; majorAxisMm: number; minorAxisMm: number } {
  const { x, y, w, h } = denormalizeBbox(bbox, imageWidth, imageHeight);

  // Four corners of bbox in pixel coordinates (center format to corner format)
  const cx = x + w / 2;
  const cy = y + h / 2;

  const cornersPx = [
    [cx - w / 2, cy - h / 2], // top-left
    [cx + w / 2, cy - h / 2], // top-right
    [cx + w / 2, cy + h / 2], // bottom-right
    [cx - w / 2, cy + h / 2], // bottom-left
  ];

  // Apply homography transformation
  const H = calibration.homographyMatrix || (calibration as any).homography_matrix;
  if (!H || H.length < 3 || !H[0] || H[0].length < 3) {
    const mmPx = (calibration.mmPerPixelAvg ?? (calibration as any).mm_per_pixel_avg) || 1.0;
    const widthMm = Math.round(w * mmPx * 10) / 10;
    const heightMm = Math.round(h * mmPx * 10) / 10;
    return { widthMm, heightMm, majorAxisMm: Math.max(widthMm, heightMm), minorAxisMm: Math.min(widthMm, heightMm) };
  }
  const cornersMm = cornersPx.map(([px, py]) => {
    const x = H[0][0] * px + H[0][1] * py + H[0][2];
    const y = H[1][0] * px + H[1][1] * py + H[1][2];
    const w = H[2][0] * px + H[2][1] * py + H[2][2] || 1.0;
    return [x / w, y / w];
  });

  // Calculate dimensions in mm
  const widths = [
    distance(cornersMm[0], cornersMm[1]),
    distance(cornersMm[3], cornersMm[2]),
  ];
  const heights = [
    distance(cornersMm[0], cornersMm[3]),
    distance(cornersMm[1], cornersMm[2]),
  ];

  const rawWidthMm = (widths[0] + widths[1]) / 2;
  const rawHeightMm = (heights[0] + heights[1]) / 2;
  const widthMm = Number.isFinite(rawWidthMm) ? Math.round(rawWidthMm * 10) / 10 : 0;
  const heightMm = Number.isFinite(rawHeightMm) ? Math.round(rawHeightMm * 10) / 10 : 0;
  const majorAxisMm = Math.max(widthMm, heightMm);
  const minorAxisMm = Math.min(widthMm, heightMm);

  return { widthMm, heightMm, majorAxisMm, minorAxisMm };
}

/**
 * Calculate measurement using simple scale factor (fallback)
 */
export function measureWithScale(
  detection: RealtimeDetectionBox,
  config: MeasurementConfig
): { widthMm: number; heightMm: number; majorAxisMm: number; minorAxisMm: number } {
  const { calibrationScale = 1.0, calibration, imageWidth = 1280, imageHeight = 720 } = config;

  // Use calibrated mm_per_pixel if available, otherwise fallback
  let mmPerPixel: number;
  const avg = calibration?.mmPerPixelAvg ?? (calibration as any)?.mm_per_pixel_avg;
  if (typeof avg === "number" && !isNaN(avg) && avg > 0) {
    mmPerPixel = avg;
  } else {
    // Fallback: assume conveyor width spans image width
    mmPerPixel = (1600 / (imageWidth || 1280)) * (calibrationScale || 1.0);
  }

  const { w, h } = denormalizeBbox(detection.bbox, imageWidth, imageHeight);
  const rawWidthMm = w * mmPerPixel;
  const rawHeightMm = h * mmPerPixel;
  const widthMm = Number.isFinite(rawWidthMm) ? Math.round(rawWidthMm * 10) / 10 : 0;
  const heightMm = Number.isFinite(rawHeightMm) ? Math.round(rawHeightMm * 10) / 10 : 0;
  const majorAxisMm = Math.max(widthMm, heightMm);
  const minorAxisMm = Math.min(widthMm, heightMm);

  return { widthMm, heightMm, majorAxisMm, minorAxisMm };
}

/**
 * Main measurement function - uses best available method
 */
export function measureObject(
  detection: RealtimeDetectionBox,
  config: MeasurementConfig
): MeasurementResult {
  const isCalibrated = !!config.calibration;

  let measurement: { widthMm: number; heightMm: number; majorAxisMm: number; minorAxisMm: number };

  const H = config.calibration?.homographyMatrix || (config.calibration as any)?.homography_matrix;
  if (isCalibrated && H && H.length >= 3) {
    measurement = measureWithHomography(detection.bbox, config.calibration!, config.imageWidth, config.imageHeight);
  } else {
    measurement = measureWithScale(detection, config);
  }

  // Calculate confidence based on multiple factors
  const detectionConfidence = detection.confidence;
  const calibrationQuality = isCalibrated ? 1.0 : 0.7;
  const sizeFactor = Math.min(1.0, (measurement.majorAxisMm / 100) * 0.5); // Lower confidence for very small objects
  const visibilityFactor = Math.min(1.0, detection.bbox[2] * detection.bbox[3] * 4); // Based on bbox area

  const confidence = detectionConfidence * calibrationQuality * sizeFactor * visibilityFactor;

  // Estimate uncertainty (simplified)
  const baseUncertainty = isCalibrated ? 5 : 15; // mm
  const scaleUncertainty = measurement.majorAxisMm * 0.03; // 3% of measurement
  const uncertaintyMm = Math.sqrt(baseUncertainty ** 2 + scaleUncertainty ** 2);

  return {
    ...measurement,
    confidence: Math.min(1.0, Math.max(0.1, confidence)),
    uncertaintyMm,
    isCalibrated,
  };
}

/**
 * Create a Measurement record from detection and config
 */
export function createMeasurement(
  detection: RealtimeDetectionBox,
  config: MeasurementConfig,
  imageDataUrl: string
): Measurement {
  const result = measureObject(detection, config);

  return {
    id: `meas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    imageDataUrl,
    bbox: detection.bbox,
    predictedWidthMm: result.widthMm,
    predictedHeightMm: result.heightMm,
    confidence: result.confidence,
    calibrationScale: config.calibrationScale,
    throatLimitMm: config.throatLimitMm,
    cameraId: config.cameraId,
    detection,
  };
}

/**
 * Calculate measurement error between predicted and actual
 */
export function calculateError(
  predicted: { width: number; height: number },
  actual: { width: number; height: number }
): { widthMm: number; heightMm: number; percent: number } {
  const errorWidth = Math.abs(predicted.width - actual.width);
  const errorHeight = Math.abs(predicted.height - actual.height);
  const avgPredicted = (predicted.width + predicted.height) / 2;
  const avgActual = (actual.width + actual.height) / 2;
  const percent = avgPredicted > 0 ? (Math.abs(avgPredicted - avgActual) / avgActual) * 100 : 0;

  return {
    widthMm: errorWidth,
    heightMm: errorHeight,
    percent,
  };
}

/**
 * Distance between two points
 */
function distance(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

export function mmToCm(mm: number): number {
  if (!Number.isFinite(mm) || isNaN(mm)) return 0;
  return Math.round((mm / 10.0) * 10) / 10;
}

export function cmToMm(cm: number): number {
  if (!Number.isFinite(cm) || isNaN(cm)) return 0;
  return Math.round(cm * 10.0 * 10) / 10;
}

export function formatCm(mm: number): string {
  return formatMeasurement(mm, "cm");
}

/**
 * Format measurement for display
 */
export function formatMeasurement(mm: number, unit: "mm" | "cm" | "m" = "mm"): string {
  const val = Number.isFinite(mm) && !isNaN(mm) ? mm : 0;
  switch (unit) {
    case "cm":
      return `${(val / 10).toFixed(1)} cm`;
    case "m":
      return `${(val / 1000).toFixed(3)} m`;
    default:
      return `${val.toFixed(1)} mm`;
  }
}

/**
 * Get severity label for measurement
 */
export function getSeverityLabel(
  majorAxisMm: number,
  throatLimitMm: number,
  warningThresholdMm: number
): { label: string; color: string; bgColor: string } {
  if (majorAxisMm >= throatLimitMm) {
    return { label: "OVERSIZE", color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.15)" };
  }
  if (majorAxisMm >= warningThresholdMm) {
    return { label: "NEAR LIMIT", color: "#f59e0b", bgColor: "rgba(245, 158, 11, 0.15)" };
  }
  return { label: "NORMAL", color: "#10b981", bgColor: "rgba(16, 185, 129, 0.15)" };
}

/**
 * Default reference objects for calibration
 */
export const REFERENCE_OBJECTS = [
  { name: "Credit Card (ISO 7810)", widthMm: 85.6, heightMm: 53.98, description: "Standard credit/debit card" },
  { name: "A4 Paper", widthMm: 210, heightMm: 297, description: "Standard A4 sheet" },
  { name: "US Letter Paper", widthMm: 215.9, heightMm: 279.4, description: "US Letter size" },
  { name: "iPhone 15 Pro", widthMm: 70.6, heightMm: 146.6, description: "iPhone 15 Pro dimensions" },
  { name: "ArUco Marker (100mm)", widthMm: 100, heightMm: 100, description: "Printed ArUco marker" },
  { name: "Custom", widthMm: 0, heightMm: 0, description: "Enter custom dimensions" },
] as const;