import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyValidatedMileage,
  assertIncidentClose,
  assertSingleActiveAssignment,
  buildFleetAlerts,
  controleTechniquePill,
  deadlineInput,
  vidangeKmFromDeadline,
  vidangeMileageTone,
  VIDANGE_INTERVAL_KM,
  daysUntil,
  openDeadline,
  canViewVehicle,
  CORE_VEHICLE_DOC_KINDS,
  DOCUMENT_KINDS,
  costPerKm,
  expenseTotals,
  findExpenseDuplicate,
  assignmentHolderName,
  fleetCapabilities,
  isGarageHolder,
  resolveAssignmentHolder,
  vehicleStatusAfterHolder,
  importTemplateCsv,
  mergeAlerts,
  mileageFlags,
  officialExpenses,
  parseDelimitedTable,
  planDriverChange,
  planAssignmentRelease,
  vehicleStatusAfterRelease,
  previewImport,
  groupVehiclesByCategory,
  sanitizeVehiclePatch,
  searchVehicles,
  vehiclePatchHasFields,
} from "../app/lib/fleet.js";
import { canAccessModule, canPerformAction } from "../app/lib/permissions.js";
import { canAccessNav, resolveAllowedModules } from "../app/lib/access-control.js";
import { roleModuleDefaults } from "../app/lib/roles.js";

function profile(role, extras = {}) {
  return {
    id: extras.id || "user-1",
    role,
    modules: extras.modules || roleModuleDefaults()[role] || [],
    active: true,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    ...extras,
  };
}

test("droits : Super Admin, Admin, VIP et conducteur", () => {
  const vip = fleetCapabilities(profile("Admin VIP"));
  const admin = fleetCapabilities(profile("Superadmin"));
  const direction = fleetCapabilities(profile("Direction"));
  const driver = fleetCapabilities(profile("Technicien"), { assignedVehicleId: "veh-1" });
  const other = fleetCapabilities(profile("Technicien"));

  assert.equal(vip.canCreateVehicle, true);
  assert.equal(vip.canAssign, true);
  assert.equal(vip.canValidate, true);
  assert.equal(admin.canOperate, true);
  assert.equal(admin.canAssign, true);
  assert.equal(admin.canPrepareAssign, true);
  assert.equal(direction.canViewAll, true);
  assert.equal(direction.canOperate, false);
  assert.equal(driver.canEnter, true);
  assert.equal(driver.canViewAll, false);
  assert.equal(other.canEnter, false);
  assert.equal(canPerformAction(profile("Admin VIP"), "assign_fleet"), true);
  assert.equal(canPerformAction(profile("Superadmin"), "assign_fleet"), false);
  assert.equal(canPerformAction(profile("Superadmin"), "manage_fleet"), true);
  const prospecting = fleetCapabilities(profile("Responsable prospection"));
  assert.equal(prospecting.canEnter, true);
  assert.equal(prospecting.canViewAll, true);
  assert.equal(prospecting.canCreateVehicle, true);
  assert.equal(prospecting.canOperate, true);
  assert.equal(prospecting.canAssign, true);
  assert.equal(canAccessModule(profile("Responsable prospection"), "Parc automobile"), true);
  assert.equal(canPerformAction(profile("Responsable prospection"), "manage_fleet"), true);
  assert.equal(canAccessNav(resolveAllowedModules(profile("Responsable prospection"), roleModuleDefaults()), "Parc automobile"), true);
});

test("un salarié ne voit pas le véhicule d’un autre", () => {
  const caps = fleetCapabilities(profile("Commercial", { id: "com-1" }), { assignedVehicleId: "veh-a" });
  assert.equal(canViewVehicle(caps, { id: "veh-a" }), true);
  assert.equal(canViewVehicle(caps, { id: "veh-b" }), false);
});

test("une seule affectation peut être active par véhicule", () => {
  const current = [{ id: "a1", vehicleId: "veh-1", status: "active" }];
  assert.throws(() => assertSingleActiveAssignment(current, "veh-1"), /déjà une affectation active/);
  assert.equal(assertSingleActiveAssignment(current, "veh-2"), true);
  const closed = current.map(item => ({ ...item, status: "closed" }));
  assert.equal(assertSingleActiveAssignment(closed, "veh-1"), true);
});

