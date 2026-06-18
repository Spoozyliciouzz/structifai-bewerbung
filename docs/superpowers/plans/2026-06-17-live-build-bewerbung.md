# Live-Build-Bewerbungsseite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine erlebbare Live-Build-Bewerbungsseite — Empfänger sieht zu, wie sich eine auf ihn
zugeschnittene Seite (3 Sektionen, animiertes Fit-Dashboard) aufbaut, und löst per Button selbst den
KI-Anruf aus; parallel geht eine personalisierte Mail raus.

**Architecture:** Hybrid-Reveal — statische Sektionen (Profil/Personal/Cases) animieren clientseitig
sofort, das Fit-Dashboard ist auf das echte `generate`-Event (Realtime) getaktet und rendert aus einem
PII-freien `{slug}.json`. Der Anruf wird über einen token-gesicherten Endpoint ausgelöst (Shared-Secret
bleibt server-seitig). Spec: `docs/superpowers/specs/2026-06-17-live-build-bewerbung-design.md`.

**Tech Stack:** Bun (Tooling/Tests) · Deno (Supabase Edge Functions) · Supabase (Postgres, RLS,
Realtime, Storage) · Claude Sonnet (`generate`) · Twilio ConversationRelay (Anruf) · Resend (Mail) ·
statisches HTML+Vanilla-JS (Netlify).

**Verify-Rhythmus (statt Commits, da Repo noch nicht unter Git):** Nach jeder Task die angegebenen
Checks (`bun test` / `deno check` / Deploy + curl-Smoke). Sobald `git init` erfolgt ist, zusätzlich pro
Task committen (`git add … && git commit -m "…"`).

---

## Dateistruktur (was wird angefasst)

**Neu:**
- `pipeline/lib/scoring.ts` — pure: Score-Coercion/-Validierung (0–10) + Gesamt-Score-Berechnung
- `pipeline/lib/sitedata.ts` — pure: Typ `SiteData` + Builder aus Profil + LLM-Output
- `pipeline/supabase/functions/request-call/index.ts` — token-gesicherter Anruf-Auslöser
- `pipeline/supabase/migrations/0003_live_build.sql` — `build_jobs_pii`-Felder (Besucher-Kontext, callToken)
- `landing/build.html` — die Live-Build-Seite (Permalink `/b/{slug}`, JS-getrieben)
- `landing/assets/{profile,golf,baby,allgaeu}.jpg` — 4 Fotos
- `tests/scoring.test.ts`, `tests/sitedata.test.ts` — Unit-Tests

**Geändert:**
- `pipeline/supabase/functions/build/index.ts` — `generate` mit Scores, `{slug}.json`-Upload, callToken, Besucher-Kontext, neue Mail
- `pipeline/supabase/functions/relay/index.ts` — `role`/`iceCream` aus customParameters in Prompt
- `pipeline/lib/conversation.ts` — `buildSystemPrompt` um `role`/`iceCream` erweitern
- `pipeline/voice/types.ts` — `OutboundTriggerInput` um `role`/`iceCream`; `SiteData`-Re-Export
- `pipeline/voice/outbound-trigger/index.ts` — `role`/`iceCream` durchreichen
- `pipeline/voice/context-fallback.json` — `personal`-Bucket + Website-Referenzen
- `landing/index.html` — Felder (Vorname/Rolle/Eis) + „Pipeline live erleben" öffnet neuen Tab
- `landing/netlify.toml` — Rewrite `/b/*` → `build.html` (statt Bucket-HTML), CSP für Live-Seite
- `profile/dennis.json` — (bereits aktuell; ggf. Personal-Fakten ergänzen)

**Entfällt:** `pipeline/render/site.ts` (statische HTML-Seite) — durch `build.html` + `{slug}.json` ersetzt.

---

## Phase 1 — Backend-Daten-Fundament

### Task 1.1: Scoring-Logik (pure)

