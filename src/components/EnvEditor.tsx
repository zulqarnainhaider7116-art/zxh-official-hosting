import { useState } from 'react';
import { Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { Button, Input, cx } from './ui';

export interface EnvRow { key: string; value: string; is_secret: boolean }

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function envErrors(rows: EnvRow[]) {
  const errs: Record<number, string> = {};
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.key.trim()) errs[i] = 'Key is required.';
    else if (!KEY_RE.test(r.key.trim())) errs[i] = 'Use letters, numbers and underscores only.';
    else if (seen.has(r.key.trim())) errs[i] = 'Duplicate key.';
    else if (!r.value) errs[i] = 'Value is required (or remove this row).';
    seen.add(r.key.trim());
  });
  return errs;
}

export default function EnvEditor({ rows, onChange, showErrors }: { rows: EnvRow[]; onChange: (r: EnvRow[]) => void; showErrors?: boolean }) {
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const errs = showErrors ? envErrors(rows) : {};
  const set = (i: number, patch: Partial<EnvRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">No environment variables. Add one if your app reads configuration at build or run time.</p>}
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-2.5">
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <Input value={r.key} onChange={(e) => set(i, { key: e.target.value.toUpperCase().replace(/\s/g, '_') })} placeholder="KEY_NAME" className="h-10 font-mono text-xs" aria-label="Variable key" invalid={!!errs[i] && !r.key} />
            <div className="relative">
              <Input value={r.value} onChange={(e) => set(i, { value: e.target.value })} type={reveal[i] || !r.is_secret ? 'text' : 'password'} placeholder="value" autoComplete="off" spellCheck={false} className="h-10 pr-10 font-mono text-xs" aria-label={`Value for ${r.key || 'variable'}`} invalid={!!errs[i] && !r.value} />
              {r.is_secret && <button type="button" onClick={() => setReveal((s) => ({ ...s, [i]: !s[i] }))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg" aria-label={reveal[i] ? 'Hide value' : 'Show value'}>{reveal[i] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => set(i, { is_secret: !r.is_secret })} className={cx('flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium', r.is_secret ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line text-muted')} aria-pressed={r.is_secret} title={r.is_secret ? 'Secret: value hidden after saving' : 'Plain: value visible in the UI'}>
                {r.is_secret ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}{r.is_secret ? 'Secret' : 'Plain'}
              </button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove variable"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          {errs[i] && <p className="mt-1.5 text-xs text-bad">{errs[i]}</p>}
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => onChange([...rows, { key: '', value: '', is_secret: true }])} icon={<Plus className="h-4 w-4" />}>Add variable</Button>
    </div>
  );
}
