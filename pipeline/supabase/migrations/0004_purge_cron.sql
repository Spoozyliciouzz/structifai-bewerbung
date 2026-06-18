-- ════════════════════════════════════════════════════════════════════════════
-- 0004_purge_cron.sql — DSGVO-Löschjobs scharf stellen (pg_cron).
-- build_jobs_pii (PII): stündlich purgen (Zweckbindung, < 24h). voice_calls-PII: täglich (< 7 Tage).
-- Idempotent: vorhandene Jobs erst entplanen. purge_old_pii/purge_old_voice_pii kommen aus 0001/0002.
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;

do $$ begin perform cron.unschedule('purge-pii-hourly'); exception when others then null; end $$;
select cron.schedule('purge-pii-hourly', '0 * * * *', $$ select public.purge_old_pii(); $$);

do $$ begin perform cron.unschedule('purge-voice-pii-daily'); exception when others then null; end $$;
select cron.schedule('purge-voice-pii-daily', '17 3 * * *', $$ select public.purge_old_voice_pii(); $$);