**Files:**
- Create: `pipeline/lib/scoring.ts`
- Test: `tests/scoring.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/scoring.test.ts
import { test, expect } from "bun:test";
import { coerceScore, overallScore, type DimensionScore } from "../pipeline/lib/scoring.ts";

test("coerceScore klemmt auf 0..10 und rundet", () => {
  expect(coerceScore(9.4)).toBe(9);
  expect(coerceScore(-2)).toBe(0);
  expect(coerceScore(99)).toBe(10);
  expect(coerceScore("7" as unknown as number)).toBe(7);
  expect(coerceScore(NaN)).toBe(0);
});

test("overallScore = gerundeter Durchschnitt (1 Dezimal)", () => {
  const dims: DimensionScore[] = [
    { label: "A", score: 9 }, { label: "B", score: 6 }, { label: "C", score: 9 },
  ];
  expect(overallScore(dims)).toBe(8); // (24/3)=8.0
  expect(overallScore([{ label: "X", score: 9 }, { label: "Y", score: 6 }])).toBe(7.5);
  expect(overallScore([])).toBe(0);
});
```

- [ ] **Step 2: Run, verify fail** — Run: `bun test tests/scoring.test.ts` · Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// pipeline/lib/scoring.ts
/** Pure Score-Helfer (0..10). Keine Runtime-Deps, Deno+Bun importierbar. */
export interface DimensionScore {
  label: string;
  score: number; // 0..10 (ganzzahlig)
}

