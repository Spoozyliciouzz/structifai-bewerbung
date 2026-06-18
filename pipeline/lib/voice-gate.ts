/**
 * Pure Outbound-Voice-Gate (§voice.md / §9.2). Entscheidet, ob ein Anruf ausgelöst werden DARF —
 * ohne DB/Netz, damit Bun-testbar. Die DB-Gates (Rate-Limit, Logging) macht outbound-trigger drumherum.
 *
 * Reihenfolge bewusst: erst Auth (Shared-Secret), dann Form (E.164), dann Policy (Allowlist).
 */
import { E164_RE, emailDomain, timingSafeEqual } from "./validate.ts";

export type GateReason = "secret" | "phone" | "domain";
export interface GateResult {
  ok: boolean;
  reason?: GateReason;
}

export interface GateInput {
  /** Wert des Authorization-Headers, erwartet "Bearer <secret>". */
  authHeader: string | null;
  phone: string;
  email: string;
}

export interface GateConfig {
  /** TRIGGER_SHARED_SECRET (server-zu-server). Leer ⇒ alles abgelehnt (fail-closed). */
  sharedSecret: string;
  /** Zugelassene Email-Domains (VOICE_ALLOWLIST_DOMAINS), lowercase. */
  allowlist: string[];
}

/** true = Anruf erlaubt. Fail-closed: fehlendes Secret/Config ⇒ Ablehnung. */
export function authorizeOutbound(input: GateInput, cfg: GateConfig): GateResult {
  // 1. Auth — konstant-zeitiger Vergleich gegen "Bearer <secret>".
  const expected = `Bearer ${cfg.sharedSecret}`;
  if (!cfg.sharedSecret || !input.authHeader || !timingSafeEqual(input.authHeader, expected)) {
    return { ok: false, reason: "secret" };
  }
  // 2. Form — gültige E.164-Nummer.
  if (!E164_RE.test(input.phone)) return { ok: false, reason: "phone" };
  // 3. Policy — Empfänger-Domain auf der Allowlist.
  const domain = emailDomain(input.email);
  if (!domain || !cfg.allowlist.includes(domain)) return { ok: false, reason: "domain" };
  return { ok: true };
}
