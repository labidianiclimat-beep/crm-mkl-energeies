import { requireApiSession } from "../../../../lib/api-auth";
import {
  assembleInstallationFinances,
  canReadInstallationFinance,
  canWriteInstallationFinance,
  financeWriteResponse,
  installationFinanceAudit,
  isInstallationId,
  validateInstallationFinance,
} from "../../../../lib/installation-finance";
import {
  assertInstallationSalesCommercial,
  deleteInstallationFinance,
  installationFinanceUnavailable,
  readInstallationFinance,
  saveInstallationFinance,
} from "../../../../lib/installation-finance-server";
import { actorFromAuth, logActivity } from "../../../../lib/log-activity";
import { serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

const CONFIDENTIAL = "Ces montants sont confidentiels.";
const FORBIDDEN_WRITE = "Vous ne pouvez pas renseigner les montants de ce chantier.";

function unavailable(error) {
  if (installationFinanceUnavailable(error)) {
    return Response.json({ error: "Le script des montants de chantier n’est pas encore dans Supabase.", missing: true }, { status: 501 });
  }
  return null;
}

export async function GET(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadInstallationFinance(auth.profile?.role)) {
      return Response.json({ error: CONFIDENTIAL }, { status: 403 });
    }
    const { id } = await params;
    if (!isInstallationId(id)) return Response.json({ error: "Chantier invalide." }, { status: 400 });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const packed = await readInstallationFinance(auth.profile.organization_id, id);
    const [finance] = assembleInstallationFinances(packed.rows, packed.purchases, packed.people);
    if (!finance) return Response.json({ error: "Aucun montant enregistré." }, { status: 404 });
    return Response.json({ finance });
  } catch (error) {
    const missing = unavailable(error);
    if (missing) return missing;
    console.error("installation finance read failed");
    return Response.json({ error: "Montants indisponibles." }, { status: 502 });
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canWriteInstallationFinance(auth.profile?.role)) {
      return Response.json({ error: FORBIDDEN_WRITE }, { status: 403 });
    }
    const { id } = await params;
    if (!isInstallationId(id)) return Response.json({ error: "Chantier invalide." }, { status: 400 });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const body = await request.json().catch(() => null);
    const parsed = validateInstallationFinance(body || {});
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const commercial = await assertInstallationSalesCommercial(auth.profile.organization_id, parsed.commercialId);
    if (!commercial.ok) return Response.json({ error: commercial.error }, { status: 400 });
    const actor = actorFromAuth(auth);
    await saveInstallationFinance({
      organizationId: auth.profile.organization_id,
      installationId: id,
      userId: actor.userId,
      parsed,
    });
    const audit = installationFinanceAudit(parsed);
    await logActivity({
      ...actor,
      action: audit.action,
      module: audit.module,
      entityType: audit.entityType,
      entityId: id,
      oldValue: audit.oldValue,
      newValue: audit.newValue,
    });
    const canRead = canReadInstallationFinance(auth.profile?.role);
    if (!canRead) return Response.json(financeWriteResponse(false));
    const packed = await readInstallationFinance(auth.profile.organization_id, id);
    const [finance] = assembleInstallationFinances(packed.rows, packed.purchases, packed.people);
    return Response.json(financeWriteResponse(true, finance || null));
  } catch (error) {
    const missing = unavailable(error);
    if (missing) return missing;
    console.error("installation finance save failed");
    return Response.json({ error: "Enregistrement des montants impossible." }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canWriteInstallationFinance(auth.profile?.role) && !canReadInstallationFinance(auth.profile?.role)) {
      return Response.json({ error: FORBIDDEN_WRITE }, { status: 403 });
    }
    const { id } = await params;
    if (!isInstallationId(id)) return Response.json({ error: "Chantier invalide." }, { status: 400 });
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    await deleteInstallationFinance(auth.profile.organization_id, id);
    return Response.json({ ok: true });
  } catch (error) {
    const missing = unavailable(error);
    if (missing) return missing;
    console.error("installation finance delete failed");
    return Response.json({ error: "Suppression des montants impossible." }, { status: 502 });
  }
}
