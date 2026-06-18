// ════════════════════════════════════════════════════════════════════════════
// outbound-trigger/index.ts — startet den Voice-Outbound-Call (M2).
// Server-zu-Server aus build/ (nach email-Step, callConsent). Gate (§9.2) → voice_calls
// loggen → Twilio Calls-API mit inline ConversationRelay-TwiML → {callId, callSid}.
//
// NIE client-getriggert für freie Nummern: TRIGGER_SHARED_SECRET + E.164 + Allowlist + Rate-Limit.
// DEPLOY: `--no-verify-jwt` (eigene Shared-Secret-Auth), `--use-api --workdir pipeline`.
// ════════════════════════════════════════════════════════════════════════════
import { connectConversationRelay } from "../../../lib/twiml.ts";
import { authorizeOutbound } from "../../../lib/voice-gate.ts";
import { emailDomain } from "../../../lib/validate.ts";
import type { OutboundTriggerInput } from "../../../voice/types.ts";

const SHARED_SECRET = Deno.env.get("TRIGGER_SHARED_SECRET") ?? "";
const ALLOWLIST = (Deno.env.get("VOICE_ALLOWLIST_DOMAINS") ?? "")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_NUMBER = Deno.env.get("TWILIO_NUMBER") ?? "";
const TTS_PROVIDER = Deno.env.get("TTS_PROVIDER") ?? "ElevenLabs";
const TTS_VOICE_ID = Deno.env.get("TTS_VOICE_ID") ?? "";
const EDGE_BASE_URL = Deno.env.get("EDGE_BASE_URL") ?? "";
const RELAY_WSS_URL = Deno.env.get("RELAY_WSS_URL") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Rate-Limit env-steuerbar (Default strikt für Produktion; Test-Override via Secret).
const RL_PHONE_WINDOW = Number(Deno.env.get("VOICE_RL_PHONE_WINDOW") ?? "86400");
const RL_PHONE_LIMIT = Number(Deno.env.get("VOICE_RL_PHONE_LIMIT") ?? "1");
const RL_DOMAIN_WINDOW = Number(Deno.env.get("VOICE_RL_DOMAIN_WINDOW") ?? "86400");
const RL_DOMAIN_LIMIT = Number(Deno.env.get("VOICE_RL_DOMAIN_LIMIT") ?? "20");

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** wss-URL des Relay-Handlers. RELAY_WSS_URL override, sonst aus EDGE_BASE_URL abgeleitet. */
function relayWsUrl(): string {
  if (RELAY_WSS_URL) return RELAY_WSS_URL;
  const host = EDGE_BASE_URL.replace(/^wss?:\/\//, "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `wss://${host}/relay`;
}

function sbHeaders(): Record<string, string> {
  return { "content-type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };
}

async function rateLimit(key: string, windowSec: number, limit: number): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_rate_limit`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify({ p_key: key, p_window_seconds: windowSec, p_limit: limit }),
  });
  if (!res.ok) throw new Error(`rate_limit RPC ${res.status}`);
  return (await res.json()) === true;
}

async function insertCall(jobId: string | null, phone: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/voice_calls`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ job_id: jobId, direction: "outbound", counterpart_phone: phone, status: "initiated" }),
  });
  if (!res.ok) throw new Error(`insert voice_calls ${res.status}: ${await res.text()}`);
  const [row] = (await res.json()) as Array<{ id: string }>;
  return row.id;
}

async function patchCall(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/voice_calls?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.error(`patchCall ${res.status}: ${await res.text()}`);
}

/** Twilio Calls-API mit inline TwiML. Basic-Auth (SID:Token). Gibt die Call-SID zurück. */
async function startTwilioCall(to: string, twiml: string): Promise<string> {
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const form = new URLSearchParams({ To: to, From: TWILIO_NUMBER, Twiml: twiml });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${auth}` },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { sid?: string };
  if (!data.sid) throw new Error("Twilio: keine Call-SID");
  return data.sid;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: OutboundTriggerInput;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const phone = (body.phone ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const jobId = body.jobId ?? null;

  // Gate (pure): Shared-Secret + E.164 + Allowlist. Fail-closed.
  const gate = authorizeOutbound(
    { authHeader: req.headers.get("authorization"), phone, email },
    { sharedSecret: SHARED_SECRET, allowlist: ALLOWLIST },
  );
  if (!gate.ok) {
    const status = gate.reason === "secret" ? 401 : 400;
    return json({ error: gate.reason }, status);
  }

  // Rate-Limit (DB): pro Nummer + Domain. Defense-in-depth (one-per-email schon upstream in build/).
  const domain = emailDomain(email);
  try {
    const okPhone = await rateLimit(`voice:phone:${phone}`, RL_PHONE_WINDOW, RL_PHONE_LIMIT);
    const okDomain = await rateLimit(`voice:domain:${domain}`, RL_DOMAIN_WINDOW, RL_DOMAIN_LIMIT);
    if (!okPhone || !okDomain) return json({ error: "rate_limited" }, 429);
  } catch (e) {
    console.error(`[outbound] rate-limit: ${(e as Error).message}`);
    return json({ error: "internal" }, 500);
  }

  // Call anlegen → Twilio starten → SID nachtragen.
  let callId: string;
  try {
    callId = await insertCall(jobId, phone);
  } catch (e) {
    console.error(`[outbound] insert: ${(e as Error).message}`);
    return json({ error: "internal" }, 500);
  }

  const firstName = body.firstName?.trim();
  const role = body.role?.trim();
  const iceCream = body.iceCream?.trim();
  const twiml = connectConversationRelay({
    wsUrl: relayWsUrl(),
    ttsProvider: TTS_PROVIDER,
    voiceId: TTS_VOICE_ID,
    parameters: { callId, ...(jobId ? { jobId } : {}), ...(firstName ? { firstName } : {}), ...(role ? { role } : {}), ...(iceCream ? { iceCream } : {}) },
  });

  try {
    const callSid = await startTwilioCall(phone, twiml);
    await patchCall(callId, { twilio_call_sid: callSid, status: "ringing" });
    return json({ callId, callSid }, 200);
  } catch (e) {
    console.error(`[outbound] Twilio: ${(e as Error).message}`);
    await patchCall(callId, { status: "failed" });
    return json({ error: "call_failed" }, 502);
  }
});
