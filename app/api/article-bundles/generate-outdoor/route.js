import { requireApiSession } from "../../../lib/api-auth";
import { articleToUi, canManageArticles } from "../../../lib/articles";
import {
  BUNDLE_SELECT,
  MISSING_BUNDLE_TABLE_MESSAGE,
  bundleToUi,
  climBundlesNeedingStandardAccessories,
  formToBundleRecord,
  heatPumpBundleDrafts,
  isMissingBundleTable,
  orgArticlesSelectPath,
  outdoorBundleDrafts,
  validateBundlePayload,
} from "../../../lib/article-bundles";
import { radiatorBundleDrafts } from "../../../lib/radiator-bundle";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

async function patchBundleItems(orgId, bundle) {
  const rows = await serviceRequest(
    `/rest/v1/article_bundles?id=eq.${encodeURIComponent(bundle.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { items: bundle.items, updated_at: new Date().toISOString() },
    }
  );
  return rows?.[0] ? bundleToUi(rows[0]) : null;
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

    const orgId = auth.profile.organization_id;
    const [articleRows, bundleRows] = await Promise.all([
      serviceRequest(orgArticlesSelectPath(orgId)),
      serviceRequest(`/rest/v1/article_bundles?select=${BUNDLE_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}`),
    ]);
    const articles = (articleRows || []).map(articleToUi);
    const existing = (bundleRows || []).map(bundleToUi);
    const drafts = [
      ...outdoorBundleDrafts(articles, existing),
      ...heatPumpBundleDrafts(articles, existing),
      ...radiatorBundleDrafts(articles, existing),
    ];
    const records = [];
    for (const draft of drafts) {
      const record = formToBundleRecord(draft, {
        organizationId: orgId,
        createdBy: auth.user.id,
      });
      const errors = validateBundlePayload(record);
      if (!errors.length) records.push({ ...record, created_at: new Date().toISOString() });
    }

    const patched = await Promise.all(
      climBundlesNeedingStandardAccessories(existing, articles)
        .filter(bundle => bundle.id)
        .map(bundle => patchBundleItems(orgId, bundle))
    );
    const updated = patched.filter(Boolean);

    let created = [];
    if (records.length) {
      const rows = await serviceRequest("/rest/v1/article_bundles", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: records,
      });
      created = (rows || []).map(bundleToUi);
    }

    return Response.json({
      created,
      updated,
      count: created.length,
      existing: existing.length,
    });
  } catch (error) {
    if (isMissingBundleTable(error)) {
      return Response.json({ error: MISSING_BUNDLE_TABLE_MESSAGE, created: [] }, { status: 503 });
    }
    console.error("Outdoor bundle generate error", error.message);
    return Response.json({ error: "Impossible de créer les groupes." }, { status: 502 });
  }
}
