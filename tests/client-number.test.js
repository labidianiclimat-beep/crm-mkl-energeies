import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findClientByNumber, formatClientNumber, parseClientNumber } from "../app/lib/client-number.js";

test("le numero client s affiche MKL-CL et se retrouve exactement", () => {
  assert.equal(formatClientNumber(42), "MKL-CL-00042");
  assert.equal(formatClientNumber(1), "MKL-CL-00001");
  assert.equal(formatClientNumber(0), "");
  assert.equal(parseClientNumber("42"), 42);
  assert.equal(parseClientNumber("00042"), 42);
  assert.equal(parseClientNumber("MKL-CL-00042"), 42);
  assert.equal(parseClientNumber(""), null);
  const clients = [
    { id: "a", clientNumber: 12, name: "Martin" },
    { id: "b", clientNumber: 42, name: "Durand" },
  ];
  assert.equal(findClientByNumber(clients, "42")?.name, "Durand");
  assert.equal(findClientByNumber(clients, "4"), null);
  assert.equal(findClientByNumber(clients, "12")?.name, "Martin");
});

test("le numero est sur la fiche, le devis et la facture", () => {
  const pdf = readFileSync(new URL("../app/lib/devis-pdf.js", import.meta.url), "utf8");
  const print = readFileSync(new URL("../app/lib/devis-print.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const record = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20261003_client_numbers.sql", import.meta.url), "utf8");
  assert.match(pdf, /customer\.clientNumber/);
  assert.match(print, /clientNumber: formatClientNumber\(customer\.clientNumber\)/);
  assert.match(page, /formatClientNumber\(c\.clientNumber\)/);
  assert.match(record, /formatClientNumber\(client\.clientNumber\)/);
  assert.match(sql, /order by c\.created_at asc, c\.id asc/);
  assert.match(sql, /clients_assign_number/);
});