test("une dépense en attente n’entre pas dans les totaux validés", () => {
  const expenses = [
    { id: "1", status: "validated", amountTtc: 40, category: "carburant", occurredOn: "2026-09-01" },
    { id: "2", status: "pending", amountTtc: 200, category: "carburant", occurredOn: "2026-09-02" },
    { id: "3", status: "rejected", amountTtc: 15, category: "peage", occurredOn: "2026-09-03" },
  ];
  assert.deepEqual(officialExpenses(expenses).map(item => item.id), ["1"]);
  const totals = expenseTotals(expenses);
  assert.equal(totals.total, 40);
  assert.equal(totals.pendingTotal, 200);
  assert.equal(totals.byCategory.carburant, 40);
});

test("l’historique reste intact après changement de conducteur", () => {
  const result = planDriverChange({
    current: { id: "old", status: "active", driverId: "jean", handover: { kind: "handover", date: "2026-01-01" } },
    next: { id: "new", driverId: "lea", handover: { kind: "handover", date: "2026-09-01" } },
    returnInspection: { kind: "return", date: "2026-09-01", km: 12000 },
  });
  assert.equal(result.closed.status, "closed");
  assert.equal(result.closed.id, "old");
  assert.equal(result.opened.driverId, "lea");
  assert.equal(result.history.length, 2);
  assert.equal(result.handovers.length, 3);
  assert.throws(() => planDriverChange({
    current: { id: "old", status: "active" },
    next: { id: "new" },
    returnInspection: {},
  }), /restitution/);
  const released = planAssignmentRelease({
    current: { id: "old", status: "active", driverId: "jean", vehicleStatus: "assigned" },
    returnInspection: { date: "2026-10-19", km: 18000 },
  });
  assert.equal(released.closed.status, "closed");
  assert.equal(released.closed.endKm, 18000);
  assert.equal(released.status, "available");
  assert.equal(vehicleStatusAfterRelease("immobilized"), "immobilized");
  assert.throws(() => planAssignmentRelease({
    current: { id: "old", status: "active" },
    returnInspection: { date: "2026-10-19" },
  }), /kilométrage/);
  const page = readFileSync(new URL("../app/components/fleet-module.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/fleet/assignments/route.js", import.meta.url), "utf8");
  assert.match(page, /Rendre disponible/);
  assert.match(route, /action === "release"/);
});

test("un relevé en attente ne remplace pas le kilométrage validé", () => {
  const vehicle = { currentKm: 10000, lastValidatedReadingAt: "2026-08-01" };
  assert.deepEqual(applyValidatedMileage(vehicle, { status: "pending", km: 14000, readingDate: "2026-09-01" }), vehicle);
  assert.equal(applyValidatedMileage(vehicle, { status: "validated", km: 12000, readingDate: "2026-09-01" }).currentKm, 12000);
  const flags = mileageFlags(9000, 10000);
  assert.equal(flags.low, true);
  assert.equal(mileageFlags(20000, 10000, { jumpThreshold: 5000 }).incoherent, true);
});

test("les alertes d’une même échéance ne sont pas dupliquées", () => {
  const generated = buildFleetAlerts({
    vehicles: [{ id: "v1", status: "assigned", plate: "AB-123-CD", currentKm: 1000 }],
    deadlines: [{ id: "d1", vehicleId: "v1", kind: "assurance", title: "Assurance", dueOn: "2026-09-20", status: "open" }],
    documents: [],
    incidents: [],
    readings: [],
    assignments: [{ vehicleId: "v1", status: "active" }],
    now: new Date("2026-09-26"),
  });
  const again = buildFleetAlerts({
    vehicles: [{ id: "v1", status: "assigned", plate: "AB-123-CD", currentKm: 1000 }],
    deadlines: [{ id: "d1", vehicleId: "v1", kind: "assurance", title: "Assurance", dueOn: "2026-09-20", status: "open" }],
    documents: [],
    incidents: [],
    readings: [],
    assignments: [{ vehicleId: "v1", status: "active" }],
    now: new Date("2026-09-26"),
  });
  const merged = mergeAlerts(generated, again);
  assert.equal(merged.created.length, 0);
  assert.ok(generated.some(item => item.dedupeKey === "deadline:d1"));
});

