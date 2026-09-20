/**
 * Famulor `call.completed` → bw_voice_calls-Zeile. Pure TS, von Deno (Edge) und Bun (Tests)
 * importierbar. Der Payload ist untrusted (unsignierter Webhook): Typen erzwingen, Längen
 * begrenzen, Unbekanntes weglassen. Doku: docs.famulor.io/assistants/webhooks (2026-09-20).
 */

export interface VoiceTurn { role: "assistant" | "user"; text: string }

export interface VoiceCallRow {
  provider_call_id: string;
  assistant_id: string;
  direction: string;
  status: string;
  duration_seconds: number | null;
  turns: VoiceTurn[];
  summary: string | null;
  ended_at: string | null;
}

const MAX_TURNS = 400;
const MAX_TURN_CHARS = 4000;
const MAX_SUMMARY_CHARS = 2000;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** ID-Felder landen in einem PostgREST `eq.`-Filter bzw. sind unique-Spalte — nur ein
 * geschlossenes Zeichenset zulassen, sonst null. */
const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

function id(v: unknown): string | null {
  const s = str(v, 120);
  return s && ID_RE.test(s) ? s : null;
}

function turns(transcript: unknown): VoiceTurn[] {
  if (!isRecord(transcript) || !Array.isArray(transcript.items)) return [];
  const out: VoiceTurn[] = [];
  for (const it of transcript.items) {
    if (out.length >= MAX_TURNS) break;
    if (!isRecord(it) || it.type !== "message") continue;
    const role = it.role === "assistant" || it.role === "user" ? it.role : null;
    const text = Array.isArray(it.content)
      ? it.content.filter((c): c is string => typeof c === "string").join(" ").trim().slice(0, MAX_TURN_CHARS)
      : null;
    if (!role || !text) continue;
    out.push({ role, text });
  }
  return out;
}

/** null ⇒ kein verwertbares call.completed (falsches Event, fehlende IDs, kein Objekt). */
export function parseCallCompleted(payload: unknown): VoiceCallRow | null {
  if (!isRecord(payload) || payload.event !== "call.completed" || !isRecord(payload.data)) return null;
  const d = payload.data;
  const provider_call_id = id(d.call_id);
  const assistant_id = id(d.assistant_id);
  if (!provider_call_id || !assistant_id) return null;
  const t = typeof payload.timestamp === "string" ? Date.parse(payload.timestamp) : NaN;
  return {
    provider_call_id,
    assistant_id,
    direction: str(d.direction, 20) ?? "web",
    status: str(d.status, 40) ?? "completed",
    duration_seconds: typeof d.duration_sec === "number" && Number.isFinite(d.duration_sec)
      ? Math.min(Math.max(0, Math.round(d.duration_sec)), 86400)
      : null,
    turns: turns(d.transcript),
    summary: isRecord(d.analysis) ? str(d.analysis.summary, MAX_SUMMARY_CHARS) : null,
    ended_at: Number.isNaN(t) ? null : new Date(t).toISOString(),
  };
}
