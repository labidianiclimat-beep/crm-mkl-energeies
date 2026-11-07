import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Accès à une base PostgreSQL de test.
 *
 * La machine de développement n'a ni Docker, ni Homebrew, ni PostgreSQL, ni
 * npm. Les binaires sont donc récupérés depuis le registre npm, qui est
 * joignable, et le client est `postgres`, choisi parce qu'il n'a aucune
 * dépendance et peut être extrait à la main.
 *
 * `scripts/pg-test/install.sh` fait l'installation. Ce module ne fait que s'y
 * connecter, et dit clairement quoi faire si la base n'est pas là.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE = resolve(ICI, "../..");
export const PG_HOME = process.env.PG_TEST_HOME || "/tmp/pgtest";

export const CONNEXION = {
  host: process.env.PG_TEST_HOST || "127.0.0.1",
  port: Number(process.env.PG_TEST_PORT || 55432),
  user: process.env.PG_TEST_USER || "postgres",
  password: process.env.PG_TEST_PASSWORD || "postgres",
};

/**
 * Charge le client. Volontairement hors de `node_modules` du projet : le CRM
 * n'a pas besoin de cette dépendance pour fonctionner, et l'ajouter au projet
 * imposerait un paquet de plus en production pour un outil d'essai.
 */
export async function chargerClient() {
  // Importé par chemin absolu : la carte `exports` du paquet n'autorise que le
  // point d'entrée « . », donc une résolution par nom de sous-chemin échoue.
  const entree = resolve(PG_HOME, "node_modules/postgres/src/index.js");
  try {
    const module = await import(pathToFileURL(entree).href);
    return module.default;
  } catch (error) {
    throw new Error(
      `Client PostgreSQL introuvable (${entree}) : ${error.message}\n` +
        `Lancez d'abord : bash scripts/pg-test/install.sh`
    );
  }
}

/** Ouvre une connexion sur une base, en échouant avec un message utile. */
export async function connecter(database = "postgres") {
  const postgres = await chargerClient();
  const sql = postgres({ ...CONNEXION, database, onnotice: () => {} });
  try {
    await sql`select 1`;
  } catch (error) {
    await sql.end().catch(() => {});
    throw new Error(
      `Base de test injoignable sur ${CONNEXION.host}:${CONNEXION.port} (${error.message}).\n` +
        `Lancez : bash scripts/pg-test/install.sh`
    );
  }
  return sql;
}

/**
 * Migrations de catalogue qui lisent des lignes déjà présentes.
 * La préparation versionnée est jouée juste avant la première d'entre elles.
 */
export const FICHIERS_CATALOGUE_DEPENDANTS = new Set([
  "20261015_aquarea_m.sql",
  "20261015_aquarea_m_brochure_5.sql",
  "20261015_zubadan_23.sql",
]);

/** Refuse toute cible autre que le PostgreSQL local de test, avant toute suppression. */
export function refuserHoteDistant() {
  if (CONNEXION.host !== "127.0.0.1" || Number(CONNEXION.port) !== 55432) {
    throw new Error(
      `Cible refusée : ${CONNEXION.host}:${CONNEXION.port}. Seul 127.0.0.1:55432 est autorisé.`
    );
  }
}

/** Recrée une base vide. Jamais de réutilisation : un essai part d'un état connu. */
export async function recreerBase(nom) {
  refuserHoteDistant();
  if (!/^[a-z][a-z0-9_]*$/.test(nom)) {
    throw new Error(`Nom de base refusé : ${nom}`);
  }
  const admin = await connecter("postgres");
  try {
    const ident = await admin`
      select host(inet_server_addr()) as addr, inet_server_port() as port, current_database() as db
    `;
    if (ident[0].addr !== "127.0.0.1" || Number(ident[0].port) !== 55432 || ident[0].db !== "postgres") {
      throw new Error(`Serveur refusé : ${ident[0].addr}:${ident[0].port}/${ident[0].db}`);
    }
    await admin.unsafe(`drop database if exists "${nom}" with (force)`);
    await admin.unsafe(`create database "${nom}"`);
  } finally {
    await admin.end();
  }
  const sql = await connecter(nom);
  const verif = await sql`
    select current_database() as db, host(inet_server_addr()) as addr, inet_server_port() as port
  `;
  if (verif[0].db !== nom || verif[0].addr !== "127.0.0.1" || Number(verif[0].port) !== 55432) {
    await sql.end();
    throw new Error(`Base ouverte refusée : ${verif[0].addr}:${verif[0].port}/${verif[0].db}`);
  }
  return sql;
}

