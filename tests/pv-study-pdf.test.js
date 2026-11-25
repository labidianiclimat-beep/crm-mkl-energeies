import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePvStudyResults, formatPvMoney } from "../app/lib/pv-study.js";
import { buildPvStudyPdfBlob } from "../app/lib/pv-study-pdf.js";

function sampleProject() {
  return {
    name: "Maison Dupont 6 kWc",
    client: "Dupont",
    city: "Strasbourg",
    postcode: "67000",
    address: "12 rue des Énergies",
    powerKwp: 6,
    panels: 14,
    panelPower: 430,
    price: 15000,
    estimatedProduction: 7200,
    annualConsumption: 8500,
    selfConsumptionRate: 65,
    electricityPrice: 0.194,
    surplusPrice: 0.04,
    created: "2026-09-21",
    yieldValue: 1200,
    yieldSource: "pvgis",
  };
}

test("les montants PV n ont pas d espace fine ni de slash", () => {
  assert.equal(formatPvMoney(15000), "15 000 €");
  assert.doesNotMatch(formatPvMoney(15000), /\//);
  assert.doesNotMatch(formatPvMoney(15000), /[\u00a0\u202f]/);
});

test("le calcul d étude PV reste cohérent", () => {
  const results = computePvStudyResults(sampleProject());
  assert.equal(results.production, 7200);
  assert.ok(results.selfConsumed > 0);
  assert.ok(results.yearlySaving > 0);
  assert.equal(results.monthly.length, 12);
});

test("le PDF étude PV est vectoriel et reprend le bandeau devis", async () => {
  const blob = await buildPvStudyPdfBlob({
    project: sampleProject(),
    company: { legalName: "MKL Énergies", siret: "93002197200010" },
    logoData: "",
  });
  assert.ok(blob?.size > 1500);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const raw = bytes.toString("latin1");
  assert.match(raw, /PHOTOVOLTA/);
  assert.match(raw, /Dupont|Maison/);
  assert.match(raw, /15 000/);
  assert.doesNotMatch(raw, /15\/000/);
  assert.match(raw, /Page 1/);
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 2, `attendu au moins 2 pages, obtenu ${pages}`);
  assert.doesNotMatch(raw, /SERVICE COMMERCIAL/);
});

test("le telechargement étude PV n utilise plus html2canvas", () => {
  const page = readFileSync(new URL("../app/pv-study/page.js", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../app/lib/pv-study-pdf.js", import.meta.url), "utf8");
  assert.match(page, /downloadPvStudyPdf/);
  assert.match(page, /Retour CRM/);
  const css = readFileSync(new URL("../app/pv-study/study.css", import.meta.url), "utf8");
  assert.match(css, /safe-area-inset-top/);
  assert.doesNotMatch(page, /openCurrentFormPreview/);
  assert.doesNotMatch(page, /html2canvas/);
  assert.match(pdf, /new jsPDF/);
  assert.match(pdf, /pdfLatin/);
  assert.doesNotMatch(pdf, /from ["']html2canvas|html2canvas\(/);
});
