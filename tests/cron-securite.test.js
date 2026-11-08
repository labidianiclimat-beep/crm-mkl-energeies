import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

/**
 * Le script est lancé de façon asynchrone, et c'est indispensable : le faux
 * CRM tourne dans ce même processus, et un `execFileSync` bloquerait la boucle
 * d'événements, donc le serveur ne répondrait jamais et le script attendrait
 * jusqu'à son délai maximum.
 */
const lancer = promisify(execFile);

/** Démarre un faux CRM et prépare la configuration du déclencheur. */
async function fauxCrm(repondre) {
  const recues = [];
  const serveur = createServer((req, res) => {
    recues.push({ url: req.url, methode: req.method, autorisation: req.headers.authorization });
    repondre(res);
  });
  await new Promise(resolve => serveur.listen(0, "127.0.0.1", resolve));
  const config = join(mkdtempSync(join(tmpdir(), "mkl-cron-")), "crm.env");
  writeFileSync(config, `CRM_URL=http://127.0.0.1:${serveur.address().port}\nCRON_SECRET=secret-de-test\n`);
  return {
    recues,
    config,
    fermer: () => new Promise(resolve => serveur.close(resolve)),
    executer: () =>
      lancer("bash", ["ovh-site/deploy/mkl-crm-queue.sh"], {
        env: { ...process.env, MKL_CRM_QUEUE_ENV: config },
        encoding: "utf8",
      }),
  };
}

function repondJson(code, corps) {
  return res => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(corps));
  };
}

import { cronAuthorized } from "../app/lib/cron-auth.js";
import { WEB_LEAD_RETENTION, maxRetentionDays } from "../app/lib/web-lead-retention.js";

const RETENTION_ROUTE = readFileSync("app/api/cron/web-lead-retention/route.js", "utf8");
const QUEUE_ROUTE = readFileSync("app/api/cron/web-leads/route.js", "utf8");
const RAPPELS_ROUTE = readFileSync("app/api/cron/agenda-reminders/route.js", "utf8");
const FLOTTE_ROUTE = readFileSync("app/api/cron/fleet-alerts/route.js", "utf8");
const ENTRETIEN_ROUTE = readFileSync("app/api/cron/entretien-calendar/route.js", "utf8");
const MIGRATION = readFileSync("supabase/migrations/20261105_web_lead_idempotence.sql", "utf8");
const DECLENCHEUR = readFileSync("ovh-site/deploy/mkl-crm-queue.sh", "utf8");

function requete(entete) {
  return { headers: { get: nom => (nom.toLowerCase() === "authorization" ? entete : null) } };
}

