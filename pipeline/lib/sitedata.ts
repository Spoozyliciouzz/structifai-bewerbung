/** PII-freies Render-Datenmodell der Live-Build-Seite ({slug}.json, public-read). */
import { coerceScore, overallScore, type DimensionScore } from "./scoring.ts";

/** Case-Art: "visual" = Hero-Galerie mit Screenshot+Link, "voice" = KI-Assistent (Call-Button),
 *  "icon" = kompakte Icon-Karte (non-visuelle Automatisierung). */
export type CaseKind = "visual" | "voice" | "icon";

export interface SiteCase {
  icon: string;
  name: string;
  one: string;
  kind: CaseKind;
  url?: string; // Live-Link (visual)
  image?: string; // Asset-Dateiname in /assets (visual)
}

/**
 * Freigegebener n=1-Seiteninhalt einer Bewerbung (bw_application_content.page).
 * Alle Felder optional: eine Bewerbung ohne freigegebene Seite rendert weiterhin nur den
 * agnostischen Teil. Die Werte landen im öffentlich lesbaren {slug}.json und werden in
 * build.html ausschließlich über textContent gesetzt, nie über innerHTML.
 */
export interface ApplicationPage {
  hero?: { eyebrow?: string; headline?: string; lead?: string };
  why?: { eyebrow?: string; headline?: string; body?: string[]; source_url?: string; source_label?: string };
  contributions?: {
    eyebrow?: string; headline?: string;
    items?: Array<{ title?: string; body?: string }>;
    cases?: Array<{ pill?: string; title?: string; body?: string; caption?: string; url?: string }>;
  };
  fit_heading?: { eyebrow?: string; headline?: string };
  conversation?: { eyebrow?: string; headline?: string; body?: string };
  company_reference?: {
    label?: string; observation?: string; source_url?: string; source_label?: string;
  };
  work_sample?: {
    module?: string; eyebrow?: string; headline?: string;
    sandbox_enabled?: boolean; sandbox_disabled_reason?: string;
    lead?: string; journey_label?: string;
    journey?: Array<{ title?: string; body?: string }>;
    note?: string[]; takeaway?: { label?: string; text?: string };
  };
  ninety_days?: {
    eyebrow?: string; headline?: string;
    steps?: Array<{ range?: string; title?: string; body?: string }>;
  };
  /**
   * Ehrlicher Abgleich mit der Anzeige. Ersetzt die früheren selbstvergebenen Punktzahlen:
   * eine Zahl, die man sich selbst gibt, ist gegenüber einer Recruiterin schwer zu
   * verteidigen. Stufen und Belege sind vorab geschrieben und freigegeben, nicht zur
   * Laufzeit erzeugt. Lücken werden gezeigt, nicht kaschiert.
   */
  fit?: Array<{ requirement?: string; level?: string; evidence?: string }>;
  conversation_starters?: string[];
  sources?: Array<{ id?: string; url?: string; finding?: string; retrieved?: string }>;
}

export interface SiteData {
  company: string;
  title: string;
  personal: { facts: string[] };
  bullets: string[];
  fit: { overall: number; dimensions: DimensionScore[] };
  cases: SiteCase[];
  /** Nur gesetzt, wenn die Bewerbung eine freigegebene Seite hat. */
  page?: ApplicationPage;
  /** Famulor-Web-Widget dieser Bewerbung. Fehlt ⇒ Voice-Karte ohne Aktion. */
  voice?: { widget_key: string };
}

interface ProfileSystem {
  name: string;
  one: string;
  icon?: string;
  kind?: string; // wird auf CaseKind validiert (untrusted JSON)
  url?: string;
  image?: string;
}

function asKind(k: string | undefined): CaseKind {
  return k === "visual" || k === "voice" ? k : "icon";
}

interface BuildArgs {
  company: string;
  title: string;
  profile: {
    personal?: { facts?: string[] };
    bullets?: string[];
    systems?: ProfileSystem[];
  };
  fitDimensions: DimensionScore[];
  /** Freigegebener Seiteninhalt der Bewerbung, roh aus jsonb. */
  page?: unknown;
  /** Public Widget-Key aus bw_applications.famulor_widget_key; null/leer ⇒ kein Widget. */
  widgetKey?: string | null;
}

