import { requireApiSession } from "../../../lib/api-auth";
import {
  articleToUi,
  canDeleteArticles,
  canManageArticles,
  canReadArticles,
  findArticleByReference,
  formToArticleRecord,
  validateArticlePayload,
} from "../../../lib/articles";
import { isMissingRelation, taxonomyNamesEqual } from "../../../lib/article-taxonomy";
import {
  BUNDLE_SELECT,
  bundleToUi,
  formToBundleRecord,
  isMissingBundleTable,
} from "../../../lib/article-bundles";
import { syncArticlePriceIntoBundles } from "../../../lib/article-picker";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT_CORE =
  "id,organization_id,reference,designation,description,description_technique,categorie,sous_categorie,marque,prix_achat_ht,prix_vente_ht,taux_tva,unite,actif,power_w,source_reference,created_at,updated_at,created_by";
const SELECT_BRAND = `${SELECT_CORE.replace(",marque,", ",marque,brand_id,")}`;
const SELECT_TAXONOMY = `${SELECT_BRAND.replace(",brand_id,", ",brand_id,category_id,subcategory_id,")}`;
const SELECT = `${SELECT_TAXONOMY.replace(",created_by", ",fiche_nom,fiche_data,created_by")}`;

async function fetchWithSelect(id, select) {
  const rows = await serviceRequest(
    `/rest/v1/articles?select=${select}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

async function loadOne(id) {
  try {
    return await fetchWithSelect(id, SELECT);
  } catch (error) {
    const message = String(error?.message || "");
    if (/fiche_nom|fiche_data/i.test(message)) {
      try {
        return await fetchWithSelect(id, SELECT_TAXONOMY);
      } catch (inner) {
        if (/category_id|subcategory_id/i.test(String(inner?.message || ""))) {
          try {
            return await fetchWithSelect(id, SELECT_BRAND);
          } catch (nested) {
            if (/brand_id/i.test(String(nested?.message || ""))) return fetchWithSelect(id, SELECT_CORE);
            throw nested;
          }
        }
        throw inner;
      }
    }
    if (/category_id|subcategory_id/i.test(message)) {
      try {
        return await fetchWithSelect(id, SELECT_BRAND);
      } catch (inner) {
        if (/brand_id/i.test(String(inner?.message || ""))) return fetchWithSelect(id, SELECT_CORE);
        throw inner;
      }
    }
    if (/brand_id/i.test(message)) return fetchWithSelect(id, SELECT_CORE);
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

    await resolveTaxonomyIds(auth.profile.organization_id, record);
    const allowedCategories = await allowedCategoryNames(auth.profile.organization_id);
    const errors = validateArticlePayload(record, { allowedCategories });
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    let siblings;
    try {
      siblings = await serviceRequest(
        `/rest/v1/articles?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
      );
    } catch (error) {
      const message = String(error?.message || "");
      if (/category_id|subcategory_id/i.test(message)) {
        try {
          siblings = await serviceRequest(
            `/rest/v1/articles?select=${SELECT_BRAND}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
          );
        } catch (inner) {
          if (/brand_id/i.test(String(inner?.message || ""))) {
            siblings = await serviceRequest(
              `/rest/v1/articles?select=${SELECT_CORE}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
            );
          } else {
            throw inner;
          }
        }
      } else if (/brand_id/i.test(message)) {
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

    const rows = await persistArticle(`/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, "PATCH", record);
    const article = articleToUi(rows?.[0]);
    let bundles = [];
    try {
      const bundleRows = await serviceRequest(
        `/rest/v1/article_bundles?select=${BUNDLE_SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
      );
      const updated = syncArticlePriceIntoBundles(article, (bundleRows || []).map(bundleToUi).filter(Boolean));
      for (const bundle of updated) {
        const payload = formToBundleRecord(bundle, {
          organizationId: auth.profile.organization_id,
          createdBy: bundle.createdBy,
        });
        delete payload.created_by;
        delete payload.organization_id;
        const saved = await serviceRequest(
          `/rest/v1/article_bundles?id=eq.${encodeURIComponent(bundle.id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
          { method: "PATCH", headers: { Prefer: "return=representation" }, body: payload }
        );
        if (saved?.[0]) bundles.push(bundleToUi(saved[0]));
      }
    } catch (error) {
      if (!isMissingBundleTable(error)) console.error("Article bundle price sync error", error.message);
    }
    return Response.json({ article, bundles });
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

    const hard = new URL(request.url).searchParams.get("hard") === "1";
    if (hard) {
      if (!canDeleteArticles(auth.profile)) {
        return Response.json({ error: "Suppression d’article réservée aux comptes avec la fonction cochée." }, { status: 403 });
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
