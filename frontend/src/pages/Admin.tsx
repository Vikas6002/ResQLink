import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import { apiClient, type AuthUser, type Hospital, type Ambulance, type AssetChangeRequest } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [changeRequests, setChangeRequests] = useState<AssetChangeRequest[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reject Request Modal state
  const [rejectingReq, setRejectingReq] = useState<AssetChangeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('Insufficient proof of capacity');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4500);
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    try {
      const [uData, hData, aData, rData] = await Promise.all([
        apiClient.getUsers().catch(() => ({ results: [] })),
        apiClient.getHospitals().catch(() => ({ results: [] })),
        apiClient.getAmbulances().catch(() => ({ results: [] })),
        apiClient.getAssetChangeRequests().catch(() => ({ results: [] })),
      ]);
      setUsers(uData.results);
      setHospitals(hData.results);
      setAmbulances(aData.results);
      setChangeRequests(rData.results);
    } catch (err) {
      setError('Failed to fetch administrator data panels.');
    } finally {
      setLoading(false);
    }
  }

  // Subscribe to real-time events on the dispatcher channel
  useWebSockets('dispatcher', null, (data) => {
    console.log('WS Admin Event:', data);
    fetchData();
  });

  async function handleApproveRequest(id: number) {
    setSaving(true);
    try {
      await apiClient.approveAssetChangeRequest(id);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleRejectRequest() {
    if (!rejectingReq) return;
    setSaving(true);
    try {
      await apiClient.rejectAssetChangeRequest(rejectingReq.id, rejectReason);
      setRejectingReq(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  const pendingRequests = changeRequests.filter((r) => r.status === 'PENDING');
  const pastRequests = changeRequests.filter((r) => r.status !== 'PENDING').slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100 font-sans">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-slate-850 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            ResQLink Admin Hub
          </h1>
          <p className="text-slate-400 mt-1">Audit verify system change queries, user logs, and medical asset configs.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">User: <strong className="text-indigo-400">{user?.name}</strong></span>
          <Button variant="secondary" onClick={logout}>Logout</Button>
        </div>
      </header>

      {error && <div className="mb-6"><ErrorState message={error} /></div>}

      {/* Dynamic Summary HUD Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="glass-panel relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 text-6xl font-bold select-none group-hover:text-indigo-950 transition-colors">REQ</div>
          <div className="text-sm text-slate-400 font-semibold tracking-wider uppercase">Pending Queries</div>
          <div className="text-4xl font-black text-indigo-400 mt-2">{pendingRequests.length}</div>
          <p className="text-slate-500 text-xs mt-1">Awaiting verification</p>
        </Card>
        <Card className="glass-panel relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 text-6xl font-bold select-none group-hover:text-emerald-950 transition-colors">HOSP</div>
          <div className="text-sm text-slate-400 font-semibold tracking-wider uppercase">Trauma Centers</div>
          <div className="text-4xl font-black text-emerald-400 mt-2">{hospitals.length}</div>
          <p className="text-slate-500 text-xs mt-1">Operational in network</p>
        </Card>
        <Card className="glass-panel relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 text-6xl font-bold select-none group-hover:text-sky-950 transition-colors">AMB</div>
          <div className="text-sm text-slate-400 font-semibold tracking-wider uppercase">Fleet Size</div>
          <div className="text-4xl font-black text-sky-400 mt-2">{ambulances.length}</div>
          <p className="text-slate-500 text-xs mt-1">Response vehicles online</p>
        </Card>
        <Card className="glass-panel relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 text-6xl font-bold select-none group-hover:text-amber-955 transition-colors">USER</div>
          <div className="text-sm text-slate-400 font-semibold tracking-wider uppercase">Active Staff</div>
          <div className="text-4xl font-black text-amber-400 mt-2">{users.length}</div>
          <p className="text-slate-500 text-xs mt-1">Verified user sessions</p>
        </Card>
      </div>

      {/* Asset Change Verification Section */}
      <section className="glass-panel rounded-xl p-6 mb-8 border-indigo-950/60 shadow-indigo-950/10">
        <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-850 pb-2 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-ping"></span>
          Asset Update Verification Requests ({pendingRequests.length})
        </h2>
        {pendingRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingRequests.map((req) => (
              <div key={req.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/30 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-indigo-400 tracking-wider uppercase">{req.asset_type} UPDATE REQUEST</span>
                    <Badge variant="warning">PENDING</Badge>
                  </div>
                  <h3 className="font-bold text-white text-base mb-1">
                    {req.asset_type === 'HOSPITAL' ? req.hospital_name : `Ambulance ${req.ambulance_number}`}
                  </h3>
                  <div className="text-xs text-slate-400 mb-4">Submitted by {req.created_by_name} at {new Date(req.created_at).toLocaleTimeString()}</div>

                  <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-850 space-y-2 mb-4">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Proposed Changes:</div>
                    {req.requested_changes.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs border-b border-slate-900 pb-1.5 last:border-0 last:pb-0">
                        {req.asset_type === 'HOSPITAL' ? (
                          <>
                            <span className="text-slate-300 uppercase">{item.resource_type.replace('_', ' ')}</span>
                            <span className="text-indigo-300">Total: {item.total} • Available: {item.available}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-300 capitalize">{item.equipment_name}</span>
                            <span className="text-sky-300">Qty: {item.quantity} • {item.available ? 'Available' : 'Unavailable'}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="small" onClick={() => setRejectingReq(req)} disabled={saving}>
                    Reject
                  </Button>
                  <Button size="small" onClick={() => handleApproveRequest(req.id)} disabled={saving}>
                    Approve & Verify
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500 py-6 text-center text-sm">
            All asset change logs verified. Ready and on standby.
          </div>
        )}
      </section>

      {/* Main grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Hospital Fleet status */}
        <div className="lg:col-span-2 space-y-8">
          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-850 pb-2">Hospital Network Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hospitals.map((h) => (
                <div key={h.id} className="border border-slate-850 rounded-lg p-4 bg-slate-900/20 hover:border-slate-800 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">{h.name}</h3>
                    <Badge variant={h.emergency_department_status === 'OPEN' ? 'success' : 'danger'}>
                      {h.emergency_department_status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400 mt-2">
                    {h.resources?.map((r) => (
                      <div key={r.id} className="bg-slate-950/40 p-1 border border-slate-900 rounded">
                        <div className="truncate text-slate-500">{r.resource_type}</div>
                        <div className="font-bold text-slate-200 mt-0.5">{r.available} / {r.total}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-850 pb-2">Ambulance Fleet Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ambulances.map((a) => (
                <div key={a.id} className="border border-slate-850 rounded-lg p-4 bg-slate-900/20 hover:border-slate-800 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">Ambulance {a.registration_number}</h3>
                    <Badge variant={a.status === 'AVAILABLE' ? 'success' : 'warning'}>{a.status}</Badge>
                  </div>
                  <div className="text-[10px] text-slate-400">Capability: <strong className="text-sky-400">{a.capability_level}</strong></div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {a.equipment?.map((e) => (
                      <span key={e.id} className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        e.available ? 'bg-slate-950/60 border-slate-900 text-slate-400' : 'bg-red-950/20 border-red-900/40 text-red-400'
                      }`}>
                        {e.equipment_name} ({e.quantity})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Change log auditing sidebar */}
        <div className="space-y-6">
          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-850 pb-2">Past Verification Logs</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {pastRequests.map((req) => (
                <div key={req.id} className="border-b border-slate-900 pb-2 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-300">
                      {req.asset_type === 'HOSPITAL' ? req.hospital_name : `Ambulance ${req.ambulance_number}`}
                    </span>
                    <span className={req.status === 'APPROVED' ? 'text-emerald-500' : 'text-red-500'}>
                      {req.status}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[10px] mt-0.5">Reviewed by {req.reviewed_by_name || 'System'}</p>
                  {req.rejection_reason && (
                    <p className="text-red-400/80 bg-red-955/10 p-1.5 rounded mt-1 border border-red-950/40 text-[10px]">
                      Reason: {req.rejection_reason}
                    </p>
                  )}
                </div>
              ))}
              {pastRequests.length === 0 && (
                <div className="text-slate-600 text-center py-6">No historic verification runs.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Reject Request Reason Modal */}
      {rejectingReq && (
        <Modal title="Enter Rejection Reason" onClose={() => setRejectingReq(null)}>
          <div className="space-y-4 text-slate-300 text-sm">
            <p>Specify the rejection reason for this change request. The hospital/ambulance crew will receive this logs notification.</p>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-white text-sm focus:border-indigo-500 focus:outline-none h-20"
              />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setRejectingReq(null)}>Cancel</Button>
              <Button onClick={handleRejectRequest} disabled={saving}>
                Confirm Rejection
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
