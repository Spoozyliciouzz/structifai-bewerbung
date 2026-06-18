/**
 * Minimaler Claude-Client (Bun-Seite, nur für `extract.ts`).
 * Routing: LiteLLM-Gateway primär (OpenAI-kompatibel), `api.anthropic.com` Fallback.
 * Bewusst dependency-frei (fetch) — kein SDK, damit der Scraper schlank bleibt.
 */

export interface LlmCallOptions {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
  /** Erzwingt reines JSON im Output (Anthropic: prefill; LiteLLM: response_format). */
  jsonOnly?: boolean;
}

const TIMEOUT_MS = 30_000;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

async function callLiteLlm(opts: LlmCallOptions, baseUrl: string, apiKey: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.jsonOnly ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LiteLLM ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LiteLLM: leere Antwort");
  return content;
}

async function callAnthropic(opts: LlmCallOptions, apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [
        { role: "user", content: opts.user },
        // Prefill "{" zwingt JSON-Start, wenn jsonOnly.
        ...(opts.jsonOnly ? [{ role: "assistant", content: "{" }] : []),
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Anthropic: leere Antwort");
  return opts.jsonOnly ? `{${text}` : text;
}

/** Ruft Claude. Wirft, wenn beide Wege scheitern. */
export async function callClaude(opts: LlmCallOptions): Promise<string> {
  const apiKey = env("LLM_API_KEY") ?? env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Kein LLM_API_KEY / ANTHROPIC_API_KEY gesetzt.");

  const liteBase = env("LITELLM_BASE_URL");
  if (liteBase) {
    try {
      return await callLiteLlm(opts, liteBase, apiKey);
    } catch (err) {
      console.warn(`[llm] LiteLLM fehlgeschlagen, Fallback Anthropic: ${(err as Error).message}`);
    }
  }
  return callAnthropic(opts, apiKey);
}
