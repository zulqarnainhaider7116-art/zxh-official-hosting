import { route, supabase, requireUser, fail, str, body, uuid, audit, rateLimit, getSettings, publicConn } from './_lib/core.js';
import { encrypt } from './_lib/crypto.js';
import { vercel, authFor, vercelMessage, VercelError } from './_lib/vercel.js';
import { ACTIVE } from './_lib/worker.js';

async function owned(uid, id) {
  const { data } = await supabase.from('vercel_connections').select('*').eq('id', uuid(id)).eq('user_id', uid).maybeSingle();
  if (!data) fail(404, 'Connection not found.', 'not_found');
  return data;
}

export default route(async (req, res) => {
  const ctx = await requireUser(req);
  const uid = ctx.user.id;
  const action = req.query.action;

  if (req.method === 'GET') {
    const [{ data, error }, { data: projects }] = await Promise.all([
      supabase.from('vercel_connections').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('projects').select('connection_id').eq('user_id', uid),
    ]);
    if (error) throw error;
    const counts = {};
    for (const p of projects || []) if (p.connection_id) counts[p.connection_id] = (counts[p.connection_id] || 0) + 1;
    return res.status(200).json((data || []).map((c) => ({ ...publicConn(c), projects_count: counts[c.id] || 0 })));
  }

  if (req.method === 'POST' && action === 'test') {
    const conn = await owned(uid, body(req).id);
    await rateLimit(`conn-test:${uid}`, 30, 3600);
    let status = 'connected';
    let lastError = null;
    let username = conn.vercel_username;
    try {
      const u = await vercel(authFor(conn), '/v2/user', { retries: 1, timeout: 10000 });
      username = u?.user?.username || username;
    } catch (e) {
      status = e instanceof VercelError && (e.status === 401 || e.status === 403) ? 'invalid' : 'error';
      lastError = vercelMessage(e);
    }
    const { data, error } = await supabase.from('vercel_connections').update({ status, last_error: lastError, vercel_username: username, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', conn.id).select('*').single();
    if (error) throw error;
    await audit(ctx, 'vercel.tested', 'vercel_connection', conn.id, { status });
    return res.status(200).json(publicConn(data));
  }

  if (req.method === 'POST') {
    await rateLimit(`conn-create:${uid}`, 10, 3600);
    const b = body(req);
    const name = str(b.name, { name: 'Connection name', required: true, min: 2, max: 60 });
    const token = str(b.token, { name: 'Access token', required: true, min: 16, max: 200, pattern: /^[A-Za-z0-9_\-.]+$/, patternMsg: 'The token contains invalid characters.' });
    const teamInput = str(b.team_id, { name: 'Team ID', max: 80, pattern: /^[A-Za-z0-9_\-]+$/, patternMsg: 'Team ID can contain letters, numbers, - and _.' });
    const s = await getSettings();
    const { count } = await supabase.from('vercel_connections').select('id', { count: 'exact', head: true }).eq('user_id', uid);
    if ((count || 0) >= s.limits.max_connections) fail(403, `You can connect up to ${s.limits.max_connections} Vercel accounts.`, 'connection_limit');

    let user;
    try {
      const u = await vercel({ token }, '/v2/user', { retries: 1, timeout: 12000 });
      user = u?.user;
      if (!user) throw new VercelError(401, 'invalid', 'invalid', null);
    } catch (e) {
      const invalid = e instanceof VercelError && (e.status === 401 || e.status === 403);
      await audit(ctx, 'vercel.connect_failed', 'vercel_connection', null, { reason: invalid ? 'invalid_token' : 'unreachable' });
      fail(400, invalid ? 'Vercel rejected this token. Make sure it is a valid, unexpired personal access token.' : vercelMessage(e), invalid ? 'invalid_token' : 'vercel_unreachable');
    }
    let teamId = null;
    let teamName = null;
    if (teamInput) {
      try {
        const t = await vercel({ token }, `/v2/teams/${encodeURIComponent(teamInput)}`, { retries: 1 });
        teamId = t.id; teamName = t.name || t.slug;
      } catch {
        fail(400, 'This token has no access to the specified team. Check the team ID or slug.', 'invalid_team');
      }
    }
    const { data, error } = await supabase.from('vercel_connections').insert({
      user_id: uid,
      name,
      token_encrypted: encrypt(token),
      token_last4: token.slice(-4),
      team_id: teamId,
      team_name: teamName,
      vercel_username: user.username || null,
      vercel_email: user.email || null,
      status: 'connected',
      last_checked_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    await audit(ctx, 'vercel.connected', 'vercel_connection', data.id, { name, username: user.username, team: teamName });
    return res.status(201).json(publicConn(data));
  }

  if (req.method === 'PUT') {
    const b = body(req);
    const conn = await owned(uid, b.id);
    const name = str(b.name, { name: 'Connection name', required: true, min: 2, max: 60 });
    const { data, error } = await supabase.from('vercel_connections').update({ name, updated_at: new Date().toISOString() }).eq('id', conn.id).select('*').single();
    if (error) throw error;
    await audit(ctx, 'vercel.renamed', 'vercel_connection', conn.id, { name });
    return res.status(200).json(publicConn(data));
  }

  if (req.method === 'DELETE') {
    const conn = await owned(uid, body(req).id);
    const { count } = await supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('connection_id', conn.id).in('status', ACTIVE);
    if (count) fail(409, 'This connection has deployments in progress. Wait for them to finish or cancel them first.', 'in_use');
    await supabase.from('projects').update({ connection_id: null }).eq('connection_id', conn.id).eq('user_id', uid);
    const { error } = await supabase.from('vercel_connections').delete().eq('id', conn.id);
    if (error) throw error;
    await audit(ctx, 'vercel.disconnected', 'vercel_connection', conn.id, { name: conn.name });
    return res.status(200).json({ ok: true });
  }

  fail(405, 'Method not allowed.', 'method');
});
