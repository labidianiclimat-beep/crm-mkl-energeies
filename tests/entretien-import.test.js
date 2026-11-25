import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  SOURCE_KIND,
  compareSheetToStock,
  excelSerialToIso,
  googleEventToVisitDraft,
  historicalInvoiceFromRecord,
  inspectXlsxMapping,
  matchCrmClient,
  mergeImportRecords,
  parseFrenchAddress,
  pickImportedContracts,
  preferKeyedClients,
  keepEntretienPilotageRows,
  blankClientFill,
  historicalInvoiceNumber,
  isEntretienInvoiceLine,
  previewEntretienImport,
  previewInvoiceImport,
  recordsFromInvoiceTable,
  recordsFromTable,
  rowsFromXlsx,
  shouldImportGoogleEvent,
  splitPersonName,
  suggestClientForTitle,
  isUnlistedEntretienVisit,
  visitStatsByClient,
  pickLatestReviewByClient,
} from "../app/lib/entretien-import.js";
import { buildCrmVisitRecord, buildManualEntretienContract, weekRange } from "../app/lib/entretien-agenda.js";

test("parse nom, adresse et dates Excel", () => {
  assert.deepEqual(splitPersonName("DAVIATTE Jean-Marie"), { nom: "DAVIATTE", prenom: "Jean-Marie" });
  assert.deepEqual(parseFrenchAddress("2 impasse des Vergers 67640 LIPSHEIM"), {
    adresse: "2 impasse des Vergers",
    codePostal: "67640",
    ville: "LIPSHEIM",
  });
  assert.equal(excelSerialToIso("44727"), "2022-06-15");
  assert.equal(excelSerialToIso("23/03/0201"), "");
});

test("fusionne YILDIZ et Rebecca sans doublon de nom+adresse", () => {
  const yildiz = [{
    source: "yildiz",
    displayName: "COQUELET",
    nom: "COQUELET",
    prenom: "",
    adresse: "2 impasse des Vergers",
    codePostal: "67640",
    ville: "LIPSHEIM",
    amountHt: 345,
    matchKey: "coquelet|67640 lipsheim 2 impasse des vergers",
  }];
  const rebecca = [{
    ...yildiz[0],
    source: "rebecca",
    contractNumber: "1384",
    signed: true,
  }];
  const merged = mergeImportRecords([yildiz, rebecca]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].contractNumber, "1384");
  assert.equal(merged[0].signed, true);
  assert.deepEqual(merged[0].sources, ["yildiz", "rebecca"]);
});

