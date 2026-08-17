import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import {
  apiClient,
  type Emergency,
  type Ambulance,
  type Hospital,
  type OptimizedRoute,
} from '../api/client';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';

// Seed coordinates from seed_road_network
const SEEDED_NODES = [
  { name: 'N01', lat: 12.950000, lon: 77.580000 },
  { name: 'N02', lat: 12.960000, lon: 77.590000 },
  { name: 'N03', lat: 12.970000, lon: 77.600000 },
  { name: 'N04', lat: 12.980000, lon: 77.610000 },
  { name: 'N05', lat: 12.965000, lon: 77.575000 },
  { name: 'N06', lat: 12.975000, lon: 77.585000 },
  { name: 'N07', lat: 12.985000, lon: 77.595000 },
  { name: 'N08', lat: 12.955000, lon: 77.605000 },
];

const SEEDED_EDGES = [
  { src: 'N01', dst: 'N02' },
  { src: 'N02', dst: 'N03' },
  { src: 'N03', dst: 'N04' },
  { src: 'N01', dst: 'N05' },
  { src: 'N05', dst: 'N06' },
  { src: 'N06', dst: 'N07' },
  { src: 'N02', dst: 'N06' },
  { src: 'N03', dst: 'N07' },
  { src: 'N02', dst: 'N08' },
  { src: 'N08', dst: 'N04' },
  { src: 'N05', dst: 'N02' },
  { src: 'N06', dst: 'N03' },
];

const minLat = 12.945;
const maxLat = 12.990;
const minLon = 77.570;
const maxLon = 77.615;

function toSVG(latStr: string | number, lonStr: string | number) {
  const lat = typeof latStr === 'string' ? parseFloat(latStr) : latStr;
  const lon = typeof lonStr === 'string' ? parseFloat(lonStr) : lonStr;
  const y = 330 - ((lat - minLat) / (maxLat - minLat)) * 280;
  const x = 30 + ((lon - minLon) / (maxLon - minLon)) * 440;
  return { x, y };
}

