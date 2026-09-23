/**
 * render/site.ts — erzeugt die Bewerbungsseite und die Technik-Zusammenfassung als HTML.
 *
 * Seit 2026-09-16 ist das der LIVE-Pfad: gerendert wird einmal bei der Freigabe, nicht bei
 * jedem Besuch. Der Empfänger bekommt eine fertige Seite — kein Build, der vor ihm scheitern
 * kann, keine Konsole, kein Warten.
 *
 * SICHERHEIT (§16.1): JEDER interpolierte Wert ist UNTRUSTED und läuft durch `esc()`.
 * Kein rohes String-Einsetzen. Die Seite trägt ihre eigene CSP.
 *
 * JavaScript: Die Arbeitsprobe braucht Interaktion, deshalb dort `script-src 'self'` statt
 * `'none'` und eine EXTERNE Datei unter einem ABSOLUTEN Pfad. Absolut ist Pflicht, weil die
 * Seite hinter einem Netlify-Proxy liegt — relative Pfade zeigten dort ins Leere
 * (https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/, 2026-09-16).
 *
 * Pure TS — von Deno (Edge), Bun (Tests) und dem Seed-Skript importierbar, keine Deps.
 */
import type { ApplicationPage } from "../lib/sitedata.ts";

export type CoverageLevel = "stark" | "solide" | "lücke";

export interface Match {
  /** Anforderungs-Label aus der Anzeige. */
  requirement: string;
  level: CoverageLevel;
  /** Ehrlicher Abgleich — 1–2 Sätze. */
  evidence: string;
}

export interface SiteProfile {
  /** Kurzfakten für den Kopf (Ort, Stationen). */
  facts: string[];
  /** Was Dennis beiträgt. */
  bullets: string[];
  /** Belastbare Projekte mit eigenem Beitrag. */
  cases: Array<{ name: string; one: string; url?: string }>;
}

export interface SiteInput {
  company: string;
  title: string;
  /** Freigegebener n=1-Inhalt. Fehlt er, rendert nur der agnostische Teil. */
  page?: ApplicationPage;
  profile: SiteProfile;
  contact: string;
  /** Pfad zur Technik-Zusammenfassung, z. B. `/b/<slug>/technik`. */
  technikPath?: string;
  /** Zurück zur Bewerbungsseite — nur auf der Technik-Seite gesetzt. */
  backPath?: string;
}

