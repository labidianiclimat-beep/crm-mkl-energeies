import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOCUMENT_PARTIES_CSS,
  companyEmitterLines,
  documentPartiesHtml,
  companyHasCgv,
  formatCapital,
  formatSiret,
  sanitizeCompany,
  validateCompanyPayload,
} from "../app/lib/company.js";
import { canAccessNav, canAccessWorkspace } from "../app/lib/access-control.js";
import { isAdminVip } from "../app/lib/permissions.js";

test("formate et valide le SIRET", () => {
  assert.equal(formatSiret("12345678901234"), "123 456 789 01234");
  assert.equal(formatCapital("74000"), "74 000 €");
  assert.equal(formatCapital("740000"), "740 000 €");
  assert.equal(formatCapital("74 000 €"), "74 000 €");
  assert.equal(validateCompanyPayload(sanitizeCompany({ legalName: "MKL", siret: "123" })).length, 1);
  assert.equal(validateCompanyPayload(sanitizeCompany({ legalName: "MKL", siret: "12345678901234" })).length, 0);
});

test("l’émetteur reprend les mêmes lignes sur tous les documents", () => {
  const lines = companyEmitterLines(sanitizeCompany({
    legalName: "MKL Énergies",
    siret: "93021297200010",
    vatNumber: "FR47930212972",
    capital: "74 000 €",
    address: "30 Rue des Tuileries",
    postalCode: "67460",
    city: "Souffelweyersheim",
  }));
  assert.deepEqual(lines, [
    "SIRET 930 212 972 00010",
    "TVA FR47930212972",
    "Capital 74 000 €",
    "30 Rue des Tuileries · 67460 Souffelweyersheim",
  ]);
});

test("le bloc documents place l’entreprise à gauche du client", () => {
  const html = documentPartiesHtml(
    sanitizeCompany({
      legalName: "MKL Énergies",
      siret: "12345678901234",
      vatNumber: "FR12345678901",
      capital: "10 000 €",
      phone: "03 88 00 00 00",
      email: "contact@mkl-energies.fr",
      address: "12 rue des Énergies",
      postalCode: "67000",
      city: "Strasbourg",
      rcs: "RCS Strasbourg",
      ape: "4322A",
    }),
    { name: "SCI Horizon", address: "La Baule", phone: "06 00 00 00 00" }
  );
  assert.match(html, /document-parties/);
  assert.match(html, /is-company/);
  assert.match(html, /is-client/);
  assert.match(html, /SIRET 123 456 789 01234/);
  assert.match(html, /TVA FR12345678901/);
  assert.match(html, /Capital 10 000 €/);
  assert.match(html, /12 rue des Énergies · 67000 Strasbourg/);
  assert.doesNotMatch(html, /03 88 00 00 00/);
  assert.doesNotMatch(html, /RCS Strasbourg/);
  assert.doesNotMatch(html, /4322A/);
  assert.ok(html.indexOf("is-company") < html.indexOf("is-client"));
  assert.ok(html.indexOf("MKL") < html.indexOf("SCI Horizon"));
  assert.match(DOCUMENT_PARTIES_CSS, /grid-template-columns:1fr 1fr/);
  assert.match(DOCUMENT_PARTIES_CSS, /@media print\{[^}]*grid-template-columns:1fr 1fr!important/);
  assert.doesNotMatch(DOCUMENT_PARTIES_CSS, /@media\(max-width:760px\)/);
});

test("la fiche entreprise est réservée à l’Admin VIP", () => {
  assert.equal(isAdminVip("Admin VIP"), true);
  assert.equal(isAdminVip("Admin second"), false);
  assert.equal(isAdminVip("Superadmin"), false);
  assert.equal(canAccessNav(["Utilisateurs"], "Entreprise"), false);
  assert.equal(canAccessWorkspace(["Utilisateurs"], "Entreprise", { role: "Admin VIP" }), true);
  assert.equal(canAccessWorkspace(["Utilisateurs"], "Entreprise", { role: "Admin second" }), false);
  assert.equal(canAccessWorkspace(["Utilisateurs"], "Entreprise", { role: "Commercial" }), false);
  assert.equal(canAccessNav(["Utilisateurs"], "Journal d’activités"), false);
  assert.equal(canAccessWorkspace(["Utilisateurs"], "Journal d’activités", { role: "Admin VIP" }), true);
  assert.equal(canAccessWorkspace(["Utilisateurs"], "Journal d’activités", { role: "Admin second" }), false);
  assert.equal(canAccessWorkspace(["Utilisateurs"], "Journal d’activités", { role: "Direction" }), false);
});

test("l’API et les documents utilisent la fiche entreprise", () => {
  const api = readFileSync(new URL("../app/api/company/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const thermal = readFileSync(new URL("../app/etude-thermique/page.js", import.meta.url), "utf8");
  const previstie = readFileSync(new URL("../app/previsite/page.js", import.meta.url), "utf8");
  const contract = readFileSync(new URL("../app/maintenance-contract/page.js", import.meta.url), "utf8");
  const maintenance = readFileSync(new URL("../app/maintenance-form/page.js", import.meta.url), "utf8");
  const pv = readFileSync(new URL("../app/pv-study/page.js", import.meta.url), "utf8");
  assert.match(api, /isAdminVip/);
  assert.match(api, /COMPANY_STATE_KEY/);
  assert.match(page, /\["Entreprise"/);
  assert.match(page, /isAdminVip\(currentRole\)/);
  const form = readFileSync(new URL("../app/components/company-form.js", import.meta.url), "utf8");
  assert.equal(companyHasCgv(sanitizeCompany({ cgvName: "cgv.pdf", cgvData: "data:application/pdf;base64,AAA" })), true);
  assert.equal(companyHasCgv(sanitizeCompany({ cgvName: "cgv.pdf" })), false);
  assert.match(form, /Conditions générales/);
  assert.match(print, /companyHasCgv/);
  assert.match(print, /documentPartiesHtml/);
  assert.match(thermal, /DocumentParties/);
  assert.match(previstie, /DocumentParties/);
  assert.match(contract, /DocumentParties/);
  assert.match(maintenance, /DocumentParties/);
  assert.match(pv, /DocumentParties/);
});
