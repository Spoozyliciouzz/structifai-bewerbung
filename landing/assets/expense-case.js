/**
 * Arbeitsprobe „Spesen-Fall" — Optionsvorschau der gerenderten Bewerbungsseite.
 *
 * Wird als EXTERNE Datei unter einem ABSOLUTEN Pfad eingebunden (/assets/expense-case.js).
 * Absolut ist Pflicht: die Seite liegt hinter einem Netlify-Proxy, relative Pfade zeigten
 * dort ins Leere. Extern statt inline, damit die CSP ohne Hash-Pflege auskommt.
 *
 * Die Regeln sind dieselben wie in pipeline/lib/expense-options.ts — dort getestet,
 * tests/expense-options.test.ts hält beide Fassungen zusammen.
 *
 * Ohne dieses Skript bleibt die Auswahl bedienbar (native Radios); nur die Vorschau bleibt
 * bei ihrem erklärenden Standardtext.
 */
(function () {
  "use strict";

  var form = document.getElementById("expense-options");
  var preview = document.getElementById("expense-preview");
  if (!form || !preview) return;

  function ja(name) {
    var picked = form.querySelector('input[name="' + name + '"]:checked');
    return !!picked && picked.value === "yes";
  }

  function describe(sel) {
    var lines = [];
    if (sel.includePerDiem) lines.push("Verpflegungsmehraufwand: anhand Ihrer Reiseangaben berechnen");
    if (sel.includeCostCenter) lines.push("Kostenstelle: " + (sel.costCenter || "bitte frei eingeben"));
    if (sel.includeEmployeeNumber) lines.push("Mitarbeiternummer: " + (sel.employeeNumber || "bitte frei eingeben"));
    if (!lines.length) lines.push("Abrechnung der Belege ohne die drei Zusatzangaben.");
    return lines;
  }

  function render() {
    var cc = document.getElementById("costCenter");
    var en = document.getElementById("employeeNumber");
    var sel = {
      includePerDiem: ja("includePerDiem"),
      includeCostCenter: ja("includeCostCenter"),
      includeEmployeeNumber: ja("includeEmployeeNumber"),
      costCenter: cc ? cc.value : "",
      employeeNumber: en ? en.value : "",
    };

    // Abgewählte Felder werden ausgeblendet UND deaktiviert. Ein verstecktes, aber aktives
    // Feld würde weiter Werte mitführen — genau der Fehler, den die Arbeitsprobe zeigt.
    [["costCenter", sel.includeCostCenter], ["employeeNumber", sel.includeEmployeeNumber]]
      .forEach(function (pair) {
        var input = document.getElementById(pair[0]);
        var wrap = document.getElementById("wrap-" + pair[0]);
        if (input) input.disabled = !pair[1];
        if (wrap) wrap.hidden = !pair[1];
      });

    while (preview.firstChild) preview.removeChild(preview.firstChild);
    describe(sel).forEach(function (line) {
      var li = document.createElement("li");
      li.textContent = line;   // nie innerHTML
      preview.appendChild(li);
    });
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  render();
})();
