import { requireApiSession } from "../../../lib/api-auth";
import { serviceRoleConfigured } from "../../../lib/supabase-server";
import { listEntretienClientKeys, listEntretienClientNames, listEntretienContracts, listEntretienPilotage, listEntretienVisits } from "../../../lib/entretien-store";
import { isFieldMaintenanceTechnician } from "../../../lib/entretien-agenda";
import { visitNeedsReview } from "../../../lib/entretien";
import { keepEntretienPilotageRows, pickImportedContracts, preferKeyedClients, isUnlistedEntretienVisit, visitStatsByClient, pickLatestReviewByClient, effectiveVisitClientId } from "../../../lib/entretien-import";
import { rememberOrgPayload } from "../../../lib/org-payload-cache";

export const runtime = "nodejs";
export const maxDuration = 120;

function clientLabel(row) {
  return `${row?.prenom || ""} ${row?.nom || ""}`.trim() || row?.raison_sociale || "";
}

async function buildPilotagePayload(orgId) {
  const [pilotage, visits, contracts, clients, keys] = await Promise.all([
    listEntretienPilotage(orgId),
    listEntretienVisits(orgId),
    listEntretienContracts(orgId),
    listEntretienClientNames(orgId),
    listEntretienClientKeys(orgId),
  ]);
  const byClient = Object.fromEntries((clients || []).map(row => [row.id, row]));
  const keyedIds = (keys || []).map(row => row.client_id);
  const visitClientIds = (visits || []).map(row => row.client_id).filter(Boolean);
  const importedContracts = pickImportedContracts(contracts, { clients, keys });
  const importedIds = new Set(importedContracts.map(row => row.client_id));
  const importedByClient = Object.fromEntries(importedContracts.map(row => [row.client_id, row]));
  const withClient = row => {
    const client = byClient[row.client_id] || {};
    const contract = importedByClient[row.client_id] || {};
    return {
      ...row,
      client_name: clientLabel(client),
      client_city: client.ville || "",
      client_postal: client.code_postal || "",
      client_address: client.adresse || "",
      contract_number: contract.number || null,
      from_import: Boolean(row.client_id && importedIds.has(row.client_id)),
    };
  };
  const canonical = keepEntretienPilotageRows(
    preferKeyedClients(pilotage, { clients, keyedClientIds: keyedIds }),
    { keyedClientIds: keyedIds, visitClientIds }
  ).map(withClient);
  const byPilot = Object.fromEntries(canonical.map(row => [row.client_id, row]));
  const stats = visitStatsByClient(visits, { clientsById: byClient, includeSamples: false });
  const imported = importedContracts.map(row => {
    const labelled = withClient(row);
    const pilot = byPilot[row.client_id] || {};
    const stat = stats.get(row.client_id) || { count: 0, lastOn: "" };
    return {
      id: labelled.id,
      client_id: labelled.client_id,
      import_key: labelled.import_key,
      number: labelled.number || null,
      amount: labelled.amount,
      start_on: labelled.start_on || null,
      client_name: labelled.client_name,
      client_city: labelled.client_city,
      client_postal: labelled.client_postal,
      client_address: labelled.client_address,
      contract_number: labelled.contract_number,
      next_due_on: pilot.next_due_on || null,
      last_confirmed_entretien_on: pilot.last_confirmed_entretien_on || null,
      visit_count: stat.count,
      last_visit_on: stat.lastOn || null,
    };
  });
  const overdue = canonical.filter(row => row.is_confirmed_overdue && importedIds.has(row.client_id));
  const unknown = canonical.filter(row => row.is_last_entretien_unknown && importedIds.has(row.client_id));
  const toSchedule = imported.filter(row => !row.next_due_on && !row.last_confirmed_entretien_on).length;
  const unlisted = visits
    .filter(visit => isUnlistedEntretienVisit({ ...visit, client_id: effectiveVisitClientId(visit, byClient) }, importedIds))
    .sort((a, b) => String(b.scheduled_start || "").localeCompare(String(a.scheduled_start || "")))
    .map(visit => ({ kind: "visit", horsListe: true, ...withClient(visit) }));
  const unlistedIds = new Set(unlisted.map(row => row.id));
  const reviewAll = visits
    .filter(visit => (
      visitNeedsReview(visit)
      && importedIds.has(effectiveVisitClientId(visit, byClient))
      && !unlistedIds.has(visit.id)
    ))
    .sort((a, b) => String(b.scheduled_start || "").localeCompare(String(a.scheduled_start || "")))
    .map(visit => ({ kind: "visit", ...withClient(visit) }));
  const review = pickLatestReviewByClient(reviewAll);
  const starClients = imported.filter(row => Number(row.visit_count || 0) > 0).length;
  const starVisits = imported.reduce((sum, row) => sum + Number(row.visit_count || 0), 0);
  return {
    ok: true,
    counts: {
      overdue: overdue.length,
      unknown: unknown.length,
      review: review.length,
      reviewClients: review.length,
      reviewVisits: reviewAll.length,
      starClients,
      starVisits,
      unlisted: unlisted.length,
      contracts: imported.length,
      toSchedule,
      duplicatesHidden: Math.max(0, (pilotage || []).length - canonical.length),
      stockLocked: imported.length > 0,
      stockClients: imported.length,
      visitEvents: (visits || []).length,
    },
    overdue: overdue.slice(0, 80),
    unknown: unknown.slice(0, 80),
    review: review.slice(0, 200),
    unlisted: unlisted.slice(0, 200),
    contracts: imported,
  };
}

export async function GET(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  if (isFieldMaintenanceTechnician(auth.profile.role)) {
    return Response.json({ error: "Le technicien n’ouvre pas la liste des contrats." }, { status: 403 });
  }
  const orgId = auth.profile.organization_id;
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  try {
    const { payload, cached } = await rememberOrgPayload(
      "entretien-pilotage",
      orgId,
      () => buildPilotagePayload(orgId),
      { ttlMs: 90_000, fresh }
    );
    return Response.json(payload, {
      headers: {
        "Cache-Control": fresh ? "no-store" : "private, max-age=45",
        "X-Entretien-Cache": cached ? "hit" : "miss",
      },
    });
  } catch (error) {
    const message = String(error?.message || "Pilotage impossible.");
    if (/entretien_|schema cache|does not exist/i.test(message)) {
      return Response.json({ error: "Collez d’abord 20260932_entretien.sql dans Supabase.", sqlRequired: true }, { status: 503 });
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
