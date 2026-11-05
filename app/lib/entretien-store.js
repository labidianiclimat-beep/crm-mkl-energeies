import { serviceRequest } from "./supabase-server.js";
import { listAllRows } from "./supabase-list.js";
import { formToClientRecord } from "./clients.js";
import { applyRealization } from "./entretien.js";
import { buildManualEntretienContract } from "./entretien-agenda.js";
import { blankClientFill, historicalInvoiceFromRecord, invoiceVisitDraft } from "./entretien-import.js";

function orgFilter(orgId) {
  return `organization_id=eq.${encodeURIComponent(orgId)}`;
}

const VISIT_LIST_SELECT = "id,client_id,title,location,description,scheduled_start,scheduled_end,nature_status,nature_validated,nature_proposed,realization_status,realization_date,client_link_status,technician_id,source,signals";
const CONTRACT_LIST_SELECT = "id,client_id,number,frequency,amount,status,notes,start_on,updated_at";

export async function listEntretienContracts(orgId) {
  return listAllRows(`/rest/v1/entretien_contracts?${orgFilter(orgId)}&select=${CONTRACT_LIST_SELECT}&order=updated_at.desc`);
}

export async function listCrmMaintenanceContracts(orgId) {
  return listAllRows(
    `/rest/v1/maintenance_contracts?${orgFilter(orgId)}&select=record_id,client_id,client_name,title,status,payload`
  ).catch(() => []);
}

export async function listEntretienPilotage(orgId) {
  return listAllRows(`/rest/v1/entretien_client_pilotage?${orgFilter(orgId)}&select=*`, { idKey: "client_id" });
}

export async function listEntretienVisits(orgId, extra = "") {
  return listAllRows(`/rest/v1/entretien_visits?${orgFilter(orgId)}&select=${VISIT_LIST_SELECT}${extra}&order=scheduled_start.desc.nullslast`);
}

export async function listEntretienVisitSamples(orgId, clientId) {
  const id = encodeURIComponent(String(clientId || ""));
  return serviceRequest(
    `/rest/v1/entretien_visits?${orgFilter(orgId)}&client_id=eq.${id}&select=id,title,location,scheduled_start&order=scheduled_start.desc.nullslast&limit=8`
  ) || [];
}

export async function listEntretienInvoices(orgId) {
  return listAllRows(`/rest/v1/entretien_invoices?${orgFilter(orgId)}&select=*&order=invoice_date.desc.nullslast`);
}

export async function patchClientSite(orgId, clientId, { address, postal, city } = {}) {
  const rows = await serviceRequest(
    `/rest/v1/clients?${orgFilter(orgId)}&id=eq.${encodeURIComponent(clientId)}&select=id,adresse,code_postal,ville,nom,prenom,raison_sociale&limit=1`
  );
  const existing = rows?.[0];
  if (!existing) return null;
  if (existing.adresse === address && existing.code_postal === postal && existing.ville === city) {
    return { row: existing, changed: false };
  }
  const updated = await serviceRequest(
    `/rest/v1/clients?${orgFilter(orgId)}&id=eq.${encodeURIComponent(clientId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: {
        adresse: address,
        code_postal: postal,
        ville: city,
        updated_at: new Date().toISOString(),
      },
    }
  );
  return { row: updated?.[0] || existing, changed: true, previous: existing };
}

export async function listEntretienClientNames(orgId) {
  return listAllRows(`/rest/v1/clients?${orgFilter(orgId)}&select=id,nom,prenom,raison_sociale,adresse,code_postal,ville,telephone,telephone_secondaire,email`);
}

export async function listEntretienClientKeys(orgId) {
  return listAllRows(`/rest/v1/entretien_client_keys?${orgFilter(orgId)}&select=import_key,client_id`, { idKey: "import_key" });
}

export async function upsertGoogleVisit(orgId, draft) {
  const existing = await serviceRequest(
    `/rest/v1/entretien_visits?${orgFilter(orgId)}&google_user_id=eq.${encodeURIComponent(draft.google_user_id || "")}&google_event_id=eq.${encodeURIComponent(draft.google_event_id)}&select=id,realization_status,nature_status,nature_validated,client_id,client_link_status`
  );
  const row = existing?.[0];
  if (row?.id) {
    const body = {
      title: draft.title,
      location: draft.location,
      description: draft.description,
      scheduled_start: draft.scheduled_start,
      scheduled_end: draft.scheduled_end,
      google_status: draft.google_status,
      google_updated_at: draft.google_updated_at,
      signals: draft.signals,
      updated_at: new Date().toISOString(),
    };
    if (row.nature_status === "brut" || row.nature_status === "propose" || row.nature_status === "ambigu") {
      body.nature_proposed = draft.nature_proposed;
      body.nature_status = draft.nature_status;
    }
    if (row.client_link_status === "valide" || row.client_link_status === "rejete") {
      // keep the human decision
    } else if (draft.client_id) {
      body.client_id = draft.client_id;
      body.client_link_status = draft.client_link_status || "propose";
    } else if (row.client_id && row.client_link_status === "propose") {
      body.client_id = null;
      body.client_link_status = "non_rapproche";
    }
    await serviceRequest(`/rest/v1/entretien_visits?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body,
    });
    return { id: row.id, created: false };
  }
  const inserted = await serviceRequest("/rest/v1/entretien_visits", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { ...draft, organization_id: orgId },
  });
  return { id: inserted?.[0]?.id || inserted?.id, created: true };
}

