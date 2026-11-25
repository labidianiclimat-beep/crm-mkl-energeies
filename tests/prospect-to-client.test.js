import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import {
  clientStatusForDocumentKind,
  isConvertedProspect,
  prospectToClientPayload,
  visibleProspects,
} from "../app/lib/prospect-to-client.js";
import { formToClientRecord, validateClientPayload } from "../app/lib/clients.js";

const jean = {
  name: "Jean Dupont",
  phone: "0612345678",
  email: "jean@x.fr",
  address: "12 rue de la Paix",
  postalCode: "44500",
  city: "La Baule",
  type: "Photovoltaïque",
  source: "Prospection",
  commercialId: "22222222-2222-4222-8222-222222222222",
};

test("un devis convertit le prospect en client Devis en cours", () => {
  assert.equal(clientStatusForDocumentKind("Devis"), "Devis en cours");
  assert.equal(clientStatusForDocumentKind("Facture"), "Client");
  const payload = prospectToClientPayload(jean, { documentKind: "Devis" });
  assert.equal(payload.firstName, "Jean");
  assert.equal(payload.lastName, "Dupont");
  assert.equal(payload.status, "Devis en cours");
  const record = formToClientRecord(payload, { organizationId: "org" });
  assert.deepEqual(validateClientPayload(record), []);
});

test("une SCI devient un client professionnel", () => {
  const payload = prospectToClientPayload({
    ...jean,
    name: "SCI Horizon",
    email: "contact@horizon.fr",
  }, { documentKind: "Facture" });
  assert.equal(payload.customerType, "Entreprise");
  assert.equal(payload.company, "SCI Horizon");
  assert.equal(payload.status, "Client");
  assert.deepEqual(validateClientPayload(formToClientRecord(payload, { organizationId: "org" })), []);
});

test("les prospects convertis sortent du listing", () => {
  assert.equal(isConvertedProspect({ name: "A", extra: { clientId: "c1" } }), true);
  assert.equal(isConvertedProspect({ name: "B", clientId: "c1" }), true);
  assert.equal(isConvertedProspect(jean), false);
  assert.equal(visibleProspects([jean, { ...jean, name: "Converti", clientId: "c1" }]).length, 1);
});

test("le devis accepte un prospect et le convertit a l enregistrement", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const devisRoute = readFileSync(new URL("../app/api/devis/route.js", import.meta.url), "utf8");
  const prospectsRoute = readFileSync(new URL("../app/api/prospects/route.js", import.meta.url), "utf8");
  assert.match(page, /onCreateQuote=\{prospect/);
  assert.match(page, /directoryKind==="prospect"/);
  assert.match(page, /prospectId:document\.prospectId/);
  assert.match(devisRoute, /resolveDevisRecipient/);
  assert.match(devisRoute, /convertedProspectId/);
  assert.match(devisRoute, /canAccessScopedRow/);
  const convert = readFileSync(new URL("../app/lib/convert-prospect.js", import.meta.url), "utf8");
  assert.match(convert, /canAccessScopedRow/);
  assert.match(convert, /forDispatch/);
  assert.match(convert, /déjà suivi sur une autre affaire/);
  assert.match(convert, /splitScopedDuplicates/);
  assert.match(convert, /assertAccessibleClient/);
  assert.match(prospectsRoute, /visibleProspects/);
});

const ORG = "00000000-0000-0000-0000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";
const COMMERCIAL = "22222222-2222-4222-8222-222222222222";
const PROSPECT_ID = "33333333-3333-4333-8333-333333333333";
const INVOICE_PROSPECT_ID = "44444444-4444-4444-8444-444444444444";

const clients = [];
const calls = [];
const prospects = new Map();

function prospectRow(id, name, phone, email, address, postalCode, city) {
  return {
    id,
    organization_id: ORG,
    name,
    phone,
    email,
    city,
    project_type: "Photovoltaïque",
    stage: "Rendez-vous planifié",
    commercial_id: COMMERCIAL,
    prospect_number: 42,
    created_by: USER,
    extra: { address, postalCode },
  };
}

prospects.set(PROSPECT_ID, prospectRow(
  PROSPECT_ID,
  "Jean Dupont",
  "0612345678",
  "jean@x.fr",
  "12 rue de la Paix",
  "44500",
  "La Baule"
));
prospects.set(INVOICE_PROSPECT_ID, prospectRow(
  INVOICE_PROSPECT_ID,
  "Marie Martin",
  "0698765432",
  "marie@y.fr",
  "8 rue des Pins",
  "44100",
  "Nantes"
));

