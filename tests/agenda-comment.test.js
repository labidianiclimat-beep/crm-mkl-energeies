import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agendaCardContact, agendaCommentForSeller } from "../app/lib/prospects.js";
import { agendaProvenance } from "../app/lib/prospect-origin-view.js";

test("la fiche rendez-vous sépare l instruction et le commentaire vendeur", () => {
  const source = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(source, /Instruction/);
  assert.match(source, /Commentaire vendeur/);
  assert.match(source, /readOnly/);
  assert.match(source, /sellerComment: sellerNote/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.appointment-history ul\{[^}]*overflow-y:auto/);
});

test("le commentaire du prospect reste visible pour le vendeur", () => {
  assert.equal(agendaCommentForSeller("Portail à gauche", ""), "Portail à gauche");
  assert.equal(agendaCommentForSeller("Portail à gauche", "Portail à gauche"), "Portail à gauche");
  assert.equal(
    agendaCommentForSeller("Portail à gauche", "Appeler avant d'arriver"),
    "Portail à gauche\nAppeler avant d'arriver"
  );
  assert.equal(
    agendaCommentForSeller("Portail à gauche, chien", "Portail à gauche"),
    "Portail à gauche, chien"
  );
  assert.equal(agendaCommentForSeller("", "Appeler avant d'arriver"), "Appeler avant d'arriver");
});

test("la carte agenda montre le nom, le téléphone et l'adresse", () => {
  const contact = agendaCardContact(
    { prospectName: "ELBERHARDT LAURENT", phone: "", address: "", city: "Lyon" },
    { name: "ELBERHARDT LAURENT", phone: "06 12 34 56 78", address: "12 rue des Lilas", postalCode: "69003", city: "Lyon" }
  );
  assert.equal(contact.lastName, "ELBERHARDT");
  assert.equal(contact.firstName, "LAURENT");
  assert.equal(contact.phone, "06 12 34 56 78");
  assert.match(contact.address, /12 rue des Lilas/);
  assert.match(contact.address, /69003/);
  const source = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  assert.match(source, /agenda-event-link/);
  assert.match(source, /mapsSearchUrl/);
  assert.doesNotMatch(source, /agenda-event-note/);
  assert.match(source, /agenda-event-origin/);
  assert.match(source, /Créer un R2/);
  assert.match(source, /event-commercial/);
  assert.match(source, /agenda-r2-prospect/);
  assert.match(source, /lockedProspect/);
  assert.match(source, /!isR2 && <div className="next-action-kinds compact">/);
  assert.match(source, /Notes pour R2/);
  assert.match(source, /name="r2Notes"/);
  assert.match(source, /agenda-r2/);
  assert.match(source, /appointmentR2Defaults/);
});

test("la carte agenda montre la provenance du rendez-vous", () => {
  assert.equal(agendaProvenance({ source: "Stand Carrefour" }), "Stand Carrefour");
  assert.equal(agendaProvenance({ source: "Contact Meta" }), "Contact Meta");
  assert.equal(
    agendaProvenance({ source: "", originCategory: "meta_ads", originSubtype: "facebook" }),
    "Prospect Face · Facebook"
  );
  assert.equal(agendaProvenance({ source: "" }), "");
});
