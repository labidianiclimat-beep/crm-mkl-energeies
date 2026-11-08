import { requireApiSession } from "../../lib/api-auth";
import {
  articleToUi,
  canManageArticles,
  canReadArticles,
  findArticleByReference,
  formToArticleRecord,
  validateArticlePayload,
} from "../../lib/articles";
import { isMissingRelation, taxonomyNamesEqual } from "../../lib/article-taxonomy";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT_CORE =
  "id,organization_id,reference,designation,description,description_technique,categorie,sous_categorie,marque,prix_achat_ht,prix_vente_ht,taux_tva,unite,actif,power_w,source_reference,created_at,updated_at,created_by";
const SELECT_BRAND = `${SELECT_CORE.replace(",marque,", ",marque,brand_id,")}`;
const SELECT_TAXONOMY = `${SELECT_BRAND.replace(",brand_id,", ",brand_id,category_id,subcategory_id,")}`;
const SELECT = `${SELECT_TAXONOMY.replace(",created_by", ",fiche_nom,fiche_data,created_by")}`;

async function fetchArticleRows(orgId, { activeOnly = false, id } = {}) {
  const filter = id
    ? `&id=eq.${encodeURIComponent(id)}&limit=1`
    : `&order=reference.asc${activeOnly ? "&actif=eq.true" : ""}`;
  const build = select =>
    `/rest/v1/articles?select=${select}&organization_id=eq.${encodeURIComponent(orgId)}${filter}`;
  try {
    return await serviceRequest(build(SELECT));
  } catch (error) {
    const message = String(error?.message || "");
    if (/fiche_nom|fiche_data/i.test(message)) {
      try {
        return await serviceRequest(build(SELECT_TAXONOMY));
      } catch (inner) {
        if (/category_id|subcategory_id/i.test(String(inner?.message || ""))) {
          try {
            return await serviceRequest(build(SELECT_BRAND));
          } catch (nested) {
            if (/brand_id/i.test(String(nested?.message || ""))) return serviceRequest(build(SELECT_CORE));
            throw nested;
          }
        }
        if (/brand_id/i.test(String(inner?.message || ""))) return serviceRequest(build(SELECT_CORE));
        throw inner;
      }
    }
    if (/category_id|subcategory_id/i.test(message)) {
      try {
        return await serviceRequest(build(SELECT_BRAND));
      } catch (inner) {
        if (/brand_id/i.test(String(inner?.message || ""))) return serviceRequest(build(SELECT_CORE));
        throw inner;
      }
    }
    if (/brand_id/i.test(message)) {
      return serviceRequest(build(SELECT_CORE));
    }
    throw error;
  }
}

async function allowedCategoryNames(orgId) {
  try {
    const rows = await serviceRequest(
      `/rest/v1/article_categories?select=name,actif&organization_id=eq.${encodeURIComponent(orgId)}`
    );
    return (rows || []).filter(row => row.actif !== false).map(row => row.name);
  } catch (error) {
    if (isMissingRelation(error, "article_categories")) return [];
    return [];
  }
}

async function resolveTaxonomyIds(orgId, record) {
  try {
    if (!record.category_id && record.categorie) {
      const cats = await serviceRequest(
        `/rest/v1/article_categories?select=id,name&organization_id=eq.${encodeURIComponent(orgId)}`
      );
      const match = (cats || []).find(row => taxonomyNamesEqual(row.name, record.categorie));
      if (match) record.category_id = match.id;
    }
    if (record.category_id && !record.subcategory_id && record.sous_categorie) {
      const subs = await serviceRequest(
        `/rest/v1/article_subcategories?select=id,name,category_id&organization_id=eq.${encodeURIComponent(orgId)}&category_id=eq.${encodeURIComponent(record.category_id)}`
      );
      const match = (subs || []).find(row => taxonomyNamesEqual(row.name, record.sous_categorie));
      if (match) record.subcategory_id = match.id;
    }
  } catch (error) {
    if (isMissingRelation(error, "article_categories") || isMissingRelation(error, "article_subcategories")) {
      delete record.category_id;
      delete record.subcategory_id;
    }
  }
  return record;
}

async function persistArticle(path, method, record) {
  try {
    return await serviceRequest(path, {
      method,
      headers: { Prefer: "return=representation" },
      body: record,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (/category_id|subcategory_id/i.test(message)) {
      const { category_id: _c, subcategory_id: _s, ...rest } = record;
      return persistArticle(path, method, rest);
    }
    if (/fiche_nom|fiche_data/i.test(message)) {
      const { fiche_nom: _n, fiche_data: _d, ...rest } = record;
      return persistArticle(path, method, rest);
    }
    if (/brand_id/i.test(message)) {
      const { brand_id: _ignored, ...legacy } = record;
      return persistArticle(path, method, legacy);
    }
    throw error;
  }
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé au catalogue articles." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "1";
    const rows = await fetchArticleRows(orgId, { activeOnly });
    return Response.json({ articles: (rows || []).map(articleToUi) });
  } catch (error) {
    console.error("Articles list error", error.message);
    return Response.json({ error: "Impossible de charger les articles." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Création d’article non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const record = formToArticleRecord(body, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });

    await resolveTaxonomyIds(auth.profile.organization_id, record);
    const allowedCategories = await allowedCategoryNames(auth.profile.organization_id);
    const errors = validateArticlePayload(record, { allowedCategories });
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const existing = await fetchArticleRows(auth.profile.organization_id);
    if (findArticleByReference(existing || [], record.reference)) {
      return Response.json({ error: "Cette référence article existe déjà." }, { status: 409 });
    }

    record.created_at = new Date().toISOString();
    const rows = await persistArticle("/rest/v1/articles", "POST", record);
    return Response.json({ article: articleToUi(rows?.[0]) }, { status: 201 });
  } catch (error) {
    console.error("Article create error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|articles_org_reference/i.test(message)) {
      return Response.json({ error: "Cette référence article existe déjà." }, { status: 409 });
    }
    return Response.json({ error: "Création d’article impossible." }, { status: 502 });
  }
}
