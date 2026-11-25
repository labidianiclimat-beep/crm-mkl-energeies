/**
 * Contrôle structurel des fichiers SQL.
 *
 * Aucune base PostgreSQL n'est disponible en local : ces fichiers n'ont jamais
 * été exécutés. Ce test ne valide donc PAS la syntaxe. Il attrape seulement les
 * erreurs mécaniques qui m'ont déjà échappé à la relecture : parenthèses non
 * fermées, délimiteurs dollar dépareillés, mots réservés pris comme noms de
 * variables, instructions non terminées.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);
const DIAGNOSTICS = new URL("../supabase/diagnostics/", import.meta.url);

function filesIn(dir) {
  return readdirSync(dir)
    .filter(name => name.endsWith(".sql"))
    .map(name => ({ name, text: readFileSync(new URL(name, dir), "utf8") }));
}

const FILES = [...filesIn(MIGRATIONS), ...filesIn(DIAGNOSTICS)];

/**
 * Retire commentaires, chaînes et corps dollar-quotés. Les corps sont rendus à
 * part, car ils doivent être équilibrés indépendamment du fichier qui les
 * contient.
 */
function tokenize(sql) {
  let code = "";
  const bodies = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      code += "''";
      i = j + 1;
      continue;
    }
    const tag = rest.match(/^\$([A-Za-z_]\w*)?\$/);
    if (tag) {
      const marker = tag[0];
      const end = sql.indexOf(marker, i + marker.length);
      if (end === -1) {
        bodies.push({ marker, text: rest, unterminated: true });
        break;
      }
      bodies.push({ marker, text: sql.slice(i + marker.length, end), unterminated: false });
      code += " BODY ";
      i = end + marker.length;
      continue;
    }
    code += sql[i];
    i += 1;
  }
  return { code, bodies };
}

function parenBalance(text) {
  let depth = 0;
  let lowest = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth < lowest) lowest = depth;
  }
  return { depth, lowest };
}

test("au moins les migrations marketing et le diagnostic sont couverts", () => {
  const names = FILES.map(file => file.name);
  assert.ok(names.some(name => name.includes("lead_attribution")));
  assert.ok(names.some(name => name.includes("web_lead_ingest")));
  assert.ok(names.some(name => name.includes("google_oauth_states")));
  assert.ok(names.some(name => name.includes("marketing_bloc5")));
});

test("les délimiteurs dollar sont tous refermés", () => {
  for (const file of FILES) {
    const { bodies } = tokenize(file.text);
    for (const body of bodies) {
      assert.equal(
        body.unterminated,
        false,
        `${file.name} : délimiteur ${body.marker} jamais refermé`
      );
    }
  }
});

test("les parenthèses sont équilibrées, corps de fonctions compris", () => {
  for (const file of FILES) {
    const { code, bodies } = tokenize(file.text);
    const outer = parenBalance(code);
    assert.equal(outer.depth, 0, `${file.name} : ${outer.depth} parenthèse(s) non refermée(s)`);
    assert.equal(outer.lowest, 0, `${file.name} : parenthèse fermée sans ouverture`);
    for (const body of bodies) {
      const inner = parenBalance(tokenize(body.text).code);
      assert.equal(inner.depth, 0, `${file.name} : corps ${body.marker} déséquilibré`);
      assert.equal(inner.lowest, 0, `${file.name} : corps ${body.marker} ferme trop tôt`);
    }
  }
});

/**
 * J'ai déjà écrit `declare current …`, refusé par PostgreSQL. La liste reste
 * courte et ne couvre que les mots réservés plausibles comme nom de variable.
 */
test("aucun mot réservé n'est utilisé comme nom de variable", () => {
  const reserved = [
    "current", "end", "all", "any", "both", "case", "cast", "check", "default",
    "do", "else", "foreign", "from", "grant", "group", "having", "into", "limit",
    "offset", "order", "primary", "references", "select", "table", "then", "to",
    "union", "user", "using", "when", "where", "window", "with",
  ];
  for (const file of FILES) {
    for (const body of tokenize(file.text).bodies) {
      const declare = body.text.match(/\bdeclare\b([\s\S]*?)\bbegin\b/i);
      if (!declare) continue;
      for (const line of declare[1].split("\n")) {
        const name = line.trim().match(/^([A-Za-z_]\w*)\s+\S/);
        if (!name) continue;
        assert.equal(
          reserved.includes(name[1].toLowerCase()),
          false,
          `${file.name} : « ${name[1]} » est un mot réservé, inutilisable comme variable`
        );
      }
    }
  }
});

/**
 * `LIMIT` doit précéder la clause de verrouillage : l'inverse est une erreur de
 * syntaxe que j'ai déjà commise dans la réservation de file.
 */
test("LIMIT précède toujours FOR UPDATE", () => {
  for (const file of FILES) {
    const { code, bodies } = tokenize(file.text);
    for (const text of [code, ...bodies.map(body => tokenize(body.text).code)]) {
      assert.doesNotMatch(
        text,
        /for\s+update[\s\S]{0,80}?\blimit\b/i,
        `${file.name} : LIMIT placé après FOR UPDATE`
      );
    }
  }
});

test("chaque fichier se termine par une instruction close", () => {
  for (const file of FILES) {
    const { code } = tokenize(file.text);
    assert.equal(
      code.trim().endsWith(";"),
      true,
      `${file.name} : dernière instruction non terminée par un point-virgule`
    );
  }
});

