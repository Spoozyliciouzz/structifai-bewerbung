/**
 * Ankunftsseite: Code aus dem Anschreiben → bw-open → /b/<slug>.
 * Die Normalisierung ist dieselbe wie pipeline/lib/access-code.ts (tests/landing.test.ts hält
 * beide zusammen); der Server normalisiert erneut und ist allein maßgeblich.
 */
(function () {
  "use strict";
  var FN = "https://hhxwojewbtegovzdxpfw.supabase.co/functions/v1/bw-open";
  var SLUG_RE = /^[A-Za-z0-9_-]{22}$/;
  var UNKNOWN = "Diesen Code kenne ich nicht. Bitte prüfen Sie die Schreibweise – oder schreiben Sie mir direkt.";
  var form = document.getElementById("code-form");
  var input = document.getElementById("code-input");
  var btn = document.getElementById("code-submit");
  var msg = document.getElementById("code-msg");
  if (!form || !input || !btn || !msg) return;
  form.hidden = false;

  function normalize(s) {
    var n = String(s).toUpperCase().replace(/[\s-]+/g, "");
    return /^[A-Z0-9]{3,16}$/.test(n) ? n : "";
  }
  function say(t) { msg.textContent = t; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = normalize(input.value);
    if (!code) { say(UNKNOWN); input.focus(); return; }
    btn.disabled = true;
    say("Einen Moment …");
    fetch(FN, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code }) })
      .then(function (r) {
        if (r.status === 429) throw new Error("rate");
        if (r.status === 404) throw new Error("unknown");
        if (!r.ok) throw new Error("server");
        return r.json();
      })
      .then(function (d) {
        if (!d || !SLUG_RE.test(d.slug)) throw new Error("unknown");
        location.assign("/b/" + d.slug);
      })
      .catch(function (err) {
        btn.disabled = false;
        if (err.message === "rate") say("Zu viele Versuche. Bitte in einer Stunde erneut.");
        else if (err.message === "unknown") say(UNKNOWN);
        else say("Das hat gerade nicht geklappt. Bitte gleich noch einmal – oder schreiben Sie mir direkt.");
      });
  });
})();
