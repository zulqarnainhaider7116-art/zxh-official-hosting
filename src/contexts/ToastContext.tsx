import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; kind: Kind; title: string; message?: string }
interface ToastApi {
  push: (kind: Kind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const Ctx = createContext<ToastApi>({ push: () => {}, success: () => {}, error: () => {}, info: () => {}, warning: () => {} });

const ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const TONE = { success: 'text-ok', error: 'text-bad', info: 'text-info', warning: 'text-warn' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Kind, title: string, message?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, title, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4200);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    push,
    success: (a, b) => push('success', a, b),
    error: (a, b) => push('error', a, b),
    info: (a, b) => push('info', a, b),
    warning: (a, b) => push('warning', a, b),
  }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 pb-24 sm:items-end sm:p-6 lg:pb-6" aria-live="polite" role="status">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICON[t.kind];
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.96 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl p-4 shadow-2xl shadow-black/20">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[t.kind]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  {t.message && <p className="mt-0.5 break-words text-sm text-muted">{t.message}</p>}
                </div>
                <button onClick={() => dismiss(t.id)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ember" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
