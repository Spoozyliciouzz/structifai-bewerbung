# Rules — Sprachassistent (Famulor Web-Widget)

Gespräch im Browser auf `/b/{slug}`, gestartet von der Besucherin. Kein Anruf, keine Nummer,
kein Consent-Gate (UWG §7 greift nicht — sie initiiert). Encore, nicht im 60s-Budget.

- **Prompt = nur Regeln, Fakten kommen live aus der DB.** Generator: `bun run famulor:prompt
  applications/<id>.json` (Quelle: nur `speakableRole`/Regeltext aus `famulor-prompt.ts`) → MCP
  `update_assistant` — nie von Hand im Famulor-Editor pflegen, sonst driftet er. Zu Beginn jedes
  Gesprächs ruft der Assistent das Mid-Call-Tool `kontext_laden` → EF
  `bw-famulor-context/<application_id>` auf, das den AKTUELLEN, freigegebenen Stand aus der DB
  liefert (`buildContextPayload`). Globale Fakten stehen in `bw_voice_agent_context`
  (`bun run seed:voice-context`, nach jeder Änderung an `context-fallback.json`);
  bewerbungsspezifische Fakten in der freigegebenen Version von `bw_application_content.voice`
  (`bun run seed:application … --release`). Nichts Inhaltliches steckt mehr im Prompt selbst —
  einzige Ausnahme ist `first_message` (= `voice.intro`), die weiterhin mit dem Prompt
  ausgeliefert wird, weil sie vor dem ersten Tool-Aufruf gesprochen wird.
- **IDs stehen in `applications/<id>.json › voice.famulor`** und in `bw_applications`
  (`famulor_assistant_id`, `famulor_widget_key`). Widget-Key ist public; Assistant-ID unkritisch.
- **Widget nur auf `/b/*`.** Site-JSON trägt `voice.widget_key`; `build.html › buildVoiceSlide`
  mountet lazy per `OurAiCallingWidget.boot(key, host)`. Allowed Origins in Famulor pflegen.
  CSP an zwei Stellen (Meta in build.html, netlify.toml `/b/*`) — `app.famulor.io` in
  `script-src`, `connect-src`, `frame-src`.
- **Bot-Disclosure im ersten Satz** (`voice.intro`). Ehrlich, Lücken benennen, kein Verkauf,
  keine Preise/Zusagen. Closing = Kontakt auf dieser Seite (`voice.closing`).
- **Transkript:** Post-Call-Webhook (unsigniert) → `bw-famulor-webhook/<FAMULOR_WEBHOOK_TOKEN>` →
  `bw_voice_calls` (`provider_call_id` unique, `turns`, `summary`). Purge < 7 Tage
  (`bw_purge_old_voice_pii`). Kein `job_id` — das Widget kennt die Seite nicht.
- **DSGVO:** Auftragsverarbeiter Famulor (+ dessen Sub-Prozessoren) benennen; kein Recording
  (`recording_enabled: false`), kein Memory (`memory_mode: off`). Famulor-Retention 3 Monate
  (Workspace), unsere Kopie 7 Tage — die FAQ-Antworten nennen genau das.
- **Kein REST-API-Zugang im Plus-Plan** (`403 api_access_required`). Alles Programmatische läuft
  über MCP (Claude) oder Webhooks (Famulor → wir). Kein Code darf `app.famulor.io/api/v1` rufen.
