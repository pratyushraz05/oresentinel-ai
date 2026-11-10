import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { FlagshipDemo } from "./components/FlagshipDemo";
import { DashboardView } from "./components/DashboardView";
import { IncidentLedger } from "./components/IncidentLedger";
import { AnalyticsView } from "./components/AnalyticsView";
import { CopilotView } from "./components/CopilotView";
import { SettingsModal } from "./components/SettingsModal";
import type {
  Incident, DashboardSummary, DashboardTrends, SpecimenFixture, PlantConfig
} from "./types";
import {
  fetchSummary, fetchTrends, fetchIncidents, fetchFixtures, fetchPlantConfig
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

  const loadData = async () => {
    try {
      const [sumRes, trRes, incRes, fixRes, confRes] = await Promise.all([
        fetchSummary(),
        fetchTrends(),
        fetchIncidents(),
        fetchFixtures(),
        fetchPlantConfig(),
      ]);
      setSummary(sumRes);
      setTrends(trRes);
      setIncidents(incRes);
      setFixtures(fixRes);
      setPlantConfig(confRes);
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
      />

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
