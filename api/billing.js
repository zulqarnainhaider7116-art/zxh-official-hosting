import crypto from 'node:crypto';
import { route, supabase, requireUser, fail, str, body, uuid, audit, rateLimit, getSettings, getQuota, notify, notifyAdmins, int } from './_lib/core.js';

const PROOF_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

function publicPayment(s) {
  return {
    available: !!s.payment.available,
    method_name: s.payment.method_name,
    account_number: s.payment.account_number,
    account_holder: s.payment.account_holder,
    instructions: s.payment.instructions,
    require_proof: !!s.payment.require_proof,
    require_reference: !!s.payment.require_reference,
    send_payment_url: s.payment.send_payment_url,
  };
}

function validateSubmission(b, s, uid) {
  const out = {
    full_name: str(b.full_name, { name: 'Full name', required: true, min: 3, max: 80 }),
    phone: str(b.phone, { name: 'Phone number', required: true, max: 20, pattern: /^[+0-9 ()-]{7,20}$/, patternMsg: 'Enter a valid phone number.' }),
    account_holder: str(b.account_holder, { name: 'Account holder name', required: true, min: 3, max: 80 }),
    reference_id: str(b.reference_id, { name: 'Transaction / reference ID', required: !!s.payment.require_reference, max: 80, pattern: /^[A-Za-z0-9\-_/#. ]+$/, patternMsg: 'Reference ID contains invalid characters.' }) || null,
    proof_path: null,
  };
  if (b.proof_path) {
    const re = new RegExp(`^${uid}/[0-9a-f-]{36}\\.(png|jpg|webp|pdf)$`);
    if (!re.test(b.proof_path)) fail(400, 'Invalid payment proof reference. Upload it again.', 'invalid_proof');
    out.proof_path = b.proof_path;
  } else if (s.payment.require_proof) {
    fail(400, 'Please upload a payment proof (screenshot or PDF receipt).', 'validation', { field: 'proof' });
  }
  return out;
}

export default route(async (req, res) => {
  const ctx = await requireUser(req);
  const uid = ctx.user.id;
  const action = req.query.action;
  const s = await getSettings();

  if (req.method === 'GET' && action === 'proof') {
    const { data: r } = await supabase.from('payment_requests').select('proof_path').eq('id', uuid(req.query.id)).eq('user_id', uid).maybeSingle();
    if (!r?.proof_path) fail(404, 'Proof not found.', 'not_found');
    const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(r.proof_path, 120);
    return res.status(200).json({ url: data?.signedUrl });
  }

  if (req.method === 'GET') {
    const [quota, { data: plans }, { data: subs }, { data: reqs }] = await Promise.all([
      getQuota(ctx.profile),
      supabase.from('plans').select('id,slug,name,price,currency,project_limit,duration_days,features,is_default,sort_order').eq('is_active', true).order('sort_order').order('price'),
      supabase.from('subscriptions').select('*, plans(name)').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
      supabase.from('payment_requests').select('id,plan_id,amount,currency,full_name,phone,account_holder,reference_id,proof_path,status,admin_note,created_at,updated_at,reviewed_at, plans(name)').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
    ]);
    return res.status(200).json({
      billing: { paid_enabled: !!s.billing.paid_enabled, unavailable_message: s.billing.unavailable_message },
      payment: s.billing.paid_enabled ? publicPayment(s) : null,
      plans: plans || [],
      current: { plan: quota.plan, expires_at: ctx.profile.plan_expires_at, quota: { used: quota.used, limit: quota.limit } },
      subscriptions: subs || [],
      requests: (reqs || []).map((r) => ({ ...r, has_proof: !!r.proof_path, proof_path: undefined })),
    });
  }

  if (req.method === 'POST' && action === 'proof-url') {
    await rateLimit(`proof:${uid}`, 20, 3600);
    const b = body(req);
    const ext = PROOF_TYPES[b.content_type];
    if (!ext) fail(400, 'Proof must be a PNG, JPG, WEBP image or a PDF.', 'invalid_type');
    int(b.size, { name: 'File size', min: 100, max: 5 * 1048576 });
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage.from('payment-proofs').createSignedUploadUrl(path);
    if (error) throw error;
    return res.status(200).json({ path, signedUrl: data.signedUrl });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!s.billing.paid_enabled) fail(403, s.billing.unavailable_message || 'Paid subscriptions are currently unavailable.', 'subscription_unavailable');
    if (!s.payment.available) fail(403, 'Payments are temporarily unavailable. Please try again later.', 'payment_unavailable');
    await rateLimit(`payment:${uid}`, 6, 3600);
    const b = body(req);

    if (req.method === 'PUT') {
      const { data: existing } = await supabase.from('payment_requests').select('*').eq('id', uuid(b.id)).eq('user_id', uid).maybeSingle();
      if (!existing) fail(404, 'Payment request not found.', 'not_found');
      if (existing.status !== 'correction_requested') fail(400, 'Only requests marked “Correction requested” can be updated.', 'not_editable');
      const fields = validateSubmission({ ...b, proof_path: b.proof_path || existing.proof_path }, s, uid);
      const { data, error } = await supabase.from('payment_requests').update({ ...fields, status: 'pending', updated_at: new Date().toISOString() }).eq('id', existing.id).select('*').single();
      if (error) throw error;
      await audit(ctx, 'payment.resubmitted', 'payment_request', existing.id, {});
      await notify(uid, 'payment_submitted', 'Payment details resubmitted', 'Your corrected submission is pending manual review.', '/app/billing');
      await notifyAdmins('payment_pending', 'Payment resubmitted', `${ctx.user.email} updated a payment request.`, '/admin/payments');
      return res.status(200).json(data);
    }

    const { data: plan } = await supabase.from('plans').select('*').eq('id', int(b.plan_id, { name: 'Plan', min: 1 })).eq('is_active', true).maybeSingle();
    if (!plan) fail(400, 'This plan is not available.', 'invalid_plan');
    if (Number(plan.price) <= 0) fail(400, 'Free plans do not require payment.', 'invalid_plan');
    const { count } = await supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('user_id', uid).in('status', ['pending', 'correction_requested']);
    if (count) fail(409, 'You already have a payment request awaiting review.', 'pending_exists');
    const fields = validateSubmission(b, s, uid);
    const { data, error } = await supabase.from('payment_requests').insert({ ...fields, user_id: uid, plan_id: plan.id, amount: plan.price, currency: plan.currency, method_name: s.payment.method_name, status: 'pending' }).select('*').single();
    if (error) throw error;
    await audit(ctx, 'payment.submitted', 'payment_request', data.id, { plan: plan.name, amount: plan.price, currency: plan.currency });
    await notify(uid, 'payment_submitted', 'Payment submitted — pending review', `We received your ${plan.name} payment details. An admin will verify them manually.`, '/app/billing');
    await notifyAdmins('payment_pending', 'New payment request', `${ctx.user.email} submitted ${plan.currency} ${plan.price} for ${plan.name}.`, '/admin/payments');
    return res.status(201).json(data);
  }

  fail(405, 'Method not allowed.', 'method');
});
