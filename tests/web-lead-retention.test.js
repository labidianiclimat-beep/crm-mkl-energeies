import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Politique de conservation des demandes du site.
 *
 * Deux exigences opposées doivent tenir ensemble :
 *
 *   - ne pas conserver indéfiniment les coordonnées d'une personne dont la
 *     demande n'a jamais abouti ;
 *   - ne jamais effacer en silence une demande encore récupérable.
 *
 * La réponse est en trois temps : échéance normale pour les demandes abouties
 * ou écartées, signalement pour les autres, puis effacement après un délai de
 * grâce compté depuis le signalement.
 *
 * AVERTISSEMENT. Aucun PostgreSQL n'est disponible sur cette machine : ces
 * contrôles portent sur le texte du SQL, pas sur son exécution. Ils attrapent
 * une clause oubliée ou inversée, ils ne valident ni la syntaxe ni le
 * comportement réel. Les deux requêtes de vérification à passer en base sont
 * citées en commentaire plus bas.
 */

const SQL = readFileSync(
  new URL("../supabase/migrations/20261105_web_lead_idempotence.sql", import.meta.url),
  "utf8"
);
const INGEST = readFileSync(
  new URL("../supabase/migrations/20261102_web_lead_ingest.sql", import.meta.url),
  "utf8"
);

/** Corps d'une fonction, délimiteurs dollar exclus. */
function corps(sql, nom) {
  const start = sql.indexOf(`create or replace function public.${nom}`);
  assert.notEqual(start, -1, `fonction ${nom} absente`);
  const open = sql.indexOf("as $$", start) + 5;
  const close = sql.indexOf("$$", open);
  return sql.slice(open, close);
}

// ---------------------------------------------------------------------------
// Le signalement
// ---------------------------------------------------------------------------

test("le signalement ne vise que les demandes non abouties", () => {
  const scan = corps(SQL, "web_lead_retention_scan");
  assert.match(scan, /status in \('failed', 'review'\)/);
  assert.match(scan, /retention_alert_at is null/, "une demande déjà signalée ne doit pas l'être deux fois");
  assert.match(scan, /payload is not null/, "une demande sans contenu n'a plus rien à signaler");
});

test("le signalement n'efface rien", () => {
  const scan = corps(SQL, "web_lead_retention_scan");
  assert.doesNotMatch(scan, /set payload = null/, "signaler et effacer sont deux actes distincts");
  assert.doesNotMatch(scan, /\bdelete\b/i);
});

test("le signalement laisse une trace dans l'historique", () => {
  const scan = corps(SQL, "web_lead_retention_scan");
  assert.match(scan, /insert into public\.web_lead_events/);
  assert.match(scan, /'retention_warned'/);
});

// ---------------------------------------------------------------------------
// L'effacement
// ---------------------------------------------------------------------------

test("une demande aboutie ou écartée est effacée à son échéance normale", () => {
  const purge = corps(SQL, "purge_web_lead_payloads");
  assert.match(purge, /status in \('done', 'discarded'\) and payload_purge_after < now\(\)/);
});

test("une demande non aboutie n'est effacée qu'après signalement ET délai de grâce", () => {
  const purge = corps(SQL, "purge_web_lead_payloads");
  const branche = purge.slice(
    purge.indexOf("or (status in ('failed', 'review')"),
    purge.indexOf("returning id, organization_id")
  );
  assert.match(branche, /retention_alert_at is not null/, "sans signalement, aucun effacement");
  assert.match(branche, /retention_alert_at < now\(\) - grace/, "le délai court depuis le signalement");
});

test("une demande en échec jamais signalée ne peut pas être effacée", () => {
  // C'est l'exigence centrale : « une demande non traitée ne doit jamais
  // disparaître silencieusement ». Les deux branches de la clause doivent donc
  // couvrir des statuts disjoints, et celle des échecs exiger le signalement.
  const purge = corps(SQL, "purge_web_lead_payloads");
  const abouties = purge.match(/status in \('done', 'discarded'\)/g) || [];
  const echecs = purge.match(/status in \('failed', 'review'\)/g) || [];
  assert.equal(abouties.length, 1);
  assert.equal(echecs.length, 1);
  assert.equal(
    (purge.match(/retention_alert_at is not null/g) || []).length,
    1,
    "la seule branche qui touche aux échecs doit exiger le signalement"
  );
});

test("le délai de grâce a un plancher, un zéro effacerait tout immédiatement", () => {
  const purge = corps(SQL, "purge_web_lead_payloads");
  assert.match(purge, /greatest\(coalesce\(p_grace_days, 30\), 1\)/);
});

