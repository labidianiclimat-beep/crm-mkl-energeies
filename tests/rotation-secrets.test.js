/**
 * Renouvellement des secrets d'accès sans interruption de service.
 *
 * Toutes les valeurs employées ici sont fabriquées. Aucun secret réel
 * n'apparaît dans ce fichier.
 *
 * Ce que ces tests protègent : un renouvellement de PIN ou de secret de
 * session ne doit pas éjecter les utilisateurs en cours. La fenêtre de
 * tolérance est la seule façon d'y parvenir, et elle doit se refermer.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionToken,
  pinConfigured,
  verifyPin,
  verifySessionToken,
} from "../app/lib/crm-session.js";

const NOUVEAU_PIN = "778899";
const ANCIEN_PIN = "112233";
const NOUVEAU_SECRET = "secret-de-session-fabrique-pour-les-essais-aaaa";
const ANCIEN_SECRET = "secret-de-session-fabrique-pour-les-essais-bbbb";

function avecEnvironnement(valeurs, corps) {
  const sauvegarde = {};
  for (const [cle, valeur] of Object.entries(valeurs)) {
    sauvegarde[cle] = process.env[cle];
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
  try {
    return corps();
  } finally {
    for (const [cle, valeur] of Object.entries(sauvegarde)) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  }
}

// ---------------------------------------------------------------------------
// Le code d'accès
// ---------------------------------------------------------------------------

test("pendant la fenêtre, l'ancien et le nouveau code sont acceptés", () => {
  avecEnvironnement(
    { CRM_ACCESS_PIN: NOUVEAU_PIN, CRM_ACCESS_PIN_PRECEDENT: ANCIEN_PIN },
    () => {
      assert.equal(verifyPin(NOUVEAU_PIN), true, "le nouveau code doit passer");
      assert.equal(verifyPin(ANCIEN_PIN), true, "l'ancien code doit passer pendant la transition");
      assert.equal(verifyPin("000000"), false, "un code inconnu reste refusé");
    },
  );
});

test("la fenêtre refermée, l'ancien code ne vaut plus rien", () => {
  avecEnvironnement(
    { CRM_ACCESS_PIN: NOUVEAU_PIN, CRM_ACCESS_PIN_PRECEDENT: undefined },
    () => {
      assert.equal(verifyPin(NOUVEAU_PIN), true);
      assert.equal(verifyPin(ANCIEN_PIN), false, "retirer la variable doit révoquer l'ancien code");
    },
  );
});

test("un code précédent trop court est ignoré, et n'ouvre donc aucune porte", () => {
  avecEnvironnement(
    { CRM_ACCESS_PIN: NOUVEAU_PIN, CRM_ACCESS_PIN_PRECEDENT: "12" },
    () => {
      assert.equal(verifyPin("12"), false);
      assert.equal(verifyPin(NOUVEAU_PIN), true);
    },
  );
});

test("une valeur vide ne doit jamais être acceptée, même sans configuration", () => {
  avecEnvironnement(
    { CRM_ACCESS_PIN: undefined, CRM_ACCESS_PIN_PRECEDENT: undefined },
    () => {
      assert.equal(pinConfigured(), false);
      assert.equal(verifyPin(""), false);
      assert.equal(verifyPin(null), false);
    },
  );
});

// ---------------------------------------------------------------------------
// Les sessions en cours
// ---------------------------------------------------------------------------

test("une session signée avec l'ancien secret survit à la bascule", () => {
  const jeton = avecEnvironnement(
    { CRM_SESSION_SECRET: ANCIEN_SECRET, CRM_SESSION_SECRET_PRECEDENT: undefined },
    () => createSessionToken(),
  );

  avecEnvironnement(
    { CRM_SESSION_SECRET: NOUVEAU_SECRET, CRM_SESSION_SECRET_PRECEDENT: ANCIEN_SECRET },
    () => {
      assert.equal(verifySessionToken(jeton), true, "la session en cours ne doit pas être coupée");
    },
  );

  avecEnvironnement(
    { CRM_SESSION_SECRET: NOUVEAU_SECRET, CRM_SESSION_SECRET_PRECEDENT: undefined },
    () => {
      assert.equal(
        verifySessionToken(jeton), false,
        "la fenêtre refermée, l'ancienne session doit expirer",
      );
    },
  );
});

test("le code d'accès ne sert plus de secret de session quand un secret dédié existe", () => {
  // Point de bascule à ne pas manquer : sans secret dédié, renouveler le code
  // d'accès invalide toutes les sessions d'un coup. C'est précisément ce que la
  // production évite en déclarant CRM_SESSION_SECRET.
  const jeton = avecEnvironnement(
    {
      CRM_SESSION_SECRET: NOUVEAU_SECRET,
      CRM_SESSION_SECRET_PRECEDENT: undefined,
      CRM_ACCESS_PIN: ANCIEN_PIN,
    },
    () => createSessionToken(),
  );

  avecEnvironnement(
    {
      CRM_SESSION_SECRET: NOUVEAU_SECRET,
      CRM_SESSION_SECRET_PRECEDENT: undefined,
      CRM_ACCESS_PIN: NOUVEAU_PIN,
    },
    () => {
      assert.equal(
        verifySessionToken(jeton), true,
        "changer le code d'accès ne doit pas toucher aux sessions",
      );
    },
  );
});

test("une signature illisible est refusée, quels que soient les secrets", () => {
  avecEnvironnement(
    { CRM_SESSION_SECRET: NOUVEAU_SECRET, CRM_SESSION_SECRET_PRECEDENT: ANCIEN_SECRET },
    () => {
      assert.equal(verifySessionToken("1700000000.pas-de-l-hexadecimal"), false);
      assert.equal(verifySessionToken("1700000000."), false);
      assert.equal(verifySessionToken("sans-point"), false);
      assert.equal(verifySessionToken(""), false);
    },
  );
});

test("sans aucun secret, aucune session n'est valide", () => {
  const jeton = avecEnvironnement(
    { CRM_SESSION_SECRET: NOUVEAU_SECRET, CRM_SESSION_SECRET_PRECEDENT: undefined },
    () => createSessionToken(),
  );

  avecEnvironnement(
    {
      CRM_SESSION_SECRET: undefined,
      CRM_SESSION_SECRET_PRECEDENT: undefined,
      CRM_ACCESS_PIN: undefined,
    },
    () => {
      assert.equal(verifySessionToken(jeton), false);
    },
  );
});
