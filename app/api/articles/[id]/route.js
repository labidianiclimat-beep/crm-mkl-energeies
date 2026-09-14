import { requireApiSession } from "../../../lib/api-auth";
import {
  articleToUi,
  canManageArticles,
  canReadArticles,
  findArticleByReference,
  formToArticleRecord,
  validateArticlePayload,
} from "../../../lib/articles";
import { isAdminRole } from "../../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT_CORE =
  "id,organization_id,reference,designation,description,description_technique,categorie,sous_categorie,marque,prix_achat_ht,prix_vente_ht,taux_tva,unite,actif,power_w,source_reference,created_at,updated_at,created_by";
const SELECT = `${SELECT_CORE.replace(",marque,", ",marque,brand_id,")}`;

async function loadOne(id) {
  try {
    const rows = await serviceRequest(
      `/rest/v1/articles?select=${SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    return rows?.[0] || null;
  } catch (error) {
    if (/brand_id/i.test(String(error?.message || ""))) {
      const rows = await serviceRequest(
        `/rest/v1/articles?select=${SELECT_CORE}&id=eq.${encodeURIComponent(id)}&limit=1`
      );
      return rows?.[0] || null;
    }
    throw error;
  }
}

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiSession(_request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const row = await loadOne(id);
    if (!row || row.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Article introuvable." }, { status: 404 });
    }
    return Response.json({ article: articleToUi(row) });
  } catch (error) {
    console.error("Article get error", error.message);
    return Response.json({ error: "Impossible de charger l’article." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Modification d’article non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadOne(id);
    if (!existing || existing.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Article introuvable." }, { status: 404 });
    }

    const body = await request.json();
    const record = formToArticleRecord(
      { ...articleToUi(existing), ...body },
      {
        organizationId: auth.profile.organization_id,
        createdBy: existing.created_by,
      }
    );
    delete record.created_by;
    delete record.created_at;
    record.organization_id = existing.organization_id;

    const errors = validateArticlePayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    let siblings;
    try {
      siblings = await serviceRequest(
        `/rest/v1/articles?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
      );
    } catch (error) {
      if (/brand_id/i.test(String(error?.message || ""))) {
        siblings = await serviceRequest(
          `/rest/v1/articles?select=${SELECT_CORE}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
        );
      } else {
        throw error;
      }
    }
    if (findArticleByReference(siblings || [], record.reference, { excludeId: id })) {
      return Response.json({ error: "Cette référence article existe déjà." }, { status: 409 });
    }

    let rows;
    try {
      rows = await serviceRequest(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      });
    } catch (error) {
      if (/brand_id/i.test(String(error?.message || ""))) {
        const { brand_id: _ignored, ...legacy } = record;
        rows = await serviceRequest(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: legacy,
        });
      } else {
        throw error;
      }
    }
    return Response.json({ article: articleToUi(rows?.[0]) });
  } catch (error) {
    console.error("Article update error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|articles_org_reference/i.test(message)) {
      return Response.json({ error: "Cette référence article existe déjà." }, { status: 409 });
    }
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

    const { id } = await params;
    const existing = await loadOne(id);
    if (!existing || existing.organization_id !== auth.profile.organization_id) {
      return Response.json({ error: "Article introuvable." }, { status: 404 });
    }

    // Soft-delete by default; hard delete reserved to admins via ?hard=1
    const hard = new URL(request.url).searchParams.get("hard") === "1";
    if (hard) {
      if (!isAdminRole(auth.profile.role)) {
        return Response.json({ error: "Suppression définitive réservée aux administrateurs." }, { status: 403 });
      }
      await serviceRequest(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      return Response.json({ ok: true, hard: true });
    }

    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Désactivation non autorisée." }, { status: 403 });
    }
    const rows = await serviceRequest(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { actif: false, updated_at: new Date().toISOString() },
    });
    return Response.json({ article: articleToUi(rows?.[0]), ok: true, hard: false });
  } catch (error) {
    console.error("Article delete error", error.message);
    return Response.json({ error: "Suppression impossible." }, { status: 502 });
  }
}
