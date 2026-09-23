import { expect, test } from "bun:test";
import { normalizeCode } from "../pipeline/lib/access-code.ts";

test("arrival.js normalisiert wie access-code.ts", async () => {
  const js = await Bun.file("landing/assets/arrival.js").text();
  expect(js).toContain('.toUpperCase().replace(/[\\s-]+/g, "")');
  expect(js).toContain("/^[A-Z0-9]{3,16}$/");
  expect(normalizeCode(" ab-7q4k ")).toBe("AB7Q4K");
});

test("Ankunftsseite: indexierbar, keine Altlasten, kein Widget", async () => {
  const html = await Bun.file("landing/index.html").text();
  expect(html).not.toMatch(/noindex/);
  for (const alt of ["Chief of Staff", "strategyframe", "sich selbst baut", "famulor", "Pipeline live"]) {
    expect(html.toLowerCase()).not.toContain(alt.toLowerCase());
  }
});

test("b.js setzt Daten nie per innerHTML und prüft Links", async () => {
  const js = await Bun.file("landing/assets/b.js").text();
  expect(js).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  expect(js).toContain(String.raw`/^https?:\/\//i`);
  expect(js).toContain('LEVELS[f.level] || LEVELS["solide"]');
});

test("b.html steht auf noindex; b.js nutzt die IDs von expense-case.js", async () => {
  const html = await Bun.file("landing/b.html").text();
  expect(html).toContain('content="noindex, nofollow"');
  const js = await Bun.file("landing/assets/b.js").text();
  const ec = await Bun.file("landing/assets/expense-case.js").text();
  for (const id of ["expense-options", "expense-preview"]) {
    expect(js).toContain(`"${id}"`);
    expect(ec).toContain(`"${id}"`);
  }
  expect(js).toContain('"wrap-" + freeId');
  expect(ec).toContain('"wrap-" + pair[0]');
});
