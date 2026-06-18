# Design — Live-Build-Bewerbungsseite

**Datum:** 2026-06-17 · **Status:** Entwurf zur Freigabe

## 1. Kontext & Ziel

Die bestehende Bewerbung liefert nach Formular-Absenden eine statische, LLM-generierte Seite
(`render/site.ts`) plus optionalen KI-Anruf. Neues Ziel: ein **erlebbarer Live-Aufbau** — der
Empfänger sieht zu, wie sich eine auf ihn zugeschnittene Seite Stück für Stück baut, strukturiert in
drei Sektionen, mit animiertem Fit-Dashboard, und löst am Ende selbst den KI-Anruf aus.

Die Seite **ist** weiterhin das Produkt (Web + Anruf = eine Pipeline, solo gebaut). Der Live-Aufbau
macht das „Maschine, die sich selbst baut" sichtbar.

## 2. End-to-End-Flow

1. **Landing** — Formular (Felder s. §3.1). Klick **„Pipeline live erleben"** → `POST /build` →
   Response `{jobId, slug, callToken}` → öffnet **neuen Tab** `/b/{slug}?live=1`.
2. **Live-Build-Seite** — hört `build_jobs` Realtime (jobId). **Hybrid-Reveal** (§3.3): statische
   Sektionen animieren sofort, das **Fit-Dashboard ② wartet auf das echte `generate`-Done-Event** und
   zählt dann die Scores hoch. Unten Button **„Jetzt dem Assistenten Fragen stellen"**.
3. **Button-Klick** → `POST /request-call {jobId, callToken}` → server-seitiger Trigger des KI-Anrufs.
   **Parallel** (am `email`-Stage des Builds): Mail „Lieber [Vorname], du hast einen ersten Eindruck …
   ruf Dennis direkt an: [DENNIS_PHONE]".

## 3. Komponenten

### 3.1 Landing (`landing/index.html`)

Formularfelder:

| Feld | Pflicht | Nutzung |
|---|---|---|
| Email | ✅ | Auslieferung + submission_guard |
| Telefon (E.164) | optional (Pflicht bei Consent) | KI-Anruf |
| Consent-Checkbox | für Anruf | UWG §7, `consent_at` |
| Vorname | optional | Anrede: Seite, Anruf, Mail |
| Rolle | optional | Dashboard-Gewichtung + Anruf-Fokus |
| Lieblingseis | optional | humorvoller Closing im Anruf |

„Besucher-Kontext" = `{firstName, role, iceCream}` wird an `/build` mitgesendet, server-seitig in
`build_jobs_pii` gespeichert (PII-frei? — `role`/`iceCream` sind nicht streng PII, aber wir halten sie
bei den PII-Daten, da personenbezogen verknüpft). Nach „Pipeline live erleben" öffnet JS einen neuen
Tab auf die Live-Seite.

### 3.2 Build-Pipeline (`build/index.ts`)

- **`generate` erweitert:** Sonnet gibt zusätzlich **0–10-Scores** zurück — pro Dimension + ein
  Gesamt-Score. Ehrlich kalibriert (Lücke darf 4/10 sein). Rolle (falls vorhanden) gewichtet/sortiert
  die Dimensionen. Bleibt **eine** Sonnet-Runde (Budget §8).
- **Site-Data-JSON:** Build erzeugt `{slug}.json` (PII-frei) und lädt es in den `sites`-Bucket
  (public-read). Enthält alle Sektions-Daten (Schema §4.2). Die Live-Seite rendert daraus.
- **`callToken`:** Build erzeugt einen einmaligen Token (random), speichert ihn in `build_jobs_pii`
  (mit Ablauf), gibt ihn in der `/build`-Response zurück. Gate für `/request-call`.
- Stages weiter nach `build_jobs` (Realtime), unverändert in der Mechanik.

### 3.3 Live-Build-Seite (neu, statisch + JS, Netlify)

