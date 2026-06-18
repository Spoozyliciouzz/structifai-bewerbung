import { test, expect } from "bun:test";
import { escapeXml, connectConversationRelay } from "../pipeline/lib/twiml.ts";

test("escapeXml escaped alle gefährlichen Zeichen", () => {
  expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
});

test("connectConversationRelay baut Connect+ConversationRelay mit DE-Defaults", () => {
  const xml = connectConversationRelay({
    wsUrl: "wss://edge.example/relay",
    ttsProvider: "ElevenLabs",
    voiceId: "voice_abc",
  });
  expect(xml).toContain(`<ConversationRelay url="wss://edge.example/relay"`);
  expect(xml).toContain(`ttsProvider="ElevenLabs"`);
  expect(xml).toContain(`voice="voice_abc"`);
  expect(xml).toContain(`ttsLanguage="de-DE"`);
  expect(xml).toContain(`transcriptionLanguage="de-DE"`);
  expect(xml).toContain(`elevenlabsTextNormalization="on"`);
  expect(xml).toContain("<Connect>");
  expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
});

test("connectConversationRelay reicht Parameter als <Parameter> durch (escaped)", () => {
  const xml = connectConversationRelay({
    wsUrl: "wss://e/relay",
    ttsProvider: "ElevenLabs",
    voiceId: "v",
    parameters: { callId: "abc-123", note: `a&b` },
  });
  expect(xml).toContain(`<Parameter name="callId" value="abc-123"/>`);
  expect(xml).toContain(`<Parameter name="note" value="a&amp;b"/>`);
});

test("connectConversationRelay ohne voiceId → kein voice-Attribut (CR-Default zur Sprache)", () => {
  const xml = connectConversationRelay({ wsUrl: "wss://e/relay", ttsProvider: "ElevenLabs", voiceId: "" });
  expect(xml).not.toContain("voice=");
  expect(xml).toContain(`language="de-DE"`);
  expect(xml).toContain(`ttsProvider="ElevenLabs"`);
});

test("connectConversationRelay normalization off", () => {
  const xml = connectConversationRelay({
    wsUrl: "wss://e/relay", ttsProvider: "ElevenLabs", voiceId: "v",
    elevenlabsTextNormalization: false,
  });
  expect(xml).toContain(`elevenlabsTextNormalization="off"`);
});
