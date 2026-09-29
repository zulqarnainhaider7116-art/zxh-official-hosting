import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Copy, Download, Search, WrapText } from 'lucide-react';
import { timeOfDay } from '../lib/format';
import { cx, Input } from './ui';
import { useToast } from '../contexts/ToastContext';

export interface LogLine { id: number; ts: string; level: string; phase: string; message: string }

const LEVEL: Record<string, string> = {
  error: 'text-bad',
  warn: 'text-warn',
  success: 'text-ok',
  system: 'text-info',
  info: 'text-[#e9dfd6]',
};

export default function LogViewer({ logs, live, height = 'h-[420px]', title = 'Build & deployment logs', id }: { logs: LogLine[]; live?: boolean; height?: string; title?: string; id?: string }) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [q, setQ] = useState('');
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const shown = useMemo(() => logs.filter((l) => (filter === 'all' || l.level === filter || (filter === 'warn' && l.level === 'error')) && (!q || l.message.toLowerCase().includes(q.toLowerCase()))), [logs, filter, q]);
  const errors = logs.filter((l) => l.level === 'error').length;
  const warns = logs.filter((l) => l.level === 'warn').length;

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown.length, follow]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom && follow) setFollow(false);
    if (atBottom && !follow) setFollow(true);
  };

  const asText = () => logs.map((l) => `${l.ts} [${l.level.toUpperCase()}] [${l.phase}] ${l.message}`).join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(asText()); toast.success('Logs copied'); } catch { toast.error('Copy failed'); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([asText()], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = `deployforge-logs-${Date.now()}.log`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id={id} className="overflow-hidden rounded-2xl border border-line bg-term shadow-inner">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-1.5 pr-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-mono text-[11px] text-[#a99c91]">{title}</span>
        {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-2 py-0.5 font-mono text-[10px] text-ok"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />LIVE</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {(['all', 'error', 'warn'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cx('rounded-md px-2 py-1 font-mono text-[11px] transition', filter === f ? 'bg-white/10 text-white' : 'text-[#a99c91] hover:text-white')}>
              {f === 'all' ? `all ${logs.length}` : f === 'error' ? `errors ${errors}` : `warnings ${warns + errors}`}
            </button>
          ))}
          <button onClick={() => setWrap((w) => !w)} className={cx('rounded-md p-1.5 text-[#a99c91] hover:text-white', wrap && 'text-white')} aria-label="Toggle line wrap" aria-pressed={wrap}><WrapText className="h-3.5 w-3.5" /></button>
          <button onClick={copy} className="rounded-md p-1.5 text-[#a99c91] hover:text-white" aria-label="Copy logs"><Copy className="h-3.5 w-3.5" /></button>
          <button onClick={download} className="rounded-md p-1.5 text-[#a99c91] hover:text-white" aria-label="Download logs"><Download className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="relative border-b border-white/5 px-3 py-2">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6f645b]" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter log lines…" className="h-8 border-white/10 bg-white/[0.03] pl-8 font-mono text-xs text-[#e9dfd6] placeholder:text-[#6f645b]" aria-label="Filter logs" />
      </div>
      <div ref={box} onScroll={onScroll} className={cx('scroll-thin relative overflow-auto px-1 py-2 font-mono text-[11px] leading-relaxed sm:text-[12px]', height)} role="log" aria-live={live ? 'polite' : 'off'}>
        {shown.length === 0 ? (
          <p className="px-3 py-8 text-center text-[#6f645b]">{logs.length ? 'No lines match the current filter.' : live ? 'Waiting for the first log line…' : 'No logs recorded.'}</p>
        ) : shown.map((l) => (
          <div key={l.id} className={cx('flex gap-3 rounded px-2 py-px hover:bg-white/[0.03]', l.level === 'error' && 'bg-bad/[0.07]')}>
            <span className="hidden shrink-0 select-none text-[#6f645b] sm:inline">{timeOfDay(l.ts)}</span>
            <span className={cx('min-w-0 flex-1', wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre', LEVEL[l.level] || LEVEL.info)}>{l.message}</span>
          </div>
        ))}
      </div>
      {!follow && (
        <button onClick={() => setFollow(true)} className="flex w-full items-center justify-center gap-1.5 border-t border-white/5 py-1.5 font-mono text-[11px] text-[#a99c91] hover:text-white">
          <ArrowDownToLine className="h-3.5 w-3.5" /> Jump to latest
        </button>
      )}
    </div>
  );
}
