import test from "node:test";
import assert from "node:assert/strict";
import { isOwnedStoragePath, isTransientImageUrl, parseDataUrl, storagePathForPvImage } from "../app/lib/pv-study-assets.js";

test("les images PV embarquées sont reconnues et les chemins restent dans l’organisation", () => {
  const parsed = parseDataUrl("data:image/png;base64,iVBORw0KGgo=");
  assert.equal(parsed.contentType, "image/png");
  assert.ok(parsed.bytes.length > 0);
  assert.equal(isTransientImageUrl("data:image/png;base64,abc"), true);
  assert.equal(isTransientImageUrl("https://example.com/flux.png"), false);
  assert.equal(isOwnedStoragePath("org-1", "org-1/12/fluxPng.png"), true);
  assert.equal(isOwnedStoragePath("org-1", "pv-study/org-1/12/fluxPng.png"), true);
  assert.equal(isOwnedStoragePath("org-1", "org-2/12/fluxPng.png"), false);
  assert.equal(isOwnedStoragePath("org-1", "../secret.png"), false);
  assert.equal(storagePathForPvImage("org-1", 12, "fluxPng"), "org-1/12/fluxPng.png");
});
