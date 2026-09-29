import crypto from 'node:crypto';
import JSZip from 'jszip';
import { supabase, notify, getSettings, saveSetting, expirePlan } from './core.js';
import { decrypt } from './crypto.js';
import { vercel, authFor, VercelError, vercelMessage, syncDomain } from './vercel.js';

export const ACTIVE = ['queued', 'preparing', 'uploading', 'building', 'checking'];
export const TERMINAL = ['completed', 'failed', 'cancelled'];

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.vercel', '.next', '.nuxt', '.svelte-kit', '.cache', '__MACOSX', '.turbo', '.output', '.idea', '.vscode']);
const EXCLUDED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

/** Normalizes an archive path; returns null for unsafe or excluded entries. */
export function normalizePath(p) {
  if (typeof p !== 'string') return null;
  let s = p.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!s || s.length > 400) return null;
  const segs = s.split('/');
  if (segs.some((x) => x === '..' || x === '.' || x === '')) return null;
  if (/[\u0000-\u001f]/.test(s)) return null;
  if (segs.some((x) => EXCLUDED_DIRS.has(x))) return null;
  const base = segs[segs.length - 1];
  if (EXCLUDED_FILES.has(base)) return null;
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example' && base !== '.env.sample') return null;
  return s;
}

class WorkerError extends Error {
  constructor(code, message, hint) { super(message); this.code = code; this.hint = hint; }
}
class Aborted extends Error {}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const timeLeft = (ctx) => ctx.budgetMs - (Date.now() - ctx.started);

function redact(text, ctx) {
  let t = String(text).replace(ANSI, '').replace(/\r/g, '');
  for (const s of ctx.secrets || []) if (s) t = t.split(s).join('••••••');
  t = t.replace(/(Bearer\s+)[A-Za-z0-9._\-]{12,}/g, '$1••••••');
  return t.slice(0, 2000);
}

async function log(dep, level, message, phase) {
  await supabase.from('deployment_logs').insert({ deployment_id: dep.id, level, phase: phase || dep.status, message: String(message).slice(0, 2000), ts: new Date().toISOString() });
}

async function update(dep, patch) {
  const { data, error } = await supabase.from('deployments')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', dep.id).in('status', ACTIVE).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Aborted();
  Object.assign(dep, data);
  return dep;
}

/** Advance a deployment job for up to budgetMs. Uses a DB lease so only one worker runs a job at a time. */
export async function tick(depId, budgetMs = 7000) {
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const { data: dep, error } = await supabase.from('deployments')
    .update({ lock_until: new Date(Date.now() + budgetMs + 20000).toISOString() })
    .eq('id', depId).in('status', ACTIVE)
    .or(`lock_until.is.null,lock_until.lt."${nowIso}"`)
    .select('*').maybeSingle();
  if (error || !dep) return null;
  const ctx = { started, budgetMs, secrets: [] };
  try {
    for (let i = 0; i < 10; i++) {
      if (!ACTIVE.includes(dep.status) || timeLeft(ctx) < 1200) break;
      const cont = await step(dep, ctx);
      if (!cont) break;
    }
  } catch (err) {
    if (!(err instanceof Aborted)) await handleFailure(dep, ctx, err).catch((e) => console.error('failure handler', e));
  } finally {
    await supabase.from('deployments').update({ lock_until: null }).eq('id', dep.id);
  }
  return dep;
}

async function load(dep, ctx) {
  if (ctx.project) return;
  const { data: project } = await supabase.from('projects').select('*').eq('id', dep.project_id).maybeSingle();
  if (!project) throw new WorkerError('project_missing', 'The project for this deployment no longer exists.');
  ctx.project = project;
  const connId = dep.connection_id || project.connection_id;
  const { data: conn } = connId ? await supabase.from('vercel_connections').select('*').eq('id', connId).maybeSingle() : { data: null };
  if (!conn) throw new WorkerError('no_connection', 'No Vercel connection is available for this project.', 'Select a Vercel connection in the project settings and retry.');
  ctx.conn = conn;
  ctx.auth = authFor(conn);
  const { data: envs } = await supabase.from('environment_variables').select('*').eq('project_id', project.id);
  ctx.envs = (envs || []).map((e) => ({ ...e, value: decrypt(e.value_encrypted) }));
  ctx.secrets = ctx.envs.filter((e) => e.is_secret).map((e) => e.value).filter((v) => v && v.length >= 6);
}

