import { test, expect } from "bun:test";
import { htmlToText } from "../scraper/src/enrich.ts";

test("htmlToText entfernt script/style komplett", () => {
  const html = `<p>Hallo</p><script>alert('x')</script><style>.a{}</style><span>Welt</span>`;
  const text = htmlToText(html);
  expect(text).toContain("Hallo");
  expect(text).toContain("Welt");
  expect(text).not.toContain("alert");
  expect(text).not.toContain(".a{}");
});

test("htmlToText kollabiert Whitespace und dekodiert Entities", () => {
  const html = `<div>A   &amp;   B\n\n  C</div>`;
  expect(htmlToText(html)).toBe("A & B C");
});

test("htmlToText strippt Tags", () => {
  expect(htmlToText("<h1>Titel</h1>")).toBe("Titel");
});
