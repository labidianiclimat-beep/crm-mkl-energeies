import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  arrangeRadiatorBundleItems,
  isRadiatorBundle,
  radiatorAccessoryChoices,
  radiatorBundleDrafts,
  foldRadiatorQuoteLines,
  syncRadiatorQuoteLines,
} from "../app/lib/radiator-bundle.js";

const flat = {
  id: "r1",
  code: "FLAT",
  name: "TT-KS Flat 500",
  category: "Chauffage",
  subcategory: "Plat standard blanc",
  qty: 1,
  role: "principal",
};
const brick = {
  id: "r2",
  code: "BRICK",
  name: "TT-KS 500",
  category: "Chauffage",
  subcategory: "Brique réfractaire partielle standard blanc",
  qty: 2,
  role: "principal",
};
const high = {
  id: "r3",
  code: "HAUT",
  name: "TT-KS haut",
  category: "Chauffage",
  subcategory: "Plat haut blanc",
  qty: 1,
  role: "principal",
};
const install = {
  id: "i1",
  code: "INST-RAD",
  name: "Installation radiateur électrique",
  category: "Chauffage",
  subcategory: "Installation",
  role: "labor",
  qty: 1,
  status: "Actif",
};
const pied = {
  id: "p1",
  code: "PIED",
  name: "Pieds TT-KS standard, paire, blanc RAL 9003",
  category: "Chauffage",
  subcategory: "Accessoires",
  status: "Actif",
};
const roulette = {
  id: "roul",
  code: "ROUL",
  name: "Roulettes TT-KS standard",
  category: "Chauffage",
  subcategory: "Accessoires",
  status: "Actif",
};
const pacInstall = {
  id: "pac-i",
  code: "INST-PAC",
  name: "Installations pour pompe à chaleur RO",
  category: "Chauffage",
  subcategory: "Installation",
  status: "Actif",
};

test("trois radiateurs de types différents gardent une seule installation", () => {
  const articles = [pied, roulette, install, pacInstall];
  const arranged = arrangeRadiatorBundleItems([flat, install, brick, { ...install }, high], articles);
  assert.deepEqual(arranged.map(item => item.code), ["FLAT", "BRICK", "HAUT", "INST-RAD"]);
  assert.equal(arranged.at(-1).qty, 4);
  assert.equal(arranged.at(-1).role, "labor");

  const withFoot = arrangeRadiatorBundleItems(arranged, articles, { accessoryId: "p1" });
  assert.deepEqual(withFoot.map(item => item.code), ["FLAT", "BRICK", "HAUT", "PIED", "INST-RAD"]);
  assert.equal(withFoot.find(item => item.code === "PIED").role, "supply");

  const changed = arrangeRadiatorBundleItems(
    withFoot.map(item => item.code === "BRICK" ? { ...item, qty: 1 } : item),
    articles
  );
  assert.equal(changed.find(item => item.code === "PIED").qty, 1);
  assert.equal(changed.find(item => item.code === "INST-RAD").qty, 3);
  assert.deepEqual(changed.map(item => item.code), ["FLAT", "BRICK", "HAUT", "PIED", "INST-RAD"]);

  const switched = arrangeRadiatorBundleItems(changed, articles, { accessoryId: "roul" });
  assert.deepEqual(switched.map(item => item.code), ["FLAT", "BRICK", "HAUT", "ROUL", "INST-RAD"]);
});

test("le menu ne propose que les accessoires radiateur", () => {
  const choices = radiatorAccessoryChoices([flat, pied, roulette, install, pacInstall]);
  assert.deepEqual(choices.map(item => item.code), ["PIED", "ROUL"]);
  assert.equal(isRadiatorBundle({ category: "Chauffage", subcategory: "Pompe à chaleur", items: [] }), false);
  assert.equal(isRadiatorBundle({ items: [flat] }), true);
  const added = arrangeRadiatorBundleItems([flat], [install, pacInstall]);
  assert.equal(added.at(-1).code, "INST-RAD");
  assert.equal(added.at(-1).qty, 1);
});

