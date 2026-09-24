/**
 * Freigegebener Seiteninhalt im SiteData. Der Inhalt ist redaktionell, kommt aber aus der
 * Datenbank und landet in einer öffentlich lesbaren Datei — er wird deshalb genauso
 * aufbereitet wie alles andere: Typen erzwingen, Längen begrenzen, Unbekanntes weglassen.
 */
import { test, expect } from "bun:test";
import { buildSiteData } from "../pipeline/lib/sitedata.ts";
import lm from "../applications/lm-2786630.json" with { type: "json" };

const basis = {
  company: "LM IT Services AG",
  title: "Head of AI & Processes",
  profile: { personal: { facts: ["Düsseldorf"] }, bullets: ["baut"], systems: [] },
  fitDimensions: [{ label: "KI", score: 8 }],
};

test("ohne freigegebene Seite bleibt SiteData beim agnostischen Teil", () => {
  const sd = buildSiteData(basis);
  expect(sd.page).toBeUndefined();
  expect(sd.company).toBe("LM IT Services AG");
});

test("der echte LM-Inhalt kommt vollständig durch", () => {
  const sd = buildSiteData({ ...basis, page: (lm as { page: unknown }).page });
  expect(sd.page?.hero?.headline).toContain("KI umsetzen");
  expect(sd.page?.company_reference?.source_url).toBe("https://www.lm-ag.de/prozessautomatisierung/");
  expect(sd.page?.work_sample?.module).toBe("expense-case");
  expect(sd.page?.ninety_days?.steps).toHaveLength(3);
  expect(sd.page?.conversation_starters).toHaveLength(4);
  expect(sd.page?.sources).toHaveLength(3);
});

test("Sandbox ist aus, solange sie nicht ausdrücklich an ist", () => {
  // Der Testbereich existiert noch nicht — ein fehlendes oder kaputtes Feld darf ihn nie
  // versehentlich freischalten.
  for (const ws of [{}, { sandbox_enabled: "true" }, { sandbox_enabled: 1 }, { sandbox_enabled: null }]) {
    const sd = buildSiteData({ ...basis, page: { work_sample: { module: "x", ...ws } } });
    expect(sd.page?.work_sample?.sandbox_enabled).toBe(false);
  }
  const url = "https://reisekosten.structifai.de/demo";
  const an = buildSiteData({ ...basis, page: { work_sample: { sandbox_enabled: true, sandbox_url: url } } });
  expect(an.page?.work_sample?.sandbox_enabled).toBe(true);
  expect(an.page?.work_sample?.sandbox_url).toBe(url);
});

test("Sandbox ohne gültiges https-Ziel bleibt aus", () => {
  for (const sandbox_url of [undefined, "", "http://reisekosten.structifai.de/demo", "javascript:alert(1)"]) {
    const sd = buildSiteData({ ...basis, page: { work_sample: { sandbox_enabled: true, sandbox_url } } });
    expect(sd.page?.work_sample?.sandbox_enabled).toBe(false);
  }
});

test("nur http(s) überlebt als Link", () => {
  const sd = buildSiteData({
    ...basis,
    page: {
      company_reference: { source_url: "javascript:alert(1)" },
      sources: [
        { id: "A", url: "data:text/html,<script>" },
        { id: "B", url: "https://example.org/x" },
      ],
    },
  });
  expect(sd.page?.company_reference?.source_url).toBeUndefined();
  expect(sd.page?.sources?.[0]?.url).toBeUndefined();
  expect(sd.page?.sources?.[1]?.url).toBe("https://example.org/x");
});

test("Längen und Listen werden begrenzt", () => {
  const sd = buildSiteData({
    ...basis,
    page: {
      hero: { headline: "x".repeat(1000) },
      ninety_days: { steps: Array.from({ length: 30 }, (_, i) => ({ title: "s" + i })) },
      conversation_starters: Array.from({ length: 30 }, (_, i) => "f" + i),
      sources: Array.from({ length: 50 }, (_, i) => ({ id: "s" + i })),
    },
  });
  expect(sd.page?.hero?.headline?.length).toBe(240);
  expect(sd.page?.ninety_days?.steps).toHaveLength(6);
  expect(sd.page?.conversation_starters).toHaveLength(6);
  expect(sd.page?.sources).toHaveLength(10);
});

test("Schrott statt Objekt wird still verworfen, nicht geworfen", () => {
  for (const p of [null, 42, "text", [], true]) {
    expect(buildSiteData({ ...basis, page: p }).page).toBeUndefined();
  }
  // Leere Teilobjekte verschwinden, statt leere Abschnitte zu erzeugen.
  expect(buildSiteData({ ...basis, page: { hero: {}, sources: [] } }).page).toBeUndefined();
});

test("Nicht-Strings fallen weg, statt als \"undefined\" zu rendern", () => {
  const sd = buildSiteData({
    ...basis,
    page: { hero: { eyebrow: 42, headline: "Echt", lead: null } },
  });
  expect(sd.page?.hero?.eyebrow).toBeUndefined();
  expect(sd.page?.hero?.lead).toBeUndefined();
  expect(sd.page?.hero?.headline).toBe("Echt");
});
