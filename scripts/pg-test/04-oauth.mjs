/**
 * Jetons OAuth à usage unique, éprouvés sur une base PostgreSQL réelle.
 *
 * La vulnérabilité corrigée : l'ancien paramètre `state` transportait
 * `userId` et `orgId` en base64 non signé. N'importe qui pouvait donc forger
 * un retour désignant un autre utilisateur et faire écrire ses propres jetons
 * Google sur la ligne de cette personne.
 *
 * L'usage unique doit tenir même si l'application se trompe. Ce script le
 * vérifie là où c'est décidé : dans la base.
 *
 *   bash scripts/pg-test/install.sh
 *   node scripts/pg-test/01-migrations.mjs
 *   node scripts/pg-test/04-oauth.mjs
 */

import { createHash, randomBytes } from "node:crypto";
import { ORG, attendre, chargerClient, connecter, journal } from "./lib.mjs";

const log = journal();
const sql = await connecter(process.env.PG_TEST_DB || "mkl_test");
const postgres = await chargerClient();

const UTILISATEUR = "55555555-5555-5555-5555-555555555555";
const AUTRE = "66666666-6666-6666-6666-666666666666";

function empreinte(jeton) {
  return createHash("sha256").update(jeton, "utf8").digest("hex");
}

async function poser({ user = UTILISATEUR, purpose = "calendar", minutes = 10 } = {}) {
  const jeton = randomBytes(32).toString("base64url");
  await sql`
    insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at)
    values (${empreinte(jeton)}, ${purpose}, ${user}, ${ORG}, '/', now() + make_interval(mins => ${minutes}))
  `;
  return { jeton, hash: empreinte(jeton) };
}

/** Reproduit exactement le filtre de consommation de l'application. */
async function consommer(hash, client = sql) {
  return client`
    update public.google_oauth_states
       set consumed_at = now()
     where nonce_hash = ${hash}
       and consumed_at is null
       and expires_at > now()
    returning user_id, organization_id, purpose, redirect_path
  `;
}

log.titre("Préparation");

await sql`delete from public.google_oauth_states`;
for (const id of [UTILISATEUR, AUTRE]) {
  await sql`
    insert into auth.users (id, email) values (${id}, ${`${id}@essai.test`})
    on conflict (id) do nothing
  `;
}
await sql`insert into public.organizations (id, name) values (${ORG}, 'MKL Essai') on conflict (id) do nothing`;
log.ok("deux comptes et une organisation d'essai");

// ---------------------------------------------------------------------------
log.titre("1. Forme du jeton");
// ---------------------------------------------------------------------------

try {
  await sql`
    insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, expires_at)
    values ('pas-une-empreinte', 'calendar', ${UTILISATEUR}, ${ORG}, now() + interval '10 min')
  `;
  log.ko("une empreinte malformée a été acceptée");
} catch (error) {
  if (error.code === "23514") log.ok("une empreinte malformée est refusée par la contrainte");
  else log.ko("erreur inattendue", `${error.code} ${error.message}`);
}

try {
  await sql`
    insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, expires_at)
    values (${empreinte("x")}, 'bitcoin', ${UTILISATEUR}, ${ORG}, now() + interval '10 min')
  `;
  log.ko("une finalité inconnue a été acceptée");
} catch (error) {
  if (error.code === "23514") log.ok("une finalité inconnue est refusée");
  else log.ko("erreur inattendue", `${error.code} ${error.message}`);
}

// Liste blanche des destinations de retour. Une redirection ouverte ferait du
// retour OAuth un tremplin vers un autre domaine, avec l'adresse du CRM dans
// la barre d'adresse au départ.
async function poserChemin(chemin) {
  await sql`
    insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at)
    values (
      ${empreinte(randomBytes(32).toString("base64url"))}, 'calendar', ${UTILISATEUR}, ${ORG},
      ${chemin}, now() + interval '10 min'
    )
  `;
}

