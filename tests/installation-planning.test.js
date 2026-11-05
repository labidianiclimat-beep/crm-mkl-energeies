import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canEditInstallation, installationBoards, installationCheckReady, installationCheckValue, installationChecksFromForm, installationDay, isFinishedInstallation, isSubcontractor, contractorDocumentReady, INSTALLATION_CHECKS, SUBCONTRACTOR_DOCUMENTS, SUBCONTRACTOR_SPECIALTIES } from "../app/lib/installation-planning.js";
import { grantedModules } from "../app/lib/roles.js";

test("un chantier terminé sort de la liste en cours", () => {
  assert.equal(isFinishedInstallation({ status: "Terminé" }), true);
  assert.equal(isFinishedInstallation({ status: "En cours" }), false);
  assert.equal(isFinishedInstallation({ status: "Planifié" }), false);
  assert.equal(isFinishedInstallation({ status: "Reporté" }), false);
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /Chantiers terminés/);
  assert.match(source, /isFinishedInstallation/);
  assert.match(source, /installPane==="termines"\?doneList:openList/);
});

test("une installation datetime-local tombe sur son jour local", () => {
  assert.equal(installationDay({ start: "2026-10-14T08:30" }), "2026-10-14");
  assert.equal(installationDay({ start: "2026-10-14" }), "2026-10-14");
  assert.equal(isSubcontractor({ kind: "sous-traitant" }), true);
  assert.equal(isSubcontractor({ name: "Équipe PAC" }), false);
});

test("la semaine d’installations fait un tableau par sous-traitant", () => {
  const contractors = [
    { id: "a", name: "Alpha Pose", kind: "sous-traitant" },
    { id: "b", name: "Béton Clim", kind: "sous-traitant" },
    { id: "c", name: "Chantier Sud", kind: "sous-traitant" },
    { id: "interne", name: "Équipe maison", kind: "" },
  ];
  const installations = [
    { id: 1, project: "PAC Dupont", start: "2026-10-13T08:00", contractorId: "a" },
    { id: 2, project: "PAC Martin", start: "2026-10-16T09:00", contractorId: "a" },
    { id: 3, project: "Clim Bernard", start: "2026-10-14T10:00", contractorId: "b" },
    { id: 4, project: "PV Leroy", start: "2026-10-15T07:30", contractorId: "c" },
    { id: 5, project: "Hors semaine", start: "2026-10-20T08:00", contractorId: "c" },
  ];
  const { week, boards } = installationBoards(installations, contractors, "2026-10-14");
  assert.equal(week.start, "2026-10-12");
  assert.equal(week.days.length, 7);
  assert.deepEqual(boards.map(board => board.name), ["Alpha Pose", "Béton Clim", "Chantier Sud"]);
  const alpha = boards.find(board => board.id === "a");
  assert.equal(alpha.columns.find(column => column.day === "2026-10-13").items[0].project, "PAC Dupont");
  assert.equal(alpha.columns.find(column => column.day === "2026-10-16").items[0].project, "PAC Martin");
  assert.equal(alpha.columns.find(column => column.day === "2026-10-12").items.length, 0);
  assert.equal(boards.find(board => board.id === "c").columns.find(column => column.day === "2026-10-15").items.length, 1);
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /Nouveau sous-traitant/);
  assert.match(source, /installationBoards/);
  assert.match(source, /Choisissez au moins une équipe ou un sous-traitant/);
  assert.match(source, /assignees/);
});

test("un chantier avec plusieurs équipes apparaît dans chaque tableau", () => {
  const teams = [
    { id: "clim", name: "Clim Nord", kind: "sous-traitant", specialty: "PAC et climatisation" },
    { id: "iso", name: "Iso Est", kind: "sous-traitant", specialty: "Isolation" },
    { id: "maison", name: "Équipe maison", kind: "" },
  ];
  const installations = [{
    id: 9,
    project: "Maison Muller",
    start: "2026-10-14T08:00",
    assignees: [
      { id: "clim", name: "Clim Nord" },
      { id: "iso", name: "Iso Est" },
      { id: "maison", name: "Équipe maison" },
    ],
  }];
  const { boards } = installationBoards(installations, teams, "2026-10-14");
  assert.deepEqual(boards.map(board => board.name), ["Clim Nord", "Équipe maison", "Iso Est"]);
  assert.equal(boards.every(board => board.columns.some(column => column.items.some(item => item.project === "Maison Muller"))), true);
});

