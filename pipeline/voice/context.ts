// ════════════════════════════════════════════════════════════════════════════
// voice/context.ts — lädt den Reasoning-Kontext (Deno). Primär aus voice_agent_context
// (Service-Role), Fallback = gebündeltes context-fallback.json (public-safe, aus dennis.json).
// ════════════════════════════════════════════════════════════════════════════
import type { AgentContext } from "./types.ts";
import fallback from "./context-fallback.json" with { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Fallback-JSON → AgentContext (Felder aus der gebündelten Datei). */
function fromFallback(): AgentContext {
  const f = fallback as unknown as AgentContext;
  return {
    profile: f.profile,
    projects: f.projects,
    faq: f.faq,
    stories: f.stories,
    objections: f.objections,
    the_role: f.the_role,
    personal: f.personal,
    pronunciation: f.pronunciation,
  };
}

/**
 * Lädt Kontext. Sind alle drei DB-Zeilen (profile/projects/faq) da → DB, sonst Fallback-JSON.
 * Aussprache-Hilfen kommen immer aus dem Fallback (nicht in der DB-Tabelle vorgesehen).
 */
export async function loadContext(): Promise<AgentContext> {
  if (!SUPABASE_URL || !SERVICE_KEY) return fromFallback();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/voice_agent_context?select=id,content`,
      {
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!res.ok) return fromFallback();
    const rows = (await res.json()) as Array<{ id: string; content: unknown }>;
    const byId = new Map(rows.map((r) => [r.id, r.content]));
    const profile = byId.get("profile");
    const projects = byId.get("projects");
    const faq = byId.get("faq");
    if (!profile || !projects || !faq) return fromFallback();
    // DB liefert profile/projects/faq; übrige Buckets (stories/objections/the_role/pronunciation)
    // kommen aus dem Fallback-JSON.
    return {
      ...fromFallback(),
      profile: profile as Record<string, unknown>,
      projects: projects as Array<Record<string, unknown>>,
      faq: faq as Array<{ q: string; a: string }>,
    };
  } catch {
    return fromFallback();
  }
}