/** Klemmt beliebigen Input auf ganzzahlig 0..10. Ungültig ⇒ 0. */
export function coerceScore(v: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

/** Gesamt-Score = Durchschnitt der Dimensionen, auf 1 Dezimal. Leer ⇒ 0. */
export function overallScore(dims: DimensionScore[]): number {
  if (!dims.length) return 0;
  const sum = dims.reduce((a, d) => a + coerceScore(d.score), 0);
  return Math.round((sum / dims.length) * 10) / 10;
}
```

- [ ] **Step 4: Run, verify pass** — Run: `bun test tests/scoring.test.ts` · Expected: PASS

- [ ] **Step 5: Checkpoint** — `bun run typecheck` grün. (git: `feat: pure scoring helpers`)

### Task 1.2: SiteData-Typ + Builder (pure)

**Files:**
- Create: `pipeline/lib/sitedata.ts`
- Test: `tests/sitedata.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/sitedata.test.ts
import { test, expect } from "bun:test";
import { buildSiteData } from "../pipeline/lib/sitedata.ts";

const PROFILE = {
  identity: { name: "Dennis Benter" },
  personal: { facts: ["Golfer", "frischgebackener Papa", "Allgäuer"] },
  bullets: ["15 Jahre operativ", "Generalist"],
  systems: [{ name: "GartenAIden", one: "Lead-Qualifizierer …" }],
  websites: [{ name: "QMN", url: "https://www.qualitymedianetwork.de" }],
};

test("buildSiteData mappt LLM-Fit + Profil zu PII-freiem SiteData", () => {
  const sd = buildSiteData({
    company: "StrategyFrame.AI", title: "Chief of Staff", profile: PROFILE,
    fitDimensions: [{ label: "Agentische Automatisierung", score: 9 }, { label: "Substanz", score: 6 }],
  });
  expect(sd.company).toBe("StrategyFrame.AI");
  expect(sd.fit.overall).toBe(7.5);
  expect(sd.fit.dimensions[0].score).toBe(9);
  expect(sd.personal.facts).toContain("Golfer");
  expect(sd.cases[0].name).toBe("GartenAIden");
  expect(sd.websites[0].url).toBe("https://www.qualitymedianetwork.de");
  // PII-frei: kein email/phone/firstName Feld
  expect(JSON.stringify(sd)).not.toMatch(/email|phone|firstName/i);
});
```

- [ ] **Step 2: Run, verify fail** — Run: `bun test tests/sitedata.test.ts` · Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// pipeline/lib/sitedata.ts
/** PII-freies Render-Datenmodell der Live-Build-Seite ({slug}.json, public-read). */
import { coerceScore, overallScore, type DimensionScore } from "./scoring.ts";

export interface SiteCase { icon: string; name: string; one: string }
export interface SiteWebsite { name: string; url: string }
export interface SiteData {
  company: string;
  title: string;
  personal: { facts: string[] };
  bullets: string[];
  fit: { overall: number; dimensions: DimensionScore[] };
  cases: SiteCase[];
  websites: SiteWebsite[];
}

interface BuildArgs {
  company: string;
  title: string;
  profile: {
    personal?: { facts?: string[] };
    bullets?: string[];
    systems?: Array<{ name: string; one: string; icon?: string }>;
    websites?: Array<{ name: string; url: string }>;
  };
  fitDimensions: DimensionScore[];
}

/** Baut SiteData aus verifiziertem Profil + LLM-Fit. Scores werden geklemmt, Gesamt berechnet. */
export function buildSiteData(a: BuildArgs): SiteData {
  const dims = a.fitDimensions.map((d) => ({ label: String(d.label).slice(0, 80), score: coerceScore(d.score) }));
  return {
    company: a.company,
    title: a.title,
    personal: { facts: a.profile.personal?.facts ?? [] },
    bullets: a.profile.bullets ?? [],
    fit: { overall: overallScore(dims), dimensions: dims },
    cases: (a.profile.systems ?? []).slice(0, 6).map((s) => ({
      icon: s.icon ?? "•", name: s.name, one: s.one,
    })),
    websites: a.profile.websites ?? [],
  };
}
```

- [ ] **Step 4: Run, verify pass** — Run: `bun test tests/sitedata.test.ts` · Expected: PASS

- [ ] **Step 5: Checkpoint** — `bun run typecheck` grün. (git: `feat: SiteData builder`)

### Task 1.3: Profil um personal/bullets/websites/icons erweitern

**Files:**
- Modify: `profile/dennis.json`

- [ ] **Step 1:** `personal: { facts: ["Golfer","frischgebackener Papa eines acht Wochen alten Jungen","gebürtiger Allgäuer"] }` ergänzen.
- [ ] **Step 2:** `bullets: [...]` (4–5 Operator-Punkte) ergänzen — Quelle für Sektion ①.
- [ ] **Step 3:** `websites: [{name:"QMN",url:"https://www.qualitymedianetwork.de"},{name:"Upsidecode",url:"https://www.upsidecode.de"},{name:"PINEA Corsica",url:"https://www.pinea-corsica.de/home/"}]`.
- [ ] **Step 4:** je `systems`-Eintrag ein `icon` ergänzen (GartenAIden 🌿, Content-Pipeline 📰, KI-Voice-Agent 📞, Beleg-Finder 🧾, Financial Dashboard 📊).
- [ ] **Step 5: Checkpoint** — `node -e "JSON.parse(require('fs').readFileSync('profile/dennis.json','utf8'))"` ok.

### Task 1.4: Migration — build_jobs_pii Besucher-Kontext + callToken

**Files:**
- Create: `pipeline/supabase/migrations/0003_live_build.sql`

- [ ] **Step 1: SQL schreiben**

```sql
-- 0003_live_build.sql — Besucher-Kontext + Call-Token (PII-Regime, Service-Role-only)
alter table public.build_jobs_pii
  add column if not exists first_name text,
  add column if not exists role text,
  add column if not exists ice_cream text,
  add column if not exists call_token text,
  add column if not exists call_token_expires_at timestamptz,
  add column if not exists call_token_used boolean not null default false;
-- RLS unverändert: keine Policy ⇒ Service-Role-only. Felder fallen unter <24h-Purge (purge_old_pii).
```

- [ ] **Step 2: Anwenden** — `supabase db push --workdir pipeline` · Expected: `0003` applied.
- [ ] **Step 3: Verify** — `supabase migration list --linked --workdir pipeline` zeigt `0003 | 0003`.

### Task 1.5: build/ — Scores im generate, SiteData-Upload, callToken, Besucher-Kontext, neue Mail

**Files:**
- Modify: `pipeline/supabase/functions/build/index.ts`

- [ ] **Step 1: Request-Body erweitern** — `firstName`, `role`, `iceCream` aus dem POST lesen (alle optional, escaped/trim). In `insertPii` mitschreiben.

- [ ] **Step 2: callToken erzeugen** — `const callToken = crypto.randomUUID().replace(/-/g,"");` in `insertPii` speichern (`call_token`, `call_token_expires_at = now()+30min`, `call_token_used=false`). In der HTTP-Response zusätzlich `callToken` zurückgeben: `json({ jobId, slug, callToken }, 202, origin)`.

- [ ] **Step 3: generate-Prompt um Scores erweitern** — JSON-Schema des Sonnet-Outputs ergänzen:

```
"fit": { "dimensions": [ { "label": <Anforderung>, "score": <0-10, ehrlich; Lücke niedrig> } ] }
```
Im System-Prompt: „Vergib pro Dimension einen ehrlichen Score 0–10 (eine echte Lücke darf 4 sein). Wenn ROLLE gegeben, sortiere die für diese Funktion relevanten Dimensionen nach oben." ROLLE (`role`) zusätzlich in den `user`-Teil geben.

- [ ] **Step 4: coerce + SiteData bauen** — `coerceGenerated` um `fit.dimensions` erweitern (mit `coerceScore`); dann `buildSiteData({company, title, profile, fitDimensions})` und als `{slug}.json` hochladen:

```ts
async function uploadSiteData(slug: string, data: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sites/${slug}.json`, {
    method: "POST",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`upload sitedata ${res.status}: ${await res.text()}`);
}
```

- [ ] **Step 5: render/site.ts-Upload entfernen** — alten `uploadSite(slug, html)`-Pfad ersetzen durch `uploadSiteData(slug, siteData)`. `result_url` = `${RESULT_BASE}/${slug}` (zeigt jetzt auf Live-Seite).

- [ ] **Step 6: Mail-Kopie neu** — `sendEmail(to, firstName)` → „Lieber ${firstName||'…'}, du hast einen ersten Eindruck gewonnen, wie Dennis zu euch passen könnte — er freut sich über deinen persönlichen Anruf. Einfach die Nummer wählen: ${DENNIS_PHONE}." (escaped; `DENNIS_PHONE` aus env).

- [ ] **Step 7: Checkpoint** — `deno check pipeline/supabase/functions/build/index.ts` grün; `bun test` grün; Deploy: `supabase functions deploy build --workdir pipeline --project-ref qpxoggvbkbjluxkorgrp --use-api`. Smoke: `curl -i …/build -d '{}'` → 400 `{"error":"email"}`.

---

## Phase 2 — Anruf-Endpoint + Voice-Prompt

### Task 2.1: types + outbound-trigger — role/iceCream durchreichen

**Files:**
- Modify: `pipeline/voice/types.ts`, `pipeline/supabase/functions/outbound-trigger/index.ts`

- [ ] **Step 1:** `OutboundTriggerInput` um `role?: string; iceCream?: string;` erweitern.
- [ ] **Step 2:** in `outbound-trigger` die `parameters` ergänzen: `...(role?{role}:{}), ...(iceCream?{iceCream}:{})`.
- [ ] **Step 3: Checkpoint** — `deno check pipeline/supabase/functions/outbound-trigger/index.ts` grün.

### Task 2.2: conversation.ts — buildSystemPrompt um role/iceCream

**Files:**
- Modify: `pipeline/lib/conversation.ts`, `tests/conversation.test.ts`

- [ ] **Step 1: Failing test**

```ts
test("buildSystemPrompt nutzt role und iceCream", () => {
  const sp = buildSystemPrompt({ profile: {}, projects: [], faq: [] }, "Thomas", "CFO", "Pistazie");
  expect(sp).toContain("CFO");
  expect(sp).toContain("Pistazie");
});
```

- [ ] **Step 2: Run, fail** — `bun test tests/conversation.test.ts`
- [ ] **Step 3: Implement** — Signatur `buildSystemPrompt(ctx, firstName?, role?, iceCream?)`. Zeilen ergänzen (in den `.filter(Boolean)`-Array):
```ts
role ? `Der Anrufer ist ${role} — spiegle Dennis' Stärken gezielt auf diesen Funktionsbereich.` : "",
iceCream ? `Der Anrufer mag ${iceCream} — biete am Ende humorvoll an, dass Dennis ihn beim persönlichen Kennenlernen auf ein ${iceCream}-Eis einlädt.` : "",
```
- [ ] **Step 4: Run, pass** — `bun test tests/conversation.test.ts`
- [ ] **Step 5: relay/index.ts** — `setup`: `role`/`iceCream` aus `msg.customParameters` lesen, an `buildSystemPrompt(ctx, firstName, role, iceCream)` geben.
- [ ] **Step 6: Checkpoint** — `bun test` grün; `deno check pipeline/supabase/functions/relay/index.ts`; Deploy relay (`--no-verify-jwt`).

### Task 2.3: request-call Endpoint

**Files:**
- Create: `pipeline/supabase/functions/request-call/index.ts`

- [ ] **Step 1: Implement** — POST `{jobId, callToken}`. Service-Role-Lookup in `build_jobs_pii` (jobId): prüfe `call_token === token` (timingSafeEqual), `!call_token_used`, `call_token_expires_at > now`, `call_consent === true`, `phone` E.164, Domain (aus gespeicherter Email-Domain bzw. Allowlist), Rate-Limit (`bump_rate_limit`). Bei OK: `call_token_used=true` setzen (atomar), dann `fetch(outbound-trigger, {Authorization: Bearer TRIGGER_SHARED_SECRET, body:{jobId, phone, email, firstName, role, iceCream}})`. CORS auf structifai.de. Response `{ok:true}` / Fehlercodes.

```ts
// Skelett — vollständige Gates analog outbound-trigger/build.
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const { jobId, callToken } = await req.json().catch(() => ({}));
  if (!jobId || !callToken) return json({ error: "bad_request" }, 400, origin);
  const pii = await fetchPii(jobId); // select * from build_jobs_pii where job_id=eq.jobId (service-role)
  if (!pii || !pii.call_token || pii.call_token_used) return json({ error: "token" }, 403, origin);
  if (!timingSafeEqual(pii.call_token, callToken)) return json({ error: "token" }, 403, origin);
  if (new Date(pii.call_token_expires_at) < new Date()) return json({ error: "expired" }, 403, origin);
  if (!pii.call_consent || !E164_RE.test(pii.phone ?? "")) return json({ error: "consent" }, 400, origin);
  if (!(await rateLimit(`call:${jobId}`, 86400, 1))) return json({ error: "rate_limited" }, 429, origin);
  await markTokenUsed(jobId);
  await fetch(`${SUPABASE_URL}/functions/v1/outbound-trigger`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SHARED_SECRET}` },
    body: JSON.stringify({ jobId, phone: pii.phone, email: pii.email, firstName: pii.first_name, role: pii.role, iceCream: pii.ice_cream }),
  });
  return json({ ok: true }, 200, origin);
});
```

