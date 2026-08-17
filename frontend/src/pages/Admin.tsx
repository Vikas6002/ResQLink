import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiClient, type AuthUser, type Hospital, type Ambulance } from '../api/client';
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
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editing state
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [editingAmbulance, setEditingAmbulance] = useState<Ambulance | null>(null);
  const [resourceEdits, setResourceEdits] = useState<any[]>([]);
  const [equipmentEdits, setEquipmentEdits] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const [uData, hData, aData] = await Promise.all([
        apiClient.getUsers().catch(() => ({ results: [] })),
        apiClient.getHospitals().catch(() => ({ results: [] })),
        apiClient.getAmbulances().catch(() => ({ results: [] })),
      ]);
      setUsers(uData.results);
      setHospitals(hData.results);
      setAmbulances(aData.results);
    } catch (err) {
      setError('Failed to fetch administrator data panels.');
    } finally {
      setLoading(false);
    }
  }

  // Hospital resource edits
  function handleOpenHospitalModal(h: Hospital) {
    setEditingHospital(h);
    setResourceEdits(
      h.resources?.map((r) => ({
        resource_type: r.resource_type,
        total: r.total,
        available: r.available,
      })) || []
    );
  }

  async function saveHospitalResources() {
    if (!editingHospital) return;
    setSaving(true);
    try {
      await apiClient.updateHospitalResources(editingHospital.id, resourceEdits);
      setEditingHospital(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update resources');
    } finally {
      setSaving(false);
    }
  }

  // Ambulance equipment edits
  function handleOpenAmbulanceModal(a: Ambulance) {
    setEditingAmbulance(a);
    setEquipmentEdits(
      a.equipment?.map((e) => ({
        equipment_name: e.equipment_name,
        quantity: e.quantity,
        available: e.available,
      })) || []
    );
  }

  async function saveAmbulanceEquipment() {
    if (!editingAmbulance) return;
    setSaving(true);
    try {
      await apiClient.manageAmbulanceEquipment(editingAmbulance.id, equipmentEdits);
      setEditingAmbulance(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update equipment');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white bg-clip-text bg-gradient-to-r from-indigo-400 to-indigo-600">
            ResQLink Administrative Console
          </h1>
          <p className="text-slate-400 mt-1">Manage system configurations, user profiles, and active emergency assets.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">Admin Mode: <strong>{user?.name}</strong></span>
          <Button variant="secondary" onClick={logout}>Logout</Button>
        </div>
      </header>

      {error && <div className="mb-6"><ErrorState message={error} /></div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card title="System Users" className="glass-panel">
          <div className="text-4xl font-black text-indigo-400">{users.length}</div>
          <p className="text-slate-400 text-sm mt-1">Registered accounts</p>
        </Card>
        <Card title="Hospitals" className="glass-panel">
          <div className="text-4xl font-black text-emerald-400">{hospitals.length}</div>
          <p className="text-slate-400 text-sm mt-1">Operational trauma centers</p>
        </Card>
        <Card title="Ambulance Fleet" className="glass-panel">
          <div className="text-4xl font-black text-sky-400">{ambulances.length}</div>
          <p className="text-slate-400 text-sm mt-1">Response vehicles in system</p>
        </Card>
        <Card title="Database Status" className="glass-panel">
          <div className="text-xl font-bold text-emerald-500 flex items-center gap-2 mt-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
            Online & Connected
          </div>
          <p className="text-slate-400 text-sm mt-1">PostgreSQL master database</p>
        </Card>
      </div>

      <div className="space-y-8">
        {/* Users Section */}
        <section className="glass-panel rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">Authorized Users</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Organization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-3 font-semibold text-white">{u.name}</td>
                    <td className="px-4 py-3 text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        u.role === 'ADMIN' ? 'bg-indigo-950 text-indigo-400' :
                        u.role === 'DISPATCHER' ? 'bg-amber-950 text-amber-400' :
                        u.role === 'HOSPITAL_STAFF' ? 'bg-emerald-950 text-emerald-400' :
                        'bg-sky-950 text-sky-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.organization_name || 'System Admin'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Hospital Resources Section */}
        <section className="glass-panel rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">Hospital Capacity Management</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {hospitals.map((h) => (
              <div key={h.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/40 hover:border-slate-700 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-white text-base">{h.name}</h3>
                    <p className="text-xs text-slate-400">ED Status: <strong>{h.emergency_department_status}</strong></p>
                  </div>
                  <Button variant="secondary" size="small" onClick={() => handleOpenHospitalModal(h)}>
                    Edit Resources
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {h.resources?.map((r) => (
                    <div key={r.id} className="bg-slate-950/60 p-2 rounded text-center border border-slate-800">
                      <div className="text-xs text-slate-400 truncate">{r.resource_type}</div>
                      <div className="text-sm font-bold text-white mt-1">
                        {r.available} / {r.total}
                      </div>
                    </div>
                  )) || <div className="text-xs text-slate-500 col-span-3">No resources initialized</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ambulance Equipment Section */}
        <section className="glass-panel rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">Ambulance Fleet Status & Equipment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ambulances.map((a) => (
              <div key={a.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/40 hover:border-slate-700 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-white text-base">Ambulance {a.registration_number}</h3>
                    <div className="flex gap-2 items-center mt-1">
                      <Badge variant={a.status === 'AVAILABLE' ? 'success' : 'warning'}>{a.status}</Badge>
                      <span className="text-xs text-slate-400">{a.capability_level}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="small" onClick={() => handleOpenAmbulanceModal(a)}>
                    Edit Equipment
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {a.equipment?.map((e) => (
                    <span key={e.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs border ${
                      e.available && e.quantity > 0 ? 'bg-slate-950/80 border-slate-700 text-slate-300' : 'bg-red-950/20 border-red-900/40 text-red-400'
                    }`}>
                      {e.equipment_name} ({e.quantity})
                    </span>
                  )) || <div className="text-xs text-slate-500">No equipment configured</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Hospital Resources Edit Modal */}
      {editingHospital && (
        <Modal title={`Modify Resources: ${editingHospital.name}`} onClose={() => setEditingHospital(null)}>
          <div className="space-y-4">
            {resourceEdits.map((res, index) => (
              <div key={res.resource_type} className="border border-slate-800 p-3 rounded bg-slate-900/50">
                <div className="font-bold text-slate-300 text-sm mb-2 uppercase">{res.resource_type.replace('_', ' ')}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Total</label>
                    <input
                      type="number"
                      min="0"
                      value={res.total}
                      onChange={(e) => {
                        const newEdits = [...resourceEdits];
                        newEdits[index].total = parseInt(e.target.value) || 0;
                        setResourceEdits(newEdits);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Available</label>
                    <input
                      type="number"
                      min="0"
                      value={res.available}
                      onChange={(e) => {
                        const newEdits = [...resourceEdits];
                        newEdits[index].available = parseInt(e.target.value) || 0;
                        setResourceEdits(newEdits);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setEditingHospital(null)} disabled={saving}>Cancel</Button>
              <Button onClick={saveHospitalResources} disabled={saving}>
                {saving ? 'Saving...' : 'Save Resources'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Ambulance Equipment Edit Modal */}
      {editingAmbulance && (
        <Modal title={`Modify Equipment: Ambulance ${editingAmbulance.registration_number}`} onClose={() => setEditingAmbulance(null)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {equipmentEdits.map((eq, index) => (
              <div key={eq.equipment_name} className="border border-slate-800 p-3 rounded bg-slate-900/50 flex items-center justify-between gap-4">
                <div className="font-bold text-slate-300 text-sm capitalize">{eq.equipment_name}</div>
                <div className="flex items-center gap-4">
                  <div className="w-24">
                    <label className="text-[10px] text-slate-400 block mb-0.5">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={eq.quantity}
                      onChange={(e) => {
                        const newEdits = [...equipmentEdits];
                        newEdits[index].quantity = parseInt(e.target.value) || 0;
                        setEquipmentEdits(newEdits);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Available</label>
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
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="secondary" onClick={() => setEditingAmbulance(null)} disabled={saving}>Cancel</Button>
              <Button onClick={saveAmbulanceEquipment} disabled={saving}>
                {saving ? 'Saving...' : 'Save Equipment'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
