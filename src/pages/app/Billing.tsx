import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, CreditCard, ExternalLink, FileUp, Gauge, Info, Loader2, Receipt, Send, ShieldCheck, Upload, X } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api, uploadSigned } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Card, CopyButton, EmptyState, Field, Input, Modal, PageHeader, Progress, Skeleton, StatusBadge, cx } from '../../components/ui';
import ErrorState from '../../components/ErrorState';
import { bytes, dateOnly, dateTime, money } from '../../lib/format';

const FLOW = ['Plan', 'Your details', 'Pay', 'Proof'];

function PaymentFlow({ open, onClose, plans, payment, initialPlan, editing, onDone }: { open: boolean; onClose: () => void; plans: any[]; payment: any; initialPlan: any; editing?: any; onDone: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [planId, setPlanId] = useState<number | null>(null);
  const [f, setF] = useState({ full_name: '', phone: '', account_holder: '', reference_id: '' });
  const [proof, setProof] = useState<{ file: File; path?: string; pct: number; error?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDone(false); setErrors({}); setProof(null);
    if (editing) {
      setPlanId(editing.plan_id); setStep(1);
      setF({ full_name: editing.full_name || '', phone: editing.phone || '', account_holder: editing.account_holder || '', reference_id: editing.reference_id || '' });
    } else {
      setPlanId(initialPlan?.id || null); setStep(initialPlan ? 1 : 0);
      setF({ full_name: me?.profile?.full_name || '', phone: me?.profile?.phone || '', account_holder: '', reference_id: '' });
    }
  }, [open, editing, initialPlan, me]);

  const plan = plans.find((p) => p.id === planId);
  const paid = plans.filter((p) => Number(p.price) > 0);

  const validateDetails = () => {
    const e: Record<string, string> = {};
    if (f.full_name.trim().length < 3) e.full_name = 'Enter your full name.';
    if (!/^[+0-9 ()-]{7,20}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number.';
    if (f.account_holder.trim().length < 3) e.account_holder = 'Enter the name on the sending account.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const pickProof = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) { setProof({ file, pct: 0, error: 'Use a PNG, JPG, WEBP or PDF file.' }); return; }
    if (file.size > 5 * 1048576) { setProof({ file, pct: 0, error: 'The file must be 5 MB or smaller.' }); return; }
    setProof({ file, pct: 0 });
    try {
      const { path, signedUrl } = await api('/api/billing?action=proof-url', { method: 'POST', body: { content_type: file.type, size: file.size } });
      await uploadSigned(signedUrl, file, file.name, (pct) => setProof((p) => (p ? { ...p, pct } : p)));
      setProof({ file, path, pct: 100 });
    } catch (e: any) { setProof({ file, pct: 0, error: e.message }); }
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (payment.require_reference && !f.reference_id.trim()) e.reference_id = 'Enter the transaction / reference ID from your receipt.';
    if (f.reference_id && !/^[A-Za-z0-9\-_/#. ]+$/.test(f.reference_id)) e.reference_id = 'Reference ID contains invalid characters.';
    if (payment.require_proof && !proof?.path && !editing?.has_proof) e.proof = 'Upload a screenshot or PDF of your payment receipt.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const body = { plan_id: planId, ...f, proof_path: proof?.path };
      if (editing) await api('/api/billing', { method: 'PUT', body: { id: editing.id, ...body } });
      else await api('/api/billing', { method: 'POST', body });
      setDone(true);
      onDone();
    } catch (err: any) {
      setErrors({ form: err.message });
      toast.error('Payment submission failed', err.message);
    } finally { setSubmitting(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? 'Update payment submission' : 'Upgrade your plan'} description="Manual transfer · verified by an administrator">
      {done ? (
        <div className="py-6 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warn/15 text-warn"><Clock className="h-8 w-8" /></motion.div>
          <h3 className="mt-5 font-display text-lg font-semibold">Submitted — Pending review</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">Your payment details were received. An administrator will manually verify the transaction. Your plan is <b className="text-fg">not active yet</b> — you’ll get a notification once it’s approved.</p>
          <Button className="mt-6" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div>
          <ol className="mb-6 flex items-center gap-2">
            {FLOW.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold', i < step ? 'bg-ok/15 text-ok' : i === step ? 'bg-forge text-white' : 'bg-surface-2 text-faint')}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className={cx('hidden text-xs sm:block', i === step ? 'font-medium' : 'text-muted')}>{s}</span>
                {i < FLOW.length - 1 && <span className="h-px flex-1 bg-line-strong" />}
              </li>
            ))}
          </ol>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
              {step === 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {paid.map((p) => (
                    <button key={p.id} onClick={() => setPlanId(p.id)} className={cx('rounded-2xl border p-4 text-left transition', planId === p.id ? 'border-ember bg-ember/10' : 'border-line bg-surface hover:border-line-strong')}>
                      <div className="flex items-center justify-between"><p className="font-semibold">{p.name}</p>{planId === p.id && <CheckCircle2 className="h-5 w-5 text-ember" />}</div>
                      <p className="mt-2 font-display text-2xl font-semibold">{money(p.price, p.currency)}</p>
                      <p className="text-xs text-muted">{p.project_limit} projects · {p.duration_days ? `${p.duration_days} days` : 'no expiry'}</p>
                    </button>
                  ))}
                </div>
              )}
              {step === 1 && (
                <div className="space-y-4">
                  <Field label="Full name" required error={errors.full_name}><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="name" maxLength={80} /></Field>
                  <Field label="Phone number" required error={errors.phone}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} type="tel" autoComplete="tel" placeholder="+92 300 1234567" maxLength={20} /></Field>
                  <Field label="Account holder name" required error={errors.account_holder} hint="The name on the account you’re sending payment from."><Input value={f.account_holder} onChange={(e) => setF({ ...f, account_holder: e.target.value })} maxLength={80} /></Field>
                </div>
              )}
              {step === 2 && plan && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-ember/30 bg-ember/[0.06] p-5">
                    <p className="text-xs text-muted">Send exactly</p>
                    <div className="mt-1 flex items-center gap-2"><p className="font-display text-3xl font-semibold">{money(plan.price, plan.currency)}</p><CopyButton value={String(plan.price)} variant="ghost" /></div>
                    <p className="mt-1 text-xs text-muted">for the {plan.name} plan</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Payment method</p><p className="mt-1 font-medium">{payment.method_name}</p></div>
                    <div className="rounded-xl border border-line bg-surface p-4"><p className="text-[11px] text-muted">Account holder</p><p className="mt-1 font-medium">{payment.account_holder || '—'}</p></div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
                    <div className="min-w-0 flex-1"><p className="text-[11px] text-muted">Account / number</p><p className="mt-1 break-all font-mono text-lg font-semibold">{payment.account_number || 'Not configured'}</p></div>
                    {payment.account_number && <CopyButton value={payment.account_number} label="Copy" />}
                  </div>
                  {payment.instructions && <p className="flex gap-2 rounded-xl border border-line bg-surface p-4 text-sm text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />{payment.instructions}</p>}
                  {payment.send_payment_url && <a href={payment.send_payment_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium hover:bg-surface-2"><Send className="h-4 w-4" />Send payment<ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              )}
              {step === 3 && (
                <div className="space-y-4">
                  <Field label="Transaction / reference ID" required={payment.require_reference} error={errors.reference_id}><Input value={f.reference_id} onChange={(e) => setF({ ...f, reference_id: e.target.value })} className="font-mono" placeholder="e.g. TXN123456789" maxLength={80} /></Field>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium">Payment proof{payment.require_proof && <span className="text-ember">*</span>}</p>
                    <button type="button" onClick={() => fileRef.current?.click()} className={cx('flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-4 text-left transition hover:border-ember/50', errors.proof ? 'border-bad/50' : 'border-line-strong')}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ember/10 text-ember">{proof?.path ? <CheckCircle2 className="h-5 w-5 text-ok" /> : proof && !proof.error ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{proof ? proof.file.name : editing?.has_proof ? 'Existing proof on file — click to replace' : 'Upload screenshot or PDF receipt'}</span>
                        <span className="block text-xs text-muted">{proof ? `${bytes(proof.file.size)}${proof.path ? ' · uploaded securely' : proof.error ? '' : ` · uploading ${proof.pct}%`}` : 'PNG, JPG, WEBP or PDF · max 5 MB'}</span>
                      </span>
                      <Upload className="h-4 w-4 text-muted" />
                    </button>
                    {proof && !proof.path && !proof.error && <Progress value={proof.pct} className="mt-2 h-1.5" />}
                    {(proof?.error || errors.proof) && <p className="mt-1.5 text-xs text-bad">{proof?.error || errors.proof}</p>}
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) pickProof(file); e.target.value = ''; }} />
                  </div>
                  <p className="flex gap-2 rounded-xl border border-info/25 bg-info/10 p-3 text-xs"><ShieldCheck className="h-4 w-4 shrink-0 text-info" />Payments are verified manually by an administrator. Submitting does not activate your plan automatically.</p>
                  {errors.form && <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{errors.form}</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => (step === 0 || (editing && step === 1) ? onClose() : setStep(step - 1))} icon={<ArrowLeft className="h-4 w-4" />}>{step === 0 ? 'Cancel' : 'Back'}</Button>
            {step < 3 ? (
              <Button onClick={() => { if (step === 0 && !planId) return; if (step === 1 && !validateDetails()) return; setStep(step + 1); }} disabled={step === 0 && !planId}>Continue<ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={submit} loading={submitting} disabled={!!proof && !proof.path && !proof.error} icon={<Send className="h-4 w-4" />}>Submit for review</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Billing() {
  const { data, error, loading, reload } = useApi<any>('/api/billing');
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [flow, setFlow] = useState<{ plan?: any; editing?: any } | null>(null);

  if (error && !data) return <ErrorState kind={error.status === 0 ? 'offline' : 'generic'} description={error.message} actions={<Button onClick={() => reload()}>Retry</Button>} />;
  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-40" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>;
  if (!data) return null;

  const { current, billing, payment, plans, requests, subscriptions } = data;
  const pending = requests.find((r: any) => r.status === 'pending');
  const correction = requests.find((r: any) => r.status === 'correction_requested');
  const pct = current.quota.limit ? (current.quota.used / current.quota.limit) * 100 : 0;
  const viewProof = async (r: any) => { try { const { url } = await api(`/api/billing?action=proof&id=${r.id}`); window.open(url, '_blank', 'noopener'); } catch (e: any) { toast.error('Could not open proof', e.message); } };

  return (
    <div>
      <PageHeader eyebrow="Billing" title="Plan & billing" description="Project quotas are enforced server-side. Paid plans are activated after manual payment review." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forge text-white"><Gauge className="h-6 w-6" /></div>
            <div className="flex-1">
              <p className="text-xs text-muted">Current plan</p>
              <p className="font-display text-2xl font-semibold">{current.plan?.name || 'Free'}</p>
              <p className="text-sm text-muted">{current.expires_at ? `Active until ${dateOnly(current.expires_at)}` : Number(current.plan?.price || 0) > 0 ? 'No expiry' : 'Free forever'}</p>
            </div>
            <div className="sm:w-56">
              <p className="text-sm font-medium">{current.quota.used} / {current.quota.limit} projects</p>
              <Progress value={pct} className="mt-2" tone={pct >= 100 ? 'bad' : 'forge'} />
              {pct >= 100 && <p className="mt-1.5 text-xs text-bad">Quota reached</p>}
            </div>
          </div>
        </Card>
        <Card className="p-6">
          {pending ? <><p className="flex items-center gap-2 text-sm font-semibold text-warn"><Clock className="h-4 w-4" />Payment pending review</p><p className="mt-2 text-sm text-muted">{pending.plans?.name} · {money(pending.amount, pending.currency)} · submitted {dateTime(pending.created_at)}</p><p className="mt-3 text-xs text-muted">An administrator will verify your transfer manually.</p></>
            : correction ? <><p className="flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle className="h-4 w-4" />Correction requested</p><p className="mt-2 text-sm">{correction.admin_note}</p><Button size="sm" className="mt-4" onClick={() => setFlow({ editing: correction })}>Update submission</Button></>
            : <><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-ok" />Manual, transparent review</p><p className="mt-2 text-sm text-muted">Choose a plan, transfer the amount, then submit your reference ID and receipt. We never claim automatic verification.</p></>}
        </Card>
      </div>

      <h2 className="mb-4 mt-10 font-display text-lg font-semibold">Plans</h2>
      {!billing.paid_enabled ? (
        <Card><ErrorState kind="subscription_unavailable" compact description={billing.unavailable_message} /></Card>
      ) : !payment?.available ? (
        <Card><ErrorState kind="payment_failed" compact title="Payments temporarily unavailable" description="The payment method is being updated. Please check back later." /></Card>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p: any) => {
          const isCurrent = current.plan?.id === p.id;
          const isPaid = Number(p.price) > 0;
          const canBuy = isPaid && billing.paid_enabled && payment?.available && !pending && !correction;
          return (
            <Card key={p.id} className={cx('relative flex flex-col p-6', isCurrent && 'glow')}>
              {isCurrent && <span className="absolute right-4 top-4 rounded-full bg-ok/15 px-2.5 py-0.5 text-[11px] font-semibold text-ok">Current</span>}
              <p className="font-display text-lg font-semibold">{p.name}</p>
              <p className="mt-3 font-display text-3xl font-semibold">{isPaid ? money(p.price, p.currency) : 'Free'}</p>
              <p className="text-xs text-muted">{isPaid ? (p.duration_days ? `per ${p.duration_days} days` : 'one-time') : 'forever'} · {p.project_limit} projects</p>
              <ul className="mt-5 flex-1 space-y-2">{(p.features || []).map((f: string) => <li key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{f}</li>)}</ul>
              {isPaid && !isCurrent && <Button className="mt-6" disabled={!canBuy} onClick={() => setFlow({ plan: p })} icon={<CreditCard className="h-4 w-4" />}>{!billing.paid_enabled ? 'Unavailable' : pending ? 'Review pending' : `Choose ${p.name}`}</Button>}
              {isPaid && isCurrent && <Button className="mt-6" variant="secondary" disabled={!canBuy} onClick={() => setFlow({ plan: p })}>Renew</Button>}
            </Card>
          );
        })}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4"><p className="flex items-center gap-2 text-sm font-semibold"><Receipt className="h-4 w-4 text-ember" />Payment requests</p></div>
          {requests.length === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="No payment requests" className="py-10" /> : (
            <ul>{requests.map((r: any) => (
              <li key={r.id} className="border-b border-line px-5 py-3.5 last:border-0">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{r.plans?.name} · {money(r.amount, r.currency)}</p><StatusBadge status={r.status} /></div>
                <p className="mt-1 text-xs text-muted">Ref {r.reference_id || '—'} · {dateTime(r.created_at)}</p>
                {r.admin_note && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs"><b>Admin note:</b> {r.admin_note}</p>}
                <div className="mt-2 flex gap-3">
                  {r.has_proof && <button onClick={() => viewProof(r)} className="text-xs text-ember hover:underline">View proof</button>}
                  {r.status === 'correction_requested' && <button onClick={() => setFlow({ editing: r })} className="text-xs font-medium text-ember hover:underline">Update submission</button>}
                </div>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4"><p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-ok" />Subscription history</p></div>
          {subscriptions.length === 0 ? <EmptyState icon={<X className="h-6 w-6" />} title="No subscriptions yet" className="py-10" /> : (
            <ul>{subscriptions.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-0">
                <div><p className="text-sm font-medium">{s.plans?.name} · {s.project_limit} projects</p><p className="text-xs text-muted">{dateOnly(s.starts_at)} → {s.ends_at ? dateOnly(s.ends_at) : 'no expiry'}</p></div>
                <StatusBadge status={s.status} />
              </li>
            ))}</ul>
          )}
        </Card>
      </div>

      {payment && <PaymentFlow open={!!flow} onClose={() => setFlow(null)} plans={plans} payment={payment} initialPlan={flow?.plan} editing={flow?.editing} onDone={() => { reload(true); refreshMe(); }} />}
      {loading && <span className="sr-only"><Loader2 /></span>}
    </div>
  );
}
