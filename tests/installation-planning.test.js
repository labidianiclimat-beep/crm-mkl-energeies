import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canEditInstallation, compareInstallationsRecent, installationAlertsWithinWeek, installationBoards, installationCheckReady, installationCheckStamp, installationCheckValue, installationChecksFromForm, installationDay, isFinishedInstallation, isSubcontractor, personInitials, contractorDocumentReady, INSTALLATION_CHECKS, SUBCONTRACTOR_DOCUMENTS, SUBCONTRACTOR_SPECIALTIES } from "../app/lib/installation-planning.js";
import { grantedModules } from "../app/lib/roles.js";

test("une cloche signale un chantier incomplet dans la semaine", () => {
  const ready = Object.fromEntries(INSTALLATION_CHECKS.map(check => [check.id, "oui"]));
  const soon = { id: "a", start: "2026-11-28T08:00", status: "Planifié", checks: { dossier: "non" } };
  assert.equal(installationAlertsWithinWeek(soon, "2026-11-24"), true);
  assert.equal(installationAlertsWithinWeek({ ...soon, checks: ready }, "2026-11-24"), false);
  assert.equal(installationAlertsWithinWeek({ ...soon, start: "2026-12-08T08:00" }, "2026-11-24"), false);
  assert.equal(installationAlertsWithinWeek({ ...soon, status: "Terminé" }, "2026-11-24"), false);
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /install-alert-bell/);
  assert.match(source, /mode!=="agenda"&&money/);
  assert.match(source, /canReadMoney\?installationMoneyTotals/);
});

test("le chantier le plus récent est en tête", () => {
  const rows = [
    { id: 1, project: "Ancien", start: "2026-03-02T08:00", created: "2026-03-01T10:00:00.000Z" },
    { id: 2, project: "Récent", start: "2026-11-20T14:00", created: "2026-11-18T10:00:00.000Z" },
    { id: 3, project: "Même jour plus tard", start: "2026-11-20T16:30", created: "2026-11-18T09:00:00.000Z" },
  ];
  const ordered = [...rows].sort(compareInstallationsRecent).map(item => item.project);
  assert.deepEqual(ordered, ["Même jour plus tard", "Récent", "Ancien"]);
  const { boards } = installationBoards(rows, [{ id: "a", name: "Équipe", kind: "sous-traitant" }], "2026-11-20");
  const day = boards[0].columns.find(column => column.day === "2026-11-20");
  assert.deepEqual(day.items.map(item => item.project), ["Même jour plus tard", "Récent"]);
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /sort\(compareInstallationsRecent\)/);
});

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
  assert.equal(personInitials("Rebecca Cadour"), "RC");
  const signed = installationChecksFromForm({ check_financement: "oui", check_dossier: "oui" }, { previous: { financement: "non", dossier: { state: "oui", initials: "AB", by: "Alice Bernard" } }, actorName: "Rebecca Cadour" });
  assert.deepEqual(signed.financement, { state: "oui", initials: "RC", by: "Rebecca Cadour" });
  assert.equal(signed.dossier.initials, "AB");
  assert.equal(installationCheckValue({ checks: signed }, "financement"), "oui");
  assert.equal(installationCheckStamp({ checks: signed }, "financement").initials, "RC");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /install-check-square/);
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
  assert.equal(canEditInstallation("Responsable technique"), true);
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
