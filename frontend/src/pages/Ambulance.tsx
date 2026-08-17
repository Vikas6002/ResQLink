import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import { apiClient, type Ambulance, type Emergency, type Handover, type OptimizedRoute } from '../api/client';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function AmbulancePage() {
  const { user, logout } = useAuth();
  const [ambulancesList, setAmbulancesList] = useState<Ambulance[]>([]);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<number | null>(null);
  const [ambulance, setAmbulance] = useState<Ambulance | null>(null);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [notes, setNotes] = useState('');
  const [submittingHandover, setSubmittingHandover] = useState(false);

  // Request Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [equipmentEdits, setEquipmentEdits] = useState<any[]>([]);

  useEffect(() => {
    fetchAmbulanceData();
    const interval = setInterval(fetchAmbulanceData, 4500);
    return () => clearInterval(interval);
  }, [selectedAmbulanceId]);

  async function fetchAmbulanceData() {
    try {
      const aResponse = await apiClient.getAmbulances();
      setAmbulancesList(aResponse.results);

      if (aResponse.results.length === 0) {
        setError('No ambulances registered in the system.');
        setLoading(false);
        return;
      }

      let activeId = selectedAmbulanceId;
      if (!activeId) {
        const defaultAmb = aResponse.results.find((a) => a.organization === user?.organization) || aResponse.results[0];
        if (defaultAmb) {
          activeId = defaultAmb.id;
          setSelectedAmbulanceId(defaultAmb.id);
        }
      }

      const myAmbulance = aResponse.results.find((a) => a.id === activeId);
      if (!myAmbulance) {
        setLoading(false);
        return;
      }
      setAmbulance(myAmbulance);

      const [eResponse, handData] = await Promise.all([
        apiClient.getEmergencies(),
        apiClient.getHandovers().catch(() => ({ results: [] })),
      ]);

      if (myAmbulance.current_emergency) {
        const myEmergency = eResponse.results.find(
          (e) => e.id === myAmbulance.current_emergency
        );
        if (myEmergency) {
          setEmergency(myEmergency);
          try {
            const rData = await apiClient.optimizeRoute(myEmergency.id, myAmbulance.id);
            setRoute(rData);
          } catch {
            setRoute(null);
          }
        } else {
          setEmergency(null);
          setRoute(null);
        }

        const activeHandover = handData.results.find(
          (h) => h.emergency === myAmbulance.current_emergency && h.status !== 'COMPLETED'
        );
        setHandover(activeHandover || null);
      } else {
        setEmergency(null);
        setRoute(null);
        setHandover(null);
      }

      // No request list needed for mobile-first ambulance HUD
      setError('');
    } catch (err) {
      setError('Connection failure retrieving ambulance profile.');
    } finally {
      setLoading(false);
    }
  }

  useWebSockets('ambulance', selectedAmbulanceId, (data) => {
    console.log('WS Ambulance Event:', data);
    fetchAmbulanceData();
  });

  async function updateStatus(newStatus: string) {
    if (!ambulance) return;
    try {
      await apiClient.updateAmbulanceStatus(ambulance.id, newStatus);
      if (emergency) {
        let newEmergencyStatus = '';
        if (newStatus === 'ACCEPTED') newEmergencyStatus = 'EN_ROUTE';
        if (newStatus === 'EN_ROUTE') newEmergencyStatus = 'EN_ROUTE';
        if (newStatus === 'ARRIVED') newEmergencyStatus = 'ARRIVED';
        
        if (newEmergencyStatus) {
          await apiClient.updateEmergencyStatus(emergency.id, newEmergencyStatus).catch(() => {});
        }
      }
      await fetchAmbulanceData();
    } catch {
      alert('Status update failed');
    }
  }

  async function simulateJourney() {
    if (!ambulance || !route || !route.nodes || route.nodes.length === 0) return;
    setSimulating(true);

    await updateStatus('EN_ROUTE');

    const nodes = route.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      try {
        await apiClient.updateAmbulanceStatus(ambulance.id, 'EN_ROUTE');
        await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'}/ambulances/${ambulance.id}/`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiClient.getToken()}`,
          },
          body: JSON.stringify({
            latitude: node.latitude,
            longitude: node.longitude,
          }),
        });
      } catch (err) {
        console.error('Error updating coordinate tick:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    await updateStatus('ARRIVED');
    setSimulating(false);
  }

  async function startHandoverProcess() {
    if (!emergency || !ambulance) return;
    try {
      const h = await apiClient.startHandover(emergency.id, ambulance.id, emergency.selected_hospital || undefined);
      setHandover(h);
      await fetchAmbulanceData();
    } catch {
      alert('Handover initiation failed');
    }
  }

  async function submitHandoverProcess() {
    if (!handover) return;
    setSubmittingHandover(true);
    try {
      await apiClient.submitHandover(handover.id, notes);
      setNotes('');
      await fetchAmbulanceData();
    } catch {
      alert('Handover notes submission failed');
    } finally {
      setSubmittingHandover(false);
    }
  }

  function handleOpenRequestModal() {
    if (!ambulance) return;
    setEquipmentEdits(
      ambulance.equipment?.map((e) => ({
        equipment_name: e.equipment_name,
        quantity: e.quantity,
        available: e.available,
      })) || []
    );
    setShowRequestModal(true);
  }

  async function submitEquipmentChangeRequest() {
    if (!ambulance) return;
    setSaving(true);
    try {
      await apiClient.createAssetChangeRequest({
        asset_type: 'AMBULANCE',
        ambulance: ambulance.id,
        requested_changes: equipmentEdits,
      });
      setShowRequestModal(false);
      await fetchAmbulanceData();
    } catch {
      alert('Failed to submit change query');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!ambulance) return <div className="p-6 text-slate-400">Loading response vehicle profile...</div>;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#E8EDF2] flex flex-col items-center justify-start select-none font-sans p-4">
      {/* Mobile Screen Container Frame */}
      <div className="w-full max-w-md bg-[#11171F] border border-[#27313C] rounded-lg overflow-hidden flex flex-col shrink-0">
        
        {/* Top Header Grid */}
        <header className="h-12 border-b border-[#27313C] bg-[#11171F] px-4 flex items-center justify-between">
          <span className="font-bold font-mono tracking-widest text-[#4C9AFF]">RESQLINK</span>
          <span className="font-mono font-bold text-xs bg-[#4C9AFF]/10 border border-[#4C9AFF]/40 text-[#4C9AFF] px-2 py-0.5 rounded">
            ● A{ambulance.registration_number}
          </span>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-white font-mono">
            [ EXIT ]
          </button>
        </header>

        {/* Dropdown selector inside mobile header */}
        <div className="bg-[#0B0F14]/40 p-3 border-b border-[#27313C] flex items-center justify-between gap-2">
          <span className="text-[10px] text-[#8D99A6] font-mono font-bold uppercase">SELECT VEHICLE:</span>
          <select
            value={selectedAmbulanceId || ''}
            onChange={(e) => {
              const val = parseInt(e.target.value) || null;
              setSelectedAmbulanceId(val);
            }}
            className="bg-[#0B0F14] border border-[#27313C] rounded px-2 py-1 text-xs text-white focus:outline-none"
          >
            {ambulancesList.map((a) => (
              <option key={a.id} value={a.id}>Ambulance A{a.registration_number} ({a.capability_level})</option>
            ))}
          </select>
        </div>

        {/* Small SVG Map overlay */}
        <div className="h-44 bg-[#0B0F14]/75 relative overflow-hidden flex items-center justify-center border-b border-[#27313C] map-grid">
          <svg className="w-full h-full" viewBox="0 0 200 120">
            {route && route.nodes && route.nodes.length > 1 && (
              route.nodes.map((_, idx) => {
                const x1 = 20 + (idx * 40);
                const y1 = 60 + (idx % 2 === 0 ? 15 : -15);
                const x2 = 20 + ((idx + 1) * 40);
                const y2 = 60 + ((idx + 1) % 2 === 0 ? 15 : -15);
                return (
                  <line key={idx} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4C9AFF" strokeWidth="2.5" strokeDasharray="3,3" />
                );
              })
            )}
            <circle cx="20" cy="60" r="6" fill="#E5484D" />
            <circle cx="160" cy="60" r="6" fill="#36B37E" />
            <text x="12" y="76" fill="#E5484D" fontSize="8" fontFamily="monospace" fontWeight="bold">🚨 INCIDENT</text>
            <text x="145" y="76" fill="#36B37E" fontSize="8" fontFamily="monospace" fontWeight="bold">🏥 ER</text>
          </svg>
        </div>

        {/* Destination Information Band */}
        <div className="p-4 border-b border-[#27313C] bg-[#0B0F14]/40 space-y-3">
          <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider">DESTINATION TARGET</div>
          <div className="flex justify-between items-start">
            <div>
              <span className="font-bold text-white text-sm">{emergency?.selected_hospital_name || 'HOSPITAL UNNOTIFIED'}</span>
              <div className="text-[10px] text-[#8D99A6] mt-0.5 font-mono">
                {route ? `${route.distance} km` : '0.0 km'} · Traffic: <strong className="text-[#E5484D]">HIGH</strong>
              </div>
            </div>
            {/* Monospace Remaining ETA */}
            <div className="text-right">
              <span className="text-[9px] text-[#8D99A6] font-mono block">ETA REMAINING</span>
              <span className="font-mono text-lg font-black text-[#F0A43C]">
                {route ? `${route.estimated_time}:00` : '00:00'} MIN
              </span>
            </div>
          </div>
        </div>

        {/* Current status / Actions band */}
        <div className="p-4 border-b border-[#27313C] space-y-3">
          <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider">OPERATIONAL CONTROLS</div>
          <div className="bg-[#0B0F14]/65 p-3 rounded border border-[#27313C] flex justify-between items-center text-xs font-mono mb-2">
            <span>CURRENT VEHICLE STATE:</span>
            <span className="font-bold text-[#4C9AFF] uppercase">{ambulance.status}</span>
          </div>

          <div className="flex flex-col gap-2">
            {ambulance.status === 'ASSIGNED' && (
              <Button onClick={() => updateStatus('ACCEPTED')} className="w-full text-sm font-bold h-11">
                ACCEPT EMERGENCY ASSIGNMENT
              </Button>
            )}
            {ambulance.status === 'ACCEPTED' && (
              <Button onClick={() => updateStatus('EN_ROUTE')} className="w-full text-sm font-bold h-11">
                DEPART (EN ROUTE)
              </Button>
            )}
            {ambulance.status === 'EN_ROUTE' && (
              <>
                <Button
                  onClick={simulateJourney}
                  disabled={simulating}
                  className="w-full text-xs font-bold h-9 bg-slate-800 border-slate-700 text-slate-300"
                >
                  {simulating ? 'TRANSMITTING GPS TICKS...' : 'SIMULATE DRIVING PATH'}
                </Button>
                <Button onClick={() => updateStatus('ARRIVED')} className="w-full text-sm font-bold h-11 mt-1">
                  [ ARRIVED AT SCENE ]
                </Button>
              </>
            )}
            {ambulance.status === 'ARRIVED' && !handover && (
              <Button onClick={startHandoverProcess} className="w-full text-sm font-bold h-11">
                START PATIENT HANDOVER
              </Button>
            )}
            {ambulance.status === 'AVAILABLE' && (
              <span className="text-center text-[#8D99A6] py-3 text-xs font-mono">
                No dispatcher calls assigned. On standby.
              </span>
            )}
          </div>
        </div>

        {/* Digital Patient Handover Form */}
        {handover && (
          <div className="p-4 border-b border-[#27313C] bg-[#11171F] space-y-3">
            <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider">DIGITAL HANDOVER COMPLIANCE</div>
            <div className="text-xs flex justify-between font-mono">
              <span className="text-slate-400">Transfer State:</span>
              <strong className="text-[#4C9AFF] uppercase">{handover.status}</strong>
            </div>

            {handover.status === 'STARTED' && (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Input patient diagnostics logs & administered vitals here..."
                  className="w-full bg-[#0B0F14] border border-[#27313C] rounded p-2.5 text-white text-xs font-mono focus:border-[#4C9AFF] focus:outline-none h-20"
                />
                <Button
                  onClick={submitHandoverProcess}
                  disabled={submittingHandover || !notes.trim()}
                  className="w-full text-xs h-9"
                >
                  {submittingHandover ? 'SUBMITTING NOTES...' : 'SUBMIT PATIENT CHART'}
                </Button>
              </div>
            )}

            {handover.status === 'SUBMITTED' && (
              <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded text-xs text-indigo-300 font-mono">
                Patient records transmitted. Awaiting hospital clearance confirmation...
              </div>
            )}

            {handover.status === 'ACCEPTED' && (
              <div className="space-y-2">
                <div className="p-2.5 bg-emerald-950/20 border border-emerald-900/40 rounded text-xs text-emerald-400 font-mono">
                  Clearance accepted by trauma department.
                </div>
                <Button
                  onClick={async () => {
                    try {
                      await apiClient.completeHandover(handover.id);
                      await fetchAmbulanceData();
                    } catch {
                      alert('Failed to complete handover');
                    }
                  }}
                  className="w-full text-xs h-9"
                >
                  COMPLETE INCIDENT (RELEASE CAR)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Assigned Emergency Specs */}
        {emergency && (
          <div className="p-4 bg-[#0B0F14]/20 space-y-2.5">
            <div className="text-[10px] text-[#8D99A6] font-bold uppercase tracking-wider">CASE BIO DATA</div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400">
              <div>Incident: <strong className="text-white">E-{emergency.id}</strong></div>
              <div>Priority: <strong className="text-[#E5484D]">HIGH</strong></div>
              <div>Type: <strong className="text-white">{emergency.emergency_type}</strong></div>
              <div>Age: <strong className="text-white">{emergency.age}</strong></div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={handleOpenRequestModal} className="h-7 text-[10px] !px-2.5 !py-1">
                Request Equipment Change
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Equipment change request modal */}
      {showRequestModal && (
        <Modal open={showRequestModal} title="Request Equipment Modification" onClose={() => setShowRequestModal(false)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 text-slate-300">
            <p className="text-xs text-[#8D99A6] font-mono">
              Proposed equipment updates will be routed to the system administrator for audit verification.
            </p>
            {equipmentEdits.map((eq, index) => (
              <div key={eq.equipment_name} className="border border-[#27313C] p-3 rounded bg-[#0B0F14]/50 flex items-center justify-between gap-4 font-mono text-xs">
                <div className="font-bold text-slate-300 capitalize">{eq.equipment_name}</div>
                <div className="flex items-center gap-4">
                  <div className="w-24">
                    <label className="text-[10px] text-slate-500 block mb-0.5">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={eq.quantity}
                      onChange={(e) => {
                        const newEdits = [...equipmentEdits];
                        newEdits[index].quantity = parseInt(e.target.value) || 0;
                        setEquipmentEdits(newEdits);
                      }}
                      className="w-full bg-[#0B0F14] border border-[#27313C] rounded px-2 py-1 text-white text-xs focus:border-[#4C9AFF] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-4">
                    <input
                      type="checkbox"
                      checked={eq.available}
                      onChange={(e) => {
                        const newEdits = [...equipmentEdits];
                        newEdits[index].available = e.target.checked;
                        setEquipmentEdits(newEdits);
                      }}
                      className="h-4.5 w-4.5 bg-[#0B0F14] border border-[#27313C] rounded accent-[#4C9AFF]"
                    />
                    <span className="text-[10px] text-slate-500">Available</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-[#27313C]">
              <Button variant="secondary" onClick={() => setShowRequestModal(false)} disabled={saving} className="bg-[#11171F]">Cancel</Button>
              <Button onClick={submitEquipmentChangeRequest} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
