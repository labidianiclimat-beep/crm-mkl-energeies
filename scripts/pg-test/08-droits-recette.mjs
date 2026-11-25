/**
 * Droits tels que la recette les verra : exposition automatique coupée.
 *
 * Le shim local accorde tout à anon, authenticated et service_role. Ce script
 * retire ces droits, rejoue seulement les GRANT et REVOKE des migrations, puis
 * annule la transaction. La base mkl_test reste dans l'état laissé par le harnais.
 *
 *   node scripts/pg-test/08-droits-recette.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connecter, journal, refuserHoteDistant } from "./lib.mjs";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.PG_TEST_DB || "mkl_test";
const log = journal();

if (BASE !== "mkl_test") {
  console.error(`Cible refusée : base « ${BASE} ».`);
  process.exit(1);
}

refuserHoteDistant();

function sansCommentaires(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map(ligne => ligne.replace(/--.*$/, ""))
    .join("\n");
}

function enoncesStatiques(sql) {
  const sansBlocs = sansCommentaires(sql).replace(/\bdo\s+\$\$[\s\S]*?\$\$\s*;/gi, " ");
  return sansBlocs
    .split(";")
    .map(texte => texte.trim())
    .filter(texte => /^(grant|revoke)\b/i.test(texte));
}

function enoncesBoucles(sql) {
  const source = sansCommentaires(sql);
  const enonces = [];
  const boucles = source.matchAll(/foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop/gi);
  for (const boucle of boucles) {
    const tables = [...boucle[1].matchAll(/'([a-z0-9_]+)'/gi)].map(item => item[1]);
    const corps = boucle[2];
    for (const table of tables) {
      if (/grant all on table/i.test(corps) && /service_role/i.test(corps)) {
        enonces.push(`grant all on table public.${table} to service_role`);
      }
      if (/select, insert, update, delete/i.test(corps) && /authenticated/i.test(corps)) {
        enonces.push(`grant select, insert, update, delete on table public.${table} to authenticated`);
      }
    }
  }
  return enonces;
}

function enoncesFichier(nom) {
  const sql = readFileSync(resolve(RACINE, "supabase/migrations", nom), "utf8");
  const source = sansCommentaires(sql);
  const enonces = [];
  const morceaux = source.split(/(\bdo\s+\$\$[\s\S]*?\$\$\s*;)/gi);
  for (const morceau of morceaux) {
    if (/^\s*do\s+\$\$/i.test(morceau)) enonces.push(...enoncesBoucles(morceau));
    else enonces.push(...enoncesStatiques(morceau));
  }
  return enonces;
}

const fichiers = readdirSync(resolve(RACINE, "supabase/migrations")).filter(nom => nom.endsWith(".sql")).sort();
const enonces = fichiers.flatMap(enoncesFichier);

log.titre("Simulation des droits de la recette");
log.info(`${enonces.length} instruction(s) GRANT ou REVOKE extraites des migrations`);

const sql = await connecter(BASE);
const ident = await sql`
  select current_database() as db, host(inet_server_addr()) as addr, inet_server_port() as port
`;
if (ident[0].db !== "mkl_test" || ident[0].addr !== "127.0.0.1" || Number(ident[0].port) !== 55432) {
  log.ko("cible refusée", `${ident[0].addr}:${ident[0].port}/${ident[0].db}`);
  await sql.end();
  process.exit(1);
}

const sensibles = [
  "web_lead_submissions",
  "web_lead_events",
  "lead_attribution",
  "lead_origin_history",
  "google_oauth_states",
  "internal_requests",
  "sav_cases",
  "installation_finances",
  "organizations",
  "client_counters",
  "prospect_counters",
];
const fonctionsCrm = [
  "next_client_number",
  "next_prospect_number",
  "next_devis_number",
  "next_sav_number",
  "enqueue_web_lead",
  "reserve_web_leads",
  "settle_web_lead",
];

try {
  await sql.begin(async tx => {
    await tx.unsafe(`
      revoke all on all tables in schema public from anon, authenticated, service_role;
      revoke all on all sequences in schema public from anon, authenticated, service_role;
      revoke all on all functions in schema public from public, anon, authenticated, service_role;
    `);
    const ignorees = [];
    for (const enonce of enonces) {
      try {
        await tx.savepoint(async point => {
          await point.unsafe(enonce);
        });
      } catch (error) {
        const message = String(error.message || error).split("\n")[0];
        if (!/does not exist/i.test(message)) throw error;
        ignorees.push({ enonce, message });
      }
    }
    log.info(`${ignorees.length} instruction(s) historique(s) sans objet dans le schéma final`);
    for (const item of ignorees) log.info(`  ${item.message}`);

    const anonTables = await tx`
      select count(distinct table_name)::int as n
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'anon'
    `;
    if (anonTables[0].n === 0) log.ok("anon n'a aucun droit de table");
    else log.ko(`anon a des droits sur ${anonTables[0].n} table(s)`);

    const anonFonctions = await tx`
      select count(*)::int as n
        from information_schema.routine_privileges
       where specific_schema = 'public' and grantee = 'anon'
    `;
    if (anonFonctions[0].n === 0) log.ok("anon ne peut exécuter aucune fonction");
    else log.ko(`anon peut exécuter ${anonFonctions[0].n} fonction(s)`);

    const anonSequences = await tx`
      select count(*)::int as n
        from information_schema.usage_privileges
       where object_schema = 'public' and object_type = 'SEQUENCE' and grantee = 'anon'
    `;
    if (anonSequences[0].n === 0) log.ok("anon n'a aucun droit sur les séquences");
    else log.ko(`anon a des droits sur ${anonSequences[0].n} séquence(s)`);

    for (const table of sensibles) {
      const droit = await tx`
        select has_table_privilege('authenticated', ${"public." + table}, 'SELECT') as lecture
      `;
      if (!droit[0].lecture) log.ok(`authenticated ne lit pas ${table}`);
      else log.ko(`authenticated lit ${table}`);
    }

    const authTables = await tx`
      select privilege_type, count(distinct table_name)::int as n
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated'
       group by privilege_type
       order by privilege_type
    `;
    log.info(
      "authenticated : " +
        (authTables.length
          ? authTables.map(row => `${row.privilege_type} sur ${row.n} tables`).join(", ")
          : "aucun droit de table")
    );

    const serviceManque = await tx`
      select c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and not has_table_privilege('service_role', c.oid, 'SELECT')
       order by 1
    `;
    log.info(`${serviceManque.length} table(s) sans SELECT pour service_role`);
    for (const row of serviceManque) log.info(`  ${row.table_name}`);

    for (const nom of fonctionsCrm) {
      const droit = await tx`
        select has_function_privilege(
          'service_role',
          p.oid,
          'EXECUTE'
        ) as execution
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = ${nom}
         limit 1
      `;
      if (droit[0]?.execution) log.ok(`service_role exécute ${nom}`);
      else log.ko(`service_role n'exécute pas ${nom}`);
    }

    const sequences = await tx`
      select c.relname as nom,
             has_sequence_privilege('service_role', c.oid, 'USAGE') as usage
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'S'
       order by 1
    `;
    const sansUsage = sequences.filter(row => !row.usage);
    log.info(`${sequences.length} séquence(s), ${sansUsage.length} sans USAGE pour service_role`);
    for (const row of sansUsage) log.info(`  ${row.nom}`);

    throw new Error("ANNULATION_VOULUE");
  });
} catch (error) {
  if (error.message !== "ANNULATION_VOULUE") {
    log.ko("simulation interrompue", error.message.split("\n")[0]);
  } else {
    log.ok("transaction annulée, mkl_test inchangée");
  }
}

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