export async function deleteEntretienVisit(orgId, visitId) {
  await serviceRequest(
    `/rest/v1/entretien_visits?${orgFilter(orgId)}&id=eq.${encodeURIComponent(visitId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
}

export async function patchEntretienVisit(orgId, visitId, patch) {
  const rows = await serviceRequest(
    `/rest/v1/entretien_visits?${orgFilter(orgId)}&id=eq.${encodeURIComponent(visitId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: { ...patch, updated_at: new Date().toISOString() } }
  );
  return rows?.[0] || null;
}

export async function saveGoogleSyncState(orgId, userId, calendarId, extra = {}) {
  await serviceRequest("/rest/v1/entretien_google_sync_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      organization_id: orgId,
      user_id: userId,
      calendar_id: calendarId || "primary",
      updated_at: new Date().toISOString(),
      ...extra,
    },
  });
}

export function clientRecordFromImport(item, { organizationId, createdBy }) {
  return formToClientRecord({
    customerType: "Particulier",
    lastName: item.nom,
    firstName: item.prenom || "",
    address: item.adresse,
    postalCode: item.codePostal,
    city: item.ville,
    phone: item.phone,
    email: item.email,
    status: "Client",
    source: "Import entretien",
    notes: [item.equipment, item.origin, item.notes].filter(Boolean).join(" — "),
  }, { organizationId, createdBy, defaultCommercialId: null });
}

async function mapInChunks(items, size, worker) {
  const results = [];
  for (let index = 0; index < items.length; index += size) {
    const slice = items.slice(index, index + size);
    results.push(...await Promise.all(slice.map(worker)));
  }
  return results;
}

function slimImportRow(item) {
  return {
    matchKey: item.matchKey,
    displayName: item.displayName,
    matchStatus: item.matchStatus,
    contractNumber: item.contractNumber || null,
    amountHt: item.amountHt,
    sources: item.sources || [item.source],
  };
}