- Route `/b/{slug}` (Permalink) — lädt `{slug}.json`. Mit `?live=1` (frisch aus Landing): **animierter
  Hybrid-Aufbau** + Realtime-Subscription; ohne Flag: fertiger Stand **ohne** Animation (durables
  Artefakt). Ersetzt die alte statische `render/site.ts`-Seite.
- **Sektionen:**
  - **Header** (sofort): Profilfoto + „Dennis Benter → Chief of Staff @ {Company} · live im Aufbau".
  - **① Wer bin ich:** 3 Lifestyle-Fotos (Golf/Papa/Allgäu) + persönliche Punkte (Golfer ·
    frischgebackener Papa · Allgäuer) + Operator-Bullets. Animiert sofort.
  - **② Wie ich zur Stelle passe:** **Dashboard A** — großer Gesamt-Match-Ring + füllende Balken je
    Dimension, Zahlen zählen hoch. **Gated auf `generate`-Done**, Daten aus `{slug}.json`.
  - **③ Was ich gebaut habe:** 3 Case-Cards mit Icons (GartenAIden · Content-Pipeline/Fricke · Interne
    Tools: Reisekosten + Financial KPI) + „Weitere gebaute Websites"-Streifen (QMN, Upsidecode,
    PINEA Corsica als Links). Animiert.
  - **Call-CTA** (unten): Button „Jetzt dem Assistenten Fragen stellen".
- **Animation:** CSS-Transitions + minimal JS-Choreografie; `prefers-reduced-motion` respektiert
  (sofort fertig). Score-Count-up als JS.
- **CSP:** eigene Policy mit `script-src 'self'`, `img-src 'self' data:`, `connect-src` für Supabase
  Realtime/REST. (Die alte `script-src 'none'`-Seite entfällt für diese Route.)

### 3.4 `/request-call` Endpoint (neu, Edge Function)

- **Input:** `POST {jobId, callToken}` vom Browser (Live-Seite).
- **Gate:** Token gegen `build_jobs_pii` prüfen (gültig, nicht verbraucht, nicht abgelaufen) +
  `call_consent === true` + gültige E.164 + Domain-Allowlist + Rate-Limit. Token einmalig verbrauchen.
- **Aktion:** server-seitig `outbound-trigger` aufrufen (mit `TRIGGER_SHARED_SECRET` + Besucher-Kontext
  `{firstName, role, iceCream}`). **Shared-Secret bleibt server-seitig** — nie im Frontend.
- CORS auf structifai.de. Deploy `--no-verify-jwt` (eigene Token-Auth).

### 3.5 Email (`build/index.ts` `sendEmail`)

Neue Kopie, personalisiert mit Vorname, Verweis auf Dennis' direkte Nummer (`DENNIS_PHONE`) statt
Result-Link. Bleibt am `email`-Stage, parallel zur Live-Seite.

### 3.6 Voice-Agent (Kontext + Prompt)

- `relay`/`buildSystemPrompt`: `role` (Funktionsbereich spiegeln) + `iceCream` (humorvoller Closing)
  zusätzlich aus `customParameters` in den System-Prompt. Plumbing (firstName) steht bereits.
- `context-fallback.json`: **persönliche Fakten** (Golf · frischgebackener Papa, acht Wochen ·
  gebürtiger Allgäuer) als `personal`-Bucket, mit witzigem Tonfall (Anker: „… nutzt die gewonnene
  Wachzeit, um nachts noch einen Prompt abzusetzen"). **Website-Referenzen** (QMN, Upsidecode,
  PINEA Corsica) als gebaute Projekte/Links.

## 4. Datenmodell & Schemas

### 4.1 `build_jobs_pii` Ergänzungen
`first_name`, `role`, `ice_cream` (Besucher-Kontext), `call_token`, `call_token_expires_at`,
`call_token_used` (bool). Alles unter PII-Regime (<24h Löschung, Service-Role-only).

