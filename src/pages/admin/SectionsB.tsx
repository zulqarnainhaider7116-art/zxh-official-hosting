import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock, Database, Edit3, ExternalLink, FileText, HardDrive, KeyRound, Megaphone, Plus, RefreshCw, Rocket, ShieldCheck, Trash2, Wifi, XCircle, MessageSquareWarning, Eye, Coins } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Badge, Button, Card, ConfirmModal, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Textarea, Toggle, cx } from '../../components/ui';
import { AdminTable, Chips, useAdminRole } from './shared';
import { dateOnly, dateTime, money, timeAgo } from '../../lib/format';

export function AdminSubscriptions() {
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=subscriptions&page=${page}${status !== 'all' ? `&status=${status}` : ''}`);
  const [cancel, setCancel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const doCancel = async () => { setBusy(true); try { await api('/api/admin?action=subscription-cancel', { method: 'POST', body: { id: cancel.id } }); toast.success('Subscription cancelled'); setCancel(null); reload(true); } catch (e: any) { toast.error('Failed', e.message); } finally { setBusy(false); } };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Subscriptions" description="Created automatically when a payment request is approved." />
      <div className="mb-4"><Chips options={[{ id: 'active', label: 'Active' }, { id: 'expired', label: 'Expired' }, { id: 'cancelled', label: 'Cancelled' }, { id: 'replaced', label: 'Replaced' }, { id: 'all', label: 'All' }]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} /></div>
      <AdminTable rows={data?.items} loading={loading} error={error?.message} onRetry={() => reload()} page={data} onPage={setPage} empty="No subscriptions."
        cols={[
          { key: 'u', label: 'User', render: (s: any) => <span className="text-sm">{s.profiles?.email}</span> },
          { key: 'p', label: 'Plan', render: (s: any) => <span>{s.plans?.name} <span className="text-xs text-muted">· {s.project_limit} projects</span></span> },
          { key: 'a', label: 'Amount', render: (s: any) => money(s.amount, s.currency), hideSm: true },
          { key: 'd', label: 'Period', render: (s: any) => <span className="text-xs">{dateOnly(s.starts_at)} → {s.ends_at ? dateOnly(s.ends_at) : '∞'}</span> },
          { key: 's', label: 'Status', render: (s: any) => <StatusBadge status={s.status} /> },
          { key: 'x', label: '', render: (s: any) => canWrite && s.status === 'active' && <Button variant="ghost" size="sm" className="text-bad" onClick={() => setCancel(s)} icon={<Ban className="h-3.5 w-3.5" />}>Cancel</Button> },
        ]} />
      <ConfirmModal open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} loading={busy} danger title="Cancel subscription?" confirmLabel="Cancel subscription" message="The user returns to the default plan immediately. Existing projects are kept but new ones are blocked above the free limit." />
    </div>
  );
}

function ProofViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [state, setState] = useState<{ url?: string; pdf?: boolean; error?: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    setState(null);
    api(`/api/admin?action=payment-proof&id=${id}`).then((r) => setState({ url: r.url, pdf: r.is_pdf })).catch((e) => setState({ error: e.message }));
  }, [id]);
  return (
    <Modal open={!!id} onClose={onClose} title="Payment proof" description="Signed link valid for 2 minutes. Verify the funds in your account — the image alone is not proof of payment." size="lg">
      {!state ? <Skeleton className="h-80" /> : state.error ? <p className="text-sm text-bad">{state.error}</p> : state.pdf ? (
        <a href={state.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-ember hover:underline"><FileText className="h-4 w-4" />Open PDF receipt<ExternalLink className="h-3.5 w-3.5" /></a>
      ) : <img src={state.url} alt="Payment proof" className="mx-auto max-h-[70vh] rounded-xl border border-line" />}
    </Modal>
  );
}

export function AdminPayments() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(`/api/admin?action=payments&page=${page}${status !== 'all' ? `&status=${status}` : ''}`);
  const [proof, setProof] = useState<string | null>(null);
  const [review, setReview] = useState<{ r: any; decision: 'approve' | 'reject' | 'correction' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteErr, setNoteErr] = useState('');
  const { canWrite } = useAdminRole();
  const toast = useToast();

  const submit = async () => {
    if (!review) return;
    if (review.decision !== 'approve' && !note.trim()) { setNoteErr('A note is required so the user knows what to do.'); return; }
    setBusy(true);
    try {
      await api('/api/admin?action=payment-review', { method: 'POST', body: { id: review.r.id, decision: review.decision, note: note.trim() } });
      toast.success(review.decision === 'approve' ? 'Approved — subscription activated' : review.decision === 'reject' ? 'Payment rejected' : 'Correction requested', 'The user has been notified.');
      setReview(null); setNote(''); reload(true);
    } catch (e: any) { toast.error('Review failed', e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Payment requests" description="Manual verification. Approve only after confirming the funds arrived in the configured account." />
      <div className="mb-4"><Chips options={[{ id: 'pending', label: 'Pending' }, { id: 'correction_requested', label: 'Correction requested' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, { id: 'all', label: 'All' }]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} /></div>
      {loading && !data ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>
        : error && !data ? <Card className="p-6 text-sm text-bad">{error.message}</Card>
        : !data?.items.length ? <Card><EmptyState icon={<Coins className="h-7 w-7" />} title={status === 'pending' ? 'No payments awaiting review' : 'No payment requests'} /></Card>
        : (
          <div className="space-y-3">
            {data.items.map((r: any) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{r.profiles?.full_name || r.profiles?.email}</p><StatusBadge status={r.status} /></div>
                    <p className="text-xs text-muted">{r.profiles?.email} · submitted {dateTime(r.created_at)}</p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                      {[['Plan', r.plans?.name], ['Amount', money(r.amount, r.currency)], ['Full name', r.full_name], ['Phone', r.phone], ['Account holder', r.account_holder], ['Reference ID', r.reference_id || '—']].map(([k, v]) => (
                        <div key={k} className="min-w-0"><dt className="text-[11px] text-muted">{k}</dt><dd className={cx('mt-0.5 truncate font-medium', k === 'Reference ID' && 'font-mono')} title={String(v)}>{v}</dd></div>
                      ))}
                    </dl>
                    {r.admin_note && <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs"><b>Note:</b> {r.admin_note} {r.reviewed_at && <span className="text-muted">· {dateTime(r.reviewed_at)}</span>}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:w-60 lg:flex-col">
                    <Button variant="secondary" size="sm" disabled={!r.has_proof} onClick={() => setProof(r.id)} icon={<Eye className="h-3.5 w-3.5" />}>{r.has_proof ? 'View proof' : 'No proof'}</Button>
                    {canWrite && r.status === 'pending' && <>
                      <Button size="sm" className="bg-none bg-ok" onClick={() => { setNote(''); setNoteErr(''); setReview({ r, decision: 'approve' }); }} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Approve</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setNote(''); setNoteErr(''); setReview({ r, decision: 'correction' }); }} icon={<MessageSquareWarning className="h-3.5 w-3.5" />}>Request correction</Button>
                      <Button variant="danger" size="sm" onClick={() => { setNote(''); setNoteErr(''); setReview({ r, decision: 'reject' }); }} icon={<XCircle className="h-3.5 w-3.5" />}>Reject</Button>
                    </>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      <ProofViewer id={proof} onClose={() => setProof(null)} />
      <Modal open={!!review} onClose={() => setReview(null)} title={review?.decision === 'approve' ? 'Approve payment' : review?.decision === 'reject' ? 'Reject payment' : 'Request correction'} size="sm" footer={<>
        <Button variant="ghost" onClick={() => setReview(null)}>Cancel</Button>
        <Button variant={review?.decision === 'reject' ? 'danger' : 'primary'} onClick={submit} loading={busy}>Confirm</Button>
      </>}>
        {review && (
          <div className="space-y-4 text-sm">
            {review.decision === 'approve' && <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs"><AlertTriangle className="h-4 w-4 shrink-0 text-warn" />Confirm you received {money(review.r.amount, review.r.currency)} with reference “{review.r.reference_id || 'n/a'}”. Approval activates {review.r.plans?.name} ({review.r.plans?.project_limit} projects{review.r.plans?.duration_days ? `, ${review.r.plans.duration_days} days` : ''}) immediately.</p>}
            <Field label={review.decision === 'approve' ? 'Note (optional)' : 'Message to the user'} error={noteErr}><Textarea value={note} onChange={(e) => { setNote(e.target.value); setNoteErr(''); }} maxLength={500} placeholder={review.decision === 'correction' ? 'e.g. The reference ID does not match — please re-check your receipt.' : ''} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

const EMPTY_PLAN = { name: '', slug: '', price: 0, currency: 'PKR', project_limit: 10, duration_days: 30, features: '', is_active: true, is_default: false, sort_order: 0 };

export function AdminPlans() {
  const { data, loading, error, reload } = useApi<any[]>('/api/admin?action=plans');
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api('/api/admin?action=plan-save', { method: 'POST', body: { ...edit, features: String(edit.features).split('\n').map((s: string) => s.trim()).filter(Boolean) } });
      toast.success('Plan saved'); setEdit(null); reload(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { const r = await api('/api/admin?action=plan-delete', { method: 'POST', body: { id: del.id } }); toast.success(r.deactivated ? 'Plan deactivated (it has users or payments)' : 'Plan deleted'); setDel(null); reload(true); }
    catch (e: any) { toast.error('Failed', e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Plans" description="Name, price, currency, project limit, duration, features and availability." actions={canWrite && <Button onClick={() => setEdit({ ...EMPTY_PLAN })} icon={<Plus className="h-4 w-4" />}>New plan</Button>} />
      {loading && !data ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60" />)}</div> : error && !data ? <Card className="p-6 text-sm text-bad">{error.message}</Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data || []).map((p) => (
            <Card key={p.id} className={cx('flex flex-col p-5', !p.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-display text-lg font-semibold">{p.name}</p><p className="font-mono text-xs text-muted">{p.slug}</p></div>
                <div className="flex flex-wrap justify-end gap-1">{p.is_default && <Badge tone="ember">Default</Badge>}<Badge tone={p.is_active ? 'ok' : 'muted'}>{p.is_active ? 'Active' : 'Inactive'}</Badge></div>
              </div>
              <p className="mt-3 font-display text-2xl font-semibold">{Number(p.price) ? money(p.price, p.currency) : 'Free'}</p>
              <p className="text-xs text-muted">{p.project_limit} projects · {p.duration_days ? `${p.duration_days} days` : 'no expiry'} · {p.users_count} users</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">{(p.features || []).map((f: string) => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />{f}</li>)}</ul>
              {canWrite && <div className="mt-4 flex gap-2"><Button variant="secondary" size="sm" onClick={() => setEdit({ ...p, features: (p.features || []).join('\n') })} icon={<Edit3 className="h-3.5 w-3.5" />}>Edit</Button>{!p.is_default && <Button variant="ghost" size="sm" className="text-bad" onClick={() => setDel(p)} icon={<Trash2 className="h-3.5 w-3.5" />}>Delete</Button>}</div>}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New plan'} size="lg" footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save plan</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={40} /></Field>
            <Field label="Slug" hint="Auto-generated if empty"><Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase() })} className="font-mono" /></Field>
            <Field label="Price"><Input type="number" min={0} step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} disabled={edit.is_default} /></Field>
            <Field label="Currency"><Input value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></Field>
            <Field label="Project limit"><Input type="number" min={1} value={edit.project_limit} onChange={(e) => setEdit({ ...edit, project_limit: e.target.value })} /></Field>
            <Field label="Duration (days)" hint="0 = no expiry"><Input type="number" min={0} value={edit.duration_days} onChange={(e) => setEdit({ ...edit, duration_days: e.target.value })} /></Field>
            <Field label="Sort order"><Input type="number" min={0} value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
            <div className="space-y-3 pt-6"><Toggle checked={!!edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Active" /><Toggle checked={!!edit.is_default} onChange={(v) => setEdit({ ...edit, is_default: v, price: v ? 0 : edit.price })} label="Default (free) plan" /></div>
            <Field label="Features (one per line)" className="sm:col-span-2"><Textarea value={edit.features} onChange={(e) => setEdit({ ...edit, features: e.target.value })} rows={5} /></Field>
            {err && <p className="text-sm text-bad sm:col-span-2">{err}</p>}
          </div>
        )}
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title={`Delete ${del?.name}?`} confirmLabel="Delete" message="Plans with users or payment history are deactivated instead of deleted." />
    </div>
  );
}

function useSettings() {
  const s = useApi<any>('/api/admin?action=settings');
  return s;
}

function SettingsForm({ group, initial, children, onSaved }: { group: string; initial: any; children: (v: any, set: (patch: any) => void) => React.ReactNode; onSaved?: () => void }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { canWrite } = useAdminRole();
  const toast = useToast();
  useEffect(() => setV(initial), [initial]);
  const save = async () => {
    setBusy(true); setErr('');
    try { const r = await api('/api/admin?action=settings-save', { method: 'POST', body: { key: group, value: v } }); setV(r); toast.success('Settings saved'); onSaved?.(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <fieldset disabled={!canWrite} className="space-y-4">{children(v, (patch) => setV((x: any) => ({ ...x, ...patch })))}</fieldset>
      {err && <p className="text-sm text-bad">{err}</p>}
      {canWrite && <div className="flex justify-end"><Button onClick={save} loading={busy}>Save</Button></div>}
    </div>
  );
}

export function AdminPricing() {
  const { data, loading, reload } = useSettings();
  const plans = useApi<any[]>('/api/admin?action=plans');
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const [toggling, setToggling] = useState(false);
  if (loading || !data) return <Skeleton className="h-96" />;
  const togglePaid = async (on: boolean) => {
    setToggling(true);
    try { await api('/api/admin?action=settings-save', { method: 'POST', body: { key: 'billing', value: { ...data.billing, paid_enabled: on } } }); toast.success(on ? 'Paid subscriptions enabled' : 'Paid subscriptions disabled'); reload(true); }
    catch (e: any) { toast.error('Failed', e.message); } finally { setToggling(false); }
  };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Pricing & payments" description="Global subscription switch and manual payment configuration." />
      <Card className={cx('mb-5 p-5', data.billing.paid_enabled ? 'border-ok/30' : 'border-line')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="flex items-center gap-2 font-semibold">{data.billing.paid_enabled ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <Ban className="h-5 w-5 text-muted" />}Paid subscriptions are {data.billing.paid_enabled ? 'ON' : 'OFF'}</p>
            <p className="mt-1 text-sm text-muted">{data.billing.paid_enabled ? 'Users can choose paid plans and submit payment proof.' : 'Everyone stays on the free plan and sees the “unavailable” message.'}</p>
          </div>
          <div className="w-48"><Toggle checked={!!data.billing.paid_enabled} onChange={togglePaid} disabled={!canWrite || toggling} label="Enable paid plans" /></div>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <SettingsForm group="billing" initial={data.billing} onSaved={() => reload(true)}>
            {(v, set) => <Field label="Message when unavailable"><Input value={v.unavailable_message} onChange={(e) => set({ unavailable_message: e.target.value })} maxLength={300} /></Field>}
          </SettingsForm>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <p className="mb-4 font-semibold">Payment settings</p>
          <SettingsForm group="payment" initial={data.payment} onSaved={() => reload(true)}>
            {(v, set) => (
              <>
                <Toggle checked={!!v.available} onChange={(x) => set({ available: x })} label="Payments available" description="Temporarily pause submissions without disabling paid plans." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Payment method name" required><Input value={v.method_name} onChange={(e) => set({ method_name: e.target.value })} maxLength={60} /></Field>
                  <Field label="Account / number"><Input value={v.account_number} onChange={(e) => set({ account_number: e.target.value })} className="font-mono" maxLength={80} /></Field>
                  <Field label="Account holder"><Input value={v.account_holder} onChange={(e) => set({ account_holder: e.target.value })} maxLength={80} /></Field>
                  <Field label="Send-payment link (optional)" hint="https:// link to a payment page or wallet"><Input value={v.send_payment_url} onChange={(e) => set({ send_payment_url: e.target.value })} placeholder="https://" /></Field>
                </div>
                <Field label="Instructions"><Textarea value={v.instructions} onChange={(e) => set({ instructions: e.target.value })} maxLength={1200} rows={4} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle checked={!!v.require_proof} onChange={(x) => set({ require_proof: x })} label="Require payment proof" />
                  <Toggle checked={!!v.require_reference} onChange={(x) => set({ require_reference: x })} label="Require transaction ID" />
                </div>
              </>
            )}
          </SettingsForm>
        </Card>
        <Card className="h-fit p-5">
          <p className="font-semibold">Current price list</p>
          <ul className="mt-3 space-y-2">{(plans.data || []).map((p) => <li key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm"><span>{p.name} <span className="text-xs text-muted">· {p.project_limit} projects</span></span><span className="font-mono">{Number(p.price) ? money(p.price, p.currency) : 'Free'}</span></li>)}</ul>
          <p className="mt-3 text-xs text-muted">Edit prices, limits and durations in Plans.</p>
        </Card>
      </div>
    </div>
  );
}

export function AdminSettings() {
  const { data, loading, reload } = useSettings();
  if (loading || !data) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Settings" description="Platform identity, abuse limits and reserved names." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-4 font-semibold">Platform</p>
          <SettingsForm group="platform" initial={data.platform} onSaved={() => reload(true)}>
            {(v, set) => (<>
              <Field label="Platform name"><Input value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} /></Field>
              <Field label="Support email"><Input type="email" value={v.support_email} onChange={(e) => set({ support_email: e.target.value })} /></Field>
              <Field label="Site-wide banner" hint="Shown to all signed-in users. Leave empty to hide."><Textarea value={v.maintenance_message} onChange={(e) => set({ maintenance_message: e.target.value })} maxLength={300} /></Field>
            </>)}
          </SettingsForm>
        </Card>
        <Card className="p-5">
          <p className="mb-4 font-semibold">Limits & abuse protection</p>
          <SettingsForm group="limits" initial={data.limits} onSaved={() => reload(true)}>
            {(v, set) => (<>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Max ZIP upload (MB)" hint="1–50"><Input type="number" value={v.max_upload_mb} onChange={(e) => set({ max_upload_mb: e.target.value })} /></Field>
                <Field label="Max unpacked size (MB)"><Input type="number" value={v.max_unzipped_mb} onChange={(e) => set({ max_unzipped_mb: e.target.value })} /></Field>
                <Field label="Max files per project"><Input type="number" value={v.max_files} onChange={(e) => set({ max_files: e.target.value })} /></Field>
                <Field label="Deployment timeout (min)"><Input type="number" value={v.deploy_timeout_min} onChange={(e) => set({ deploy_timeout_min: e.target.value })} /></Field>
                <Field label="Max Vercel connections / user"><Input type="number" value={v.max_connections} onChange={(e) => set({ max_connections: e.target.value })} /></Field>
              </div>
              <Field label="Reserved subdomains" hint="Comma or newline separated"><Textarea value={(v.reserved_subdomains || []).join(', ')} onChange={(e) => set({ reserved_subdomains: e.target.value.split(/[\s,]+/).filter(Boolean) })} rows={3} className="font-mono text-xs" /></Field>
              <Field label="Allowed import hosts" hint="Hosts the server may fetch archives from (SSRF allowlist)"><Textarea value={(v.import_hosts || []).join(', ')} onChange={(e) => set({ import_hosts: e.target.value.split(/[\s,]+/).filter(Boolean) })} rows={2} className="font-mono text-xs" /></Field>
            </>)}
          </SettingsForm>
        </Card>
      </div>
    </div>
  );
}

export function AdminAnnouncements() {
  const { data, loading, reload } = useApi<any[]>('/api/admin?action=announcements');
  const [f, setF] = useState({ title: '', body: '', level: 'info', notify: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const create = async () => {
    if (!f.title.trim() || !f.body.trim()) { setErr('Title and message are required.'); return; }
    setBusy(true); setErr('');
    try { await api('/api/admin?action=announcement-save', { method: 'POST', body: f }); toast.success('Announcement published', f.notify ? 'All active users were notified.' : undefined); setF({ title: '', body: '', level: 'info', notify: true }); reload(true); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const toggle = async (a: any) => { try { await api('/api/admin?action=announcement-save', { method: 'POST', body: { ...a, is_active: !a.is_active } }); reload(true); } catch (e: any) { toast.error('Failed', e.message); } };
  const remove = async (a: any) => { try { await api('/api/admin?action=announcement-delete', { method: 'POST', body: { id: a.id } }); reload(true); } catch (e: any) { toast.error('Failed', e.message); } };
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Announcements" description="Shown as a banner in the user app and optionally sent as in-app notifications." />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {canWrite && (
          <Card className="h-fit space-y-4 p-5">
            <p className="font-semibold">New announcement</p>
            <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} /></Field>
            <Field label="Message"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={1000} /></Field>
            <Field label="Level"><Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="critical">Critical</option></Select></Field>
            <Toggle checked={f.notify} onChange={(v) => setF({ ...f, notify: v })} label="Notify all users" description="Creates an in-app notification for every active user." />
            {err && <p className="text-sm text-bad">{err}</p>}
            <Button onClick={create} loading={busy} className="w-full" icon={<Megaphone className="h-4 w-4" />}>Publish</Button>
          </Card>
        )}
        <div className="space-y-3">
          {loading && !data ? <Skeleton className="h-40" /> : !data?.length ? <Card><EmptyState icon={<Megaphone className="h-7 w-7" />} title="No announcements" /></Card> : data.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{a.title}</p><Badge tone={a.level === 'critical' ? 'bad' : a.level === 'warning' ? 'warn' : a.level === 'success' ? 'ok' : 'info'}>{a.level}</Badge>{!a.is_active && <Badge>hidden</Badge>}</div><p className="mt-1 text-sm text-muted">{a.body}</p><p className="mt-1 text-[11px] text-faint">{dateTime(a.created_at)}</p></div>
              {canWrite && <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => toggle(a)}>{a.is_active ? 'Hide' : 'Show'}</Button><Button variant="ghost" size="icon" onClick={() => remove(a)} aria-label="Delete announcement"><Trash2 className="h-4 w-4" /></Button></div>}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminHealth() {
  const { data, loading, reload } = useApi<any>('/api/admin?action=health');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<any>(null);
  const { canWrite } = useAdminRole();
  const toast = useToast();
  const cleanup = async () => {
    setRunning(true);
    try { const r = await api('/api/admin?action=cleanup', { method: 'POST', body: {} }); setReport(r); toast.success('Cleanup finished'); reload(true); }
    catch (e: any) { toast.error('Cleanup failed', e.message); } finally { setRunning(false); }
  };
  const Item = ({ icon: Icon, label, ok, value, hint }: any) => (
    <Card className="p-5">
      <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-ember" />{label}</p>{ok === true ? <Badge tone="ok" dot>Healthy</Badge> : ok === false ? <Badge tone="bad" dot>Attention</Badge> : <Badge tone="warn" dot>Check</Badge>}</div>
      <p className="mt-3 font-mono text-sm">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </Card>
  );
  return (
    <div>
      <PageHeader eyebrow="Admin" title="System health" description="Live checks of the database, storage, Vercel API, encryption and job queue." actions={<><Button variant="secondary" onClick={() => reload()} icon={<RefreshCw className="h-4 w-4" />}>Refresh</Button>{canWrite && <Button onClick={cleanup} loading={running} icon={<Trash2 className="h-4 w-4" />}>Run cleanup</Button>}</>} />
      {loading && !data ? <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div> : data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Item icon={Database} label="Database" ok={data.database.ok} value={`${data.database.latency_ms} ms`} />
          <Item icon={ShieldCheck} label="Row Level Security" ok={data.rls === 'enforced' ? true : data.rls === 'exposed' ? false : undefined} value={data.rls} hint={data.rls === 'exposed' ? 'Direct table access with the public key is possible. Run db/security.sql in the Supabase SQL editor (see DEPLOYMENT.md).' : 'Direct client access to tables is blocked.'} />
          <Item icon={HardDrive} label="Storage buckets" ok={data.storage.sources && data.storage.payment_proofs} value={`sources: ${data.storage.sources ? 'ok' : 'missing'} · proofs: ${data.storage.payment_proofs ? 'ok' : 'missing'}`} />
          <Item icon={Wifi} label="Vercel API" ok={data.vercel_api.status === 'reachable'} value={`${data.vercel_api.status}${data.vercel_api.latency_ms ? ` · ${data.vercel_api.latency_ms} ms` : ''}`} />
          <Item icon={KeyRound} label="Credential encryption" ok={data.encryption.source === 'dedicated' ? true : undefined} value={`${data.encryption.algorithm} · ${data.encryption.source} key`} hint={data.encryption.source === 'derived' ? 'Set DEPLOYFORGE_ENCRYPTION_KEY for a dedicated key (existing secrets stay readable).' : undefined} />
          <Item icon={Rocket} label="Deployment queue" ok={data.queue.stuck === 0} value={`${data.queue.queued} queued · ${data.queue.running} running · ${data.queue.stuck} stuck`} hint="Jobs advance via live streams, user sessions and the scheduled cleanup." />
          <Item icon={Clock} label="Last cleanup" ok={data.system.last_cleanup_at ? true : undefined} value={data.system.last_cleanup_at ? `${timeAgo(data.system.last_cleanup_at)}` : 'never'} hint={`Cron secret ${data.cron_secret ? 'configured' : 'not set (cron is rate-limited instead)'}`} />
          <Item icon={AlertTriangle} label="Runtime" ok value={`Node ${data.runtime.node} · ${data.runtime.region}`} />
        </div>
      )}
      {report && <Card className="mt-5 p-5 font-mono text-xs"><p className="mb-2 font-sans text-sm font-semibold">Cleanup report</p><pre className="whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre></Card>}
    </div>
  );
}
