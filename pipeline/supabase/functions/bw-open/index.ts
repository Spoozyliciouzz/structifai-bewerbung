// bw-open — Code aus dem Anschreiben → Adresse des Stellenteils.
// Öffentlich (verify_jwt=false). Schutz: CORS auf die Ankunftsseite, Rate-Limit je IP-Hash,
// nur freigegebene Bewerbungen, neutrale Antworten (verrät nicht, ob ein Code existiert).
import { normalizeCode } from "../../../lib/access-code.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = "https://bewerbung.structifai.de";
const LIMIT = 10;
const WINDOW_S = 3600;

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors() },
  });
}

function sb(): Record<string, string> {
  return { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" };
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function allowed(ip: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bw_bump_rate_limit`, {
    method: "POST",
    headers: sb(),
    body: JSON.stringify({ p_key: `open:${await sha256Hex(ip)}`, p_window_seconds: WINDOW_S, p_limit: LIMIT }),
  });
  if (!res.ok) throw new Error(`rate ${res.status}`);
  return (await res.json()) === true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return json({}, 405);
  if (req.headers.get("origin") !== ORIGIN) return json({}, 403);

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await allowed(ip))) return json({ error: "rate" }, 429);

    let body: { code?: unknown };
    try { body = await req.json(); } catch { return json({}, 404); }
    const code = normalizeCode(body.code);
    if (!code) return json({}, 404);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bw_applications?select=page_slug` +
        `&access_code=eq.${encodeURIComponent(code)}&status=eq.released&page_slug=not.is.null`,
      { headers: sb() },
    );
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    const rows = (await res.json()) as Array<{ page_slug: string }>;
    const row = rows[0];
    return row ? json({ slug: row.page_slug }, 200) : json({}, 404);
  } catch (e) {
    console.error(`[bw-open] ${(e as Error).message}`);
    return json({ error: "server" }, 500);
  }
});
