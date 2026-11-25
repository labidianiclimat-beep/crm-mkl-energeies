import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  articleRangeKey,
  composeMultiSplitBundleItems,
  expandMultiSplitBundleForQuote,
  findClimFourniture,
  findClimInstallation,
  indoorUnitsForOutdoor,
  multiSplitIndoorCount,
  multiSplitSelectionError,
  sameArticleBrand,
  syncIndoorSlots,
  validateMultiSplitBundle,
  withClimStandardAccessories,
} from "../app/lib/clim-multisplit-bundle.js";
import { buildQuoteLinesFromBundle } from "../app/lib/article-picker.js";
import { computeDocumentTotals } from "../app/lib/devis.js";
import { validateBundlePayload, formToBundleRecord } from "../app/lib/article-bundles.js";

const toshibaId = "brand-toshiba";
const mitsuYakId = "brand-mitsu-yak";

const outdoorToshiba = {
  id: "out-1",
  code: "TOS-BI",
  name: "Groupe bi-split Toshiba",
  category: "Climatisation",
  subcategory: "Bi-split",
  brand: "Toshiba",
  brandId: toshibaId,
  sell: 1200,
};
const indoorToshibaA = {
  id: "in-1",
  code: "TOS-UI-25",
  name: "Unité 2,5 kW",
  category: "Climatisation",
  subcategory: "Unités intérieures",
  brand: "Toshiba",
  brandId: toshibaId,
  sell: 380,
};
const indoorToshibaB = {
  id: "in-2",
  code: "TOS-UI-35",
  name: "Unité 3,5 kW",
  category: "Climatisation",
  subcategory: "Unités intérieures",
  brand: "Toshiba",
  brandId: toshibaId,
  sell: 420,
};
const consoleToshiba = {
  id: "con-1",
  code: "TOS-CB-25",
  name: "Console 2,5 kW",
  category: "Climatisation",
  subcategory: "Console basse",
  brand: "Toshiba",
  brandId: toshibaId,
  sell: 450,
};
const consoleDaikin = {
  id: "con-2",
  code: "DAI-CB",
  name: "Console Daikin",
  category: "Climatisation",
  subcategory: "Console basse",
  brand: "Daikin",
  brandId: "brand-daikin",
  sell: 470,
};
const indoorDaikin = {
  id: "in-3",
  code: "DAI-UI",
  name: "Unité Daikin",
  category: "Climatisation",
  subcategory: "Unités intérieures",
  brand: "Daikin",
  brandId: "brand-daikin",
  sell: 400,
};
const outdoorYak = {
  id: "out-yak",
  code: "YAK-TRI",
  name: "Groupe tri-split",
  category: "Climatisation",
  subcategory: "Tri-split",
  brand: "Mitsubishi YAK",
  brandId: mitsuYakId,
  sell: 1800,
};
const indoorYak = {
  id: "in-yak",
  code: "YAK-UI",
  name: "Unité YAK 2,5",
  category: "Climatisation",
  subcategory: "Unités intérieures",
  brand: "Mitsubishi YAK",
  brandId: mitsuYakId,
  sell: 390,
};
const indoorMitsu = {
  id: "in-mitsu",
  code: "MS-UI",
  name: "Unité Mitsubishi Heavy",
  category: "Climatisation",
  subcategory: "Unités intérieures",
  brand: "Mitsubishi Heavy",
  brandId: "brand-mitsu-heavy",
  sell: 410,
};
const fourniture = {
  id: "four-1",
  code: "CLIM-FOUR",
  name: "Fournitures",
  category: "Climatisation",
  subcategory: "Fourniture",
  sourceReference: "picker:fourniture",
  sell: 80,
};
const installation = {
  id: "inst-1",
  code: "CLIM-INST",
  name: "Installation",
  category: "Climatisation",
  subcategory: "Installation",
  sourceReference: "picker:installation",
  sell: 200,
};
const packRo = {
  id: "ro-1",
  code: "PACK-RO",
  name: "Fourniture et installation pack RO",
  category: "Climatisation",
  subcategory: "Fourniture",
  sourceReference: "picker:fourniture",
  sell: 150,
};
const pacFourniture = {
  id: "pac-f",
  code: "PAC-FOUR",
  name: "Fournitures",
  category: "Chauffage",
  subcategory: "Fourniture",
  sourceReference: "picker:fourniture",
  sell: 180,
};
const outdoorOnly = {
  id: "out-2",
  code: "TOS-TRI",
  name: "Groupe tri-split Toshiba",
  category: "Climatisation",
  subcategory: "Tri-split",
  brand: "Toshiba",
  brandId: toshibaId,
  sell: 1600,
};

