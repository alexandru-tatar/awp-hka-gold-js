"use strict";

/**
 * Prüfnachweis nach der Confluence-Vorlage „Vorlage: User Story, Akzeptanzkriterien und Prüfnachweis“
 * (Vorlage B: Prüfnachweis, Checkliste Code-Review).
 *
 * Der automatische Lauf füllt aus, was er belegen kann (Datum, Commit, Prüfweg, Nachweis, Tests, Lint,
 * Regeln, Commit-Nachrichten). Alles andere bleibt [OFFEN] oder [ ] und prüft der Reviewer.
 *
 * Aufruf:
 *   make check-skills / make check-starter  →  report.js schreibt den Bericht eines Selbsttests
 *   make check                              →  node tools/tests/pruefnachweis.js (gemeinsamer Nachweis)
 *
 * In der Pipeline (GitHub Actions) stehen Link zum Lauf und zum Pull Request automatisch im Nachweis.
 * Gleicher Aufbau wie tools/tests/pruefnachweis.py im Python-Golden-Master.
 */

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./common");

const SPRACHE = "JavaScript";
const REPORT_DIR = path.join(ROOT, "build", "pruefberichte");
const VORLAGE = "https://hka-awp.atlassian.net/wiki/spaces/HKA/pages/19922945";
const OFFEN = "[OFFEN]";
const TICKET_RE = /^HKA-\d+\b/;
const LAEUFE = [
  ["skills", "make check-skills", "Selbsttest Skills"],
  ["starter", "make check-starter", "Selbsttest Starter"],
];
const NEBENLAEUFE = [
  ["lint", "make lint"],
  ["test", "make test"],
];

// Abschnitte und Punkte genau wie in der Vorlage; der zweite Wert sagt, womit der Lauf den Punkt belegt
const CHECKLISTE = [
  ["Funktion", [
    ["Jedes Akzeptanzkriterium ist umgesetzt", null],
    ["Prüfweg je Kriterium ausgeführt, auch der Negativfall", null],
    ["Tests grün (lokal oder Pipeline)", "tests"],
  ]],
  ["Qualität", [
    ["Linter fehlerfrei (Ruff / ESLint)", "lint"],
    ["Konventionen und Code-Standards eingehalten", null],
    ["Code verständlich, keine toten oder auskommentierten Teile", null],
    ["Regeln aus AGENTS.md / Golden Master eingehalten", "regeln"],
  ]],
  ["Sicherheit", [
    ["Keine Secrets, Tokens oder Passwörter im Code", ["R-SEC-1", "R-SEC-2"]],
    ["Login und Rollen nur über das Portal", ["R-PORT-1", "R-PORT-2"]],
    ["Nur Testdaten und Mocks, kein Zugriff auf Produktivsysteme", null],
  ]],
  ["Doku", [
    ["README oder Confluence-Seite aktualisiert", null],
    ["Manifest angepasst, wenn relevant", "manifest"],
    ["Commit-Nachrichten beginnen mit der Ticket-ID", "commits"],
  ]],
];

const two = (n) => String(n).padStart(2, "0");
const datum = (d) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
const uhrzeit = (d) => `${datum(d)}, ${two(d.getHours())}:${two(d.getMinutes())} Uhr`;
const stempel = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");

function git(args) {
  const result = cp.spawnSync("git", args, { cwd: ROOT, encoding: "utf-8" });
  return result.error || result.status !== 0 ? null : result.stdout.trim();
}

/** Commit, Zustand und eigene Commits gegenüber dem Zielzweig (main oder GITHUB_BASE_REF). */
function gitInfo() {
  if (git(["rev-parse", "--git-dir"]) === null) return { stand: "unbekannt", commit: null, commits: null, basis: null };
  const commit = git(["rev-parse", "--short", "HEAD"]);
  if (commit === null) return { stand: "ohne Commit", commit: null, commits: null, basis: null };
  const sauber = !git(["status", "--porcelain"]);
  const ziel = process.env.GITHUB_BASE_REF || "main";
  const basis = [`origin/${ziel}`, ziel].find((ref) => git(["rev-parse", "--verify", "--quiet", ref]) !== null) ?? null;
  const log = basis ? git(["log", "--no-merges", "--format=%s", `${basis}..HEAD`]) : null;
  return {
    stand: `${commit} (${sauber ? "sauber" : "mit lokalen Änderungen"})`,
    commit,
    commits: log === null ? null : log.split("\n").filter(Boolean),
    basis,
  };
}

