import JSZip from 'jszip';

export interface SourceFile { path: string; size: number }
export interface Bundle {
  name: string;
  files: SourceFile[];
  contents: Map<string, Uint8Array>;
  totalSize: number;
  skipped: { path: string; reason: string }[];
  strippedRoot: string | null;
}
export interface Limits { max_upload_mb: number; max_files: number; max_unzipped_mb: number }

export class ZipError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.vercel', '.next', '.nuxt', '.svelte-kit', '.cache', '__MACOSX', '.turbo', '.output', '.idea', '.vscode']);
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function classify(raw: string): { path: string | null; reason?: string } {
  let s = raw.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!s) return { path: null, reason: 'empty path' };
  const segs = s.split('/');
  if (segs.some((x) => x === '..' || x === '.')) return { path: null, reason: 'unsafe path (traversal)' };
  if (s.length > 400) return { path: null, reason: 'path too long' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(s)) return { path: null, reason: 'invalid characters' };
  const dir = segs.find((x) => EXCLUDED_DIRS.has(x));
  if (dir) return { path: null, reason: `${dir} is excluded (rebuilt on Vercel)` };
  const base = segs[segs.length - 1];
  if (EXCLUDED_FILES.has(base)) return { path: null, reason: 'system file' };
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example' && base !== '.env.sample') return { path: null, reason: 'secret file — add values as environment variables instead' };
  return { path: s };
}

const TEXT_EXT = /\.(html?|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|json|md|mdx|txt|svg|xml|yml|yaml|toml|vue|svelte|astro|env|example|sample|lock|gitignore|npmrc|nvmrc|editorconfig|prettierrc|eslintrc|babelrc|map|csv|ini|conf|sh|py|rb|php|go|rs|java|kt|graphql|gql|webmanifest)$/i;
export function isBinary(path: string, data?: Uint8Array) {
  if (TEXT_EXT.test(path) || /(^|\/)(Dockerfile|Makefile|LICENSE|README|\.[a-z]+rc)$/i.test(path)) return false;
  if (!data) return true;
  const n = Math.min(data.length, 4000);
  for (let i = 0; i < n; i++) if (data[i] === 0) return true;
  return false;
}

export function decodeText(data: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: false }).decode(data);
}

async function finalize(entries: { path: string; data: Uint8Array }[], skipped: Bundle['skipped'], name: string, limits: Limits): Promise<Bundle> {
  if (!entries.length) throw new ZipError('empty', 'The archive does not contain any deployable files.');
  let strippedRoot: string | null = null;
  const first = entries[0].path.split('/')[0];
  if (entries.every((e) => e.path.includes('/') && e.path.split('/')[0] === first)) {
    strippedRoot = first;
    entries = entries.map((e) => ({ ...e, path: e.path.slice(first.length + 1) }));
  }
  const contents = new Map<string, Uint8Array>();
  const files: SourceFile[] = [];
  let total = 0;
  for (const e of entries) {
    if (contents.has(e.path)) continue;
    contents.set(e.path, e.data);
    files.push({ path: e.path, size: e.data.length });
    total += e.data.length;
  }
  if (files.length > limits.max_files) throw new ZipError('too_many_files', `The project has ${files.length} files; the limit is ${limits.max_files}.`);
  if (total > limits.max_unzipped_mb * 1048576) throw new ZipError('too_large', `The unpacked project is larger than ${limits.max_unzipped_mb} MB.`);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name, files, contents, totalSize: total, skipped, strippedRoot };
}

export async function bundleFromZip(file: Blob, name: string, limits: Limits, onProgress?: (pct: number) => void): Promise<Bundle> {
  if (file.size > limits.max_upload_mb * 1048576) throw new ZipError('too_large', `The archive is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${limits.max_upload_mb} MB.`);
  if (file.size < 22) throw new ZipError('invalid_zip', 'This file is too small to be a ZIP archive.');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] !== 0x50 || head[1] !== 0x4b) throw new ZipError('invalid_zip', 'This file is not a valid ZIP archive.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new ZipError('invalid_zip', 'The ZIP archive is corrupted or uses an unsupported format.'); }
  const all = Object.values(zip.files).filter((f) => !f.dir);
  if (all.length > limits.max_files * 4) throw new ZipError('too_many_files', `The archive contains ${all.length} entries — too many to process.`);
  const entries: { path: string; data: Uint8Array }[] = [];
  const skipped: Bundle['skipped'] = [];
  let total = 0;
  let i = 0;
  for (const f of all) {
    i++;
    const c = classify(f.name);
    if (!c.path) { if (skipped.length < 500) skipped.push({ path: f.name, reason: c.reason || 'excluded' }); continue; }
    const data = await f.async('uint8array');
    total += data.length;
    if (total > limits.max_unzipped_mb * 1048576) throw new ZipError('too_large', `The unpacked project is larger than ${limits.max_unzipped_mb} MB (possible zip bomb or bundled dependencies).`);
    entries.push({ path: c.path, data });
    if (onProgress && i % 25 === 0) onProgress(Math.round((i / all.length) * 100));
  }
  onProgress?.(100);
  return finalize(entries, skipped, name, limits);
}

export async function bundleFromFiles(list: File[], limits: Limits, onProgress?: (pct: number) => void): Promise<Bundle> {
  const entries: { path: string; data: Uint8Array }[] = [];
  const skipped: Bundle['skipped'] = [];
  let total = 0;
  let i = 0;
  const root = (list[0] as any)?.webkitRelativePath?.split('/')[0] || 'project';
  for (const f of list) {
    i++;
    const rel = (f as any).webkitRelativePath || f.name;
    const c = classify(rel);
    if (!c.path) { if (skipped.length < 500) skipped.push({ path: rel, reason: c.reason || 'excluded' }); continue; }
    total += f.size;
    if (total > limits.max_unzipped_mb * 1048576) throw new ZipError('too_large', `The selected folder is larger than ${limits.max_unzipped_mb} MB.`);
    entries.push({ path: c.path, data: new Uint8Array(await f.arrayBuffer()) });
    if (onProgress && i % 25 === 0) onProgress(Math.round((i / list.length) * 100));
  }
  onProgress?.(100);
  return finalize(entries, skipped, `${root}.zip`, limits);
}

export async function packBundle(b: Bundle, onProgress?: (pct: number) => void): Promise<Blob> {
  const zip = new JSZip();
  for (const f of b.files) zip.file(f.path, b.contents.get(f.path)!);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' }, (m) => onProgress?.(Math.round(m.percent)));
}