test("le nombre d unites vient du type de groupe", () => {
  assert.equal(multiSplitIndoorCount("Bi-split"), 2);
  assert.equal(multiSplitIndoorCount("Tri-split"), 3);
  assert.equal(multiSplitIndoorCount("Quadri-split"), 4);
  assert.equal(multiSplitIndoorCount("5 unités"), 5);
  assert.equal(multiSplitIndoorCount("Penta-split"), 5);
  assert.equal(multiSplitIndoorCount({ subcategory: "groupe 5 sorties" }), 5);
  assert.equal(multiSplitIndoorCount("Mono-split"), 0);
});

test("un bi-split Toshiba ne propose que des unites Toshiba", () => {
  const list = indoorUnitsForOutdoor(
    [indoorToshibaA, indoorToshibaB, indoorDaikin, outdoorToshiba, fourniture],
    outdoorToshiba
  );
  assert.deepEqual(list.map(item => item.code), ["TOS-UI-25", "TOS-UI-35"]);
});

test("un bi-split Toshiba propose aussi les consoles basses Toshiba", () => {
  const list = indoorUnitsForOutdoor(
    [indoorToshibaA, consoleToshiba, consoleDaikin, indoorDaikin, outdoorToshiba],
    outdoorToshiba
  );
  assert.deepEqual(list.map(item => item.code), ["TOS-CB-25", "TOS-UI-25"]);
});

test("une console Toshiba reste proposee meme si le groupe a une gamme", () => {
  const outdoor = { ...outdoorToshiba, brand: "Toshiba RAS", range: "RAS" };
  const list = indoorUnitsForOutdoor([consoleToshiba, indoorDaikin], outdoor);
  assert.deepEqual(list.map(item => item.code), ["TOS-CB-25"]);
});

test("une console basse Toshiba peut etre ajoutee au devis", () => {
  const expanded = expandMultiSplitBundleForQuote({
    name: "Pack bi",
    category: "Climatisation",
    subcategory: "Bi-split",
    items: composeMultiSplitBundleItems({
      outdoor: outdoorToshiba,
      indoorIds: [],
      indoorCandidates: [],
      count: 2,
    }),
  }, [outdoorToshiba, indoorToshibaA, consoleToshiba], ["con-1", ""]);
  assert.equal(expanded.items.length, 2);
  assert.equal(expanded.items[1].code, "TOS-CB-25");
  assert.equal(expanded.items[1].name, "Console 2,5 kW");
});

test("un groupe Toshiba au nom technique reste filtre par marque, pas par reference", () => {
  const outdoor = {
    ...outdoorToshiba,
    name: "RAS-4M27U2AVG-E",
    code: "RAS-4M27U2AVG-E",
  };
  assert.equal(articleRangeKey(outdoor), "");
  const list = indoorUnitsForOutdoor([indoorToshibaA, indoorDaikin], outdoor);
  assert.deepEqual(list.map(item => item.code), ["TOS-UI-25"]);
});

test("une gamme Mitsubishi YAK ne propose pas une autre gamme Mitsubishi", () => {
  assert.equal(articleRangeKey(outdoorYak), "yak");
  assert.equal(sameArticleBrand(outdoorYak, indoorYak), true);
  assert.equal(sameArticleBrand(outdoorYak, indoorMitsu), false);
  const list = indoorUnitsForOutdoor([indoorYak, indoorMitsu, indoorToshibaA], outdoorYak);
  assert.deepEqual(list.map(item => item.code), ["YAK-UI"]);
});

