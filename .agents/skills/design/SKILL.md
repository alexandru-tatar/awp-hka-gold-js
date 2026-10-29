---
name: design
description: Verwenden, wenn Aussehen, Farben, Abstände, Schrift oder CSS einer Seite gebaut oder geändert werden, zum Beispiel bei „Mach es wie im Intranet“ oder „Das sieht noch nicht wie unsere Hochschulseite aus“.
---

# Design

Das Aussehen kommt aus den Gestaltungsregeln der HKA, nicht von Ihnen. Das Portal liefert Farben, Schrift, Abstände und fertige Bausteine. Sie bauen nur den Inhalt.

## Regeln

| ID | Regel | Stufe |
|---|---|---|
| R-DES-1 | Farben, Abstände und Schrift nur über `var(--…)` aus dem Portal; keine Farbwerte im eigenen CSS. | muss |
| R-DES-2 | Keine CSS-Bibliothek und kein Framework (Bootstrap, Tailwind …). | muss |
| R-DES-3 | Keine externen Skripte, Schriften, Bilder oder Stile; alles kommt von der eigenen Adresse. | muss |
| R-DES-4 | Der Seitenrahmen kommt von `portal.layout(...)`; kein eigenes `<html>`, `<head>`, `<body>`. | muss |
| R-DES-5 | Seiteninhalt nutzt die Bausteine des Portals (Tabelle, Feld, Dialog, Knopf) mit deren Klassen. | soll |

## So geht es im JavaScript-Starter

1. Den Seitenrahmen liefert `portal.layout(...)`. Sie schreiben nur den Inhalt von `<main>`.
2. Der Inhalt steht in einer Nunjucks-Vorlage in `src/views/`.
3. Eigenes CSS steht nur in `src/static/app.css` (Adresse: `portal.url("/static/app.css")`). Es benutzt nur Variablen des Portals.
4. Alles kommt von der eigenen Adresse. In Vorlagen und CSS steht keine Adresse mit `http://`, `https://` oder `//`.
5. Fehlt ein Baustein oder eine Variable, fragen Sie nach. Erfinden Sie keine eigene.

```js
// src/routes.js (Ausschnitt): nur der Inhalt, den Rahmen baut das Portal
router.get("/", async (req, res) => {
  const body = nunjucks.render("noten.njk", { grades });
  res.type("html").send(
    await portal.layout({ title: "Meine Noten", body, current: portal.url("/"), user: req.portal.user }),
  );
});
```

### Variablen des Portals

Immer `var(--name)` schreiben, nie den Wert.

| Zweck | Variablen |
|---|---|
| Farben | `--bg`, `--bg-subtle`, `--ink`, `--ink-muted`, `--accent`, `--accent-ink`, `--accent-strong`, `--danger`, `--success`, `--warn-ink`, `--warn-bg`, `--border-ui`, `--border-soft`, `--focus` |
| Schrift | `--font-body`, `--font-heading`, `--font-mono`, `--fs-0` bis `--fs-3`, `--lh` |
| Abstände | `--s-1`, `--s-2`, `--s-3`, `--s-4`, `--s-6`, `--s-8`, `--s-12` |
| Form und Breite | `--radius` (eckig, Wert 0), `--measure` (Lesebreite) |

Quelle ist `kit/css/tokens.css` im Portal. Weicht dieser Text davon ab, gilt das Portal.

### Bausteine des Portals

| Baustein | Klassen |
|---|---|
| Knopf | `btn btn--primary` (Hauptaktion), `btn btn--secondary` (Nebenaktion), `actions` (Knopfreihe) |
| Textlink mit „>“ | `cta` (das „>“ setzt das CSS, schreiben Sie es nie selbst) |
| Formularfeld | `field`, `field__hint`, `field__error`, `field__required`, Fehlerzusammenfassung `error-summary` |
| Tabelle | `table-wrap` um `table` (Zahlenspalten mit `num`) |
| Hinweis, Status | `notice`, `notice notice--warn`, `badge` |
| Hilfsklassen | `prose`, `lead`, `muted`, `small`, `visually-hidden` |

## Gut / schlecht

| Schlecht | Gut |
|---|---|
| `color: #333333;` in `app.css` | `color: var(--ink);` |
| `<link href="https://cdn.example/bootstrap.min.css" rel="stylesheet">` | die Bausteine des Portals, zum Beispiel `class="btn btn--primary"` |
| `<script src="https://cdn.example/lib.js"></script>` | keine externe Datei; was die Seite braucht, liegt in `src/static/` |
| Eine Seite beginnt mit `<!doctype html><html>…` | Nur der Inhalt; den Rahmen liefert `portal.layout(...)` |
| eigene Klasse `.mein-knopf` | `.btn` |

## Prüfungen, die das absichern

A = automatisch, H = halbautomatisch (eine Person bestätigt), M = manuell (eine Person prüft). Die Prüfstellen stehen in `.agents/skills/README.md`.

| ID | Prüfung |
|---|---|
| R-DES-1 | A (`lint`: Stylelint verbietet `#…` und `rgb(…)`) |
| R-DES-2 | A (`lint`: Abhängigkeiten und `<link>` prüfen) |
| R-DES-3 | A (`lint`, `ci`) |
| R-DES-4 | A (`test`) |
| R-DES-5 | A (`test`, Warnung) |

## Vor dem Abschluss

- [ ] Keine Farbwerte (`#…`, `rgb(…)`) im eigenen CSS
- [ ] Keine CSS-Bibliothek, keine externe Adresse
- [ ] Kein eigenes `<html>`, `<head>` oder `<body>`
- [ ] Knöpfe, Felder, Tabellen und Dialoge mit den Klassen des Portals
- [ ] `make lint` und `make test` laufen ohne Fehler
