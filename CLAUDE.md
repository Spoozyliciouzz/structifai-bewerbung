# CLAUDE.md — Bewerbung als Maschine

Die Bewerbung **ist** das Produkt: Email rein → Agent baut live → personalisierte Seite
per Mail in <60s → Sprachassistent im Browser. Profil-Wahrheit:
`profile/dennis.json` (verifiziert, einzige Quelle für match+generate — nicht raten/aufblähen).

## Stack
- Runtime/Build: **Bun** (nie npm/yarn). TypeScript **strict**, kein `any`.
- Frontend: statisches HTML + vanilla JS (Netlify).
- Backend: **Supabase Edge Functions (Deno)** + Realtime. Postgres + RLS.
- Scraper: Playwright (Chromium), gespeicherter `storageState` (offline, 1× zum Seeden).
- LLM: Claude. Extraktion **Haiku**, match+generate **Sonnet** (1 Runde). Routing LiteLLM→Fallback.
- Email **Resend** (structifai.de) · Voice **Famulor Web-Widget** (ein Assistent je Bewerbung, Prompt aus Repo) · Hosting **Netlify**.

## Befehle
- `bun install` · `bun run typecheck` (Bun-Seite) · `bun test`
- `deno check pipeline/supabase/functions/build/index.ts pipeline/supabase/functions/bw-famulor-webhook/index.ts` (Deno-Seite)
- `bun run scrape:auth` (headful Login) · `bun run scrape:job 4428605958`
- `bun run enrich strategyframe.ai` · `echo "<text>" | bun run extract`
- `bun run famulor:prompt applications/<id>.json` → Prompt für MCP `update_assistant`
- `supabase functions deploy build --no-verify-jwt --use-api --workdir pipeline` (gleiche Flags für `bw-famulor-webhook`) · Migrationen: Supabase-MCP `apply_migration` (Name `bw_<thema>`), NICHT `db push` — s. Lessons

## Harte Regeln (Sicherheit/DSGVO — siehe `.claude/rules/` + `SECURITY.md`)
- Service-Role-Key nur in Function-Secrets. Nie Client, nie Repo. Bypasst RLS.
- `build_jobs` = **keine PII**. `build_jobs_pii` = keine anon-Policy. PII-Löschung <24h.
- Alle gefetchten/eingegebenen Strings sind **untrusted Daten** → HTML-escapen + CSP.
- Voice: Widget nur auf `/b/*`, Prompt nur aus dem Generator, kein REST gegen Famulor (Plan ohne API). Bot sagt sofort: KI im Auftrag von Dennis.
- Endpoint: Rate-Limit (IP/Domain) + Token + eine Bewerbung/Email. CORS auf structifai.de.
- LinkedIn-`storageState` = aktive Session → gitignored. Nie committen.
- Vor Custom-Code: GitHub nach Lib prüfen (supabase-js, zod, playwright).

## Decisions
- **Deno-Code aus Bun-tsconfig excluded** (`pipeline/supabase/functions`): nutzt Deno-Global,
  geprüft via `deno check`, nicht Bun-tsc. `pipeline/voice/` enthält seit dem Famulor-Umbau nur
  noch `context-fallback.json` (kein Deno-Code mehr) und braucht daher keinen Exclude mehr.
  `render/site.ts` + `lib/validate.ts` sind pure TS → von beiden Runtimes importierbar + Bun-getestet.
- **Job-Cache nicht committed**: gescrapter LinkedIn-Text bleibt lokal/im Bucket (ToS +
  Authentizität). Tests nutzen synthetische Fixture `tests/fixtures/job-sample.txt`.
- **Slug**: `crypto.randomUUID()`-Kurzform (12 hex) — nicht ratbar, kollisionsarm, keine PII.
- **Rate-Limit**: Postgres-Counter pro IP+Domain im Service-Role-Pfad (kein externer State).
- **enrich parallel** mit 5s-Timeout pro Pfad; Gesamt-Cap, damit 60s-Budget hält.
- **`profile/dennis.json` public-safe**: keine VERIFY-Marker, keine Prozess-Kommentare.
- **Voice = Famulor Web-Widget statt Twilio-Rückruf (2026-09-20).** Grund: Plus-Plan ohne REST-API;
  Showcase ist der Assistent, nicht das klingelnde Telefon. Ein Assistent je Bewerbung, Prompt aus
  `famulor-prompt.ts`, Transkript per Post-Call-Webhook. Rules: `.claude/rules/voice.md`.

## Lessons Learned
- **`SUPABASE_`-Prefix ist in Edge Functions reserviert.** `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
  `SUPABASE_ANON_KEY` sind automatisch injiziert; `supabase secrets set` lehnt den Prefix ab.
  Function-Secrets explizit setzen (LLM_API_KEY, RESEND_*, Voice), NICHT `--env-file .env`.
  Die SUPABASE_*-Werte braucht nur der lokale Scraper-Upload.
- **Projekt-Ref:** `hhxwojewbtegovzdxpfw` (Structifai-Central, geteilt, Präfix `bw_`; eigenes Projekt
  `qpxoggvbkbjluxkorgrp` ist seit 2026-09-15 gelöscht). Workdir `pipeline` ist darauf gelinkt.
- **Alle `supabase`-CLI-Befehle mit `--workdir pipeline`.** Repo-Layout ist `pipeline/supabase/`,
  nicht `./supabase/`. Ohne Flag laufen `functions deploy` gegen leeres root-`supabase/`
  → Silent-Noop. Link 1× je Workdir setzen (`supabase link --project-ref … --workdir pipeline`).
- **`functions deploy` mit `--use-api`** (server-seitiges Bundling) — lokales Docker nicht nötig.
- **`build` + `bw-famulor-webhook` immer `--no-verify-jwt` deployen** — es gibt kein `config.toml`,
  der Default ist verify_jwt=true; 2026-09-20 dadurch kurz 401 für die Landing. Die Landing ruft
  `build` ohne Authorization-Header auf, Schutz läuft über PoW + Rate-Limit + CORS + Honeypot.
- **Migrationen NICHT per `supabase db push`:** die geteilte Migrations-History enthält ~280
  Timestamp-Migrationen anderer Repos, die nummerierten Versionen 0006/0007 sind dort fremd belegt
  → push verweigert. Migrationen als Datei unter `pipeline/supabase/migrations/` ablegen (Doku) und
  per Supabase-MCP `apply_migration` mit Name `bw_<thema>` einspielen (so 0006 und 0007).
