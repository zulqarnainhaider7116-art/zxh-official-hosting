import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, FolderKanban, Globe, Plug, Receipt, Rocket, Trash2, UserCheck, UserX, Users, XCircle, Eye, Square } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Badge, Button, Card, ConfirmModal, Field, Input, LinkButton, Modal, PageHeader, Select, Skeleton, StatCard, StatusBadge, Textarea } from '../../components/ui';
import { AdminTable, Chips, SearchBox, useDebounced, useAdminRole } from './shared';
import { dateOnly, dateTime, duration, humanAction, money, timeAgo } from '../../lib/format';
import { frameworkLabel } from '../../lib/constants';

export function AdminDashboard() {
  const { data, loading } = useApi<any>('/api/admin?action=stats');
  const health = useApi<any>('/api/admin?action=health');
  const max = Math.max(1, ...(data?.chart || []).map((d: any) => d.deployments));
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Platform overview" description="Live figures from the DeployForge database." />
      {health.data?.rls === 'exposed' && (
        <Card className="mb-5 flex items-start gap-3 border-bad/30 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
          <div><p className="font-semibold text-bad">Row Level Security is not enabled on the database</p><p className="mt-1 text-muted">Tables are reachable with the public anon key. Run <code className="rounded bg-surface-2 px-1 font-mono text-xs">db/security.sql</code> in the Supabase SQL editor to lock direct access (the app only uses the server-side service role). See System health.</p></div>
        </Card>
      )}
      {loading && !data ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Users" value={data.users} icon={<Users className="h-4 w-4" />} sub={`${data.suspended} suspended`} />
            <StatCard label="Projects" value={data.projects} icon={<FolderKanban className="h-4 w-4" />} tone="info" delay={0.04} />
            <StatCard label="Deployments" value={data.deployments} icon={<Rocket className="h-4 w-4" />} tone="warn" sub={`${data.active} running now`} delay={0.08} />
            <StatCard label="Success / failed" value={data.success} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" sub={`${data.failed} failed`} delay={0.12} />
            <StatCard label="Pending payments" value={data.pending_payments} icon={<Receipt className="h-4 w-4" />} tone={data.pending_payments ? 'warn' : 'muted'} sub={<Link to="/admin/payments" className="text-ember hover:underline">Review →</Link>} delay={0.16} />
            <StatCard label="Active subscriptions" value={data.active_subscriptions} icon={<CreditCard className="h-4 w-4" />} tone="ok" delay={0.2} />
            <StatCard label="Vercel connections" value={data.connections} icon={<Plug className="h-4 w-4" />} delay={0.24} />
            <StatCard label="Domains" value={data.domains} icon={<Globe className="h-4 w-4" />} tone="info" delay={0.28} />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <p className="mb-4 text-sm font-semibold">Deployments & signups · 14 days</p>
              <div className="flex h-44 items-end gap-1.5">
                {data.chart.map((d: any, i: number) => (
                  <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end gap-0.5">
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(d.deployments / max) * 100}%` }} transition={{ delay: i * 0.03 }} className="min-h-[2px] rounded-md bg-forge" />
                    {d.signups > 0 && <span className="mx-auto h-1.5 w-1.5 rounded-full bg-info" />}
                    <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-[10px] text-bg group-hover:block">{d.date.slice(5)} · {d.deployments} deploys · {d.failed} failed · {d.signups} signups</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold">Approved revenue (manual)</p>
              {Object.keys(data.revenue).length ? Object.entries(data.revenue).map(([c, v]) => <p key={c} className="mt-3 font-display text-2xl font-semibold">{money(v as number, c)}</p>) : <p className="mt-3 text-sm text-muted">No approved payments yet.</p>}
              <p className="mt-6 text-sm font-semibold">Recent admin & user activity</p>
              <ul className="mt-2 space-y-2">{data.recent_audit.map((a: any) => <li key={a.id} className="text-xs"><span className="font-medium">{humanAction(a.action)}</span><span className="text-muted"> · {a.actor_email || 'system'} · {timeAgo(a.created_at)}</span></li>)}</ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function UserDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useApi<any>(id ? `/api/admin?action=user&id=${id}` : null);
  const plans = useApi<any[]>(id ? '/api/admin?action=plans' : null);
  const { canWrite, isOwner } = useAdminRole();
  const toast = useToast();
  const [planId, setPlanId] = useState('');
  const [expires, setExpires] = useState('');
  const [limit, setLimit] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setPlanId(String(data.user.plan_id || ''));
    setExpires(data.user.plan_expires_at ? data.user.plan_expires_at.slice(0, 10) : '');
    setLimit(data.user.project_limit_override ?? '');
    setRole(data.admin_role || '');
  }, [data]);
  const savePlan = async () => {
    setBusy(true);
    try { await api('/api/admin?action=user-update', { method: 'POST', body: { id, plan_id: Number(planId), plan_expires_at: expires || null, project_limit_override: limit === '' ? null : Number(limit) } }); toast.success('User plan updated'); reload(true); onChanged(); }
    catch (e: any) { toast.error('Update failed', e.message); } finally { setBusy(false); }
  };
  const saveRole = async () => {
    setBusy(true);
    try { await api('/api/admin?action=user-role', { method: 'POST', body: { id, role: role || null } }); toast.success('Role updated'); reload(true); onChanged(); }
    catch (e: any) { toast.error('Update failed', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!id} onClose={onClose} size="xl" title={data?.user?.email || 'User'} description={data ? `Joined ${dateOnly(data.user.created_at)} · last seen ${timeAgo(data.user.last_seen_at)}` : undefined}>
      {loading || !data ? <Skeleton className="h-80" /> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[11px] text-muted">Status</p><div className="mt-1"><StatusBadge status={data.user.status} /></div></div>
            <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[11px] text-muted">Plan</p><p className="mt-1 text-sm font-medium">{data.user.plans?.name || '—'}</p></div>
            <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[11px] text-muted">Projects</p><p className="mt-1 text-sm font-medium">{data.projects.length} / {data.user.project_limit_override ?? data.user.plans?.project_limit}</p></div>
            <div className="rounded-xl border border-line bg-surface p-3"><p className="text-[11px] text-muted">Admin role</p><p className="mt-1 text-sm font-medium capitalize">{data.admin_role || 'none'}</p></div>
          </div>
          {canWrite && (
            <Card className="grid gap-3 p-4 sm:grid-cols-4 sm:items-end">
              <Field label="Plan"><Select value={planId} onChange={(e) => setPlanId(e.target.value)}>{(plans.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Expires (optional)"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
              <Field label="Project limit override"><Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Plan default" /></Field>
              <Button onClick={savePlan} loading={busy}>Save plan</Button>
            </Card>
          )}
          {isOwner && (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <Field label="Admin role (owner only)" className="flex-1"><Select value={role} onChange={(e) => setRole(e.target.value)}><option value="">None</option><option value="support">Support (read-only)</option><option value="admin">Admin</option></Select></Field>
              <Button variant="secondary" onClick={saveRole} loading={busy} disabled={data.admin_role === 'owner'}>Update role</Button>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4"><p className="mb-2 text-sm font-semibold">Projects</p>{data.projects.length ? <ul className="space-y-1.5 text-sm">{data.projects.map((p: any) => <li key={p.id} className="flex items-center justify-between gap-2"><span className="truncate">{p.name} <span className="font-mono text-xs text-muted">{p.slug}</span></span><StatusBadge status={p.status} /></li>)}</ul> : <p className="text-sm text-muted">None</p>}</Card>
            <Card className="p-4"><p className="mb-2 text-sm font-semibold">Recent deployments</p>{data.deployments.length ? <ul className="space-y-1.5 text-sm">{data.deployments.slice(0, 8).map((d: any) => <li key={d.id} className="flex items-center justify-between gap-2"><span className="truncate">{d.projects?.name} <span className="text-xs text-muted">{timeAgo(d.created_at)}</span></span><StatusBadge status={d.status} /></li>)}</ul> : <p className="text-sm text-muted">None</p>}</Card>
            <Card className="p-4"><p className="mb-2 text-sm font-semibold">Subscriptions & payments</p>{[...data.subscriptions.map((s: any) => ({ ...s, k: 'sub' })), ...data.payments.map((p: any) => ({ ...p, k: 'pay' }))].length ? <ul className="space-y-1.5 text-sm">{data.subscriptions.map((s: any) => <li key={s.id} className="flex justify-between gap-2"><span>Sub · {s.plans?.name} · {dateOnly(s.starts_at)}</span><StatusBadge status={s.status} /></li>)}{data.payments.map((p: any) => <li key={p.id} className="flex justify-between gap-2"><span>Payment · {p.plans?.name} · {money(p.amount, p.currency)}</span><StatusBadge status={p.status} /></li>)}</ul> : <p className="text-sm text-muted">None</p>}</Card>
            <Card className="p-4"><p className="mb-2 text-sm font-semibold">Vercel connections</p>{data.connections.length ? <ul className="space-y-1.5 text-sm">{data.connections.map((c: any) => <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.name} · <span className="font-mono text-xs">{c.token_hint}</span></span><StatusBadge status={c.status} /></li>)}</ul> : <p className="text-sm text-muted">None</p>}</Card>
          </div>
          <Card className="p-4"><p className="mb-2 text-sm font-semibold">Activity</p><ul className="scroll-thin max-h-56 space-y-1 overflow-auto text-xs">{data.activity.map((a: any) => <li key={a.id}><span className="font-medium">{humanAction(a.action)}</span> <span className="text-muted">· {dateTime(a.created_at)} · {a.ip || '—'}</span></li>)}</ul></Card>
        </div>
      )}
    </Modal>
  );
}

export function AdminUsers() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=users&page=${page}&q=${encodeURIComponent(dq)}${status !== 'all' ? `&status=${status}` : ''}`);
  const [view, setView] = useState<string | null>(null);
  const [suspend, setSuspend] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const setUserStatus = async (u: any, s: string) => {
    setBusy(true);
    try { await api('/api/admin?action=user-update', { method: 'POST', body: { id: u.id, status: s, reason } }); toast.success(s === 'suspended' ? 'User suspended' : 'User reactivated'); setSuspend(null); setReason(''); reload(true); }
    catch (e: any) { toast.error('Action failed', e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Users" description={data ? `${data.total} accounts` : undefined} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search email or name…" />
        <Chips options={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'suspended', label: 'Suspended' }]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      </div>
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage} empty="No users match."
        cols={[
          { key: 'u', label: 'User', render: (u: any) => <div><p className="font-medium">{u.full_name || '—'}</p><p className="text-xs text-muted">{u.email}</p></div> },
          { key: 'p', label: 'Plan', render: (u: any) => <span className="text-sm">{u.plans?.name || '—'}{u.plan_expires_at && <span className="block text-[11px] text-muted">until {dateOnly(u.plan_expires_at)}</span>}</span> },
          { key: 'pc', label: 'Projects', render: (u: any) => u.projects_count, hideSm: true },
          { key: 's', label: 'Status', render: (u: any) => <div className="flex flex-wrap gap-1"><StatusBadge status={u.status} />{u.admin_role && <Badge tone="ember">{u.admin_role}</Badge>}</div> },
          { key: 'j', label: 'Joined', render: (u: any) => <span className="text-xs text-muted">{dateOnly(u.created_at)}</span>, hideSm: true },
          { key: 'a', label: '', render: (u: any) => <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setView(u.id)} icon={<Eye className="h-3.5 w-3.5" />}>View</Button>
            {canWrite && (u.status === 'active' ? <Button variant="ghost" size="sm" className="text-bad" onClick={() => setSuspend(u)} icon={<UserX className="h-3.5 w-3.5" />}>Suspend</Button> : <Button variant="ghost" size="sm" className="text-ok" onClick={() => setUserStatus(u, 'active')} icon={<UserCheck className="h-3.5 w-3.5" />}>Reactivate</Button>)}
          </div> },
        ]} />
      <UserDetail id={view} onClose={() => setView(null)} onChanged={() => reload(true)} />
      <ConfirmModal open={!!suspend} onClose={() => setSuspend(null)} onConfirm={() => setUserStatus(suspend, 'suspended')} loading={busy} danger title={`Suspend ${suspend?.email}?`} confirmLabel="Suspend user" message="The user will be blocked from all API actions until reactivated. Live Vercel sites are not affected.">
        <Field label="Reason (shown to the user)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      </ConfirmModal>
    </div>
  );
}

export function AdminProjects() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=projects&page=${page}&q=${encodeURIComponent(dq)}`);
  const [del, setDel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const remove = async () => {
    setBusy(true);
    try { await api('/api/admin?action=project-delete', { method: 'POST', body: { id: del.id } }); toast.success('Project removed'); setDel(null); reload(true); }
    catch (e: any) { toast.error('Failed', e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Projects" description={data ? `${data.total} projects` : undefined} />
      <div className="mb-4"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or subdomain…" /></div>
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage}
        cols={[
          { key: 'n', label: 'Project', render: (p: any) => <div><p className="font-medium">{p.name}</p><p className="font-mono text-xs text-muted">{p.slug}</p></div> },
          { key: 'o', label: 'Owner', render: (p: any) => <span className="text-xs">{p.profiles?.email}</span> },
          { key: 'f', label: 'Framework', render: (p: any) => <span className="text-xs">{frameworkLabel(p.framework)}</span>, hideSm: true },
          { key: 's', label: 'Status', render: (p: any) => <StatusBadge status={p.status} /> },
          { key: 'u', label: 'URL', render: (p: any) => p.production_url ? <a href={p.production_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-ember hover:underline">{p.production_url.replace('https://', '').slice(0, 32)}<ExternalLink className="h-3 w-3" /></a> : <span className="text-xs text-faint">—</span>, hideSm: true },
          { key: 'a', label: '', render: (p: any) => canWrite && <Button variant="ghost" size="icon" onClick={() => setDel(p)} aria-label="Delete project"><Trash2 className="h-4 w-4" /></Button> },
        ]} />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title={`Remove ${del?.name}?`} confirmLabel="Remove project" message="Removes the project from DeployForge and notifies the owner. The Vercel project is not deleted." />
    </div>
  );
}

export function AdminDeployments() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=deployments&page=${page}&status=${status}`);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const cancel = async (d: any) => { try { await api('/api/admin?action=deployment-cancel', { method: 'POST', body: { id: d.id } }); toast.success('Deployment cancelled'); reload(true); } catch (e: any) { toast.error('Failed', e.message); } };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Deployments" description={data ? `${data.total} deployments` : undefined} />
      <div className="mb-4"><Chips options={[{ id: 'all', label: 'All' }, { id: 'success', label: 'Success' }, { id: 'failed', label: 'Failed' }, { id: 'building', label: 'Building' }, { id: 'cancelled', label: 'Cancelled' }]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} /></div>
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage}
        cols={[
          { key: 'p', label: 'Project', render: (d: any) => <div><p className="font-medium">{d.projects?.name}</p><p className="font-mono text-[11px] text-muted">{d.vercel_deployment_id || d.id.slice(0, 8)}</p></div> },
          { key: 'o', label: 'Owner', render: (d: any) => <span className="text-xs">{d.profiles?.email}</span>, hideSm: true },
          { key: 's', label: 'Status', render: (d: any) => <div><StatusBadge status={d.status} />{d.error_message && <p className="mt-1 max-w-[240px] truncate text-[11px] text-bad">{d.error_message}</p>}</div> },
          { key: 'c', label: 'Created', render: (d: any) => <span className="text-xs text-muted">{timeAgo(d.created_at)}</span> },
          { key: 'd', label: 'Duration', render: (d: any) => <span className="font-mono text-xs">{duration(d.duration_ms)}</span>, hideSm: true },
          { key: 'a', label: '', render: (d: any) => canWrite && ['queued', 'preparing', 'uploading', 'building', 'checking'].includes(d.status) && <Button variant="ghost" size="sm" className="text-bad" onClick={() => cancel(d)} icon={<Square className="h-3.5 w-3.5" />}>Cancel</Button> },
        ]} />
    </div>
  );
}

