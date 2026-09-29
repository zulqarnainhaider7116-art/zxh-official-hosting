import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CreditCard, FolderKanban, Globe, LayoutDashboard, LogOut, Menu, Moon, Plug, Plus, Rocket, Settings, Sun, X, WifiOff, MailWarning, Megaphone, ChevronRight, Shield, CheckCheck } from 'lucide-react';
import Logo from './Logo';
import Background from './Background';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { usePublicConfig, useOnline } from '../lib/useConfig';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import supabase from '../lib/supabase';
import { Button, LinkButton, Progress, Spinner, cx } from './ui';
import ErrorState from './ErrorState';
import { FullLoader } from './ProtectedRoute';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban },
  { to: '/app/deployments', label: 'Deployments', icon: Rocket },
  { to: '/app/domains', label: 'Domains', icon: Globe },
  { to: '/app/connections', label: 'Vercel connections', icon: Plug },
  { to: '/app/billing', label: 'Plan & billing', icon: CreditCard },
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

function NavItems({ onNavigate, unread }: { onNavigate?: () => void; unread: number }) {
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate}
          className={({ isActive }) => cx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-ember', isActive ? 'text-fg' : 'text-muted hover:bg-surface hover:text-fg')}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-active" className="glass-strong absolute inset-0 rounded-xl" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-forge" />}
              <n.icon className={cx('relative h-[18px] w-[18px]', isActive && 'text-ember')} />
              <span className="relative">{n.label}</span>
              {n.to === '/app/notifications' && unread > 0 && <span className="relative ml-auto rounded-full bg-ember px-1.5 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function QuotaCard() {
  const { me } = useAuth();
  if (!me) return <div className="skeleton h-24 rounded-2xl" />;
  const pct = me.quota.limit ? (me.quota.used / me.quota.limit) * 100 : 0;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Plan</span>
        <span className="rounded-md bg-ember/10 px-2 py-0.5 text-[11px] font-semibold text-ember">{me.plan?.name || 'Free'}</span>
      </div>
      <p className="mt-2 text-sm font-medium">{me.quota.used} / {me.quota.limit} projects</p>
      <Progress value={pct} className="mt-2 h-1.5" tone={pct >= 100 ? 'bad' : 'forge'} />
      <Link to="/app/billing" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ember hover:underline">Manage plan <ChevronRight className="h-3 w-3" /></Link>
    </div>
  );
}

