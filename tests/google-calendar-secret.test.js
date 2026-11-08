import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../app/lib/google-token-crypto.js";

test("un jeton google chiffre avec l ancien secret reste lisible", () => {
  const previous = {
    CRM_SESSION_SECRET: process.env.CRM_SESSION_SECRET,
    ACTIVATION_PIN_PEPPER: process.env.ACTIVATION_PIN_PEPPER,
  };
  try {
    delete process.env.CRM_SESSION_SECRET;
    process.env.ACTIVATION_PIN_PEPPER = "pepper-historique";
    const stored = encryptSecret("jeton-google");
    process.env.CRM_SESSION_SECRET = "secret-actuel";
    assert.equal(decryptSecret(stored), "jeton-google");
    assert.throws(() => decryptSecret(`${stored}xx`), /reconnecte-le/);
  } finally {
    if (previous.CRM_SESSION_SECRET == null) delete process.env.CRM_SESSION_SECRET;
    else process.env.CRM_SESSION_SECRET = previous.CRM_SESSION_SECRET;
    if (previous.ACTIVATION_PIN_PEPPER == null) delete process.env.ACTIVATION_PIN_PEPPER;
    else process.env.ACTIVATION_PIN_PEPPER = previous.ACTIVATION_PIN_PEPPER;
  }
});
