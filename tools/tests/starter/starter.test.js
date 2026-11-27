"use strict";

/**
 * Selbsttests des Golden Master (JavaScript-Starter).
 *
 * Prüft, dass der Starter die Vorgaben der Plattform erfüllt: Aufbau, Manifest, Abhängigkeiten,
 * ESLint-Verbote, Container, Image-Tag und Deploy, Gerüst der App, Anmeldung auf jeder Route,
 * unveränderte Portal-Bibliothek und Gleichlauf mit dem Python-Golden-Master. Die Tests bleiben grün, wenn eine Person ihre App im Starter baut,
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
const os = require("node:os");
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

// ── Image und Deploy (HKA-65) ────────────────────────────────────────────────
// tools/build-image.sh und tools/deploy.sh laufen gegen Platzhalter für docker, ssh und scp. Die Platzhalter merken
// sich vergebene Tags und schreiben jeden Aufruf mit; es wird nichts gebaut und nichts übertragen.
// Mit CHECK_DOCKER=1 kommt ein echter Build dazu.

const bashUndMake = ["bash", "make"].some((cmd) => cp.spawnSync(cmd, ["--version"]).error) ? "bash und make fehlen" : false;
const SLUG = readJson("manifest.json").slug;
const DIGEST = `sha256:${"0".repeat(64)}`;
const FREMD = new Set(["STUFE", "BAUZEIT", "IMAGE", "ZIEL", "VM", "VM_USER", "OWNER_REPO", "MAKEFLAGS", "MAKELEVEL", "MFLAGS"]);
const sauberesEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !FREMD.has(key)));

const PLATZHALTER = {
  docker: String.raw`#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  build)
    while [ $# -gt 0 ]; do
      if [ "$1" = --iidfile ]; then echo "sha256:platzhalter$(wc -l < "$FAKE_LOG" | tr -d ' ')" > "$2"; fi
      shift
    done ;;
  image) grep -qxF "$3" "$FAKE_TAGS"; exit $? ;;
  tag) echo "$3" >> "$FAKE_TAGS" ;;
  save) echo "TAR" ;;
esac
`,
  // Das Skript, das deploy.sh mit "ssh -t … bash -c <skript>" auf der VM ausführt, landet in $FAKE_REMOTE.
  ssh: String.raw`#!/usr/bin/env bash
echo "ssh $*" >> "$FAKE_LOG"
for last; do :; done
case "$last" in
  "bash -c "*) eval "set -- $last"; printf '%s\n' "$3" > "$FAKE_REMOTE" ;;
esac
`,
  scp: String.raw`#!/usr/bin/env bash
echo "scp $*" >> "$FAKE_LOG"
`,
};

/** Führt fn mit Platzhaltern für docker, ssh und scp aus; danach wird der Ordner gelöscht. */
function mitPlatzhaltern(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gold-js-platzhalter-"));
  try {
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    for (const [name, text] of Object.entries(PLATZHALTER)) fs.writeFileSync(path.join(bin, name), text, { mode: 0o755 });
    const files = { log: path.join(dir, "aufrufe.log"), tags: path.join(dir, "tags"), remote: path.join(dir, "remote.sh") };
    for (const file of Object.values(files)) fs.writeFileSync(file, "");
    const env = {
      ...sauberesEnv(), PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_LOG: files.log, FAKE_TAGS: files.tags, FAKE_REMOTE: files.remote,
    };
    return fn({
      dir,
      run: (cmd, args, { cwd = ROOT, ...extra } = {}) => cp.spawnSync(cmd, args, { cwd, env: { ...env, ...extra }, encoding: "utf-8", timeout: 60_000 }),
      aufrufe: (befehl) => fs.readFileSync(files.log, "utf-8").split("\n").filter((z) => z.startsWith(`${befehl} `)),
      log: () => fs.readFileSync(files.log, "utf-8"),
      remote: () => fs.readFileSync(files.remote, "utf-8"),
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Wert von --label org.opencontainers.image.<name>=… aus einem docker-build-Aufruf. */
const label = (aufruf, name) => aufruf.match(new RegExp(String.raw`--label org\.opencontainers\.image\.${name}=(\S+)`))[1];

/** Was tools/build-image.sh als revision einträgt: Commit, mit -dirty bei nicht committeten Änderungen. */
function gitRevision() {
  const head = run("git", ["rev-parse", "HEAD"]);
  if (head.error || head.status !== 0) return "unbekannt";
  return head.stdout.trim() + (run("git", ["status", "--porcelain"]).stdout.trim() ? "-dirty" : "");
}

/** Minute in Europe/Berlin als JJJJMMTT-HHMM und der Abstand zu UTC als +01:00 bzw. +02:00. */
function berlin(date) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
  });
  const t = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  return { minute: `${t.year}${t.month}${t.day}-${t.hour}${t.minute}`, offset: t.timeZoneName.replace("GMT", "") };
}

/** Kopie von Makefile, Werkzeugen und Manifest mit eigenem slug (deploy.sh lehnt meine-app ab). */
function deployKopie(dir) {
  const kopie = path.join(dir, "app");
  fs.mkdirSync(path.join(kopie, "tools"), { recursive: true });
  for (const file of ["Makefile", "tools/deploy.sh", "tools/build-image.sh"]) fs.copyFileSync(path.join(ROOT, file), path.join(kopie, file));
  fs.writeFileSync(path.join(kopie, "manifest.json"), JSON.stringify({ ...readJson("manifest.json"), slug: "selbsttest-app" }, null, 2));
  return kopie;
}

pruefung("Image und Deploy", "make docker: Tag test-JJJJMMTT-HHMM mit der Bauzeit in Europe/Berlin (HKA-65, AK1)", [], () => mitPlatzhaltern((p) => {
  const vorher = berlin(new Date()).minute;
  const result = p.run("make", ["-s", "docker"]);
  const nachher = berlin(new Date()).minute;
  assert.equal(result.status, 0, result.stderr);
  const tag = result.stdout.trim().match(new RegExp(String.raw`^${SLUG}:test-(\d{8}-\d{4})$`));
  assert.ok(tag, result.stdout);
  assert.ok(vorher <= tag[1] && tag[1] <= nachher, `${tag[1]} liegt nicht zwischen ${vorher} und ${nachher}`);
  const created = label(p.aufrufe("docker build")[0], "created");
  assert.equal(berlin(new Date(created)).minute, tag[1]);
  assert.equal(created.slice(-6), berlin(new Date(created)).offset);
}), { skip: bashUndMake });

const STUFEN = {
  "test-winterzeit": [[], "2026-11-25T14:30:00+01:00", "test-20261125-1430"],
  "prod-sommerzeit": [["STUFE=prod"], "2026-07-01T09:05:59+02:00", "prod-20260701-0905"],
  "test-mitternacht": [["STUFE=test"], "2026-01-01T00:00:00+01:00", "test-20260101-0000"],
};

pruefung("Image und Deploy", "Tag aus der Bauzeit; Produktiv-Build mit make docker STUFE=prod (AK1, AK2)", [], (fall) => mitPlatzhaltern((p) => {
  const [makeArgs, bauzeit, tag] = STUFEN[fall];
  const result = p.run("make", ["-s", "docker", ...makeArgs], { BAUZEIT: bauzeit });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `${SLUG}:${tag}`);
  assert.equal(label(p.aufrufe("docker build")[0], "created"), bauzeit);
}), { cases: Object.keys(STUFEN), skip: bashUndMake });

