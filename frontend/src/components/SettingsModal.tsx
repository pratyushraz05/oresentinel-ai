import React, { useState } from "react";
import { Sliders, X, Check, RefreshCw } from "lucide-react";
import type { PlantConfig } from "../types";
import { updatePlantConfig } from "../api";

interface SettingsModalProps {
  config: PlantConfig;
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: (newConfig: PlantConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [formData, setFormData] = useState<PlantConfig>({ ...config });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await updatePlantConfig(formData);
      onConfigUpdated(res.config);
      onClose();
    } catch (err) {
      alert("Failed to update config: " + err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0a1815] border border-emerald-600/50 rounded-2xl max-w-xl w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-[#16362e]">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white font-mono">
              PLANT CRUSHER CALIBRATION &amp; RISK RULES
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#122c25] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs font-sans">
          <div>
            <label className="text-slate-300 block mb-1 font-medium">
              Crusher Throat Opening Limit (mm):
            </label>
            <input
              type="number"
              value={formData.throat_limit_mm}
              onChange={(e) =>
                setFormData({ ...formData, throat_limit_mm: parseFloat(e.target.value) || 0 })
              }
              className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Boulders with major axis exceeding this value trigger CRITICAL_OVERSIZE alarm.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 block mb-1 font-medium">
                Warning Threshold (mm):
              </label>
              <input
                type="number"
                value={formData.warning_threshold_mm}
                onChange={(e) =>
                  setFormData({ ...formData, warning_threshold_mm: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-slate-300 block mb-1 font-medium">
                Conveyor Belt Width (mm):
              </label>
              <input
                type="number"
                value={formData.conveyor_width_mm}
                onChange={(e) =>
                  setFormData({ ...formData, conveyor_width_mm: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 block mb-1 font-medium">
                Hourly Downtime Stoppage Cost (INR):
              </label>
              <input
                type="number"
                value={formData.hourly_downtime_cost}
                onChange={(e) =>
                  setFormData({ ...formData, hourly_downtime_cost: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-slate-300 block mb-1 font-medium">
                Target Response Lead Time (sec):
              </label>
              <input
                type="number"
                value={formData.lead_time_target_sec}
                onChange={(e) =>
                  setFormData({ ...formData, lead_time_target_sec: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-[#071311] border border-[#1b3b33] rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#16362e] flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#0e241f] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
