import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildDevisEmail, clientNotifyEmail, formatDevisValidity } from "../app/lib/devis-mail.js";
import { buildStoredDevisPdf } from "../app/lib/devis-mail-pdf.js";

const client = {
  firstName: "Claire",
  lastName: "Martin",
  name: "Claire Martin",
  email: "claire.martin@email.fr",
};

test("le mail reprend le texte valide avec le logo et le pdf", () => {
  assert.equal(clientNotifyEmail({ email: " Claire.Martin@email.fr " }), "claire.martin@email.fr");
  assert.equal(clientNotifyEmail({ email: "sans-arobase" }), "");
  assert.equal(formatDevisValidity("2026-12-09"), "9 décembre 2026");
  const mail = buildDevisEmail({
    client,
    devis: { number: "DEV-2026-0142", due: "2026-12-09" },
    commercialName: "Julien Keller",
    filename: "Devis Claire Martin DEV-2026-0142.pdf",
    company: {
      legalName: "MKL Énergies",
      tradeName: "MKL Énergies",
      address: "30 Rue des Tuileries",
      postalCode: "67460",
      city: "Souffelweyersheim",
      email: "contact@mkl-energies.fr",
    },
  });
  assert.equal(mail.to, "claire.martin@email.fr");
  assert.equal(mail.subject, "Votre devis MKL Énergies n° DEV-2026-0142");
  assert.match(mail.html, /cid:mkl-logo/);
  assert.match(mail.html, /Votre devis est prêt/);
  assert.match(mail.html, /Bonjour Claire/);
  assert.match(mail.html, /Merci de nous avoir accordé votre confiance/);
  assert.match(mail.html, /préparé par Julien Keller/);
  assert.match(mail.html, /valable jusqu’au 9 décembre 2026/);
  assert.match(mail.html, /Devis Claire Martin DEV-2026-0142\.pdf/);
  assert.match(mail.html, /répondez simplement à cet e-mail/);
  assert.equal(buildDevisEmail({ client: { email: "" }, devis: { number: "DEV-1" } }), null);
});

test("le pdf envoye place les CGV juste apres le devis", async () => {
  const pdf = await buildStoredDevisPdf({
    kind: "Devis",
    number: "DEV-2026-0142",
    date: "2026-11-09",
    due: "2026-12-09",
    client: "Claire Martin",
    items: [{ name: "PAC", code: "PAC", qty: 1, unit: 1000, tax: 20, description: "Pose" }],
  }, {
    clients: [{
      name: "Claire Martin",
      firstName: "Claire",
      lastName: "Martin",
      address: "1 rue Test",
      postalCode: "67000",
      city: "Strasbourg",
    }],
    company: { legalName: "MKL Énergies", tradeName: "MKL Énergies" },
  });
  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 2);
  const { width, height } = document.getPage(1).getSize();
  assert.ok(Math.abs(width - 595.27) < 1);
  assert.ok(Math.abs(height - 841.89) < 1);
});
