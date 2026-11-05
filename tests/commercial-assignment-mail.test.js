import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCommercialAssignmentEmail,
  shouldNotifyCommercialAssignment,
} from "../app/lib/commercial-assignment-mail.js";

test("le mail part seulement quand un commercial est affecté à un responsable", () => {
  assert.equal(shouldNotifyCommercialAssignment({
    role: "Commercial",
    manager: "Nadia Bernard",
    previousRole: "Commercial",
    previousManager: "Paul Martin",
  }), true);
  assert.equal(shouldNotifyCommercialAssignment({
    role: "Commercial",
    manager: "Nadia Bernard",
    previousRole: "",
    previousManager: "",
  }), true);
  assert.equal(shouldNotifyCommercialAssignment({
    role: "Commercial",
    manager: "Nadia Bernard",
    previousRole: "Commercial",
    previousManager: "nadia bernard",
  }), false);
  assert.equal(shouldNotifyCommercialAssignment({
    role: "Technicien",
    manager: "Nadia Bernard",
  }), false);
  assert.equal(shouldNotifyCommercialAssignment({
    role: "Commercial",
    manager: "Direction",
  }), false);
});

test("le courriel d affectation suit le protocole", () => {
  const mail = buildCommercialAssignmentEmail({
    commercial: {
      name: "Camille Martin",
      email: "camille@mkl-energies.fr",
      zone: "Bas-Rhin",
      city: "Strasbourg",
    },
    manager: { name: "Nadia Bernard", email: "nadia@mkl-energies.fr" },
    company: { tradeName: "MKL Énergies", city: "Souffelweyersheim", email: "contact@mkl-energies.fr" },
    sentAt: new Date("2026-10-23T08:00:00Z"),
  });
  assert.equal(mail.to, "nadia@mkl-energies.fr");
  assert.match(mail.subject, /Affectation d’un commercial — Camille Martin/);
  assert.match(mail.html, /Objet/);
  assert.match(mail.html, /Bonjour Nadia/);
  assert.match(mail.html, /Camille Martin/);
  assert.match(mail.html, /camille@mkl-energies\.fr/);
  assert.match(mail.html, /Bas-Rhin — Strasbourg/);
  assert.match(mail.html, /Nous vous prions d’agréer, Nadia, l’expression de nos salutations distinguées/);
  assert.match(mail.html, /Souffelweyersheim, le 23 octobre 2026/);
  assert.equal(buildCommercialAssignmentEmail({
    commercial: { name: "Camille Martin" },
    manager: { name: "Nadia Bernard", email: "" },
  }), null);
});

test("la creation et la modification d un commercial informent le responsable", () => {
  const invite = readFileSync(new URL("../app/api/users/invite/route.js", import.meta.url), "utf8");
  const patch = readFileSync(new URL("../app/api/users/[id]/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(invite, /notifyCommercialManager/);
  assert.match(patch, /notifyCommercialManager/);
  assert.match(page, /Le responsable commercial a été informé par e-mail/);
});