/** HTML-Escape für Text-Kontext. Die harte Grenze gegen Stored-XSS. */
export function esc(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Nur http(s) überlebt als Linkziel — keine javascript:- oder data:-URLs. */
function safeHref(u: unknown): string | null {
  const s = typeof u === "string" ? u.trim() : "";
  return /^https?:\/\//i.test(s) ? s : null;
}

const BADGE: Record<CoverageLevel, { label: string; cls: string }> = {
  "stark": { label: "stark", cls: "b-stark" },
  "solide": { label: "solide", cls: "b-solide" },
  "lücke": { label: "Lücke", cls: "b-luecke" },
};

/** Unbekanntes wird "solide", nie "stark": ein Tippfehler darf die Aussage nicht stärken. */
function asLevel(v: unknown): CoverageLevel {
  return v === "stark" || v === "lücke" ? v : "solide";
}

function renderMatch(m: { requirement?: string; level?: string; evidence?: string }): string {
  const badge = BADGE[asLevel(m.level)];
  return `<li class="match">
        <div class="match-head">
          <span class="req">${esc(m.requirement)}</span>
          <span class="badge ${badge.cls}">${esc(badge.label)}</span>
        </div>
        ${m.evidence ? `<p class="evidence">${esc(m.evidence)}</p>` : ""}
      </li>`;
}

// ── Gemeinsames Gerüst ──────────────────────────────────────────────────────

const CSS = `
  :root{--navy:#0e121b;--gold:#cead60;--ink:#e8eaf0;--muted:#9aa3b2;--line:#222a38;--card:#141a26}
  *{box-sizing:border-box}
  body{margin:0;background:var(--navy);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:760px;margin:0 auto;padding:48px 20px 80px}
  .mono{font-family:"IBM Plex Mono",monospace;color:var(--gold);font-size:.76rem;letter-spacing:.06em;text-transform:uppercase;margin:0 0 10px}
  h1{font-family:"Playfair Display",serif;font-size:clamp(1.8rem,5vw,2.9rem);line-height:1.12;margin:.2em 0 .3em}
  h2{font-family:"Playfair Display",serif;font-size:1.45rem;margin:2.6em 0 .6em}
  /* Steht ein Mono-Label darüber, gehört der Abstand dorthin und nicht über die Überschrift. */
  .lead-in{margin-top:2.8em}
  h2.after-mono{margin-top:.1em}
  h3{font-size:1rem;margin:0 0 .3em}
  .lead{color:var(--muted);font-size:1.05rem;max-width:62ch}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:14px 0}
  p{margin:.6em 0}
  a{color:var(--gold)}
  ul.plain{list-style:none;padding:0;margin:0}
  .facts{color:var(--muted);font-size:.95rem}
  .bullets li{margin:.45em 0}
  ul.matches{list-style:none;padding:0;margin:0}
  .match{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 17px;margin:10px 0}
  .match-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .req{font-weight:600}
  .evidence{color:var(--muted);margin:.5em 0 0;font-size:.95rem}
  .badge{font-family:"IBM Plex Mono",monospace;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;padding:3px 10px;border-radius:999px;white-space:nowrap}
  .b-stark{background:rgba(206,173,96,.16);color:var(--gold);border:1px solid rgba(206,173,96,.4)}
  .b-solide{background:rgba(154,163,178,.14);color:var(--ink);border:1px solid var(--line)}
  .b-luecke{background:rgba(154,163,178,.06);color:var(--muted);border:1px dashed var(--line)}
  .ref{border-left:2px solid var(--line);padding-left:14px;margin:18px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:18px}
  /* Projektkarten breiter: drei Spalten wurden auf dieser Maximalbreite zu schmal.
     Zwei Klassen, damit die Regel die allgemeine .grid-Regel sicher schlägt. */
  .grid.cases{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
  .grid.cases .card{margin:0}
  .step{border-top:1px solid var(--line);padding-top:12px}
  .step .range{font-family:"IBM Plex Mono",monospace;color:var(--gold);font-size:.7rem;display:block;margin-bottom:6px}
  .step p{color:var(--muted);font-size:.93rem;margin:0}
  .starters li{border-left:2px solid var(--line);padding-left:14px;margin:12px 0}
  .sources li{color:var(--muted);font-size:.9rem;margin:12px 0;display:flex;flex-direction:column;gap:2px}
  .sid{font-family:"IBM Plex Mono",monospace;color:var(--gold);font-size:.7rem}
  .handoff{border:1px dashed var(--line);border-radius:12px;padding:16px 18px;margin:30px 0;color:var(--muted);font-size:.95rem}
  fieldset{border:0;margin:0 0 18px;padding:0}
  legend{padding:0;margin-bottom:8px;font-weight:600}
  .opt label{display:inline-flex;align-items:center;gap:6px;margin-right:18px;cursor:pointer}
  .free{margin-top:12px;display:flex;flex-direction:column;gap:6px}
  .free[hidden]{display:none}
  .free input{background:var(--navy);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:9px 11px;font:inherit;max-width:32ch}
  .free input:disabled{opacity:.5}
  .hint{color:var(--muted);font-size:.86rem;margin:8px 0 0}
  .preview{border-top:1px solid var(--line);padding-top:14px;margin-top:6px}
  .preview ul{list-style:none;margin:0;padding:0;color:var(--muted)}
  .preview li{padding:3px 0}
  footer{margin-top:52px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
  input:focus-visible,a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/** `script-src` nur dort lockern, wo die Seite wirklich ein Skript lädt. */
function head(title: string, withScript: boolean): string {
  const scriptSrc = withScript ? "'self'" : "'none'";
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src ${scriptSrc}; base-uri 'none'; form-action 'none'">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>`;
}

// ── Arbeitsprobe: Spesen-Fall ───────────────────────────────────────────────

/**
 * Die drei unabhängigen Ja/Nein-Fragen. Ohne JavaScript bleibt die Auswahl bedienbar
 * (native Radios) und ein Hinweis erklärt, was die Vorschau sonst zeigt — die Seite ist
 * damit auch ohne Skript vollständig lesbar.
 */