- [ ] **Step 2: Checkpoint** — `deno check`; Deploy `--no-verify-jwt`; Smoke: `curl -i …/request-call -d '{}'` → 400 `bad_request`; mit falschem Token → 403 `token`.

---

## Phase 3 — Live-Build-Seite (`landing/build.html`)

### Task 3.1: Grundgerüst + Daten laden + Permalink

**Files:**
- Create: `landing/build.html`

- [ ] **Step 1:** HTML-Skelett (dunkel/gold, gleiche Fonts/Variablen wie `index.html`). CSP-Meta:
  `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://qpxoggvbkbjluxkorgrp.supabase.co wss://qpxoggvbkbjluxkorgrp.supabase.co`.
- [ ] **Step 2:** JS liest `slug` aus Pfad (`/b/{slug}`) und `live`-Flag aus Query. Fetch `${BUCKET}/storage/v1/object/public/sites/${slug}.json`. Bei `?live=1` zusätzlich Realtime-Subscribe auf `build_jobs` (jobId aus Query) — sonst direkt rendern (kein Animation).
- [ ] **Step 3: Checkpoint** — lokal serven (`bun -e` static server o. Netlify dev), `/b/<testslug>?live=0` rendert statisch.

### Task 3.2: Sektionen rendern (escaped) + Hybrid-Reveal

