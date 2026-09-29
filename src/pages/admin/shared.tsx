import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Card, EmptyState, Input, Pagination, Skeleton, cx } from '../../components/ui';
import ErrorState from '../../components/ErrorState';

export interface Col<T> { key: string; label: string; render: (row: T) => ReactNode; className?: string; hideSm?: boolean }

export function AdminTable<T extends { id: any }>({ cols, rows, loading, error, empty = 'Nothing here yet.', page, onPage, onRetry }: { cols: Col<T>[]; rows?: T[] | null; loading?: boolean; error?: string | null; empty?: string; page?: { page: number; size: number; total: number }; onPage?: (p: number) => void; onRetry?: () => void }) {
  return (
    <>
      <Card className="overflow-hidden">
        {error && !rows ? <ErrorState kind="generic" compact description={error} actions={onRetry && <button onClick={onRetry} className="text-sm text-ember hover:underline">Retry</button>} />
          : loading && !rows ? <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          : !rows?.length ? <EmptyState icon={<Search className="h-6 w-6" />} title={empty} className="py-10" />
          : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line bg-surface/50 text-xs text-muted"><tr>{cols.map((c) => <th key={c.key} className={cx('whitespace-nowrap px-4 py-3 font-medium', c.hideSm && 'hidden md:table-cell', c.className)}>{c.label}</th>)}</tr></thead>
                <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface/60">{cols.map((c) => <td key={c.key} className={cx('px-4 py-3 align-middle', c.hideSm && 'hidden md:table-cell', c.className)}>{c.render(r)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
      </Card>
      {page && onPage && <Pagination page={page.page} size={page.size} total={page.total} onChange={onPage} />}
    </>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 pl-10" aria-label={placeholder} />
    </div>
  );
}

export function Chips({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => <button key={o.id} onClick={() => onChange(o.id)} className={cx('rounded-xl px-3 py-1.5 text-xs font-medium transition', value === o.id ? 'bg-forge text-white' : 'glass text-muted hover:text-fg')}>{o.label}</button>)}
    </div>
  );
}

export function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export const RoleCtx = createContext<{ role: string; canWrite: boolean; isOwner: boolean }>({ role: 'support', canWrite: false, isOwner: false });
export const useAdminRole = () => useContext(RoleCtx);
