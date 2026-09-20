/**
 * Seedet eine Bewerbung (n=1-Inhalt) nach Supabase: `applications` + eine unveränderliche
 * Version in `application_content`. Nutzt den SERVICE-ROLE-Key — läuft nur lokal/offline,
 * nie im Client (beide Tabellen sind RLS-dicht, vgl. 0003_applications.sql).
 *
 *   bun run seed:application applications/lm-2786630.json
 *   bun run seed:application applications/lm-2786630.json --release
 *
 * Ohne `--release` bleibt die Bewerbung Entwurf: Seite und Gespräch dürfen sie nicht laden.
 * Freigegebene Versionen sind per Trigger unveränderlich — für neuen Text `version` erhöhen.
 */

export {}; // Modul-Marker, damit Top-Level-await erlaubt ist

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

interface ApplicationFile {
  id: string;
  company: string;
  role_title: string;
  job_url?: string;
  job_source_id?: string;
  enrich_domain?: string;
  version: number;
  page: Record<string, unknown>;
  voice: Record<string, unknown>;
}

function fail(message: string): never {
  console.error(`[seed] ${message}`);
  process.exit(1);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Prüft die Datei vollständig, bevor irgendetwas geschrieben wird. */
function parseApplication(raw: unknown): ApplicationFile {
  if (!isRecord(raw)) fail("Datei enthält kein JSON-Objekt.");

  const id = raw.id;
  if (typeof id !== "string" || !SLUG.test(id)) {
    fail("`id` fehlt oder ist kein erlaubter Slug (^[a-z0-9][a-z0-9-]{1,62}$).");
  }

  const company = raw.company;
  const roleTitle = raw.role_title;
  if (typeof company !== "string" || company.trim() === "") fail("`company` fehlt.");
  if (typeof roleTitle !== "string" || roleTitle.trim() === "") fail("`role_title` fehlt.");

  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    fail("`version` fehlt oder ist keine ganze Zahl ab 1.");
  }

  const page = raw.page;
  const voice = raw.voice;
  if (!isRecord(page)) fail("`page` fehlt oder ist kein Objekt.");
  if (!isRecord(voice)) fail("`voice` fehlt oder ist kein Objekt.");

  const jobUrl = raw.job_url;
  const jobSourceId = raw.job_source_id;
  const enrichDomain = raw.enrich_domain;
  if (jobUrl !== undefined && typeof jobUrl !== "string") fail("`job_url` muss Text sein.");
  if (jobSourceId !== undefined && typeof jobSourceId !== "string") {
    fail("`job_source_id` muss Text sein.");
  }
  if (enrichDomain !== undefined && typeof enrichDomain !== "string") {
    fail("`enrich_domain` muss Text sein.");
  }

  return {
    id,
    company,
    role_title: roleTitle,
    ...(jobUrl !== undefined ? { job_url: jobUrl } : {}),
    ...(jobSourceId !== undefined ? { job_source_id: jobSourceId } : {}),
    ...(enrichDomain !== undefined ? { enrich_domain: enrichDomain } : {}),
    version,
    page,
    voice,
  };
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

interface FamulorIds {
  assistant_id: string | null;
  widget_key: string | null;
}

/**
 * Liest `voice.famulor` streng: fehlt der Block ganz, gibt es kein Widget (beide `null`).
 * Ist er da, aber falsch geformt — kein Objekt, oder eine gesetzte ID ist kein nicht-leerer
 * String —, wird abgebrochen statt still `null` zu schreiben; sonst deaktiviert ein Tippfehler
 * das Widget kommentarlos beim nächsten Seed.
 */
function parseFamulor(voice: Record<string, unknown>): FamulorIds {
  const f = voice.famulor;
  if (f === undefined) return { assistant_id: null, widget_key: null };
  if (!isRecord(f)) fail("`voice.famulor` muss ein Objekt sein (assistant_id/widget_key).");

  const assistantId = f.assistant_id;
  const widgetKey = f.widget_key;
  if (assistantId !== undefined && (typeof assistantId !== "string" || !assistantId.trim())) {
    fail("`voice.famulor.assistant_id` muss ein nicht-leerer String sein.");
  }
  if (widgetKey !== undefined && (typeof widgetKey !== "string" || !widgetKey.trim())) {
    fail("`voice.famulor.widget_key` muss ein nicht-leerer String sein.");
  }

  return {
    assistant_id: typeof assistantId === "string" ? assistantId.trim() : null,
    widget_key: typeof widgetKey === "string" ? widgetKey.trim() : null,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) fail("Aufruf: bun run seed:application <datei.json> [--release]");
  const release = process.argv.includes("--release");

  const raw: unknown = await Bun.file(filePath).json();
  const app = parseApplication(raw);
  const famulor = parseFamulor(app.voice);

  const base = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  // 1) Was liegt schon da? Erst danach wird geschrieben.
  const apps = (await rest(
    base, key,
    `bw_applications?select=id,status,released_version&id=eq.${encodeURIComponent(app.id)}`,
    { method: "GET" },
  )) as Array<{ id: string; status: string; released_version: number | null }> | null;
  const current = apps?.[0];

  const versions = (await rest(
    base, key,
    `bw_application_content?select=version,released_at` +
      `&application_id=eq.${encodeURIComponent(app.id)}&version=eq.${app.version}`,
    { method: "GET" },
  )) as Array<{ version: number; released_at: string | null }> | null;
  const existing = versions?.[0];

  if (existing?.released_at) {
    fail(
      `Version ${app.version} von ${app.id} ist bereits freigegeben und unveränderlich. ` +
        `Für neuen Text \`version\` in der Datei erhöhen.`,
    );
  }
  if (existing && !release) {
    fail(
      `Version ${app.version} von ${app.id} liegt schon als Entwurf vor. ` +
        `Mit --release freigeben, oder für neuen Text \`version\` erhöhen.`,
    );
  }

  // 2) Stammdaten. Eine bereits freigegebene Bewerbung darf ein neuer Entwurf NICHT
  //    umschreiben — sonst zieht der Build Firma, Titel oder Anzeigen-ID aus nicht
  //    freigegebenem Material, obwohl der Status weiter 'released' sagt.
  const metadata = {
    company: app.company,
    role_title: app.role_title,
    job_url: app.job_url ?? null,
    job_source_id: app.job_source_id ?? null,
    enrich_domain: app.enrich_domain ?? null,
    famulor_assistant_id: famulor.assistant_id,
    famulor_widget_key: famulor.widget_key,
  };
  const metadataDarfSchreiben = !current || current.status !== "released" || release;

  if (!current) {
    await rest(base, key, "bw_applications", {
      method: "POST",
      prefer: "return=minimal",
      body: { id: app.id, ...metadata },
    });
    console.error(`[seed] angelegt: ${app.id} (${app.company} · ${app.role_title})`);
  } else if (metadataDarfSchreiben) {
    await rest(base, key, `bw_applications?id=eq.${encodeURIComponent(app.id)}`, {
      method: "PATCH", prefer: "return=minimal", body: metadata,
    });
  } else {
    console.error(
      `[seed] ${app.id} ist freigegeben — Stammdaten bleiben unverändert. ` +
        `Sie werden erst mit --release übernommen.`,
    );
  }

  // 3) Inhaltsversion anlegen, falls sie noch nicht existiert.
  if (!existing) {
    // Stammdaten ≠ Inhaltsversion (0007): die Famulor-IDs leben in bw_applications
    // (oben in `metadata`), nicht dupliziert in der versionierten Inhalts-Spalte.
    const { famulor: _famulor, ...voiceContent } = app.voice;
    await rest(base, key, "bw_application_content", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        application_id: app.id,
        version: app.version,
        page: app.page,
        voice: voiceContent,
        released_at: release ? new Date().toISOString() : null,
      },
    });
    console.error(`[seed] application_content: ${app.id} v${app.version}`);
  }

  // 4) Freigabe. Ein vorhandener Entwurf wird hier befördert, statt eine neue Version
  //    zu verlangen — das ist der dokumentierte Ablauf: erst prüfen, dann freigeben.
  if (release) {
    if (existing) {
      await rest(
        base, key,
        `bw_application_content?application_id=eq.${encodeURIComponent(app.id)}` +
          `&version=eq.${app.version}`,
        { method: "PATCH", prefer: "return=minimal",
          body: { released_at: new Date().toISOString() } },
      );
      console.error(`[seed] Entwurf v${app.version} freigegeben`);
    }
    // Der CHECK verlangt released_version, sobald status='released' ist.
    await rest(base, key, `bw_applications?id=eq.${encodeURIComponent(app.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "released", released_version: app.version },
    });
    console.error(`[seed] freigegeben: ${app.id} → v${app.version}`);
  } else {
    console.error(`[seed] Entwurf. Freigabe mit --release, wenn der Inhalt stimmt.`);
  }
}

await main();