/**
 * Dette antérieure au module marketing : une trentaine de fonctions des
 * migrations déjà appliquées ne fixent pas leur search_path. Les corriger dans
 * leur fichier d'origine ne changerait rien en base, puisque ces migrations
 * sont passées ; il faudra une nouvelle migration qui rejoue les fonctions.
 *
 * La gravité est limitée par un fait vérifié ci-dessous : aucune n'est
 * SECURITY DEFINER. Elles s'exécutent donc avec les droits de l'appelant.
 */
const MARKETING_MIGRATION_PREFIX = "20261102";

function declarationsOf(text) {
  const { code } = tokenize(text);
  return code.match(/create\s+(?:or\s+replace\s+)?function[\s\S]*?BODY/gi) || [];
}

function functionName(declaration) {
  return declaration.match(/function\s+([\w.]+)/i)?.[1] || "";
}

function missingSearchPath(file) {
  return declarationsOf(file.text).filter(declaration => !/set\s+search_path/i.test(declaration));
}

/** Un `create function` sans `search_path` fixé est exploitable. */
test("les fonctions du module marketing fixent leur search_path", () => {
  const files = filesIn(MIGRATIONS).filter(file => file.name >= MARKETING_MIGRATION_PREFIX);
  assert.ok(files.length >= 3, "les migrations marketing doivent être présentes");
  for (const file of files) {
    const faulty = missingSearchPath(file).map(functionName);
    assert.deepEqual(faulty, [], `${file.name} : fonctions sans search_path : ${faulty.join(", ")}`);
  }
});

/**
 * La dette est chiffrée plutôt que masquée : si le nombre bouge, c'est qu'une
 * nouvelle fonction a été écrite sans search_path ou qu'une correction est
 * passée, et la liste doit être revue.
 */
test("la dette search_path antérieure est connue et n'augmente pas", () => {
  const legacy = filesIn(MIGRATIONS).filter(file => file.name < MARKETING_MIGRATION_PREFIX);
  const faulty = legacy.flatMap(file => missingSearchPath(file).map(declaration => ({
    file: file.name,
    name: functionName(declaration),
    definer: /security\s+definer/i.test(declaration),
  })));
  // 36 déclarations, mais plusieurs migrations redéfinissent la même fonction :
  // seule la dernière définition compte en base, d'où les deux nombres.
  assert.equal(faulty.length, 36, "dette search_path antérieure modifiée : à revoir");
  assert.equal(new Set(faulty.map(item => item.name)).size, 22);
  assert.deepEqual(
    faulty.filter(item => item.definer),
    [],
    "une fonction SECURITY DEFINER sans search_path serait bien plus grave"
  );
});

/**
 * Migration corrective de la dette ci-dessus.
 *
 * Elle n'est pas appliquée. Ces contrôles vérifient qu'elle couvre bien la
 * dette constatée et qu'elle la corrige de la façon la moins risquée : en
 * modifiant un paramètre, jamais en recopiant un corps de fonction.
 */
const HARDENING = filesIn(MIGRATIONS).find(file => file.name.includes("search_path_hardening"));

test("la migration corrective de search_path existe", () => {
  assert.ok(HARDENING, "la dette est chiffrée mais aucune migration ne la corrige");
});

test("la correction passe par ALTER FUNCTION et ne réécrit aucun corps", () => {
  // Recopier vingt-deux corps de fonction, dont quatre décident de droits
  // d'accès, serait plus dangereux que le risque corrigé.
  assert.match(HARDENING.text, /alter function %s set search_path/i);
  assert.deepEqual(
    declarationsOf(HARDENING.text),
    [],
    "aucune fonction métier ne doit être redéfinie par cette migration"
  );
});

test("pg_temp est mentionné en dernier, ce qui ferme le détournement", () => {
  // Mentionné, pg_temp n'est plus recherché en priorité pour les relations :
  // c'est exactement le mécanisme qui rendait le détournement possible.
  const chemin = HARDENING.text.match(/set search_path = ([^']+?)'/);
  assert.ok(chemin, "le chemin appliqué doit être lisible dans la migration");
  const schemas = chemin[1].split(",").map(item => item.trim());
  assert.equal(schemas.at(-1), "pg_temp");
  assert.ok(schemas.includes("public"), "les tables du schéma public doivent rester résolues");
  assert.ok(schemas.indexOf("public") < schemas.indexOf("pg_temp"), "public doit primer sur pg_temp");
});

test("la migration refuse de se terminer si une fonction a échappé à la correction", () => {
  assert.match(HARDENING.text, /raise exception 'SEARCH_PATH_INCOMPLET/);
});

test("l'inventaire de la migration cite bien les 22 fonctions en dette", () => {
  const legacy = filesIn(MIGRATIONS).filter(file => file.name < MARKETING_MIGRATION_PREFIX);
  const noms = new Set(
    legacy.flatMap(file => missingSearchPath(file).map(functionName).map(nom => nom.replace(/^public\./, "")))
  );
  assert.equal(noms.size, 22);
  for (const nom of noms) {
    assert.ok(
      HARDENING.text.includes(nom),
      `« ${nom} » est en dette mais absente de l'inventaire de la migration corrective`
    );
  }
});

test("les quatre fonctions utilisées par les politiques RLS sont signalées comme telles", () => {
  // Ce sont les plus sensibles : leur résultat décide de la visibilité des
  // lignes. L'audit doit les nommer explicitement, pas les noyer dans la liste.
  for (const nom of [
    "can_access_client_row",
    "can_access_devis_row",
    "can_access_opportunity_row",
    "can_access_appointment_row",
  ]) {
    assert.match(
      HARDENING.text,
      new RegExp(`${nom}[^\\n]*\\(RLS\\)`),
      `${nom} intervient dans une politique RLS et doit être signalée dans l'audit`
    );
  }
});
