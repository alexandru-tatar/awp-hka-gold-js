"use strict";

/**
 * Selbsttests des Golden Master (JavaScript-Starter).
 *
 * Prüft, dass der Starter die Vorgaben der Plattform erfüllt: Aufbau, Manifest, Abhängigkeiten,
 * ESLint-Verbote, Container, Gerüst der App, Anmeldung auf jeder Route und unveränderte
 * Portal-Bibliothek. Die Tests bleiben grün, wenn eine Person ihre App im Starter baut,
 * solange sie sich an die Regeln hält.
 *
 * Aufruf: make check-starter                  (ohne Container)
 *         CHECK_DOCKER=1 make check-starter   (baut und startet zusätzlich den Container)
 */

// Betriebsmodus, ohne echtes Portal: muss vor dem Laden der App stehen
process.env.PORTAL_ENV = "test";
delete process.env.PORTAL_DEV;
delete process.env.PORTAL_BASE_PATH;

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT, PY_ROOT, bannedModules, eslintConfig, isBanned, makeTargets, manifestErrors, pruefung, readJson, readText, walk,
} = require("../common");

process.chdir(ROOT); // Portal.fromEnv() liest manifest.json aus dem aktuellen Ordner

const SRC = path.join(ROOT, "src");
const DOCKERFILE = readText("Dockerfile");
const JS_FILES = walk(SRC, ".js");
const TEMPLATES = walk(path.join(SRC, "views"), ".njk");
const CSS_FILES = walk(path.join(SRC, "static"), ".css");
const rel = (file) => path.relative(ROOT, file);
const run = (cmd, args, options = {}) => cp.spawnSync(cmd, args, { cwd: ROOT, encoding: "utf-8", ...options });
const nodeMajor = () => readText(".nvmrc").trim();

// ── Aufbau ───────────────────────────────────────────────────────────────────

const MANAGED = [
  "Makefile", "Dockerfile", ".dockerignore", ".gitignore", ".gitattributes", ".nvmrc", "package.json", "package-lock.json",
  "eslint.config.js", "manifest.json", "README.md", ".agents/skills/README.md", "platform_sdk/VERSION", "platform_sdk/SHA256",
  "platform_sdk/index.js", "src/app.js", "src/routes.js", "src/server.js", "src/static/app.css", "src/views/page.njk",
  "tests/helpers.js", "tests/app.test.js",
];

pruefung("Aufbau", "Pflichtdateien vorhanden", [], (file) => {
  assert.ok(fs.statSync(path.join(ROOT, file), { throwIfNoEntry: false })?.isFile(), `${file} fehlt`);
}, { cases: MANAGED });

pruefung("Aufbau", "Befehle dev, start, test, lint, docker, lock, sdk-update", [], () => {
  const targets = makeTargets();
  for (const wanted of ["dev", "start", "test", "lint", "docker", "lock", "sdk-update"]) assert.ok(targets.has(wanted), wanted);
});

pruefung("Aufbau", "Keine .env-Datei im Repository", ["R-SEC-1"], () => {
  assert.deepEqual(fs.readdirSync(ROOT).filter((f) => f === ".env" || f.startsWith(".env.")), []);
});

// ── Manifest ─────────────────────────────────────────────────────────────────

pruefung("Manifest", "manifest.json entspricht dem Schema", ["R-PORT-4"], () => {
  assert.deepEqual(manifestErrors(readJson("manifest.json")), []);
});

pruefung("Manifest", "Schnittstellen-Rechte passen genau zum Code", ["R-SCHN-5"], () => {
  // R-SCHN-5: genau die Rechte, die der Code über portal.adapters.<system> nutzt.
  const declared = new Set((readJson("manifest.json").adapters ?? []).map((a) => a.split(":")[0]));
  const used = new Set(JS_FILES.flatMap((f) => [...fs.readFileSync(f, "utf-8").matchAll(/portal\.adapters\.([a-z]+)\./g)].map((m) => m[1])));
  assert.deepEqual([...declared].sort(), [...used].sort());
});

// ── Abhängigkeiten und ESLint ────────────────────────────────────────────────

pruefung("Abhängigkeiten und Lint", "Node 24 in .nvmrc, package.json und Dockerfile", [], () => {
  assert.equal(nodeMajor(), "24");
  assert.equal(readJson("package.json").engines.node, ">=24 <25");
  assert.ok(DOCKERFILE.includes(`ARG NODE_MAIN_VERSION=${nodeMajor()}`), "Dockerfile nennt eine andere Node-Version");
});

