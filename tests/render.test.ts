import { test, expect } from "bun:test";
import { esc, renderSite, renderTechnik, type SiteInput } from "../pipeline/render/site.ts";

const basis: SiteInput = {
  company: "LM IT Services AG",
  title: "Head of AI & Processes",
  profile: { facts: ["Düsseldorf"], bullets: ["baut und ownt"], cases: [] },
  contact: "d.benter@djwcapitalmanagement.de",
};

test("esc neutralisiert XSS-Zeichen", () => {
  expect(esc(`<script>alert(1)</script>`)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(esc(`" onerror="x`)).toBe("&quot; onerror=&quot;x");
  expect(esc(`a&b`)).toBe("a&amp;b");
  expect(esc(`'`)).toBe("&#39;");
});

test("renderSite escapt untrusted Strings (Stored-XSS-Grenze §16.1)", () => {
  const html = renderSite({
    ...basis,
    company: `Evil<script>steal()</script>`,
    title: `CoS" onload="x`,
    profile: {
      facts: [`<img src=x onerror=alert(1)>`],
      bullets: [`</style><script>1</script>`],
      cases: [{ name: `<b>nope</b>`, one: `pipeline & co` }],
    },
    page: {
      hero: { headline: `<svg onload=alert(1)>` },
      fit: [{ requirement: `<img src=x onerror=alert(1)>`, level: "stark", evidence: `</style><script>1</script>` }],
    },
  });
  expect(html).not.toContain("<script>steal()");
  expect(html).not.toContain("<img src=x onerror");
  expect(html).not.toContain(`onload="x`);
  expect(html).not.toContain("<svg onload");
  expect(html).toContain("Evil&lt;script&gt;");
  expect(html).toContain("&lt;img src=x onerror");
});

test("ohne Arbeitsprobe bleibt script-src auf 'none'", () => {
  const html = renderSite(basis);
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("script-src 'none'");
  expect(html).not.toContain("<script");
});

test("mit Arbeitsprobe wird genau ein externes, absolutes Skript erlaubt", () => {
  const html = renderSite({ ...basis, page: { work_sample: { module: "expense-case" } } });
  expect(html).toContain("script-src 'self'");
  // Absoluter Pfad ist Pflicht: die Seite liegt hinter einem Netlify-Proxy, relative Pfade
  // zeigten dort ins Leere.
  expect(html).toContain('<script src="/assets/expense-case.js" defer></script>');
  expect(html).not.toMatch(/<script>[^<]/);   // kein Inline-Skript
});

test("unbekannte Stufe wird solide, nie stark", () => {
  const html = renderSite({
    ...basis,
    page: { fit: [{ requirement: "r", level: "garbage", evidence: "e" }] },
  });
  // Gegen die Auszeichnung prüfen, nicht gegen das Dokument: die Klassennamen stehen
  // ohnehin alle im CSS-Block.
  expect(html).toContain(`<span class="badge b-solide">solide</span>`);
  expect(html).not.toContain(`class="badge b-stark"`);
});

test("keine Empfängeradresse auf der Seite — sie ist zum Weiterleiten gedacht", () => {
  const html = renderSite({ ...basis, technikPath: "/b/xyz/technik" });
  expect(html).not.toContain("Generiert für");
  expect(html).toContain("weiterleitbar");
  // Die Kontaktadresse von Dennis gehört hin, eine fremde nicht.
  expect(html).toContain("d.benter@djwcapitalmanagement.de");
});

test("nur http(s) überlebt als Linkziel", () => {
  const html = renderSite({
    ...basis,
    profile: { ...basis.profile, cases: [{ name: "X", one: "y", url: "javascript:alert(1)" }] },
    page: {
      company_reference: { source_url: "data:text/html,<script>" },
      sources: [{ id: "A", url: "https://example.org/ok" }],
    },
  });
  expect(html).not.toContain("javascript:alert");
  expect(html).not.toContain("data:text/html");
  expect(html).toContain("https://example.org/ok");
});

test("fehlende Abschnitte erzeugen keine leeren Überschriften", () => {
  const html = renderSite(basis);
  for (const ueberschrift of ["Ehrlicher Abgleich", "Arbeitsprobe", "Die ersten 90 Tage", "Grundlage dieser Bewerbung"]) {
    expect(html).not.toContain(ueberschrift);
  }
  // Der agnostische Teil steht trotzdem.
  expect(html).toContain("Wer ich bin");
});

test("Technik-Seite ist eigenständig, ohne Skript und nennt die Firma", () => {
  const html = renderTechnik({ ...basis, backPath: "/b/xyz" });
  expect(html).toContain("script-src 'none'");
  expect(html).toContain("LM IT Services AG");
  expect(html).toContain("/b/xyz");
  // Sie benennt auch, was NICHT gebaut ist.
  expect(html).toContain("nicht gebaut");
});

test("beide Seiten sind von Suchmaschinen ausgenommen", () => {
  for (const html of [renderSite(basis), renderTechnik(basis)]) {
    expect(html).toContain(`<meta name="robots" content="noindex, nofollow">`);
  }
});
