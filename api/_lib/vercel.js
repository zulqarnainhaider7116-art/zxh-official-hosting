import { decrypt } from './crypto.js';

const BASE = 'https://api.vercel.com';

export class VercelError extends Error {
  constructor(status, code, message, body) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Server-side only Vercel REST client with timeout + retry on 429/5xx/network. */
export async function vercel(auth, path, opts = {}) {
  const { method = 'GET', body, headers = {}, raw = false, retries = 2, timeout = 20000 } = opts;
  const url = new URL(BASE + path);
  if (auth.teamId) url.searchParams.set('teamId', auth.teamId);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${auth.token}`,
          ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const wait = res.status === 429 && reset ? Math.min(6000, Math.max(500, reset * 1000 - Date.now())) : 600 * (attempt + 1) ** 2;
        await sleep(wait);
        continue;
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (!res.ok) {
        throw new VercelError(res.status, json?.error?.code || `http_${res.status}`, json?.error?.message || `Vercel API responded with ${res.status}`, json);
      }
      return json;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof VercelError) throw e;
      if (attempt < retries) { await sleep(500 * (attempt + 1)); continue; }
    }
  }
  throw new VercelError(0, 'network', 'Could not reach the Vercel API. Please try again in a moment.', null);
}

export function authFor(conn) {
  return { token: decrypt(conn.token_encrypted), teamId: conn.team_id || null };
}

export function vercelMessage(e) {
  if (!(e instanceof VercelError)) return 'Unexpected error while communicating with Vercel.';
  if (e.status === 401) return 'The Vercel token is invalid, expired or has been revoked.';
  if (e.status === 403) return `Vercel denied access: ${String(e.message).slice(0, 200)}`;
  if (e.status === 429) return 'Vercel rate limit reached. Please wait a moment and retry.';
  if (e.status === 0) return e.message;
  return String(e.message).slice(0, 300);
}

// ---------- domains ----------
const TWO_LEVEL = ['co.uk', 'org.uk', 'com.pk', 'net.pk', 'org.pk', 'edu.pk', 'gov.pk', 'com.au', 'co.in', 'com.br', 'co.jp', 'co.za', 'com.tr', 'com.mx', 'co.nz', 'com.sg'];
export function apexOf(host) {
  const parts = host.split('.');
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL.includes(last2) ? parts.slice(-3).join('.') : last2;
}
export function dnsRecords(host, verification = []) {
  const apex = apexOf(host);
  const records = [];
  if (apex === host) records.push({ type: 'A', name: '@', value: '76.76.21.21', purpose: 'Point the apex domain to Vercel' });
  else records.push({ type: 'CNAME', name: host.slice(0, -(apex.length + 1)), value: 'cname.vercel-dns.com', purpose: 'Point the subdomain to Vercel' });
  for (const v of verification || []) {
    records.push({ type: v.type || 'TXT', name: (v.domain || '').replace(`.${apex}`, '') || '@', value: v.value, purpose: 'Verify domain ownership' });
  }
  return records;
}

/** Attach (idempotent) and inspect a custom domain on a Vercel project. */
export async function syncDomain(auth, vpId, host, { attach = true } = {}) {
  if (attach) {
    try {
      await vercel(auth, `/v10/projects/${encodeURIComponent(vpId)}/domains`, { method: 'POST', body: { name: host } });
    } catch (e) {
      if (!(e instanceof VercelError)) throw e;
      if (e.code === 'domain_already_in_use') return { status: 'error', verified: false, error: 'This domain is already in use by another Vercel project.', dns_records: dnsRecords(host) };
      if (!(e.status === 409 || /already/i.test(e.message))) throw e;
    }
  }
  let info = null;
  try { info = await vercel(auth, `/v9/projects/${encodeURIComponent(vpId)}/domains/${encodeURIComponent(host)}`); } catch (e) {
    if (e instanceof VercelError && e.status === 404) return { status: 'pending_attach', verified: false, dns_records: dnsRecords(host) };
    throw e;
  }
  if (!info.verified) {
    try {
      const v = await vercel(auth, `/v9/projects/${encodeURIComponent(vpId)}/domains/${encodeURIComponent(host)}/verify`, { method: 'POST', retries: 0 });
      if (v?.verified) info = v;
    } catch { /* still pending */ }
  }
  let misconfigured = true;
  try {
    const cfg = await vercel(auth, `/v6/domains/${encodeURIComponent(host)}/config`, { retries: 0 });
    misconfigured = !!cfg?.misconfigured;
  } catch { /* unknown */ }
  const status = !info.verified ? 'pending_verification' : misconfigured ? 'misconfigured' : 'active';
  return { status, verified: !!info.verified, verification: info.verification || [], dns_records: dnsRecords(host, info.verification || []) };
}