function renderExpenseCase(): string {
  return `
    <form class="card opt" id="expense-options">
      <p class="mono">Ihr Test, Ihre Angaben</p>
      <fieldset>
        <legend>Verpflegungsmehraufwendungen berücksichtigen?</legend>
        <label><input type="radio" name="includePerDiem" value="yes"> Ja</label>
        <label><input type="radio" name="includePerDiem" value="no" checked> Nein</label>
        <p class="hint">Im Testsystem geben Sie dafür Abfahrt, Rückkehr, auswärtige Übernachtung und gegebenenfalls gestellte Mahlzeiten an. Daraus wird die Pauschale berechnet.</p>
      </fieldset>
      <fieldset>
        <legend>Kostenstelle berücksichtigen?</legend>
        <label><input type="radio" name="includeCostCenter" value="yes"> Ja</label>
        <label><input type="radio" name="includeCostCenter" value="no" checked> Nein</label>
        <div class="free" id="wrap-costCenter" hidden>
          <label for="costCenter">Ihre Kostenstelle</label>
          <input type="text" id="costCenter" name="costCenter" maxlength="60" disabled>
          <p class="hint">Frei wählbar. Eine erfundene Angabe funktioniert genauso.</p>
        </div>
      </fieldset>
      <fieldset>
        <legend>Mitarbeiternummer berücksichtigen?</legend>
        <label><input type="radio" name="includeEmployeeNumber" value="yes"> Ja</label>
        <label><input type="radio" name="includeEmployeeNumber" value="no" checked> Nein</label>
        <div class="free" id="wrap-employeeNumber" hidden>
          <label for="employeeNumber">Ihre Mitarbeiternummer</label>
          <input type="text" id="employeeNumber" name="employeeNumber" maxlength="40" disabled>
          <p class="hint">Beliebiger Text ist möglich; keine Stammdatenprüfung.</p>
        </div>
      </fieldset>
      <div class="preview" aria-live="polite">
        <p class="mono">Vorschau Ihrer Auswahl</p>
        <ul id="expense-preview"><li>Ohne JavaScript bleibt die Auswahl bedienbar; die Vorschau zeigt sonst, welche der drei Angaben in Abrechnung und PDF landen und welche vollständig entfallen.</li></ul>
      </div>
    </form>
    <script src="/assets/expense-case.js" defer></script>`;
}

// ── Bewerbungsseite ─────────────────────────────────────────────────────────

