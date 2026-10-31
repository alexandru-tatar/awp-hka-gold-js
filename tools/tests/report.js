"use strict";

/**
 * Prüfbericht für die Selbsttests des Golden Master (Reporter für `node --test`).
 *
 * Ersetzt die Ausgabe von node:test durch einen deutschen Bericht: Prüfbereiche, jede Prüfung mit
 * Ergebnis, alle 40 Einzelregeln mit Stand, Gesamtergebnis. Der Bericht wird zusätzlich als
 * Markdown in `build/pruefberichte/` abgelegt (Nachweis für das Prüfprotokoll).
 *
 * Jeder Test trägt einen Namen der Form "Bereich | Titel | Regel, Regel | Fall" (siehe `pruefung` in common.js).
 * Aufruf: make check-skills, make check-starter (JUnit-XML für die Pipeline erzeugt der eingebaute Reporter).
 */

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, SKILL_NAMES, SKILLS_DIR, loadSkill } = require("./common");

const WIDTH = 100;
const REPORT_DIR = path.join(ROOT, "build", "pruefberichte");
const MARK = { passed: "✔", failed: "✘", skipped: "○" };
const COLOR = { passed: "\x1b[32m", failed: "\x1b[31m", skipped: "\x1b[33m", bold: "\x1b[1m", reset: "\x1b[0m" };

function loadRules() {
  const rules = [];
  for (const name of SKILL_NAMES) {
    const skill = loadSkill(SKILLS_DIR, name);
    const art = Object.fromEntries(skill.table("Prüfungen").map((r) => [r[0], r[1]]));
    for (const [id, text, stufe] of skill.table("Regeln")) rules.push({ id, text, stufe, pruefart: art[id] ?? "", skill: name });
  }
  return rules;
}