async function step(dep, ctx) {
  await load(dep, ctx);
  const settings = await getSettings();
  const timeoutMin = settings.limits.deploy_timeout_min || 30;
  if (Date.now() - new Date(dep.created_at).getTime() > timeoutMin * 60000) {
    await cancelRemote(dep, ctx);
    throw new WorkerError('timeout', `The deployment exceeded the ${timeoutMin}-minute limit and was stopped.`, 'Large builds may need a longer timeout. Contact support or simplify the build.');
  }
  if (dep.cancel_requested) {
    await cancelRemote(dep, ctx);
    await finish(dep, ctx, 'cancelled');
    return false;
  }
  switch (dep.status) {
    case 'queued':
      await log(dep, 'system', 'Worker picked up the job', 'queued');
      await update(dep, { status: 'preparing', started_at: new Date().toISOString(), progress: 8 });
      await log(dep, 'info', 'Preparing the Vercel project…', 'preparing');
      return true;
    case 'preparing':
      await prepare(dep, ctx);
      return true;
    case 'uploading':
      return upload(dep, ctx);
    case 'building':
      return build(dep, ctx);
    case 'checking':
      return check(dep, ctx);
    default:
      return false;
  }
}

function projectSettings(project) {
  return {
    framework: project.framework && project.framework !== 'static' ? project.framework : null,
    buildCommand: project.build_command || null,
    installCommand: project.install_command || null,
    outputDirectory: project.output_directory || null,
  };
}

async function prepare(dep, ctx) {
  const { project, auth } = ctx;
  const settings = { ...projectSettings(project), rootDirectory: project.root_directory || null };
  let vpId = project.vercel_project_id;
  if (vpId) {
    try { await vercel(auth, `/v9/projects/${encodeURIComponent(vpId)}`); } catch (e) {
      if (e instanceof VercelError && e.status === 404) { vpId = null; await log(dep, 'warn', 'Linked Vercel project was not found — creating a new one', 'preparing'); } else throw e;
    }
  }
  if (!vpId) {
    try {
      const created = await vercel(auth, '/v11/projects', { method: 'POST', body: { name: project.slug, ...settings } });
      vpId = created.id;
      await log(dep, 'info', `Created Vercel project "${created.name}"`, 'preparing');
    } catch (e) {
      if (e instanceof VercelError && (e.status === 409 || /already exist/i.test(e.message))) {
        throw new WorkerError('name_taken', `A project named "${project.slug}" already exists in this Vercel account.`, 'Pick a different subdomain in project settings, or remove the existing Vercel project.');
      }
      throw e;
    }
    await supabase.from('projects').update({ vercel_project_id: vpId, vercel_project_name: project.slug }).eq('id', project.id);
    project.vercel_project_id = vpId;
  }
  const patch = { ...settings };
  if (project.node_version) patch.nodeVersion = project.node_version;
  try {
    await vercel(auth, `/v9/projects/${encodeURIComponent(vpId)}`, { method: 'PATCH', body: patch });
    await log(dep, 'info', `Applied build settings — framework: ${settings.framework || 'Other/static'}, Node ${project.node_version || 'default'}`, 'preparing');
  } catch (e) {
    if (e instanceof VercelError && e.status === 400) await log(dep, 'warn', `Vercel rejected some settings: ${e.message}`, 'preparing');
    else throw e;
  }
  if (ctx.envs.length) {
    await vercel(auth, `/v10/projects/${encodeURIComponent(vpId)}/env?upsert=true`, {
      method: 'POST',
      body: ctx.envs.map((e) => ({ key: e.key, value: e.value, type: 'encrypted', target: ['production', 'preview'] })),
    });
    await log(dep, 'info', `Synced ${ctx.envs.length} environment variable(s) — values hidden`, 'preparing');
  }
  await update(dep, { status: 'uploading', progress: 18 });
  await log(dep, 'info', 'Reading source archive from secure storage…', 'uploading');
}

