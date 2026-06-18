import { test, expect } from "bun:test";
import { normalize, detectEndOfTalk, buildSystemPrompt, buildIntro, INTRO, CLOSING } from "../pipeline/lib/conversation.ts";
import type { AgentContext } from "../pipeline/voice/types.ts";

test("normalize: lowercase, Satzzeichen weg", () => {
  expect(normalize("Tschüss!! Alles, klar.")).toBe("tschüss alles klar");
});

test("detectEndOfTalk: Closing-Marker erkannt", () => {
  expect(detectEndOfTalk("Ok, danke das wars.")).toBe(true);
  expect(detectEndOfTalk("Nein danke, kein Interesse")).toBe(true);
  expect(detectEndOfTalk("Auf Wiederhören")).toBe(true);
  expect(detectEndOfTalk("Tschüss")).toBe(true);
});

test("detectEndOfTalk: laufendes Gespräch NICHT als Ende", () => {
  expect(detectEndOfTalk("Was genau hat er bei StrategyFrame gebaut?")).toBe(false);
  expect(detectEndOfTalk("Erzähl mir mehr über die Pipeline")).toBe(false);
  expect(detectEndOfTalk("Ja, klingt spannend")).toBe(false);
});

test("buildSystemPrompt enthält Persona, Regeln, Kontext", () => {
  const ctx: AgentContext = {
    profile: { name: "Dennis Benter", role: "Operating Partner" },
    projects: [{ name: "Outreach-Audit-Pipeline" }],
    faq: [{ q: "HubSpot?", a: "kenne ich, nicht produktiv" }],
    pronunciation: { StrategyFrame: "Strättädschi-Frejm" },
  };
  const sp = buildSystemPrompt(ctx);
  expect(sp).toContain("KI-Sprachassistent von Dennis Benter");
  expect(sp).toContain("DEUTSCH");
  expect(sp).toContain("UNTRUSTED");
  expect(sp).toContain("Outreach-Audit-Pipeline");
  expect(sp).toContain("Strättädschi-Frejm");
});

test("buildSystemPrompt ohne pronunciation kein leerer Anhang", () => {
  const sp = buildSystemPrompt({ profile: {}, projects: [], faq: [] });
  expect(sp).not.toContain("AUSSPRACHE-HILFEN");
});

test("INTRO macht KI-Disclosure, CLOSING verweist auf Mail-Nummer", () => {
  expect(INTRO).toContain("KI-Assistent von Dennis Benter");
  expect(CLOSING).toContain("Mail");
  expect(CLOSING.toLowerCase()).toContain("nummer");
});

test("buildIntro mit Vorname spricht direkt an, ohne Vorname neutral", () => {
  expect(buildIntro("Thomas")).toBe("Hallo Thomas, " + INTRO.replace("Hallo, ", ""));
  expect(buildIntro("Thomas")).toContain("Hallo Thomas,");
  expect(buildIntro()).toBe(INTRO);
});

test("buildSystemPrompt mit Vorname instruiert direkte Ansprache", () => {
  const sp = buildSystemPrompt({ profile: {}, projects: [], faq: [] }, "Thomas");
  expect(sp).toContain("Der Anrufer heißt Thomas");
  expect(buildSystemPrompt({ profile: {}, projects: [], faq: [] })).not.toContain("Der Anrufer heißt");
});

test("buildSystemPrompt nutzt role und iceCream", () => {
  const sp = buildSystemPrompt({ profile: {}, projects: [], faq: [] }, "Thomas", "CFO", "Pistazie");
  expect(sp).toContain("CFO");
  expect(sp).toContain("Pistazie");
});

test("buildSystemPrompt streut personal ein, wenn vorhanden", () => {
  const sp = buildSystemPrompt({ profile: {}, projects: [], faq: [], personal: { hobby: "Golf" } });
  expect(sp).toContain("Golf");
});
