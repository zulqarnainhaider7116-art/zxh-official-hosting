import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CreditCard, FileClock, FolderKanban, Gauge, Globe, LayoutDashboard, LogOut, Megaphone, Menu, Moon, Plug, Receipt, Rocket, Settings, ShieldCheck, Sun, Tags, Users, X, HeartPulse, ArrowLeft, Coins } from 'lucide-react';
import Logo from '../../components/Logo';
import Background from '../../components/Background';
import ErrorState from '../../components/ErrorState';
import { FullLoader } from '../../components/ProtectedRoute';
import { LinkButton, Button, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AdminDashboard, AdminUsers, AdminProjects, AdminDeployments, AdminConnections, AdminDomains, AdminUsage, AdminAudit } from './SectionsA';
import { RoleCtx } from './shared';
import { AdminSubscriptions, AdminPayments, AdminPlans, AdminPricing, AdminAnnouncements, AdminHealth, AdminSettings } from './SectionsB';


const NAV = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard },
  { to: 'users', label: 'Users', icon: Users },
  { to: 'projects', label: 'Projects', icon: FolderKanban },
  { to: 'deployments', label: 'Deployments', icon: Rocket },
  { to: 'connections', label: 'Vercel connections', icon: Plug },
  { to: 'domains', label: 'Domains', icon: Globe },
  { to: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: 'payments', label: 'Payment requests', icon: Receipt },
  { to: 'plans', label: 'Plans', icon: Tags },
  { to: 'pricing', label: 'Pricing & payments', icon: Coins },
  { to: 'usage', label: 'Usage', icon: Gauge },
  { to: 'announcements', label: 'Announcements', icon: Megaphone },
  { to: 'health', label: 'System health', icon: HeartPulse },
  { to: 'audit', label: 'Audit logs', icon: FileClock },
  { to: 'settings', label: 'Settings', icon: Settings },
];

function Nav({ onNav }: { onNav?: () => void }) {
  return (
    <nav className="space-y-0.5" aria-label="Admin">
      {NAV.map((n) => (
        <NavLink key={n.to} to={`/admin${n.to ? `/${n.to}` : ''}`} end={n.to === ''} onClick={onNav}
          className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', isActive ? 'glass-strong text-fg' : 'text-muted hover:bg-surface hover:text-fg')}>
          {({ isActive }) => <><n.icon className={cx('h-4 w-4', isActive && 'text-ember')} />{n.label}</>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AdminApp() {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'forbidden' | 'error'; role?: string; email?: string; message?: string }>({ status: 'loading' });
  const [drawer, setDrawer] = useState(false);
  const { signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    api('/api/admin?action=whoami').then((r) => setState({ status: 'ok', role: r.role, email: r.email }))
      .catch((e) => setState({ status: e.status === 403 ? 'forbidden' : 'error', message: e.message }));
  }, []);
  useEffect(() => setDrawer(false), [loc.pathname]);

  if (state.status === 'loading') return <FullLoader label="Verifying admin access" />;
  if (state.status === 'forbidden') return <div className="flex min-h-dvh items-center justify-center p-6"><Background /><ErrorState kind="403" description="The admin console is restricted to authorized staff. This attempt has been noted." actions={<LinkButton to="/app">Back to dashboard</LinkButton>} /></div>;
  if (state.status === 'error') return <div className="flex min-h-dvh items-center justify-center p-6"><Background /><ErrorState kind="generic" description={state.message} actions={<Button onClick={() => window.location.reload()}>Retry</Button>} /></div>;

  const role = state.role || 'support';
  const ctx = { role, canWrite: role === 'admin' || role === 'owner', isOwner: role === 'owner' };

  const sidebar = (onNav?: () => void) => (
    <>
      <div className="flex items-center justify-between px-2"><Logo to="/admin" suffix="Admin" />{onNav && <button onClick={onNav} className="rounded-lg p-2 text-muted" aria-label="Close menu"><X className="h-5 w-5" /></button>}</div>
      <div className="mt-4 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs"><p className="truncate font-medium">{state.email}</p><p className="mt-0.5 flex items-center gap-1 capitalize text-ember"><ShieldCheck className="h-3 w-3" />{role}{role === 'support' && ' · read-only'}</p></div>
      <div className="scroll-thin mt-4 flex-1 overflow-y-auto"><Nav onNav={onNav} /></div>
      <div className="mt-4 space-y-1 border-t border-line pt-4">
        <NavLink to="/app" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"><ArrowLeft className="h-4 w-4" />User app</NavLink>
        <button onClick={async () => { await signOut(); navigate('/login'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-bad hover:bg-bad/10"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </>
  );

  return (
    <RoleCtx.Provider value={ctx}>
      <div className="min-h-dvh">
        <Background />
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r border-line bg-bg/70 px-4 py-5 backdrop-blur-xl lg:flex">{sidebar()}</aside>
        <AnimatePresence>
          {drawer && (
            <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
              <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-bg px-4 py-5">{sidebar(() => setDrawer(false))}</motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="lg:pl-[256px]">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
            <button onClick={() => setDrawer(true)} className="rounded-xl p-2 text-muted lg:hidden" aria-label="Open admin menu"><Menu className="h-5 w-5" /></button>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">Control room</span>
            <div className="ml-auto flex items-center gap-1">
              <NavLink to="/app/notifications" className="rounded-xl p-2 text-muted hover:bg-surface-2" aria-label="Notifications"><Bell className="h-4 w-4" /></NavLink>
              <button onClick={toggle} className="rounded-xl p-2 text-muted hover:bg-surface-2" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <Routes location={loc}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="projects" element={<AdminProjects />} />
                  <Route path="deployments" element={<AdminDeployments />} />
                  <Route path="connections" element={<AdminConnections />} />
                  <Route path="domains" element={<AdminDomains />} />
                  <Route path="subscriptions" element={<AdminSubscriptions />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="plans" element={<AdminPlans />} />
                  <Route path="pricing" element={<AdminPricing />} />
                  <Route path="usage" element={<AdminUsage />} />
                  <Route path="announcements" element={<AdminAnnouncements />} />
                  <Route path="health" element={<AdminHealth />} />
                  <Route path="audit" element={<AdminAudit />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </RoleCtx.Provider>
  );
}

