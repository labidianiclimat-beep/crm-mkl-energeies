import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("le CRM s installe comme application avec le logo MKL", () => {
  const manifest = readFileSync(new URL("../app/manifest.js", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const button = readFileSync(new URL("../app/components/install-app-button.js", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../app/components/crm-access-gate.js", import.meta.url), "utf8");
  assert.match(manifest, /short_name: "MKL CRM"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /mkl-app-512\.png/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /apple-touch-icon/);
  assert.match(layout, /initialScale: 1/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /font-size: 16px !important/);
  assert.match(css, /text-size-adjust: 100%/);
  assert.match(sw, /serviceWorker|mkl-crm-v2/);
  assert.match(button, /beforeinstallprompt/);
  assert.match(button, /Sur l’écran d’accueil/);
  assert.match(home, /<InstallAppButton/);
  assert.equal(existsSync(new URL("../public/apple-touch-icon.png", import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/icons/mkl-app-192.png", import.meta.url)), true);
});
