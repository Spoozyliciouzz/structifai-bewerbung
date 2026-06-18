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

export interface SiteData {
  company: string;
  title: string;
  personal: { facts: string[] };
  bullets: string[];
  fit: { overall: number; dimensions: DimensionScore[] };
  cases: SiteCase[];
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
    cases: (a.profile.systems ?? []).slice(0, 8).map((s) => ({
      icon: s.icon ?? "•",
      name: s.name,
      one: s.one,
      kind: asKind(s.kind),
      ...(s.url ? { url: s.url } : {}),
      ...(s.image ? { image: s.image } : {}),
    })),
  };
}
