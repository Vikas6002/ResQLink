import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import { apiClient, type Hospital, type HospitalAlert, type Handover, type AssetChangeRequest } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function HospitalPage() {
  const { user, logout } = useAuth();
  const [hospitalsList, setHospitalsList] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [alerts, setAlerts] = useState<HospitalAlert[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [changeRequests, setChangeRequests] = useState<AssetChangeRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Request Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [resourceEdits, setResourceEdits] = useState<any[]>([]);

  // Not Ready Modal state
  const [rejectingAlert, setRejectingAlert] = useState<HospitalAlert | null>(null);
  const [rejectReason, setRejectReason] = useState('ICU unavailable');
  const [submittingReject, setSubmittingReject] = useState(false);

  useEffect(() => {
    fetchHospitalData();
    const interval = setInterval(fetchHospitalData, 4500);
    return () => clearInterval(interval);
  }, [selectedHospitalId]);

  async function fetchHospitalData() {
    try {
      const hResponse = await apiClient.getHospitals();
      setHospitalsList(hResponse.results);

      if (hResponse.results.length === 0) {
        setError('No hospitals registered in the system.');
        setLoading(false);
        return;
      }

      let activeId = selectedHospitalId;
      if (!activeId) {
        // Fallback: match by user organization, else first hospital
        const defaultHosp = hResponse.results.find(h => h.organization === user?.organization) || hResponse.results[0];
        if (defaultHosp) {
          activeId = defaultHosp.id;
          setSelectedHospitalId(defaultHosp.id);
        }
      }

      const myHospital = hResponse.results.find((h) => h.id === activeId);
      if (!myHospital) {
        setLoading(false);
        return;
      }
      setHospital(myHospital);

      const [aResponse, handData, rData] = await Promise.all([
        apiClient.getHospitalAlerts(),
        apiClient.getHandovers().catch(() => ({ results: [] })),
        apiClient.getAssetChangeRequests().catch(() => ({ results: [] })),
      ]);

      const myAlerts = aResponse.results.filter((a) => a.hospital === myHospital.id);
      setAlerts(myAlerts);

      const myHandovers = handData.results.filter(
        (h) => h.hospital === myHospital.id && h.status !== 'COMPLETED'
      );
      setHandovers(myHandovers);

      const myRequests = rData.results.filter(
        (r) => r.asset_type === 'HOSPITAL' && r.hospital === myHospital.id
      );
      setChangeRequests(myRequests);
      setError('');
    } catch (err) {
      setError('Connection failure retrieving hospital dashboards.');
    } finally {
      setLoading(false);
    }
  }

  // Subscribe to real-time events for this hospital
  useWebSockets('hospital', selectedHospitalId, (data) => {
    console.log('WS Hospital Event:', data);
    fetchHospitalData();
  });

  async function handleAcknowledge(id: number) {
    try {
      await apiClient.acknowledgeAlert(id);
      await fetchHospitalData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Acknowledge alert failed');
    }
  }

  async function handlePrepare(id: number) {
    try {
      await apiClient.prepareAlert(id);
      await fetchHospitalData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Start preparation failed');
    }
  }

  async function handleReady(id: number) {
    try {
      await apiClient.readyAlert(id);
      await fetchHospitalData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Marking ready failed');
    }
  }

  async function submitNotReady() {
    if (!rejectingAlert) return;
    setSubmittingReject(true);
    try {
      await apiClient.notReadyAlert(rejectingAlert.id, rejectReason);
      setRejectingAlert(null);
      await fetchHospitalData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setSubmittingReject(false);
    }
  }

  async function handleAcceptHandover(id: number) {
    try {
      await apiClient.acceptHandover(id);
      await fetchHospitalData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Accept handover failed');
    }
  }

  // Open resource update request modal
  function handleOpenRequestModal() {
    if (!hospital) return;
    setResourceEdits(
      hospital.resources?.map((r) => ({
        resource_type: r.resource_type,
        total: r.total,
        available: r.available,
      })) || []
    );
    setShowRequestModal(true);
  }

  // Post pending change request
  async function submitResourceChangeRequest() {
    if (!hospital) return;
    setSaving(true);
    try {
      await apiClient.createAssetChangeRequest({
        asset_type: 'HOSPITAL',
        hospital: hospital.id,
        requested_changes: resourceEdits,
      });
      setShowRequestModal(false);
      await fetchHospitalData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!hospital) return <div className="p-6 text-slate-400">Loading hospital data...</div>;

  const activeAlerts = alerts.filter((a) => ['SENT', 'ACKNOWLEDGED', 'PREPARING'].includes(a.status));
  const historicAlerts = alerts.filter((a) => !['SENT', 'ACKNOWLEDGED', 'PREPARING'].includes(a.status)).slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="h-3 w-3 bg-emerald-500 rounded-full animate-pulse"></span>
            {hospital.name} Emergency Console
          </h1>
          <p className="text-xs text-slate-400">Hospital Scoped Emergency Response Console</p>
        </div>

        {/* Dropdown Selector (Additional Feature) */}
        <div className="flex items-center gap-4">
          <label className="text-xs text-slate-400 font-semibold">Switch Hospital Center:</label>
          <select
            value={selectedHospitalId || ''}
            onChange={(e) => {
              const val = parseInt(e.target.value) || null;
              setSelectedHospitalId(val);
            }}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          >
            {hospitalsList.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" size="small" onClick={handleOpenRequestModal}>
            Request Capacity Update
          </Button>
          <Button variant="secondary" size="small" onClick={logout}>Logout</Button>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns - Live Alerts & Handover */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <span className="h-2 w-2 bg-red-500 rounded-full animate-ping"></span>
            Live Incident Alarms ({activeAlerts.length})
          </h2>

          {activeAlerts.length > 0 ? (
            activeAlerts.map((alert) => (
              <Card
                key={alert.id}
                title={`Incoming Dispatch Case — ETA ${alert.eta} mins`}
                className="glass-panel border-indigo-950"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <div>
                      <span className="text-slate-400 text-xs block">Triage Priority</span>
                      <Badge variant={alert.priority === 'CRITICAL' || alert.priority === 'HIGH' ? 'danger' : 'warning'}>
                        {alert.priority}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs block">Alert Status</span>
                      <span className="font-bold text-indigo-400 text-sm">{alert.status}</span>
                    </div>
                  </div>

                  {/* Readiness Checklist */}
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Trauma Readiness Checklist</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {alert.readiness_checklist?.map((item: any) => {
                        const isReady = item.status === 'READY';
                        return (
                          <div key={item.key} className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-850">
                            <span className="text-xs text-slate-300">{item.label}</span>
                            <span className={`text-xs font-bold ${isReady ? 'text-emerald-400' : 'text-amber-500 animate-pulse'}`}>
                              {isReady ? '✓ READY' : '⚠️ CHECKING'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Process Buttons */}
                  <div className="flex flex-wrap gap-3 border-t border-slate-800 pt-3 justify-end">
                    {alert.status === 'SENT' && (
                      <Button onClick={() => handleAcknowledge(alert.id)}>
                        Acknowledge Alert
                      </Button>
                    )}
                    {alert.status === 'ACKNOWLEDGED' && (
                      <Button onClick={() => handlePrepare(alert.id)}>
                        Start Preparation
                      </Button>
                    )}
                    {alert.status === 'PREPARING' && (
                      <>
                        <Button variant="secondary" onClick={() => setRejectingAlert(alert)}>
                          Mark Not Ready
                        </Button>
                        <Button onClick={() => handleReady(alert.id)}>
                          Confirm Ready
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="glass-panel py-8 text-center text-slate-500">
              No live incident alerts. Standing by for dispatch incoming notifications.
            </Card>
          )}

          {/* Handovers Section */}
          <h2 className="text-lg font-bold text-white mt-8 mb-2">Live Handover Auditing</h2>
          {handovers.length > 0 ? (
            handovers.map((hand) => (
              <Card key={hand.id} title={`Active Handover Transfer`} className="glass-panel border-emerald-950">
                <div className="space-y-3">
                  <div className="text-sm flex justify-between text-slate-400">
                    <span>Handover Status:</span>
                    <strong className="text-indigo-400 uppercase">{hand.status}</strong>
                  </div>
                  {hand.notes && (
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-sm">
                      <div className="text-xs text-slate-400 font-semibold mb-1">Paramedic Notes:</div>
                      <div className="text-slate-200 whitespace-pre-wrap">{hand.notes}</div>
                    </div>
                  )}
                  {hand.status === 'SUBMITTED' && (
                    <Button onClick={() => handleAcceptHandover(hand.id)} className="w-full">
                      Accept and Confirm Patient Handover
                    </Button>
                  )}
                  {hand.status === 'STARTED' && (
                    <div className="text-xs text-slate-400 py-1">
                      Ambulance crew has initiated handover. Waiting for note submissions...
                    </div>
                  )}
                </div>
              </Card>
            ))
          ) : (
            <Card className="glass-panel py-6 text-center text-slate-500">
              No active patient handovers currently transferring.
            </Card>
          )}
        </div>

        {/* Right Sidebar - Resources, Requests History, Alarm logs */}
        <div className="space-y-6">
          {/* Resources card */}
          <Card title="Emergency Capacity" className="glass-panel">
            <div className="space-y-4">
              <div>
                <div className="text-slate-400 text-xs mb-1">Department Load Status:</div>
                <Badge variant={
                  hospital.emergency_department_status === 'OPEN' ? 'success' :
                  hospital.emergency_department_status === 'OVERCROWDED' ? 'warning' : 'danger'
                }>
                  {hospital.emergency_department_status}
                </Badge>
              </div>
              <div className="border-t border-slate-800 pt-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Capacity levels:</div>
                <div className="space-y-2">
                  {hospital.resources?.map((r) => (
                    <div key={r.id} className="flex justify-between items-center text-xs bg-slate-950/40 p-2 border border-slate-900 rounded">
                      <span className="text-slate-400 uppercase font-semibold">{r.resource_type.replace('_', ' ')}</span>
                      <strong className="text-white">{r.available} / {r.total}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Pending / Completed change requests */}
          <Card title="Asset Change Queries" className="glass-panel">
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1 text-xs">
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
                <div className="text-slate-600 text-center py-4">No capacity update queries submitted.</div>
              )}
            </div>
          </Card>

          {/* Alarm History */}
          <Card title="Completed Runs" className="glass-panel">
            <div className="space-y-2 text-xs max-h-48 overflow-y-auto pr-1">
              {historicAlerts.map((a) => (
                <div key={a.id} className="flex justify-between border-b border-slate-900 pb-2 text-[10px]">
                  <div>
                    <div className="text-slate-300 font-semibold">Incident Alert #{a.id}</div>
                    <div className="text-slate-500">Priority {a.priority}</div>
                  </div>
                  <span className="text-slate-400 capitalize">{a.status}</span>
                </div>
              ))}
              {historicAlerts.length === 0 && (
                <div className="text-slate-600 text-center py-4">No historic records.</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Resource update request modal */}
      {showRequestModal && (
        <Modal title="Request Capacity Modification" onClose={() => setShowRequestModal(false)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-slate-400 text-xs">
              Proposed resource updates will be routed to the system administrator for audit verification. No direct database updates are performed.
            </p>
            {resourceEdits.map((res, index) => (
              <div key={res.resource_type} className="border border-slate-800 p-3 rounded bg-slate-950/50">
                <div className="font-bold text-slate-300 text-xs mb-2 uppercase tracking-wide">
                  {res.resource_type.replace('_', ' ')}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Total Capacity</label>
                    <input
                      type="number"
                      min="0"
                      value={res.total}
                      onChange={(e) => {
                        const newEdits = [...resourceEdits];
                        newEdits[index].total = parseInt(e.target.value) || 0;
                        setResourceEdits(newEdits);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Available Count</label>
                    <input
                      type="number"
                      min="0"
                      value={res.available}
                      onChange={(e) => {
                        const newEdits = [...resourceEdits];
                        newEdits[index].available = parseInt(e.target.value) || 0;
                        setResourceEdits(newEdits);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-slate-800">
              <Button variant="secondary" onClick={() => setShowRequestModal(false)} disabled={saving}>Cancel</Button>
              <Button onClick={submitResourceChangeRequest} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Alert Reason Modal */}
      {rejectingAlert && (
        <Modal title="Report Not Ready Status" onClose={() => setRejectingAlert(null)}>
          <div className="space-y-4 text-slate-300 text-sm">
            <p>Please select the primary reason for marking this hospital NOT READY. This will trigger immediate dispatcher reassessment.</p>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Reason Code</label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="ICU unavailable">ICU unavailable</option>
                <option value="Emergency department overloaded">Emergency department overloaded</option>
                <option value="Specialist unavailable">Specialist unavailable</option>
                <option value="Equipment unavailable">Equipment unavailable</option>
                <option value="Insufficient capacity">Insufficient capacity</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setRejectingAlert(null)} disabled={submittingReject}>Cancel</Button>
              <Button onClick={submitNotReady} disabled={submittingReject}>
                {submittingReject ? 'Submitting...' : 'Submit Rejection'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
