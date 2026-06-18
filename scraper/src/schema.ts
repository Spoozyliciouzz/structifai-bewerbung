import { z } from "zod";

/** Kategorien der Anforderungen — steuert Coverage-Badges + Matching. */
export const RequirementCategory = z.enum(["ops", "ai", "gov"]);
export type RequirementCategory = z.infer<typeof RequirementCategory>;

export const Requirement = z.object({
  /** Stabile, kebab-case ID (z.B. "agentic-automation") — für Matching-Join. */
  id: z.string().min(1).max(64),
  /** Menschlich lesbares Label, exakt aus der Anzeige abgeleitet. */
  label: z.string().min(1).max(240),
  category: RequirementCategory,
});
export type Requirement = z.infer<typeof Requirement>;

/**
 * Strukturierte Extraktion der Zielanzeige. Das harte Gate für `extract.ts`:
 * Output, der hier nicht parst, ist ein Fehler — kein Silent-Fail, kein Partial.
 */
export const JobExtract = z.object({
  company: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  requirements: z.array(Requirement).min(1).max(8),
  /** Die konkrete Bewerbungs-Aufforderung des Founders (die "zwei Fragen"). */
  application_ask: z.string().min(1).max(2000),
});
export type JobExtract = z.infer<typeof JobExtract>;

/** Rohes Scrape-Ergebnis aus `scrapeJob.ts`, in `cache`-Bucket abgelegt. */
export const JobCache = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  text: z.string(),
  scraped_at: z.string(),
});
export type JobCache = z.infer<typeof JobCache>;
