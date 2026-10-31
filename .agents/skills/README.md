# Skills für den JavaScript-Golden-Master

*Status: Entwurf · Version 0.1.0 · Stand 31.10.2026 · Ticket HKA-41 · Verantwortlich: Yaraslau Krautsou*

## Zweck

Diese sieben Skills sagen der KI, woran sie sich beim Bau einer Micro-App im JavaScript-Starter (Express) halten muss. Sie setzen die **sieben Regeln des Golden Master** um (Confluence: „Die sieben Regeln des Golden Master (Entwurf 0.1)“, Ticket HKA-29). Die sieben Regeln bestehen aus **40 Einzelregeln** mit fester Kennung wie `R-SEC-3`. Eine Regel ist **erfüllt**, wenn alle Einzelregeln der Stufe „muss“ bestanden sind. Einzelregeln der Stufe „soll“ werden berichtet, entscheiden aber nicht.

Die Tabellen „Regeln“ und „Prüfungen“ in jedem Skill sind Wort für Wort aus dem Regelpapier übernommen. Wer eine Regel ändern will, ändert zuerst das Regelpapier und dann den Skill.

Den Python-Golden-Master (`awp-hka-gold-python/.agents/skills/`) gibt es mit denselben Skills. Gleich bleiben: Kopf (`name`, `description`), Regeln, Prüfungen und `pipeline-fehler/fehlercodes.md`. Angepasst sind die Abschnitte „So geht es im JavaScript-Starter“, die Beispiele, „Gut / schlecht“ und die Prüflisten. Ändert sich eine Regel, werden beide Fassungen gleich geändert. `make check-skills` prüft den Gleichlauf.

## Aufbau

```text
.agents/skills/
├── README.md                    diese Datei
├── design/SKILL.md              Aussehen, Farben, Abstände, Schrift
├── barrierefreiheit/SKILL.md    WCAG 2.1 AA
├── ui-regeln/SKILL.md           Dialoge, Knöpfe, Meldungen, Pflichtfelder
├── schnittstellen/SKILL.md      Mail, Noten, E-Akte über portal.adapters
├── portal/SKILL.md              Anmeldung, Rollen, Menü, Manifest, Links
├── pipeline-fehler/SKILL.md     rote Pipeline verständlich erklären
├── pipeline-fehler/fehlercodes.md   Katalog der Fehlercodes PF-nnn
└── secrets/SKILL.md             Passwörter, Schlüssel, Token
```

Die KI liest immer zuerst die Hauptregeln der App (`AGENTS.md`, kommt mit Phase 2). Einen Skill lädt sie nur, wenn die `description` im Kopf der Datei zur Aufgabe passt. Deshalb beginnt jede Beschreibung mit „Verwenden, wenn …“ und nennt Wörter, die Menschen wirklich sagen.

## Zuordnung der Skills zu den Regeln

| Skill | Wird geladen bei | Einzelregeln | muss | soll |
|---|---|---|---|---|
| `design` | Aussehen, Farben, Abstände, Schrift, CSS | R-DES-1 bis R-DES-5 (5) | 4 | 1 |
| `barrierefreiheit` | Seiten, Formulare, Tabellen, Farben, Tastatur | R-A11Y-1 bis R-A11Y-8 (8) | 7 | 1 |
| `ui-regeln` | Dialoge, Knöpfe, Meldungen, Pflichtfelder | R-UI-1 bis R-UI-7 (7) | 4 | 3 |
| `schnittstellen` | Daten aus Mail, Noten oder E-Akte | R-SCHN-1 bis R-SCHN-5 (5) | 5 | 0 |
| `portal` | Anmeldung, Rollen, Menü, Manifest, Links, Fertigstellen | R-PORT-1 bis R-PORT-7 (7) | 6 | 1 |
| `pipeline-fehler` | rote Pipeline, Fehlermeldung der Pipeline | R-PF-1 bis R-PF-4 (4) | 3 | 1 |
| `secrets` | Passwort, Schlüssel, Token | R-SEC-1 bis R-SEC-4 (4) | 4 | 0 |
| **Summe** | | **40** | **33** | **7** |

## Prüfstellen und Prüfarten

- Prüfarten: **A** = automatisch (Skript, ohne Mensch), **H** = halbautomatisch (Skript bewertet nach festem Raster, eine Person bestätigt), **M** = manuell (eine Person prüft und trägt das Ergebnis im Prüfprotokoll ein).
- Prüfstellen: `lint` = `make lint` (ESLint, Prüfsumme von `platform_sdk/`), `test` = `make test` (Jest), `ci` = Pipeline, `konf` = Konformitätsprüfung der Pipeline, `prf` = Prüfskript und Prüfprotokoll.

## So wird geprüft

Die Skills werden mit der Testaufgabe „Baue eine Noten-Übersicht“ geprüft (Ticket HKA-30): sechs feste Prompts, drei Läufe je Version, ein Prüfprotokoll. Der Starter selbst enthält nur eine leere Seite; die Noten-Übersicht entsteht erst im Testlauf. Jeder Prompt berührt bestimmte Skills:

| Prompt | Berührte Skills |
|---|---|
| 1 Seite und Tabelle anlegen | `portal` |
| 2 Noten aus dem Notensystem holen | `schnittstellen` |
| 3 Passwort in die Konfiguration legen (eingespielter Fehlerfall) | `secrets` |
| 4 Wie im Intranet und barrierefrei | `design`, `barrierefreiheit`, `ui-regeln` |
| 5 „Bring sie ins Portal“ | `portal` (vorbereitend `pipeline-fehler`) |
| 6 Rote Pipeline (eingespielter Fehlerfall) | `pipeline-fehler` |

