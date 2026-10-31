"use strict";

const path = require("node:path");
const express = require("express");
const { Portal } = require("../platform_sdk");
const { buildRouter } = require("./routes");

/**
 * Erzeugt die Express-App. Getrennt von server.js, damit Tests ohne festen Port laufen.
 * Das Portal-Objekt liest manifest.json und die Variablen PORTAL_*.
 */
function createApp(portal = Portal.fromEnv()) {
  const app = express();
  app.disable("x-powered-by");
  portal.install(app); // Anmeldung und /healthz: vor allen Routen, nicht entfernen
  app.use(portal.url("/static"), express.static(path.join(__dirname, "static")));
  app.use(portal.url("/"), buildRouter(portal));
  return app;
}

module.exports = { createApp };
