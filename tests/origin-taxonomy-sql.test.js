/**
 * Alignement entre la taxonomie JavaScript et les contraintes SQL.
 *
 * Le cloisonnement des origines est écrit deux fois : dans
 * app/lib/origin-taxonomy.js pour l'application, et dans les fonctions
 * `origin_pair_is_valid` / `origin_subtype_is_valid` pour la base. Cette
 * duplication est voulue — `service_role` contourne RLS, donc la base doit se
 * défendre seule — mais elle dérive silencieusement. Ces tests la surveillent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORIGIN_CATEGORIES,
  ORIGIN_CHANNELS,
  categoriesForChannel,
  mirrorSourceLabel,
  subtypesForCategory,
} from "../app/lib/origin-taxonomy.js";

const ATTRIBUTION_SQL = readFileSync(new URL("../supabase/migrations/20261102_lead_attribution.sql", import.meta.url), "utf8");
const OAUTH_SQL = readFileSync(new URL("../supabase/migrations/20261102_google_oauth_states.sql", import.meta.url), "utf8");
const INGEST_SQL = readFileSync(new URL("../supabase/migrations/20261102_web_lead_ingest.sql", import.meta.url), "utf8");

function sqlFunctionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `fonction ${name} absente`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `corps de ${name} non terminé`);
  return sql.slice(start, end);
}

function parseWhenLists(body, param) {
  const pattern = new RegExp(`when '([a-z_]+)'\\s+then ${param} in \\(([^)]*)\\)`, "g");
  const result = {};
  for (const match of body.matchAll(pattern)) {
    result[match[1]] = match[2].split(",").map(part => part.trim().replace(/^'|'$/g, ""));
  }
  return result;
}

test("le cloisonnement canal / catégorie est identique en SQL et en JavaScript", () => {
  const sqlPairs = parseWhenLists(sqlFunctionBody(ATTRIBUTION_SQL, "origin_pair_is_valid"), "p_category");
  assert.deepEqual(Object.keys(sqlPairs).sort(), [...ORIGIN_CHANNELS].sort());
  for (const channel of ORIGIN_CHANNELS) {
    assert.deepEqual(
      sqlPairs[channel].slice().sort(),
      categoriesForChannel(channel).slice().sort(),
      `divergence pour le canal ${channel}`
    );
  }
});

test("les sous-origines autorisées sont identiques en SQL et en JavaScript", () => {
  const body = sqlFunctionBody(ATTRIBUTION_SQL, "origin_subtype_is_valid");
  const sqlSubtypes = parseWhenLists(body, "p_subtype");
  for (const item of ORIGIN_CATEGORIES) {
    const expected = subtypesForCategory(item.code);
    if (expected.length === 0) {
      assert.equal(sqlSubtypes[item.code], undefined, `${item.code} ne devrait accepter aucune sous-origine`);
      assert.match(body, new RegExp(`when '${item.code}'\\s+then false`), `${item.code} doit être explicitement refusé en SQL`);
      continue;
    }
    assert.deepEqual(
      sqlSubtypes[item.code]?.slice().sort(),
      expected.slice().sort(),
      `divergence pour la catégorie ${item.code}`
    );
  }
});

test("le garde-fou SQL sur source connaît le marqueur réservé et les six codes", () => {
  const body = sqlFunctionBody(ATTRIBUTION_SQL, "commercial_opportunities_source_guard");
  // Le marqueur réservé est comparé sans égard à la casse : aucun libellé
  // commercial ne vaut « Google », donc toutes ses variantes sont refusées.
  assert.match(body, /lower\(brut\) = 'google'/);
  for (const item of ORIGIN_CATEGORIES) {
    assert.ok(body.includes(`'${item.code}'`), `${item.code} absent du garde-fou`);
  }
});

test("le garde-fou accepte les libellés commerciaux et refuse les codes bruts", () => {
  const body = sqlFunctionBody(ATTRIBUTION_SQL, "commercial_opportunities_source_guard");

  // Les codes sont comparés exactement, et non en minuscules. La version
  // précédente normalisait la valeur reçue, donc refusait « Prospection », le
  // libellé commercial légitime de la famille prospection : toute création de
  // prospect de prospection terrain échouait.
  assert.match(body, /brut in \('google_ads', 'meta_ads', 'site_web', 'prospection', 'entrant', 'a_qualifier'\)/);
  assert.doesNotMatch(body, /normalized in \(/, "la comparaison en minuscules subsiste");

  // Aucun libellé produit par le CRM ne doit tomber dans la liste des codes.
  // « Prospection » n'en diffère que par la casse : c'est précisément ce que
  // la comparaison exacte sépare.
  const codes = ORIGIN_CATEGORIES.map(item => item.code);
  const libelles = codes.map(code => mirrorSourceLabel(code));
  const collisionsExactes = libelles.filter(libelle => codes.includes(libelle));
  const collisionsCasse = libelles.filter(
    libelle => !codes.includes(libelle) && codes.includes(String(libelle).toLowerCase().trim())
  );
  assert.deepEqual(collisionsExactes, [], "un libellé commercial est identique à un code brut");
  assert.deepEqual(collisionsCasse, ["Prospection"]);
});

test("aucune table en ajout seul ne reçoit de droit de modification", () => {
  const interdits = [
    [ATTRIBUTION_SQL, "lead_attribution"],
    [ATTRIBUTION_SQL, "lead_origin_history"],
    [INGEST_SQL, "web_lead_submissions"],
    [INGEST_SQL, "web_lead_events"],
    [OAUTH_SQL, "google_oauth_states"],
  ];
  for (const [sql, table] of interdits) {
    assert.match(
      sql,
      new RegExp(`revoke all on public\\.${table} from anon, authenticated, service_role;`),
      `${table} doit révoquer aussi service_role`
    );
    for (const grant of sql.match(new RegExp(`grant [^;]*on public\\.${table} to [^;]*;`, "g")) || []) {
      assert.ok(!/\bdelete\b/.test(grant), `${table} ne doit jamais accorder DELETE : ${grant}`);
      assert.ok(!/grant all/.test(grant), `${table} ne doit jamais accorder ALL : ${grant}`);
    }
  }
});

/**
 * Un déclencheur `before update or delete` sur une table reliée par
 * `on delete cascade` rendrait la suppression du prospect parent impossible.
 */
