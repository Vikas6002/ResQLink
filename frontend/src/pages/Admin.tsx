import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useWebSockets } from '../auth/useWebSockets';
import { apiClient, type AuthUser, type Hospital, type Ambulance, type AssetChangeRequest } from '../api/client';
import { Button } from '../components/Button';
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
    } catch {
      setError('Failed to fetch administrator data panels.');
    } finally {
      setLoading(false);
    }
  }

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
    <div className="min-h-screen bg-[#0B0F14] p-6 text-[#E8EDF2] font-sans select-none">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between border-b border-[#27313C] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider text-white font-mono uppercase">
            ResQLink Admin Hub
          </h1>
          <p className="text-xs text-[#8D99A6] mt-1 font-mono">SYSTEM AUDIT VERIFICATION & ACCESS CONTROL</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span>OPERATOR: <strong className="text-[#4C9AFF]">{user?.name}</strong></span>
          <Button variant="secondary" onClick={logout} className="h-8 border border-[#27313C] bg-[#11171F]">Logout</Button>
        </div>
      </header>

      {error && <div className="mb-6"><ErrorState message={error} /></div>}

      {/* Dynamic Summary HUD Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-4 flex flex-col justify-between">
          <span className="text-[10px] text-[#8D99A6] font-bold tracking-wider uppercase font-mono">Pending Change Queries</span>
          <div className="text-3xl font-black text-[#F0A43C] mt-2 font-mono">{pendingRequests.length}</div>
        </div>
        <div className="glass-panel p-4 flex flex-col justify-between">
          <span className="text-[10px] text-[#8D99A6] font-bold tracking-wider uppercase font-mono">Trauma Centers</span>
          <div className="text-3xl font-black text-[#36B37E] mt-2 font-mono">{hospitals.length}</div>
        </div>
        <div className="glass-panel p-4 flex flex-col justify-between">
          <span className="text-[10px] text-[#8D99A6] font-bold tracking-wider uppercase font-mono">Ambulance Fleet Size</span>
          <div className="text-3xl font-black text-[#4C9AFF] mt-2 font-mono">{ambulances.length}</div>
        </div>
        <div className="glass-panel p-4 flex flex-col justify-between">
          <span className="text-[10px] text-[#8D99A6] font-bold tracking-wider uppercase font-mono">Active Operator Logins</span>
          <div className="text-3xl font-black text-slate-300 mt-2 font-mono">{users.length}</div>
        </div>
      </div>

      {/* Asset Change Verification Section */}
      <section className="glass-panel p-6 mb-8">
        <h2 className="text-xs font-bold text-white mb-4 border-b border-[#27313C] pb-2 flex items-center gap-2 font-mono">
          <span className="h-2 w-2 rounded-full bg-[#F0A43C] animate-ping"></span>
          PENDING AUDIT VERIFICATION QUERIES ({pendingRequests.length})
        </h2>
        {pendingRequests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingRequests.map((req) => (
              <div key={req.id} className="border border-[#27313C] rounded p-4 bg-[#0B0F14]/30 hover:border-[#4C9AFF]/40 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-[#4C9AFF] tracking-wider uppercase font-mono">{req.asset_type} CHANGE DATA</span>
                    <Badge variant="warning">PENDING AUDIT</Badge>
                  </div>
                  <h3 className="font-bold text-white text-sm mb-1 font-mono">
                    {req.asset_type === 'HOSPITAL' ? req.hospital_name : `Ambulance ${req.ambulance_number}`}
                  </h3>
                  <div className="text-[10px] text-[#8D99A6] mb-4 font-mono">Submitted at {new Date(req.created_at).toLocaleTimeString()}</div>

                  <div className="bg-[#0B0F14] p-3 rounded border border-[#27313C] space-y-2 mb-4 font-mono text-[11px]">
                    <div className="text-[9px] text-[#8D99A6] font-bold uppercase tracking-wider">Proposed Changes:</div>
                    {req.requested_changes.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between border-b border-[#27313C]/40 pb-1.5 last:border-0 last:pb-0">
                        {req.asset_type === 'HOSPITAL' ? (
                          <>
                            <span className="text-slate-300 uppercase">{item.resource_type.replace('_', ' ')}</span>
                            <span className="text-[#36B37E]">Total: {item.total} • Available: {item.available}</span>
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

                <div className="flex gap-2 justify-end pt-2 border-t border-[#27313C]/60">
                  <Button variant="secondary" onClick={() => setRejectingReq(req)} disabled={saving} className="bg-[#11171F] !px-2.5 !py-1 text-xs">
                    Reject
                  </Button>
                  <Button onClick={() => handleApproveRequest(req.id)} disabled={saving} className="bg-[#36B37E] border-[#36B37E] hover:bg-[#36B37E]/85 !px-2.5 !py-1 text-xs">
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500 py-6 text-center text-xs font-mono">
            No pending asset changes requiring verification.
          </div>
        )}
      </section>

      {/* Main grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="glass-panel p-6">
            <h2 className="text-xs font-bold text-white mb-4 border-b border-[#27313C] pb-2 font-mono">HOSPITAL NETWORK STATUS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hospitals.map((h) => (
                <div key={h.id} className="border border-[#27313C] rounded p-4 bg-[#0B0F14]/20 hover:border-slate-800 transition-all font-mono text-xs">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">H-{h.id.toString().padStart(2, '0')} · {h.name}</h3>
                    <Badge variant={h.emergency_department_status === 'OPEN' ? 'success' : 'danger'}>
                      {h.emergency_department_status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400 mt-2">
                    {h.resources?.map((r) => (
                      <div key={r.id} className="bg-[#0B0F14] p-1 border border-[#27313C]/40 rounded">
                        <div className="truncate text-slate-500">{r.resource_type}</div>
                        <div className="font-bold text-slate-200 mt-0.5">{r.available}/{r.total}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel p-6">
            <h2 className="text-xs font-bold text-white mb-4 border-b border-[#27313C] pb-2 font-mono">AMBULANCE FLEET STATS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ambulances.map((a) => (
                <div key={a.id} className="border border-[#27313C] rounded p-4 bg-[#0B0F14]/20 hover:border-slate-800 transition-all font-mono text-xs">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">Ambulance {a.registration_number}</h3>
                    <Badge variant={a.status === 'AVAILABLE' ? 'success' : 'warning'}>{a.status}</Badge>
                  </div>
                  <div className="text-[10px] text-[#8D99A6]">Capability: <strong className="text-sky-400">{a.capability_level}</strong></div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {a.equipment?.map((e) => (
                      <span key={e.id} className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        e.available ? 'bg-slate-900 border-[#27313C] text-slate-400' : 'bg-red-955/20 border-red-900/40 text-[#E5484D]'
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
          <section className="glass-panel p-6">
            <h2 className="text-xs font-bold text-white mb-4 border-b border-[#27313C] pb-2 font-mono font-bold">VERIFICATION LOG HISTORY</h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {pastRequests.map((req) => (
                <div key={req.id} className="border-b border-[#27313C]/40 pb-2 text-xs font-mono">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-300">
                      {req.asset_type === 'HOSPITAL' ? req.hospital_name : `Ambulance ${req.ambulance_number}`}
                    </span>
                    <span className={req.status === 'APPROVED' ? 'text-[#36B37E]' : 'text-[#E5484D]'}>
                      {req.status}
                    </span>
                  </div>
                  {req.rejection_reason && (
                    <p className="text-[#E5484D] bg-[#E5484D]/10 p-1.5 rounded mt-1 border border-[#E5484D]/20 text-[10px]">
                      Reason: {req.rejection_reason}
                    </p>
                  )}
                </div>
              ))}
              {pastRequests.length === 0 && (
                <div className="text-slate-600 text-center py-6 font-mono text-xs">No historic verification runs.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Reject Request Reason Modal */}
      {rejectingReq && (
        <Modal open={rejectingReq !== null} title="Audit Rejection Reason" onClose={() => setRejectingReq(null)}>
          <div className="space-y-4 text-slate-300 text-sm font-mono">
            <p className="text-xs text-[#8D99A6]">Specify the reason code for rejecting this proposed change. This logs immediately on organization side.</p>
            <div>
              <label className="block text-slate-400 text-xs mb-1 font-mono">Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-[#0B0F14] border border-[#27313C] rounded p-2.5 text-white text-sm focus:border-[#4C9AFF] focus:outline-none h-20 font-mono"
              />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setRejectingReq(null)} className="bg-[#11171F]">Cancel</Button>
              <Button onClick={handleRejectRequest} disabled={saving} className="bg-[#E5484D] border-[#E5484D] hover:bg-[#E5484D]/80">
                Confirm Rejection
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
