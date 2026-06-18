/**
 * Pure TwiML-Builder — keine Runtime-Deps, von Deno (Edge) und Bun (Tests) importierbar.
 * Jeder interpolierte Wert wird XML-escaped (Trust-Boundary §16: konfig-Werte sind untrusted).
 * Outbound: `<Connect><ConversationRelay>`. (Kein Inbound mehr — Rückruf-Nr steht in der Mail
 * und klingelt direkt bei Dennis, keine Twilio-Inbound-Bridge.)
 */

/** XML-escape für TwiML-Attribut- und Text-Werte. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface ConnectRelayOpts {
  /** WebSocket-URL des Relay-Handlers, z. B. wss://{EDGE_BASE_URL}/relay. */
  wsUrl: string;
  /** TTS-Provider, aus TTS_PROVIDER (z. B. "ElevenLabs"). */
  ttsProvider: string;
  /** Stimmen-ID aus Twilios CR-Liste, aus TTS_VOICE_ID. */
  voiceId: string;
  /** BCP-47, Default de-DE. */
  ttsLanguage?: string;
  transcriptionLanguage?: string;
  /** ElevenLabs-Textnormalisierung (Zahlen/Eigennamen), Default an. */
  elevenlabsTextNormalization?: boolean;
  /** Werte, die per <Parameter> in das setup-Event durchgereicht werden (z. B. callId, jobId). */
  parameters?: Record<string, string>;
}

/**
 * Outbound: `<Connect><ConversationRelay>` startet die Sprach-Session. Twilio macht STT/TTS,
 * unser WS-Handler (`relay/index.ts`) liefert nur Text. Inline als `Twiml`-Param an die Twilio
 * Calls-API. Untrusted/konfig-Werte werden escaped.
 */
export function connectConversationRelay(o: ConnectRelayOpts): string {
  const ttsLang = o.ttsLanguage ?? "de-DE";
  const txLang = o.transcriptionLanguage ?? "de-DE";
  const norm = (o.elevenlabsTextNormalization ?? true) ? "on" : "off";
  const params = o.parameters ?? {};
  const paramTags = Object.keys(params)
    .map((k) => `<Parameter name="${escapeXml(k)}" value="${escapeXml(params[k] ?? "")}"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Connect>` +
    `<ConversationRelay url="${escapeXml(o.wsUrl)}"` +
    ` language="${escapeXml(ttsLang)}"` +
    ` ttsProvider="${escapeXml(o.ttsProvider)}"` +
    // voice nur setzen, wenn explizit gegeben — sonst wählt CR die Default-Stimme zur Sprache.
    (o.voiceId ? ` voice="${escapeXml(o.voiceId)}"` : "") +
    ` ttsLanguage="${escapeXml(ttsLang)}"` +
    ` transcriptionLanguage="${escapeXml(txLang)}"` +
    ` elevenlabsTextNormalization="${norm}">` +
    paramTags +
    `</ConversationRelay>` +
    `</Connect>` +
    `</Response>`
  );
}
