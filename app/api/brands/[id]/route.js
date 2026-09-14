import { requireApiSession } from "../../../lib/api-auth";
import {
  brandToUi,
  findBrandByName,
  formToBrandRecord,
  validateBrandPayload,
} from "../../../lib/brands";
import { canManageArticles, canReadArticles } from "../../../lib/articles";
import { isAdminRole } from "../../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const SELECT = "id,organization_id,name,logo_url,actif,created_at,updated_at,created_by";

async function loadBrand(orgId, id) {
  const rows = await serviceRequest(
    `/rest/v1/article_brands?select=${SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux marques." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    const row = await loadBrand(auth.profile.organization_id, id);
    if (!row) return Response.json({ error: "Marque introuvable." }, { status: 404 });
    return Response.json({ brand: brandToUi(row) });
  } catch (error) {
    console.error("Brand get error", error.message);
    return Response.json({ error: "Impossible de charger la marque." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Modification de marque non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadBrand(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Marque introuvable." }, { status: 404 });

    const body = await request.json();
    const merged = {
      ...brandToUi(existing),
      ...body,
    };
    const record = formToBrandRecord(merged, {
      organizationId: auth.profile.organization_id,
      createdBy: existing.created_by,
    });
    delete record.created_by;
    delete record.organization_id;

    const errors = validateBrandPayload({ ...record, organization_id: auth.profile.organization_id });
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const siblings = await serviceRequest(
      `/rest/v1/article_brands?select=${SELECT}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`
    );
    if (findBrandByName(siblings || [], record.name, { excludeId: id })) {
      return Response.json({ error: "Cette marque existe déjà." }, { status: 409 });
    }

    const rows = await serviceRequest(
      `/rest/v1/article_brands?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      }
    );

    // Keep denormalized marque text on articles in sync when name changes
    if (record.name && record.name !== existing.name) {
      try {
        await serviceRequest(
          `/rest/v1/articles?brand_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
          {
            method: "PATCH",
            body: { marque: record.name, updated_at: new Date().toISOString() },
          }
        );
      } catch {
        // brand_id column may be missing if migration partial — ignore
      }
    }

    return Response.json({ brand: brandToUi(rows?.[0]) });
  } catch (error) {
    console.error("Brand patch error", error.message);
    const message = String(error?.message || "");
    if (/duplicate|unique|article_brands_org_name/i.test(message)) {
      return Response.json({ error: "Cette marque existe déjà." }, { status: 409 });
    }
    return Response.json({ error: "Modification de marque impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Suppression de marque non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadBrand(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Marque introuvable." }, { status: 404 });

    const url = new URL(request.url);
    const hard = url.searchParams.get("hard") === "1";

    if (hard) {
      if (!isAdminRole(auth.profile?.role)) {
        return Response.json({ error: "Suppression définitive réservée aux administrateurs." }, { status: 403 });
      }
      await serviceRequest(
        `/rest/v1/article_brands?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
        { method: "DELETE" }
      );
      return Response.json({ ok: true });
    }

    const rows = await serviceRequest(
      `/rest/v1/article_brands?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { actif: false, updated_at: new Date().toISOString() },
      }
    );
    return Response.json({ brand: brandToUi(rows?.[0]) });
  } catch (error) {
    console.error("Brand delete error", error.message);
    return Response.json({ error: "Suppression de marque impossible." }, { status: 502 });
  }
}
