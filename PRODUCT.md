# Product

## Register

brand

## Users

Genau ein primärer Empfänger: **Christian Underwood, Founder von StrategyFrame.AI** (Chief-of-Staff-Anzeige 4428605958), plus sein engstes Umfeld (Co-Founder Prof. Jürgen Weigand) und jeder, der das öffentliche Repo liest. Kontext: Ein Anti-Consulting-Operator, der seine eigene Beratung von 30 Beratern auf 3 Menschen + 40+ KI-Agenten umgebaut hat. Er bewertet Bewerber danach, ob sie *bauen und ownen* statt beraten. Sein Job-to-be-done beim Besuch der Seite: in unter 60 Sekunden erleben (nicht lesen), ob dieser Bewerber agentische Pipelines wirklich in Produktion bringen kann.

Sekundär: Dennis Benter selbst — die Seite ist seine Bewerbung; jede Design- und Codeentscheidung zahlt auf seine Glaubwürdigkeit als Operator ein.

## Product Purpose

Eine Bewerbung, die **das Produkt ist, nicht beschreibt**. Der Empfänger gibt auf `bewerbung.structifai.de` seine Email ein, sieht einem Agenten live beim Bauen zu (Realtime-Konsole) und erhält in <60s eine frisch gerenderte, auf ihn zugeschnittene Bewerbungsseite per Mail — mit einem eigenen KI-Sprachassistenten (Famulor-Widget) direkt auf der Seite. Drei Modalitäten (Web → Mail → Sprachassistent), eine Pipeline, solo gebaut. Erfolg = der Aha-Moment beim Founder plus ein Code-Review-fähiges öffentliches Repo (RLS, DSGVO, Trust-Boundaries), das die Behauptung beweist.

## Brand Personality

**Operator-direkt · Präzise · Live.**

Ton: kollegial-direkt, kurze Sätze, konkrete Pain Points statt Features, keine Marketing-Floskeln, keine Belehrung, Komplimente nur wenn spezifisch (BRIEFING §3, verbindlich). Ehrliche Lücken souverän framen, nicht entschuldigen — kein Apologetik-Ton. Emotionales Ziel: das ruhige Selbstvertrauen eines Maschinenraums, der gerade läuft — Spannung durch den Live-Build, nicht durch Superlative.

> TODO(Dennis bestätigen): 3-Wort-Personality „Operator-direkt · Präzise · Live" ist aus BRIEFING §1/§3 und der gebauten Ästhetik abgeleitet, nicht explizit freigegeben.

## Anti-references

- **Berater-/Dienstleister-Framing** („structifai als Agentur") — beim Empfänger laut Briefing „tödlich".
- **Marketing-Floskeln und Superlative** — generische SaaS-Landingpage-Sprache, Feature-Listen, Buzzword-Hero.
- **Klassische PDF-/CV-Bewerbungsästhetik** — genau das Gegenteil des Konzepts.
- **Apologetik** — sich für Lücken entschuldigende Bewerber-Tonalität.
- **Security-/Kompetenz-Theater** — behauptete statt gebauter Kontrollen; das Repo wird vom Founder gelesen (SECURITY.md muss wahr bleiben).
- **Sichtbare KI-Slop-Signale** — ungeprüfte Behauptungen, Prozess-Marker, Template-Optik, die „AI made that" schreit.

## Design Principles

1. **Show, don't tell.** Die Pipeline läuft live vor den Augen des Empfängers; nichts wird behauptet, was nicht gerade passiert (Konsole, Realtime-Stages, Gauge).
2. **Die Maschine ist die Marke.** Konsolen-Grammatik (Mono-Labels, Stage-Dots, Fortschrittsbalken) ist das tragende visuelle Motiv — Landing und generierte Seite teilen dieselbe Maschinen-Ästhetik (BRIEFING §7.5).
3. **Operator-Ehrlichkeit.** Auch der Abgleich mit der Stelle zeigt Lücken (Coverage „stark/solide/lücke") statt sie zu kaschieren; Ehrlichkeit ist ein Designelement.
4. **Ein Empfänger, ein Fold, ein Ziel.** Keine generische Zielgruppe: jede Sektion adressiert die zwei Founder-Fragen; nichts auf der Seite, das nicht auf den Aha-Moment einzahlt.
5. **Sicherheit als sichtbares Qualitätsmerkmal.** DSGVO-Hinweise, KI-Disclosure und Consent sind Teil der Oberfläche, nicht Kleingedrucktes — der Code-Review des Founders ist Teil der Bewerbung.

## Accessibility & Inclusion

- **WCAG 2.1 AA** als Zielniveau; Kontrast ≥ 4.5:1 für Text (Gold `#cead60` und Ink `#e8eaf0` auf Navy `#0e121b` erfüllen das; Mono-Labels unter 0.75rem im Auge behalten).
- **`prefers-reduced-motion` wird respektiert** (globaler Kill-Switch für Animationen/Transitions ist bereits implementiert) — Pflicht, da Puls-/Shimmer-/Wave-Animationen tragende Motive sind.
- Sichtbarer Fokus überall: 2px Gold-Outline auf `:focus-visible` (implementiert, beibehalten).
- Mobil responsiv (Quality-Floor aus BRIEFING §7.1); Formular mit echten `label`-Bindungen, `role="alert"` für Fehler, `aria-live` für die Konsole.
- Deutsch als einzige Sprache (`lang="de"`), ein Empfänger — keine i18n-Anforderung.