test("tri quadri et penta n ajoutent pas fournitures ni installation", () => {
  const tri = composeMultiSplitBundleItems({
    outdoor: outdoorOnly,
    indoorIds: ["in-1", "in-2", "in-1"],
    indoorCandidates: [indoorToshibaA, indoorToshibaB],
    count: 3,
  });
  const quadri = composeMultiSplitBundleItems({
    outdoor: { ...outdoorToshiba, subcategory: "Quadri-split" },
    indoorIds: ["in-1", "in-1", "in-2", "in-2"],
    indoorCandidates: [indoorToshibaA, indoorToshibaB],
    count: 4,
  });
  const penta = composeMultiSplitBundleItems({
    outdoor: { ...outdoorToshiba, subcategory: "5 unités" },
    indoorIds: ["in-1", "in-1", "in-1", "in-2", "in-2"],
    indoorCandidates: [indoorToshibaA, indoorToshibaB],
    count: 5,
  });
  assert.equal(tri.length, 3);
  assert.equal(tri.find(item => item.code === "TOS-UI-25").qty, 2);
  assert.equal(tri.filter(item => item.code.startsWith("TOS-UI")).length, 2);
  assert.equal(tri.some(item => /fourniture|installation/i.test(item.name)), false);
  assert.equal(quadri.length, 3);
  assert.equal(penta.length, 3);
  assert.equal(validateMultiSplitBundle({
    name: "Penta",
    category: "Climatisation",
    subcategory: "5 unités",
    items: penta,
  }).length, 0);
});

test("deux fois la meme unite ne fait qu une ligne", () => {
  const items = composeMultiSplitBundleItems({
    outdoor: outdoorToshiba,
    indoorIds: ["in-1", "in-1"],
    indoorCandidates: [indoorToshibaA, indoorToshibaB],
    extras: [fourniture, installation],
    count: 2,
  });
  assert.equal(items.length, 4);
  assert.equal(items[0].code, "TOS-BI");
  assert.equal(items[1].code, "TOS-UI-25");
  assert.equal(items[1].qty, 2);
  assert.equal(items[2].name, "Fournitures");
  assert.equal(items[2].qty, 1);
  assert.equal(items[3].name, "Installation");
  assert.equal(items[3].qty, 1);
});

test("fourniture et installation gardent leur prix a l ajout au devis", () => {
  const saved = composeMultiSplitBundleItems({
    outdoor: outdoorToshiba,
    indoorIds: [],
    indoorCandidates: [],
    extras: [fourniture, installation],
    count: 2,
  });
  const expanded = expandMultiSplitBundleForQuote({
    name: "Pack bi",
    category: "Climatisation",
    subcategory: "Bi-split",
    items: saved,
  }, [outdoorToshiba, indoorToshibaA, indoorToshibaB, fourniture, installation], ["in-1", "in-2"]);
  const four = expanded.items.find(item => item.code === "CLIM-FOUR");
  const pose = expanded.items.find(item => item.code === "CLIM-INST");
  assert.equal(four.price, 80);
  assert.equal(pose.price, 200);
  const lines = buildQuoteLinesFromBundle({ id: "b", name: "Pack bi", items: expanded.items }, [
    outdoorToshiba,
    indoorToshibaA,
    indoorToshibaB,
    fourniture,
    installation,
  ]);
  assert.equal(lines.find(item => item.name === "Fournitures").unit, 80);
  assert.equal(lines.find(item => item.name === "Installation").unit, 200);
  const totals = computeDocumentTotals({ items: lines });
  assert.equal(Number.isFinite(totals.totalTTC), true);
  assert.ok(totals.totalTTC > 0);
});

