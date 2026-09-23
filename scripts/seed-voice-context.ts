/**
 * Seedet den globalen Sprachassistenten-Kontext (bw_voice_agent_context) aus
 * `pipeline/voice/context-fallback.json` — Quelle für `kontext_laden`/`bw-famulor-context`
 * (Plan B, s. .claude/rules/voice.md). Nutzt den SERVICE-ROLE-Key — läuft nur lokal/offline,
 * nie im Client (Tabelle ist RLS-dicht, service-role only).
 *
 *   bun run seed:voice-context
 *
 * Schreibt eine Zeile je bekannter id (profile, projects, faq, stories, personal,
 * pronunciation) — Ids, die in der Datei fehlen, werden übersprungen statt mit null
 * überschrieben. Upsert per PostgREST `on_conflict=id` (merge-duplicates).
 */

export {}; // Modul-Marker, damit Top-Level-await erlaubt ist

const IDS = ["profile", "projects", "faq", "stories", "personal", "pronunciation"] as const;
type ContextId = (typeof IDS)[number];

function fail(message: string): never {
  console.error(`[seed-voice-context] ${message}`);
  process.exit(1);
}

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) fail(`${name} fehlt in der Umgebung (.env).`);
  return v;
}

async function rest(
  base: string,
  key: string,
  path: string,
  init: { method: string; prefer?: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method: init.method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) fail(`${init.method} ${path} → ${res.status}: ${text}`);
  return text ? (JSON.parse(text) as unknown) : null;
}

async function main(): Promise<void> {
  const filePath = "pipeline/voice/context-fallback.json";
  const raw = (await Bun.file(filePath).json()) as Record<string, unknown>;

  const base = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  const now = new Date().toISOString();
  const rows = (IDS as readonly ContextId[])
    .filter((id) => raw[id] !== undefined)
    .map((id) => ({ id, content: raw[id], updated_at: now }));

  if (rows.length === 0) fail(`keine bekannten Ids (${IDS.join(",")}) in ${filePath} gefunden.`);

  await rest(base, key, "bw_voice_agent_context?on_conflict=id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: rows,
  });

  for (const row of rows) console.error(`[seed-voice-context] geschrieben: ${row.id}`);

  const skipped = (IDS as readonly ContextId[]).filter((id) => raw[id] === undefined);
  if (skipped.length > 0) console.error(`[seed-voice-context] übersprungen (fehlt in Datei): ${skipped.join(",")}`);
}

await main();
