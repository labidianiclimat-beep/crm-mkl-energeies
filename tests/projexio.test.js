import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { firstMonthlyDelayLabel, formToDevisRecord } from "../app/lib/devis.js";
import {
  baremeLabel,
  buildProjexioRequest,
  insuranceChoices,
  loanAmountEuros,
  mapSimulation,
  normalizeBaremes,
  projexioBlocker,
  projexioFingerprint,
  projexioFirstMonthlyDays,
  projexioIsCurrent,
  simulationOptions,
  suggestBaremeId,
} from "../app/lib/projexio.js";
import { projexioGet } from "../app/lib/projexio-server.js";
import { documentToWizardState, emptyWizardState, stepErrors, wizardToPayload, wizardTotals } from "../app/lib/devis-wizard.js";

const BAREMES = normalizeBaremes([
  { bareme: 1, montantMin: 200, montantMax: 75000, echeanceMin: 3, echeanceMax: 72, report: 6, taeg: 5.96, tauxSenior: 0.18, tauxDecesPtia: 0.12, tauxDecesPtiaIptItt: 0.26 },
  { bareme: 2, montantMin: 600, montantMax: 22000, echeanceMin: 10, echeanceMax: 120, report: 0, taeg: 7.49, tauxSenior: 0.21, tauxDecesPtia: 0.17, tauxDecesPtiaIptItt: 0.3 },
]);

const SAMPLE = {
  nbEcheances: 12,
  mensualite: 132.69,
  derniereMensualite: 132.57,
  tna: 5.8,
  taeg: 5.96,
  dureeReport: 6,
  fraisDossier: 0,
  coutTotal: 92.16,
  mensualiteAvecAssurance: 135.39,
  tauxAssurance: 0.18,
  derniereMensualiteAvecAssurance: 135.27,
  exemple: "Exemple représentatif.",
  infosAssurance: "Assurance facultative.",
};

test("le montant Projexio garde les centimes", () => {
  assert.equal(loanAmountEuros(12345.67, 345.67), 12000);
  assert.equal(loanAmountEuros(1500.5, 0), 1500.5);
});

test("les barèmes et l assurance viennent de l API", () => {
  assert.equal(BAREMES.length, 2);
  assert.match(baremeLabel(BAREMES[0]), /Barème 1/);
  assert.match(baremeLabel(BAREMES[0]), /report 6 mois/);
  assert.equal(suggestBaremeId(BAREMES, 30000), "1");
  assert.equal(suggestBaremeId(BAREMES, 12000), "1");
  const choices = insuranceChoices(BAREMES[0]);
  assert.deepEqual(choices.map(choice => choice.rate), ["", 0.12, 0.18, 0.26]);
});

test("le barème fixe la première mensualité du devis", () => {
  assert.equal(projexioFirstMonthlyDays(1), 30);
  assert.equal(projexioFirstMonthlyDays("2"), 180);
  assert.equal(projexioFirstMonthlyDays(""), "");
});

test("la mensualité retenue inclut l assurance quand elle est renvoyée", () => {
  const mapped = mapSimulation(SAMPLE);
  assert.equal(mapped.monthlyPayment, 135.39);
  assert.equal(mapped.monthlyExInsurance, 132.69);
  assert.equal(mapped.financeNominalRate, 5.8);
  assert.equal(mapped.financeTaeg, 5.96);
  assert.equal(mapped.financeTaea, 0.18);
  assert.equal(mapped.reportMonths, 6);
  const without = mapSimulation({ ...SAMPLE, mensualiteAvecAssurance: undefined });
  assert.equal(without.monthlyPayment, 132.69);
  const options = simulationOptions({ simulations: [{ ...SAMPLE, nbEcheances: 24 }, SAMPLE] });
  assert.deepEqual(options.map(item => item.financeMonths), [12, 24]);
});