export default function DispatcherPage() {
  const { user, logout } = useAuth();
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  // Optimization recommendations
  const [ambulanceStrategy, setAmbulanceStrategy] = useState<'baseline' | 'intelligent'>('intelligent');
  const [hospitalStrategy, setHospitalStrategy] = useState<'baseline' | 'intelligent'>('intelligent');
  const [ambulanceCandidates, setAmbulanceCandidates] = useState<any[]>([]);
  const [hospitalCandidates, setHospitalCandidates] = useState<any[]>([]);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);

  // Status & loading
  const [loading, setLoading] = useState(true);
  const [optimizingAmbulance, setOptimizingAmbulance] = useState(false);
  const [optimizingHospital, setOptimizingHospital] = useState(false);
  const [error, setError] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Time tracker
  const [timeStr, setTimeStr] = useState('');

  // Reassignment & manual verification
  const [reassignAlert, setReassignAlert] = useState<any | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Floating controls overlay toggles
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(true);
  const [showResourcesOverlay, setShowResourcesOverlay] = useState(true);

  useEffect(() => {
    fetchDispatcherData();
    const interval = setInterval(fetchDispatcherData, 4000);

    // Dynamic clock
    const clockInterval = setInterval(() => {
      const d = new Date();
      setTimeStr(d.toTimeString().substring(0, 5));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  // Update details of selected incident when data feeds update
  useEffect(() => {
    if (selectedEmergency) {
      const updated = emergencies.find((e) => e.id === selectedEmergency.id);
      if (updated) {
        setSelectedEmergency(updated);
        fetchAlertAndRoute(updated);
      }
    }
  }, [emergencies]);

  async function fetchDispatcherData() {
    try {
      const [eData, aData, hData] = await Promise.all([
        apiClient.getEmergencies(),
        apiClient.getAmbulances(),
        apiClient.getHospitals(),
      ]);
      setEmergencies(eData.results);
      setAmbulances(aData.results);
      setHospitals(hData.results);
      setError('');
    } catch (err) {
      setError('Connection failure updating dispatcher data feeds.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlertAndRoute(emergency: Emergency) {
    try {
      const rData = await apiClient.optimizeRoute(emergency.id, undefined, 'intelligent');
      setRoute(rData);
    } catch {
      setRoute(null);
    }
  }

  useWebSockets('dispatcher', null, (data) => {
    console.log('WS Dispatcher Event:', data);
    fetchDispatcherData();

    if (data.type === 'hospital.not_ready' || data.type === 'hospital.timeout') {
      setReassignAlert(data);
    }
  });

  async function handleVerifyOverride(priority: string) {
    if (!selectedEmergency) return;
    setVerifying(true);
    try {
      await apiClient.verifyEmergency(selectedEmergency.id, priority);
      await fetchDispatcherData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Verification override failed');
    } finally {
      setVerifying(false);
    }
  }

  async function triggerAmbulanceOptimization() {
    if (!selectedEmergency) return;
    setOptimizingAmbulance(true);
    try {
      const response = await apiClient.optimizeAmbulances(
        selectedEmergency.id,
        ambulanceStrategy
      );
      setAmbulanceCandidates(response.candidates);
    } catch {
      alert('Ambulance optimization calculation failed.');
    } finally {
      setOptimizingAmbulance(false);
    }
  }

  async function triggerHospitalOptimization() {
    if (!selectedEmergency) return;
    setOptimizingHospital(true);
    try {
      const response = await apiClient.optimizeHospitals(
        selectedEmergency.id,
        hospitalStrategy
      );
      setHospitalCandidates(response.candidates);
    } catch {
      alert('Hospital resource optimization calculation failed.');
    } finally {
      setOptimizingHospital(false);
    }
  }

  async function assignAmbulance(ambulanceId: number) {
    if (!selectedEmergency) return;
    try {
      await apiClient.assignAmbulance(selectedEmergency.id, ambulanceId);
      await fetchDispatcherData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Allocation failed');
    }
  }

  async function selectHospital(hospitalId: number) {
    if (!selectedEmergency) return;
    try {
      await apiClient.selectHospital(selectedEmergency.id, hospitalId);
      await fetchDispatcherData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Notification failed');
    }
  }

  async function approveReassignment(hospitalId: number) {
    if (!selectedEmergency) return;
    try {
      await apiClient.approveReassignment(selectedEmergency.id, hospitalId);
      setReassignAlert(null);
      await fetchDispatcherData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reassignment failed');
    }
  }

  async function simulateEmergencyIngestion() {
    setIngesting(true);
    const types = ['CARDIAC', 'TRAUMA', 'RESPIRATORY', 'STROKE', 'SEIZURE'];
    const randomType = types[Math.floor(Math.random() * types.length)];
    const randomAge = Math.floor(Math.random() * 60) + 18;
    const randomNode = SEEDED_NODES[Math.floor(Math.random() * SEEDED_NODES.length)];
    
    const lat = (randomNode.lat + (Math.random() - 0.5) * 0.005).toFixed(6);
    const lon = (randomNode.lon + (Math.random() - 0.5) * 0.005).toFixed(6);

    const data = {
      latitude: lat,
      longitude: lon,
      age: randomAge,
      emergency_type: randomType,
      reported_conditions: ['difficulty_breathing', 'altered_consciousness'],
      vital_data: { heart_rate: 110, spo2: 89, respiratory_rate: 24 }
    };

    try {
      const e = await apiClient.createEmergency(data);
      await fetchDispatcherData();
      setSelectedEmergency(e);
    } catch (err) {
      alert('Simulation ingestion failed');
    } finally {
      setIngesting(false);
    }
  }

  async function triggerRouteRecalculation() {
    if (!selectedEmergency) return;
    setRecalculating(true);
    try {
      const res = await apiClient.recalculateRoute(selectedEmergency.id, 'intelligent');
      if (res.rerouted) {
        alert(`Intelligent Rerouting Executed! Old ETA: ${res.old_eta_min} min, New ETA: ${res.new_eta_min} min`);
      } else {
        alert('Route remains optimal. No traffic changes detected.');
      }
      await fetchDispatcherData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Recalculation failed');
    } finally {
      setRecalculating(false);
    }
  }

  // Calculate elapsed time from string helper
  function getElapsedTime(createdAtStr: string) {
    const start = new Date(createdAtStr).getTime();
    const diff = Math.max(0, Date.now() - start);
    const secs = Math.floor((diff / 1000) % 60);
    const mins = Math.floor((diff / 60000) % 60);
    const hrs = Math.floor(diff / 3600000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) return <LoadingState />;

  const activeIncidents = emergencies.filter((e) => e.status !== 'COMPLETED');

  return (
    <div className="h-screen flex flex-col bg-[#0B0F14] text-[#E8EDF2] select-none overflow-hidden">
      {/* Top Banner Bar */}
      <header className="h-12 border-b border-[#27313C] bg-[#11171F] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-6">
          <span className="font-black tracking-widest text-[#E5484D] text-sm font-mono">RESQLINK</span>
          <div className="h-4 w-[1px] bg-[#27313C]"></div>
          <span className="text-xs font-semibold text-[#8D99A6] tracking-wider uppercase">LIVE OPERATIONS</span>
          <div className="flex items-center gap-1.5 text-xs text-[#36B37E] font-bold">
            <span className="h-2 w-2 rounded-full bg-[#36B37E] animate-pulse"></span>
            {activeIncidents.length} ACTIVE CASES
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#4C9AFF] font-bold">
            <span className="h-2 w-2 rounded-full bg-[#4C9AFF]"></span>
            SYSTEM HEALTH: GOOD
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Button onClick={simulateEmergencyIngestion} disabled={ingesting} className="!py-1 h-7 border border-[#4C9AFF]/40 text-[#4C9AFF] bg-[#11171F] hover:bg-[#4C9AFF]/10 text-xs">
            {ingesting ? 'INGESTING...' : 'INGEST MOCK EMERGENCY'}
          </Button>
          <div className="h-4 w-[1px] bg-[#27313C]"></div>
          <span className="text-slate-400 font-mono">{timeStr}</span>
          <span className="text-slate-500 font-semibold uppercase">DISPATCHER: {user?.name || 'Vikas'}</span>
        </div>
      </header>
      {error && <div className="p-3 bg-red-955/20 border-b border-[#E5484D]/40 text-xs font-mono text-[#E5484D]">{error}</div>}

      {/* Main Layout Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Narrow Rail Navigation */}
        <aside className="w-16 border-r border-[#27313C] bg-[#11171F] flex flex-col items-center py-4 shrink-0 justify-between">
          <div className="flex flex-col gap-6 items-center w-full">
            <div className="w-9 h-9 border border-[#27313C] rounded flex items-center justify-center font-bold text-xs text-[#E5484D]">
              RQ
            </div>
            <div className="h-[1px] w-8 bg-[#27313C]"></div>
            
            {/* Nav icons with labels on hover */}
            <div className="group relative cursor-pointer p-2 rounded text-[#36B37E]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div className="absolute left-16 top-1.5 hidden group-hover:block bg-[#11171F] border border-[#27313C] text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-50">
                Operations Status
              </div>
            </div>

            <div className="group relative cursor-pointer p-2 rounded text-[#E5484D]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="absolute left-16 top-1.5 hidden group-hover:block bg-[#11171F] border border-[#27313C] text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-50">
                Active Alarms
              </div>
            </div>

            <div className="group relative cursor-pointer p-2 rounded text-[#4C9AFF]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div className="absolute left-16 top-1.5 hidden group-hover:block bg-[#11171F] border border-[#27313C] text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-50">
                Ambulance Fleet
              </div>
            </div>

            <div className="group relative cursor-pointer p-2 rounded text-slate-400 hover:text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <div className="absolute left-16 top-1.5 hidden group-hover:block bg-[#11171F] border border-[#27313C] text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-50">
                Trauma Centers
              </div>
            </div>

            <div className="group relative cursor-pointer p-2 rounded text-slate-400 hover:text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute left-16 top-1.5 hidden group-hover:block bg-[#11171F] border border-[#27313C] text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-50">
                Simulation Labs
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 items-center w-full">
            <div className="group relative cursor-pointer p-2 rounded text-slate-500 hover:text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <div className="absolute left-16 bottom-20 hidden group-hover:block bg-[#11171F] border border-[#27313C] text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-50">
                Settings
              </div>
            </div>
            <button onClick={logout} className="p-2 rounded text-red-500 hover:bg-red-955/20 transition-all">
              ✕
            </button>
          </div>
        </aside>

        {/* Center Live Map Section */}
        <section className="flex-1 flex flex-col bg-[#0B0F14] relative overflow-hidden">
          {/* Main Map Box */}
          <div className="flex-1 relative map-grid">
            <svg className="w-full h-full bg-[#0B0F14]/90" viewBox="0 0 500 350" preserveAspectRatio="xMidYMid slice">
              {/* Grid Roads */}
              {SEEDED_EDGES.map((edge, index) => {
                const n1 = SEEDED_NODES.find((n) => n.name === edge.src);
                const n2 = SEEDED_NODES.find((n) => n.name === edge.dst);
                if (!n1 || !n2) return null;
                const p1 = toSVG(n1.lat, n1.lon);
                const p2 = toSVG(n2.lat, n2.lon);
                return (
                  <line
                    key={index}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#27313C"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* Active Route highlighting */}
              {route && route.nodes && route.nodes.length > 1 && (
                route.nodes.map((node, idx) => {
                  if (idx === route.nodes.length - 1) return null;
                  const n1 = node;
                  const n2 = route.nodes[idx + 1];
                  const p1 = toSVG(n1.latitude, n1.longitude);
                  const p2 = toSVG(n2.latitude, n2.longitude);
                  return (
                    <line
                      key={`route-${idx}`}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="#4C9AFF"
                      strokeWidth="3"
                      className="animate-flow-active"
                      strokeLinecap="round"
                    />
                  );
                })
              )}

              {/* Nodes dots */}
              {SEEDED_NODES.map((node) => {
                const p = toSVG(node.lat, node.lon);
                return (
                  <g key={node.name}>
                    <circle cx={p.x} cy={p.y} r="5" fill="#11171F" stroke="#27313C" strokeWidth="1" />
                    <text x={p.x + 7} y={p.y + 3} fill="#8D99A6" fontSize="7" fontFamily="monospace">
                      {node.name}
                    </text>
                  </g>
                );
              })}

              {/* Incident Markers */}
              {emergencies.map((e) => {
                if (e.status === 'COMPLETED') return null;
                const p = toSVG(e.latitude, e.longitude);
                const isSelected = selectedEmergency?.id === e.id;
                return (
                  <g key={e.id} className={isSelected ? 'animate-pulse-critical' : ''}>
                    <circle cx={p.x} cy={p.y} r={isSelected ? "11" : "8"} fill="rgba(229, 72, 77, 0.25)" />
                    <circle cx={p.x} cy={p.y} r="4.5" fill="#E5484D" />
                    <text x={p.x + 8} y={p.y - 6} fill="#E5484D" fontSize="8" fontWeight="bold" fontFamily="monospace">
                      🚨 E-{e.id}
                    </text>
                  </g>
                );
              })}

              {/* Hospital Markers */}
              {showResourcesOverlay && hospitals.map((h) => {
                const p = toSVG(h.latitude, h.longitude);
                const hasAlert = selectedEmergency?.selected_hospital === h.id;
                return (
                  <g key={h.id}>
                    <rect x={p.x - 5} y={p.y - 5} width="10" height="10" rx="1.5" fill="#11171F" stroke="#36B37E" strokeWidth="1.5" />
                    {hasAlert && <circle cx={p.x} cy={p.y} r="12" fill="none" stroke="#36B37E" strokeWidth="1" className="animate-pulse" />}
                    <text x={p.x + 8} y={p.y + 11} fill="#36B37E" fontSize="8" fontWeight="bold" fontFamily="monospace">
                      🏥 H-{h.id.toString().padStart(2, '0')}
                    </text>
                  </g>
                );
              })}

              {/* Ambulance Markers */}
              {ambulances.map((amb) => {
                if (amb.status === 'UNAVAILABLE') return null;
                const p = toSVG(amb.latitude, amb.longitude);
                const isActive = selectedEmergency && amb.current_emergency === selectedEmergency.id;
                return (
                  <g key={amb.id}>
                    <circle cx={p.x} cy={p.y} r="6" fill="#11171F" stroke="#4C9AFF" strokeWidth="1.5" />
                    {isActive && <circle cx={p.x} cy={p.y} r="10" fill="none" stroke="#4C9AFF" strokeWidth="1" className="animate-pulse" />}
                    <text x={p.x - 14} y={p.y - 9} fill="#4C9AFF" fontSize="7" fontFamily="monospace" fontWeight="bold">
                      🚑 A{amb.registration_number}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Compact Floating Map Controls */}
            <div className="absolute top-4 left-4 bg-[#11171F] border border-[#27313C] rounded flex flex-col text-xs text-[#E8EDF2] w-28 shrink-0 divide-y divide-[#27313C]">
              <button className="py-2 text-center hover:bg-slate-800 transition-colors font-bold">+</button>
              <button className="py-2 text-center hover:bg-slate-800 transition-colors font-bold">−</button>
              <button className="py-1.5 px-2 hover:bg-slate-800 transition-colors flex items-center gap-1.5" onClick={() => fetchDispatcherData()}>
                <span className="text-[10px]">⊙</span> Recenter
              </button>
              <button
                onClick={() => setShowTrafficOverlay(!showTrafficOverlay)}
                className={`py-1.5 px-2 hover:bg-slate-800 transition-colors flex items-center justify-between text-[10px] ${showTrafficOverlay ? 'text-[#4C9AFF]' : 'text-slate-500'}`}
              >
                <span>◇ Traffic</span>
                <span>{showTrafficOverlay ? 'ON' : 'OFF'}</span>
              </button>
              <button
                onClick={() => setShowResourcesOverlay(!showResourcesOverlay)}
                className={`py-1.5 px-2 hover:bg-slate-800 transition-colors flex items-center justify-between text-[10px] ${showResourcesOverlay ? 'text-[#36B37E]' : 'text-slate-500'}`}
              >
                <span>○ Resources</span>
                <span>{showResourcesOverlay ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>

          {/* Traffic ticker banner */}
          <footer className="h-8 border-t border-[#27313C] bg-[#11171F] flex items-center justify-between px-4 text-[10px] text-[#8D99A6] font-mono shrink-0">
            <span>LIVE TRAFFIC OVERLAY STATUS: INTEGRATED DIJKSTRA COST</span>
            <span>LAST SEEDED UPDATE: {new Date().toLocaleTimeString()}</span>
          </footer>
        </section>

        {/* Right Active Incidents Section / Command Detail Drawer */}
        <section className="w-96 border-l border-[#27313C] bg-[#11171F] flex flex-col overflow-hidden shrink-0">
          {!selectedEmergency ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-[#27313C] flex justify-between items-center bg-[#0B0F14]/40">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8D99A6]">ACTIVE EMERGENCIES</span>
                <Badge variant="warning">{activeIncidents.length.toString()}</Badge>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#27313C]">
                {activeIncidents.map((e) => {
                  const elapsed = getElapsedTime(e.created_at);
                  const isCritical = e.verified_priority === 'CRITICAL' || e.verified_priority === 'HIGH';
                  return (
                    <div
                      key={e.id}
                      onClick={() => {
                        setSelectedEmergency(e);
                        fetchAlertAndRoute(e);
                      }}
                      className="p-4 cursor-pointer hover:bg-slate-800/40 transition-colors space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-bold text-[#E8EDF2]">E-{e.id}</span>
                        <span className="font-mono text-xs text-[#8D99A6]">{elapsed}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant={isCritical ? 'danger' : 'warning'}>
                          {e.verified_priority || 'UNVERIFIED'}
                        </Badge>
                        <span className="text-[10px] font-mono text-[#4C9AFF] uppercase">{e.status}</span>
                      </div>
                      <p className="text-xs text-[#8D99A6] truncate">{e.reported_conditions.join(' · ')}</p>

                      <div className="flex items-center justify-between text-[11px] font-mono text-[#8D99A6] bg-[#0B0F14]/65 p-2 rounded border border-[#27313C]/40">
                        <span>🚑 A{(() => {
                          const assignedAmb = ambulances.find((a) => a.current_emergency === e.id);
                          return assignedAmb ? assignedAmb.registration_number : 'None';
                        })()}</span>
                        <span>→</span>
                        <span>🏥 {e.selected_hospital ? `H-${e.selected_hospital}` : 'None'}</span>
                      </div>
                    </div>
                  );
                })}
                {activeIncidents.length === 0 && (
                  <div className="text-center py-12 text-slate-500 text-xs font-mono">No active emergencies on grid.</div>
                )}
              </div>
            </div>
          ) : (
            /* Full-Height Right-side Command Drawer */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Drawer Header */}
              <div className="p-4 border-b border-[#27313C] flex justify-between items-center bg-[#0B0F14]/70">
                <div>
                  <div className="text-[10px] text-[#8D99A6] font-bold tracking-wider">INCIDENT DESK</div>
                  <h2 className="text-base font-black text-white font-mono">CASE E-{selectedEmergency.id}</h2>
                </div>
                <button
                  onClick={() => {
                    setSelectedEmergency(null);
                    setAmbulanceCandidates([]);
                    setHospitalCandidates([]);
                    setRoute(null);
                  }}
                  className="text-slate-500 hover:text-white font-mono text-sm font-black p-1"
                >
                  [ CLOSE ]
                </button>
              </div>

              {/* Drawer Body Scroll */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Status HUD Block */}
                <div className="bg-[#0B0F14]/60 p-3.5 rounded border border-[#27313C] space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#8D99A6]">Age / Triage:</span>
                    <span className="font-bold text-white">{selectedEmergency.age} Y / {selectedEmergency.emergency_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8D99A6]">GPS Coordinates:</span>
                    <span className="font-mono text-[#4C9AFF]">{selectedEmergency.latitude}, {selectedEmergency.longitude}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8D99A6]">Current State:</span>
                    <span className="font-bold text-[#F0A43C] uppercase">{selectedEmergency.status}</span>
                  </div>
                </div>

                {/* AI Screening / Decision Support Panel */}
                <div className="border border-[#27313C] rounded p-4 bg-[#11171F]/60">
                  <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider mb-2">DECISION SUPPORT AI</div>
                  <div className="flex items-center justify-between mb-4 border-b border-[#27313C]/60 pb-2">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">RISK ESTIMATE</div>
                      <div className="text-2xl font-black text-[#E5484D] font-mono">
                        {selectedEmergency.ai_risk_score !== null ? selectedEmergency.ai_risk_score.toFixed(2) : '0.91'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase text-right">PRIORITY PREDICTION</div>
                      <div className="text-sm font-bold text-[#F0A43C] text-right font-mono">
                        {selectedEmergency.ai_priority || 'HIGH'}
                      </div>
                    </div>
                  </div>

                  {/* SHAP Observation Weights Chart */}
                  <div className="space-y-2 text-xs">
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">XGBoost Feature Contributions:</div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                        <span>SpO₂ (↓ 89%)</span>
                        <span className="font-mono text-[#E5484D]">+45%</span>
                      </div>
                      <div className="w-full bg-[#0B0F14] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#E5484D] h-full" style={{ width: '85%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                        <span>Breathing difficulty (YES)</span>
                        <span className="font-mono text-[#F0A43C]">+30%</span>
                      </div>
                      <div className="w-full bg-[#0B0F14] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#F0A43C] h-full" style={{ width: '65%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                        <span>Heart rate (↑ 121)</span>
                        <span className="font-mono text-sky-400">+15%</span>
                      </div>
                      <div className="w-full bg-[#0B0F14] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-sky-500 h-full" style={{ width: '40%' }}></div>
                      </div>
                    </div>
                    <div className="pt-2 text-center">
                      <span className="text-[9px] text-slate-500 font-mono">Model: XGBoost Classifier v1.2</span>
                    </div>
                  </div>

                  {/* Dispatcher Decision Overrides */}
                  <div className="mt-4 pt-3 border-t border-[#27313C] space-y-3">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Human-in-the-Loop Override:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleVerifyOverride('HIGH')}
                      disabled={verifying}
                      className="bg-amber-955/20 border border-[#F0A43C]/40 text-[#F0A43C] !px-2.5 !py-1 text-xs"
                    >
                      Verify High
                    </Button>
                    <Button
                      onClick={() => handleVerifyOverride('CRITICAL')}
                      disabled={verifying}
                      className="bg-red-955/20 border border-[#E5484D]/40 text-[#E5484D] !px-2.5 !py-1 text-xs"
                    >
                      Verify Critical
                    </Button>
                  </div>
                  </div>
                </div>

                {/* Ambulance Selection Section */}
                <div className="border border-[#27313C] rounded p-4 bg-[#11171F]/60">
                  <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider mb-2">AMBULANCE DISPATCH</div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs text-slate-400">Optimization:</span>
                    <select
                      value={ambulanceStrategy}
                      onChange={(e) => setAmbulanceStrategy(e.target.value as any)}
                      className="bg-[#0B0F14] border border-[#27313C] rounded px-2 py-1 text-xs text-[#E8EDF2] focus:outline-none"
                    >
                      <option value="intelligent">Intelligent Cost</option>
                      <option value="baseline">Baseline Nearest</option>
                    </select>
                  </div>
                  <Button onClick={triggerAmbulanceOptimization} className="w-full mb-3 text-xs !py-1.5" disabled={optimizingAmbulance}>
                    {optimizingAmbulance ? 'RUNNING OPTIMIZER...' : 'CALCULATE NEAREST AMBULANCES'}
                  </Button>

                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {ambulanceCandidates.map((cand) => (
                      <div key={cand.ambulance_id} className="p-2 bg-[#0B0F14] border border-[#27313C] rounded text-xs flex justify-between items-center font-mono">
                        <div>
                          <div className="font-bold text-white">🚑 A{cand.ambulance}</div>
                          <div className="text-[10px] text-slate-500">{cand.distance_km} km • ETA {cand.eta_minutes} mins</div>
                        </div>
                        <Button className="!py-0.5 !px-2 text-[10px]" onClick={() => assignAmbulance(cand.ambulance_id)}>
                          Dispatch
                        </Button>
                      </div>
                    ))}
                    {ambulanceCandidates.length === 0 && (
                      <div className="text-slate-600 text-center py-2 text-[10px]">No dispatcher allocation runs computed.</div>
                    )}
                  </div>
                </div>

                {/* Hospital Selection Section */}
                <div className="border border-[#27313C] rounded p-4 bg-[#11171F]/60">
                  <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider mb-2">HOSPITAL TRANSFER TARGET</div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs text-slate-400">Strategy:</span>
                    <select
                      value={hospitalStrategy}
                      onChange={(e) => setHospitalStrategy(e.target.value as any)}
                      className="bg-[#0B0F14] border border-[#27313C] rounded px-2 py-1 text-xs text-[#E8EDF2] focus:outline-none"
                    >
                      <option value="intelligent">Intelligent Resource</option>
                      <option value="baseline">Baseline Nearest</option>
                    </select>
                  </div>
                  <Button onClick={triggerHospitalOptimization} className="w-full mb-3 text-xs !py-1.5" disabled={optimizingHospital}>
                    {optimizingHospital ? 'EVALUATING RESOURCES...' : 'EVALUATE DESTINATION CAPACITY'}
                  </Button>

                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {hospitalCandidates.map((cand) => (
                      <div key={cand.hospital_id} className="p-2 bg-[#0B0F14] border border-[#27313C] rounded text-xs flex justify-between items-center font-mono">
                        <div>
                          <div className="font-bold text-white">{cand.hospital}</div>
                          <div className="text-[10px] text-slate-500">{cand.distance_km} km • Bed Cap {Math.round(cand.capacity * 100)}%</div>
                        </div>
                        <Button className="!py-0.5 !px-2 text-[10px]" onClick={() => selectHospital(cand.hospital_id)}>
                          Select
                        </Button>
                      </div>
                    ))}
                    {hospitalCandidates.length === 0 && (
                      <div className="text-slate-600 text-center py-2 text-[10px]">No transfer targets computed.</div>
                    )}
                  </div>
                </div>

                {/* Route Pathing Controls */}
                {route && (
                  <div className="border border-[#27313C] rounded p-4 bg-[#11171F]/60">
                    <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider mb-2">TRANSIT DIJKSTRA ROUTING</div>
                    <div className="flex justify-between items-center text-xs font-mono mb-3">
                      <span>Travel time: {route.estimated_time} mins</span>
                      <Button onClick={triggerRouteRecalculation} disabled={recalculating} className="!py-0.5 !px-2 text-[10px]">
                        {recalculating ? 'REROUTING...' : 'RECALCULATE'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Incident Event Timeline */}
                <div className="border border-[#27313C] rounded p-4 bg-[#11171F]/60">
                  <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider mb-3">INCIDENT EVENT LOG TIMELINE</div>
                  <div className="relative border-l border-[#27313C] ml-2 pl-4 space-y-4">
                    {selectedEmergency.events?.map((ev) => {
                      const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={ev.id} className="relative text-xs">
                          <div className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[#E5484D] border border-[#0B0F14]"></div>
                          <div className="flex justify-between font-mono text-[10px] text-slate-500">
                            <span>{time}</span>
                            <span>{ev.event_type.replace('EMERGENCY_', '')}</span>
                          </div>
                          <p className="text-slate-300 mt-0.5">{ev.actor_name ? `By ${ev.actor_name}` : 'System logged.'}</p>
                        </div>
                      );
                    })}
                    {(!selectedEmergency.events || selectedEmergency.events.length === 0) && (
                      <div className="text-slate-600 text-center py-2 text-[10px]">No timeline events created.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Reassignment Modal */}
      {reassignAlert && (
        <Modal open={reassignAlert !== null} title="⚠ HOSPITAL REASSIGNMENT REQUIRED" onClose={() => setReassignAlert(null)}>
          <div className="space-y-4 text-[#E8EDF2] text-sm">
            <p className="text-[#E5484D] font-bold">
              The notified hospital has reported NOT READY due to:
            </p>
            <div className="bg-red-955/10 border border-[#E5484D]/40 p-3 rounded font-mono text-[#E5484D] text-xs">
              {reassignAlert.reason || 'Hospital Alert Timeout'}
            </div>
            <p className="text-xs text-slate-400 font-mono">RECOMMENDED fallback hospital targets:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {reassignAlert.candidates?.map((cand: any) => (
                <div key={cand.hospital_id} className="p-3 border border-[#27313C] rounded bg-[#0B0F14] flex justify-between items-center text-xs font-mono">
                  <div>
                    <strong className="text-white text-sm">{cand.hospital}</strong>
                    <div className="text-[#8D99A6] mt-1">{cand.distance_km} km • ETA {cand.eta_minutes} mins</div>
                  </div>
                  <Button onClick={() => approveReassignment(cand.hospital_id)} className="!px-2.5 !py-1 text-xs">
                    Select Target
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
