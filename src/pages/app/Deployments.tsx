import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Rocket } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { Button, Card, EmptyState, LinkButton, PageHeader, Pagination, Skeleton, StatusBadge, cx } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import { dateTime, duration, timeAgo } from '../../lib/format';

export const FILTERS = [{ id: 'all', label: 'All' }, { id: 'success', label: 'Success' }, { id: 'failed', label: 'Failed' }, { id: 'building', label: 'Building' }];

export function DeploymentTable({ items }: { items: any[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Deployment</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Source</th><th className="px-3 py-3 font-medium">Created</th><th className="px-3 py-3 font-medium">Duration</th><th className="px-5 py-3 font-medium">URL</th></tr></thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0 hover:bg-surface">
                <td className="px-5 py-3"><Link to={`/app/deployments/${d.id}`} className="font-medium hover:text-ember">{d.projects?.name || 'Deployment'}</Link><p className="font-mono text-[11px] text-muted">{d.id.slice(0, 8)}{d.vercel_deployment_id ? ` · ${d.vercel_deployment_id.slice(0, 12)}` : ''}</p></td>
                <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                <td className="max-w-[160px] truncate px-3 py-3 text-xs text-muted">{d.source_label || '—'}</td>
                <td className="px-3 py-3 text-xs text-muted" title={dateTime(d.created_at)}>{timeAgo(d.created_at)}</td>
                <td className="px-3 py-3 font-mono text-xs">{duration(d.duration_ms)}</td>
                <td className="px-5 py-3">{d.url && d.status === 'completed' ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[220px] items-center gap-1 truncate font-mono text-xs text-ember hover:underline">{d.url.replace('https://', '')}<ExternalLink className="h-3 w-3 shrink-0" /></a> : <span className="text-xs text-faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {items.map((d) => (
          <li key={d.id}><Link to={`/app/deployments/${d.id}`} className="block px-4 py-3.5 hover:bg-surface">
            <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{d.projects?.name || 'Deployment'}</span><StatusBadge status={d.status} /></div>
            <p className="mt-1 font-mono text-[11px] text-muted">{d.id.slice(0, 8)} · {timeAgo(d.created_at)} · {duration(d.duration_ms)}</p>
            {d.url && d.status === 'completed' && <p className="mt-1 truncate font-mono text-[11px] text-ember">{d.url}</p>}
          </Link></li>
        ))}
      </ul>
    </>
  );
}

export default function Deployments() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/api/deploy?status=${status}&page=${page}&size=20`);

  return (
    <div>
      <PageHeader eyebrow="History" title="Deployments" description="Every deployment across your projects with real Vercel status." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter deployments">
        {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={status === f.id} onClick={() => { setPage(1); setParams(f.id === 'all' ? {} : { status: f.id }); }} className={cx('rounded-xl px-3.5 py-2 text-sm font-medium transition', status === f.id ? 'bg-forge text-white shadow-lg shadow-ember/20' : 'glass text-muted hover:text-fg')}>{f.label}</button>)}
      </div>
      <Card className="overflow-hidden">
        {error && !data ? <ErrorState kind="generic" compact description={error.message} actions={<Button onClick={() => reload()}>Retry</Button>} />
          : loading && !data ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : !data?.items.length ? <EmptyState icon={<Rocket className="h-7 w-7" />} title={status === 'all' ? 'No deployments yet' : 'Nothing here'} description={status === 'all' ? 'Deploy a project to see its history.' : 'No deployments match this filter.'} action={status === 'all' ? <LinkButton to="/app/new">Create project</LinkButton> : undefined} />
          : <DeploymentTable items={data.items} />}
      </Card>
      {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
    </div>
  );
}
