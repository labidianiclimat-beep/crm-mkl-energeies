import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formToDevisRecord } from "../app/lib/devis.js";
import {
  buildDomofinanceRequest,
  domofinanceBlocker,
  domofinanceFingerprint,
  domofinanceIsCurrent,
  durationOptions,
  insuranceChoices,
  isoDateToDomo,
  loanAmountEuros,
  mapSimulationResult,
  parseDomoAmount,
  suggestMaterialId,
} from "../app/lib/domofinance.js";
import { domofinanceGet } from "../app/lib/domofinance-server.js";
import { documentToWizardState, emptyWizardState, stepErrors, wizardToPayload, wizardTotals } from "../app/lib/devis-wizard.js";

const MATERIALS = [
  { id: "168", equipmentName: "Prêt Coup de Pouce EDF", minAmount: 1500, maxAmount: 75000 },
  { id: "2", equipmentName: "Prêt Economies d'Energie", minAmount: 1500, maxAmount: 75000 },
  { id: "176", equipmentName: "PCH Rénovation", minAmount: 900, maxAmount: 75000 },
  { id: "14", equipmentName: "PCH Photovoltaïque", minAmount: 900, maxAmount: 75000 },
  { id: "214", equipmentName: "Panasonic", minAmount: 3000, maxAmount: 10000 },
  { id: "225", equipmentName: "Viessman", minAmount: 3000, maxAmount: 10000 },
  { id: "222", equipmentName: "Eco-PTZ Partenaires", minAmount: 10000, maxAmount: 30000 },
];

const SAMPLE = {
  type_equipment_id: "14",
  amount: "12000",
  duration: "120",
  premiere_echeance: 30,
  mensualite1: "132,15",
  mens1_ins_lin: "144,46",
  tnc_display: 5.82,
  teg_display: 5.98,
  taea: "2,13",
  cout_du_credit: "3 858,00",
  equipment_name: "PCH Photovoltaïque",
};

test("dates, montants et bornes Domofinance", () => {
  assert.equal(isoDateToDomo("1980-03-15"), "15031980");
  assert.equal(isoDateToDomo("1980-02-31"), "");
  assert.equal(parseDomoAmount("1 237,50"), 1237.5);
  assert.equal(parseDomoAmount("0,00"), 0);
  assert.equal(loanAmountEuros(12000.49, 0), 12000);
  assert.equal(loanAmountEuros(12345.5, 345.5), 12000);
  assert.deepEqual(insuranceChoices({ birthDate: "1980-03-15", inActivity: true, today: new Date(2026, 10, 25) }), ["D", "DIM", "DIMC"]);
  assert.deepEqual(insuranceChoices({ birthDate: "1950-01-01", inActivity: true, today: new Date(2026, 10, 25) }), ["D"]);
  assert.deepEqual(insuranceChoices({ birthDate: "1980-03-15", inActivity: false, today: new Date(2026, 10, 25) }), ["D"]);
});

test("le produit proposé suit les articles du devis", () => {
  assert.equal(suggestMaterialId([{ name: "Kit photovoltaïque 6 kWc", category: "Photovoltaïque" }], MATERIALS), "14");
  assert.equal(suggestMaterialId([{ name: "Unité intérieure", brand: "Panasonic" }], MATERIALS), "214");
  assert.equal(suggestMaterialId([{ name: "PAC air-eau" }], MATERIALS), "168");
  assert.equal(suggestMaterialId([{ name: "Viessmann Vitocal" }], MATERIALS), "225");
});

test("la simulation remplit les champs du devis", () => {
  const options = durationOptions({ "120": "132,15", "60": "236,26", "10": "1 237,50" });
  assert.deepEqual(options.map(item => item.months), [10, 60, 120]);
  assert.equal(options[0].monthlyExInsurance, 1237.5);
  const mapped = mapSimulationResult(SAMPLE);
  assert.equal(mapped.financeMonths, 120);
  assert.equal(mapped.monthlyPayment, 144.46);
  assert.equal(mapped.monthlyExInsurance, 132.15);
  assert.equal(mapped.financeNominalRate, 5.82);
  assert.equal(mapped.financeTaeg, 5.98);
  assert.equal(mapped.financeTaea, 2.13);
  assert.equal(mapped.firstMonthlyPayment, 30);
  assert.equal(mapped.financedAmount, 12000);
  assert.equal(mapped.sellerRetention, null);
});

