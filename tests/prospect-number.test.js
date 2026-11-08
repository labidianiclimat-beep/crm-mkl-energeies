import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { commitRecipient, findProspectByNumber, formatProspectNumber, parseProspectNumber, personFromProspectNumber } from "../app/lib/prospect-number.js";

test("le numero prospect s affiche MKL-PR et se retrouve exactement", () => {
  assert.equal(formatProspectNumber(42), "MKL-PR-00042");
  assert.equal(formatProspectNumber(1), "MKL-PR-00001");
  assert.equal(formatProspectNumber(0), "");
  assert.equal(parseProspectNumber("42"), 42);
  assert.equal(parseProspectNumber("MKL-PR-00042"), 42);
  assert.equal(parseProspectNumber(""), null);
  const prospects = [
    { id: "a", prospectNumber: 12, name: "Martin" },
    { id: "b", prospectNumber: 42, name: "Durand" },
  ];
  assert.equal(findProspectByNumber(prospects, "42")?.name, "Durand");
  assert.equal(findProspectByNumber(prospects, "4"), null);
  assert.equal(findProspectByNumber(prospects, "12")?.name, "Martin");
});

test("le devis cherche un client ou un prospect, et le numero reste sur les fiches ouvertes", () => {
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20261003_prospect_numbers.sql", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(wizard, /label="Numéro prospect"/);
  assert.match(wizard, /missMessage="Aucun client avec ce numéro."/);
  assert.match(wizard, /onClientCreated=\{onClientCreated\}/);
  assert.match(wizard, /Ce n’est pas la bonne fiche/);
  assert.match(wizard, /Valider et continuer/);
  assert.match(wizard, /singleCreate/);
  assert.match(wizard, /findProspectByNumber/);
  assert.match(wizard, /includeConverted=1/);
  assert.match(wizard, /prospectLookup/);
  assert.match(sql, /order by c\.created_at asc, c\.id asc/);
  assert.match(sql, /clientId/);
  const all = readFileSync(new URL("../supabase/migrations/20261004_prospect_numbers_all.sql", import.meta.url), "utf8");
  assert.match(all, /where c\.prospect_number is null/);
  assert.doesNotMatch(all, /clientId', ''\)\) is null/);
  assert.match(all, /origin_prospect_number/);
  const clients = [{ id: "c1", name: "Martin", prospectNumber: 7, clientNumber: 3 }];
  const prospects = [{ id: "p1", name: "Durand", prospectNumber: 8 }];
  assert.equal(personFromProspectNumber(prospects, clients, "MKL-PR-00007")?.name, "Martin");
  assert.equal(personFromProspectNumber(prospects, clients, "8")?.directoryKind, "prospect");
  const converted = [{ id: "p7", name: "Martin", prospectNumber: 7, clientId: "c1" }];
  assert.equal(personFromProspectNumber(converted, clients, "7")?.id, "c1");
  assert.equal(personFromProspectNumber(converted, clients, "7")?.directoryKind, "client");
  assert.equal(personFromProspectNumber(converted, [], "7")?.directoryKind, "prospect");
  const linkedProspects = [{ id: "p9", name: "Bernard", prospectNumber: 9, clientId: "c1" }];
  assert.equal(commitRecipient({ id: "c1", name: "Martin", clientNumber: 3 }, clients)?.directoryKind, "client");
  assert.equal(commitRecipient({ id: "p9", name: "Bernard", prospectNumber: 9, directoryKind: "prospect", clientId: "c1" }, clients, linkedProspects)?.name, "Martin");
  assert.equal(commitRecipient({ id: "p8", name: "Durand", prospectNumber: 8, directoryKind: "prospect" }, clients, prospects)?.directoryKind, "prospect");
  const connect = readFileSync(new URL("../app/components/recipient-connect.js", import.meta.url), "utf8");
  assert.match(connect, /setLocked\(true\)/);
  assert.match(connect, /Changer de fiche/);
  assert.match(connect, /includeConverted=1/);
  assert.match(readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8"), /formatProspectNumber\(client\.prospectNumber\)/);
  assert.match(readFileSync(new URL("../app/components/document-window.js", import.meta.url), "utf8"), /numéro prospect/i);
  assert.match(readFileSync(new URL("../app/components/recipient-connect.js", import.meta.url), "utf8"), /label="Numéro prospect"/);
  assert.match(sql, /opportunities_assign_prospect_number/);
  assert.match(page, /formatProspectNumber\(p\.prospectNumber\)/);
  assert.match(page, /<span>N° prospect<\/span>/);
  assert.match(page, /<CopyNumber value=\{formatClientNumber\(c\.clientNumber\)\}/);
  const board = readFileSync(new URL("../app/components/prospect-dispatch-board.js", import.meta.url), "utf8");
  assert.match(board, /<span>N° prospect<\/span>/);
  assert.match(readFileSync(new URL("../app/components/copy-number.js", import.meta.url), "utf8"), /navigator\.clipboard\.writeText/);
});