for (const chemin of [
  "https://exemple.test/",
  // Lu comme une adresse absolue par un navigateur : c'est ce qui passait la
  // première version de la contrainte.
  "//exemple.test/",
  "http://exemple.test",
  "javascript:alert(1)",
  // Remontées de chemin : le point étant un caractère autorisé, elles
  // passaient la seconde version, par expression de forme.
  "/../admin",
  "/..",
  "/./",
  // Chemin interne vraisemblable mais hors liste : c'est tout l'intérêt
  // d'une énumération par rapport à une forme.
  "/agenda?vue=semaine",
  "/admin.html",
]) {
  try {
    await poserChemin(chemin);
    log.ko(`le chemin de retour « ${chemin} » a été accepté`);
  } catch (error) {
    if (error.code === "23514") log.ok(`le chemin de retour « ${chemin} » est refusé`);
    else log.ko("erreur inattendue", `${error.code} ${error.message}`);
  }
}

for (const chemin of ["/", null]) {
  try {
    await poserChemin(chemin);
    log.ok(`le chemin de retour ${chemin === null ? "absent" : `« ${chemin} »`} est accepté`);
  } catch (error) {
    log.ko(`le chemin ${String(chemin)} a été refusé`, `${error.code} ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
log.titre("2. Usage unique");
// ---------------------------------------------------------------------------

const premier = await poser();
const une = await consommer(premier.hash);
if (une.length === 1 && une[0].user_id === UTILISATEUR) {
  log.ok("un jeton valide se consomme une fois et rend son identité");
} else {
  log.ko("la première consommation a échoué");
}

const deux = await consommer(premier.hash);
if (deux.length === 0) log.ok("la seconde consommation ne rend rien, sans erreur");
else log.ko("le jeton a été consommé deux fois");

// Le déclencheur est le dernier rempart : même une écriture directe, en
// contournant le filtre, ne peut pas réarmer un jeton déjà utilisé.
try {
  await sql`update public.google_oauth_states set consumed_at = null where nonce_hash = ${premier.hash}`;
  log.ko("un jeton consommé a pu être réarmé");
} catch (error) {
  if (String(error.message).includes("OAUTH_STATE_CONSUMPTION_REQUIRED")
    || String(error.message).includes("OAUTH_STATE_ALREADY_CONSUMED")) {
    log.ok("le déclencheur refuse de réarmer un jeton consommé");
  } else {
    log.ko("erreur inattendue", error.message);
  }
}

try {
  await sql`
    update public.google_oauth_states set user_id = ${AUTRE}, consumed_at = now()
     where nonce_hash = ${premier.hash}
  `;
  log.ko("l'identité attachée à un jeton a pu être changée");
} catch (error) {
  if (String(error.message).includes("OAUTH_STATE_")) {
    log.ok("le déclencheur refuse de changer l'identité attachée au jeton");
  } else {
    log.ko("erreur inattendue", error.message);
  }
}

// ---------------------------------------------------------------------------
log.titre("2 bis. Immuabilité de chaque champ, destination de retour comprise");
// ---------------------------------------------------------------------------

/**
 * Chaque champ posé à la création est testé séparément, sur un jeton neuf et
 * jamais consommé. Grouper les essais ne dirait pas lequel est protégé.
 *
 * `consumed_at` est joint à chaque tentative, sinon c'est le contrôle
 * « consommation obligatoire » qui refuserait, et non celui de l'immuabilité :
 * la raison du refus serait la bonne, mais pas celle que l'on veut éprouver.
 */
async function immuable(libelle, modifier) {
  const jeton = await poser();
  try {
    await modifier(jeton.hash);
    log.ko(`${libelle} a pu être modifié après création`);
  } catch (error) {
    if (String(error.message).includes("OAUTH_STATE_IMMUTABLE")) {
      log.ok(`${libelle} ne peut pas être modifié`);
    } else {
      log.ko(`${libelle} : refus pour une autre raison`, error.message);
    }
  }
}

// Jeton posé sans chemin de retour, car `poser()` en met un : sans cela la
// « modification » écrirait la valeur déjà présente, ne serait pas une
// modification, et le test se croirait concluant à tort.
const sansChemin = { hash: empreinte(randomBytes(32).toString("base64url")) };
await sql`
  insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at)
  values (${sansChemin.hash}, 'calendar', ${UTILISATEUR}, ${ORG}, null, now() + interval '10 min')
`;
try {
  await sql`
    update public.google_oauth_states set redirect_path = '/', consumed_at = now()
     where nonce_hash = ${sansChemin.hash}
  `;
  log.ko("un chemin de retour a pu être ajouté après création");
} catch (error) {
  if (String(error.message).includes("OAUTH_STATE_IMMUTABLE")) {
    log.ok("un chemin de retour ne peut pas être ajouté après création");
  } else {
    log.ko("refus pour une autre raison", error.message);
  }
}

// Le cas que `<>` manquait : la comparaison donnait NULL, donc ni vrai ni
// faux, et la modification passait en silence.
const avecChemin = { hash: empreinte(randomBytes(32).toString("base64url")) };
await sql`
  insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, redirect_path, expires_at)
  values (${avecChemin.hash}, 'calendar', ${UTILISATEUR}, ${ORG}, '/', now() + interval '10 min')
`;
try {
  await sql`
    update public.google_oauth_states set redirect_path = null, consumed_at = now()
     where nonce_hash = ${avecChemin.hash}
  `;
  log.ko("le chemin de retour a pu être remis à NULL");
} catch (error) {
  if (String(error.message).includes("OAUTH_STATE_IMMUTABLE")) {
    log.ok("le chemin de retour ne peut pas être remis à NULL");
    log.info("c'est le cas qu'une comparaison par `<>` laissait passer :");
    log.info("`'/' <> null` vaut NULL, donc le test ne déclenchait rien.");
  } else {
    log.ko("refus pour une autre raison", error.message);
  }
}

await immuable("la finalité", hash =>
  sql`update public.google_oauth_states set purpose = 'google_ads', consumed_at = now() where nonce_hash = ${hash}`
);
await immuable("l'organisation", hash =>
  sql`update public.google_oauth_states set organization_id = ${"77777777-7777-7777-7777-777777777777"}, consumed_at = now() where nonce_hash = ${hash}`
);
await immuable("la date d'expiration", hash =>
  sql`update public.google_oauth_states set expires_at = now() + interval '10 years', consumed_at = now() where nonce_hash = ${hash}`
);
await immuable("l'empreinte du jeton", hash =>
  sql`update public.google_oauth_states set nonce_hash = ${empreinte("autre")}, consumed_at = now() where nonce_hash = ${hash}`
);

/**
 * La correction est-elle porteuse ?
 *
 * On replace temporairement l'ancienne comparaison par `<>` sur une fonction
 * de même forme, et on vérifie que le cas NULL passait bien. Sans cette
 * démonstration, rien ne distingue une correction utile d'une correction
 * décorative. La fonction d'essai est retirée ensuite.
 */
await sql.unsafe(`
  create or replace function public.essai_garde_ancienne()
  returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $corps$
  begin
    if new.redirect_path <> old.redirect_path then
      raise exception 'OAUTH_STATE_IMMUTABLE';
    end if;
    return new;
  end;
  $corps$;

  create temporary table essai_immuabilite (redirect_path text, marque text);
  create trigger essai_ancienne before update on essai_immuabilite
    for each row execute function public.essai_garde_ancienne();
  insert into essai_immuabilite values (null, 'depart');
`);

try {
  await sql.unsafe("update essai_immuabilite set redirect_path = '/' where marque = 'depart'");
  const [{ redirect_path: devenu }] = await sql`select redirect_path from essai_immuabilite`;
  if (devenu === "/") {
    log.ok("avec l'ancien `<>`, le passage de NULL à une valeur passait sans bruit");
  } else {
    log.ko("la démonstration de la régression n'a pas abouti");
  }
} catch (error) {
  log.ko("l'ancienne comparaison a refusé, la démonstration est à revoir", error.message);
}

await sql.unsafe(`
  drop table essai_immuabilite;
  drop function public.essai_garde_ancienne();
`);

// Et la seule modification permise reste permise.
const consommable = await poser();
try {
  const rows = await consommer(consommable.hash);
  if (rows.length === 1) log.ok("la consommation seule reste autorisée");
  else log.ko("la consommation ne passe plus");
} catch (error) {
  log.ko("la consommation ne passe plus", error.message);
}

// ---------------------------------------------------------------------------
log.titre("2 ter. Durcissement des deux fonctions");
// ---------------------------------------------------------------------------

const fonctions = await sql`
  select p.proname,
         p.prosecdef as definer,
         coalesce(p.proconfig, '{}'::text[]) as config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('google_oauth_states_guard', 'purge_google_oauth_states')
   order by 1
`;

for (const fonction of fonctions) {
  const durcie = fonction.config.includes("search_path=pg_catalog, public, pg_temp");
  if (durcie) log.ok(`${fonction.proname} : search_path durci`);
  else log.ko(`${fonction.proname} : search_path = ${fonction.config.join(",") || "aucun"}`);
}

const garde = fonctions.find(row => row.proname === "google_oauth_states_guard");
if (garde && !garde.definer) {
  log.ok("le déclencheur n'est plus SECURITY DEFINER, il ne touche aucune table");
} else {
  log.ko("le déclencheur est encore SECURITY DEFINER");
}

const purgeFn = fonctions.find(row => row.proname === "purge_google_oauth_states");
if (purgeFn?.definer) {
  log.ok("la purge reste SECURITY DEFINER, ce qui évite d'accorder DELETE");
} else {
  log.ko("la purge n'est plus SECURITY DEFINER : elle ne pourra plus supprimer");
}

// Le déclencheur doit encore se déclencher sans les droits du propriétaire.
// PostgreSQL ne vérifie EXECUTE qu'à la création, mais le droit est accordé
// explicitement pour ne pas dépendre de ce détail.
const droitGarde = await sql`
  select has_function_privilege('service_role', 'public.google_oauth_states_guard()', 'EXECUTE') as ok
`;
if (droitGarde[0].ok) log.ok("service_role peut exécuter le déclencheur");
else log.ko("service_role ne peut pas exécuter le déclencheur");

for (const role of ["anon", "authenticated"]) {
  const [{ ok }] = await sql`
    select has_function_privilege(${role}, 'public.google_oauth_states_guard()', 'EXECUTE') as ok
  `;
  if (!ok) log.ok(`${role} ne peut pas exécuter le déclencheur`);
  else log.ko(`${role} peut exécuter le déclencheur`);
}

// ---------------------------------------------------------------------------
log.titre("3. Expiration");
// ---------------------------------------------------------------------------

// `expires_at > created_at` étant garanti par contrainte, un jeton périmé
// s'obtient en posant les deux dates dans le passé, pas en inversant l'ordre.
const expire = { hash: empreinte(randomBytes(32).toString("base64url")) };
await sql`
  insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, created_at, expires_at)
  values (${expire.hash}, 'calendar', ${UTILISATEUR}, ${ORG}, now() - interval '20 min', now() - interval '10 min')
