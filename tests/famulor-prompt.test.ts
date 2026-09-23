import { test, expect } from "bun:test";
import { buildFamulorPrompt, buildContextPayload, type PromptSources } from "../pipeline/lib/famulor-prompt.ts";
import ctx from "../pipeline/voice/context-fallback.json" with { type: "json" };
import lm from "../applications/lm-2786630.json" with { type: "json" };

const sources: PromptSources = {
  context: ctx as PromptSources["context"],
  voice: (lm as { voice: PromptSources["voice"] }).voice,
};

test("Prompt nennt KI-Disclosure, Ehrlichkeit, Rolle und kontext_laden", () => {
  const p = buildFamulorPrompt(sources);
  expect(p.firstMessage).toBe(sources.voice.intro);
  expect(p.systemPrompt).toMatch(/Du bist eine KI/);
  expect(p.systemPrompt).toMatch(/Erfinde NICHTS/);
  expect(p.systemPrompt).toContain("LM IT Services AG");
  expect(p.systemPrompt).toContain("Head of AI & Processes");
  expect(p.systemPrompt).toContain("Es geht um Dennis' Bewerbung als Head of AI & Processes bei LM IT Services AG.");
  expect(p.systemPrompt).toContain("kontext_laden");
});

test("Prompt enthält keine Fakten mehr — nur Regeln, Kontext kommt live vom Tool", () => {
  const p = buildFamulorPrompt(sources);
  expect(p.systemPrompt).not.toContain('"faq"');
  expect(p.systemPrompt).not.toContain("KONTEXT (");
  expect(p.systemPrompt).not.toContain("AUSSPRACHE-HILFEN");
  expect(p.systemPrompt).not.toContain(sources.voice.closing);
  for (const r of sources.voice.rules_extra) expect(p.systemPrompt).not.toContain(r);
  expect(p.systemPrompt).not.toMatch(/Rückruf|Telefonat|Nummer in der Mail|Anrufer/);
});

test("kontext_laden steht vor der Untrusted-Input-Klausel", () => {
  const p = buildFamulorPrompt(sources);
  expect(p.systemPrompt.indexOf("kontext_laden")).toBeGreaterThan(-1);
  expect(p.systemPrompt.indexOf("kontext_laden")).toBeLessThan(p.systemPrompt.indexOf("UNTRUSTED"));
});

test("Prompt ist deterministisch", () => {
  const p1 = buildFamulorPrompt(sources);
  const p2 = buildFamulorPrompt(sources);
  expect(p1).toEqual(p2);
});

test("buildContextPayload liefert exakt die vereinbarten Top-Level-Keys", () => {
  const payload = buildContextPayload(sources.context, sources.voice);
  expect(Object.keys(payload).sort()).toEqual([
    "closing",
    "faq",
    "personal",
    "pronunciation",
    "profile",
    "projects",
    "rules_extra",
    "stories",
    "the_role",
  ].sort());
});

test("buildContextPayload the_role enthält nur sprechbare Felder", () => {
  const payload = buildContextPayload(sources.context, sources.voice);
  expect(Object.keys(payload.the_role).sort()).toEqual([
    "company",
    "interpretation",
    "portfolio_observation",
    "title",
  ]);
  const dump = JSON.stringify(payload);
  expect(dump).not.toContain('"job_url"');
  expect(dump).not.toContain('"work_sample"');
  expect(dump).not.toContain('"email_policy"');
});

test("buildContextPayload faq = globale + stellenbezogene FAQ", () => {
  const payload = buildContextPayload(sources.context, sources.voice);
  expect(payload.faq.length).toBe(sources.context.faq.length + (sources.voice.faq?.length ?? 0));
  const appFaq = sources.voice.faq?.[0]?.q ?? "";
  expect(appFaq.length).toBeGreaterThan(0);
  expect(payload.faq.some((f) => f.q === appFaq)).toBe(true);
});

test("Projektfragen-Regel und Web-Chat-Override sind gesetzt", () => {
  const p = buildFamulorPrompt(sources);
  expect(p.systemPrompt).toContain("antworte aus\n'projects'");
  expect(p.webChatInstructions).toMatch(/kein Telefonat/);
  expect(p.webChatInstructions).toMatch(/Frag nicht nach jeder Antwort/);
});
