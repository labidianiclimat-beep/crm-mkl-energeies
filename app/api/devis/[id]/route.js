import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS, detectDevisSensitiveChanges } from "../../../lib/activity-logs";
import {
  canManageDevis,
  canViewAllDevis,
  devisToUi,
  formToDevisRecord,
  isLockedDevisStatus,
  validateDevisPayload,
} from "../../../lib/devis";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { isAdminRole } from "../../../lib/permissions";
import { loadTeamMemberIds } from "../../../lib/team-scope";
import { canAccessScopedRow } from "../../../lib/scoping";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const DEVIS_SELECT =
  "id,organization_id,kind,numero_devis,client_id,client_name,commercial_id,statut,date_creation,date_validite,date_livraison,total_ht,total_tva,total_ttc,remise_globale_type,remise_globale,acompte,reste_a_payer,conditions_reglement,observations,label,tax_default,financier,financed_amount,finance_months,monthly_payment,electricity_operator,pv_power_kwp,pv_study_id,extra,created_at,updated_at,created_by";

const LINE_SELECT =
  "id,devis_id,article_id,reference,designation,description,quantite,unite,prix_unitaire_ht,remise_type,remise,taux_tva,total_ht,total_tva,total_ttc,categorie,sous_categorie,bundle_id,bundle_name,ordre";

