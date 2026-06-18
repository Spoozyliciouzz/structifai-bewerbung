/**
 * Pure Validierungs-Helfer — keine Runtime-Deps, von Deno (Edge) und Bun (Tests)
 * importierbar. Einzige Quelle für Email-/E.164-/Slug-Regeln (kein Duplikat im Orchestrator).
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const E164_RE = /^\+[1-9]\d{7,14}$/;

export function isEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isE164(s: string): boolean {
  return E164_RE.test(s.trim());
}

/** Domain-Teil einer Email, lowercased. "" wenn ungültig. */
export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/** Nicht-ratbarer, kollisionsarmer Slug aus einer UUID (12 hex). */
export function makeSlug(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 12);
}

/** Konstant-zeitiger String-Vergleich (kein Early-Return-Timing-Leak), für Secret-Vergleiche. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
