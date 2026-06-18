# Plan — Voice-Agent (Twilio ConversationRelay)

Quelle: Voice-BRIEFING (vom User). **Integriert** in `structifai-bewerbung` (kein Extra-Repo),
**selbes Supabase-Projekt** `qpxoggvbkbjluxkorgrp`. Ersetzt den Vapi-Schritt (§11).
Architektur: Claude = nur Text-Reasoning; STT/TTS = ConversationRelay; ElevenLabs = DE-Stimme.

## M0 — Scaffold ✅ (Code) / ⏳ (Deploy + Twilio-Config)
- [x] `0002_voice_init.sql` — `voice_calls` + `voice_agent_context`, RLS deny-by-default, Voice-PII-Purge (<7d)
- [x] `pipeline/voice/context-fallback.json` — public-safe Dennis-Kontext (aus `dennis.json`)
- [x] `pipeline/voice/types.ts` — ConversationRelay-Events + Call/Turn/Context-Typen
- [x] Rules `.claude/rules/{twilio,conversationrelay}.md`, `voice.md` (Vapi→CR)
- [x] `CLAUDE.md` Stack + Decision aktualisiert
- [x] **Env-Keys** in `.env` real gesetzt + via `secrets set --env-file .env` deployed (24 Secrets)
- [ ] **`supabase db push --workdir pipeline`** (Migration 0002 live) — nach Review
- [ ] **`bun run typecheck` / `deno check`** grün (sobald Funktions-Code da)

