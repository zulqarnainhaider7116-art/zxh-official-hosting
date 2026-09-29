import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, Box, Check, CheckCircle2, Cpu, FileCode2, FileSearch, FolderTree, Globe, Info, Loader2, Package, Plug, Plus, RefreshCw, Rocket, Settings2, ShieldAlert, Sparkles, UploadCloud, Variable, XCircle, Ban, Hash } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../lib/api';
import { analyze, type Analysis } from '../../lib/analyzer';
import { loadConfig, FALLBACK_LIMITS } from '../../lib/useConfig';
import { uploadBundle, manifestOf, compactAnalysis, type UploadedSource } from '../../lib/source';
import type { Bundle, Limits } from '../../lib/zip';
import { FRAMEWORKS, NODE_VERSIONS, frameworkLabel } from '../../lib/constants';
import { bytes, slugify } from '../../lib/format';
import { Badge, Button, Card, Field, Input, LinkButton, PageHeader, Progress, Select, Skeleton, cx } from '../../components/ui';
import SourceUploader from '../../components/SourceUploader';
import FileExplorer from '../../components/FileExplorer';
import AddConnectionModal from '../../components/AddConnectionModal';
import EnvEditor, { envErrors, type EnvRow } from '../../components/EnvEditor';
import DeploymentLive from '../../components/DeploymentLive';
import ErrorState from '../../components/ErrorState';
import { DnsTable } from '../../components/DomainRow';

const STEPS = [
  { id: 'source', label: 'Source', icon: UploadCloud },
  { id: 'scan', label: 'Scan', icon: FolderTree },
  { id: 'analyze', label: 'Analyze', icon: FileSearch },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'subdomain', label: 'Subdomain', icon: Globe },
  { id: 'review', label: 'Review', icon: CheckCircle2 },
  { id: 'deploy', label: 'Deploy', icon: Rocket },
];

type SlugState = { status: 'idle' | 'checking' | 'available' | 'used' | 'invalid' | 'reserved' | 'error'; message?: string; suggestion?: string };

const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TWO_LEVEL = ['co.uk', 'org.uk', 'com.pk', 'net.pk', 'org.pk', 'com.au', 'co.in', 'com.br', 'co.jp', 'co.za'];
function previewDns(host: string) {
  const parts = host.split('.');
  const last2 = parts.slice(-2).join('.');
  const apex = TWO_LEVEL.includes(last2) ? parts.slice(-3).join('.') : last2;
  return apex === host ? [{ type: 'A', name: '@', value: '76.76.21.21', purpose: 'Point the apex domain to Vercel' }] : [{ type: 'CNAME', name: host.slice(0, -(apex.length + 1)), value: 'cname.vercel-dns.com', purpose: 'Point the subdomain to Vercel' }];
}

