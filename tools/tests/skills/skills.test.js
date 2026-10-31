"use strict";

/**
 * Selbsttests der Skills in `.agents/skills/`.
 *
 * Prüft Form und Zusammenhang der Skills, ohne eine KI aufzurufen: Kopf, Regeltabellen,
 * Prüfungen, Zählung im README, Beispiele (JavaScript, JSON), Verweise auf Befehle und Dateien,
 * Übereinstimmung mit `eslint.config.js` und mit dem Python-Golden-Master.
 * Ob die KI die Skills befolgt, prüft das Prüfskript mit der Testaufgabe (HKA-30).
 *
 * Aufruf: make check-skills
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  ROOT, SKILLS_DIR, PY_SKILLS_DIR, SKILL_NAMES, RULE_PREFIX, CATEGORIES, ICONS,
  bannedModules, codeBlocks, eslintConfig, isBanned, loadSkill, makeTargets, manifestErrors, prose, pruefung, readText, tableRows,
} = require("../common");

const SKILLS = Object.fromEntries(SKILL_NAMES.map((name) => [name, loadSkill(SKILLS_DIR, name)]));
const README = fs.readFileSync(path.join(SKILLS_DIR, "README.md"), "utf-8");
const CATALOG = fs.readFileSync(path.join(SKILLS_DIR, "pipeline-fehler", "fehlercodes.md"), "utf-8");
const STAGES = new Set(["lint", "test", "ci", "konf", "prf"]);

// Befehle, die in den Skills stehen, aber nicht im Makefile des Starters
const MAKE_ELSEWHERE = new Set(["sdk-release"]); // Portal-Repository
const MAKE_PLANNED = new Set(["template-update"]); // Architekturvorschlag 07 §1, noch nicht umgesetzt

// Dateien, auf die die Skills verweisen, die es im Starter noch nicht gibt (Phase 2)
const PATHS_PLANNED = new Set([
  "AGENTS.md", "AGENTS.local.md", ".devcontainer/",
  "docs/schnittstellen/noten.md", "docs/schnittstellen/mail.md", "docs/schnittstellen/eakte.md",
  "docs/fehlercodes.md", "tools/a11y-structural.mjs", "build/a11y/",
]);

/** Einträge einer ESLint-Regel mit Fehlerstufe (ohne die Blöcke, die sie ausschalten). */
const restricted = (rule) =>
  eslintConfig().flatMap((b) => (Array.isArray(b.rules?.[rule]) ? b.rules[rule].slice(1) : []));

const rules = (skill) => skill.table("Regeln");
const checks = (skill) => skill.table("Prüfungen");
const perSkill = (fn) => (name) => fn(SKILLS[name], name);
const cases = { cases: SKILL_NAMES };

// ── Kopf ─────────────────────────────────────────────────────────────────────

pruefung("Kopf und Aufbau", "Genau die sieben Skills sind vorhanden", [], () => {
  const found = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, "SKILL.md")))
    .map((e) => e.name).sort();
  assert.deepEqual(found, [...SKILL_NAMES].sort());
});

pruefung("Kopf und Aufbau", "Kopf: name passt zum Ordner, description „Verwenden …“", [], perSkill((skill, name) => {
  const { meta } = skill;
  assert.deepEqual(Object.keys(meta).sort(), ["description", "name"]);
  assert.equal(meta.name, name);
  assert.match(meta.name, /^[a-z0-9-]{1,64}$/);
  assert.ok(meta.description.startsWith("Verwenden"), "description beginnt nicht mit „Verwenden“");
  assert.ok(meta.description.length >= 50 && meta.description.length <= 1024, "description: Länge");
}), cases);

pruefung("Kopf und Aufbau", "Beschreibungen sind eindeutig", [], () => {
  const descriptions = Object.values(SKILLS).map((s) => s.meta.description);
  assert.equal(new Set(descriptions).size, descriptions.length);
});

// ── Aufbau ───────────────────────────────────────────────────────────────────

