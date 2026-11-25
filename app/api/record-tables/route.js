import { requireApiSession } from "../../lib/api-auth";
import { collectDeletedIds } from "../../lib/org-state";
import { canAccessModule } from "../../lib/permissions";
import {
  isFieldSalesScopedRecordKind,
  prepareScopedRecordMutation,
  shouldScopeFieldSalesRecords,
} from "../../lib/record-scope";
import { scopeFieldSalesRecords } from "../../lib/record-scope-server";
import {
  deleteRecordRows,
  hydrateRecordTable,
  isKnownRecordTable,
  isRecordTableMissing,
  loadRecordTable,
  recordTableModules,
  upsertRecordRows,
} from "../../lib/record-tables";
import { serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

function denyUnlessModule(auth, kind) {
  const modules = recordTableModules(kind);
  if (!modules.length || !modules.some(name => canAccessModule(auth.profile, name))) {
    return Response.json({ error: "Accès refusé à ces dossiers." }, { status: 403 });
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

    const kind = new URL(request.url).searchParams.get("kind");
    if (!isKnownRecordTable(kind)) {
      return Response.json({ error: "Type de dossier inconnu." }, { status: 400 });
    }
    const denied = denyUnlessModule(auth, kind);
    if (denied) return denied;

    const loaded = await hydrateRecordTable(
      auth.profile.organization_id,
      kind,
      await loadRecordTable(auth.profile.organization_id, kind, auth.profile.id)
    );
    const { records: value } = await scopeFieldSalesRecords(auth.profile, auth.user.id, loaded, { kind });
    return Response.json({ kind, value });
  } catch (error) {
    if (isRecordTableMissing(error, new URL(request.url).searchParams.get("kind"))) {
      return Response.json({ error: "Tables dossiers absentes.", missing: true }, { status: 501 });
    }
    console.error("Record table read error", error.message);
    return Response.json({ error: "Dossiers indisponibles." }, { status: 502 });
  }
}

export async function PUT(request) {
  let kind = "";
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }

    const body = await request.json();
    kind = body.kind;
    const { value, deletedIds } = body;
    if (!isKnownRecordTable(kind) || !Array.isArray(value)) {
      return Response.json({ error: "Dossier invalide." }, { status: 400 });
    }
    const denied = denyUnlessModule(auth, kind);
    if (denied) return denied;

    const current = await loadRecordTable(auth.profile.organization_id, kind, auth.profile.id);
    const scoped = shouldScopeFieldSalesRecords(auth.profile) && isFieldSalesScopedRecordKind(kind);
    const { ctx } = await scopeFieldSalesRecords(auth.profile, auth.user.id, current, { kind });
    const { toDelete, toUpsert } = scoped
      ? prepareScopedRecordMutation({
          current,
          incoming: value,
          deletedIds,
          canSee: ctx.canSee,
          userId: auth.user.id,
          scopedIds: ctx.scopedIds,
          stampOwners: true,
        })
      : {
          toDelete: Array.isArray(deletedIds) ? deletedIds : collectDeletedIds(current, value),
          toUpsert: value,
        };
    await deleteRecordRows(auth.profile.organization_id, kind, toDelete);
    await upsertRecordRows(auth.profile.organization_id, kind, toUpsert, auth.user.id);
    const next = await hydrateRecordTable(
      auth.profile.organization_id,
      kind,
      await loadRecordTable(auth.profile.organization_id, kind, auth.profile.id)
    );
    const { records: scopedNext } = await scopeFieldSalesRecords(auth.profile, auth.user.id, next, { kind });
    return Response.json({ ok: true, kind, value: scopedNext });
  } catch (error) {
    if (isRecordTableMissing(error, kind)) {
      return Response.json({ error: "Tables dossiers absentes.", missing: true }, { status: 501 });
    }
    console.error("Record table write error", error.message);
    return Response.json({ error: "Enregistrement du dossier impossible." }, { status: 502 });
  }
}
