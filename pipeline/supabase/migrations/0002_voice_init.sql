-- ════════════════════════════════════════════════════════════════════════════
-- 0002_voice_init.sql — Voice-Agent (Twilio ConversationRelay)
-- Eigene Tabellen im selben Projekt wie 0001_init. Telefonnummer + Transkript sind
-- personenbezogen (DSGVO): RLS deny-by-default (keine Policy ⇒ nur Service-Role).
-- Transkripte < 7 Tage (purge-Funktion + optional pg_cron). KEIN Realtime (PII).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Anruf-Log (outbound + inbound), Service-Role-only ────────────────────────
-- Inbound-Rückrufe (direction='inbound') sind ein heißes Signal: wer zurückruft,
-- will reden. Wird mitgeloggt, bevor an Dennis durchgestellt wird.
create table if not exists public.voice_calls (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid,                              -- aus build_jobs (optional, kein FK: inbound hat keinen Job)
  direction         text not null,                     -- outbound | inbound
  counterpart_phone text,                              -- PII
  twilio_call_sid   text unique,
  status            text not null default 'initiated', -- initiated|ringing|in-progress|completed|failed
  duration_seconds  int,
  transcript        text,                              -- PII, DSGVO: < 7 Tage löschen
  turns             jsonb,                             -- [{role, content, ts}]
  created_at        timestamptz not null default now(),
  ended_at          timestamptz
);
-- RLS an, KEINE Policy ⇒ für anon/authenticated komplett dicht (Idiom aus 0001,
-- vgl. build_jobs_pii). Nur der Service-Role-Key (bypasst RLS) kommt heran.
alter table public.voice_calls enable row level security;

-- Defensive Drops, falls Supabase-Defaults existieren.
drop policy if exists no_anon on public.voice_calls;
-- Keine (re)create — Abwesenheit von Policies = deny-by-default.

create index if not exists voice_calls_job_idx on public.voice_calls (job_id);
create index if not exists voice_calls_created_idx on public.voice_calls (created_at);

-- ── Kontext-Store für den Reasoning-Loop ─────────────────────────────────────
-- id ∈ {'profile','projects','faq'}. content = public-safe JSON (aus profile/dennis.json
-- abgeleitet). Wird per Script geseedet; relay/lib/context.ts liest hier, Fallback =
-- gebündeltes pipeline/voice/context-fallback.json. Kein PII, kein Realtime nötig —
-- aber konsistent dicht halten.
create table if not exists public.voice_agent_context (
  id         text primary key,                         -- 'profile' | 'projects' | 'faq'
  content    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.voice_agent_context enable row level security;
drop policy if exists no_anon on public.voice_agent_context;
-- Keine Policy ⇒ dicht. Edge-Function liest mit Service-Role.

-- ── DSGVO: Transkript-Purge (< 7 Tage) ───────────────────────────────────────
-- Löscht nur die PII-Felder (transcript/turns/counterpart_phone), behält die
-- PII-freie Zeile (direction/status/duration) als anonymes Signal.
create or replace function public.purge_old_voice_pii() returns void
language sql security definer set search_path = public as $$
  update public.voice_calls
     set transcript = null, turns = null, counterpart_phone = null
   where created_at < now() - interval '7 days'
     and (transcript is not null or turns is not null or counterpart_phone is not null);
$$;
revoke all on function public.purge_old_voice_pii() from anon, authenticated;

-- Optional (wenn pg_cron-Extension aktiv):
-- select cron.schedule('purge-voice-pii', '17 3 * * *', $$ select public.purge_old_voice_pii(); $$);
