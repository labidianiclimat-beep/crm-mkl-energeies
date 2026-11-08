import { requireApiSession } from "../../../lib/api-auth";
import { FLEET_ACTIVITY_ACTIONS, importTemplateCsv, parseDelimitedTable, previewImport, todayIsoDate } from "../../../lib/fleet";
import { logFleet, requireFleetSession } from "../../../lib/fleet-api";
import { hydrateVehicles, insertAssignment, insertDeadline, insertExpense, insertVehicle, listOrgProfiles, listVehicles, updateVehicleRow } from "../../../lib/fleet-store";
import { serviceRoleConfigured } from "../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  return new Response(importTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"modele-parc-automobile.csv\"",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  try {
    const session = await requireFleetSession(auth);
    if (!session.ok) return Response.json({ error: session.error }, { status: session.status });
    if (!session.caps.canCreateVehicle) {
      return Response.json({ error: "Seul l’Admin VIP peut importer le parc." }, { status: 403 });
    }
    const body = await request.json();
    const parsed = parseDelimitedTable(body.csv || "");
    const existing = await hydrateVehicles(session.orgId, await listVehicles(session.orgId));
    const users = await listOrgProfiles(session.orgId);
    const preview = previewImport(parsed.rows, { existing, mapping: body.mapping || {}, users });
    if (!body.confirm) return Response.json({ preview, headers: parsed.headers });

    const created = [];
    const skipped = [];
    const errors = [];
    for (const item of preview.items) {
      if (item.duplicate) {
        skipped.push({ index: item.index, reason: "Déjà présent" });
        continue;
      }
      if (!item.ok) {
        errors.push({ index: item.index, errors: item.errors });
        continue;
      }
      try {
        const row = await insertVehicle(session.orgId, item.mapped, auth.user.id);
        if (item.mapped.currentKm) {
          await updateVehicleRow(session.orgId, row.id, {
            current_km: Number(item.mapped.currentKm),
            last_validated_reading_at: todayIsoDate(),
            updated_by: auth.user.id,
          });
        }
        const deadlinePairs = [
          ["entretien", item.mapped.entretienOn],
          ["controle", item.mapped.controleOn],
          ["assurance", item.mapped.assuranceOn],
          ["contrat", item.mapped.contratOn],
        ];
        for (const [kind, due] of deadlinePairs) {
          if (!due) continue;
          await insertDeadline(session.orgId, {
            vehicle_id: row.id,
            kind,
            title: kind,
            due_on: due,
          });
        }
        if (item.mapped.monthlyRent) {
          await insertExpense(session.orgId, {
            vehicle_id: row.id,
            category: "financement",
            occurred_on: item.mapped.entryDate || todayIsoDate(),
            amount_ttc: item.mapped.monthlyRent,
            status: "validated",
            created_by: auth.user.id,
            reviewed_by: auth.user.id,
            reviewed_at: new Date().toISOString(),
          });
        }
        if (item.mapped.yearlyInsurance) {
          await insertExpense(session.orgId, {
            vehicle_id: row.id,
            category: "assurance",
            occurred_on: item.mapped.entryDate || todayIsoDate(),
            amount_ttc: item.mapped.yearlyInsurance,
            status: "validated",
            created_by: auth.user.id,
            reviewed_by: auth.user.id,
            reviewed_at: new Date().toISOString(),
          });
        }
        if (item.driverId && session.caps.canAssign) {
          await insertAssignment(session.orgId, {
            vehicle_id: row.id,
            driver_id: item.driverId,
            started_on: item.mapped.assignmentDate || todayIsoDate(),
            start_km: item.mapped.currentKm || 0,
            status: "active",
            prepared_by: auth.user.id,
            validated_by: auth.user.id,
          });
          await updateVehicleRow(session.orgId, row.id, { status: "assigned", updated_by: auth.user.id });
        }
        created.push(row.internal_code);
      } catch (error) {
        errors.push({ index: item.index, errors: [error.message] });
      }
    }
    await logFleet(auth, FLEET_ACTIVITY_ACTIONS.VEHICLE_CREATE, { plate: "import", internalCode: "import" }, {
      newValue: { created: created.length, skipped: skipped.length, errors: errors.length },
    });
    return Response.json({ created, skipped, errors, preview });
  } catch (error) {
    return Response.json({ error: error.message || "Import impossible." }, { status: 400 });
  }
}