function Stepper({ step, maxReached, onJump, locked }: { step: number; maxReached: number; onJump: (i: number) => void; locked: boolean }) {
  return (
    <nav aria-label="Wizard steps" className="scroll-thin -mx-1 overflow-x-auto px-1 pb-2">
      <ol className="flex min-w-max items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          const reachable = !locked && i <= maxReached && i < 6;
          return (
            <li key={s.id} className="flex items-center gap-1 sm:gap-2">
              <button type="button" disabled={!reachable} onClick={() => onJump(i)} aria-current={current ? 'step' : undefined}
                className={cx('flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium transition sm:px-3 sm:text-sm', current ? 'glass-strong text-fg' : done ? 'text-fg hover:bg-surface' : 'text-faint', !reachable && 'cursor-default')}>
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold', done ? 'bg-ok/15 text-ok' : current ? 'bg-forge text-white' : 'bg-surface-2')}>{done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className={cx(!current && 'hidden md:inline')}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span className={cx('h-px w-3 sm:w-6', i < step ? 'bg-ok/50' : 'bg-line-strong')} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Info2({ label, value, mono, icon: Icon }: { label: string; value: React.ReactNode; mono?: boolean; icon?: any }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</p>
      <p className={cx('mt-1 break-words text-sm font-medium', mono && 'font-mono text-[13px]')}>{value || <span className="text-faint">—</span>}</p>
    </div>
  );
}

export default function NewProject() {
  const { me, refreshMe } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [limits, setLimits] = useState<Limits>(FALLBACK_LIMITS);
  const [connections, setConnections] = useState<any[] | null>(null);
  const [addConn, setAddConn] = useState(false);

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [upload, setUpload] = useState<{ phase: 'idle' | 'packing' | 'uploading' | 'done' | 'error'; pct: number; error?: string; source?: UploadedSource }>({ phase: 'idle', pct: 0 });

  const [cfg, setCfg] = useState({ name: '', connection_id: '', framework: 'static', build_command: '', install_command: '', output_directory: '', root_directory: '', node_version: '22.x', package_manager: 'npm' });
  const [envs, setEnvs] = useState<EnvRow[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ status: 'idle' });
  const [customDomain, setCustomDomain] = useState('');
  const [ackErrors, setAckErrors] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<{ message: string; code?: string; projectId?: string } | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const checkSeq = useRef(0);

  useEffect(() => {
    loadConfig().then((c) => setLimits(c.limits)).catch(() => {});
    api('/api/connections').then((c) => {
      setConnections(c);
      const first = c.find((x: any) => x.status === 'connected') || c[0];
      if (first) setCfg((s) => ({ ...s, connection_id: s.connection_id || first.id }));
    }).catch(() => setConnections([]));
    refreshMe();
  }, [refreshMe]);

  const go = (i: number) => { setStep(i); setMaxReached((m) => Math.max(m, i)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const startUpload = useCallback(async (b: Bundle) => {
    setUpload({ phase: 'packing', pct: 0 });
    try {
      const source = await uploadBundle(b, (phase, pct) => setUpload({ phase, pct }));
      setUpload({ phase: 'done', pct: 100, source });
    } catch (e: any) {
      setUpload({ phase: 'error', pct: 0, error: e.message });
    }
  }, []);

  const onBundle = (b: Bundle) => {
    const a = analyze(b);
    setBundle(b);
    setAnalysis(a);
    const name = a.projectName.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim().slice(0, 60) || 'My Project';
    setCfg((s) => ({ ...s, name, framework: a.framework, build_command: a.buildCommand, install_command: a.installCommand, output_directory: a.outputDirectory, root_directory: a.rootDirectory, node_version: a.nodeVersion || '', package_manager: a.packageManager }));
    setEnvs(a.envRefs.slice(0, 40).map((e) => ({ key: e.key, value: '', is_secret: true })));
    if (!slugTouched) setSlug(slugify(a.projectName));
    startUpload(b);
  };

  // debounced subdomain check
  useEffect(() => {
    if (step !== 4) return;
    const s = slug.trim().toLowerCase();
    if (!s) { setSlugState({ status: 'idle' }); return; }
    if (!/^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$/.test(s) || s.includes('--')) { setSlugState({ status: 'invalid', message: 'Use 3–50 lowercase letters, numbers and single hyphens. Start and end with a letter or number.' }); return; }
    setSlugState({ status: 'checking' });
    const my = ++checkSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api(`/api/projects?action=check-subdomain&slug=${encodeURIComponent(s)}${cfg.connection_id ? `&connection_id=${cfg.connection_id}` : ''}`);
        if (my === checkSeq.current) setSlugState(r);
      } catch (e: any) {
        if (my === checkSeq.current) setSlugState({ status: 'error', message: e.message });
      }
    }, 550);
    return () => clearTimeout(t);
  }, [slug, step, cfg.connection_id]);

  const envErrs = useMemo(() => envErrors(envs), [envs]);
  const settingsValid = cfg.name.trim().length >= 2 && !!cfg.connection_id && Object.keys(envErrs).length === 0 && !/[\n`]/.test(cfg.build_command + cfg.install_command) && !cfg.root_directory.includes('..');
  const domainValid = !customDomain || (HOST_RE.test(customDomain.trim().toLowerCase()) && !customDomain.endsWith('.vercel.app'));
  const quotaFull = !!me && me.quota.used >= me.quota.limit;
  const selectedConn = connections?.find((c) => c.id === cfg.connection_id);

  const canNext = [
    upload.phase === 'done' && !!bundle,
    true,
    !!analysis && (analysis.supported || ackErrors),
    settingsValid,
    slugState.status === 'available' && domainValid,
    !quotaFull,
    false,
  ][step];

  const next = () => {
    if (step === 3 && !settingsValid) { setShowErrors(true); toast.error('Check the settings', 'Some fields need attention.'); return; }
    if (canNext) go(step + 1);
  };

  const deployNow = async () => {
    if (!bundle || !analysis || !upload.source) return;
    setDeploying(true);
    setDeployError(null);
    let projectId: string | undefined;
    try {
      const project = await api('/api/projects', {
        method: 'POST',
        body: {
          ...cfg,
          slug: slug.trim().toLowerCase(),
          source_path: upload.source.path,
          source_filename: upload.source.filename,
          file_count: bundle.files.length,
          manifest: manifestOf(bundle),
          analysis: compactAnalysis(analysis),
          env: envs.map((e) => ({ key: e.key.trim(), value: e.value, is_secret: e.is_secret })),
          custom_domain: customDomain.trim().toLowerCase() || undefined,
        },
      });
      projectId = project.id;
      setEnvs((rows) => rows.map((r) => ({ ...r, value: '' })));
      const dep = await api('/api/deploy', { method: 'POST', body: { project_id: project.id } });
      setDeploymentId(dep.id);
      refreshMe();
      go(6);
    } catch (e: any) {
      setDeployError({ message: e.message, code: e.code, projectId });
      if (e.code === 'quota_reached') refreshMe();
      if (e.code?.startsWith('subdomain_')) { setSlugState({ status: e.code.replace('subdomain_', ''), message: e.message }); }
    } finally {
      setDeploying(false);
    }
  };

  if (me && quotaFull && step < 6) {
    return (
      <div>
        <PageHeader eyebrow="New project" title="Create a project" />
        <Card><ErrorState kind="quota_reached" description={`Your ${me.plan?.name || 'current'} plan allows ${me.quota.limit} projects and you're using ${me.quota.used}. Upgrade your plan or delete a project to continue.`} actions={<><LinkButton to="/app/billing">View plans</LinkButton><LinkButton to="/app/projects" variant="secondary">Manage projects</LinkButton></>} /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow={`Step ${step + 1} of 7`} title={step === 6 ? 'Deploying your project' : 'Create a new project'} description="Upload source, inspect it, configure the build and deploy to your Vercel account." />
      <Stepper step={step} maxReached={maxReached} onJump={go} locked={step === 6} />

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="mt-4">
          {/* STEP 1: SOURCE */}
          {step === 0 && (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                {!bundle ? <SourceUploader limits={limits} onBundle={onBundle} /> : (
                  <Card className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ember/12 text-ember"><Package className="h-6 w-6" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{bundle.name}</p>
                        <p className="text-xs text-muted">{bundle.files.length.toLocaleString()} files · {bytes(bundle.totalSize)} unpacked{upload.source && <> · {bytes(upload.source.size)} compressed</>}{bundle.strippedRoot && <> · wrapper folder “{bundle.strippedRoot}/” removed</>}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setBundle(null); setAnalysis(null); setUpload({ phase: 'idle', pct: 0 }); }} disabled={upload.phase === 'packing' || upload.phase === 'uploading'}>Choose another</Button>
                    </div>
                    <div className="mt-5">
                      {upload.phase === 'error' ? (
                        <div className="flex flex-col gap-3 rounded-xl border border-bad/25 bg-bad/10 p-4 text-sm sm:flex-row sm:items-center"><XCircle className="h-5 w-5 shrink-0 text-bad" /><span className="flex-1">{upload.error}</span><Button size="sm" onClick={() => startUpload(bundle)} icon={<RefreshCw className="h-3.5 w-3.5" />}>Retry upload</Button></div>
                      ) : (
                        <>
                          <div className="mb-2 flex justify-between text-xs"><span className="flex items-center gap-1.5 text-muted">{upload.phase === 'done' ? <><CheckCircle2 className="h-3.5 w-3.5 text-ok" />Stored securely in private storage</> : <><Loader2 className="h-3.5 w-3.5 animate-spin" />{upload.phase === 'packing' ? 'Compressing normalized source' : 'Uploading to secure storage'}</>}</span><span className="font-mono">{upload.pct}%</span></div>
                          <Progress value={upload.phase === 'done' ? 100 : upload.phase === 'packing' ? upload.pct * 0.3 : 30 + upload.pct * 0.7} tone={upload.phase === 'done' ? 'ok' : 'forge'} />
                        </>
                      )}
                    </div>
                    {bundle.skipped.length > 0 && (
                      <details className="mt-4 rounded-xl border border-line bg-surface p-3 text-sm">
                        <summary className="cursor-pointer text-muted">{bundle.skipped.length} item(s) excluded from the upload</summary>
                        <ul className="scroll-thin mt-2 max-h-40 space-y-1 overflow-auto font-mono text-[11px]">{bundle.skipped.slice(0, 200).map((s, i) => <li key={i} className="flex gap-2"><span className="truncate text-fg">{s.path}</span><span className="shrink-0 text-faint">— {s.reason}</span></li>)}</ul>
                      </details>
                    )}
                  </Card>
                )}
              </div>
              <Card className="h-fit p-5 text-sm">
                <p className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4 text-ember" />Handled as untrusted</p>
                <ul className="mt-3 space-y-2 text-xs text-muted">
                  <li>• Archives are unpacked in your browser for preview — nothing runs on our servers.</li>
                  <li>• Unsafe paths, node_modules, build caches and .env files are removed.</li>
                  <li>• The normalized source is stored privately and only sent to Vercel.</li>
                  <li>• Limits: {limits.max_upload_mb} MB archive, {limits.max_unzipped_mb} MB unpacked, {limits.max_files.toLocaleString()} files.</li>
                </ul>
              </Card>
            </div>
          )}

          {/* STEP 2: SCAN */}
          {step === 1 && bundle && (
            <div className="space-y-4">
              <FileExplorer files={bundle.files} loadContent={async (p) => bundle.contents.get(p) || null} />
              <p className="text-xs text-muted">Source preview is rendered as plain text. Images are displayed in a sandboxed image element.</p>
            </div>
          )}

          {/* STEP 3: ANALYZE */}
          {step === 2 && analysis && (
            <div className="space-y-5">
              <Card className="relative overflow-hidden p-5 sm:p-6">
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember/15 blur-3xl" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forge text-white shadow-lg shadow-ember/30"><Sparkles className="h-6 w-6" /></div>
                  <div className="flex-1">
                    <p className="text-xs text-muted">Detected framework</p>
                    <p className="font-display text-xl font-semibold">{analysis.frameworkLabel}</p>
                  </div>
                  <Badge tone={analysis.confidence === 'high' ? 'ok' : analysis.confidence === 'medium' ? 'warn' : 'muted'}>{analysis.confidence} confidence</Badge>
                </div>
                <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Info2 label="Package manager" value={analysis.packageManager === 'none' ? 'None (static)' : analysis.packageManager} icon={Box} />
                  <Info2 label="Build command" value={analysis.buildCommand || 'Framework default / none'} mono icon={Cpu} />
                  <Info2 label="Output directory" value={analysis.outputDirectory || 'Framework default'} mono icon={FolderTree} />
                  <Info2 label="Node.js" value={analysis.nodeVersion || 'Not required'} icon={Hash} />
                  <Info2 label="Install command" value={analysis.installCommand || '—'} mono />
                  <Info2 label="Root directory" value={analysis.rootDirectory || './ (archive root)'} mono />
                  <Info2 label="Files analysed" value={`${analysis.stats.files.toLocaleString()} · ${bytes(analysis.stats.size)}`} />
                  <Info2 label="Top file types" value={analysis.stats.byExt.slice(0, 4).map((e) => `.${e.ext} ${e.count}`).join(' · ')} />
                </div>
                <p className="relative mt-4 flex items-center gap-1.5 text-xs text-muted"><Info className="h-3.5 w-3.5" />You can correct any of these in the next step.</p>
              </Card>

              {(analysis.errors.length > 0 || analysis.warnings.length > 0) && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {analysis.errors.length > 0 && (
                    <Card className="border-bad/25 p-5">
                      <p className="flex items-center gap-2 text-sm font-semibold text-bad"><XCircle className="h-4 w-4" />Potential errors ({analysis.errors.length})</p>
                      <ul className="mt-3 space-y-2 text-sm">{analysis.errors.map((e) => <li key={e}>• {e}</li>)}</ul>
                      <label className="mt-4 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={ackErrors} onChange={(e) => setAckErrors(e.target.checked)} className="h-4 w-4 accent-[var(--ember)]" />I understand — continue anyway</label>
                    </Card>
                  )}
                  {analysis.warnings.length > 0 && (
                    <Card className="border-warn/25 p-5">
                      <p className="flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle className="h-4 w-4" />Warnings ({analysis.warnings.length})</p>
                      <ul className="mt-3 space-y-2 text-sm text-muted">{analysis.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>
                    </Card>
                  )}
                </div>
              )}
              {!analysis.supported && <Card><ErrorState kind="unsupported" compact description={analysis.errors[0]} /></Card>}

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><FileCode2 className="h-4 w-4 text-ember" />Entry points</p>
                  {analysis.entryPoints.length ? <ul className="mt-3 space-y-1.5 font-mono text-xs">{analysis.entryPoints.map((e) => <li key={e} className="truncate">{e}</li>)}</ul> : <p className="mt-3 text-sm text-muted">None detected.</p>}
                  <p className="mt-5 flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4 text-ember" />Configuration files</p>
                  {analysis.configFiles.length ? <div className="mt-3 flex flex-wrap gap-1.5">{analysis.configFiles.map((c) => <span key={c} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px]">{c}</span>)}</div> : <p className="mt-3 text-sm text-muted">None found.</p>}
                </Card>
                <Card className="p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-ember" />Dependencies <span className="text-xs font-normal text-muted">({analysis.dependencies.length})</span></p>
                  {analysis.dependencies.length ? (
                    <div className="scroll-thin mt-3 flex max-h-56 flex-wrap gap-1.5 overflow-auto">{analysis.dependencies.slice(0, 80).map((d) => <span key={d.name + d.dev} className={cx('rounded-md px-2 py-0.5 font-mono text-[11px]', d.dev ? 'bg-surface text-muted' : 'bg-ember/10 text-fg')} title={d.version}>{d.name}<span className="text-faint">@{d.version.replace(/^[\^~]/, '')}</span></span>)}</div>
                  ) : <p className="mt-3 text-sm text-muted">No package.json dependencies.</p>}
                  {Object.keys(analysis.scripts).length > 0 && <>
                    <p className="mt-5 text-xs font-semibold text-muted">Scripts</p>
                    <ul className="mt-2 space-y-1 font-mono text-[11px]">{Object.entries(analysis.scripts).slice(0, 6).map(([k, v]) => <li key={k} className="truncate"><span className="text-ember">{k}</span>: {v}</li>)}</ul>
                  </>}
                </Card>
                <Card className="p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Variable className="h-4 w-4 text-ember" />Environment references <span className="text-xs font-normal text-muted">({analysis.envRefs.length})</span></p>
                  {analysis.envRefs.length ? (
                    <ul className="scroll-thin mt-3 max-h-64 space-y-2 overflow-auto">{analysis.envRefs.map((e) => <li key={e.key}><p className="font-mono text-xs font-semibold">{e.key}</p><p className="truncate font-mono text-[10px] text-faint">{e.files.join(', ')}</p></li>)}</ul>
                  ) : <p className="mt-3 text-sm text-muted">No process.env / import.meta.env references found.</p>}
                </Card>
              </div>
            </div>
          )}

          {/* STEP 4: SETTINGS */}
          {step === 3 && (
            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <Card className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Project name" htmlFor="pname" required error={showErrors && cfg.name.trim().length < 2 ? 'Enter a project name.' : null}><Input id="pname" value={cfg.name} maxLength={60} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></Field>
                  <Field label="Vercel connection" htmlFor="pconn" required error={showErrors && !cfg.connection_id ? 'Select or add a Vercel connection.' : null}>
                    {connections === null ? <Skeleton className="h-11" /> : connections.length === 0 ? (
                      <Button variant="secondary" className="h-11 w-full" onClick={() => setAddConn(true)} icon={<Plug className="h-4 w-4" />}>Connect Vercel</Button>
                    ) : (
                      <div className="flex gap-2">
                        <Select id="pconn" value={cfg.connection_id} onChange={(e) => setCfg({ ...cfg, connection_id: e.target.value })}>
                          {connections.map((c) => <option key={c.id} value={c.id} disabled={c.status === 'invalid'}>{c.name} — {c.team_name || c.vercel_username}{c.status === 'invalid' ? ' (invalid)' : ''}</option>)}
                        </Select>
                        <Button variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={() => setAddConn(true)} aria-label="Add connection"><Plus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </Field>
                  <Field label="Framework preset" htmlFor="pfw" hint={analysis ? `Detected: ${analysis.frameworkLabel}` : undefined}>
                    <Select id="pfw" value={cfg.framework} onChange={(e) => setCfg({ ...cfg, framework: e.target.value })}>{FRAMEWORKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select>
                  </Field>
                  <Field label="Node.js version" htmlFor="pnode">
                    <Select id="pnode" value={cfg.node_version} onChange={(e) => setCfg({ ...cfg, node_version: e.target.value })}><option value="">Vercel default</option>{NODE_VERSIONS.map((n) => <option key={n} value={n}>{n}</option>)}</Select>
                  </Field>
                  <Field label="Build command" htmlFor="pbuild" hint="Leave empty to use the framework default." error={/[\n`]/.test(cfg.build_command) ? 'Must be a single line.' : null}><Input id="pbuild" value={cfg.build_command} onChange={(e) => setCfg({ ...cfg, build_command: e.target.value })} placeholder="npm run build" className="font-mono text-[13px]" /></Field>
                  <Field label="Install command" htmlFor="pinstall" hint="Runs on Vercel’s build machines."><Input id="pinstall" value={cfg.install_command} onChange={(e) => setCfg({ ...cfg, install_command: e.target.value })} placeholder="npm install" className="font-mono text-[13px]" /></Field>
                  <Field label="Output directory" htmlFor="pout" hint={`Default for ${frameworkLabel(cfg.framework)}: ${FRAMEWORKS.find((f) => f.value === cfg.framework)?.output || 'root'}`}><Input id="pout" value={cfg.output_directory} onChange={(e) => setCfg({ ...cfg, output_directory: e.target.value })} placeholder="dist" className="font-mono text-[13px]" /></Field>
                  <Field label="Root directory" htmlFor="proot" hint="Subfolder containing the app, if not the archive root." error={cfg.root_directory.includes('..') ? 'Cannot contain “..”.' : null}><Input id="proot" value={cfg.root_directory} onChange={(e) => setCfg({ ...cfg, root_directory: e.target.value })} placeholder="./" className="font-mono text-[13px]" /></Field>
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Environment variables</p>
                    <span className="text-xs text-muted">Encrypted at rest · synced to Vercel as encrypted</span>
                  </div>
                  <EnvEditor rows={envs} onChange={setEnvs} showErrors={showErrors} />
                </div>
              </Card>
              <Card className="h-fit space-y-3 p-5 text-sm">
                <p className="font-medium">Build runs on Vercel</p>
                <p className="text-xs text-muted">Commands are passed to Vercel’s isolated build machines as project settings. DeployForge never runs these commands itself.</p>
                {selectedConn && <div className="rounded-xl border border-line bg-surface p-3 text-xs"><p className="text-muted">Deploying into</p><p className="mt-1 font-medium">{selectedConn.team_name ? `Team · ${selectedConn.team_name}` : `Personal · ${selectedConn.vercel_username}`}</p><p className="mt-1 font-mono text-faint">{selectedConn.token_hint}</p></div>}
              </Card>
            </div>
          )}

          {/* STEP 5: SUBDOMAIN */}
          {step === 4 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5 sm:p-6">
                <Field label="Project subdomain" htmlFor="slug" hint="Also used as the Vercel project name.">
                  <div className="flex items-stretch overflow-hidden rounded-xl border border-line-strong bg-surface focus-within:border-ember/60 focus-within:ring-4 focus-within:ring-ember/15">
                    <span className="flex items-center pl-3.5 font-mono text-sm text-faint">https://</span>
                    <input id="slug" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} className="min-w-0 flex-1 bg-transparent px-1 py-3 font-mono text-sm outline-none" maxLength={50} autoComplete="off" spellCheck={false} />
                    <span className="flex items-center pr-3.5 font-mono text-sm text-faint">.vercel.app</span>
                  </div>
                </Field>
                <div className="mt-4 min-h-14" aria-live="polite">
                  {slugState.status === 'checking' && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Checking availability…</p>}
                  {slugState.status === 'available' && <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" />Available — {slugState.message}</p>}
                  {slugState.status === 'used' && <p className="flex items-start gap-2 text-sm text-bad"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Already used.</b> {slugState.message}</span></p>}
                  {slugState.status === 'invalid' && <p className="flex items-start gap-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Invalid.</b> {slugState.message}</span></p>}
                  {slugState.status === 'reserved' && <p className="flex items-start gap-2 text-sm text-warn"><Ban className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Reserved.</b> {slugState.message}</span></p>}
                  {slugState.status === 'error' && <p className="flex items-start gap-2 text-sm text-bad"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{slugState.message}</p>}
                  {slugState.suggestion && slugState.status !== 'available' && <button onClick={() => setSlug(slugState.suggestion!)} className="mt-2 text-xs font-medium text-ember hover:underline">Try “{slugState.suggestion}”</button>}
                </div>
                <p className="mt-2 rounded-xl border border-line bg-surface p-3 text-xs text-muted">The final URL is assigned by Vercel after deployment. We always show you the actual URL Vercel returns — never a guessed one.</p>
              </Card>
              <Card className="p-5 sm:p-6">
                <Field label="Custom domain (optional)" htmlFor="cdom" error={!domainValid ? 'Enter a valid domain like www.example.com (not *.vercel.app).' : null} hint="Attached automatically after the first successful deployment.">
                  <Input id="cdom" value={customDomain} onChange={(e) => setCustomDomain(e.target.value.trim().toLowerCase())} placeholder="www.example.com" className="font-mono" />
                </Field>
                {customDomain && domainValid && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-muted">DNS records to add at your registrar</p>
                    <DnsTable records={previewDns(customDomain)} />
                    <p className="text-[11px] text-faint">Vercel may also request a TXT verification record — it will appear in the project’s Domains tab.</p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* STEP 6: REVIEW */}
          {step === 5 && bundle && analysis && (
            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <Card className="p-5 sm:p-6">
                <h2 className="font-display text-base font-semibold">Review configuration</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info2 label="Project" value={cfg.name} />
                  <Info2 label="Source" value={`${upload.source?.filename} · ${bundle.files.length.toLocaleString()} files · ${bytes(upload.source?.size)}`} />
                  <Info2 label="Detected framework" value={analysis.frameworkLabel} />
                  <Info2 label="Framework preset" value={frameworkLabel(cfg.framework)} />
                  <Info2 label="Vercel connection" value={selectedConn ? `${selectedConn.name} (${selectedConn.team_name || selectedConn.vercel_username})` : '—'} />
                  <Info2 label="Subdomain" value={`${slug}.vercel.app (requested)`} mono />
                  <Info2 label="Custom domain" value={customDomain || 'None'} mono />
                  <Info2 label="Node.js" value={cfg.node_version || 'Vercel default'} />
                  <Info2 label="Build command" value={cfg.build_command || 'Framework default'} mono />
                  <Info2 label="Install command" value={cfg.install_command || 'Framework default'} mono />
                  <Info2 label="Output directory" value={cfg.output_directory || 'Framework default'} mono />
                  <Info2 label="Root directory" value={cfg.root_directory || './'} mono />
                </div>
                <div className="mt-4 rounded-xl border border-line bg-surface p-3.5">
                  <p className="text-[11px] text-muted">Environment configuration</p>
                  {envs.length ? <div className="mt-2 flex flex-wrap gap-1.5">{envs.map((e) => <span key={e.key} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px]">{e.key}={e.is_secret ? '••••••' : e.value.slice(0, 16)}</span>)}</div> : <p className="mt-1 text-sm">No variables</p>}
                </div>
                {analysis.warnings.length > 0 && <p className="mt-4 flex items-center gap-2 text-xs text-warn"><AlertTriangle className="h-3.5 w-3.5" />{analysis.warnings.length} analysis warning(s) — review them in the Analyze step.</p>}
              </Card>
              <div className="space-y-4">
                <Card className="p-5">
                  <p className="text-sm font-semibold">Plan usage</p>
                  {me && <>
                    <p className="mt-2 text-sm text-muted">{me.plan?.name} plan · {me.quota.used} of {me.quota.limit} projects used</p>
                    <Progress value={((me.quota.used + 1) / me.quota.limit) * 100} className="mt-3" />
                    <p className="mt-2 text-xs text-muted">After this project: {me.quota.used + 1} / {me.quota.limit}</p>
                  </>}
                </Card>
                {deployError && (
                  <Card className="border-bad/30 p-4 text-sm">
                    <p className="flex items-start gap-2 text-bad"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{deployError.message}</p>
                    {deployError.code === 'quota_reached' && <LinkButton to="/app/billing" size="sm" className="mt-3">Upgrade plan</LinkButton>}
                    {deployError.code?.startsWith('subdomain_') && <Button size="sm" variant="secondary" className="mt-3" onClick={() => go(4)}>Change subdomain</Button>}
                    {deployError.projectId && <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate(`/app/projects/${deployError.projectId}`)}>Open project</Button>}
                  </Card>
                )}
                <Button size="lg" className="w-full" onClick={deployNow} loading={deploying} disabled={quotaFull || !upload.source} icon={<Rocket className="h-5 w-5" />}>Deploy now</Button>
                <p className="text-center text-xs text-muted">A background job will run the deployment — you can leave this page at any time.</p>
              </div>
            </div>
          )}

          {/* STEP 7: DEPLOY */}
          {step === 6 && deploymentId && <DeploymentLive id={deploymentId} compact />}
        </motion.div>
      </AnimatePresence>

      {step < 6 && (
        <div className="sticky bottom-24 z-10 mt-6 lg:bottom-4">
          <div className="glass-strong flex items-center justify-between gap-3 rounded-2xl bg-bg/80 p-3 shadow-xl">
            <Button variant="ghost" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button>
            <span className="hidden text-xs text-muted sm:block">{STEPS[step].label}</span>
            {step < 5 ? <Button onClick={next} disabled={step !== 3 && !canNext}>Continue<ArrowRight className="h-4 w-4" /></Button> : <span />}
          </div>
        </div>
      )}

      <AddConnectionModal open={addConn} onClose={() => setAddConn(false)} onCreated={(c) => { setConnections((l) => [...(l || []), c]); setCfg((s) => ({ ...s, connection_id: c.id })); }} />
    </div>
  );
}