- [ ] **Step 1:** `renderSection1` (Header+Fotos+Personal+Bullets), `renderSection3` (Cases+Websites) — alle Werte via `textContent`/escaped, Fotos aus `assets/`. Reveal-Animation (CSS `.section{opacity:0;transform:translateY(8px)}` → `.in{...}`), `prefers-reduced-motion` = sofort.
- [ ] **Step 2:** `renderDashboard(fit)` — Gesamt-Ring (conic-gradient, JS-Count-up) + Balken je Dimension (width-Transition, Zahl zählt hoch). Erst rendern, wenn `generate`-Done (live) bzw. sofort (statisch).
- [ ] **Step 3:** Choreografie: ① und ③ sofort nacheinander einblenden; ② zeigt Skeleton/Spinner bis `generate`-Event, dann Count-up.
- [ ] **Step 4: Checkpoint** — visuell gegen Mockup (Dashboard A) prüfen.

### Task 3.3: Call-CTA-Button

- [ ] **Step 1:** Button unten „Jetzt dem Assistenten Fragen stellen". Sichtbar nur wenn `callToken` vorhanden (aus Query/sessionStorage von der Landing übergeben) **und** Consent/Telefon gegeben.
- [ ] **Step 2:** Klick → `POST /request-call {jobId, callToken}` → bei `{ok:true}` Button-Status „Dein Telefon klingelt gleich… ☎️", Button disabled. Fehler → freundliche Meldung.
- [ ] **Step 3: Checkpoint** — Klick gegen deployten `request-call` (echter Testanruf via Self-Test).

