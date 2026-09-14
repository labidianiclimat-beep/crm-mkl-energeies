import { requireApiSession } from "../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../lib/activity-logs";
import { canAccessModule } from "../../lib/permissions";
import {
  canManageDevis,
  canViewAllDevis,
  devisToUi,
  formToDevisRecord,
  kindToModule,
  validateDevisPayload,
} from "../../lib/devis";
import { actorFromAuth, logActivity } from "../../lib/log-activity";
import { commercialScopeQuery, loadTeamMemberIds } from "../../lib/team-scope";
import { canAccessScopedRow } from "../../lib/scoping";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const DEVIS_SELECT =
  "id,organization_id,kind,numero_devis,client_id,client_name,commercial_id,statut,date_creation,date_validite,date_livraison,total_ht,total_tva,total_ttc,remise_globale_type,remise_globale,acompte,reste_a_payer,conditions_reglement,observations,label,tax_default,financier,financed_amount,finance_months,monthly_payment,electricity_operator,pv_power_kwp,pv_study_id,extra,created_at,updated_at,created_by";

const LINE_SELECT =
  "id,devis_id,article_id,reference,designation,description,quantite,unite,prix_unitaire_ht,remise_type,remise,taux_tva,total_ht,total_tva,total_ttc,categorie,sous_categorie,bundle_id,bundle_name,ordre";

async function loadLines(devisIds) {
  if (!devisIds.length) return {};
  const rows = await serviceRequest(
    `/rest/v1/devis_lignes?select=${LINE_SELECT}&devis_id=in.(${devisIds.map(id => `"${id}"`).join(",")})&order=ordre.asc`
  );
  const map = {};
  for (const row of rows || []) {
    if (!map[row.devis_id]) map[row.devis_id] = [];
    map[row.devis_id].push(row);
  }
  return map;
}

async function allocateNumber(orgId, kind) {
  const year = new Date().getFullYear();
  const numero = await serviceRequest("/rest/v1/rpc/next_devis_number", {
    method: "POST",
    body: { p_org: orgId, p_kind: kind, p_year: year },
  });
  return typeof numero === "string" ? numero : String(numero);
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

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageDevis(auth.profile)) {
      return Response.json({ error: "Accès refusé aux devis." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    let path = `/rest/v1/devis?select=${DEVIS_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=updated_at.desc`;
    if (kind) path += `&kind=eq.${encodeURIComponent(kind)}`;
    path += await commercialScopeQuery(auth.profile, auth.user.id);

    const rows = await serviceRequest(path);
    const linesMap = await loadLines((rows || []).map(row => row.id));
    return Response.json({
      documents: (rows || []).map(row => devisToUi(row, linesMap[row.id] || [])),
    });
  } catch (error) {
    console.error("Devis list error", error.message);
    return Response.json({ error: "Impossible de charger les devis." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageDevis(auth.profile)) {
      return Response.json({ error: "Création de devis non autorisée." }, { status: 403 });
    }

    const body = await request.json();
    const requestedKind = body.kind || "Devis";
    const moduleName = kindToModule(requestedKind);
    if (!canAccessModule(auth.profile, moduleName) && !["Admin VIP", "Admin second", "Direction", "Secrétariat", "Responsable commercial"].includes(auth.profile.role)) {
      return Response.json({ error: `Accès refusé au module ${moduleName}.` }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    let items = body.items;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items || "[]");
      } catch {
        items = [];
      }
    }

    const { header, lines } = formToDevisRecord(
      { ...body, items },
      {
        organizationId: auth.profile.organization_id,
        createdBy: auth.user.id,
        defaultCommercialId: auth.user.id,
      }
    );

    if (!canViewAllDevis(auth.profile)) {
      header.commercial_id = auth.user.id;
    }

    const errors = validateDevisPayload(header, lines);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    header.numero_devis = await allocateNumber(auth.profile.organization_id, header.kind);
    header.created_at = new Date().toISOString();

    const createdRows = await serviceRequest("/rest/v1/devis", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: header,
    });
    const created = createdRows?.[0];
    if (!created?.id) {
      return Response.json({ error: "Création du devis impossible." }, { status: 502 });
    }

    const lineRows = lines.map(line => ({ ...line, devis_id: created.id }));
    const savedLines = await serviceRequest("/rest/v1/devis_lignes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: lineRows,
    });

    try {
      await logStatusChange({
        devisId: created.id,
        from: null,
        to: created.statut || header.statut,
        userId: auth.user.id,
        comment: body.statusComment || "Création du document",
      });
    } catch (historyError) {
      console.error("Devis history create log failed", historyError.message);
    }

    await logActivity({
      ...actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.DEVIS_CREATE,
      module: "Devis",
      entityType: "devis",
      entityId: created.id,
      entityLabel: created.numero_devis || created.client_name,
      newValue: {
        numero_devis: created.numero_devis,
        statut: created.statut,
        total_ttc: created.total_ttc,
        client_id: created.client_id,
      },
    });

    return Response.json(
      { document: devisToUi(created, savedLines || lineRows) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Devis create error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|devis_org_numero/i.test(message)) {
      return Response.json({ error: "Ce numéro de devis existe déjà." }, { status: 409 });
    }
    return Response.json({ error: "Création de devis impossible." }, { status: 502 });
  }
}
