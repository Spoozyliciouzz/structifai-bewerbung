/**
 * Minimaler LLM-Client (Bun-Seite, nur für `extract.ts`).
 * Routing: LiteLLM-Gateway primär (OpenAI-kompatibel), Mistral API Fallback (EU-nativ).
 * Bewusst dependency-frei (fetch) — kein SDK, damit der Scraper schlank bleibt.
 */

export interface LlmCallOptions {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
  /** Erzwingt reines JSON im Output (response_format: json_object). */
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

/** Fallback: Mistral API (EU-nativ, OpenAI-kompatibel). Env var: MISTRAL_API_KEY. */
async function callMistral(opts: LlmCallOptions, apiKey: string): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
  if (!res.ok) throw new Error(`Mistral ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral: leere Antwort");
  return content;
}

/** Ruft das LLM. LiteLLM primär, Mistral Fallback. Wirft, wenn beide Wege scheitern. */
export async function callLlm(opts: LlmCallOptions): Promise<string> {
  // Gateway und Mistral sind verschiedene Dienste mit verschiedenen Zugangsdaten. Vorher galt
  // ein Schlüssel für beide: lag in LLM_API_KEY ein Anthropic-/Gateway-Schlüssel, ging genau
  // der an Mistral — der Fallback scheiterte an der Anmeldung, obwohl ein gültiger
  // MISTRAL_API_KEY gesetzt war.
  const gatewayKey = env("LLM_API_KEY") ?? env("MISTRAL_API_KEY");
  const mistralKey = env("MISTRAL_API_KEY") ?? env("LLM_API_KEY");
  if (!gatewayKey && !mistralKey) throw new Error("Kein LLM_API_KEY / MISTRAL_API_KEY gesetzt.");

  const liteBase = env("LITELLM_BASE_URL");
  if (liteBase && gatewayKey) {
    try {
      return await callLiteLlm(opts, liteBase, gatewayKey);
    } catch (err) {
      console.warn(`[llm] LiteLLM fehlgeschlagen, Fallback Mistral: ${(err as Error).message}`);
    }
  }
  if (!mistralKey) throw new Error("Kein MISTRAL_API_KEY für den direkten Aufruf gesetzt.");
  return callMistral(opts, mistralKey);
}
