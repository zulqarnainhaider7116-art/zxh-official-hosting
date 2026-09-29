import dns from 'node:dns/promises';
import net from 'node:net';
import { fail } from './core.js';

function v4ToInt(ip) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1') return true;
    if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
    if (/^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith('ff')) return true;
    return false;
  }
  return true;
}

async function assertPublicUrl(u, allowedHosts) {
  if (u.protocol !== 'https:') fail(400, 'Only https:// URLs are allowed.', 'ssrf_blocked');
  if (u.username || u.password) fail(400, 'URLs with credentials are not allowed.', 'ssrf_blocked');
  if (u.port && u.port !== '443') fail(400, 'Custom ports are not allowed.', 'ssrf_blocked');
  const host = u.hostname.toLowerCase();
  if (net.isIP(host)) fail(400, 'IP address URLs are not allowed.', 'ssrf_blocked');
  if (allowedHosts?.length && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    fail(400, `Imports are only allowed from: ${allowedHosts.join(', ')}.`, 'host_not_allowed');
  }
  let addrs = [];
  try { addrs = await dns.lookup(host, { all: true }); } catch { fail(400, 'That host could not be resolved.', 'dns_failed'); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) fail(400, 'That URL resolves to a private or reserved network address.', 'ssrf_blocked');
}

/** Fetch an untrusted URL with SSRF protection, redirect re-validation, size cap and timeout. */
export async function safeFetch(urlStr, { maxBytes = 25 * 1024 * 1024, timeoutMs = 25000, allowedHosts = [] } = {}) {
  let current;
  try { current = new URL(urlStr); } catch { fail(400, 'That is not a valid URL.', 'invalid_url'); }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(current, hop === 0 ? allowedHosts : [...allowedHosts, 'githubusercontent.com']);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'DeployForge-Importer/1.0' } });
    } catch {
      clearTimeout(timer);
      fail(400, 'The remote server did not respond in time.', 'fetch_failed');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      current = new URL(res.headers.get('location'), current);
      continue;
    }
    if (!res.ok) { clearTimeout(timer); fail(400, `The remote server responded with HTTP ${res.status}.`, 'fetch_failed'); }
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) { clearTimeout(timer); fail(413, `The archive is larger than ${Math.round(maxBytes / 1048576)} MB.`, 'too_large'); }
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { ctrl.abort(); clearTimeout(timer); fail(413, `The archive is larger than ${Math.round(maxBytes / 1048576)} MB.`, 'too_large'); }
      chunks.push(value);
    }
    clearTimeout(timer);
    return { buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))), finalUrl: current.toString() };
  }
  fail(400, 'Too many redirects.', 'fetch_failed');
}