export function AdminConnections() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=connections&page=${page}`);
  const [del, setDel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const revoke = async () => { setBusy(true); try { await api('/api/admin?action=connection-revoke', { method: 'POST', body: { id: del.id } }); toast.success('Connection revoked'); setDel(null); reload(true); } catch (e: any) { toast.error('Failed', e.message); } finally { setBusy(false); } };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Vercel connections" description="Tokens are encrypted — admins only see masked hints." />
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage}
        cols={[
          { key: 'n', label: 'Connection', render: (c: any) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.team_name ? `Team · ${c.team_name}` : `Personal · ${c.vercel_username}`}</p></div> },
          { key: 'o', label: 'Owner', render: (c: any) => <span className="text-xs">{c.owner}</span> },
          { key: 't', label: 'Token', render: (c: any) => <span className="font-mono text-xs">{c.token_hint}</span>, hideSm: true },
          { key: 's', label: 'Status', render: (c: any) => <StatusBadge status={c.status} /> },
          { key: 'l', label: 'Checked', render: (c: any) => <span className="text-xs text-muted">{timeAgo(c.last_checked_at)}</span>, hideSm: true },
          { key: 'a', label: '', render: (c: any) => canWrite && <Button variant="ghost" size="sm" className="text-bad" onClick={() => setDel(c)} icon={<XCircle className="h-3.5 w-3.5" />}>Revoke</Button> },
        ]} />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={revoke} loading={busy} danger title="Revoke this connection?" confirmLabel="Revoke" message="The encrypted token is deleted, running deployments using it are cancelled and the owner is notified." />
    </div>
  );
}

export function AdminDomains() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=domains&page=${page}`);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const remove = async (d: any) => { try { await api('/api/admin?action=domain-delete', { method: 'POST', body: { id: d.id } }); toast.success('Domain record removed'); reload(true); } catch (e: any) { toast.error('Failed', e.message); } };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Domains" />
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage}
        cols={[
          { key: 'h', label: 'Hostname', render: (d: any) => <a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:text-ember">{d.hostname}</a> },
          { key: 't', label: 'Type', render: (d: any) => <Badge tone={d.type === 'generated' ? 'ember' : 'info'}>{d.type}</Badge> },
          { key: 'p', label: 'Project', render: (d: any) => <span className="text-xs">{d.projects?.name}</span>, hideSm: true },
          { key: 'o', label: 'Owner', render: (d: any) => <span className="text-xs">{d.profiles?.email}</span>, hideSm: true },
          { key: 's', label: 'Status', render: (d: any) => <StatusBadge status={d.status} /> },
          { key: 'a', label: '', render: (d: any) => canWrite && <Button variant="ghost" size="icon" onClick={() => remove(d)} aria-label="Remove domain"><Trash2 className="h-4 w-4" /></Button> },
        ]} />
    </div>
  );
}