test("le contrôle technique reste daté et alerte avant l’échéance ou après", () => {
  const input = deadlineInput({ kind: "controle", dueOn: "2026-11-15" });
  assert.equal(input.kind, "controle");
  assert.equal(input.title, "Contrôle technique");
  assert.equal(input.due_on, "2026-11-15");
  const deadlines = [{ id: "ct", vehicleId: "v1", kind: "controle", title: "Contrôle technique", dueOn: "2026-10-20", status: "open" }];
  assert.equal(openDeadline(deadlines, "controle").id, "ct");
  assert.equal(daysUntil("2026-10-20", new Date("2026-10-09T12:00:00")), 11);
  const soon = buildFleetAlerts({
    vehicles: [{ id: "v1", status: "assigned", plate: "AB-123-CD" }],
    deadlines,
    now: new Date("2026-10-09T12:00:00"),
  });
  assert.ok(soon.some(item => item.kind === "deadline_soon" && item.title.includes("20/10/2026")));
  const late = buildFleetAlerts({
    vehicles: [{ id: "v1", status: "assigned", plate: "AB-123-CD" }],
    deadlines: [{ ...deadlines[0], dueOn: "2026-09-01" }],
    now: new Date("2026-10-09T12:00:00"),
  });
  assert.ok(late.some(item => item.kind === "deadline_overdue"));
  const far = buildFleetAlerts({
    vehicles: [{ id: "v1", status: "assigned", plate: "AB-123-CD" }],
    deadlines: [{ ...deadlines[0], dueOn: "2027-06-01" }],
    now: new Date("2026-10-09T12:00:00"),
  });
  assert.equal(far.some(item => String(item.kind).startsWith("deadline")), false);
  const page = readFileSync(new URL("../app/components/fleet-module.js", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/fleet/incidents/route.js", import.meta.url), "utf8");
  assert.match(page, /Prochain contrôle technique/);
  assert.match(page, /<span>Contrôle technique<\/span>/);
  assert.match(page, /fleet-ct-pill/);
  const now = new Date("2026-10-19T12:00:00");
  assert.equal(controleTechniquePill("2027-06-01", now).tone, "ok");
  assert.equal(controleTechniquePill("2026-12-19", now).tone, "due");
  assert.equal(controleTechniquePill("2026-09-01", now).tone, "due");
  assert.equal(controleTechniquePill("", now).label, "");
  assert.match(route, /upsertOpenDeadline/);
  assert.doesNotMatch(route, /Entretien préventif/);
  assert.match(page, /Kilométrage de la dernière vidange/);
  assert.match(page, /fleet-km is-/);
  assert.match(page, /status === "available" \? "is-available"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.fleet-list \.data-row \.status\.is-available\{[^}]*background:#fff[^}]*border:1px solid #405fae/);
  assert.match(page, /<span>Contrôle technique<\/span><span>Kilométrage<\/span>/);
  assert.equal(deadlineInput({ kind: "vidange", dueKm: 70000 }).kind, "vidange");
  assert.equal(vidangeKmFromDeadline({ status: "open", notes: "40000", dueKm: 70000 }), 40000);
  assert.equal(vidangeKmFromDeadline({ status: "open", notes: "", dueKm: 70000 }), 40000);
  assert.equal(vidangeMileageTone(55000, 40000), "");
  assert.equal(vidangeMileageTone(60000, 40000), "");
  assert.equal(vidangeMileageTone(61000, 40000), "due");
  assert.equal(vidangeMileageTone(70000, 40000), "due");
  assert.equal(vidangeMileageTone(72000, 40000), "due");
  assert.equal(vidangeMileageTone(12000, ""), "");
  assert.equal(VIDANGE_INTERVAL_KM, 30000);
  const overdue = buildFleetAlerts({
    vehicles: [{ id: "v1", status: "assigned", plate: "AB-123-CD", currentKm: 71000 }],
    deadlines: [{ id: "vid", vehicleId: "v1", kind: "vidange", status: "open", title: "Vidange", dueKm: 70000, notes: "40000" }],
    now: new Date("2026-10-19T12:00:00"),
  });
  assert.ok(overdue.some(item => item.kind === "deadline_km"));
});

test("un incident ne se clôture pas tout seul", () => {
  assert.throws(() => assertIncidentClose({ previousStatus: "en_cours", nextStatus: "cloture", explicit: false }), /explicite/);
  assert.equal(assertIncidentClose({ previousStatus: "en_cours", nextStatus: "cloture", explicit: true }), true);
});

test("doublon de dépense et coût au kilomètre", () => {
  const existing = [{ id: "e1", vehicleId: "v1", amountTtc: 42.5, occurredOn: "2026-09-01", supplier: "Total" }];
  assert.ok(findExpenseDuplicate(existing, { vehicleId: "v1", amountTtc: 42.5, occurredOn: "2026-09-01", supplier: "total" }));
  assert.equal(findExpenseDuplicate(existing, { vehicleId: "v1", amountTtc: 10, occurredOn: "2026-09-01", supplier: "Total" }), null);
  assert.equal(costPerKm({ total: 100, startKm: 1000, endKm: 1200, from: "2026-09-01", to: "2026-09-30" }).amount, 0.5);
});

test("recherche et import CSV sans doublon", () => {
  const found = searchVehicles([
    { id: "1", plate: "AB-123-CD", brand: "Renault", internalCode: "VH-001", driverName: "Jean" },
    { id: "2", plate: "EF-456-GH", brand: "Peugeot", internalCode: "VH-002", driverName: "Léa" },
  ], "jean");
  assert.deepEqual(found.map(item => item.id), ["1"]);
  const csv = importTemplateCsv();
  const parsed = parseDelimitedTable(csv);
  const preview = previewImport(parsed.rows, {
    existing: [{ plate: "AB-123-CD", internalCode: "VH-001" }],
    users: [{ id: "u1", email: "jean.dupont@mkl-energies.fr" }],
  });
  assert.equal(preview.duplicateCount, 1);
});

test("un véhicule disponible peut être renseigné au garage sans passer affecté", () => {
  assert.equal(isGarageHolder("garage"), true);
  assert.equal(isGarageHolder("Garage automobile"), true);
  assert.deepEqual(resolveAssignmentHolder({ driverId: "garage" }), {
    driverId: null,
    holderLabel: "Garage automobile",
    garage: true,
  });
  assert.equal(vehicleStatusAfterHolder("available", true), "available");
  assert.equal(vehicleStatusAfterHolder("assigned", true), "available");
  assert.equal(vehicleStatusAfterHolder("immobilized", true), "immobilized");
  assert.equal(vehicleStatusAfterHolder("available", false), "assigned");
  assert.equal(assignmentHolderName({ holder_label: "Garage automobile" }, ""), "Garage automobile");
  assert.throws(() => resolveAssignmentHolder({ driverId: "" }), /conducteur/);
  const source = readFileSync(new URL("../app/components/fleet-module.js", import.meta.url), "utf8");
  assert.match(source, /FLEET_GARAGE_LABEL/);
  assert.match(source, /Ce véhicule est disponible\. Vous pouvez quand même renseigner l’affectation/);
  assert.match(source, /value=\{FLEET_GARAGE_DRIVER_ID\}/);
});

test("l’onglet À valider n’empile plus la liste des véhicules", () => {
  const source = readFileSync(new URL("../app/components/fleet-module.js", import.meta.url), "utf8");
  assert.match(source, /tab === "parc" && caps.canViewAll/);
  assert.match(source, /tab === "validation" && caps.canValidate/);
  assert.match(source, /className="fleet-validation"/);
  assert.doesNotMatch(source, /module-actions>\s*\{caps.canViewAll && \(\s*<div className="data-panel fleet-list/);
});

test("la fiche véhicule propose photo et dépôt de documents", () => {
  const source = readFileSync(new URL("../app/components/fleet-module.js", import.meta.url), "utf8");
  assert.match(source, /Prendre une photo/);
  assert.match(source, /Télécharger un document/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /<VehicleDocumentsBlock detail=\{detail\}/);
  assert.match(source, /Ils sont enregistrés en même temps que le véhicule/);
  assert.match(source, /queueFile/);
  assert.deepEqual(CORE_VEHICLE_DOC_KINDS, ["carte_grise", "assurance", "controle", "critair"]);
  assert.ok(DOCUMENT_KINDS.some(item => item.id === "carte_grise"));
  assert.ok(DOCUMENT_KINDS.some(item => item.id === "assurance"));
  assert.ok(DOCUMENT_KINDS.some(item => item.id === "critair"));
  assert.ok(DOCUMENT_KINDS.some(item => item.id === "facture_achat"));
  assert.ok(DOCUMENT_KINDS.some(item => item.id === "contrat_location"));
  assert.ok(DOCUMENT_KINDS.some(item => item.id === "mandat"));
});

test("le parc se sépare dans l ordre des catégories", () => {
  const groups = groupVehiclesByCategory([
    { id: "1", category: "utilitaire_entretien", plate: "AA-111-AA" },
    { id: "2", category: "direction", plate: "BB-222-BB" },
    { id: "3", category: "installation", plate: "CC-333-CC" },
    { id: "4", category: "commercial", plate: "DD-444-DD" },
    { id: "5", category: "utilitaire", plate: "EE-555-EE" },
  ]).filter(group => group.vehicles.length);
  assert.deepEqual(groups.map(group => group.label), [
    "Véhicule de direction",
    "Véhicule commercial",
    "Camionnette d’installation",
    "Utilitaire entretien",
    "À classer",
  ]);
  assert.deepEqual(groups[4].vehicles.map(item => item.plate), ["EE-555-EE"]);
});

test("l enregistrement de fiche accepte une année vide", () => {
  const patch = sanitizeVehiclePatch({
    brand: "Renault",
    model: "Trafic",
    category: "utilitaire_entretien",
    year: "",
    energy: "diesel",
    holdingMode: "propriete",
    notes: null,
    status: "available",
  });
  assert.equal(patch.year, null);
  assert.equal(patch.category, "utilitaire_entretien");
  assert.equal(patch.notes, "");
  assert.equal(patch.holding_mode, "propriete");
  assert.equal(vehiclePatchHasFields({ status: "archived" }), false);
  assert.equal(vehiclePatchHasFields({ status: "archived", category: "direction" }), true);
  assert.throws(() => sanitizeVehiclePatch({ year: "abc" }), /année du véhicule/);
  assert.equal(sanitizeVehiclePatch({ currentKm: "12500" }).current_km, 12500);
  assert.equal(sanitizeVehiclePatch({ brand: "Renault" }).current_km, undefined);
  assert.equal(vehiclePatchHasFields({ currentKm: 10 }), true);
  assert.throws(() => sanitizeVehiclePatch({ currentKm: -3 }), /kilométrage/);
  const source = readFileSync(new URL("../app/components/fleet-module.js", import.meta.url), "utf8");
  assert.match(source, /placeholder="Compteur actuel"/);
  assert.match(source, /currentKm: vehicle\.currentKm/);
  assert.match(source, /returnKm: form\.startKm/);
});

test("navigation Parc automobile pour Admin VIP et Direction", () => {
  const vip = profile("Admin VIP");
  const direction = profile("Direction");
  const commercial = profile("Commercial");
  assert.equal(canAccessModule(vip, "Parc automobile"), true);
  assert.equal(canAccessNav(resolveAllowedModules(vip, roleModuleDefaults()), "Parc automobile"), true);
  assert.equal(canAccessNav(resolveAllowedModules(direction, roleModuleDefaults()), "Parc automobile"), true);
  assert.equal(canAccessNav(resolveAllowedModules(commercial, roleModuleDefaults()), "Parc automobile"), false);
});
