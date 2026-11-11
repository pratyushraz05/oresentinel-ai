import React, { useState, useEffect } from 'react';
import { Camera, Database, Zap } from 'lucide-react';
import { RoomScaleCapture } from '../components/RoomScaleCapture';

interface DatasetStats {
  train_images: number;
  val_images: number;
  total_images: number;
  calibration_mm_per_pixel: number;
  model_exists: boolean;
}

export const RoomScaleView: React.FC = () => {
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Load dataset stats
  useEffect(() => {
    fetch('http://localhost:8000/api/roomscale/dataset-stats')
      .then(r => r.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load stats:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="w-7 h-7 text-emerald-400" />
            RoomScale AI
          </h2>
          <p className="text-slate-400 mt-1">Capture & measure objects in your room</p>
        </div>
        
        {stats && !loading && (
          <div className="flex items-center gap-4 text-sm">
            <div className="px-4 py-2 bg-[#091513] border border-emerald-800 rounded-lg">
              <span className="text-slate-400">Dataset:</span>
              <span className="text-emerald-400 font-mono font-bold ml-2">{stats.total_images}</span>
              <span className="text-slate-500 ml-1">images</span>
            </div>
            <div className="px-4 py-2 bg-[#091513] border border-teal-800 rounded-lg">
              <span className="text-slate-400">Scale:</span>
              <span className="text-teal-400 font-mono font-bold ml-2">{stats.calibration_mm_per_pixel?.toFixed(3)}</span>
              <span className="text-slate-500 ml-1">mm/px</span>
            </div>
          </div>
        )}
      </div>

      {/* Photo Capture Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera Capture Panel */}
        <div className="bg-[#091513] border border-emerald-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            Capture Training Photos
          </h3>
          
          <RoomScaleCapture 
            onCapture={() => {
              // Refresh stats after capture
              setTimeout(() => {
                fetch('http://localhost:8000/api/roomscale/dataset-stats')
                  .then(r => r.json())
                  .then(data => setStats(data));
              }, 1000);
            }}
          />
        </div>

        {/* Info Panel */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-[#091513] border border-emerald-800 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              Quick Actions
            </h3>
            
            <div className="space-y-3">
              <button
                onClick={() => window.open('http://localhost:8000/api/roomscale/dataset-stats', '_blank')}
                className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-left text-sm transition-colors"
              >
                View Dataset Statistics
              </button>
              
              <button
                onClick={() => {
                  if (confirm('Retrain the model with current data?\nThis will take a few minutes.')) {
                    alert('Run this command in terminal:\npython ml/train_roomscale.py --mm-per-pixel 0.2734');
                  }
                }}
                className="w-full px-4 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-left text-sm transition-colors"
              >
                Retrain Model
              </button>
              
              <button
                onClick={() => window.open('http://localhost:8000/docs', '_blank')}
                className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-left text-sm transition-colors"
              >
                API Documentation
              </button>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-[#091513] border border-slate-800 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-3">How It Works</h3>
            <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
              <li>Capture photos of objects around you</li>
              <li>Model auto-labels each photo</li>
              <li>Photos added to training dataset</li>
              <li>Retrain model with new data</li>
              <li>Measure objects using webcam</li>
            </ol>
          </div>

          {/* Target Objects */}
          <div className="bg-[#091513] border border-slate-800 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-3">Target Objects</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['Phone', 'Laptop', 'Book', 'Mug', 'Bottle', 'Mouse', 'Keyboard', 'Monitor', 'Cup', 'Remote'].map(obj => (
                <div key={obj} className="px-3 py-2 bg-slate-900 rounded text-slate-300">
                  {obj}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Training Status */}
      {!loading && stats && (
        <div className="bg-[#091513] border border-emerald-800 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-3">Training Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-slate-400">Train Images</div>
              <div className="text-emerald-400 font-bold text-xl">{stats.train_images}</div>
            </div>
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-slate-400">Val Images</div>
              <div className="text-teal-400 font-bold text-xl">{stats.val_images}</div>
            </div>
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-slate-400">Total</div>
              <div className="text-white font-bold text-xl">{stats.total_images}</div>
            </div>
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-slate-400">Model</div>
              <div className={`${stats.model_exists ? 'text-emerald-400' : 'text-rose-400'} font-bold`}>
                {stats.model_exists ? '✓ Ready' : '✗ Missing'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
