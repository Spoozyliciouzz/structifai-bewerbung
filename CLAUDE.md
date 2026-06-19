# CLAUDE.md — Bewerbung als Maschine

Die Bewerbung **ist** das Produkt: Email rein → Agent baut live → personalisierte Seite
per Mail in <60s → optional KI-Anruf. Profil-Wahrheit:
`profile/dennis.json` (verifiziert, einzige Quelle für match+generate — nicht raten/aufblähen).

## Stack
- Runtime/Build: **Bun** (nie npm/yarn). TypeScript **strict**, kein `any`.
- Frontend: statisches HTML + vanilla JS (Netlify).
- Backend: **Supabase Edge Functions (Deno)** + Realtime. Postgres + RLS.
- Scraper: Playwright (Chromium), gespeicherter `storageState` (offline, 1× zum Seeden).
- LLM: Claude. Extraktion **Haiku**, match+generate **Sonnet** (1 Runde). Routing LiteLLM→Fallback.
- Email **Resend** (structifai.de) · Voice **Twilio ConversationRelay** (STT/TTS) + Claude Sonnet
  (Reasoning, Text) + ElevenLabs DE-Stimme · Hosting **Netlify**.

## Befehle
- `bun install` · `bun run typecheck` (Bun-Seite) · `bun test`
- `deno check pipeline/supabase/functions/build/index.ts pipeline/voice/outbound.ts` (Deno-Seite)
- `bun run scrape:auth` (headful Login) · `bun run scrape:job 4428605958`
- `bun run enrich strategyframe.ai` · `echo "<text>" | bun run extract`
- `supabase functions deploy build` · `supabase db push`

## Harte Regeln (Sicherheit/DSGVO — siehe `.claude/rules/` + `SECURITY.md`)
- Service-Role-Key nur in Function-Secrets. Nie Client, nie Repo. Bypasst RLS.
- `build_jobs` = **keine PII**. `build_jobs_pii` = keine anon-Policy. PII-Löschung <24h.
- Alle gefetchten/eingegebenen Strings sind **untrusted Daten** → HTML-escapen + CSP.
- Voice nur Opt-in + Nummer + Domain-Allowlist/Token. Bot sagt sofort: KI im Auftrag von Dennis.
- Endpoint: Rate-Limit (IP/Domain) + Token + eine Bewerbung/Email. CORS auf structifai.de.
- LinkedIn-`storageState` = aktive Session → gitignored. Nie committen.
- Vor Custom-Code: GitHub nach Lib prüfen (supabase-js, zod, playwright, Vapi-SDK).

## Decisions
- **Deno-Code aus Bun-tsconfig excluded** (`pipeline/supabase/functions` + `pipeline/voice`):
  nutzt Deno-Global/JSON-Imports, geprüft via `deno check`, nicht Bun-tsc. `render/site.ts` +
  `lib/validate.ts` sind pure TS → von beiden Runtimes importierbar + Bun-getestet.
- **Job-Cache nicht committed**: gescrapter LinkedIn-Text bleibt lokal/im Bucket (ToS +
  Authentizität). Tests nutzen synthetische Fixture `tests/fixtures/job-sample.txt`.
- **Slug**: `crypto.randomUUID()`-Kurzform (12 hex) — nicht ratbar, kollisionsarm, keine PII.
- **Rate-Limit**: Postgres-Counter pro IP+Domain im Service-Role-Pfad (kein externer State).
- **enrich parallel** mit 5s-Timeout pro Pfad; Gesamt-Cap, damit 60s-Budget hält.
- **`profile/dennis.json` public-safe**: keine VERIFY-Marker, keine Prozess-Kommentare.
- **Voice = Twilio ConversationRelay statt Vapi** (eigenes Teilprojekt, im selben Repo+Supabase-Projekt
  integriert, nicht als Extra-Repo). Claude liefert nur Text, kein roher Audio-Layer. Functions:
  `outbound-trigger` · `relay` (WS) · `inbound` unter `pipeline/supabase/functions/`. Tabellen
  `voice_calls`/`voice_agent_context` via `0002_voice_init.sql`. Rules: `.claude/rules/twilio.md`,
  `conversationrelay.md`, `voice.md`. Alte `voice/outbound.ts` (Vapi) wird in M5 ersetzt.

## Lessons Learned
- **`SUPABASE_`-Prefix ist in Edge Functions reserviert.** `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
  `SUPABASE_ANON_KEY` sind automatisch injiziert; `supabase secrets set` lehnt den Prefix ab.
  Function-Secrets explizit setzen (LLM_API_KEY, RESEND_*, Voice), NICHT `--env-file .env`.
  Die SUPABASE_*-Werte braucht nur der lokale Scraper-Upload.
- **Projekt-Ref:** `qpxoggvbkbjluxkorgrp` (in netlify.toml, .env.example, README, Landing-CONFIG verdrahtet).
- **Alle `supabase`-CLI-Befehle mit `--workdir pipeline`.** Repo-Layout ist `pipeline/supabase/`,
  nicht `./supabase/`. Ohne Flag laufen `db push`/`functions deploy` gegen leeres root-`supabase/`
  → Silent-Noop ("Remote database is up to date" trotz nicht-angewandter Migration). Link 1× je
  Workdir setzen (`supabase link --project-ref … --workdir pipeline`).
- **`functions deploy` mit `--use-api`** (server-seitiges Bundling) — lokales Docker nicht nötig.
