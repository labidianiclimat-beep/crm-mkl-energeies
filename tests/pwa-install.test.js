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
  // Le numéro de version du cache n'est pas figé ici. Le faire reviendrait à
  // interdire de le changer, alors que l'incrémenter est précisément la façon
  // d'invalider l'ancien cache chez les utilisateurs déjà équipés. Ce qui doit
  // être garanti, c'est qu'il reste versionné et que le logo soit préchargé.
  assert.match(sw, /const CACHE = "mkl-crm-v\d+"/);
  assert.match(sw, /"\/mkl-energies\.png"/);
  assert.match(button, /beforeinstallprompt/);
  assert.match(button, /Sur l’écran d’accueil/);
  // `home` n'était pas défini : l'assertion précédente échouait avant
  // d'arriver ici, ce qui masquait l'erreur. Le bouton est monté à deux
  // endroits, et les deux comptent — sur l'accueil commercial, et sur la porte
  // d'entrée, pour qui installe l'application avant de se connecter.
  const home = readFileSync(new URL("../app/components/commercial-home.js", import.meta.url), "utf8");
  assert.match(home, /<InstallAppButton/);
  assert.match(gate, /<InstallAppButton/);
  assert.equal(existsSync(new URL("../public/apple-touch-icon.png", import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/icons/mkl-app-192.png", import.meta.url)), true);
});
