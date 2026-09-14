import test from "node:test";
import assert from "node:assert/strict";
import {
  generateActivationPin,
  hashActivationPin,
  verifyActivationPin,
  pinRecordUsable,
  pinRecordUsableForLogin,
  nextAttemptState,
  MAX_PIN_ATTEMPTS,
} from "../app/lib/activation-pin.js";

// Hacher un PIN exige désormais un sel dédié : la suite se le donne elle-même.
process.env.ACTIVATION_PIN_PEPPER ||= "pepper-de-test-activation-pin";

test("generated pin has 6 digits", () => {
  const pin = generateActivationPin();
  assert.match(pin, /^\d{6}$/);
});

test("valid pin verifies and marks record used", () => {
  const pin = "482916";
  const { pin_hash, pin_salt } = hashActivationPin(pin);
  assert.equal(verifyActivationPin(pin, pin_hash, pin_salt), true);
  assert.equal(verifyActivationPin("000000", pin_hash, pin_salt), false);

  const record = {
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0,
  };
  assert.equal(pinRecordUsable(record).ok, true);
  const failed = nextAttemptState(record, false);
  assert.equal(failed.attempts, 1);
});

test("pin locks after max attempts", () => {
  const record = { attempts: MAX_PIN_ATTEMPTS - 1, expires_at: new Date(Date.now() + 60_000).toISOString() };
  const locked = nextAttemptState(record, false);
  assert.ok(locked.locked_until);
});

test("expired pin is rejected", () => {
  const record = { expires_at: new Date(Date.now() - 1000).toISOString() };
  assert.equal(pinRecordUsable(record).reason, "expired");
});

test("login pin stays usable after first use", () => {
  const record = {
    used_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(pinRecordUsable(record).ok, false);
  assert.equal(pinRecordUsableForLogin(record).ok, true);
});

test("personal pin must differ from temporary pin", async () => {
  const { validatePersonalPinChoice } = await import("../app/lib/activation-pin.js");
  assert.equal(validatePersonalPinChoice("123456", "123456", "123456").ok, false);
  assert.equal(validatePersonalPinChoice("123456", "654321", "654321").ok, true);
});
