# Bewerbung als Maschine

Eine Bewerbung, die **das Produkt ist, nicht beschreibt.** Der Empfänger gibt auf
`structifai.de/bewerbung` seine Email ein, sieht einem Agenten beim Bauen zu und erhält in
<60s eine frisch gerenderte, auf ihn zugeschnittene Bewerbungsseite — mit einem eigenen
KI-Sprachassistenten (Famulor-Widget), der direkt im Browser Fragen dazu beantwortet.
Web baut live → Mail landet → Seite antwortet selbst.

Bewerber: **Dennis Benter** · Ziel: die jeweils freigegebene Bewerbung, aktuell LM IT Services AG (`lm-2786630`).

## Architektur

```
landing/      statisches HTML + vanilla JS (Netlify) — Front-Door, Live-Console, Reveal
scraper/      Bun + Playwright — offline 1× zum Seeden (auth, scrapeJob, enrich, extract)
pipeline/     Supabase Edge Function (Deno) — Orchestrator; render/site.ts; bw-famulor-webhook/
profile/      dennis.json — verifizierte Track-Record-Fakten (einzige Quelle für match+generate)
```

Pipeline (Request-Pfad, <60s): `enrich → scrape → extract → match+generate → render → deploy →
email`. Der Famulor-Assistent (Prompt aus `bun run famulor:prompt`) wird als eigener,
Encore-Schritt außerhalb des 60s-Budgets angelegt.

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
Projekt ist das geteilte `hhxwojewbtegovzdxpfw` (Structifai-Central, Tabellen-Präfix `bw_`) —
kein eigenes Projekt. Migrationen laufen **nicht** über `supabase db push` (die geteilte
Migrations-History gehört auch anderen Repos), sondern per Supabase-MCP `apply_migration`
mit Namen `bw_<thema>`; die Dateien unter `pipeline/supabase/migrations/` sind Dokumentation.

```bash
supabase link --project-ref hhxwojewbtegovzdxpfw --workdir pipeline

# Function-Secrets EXPLIZIT setzen — NICHT `--env-file .env` benutzen:
# der `SUPABASE_`-Prefix ist reserviert (URL/Service-Role/Anon sind in Edge Functions
# automatisch da) und die PUBLIC_*-Werte gehören in die Landing-CONFIG, nicht hierher.
supabase secrets set --workdir pipeline \
  LLM_API_KEY="sk-ant-..." \
  RESEND_API_KEY="re_..." \
  RESEND_FROM="Dennis Benter <bewerbung@structifai.de>" \
  FAMULOR_WEBHOOK_TOKEN="..."
# optional (LLM-Routing): LITELLM_BASE_URL  (leer ⇒ direkt api.anthropic.com)

supabase functions deploy build --no-verify-jwt --use-api --workdir pipeline
supabase functions deploy bw-famulor-webhook --no-verify-jwt --use-api --workdir pipeline
```
`--no-verify-jwt` ist Pflicht: es gibt kein `config.toml`, der Default ist verify_jwt=true, und
die Landing ruft `build` ohne Authorization-Header auf (Schutz läuft über PoW + Rate-Limit +
CORS + Honeypot) — ohne das Flag bekommt jeder Submit 401.

Endpoint: `…/functions/v1/build`. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` werden in der
Function **automatisch injiziert** — nur der Scraper braucht sie lokal in `.env` für den
Bucket-Upload. Job-Cache hochladen: `scraper/cache/job-4428605958.json` → privater `cache`-Bucket.

### 2. Netlify
- `landing/` deployen, `netlify.toml` (Repo-Root) enthält Rewrite `/b/*` → `sites`-Bucket.
- `CONFIG` in `index.html` mit den `PUBLIC_*`-Werten füllen (leer ⇒ Simulationsmodus).

### 3. Sprachassistent (Famulor)
- Ein Famulor-Assistent je Bewerbung: `bun run famulor:prompt applications/<id>.json` erzeugt
  den Prompt, per MCP `update_assistant` einspielen. Der Widget-Key ist kein CONFIG-Wert,
  sondern läuft mit dem Inhalt selbst durch die Pipeline: `applications/<id>.json › voice.famulor`
  → `seed:application` → `bw_applications.famulor_widget_key` → `build` → Site-JSON
  `voice.widget_key` → `build.html` mountet das Widget damit. `app.famulor.io` in CSP
  (`script-src`/`connect-src`/`frame-src`) und Famulor „Allowed Origins“.

## Definition-of-Done-Checklisten

**Constraints**
- [ ] DSGVO: Zweckbindung, PII-Löschung <24h, Datenschutz-Link, Auftragsverarbeiter benannt (inkl. Famulor).
- [ ] Voice: Widget nur auf `/b/*`, Prompt nur aus `famulor:prompt`, kein REST-Aufruf gegen Famulor
      (Plan ohne API); Bot identifiziert sich sofort als KI.
- [ ] Zustellbarkeit: Resend von verifizierter `structifai.de` mit SPF/DKIM/DMARC.
- [ ] Abuse: Rate-Limit IP/Domain, eine Bewerbung/Email, Bot-Check.
- [ ] RLS: `build_jobs` PII-frei, `build_jobs_pii` keine anon-Policy, Secrets nur Function-Secrets.

**Public-Repo-Härtung**
- [ ] Keine Secrets im Repo/History; `.gitignore` deckt `.env*`, `scraper/.auth/`, `cache/`.
- [ ] Service-Role-Key nie client/Repo. `profile/dennis.json` ohne interne Marker.
- [ ] Spend-Caps (Resend/LLM). Kuratierter Public-Branch.

**Trust-Boundaries**
- [ ] Alle Outputs HTML-escaped + CSP. Prompt-Injection-Delimiter. RLS deny-by-default getestet.
- [ ] Storage-Writes service-role-only. Endpoint token+rate-limit-gated. CORS auf structifai.de.

## Rechtlicher Hinweis
Kein Anwalt: DSGVO-Aspekte (inkl. Auftragsverarbeitung durch Famulor) sind nach bestem Wissen
umgesetzt; Dennis lässt sie vor Live-Betrieb juristisch prüfen.
