// ════════════════════════════════════════════════════════════════════════════
// voice/types.ts — Typen für den Twilio-ConversationRelay-Voice-Agent.
// Pure Typen, keine Runtime-Deps. Von Deno-Functions (relay/inbound/outbound-trigger)
// importierbar. ConversationRelay-Wire-Format ist gegen die offizielle Twilio-Doc zu
// verifizieren (M2, §14) — diese Shapes sind der dokumentierte Stand, nicht geraten.
// ════════════════════════════════════════════════════════════════════════════

// ── ConversationRelay → uns (eingehende WebSocket-Messages) ──────────────────

/** Erstes Event nach WS-Connect: Call-Metadaten. */
export interface CRSetup {
  type: "setup";
  sessionId: string;
  callSid: string;
  from: string; // E.164 des Anrufers/Empfängers
  to: string; // unsere Twilio-Nummer
  direction?: string;
  customParameters?: Record<string, string>; // via <ConversationRelay> Parameter durchgereicht
}

/** Transkribierte User-Äußerung (ein Turn). `last` = Ende der Äußerung. */
export interface CRPrompt {
  type: "prompt";
  voicePrompt: string;
  last: boolean;
  lang?: string;
}

/** User hat den Agenten unterbrochen (Barge-in). */
export interface CRInterrupt {
  type: "interrupt";
  utteranceUntilInterrupt?: string;
  durationUntilInterruptMs?: number;
}

/** DTMF-Tastendruck (z. B. "1" für Handoff-Wunsch im Gespräch). */
export interface CRDtmf {
  type: "dtmf";
  digit: string;
}

export interface CRError {
  type: "error";
  description?: string;
}

export type CRInbound = CRSetup | CRPrompt | CRInterrupt | CRDtmf | CRError;

// ── uns → ConversationRelay (ausgehende WebSocket-Messages) ───────────────────

/** Text-Token für TTS. Streaming: viele `text`-Messages, letzte mit last=true. */
export interface CRText {
  type: "text";
  token: string;
  last: boolean;
}

/** Beendet die Session sauber (nach Closing). Optionale Handoff-Daten. */
export interface CREnd {
  type: "end";
  handoffData?: string; // JSON-String
}

export type CROutbound = CRText | CREnd;

// ── Domänen-Typen (DB / Reasoning) ───────────────────────────────────────────

export type CallDirection = "outbound" | "inbound";
export type CallStatus =
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "failed";

export interface Turn {
  role: "agent" | "user";
  content: string;
  ts: string; // ISO
}

/** Zeile in public.voice_calls (Service-Role-only). */
export interface VoiceCall {
  id: string;
  job_id: string | null;
  direction: CallDirection;
  counterpart_phone: string | null;
  twilio_call_sid: string | null;
  status: CallStatus;
  duration_seconds: number | null;
  transcript: string | null;
  turns: Turn[] | null;
  created_at: string;
  ended_at: string | null;
}

/** Geladener Reasoning-Kontext (DB-Tabelle oder Fallback-JSON). */
export interface AgentContext {
  profile: Record<string, unknown>;
  projects: Array<Record<string, unknown>>;
  faq: Array<{ q: string; a: string }>;
  /** Konkrete Anekdoten: Situation → Aktion → Ergebnis. Macht Antworten lebendig. */
  stories?: Array<{ title: string; situation: string; action: string; result: string }>;
  /** Einwände + ehrliche Antwort (HubSpot, Abschluss, …). */
  objections?: Array<{ objection: string; answer: string }>;
  /** Kontext zur konkreten Stelle/Firma, damit der Agent aufs Gegenüber eingeht. */
  the_role?: Record<string, unknown>;
  /** Persönliches (Hobby, Familie, Herkunft) — warm + selbstironisch auf Nachfrage. */
  personal?: { hobby?: string; family?: string; origin?: string; tone_anchor?: string };
  pronunciation?: Record<string, string>;
}

/** Input des outbound-trigger-Endpoints (Server-zu-Server aus build/). */
export interface OutboundTriggerInput {
  jobId?: string;
  phone: string; // E.164
  email: string;
  firstName?: string; // Vorname des Anrufers — Agent spricht ihn direkt an
  role?: string; // Funktionsbereich/Rolle des Anrufers — Agent spiegelt Stärken
  iceCream?: string; // Lieblings-Eissorte — humorvoller Closing-Hook
}
