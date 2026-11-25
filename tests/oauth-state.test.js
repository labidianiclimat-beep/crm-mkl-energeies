import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OAUTH_REDIRECT_PATHS,
  OAUTH_REJECTIONS,
  OAUTH_STATE_COOKIE,
  STATE_TTL_MS,
  clearedStateCookie,
  consumeFilter,
  createOAuthState,
  hashNonce,
  isWellFormedNonce,
  preConsumeGate,
  readStateCookie,
  safeRedirectPath,
  stateCookie,
  validateConsumedState,
  validateGrantedScopes,
} from "../app/lib/oauth-state.js";

const CALLBACK = readFileSync("app/api/google/calendar/callback/route.js", "utf8");
const CONNECT = readFileSync("app/api/google/calendar/connect/route.js", "utf8");
const MIGRATION = readFileSync("supabase/migrations/20261102_google_oauth_states.sql", "utf8");

const PROFIL = {
  id: "11111111-1111-1111-1111-111111111111",
  organization_id: "22222222-2222-2222-2222-222222222222",
  active: true,
  onboarding_completed_at: "2026-01-01T00:00:00.000Z",
};

function etatValide(now = Date.now()) {
  return createOAuthState({
    purpose: "calendar",
    userId: PROFIL.id,
    organizationId: PROFIL.organization_id,
    redirectPath: "/",
    now,
  });
}

test("le jeton envoyé à Google ne contient aucune identité", () => {
  const { state, cookieValue, record } = etatValide();
  assert.equal(isWellFormedNonce(state), true);
  assert.equal(cookieValue, state);
  // Ni l'utilisateur ni l'organisation ne doivent être devinables depuis le
  // jeton : c'était tout le défaut du `state` en base64 non signé.
  assert.doesNotMatch(state, /1111|2222/);
  const decode = Buffer.from(state, "base64url").toString("utf8");
  assert.doesNotMatch(decode, /userId|orgId|1111|2222/);
  // Seule l'empreinte est conservée : lire la table ne permet pas de rejouer.
  assert.equal(record.nonce_hash, hashNonce(state));
  assert.notEqual(record.nonce_hash, state);
  assert.match(record.nonce_hash, /^[0-9a-f]{64}$/);
});

test("la ligne enregistrée correspond aux colonnes réelles de la table", () => {
  const { record } = etatValide();
  // La table nomme la colonne `redirect_path`. Une clé `redirect_uri` aurait
  // fait échouer l'insertion à la première connexion.
  assert.deepEqual(
    Object.keys(record).sort(),
    ["expires_at", "nonce_hash", "organization_id", "purpose", "redirect_path", "user_id"]
  );
  for (const colonne of Object.keys(record)) {
    assert.ok(MIGRATION.includes(colonne), `la table n'a pas de colonne ${colonne}`);
  }
});

test("la durée de vie du jeton est courte et explicite", () => {
  const maintenant = Date.UTC(2026, 10, 5, 12, 0, 0);
  const { record } = etatValide(maintenant);
  assert.equal(new Date(record.expires_at).getTime() - maintenant, STATE_TTL_MS);
  assert.ok(STATE_TTL_MS <= 15 * 60 * 1000, "un jeton OAuth ne doit pas vivre longtemps");
});

test("une finalité inconnue est refusée dès la création", () => {
  assert.throws(() => createOAuthState({ purpose: "bitcoin", userId: PROFIL.id }), /finalite_inconnue/);
});

test("le chemin de retour est pris dans une liste fermée", () => {
  for (const autorise of OAUTH_REDIRECT_PATHS) {
    assert.equal(safeRedirectPath(autorise), autorise);
  }

  // Une redirection ouverte ferait du retour OAuth un tremplin vers un autre
  // domaine, avec l'adresse du CRM dans la barre d'adresse au départ.
  const refuses = [
    "https://exemple.test/",
    // Lu comme une adresse absolue par un navigateur. C'est ce qui passait la
    // première version de la contrainte.
    "//exemple.test/",
    "http://exemple.test",
    "javascript:alert(1)",
    // Remontées de chemin : le point étant autorisé, elles passaient la
    // seconde version de la contrainte.
    "/../admin",
    "/..",
    "/./",
    // Un chemin interne vraisemblable mais absent de la liste doit être
    // refusé : c'est tout l'intérêt d'une énumération par rapport à une forme.
    "/agenda?vue=semaine",
    "/admin.html",
    "/chemin avec espace",
    "",
    undefined,
    null,
  ];
  for (const refuse of refuses) {
    assert.equal(safeRedirectPath(refuse), null, `aurait dû être refusé : ${String(refuse)}`);
  }
});