test("les factures d entretien ajoutent le client manquant et datent l intervention", () => {
  const details = recordsFromInvoiceTable([
    ["Numéro du document", "Date du document", "Nom du client", "Référence du produit", "Libellé du produit", "Prix unitaire HT", "Montant HT net"],
    ["F-24020001", "13/02/2024", "ROLAND-VALMY Jean-François", "SAV-1", "SAV", "486", "486"],
    ["F-24020002", "13/02/2024", "JACKY KUENY", "Contrat d'entretien", "Contrat d'entretien", "198", "198"],
  ], { sheet: "details" });
  assert.equal(details.skipped, 1);
  assert.equal(details.records.length, 1);
  assert.equal(details.records[0].invoiceDate, "2024-02-13");
  assert.equal(isEntretienInvoiceLine(details.records[0]), true);

  const tiime = recordsFromInvoiceTable([
    ["Nom du client", "Prénom du client", "Rue", "Code postal", "Ville", "Entretien / Autre", "Montant HT", "TVA", "Montant TTC", "Taux de TVA", "N° document", "Date", "Type de document", "Désignation (1re ligne)", "Remarques"],
    ["PHILBERT", "Christian", "216 Route de la Ronsenière", "67420", "Plaine", "Entretien", "245", "24.5", "269.5", "0.1", "4", "46101", "Facture", "Contrat d'entretien 2026", ""],
    ["PHILBERT", "Christian", "216 Route de la Ronsenière", "67420", "Plaine", "Entretien", "10", "1", "11", "0.1", "5", "46101", "Avoir", "Contrat d'entretien", ""],
  ], { sheet: "tiime" });
  assert.equal(tiime.records.length, 1);
  assert.equal(tiime.records[0].nom, "PHILBERT");
  assert.equal(tiime.records[0].prenom, "Christian");
  assert.equal(tiime.records[0].codePostal, "67420");
  assert.equal(tiime.records[0].invoiceDate, "2026-03-20");
  assert.equal(historicalInvoiceNumber(tiime.records[0]).startsWith("FAC-"), false);
  assert.match(historicalInvoiceNumber(details.records[0]), /^ENT-HIST-F-24020002$/);

  const preview = previewInvoiceImport({
    rows: [...tiime.records, ...details.records, {
      ...tiime.records[0],
      invoiceNumber: "9",
      displayName: "Christian PHILBERT",
      nom: "PHILBERT",
      prenom: "Christian",
      codePostal: "",
    }],
    clients: [{
      id: "c-jacky",
      lastName: "KUENY",
      firstName: "Jacky",
      name: "Jacky KUENY",
      postalCode: "",
      phone: "06 00 00 00 00",
      address: "1 rue Déjà",
    }],
  });
  const jacky = preview.items.find(item => item.invoiceNumber === "F-24020002");
  const philbert = preview.items.find(item => item.invoiceNumber === "4");
  const again = preview.items.find(item => item.invoiceNumber === "9");
  assert.equal(jacky.matchStatus, "linked");
  assert.equal(jacky.clientId, "c-jacky");
  assert.deepEqual(jacky.fillFields, []);
  assert.equal(philbert.matchStatus, "created");
  assert.equal(again.matchStatus, "linked");
  assert.equal(again.provisionalId, philbert.provisionalId);
  assert.equal(previewInvoiceImport({
    rows: [{ ...details.records[0], displayName: "BRY", nom: "BRY", prenom: "", invoiceNumber: "F-1", matchKey: "bry|" }],
    clients: [],
  }).items[0].matchStatus, "review");
  assert.equal(blankClientFill({ telephone: "06 00 00 00 00", adresse: "" }, { phone: "07 11 11 11 11", adresse: "2 rue Neuve" }).adresse, "2 rue Neuve");
  assert.equal(blankClientFill({ telephone: "06 00 00 00 00" }, { phone: "07 11 11 11 11" }).telephone, undefined);
});

test("une facture historique n’a jamais de devis CRM", () => {
  const invoice = historicalInvoiceFromRecord({
    contractNumber: "1384",
    amountHt: 345,
    subscribedOn: "2022-04-29",
    sources: ["rebecca"],
  }, { clientId: "c1" });
  assert.equal(invoice.origin, "historique");
  assert.equal(invoice.devis_id, null);
  assert.equal(invoice.external_number, "ENT-XLS-1384");
});

test("un evenement agenda ne pose pas de realisation", () => {
  const draft = googleEventToVisitDraft({
    id: "evt-1",
    summary: "Entretien annuel Dupont",
    start: { dateTime: "2024-03-12T08:00:00Z" },
  }, { organizationId: "org", userId: "tech", calendarId: "primary" });
  assert.equal(draft.source, "google");
  assert.equal(draft.nature_proposed, "entretien");
  assert.equal(draft.realization_status, "inconnu");
  assert.equal(draft.realization_date, null);
  const maintenance = googleEventToVisitDraft({
    id: "evt-2",
    summary: "Dupont PAC",
    start: { dateTime: "2024-03-12T08:00:00Z" },
    _calendarSummary: "Maintenance Yildiz",
  }, { organizationId: "org", userId: "tech", calendarId: "tech@mkl.fr", calendarSummary: "Maintenance Yildiz" });
  assert.equal(maintenance.nature_proposed, "entretien");
  assert.equal(maintenance.realization_status, "inconnu");
});

