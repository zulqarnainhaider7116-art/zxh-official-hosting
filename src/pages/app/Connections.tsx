import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, KeyRound, Pencil, Plug, Plus, RefreshCw, Trash2, Users, User, AlertTriangle } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Button, Card, ConfirmModal, EmptyState, Field, Input, Modal, PageHeader, Skeleton, StatusBadge } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import AddConnectionModal from '../../components/AddConnectionModal';
import { timeAgo } from '../../lib/format';

export default function Connections() {
  const { data, error, loading, reload, setData } = useApi<any[]>('/api/connections');
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [del, setDel] = useState<any>(null);
  const [rename, setRename] = useState<any>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const test = async (c: any) => {
    setTesting(c.id);
    try {
      const r = await api('/api/connections?action=test', { method: 'POST', body: { id: c.id } });
      setData((l) => l?.map((x) => (x.id === c.id ? { ...x, ...r } : x)) || l);
      if (r.status === 'connected') toast.success('Connection is healthy', `Authenticated as ${r.vercel_username}`);
      else toast.error(r.status === 'invalid' ? 'Invalid Vercel token' : 'Vercel connection failed', r.last_error);
    } catch (e: any) { toast.error('Test failed', e.message); } finally { setTesting(null); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api('/api/connections', { method: 'DELETE', body: { id: del.id } }); toast.success('Connection removed', 'The encrypted token was deleted.'); setDel(null); reload(true); }
    catch (e: any) { toast.error('Could not remove', e.message); } finally { setBusy(false); }
  };
  const doRename = async () => {
    if (newName.trim().length < 2) return;
    setBusy(true);
    try { const r = await api('/api/connections', { method: 'PUT', body: { id: rename.id, name: newName.trim() } }); setData((l) => l?.map((x) => (x.id === r.id ? { ...x, ...r } : x)) || l); setRename(null); toast.success('Renamed'); }
    catch (e: any) { toast.error('Could not rename', e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Integrations" title="Vercel connections" description="Connect one or more Vercel accounts or teams. Tokens are encrypted with AES-256-GCM and never displayed again." actions={<Button onClick={() => setAdd(true)} icon={<Plus className="h-4 w-4" />}>Connect Vercel</Button>} />
      {error && !data ? <ErrorState kind="generic" description={error.message} actions={<Button onClick={() => reload()}>Retry</Button>} />
        : loading && !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-52" />)}</div>
        : !data?.length ? (
          <Card><EmptyState icon={<Plug className="h-7 w-7" />} title="No Vercel accounts connected" description="Create a personal access token in your Vercel account settings and paste it here. We validate it server-side before saving." action={<Button onClick={() => setAdd(true)} icon={<Plus className="h-4 w-4" />}>Connect Vercel</Button>} /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="relative overflow-hidden p-5">
                  <div className={`absolute inset-x-0 top-0 h-px ${c.status === 'connected' ? 'bg-ok/60' : 'bg-bad/60'}`} />
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fg text-bg"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M12 2 22 20H2z" /></svg></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted">{c.team_name ? <><Users className="h-3 w-3" />Team · {c.team_name}</> : <><User className="h-3 w-3" />Personal · {c.vercel_username}</>}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-line bg-surface p-3"><dt className="flex items-center gap-1 text-muted"><KeyRound className="h-3 w-3" />Token</dt><dd className="mt-1 font-mono">{c.token_hint}</dd></div>
                    <div className="rounded-xl border border-line bg-surface p-3"><dt className="text-muted">Projects using it</dt><dd className="mt-1 font-medium">{c.projects_count}</dd></div>
                    <div className="rounded-xl border border-line bg-surface p-3"><dt className="text-muted">Account</dt><dd className="mt-1 truncate">{c.vercel_email || c.vercel_username}</dd></div>
                    <div className="rounded-xl border border-line bg-surface p-3"><dt className="text-muted">Last checked</dt><dd className="mt-1">{timeAgo(c.last_checked_at)}</dd></div>
                  </dl>
                  {c.last_error && c.status !== 'connected' && <p className="mt-3 flex items-start gap-2 rounded-xl border border-bad/25 bg-bad/10 p-3 text-xs text-bad"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{c.last_error}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => test(c)} loading={testing === c.id} icon={c.status === 'connected' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}>Test connection</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setRename(c); setNewName(c.name); }} icon={<Pencil className="h-3.5 w-3.5" />}>Rename</Button>
                    <Button variant="ghost" size="sm" className="ml-auto text-bad hover:bg-bad/10 hover:text-bad" onClick={() => setDel(c)} icon={<Trash2 className="h-3.5 w-3.5" />}>Disconnect</Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      <AddConnectionModal open={add} onClose={() => setAdd(false)} onCreated={() => reload(true)} />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title={`Disconnect ${del?.name}?`} confirmLabel="Disconnect"
        message={<>The encrypted token will be permanently deleted.{del?.projects_count ? <> <b className="text-fg">{del.projects_count} project(s)</b> use this connection and will need a new one before redeploying. Live sites on Vercel are not affected.</> : ''}</>} />
      <Modal open={!!rename} onClose={() => setRename(null)} title="Rename connection" size="sm" footer={<><Button variant="ghost" onClick={() => setRename(null)}>Cancel</Button><Button onClick={doRename} loading={busy}>Save</Button></>}>
        <Field label="Name" error={newName.trim().length < 2 ? 'At least 2 characters.' : null}><Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} onKeyDown={(e) => e.key === 'Enter' && doRename()} /></Field>
      </Modal>
    </div>
  );
}