pruefung("Abhängigkeiten und Lint", "Keine verbotenen Abhängigkeiten", ["R-SCHN-1", "R-PORT-1", "R-DES-2"], () => {
  const names = Object.keys(readJson("package.json").dependencies ?? {});
  const forbidden = names.filter((n) => isBanned(n) || ["bootstrap", "tailwindcss"].includes(n));
  assert.deepEqual(forbidden, []);
});

pruefung("Abhängigkeiten und Lint", "Testwerkzeuge nur in devDependencies", [], () => {
  const names = Object.keys(readJson("package.json").dependencies ?? {});
  assert.deepEqual(names.filter((n) => ["jest", "eslint", "@eslint/js", "globals"].includes(n)), []);
});

pruefung("Abhängigkeiten und Lint", "ESLint-Verbote vollständig, keine Ausnahmen für src/", ["R-SCHN-1", "R-PORT-1", "R-PORT-6"], () => {
  const required = [
    "axios", "node-fetch", "got", "undici", "node:http", "node:https", "http", "https",
    "passport", "jsonwebtoken", "jose", "bcrypt", "express-session", "cookie-session", "cookie-parser",
  ];
  const banned = bannedModules();
  assert.deepEqual(required.filter((n) => !isBanned(n, banned)), []);
  assert.ok(isBanned("passport-local", banned), "Muster passport-* fehlt");
  const config = eslintConfig();
  assert.ok(config.some((b) => Array.isArray(b.rules?.["no-restricted-globals"])), "fetch ist nicht verboten");
  assert.ok(config.some((b) => b.ignores?.includes("platform_sdk/")), "platform_sdk/ ist nicht ausgenommen");
  const exempt = config.filter((b) => b.rules?.["no-restricted-modules"] === "off").flatMap((b) => b.files ?? []);
  assert.ok(!exempt.some((f) => f.startsWith("src")), "Ausnahmen für src/ sind nicht erlaubt");
});

