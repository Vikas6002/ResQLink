import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import { apiClient, type Ambulance, type Emergency, type Handover, type OptimizedRoute, type AssetChangeRequest } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function AmbulancePage() {
  const { user, logout } = useAuth();
  const [ambulance, setAmbulance] = useState<Ambulance | null>(null);
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [changeRequests, setChangeRequests] = useState<AssetChangeRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [notes, setNotes] = useState('');
  const [submittingHandover, setSubmittingHandover] = useState(false);

  // Request Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [equipmentEdits, setEquipmentEdits] = useState<any[]>([]);

  useEffect(() => {
    fetchAmbulanceData();
    const interval = setInterval(fetchAmbulanceData, 4500);
    return () => clearInterval(interval);
  }, []);

  async function fetchAmbulanceData() {
    try {
      const aResponse = await apiClient.getAmbulances();
      const myAmbulance = aResponse.results.find(
        (a) => a.organization === user?.organization
      );
      if (!myAmbulance) {
        setError('No ambulance registered for your organization.');
        setLoading(false);
        return;
      }
      setAmbulance(myAmbulance);

      const [eResponse, handData, rData] = await Promise.all([
        apiClient.getEmergencies(),
        apiClient.getHandovers().catch(() => ({ results: [] })),
        apiClient.getAssetChangeRequests().catch(() => ({ results: [] })),
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

      // Filter change requests for this ambulance
      const myRequests = rData.results.filter(
        (r) => r.asset_type === 'AMBULANCE' && r.ambulance === myAmbulance.id
      );
      setChangeRequests(myRequests);
      setError('');
    } catch (err) {
      setError('Connection failure retrieving ambulance profile.');
    } finally {
      setLoading(false);
    }
  }

  // Subscribe to real-time events for this ambulance
  useWebSockets('ambulance', ambulance?.id, (data) => {
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Status update failed');
    }
  }

  // Client-side journey simulator along the route nodes
  async function simulateJourney() {
    if (!ambulance || !route || !route.nodes || route.nodes.length === 0) return;
    setSimulating(true);
    setSimStep(0);

    await updateStatus('EN_ROUTE');

    const nodes = route.nodes;
    for (let i = 0; i < nodes.length; i++) {
      setSimStep(i);
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

  // Handover Controls
  async function startHandoverProcess() {
    if (!emergency || !ambulance) return;
    try {
      const h = await apiClient.startHandover(emergency.id, ambulance.id, emergency.selected_hospital || undefined);
      setHandover(h);
      await fetchAmbulanceData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Handover failed to start');
    }
  }

  async function submitHandoverProcess() {
    if (!handover) return;
    setSubmittingHandover(true);
    try {
      await apiClient.submitHandover(handover.id, notes);
      setNotes('');
      await fetchAmbulanceData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Handover submission failed');
    } finally {
      setSubmittingHandover(false);
    }
  }

  // Open equipment request modal
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

  // Submit equipment change request
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!ambulance) return <div className="p-6 text-slate-400">Loading response vehicle profile...</div>;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 text-slate-200">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <span className="h-3 w-3 bg-sky-500 rounded-full animate-pulse"></span>
            Ambulance {ambulance.registration_number} Console
          </h1>
          <p className="text-xs text-slate-400">Mobile Responsive Operator Panel</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="small" onClick={handleOpenRequestModal}>
            Request Equipment Update
          </Button>
          <Button variant="secondary" size="small" onClick={logout}>Logout</Button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Ambulance Status & Request History */}
        <div className="lg:col-span-1 space-y-6">
          <Card title="Vehicle Diagnostics" className="glass-panel">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Organization:</span>
                <span className="font-semibold text-white">{ambulance.organization_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Capability:</span>
                <span className="font-semibold text-sky-400">{ambulance.capability_level}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Position:</span>
                <span className="font-mono text-slate-300">{ambulance.latitude}, {ambulance.longitude}</span>
              </div>
              <div className="border-t border-slate-850 pt-3">
                <div className="text-slate-400 mb-1.5">Vehicle Status:</div>
                <Badge variant={ambulance.status === 'AVAILABLE' ? 'success' : 'warning'}>
                  {ambulance.status}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Current Equipment List */}
          <Card title="Current Equipment List" className="glass-panel">
            <div className="flex flex-wrap gap-2">
              {ambulance.equipment?.map((e) => (
                <span key={e.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs border ${
                  e.available && e.quantity > 0 ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-red-950/20 border-red-900/40 text-red-400'
                }`}>
                  {e.equipment_name} ({e.quantity})
                </span>
              )) || <div className="text-xs text-slate-500">No equipment configured.</div>}
            </div>
          </Card>

          {/* Request Actions panel */}
          {emergency && (
            <Card title="Status Transition Actions" className="glass-panel border-indigo-950">
              <div className="flex flex-col gap-2">
                {ambulance.status === 'ASSIGNED' && (
                  <Button onClick={() => updateStatus('ACCEPTED')} className="w-full">
                    Accept Emergency Assignment
                  </Button>
                )}
                {ambulance.status === 'ACCEPTED' && (
                  <Button onClick={() => updateStatus('EN_ROUTE')} className="w-full">
                    Depart (En Route)
                  </Button>
                )}
                {ambulance.status === 'EN_ROUTE' && (
                  <Button onClick={() => updateStatus('ARRIVED')} className="w-full">
                    Mark Arrived at Destination
                  </Button>
                )}
                {ambulance.status === 'ARRIVED' && !handover && (
                  <Button onClick={startHandoverProcess} className="w-full">
                    Start Patient Handover
                  </Button>
                )}
                {ambulance.status === 'AVAILABLE' && (
                  <span className="text-xs text-slate-400 text-center py-2">
                    Waiting for incoming dispatcher assignment...
                  </span>
                )}
              </div>
            </Card>
          )}

          {/* Request Audit History */}
          <Card title="Equipment Change Queries" className="glass-panel">
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1 text-xs">
              {changeRequests.map((req) => (
                <div key={req.id} className="border-b border-slate-900 pb-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-white">Query #{req.id}</span>
                    <span className={`font-bold ${
                      req.status === 'APPROVED' ? 'text-emerald-400' :
                      req.status === 'REJECTED' ? 'text-red-400' : 'text-amber-400 animate-pulse'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Submitted at {new Date(req.created_at).toLocaleTimeString()}</div>
                  {req.rejection_reason && (
                    <div className="text-[10px] text-red-400/80 bg-red-955/15 p-1 rounded mt-1 border border-red-950/30">
                      Reason: {req.rejection_reason}
                    </div>
                  )}
                </div>
              ))}
              {changeRequests.length === 0 && (
                <div className="text-slate-600 text-center py-4">No equipment update queries submitted.</div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Columns - Assigned Callout & Handovers */}
        <div className="lg:col-span-2 space-y-6">
          {emergency ? (
            <>
              <Card title="Active Incident Assignment" className="glass-panel border-orange-950">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-slate-400 text-xs">Patient Reference</div>
                      <div className="text-lg font-bold text-white">{emergency.patient_reference}</div>
                    </div>
                    <Badge variant={emergency.verified_priority === 'CRITICAL' || emergency.verified_priority === 'HIGH' ? 'danger' : 'warning'}>
                      {emergency.verified_priority || 'UNVERIFIED'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-slate-400 text-xs">Emergency Type</div>
                      <div className="font-semibold text-white">{emergency.emergency_type}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Age</div>
                      <div className="font-semibold text-white">{emergency.age} years</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Status</div>
                      <div className="font-semibold text-white uppercase">{emergency.status}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-400 text-xs mb-1">Reported Conditions</div>
                    <div className="flex flex-wrap gap-1.5">
                      {emergency.reported_conditions.map((cond, idx) => (
                        <span key={idx} className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-xs text-slate-300">
                          {cond}
                        </span>
                      ))}
                    </div>
                  </div>

                  {route && (
                    <div className="border-t border-slate-800 pt-3">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-bold text-white text-sm">Assigned Route (Simulated Network)</div>
                        <span className="text-xs text-slate-400">{route.distance} km • {route.estimated_time} mins</span>
                      </div>
                      
                      {/* Sim controls */}
                      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-slate-300">
                          {simulating ? (
                            <span className="text-indigo-400 font-semibold animate-pulse">
                              Driving: Passing Node {route.nodes[simStep]?.name || ''} ({simStep + 1}/{route.nodes.length})
                            </span>
                          ) : (
                            <span>Route loaded. Ready to simulate ambulance coordinates broadcast.</span>
                          )}
                        </div>
                        <Button
                          onClick={simulateJourney}
                          disabled={simulating || ambulance.status === 'ARRIVED'}
                          size="small"
                        >
                          {simulating ? 'Simulating Journey...' : 'Simulate Journey'}
                        </Button>
                      </div>

                      {/* Map Node Timeline path */}
                      <div className="flex items-center gap-2 overflow-x-auto py-3">
                        {route.nodes.map((node, idx) => (
                          <div key={node.id} className="flex items-center shrink-0">
                            <div className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold border transition-colors ${
                              simulating && simStep === idx ? 'bg-indigo-900 border-indigo-500 text-white animate-pulse' :
                              ambulance.status === 'ARRIVED' || idx < simStep ? 'bg-emerald-950 border-emerald-800 text-emerald-400' :
                              'bg-slate-900 border-slate-800 text-slate-400'
                            }`}>
                              {node.name}
                            </div>
                            {idx < route.nodes.length - 1 && (
                              <span className="text-slate-700 font-bold mx-1">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Handover workflow */}
              {handover && (
                <Card title="Digital Patient Handover Form" className="glass-panel border-indigo-950">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm border-b border-slate-850 pb-2">
                      <span className="text-slate-400">Handover Status:</span>
                      <strong className="text-indigo-400 uppercase">{handover.status}</strong>
                    </div>

                    {handover.status === 'STARTED' && (
                      <div className="space-y-3">
                        <label className="text-sm text-slate-300 block">Paramedic Handover Notes</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Enter patient vitals, medications administered, and triage notes..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white text-sm focus:border-indigo-500 focus:outline-none h-24"
                        />
                        <Button
                          onClick={submitHandoverProcess}
                          disabled={submittingHandover || !notes.trim()}
                          className="w-full"
                        >
                          {submittingHandover ? 'Submitting...' : 'Submit Handover to Hospital'}
                        </Button>
                      </div>
                    )}

                    {handover.status === 'SUBMITTED' && (
                      <div className="p-3 bg-indigo-950/40 border border-indigo-900/60 rounded text-sm text-indigo-300">
                        Handover forms submitted. Waiting for hospital ER staff to acknowledge and accept...
                      </div>
                    )}

                    {handover.status === 'ACCEPTED' && (
                      <div className="space-y-3">
                        <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded text-sm text-emerald-300">
                          Handover accepted by hospital staff. Ready to finalize.
                        </div>
                        <Button
                          onClick={async () => {
                            try {
                              await apiClient.completeHandover(handover.id);
                              await fetchAmbulanceData();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'Failed to complete handover');
                            }
                          }}
                          className="w-full"
                        >
                          Complete Incident (Release Ambulance)
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card className="glass-panel py-12 text-center text-slate-500">
              <svg className="mx-auto h-12 w-12 text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              No active emergency calls assigned. Waiting on standby.
            </Card>
          )}
        </div>
      </div>

      {/* Equipment Change Request Modal */}
      {showRequestModal && (
        <Modal title="Request Equipment Modification" onClose={() => setShowRequestModal(false)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-slate-400 text-xs">
              Proposed equipment updates will be routed to the system administrator for audit verification. No direct database updates are performed.
            </p>
            {equipmentEdits.map((eq, index) => (
              <div key={eq.equipment_name} className="border border-slate-850 p-3 rounded bg-slate-950/50 flex items-center justify-between gap-4">
                <div className="font-bold text-slate-300 text-xs capitalize">{eq.equipment_name}</div>
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
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Available</label>
                    <input
                      type="checkbox"
                      checked={eq.available}
                      onChange={(e) => {
                        const newEdits = [...equipmentEdits];
                        newEdits[index].available = e.target.checked;
                        setEquipmentEdits(newEdits);
                      }}
                      className="h-5 w-5 bg-slate-950 border border-slate-800 rounded accent-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-slate-800">
              <Button variant="secondary" onClick={() => setShowRequestModal(false)} disabled={saving}>Cancel</Button>
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
