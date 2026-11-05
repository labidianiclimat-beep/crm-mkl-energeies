/**
 * Validation des demandes reçues et câblage de la route de réception.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INGEST_REJECTIONS,
  WEB_LEAD_KINDS,
  parseWebLeadPayload,
  webLeadConfig,
  webLeadIngestConfigured,
} from "../app/lib/web-lead-ingest.js";
import { buildCrmPayload } from "../ovh-site/lib/crm-sync.mjs";

const ROUTE = readFileSync(new URL("../app/api/web-leads/route.js", import.meta.url), "utf8");
const SECRET = "secret-de-test-suffisamment-long-pour-passer";

function demande(overrides = {}) {
  return JSON.stringify({
    submissionId: "11111111-1111-4111-8111-111111111111",
    kind: "lead",
    name: "Ada Lovelace",
    phone: "0612345678",
    ...overrides,
  });
}

test("une demande conforme est acceptée et bornée", () => {
  const result = parseWebLeadPayload(demande({ message: "m".repeat(5000) }));
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, "lead");
  assert.equal(result.value.message.length, 2000);
  assert.deepEqual(result.value.attribution, {});
});

test("le corps produit par le site est accepté tel quel", () => {
  const payload = buildCrmPayload(
    { kind: "lead", sourceId: "22222222-2222-4222-8222-222222222222" },
    { id: "x", createdAt: "2026-11-04T12:00:00.000Z", name: "Ada", phone: "0612345678", attribution: { gclid: "abc-123-def" } }
  );
  const result = parseWebLeadPayload(JSON.stringify(payload));
  assert.equal(result.ok, true);
  assert.equal(result.value.attribution.gclid, "abc-123-def");
});

test("un rendez-vous conserve sa date et son heure", () => {
  const result = parseWebLeadPayload(demande({ kind: "appointment", date: "2026-11-10", time: "09:00" }));
  assert.equal(result.value.date, "2026-11-10");
  assert.equal(result.value.time, "09:00");
  const simple = parseWebLeadPayload(demande());
  assert.equal(simple.value.date, undefined, "une demande simple ne porte pas de date de rendez-vous");
});

test("un corps illisible ou non structuré est refusé", () => {
  assert.equal(parseWebLeadPayload("pas du json").reason, INGEST_REJECTIONS.INVALID_JSON);
  assert.equal(parseWebLeadPayload("[]").reason, INGEST_REJECTIONS.INVALID_JSON);
  assert.equal(parseWebLeadPayload("null").reason, INGEST_REJECTIONS.INVALID_JSON);
  assert.equal(parseWebLeadPayload('"texte"').reason, INGEST_REJECTIONS.INVALID_JSON);
});

/**
 * La contrainte de la table impose 8 à 128 caractères. La vérifier ici évite
 * de transformer une erreur du site en panne de base.
 */
test("un identifiant de soumission absent ou hors format est refusé", () => {
  assert.equal(parseWebLeadPayload(demande({ submissionId: "" })).reason, INGEST_REJECTIONS.MISSING_SUBMISSION_ID);
  assert.equal(parseWebLeadPayload(demande({ submissionId: "court" })).reason, INGEST_REJECTIONS.INVALID_SUBMISSION_ID);
  assert.equal(parseWebLeadPayload(demande({ submissionId: "x".repeat(200) })).reason, INGEST_REJECTIONS.INVALID_SUBMISSION_ID);
  assert.equal(parseWebLeadPayload(demande({ submissionId: "avec espace" })).reason, INGEST_REJECTIONS.INVALID_SUBMISSION_ID);
  assert.equal(parseWebLeadPayload(demande({ submissionId: "lead:11111111-1111-4111-8111-111111111111" })).ok, true);
});

test("seuls les deux types de demande du site sont acceptés", () => {
  assert.deepEqual(WEB_LEAD_KINDS, ["lead", "appointment"]);
  assert.equal(parseWebLeadPayload(demande({ kind: "client" })).reason, INGEST_REJECTIONS.INVALID_KIND);
  assert.equal(parseWebLeadPayload(demande({ kind: "" })).reason, INGEST_REJECTIONS.INVALID_KIND);
});

