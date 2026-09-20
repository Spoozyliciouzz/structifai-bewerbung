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

/**
 * n=1-Teil einer Bewerbung: der `voice`-Block aus der freigegebenen Version in
 * bw_application_content. Kommt NIE aus einem globalen Rückfall.
 */
export interface ApplicationVoice {
  /** Erste Wortmeldung dieser Bewerbung; ohne Angabe gilt der allgemeine Intro-Text. */
  intro?: string;
  closing?: string;
  /** Zusätzliche Gesprächsregeln, die nur für diese Stelle gelten. */
  rules_extra?: string[];
  /** Firma, Titel, Auslegung der Anzeige, Arbeitsprobe. */
  the_role?: Record<string, unknown>;
  objections?: Array<{ objection: string; answer: string }>;
  /** Stellenbezogene Fragen; ergänzen die agnostischen, ersetzen sie nicht. */
  faq?: Array<{ q: string; a: string }>;
}

/**
 * Geladener Reasoning-Kontext für genau ein Gespräch.
 *
 * Agnostisch (gilt für jede Bewerbung): profile, projects, faq, stories, personal,
 * pronunciation — dazu der Lieblingseis-Hook, der am Empfänger hängt, nicht an der Stelle.
 * Je Bewerbung: application_id, the_role, objections, intro, closing, rules_extra und die
 * stellenbezogenen faq-Einträge. Fehlen sie, ist für diese Sitzung nichts freigegeben —
 * ein gültiger Zustand, kein Grund für einen Rückfall.
 */
export interface AgentContext {
  profile: Record<string, unknown>;
  projects: Array<Record<string, unknown>>;
  faq: Array<{ q: string; a: string }>;
  /** Konkrete Anekdoten: Situation → Aktion → Ergebnis. Macht Antworten lebendig. */
  stories?: Array<{ title: string; situation: string; action: string; result: string }>;
  /** Persönliches (Hobby, Familie, Herkunft) — warm + selbstironisch auf Nachfrage. */
  personal?: { hobby?: string; family?: string; origin?: string; tone_anchor?: string };
  pronunciation?: Record<string, string>;

  // ── je Bewerbung, nur nach erfolgreichem Laden gesetzt ──
  application_id?: string;
  /** Einwände + ehrliche Antwort. */
  objections?: Array<{ objection: string; answer: string }>;
  /** Kontext zur konkreten Stelle/Firma, damit der Agent aufs Gegenüber eingeht. */
  the_role?: Record<string, unknown>;
  intro?: string;
  closing?: string;
  rules_extra?: string[];
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
