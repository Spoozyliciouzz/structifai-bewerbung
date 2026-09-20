/**
 * Regeln der Optionsvorschau im Spesen-Fall (Arbeitsprobe der LM-Bewerbung).
 *
 * Drei unabhängige Ja/Nein-Fragen. Bei „Nein" verschwindet die Angabe vollständig aus
 * Abrechnung, Summen und PDF — sie wird nicht auf null gesetzt und weiter mitgeführt.
 * Kostenstelle und Mitarbeiternummer sind freier Text ohne Stammdatenprüfung: es sind
 * Beispielangaben des Besuchers, keine echten Organisationskennungen. Deshalb bleiben sie
 * Text, damit führende Nullen und erfundene Namen erhalten bleiben.
 *
 * Herkunft: docs/scratch/lm-bewerbung/expense-options.mjs (Codex, 2026-09-15), hier als
 * getestete Quelle der Wahrheit. landing/build.html führt dieselben Regeln nochmals inline,
 * weil die statische Seite keinen Bundler hat — tests/expense-options.test.ts hält beide
 * Fassungen zusammen.
 */

export interface ExpenseSelection {
  includePerDiem: boolean;
  includeCostCenter: boolean;
  includeEmployeeNumber: boolean;
  costCenter?: string;
  employeeNumber?: string;
}

export interface NormalizedExpenseOptions {
  includePerDiem: boolean;
  /** null = ausdrücklich abgewählt, also gar nicht Teil der Abrechnung. */
  costCenter: string | null;
  employeeNumber: string | null;
}

export function normalizeExpenseOptions(sel: ExpenseSelection): NormalizedExpenseOptions {
  const flags = [sel.includePerDiem, sel.includeCostCenter, sel.includeEmployeeNumber];
  if (!flags.every((v) => typeof v === "boolean")) throw new TypeError("Auswahl fehlt");
  const costCenter = sel.costCenter ?? "";
  const employeeNumber = sel.employeeNumber ?? "";
  if (typeof costCenter !== "string" || typeof employeeNumber !== "string") {
    throw new TypeError("Freitext erwartet");
  }
  return {
    includePerDiem: sel.includePerDiem,
    costCenter: sel.includeCostCenter ? costCenter : null,
    employeeNumber: sel.includeEmployeeNumber ? employeeNumber : null,
  };
}

/** Zeilen der Vorschau. Leere Freitexte sagen, dass noch etwas fehlt, statt leer zu bleiben. */
export function describeExpenseOptions(sel: ExpenseSelection): string[] {
  const o = normalizeExpenseOptions(sel);
  const lines: string[] = [];
  if (o.includePerDiem) lines.push("Verpflegungsmehraufwand: anhand Ihrer Reiseangaben berechnen");
  if (o.costCenter !== null) lines.push(`Kostenstelle: ${o.costCenter || "bitte frei eingeben"}`);
  if (o.employeeNumber !== null) {
    lines.push(`Mitarbeiternummer: ${o.employeeNumber || "bitte frei eingeben"}`);
  }
  if (!lines.length) lines.push("Abrechnung der Belege ohne die drei Zusatzangaben.");
  return lines;
}