`;
const rienApres = await consommer(expire.hash);
if (rienApres.length === 0) log.ok("un jeton expiré ne se consomme pas");
else log.ko("un jeton expiré a été accepté");

try {
  await sql`
    insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, created_at, expires_at)
    values (${empreinte("passe")}, 'calendar', ${UTILISATEUR}, ${ORG}, now(), now() - interval '1 min')
  `;
  log.ko("un jeton expirant avant sa création a été accepté");
} catch (error) {
  if (error.code === "23514") log.ok("un jeton expirant avant sa création est refusé");
  else log.ko("erreur inattendue", `${error.code} ${error.message}`);
}

// ---------------------------------------------------------------------------
log.titre("4. Deux retours simultanés sur le même jeton");
// ---------------------------------------------------------------------------

const course = await poser();
const sqlA = postgres({ ...sql.options, max: 1, onnotice: () => {} });
const sqlB = postgres({ ...sql.options, max: 1, onnotice: () => {} });

let aPose = false;
let etatB = null;
let gagnantsA = 0;
let gagnantsB = 0;

const tA = sqlA.begin(async tx => {
  const rows = await consommer(course.hash, tx);
  gagnantsA = rows.length;
  aPose = true;
  // Transaction maintenue ouverte : B se heurte au verrou de ligne et attend,
  // comme deux retours de Google arrivant en même temps.
  await attendre(() => etatB === "en attente", { essais: 50, pause: 20 });
  await new Promise(resolve => setTimeout(resolve, 150));
});

await attendre(() => aPose);
etatB = "en attente";
const tB = (async () => {
  const rows = await consommer(course.hash, sqlB);
  gagnantsB = rows.length;
})();

await Promise.all([tA, tB]);

if (gagnantsA + gagnantsB === 1) {
  log.ok(`un seul des deux retours obtient le jeton (A ${gagnantsA}, B ${gagnantsB})`);
} else {
  log.ko(`${gagnantsA + gagnantsB} retours ont obtenu le jeton`);
}

await sqlA.end();
await sqlB.end();

// ---------------------------------------------------------------------------
log.titre("5. Un jeton ne vaut que pour son propriétaire");
// ---------------------------------------------------------------------------

const sien = await poser({ user: UTILISATEUR });
const rendu = await consommer(sien.hash);
if (rendu[0]?.user_id === UTILISATEUR && rendu[0]?.organization_id === ORG) {
  log.ok("la consommation rend l'identité posée au lancement, pas celle de l'appel");
} else {
  log.ko("l'identité rendue ne correspond pas au jeton");
}

// La finalité est portée par le jeton : un jeton de calendrier ne peut pas
// servir à ouvrir un accès publicitaire.
const publicitaire = await poser({ purpose: "google_ads" });
const [ligne] = await sql`
  select purpose from public.google_oauth_states where nonce_hash = ${publicitaire.hash}
