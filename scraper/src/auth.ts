import { chromium } from "playwright";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Einmaliger, headful LinkedIn-Login. Speichert `storageState` nach LI_STATE_PATH.
 *
 * ToS-Hinweis: eigener Account, eigene Sicht, kein Bulk. Die gespeicherte Session ist
 * eine AKTIVE CREDENTIAL — sie ist gitignored (scraper/.auth/) und darf NIE committed
 * werden (public = Account-Übernahme, §15.1).
 *
 * Ablauf: Browser öffnet sich → manuell einloggen (inkl. 2FA) → im Terminal Enter drücken.
 */

const STATE_PATH = process.env.LI_STATE_PATH ?? "scraper/.auth/state.json";

async function main(): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login");
  console.error("→ Bitte im geöffneten Browser einloggen (inkl. 2FA).");
  console.error("→ Danach hier im Terminal ENTER drücken, um die Session zu speichern.");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  await context.storageState({ path: STATE_PATH });
  console.error(`✓ storageState gespeichert: ${STATE_PATH}`);
  await browser.close();
}

if (import.meta.main) {
  await main();
}
