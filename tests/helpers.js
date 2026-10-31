"use strict";

/** Testumgebung: Betriebsmodus mit festem Testschlüssel statt echtem Portal. */

process.env.PORTAL_ENV = "test";
process.env.PORTAL_ISSUER = "https://portal.test/";
delete process.env.PORTAL_DEV;
delete process.env.PORTAL_BASE_PATH;

const crypto = require("node:crypto");
const { Portal } = require("../platform_sdk");
const { JwksCache } = require("../platform_sdk/jwks");
const { createApp } = require("../src/app");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function makeToken(portal, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://portal.test/",
    aud: [portal.config.slug, "portal", "adapters"],
    sub: "test-person",
    name: "Erika Musterfrau",
    roles: ["student"],
    v: 1,
    iat: now,
    exp: now + 60,
    ...overrides,
  };
  const input = `${b64({ alg: "RS256", kid: "test-key" })}.${b64(claims)}`;
  return `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

/** Startet die App auf einem freien Port; liefert `base`, `portal` und `close()`. */
async function startApp() {
  const portal = Portal.fromEnv();
  portal.jwks = JwksCache.fixed({ "test-key": publicKey });
  const server = await new Promise((resolve) => {
    const s = createApp(portal).listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    portal,
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { makeToken, startApp };
