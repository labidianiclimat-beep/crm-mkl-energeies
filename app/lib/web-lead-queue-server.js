import { normalizeEmail, normalizePhoneFr } from "./lead-identity.js";
import { serviceRequest } from "./supabase-server.js";
import {
  appointmentRowFromWebLead,
  attributionTouchesFromWebLead,
  planWebLeadIntegration,
  prospectRowFromWebLead,
  webLeadOrigin,
} from "./web-lead-consumer.js";

/**
 * Traitement de la file des demandes du site.
 *
 * Appelé à deux moments : juste après une réception, pour que le prospect
 * apparaisse tout de suite, et par le cron, qui rattrape les réessais. La
 * fréquence du cron ne conditionne donc pas le délai normal d'arrivée.
 *
 * La réservation passe par `reserve_web_leads`, qui pose un verrou en base.
 * Deux exécutions simultanées ne peuvent pas prendre la même demande, ce qu'un
 * PATCH suivi d'un SELECT ne garantirait pas.
 *
 * L'intégration écrit dans trois tables et ne peut pas être une transaction
 * unique, PostgREST ouvrant une transaction par requête. Elle est donc écrite
 * pour être rejouable : chaque étape constate d'abord ce qui existe et n'écrit
 * que ce qui manque. Une tentative interrompue, où que ce soit, est reprise et
 * jamais recommencée.
 *
 * La garantie finale n'est pas ici mais en base. Les index uniques de
 * 20261105_web_lead_idempotence.sql rendent la seconde fiche et le second
 * rendez-vous impossibles, même si ce code se trompe, même si deux traitements
 * se croisent. Le code évite le conflit ; l'index l'interdit.
 *
 * `request` est injectable pour que les tests puissent interrompre
 * l'intégration après chaque étape et faire se croiser deux traitements.
 */

const DEFAULT_BATCH = 20;

/**
 * Conflit d'unicité. PostgREST répond 409 et relaie le code PostgreSQL 23505 :
 * la ligne voulue existe déjà, le travail est fait et non à refaire.
 */
export function isUniqueViolation(error) {
  return error?.code === "23505" || error?.status === 409;
}

export function submissionKeyOf(submission) {
  return String(submission?.payload?.submissionId || submission?.submission_id || "").trim();
}

