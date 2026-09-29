import crypto from 'node:crypto';
import supabase from '../db-client.js';

export { supabase };

export class HttpError extends Error {
  constructor(status, message, code = 'error', extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function fail(status, message, code = 'error', extra) {
  throw new HttpError(status, message, code, extra);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wraps a handler with CORS, security headers and sanitized error handling. */
export function route(fn) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra || {}) });
        else try { res.end(); } catch { /* noop */ }
        return;
      }
      const ref = crypto.randomBytes(4).toString('hex');
      console.error(`[deployforge:${ref}]`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: `Something went wrong on our side. Reference ${ref}.`, code: 'internal', ref });
      } else {
        try { res.end(); } catch { /* noop */ }
      }
    }
  };
}

export function clientIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(xf) ? xf[0] : xf || '';
  return raw.split(',')[0].trim() || req?.socket?.remoteAddress || null;
}

export function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { fail(400, 'Invalid JSON body.', 'bad_json'); }
  }
  return b;
}

// ---------- validation ----------
export function str(v, { name = 'Field', min = 0, max = 200, required = false, pattern, patternMsg, lower = false } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') v = String(v);
  v = v.trim();
  if (lower) v = v.toLowerCase();
  if (required && !v) fail(400, `${name} is required.`, 'validation', { field: name });
  if (v && v.length < min) fail(400, `${name} must be at least ${min} characters.`, 'validation', { field: name });
  if (v.length > max) fail(400, `${name} must be at most ${max} characters.`, 'validation', { field: name });
  if (v && pattern && !pattern.test(v)) fail(400, patternMsg || `${name} is invalid.`, 'validation', { field: name });
  return v;
}
export const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
export function int(v, { min = 0, max = 1e9, name = 'Value', def } = {}) {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < min || n > max) fail(400, `${name} must be a whole number between ${min} and ${max}.`, 'validation', { field: name });
  return n;
}
export function num(v, { min = 0, max = 1e9, name = 'Value' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${name} must be between ${min} and ${max}.`, 'validation', { field: name });
  return Math.round(n * 100) / 100;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(v, name = 'id') {
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(400, `Invalid ${name}.`, 'validation');
  return v;
}
export function paging(q) {
  const p = Math.max(1, parseInt(q.page, 10) || 1);
  const size = Math.min(100, Math.max(5, parseInt(q.size, 10) || 20));
  return { p, size, from: (p - 1) * size, to: p * size - 1 };
}
export const likeSafe = (q) => String(q || '').replace(/[^\p{L}\p{N}@._\- ]/gu, '').slice(0, 60);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$/;
export const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  billing: {
    paid_enabled: false,
    unavailable_message: 'Paid subscriptions are currently unavailable. You can keep using the Free plan.',
  },
  payment: {
    available: true,
    method_name: 'Bank / mobile wallet transfer',
    account_number: '',
    account_holder: '',
    instructions: 'Send the exact plan amount, then enter the transaction ID and upload a screenshot of your receipt.',
    require_proof: true,
    require_reference: true,
    send_payment_url: '',
  },
  limits: {
    max_upload_mb: 25,
    max_unzipped_mb: 80,
    max_files: 4000,
    deploy_timeout_min: 30,
    max_connections: 10,
    reserved_subdomains: ['www', 'admin', 'api', 'app', 'dashboard', 'mail', 'support', 'help', 'status', 'deployforge', 'vercel', 'login', 'signup', 'billing', 'docs', 'blog', 'static', 'cdn', 'assets', 'root', 'system'],
    import_hosts: ['github.com', 'codeload.github.com', 'gitlab.com', 'bitbucket.org'],
  },
  platform: {
    name: 'DeployForge',
    support_email: 'support@deployforge.app',
    maintenance_message: '',
  },
  system: {},
};

let settingsCache = null;
let settingsAt = 0;
export async function getSettings(force = false) {
  if (!force && settingsCache && Date.now() - settingsAt < 10000) return settingsCache;
  const { data, error } = await supabase.from('system_settings').select('key,value');
  if (error) throw error;
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const r of data || []) {
    out[r.key] = { ...(out[r.key] || {}), ...(r.value || {}) };
  }
  settingsCache = out;
  settingsAt = Date.now();
  return out;
}
export function clearSettingsCache() { settingsCache = null; }
export async function saveSetting(key, value) {
  const { error } = await supabase.from('system_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  clearSettingsCache();
}

// ---------- plans / quota ----------
export async function getDefaultPlan() {
  const { data } = await supabase.from('plans').select('*').eq('is_default', true).order('id').limit(1);
  if (data?.[0]) return data[0];
  const r = await supabase.from('plans').select('*').order('price').limit(1);
  return r.data?.[0] || null;
}

export async function getQuota(profile) {
  let plan = null;
  if (profile.plan_id) {
    const { data } = await supabase.from('plans').select('*').eq('id', profile.plan_id).maybeSingle();
    plan = data;
  }
  if (!plan) plan = await getDefaultPlan();
  const limit = profile.project_limit_override ?? plan?.project_limit ?? 5;
  const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', profile.id);
  const used = count || 0;
  return { plan, limit, used, remaining: Math.max(0, limit - used) };
}

export async function assertQuota(ctx) {
  const q = await getQuota(ctx.profile);
  if (q.used >= q.limit) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.user.id).eq('type', 'quota_reached').gt('created_at', since);
    if (!count) await notify(ctx.user.id, 'quota_reached', 'Project limit reached', `Your ${q.plan?.name || 'current'} plan allows ${q.limit} projects. Upgrade or delete a project to create more.`, '/app/billing');
    fail(403, `You've reached your plan limit of ${q.limit} projects. Upgrade your plan or delete a project.`, 'quota_reached', { quota: { used: q.used, limit: q.limit } });
  }
  return q;
}

