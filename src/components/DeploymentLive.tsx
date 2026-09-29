import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, Copy, ExternalLink, Hammer, LayoutDashboard, RefreshCw, Rocket, Settings2, ShieldCheck, Square, UploadCloud, X, AlertTriangle, ScrollText, Wrench, Radio } from 'lucide-react';
import { useDeploymentStream } from '../lib/useDeploymentStream';
import { api } from '../lib/api';
import { ACTIVE_STATUSES, PHASES } from '../lib/constants';
import { dateTime, duration } from '../lib/format';
import { Button, Card, CopyButton, LinkButton, Progress, Skeleton, StatusBadge, cx, ConfirmModal } from './ui';
import LogViewer from './LogViewer';
import ErrorState from './ErrorState';
import { useToast } from '../contexts/ToastContext';

const PHASE_ICON: Record<string, any> = { queued: Clock, preparing: Settings2, uploading: UploadCloud, building: Hammer, checking: ShieldCheck, completed: Rocket };

function phaseIndex(d: any) {
  if (d.status === 'completed') return 5;
  const idx = PHASES.findIndex((p) => p.id === d.status);
  if (idx >= 0) return idx;
  if (d.ready_at) return 4;
  if (d.building_at) return 3;
  if (d.files_total) return 2;
  if (d.started_at) return 1;
  return 0;
}

function SuccessBurst() {
  return (
    <div className="relative mx-auto h-24 w-24">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="absolute inset-0 rounded-full border-2 border-ok/50" initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: 2.1, opacity: 0 }} transition={{ duration: 1.8, delay: i * 0.4, repeat: Infinity, ease: 'easeOut' }} />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <motion.span key={`s${i}`} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber"
          initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos((i / 10) * Math.PI * 2) * 70, y: Math.sin((i / 10) * Math.PI * 2) * 70, opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 }} />
      ))}
      <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="relative flex h-24 w-24 items-center justify-center rounded-full bg-ok text-white shadow-[0_0_60px_-10px] shadow-ok">
        <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.25 }} />
        </svg>
      </motion.div>
    </div>
  );
}

