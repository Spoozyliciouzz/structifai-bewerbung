import { test, expect } from "bun:test";
import { authorizeOutbound } from "../pipeline/lib/voice-gate.ts";

const CFG = { sharedSecret: "s3cr3t-token", allowlist: ["strategyframe.ai"] };
const GOOD = { authHeader: "Bearer s3cr3t-token", phone: "+4915112345678", email: "founder@strategyframe.ai" };

test("alles korrekt → ok", () => {
  expect(authorizeOutbound(GOOD, CFG)).toEqual({ ok: true });
});

test("falsches/fehlendes Secret → reason secret", () => {
  expect(authorizeOutbound({ ...GOOD, authHeader: "Bearer falsch" }, CFG)).toEqual({ ok: false, reason: "secret" });
  expect(authorizeOutbound({ ...GOOD, authHeader: null }, CFG)).toEqual({ ok: false, reason: "secret" });
  expect(authorizeOutbound({ ...GOOD, authHeader: "s3cr3t-token" }, CFG)).toEqual({ ok: false, reason: "secret" }); // ohne "Bearer "
});

test("fail-closed bei leerem Secret in Config", () => {
  expect(authorizeOutbound(GOOD, { ...CFG, sharedSecret: "" })).toEqual({ ok: false, reason: "secret" });
});

test("ungültige Nummer → reason phone", () => {
  expect(authorizeOutbound({ ...GOOD, phone: "015112345678" }, CFG)).toEqual({ ok: false, reason: "phone" });
});

test("Domain nicht auf Allowlist → reason domain", () => {
  expect(authorizeOutbound({ ...GOOD, email: "x@evil.com" }, CFG)).toEqual({ ok: false, reason: "domain" });
});

test("Allowlist case-insensitiv über emailDomain", () => {
  expect(authorizeOutbound({ ...GOOD, email: "Founder@StrategyFrame.AI" }, CFG)).toEqual({ ok: true });
});
