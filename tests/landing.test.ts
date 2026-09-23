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
