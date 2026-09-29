# DeployForge — Deployment & Operations Guide

DeployForge is a full-stack SaaS that deploys user-uploaded source code to **the user's own Vercel account**, streams real Vercel build logs, manages domains/env vars, and supports manually-reviewed paid plans.

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | Vite + React 19 + TypeScript, Tailwind CSS v4, Framer Motion, React Router (lazy-loaded routes) |
| API | Vercel Serverless Functions in `api/` (`me`, `connections`, `projects`, `deploy`, `billing`, `admin`) |
| Database | Supabase Postgres (accessed only server-side with the service role) |
| Auth | Supabase Auth — bcrypt password hashing, email verification, password reset, Google sign-in, refresh-token sessions |
| Storage | Private Supabase buckets `sources` (ZIPs) and `payment-proofs`, accessed via short-lived signed URLs |
| Deploy worker | `api/_lib/worker.js` — resumable job state machine with DB leases, retries, timeouts, cancellation |

The reference data model is in `prisma/schema.prisma`; hardening SQL is in `db/security.sql`.

### Deployment pipeline (real Vercel API)

1. **Browser** unpacks the ZIP with JSZip for preview/analysis only (nothing is executed), strips unsafe paths, `node_modules`, `.git`, caches and `.env` files, re-packs the normalized archive and uploads it to private storage through a signed URL (with progress).
2. `POST /api/projects` validates everything server-side (quota, subdomain, source path ownership, env keys) and stores env values encrypted.
3. `POST /api/deploy` creates a `queued` job and returns immediately.
4. The worker advances the job in leased steps:
   - **preparing** — create/patch the Vercel project (`/v11/projects`, `/v9/projects/:id`), sync encrypted env vars (`/v10/projects/:id/env?upsert=true`)
   - **uploading** — re-validate the archive, SHA-1 every file, create the deployment (`/v13/deployments`); on `missing_files` upload only those files (`/v2/files`), resumable across invocations
   - **building** — poll `/v13/deployments/:id` and ingest real build events (`/v3/deployments/:id/events`), redacting secret values
   - **checking** — resolve the production alias and verify the live `*.vercel.app` URL responds
   - **completed / failed / cancelled** — notifications, generated domain records, pending custom domains attached
5. The browser receives live updates via a streamed **Server-Sent Events** response (`/api/deploy?action=stream`, fetch + ReadableStream so the bearer token is sent in a header). It auto-reconnects and falls back to polling.

Jobs advance whenever a stream/poll/dashboard request is active and via the daily cron. For continuous background processing without a browser open, run the isolated worker: `node scripts/worker.mjs` on any container/VM (same DB lease, safe to run alongside serverless).

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` | yes | Public key (auth only) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Used by API routes |
| `DEPLOYFORGE_ENCRYPTION_KEY` | recommended | Dedicated secret (32+ random chars) for AES-256-GCM. Without it a key is derived from the service role key. Ciphertexts are tagged (`k0`/`k1`) so both remain readable after you add it. |
| `CRON_SECRET` | recommended | Protects `/api/deploy?action=cron` (Vercel sends it automatically) |
| `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_AUTH_PROXY` | optional | Google sign-in |

Add secrets in Vercel → Project → Settings → Environment Variables (or the Secrets tab in Design Arena).

## First-time setup

1. **Harden the database** — open the Supabase SQL editor and run `db/security.sql`. This enables Row Level Security (deny-by-default for the public key), adds unique constraints, indexes and status checks. The admin **System health** page shows `RLS: enforced` once done.
2. **Auth settings** — in Supabase → Authentication: enable email confirmations, set the Site URL to your production domain and add `/reset-password` and `/login` to redirect URLs.
3. **Admin access** — the seeded owner is `admin@deployforge.app` / `Admin@12345`. Change this password immediately. Owners can grant `admin` or `support` (read-only) roles from Admin → Users.
4. **Billing** — Admin → Pricing & payments: toggle paid subscriptions, set the payment method, account number, holder, instructions and whether proof/reference are required. Admin → Plans controls names, prices, currency, limits, durations and features.
5. **Deploy** — `npm run build` then deploy to Vercel. `vercel.json` configures SPA rewrites, function durations, security headers and the cleanup cron.

## Security model

- Vercel tokens and env values are encrypted with AES-256-GCM before storage; APIs only ever return masked hints (`••••last4`).
- Every API route verifies the Supabase access token server-side and scopes queries to the owner; admin routes require an `admin_roles` entry (`support` = read-only, `admin` = write, `owner` = role management).
- Suspended users are blocked from every endpoint.
- Rate limits (DB-backed) on token validation, uploads, imports, subdomain checks, deploys and payment submissions.
- Upload limits (size, file count, unpacked size) are enforced in the browser **and** re-validated by the worker; path traversal entries are dropped.
- URL imports: https only, host allowlist (admin-configurable), DNS resolution with private/reserved range blocking, redirect re-validation, size cap and timeout.
- User code is never executed on DeployForge infrastructure — builds run on Vercel's isolated machines. Build commands are single-line project settings passed to Vercel.
- Build logs are scrubbed of secret env values and bearer tokens before storage.
- API errors never include stack traces; unexpected errors return a reference ID that maps to server logs.
- Audit logs record account, connection, project, env, domain, deployment, payment and admin actions (with IP/user agent).
- Payment verification is **manual**. The UI states this explicitly and approval requires an admin decision.

## Operations

- **Cleanup** (`runCleanup`) — times out stuck jobs, removes orphaned uploads (>24h) and imports (>1h), clears old rate-limit windows and expires lapsed subscriptions. Runs daily via cron, from Admin → System health, and every 10 min in `scripts/worker.mjs`.
- **Timeouts / retries** — per-job timeout is configurable (Admin → Settings). Transient Vercel errors (network/5xx/429) retry automatically up to 3 times; users can retry failed jobs.
- **Cancellation** — cancels the Vercel build (`PATCH /v12/deployments/:id/cancel`) and marks the job cancelled atomically.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| User | `demo@deployforge.app` | `Demo@12345` |
| Owner/admin | `admin@deployforge.app` | `Admin@12345` |

The user app lives at `/app`; the admin console at `/admin` (not linked for regular users; access is enforced server-side).
