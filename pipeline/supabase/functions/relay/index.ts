// ════════════════════════════════════════════════════════════════════════════
// relay/index.ts — ConversationRelay-WebSocket-Handler (Herzstück, M3).
// Twilio macht STT/TTS; wir liefern nur Text. setup → KI-Disclosure-Intro (Agent spricht
// zuerst). prompt → Claude (streaming) → Text-Tokens; End-of-Talk → Closing → {type:"end"}.
//
// Untrusted: voicePrompt ist untrusted Daten (im System-Prompt als solche abgegrenzt).
// Persistenz der Turns nach voice_calls kommt in M4. DEPLOY: `--no-verify-jwt`, `--use-api`.
// ════════════════════════════════════════════════════════════════════════════
import type { CRInbound, CROutbound } from "../../../voice/types.ts";
import { buildIntro, buildClosing, detectEndOfTalk, buildSystemPrompt } from "../../../lib/conversation.ts";
import { loadContext } from "../../../voice/context.ts";
import { streamReply, type ChatMessage } from "../../../voice/claude.ts";

const MAX_TURNS = 8; // Telefonat kurz halten (Budget/UWG: kein Dauergespräch)

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

Deno.serve((req: Request): Response => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected websocket", { status: 426 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);

  // Per-Connection-State (Closure lebt für die WS-Verbindung).
  let system = "";
  let iceCream: string | undefined; // aus setup, fürs Closing (Eis-Einladung)
  const history: ChatMessage[] = [];
  let userTurns = 0;
  let busy = false;

  socket.onmessage = async (ev: MessageEvent) => {
    let msg: CRInbound;
    try { msg = JSON.parse(ev.data as string) as CRInbound; } catch { return; }

    switch (msg.type) {
      case "setup": {
        console.log(`[relay] setup call=${msg.callSid} from=${msg.from}`);
        const firstName = msg.customParameters?.firstName?.trim() || undefined;
        const role = msg.customParameters?.role?.trim() || undefined;
        iceCream = msg.customParameters?.iceCream?.trim() || undefined;
        const ctx = await loadContext();
        system = buildSystemPrompt(ctx, firstName, role, iceCream);
        const intro = buildIntro(firstName);
        sayFinal(socket, intro); // Agent spricht zuerst, ggf. mit Vorname
        history.push({ role: "assistant", content: intro });
        break;
      }

      case "prompt": {
        if (!msg.last || busy) return; // auf Ende der Äußerung warten; keine Überlappung
        const userText = msg.voicePrompt?.trim() ?? "";
        if (!userText) return;
        history.push({ role: "user", content: userText });
        userTurns++;

        // End-of-Talk → Closing (Verweis auf Nummer in der Mail) → Call beenden.
        if (detectEndOfTalk(userText) || userTurns >= MAX_TURNS) {
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
        } catch (e) {
          console.error(`[relay] LLM-Fehler: ${(e as Error).message}`);
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

  socket.onclose = () => console.log("[relay] closed");
  socket.onerror = (e: Event | ErrorEvent) =>
    console.error(`[relay] ws error: ${(e as ErrorEvent).message ?? "unknown"}`);

  return response;
});
