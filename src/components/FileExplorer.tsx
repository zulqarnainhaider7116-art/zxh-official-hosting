import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, File, FileCode2, FileImage, FileJson, FileText, Folder, FolderOpen, Search, X, Lock } from 'lucide-react';
import { bytes } from '../lib/format';
import { decodeText, isBinary } from '../lib/zip';
import { cx, Input, Spinner } from './ui';

interface FileEntry { path: string; size: number }
interface Node { name: string; path: string; dir: boolean; size: number; children: Map<string, Node>; count: number }

function buildTree(files: FileEntry[]) {
  const root: Node = { name: '', path: '', dir: true, size: 0, children: new Map(), count: 0 };
  for (const f of files) {
    const parts = f.path.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      if (!cur.children.has(part)) cur.children.set(part, { name: part, path, dir: !isFile, size: 0, children: new Map(), count: 0 });
      const n = cur.children.get(part)!;
      n.size += f.size;
      if (!isFile) n.count++;
      cur = n;
    });
    root.size += f.size;
  }
  return root;
}

const sortNodes = (a: Node, b: Node) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1);

function FileIcon({ name, className }: { name: string; className?: string }) {
  if (/\.(png|jpe?g|gif|webp|svg|ico|avif)$/i.test(name)) return <FileImage className={cx(className, 'text-info')} />;
  if (/\.json$/i.test(name)) return <FileJson className={cx(className, 'text-amber')} />;
  if (/\.(m?[jt]sx?|vue|svelte|astro|css|scss|html?)$/i.test(name)) return <FileCode2 className={cx(className, 'text-ember')} />;
  if (/\.(md|txt)$/i.test(name)) return <FileText className={cx(className, 'text-muted')} />;
  return <File className={cx(className, 'text-faint')} />;
}

