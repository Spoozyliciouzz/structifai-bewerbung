// Node-Runner für den LinkedIn-Login (Bun hängt beim headful-Launch auf Windows).
// Nutzung im EIGENEN Terminal vom Projekt-Root:  node scraper/auth-node.mjs
// Browser öffnet → einloggen (inkl. 2FA) → hier ENTER → Session wird gespeichert.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const STATE = process.env.LI_STATE_PATH ?? "scraper/.auth/state.json";
await mkdir(dirname(STATE), { recursive: true });

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("https://www.linkedin.com/login");

console.log("→ Bitte im geöffneten Browser bei LinkedIn einloggen (inkl. 2FA).");
console.log("→ Danach HIER im Terminal ENTER drücken, um die Session zu speichern.");
await new Promise((resolve) => process.stdin.once("data", resolve));

await ctx.storageState({ path: STATE });
console.log(`✓ Session gespeichert: ${STATE}`);
await browser.close();
process.exit(0);
