# Bewerbung als Maschine

Eine Bewerbung, die **das Produkt ist, nicht beschreibt.** Der Empfänger gibt auf
`structifai.de/bewerbung` seine Email ein, sieht einem Agenten beim Bauen zu und erhält in
<60s eine frisch gerenderte, auf ihn zugeschnittene Bewerbungsseite. Optional ruft danach ein
KI-Voice-Agent an und schließt den Loop. Web baut live → Mail landet → Telefon klingelt.

Bewerber: **Dennis Benter** · Ziel: **StrategyFrame.AI**, Chief of Staff (Anzeige 4428605958).

## Architektur

```
landing/      statisches HTML + vanilla JS (Netlify) — Front-Door, Live-Console, Reveal
scraper/      Bun + Playwright — offline 1× zum Seeden (auth, scrapeJob, enrich, extract)
pipeline/     Supabase Edge Function (Deno) — Orchestrator; render/site.ts; voice/outbound.ts
profile/      dennis.json — verifizierte Track-Record-Fakten (einzige Quelle für match+generate)
```

Pipeline (Request-Pfad, <60s): `enrich → scrape → extract → match+generate → render → deploy →
email`. `call` ist Encore außerhalb des Budgets.

## Setup

```bash
bun install
cp .env.example .env        # ausfüllen (siehe unten)
bun run typecheck
bun test
```

## Scraper seeden (einmalig, offline)

```bash
bun run scrape:auth                 # headful LinkedIn-Login → storageState (gitignored!)
bun run scrape:job 4428605958       # Job-Text → scraper/cache/ + cache-Bucket
bun run enrich strategyframe.ai     # public fetch, >500 Zeichen erwartet
```

## Deploy

### 1. Supabase
```bash
supabase link --project-ref qpxoggvbkbjluxkorgrp
supabase db push                                    # 0001_init.sql: Tabellen, RLS, Buckets, Realtime

# Function-Secrets EXPLIZIT setzen — NICHT `--env-file .env` benutzen:
# der `SUPABASE_`-Prefix ist reserviert (URL/Service-Role/Anon sind in Edge Functions
# automatisch da) und die PUBLIC_*-Werte gehören in die Landing-CONFIG, nicht hierher.
supabase secrets set \
  LLM_API_KEY="sk-ant-..." \
  RESEND_API_KEY="re_..." \
  RESEND_FROM="Dennis Benter <bewerbung@structifai.de>"
# optional (Encore, später): VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, ELEVEN_VOICE_ID,
#   DENNIS_PHONE, VOICE_SCRIPT_VARIANT, VOICE_ALLOWLIST_DOMAINS
# optional (LLM-Routing): LITELLM_BASE_URL  (leer ⇒ direkt api.anthropic.com)

supabase functions deploy build
```
Projekt: `https://qpxoggvbkbjluxkorgrp.supabase.co` · Endpoint: `…/functions/v1/build`.
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` werden in der Function **automatisch injiziert** —
nur der Scraper braucht sie lokal in `.env` für den Bucket-Upload.
Job-Cache hochladen: `scraper/cache/job-4428605958.json` → privater `cache`-Bucket.

### 2. Netlify
- `landing/` deployen, `landing/netlify.toml` enthält Rewrite `/b/*` → `sites`-Bucket.
- `CONFIG` in `index.html` mit den `PUBLIC_*`-Werten füllen (leer ⇒ Simulationsmodus).

### 3. Voice (optional)
- Vapi-Account, ElevenLabs DE-Stimme, `DENNIS_PHONE` setzen. ≥20 manuelle Testanrufe.

## Definition-of-Done-Checklisten

**Constraints**
- [ ] UWG §7: Voice nur Opt-in + Nummer + Consent geloggt; Bot identifiziert sich als KI; kein Werbecharakter.
- [ ] DSGVO: Zweckbindung, PII-Löschung <24h, Datenschutz-Link, Auftragsverarbeiter benannt.
- [ ] Zustellbarkeit: Resend von verifizierter `structifai.de` mit SPF/DKIM/DMARC.
- [ ] Abuse: Rate-Limit IP/Domain, eine Bewerbung/Email, Bot-Check, E.164 serverseitig, Voice-Gate.
- [ ] RLS: `build_jobs` PII-frei, `build_jobs_pii` keine anon-Policy, Secrets nur Function-Secrets.

**Public-Repo-Härtung**
- [ ] Keine Secrets im Repo/History; `.gitignore` deckt `.env*`, `scraper/.auth/`, `cache/`.
- [ ] Service-Role-Key nie client/Repo. `profile/dennis.json` ohne interne Marker.
- [ ] Voice-Abuse-Gate aktiv. Spend-Caps (Resend/Vapi/LLM). Kuratierter Public-Branch.

**Trust-Boundaries**
- [ ] Alle Outputs HTML-escaped + CSP. Prompt-Injection-Delimiter. RLS deny-by-default getestet.
- [ ] Storage-Writes service-role-only. Endpoint token+rate-limit-gated. CORS auf structifai.de.

## Rechtlicher Hinweis
Kein Anwalt: UWG §7 (Telefonwerbung) und DSGVO-Aspekte sind nach bestem Wissen umgesetzt;
Dennis lässt sie vor Live-Betrieb juristisch prüfen.
