"use strict";

const { makeToken, startApp } = require("./helpers");

let app;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
});

const asStudent = () => ({ "X-Portal-Assertion": makeToken(app.portal), Accept: "text/html" });

test("GET /healthz antwortet ohne Anmeldung mit 200", async () => {
  const res = await fetch(`${app.base}/healthz`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("ohne Anmeldung kommt 401 und kein Cookie", async () => {
  const res = await fetch(`${app.base}/`, { headers: { Accept: "text/html" } });
  expect(res.status).toBe(401);
  expect(await res.text()).toContain("Anmeldung fehlt");
  expect(res.headers.get("set-cookie")).toBeNull();
});

test("ungültige Anmeldung kommt als 401 mit problem+json", async () => {
  const res = await fetch(`${app.base}/`, { headers: { "X-Portal-Assertion": makeToken(app.portal, { aud: ["andere-app"] }) } });
  expect(res.status).toBe(401);
  expect(res.headers.get("content-type")).toBe("application/problem+json");
});

test("eine unbekannte Adresse ohne Anmeldung liefert ebenfalls 401", async () => {
  expect((await fetch(`${app.base}/gibt-es-nicht`)).status).toBe(401);
});

test("Startseite im Portal-Rahmen", async () => {
  const res = await fetch(`${app.base}/`, { headers: asStudent() });
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('<html lang="de">');
  expect(html).toContain('href="#main"');
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(res.headers.get("set-cookie")).toBeNull();
});
