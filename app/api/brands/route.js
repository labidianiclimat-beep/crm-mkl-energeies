import { requireApiSession } from "../../lib/api-auth";
import {
  brandToUi,
  findBrandByName,
  formToBrandRecord,
  validateBrandPayload,
} from "../../lib/brands";
import { canManageArticles, canReadArticles } from "../../lib/articles";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT = "id,organization_id,name,logo_url,actif,created_at,updated_at,created_by";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux marques." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "1";
    let path = `/rest/v1/article_brands?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=name.asc`;
    if (activeOnly) path += `&actif=eq.true`;

    const rows = await serviceRequest(path);
    return Response.json({ brands: (rows || []).map(brandToUi) });
  } catch (error) {
    console.error("Brands list error", error.message);
    return Response.json({ error: "Impossible de charger les marques." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Création de marque non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const record = formToBrandRecord(body, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });
    const errors = validateBrandPayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const existing = await serviceRequest(
      `/rest/v1/article_brands?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
    );
    if (findBrandByName(existing || [], record.name)) {
      return Response.json({ error: "Cette marque existe déjà." }, { status: 409 });
    }

    record.created_at = new Date().toISOString();
    const rows = await serviceRequest("/rest/v1/article_brands", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    return Response.json({ brand: brandToUi(rows?.[0]) }, { status: 201 });
  } catch (error) {
    console.error("Brand create error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|article_brands_org_name/i.test(message)) {
      return Response.json({ error: "Cette marque existe déjà." }, { status: 409 });
    }
    if (/article_brands|relation|does not exist/i.test(message)) {
      return Response.json(
        { error: "Table des marques absente. Appliquez la migration 20260326_article_brands.sql dans Supabase." },
        { status: 503 }
      );
    }
    return Response.json({ error: "Création de marque impossible." }, { status: 502 });
  }
}
