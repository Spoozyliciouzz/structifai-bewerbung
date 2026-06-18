# Rules — DSGVO / Datenschutz

- **Zweckbindung:** PII (Email/Telefon) nur für einmalige Auslieferung dieser Bewerbung.
  Kein CRM, kein Newsletter, kein Tracking/Pixel.
- **Löschung <24h:** `build_jobs_pii` nach Auslieferung leeren (Cron + on-delivery).
  `build_jobs` (PII-frei) darf bleiben.
- **Auftragsverarbeiter benennen** (Datenschutz-Link/README): Supabase, Resend,
  Anthropic/LiteLLM, Vapi, ElevenLabs, Deepgram.
- **Einwilligung Voice:** ausdrückliche Opt-in-Checkbox + Zeitpunkt geloggt (`consent_at`).
- **Datenminimierung:** nur Email (+ optional Telefon bei Consent). Keine weiteren Felder.
- **Datenschutz-Link** in Landing-Footer Pflicht.
- Kein Anwalt: README weist darauf hin, dass Dennis UWG/DSGVO juristisch prüfen lässt.