test("une demande sans téléphone ni e-mail est refusée", () => {
  const sansContact = JSON.stringify({ submissionId: "11111111-1111-4111-8111-111111111111", kind: "lead", name: "Ada" });
  assert.equal(parseWebLeadPayload(sansContact).reason, INGEST_REJECTIONS.NO_CONTACT);
  assert.equal(parseWebLeadPayload(demande({ phone: "", email: "ada@example.fr" })).ok, true);
});

test("les caractères de contrôle sont neutralisés avant stockage", () => {
  const result = parseWebLeadPayload(demande({ name: "Ada\u0000\u001fLovelace" }));
  assert.ok(!/[\u0000-\u001f]/.test(result.value.name));
});

test("la réception reste inerte sans trousseau de clés", () => {
  assert.equal(webLeadIngestConfigured({}), false);
  assert.equal(webLeadIngestConfigured({ WEB_LEAD_KEYRING: "k1:trop-court" }), false);
  assert.equal(webLeadIngestConfigured({ WEB_LEAD_KEYRING: `k1:${SECRET}` }), true);
});

test("une organisation mal formée retombe sur celle du schéma", () => {
  assert.equal(webLeadConfig({}).organizationId, "00000000-0000-0000-0000-000000000001");
  assert.equal(webLeadConfig({ WEB_LEAD_ORGANIZATION_ID: "pas-un-uuid" }).organizationId, "00000000-0000-0000-0000-000000000001");
  assert.equal(
    webLeadConfig({ WEB_LEAD_ORGANIZATION_ID: "33333333-3333-4333-8333-333333333333" }).organizationId,
    "33333333-3333-4333-8333-333333333333"
  );
});

test("la rétention est bornée et jamais illimitée", () => {
  assert.equal(webLeadConfig({}).retentionDays, 30);
  assert.equal(webLeadConfig({ WEB_LEAD_RETENTION_DAYS: "0" }).retentionDays, 30);
  assert.equal(webLeadConfig({ WEB_LEAD_RETENTION_DAYS: "-5" }).retentionDays, 1);
  assert.equal(webLeadConfig({ WEB_LEAD_RETENTION_DAYS: "9999" }).retentionDays, 365);
  assert.equal(webLeadConfig({ WEB_LEAD_RETENTION_DAYS: "7" }).retentionDays, 7);
});

/**
 * L'absence de CORS est délibérée : le secret ne doit jamais se trouver dans
 * une page, donc aucun navigateur n'a à appeler cette route.
 */
test("la route n’ouvre jamais l’accès aux navigateurs", () => {
  assert.ok(!/Access-Control-Allow/i.test(ROUTE));
  assert.ok(!/export async function OPTIONS/.test(ROUTE));
  assert.ok(!/export async function GET/.test(ROUTE));
});

test("la route vérifie la signature avant de lire le contenu", () => {
  assert.ok(
    ROUTE.indexOf("verifyWebLeadSignature") < ROUTE.indexOf("parseWebLeadPayload(rawBody)"),
    "le contenu ne doit être interprété qu’après validation de la signature"
  );
});

test("la route refuse tout tant qu’elle n’est pas configurée", () => {
  assert.match(ROUTE, /if \(keyring\.size === 0\)/);
  assert.match(ROUTE, /serviceRoleConfigured\(\)/);
  assert.ok(
    ROUTE.indexOf("keyring.size === 0") < ROUTE.indexOf("await request.text()"),
    "aucun corps ne doit être lu avant de savoir si la réception est active"
  );
});

test("la réponse ne révèle pas la cause du refus de signature", () => {
  const bloc = ROUTE.slice(ROUTE.indexOf("if (!signature.ok)"), ROUTE.indexOf("const parsed"));
  assert.match(bloc, /status: 401/);
  assert.match(bloc, /console\.warn/);
  assert.ok(!/error: .*signature\.reason/.test(bloc), "le motif reste dans les journaux");
});

test("la route accuse réception dans la forme attendue par le site", () => {
  for (const champ of ["ok: true", "id: receipt.id", "receivedAt", "duplicate"]) {
    assert.ok(ROUTE.includes(champ), champ);
  }
  assert.match(ROUTE, /rest\/v1\/rpc\/enqueue_web_lead/);
});

test("aucun corps de demande n’est recopié dans les journaux", () => {
  for (const line of ROUTE.split("\n")) {
    if (!/console\.(log|warn|error)/.test(line)) continue;
    assert.ok(!/rawBody|parsed\.value|p_payload/.test(line), `journal trop bavard : ${line.trim()}`);
  }
});