test("l'effacement laisse une trace, et ne supprime jamais la ligne", () => {
  const purge = corps(SQL, "purge_web_lead_payloads");
  assert.match(purge, /'payload_purged'/);
  assert.doesNotMatch(purge, /\bdelete\s+from\b/i, "la demande et son historique restent consultables");
});

test("l'ancienne purge sans paramètre est retirée avant la nouvelle", () => {
  // Les laisser coexister rendrait `purge_web_lead_payloads()` ambigu, le
  // paramètre ayant une valeur par défaut.
  const drop = SQL.indexOf("drop function if exists public.purge_web_lead_payloads();");
  const create = SQL.indexOf("create or replace function public.purge_web_lead_payloads(");
  assert.notEqual(drop, -1);
  assert.ok(drop < create, "la suppression doit précéder la création");
});

// ---------------------------------------------------------------------------
// La relance
// ---------------------------------------------------------------------------

test("relancer une demande dont le contenu est effacé est refusé tout de suite", () => {
  // Auparavant la relance repartait et échouait sept fois sans explication.
  const requeue = corps(SQL, "requeue_web_lead");
  assert.match(requeue, /if row_before\.payload is null then\s*\n\s*raise exception 'WEB_LEAD_PAYLOAD_PURGED'/);
});

test("une demande dont la fiche existe reste relançable", () => {
  // La version d'origine exigeait `opportunity_id is null`, ce qui bloquait
  // exactement le cas qu'il faut pouvoir débloquer : fiche créée, attribution
  // manquante. La reprise idempotente ne recréera pas la fiche.
  const requeue = corps(SQL, "requeue_web_lead");
  assert.doesNotMatch(requeue, /and opportunity_id is null/);
  assert.match(requeue, /status in \('failed', 'review'\)/);
  const ancienne = corps(INGEST, "requeue_web_lead");
  assert.match(ancienne, /and opportunity_id is null/, "la version d'origine bloquait bien ce cas");
});

test("une demande déjà aboutie n'est pas relançable", () => {
  const requeue = corps(SQL, "requeue_web_lead");
  assert.doesNotMatch(requeue, /'done'/, "relancer une demande aboutie n'aurait aucun sens");
});

// ---------------------------------------------------------------------------
// Rien ne disparaît
// ---------------------------------------------------------------------------

test("aucune fonction de la migration ne supprime de ligne", () => {
  for (const nom of [
    "attach_web_lead_opportunity",
    "link_web_lead_to_opportunity",
    "discard_web_lead",
    "requeue_web_lead",
    "web_lead_retention_scan",
    "purge_web_lead_payloads",
  ]) {
    assert.doesNotMatch(
      corps(SQL, nom),
      /\bdelete\s+from\b|\btruncate\b/i,
      `${nom} ne doit jamais supprimer de demande`
    );
  }
});

test("écarter une demande la sort de la file sans la perdre", () => {
  const discard = corps(SQL, "discard_web_lead");
  assert.match(discard, /set status = 'discarded'/);
  assert.match(discard, /opportunity_id is null/, "on n'écarte pas une demande dont la fiche existe");
  assert.match(discard, /'discarded'/);
  assert.match(discard, /p_author_id/, "l'auteur de la mise à l'écart doit être retenu");
});

test("le motif d'écartement est tronqué avant d'entrer en base", () => {
  const discard = corps(SQL, "discard_web_lead");
  assert.match(discard, /left\(nullif\(p_reason, ''\), 64\)/);
});

test("le rapprochement manuel ne modifie aucune donnée de la fiche existante", () => {
  const link = corps(SQL, "link_web_lead_to_opportunity");
  assert.doesNotMatch(link, /update public\.commercial_opportunities/, "aucune fusion automatique");
  assert.match(link, /organization_id/, "la fiche doit appartenir à la même organisation");
  assert.match(link, /WEB_LEAD_OPPORTUNITY_HORS_ORGANISATION/);
});

test("le rapprochement conserve la fiche déjà rattachée plutôt que de la remplacer", () => {
  const link = corps(SQL, "link_web_lead_to_opportunity");
  assert.match(link, /opportunity_id = coalesce\(opportunity_id, p_opportunity_id\)/);
});

// ---------------------------------------------------------------------------
// Requêtes de vérification à passer en base après application
// ---------------------------------------------------------------------------

test("la migration porte les requêtes de contrôle à exécuter en base", () => {
  // Faute de PostgreSQL local, la vérification réelle se fait en base. Elle
  // doit être écrite dans le fichier, pas laissée à la mémoire.
  assert.match(SQL, /Vérification préalable, à exécuter avant la migration/);
  assert.match(SQL, /group by 1 having count\(\*\) > 1/, "le contrôle de doublons préexistants doit être fourni");
});
