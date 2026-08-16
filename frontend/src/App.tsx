import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LoadingState } from './components/LoadingState';
import AdminPage from './pages/Admin';
import AmbulancePage from './pages/Ambulance';
import DispatcherPage from './pages/Dispatcher';
import HospitalPage from './pages/Hospital';
import LoginPage from './pages/Login';

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;

  const routes: Record<string, string> = {
    ADMIN: '/admin',
    DISPATCHER: '/dispatcher',
    HOSPITAL_STAFF: '/hospital',
    AMBULANCE_OPERATOR: '/ambulance',
  };
  return <Navigate to={routes[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dispatcher"
        element={
          <ProtectedRoute roles={['ADMIN', 'DISPATCHER']}>
            <DispatcherPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hospital"
        element={
          <ProtectedRoute roles={['ADMIN', 'HOSPITAL_STAFF']}>
            <HospitalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ambulance"
        element={
          <ProtectedRoute roles={['ADMIN', 'AMBULANCE_OPERATOR']}>
            <AmbulancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
