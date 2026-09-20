import { test, expect } from "bun:test";
import { buildFamulorPrompt, type PromptSources } from "../pipeline/lib/famulor-prompt.ts";
import ctx from "../pipeline/voice/context-fallback.json" with { type: "json" };
import lm from "../applications/lm-2786630.json" with { type: "json" };

const sources: PromptSources = {
  context: ctx as PromptSources["context"],
  voice: (lm as { voice: PromptSources["voice"] }).voice,
};

test("Prompt nennt KI-Disclosure, Ehrlichkeit, Rolle und Closing", () => {
  const p = buildFamulorPrompt(sources);
  expect(p.firstMessage).toBe(sources.voice.intro);
  expect(p.systemPrompt).toMatch(/Du bist eine KI/);
  expect(p.systemPrompt).toMatch(/Erfinde NICHTS/);
  expect(p.systemPrompt).toContain("LM IT Services AG");
  expect(p.systemPrompt).toContain("Head of AI & Processes");
  expect(p.systemPrompt).toContain("Es geht um Dennis' Bewerbung als Head of AI & Processes bei LM IT Services AG.");
  expect(p.systemPrompt).toContain(sources.voice.closing);
  for (const r of sources.voice.rules_extra) expect(p.systemPrompt).toContain(r);
});

test("Prompt enthält Kontext als JSON, aber keine Telefon-Mechanik mehr", () => {
  const p = buildFamulorPrompt(sources);
  expect(p.systemPrompt).toContain('"faq"');
  expect(p.systemPrompt).toContain('"the_role"');
  expect(p.systemPrompt).not.toMatch(/Rückruf|Telefonat|Nummer in der Mail|Anrufer/);
});

test("Prompt ist deterministisch", () => {
  const p1 = buildFamulorPrompt(sources);
  const p2 = buildFamulorPrompt(sources);
  expect(p1).toEqual(p2);
  expect(p1.systemPrompt.indexOf("ZUSÄTZLICHE REGELN")).toBeLessThan(p1.systemPrompt.indexOf("KONTEXT ("));
  expect(p1.systemPrompt.indexOf("KONTEXT (")).toBeLessThan(p1.systemPrompt.indexOf("AUSSPRACHE-HILFEN"));
});

test("the_role im Kontext enthält nur sprechbare Felder", () => {
  const p = buildFamulorPrompt(sources);
  const marker = "KONTEXT (verifizierte Fakten, einzige Quelle):\n";
  const start = p.systemPrompt.indexOf(marker) + marker.length;
  const rest = p.systemPrompt.slice(start);
  const nextNewline = rest.indexOf("\n");
  const jsonLine = nextNewline === -1 ? rest : rest.slice(0, nextNewline);
  const payload = JSON.parse(jsonLine) as { the_role: Record<string, unknown> };
  expect(Object.keys(payload.the_role).sort()).toEqual([
    "company",
    "interpretation",
    "portfolio_observation",
    "title",
  ]);
  expect(p.systemPrompt).not.toContain('"job_url"');
  expect(p.systemPrompt).not.toContain('"work_sample"');
  expect(p.systemPrompt).not.toContain('"email_policy"');
});

test("stellenbezogene FAQ der Bewerbung werden an die globalen angehängt", () => {
  const p = buildFamulorPrompt(sources);
  const appFaq = sources.voice.faq?.[0]?.q ?? "";
  expect(appFaq.length).toBeGreaterThan(0);
  expect(p.systemPrompt).toContain(appFaq);
});