`;
if (ligne.purpose === "google_ads") {
  log.ok("la finalité est stockée avec le jeton, l'appel ne peut pas la choisir");
} else {
  log.ko("la finalité n'est pas liée au jeton");
}

// ---------------------------------------------------------------------------
log.titre("6. Purge");
// ---------------------------------------------------------------------------

// Le vieillissement se fait à l'insertion : le déclencheur d'immuabilité
// refuse, à juste titre, qu'un UPDATE change la date de création d'un jeton.
for (let i = 0; i < 3; i += 1) {
  await sql`
    insert into public.google_oauth_states (nonce_hash, purpose, user_id, organization_id, created_at, expires_at)
    values (
      ${empreinte(randomBytes(32).toString("base64url"))}, 'calendar', ${UTILISATEUR}, ${ORG},
      now() - interval '30 days', now() - interval '30 days' + interval '10 min'
    )
  `;
}
const [{ supprimes }] = await sql`select public.purge_google_oauth_states(7) as supprimes`;
if (Number(supprimes) > 0) log.ok(`la purge retire ${supprimes} jeton(s) anciens`);
else log.ko("la purge n'a rien retiré");

const recent = await poser();
const [{ epargnes }] = await sql`select public.purge_google_oauth_states(7) as epargnes`;
const [{ count: restants }] = await sql`
  select count(*)::int as count from public.google_oauth_states where nonce_hash = ${recent.hash}
