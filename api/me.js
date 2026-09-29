import { route, supabase, requireUser, getSettings, getQuota, getAdminRole, fail, str, body, paging, audit, uuid, publicConn } from './_lib/core.js';
import { tick, ACTIVE } from './_lib/worker.js';

export default route(async (req, res) => {
  const action = req.query.action || 'session';

  if (action === 'config') {
    const s = await getSettings();
    const [{ data: plans }, { data: ann }] = await Promise.all([
      supabase.from('plans').select('id,slug,name,price,currency,project_limit,duration_days,features,is_default,sort_order').eq('is_active', true).order('sort_order').order('price'),
      supabase.from('announcements').select('id,title,body,level,created_at').eq('is_active', true).order('created_at', { ascending: false }).limit(3),
    ]);
    res.setHeader('Cache-Control', 'public, max-age=20');
    return res.status(200).json({
      plans: plans || [],
      billing: { paid_enabled: !!s.billing.paid_enabled, unavailable_message: s.billing.unavailable_message },
      platform: { name: s.platform.name, support_email: s.platform.support_email, maintenance_message: s.platform.maintenance_message },
      limits: { max_upload_mb: s.limits.max_upload_mb, max_files: s.limits.max_files, max_unzipped_mb: s.limits.max_unzipped_mb },
      announcements: ann || [],
    });
  }

  const ctx = await requireUser(req, { allowSuspended: action === 'session' });
  const uid = ctx.user.id;

  if (action === 'session') {
    const [quota, role, { count: unread }] = await Promise.all([
      getQuota(ctx.profile),
      getAdminRole(uid),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null),
    ]);
    return res.status(200).json({
      profile: ctx.profile,
      plan: quota.plan,
      quota: { used: quota.used, limit: quota.limit },
      admin_role: role,
      unread: unread || 0,
      email_verified: !!ctx.user.email_confirmed_at,
      last_sign_in_at: ctx.user.last_sign_in_at,
      provider: ctx.user.app_metadata?.provider || 'email',
    });
  }

  if (action === 'dashboard') {
    const { data: act } = await supabase.from('deployments').select('id').eq('user_id', uid).in('status', ACTIVE).limit(3);
    await Promise.all((act || []).map((d) => tick(d.id, 2500).catch(() => null)));
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const head = (q) => q.then((r) => r.count || 0);
    const [quota, projects, recent, activeDeps, chart, conns, domains, activity, success, failed, total] = await Promise.all([
      getQuota(ctx.profile),
      supabase.from('projects').select('id,name,slug,framework,status,production_url,last_deployed_at,updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(6),
      supabase.from('deployments').select('id,status,url,created_at,duration_ms,project_id,projects(name)').eq('user_id', uid).order('created_at', { ascending: false }).limit(8),
      supabase.from('deployments').select('id,status,progress,created_at,project_id,projects(name)').eq('user_id', uid).in('status', ACTIVE).order('created_at', { ascending: false }),
      supabase.from('deployments').select('created_at,status').eq('user_id', uid).gte('created_at', since),
      supabase.from('vercel_connections').select('*').eq('user_id', uid).order('created_at'),
      head(supabase.from('domains').select('id', { count: 'exact', head: true }).eq('user_id', uid)),
      supabase.from('audit_logs').select('id,action,target_type,target_id,metadata,created_at').eq('actor_id', uid).order('created_at', { ascending: false }).limit(10),
      head(supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'completed')),
      head(supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'failed')),
      head(supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('user_id', uid)),
    ]);
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, success: 0, failed: 0, other: 0 });
    }
    for (const r of chart.data || []) {
      const day = days.find((x) => x.date === r.created_at.slice(0, 10));
      if (!day) continue;
      if (r.status === 'completed') day.success++; else if (r.status === 'failed') day.failed++; else day.other++;
    }
    return res.status(200).json({
      stats: { projects: quota.used, active: (activeDeps.data || []).length, success, failed, total, connections: (conns.data || []).length, domains },
      quota: { used: quota.used, limit: quota.limit },
      plan: quota.plan,
      projects: projects.data || [],
      recent: recent.data || [],
      active: activeDeps.data || [],
      chart: days,
      connections: (conns.data || []).map(publicConn),
      activity: activity.data || [],
    });
  }

  if (action === 'notifications') {
    if (req.method === 'POST') {
      const b = body(req);
      let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null);
      if (b.id) q = q.eq('id', uuid(b.id));
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const b = body(req);
      const { error } = await supabase.from('notifications').delete().eq('user_id', uid).eq('id', uuid(b.id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    const pg = paging(req.query);
    let q = supabase.from('notifications').select('*', { count: 'exact' }).eq('user_id', uid).order('created_at', { ascending: false }).range(pg.from, pg.to);
    if (req.query.unread === '1') q = q.is('read_at', null);
    const [{ data, count, error }, { count: unread }] = await Promise.all([
      q,
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null),
    ]);
    if (error) throw error;
    return res.status(200).json({ items: data || [], total: count || 0, unread: unread || 0, page: pg.p, size: pg.size });
  }

  if (action === 'profile' && req.method === 'PUT') {
    const b = body(req);
    const patch = {
      full_name: str(b.full_name, { name: 'Full name', max: 80 }),
      phone: str(b.phone, { name: 'Phone', max: 20, pattern: /^[+0-9 ()-]{7,20}$/, patternMsg: 'Enter a valid phone number.' }),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select('*').single();
    if (error) throw error;
    await audit(ctx, 'profile.updated', 'user', uid, {});
    return res.status(200).json({ profile: data });
  }

  if (action === 'security-event' && req.method === 'POST') {
    const ev = str(body(req).event, { name: 'Event', max: 40 });
    if (!['password_changed', 'signed_out_everywhere', 'verification_resent'].includes(ev)) fail(400, 'Unknown event.', 'validation');
    await audit(ctx, `security.${ev}`, 'user', uid, {});
    return res.status(200).json({ ok: true });
  }

  if (action === 'activity') {
    const pg = paging(req.query);
    const { data, count, error } = await supabase.from('audit_logs').select('id,action,target_type,target_id,metadata,ip,created_at', { count: 'exact' }).eq('actor_id', uid).order('created_at', { ascending: false }).range(pg.from, pg.to);
    if (error) throw error;
    return res.status(200).json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
  }

  fail(404, 'Unknown action.', 'not_found');
});
