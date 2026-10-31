"use strict";

const js = require("@eslint/js");
const globals = require("globals");

const NETZ = "Andere Systeme nur über portal.adapters ansprechen (Regel R-SCHN-1).";
const LOGIN = "Kein eigenes Login und keine eigene Token-Prüfung (Regel R-PORT-1).";
const COOKIES = "Keine Cookies; Zustand auf dem Server speichern (Regel R-PORT-6).";

// Verbotene Bibliotheken und Module. Dieselben Namen stehen in den Skills `schnittstellen` und `portal`.
const verboteneModule = [
  ...["axios", "node-fetch", "got", "undici", "node:http", "http", "node:https", "https"].map((name) => ({ name, message: NETZ })),
  ...["passport", "jsonwebtoken", "jose", "bcrypt", "bcryptjs"].map((name) => ({ name, message: LOGIN })),
  ...["express-session", "cookie-session", "cookie-parser"].map((name) => ({ name, message: COOKIES })),
];

module.exports = [
  { ignores: ["node_modules/", "coverage/", "build/", "platform_sdk/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
    rules: {
      // `no-restricted-imports` meldet in CommonJS-Dateien nichts; `no-restricted-modules` meldet `require(...)`.
      "no-restricted-modules": ["error", { paths: verboteneModule, patterns: ["passport-*"] }],
      "no-restricted-globals": ["error", { name: "fetch", message: NETZ }],
      "no-restricted-properties": [
        "error",
        { object: "globalThis", property: "fetch", message: NETZ },
        { object: "res", property: "cookie", message: COOKIES },
        { object: "req", property: "cookies", message: COOKIES },
        { object: "req", property: "session", message: COOKIES },
      ],
      "no-restricted-syntax": ["error", { selector: "Literal[value=/^set-cookie$/i]", message: COOKIES }],
    },
  },
  {
    // Tests der App und Selbsttests der Plattform dürfen die Anwendung selbst aufrufen.
    files: ["tests/**/*.js", "tools/**/*.js"],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      "no-restricted-modules": "off",
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },
];
