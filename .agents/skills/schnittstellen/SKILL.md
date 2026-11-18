---
name: schnittstellen
description: Verwenden, wenn Daten aus Noten, bwSync&Share, Mail oder E-Akte geholt oder gesendet werden sollen, zum Beispiel bei „Hol die Noten aus dem Notensystem“ oder „Zeig die Dateien aus bwSync&Share“, oder wenn ein Web-Aufruf, eine Datenbankverbindung oder eine Adresse eines anderen Systems gebraucht wird.
---

# Schnittstellen (Noten, bwSync&Share, Mail, E-Akte)

Andere Systeme erreichen Sie nur über `portal.adapters`. Die App hat im Betrieb kein Internet und braucht für diese Systeme kein Passwort. Das Portal prüft, wer die Person ist und was die App darf.

Was jedes System kann, steht in seiner Beschreibung im SDK: `platform_sdk/adapters/noten/README.md` und `platform_sdk/adapters/bwsync/README.md`. Für Mail und E-Akte gibt es noch keine Beschreibung; diese Systeme gibt es für Apps also noch nicht. Die Regeln des SDK stehen in der README des Portal-SDK (Abschnitt „Regeln“).

Sollen Dateien in bwSync&Share liegen, nutzen Sie `portal.adapters.bwsync` (Scope im Manifest). Sonst keine Schnittstelle.

## Regeln

| ID | Regel | Stufe |
|---|---|---|
| R-SCHN-1 | Mail, Noten und E-Akte nur über `portal.adapters`; keine eigenen Web-Aufrufe. | muss |
| R-SCHN-2 | Nur Aufrufe, Felder und Fehlertypen verwenden, die in der README des Systems (`platform_sdk/adapters/<system>/README.md`) stehen; nichts erfinden. | muss |
| R-SCHN-3 | Fehler der Schnittstelle werden nach `type` behandelt und der Person mit einem eigenen Text der App angezeigt; `detail` höchstens zusätzlich. | muss |
| R-SCHN-4 | Persönliche Daten aus Schnittstellen werden nicht gespeichert. | muss |
| R-SCHN-5 | Das Manifest nennt genau die benötigten Schnittstellen-Rechte. | muss |

## So geht es im JavaScript-Starter

1. Lesen Sie zuerst die Beschreibung des Systems in `platform_sdk/adapters/<system>/README.md` (zum Beispiel `platform_sdk/adapters/noten/README.md`). Nur Aufrufe, Felder und Fehler, die dort stehen, sind erlaubt. Steht etwas nicht dort, gibt es das nicht. Erfinden Sie nichts und fragen Sie nach.
2. Rufen Sie das System mit `portal.adapters.<system>.<aufruf>(req)` auf. Das `req` braucht der Client, um die angemeldete Person zu finden.
3. Es gibt keine Möglichkeit, Daten einer anderen Person abzufragen. Fragen Sie nicht danach.
4. Fehler entscheiden Sie **nach `err.type`** (und `err.status`), nie nach einem Text, und vergleichen mit der Konstante aus `platform_sdk/adapters/<system>/errors` bzw. `platform_sdk/adapters/transport.js` (zum Beispiel `errors.EXISTS`, `transport.BACKEND_UNAVAILABLE`). Den Text für die Person schreiben Sie selbst; welche Reaktion passt, steht in der Fehler-Tabelle der README. Zeigen Sie dazu die Nummer (`err.requestId`). `err.detail` ist für Logs und Fehlersuche, Sie dürfen ihn zusätzlich anzeigen, müssen aber nicht; er kann leer sein. Eine leere Seite ist nie die Antwort.
5. Speichern Sie keine persönlichen Daten aus Schnittstellen: nicht in Dateien, nicht in einer Datenbank, nicht im Speicher über die Anfrage hinaus.
6. Tragen Sie im `manifest.json` unter `adapters` genau die Rechte ein, die der Code nutzt, zum Beispiel `"noten:read"` (Skill `portal`).

```js
const { AdapterError } = require("../platform_sdk");
const transport = require("../platform_sdk/adapters/transport");

router.get("/", async (req, res) => {
  let grades = [];
  let problem = null;
  try {
    grades = (await portal.adapters.noten.listMyGrades(req)).items;
  } catch (err) {
    if (!(err instanceof AdapterError)) throw err;
    // eigener Text nach type; der Noten-Adapter kennt nur die allgemeinen Typen (README)
    let text = "Die Noten sind gerade nicht abrufbar. Bitte versuchen Sie es später erneut.";
    if (err.type === transport.BACKEND_TIMEOUT) {
      text = "Das Notensystem antwortet gerade zu langsam. Bitte versuchen Sie es gleich noch einmal.";
    }
    problem = { text, requestId: err.requestId };
  }
  const body = nunjucks.render("noten.njk", { grades, problem });
  res.type("html").send(
    await portal.layout({ title: "Meine Noten", body, current: portal.url("/"), user: req.portal.user }),
  );
});
```