globalThis.__mklConvertMock = {
  async serviceRequest(path, options = {}) {
    const method = options.method || "GET";
    calls.push({ path, method, body: options.body });
    if (path.includes("/rest/v1/commercial_opportunities") && method === "GET") {
      const id = decodeURIComponent(path.match(/id=eq\.([^&]+)/)?.[1] || "");
      const row = prospects.get(id);
      return row ? [row] : [];
    }
    if (path.includes("/rest/v1/commercial_opportunities") && method === "PATCH") {
      const id = decodeURIComponent(path.match(/id=eq\.([^&]+)/)?.[1] || "");
      const row = prospects.get(id);
      if (row && options.body?.extra) row.extra = options.body.extra;
      if (row && Object.prototype.hasOwnProperty.call(options.body || {}, "stage")) row.stage = options.body.stage;
      return [];
    }
    if (path.includes("/rest/v1/clients") && method === "POST") {
      const client = { id: `client-${clients.length + 1}`, ...options.body };
      clients.push(client);
      return [client];
    }
    if (path.includes("/rest/v1/clients") && method === "PATCH") {
      const id = decodeURIComponent(path.match(/id=eq\.([^&]+)/)?.[1] || "");
      const client = clients.find(item => item.id === id);
      if (client && options.body) Object.assign(client, options.body);
      return client ? [client] : [];
    }
    if (path.includes("/rest/v1/clients") && method === "GET") {
      const id = decodeURIComponent(path.match(/id=eq\.([^&]+)/)?.[1] || "");
      if (id) return clients.filter(item => item.id === id);
      return clients;
    }
    return [];
  },
};

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/app/lib/supabase-server.js")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `
          export function serviceRequest(path, options) {
            return globalThis.__mklConvertMock.serviceRequest(path, options);
          }
          export async function serviceDownloadObject() { return new Uint8Array(); }
          export async function serviceUploadObject() {}
          export function serviceRoleConfigured() { return true; }
          export function supabaseConfigured() { return true; }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

test("un brouillon lie le prospect sans gagner l affaire et un second devis reutilise la fiche", async () => {
  const convert = readFileSync(new URL("../app/lib/convert-prospect.js", import.meta.url), "utf8");
  assert.doesNotMatch(convert, /stage:\s*"Gagné"/);
  assert.match(convert, /convertedProspectExtra/);
  assert.match(convert, /copyProspectDocumentsToClient/);

  const { convertProspectToClient } = await import("../app/lib/convert-prospect.js");
  const auth = {
    orgId: ORG,
    userId: USER,
    profile: { role: "Admin VIP", organization_id: ORG },
    teamIds: [],
  };

  const first = await convertProspectToClient({ ...auth, prospectId: PROSPECT_ID, documentKind: "Devis" });
  assert.equal(first.created, true);
  assert.equal(first.client.statut, "Devis en cours");
  assert.equal(clients.length, 1);
  assert.equal(first.client.id, clients[0].id);

  const link = calls.filter(call => call.method === "PATCH" && call.path.includes("commercial_opportunities"));
  assert.equal(link.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(link[0].body, "stage"), false);
  assert.equal(link[0].body.extra.clientId, first.client.id);
  assert.ok(link[0].body.extra.convertedAt);
  assert.equal(link[0].body.extra.convertedByKind, "Devis");
  assert.equal(prospects.get(PROSPECT_ID).stage, "Rendez-vous planifié");
  assert.ok(calls.some(call => call.path.includes("client_documents")));
  assert.equal(clients[0].origin_prospect_number, 42);
  assert.equal(visibleProspects([{ clientId: first.client.id }]).length, 0);

  const second = await convertProspectToClient({ ...auth, prospectId: PROSPECT_ID, documentKind: "Devis" });
  assert.equal(second.created, false);
  assert.equal(second.client.id, first.client.id);
  assert.equal(second.client.statut, "Devis en cours");
  assert.equal(clients.length, 1);
  assert.equal(calls.filter(call => call.method === "POST" && call.path.includes("/rest/v1/clients")).length, 1);
  assert.equal(calls.filter(call => call.method === "PATCH" && call.path.includes("commercial_opportunities")).length, 1);

  const invoice = await convertProspectToClient({
    ...auth,
    prospectId: INVOICE_PROSPECT_ID,
    documentKind: "Facture",
  });
  assert.equal(invoice.created, true);
  assert.equal(invoice.client.statut, "Client");
  assert.equal(clients.length, 2);
  assert.equal(prospects.get(INVOICE_PROSPECT_ID).stage, "Rendez-vous planifié");
  assert.equal(clients[0].statut, "Devis en cours");
  const invoiceLink = calls.filter(call => call.method === "PATCH" && call.path.includes("commercial_opportunities")).at(-1);
  assert.equal(Object.prototype.hasOwnProperty.call(invoiceLink.body, "stage"), false);
  assert.equal(invoiceLink.body.extra.convertedByKind, "Facture");
});
