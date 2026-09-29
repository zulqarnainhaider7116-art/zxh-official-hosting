import { route, supabase, requireUser, fail, body, uuid, audit, rateLimit, paging, sleep } from './_lib/core.js';
import { tick, cancelDeployment, runCleanup, ACTIVE, TERMINAL } from './_lib/worker.js';

const PUBLIC_COLS = 'id,project_id,user_id,status,progress,url,inspector_url,vercel_deployment_id,source_label,target,attempt,files_total,files_uploaded,error_code,error_message,error_hint,started_at,building_at,ready_at,finished_at,duration_ms,created_at,updated_at,cancel_requested';

async function ownedDeployment(uid, id) {
  const { data } = await supabase.from('deployments').select(`${PUBLIC_COLS}, projects(id,name,slug,production_url,framework)`).eq('id', uuid(id, 'deployment id')).eq('user_id', uid).maybeSingle();
  if (!data) fail(404, 'Deployment not found.', 'not_found');
  return data;
}

export async function createDeployment(ctx, projectId, attempt = 1) {
  const uid = ctx.user.id;
  await rateLimit(`deploy:${uid}`, 30, 3600);
  const { data: project } = await supabase.from('projects').select('*').eq('id', uuid(projectId, 'project id')).eq('user_id', uid).maybeSingle();
  if (!project) fail(404, 'Project not found.', 'not_found');
  if (!project.connection_id) fail(400, 'Select a Vercel connection for this project first.', 'no_connection');
  if (!project.source_path) fail(400, 'Upload the project source before deploying.', 'no_source');
  const { data: conn } = await supabase.from('vercel_connections').select('id,status').eq('id', project.connection_id).eq('user_id', uid).maybeSingle();
  if (!conn) fail(400, 'The selected Vercel connection no longer exists.', 'no_connection');
  if (conn.status === 'invalid') fail(400, 'The selected Vercel token is invalid. Re-validate or replace it on the Connections page.', 'connection_invalid');
  const { count } = await supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('project_id', project.id).in('status', ACTIVE);
  if (count) fail(409, 'A deployment is already running for this project.', 'already_running');
  const { data: dep, error } = await supabase.from('deployments').insert({
    project_id: project.id,
    user_id: uid,
    connection_id: conn.id,
    status: 'queued',
    progress: 3,
    source_label: project.source_filename,
    target: 'production',
    attempt,
  }).select('id').single();
  if (error) throw error;
  await supabase.from('deployment_logs').insert({ deployment_id: dep.id, level: 'system', phase: 'queued', message: `Deployment queued (attempt ${attempt}) — ${project.source_filename || 'source'}`, ts: new Date().toISOString() });
  await supabase.from('projects').update({ status: 'deploying', updated_at: new Date().toISOString() }).eq('id', project.id);
  await audit(ctx, 'deployment.created', 'project', project.id, { deployment_id: dep.id, attempt });
  await tick(dep.id, 3500).catch(() => null);
  return ownedDeployment(uid, dep.id);
}

export default route(async (req, res) => {
  const action = req.query.action;

  if (action === 'cron') {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) fail(401, 'Unauthorized.', 'unauthorized');
    if (!secret) await rateLimit('cron:global', 12, 3600);
    const report = await runCleanup();
    return res.status(200).json({ ok: true, report });
  }

  const ctx = await requireUser(req);
  const uid = ctx.user.id;

  if (req.method === 'GET' && action === 'status') {
    const id = uuid(req.query.id);
    await ownedDeployment(uid, id);
    await tick(id, 6000).catch(() => null);
    const dep = await ownedDeployment(uid, id);
    const after = Number(req.query.after) || 0;
    const { data: logs } = await supabase.from('deployment_logs').select('id,ts,level,phase,message').eq('deployment_id', id).gt('id', after).order('id').limit(1000);
    return res.status(200).json({ deployment: dep, logs: logs || [] });
  }

  if (req.method === 'GET' && action === 'stream') {
    const id = uuid(req.query.id);
    await ownedDeployment(uid, id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    let after = Number(req.query.after) || 0;
    const end = Date.now() + 45000;
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('hello', { ok: true });
    while (Date.now() < end) {
      await tick(id, 5000).catch(() => null);
      const dep = await ownedDeployment(uid, id);
      let more = true;
      while (more) {
        const { data: logs } = await supabase.from('deployment_logs').select('id,ts,level,phase,message').eq('deployment_id', id).gt('id', after).order('id').limit(500);
        if (logs?.length) after = logs[logs.length - 1].id;
        send('update', { deployment: dep, logs: logs || [] });
        more = (logs?.length || 0) === 500;
      }
      if (TERMINAL.includes(dep.status)) { send('end', { status: dep.status }); break; }
      await sleep(1500);
    }
    return res.end();
  }

  if (req.method === 'GET' && req.query.id) {
    return res.status(200).json(await ownedDeployment(uid, req.query.id));
  }

  if (req.method === 'GET') {
    const pg = paging(req.query);
    let q = supabase.from('deployments').select(`${PUBLIC_COLS}, projects(id,name,slug)`, { count: 'exact' }).eq('user_id', uid).order('created_at', { ascending: false }).range(pg.from, pg.to);
    const f = req.query.status;
    if (f === 'success') q = q.eq('status', 'completed');
    else if (f === 'failed') q = q.eq('status', 'failed');
    else if (f === 'building') q = q.in('status', ACTIVE);
    else if (f === 'cancelled') q = q.eq('status', 'cancelled');
    if (req.query.project_id) q = q.eq('project_id', uuid(req.query.project_id));
    const { data, count, error } = await q;
    if (error) throw error;
    return res.status(200).json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
  }

  if (req.method === 'POST' && action === 'cancel') {
    const dep = await ownedDeployment(uid, body(req).id);
    if (!ACTIVE.includes(dep.status)) fail(400, 'This deployment is no longer running.', 'not_running');
    await cancelDeployment(dep.id);
    await audit(ctx, 'deployment.cancelled', 'project', dep.project_id, { deployment_id: dep.id });
    return res.status(200).json(await ownedDeployment(uid, dep.id));
  }

  if (req.method === 'POST' && action === 'retry') {
    const dep = await ownedDeployment(uid, body(req).id);
    if (!TERMINAL.includes(dep.status)) fail(400, 'This deployment is still running.', 'still_running');
    const created = await createDeployment(ctx, dep.project_id, (dep.attempt || 1) + 1);
    return res.status(201).json(created);
  }

  if (req.method === 'POST') {
    const created = await createDeployment(ctx, body(req).project_id, 1);
    return res.status(201).json(created);
  }

  fail(405, 'Method not allowed.', 'method');
});
