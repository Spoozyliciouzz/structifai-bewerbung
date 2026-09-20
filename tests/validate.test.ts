import { test, expect } from "bun:test";
import { isEmail, emailDomain, makeSlug, timingSafeEqual } from "../pipeline/lib/validate.ts";

test("isEmail", () => {
  expect(isEmail("founder@strategyframe.ai")).toBe(true);
  expect(isEmail("a@b.co")).toBe(true);
  expect(isEmail("nope")).toBe(false);
  expect(isEmail("a@b")).toBe(false);
  expect(isEmail("a b@c.de")).toBe(false);
});

test("emailDomain", () => {
  expect(emailDomain("Founder@StrategyFrame.AI")).toBe("strategyframe.ai");
  expect(emailDomain("kaputt")).toBe("");
});

test("makeSlug ist 12 hex, ohne Bindestriche", () => {
  const slug = makeSlug("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  expect(slug).toBe("3f2504e04f89");
  expect(slug).toMatch(/^[0-9a-f]{12}$/);
});

test("timingSafeEqual", () => {
  expect(timingSafeEqual("abc", "abc")).toBe(true);
  expect(timingSafeEqual("abc", "abd")).toBe(false);
  expect(timingSafeEqual("abc", "ab")).toBe(false);
  expect(timingSafeEqual("", "")).toBe(true);
});
