-- ════════════════════════════════════════════════════════════════════════════
-- 0007_famulor.sql — Sprachkanal wechselt von Twilio-Rückruf auf Famulor-Web-Widget.
-- Additiv: keine Spalte fällt weg. PII-Spalten des Twilio-Pfads (phone, call_consent,
-- call_token*) bleiben leer stehen.
-- ════════════════════════════════════════════════════════════════════════════

-- Welcher Famulor-Assistent + welches Widget gehört zur Bewerbung. Beides nicht geheim
-- (Widget-Key ist per Design public), aber Stammdaten, keine Inhaltsversion.
alter table public.bw_applications
  add column if not exists famulor_assistant_id text,
  add column if not exists famulor_widget_key   text;
create unique index if not exists bw_applications_famulor_assistant_idx
  on public.bw_applications (famulor_assistant_id) where famulor_assistant_id is not null;

-- Anbieter-neutraler Name für die externe Call-ID (war twilio_call_sid, unique bleibt).
-- Idempotent: ein Re-Run darf nicht scheitern, wenn die Spalte schon umbenannt ist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bw_voice_calls'
      and column_name = 'twilio_call_sid'
  ) then
    alter table public.bw_voice_calls rename column twilio_call_sid to provider_call_id;
  end if;
end $$;

alter table public.bw_voice_calls add column if not exists summary text;  -- PII, < 7 Tage

-- Purge nimmt die Zusammenfassung mit. Gleiche Form wie 0006 (language/security/search_path) —
-- `create or replace` behält die dort gesetzten Grants/Revokes des Funktionsobjekts.
create or replace function public.bw_purge_old_voice_pii() returns void
language sql security definer set search_path = public as $$
  update public.bw_voice_calls
     set transcript = null, turns = null, counterpart_phone = null, summary = null
   where created_at < now() - interval '7 days'
     and (transcript is not null or turns is not null or counterpart_phone is not null
          or summary is not null);
$$;

-- Hinweis: bw_voice_agent_context (0006) hat seit dem Widget-Umbau keinen Leser mehr; bleibt
-- additiv stehen (Prompt-Quelle ist jetzt pipeline/voice/context-fallback.json).
