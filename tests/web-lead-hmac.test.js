/**
 * Signature des demandes du site : OVH signe, le CRM vérifie.
 *
 * La chaîne canonique est écrite deux fois, dans deux déploiements distincts.
 * Ces tests signent avec l'implémentation d'OVH et vérifient avec celle du
 * CRM : une divergence entre les deux fait échouer le test au lieu de faire
 * échouer la liaison en production.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CRM_HEADERS,
  HMAC_REJECTIONS,
  MAX_BODY_BYTES,
  MAX_CLOCK_SKEW_MS,
  canonicalString,
  parseKeyring,
  verifyWebLeadSignature,
} from "../app/lib/web-lead-hmac.js";
import {
  buildSignedRequest,
  canonicalString as ovhCanonicalString,
} from "../ovh-site/lib/crm-sync.mjs";

const SECRET = "secret-de-test-suffisamment-long-pour-passer";
const PATH = "/api/web-leads";
const NOW = 1762250400000;

function signedByOvh(overrides = {}) {
  return buildSignedRequest({
    job: { kind: "lead", sourceId: "lead-1", createdAt: "2026-11-04T12:00:00.000Z" },
    record: { id: "lead-1", createdAt: "2026-11-04T12:00:00.000Z", name: "Ada Lovelace", phone: "0612345678" },
    secret: SECRET,
    keyId: "k1",
    endpoint: `https://crm.test${PATH}`,
    nonce: "c".repeat(32),
    now: NOW,
    ...overrides,
  });
}

function verify(request, overrides = {}) {
  return verifyWebLeadSignature({
    method: "POST",
    path: PATH,
    headers: request.headers,
    rawBody: request.rawBody,
    keyring: parseKeyring(`k1:${SECRET}`),
    now: NOW,
    ...overrides,
  });
}

test("les deux implémentations produisent la même chaîne canonique", () => {
  const base = { method: "POST", path: PATH, timestamp: String(NOW), nonce: "c".repeat(32), rawBody: '{"a":1}' };
  assert.equal(canonicalString(base), ovhCanonicalString(base));
});

test("une demande signée par le site est acceptée par le CRM", () => {
  const result = verify(signedByOvh());
  assert.equal(result.ok, true);
  assert.equal(result.keyId, "k1");
  assert.equal(result.sentAt, new Date(NOW).toISOString());
});

test("un corps modifié en route est refusé", () => {
  const request = signedByOvh();
  const altere = { ...request, rawBody: request.rawBody.replace("0612345678", "0699999999") };
  assert.equal(verify(altere).reason, HMAC_REJECTIONS.BAD_SIGNATURE);
});

test("une signature valable ne peut pas être rejouée sur une autre route", () => {
  assert.equal(verify(signedByOvh(), { path: "/api/clients" }).reason, HMAC_REJECTIONS.BAD_SIGNATURE);
  assert.equal(verify(signedByOvh(), { method: "PUT" }).reason, HMAC_REJECTIONS.BAD_SIGNATURE);
});

test("une signature trop ancienne ou venue du futur est refusée", () => {
  const request = signedByOvh();
  assert.equal(verify(request, { now: NOW + MAX_CLOCK_SKEW_MS + 1000 }).reason, HMAC_REJECTIONS.CLOCK_SKEW);
  assert.equal(verify(request, { now: NOW - MAX_CLOCK_SKEW_MS - 1000 }).reason, HMAC_REJECTIONS.CLOCK_SKEW);
  assert.equal(verify(request, { now: NOW + MAX_CLOCK_SKEW_MS }).ok, true);
});

test("une clé inconnue est refusée avant tout calcul", () => {
  const request = signedByOvh({ keyId: "k-pirate" });
  assert.equal(verify(request).reason, HMAC_REJECTIONS.UNKNOWN_KEY);
});

test("le trousseau permet de changer de secret sans interruption", () => {
  const ancien = "ancien-secret-suffisamment-long-pour-passer";
  const keyring = parseKeyring(`k1:${SECRET}, k0:${ancien}`);
  assert.equal(keyring.size, 2);
  assert.equal(verify(signedByOvh(), { keyring }).ok, true);
  assert.equal(verify(signedByOvh({ keyId: "k0", secret: ancien }), { keyring }).ok, true);
});

test("un trousseau refuse les entrées malformées ou aux secrets trop courts", () => {
  assert.equal(parseKeyring("").size, 0);
  assert.equal(parseKeyring("sans-separateur").size, 0);
  assert.equal(parseKeyring(":secret-sans-identifiant-mais-assez-long").size, 0);
  assert.equal(parseKeyring("k1:trop-court").size, 0);
  assert.equal(parseKeyring(`k1:${SECRET}`).size, 1);
});

test("un en-tête manquant est refusé sans distinction de cause", () => {
  for (const header of Object.values(CRM_HEADERS)) {
    const request = signedByOvh();
    const headers = { ...request.headers };
    delete headers[header];
    assert.equal(verify({ ...request, headers }).reason, HMAC_REJECTIONS.MISSING_HEADER, header);
  }
});

test("une signature mal formée est refusée avant le calcul", () => {
  const request = signedByOvh();
  const cas = [
    ["abcdef", HMAC_REJECTIONS.MALFORMED_SIGNATURE],
    ["v2=" + "a".repeat(64), HMAC_REJECTIONS.VERSION_MISMATCH],
    ["v1=pas-une-empreinte", HMAC_REJECTIONS.MALFORMED_SIGNATURE],
    ["v1=" + "A".repeat(64), HMAC_REJECTIONS.MALFORMED_SIGNATURE],
  ];
  for (const [valeur, attendu] of cas) {
    const headers = { ...request.headers, [CRM_HEADERS.signature]: valeur };
    assert.equal(verify({ ...request, headers }).reason, attendu, valeur);
  }
});

test("un horodatage ou un aléa invalide est refusé", () => {
  const request = signedByOvh();
  const horodatage = { ...request.headers, [CRM_HEADERS.timestamp]: "hier" };
  assert.equal(verify({ ...request, headers: horodatage }).reason, HMAC_REJECTIONS.MALFORMED_TIMESTAMP);
  const alea = { ...request.headers, [CRM_HEADERS.nonce]: "court" };
  assert.equal(verify({ ...request, headers: alea }).reason, HMAC_REJECTIONS.MALFORMED_NONCE);
});

test("un corps démesuré est refusé avant toute analyse", () => {
  const request = signedByOvh();
  const enorme = "x".repeat(MAX_BODY_BYTES + 1);
  assert.equal(verify({ ...request, rawBody: enorme }).reason, HMAC_REJECTIONS.BODY_TOO_LARGE);
});

test("les en-têtes sont lus aussi depuis un objet Headers", () => {
  const request = signedByOvh();
  const headers = new Headers(request.headers);
  assert.equal(verify({ ...request, headers }).ok, true);
});

test("aucun motif de refus ne révèle d’information exploitable", () => {
  for (const motif of Object.values(HMAC_REJECTIONS)) {
    assert.ok(!/secret|cle_attendue|signature_attendue/.test(motif), motif);
  }
  assert.equal(new Set(Object.values(HMAC_REJECTIONS)).size, Object.values(HMAC_REJECTIONS).length);
});
