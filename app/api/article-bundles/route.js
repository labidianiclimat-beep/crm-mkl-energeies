import { requireApiSession } from "../../lib/api-auth";
import { articleToUi, canManageArticles, canReadArticles } from "../../lib/articles";
import {
  BUNDLE_SELECT,
  MISSING_BUNDLE_TABLE_MESSAGE,
  applyClimStandardAccessories,
  bundleToUi,
  formToBundleRecord,
  isMissingBundleTable,
  orgArticlesSelectPath,
  readBundleRows,
  validateBundlePayload,
  writeBundleRows,
} from "../../lib/article-bundles";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadArticles(auth.profile)) {
      return Response.json({ error: "Accès refusé aux groupes d’articles." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const orgId = auth.profile.organization_id;
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") === "1";
    let path = `/rest/v1/article_bundles?select=${BUNDLE_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=name.asc`;
    if (activeOnly) path += `&actif=eq.true`;

    const rows = await readBundleRows(serviceRequest, path);
    return Response.json({ bundles: (rows || []).map(bundleToUi) });
  } catch (error) {
    if (isMissingBundleTable(error)) {
      return Response.json({ error: MISSING_BUNDLE_TABLE_MESSAGE, bundles: [] }, { status: 503 });
    }
    console.error("Article bundles list error", error.message);
    return Response.json({ error: "Impossible de charger les groupes d’articles." }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageArticles(auth.profile)) {
      return Response.json({ error: "Création de groupe non autorisée." }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    const record = formToBundleRecord(body, {
      organizationId: auth.profile.organization_id,
      createdBy: auth.user.id,
    });
    const errors = validateBundlePayload(record);
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    record.created_at = new Date().toISOString();
    const rows = await writeBundleRows(serviceRequest, "/rest/v1/article_bundles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    return Response.json({ bundle: bundleToUi(rows?.[0]) }, { status: 201 });
  } catch (error) {
    if (isMissingBundleTable(error)) {
      return Response.json({ error: MISSING_BUNDLE_TABLE_MESSAGE }, { status: 503 });
    }
    console.error("Article bundle create error", error.message);
    return Response.json({ error: "Création de groupe impossible." }, { status: 502 });
  }
}