### 4.2 Site-Data-JSON (`{slug}.json`, PII-frei)
```jsonc
{
  "company": "StrategyFrame.AI",
  "title": "Chief of Staff",
  "personal": { "facts": ["Golfer", "frischgebackener Papa", "Allgäuer"], "photos": ["profile.jpg","golf.jpg","baby.jpg","allgaeu.jpg"] },
  "bullets": ["15 Jahre operativ …", "Generalist …", "…"],
  "fit": { "overall": 8.5, "dimensions": [ { "label": "Agentische Automatisierung", "score": 9 }, … ] },
  "cases": [ { "icon": "🌿", "name": "GartenAIden", "one": "…" }, … ],
  "websites": [ { "name": "QMN", "url": "https://www.qualitymedianetwork.de" }, … ]
}
```
Kein Vorname/Email/Telefon im JSON (PII-frei, public-read).

## 5. Sicherheit & DSGVO

- **Call-Trigger ohne Secret im Frontend** (Token-Pfad §3.4). Token einmalig + Ablauf.
- `{slug}.json` strikt PII-frei (kein Vorname/Email/Telefon). **Entscheidung:** öffentliche Seite bleibt
  **neutral** (keine Vornamen-Anrede) — Personalisierung mit Vorname nur in **Mail + Anruf**. Damit kein
  PII in URL/JSON. (Bei Bedarf später per Query-Param aktivierbar.)
- Besucher-Kontext in `build_jobs_pii`, <24h Löschung.
- Untrusted: alle LLM-/Eingabe-Werte escaped (Live-Seite rendert per `textContent`/escaped, kein
  innerHTML).
- Bestehende Gates (PoW, Rate-Limit, submission_guard, Honeypot, CORS) bleiben.

## 6. Entscheidungen (festgelegt)

- Live-Aufbau-Mechanismus: **Hybrid** (Choreografie + Dashboard gated auf echtes `generate`).
- Dashboard: **A** (Gesamt-Score-Ring + Balken).
- Scoring: **LLM vergibt 0–10** (ehrlich, rollen-gewichtet).
- Anruf-Auslöser: **Button** (kein Auto-Anruf) — bewusst: der Klick selbst ist ein Aha-Moment, der
  Nutzer löst die Pipeline-Stufe „Anruf" aktiv aus und sein Telefon klingelt.
- Live-Seite = **Permalink** `/b/{slug}`, ersetzt alte statische Seite.
- 4 Fotos in `assets/`.

## 7. Out of Scope (YAGNI)

- Kein A/B der Animationen, keine Mehrsprachigkeit, kein Login/Account.
- Kein Voice-Caller-Vapi-Altcode (separat in M5 entfernt).
- Keine Echtzeit-Token-Streaming-Darstellung des LLM-Texts (Hybrid reicht).

## 8. Offene Punkte / Risiken

- ~~Vorname auf öffentlicher Seite~~ → **entschieden (§5):** Seite neutral, Anrede in Mail + Anruf.
- **Realtime ohne Anruf:** Wenn kein Telefon/Consent, entfällt Button → Seite zeigt nur „ruf Dennis an".
- **Pacing:** Hybrid-Animation muss auf langsame Builds (LLM >Sekunden) warten können, ohne dass es
  „kaputt" wirkt (Dashboard-Skeleton/Spinner bis `generate`).
- Git: Repo noch nicht initialisiert → Spec wird nicht committet (manuell nachholen).

## 9. Implementierungs-Phasen (grob, Detail im Plan)

1. **Daten & Backend:** `generate`-Scores, Site-Data-JSON, `build_jobs_pii`-Felder, `callToken`.
2. **`/request-call`-Endpoint** (Token-Gate → outbound-trigger) + Voice-Prompt um role/iceCream.
3. **Live-Build-Seite** (Sektionen, Hybrid-Reveal, Dashboard A, Permalink, CSP).
4. **Landing** (neue Felder + neuer Tab) + **Email**-Kopie.
5. **Content/Assets:** Fotos, `personal`-Bucket + Website-Referenzen im Agent-Kontext.
6. **E2E-Test** (Live-Build + Anruf-Button + Mail), DSGVO-Check.
