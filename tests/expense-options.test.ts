/**
 * Optionsvorschau im Spesen-Fall. Alle acht Kombinationen der drei unabhängigen Fragen,
 * dazu die Regel, die am leichtesten kaputtgeht: bei „Nein" verschwindet die Angabe
 * vollständig, statt leer mitgeführt zu werden.
 */
import { test, expect } from "bun:test";
import { normalizeExpenseOptions, describeExpenseOptions } from "../pipeline/lib/expense-options.ts";

const combos = [false, true].flatMap((a) =>
  [false, true].flatMap((b) => [false, true].map((c) => ({
    includePerDiem: a, includeCostCenter: b, includeEmployeeNumber: c,
  }))),
);

test("alle acht Kombinationen verhalten sich unabhängig", () => {
  expect(combos).toHaveLength(8);
  for (const sel of combos) {
    const o = normalizeExpenseOptions({ ...sel, costCenter: "KST 1", employeeNumber: "007" });
    expect(o.includePerDiem).toBe(sel.includePerDiem);
    expect(o.costCenter).toBe(sel.includeCostCenter ? "KST 1" : null);
    expect(o.employeeNumber).toBe(sel.includeEmployeeNumber ? "007" : null);
  }
});

test("abgewählte Angaben verschwinden, auch wenn noch ein Altwert im Feld steht", () => {
  const o = normalizeExpenseOptions({
    includePerDiem: false, includeCostCenter: false, includeEmployeeNumber: false,
    costCenter: "KST 4711", employeeNumber: "MA-0815",
  });
  expect(o.costCenter).toBeNull();
  expect(o.employeeNumber).toBeNull();
});

test("führende Nullen und erfundene Namen bleiben erhalten", () => {
  const o = normalizeExpenseOptions({
    includePerDiem: true, includeCostCenter: true, includeEmployeeNumber: true,
    costCenter: "0042 · Vertrieb Nord", employeeNumber: "00700",
  });
  expect(o.costCenter).toBe("0042 · Vertrieb Nord");
  expect(o.employeeNumber).toBe("00700");
});

test("fehlende Auswahl wirft, statt still etwas anzunehmen", () => {
  expect(() => normalizeExpenseOptions(
    { includePerDiem: true, includeCostCenter: true } as never,
  )).toThrow(TypeError);
});

test("Vorschau ohne jede Zusatzangabe sagt das ausdrücklich", () => {
  const lines = describeExpenseOptions({
    includePerDiem: false, includeCostCenter: false, includeEmployeeNumber: false,
  });
  expect(lines).toEqual(["Abrechnung der Belege ohne die drei Zusatzangaben."]);
});

test("leerer Freitext fordert zur Eingabe auf, statt leer zu bleiben", () => {
  const lines = describeExpenseOptions({
    includePerDiem: false, includeCostCenter: true, includeEmployeeNumber: true,
    costCenter: "", employeeNumber: "",
  });
  expect(lines).toEqual([
    "Kostenstelle: bitte frei eingeben",
    "Mitarbeiternummer: bitte frei eingeben",
  ]);
});

test("volle Auswahl zeigt alle drei Zeilen in fester Reihenfolge", () => {
  const lines = describeExpenseOptions({
    includePerDiem: true, includeCostCenter: true, includeEmployeeNumber: true,
    costCenter: "KST 4711", employeeNumber: "MA-0815",
  });
  expect(lines).toEqual([
    "Verpflegungsmehraufwand: anhand Ihrer Reiseangaben berechnen",
    "Kostenstelle: KST 4711",
    "Mitarbeiternummer: MA-0815",
  ]);
});

test("build.html führt dieselben Vorschau-Texte wie dieses Modul", async () => {
  // Die statische Seite hat keinen Bundler und trägt die Regeln inline. Laufen die Texte
  // auseinander, zeigt die Seite etwas anderes an als hier geprüft wird.
  const html = await Bun.file("landing/build.html").text();
  for (const satz of [
    "Verpflegungsmehraufwand: anhand Ihrer Reiseangaben berechnen",
    "bitte frei eingeben",
    "Abrechnung der Belege ohne die drei Zusatzangaben.",
    "Kostenstelle: ",
    "Mitarbeiternummer: ",
  ]) {
    expect(html).toContain(satz);
  }
  // Und die Regel selbst: abgewählte Felder werden deaktiviert, nicht nur versteckt.
  expect(html).toContain("$(name).disabled = !an;");
});

test("die n=1-Abschnitte hängen an renderHeader, nicht nur an renderShell", async () => {
  // Gefunden im Codex-Review: build.html hat ZWEI Render-Wege. Der Statikmodus ruft
  // renderShell, die Live-Timeline ruft die Funktionen einzeln und renderShell nie. Hing
  // renderApplicationPage nur an renderShell, erschienen die Abschnitte im echten
  // Build-Ablauf überhaupt nicht — und ein Test im Statikmodus hätte es nie gemerkt.
  const html = await Bun.file("landing/build.html").text();
  const header = html.slice(html.indexOf("function renderHeader(data){"));
  const body = header.slice(0, header.indexOf("\n}\n"));
  expect(body).toContain("renderApplicationPage(data)");
});

test("Elemente mit eigenem display werden von [hidden] wirklich verborgen", async () => {
  // Im Browser gefunden: `.ap-free{display:flex}` schlug die Browser-Regel für [hidden],
  // das abgewählte Freitextfeld blieb sichtbar stehen. Ohne diese Regel kommt das zurück,
  // ohne dass ein Test es merkt — die Logik selbst war ja korrekt.
  const html = await Bun.file("landing/build.html").text();
  const regel = html.match(/\.ap-free\[hidden\][^}]*\{display:none\}/);
  expect(regel).not.toBeNull();
  for (const sel of ["\\.ap-options\\[hidden\\]", "\\.ap-ref\\[hidden\\]", "section\\.ap\\[hidden\\]"]) {
    expect(html).toMatch(new RegExp(sel));
  }
});
