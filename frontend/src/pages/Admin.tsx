import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

export default function AdminPage() {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-slate-500">System administration placeholder</p>
        </div>
        <Button variant="secondary" onClick={() => logout()}>Logout</Button>
      </div>
      <Card title="Welcome">
        <p className="mb-2">Signed in as <strong>{user?.name}</strong></p>
        <Badge variant="danger">ADMIN</Badge>
      </Card>
    </div>
  );
}