`;
if (Number(epargnes) === 0 && restants === 1) log.ok("un jeton récent n'est pas purgé");
else log.ko("la purge a retiré un jeton récent");

// Aucun droit de suppression directe : un jeton consommé pourrait sinon être
// supprimé puis réinséré pour être rejoué.
const droits = await sql`
  select privilege_type from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'google_oauth_states' and grantee = 'service_role'
   order by 1
`;
const liste = droits.map(row => row.privilege_type);
if (!liste.includes("DELETE")) log.ok(`service_role n'a pas le droit DELETE (${liste.join(", ")})`);
else log.ko(`service_role a le droit DELETE (${liste.join(", ")})`);

// ---------------------------------------------------------------------------
log.titre("7. Inventaire de structure");
// ---------------------------------------------------------------------------

const index = await sql`
  select indexname from pg_indexes
   where schemaname = 'public' and tablename = 'google_oauth_states'
   order by 1
`;
if (index.length === 3) log.ok(`trois index, clé primaire comprise : ${index.map(r => r.indexname).join(", ")}`);
else log.ko(`${index.length} index au lieu de 3`, index.map(r => r.indexname).join(", "));

const contraintes = await sql`
  select contype, count(*)::int as nombre from pg_constraint
   where conrelid = 'public.google_oauth_states'::regclass
   group by 1 order by 1
`;
const parType = Object.fromEntries(contraintes.map(row => [row.contype, row.nombre]));
for (const [type, attendu, libelle] of [
  ["c", 4, "contraintes CHECK"],
  ["p", 1, "clé primaire"],
  ["f", 1, "clé étrangère"],
]) {
  if ((parType[type] || 0) === attendu) log.ok(`${attendu} ${libelle}`);
  else log.ko(`${parType[type] || 0} ${libelle} au lieu de ${attendu}`);
}

