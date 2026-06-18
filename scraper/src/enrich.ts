/**
 * enrich(domain): schneller, browserloser Kontext-Fetch für den Request-Pfad.
 * Holt mehrere öffentliche Pfade parallel (je 5s-Timeout), strippt HTML→Text,
 * dedupe, kappt auf ≤6000 Zeichen. Fehlertolerant: einzelne 404/Timeouts werden
 * ignoriert, solange irgendein Pfad Text liefert.
 *
 * Sicherheit: Rückgabe ist UNTRUSTED — wird downstream als Daten behandelt + escaped.
 */

const PATHS = ["/", "/about", "/about-us", "/ueber-uns", "/team", "/company", "/de"];
const PER_PATH_TIMEOUT_MS = 5_000;
const MAX_CHARS = 6_000;
const UA = "Mozilla/5.0 (compatible; structifai-bewerbung/1.0; +https://structifai.de)";

/** Grobes, abhängigkeitsfreies HTML→Text. Entfernt script/style + Tags, kollabiert Whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(input: string): string {
  const d = input.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return d.toLowerCase();
}

async function fetchPath(origin: string, path: string): Promise<string> {
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(PER_PATH_TIMEOUT_MS),
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return "";
    return htmlToText(await res.text());
  } catch {
    return ""; // Timeout / DNS / TLS — bewusst geschluckt.
  }
}

export async function enrichDomain(domain: string): Promise<string> {
  const host = normalizeDomain(domain);
  if (!host) throw new Error("enrich: leere Domain.");
  const origin = `https://${host}`;

  const results = await Promise.all(PATHS.map((p) => fetchPath(origin, p)));

  // Dedupe per Pfad-Block (gleiche Nav/Header tauchen mehrfach auf).
  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const block of results) {
    if (!block) continue;
    const key = block.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push(block);
  }

  const text = chunks.join("\n\n").slice(0, MAX_CHARS);
  if (text.length < 1) throw new Error(`enrich: keine öffentlichen Inhalte für ${host} erreichbar.`);
  return text;
}

// CLI: `bun run enrich strategyframe.ai`
if (import.meta.main) {
  const domain = process.argv[2];
  if (!domain) {
    console.error("Usage: bun run enrich <domain>");
    process.exit(1);
  }
  const text = await enrichDomain(domain);
  console.error(`[enrich] ${text.length} Zeichen aus ${domain}`);
  console.log(text);
}
