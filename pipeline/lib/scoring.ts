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
