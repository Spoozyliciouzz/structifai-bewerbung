// ════════════════════════════════════════════════════════════════════════════
// voice/outbound.ts — Vapi Outbound-Call (Encore, §7.4). Deno-Modul.
//
// HARTE REGELN (UWG §7 + §15.4):
//  • Aufruf NUR nach Gate im Orchestrator (Opt-in + E.164 + Domain-Allowlist/Token).
//  • Bot identifiziert sich im ERSTEN Satz als KI im Auftrag von Dennis Benter.
//  • Kein Verkauf. ~20–30s, "1 drücken" → Handoff an DENNIS_PHONE. Abbruch bei Unmut.
// ════════════════════════════════════════════════════════════════════════════

const VAPI_API_KEY = () => Deno.env.get("VAPI_API_KEY") ?? "";
const VAPI_PHONE_NUMBER_ID = () => Deno.env.get("VAPI_PHONE_NUMBER_ID") ?? "";
const ELEVEN_VOICE_ID = () => Deno.env.get("ELEVEN_VOICE_ID") ?? "";
const DENNIS_PHONE = () => Deno.env.get("DENNIS_PHONE") ?? "";
const VARIANT = () => Deno.env.get("VOICE_SCRIPT_VARIANT") ?? "loop-close";

const DISCLOSURE =
  "Guten Tag, ich bin ein KI-Agent im Auftrag von Dennis Benter. Ich verkaufe nichts — " +
  "ich schließe nur einen Loop.";

/** A/B-Skripte. Alle starten mit der KI-Disclosure (im firstMessage gesetzt). */
const SCRIPTS: Record<string, string> = {
  "loop-close":
    "Die Bewerbung, die Sie gerade auf der Seite gebaut haben, kam per Mail an — und jetzt klingelt " +
    "Ihr Telefon. Web, Mail und Anruf sind dieselbe Pipeline, von Dennis solo gebaut. Genau solche " +
    "Agenten-Flotten würde er bei Ihnen in Produktion bringen. Wenn Sie kurz mit ihm sprechen möchten, " +
    "drücken Sie die Eins — ich verbinde sofort. Sonst wünsche ich einen guten Tag.",
  "kurz-pitch":
    "In unter 60 Sekunden hat eine Pipeline Ihre Bewerbungsseite gebaut und zugestellt — und Sie " +
    "danach angerufen. Das ist die Art Automatisierung, die Dennis baut. Für ein kurzes Gespräch " +
    "drücken Sie die Eins.",
  "demo-angebot":
    "Sie haben gerade drei Modalitäten in einer Pipeline erlebt: Web, Mail, Telefon. Wenn Sie sehen " +
    "möchten, wie Dennis so etwas in Ihren Stack bringt, drücken Sie die Eins für ein kurzes Gespräch.",
};

export interface CallResult {
  id: string;
}

/**
 * Startet den Outbound-Call. Gibt die Vapi-Call-ID zurück.
 * Wirft bei fehlender Konfiguration oder API-Fehler (Orchestrator fängt → Build bleibt done).
 */
export async function triggerCall(phone: string): Promise<string> {
  const apiKey = VAPI_API_KEY();
  const phoneNumberId = VAPI_PHONE_NUMBER_ID();
  if (!apiKey || !phoneNumberId) throw new Error("voice: VAPI_API_KEY/PHONE_NUMBER_ID fehlen");

  const variant = VARIANT();
  const body = SCRIPTS[variant] ?? SCRIPTS["loop-close"];
  const firstMessage = `${DISCLOSURE} ${body}`;

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      phoneNumberId,
      customer: { number: phone },
      assistant: {
        firstMessage,
        firstMessageMode: "assistant-speaks-first",
        maxDurationSeconds: 75,
        silenceTimeoutSeconds: 20,
        // DE-Stimme + DE-Transcriber.
        voice: { provider: "11labs", voiceId: ELEVEN_VOICE_ID(), model: "eleven_multilingual_v2" },
        transcriber: { provider: "deepgram", language: "de" },
        model: {
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          messages: [{
            role: "system",
            content:
              "Du bist ein KI-Agent im Auftrag von Dennis Benter. Du hast dich bereits als KI " +
              "vorgestellt. Kein Verkauf, keine Werbung. Halte dich kurz (max ~30s Sprechzeit). " +
              "Wenn die Person 'kein Interesse', 'nein' oder Unmut äußert: höflich verabschieden " +
              "und auflegen. Wenn sie '1' drückt oder ein Gespräch will: Handoff ankündigen.",
          }],
        },
        // "1" → Weiterleitung an Dennis.
        ...(DENNIS_PHONE() ? {
          functions: [{
            name: "transferCall",
            description: "Verbindet zu Dennis, wenn die Person die Eins drückt oder sprechen möchte.",
          }],
        } : {}),
      },
      ...(DENNIS_PHONE() ? {
        transferDestinations: [{ type: "number", number: DENNIS_PHONE(), message: "Ich verbinde Sie mit Dennis." }],
      } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Vapi ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as CallResult;
  if (!data.id) throw new Error("Vapi: keine Call-ID");
  return data.id;
}
