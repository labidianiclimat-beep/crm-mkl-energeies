import test from "node:test";
import assert from "node:assert/strict";
import { rememberOrgPayload, forgetOrgPayload } from "../app/lib/org-payload-cache.js";

test("le cache org réutilise le payload pendant le TTL et se vide sur oubli", async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { ok: true, n: calls };
  };
  const first = await rememberOrgPayload("test-cache", "org-1", loader, { ttlMs: 10_000 });
  const second = await rememberOrgPayload("test-cache", "org-1", loader, { ttlMs: 10_000 });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.payload.n, 1);
  assert.equal(second.payload.n, 1);
  assert.equal(calls, 1);
  forgetOrgPayload("test-cache", "org-1");
  const third = await rememberOrgPayload("test-cache", "org-1", loader, { ttlMs: 10_000 });
  assert.equal(third.cached, false);
  assert.equal(third.payload.n, 2);
  assert.equal(calls, 2);
  forgetOrgPayload("test-cache");
});
