import crypto from 'node:crypto';
import { route, supabase, requireUser, fail, str, body, uuid, audit, rateLimit, getSettings, assertQuota, SLUG_RE, HOST_RE, ENV_KEY_RE, bool, int, publicConn } from './_lib/core.js';
import { encrypt, decrypt } from './_lib/crypto.js';
import { vercel, authFor, vercelMessage, VercelError, syncDomain, dnsRecords } from './_lib/vercel.js';
import { safeFetch } from './_lib/ssrf.js';
import { ACTIVE } from './_lib/worker.js';

const FRAMEWORKS = ['nextjs', 'vite', 'create-react-app', 'vue', 'nuxtjs', 'astro', 'angular', 'gatsby', 'remix', 'sveltekit-1', 'svelte', 'static'];
const NODE_VERSIONS = ['', '24.x', '22.x', '20.x', '18.x'];
const CMD_RE = /^[^\n\r`]*$/;
const DIR_RE = /^[A-Za-z0-9._\-/]*$/;

const LIST_COLS = 'id,name,slug,framework,status,production_url,connection_id,source_filename,source_size,file_count,last_deployed_at,created_at,updated_at';

async function ownedProject(uid, id, cols = '*') {
  const { data } = await supabase.from('projects').select(cols).eq('id', uuid(id, 'project id')).eq('user_id', uid).maybeSingle();
  if (!data) fail(404, 'Project not found.', 'not_found');
  return data;
}

async function ownedConn(uid, id) {
  if (!id) return null;
  const { data } = await supabase.from('vercel_connections').select('*').eq('id', uuid(id, 'connection id')).eq('user_id', uid).maybeSingle();
  if (!data) fail(400, 'The selected Vercel connection was not found.', 'invalid_connection');
  return data;
}

function sourcePathFor(uid, p) {
  const re = new RegExp(`^${uid}/sources/[0-9a-f-]{36}\\.zip$`);
  if (typeof p !== 'string' || !re.test(p)) fail(400, 'Invalid source reference. Upload the archive again.', 'invalid_source');
  return p;
}

async function assertSourceExists(uid, path) {
  const s = await getSettings();
  const name = path.split('/').pop();
  const { data } = await supabase.storage.from('sources').list(`${uid}/sources`, { search: name, limit: 5 });
  const obj = (data || []).find((o) => o.name === name);
  if (!obj) fail(400, 'The uploaded archive was not found. Please upload it again.', 'source_missing');
  const size = obj.metadata?.size || 0;
  if (size > s.limits.max_upload_mb * 1048576) fail(413, `Archive exceeds ${s.limits.max_upload_mb} MB.`, 'too_large');
  return size;
}

function cleanManifest(m, max) {
  if (!Array.isArray(m)) return [];
  return m.slice(0, max).filter((f) => f && typeof f.p === 'string' && f.p.length < 400).map((f) => ({ p: f.p, s: Math.max(0, Number(f.s) || 0) }));
}

function cleanAnalysis(a) {
  if (!a || typeof a !== 'object') return {};
  const json = JSON.stringify(a);
  if (json.length > 200000) return { truncated: true, framework: a.framework, warnings: (a.warnings || []).slice(0, 30) };
  return a;
}

function settingsFrom(b, partial = false) {
  const out = {};
  const set = (k, v) => { if (!partial || b[k] !== undefined) out[k] = v(); };
  set('name', () => str(b.name, { name: 'Project name', required: true, min: 2, max: 60 }));
  set('framework', () => { const f = str(b.framework, { name: 'Framework', max: 30 }) || 'static'; if (!FRAMEWORKS.includes(f)) fail(400, 'Unsupported framework.', 'validation'); return f; });
  set('build_command', () => str(b.build_command, { name: 'Build command', max: 200, pattern: CMD_RE, patternMsg: 'Build command must be a single line.' }) || null);
  set('install_command', () => str(b.install_command, { name: 'Install command', max: 200, pattern: CMD_RE, patternMsg: 'Install command must be a single line.' }) || null);
  set('output_directory', () => str(b.output_directory, { name: 'Output directory', max: 120, pattern: DIR_RE, patternMsg: 'Output directory contains invalid characters.' }) || null);
  set('root_directory', () => { const r = str(b.root_directory, { name: 'Root directory', max: 120, pattern: DIR_RE, patternMsg: 'Root directory contains invalid characters.' }); if (r.includes('..')) fail(400, 'Root directory cannot contain "..".', 'validation'); return r || null; });
  set('node_version', () => { const n = str(b.node_version, { name: 'Node version', max: 10 }); if (!NODE_VERSIONS.includes(n)) fail(400, 'Unsupported Node.js version.', 'validation'); return n || null; });
  set('package_manager', () => { const p = str(b.package_manager, { max: 10 }) || 'npm'; if (!['npm', 'yarn', 'pnpm', 'bun', 'none'].includes(p)) fail(400, 'Unsupported package manager.', 'validation'); return p; });
  return out;
}

export async function checkSlug(slug, { uid, projectId, currentSlug, conn }) {
  if (!SLUG_RE.test(slug) || slug.includes('--')) return { status: 'invalid', message: 'Use 3–50 lowercase letters, numbers and single hyphens. Start and end with a letter or number.' };
  if (currentSlug && slug === currentSlug) return { status: 'available', message: 'This is the project’s current name.' };
  const s = await getSettings();
  if ((s.limits.reserved_subdomains || []).includes(slug)) return { status: 'reserved', message: 'This name is reserved by the platform.' };
  const { data: taken } = await supabase.from('projects').select('id,user_id').eq('slug', slug).limit(1);
  if (taken?.length && taken[0].id !== projectId) {
    return { status: 'used', message: taken[0].user_id === uid ? 'You already use this name for another project.' : 'This name is already used on DeployForge.' };
  }
  if (conn) {
    try {
      await vercel(authFor(conn), `/v9/projects/${encodeURIComponent(slug)}`, { retries: 0, timeout: 8000 });
      return { status: 'used', message: 'A project with this name already exists in the selected Vercel account.' };
    } catch (e) {
      if (e instanceof VercelError && e.status === 401) {
        return { status: 'error', message: 'Could not check the Vercel account — the connection token is invalid.' };
      }
    }
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://${slug}.vercel.app/`, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal });
    clearTimeout(t);
    const err = r.headers.get('x-vercel-error');
    if (!(r.status === 404 && err === 'DEPLOYMENT_NOT_FOUND')) {
      return { status: 'used', message: `${slug}.vercel.app is already taken on Vercel. Choose another name for a clean URL.` };
    }
  } catch { /* network issue: fall through as available but unverified */ }
  return { status: 'available', message: `${slug}.vercel.app is available.` };
}