export function AdminUsage() {
  const { data, loading, error, reload } = useApi<any>('/api/admin?action=usage');
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Usage" description="Project quotas and deployment activity over the last 30 days." />
      {data && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatCard label="Deployments (30d)" value={data.totals.deployments_30d} icon={<Rocket className="h-4 w-4" />} />
          <StatCard label="Build minutes (30d)" value={data.totals.build_minutes_30d} icon={<CheckCircle2 className="h-4 w-4" />} tone="info" />
          <StatCard label="Users at quota" value={data.totals.at_quota} icon={<AlertTriangle className="h-4 w-4" />} tone="warn" />
        </div>
      )}
      <AdminTable rows={data?.rows} loading={loading} error={error?.message} onRetry={() => reload()}
        cols={[
          { key: 'u', label: 'User', render: (r: any) => <div><p className="text-sm font-medium">{r.name || r.email}</p><p className="text-xs text-muted">{r.email}</p></div> },
          { key: 'p', label: 'Plan', render: (r: any) => r.plan },
          { key: 'q', label: 'Projects', render: (r: any) => <div className="w-28"><p className="text-xs">{r.projects} / {r.limit}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={r.projects >= r.limit ? 'h-full bg-bad' : 'h-full bg-forge'} style={{ width: `${Math.min(100, (r.projects / Math.max(1, r.limit)) * 100)}%` }} /></div></div> },
          { key: 'd', label: 'Deploys 30d', render: (r: any) => r.deployments_30d },
          { key: 'b', label: 'Build min', render: (r: any) => r.build_minutes_30d, hideSm: true },
          { key: 's', label: 'Status', render: (r: any) => <StatusBadge status={r.status} />, hideSm: true },
        ]} />
    </div>
  );
}

