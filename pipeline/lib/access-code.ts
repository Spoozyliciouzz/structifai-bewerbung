/**
 * Zugang zum Stellenteil. Der Code steht im Anschreiben und ist kurz genug zum Abtippen —
 * deshalb nur serverseitig geprüft (bw-open, Rate-Limit). Die Seiten-Adresse selbst ist lang
 * und nicht erratbar (PAGE_SLUG_RE), damit sie intern weitergeleitet werden darf.
 * Pure TS: von Bun (Tests, Scripts) und Deno (Edge Functions) importierbar.
 */

/** Ohne 0/O, 1/I/L — Codes werden aus einem Anschreiben abgetippt. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 16 Zufallsbytes base64url = 22 Zeichen. */
export const PAGE_SLUG_RE = /^[A-Za-z0-9_-]{22}$/;

const NORMALIZED_RE = /^[A-Z0-9]{3,16}$/;

/** Großschreibung, Leerzeichen und Bindestriche weg. Alles andere ⇒ null (nie raten). */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[\s-]+/g, "");
  return NORMALIZED_RE.test(s) ? s : null;
}

function randomIndex(n: number): number {
  // Rejection Sampling: kein Modulo-Bias.
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const b = buf[0] ?? 255;
    if (b < limit) return b % n;
  }
}

export function generateAccessCode(prefix: string): string {
  if (!/^[A-Z]{2,4}$/.test(prefix)) throw new Error("Präfix: 2–4 Großbuchstaben");
  let out = prefix;
  for (let i = 0; i < 4; i++) out += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return out;
}

/** Anzeigeform fürs Anschreiben: `LM-7Q4K`. */
export function formatCode(normalized: string, prefix: string): string {
  return `${prefix}-${normalized.slice(prefix.length)}`;
}

export function generatePageSlug(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
