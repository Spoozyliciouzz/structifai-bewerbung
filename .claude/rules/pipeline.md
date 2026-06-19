# Rules — pipeline/

Orchestrator = Supabase Edge Function (Deno). Läuft im Request-Pfad, Ziel <60s.

- **Trennung PII:** insert in `build_jobs` (PII-frei) + `build_jobs_pii` (Service-Role).
  Client liest nur `build_jobs` via Realtime. Niemals Email/Telefon in `build_jobs` schreiben.
- **Stages** schreiben Fortschritt nach `build_jobs` (stage, stage_note, stage_done):
  `enrich · scrape · extract · match · generate · deploy · email [· call]`.
- **match+generate = EINE Sonnet-Runde.** Nie zwei LLM-Runden im Request-Pfad (Budget).
- **Fehlerpolitik:** Fehler Stage 1–7 ⇒ `status=error`. Fehler Stage 8 (call) ⇒ Build bleibt
  `done` (Mail ist raus).
- **Gate vor jeder Mutation:** CORS-Origin-Check, Rate-Limit (IP/Domain), Token/PoW,
  eine Bewerbung/Email. Erst dann insert.
- **Secrets** nur via `Deno.env`. Service-Role-Client nur server-seitig.
- **Output ist untrusted:** render/site.ts + Resend-HTML escapen jeden interpolierten Wert.
- LLM-Call: LiteLLM (`LITELLM_BASE_URL`) primär, `api.anthropic.com` Fallback, Prompt-Caching
  für statische System-/Profil-Teile.
