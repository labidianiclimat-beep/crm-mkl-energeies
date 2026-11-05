import { requireApiSession } from "../../../lib/api-auth";
import { canManageArticles, canReadArticles } from "../../../lib/articles";
import {
  categoryToUi,
  findCategoryByName,
  formToCategoryRecord,
  isMissingRelation,
  validateCategoryPayload,
} from "../../../lib/article-taxonomy";
import { isAdminRole } from "../../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT = "id,organization_id,name,slug,description,icon,sort_order,actif,created_at,updated_at,created_by";

async function loadCategory(orgId, id) {
  const rows = await serviceRequest(
    `/rest/v1/article_categories?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux catégories." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    const row = await loadCategory(auth.profile.organization_id, id);
    if (!row) return Response.json({ error: "Catégorie introuvable." }, { status: 404 });
    return Response.json({ category: categoryToUi(row) });
  } catch (error) {
    console.error("Article category get error", error.message);
    if (isMissingRelation(error, "article_categories")) {
      return Response.json({ error: "Table des catégories absente." }, { status: 503 });
    }
    return Response.json({ error: "Impossible de charger la catégorie." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Modification de catégorie non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadCategory(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Catégorie introuvable." }, { status: 404 });

    const body = await request.json();
    const record = formToCategoryRecord(
      { ...categoryToUi(existing), ...body },
      {
        organizationId: auth.profile.organization_id,
        createdBy: existing.created_by,
      }
    );
    delete record.created_by;
    delete record.organization_id;

    const errors = validateCategoryPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const siblings = await serviceRequest(
      `/rest/v1/article_categories?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
    );
    if (findCategoryByName(siblings || [], record.name, { excludeId: id })) {
      return Response.json({ error: "Cette catégorie existe déjà." }, { status: 409 });
    }

    const rows = await serviceRequest(
      `/rest/v1/article_categories?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      }
    );

    if (record.name && record.name !== existing.name) {
      try {
        await serviceRequest(
          `/rest/v1/articles?category_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
          {
            method: "PATCH",
            body: { categorie: record.name, updated_at: new Date().toISOString() },
          }
        );
      } catch {
        // colonne category_id absente si migration partielle
      }
    }

    return Response.json({ category: categoryToUi(rows?.[0]) });
  } catch (error) {
    console.error("Article category patch error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|article_categories_org_name/i.test(message)) {
      return Response.json({ error: "Cette catégorie existe déjà." }, { status: 409 });
    }
    return Response.json({ error: "Modification de catégorie impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Suppression de catégorie non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadCategory(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Catégorie introuvable." }, { status: 404 });

    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "1";

    if (hard) {
      if (!isAdminRole(auth.profile?.role)) {
        return Response.json({ error: "Suppression définitive réservée aux administrateurs." }, { status: 403 });
      }
      await serviceRequest(
        `/rest/v1/article_categories?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
        { method: "DELETE" }
      );
      return Response.json({ ok: true });
    }

    const rows = await serviceRequest(
      `/rest/v1/article_categories?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { actif: false, updated_at: new Date().toISOString() },
      }
    );
    return Response.json({ category: categoryToUi(rows?.[0]) });
  } catch (error) {
    console.error("Article category delete error", error.message);
    return Response.json({ error: "Suppression de catégorie impossible." }, { status: 502 });
  }
}