**Env-Namen (verbindlich, aus realer `.env` — weichen vom Briefing ab, Code folgt der `.env`):**
`TTS_PROVIDER`+`TTS_VOICE_ID` (statt ELEVEN_DE_VOICE_ID) · `DENNIS_PHONE` (statt DENNIS_MOBILE) ·
`VOICE_ALLOWLIST_DOMAINS` (statt RECIPIENT_ALLOWLIST) · `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
`TWILIO_NUMBER` · `EDGE_BASE_URL` · `TRIGGER_SHARED_SECRET`.
Offen/leer: `LITELLM_BASE_URL` (leer ⇒ LLM direkt an Anthropic via `LLM_API_KEY`). M5-Cleanup:
`unset VAPI_API_KEY VAPI_PHONE_NUMBER_ID ELEVEN_VOICE_ID` (Vapi-Reste, leer).

> ⛔ **BLOCKER (Stand 2026-06-17):** Twilio-Nummer im Kaufprozess, wartet auf Freigabe des
> Regulatory-Bundle durch Twilio (DE-Nummer). `TWILIO_NUMBER` in `.env` noch NICHT aktiv. → Code +
> Deploy gehen; **Live-Konfig/Testanrufe/Akzeptanz erst nach Freigabe**. Kein Call auf inaktive Nummer.

> 🔄 **KONZEPT-ÄNDERUNG (2026-06-17):** Kein Twilio-Inbound mehr. Anruf ist angekündigt → Empfänger
> nimmt ab. Closing verweist auf **Nummer in der Mail** (= `DENNIS_PHONE`, klingelt direkt bei Dennis).
> Twilio nur Outbound (US-Toll-Free `+18333669753` ok, niemand ruft sie zurück). Twilio-Console-Setup:
> Caller-ID verifiziert ✅, Geo-Permissions DE ✅, Account=Trial (Test only; Prod = Upgrade).

## M1 — Inbound — ❌ ENTFÄLLT (Konzept-Änderung)
- [x] Gebaut + wieder entfernt: `inbound/index.ts`, `twilio-sig.ts`, `dialWithWhisper`/`whisperGather` gelöscht,
      `inbound`-Function undeployed. `timingSafeEqual` nach `lib/validate.ts` verschoben (von voice-gate genutzt).

## M2 — Outbound + ConversationRelay (Agent spricht DE) — Code ✅ / Live ⛔ (Nummer-Freigabe)
- [x] `lib/twiml.ts` `connectConversationRelay` — `<Connect><ConversationRelay>` + `<Parameter>`, escaped, Bun-getestet
- [x] `lib/voice-gate.ts` `authorizeOutbound` — Shared-Secret (konstant-zeit) + E.164 + Allowlist, fail-closed, getestet
- [x] `outbound-trigger/index.ts` — Gate → Rate-Limit (RPC) → voice_calls-Log → Twilio Calls-API (inline TwiML) → `{callId,callSid}`
- [x] `relay/index.ts` — WS: setup → KI-Disclosure-Intro (Agent spricht zuerst); prompt-Stub mit `TODO(M3)`
- [x] Tests 9/9 neu (gesamt 35) · `deno check` ✓ · deployed `--no-verify-jwt` · Smoke: bad-secret→401, relay non-ws→426
- [ ] ⛔ *Akzeptanz:* Testanruf an eigene Nummer, Stimme spricht Intro auf Deutsch (nach Freigabe)
- [ ] ⛔ `EDGE_BASE_URL`/`RELAY_WSS_URL` beim 1. Call prüfen (wss-Host muss stimmen)

## M3 — Reasoning-Loop (echtes Gespräch) — Code ✅ + LIVE verifiziert (ohne Twilio)
- [x] `pipeline/voice/claude.ts` — Streaming (SSE), LiteLLM→Anthropic-Fallback, `claude-sonnet-4-6`, max 320 tok
- [x] `pipeline/voice/context.ts` — `voice_agent_context` (DB) laden, Fallback `context-fallback.json`
- [x] `pipeline/lib/conversation.ts` — End-of-Talk (Marker), System-Prompt-Bau, INTRO, CLOSING (Mail-Nummer)
- [x] `relay/index.ts` neu verdrahtet — setup→Intro, prompt→Claude-Stream→Tokens, End-of-Talk→Closing→`{type:"end"}`, MAX_TURNS=8
- [x] Tests 6/6 neu (gesamt 32) · `deno check` ✓ · deployed
- [x] **LIVE-Smoke (WS direkt, kein Twilio):** setup→Intro ✓, prompt→geerdete DE-Antwort gestreamt ✓
- [x] **ECHTER PSTN-Anruf erfolgreich** (nach Twilio-Upgrade): deutsche ElevenLabs-Stimme, Agent spricht + reagiert ✓
- [x] **Bugfix:** `ttsProvider` war `AmazonPolly` (ungültig, Error 64101) → `ElevenLabs` + voice leer = DE-Default
- [x] **Vorname-Ansprache:** `customParameters.firstName` → `buildIntro`/`buildSystemPrompt`; trigger reicht `firstName` durch

## Content (context-fallback.json) — Interview-getrieben ✅
- [x] Interview kompiliert: 15 FAQ, 5 Projekte, 4 Objections, 1 Story, `the_role` komplett (Chief of Staff)
- [x] Abgedeckt: why_them/why_me, Verfügbarkeit, Gehalt-Deflect, Führung+Stil, Wechselgrund, Architekt-statt-Entwickler, Business-Perspektive, Antrieb/Vision, tool-agnostisch, Handwerker-Beispiel
- [x] Iterations-Tool `voice-ask.ts` (WS, kein Telefon, keine Secrets) — bleibt im Repo
- [ ] Optional Runde 3: mehr Stories, Branchen-/Edge-Fragen (Datenschutz, „schon gescheitert?")
- [ ] Optional: DB-Tabelle `voice_agent_context` seeden (dann Live-Edit ohne Redeploy)

## Housekeeping ✅
- [x] Rate-Limit-Test-Override (`VOICE_RL_PHONE/DOMAIN_LIMIT`) zurückgesetzt → Default strikt (Phone 1/24h)
- [x] Wegwerf-Secret-Scripts gelöscht (testcall/callstatus/alerts); `RELAY_WSS_URL` gesetzt (korrekt)

## M4 — Persistenz + DSGVO
- [ ] Turns/Transcript nach `voice_calls` (Service-Role) im `relay` (callId aus setup.customParameters)
- [ ] Purge < 7 Tage (`purge_old_voice_pii`, optional pg_cron) + RLS-Test (anon = denied)
- (kein Inbound-Logging mehr — Konzept-Änderung)

## M5 — Integration mit build/ + Mail
- [ ] **`build/index.ts` Mail um `DENNIS_PHONE` erweitern** (Rückruf-Nr — sonst kennt Empfänger sie nicht) ⚠️ Konzept-kritisch
- [ ] `build/index.ts` Stage 8: statt `voice/outbound.ts`(Vapi) → `POST outbound-trigger` mit `TRIGGER_SHARED_SECRET` + `firstName`
- [ ] **Vorname erfassen:** Landing-Formular Vorname-Feld → build → `outbound-trigger {firstName}` (Plumbing steht, Quelle fehlt)
- [ ] Alte `voice/outbound.ts` (Vapi) entfernen; Vapi-Secrets `unset`
- [ ] Landing: Telefonfeld + Consent-Checkbox (`callConsent`/`consent_at`) — Flow steht in Architektur
- [ ] E2E aus bewerbung-maschine; Shared-Secret+Allowlist-Gate greift

## Doc-Politur offen
- [ ] `conversationrelay.md` Closing-Text, `CLAUDE.md` Decision aufs neue Konzept (Inbound entfällt)

## Tests
- [ ] Unit: End-of-Talk, E.164, TwiML-Builder (Connect/Dial/Whisper), Token-Gate
- [ ] Integration: Relay-WS mit gemocktem CR-Event-Stream + gemocktem Claude
- [ ] E2E: echter Outbound-Testanruf + Inbound-Rückruf mit Whisper
- [ ] Voice: 1–2 PSTN-Anrufe — menschlich, Eigennamen sauber, nicht blechern

## Offen — braucht Dennis (Accounts/Recht)
- Twilio: Account-SID/Auth-Token/Nummer kaufen+Voice, `DENNIS_MOBILE`, Spend-Caps + Alerts
- ElevenLabs DE-Voice-ID aus Twilios CR-Liste
- `TRIGGER_SHARED_SECRET` generieren, `RECIPIENT_ALLOWLIST` setzen
- Juristische Prüfung UWG §7 / DSGVO (kein Anwalt)
