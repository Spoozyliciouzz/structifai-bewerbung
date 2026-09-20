// ════════════════════════════════════════════════════════════════════════════
// voice/context.ts — lädt den Reasoning-Kontext (Deno).
//
// Zwei Quellen, streng getrennt:
//   80 % agnostisch — profile, projects, faq, stories, personal, pronunciation.
//     Aus bw_voice_agent_context (Service-Role), sonst aus dem gebündelten
//     context-fallback.json. Gilt für jede Bewerbung gleich.
//   20 % je Bewerbung — the_role, objections, stellenbezogene faq, intro, closing, rules.
//     AUSSCHLIESSLICH aus der freigegebenen Version in bw_application_content.
//
// Für den n=1-Teil gibt es KEINEN Rückfall. Fehlt die Bewerbung, ist sie Entwurf oder
// nicht erreichbar, bleiben diese Felder leer und der Prompt sagt, dass dazu nichts
// freigegeben ist. Das gebündelte JSON enthielt bis 2026-09-15 ein `the_role` mit
// StrategyFrame.AI — ein Rückfall hätte einem LM-Gespräch die Inhalte einer fremden
// Firma untergeschoben.
// ════════════════════════════════════════════════════════════════════════════
import type { AgentContext, ApplicationVoice } from "./types.ts";
import fallback from "./context-fallback.json" with { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Fallback-JSON → agnostischer Teil. `the_role` steht dort bewusst nicht mehr. */
function fromFallback(): AgentContext {
  const f = fallback as unknown as AgentContext;
  return {
    profile: f.profile,
    projects: f.projects,
    faq: f.faq,
    stories: f.stories,
    personal: f.personal,
    pronunciation: f.pronunciation,
  };
}

function sbHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };
}

/** Agnostische Buckets. Sind nicht alle drei DB-Zeilen da → gebündeltes JSON. */
async function loadGlobal(): Promise<AgentContext> {
  if (!SUPABASE_URL || !SERVICE_KEY) return fromFallback();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bw_voice_agent_context?select=id,content`,
      { headers: sbHeaders(), signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return fromFallback();
    const rows = (await res.json()) as Array<{ id: string; content: unknown }>;
    const byId = new Map(rows.map((r) => [r.id, r.content]));
    const profile = byId.get("profile");
    const projects = byId.get("projects");
    const faq = byId.get("faq");
    if (!profile || !projects || !faq) return fromFallback();
    // stories/personal/pronunciation stehen nicht in der DB-Tabelle und bleiben aus dem JSON.
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

/** Nur die vom Server freigegebene Version genau dieser Bewerbung. Sonst null. */
async function loadApplicationVoice(applicationId: string): Promise<ApplicationVoice | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    // status=released UND released_version treffen genau eine Inhaltsversion. Entwürfe und
    // ältere Versionen können damit nicht in ein Gespräch geraten.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bw_applications` +
        `?select=id,released_version,bw_application_content(version,voice,released_at)` +
        `&id=eq.${encodeURIComponent(applicationId)}&status=eq.released`,
      { headers: sbHeaders(), signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      id: string;
      released_version: number | null;
      bw_application_content: Array<{ version: number; voice: unknown; released_at: string | null }>;
    }>;
    const row = rows[0];
    if (!row || row.released_version === null) return null;
    const version = row.bw_application_content.find(
      (c) => c.version === row.released_version && c.released_at !== null,
    );
    if (!version) return null;
    return version.voice as ApplicationVoice;
  } catch {
    return null;
  }
}

/**
 * Lädt den Kontext für genau ein Gespräch.
 * Ohne `applicationId` — oder wenn die Bewerbung nicht freigegeben ist — fehlt der
 * n=1-Teil. Bewusst: lieber eine ehrliche Lücke als fremder Firmenkontext.
 */
export async function loadContext(applicationId?: string): Promise<AgentContext> {
  const global = await loadGlobal();
  const id = applicationId?.trim();
  if (!id) return global;

  const voice = await loadApplicationVoice(id);
  if (!voice) return global;

  return {
    ...global,
    application_id: id,
    the_role: voice.the_role,
    objections: voice.objections,
    // Stellenbezogene Fragen ergänzen die agnostischen, ersetzen sie nicht.
    faq: [...global.faq, ...(voice.faq ?? [])],
    intro: voice.intro,
    closing: voice.closing,
    rules_extra: voice.rules_extra,
  };
}
