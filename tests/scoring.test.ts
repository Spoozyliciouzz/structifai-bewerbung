import { test, expect } from "bun:test";
import { coerceScore, overallScore, type DimensionScore } from "../pipeline/lib/scoring.ts";

test("coerceScore klemmt auf 0..10 und rundet", () => {
  expect(coerceScore(9.4)).toBe(9);
  expect(coerceScore(-2)).toBe(0);
  expect(coerceScore(99)).toBe(10);
  expect(coerceScore("7" as unknown as number)).toBe(7);
  expect(coerceScore(NaN)).toBe(0);
});

test("overallScore = gerundeter Durchschnitt (1 Dezimal)", () => {
  const dims: DimensionScore[] = [
    { label: "A", score: 9 }, { label: "B", score: 6 }, { label: "C", score: 9 },
  ];
  expect(overallScore(dims)).toBe(8);
  expect(overallScore([{ label: "X", score: 9 }, { label: "Y", score: 6 }])).toBe(7.5);
  expect(overallScore([])).toBe(0);
});
