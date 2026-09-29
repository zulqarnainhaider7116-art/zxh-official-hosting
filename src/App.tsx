import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import ProtectedRoute, { FullLoader } from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Background from './components/Background';
import ErrorState from './components/ErrorState';
import { LinkButton } from './components/ui';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Verify = lazy(() => import('./pages/auth/Verify'));
const Docs = lazy(() => import('./pages/Docs'));
const Legal = lazy(() => import('./pages/Legal'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Projects = lazy(() => import('./pages/app/Projects'));
const NewProject = lazy(() => import('./pages/app/NewProject'));
const ProjectDetail = lazy(() => import('./pages/app/ProjectDetail'));
const Deployments = lazy(() => import('./pages/app/Deployments'));
const DeploymentView = lazy(() => import('./pages/app/DeploymentView'));
const Connections = lazy(() => import('./pages/app/Connections'));
const Domains = lazy(() => import('./pages/app/Domains'));
const Billing = lazy(() => import('./pages/app/Billing'));
const Notifications = lazy(() => import('./pages/app/Notifications'));
const SettingsPage = lazy(() => import('./pages/app/Settings'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

function SessionWatcher() {
  const navigate = useNavigate();
  const toast = useToast();
  const { signOut } = useAuth();
  useEffect(() => {
    const expired = async () => {
      await signOut('local');
      toast.warning('Session expired', 'Please sign in again.');
      navigate(`/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`);
    };
    window.addEventListener('df:session-expired', expired);
    return () => window.removeEventListener('df:session-expired', expired);
  }, [navigate, toast, signOut]);
  return null;
}

function StandaloneError({ kind }: { kind: '404' | '401' | '403' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <Background />
      <ErrorState kind={kind} actions={<>
        <LinkButton to="/" variant="secondary">Back home</LinkButton>
        {kind === '401' ? <LinkButton to="/login">Sign in</LinkButton> : <LinkButton to="/app">Open dashboard</LinkButton>}
      </>} />
      <Link to="/docs" className="mt-2 text-xs text-muted hover:text-fg">Need help? Read the docs</Link>
    </div>
  );
}

function InAppNotFound() {
  return <ErrorState kind="404" actions={<LinkButton to="/app">Back to dashboard</LinkButton>} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <SessionWatcher />
            <Suspense fallback={<FullLoader />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="/terms" element={<Legal kind="terms" />} />
                <Route path="/privacy" element={<Legal kind="privacy" />} />
                <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="projects/:id" element={<ProjectDetail />} />
                  <Route path="new" element={<NewProject />} />
                  <Route path="deployments" element={<Deployments />} />
                  <Route path="deployments/:id" element={<DeploymentView />} />
                  <Route path="connections" element={<Connections />} />
                  <Route path="domains" element={<Domains />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<InAppNotFound />} />
                </Route>
                <Route path="/admin/*" element={<ProtectedRoute><AdminApp /></ProtectedRoute>} />
                <Route path="/401" element={<StandaloneError kind="401" />} />
                <Route path="/403" element={<StandaloneError kind="403" />} />
                <Route path="*" element={<StandaloneError kind="404" />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
