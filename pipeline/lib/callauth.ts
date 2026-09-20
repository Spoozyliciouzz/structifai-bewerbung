// ════════════════════════════════════════════════════════════════════════════
// callauth.ts — signierte, kurzlebige Anruf-Autorisierung für den Relay.
//
// Problem: Der WebSocket des Relays nimmt jede Verbindung an. Wer einen Slug kennt oder
// rät, könnte ein `setup` fälschen und den freigegebenen Bewerbungsinhalt abrufen. Eine
// Formprüfung des Slugs autorisiert den Aufrufer nicht — sie prüft nur die Schreibweise.
//
// Lösung: Die Bewerbung reist nicht mehr als freier Parameter, sondern INNERHALB einer
// signierten Nutzlast, die der Server beim Start des Anrufs ausstellt. Der Client kann sie
// weder erfinden noch umschreiben, ohne die Signatur zu brechen, und sie läuft ab.
//
// Bewusst NICHT geleistet: Das ist kein Nachweis, dass die Gegenstelle Twilio ist. Es
// verhindert, dass Fremde sich eine Bewerbung aussuchen. Wer ein gültiges Token abfängt,
// kann es bis zum Ablauf verwenden — deshalb die kurze Gültigkeit.
//
// Pure Web-Crypto, keine Runtime-Deps: von Deno (Relay) und Bun (Tests) nutzbar.
// ACHTUNG: relay-deno/lib/callauth.ts ist die zeichengleiche Kopie für das Deploy-Verzeichnis.
// tests/callauth.test.ts prüft, dass beide Dateien nicht auseinanderlaufen.
// ════════════════════════════════════════════════════════════════════════════

export interface CallAuthPayload {
  /** Zeile in bw_voice_calls, an die dieses Gespräch gebunden ist. */
  callId: string;
  /** Freigegebene Bewerbung. Fehlt sie, läuft das Gespräch ohne Stellenkontext. */
  applicationId?: string;
  /** Ablauf als Unix-Sekunden. */
  exp: number;
}

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Vergleich ohne frühen Abbruch — verrät über die Laufzeit nicht, wie weit zwei Werte passen. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Stellt ein Token aus. Nur serverseitig aufrufen — der Secret gehört nie in den Client. */
export async function signCallAuth(payload: CallAuthPayload, secret: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64urlEncode(await hmac(secret, body))}`;
}

/**
 * Prüft Signatur und Ablauf. Gibt die Nutzlast nur zurück, wenn beides stimmt — sonst null.
 * `nowSeconds` ist für Tests überschreibbar.
 */
export async function verifyCallAuth(
  token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CallAuthPayload | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const sig = b64urlDecode(token.slice(dot + 1));
  if (!sig) return null;
  if (!equal(sig, await hmac(secret, body))) return null;

  const raw = b64urlDecode(body);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const p = parsed as Record<string, unknown>;
  if (typeof p.callId !== "string" || !p.callId) return null;
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return null;
  if (p.exp <= nowSeconds) return null;
  if (p.applicationId !== undefined && typeof p.applicationId !== "string") return null;

  return {
    callId: p.callId,
    ...(p.applicationId ? { applicationId: p.applicationId } : {}),
    exp: p.exp,
  };
}