export function AdminAudit() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [adminOnly, setAdminOnly] = useState('all');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=audit&page=${page}&size=30&q=${encodeURIComponent(dq)}${adminOnly === 'admin' ? '&admin_only=1' : ''}`);
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Audit logs" description="Immutable record of security-relevant and administrative actions." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search action, email, target…" />
        <Chips options={[{ id: 'all', label: 'All events' }, { id: 'admin', label: 'Admin actions' }]} value={adminOnly} onChange={(v) => { setAdminOnly(v); setPage(1); }} />
      </div>
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage}
        cols={[
          { key: 'a', label: 'Action', render: (a: any) => <span className="font-mono text-xs">{a.action}</span> },
          { key: 'u', label: 'Actor', render: (a: any) => <span className="text-xs">{a.actor_email || 'system'}</span> },
          { key: 't', label: 'Target', render: (a: any) => <span className="text-xs text-muted">{a.target_type}{a.target_id ? ` · ${String(a.target_id).slice(0, 8)}` : ''}</span>, hideSm: true },
          { key: 'm', label: 'Details', render: (a: any) => <span className="block max-w-[260px] truncate font-mono text-[11px] text-faint" title={JSON.stringify(a.metadata)}>{JSON.stringify(a.metadata)}</span>, hideSm: true },
          { key: 'i', label: 'IP', render: (a: any) => <span className="font-mono text-[11px] text-muted">{a.ip || '—'}</span>, hideSm: true },
          { key: 'w', label: 'When', render: (a: any) => <span className="whitespace-nowrap text-xs text-muted">{dateTime(a.created_at)}</span> },
        ]} />
    </div>
  );
}

