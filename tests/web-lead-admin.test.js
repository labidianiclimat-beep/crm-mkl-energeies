import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  WEB_LEAD_ACTIONS,
  WEB_LEAD_ADMIN_ROLES,
  canReviewWebLeads,
  maskEmail,
  maskPhone,
  planWebLeadAction,
  webLeadBacklogRow,
  webLeadErrorLabel,
  webLeadEventRow,
} from "../app/lib/web-lead-admin.js";

/**
 * Suivi des demandes du site : autorisations, projection et actions.
 *
 * Deux exigences se contredisent en apparence et sont vérifiées ensemble :
 * l'écran doit permettre de reconnaître une personne pour débloquer sa
 * demande, et il ne doit pas devenir une source de coordonnées clients.
 */

const DEMANDE = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  submission_id: "lead-2026-11-05-abcdef01",
  kind: "lead",
  status: "failed",
  attempts: 7,
  received_at: "2026-11-05T09:30:00.000Z",
  last_error_code: "PROSPECT_SANS_IDENTIFIANT",
  dedup_decision: null,
  dedup_candidate_ids: [],
  opportunity_id: null,
  payload_purge_after: "2026-12-05T09:30:00.000Z",
  retention_alert_at: null,
  payload: {
    submissionId: "lead-2026-11-05-abcdef01",
    phone: "0612345678",
    email: "camille.durand@example.test",
    firstName: "Camille",
    lastName: "Durand",
    name: "Camille Durand",
    postalCode: "13100",
    projects: ["pac"],
    intent: "devis",
    message: "Je souhaite une étude pour ma maison au 12 rue des Lilas.",
  },
};

// ---------------------------------------------------------------------------
// Autorisations
// ---------------------------------------------------------------------------

test("seuls les administrateurs et le responsable prospection accèdent au suivi", () => {
  for (const role of WEB_LEAD_ADMIN_ROLES) {
    assert.equal(canReviewWebLeads({ role }), true, `${role} doit pouvoir débloquer une demande`);
  }
  for (const role of ["Commercial", "Prospecteur terrain", "Technicien", "Secrétariat", "Responsable technique"]) {
    assert.equal(canReviewWebLeads({ role }), false, `${role} ne doit pas y accéder`);
  }
});

test("le responsable commercial reste exclu, comme sur le tableau de dispatch", () => {
  // Choix d'organisation confirmé : les demandes du site arrivent sans
  // commercial et leur attribution appartient au responsable prospection et à
  // la direction. Les deux écrans doivent dire la même chose.
  assert.equal(canReviewWebLeads({ role: "Responsable commercial" }), false);
});

test("un profil sans rôle n'accède à rien", () => {
  assert.equal(canReviewWebLeads(null), false);
  assert.equal(canReviewWebLeads({}), false);
  assert.equal(canReviewWebLeads({ role: "" }), false);
});

// ---------------------------------------------------------------------------
// Masquage des coordonnées
// ---------------------------------------------------------------------------

test("le téléphone affiché ne permet pas de rappeler depuis l'écran", () => {
  const masque = maskPhone("0612345678");
  assert.equal(masque, "06 •••••• 78");
  assert.equal(masque.includes("1234"), false);
});

test("l'e-mail affiché ne livre que l'initiale et le domaine", () => {
  assert.equal(maskEmail("camille.durand@example.test"), "c•••@example.test");
  assert.equal(maskEmail("CAMILLE@Example.TEST"), "c•••@example.test");
});

test("un téléphone trop court est entièrement masqué plutôt que partiellement", () => {
  assert.equal(maskPhone("0612"), "••••");
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone(null), "");
});

test("un e-mail illisible ne laisse rien passer", () => {
  assert.equal(maskEmail("@example.test"), "•••");
  assert.equal(maskEmail("pas-un-email"), "•••");
  assert.equal(maskEmail(""), "");
});

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

test("la ligne affichée ne contient ni nom, ni numéro, ni e-mail en clair", () => {
  const ligne = webLeadBacklogRow(DEMANDE);
  const serialise = JSON.stringify(ligne);

  for (const secret of [
    "0612345678",
    "camille.durand@example.test",
    "Camille",
    "Durand",
    "rue des Lilas",
  ]) {
    assert.equal(
      serialise.includes(secret),
      false,
      `la projection ne doit pas transporter « ${secret} »`
    );
  }
});

test("le message libre de la demande n'est jamais affiché", () => {
  // Un message libre peut contenir une adresse complète, un numéro, une
  // situation personnelle. Il n'a rien à faire sur un écran de déblocage.
  const ligne = webLeadBacklogRow(DEMANDE);
  assert.equal("message" in (ligne.hint || {}), false);
  assert.equal(JSON.stringify(ligne).includes("souhaite une étude"), false);
});

test("la ligne porte ce qu'il faut pour décider", () => {
  const ligne = webLeadBacklogRow(DEMANDE);
  assert.equal(ligne.status, "failed");
  assert.equal(ligne.statusLabel, "En échec");
  assert.equal(ligne.attempts, 7);
  assert.equal(ligne.errorCode, "PROSPECT_SANS_IDENTIFIANT");
  assert.ok(ligne.errorLabel.length > 0, "le motif technique doit être expliqué");
  assert.equal(ligne.hint.postalCode, "13100");
  assert.deepEqual(ligne.hint.projects, ["pac"]);
  assert.equal(ligne.canRequeue, true);
});

