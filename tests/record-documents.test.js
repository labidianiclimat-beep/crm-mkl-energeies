import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { documentPdfFilename, documentsForRecord, sameProspectRecord } from "../app/lib/record-documents.js";

test("rattache devis et études à la fiche client", () => {
  const client = { id: "c1", name: "Dupont Marie", lastName: "Dupont", firstName: "Marie" };
  const docs = documentsForRecord({
    person: client,
    kind: "client",
    billing: [{ id: "d1", kind: "Devis", number: "DEV-2026-0001", clientId: "c1", label: "PAC" }],
    thermalStudies: [{ id: "t1", number: "ETH-2026-0001", lastName: "Dupont", firstName: "Marie", powerDynamicKw: 6 }],
    visits: [{ id: "1742160000000", clientId: "c1", status: "Prévisite complétée" }],
    contracts: [],
    installations: [],
    pvProjects: [],
  });
  assert.equal(docs.length, 3);
  assert.equal(docs.find(item => item.download === "devis")?.title, "DEV-2026-0001");
  assert.equal(docs.find(item => item.download === "thermal")?.title, "ETH-2026-0001");
  assert.equal(docs.find(item => item.download === "previsit-report")?.visitKey, "1742160000000");
});

test("rattache un devis à la fiche prospect via prospectId", () => {
  const prospect = { id: "p1", name: "Martin Paul" };
  assert.equal(sameProspectRecord({ prospectId: "p1" }, prospect), true);
  assert.equal(sameProspectRecord({ sourceProspectId: "p1" }, prospect), true);
  const docs = documentsForRecord({
    person: prospect,
    kind: "prospect",
    billing: [{ id: "d2", kind: "Devis", number: "DEV-2026-0002", prospectId: "p1" }],
    thermalStudies: [],
    visits: [],
    contracts: [],
    installations: [],
    pvProjects: [],
  });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].download, "devis");
});

test("rattache les PDF par numéro client, nom et numéro prospect", () => {
  const client = {
    id: "c9",
    name: "Muller Roland",
    lastName: "Muller",
    firstName: "Roland",
    clientNumber: 12,
    prospectNumber: 4,
  };
  const docs = documentsForRecord({
    person: client,
    billing: [
      { id: "a", kind: "Devis", number: "DEV-2026-0042", clientNumber: "MKL-CL-00012", client: "Muller Roland" },
      { id: "b", kind: "Facture", number: "FAC-2026-0001", client: "Roland Muller" },
      { id: "c", kind: "Devis", number: "DEV-2026-0009", prospectNumber: 4, client: "Muller Roland" },
    ],
    thermalStudies: [{ id: "t", kind: "dimensionnement", number: "ND-2026-0001", lastName: "Muller", firstName: "Roland" }],
  });
  assert.equal(docs.length, 4);
  assert.equal(
    docs.find(item => item.title === "DEV-2026-0042").pdfFilename,
    "Devis Muller Roland DEV-2026-0042.pdf"
  );
  assert.equal(
    docs.find(item => item.title === "ND-2026-0001").kind,
    "Note de dimensionnement"
  );
  assert.equal(
    documentPdfFilename({ kind: "Devis", title: "DEV-2026-0042", source: { client: "Muller Roland" } }),
    "Devis Muller Roland DEV-2026-0042.pdf"
  );
});

test("les PDF de la fiche sont classés par date de création", () => {
  const client = { id: "c1", name: "Muller Roland", lastName: "Muller", firstName: "Roland" };
  const docs = documentsForRecord({
    person: client,
    billing: [
      { id: "old", kind: "Devis", number: "DEV-2026-0001", clientId: "c1", createdAt: "2026-01-02" },
      { id: "new", kind: "Facture", number: "FAC-2026-0008", clientId: "c1", createdAt: "2026-09-15", date: "2026-01-01" },
    ],
    thermalStudies: [{ id: "mid", number: "ETH-2026-0003", clientId: "c1", created: "2026-04-10" }],
  });
  assert.deepEqual(docs.map(item => item.title), ["FAC-2026-0008", "ETH-2026-0003", "DEV-2026-0001"]);
  assert.equal(docs[0].date, "2026-09-15");
});

test("la fiche client a un onglet PDF", () => {
  const client = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  assert.match(client, /client-pdf-tab/);
  assert.match(client, /aria-label="PDF"/);
  assert.match(client, /ClientPdfPanel/);
});

test("les fiches prospect et client exposent le bouton Télécharger", () => {
  const list = readFileSync(new URL("../app/components/record-document-list.js", import.meta.url), "utf8");
  const vault = readFileSync(new URL("../app/components/client-document-vault.js", import.meta.url), "utf8");
  const prospect = readFileSync(new URL("../app/components/prospect-fields.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  assert.match(list, /Télécharger/);
  assert.match(list, /openDevisPrintWindow/);
  assert.match(vault, /downloadDocument/);
  assert.match(prospect, /RecordDocumentList/);
  assert.match(client, /RecordDocumentList/);
});
