/**
 * Optionaler Upload in den privaten `bw-cache`-Bucket via Storage-REST.
 * Nutzt den SERVICE-ROLE-Key — nur lokal/offline beim Seeden (Scraper läuft nie im Client).
 * Wenn SUPABASE_URL / SERVICE_ROLE_KEY fehlen, wird der Upload übersprungen (no-op).
 */
export async function uploadToCache(objectPath: string, json: unknown): Promise<boolean> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("[storage] SUPABASE_URL/SERVICE_ROLE_KEY fehlen — Upload übersprungen.");
    return false;
  }
  // Muss zum Lesepfad in build/index.ts passen — schreibt der Scraper nach `cache`, während
  // der Build aus `bw-cache` liest, bleibt der Bucket leer und der Build bricht beim Scrape ab.
  const res = await fetch(`${url}/storage/v1/object/bw-cache/${objectPath}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "x-upsert": "true",
    },
    body: JSON.stringify(json),
  });
  if (!res.ok) throw new Error(`[storage] Upload ${res.status}: ${await res.text()}`);
  console.error(`[storage] hochgeladen: bw-cache/${objectPath}`);
  return true;
}