export function renderSite(input: SiteInput): string {
  const p = input.page ?? {};
  const hero = p.hero ?? {};
  const ref = p.company_reference;
  const ws = p.work_sample;
  const nd = p.ninety_days;

  const facts = input.profile.facts.filter(Boolean);
  const bullets = input.profile.bullets.filter(Boolean);
  const cases = input.profile.cases.filter((c) => c && c.name);
  const refHref = ref ? safeHref(ref.source_url) : null;

  const sections: string[] = [];

  sections.push(`    ${hero.eyebrow ? `<p class="mono">${esc(hero.eyebrow)}</p>` : `<p class="mono">Bewerbung</p>`}
    <h1>${esc(hero.headline || input.title)}<br><span style="color:var(--gold)">${esc(input.company)}</span></h1>
    ${hero.lead ? `<p class="lead">${esc(hero.lead)}</p>` : ""}`);

  if (facts.length || bullets.length) {
    sections.push(`    <h2>Wer ich bin</h2>
    ${facts.length ? `<p class="facts">${facts.map(esc).join(" · ")}</p>` : ""}
    ${bullets.length ? `<ul class="plain bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}`);
  }

  if (p.fit?.length) {
    sections.push(`    <h2>Ehrlicher Abgleich</h2>
    <p class="lead">Was zur Anzeige passt — und was nicht. Lücken stehen hier, statt im Gespräch aufzufallen.</p>
    <ul class="matches">
      ${p.fit.map(renderMatch).join("\n      ")}
    </ul>`);
  }

  if (cases.length) {
    sections.push(`    <h2>Was ich gebaut habe</h2>
    <div class="grid cases">
      ${cases.map((c) => {
        const href = safeHref(c.url);
        return `<div class="card">
        <h3>${esc(c.name)}</h3>
        <p class="evidence">${esc(c.one)}</p>
        ${href ? `<p><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">ansehen ↗</a></p>` : ""}
      </div>`;
      }).join("\n      ")}
    </div>`);
  }

  if (ws) {
    // Mono-Label VOR der Überschrift — wie im Aufhänger. Umgekehrt liest es sich wie eine
    // nachgeschobene Bildunterschrift.
    sections.push(`    ${ws.eyebrow ? `<p class="mono lead-in">${esc(ws.eyebrow)}</p>` : ""}
    <h2 class="after-mono">${esc(ws.headline || "Arbeitsprobe")}</h2>
    ${ref ? `<div class="ref">
      ${ref.label ? `<p class="mono">${esc(ref.label)}</p>` : ""}
      ${ref.observation ? `<p>${esc(ref.observation)}</p>` : ""}
      ${refHref ? `<p><a href="${esc(refHref)}" target="_blank" rel="noopener noreferrer">${esc(ref.source_label || refHref)} ↗</a></p>` : ""}
    </div>` : ""}
    ${ws.module === "expense-case" ? renderExpenseCase() : ""}
    ${ws.sandbox_enabled && safeHref(ws.sandbox_url) ? `<p><a href="${esc(safeHref(ws.sandbox_url)!)}" target="_blank" rel="noopener noreferrer">Reisekosten-Demo öffnen ↗</a></p>${ws.sandbox_text ? `<p class="hint">${esc(ws.sandbox_text)}</p>` : ""}` : ""}
    ${!ws.sandbox_enabled && ws.sandbox_disabled_reason ? `<p class="hint">${esc(ws.sandbox_disabled_reason)}</p>` : ""}`);
  }

  if (nd?.steps?.length) {
    sections.push(`    ${nd.eyebrow ? `<p class="mono lead-in">${esc(nd.eyebrow)}</p>` : ""}
    <h2 class="after-mono">${esc(nd.headline || "Die ersten 90 Tage")}</h2>
    <div class="grid">
      ${nd.steps.map((s) => `<div class="step">
        ${s.range ? `<span class="range">${esc(s.range)}</span>` : ""}
        ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
        ${s.body ? `<p>${esc(s.body)}</p>` : ""}
      </div>`).join("\n      ")}
    </div>`);
  }

  if (p.conversation_starters?.length) {
    sections.push(`    <h2>Fragen Sie ruhig genauer nach</h2>
    <p class="lead">Mein KI-Assistent erläutert diese Bewerbung im Sprach-Widget auf dieser Seite. Er nennt sich sofort als KI und sagt offen, wenn ihm etwas nicht vorliegt.</p>
    <ul class="plain starters">
      ${p.conversation_starters.map((s) => `<li>${esc(s)}</li>`).join("\n      ")}
    </ul>`);
  }

  if (input.technikPath) {
    sections.push(`    <div class="handoff">
      <p class="mono">Für die Technik bei Ihnen im Haus</p>
      <p>Eine Zusammenfassung, wie diese Bewerbung gebaut ist — Aufbau, Datenschutz und was bewusst nicht gebaut wurde. Zum Weiterleiten gedacht: <a href="${esc(input.technikPath)}">${esc(input.technikPath)}</a></p>
    </div>`);
  }

  if (p.sources?.length) {
    sections.push(`    <h2>Grundlage dieser Bewerbung</h2>
    <ul class="plain sources">
      ${p.sources.map((s) => {
        const href = safeHref(s.url);
        return `<li>
        ${s.id ? `<span class="sid">${esc(s.id)}</span>` : ""}
        ${s.finding ? `<span>${esc(s.finding)}</span>` : ""}
        ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(href)}${s.retrieved ? ` · abgerufen ${esc(s.retrieved)}` : ""}</a>` : ""}
      </li>`;
      }).join("\n      ")}
    </ul>`);
  }

  return `<!doctype html>
<html lang="de">
<head>
${head(`Bewerbung — ${input.title} @ ${input.company}`, ws?.module === "expense-case")}
</head>
<body>
  <main class="wrap">
${sections.join("\n")}
    <footer>
      <p>Dennis Benter · <a href="mailto:${esc(input.contact)}">${esc(input.contact)}</a></p>
      <p>Diese Seite ist über einen nicht öffentlichen Link erreichbar und nicht für Suchmaschinen freigegeben. Der Link ist weiterleitbar und weist niemanden aus.</p>
    </footer>
  </main>
