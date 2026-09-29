import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Copy, ExternalLink, FolderTree, Globe, LayoutGrid, Lock, Plus, RefreshCw, Rocket, Settings2, Trash2, UploadCloud, Variable, Pencil, AlertTriangle, Unlock, Loader2 } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Card, ConfirmModal, CopyButton, EmptyState, Field, Input, LinkButton, Modal, Select, Skeleton, StatusBadge, Tabs, Toggle, cx } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import FileExplorer from '../../components/FileExplorer';
import SourceUploader from '../../components/SourceUploader';
import DomainRow from '../../components/DomainRow';
import { DeploymentTable, FILTERS } from './Deployments';
import { FRAMEWORKS, NODE_VERSIONS, ACTIVE_STATUSES, frameworkLabel } from '../../lib/constants';
import { bytes, dateTime, duration, humanAction, timeAgo } from '../../lib/format';
import { bundleFromZip, type Bundle } from '../../lib/zip';
import { analyze } from '../../lib/analyzer';
import { loadConfig, FALLBACK_LIMITS } from '../../lib/useConfig';
import { uploadBundle, manifestOf, compactAnalysis } from '../../lib/source';

const TABS = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'deployments', label: 'Deployments', icon: <Rocket className="h-4 w-4" /> },
  { id: 'files', label: 'Files', icon: <FolderTree className="h-4 w-4" /> },
  { id: 'domains', label: 'Domains', icon: <Globe className="h-4 w-4" /> },
  { id: 'env', label: 'Environment', icon: <Variable className="h-4 w-4" /> },
  { id: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" /> },
];