test("le devis n ajoute plus fourniture et installation tout seul", () => {
  const template = composeMultiSplitBundleItems({
    outdoor: outdoorToshiba,
    indoorIds: [],
    indoorCandidates: [],
    count: 2,
  });
  const expanded = expandMultiSplitBundleForQuote({
    name: "Pack bi",
    category: "Climatisation",
    subcategory: "Bi-split",
    items: template,
  }, [outdoorToshiba, indoorToshibaA, indoorToshibaB, fourniture, installation], ["in-1", "in-2"]);
  assert.equal(expanded.items.length, 3);
  assert.equal(expanded.fourniture, null);
  assert.equal(expanded.installation, null);
  assert.equal(expanded.items.some(item => /fourniture|installation/i.test(item.name)), false);
});

test("prend fourniture puis installation clim, pas le pack RO", () => {
  const catalog = [packRo, pacFourniture, fourniture, installation, outdoorToshiba];
  assert.equal(findClimFourniture(catalog)?.code, "CLIM-FOUR");
  assert.equal(findClimInstallation(catalog)?.code, "CLIM-INST");
  assert.equal(findClimFourniture([packRo, pacFourniture]), null);
});

test("changer de groupe recale les lignes et efface les unites incompatibles", () => {
  const next = syncIndoorSlots(["in-1", "in-2", "in-1"], 2, [indoorYak]);
  assert.deepEqual(next, ["", ""]);
  const tri = syncIndoorSlots(["in-1"], 3, [indoorToshibaA, indoorToshibaB]);
  assert.deepEqual(tri, ["in-1", "", ""]);
});

test("un groupe multi-split s enregistre sans unites ni prestations", () => {
  const items = composeMultiSplitBundleItems({
    outdoor: outdoorToshiba,
    indoorIds: [],
    indoorCandidates: [],
    count: 2,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].code, "TOS-BI");
  assert.deepEqual(validateBundlePayload(formToBundleRecord({
    name: "Pack bi Toshiba",
    category: "Climatisation",
    subcategory: "Bi-split",
    items,
  }, { organizationId: "org-1" })), []);
});

test("un tri-split peut n envoyer que deux unites sur le devis", () => {
  assert.equal(multiSplitSelectionError({
    outdoor: outdoorOnly,
    count: 3,
    indoorIds: ["in-1", "", ""],
    indoorCandidates: [indoorToshibaA, indoorToshibaB],
  }), "");
  const template = composeMultiSplitBundleItems({
    outdoor: outdoorOnly,
    indoorIds: [],
    indoorCandidates: [],
    extras: [{ ...fourniture, qty: 2 }, { ...installation, qty: 2 }],
    count: 3,
  });
  const expanded = expandMultiSplitBundleForQuote({
    name: "Pack tri",
    category: "Climatisation",
    subcategory: "Tri-split",
    items: template,
  }, [outdoorOnly, indoorToshibaA, indoorToshibaB, fourniture, installation], ["in-1", "in-2", ""]);
  assert.equal(expanded.items.filter(item => item.code.startsWith("TOS-UI")).length, 2);
  assert.equal(expanded.items.length, 5);
  assert.equal(expanded.items.at(-2).name, "Fournitures");
  assert.equal(expanded.items.at(-1).name, "Installation");
  assert.equal(expanded.items.at(-1).qty, 2);
});

test("le serveur refuse une unite d une autre marque", () => {
  const items = composeMultiSplitBundleItems({
    outdoor: outdoorToshiba,
    indoorIds: ["in-1", "in-1"],
    indoorCandidates: [indoorToshibaA],
    extras: [fourniture, installation],
    count: 2,
  }).map((item, index) => (index === 1 ? { ...indoorDaikin, role: "principal", qty: 1 } : item));
  const errors = validateBundlePayload(formToBundleRecord({
    name: "Pack invalide",
    category: "Climatisation",
    subcategory: "Bi-split",
    items,
  }, { organizationId: "org-1" }));
  assert.ok(errors.some(item => /même marque|même gamme|unités intérieures/i.test(item)));
});

