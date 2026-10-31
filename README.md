# awp-hka-gold-js

Golden Master für Portal-Apps in JavaScript (Express). Der Starter enthält eine leere Seite; Ihre App bauen Sie darauf auf.

Zuerst in `manifest.json` Name, Kurzname (`slug`), Kategorie, Menü und Rollen eintragen.

## Befehle

| Befehl | Was passiert |
|---|---|
| `make dev` | App mit Test-Anmeldung starten: <http://localhost:8080> |
| `make start` | App wie im Betrieb starten (ohne Test-Anmeldung) |
| `make test` | automatische Tests (Jest) |
| `make lint` | Regeln prüfen (ESLint, Portal-Bibliothek) |
| `make docker` | Container bauen |

Voraussetzung: Node.js 24 (siehe `.nvmrc`) und npm. Einmalig die Abhängigkeiten laden: `npm ci`.

## Aufbau

```text
manifest.json          Name, Menü, Rollen, Schnittstellen-Rechte der App
src/app.js             App-Gerüst (portal.install vor allen Routen; nicht ändern)
src/routes.js          Seiten der App
src/views/             Nunjucks-Vorlagen (nur Seiteninhalt)
src/static/app.css     eigenes CSS (nur Variablen des Portals)
tests/                 Tests (Jest)
platform_sdk/          Portal-Bibliothek (verwaltet, nicht ändern; vorläufige Fassung 1.0.0-dev)
.agents/skills/        Regeln für die KI
```

## Wartung

`make lock` schreibt die Abhängigkeiten in `package-lock.json` neu.

`make sdk-update` ersetzt `platform_sdk/` durch die freigegebene Kopie aus dem Portal-Repository (`../portal/sdk/dist/javascript/platform_sdk`, dort mit `make sdk-release` gebaut). Andere Quelle: `make sdk-update SDK_DIST=…`.

## Selbsttests des Golden Master (Plattform-Team)

Getrennt von den Tests der App in `tests/`. Sie laufen nicht mit `make test`. Sie brauchen kein zusätzliches Paket (`node --test`).

| Befehl | Was geprüft wird |
|---|---|
| `make check-skills` | `.agents/skills/`: Kopf, Regeln und Prüfungen (40 / 33 / 7), Zählung im README, JavaScript- und JSON-Beispiele, Verweise auf Befehle und Dateien, ESLint-Verbote, Beispielantworten, Satzlänge, Gleichlauf mit `awp-hka-gold-python` |
| `make check-starter` | Aufbau, Manifest, Abhängigkeiten, ESLint-Verbote, `Dockerfile`, Gerüst der App, Vorlagen und CSS, 401 auf jeder Route, Portal-Bibliothek, Gleichlauf mit `awp-hka-gold-python`. Mit `CHECK_DOCKER=1` zusätzlich Container bauen und starten |
| `make check` | beides |

Beide Befehle geben einen deutschen Prüfbericht aus: Prüfbereiche, jede Prüfung mit Ergebnis und betroffenen Einzelregeln, alle 40 Einzelregeln mit Stand und das Gesamtergebnis. Der Bericht wird als Nachweis gespeichert:

- `build/pruefberichte/pruefbericht-<skills|starter>-<Datum_Uhrzeit>.md` (jeder Lauf)
- `build/pruefberichte/pruefbericht-<skills|starter>-aktuell.md` (letzter Lauf)
- `build/pruefberichte/<skills|starter>.xml` (JUnit, für die Pipeline)

Der Gleichlauf mit Python wird nur geprüft, wenn `awp-hka-gold-python` neben diesem Repository liegt; sonst steht die Prüfung als „übersprungen“ im Bericht.

Ob die KI die Skills befolgt, prüfen diese Tests nicht. Das macht das Prüfskript mit der Testaufgabe (HKA-30).
