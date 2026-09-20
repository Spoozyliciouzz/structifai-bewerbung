// ════════════════════════════════════════════════════════════════════════════
// bw-famulor-webhook/<token> — nimmt Famulors `call.completed` entgegen und legt das Transkript
// in bw_voice_calls ab. Der Webhook ist unsigniert (Famulor-Doku 2026-09-20); Auth ist der
// Token im Pfad (FAMULOR_WEBHOOK_TOKEN), konstant-zeitig verglichen. Falscher Token ⇒ 404 ohne
// Body — die URL darf nicht als „existiert" erkennbar sein.
// Antwort immer < 5 s (Famulor-Timeout-Default): kein LLM, keine Mail, nur ein Insert.
// DEPLOY: `supabase functions deploy bw-famulor-webhook --no-verify-jwt --use-api --workdir pipeline`
// ════════════════════════════════════════════════════════════════════════════
import { timingSafeEqual } from "../../../lib/validate.ts";
import { isRecord, parseCallCompleted, type VoiceCallRow } from "../../../lib/famulor.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN = Deno.env.get("FAMULOR_WEBHOOK_TOKEN") ?? "";

function sbHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" };
}

/** Welche Bewerbung gehört zum Assistenten? Unbekannt ⇒ null (fremder Assistent, z. B. Alex). */
async function applicationFor(assistantId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bw_applications?select=id&famulor_assistant_id=eq.${encodeURIComponent(assistantId)}&limit=1`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`lookup application ${res.status}`);
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/** Insert-Zeile für bw_voice_calls — explizite Spalten, damit sie exakt zur Tabelle passen
 * (kein Spread von VoiceCallRow: assistant_id ist dort drin, aber keine Tabellenspalte). */
function toInsertRow(row: VoiceCallRow, applicationId: string): Record<string, unknown> {
  return {
    provider_call_id: row.provider_call_id,
    application_id: applicationId,
    direction: row.direction,
    status: row.status,
    duration_seconds: row.duration_seconds,
    turns: row.turns,
    summary: row.summary,
    ended_at: row.ended_at,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response(null, { status: 404 });

  // Token = letztes Pfadsegment. Ohne konfigurierten Token ist die Function geschlossen.
  const seg = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!TOKEN || seg.length !== TOKEN.length || !timingSafeEqual(seg, TOKEN)) {
    return new Response(null, { status: 404 });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch { return new Response(null, { status: 400 }); }

  const row = parseCallCompleted(payload);
  if (!row) {
    // event=call.completed aber ohne verwertbare IDs ⇒ kein Insert-Kandidat, aber wert zu wissen
    // warum. Keys, nie Values — data kann PII-nahe Transkript-Inhalte tragen.
    if (isRecord(payload) && payload.event === "call.completed") {
      console.warn("[famulor] call.completed ohne verwertbare IDs; keys=" + Object.keys(isRecord(payload.data) ? payload.data : {}).join(","));
    }
    return new Response(null, { status: 202 }); // anderes Event — bewusst ignoriert
  }

  let applicationId: string | null;
  try {
    applicationId = await applicationFor(row.assistant_id);
  } catch (e) {
    console.error(`[famulor] ${(e as Error).message}`);
    return new Response(null, { status: 500 }); // Famulor wiederholt (retries=2)
  }
  if (!applicationId) {
    console.warn(`[famulor] unbekannter Assistent ${row.assistant_id} — kein Insert`);
    return new Response(null, { status: 202 });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/bw_voice_calls?on_conflict=provider_call_id`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(toInsertRow(row, applicationId)),
  });
  if (!res.ok) {
    // Nie den Response-Body loggen: PostgREST-`details` kann eingefügte Werte (Transkript-nahe
    // Daten) echoen. Status reicht zum Debuggen; Details bei Bedarf direkt in den DB-Logs nachsehen.
    console.error(`[famulor] insert ${res.status}`);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
});
