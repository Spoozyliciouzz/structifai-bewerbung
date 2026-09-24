/**
 * Optionsvorschau im Spesen-Fall. Alle acht Kombinationen der drei unabhängigen Fragen,
 * dazu die Regel, die am leichtesten kaputtgeht: bei „Nein" verschwindet die Angabe
 * vollständig, statt leer mitgeführt zu werden.
 */
import { test, expect } from "bun:test";
import { normalizeExpenseOptions, describeExpenseOptions, demoHref } from "../pipeline/lib/expense-options.ts";

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
    "Personalnummer: bitte frei eingeben",
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
    "Personalnummer: MA-0815",
  ]);
});

test("expense-case.js führt dieselben Vorschau-Texte wie dieses Modul", async () => {
  // Die statische Seite hat keinen Bundler und trägt die Regeln im Skript. Laufen die Texte
  // auseinander, zeigt die Seite etwas anderes an als hier geprüft wird. Geprüft wird die
  // Datei, die der Stellenteil (b.js) tatsächlich lädt — nicht mehr das alte build.html.
  const html = await Bun.file("landing/assets/expense-case.js").text();
  for (const satz of [
    "Verpflegungsmehraufwand: anhand Ihrer Reiseangaben berechnen",
    "bitte frei eingeben",
    "Abrechnung der Belege ohne die drei Zusatzangaben.",
    "Kostenstelle: ",
    "Personalnummer: ",
  ]) {
    expect(html).toContain(satz);
  }
  // Und die Regel selbst: abgewählte Felder werden deaktiviert, nicht nur versteckt.
  expect(html).toContain("if (input) input.disabled = !pair[1];");
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

test("renderFit zeigt den freigegebenen Abgleich vor den Modell-Punktzahlen", async () => {
  // Gefunden vor dem LM-Versand: page.fit (stark/solide/Lücke) kam in der Seiten-JSON an,
  // build.html zeigte aber nur die zur Laufzeit erzeugten x/10-Werte. renderFit ist der
  // gemeinsame Punkt aller Render-Wege — dort muss der Vorrang stehen, und zwar zuerst.
  const html = await Bun.file("landing/build.html").text();
  const fn = html.slice(html.indexOf("function renderFit(data, animate){"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  expect(body.indexOf("releasedFit(data)")).toBeGreaterThan(-1);
  expect(body.indexOf("releasedFit(data)")).toBeLessThan(body.indexOf("data.fit"));
  // Unbekannte Stufe fällt auf solide, nie auf stark.
  expect(html).toContain('FIT_LEVELS[f && f.level] || FIT_LEVELS["solide"]');
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

const DEMO = "https://reisekosten.structifai.de/demo";

test("Demo-Adresse trägt nur, was ausgewählt und ausgefüllt ist", () => {
  expect(demoHref(DEMO, { includePerDiem: false, includeCostCenter: false, includeEmployeeNumber: false,
    costCenter: "Altwert", employeeNumber: "Altwert" })).toBe(`${DEMO}?verpflegung=nein`);
  expect(demoHref(DEMO, { includePerDiem: true, includeCostCenter: true, includeEmployeeNumber: true,
    costCenter: "  ", employeeNumber: "" })).toBe(`${DEMO}?verpflegung=ja`);
  const voll = new URL(demoHref(DEMO, { includePerDiem: true, includeCostCenter: true, includeEmployeeNumber: true,
    costCenter: "Testabteilung 42 & Co", employeeNumber: "001-LM" }));
  expect(voll.searchParams.get("verpflegung")).toBe("ja");
  expect(voll.searchParams.get("kostenstelle")).toBe("Testabteilung 42 & Co");
  expect(voll.searchParams.get("personalnummer")).toBe("001-LM");
});

test("expense-case.js baut die Demo-Adresse nach denselben Regeln", async () => {
  // Die Landingpage hat keinen Bundler; das Skript führt die Regeln von demoHref selbst.
  const js = await Bun.file("landing/assets/expense-case.js").text();
  for (const teil of ['"verpflegung"', '"ja" : "nein"', '"kostenstelle"', '"personalnummer"', "URLSearchParams", "sandbox-link"]) {
    expect(js).toContain(teil);
  }
});
