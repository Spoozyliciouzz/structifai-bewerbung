---
name: Bewerbung als Maschine
description: Dunkle Maschinenraum-Ästhetik in Navy und Gold für eine Bewerbung, die sich live selbst baut.
colors:
  machine-navy: "#0e121b"
  panel-navy: "#141a26"
  console-black: "#0a0e15"
  signal-gold: "#cead60"
  ink: "#e8eaf0"
  muted-steel: "#9aa3b2"
  hairline: "#222a38"
  ok-green: "#7fd1a3"
  err-red: "#e08a8a"
  button-ink: "#1a1407"
typography:
  display:
    fontFamily: "Playfair Display, serif"
    fontSize: "clamp(2rem, 6vw, 3.2rem)"
    fontWeight: 700
    lineHeight: 1.08
  headline:
    fontFamily: "Playfair Display, serif"
    fontSize: "clamp(1.3rem, 4vw, 1.7rem)"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
    letterSpacing: "0.06em"
rounded:
  sm: "10px"
  md: "14px"
  lg: "16px"
  pill: "99px"
spacing:
  sm: "12px"
  md: "18px"
  lg: "22px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.signal-gold}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.sm}"
    padding: "14px 18px"
  input:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 14px"
  card:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "22px"
  pill-badge:
    backgroundColor: "#cead600d"
    textColor: "{colors.signal-gold}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
---

# Design System: Bewerbung als Maschine

## 1. Overview

**Creative North Star: "Der Maschinenraum, der gerade läuft"**

Eine dunkle, ruhige Kommandozentrale: tiefes Navy als Raum, ein einziges Signal-Gold als Stimme der Maschine. Die Seite inszeniert keinen Bewerber, sie inszeniert eine laufende Pipeline — Mono-Labels wie Konsolen-Prompts, Stage-Dots, die von grau über gold zu grün schalten, ein Puls, der „live" bedeutet. Playfair Display liefert die menschliche Gegenstimme: die wenigen großen Serif-Zeilen sind das, was der Operator sagt; alles andere ist das, was die Maschine tut. Landing (`landing/index.html`) und generierte Bewerbungsseite (`landing/build.html`, gerendert von `pipeline/render/site.ts`) teilen exakt dieselben Tokens — Konsistenz beim Aha-Moment ist Briefing-Pflicht (§7.5).

Das System lehnt ab, was PRODUCT.md ablehnt: Marketing-Floskeln-Optik, SaaS-Template-Layouts, PDF-Bewerbungs-Ästhetik, Security-Theater. Es ist eine Ein-Spalten-Erzählung (max. 680px, Desktop 1040px) mit einem Ziel pro Fold.

**Key Characteristics:**
- Dunkler Grund mit radialem Glow statt flacher Fläche (`radial-gradient` über `#0e121b`)
- Ein Akzent (Gold) trägt Status, Fokus, CTA und Labels — sonst nichts
- Konsolen-Grammatik: IBM Plex Mono, uppercase, getrackt, nummerierte Sektions-Labels (①–④)
- Hairline-Borders (`#222a38`, 1px) statt Schatten; Tiefe durch Flächenton, nicht Elevation
- Bewegung = Statusanzeige (Puls, Shimmer, Fortschritt), nie Dekoration; `prefers-reduced-motion` schaltet alles ab

## 2. Colors

Eine Committed-Dark-Palette: Navy ist der Raum, Gold ist die einzige Stimme, zwei Semantikfarben melden Zustand.

