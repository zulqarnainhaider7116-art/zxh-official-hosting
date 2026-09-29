import { useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Button, Card, ConfirmModal, EmptyState, LinkButton, PageHeader, Skeleton, cx } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import DomainRow from '../../components/DomainRow';

export default function Domains() {
  const { data, error, loading, reload, setData } = useApi<any[]>('/api/projects?action=domains');
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'generated' | 'custom'>('all');
  const [del, setDel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => (data || []).filter((d) => filter === 'all' || d.type === filter), [data, filter]);

  const verify = async (d: any) => {
    try {
      const r = await api('/api/projects?action=domain-verify', { method: 'POST', body: { id: d.id } });
      setData((l) => l?.map((x) => (x.id === d.id ? { ...x, ...r } : x)) || l);
      toast.info('Domain checked', r.note || `Status: ${r.status.replace(/_/g, ' ')}`);
    } catch (e: any) { toast.error('Check failed', e.message); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api('/api/projects?action=domain', { method: 'DELETE', body: { id: del.id } }); toast.success('Domain removed'); setDel(null); reload(true); }
    catch (e: any) { toast.error('Could not remove', e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Domains" title="Domains" description="Generated Vercel URLs and custom domains across all projects. Add custom domains from a project’s Domains tab." />
      <div className="mb-4 flex gap-2">
        {(['all', 'generated', 'custom'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('rounded-xl px-3.5 py-2 text-sm font-medium capitalize', filter === f ? 'bg-forge text-white' : 'glass text-muted hover:text-fg')}>{f}</button>)}
      </div>
      {error && !data ? <ErrorState kind="generic" description={error.message} actions={<Button onClick={() => reload()}>Retry</Button>} />
        : loading && !data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : !list.length ? <Card><EmptyState icon={<Globe className="h-7 w-7" />} title="No domains yet" description="Generated URLs appear after your first successful deployment. Custom domains can be added per project." action={<LinkButton to="/app/projects">Go to projects</LinkButton>} /></Card>
        : <div className="space-y-3">{list.map((d) => <DomainRow key={d.id} domain={d} showProject onVerify={() => verify(d)} onRemove={() => setDel(d)} />)}</div>}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title={`Remove ${del?.hostname}?`} confirmLabel="Remove domain" message="The domain will be detached from the Vercel project and stop serving your site." />
    </div>
  );
}