test("un tri-split valide passe cote serveur", () => {
  const items = composeMultiSplitBundleItems({
    outdoor: outdoorOnly,
    indoorIds: [],
    indoorCandidates: [],
    extras: [fourniture, installation],
    count: 3,
  });
  const record = formToBundleRecord({
    name: "Pack tri Toshiba",
    category: "Climatisation",
    subcategory: "Tri-split",
    brand: "Toshiba",
    items,
  }, { organizationId: "org-1" });
  assert.deepEqual(validateBundlePayload(record), []);
  assert.equal(items.filter(item => item.code.startsWith("TOS-UI")).length, 0);
  assert.equal(items[0].code, "TOS-TRI");
});

test("le wizard branche le compose multi-split", () => {
  const wizard = readFileSync(new URL("../app/components/bundle-builder-wizard.js", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../app/components/article-picker-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /Ajouter un autre article/);
  assert.match(wizard, /ajoutez fournitures, installations/);
  assert.match(wizard, /withClimStandardAccessories/);
  assert.doesNotMatch(wizard, /ajoutées automatiquement/);
  assert.doesNotMatch(wizard, /Unité intérieure/);
  assert.match(picker, /expandMultiSplitBundleForQuote/);
  assert.match(picker, /withClimStandardAccessories/);
  assert.match(picker, /Unité intérieure/);
  assert.match(picker, /console basse/i);
});

test("FRN-R.R et INST-R.R s ajoutent au devis clim s ils existent deja au catalogue", () => {
  const frn = {
    id: "frn-1",
    code: "FRN-R.R",
    name: "Fourniture clim",
    category: "Climatisation",
    subcategory: "Fourniture",
    sourceReference: "picker:fourniture",
    sell: 90,
    tax: 20,
    status: "Actif",
    active: true,
  };
  const inst = {
    id: "inst-1",
    code: "INST-R.R",
    name: "Installation clim",
    category: "Climatisation",
    subcategory: "Installation",
    sourceReference: "picker:installation",
    sell: 220,
    tax: 20,
    status: "Actif",
    active: true,
  };
  const template = composeMultiSplitBundleItems({
    outdoor: outdoorToshiba,
    indoorIds: [],
    indoorCandidates: [],
    count: 2,
  });
  const catalog = [outdoorToshiba, indoorToshibaA, indoorToshibaB, frn, inst, fourniture, installation];
  const expanded = expandMultiSplitBundleForQuote({
    name: "Pack bi",
    category: "Climatisation",
    subcategory: "Bi-split",
    items: template,
  }, catalog, ["in-1", "in-2"]);
  assert.deepEqual(expanded.items.map(item => item.code), ["TOS-BI", "TOS-UI-25", "TOS-UI-35", "FRN-R.R", "INST-R.R"]);
  assert.equal(expanded.items.find(item => item.code === "FRN-R.R").qty, 2);
  assert.equal(expanded.items.find(item => item.code === "INST-R.R").qty, 2);
  const tri = expandMultiSplitBundleForQuote({
    name: "Pack tri",
    category: "Climatisation",
    subcategory: "Tri-split",
    items: composeMultiSplitBundleItems({
      outdoor: outdoorOnly,
      indoorIds: [],
      indoorCandidates: [],
      extras: [{ ...frn, qty: 1 }, { ...inst, qty: 1 }],
      count: 3,
    }),
  }, [outdoorOnly, indoorToshibaA, indoorToshibaB, frn, inst], ["in-1", "in-1", "in-2"]);
  assert.equal(tri.items.find(item => item.code === "FRN-R.R").qty, 3);
  assert.equal(tri.items.find(item => item.code === "INST-R.R").qty, 3);
  const once = withClimStandardAccessories(expanded.items, catalog, { category: "Climatisation", items: expanded.items });
  assert.equal(once.filter(item => item.code === "FRN-R.R").length, 1);
  assert.equal(once.filter(item => item.code === "INST-R.R").length, 1);
});
