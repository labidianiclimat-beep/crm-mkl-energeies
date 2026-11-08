import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  anahMandatPrintSheets,
  buildAnahMandatData,
  quoteHasAirEauHeatPump,
} from "../app/lib/anah-mandat.js";

const client = {
  civilite: "Mme",
  firstName: "Camille",
  lastName: "Martin",
  address: "7 rue des Alouettes",
  postalCode: "67116",
  city: "Reichstett",
  email: "camille.martin@example.fr",
  mobile: "0612345678",
};

test("le mandat ANAH sort des qu une pompe a chaleur air eau est sur le devis", () => {
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Devis",
    items: [
      { name: "Alfea Excellia", category: "Chauffage", subcategory: "Pompe à chaleur air/eau" },
      { name: "Fournitures", category: "Chauffage", subcategory: "Fourniture" },
      { name: "Installation", category: "Chauffage", subcategory: "Installation" },
    ],
  }), true);
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Devis",
    items: [
      { name: "Alfea Excellia", subcategory: "Pompe à chaleur air/eau" },
      { name: "Photovoltaïque 6 kWc", category: "Photovoltaïque" },
    ],
  }), true);
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Devis",
    items: [{ name: "UI monosplit", category: "Climatisation", subcategory: "Monosplit" }],
  }), false);
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Devis",
    items: [{ name: "PAC air/air", subcategory: "Pompe à chaleur air/air" }],
  }), false);
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Facture",
    items: [{ name: "Alfea", subcategory: "Pompe à chaleur air/eau" }],
  }), false);
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Devis",
    items: [
      { name: "Alfea", subcategory: "Pompe à chaleur air/eau" },
      { name: "Ballon thermodynamique 200 L", description: "Ballon thermodynamique air/eau" },
    ],
  }), true);
  assert.equal(quoteHasAirEauHeatPump({
    kind: "Devis",
    items: [{
      name: "ATLANTIC ALFEA EXCELLIA",
      category: "Chauffage",
      subcategory: "Pompe à chaleur",
      description: "Ballon ECS intégré : Oui — 190 L\nGarantie : corps de chauffe et ballon ECS",
    }, {
      name: "FOURNITURES POUR INSTALLATION POMPE À CHALEUR AIR/EAU",
      subcategory: "Fourniture",
    }],
  }), true);
});

test("le mandat reprend les coordonnees du client", () => {
  const data = buildAnahMandatData({
    kind: "Devis",
    date: "2026-10-03",
    items: [{ name: "Alfea", subcategory: "Pompe à chaleur air/eau" }],
  }, { client });
  assert.equal(data.madame, true);
  assert.equal(data.monsieur, false);
  assert.equal(data.lastName, "MARTIN");
  assert.equal(data.firstName, "CAMILLE");
  assert.equal(data.address, "7 RUE DES ALOUETTES");
  assert.equal(data.postal, "67116");
  assert.equal(data.city, "REICHSTETT");
  assert.equal(data.email, "camille.martin@example.fr");
  assert.equal(data.phone, "0612345678");
  assert.equal(data.day, "03");
  assert.equal(data.month, "10");
  assert.equal(data.year, "2026");
  assert.equal(data.clientName, "MARTIN CAMILLE");
  const couple = buildAnahMandatData({ date: "2026-10-03" }, { client: { ...client, civilite: "Mr & Mme" } });
  assert.equal(couple.monsieur, true);
  assert.equal(couple.madame, true);
  const html = anahMandatPrintSheets(data, ["/anah/page-1.jpg", "/anah/page-2.jpg"]);
  assert.match(html, /MARTIN/);
  assert.match(html, /camille\.martin@example\.fr/);
  assert.match(html, /anah-x/);
  assert.match(html, /\/anah\/page-1\.jpg/);
});

test("les pages du mandat sont dans public", () => {
  assert.equal(existsSync(new URL("../public/anah/page-1.jpg", import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/anah/page-2.jpg", import.meta.url)), true);
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(print, /anahMandatToAnnexImages/);
  assert.match(print, /buildAnahMandatAnnexHtml/);
});
