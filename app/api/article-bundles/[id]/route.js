import { requireApiSession } from "../../../lib/api-auth";
import { articleToUi, canManageArticles, canReadArticles } from "../../../lib/articles";
import {
  BUNDLE_SELECT,
  MISSING_BUNDLE_TABLE_MESSAGE,
  applyClimStandardAccessories,
  bundleToUi,
  formToBundleRecord,
  isMissingBundleTable,
  orgArticlesSelectPath,
  validateBundlePayload,
} from "../../../lib/article-bundles";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

async function loadBundle(orgId, id) {
  const rows = await serviceRequest(
    `/rest/v1/article_bundles?select=${BUNDLE_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows?.[0] || null;
}

export async function GET(_request, { params }) {
  try {
    const auth = await requireApiSession(_request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux groupes d’articles." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const { id } = await params;
    const row = await loadBundle(auth.profile.organization_id, id);
    if (!row) return Response.json({ error: "Groupe introuvable." }, { status: 404 });
    return Response.json({ bundle: bundleToUi(row) });
  } catch (error) {
    if (isMissingBundleTable(error)) {
      return Response.json({ error: MISSING_BUNDLE_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Article bundle get error", error.message);
    return Response.json({ error: "Impossible de charger le groupe." }, { status: 502 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Modification de groupe non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadBundle(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Groupe introuvable." }, { status: 404 });

    const body = await request.json();
    const record = formToBundleRecord(
      { ...bundleToUi(existing), ...body },
      {
        organizationId: auth.profile.organization_id,
        createdBy: existing.created_by,
      }
    );
    delete record.created_by;
    delete record.organization_id;

    const errors = validateBundlePayload({
      ...record,
      organization_id: auth.profile.organization_id,
    });
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const rows = await serviceRequest(
      `/rest/v1/article_bundles?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      }
    );
    return Response.json({ bundle: bundleToUi(rows?.[0]) });
  } catch (error) {
    if (isMissingBundleTable(error)) {
      return Response.json({ error: MISSING_BUNDLE_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Article bundle patch error", error.message);
    return Response.json({ error: "Modification de groupe impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Suppression de groupe non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { id } = await params;
    const existing = await loadBundle(auth.profile.organization_id, id);
    if (!existing) return Response.json({ error: "Groupe introuvable." }, { status: 404 });

    await serviceRequest(
      `/rest/v1/article_bundles?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.profile.organization_id)}`,
      { method: "DELETE" }
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (isMissingBundleTable(error)) {
      return Response.json({ error: MISSING_BUNDLE_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Article bundle delete error", error.message);
    return Response.json({ error: "Suppression de groupe impossible." }, { status: 502 });
  }
}
