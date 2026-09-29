-- DeployForge: database hardening. Run once in the Supabase SQL editor.
-- The app accesses all tables through server-side API routes using the service role,
-- which bypasses RLS. Enabling RLS with no permissive policies blocks direct access
-- with the public (anon/publishable) key.

alter table public.plans                 enable row level security;
alter table public.profiles              enable row level security;
alter table public.admin_roles           enable row level security;
alter table public.system_settings       enable row level security;
alter table public.rate_limits           enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.announcements         enable row level security;
alter table public.vercel_connections    enable row level security;
alter table public.notifications         enable row level security;
alter table public.projects              enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.payment_requests      enable row level security;
alter table public.deployments           enable row level security;
alter table public.deployment_logs       enable row level security;
alter table public.domains               enable row level security;
alter table public.environment_variables enable row level security;

-- Remove permissive policies created during prototyping (deny-by-default).
drop policy if exists own_notifications_select on public.notifications;

-- Integrity constraints
create unique index if not exists projects_slug_key        on public.projects (slug);
create unique index if not exists domains_hostname_key     on public.domains (lower(hostname));
create unique index if not exists plans_slug_key           on public.plans (slug);
create unique index if not exists admin_roles_user_key     on public.admin_roles (user_id);
create unique index if not exists env_project_key          on public.environment_variables (project_id, key);

-- Query indexes
create index if not exists projects_user_idx            on public.projects (user_id, updated_at desc);
create index if not exists deployments_user_idx         on public.deployments (user_id, created_at desc);
create index if not exists deployments_project_idx      on public.deployments (project_id, created_at desc);
create index if not exists deployments_active_idx       on public.deployments (status) where status in ('queued','preparing','uploading','building','checking');
create index if not exists deployment_logs_dep_idx      on public.deployment_logs (deployment_id, id);
create index if not exists notifications_user_idx       on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx     on public.notifications (user_id) where read_at is null;
create index if not exists audit_logs_actor_idx         on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_target_idx        on public.audit_logs (target_id);
create index if not exists payment_requests_status_idx  on public.payment_requests (status, created_at desc);
create index if not exists subscriptions_user_idx       on public.subscriptions (user_id, status);
create index if not exists domains_project_idx          on public.domains (project_id);
create index if not exists connections_user_idx         on public.vercel_connections (user_id);

-- Status checks (mirror the enums used by the API)
alter table public.deployments      drop constraint if exists deployments_status_chk;
alter table public.deployments      add  constraint deployments_status_chk check (status in ('queued','preparing','uploading','building','checking','completed','failed','cancelled'));
alter table public.payment_requests drop constraint if exists payment_requests_status_chk;
alter table public.payment_requests add  constraint payment_requests_status_chk check (status in ('pending','approved','rejected','correction_requested'));
alter table public.subscriptions    drop constraint if exists subscriptions_status_chk;
alter table public.subscriptions    add  constraint subscriptions_status_chk check (status in ('active','expired','cancelled','replaced'));
alter table public.profiles         drop constraint if exists profiles_status_chk;
alter table public.profiles         add  constraint profiles_status_chk check (status in ('active','suspended'));
alter table public.admin_roles      drop constraint if exists admin_roles_role_chk;
alter table public.admin_roles      add  constraint admin_roles_role_chk check (role in ('owner','admin','support'));
