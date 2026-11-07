/**
 * Procédure d'application distante. Ce fichier ne se connecte à rien.
 *
 * L'écriture n'est acceptée que si la référence du projet est exactement
 * celle de la recette, différente de celle de la production, et si la
 * confirmation explicite vaut « oui ». Sans confirmation, seule la lecture
 * du plan est possible.
 *
 *   node scripts/pg-test/procedure-recette.mjs --verifier-garde
 *   node scripts/pg-test/procedure-recette.mjs --plan
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FICHIERS_CATALOGUE_DEPENDANTS } from "./lib.mjs";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function verifierCible({
  hote = "",
  projectRef = "",
  refRecette = "",
  refProduction = "",
  confirmer = "",
  ecriture = false,
} = {}) {
  const refus = [];
  if (!projectRef || !refRecette) refus.push("référence de recette absente");
  if (projectRef && refRecette && projectRef !== refRecette) refus.push("project_ref différent de la recette attendue");
  if (refProduction && projectRef === refProduction) refus.push("project_ref de production");
  if (refProduction && hote.includes(refProduction)) refus.push("hôte de production");
  const hoteAttendu = refRecette ? `db.${refRecette}.supabase.co` : "";
  if (ecriture && hote !== hoteAttendu) refus.push("hôte différent de la recette");
  if (ecriture && confirmer !== "oui") refus.push("confirmation absente");
  if (hote.includes("supabase-prod") || hote.endsWith("supabase-prod.conf")) refus.push("fichier de production");
  return refus;
}

export function planMigrations() {
  const dossier = resolve(RACINE, "supabase/migrations");
  const fichiers = readdirSync(dossier).filter(nom => nom.endsWith(".sql")).sort();
  const plan = [];
  let preparation = false;
  for (const nom of fichiers) {
    if (!preparation && FICHIERS_CATALOGUE_DEPENDANTS.has(nom)) {
      const chemin = resolve(RACINE, "scripts/pg-test/catalogue-prerequis.sql");
      plan.push({
        ordre: plan.length + 1,
        nom: "catalogue-prerequis.sql",
        role: "preparation",
        empreinte: createHash("sha256").update(readFileSync(chemin)).digest("hex"),
      });
      preparation = true;
    }
    const contenu = readFileSync(resolve(dossier, nom));
    plan.push({
      ordre: plan.length + 1,
      nom,
      role: "migration",
      empreinte: createHash("sha256").update(contenu).digest("hex"),
    });
  }
  return plan;
}

/**
 * Application transactionnelle. Ce programme ne l'appelle pas.
 * Une erreur résiduelle, ou une simulation, annule toute la transaction.
 */
export async function appliquerOuAnnuler(sql, { ecriture, cible }) {
  const refus = verifierCible(cible);
  if (refus.length > 0) {
    throw new Error(`Cible refusée : ${refus.join(" ; ")}`);
  }
  const plan = planMigrations();
  let residuel = null;
  try {
    await sql.begin(async tx => {
      await tx.unsafe(`
        create table if not exists public.mkl_migration_journal (
          fichier text primary key,
          empreinte text not null,
          applique_le timestamptz not null default now()
        )
      `);
      const restants = [...plan];
      let avant = Infinity;
      while (restants.length > 0 && restants.length < avant) {
        avant = restants.length;
        const suivants = [];
        for (const etape of restants) {
          const deja = await tx.unsafe(
            "select empreinte from public.mkl_migration_journal where fichier = $1",
            [etape.nom]
          );
          if (deja.length > 0) {
            if (deja[0].empreinte !== etape.empreinte) {
              throw new Error(`Empreinte différente pour ${etape.nom}`);
            }
            continue;
          }
          try {
            await tx.savepoint(async point => {
              const chemin = etape.role === "preparation"
                ? resolve(RACINE, "scripts/pg-test/catalogue-prerequis.sql")
                : resolve(RACINE, "supabase/migrations", etape.nom);
              await point.unsafe(readFileSync(chemin, "utf8"));
              await point.unsafe(
                "insert into public.mkl_migration_journal (fichier, empreinte) values ($1, $2)",
                [etape.nom, etape.empreinte]
              );
            });
          } catch (error) {
            suivants.push(etape);
            residuel = error;
          }
        }
        restants.splice(0, restants.length, ...suivants);
      }
      if (restants.length > 0) {
        throw residuel || new Error(`${restants.length} étape(s) non appliquée(s)`);
      }
      if (!ecriture) throw new Error("SIMULATION");
    });
  } catch (error) {
    if (error.message === "SIMULATION") return;
    throw error;
  }
}

function verifierGarde() {
  const cas = [
    {
      titre: "écriture sans confirmation",
      cible: { hote: "db.recette.supabase.co", projectRef: "recette", refRecette: "recette", refProduction: "production", confirmer: "", ecriture: true },
      refuse: true,
    },
    {
      titre: "référence de production",
      cible: { hote: "db.production.supabase.co", projectRef: "production", refRecette: "recette", refProduction: "production", confirmer: "oui", ecriture: true },
      refuse: true,
    },
    {
      titre: "hôte qui ne correspond pas à la recette",
      cible: { hote: "db.autre.supabase.co", projectRef: "recette", refRecette: "recette", refProduction: "production", confirmer: "oui", ecriture: true },
      refuse: true,
    },
    {
      titre: "écriture confirmée sur la recette",
      cible: { hote: "db.recette.supabase.co", projectRef: "recette", refRecette: "recette", refProduction: "production", confirmer: "oui", ecriture: true },
      refuse: false,
    },
    {
      titre: "plan sans confirmation",
      cible: { hote: "", projectRef: "recette", refRecette: "recette", refProduction: "production", confirmer: "", ecriture: false },
      refuse: false,
    },
  ];
  let echecs = 0;
  for (const essai of cas) {
    const refus = verifierCible(essai.cible);
    const refuse = refus.length > 0;
    if (refuse === essai.refuse) console.log(`  ✓ ${essai.titre}`);
    else {
      echecs += 1;
      console.log(`  ✗ ${essai.titre} — ${refus.join(" ; ") || "accepté"}`);
    }
  }
  return echecs === 0;
}

const argument = process.argv[2] || "--plan";
if (argument === "--verifier-garde") {
  process.exit(verifierGarde() ? 0 : 1);
}
if (argument === "--plan") {
  const plan = planMigrations();
  const migrations = plan.filter(etape => etape.role === "migration");
  console.log(`${migrations.length} migrations, ${plan.length - migrations.length} préparation`);
  for (const etape of plan) {
    if (etape.role === "preparation" || FICHIERS_CATALOGUE_DEPENDANTS.has(etape.nom)) {
      console.log(`${String(etape.ordre).padStart(2, " ")}  ${etape.role.padEnd(12)}  ${etape.nom}  ${etape.empreinte.slice(0, 12)}`);
    }
  }
  process.exit(migrations.length === 67 ? 0 : 1);
}

console.error("Argument refusé. Utiliser --plan ou --verifier-garde. Aucune connexion n'est ouverte.");
process.exit(1);