function NotificationBell() {
  const { me, setUnread } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const unread = me?.unread || 0;

  useEffect(() => {
    if (!open) return;
    setItems(null);
    api('/api/me?action=notifications&size=6').then((d) => { setItems(d.items); setUnread(d.unread); }).catch(() => setItems([]));
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open, setUnread]);

  const openItem = async (n: any) => {
    setOpen(false);
    if (!n.read_at) { api('/api/me?action=notifications', { method: 'POST', body: { id: n.id } }).catch(() => {}); setUnread(Math.max(0, unread - 1)); }
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await api('/api/me?action=notifications', { method: 'POST', body: {} }).catch(() => {});
    setUnread(0);
    setItems((it) => it?.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })) || it);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ember" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} className="glass-strong absolute right-0 top-11 z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl bg-bg/90 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && <button onClick={readAll} className="inline-flex items-center gap-1 text-xs text-ember hover:underline"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>}
            </div>
            <div className="scroll-thin max-h-96 overflow-y-auto">
              {items === null ? <div className="flex justify-center p-6"><Spinner /></div>
                : items.length === 0 ? <p className="p-6 text-center text-sm text-muted">You’re all caught up.</p>
                : items.map((n) => (
                  <button key={n.id} onClick={() => openItem(n)} className="flex w-full gap-3 border-b border-line px-4 py-3 text-left transition last:border-0 hover:bg-surface">
                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-ember')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-xs text-muted">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-faint">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                ))}
            </div>
            <Link to="/app/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-ember hover:bg-surface">View all notifications</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const name = me?.profile?.full_name || user?.email || '';
  const initials = name.split(/[\s@]/).filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join('');
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-forge text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember" aria-label="Account menu" aria-expanded={open}>{initials || 'U'}</button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="glass-strong absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl bg-bg/90 p-1.5 shadow-2xl" role="menu">
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{me?.profile?.full_name || 'Your account'}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link to="/app/settings" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-surface-2"><Settings className="h-4 w-4 text-muted" />Profile & security</Link>
            <Link to="/app/billing" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-surface-2"><CreditCard className="h-4 w-4 text-muted" />Plan & billing</Link>
            {me?.admin_role && <Link to="/admin" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-surface-2"><Shield className="h-4 w-4 text-muted" />Admin console</Link>}
            <button onClick={async () => { await signOut(); navigate('/login'); }} role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-bad hover:bg-bad/10"><LogOut className="h-4 w-4" />Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Banners() {
  const online = useOnline();
  const { me, user } = useAuth();
  const { config } = usePublicConfig();
  const toast = useToast();
  const [dismissed, setDismissed] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem('df-dismissed') || '[]'); } catch { return []; } });
  const ann = config?.announcements?.find((a) => !dismissed.includes(a.id));
  const dismiss = (id: number) => { const n = [...dismissed, id]; setDismissed(n); localStorage.setItem('df-dismissed', JSON.stringify(n)); };
  const resend = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email, options: { emailRedirectTo: `${window.location.origin}/login` } });
    if (error) toast.error('Could not resend', error.message);
    else { toast.success('Verification email sent', `Check ${user.email}`); api('/api/me?action=security-event', { method: 'POST', body: { event: 'verification_resent' } }).catch(() => {}); }
  };
  return (
    <div className="space-y-2">
      {!online && <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm"><WifiOff className="h-4 w-4 text-warn" />You’re offline. Changes can’t be saved until your connection returns.</div>}
      {config?.platform?.maintenance_message && <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-sm"><Megaphone className="h-4 w-4 text-info" />{config.platform.maintenance_message}</div>}
      {me && !me.email_verified && me.provider === 'email' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber/30 bg-amber/10 px-4 py-2.5 text-sm"><MailWarning className="h-4 w-4 text-amber" />Please verify your email address.<button onClick={resend} className="font-medium text-ember underline-offset-2 hover:underline">Resend link</button></div>
      )}
      {ann && (
        <div className={cx('flex items-start gap-3 rounded-xl border px-4 py-2.5 text-sm', ann.level === 'critical' ? 'border-bad/30 bg-bad/10' : ann.level === 'warning' ? 'border-warn/30 bg-warn/10' : 'border-ember/25 bg-ember/10')}>
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
          <div className="min-w-0 flex-1"><b>{ann.title}</b> <span className="text-muted">{ann.body}</span></div>
          <button onClick={() => dismiss(ann.id)} className="rounded p-0.5 text-muted hover:text-fg" aria-label="Dismiss announcement"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const { me, meError, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();

  useEffect(() => { setDrawer(false); window.scrollTo({ top: 0 }); }, [location.pathname]);

  if (me?.profile?.status === 'suspended') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6"><Background />
        <ErrorState kind="suspended" description={me.profile.suspended_reason || 'Your account has been suspended by an administrator. Contact support if you believe this is a mistake.'} actions={<Button variant="secondary" onClick={async () => { await signOut(); navigate('/login'); }} icon={<LogOut className="h-4 w-4" />}>Sign out</Button>} />
      </div>
    );
  }
  if (!me && !meError) return <FullLoader label="Opening your workspace" />;
  if (!me && meError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6"><Background />
        <ErrorState kind={meError.status === 0 ? 'offline' : 'generic'} description={meError.message} actions={<><Button onClick={() => window.location.reload()}>Reload</Button><Button variant="ghost" onClick={async () => { await signOut(); navigate('/login'); }}>Sign out</Button></>} />
      </div>
    );
  }
  const unread = me?.unread || 0;

  return (
    <div className="min-h-dvh">
      <Background />
      <a href="#main" className="sr-only z-[100] rounded-lg bg-ember px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-bg/60 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="px-2"><Logo to="/app" /></div>
        <LinkButton to="/app/new" className="mt-6 w-full" icon={<Plus className="h-4 w-4" />}>New project</LinkButton>
        <div className="scroll-thin mt-6 flex-1 overflow-y-auto"><NavItems unread={unread} /></div>
        <QuotaCard />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-bg px-4 py-5 shadow-2xl" aria-label="Mobile navigation">
              <div className="flex items-center justify-between px-2"><Logo to="/app" /><button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Close menu"><X className="h-5 w-5" /></button></div>
              <LinkButton to="/app/new" className="mt-6 w-full" icon={<Plus className="h-4 w-4" />}>New project</LinkButton>
              <div className="scroll-thin mt-6 flex-1 overflow-y-auto"><NavItems unread={unread} onNavigate={() => setDrawer(false)} /></div>
              <QuotaCard />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setDrawer(true)} className="rounded-xl p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <div className="lg:hidden"><Logo to="/app" /></div>
            <div className="ml-auto flex items-center gap-1.5">
              <LinkButton to="/app/new" size="sm" className="hidden sm:inline-flex lg:hidden" icon={<Plus className="h-4 w-4" />}>New</LinkButton>
              <button onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ember" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
                {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </button>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">
          <Banners />
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="pt-4">
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-3 bottom-3 z-30 lg:hidden" aria-label="Quick navigation">
        <div className="glass-strong mx-auto flex max-w-md items-center justify-around rounded-2xl bg-bg/80 px-2 py-1.5 shadow-2xl" style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
          {[{ to: '/app', icon: LayoutDashboard, label: 'Home', end: true }, { to: '/app/projects', icon: FolderKanban, label: 'Projects' }].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium', isActive ? 'text-ember' : 'text-muted')}><n.icon className="h-5 w-5" />{n.label}</NavLink>
          ))}
          <Link to="/app/new" className="-mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-forge text-white shadow-lg shadow-ember/40" aria-label="New project"><Plus className="h-6 w-6" /></Link>
          {[{ to: '/app/deployments', icon: Rocket, label: 'Deploys' }, { to: '/app/notifications', icon: Bell, label: 'Alerts' }].map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium', isActive ? 'text-ember' : 'text-muted')}>
              <n.icon className="h-5 w-5" />{n.label}
              {n.to === '/app/notifications' && unread > 0 && <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-ember" />}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
