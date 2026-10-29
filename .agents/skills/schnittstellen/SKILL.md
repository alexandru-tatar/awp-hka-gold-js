---
name: schnittstellen
description: Verwenden, wenn Daten aus Mail, Noten oder E-Akte geholt oder gesendet werden sollen, zum Beispiel bei „Hol die Noten aus dem Notensystem“, oder wenn ein Web-Aufruf, eine Datenbankverbindung oder eine Adresse eines anderen Systems gebraucht wird.
---

# Schnittstellen (Mail, Noten, E-Akte)

Andere Systeme erreichen Sie nur über `portal.adapters`. Die App hat im Betrieb kein Internet und braucht für diese Systeme kein Passwort. Das Portal prüft, wer die Person ist und was die App darf.

## Regeln

| ID | Regel | Stufe |
|---|---|---|
| R-SCHN-1 | Mail, Noten und E-Akte nur über `portal.adapters`; keine eigenen Web-Aufrufe. | muss |
| R-SCHN-2 | Nur Felder und Adressen verwenden, die in `docs/schnittstellen/*.md` stehen; nichts erfinden. | muss |
| R-SCHN-3 | Fehler der Schnittstelle werden der Person mit dem mitgelieferten Text angezeigt. | muss |
| R-SCHN-4 | Persönliche Daten aus Schnittstellen werden nicht gespeichert. | muss |
| R-SCHN-5 | Das Manifest nennt genau die benötigten Schnittstellen-Rechte. | muss |

## So geht es im JavaScript-Starter

1. Lesen Sie zuerst die Beschreibung in `docs/schnittstellen/<system>.md` (`noten.md`, `mail.md`, `eakte.md`). Nur Aufrufe, Felder und Fehler, die dort stehen, sind erlaubt. Steht etwas nicht dort, gibt es das nicht. Erfinden Sie nichts und fragen Sie nach.
2. Rufen Sie das System mit `portal.adapters.<system>.<aufruf>(req)` auf. Das `req` braucht der Client, um die angemeldete Person zu finden.
3. Es gibt keine Möglichkeit, Daten einer anderen Person abzufragen. Fragen Sie nicht danach.
4. Fehler zeigen Sie der Person mit dem mitgelieferten Text (`err.detail`) und der Nummer (`err.requestId`). Eine leere Seite ist nie die Antwort.
5. Speichern Sie keine persönlichen Daten aus Schnittstellen: nicht in Dateien, nicht in einer Datenbank, nicht im Speicher über die Anfrage hinaus.
6. Tragen Sie im `manifest.json` unter `adapters` genau die Rechte ein, die der Code nutzt, zum Beispiel `"noten:read"` (Skill `portal`).

```js
const { AdapterError } = require("../platform_sdk");

router.get("/", async (req, res) => {
  let grades = [];
  let problem = null;
  try {
    grades = await portal.adapters.noten.listMyGrades(req);
  } catch (err) {
    if (!(err instanceof AdapterError)) throw err;
    problem = { detail: err.detail, requestId: err.requestId };
  }
  const body = nunjucks.render("noten.njk", { grades, problem });
  res.type("html").send(
    await portal.layout({ title: "Meine Noten", body, current: portal.url("/"), user: req.portal.user }),
  );
});
```

Die Vorlage zeigt bei `problem` den Text `problem.detail` samt Nummer. Bei einer leeren Liste zeigt sie „Es liegen noch keine Noten vor.“

Verbotene Wege, die `make lint` meldet: `fetch`, `axios`, `node-fetch`, `got`, `undici`, `node:http` und `node:https`.

## Gut / schlecht

| Schlecht | Gut |
|---|---|
| `const axios = require("axios"); await axios.get("https://…")` | `await portal.adapters.noten.listMyGrades(req)` |
| Zugriff auf ein erfundenes Feld `matrikelnummer` | nur Felder aus `docs/schnittstellen/noten.md` (`module`, `semester`, `grade`) |
| leere Seite bei „System nicht erreichbar“ | Seite mit dem Text `err.detail` und der Nummer `err.requestId` |
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
- [ ] Jeder Aufruf und jedes Feld steht in `docs/schnittstellen/*.md`
- [ ] Jeder Fehler wird mit seinem Text angezeigt
- [ ] Nichts aus den Schnittstellen wird gespeichert
- [ ] `manifest.json` nennt genau die genutzten Rechte
- [ ] `make lint` und `make test` laufen ohne Fehler