test("la liste blanche de l application et celle de la base ne divergent pas", () => {
  // La contrainte de la table est la seule que `service_role` ne contourne
  // pas. Si les deux listes s'écartent, l'application proposerait un chemin
  // que la base refuserait, et la connexion échouerait à l'insertion.
  const clause = /redirect_path in \(([^)]*)\)/.exec(MIGRATION);
  assert.ok(clause, "la contrainte de liste blanche est introuvable dans la migration");
  const enBase = clause[1].split(",").map(part => part.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(enBase, OAUTH_REDIRECT_PATHS);
  // Et plus aucune expression de forme : c'est elle qui s'était trompée deux fois.
  assert.doesNotMatch(MIGRATION, /redirect_path ~/);
});

test("le cookie du jeton reste inaccessible au script et borné à OAuth", () => {
  const entete = stateCookie("abc", { secure: true });
  assert.match(entete, new RegExp(`^${OAUTH_STATE_COOKIE}=abc;`));
  assert.match(entete, /HttpOnly/);
  assert.match(entete, /Secure/);
  assert.match(entete, /Path=\/api\/google/);
  // `Lax` et non `Strict` : le retour de Google est une navigation venue d'un
  // autre site, et `Strict` empêcherait le cookie d'être renvoyé.
  assert.match(entete, /SameSite=Lax/);
  assert.doesNotMatch(entete, /SameSite=Strict/);
  assert.doesNotMatch(stateCookie("abc", { secure: false }), /Secure/);
  assert.match(clearedStateCookie(), /Max-Age=0/);
  assert.equal(readStateCookie(`autre=1; ${OAUTH_STATE_COOKIE}=xyz; encore=2`), "xyz");
  assert.equal(readStateCookie("autre=1"), "");
  assert.equal(readStateCookie(null), "");
});

test("le contrôle préalable exige un cookie correspondant au state", () => {
  const { state, cookieValue } = etatValide();
  assert.equal(preConsumeGate({ stateParam: state, cookieValue, purpose: "calendar" }).ok, true);

  const cas = [
    [{ stateParam: "", cookieValue, purpose: "calendar" }, OAUTH_REJECTIONS.MISSING_STATE],
    [{ stateParam: "court", cookieValue, purpose: "calendar" }, OAUTH_REJECTIONS.MALFORMED_STATE],
    [{ stateParam: state, cookieValue: "", purpose: "calendar" }, OAUTH_REJECTIONS.MISSING_COOKIE],
    [{ stateParam: state, cookieValue: etatValide().cookieValue, purpose: "calendar" }, OAUTH_REJECTIONS.COOKIE_MISMATCH],
    [{ stateParam: state, cookieValue, purpose: "autre" }, OAUTH_REJECTIONS.UNKNOWN_PURPOSE],
  ];
  for (const [entree, attendu] of cas) {
    const verdict = preConsumeGate(entree);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, attendu);
  }
});

test("un appel sans cookie est arrêté avant de pouvoir consommer le jeton", () => {
  // C'est la contrainte posée : le contrôle du cookie précède la consommation,
  // sinon un tiers pourrait invalider une connexion légitime en cours.
  const positionPorte = CALLBACK.indexOf("preConsumeGate(");
  const positionRefus = CALLBACK.indexOf("if (!porte.ok) return refuser");
  const positionConsommation = CALLBACK.indexOf("consumeFilter(");
  assert.ok(positionPorte > 0 && positionRefus > positionPorte);
  assert.ok(
    positionRefus < positionConsommation,
    "la consommation du jeton a lieu avant le refus pour cookie invalide"
  );
});

test("le filtre de consommation impose les trois conditions ensemble", () => {
  const hash = hashNonce("peu importe");
  const filtre = consumeFilter(hash, new Date("2026-11-05T12:00:00.000Z"));
  assert.match(filtre, new RegExp(`nonce_hash=eq\\.${hash}`));
  assert.match(filtre, /consumed_at=is\.null/);
  assert.match(filtre, /expires_at=gt\.2026-11-05T12:00:00\.000Z/);
  assert.throws(() => consumeFilter("pas-une-empreinte"), /state_malforme/);
  // La consommation est un PATCH conditionnel, et non une lecture suivie d'une
  // écriture : deux retours simultanés ne peuvent pas réussir tous les deux.
  assert.match(CALLBACK, /method:\s*"PATCH"/);
  assert.doesNotMatch(CALLBACK, /google_oauth_states\?select=/);
});