### Primary
- **Signal-Gold** (#cead60): Die Stimme der Maschine. Mono-Labels, aktive Stage-Dots, Fokus-Outlines, Fortschrittsbalken, CTA-Hintergrund, `accent-color` der Checkbox, 2px-Hook-Border, 3px-Kante der Tech-Karten. Als Fläche fast immer stark transparent (`#cead600d`, `#cead6022`) — deckend nur auf dem Primär-Button.

### Neutral
- **Machine-Navy** (#0e121b): Seitengrund, mit radialem Glow nach oben.
- **Panel-Navy** (#141a26): Karten, Inputs, sekundäre Flächen (`--navy-2`/`--card` sind identisch).
- **Console-Black** (#0a0e15): nur die Build-Konsole — die dunkelste Fläche der Seite.
- **Ink** (#e8eaf0): Fließtext und Headlines.
- **Muted-Steel** (#9aa3b2): Lead-Text, Meta, Labels, inaktive Zustände.
- **Hairline** (#222a38): 1px-Borders, Trennlinien, inaktive Dots und Tracks.
- **Button-Ink** (#1a1407): Text auf Gold-Flächen (dunkles Braun-Schwarz, nicht Navy).

### Tertiary (Status)
- **OK-Grün** (#7fd1a3): erledigte Stages, positive Coverage.
- **Fehler-Rot** (#e08a8a): Fehlermeldungen, Error-Border — desaturiert, kein Alarm-Rot.

### Named Rules
**The One-Voice Rule.** Gold ist die einzige Markenfarbe. Kein zweiter Akzent, nirgends. Wenn etwas Aufmerksamkeit braucht und nicht Status ist (grün/rot), ist es Gold oder es ist es nicht wert.
**The Translucent-Gold Rule.** Gold als Fläche nur in Transparenzstufen (`0d`/`14`/`22`/`33` Hex-Alpha auf #cead60); deckendes Gold ist dem Primär-Button und aktiven Indikatoren vorbehalten. Seine Knappheit ist der Punkt.

## 3. Typography

**Display Font:** Playfair Display (Fallback serif) — 600/700
**Body Font:** Inter (Fallback system-ui, sans-serif) — 400/500/600
**Label/Mono Font:** IBM Plex Mono (Fallback monospace) — 400/500

**Character:** Serif-Würde trifft Konsolen-Präzision. Playfair spricht als Mensch (wenige, große Zeilen), Plex Mono spricht als Maschine (viele, kleine Labels), Inter erklärt dazwischen. Die Spannung zwischen den beiden Extremen ist die Identität.

### Hierarchy
- **Display** (700, clamp(2rem, 6vw, 3.2rem), 1.08): Nur die Hero-Zeile der Landing („Eine Bewerbung, die sich selbst baut."). Auf der Build-Seite kleiner: clamp(1.7rem, 5vw, 2.4rem).
- **Headline** (600, clamp(1.3rem, 4vw, 1.7rem), 1.2): Sektions- und Reveal-Überschriften, Karten-Titel (dort 1.02–1.25rem).
- **Body** (400, 1rem, 1.6): Fließtext; Lead-Absätze 1.08rem in Muted-Steel, max. 42–70ch.
- **Label** (400, 0.78rem, letter-spacing 0.06em, UPPERCASE, Gold): Kicker, Sektions-Nummern, Stage-Namen, Pills. Untergrenze 0.62rem (Tech-Karten-Kategorie) — nicht weiter verkleinern.

### Named Rules
**The Machine-Speaks-Mono Rule.** Alles, was die Pipeline sagt (Stages, Status, Notes, Engine-Zeile, Telefon-Hinweis), steht in IBM Plex Mono. Alles, was der Mensch sagt, in Playfair/Inter. Nie mischen.

## 4. Elevation

Flach mit Hairlines: Tiefe entsteht aus drei Flächentönen (Machine-Navy → Panel-Navy → Console-Black) plus 1px-Borders (#222a38), nicht aus Schatten. `box-shadow` existiert nur als **Glow-Puls** um Live-Indikatoren (`0 0 0 4px #cead6022` am aktiven Stage-Dot, animierte `0 0 0 0→22px #cead6055`-Ringe an Puls-Elementen) — Schatten ist hier Statusanzeige, kein Raumeffekt. Die einzige Schattennutzung im klassischen Sinn liegt in der verwaisten `landing-tosie.css` und gehört nicht zu diesem System.

### Named Rules
**The Glow-Not-Shadow Rule.** Kein grauer/schwarzer Drop-Shadow, nirgends. Wenn etwas leuchtet, lebt es (Puls = laufender Prozess); alles andere ist flach mit Hairline.

## 5. Components

### Buttons
- **Shape:** Sanft gerundet (10px); Kreis-Buttons (Gallery-Pfeile 42px, Voice-Ring 92px) sind volle Kreise.
- **Primary:** Deckendes Signal-Gold auf Button-Ink (#1a1407), 14px 18px Padding, Gewicht 600, volle Breite im Formular.
- **Hover / Focus:** `filter: brightness(1.06)` + `translateY(1px)` bei active; Fokus überall 2px Gold-Outline mit 2px Offset. Disabled: Opacity .55.
- **Ghost/Link-CTA (Build-Seite):** Gold-Border-Pill (99px) auf `#cead600d`, Mono-Schrift, Hover hellt auf `#cead6022`.

### Pills / Badges
- **Style:** 99px-Radius, Mono 0.72rem getrackt, Gold auf `#cead600d` mit Hairline-Border; Live-Variante mit 8px pulsierendem Gold-Dot, statische Variante in Muted-Steel.

### Cards / Containers
- **Corner Style:** 12–16px (Konsole 12, Standardkarte 14, Gallery 16).
- **Background:** Panel-Navy (#141a26); Konsole Console-Black; Voice-Karte als einzige mit dezentem Verlauf (`linear-gradient(160deg,#1a2030,#141a26)`) und Gold-Hairline.
- **Shadow Strategy:** keiner — Hairline-Border (1px #222a38) per Glow-Not-Shadow Rule.
- **Internal Padding:** 20–24px.
- **Signatur-Detail:** Tech-Karten tragen eine 3px Gold-Kante links (Opacity .55) und heben bei Hover um 1px.

### Inputs / Fields
- **Style:** Panel-Navy-Fläche, 1px Hairline-Border, 10px Radius, 13px 14px Padding, Ink-Text; Labels 0.85rem Muted-Steel darüber.
- **Focus:** 2px Gold-Outline, kein Border-Farbwechsel.
- **Error:** Fehlertext in Err-Red (0.88rem) mit `role="alert"`; desaturierte Error-Border `#e08a8a55` an Panels.

### Build-Konsole (Signature Component)
Das Herzstück: Console-Black-Panel, 12px Radius, Zeilen in Plex Mono 0.86rem. Jede Stage = Dot + Name + rechtsbündige Note. Zustände: wartend (Opacity .45, Hairline-Dot) → aktiv (Ink, Gold-Dot mit 4px Glow) → done (OK-Grün). Auf der Build-Seite ergänzt um Fortschrittsbalken (Gold-Fill, `cubic-bezier(.22,.61,.36,1)`), Shimmer-Skeletons und ein Score-Gauge aus `conic-gradient` (Gold auf Hairline) mit Playfair-Zahl.

### Navigation
Keine klassische Navigation — Single-Purpose-Seiten. Die Gallery hat Kreis-Pfeile (Hairline-Border, Hover → Gold) und 8px-Dots (aktiv: Gold, 1.25× skaliert, Tablist-Semantik).

## 6. Do's and Don'ts

### Do:
- **Do** Gold (#cead60) als einzigen Akzent führen; Flächen-Gold nur transluzent (One-Voice + Translucent-Gold Rule).
- **Do** jede Pipeline-/Statusäußerung in IBM Plex Mono setzen, uppercase, getrackt (Machine-Speaks-Mono Rule).
- **Do** Tiefe über Flächentöne + 1px #222a38 lösen; Glows nur als Live-Puls (Glow-Not-Shadow Rule).
- **Do** `prefers-reduced-motion` als globalen Kill-Switch für alle Animationen beibehalten — Pflicht bei so viel Puls/Shimmer.
- **Do** Fokus sichtbar halten: 2px Gold-Outline, 2px Offset, auf Inputs, Buttons und Links.
- **Do** die Maschinen-Ästhetik 1:1 auf generierte Seiten übertragen (Navy #0e121b, Gold #cead60, Playfair + Inter + IBM Plex Mono — BRIEFING §7.5).

### Don't:
- **Don't** Berater-/Dienstleister-Optik: keine Feature-Grids mit Icon-über-Heading, keine Testimonial-Slider, keine SaaS-Landing-Template-Muster (PRODUCT.md: „Berater-Framing ist tödlich").
- **Don't** Marketing-Floskeln-Typografie: keine Superlativ-Heros, keine Gradient-Headlines, kein zweiter Akzent „für Abwechslung".
- **Don't** PDF-/CV-Bewerbungsästhetik — weißes Papier, Timeline-Lebenslauf, Foto-oben-links.
- **Don't** graue Drop-Shadows oder Glassmorphism; die einzige erlaubte Leuchterscheinung ist der Gold-Puls laufender Prozesse.
- **Don't** Mono-Labels unter 0.62rem oder Body-Text in Muted-Steel unter 0.88rem — AA-Kontrast und Lesbarkeit kippen.
- **Don't** die verwaiste `landing-tosie.css` (Cormorant-Garamond-Beige-Ästhetik) als Referenz verwenden — sie gehört nicht zu diesem System.

> TODO(Dennis bestätigen): `landing-tosie.css` (beige Cormorant-Landing „Tosie", enthält am Dateiende Klartext-Kontaktdaten „Caroline Weller" — invalides CSS) wirkt wie ein versprengtes Fremdprojekt. Löschen oder auslagern?
