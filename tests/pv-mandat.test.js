import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildPvMandatData,
  pvMandatPrintSheet,
  quoteHasPhotovoltaic,
} from "../app/lib/pv-mandat.js";

const client = {
  civilite: "M.",
  firstName: "Camille",
  lastName: "Martin",
  address: "7 rue des Alouettes",
  postalCode: "67116",
  city: "Reichstett",
};

test("le mandat photovoltaique sort des qu une vente photovoltaique est sur le devis", () => {
  assert.equal(quoteHasPhotovoltaic({
    kind: "Devis",
    items: [
      { name: "Panneau 500 W", category: "Photovoltaïque", subcategory: "Panneaux photovoltaïques" },
      { name: "Fournitures", category: "Photovoltaïque", subcategory: "Fourniture" },
    ],
  }), true);
  assert.equal(quoteHasPhotovoltaic({
    kind: "Devis",
    items: [{ name: "Micro-onduleur", category: "Photovoltaïque", subcategory: "Micro-onduleur" }],
  }), true);
  assert.equal(quoteHasPhotovoltaic({
    kind: "Devis",
    items: [{ name: "Alfea Excellia", category: "Chauffage", subcategory: "Pompe à chaleur air/eau" }],
  }), false);
  assert.equal(quoteHasPhotovoltaic({
    kind: "Facture",
    items: [{ name: "Panneau", category: "Photovoltaïque" }],
  }), false);
  assert.equal(quoteHasPhotovoltaic({
    kind: "Devis",
    items: [{ name: "", free: true, category: "Photovoltaïque" }],
  }), false);
});

test("le mandat photovoltaique reprend le client et laisse la signature vide", () => {
  const data = buildPvMandatData({
    kind: "Devis",
    date: "2026-10-03",
    items: [{ name: "Panneau", category: "Photovoltaïque" }],
  }, { client });
  assert.equal(data.name, "Martin Camille");
  assert.equal(data.address, "7 rue des Alouettes");
  assert.equal(data.postal, "67116 Reichstett");
  assert.equal(data.place, "Reichstett");
  assert.equal(data.day, "03");
  assert.equal(data.month, "10");
  assert.equal(data.year, "2026");
  const site = buildPvMandatData({
    date: "2026-10-03",
    siteDifferent: true,
    siteAddress: "12 rue du Chantier",
    sitePostalCode: "67000",
    siteCity: "Strasbourg",
  }, { client });
  assert.equal(site.address, "12 rue du Chantier");
  assert.equal(site.postal, "67000 Strasbourg");
  assert.equal(site.place, "Strasbourg");
  const html = pvMandatPrintSheet(data);
  assert.match(html, /Martin Camille/);
  assert.match(html, /7 rue des Alouettes/);
  assert.match(html, /67116 Reichstett/);
  assert.match(html, /\/pv-mandat\/page-1\.jpg/);
  assert.doesNotMatch(html, /signature/i);
  assert.equal(existsSync(new URL("../public/pv-mandat/page-1.jpg", import.meta.url)), true);
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(print, /pvMandatToAnnexImages/);
  assert.match(print, /buildPvMandatAnnexHtml/);
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /Mandat photovoltaïque/);
  assert.match(wizard, /quoteHasPhotovoltaic/);
});
