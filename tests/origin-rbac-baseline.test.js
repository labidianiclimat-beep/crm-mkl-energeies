/**
 * Référence RBAC figée avant l’ajout du module marketing.
 *
 * Admin VIP et Superadmin héritent de ACCESS_MODULES : tout nouveau module leur
 * est accordé automatiquement. Les neuf autres rôles ont une liste explicite et
 * ne doivent rien gagner sans décision. Ce fichier échoue si un module apparaît
 * dans l’un de ces neuf rôles.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ACCESS_MODULES, roleModuleDefaults } from "../app/lib/roles.js";
import { PROSPECT_SOURCES } from "../app/lib/prospects.js";

const defaults = roleModuleDefaults();

/** Rôles dont la liste de modules est énumérée, donc stable par construction. */
const MODULES_FIGES = {
  Direction: [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis",
    "Études thermiques", "Simulateur photovoltaïque", "Factures", "Planning",
    "Gestion des articles", "Grilles tarifaires PDF", "Parc automobile",
    "Tickets internes", "SAV",
  ],
  "Responsable commercial": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis",
    "Études thermiques", "Simulateur photovoltaïque", "Planning",
    "Gestion des articles", "Grilles tarifaires PDF", "Tickets internes",
  ],
  "Responsable prospection": [
    "Tableau de bord", "Prospects", "Agenda commercial", "Gestion des articles",
    "Parc automobile", "Tickets internes",
  ],
  "Prospecteur terrain": ["Prospects"],
  Commercial: [
    "Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis",
    "Études thermiques", "Simulateur photovoltaïque",
    "Photovoltaïque administratif", "Planning", "Grilles tarifaires PDF",
    "Tickets internes",
  ],
  "Responsable technique": [
    "Tableau de bord", "Clients", "Demandes de chiffrage", "Fournisseurs",
    "Planning", "Chantiers", "Équipes d’installation", "Visites techniques",
    "Maintenance", "Photovoltaïque administratif", "Gestion des articles",
    "Grilles tarifaires PDF", "Tickets internes", "SAV",
  ],
  Technicien: [
    "Planning", "Chantiers", "Visites techniques", "Maintenance",
    "Tickets internes", "SAV",
  ],
  Secrétariat: [
    "Tableau de bord", "Agenda commercial", "Clients", "Devis", "Factures",
    "Factures pro forma", "Chantiers", "Tickets internes", "SAV",
  ],
};

test("les rôles non héritants ne gagnent aucun module sans décision", () => {
  for (const [role, attendus] of Object.entries(MODULES_FIGES)) {
    assert.deepEqual(
      defaults[role],
      attendus,
      `Modules du rôle ${role} modifiés. Un module accordé ici doit être une décision explicite, pas un effet de bord.`
    );
  }
});

test("seuls Admin VIP et Superadmin héritent de ACCESS_MODULES", () => {
  assert.deepEqual(defaults["Admin VIP"], ACCESS_MODULES);
  assert.deepEqual(
    defaults.Superadmin,
    ACCESS_MODULES.filter(module => module !== "Factures pro forma")
  );

  const heritants = Object.keys(defaults).filter(role => {
    const modules = defaults[role] || [];
    return ACCESS_MODULES.every(module => modules.includes(module));
  });
  assert.deepEqual(heritants, ["Admin VIP"]);
});

test("le catalogue des rôles reste complet", () => {
  assert.deepEqual(
    Object.keys(defaults).sort(),
    [
      "Admin VIP", "Commercial", "Direction", "Prospecteur terrain",
      "Responsable commercial", "Responsable prospection",
      "Responsable technique", "Secrétariat", "Superadmin", "Technicien",
    ]
  );
});

/**
 * « google » est le marqueur technique des événements synchronisés depuis
 * Google Calendar (app/lib/agenda.js, app/lib/prospect-assign.js). Une
 * provenance de prospect portant cette valeur serait traitée comme un
 * événement agenda et exclue des statistiques commerciales.
 */
test("aucune provenance de prospect n’utilise le marqueur réservé google", () => {
  for (const source of PROSPECT_SOURCES) {
    assert.notEqual(
      String(source).trim().toLowerCase(),
      "google",
      "Le code de la catégorie Google Ads doit rester google_ads."
    );
  }
});
