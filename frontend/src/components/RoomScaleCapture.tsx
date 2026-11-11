import React, { useRef, useState } from 'react';
import { Camera, Download, Save, CheckCircle2, Loader } from 'lucide-react';

interface PhotoCaptureProps {
  onCapture?: (snapshotUrl: string) => void;
}

export const RoomScaleCapture: React.FC<PhotoCaptureProps> = ({ onCapture }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [captureCount, setCaptureCount] = useState(0);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      alert('Could not access camera. Please allow camera permissions.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  // Capture snapshot
  const captureSnapshot = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame
    ctx.drawImage(video, 0, 0);
    
    // Add watermark
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, canvas.height - 30, canvas.width, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(`RoomScale AI | Capture #${captureCount + 1} | ${new Date().toLocaleTimeString()}`, 10, canvas.height - 10);

    // Get blob for upload
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      const url = URL.createObjectURL(blob);
      setLastCapture(url);
      
      // Upload to backend
      await uploadToBackend(blob);
      
      if (onCapture) {
        onCapture(url);
      }
    }, 'image/jpeg', 0.9);
  };

  // Upload to backend
  const uploadToBackend = async (blob: Blob) => {
    setUploadStatus('loading');
    
    try {
      const formData = new FormData();
      formData.append('file', blob, `capture_${Date.now()}.jpg`);
      
      const response = await fetch('http://localhost:8000/api/roomscale/capture-snapshot', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      setUploadStatus('success');
      setCaptureCount(prev => prev + 1);
      
      console.log('Capture saved:', data);
      alert(`Saved! Objects detected: ${data.detections}\nTotal dataset: ${data.dataset_stats.total} images\n\nRun retrain: python ml/train_roomscale.py`);
      
    } catch (err) {
      console.error('Upload error:', err);
      setUploadStatus('error');
      alert('Failed to save to training dataset. Image saved locally only.');
    } finally {
      setTimeout(() => setUploadStatus('idle'), 2000);
    }
  };

  // Download snapshot
  const downloadSnapshot = () => {
    if (!lastCapture) return;
    const link = document.createElement('a');
    link.href = lastCapture;
    link.download = `room_scale_capture_${Date.now()}.jpg`;
    link.click();
  };

  return (
    <div className="p-4 bg-[#091513] border border-emerald-800 rounded-xl">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <Camera className="w-5 h-5 text-emerald-400" />
        RoomScale Photo Capture
      </h3>

      <div className="space-y-3">
        {/* Camera preview */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-700">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isCameraActive ? '' : 'hidden'}`}
          />
          
          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <Camera className="w-12 h-12 opacity-50" />
              <p className="text-sm">Camera inactive</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Start Camera
              </button>
            </div>
          )}

          {/* Capture overlay */}
          {isCameraActive && (
            <div className="absolute bottom-3 left-3 right-3 flex justify-center">
              <button
                onClick={captureSnapshot}
                disabled={capturing}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
              >
                {capturing ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Capturing...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Capture &amp; Save
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Hidden canvas for processing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Status info */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Captures: <span className="text-emerald-400 font-mono">{captureCount}</span></span>
          {uploadStatus === 'success' && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Saved to dataset
            </span>
          )}
          {uploadStatus === 'error' && (
            <span className="text-rose-400">Upload failed</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isCameraActive && (
            <button
              onClick={stopCamera}
              className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Stop Camera
            </button>
          )}
          {lastCapture && (
            <button
              onClick={downloadSnapshot}
              className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="p-3 bg-[#071412] border border-slate-800 rounded-lg text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">Instructions:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Position object in frame (center it)</li>
            <li>Click "Capture & Save" to save to dataset</li>
            <li>Auto-labeled with YOLO model</li>
            <li>Run <code className="bg-slate-800 px-1 rounded">python ml/train_roomscale.py</code> to retrain</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
