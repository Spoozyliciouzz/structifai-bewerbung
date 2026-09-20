/**
 * Anruf-Autorisierung. Der WebSocket des Relays nimmt jede Verbindung an — die Bewerbung
 * darf deshalb nur aus einer signierten, ablaufenden Nutzlast stammen, nie aus einem frei
 * mitgeschickten Parameter.
 */
import { test, expect } from "bun:test";
import { signCallAuth, verifyCallAuth } from "../relay-deno/lib/callauth.ts";

const SECRET = "test-secret-einmalig";
const NOW = 1_800_000_000;
const gueltig = { callId: "call-1", applicationId: "lm-2786630", exp: NOW + 300 };

test("frisch signiertes Token wird angenommen", async () => {
  const token = await signCallAuth(gueltig, SECRET);
  const claim = await verifyCallAuth(token, SECRET, NOW);
  expect(claim?.callId).toBe("call-1");
  expect(claim?.applicationId).toBe("lm-2786630");
});

test("fremdes Geheimnis wird abgewiesen", async () => {
  const token = await signCallAuth(gueltig, SECRET);
  expect(await verifyCallAuth(token, "anderes-secret", NOW)).toBeNull();
});

test("abgelaufenes Token wird abgewiesen", async () => {
  const token = await signCallAuth({ ...gueltig, exp: NOW - 1 }, SECRET);
  expect(await verifyCallAuth(token, SECRET, NOW)).toBeNull();
});

test("umgeschriebene Bewerbung bricht die Signatur", async () => {
  const token = await signCallAuth(gueltig, SECRET);
  const [body = "", sig = ""] = token.split(".");

  // Angreifer tauscht die Bewerbung aus, behält aber die alte Signatur.
  const geaendert = { ...gueltig, applicationId: "fremde-firma" };
  const gefaelschterBody = btoa(JSON.stringify(geaendert))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  expect(gefaelschterBody).not.toBe(body);
  expect(await verifyCallAuth(`${gefaelschterBody}.${sig}`, SECRET, NOW)).toBeNull();
});

test("ohne Geheimnis wird nichts anerkannt — fail closed", async () => {
  const token = await signCallAuth(gueltig, SECRET);
  expect(await verifyCallAuth(token, "", NOW)).toBeNull();
});

test("Schrott wird abgewiesen, ohne zu werfen", async () => {
  for (const t of ["", ".", "a.", ".b", "kein-punkt", "a.b", "!!!.???"]) {
    expect(await verifyCallAuth(t, SECRET, NOW)).toBeNull();
  }
});

test("Token ohne Bewerbung ist gültig, führt aber zu keinem Stellenkontext", async () => {
  const token = await signCallAuth({ callId: "call-2", exp: NOW + 60 }, SECRET);
  const claim = await verifyCallAuth(token, SECRET, NOW);
  expect(claim?.callId).toBe("call-2");
  expect(claim?.applicationId).toBeUndefined();
});

test("beide Kopien von callauth.ts sind inhaltsgleich", async () => {
  // relay-deno muss self-contained bleiben, deshalb existiert die Datei zweimal.
  // Läuft sie auseinander, prüft der Relay anders als die Edge Function signiert.
  const schneide = (s: string) => s.slice(s.indexOf("export interface CallAuthPayload"));
  const a = schneide(await Bun.file("relay-deno/lib/callauth.ts").text());
  const b = schneide(await Bun.file("pipeline/lib/callauth.ts").text());
  expect(a.length).toBeGreaterThan(500);
  expect(a).toBe(b);
});
