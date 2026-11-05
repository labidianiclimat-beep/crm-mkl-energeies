import { requireApiSession } from "../../lib/api-auth";
import { canManageArticles, canReadArticles } from "../../lib/articles";
import {
  findSubcategoryByName,
  formToSubcategoryRecord,
  isMissingRelation,
  subcategoryToUi,
  validateSubcategoryPayload,
} from "../../lib/article-taxonomy";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT =
  "id,organization_id,category_id,name,slug,description,sort_order,actif,created_at,updated_at,created_by";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux sous-catégories." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "1";
    const categoryId = url.searchParams.get("categoryId") || "";
    let path = `/rest/v1/article_subcategories?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=sort_order.asc,name.asc`;
    if (activeOnly) path += `&actif=eq.true`;
    if (categoryId) path += `&category_id=eq.${encodeURIComponent(categoryId)}`;

    try {
      const rows = await serviceRequest(path);
      return Response.json({ subcategories: (rows || []).map(subcategoryToUi) });
    } catch (error) {
      if (isMissingRelation(error, "article_subcategories")) {
        return Response.json({ subcategories: [], missing: true });
      }
      throw error;
    }
  } catch (error) {
    console.error("Article subcategories list error", error.message);
    return Response.json({ error: "Impossible de charger les sous-catégories." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Création de sous-catégorie non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const record = formToSubcategoryRecord(body, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });
    const errors = validateSubcategoryPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const parent = await serviceRequest(
      `/rest/v1/article_categories?select=id&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&id=eq.${encodeURIComponent(record.category_id)}&limit=1`
    );
    if (!parent?.[0]) {
      return Response.json({ error: "Catégorie parente introuvable." }, { status: 400 });
    }

    const existing = await serviceRequest(
      `/rest/v1/article_subcategories?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}&category_id=eq.${encodeURIComponent(record.category_id)}`
    );
    if (findSubcategoryByName(existing || [], record.name, { categoryId: record.category_id })) {
      return Response.json({ error: "Cette sous-catégorie existe déjà." }, { status: 409 });
    }

    record.created_at = new Date().toISOString();
    const rows = await serviceRequest("/rest/v1/article_subcategories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    return Response.json({ subcategory: subcategoryToUi(rows?.[0]) }, { status: 201 });
  } catch (error) {
    console.error("Article subcategory create error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|article_subcategories_org_name/i.test(message)) {
      return Response.json({ error: "Cette sous-catégorie existe déjà." }, { status: 409 });
    }
    if (isMissingRelation(error, "article_subcategories")) {
      return Response.json(
        { error: "Table des sous-catégories absente. Appliquez la migration 20260915_article_taxonomy.sql dans Supabase." },
        { status: 503 }
      );
    }
    return Response.json({ error: "Création de sous-catégorie impossible." }, { status: 502 });
  }
}
