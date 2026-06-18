import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { JobCache } from "./schema.ts";
import { uploadToCache } from "./storage.ts";

/**
 * Headless-Scrape EINER LinkedIn-Jobanzeige mit gespeicherter Session.
 * Kein Bulk, kein Live-Scrape im Request-Pfad — dies läuft 1× offline zum Seeden.
 * Ergebnis → scraper/cache/job-<id>.json (lokal, gitignored) + privater cache-Bucket.
 */

const STATE_PATH = process.env.LI_STATE_PATH ?? "scraper/.auth/state.json";

export async function scrapeJob(id: string): Promise<JobCache> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();

  try {
    await page.goto(`https://www.linkedin.com/jobs/view/${id}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // "Mehr anzeigen" aufklappen, falls vorhanden (Beschreibung ist sonst gekürzt).
    const more = page.locator('button:has-text("Mehr anzeigen"), button:has-text("see more")').first();
    if (await more.count()) {
      await more.click().catch(() => {});
    }

    const title = (await page.locator("h1").first().textContent())?.trim() ?? "";
    const company =
      (await page
        .locator('.job-details-jobs-unified-top-card__company-name, a[href*="/company/"]')
        .first()
        .textContent())
        ?.trim() ?? "";
    const text =
      (await page
        .locator('#job-details, .jobs-description__content, .show-more-less-html__markup')
        .first()
        .textContent())
        ?.trim() ?? "";

    if (!text || text.length < 100) {
      throw new Error(`scrapeJob: Beschreibung zu kurz — Session abgelaufen? (id ${id})`);
    }

    const result: JobCache = {
      id,
      title,
      company,
      text,
      scraped_at: new Date().toISOString(),
    };

    await mkdir("scraper/cache", { recursive: true });
    const localPath = `scraper/cache/job-${id}.json`;
    await writeFile(localPath, JSON.stringify(result, null, 2), "utf8");
    console.error(`✓ ${localPath} (${text.length} Zeichen)`);

    await uploadToCache(`job-${id}.json`, result);
    return result;
  } finally {
    await browser.close();
  }
}

// CLI: `bun run scrape:job 4428605958`
if (import.meta.main) {
  const id = process.argv[2] ?? process.env.TARGET_JOB_ID;
  if (!id) {
    console.error("Usage: bun run scrape:job <jobId>");
    process.exit(1);
  }
  await scrapeJob(id);
}