test("sur le devis la quantité d’installation suit les radiateurs du même groupe", () => {
  const lines = syncRadiatorQuoteLines([
    { id: 1, bundleId: "g1", code: "FLAT", name: flat.name, subcategory: flat.subcategory, qty: 2 },
    { id: 2, bundleId: "g1", code: "PIED", name: pied.name, subcategory: "Accessoires", qty: 1 },
    { id: 3, bundleId: "g1", code: "INST-RAD", name: install.name, subcategory: "Installation", qty: 1 },
    { id: 4, bundleId: "pac", code: "PAC", name: "Altherma", subcategory: "Pompe à chaleur", qty: 1 },
    { id: 5, bundleId: "pac", code: "INST-PAC", name: pacInstall.name, subcategory: "Installation", qty: 1 },
  ]);
  assert.equal(lines.find(item => item.code === "INST-RAD").qty, 2);
  assert.equal(lines.find(item => item.code === "PIED").qty, 1);
  assert.equal(lines.find(item => item.code === "INST-PAC").qty, 1);
});

test("un radiateur sans groupe devient un groupe chauffage", () => {
  const drafts = radiatorBundleDrafts([flat, { ...brick, brand: "Technotherm" }, pied, install, pacInstall], [{
    items: [{ articleId: "r1", code: "FLAT", name: flat.name, role: "principal" }],
  }]);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].brand, "Technotherm");
  assert.equal(drafts[0].category, "Chauffage");
  assert.equal(drafts[0].subcategory, brick.subcategory);
  assert.deepEqual(drafts[0].items.map(item => item.code), ["BRICK"]);
  const route = readFileSync(new URL("../app/api/article-bundles/generate-outdoor/route.js", import.meta.url), "utf8");
  assert.match(route, /radiatorBundleDrafts/);
  const picker = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(picker, /Radiateur électrique"\) && Number\(item\.count/);
});

test("le groupe radiateur affiche le menu accessoire", () => {
  const wizard = readFileSync(new URL("../app/components/bundle-builder-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /aria-label="Pied ou roulette"/);
  assert.match(wizard, /arrangeRadiatorBundleItems/);
  assert.match(wizard, /Choisir un pied ou des roulettes/);
});

test("plusieurs radiateurs gardent une installation et un pied ou des roulettes chacun", () => {
  const lines = foldRadiatorQuoteLines([
    { id: "a", bundleId: "g1", code: "FLAT", name: flat.name, subcategory: flat.subcategory, qty: 1 },
    { id: "i1", bundleId: "g1", code: "INST-RAD", name: install.name, subcategory: "Installation", qty: 1 },
    { id: "b", bundleId: "g2", code: "BRICK", name: brick.name, subcategory: brick.subcategory, qty: 2 },
    { id: "i2", bundleId: "g2", code: "INST-RAD", name: install.name, subcategory: "Installation", qty: 1 },
    { id: "pac", bundleId: "pac", code: "INST-PAC", name: pacInstall.name, subcategory: "Installation", qty: 1 },
  ], [pied, roulette, install]);
  assert.deepEqual(lines.map(item => item.code), ["FLAT", "BRICK", "INST-RAD", "INST-PAC"]);
  assert.equal(lines.find(item => item.code === "INST-RAD").qty, 3);
  const withFoot = foldRadiatorQuoteLines(lines, [pied, roulette, install], { assign: { radiatorId: "a", article: pied } });
  assert.equal(withFoot[0].code, "FLAT");
  assert.equal(withFoot[1].code, "PIED");
  assert.equal(withFoot[1].radiatorFor, "a");
  assert.equal(withFoot.find(item => item.code === "INST-RAD").qty, 3);
  assert.equal(withFoot.filter(item => item.code === "INST-RAD").length, 1);
});
