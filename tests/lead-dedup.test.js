/** Normalisation d’identité et prévention des doublons, sans fusion automatique. */
import test from "node:test";
import assert from "node:assert/strict";
import { hasUsableIdentity, identityKeys, normalizeEmail, normalizeName, normalizePhoneFr } from "../app/lib/lead-identity.js";
import { DEDUP_NEW, DEDUP_REPLAY, DEDUP_REVIEW, decideLeadDedup } from "../app/lib/lead-dedup.js";

test("les téléphones français sont ramenés à dix chiffres", () => {
  assert.equal(normalizePhoneFr("06 12 34 56 78"), "0612345678");
  assert.equal(normalizePhoneFr("+33 6 12 34 56 78"), "0612345678");
  assert.equal(normalizePhoneFr("0033612345678"), "0612345678");
  assert.equal(normalizePhoneFr("612345678"), "0612345678");
  assert.equal(normalizePhoneFr("06.12.34.56.78"), "0612345678");
});

test("un numéro inexploitable ne sert jamais de clé de rapprochement", () => {
  assert.equal(normalizePhoneFr(""), "");
  assert.equal(normalizePhoneFr("12345"), "");
  assert.equal(normalizePhoneFr("0000000000"), "");
  assert.equal(normalizePhoneFr("0012345678"), "");
  assert.equal(normalizePhoneFr("abcdefghij"), "");
});

test("aucune règle propre à Gmail n’est appliquée aux adresses", () => {
  assert.equal(normalizeEmail("  Jean.Dupont@Gmail.COM "), "jean.dupont@gmail.com");
  assert.notEqual(normalizeEmail("jean.dupont@gmail.com"), normalizeEmail("jeandupont@gmail.com"));
  assert.notEqual(normalizeEmail("jean+ads@gmail.com"), normalizeEmail("jean@gmail.com"));
  assert.equal(normalizeEmail("pas-une-adresse"), "");
});

test("les noms sont repliés sans accent ni casse", () => {
  assert.equal(normalizeName("Émilie  LE GOFF"), "emilie le goff");
  assert.equal(normalizeName("Jean-Pierre"), "jean pierre");
});

test("une identité sans téléphone ni email n’est pas exploitable", () => {
  assert.equal(hasUsableIdentity({ name: "Jean" }), false);
  assert.equal(hasUsableIdentity({ phone: "0612345678" }), true);
  assert.equal(hasUsableIdentity({ email: "a@b.fr" }), true);
  assert.deepEqual(identityKeys({ phone: "+33612345678", email: "A@B.FR", name: "Jean" }), {
    phone: "0612345678", email: "a@b.fr", name: "jean",
  });
});

const now = new Date("2026-06-01T10:00:00.000Z");
const recent = "2026-05-01T10:00:00.000Z";
const ancien = "2025-01-01T10:00:00.000Z";

test("une soumission rejouée est déduplicée sans intervention", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "ovh-123", phone: "0612345678" },
    knownSubmissionIds: ["ovh-122", "ovh-123"],
    now,
  });
  assert.equal(result.decision, DEDUP_REPLAY);
  assert.deepEqual(result.candidateIds, []);
});

test("une correspondance de téléphone est proposée et jamais fusionnée", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "ovh-200", phone: "+33 6 12 34 56 78" },
    candidates: [{ id: "p-1", phone: "0612345678", createdAt: recent }],
    now,
  });
  assert.equal(result.decision, DEDUP_REVIEW);
  assert.equal(result.reason, "correspondance_telephone");
  assert.deepEqual(result.candidateIds, ["p-1"]);
});

test("une correspondance hors fenêtre ne déclenche aucun rapprochement", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "ovh-201", phone: "0612345678" },
    candidates: [{ id: "p-1", phone: "0612345678", createdAt: ancien }],
    now,
  });
  assert.equal(result.decision, DEDUP_NEW);
  assert.equal(result.reason, "aucune_correspondance");
});

test("un numéro de standard ne provoque aucun rapprochement", () => {
  const candidates = ["p-1", "p-2", "p-3", "p-4", "p-5"].map(id => ({
    id, phone: "0388000000", createdAt: recent,
  }));
  const result = decideLeadDedup({
    incoming: { submissionId: "ovh-300", phone: "0388000000" },
    candidates,
    now,
  });
  assert.equal(result.decision, DEDUP_NEW);
  assert.equal(result.reason, "telephone_partage_probable_standard");
  assert.deepEqual(result.candidateIds, []);
});

test("un même candidat trouvé par téléphone et par email n’est compté qu’une fois", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "ovh-400", phone: "0612345678", email: "a@b.fr" },
    candidates: [{ id: "p-9", phone: "0612345678", email: "a@b.fr", createdAt: recent }],
    now,
  });
  assert.equal(result.decision, DEDUP_REVIEW);
  assert.deepEqual(result.candidateIds, ["p-9"]);
});

test("une demande sans identité exploitable est toujours créée", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "ovh-500", name: "Anonyme" },
    candidates: [{ id: "p-1", phone: "0612345678", createdAt: recent }],
    now,
  });
  assert.equal(result.decision, DEDUP_NEW);
  assert.equal(result.reason, "aucune_identite_exploitable");
});

test("aucune décision ne vaut jamais fusion automatique", () => {
  const scenarios = [
    { incoming: { submissionId: "a", phone: "0612345678" }, candidates: [{ id: "p-1", phone: "0612345678", createdAt: recent }] },
    { incoming: { submissionId: "b", email: "a@b.fr" }, candidates: [{ id: "p-2", email: "a@b.fr", createdAt: recent }] },
    { incoming: { submissionId: "c" }, candidates: [] },
  ];
  for (const scenario of scenarios) {
    const result = decideLeadDedup({ ...scenario, now });
    assert.ok([DEDUP_NEW, DEDUP_REPLAY, DEDUP_REVIEW].includes(result.decision));
    assert.notEqual(result.decision, "merge");
  }
});

/**
 * Un candidat dont la date de création est inexploitable doit rester examiné.
 * L’écarter en silence ferait créer un doublon alors qu’un rapprochement
 * existe, et aucune décision ne vaut jamais fusion automatique.
 */
test("un candidat sans date de création reste dans la fenêtre", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "s-1", phone: "0612345678", name: "Ada Martin" },
    candidates: [{ id: "existant-1", phone: "0612345678", email: "", name: "Ada Martin" }],
    now: new Date("2026-11-05T10:00:00.000Z"),
  });
  assert.equal(result.decision, DEDUP_REVIEW);
  assert.ok(result.candidateIds.includes("existant-1"));
});

test("un candidat à la date illisible reste dans la fenêtre", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "s-2", phone: "0612345678" },
    candidates: [{ id: "existant-2", phone: "0612345678", createdAt: "pas une date" }],
    now: new Date("2026-11-05T10:00:00.000Z"),
  });
  assert.equal(result.decision, DEDUP_REVIEW);
});

test("un candidat ancien mais daté sort bien de la fenêtre", () => {
  const result = decideLeadDedup({
    incoming: { submissionId: "s-3", phone: "0612345678" },
    candidates: [{ id: "ancien", phone: "0612345678", createdAt: "2020-01-01T00:00:00.000Z" }],
    now: new Date("2026-11-05T10:00:00.000Z"),
  });
  assert.equal(result.decision, DEDUP_NEW);
});
