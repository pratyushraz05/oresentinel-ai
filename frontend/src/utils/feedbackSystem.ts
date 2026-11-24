/**
 * Feedback System - Handles user corrections and training data storage
 * Uses IndexedDB for client-side persistence
 */

import type { Measurement, Correction, MeasurementStats } from "../types";

const DB_NAME = "OreSentinelMeasurements";
const DB_VERSION = 1;
const STORE_MEASUREMENTS = "measurements";
const STORE_CORRECTIONS = "corrections";
const STORE_CALIBRATIONS = "calibrations";

interface StoredMeasurement extends Measurement {
  synced: boolean;
}

interface StoredCorrection extends Correction {
  synced: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_MEASUREMENTS)) {
        const store = db.createObjectStore(STORE_MEASUREMENTS, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("cameraId", "cameraId", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CORRECTIONS)) {
        const store = db.createObjectStore(STORE_CORRECTIONS, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("cameraId", "cameraId", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("userVerified", "userVerified", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CALIBRATIONS)) {
        db.createObjectStore(STORE_CALIBRATIONS, { keyPath: "cameraId" });
      }
    };
  });

  return dbPromise;
}

/**
 * Generic store operations
 */
async function addToStore<T extends { id: string } | { cameraId: string }>(
  storeName: string,
  item: T
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getFromStore<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromIndex<T>(
  storeName: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===== Measurements =====

export async function saveMeasurement(measurement: Measurement): Promise<void> {
  const stored: StoredMeasurement = { ...measurement, synced: false };
  await addToStore(STORE_MEASUREMENTS, stored);
}

export async function getMeasurement(id: string): Promise<Measurement | undefined> {
  return getFromStore<StoredMeasurement>(STORE_MEASUREMENTS, id);
}

export async function getAllMeasurements(): Promise<Measurement[]> {
  return getAllFromStore<StoredMeasurement>(STORE_MEASUREMENTS);
}

export async function getMeasurementsByCamera(cameraId: string): Promise<Measurement[]> {
  return getFromIndex<StoredMeasurement>(STORE_MEASUREMENTS, "cameraId", cameraId);
}

export async function markMeasurementSynced(id: string): Promise<void> {
  const measurement = await getMeasurement(id);
  if (measurement) {
    await addToStore(STORE_MEASUREMENTS, { ...measurement, synced: true });
  }
}

export async function deleteMeasurement(id: string): Promise<void> {
  await deleteFromStore(STORE_MEASUREMENTS, id);
}

// ===== Corrections =====

export async function saveCorrection(correction: Correction): Promise<void> {
  const stored: StoredCorrection = { ...correction, synced: false };
  await addToStore(STORE_CORRECTIONS, stored);
}

export async function getCorrection(id: string): Promise<Correction | undefined> {
  return getFromStore<StoredCorrection>(STORE_CORRECTIONS, id);
}

export async function getAllCorrections(): Promise<Correction[]> {
  return getAllFromStore<StoredCorrection>(STORE_CORRECTIONS);
}

export async function getCorrectionsByCamera(cameraId: string): Promise<Correction[]> {
  return getFromIndex<StoredCorrection>(STORE_CORRECTIONS, "cameraId", cameraId);
}

export async function getVerifiedCorrections(): Promise<Correction[]> {
  return getFromIndex<StoredCorrection>(STORE_CORRECTIONS, "userVerified", true as unknown as IDBValidKey);
}

export async function markCorrectionSynced(id: string): Promise<void> {
  const correction = await getCorrection(id);
  if (correction) {
    await addToStore(STORE_CORRECTIONS, { ...correction, synced: true });
  }
}

export async function deleteCorrection(id: string): Promise<void> {
  await deleteFromStore(STORE_CORRECTIONS, id);
}

// ===== Calibrations =====

export interface StoredCalibration {
  cameraId: string;
  data: any;
  savedAt: string;
}

export async function saveCalibration(cameraId: string, data: any): Promise<void> {
  await addToStore(STORE_CALIBRATIONS, {
    cameraId,
    data,
    savedAt: new Date().toISOString(),
  });
}

export async function getCalibration(cameraId: string): Promise<any | undefined> {
  const stored = await getFromStore<StoredCalibration>(STORE_CALIBRATIONS, cameraId);
  return stored?.data;
}

export async function deleteCalibration(cameraId: string): Promise<void> {
  await deleteFromStore(STORE_CALIBRATIONS, cameraId);
}

// ===== Statistics =====

export async function computeLocalStats(): Promise<MeasurementStats> {
  const corrections = await getAllCorrections();
  const verified = corrections.filter((c) => c.userVerified);

  if (verified.length === 0) {
    return {
      totalMeasurements: corrections.length,
      verifiedMeasurements: 0,
      meanAbsoluteErrorMm: 0,
      meanAbsolutePercentError: 0,
      byObjectType: {},
    };
  }

  const errors = verified.map((c) => ({
    width: c.errorWidthMm,
    height: c.errorHeightMm,
    percent: c.errorPercent,
  }));

  const mae = errors.reduce((sum, e) => sum + (e.width + e.height) / 2, 0) / errors.length;
  const mape = errors.reduce((sum, e) => sum + e.percent, 0) / errors.length;

  // Group by detection model (as proxy for object type)
  const byModel: Record<string, { count: number; mae: number }> = {};
  for (const c of verified) {
    const model = c.detection.model_name || "unknown";
    if (!byModel[model]) byModel[model] = { count: 0, mae: 0 };
    byModel[model].count++;
    byModel[model].mae += (c.errorWidthMm + c.errorHeightMm) / 2;
  }
  for (const m of Object.values(byModel)) {
    m.mae = m.mae / m.count;
  }

  return {
    totalMeasurements: corrections.length,
    verifiedMeasurements: verified.length,
    meanAbsoluteErrorMm: mae,
    meanAbsolutePercentError: mape,
    byObjectType: byModel,
  };
}

// ===== Export for Training =====

export interface TrainingExample {
  imageDataUrl: string;
  bbox: [number, number, number, number];
  classId: number;
  className: string;
  widthMm: number;
  heightMm: number;
  calibrationScale: number;
  mmPerPixel: number;
  timestamp: string;
}

export async function getTrainingExamples(): Promise<TrainingExample[]> {
  const corrections = await getVerifiedCorrections();

  return corrections.map((c) => ({
    imageDataUrl: c.imageDataUrl,
    bbox: c.bbox,
    classId: 0, // Default to first class (rock/boulder)
    className: "rock",
    widthMm: c.actualWidthMm,
    heightMm: c.actualHeightMm,
    calibrationScale: c.calibrationScale,
    mmPerPixel: c.predictedWidthMm / (c.bbox[2] * 640), // Approximate
    timestamp: c.timestamp,
  }));
}

export async function exportTrainingDataJSON(): Promise<string> {
  const examples = await getTrainingExamples();
  const stats = await computeLocalStats();

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      stats,
      examples,
    },
    null,
    2
  );
}

