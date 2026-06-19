// ════════════════════════════════════════════════════════════════════════════
// relay-deno/main.ts — ConversationRelay-WebSocket-Handler als EIGENSTÄNDIGER
// Deno-Deploy-Service (Herzstück der Voice). Identische Logik wie zuvor in der
// Supabase-Edge-Function — aber Edge Functions kappen lange WebSockets bei ~75s
// (Code 1006, reproduziert). Deno Deploy hat kein solches Limit → der Anruf läuft
// voll durch.
//
// Geteilte Logik (conversation/claude/context/types) liegt self-contained in ./lib/ (Kopie aus pipeline/; Tests prüfen die Live-Kopie),
// nur der WS-/Server-Teil lebt hier. Entry-Point für Deno Deploy: relay-deno/main.ts.
//
// ENV (Deno-Deploy-Dashboard → Settings → Environment Variables):
//   LLM_API_KEY                 (Pflicht — Anthropic-Key für das Reasoning)
//   LLM_MODEL_VOICE             (optional, Default claude-haiku-4-5-20251001)
//   LITELLM_BASE_URL            (optional, leer ⇒ direkt Anthropic)
//   SUPABASE_URL                (optional — für Transkript-Log + DB-Kontext)
//   SUPABASE_SERVICE_ROLE_KEY   (optional — dito; ohne ⇒ Fallback-Kontext, kein Log)
// ════════════════════════════════════════════════════════════════════════════
import type { CRInbound, CROutbound } from "./lib/types.ts";
import { buildIntro, buildClosing, detectEndOfTalk, buildSystemPrompt } from "./lib/conversation.ts";
import { loadContext } from "./lib/context.ts";
import { streamReply, type ChatMessage } from "./lib/claude.ts";

const MAX_TURNS = 8; // Telefonat kurz halten (Budget/UWG: kein Dauergespräch)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function send(socket: WebSocket, msg: CROutbound): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}
/** Ganzer Satz als ein finales Text-Event (TTS spricht ihn, Turn beendet). */
function sayFinal(socket: WebSocket, text: string): void {
  send(socket, { type: "text", token: text, last: true });
}
/** Streaming-Teil-Token (last=false). */
function sayToken(socket: WebSocket, token: string): void {
  send(socket, { type: "text", token, last: false });
}

function handleSocket(socket: WebSocket): void {
  // Per-Connection-State (Closure lebt für die WS-Verbindung).
  let system = "";
  let iceCream: string | undefined; // aus setup, fürs Closing (Eis-Einladung)
  let callSid: string | undefined;  // Twilio Call-SID (zuverlässig im setup) → PATCH-Key
  const history: ChatMessage[] = [];
  let userTurns = 0;
  let promptEvents = 0;             // ALLE prompt-Events (auch ignorierte) — zeigt STT-Echo/Spam
  let busy = false;
  let finalized = false;

  // M4: Zustand nach voice_calls schreiben (Service-Role, PATCH per twilio_call_sid).
  // Nach JEDEM Turn (final=false) + beim Schluss (final=true). status "active…" = läuft,
  // "closed:end_of_talk/max_turns/llm_error" = WIR schließen, "ws_closed…" = Twilio/Hangup.
  async function recordState(status: string, final = false): Promise<void> {
    if (!callSid || !SUPABASE_URL) return;
    if (final) { if (finalized) return; finalized = true; }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/voice_calls?twilio_call_sid=eq.${encodeURIComponent(callSid)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json", apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: status.slice(0, 250),
          turns: history,
          transcript: history.map((h) => `${h.role}: ${h.content}`).join("\n").slice(0, 8000),
          ...(final ? { ended_at: new Date().toISOString() } : {}),
        }),
      });
    } catch (_) { /* best-effort */ }
  }

  socket.onmessage = async (ev: MessageEvent) => {
    let msg: CRInbound;
    try { msg = JSON.parse(ev.data as string) as CRInbound; } catch { return; }

    switch (msg.type) {
      case "setup": {
        console.log(`[relay] setup call=${msg.callSid} from=${msg.from}`);
        const firstName = msg.customParameters?.firstName?.trim() || undefined;
        const role = msg.customParameters?.role?.trim() || undefined;
        iceCream = msg.customParameters?.iceCream?.trim() || undefined;
        callSid = msg.callSid?.trim() || undefined;
        const ctx = await loadContext();
        system = buildSystemPrompt(ctx, firstName, role, iceCream);
        const intro = buildIntro(firstName);
        sayFinal(socket, intro); // Agent spricht zuerst, ggf. mit Vorname
        history.push({ role: "assistant", content: intro });
        break;
      }

      case "prompt": {
        promptEvents++; // jedes prompt-Event zählen (auch ignorierte) — entlarvt STT-Echo/Doppelungen
        if (!msg.last || busy) return; // auf Ende der Äußerung warten; keine Überlappung
        const userText = msg.voicePrompt?.trim() ?? "";
        if (!userText) return;
        history.push({ role: "user", content: userText });
        userTurns++;

        // End-of-Talk → Closing (Verweis auf Nummer in der Mail) → Call beenden.
        const eot = detectEndOfTalk(userText);
        if (eot || userTurns >= MAX_TURNS) {
          await recordState(
            `closed:${eot ? "end_of_talk" : "max_turns"} turns=${userTurns} prompts=${promptEvents} last="${userText.slice(0, 80)}"`,
            true,
          );
          sayFinal(socket, buildClosing(iceCream));
          send(socket, { type: "end" });
          break;
        }

        busy = true;
        try {
          let acc = "";
          const reply = await streamReply(system, history, (t) => { acc += t; sayToken(socket, t); });
          send(socket, { type: "text", token: "", last: true }); // Turn abschließen
          history.push({ role: "assistant", content: reply || acc });
          await recordState(`active turns=${userTurns} prompts=${promptEvents}`); // Snapshot je Turn
        } catch (e) {
          console.error(`[relay] LLM-Fehler: ${(e as Error).message}`);
          await recordState(`closed:llm_error ${(e as Error).message}`, true);
          sayFinal(socket,
            "Entschuldige, da hakt gerade die Technik. Ruf am besten die Nummer aus der Mail an, dann hast du Dennis direkt.");
          send(socket, { type: "end" });
        } finally {
          busy = false;
        }
        break;
      }

      case "interrupt":
        console.log("[relay] interrupt");
        break;
      case "dtmf":
        console.log(`[relay] dtmf ${msg.digit}`);
        break;
      case "error":
        console.error(`[relay] CR error: ${msg.description ?? "unknown"}`);
        break;
    }
  };

  socket.onclose = (e: CloseEvent) => {
    console.log(`[relay] closed code=${e.code} reason=${e.reason}`);
    // Falls WIR noch nicht geschlossen haben, kam der Close von Twilio/Hangup. Auf Deno Deploy
    // bleibt die WS-Verbindung am Leben, bis sie wirklich schließt → der Write geht noch durch.
    void recordState(
      `ws_closed code=${e.code} reason="${(e.reason ?? "").slice(0, 90)}" turns=${userTurns} prompts=${promptEvents}`,
      true,
    );
  };
  socket.onerror = (e: Event | ErrorEvent) =>
    console.error(`[relay] ws error: ${(e as ErrorEvent).message ?? "unknown"}`);
}

Deno.serve((req: Request): Response => {
  // Health-Check: normaler GET (z. B. im Browser) → bestätigt, dass der Service läuft.
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("relay up — erwartet einen WebSocket-Upgrade (ConversationRelay).", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  handleSocket(socket);
  return response;
});
