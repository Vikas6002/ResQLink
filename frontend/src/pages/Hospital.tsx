import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import { apiClient, type Hospital, type HospitalAlert, type Handover } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function HospitalPage() {
  const { user, logout } = useAuth();
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [alerts, setAlerts] = useState<HospitalAlert[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Not Ready Modal state
  const [rejectingAlert, setRejectingAlert] = useState<HospitalAlert | null>(null);
  const [rejectReason, setRejectReason] = useState('ICU unavailable');
  const [submittingReject, setSubmittingReject] = useState(false);

  useEffect(() => {
    fetchHospitalData();
    const interval = setInterval(fetchHospitalData, 4000);
    return () => clearInterval(interval);
  }, []);

  async function fetchHospitalData() {
    try {
      const hResponse = await apiClient.getHospitals();
      const myHospital = hResponse.results.find(
        (h) => h.organization === user?.organization
      );
      if (!myHospital) {
        setError('No hospital profile registered for your organization.');
        setLoading(false);
        return;
      }
      setHospital(myHospital);

      // Fetch alerts
      const aResponse = await apiClient.getHospitalAlerts();
      const myAlerts = aResponse.results.filter(
        (a) => a.hospital === myHospital.id
      );
      setAlerts(myAlerts);

      // Fetch active handovers
      try {
        const handData = await apiClient.getHandovers();
        const myHandovers = handData.results.filter(
          (h) => h.hospital === myHospital.id && h.status !== 'COMPLETED'
        );
        setHandovers(myHandovers);
      } catch {
        setHandovers([]);
      }
      setError('');
    } catch (err) {
      console.error(err);
      setError('Connection failure retrieving hospital dashboards.');
    } finally {
      setLoading(false);
    }
  }

  // Subscribe to real-time events for this hospital
  useWebSockets('hospital', hospital?.id, (data) => {
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

  if (loading) return <LoadingState />;
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!hospital) return <div className="p-6 text-slate-400">Loading hospital data...</div>;

  // Active alerts (SENT, ACKNOWLEDGED, PREPARING)
  const activeAlerts = alerts.filter(
    (a) => ['SENT', 'ACKNOWLEDGED', 'PREPARING'].includes(a.status)
  );

  // Historic alerts (READY, NOT_READY, RESPONSE_TIMEOUT, CANCELLED)
  const historicAlerts = alerts.filter(
    (a) => !['SENT', 'ACKNOWLEDGED', 'PREPARING'].includes(a.status)
  ).slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
      <header className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{hospital.name} Emergency Console</h1>
          <p className="text-xs text-slate-400">Organization Scoped Hospital Panel</p>
        </div>
        <Button variant="secondary" size="small" onClick={logout}>Logout</Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts and Incoming emergency */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <span className="h-2 w-2 bg-red-500 rounded-full animate-ping"></span>
            Active Emergency Alerts ({activeAlerts.length})
          </h2>

          {activeAlerts.length > 0 ? (
            activeAlerts.map((alert) => (
              <Card
                key={alert.id}
                title={`Incoming Callout - ETA ${alert.eta} mins`}
                className="glass-panel border-indigo-950"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <div>
                      <span className="text-slate-400 text-xs block">Emergency Priority</span>
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
                    <h3 className="text-sm font-semibold text-white mb-2">Hospital Readiness Checklist</h3>
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

                  {/* Actions */}
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
              No active alerts received.
            </Card>
          )}

          {/* Handovers Section */}
          <h2 className="text-lg font-bold text-white mt-8 mb-2">Patient Digital Handovers</h2>
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

        {/* Resources Summary Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Card title="ER Status Summary" className="glass-panel">
            <div className="space-y-4">
              <div>
                <div className="text-slate-400 text-xs mb-1">ER Department Load:</div>
                <Badge variant={
                  hospital.emergency_department_status === 'OPEN' ? 'success' :
                  hospital.emergency_department_status === 'OVERCROWDED' ? 'warning' : 'danger'
                }>
                  {hospital.emergency_department_status}
                </Badge>
              </div>
              <div className="border-t border-slate-800 pt-3">
                <div className="text-sm font-semibold text-white mb-2">Hospital Resource Availability:</div>
                <div className="space-y-2">
                  {hospital.resources?.map((r) => (
                    <div key={r.id} className="flex justify-between items-center text-sm bg-slate-900/40 p-2 rounded">
                      <span className="text-slate-400 uppercase text-xs">{r.resource_type.replace('_', ' ')}</span>
                      <strong className="text-white">{r.available} / {r.total}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* History */}
          <Card title="Alert History logs" className="glass-panel">
            <div className="space-y-3 text-xs max-h-72 overflow-y-auto pr-1">
              {historicAlerts.map((a) => (
                <div key={a.id} className="flex justify-between border-b border-slate-900 pb-2">
                  <div>
                    <div className="text-slate-300 font-semibold">Alert #{a.id} (Priority {a.priority})</div>
                    <div className="text-slate-500">Created: {new Date(a.created_at).toLocaleTimeString()}</div>
                  </div>
                  <span className={`font-bold capitalize ${
                    a.status === 'READY' ? 'text-emerald-500' :
                    a.status === 'NOT_READY' ? 'text-red-500' : 'text-slate-500'
                  }`}>
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
              {historicAlerts.length === 0 && (
                <div className="text-slate-500 text-center py-4">No historic records.</div>
              )}
            </div>
          </Card>
        </div>
      </div>

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
