import { requireApiSession } from "../../../lib/api-auth";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import {
  canReviewWebLeads,
  planWebLeadAction,
  webLeadBacklogRow,
} from "../../../lib/web-lead-admin";
import { processWebLeadQueue } from "../../../lib/web-lead-queue-server";

/**
 * Demandes du site restées en échec ou en vérification de doublon.
 *
 * Sans cet écran, `requeue_web_lead` existait en base sans qu'aucune interface
 * ne puisse l'appeler : une demande abandonnée après sept tentatives n'était
 * atteignable qu'en SQL. Une personne qui attend un rappel ne doit pas dépendre
 * de ça.
 *
 * La lecture se limite aux états bloqués et à l'organisation de l'appelant.
 * Les coordonnées sont masquées par `webLeadBacklogRow` : l'écran sert à
 * débloquer un traitement, pas à consulter un fichier.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBMISSION_SELECT = [
  "id",
  "submission_id",
  "kind",
  "status",
  "attempts",
  "received_at",
  "last_error_code",
  "dedup_decision",
  "dedup_candidate_ids",
  "opportunity_id",
  "payload",
  "payload_purge_after",
  "retention_alert_at",
].join(",");

/** Prospects proposés au rapprochement. Déjà visibles dans le module Prospects. */
async function loadCandidates(organizationId, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await serviceRequest(
    "/rest/v1/commercial_opportunities?select=id,name,created_at" +
      `&organization_id=eq.${organizationId}&id=in.(${unique.join(",")})`
  );
  return new Map((rows || []).map(row => [row.id, row]));
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReviewWebLeads(auth.profile)) {
      return Response.json({ error: "Consultation non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const organizationId = auth.profile.organization_id;
    const url = new URL(request.url);
    const withDone = url.searchParams.get("inclureTraitees") === "1";
    const statuses = withDone
      ? ["failed", "review", "pending", "processing", "done", "discarded"]
      : ["failed", "review", "pending", "processing"];

    const submissions = await serviceRequest(
      `/rest/v1/web_lead_submissions?select=${SUBMISSION_SELECT}` +
        `&organization_id=eq.${organizationId}` +
        `&status=in.(${statuses.join(",")})` +
        "&order=received_at.desc&limit=200"
    );

    const candidateIds = (submissions || []).flatMap(row => row.dedup_candidate_ids || []);
    const candidates = await loadCandidates(organizationId, candidateIds);

    const rows = (submissions || []).map(submission =>
      webLeadBacklogRow(submission, {
        candidates: (submission.dedup_candidate_ids || [])
          .map(id => candidates.get(id))
          .filter(Boolean),
      })
    );

    return Response.json({
      rows,
      counts: {
        failed: rows.filter(row => row.status === "failed").length,
        review: rows.filter(row => row.status === "review").length,
        pending: rows.filter(row => row.status === "pending" || row.status === "processing").length,
      },
    });
  } catch (error) {
    // Message court : la demande contient des coordonnées, elles ne doivent
    // pas se retrouver dans les journaux techniques.
    console.error(`web-leads suivi illisible : ${String(error.message).slice(0, 120)}`);
    return Response.json({ error: "Suivi indisponible." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Prospects" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReviewWebLeads(auth.profile)) {
      return Response.json({ error: "Action non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = auth.profile.organization_id;

    // La demande doit appartenir à l'organisation de l'appelant. Les fonctions
    // d'écriture ne prennent qu'un identifiant : la vérification est ici.
    const found = await serviceRequest(
      "/rest/v1/web_lead_submissions?select=id,status,organization_id&limit=1" +
        `&id=eq.${encodeURIComponent(String(body.id || ""))}` +
        `&organization_id=eq.${organizationId}`
    );
    if (!(Array.isArray(found) ? found[0] : null)) {
      return Response.json({ error: "Demande introuvable." }, { status: 404 });
    }

    const plan = planWebLeadAction({
      action: body.action,
      submissionId: String(body.id || ""),
      opportunityId: String(body.opportunityId || ""),
      reason: String(body.reason || ""),
      authorId: auth.profile.id,
    });
    if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });

    try {
      await serviceRequest(`/rest/v1/rpc/${plan.rpc}`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: plan.body,
      });
    } catch (error) {
      // Les refus des fonctions sont des codes courts et explicites : ils
      // peuvent être renvoyés à l'écran, ils ne citent aucune coordonnée.
      const code = String(error.message || "").slice(0, 64);
      return Response.json({ error: code || "Action refusée." }, { status: 409 });
    }

    // Une relance ne doit pas attendre le prochain passage du cron.
    if (body.action === "relancer") {
      try {
        await processWebLeadQueue({ worker: "admin" });
      } catch (error) {
        console.error(`web-leads relance différée : ${String(error.message).slice(0, 120)}`);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(`web-leads action impossible : ${String(error.message).slice(0, 120)}`);
    return Response.json({ error: "Action impossible." }, { status: 502 });
  }
}
