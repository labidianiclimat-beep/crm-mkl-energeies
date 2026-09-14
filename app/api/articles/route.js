import { requireApiSession } from "../../lib/api-auth";
import {
  articleToUi,
  canManageArticles,
  canReadArticles,
  findArticleByReference,
  formToArticleRecord,
  validateArticlePayload,
} from "../../lib/articles";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT_CORE =
  "id,organization_id,reference,designation,description,description_technique,categorie,sous_categorie,marque,prix_achat_ht,prix_vente_ht,taux_tva,unite,actif,power_w,source_reference,created_at,updated_at,created_by";
const SELECT = `${SELECT_CORE.replace(",marque,", ",marque,brand_id,")}`;

async function fetchArticleRows(orgId, { activeOnly = false, id } = {}) {
  const filter = id
    ? `&id=eq.${encodeURIComponent(id)}&limit=1`
    : `&order=reference.asc${activeOnly ? "&actif=eq.true" : ""}`;
  const build = select =>
    `/rest/v1/articles?select=${select}&organization_id=eq.${encodeURIComponent(orgId)}${filter}`;
  try {
    return await serviceRequest(build(SELECT));
  } catch (error) {
    if (/brand_id/i.test(String(error?.message || ""))) {
      return serviceRequest(build(SELECT_CORE));
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

    const errors = validateArticlePayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const existing = await fetchArticleRows(auth.profile.organization_id);
    if (findArticleByReference(existing || [], record.reference)) {
      return Response.json({ error: "Cette référence article existe déjà." }, { status: 409 });
    }

    record.created_at = new Date().toISOString();
    let rows;
    try {
      rows = await serviceRequest("/rest/v1/articles", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: record,
      });
    } catch (error) {
      if (/brand_id/i.test(String(error?.message || ""))) {
        const { brand_id: _ignored, ...legacy } = record;
        rows = await serviceRequest("/rest/v1/articles", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: legacy,
        });
      } else {
        throw error;
      }
    }
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