test("une demande dont le contenu est purgé reste visible mais n'est plus relançable", () => {
  const ligne = webLeadBacklogRow({ ...DEMANDE, payload: null });
  assert.equal(ligne.payloadPurged, true);
  assert.equal(ligne.canRequeue, false, "relancer sans contenu échouerait sept fois pour rien");
  assert.equal(ligne.hint, null);
  // Elle doit rester consultable : c'est la trace qu'une demande a été perdue.
  assert.equal(ligne.submissionId, DEMANDE.submission_id);
  assert.equal(ligne.canLink, true, "le rapprochement manuel reste possible sans le contenu");
});

test("une demande déjà pourvue d'une fiche l'annonce, pour que la relance ne fasse pas peur", () => {
  const ligne = webLeadBacklogRow({ ...DEMANDE, opportunity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  assert.equal(ligne.prospectCreated, true);
  assert.equal(ligne.canRequeue, true);
  assert.equal(ligne.canDiscard, false, "on n'écarte pas une demande dont la fiche existe");
});

test("une demande aboutie n'offre aucune action", () => {
  const ligne = webLeadBacklogRow({ ...DEMANDE, status: "done", opportunity_id: "x" });
  assert.equal(ligne.canRequeue, false);
  assert.equal(ligne.canLink, false);
  assert.equal(ligne.canDiscard, false);
});

test("les fiches proposées au rapprochement sont celles que le CRM montre déjà", () => {
  const ligne = webLeadBacklogRow(
    { ...DEMANDE, status: "review", dedup_candidate_ids: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] },
    { candidates: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Camille Durand", created_at: "2026-10-01T10:00:00.000Z" }] }
  );
  assert.equal(ligne.candidates.length, 1);
  // Le nom du prospect existant est visible : il l'est déjà dans le module
  // Prospects, et sans lui le rapprochement serait un tirage au sort.
  assert.equal(ligne.candidates[0].name, "Camille Durand");
  assert.equal("phone" in ligne.candidates[0], false, "une fiche candidate n'apporte pas ses coordonnées ici");
});

test("un motif inconnu est signalé comme tel au lieu d'être inventé", () => {
  assert.equal(webLeadErrorLabel("UNE_PANNE_INEDITE"), "Erreur technique non répertoriée.");
  assert.equal(webLeadErrorLabel(""), "");
  assert.equal(webLeadErrorLabel(null), "");
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

test("chaque action connue désigne une fonction d'écriture et une seule", () => {
  const rpcs = WEB_LEAD_ACTIONS.map(action =>
    planWebLeadAction({ action, submissionId: "x", opportunityId: "y" }).rpc
  );
  assert.deepEqual(rpcs, ["requeue_web_lead", "link_web_lead_to_opportunity", "discard_web_lead"]);
  assert.equal(new Set(rpcs).size, rpcs.length, "deux actions ne doivent pas appeler la même fonction");
});

test("une action inconnue est refusée avant tout appel à la base", () => {
  const plan = planWebLeadAction({ action: "supprimer", submissionId: "x" });
  assert.equal(plan.ok, false);
  assert.equal(plan.rpc, undefined, "aucune fonction ne doit être désignée");
});

test("un rapprochement sans fiche cible est refusé", () => {
  const plan = planWebLeadAction({ action: "rattacher", submissionId: "x" });
  assert.equal(plan.ok, false);
  assert.match(plan.error, /fiche/i);
});

test("une action sans demande est refusée", () => {
  assert.equal(planWebLeadAction({ action: "relancer", submissionId: "" }).ok, false);
});

test("le motif d'écartement est tronqué, jamais recopié intégralement", () => {
  const plan = planWebLeadAction({
    action: "ecarter",
    submissionId: "x",
    reason: "x".repeat(400),
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.body.p_reason.length, 64);
});

test("l'auteur de l'action est transmis, pour que l'historique le retienne", () => {
  const plan = planWebLeadAction({ action: "relancer", submissionId: "x", authorId: "auteur-1" });
  assert.equal(plan.body.p_author_id, "auteur-1");
});

test("un motif d'historique inconnu reste affiché tel quel", () => {
  assert.equal(webLeadEventRow({ kind: "received" }).label, "Demande reçue");
  assert.equal(webLeadEventRow({ kind: "motif_futur" }).label, "motif_futur");
});

// ---------------------------------------------------------------------------
// Cohérence avec le reste
// ---------------------------------------------------------------------------

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20261105_web_lead_idempotence.sql", import.meta.url),
  "utf8"
);

test("toutes les fonctions appelées par l'écran existent dans la migration", () => {
  for (const action of WEB_LEAD_ACTIONS) {
    const { rpc } = planWebLeadAction({ action, submissionId: "x", opportunityId: "y" });
    assert.match(
      MIGRATION,
      new RegExp(`create or replace function public\\.${rpc}\\b`),
      `${rpc} est appelée par l'écran mais absente de la migration`
    );
  }
});

test("chaque fonction appelée est accordée au rôle de service, et refusée aux autres", () => {
  for (const action of WEB_LEAD_ACTIONS) {
    const { rpc } = planWebLeadAction({ action, submissionId: "x", opportunityId: "y" });
    assert.match(MIGRATION, new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\) to service_role`), rpc);
    assert.match(MIGRATION, new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from public, anon, authenticated`), rpc);
  }
});

test("les motifs d'historique affichés sont ceux que la base accepte", () => {
  const clause = MIGRATION.slice(
    MIGRATION.indexOf("add constraint web_lead_events_kind_chk"),
    MIGRATION.indexOf("-- 3. Rattachement précoce")
  );
  const acceptes = [...clause.matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
  assert.ok(acceptes.length >= 13, "la liste des motifs n'a pas été relue correctement");

  for (const motif of acceptes) {
    assert.notEqual(
      webLeadEventRow({ kind: motif }).label,
      motif,
      `le motif « ${motif} » est accepté en base mais n'a pas de traduction`
    );
  }
});
