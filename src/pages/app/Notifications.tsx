import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CheckCircle2, CreditCard, Gauge, Megaphone, Rocket, Trash2, XCircle, ShieldAlert } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Card, EmptyState, PageHeader, Pagination, Skeleton, cx } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import { dateTime, timeAgo } from '../../lib/format';

const ICONS: Record<string, any> = { deploy_success: CheckCircle2, deploy_failed: XCircle, payment_submitted: CreditCard, subscription_approved: CheckCircle2, subscription_rejected: XCircle, payment_correction: CreditCard, quota_reached: Gauge, announcement: Megaphone, security: ShieldAlert, payment_pending: CreditCard };
const TONE: Record<string, string> = { deploy_success: 'text-ok bg-ok/10', subscription_approved: 'text-ok bg-ok/10', deploy_failed: 'text-bad bg-bad/10', subscription_rejected: 'text-bad bg-bad/10', quota_reached: 'text-warn bg-warn/10', payment_correction: 'text-warn bg-warn/10' };

export default function Notifications() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, error, loading, reload } = useApi<any>(`/api/me?action=notifications&page=${page}&size=20${unreadOnly ? '&unread=1' : ''}`);
  const { setUnread } = useAuth();
  const navigate = useNavigate();

  const markAll = async () => { await api('/api/me?action=notifications', { method: 'POST', body: {} }); setUnread(0); reload(true); };
  const open = async (n: any) => {
    if (!n.read_at) { await api('/api/me?action=notifications', { method: 'POST', body: { id: n.id } }).catch(() => {}); setUnread(Math.max(0, (data?.unread || 1) - 1)); }
    if (n.link) navigate(n.link); else reload(true);
  };
  const remove = async (n: any) => { await api('/api/me?action=notifications', { method: 'DELETE', body: { id: n.id } }).catch(() => {}); reload(true); };

  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Notifications" description={data ? `${data.unread} unread` : undefined} actions={<>
        <Button variant="secondary" size="sm" onClick={() => { setPage(1); setUnreadOnly((u) => !u); }}>{unreadOnly ? 'Show all' : 'Unread only'}</Button>
        <Button size="sm" onClick={markAll} disabled={!data?.unread} icon={<CheckCheck className="h-4 w-4" />}>Mark all read</Button>
      </>} />
      <Card className="overflow-hidden">
        {error && !data ? <ErrorState kind="generic" compact description={error.message} />
          : loading && !data ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          : !data?.items.length ? <EmptyState icon={<Bell className="h-7 w-7" />} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="Deployment results, payment reviews and announcements will show up here." />
          : (
            <ul>
              {data.items.map((n: any) => {
                const Icon = ICONS[n.type] || Rocket;
                return (
                  <li key={n.id} className={cx('group flex items-start gap-3 border-b border-line px-4 py-4 last:border-0 sm:px-5', !n.read_at && 'bg-ember/[0.04]')}>
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE[n.type] || 'bg-surface-2 text-muted')}><Icon className="h-4 w-4" /></span>
                    <button onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                      <p className="flex items-center gap-2 text-sm font-medium">{!n.read_at && <span className="h-2 w-2 rounded-full bg-ember" />}{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-faint" title={dateTime(n.created_at)}>{timeAgo(n.created_at)}</p>
                    </button>
                    <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100" onClick={() => remove(n)} aria-label="Delete notification"><Trash2 className="h-4 w-4" /></Button>
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
      {data && <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />}
    </div>
  );
}
