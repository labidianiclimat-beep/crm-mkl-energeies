/**
 * Consommation OAuth à travers un vrai PostgREST.
 *
 * C'était la seule lacune connue : les six autres suites parlent à PostgreSQL
 * directement, alors que le CRM passe par PostgREST. La syntaxe des filtres,
 * la traduction des erreurs de déclencheur en codes HTTP et le cloisonnement
 * des rôles ne sont vérifiables qu'à ce niveau.
 *
 * Aucun projet Supabase n'est nécessaire : PostgREST est un binaire unique,
 * posé devant la base de test locale, avec les mêmes rôles que Supabase. La
 * base de production n'est jamais sollicitée.
 *
 * Les requêtes testées ne sont pas réécrites pour l'occasion : elles sont
 * construites par `consumeFilter`, la fonction qu'utilise la route de retour.
 * Un test qui recopierait l'URL à la main ne prouverait rien sur le code.
 *
 *   bash scripts/pg-test/install.sh
 *   bash scripts/pg-test/install-postgrest.sh
 *   node scripts/pg-test/07-postgrest-oauth.mjs
 */

import { createHmac, randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PG_HOME, CONNEXION, ORG, attendre, journal, preparerBase } from "./lib.mjs";
import { consumeFilter } from "../../app/lib/oauth-state.js";

const log = journal();
const PORT = Number(process.env.POSTGREST_PORT || 55433);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET_JWT = "jeton-de-test-pour-postgrest-au-moins-32-caracteres";

/** JWT HS256 minimal : Supabase n'en demande pas davantage pour choisir le rôle. */
function jeton(role) {
  const encode = objet => Buffer.from(JSON.stringify(objet)).toString("base64url");
  const corps = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`;
  return `${corps}.${createHmac("sha256", SECRET_JWT).update(corps).digest("base64url")}`;
}

const JETONS = { service_role: jeton("service_role"), authenticated: jeton("authenticated") };

/** Appel HTTP tel que le ferait `serviceRequest`, mais sans masquer le statut. */
async function appel(chemin, { method = "GET", role = "service_role", prefer, body } = {}) {
  const entetes = { Accept: "application/json" };
  if (role) entetes.Authorization = `Bearer ${JETONS[role]}`;
  if (prefer) entetes.Prefer = prefer;
  if (body !== undefined) entetes["Content-Type"] = "application/json";
  const reponse = await fetch(`${BASE}${chemin}`, {
    method,
    headers: entetes,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texte = await reponse.text();
  let donnees = null;
  try {
    donnees = texte ? JSON.parse(texte) : null;
  } catch {
    donnees = texte;
  }
  return { statut: reponse.status, donnees };
}

// ---------------------------------------------------------------------------
log.titre("Mise en place : PostgREST devant la base de test");
// ---------------------------------------------------------------------------

const { sql } = await preparerBase(process.env.PG_TEST_DB_PR || "mkl_postgrest");

// Supabase ne se connecte pas avec le rôle applicatif : `authenticator` se
// connecte, puis PostgREST bascule vers le rôle porté par le jeton. Reproduire
// ce schéma est indispensable, sinon le cloisonnement testé n'est pas le bon.
await sql.unsafe(`
  alter role authenticator with login password 'authenticator';
  grant anon, authenticated, service_role to authenticator;
  grant usage on schema public to anon, authenticated, service_role;
`);

const UTILISATEUR = "11111111-1111-1111-1111-111111111111";
await sql`insert into public.organizations (id, name) values (${ORG}, 'MKL Essai') on conflict (id) do nothing`;
await sql`insert into auth.users (id, email) values (${UTILISATEUR}, 'essai@exemple.test') on conflict (id) do nothing`;

const config = `${PG_HOME}/postgrest-essai.conf`;
writeFileSync(
  config,
  [
    `db-uri = "postgres://authenticator:authenticator@${CONNEXION.host}:${CONNEXION.port}/${sql.options.database}"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    `jwt-secret = "${SECRET_JWT}"`,
    `server-port = ${PORT}`,
    "db-pool = 4",
  ].join("\n") + "\n",
  { mode: 0o600 }
);

const serveur = spawn(`${PG_HOME}/postgrest`, [config], { stdio: ["ignore", "pipe", "pipe"] });
let journalServeur = "";
serveur.stdout.on("data", chunk => (journalServeur += chunk));
serveur.stderr.on("data", chunk => (journalServeur += chunk));

const demarre = await attendre(
  async () => {
    try {
      const reponse = await fetch(`${BASE}/`, { headers: { Authorization: `Bearer ${JETONS.service_role}` } });
      return reponse.status < 500;
    } catch {
      return false;
    }
  },
  { essais: 100, pause: 100 }
);