const ABGELEHNT = {
  "stufe-staging": [[], { STUFE: "staging" }],
  "name-grossbuchstaben": [["Meine-App"], {}],
  "name-mit-tag": [["meine-app:latest"], {}],
  "option-tag": [["meine-app", "--tag", "meine-app:latest"], {}],
  "option-t": [["-t=meine-app:latest"], {}],
  "zeit-utc": [[], { BAUZEIT: "2026-11-25T14:30:00+00:00" }],
  "zeit-unvollstaendig": [[], { BAUZEIT: "2026-11-25T14:30" }],
};

pruefung("Image und Deploy", "Abgelehnt: falsche Stufe, ungültiger Name, eigenes Tag, Zeit nicht in Europe/Berlin", [], (fall) => mitPlatzhaltern((p) => {
  const [args, env] = ABGELEHNT[fall];
  const result = p.run("bash", ["tools/build-image.sh", ...args], env);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("FEHLER"), result.stderr);
  assert.deepEqual(p.aufrufe("docker build"), []);
}), { cases: Object.keys(ABGELEHNT), skip: bashUndMake });

pruefung("Image und Deploy", "Labels: Bauzeit (created) und Git-Commit (revision) (AK3)", [], () => mitPlatzhaltern((p) => {
  const result = p.run("bash", ["tools/build-image.sh"], { BAUZEIT: "2026-11-25T14:30:00+01:00" });
  assert.equal(result.status, 0, result.stderr);
  const aufrufe = p.aufrufe("docker build");
  assert.equal(aufrufe.length, 1);
  assert.equal(label(aufrufe[0], "created"), "2026-11-25T14:30:00+01:00");
  assert.equal(label(aufrufe[0], "revision"), gitRevision());
}), { skip: bashUndMake });

