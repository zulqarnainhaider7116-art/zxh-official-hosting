#!/usr/bin/env node
/**
 * Optional always-on deployment worker.
 *
 * By default, DeployForge advances deployment jobs inside short serverless invocations
 * (live log streams, status polls, dashboard loads and the scheduled cron). For high volume,
 * run this process on an isolated machine/container to continuously drain the queue:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEPLOYFORGE_ENCRYPTION_KEY=... node scripts/worker.mjs
 *
 * It uses the same DB lease (lock_until) as the serverless path, so both can run safely.
 * It never executes user code: builds run on Vercel; this worker only hashes and uploads files.
 */
import { tick, runCleanup, ACTIVE } from '../api/_lib/worker.js';
import supabase from '../api/db-client.js';

const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 2000);
const CLEANUP_EVERY = 10 * 60 * 1000;
let lastCleanup = 0;
let stopping = false;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

console.log('[worker] DeployForge worker started');
while (!stopping) {
  try {
    const { data } = await supabase.from('deployments').select('id').in('status', ACTIVE).order('created_at').limit(5);
    await Promise.all((data || []).map((d) => tick(d.id, 20000).catch((e) => console.error('[worker] tick', e?.message))));
    if (Date.now() - lastCleanup > CLEANUP_EVERY) {
      lastCleanup = Date.now();
      const r = await runCleanup().catch((e) => ({ error: e?.message }));
      console.log('[worker] cleanup', JSON.stringify(r));
    }
  } catch (e) {
    console.error('[worker] loop error', e?.message);
  }
  await new Promise((r) => setTimeout(r, INTERVAL));
}
console.log('[worker] stopped');