async function readSource(ctx) {
  if (ctx.files) return ctx.files;
  const { project } = ctx;
  if (!project.source_path) throw new WorkerError('no_source', 'This project has no uploaded source code.', 'Upload a ZIP archive in the Files tab.');
  const { data, error } = await supabase.storage.from('sources').download(project.source_path);
  if (error || !data) throw new WorkerError('source_missing', 'The source archive could not be read from storage.', 'Re-upload the project source in the Files tab.');
  const settings = await getSettings();
  const buf = Buffer.from(await data.arrayBuffer());
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch { throw new WorkerError('invalid_zip', 'The stored archive is not a valid ZIP file.'); }
  const files = [];
  let total = 0;
  const maxTotal = (settings.limits.max_unzipped_mb || 80) * 1048576;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const p = normalizePath(entry.name);
    if (!p) continue;
    if (files.length >= settings.limits.max_files) throw new WorkerError('too_many_files', `The archive has more than ${settings.limits.max_files} files.`);
    const content = await entry.async('nodebuffer');
    total += content.length;
    if (total > maxTotal) throw new WorkerError('too_large', `The unpacked source is larger than ${settings.limits.max_unzipped_mb} MB.`);
    files.push({ file: p, data: content, size: content.length, sha: crypto.createHash('sha1').update(content).digest('hex') });
  }
  if (!files.length) throw new WorkerError('empty_source', 'The archive contains no deployable files.');
  ctx.files = files;
  ctx.totalBytes = total;
  return files;
}

async function upload(dep, ctx) {
  const files = await readSource(ctx);
  const { project, auth } = ctx;
  if (!dep.files_total) {
    await update(dep, { files_total: files.length });
    await log(dep, 'info', `Source contains ${files.length} files (${(ctx.totalBytes / 1048576).toFixed(2)} MB)`, 'uploading');
  }
  const payload = {
    name: project.slug,
    project: project.vercel_project_id,
    target: 'production',
    files: files.map((f) => ({ file: f.file, sha: f.sha, size: f.size })),
    projectSettings: projectSettings(project),
    meta: { deployforge: 'true', deployforgeDeploymentId: dep.id },
  };
  for (let round = 0; round < 6; round++) {
    try {
      const d = await vercel(auth, '/v13/deployments?skipAutoDetectionConfirmation=1', { method: 'POST', body: payload, timeout: 45000 });
      await update(dep, {
        status: 'building',
        vercel_deployment_id: d.id,
        url: d.url ? `https://${d.url}` : null,
        inspector_url: d.inspectorUrl || null,
        files_uploaded: files.length,
        progress: 45,
        building_at: new Date().toISOString(),
      });
      await log(dep, 'success', `Vercel deployment created (${d.id})`, 'uploading');
      await log(dep, 'info', 'Waiting for Vercel build machines…', 'building');
      return true;
    } catch (e) {
      if (!(e instanceof VercelError) || e.code !== 'missing_files') throw e;
      const missing = new Set(e.body?.error?.missing || []);
      const seen = new Set();
      const queue = files.filter((f) => missing.has(f.sha) && !seen.has(f.sha) && seen.add(f.sha));
      if (round === 0 && !dep.files_uploaded) {
        await log(dep, 'info', `${queue.length} file(s) to upload, ${files.length - queue.length} already cached by Vercel`, 'uploading');
      }
      let done = 0;
      const run = async () => {
        while (queue.length && timeLeft(ctx) > 2500) {
          const f = queue.shift();
          await vercel(auth, '/v2/files', { method: 'POST', raw: true, body: f.data, headers: { 'Content-Type': 'application/octet-stream', 'x-vercel-digest': f.sha }, timeout: 30000 });
          done++;
        }
      };
      await Promise.all(Array.from({ length: 6 }, run));
      const uploaded = Math.min(files.length, files.length - missing.size + done);
      await update(dep, { files_uploaded: uploaded, progress: 18 + Math.round((25 * uploaded) / files.length) });
      if (done) await log(dep, 'info', `Uploaded ${done} file(s) — ${uploaded}/${files.length} ready`, 'uploading');
      if (queue.length || timeLeft(ctx) < 5000) return false;
    }
  }
  throw new WorkerError('upload_failed', 'Files could not be uploaded to Vercel after several attempts.', 'Retry the deployment. If it keeps failing, check the Vercel status page.');
}

