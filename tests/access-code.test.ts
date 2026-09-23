import { expect, test } from "bun:test";
import {
  CODE_ALPHABET, PAGE_SLUG_RE, formatCode, generateAccessCode, generatePageSlug, normalizeCode,
} from "../pipeline/lib/access-code.ts";

test("Alphabet ohne verwechselbare Zeichen", () => {
  for (const c of "01OIL") expect(CODE_ALPHABET).not.toContain(c);
});

test("normalizeCode: Groß, ohne Leerzeichen/Bindestriche, sonst null", () => {
  expect(normalizeCode(" lm-7q4k ")).toBe("LM7Q4K");
  expect(normalizeCode("LM 7Q4K")).toBe("LM7Q4K");
  expect(normalizeCode("")).toBeNull();
  expect(normalizeCode("x".repeat(40))).toBeNull();
  expect(normalizeCode("LM-7Q4K<script>")).toBeNull();
  expect(normalizeCode(42 as unknown)).toBeNull();
});

test("generateAccessCode: Präfix + 4 Zeichen aus dem Alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const c = generateAccessCode("LM");
    expect(c).toMatch(/^LM[A-Z2-9]{4}$/);
    for (const ch of c.slice(2)) expect(CODE_ALPHABET).toContain(ch);
  }
  expect(() => generateAccessCode("lm")).toThrow();
});

test("formatCode setzt den Bindestrich nach dem Präfix", () => {
  expect(formatCode("LM7Q4K", "LM")).toBe("LM-7Q4K");
});

test("generatePageSlug: 22 Zeichen base64url, zufällig", () => {
  const a = generatePageSlug(), b = generatePageSlug();
  expect(a).toMatch(PAGE_SLUG_RE);
  expect(a).not.toBe(b);
});