---

## Phase 4 — Landing + Email-Verdrahtung

### Task 4.1: Landing-Formular erweitern

**Files:**
- Modify: `landing/index.html`

- [ ] **Step 1:** Felder Vorname, Rolle, Lieblingseis (alle optional) ins Formular. Button-Text → „Pipeline live erleben".
- [ ] **Step 2:** Submit: Payload um `firstName,role,iceCream` erweitern; Realtime-Pfad unverändert. Nach `{jobId,slug,callToken}`: **neuen Tab** öffnen `window.open(`/b/${slug}?live=1&job=${jobId}`, "_blank")` und `callToken` via `sessionStorage`/URL an die Live-Seite übergeben (Token nicht in geteilter URL belassen → `sessionStorage` bevorzugt, da neuer Tab same-origin).
- [ ] **Step 3:** Simulationsmodus-Pfad analog anpassen (Demo ohne Backend).
- [ ] **Step 4: Checkpoint** — Landing lokal: Felder da, Klick öffnet neuen Tab.

### Task 4.2: netlify.toml — /b/* → build.html

**Files:**
- Modify: `landing/netlify.toml`

- [ ] **Step 1:** Rewrite `/b/*` → `/build.html` (SPA-style, Status 200) statt Bucket-Proxy. CSP-Header für `/b/*` entsprechend Task 3.1.
- [ ] **Step 2: Checkpoint** — Netlify-Config validieren.

---

## Phase 5 — Content & Assets

### Task 5.1: Fotos einbinden

**Files:**
- Create: `landing/assets/profile.jpg`, `golf.jpg`, `baby.jpg`, `allgaeu.jpg`