</body>
</html>`;
}

// ── Technik-Zusammenfassung ─────────────────────────────────────────────────

/**
 * Eigene Adresse, damit die Recruiterin GENAU diesen Teil weitergeben kann und nicht die
 * ganze Bewerbung samt Motivationsteil. Der Inhalt ist fast vollständig stellen-agnostisch;
 * nur der Einstiegssatz nimmt Bezug auf die Firma.
 */
export function renderTechnik(input: SiteInput): string {
  const back = input.backPath;
  return `<!doctype html>
<html lang="de">
<head>
${head(`Technik — Bewerbung bei ${input.company}`, false)}
</head>
<body>
  <main class="wrap">
    <p class="mono">Zusammenfassung für die Technik</p>
    <h1>Wie diese Bewerbung<br><span style="color:var(--gold)">gebaut ist</span></h1>
    <p class="lead">Diese Seite ist zum Weitergeben gedacht. Dennis Benter bewirbt sich bei ${esc(input.company)} als ${esc(input.title)}. Hier steht nüchtern, was hinter der Bewerbungsseite steckt — ohne Marketing, mit den Stellen, die bewusst offen sind.</p>

    <h2>Aufbau</h2>
    <div class="card">
      <p>Der Inhalt jeder Bewerbung liegt als unveränderliche, freigegebene Version in Postgres. Die Seite wird <strong>einmal bei der Freigabe</strong> gerendert und als statische Datei ausgeliefert, nicht bei jedem Aufruf erzeugt. Das hält die Auslieferung schnell und nimmt dem Besuch jede Fehlerquelle: zur Laufzeit gibt es nichts, was scheitern könnte.</p>
      <p>Derselbe freigegebene Stand versorgt Seite und Sprachassistent. Der Assistent kann damit nichts sagen, was nicht auch auf der Seite steht.</p>
    </div>

    <h2>Das Gespräch mit dem Assistenten</h2>
    <div class="card">
      <p>Der Sprachassistent läuft als Web-Widget von Famulor direkt im Browser — kein Anruf, keine Telefonnummer, die Besucherin startet das Gespräch selbst. Er meldet sich sofort als KI und beantwortet ausschließlich, was für genau diese Bewerbung freigegeben ist.</p>
      <p>Sein Wissen ist derselbe freigegebene Stand, aus dem auch diese Seite gerendert wird — als Prompt fest je Bewerbung erzeugt, nicht zur Laufzeit zusammengesucht. Fehlt ihm etwas, sagt er das und verweist auf den Kontakt auf der Seite — er rät nicht.</p>
    </div>

    <h2>Datenschutz</h2>
    <div class="card">
      <p>Personenbezogene Daten liegen in einer eigenen Tabelle, getrennt vom übrigen Ablauf und ohne Leserecht für anonyme Clients. Row-Level-Security ist überall aktiv und standardmäßig verweigernd: keine Richtlinie bedeutet kein Zugriff, nicht freier Zugriff.</p>
      <p>Löschfristen laufen als geplante Aufgaben in der Datenbank, nicht als Vorsatz: Kontaktdaten nach 24 Stunden, Gesprächsinhalte nach sieben Tagen.</p>
      <p>Diese Seite trägt keine Analytik und nennt keine Empfängeradresse. Der Link ist nicht erratbar, aber weiterleitbar — er weist niemanden aus.</p>
    </div>

    <h2>Was bewusst nicht gebaut ist</h2>
    <div class="card">
      <p>Das Widget weiß nicht, von welcher Seite es gestartet wurde — es gibt keinen Kanal dafür. Deshalb ein Assistent je Bewerbung statt eines Assistenten, dem die Seite sagt, worum es geht.</p>
      <p>Der persönliche Testbereich der Reisekosten-Anwendung ist entworfen, aber nicht eingerichtet. Solange das so ist, behauptet weder die Seite noch der Assistent, dass er nutzbar wäre.</p>
      <p>Keine Suchmaschinen-Indexierung, keine öffentliche Übersicht aller Bewerbungen, keine Verknüpfung zwischen ihnen.</p>
    </div>

    <h2>Fragen?</h2>
    <p>Der Assistent erklärt das auch selbst, und Dennis ist direkt erreichbar: <a href="mailto:${esc(input.contact)}">${esc(input.contact)}</a></p>

    <footer>
      ${back ? `<p><a href="${esc(back)}">← zurück zur Bewerbung</a></p>` : ""}
      <p>Nicht für Suchmaschinen freigegeben. Zum Weiterleiten im Haus gedacht.</p>
    </footer>
  </main>
</body>
</html>`;
}
