import { test, expect } from "bun:test";
import { buildSiteData } from "../pipeline/lib/sitedata.ts";

const PROFILE = {
  identity: { name: "Dennis Benter" },
  personal: { facts: ["Golfer", "frischgebackener Papa", "Allgäuer"] },
  bullets: ["15 Jahre operativ", "Generalist"],
  systems: [
    { name: "GartenAIden", one: "Lead-Qualifizierer …", kind: "visual" as const, icon: "🌿", url: "https://www.gartenaiden.de", image: "gartenaiden.jpg" },
    { name: "Reisekosten-Tool", one: "automatisiert", kind: "icon" as const, icon: "🧾" },
  ],
};

test("buildSiteData mappt LLM-Fit + Profil zu PII-freiem SiteData", () => {
  const sd = buildSiteData({
    company: "StrategyFrame.AI", title: "Chief of Staff", profile: PROFILE,
    fitDimensions: [{ label: "Agentische Automatisierung", score: 9 }, { label: "Substanz", score: 6 }],
  });
  expect(sd.company).toBe("StrategyFrame.AI");
  expect(sd.fit.overall).toBe(7.5);
  expect(sd.fit.dimensions[0]!.score).toBe(9);
  expect(sd.personal.facts).toContain("Golfer");
  expect(sd.cases[0]!.name).toBe("GartenAIden");
  expect(sd.cases[0]!.kind).toBe("visual");
  expect(sd.cases[0]!.url).toBe("https://www.gartenaiden.de");
  expect(sd.cases[0]!.image).toBe("gartenaiden.jpg");
  expect(sd.cases[1]!.kind).toBe("icon");
  expect(sd.cases[1]!.url).toBeUndefined();
  expect(JSON.stringify(sd)).not.toMatch(/email|phone|firstName/i);
});
