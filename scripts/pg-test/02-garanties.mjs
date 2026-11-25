/**
 * Garanties anti-doublons éprouvées sur une base PostgreSQL réelle.
 *
 * Les tests Node vérifient que le code coopère avec les contraintes. Ici c'est
 * la base elle-même qui est mise à l'épreuve : contraintes d'unicité,
 * déclencheurs, réservation concurrente, reprise après échec, conflits avec
 * des données historiques, et retour arrière.
 *
 *   bash scripts/pg-test/install.sh
 *   node scripts/pg-test/01-migrations.mjs
 *   node scripts/pg-test/02-garanties.mjs
 *
 * Les essais de concurrence ouvrent deux connexions distinctes et les font
 * réellement se croiser : une transaction est maintenue ouverte pendant que
 * l'autre travaille. Un essai séquentiel ne prouverait rien.
 */

import { ORG, attendre, chargerClient, connecter, journal } from "./lib.mjs";

const BASE = process.env.PG_TEST_DB || "mkl_test";
const log = journal();

const sql = await connecter(BASE);
const postgres = await chargerClient();

/** Code d'erreur PostgreSQL, et non son message : le message est traduisible. */
function code(error) {
  return error?.code || "";
}

async function echoue(libelle, action, attendu) {
  try {
    await action();
    log.ko(`${libelle} — aucune erreur alors que ${attendu} était attendu`);
    return null;
  } catch (error) {
    if (code(error) === attendu || String(error.message).includes(attendu)) {
      log.ok(`${libelle} (${code(error) || attendu})`);
      return error;
    }
    log.ko(`${libelle} — erreur inattendue`, `${code(error)} ${error.message}`);
    return error;
  }
}

async function reussit(libelle, action) {
  try {
    const resultat = await action();
    log.ok(libelle);
    return resultat;
  } catch (error) {
    log.ko(libelle, `${code(error)} ${error.message}`);
    return null;
  }
}

/** Remet les tables du module à zéro entre deux groupes d'essais. */
async function nettoyer() {
  await sql`delete from public.lead_attribution`;
  await sql`delete from public.commercial_appointments`;
  await sql`delete from public.web_lead_events`;
  await sql.unsafe("delete from public.web_lead_submissions");
  await sql`delete from public.commercial_opportunities`;
}

async function creerProspect({ submissionId = null, phone = "0612345678", nom = "Camille Durand" } = {}) {
  const extra = submissionId === null ? {} : { webLead: { submissionId } };
  const [row] = await sql`
    insert into public.commercial_opportunities (organization_id, name, phone, stage, source, extra)
    values (${ORG}, ${nom}, ${phone}, 'Nouveau', 'Prospect GG Ads', ${sql.json(extra)})
    returning id
  `;
  return row.id;
}

await nettoyer();

// ---------------------------------------------------------------------------
log.titre("1. Unicité de la fiche prospect");
// ---------------------------------------------------------------------------

const SOUMISSION = "lead-2026-11-05-abcdef01";
await reussit("une première fiche est acceptée", () => creerProspect({ submissionId: SOUMISSION }));
await echoue(
  "une seconde fiche portant le même identifiant de soumission est refusée",
  () => creerProspect({ submissionId: SOUMISSION }),
  "23505"
);

await reussit("un autre identifiant de soumission passe", () =>
  creerProspect({ submissionId: "lead-2026-11-05-abcdef02" })
);

// L'index est partiel : il ne doit gêner aucune fiche saisie à la main.
await reussit("une fiche saisie à la main est acceptée", () => creerProspect({ submissionId: null }));
await reussit("une deuxième fiche saisie à la main aussi", () => creerProspect({ submissionId: null }));
await reussit("une troisième, car l'index ne les regarde pas", () => creerProspect({ submissionId: null }));

// La chaîne vide n'est pas un identifiant : elle est écartée du prédicat, donc
// plusieurs fiches peuvent la porter sans se bloquer mutuellement.
await reussit("une fiche à identifiant vide passe", () => creerProspect({ submissionId: "" }));
await reussit("une deuxième aussi : la chaîne vide n'est pas une clé", () =>
  creerProspect({ submissionId: "" })
);

const [{ count: fichesSoumission }] = await sql`
  select count(*)::int as count from public.commercial_opportunities
   where extra #>> '{webLead,submissionId}' = ${SOUMISSION}
`;
if (fichesSoumission === 1) log.ok("une seule fiche porte l'identifiant de soumission");
else log.ko(`${fichesSoumission} fiches portent l'identifiant de soumission`);

