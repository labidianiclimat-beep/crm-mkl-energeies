/**
 * Câblage de la file des demandes du site.
 *
 * Les deux routes font des appels réseau, donc elles ne sont pas exécutables
 * ici. Ces vérifications portent sur ce qui doit rester vrai dans leur source :
 * l'ordre des contrôles, l'absence de fuite dans les journaux, et le fait que
 * le délai d'arrivée d'un prospect ne dépende pas du cron.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cronAuthorized } from "../app/lib/cron-auth.js";

const INGEST = readFileSync(new URL("../app/api/web-leads/route.js", import.meta.url), "utf8");
const CRON = readFileSync(new URL("../app/api/cron/web-leads/route.js", import.meta.url), "utf8");
const QUEUE = readFileSync(new URL("../app/lib/web-lead-queue-server.js", import.meta.url), "utf8");
const VERCEL = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

/** Bloc qui suit la mise en file réussie, jusqu’à la réponse finale. */
const INGEST_AFTER_ENQUEUE = INGEST.slice(
  INGEST.indexOf("const receipt ="),
  INGEST.lastIndexOf("} catch (error)")
);

test("le prospect n’attend pas le prochain passage du cron", () => {
  assert.match(INGEST, /import \{ after \} from "next\/server"/);
  assert.match(INGEST_AFTER_ENQUEUE, /after\(async \(\) => \{/);
  assert.ok(
    INGEST_AFTER_ENQUEUE.indexOf("after(async") < INGEST_AFTER_ENQUEUE.indexOf("return Response.json"),
    "le traitement doit être programmé avant de répondre, et s’exécuter après"
  );
});

test("un rejeu ne relance pas de traitement", () => {
  const bloc = INGEST_AFTER_ENQUEUE.slice(
    INGEST_AFTER_ENQUEUE.indexOf("if (!receipt.duplicate)"),
    INGEST_AFTER_ENQUEUE.indexOf("return Response.json")
  );
  assert.match(bloc, /processWebLeadQueue/);
});

test("la réservation des demandes est atomique", () => {
  assert.match(QUEUE, /rest\/v1\/rpc\/reserve_web_leads/);
  assert.ok(!/web_lead_submissions\?.*status=eq\.pending/.test(QUEUE), "aucune réservation par PATCH direct");
});

test("une demande en revue ne crée aucun prospect", () => {
  const bloc = QUEUE.slice(
    QUEUE.indexOf('if (plan.outcome !== "succeeded")'),
    QUEUE.indexOf("const creation = await createOrAdoptProspect")
  );
  assert.ok(bloc.length > 0 && bloc.length < 600, "ancrage du bloc de revue à revoir");
  assert.match(bloc, /settle\(submission\.id, "review"/);
  assert.match(bloc, /return "review"/);
  assert.ok(!/commercial_opportunities/.test(bloc));
});

test("le contact d’attribution est écrit après la fiche prospect", () => {
  assert.ok(
    QUEUE.indexOf("rest/v1/commercial_opportunities") < QUEUE.indexOf("rest/v1/lead_attribution"),
    "la table d’attribution porte une contrainte vers le prospect"
  );
});

test("un échec d’intégration est réessayé, jamais abandonné en silence", () => {
  assert.match(QUEUE, /settle\(submission\.id, "retry"/);
  assert.match(QUEUE, /counts\.retry \+= 1/);
});

test("le cron est protégé par un secret et refuse son absence", () => {
  // Le contrôle est partagé avec les autres traitements planifiés, pour qu'il
  // n'existe qu'une seule règle d'accès à maintenir. La route doit s'en
  // servir et refuser nettement, sans se faire son propre contrôle à côté.
  assert.match(CRON, /cronAuthorized\(request\)/);
  assert.match(CRON, /status: 401/);
  assert.doesNotMatch(CRON, /process\.env\.CRON_SECRET/, "la route refait le contrôle à sa façon");

  const avant = process.env.CRON_SECRET;
  const entete = valeur => ({ headers: { get: () => valeur } });
  try {
    delete process.env.CRON_SECRET;
    assert.equal(cronAuthorized(entete("Bearer peu-importe")), false, "sans secret configuré, tout est refusé");
    process.env.CRON_SECRET = "secret-de-la-file";
    assert.equal(cronAuthorized(entete("Bearer secret-de-la-file")), true);
    assert.equal(cronAuthorized(entete("Bearer autre-chose-ici")), false);
    assert.equal(cronAuthorized(entete(null)), false);
  } finally {
    if (avant === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = avant;
  }
});

test("le cron de la file est déclaré", () => {
  const paths = (VERCEL.crons || []).map(item => item.path);
  assert.ok(paths.includes("/api/cron/web-leads"));
});

test("aucun contenu de demande n’est recopié dans les journaux", () => {
  for (const [nom, source] of [["réception", INGEST], ["cron", CRON], ["file", QUEUE]]) {
    for (const line of source.split("\n")) {
      if (!/console\.(log|warn|error)/.test(line)) continue;
      assert.ok(
        !/payload|rawBody|p_payload|\bphone\b|\bemail\b/.test(line),
        `${nom} : journal trop bavard — ${line.trim()}`
      );
    }
  }
});

test("les erreurs d’intégration sont tronquées avant journalisation", () => {
  assert.match(QUEUE, /\.slice\(0, 64\)/);
});
