// ════════════════════════════════════════════════════════════════════════════
// voice/claude.ts — Reasoning-Turn als STREAM (Deno). Token fließen sofort an den
// Relay-WS → ConversationRelay-TTS startet früh (Budget §8: erste Tokens < 600 ms).
// LiteLLM (OpenAI-Format) primär falls LITELLM_BASE_URL gesetzt, sonst api.anthropic.com.
// ════════════════════════════════════════════════════════════════════════════
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const LITELLM_BASE_URL = Deno.env.get("LITELLM_BASE_URL") ?? "";
// Voice = LATENZ-kritisch (Telefonie, Budget §8: erste Tokens < 600 ms). Haiku statt Sonnet:
// Sonnet lag bei TTFT ~1,9 s über den Edge→Anthropic-Pfad → Antworten liefen in den 30s-Timeout
// und brachen mitten im Satz ab. Haiku: TTFT ~0,65 s, fürs geerdete Q&A aus Kontext mehr als genug.
const MODEL = Deno.env.get("LLM_MODEL_VOICE") ?? "claude-haiku-4-5-20251001";
const MAX_TOKENS = 320; // telefongerecht kurz

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Eine SSE-`data:`-Zeile je Callback. `[DONE]` beendet. */
async function readSse(res: Response, onData: (json: unknown) => void): Promise<void> {
  if (!res.body) throw new Error("kein Response-Body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try { onData(JSON.parse(data)); } catch { /* keep-alive / partial */ }
    }
  }
}

/** Anthropic-Streaming: content_block_delta → delta.text. */
async function streamAnthropic(
  system: string, messages: ChatMessage[], onToken: (t: string) => void,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": LLM_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // System/Kontext ist über alle Turns identisch → Prompt-Caching spart TTFT + Kosten ab Turn 2.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      stream: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  let full = "";
  await readSse(res, (j) => {
    const d = j as { type?: string; delta?: { text?: string } };
    const t = d.type === "content_block_delta" ? d.delta?.text : undefined;
    if (t) { full += t; onToken(t); }
  });
  return full;
}

/** LiteLLM/OpenAI-Streaming: choices[0].delta.content. */
async function streamLiteLLM(
  system: string, messages: ChatMessage[], onToken: (t: string) => void,
): Promise<string> {
  const res = await fetch(`${LITELLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify({
      model: MODEL, max_tokens: MAX_TOKENS, stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LiteLLM ${res.status}: ${await res.text()}`);
  let full = "";
  await readSse(res, (j) => {
    const d = j as { choices?: Array<{ delta?: { content?: string } }> };
    const t = d.choices?.[0]?.delta?.content;
    if (t) { full += t; onToken(t); }
  });
  return full;
}

/**
 * Streamt einen Antwort-Turn. `onToken` pro Delta (an den Relay-WS weiterreichen). Gibt den
 * vollständigen Text zurück (für die Turn-Historie). LiteLLM primär (falls konfiguriert), sonst
 * Anthropic. Fällt LiteLLM beim Start aus, wird auf Anthropic zurückgefallen.
 */
export async function streamReply(
  system: string, messages: ChatMessage[], onToken: (t: string) => void,
): Promise<string> {
  if (!LLM_API_KEY) throw new Error("LLM_API_KEY fehlt");
  if (LITELLM_BASE_URL) {
    try {
      return await streamLiteLLM(system, messages, onToken);
    } catch (e) {
      console.warn(`[voice/claude] LiteLLM Fallback → Anthropic: ${(e as Error).message}`);
    }
  }
  return await streamAnthropic(system, messages, onToken);
}