/** Angaben aus der Pipeline (GitHub Actions); lokal leer. */
function ciInfo() {
  const env = process.env;
  const ci = env.GITHUB_ACTIONS === "true" || env.CI === "true";
  const server = env.GITHUB_SERVER_URL || "https://github.com";
  const repo = env.GITHUB_REPOSITORY;
  const lauf = repo && env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const pr = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? "");
  return { ci, lauf, pullRequest: env.PR_URL || (repo && pr ? `${server}/${repo}/pull/${pr[1]}` : null) };
}

function laufZeile(bericht) {
  return `${bericht.ergebnis} · ${bericht.pruefungen} Prüfungen (${bericht.einzelfaelle} Einzelfälle) · ` +
    `${bericht.fehler} Fehler · ${bericht.uebersprungen} übersprungen`;
}

/** Bewertet einen Punkt der Checkliste: [x] nur, wenn der Lauf ihn vollständig belegt. */
function bewerte(beleg, ctx) {
  const reviewer = { ok: false, hinweis: "prüft der Reviewer" };
  const starter = ctx.berichte.find((b) => b.art === "starter");
  if (beleg === null) return reviewer;

  if (beleg === "tests") {
    const teile = ctx.berichte.map((b) => ({ name: LAEUFE.find(([art]) => art === b.art)[2], ok: b.fehler === 0, text: b.ergebnis }));
    const test = ctx.nebenlaeufe.test;
    if (test) teile.push({ name: "make test", ok: test.ok, text: test.ok ? "bestanden" : "FEHLER" });
    const text = teile.map((t) => `${t.name} ${t.text}`).join(", ");
    if (teile.some((t) => !t.ok)) return { ok: false, hinweis: `✘ ${text}` };
    if (!test) return { ok: false, hinweis: `teilweise automatisch: ${text}; App-Tests (make test) nur bei make check` };
    return { ok: true, hinweis: `automatisch: ${text}` };
  }

  if (beleg === "lint") {
    const lint = ctx.nebenlaeufe.lint;
    if (!lint) return { ok: false, hinweis: "make lint läuft nur bei make check" };
    return lint.ok ? { ok: true, hinweis: "automatisch: make lint bestanden" } : { ok: false, hinweis: "✘ make lint meldet Fehler" };
  }

  if (beleg === "regeln") {
    if (!starter) return { ok: false, hinweis: "Skills stimmig; Einhaltung im Starter nur mit make check-starter" };
    const regeln = Object.entries(starter.regeln);
    const geprueft = regeln.filter(([, o]) => o === "passed" || o === "failed");
    const fehler = regeln.filter(([, o]) => o === "failed").map(([id]) => id);
    if (fehler.length) return { ok: false, hinweis: `✘ Fehler bei ${fehler.join(", ")}` };
    return { ok: false, hinweis: `teilweise automatisch: ${geprueft.length} von ${regeln.length} Einzelregeln bestanden; übrige prüft der Reviewer` };
  }

  if (beleg === "manifest") {
    if (!starter) return reviewer;
    const o = starter.regeln["R-PORT-4"];
    return { ok: false, hinweis: `prüft der Reviewer; Schema automatisch geprüft (R-PORT-4 ${o === "passed" ? "bestanden" : "✘ Fehler"})` };
  }

  if (beleg === "commits") {
    const { commits, basis } = ctx.git;
    if (commits === null) return { ok: false, hinweis: "nicht prüfbar (kein Zielzweig main gefunden)" };
    if (!commits.length) return { ok: false, hinweis: `nicht prüfbar (keine eigenen Commits gegenüber ${basis})` };
    const ohne = commits.filter((s) => !TICKET_RE.test(s));
    if (ohne.length) return { ok: false, hinweis: `✘ ${ohne.length} von ${commits.length} ohne Ticket-ID, z. B. „${ohne[0]}“` };
    return { ok: true, hinweis: `automatisch: alle ${commits.length} Commits gegenüber ${basis}` };
  }

  // Liste von Regel-IDs: nur der Starter prüft, ob die App sie einhält
  if (!starter) return { ok: false, hinweis: "nur mit make check-starter" };
  const stand = beleg.map((id) => [id, starter.regeln[id]]);
  const fehler = stand.filter(([, o]) => o === "failed").map(([id]) => id);
  if (fehler.length) return { ok: false, hinweis: `✘ Fehler bei ${fehler.join(", ")}` };
  if (stand.every(([, o]) => o === "passed")) return { ok: true, hinweis: `automatisch: ${beleg.join(", ")} bestanden` };
  return { ok: false, hinweis: "prüft der Reviewer (nicht vollständig automatisch geprüft)" };
}