export function webLeadIntegrator({ request = serviceRequest } = {}) {
  /**
   * Prospects partageant le téléphone ou l'e-mail. Ce ne sont que des
   * candidats à un rapprochement : aucune fusion n'est faite à partir d'eux.
   */
  async function findCandidates({ organizationId, phone, email }) {
    const filters = [];
    if (phone) filters.push(`phone.eq.${encodeURIComponent(phone)}`);
    if (email) filters.push(`email.eq.${encodeURIComponent(email)}`);
    if (filters.length === 0) return [];
    const rows = await request(
      "/rest/v1/commercial_opportunities?select=id,phone,email,name,created_at" +
        `&organization_id=eq.${organizationId}&or=(${filters.join(",")})&limit=50`
    );
    return (rows || []).map(row => ({
      id: row.id,
      phone: row.phone || "",
      email: row.email || "",
      name: row.name || "",
      createdAt: row.created_at,
    }));
  }

  /**
   * Fiche déjà créée pour cette demande, s'il en existe une. Interrogée sur la
   * même clé que l'index unique, il ne peut donc y avoir qu'une réponse.
   */
  async function findProspectOfSubmission({ organizationId, submissionId }) {
    if (!submissionId) return null;
    const rows = await request(
      "/rest/v1/commercial_opportunities?select=id&limit=1" +
        `&organization_id=eq.${organizationId}` +
        `&extra->webLead->>submissionId=eq.${encodeURIComponent(submissionId)}`
    );
    return (Array.isArray(rows) ? rows[0]?.id : null) || null;
  }

  /** Rôles déjà enregistrés. La chaîne vide représente le rôle absent. */
  async function existingTouchRoles({ organizationId, submissionId }) {
    if (!submissionId) return new Set();
    const rows = await request(
      "/rest/v1/lead_attribution?select=touch_role" +
        `&organization_id=eq.${organizationId}` +
        `&submission_id=eq.${encodeURIComponent(submissionId)}`
    );
    return new Set((rows || []).map(row => String(row.touch_role || "")));
  }

  async function appointmentExists({ organizationId, submissionId }) {
    if (!submissionId) return false;
    const rows = await request(
      "/rest/v1/commercial_appointments?select=id&limit=1" +
        `&organization_id=eq.${organizationId}` +
        `&extra->webLead->>submissionId=eq.${encodeURIComponent(submissionId)}`
    );
    return Boolean(Array.isArray(rows) ? rows[0]?.id : null);
  }

  async function settle(id, outcome, extra = {}) {
    await request("/rest/v1/rpc/settle_web_lead", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        p_id: id,
        p_outcome: outcome,
        p_opportunity_id: extra.opportunityId || null,
        p_dedup_decision: extra.decision || null,
        p_dedup_candidate_ids: extra.candidateIds || [],
        p_error_code: extra.errorCode || null,
      },
    });
  }

  /**
   * Crée la fiche, ou adopte celle qu'un traitement concurrent vient de créer.
   *
   * Le cas concurrent est réel : `reserve_web_leads` reprend une demande
   * bloquée en traitement depuis plus de dix minutes, sans pouvoir savoir si
   * le premier traitement est mort ou seulement lent. Deux traitements peuvent
   * donc courir sur la même demande. L'index unique tranche, et le perdant
   * adopte la fiche du gagnant au lieu d'échouer.
   */
  async function createOrAdoptProspect({ payload, origin, organizationId, submissionId }) {
    try {
      const created = await request("/rest/v1/commercial_opportunities", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: prospectRowFromWebLead({ payload, origin, organizationId }),
      });
      const id = (Array.isArray(created) ? created[0] : created)?.id;
      if (id) return { opportunityId: id, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    const adopted = await findProspectOfSubmission({ organizationId, submissionId });
    if (!adopted) throw new Error("PROSPECT_SANS_IDENTIFIANT");
    return { opportunityId: adopted, created: false };
  }

  /** Inscrit la fiche sur la demande, pour qu'une reprise la retrouve. */
  async function attachProspect(submissionPk, opportunityId) {
    await request("/rest/v1/rpc/attach_web_lead_opportunity", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { p_id: submissionPk, p_opportunity_id: opportunityId },
    });
  }

  /** Écrit les contacts manquants. Déjà présents, aucun n'est réécrit. */
  async function ensureTouches({ payload, organizationId, opportunityId, submissionId }) {
    const touches = attributionTouchesFromWebLead({ payload, organizationId, opportunityId });
    const known = await existingTouchRoles({ organizationId, submissionId });
    const missing = touches.filter(touch => !known.has(String(touch.touch_role || "")));
    if (missing.length === 0) return 0;

    try {
      await request("/rest/v1/lead_attribution", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: missing,
      });
    } catch (error) {
      // Un traitement concurrent a écrit les mêmes contacts entre notre
      // lecture et notre écriture. Rien à corriger : la ligne voulue existe.
      if (!isUniqueViolation(error)) throw error;
      return 0;
    }
    return missing.length;
  }

  /** Écrit le rendez-vous s'il manque. */
  async function ensureAppointment({ payload, organizationId, opportunityId, submissionId }) {
    if (payload.kind !== "appointment") return false;
    const appointment = appointmentRowFromWebLead({ payload, organizationId, opportunityId });
    if (!appointment) return false;
    if (await appointmentExists({ organizationId, submissionId })) return false;

    try {
      await request("/rest/v1/commercial_appointments", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: appointment,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return false;
    }
    return true;
  }

  async function integrate(submission) {
    const payload = submission.payload;
    if (!payload) throw new Error("PAYLOAD_PURGE");

    const organizationId = submission.organization_id;
    const submissionId = submissionKeyOf(submission);

    // La reprise se décide avant l'arbitrage des doublons, et c'est essentiel :
    // une tentative précédente a pu créer la fiche avant d'échouer. Arbitrer
    // d'abord retrouverait cette fiche parmi les candidats, sur son propre
    // téléphone, et la demande partirait en revue sans pouvoir en ressortir.
    let opportunityId = submission.opportunity_id
      || (await findProspectOfSubmission({ organizationId, submissionId }));
    let decision = submission.dedup_decision || "new";

    if (!opportunityId) {
      const candidates = await findCandidates({
        organizationId,
        phone: normalizePhoneFr(payload.phone),
        email: normalizeEmail(payload.email),
      });

      const plan = planWebLeadIntegration({ payload, candidates });
      if (plan.outcome !== "succeeded") {
        await settle(submission.id, "review", {
          decision: plan.decision,
          candidateIds: plan.candidateIds,
        });
        return "review";
      }
      decision = plan.decision;

      const creation = await createOrAdoptProspect({
        payload,
        origin: plan.origin,
        organizationId,
        submissionId,
      });
      opportunityId = creation.opportunityId;

      // Inscrite tout de suite : si l'étape suivante échoue, la reprise sait
      // qu'une fiche existe sans dépendre de la recherche par index.
      await attachProspect(submission.id, opportunityId);
    }

    await ensureTouches({ payload, organizationId, opportunityId, submissionId });
    await ensureAppointment({ payload, organizationId, opportunityId, submissionId });

    await settle(submission.id, "succeeded", { opportunityId, decision });
    return "succeeded";
  }

  async function processQueue({ worker = "crm", limit = DEFAULT_BATCH } = {}) {
    const reserved = await request("/rest/v1/rpc/reserve_web_leads", {
      method: "POST",
      body: { p_worker: worker, p_limit: limit },
    });

    const counts = { reserved: (reserved || []).length, created: 0, review: 0, retry: 0 };
    for (const submission of reserved || []) {
      try {
        const outcome = await integrate(submission);
        if (outcome === "succeeded") counts.created += 1;
        else counts.review += 1;
      } catch (error) {
        // Un code court, jamais le message complet : il peut citer le contenu
        // de la demande, donc des coordonnées.
        const code = String(error.message || "inconnu").slice(0, 64);
        console.error(`web-leads intégration échouée : ${code}`);
        counts.retry += 1;
        await settle(submission.id, "retry", { errorCode: code }).catch(() => {});
      }
    }
    return counts;
  }

  return { integrate, processQueue, findProspectOfSubmission, ensureTouches, ensureAppointment };
}

export async function processWebLeadQueue(options = {}) {
  return webLeadIntegrator(options).processQueue(options);
}
