# Rules — pipeline/voice/ (Twilio ConversationRelay)

Encore, NICHT im 60s-Budget. UWG §7 + Abuse-Gate sind blockierend. Architektur-Details:
`.claude/rules/twilio.md` (Outbound-Nummer) + `.claude/rules/conversationrelay.md` (WS/Reasoning).

- **Auslösung nur wenn ALLE wahr:** `callConsent === true` && gültige E.164-Nummer && Empfänger
  zugelassen (Email-Domain in `VOICE_ALLOWLIST_DOMAINS` **oder** server-erzeugter Token). Trigger-Endpoint
  `outbound-trigger` nur Server-zu-Server aus `build/` mit `TRIGGER_SHARED_SECRET` — nie für freie
  Nummern auslösbar (sonst Robocall-Generator + UWG-Haftung). Rate-Limit, eine Bewerbung/Email.
- **Consent geloggt:** `call_consent=true` + `consent_at` in `build_jobs_pii`, vor Trigger prüfen.
- **Bot-Disclosure im ERSTEN Satz:** „KI-Assistent von Dennis Benter, kein Mensch." Kein Verkauf,
  kein Werbecharakter.
- **Echtes Kurzgespräch, kein Skript-Bot:** Agent kennt Dennis (Profil/Projekte/FAQ aus
  `voice_agent_context`, Fallback `context-fallback.json`), beantwortet 1–3 Fragen ehrlich (Lücken
  benennen: HubSpot bekannt aber nicht produktiv; kein Top-Abschluss). ~60–120 s, Deutsch, warm.
- **Closing (Kern-Mechanik):** Verweis auf die **Nummer in der gerade zugestellten Mail** —
  „in der Mail, die du eben bekommen hast, steht eine Nummer; ruf da an, dann hast du Dennis direkt
  am Apparat." Dann `{type:"end"}`. (Nummer = `DENNIS_PHONE`, klingelt direkt bei Dennis.)
- **Kein Twilio-Inbound.** Empfänger ruft NICHT die Twilio-Nummer zurück, sondern Dennis' Handy aus
  der Mail. Keine Flüsteransage, keine Bridge — Dennis geht direkt ran.
- **Stimme: Schwelle, kein Optimierungsprojekt.** ElevenLabs DE-Stimme (in ConversationRelay
  konfiguriert), muss „klingt wie normaler deutscher Mensch am Telefon" bestehen. 1–2 PSTN-Testanrufe an
  eigene Nummer (8 kHz degradiert TTS, Browser-Preview lügt). Eigennamen (StrategyFrame, Benter) sauber.
- **DSGVO:** `voice_calls` RLS dicht; Transkript < 7 Tage (`purge_old_voice_pii`); Auftragsverarbeiter
  Twilio/Anthropic-LiteLLM/ElevenLabs benannt.