// ---------------------------------------------------------------------------
log.titre("2. Unicité des contacts d'attribution, y compris avec un rôle NULL");
// ---------------------------------------------------------------------------

const prospect = await creerProspect({ submissionId: "lead-attribution-0001" });

async function creerContact({ role = null, soumission = "lead-attribution-0001", categorie = "google_ads" } = {}) {
  const [row] = await sql`
    insert into public.lead_attribution (
      organization_id, opportunity_id, touched_at, origin_channel, origin_category,
      submission_id, touch_role, evidence
    )
    values (
      ${ORG}, ${prospect}, now(), 'web_ingest', ${categorie},
      ${soumission}, ${role}, 'gclid'
    )
    returning id
  `;
  return row.id;
}

await reussit("un contact unique, sans rôle, est accepté", () => creerContact({ role: null }));
await echoue(
  "le même contact sans rôle est refusé une seconde fois",
  () => creerContact({ role: null }),
  "23505"
);
log.info("c'est le piège visé : NULL n'étant jamais égal à NULL, un index sur");
log.info("`touch_role` brut aurait laissé passer cette seconde ligne.");

await reussit("un premier contact nommé est accepté", () => creerContact({ role: "premier" }));
await reussit("un dernier contact nommé est accepté", () => creerContact({ role: "dernier" }));
await echoue("le premier contact ne peut pas être écrit deux fois", () => creerContact({ role: "premier" }), "23505");

await echoue(
  "un rôle hors de la liste est refusé par la contrainte",
  () => creerContact({ role: "intermediaire", soumission: "lead-attribution-0002" }),
  "23514"
);

// ---------------------------------------------------------------------------
log.titre("3. La table d'attribution n'est qu'en ajout");
// ---------------------------------------------------------------------------

await echoue(
  "un contact déjà écrit ne peut pas être modifié",
  () => sql`update public.lead_attribution set origin_category = 'prospection' where opportunity_id = ${prospect}`,
  "LEAD_ATTRIBUTION_APPEND_ONLY"
);

// ---------------------------------------------------------------------------
log.titre("4. Unicité du rendez-vous pris en ligne");
// ---------------------------------------------------------------------------

async function creerRdv(soumission) {
  const [row] = await sql`
    insert into public.commercial_appointments (
      organization_id, opportunity_id, prospect_name, starts_at, duration_minutes, status, extra
    )
    values (
      ${ORG}, ${prospect}, 'Camille Durand', now() + interval '10 days', 60, 'À dispatcher',
      ${sql.json({ webLead: { submissionId: soumission } })}
    )
    returning id
  `;
  return row.id;
}

await reussit("un rendez-vous est accepté", () => creerRdv("rdv-2026-11-05-aaaa0001"));
await echoue(
  "le même rendez-vous est refusé une seconde fois",
  () => creerRdv("rdv-2026-11-05-aaaa0001"),
  "23505"
);

// ---------------------------------------------------------------------------
log.titre("5. Réservation concurrente de la file");
// ---------------------------------------------------------------------------

await nettoyer();

for (let i = 1; i <= 6; i += 1) {
  await sql`
    select public.enqueue_web_lead(
      ${ORG}, ${`demande-concurrence-000${i}`}, 'lead',
      ${sql.json({ submissionId: `demande-concurrence-000${i}`, kind: "lead", phone: "0612345678" })},
      now(), 30
    )
  `;
}

const sqlA = postgres({ ...sql.options, max: 1, onnotice: () => {} });
const sqlB = postgres({ ...sql.options, max: 1, onnotice: () => {} });

const prisesA = [];
const prisesB = [];
await Promise.all([
  (async () => {
    const rows = await sqlA`select id from public.reserve_web_leads('ouvrier-a', 3)`;
    prisesA.push(...rows.map(row => row.id));
  })(),
  (async () => {
    const rows = await sqlB`select id from public.reserve_web_leads('ouvrier-b', 3)`;
    prisesB.push(...rows.map(row => row.id));
  })(),
]);

const croisement = prisesA.filter(id => prisesB.includes(id));
if (croisement.length === 0) {
  log.ok(`deux traitements simultanés prennent des demandes disjointes (${prisesA.length} et ${prisesB.length})`);
} else {
  log.ko(`${croisement.length} demande(s) prise(s) deux fois : la réservation n'est pas atomique`);
}

