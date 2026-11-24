"use strict";

// Prüfnachweis aus `make check`: Block im Format von Vorlage B 0.3 (HKA-91).
// Gleiche erwartete Zeilen wie in tests/test_pruefnachweis.py im Python-Golden-Master.

const { render, vorlageB } = require("../tools/tests/pruefnachweis");

const PR = "https://github.com/beispiel/app/pull/7";

const erwartet = (pullRequestZeile) => [
  "Prüfnachweis",
  "Ergebnis: abgenommen / zurück an Umsetzung",
  "Geprüft von, am:",
  pullRequestZeile,
  "AK1: ok / nicht ok / nur gelesen – geprüft mit: <Test, Befehl oder Link>",
  "AK2: ok / nicht ok / nur gelesen – geprüft mit: <Test, Befehl oder Link>",
  "Befunde: <[Muss] oder [Sollte] mit Datei oder Stelle, sonst „keine“>",
];

const kontext = ({ pullRequest = null, commit = "abc1234" } = {}) => ({
  titel: "Gesamt",
  befehle: ["make check"],
  berichte: [],
  nebenlaeufe: {},
  zeit: new Date(2026, 10, 24, 15, 0),
  datei: "build/pruefberichte/pruefnachweis-2026-11-24_15-00-00.md",
  git: { stand: `${commit} (sauber)`, commit, commits: null, basis: null },
  ci: { ci: pullRequest !== null, lauf: null, pullRequest },
});

test("ohne Pull Request bleibt das Feld leer, der Commit steht da", () => {
  expect(vorlageB(kontext())).toEqual(erwartet("Pull Request: (Commit abc1234)"));
});

test("ohne Commit steht unbekannt", () => {
  expect(vorlageB(kontext({ commit: null }))[3]).toBe("Pull Request: (Commit unbekannt)");
});

test("die Pipeline trägt Pull Request und Commit ein", () => {
  expect(vorlageB(kontext({ pullRequest: PR }))).toEqual(erwartet(`Pull Request: ${PR} (Commit abc1234)`));
});

test("Nachweis ohne [OFFEN]-Platzhalter und mit dem Block", () => {
  const { markdown, konsole } = render(kontext());
  expect(markdown).not.toContain("[OFFEN]");
  expect(konsole.join("\n")).not.toContain("[OFFEN]");
  expect(markdown).toContain(["```text", ...erwartet("Pull Request: (Commit abc1234)"), "```"].join("\n"));
  expect(markdown).toContain("legt der Reviewer als Kommentar im Jira-Ticket an");
});
