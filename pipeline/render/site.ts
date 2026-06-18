/**
 * render/site.ts — generiert die personalisierte Bewerbungsseite als standalone HTML.
 *
 * SICHERHEIT (§16.1): JEDER interpolierte Wert stammt aus LLM/Enrich/Eingabe und ist
 * UNTRUSTED. Alles läuft durch `esc()`. Kein rohes String-Einsetzen, kein innerHTML.
 * Die Seite wird mit CSP `default-src 'self'; script-src 'none'` ausgeliefert (kein JS).
 * Pure TS — von Deno (Edge) und Bun (Tests) importierbar, keine Runtime-Deps.
 */

export type CoverageLevel = "stark" | "solide" | "lücke";

export interface Match {
  /** Anforderungs-Label aus der Anzeige. */
  requirement: string;
  level: CoverageLevel;
  /** Ehrlicher Abgleich — 1–2 Sätze. */
  evidence: string;
}

export interface SiteInput {
  company: string;
  title: string;
  matches: Match[];
  /** Antwort auf Frage 1 (Operator-Framing, knüpft an die Unternehmenssituation an). */
  why_role: string;
  /** Antwort auf Frage 2 (diese Seite IST die Pipeline + Zahlen). */
  automation_example: string;
  /** Empfänger-Email — nur im Footer/Disclosure, escaped. */
  email: string;
  contact: string;
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

const BADGE: Record<CoverageLevel, { label: string; cls: string }> = {
  "stark": { label: "stark", cls: "b-stark" },
  "solide": { label: "solide", cls: "b-solide" },
  "lücke": { label: "Lücke", cls: "b-luecke" },
};

function renderMatch(m: Match): string {
  const badge = BADGE[m.level] ?? BADGE["solide"];
  return `<li class="match">
      <div class="match-head">
        <span class="req">${esc(m.requirement)}</span>
        <span class="badge ${badge.cls}">${esc(badge.label)}</span>
      </div>
      <p class="evidence">${esc(m.evidence)}</p>
    </li>`;
}

/** Baut die vollständige HTML-Seite. Reiner String, kein DOM. */
export function renderSite(input: SiteInput): string {
  const matchesHtml = input.matches.map(renderMatch).join("\n      ");
  const title = `Bewerbung — ${esc(input.title)} @ ${esc(input.company)}`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; base-uri 'none'; form-action 'none'">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--navy:#0e121b;--gold:#cead60;--ink:#e8eaf0;--muted:#9aa3b2;--line:#222a38;--card:#141a26}
  *{box-sizing:border-box}
  body{margin:0;background:var(--navy);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:760px;margin:0 auto;padding:48px 24px 80px}
  .mono{font-family:"IBM Plex Mono",monospace;color:var(--gold);font-size:.8rem;letter-spacing:.04em;text-transform:uppercase}
  h1{font-family:"Playfair Display",serif;font-size:clamp(1.9rem,5vw,3rem);line-height:1.1;margin:.4em 0 .2em}
  h2{font-family:"Playfair Display",serif;font-size:1.5rem;margin:2.4em 0 .6em;color:var(--ink)}
  .lead{color:var(--muted);font-size:1.05rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:14px 0}
  p{margin:.6em 0}
  ul.matches{list-style:none;padding:0;margin:0}
  .match{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:10px 0}
  .match-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .req{font-weight:600}
  .evidence{color:var(--muted);margin:.5em 0 0;font-size:.95rem}
  .badge{font-family:"IBM Plex Mono",monospace;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;padding:3px 10px;border-radius:999px;white-space:nowrap}
  .b-stark{background:rgba(206,173,96,.16);color:var(--gold);border:1px solid rgba(206,173,96,.4)}
  .b-solide{background:rgba(154,163,178,.14);color:var(--ink);border:1px solid var(--line)}
  .b-luecke{background:rgba(154,163,178,.06);color:var(--muted);border:1px dashed var(--line)}
  footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
  a{color:var(--gold)}
</style>
</head>
<body>
  <main class="wrap">
    <p class="mono">Bewerbung · live generiert</p>
    <h1>${esc(input.title)}<br><span style="color:var(--gold)">${esc(input.company)}</span></h1>
    <p class="lead">Diese Seite wurde beim Absenden Ihrer Email in unter 60 Sekunden gebaut — von genau der Art Pipeline, um die es in der Rolle geht.</p>

    <h2>Warum diese Rolle</h2>
    <div class="card"><p>${esc(input.why_role)}</p></div>

    <h2>Ein Prozess, den ich automatisiert habe</h2>
    <div class="card"><p>${esc(input.automation_example)}</p></div>

    <h2>Ehrlicher Abgleich</h2>
    <ul class="matches">
      ${matchesHtml}
    </ul>

    <footer>
      <p>Dennis Benter · <a href="mailto:${esc(input.contact)}">${esc(input.contact)}</a></p>
      <p>Generiert für ${esc(input.email)}. Daten werden nur zur einmaligen Auslieferung verarbeitet und innerhalb von 24 Stunden gelöscht.</p>
    </footer>
  </main>
</body>
</html>`;
}