// ---------------------------------------------------------------------------
log.titre("6. Course réelle sur la création de la fiche");
// ---------------------------------------------------------------------------

await nettoyer();
const COURSE = "lead-course-00000001";

let aPose = false;
let resultatA = null;
let resultatB = null;

const transactionA = sqlA.begin(async tx => {
  await tx`
    insert into public.commercial_opportunities (organization_id, name, phone, stage, extra)
    values (${ORG}, 'Course A', '0612345678', 'Nouveau', ${sqlA.json({ webLead: { submissionId: COURSE } })})
  `;
  aPose = true;
  // Transaction maintenue ouverte : B va se heurter au verrou d'unicité et
  // attendre, exactement comme deux traitements simultanés en production.
  await attendre(() => resultatB === "en attente", { essais: 50, pause: 20 });
  await new Promise(resolve => setTimeout(resolve, 150));
  resultatA = "validée";
});

await attendre(() => aPose);
resultatB = "en attente";
const transactionB = (async () => {
  try {
    await sqlB`
      insert into public.commercial_opportunities (organization_id, name, phone, stage, extra)
      values (${ORG}, 'Course B', '0612345678', 'Nouveau', ${sqlB.json({ webLead: { submissionId: COURSE } })})
    `;
    resultatB = "acceptée";
  } catch (error) {
    resultatB = code(error);
  }
})();

await Promise.all([transactionA, transactionB]);

if (resultatB === "23505") {
  log.ok("la seconde transaction est refusée par l'index, après avoir attendu la première");
} else {
  log.ko(`la seconde transaction a abouti à « ${resultatB} » au lieu d'un conflit d'unicité`);
}

const [{ count: apresCourse }] = await sql`
  select count(*)::int as count from public.commercial_opportunities
   where extra #>> '{webLead,submissionId}' = ${COURSE}
`;
if (apresCourse === 1) log.ok("une seule fiche subsiste après la course");
else log.ko(`${apresCourse} fiches après la course`);

await sqlA.end();
await sqlB.end();

// ---------------------------------------------------------------------------
log.titre("7. Reprise après échec partiel");
// ---------------------------------------------------------------------------

await nettoyer();
const REPRISE = "lead-reprise-00000001";

const [recu] = await sql`
  select * from public.enqueue_web_lead(
    ${ORG}, ${REPRISE}, 'lead',
    ${sql.json({ submissionId: REPRISE, kind: "lead", phone: "0612345678" })},
    now(), 30
  )
`;
const demande = recu.id;

await sql`select public.reserve_web_leads('reprise', 10)`;
const fiche = await creerProspect({ submissionId: REPRISE });
await reussit("la fiche créée est rattachée à la demande", () =>
  sql`select public.attach_web_lead_opportunity(${demande}, ${fiche})`
);
await reussit("rattacher la même fiche une seconde fois ne fait rien", () =>
  sql`select public.attach_web_lead_opportunity(${demande}, ${fiche})`
);

const autreFiche = await creerProspect({ submissionId: "lead-autre-00000001", phone: "0600000000" });
await echoue(
  "rattacher une autre fiche à la même demande est refusé",
  () => sql`select public.attach_web_lead_opportunity(${demande}, ${autreFiche})`,
  "WEB_LEAD_ALREADY_INTEGRATED"
);

// Échec de la clôture : la demande repart en attente, la fiche reste.
await sql`select public.settle_web_lead(${demande}, 'retry', null, null, '{}'::uuid[], 'COUPURE')`;
const [etat] = await sql`select status, attempts, opportunity_id from public.web_lead_submissions where id = ${demande}`;
if (etat.status === "pending" && etat.opportunity_id === fiche) {
  log.ok("après échec, la demande est en attente et garde sa fiche");
} else {
  log.ko(`état inattendu : ${etat.status}, fiche ${etat.opportunity_id}`);
}

// Une demande encore en attente se relance d'elle-même : la relance manuelle
// est réservée aux demandes en échec ou en revue, qui sont celles que l'écran
// d'administration propose. Autoriser le reste remettrait le compteur de
// tentatives à zéro sur une demande déjà planifiée.
await echoue(
  "relancer une demande encore en attente est refusé",
  () => sql`select public.requeue_web_lead(${demande}, null)`,
  "WEB_LEAD_NOT_REQUEUABLE"
);

