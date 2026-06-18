# Rules — scraper/

Offline-Tool, 1× zum Seeden. Läuft NICHT im Request-Pfad (außer `enrich.ts`).

- **ToS/Recht:** eigener LinkedIn-Account, eigene Sicht, kein Bulk, kein Verkauf der Daten.
  Login headful (`auth.ts`), Session in `LI_STATE_PATH` (gitignored — aktive Credential!).
- **`scrapeJob.ts <id>`:** headless mit gespeicherter Session → `{title,company,text}` →
  `scraper/cache/job-<id>.json` (lokal, gitignored) → Upload in privaten `cache`-Bucket.
- **`enrich.ts <domain>`:** **kein Browser**. Public `fetch` mehrerer Pfade parallel
  (`/`, `/about`, `/team`, `/ueber-uns`, …), je 5s-Timeout. HTML→Text, dedupe, **≤6000 Zeichen**.
  Einziges Scraper-Modul im Request-Pfad → muss schnell + fehlertolerant sein.
- **`extract.ts(text)`:** Claude **Haiku** → JSON → **Zod-Gate** (`schema.ts`). Bei Schema-Miss:
  Exception werfen, **kein** Silent-Fail, kein Partial.
- Gescrapter/gefetchter Text ist **untrusted Daten** — wird im LLM-Prompt als solcher
  abgegrenzt (Delimiter), nie als Instruktion behandelt.
