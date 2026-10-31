"use strict";

const path = require("node:path");
const nunjucks = require("nunjucks");

nunjucks.configure(path.join(__dirname, "views"), { autoescape: true });

function buildRouter(portal) {
  const router = portal.router();

  router.get("/", async (req, res) => {
    const body = nunjucks.render("page.njk");
    res.type("html").send(
      await portal.layout({ title: "Meine App", body, current: portal.url("/"), user: req.portal.user }),
    );
  });

  return router;
}

module.exports = { buildRouter };