test("la préparation du chantier se lit en point vert ou rouge", () => {
  assert.deepEqual(INSTALLATION_CHECKS.map(item => item.label), [
    "Dossier installation",
    "Financement",
    "Matériel commandé",
    "Matériel arrivé",
    "Petites fournitures",
    "Client avisé",
  ]);
  const checks = installationChecksFromForm({
    check_dossier: "oui",
    check_financement: "non",
    check_commande: "oui",
    check_arrivee: "pb",
    check_fournitures: "oui",
    check_clientAvis: "non",
  });
  const item = { checks };
  assert.equal(installationCheckReady(item, "dossier"), true);
  assert.equal(installationCheckReady(item, "financement"), false);
  assert.equal(installationCheckValue(item, "arrivee"), "pb");
  assert.equal(installationCheckReady(item, "arrivee"), false);
  assert.equal(installationCheckValue(item, "fournitures"), "oui");
  assert.equal(installationCheckValue(item, "clientAvis"), "non");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /INSTALLATION_CHECKS/);
  assert.match(page, /install-checks/);
  assert.match(page, /installationChecksFromForm/);
  assert.match(page, /Modifier le chantier/);
  assert.doesNotMatch(page, /toggleCheck/);
  assert.doesNotMatch(page, /check\.short/);
  assert.match(page, /install-switch/);
  assert.match(page, /Consulter \$\{item\.project\}/);
  assert.match(page, /Consultation de la fiche/);
  assert.doesNotMatch(page, /Statut de \$\{item\.project\}/);
  assert.doesNotMatch(page, /aria-label=\{`Supprimer \$\{item\.project\}`\}/);
  assert.doesNotMatch(page, /name=\{`check_\$\{check\.id\}`\}/);
  assert.equal(canEditInstallation("Secrétariat"), true);
  assert.equal(canEditInstallation("Superadmin"), true);
  assert.equal(canEditInstallation("Admin VIP"), true);
  assert.equal(canEditInstallation("Technicien"), false);
  assert.equal(canEditInstallation("Commercial"), false);
  const secretariat = grantedModules({ role: "Secrétariat", modules: ["Clients", "Devis", "Factures"] });
  assert.ok(secretariat.includes("Chantiers"));
});

test("le sous-traitant demande la personne à contacter et le KBIS", () => {
  assert.ok(SUBCONTRACTOR_SPECIALTIES.includes("Isolation"));
  assert.ok(SUBCONTRACTOR_SPECIALTIES.includes("Fenêtre"));
  assert.deepEqual(SUBCONTRACTOR_DOCUMENTS.map(item => item.label), [
    "Contrat d’entreprise",
    "Assurance décennale",
    "Attestation URSSAF",
    "Attestation RGE",
    "KBIS",
  ]);
  assert.equal(contractorDocumentReady({ name: "rge.pdf", data: "data:application/pdf;base64,AA==" }), true);
  assert.equal(contractorDocumentReady({ name: "rge.pdf", path: "org/subcontractors/12/rge" }), true);
  assert.equal(contractorDocumentReady({ name: "rge.pdf" }), false);
  const save = readFileSync(new URL("../app/lib/use-record-table.js", import.meta.url), "utf8");
  assert.match(save, /offloadSubcontractorDocuments/);
  const ui = readFileSync(new URL("../app/components/subcontractor-documents.js", import.meta.url), "utf8");
  assert.match(ui, /is-missing/);
  assert.match(ui, /is-ready/);
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /SubcontractorDocuments/);
  assert.match(page, /documents:contractorDocs/);
  assert.match(page, /Personne à contacter/);
  assert.match(page, /contractor-table/);
  assert.match(page, /contractor-pills/);
});
