# Rules — DSGVO / Datenschutz

- **Zweckbindung:** PII (Email, optional Vorname/Rolle) nur für einmalige Auslieferung dieser Bewerbung.
  Kein CRM, kein Newsletter, kein Tracking/Pixel.
- **Löschung <24h:** `build_jobs_pii` nach Auslieferung leeren (Cron + on-delivery).
  `build_jobs` (PII-frei) darf bleiben.
- **Auftragsverarbeiter benennen** (Datenschutz-Link/README): Supabase, Resend, Anthropic/LiteLLM, Famulor.
- **Voice:** Besucherin startet das Widget selbst — keine Einwilligung nötig; Transkript < 7 Tage bei uns, ≤ 3 Monate bei Famulor.
- **Datenminimierung:** nur Email (+ optional Vorname/Rolle). Keine Telefonnummer.
- **Datenschutz-Link** in Landing-Footer Pflicht.
- Kein Anwalt: README weist darauf hin, dass Dennis UWG/DSGVO juristisch prüfen lässt.
