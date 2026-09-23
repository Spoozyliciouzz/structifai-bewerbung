// ════════════════════════════════════════════════════════════════════════════
// bw-famulor-context/<application_id> — Famulor Mid-Call-Tool `kontext_laden`. Liefert den
// AKTUELLEN, freigegebenen Bewerbungs-Kontext direkt aus der DB: globale Fakten aus
// bw_voice_agent_context + stellenbezogene voice aus der freigegebenen bw_application_content-
// Version. Der Assistenten-Prompt enthält damit nur noch Regeln — Fakten kommen live von hier
// (Plan B, s. .claude/rules/voice.md). Quelle der Wahrheit = DB, nicht mehr das Repo-JSON.
//
// KEIN Auth-Check: die Nutzlast ist public-safe per Konstruktion — dieselben Fakten, die auch
// auf der öffentlichen Bewerbungsseite stehen (nur freigegebene Versionen, nur speakableRole()-
// gefilterte the_role-Felder ohne internes Planungs-Meta wie job_url/work_sample/email_policy).
// application_id ist nicht ratbar-kritisch (Slug, kein Secret) und die Function selbst kennt
// keine PII. Ein API-Key wäre hier zusätzliche Komplexität ohne echten Schutzgewinn.
//
// Antwort < 1 s: drei PostgREST-Reads, kein LLM. Cache 60 s (Famulor ruft pro Gesprächsstart neu).
// DEPLOY: `supabase functions deploy bw-famulor-context --no-verify-jwt --use-api --workdir pipeline`
// ════════════════════════════════════════════════════════════════════════════
import { buildContextPayload, type AgentContext, type ApplicationVoice, type FaqItem } from "../../../lib/famulor-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const GLOBAL_IDS = ["profile", "projects", "faq", "stories", "personal", "pronunciation"] as const;
type GlobalId = (typeof GLOBAL_IDS)[number];

function sbHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface ReleasedApplication {
  id: string;
  status: string;
  released_version: number | null;
}

/** Freigegebene Bewerbung + released_version. `null` ⇒ nicht gefunden oder nicht freigegeben. */
async function loadReleasedApplication(id: string): Promise<ReleasedApplication | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bw_applications?select=id,status,released_version` +
      `&id=eq.${encodeURIComponent(id)}&status=eq.released`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`bw_applications ${res.status}`);
  const rows = (await res.json()) as ReleasedApplication[];
  return rows[0] ?? null;
}

/** `voice` der freigegebenen Inhaltsversion. `null` ⇒ keine passende, freigegebene Version. */
async function loadReleasedVoice(applicationId: string, version: number): Promise<unknown> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bw_application_content?select=voice` +
      `&application_id=eq.${encodeURIComponent(applicationId)}&version=eq.${version}` +
      `&released_at=not.is.null`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`bw_application_content ${res.status}`);
  const rows = (await res.json()) as Array<{ voice: unknown }>;
  return rows[0]?.voice ?? null;
}

/** Globaler Kontext aus bw_voice_agent_context — id → content. */
async function loadGlobalContext(): Promise<Partial<Record<GlobalId, unknown>>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bw_voice_agent_context?select=id,content&id=in.(${GLOBAL_IDS.join(",")})`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`bw_voice_agent_context ${res.status}`);
  const rows = (await res.json()) as Array<{ id: string; content: unknown }>;
  const byId: Partial<Record<GlobalId, unknown>> = {};
  for (const row of rows) {
    if ((GLOBAL_IDS as readonly string[]).includes(row.id)) byId[row.id as GlobalId] = row.content;
  }
  return byId;
}

/** Baut AgentContext aus den geladenen Rohdaten — profile/projects/faq sind Pflicht. */
function toAgentContext(byId: Partial<Record<GlobalId, unknown>>): AgentContext | null {
  const missing = (["profile", "projects", "faq"] as const).filter((k) => byId[k] === undefined);
  if (missing.length > 0) {
    console.error(`[famulor-context] globaler Kontext unvollständig: fehlt ${missing.join(",")}`);
    return null;
  }
  const ctx: AgentContext = {
    profile: byId.profile as Record<string, unknown>,
    projects: byId.projects as Array<Record<string, unknown>>,
    faq: byId.faq as FaqItem[],
  };
  if (byId.stories !== undefined) ctx.stories = byId.stories as Array<Record<string, unknown>>;
  if (byId.personal !== undefined) ctx.personal = byId.personal as Record<string, unknown>;
  if (byId.pronunciation !== undefined) ctx.pronunciation = byId.pronunciation as Record<string, string>;
  return ctx;
}

/** Minimale Formprüfung von `voice` — genug, um den Cast auf ApplicationVoice zu belegen. */
function toApplicationVoice(raw: unknown): ApplicationVoice | null {
  if (
    !isRecord(raw) ||
    typeof raw.intro !== "string" ||
    typeof raw.closing !== "string" ||
    !Array.isArray(raw.rules_extra) ||
    !isRecord(raw.the_role) ||
    typeof raw.the_role.company !== "string" ||
    typeof raw.the_role.title !== "string"
  ) {
    console.error(`[famulor-context] voice unvollständig, keys=${isRecord(raw) ? Object.keys(raw).join(",") : typeof raw}`);
    return null;
  }
  return raw as unknown as ApplicationVoice;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return new Response(null, { status: 404 });

  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const applicationId = segments[segments.length - 1] ?? "";
  if (segments.length < 2 || !SLUG.test(applicationId)) return new Response(null, { status: 404 });

  let application: ReleasedApplication | null;
  try {
    application = await loadReleasedApplication(applicationId);
  } catch (e) {
    console.error(`[famulor-context] ${(e as Error).message}`);
    return new Response(null, { status: 500 });
  }
  if (!application || application.released_version === null) return new Response(null, { status: 404 });

  let rawVoice: unknown;
  let byId: Partial<Record<GlobalId, unknown>>;
  try {
    [rawVoice, byId] = await Promise.all([
      loadReleasedVoice(applicationId, application.released_version),
      loadGlobalContext(),
    ]);
  } catch (e) {
    console.error(`[famulor-context] ${(e as Error).message}`);
    return new Response(null, { status: 500 });
  }
  if (rawVoice === null) return new Response(null, { status: 404 });

  const ctx = toAgentContext(byId);
  if (!ctx) return new Response(null, { status: 500 });

  const voice = toApplicationVoice(rawVoice);
  if (!voice) return new Response(null, { status: 500 });

  const payload = buildContextPayload(ctx, voice);
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
});