test("le rapprochement CRM exige telephone ou nom+cp", () => {
  const record = { nom: "DUPONT", prenom: "Jean", codePostal: "67000", phone: "0612345678", email: "" };
  const linked = matchCrmClient(record, [{ id: "1", lastName: "Dupont", firstName: "Jean", postalCode: "67000", phone: "06 12 34 56 78" }]);
  assert.equal(linked.status, "linked");
  const created = matchCrmClient(record, [{ id: "2", lastName: "Martin", firstName: "Paul", postalCode: "68000" }]);
  assert.equal(created.status, "created");
});

test("les doublons d’import gardent la fiche rattachee a la cle", () => {
  const rows = preferKeyedClients([
    { client_id: "old", is_last_entretien_unknown: true },
    { client_id: "new", is_last_entretien_unknown: true },
  ], {
    clients: [
      { id: "old", nom: "DUPONT", prenom: "Jean", adresse: "1 rue", code_postal: "67000", ville: "Strasbourg" },
      { id: "new", nom: "DUPONT", prenom: "Jean", adresse: "1 rue", code_postal: "67000", ville: "Strasbourg" },
    ],
    keyedClientIds: ["new"],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client_id, "new");
});

test("le pilotage ignore les fiches orphelines d’un second import", () => {
  const rows = keepEntretienPilotageRows([
    { client_id: "orphan" },
    { client_id: "keyed" },
    { client_id: "visite" },
  ], {
    keyedClientIds: ["keyed"],
    visitClientIds: ["visite"],
  });
  assert.deepEqual(rows.map(row => row.client_id), ["keyed", "visite"]);
});

test("un contrat orphelin revient sur la fiche importee", () => {
  const picked = pickImportedContracts(
    [{ id: "c1", client_id: "orphan", number: "12", updated_at: "2" }],
    {
      clients: [
        { id: "orphan", nom: "DUPONT", prenom: "Jean", adresse: "1 rue", code_postal: "67000", ville: "Strasbourg" },
        { id: "keyed", nom: "DUPONT", prenom: "Jean", adresse: "1 rue", code_postal: "67000", ville: "Strasbourg" },
      ],
      keys: [{ import_key: "dupont jean|67000 strasbourg 1 rue", client_id: "keyed" }],
    }
  );
  assert.equal(picked.length, 1);
  assert.equal(picked[0].client_id, "keyed");
  assert.equal(picked[0].number, "12");
});

test("chaque cle Excel garde sa ligne meme si le nom se ressemble", () => {
  const picked = pickImportedContracts(
    [{ id: "c1", client_id: "a", number: "1", updated_at: "1" }],
    {
      clients: [
        { id: "a", nom: "MARTIN", prenom: "Paul", adresse: "10 rue", code_postal: "67000", ville: "Strasbourg" },
        { id: "b", nom: "MARTIN", prenom: "Paul", adresse: "10 rue", code_postal: "67000", ville: "Strasbourg" },
      ],
      keys: [
        { import_key: "a", client_id: "a" },
        { import_key: "b", client_id: "b" },
      ],
    }
  );
  assert.equal(picked.length, 2);
  assert.deepEqual(picked.map(row => row.import_key), ["a", "b"]);
});

test("compare un Sheet au stock Excel", () => {
  const stock = [{ matchKey: "a|67000", displayName: "A" }, { matchKey: "b|67000", displayName: "B" }];
  const sheet = recordsFromTable([
    ["Client", "Adresse"],
    ["A", "1 rue 67000 Strasbourg"],
    ["C", "2 rue 67100 Strasbourg"],
  ], SOURCE_KIND.sheet);
  const comparison = compareSheetToStock(sheet, stock);
  assert.equal(comparison.sheetCount, 2);
  assert.ok(comparison.onlySheet >= 1);
});

test("un evenement d’installation nette n’entre pas dans les visites à classer", () => {
  const keep = googleEventToVisitDraft({
    id: "evt-1",
    summary: "Entretien annuel Dupont",
    start: { dateTime: "2024-03-12T08:00:00Z" },
  }, { organizationId: "org", userId: "tech", calendarId: "primary" });
  assert.equal(shouldImportGoogleEvent(keep), true);
  const untitled = googleEventToVisitDraft({
    id: "evt-empty",
    summary: "",
    location: "12 rue Dupont",
    start: { dateTime: "2024-03-12T08:00:00Z" },
  }, { organizationId: "org", userId: "tech", calendarId: "tech@mkl.fr" });
  assert.equal(untitled.title, "12 rue Dupont");
  assert.equal(shouldImportGoogleEvent(untitled), true);
  assert.equal(shouldImportGoogleEvent({ google_event_id: "x", title: "" }), false);
  assert.equal(shouldImportGoogleEvent({
    google_event_id: "x",
    title: "Pose PAC Martin",
    nature_proposed: "installation",
    nature_status: "propose",
  }), false);
});

test("un titre agenda rapproche le client importé via le lieu", () => {
  const hit = suggestClientForTitle("Entretien annuel", [
    { id: "1", lastName: "DUPONT", firstName: "Jean", name: "Jean DUPONT" },
  ], "12 rue Dupont 67000 Strasbourg");
  assert.equal(hit?.id, "1");
  const unique = suggestClientForTitle("Maintenance COQUELET", [
    { id: "2", nom: "COQUELET", prenom: "", ville: "LIPSHEIM", code_postal: "67640" },
  ]);
  assert.equal(unique?.id, "2");
  const ambiguous = suggestClientForTitle("Entretien DUPONT", [
    { id: "a", lastName: "DUPONT", firstName: "Jean" },
    { id: "b", lastName: "DUPONT", firstName: "Paul" },
  ]);
  assert.equal(ambiguous, null);
  const withPlace = suggestClientForTitle("Entretien DUPONT 67640 LIPSHEIM", [
    { id: "a", lastName: "DUPONT", firstName: "Jean", code_postal: "67000", ville: "STRASBOURG" },
    { id: "b", lastName: "DUPONT", firstName: "Paul", code_postal: "67640", ville: "LIPSHEIM" },
  ]);
  assert.equal(withPlace?.id, "b");
  assert.equal(suggestClientForTitle("Entretien annuel Hayange", [
    { id: "hay", lastName: "HAY", firstName: "DMIEN" },
  ]), null);
  assert.equal(suggestClientForTitle("Maintenance HAY DMIEN", [
    { id: "hay", lastName: "HAY", firstName: "DMIEN" },
  ])?.id, "hay");
});

test("un entretien d’agenda sans client importé est hors liste", () => {
  const imported = new Set(["c1"]);
  assert.equal(isUnlistedEntretienVisit({ title: "Maintenance Martin", nature_proposed: "entretien" }, imported), true);
  assert.equal(isUnlistedEntretienVisit({ title: "Maintenance Martin", nature_proposed: "entretien", client_id: "c1" }, imported), false);
  assert.equal(isUnlistedEntretienVisit({ title: "Pose PAC", nature_proposed: "installation", nature_status: "propose" }, imported), false);
  assert.equal(isUnlistedEntretienVisit({ title: "Maintenance Martin", nature_proposed: "entretien", nature_status: "ecarte" }, imported), false);
});

test("les etoiles d’un contrat comptent les entretiens passes du client", () => {
  const stats = visitStatsByClient([
    { client_id: "c1", title: "Maintenance Dupont", nature_proposed: "entretien", scheduled_start: "2024-03-12T08:00:00Z" },
    { client_id: "c1", title: "Entretien annuel", nature_proposed: "entretien", scheduled_start: "2025-03-12T08:00:00Z" },
    { client_id: "c1", title: "Dupont", scheduled_start: "2026-09-21T08:00:00Z" },
    { client_id: "c1", title: "Pose PAC", nature_proposed: "installation", scheduled_start: "2026-09-20T08:00:00Z" },
    { client_id: "c1", title: "Dépannage Dupont", nature_proposed: "depannage", scheduled_start: "2026-09-18T08:00:00Z" },
    { client_id: "c2", title: "Maintenance futur", nature_proposed: "entretien", scheduled_start: "2028-01-01T08:00:00Z" },
  ], { today: "2026-09-28" });
  assert.equal(stats.get("c1").count, 3);
  assert.equal(stats.get("c1").lastOn, "2026-09-21");
  assert.equal(stats.get("c2"), undefined);
});

test("un nom court ne vole pas les RDV d’une ville du type Hayange", () => {
  const clientsById = { hay: { id: "hay", nom: "HAY", prenom: "DMIEN" } };
  const stats = visitStatsByClient([
    { client_id: "hay", client_link_status: "propose", title: "Entretien Martin Hayange", scheduled_start: "2026-09-21T08:00:00Z" },
  ], { today: "2026-09-28", clientsById });
  assert.equal(stats.get("hay"), undefined);
});

test("une visite CRM n’écrit pas vers Google et ne pose pas la réalisation", () => {
  const record = buildCrmVisitRecord({
    organizationId: "org",
    technicianId: "tech-1",
    clientId: "c1",
    day: "2026-09-29",
    time: "09:30",
    durationMinutes: 90,
    actorId: "admin-1",
  });
  assert.equal(record.source, "saisie");
  assert.equal(record.realization_status, "inconnu");
  assert.equal(record.nature_validated, "entretien");
  assert.equal(record.google_event_id, undefined);
  assert.match(record.scheduled_start, /2026-09-29/);
  const week = weekRange("2026-09-30");
  assert.equal(week.start, "2026-09-28");
  assert.equal(week.days.length, 7);
});

test("un contrat ouvert depuis la planification ne crée aucune facture", () => {
  const contract = buildManualEntretienContract({
    organizationId: "org",
    clientId: "client-1",
    startOn: "2026-10-12",
    actorId: "admin-1",
  });
  assert.equal(contract.client_id, "client-1");
  assert.equal(contract.status, "Actif");
  assert.equal(contract.frequency, "Annuelle");
  assert.equal(contract.amount, null);
  assert.equal(contract.start_on, "2026-10-12");
  assert.equal(contract.devis_id, undefined);
  assert.match(contract.number, /^ENT-2026-/);
  assert.throws(() => buildManualEntretienContract({ organizationId: "org" }), /Client manquant/);
});

test("la file à vérifier ne garde que le dernier RDV passé par client", () => {
  const queue = pickLatestReviewByClient([
    { id: "old", client_id: "c1", scheduled_start: "2024-03-12T08:00:00Z" },
    { id: "last", client_id: "c1", scheduled_start: "2026-09-21T08:00:00Z" },
    { id: "future", client_id: "c1", scheduled_start: "2026-10-15T08:00:00Z" },
    { id: "other", client_id: "c2", scheduled_start: "2026-09-18T08:00:00Z" },
  ], { today: "2026-09-28" });
  assert.equal(queue.length, 2);
  assert.equal(queue.find(row => row.client_id === "c1")?.id, "last");
  assert.equal(queue.find(row => row.client_id === "c2")?.id, "other");
});

test("l’aperçu des fichiers reels ne recrit rien", () => {
  const yPath = "/Users/khaled/Downloads/contrat entretiens YILDIZ.xlsx";
  const rPath = "/Users/khaled/Downloads/CONTRATS ENTRETIENS à compter du 25_10_23.xlsx";
  if (!existsSync(yPath) || !existsSync(rPath)) return;
  const yildiz = rowsFromXlsx(readFileSync(yPath), SOURCE_KIND.yildiz);
  const rebecca = rowsFromXlsx(readFileSync(rPath), SOURCE_KIND.rebecca);
  const preview = previewEntretienImport({ yildiz, rebecca, clients: [] });
  assert.ok(yildiz.length > 2000);
  assert.ok(rebecca.length > 200);
  assert.ok(preview.counts.total > 2000);
  assert.equal(preview.counts.created, preview.counts.total);
  const yMap = inspectXlsxMapping(readFileSync(yPath), SOURCE_KIND.yildiz);
  const rMap = inspectXlsxMapping(readFileSync(rPath), SOURCE_KIND.rebecca);
  assert.ok(yMap.headers.length > 3);
  assert.ok(rMap.headers.length > 3);
  assert.equal(yMap.columnMap.name, 1);
  assert.equal(rMap.columnMap.name, 2);
  assert.equal(rMap.columnMap.contractNumber, 1);
});
