# Build-Plan — „Bewerbung als Maschine"

Master-Spec: `BRIEFING.md`. Profil-Wahrheit: `profile/dennis.json` (verifiziert, §13).
Status: **Code vollständig, lokal verifiziert.** Live-Deploy + reale Seeds brauchen Credentials (s.u.).

## M0 — Scaffold ✅
- [x] Repo-`CLAUDE.md`, `.claude/rules/{scraper,pipeline,voice,dsgvo}.md`
- [x] `.gitignore` (§15), Bun-Workspaces, `tsconfig.json` (strict), `.env.example`
- [x] `profile/dennis.json` (public-safe, Marker entfernt), `SECURITY.md`, `README.md`
- [x] `bun install` grün, Tree wie §5

## M1 — Scraper offline ✅ (Code) / ⏳ (realer Seed)
- [x] `schema.ts` (Zod) · `auth.ts` · `scrapeJob.ts` · `enrich.ts` · `extract.ts` · `llm.ts` · `storage.ts`
- [x] Synthetische Fixtures (`tests/fixtures/`) für Offline-Tests
- [ ] **Realer Seed** `cache/job-4428605958.json`: braucht LinkedIn-Login (`bun run scrape:auth`)
- [ ] **`enrich strategyframe.ai` >500 Zeichen:** braucht Netz/Live (Funktion getestet via htmlToText-Unit)

## M2 — DB/Migration ✅ (Code) / ⏳ (Deploy)
- [x] `0001_init.sql` — Tabellen, RLS deny-by-default, Buckets, Realtime, Storage-Policies,
      Rate-Limit-RPC, submission_guard, PII-Purge (§6/§9/§16)
- [ ] **`supabase db push` + RLS-Live-Test (anon-Write/PII-Read):** braucht Projekt

## M3 — Orchestrator ✅ (Code) / ⏳ (Deploy)
- [x] `render/site.ts` (escaped + CSP), `build/index.ts` (Stages 1–7), `lib/validate.ts`
- [x] LLM LiteLLM→Anthropic-Fallback, CORS, PoW, Rate-Limit, Honeypot, one-per-email, PII-Purge
- [ ] **E2E <60s-Messung:** braucht Deploy + echte LLM/Resend-Keys

## M4 — Landing ✅
- [x] `index.html` (Simulationsmodus + Realtime, PoW, mobil/Fokus/reduced-motion, Honeypot)
- [x] `netlify.toml` (Rewrite /b/* → Bucket + CSP/Hardening-Header)

## M5 — Voice-Encore ✅ (Code) / ⏳ (manuelle Tests)
- [x] `voice/outbound.ts` (Vapi, DE, KI-Disclosure 1. Satz, Handoff „1", 3 A/B-Skripte)
- [x] Stage 8 + Consent-Log + Voice-Abuse-Gate (Domain-Allowlist)
- [ ] **≥20 manuelle Testanrufe** (Voicemail, Abbruch, Handoff): braucht Vapi/ElevenLabs-Account

## Tests ✅
- [x] Unit: Zod-Gate, enrich-strip, Email/E.164/slug, render-XSS+CSP — **15/15 grün**
- [x] Verifiziert: `bun run typecheck` ✓ · `deno check` (Orchestrator+Voice) ✓
- [ ] Integration: Orchestrator mit gemocktem LLM/Resend/Vapi (optional, braucht Deno-Test-Harness)

## Offen — braucht Dennis (Credentials/Accounts/Recht)
- Supabase-Projekt + Secrets, Netlify-Deploy, Resend-Domain (SPF/DKIM/DMARC)
- LinkedIn-Seed, LLM-Gateway-Key, Vapi+ElevenLabs, Spend-Caps
- Juristische Prüfung UWG §7 / DSGVO (kein Anwalt)
- Vor Public: supabase-js SRI/self-host, Git-History secret-frei, Branch-Protection
