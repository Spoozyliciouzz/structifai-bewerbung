-- ════════════════════════════════════════════════════════════════════════════
-- 0006_bewerbung_on_central.sql — Backend neu aufbauen in Structifai-Central
--
-- ANLASS: Das eigene Projekt qpxoggvbkbjluxkorgrp ist gelöscht (CLI: "Resource has been
-- removed", DNS: Non-existent domain, geprüft 2026-09-15). 0001–0005 zielten dorthin und
-- sind damit Historie. Diese Migration stellt denselben Stand in hhxwojewbtegovzdxpfw her.
--
-- PRÄFIX `bw_` statt Schema: in dieser Datenbank liegen Content-Pipeline, Cost-Cockpit,
-- Marketing-Cockpit und GSC präfigiert in `public`; nur das Reisekostentool hat ein eigenes
-- Schema. Ein eigenes Schema bräuchte zusätzlich die API-Freischaltung im Dashboard und
-- Accept-Profile-Header in jedem Edge-Function-Aufruf. Das Präfix verhindert dieselbe
-- Kollision ohne diese Kosten.
--
-- ZWINGEND, WARUM ÜBERHAUPT: `public.rate_limits` existiert dort bereits mit fremden Daten
-- und ANDEREM Primärschlüssel (`key` statt `bucket_key`). `create table if not exists` hätte
-- die Erstellung still übersprungen und bump_rate_limit hätte gegen eine fremde Tabelle
-- geschrieben. Ebenso belegt: `public.sites`.
--
-- RLS-Idiom wie im Ursprung: RLS an, KEINE Policy ⇒ nur Service-Role. Einzige Ausnahme ist
-- bw_build_jobs (PII-frei, anon liest via Realtime).
-- ════════════════════════════════════════════════════════════════════════════

-- ── PII-freier Fortschritt (anon liest via Realtime) ─────────────────────────
create table if not exists public.bw_build_jobs (
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
alter table public.bw_build_jobs enable row level security;

-- Nur SELECT für anon. Keine insert/update/delete-Policy ⇒ Schreiben ist dicht.
-- using(true) erlaubt Enumeration — vertretbar, SOLANGE hier nichts steht, was die Bewerbung
-- verrät. Deshalb liegt application_id in bw_build_jobs_pii, nicht hier.
drop policy if exists bw_anon_read on public.bw_build_jobs;
create policy bw_anon_read on public.bw_build_jobs
  for select to anon using (true);

-- ── PII separat, ausschließlich Service-Role ─────────────────────────────────
create table if not exists public.bw_build_jobs_pii (
  job_id                uuid primary key references public.bw_build_jobs(id) on delete cascade,
  email                 text not null,
  phone                 text,
  call_consent          boolean not null default false,
  consent_at            timestamptz,
  first_name            text,
  role                  text,
  ice_cream             text,                    -- Lieblingseis: agnostischer Hook, hängt am
                                                 -- Empfänger, nicht an Firma oder Stelle
  call_token            text,
  call_token_expires_at timestamptz,
  call_token_used       boolean not null default false,
  application_id        text,                    -- welche Bewerbung; bewusst NICHT in der
                                                 -- anon-lesbaren Tabelle
  created_at            timestamptz not null default now()
);
alter table public.bw_build_jobs_pii enable row level security;
-- Keine Policy ⇒ dicht.
drop policy if exists bw_no_anon on public.bw_build_jobs_pii;

create index if not exists bw_build_jobs_pii_application_idx
  on public.bw_build_jobs_pii (application_id);

-- ── Abuse-Guards (Service-Role-only, keine Policy ⇒ dicht) ───────────────────
create table if not exists public.bw_submission_guard (
  email_hash text primary key,        -- sha256(lower(email)), nie die Adresse selbst
  last_at    timestamptz not null default now(),
  count      integer not null default 1
);
alter table public.bw_submission_guard enable row level security;

create table if not exists public.bw_rate_limits (
  bucket_key   text primary key,      -- ip:<addr> / domain:<host>
  window_start timestamptz not null default now(),
  count        integer not null default 0
);
alter table public.bw_rate_limits enable row level security;

create or replace function public.bw_bump_rate_limit(
  p_key text, p_window_seconds int, p_limit int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_start timestamptz;
begin
  insert into public.bw_rate_limits (bucket_key, window_start, count)
    values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set count = case
          when public.bw_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1 else public.bw_rate_limits.count + 1 end,
        window_start = case
          when public.bw_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now else public.bw_rate_limits.window_start end
  returning count, window_start into v_count, v_start;
  return v_count <= p_limit;   -- true = erlaubt, false = gedrosselt
end $$;
revoke all on function public.bw_bump_rate_limit(text, int, int) from anon, authenticated;

-- ── Voice (Twilio ConversationRelay) ─────────────────────────────────────────
create table if not exists public.bw_voice_calls (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid,
  application_id    text,
  direction         text not null,                     -- outbound | inbound
  counterpart_phone text,                              -- PII
  twilio_call_sid   text unique,
  status            text not null default 'initiated',
  duration_seconds  int,
  transcript        text,                              -- PII, < 7 Tage
  turns             jsonb,
  created_at        timestamptz not null default now(),
  ended_at          timestamptz
);
alter table public.bw_voice_calls enable row level security;
drop policy if exists bw_no_anon on public.bw_voice_calls;

create index if not exists bw_voice_calls_job_idx         on public.bw_voice_calls (job_id);
create index if not exists bw_voice_calls_created_idx     on public.bw_voice_calls (created_at);
create index if not exists bw_voice_calls_application_idx on public.bw_voice_calls (application_id);

-- Global und stellen-agnostisch: profile | projects | faq.
-- Die n=1-Buckets (the_role, objections, stellenbezogene faq) stehen NICHT hier,
-- sondern je Bewerbung in bw_application_content.voice.
create table if not exists public.bw_voice_agent_context (
  id         text primary key,
  content    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.bw_voice_agent_context enable row level security;
drop policy if exists bw_no_anon on public.bw_voice_agent_context;

-- ── Eine Zeile je Stellenanzeige ─────────────────────────────────────────────
-- id ist ein sprechender Slug ('lm-2786630'), kein zufälliges UUID: der Wert reist als
-- <Parameter> durch TwiML in das ConversationRelay-setup und taucht in Logs auf. Der
-- CHECK hält ihn XML-/URL-sicher — er kommt von Twilio zurück und ist dort untrusted.
create table if not exists public.bw_applications (
  id               text primary key,
  company          text not null,
  role_title       text not null,
  job_url          text,
  job_source_id    text,                                -- Anzeigen-ID beim Portal
  enrich_domain    text,                                -- Firmenseite für die Anreicherung
                                                        -- (LM: lm-ag.de, NICHT der Personio-Host)
  status           text not null default 'draft',       -- draft | released | archived
  released_version integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'bw_applications_id_slug_check'
                   and conrelid = 'public.bw_applications'::regclass) then
    alter table public.bw_applications add constraint bw_applications_id_slug_check
      check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$');
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'bw_applications_status_check'
                   and conrelid = 'public.bw_applications'::regclass) then
    alter table public.bw_applications add constraint bw_applications_status_check
      check (status in ('draft', 'released', 'archived'));
  end if;

  -- Kernzusage: 'released' ohne freigegebene Version darf es nicht geben. Sonst könnte ein
  -- Gespräch als freigegeben gelten und trotzdem keinen Kontext haben.
  if not exists (select 1 from pg_constraint
                 where conname = 'bw_applications_released_needs_version_check'
                   and conrelid = 'public.bw_applications'::regclass) then
    alter table public.bw_applications add constraint bw_applications_released_needs_version_check
      check (status <> 'released' or released_version is not null);
  end if;
end $$;

alter table public.bw_applications enable row level security;
drop policy if exists bw_no_anon on public.bw_applications;

-- ── Unveränderliche Inhaltsversionen ─────────────────────────────────────────
-- Genau ein Seitenentwurf (page) und genau ein Gesprächskontext (voice) je Version.
-- Seite und Gespräch nutzen damit garantiert denselben freigegebenen Stand.
create table if not exists public.bw_application_content (
  application_id text    not null references public.bw_applications(id) on delete cascade,
  version        integer not null,
  page           jsonb   not null,
  voice          jsonb   not null,
  created_at     timestamptz not null default now(),
  released_at    timestamptz,                           -- null = Entwurf
  primary key (application_id, version)
);
-- Kein separater FK-Index nötig: der Primärschlüssel führt mit application_id.
alter table public.bw_application_content enable row level security;
drop policy if exists bw_no_anon on public.bw_application_content;

-- Freigegebene Versionen sind unveränderlich. Ohne das könnte ein Gespräch mitten im Lauf
-- anderen Text bekommen als die Seite, die der Empfänger gerade liest.
create or replace function public.bw_freeze_released_content()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.released_at is not null then
    raise exception
      'bw_application_content %/% ist freigegeben und unveraenderlich; neue Version anlegen',
      old.application_id, old.version
      using errcode = 'restrict_violation';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

-- NUR auf UPDATE. Mit DELETE im Trigger wäre eine freigegebene Version unlöschbar gewesen
-- und das ON DELETE CASCADE von bw_applications hätte nie gegriffen — kein Aufräumen, keine
-- DSGVO-Löschung, kein Widerruf. Gegen Textdrift genügt UPDATE; Löschen ist bewusst.
drop trigger if exists bw_freeze_released_content on public.bw_application_content;
create trigger bw_freeze_released_content
  before update on public.bw_application_content
  for each row execute function public.bw_freeze_released_content();

-- search_path fest verdrahtet, sonst wäre now() über einen untergeschobenen Suchpfad umlenkbar.
create or replace function public.bw_touch_applications_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists bw_touch_applications_updated_at on public.bw_applications;
create trigger bw_touch_applications_updated_at
  before update on public.bw_applications
  for each row execute function public.bw_touch_applications_updated_at();

-- ── DSGVO-Löschfunktionen ────────────────────────────────────────────────────
create or replace function public.bw_purge_old_pii() returns void
language sql security definer set search_path = public as $$
  delete from public.bw_build_jobs_pii where created_at < now() - interval '24 hours';
$$;
revoke all on function public.bw_purge_old_pii() from anon, authenticated;

create or replace function public.bw_purge_old_voice_pii() returns void
language sql security definer set search_path = public as $$
  update public.bw_voice_calls
     set transcript = null, turns = null, counterpart_phone = null
   where created_at < now() - interval '7 days'
     and (transcript is not null or turns is not null or counterpart_phone is not null);
$$;
revoke all on function public.bw_purge_old_voice_pii() from anon, authenticated;

-- ── EXECUTE von PUBLIC entziehen ─────────────────────────────────────────────
-- `revoke ... from anon, authenticated` allein reicht NICHT: Postgres gibt jeder neuen
-- Funktion EXECUTE an PUBLIC, und beide Rollen erben es darüber zurück. Der Supabase-Advisor
-- meldete die Purge-Funktionen deshalb als über /rest/v1/rpc aufrufbar — mit dem öffentlichen
-- anon-Key wären alle PII-Zeilen löschbar gewesen. (Derselbe Fehler steckt im Original 0001/0002.)
revoke all on function public.bw_bump_rate_limit(text, int, int) from public, anon, authenticated;
revoke all on function public.bw_purge_old_pii()                 from public, anon, authenticated;
revoke all on function public.bw_purge_old_voice_pii()           from public, anon, authenticated;
revoke all on function public.bw_freeze_released_content()       from public, anon, authenticated;
revoke all on function public.bw_touch_applications_updated_at() from public, anon, authenticated;

-- ── Realtime nur auf der PII-freien Tabelle ──────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.bw_build_jobs;
exception when duplicate_object then null;
end $$;

-- ── Storage-Buckets ──────────────────────────────────────────────────────────
-- Präfigiert wie rk-/ecms-/mc- in dieser Datenbank; 'cache'/'sites' wären hier zu generisch.
insert into storage.buckets (id, name, public) values
  ('bw-cache', 'bw-cache', false),
  ('bw-sites', 'bw-sites', true)
on conflict (id) do nothing;
-- Keine insert/update/delete-Policy für anon auf storage.objects ⇒ nur Service-Role schreibt.

-- ── DSGVO-Löschjobs scharf stellen ───────────────────────────────────────────
-- 0004_purge_cron.sql plant purge_old_pii/purge_old_voice_pii — die Funktionen des alten,
-- gelöschten Projekts. Hier existieren nur die bw_-Varianten; ohne eigene Jobs liefe für die
-- neuen Tabellen GAR KEIN Löschjob, und Anruf-Token, Mailadressen, Telefonnummern und
-- Transkripte blieben unbegrenzt liegen. Fristen wie im Original.
create extension if not exists pg_cron;

do $$ begin perform cron.unschedule('bw-purge-pii-hourly'); exception when others then null; end $$;
select cron.schedule('bw-purge-pii-hourly', '0 * * * *', $$ select public.bw_purge_old_pii(); $$);

do $$ begin perform cron.unschedule('bw-purge-voice-pii-daily'); exception when others then null; end $$;
select cron.schedule('bw-purge-voice-pii-daily', '17 3 * * *', $$ select public.bw_purge_old_voice_pii(); $$);
