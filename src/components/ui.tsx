import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type HTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, X } from 'lucide-react';
import { STATUS, type Tone } from '../lib/constants';
import { useToast } from '../contexts/ToastContext';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export function btnClass(variant: Variant = 'primary', size: Size = 'md') {
  const base = 'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';
  const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]', icon: 'h-9 w-9' };
  const variants: Record<Variant, string> = {
    primary: 'bg-forge text-white shadow-lg shadow-ember/25 hover:shadow-ember/40 hover:brightness-110',
    secondary: 'glass-strong text-fg hover:border-line-strong hover:bg-surface-2',
    outline: 'border border-line-strong text-fg hover:bg-surface-2',
    ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
    danger: 'bg-bad/12 text-bad border border-bad/25 hover:bg-bad hover:text-white',
  };
  return cx(base, sizes[size], variants[variant]);
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx(btnClass(variant, size), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ variant = 'primary', size = 'md', className, icon, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return <Link className={cx(btnClass(variant, size), className)} {...rest}>{icon}{children}</Link>;
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('glass rounded-2xl', className)} {...rest}>{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor, required, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean; className?: string }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">{label}{required && <span className="ml-0.5 text-ember">*</span>}</label>}
      {children}
      {error ? <p className="text-xs font-medium text-bad" role="alert">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase = 'w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg placeholder:text-faint transition focus:border-ember/60 focus:outline-none focus:ring-4 focus:ring-ember/15 disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, 'h-11', invalid && 'border-bad/60 focus:ring-bad/15', className)} aria-invalid={invalid || undefined} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputBase, 'min-h-24 py-3', className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cx(inputBase, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>{children}</select>;
});

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:opacity-50', checked ? 'bg-forge' : 'bg-line-strong')}>
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

const toneCls: Record<Tone, string> = {
  ember: 'bg-ember/12 text-ember border-ember/25',
  ok: 'bg-ok/12 text-ok border-ok/25',
  bad: 'bg-bad/12 text-bad border-bad/25',
  warn: 'bg-warn/12 text-warn border-warn/25',
  info: 'bg-info/12 text-info border-info/25',
  muted: 'bg-surface-2 text-muted border-line',
};
const dotCls: Record<Tone, string> = { ember: 'bg-ember', ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn', info: 'bg-info', muted: 'bg-faint' };

export function Badge({ tone = 'muted', children, className, dot, pulse }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide', toneCls[tone], className)}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cx('absolute inline-flex h-full w-full rounded-full animate-pulse-ring', dotCls[tone])} />}
          <span className={cx('relative inline-flex h-1.5 w-1.5 rounded-full', dotCls[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] || { label: status, tone: 'muted' as Tone };
  return <Badge tone={s.tone} dot pulse={s.live} className={className}>{s.label}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-ember', className)} aria-label="Loading" />;
}

export function Progress({ value, className, tone = 'forge' }: { value: number; className?: string; tone?: 'forge' | 'ok' | 'bad' }) {
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={cx('h-full rounded-full', tone === 'forge' ? 'bg-forge' : tone === 'ok' ? 'bg-ok' : 'bg-bad')} initial={false} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), textarea, select, button[data-autofocus]') || panelRef.current;
      el?.focus();
    }, 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.98 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className={cx('glass-strong relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-bg/85 shadow-2xl outline-none sm:rounded-3xl', widths[size])}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div>
                <h2 id={titleId} className="font-display text-base font-semibold tracking-tight">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ember" aria-label="Close dialog"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-thin overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading, requireText, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; requireText?: string; children?: ReactNode }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  const blocked = !!requireText && text !== requireText;
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={blocked} data-autofocus>{confirmLabel}</Button>
    </>}>
      <div className="space-y-4 text-sm text-muted">
        <div>{message}</div>
        {children}
        {requireText && (
          <Field label={<>Type <span className="font-mono text-fg">{requireText}</span> to confirm</>}>
            <Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-3xl bg-ember/25 blur-2xl" />
        <div className="glass-strong relative flex h-16 w-16 items-center justify-center rounded-3xl text-ember">{icon}</div>
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function CountUp({ value, duration = 1.2, format }: { value: number; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setN(v) });
    return () => c.stop();
  }, [value, inView, duration]);
  return <span ref={ref}>{format ? format(n) : Math.round(n).toLocaleString()}</span>;
}

export function Tabs({ tabs, value, onChange, className }: { tabs: { id: string; label: string; icon?: ReactNode; count?: number }[]; value: string; onChange: (id: string) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    <div role="tablist" className={cx('scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)}>
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onKeyDown={(e) => onKey(e, i)} onClick={() => onChange(t.id)}
            className={cx('relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-ember', active ? 'text-fg' : 'text-muted hover:text-fg')}>
            {active && <motion.span layoutId={`tab-${tabs.map((x) => x.id).join('')}`} className="glass-strong absolute inset-0 rounded-xl" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span className="relative flex items-center gap-2">{t.icon}{t.label}{t.count !== undefined && <span className="rounded-md bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CopyButton({ value, label, className, size = 'sm', variant = 'secondary' }: { value: string; label?: string; className?: string; size?: Size; variant?: Variant }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setDone(false), 1600);
    } catch {
      toast.error('Copy failed', 'Your browser blocked clipboard access.');
    }
  };
  return (
    <Button variant={variant} size={label ? size : 'icon'} onClick={copy} className={className} aria-label={label || 'Copy'} icon={done ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}>
      {label}
    </Button>
  );
}

export function Pagination({ page, size, total, onChange }: { page: number; size: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-muted">
      <span>Page {page} of {pages} · {total} total</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ember">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'ember', sub, delay = 0 }: { label: string; value: number; icon: ReactNode; tone?: Tone; sub?: ReactNode; delay?: number }) {
  const tc: Record<Tone, string> = { ember: 'text-ember bg-ember/10', ok: 'text-ok bg-ok/10', bad: 'text-bad bg-bad/10', warn: 'text-warn bg-warn/10', info: 'text-info bg-info/10', muted: 'text-muted bg-surface-2' };
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass group relative overflow-hidden rounded-2xl p-4 sm:p-5">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-ember/10 opacity-0 blur-2xl transition group-hover:opacity-100" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={cx('flex h-8 w-8 items-center justify-center rounded-xl', tc[tone])}>{icon}</span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl"><CountUp value={value} /></p>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </motion.div>
  );
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

export function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
