import { useEffect, useState } from 'react';
import { api } from './api';

export interface PublicConfig {
  plans: any[];
  billing: { paid_enabled: boolean; unavailable_message: string };
  platform: { name: string; support_email: string; maintenance_message: string };
  limits: { max_upload_mb: number; max_files: number; max_unzipped_mb: number };
  announcements: { id: number; title: string; body: string; level: string; created_at: string }[];
}

let cache: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

export const FALLBACK_LIMITS = { max_upload_mb: 25, max_files: 4000, max_unzipped_mb: 80 };

export function loadConfig(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) inflight = api<PublicConfig>('/api/me?action=config').then((c) => { cache = c; return c; }).finally(() => { inflight = null; });
  return inflight;
}

export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => alive && setConfig(c)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);
  return { config, error };
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
