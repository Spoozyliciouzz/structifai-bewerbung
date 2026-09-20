/**
 * Trennung zwischen Bewerbungen. Prüft die Stelle, an der ein Fehler am teuersten wäre:
 * dass ein Gespräch zu Firma A nichts von Firma B weiß — und dass ohne freigegebene
 * Bewerbung gar kein Stellenkontext entsteht, statt dass ein Rückfall einspringt.
 */
import { test, expect } from "bun:test";
import { buildSystemPrompt, buildIntro, buildClosing, discloses } from "../relay-deno/lib/conversation.ts";
import type { AgentContext } from "../relay-deno/lib/types.ts";
import fallbackRelay from "../relay-deno/lib/context-fallback.json" with { type: "json" };
import fallbackPipeline from "../pipeline/voice/context-fallback.json" with { type: "json" };

const agnostisch: AgentContext = {
  profile: { name: "Dennis Benter" },
  projects: [{ name: "GartenAIden" }],
  faq: [{ q: "Was kann Dennis?", a: "Bauen und steuern." }],
};

const lm: AgentContext = {
  ...agnostisch,
  application_id: "lm-2786630",
  the_role: { company: "LM IT Services AG", title: "Head of AI & Processes" },
  faq: [...agnostisch.faq, { q: "Warum LM?", a: "Wegen des Spesenprozesses." }],
  intro: "Guten Tag, ich bin der KI-Assistent von Dennis Benter und erläutere seine Bewerbung bei LM.",
  closing: "Vielen Dank für das Gespräch.",
  rules_extra: ["Der Testbereich ist noch nicht eingerichtet."],
};

const andere: AgentContext = {
  ...agnostisch,
  application_id: "demo-gegenprobe",
  the_role: { company: "Gegenprobe GmbH", title: "Irgendwas anderes" },
};

// ── Kein Rückfall auf fremden Stellenkontext ────────────────────────────────

test("gebündelte Fallback-Dateien enthalten keinen Stellenkontext mehr", () => {
  for (const f of [fallbackRelay, fallbackPipeline] as Array<Record<string, unknown>>) {
    expect(f.the_role).toBeUndefined();
    // Der alte Inhalt darf auch nicht anderswo in der Datei überlebt haben.
    expect(JSON.stringify(f)).not.toMatch(/StrategyFrame/i);
    expect(JSON.stringify(f)).not.toMatch(/Chief of Staff/i);
  }
});

test("ohne freigegebene Bewerbung entsteht kein Stellenkontext", () => {
  const prompt = buildSystemPrompt(agnostisch);
  expect(prompt).toContain("KEINE Bewerbung freigegeben");
  expect(prompt).not.toContain("the_role");
  // Der agnostische Teil bleibt nutzbar.
  expect(prompt).toContain("Dennis Benter");
});

test("geladene Bewerbung landet im Prompt, fremde nicht", () => {
  const prompt = buildSystemPrompt(lm);
  expect(prompt).toContain("LM IT Services AG");
  expect(prompt).toContain("AUSSCHLIESSLICH auf 'the_role'");
  expect(prompt).not.toMatch(/Gegenprobe/i);
  expect(prompt).not.toMatch(/StrategyFrame/i);
});

test("zwei Bewerbungen teilen keinen Inhalt", () => {
  const a = buildSystemPrompt(lm);
  const b = buildSystemPrompt(andere);
  expect(a).toContain("LM IT Services AG");
  expect(a).not.toMatch(/Gegenprobe GmbH/);
  expect(b).toContain("Gegenprobe GmbH");
  expect(b).not.toMatch(/LM IT Services AG/);
});

test("Auskunft über andere Bewerbungen ist in jedem Fall untersagt", () => {
  for (const ctx of [agnostisch, lm, andere]) {
    expect(buildSystemPrompt(ctx)).toContain("ANDEREN Bewerbungen");
  }
});

test("stellenbezogene Zusatzregeln stehen im Prompt", () => {
  expect(buildSystemPrompt(lm)).toContain("Testbereich ist noch nicht eingerichtet");
  expect(buildSystemPrompt(agnostisch)).not.toContain("Testbereich ist noch nicht eingerichtet");
});

test("objections landen im Kontext — vorher wurden sie stillschweigend verworfen", () => {
  const mitEinwand: AgentContext = {
    ...agnostisch,
    objections: [{ objection: "Kann nicht programmieren", answer: "Baut trotzdem lauffähige Produkte." }],
  };
  expect(buildSystemPrompt(mitEinwand)).toContain("Baut trotzdem lauffähige Produkte");
});

// ── Intro und Closing je Bewerbung ──────────────────────────────────────────

test("eigener Intro-Text wird benutzt, wenn er die KI-Kennzeichnung enthält", () => {
  const intro = buildIntro("Helena", lm.intro);
  expect(intro).toBe(lm.intro as string);
  expect(discloses(intro)).toBe(true);
});

test("Intro ohne KI-Kennzeichnung bekommt sie vorangestellt", () => {
  const intro = buildIntro("Helena", "Schön, dass Sie anrufen. Fragen Sie mich alles.");
  expect(discloses(intro)).toBe(true);
  expect(intro).toContain("Helena");
  expect(intro).toContain("Fragen Sie mich alles.");
});

test("ohne eigenen Text gilt das allgemeine Intro, mit Vorname", () => {
  const intro = buildIntro("Helena");
  expect(intro).toContain("Helena");
  expect(discloses(intro)).toBe(true);
});

test("Lieblingseis bleibt agnostisch und überlebt einen eigenen Abschlusstext", () => {
  const mitEis = buildClosing("Pistazie", lm.closing);
  expect(mitEis).toContain("Vielen Dank für das Gespräch.");
  expect(mitEis).toContain("Pistazie");

  // auch ohne Bewerbung
  expect(buildClosing("Pistazie")).toContain("Pistazie");
  // und ohne Eis keine leere Einladung
  expect(buildClosing(undefined, lm.closing)).not.toMatch(/Kugel/);
});
