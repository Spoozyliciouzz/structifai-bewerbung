// ════════════════════════════════════════════════════════════════════════════
// request-call/index.ts — Browser-getriggerter, token-gesicherter Call-Anstoß (M2).
// Die Live-Seite ruft diesen Endpoint mit {jobId, callToken}. Das geteilte Shared-Secret
// (TRIGGER_SHARED_SECRET) wird NIE an den Client ausgeliefert — dieser Endpoint hält es
// server-seitig und ruft outbound-trigger Server-zu-Server.
//
// Gate-Reihenfolge (fail-closed): CORS → body → PII-Row laden → call_token (timing-safe) →
// token_used → token_expires → consent+E.164 → Rate-Limit → atomarer Token-Burn (PATCH) →
// outbound-trigger (best-effort) → DSGVO-Delete der PII-Row.
// DEPLOY: `--no-verify-jwt` (eigene Token-Auth), `--use-api --workdir pipeline`.
// ════════════════════════════════════════════════════════════════════════════
import { E164_RE, timingSafeEqual } from "../../../lib/validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHARED_SECRET = Deno.env.get("TRIGGER_SHARED_SECRET") ?? "";

const ALLOWED_ORIGINS = ["https://bewerbung.structifai.de", "https://structifai.de", "https://www.structifai.de"];

interface RequestCallInput {
  jobId?: string;
  callToken?: string;
}

interface PiiRow {
  job_id: string;
  email: string | null;
  phone: string | null;
  call_consent: boolean | null;
  first_name: string | null;
  role: string | null;
  ice_cream: string | null;
  call_token: string | null;
  call_token_expires_at: string | null;
  call_token_used: boolean | null;
}

/** CORS-Header für erlaubte Origins (sonst kein ACAO → Browser blockt). */
function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(origin) },
  });
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

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);

  let body: RequestCallInput;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400, origin); }

  const jobId = (body.jobId ?? "").trim();
  const callToken = (body.callToken ?? "").trim();
  if (!jobId || !callToken) return json({ error: "bad_request" }, 400, origin);
  // jobId ist untrusted (aus dem Browser) → URL-encoden, kein PostgREST-Query-Breakout.
  const jid = encodeURIComponent(jobId);

  // PII-Row laden (Service-Role; RLS dicht).
  let row: PiiRow | undefined;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/build_jobs_pii?job_id=eq.${jid}&select=*`,
      { headers: sbHeaders() },
    );
    if (!res.ok) throw new Error(`select pii ${res.status}`);
    [row] = (await res.json()) as PiiRow[];
  } catch (e) {
    console.error(`[request-call] load pii: ${(e as Error).message}`);
    return json({ error: "internal" }, 500, origin);
  }

  // Token-Gate (fail-closed, timing-safe). Kein Token → keine Auskunft über Existenz.
  if (!row || !row.call_token) return json({ error: "token" }, 403, origin);
  if (!timingSafeEqual(row.call_token, callToken)) return json({ error: "token" }, 403, origin);
  if (row.call_token_used === true) return json({ error: "used" }, 403, origin);
  if (!row.call_token_expires_at || new Date(row.call_token_expires_at) < new Date()) {
    return json({ error: "expired" }, 403, origin);
  }

  // Consent + gültige E.164 (UWG/DSGVO-Voraussetzung für den Anruf).
  if (row.call_consent !== true || !E164_RE.test(row.phone ?? "")) {
    return json({ error: "consent" }, 400, origin);
  }

  // Rate-Limit: eine Anforderung pro Job/Tag.
  try {
    const ok = await rateLimit(`call:${jobId}`, 86400, 1);
    if (!ok) return json({ error: "rate_limited" }, 429, origin);
  } catch (e) {
    console.error(`[request-call] rate-limit: ${(e as Error).message}`);
    return json({ error: "internal" }, 500, origin);
  }

  // Token atomar verbrennen: PATCH nur auf call_token_used=false. Leeres Ergebnis ⇒
  // gleichzeitig schon verbraucht (Race) ⇒ 409.
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/build_jobs_pii?job_id=eq.${jid}&call_token_used=eq.false`,
      {
        method: "PATCH",
        headers: { ...sbHeaders(), Prefer: "return=representation" },
        body: JSON.stringify({ call_token_used: true }),
      },
    );
    if (!res.ok) throw new Error(`patch token ${res.status}`);
    const patched = (await res.json()) as PiiRow[];
    if (patched.length === 0) return json({ error: "used" }, 409, origin);
  } catch (e) {
    console.error(`[request-call] burn token: ${(e as Error).message}`);
    return json({ error: "internal" }, 500, origin);
  }

  // Call Server-zu-Server triggern (Shared-Secret bleibt server-seitig). Best-effort.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/outbound-trigger`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SHARED_SECRET}` },
      body: JSON.stringify({
        jobId,
        phone: row.phone,
        email: row.email,
        firstName: row.first_name,
        role: row.role,
        iceCream: row.ice_cream,
      }),
    });
    if (!res.ok) console.error(`[request-call] outbound-trigger ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error(`[request-call] outbound-trigger: ${(e as Error).message}`);
  }

  // DSGVO: Zweck erfüllt → PII-Row löschen.
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/build_jobs_pii?job_id=eq.${jid}`, {
      method: "DELETE",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
    });
    if (!res.ok) console.error(`[request-call] delete pii ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error(`[request-call] delete pii: ${(e as Error).message}`);
  }

  return json({ ok: true }, 200, origin);
});
