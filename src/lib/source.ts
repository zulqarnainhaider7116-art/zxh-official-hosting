import { api, uploadSigned } from './api';
import { packBundle, type Bundle } from './zip';
import type { Analysis } from './analyzer';

export interface UploadedSource { path: string; size: number; filename: string }

/** Re-packs the normalized bundle and uploads it to private storage via a short-lived signed URL. */
export async function uploadBundle(bundle: Bundle, onPhase: (phase: 'packing' | 'uploading', pct: number) => void): Promise<UploadedSource> {
  onPhase('packing', 0);
  const blob = await packBundle(bundle, (p) => onPhase('packing', p));
  const filename = bundle.name.endsWith('.zip') ? bundle.name : `${bundle.name}.zip`;
  const { path, signedUrl } = await api<{ path: string; signedUrl: string }>('/api/projects?action=upload-url', { method: 'POST', body: { filename, size: blob.size } });
  onPhase('uploading', 0);
  await uploadSigned(signedUrl, blob, filename, (p) => onPhase('uploading', p));
  return { path, size: blob.size, filename };
}

export function manifestOf(bundle: Bundle) {
  return bundle.files.map((f) => ({ p: f.path, s: f.size }));
}

export function compactAnalysis(a: Analysis) {
  return { ...a, dependencies: a.dependencies.slice(0, 150) };
}
