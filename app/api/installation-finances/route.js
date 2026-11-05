import { requireApiSession } from "../../lib/api-auth";
import {
  assembleInstallationFinances,
  canReadInstallationFinance,
} from "../../lib/installation-finance";
import {
  installationFinanceUnavailable,
  readInstallationFinances,
} from "../../lib/installation-finance-server";
import { serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

const CONFIDENTIAL = "Ces montants sont confidentiels.";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canReadInstallationFinance(auth.profile?.role)) {
      return Response.json({ error: CONFIDENTIAL }, { status: 403 });
    }
    if (!serviceRoleConfigured()) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
    }
    const packed = await readInstallationFinances(auth.profile.organization_id);
    return Response.json({
      finances: assembleInstallationFinances(packed.rows, packed.purchases, packed.people),
    });
  } catch (error) {
    if (installationFinanceUnavailable(error)) {
      return Response.json({ error: "Le script des montants de chantier n’est pas encore dans Supabase.", missing: true }, { status: 501 });
    }
    console.error("installation finance list failed");
    return Response.json({ error: "Montants indisponibles." }, { status: 502 });
  }
}