// ---------------------------------------------------------------------------
log.titre("8. Sept échecs, puis conservation et relance");
// ---------------------------------------------------------------------------

for (let i = 0; i < 8; i += 1) {
  // Le report exponentiel pousse la prochaine tentative jusqu'à 24 heures.
  // Sans avancer l'échéance, la réservation ne trouverait rien et le compteur
  // de tentatives n'avancerait pas : on simule le temps qui passe.
  await sql`update public.web_lead_submissions set next_attempt_at = now() - interval '1 second' where id = ${demande}`;
  await sql`select public.reserve_web_leads('acharnement', 10)`;
  await sql`select public.settle_web_lead(${demande}, 'retry', null, null, '{}'::uuid[], 'COUPURE')`;
}

const [abandon] = await sql`
  select status, attempts, payload is not null as contenu, last_error_code
    from public.web_lead_submissions where id = ${demande}
`;
if (abandon.status === "failed") log.ok(`la demande passe en échec après ${abandon.attempts} tentatives`);
else log.ko(`statut ${abandon.status} au lieu de « failed »`);
if (abandon.contenu) log.ok("son contenu brut est conservé, la relance reste possible");
else log.ko("son contenu brut a disparu");
if (abandon.last_error_code === "COUPURE") log.ok("le motif technique est retenu");
else log.ko(`motif « ${abandon.last_error_code} »`);

const [{ count: fichesReprise }] = await sql`
  select count(*)::int as count from public.commercial_opportunities
   where extra #>> '{webLead,submissionId}' = ${REPRISE}
`;
if (fichesReprise === 1) log.ok("neuf échecs n'ont produit qu'une seule fiche");
else log.ko(`${fichesReprise} fiches après neuf échecs`);

await reussit("un administrateur peut relancer la demande abandonnée", () =>
  sql`select public.requeue_web_lead(${demande}, null)`
);

// ---------------------------------------------------------------------------
log.titre("9. Conservation : signalement puis délai de grâce");
// ---------------------------------------------------------------------------

await sql`
  update public.web_lead_submissions
     set status = 'failed', payload_purge_after = now() - interval '1 day'
   where id = ${demande}
`;

const [{ purge: purgeAvantSignalement }] = await sql`select public.purge_web_lead_payloads(30) as purge`;
const [avant] = await sql`select payload is not null as contenu from public.web_lead_submissions where id = ${demande}`;
if (purgeAvantSignalement === 0 && avant.contenu) {
  log.ok("une demande en échec non signalée n'est pas effacée, même échue");
} else {
  log.ko("une demande en échec a été effacée sans signalement");
}

const [{ scan }] = await sql`select public.web_lead_retention_scan() as scan`;
if (scan === 1) log.ok("le signalement de fin de conservation est émis");
else log.ko(`${scan} signalement(s) émis au lieu de 1`);

const [{ purge: purgePendantGrace }] = await sql`select public.purge_web_lead_payloads(30) as purge`;
if (purgePendantGrace === 0) log.ok("pendant le délai de grâce, rien n'est effacé");
else log.ko("effacement pendant le délai de grâce");

await sql`
  update public.web_lead_submissions
     set retention_alert_at = now() - interval '31 days'
   where id = ${demande}
`;
const [{ purge: purgeApresGrace }] = await sql`select public.purge_web_lead_payloads(30) as purge`;
if (purgeApresGrace === 1) log.ok("après le délai de grâce, le contenu brut est effacé");
else log.ko(`${purgeApresGrace} effacement(s) après le délai de grâce`);

const [apres] = await sql`
  select payload is not null as contenu, payload_purged_at is not null as trace, opportunity_id
    from public.web_lead_submissions where id = ${demande}
`;
if (!apres.contenu && apres.trace) log.ok("la ligne et sa date d'effacement subsistent");
else log.ko("la trace de l'effacement manque");

const [{ count: ficheIntacte }] = await sql`
  select count(*)::int as count from public.commercial_opportunities where id = ${fiche}
`;
if (ficheIntacte === 1) {
  log.ok("la fiche commerciale n'est pas touchée par la purge technique");
} else {
  log.ko("la purge technique a atteint une fiche commerciale");
}

await echoue(
  "relancer une demande dont le contenu est effacé est refusé immédiatement",
  () => sql`select public.requeue_web_lead(${demande}, null)`,
  "WEB_LEAD_PAYLOAD_PURGED"
);