- [ ] **Step 1:** 4 Fotos (vom User geliefert, aus `I:\…\media\`) nach `landing/assets/` kopieren, web-optimiert (≤300 KB, ~1200px). Querformat-Fotos ggf. via CSS `object-fit` zuschneiden.
- [ ] **Step 2: Checkpoint** — Bilder laden auf `build.html` (img-src self).

### Task 5.2: Voice-Kontext — personal + Websites

**Files:**
- Modify: `pipeline/voice/context-fallback.json`, `pipeline/voice/types.ts`, `pipeline/lib/conversation.ts`

- [ ] **Step 1:** `personal`-Bucket: `{ hobby:"Golf", family:"frischgebackener Vater eines acht Wochen alten Sohnes", origin:"gebürtiger Allgäuer", tone_anchor:"warm, selbstironisch — dreht alles zurück auf Bauen/Bau-Drive" }`.
- [ ] **Step 2:** 1–2 `faq`/`personal`-Beispiele mit Ton-Anker (Schlaf-Witz: „… nutzt die gewonnene Wachzeit, um nachts noch kurz einen Prompt abzusetzen").
- [ ] **Step 3:** Website-Referenzen als Projekte/Links (QMN, Upsidecode, PINEA Corsica) — falls noch nicht in projects.
- [ ] **Step 4:** `AgentContext` um `personal?` erweitern (`types.ts`); `buildSystemPrompt` injiziert `personal` + Ton-Regel.
- [ ] **Step 5: Checkpoint** — `bun test`; Deploy relay; `bun voice-ask.ts "Oh, da bekommst du bestimmt wenig Schlaf?"` → witzige, kontext-treue Antwort.

---

## Phase 6 — E2E + DSGVO

### Task 6.1: End-to-End Self-Test

- [ ] **Step 1:** Landing (lokal/Netlify) ausfüllen (eigene verifizierte Nummer, Email `test@strategyframe.ai`-Domain auf Allowlist, Vorname/Rolle/Eis). „Pipeline live erleben".
- [ ] **Step 2:** Neuer Tab baut sich auf: ① sofort, ② Dashboard nach `generate`, ③ Cases. Mail kommt an.
- [ ] **Step 3:** Button „Fragen stellen" → Anruf kommt; Agent grüßt mit Vorname, spiegelt Rolle, bringt Eis-Pointe.
- [ ] **Step 4: Checkpoint** — Latenz grob, Inhalte korrekt.

### Task 6.2: DSGVO + Security-Check

- [ ] **Step 1:** `{slug}.json` öffentlich abrufen → **kein** Vorname/Email/Telefon enthalten.
- [ ] **Step 2:** `request-call` mit verbrauchtem/abgelaufenem/falschem Token → 403; ohne Consent → 400.
- [ ] **Step 3:** PII-Purge: `build_jobs_pii` (inkl. neue Felder + Token) wird <24h geleert (`purge_old_pii`).
- [ ] **Step 4:** Rate-Limit-Override (`VOICE_RL_*`) ist zurückgesetzt (Default strikt) — vor echten Empfängern.
- [ ] **Step 5: Checkpoint** — alle Gates grün, Plan abgeschlossen.

---

## Self-Review-Hinweise (beim Ausführen prüfen)
- **Typkonsistenz:** `DimensionScore` (scoring.ts) == `fit.dimensions` (sitedata.ts) == Live-Seite-Render.
- **callToken-Fluss:** build erzeugt → Response → sessionStorage → request-call verbraucht. Einmal-Nutzung atomar.
- **Permalink vs Live:** `?live=1` nur aus Landing; Permalink-Aufruf zeigt fertigen Stand ohne Re-Animation und ohne Call-Button (Token weg).
- **Entfall `render/site.ts`:** sicherstellen, dass kein Code mehr darauf importiert (build/ umgestellt, Tests `render.test.ts` entfernen/ersetzen).