export function migrations() {
  const dossier = resolve(RACINE, "supabase/migrations");
  return readdirSync(dossier)
    .filter(nom => nom.endsWith(".sql"))
    .sort()
    .map(nom => ({ nom, sql: readFileSync(resolve(dossier, nom), "utf8") }));
}

export function fichierSql(chemin) {
  return readFileSync(resolve(RACINE, chemin), "utf8");
}

/**
 * Base neuve, coquille Supabase posée, puis migrations appliquées.
 *
 * L'ordre alphabétique des noms de fichiers n'est pas l'ordre des dépendances :
 * `20260316_service_role_grants` précède `20260317_clients`, qu'il référence.
 * Plusieurs passes résolvent cela sans qu'il faille coder un graphe, chaque
 * passe reprenant ce que la précédente n'a pas pu appliquer. On s'arrête dès
 * qu'une passe ne progresse plus.
 *
 * Chaque suite appelle cette fonction plutôt que de réutiliser la base d'une
 * autre : les essais de retour arrière suppriment délibérément des index, donc
 * une base héritée n'est pas dans un état connu.
 */
/**
 * Joue une liste de migrations, plusieurs passes, chaque fichier dans sa transaction.
 * La préparation de catalogue est insérée une fois, avant les trois fichiers qui
 * lisent la fourniture air/eau et la marque Mitsubishi.
 */
export async function appliquerMigrations(sql, liste) {
  let preparation = false;
  const passes = [];
  const messages = new Map();
  let restants = liste;
  let avant = Infinity;
  while (restants.length > 0 && restants.length < avant) {
    avant = restants.length;
    const suivants = [];
    const reussis = [];
    for (const migration of restants) {
      if (!preparation && FICHIERS_CATALOGUE_DEPENDANTS.has(migration.nom)) {
        await sql.begin(tx => tx.unsafe(fichierSql("scripts/pg-test/catalogue-prerequis.sql")));
        preparation = true;
      }
      try {
        await sql.begin(tx => tx.unsafe(migration.sql));
        reussis.push(migration.nom);
      } catch (error) {
        messages.set(migration.nom, String(error.message || error).split("\n")[0]);
        suivants.push(migration);
      }
    }
    passes.push({
      reussis,
      echecs: suivants.map(item => ({ nom: item.nom, message: messages.get(item.nom) })),
    });
    restants = suivants;
  }
  return {
    preparation,
    passes,
    restants: restants.map(item => ({ nom: item.nom, motif: messages.get(item.nom) })),
  };
}

export async function preparerBase(nom, { sauf = [] } = {}) {
  const sql = await recreerBase(nom);
  await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));
  const liste = migrations().filter(item => !sauf.includes(item.nom));
  const resultat = await appliquerMigrations(sql, liste);
  return { sql, ...resultat };
}

export const ORG = "00000000-0000-0000-0000-000000000001";

/** Trace d'exécution lisible, pour que le rapport ne soit pas à reconstituer. */
export function journal() {
  const lignes = [];
  return {
    ok(texte) {
      lignes.push({ ok: true, texte });
      console.log(`  ✓ ${texte}`);
    },
    ko(texte, detail = "") {
      lignes.push({ ok: false, texte, detail });
      console.log(`  ✗ ${texte}${detail ? `\n      ${detail}` : ""}`);
    },
    info(texte) {
      console.log(`    ${texte}`);
    },
    titre(texte) {
      console.log(`\n${texte}\n${"─".repeat(texte.length)}`);
    },
    get echecs() {
      return lignes.filter(ligne => !ligne.ok);
    },
    get total() {
      return lignes.length;
    },
    bilan() {
      const echecs = this.echecs;
      console.log(
        `\n${lignes.length - echecs.length}/${lignes.length} vérifications réussies` +
          (echecs.length ? ` — ${echecs.length} échec(s)` : "")
      );
      return echecs.length === 0;
    },
  };
}

/**
 * Attend qu'une condition soit vraie, en laissant la main entre deux essais.
 *
 * Sert aux essais de concurrence : deux transactions doivent réellement se
 * croiser, pas se suivre.
 */
export async function attendre(condition, { essais = 200, pause = 10 } = {}) {
  for (let i = 0; i < essais; i += 1) {
    if (await condition()) return true;
    await new Promise(resolve => setTimeout(resolve, pause));
  }
  return false;
}