function FilesTab({ project, onReplaced }: { project: any; onReplaced: () => void }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [limits, setLimits] = useState(FALLBACK_LIMITS);
  const [progress, setProgress] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => setLimits(c.limits)).catch(() => {});
    if (!project.source_path) { setErr('none'); return; }
    setBundle(null); setErr(null);
    (async () => {
      try {
        const { url } = await api(`/api/projects?action=source-url&id=${project.id}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not download the stored source.');
        const b = await bundleFromZip(await res.blob(), project.source_filename || 'source.zip', { max_upload_mb: 60, max_files: 20000, max_unzipped_mb: 400 });
        if (alive) setBundle(b);
      } catch (e: any) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; };
  }, [project.id, project.source_path, project.source_filename]);

  const onNew = async (b: Bundle) => {
    try {
      const a = analyze(b);
      const src = await uploadBundle(b, (ph, p) => setProgress(`${ph === 'packing' ? 'Compressing' : 'Uploading'} ${p}%`));
      await api('/api/projects', { method: 'PUT', body: { id: project.id, source_path: src.path, source_filename: src.filename, file_count: b.files.length, manifest: manifestOf(b), analysis: compactAnalysis(a) } });
      setReplace(false);
      setProgress(null);
      toast.success('Source replaced', 'Redeploy to publish the new version.');
      onReplaced();
    } catch (e: any) { setProgress(null); toast.error('Could not replace source', e.message); }
  };

  const redeploy = async () => {
    try { const d = await api('/api/deploy', { method: 'POST', body: { project_id: project.id } }); navigate(`/app/deployments/${d.id}`); } catch (e: any) { toast.error('Could not deploy', e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{project.source_filename} · {project.file_count?.toLocaleString()} files · {bytes(project.source_size)}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setReplace(true)} icon={<UploadCloud className="h-4 w-4" />}>Replace source</Button>
          <Button size="sm" onClick={redeploy} icon={<Rocket className="h-4 w-4" />}>Deploy this source</Button>
        </div>
      </div>
      {err === 'none' ? <Card><EmptyState icon={<FolderTree className="h-7 w-7" />} title="No source uploaded" action={<Button onClick={() => setReplace(true)}>Upload source</Button>} /></Card>
        : err ? <Card><ErrorState kind="generic" compact description={err} /></Card>
        : !bundle ? <Skeleton className="h-[520px]" />
        : <FileExplorer files={bundle.files} loadContent={async (p) => bundle.contents.get(p) || null} />}
      <Modal open={replace} onClose={() => !progress && setReplace(false)} title="Replace project source" description="Upload a new ZIP. The previous archive is deleted after the new one is saved." size="lg">
        {progress ? <div className="flex items-center justify-center gap-3 py-10 text-sm"><Loader2 className="h-5 w-5 animate-spin text-ember" />{progress}</div> : <SourceUploader limits={limits} onBundle={onNew} compact />}
      </Modal>
    </div>
  );
}

function EnvTab({ project, env, reload }: { project: any; env: any[]; reload: () => void }) {
  const [form, setForm] = useState({ key: '', value: '', is_secret: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<any>(null);
  const toast = useToast();
  const save = async () => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(form.key)) { setErr('Keys may contain letters, numbers and underscores and cannot start with a number.'); return; }
    if (!form.value) { setErr('Enter a value.'); return; }
    setErr(null); setBusy(true);
    try { await api('/api/projects?action=env', { method: 'POST', body: { project_id: project.id, ...form } }); setForm({ key: '', value: '', is_secret: true }); setEditing(null); toast.success('Variable saved', 'Applied on the next deployment.'); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { const r = await api('/api/projects?action=env', { method: 'DELETE', body: { project_id: project.id, id: del.id } }); toast.success('Variable deleted', r.remote === 'removed' ? 'Also removed from Vercel.' : r.remote === 'failed' ? 'Could not remove from Vercel — check the Vercel dashboard.' : undefined); setDel(null); reload(); }
    catch (e: any) { toast.error('Could not delete', e.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        {env.length === 0 ? <EmptyState icon={<Variable className="h-7 w-7" />} title="No environment variables" description="Add configuration and secrets your build needs. Values are encrypted at rest." />
          : (
            <ul>{env.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 border-b border-line px-5 py-3.5 last:border-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-mono text-sm font-semibold">{e.is_secret ? <Lock className="h-3.5 w-3.5 text-ok" /> : <Unlock className="h-3.5 w-3.5 text-muted" />}{e.key}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">{e.is_secret ? e.value_hint : e.value}</p>
                </div>
                <span className="text-[11px] text-faint">updated {timeAgo(e.updated_at)}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(e.key); setForm({ key: e.key, value: '', is_secret: e.is_secret }); }} icon={<Pencil className="h-3.5 w-3.5" />}>Update</Button>
                  <Button variant="ghost" size="icon" onClick={() => setDel(e)} aria-label={`Delete ${e.key}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}</ul>
          )}
      </Card>
      <Card className="h-fit space-y-4 p-5">
        <p className="text-sm font-semibold">{editing ? `Update ${editing}` : 'Add variable'}</p>
        <Field label="Key"><Input value={form.key} disabled={!!editing} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase().replace(/\s/g, '_') })} className="font-mono text-sm" placeholder="API_URL" /></Field>
        <Field label="Value" hint={editing ? 'Existing values are write-only — enter a new value to replace it.' : undefined}><Input type={form.is_secret ? 'password' : 'text'} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="font-mono text-sm" autoComplete="off" /></Field>
        <Toggle checked={form.is_secret} onChange={(v) => setForm({ ...form, is_secret: v })} label="Secret" description="Secret values are never shown again after saving." />
        {err && <p className="text-xs text-bad">{err}</p>}
        <div className="flex gap-2">
          <Button onClick={save} loading={busy} className="flex-1" icon={<Plus className="h-4 w-4" />}>{editing ? 'Save new value' : 'Add variable'}</Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm({ key: '', value: '', is_secret: true }); }}>Cancel</Button>}
        </div>
        <p className="text-xs text-muted">Variables are synced to Vercel (encrypted) at the start of each deployment.</p>
      </Card>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title={`Delete ${del?.key}?`} confirmLabel="Delete" message="The variable will be removed here and from the linked Vercel project." />
    </div>
  );
}