/** Block „Vorlage B: Prüfnachweis“: gleiche Zeilen wie in Confluence, belegbare Felder ausgefüllt. */
function vorlageB(ctx) {
  const nachweis = [ctx.ci.lauf, `Prüfbericht ${ctx.datei}`].filter(Boolean).join(" · ");
  return [
    "Prüfnachweis (vom Reviewer ausfüllen, alle [OFFEN] ersetzen)",
    `Geprüft von: ${OFFEN}`,
    `Datum: ${datum(ctx.zeit)}`,
    `Version/Commit: ${ctx.git.stand}`,
    `Pull Request: ${ctx.ci.pullRequest ?? OFFEN}`,
    `Prüfweg: automatisch (${ctx.befehle[0]}${ctx.befehle.length > 1 ? `: ${ctx.befehle.slice(1).join(", ")}` : ""})`,
    `Ergebnis je Akzeptanzkriterium: ${OFFEN} (AK1 erfüllt / nicht erfüllt / nicht prüfbar, AK2 …)`,
    `Nachweis (Link Pipeline / Protokoll / Screenshot): ${nachweis} · Gesamtergebnis ${ctx.ergebnis}`,
    `Auf eigenem Rechner ausgeführt: ${ctx.ci.ci ? "nein (Pipeline)" : "ja"}`,
    `Code-Review-Checkliste durchgegangen: ${OFFEN} (ja / nein)`,
  ];
}

function checkliste(ctx) {
  const out = [];
  for (const [abschnitt, punkte] of CHECKLISTE) {
    out.push({ abschnitt, punkte: punkte.map(([text, beleg]) => ({ text, ...bewerte(beleg, ctx) })) });
  }
  return out;
}

/**
 * Erzeugt Markdown (Datei) und Textzeilen (Konsole).
 * ctx: { titel, befehle, berichte: [Zusammenfassung aus report.js], nebenlaeufe: {lint?, test?}, zeit, datei }
 */
function render(ctx) {
  ctx.git ??= gitInfo();
  ctx.ci ??= ciInfo();
  const neben = Object.values(ctx.nebenlaeufe);
  const ok = ctx.berichte.every((b) => b.fehler === 0) && neben.every((l) => l.ok);
  ctx.ergebnis = ok ? "BESTANDEN" : "NICHT BESTANDEN";
  const block = vorlageB(ctx);
  const liste = checkliste(ctx);
  const md = [];

  md.push(`# Prüfnachweis · Golden Master ${SPRACHE} · ${ctx.titel}`, "");
  md.push("| Feld | Inhalt |", "| --- | --- |");
  md.push(`| Erzeugt mit | \`${ctx.befehle[0]}\` |`);
  md.push(`| Zeitpunkt | ${uhrzeit(ctx.zeit)} |`);
  md.push(`| Repository | ${path.basename(ROOT)} · Stand ${ctx.git.stand} |`);
  md.push(`| Ausgeführt | ${ctx.ci.ci ? `Pipeline${ctx.ci.lauf ? ` (${ctx.ci.lauf})` : ""}` : "auf eigenem Rechner"} |`);
  md.push(`| Gesamtergebnis | **${ctx.ergebnis}** |`);
  md.push(`| Vorlage | [Vorlage: User Story, Akzeptanzkriterien und Prüfnachweis](${VORLAGE}) – Vorlage B und Checkliste Code-Review |`);
  md.push("");

  md.push("## 1. Prüfnachweis (Vorlage B)", "");
  md.push("Sobald das Ticket auf **In Review** geht: diesen Block als Kommentar ins Jira-Ticket kopieren und den Reviewer zuweisen. " +
    "Der Reviewer **bearbeitet diesen Kommentar** und ersetzt alle [OFFEN].", "");
  md.push("```text", ...block, "```", "");

  md.push("## 2. Checkliste Code-Review", "");
  md.push("`[x]` belegt der automatische Lauf, der Reviewer bestätigt. `[ ]` prüft der Reviewer. ✘ markiert einen Fehler im Lauf.", "");
  for (const { abschnitt, punkte } of liste) {
    md.push(`**${abschnitt}**`, "");
    for (const p of punkte) md.push(`- [${p.ok ? "x" : " "}] ${p.text} — ${p.hinweis}`);
    md.push("");
  }

  md.push("## 3. Ergebnis der automatischen Läufe", "");
  md.push("| Lauf | Ergebnis |", "| --- | --- |");
  for (const b of ctx.berichte) md.push(`| \`${LAEUFE.find(([art]) => art === b.art)[1]}\` | ${laufZeile(b)} |`);
  for (const [art, befehl] of NEBENLAEUFE) {
    const lauf = ctx.nebenlaeufe[art];
    if (lauf) md.push(`| \`${befehl}\` | ${lauf.ok ? "BESTANDEN" : "NICHT BESTANDEN"} |`);
  }
  md.push("");

  let nummer = 3;
  for (const [art, befehl] of NEBENLAEUFE) {
    const lauf = ctx.nebenlaeufe[art];
    if (lauf && !lauf.ok) {
      nummer += 1;
      md.push(`## ${nummer}. Ausgabe von \`${befehl}\` (letzte Zeilen)`, "", "```text", ...lauf.ausgabe, "```", "");
    }
  }
  for (const b of ctx.berichte) {
    nummer += 1;
    md.push(`## ${nummer}. ${b.titel}`, "", "```text", ...b.bericht, "```", "");
  }

  const konsole = ["", " Prüfnachweis (Vorlage B) – in den Jira-Kommentar kopieren", " " + "─".repeat(60), ...block.map((z) => ` ${z}`), ""];
  konsole.push(" Checkliste Code-Review ([x] automatisch belegt)");
  for (const { abschnitt, punkte } of liste) {
    konsole.push(`   ${abschnitt}`);
    for (const p of punkte) konsole.push(`   [${p.ok ? "x" : " "}] ${p.text} — ${p.hinweis}`);
  }
  return { markdown: md.join("\n"), konsole, ok };
}

