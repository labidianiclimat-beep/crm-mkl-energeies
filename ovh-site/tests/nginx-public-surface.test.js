/**
 * Accord entre les deux couches de filtrage.
 *
 * Nginx refuse /lib/ par préfixe et n'autorise que des chemins exacts. Node
 * applique sa propre liste blanche. Les deux doivent dire la même chose :
 * c'est leur désaccord qui a rendu le module de capture inaccessible alors
 * qu'il était autorisé côté Node.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeniedPublicPath } from "../lib/public-static.mjs";

const NGINX = readFileSync(
  fileURLToPath(new URL("../deploy/ovh/nginx.conf", import.meta.url)),
  "utf8"
);

/** Corps réel : les exemples en commentaire ne sont pas de la configuration. */
const BODY = NGINX.split("\n").filter(line => !line.trim().startsWith("#")).join("\n");

/** Chemins autorisés explicitement, c'est-à-dire proxifiés vers Node. */
function allowedExactPaths(prefix) {
  const found = new Set();
  const pattern = /location\s+=\s+(\S+)\s*\{([^}]*)\}/g;
  let match;
  while ((match = pattern.exec(BODY))) {
    const [, path, block] = match;
    if (path.startsWith(prefix) && block.includes("proxy_pass")) found.add(path);
  }
  return found;
}

const LIB_FILES = readdirSync(fileURLToPath(new URL("../lib/", import.meta.url)))
  .filter(name => name.endsWith(".mjs"))
  .map(name => `/lib/${name}`);

test("le refus préfixe sur /lib/ est toujours en place", () => {
  assert.match(BODY, /location\s+\^~\s+\/lib\/\s*\{\s*return\s+404;\s*\}/);
});

test("les autres refus de sécurité sont intacts", () => {
  for (const rule of [
    /location\s+\^~\s+\/deploy\/\s*\{\s*return\s+404;/,
    /location\s+\^~\s+\/node_modules\/\s*\{\s*return\s+404;/,
    /location\s+\^~\s+\/tests\/\s*\{\s*return\s+404;/,
    /location\s+\^~\s+\/data\/\s*\{\s*return\s+404;/,
    /location\s+=\s+\/server\.mjs\s*\{\s*return\s+404;/,
    /location\s+=\s+\/package\.json\s*\{\s*return\s+404;/,
    /location\s+~\s+\/\\\.\(\?!well-known\)/,
  ]) {
    assert.match(BODY, rule, `règle de refus absente : ${rule}`);
  }
});

test("le module de capture est exposé par Nginx", () => {
  assert.ok(
    allowedExactPaths("/lib/").has("/lib/attribution-capture.mjs"),
    "sans cette location exacte, Nginx renvoie 404 avant d'atteindre Node"
  );
});

/** Le cœur du test : Nginx et Node autorisent exactement le même ensemble. */
test("Nginx et Node autorisent exactement les mêmes modules", () => {
  const parNginx = [...allowedExactPaths("/lib/")].sort();
  const parNode = LIB_FILES.filter(path => !isDeniedPublicPath(path)).sort();
  assert.deepEqual(
    parNginx.filter(path => LIB_FILES.includes(path)),
    parNode,
    "un module autorisé d'un seul côté est soit inaccessible, soit exposé par erreur"
  );
});

test("chaque module privé est refusé par les deux couches", () => {
  const prives = LIB_FILES.filter(path => !allowedExactPaths("/lib/").has(path));
  assert.ok(prives.length >= 6, "le dépôt doit contenir des modules privés");
  for (const path of prives) {
    assert.equal(isDeniedPublicPath(path), true, `${path} doit être refusé par Node`);
  }
  // Les modules les plus sensibles sont nommés : un oubli de liste blanche
  // exposerait le secret de synchronisation ou l'authentification admin.
  for (const path of ["/lib/crm-sync.mjs", "/lib/admin-auth.mjs", "/lib/lead-attribution.mjs"]) {
    assert.ok(prives.includes(path), `${path} ne doit jamais être exposé`);
    assert.equal(isDeniedPublicPath(path), true);
  }
});

test("aucune location exacte n'ouvre un répertoire entier", () => {
  for (const path of allowedExactPaths("/lib/")) {
    assert.equal(path.endsWith("/"), false, `${path} ouvrirait un répertoire`);
    assert.match(path, /^\/lib\/[\w.-]+\.mjs$/, `${path} n'est pas un module nommé`);
  }
});

test("la consigne de déploiement couvre les deux blocs server", () => {
  const entete = NGINX.slice(0, NGINX.indexOf("server {"));
  assert.match(entete, /port 80 et port 443/);
  assert.match(entete, /attribution-capture\.mjs/);
  assert.match(entete, /nginx -t/);
});