pruefung("Abhängigkeiten und Lint", "package-lock.json passt zu package.json", [], () => {
  const result = run("npm", ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"]);
  assert.equal(result.status, 0, result.stderr.split("\n").find((l) => l.includes("npm error")) ?? "npm ci --dry-run schlägt fehl");
}, { skip: cp.spawnSync("npm", ["--version"]).error ? "npm fehlt" : false });

pruefung("Abhängigkeiten und Lint", "ESLint meldet eingespieltes require(\"axios\")", ["R-SCHN-1"], () => {
  // Kanarienvogel (07 ST6): ein verbotener Import in src/ muss gemeldet werden, auch in CommonJS.
  const canary = path.join(SRC, "_canary_check.js");
  fs.writeFileSync(canary, 'const axios = require("axios");\n\nmodule.exports = axios;\n', "utf-8");
  let result;
  try {
    result = run("npx", ["eslint", "--no-cache", canary]);
  } finally {
    fs.rmSync(canary, { force: true });
  }
  assert.ok(result.status !== 0 && result.stdout.includes("no-restricted-modules"), "ESLint meldet den verbotenen Import nicht");
});

// ── Container ────────────────────────────────────────────────────────────────

pruefung("Container", "Betriebsregeln: UID 10001, HEALTHCHECK, /data (PF-113)", ["R-PORT-5"], () => {
  // PF-113: kein root, Gesundheitstest, Schreibrechte nur in /tmp und /data.
  assert.match(DOCKERFILE, /^USER 10001:10001$/m);
  assert.ok(DOCKERFILE.includes("HEALTHCHECK") && DOCKERFILE.includes("platform_sdk/healthcheck.js"), "HEALTHCHECK fehlt");
  assert.ok(DOCKERFILE.includes("DATA_DIR=/data") && DOCKERFILE.includes("chown 10001:10001 /data"), "/data fehlt");
  assert.ok(DOCKERFILE.includes("EXPOSE 8080"));
  assert.ok(DOCKERFILE.includes("src/server.js"));
});

pruefung("Container", "Container enthält nur node_modules, SDK, src, Manifest", [], () => {
  const copies = [...DOCKERFILE.matchAll(/^COPY (?:--from=\S+ )?(\S+)/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(copies)].sort(), ["/app/node_modules", "manifest.json", "platform_sdk", "src"]);
});

pruefung("Container", "Kein Entwicklungsmodus im Betrieb (PF-107)", [], () => {
  // PF-107: PORTAL_DEV nur im Makefile (make dev), nie in Dateien, die in den Betrieb gehen.
  for (const file of [path.join(ROOT, "Dockerfile"), path.join(ROOT, "manifest.json"), ...JS_FILES, ...TEMPLATES]) {
    assert.ok(!fs.readFileSync(file, "utf-8").includes("PORTAL_DEV"), `PORTAL_DEV in ${rel(file)}`);
  }
});

pruefung("Container", ".dockerignore schließt .env, .git, Tests aus", ["R-SEC-1"], () => {
  const ignored = new Set(readText(".dockerignore").split(/\s+/));
  for (const wanted of [".env", ".git", "node_modules", "tests", ".agents"]) assert.ok(ignored.has(wanted), wanted);
});

pruefung("Container", ".gitignore schließt .env aus", ["R-SEC-1"], () => {
  const ignored = new Set(readText(".gitignore").split(/\s+/));
  assert.ok(ignored.has(".env") && ignored.has("node_modules/"));
});

// ── Gerüst der App ───────────────────────────────────────────────────────────

pruefung("Gerüst der App", "portal.install(app) vor allen Routen", ["R-PORT-1", "R-PORT-2"], () => {
  const lines = readText("src/app.js").split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("//"));
  const install = lines.findIndex((l) => /\bportal\.install\(app\)/.test(l));
  assert.ok(install >= 0, "portal.install(app) fehlt");
  const routes = lines.map((l, i) => [l, i]).filter(([l, i]) => i !== install && /\bapp\.(use|get|post|put|patch|delete|all)\(/.test(l)).map(([, i]) => i);
  assert.ok(routes.length > 0, "keine Routen");
  assert.ok(install < Math.min(...routes), "portal.install(app) steht nach einer Route");
});

pruefung("Gerüst der App", "Routen nur am Router aus portal.router()", ["R-PORT-3"], (file) => {
  assert.ok(!/\bapp\.(get|post|put|patch|delete|all)\(/.test(fs.readFileSync(file, "utf-8")), rel(file));
}, { cases: JS_FILES });

pruefung("Gerüst der App", "Keine Cookies im Code", ["R-PORT-6"], (file) => {
  const text = fs.readFileSync(file, "utf-8");
  assert.ok(!/\.cookie\(|\.cookies\b|set-cookie|express-session|cookie-parser/i.test(text), rel(file));
}, { cases: JS_FILES });

pruefung("Gerüst der App", "Kein HTML in JavaScript-Code", ["R-DES-4"], (file) => {
  assert.ok(!/["'`]\s*<[a-zA-Z]/.test(fs.readFileSync(file, "utf-8")), `${rel(file)}: HTML nur in Vorlagen`);
}, { cases: JS_FILES });

pruefung("Gerüst der App", "Geheimnisse nur aus APP_SECRET_…, ohne Ersatzwert", ["R-SEC-1", "R-SEC-2"], (file) => {
  // R-SEC-2: process.env.APP_SECRET_… ohne Ersatzwert.
  const text = fs.readFileSync(file, "utf-8");
  assert.ok(!/process\.env(\.APP_SECRET_\w+|\[\s*["']APP_SECRET_\w+["']\s*\])\s*(\|\||\?\?)/.test(text), rel(file));
}, { cases: JS_FILES });

// ── Vorlagen und CSS ─────────────────────────────────────────────────────────

pruefung(
  "Vorlagen und CSS", "Vorlagen: kein Rahmen, kein Menü, keine „/“-Links, alt",
  ["R-DES-3", "R-DES-4", "R-UI-1", "R-PORT-3", "R-A11Y-2", "R-A11Y-7"],
  (file) => {
    const html = fs.readFileSync(file, "utf-8");
    assert.ok(!/<(html|head|body)\b/i.test(html), "R-DES-4: eigener Seitenrahmen (<html>, <head>, <body>) in der Vorlage");
    assert.ok(!/<nav\b/i.test(html), "R-UI-1: eigenes Menü (<nav>) in der Vorlage");
    assert.ok(!/(href|src|action)="\//.test(html), "R-PORT-3: Adresse beginnt mit „/“ statt portal.url()");
    assert.ok(!/(href|src)="(https?:)?\/\//.test(html), "R-DES-3: externe Adresse in der Vorlage");
    assert.ok(!html.replaceAll(" ", "").includes("|safe"), "R-DES-4: | safe schaltet den Schutz der Vorlage ab");
    assert.ok(!html.includes("outline: none") && !html.includes("onclick"), "R-A11Y-2: outline: none oder onclick in der Vorlage");
    assert.ok(!/<img(?![^>]*\balt=)/.test(html), "R-A11Y-7: Bild ohne Alternativtext (alt)");
  },
  { cases: TEMPLATES },
);

pruefung("Vorlagen und CSS", "Nunjucks mit autoescape, kein autoescape-Aus in Vorlagen", ["R-DES-4"], () => {
  const routes = readText("src/routes.js");
  assert.match(routes, /nunjucks\.configure\(.*autoescape:\s*true/, "R-DES-4: autoescape ist nicht eingeschaltet");
  for (const file of TEMPLATES) {
    assert.ok(!/\{%-?\s*autoescape\s+false/.test(fs.readFileSync(file, "utf-8")), `R-DES-4: autoescape aus in ${rel(file)}`);
  }
});

pruefung("Vorlagen und CSS", "CSS nur mit Variablen, ohne externe Quellen", ["R-DES-1", "R-DES-3", "R-A11Y-2"], (file) => {
  const css = fs.readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/.test(css), "R-DES-1: Farbwert (#…, rgb(…), hsl(…)) im eigenen CSS");
  assert.ok(!/@import|url\(\s*["']?(https?:)?\/\//.test(css), "R-DES-3: externe Quelle oder @import im CSS");
  assert.ok(!/outline\s*:\s*(none|0)/.test(css), "R-A11Y-2: Fokus-Rahmen im CSS abgeschaltet");
}, { cases: CSS_FILES });

// ── Laufende App ─────────────────────────────────────────────────────────────

/** Adressen aus den Routen im Quelltext (`router.get("/…")`); `/healthz` und Adressen mit Parametern kommen anders vor. */
function routePaths() {
  const found = new Set(["/static/app.css"]);
  for (const file of JS_FILES) {
    for (const m of fs.readFileSync(file, "utf-8").matchAll(/\b(?:router|app)\.(?:get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/g)) {
      if (m[1] !== "/healthz") found.add(m[1].replace(/:[A-Za-z0-9_]+/g, "1"));
    }
  }
  return [...found].sort();
}

async function withApp(fn) {
  const { Portal } = require(path.join(ROOT, "platform_sdk"));
  const { createApp } = require(path.join(ROOT, "src", "app"));
  const server = await new Promise((resolve) => {
    const s = createApp(Portal.fromEnv()).listen(0, "127.0.0.1", () => resolve(s));
  });
  const log = console.log;
  console.log = () => {}; // die Logzeilen des SDK gehören nicht in den Prüfbericht
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    console.log = log;
    await new Promise((resolve) => server.close(resolve));
  }
}

pruefung("Laufende App", "/healthz antwortet ohne Anmeldung", ["R-PORT-5"], async () => {
  await withApp(async (base) => assert.equal((await fetch(`${base}/healthz`)).status, 200));
});

pruefung("Laufende App", "Jede Route antwortet ohne Anmeldung mit 401", ["R-PORT-2", "R-PORT-6"], async () => {
  // R-PORT-2, wie die Konformitätsprüfung (PF-110): ohne Assertion immer 401.
  const paths = routePaths();
  assert.ok(paths.includes("/") && paths.includes("/static/app.css"), "Startseite oder Stylesheet fehlt in den Routen");
  await withApp(async (base) => {
    for (const p of paths) {
      for (const method of ["GET", "POST"]) {
        const response = await fetch(base + p, { method });
        assert.equal(response.status, 401, `${method} ${p}`);
        assert.equal(response.headers.get("set-cookie"), null, `${method} ${p}: Cookie gesetzt`);
      }
    }
  });
});

pruefung("Laufende App", "Test-Anmeldung ist im Betrieb nicht erreichbar", ["R-PORT-2"], async () => {
  await withApp(async (base) => assert.equal((await fetch(`${base}/__dev/login`)).status, 401));
});

// ── Portal-Bibliothek ────────────────────────────────────────────────────────

pruefung("Portal-Bibliothek", "platform_sdk/ unverändert (PF-103)", ["R-PORT-5"], () => {
  const result = run("node", ["platform_sdk/verify-tree.js"]);
  assert.equal(result.status, 0, result.stderr);
});

pruefung("Portal-Bibliothek", "platform_sdk/ wie in sdk-releases.json freigegeben", ["R-PORT-5"], () => {
  const releases = ["portal", "awp-hka-intranet-portal"].map((n) => path.join(ROOT, "..", n, "sdk", "sdk-releases.json")).find((f) => fs.existsSync(f));
  const version = readText("platform_sdk/VERSION").trim();
  const expected = JSON.parse(fs.readFileSync(releases, "utf-8"))[version].javascript;
  assert.equal(readText("platform_sdk/SHA256").trim(), expected);
}, { skip: ["portal", "awp-hka-intranet-portal"].some((n) => fs.existsSync(path.join(ROOT, "..", n, "sdk", "sdk-releases.json"))) ? false : "Portal-Repository liegt nicht neben diesem Repository" });

// ── Container (nur mit CHECK_DOCKER=1) ───────────────────────────────────────

const dockerSkip = process.env.CHECK_DOCKER !== "1" || cp.spawnSync("docker", ["--version"]).error ? "CHECK_DOCKER=1 setzen" : false;

pruefung("Container im Betrieb", "Container: schreibgeschützt, UID 10001, gesund, 401", ["R-PORT-2", "R-PORT-5"], async () => {
  // ST4: läuft als 10001, schreibgeschützt, ohne Rechte, und wird gesund.
  const image = "hka/portal-app:selftest";
  const name = `gold-js-selftest-${process.pid}`;
  const docker = (...args) => run("docker", args);
  assert.equal(docker("build", "--quiet", "--tag", image, ".").status, 0, "docker build schlägt fehl");
  assert.equal(
    docker("run", "--detach", "--rm", "--name", name, "--read-only", "--cap-drop=ALL", "--tmpfs", "/tmp", "--publish", "127.0.0.1::8080", image).status,
    0, "docker run schlägt fehl",
  );
  try {
    const url = `http://${docker("port", name, "8080").stdout.split(/\s+/)[0]}`;
    let status = "";
    for (let i = 0; i < 30 && !["healthy", "unhealthy"].includes(status); i += 1) {
      status = docker("inspect", "--format", "{{.State.Health.Status}}", name).stdout.trim();
      if (!["healthy", "unhealthy"].includes(status)) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(status, "healthy");
    assert.equal(docker("exec", name, "id", "-u").stdout.trim(), "10001");
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    assert.equal((await fetch(`${url}/`)).status, 401);
  } finally {
    docker("stop", name);
  }
}, { skip: dockerSkip });

// ── Gleichlauf mit dem Python-Golden-Master (HKA-44, Kriterium 9) ────────────

const skipPy = fs.existsSync(PY_ROOT) ? false : "awp-hka-gold-python liegt nicht neben diesem Repository";
const pyText = (file) => fs.readFileSync(path.join(PY_ROOT, file), "utf-8");
const areas = (text, pattern) => new Set([...text.matchAll(pattern)].map((m) => m[1].replace(/JavaScript|Python/, "<Sprache>")));

pruefung("Gleichlauf mit Python", "Gleiche make-Befehle", [], () => {
  const python = new Set([...pyText("Makefile").matchAll(/^([a-z][a-z-]*):/gm)].map((m) => m[1]));
  assert.deepEqual([...makeTargets()].sort(), [...python].sort());
}, { skip: skipPy });

pruefung("Gleichlauf mit Python", "Gleiche Pflichtdateien, gleiches Manifest, gleiche SDK-Version", [], () => {
  const common = [
    "Makefile", "Dockerfile", ".dockerignore", ".gitignore", "manifest.json", "README.md", ".agents/skills/README.md",
    "platform_sdk/VERSION", "platform_sdk/SHA256", "tools/tests/skills", "tools/tests/starter",
  ];
  for (const file of common) {
    assert.ok(fs.existsSync(path.join(ROOT, file)) && fs.existsSync(path.join(PY_ROOT, file)), `${file} fehlt in einem der Repositories`);
  }
  assert.deepEqual(readJson("manifest.json"), JSON.parse(pyText("manifest.json")));
  assert.equal(readText("platform_sdk/VERSION"), pyText("platform_sdk/VERSION"));
}, { skip: skipPy });

pruefung("Gleichlauf mit Python", "Gleiche Prüfbereiche im Prüfbericht", [], () => {
  const own = (file) => fs.readFileSync(path.join(ROOT, "tools", "tests", file), "utf-8");
  const pairs = [
    ["starter/starter.test.js", "starter/test_starter.py"],
    ["skills/skills.test.js", "skills/test_skills.py"],
  ];
  for (const [js, py] of pairs) {
    const ours = areas(own(js), /^pruefung\(\s*"([^"]+)"/gm);
    const theirs = areas(pyText(`tools/tests/${py}`), /@pruefung\(\s*"([^"]+)"/g);
    ours.delete("Gleichlauf mit Python");
    theirs.delete("Gleichlauf mit <Sprache>");
    ours.delete("Gleichlauf mit <Sprache>");
    assert.deepEqual([...ours].sort(), [...theirs].sort(), js);
  }
}, { skip: skipPy });
