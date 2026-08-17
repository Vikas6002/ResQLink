import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('demo.dispatcher@resqlink.local');
  const [password, setPassword] = useState('DemoPass123!');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[#0B0F14] font-sans selection:bg-indigo-500 selection:text-white">
      <div className="w-full max-w-md">
        <Card title="RESQLINK — SECURE SIGN IN" className="glass-panel rounded border-[#27313C] p-6 shadow-none">
          <p className="mb-4 text-xs font-mono text-[#8D99A6]">
            AUTHENTICATED EMERGENCY OPERATIONS GATEWAY. SYNTHETIC PROTOTYPE SYSTEM ONLY.
          </p>
          {error && <div className="mb-4"><ErrorState message={error} /></div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-300 font-mono">OPERATIONAL IDENTIFIER (EMAIL)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo.dispatcher@resqlink.local"
                className="w-full rounded border border-[#27313C] bg-[#0B0F14] px-3 py-2 text-white placeholder-slate-600 focus:border-[#4C9AFF] focus:outline-none text-sm font-mono"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-300 font-mono">ACCESS KEY (PASSWORD)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border border-[#27313C] bg-[#0B0F14] px-3 py-2 text-white placeholder-slate-600 focus:border-[#4C9AFF] focus:outline-none text-sm font-mono"
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full mt-4 bg-[#4C9AFF] border-[#4C9AFF] hover:bg-[#4C9AFF]/85 text-white font-mono font-bold text-sm h-10">
              {submitting ? 'VALIDATING SECURITY PARAMS...' : 'ESTABLISH CONNECTIVITY'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
