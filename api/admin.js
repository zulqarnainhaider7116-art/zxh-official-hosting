import { route, supabase, requireAdmin, fail, str, body, uuid, audit, paging, likeSafe, getSettings, saveSetting, notify, int, num, bool, publicConn, getDefaultPlan } from './_lib/core.js';
import { keySource } from './_lib/crypto.js';
import { runCleanup, cancelDeployment, ACTIVE } from './_lib/worker.js';

const head = (q) => q.then((r) => r.count || 0);

function cleanList(v, re, max = 200) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x).trim().toLowerCase()).filter((x) => x && re.test(x)))].slice(0, max);
}

function validateSettings(key, v, current) {
  const t = (x, o) => str(x, o);
  if (key === 'billing') return { paid_enabled: bool(v.paid_enabled), unavailable_message: t(v.unavailable_message, { name: 'Unavailable message', max: 300 }) || current.unavailable_message };
  if (key === 'payment') {
    const url = t(v.send_payment_url, { name: 'Send payment link', max: 300 });
    if (url && !/^https:\/\//i.test(url)) fail(400, 'The send-payment link must start with https://', 'validation');
    return {
      available: bool(v.available),
      method_name: t(v.method_name, { name: 'Payment method name', required: true, max: 60 }),
      account_number: t(v.account_number, { name: 'Account number', max: 80 }),
      account_holder: t(v.account_holder, { name: 'Account holder', max: 80 }),
      instructions: t(v.instructions, { name: 'Instructions', max: 1200 }),
      require_proof: bool(v.require_proof),
      require_reference: bool(v.require_reference),
      send_payment_url: url,
    };
  }
  if (key === 'limits') return {
    max_upload_mb: int(v.max_upload_mb, { name: 'Max upload (MB)', min: 1, max: 50 }),
    max_unzipped_mb: int(v.max_unzipped_mb, { name: 'Max unpacked size (MB)', min: 1, max: 300 }),
    max_files: int(v.max_files, { name: 'Max files', min: 10, max: 15000 }),
    deploy_timeout_min: int(v.deploy_timeout_min, { name: 'Deploy timeout', min: 5, max: 90 }),
    max_connections: int(v.max_connections, { name: 'Max Vercel connections', min: 1, max: 50 }),
    reserved_subdomains: cleanList(v.reserved_subdomains, /^[a-z0-9-]{1,50}$/),
    import_hosts: cleanList(v.import_hosts, /^[a-z0-9.-]{3,100}$/, 30),
  };
  if (key === 'platform') return {
    name: t(v.name, { name: 'Platform name', required: true, max: 40 }),
    support_email: t(v.support_email, { name: 'Support email', max: 120, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, patternMsg: 'Enter a valid support email.' }),
    maintenance_message: t(v.maintenance_message, { name: 'Banner message', max: 300 }),
  };
  fail(400, 'Unknown settings group.', 'validation');
}

export default route(async (req, res) => {
  const action = req.query.action || 'stats';
  const isWrite = req.method !== 'GET';
  const ctx = await requireAdmin(req, isWrite ? (action === 'user-role' ? 'owner' : 'write') : 'read');
  const q = req.query;
  const b = isWrite ? body(req) : {};

  switch (action) {
    case 'whoami':
      return res.json({ role: ctx.role, email: ctx.user.email });

    case 'stats': {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [users, suspended, projects, deployments, success, failed, active, pending, subs, conns, domains, depRows, userRows, approved] = await Promise.all([
        head(supabase.from('profiles').select('id', { count: 'exact', head: true })),
        head(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'suspended')),
        head(supabase.from('projects').select('id', { count: 'exact', head: true })),
        head(supabase.from('deployments').select('id', { count: 'exact', head: true })),
        head(supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('status', 'completed')),
        head(supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
        head(supabase.from('deployments').select('id', { count: 'exact', head: true }).in('status', ACTIVE)),
        head(supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        head(supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active')),
        head(supabase.from('vercel_connections').select('id', { count: 'exact', head: true })),
        head(supabase.from('domains').select('id', { count: 'exact', head: true })),
        supabase.from('deployments').select('created_at,status').gte('created_at', since),
        supabase.from('profiles').select('created_at').gte('created_at', since),
        supabase.from('payment_requests').select('amount,currency').eq('status', 'approved'),
      ]);
      const days = [];
      for (let i = 13; i >= 0; i--) days.push({ date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), deployments: 0, failed: 0, signups: 0 });
      for (const r of depRows.data || []) { const d = days.find((x) => x.date === r.created_at.slice(0, 10)); if (d) { d.deployments++; if (r.status === 'failed') d.failed++; } }
      for (const r of userRows.data || []) { const d = days.find((x) => x.date === r.created_at.slice(0, 10)); if (d) d.signups++; }
      const revenue = {};
      for (const r of approved.data || []) revenue[r.currency] = (revenue[r.currency] || 0) + Number(r.amount);
      const { data: recentAudit } = await supabase.from('audit_logs').select('id,action,actor_email,target_type,created_at').order('created_at', { ascending: false }).limit(8);
      return res.json({ users, suspended, projects, deployments, success, failed, active, pending_payments: pending, active_subscriptions: subs, connections: conns, domains, chart: days, revenue, recent_audit: recentAudit || [] });
    }

    case 'users': {
      const pg = paging(q);
      let query = supabase.from('profiles').select('*, plans(name)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      const s = likeSafe(q.q);
      if (s) query = query.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
      if (q.status === 'active' || q.status === 'suspended') query = query.eq('status', q.status);
      const { data, count, error } = await query;
      if (error) throw error;
      const ids = (data || []).map((u) => u.id);
      const [{ data: pr }, { data: roles }] = await Promise.all([
        ids.length ? supabase.from('projects').select('user_id').in('user_id', ids) : { data: [] },
        ids.length ? supabase.from('admin_roles').select('user_id,role').in('user_id', ids) : { data: [] },
      ]);
      const pc = {}; for (const p of pr || []) pc[p.user_id] = (pc[p.user_id] || 0) + 1;
      const rm = {}; for (const r of roles || []) rm[r.user_id] = r.role;
      return res.json({ items: (data || []).map((u) => ({ ...u, projects_count: pc[u.id] || 0, admin_role: rm[u.id] || null })), total: count || 0, page: pg.p, size: pg.size });
    }

    case 'user': {
      const id = uuid(q.id);
      const { data: user } = await supabase.from('profiles').select('*, plans(name,project_limit)').eq('id', id).maybeSingle();
      if (!user) fail(404, 'User not found.', 'not_found');
      const [projects, deployments, subs, payments, conns, activity, role] = await Promise.all([
        supabase.from('projects').select('id,name,slug,status,production_url,framework,created_at').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('deployments').select('id,status,url,created_at,duration_ms, projects(name)').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('subscriptions').select('*, plans(name)').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('payment_requests').select('id,amount,currency,status,reference_id,created_at, plans(name)').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('vercel_connections').select('*').eq('user_id', id),
        supabase.from('audit_logs').select('id,action,target_type,created_at,ip').eq('actor_id', id).order('created_at', { ascending: false }).limit(30),
        supabase.from('admin_roles').select('role').eq('user_id', id).maybeSingle(),
      ]);
      return res.json({ user, admin_role: role.data?.role || null, projects: projects.data || [], deployments: deployments.data || [], subscriptions: subs.data || [], payments: payments.data || [], connections: (conns.data || []).map(publicConn), activity: activity.data || [] });
    }

    case 'user-update': {
      const id = uuid(b.id);
      const { data: target } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
      if (!target) fail(404, 'User not found.', 'not_found');
      const { data: targetRole } = await supabase.from('admin_roles').select('role').eq('user_id', id).maybeSingle();
      const patch = { updated_at: new Date().toISOString() };
      if (b.status !== undefined) {
        if (!['active', 'suspended'].includes(b.status)) fail(400, 'Invalid status.', 'validation');
        if (id === ctx.user.id) fail(400, 'You cannot change your own account status.', 'validation');
        if (targetRole?.role === 'owner' && ctx.role !== 'owner') fail(403, 'Only an owner can suspend an owner.', 'forbidden');
        patch.status = b.status;
        patch.suspended_reason = b.status === 'suspended' ? str(b.reason, { name: 'Reason', max: 300 }) || null : null;
      }
      if (b.plan_id !== undefined) {
        const { data: plan } = await supabase.from('plans').select('*').eq('id', int(b.plan_id, { name: 'Plan', min: 1 })).maybeSingle();
        if (!plan) fail(400, 'Plan not found.', 'validation');
        patch.plan_id = plan.id;
        patch.plan_expires_at = b.plan_expires_at ? new Date(b.plan_expires_at).toISOString() : null;
      }
      if (b.project_limit_override !== undefined) patch.project_limit_override = b.project_limit_override === null || b.project_limit_override === '' ? null : int(b.project_limit_override, { name: 'Project limit', min: 0, max: 10000 });
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      await audit(ctx, 'admin.user_updated', 'user', id, { fields: Object.keys(patch).filter((k) => k !== 'updated_at'), status: patch.status });
      if (patch.status === 'suspended') await notify(id, 'account', 'Account suspended', patch.suspended_reason || 'Your account was suspended by an administrator.', null);
      if (patch.status === 'active' && target.status === 'suspended') await notify(id, 'account', 'Account reactivated', 'Your account is active again.', '/app');
      if (patch.plan_id && patch.plan_id !== target.plan_id) await notify(id, 'subscription', 'Plan updated', 'An administrator changed your plan.', '/app/billing');
      return res.json(data);
    }

    case 'user-role': {
      const id = uuid(b.id);
      if (id === ctx.user.id) fail(400, 'You cannot change your own role.', 'validation');
      const role = b.role || null;
      if (role && !['admin', 'support'].includes(role)) fail(400, 'Invalid role.', 'validation');
      await supabase.from('admin_roles').delete().eq('user_id', id);
      if (role) await supabase.from('admin_roles').insert({ user_id: id, role, granted_by: ctx.user.id });
      await audit(ctx, 'admin.role_changed', 'user', id, { role });
      return res.json({ ok: true });
    }

    case 'projects': {
      const pg = paging(q);
      let query = supabase.from('projects').select('id,name,slug,status,framework,production_url,created_at,last_deployed_at,user_id, profiles(email)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      const s = likeSafe(q.q);
      if (s) query = query.or(`name.ilike.%${s}%,slug.ilike.%${s}%`);
      if (q.status) query = query.eq('status', String(q.status).slice(0, 20));
      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
    }

    case 'project-delete': {
      const { data: p } = await supabase.from('projects').select('*').eq('id', uuid(b.id)).maybeSingle();
      if (!p) fail(404, 'Project not found.', 'not_found');
      const { data: act } = await supabase.from('deployments').select('id').eq('project_id', p.id).in('status', ACTIVE);
      for (const d of act || []) await cancelDeployment(d.id);
      if (p.source_path) await supabase.storage.from('sources').remove([p.source_path]);
      await supabase.from('projects').delete().eq('id', p.id);
      await audit(ctx, 'admin.project_deleted', 'project', p.id, { name: p.name, owner: p.user_id });
      await notify(p.user_id, 'project', 'Project removed', `An administrator removed the project "${p.name}". The Vercel project itself was not deleted.`, '/app/projects');
      return res.json({ ok: true });
    }

    case 'deployments': {
      const pg = paging(q);
      let query = supabase.from('deployments').select('id,status,url,created_at,duration_ms,error_message,vercel_deployment_id,progress, projects(name,slug), profiles(email)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      if (q.status === 'building') query = query.in('status', ACTIVE);
      else if (q.status === 'success') query = query.eq('status', 'completed');
      else if (['failed', 'cancelled'].includes(q.status)) query = query.eq('status', q.status);
      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
    }

    case 'deployment-cancel': {
      const d = await cancelDeployment(uuid(b.id));
      if (!d) fail(404, 'Deployment not found.', 'not_found');
      await audit(ctx, 'admin.deployment_cancelled', 'deployment', b.id, {});
      return res.json({ ok: true });
    }

    case 'connections': {
      const pg = paging(q);
      const { data, count, error } = await supabase.from('vercel_connections').select('*, profiles(email)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      if (error) throw error;
      return res.json({ items: (data || []).map((c) => ({ ...publicConn(c), owner: c.profiles?.email })), total: count || 0, page: pg.p, size: pg.size });
    }

    case 'connection-revoke': {
      const { data: c } = await supabase.from('vercel_connections').select('*').eq('id', uuid(b.id)).maybeSingle();
      if (!c) fail(404, 'Connection not found.', 'not_found');
      const { data: act } = await supabase.from('deployments').select('id').eq('connection_id', c.id).in('status', ACTIVE);
      for (const d of act || []) await cancelDeployment(d.id);
      await supabase.from('projects').update({ connection_id: null }).eq('connection_id', c.id);
      await supabase.from('vercel_connections').delete().eq('id', c.id);
      await audit(ctx, 'admin.connection_revoked', 'vercel_connection', c.id, { owner: c.user_id, name: c.name });
      await notify(c.user_id, 'security', 'Vercel connection removed', `An administrator removed the connection "${c.name}". The stored token was deleted.`, '/app/connections');
      return res.json({ ok: true });
    }

    case 'domains': {
      const pg = paging(q);
      const { data, count, error } = await supabase.from('domains').select('*, projects(name,slug), profiles(email)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      if (error) throw error;
      return res.json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
    }

    case 'domain-delete': {
      const { data: d } = await supabase.from('domains').select('*').eq('id', uuid(b.id)).maybeSingle();
      if (!d) fail(404, 'Domain not found.', 'not_found');
      await supabase.from('domains').delete().eq('id', d.id);
      await audit(ctx, 'admin.domain_removed', 'domain', d.id, { hostname: d.hostname });
      return res.json({ ok: true });
    }

    case 'subscriptions': {
      const pg = paging(q);
      let query = supabase.from('subscriptions').select('*, plans(name), profiles(email)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      if (q.status) query = query.eq('status', String(q.status).slice(0, 20));
      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
    }

    case 'subscription-cancel': {
      const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', uuid(b.id)).eq('status', 'active').maybeSingle();
      if (!sub) fail(404, 'Active subscription not found.', 'not_found');
      const def = await getDefaultPlan();
      await supabase.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', sub.id);
      await supabase.from('profiles').update({ plan_id: def?.id ?? null, plan_expires_at: null }).eq('id', sub.user_id);
      await audit(ctx, 'admin.subscription_cancelled', 'subscription', sub.id, {});
      await notify(sub.user_id, 'subscription', 'Subscription cancelled', `Your subscription was cancelled by an administrator. You are now on the ${def?.name || 'Free'} plan.`, '/app/billing');
      return res.json({ ok: true });
    }

    case 'payments': {
      const pg = paging(q);
      let query = supabase.from('payment_requests').select('*, plans(name,project_limit,duration_days), profiles(email,full_name)', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      if (['pending', 'approved', 'rejected', 'correction_requested'].includes(q.status)) query = query.eq('status', q.status);
      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ items: (data || []).map((r) => ({ ...r, has_proof: !!r.proof_path })), total: count || 0, page: pg.p, size: pg.size });
    }

    case 'payment-proof': {
      const { data: r } = await supabase.from('payment_requests').select('proof_path').eq('id', uuid(q.id)).maybeSingle();
      if (!r?.proof_path) fail(404, 'No proof uploaded.', 'not_found');
      const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(r.proof_path, 120);
      await audit(ctx, 'admin.payment_proof_viewed', 'payment_request', q.id, {});
      return res.json({ url: data?.signedUrl, is_pdf: r.proof_path.endsWith('.pdf') });
    }

    case 'payment-review': {
      const id = uuid(b.id);
      const decision = b.decision;
      if (!['approve', 'reject', 'correction'].includes(decision)) fail(400, 'Invalid decision.', 'validation');
      const note = str(b.note, { name: 'Note', max: 500, required: decision !== 'approve' });
      const statusMap = { approve: 'approved', reject: 'rejected', correction: 'correction_requested' };
      const { data: r, error } = await supabase.from('payment_requests')
        .update({ status: statusMap[decision], admin_note: note || null, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'pending').select('*, plans(*)').maybeSingle();
      if (error) throw error;
      if (!r) fail(409, 'This request was already reviewed or is not pending.', 'not_pending');
      if (decision === 'approve') {
        const plan = r.plans;
        const now = new Date();
        const ends = plan.duration_days ? new Date(now.getTime() + plan.duration_days * 86400000) : null;
        await supabase.from('subscriptions').update({ status: 'replaced' }).eq('user_id', r.user_id).eq('status', 'active');
        const { data: sub } = await supabase.from('subscriptions').insert({ user_id: r.user_id, plan_id: plan.id, status: 'active', starts_at: now.toISOString(), ends_at: ends?.toISOString() || null, payment_request_id: r.id, project_limit: plan.project_limit, amount: r.amount, currency: r.currency, approved_by: ctx.user.id }).select('*').single();
        await supabase.from('profiles').update({ plan_id: plan.id, plan_expires_at: ends?.toISOString() || null, updated_at: now.toISOString() }).eq('id', r.user_id);
        await notify(r.user_id, 'subscription_approved', `${plan.name} plan activated`, `Your payment was verified by an administrator. Project limit: ${plan.project_limit}${ends ? `, active until ${ends.toISOString().slice(0, 10)}` : ''}.`, '/app/billing');
        await audit(ctx, 'admin.payment_approved', 'payment_request', r.id, { user: r.user_id, plan: plan.name, subscription: sub?.id });
      } else if (decision === 'reject') {
        await notify(r.user_id, 'subscription_rejected', 'Payment request rejected', note, '/app/billing');
        await audit(ctx, 'admin.payment_rejected', 'payment_request', r.id, { user: r.user_id });
      } else {
        await notify(r.user_id, 'payment_correction', 'Correction requested for your payment', note, '/app/billing');
        await audit(ctx, 'admin.payment_correction', 'payment_request', r.id, { user: r.user_id });
      }
      return res.json({ ok: true });
    }

    case 'plans': {
      const { data, error } = await supabase.from('plans').select('*').order('sort_order').order('price');
      if (error) throw error;
      const { data: prof } = await supabase.from('profiles').select('plan_id');
      const counts = {}; for (const p of prof || []) counts[p.plan_id] = (counts[p.plan_id] || 0) + 1;
      return res.json((data || []).map((p) => ({ ...p, users_count: counts[p.id] || 0 })));
    }

    case 'plan-save': {
      const row = {
        name: str(b.name, { name: 'Plan name', required: true, max: 40 }),
        price: num(b.price, { name: 'Price', min: 0, max: 10000000 }),
        currency: str(b.currency, { name: 'Currency', required: true, max: 5, pattern: /^[A-Za-z]{3,5}$/, patternMsg: 'Currency must be a 3\u20135 letter code.' }).toUpperCase(),
        project_limit: int(b.project_limit, { name: 'Project limit', min: 1, max: 10000 }),
        duration_days: int(b.duration_days, { name: 'Duration (days)', min: 0, max: 3650 }),
        features: (Array.isArray(b.features) ? b.features : []).map((f) => String(f).trim().slice(0, 100)).filter(Boolean).slice(0, 15),
        is_active: bool(b.is_active),
        is_default: bool(b.is_default),
        sort_order: int(b.sort_order, { name: 'Sort order', min: 0, max: 1000, def: 0 }),
        updated_at: new Date().toISOString(),
      };
      const slug = str(b.slug, { name: 'Slug', max: 40, lower: true }) || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) fail(400, 'Slug must be 2\u201340 lowercase letters, numbers or hyphens.', 'validation');
      row.slug = slug;
      if (row.is_default) { row.is_active = true; row.price = 0; }
      let saved;
      if (b.id) {
        const { data, error } = await supabase.from('plans').update(row).eq('id', int(b.id, { min: 1 })).select('*').single();
        if (error) { if (error.code === '23505') fail(409, 'Slug already used.', 'validation'); throw error; }
        saved = data;
      } else {
        const { data, error } = await supabase.from('plans').insert(row).select('*').single();
        if (error) { if (error.code === '23505') fail(409, 'Slug already used.', 'validation'); throw error; }
        saved = data;
      }
      if (saved.is_default) await supabase.from('plans').update({ is_default: false }).neq('id', saved.id);
      await audit(ctx, b.id ? 'admin.plan_updated' : 'admin.plan_created', 'plan', saved.id, { name: saved.name, price: saved.price, currency: saved.currency, limit: saved.project_limit });
      return res.json(saved);
    }

    case 'plan-delete': {
      const id = int(b.id, { min: 1 });
      const { data: plan } = await supabase.from('plans').select('*').eq('id', id).maybeSingle();
      if (!plan) fail(404, 'Plan not found.', 'not_found');
      if (plan.is_default) fail(400, 'The default plan cannot be deleted.', 'validation');
      const [{ count: users }, { count: refs }] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('plan_id', id),
        supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('plan_id', id),
      ]);
      if (users || refs) {
        await supabase.from('plans').update({ is_active: false }).eq('id', id);
        await audit(ctx, 'admin.plan_deactivated', 'plan', id, {});
        return res.json({ ok: true, deactivated: true });
      }
      await supabase.from('plans').delete().eq('id', id);
      await audit(ctx, 'admin.plan_deleted', 'plan', id, { name: plan.name });
      return res.json({ ok: true });
    }

    case 'settings': {
      const s = await getSettings(true);
      return res.json({ billing: s.billing, payment: s.payment, limits: s.limits, platform: s.platform });
    }

    case 'settings-save': {
      const key = String(b.key || '');
      if (!['billing', 'payment', 'limits', 'platform'].includes(key)) fail(400, 'Unknown settings group.', 'validation');
      const current = (await getSettings(true))[key];
      const value = validateSettings(key, b.value || {}, current);
      await saveSetting(key, value);
      await audit(ctx, 'admin.settings_updated', 'settings', key, key === 'billing' ? { paid_enabled: value.paid_enabled } : { fields: Object.keys(value) });
      return res.json(value);
    }

    case 'announcements': {
      const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return res.json(data || []);
    }

    case 'announcement-save': {
      const row = {
        title: str(b.title, { name: 'Title', required: true, max: 120 }),
        body: str(b.body, { name: 'Message', required: true, max: 1000 }),
        level: ['info', 'success', 'warning', 'critical'].includes(b.level) ? b.level : 'info',
        is_active: b.is_active === undefined ? true : bool(b.is_active),
      };
      let saved;
      if (b.id) {
        const { data, error } = await supabase.from('announcements').update(row).eq('id', int(b.id, { min: 1 })).select('*').single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from('announcements').insert({ ...row, created_by: ctx.user.id }).select('*').single();
        if (error) throw error;
        saved = data;
        if (bool(b.notify)) {
          const { data: users } = await supabase.from('profiles').select('id').eq('status', 'active').limit(20000);
          const rows = (users || []).map((u) => ({ user_id: u.id, type: 'announcement', title: row.title, body: row.body, link: null }));
          for (let i = 0; i < rows.length; i += 500) await supabase.from('notifications').insert(rows.slice(i, i + 500));
        }
      }
      await audit(ctx, b.id ? 'admin.announcement_updated' : 'admin.announcement_created', 'announcement', saved.id, { title: row.title });
      return res.json(saved);
    }

    case 'announcement-delete': {
      await supabase.from('announcements').delete().eq('id', int(b.id, { min: 1 }));
      await audit(ctx, 'admin.announcement_deleted', 'announcement', b.id, {});
      return res.json({ ok: true });
    }

    case 'health': {
      const t0 = Date.now();
      const dbOk = !(await supabase.from('plans').select('id').limit(1)).error;
      const dbMs = Date.now() - t0;
      const [src, proofs] = await Promise.all([supabase.storage.getBucket('sources'), supabase.storage.getBucket('payment-proofs')]);
      let vercelReach = 'unreachable';
      let vercelMs = null;
      try {
        const t1 = Date.now();
        const r = await fetch('https://api.vercel.com/v2/user', { signal: AbortSignal.timeout(6000) });
        vercelMs = Date.now() - t1;
        vercelReach = r.status === 403 || r.status === 401 || r.ok ? 'reachable' : `http_${r.status}`;
      } catch { vercelReach = 'unreachable'; }
      const stuckBefore = new Date(Date.now() - 10 * 60000).toISOString();
      const [queued, running, stuck] = await Promise.all([
        head(supabase.from('deployments').select('id', { count: 'exact', head: true }).eq('status', 'queued')),
        head(supabase.from('deployments').select('id', { count: 'exact', head: true }).in('status', ACTIVE)),
        head(supabase.from('deployments').select('id', { count: 'exact', head: true }).in('status', ACTIVE).lt('updated_at', stuckBefore)),
      ]);
      const s = await getSettings(true);
      // Verify that direct client access to tables is blocked by Row Level Security.
      let rls = 'unknown';
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/admin_roles?select=id&limit=1`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(5000) });
        const j = await r.json().catch(() => null);
        rls = Array.isArray(j) && j.length > 0 ? 'exposed' : 'enforced';
      } catch { rls = 'unknown'; }
      return res.json({
        rls,
        database: { ok: dbOk, latency_ms: dbMs },
        storage: { sources: !src.error, payment_proofs: !proofs.error },
        vercel_api: { status: vercelReach, latency_ms: vercelMs },
        encryption: { source: keySource(), algorithm: 'AES-256-GCM' },
        cron_secret: !!process.env.CRON_SECRET,
        queue: { queued, running, stuck },
        system: s.system || {},
        runtime: { node: process.version, region: process.env.VERCEL_REGION || 'local' },
      });
    }

    case 'cleanup': {
      const report = await runCleanup();
      await audit(ctx, 'admin.cleanup_run', 'system', null, report);
      return res.json(report);
    }

    case 'audit': {
      const pg = paging(q);
      let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(pg.from, pg.to);
      const s = likeSafe(q.q);
      if (s) query = query.or(`action.ilike.%${s}%,actor_email.ilike.%${s}%,target_type.ilike.%${s}%`);
      if (q.admin_only === '1') query = query.like('action', 'admin.%');
      const { data, count, error } = await query;
      if (error) throw error;
      return res.json({ items: data || [], total: count || 0, page: pg.p, size: pg.size });
    }

    case 'usage': {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [{ data: users }, { data: projects }, { data: deps }, { data: plans }] = await Promise.all([
        supabase.from('profiles').select('id,email,full_name,plan_id,project_limit_override,status').limit(5000),
        supabase.from('projects').select('user_id').limit(20000),
        supabase.from('deployments').select('user_id,status,duration_ms').gte('created_at', since).limit(20000),
        supabase.from('plans').select('id,name,project_limit,is_default'),
      ]);
      const planMap = Object.fromEntries((plans || []).map((p) => [p.id, p]));
      const def = (plans || []).find((p) => p.is_default);
      const pc = {}; for (const p of projects || []) pc[p.user_id] = (pc[p.user_id] || 0) + 1;
      const dc = {}; const bm = {};
      for (const d of deps || []) { dc[d.user_id] = (dc[d.user_id] || 0) + 1; bm[d.user_id] = (bm[d.user_id] || 0) + (d.duration_ms || 0); }
      const rows = (users || []).map((u) => {
        const plan = planMap[u.plan_id] || def;
        const limit = u.project_limit_override ?? plan?.project_limit ?? 5;
        return { id: u.id, email: u.email, name: u.full_name, status: u.status, plan: plan?.name || '\u2014', limit, projects: pc[u.id] || 0, deployments_30d: dc[u.id] || 0, build_minutes_30d: Math.round((bm[u.id] || 0) / 60000) };
      }).sort((a, b2) => b2.deployments_30d - a.deployments_30d || b2.projects - a.projects).slice(0, 200);
      const totals = { deployments_30d: (deps || []).length, build_minutes_30d: Math.round((deps || []).reduce((a, d) => a + (d.duration_ms || 0), 0) / 60000), at_quota: rows.filter((r) => r.projects >= r.limit).length };
      return res.json({ rows, totals });
    }

    default:
      fail(404, 'Unknown admin action.', 'not_found');
  }
});

