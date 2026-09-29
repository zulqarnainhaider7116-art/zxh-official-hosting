import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import { FileArchive, FolderUp, Github, Link2, UploadCloud, AlertTriangle } from 'lucide-react';
import { bundleFromFiles, bundleFromZip, ZipError, type Bundle, type Limits } from '../lib/zip';
import { api } from '../lib/api';
import { Button, Field, Input, Progress, cx } from './ui';
import ErrorState from './ErrorState';

export default function SourceUploader({ limits, onBundle, compact }: { limits: Limits; onBundle: (b: Bundle) => void; compact?: boolean }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<{ label: string; pct: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const handle = async (fn: () => Promise<Bundle>) => {
    setError(null);
    try {
      const b = await fn();
      onBundle(b);
    } catch (e: any) {
      setError({ code: e instanceof ZipError ? e.code : e?.code || 'error', message: e?.message || 'Could not read the source.' });
    } finally {
      setBusy(null);
    }
  };

  const onZip = (file: File) => {
    if (!/\.zip$/i.test(file.name)) { setError({ code: 'invalid_type', message: 'Please choose a .zip archive, or use “Choose folder”.' }); return; }
    setBusy({ label: `Reading ${file.name}`, pct: 0 });
    handle(() => bundleFromZip(file, file.name, limits, (p) => setBusy({ label: `Unpacking ${file.name}`, pct: p })));
  };
  const onDir = (files: FileList) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy({ label: 'Reading folder', pct: 0 });
    handle(() => bundleFromFiles(list, limits, (p) => setBusy({ label: 'Reading folder', pct: p })));
  };
  const onUrl = () => {
    if (!/^https:\/\//i.test(url.trim())) { setError({ code: 'invalid_url', message: 'Enter an https:// URL to a public GitHub repository or ZIP file.' }); return; }
    setBusy({ label: 'Fetching archive securely on the server', pct: 15 });
    handle(async () => {
      const r = await api<{ url: string; filename: string; size: number }>('/api/projects?action=import-url', { method: 'POST', body: { url: url.trim() } });
      setBusy({ label: `Downloading ${r.filename}`, pct: 55 });
      const res = await fetch(r.url);
      if (!res.ok) throw new Error('Could not download the imported archive.');
      const blob = await res.blob();
      return bundleFromZip(blob, r.filename, limits, (p) => setBusy({ label: `Unpacking ${r.filename}`, pct: 55 + p * 0.45 }));
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onZip(f);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-surface p-1 text-sm" role="tablist">
        {[{ id: 'file', label: 'Upload ZIP / folder', icon: FileArchive }, { id: 'url', label: 'Import from URL', icon: Link2 }].map((t) => (
          <button key={t.id} role="tab" aria-selected={mode === t.id} onClick={() => { setMode(t.id as any); setError(null); }} className={cx('flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium transition', mode === t.id ? 'glass-strong text-fg' : 'text-muted hover:text-fg')}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {busy ? (
        <div className="glass rounded-2xl p-8 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ember/15 text-ember"><UploadCloud className="h-6 w-6" /></motion.div>
          <p className="mt-4 text-sm font-medium">{busy.label}…</p>
          <Progress value={busy.pct} className="mx-auto mt-4 max-w-sm" />
          <p className="mt-2 font-mono text-xs text-muted">{Math.round(busy.pct)}%</p>
        </div>
      ) : mode === 'file' ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
          className={cx('relative overflow-hidden rounded-3xl border-2 border-dashed text-center transition', compact ? 'p-6' : 'p-10 sm:p-14', drag ? 'border-ember bg-ember/10' : 'border-line-strong bg-surface/50 hover:border-ember/50')}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--ember)_12%,transparent),transparent_60%)]" />
          <div className="relative">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-forge text-white shadow-lg shadow-ember/30"><UploadCloud className="h-7 w-7" /></div>
            <p className="mt-5 font-display text-base font-semibold">Drop your project ZIP here</p>
            <p className="mt-1.5 text-sm text-muted">Up to {limits.max_upload_mb} MB · {limits.max_files.toLocaleString()} files · node_modules & .env removed automatically</p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Button onClick={() => fileRef.current?.click()} icon={<FileArchive className="h-4 w-4" />}>Choose ZIP file</Button>
              <Button variant="secondary" onClick={() => dirRef.current?.click()} icon={<FolderUp className="h-4 w-4" />}>Choose folder</Button>
            </div>
            <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onZip(f); e.target.value = ''; }} />
            <input ref={dirRef} type="file" className="hidden" multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => { if (e.target.files) onDir(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
      ) : (
        <div className="glass rounded-3xl p-6">
          <Field label="Public repository or ZIP URL" hint="GitHub repo URLs are converted to archive downloads. Only allowlisted hosts are fetched, over HTTPS, with private networks blocked.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1"><Github className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="pl-10" onKeyDown={(e) => e.key === 'Enter' && onUrl()} /></div>
              <Button onClick={onUrl} icon={<Link2 className="h-4 w-4" />}>Import</Button>
            </div>
          </Field>
        </div>
      )}

      {error && (
        error.code === 'invalid_zip' ? <div className="glass rounded-2xl"><ErrorState kind="invalid_zip" compact description={error.message} /></div>
          : <div className="flex items-start gap-2.5 rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-sm" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" /><span>{error.message}</span></div>
      )}
    </div>
  );
}