export async function expirePlan(profile) {
  const def = await getDefaultPlan();
  await supabase.from('profiles').update({ plan_id: def?.id ?? null, plan_expires_at: null, updated_at: new Date().toISOString() }).eq('id', profile.id);
  await supabase.from('subscriptions').update({ status: 'expired' }).eq('user_id', profile.id).eq('status', 'active');
  await notify(profile.id, 'subscription_expired', 'Subscription expired', `Your paid plan has ended and your account moved to the ${def?.name || 'Free'} plan. Existing projects are kept.`, '/app/billing');
  return { ...profile, plan_id: def?.id ?? null, plan_expires_at: null };
}

// ---------- auth ----------
export async function ensureProfile(user) {
  let { data: p, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!p) {
    const def = await getDefaultPlan();
    const row = {
      id: user.id,
      email: user.email,
      full_name: (user.user_metadata?.full_name || user.user_metadata?.name || '').slice(0, 80),
      plan_id: def?.id ?? null,
      status: 'active',
    };
    const ins = await supabase.from('profiles').upsert(row, { onConflict: 'id' }).select('*').single();
    if (ins.error) throw ins.error;
    p = ins.data;
    await audit({ user }, 'account.created', 'user', user.id, {});
    await notify(user.id, 'welcome', 'Welcome to DeployForge', 'Connect a Vercel account, then upload your first project.', '/app/connections');
  }
  if (p.plan_expires_at && new Date(p.plan_expires_at) < new Date()) p = await expirePlan(p);
  const patch = {};
  if (user.email && p.email !== user.email) patch.email = user.email;
  if (!p.last_seen_at || Date.now() - new Date(p.last_seen_at).getTime() > 10 * 60000) patch.last_seen_at = new Date().toISOString();
  if (Object.keys(patch).length) {
    await supabase.from('profiles').update(patch).eq('id', p.id);
    Object.assign(p, patch);
  }
  return p;
}

export async function requireUser(req, opts = {}) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) fail(401, 'Please sign in to continue.', 'unauthenticated');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) fail(401, 'Your session has expired. Please sign in again.', 'session_expired');
  const user = data.user;
  const profile = await ensureProfile(user);
  if (profile.status === 'suspended' && !opts.allowSuspended) fail(403, 'This account is suspended. Contact support if you believe this is a mistake.', 'suspended');
  return { user, profile, req };
}

export async function getAdminRole(userId) {
  const { data } = await supabase.from('admin_roles').select('role').eq('user_id', userId).maybeSingle();
  return data?.role || null;
}

const RANK = { support: 1, admin: 2, owner: 3 };
export async function requireAdmin(req, level = 'read') {
  const ctx = await requireUser(req);
  const role = await getAdminRole(ctx.user.id);
  if (!role) fail(403, 'You do not have access to this area.', 'forbidden');
  const need = { read: 1, write: 2, owner: 3 }[level] || 1;
  if ((RANK[role] || 0) < need) fail(403, 'Your admin role does not allow this action.', 'forbidden');
  return { ...ctx, role };
}

// ---------- rate limiting ----------
export async function rateLimit(key, limit, windowSec) {
  const now = Date.now();
  const { data } = await supabase.from('rate_limits').select('*').eq('key', key).maybeSingle();
  if (!data || now - new Date(data.window_start).getTime() > windowSec * 1000) {
    await supabase.from('rate_limits').upsert({ key, count: 1, window_start: new Date(now).toISOString() }, { onConflict: 'key' });
    return;
  }
  if (data.count >= limit) {
    const wait = Math.ceil((new Date(data.window_start).getTime() + windowSec * 1000 - now) / 1000);
    fail(429, `Too many requests. Please try again in ${wait > 90 ? Math.ceil(wait / 60) + ' minutes' : wait + ' seconds'}.`, 'rate_limited', { retry_after: wait });
  }
  await supabase.from('rate_limits').update({ count: data.count + 1 }).eq('key', key);
}

// ---------- audit / notifications ----------
export async function audit(ctx, action, targetType, targetId, metadata = {}) {
  try {
    await supabase.from('audit_logs').insert({
      actor_id: ctx?.user?.id || null,
      actor_email: ctx?.user?.email || null,
      action,
      target_type: targetType || null,
      target_id: targetId ? String(targetId) : null,
      metadata: metadata || {},
      ip: ctx?.req ? clientIp(ctx.req) : null,
      user_agent: ctx?.req?.headers?.['user-agent']?.slice(0, 300) || null,
    });
  } catch (e) {
    console.error('audit failed', e?.message);
  }
}

export async function notify(userId, type, title, text, link = null) {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({ user_id: userId, type, title, body: text, link });
  } catch (e) {
    console.error('notify failed', e?.message);
  }
}

export async function notifyAdmins(type, title, text, link) {
  const { data } = await supabase.from('admin_roles').select('user_id');
  const rows = (data || []).map((r) => ({ user_id: r.user_id, type, title, body: text, link }));
  if (rows.length) await supabase.from('notifications').insert(rows);
}

export const publicConn = (c) => c && ({
  id: c.id,
  name: c.name,
  token_hint: `••••••••${c.token_last4 || ''}`,
  team_id: c.team_id,
  team_name: c.team_name,
  vercel_username: c.vercel_username,
  vercel_email: c.vercel_email,
  status: c.status,
  last_error: c.last_error,
  last_checked_at: c.last_checked_at,
  created_at: c.created_at,
});
