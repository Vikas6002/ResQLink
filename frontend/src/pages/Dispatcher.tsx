import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

export default function DispatcherPage() {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispatcher Console</h1>
          <p className="text-slate-500">Phase 1 placeholder — full dashboard in Prompt 2</p>
        </div>
        <Button variant="secondary" onClick={() => logout()}>Logout</Button>
      </div>
      <Card title="Welcome">
        <p className="mb-2">Signed in as <strong>{user?.name}</strong></p>
        <Badge variant="warning">DISPATCHER</Badge>
        <p className="mt-4 text-sm text-slate-600">
          Use the REST API for emergency creation, verification, and optimization in this phase.
        </p>
      </Card>
    </div>
  );
}
