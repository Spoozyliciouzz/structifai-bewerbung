import { test, expect } from "bun:test";
import { esc, renderSite } from "../pipeline/render/site.ts";

test("esc neutralisiert XSS-Zeichen", () => {
  expect(esc(`<script>alert(1)</script>`)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(esc(`" onerror="x`)).toBe("&quot; onerror=&quot;x");
  expect(esc(`a&b`)).toBe("a&amp;b");
  expect(esc(`'`)).toBe("&#39;");
});

test("renderSite escapt untrusted LLM-/Enrich-Strings (Stored-XSS-Grenze §16.1)", () => {
  const html = renderSite({
    company: `Evil<script>steal()</script>`,
    title: `CoS" onload="x`,
    matches: [{ requirement: `<img src=x onerror=alert(1)>`, level: "stark", evidence: `</style><script>1</script>` }],
    why_role: `<b>nope</b>`,
    automation_example: `pipeline & co`,
    email: `<a>e@x.de</a>`,
    contact: "d.benter@djwcapitalmanagement.de",
  });
  // Kein roher, ausführbarer Script-Tag aus untrusted Input.
  expect(html).not.toContain("<script>steal()");
  expect(html).not.toContain("<img src=x onerror");
  expect(html).not.toContain(`onload="x`);
  // Escaped-Varianten sind vorhanden.
  expect(html).toContain("Evil&lt;script&gt;");
  expect(html).toContain("&lt;img src=x onerror");
});

test("renderSite setzt CSP-Meta und kein eigenes JS", () => {
  const html = renderSite({
    company: "X", title: "Y", matches: [{ requirement: "r", level: "solide", evidence: "e" }],
    why_role: "w", automation_example: "a", email: "e@x.de", contact: "c@x.de",
  });
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("script-src 'none'");
});

test("renderSite mappt unbekanntes level defensiv auf solide", () => {
  const html = renderSite({
    company: "X", title: "Y",
    // @ts-expect-error — Test für defensives Fallback bei kaputtem LLM-Output
    matches: [{ requirement: "r", level: "garbage", evidence: "e" }],
    why_role: "w", automation_example: "a", email: "e@x.de", contact: "c@x.de",
  });
  expect(html).toContain("solide");
});
