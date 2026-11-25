import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const lire = nom => readFileSync(new URL(`../${nom}`, import.meta.url), "utf8");

const URL_TEST = "https://projet-test.example";
const CLE_TEST = "cle-publishable-de-test";
const SERVICE_TEST = "cle-service-de-test";

function scenario(env, code) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: racine,
    env: { PATH: process.env.PATH || "", ...env },
    encoding: "utf8",
  });
}

test("les mécanismes de repli ne contiennent plus de projet ni de clé", () => {
  for (const nom of ["app/lib/supabase-server.js", "app/lib/supabase-rest.js", "LIRE-MOI-AUTRE-PC.md"]) {
    const source = lire(nom);
    assert.doesNotMatch(source, /supabase\.co/, `${nom} contient encore une URL Supabase`);
    assert.doesNotMatch(source, /sb_publishable_/, `${nom} contient encore une clé publishable`);
  }
  assert.match(lire("LIRE-MOI-AUTRE-PC.md"), /\.env\.example/);
  assert.match(lire("scripts/verifier-config-supabase.mjs"), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(lire("package.json"), /verifier-config-supabase\.mjs && next build/);
});

test("sans configuration, le serveur ne contacte pas Supabase", () => {
  const resultat = scenario({}, `
    let reseau = false;
    globalThis.fetch = async () => { reseau = true; throw new Error("reseau"); };
    const mod = await import("./app/lib/supabase-server.js");
    if (mod.supabaseConfigured()) process.exit(2);
    if (mod.serviceRoleConfigured()) process.exit(3);
    try {
      await mod.serviceRequest("/rest/v1/profiles?select=id");
      process.exit(4);
    } catch (error) {
      if (error.message !== "SERVICE_ROLE_NOT_CONFIGURED") process.exit(5);
    }
    try {
      await mod.getProfileByUserId("utilisateur", "jeton");
      process.exit(6);
    } catch (error) {
      if (error.message !== "Configuration Supabase incomplète.") process.exit(7);
    }
    const utilisateur = await mod.getUserFromAccessToken("jeton");
    if (utilisateur !== null) process.exit(8);
    if (reseau) process.exit(9);
    console.log("OK");
  `);
  assert.equal(resultat.status, 0, resultat.stderr || resultat.stdout);
  assert.match(resultat.stdout, /OK/);
  assert.doesNotMatch(`${resultat.stdout}\n${resultat.stderr}`, /supabase\.co/);
});

test("avec la configuration, le serveur appelle le projet indiqué", () => {
  const resultat = scenario({
    NEXT_PUBLIC_SUPABASE_URL: URL_TEST,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CLE_TEST,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_TEST,
  }, `
    let vu = null;
    globalThis.fetch = async (url, options) => {
      vu = { url: String(url), apikey: options.headers.apikey };
      return new Response(JSON.stringify([{ id: "profil" }]), { status: 200 });
    };
    const mod = await import("./app/lib/supabase-server.js");
    if (!mod.supabaseConfigured() || !mod.serviceRoleConfigured()) process.exit(2);
    const profil = await mod.getProfileByUserId("utilisateur", "jeton-utilisateur");
    if (!profil?.id) process.exit(3);
    if (!vu.url.startsWith(${JSON.stringify(URL_TEST)})) process.exit(4);
    if (vu.apikey !== ${JSON.stringify(CLE_TEST)}) process.exit(5);
    vu = null;
    await mod.serviceRequest("/rest/v1/profiles?select=id&limit=1");
    if (!vu.url.startsWith(${JSON.stringify(URL_TEST)})) process.exit(6);
    if (vu.apikey !== ${JSON.stringify(SERVICE_TEST)}) process.exit(7);
    console.log("OK");
  `);
  assert.equal(resultat.status, 0, resultat.stderr || resultat.stdout);
  assert.match(resultat.stdout, /OK/);
});

test("sans configuration, le navigateur ne contacte pas Supabase", () => {
  const resultat = scenario({}, `
    let reseau = false;
    globalThis.fetch = async () => { reseau = true; throw new Error("reseau"); };
    const mod = await import("./app/lib/supabase-rest.js");
    if (mod.cloudConfigured) process.exit(2);
    try {
      await mod.signIn("personne@exemple.test", "mot");
      process.exit(3);
    } catch (error) {
      if (error.message !== "Configuration Supabase incomplète.") process.exit(4);
    }
    if (reseau) process.exit(5);
    console.log("OK");
  `);
  assert.equal(resultat.status, 0, resultat.stderr || resultat.stdout);
  assert.match(resultat.stdout, /OK/);
});

test("avec la configuration, le navigateur appelle le projet indiqué", () => {
  const resultat = scenario({
    NEXT_PUBLIC_SUPABASE_URL: URL_TEST,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CLE_TEST,
  }, `
    const memoire = new Map();
    globalThis.localStorage = {
      getItem: cle => memoire.get(cle) ?? null,
      setItem: (cle, valeur) => memoire.set(cle, valeur),
      removeItem: cle => memoire.delete(cle),
    };
    let vu = null;
    globalThis.fetch = async (url, options) => {
      vu = { url: String(url), apikey: options.headers.apikey };
      return new Response(JSON.stringify({ access_token: "jeton", refresh_token: "rafraichi" }), { status: 200 });
    };
    const mod = await import("./app/lib/supabase-rest.js");
    if (!mod.cloudConfigured) process.exit(2);
    await mod.signIn("personne@exemple.test", "mot");
    if (!vu.url.startsWith(${JSON.stringify(URL_TEST)})) process.exit(3);
    if (vu.apikey !== ${JSON.stringify(CLE_TEST)}) process.exit(4);
    console.log("OK");
  `);
  assert.equal(resultat.status, 0, resultat.stderr || resultat.stdout);
  assert.match(resultat.stdout, /OK/);
});

test("le build s arrête si la configuration publique manque", () => {
  const vide = mkdtempSync(join(tmpdir(), "mkl-config-"));
  const script = join(racine, "scripts/verifier-config-supabase.mjs");
  const echoue = spawnSync(process.execPath, [script], {
    cwd: vide,
    env: { PATH: process.env.PATH || "" },
    encoding: "utf8",
  });
  assert.equal(echoue.status, 1);
  assert.match(echoue.stderr, /configuration Supabase incomplète/);
  assert.match(echoue.stderr, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(`${echoue.stdout}\n${echoue.stderr}`, /supabase\.co|sb_publishable_/);

  const passe = spawnSync(process.execPath, [script], {
    cwd: vide,
    env: {
      PATH: process.env.PATH || "",
      NEXT_PUBLIC_SUPABASE_URL: URL_TEST,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CLE_TEST,
    },
    encoding: "utf8",
  });
  assert.equal(passe.status, 0, passe.stderr);
  assert.equal(passe.stdout, "");
});
