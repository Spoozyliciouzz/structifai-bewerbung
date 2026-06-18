// Node-Runner: scraped EINE LinkedIn-Jobanzeige mit gespeicherter Session + lädt in den cache-Bucket.
// Nutzung:  node scraper/scrape-node.mjs <jobId>   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env)
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const STATE = process.env.LI_STATE_PATH ?? "scraper/.auth/state.json";
const id = process.argv[2] ?? process.env.TARGET_JOB_ID;
if (!id) { console.error("Usage: node scraper/scrape-node.mjs <jobId>"); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();
try {
  await page.goto(`https://www.linkedin.com/jobs/view/${id}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  // "Mehr anzeigen" aufklappen (Beschreibung sonst gekürzt) — mehrere Varianten.
  for (const t of ["Mehr anzeigen", "mehr", "see more", "Show more"]) {
    const loc = page.locator(`button:has-text("${t}")`).first();
    if (await loc.count()) { await loc.click().catch(() => {}); await page.waitForTimeout(500); }
  }
  // Titel/Firma aus dem Page-<title> ("Titel | Firma | LinkedIn") — stabil trotz obfuskierter Klassen.
  const tparts = (await page.title()).split("|").map((s) => s.trim());
  const title = tparts[0] ?? "";
  const company = tparts[1] ?? "";
  // Beschreibung = Text des main-Bereichs (Extract-LLM filtert Nav-Rauschen).
  const text = await page.evaluate(() =>
    (document.querySelector("main")?.innerText || document.body.innerText || "").replace(/\s+/g, " ").trim());
  if (!text || text.length < 300) throw new Error(`Beschreibung zu kurz — Session abgelaufen? (id ${id}); title="${title}" len=${text.length}`);

  const result = { id, title, company, text, scraped_at: new Date().toISOString() };
  await mkdir("scraper/cache", { recursive: true });
  await writeFile(`scraper/cache/job-${id}.json`, JSON.stringify(result, null, 2), "utf8");
  console.log(`✓ scraped: "${title}" @ "${company}" (${text.length} Zeichen)`);

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    const res = await fetch(`${url}/storage/v1/object/cache/job-${id}.json`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-upsert": "true" },
      body: JSON.stringify(result),
    });
    if (!res.ok) throw new Error(`Upload ${res.status}: ${await res.text()}`);
    console.log(`✓ hochgeladen: cache/job-${id}.json`);
  } else {
    console.log("(kein SUPABASE_URL/SERVICE_ROLE_KEY → Upload übersprungen, nur lokal)");
  }
} finally {
  await browser.close();
}
process.exit(0);
