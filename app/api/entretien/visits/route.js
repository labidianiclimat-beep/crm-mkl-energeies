import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { serviceRoleConfigured } from "../../../lib/supabase-server";
import { attachTechnicianReach, buildCrmVisitRecord, isFieldMaintenanceTechnician } from "../../../lib/entretien-agenda";
import { pickTourTechnicians } from "../../../lib/entretien-tour";
import {
  ensureEntretienContractForClient,
  insertCrmVisit,
  listEntretienClientNames,
  listEntretienTechnicians,
  listEntretienVisitSamples,
  listEntretienVisits,
  patchEntretienVisit,
  visitPatchFromReview,
} from "../../../lib/entretien-store";
import { forgetOrgPayload } from "../../../lib/org-payload-cache";

export const runtime = "nodejs";
export const maxDuration = 60;

function sqlMissing(error) {
  return /entretien_|schema cache|does not exist/i.test(String(error?.message || error || ""));
}

function pickTechnicians(rows = []) {
  return pickTourTechnicians(rows);
}

export async function GET(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  const orgId = auth.profile.organization_id;
  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "").slice(0, 10);
  const to = String(url.searchParams.get("to") || "").slice(0, 10);
  const clientId = String(url.searchParams.get("clientId") || "").trim();
  const samples = url.searchParams.get("samples") === "1";
  const ownTechnicianId = isFieldMaintenanceTechnician(auth.profile.role) ? auth.user.id : "";
  try {
    if (ownTechnicianId && samples) {
      return Response.json({ error: "Le technicien voit ses visites, pas le stock clients." }, { status: 403 });
    }
    if (samples && clientId) {
      const visits = await listEntretienVisitSamples(orgId, clientId);
      return Response.json({ ok: true, visits });
    }
    let extra = from && to
      ? `&scheduled_start=gte.${from}T00:00:00&scheduled_start=lt.${to}T00:00:00`
      : "";
    if (ownTechnicianId) extra += `&technician_id=eq.${encodeURIComponent(ownTechnicianId)}`;
    const [visits, profiles, clients] = await Promise.all([
      listEntretienVisits(orgId, extra),
      listEntretienTechnicians(orgId),
      listEntretienClientNames(orgId),
    ]);
    return Response.json({
      ok: true,
      wroteToGoogle: false,
      visits: attachTechnicianReach(visits, clients),
      technicians: ownTechnicianId
        ? pickTechnicians(profiles).filter(tech => String(tech.id) === String(ownTechnicianId))
        : pickTechnicians(profiles),
    });
  } catch (error) {
    if (sqlMissing(error)) {
      return Response.json({ error: "Collez d’abord 20260932_entretien.sql dans Supabase.", sqlRequired: true }, { status: 503 });
    }
    return Response.json({ error: String(error?.message || "Agenda CRM impossible.") }, { status: 502 });
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  if (isFieldMaintenanceTechnician(auth.profile.role)) {
    return Response.json({ error: "La planification reste au responsable. Le technicien remplit le formulaire de ses visites." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    let contractId = body.contractId || "";
    let contractCreated = false;
    if (body.createContract) {
      if (!body.clientId) throw new Error("Choisissez d’abord le client en base.");
      const ensured = await ensureEntretienContractForClient(auth.profile.organization_id, body.clientId, {
        startOn: body.day,
        actorId: auth.user.id,
      });
      contractId = ensured.contract?.id || contractId;
      contractCreated = Boolean(ensured.created);
    }
    const record = buildCrmVisitRecord({
      organizationId: auth.profile.organization_id,
      technicianId: body.technicianId,
      clientId: body.clientId,
      contractId,
      title: body.title,
      location: body.location,
      day: body.day,
      time: body.time,
      durationMinutes: body.durationMinutes,
      actorId: auth.user.id,
    });
    const visit = await insertCrmVisit(auth.profile.organization_id, record);
    forgetOrgPayload("entretien-pilotage", auth.profile.organization_id);
    await logActivity({
      actor: actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
      entityType: "entretien_visit",
      entityId: visit?.id,
      summary: contractCreated
        ? "Visite d’entretien créée et contrat ouvert pour un client déjà en base."
        : "Visite d’entretien créée dans l’agenda CRM (sans Google).",
    }).catch(() => null);
    return Response.json({ ok: true, visit, contractCreated, wroteToGoogle: false });
  } catch (error) {
    if (sqlMissing(error)) {
      return Response.json({ error: "Collez d’abord 20260932_entretien.sql dans Supabase.", sqlRequired: true }, { status: 503 });
    }
    return Response.json({ error: String(error?.message || "Création de visite impossible.") }, { status: 502 });
  }
}

export async function PATCH(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  if (isFieldMaintenanceTechnician(auth.profile.role)) {
    return Response.json({ error: "La planification reste au responsable. Le technicien remplit le formulaire de ses visites." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Visite manquante." }, { status: 400 });
  const patch = visitPatchFromReview(body, auth.user.id);
  const visit = await patchEntretienVisit(auth.profile.organization_id, body.id, patch);
  forgetOrgPayload("entretien-pilotage", auth.profile.organization_id);
  await logActivity({
    actor: actorFromAuth(auth),
    action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
    entityType: "entretien_visit",
    entityId: body.id,
    summary: "Revue d’une visite d’entretien",
  }).catch(() => null);
  return Response.json({ ok: true, visit, wroteToGoogle: false });
}