async function loadOne(id) {
  const rows = await serviceRequest(
    `/rest/v1/devis?select=${DEVIS_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function loadLines(devisId) {
  return (
    (await serviceRequest(
      `/rest/v1/devis_lignes?select=${LINE_SELECT}&devis_id=eq.${encodeURIComponent(devisId)}&order=ordre.asc`
    )) || []
  );
}

async function logStatusChange({ devisId, from, to, userId, comment }) {
  if (!devisId || !to || from === to) return;
  await serviceRequest("/rest/v1/devis_historique", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      devis_id: devisId,
      ancien_statut: from || null,
      nouveau_statut: to,
      utilisateur_id: userId || null,
      commentaire: comment ? String(comment).trim() || null : null,
    },
  });
}

async function canAccessRow(profile, userId, row) {
  if (!row) return false;
  const teamIds = await loadTeamMemberIds(profile, userId);
  return canAccessScopedRow(profile, userId, row, teamIds || []);
}

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiSession(_request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageDevis(auth.profile)) {
      return Response.json({ error: "Accès refusé." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const row = await loadOne(id);
    if (!row || !(await canAccessRow(auth.profile, auth.user.id, row))) {
      return Response.json({ error: "Document introuvable." }, { status: 404 });
    }
    return Response.json({ document: devisToUi(row, await loadLines(id)) });
  } catch (error) {
    console.error("Devis get error", error.message);
    return Response.json({ error: "Impossible de charger le document." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageDevis(auth.profile)) {
      return Response.json({ error: "Modification non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadOne(id);
    if (!existing || !(await canAccessRow(auth.profile, auth.user.id, existing))) {
      return Response.json({ error: "Document introuvable." }, { status: 404 });
    }

    const body = await request.json();
    const statusOnlyKeys = new Set(["status", "statut", "statusComment", "statusOnly", "kind"]);
    const bodyKeys = Object.keys(body || {});
    const isStatusOnly = bodyKeys.length > 0 && bodyKeys.every(key => statusOnlyKeys.has(key));

    if (isLockedDevisStatus(existing.statut) && !isStatusOnly) {
      return Response.json({
        error: "Document verrouillé (Accepté / Payée / Annulé). Dévalidez-le avant modification.",
      }, { status: 403 });
    }

    if (isLockedDevisStatus(existing.statut) && isStatusOnly) {
      const nextStatus = body.status || body.statut || existing.statut;
      const updatedRows = await serviceRequest(`/rest/v1/devis?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { statut: nextStatus },
      });
      const updated = updatedRows?.[0] || existing;
      if (existing.statut !== nextStatus) {
        try {
          await logStatusChange({
            devisId: id,
            from: existing.statut,
            to: nextStatus,
            userId: auth.user.id,
            comment: body.statusComment || null,
          });
        } catch (historyError) {
          console.error("Devis history status-only log failed", historyError.message);
        }
      }
      return Response.json({ document: devisToUi(updated, await loadLines(id)) });
    }

    let items = body.items;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items || "[]");
      } catch {
        items = [];
      }
    }
    if (!items) {
      items = (await loadLines(id)).map(line => ({
        articleId: line.article_id,
        code: line.reference,
        name: line.designation,
        description: line.description,
        qty: line.quantite,
        unit: line.prix_unitaire_ht,
        tax: line.taux_tva,
        discountType: line.remise_type,
        discountValue: line.remise,
        category: line.categorie,
        subcategory: line.sous_categorie,
        bundleId: line.bundle_id,
        bundleName: line.bundle_name,
      }));
    }

    const currentUi = devisToUi(existing, []);
    const { header, lines } = formToDevisRecord(
      { ...currentUi, ...body, items, number: body.number || existing.numero_devis },
      {
        organizationId: existing.organization_id,
        createdBy: existing.created_by,
        defaultCommercialId: existing.commercial_id,
      }
    );
    delete header.created_by;
    delete header.created_at;
    header.organization_id = existing.organization_id;
    // Numéro serveur immuable dès la création
    header.numero_devis = existing.numero_devis;
    if (body.number && String(body.number) !== String(existing.numero_devis)) {
      return Response.json({
        error: isLockedDevisStatus(existing.statut)
          ? "Devis validé : numéro verrouillé."
          : "Le numéro de devis ne peut pas être modifié.",
      }, { status: 400 });
    }
    if (!canViewAllDevis(auth.profile)) {
      header.commercial_id = existing.commercial_id || auth.user.id;
    }

    const errors = validateDevisPayload(header, lines);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const previousLines = await loadLines(id);

    const updatedRows = await serviceRequest(`/rest/v1/devis?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: header,
    });

    await serviceRequest(`/rest/v1/devis_lignes?devis_id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    const savedLines = await serviceRequest("/rest/v1/devis_lignes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: lines.map(line => ({ ...line, devis_id: id })),
    });

    const updated = updatedRows?.[0] || existing;
    if (existing.statut !== header.statut) {
      try {
        await logStatusChange({
          devisId: id,
          from: existing.statut,
          to: header.statut,
          userId: auth.user.id,
          comment: body.statusComment || null,
        });
      } catch (historyError) {
        console.error("Devis history update log failed", historyError.message);
      }
    }

    const sensitive = detectDevisSensitiveChanges(existing, header, previousLines, savedLines || lines);
    const actor = actorFromAuth(auth);
    const label = updated.numero_devis || existing.numero_devis || existing.client_name;
    let loggedSpecific = false;

    if (sensitive.priceChanged) {
      loggedSpecific = true;
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.DEVIS_PRICE_CHANGE,
        module: "Devis",
        entityType: "devis",
        entityId: id,
        entityLabel: label,
        oldValue: {
          total_ht: sensitive.beforeSnap.total_ht,
          total_ttc: sensitive.beforeSnap.total_ttc,
          lines: sensitive.beforeSnap.lines,
        },
        newValue: {
          total_ht: sensitive.afterSnap.total_ht,
          total_ttc: sensitive.afterSnap.total_ttc,
          lines: sensitive.afterSnap.lines,
        },
      });
    }
    if (sensitive.discountChanged) {
      loggedSpecific = true;
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.DEVIS_DISCOUNT_CHANGE,
        module: "Devis",
        entityType: "devis",
        entityId: id,
        entityLabel: label,
        oldValue: {
          remise_globale_type: sensitive.beforeSnap.remise_globale_type,
          remise_globale: sensitive.beforeSnap.remise_globale,
        },
        newValue: {
          remise_globale_type: sensitive.afterSnap.remise_globale_type,
          remise_globale: sensitive.afterSnap.remise_globale,
        },
      });
    }
    if (sensitive.validated) {
      loggedSpecific = true;
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.DEVIS_VALIDATE,
        module: "Devis",
        entityType: "devis",
        entityId: id,
        entityLabel: label,
        oldValue: { statut: existing.statut },
        newValue: { statut: header.statut },
      });
    }
    if (!loggedSpecific) {
      await logActivity({
        ...actor,
        action: ACTIVITY_ACTIONS.DEVIS_UPDATE,
        module: "Devis",
        entityType: "devis",
        entityId: id,
        entityLabel: label,
        oldValue: { statut: existing.statut, total_ttc: existing.total_ttc },
        newValue: { statut: header.statut, total_ttc: header.total_ttc },
      });
    }

    return Response.json({ document: devisToUi(updated, savedLines || []) });
  } catch (error) {
    console.error("Devis update error", error.message);
    return Response.json({ error: error.message || "Mise à jour impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    if (!isAdminRole(auth.profile.role)) {
      return Response.json({ error: "Suppression réservée aux administrateurs." }, { status: 403 });
    }

    const { id } = await params;
    const existing = await loadOne(id);
    if (!existing || existing.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Document introuvable." }, { status: 404 });
    }

    await serviceRequest(`/rest/v1/devis?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.DEVIS_DELETE,
      module: "Devis",
      entityType: "devis",
      entityId: id,
      entityLabel: existing.numero_devis || existing.client_name,
      oldValue: {
        numero_devis: existing.numero_devis,
        statut: existing.statut,
        total_ttc: existing.total_ttc,
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Devis delete error", error.message);
    return Response.json({ error: "Suppression impossible." }, { status: 502 });
  }
}
