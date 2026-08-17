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

  useWebSockets('hospital', selectedHospitalId, (data) => {
    console.log('WS Hospital Event:', data);
    fetchHospitalData();
  });

  async function handleAcknowledge(id: number) {
    try {
      await apiClient.acknowledgeAlert(id);
      await fetchHospitalData();
    } catch {
      alert('Acknowledge alert failed');
    }
  }

  async function handlePrepare(id: number) {
    try {
      await apiClient.prepareAlert(id);
      await fetchHospitalData();
    } catch {
      alert('Start preparation failed');
    }
  }

  async function handleReady(id: number) {
    try {
      await apiClient.readyAlert(id);
      await fetchHospitalData();
    } catch {
      alert('Marking ready failed');
    }
  }

  async function submitNotReady() {
    if (!rejectingAlert) return;
    setSubmittingReject(true);
    try {
      await apiClient.notReadyAlert(rejectingAlert.id, rejectReason);
      setRejectingAlert(null);
      await fetchHospitalData();
    } catch {
      alert('Rejection submission failed');
    } finally {
      setSubmittingReject(false);
    }
  }

  async function handleAcceptHandover(id: number) {
    try {
      await apiClient.acceptHandover(id);
      await fetchHospitalData();
    } catch {
      alert('Accept handover failed');
    }
  }

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
    } catch {
      alert('Failed to submit resource update request');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!hospital) return <div className="p-6 text-slate-400">Loading hospital data...</div>;

  const activeAlerts = alerts.filter((a) => ['SENT', 'ACKNOWLEDGED', 'PREPARING', 'READY'].includes(a.status));
  const activeAlert = activeAlerts[0]; // Center primary incoming case focus

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#E8EDF2] flex flex-col select-none overflow-hidden font-sans">
      {/* Top Banner Header */}
      <header className="h-14 border-b border-[#27313C] bg-[#11171F] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[#36B37E] font-bold text-sm tracking-wider">H-{hospital.id.toString().padStart(2, '0')}</span>
          <h1 className="text-sm font-bold uppercase tracking-wider text-white">
            {hospital.name} COMMAND DESK
          </h1>
          <div className="h-4 w-[1px] bg-[#27313C]"></div>
          <span className="text-[10px] bg-[#36B37E]/10 border border-[#36B37E]/40 text-[#36B37E] font-bold px-2 py-0.5 rounded font-mono">
            ● OPERATIONAL
          </span>
        </div>

        {/* Dropdown Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8D99A6]">Trauma Center Unit:</span>
          <select
            value={selectedHospitalId || ''}
            onChange={(e) => {
              const val = parseInt(e.target.value) || null;
              setSelectedHospitalId(val);
            }}
            className="bg-[#0B0F14] border border-[#27313C] rounded px-3 py-1.5 text-xs text-[#E8EDF2] focus:outline-none focus:ring-1 focus:ring-[#4C9AFF]"
          >
            {hospitalsList.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={handleOpenRequestModal} className="h-8 border border-[#27313C] bg-[#11171F] !px-2.5 !py-1 text-xs">
            Request Capacity Update
          </Button>
          <Button variant="secondary" onClick={logout} className="h-8 !px-2.5 !py-1 text-xs">Logout</Button>
        </div>
      </header>

      {/* Workspace Split Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Incoming Emergency Readiness Case */}
        <section className="flex-1 border-r border-[#27313C] p-6 overflow-y-auto space-y-6 bg-[#0B0F14]/50">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#8D99A6] border-b border-[#27313C] pb-2">
            INCOMING EMERGENCY INCIDENT
          </h2>

          {activeAlert ? (
            <div className="border border-[#27313C] rounded bg-[#11171F] p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block">CASE IDENTIFIER</span>
                  <span className="font-mono text-xl font-bold text-white">E-{activeAlert.emergency}</span>
                </div>
                <Badge variant={activeAlert.priority === 'CRITICAL' ? 'danger' : 'warning'}>
                  {`${activeAlert.priority} PRIORITY`}
                </Badge>
              </div>

              {/* Monospace ETA Clock */}
              <div className="bg-[#0B0F14] p-6 rounded border border-[#27313C] text-center">
                <span className="text-[10px] text-[#8D99A6] font-bold tracking-wider block mb-1">REMAINING TRANSIT ETA</span>
                <span className="font-mono text-4xl font-black text-[#F0A43C]">
                  {activeAlert.eta.toString().padStart(2, '0')}:00 MIN
                </span>
                <p className="text-[10px] text-slate-500 mt-2 font-mono">Assigned Response: Ambulance A{activeAlert.id}</p>
              </div>

              {/* Deliberate Checklist */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-[#8D99A6] tracking-wider">PREPARATION CHECKLIST</h3>
                <div className="space-y-2">
                  {activeAlert.readiness_checklist?.map((item: any) => {
                    const isReady = item.status === 'READY';
                    return (
                      <div key={item.key} className="flex items-center justify-between p-2.5 rounded bg-[#0B0F14]/60 border border-[#27313C] text-xs font-mono">
                        <span className="text-slate-300">{item.label}</span>
                        <span className={isReady ? 'text-[#36B37E] font-bold' : 'text-[#F0A43C] font-bold animate-pulse'}>
                          {isReady ? '✓ READY' : '⚠ PENDING CHECK'}
                        </span>
                      </div>
                    );
                  }) || (
                    <div className="space-y-2">
                      <div className="flex justify-between p-2.5 rounded bg-[#0B0F14]/60 border border-[#27313C] text-xs font-mono">
                        <span>ICU Bed Reservation</span>
                        <span className="text-[#36B37E] font-bold">✓ READY</span>
                      </div>
                      <div className="flex justify-between p-2.5 rounded bg-[#0B0F14]/60 border border-[#27313C] text-xs font-mono">
                        <span>Trauma Bay Clearance</span>
                        <span className="text-[#F0A43C] font-bold">⚠ CHECKING</span>
                      </div>
                      <div className="flex justify-between p-2.5 rounded bg-[#0B0F14]/60 border border-[#27313C] text-xs font-mono">
                        <span>Specialist Notification</span>
                        <span className="text-[#36B37E] font-bold">✓ READY</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ready Status Banner */}
              {activeAlert.status === 'READY' && (
                <div className="bg-[#36B37E]/10 border border-[#36B37E]/40 text-[#36B37E] font-mono font-bold text-center py-2.5 rounded text-xs tracking-wider">
                  ● READY FOR ARRIVAL
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-3 border-t border-[#27313C] pt-4">
                {activeAlert.status === 'SENT' && (
                  <Button onClick={() => handleAcknowledge(activeAlert.id)} className="col-span-3">
                    ACKNOWLEDGE INCIDENT
                  </Button>
                )}
                {activeAlert.status === 'ACKNOWLEDGED' && (
                  <Button onClick={() => handlePrepare(activeAlert.id)} className="col-span-3">
                    [ START PREPARATION ]
                  </Button>
                )}
                {activeAlert.status === 'PREPARING' && (
                  <>
                    <Button variant="secondary" onClick={() => setRejectingAlert(activeAlert)} className="border-[#E5484D]/40 text-[#E5484D] bg-[#0B0F14] hover:bg-[#E5484D]/10">
                      [ CANNOT ACCEPT ]
                    </Button>
                    <Button onClick={() => handleReady(activeAlert.id)} className="col-span-2">
                      [ MARK READY ]
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-[#27313C] rounded bg-[#11171F] p-8 text-center text-slate-500 font-mono text-xs">
              No live incoming incident calls active for this center.
            </div>
          )}

          {/* Active Handovers */}
          {handovers.length > 0 && (
            <div className="border border-[#27313C] rounded bg-[#11171F] p-4 space-y-3 mt-6">
              <h3 className="text-xs font-bold uppercase text-[#8D99A6] tracking-wider">DIGITAL TRANSFER HANDOVER</h3>
              {handovers.map((hand) => (
                <div key={hand.id} className="space-y-3 border-t border-[#27313C] pt-3 first:border-0 first:pt-0">
                  <div className="text-xs flex justify-between font-mono">
                    <span className="text-slate-400">Status:</span>
                    <strong className="text-[#4C9AFF] uppercase">{hand.status}</strong>
                  </div>
                  {hand.notes && (
                    <div className="bg-[#0B0F14] p-3 rounded border border-[#27313C] text-xs font-mono text-slate-300">
                      {hand.notes}
                    </div>
                  )}
                  {hand.status === 'SUBMITTED' && (
                    <Button onClick={() => handleAcceptHandover(hand.id)} className="w-full text-xs !py-1.5">
                      Accept Patient Handover
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Side: Trauma Capacity Indicators & Requests */}
        <section className="w-96 p-6 overflow-y-auto space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#8D99A6] border-b border-[#27313C] pb-2">
            RESOURCES & CAPACITIES
          </h2>

          {/* Styled resource bar indicators */}
          <div className="border border-[#27313C] rounded bg-[#11171F] p-4 space-y-5">
            {hospital.resources?.map((r) => {
              const maxTicks = 10;
              const ratio = r.total > 0 ? r.available / r.total : 0;
              const filledTicks = Math.round(ratio * maxTicks);
              const barStr = '█'.repeat(filledTicks).padEnd(maxTicks, '░');
              return (
                <div key={r.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-slate-400 uppercase font-bold">
                    <span>{r.resource_type.replace('_', ' ')}</span>
                    <span>{r.available} / {r.total}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-sm text-[#8D99A6]">
                    <span className="text-[#4C9AFF] tracking-tight">{barStr}</span>
                    <span className="text-xs">{r.available > 0 ? 'AVAILABLE' : 'DEPL'}</span>
                  </div>
                </div>
              );
            }) || (
              <div className="text-xs text-slate-500 font-mono text-center">No capacity metrics.</div>
            )}
          </div>

          {/* Capacity change request history sidebar */}
          <Card title="Asset Change Queries" className="glass-panel text-xs">
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {changeRequests.map((req) => (
                <div key={req.id} className="border-b border-[#27313C]/40 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between font-mono">
                    <span className="font-semibold text-white">Query #{req.id}</span>
                    <span className={`font-bold ${
                      req.status === 'APPROVED' ? 'text-[#36B37E]' :
                      req.status === 'REJECTED' ? 'text-[#E5484D]' : 'text-[#F0A43C] animate-pulse'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                  <div className="text-[9px] text-[#8D99A6] mt-1 font-mono">Submitted at {new Date(req.created_at).toLocaleTimeString()}</div>
                  {req.rejection_reason && (
                    <div className="text-[9px] text-[#E5484D] bg-[#E5484D]/10 p-1 rounded mt-1 border border-[#E5484D]/30 font-mono">
                      Reason: {req.rejection_reason}
                    </div>
                  )}
                </div>
              ))}
              {changeRequests.length === 0 && (
                <div className="text-slate-600 text-center py-4 font-mono">No capacity update queries submitted.</div>
              )}
            </div>
          </Card>
        </section>
      </main>

      {/* Resource update request modal */}
      {showRequestModal && (
        <Modal open={showRequestModal} title="Request Capacity Modification" onClose={() => setShowRequestModal(false)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 text-slate-300">
            <p className="text-xs text-[#8D99A6] font-mono">
              Proposed resource updates will be routed to the system administrator for audit verification.
            </p>
            {resourceEdits.map((res, index) => (
              <div key={res.resource_type} className="border border-[#27313C] p-3 rounded bg-[#0B0F14]/50">
                <div className="font-bold text-slate-300 text-xs mb-2 uppercase tracking-wide font-mono">
                  {res.resource_type.replace('_', ' ')}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-mono">Total Capacity</label>
                    <input
                      type="number"
                      min="0"
                      value={res.total}
                      onChange={(e) => {
                        const newEdits = [...resourceEdits];
                        newEdits[index].total = parseInt(e.target.value) || 0;
                        setResourceEdits(newEdits);
                      }}
                      className="w-full bg-[#0B0F14] border border-[#27313C] rounded px-2.5 py-1 text-white text-xs focus:border-[#4C9AFF] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-mono">Available Count</label>
                    <input
                      type="number"
                      min="0"
                      value={res.available}
                      onChange={(e) => {
                        const newEdits = [...resourceEdits];
                        newEdits[index].available = parseInt(e.target.value) || 0;
                        setResourceEdits(newEdits);
                      }}
                      className="w-full bg-[#0B0F14] border border-[#27313C] rounded px-2.5 py-1 text-white text-xs focus:border-[#4C9AFF] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-[#27313C]">
              <Button variant="secondary" onClick={() => setShowRequestModal(false)} disabled={saving} className="bg-[#11171F]">Cancel</Button>
              <Button onClick={submitResourceChangeRequest} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cannot Accept Reason Modal (Deliberate selection) */}
      {rejectingAlert && (
        <Modal open={rejectingAlert !== null} title="CANNOT ACCEPT THIS EMERGENCY" onClose={() => setRejectingAlert(null)}>
          <div className="space-y-4 text-slate-300 text-sm font-mono">
            <p className="text-xs text-[#8D99A6]">Select reason for rejecting this case. This initiates immediate dispatcher reassessment.</p>
            <div className="space-y-2 border border-[#27313C] p-3 rounded bg-[#0B0F14]/75">
              {[
                'ICU unavailable',
                'Emergency department overloaded',
                'Specialist unavailable',
                'Equipment unavailable',
                'Insufficient capacity',
                'Other',
              ].map((reason) => (
                <label key={reason} className="flex items-center gap-3 cursor-pointer p-1 text-xs">
                  <input
                    type="radio"
                    name="rejectReason"
                    value={reason}
                    checked={rejectReason === reason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="h-4 w-4 accent-[#E5484D] bg-[#0B0F14] border-[#27313C]"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setRejectingAlert(null)} disabled={submittingReject} className="bg-[#11171F]">Cancel</Button>
              <Button onClick={submitNotReady} disabled={submittingReject} className="bg-[#E5484D] border-[#E5484D] hover:bg-[#E5484D]/80">
                {submittingReject ? 'Submitting...' : 'CONFIRM'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
