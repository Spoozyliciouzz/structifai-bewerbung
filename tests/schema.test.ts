import { test, expect } from "bun:test";
import { JobExtract } from "../scraper/src/schema.ts";

const valid = {
  company: "StrategyFrame.AI GmbH",
  title: "Chief of Staff",
  requirements: [
    { id: "agentic-automation", label: "1 Jahr agentische Automatisierung", category: "ai" },
    { id: "hold-together", label: "Laden zusammenhalten", category: "ops" },
  ],
  application_ask: "Warum diese Rolle? Ein Beispiel, das du automatisiert hast.",
};

test("Zod-Gate akzeptiert gültiges JobExtract", () => {
  expect(() => JobExtract.parse(valid)).not.toThrow();
});

test("Zod-Gate wirft bei unbekannter category (kein Silent-Fail)", () => {
  const bad = { ...valid, requirements: [{ id: "x", label: "y", category: "sales" }] };
  expect(() => JobExtract.parse(bad)).toThrow();
});

test("Zod-Gate wirft bei >8 requirements", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, label: `req ${i}`, category: "ops" as const }));
  expect(() => JobExtract.parse({ ...valid, requirements: many })).toThrow();
});

test("Zod-Gate wirft bei leerem company", () => {
  expect(() => JobExtract.parse({ ...valid, company: "" })).toThrow();
});
