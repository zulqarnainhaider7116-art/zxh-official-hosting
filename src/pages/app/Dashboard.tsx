import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, ExternalLink, FolderKanban, Globe, Loader2, Plug, Plus, Rocket, XCircle, ArrowRight, Gauge } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { Card, EmptyState, LinkButton, PageHeader, Progress, Skeleton, StatCard, StatusBadge, Button } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import { duration, humanAction, timeAgo } from '../../lib/format';
import { frameworkLabel } from '../../lib/constants';

function Chart({ days }: { days: { date: string; success: number; failed: number; other: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.success + d.failed + d.other));
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2" role="img" aria-label="Deployments over the last 14 days">
      {days.map((d, i) => {
        const total = d.success + d.failed + d.other;
        return (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
            <motion.div initial={{ height: 0 }} animate={{ height: `${(total / max) * 100}%` }} transition={{ delay: i * 0.03, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="flex min-h-[3px] flex-col-reverse overflow-hidden rounded-md bg-surface-2">
              {total > 0 && <>
                <div className="bg-ok" style={{ height: `${(d.success / total) * 100}%` }} />
                <div className="bg-bad" style={{ height: `${(d.failed / total) * 100}%` }} />
                <div className="bg-amber" style={{ height: `${(d.other / total) * 100}%` }} />
              </>}
            </motion.div>
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-[10px] text-bg group-hover:block">{d.date.slice(5)} · {total} deploys</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<any>('/api/me?action=dashboard');
  const name = me?.profile?.full_name?.split(' ')[0];

  if (error && !data) return <ErrorState kind={error.status === 0 ? 'offline' : 'generic'} description={error.message} actions={<Button onClick={() => reload()}>Try again</Button>} />;

  return (
    <div>
      <PageHeader eyebrow="Overview" title={<>Welcome back{name ? `, ${name}` : ''}</>} description="Your deployments, projects and connected accounts at a glance." actions={<LinkButton to="/app/new" icon={<Plus className="h-4 w-4" />}>New project</LinkButton>} />

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Projects" value={data.stats.projects} icon={<FolderKanban className="h-4 w-4" />} sub={`${data.quota.limit - data.quota.used} slots left`} />
            <StatCard label="Active deployments" value={data.stats.active} icon={<Loader2 className={data.stats.active ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />} tone="warn" sub={data.stats.active ? 'Building now' : 'Nothing running'} delay={0.05} />
            <StatCard label="Successful builds" value={data.stats.success} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" sub={`${data.stats.total} total deployments`} delay={0.1} />
            <StatCard label="Failed builds" value={data.stats.failed} icon={<XCircle className="h-4 w-4" />} tone="bad" sub={data.stats.total ? `${Math.round((data.stats.success / data.stats.total) * 100)}% success rate` : 'No deployments yet'} delay={0.15} />
          </div>

          {data.connections.length === 0 && (
            <Card className="mt-5 flex flex-col items-start gap-4 border-ember/30 p-5 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ember/15 text-ember"><Plug className="h-5 w-5" /></div>
              <div className="flex-1"><p className="font-semibold">Connect your Vercel account to start deploying</p><p className="text-sm text-muted">Your token is validated server-side and encrypted — we never show it again.</p></div>
              <LinkButton to="/app/connections">Connect Vercel</LinkButton>
            </Card>
          )}

          {data.active.length > 0 && (
            <Card className="mt-5 p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-warn" />In progress</p>
              <div className="space-y-3">
                {data.active.map((d: any) => (
                  <Link key={d.id} to={`/app/deployments/${d.id}`} className="block rounded-xl border border-line bg-surface p-3 transition hover:border-ember/40">
                    <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{d.projects?.name}</span><StatusBadge status={d.status} /></div>
                    <Progress value={d.progress} className="mt-2 h-1.5" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Deployments · last 14 days</p>
                <div className="flex gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ok" />Success</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-bad" />Failed</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber" />Other</span></div>
              </div>
              <Chart days={data.chart} />
            </Card>
            <Card className="p-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-ember" />Project quota</p>
              <p className="mt-4 font-display text-3xl font-semibold">{data.quota.used}<span className="text-lg text-muted"> / {data.quota.limit}</span></p>
              <Progress value={(data.quota.used / data.quota.limit) * 100} className="mt-3" tone={data.quota.used >= data.quota.limit ? 'bad' : 'forge'} />
              <p className="mt-2 text-xs text-muted">{data.plan?.name} plan</p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-center">
                <Link to="/app/connections" className="rounded-xl border border-line bg-surface p-3 hover:border-ember/40"><p className="font-display text-xl font-semibold">{data.stats.connections}</p><p className="text-[11px] text-muted">Vercel accounts</p></Link>
                <Link to="/app/domains" className="rounded-xl border border-line bg-surface p-3 hover:border-ember/40"><p className="font-display text-xl font-semibold">{data.stats.domains}</p><p className="text-[11px] text-muted">Domains</p></Link>
              </div>
              <LinkButton to="/app/billing" variant="secondary" size="sm" className="mt-4 w-full">Manage plan</LinkButton>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            <Card className="overflow-hidden lg:col-span-3">
              <div className="flex items-center justify-between border-b border-line px-5 py-4"><p className="text-sm font-semibold">Projects</p><Link to="/app/projects" className="flex items-center gap-1 text-xs text-ember hover:underline">View all <ArrowRight className="h-3 w-3" /></Link></div>
              {data.projects.length === 0 ? (
                <EmptyState icon={<FolderKanban className="h-7 w-7" />} title="No projects yet" description="Upload a ZIP of your site and deploy it to Vercel in a few minutes." action={<LinkButton to="/app/new" icon={<Plus className="h-4 w-4" />}>Create project</LinkButton>} />
              ) : (
                <ul>
                  {data.projects.map((p: any) => (
                    <li key={p.id} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember/10 font-display text-xs font-bold text-ember">{p.name.slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/app/projects/${p.id}`} className="block truncate text-sm font-medium hover:text-ember">{p.name}</Link>
                        <p className="truncate text-xs text-muted">{frameworkLabel(p.framework)} · {p.last_deployed_at ? `deployed ${timeAgo(p.last_deployed_at)}` : 'never deployed'}</p>
                      </div>
                      <StatusBadge status={p.status} className="hidden sm:inline-flex" />
                      {p.production_url && <a href={p.production_url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Open ${p.name}`}><ExternalLink className="h-4 w-4" /></a>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="overflow-hidden lg:col-span-2">
              <div className="border-b border-line px-5 py-4"><p className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-ember" />Recent activity</p></div>
              {data.activity.length === 0 && data.recent.length === 0 ? <p className="p-6 text-center text-sm text-muted">Activity will appear here.</p> : (
                <ul className="scroll-thin max-h-[420px] overflow-auto">
                  {data.recent.slice(0, 5).map((d: any) => (
                    <li key={d.id}><Link to={`/app/deployments/${d.id}`} className="flex items-center gap-3 border-b border-line px-5 py-3 hover:bg-surface">
                      <Rocket className="h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm">{d.projects?.name}</p><p className="text-[11px] text-muted">{timeAgo(d.created_at)} · {duration(d.duration_ms)}</p></div>
                      <StatusBadge status={d.status} />
                    </Link></li>
                  ))}
                  {data.activity.map((a: any) => (
                    <li key={a.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                      <Globe className="h-4 w-4 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm">{humanAction(a.action)}{a.metadata?.name ? ` · ${a.metadata.name}` : ''}</p><p className="text-[11px] text-muted">{timeAgo(a.created_at)}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
