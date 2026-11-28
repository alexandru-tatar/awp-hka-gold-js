"use strict";

const path = require("node:path");
const nunjucks = require("nunjucks");

nunjucks.configure(path.join(__dirname, "views"), { autoescape: true });

// Alle Texte der Seite auf Deutsch und Englisch (Regel R-UI-7); portal.language(req) nennt die Sprache der Person.
const TEXTS = {
  de: { title: "Meine App", lead: "Hier entsteht Ihre Anwendung." },
  en: { title: "My app", lead: "Your app is being built here." },
};

function buildRouter(portal) {
  const router = portal.router();

  router.get("/", async (req, res) => {
    const tx = TEXTS[portal.language(req)];
    const body = nunjucks.render("page.njk", { tx });
    res.type("html").send(
      await portal.layout({ title: tx.title, body, current: portal.url("/"), user: req.portal.user }),
    );
  });

  return router;
}

module.exports = { buildRouter, TEXTS };