const declencheurs = await sql`
  select tgname, tgenabled from pg_trigger
   where tgrelid = 'public.google_oauth_states'::regclass and not tgisinternal
`;
if (declencheurs.length === 1 && declencheurs[0].tgenabled === "O") {
  log.ok(`déclencheur actif : ${declencheurs[0].tgname}`);
} else {
  log.ko(`${declencheurs.length} déclencheur(s), état ${declencheurs[0]?.tgenabled || "?"}`);
}

const rls = await sql`
  select relrowsecurity as active,
         (select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'google_oauth_states') as politiques
    from pg_class where oid = 'public.google_oauth_states'::regclass
`;
if (rls[0].active && rls[0].politiques === 0) {
  log.ok("RLS active, aucune politique : la table n'est atteignable que par le serveur");
} else {
  log.ko(`RLS ${rls[0].active ? "active" : "inactive"}, ${rls[0].politiques} politique(s)`);
}

// Aucun accès pour les rôles du navigateur, ni sur la table ni par RLS.
for (const role of ["anon", "authenticated"]) {
  const droits = await sql`
    select coalesce(string_agg(privilege_type, ', ' order by privilege_type), 'aucun') as liste
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'google_oauth_states' and grantee = ${role}
  `;
  if (droits[0].liste === "aucun") log.ok(`${role} n'a aucun droit sur la table`);
  else log.ko(`${role} a des droits : ${droits[0].liste}`);
}

// ---------------------------------------------------------------------------
log.titre("8. Retour arrière");
// ---------------------------------------------------------------------------

try {
  await sql.begin(async tx => {
    await tx.unsafe("drop table public.google_oauth_states cascade");
    const [{ count }] = await tx`
      select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_name = 'google_oauth_states'
    `;
    if (count !== 0) throw new Error("table encore visible");
    throw new Error("ANNULATION_VOULUE");
  });
} catch (error) {
  if (!String(error.message).includes("ANNULATION_VOULUE")) {
    log.ko("la transaction d'essai a échoué pour une autre raison", error.message);
  }
}

const [{ count: toujoursLa }] = await sql`
  select count(*)::int as count from information_schema.tables
   where table_schema = 'public' and table_name = 'google_oauth_states'
`;
if (toujoursLa === 1) {
  log.ok("la suppression de la table est annulable : le retour arrière est complet");
} else {
  log.ko("la table a disparu malgré l'annulation");
}

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