async function pullEvents(dep, ctx) {
  const since = Number(dep.last_event_ts || 0);
  let events;
  try {
    events = await vercel(ctx.auth, `/v3/deployments/${encodeURIComponent(dep.vercel_deployment_id)}/events?builds=1&direction=forward&limit=-1${since ? `&since=${since + 1}` : ''}`, { retries: 1, timeout: 15000 });
  } catch { return; }
  if (!Array.isArray(events)) return;
  const rows = [];
  let maxTs = since;
  for (const ev of events) {
    const created = Number(ev.created || ev.payload?.created || ev.payload?.date || 0);
    if (created && created <= since) continue;
    const text = String(ev.payload?.text ?? ev.text ?? '');
    if (!text.trim()) continue;
    const level = ev.type === 'stderr' ? (/\b(error|failed|err!|exception)\b/i.test(text) ? 'error' : 'warn') : ev.type === 'command' ? 'system' : /\berror\b/i.test(text) ? 'error' : 'info';
    rows.push({ deployment_id: dep.id, level, phase: 'building', message: redact(text, ctx), ts: new Date(created || Date.now()).toISOString() });
    if (created > maxTs) maxTs = created;
  }
  for (let i = 0; i < rows.length; i += 400) await supabase.from('deployment_logs').insert(rows.slice(i, i + 400));
  if (maxTs > since) await update(dep, { last_event_ts: maxTs });
}