/** Schreibt Bericht mit Zeitstempel und als „-aktuell“; gibt den Pfad der Datei mit Zeitstempel zurück. */
function schreibe(slug, zeit, inhalt, endung = "md") {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${slug}-${stempel(zeit)}.${endung}`);
  fs.writeFileSync(file, inhalt, "utf-8");
  fs.writeFileSync(path.join(REPORT_DIR, `${slug}-aktuell.${endung}`), inhalt, "utf-8");
  return file;
}

/** Datei des Berichts zuerst festlegen, damit der Nachweis auf sie verweisen kann. */
function dateiFuer(slug, zeit) {
  return rel(path.join(REPORT_DIR, `${slug}-${stempel(zeit)}.md`));
}

function laufe(befehl) {
  const [cmd, ...args] = befehl.split(" ");
  const result = cp.spawnSync(cmd, ["--no-print-directory", ...args], { cwd: ROOT, encoding: "utf-8", env: { ...process.env, FORCE_COLOR: "0" } });
  const ausgabe = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd().split("\n").slice(-30);
  return { ok: result.status === 0, ausgabe };
}

/** make check: beide Selbsttests zusammenführen, make lint und make test ausführen, gemeinsamen Nachweis schreiben. */
function gesamt() {
  const zeit = new Date();
  const git = gitInfo();
  const berichte = [];
  const fehlend = [];
  for (const [art, befehl] of LAEUFE) {
    const file = path.join(REPORT_DIR, `pruefbericht-${art}-aktuell.json`);
    if (!fs.existsSync(file)) {
      fehlend.push(befehl);
      continue;
    }
    const bericht = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (bericht.stand !== git.stand) fehlend.push(`${befehl} (Bericht gehört zu Stand ${bericht.stand})`);
    else berichte.push(bericht);
  }
  if (fehlend.length) {
    console.error(` Prüfnachweis nicht erstellt. Zuerst ausführen: ${fehlend.join(", ")}`);
    return 1;
  }
  const nebenlaeufe = Object.fromEntries(NEBENLAEUFE.map(([art, befehl]) => [art, laufe(befehl)]));
  const datei = dateiFuer("pruefnachweis", zeit);
  const befehle = ["make check", ...LAEUFE.map(([, b]) => b), ...NEBENLAEUFE.map(([, b]) => b)];
  const { markdown, konsole, ok } = render({ titel: "Gesamt", befehle, berichte, nebenlaeufe, zeit, datei, git });
  const file = schreibe("pruefnachweis", zeit, markdown);
  for (const zeile of konsole) console.log(zeile);
  console.log("");
  console.log(` Gesamtergebnis: ${ok ? "BESTANDEN" : "NICHT BESTANDEN"}`);
  console.log(` Prüfnachweis gespeichert: ${rel(file)} (auch pruefnachweis-aktuell.md)`);
  console.log("");
  return ok ? 0 : 1;
}

module.exports = { dateiFuer, gitInfo, render, schreibe };

if (require.main === module) process.exitCode = gesamt();