export default function DeploymentLive({ id, compact }: { id: string; compact?: boolean }) {
  const { deployment: d, logs, mode, error, reconnect } = useDeploymentStream(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const relevant = useMemo(() => logs.filter((l) => l.level === 'error').slice(-12), [logs]);

  if (error && !d) {
    if (error.status === 404) return <ErrorState kind="404" title="Deployment not found" description="This deployment doesn’t exist or belongs to another account." actions={<LinkButton to="/app/deployments" variant="secondary">All deployments</LinkButton>} />;
    return <ErrorState kind={error.status === 0 ? 'offline' : 'generic'} description={error.message} actions={<Button onClick={reconnect} icon={<RefreshCw className="h-4 w-4" />}>Retry</Button>} />;
  }
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const active = ACTIVE_STATUSES.includes(d.status);
  const pi = phaseIndex(d);
  const project = d.projects;

  const redeploy = async () => {
    setBusy('redeploy');
    try {
      const created = await api('/api/deploy', { method: 'POST', body: { project_id: d.project_id } });
      toast.success('Redeploy started');
      navigate(`/app/deployments/${created.id}`);
    } catch (e: any) { toast.error('Could not redeploy', e.message); } finally { setBusy(null); }
  };
  const retry = async () => {
    setBusy('retry');
    try {
      const created = await api('/api/deploy?action=retry', { method: 'POST', body: { id: d.id } });
      toast.success('Retry started');
      navigate(`/app/deployments/${created.id}`);
    } catch (e: any) { toast.error('Could not retry', e.message); } finally { setBusy(null); }
  };
  const cancel = async () => {
    setBusy('cancel');
    try {
      await api('/api/deploy?action=cancel', { method: 'POST', body: { id: d.id } });
      toast.info('Deployment cancelled');
      setConfirmCancel(false);
      reconnect();
    } catch (e: any) { toast.error('Could not cancel', e.message); } finally { setBusy(null); }
  };
  const scrollLogs = () => document.getElementById(`logs-${d.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden p-5 sm:p-6">
        {active && <div className="absolute inset-x-0 top-0 h-px bg-forge opacity-80" />}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={d.status} />
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted"><Radio className={cx('h-3 w-3', mode === 'stream' ? 'text-ok' : 'text-faint')} />{mode === 'stream' ? 'streaming' : mode === 'poll' ? 'polling' : mode === 'done' ? 'final' : 'connecting'}</span>
            </div>
            <h2 className="mt-2 truncate font-display text-lg font-semibold sm:text-xl">{project?.name || 'Deployment'}</h2>
            <p className="mt-1 font-mono text-[11px] text-muted">ID {d.id}{d.vercel_deployment_id && <> · Vercel {d.vercel_deployment_id}</>}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active && <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)} icon={<Square className="h-3.5 w-3.5" />}>Cancel</Button>}
            {d.inspector_url && <a href={d.inspector_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-xs font-medium hover:bg-surface-2">Vercel inspector <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>

        <ol className="mt-6 grid grid-cols-6 gap-1.5 sm:gap-3" aria-label="Deployment progress">
          {PHASES.map((p, i) => {
            const Icon = PHASE_ICON[p.id];
            const done = d.status === 'completed' || i < pi;
            const current = i === pi && active;
            const failedHere = i === pi && d.status === 'failed';
            const cancelledHere = i === pi && d.status === 'cancelled';
            return (
              <li key={p.id} className="flex flex-col items-center gap-2 text-center" aria-current={current ? 'step' : undefined}>
                <div className={cx('relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors sm:h-11 sm:w-11',
                  done ? 'border-ok/30 bg-ok/15 text-ok' : failedHere ? 'border-bad/40 bg-bad/15 text-bad' : cancelledHere ? 'border-line-strong bg-surface-2 text-muted' : current ? 'border-ember/50 bg-ember/15 text-ember' : 'border-line bg-surface text-faint')}>
                  {current && <span className="absolute inset-0 animate-ping rounded-xl border border-ember/40" />}
                  {done ? <Check className="h-4 w-4" /> : failedHere ? <X className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cx('hidden text-[11px] font-medium sm:block', current ? 'text-fg' : 'text-muted')}>{p.label}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-xs text-muted">
            <span>{d.status === 'uploading' && d.files_total ? `Uploading files ${d.files_uploaded}/${d.files_total}` : PHASES[pi]?.label}</span>
            <span className="font-mono">{Math.round(d.progress || 0)}%</span>
          </div>
          <Progress value={d.progress || 0} tone={d.status === 'failed' ? 'bad' : d.status === 'completed' ? 'ok' : 'forge'} />
        </div>
      </Card>

      <AnimatePresence>
        {d.status === 'completed' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="relative overflow-hidden p-6 text-center sm:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--ok)_18%,transparent),transparent_60%)]" />
              <div className="relative">
                <SuccessBurst />
                <h3 className="mt-6 font-display text-xl font-semibold sm:text-2xl">Your site is live</h3>
                {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all font-mono text-sm text-ember underline-offset-4 hover:underline">{d.url}</a>}
                <dl className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
                  {[['Project', project?.name], ['Build duration', duration(d.duration_ms)], ['Completed', dateTime(d.finished_at)], ['Deployment', d.vercel_deployment_id?.slice(0, 14) + '…']].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-line bg-surface p-3"><dt className="text-[11px] text-muted">{k}</dt><dd className="mt-1 truncate text-sm font-medium">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-forge px-4 text-sm font-medium text-white shadow-lg shadow-ember/25"><ExternalLink className="h-4 w-4" />Open website</a>}
                  {d.url && <CopyButton value={d.url} label="Copy URL" size="md" />}
                  <Button variant="secondary" onClick={scrollLogs} icon={<ScrollText className="h-4 w-4" />}>View logs</Button>
                  <Button variant="secondary" onClick={redeploy} loading={busy === 'redeploy'} icon={<RefreshCw className="h-4 w-4" />}>Redeploy</Button>
                  <LinkButton to="/app" variant="ghost" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</LinkButton>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
        {d.status === 'failed' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden border-bad/25 p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bad/15 text-bad"><AlertTriangle className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-semibold">{d.error_code === 'timeout' ? 'Deployment timed out' : d.building_at ? 'Build failed' : 'Deployment failed'}</h3>
                  <p className="mt-1 break-words text-sm">{d.error_message}</p>
                  {d.error_hint && <p className="mt-3 rounded-xl border border-warn/25 bg-warn/10 p-3 text-sm"><Wrench className="mr-1.5 inline h-4 w-4 text-warn" />{d.error_hint}</p>}
                  {relevant.length > 0 && (
                    <div className="mt-4 rounded-xl bg-term p-3 font-mono text-[11px] leading-relaxed text-bad sm:text-xs">
                      <p className="mb-1 text-[10px] uppercase tracking-widest text-[#6f645b]">Relevant log lines</p>
                      {relevant.map((l) => <div key={l.id} className="whitespace-pre-wrap break-words">{l.message}</div>)}
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button onClick={retry} loading={busy === 'retry'} icon={<RefreshCw className="h-4 w-4" />}>Retry deployment</Button>
                    <LinkButton to={`/app/projects/${d.project_id}?tab=settings`} variant="secondary" icon={<Settings2 className="h-4 w-4" />}>Edit configuration</LinkButton>
                    <Button variant="ghost" onClick={scrollLogs} icon={<ScrollText className="h-4 w-4" />}>Full logs</Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
        {d.status === 'cancelled' && (
          <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">This deployment was cancelled. The previous production deployment (if any) is unaffected.</p>
            <Button onClick={redeploy} loading={busy === 'redeploy'} icon={<Rocket className="h-4 w-4" />}>Deploy again</Button>
          </Card>
        )}
      </AnimatePresence>

      <LogViewer id={`logs-${d.id}`} logs={logs} live={active} height={compact ? 'h-[320px]' : 'h-[460px]'} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        <span>Created {dateTime(d.created_at)}</span>
        {d.finished_at && <span>Finished {dateTime(d.finished_at)}</span>}
        {d.source_label && <span>Source {d.source_label}</span>}
        <span>Attempt #{d.attempt}</span>
        {project && <Link to={`/app/projects/${d.project_id}`} className="text-ember hover:underline">Open project →</Link>}
        {d.url && d.status !== 'completed' && <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" />{d.url}</span>}
      </div>

      <ConfirmModal open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={cancel} loading={busy === 'cancel'} danger title="Cancel this deployment?" message="The build on Vercel will be stopped. Your current production deployment stays online." confirmLabel="Cancel deployment" />
    </div>
  );
}