async function failureHint(dep) {
  const { data } = await supabase.from('deployment_logs').select('message').eq('deployment_id', dep.id).order('id', { ascending: false }).limit(300);
  const text = (data || []).map((r) => r.message).join('\n');
  let m;
  if ((m = /No Output Directory named "([^"]+)"/i.exec(text))) return `Vercel looked for an output folder named "${m[1]}". Set the output directory to the folder your build actually produces.`;
  if (/Missing script: "?build/i.test(text)) return 'No "build" script exists in package.json. Add one or clear the build command.';
  if (/ERESOLVE|peer dep/i.test(text)) return 'Dependency conflict. Try the install command "npm install --legacy-peer-deps".';
  if (/Module not found|Cannot find module|Can't resolve/i.test(text)) return 'An import or dependency is missing. Check package.json and file name casing — Vercel builds on case-sensitive Linux.';
  if (/Type error|error TS\d+/i.test(text)) return 'TypeScript errors stopped the build. Fix the reported type errors and redeploy.';
  if (/node(\.js)? version|engines?\b.*node|Unsupported engine/i.test(text)) return 'The project requires a different Node.js version. Change it in project settings.';
  if (/ENOSPC|out of memory|heap/i.test(text)) return 'The build ran out of resources. Reduce bundle size or build steps.';
  if ((m = /Command "([^"]+)" exited with (\d+)/.exec(text))) return `The command "${m[1]}" exited with code ${m[2]}. Scroll to the first error in the build logs.`;
  return 'Review the build logs below for the first error message.';
}

async function build(dep, ctx) {
  const d = await vercel(ctx.auth, `/v13/deployments/${encodeURIComponent(dep.vercel_deployment_id)}`);
  await pullEvents(dep, ctx);
  const state = d.readyState || d.status;
  if (state === 'READY') {
    await update(dep, { status: 'checking', progress: 90, ready_at: new Date().toISOString() });
    await log(dep, 'success', 'Build completed on Vercel', 'building');
    await log(dep, 'info', 'Checking production URL…', 'checking');
    return true;
  }
  if (state === 'ERROR') {
    throw new WorkerError(d.errorCode || 'build_failed', d.errorMessage || 'The build failed on Vercel.', await failureHint(dep));
  }
  if (state === 'CANCELED') {
    await finish(dep, ctx, 'cancelled');
    return false;
  }
  const p = state === 'BUILDING' ? Math.min(86, Math.max(dep.progress, 55) + 2) : Math.max(dep.progress, 48);
  if (p !== dep.progress) await update(dep, { progress: p });
  return false;
}

async function check(dep, ctx) {
  const d = await vercel(ctx.auth, `/v13/deployments/${encodeURIComponent(dep.vercel_deployment_id)}`);
  const aliases = (d.alias || []).filter(Boolean);
  if (!aliases.length && Date.now() - new Date(dep.ready_at).getTime() < 40000) return false;
  const preferred = aliases.find((a) => a === `${ctx.project.slug}.vercel.app`)
    || aliases.filter((a) => a.endsWith('.vercel.app')).sort((a, b) => a.length - b.length)[0]
    || aliases[0];
  const live = preferred ? `https://${preferred}` : dep.url;
  let code = null;
  const host = live ? new URL(live).hostname : '';
  if (host.endsWith('.vercel.app')) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(live, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
      clearTimeout(t);
      code = r.status;
    } catch { code = null; }
  }
  if (code && code < 400) await log(dep, 'success', `Live URL responded with HTTP ${code}`, 'checking');
  else if (code === 401 || code === 403) await log(dep, 'warn', `The URL responded with HTTP ${code}. Vercel Deployment Protection may be enabled for this project.`, 'checking');
  else if (code === 404) await log(dep, 'warn', 'The URL responded with HTTP 404 — check the output directory or index.html location.', 'checking');
  else await log(dep, 'warn', 'Could not verify the URL yet — DNS may take a few seconds to propagate.', 'checking');
  await finish(dep, ctx, 'completed', { url: live, aliases });
  return false;
}

async function cancelRemote(dep, ctx) {
  if (!dep.vercel_deployment_id || !ctx.auth) return;
  try { await vercel(ctx.auth, `/v12/deployments/${encodeURIComponent(dep.vercel_deployment_id)}/cancel`, { method: 'PATCH', retries: 0 }); } catch { /* already finished */ }
}

async function attachPendingDomains(ctx) {
  const { data: pend } = await supabase.from('domains').select('*').eq('project_id', ctx.project.id).eq('type', 'custom').in('status', ['pending_attach', 'error']);
  for (const d of pend || []) {
    try {
      const r = await syncDomain(ctx.auth, ctx.project.vercel_project_id, d.hostname);
      await supabase.from('domains').update({ status: r.status, verified: r.verified, verification: r.verification || [], dns_records: r.dns_records, last_error: r.error || null, last_checked_at: new Date().toISOString() }).eq('id', d.id);
    } catch (e) {
      await supabase.from('domains').update({ status: 'error', last_error: vercelMessage(e), last_checked_at: new Date().toISOString() }).eq('id', d.id);
    }
  }
}

async function finish(dep, ctx, status, extra = {}) {
  const now = new Date();
  const started = new Date(dep.started_at || dep.created_at);
  await update(dep, { status, finished_at: now.toISOString(), duration_ms: now - started, progress: status === 'completed' ? 100 : dep.progress, ...(extra.url ? { url: extra.url } : {}) });
  const project = ctx.project;
  if (status === 'completed') {
    await supabase.from('projects').update({ status: 'live', production_url: extra.url, last_deployed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', project.id);
    for (const a of (extra.aliases || []).filter((x) => x.endsWith('.vercel.app')).slice(0, 4)) {
      const { data: ex } = await supabase.from('domains').select('id').eq('hostname', a).maybeSingle();
      if (!ex) await supabase.from('domains').insert({ project_id: project.id, user_id: project.user_id, hostname: a, type: 'generated', status: 'active', verified: true, last_checked_at: now.toISOString() });
    }
    await attachPendingDomains(ctx);
    await log(dep, 'success', `Deployment completed in ${Math.round((now - started) / 1000)}s → ${extra.url}`, 'completed');
    await notify(dep.user_id, 'deploy_success', `${project.name} is live`, `Deployed successfully to ${extra.url}`, `/app/deployments/${dep.id}`);
  } else if (status === 'cancelled') {
    await supabase.from('projects').update({ status: project.production_url ? 'live' : 'ready', updated_at: now.toISOString() }).eq('id', project.id);
    await log(dep, 'warn', 'Deployment cancelled', 'cancelled');
  }
}

async function handleFailure(dep, ctx, err) {
  let code = 'worker_error';
  let message = 'The deployment worker hit an unexpected error.';
  let hint = 'Retry the deployment. If the problem persists, contact support.';
  if (err instanceof WorkerError) {
    code = err.code; message = err.message; hint = err.hint || hint;
  } else if (err instanceof VercelError) {
    if ((err.status === 0 || err.status >= 500) && (dep.retry_count || 0) < 3) {
      await update(dep, { retry_count: (dep.retry_count || 0) + 1 });
      await log(dep, 'warn', `Temporary Vercel error — will retry automatically (${dep.retry_count}/3)`, dep.status);
      return;
    }
    code = err.code || 'vercel_error';
    message = vercelMessage(err);
    if (err.status === 401 || err.status === 403) {
      hint = 'Re-validate or replace the Vercel token on the Connections page.';
      if (ctx.conn) await supabase.from('vercel_connections').update({ status: 'invalid', last_error: message, last_checked_at: new Date().toISOString() }).eq('id', ctx.conn.id);
    }
  } else {
    const ref = crypto.randomBytes(4).toString('hex');
    console.error(`[worker:${ref}]`, err);
    message = `${message} (reference ${ref})`;
  }
  const now = new Date();
  try {
    await update(dep, { status: 'failed', error_code: String(code).slice(0, 80), error_message: String(message).slice(0, 600), error_hint: String(hint).slice(0, 600), finished_at: now.toISOString(), duration_ms: now - new Date(dep.started_at || dep.created_at) });
  } catch (e) {
    if (e instanceof Aborted) return;
    throw e;
  }
  await log(dep, 'error', message, 'failed');
  if (ctx.project) {
    await supabase.from('projects').update({ status: ctx.project.production_url ? 'live' : 'failed', updated_at: now.toISOString() }).eq('id', ctx.project.id);
    await notify(dep.user_id, 'deploy_failed', `Deployment failed — ${ctx.project.name}`, message, `/app/deployments/${dep.id}`);
  }
}

/** Force-cancel a job (called by user/admin). */
export async function cancelDeployment(depId) {
  const { data: dep } = await supabase.from('deployments').select('*').eq('id', depId).maybeSingle();
  if (!dep || !ACTIVE.includes(dep.status)) return dep;
  if (dep.vercel_deployment_id) {
    const { data: conn } = await supabase.from('vercel_connections').select('*').eq('id', dep.connection_id).maybeSingle();
    if (conn) { try { await vercel(authFor(conn), `/v12/deployments/${encodeURIComponent(dep.vercel_deployment_id)}/cancel`, { method: 'PATCH', retries: 0 }); } catch { /* ignore */ } }
  }
  const now = new Date();
  const { data } = await supabase.from('deployments').update({ status: 'cancelled', cancel_requested: true, finished_at: now.toISOString(), duration_ms: now - new Date(dep.started_at || dep.created_at), updated_at: now.toISOString() }).eq('id', depId).in('status', ACTIVE).select('*').maybeSingle();
  if (data) {
    await supabase.from('deployment_logs').insert({ deployment_id: depId, level: 'warn', phase: 'cancelled', message: 'Deployment cancelled by request', ts: now.toISOString() });
    const { data: project } = await supabase.from('projects').select('id,production_url').eq('id', dep.project_id).maybeSingle();
    if (project) await supabase.from('projects').update({ status: project.production_url ? 'live' : 'ready' }).eq('id', project.id);
  }
  return data || dep;
}

/** Periodic maintenance: time out stuck jobs, remove orphaned temp uploads, expire plans. */
export async function runCleanup() {
  const report = { advanced: 0, orphanSources: 0, imports: 0, proofsKept: true, rateLimits: 0, expiredPlans: 0 };
  const { data: active } = await supabase.from('deployments').select('id').in('status', ACTIVE).order('created_at').limit(15);
  for (const d of active || []) { await tick(d.id, 2500).catch(() => null); report.advanced++; }

  const { data: projects } = await supabase.from('projects').select('source_path');
  const referenced = new Set((projects || []).map((p) => p.source_path).filter(Boolean));
  const { data: roots } = await supabase.storage.from('sources').list('', { limit: 1000 });
  for (const r of roots || []) {
    if (r.id) continue;
    for (const [sub, maxAge] of [['sources', 86400000], ['imports', 3600000]]) {
      const { data: objs } = await supabase.storage.from('sources').list(`${r.name}/${sub}`, { limit: 1000 });
      const stale = (objs || []).filter((o) => o.id && Date.now() - new Date(o.created_at).getTime() > maxAge)
        .map((o) => `${r.name}/${sub}/${o.name}`).filter((p) => sub === 'imports' || !referenced.has(p));
      if (stale.length) {
        await supabase.storage.from('sources').remove(stale);
        if (sub === 'imports') report.imports += stale.length; else report.orphanSources += stale.length;
      }
    }
  }
  const { count } = await supabase.from('rate_limits').delete({ count: 'exact' }).lt('window_start', new Date(Date.now() - 86400000).toISOString());
  report.rateLimits = count || 0;
  const { data: exp } = await supabase.from('profiles').select('*').lt('plan_expires_at', new Date().toISOString()).limit(200);
  for (const p of exp || []) { await expirePlan(p); report.expiredPlans++; }
  await saveSetting('system', { last_cleanup_at: new Date().toISOString(), last_cleanup_report: report });
  return report;
}
