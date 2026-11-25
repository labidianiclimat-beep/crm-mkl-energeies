import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { isFieldMaintenanceTechnician } from "../../../lib/entretien-agenda";
import { canConfirmEntretienImport } from "../../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../../lib/supabase-server";
import {
  SOURCE_KIND,
  csvToRows,
  inspectInvoiceMapping,
  inspectXlsxMapping,
  previewEntretienImport,
  previewInvoiceImport,
  recordsFromTable,
  rowsFromInvoiceBuffer,
  rowsFromXlsx,
} from "../../../lib/entretien-import";
import { importEntretienInvoiceItems, importEntretienPreviewItems, listEntretienClientKeys, listEntretienClientNames } from "../../../lib/entretien-store";
import { forgetOrgPayload } from "../../../lib/org-payload-cache";

export const runtime = "nodejs";
export const maxDuration = 300;

function decodeFile(input) {
  if (!input) return null;
  if (Buffer.isBuffer(input)) return input;
  const raw = String(input);
  if (raw.startsWith("data:")) return Buffer.from(raw.slice(raw.indexOf(",") + 1), "base64");
  return Buffer.from(raw, "base64");
}

async function loadOrgClients(orgId) {
  return listEntretienClientNames(orgId);
}

function clientsToUi(rows) {
  return (rows || []).map(row => ({
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    lastName: row.nom,
    firstName: row.prenom,
    name: `${row.prenom || ""} ${row.nom || ""}`.trim() || row.raison_sociale,
    company: row.raison_sociale,
    address: row.adresse,
    postalCode: row.code_postal,
    city: row.ville,
    phone: row.telephone,
    mobile: row.telephone_secondaire,
    email: row.email,
  }));
}

function invoiceFilesFromBody(body) {
  const list = Array.isArray(body.invoices) ? body.invoices : [];
  const records = [];
  const mappings = [];
  let skipped = 0;
  for (const file of list) {
    const buffer = decodeFile(file);
    if (!buffer) continue;
    const parsed = rowsFromInvoiceBuffer(buffer);
    records.push(...(parsed.records || []));
    skipped += parsed.skipped || 0;
    mappings.push(inspectInvoiceMapping(buffer));
  }
  return { records, skipped, mappings };
}

function buildPreview(body, clients) {
  const yildizFile = body.yildiz ? decodeFile(body.yildiz) : null;
  const rebeccaFile = body.rebecca ? decodeFile(body.rebecca) : null;
  const sheetFile = body.sheet ? decodeFile(body.sheet) : null;
  const yildiz = yildizFile ? rowsFromXlsx(yildizFile, SOURCE_KIND.yildiz) : (body.yildizRows || []);
  const rebecca = rebeccaFile ? rowsFromXlsx(rebeccaFile, SOURCE_KIND.rebecca) : (body.rebeccaRows || []);
  const sheet = body.sheetCsv
    ? recordsFromTable(csvToRows(body.sheetCsv), SOURCE_KIND.sheet)
    : sheetFile ? rowsFromXlsx(sheetFile, SOURCE_KIND.sheet) : (body.sheetRows || []);
  return {
    yildiz,
    rebecca,
    sheet,
    mappings: {
      yildiz: yildizFile ? inspectXlsxMapping(yildizFile, SOURCE_KIND.yildiz) : null,
      rebecca: rebeccaFile ? inspectXlsxMapping(rebeccaFile, SOURCE_KIND.rebecca) : null,
    },
    preview: previewEntretienImport({ yildiz, rebecca, sheet, clients }),
  };
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  if (isFieldMaintenanceTechnician(auth.profile.role)) {
    return Response.json({ error: "Le technicien n’importe pas le stock clients." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const orgId = auth.profile.organization_id;
  const clients = clientsToUi(await loadOrgClients(orgId).catch(() => []));
  const invoiceInput = invoiceFilesFromBody(body);
  const invoicePreview = invoiceInput.records.length || body.confirmInvoices
    ? previewInvoiceImport({ rows: invoiceInput.records, clients })
    : null;
  if (body.confirmInvoices) {
    if (!canConfirmEntretienImport(auth.profile)) {
      return Response.json({ error: "Seul un administrateur ou la direction peut valider l’import." }, { status: 403 });
    }
    if (!invoicePreview?.items?.length) {
      return Response.json({ error: "Aucune facture d’entretien à intégrer." }, { status: 400 });
    }
    try {
      const result = await importEntretienInvoiceItems(orgId, invoicePreview.items, { userId: auth.user.id });
      forgetOrgPayload("entretien-pilotage", orgId);
      await logActivity({
        actor: actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.ENTRETIEN_IMPORT,
        entityType: "entretien_import",
        entityId: result.jobId,
        summary: `Factures entretien : ${result.created} clients créés, ${result.linked} déjà présents, ${result.interventions} interventions, ${result.review} à relire.`,
      }).catch(() => null);
      return Response.json({
        ok: true,
        ...result,
        counts: invoicePreview.counts,
        skipped: invoiceInput.skipped,
      });
    } catch (error) {
      return Response.json({ error: String(error?.message || "Import des factures impossible.") }, { status: 502 });
    }
  }
  const built = buildPreview(body, clients);
  if (!body.confirm) {
    return Response.json({
      ok: true,
      written: false,
      sheetStatus: null,
      mappings: built.mappings,
      counts: built.preview.counts,
      items: built.preview.items.slice(0, 80),
      review: built.preview.items.filter(item => item.matchStatus === "review").slice(0, 40),
      invoices: invoicePreview ? {
        counts: { ...invoicePreview.counts, skipped: invoiceInput.skipped },
        mappings: invoiceInput.mappings,
        items: invoicePreview.items.slice(0, 80),
        review: invoicePreview.items.filter(item => item.matchStatus === "review").slice(0, 40),
      } : null,
    });
  }
  if (!canConfirmEntretienImport(auth.profile)) {
    return Response.json({ error: "Seul un administrateur ou la direction peut valider l’import." }, { status: 403 });
  }
  const existingKeys = await listEntretienClientKeys(orgId).catch(() => []);
  if ((existingKeys || []).length && !body.forceUnlock) {
    return Response.json({
      ok: false,
      locked: true,
      error: `La base entretien est figée (${existingKeys.length} fiches). Elle est déjà en Supabase : inutile de réimporter les Excel. Pour forcer un nouvel import, saisissez DEBLOQUER.`,
      count: existingKeys.length,
    }, { status: 409 });
  }
  if ((existingKeys || []).length && String(body.forceUnlock || "").trim().toUpperCase() !== "DEBLOQUER") {
    return Response.json({
      ok: false,
      locked: true,
      error: "Pour déverrouiller l’import, saisissez exactement DEBLOQUER.",
      count: existingKeys.length,
    }, { status: 409 });
  }
  try {
    const result = await importEntretienPreviewItems(orgId, built.preview.items, { userId: auth.user.id });
    forgetOrgPayload("entretien-pilotage", orgId);
    await logActivity({
      actor: actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.ENTRETIEN_IMPORT,
      entityType: "entretien_import",
      entityId: result.jobId,
      summary: `Import entretien : ${result.created} créés, ${result.linked} liés, ${result.review} à relire.`,
    }).catch(() => null);
    return Response.json({ ok: true, ...result, counts: built.preview.counts });
  } catch (error) {
    const message = String(error?.message || "Import impossible.");
    if (/entretien_|schema cache|does not exist/i.test(message)) {
      return Response.json({ error: "Collez d’abord 20260932_entretien.sql dans Supabase." }, { status: 503 });
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
