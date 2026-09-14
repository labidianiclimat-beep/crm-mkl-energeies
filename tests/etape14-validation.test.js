/**
 * ÉTAPE 14 — Critères de validation (assertions automatisées).
 * Complète le smoke manuel UI ; ne remplace pas un essai navigateur.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canAssignClientCommercial,
  canViewAllClients,
  findClientDuplicates,
  formToClientRecord,
  validateClientPayload,
} from "../app/lib/clients.js";
import {
  matchesArticleSearch,
  formToArticleRecord,
  validateArticlePayload,
} from "../app/lib/articles.js";
import {
  computeDocumentTotals,
  formToDevisRecord,
  isLockedDevisStatus,
  kindToModule,
  validateDevisPayload,
} from "../app/lib/devis.js";
import { canAccessScopedRow, deniedDirectUrlReason } from "../app/lib/scoping.js";
import { canAccessModule } from "../app/lib/permissions.js";
import { roleModuleDefaults } from "../app/lib/roles.js";

const defaults = roleModuleDefaults();

test("CLIENTS — création / validation / doublons / attribution", () => {
  const record = formToClientRecord(
    {
      type: "Particulier",
      lastName: "Martin",
      firstName: "Alice",
      email: "alice@test.fr",
      phone: "0600000001",
      address: "1 rue Test",
      postalCode: "34000",
      city: "Montpellier",
      status: "Prospect",
      commercialId: "com-1",
    },
    { organizationId: "org", createdBy: "admin", defaultCommercialId: "com-1" }
  );
  assert.equal(validateClientPayload(record).length, 0);
  assert.equal(record.commercial_id, "com-1");

  const duplicates = findClientDuplicates(
    [{ ...record, id: "existing" }],
    { ...record, id: "new" }
  );
  assert.ok(duplicates.length >= 1);

  assert.equal(canViewAllClients({ role: "Admin VIP" }), true);
  assert.equal(canAssignClientCommercial({ role: "Responsable commercial" }), true);
  assert.equal(canAssignClientCommercial({ role: "Commercial" }), false);
});

test("ARTICLES — création / recherche / TVA prix / désactivation logique", () => {
  const article = formToArticleRecord(
    {
      code: "PV-450",
      name: "Panneau 450W",
      category: "Photovoltaïque",
      buy: 100,
      sell: 189,
      tax: 20,
      unit: "Unité",
      status: "Actif",
    },
    { organizationId: "org", createdBy: "admin" }
  );
  assert.equal(validateArticlePayload(article).length, 0);
  assert.equal(article.taux_tva, 20);
  assert.equal(article.prix_vente_ht, 189);
  assert.equal(matchesArticleSearch(article, "panneau"), true);
  assert.equal(article.actif, true);
  const inactive = formToArticleRecord(
    { code: "PV-450", name: "Panneau 450W", category: "Photovoltaïque", buy: 100, sell: 189, tax: 20, status: "Inactif" },
    { organizationId: "org" }
  );
  assert.equal(inactive.actif, false);
});

test("DEVIS — création lignes / remises / multi-TVA / verrou / permissions kind", () => {
  const { header, lines } = formToDevisRecord(
    {
      kind: "Devis",
      status: "Brouillon",
      date: "2026-09-14",
      clientId: "c1",
      client: "Client Test",
      tax: 20,
      globalDiscountType: "percent",
      globalDiscountValue: 10,
      items: [
        { name: "A", qty: 1, unit: 100, tax: 20 },
        { name: "B", qty: 1, unit: 100, tax: 5.5 },
      ],
    },
    { organizationId: "org", createdBy: "u1", defaultCommercialId: "u1" }
  );
  assert.equal(validateDevisPayload(header, lines).length, 0);
  assert.equal(lines.length, 2);

  const totals = computeDocumentTotals({
    tax: 20,
    globalDiscountType: "percent",
    globalDiscountValue: 10,
    items: [
      { name: "A", qty: 1, unit: 100, tax: 20 },
      { name: "B", qty: 1, unit: 100, tax: 5.5 },
    ],
  });
  assert.ok(totals.totalTTC < totals.beforeGlobalTTC);
  // HT après remise doit rester cohérent avec le mix TVA (pas forcé au taux défaut)
  const naiveHt =
    totals.beforeGlobalHT - totals.globalDiscountTTC / 1.2;
  assert.notEqual(Number(totals.totalHT.toFixed(4)), Number(naiveHt.toFixed(4)));
  assert.ok(Math.abs(totals.taxAmount - (totals.totalTTC - totals.totalHT)) < 0.01);

  assert.equal(isLockedDevisStatus("Accepté"), true);
  assert.equal(kindToModule("Facture"), "Factures");
  assert.equal(kindToModule("Devis"), "Devis");

  const commercial = {
    role: "Commercial",
    modules: defaults.Commercial,
    active: true,
    onboarding_completed_at: "2026-01-01",
  };
  assert.equal(canAccessModule(commercial, "Devis"), true);
  assert.equal(canAccessModule(commercial, "Utilisateurs"), false);
});

test("DEVIS sécurité — commercial 2 ne lit pas client/devis commercial 1", () => {
  const row = { organization_id: "org", commercial_id: "com-1", created_by: "com-1" };
  assert.equal(
    canAccessScopedRow(
      { role: "Commercial", organization_id: "org" },
      "com-2",
      row
    ),
    false
  );
  assert.equal(deniedDirectUrlReason("/admin"), "admin");
  assert.equal(deniedDirectUrlReason("/users"), "users");
});