const historique = await sql`
  select kind from public.web_lead_events where submission_pk = ${demande} order by created_at
`;
const motifs = historique.map(row => row.kind);
for (const attendu of ["received", "opportunity_attached", "retry_scheduled", "failed", "requeued", "retention_warned", "payload_purged"]) {
  if (motifs.includes(attendu)) log.ok(`l'historique retient « ${attendu} »`);
  else log.ko(`l'historique ne retient pas « ${attendu} »`);
}

await echoue(
  "l'historique ne peut pas être réécrit",
  () => sql`update public.web_lead_events set kind = 'succeeded' where submission_pk = ${demande}`,
  "WEB_LEAD_EVENTS_APPEND_ONLY"
);

// ---------------------------------------------------------------------------
log.titre("10. Rapprochement manuel et mise à l'écart");
// ---------------------------------------------------------------------------

await nettoyer();

const [recuRevue] = await sql`
  select * from public.enqueue_web_lead(
    ${ORG}, ${"lead-revue-00000001"}, 'lead',
    ${sql.json({ submissionId: "lead-revue-00000001", kind: "lead", phone: "0612345678" })},
    now(), 30
  )
`;
await sql`select public.reserve_web_leads('revue', 10)`;
await sql`select public.settle_web_lead(${recuRevue.id}, 'review', null, 'review', '{}'::uuid[], null)`;

const ficheExistante = await creerProspect({ submissionId: null, nom: "Camille D." });
await reussit("une demande en revue se rattache à une fiche existante", () =>
  sql`select public.link_web_lead_to_opportunity(${recuRevue.id}, ${ficheExistante}, null)`
);

const [lie] = await sql`select status, opportunity_id from public.web_lead_submissions where id = ${recuRevue.id}`;
if (lie.status === "done" && lie.opportunity_id === ficheExistante) {
  log.ok("la demande est considérée comme traitée et pointe la bonne fiche");
} else {
  log.ko(`état ${lie.status}, fiche ${lie.opportunity_id}`);
}

// Aucune donnée de la fiche existante ne doit avoir changé.
const [inchangee] = await sql`select name, phone, source from public.commercial_opportunities where id = ${ficheExistante}`;
if (inchangee.name === "Camille D." && inchangee.phone === "0612345678") {
  log.ok("la fiche existante n'a subi aucune modification");
} else {
  log.ko("la fiche existante a été modifiée par le rapprochement");
}

const [recuEcart] = await sql`
  select * from public.enqueue_web_lead(
    ${ORG}, ${"lead-ecart-000000001"}, 'lead',
    ${sql.json({ submissionId: "lead-ecart-000000001", kind: "lead", phone: "0700000000" })},
    now(), 30
  )
`;
await sql`select public.reserve_web_leads('ecart', 10)`;
await sql`select public.settle_web_lead(${recuEcart.id}, 'review', null, 'review', '{}'::uuid[], null)`;
await reussit("une demande sans suite peut être écartée", () =>
  sql`select public.discard_web_lead(${recuEcart.id}, null, 'test')`
);
const [{ count: resteEcart }] = await sql`
  select count(*)::int as count from public.web_lead_submissions where id = ${recuEcart.id}
`;
if (resteEcart === 1) log.ok("une demande écartée reste consultable, elle n'est pas supprimée");
else log.ko("la demande écartée a disparu");

// ---------------------------------------------------------------------------
log.titre("11. Conflit avec des données historiques");
// ---------------------------------------------------------------------------

await nettoyer();
await sql`drop index if exists public.commercial_opportunities_web_lead_idx`;

const DOUBLON = "lead-historique-0001";
await creerProspect({ submissionId: DOUBLON, nom: "Doublon A" });
await creerProspect({ submissionId: DOUBLON, nom: "Doublon B" });

const detectes = await sql`
  select extra #>> '{webLead,submissionId}' as soumission, count(*)::int as nombre
    from public.commercial_opportunities
   where nullif(extra #>> '{webLead,submissionId}', '') is not null
   group by 1 having count(*) > 1
`;
if (detectes.length === 1 && detectes[0].nombre === 2) {
  log.ok("la requête de contrôle préalable détecte bien le doublon historique");
} else {
  log.ko("la requête de contrôle préalable ne détecte pas le doublon");
}

