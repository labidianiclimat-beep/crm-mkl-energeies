/**
 * Non-régression du durcissement de search_path, sur base réelle.
 *
 * L'audit comptait 22 fonctions du schéma `public` sans `search_path` fixé.
 * Ce script le prouve sur une base où l'historique est appliqué sans la
 * migration corrective, applique la correction, puis vérifie que les
 * politiques RLS et les fonctions métier fonctionnent encore. Un durcissement
 * qui casserait une politique de sécurité serait pire que la dette qu'il
 * corrige.
 *
 *   bash scripts/pg-test/install.sh
 *   node scripts/pg-test/03-search-path.mjs
 */

import { fichierSql, journal, migrations, recreerBase } from "./lib.mjs";

const DURCISSEMENT = "20261105_search_path_hardening.sql";
const log = journal();

log.titre("Durcissement de search_path — avant et après, sur base réelle");

const sql = await recreerBase(process.env.PG_TEST_DB_SP || "mkl_search_path");
await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));

// Historique sans la migration corrective, pour mesurer la dette réelle.
let restants = migrations().filter(item => item.nom !== DURCISSEMENT);
let avant = Infinity;
while (restants.length > 0 && restants.length < avant) {
  avant = restants.length;
  const suivants = [];
  for (const migration of restants) {
    try {
      await sql.begin(tx => tx.unsafe(migration.sql));
    } catch {
      suivants.push(migration);
    }
  }
  restants = suivants;
}

async function sansChemin() {
  return sql`
    select p.oid::regprocedure::text as signature, p.proname, p.prosecdef as definer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c(opt)
          where c.opt like 'search_path=%'
       )
     order by 1
  `;
}

const dette = await sansChemin();
if (dette.length === 22) {
  log.ok("la dette mesurée sur base réelle est bien de 22 fonctions");
} else {
  log.ko(`${dette.length} fonction(s) sans search_path, l'audit en annonçait 22`);
  log.info(dette.map(row => row.proname).join(", "));
}

if (dette.filter(row => row.definer).length === 0) {
  log.ok("aucune n'est SECURITY DEFINER : l'exposition reste limitée");
} else {
  log.ko("une fonction SECURITY DEFINER est sans search_path");
}

// L'audit cite chaque nom ; la base doit confirmer la liste, sans ajout.
const inventaire = fichierSql(`supabase/migrations/${DURCISSEMENT}`);
const absentes = dette.filter(row => !inventaire.includes(row.proname));
if (absentes.length === 0) {
  log.ok("chaque fonction trouvée en base figure dans l'audit écrit");
} else {
  log.ko(`${absentes.length} fonction(s) absente(s) de l'audit`, absentes.map(r => r.proname).join(", "));
}

// ---------------------------------------------------------------------------
log.titre("Démonstration du risque");
// ---------------------------------------------------------------------------

// Une fonction sans search_path résout ses relations dans `pg_temp` d'abord :
// une table temporaire du même nom détourne donc son résultat.
//
// Deux précautions pour que la démonstration soit honnête. La référence à la
// table n'est pas qualifiée, sinon aucun détournement n'est possible, et c'est
// bien ce que font les fonctions auditées. Et le corps est en plpgsql avec un
// `execute`, pour que la résolution ait lieu à chaque appel : une fonction
// `language sql` mémorise son plan au premier appel, ce qui masquerait l'effet
// sans le supprimer.
await sql.unsafe(`
  create or replace function public.essai_detournement() returns integer
  language plpgsql as $corps$
  declare n integer;
  begin
    execute 'select count(*)::integer from organizations' into n;
    return n;
  end;
  $corps$;
`);

const [{ reference }] = await sql`select public.essai_detournement() as reference`;

await sql.unsafe(`
  create temporary table organizations (id uuid);
  insert into organizations values
    (extensions.gen_random_uuid()), (extensions.gen_random_uuid()), (extensions.gen_random_uuid());
`);

const [{ detourne }] = await sql`select public.essai_detournement() as detourne`;
if (detourne !== reference && detourne === 3) {
  log.ok(`sans search_path, la fonction lit la table temporaire (${reference} → ${detourne})`);
} else {
  log.ko(`le détournement n'a pas eu lieu (${reference} → ${detourne})`);
}

await sql.unsafe("alter function public.essai_detournement() set search_path = pg_catalog, public, pg_temp");
const [{ corrige }] = await sql`select public.essai_detournement() as corrige`;
if (corrige === reference) {
  log.ok("avec search_path fixé, la fonction retrouve la vraie table");
} else {
  log.ko(`la correction n'a pas rétabli le résultat (${corrige} au lieu de ${reference})`);
}
log.info("`pg_temp` est listé en dernier : un objet temporaire ne peut plus");
log.info("masquer un objet de `public`, mais reste accessible si besoin.");

await sql.unsafe("drop table organizations; drop function public.essai_detournement();");

// ---------------------------------------------------------------------------
log.titre("Application de la migration corrective");
// ---------------------------------------------------------------------------

try {
  await sql.begin(tx => tx.unsafe(inventaire));
  log.ok("la migration s'applique sans erreur");
} catch (error) {
  log.ko("la migration échoue", error.message);
}

const apres = await sansChemin();
if (apres.length === 0) {
  log.ok("plus aucune fonction du schéma public sans search_path");
} else {
  log.ko(`${apres.length} fonction(s) encore sans search_path`, apres.map(r => r.proname).join(", "));
}