// ── Aufbereitung des freigegebenen Seiteninhalts ─────────────────────────────
// Der Inhalt ist redaktionell, kommt aber aus der Datenbank und landet in einer öffentlich
// lesbaren Datei. Deshalb hier dieselbe Disziplin wie beim übrigen SiteData: Längen und
// Listengrößen begrenzen, Typen erzwingen, Unbekanntes weglassen. Escaping passiert in
// build.html über textContent.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Text mit Obergrenze; alles andere als String fällt weg. */
function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

/** Nur http(s) — verhindert javascript:- und data:-Ziele in Links. */
function url(v: unknown): string | undefined {
  const s = str(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
}

/** Objekt nur übernehmen, wenn mindestens ein Feld übrig bleibt. */
function keep<T extends Record<string, unknown>>(o: T): T | undefined {
  return Object.values(o).some((v) => v !== undefined) ? o : undefined;
}

/** Leere Liste ⇒ undefined, damit keep() den Block nicht wegen [] für befüllt hält. */
function nonEmpty<T>(xs: T[] | undefined): T[] | undefined {
  return xs && xs.length ? xs : undefined;
}

/** Liste aus Texten, jeder begrenzt; Nicht-Texte fallen weg. */
function strList(v: unknown, maxItems: number, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return nonEmpty(v.map((s) => str(s, max)).filter((s): s is string => !!s).slice(0, maxItems));
}

/** Überschrift-Paar, das mehrere Abschnitte teilen. */
function heading(v: unknown): { eyebrow?: string; headline?: string } | undefined {
  return isRecord(v) ? keep({ eyebrow: str(v.eyebrow, 160), headline: str(v.headline, 240) }) : undefined;
}

export function coercePage(raw: unknown): ApplicationPage | undefined {
  if (!isRecord(raw)) return undefined;

  const hero = isRecord(raw.hero)
    ? keep({ eyebrow: str(raw.hero.eyebrow, 160), headline: str(raw.hero.headline, 240), lead: str(raw.hero.lead, 800) })
    : undefined;

  const ref = isRecord(raw.company_reference)
    ? keep({
        label: str(raw.company_reference.label, 120),
        observation: str(raw.company_reference.observation, 600),
        source_url: url(raw.company_reference.source_url),
        source_label: str(raw.company_reference.source_label, 160),
      })
    : undefined;

  const ws = isRecord(raw.work_sample)
    ? keep({
        module: str(raw.work_sample.module, 60),
        eyebrow: str(raw.work_sample.eyebrow, 160),
        headline: str(raw.work_sample.headline, 240),
        // Standard ist AUS: ein fehlendes oder kaputtes Feld darf nie versehentlich einen
        // Testbereich freischalten, der nicht existiert.
        sandbox_enabled: raw.work_sample.sandbox_enabled === true,
        sandbox_disabled_reason: str(raw.work_sample.sandbox_disabled_reason, 400),
        lead: str(raw.work_sample.lead, 800),
        journey_label: str(raw.work_sample.journey_label, 160),
        journey: Array.isArray(raw.work_sample.journey)
          ? nonEmpty(raw.work_sample.journey.filter(isRecord)
              .map((s) => ({ title: str(s.title, 120), body: str(s.body, 600) }))
              .filter((s) => s.title).slice(0, 6))
          : undefined,
        note: strList(raw.work_sample.note, 4, 900),
        takeaway: isRecord(raw.work_sample.takeaway)
          ? keep({ label: str(raw.work_sample.takeaway.label, 160), text: str(raw.work_sample.takeaway.text, 400) })
          : undefined,
      })
    : undefined;

  const nd = isRecord(raw.ninety_days)
    ? keep({
        eyebrow: str(raw.ninety_days.eyebrow, 160),
        headline: str(raw.ninety_days.headline, 240),
        steps: Array.isArray(raw.ninety_days.steps)
          ? raw.ninety_days.steps.slice(0, 6).filter(isRecord).map((s) => ({
              range: str(s.range, 40), title: str(s.title, 120), body: str(s.body, 600),
            }))
          : undefined,
      })
    : undefined;

  // Unbekannte Stufen werden auf "solide" gezogen, nicht auf "stark" — ein Tippfehler darf
  // nie zu einer stärkeren Aussage führen, als beabsichtigt war.
  const fit = Array.isArray(raw.fit)
    ? raw.fit.slice(0, 12).filter(isRecord).map((f) => {
        const lvl = str(f.level, 20)?.toLowerCase();
        return {
          requirement: str(f.requirement, 160),
          level: (lvl === "stark" || lvl === "lücke" || lvl === "luecke") ? (lvl === "luecke" ? "lücke" : lvl) : "solide",
          evidence: str(f.evidence, 600),
        };
      }).filter((f) => f.requirement)
    : undefined;

  const why = isRecord(raw.why)
    ? keep({
        eyebrow: str(raw.why.eyebrow, 160), headline: str(raw.why.headline, 240),
        body: strList(raw.why.body, 4, 1200),
        source_url: url(raw.why.source_url), source_label: str(raw.why.source_label, 160),
      })
    : undefined;

  const contributions = isRecord(raw.contributions)
    ? keep({
        eyebrow: str(raw.contributions.eyebrow, 160), headline: str(raw.contributions.headline, 240),
        items: Array.isArray(raw.contributions.items)
          ? nonEmpty(raw.contributions.items.filter(isRecord)
              .map((s) => ({ title: str(s.title, 120), body: str(s.body, 600) }))
              .filter((s) => s.title).slice(0, 3))
          : undefined,
        cases: Array.isArray(raw.contributions.cases)
          ? nonEmpty(raw.contributions.cases.filter(isRecord)
              .map((s) => ({
                pill: str(s.pill, 60), title: str(s.title, 120), body: str(s.body, 600),
                caption: str(s.caption, 200), url: url(s.url),
              }))
              .filter((s) => s.title).slice(0, 4))
          : undefined,
      })
    : undefined;

  const conversation = isRecord(raw.conversation)
    ? keep({
        eyebrow: str(raw.conversation.eyebrow, 160), headline: str(raw.conversation.headline, 240),
        body: str(raw.conversation.body, 800),
      })
    : undefined;

  const starters = Array.isArray(raw.conversation_starters)
    ? raw.conversation_starters.slice(0, 6).map((s) => str(s, 240)).filter((s): s is string => !!s)
    : undefined;

  const sources = Array.isArray(raw.sources)
    ? raw.sources.slice(0, 10).filter(isRecord).map((s) => ({
        id: str(s.id, 40), url: url(s.url), finding: str(s.finding, 400), retrieved: str(s.retrieved, 40),
      }))
    : undefined;

  return keep({
    hero, why, contributions, fit_heading: heading(raw.fit_heading), conversation,
    company_reference: ref, work_sample: ws, ninety_days: nd,
    fit: fit?.length ? fit : undefined,
    conversation_starters: starters?.length ? starters : undefined,
    sources: sources?.length ? sources : undefined,
  });
}

/** Famulor-Widget-Keys: `wgt_` + URL-sichere Zeichen. Alles andere ⇒ kein Widget. */
const WIDGET_KEY_RE = /^wgt_[A-Za-z0-9_-]{8,80}$/;

function widgetKey(v: string | null | undefined): string | undefined {
  return typeof v === "string" && WIDGET_KEY_RE.test(v) ? v : undefined;
}

/** Baut SiteData aus verifiziertem Profil + LLM-Fit. Scores werden geklemmt, Gesamt berechnet. */
export function buildSiteData(a: BuildArgs): SiteData {
  const dims = a.fitDimensions.map((d) => ({ label: String(d.label).slice(0, 80), score: coerceScore(d.score) }));
  const page = coercePage(a.page);
  const key = widgetKey(a.widgetKey);
  return {
    company: a.company,
    title: a.title,
    personal: { facts: a.profile.personal?.facts ?? [] },
    bullets: a.profile.bullets ?? [],
    fit: { overall: overallScore(dims), dimensions: dims },
    cases: (a.profile.systems ?? []).slice(0, 8).map((s) => ({
      icon: s.icon ?? "•",
      name: s.name,
      one: s.one,
      kind: asKind(s.kind),
      ...(s.url ? { url: s.url } : {}),
      ...(s.image ? { image: s.image } : {}),
    })),
    ...(page ? { page } : {}),
    ...(key ? { voice: { widget_key: key } } : {}),
  };
}

/** Was der Stellenteil bekommt: freigegebene Seite + Firma/Titel + Widget. Kein Profil, keine Scores. */
export interface ReleasedPage {
  company: string;
  title: string;
  page?: ApplicationPage;
  voice?: { widget_key: string };
}

export function buildReleasedPage(a: {
  company: string; title: string; page: unknown; widgetKey?: string | null;
}): ReleasedPage {
  const page = coercePage(a.page);
  const key = widgetKey(a.widgetKey);
  return {
    company: a.company,
    title: a.title,
    ...(page ? { page } : {}),
    ...(key ? { voice: { widget_key: key } } : {}),
  };
}