function gitState() {
  const run = (args) => cp.spawnSync("git", args, { cwd: ROOT, encoding: "utf-8" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.error) return "unbekannt";
  if (head.status !== 0) return "ohne Commit";
  return head.stdout.trim() + (run(["status", "--porcelain"]).stdout.trim() ? " (mit lokalen Änderungen)" : " (sauber)");
}

const clean = (text) => text.replaceAll("`", "");
const short = (text, width) => (clean(text).length <= width ? clean(text) : `${clean(text).slice(0, width - 1)}…`);
const pad = (text, width) => text + " ".repeat(Math.max(0, width - [...text].length));
const padLeft = (text, width) => " ".repeat(Math.max(0, width - [...text].length)) + text;

function firstLine(error) {
  const original = error?.cause ?? error;
  const message = String(original?.message ?? "Prüfung fehlgeschlagen").trim();
  let line = message.split("\n")[0] || "Prüfung fehlgeschlagen";
  if (line.startsWith("The expression evaluated to a falsy value")) line = "Bedingung nicht erfüllt";
  return short(line, WIDTH - 12);
}

class Bericht {
  constructor() {
    this.checks = new Map();
    // Der Aufruf nennt die Testdatei: tools/tests/skills/skills.test.js oder tools/tests/starter/starter.test.js
    this.mode = process.argv.some((a) => a.includes("skills.test.js")) ? "skills" : "starter";
    this.started = Date.now();
  }

  add(data, outcome) {
    const parts = data.name.split(" | ");
    if (parts.length !== 4) return; // kein Test des Prüfberichts (zum Beispiel die Datei selbst)
    const [bereich, titel, regeln, fall] = parts;
    const key = `${bereich}|${titel}`;
    if (!this.checks.has(key)) {
      this.checks.set(key, { bereich, titel, regeln: regeln ? regeln.split(", ") : [], outcome: "passed", cases: 0, failedCases: [], messages: [], skipReason: "" });
    }
    const check = this.checks.get(key);
    check.cases += 1;
    if (outcome === "failed") {
      check.outcome = "failed";
      check.failedCases.push(fall);
      check.messages.push(firstLine(data.details?.error));
    } else if (outcome === "skipped" && check.outcome === "passed") {
      check.outcome = "skipped";
      check.skipReason = typeof data.skip === "string" ? data.skip : "";
    }
  }

  get titel() {
    return this.mode === "skills" ? "Prüfbericht Skills" : "Prüfbericht Starter";
  }

  render() {
    const out = [];
    const add = (text = "", style = "") => out.push([text, style]);
    const double = "═".repeat(WIDTH);
    const single = "─".repeat(WIDTH);
    const sdkVersion = fs.readFileSync(path.join(ROOT, "platform_sdk", "VERSION"), "utf-8").trim();
    const skillsVersion = /Version (\S+)/.exec(fs.readFileSync(path.join(SKILLS_DIR, "README.md"), "utf-8"));
    const now = new Date();
    const two = (n) => String(n).padStart(2, "0");

    add(double, "bold");
    add(` HKA Portal · Golden Master JavaScript · ${this.titel}`, "bold");
    add(double, "bold");
    add(` Datum            ${two(now.getDate())}.${two(now.getMonth() + 1)}.${now.getFullYear()}, ${two(now.getHours())}:${two(now.getMinutes())} Uhr`);
    add(` Repository       ${path.basename(ROOT)} · Stand ${gitState()}`);
    add(` Skills           Version ${skillsVersion ? skillsVersion[1] : "?"}`);
    add(` Portal-SDK       Version ${sdkVersion}`);
    add(single);

    const byArea = new Map();
    for (const check of this.checks.values()) byArea.set(check.bereich, [...(byArea.get(check.bereich) ?? []), check]);
    let number = 0;
    for (const [area, checks] of byArea) {
      number += 1;
      add("");
      add(` ${number}. ${area}  (${checks.filter((c) => c.outcome === "passed").length}/${checks.length})`, "bold");
      for (const c of checks) {
        const count = c.cases > 1 ? `${c.cases - c.failedCases.length}/${c.cases}` : "";
        add(`   ${MARK[c.outcome]} ${pad(short(c.titel, 62), 62)} ${padLeft(count, 6)}  ${c.regeln.join(", ")}`, c.outcome);
        if (c.outcome === "failed") {
          c.failedCases.forEach((fall, i) => add(`       → ${fall ? `[${fall}] ` : ""}${c.messages[i]}`, "failed"));
        } else if (c.outcome === "skipped") {
          add(`       → übersprungen: ${short(c.skipReason, WIDTH - 22)}`, "skipped");
        }
      }
    }

    add("");
    add(single);
    out.push(...this.renderRules());
    add(single);
    const all = [...this.checks.values()];
    const failed = all.filter((c) => c.outcome === "failed");
    const skipped = all.filter((c) => c.outcome === "skipped");
    const cases = all.reduce((sum, c) => sum + c.cases, 0);
    const seconds = ((Date.now() - this.started) / 1000).toFixed(2).replace(".", ",");
    add(
      ` Gesamtergebnis: ${failed.length ? "NICHT BESTANDEN" : "BESTANDEN"}  ·  ${all.length} Prüfungen (${cases} Einzelfälle)  ·  ` +
        `${failed.length} Fehler  ·  ${skipped.length} übersprungen  ·  ${seconds} s`,
      failed.length ? "failed" : "passed",
    );
    add(double, "bold");
    return out;
  }

  renderRules() {
    const out = [["", ""]];
    const rules = loadRules();
    const must = rules.filter((r) => r.stufe === "muss").length;
    if (this.mode === "skills") {
      out.push([` Einzelregeln in den Skills (${rules.length}, davon ${must} „muss“)`, "bold"]);
      out.push(["   Stand: ✔ Regel, Prüfung und Beispiele des Skills sind stimmig", ""]);
    } else {
      out.push([` Abdeckung der Einzelregeln durch den Starter (${rules.length}, davon ${must} „muss“)`, "bold"]);
      const covered = rules.filter((r) => this.ruleOutcome(r) !== null).length;
      out.push([`   Im Starter geprüft: ${covered} von ${rules.length}. Die übrigen prüfen Pipeline oder Prüfskript.`, ""]);
      out.push(["   Stand: ✔ bestanden · ✘ Fehler · ○ übersprungen · – hier nicht prüfbar", ""]);
    }
    let current = null;
    for (const rule of rules) {
      if (rule.skill !== current) {
        current = rule.skill;
        out.push([`   ${rule.skill}`, "bold"]);
      }
      const outcome = this.ruleOutcome(rule);
      const art = rule.pruefart.split(" ")[0];
      out.push([`   ${MARK[outcome] ?? "–"} ${pad(rule.id, 10)} ${pad(rule.stufe, 5)} ${art}  ${short(rule.text, WIDTH - 30)}`, outcome ?? ""]);
    }
    return out;
  }

  ruleOutcome(rule) {
    const all = [...this.checks.values()];
    if (this.mode === "skills") {
      // Fehler zählt für die Regel, wenn er ihren Skill (Fall) oder sie selbst (Markierung) betrifft
      const failed = all.some((c) => c.outcome === "failed" && (c.failedCases.includes(rule.skill) || (c.regeln.includes(rule.id) && this.blames(c, rule.id))));
      return failed ? "failed" : "passed";
    }
    const related = all.filter((c) => c.regeln.includes(rule.id));
    if (!related.length) return null;
    if (related.some((c) => c.outcome === "failed" && this.blames(c, rule.id))) return "failed";
    if (related.every((c) => c.outcome === "skipped")) return "skipped";
    return "passed";
  }

  /** Nennt die Fehlermeldung Regeln, gilt der Fehler nur für diese; sonst für alle markierten. */
  blames(check, ruleId) {
    const named = new Set(check.messages.flatMap((m) => m.match(/R-[A-Z0-9]+-\d+/g) ?? []));
    return named.size ? named.has(ruleId) : true;
  }

  save(lines) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const d = new Date();
    const two = (n) => String(n).padStart(2, "0");
    const slug = this.titel.toLowerCase().replaceAll(" ", "-").replaceAll("ü", "ue").replaceAll("ä", "ae").replaceAll("ö", "oe");
    const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
    const file = path.join(REPORT_DIR, `${slug}-${stamp}.md`);
    const body = `# ${this.titel}\n\n\`\`\`text\n${lines.map(([text]) => text).join("\n")}\n\`\`\`\n`;
    fs.writeFileSync(file, body, "utf-8");
    fs.writeFileSync(path.join(REPORT_DIR, `${slug}-aktuell.md`), body, "utf-8");
    return file;
  }
}

module.exports = async function* report(source) {
  const bericht = new Bericht();
  for await (const event of source) {
    if (event.type === "test:pass") bericht.add(event.data, event.data.skip !== undefined ? "skipped" : "passed");
    else if (event.type === "test:fail") bericht.add(event.data, "failed");
  }
  const lines = bericht.render();
  const color = process.stdout.isTTY;
  const paint = (text, style) => (color && (style === "bold" || COLOR[style]) ? `${COLOR[style]}${text}${COLOR.reset}` : text);
  yield "\n";
  for (const [text, style] of lines) yield `${paint(text, style)}\n`;
  yield `${paint(` Bericht gespeichert: ${path.relative(ROOT, bericht.save(lines))}`, "bold")}\n\n`;
};