pruefung("Kopf und Aufbau", "Pflichtabschnitte vorhanden", [], perSkill((skill) => {
  for (const prefix of ["Regeln", "Gut / schlecht", "Prüfungen, die das absichern", "Vor dem"]) skill.section(prefix);
  assert.ok(skill.body.trimStart().startsWith("# "), "Titel (# …) fehlt");
}), cases);

pruefung("Kopf und Aufbau", "Abschnitt „So geht es im JavaScript-Starter“", [], perSkill((skill) => {
  skill.section("So geht es im JavaScript-Starter");
}), { cases: SKILL_NAMES.filter((n) => n !== "pipeline-fehler") });

pruefung("Kopf und Aufbau", "Prüfliste endet mit make lint und make test", [], perSkill((skill, name) => {
  const items = [...skill.section("Vor dem").matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]);
  assert.ok(items.length >= 4, "weniger als vier Punkte");
  if (name !== "pipeline-fehler") assert.ok(items.at(-1).includes("`make lint` und `make test` laufen ohne Fehler"));
}), cases);

pruefung("Kopf und Aufbau", "Tabelle „Gut / schlecht“ mit mindestens vier Paaren", [], perSkill((skill) => {
  const rows = skill.table("Gut / schlecht");
  assert.ok(rows.length >= 4, "weniger als vier Paare");
  assert.ok(rows.every((r) => r.length === 2 && r[0] && r[1]), "Paar unvollständig");
}), cases);

// ── Regeln und Prüfungen ─────────────────────────────────────────────────────

pruefung("Regeln und Prüfungen", "Regel-IDs fortlaufend, Stufe „muss“ oder „soll“", [], perSkill((skill, name) => {
  const ids = rules(skill).map((r) => r[0]);
  assert.deepEqual(ids, ids.map((_, i) => `R-${RULE_PREFIX[name]}-${i + 1}`));
  assert.ok(rules(skill).every((r) => ["muss", "soll"].includes(r[2])), "Stufe weder „muss“ noch „soll“");
}), cases);

