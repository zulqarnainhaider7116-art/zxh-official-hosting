export function bytes(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1073741824) return `${(v / 1048576).toFixed(2)} MB`;
  return `${(v / 1073741824).toFixed(2)} GB`;
}

export function dateTime(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateOnly(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(s?: string | null) {
  if (!s) return '—';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d ago`;
  return dateOnly(s);
}

export function duration(ms?: number | null) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function money(amount: number | string, currency = 'PKR') {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function timeOfDay(s: string) {
  return new Date(s).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 50);
}

export function humanAction(a: string) {
  return a.replace(/^admin\./, '').replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
