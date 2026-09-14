import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("aucune identite n'est deduite d'un jwt non verifie", () => {
  const source = read("app/lib/supabase-server.js");
  assert.ok(!/decodeJwtPayload/.test(source), "le decodage de JWT sans verification a ete reintroduit");
  assert.ok(
    !/admin\/users\/\$\{payload\.sub\}/.test(source),
    "un compte est encore charge depuis un sub non verifie"
  );
  // Le repli legitime rejoue la requete GoTrue : Supabase valide la signature.
  assert.match(source, /requestAsGateway\("\/auth\/v1\/user"/);
});

test("le role de bootstrap ignore les metadonnees ecrites par l'utilisateur", () => {
  const source = read("app/lib/supabase-server.js");
  const bootstrap = source.slice(
    source.indexOf("function resolveBootstrapRole"),
    source.indexOf("export async function ensureProfileForUser")
  );
  assert.ok(!/user_metadata/.test(bootstrap), "resolveBootstrapRole lit encore user_metadata");
  assert.match(bootstrap, /app_metadata\?\.role/);
});

test("issue-pin n'accepte plus le code d'acces d'equipe comme secret", () => {
  const source = read("app/api/auth/issue-pin/route.js");
  assert.ok(
    !/process\.env\.CRM_ACCESS_PIN/.test(source),
    "CRM_ACCESS_PIN autorise encore cette route"
  );
  assert.ok(
    !/process\.env\.ACTIVATION_PIN_PEPPER/.test(source),
    "le sel des PIN sert encore de secret d'autorisation"
  );
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /MIN_SECRET_LENGTH = 24/);
});

test("la route d'envoi d'email sans authentification a disparu", () => {
  assert.throws(() => read("app/api/invitations/send/route.js"), /ENOENT/);
});

test("bootstrap-profile ne cree ni n'active un profil", () => {
  const source = read("app/api/auth/bootstrap-profile/route.js");
  assert.ok(!/ensureProfileForUser/.test(source), "un profil est encore cree hors invitation");
  assert.ok(!/completeProfileActivation/.test(source), "un compte est encore active sans PIN");
});

test("reset-password n'active pas un compte", () => {
  const source = read("app/api/auth/reset-password/route.js");
  assert.ok(!/completeProfileActivation/.test(source), "un compte est encore active sans PIN");
  assert.ok(!/ensureProfileForUser/.test(source), "un profil est encore cree hors invitation");
});

test("resend-pin verifie l'organisation du profil cible", () => {
  const source = read("app/api/users/resend-pin/route.js");
  assert.match(source, /profile\.organization_id !== auth\.profile\.organization_id/);
});

test("le proxy pvgis exige une session", () => {
  assert.match(read("app/api/pv/yield/route.js"), /requireApiSession/);
});

test("l'email pro forma echappe les donnees client", () => {
  const source = read("app/api/proforma/send/route.js");
  assert.match(source, /function escapeHtml/);
  assert.ok(
    !/Bonjour \$\{client\.contact \|\| client\.name\}/.test(source),
    "le nom du client est encore injecte brut dans le HTML"
  );
});

test("l'import csv de clients passe par l'api", () => {
  const source = read("app/page.js");
  const start = source.indexOf('} else if(type==="client")');
  const block = source.slice(start, source.indexOf("} else setGroups(", start));
  assert.match(block, /authFetch\("\/api\/clients"/);
  assert.match(block, /method:"POST"/);
});

test("la connexion par pin ne distingue pas les adresses connues", () => {
  const source = read("app/api/auth/pin-login/route.js");
  assert.ok(
    !/Aucun code PIN actif/.test(source),
    "un message revele encore l'existence d'un compte sans PIN actif"
  );
  const matches = source.match(/UNKNOWN_CREDENTIALS/g) || [];
  assert.ok(matches.length >= 4, "le message unique n'est pas utilise sur tous les chemins d'echec");
});