pruefung("Regeln und Prüfungen", "Jede Regel hat Prüfart (A/H/M) und Prüfstelle", [], perSkill((skill) => {
  assert.deepEqual(checks(skill).map((r) => r[0]), rules(skill).map((r) => r[0]));
  for (const [id, check] of checks(skill)) {
    assert.match(check, /^[AHM] \(/, `${id}: Prüfart A/H/M fehlt`);
    const stages = [...check.matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
    assert.ok(stages.some((s) => STAGES.has(s)), `${id}: Prüfstelle fehlt`);
  }
}), cases);

pruefung("Regeln und Prüfungen", "Zählung im README stimmt (40 / 33 muss / 7 soll)", [], () => {
  const rows = Object.fromEntries(tableRows(README.split("## Zuordnung der Skills zu den Regeln")[1]).map((r) => [r[0].replaceAll("`", ""), r]));
  let [total, must, should] = [0, 0, 0];
  for (const name of SKILL_NAMES) {
    const levels = rules(SKILLS[name]).map((r) => r[2]);
    const row = rows[name];
    const count = Number(/\((\d+)\)/.exec(row[2])[1]);
    assert.equal(count, levels.length, name);
    assert.equal(Number(row[3]), levels.filter((l) => l === "muss").length, name);
    assert.equal(Number(row[4]), levels.filter((l) => l === "soll").length, name);
    total += count;
    must += levels.filter((l) => l === "muss").length;
    should += levels.filter((l) => l === "soll").length;
  }
  const summe = rows["**Summe**"];
  assert.deepEqual(summe.slice(2, 5), [`**${total}**`, `**${must}**`, `**${should}**`]);
  assert.deepEqual([total, must, should], [40, 33, 7]);
  assert.ok(README.includes(`**${total} Einzelregeln**`));
});

pruefung("Regeln und Prüfungen", "README nennt alle Skill-Dateien", [], () => {
  for (const name of SKILL_NAMES) assert.ok(README.includes(`${name}/SKILL.md`), name);
  assert.ok(README.includes("pipeline-fehler/fehlercodes.md"));
});

// ── Beispiele ────────────────────────────────────────────────────────────────

pruefung("Beispiele", "JavaScript-Beispiele sind gültiger Code", [], perSkill((skill) => {
  for (const block of codeBlocks(skill.text, "js")) {
    // Wie ein CommonJS-Modul übersetzen, ohne etwas auszuführen
    vm.compileFunction(block, ["require", "module", "exports", "__filename", "__dirname"]);
  }
}), cases);

pruefung("Beispiele", "JavaScript-Beispiele ohne verbotene Importe", ["R-SCHN-1", "R-PORT-1"], perSkill((skill, name) => {
  const banned = bannedModules();
  for (const block of codeBlocks(skill.text, "js")) {
    const modules = [...block.matchAll(/require\(\s*["']([^"']+)["']\s*\)|from\s+["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);
    for (const module_ of modules) assert.ok(!isBanned(module_, banned), `${name}: ${module_}`);
  }
}), cases);

pruefung("Beispiele", "Manifest-Beispiel entspricht dem Schema", ["R-PORT-4"], () => {
  const blocks = codeBlocks(SKILLS.portal.text, "json");
  assert.ok(blocks.length > 0, "kein Manifest-Beispiel");
  for (const block of blocks) assert.deepEqual(manifestErrors(JSON.parse(block)), []);
});

pruefung("Beispiele", "Kategorien und Icons wie im Manifest-Schema", ["R-PORT-4"], () => {
  const table = Object.fromEntries(SKILLS.portal.table("So geht es").map((r) => [r[0].replaceAll("`", ""), r[1]]));
  const names = (cell) => new Set([...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  assert.deepEqual(names(table.category), CATEGORIES);
  assert.deepEqual(names(table["menu.icon"]), ICONS);
});

pruefung("Beispiele", "HTML-Beispiele ohne Rahmen, externe Adressen, „/“-Links", ["R-DES-3", "R-DES-4", "R-PORT-3"], perSkill((skill) => {
  for (const block of codeBlocks(skill.text, "html")) {
    assert.ok(!/(src|href)="(https?:)?\/\//.test(block), "externe Adresse");
    assert.ok(!block.includes("<html") && !block.includes("<body"), "eigener Seitenrahmen");
    assert.ok(!block.includes('href="/'), "Adresse beginnt mit „/“");
  }
}), cases);

pruefung("Beispiele", "CSS-Beispiele nur mit Variablen des Portals", ["R-DES-1"], () => {
  const gut = SKILLS.design.table("Gut / schlecht").map((r) => r[1]);
  assert.ok(!gut.some((g) => /#[0-9a-fA-F]{3,6}\b|rgb\(/.test(g)), "Farbwert im guten Beispiel");
});

// ── Verweise ─────────────────────────────────────────────────────────────────

const allSkillText = () => Object.values(SKILLS).map((s) => s.text).join("\n") + README + CATALOG;

pruefung("Verweise", "Jeder genannte make-Befehl existiert", [], () => {
  const mentioned = new Set([...allSkillText().matchAll(/`make ([a-z][a-z-]*)/g)].map((m) => m[1]));
  const targets = makeTargets();
  const missing = [...mentioned].filter((m) => !targets.has(m) && !MAKE_ELSEWHERE.has(m) && !MAKE_PLANNED.has(m));
  assert.deepEqual(missing, [], `Befehle fehlen im Makefile: ${missing}`);
});

pruefung("Verweise", "Liste der geplanten Befehle ist aktuell", [], () => {
  // Schlägt fehl, sobald ein geplanter Befehl umgesetzt ist: dann aus MAKE_PLANNED streichen.
  const targets = makeTargets();
  assert.deepEqual([...MAKE_PLANNED].filter((m) => targets.has(m)), []);
});

pruefung("Verweise", "Jeder genannte Pfad existiert (außer geplanten)", [], () => {
  const text = allSkillText();
  const found = new Set([
    ...[...text.matchAll(/`((?:src|tests|platform_sdk|docs|tools|build|\.devcontainer)\/[^`*<>\s]*)`/g)].map((m) => m[1]),
    ...[...text.matchAll(/`(manifest\.json|package\.json|eslint\.config\.js|Makefile|Dockerfile|AGENTS(?:\.local)?\.md)`/g)].map((m) => m[1]),
  ]);
  const missing = [...found].filter((c) => !fs.existsSync(path.join(ROOT, c)) && !PATHS_PLANNED.has(c));
  assert.deepEqual(missing, [], `Verweise ohne Datei: ${missing}`);
});

pruefung("Verweise", "Jeder genannte Fehlercode steht im Katalog", ["R-PF-3"], () => {
  const catalog = new Set([...CATALOG.matchAll(/^\| (PF-\d{3}) \|/gm)].map((m) => m[1]));
  assert.ok(catalog.size >= 15, "Katalog zu klein");
  const mentioned = new Set(Object.values(SKILLS).flatMap((s) => s.text.match(/PF-\d{3}/g) ?? []));
  assert.deepEqual([...mentioned].filter((c) => !catalog.has(c)), []);
});

pruefung("Verweise", "Fehlerkatalog verweist nur auf vorhandene Skills", [], () => {
  for (const m of CATALOG.matchAll(/Skill[s]? (?:zur Regel laden )?\(?`([a-z-]+)`/g)) assert.ok(SKILL_NAMES.includes(m[1]), m[1]);
});

pruefung("Verweise", "Verweise auf andere Skills sind gültig", [], () => {
  for (const m of allSkillText().matchAll(/Skill `([a-z-]+)`/g)) assert.ok(SKILL_NAMES.includes(m[1]), m[1]);
});

// ── Übereinstimmung mit dem Code des Starters ────────────────────────────────

pruefung("Übereinstimmung mit dem Starter", "Verbotene Web-Bibliotheken meldet ESLint", ["R-SCHN-1"], () => {
  const sentence = /Verbotene Wege, die `make lint` meldet: ([^\n]+?)\./.exec(SKILLS.schnittstellen.text);
  const named = [...sentence[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.ok(named.length > 0, "Aufzählung fehlt");
  const banned = bannedModules();
  const globals = new Set(restricted("no-restricted-globals").map((g) => g.name));
  assert.deepEqual(named.filter((n) => !isBanned(n, banned) && !globals.has(n)), []);
});

pruefung("Übereinstimmung mit dem Starter", "Verbotene Login-Bibliotheken meldet ESLint", ["R-PORT-1"], () => {
  const item = /\*\*Keine Login-Bibliotheken:\*\* ([^\n]+)/.exec(SKILLS.portal.text)[1];
  const named = [...item.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.ok(named.length > 0, "Aufzählung fehlt");
  const banned = bannedModules();
  assert.deepEqual(named.filter((n) => !isBanned(n, banned)), []);
});

pruefung("Übereinstimmung mit dem Starter", "Cookies meldet ESLint", ["R-PORT-6"], () => {
  const properties = restricted("no-restricted-properties").map((p) => `${p.object}.${p.property}`);
  for (const wanted of ["res.cookie", "req.cookies", "req.session"]) assert.ok(properties.includes(wanted), wanted);
  assert.ok(isBanned("express-session") && isBanned("cookie-parser"));
});

pruefung("Übereinstimmung mit dem Starter", "Node-Version im README wie in .nvmrc", [], () => {
  const major = readText(".nvmrc").trim();
  assert.ok(README.includes(`Node ${major}`), `„Node ${major}“ fehlt im README der Skills`);
});

// ── Antworten der KI (Beispiele in den Skills) ───────────────────────────────

const FORBIDDEN_IN_ANSWER = ["abschalten", "umgehen", "überspringen", "noqa", "--no-verify", "allow_failure", "skip", "disable", "ignore the check"];

const quote = (text) => text.split("\n").filter((l) => l.startsWith(">")).map((l) => l.slice(1).trim()).join("\n");

pruefung("Beispielantworten der KI", "Pipeline: Ursache, Code, nächster Schritt, keine Verbotswörter", ["R-PF-1", "R-PF-2", "R-PF-3", "R-PF-4"], () => {
  const answer = quote(SKILLS["pipeline-fehler"].text.split("### Beispielantwort")[1].split("## Gut")[0]);
  assert.ok(answer, "keine Beispielantwort");
  const lowered = answer.toLowerCase();
  assert.deepEqual(FORBIDDEN_IN_ANSWER.filter((w) => lowered.includes(w)), [], "R-PF-4: Verbotswort in der Antwort");
  assert.match(answer, /PF-\d{3}/, "R-PF-3: Fehlercode fehlt");
  assert.ok(/`make (lint|test)`/.test(answer) || /\(Zeile \d+\)|:\d+/.test(answer), "R-PF-2: nächster Schritt fehlt");
  for (const label of ["Was passiert ist", "Warum das wichtig ist", "Was Sie tun"]) assert.ok(answer.includes(label), `R-PF-1: „${label}“ fehlt`);
});

pruefung("Beispielantworten der KI", "Pipeline: Verbotsliste im Skill vollständig", ["R-PF-4"], () => {
  const text = SKILLS["pipeline-fehler"].text;
  assert.deepEqual(FORBIDDEN_IN_ANSWER.filter((w) => !text.includes(w)), []);
});

pruefung("Beispielantworten der KI", "Geheimnisse: Antwort lehnt ab und zeigt den Weg", ["R-SEC-3"], () => {
  const answer = quote(SKILLS.secrets.text.split("Beispielantwort:")[1].split("## ")[0]);
  assert.ok(answer.startsWith("Das lege ich nicht"), "Antwort lehnt nicht ab");
  assert.ok(answer.includes("portal.adapters") && answer.includes("APP_SECRET_") && answer.includes("Plattform-Team"), "Weg fehlt");
  assert.ok(!/(passwort|password)\s*[:=]/i.test(answer), "Passwort in der Antwort");
});

pruefung("Beispielantworten der KI", "Geheimnisse: gutes Beispiel ohne Ersatzwert", ["R-SEC-2"], () => {
  const gut = SKILLS.secrets.table("Gut / schlecht").map((r) => r[1]).join(" ");
  assert.ok(gut.includes("process.env.APP_SECRET_"), "Zugriff über process.env fehlt");
  assert.ok(!/process\.env\.APP_SECRET_\w+\s*(\|\||\?\?)/.test(gut), "Ersatzwert im guten Beispiel");
});

// ── Sprache ──────────────────────────────────────────────────────────────────

pruefung("Sprache", "Kurze Sätze (im Mittel höchstens 20 Wörter)", [], perSkill((skill) => {
  const sentences = prose(skill.body).split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length >= 3);
  const mean = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
  assert.ok(mean <= 20, `Mittel ${mean.toFixed(1)} Wörter`);
}), cases);

pruefung("Sprache", "Sie-Form, kein „du“", [], perSkill((skill) => {
  assert.ok(!/\b(du|dein|deine|dich|dir)\b/i.test(prose(skill.body)), "„du“ im Text");
}), cases);

pruefung("Sprache", "Gute Beispiele ohne englische Standardwörter", ["R-UI-7"], perSkill((skill) => {
  const gut = skill.table("Gut / schlecht").map((r) => r[1]).join(" ");
  assert.ok(!/„(Submit|Cancel|OK|Loading…?)“/.test(gut), "englisches Standardwort");
}), cases);

// ── Gleichlauf mit dem Python-Golden-Master ──────────────────────────────────

const skipPy = fs.existsSync(PY_SKILLS_DIR) ? false : "awp-hka-gold-python liegt nicht neben diesem Repository";

pruefung("Gleichlauf mit Python", "Kopf, Regeln, Prüfungen wie im Python-Golden-Master", [], perSkill((skill, name) => {
  const other = loadSkill(PY_SKILLS_DIR, name);
  assert.deepEqual(other.meta, skill.meta, "Kopf");
  assert.deepEqual(rules(other), rules(skill), "Regeln");
  assert.deepEqual(checks(other), checks(skill), "Prüfungen");
}), { ...cases, skip: skipPy });

pruefung("Gleichlauf mit Python", "Fehlerkatalog wie im Python-Golden-Master", [], () => {
  assert.equal(fs.readFileSync(path.join(PY_SKILLS_DIR, "pipeline-fehler", "fehlercodes.md"), "utf-8"), CATALOG);
}, { skip: skipPy });
