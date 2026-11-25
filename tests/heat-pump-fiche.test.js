import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatHeatPumpDescription } from "../app/lib/heat-pump-specs.js";
import {
  buildHeatPumpFicheAnnexHtml,
  buildHeatPumpFicheDocumentHtml,
  quoteHeatPumpFiches,
  selectedHeatPumpFiches,
} from "../app/lib/heat-pump-fiche.js";
import { documentToWizardState, emptyWizardState, wizardToPayload } from "../app/lib/devis-wizard.js";
import { formToDevisRecord } from "../app/lib/devis.js";

test("la fiche PAC reprend EPREL et les autres cases du formulaire", () => {
  const description = formatHeatPumpDescription(
    { eprel: "123456", ademe: "PAC-99", refrigerant: "R32", scop: "4,6 / 3,8" },
    { brand: "Atlantic", title: "Excellia S Duo" }
  );
  const html = buildHeatPumpFicheDocumentHtml({
    title: "Excellia S Duo",
    brand: "Atlantic",
    code: "EXCELLIA-S-DUO-MO-ATLANTIC",
    specs: { eprel: "123456", ademe: "PAC-99", refrigerant: "R32", scop: "4,6 / 3,8" },
  });
  assert.match(html, /123456/);
  assert.match(html, /PAC-99/);
  assert.match(html, /R32/);
  assert.match(html, /4,6 \/ 3,8/);
  assert.match(html, /N° EPREL/);
  assert.match(description, /Eprel : 123456/);
});

test("un devis propose les fiches PAC et respecte les cases cochees", () => {
  const items = [
    {
      id: "l1",
      articleId: "a1",
      code: "EXCELLIA-S-DUO-MO-ATLANTIC",
      name: "Excellia S Duo",
      category: "Chauffage",
      subcategory: "Pompe à chaleur Duo",
      description: formatHeatPumpDescription({ eprel: "7788" }, { title: "Excellia S Duo", brand: "Atlantic" }),
    },
  ];
  const articles = [{ id: "a1", code: "EXCELLIA-S-DUO-MO-ATLANTIC", name: "Excellia S Duo", ficheName: "fiche.pdf" }];
  const fiches = quoteHeatPumpFiches(items, articles);
  assert.equal(fiches.length, 1);
  assert.equal(fiches[0].specs.eprel, "7788");
  const all = selectedHeatPumpFiches({ items }, articles);
  assert.equal(all.length, 0);
  const none = selectedHeatPumpFiches({ items, printHeatPumpFicheIds: [] }, articles);
  assert.equal(none.length, 0);
  const chosen = selectedHeatPumpFiches({ items, printHeatPumpFicheIds: [fiches[0].key] }, articles);
  assert.equal(chosen.length, 1);
  assert.equal(buildHeatPumpFicheAnnexHtml({ items }, { articles }), "");
  const html = buildHeatPumpFicheAnnexHtml({ items, printHeatPumpFicheIds: [fiches[0].key] }, { articles });
  assert.match(html, /7788/);
});

test("le devis ne joint pas la fiche PAC tout seul", () => {
  const state = emptyWizardState();
  assert.deepEqual(state.printHeatPumpFicheIds, []);
  assert.equal((wizardToPayload(state).printHeatPumpFicheIds || []).length, 0);
});

test("le devis n offre plus les fiches PAC a imprimer", () => {
  const state = emptyWizardState();
  state.clientId = "c1";
  state.printHeatPumpFicheIds = ["a1"];
  state.items = [{ id: 1, articleId: "a1", name: "PAC", qty: 1, unit: 100, tax: 20 }];
  const payload = wizardToPayload(state);
  assert.deepEqual(payload.printHeatPumpFicheIds, []);
});

test("le formulaire article et le recap devis exposent le document PAC", () => {
  const fields = readFileSync(new URL("../app/components/heat-pump-spec-fields.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  assert.match(fields, /Scanner la fiche constructeur/);
  assert.match(fields, /N° EPREL/);
  assert.doesNotMatch(wizard, /Joindre la fiche technique/);
  assert.doesNotMatch(wizard, /Fiches pompe à chaleur/);
  assert.doesNotMatch(print, /buildHeatPumpFicheAnnexHtml/);
});