if (!demarre) {
  log.ko("PostgREST n'a pas démarré", journalServeur.split("\n").slice(-6).join(" | "));
  serveur.kill("SIGTERM");
  await sql.end();
  process.exitCode = 1;
} else {
  log.ok(`PostgREST écoute sur ${BASE}, devant la base de test`);

  /** Pose un jeton directement en base, comme le fait la route de connexion. */
  async function poser({ minutes = 10, purpose = "calendar", consomme = false } = {}) {
    const secret = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(secret).digest("hex");
    await sql`
      insert into public.google_oauth_states
        (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at, consumed_at)
      values (${hash}, ${purpose}, ${UTILISATEUR}, ${ORG}, '/',
              pg_catalog.now() + pg_catalog.make_interval(mins => ${minutes}),
              ${consomme ? sql`pg_catalog.now()` : null})
    `;
    return { secret, hash };
  }

  // -------------------------------------------------------------------------
  log.titre("1. Le filtre atomique, construit par le code de la route");
  // -------------------------------------------------------------------------

  const normal = await poser();
  const filtre = consumeFilter(normal.hash);
  log.info(`filtre produit : ${filtre.replace(normal.hash, normal.hash.slice(0, 12) + "…")}`);

  const consommation = await appel(`/google_oauth_states?${filtre}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { consumed_at: new Date().toISOString() },
  });

  if (consommation.statut === 200 && Array.isArray(consommation.donnees) && consommation.donnees.length === 1) {
    log.ok("la consommation renvoie 200 et exactement une ligne");
  } else {
    log.ko(`consommation : statut ${consommation.statut}`, JSON.stringify(consommation.donnees).slice(0, 300));
  }

  const ligne = consommation.donnees?.[0] || {};
  for (const champ of ["nonce_hash", "purpose", "user_id", "organization_id", "redirect_path", "expires_at"]) {
    if (champ in ligne) continue;
    log.ko(`le champ ${champ} manque dans la réponse : la route en a besoin`);
  }
  if (ligne.user_id === UTILISATEUR && ligne.organization_id === ORG && ligne.redirect_path === "/") {
    log.ok("l'identité renvoyée est celle enregistrée, et non celle de l'URL");
  } else {
    log.ko("l'identité renvoyée ne correspond pas", JSON.stringify(ligne).slice(0, 200));
  }

  // -------------------------------------------------------------------------
  log.titre("2. Le rejeu est refusé par PostgREST, pas seulement en SQL");
  // -------------------------------------------------------------------------

  const rejeu = await appel(`/google_oauth_states?${consumeFilter(normal.hash)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { consumed_at: new Date().toISOString() },
  });

  // Le filtre exige `consumed_at=is.null` : la ligne consommée n'est plus
  // sélectionnée, donc PostgREST renvoie 200 avec zéro ligne. La route traite
  // ce tableau vide comme un refus, ce qui est le comportement voulu : le
  // déclencheur n'est même pas atteint.
  if (rejeu.statut === 200 && Array.isArray(rejeu.donnees) && rejeu.donnees.length === 0) {
    log.ok("le rejeu renvoie 200 et zéro ligne : la route le traite en refus");
  } else {
    log.ko(`rejeu : statut ${rejeu.statut}`, JSON.stringify(rejeu.donnees).slice(0, 300));
  }

  // -------------------------------------------------------------------------
  log.titre("3. Deux retours simultanés, à travers HTTP");
  // -------------------------------------------------------------------------

  const course = await poser();
  const simultanes = await Promise.all(
    [1, 2].map(() =>
      appel(`/google_oauth_states?${consumeFilter(course.hash)}`, {
        method: "PATCH",
        prefer: "return=representation",
        body: { consumed_at: new Date().toISOString() },
      })
    )
  );
  const gagnants = simultanes.filter(r => Array.isArray(r.donnees) && r.donnees.length === 1).length;
  if (gagnants === 1) {
    log.ok("un seul des deux appels simultanés obtient la ligne");
  } else {
    log.ko(`${gagnants} appel(s) ont obtenu la ligne, un seul était attendu`);
  }

  // -------------------------------------------------------------------------
  log.titre("4. Un jeton expiré n'est pas consommable");
  // -------------------------------------------------------------------------

  const expire = await poser({ minutes: 10 });
  // La date d'expiration ne se modifie pas par UPDATE, le déclencheur l'interdit.
  // On réinsère donc la ligne déjà expirée pour obtenir cet état.
  await sql`delete from public.google_oauth_states where nonce_hash = ${expire.hash}`;
  await sql`
    insert into public.google_oauth_states
      (nonce_hash, purpose, user_id, organization_id, redirect_path, created_at, expires_at)
    values (${expire.hash}, 'calendar', ${UTILISATEUR}, ${ORG}, '/',
            pg_catalog.now() - pg_catalog.make_interval(mins => 30),
            pg_catalog.now() - pg_catalog.make_interval(mins => 5))
  `;
  const perime = await appel(`/google_oauth_states?${consumeFilter(expire.hash)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { consumed_at: new Date().toISOString() },
  });
  if (Array.isArray(perime.donnees) && perime.donnees.length === 0) {
    log.ok("un jeton expiré n'est pas sélectionné par le filtre");
  } else {
    log.ko("un jeton expiré a été consommé", JSON.stringify(perime.donnees).slice(0, 200));
  }

  // -------------------------------------------------------------------------
  log.titre("5. Le déclencheur d'immuabilité remonte bien en HTTP");
  // -------------------------------------------------------------------------

  const immuable = await poser();
  const tentative = await appel(`/google_oauth_states?nonce_hash=eq.${immuable.hash}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { consumed_at: new Date().toISOString(), redirect_path: "https://exemple.test/" },
  });
  // Deux remparts existent, et c'est le déclencheur qui parle, non la liste
  // blanche : un déclencheur BEFORE UPDATE s'exécute avant la vérification des
  // contraintes. La valeur est donc refusée pour immuabilité, et la liste
  // blanche ne sert qu'à l'insertion. Les deux sont utiles, mais dans cet
  // ordre, ce que seul un essai à travers HTTP a permis de constater.
  const motif = JSON.stringify(tentative.donnees || "");
  if (tentative.statut >= 400 && /redirect_chk|OAUTH_STATE_IMMUTABLE/.test(motif)) {
    log.ok(`une redirection externe est refusée en HTTP ${tentative.statut}`);
    log.info(`motif remonté : ${(tentative.donnees?.message || tentative.donnees?.code || "").slice(0, 80)}`);
  } else {
    log.ko(`statut ${tentative.statut}, motif inattendu`, motif.slice(0, 300));
  }

  // -------------------------------------------------------------------------
  log.titre("6. Cloisonnement des rôles, vu depuis le réseau");
  // -------------------------------------------------------------------------

  for (const [role, etiquette] of [
    [null, "anon, sans jeton"],
    ["authenticated", "authenticated, jeton valide"],
  ]) {
    const lecture = await appel("/google_oauth_states?select=nonce_hash&limit=1", { role });
    if (lecture.statut >= 400) {
      log.ok(`${etiquette} ne peut pas lire la table (HTTP ${lecture.statut})`);
    } else {
      log.ko(`${etiquette} a lu la table`, JSON.stringify(lecture.donnees).slice(0, 200));
    }
  }

  // Aucun droit de DELETE, même pour service_role : un jeton consommé ne doit
  // pas pouvoir être supprimé puis réinséré pour être rejoué.
  const suppression = await appel(`/google_oauth_states?nonce_hash=eq.${immuable.hash}`, {
    method: "DELETE",
  });
  if (suppression.statut >= 400) {
    log.ok(`service_role ne peut pas supprimer un jeton (HTTP ${suppression.statut})`);
  } else {
    log.ko(`la suppression a été acceptée (HTTP ${suppression.statut})`);
  }

  // -------------------------------------------------------------------------
  log.titre("7. La purge reste appelable, et elle seule supprime");
  // -------------------------------------------------------------------------

  // Un jeton réellement ancien, sinon la purge n'aurait rien à retirer et le
  // test passerait sans rien prouver. La borne minimale est d'un jour, donc
  // la ligne est vieillie de trois.
  const ancien = createHash("sha256").update("jeton-ancien").digest("hex");
  await sql`
    insert into public.google_oauth_states
      (nonce_hash, purpose, user_id, organization_id, created_at, expires_at, consumed_at)
    values (${ancien}, 'calendar', ${UTILISATEUR}, ${ORG},
            pg_catalog.now() - pg_catalog.make_interval(days => 3),
            pg_catalog.now() - pg_catalog.make_interval(days => 3) + pg_catalog.make_interval(mins => 10),
            pg_catalog.now() - pg_catalog.make_interval(days => 3))
  `;

  const purge = await appel("/rpc/purge_google_oauth_states", {
    method: "POST",
    body: { p_keep_days: 1 },
  });
  if (purge.statut === 200 && purge.donnees === 1) {
    log.ok("la purge est appelable par service_role et a retiré le jeton ancien");
  } else {
    log.ko(`purge : statut ${purge.statut}, retour ${JSON.stringify(purge.donnees)}`);
  }

  const [{ reste }] = await sql`
    select count(*)::int as reste from public.google_oauth_states where nonce_hash = ${ancien}
  `;
  if (reste === 0) log.ok("le jeton ancien a bien disparu de la table");
  else log.ko("le jeton ancien est toujours là");

  // Et les jetons récents survivent : une purge trop large effacerait des
  // parcours d'autorisation en cours.
  const recent = await poser();
  await appel("/rpc/purge_google_oauth_states", { method: "POST", body: { p_keep_days: 1 } });
  const [{ garde }] = await sql`
    select count(*)::int as garde from public.google_oauth_states where nonce_hash = ${recent.hash}
  `;
  if (garde === 1) log.ok("un jeton récent n'est pas emporté par la purge");
  else log.ko("la purge a emporté un jeton récent");

  const purgeAnon = await appel("/rpc/purge_google_oauth_states", {
    method: "POST",
    role: null,
    body: { p_keep_days: 1 },
  });
  if (purgeAnon.statut >= 400) log.ok(`anon ne peut pas appeler la purge (HTTP ${purgeAnon.statut})`);
  else log.ko("anon a pu appeler la purge");

  serveur.kill("SIGTERM");
  await sql.end();
  process.exitCode = log.bilan() ? 0 : 1;
}