Ein Lauf ohne Abweichungen wird als **Goldener Standard** gespeichert. Jede neue Version der Skills wird mit ihm verglichen. Die Version der Skills steht im Prüfprotokoll (Git-Tag `skills-vMAJOR.MINOR.PATCH`).

Form und Zusammenhang der Skills prüft `make check-skills` ohne KI: Kopf, Regeln und Prüfungen (40 / 33 / 7), Zählung in dieser Datei, Beispiele, Verweise auf Befehle und Dateien, ESLint-Verbote, Beispielantworten, Satzlänge und den Gleichlauf mit Python. Der Prüfbericht liegt in `build/pruefberichte/`. Ob die KI die Skills befolgt, prüft dieser Test nicht.

**Stand:** Es hat noch kein Testlauf mit der KI stattgefunden. Die Skills bleiben Entwurf, bis die Testaufgabe durchgelaufen ist und die Abweichungen eingearbeitet sind.

## Konventionen in den Beispielen

- Node 24 (`.nvmrc`), Express 5, CommonJS (`require`), Nunjucks mit `autoescape`, Jest, ESLint: wie im `starter-js` (Ticket HKA-26). Aufbau: `src/app.js`, `src/routes.js`, `src/views/`, `src/static/app.css`, `tests/`.
- Die Namen des Portal-SDK (`portal.layout`, `portal.url`, `portal.requires`, `portal.install`, `req.portal.user`, `portal.adapters`, `AdapterError`) folgen dem Architekturvorschlag (Portal SDK, §3.2). Der Adapter-Client bekommt die Anfrage mit: `portal.adapters.noten.listMyGrades(req)`.
- Unterschiede zu Python, die in den Skills stehen: Die Person kommt aus `req.portal.user` statt aus `Depends(portal.user)`. Namen sind `camelCase` (`listMyGrades`, `requestId`).
- Die Texte sind für die KI geschrieben: Sie-Form, einfache Sprache, kurze Sätze.

## Offene Punkte

1. **Vorläufiges SDK:** `platform_sdk/` ist eine Kopie des Portal-SDK in Version `1.0.0-dev` (Quelle: `portal/sdk/javascript/`, dort `make sdk-release`; hier `make sdk-update`). Was dem SDK noch fehlt, steht in `portal/sdk/README.md`. Ändern sich dort Namen, werden die Beispiele in den Skills angepasst.
2. **Modulstil und Testwerkzeug:** Der Starter nutzt CommonJS und Jest für die Tests der App (Entscheidung vom 26.10., bestätigt mit HKA-44). Die Selbsttests des Golden Master laufen mit `node --test`. Der Architekturvorschlag zeigt ES-Module und `node --test` auch für die App. Mit dem Team abstimmen.
3. **Lint-Regeln:** `eslint.config.js` verbietet `fetch`, `axios`, `node-fetch`, `got`, `undici`, `node:http`, `node:https`, Login-Bibliotheken und Cookies (`res.cookie`, `req.cookies`). `platform_sdk/` ist von der Prüfung ausgenommen. Die Regel `no-restricted-imports` aus dem Architekturvorschlag meldet in CommonJS-Dateien nichts; deshalb steht dort `no-restricted-modules` (mit ESLint 10.14 geprüft, auch für `require("axios")`). Noch ohne Prüfung: `| safe` in Vorlagen, Stylelint für `app.css` (Farbwerte prüft nur `make check-starter`).
4. **Schnittstellenbeschreibungen und Fehlerkatalog:** `docs/schnittstellen/*.md` und `docs/fehlercodes.md` erzeugt die Plattform später aus den OpenAPI-Dateien und aus `failure-codes.yml`. `pipeline-fehler/fehlercodes.md` ist ein Auszug aus dem Architekturvorschlag (Pipeline und Deployment, §6). Sobald die Plattform den Katalog liefert, ersetzt er diese Datei.
5. **Manifest-Beispiel:** Der Architekturvorschlag (Starter und Runtime, §7) nennt für Noten das Icon `table`. Das Manifest-Schema erlaubt es nicht. Die Skills nutzen `grades`.
6. **Eigenes CSS einbinden:** Der Architekturvorschlag legt das nicht fest. Das vorläufige SDK bindet `{PORTAL_BASE_PATH}/static/app.css` in `layout()` immer ein, in Python wie in JavaScript gleich. Mit dem Plattform-Team abstimmen.
7. **Nicht abgedeckte Vorgaben:** Drei Vorgaben stehen nicht unter den 40 Einzelregeln (Regelpapier, Abschnitt „Offene Punkte“): Entscheidungen in der README festhalten, `Dockerfile` und `docker-compose.yml` nicht ohne Absprache ändern, `.editorconfig` und Projektstruktur einhalten. Sie sind bewusst nicht in den Skills, bis das Team entschieden hat.
8. **Hauptregeln der App (`AGENTS.md`):** Die Datei, die diese Skills nennt und lädt, gehört nicht zu HKA-41.
9. **Prüfung der Seiten:** Geplant ist, dass `make test` die Seiten nach `build/a11y/` rendert und mit `tools/a11y-structural.mjs` (axe-core) prüft. Das gibt es noch nicht; bisher prüft `tests/app.test.js` nur einzelne Merkmale (`lang="de"`, Sprunglink, eine `<h1>`).
10. **Kopien für einzelne KI-Werkzeuge:** Diese Dateien sind die Quelle. Kopien im Format der jeweiligen Werkzeuge erzeugt später die Plattform (Architekturvorschlag, KI-Schicht, §7).
