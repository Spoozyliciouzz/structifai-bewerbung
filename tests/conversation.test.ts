import { test, expect } from "bun:test";
import { normalize, detectEndOfTalk, buildSystemPrompt, buildIntro, buildClosing, INTRO, CLOSING } from "../pipeline/lib/conversation.ts";
import type { AgentContext } from "../pipeline/voice/types.ts";

test("normalize: lowercase, Satzzeichen weg", () => {
  expect(normalize("Tschüss!! Alles, klar.")).toBe("tschüss alles klar");
});

test("detectEndOfTalk: klare Verabschiedung + bloße Absage erkannt", () => {
  expect(detectEndOfTalk("Nein.")).toBe(true);            // Absage auf „sonst noch Fragen?"
  expect(detectEndOfTalk("Nö")).toBe(true);
  expect(detectEndOfTalk("Nein danke")).toBe(true);
  expect(detectEndOfTalk("Danke für das Gespräch")).toBe(true);
  expect(detectEndOfTalk("Kein Interesse")).toBe(true);
  expect(detectEndOfTalk("Auf Wiederhören")).toBe(true);
  expect(detectEndOfTalk("Tschüss")).toBe(true);
});

test("detectEndOfTalk: laufendes Gespräch NICHT als Ende", () => {
  expect(detectEndOfTalk("Was genau hat er bei StrategyFrame gebaut?")).toBe(false);
  expect(detectEndOfTalk("Erzähl mir mehr über die Pipeline")).toBe(false);
  expect(detectEndOfTalk("Ja, klingt spannend")).toBe(false);
  expect(detectEndOfTalk("Nein, das hat er nicht studiert")).toBe(false); // „nein" eingebettet ≠ Ende
  expect(detectEndOfTalk("Ok, danke — und was baut er noch?")).toBe(false);
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

test("INTRO macht KI-Disclosure, CLOSING verweist auf Email-Nummer", () => {
  expect(INTRO).toContain("KI-Assistent von Dennis Benter");
  expect(CLOSING.toLowerCase()).toContain("email");
  expect(CLOSING.toLowerCase()).toContain("nummer");
});

test("buildClosing: mit Eis Einladung, ohne Eis kein Eis", () => {
  const mit = buildClosing("Pistazie");
  expect(mit).toContain("Pistazie");
  expect(mit.toLowerCase()).toContain("eisdiele");
  expect(buildClosing().toLowerCase()).not.toContain("eisdiele");
  expect(buildClosing().toLowerCase()).toContain("email");
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
