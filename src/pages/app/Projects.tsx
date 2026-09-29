import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy, ExternalLink, FolderKanban, MoreHorizontal, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Card, ConfirmModal, CopyButton, EmptyState, Input, LinkButton, PageHeader, Skeleton, StatusBadge } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import { frameworkLabel } from '../../lib/constants';
import { bytes, timeAgo } from '../../lib/format';

export default function Projects() {
  const { data, error, loading, reload } = useApi<any[]>('/api/projects');
  const { me, refreshMe } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [del, setDel] = useState<any>(null);
  const [removeRemote, setRemoveRemote] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => (data || []).filter((p) => !q || `${p.name} ${p.slug}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  const redeploy = async (p: any) => {
    setBusy(p.id);
    try { const d = await api('/api/deploy', { method: 'POST', body: { project_id: p.id } }); navigate(`/app/deployments/${d.id}`); }
    catch (e: any) { toast.error('Could not deploy', e.message); } finally { setBusy(null); }
  };
  const duplicate = async (p: any) => {
    setBusy(p.id);
    try { const c = await api('/api/projects?action=duplicate', { method: 'POST', body: { id: p.id } }); toast.success('Project duplicated', c.name); reload(true); refreshMe(); }
    catch (e: any) { toast.error('Could not duplicate', e.message); } finally { setBusy(null); setMenu(null); }
  };
  const remove = async () => {
    if (!del) return;
    setBusy('delete');
    try {
      const r = await api('/api/projects', { method: 'DELETE', body: { id: del.id, delete_remote: removeRemote } });
      toast.success('Project deleted', r.remote === 'deleted' ? 'The Vercel project was deleted too.' : r.remote === 'failed' ? 'Could not delete the Vercel project — remove it manually.' : undefined);
      setDel(null); reload(true); refreshMe();
    } catch (e: any) { toast.error('Could not delete', e.message); } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHeader eyebrow="Projects" title="Your projects" description={me ? `${me.quota.used} of ${me.quota.limit} projects used on the ${me.plan?.name} plan.` : undefined} actions={<LinkButton to="/app/new" icon={<Plus className="h-4 w-4" />}>New project</LinkButton>} />
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="pl-10" aria-label="Search projects" />
      </div>
      {error && !data ? <ErrorState kind="generic" description={error.message} actions={<Button onClick={() => reload()}>Retry</Button>} />
        : loading && !data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
        : list.length === 0 ? (
          <Card>{q ? <EmptyState icon={<Search className="h-7 w-7" />} title="No matching projects" description={`Nothing matches “${q}”.`} /> : <EmptyState icon={<FolderKanban className="h-7 w-7" />} title="No projects yet" description="Create your first project by uploading a ZIP archive of your website." action={<LinkButton to="/app/new" icon={<Plus className="h-4 w-4" />}>Create project</LinkButton>} />}</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="group relative flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-ember/30">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber/25 to-ember/25 font-display text-sm font-bold text-ember">{p.name.slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/projects/${p.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-ember">{p.name}</Link>
                      <p className="truncate font-mono text-xs text-muted">{p.slug}</p>
                    </div>
                    <div className="relative z-10">
                      <Button variant="ghost" size="icon" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label="Project actions" aria-expanded={menu === p.id}><MoreHorizontal className="h-4 w-4" /></Button>
                      {menu === p.id && (
                        <div className="glass-strong absolute right-0 top-10 z-20 w-48 rounded-xl bg-bg/95 p-1 shadow-xl" onMouseLeave={() => setMenu(null)}>
                          <button onClick={() => { setMenu(null); redeploy(p); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><RefreshCw className="h-4 w-4" />Redeploy</button>
                          <button onClick={() => duplicate(p)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"><Copy className="h-4 w-4" />Duplicate</button>
                          <button onClick={() => { setMenu(null); setRemoveRemote(false); setDel(p); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-bad hover:bg-bad/10"><Trash2 className="h-4 w-4" />Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{frameworkLabel(p.framework)}</span>
                  </div>
                  <div className="mt-4 flex-1 text-xs text-muted">
                    <p>{p.file_count?.toLocaleString()} files · {bytes(p.source_size)}</p>
                    <p className="mt-1">{p.last_deployed_at ? `Last deployed ${timeAgo(p.last_deployed_at)}` : 'Not deployed yet'}</p>
                  </div>
                  {p.production_url ? (
                    <div className="relative z-10 mt-4 flex items-center gap-1 rounded-xl border border-line bg-surface p-1.5 pl-3">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{p.production_url.replace('https://', '')}</span>
                      <CopyButton value={p.production_url} variant="ghost" />
                      <a href={p.production_url} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Open site"><ExternalLink className="h-4 w-4" /></a>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" className="relative z-10 mt-4" loading={busy === p.id} onClick={() => redeploy(p)} icon={<RefreshCw className="h-3.5 w-3.5" />}>Deploy</Button>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy === 'delete'} danger title={`Delete ${del?.name}?`} confirmLabel="Delete project" requireText={del?.slug}
        message="This removes the project, its deployment history, environment variables, domains and stored source from DeployForge.">
        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-sm"><input type="checkbox" checked={removeRemote} onChange={(e) => setRemoveRemote(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ember)]" /><span>Also delete the project on Vercel <span className="block text-xs text-muted">The live site will go offline.</span></span></label>
      </ConfirmModal>
    </div>
  );
}
