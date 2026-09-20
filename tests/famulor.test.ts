import { test, expect } from "bun:test";
import { parseCallCompleted } from "../pipeline/lib/famulor.ts";

const payload = {
  event: "call.completed",
  timestamp: "2026-09-20T16:02:07.000Z",
  data: {
    call_id: "c1b2c3d4-0000-4000-8000-000000000010",
    assistant_id: "bba9c07e-bfb5-4d88-907a-b744df1bd97a",
    direction: "web",
    status: "completed",
    duration_sec: 97,
    transcript: { items: [
      { type: "message", role: "assistant", content: ["Guten Tag, ich bin der KI-Assistent."] },
      { type: "message", role: "user", content: ["Was kann Dennis?"] },
      { type: "tool_call", name: "x" },
    ] },
    analysis: { summary: "Fragte nach Erfahrung." },
  },
};

test("call.completed wird auf eine bw_voice_calls-Zeile abgebildet", () => {
  const row = parseCallCompleted(payload);
  expect(row).toEqual({
    provider_call_id: "c1b2c3d4-0000-4000-8000-000000000010",
    assistant_id: "bba9c07e-bfb5-4d88-907a-b744df1bd97a",
    direction: "web",
    status: "completed",
    duration_seconds: 97,
    turns: [
      { role: "assistant", text: "Guten Tag, ich bin der KI-Assistent." },
      { role: "user", text: "Was kann Dennis?" },
    ],
    summary: "Fragte nach Erfahrung.",
    ended_at: "2026-09-20T16:02:07.000Z",
  });
});

test("anderes Event oder fehlende IDs ⇒ null", () => {
  expect(parseCallCompleted({ ...payload, event: "call.started" })).toBeNull();
  expect(parseCallCompleted({ event: "call.completed", data: { call_id: "x" } })).toBeNull();
  expect(parseCallCompleted("kein objekt")).toBeNull();
});

test("Transkript wird begrenzt: max 400 Turns, 4000 Zeichen je Turn", () => {
  const items = Array.from({ length: 500 }, () => ({ type: "message", role: "user", content: ["a".repeat(5000)] }));
  const row = parseCallCompleted({ ...payload, data: { ...payload.data, transcript: { items } } });
  expect(row!.turns.length).toBe(400);
  expect(row!.turns[0]!.text.length).toBe(4000);
});

test("fehlende optionale Felder ⇒ null/Defaults, kein Wurf", () => {
  const row = parseCallCompleted({ event: "call.completed", data: { call_id: "c", assistant_id: "a" } });
  expect(row).toEqual({
    provider_call_id: "c", assistant_id: "a", direction: "web", status: "completed",
    duration_seconds: null, turns: [], summary: null, ended_at: null,
  });
});

test("summary wird auf 2000 Zeichen gekappt", () => {
  const row = parseCallCompleted({
    ...payload,
    data: { ...payload.data, analysis: { summary: "a".repeat(3000) } },
  });
  expect(row!.summary!.length).toBe(2000);
});

test("timestamp: non-string, garbage ⇒ ended_at null; valide ISO bleibt exakt", () => {
  const nonString = parseCallCompleted({ ...payload, timestamp: 12345 });
  expect(nonString!.ended_at).toBeNull();

  const garbage = parseCallCompleted({ ...payload, timestamp: "gestern" });
  expect(garbage!.ended_at).toBeNull();
});

test("duration_sec wird auf 86400 gedeckelt", () => {
  const row = parseCallCompleted({ ...payload, data: { ...payload.data, duration_sec: 1e12 } });
  expect(row!.duration_seconds).toBe(86400);
});

test("assistant_id mit ungültigen Zeichen ⇒ gesamtes Ergebnis null", () => {
  const row = parseCallCompleted({ ...payload, data: { ...payload.data, assistant_id: "x y" } });
  expect(row).toBeNull();
});
