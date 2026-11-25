import { requireApiSession } from "../../lib/api-auth";
import { canManageArticles, canReadArticles } from "../../lib/articles";
import {
  categoryToUi,
  findCategoryByName,
  formToCategoryRecord,
  isMissingRelation,
  validateCategoryPayload,
} from "../../lib/article-taxonomy";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT = "id,organization_id,name,slug,description,icon,sort_order,actif,created_at,updated_at,created_by";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux catégories." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "1";
    let path = `/rest/v1/article_categories?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=sort_order.asc,name.asc`;
    if (activeOnly) path += `&actif=eq.true`;

    try {
      const rows = await serviceRequest(path);
      return Response.json({ categories: (rows || []).map(categoryToUi) });
    } catch (error) {
      if (isMissingRelation(error, "article_categories")) {
        return Response.json({ categories: [], missing: true });
      }
      throw error;
    }
  } catch (error) {
    console.error("Article categories list error", error.message);
    return Response.json({ error: "Impossible de charger les catégories." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Création de catégorie non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const record = formToCategoryRecord(body, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });
    const errors = validateCategoryPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const existing = await serviceRequest(
      `/rest/v1/article_categories?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
    );
    if (findCategoryByName(existing || [], record.name)) {
      return Response.json({ error: "Cette catégorie existe déjà." }, { status: 409 });
    }

    record.created_at = new Date().toISOString();
    const rows = await serviceRequest("/rest/v1/article_categories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    return Response.json({ category: categoryToUi(rows?.[0]) }, { status: 201 });
  } catch (error) {
    console.error("Article category create error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|article_categories_org_name/i.test(message)) {
      return Response.json({ error: "Cette catégorie existe déjà." }, { status: 409 });
    }
    if (isMissingRelation(error, "article_categories")) {
      return Response.json(
        { error: "Table des catégories absente. Appliquez la migration 20260915_article_taxonomy.sql dans Supabase." },
        { status: 503 }
      );
    }
    return Response.json({ error: "Création de catégorie impossible." }, { status: 502 });
  }
}
