-- 0003_live_build.sql — Besucher-Kontext + Call-Token (PII-Regime, Service-Role-only)
alter table public.build_jobs_pii
  add column if not exists first_name text,
  add column if not exists role text,
  add column if not exists ice_cream text,
  add column if not exists call_token text,
  add column if not exists call_token_expires_at timestamptz,
  add column if not exists call_token_used boolean not null default false;
