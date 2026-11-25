import { requireApiSession } from "../../lib/api-auth";
import {
  isKnownOrgStateKey,
  isReadOnlyOrgStateKey,
  mergeOrgStateRecords,
  orgRevisionConflicts,
  orgStateModuleForKey,
  stripDemoOrgRecords,
} from "../../lib/org-state";
import { canAccessModule } from "../../lib/permissions";
import { hydratePvProjectImages, persistPvProjectImages } from "../../lib/pv-study-assets";
import {
  isFieldSalesScopedOrgKey,
  prepareScopedRecordMutation,
  shouldScopeFieldSalesRecords,
} from "../../lib/record-scope";
import { scopeFieldSalesRecords } from "../../lib/record-scope-server";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

async function loadCurrentRow(organizationId, key) {
  const rows = await serviceRequest(
    `/rest/v1/crm_state?select=state_value,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&state_key=eq.${encodeURIComponent(key)}&limit=1`
  );
  return {
    value: stripDemoOrgRecords(key, rows?.[0]?.state_value),
    updatedAt: rows?.[0]?.updated_at || "",
  };
}

async function prepareOutgoingValue(organizationId, key, value) {
  if (key !== "mkl-pv-projects") return value;
  return hydratePvProjectImages(organizationId, value);
}

function denyUnlessModule(auth, key) {
  const moduleName = orgStateModuleForKey(key);
  if (!moduleName || !canAccessModule(auth.profile, moduleName)) {
    return Response.json({ error: "Accès refusé à cet état partagé." }, { status: 403 });
  }
  return null;
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const key = new URL(request.url).searchParams.get("key");
    if (!isKnownOrgStateKey(key)) {
      return Response.json({ error: "Clé d’état inconnue." }, { status: 400 });
    }
    const denied = denyUnlessModule(auth, key);
    if (denied) return denied;

    const current = await loadCurrentRow(auth.profile.organization_id, key);
    const loaded = await prepareOutgoingValue(auth.profile.organization_id, key, current.value);
    const { records: value } = await scopeFieldSalesRecords(auth.profile, auth.user.id, loaded, { orgKey: key });
    return Response.json({ key, value, updatedAt: current.updatedAt });
  } catch (error) {
    console.error("Org state read error", error.message);
    return Response.json({ error: "État organisation indisponible." }, { status: 502 });
  }
}

export async function PUT(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const { key, value, deletedIds, expectedUpdatedAt } = await request.json();
    if (!isKnownOrgStateKey(key) || !Array.isArray(value)) {
      return Response.json({ error: "État organisation invalide." }, { status: 400 });
    }
    const denied = denyUnlessModule(auth, key);
    if (denied) return denied;

    const currentRow = await loadCurrentRow(auth.profile.organization_id, key);
    if (orgRevisionConflicts(currentRow.updatedAt, expectedUpdatedAt)) {
      const loaded = await prepareOutgoingValue(auth.profile.organization_id, key, currentRow.value);
      const { records } = await scopeFieldSalesRecords(auth.profile, auth.user.id, loaded, { orgKey: key });
      return Response.json({
        error: "Cette liste vient d’être modifiée par quelqu’un d’autre. L’écran a été rechargé.",
        key,
        value: records,
        updatedAt: currentRow.updatedAt,
      }, { status: 409 });
    }

    if (isReadOnlyOrgStateKey(key)) {
      const loaded = await prepareOutgoingValue(auth.profile.organization_id, key, currentRow.value);
      const { records } = await scopeFieldSalesRecords(auth.profile, auth.user.id, loaded, { orgKey: key });
      return Response.json({ ok: true, key, value: records, updatedAt: currentRow.updatedAt, readOnly: true });
    }

    const incoming = stripDemoOrgRecords(
      key,
      key === "mkl-pv-projects"
        ? await persistPvProjectImages(auth.profile.organization_id, value)
        : value
    );
    const current = currentRow.value;
    const scoped = shouldScopeFieldSalesRecords(auth.profile) && isFieldSalesScopedOrgKey(key);
    let cleaned;
    if (scoped) {
      const { ctx } = await scopeFieldSalesRecords(auth.profile, auth.user.id, current, { orgKey: key });
      const { toDelete, toUpsert } = prepareScopedRecordMutation({
        current,
        incoming,
        deletedIds,
        canSee: ctx.canSee,
        userId: auth.user.id,
        scopedIds: ctx.scopedIds,
        stampOwners: true,
      });
      cleaned = mergeOrgStateRecords(current, toUpsert, toDelete);
    } else {
      cleaned = mergeOrgStateRecords(current, incoming, deletedIds);
    }

    const saved = await serviceRequest("/rest/v1/crm_state?on_conflict=organization_id,state_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: {
        organization_id: auth.profile.organization_id,
        state_key: key,
        state_value: cleaned,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
    });
    const outgoing = await prepareOutgoingValue(auth.profile.organization_id, key, cleaned);
    const { records } = await scopeFieldSalesRecords(auth.profile, auth.user.id, outgoing, { orgKey: key });
    return Response.json({
      ok: true,
      key,
      value: records,
      updatedAt: saved?.[0]?.updated_at || "",
    });
  } catch (error) {
    console.error("Org state write error", error.message);
    return Response.json({ error: "Enregistrement de l’état impossible." }, { status: 502 });
  }
}