test("la requête n envoie le taux d assurance que s il est choisi", () => {
  const withInsurance = buildProjexioRequest({ action: "simulations", bareme: 1, amount: 1500.5, insuranceRate: 0.18 });
  assert.equal(withInsurance.path, "/");
  assert.equal(withInsurance.params.montant, "1500.5");
  assert.equal(withInsurance.params.assu, "0.18");
  assert.equal(withInsurance.params.nbEcheance, undefined);
  const without = buildProjexioRequest({ action: "simulations", bareme: 1, amount: 1500, insuranceRate: "" });
  assert.equal(without.params.assu, undefined);
  assert.equal(buildProjexioRequest({ action: "baremes" }).path, "/baremes/");
});

test("sans clé le serveur refuse avant d appeler Projexio", async () => {
  await assert.rejects(() => projexioGet("/", {}, {}), /clé/);
});

test("Sofinco reste manuel et Projexio exige une simulation à jour", () => {
  const state = emptyWizardState();
  state.financeMode = "credit";
  state.financier = "Sofinco";
  state.items = [{ id: 1, name: "PAC", qty: 1, unit: 10000, tax: 20 }];
  state.financedAmount = 1000;
  state.projexioApplied = true;
  assert.equal(wizardToPayload(state).financedAmount, 12000);
  assert.equal(stepErrors("finance", state).length, 0);

  state.financier = "Projexio";
  state.projexioBareme = "1";
  state.projexioMinAmount = 200;
  state.projexioMaxAmount = 75000;
  state.personalContribution = 2000;
  assert.match(projexioBlocker(state, 12000), /simulation Projexio/);
  assert.equal(wizardToPayload(state).financedAmount, 12000);

  state.financeMonths = 12;
  state.monthlyPayment = 135.39;
  state.financedAmount = 10000;
  state.financeNominalRate = 5.8;
  state.financeTaeg = 5.96;
  state.projexioInsuranceRate = 0.18;
  state.projexioApplied = true;
  state.projexioFingerprint = projexioFingerprint(state, wizardTotals(state).totalTTC);
  assert.equal(projexioIsCurrent(state, 12000), true);
  state.number = "DEV-2026-0042";
  const payload = wizardToPayload(state);
  assert.equal(payload.financedAmount, 10000);
  assert.equal(payload.monthlyPayment, 135.39);
  assert.equal(payload.financeTaeg, 5.96);
  assert.equal(payload.financeTaea, 0.18);
  assert.equal(payload.firstMonthlyPayment, 30);
  assert.equal(firstMonthlyDelayLabel(payload.firstMonthlyPayment), "30 JRS");
  assert.equal(payload.financeFileNumber, "DEV-2026-0042");
  state.projexioBareme = "2";
  state.projexioFingerprint = projexioFingerprint(state, wizardTotals(state).totalTTC);
  assert.equal(firstMonthlyDelayLabel(wizardToPayload(state).firstMonthlyPayment), "180 JRS");
  state.projexioBareme = "1";
  state.projexioFingerprint = projexioFingerprint(state, wizardTotals(state).totalTTC);
  assert.equal(stepErrors("finance", state).length, 0);

  const { header } = formToDevisRecord(payload);
  assert.equal(header.extra.projexioBareme, "1");
  assert.equal(header.financier, "Projexio");
  const restored = documentToWizardState({ ...payload, id: "11111111-1111-4111-8111-111111111111" });
  assert.equal(projexioIsCurrent(restored, wizardTotals(restored).totalTTC), true);
});

test("la clé Projexio reste une variable serveur", () => {
  const files = [
    "../app/lib/projexio.js",
    "../app/lib/projexio-server.js",
    "../app/api/projexio/route.js",
    "../app/components/projexio-simulator.js",
    "../app/components/devis-wizard.js",
    "../.env.example",
  ];
  const source = files.map(file => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  assert.match(source, /env\.PROJEXIO_API_KEY/);
  assert.match(source, /ProjexioSimulator/);
  assert.match(source, /Pour les saisir à la main/);
  assert.doesNotMatch(source, /yMoeodQe26tX0cqRujju/);
});
