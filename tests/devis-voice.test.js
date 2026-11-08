import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretDevisVoice, parseDevisVoice, voiceChoiceResult } from "../app/lib/devis-voice.js";

const plat = {
  id: "flat",
  code: "FLAT",
  name: "TT-KS Plat 500",
  category: "Chauffage",
  subcategory: "Plat standard blanc",
  brand: "Technotherm",
  sell: 100,
};
const brick = {
  id: "brick",
  code: "BRICK",
  name: "TT-KS Brique 750",
  category: "Chauffage",
  subcategory: "Brique standard blanc",
  brand: "Technotherm",
  sell: 120,
};
const pied = { id: "pied", code: "PIED", name: "Pieds TT-KS blanc", subcategory: "Accessoires", sell: 15 };
const roulette = { id: "roul", code: "ROUL", name: "Roulettes TT-KS", subcategory: "Accessoires", sell: 12 };
const install = { id: "inst", code: "INST-RAD", name: "Installation radiateur électrique", subcategory: "Installation", sell: 40 };
const pac = { id: "pac", code: "PAC-PAN", name: "Panasonic Aquarea 5 kW", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Panasonic", sell: 2000 };

const bundles = [
  { id: "g-plat", name: "TT-KS Plat 500", category: "Chauffage", subcategory: "Plat standard blanc", brand: "Technotherm", items: [{ code: "FLAT", name: plat.name, qty: 1 }] },
  { id: "g-brick", name: "TT-KS Brique 750", category: "Chauffage", subcategory: "Brique standard blanc", brand: "Technotherm", items: [{ code: "BRICK", name: brick.name, qty: 1 }] },
  { id: "g-pac", name: "Panasonic Aquarea 5 kW", category: "Chauffage", subcategory: "Pompe à chaleur", brand: "Panasonic", items: [{ code: "PAC-PAN", name: pac.name, qty: 1 }] },
];

const people = [
  { id: "client:1", realId: "1", name: "Jean Dupont", directoryKind: "client", badge: "Client", clientNumber: 42 },
  { id: "client:2", realId: "2", name: "Marie Dupont", directoryKind: "client", badge: "Client", clientNumber: 142 },
  { id: "prospect:3", realId: "3", name: "Paul Martin", directoryKind: "prospect", badge: "Prospect", prospectNumber: 15 },
];

const catalog = { articles: [plat, brick, pied, roulette, install, pac], bundles, people, items: [], tax: 10, step: 0 };

test("la commande reconnaît le client, le groupe, le pied, la TVA et le brouillon", () => {
  assert.deepEqual(parseDevisVoice("devis pour monsieur Dupont"), { intent: "client", who: "any", query: "dupont" });
  assert.equal(parseDevisVoice("ajoute le groupe Panasonic 5 kW").prefer, "group");
  assert.equal(parseDevisVoice("ajoute le groupe Panasonic 5 kW").query, "panasonic 5 kw");
  assert.equal(parseDevisVoice("deux radiateurs plat").qty, 2);
  assert.equal(parseDevisVoice("pied").kind, "pied");
  assert.equal(parseDevisVoice("roulettes pour la brique").target, "brique");
  assert.equal(parseDevisVoice("TVA 5,5").rate, 5.5);
  assert.equal(parseDevisVoice("TVA dix").rate, 10);
  assert.equal(parseDevisVoice("paiement comptant").mode, "cash");
  assert.equal(parseDevisVoice("enregistre le brouillon").intent, "save");
  assert.equal(parseDevisVoice("valide le devis").intent, "validate-blocked");
});

test("un client unique est retenu et deux homonymes restent au choix", () => {
  const martin = interpretDevisVoice("devis pour Martin", catalog);
  assert.equal(martin.recipient.name, "Paul Martin");
  assert.equal(martin.patch.step, 1);
  const dupont = interpretDevisVoice("client Dupont", catalog);
  assert.equal(dupont.choices.length, 2);
  const chosen = voiceChoiceResult(dupont.choices[0], catalog);
  assert.equal(chosen.recipient.name, dupont.choices[0].label);
});

test("deux radiateurs gardent une installation et le pied se place dessous", () => {
  const added = interpretDevisVoice("ajoute deux radiateurs plat Technotherm", catalog);
  assert.equal(added.choices.length, 0);
  assert.equal(added.patch.items.find(item => item.code === "FLAT").qty, 2);
  assert.equal(added.patch.items.filter(item => item.code === "INST-RAD").length, 1);
  assert.equal(added.patch.items.find(item => item.code === "INST-RAD").qty, 2);
  const radiator = added.patch.items.find(item => item.code === "FLAT");
  const withFoot = interpretDevisVoice("pied", { ...catalog, items: added.patch.items, step: 1 });
  assert.equal(withFoot.patch.items.find(item => item.code === "PIED").radiatorFor, radiator.id);
  assert.equal(withFoot.patch.items.filter(item => item.code === "INST-RAD").length, 1);
});

test("deux groupes proches demandent un choix", () => {
  const result = interpretDevisVoice("ajoute le groupe Technotherm", catalog);
  assert.equal(result.choices.length, 2);
  assert.equal(result.choices[0].kind, "bundle");
});

test("le numéro client et la recherche d’article n’ajoutent rien tout seuls", () => {
  const byNumber = interpretDevisVoice("client numéro 42", catalog);
  assert.equal(byNumber.recipient.name, "Jean Dupont");
  assert.match(byNumber.message, /MKL-CL-00042/);
  const spoken = interpretDevisVoice("client numéro zéro zéro zéro quatre deux", catalog);
  assert.equal(spoken.recipient.name, "Jean Dupont");
  const prospect = interpretDevisVoice("prospect numéro 15", catalog);
  assert.equal(prospect.recipient.name, "Paul Martin");
  const seen = interpretDevisVoice("cherche l’article plat Technotherm", catalog);
  assert.equal(seen.patch, undefined);
  assert.equal(seen.choices.length, 1);
  assert.equal(seen.choices[0].kind, "article");
  assert.equal(seen.choices[0].label, "TT-KS Plat 500");
  const added = interpretDevisVoice("ajoute", { ...catalog, pendingChoices: seen.choices });
  assert.equal(added.patch.items.some(item => item.code === "FLAT"), true);
  const waiting = interpretDevisVoice("ajoute", catalog);
  assert.equal(waiting.patch, undefined);
});

test("ajoute le groupe d’articles pose le groupe, même si le micro oublie le d’", () => {
  for (const phrase of [
    "ajoute le groupe d’articles Panasonic",
    "ajoute le groupe article Panasonic",
    "ajoute le groupe Panasonic",
  ]) {
    const result = interpretDevisVoice(phrase, catalog);
    assert.equal(result.patch.items.some(item => item.bundleId === "g-pac"), true, phrase);
  }
  const chain = interpretDevisVoice("client numéro 42 ajoute le groupe Panasonic paiement comptant voir le pdf", catalog);
  assert.equal(chain.recipient.name, "Jean Dupont");
  assert.equal(chain.patch.items.some(item => item.bundleId === "g-pac"), true);
  assert.equal(chain.patch.financeMode, "cash");
  assert.equal(chain.preview, true);
});

test("une phrase ajoute le client, l’article, le paiement et demande le pdf", () => {
  const direct = interpretDevisVoice("ajoute l’article Panasonic", catalog);
  assert.equal(direct.choices?.length || 0, 0);
  assert.equal(direct.patch.items.some(item => item.code === "PAC-PAN"), true);
  const byName = interpretDevisVoice("client Jean Dupont", catalog);
  assert.equal(byName.recipient.name, "Jean Dupont");
  const chain = interpretDevisVoice("client numéro 42 ajoute l’article Panasonic paiement comptant voir le pdf", catalog);
  assert.equal(chain.recipient.name, "Jean Dupont");
  assert.equal(chain.patch.items.some(item => item.code === "PAC-PAN"), true);
  assert.equal(chain.patch.financeMode, "cash");
  assert.equal(chain.preview, true);
  const prospect = interpretDevisVoice("numéro prospect 15", catalog);
  assert.equal(prospect.recipient.name, "Paul Martin");
  assert.match(prospect.message, /MKL-PR-00015/);
});

test("la dictée n’apparaît que pour l’Admin VIP", () => {
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  assert.match(wizard, /isAdminVip\(currentProfile\?\.role\)/);
  assert.match(wizard, /DevisVoiceBar/);
  const bar = readFileSync(new URL("../app/components/devis-voice-bar.js", import.meta.url), "utf8");
  assert.match(bar, /Dicter le devis/);
  assert.match(bar, /fr-FR/);
});