test("l identité écrite vient du jeton vérifié et jamais de l URL", () => {
  const verdict = validateConsumedState({
    record: {
      user_id: PROFIL.id,
      organization_id: PROFIL.organization_id,
      purpose: "calendar",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    expectedPurpose: "calendar",
    profile: PROFIL,
  });
  assert.deepEqual(verdict, {
    ok: true,
    userId: PROFIL.id,
    organizationId: PROFIL.organization_id,
    purpose: "calendar",
  });

  // La route n'a plus aucun moyen de lire une identité dans l'URL.
  assert.doesNotMatch(CALLBACK, /state\.userId|state\.orgId/);
  assert.doesNotMatch(CALLBACK, /JSON\.parse\(Buffer\.from/);
  assert.match(CALLBACK, /user_id:\s*verdict\.userId/);
  assert.match(CALLBACK, /organization_id:\s*verdict\.organizationId/);
});

test("un profil inactif, incomplet ou d une autre organisation est refusé", () => {
  const base = {
    user_id: PROFIL.id,
    organization_id: PROFIL.organization_id,
    purpose: "calendar",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const cas = [
    [{ record: base, profile: undefined }, OAUTH_REJECTIONS.PROFILE_MISSING],
    [{ record: base, profile: { ...PROFIL, active: false } }, OAUTH_REJECTIONS.PROFILE_INACTIVE],
    [{ record: base, profile: { ...PROFIL, onboarding_completed_at: null } }, OAUTH_REJECTIONS.PROFILE_NOT_ONBOARDED],
    [{ record: base, profile: { ...PROFIL, id: "33333333-3333-3333-3333-333333333333" } }, OAUTH_REJECTIONS.USER_MISMATCH],
    [{ record: base, profile: { ...PROFIL, organization_id: "44444444-4444-4444-4444-444444444444" } }, OAUTH_REJECTIONS.ORGANIZATION_MISMATCH],
    [{ record: { ...base, purpose: "google_ads" }, profile: PROFIL }, OAUTH_REJECTIONS.PURPOSE_MISMATCH],
    [{ record: { ...base, expires_at: new Date(Date.now() - 1).toISOString() }, profile: PROFIL }, OAUTH_REJECTIONS.EXPIRED],
    [{ record: null, profile: PROFIL }, OAUTH_REJECTIONS.NOT_CONSUMABLE],
  ];
  for (const [entree, attendu] of cas) {
    const verdict = validateConsumedState({ ...entree, expectedPurpose: "calendar" });
    assert.equal(verdict.ok, false, attendu);
    assert.equal(verdict.reason, attendu);
  }
});

test("une autorisation partielle de Google est refusée", () => {
  const complet = "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
  const requis = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
  ];
  assert.equal(validateGrantedScopes(complet, requis).ok, true);
  const partiel = validateGrantedScopes("openid email https://www.googleapis.com/auth/calendar.events", requis);
  assert.equal(partiel.ok, false);
  assert.deepEqual(partiel.missing, ["https://www.googleapis.com/auth/calendar.readonly"]);
  assert.equal(validateGrantedScopes("", requis).ok, false);
  // La route doit réellement appliquer ce contrôle, sinon la synchronisation
  // échouerait plus tard sans que personne ne sache pourquoi.
  assert.match(CALLBACK, /validateGrantedScopes\(tokens\.scope, REQUIRED_SCOPES\)/);
});

test("le lancement n ouvre pas de parcours invérifiable", () => {
  // Si le jeton ne peut pas être enregistré, aucune adresse d'autorisation
  // n'est renvoyée : un retour invérifiable serait pire qu'un refus.
  assert.match(CONNECT, /google_oauth_states/);
  assert.match(CONNECT, /status:\s*503/);
  assert.ok(
    CONNECT.indexOf("google_oauth_states") < CONNECT.indexOf("googleAuthUrl("),
    "l'adresse d'autorisation est construite avant l'enregistrement du jeton"
  );
  assert.match(CONNECT, /"Set-Cookie": stateCookie\(cookieValue/);
  // L'ancien `state` en base64 ne doit plus exister nulle part.
  assert.doesNotMatch(CONNECT, /base64url/);
  assert.doesNotMatch(CONNECT, /orgId/);
});

test("toutes les sorties du retour effacent le cookie", () => {
  const sorties = CALLBACK.match(/status:\s*302/g) || [];
  const effacements = CALLBACK.match(/clearedStateCookie\(/g) || [];
  assert.ok(sorties.length >= 2, "le retour doit avoir plusieurs sorties");
  assert.equal(effacements.length, sorties.length);
  // Le motif du refus est journalisé mais jamais renvoyé tel quel.
  assert.match(CALLBACK, /console\.error\(`google oauth refusé/);
  assert.doesNotMatch(CALLBACK, /google=\$\{motif\}/);
});

test("le déclencheur protège tous les champs, y compris ceux qui peuvent être NULL", () => {
  const garde = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.google_oauth_states_guard"),
    MIGRATION.indexOf("drop trigger if exists google_oauth_states_guard")
  );
  assert.ok(garde.length > 200, "ancrage du déclencheur à revoir");

  // Les sept champs posés à la création sont comparés, `redirect_path` inclus.
  for (const champ of [
    "nonce_hash",
    "user_id",
    "organization_id",
    "purpose",
    "redirect_path",
    "created_at",
    "expires_at",
  ]) {
    assert.match(
      garde,
      new RegExp(`new\\.${champ} is distinct from old\\.${champ}`),
      `${champ} n'est pas protégé par une comparaison sûre`
    );
  }

  // `<>` rendrait NULL pour `redirect_path`, donc ni vrai ni faux, et la
  // modification passerait en silence. Aucune comparaison de ce genre ne doit
  // subsister dans le corps du déclencheur.
  assert.doesNotMatch(garde, /new\.[a-z_]+ <> old\./, "une comparaison par <> subsiste");

  // Le déclencheur ne touche aucune table : les droits de son propriétaire
  // seraient un privilège sans emploi.
  assert.doesNotMatch(garde, /security definer/i);
  assert.match(garde, /set search_path = pg_catalog, public, pg_temp/);
});

test("les deux fonctions sont durcies et la purge garde ce qu il lui faut", () => {
  // `search_path = public` laissait `pg_temp` implicitement en tête, donc une
  // table temporaire pouvait masquer un objet du schéma public.
  assert.doesNotMatch(MIGRATION, /set search_path = public\s*$/m);
  assert.equal((MIGRATION.match(/set search_path = pg_catalog, public, pg_temp/g) || []).length, 2);

  const purge = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.purge_google_oauth_states"));
  // SECURITY DEFINER conservé sur la purge, et c'est ce qui permet de ne
  // jamais accorder DELETE à service_role.
  assert.match(purge, /security definer/i);
  assert.match(purge, /delete from public\.google_oauth_states/);
  assert.match(purge, /pg_catalog\.now\(\)/);
  assert.match(purge, /pg_catalog\.make_interval/);

  // Les droits ne sont pas élargis : rien pour anon ni authenticated.
  assert.match(MIGRATION, /grant execute on function public\.purge_google_oauth_states\(integer\) to service_role/);
  assert.match(MIGRATION, /grant execute on function public\.google_oauth_states_guard\(\) to service_role/);
  for (const grant of MIGRATION.split("\n").filter(ligne => /^grant /.test(ligne))) {
    // Seuls les bénéficiaires sont examinés, c'est-à-dire ce qui suit « to ».
    // Le mot `public` apparaît aussi comme nom de schéma dans la cible du
    // droit, où il ne désigne pas un rôle.
    const beneficiaires = grant.slice(grant.lastIndexOf(" to ") + 4);
    assert.match(beneficiaires, /^service_role;?$/, `droit trop large : ${grant}`);
  }
});

test("la base garantit l usage unique même en cas de bogue applicatif", () => {
  // `service_role` contourne RLS mais pas les déclencheurs : c'est le seul
  // endroit où l'usage unique tient quoi qu'il arrive dans l'application.
  assert.match(MIGRATION, /OAUTH_STATE_ALREADY_CONSUMED/);
  assert.match(MIGRATION, /OAUTH_STATE_IMMUTABLE/);
  assert.match(MIGRATION, /before update on public\.google_oauth_states/);
  // Aucun droit de suppression directe : un jeton consommé pourrait sinon être
  // supprimé puis réinséré pour être rejoué.
  assert.match(MIGRATION, /revoke all on public\.google_oauth_states from anon, authenticated, service_role/);
  assert.match(MIGRATION, /grant select, insert, update on public\.google_oauth_states to service_role/);
  assert.doesNotMatch(MIGRATION, /grant delete on public\.google_oauth_states/);
});
