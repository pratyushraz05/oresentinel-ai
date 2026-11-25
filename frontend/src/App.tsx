import { useState, useEffect } from "react";
import { Ruler, Zap } from "lucide-react";
import { Header } from "./components/Header";
import { FlagshipDemo } from "./components/FlagshipDemo";
import { DashboardView } from "./components/DashboardView";
import { IncidentLedger } from "./components/IncidentLedger";
import { AnalyticsView } from "./components/AnalyticsView";
import { CopilotView } from "./components/CopilotView";
import { SettingsModal } from "./components/SettingsModal";
import { RoomScaleView } from "./views/RoomScaleView";
import { MeasurementView } from "./views/MeasurementView";
import type {
  Incident, DashboardSummary, DashboardTrends, SpecimenFixture, PlantConfig
} from "./types";
import {
  fetchSummary, fetchTrends, fetchIncidents, fetchFixtures, fetchPlantConfig,
  fetchSystemCalibrationStatus, type SystemCalibrationStatus
} from "./api";

export function App() {
  const [activeTab, setActiveTab] = useState<string>("flagship");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [fixtures, setFixtures] = useState<SpecimenFixture[]>([]);
  const [plantConfig, setPlantConfig] = useState<PlantConfig | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [copilotQueryIncident, setCopilotQueryIncident] = useState<string>("");
  const [systemCalibration, setSystemCalibration] = useState<SystemCalibrationStatus | null>(null);
  const [dismissCalibBanner, setDismissCalibBanner] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const [sumRes, trRes, incRes, fixRes, confRes, calibRes] = await Promise.all([
        fetchSummary(),
        fetchTrends(),
        fetchIncidents(),
        fetchFixtures(),
        fetchPlantConfig(),
        fetchSystemCalibrationStatus().catch(() => null),
      ]);
      setSummary(sumRes);
      setTrends(trRes);
      setIncidents(incRes);
      setFixtures(fixRes);
      setPlantConfig(confRes);
      if (calibRes) {
        setSystemCalibration(calibRes);
      }
    } catch (err) {
      console.error("Error loading plant data:", err);
    }
  };

  useEffect(() => {
    loadData();
    // Poll updates every 15s for live operational feed feel
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenCopilot = (incidentNumber: string) => {
    setCopilotQueryIncident(incidentNumber);
    setActiveTab("copilot");
  };

  const handleSelectIncidentFromDashboard = (inc: Incident) => {
    setSelectedIncident(inc);
    setActiveTab("ledger");
  };

  const handleOpen9StepWithSpecimen = (_specimenId: string) => {
    setActiveTab("flagship");
  };

  return (
    <div className="min-h-screen bg-[#07100e] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Industrial Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        summary={summary}
        onOpenSettings={() => setIsSettingsOpen(true)}
        systemCalibration={systemCalibration}
      />

      {/* Step 1 Required: Calibration First Callout Banner */}
      {!systemCalibration?.is_calibrated && !dismissCalibBanner && (
        <div className="bg-gradient-to-r from-amber-950/90 via-[#181a0e] to-[#071311] border-b-2 border-amber-500/80 px-6 py-3 shadow-lg">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0">
                <Ruler className="w-5 h-5 text-amber-400 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Step 1 Required: Camera Calibration</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] text-amber-300 font-mono font-bold">
                    GLOBAL PHYSICAL SCALE
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Calibrate your camera once with a known object. The system saves this scale and applies it everywhere for measuring ore on conveyor belts, specimens, and live feeds.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <button
                onClick={() => setActiveTab("measurement")}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Calibrate Camera Now</span>
              </button>
              <button
                onClick={() => setDismissCalibBanner(true)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "flagship" && (
          <FlagshipDemo
            fixtures={fixtures}
            onIncidentUpdated={loadData}
            onOpenCopilotWithIncident={handleOpenCopilot}
          />
        )}

        {activeTab === "dashboard" && (
          <DashboardView
            summary={summary}
            incidents={incidents}
            onSelectIncident={handleSelectIncidentFromDashboard}
            onOpen9StepWithSpecimen={handleOpen9StepWithSpecimen}
            onIncidentUpdated={loadData}
          />
        )}

        {activeTab === "ledger" && (
          <IncidentLedger
            incidents={incidents}
            onRefresh={loadData}
            onOpenCopilot={handleOpenCopilot}
            selectedIncident={selectedIncident}
            onSelectIncident={setSelectedIncident}
          />
        )}

        {activeTab === "analytics" && (
          <AnalyticsView summary={summary} trends={trends} />
        )}

        {activeTab === "copilot" && (
          <CopilotView
            initialIncidentQuery={copilotQueryIncident}
            onSelectIncidentNumber={(num) => {
              const match = incidents.find((i) => i.incident_number === num);
              if (match) {
                setSelectedIncident(match);
                setActiveTab("ledger");
              }
            }}
          />
        )}

        {activeTab === "roomscale" && (
          <RoomScaleView />
        )}

        {activeTab === "measurement" && (
          <MeasurementView onCalibrationUpdated={loadData} />
        )}
      </main>

      {/* Footer Industrial Disclaimer - Directly from Slide 06 */}
      <footer className="border-t border-[#122823] bg-[#050c0b] py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            OreSentinel AI &bull; Concept &amp; Prototype Architecture for Tata Steel / Women of Mettle 2026
          </span>
          <span className="text-[11px] text-slate-600">
            Responsible Scope: OreSentinel supports human decisions. It does not automatically control machinery.
          </span>
        </div>
      </footer>

      {/* Plant Configuration & Calibration Modal */}
      {plantConfig && (
        <SettingsModal
          config={plantConfig}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onConfigUpdated={(newConf) => {
            setPlantConfig(newConf);
            loadData();
          }}
        />
      )}
    </div>
  );
}

export default App;