await echoue(
  "la création de l'index échoue tant que le doublon existe",
  () => sql.unsafe(`
    create unique index commercial_opportunities_web_lead_idx
      on public.commercial_opportunities (organization_id, (extra #>> '{webLead,submissionId}'))
     where nullif(extra #>> '{webLead,submissionId}', '') is not null
  `),
  "23505"
);
log.info("c'est pourquoi la migration porte cette requête en tête : l'appliquer");
log.info("sans l'avoir passée échouerait au milieu.");

await sql`delete from public.commercial_opportunities where name = 'Doublon B'`;
await reussit("après résolution du doublon, l'index se crée", () =>
  sql.unsafe(`
    create unique index commercial_opportunities_web_lead_idx
      on public.commercial_opportunities (organization_id, (extra #>> '{webLead,submissionId}'))
     where nullif(extra #>> '{webLead,submissionId}', '') is not null
  `)
);

// ---------------------------------------------------------------------------
log.titre("12. Retour arrière");
// ---------------------------------------------------------------------------

await reussit("les index anti-doublons se retirent", () =>
  sql.unsafe(`
    drop index if exists public.commercial_opportunities_web_lead_idx;
    drop index if exists public.commercial_appointments_web_lead_idx;
  `)
);

await reussit("les fonctions ajoutées se retirent", () =>
  sql.unsafe(`
    drop function if exists public.attach_web_lead_opportunity(uuid, uuid);
    drop function if exists public.link_web_lead_to_opportunity(uuid, uuid, uuid);
    drop function if exists public.discard_web_lead(uuid, uuid, text);
    drop function if exists public.web_lead_retention_scan();
  `)
);

await reussit("la colonne de signalement se retire sans perte de données", () =>
  sql.unsafe("alter table public.web_lead_submissions drop column if exists retention_alert_at")
);

const [{ count: demandesApresRetour }] = await sql`
  select count(*)::int as count from public.web_lead_submissions
`;
log.info(`${demandesApresRetour} demande(s) toujours en base après le retour arrière`);

// La signature prend le type de la ligne, pas un identifiant : c'est une
// fonction appelée depuis une politique RLS. C'est précisément pourquoi le
// bloc de durcissement s'appuie sur `oid::regprocedure` plutôt que sur un nom
// écrit à la main, qui aurait manqué ces quatre fonctions.
await reussit("le durcissement de search_path se défait fonction par fonction", () =>
  sql.unsafe("alter function public.can_access_client_row(public.clients) reset search_path")
);

const [apresReset] = await sql`
  select coalesce(p.proconfig, '{}'::text[]) as config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_access_client_row'
   limit 1
`;
if (!apresReset.config.some(option => option.startsWith("search_path="))) {
  log.ok("la fonction retrouve son état antérieur");
} else {
  log.ko("le retour arrière de search_path n'a pas pris effet");
}

// Le vrai retour arrière complet : tout dans une transaction, puis annulation.
log.titre("13. Migration entière dans une transaction annulable");

const avantTransaction = (
  await sql`select count(*)::int as count from pg_indexes where indexname = 'commercial_opportunities_web_lead_idx'`
)[0].count;

try {
  await sql.begin(async tx => {
    await tx.unsafe(`
      create unique index commercial_opportunities_web_lead_idx
        on public.commercial_opportunities (organization_id, (extra #>> '{webLead,submissionId}'))
       where nullif(extra #>> '{webLead,submissionId}', '') is not null;
    `);
    const [dedans] = await tx`select count(*)::int as count from pg_indexes where indexname = 'commercial_opportunities_web_lead_idx'`;
    if (dedans.count !== 1) throw new Error("index non visible dans sa propre transaction");
    throw new Error("ANNULATION_VOULUE");
  });
} catch (error) {
  if (!String(error.message).includes("ANNULATION_VOULUE")) {
    log.ko("la transaction d'essai a échoué pour une autre raison", error.message);
  }
}

const apresTransaction = (
  await sql`select count(*)::int as count from pg_indexes where indexname = 'commercial_opportunities_web_lead_idx'`
)[0].count;

if (avantTransaction === 0 && apresTransaction === 0) {
  log.ok("une migration annulée ne laisse aucune trace : le retour arrière est complet");
} else {
  log.ko(`index présent avant ${avantTransaction}, après ${apresTransaction}`);
}
log.info("`create index` est transactionnel en PostgreSQL, à l'exception de");
log.info("`create index concurrently`, que nos migrations n'utilisent pas.");

await sql.end();
process.exitCode = log.bilan() ? 0 : 1;