export async function importEntretienPreviewItems(orgId, items, { userId } = {}) {
  const job = (await serviceRequest("/rest/v1/entretien_import_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      organization_id: orgId,
      kind: "client",
      filename: "yildiz+rebecca",
      status: "imported",
      created_by: userId || null,
    },
  }))?.[0];

  const existingKeys = await listEntretienClientKeys(orgId).catch(() => []);
  const existingContracts = await listEntretienContracts(orgId).catch(() => []);
  const clientIdByKey = new Map((existingKeys || []).map(row => [row.import_key, row.client_id]));
  const clientsWithContract = new Set((existingContracts || []).map(row => row.client_id).filter(Boolean));
  let created = 0;
  let linked = 0;
  let review = 0;
  const usedNumbers = new Set((existingContracts || []).map(row => row.number).filter(Boolean));
  const prepared = (items || []).map(item => {
    const number = item.contractNumber || null;
    const uniqueNumber = number && !usedNumbers.has(number) ? (usedNumbers.add(number), number) : null;
    return { item, uniqueNumber, excelNumber: number };
  });
  await mapInChunks(prepared, 12, async ({ item, uniqueNumber, excelNumber }) => {
    if (item.matchKey && clientIdByKey.has(item.matchKey)) {
      const existingClientId = clientIdByKey.get(item.matchKey);
      linked += 1;
      if (existingClientId && !clientsWithContract.has(existingClientId)) {
        await serviceRequest("/rest/v1/entretien_contracts", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: {
            organization_id: orgId,
            client_id: existingClientId,
            number: uniqueNumber,
            frequency: "Annuelle",
            amount: item.amountHt,
            start_on: item.subscribedOn || item.signedOn || null,
            status: item.signed === false ? "inconnu" : "Actif",
            notes: [
              item.equipment,
              item.origin,
              excelNumber && !uniqueNumber ? `n° Excel ${excelNumber}` : "",
              item.signed === true ? "Contrat signé" : item.signed === false ? "Contrat non signé" : "",
            ].filter(Boolean).join(" — "),
            created_by: userId || null,
          },
        }).catch(() => null);
        clientsWithContract.add(existingClientId);
      }
      return;
    }
    let clientId = item.clientId || null;
    if (item.matchStatus === "review") {
      review += 1;
    } else if (item.matchStatus === "linked" && clientId) {
      linked += 1;
    } else if (!clientId) {
      try {
        const record = clientRecordFromImport(item, { organizationId: orgId, createdBy: userId });
        const inserted = await serviceRequest("/rest/v1/clients", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: record,
        });
        clientId = inserted?.[0]?.id || inserted?.id || null;
        if (clientId) {
          created += 1;
          if (item.matchKey) clientIdByKey.set(item.matchKey, clientId);
        }
        else review += 1;
      } catch {
        review += 1;
      }
    }
    const importRow = clientId ? (await serviceRequest("/rest/v1/entretien_import_rows", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        organization_id: orgId,
        job_id: job?.id,
        raw: slimImportRow(item),
        mapped: slimImportRow(item),
        match_status: item.matchStatus === "linked" ? "linked" : item.matchStatus === "review" ? "review" : "created",
        client_id: clientId,
      },
    }).catch(() => null))?.[0] : null;
    if (!clientId) return;
    await serviceRequest("/rest/v1/entretien_client_keys", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        organization_id: orgId,
        import_key: item.matchKey,
        client_id: clientId,
        source_job_id: job?.id,
      },
    }).catch(() => null);
    if (clientsWithContract.has(clientId)) return;
    const number = excelNumber;
    await serviceRequest("/rest/v1/entretien_contracts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        organization_id: orgId,
        client_id: clientId,
        number: uniqueNumber,
        frequency: "Annuelle",
        amount: item.amountHt,
        start_on: item.subscribedOn || item.signedOn || null,
        status: item.signed === false ? "inconnu" : "Actif",
        notes: [
          item.equipment,
          item.origin,
          number && !uniqueNumber ? `n° Excel ${number}` : "",
          item.signed === true ? "Contrat signé" : item.signed === false ? "Contrat non signé" : "",
        ].filter(Boolean).join(" — "),
        created_by: userId || null,
      },
    }).catch(() => null);
    clientsWithContract.add(clientId);
    const invoice = historicalInvoiceFromRecord(item, { clientId, importRowId: importRow?.id });
    if (invoice.devis_id) throw new Error("Une facture historique ne peut pas porter un devis CRM.");
    await serviceRequest("/rest/v1/entretien_invoices", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { organization_id: orgId, created_by: userId || null, ...invoice, devis_id: null },
    }).catch(() => null);
  });
  if (job?.id) {
    await serviceRequest(`/rest/v1/entretien_import_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { created_count: created, linked_count: linked, review_count: review, status: "imported" },
    });
  }
  return { jobId: job?.id, created, linked, review };
}

export async function importEntretienInvoiceItems(orgId, items, { userId } = {}) {
  const job = (await serviceRequest("/rest/v1/entretien_import_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      organization_id: orgId,
      kind: "invoice",
      filename: "factures-entretien",
      status: "imported",
      created_by: userId || null,
    },
  }))?.[0];
  const [existingInvoices, invoiceVisits, clientRows] = await Promise.all([
    listEntretienInvoices(orgId).catch(() => []),
    listEntretienVisits(orgId, "&source=eq.facture_indice").catch(() => []),
    listEntretienClientNames(orgId).catch(() => []),
  ]);
  const knownNumbers = new Set((existingInvoices || []).map(row => row.external_number).filter(Boolean));
  const visitKeys = new Set((invoiceVisits || []).map(row => `${row.client_id}|${String(row.realization_date || "").slice(0, 10)}`));
  const clientsById = new Map((clientRows || []).map(row => [row.id, row]));
  const createdIds = new Map();
  const groups = new Map();
  for (const item of items || []) {
    const key = item.provisionalId || item.clientId || item.externalNumber || `${item.matchKey}|${item.interventionOn}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  async function importOne(item) {
    const tally = { created: 0, linked: 0, review: 0, interventions: 0 };
    if (item.matchStatus === "review" || !item.interventionOn || !item.externalNumber) {
      tally.review = 1;
      return tally;
    }
    if (String(item.externalNumber).startsWith("FAC-")) {
      tally.review = 1;
      return tally;
    }
    if (knownNumbers.has(item.externalNumber)) {
      tally.linked = 1;
      return tally;
    }
    let clientId = item.clientId || null;
    if (item.provisionalId && createdIds.has(item.provisionalId)) {
      clientId = createdIds.get(item.provisionalId);
    } else if (!clientId) {
      try {
        const record = clientRecordFromImport(item, { organizationId: orgId, createdBy: userId });
        const inserted = await serviceRequest("/rest/v1/clients", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: record,
        });
        clientId = inserted?.[0]?.id || null;
        if (!clientId) {
          tally.review = 1;
          return tally;
        }
        tally.created = 1;
        clientsById.set(clientId, {
          id: clientId,
          nom: item.nom,
          prenom: item.prenom,
          adresse: item.adresse,
          code_postal: item.codePostal,
          ville: item.ville,
          telephone: item.phone,
          email: item.email,
        });
        if (item.provisionalId) createdIds.set(item.provisionalId, clientId);
      } catch {
        tally.review = 1;
        return tally;
      }
    } else {
      tally.linked = 1;
      const existing = clientsById.get(clientId);
      const patch = existing ? blankClientFill(existing, item) : {};
      if (Object.keys(patch).length) {
        await serviceRequest(`/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&${orgFilter(orgId)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: { ...patch, updated_at: new Date().toISOString() },
        }).catch(() => null);
        Object.assign(existing, patch);
      }
    }
    const invoice = {
      origin: "historique",
      external_number: item.externalNumber,
      invoice_date: item.interventionOn,
      amount_ht: item.amountHt,
      amount_tva: item.amountTva ?? null,
      amount_ttc: item.amountTtc ?? null,
      client_id: clientId,
      client_link_status: "valide",
      payment_status: "inconnu",
      visit_date_hint: item.interventionOn,
      document_ref: item.sheet || "facture",
      devis_id: null,
      notes: [item.label, item.kind].filter(Boolean).join(" — "),
    };
    if (invoice.devis_id) throw new Error("Une facture historique ne peut pas porter un devis CRM.");
    const insertedInvoice = await serviceRequest("/rest/v1/entretien_invoices", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { organization_id: orgId, created_by: userId || null, ...invoice },
    }).catch(() => null);
    knownNumbers.add(item.externalNumber);
    const visitKey = `${clientId}|${item.interventionOn}`;
    if (visitKeys.has(visitKey)) return tally;
    const visit = invoiceVisitDraft(item, { clientId, userId, date: item.interventionOn });
    if (!visit.realization_recorded_by || !visit.realization_date) {
      tally.review = 1;
      return tally;
    }
    const insertedVisit = await serviceRequest("/rest/v1/entretien_visits", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { organization_id: orgId, ...visit },
    }).catch(() => null);
    const visitId = insertedVisit?.[0]?.id;
    if (!visitId) return tally;
    visitKeys.add(visitKey);
    tally.interventions = 1;
    const invoiceId = insertedInvoice?.[0]?.id;
    if (invoiceId) {
      await serviceRequest("/rest/v1/entretien_invoice_visit_links", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          organization_id: orgId,
          invoice_id: invoiceId,
          visit_id: visitId,
          linked_by: userId || null,
          notes: "Date de facturation retenue comme intervention.",
        },
      }).catch(() => null);
    }
    return tally;
  }
  const tallies = (await mapInChunks([...groups.values()], 6, async group => {
    const rows = [];
    for (const item of group) rows.push(await importOne(item));
    return rows;
  })).flat();
  const created = tallies.reduce((sum, row) => sum + (row?.created || 0), 0);
  const linked = tallies.reduce((sum, row) => sum + (row?.linked || 0), 0);
  const review = tallies.reduce((sum, row) => sum + (row?.review || 0), 0);
  const interventions = tallies.reduce((sum, row) => sum + (row?.interventions || 0), 0);
  if (job?.id) {
    await serviceRequest(`/rest/v1/entretien_import_jobs?id=eq.${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { created_count: created, linked_count: linked, review_count: review, status: "imported" },
    });
  }
  return { jobId: job?.id, created, linked, review, interventions };
}

export async function listEntretienTechnicians(orgId) {
  const rows = await serviceRequest(
    `/rest/v1/profiles?${orgFilter(orgId)}&select=id,full_name,email,role,active&order=full_name.asc`
  ).catch(() => []);
  return rows || [];
}

export async function ensureEntretienContractForClient(orgId, clientId, { startOn, actorId } = {}) {
  const id = String(clientId || "").trim();
  if (!id) throw new Error("Client manquant.");
  const clients = await serviceRequest(
    `/rest/v1/clients?${orgFilter(orgId)}&id=eq.${encodeURIComponent(id)}&select=id&limit=1`
  );
  if (!clients?.[0]) throw new Error("Ce client n’est pas dans la base.");
  const existing = await serviceRequest(
    `/rest/v1/entretien_contracts?${orgFilter(orgId)}&client_id=eq.${encodeURIComponent(id)}&select=id,client_id,number,status&order=updated_at.desc&limit=1`
  );
  if (existing?.[0]) return { contract: existing[0], created: false };
  const inserted = await serviceRequest("/rest/v1/entretien_contracts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: buildManualEntretienContract({ organizationId: orgId, clientId: id, startOn, actorId }),
  });
  const contract = inserted?.[0];
  if (!contract?.id) throw new Error("Contrat d’entretien impossible.");
  return { contract, created: true };
}

export async function insertCrmVisit(orgId, record) {
  const inserted = await serviceRequest("/rest/v1/entretien_visits", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { ...record, organization_id: orgId },
  });
  return inserted?.[0] || inserted;
}