export async function exportYOLOFormat(): Promise<{
  images: { filename: string; dataUrl: string }[];
  labels: { filename: string; content: string }[];
}> {
  const examples = await getTrainingExamples();
  const images: { filename: string; dataUrl: string }[] = [];
  const labels: { filename: string; content: string }[] = [];

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const filename = `train_${ex.timestamp.replace(/[:.]/g, "-")}_${i}.jpg`;
    const labelFilename = `train_${ex.timestamp.replace(/[:.]/g, "-")}_${i}.txt`;

    // YOLO format: class_id x_center y_center width height (normalized)
    const [nx, ny, nw, nh] = ex.bbox;
    const labelLine = `${ex.classId} ${nx.toFixed(6)} ${ny.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}`;

    images.push({ filename, dataUrl: ex.imageDataUrl });
    labels.push({ filename: labelFilename, content: labelLine });
  }

  return { images, labels };
}

// ===== Cleanup =====

export async function clearAllData(): Promise<void> {
  await Promise.all([
    clearStore(STORE_MEASUREMENTS),
    clearStore(STORE_CORRECTIONS),
    clearStore(STORE_CALIBRATIONS),
  ]);
}

export async function getStorageInfo(): Promise<{
  measurements: number;
  corrections: number;
  verifiedCorrections: number;
  calibrations: number;
}> {
  const [measurements, corrections, verified, calibrations] = await Promise.all([
    getAllMeasurements(),
    getAllCorrections(),
    getVerifiedCorrections(),
    getAllFromStore<StoredCalibration>(STORE_CALIBRATIONS),
  ]);

  return {
    measurements: measurements.length,
    corrections: corrections.length,
    verifiedCorrections: verified.length,
    calibrations: calibrations.length,
  };
}