test("le contrôle d accès du cron n accepte que l en-tête", () => {
  const avant = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "secret-de-test-0123456789";
  try {
    assert.equal(cronAuthorized(requete("Bearer secret-de-test-0123456789")), true);
    assert.equal(cronAuthorized(requete("Bearer mauvais-secret-0123456789")), false);
    // Même longueur, un seul caractère de différence : la comparaison doit
    // rester fausse, et le faire sans divulguer où est la différence.
    assert.equal(cronAuthorized(requete("Bearer secret-de-test-0123456788")), false);
    assert.equal(cronAuthorized(requete("secret-de-test-0123456789")), false);
    assert.equal(cronAuthorized(requete("Bearer ")), false);
    assert.equal(cronAuthorized(requete("")), false);
    assert.equal(cronAuthorized({ headers: {} }), false);
    assert.equal(cronAuthorized(undefined), false);

    process.env.CRON_SECRET = "";
    assert.equal(cronAuthorized(requete("Bearer ")), false, "sans secret configuré, tout est refusé");
    delete process.env.CRON_SECRET;
    assert.equal(cronAuthorized(requete("Bearer quoi-que-ce-soit")), false);
  } finally {
    if (avant === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = avant;
  }
});

test("le secret ne passe jamais par l URL", () => {
  for (const [nom, source] of [
    ["file", QUEUE_ROUTE],
    ["conservation", RETENTION_ROUTE],
    ["rappels", RAPPELS_ROUTE],
    ["flotte", FLOTTE_ROUTE],
    ["entretien", ENTRETIEN_ROUTE],
  ]) {
    assert.doesNotMatch(source, /searchParams\.get\(["']secret/, `${nom} : secret en paramètre d'URL`);
    assert.match(source, /cronAuthorized\(request\)/, `${nom} : contrôle d'accès absent`);
    // Une route qui refait le contrôle à sa façon échappe à la règle commune :
    // c'est exactement ainsi que le repli par URL avait survécu ici.
    assert.doesNotMatch(source, /function isAuthorizedCron/, `${nom} : contrôle réimplémenté`);
    assert.doesNotMatch(source, /process\.env\.CRON_SECRET/, `${nom} : la route relit le secret`);
  }
  // Le déclencheur OVH doit poser un en-tête, et ne rien mettre dans l'URL.
  assert.match(DECLENCHEUR, /-H "Authorization: Bearer \$\{CRON_SECRET\}"/);
  assert.doesNotMatch(DECLENCHEUR, /secret=/, "le script met le secret dans l'URL");
  // Un secret passé en argument serait lisible dans la liste des processus.
  assert.doesNotMatch(DECLENCHEUR, /CRON_SECRET="?\$1/, "le script lit le secret en argument");
});

test("la conservation applique bien trente jours puis trente jours", () => {
  assert.equal(WEB_LEAD_RETENTION.payloadDays, 30);
  assert.equal(WEB_LEAD_RETENTION.graceDays, 30);
  assert.equal(maxRetentionDays(), 60);
  // La route transmet le délai de grâce, elle ne laisse pas la base décider
  // seule : la politique est écrite à un seul endroit.
  assert.match(RETENTION_ROUTE, /p_grace_days:\s*WEB_LEAD_RETENTION\.graceDays/);
  // Le signalement précède l'effacement dans le code, et pas l'inverse.
  assert.ok(
    RETENTION_ROUTE.indexOf("web_lead_retention_scan") < RETENTION_ROUTE.indexOf("purge_web_lead_payloads"),
    "l'effacement est appelé avant le signalement"
  );
});

test("la purge ne touche que des contenus techniques", () => {
  const purge = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.purge_web_lead_payloads"),
    MIGRATION.indexOf("revoke all on function public.requeue_web_lead")
  );
  assert.ok(purge.length > 200, "ancrage de la fonction de purge à revoir");

  // Aucune table commerciale ne doit apparaître dans la purge : les contenus
  // techniques temporaires et les fiches du CRM ne se confondent pas.
  for (const table of [
    "commercial_opportunities",
    "commercial_appointments",
    "lead_attribution",
    "clients",
    "devis",
  ]) {
    assert.doesNotMatch(purge, new RegExp(`\\b${table}\\b`), `la purge cite ${table}`);
  }
  // Elle efface un contenu, elle ne supprime pas de ligne.
  assert.doesNotMatch(purge, /delete\s+from/i, "la purge supprime des lignes");
  assert.match(purge, /set\s+payload\s*=\s*null/i);
  assert.match(purge, /payload_purged_at/);
  // Une demande non résolue n'est effacée qu'après signalement.
  assert.match(purge, /retention_alert_at is not null/);
});

test("le declencheur OVH refuse de tourner sans configuration", () => {
  const dossier = mkdtempSync(join(tmpdir(), "mkl-cron-"));
  const vide = join(dossier, "vide.env");
  writeFileSync(vide, "CRM_URL=\nCRON_SECRET=\n");
  try {
    execFileSync("bash", ["ovh-site/deploy/mkl-crm-queue.sh"], {
      env: { ...process.env, MKL_CRM_QUEUE_ENV: vide, CRM_URL: "", CRON_SECRET: "" },
      stdio: "pipe",
    });
    assert.fail("le script a tourné sans configuration");
  } catch (error) {
    assert.equal(error.status, 78, "code de sortie attendu pour une configuration manquante");
  }
});

test("le declencheur appelle le CRM avec son en-tete et sans secret dans l URL", async () => {
  const crm = await fauxCrm(repondJson(200, { ok: true, reserved: 2, created: 2, review: 0, retry: 0 }));
  try {
    const { stdout } = await crm.executer();
    assert.equal(crm.recues.length, 1);
    assert.equal(crm.recues[0].methode, "POST");
    assert.equal(crm.recues[0].url, "/api/cron/web-leads");
    assert.equal(crm.recues[0].autorisation, "Bearer secret-de-test");
    assert.doesNotMatch(crm.recues[0].url, /secret/);
    assert.match(stdout, /file traitée/);
  } finally {
    await crm.fermer();
  }
});

test("le declencheur reste muet quand la file est vide", async () => {
  const crm = await fauxCrm(repondJson(200, { ok: true, reserved: 0, created: 0, review: 0, retry: 0 }));
  try {
    const { stdout } = await crm.executer();
    assert.equal(stdout.trim(), "", "une exécution sans travail ne doit rien écrire");
  } finally {
    await crm.fermer();
  }
});

test("le declencheur signale un refus du CRM sans divulguer le secret", async () => {
  const crm = await fauxCrm(repondJson(401, { error: "Non autorisé." }));
  try {
    await crm.executer();
    assert.fail("un refus du CRM doit faire échouer le script");
  } catch (error) {
    const journal = String(error.stderr || "");
    assert.match(journal, /CRM a répondu 401/);
    assert.doesNotMatch(journal, /secret-de-test/, "le secret apparaît dans le journal");
  } finally {
    await crm.fermer();
  }
});

test("le minuteur systemd tourne bien chaque minute et sans recouvrement", () => {
  const minuteur = readFileSync("ovh-site/deploy/mkl-crm-queue.timer", "utf8");
  const service = readFileSync("ovh-site/deploy/mkl-crm-queue.service", "utf8");
  assert.match(minuteur, /OnUnitActiveSec=1min/);
  // `oneshot` empêche systemd de lancer une seconde exécution tant que la
  // première n'est pas terminée.
  assert.match(service, /Type=oneshot/);
  // La borne du service reste sous la minute, sinon deux appels se croiseraient.
  const limite = Number(/TimeoutStartSec=(\d+)/.exec(service)?.[1]);
  assert.ok(limite > 0 && limite < 60, `TimeoutStartSec=${limite} doit rester sous la minute`);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /CapabilityBoundingSet=\s*$/m);
});

/**
 * Les routes Next.js importent sans extension, ce que Node ne résout pas seul.
 * Ce crochet ajoute `.js` pour les seuls chemins relatifs du dépôt. Sans lui,
 * ces routes ne pourraient être vérifiées que par lecture de source, et c'est
 * exactement ainsi que le repli par paramètre d'URL avait survécu ici.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      const chemin = fileURLToPath(new URL(specifier, context.parentURL));
      for (const essai of [`${chemin}.js`, `${chemin}/index.js`]) {
        if (existsSync(essai)) return { url: pathToFileURL(essai).href, format: "module", shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

/**
 * Retirée avant tout import : `supabase-server` la capture à son chargement,
 * si bien que les routes s'arrêtent sur un 503 au lieu d'ouvrir la moindre
 * connexion. Un en-tête valide prouve alors le passage du contrôle d'accès,
 * sans qu'aucun traitement métier ne démarre.
 */
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const SECRET_PLANIFIE = "secret-de-test-0123456789";

async function routesPlanifiees() {
  const charger = nom => import(`../app/api/cron/${nom}/route.js`);
  return [
    ["rappels", await charger("agenda-reminders"), "https://crm.test/api/cron/agenda-reminders"],
    ["flotte", await charger("fleet-alerts"), "https://crm.test/api/cron/fleet-alerts"],
    ["entretien", await charger("entretien-calendar"), "https://crm.test/api/cron/entretien-calendar"],
  ];
}

async function avecSecret(execution) {
  const avant = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET_PLANIFIE;
  try {
    return await execution();
  } finally {
    if (avant === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = avant;
  }
}

test("les trois routes planifiées refusent tout appel sans en-tête valide", async () => {
  await avecSecret(async () => {
    for (const [nom, route, url] of await routesPlanifiees()) {
      const refuses = [
        ["sans en-tête", new Request(url)],
        ["mauvais secret", new Request(url, { headers: { authorization: "Bearer mauvais-secret-012345" } })],
        ["secret en paramètre d'URL", new Request(`${url}?secret=${SECRET_PLANIFIE}`)],
      ];
      for (const [cas, requete] of refuses) {
        for (const verbe of ["GET", "POST"]) {
          const reponse = await route[verbe](requete);
          assert.equal(reponse.status, 401, `${nom} / ${verbe} / ${cas}`);
          assert.deepEqual(await reponse.json(), { error: "Non autorisé." });
        }
      }
    }
  });
});

test("les trois routes planifiées acceptent l en-tete Bearer de Vercel", async () => {
  await avecSecret(async () => {
    const entetes = { authorization: `Bearer ${SECRET_PLANIFIE}` };
    const [rappels, flotte, entretien] = await routesPlanifiees();

    // Les deux routes qui écrivent s'arrêtent sur l'absence de clé service :
    // le contrôle d'accès a donc laissé passer, et rien n'est parti vers
    // Supabase.
    for (const [nom, route, url] of [rappels, flotte]) {
      const reponse = await route.GET(new Request(url, { headers: entetes }));
      assert.notEqual(reponse.status, 401, `${nom} : en-tête de Vercel refusé`);
      assert.equal(reponse.status, 503, `${nom} : le traitement métier a démarré`);
      assert.match((await reponse.json()).error, /SUPABASE_SERVICE_ROLE_KEY/);
    }

    // L'agenda entretien n'a aucune dépendance : il répond, et confirme au
    // passage qu'il reste désactivé.
    const [, routeEntretien, urlEntretien] = entretien;
    const reponse = await routeEntretien.GET(new Request(urlEntretien, { headers: entetes }));
    assert.equal(reponse.status, 200);
    assert.deepEqual(await reponse.json(), {
      ok: true,
      skipped: true,
      googleDisabled: true,
      wroteToGoogle: false,
      reason: "Maintenance n’interroge plus Google Agenda.",
    });
  });
});