test("les déclencheurs d’ajout seul ne couvrent pas la suppression", () => {
  for (const sql of [ATTRIBUTION_SQL, INGEST_SQL]) {
    for (const trigger of sql.match(/create trigger [\s\S]*?execute function[^;]*;/g) || []) {
      if (!/append_only/.test(trigger)) continue;
      assert.ok(!/or delete/.test(trigger), `déclencheur bloquant la cascade : ${trigger}`);
    }
  }
});

test("les nouvelles tables activent RLS malgré son contournement par service_role", () => {
  const tables = [
    [ATTRIBUTION_SQL, "lead_attribution"],
    [ATTRIBUTION_SQL, "lead_origin_history"],
    [INGEST_SQL, "web_lead_submissions"],
    [INGEST_SQL, "web_lead_events"],
    [OAUTH_SQL, "google_oauth_states"],
  ];
  for (const [sql, table] of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`), table);
  }
});

test("aucune migration ne reprend les origines des prospects existants", () => {
  for (const sql of [ATTRIBUTION_SQL, INGEST_SQL, OAUTH_SQL]) {
    const ecritures = sql.match(/^\s*update public\.\w+/gim) || [];
    for (const ecriture of ecritures) {
      assert.ok(
        !/update public\.commercial_opportunities/i.test(ecriture),
        `reprise de données interdite : ${ecriture.trim()}`
      );
    }
  }
  assert.match(ATTRIBUTION_SQL, /add column if not exists origin_category text,/);
  assert.ok(!/add column if not exists origin_category text (not null|default)/i.test(ATTRIBUTION_SQL));
});

test("toutes les fonctions sensibles fixent search_path et retirent les droits publics", () => {
  // `definer` n'est pas exigé partout : une fonction n'a besoin des droits de
  // son propriétaire que si elle atteint une table qu'un rôle applicatif ne
  // peut pas atteindre. L'imposer ailleurs serait un privilège sans emploi.
  //
  // Toutes portent désormais `pg_catalog, public, pg_temp`. Avec `public`
  // seul, `pg_temp` restait implicitement en tête de la résolution des
  // relations, donc une table temporaire pouvait masquer un objet du schéma
  // public. Le placer en dernier ferme ce détournement, et la migration de
  // durcissement n'aurait pas pu le faire pour ces fonctions : elle ne traite
  // que celles dépourvues de tout réglage.
  const fonctions = [
    [ATTRIBUTION_SQL, [
      ["lead_attribution_append_only", { definer: true }],
      ["commercial_opportunities_origin_guard", { definer: true }],
      ["commercial_opportunities_source_guard", { definer: true }],
    ]],
    [OAUTH_SQL, [
      // Ne lit et n'écrit aucune table : ne compare que OLD et NEW.
      ["google_oauth_states_guard", { definer: false }],
      // Doit supprimer, et c'est ce qui permet de ne jamais accorder DELETE
      // à `service_role`.
      ["purge_google_oauth_states", { definer: true }],
    ]],
    [INGEST_SQL, [
      ["enqueue_web_lead", { definer: true }],
      ["reserve_web_leads", { definer: true }],
      ["settle_web_lead", { definer: true }],
      ["requeue_web_lead", { definer: true }],
      ["purge_web_lead_payloads", { definer: true }],
    ]],
  ];

  for (const [sql, entrees] of fonctions) {
    for (const [nom, attendu] of entrees) {
      const body = sqlFunctionBody(sql, nom);
      if (attendu.definer) {
        assert.match(body, /security definer/, `${nom} devrait être security definer`);
      } else {
        assert.doesNotMatch(body, /security definer/, `${nom} n'a pas besoin de security definer`);
      }
      assert.match(
        body,
        /set search_path = pg_catalog, public, pg_temp/,
        `${nom} sans search_path durci`
      );
      assert.match(sql, new RegExp(`revoke all on function public\\.${nom}\\(`), `${nom} sans révocation des droits publics`);
    }
  }

  // Plus aucune fonction sur `search_path = public` dans les trois migrations.
  const restantes = [ATTRIBUTION_SQL, INGEST_SQL, OAUTH_SQL]
    .map(sql => (sql.match(/^set search_path = public$/gm) || []).length)
    .reduce((somme, nombre) => somme + nombre, 0);
  assert.equal(restantes, 0, "une fonction est encore sur search_path = public");

  // Le durcissement ne suffit pas à lui seul : `pg_temp` placé en dernier
  // protège les noms non qualifiés, mais une écriture visant une relation sans
  // schéma reste une dépendance implicite à l'ordre de résolution. Chaque
  // cible d'écriture doit donc nommer son schéma.
  for (const sql of [ATTRIBUTION_SQL, INGEST_SQL, OAUTH_SQL]) {
    for (const ligne of sql.split("\n")) {
      if (/^\s*--/.test(ligne)) continue;
      // Le mot-clé doit ouvrir l'instruction. Sans cette ancre, le `update` de
      // `create trigger ... before update on ...` serait pris pour une écriture.
      const cible = /^\s*(?:insert into|delete from|update)\s+([a-z_][a-z0-9_.]*)/i.exec(ligne);
      if (!cible) continue;
      assert.match(cible[1], /^(public|auth)\./, `écriture vers une relation non qualifiée : ${ligne.trim()}`);
    }
  }
});

test("la file d’attente réserve ses demandes de façon atomique", () => {
  const body = sqlFunctionBody(INGEST_SQL, "reserve_web_leads");
  assert.match(body, /for update skip locked/);
  // Le verrou doit porter sur un lot déjà borné, sinon deux exécutions
  // concurrentes se bloquent au lieu de se répartir le travail.
  assert.ok(body.indexOf("limit") < body.indexOf("for update skip locked"));
  assert.match(INGEST_SQL, /create unique index if not exists web_lead_submissions_submission_idx/);
});

test("le jeton OAuth est contraint à une empreinte et à une finalité connue", () => {
  assert.match(OAUTH_SQL, /check \(nonce_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(OAUTH_SQL, /check \(purpose in \('calendar', 'google_ads', 'meta_ads'\)\)/);
  assert.match(OAUTH_SQL, /OAUTH_STATE_ALREADY_CONSUMED/);
  assert.ok(!/nonce text|state text/.test(OAUTH_SQL), "le jeton en clair ne doit pas avoir de colonne");
});