pruefung("Image und Deploy", "Zweiter Build in derselben Minute: Zähler -2, vorhandenes Tag bleibt (AK4)", [], () => mitPlatzhaltern((p) => {
  const refs = [];
  for (const sekunde of ["00", "20", "40"]) {
    const result = p.run("bash", ["tools/build-image.sh"], { BAUZEIT: `2026-11-25T14:30:${sekunde}+01:00` });
    assert.equal(result.status, 0, result.stderr);
    refs.push(result.stdout.trim());
  }
  const basis = `${SLUG}:test-20261125-1430`;
  assert.deepEqual(refs, [basis, `${basis}-2`, `${basis}-3`]);
  // Jedes docker tag vergibt ein neues Tag; keins wird ein zweites Mal vergeben (das hieße: überschrieben).
  assert.deepEqual(p.aufrufe("docker tag").map((aufruf) => aufruf.split(" ").at(-1)), refs);
}), { skip: bashUndMake });

pruefung("Image und Deploy", "make deploy überträgt genau das gebaute Tag, nie latest (AK5)", [], () => mitPlatzhaltern((p) => {
  const result = p.run("make", ["-s", "deploy", "VM=vm.example.invalid"], {
    cwd: deployKopie(p.dir), OWNER_REPO: "hka/selbsttest-app", BAUZEIT: "2026-11-25T14:30:00+01:00",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const ref = "selbsttest-app:test-20261125-1430";
  assert.deepEqual(p.aufrufe("docker save"), [`docker save ${ref}`]);
  const remote = p.remote();
  assert.ok(remote.includes("sudo docker images selbsttest-app\n"), "docker images fehlt auf der VM");
  assert.ok(remote.includes(`  ${ref} >/dev/null`), "docker run startet ein anderes Image");
  assert.ok(!(p.log() + remote).includes("latest"), "latest kommt vor");
}), { skip: bashUndMake });

const IMAGES = {
  "latest": ["ghcr.io/hka/app:latest", false],
  "ohne-tag": ["ghcr.io/hka/app", false],
  "latest-mit-digest": [`ghcr.io/hka/app:latest@${DIGEST}`, false],
  "digest": [`ghcr.io/hka/app@${DIGEST}`, true],
  "festes-tag": ["ghcr.io/hka/app:sha-1a2b3c4", true],
};

pruefung("Image und Deploy", "make deploy mit IMAGE: festes Tag oder Digest, nie latest (AK5)", [], (fall) => mitPlatzhaltern((p) => {
  const [image, erlaubt] = IMAGES[fall];
  const result = p.run("make", ["-s", "deploy", "VM=vm.example.invalid", `IMAGE=${image}`], {
    cwd: deployKopie(p.dir), OWNER_REPO: "hka/selbsttest-app",
  });
  if (erlaubt) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(p.aufrufe("docker save"), [`docker save ${image}`]);
    assert.ok(p.remote().includes("sudo docker images ghcr.io/hka/app\n"), "docker images fehlt auf der VM");
  } else {
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("latest"), result.stderr);
    assert.deepEqual([...p.aufrufe("docker pull"), ...p.aufrufe("docker save")], []);
  }
}), { cases: Object.keys(IMAGES), skip: bashUndMake });

pruefung("Image und Deploy", "Echter Build: Labels per docker inspect, Zähler -2, erstes Image bleibt (AK3, AK4)", [], () => {
  const name = `gold-js-selftest-${process.pid}`;
  const inspect = (ref) => {
    const result = run("docker", ["image", "inspect", ref]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout)[0];
  };
  const refs = [];
  const ids = [];
  try {
    for (const bauzeit of ["2026-11-25T14:30:00+01:00", "2026-11-25T14:30:30+01:00"]) {
      const result = run("bash", ["tools/build-image.sh", name], { env: { ...sauberesEnv(), BAUZEIT: bauzeit }, timeout: 900_000 });
      assert.equal(result.status, 0, result.stderr.slice(-3000));
      refs.push(result.stdout.trim());
      ids.push(inspect(refs.at(-1)).Id);
    }
    assert.deepEqual(refs, [`${name}:test-20261125-1430`, `${name}:test-20261125-1430-2`]);
    assert.notEqual(ids[0], ids[1]);
    assert.equal(inspect(refs[0]).Id, ids[0], "das erste Image ist überschrieben");
    const labels = refs.map((ref) => inspect(ref).Config.Labels);
    assert.equal(labels[0]["org.opencontainers.image.created"], "2026-11-25T14:30:00+01:00");
    assert.equal(labels[1]["org.opencontainers.image.created"], "2026-11-25T14:30:30+01:00");
    assert.equal(labels[0]["org.opencontainers.image.revision"], gitRevision());
  } finally {
    if (refs.length > 0) run("docker", ["rmi", ...refs]);
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

pruefung("Gleichlauf mit Python", "tools/deploy.sh und tools/build-image.sh gleich (HKA-65)", [], (file) => {
  assert.ok(fs.existsSync(path.join(PY_ROOT, file)), `${file} fehlt in awp-hka-gold-python`);
  assert.ok(fs.readFileSync(path.join(ROOT, file)).equals(fs.readFileSync(path.join(PY_ROOT, file))), `${file} weicht ab`);
}, { cases: ["tools/deploy.sh", "tools/build-image.sh"], skip: skipPy });

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