async function envList(projectId) {
  const { data } = await supabase.from('environment_variables').select('*').eq('project_id', projectId).order('key');
  return (data || []).map((e) => {
    let value = null;
    if (!e.is_secret) { try { value = decrypt(e.value_encrypted); } catch { value = null; } }
    return { id: e.id, key: e.key, is_secret: e.is_secret, value, value_hint: e.is_secret ? '••••••••••' : null, updated_at: e.updated_at, created_at: e.created_at };
  });
}

async function upsertEnv(project, uid, key, value, isSecret) {
  const { data: ex } = await supabase.from('environment_variables').select('id').eq('project_id', project.id).eq('key', key).maybeSingle();
  const row = { key, value_encrypted: encrypt(value), is_secret: isSecret, updated_at: new Date().toISOString() };
  if (ex) await supabase.from('environment_variables').update(row).eq('id', ex.id);
  else await supabase.from('environment_variables').insert({ ...row, project_id: project.id, user_id: uid });
}

export default route(async (req, res) => {
  const ctx = await requireUser(req);
  const uid = ctx.user.id;
  const action = req.query.action;
  const s = await getSettings();

  // ---------------- GET ----------------
  if (req.method === 'GET' && action === 'check-subdomain') {
    await rateLimit(`slug:${uid}`, 60, 60);
    const slug = String(req.query.slug || '').trim().toLowerCase();
    let projectId = null;
    let currentSlug = null;
    if (req.query.project_id) {
      const p = await ownedProject(uid, req.query.project_id, 'id,slug');
      projectId = p.id; currentSlug = p.slug;
    }
    const conn = req.query.connection_id ? await ownedConn(uid, req.query.connection_id) : null;
    const r = await checkSlug(slug, { uid, projectId, currentSlug, conn });
    if (r.status !== 'available' && SLUG_RE.test(slug)) r.suggestion = `${slug.slice(0, 44)}-${crypto.randomBytes(2).toString('hex')}`;
    return res.status(200).json(r);
  }

  if (req.method === 'GET' && action === 'source-url') {
    const p = await ownedProject(uid, req.query.id, 'id,source_path');
    if (!p.source_path) fail(404, 'This project has no uploaded source.', 'no_source');
    const { data, error } = await supabase.storage.from('sources').createSignedUrl(p.source_path, 300);
    if (error) fail(404, 'The source archive is no longer available.', 'source_missing');
    return res.status(200).json({ url: data.signedUrl });
  }

  if (req.method === 'GET' && action === 'domains') {
    const { data, error } = await supabase.from('domains').select('*, projects(name,slug)').eq('user_id', uid).order('created_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  }

  if (req.method === 'GET' && req.query.id) {
    const project = await ownedProject(uid, req.query.id);
    const [{ data: conn }, { data: deployments }, { data: domains }, env, { data: activity }] = await Promise.all([
      project.connection_id ? supabase.from('vercel_connections').select('*').eq('id', project.connection_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('deployments').select('id,status,url,source_label,created_at,finished_at,duration_ms,error_message,vercel_deployment_id,attempt,progress').eq('project_id', project.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('domains').select('*').eq('project_id', project.id).order('created_at'),
      envList(project.id),
      supabase.from('audit_logs').select('id,action,metadata,created_at,actor_email').eq('target_id', project.id).order('created_at', { ascending: false }).limit(40),
    ]);
    return res.status(200).json({ project, connection: publicConn(conn), deployments: deployments || [], domains: domains || [], env, activity: activity || [] });
  }

  if (req.method === 'GET') {
    let q = supabase.from('projects').select(LIST_COLS).eq('user_id', uid).order('updated_at', { ascending: false });
    const search = String(req.query.q || '').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 50);
    if (search) q = q.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    const ids = (data || []).map((p) => p.id);
    const { data: deps } = ids.length ? await supabase.from('deployments').select('id,project_id,status,created_at').in('project_id', ids).order('created_at', { ascending: false }).limit(500) : { data: [] };
    const last = {};
    for (const d of deps || []) if (!last[d.project_id]) last[d.project_id] = d;
    return res.status(200).json((data || []).map((p) => ({ ...p, last_deployment: last[p.id] || null })));
  }

  // ---------------- POST ----------------
  if (req.method === 'POST' && action === 'upload-url') {
    await rateLimit(`upload:${uid}`, 40, 3600);
    const b = body(req);
    const filename = str(b.filename, { name: 'File name', required: true, max: 200 });
    const size = int(b.size, { name: 'File size', min: 22, max: s.limits.max_upload_mb * 1048576 });
    if (!/\.zip$/i.test(filename)) fail(400, 'Only .zip archives are accepted.', 'invalid_type');
    const path = `${uid}/sources/${crypto.randomUUID()}.zip`;
    const { data, error } = await supabase.storage.from('sources').createSignedUploadUrl(path);
    if (error) throw error;
    return res.status(200).json({ path, signedUrl: data.signedUrl, token: data.token, size });
  }

  if (req.method === 'POST' && action === 'import-url') {
    await rateLimit(`import:${uid}`, 10, 3600);
    let url = str(body(req).url, { name: 'URL', required: true, max: 500 });
    const gh = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:tree\/([\w./-]+))?$/.exec(url);
    if (gh) url = `https://codeload.github.com/${gh[1]}/${gh[2]}/zip/${gh[3] ? `refs/heads/${gh[3]}` : 'HEAD'}`;
    const { buffer } = await safeFetch(url, { maxBytes: s.limits.max_upload_mb * 1048576, allowedHosts: s.limits.import_hosts || [] });
    if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) fail(400, 'The downloaded file is not a ZIP archive.', 'invalid_zip');
    const path = `${uid}/imports/${crypto.randomUUID()}.zip`;
    const up = await supabase.storage.from('sources').upload(path, buffer, { contentType: 'application/zip' });
    if (up.error) throw up.error;
    const { data: signed } = await supabase.storage.from('sources').createSignedUrl(path, 600);
    await audit(ctx, 'source.imported', 'source', null, { host: new URL(url).hostname, bytes: buffer.length });
    const filename = gh ? `${gh[2]}.zip` : (new URL(url).pathname.split('/').pop() || 'import.zip');
    return res.status(200).json({ url: signed.signedUrl, filename: filename.endsWith('.zip') ? filename : `${filename}.zip`, size: buffer.length });
  }

  if (req.method === 'POST' && action === 'duplicate') {
    const src = await ownedProject(uid, body(req).id);
    await assertQuota(ctx);
    let slug = `${src.slug.slice(0, 40)}-copy`;
    const { data: clash } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    if (clash) slug = `${src.slug.slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`;
    let sourcePath = null;
    if (src.source_path) {
      sourcePath = `${uid}/sources/${crypto.randomUUID()}.zip`;
      const cp = await supabase.storage.from('sources').copy(src.source_path, sourcePath);
      if (cp.error) sourcePath = null;
    }
    const { id, created_at, updated_at, vercel_project_id, vercel_project_name, production_url, last_deployed_at, ...rest } = src;
    const { data: copy, error } = await supabase.from('projects').insert({ ...rest, name: `${src.name} (copy)`.slice(0, 60), slug, source_path: sourcePath, status: 'ready' }).select('*').single();
    if (error) throw error;
    const { data: envs } = await supabase.from('environment_variables').select('key,value_encrypted,is_secret').eq('project_id', src.id);
    if (envs?.length) await supabase.from('environment_variables').insert(envs.map((e) => ({ ...e, project_id: copy.id, user_id: uid })));
    await audit(ctx, 'project.duplicated', 'project', copy.id, { from: src.id, name: copy.name });
    return res.status(201).json(copy);
  }

  if (req.method === 'POST' && action === 'env') {
    const b = body(req);
    const project = await ownedProject(uid, b.project_id, 'id,vercel_project_id');
    const key = str(b.key, { name: 'Key', required: true, max: 128, pattern: ENV_KEY_RE, patternMsg: 'Keys may contain letters, numbers and underscores and cannot start with a number.' });
    if (typeof b.value !== 'string' || !b.value.length) fail(400, 'Value is required.', 'validation');
    if (b.value.length > 8000) fail(400, 'Value is too long (max 8000 characters).', 'validation');
    const { count } = await supabase.from('environment_variables').select('id', { count: 'exact', head: true }).eq('project_id', project.id);
    if ((count || 0) >= 100) fail(400, 'A project can have at most 100 environment variables.', 'validation');
    await upsertEnv(project, uid, key, b.value, b.is_secret !== false);
    await audit(ctx, 'env.saved', 'project', project.id, { key });
    return res.status(200).json(await envList(project.id));
  }

  if (req.method === 'POST' && action === 'domain') {
    const b = body(req);
    const project = await ownedProject(uid, b.project_id);
    const host = str(b.hostname, { name: 'Domain', required: true, max: 253, lower: true, pattern: HOST_RE, patternMsg: 'Enter a valid domain such as www.example.com.' });
    if (host.endsWith('.vercel.app') || host.endsWith('.vercel.com')) fail(400, 'Vercel-owned domains are generated automatically.', 'validation');
    const { data: ex } = await supabase.from('domains').select('id').eq('hostname', host).maybeSingle();
    if (ex) fail(409, 'This domain is already added to a project.', 'domain_used');
    const { count } = await supabase.from('domains').select('id', { count: 'exact', head: true }).eq('project_id', project.id).eq('type', 'custom');
    if ((count || 0) >= 10) fail(400, 'A project can have at most 10 custom domains.', 'validation');
    let row = { project_id: project.id, user_id: uid, hostname: host, type: 'custom', status: 'pending_attach', verified: false, dns_records: dnsRecords(host), last_checked_at: new Date().toISOString() };
    if (project.vercel_project_id && project.connection_id) {
      const conn = await ownedConn(uid, project.connection_id);
      try {
        const r = await syncDomain(authFor(conn), project.vercel_project_id, host);
        row = { ...row, status: r.status, verified: r.verified, verification: r.verification || [], dns_records: r.dns_records, last_error: r.error || null };
      } catch (e) {
        fail(400, vercelMessage(e), 'domain_failed');
      }
    }
    const { data, error } = await supabase.from('domains').insert(row).select('*').single();
    if (error) throw error;
    await audit(ctx, 'domain.added', 'project', project.id, { hostname: host });
    return res.status(201).json(data);
  }

  if (req.method === 'POST' && action === 'domain-verify') {
    await rateLimit(`domain-verify:${uid}`, 60, 3600);
    const { data: d } = await supabase.from('domains').select('*').eq('id', uuid(body(req).id)).eq('user_id', uid).maybeSingle();
    if (!d) fail(404, 'Domain not found.', 'not_found');
    const project = await ownedProject(uid, d.project_id);
    if (d.type === 'generated') {
      let ok = false;
      try { const r = await fetch(`https://${d.hostname}/`, { method: 'HEAD', redirect: 'manual' }); ok = r.status < 500 && r.headers.get('x-vercel-error') !== 'DEPLOYMENT_NOT_FOUND'; } catch { ok = false; }
      const { data } = await supabase.from('domains').update({ status: ok ? 'active' : 'error', last_checked_at: new Date().toISOString() }).eq('id', d.id).select('*').single();
      return res.status(200).json(data);
    }
    if (!project.vercel_project_id || !project.connection_id) {
      const { data } = await supabase.from('domains').update({ status: 'pending_attach', last_checked_at: new Date().toISOString() }).eq('id', d.id).select('*').single();
      return res.status(200).json({ ...data, note: 'Deploy the project once — the domain will be attached automatically.' });
    }
    const conn = await ownedConn(uid, project.connection_id);
    let patch;
    try {
      const r = await syncDomain(authFor(conn), project.vercel_project_id, d.hostname);
      patch = { status: r.status, verified: r.verified, verification: r.verification || [], dns_records: r.dns_records, last_error: r.error || null };
    } catch (e) {
      patch = { status: 'error', last_error: vercelMessage(e) };
    }
    const { data } = await supabase.from('domains').update({ ...patch, last_checked_at: new Date().toISOString() }).eq('id', d.id).select('*').single();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    await rateLimit(`project-create:${uid}`, 30, 3600);
    await assertQuota(ctx);
    const b = body(req);
    const cfg = settingsFrom(b);
    const slug = str(b.slug, { name: 'Subdomain', required: true, max: 50, lower: true });
    const conn = await ownedConn(uid, b.connection_id);
    if (!conn) fail(400, 'Select a Vercel connection.', 'no_connection');
    const check = await checkSlug(slug, { uid, conn });
    if (check.status !== 'available') fail(409, check.message, `subdomain_${check.status}`);
    const sourcePath = sourcePathFor(uid, b.source_path);
    const size = await assertSourceExists(uid, sourcePath);
    const env = Array.isArray(b.env) ? b.env.slice(0, 100) : [];
    for (const e of env) {
      str(e.key, { name: 'Environment key', required: true, max: 128, pattern: ENV_KEY_RE, patternMsg: `Invalid environment key "${String(e.key).slice(0, 40)}".` });
      if (typeof e.value !== 'string' || !e.value.length) fail(400, `Environment variable ${e.key} needs a value.`, 'validation');
      if (e.value.length > 8000) fail(400, `Environment variable ${e.key} is too long.`, 'validation');
    }
    let customDomain = null;
    if (b.custom_domain) {
      customDomain = str(b.custom_domain, { name: 'Custom domain', max: 253, lower: true, pattern: HOST_RE, patternMsg: 'Enter a valid custom domain.' });
      if (customDomain.endsWith('.vercel.app')) fail(400, 'Vercel-owned domains are generated automatically.', 'validation');
      const { data: ex } = await supabase.from('domains').select('id').eq('hostname', customDomain).maybeSingle();
      if (ex) fail(409, 'This custom domain is already used by another project.', 'domain_used');
    }
    const { data: project, error } = await supabase.from('projects').insert({
      ...cfg,
      user_id: uid,
      slug,
      connection_id: conn.id,
      source_path: sourcePath,
      source_filename: str(b.source_filename, { max: 200 }) || 'source.zip',
      source_size: size,
      file_count: int(b.file_count, { min: 0, max: 100000, def: 0 }),
      manifest: cleanManifest(b.manifest, s.limits.max_files),
      analysis: cleanAnalysis(b.analysis),
      status: 'ready',
    }).select('*').single();
    if (error) {
      if (error.code === '23505') fail(409, 'This subdomain was just taken. Choose another.', 'subdomain_used');
      throw error;
    }
    const seen = new Set();
    for (const e of env) { if (seen.has(e.key)) continue; seen.add(e.key); await upsertEnv(project, uid, e.key.trim(), e.value, e.is_secret !== false); }
    if (customDomain) await supabase.from('domains').insert({ project_id: project.id, user_id: uid, hostname: customDomain, type: 'custom', status: 'pending_attach', verified: false, dns_records: dnsRecords(customDomain) });
    await audit(ctx, 'project.created', 'project', project.id, { name: project.name, slug, framework: project.framework, env_count: seen.size });
    return res.status(201).json(project);
  }

  // ---------------- PUT ----------------
  if (req.method === 'PUT') {
    const b = body(req);
    const project = await ownedProject(uid, b.id);
    const patch = settingsFrom(b, true);
    if (b.connection_id !== undefined) {
      const conn = await ownedConn(uid, b.connection_id || null);
      patch.connection_id = conn?.id || null;
      if (project.vercel_project_id && conn?.id !== project.connection_id) {
        patch.vercel_project_id = null; // new account → a new Vercel project will be created on next deploy
        patch.vercel_project_name = null;
      }
    }
    if (b.slug !== undefined && b.slug !== project.slug) {
      if (project.vercel_project_id && patch.vercel_project_id !== null) fail(400, 'The subdomain cannot change after the first deployment. Add a custom domain instead.', 'slug_locked');
      const slug = str(b.slug, { name: 'Subdomain', required: true, max: 50, lower: true });
      const conn = patch.connection_id !== undefined ? (patch.connection_id ? await ownedConn(uid, patch.connection_id) : null) : (project.connection_id ? await ownedConn(uid, project.connection_id) : null);
      const check = await checkSlug(slug, { uid, projectId: project.id, conn });
      if (check.status !== 'available') fail(409, check.message, `subdomain_${check.status}`);
      patch.slug = slug;
    }
    let oldSource = null;
    if (b.source_path !== undefined && b.source_path !== project.source_path) {
      const sp = sourcePathFor(uid, b.source_path);
      patch.source_size = await assertSourceExists(uid, sp);
      patch.source_path = sp;
      patch.source_filename = str(b.source_filename, { max: 200 }) || 'source.zip';
      patch.file_count = int(b.file_count, { min: 0, max: 100000, def: 0 });
      patch.manifest = cleanManifest(b.manifest, s.limits.max_files);
      patch.analysis = cleanAnalysis(b.analysis);
      oldSource = project.source_path;
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('projects').update(patch).eq('id', project.id).select('*').single();
    if (error) throw error;
    if (oldSource) await supabase.storage.from('sources').remove([oldSource]);
    const changed = Object.keys(patch).filter((k) => !['updated_at', 'manifest', 'analysis'].includes(k));
    await audit(ctx, oldSource ? 'project.source_replaced' : 'project.updated', 'project', project.id, { fields: changed });
    return res.status(200).json(data);
  }

  // ---------------- DELETE ----------------
  if (req.method === 'DELETE' && action === 'env') {
    const b = body(req);
    const project = await ownedProject(uid, b.project_id);
    const { data: env } = await supabase.from('environment_variables').select('*').eq('id', uuid(b.id)).eq('project_id', project.id).maybeSingle();
    if (!env) fail(404, 'Variable not found.', 'not_found');
    await supabase.from('environment_variables').delete().eq('id', env.id);
    let remote = 'skipped';
    if (project.vercel_project_id && project.connection_id) {
      try {
        const conn = await ownedConn(uid, project.connection_id);
        const auth = authFor(conn);
        const list = await vercel(auth, `/v9/projects/${encodeURIComponent(project.vercel_project_id)}/env`);
        for (const e of (list?.envs || []).filter((x) => x.key === env.key)) await vercel(auth, `/v9/projects/${encodeURIComponent(project.vercel_project_id)}/env/${e.id}`, { method: 'DELETE' });
        remote = 'removed';
      } catch { remote = 'failed'; }
    }
    await audit(ctx, 'env.deleted', 'project', project.id, { key: env.key, remote });
    return res.status(200).json({ env: await envList(project.id), remote });
  }

  if (req.method === 'DELETE' && action === 'domain') {
    const { data: d } = await supabase.from('domains').select('*').eq('id', uuid(body(req).id)).eq('user_id', uid).maybeSingle();
    if (!d) fail(404, 'Domain not found.', 'not_found');
    const project = await ownedProject(uid, d.project_id);
    if (d.type === 'custom' && project.vercel_project_id && project.connection_id) {
      try {
        const conn = await ownedConn(uid, project.connection_id);
        await vercel(authFor(conn), `/v9/projects/${encodeURIComponent(project.vercel_project_id)}/domains/${encodeURIComponent(d.hostname)}`, { method: 'DELETE' });
      } catch (e) { if (!(e instanceof VercelError && e.status === 404)) fail(400, `Could not remove the domain from Vercel: ${vercelMessage(e)}`, 'domain_failed'); }
    }
    await supabase.from('domains').delete().eq('id', d.id);
    await audit(ctx, 'domain.removed', 'project', project.id, { hostname: d.hostname });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const b = body(req);
    const project = await ownedProject(uid, b.id);
    const { count } = await supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('project_id', project.id).in('status', ACTIVE);
    if (count) fail(409, 'A deployment is in progress. Cancel it before deleting the project.', 'in_progress');
    let remote = 'kept';
    if (bool(b.delete_remote) && project.vercel_project_id && project.connection_id) {
      try {
        const conn = await ownedConn(uid, project.connection_id);
        await vercel(authFor(conn), `/v9/projects/${encodeURIComponent(project.vercel_project_id)}`, { method: 'DELETE' });
        remote = 'deleted';
      } catch (e) { remote = e instanceof VercelError && e.status === 404 ? 'deleted' : 'failed'; }
    }
    if (project.source_path) await supabase.storage.from('sources').remove([project.source_path]);
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) throw error;
    await audit(ctx, 'project.deleted', 'project', project.id, { name: project.name, remote });
    return res.status(200).json({ ok: true, remote });
  }

  fail(405, 'Method not allowed.', 'method');
});
