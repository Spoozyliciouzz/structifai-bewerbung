// Lokale Vorschau der Bewerbungsseite, wie der Empfänger sie sieht. Throwaway.
// Matches aus dennis.json coverage (verifiziert); why_role/automation_example als realistisches
// Beispiel (im Live-Betrieb LLM-generiert). bun preview-site.ts → http://localhost:8787
import { renderSite, type Match, type CoverageLevel } from "./pipeline/render/site.ts";
import dennis from "./profile/dennis.json";
import { readFileSync } from "node:fs";

const matches: Match[] = dennis.coverage.map((c) => ({
  requirement: c.req,
  level: c.level as CoverageLevel,
  evidence: c.evidence,
}));

const html = renderSite({
  company: "StrategyFrame.AI",
  title: "Chief of Staff",
  matches,
  why_role:
    "StrategyFrame lebt Strategie mit KI — genau der Punkt, an dem Dennis gerade selbst steht. Als Chief of Staff hält er die Fäden zusammen, entlastet die Geschäftsführung und baut die Prozesse, die ein junges Team mit vielen Kunden braucht. Operator, der ownt, kein Berater, der empfiehlt.",
  automation_example:
    "Diese Seite ist das Beispiel: Web, Mail und der Anruf, den Sie gleich bekommen, sind eine einzige Pipeline — solo gebaut, in unter sechzig Sekunden generiert. Dieselbe Art Agenten-Flotte bringt Dennis in Produktion: etwa eine Content-Pipeline, die SEO-Signale liest, quellenbelegte Artikel generiert und live auf gartendesign-fricke.de publiziert, oder GartenAIden, das aus einem geführten Dialog qualifizierte Leads für den Garten- und Landschaftsbau macht.",
  email: "empfaenger@strategyframe.ai",
  contact: dennis.contact,
});

const PORT = 8787;
Bun.serve({
  port: PORT,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/landing") {
      try {
        return new Response(readFileSync("./landing/index.html", "utf8"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch {
        return new Response("landing/index.html nicht gefunden", { status: 404 });
      }
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
});
console.log(`Bewerbungsseite:  http://localhost:${PORT}/`);
console.log(`Landing (Eingabe): http://localhost:${PORT}/landing`);
