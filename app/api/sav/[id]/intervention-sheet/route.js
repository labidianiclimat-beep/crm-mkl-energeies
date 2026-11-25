import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requireApiSession } from "../../../../lib/api-auth";
import { loadCompany } from "../../../../lib/company-store";
import { SAV_MODULE } from "../../../../lib/sav";
import { buildSavInterventionPdf, interventionSheetModel } from "../../../../lib/sav-intervention-sheet";
import { getSavCase, isMissingSavTable, MISSING_SAV_MESSAGE } from "../../../../lib/sav-server";
import { serviceRoleConfigured } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

function logoData() {
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "mkl-energies.png"));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

export async function GET(request, { params }) {
  const auth = await requireApiSession(request, { module: SAV_MODULE });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  }
  try {
    const { id } = await params;
    const result = await getSavCase(auth, id, { skipOpen: true });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 404 });
    const company = await loadCompany(auth.profile.organization_id);
    const model = interventionSheetModel(result.case, company);
    const pdf = await buildSavInterventionPdf(model, { logoData: logoData() });
    const name = `${model.number || "bon-intervention"}.pdf`;
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isMissingSavTable(error)) {
      return Response.json({ error: MISSING_SAV_MESSAGE, missing: true }, { status: 503 });
    }
    console.error("SAV bon d’intervention", error?.message || error);
    return Response.json({ error: "Le bon d’intervention n’a pas pu être préparé." }, { status: 503 });
  }
}
