/**
 * Stellenteil /b/<page_slug>: lädt die freigegebene Version über bw-page und rendert sie.
 * Daten sind untrusted: ausschließlich textContent, Links nur http(s), kein HTML-Parsing.
 */
(function () {
  "use strict";
  var FN = "https://hhxwojewbtegovzdxpfw.supabase.co/functions/v1/bw-page";
  var WIDGET_JS = "https://app.famulor.io/widget.js";
  var MAIL = "d.benter@djwcapitalmanagement.de";
  var SLUG_RE = /^[A-Za-z0-9_-]{22}$/;
  var KEY_RE = /^wgt_[A-Za-z0-9_-]{8,80}$/;
  var LEVELS = { "stark": ["stark", "b-stark"], "solide": ["solide", "b-solide"], "lücke": ["Lücke", "b-luecke"] };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : ""; }
  function link(href, cls, text) {
    var u = safeUrl(href);
    if (!u) return null;
    var a = el("a", cls, text);
    a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }
  function add(parent, child) { if (child) parent.appendChild(child); return child; }
  function br() { return document.createElement("br"); }
  function eyebrow(t) { return t ? el("p", "eyebrow", t) : null; }
  function section(cls, id) { var s = el("section", cls); if (id) s.id = id; return s; }
  function num(i) { return String(i + 1).padStart(2, "0"); }

  /** Überschrift mit \n-Zeilen; accentLast färbt die letzte Zeile wie auf structifai.de. */
  function lines(tag, text, accentLast) {
    var h = el(tag);
    var all = String(text || "").split("\n");
    all.forEach(function (line, i) {
      if (i) h.appendChild(br());
      h.appendChild(accentLast && all.length > 1 && i === all.length - 1 ? el("em", null, line) : document.createTextNode(line));
    });
    return h;
  }

  function hero(d, p) {
    var h = p.hero || {};
    var s = section("wrap hero");
    var left = el("div");
    add(left, eyebrow(h.eyebrow));
    left.appendChild(lines("h1", h.headline || ("Bewerbung als " + d.title), true));
    if (h.lead) left.appendChild(el("p", "lead", h.lead));
    var actions = el("div", "actions");
    if (p.work_sample) {
      var a1 = el("a", "primary", "Zur Arbeitsprobe ");
      a1.href = "#arbeitsprobe";
      a1.appendChild(el("span", null, "↓"));
      actions.appendChild(a1);
    }
    var a2 = el("a", "text-link", "Im Gespräch nachfragen ↓");
    a2.href = "#gespraech";
    actions.appendChild(a2);
    left.appendChild(actions);
    s.appendChild(left);

    var fig = el("figure", "portrait");
    var img = el("img");
    img.src = "/assets/portrait.webp"; img.alt = "Dennis Benter"; img.width = 800; img.height = 1000;
    var cap = el("figcaption");
    cap.appendChild(el("span", null, "Die Perspektive, die ich mitbringe"));
    ["Geschäft verstehen.", "Verantwortung übernehmen.", "Selbst ins Bauen kommen."].forEach(function (t, i) {
      if (i) cap.appendChild(br());
      cap.appendChild(document.createTextNode(t));
    });
    fig.appendChild(img); fig.appendChild(cap);
    s.appendChild(fig);
    return s;
  }

  function why(p) {
    var w = p.why;
    if (!w) return null;
    var s = section("context");
    var g = el("div", "wrap context-grid");
    add(g, eyebrow(w.eyebrow || "Warum diese Aufgabe"));
    var right = el("div");
    if (w.headline) right.appendChild(lines("h2", w.headline));
    (w.body || []).forEach(function (t) { right.appendChild(el("p", null, t)); });
    add(right, link(w.source_url, "source", (w.source_label || "Quelle") + " ↗"));
    g.appendChild(right);
    s.appendChild(g);
    return s;
  }

  function contributions(p) {
    var c = p.contributions;
    if (!c) return null;
    var s = section("wrap section", "erfahrung");
    add(s, eyebrow(c.eyebrow || "Was ich einbringe"));
    if (c.headline) s.appendChild(lines("h2", c.headline));
    if (c.items) {
      var grid = el("div", "contributions");
      c.items.forEach(function (it, i) {
        var a = el("article");
        a.appendChild(el("span", "number", num(i)));
        a.appendChild(el("h3", null, it.title));
        if (it.body) a.appendChild(el("p", null, it.body));
        grid.appendChild(a);
      });
      s.appendChild(grid);
    }
    if (c.cases) {
      var cases = el("div", "cases");
      c.cases.forEach(function (k) {
        var u = safeUrl(k.url);
        var card = el(u ? "a" : "div");
        if (u) { card.href = u; card.target = "_blank"; card.rel = "noopener noreferrer"; }
        var top = el("div", "case-top");
        top.appendChild(el("span", "pill", k.pill || ""));
        if (u) top.appendChild(el("span", null, "↗"));
        card.appendChild(top);
        card.appendChild(el("h3", null, k.title));
        if (k.body) card.appendChild(el("p", null, k.body));
        if (k.caption) card.appendChild(el("span", "caption", k.caption));
        cases.appendChild(card);
      });
      s.appendChild(cases);
    }
    return s;
  }

  function klartext(p) {
    if (!p.fit || !p.fit.length) return null;
    var h = p.fit_heading || {};
    var s = section("wrap section", "klartext");
    add(s, eyebrow(h.eyebrow || "Klartext"));
    s.appendChild(lines("h2", h.headline || "Was belegt ist –\nund was ich noch nicht kann."));
    var ul = el("ul", "matches");
    p.fit.forEach(function (f) {
      var lv = LEVELS[f.level] || LEVELS["solide"];   // unbekannt ⇒ solide, nie stark
      var li = el("li", "match");
      var head = el("div", "match-head");
      head.appendChild(el("span", "req", f.requirement));
      head.appendChild(el("span", "badge " + lv[1], lv[0]));
      li.appendChild(head);
      if (f.evidence) li.appendChild(el("p", "evidence", f.evidence));
      ul.appendChild(li);
    });
    s.appendChild(ul);
    return s;
  }

  function radio(name, value, label, checked) {
    var l = el("label");
    var i = el("input");
    i.type = "radio"; i.name = name; i.value = value; i.checked = !!checked;
    l.appendChild(i);
    l.appendChild(document.createTextNode(" " + label));
    return l;
  }

  function optionSet(legend, name, freeId, freeLabel, placeholder, note) {
    var fs = el("fieldset");
    fs.appendChild(el("legend", null, legend));
    var ch = el("div", "option-choices");
    ch.appendChild(radio(name, "yes", "Ja"));
    ch.appendChild(radio(name, "no", "Nein", true));
    fs.appendChild(ch);
    if (freeId) {
      var wrap = el("div");
      wrap.id = "wrap-" + freeId; wrap.hidden = true;
      var lab = el("label", null, freeLabel);
      lab.htmlFor = freeId;
      var inp = el("input");
      inp.id = freeId; inp.name = freeId; inp.type = "text"; inp.maxLength = 100; inp.placeholder = placeholder; inp.disabled = true;
      wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(el("p", null, note));
      fs.appendChild(wrap);
    }
    return fs;
  }

  function expenseOptions() {
    var box = el("div", "expense-settings");
    var intro = el("div");
    intro.appendChild(el("p", "eyebrow", "Ihr Test, Ihre Angaben"));
    intro.appendChild(el("h3", null, "Was möchten Sie berücksichtigen?"));
    intro.appendChild(el("p", "options-intro", "Probieren Sie die Auswahl hier schon aus."));
    box.appendChild(intro);
    var form = el("form");
    form.id = "expense-options";
    form.appendChild(optionSet("Verpflegungsmehraufwendungen berücksichtigen?", "includePerDiem"));
    form.appendChild(optionSet("Kostenstelle berücksichtigen?", "includeCostCenter", "costCenter", "Ihre Kostenstelle",
      "Zum Beispiel: Testabteilung 42", "Frei wählbar. Eine erfundene Angabe funktioniert genauso."));
    form.appendChild(optionSet("Personalnummer berücksichtigen?", "includeEmployeeNumber", "employeeNumber", "Ihre Personalnummer",
      "Zum Beispiel: 001-LM", "Beliebiger Text ist möglich; keine Stammdatenprüfung."));
    box.appendChild(form);
    var prev = el("div", "options-preview");
    prev.appendChild(el("span", null, "Vorschau Ihrer Auswahl"));
    var ul = el("ul");
    ul.id = "expense-preview";
    ul.setAttribute("role", "status");
    ul.setAttribute("aria-live", "polite");
    ul.appendChild(el("li", null, "Abrechnung der Belege ohne die drei Zusatzangaben."));
    prev.appendChild(ul);
    box.appendChild(prev);
    return box;
  }

  function workSample(p) {
    var w = p.work_sample;
    if (!w) return null;
    var ref = p.company_reference || {};
    var s = section("lab expense-case", "arbeitsprobe");
    var wrap = el("div", "wrap");
    var head = el("div", "lab-heading");
    var l = el("div");
    add(l, eyebrow(w.eyebrow));
    if (w.headline) l.appendChild(lines("h2", w.headline));
    if (w.lead) l.appendChild(el("p", null, w.lead));
    head.appendChild(l);
    if (ref.observation) {
      var f = el("div", "fiction");
      f.appendChild(el("span", null, ref.label || "Der Bezug"));
      f.appendChild(document.createTextNode(ref.observation));
      var src = link(ref.source_url, "source", (ref.source_label || "Quelle") + " ↗");
      if (src) { f.appendChild(br()); f.appendChild(src); }
      head.appendChild(f);
    }
    wrap.appendChild(head);

    if (w.journey) {
      if (w.journey_label) wrap.appendChild(el("p", "eyebrow", w.journey_label));
      var j = el("div", "expense-journey");
      j.setAttribute("aria-label", w.journey_label || "Ablauf");
      w.journey.forEach(function (st, i) {
        var a = el("article");
        a.appendChild(el("span", "journey-number", num(i)));
        a.appendChild(el("h3", null, st.title));
        if (st.body) a.appendChild(el("p", null, st.body));
        j.appendChild(a);
      });
      wrap.appendChild(j);
    }
    if (w.module === "expense-case") wrap.appendChild(expenseOptions());

    if (w.sandbox_enabled && w.sandbox_url) {
      var live = el("div", "sandbox-invite");
      var lt = el("div");
      lt.appendChild(el("p", "eyebrow", "Demo ohne Anmeldung"));
      lt.appendChild(el("h3", null, "Mit eigenen Belegen wird es konkret."));
      if (w.sandbox_text) lt.appendChild(el("p", null, w.sandbox_text));
      live.appendChild(lt);
      var le = el("div", "sandbox-entry");
      // Ziel ohne Parameter; expense-case.js ergänzt die Auswahl aus dem Formular oben.
      var a = el("a", "primary", "Reisekosten-Demo öffnen ↗");
      a.id = "sandbox-link";
      a.href = w.sandbox_url;
      a.setAttribute("data-base", w.sandbox_url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      le.appendChild(a);
      le.appendChild(el("p", "sandbox-limits", "Bis zu 3 Belege · PDF zum Herunterladen · nichts wird gespeichert"));
      live.appendChild(le);
      wrap.appendChild(live);
    } else if (w.sandbox_disabled_reason) {
      var inv = el("div", "sandbox-invite");
      var t = el("div");
      t.appendChild(el("p", "eyebrow", "Persönlicher Testbereich"));
      t.appendChild(el("h3", null, "Mit eigenen Belegen wird es konkret."));
      t.appendChild(el("p", null, w.sandbox_disabled_reason));
      inv.appendChild(t);
      var entry = el("div", "sandbox-entry");
      var b = el("button", "primary", "Reisekosten selbst ausprobieren");
      b.type = "button"; b.disabled = true;
      entry.appendChild(b);
      inv.appendChild(entry);
      wrap.appendChild(inv);
    }
    if (w.note) {
      var det = el("details");
      det.appendChild(el("summary", null, "Was diese Arbeitsprobe zeigen soll"));
      w.note.forEach(function (t2) { det.appendChild(el("p", null, t2)); });
      wrap.appendChild(det);
    }
    if (w.takeaway && w.takeaway.text) {
      var tk = el("div", "takeaway");
      tk.appendChild(el("span", null, w.takeaway.label || ""));
      tk.appendChild(el("p", null, w.takeaway.text));
      wrap.appendChild(tk);
    }
    s.appendChild(wrap);
    return s;
  }

  function ninety(p) {
    var n = p.ninety_days;
    if (!n || !n.steps) return null;
    var s = section("wrap section");
    add(s, eyebrow(n.eyebrow));
    if (n.headline) s.appendChild(lines("h2", n.headline));
    var t = el("div", "timeline");
    n.steps.forEach(function (st) {
      var a = el("article");
      a.appendChild(el("span", "number", st.range || ""));
      a.appendChild(el("h3", null, st.title));
      if (st.body) a.appendChild(el("p", null, st.body));
      t.appendChild(a);
    });
    s.appendChild(t);
    return s;
  }

  function loadWidget() {
    return new Promise(function (resolve, reject) {
      function api() {
        var a = window.OurAiCallingWidget || window.FamulorWidget;
        return a && typeof a.boot === "function" ? a : null;
      }
      if (api()) return resolve(api());
      var sc = document.createElement("script");
      sc.src = WIDGET_JS; sc.async = true;
      sc.onload = function () { api() ? resolve(api()) : reject(new Error("api")); };
      sc.onerror = function () { reject(new Error("load")); };
      document.head.appendChild(sc);
    });
  }

  function voice(key) {
    var box = el("div");
    var host = el("div", "voice-host");
    var btn = el("button", "voice-start", "Mit meinem KI-Assistenten sprechen");
    btn.type = "button";
    var note = el("p", "voice-note", "Im Browser, kein Telefon nötig. Der Assistent sagt zu Beginn, dass er eine KI ist.");
    note.setAttribute("role", "status");
    var FAIL = "Der Assistent ist gerade nicht erreichbar – schreiben Sie mir gern direkt.";
    btn.addEventListener("click", function () {
      if (host.dataset.mounting === "1") return;
      host.dataset.mounting = "1";
      btn.disabled = true;
      note.textContent = "Assistent wird geladen …";
      // mountInline übernimmt Maße nur, wenn die Inline-Styles des Hosts vorab gesetzt sind.
      host.style.maxWidth = "360px";
      host.style.borderRadius = "20px";
      var mounted = false;
      var obs = new MutationObserver(function () {
        if (!host.querySelector("iframe")) return;
        mounted = true;
        note.textContent = "Mikrofon freigeben, dann einfach losreden. Chat geht auch.";
        obs.disconnect();
      });
      obs.observe(host, { childList: true, subtree: true });
      function fail() { if (mounted) return; note.textContent = FAIL; btn.disabled = false; host.dataset.mounting = ""; }
      loadWidget().then(function (api) { api.boot(key, host); }).catch(fail);
      setTimeout(fail, 8000);
    });
    host.appendChild(btn);
    box.appendChild(host);
    box.appendChild(note);
    return box;
  }

  function conversation(d, p) {
    var c = p.conversation || {};
    var s = section("wrap conversation", "gespraech");
    var l = el("div");
    add(l, eyebrow(c.eyebrow || "Die Bewerbung im Gespräch"));
    l.appendChild(lines("h2", c.headline || "Fragen Sie ruhig\ngenauer nach.", true));
    if (c.body) l.appendChild(el("p", null, c.body));
    var key = d.voice && KEY_RE.test(d.voice.widget_key) ? d.voice.widget_key : "";
    if (key) l.appendChild(voice(key));
    var mail = el("a", "text-link", "Dennis direkt kontaktieren ↗");
    mail.href = "mailto:" + MAIL;
    l.appendChild(mail);
    s.appendChild(l);
    if (p.conversation_starters) {
      var q = el("div", "questions");
      q.appendChild(el("span", null, "Mögliche Gesprächseinstiege"));
      p.conversation_starters.forEach(function (t) { q.appendChild(el("p", null, "„" + t + "“")); });
      s.appendChild(q);
    }
    return s;
  }

  function sources(p) {
    if (!p.sources || !p.sources.length) return null;
    var s = section("wrap sources");
    var det = el("details");
    det.appendChild(el("summary", null, "Grundlage dieser Bewerbung"));
    var ul = el("ul");
    p.sources.forEach(function (x) {
      var a = link(x.url, null, x.finding || x.url);
      if (!a) return;
      var li = el("li");
      li.appendChild(a);
      if (x.retrieved) li.appendChild(document.createTextNode(" (Abruf " + x.retrieved + ")"));
      ul.appendChild(li);
    });
    det.appendChild(ul);
    s.appendChild(det);
    return s;
  }

  function render(d) {
    var p = d.page || {};
    document.title = "Dennis Benter · " + d.title + " · " + d.company;
    $("edition").textContent = "Eine Bewerbung für " + d.company + " · " + d.title;
    var root = $("page");
    [hero(d, p), why(p), contributions(p), klartext(p), workSample(p), ninety(p), conversation(d, p), sources(p)]
      .forEach(function (n) { if (n) root.appendChild(n); });
    $("state-loading").hidden = true;
    root.hidden = false;
    // Optionslogik der Arbeitsprobe (eigene, getestete Datei) erst laden, wenn das Formular steht.
    if ($("expense-options")) {
      var sc = document.createElement("script");
      sc.src = "/assets/expense-case.js";
      document.body.appendChild(sc);
    }
  }

  function missing() {
    $("state-loading").hidden = true;
    $("state-missing").hidden = false;
    document.title = "Nicht gefunden · Dennis Benter";
  }

  var parts = location.pathname.split("/").filter(Boolean);
  var slug = parts[0] === "b" ? parts[1] || "" : "";
  if (!SLUG_RE.test(slug)) { missing(); return; }
  fetch(FN + "?s=" + encodeURIComponent(slug))
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (d) { if (!d || typeof d.company !== "string") throw new Error("shape"); render(d); })
    .catch(missing);
})();