export async function readEntretienContract(orgId, contractId) {
  const rows = await serviceRequest(
    `/rest/v1/entretien_contracts?${orgFilter(orgId)}&id=eq.${encodeURIComponent(contractId)}&select=id,client_id,notes`
  );
  return rows?.[0] || null;
}

export async function patchEntretienContract(orgId, contractId, patch = {}) {
  const body = { updated_at: new Date().toISOString() };
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.end_on !== undefined) body.end_on = patch.end_on;
  const rows = await serviceRequest(
    `/rest/v1/entretien_contracts?${orgFilter(orgId)}&id=eq.${encodeURIComponent(contractId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body }
  );
  return rows?.[0] || null;
}

export async function patchEntretienContractNotes(orgId, contractId, notes) {
  return patchEntretienContract(orgId, contractId, { notes });
}

export function visitPatchFromReview(body, actorId) {
  const at = new Date().toISOString();
  const patch = {};
  if (body.technicianId !== undefined) patch.technician_id = body.technicianId || null;
  if (body.scheduledStart) {
    patch.scheduled_start = body.scheduledStart;
    if (body.scheduledEnd) patch.scheduled_end = body.scheduledEnd;
  }
  if (body.clientId) {
    patch.client_id = body.clientId;
    patch.client_link_status = "valide";
    patch.client_linked_at = at;
    patch.client_linked_by = actorId;
  }
  if (body.natureValidated) {
    patch.nature_status = "valide";
    patch.nature_validated = body.natureValidated;
    patch.nature_validated_at = at;
    patch.nature_validated_by = actorId;
  }
  if (body.natureStatus === "ecarte") patch.nature_status = "ecarte";
  if (body.realizationStatus) {
    const next = applyRealization({}, {
      status: body.realizationStatus,
      date: body.realizationDate,
      basis: body.realizationBasis,
      note: body.realizationNote,
      actorId,
      at,
    });
    patch.realization_status = next.realizationStatus;
    patch.realization_date = next.realizationDate;
    patch.realization_basis = next.realizationBasis;
    patch.realization_note = next.realizationNote;
    patch.realization_recorded_at = next.realizationRecordedAt;
    patch.realization_recorded_by = next.realizationRecordedBy;
  }
  return patch;
}

void applyRealization;