test("la requête reprend les noms de paramètres Domofinance", () => {
  const durations = buildDomofinanceRequest({
    action: "durees",
    materialId: "14",
    amount: 12000,
    modality: "normal",
    postpone: false,
    birthDate: "1980-03-15",
  });
  assert.equal(durations.path, "/simulation/14");
  assert.equal(durations.params.valueAge, "15031980");
  assert.equal(durations.params.valuePostpone, "false");
  assert.equal(durations.params.valueAgeCoborrower, undefined);

  const result = buildDomofinanceRequest({
    action: "resultat",
    materialId: "14",
    amount: 12000,
    modality: "normal",
    postpone: true,
    birthDate: "1980-03-15",
    months: 120,
    inActivity: true,
    insurance: "DIM",
    hasCoborrower: true,
    coborrowerBirthDate: "1982-07-02",
    coborrowerInActivity: false,
    coborrowerInsurance: "D",
  });
  assert.equal(result.path, "/simulation/resultat/14");
  assert.equal(result.params.valueInsurance, "DIM");
  assert.equal(result.params.valueInActivityCoborrower, "false");
  assert.equal(result.params.valueAgeCoborrower, "02071982");
  assert.equal(buildDomofinanceRequest({ action: "resultat", materialId: "14", amount: 12000, modality: "normal", birthDate: "1980-03-15", months: 120, insurance: "XX" }).error, "Assurance invalide.");
});

test("sans jeton le serveur refuse avant d appeler Domofinance", async () => {
  await assert.rejects(() => domofinanceGet("/materiels", {}, {}), /jeton/);
});

test("Sofinco reste manuel et Domofinance exige une simulation à jour", () => {
  const state = emptyWizardState();
  state.financeMode = "credit";
  state.financier = "Sofinco";
  state.items = [{ id: 1, name: "PAC", qty: 1, unit: 10000, tax: 20 }];
  state.financedAmount = 1000;
  state.domofinanceApplied = true;
  assert.equal(wizardToPayload(state).financedAmount, 12000);
  assert.equal(stepErrors("finance", state).length, 0);

  state.financier = "Domofinance";
  state.personalContribution = 2000;
  state.domofinanceMaterialId = "168";
  state.domofinanceMinAmount = 1500;
  state.domofinanceMaxAmount = 75000;
  state.borrowerBirthDate = "1980-03-15";
  assert.match(domofinanceBlocker(state, 12000), /simulation Domofinance/);
  assert.equal(wizardToPayload(state).financedAmount, 12000);

  state.financeMonths = 120;
  state.monthlyPayment = 144.46;
  state.financedAmount = 10000;
  state.financeNominalRate = 5.82;
  state.financeTaeg = 5.98;
  state.financeTaea = 2.13;
  state.firstMonthlyPayment = 30;
  state.domofinanceApplied = true;
  state.domofinanceFingerprint = domofinanceFingerprint(state, wizardTotals(state).totalTTC);
  assert.equal(domofinanceIsCurrent(state, 12000), true);
  const payload = wizardToPayload(state);
  assert.equal(payload.financedAmount, 10000);
  assert.equal(payload.monthlyPayment, 144.46);
  assert.equal(payload.financeNominalRate, 5.82);
  assert.equal(stepErrors("finance", state).length, 0);

  const { header } = formToDevisRecord(payload);
  assert.equal(header.extra.domofinanceMaterialId, "168");
  assert.equal(header.extra.borrowerBirthDate, "1980-03-15");
  assert.equal(header.extra.domofinanceSellerRetention, "");
  assert.equal(header.financed_amount, 10000);
  assert.equal(header.monthly_payment, 144.46);

  const restored = documentToWizardState({ ...payload, id: "11111111-1111-4111-8111-111111111111" });
  assert.equal(domofinanceIsCurrent(restored, wizardTotals(restored).totalTTC), true);

  restored.personalContribution = 0;
  assert.equal(domofinanceIsCurrent(restored, wizardTotals(restored).totalTTC), false);
});

test("le jeton Domofinance reste une variable serveur", () => {
  const files = [
    "../app/lib/domofinance.js",
    "../app/lib/domofinance-server.js",
    "../app/api/domofinance/route.js",
    "../app/components/domofinance-simulator.js",
    "../app/components/devis-wizard.js",
    "../.env.example",
  ];
  const source = files.map(file => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, /^DOMOFINANCE_API_TOKEN=$/m);
  assert.match(source, /env\.DOMOFINANCE_API_TOKEN/);
  assert.doesNotMatch(source, /X-AUTH-TOKEN["']?\s*[:=]\s*["'][0-9a-f-]{8}-/i);
  assert.match(source, /DomofinanceSimulator/);
  assert.match(source, /Pour les saisir à la main/);
});