Die Vorlage zeigt bei `problem` den Text `problem.text` samt Nummer. Bei einer leeren Liste zeigt sie „Es liegen noch keine Noten vor.“ Wie die Liste im Ergebnis heißt (hier `items`), steht in `platform_sdk/adapters/noten/README.md`.

Behandeln Sie jeden Fehlertyp, bei dem die Person etwas anderes tun soll, mit eigenem Text (Tabelle ‚empfohlene Reaktion' im README des Systems). Das SDK zeigt bei nicht behandelten Fehlern nur eine allgemeine Meldung – das ist ein Sicherheitsnetz, kein Ersatz für die eigene Behandlung.

Für Anzeigen gibt es fertige Hilfen ohne HTML in `platform_sdk/common/`: Zeitpunkte (`dates.formatDatetime`), Dateigrößen (`sizes.formatSize`) und Download-Header (`downloads.downloadHeaders`). Für bwSync&Share prüft `platform_sdk/adapters/bwsync/paths.js` Namen und Pfade und liefert die Pfadleiste als Daten (`breadcrumbs`); das HTML dazu baut die App.

Verbotene Wege, die `make lint` meldet: `fetch`, `axios`, `node-fetch`, `got`, `undici`, `node:http` und `node:https`.

## Tests

Im Test rufen Sie kein echtes System auf. Jedes System hat im SDK einen Fake, der sich wie das echte System verhält (gleiche Fehlertypen), zum Beispiel `FakeNoten` und `FakeBwSync`. Testen Sie auch den Fehlerfall: `fake.fail = [status, type]`.

```js
const { FakeNoten } = require("../platform_sdk/adapters/noten/testing");
const transport = require("../platform_sdk/adapters/transport");

const noten = new FakeNoten({ "student-test": [{ module: "Mathe 1", semester: "2026W", grade: "1,3", credits: 5 }] });
noten.install(portal); // nach dem Test: noten.uninstall()
noten.fail = [503, transport.BACKEND_UNAVAILABLE];
```

Im Entwicklungsmodus (`make dev`) liefert das Portal feste Testdaten aus `platform_sdk/adapters/noten/fixtures/`; dafür brauchen Sie nichts zu tun.

## Gut / schlecht

| Schlecht | Gut |
|---|---|
| `const axios = require("axios"); await axios.get("https://…")` | `await portal.adapters.noten.listMyGrades(req)` |
| Zugriff auf ein erfundenes Feld `matrikelnummer` | nur Felder aus `platform_sdk/adapters/noten/README.md` (`module`, `semester`, `grade`) |
| leere Seite bei „System nicht erreichbar“ | Seite mit eigenem Text und der Nummer `err.requestId` |
| `if (err.detail.includes("existiert"))` oder `err.type === "bwsync-exists"` | `err.type === errors.EXISTS` (Konstante aus `platform_sdk/adapters/bwsync/errors.js`) |
| gelesene Mails in einer eigenen SQLite-Datei abgelegt | Daten nur für die Anzeige verwenden, nichts ablegen |
| Noten werden gelesen, aber `noten:read` fehlt im Manifest | `"adapters": ["noten:read"]` im `manifest.json` |

## Prüfungen, die das absichern

A = automatisch, H = halbautomatisch (eine Person bestätigt), M = manuell (eine Person prüft). Die Prüfstellen stehen in `.agents/skills/README.md`.

| ID | Prüfung |
|---|---|
| R-SCHN-1 | A (`lint`: verbotene Importe; `konf`: kein Internetzugang im Betrieb) |
| R-SCHN-2 | A (`test`: die Schnittstelle prüft Antworten streng) |
| R-SCHN-3 | A (`test`) |
| R-SCHN-4 | H (`prf`: Skript meldet Schreibzugriffe, Person bestätigt) |
| R-SCHN-5 | A (`ci`: Vergleich Manifest ↔ Code) |

## Vor dem Abschluss

- [ ] Kein `fetch`, kein `axios`, kein eigener Web-Aufruf
- [ ] Jeder Aufruf, jedes Feld und jeder Fehlertyp steht in der README des Systems unter `platform_sdk/adapters/`
- [ ] Jeder Fehler wird nach `type` behandelt und mit eigenem Text angezeigt
- [ ] Nichts aus den Schnittstellen wird gespeichert
- [ ] `manifest.json` nennt genau die genutzten Rechte
- [ ] `make lint` und `make test` laufen ohne Fehler