function SettingsTab({ project, connections, reload }: { project: any; connections: any[]; reload: () => void }) {
  const [f, setF] = useState({ name: project.name, slug: project.slug, connection_id: project.connection_id || '', framework: project.framework || 'static', build_command: project.build_command || '', install_command: project.install_command || '', output_directory: project.output_directory || '', root_directory: project.root_directory || '', node_version: project.node_version || '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [remote, setRemote] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const slugLocked = !!project.vercel_project_id && f.connection_id === project.connection_id;

  const save = async () => {
    if (f.name.trim().length < 2) { setErr('Project name must be at least 2 characters.'); return; }
    if (/[\n`]/.test(f.build_command + f.install_command)) { setErr('Commands must be a single line.'); return; }
    setErr(null); setBusy('save');
    try {
      const body: any = { id: project.id, ...f, connection_id: f.connection_id || null };
      if (slugLocked) delete body.slug;
      await api('/api/projects', { method: 'PUT', body });
      toast.success('Settings saved', 'They apply to the next deployment.');
      reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const duplicate = async () => {
    setBusy('dup');
    try { const c = await api('/api/projects?action=duplicate', { method: 'POST', body: { id: project.id } }); toast.success('Project duplicated'); refreshMe(); navigate(`/app/projects/${c.id}`); }
    catch (e: any) { toast.error('Could not duplicate', e.message); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('del');
    try { await api('/api/projects', { method: 'DELETE', body: { id: project.id, delete_remote: remote } }); toast.success('Project deleted'); refreshMe(); navigate('/app/projects'); }
    catch (e: any) { toast.error('Could not delete', e.message); setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></Field>
          <Field label="Subdomain / Vercel project name" hint={slugLocked ? 'Locked after the first deployment. Add a custom domain instead.' : 'Checked for availability when saved.'}><Input value={f.slug} disabled={slugLocked} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="font-mono" /></Field>
          <Field label="Vercel connection" hint={f.connection_id !== project.connection_id && project.vercel_project_id ? 'Switching accounts creates a new Vercel project on the next deploy.' : undefined}>
            <Select value={f.connection_id} onChange={(e) => setF({ ...f, connection_id: e.target.value })}>
              <option value="">— None —</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.team_name || c.vercel_username}</option>)}
            </Select>
          </Field>
          <Field label="Framework preset"><Select value={f.framework} onChange={(e) => setF({ ...f, framework: e.target.value })}>{FRAMEWORKS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
          <Field label="Build command" hint="Empty = framework default"><Input value={f.build_command} onChange={(e) => setF({ ...f, build_command: e.target.value })} className="font-mono text-[13px]" /></Field>
          <Field label="Install command"><Input value={f.install_command} onChange={(e) => setF({ ...f, install_command: e.target.value })} className="font-mono text-[13px]" /></Field>
          <Field label="Output directory"><Input value={f.output_directory} onChange={(e) => setF({ ...f, output_directory: e.target.value })} className="font-mono text-[13px]" /></Field>
          <Field label="Root directory"><Input value={f.root_directory} onChange={(e) => setF({ ...f, root_directory: e.target.value })} className="font-mono text-[13px]" /></Field>
          <Field label="Node.js version"><Select value={f.node_version} onChange={(e) => setF({ ...f, node_version: e.target.value })}><option value="">Vercel default</option>{NODE_VERSIONS.map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        </div>
        {err && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        <div className="flex justify-end"><Button onClick={save} loading={busy === 'save'}>Save settings</Button></div>
      </Card>
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="flex-1"><p className="font-medium">Duplicate project</p><p className="text-sm text-muted">Copies settings, source and environment variables into a new project (counts toward your quota).</p></div>
        <Button variant="secondary" onClick={duplicate} loading={busy === 'dup'} icon={<Copy className="h-4 w-4" />}>Duplicate</Button>
      </Card>
      <Card className="flex flex-col gap-3 border-bad/25 p-5 sm:flex-row sm:items-center">
        <div className="flex-1"><p className="font-medium text-bad">Delete project</p><p className="text-sm text-muted">Removes the project, history, domains, environment variables and stored source.</p></div>
        <Button variant="danger" onClick={() => setDel(true)} icon={<Trash2 className="h-4 w-4" />}>Delete project</Button>
      </Card>
      <ConfirmModal open={del} onClose={() => setDel(false)} onConfirm={remove} loading={busy === 'del'} danger title={`Delete ${project.name}?`} requireText={project.slug} confirmLabel="Delete forever" message="This cannot be undone.">
        {project.vercel_project_id && <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-sm"><input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ember)]" /><span>Also delete the Vercel project<span className="block text-xs text-muted">The live site at {project.production_url || 'Vercel'} will go offline.</span></span></label>}
      </ConfirmModal>
    </div>
  );
}

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const { data, error, loading, reload } = useApi<any>(`/api/projects?id=${id}`);
  const [connections, setConnections] = useState<any[]>([]);
  const [depFilter, setDepFilter] = useState('all');
  const [domain, setDomain] = useState('');
  const [domainErr, setDomainErr] = useState<string | null>(null);
  const [delDomain, setDelDomain] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const [newName, setNewName] = useState('');
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => { api('/api/connections').then(setConnections).catch(() => {}); }, []);
  const deps = useMemo(() => (data?.deployments || []).filter((d: any) => depFilter === 'all' || (depFilter === 'success' && d.status === 'completed') || (depFilter === 'failed' && d.status === 'failed') || (depFilter === 'building' && ACTIVE_STATUSES.includes(d.status))), [data, depFilter]);

  if (error && !data) return error.status === 404 ? <ErrorState kind="404" title="Project not found" description="This project doesn’t exist or you don’t have access to it." actions={<LinkButton to="/app/projects">Back to projects</LinkButton>} /> : <ErrorState kind="generic" description={error.message} actions={<Button onClick={() => reload()}>Retry</Button>} />;
  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-10 w-2/3" /><Skeleton className="h-80" /></div>;
  if (!data) return null;
  const p = data.project;
  const active = data.deployments.find((d: any) => ACTIVE_STATUSES.includes(d.status));
  const last = data.deployments[0];

  const deploy = async () => {
    setBusy('deploy');
    try { const d = await api('/api/deploy', { method: 'POST', body: { project_id: p.id } }); navigate(`/app/deployments/${d.id}`); }
    catch (e: any) { toast.error('Could not deploy', e.message); } finally { setBusy(null); }
  };
  const addDomain = async () => {
    const h = domain.trim().toLowerCase();
    if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) { setDomainErr('Enter a valid domain such as www.example.com.'); return; }
    setDomainErr(null); setBusy('domain');
    try { await api('/api/projects?action=domain', { method: 'POST', body: { project_id: p.id, hostname: h } }); setDomain(''); toast.success('Domain added', 'Follow the DNS instructions to finish setup.'); reload(true); }
    catch (e: any) { setDomainErr(e.message); } finally { setBusy(null); }
  };
  const verifyDomain = async (d: any) => {
    try { const r = await api('/api/projects?action=domain-verify', { method: 'POST', body: { id: d.id } }); toast.info('Domain checked', r.note || `Status: ${r.status.replace(/_/g, ' ')}`); reload(true); }
    catch (e: any) { toast.error('Check failed', e.message); }
  };
  const removeDomain = async () => {
    setBusy('deldomain');
    try { await api('/api/projects?action=domain', { method: 'DELETE', body: { id: delDomain.id } }); toast.success('Domain removed'); setDelDomain(null); reload(true); }
    catch (e: any) { toast.error('Could not remove', e.message); } finally { setBusy(null); }
  };
  const doRename = async () => {
    if (newName.trim().length < 2) return;
    setBusy('rename');
    try { await api('/api/projects', { method: 'PUT', body: { id: p.id, name: newName.trim() } }); setRename(false); toast.success('Project renamed'); reload(true); }
    catch (e: any) { toast.error('Could not rename', e.message); } finally { setBusy(null); }
  };

  return (
    <div>
      <Link to="/app/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Projects</Link>
      <Card className="relative mb-5 overflow-hidden p-5 sm:p-6">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-ember/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-forge font-display text-lg font-bold text-white shadow-lg shadow-ember/30">{p.name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-xl font-semibold sm:text-2xl">{p.name}</h1>
                <button onClick={() => { setNewName(p.name); setRename(true); }} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Rename project"><Pencil className="h-3.5 w-3.5" /></button>
                <StatusBadge status={p.status} />
              </div>
              {p.production_url ? <a href={p.production_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-sm text-ember hover:underline">{p.production_url.replace('https://', '')}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a> : <p className="mt-1 text-sm text-muted">Not deployed yet</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.production_url && <><CopyButton value={p.production_url} label="Copy URL" /><a href={p.production_url} target="_blank" rel="noopener noreferrer" className="glass-strong inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium"><ExternalLink className="h-3.5 w-3.5" />Open</a></>}
            {active ? <LinkButton to={`/app/deployments/${active.id}`} size="sm" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>View live build</LinkButton> : <Button size="sm" onClick={deploy} loading={busy === 'deploy'} icon={<RefreshCw className="h-3.5 w-3.5" />}>{p.production_url ? 'Redeploy' : 'Deploy'}</Button>}
          </div>
        </div>
      </Card>

      <Tabs tabs={TABS.map((t) => ({ ...t, count: t.id === 'deployments' ? data.deployments.length : t.id === 'domains' ? data.domains.length : t.id === 'env' ? data.env.length : undefined }))} value={tab} onChange={(t) => setParams({ tab: t })} className="mb-5" />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <p className="text-sm font-semibold">Latest deployment</p>
            {last ? (
              <Link to={`/app/deployments/${last.id}`} className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-ember/40 sm:flex-row sm:items-center">
                <StatusBadge status={last.status} />
                <div className="min-w-0 flex-1"><p className="truncate font-mono text-xs">{last.vercel_deployment_id || last.id}</p><p className="text-xs text-muted">{dateTime(last.created_at)} · {duration(last.duration_ms)}</p>{last.error_message && <p className="mt-1 truncate text-xs text-bad">{last.error_message}</p>}</div>
                <span className="text-xs text-ember">View →</span>
              </Link>
            ) : <p className="mt-3 text-sm text-muted">No deployments yet.</p>}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[['Framework', frameworkLabel(p.framework)], ['Node.js', p.node_version || 'default'], ['Package manager', p.package_manager], ['Build command', p.build_command || 'default'], ['Output', p.output_directory || 'default'], ['Root', p.root_directory || './']].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line bg-surface p-3"><p className="text-[11px] text-muted">{k}</p><p className="mt-1 truncate font-mono text-xs">{v}</p></div>
              ))}
            </div>
            {p.analysis?.warnings?.length > 0 && (
              <div className="mt-5 rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm"><p className="flex items-center gap-2 font-medium text-warn"><AlertTriangle className="h-4 w-4" />{p.analysis.warnings.length} analysis warning(s)</p><ul className="mt-2 space-y-1 text-xs text-muted">{p.analysis.warnings.slice(0, 5).map((w: string) => <li key={w}>• {w}</li>)}</ul></div>
            )}
          </Card>
          <div className="space-y-5">
            <Card className="p-5">
              <p className="text-sm font-semibold">Vercel connection</p>
              {data.connection ? <div className="mt-3 text-sm"><div className="flex items-center justify-between"><span>{data.connection.name}</span><StatusBadge status={data.connection.status} /></div><p className="mt-1 text-xs text-muted">{data.connection.team_name || data.connection.vercel_username} · {data.connection.token_hint}</p>{p.vercel_project_name && <p className="mt-2 font-mono text-[11px] text-faint">Vercel project: {p.vercel_project_name}</p>}</div>
                : <div className="mt-3"><p className="text-sm text-warn">No connection selected.</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => setParams({ tab: 'settings' })}>Choose connection</Button></div>}
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold">Source</p>
              <p className="mt-2 truncate text-sm">{p.source_filename}</p>
              <p className="text-xs text-muted">{p.file_count?.toLocaleString()} files · {bytes(p.source_size)} · updated {timeAgo(p.updated_at)}</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setParams({ tab: 'files' })}>Browse files</Button>
            </Card>
          </div>
        </div>
      )}

      {tab === 'deployments' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map((f) => <button key={f.id} onClick={() => setDepFilter(f.id)} className={cx('rounded-xl px-3.5 py-2 text-sm font-medium', depFilter === f.id ? 'bg-forge text-white' : 'glass text-muted hover:text-fg')}>{f.label}</button>)}</div>
          <Card className="overflow-hidden">{deps.length ? <DeploymentTable items={deps.map((d: any) => ({ ...d, projects: { name: p.name } }))} /> : <EmptyState icon={<Rocket className="h-7 w-7" />} title="No deployments match" action={<Button onClick={deploy} loading={busy === 'deploy'}>Deploy now</Button>} />}</Card>
        </div>
      )}

      {tab === 'files' && <FilesTab project={p} onReplaced={() => reload(true)} />}

      {tab === 'domains' && (
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-semibold">Add a custom domain</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.example.com" className="font-mono" onKeyDown={(e) => e.key === 'Enter' && addDomain()} invalid={!!domainErr} aria-label="Custom domain" />
              <Button onClick={addDomain} loading={busy === 'domain'} icon={<Plus className="h-4 w-4" />}>Add domain</Button>
            </div>
            {domainErr && <p className="mt-2 text-xs text-bad">{domainErr}</p>}
            {!p.vercel_project_id && <p className="mt-2 text-xs text-muted">This project hasn’t been deployed yet — domains will be attached on Vercel after the first successful deployment.</p>}
          </Card>
          {data.domains.length === 0 ? <Card><EmptyState icon={<Globe className="h-7 w-7" />} title="No domains yet" description="The generated Vercel URL appears here after a successful deployment." /></Card>
            : data.domains.map((d: any) => <DomainRow key={d.id} domain={d} onVerify={() => verifyDomain(d)} onRemove={() => setDelDomain(d)} />)}
        </div>
      )}

      {tab === 'env' && <EnvTab project={p} env={data.env} reload={() => reload(true)} />}

      {tab === 'activity' && (
        <Card className="overflow-hidden">
          {data.activity.length === 0 ? <EmptyState icon={<Activity className="h-7 w-7" />} title="No activity yet" /> : (
            <ol className="relative p-5">
              {data.activity.map((a: any) => (
                <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
                  <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-ember ring-4 ring-ember/15" />
                  <div className="min-w-0"><p className="text-sm font-medium">{humanAction(a.action)}</p><p className="text-xs text-muted">{dateTime(a.created_at)}{a.actor_email ? ` · ${a.actor_email}` : ''}</p>{a.metadata && Object.keys(a.metadata).length > 0 && <p className="mt-1 truncate font-mono text-[11px] text-faint">{Object.entries(a.metadata).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : String(v)}`).join(' · ')}</p>}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === 'settings' && <SettingsTab key={p.updated_at} project={p} connections={connections} reload={() => reload(true)} />}

      <ConfirmModal open={!!delDomain} onClose={() => setDelDomain(null)} onConfirm={removeDomain} loading={busy === 'deldomain'} danger title={`Remove ${delDomain?.hostname}?`} confirmLabel="Remove" message="The domain will be detached from the Vercel project." />
      <Modal open={rename} onClose={() => setRename(false)} title="Rename project" size="sm" footer={<><Button variant="ghost" onClick={() => setRename(false)}>Cancel</Button><Button onClick={doRename} loading={busy === 'rename'}>Save</Button></>}>
        <Field label="Project name" hint="The subdomain and Vercel project name stay the same." error={newName.trim().length < 2 ? 'At least 2 characters.' : null}><Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} onKeyDown={(e) => e.key === 'Enter' && doRename()} /></Field>
      </Modal>
    </div>
  );
}
