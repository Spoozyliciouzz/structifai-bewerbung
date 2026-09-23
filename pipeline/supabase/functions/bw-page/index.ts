// bw-page — liefert den Stellenteil einer Bewerbung, direkt aus der freigegebenen Version.
// Öffentlich (verify_jwt=false). Der Slug ist nicht erratbar (128 Bit); Entwürfe liefern 404.
import { PAGE_SLUG_RE } from "../../../lib/access-code.ts";
import { buildReleasedPage } from "../../../lib/sitedata.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = "https://bewerbung.structifai.de";

interface Row {
  company: string;
  role_title: string;
  released_version: number | null;
  famulor_widget_key: string | null;
  bw_application_content: Array<{ version: number; page: unknown; released_at: string | null }> | null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": status === 200 ? "private, max-age=60" : "no-store",
      "x-robots-tag": "noindex, nofollow",
      "Access-Control-Allow-Origin": ORIGIN,
      "Vary": "Origin",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({}, 405);
  const slug = new URL(req.url).searchParams.get("s") ?? "";
  if (!PAGE_SLUG_RE.test(slug)) return json({}, 404);

  try {
    const cols = "company,role_title,released_version,famulor_widget_key," +
      "bw_application_content(version,page,released_at)";
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bw_applications?select=${cols}` +
        `&page_slug=eq.${encodeURIComponent(slug)}&status=eq.released`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) throw new Error(`load ${res.status}`);
    const row = ((await res.json()) as Row[])[0];
    if (!row) return json({}, 404);

    // Genau die freigegebene Version — nie eine neuere Entwurfsversion.
    const v = (row.bw_application_content ?? []).find(
      (c) => c.version === row.released_version && c.released_at !== null,
    );
    if (!v) return json({}, 404);

    return json(buildReleasedPage({
      company: row.company, title: row.role_title, page: v.page, widgetKey: row.famulor_widget_key,
    }), 200);
  } catch (e) {
    console.error(`[bw-page] ${(e as Error).message}`);
    return json({}, 500);
  }
});
