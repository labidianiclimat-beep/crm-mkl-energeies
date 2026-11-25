import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  devisStatusAfterClientSend,
  dossierStep,
  dossierStepForAppointment,
  isUnstatedVisit,
  rdvJourneyLabel,
} from "../app/lib/dossier-step.js";

const past = "2020-01-02T10:00:00.000Z";
const future = "2099-01-02T10:00:00.000Z";
const now = new Date("2026-11-13T09:00:00.000Z").getTime();

test("un rendez-vous à venir se lit rendez-vous pris, un passé non classé se lit non statué", () => {
  assert.equal(rdvJourneyLabel({ status: "Planifié", start: future }, now), "Rendez-vous pris");
  assert.equal(rdvJourneyLabel({ status: "Non statué", start: future }, now), "Rendez-vous pris");
  assert.equal(rdvJourneyLabel({ status: "Planifié", start: past }, now), "Non statué");
  assert.equal(rdvJourneyLabel({ status: "Client en réflexion", start: past }, now), "Client en réflexion");
  assert.equal(dossierStep({ appointments: [{ status: "Planifié", start: past }], now }).label, "Non statué");
  assert.equal(dossierStep({ appointments: [{ status: "Client en réflexion", start: past }], now }).label, "Visite classée");
  assert.equal(isUnstatedVisit({ status: "Planifié", start: past }, now), true);
  assert.equal(isUnstatedVisit({ status: "Non statué", start: future }, now), false);
  assert.equal(isUnstatedVisit({ source: "google", status: "Planifié", start: past }, now), false);
  assert.equal(isUnstatedVisit({ status: "Client en réflexion", start: past }, now), false);
});

test("le signé montre les deux sources sans les fusionner", () => {
  const both = dossierStep({
    appointments: [{ id: "a", status: "Commande signée", start: past }],
    quotes: [{ kind: "Devis", status: "Accepté", clientId: "c1" }],
    now,
  });
  assert.equal(both.label, "Signé");
  assert.match(both.detail, /Devis validé/);
  assert.match(both.detail, /Commande signée/);

  const quoteOnly = dossierStep({
    quotes: [{ kind: "Devis", status: "Accepté" }],
    now,
  });
  assert.equal(quoteOnly.detail, "Devis validé");
  assert.doesNotMatch(quoteOnly.detail, /Commande signée/);
});

test("la facture et le chantier passent devant le signé, un agenda google ne classe pas la visite", () => {
  assert.equal(dossierStep({
    appointments: [{ status: "Commande signée", start: past }],
    installations: [{ clientId: "c1", status: "Planifié" }],
    now,
  }).label, "Installation programmée");
  assert.equal(dossierStep({
    appointments: [{ status: "Commande signée", start: past }],
    invoices: [{ kind: "Facture", status: "À payer" }],
    now,
  }).label, "Facturé");
  assert.equal(dossierStep({
    appointments: [{ source: "google", status: "Planifié", start: past }],
    now,
  }).id, "");
});

test("l envoi du mail ne change que un devis à valider", () => {
  assert.equal(devisStatusAfterClientSend("À valider"), "Envoyé");
  assert.equal(devisStatusAfterClientSend("Accepté"), "Accepté");
  assert.equal(devisStatusAfterClientSend("Refusé"), "Refusé");
  assert.equal(devisStatusAfterClientSend("Envoyé"), "Envoyé");
  assert.equal(devisStatusAfterClientSend("Brouillon"), "Brouillon");
});

test("l étape du rendez-vous suit le devis du même client", () => {
  const step = dossierStepForAppointment(
    { id: "rdv", prospectId: "p1", status: "Planifié", start: past },
    {
      appointments: [{ id: "rdv", prospectId: "p1", status: "Planifié", start: past }],
      prospects: [{ id: "p1", clientId: "c1" }],
      billing: [{ clientId: "c1", kind: "Devis", status: "À valider" }],
      now,
    }
  );
  assert.equal(step.label, "Devis à valider");
});

test("le parcours affiché ne touche pas à google ads", () => {
  const step = readFileSync(new URL("../app/lib/dossier-step.js", import.meta.url), "utf8");
  const send = readFileSync(new URL("../app/api/devis/[id]/send/route.js", import.meta.url), "utf8");
  const fiche = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  assert.doesNotMatch(step, /gclid|google_ads|origin_category/);
  assert.doesNotMatch(send, /gclid|google_ads|origin_category/);
  assert.match(send, /devisStatusAfterClientSend/);
  assert.match(fiche, /dossierStep\(/);
});