export default function FileExplorer({ files, loadContent, className, height = 'h-[520px]' }: { files: FileEntry[]; loadContent?: (path: string) => Promise<Uint8Array | null>; className?: string; height?: string }) {
  const tree = useMemo(() => buildTree(files), [files]);
  const folders = useMemo(() => new Set(files.flatMap((f) => f.path.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/')))).size, [files]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([...tree.children.values()].filter((n) => n.dir && ['src', 'app', 'pages', 'public'].includes(n.name)).map((n) => n.path)));
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ kind: 'text' | 'image' | 'binary' | 'loading' | 'unavailable'; text?: string; url?: string; truncated?: boolean } | null>(null);

  useEffect(() => {
    const pick = ['package.json', 'index.html', 'README.md'].find((p) => files.some((f) => f.path === p));
    if (pick && !selected) setSelected(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => {
    let url: string | undefined;
    let alive = true;
    if (!selected) { setPreview(null); return; }
    if (!loadContent) { setPreview({ kind: 'unavailable' }); return; }
    setPreview({ kind: 'loading' });
    loadContent(selected).then((data) => {
      if (!alive) return;
      if (!data) return setPreview({ kind: 'unavailable' });
      if (/\.(png|jpe?g|gif|webp|svg|ico|avif)$/i.test(selected)) {
        const type = selected.endsWith('.svg') ? 'image/svg+xml' : 'image/*';
        url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
        return setPreview({ kind: 'image', url });
      }
      if (isBinary(selected, data)) return setPreview({ kind: 'binary' });
      const max = 250_000;
      const text = decodeText(data.length > max ? data.slice(0, max) : data);
      setPreview({ kind: 'text', text, truncated: data.length > max });
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [selected, loadContent]);

  const toggle = (p: string) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const matches = useMemo(() => (q.trim() ? files.filter((f) => f.path.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 300) : []), [q, files]);
  const selectedSize = files.find((f) => f.path === selected)?.size;

  const renderNode = (n: Node, depth: number): React.ReactNode => {
    const open = expanded.has(n.path);
    return (
      <li key={n.path} role="treeitem" aria-expanded={n.dir ? open : undefined} aria-selected={selected === n.path}>
        <button type="button" onClick={() => (n.dir ? toggle(n.path) : setSelected(n.path))}
          className={cx('flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left text-[13px] transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ember', selected === n.path && 'bg-ember/10 text-fg')}
          style={{ paddingLeft: 8 + depth * 14 }}>
          {n.dir ? <ChevronRight className={cx('h-3.5 w-3.5 shrink-0 text-faint transition-transform', open && 'rotate-90')} /> : <span className="w-3.5 shrink-0" />}
          {n.dir ? (open ? <FolderOpen className="h-4 w-4 shrink-0 text-amber" /> : <Folder className="h-4 w-4 shrink-0 text-amber" />) : <FileIcon name={n.name} className="h-4 w-4 shrink-0" />}
          <span className="truncate">{n.name}</span>
          <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-faint">{n.dir ? n.count : bytes(n.size)}</span>
        </button>
        {n.dir && open && <ul role="group">{[...n.children.values()].sort(sortNodes).map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  const lines = preview?.kind === 'text' ? preview.text!.split('\n') : [];

  return (
    <div className={cx('glass overflow-hidden rounded-2xl', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 text-xs text-muted">
        <span><b className="text-fg">{files.length.toLocaleString()}</b> files</span>
        <span><b className="text-fg">{folders.toLocaleString()}</b> folders</span>
        <span><b className="text-fg">{bytes(tree.size)}</b> total</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px]"><Lock className="h-3 w-3" /> Read-only preview — code is never executed</span>
      </div>
      <div className={cx('grid grid-cols-1 md:grid-cols-[minmax(240px,34%)_1fr]', height)}>
        <div className="flex min-h-0 flex-col border-b border-line md:border-b-0 md:border-r">
          <div className="relative p-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="h-9 pl-9 pr-8" aria-label="Search files" />
            {q && <button onClick={() => setQ('')} className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-fg" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="scroll-thin max-h-64 min-h-0 flex-1 overflow-auto px-1.5 pb-2 md:max-h-none">
            {q.trim() ? (
              matches.length ? (
                <ul>{matches.map((f) => (
                  <li key={f.path}><button onClick={() => setSelected(f.path)} className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] hover:bg-surface-2', selected === f.path && 'bg-ember/10')}>
                    <FileIcon name={f.path} className="h-4 w-4 shrink-0" /><span className="truncate font-mono text-[12px]">{f.path}</span></button></li>
                ))}</ul>
              ) : <p className="px-3 py-6 text-center text-sm text-muted">No files match “{q}”.</p>
            ) : (
              <ul role="tree" aria-label="Project files">{[...tree.children.values()].sort(sortNodes).map((n) => renderNode(n, 0))}</ul>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            {selected ? <><FileIcon name={selected} className="h-4 w-4" /><span className="truncate font-mono text-xs">{selected}</span><span className="ml-auto font-mono text-[11px] text-faint">{bytes(selectedSize)}</span></> : <span className="text-xs text-muted">Select a file to preview</span>}
          </div>
          <div className="scroll-thin min-h-[240px] flex-1 overflow-auto">
            {!preview ? <div className="flex h-full items-center justify-center p-8 text-sm text-muted">Choose a file from the tree.</div>
              : preview.kind === 'loading' ? <div className="flex h-full items-center justify-center p-8"><Spinner /></div>
              : preview.kind === 'image' ? <div className="flex h-full items-center justify-center p-6"><img src={preview.url} alt={selected || ''} className="max-h-80 max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(#8882_0_25%,transparent_0_50%)] bg-[length:16px_16px]" /></div>
              : preview.kind === 'binary' ? <div className="flex h-full items-center justify-center p-8 text-sm text-muted">Binary file — preview not available.</div>
              : preview.kind === 'unavailable' ? <div className="flex h-full items-center justify-center p-8 text-sm text-muted">Preview unavailable for this file.</div>
              : (
                <pre className="min-w-max p-0 font-mono text-[12px] leading-[1.65]">
                  {lines.slice(0, 4000).map((l, i) => (
                    <div key={i} className="flex hover:bg-surface">
                      <span className="sticky left-0 w-12 shrink-0 select-none bg-surface-2 pr-3 text-right text-faint">{i + 1}</span>
                      <code className="whitespace-pre pr-6 text-fg/90">{l || ' '}</code>
                    </div>
                  ))}
                  {(preview.truncated || lines.length > 4000) && <div className="px-14 py-3 text-xs text-muted">… preview truncated</div>}
                </pre>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
