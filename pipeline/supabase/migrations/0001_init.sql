-- ════════════════════════════════════════════════════════════════════════════
-- 0001_init.sql — Bewerbung als Maschine
-- PII strikt von Realtime-Daten getrennt (DSGVO + RLS-sauber). Client liest nur
-- die PII-freie Tabelle. Deny-by-default überall, wo es nicht explizit erlaubt ist.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PII-freier Fortschritt (anon liest via Realtime) ─────────────────────────
create table if not exists public.build_jobs (
  id          uuid primary key default gen_random_uuid(),
  stage       text,
  stage_note  text,
  stage_done  boolean not null default false,
  status      text not null default 'running',   -- running | done | error
  result_slug text,
  result_url  text,
  call_id     text,
  created_at  timestamptz not null default now()
);
alter table public.build_jobs enable row level security;

-- Nur SELECT für anon. KEINE insert/update/delete-Policy ⇒ Schreiben ist dicht.
-- using(true) erlaubt Enumeration aller (PII-freien) Jobs — bewusst akzeptiert,
-- da kein PII enthalten ist. Bei Bedarf per Job-Token scopen statt true.
drop policy if exists anon_read on public.build_jobs;
create policy anon_read on public.build_jobs
  for select to anon using (true);

-- ── PII separat, ausschließlich Service-Role ─────────────────────────────────
create table if not exists public.build_jobs_pii (
  job_id        uuid primary key references public.build_jobs(id) on delete cascade,
  email         text not null,
  phone         text,
  call_consent  boolean not null default false,
  consent_at    timestamptz,
  created_at    timestamptz not null default now()
);
-- RLS an, ABER keine einzige Policy ⇒ für anon/authenticated komplett dicht.
-- Nur der Service-Role-Key (bypasst RLS) kommt heran.
alter table public.build_jobs_pii enable row level security;

-- ── Abuse-Guards (Service-Role-only, keine Policy ⇒ dicht) ───────────────────
-- Dedupe „eine Bewerbung pro Email" — speichert NUR den Hash, nie die Email.
-- Persistiert über die PII-Löschung (<24h) hinaus, ohne PII zu sein.
create table if not exists public.submission_guard (
  email_hash text primary key,        -- sha256(lower(email))
  last_at    timestamptz not null default now(),
  count      integer not null default 1
);
alter table public.submission_guard enable row level security;

-- Rate-Limit pro Schlüssel (ip:<addr> / domain:<host>), fixed window.
create table if not exists public.rate_limits (
  bucket_key   text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);
alter table public.rate_limits enable row level security;

-- Atomare Increment-Funktion (Service-Role ruft via RPC). SECURITY DEFINER,
-- damit der Zähler auch ohne Table-Policy läuft; revoke für anon/authenticated.
create or replace function public.bump_rate_limit(
  p_key text, p_window_seconds int, p_limit int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_start timestamptz;
begin
  insert into public.rate_limits (bucket_key, window_start, count)
    values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set count = case
          when public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1 else public.rate_limits.count + 1 end,
        window_start = case
          when public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now else public.rate_limits.window_start end
  returning count, window_start into v_count, v_start;
  return v_count <= p_limit;   -- true = erlaubt, false = gedrosselt
end $$;

revoke all on function public.bump_rate_limit(text, int, int) from anon, authenticated;

-- ── Realtime aktivieren (nur PII-freie Tabelle) ──────────────────────────────
alter publication supabase_realtime add table public.build_jobs;

-- ── Storage-Buckets: cache (privat), sites (public-read) ─────────────────────
insert into storage.buckets (id, name, public) values
  ('cache', 'cache', false),
  ('sites', 'sites', true)
on conflict (id) do nothing;

-- ── Storage-Policies: Writes service-role-only (§16.4) ───────────────────────
-- storage.objects hat RLS aktiv. Wir vergeben KEINE insert/update/delete-Policy
-- für anon/authenticated ⇒ nur Service-Role schreibt. 'sites' ist public-read
-- über das public-Flag des Buckets; 'cache' bleibt privat (kein read-Grant).
-- (Defensive Drops, falls Supabase-Defaults existieren.)
drop policy if exists "anon insert cache" on storage.objects;
drop policy if exists "anon insert sites" on storage.objects;
-- Keine (re)create — Abwesenheit von Policies = deny-by-default für anon.

-- ── DSGVO: PII-Löschjob (Cron < 24h) ─────────────────────────────────────────
-- Aufruf per pg_cron, sobald verfügbar. Löscht PII älter als 24h; build_jobs bleibt.
create or replace function public.purge_old_pii() returns void
language sql security definer set search_path = public as $$
  delete from public.build_jobs_pii where created_at < now() - interval '24 hours';
$$;
revoke all on function public.purge_old_pii() from anon, authenticated;

-- Optional (wenn pg_cron-Extension aktiv):
-- select cron.schedule('purge-pii', '0 * * * *', $$ select public.purge_old_pii(); $$);
