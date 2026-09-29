import supabase from './supabase';

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(status: number, message: string, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; signal?: AbortSignal } = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(0, 'You appear to be offline. Check your connection and try again.', 'offline');
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeader()) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'Network error — could not reach DeployForge servers.', 'network');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error || (res.status === 404 ? 'Not found.' : `Request failed (${res.status}).`);
    if (res.status === 401 && data?.code === 'session_expired') window.dispatchEvent(new CustomEvent('df:session-expired'));
    if (res.status === 403 && data?.code === 'suspended') window.dispatchEvent(new CustomEvent('df:suspended'));
    throw new ApiError(res.status, msg, data?.code, data);
  }
  if (data === null && text && !text.startsWith('{') && !text.startsWith('[')) {
    throw new ApiError(502, 'The server returned an unexpected response.', 'bad_response');
  }
  return data as T;
}

/** Upload a blob to a Supabase signed upload URL with progress events. */
export function uploadSigned(signedUrl: string, blob: Blob, filename: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload failed (${xhr.status}).`;
        try { const j = JSON.parse(xhr.responseText); if (j.message || j.error) msg = `Upload failed: ${j.message || j.error}`; } catch { /* noop */ }
        reject(new ApiError(xhr.status, msg, 'upload_failed'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload interrupted — check your connection and retry.', 'network'));
    const fd = new FormData();
    fd.append('cacheControl', '3600');
    fd.append('', blob, filename);
    xhr.send(fd);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