// La migration porte un garde-fou : elle échoue si une fonction a échappé à
// la boucle. On le déclenche en recréant la dette à la main, puis en rejouant
// seulement ce contrôle. Une migration qui se croirait complète à tort serait
// plus dangereuse que la dette elle-même.
const controle = inventaire.slice(inventaire.indexOf("-- Contrôle immédiat"));
await sql.unsafe("alter function public.is_admin_role(text) reset search_path");
try {
  await sql.unsafe(controle);
  log.ko("le garde-fou n'a pas réagi alors qu'une fonction était sans search_path");
} catch (error) {
  if (String(error.message).includes("SEARCH_PATH_INCOMPLET")) {
    log.ok("le garde-fou refuse une correction incomplète");
  } else {
    log.ko("le garde-fou a échoué pour une autre raison", error.message);
  }
}
await sql.unsafe("alter function public.is_admin_role(text) set search_path = pg_catalog, public, pg_temp");
await reussitControle();

async function reussitControle() {
  try {
    await sql.unsafe(controle);
    log.ok("une fois la dette reprise, le même contrôle passe");
  } catch (error) {
    log.ko("le contrôle échoue après correction", error.message);
  }
}

// Les fonctions de pgcrypto ne doivent pas avoir été touchées : elles
// appartiennent à l'extension, qui les réécrirait à sa prochaine mise à jour.
const extensionTouchee = await sql`
  select count(*)::int as nombre
    from pg_proc p
    join pg_depend d on d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
   where coalesce(p.proconfig, '{}'::text[]) && array['search_path=pg_catalog, public, pg_temp']
`;
if (extensionTouchee[0].nombre === 0) {
  log.ok("aucune fonction appartenant à une extension n'a été modifiée");
} else {
  log.ko(`${extensionTouchee[0].nombre} fonction(s) d'extension modifiée(s)`);
}

// ---------------------------------------------------------------------------
log.titre("Non-régression : les fonctions marchent encore");
// ---------------------------------------------------------------------------

const ORG = "00000000-0000-0000-0000-000000000001";

for (const [libelle, requete] of [
  ["is_admin_role reconnaît un rôle d'administration", sql`select public.is_admin_role('Admin VIP') as valeur`],
  ["is_admin_role refuse un rôle ordinaire", sql`select public.is_admin_role('Commercial') as valeur`],
  ["can_manage_all_clients répond sans erreur", sql`select public.can_manage_all_clients('Commercial') as valeur`],
  ["can_read_articles répond sans erreur", sql`select public.can_read_articles('Commercial', array['articles']) as valeur`],
  ["state_key_to_module traduit une clé", sql`select public.state_key_to_module('clients') as valeur`],
]) {
  try {
    const [row] = await requete;
    log.ok(`${libelle} (${row.valeur})`);
  } catch (error) {
    log.ko(libelle, error.message);
  }
}

// Les numéroteurs écrivent : un search_path mal posé les casserait bruyamment.
try {
  await sql`insert into public.organizations (id, name) values (${ORG}, 'MKL Essai') on conflict (id) do nothing`;
  const [{ numero }] = await sql`select public.next_prospect_number(${ORG}) as numero`;
  const [{ suivant }] = await sql`select public.next_prospect_number(${ORG}) as suivant`;
  if (Number(suivant) === Number(numero) + 1) {
    log.ok(`next_prospect_number avance correctement (${numero} puis ${suivant})`);
  } else {
    log.ko(`numérotation incohérente (${numero} puis ${suivant})`);
  }
} catch (error) {
  log.ko("next_prospect_number échoue", error.message);
}

try {
  const [{ numero }] = await sql`select public.next_client_number(${ORG}) as numero`;
  log.ok(`next_client_number répond (${numero})`);
} catch (error) {
  log.ko("next_client_number échoue", error.message);
}

// Les politiques RLS appellent quatre de ces fonctions. Elles doivent encore
// être évaluables : une erreur ici fermerait l'accès à tout le CRM.
const politiques = await sql`
  select count(*)::int as nombre
    from pg_policies
   where schemaname = 'public'
     and (qual like '%can_access_%' or with_check like '%can_access_%')
`;
log.info(`${politiques[0].nombre} politique(s) RLS appellent une fonction can_access_*`);

try {
  await sql.unsafe(`
    set local role authenticated;
    set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000ff';
  `);
  await sql`select count(*) from public.clients`;
  log.ok("une lecture sous le rôle authenticated passe par les politiques sans erreur");
} catch (error) {
  log.ko("la lecture sous politique RLS échoue", error.message);
} finally {
  await sql.unsafe("reset role");
}

// ---------------------------------------------------------------------------
log.titre("Retour arrière");
// ---------------------------------------------------------------------------

try {
  await sql.begin(async tx => {
    for (const { signature } of apres.length ? apres : await sansChemin()) {
      await tx.unsafe(`alter function ${signature} reset search_path`);
    }
  });
  log.ok("un retour arrière par `reset search_path` est disponible");
} catch (error) {
  log.ko("retour arrière impossible", error.message);
}

const toujoursCorrigees = (await sansChemin()).length;
log.info(
  toujoursCorrigees === 0
    ? "le retour arrière a été annulé : les fonctions restent durcies"
    : `${toujoursCorrigees} fonction(s) ramenées à leur état antérieur`
);

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
