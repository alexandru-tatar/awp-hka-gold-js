"use strict";

/** Gemeinsame Hilfen für die Selbsttests des Golden Master (Skills und Starter). */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const SKILLS_DIR = path.join(ROOT, ".agents", "skills");
const PY_ROOT = path.resolve(ROOT, "..", "awp-hka-gold-python");
const PY_SKILLS_DIR = path.join(PY_ROOT, ".agents", "skills");

const SKILL_NAMES = ["design", "barrierefreiheit", "ui-regeln", "schnittstellen", "portal", "pipeline-fehler", "secrets"];
const RULE_PREFIX = {
  design: "DES",
  barrierefreiheit: "A11Y",
  "ui-regeln": "UI",
  schnittstellen: "SCHN",
  portal: "PORT",
  "pipeline-fehler": "PF",
  secrets: "SEC",
};

// Manifest-Regeln nach portal/schemas/manifest.schema.json
const SLUG_RE = /^[a-z][a-z0-9-]{2,30}$/;
const CATEGORIES = new Set(["Studium", "Verwaltung", "Kommunikation", "Sonstiges"]);
const ICONS = new Set(["grades", "mail", "calendar", "document", "people", "book", "room", "settings", "info"]);
const ROLE_RE = /^[a-z][a-z0-9-]*$/;
const ADAPTER_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const VERSION_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const MANIFEST_FIELDS = new Set(["slug", "name", "category", "menu", "roles", "adapters", "claims", "version"]);

/** Abweichungen vom Manifest-Schema als Liste (leer = gültig). */
function manifestErrors(m) {
  const errors = [];
  const unknown = Object.keys(m).filter((k) => !MANIFEST_FIELDS.has(k));
  if (unknown.length) errors.push(`unbekannte Felder: ${unknown.sort()}`);
  for (const key of ["slug", "name", "category", "menu", "roles", "version"]) {
    if (!(key in m)) errors.push(`Pflichtfeld fehlt: ${key}`);
  }
  if ("slug" in m && !SLUG_RE.test(String(m.slug))) errors.push("slug ungültig");
  if ("name" in m && !(typeof m.name === "string" && m.name.length >= 1 && m.name.length <= 60)) errors.push("name ungültig");
  if ("category" in m && !CATEGORIES.has(m.category)) errors.push("category ungültig");
  if ("menu" in m) {
    const menu = m.menu ?? {};
    if (Object.keys(menu).sort().join() !== "icon,label") errors.push("menu braucht genau label und icon");
    if (!(typeof menu.label === "string" && menu.label.length >= 1 && menu.label.length <= 40)) errors.push("menu.label ungültig");
    if (!ICONS.has(menu.icon)) errors.push("menu.icon ungültig");
  }
  if ("roles" in m) {
    const roles = m.roles;
    const ok = Array.isArray(roles) && roles.length > 0 && new Set(roles).size === roles.length && roles.every((r) => ROLE_RE.test(r));
    if (!ok) errors.push("roles ungültig");
  }
  const adapters = m.adapters ?? [];
  if (!(Array.isArray(adapters) && adapters.every((a) => ADAPTER_RE.test(a)))) errors.push("adapters ungültig");
  if ("version" in m && !VERSION_RE.test(String(m.version))) errors.push("version ungültig");
  return errors;
}

/** Datenzeilen der ersten Tabelle (ohne Kopf und Trennzeile). */
function tableRows(markdown) {
  const rows = [];
  let started = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("|")) {
      const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
      if (started && !cells.every((c) => /^[-:]*$/.test(c))) rows.push(cells);
      started = true;
    } else if (started) {
      break;
    }
  }
  return rows;
}

class Skill {
  constructor(name, file, text, meta, body, sections) {
    this.name = name;
    this.path = file;
    this.text = text;
    this.meta = meta;
    this.body = body;
    this.sections = sections;
  }

  section(prefix) {
    for (const [title, content] of Object.entries(this.sections)) {
      if (title.startsWith(prefix)) return content;
    }
    throw new Error(`${this.name}: Abschnitt „${prefix}…“ fehlt`);
  }

  table(prefix) {
    return tableRows(this.section(prefix));
  }
}

function loadSkill(directory, name) {
  const file = path.join(directory, name, "SKILL.md");
  const text = fs.readFileSync(file, "utf-8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${file}: Kopf (---) fehlt`);
  const meta = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = match[2];
  const sections = {};
  for (const part of body.split(/^## /m).slice(1)) {
    const i = part.indexOf("\n");
    sections[part.slice(0, i).trim()] = part.slice(i + 1);
  }
  return new Skill(name, file, text, meta, body, sections);
}

function codeBlocks(markdown, language) {
  return [...markdown.matchAll(new RegExp(`^\`\`\`${language}\\n([\\s\\S]*?)^\`\`\``, "gm"))].map((m) => m[1]);
}

/** Fließtext ohne Codeblöcke, Tabellen, Überschriften, Zitate und Prüflisten. */
function prose(markdown) {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, "");
  return text
    .split("\n")
    .filter((line) => line.trim() && !["|", "#", ">", "- [ ]", "*Status", "```"].some((p) => line.trimStart().startsWith(p)))
    .join("\n");
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
const readText = (file) => fs.readFileSync(path.join(ROOT, file), "utf-8");

/** Nach Ordnern und Namen geordnete Liste aller Dateien unter `dir` (relativ zu `dir`). */
function walk(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, suffix));
    else if (!suffix || entry.name.endsWith(suffix)) found.push(full);
  }
  return found.sort();
}

/** Namen aus dem Block `no-restricted-modules` der ESLint-Konfiguration (Pfade und Muster). */
function eslintConfig() {
  return require(path.join(ROOT, "eslint.config.js"));
}

function bannedModules() {
  const rule = eslintConfig()
    .map((block) => block.rules?.["no-restricted-modules"])
    .find((r) => Array.isArray(r) && r[0] === "error");
  return { names: new Set(rule[1].paths.map((p) => p.name)), patterns: rule[1].patterns ?? [] };
}

function isBanned(moduleName, banned = bannedModules()) {
  if (banned.names.has(moduleName)) return true;
  return banned.patterns.some((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(moduleName));
}

function makeTargets() {
  return new Set([...readText("Makefile").matchAll(/^([a-z][a-z-]*):/gm)].map((m) => m[1]));
}

/**
 * Registriert eine Prüfung für den Prüfbericht. Der Name trägt Bereich, Titel, Einzelregeln und Fall,
 * getrennt durch " | "; der Bericht (report.js) liest ihn wieder aus. `cases` erzeugt einen Test je Fall.
 */
function pruefung(bereich, titel, regeln, fn, { cases = [null], skip = false } = {}) {
  const { test } = require("node:test"); // erst hier laden: der Bericht (report.js) braucht common.js ohne Testlauf
  for (const fall of cases) {
    const label = fall === null ? "" : String(fall).startsWith(ROOT) ? path.relative(ROOT, fall) : String(fall);
    const name = [bereich, titel, regeln.join(", "), label].join(" | ");
    test(name, { skip }, () => fn(fall));
  }
}

module.exports = {
  ROOT, SKILLS_DIR, PY_ROOT, PY_SKILLS_DIR, SKILL_NAMES, RULE_PREFIX, CATEGORIES, ICONS,
  manifestErrors, tableRows, loadSkill, codeBlocks, prose, readJson, readText, walk,
  eslintConfig, bannedModules, isBanned, makeTargets, pruefung,
};
