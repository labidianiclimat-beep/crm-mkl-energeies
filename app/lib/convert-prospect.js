import {
  clientToUi,
  displayClientName,
  findClientDuplicates,
  formToClientRecord,
  splitScopedDuplicates,
  validateClientPayload,
} from "./clients.js";
import {
  clientStatusForDocumentKind,
  convertedProspectExtra,
  prospectToClientPayload,
} from "./prospect-to-client.js";
import { extraOf, prospectToUi, PROSPECT_SELECT } from "./prospects.js";
import {
  CLIENT_DOCUMENTS_BUCKET,
  storagePathForDocument,
} from "./client-documents.js";
import { listAllRows } from "./supabase-list.js";
import {
  serviceDownloadObject,
  serviceRequest,
  serviceUploadObject,
} from "./supabase-server.js";
import { isProspectDispatcher } from "./prospect-dispatch.js";
import { canAccessScopedRow } from "./scoping.js";

const CLIENT_SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,adresse,complement_adresse,code_postal,ville,telephone,telephone_secondaire,email,origine_lead,statut,commercial_id,notes,project_type,install,consent,created_at,updated_at,created_by";

function conversionError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function convertedClientId(row) {
  const extra = extraOf(row);
  return String(row?.clientId || extra.clientId || extra.client_id || "").trim();
}

function canUseClientRow(profile, userId, row, teamIds = []) {
  return canAccessScopedRow(profile, userId, row, teamIds || [], {
    forDispatch: isProspectDispatcher(profile),
  });
}

export async function assertAccessibleClient({ orgId, clientId, profile, userId, teamIds = [] } = {}) {
  const id = String(clientId || "").trim();
  if (!id) return null;
  const rows = await serviceRequest(
    `/rest/v1/clients?select=${CLIENT_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
  );
  const row = rows?.[0];
  if (!row || !canUseClientRow(profile, userId, row, teamIds)) {
    throw conversionError("Client introuvable.", 404);
  }
  return row;
}

export async function convertProspectToClient({
  orgId,
  prospectId,
  documentKind,
  userId,
  commercialId,
  profile,
  teamIds = [],
} = {}) {
  const id = String(prospectId || "").trim();
  if (!id) throw conversionError("Prospect introuvable.");

  const rows = await serviceRequest(
    `/rest/v1/commercial_opportunities?select=${PROSPECT_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
  );
  const row = rows?.[0];
  if (!row) throw conversionError("Prospect introuvable.", 404);
  if (
    !canAccessScopedRow(profile, userId, row, teamIds || [], {
      forDispatch: isProspectDispatcher(profile),
    })
  ) {
    throw conversionError("Prospect introuvable.", 404);
  }

  const existingClientId = convertedClientId(row);
  if (existingClientId) {
    const existingRows = await serviceRequest(
      `/rest/v1/clients?select=${CLIENT_SELECT}&id=eq.${encodeURIComponent(existingClientId)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
    );
    if (existingRows?.[0]) {
      if (!canUseClientRow(profile, userId, existingRows[0], teamIds)) {
        throw conversionError("Ce prospect est déjà suivi sur une autre affaire.", 404);
      }
      const client = await maybeUpgradeClientStatus(existingRows[0], documentKind);
      return { client, created: false, prospectId: id };
    }
  }

  const payload = prospectToClientPayload(prospectToUi(row), { documentKind });
  const record = formToClientRecord(payload, {
    organizationId: orgId,
    createdBy: userId,
    defaultCommercialId: commercialId || row.commercial_id || null,
  });
  const errors = validateClientPayload(record);
  if (errors.length) {
    throw conversionError(errors[0], 400, { errors });
  }

  const existing = await listAllRows(
    `/rest/v1/clients?select=${CLIENT_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}`
  );
  const duplicates = findClientDuplicates(existing || [], record);
  const { visible } = splitScopedDuplicates(duplicates, profile, userId, teamIds || []);
  let client = visible[0];
  let created = false;
  if (!client) {
    record.created_at = new Date().toISOString();
    const createdRows = await serviceRequest("/rest/v1/clients", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: record,
    });
    client = createdRows?.[0];
    created = true;
  } else {
    client = await maybeUpgradeClientStatus(client, documentKind);
  }
  if (!client?.id) throw conversionError("Création du client impossible.", 502);

  const prospectNumber = Number(row.prospect_number);
  if (prospectNumber > 0 && !Number(client.origin_prospect_number)) {
    try {
      const stamped = await serviceRequest(
        `/rest/v1/clients?id=eq.${encodeURIComponent(client.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: { origin_prospect_number: prospectNumber },
        }
      );
      if (stamped?.[0]) client = stamped[0];
      else client = { ...client, origin_prospect_number: prospectNumber };
    } catch (error) {
      if (!/origin_prospect_number/i.test(String(error?.message || ""))) throw error;
      client = { ...client, origin_prospect_number: prospectNumber };
    }
  }

  await serviceRequest(
    `/rest/v1/commercial_opportunities?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        extra: convertedProspectExtra(row.extra, client.id, { documentKind }),
        updated_at: new Date().toISOString(),
      },
    }
  );

  await copyProspectDocumentsToClient({
    orgId,
    prospectId: id,
    clientId: client.id,
    userId,
  });

  return { client, created, prospectId: id };
}

async function copyProspectDocumentsToClient({ orgId, prospectId, clientId, userId }) {
  try {
    const existing = await serviceRequest(
      `/rest/v1/client_documents?select=id&client_id=eq.${encodeURIComponent(clientId)}&limit=1`
    );
    if (existing?.[0]) return;

    const docs = await serviceRequest(
      `/rest/v1/prospect_documents?select=id,kind,title,page_count,file_size,mime_type,storage_path&prospect_id=eq.${encodeURIComponent(prospectId)}&organization_id=eq.${encodeURIComponent(orgId)}&order=created_at.asc`
    );
    for (const doc of docs || []) {
      const documentId = crypto.randomUUID();
      const storagePath = storagePathForDocument({
        organizationId: orgId,
        ownerId: clientId,
        documentId,
      });
      const pdf = await serviceDownloadObject(CLIENT_DOCUMENTS_BUCKET, doc.storage_path);
      await serviceUploadObject(CLIENT_DOCUMENTS_BUCKET, storagePath, pdf, "application/pdf");
      await serviceRequest("/rest/v1/client_documents", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          id: documentId,
          organization_id: orgId,
          client_id: clientId,
          kind: doc.kind,
          title: doc.title,
          page_count: doc.page_count,
          file_size: doc.file_size,
          mime_type: doc.mime_type || "application/pdf",
          storage_path: storagePath,
          created_by: userId || null,
        },
      });
    }
  } catch (error) {
    console.error("Prospect documents copy error", error?.message || error);
  }
}

async function maybeUpgradeClientStatus(client, documentKind) {
  if (clientStatusForDocumentKind(documentKind) !== "Client" || client?.statut === "Client") {
    return client;
  }
  const updated = await serviceRequest(
    `/rest/v1/clients?id=eq.${encodeURIComponent(client.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { statut: "Client", updated_at: new Date().toISOString() },
    }
  );
  return updated?.[0] || { ...client, statut: "Client" };
}

export async function resolveDevisRecipient(body, { orgId, userId, profile, teamIds } = {}) {
  const prospectId = String(body?.prospectId || body?.prospect_id || "").trim();
  if (!prospectId) {
    const clientId = String(body?.clientId || body?.client_id || "").trim();
    if (clientId) {
      await assertAccessibleClient({ orgId, clientId, profile, userId, teamIds });
    }
    return { body, conversion: null };
  }
  const conversion = await convertProspectToClient({
    orgId,
    prospectId,
    documentKind: body.kind || "Devis",
    userId,
    commercialId: body.commercialId || body.commercial_id || "",
    profile,
    teamIds,
  });
  const name = displayClientName(conversion.client) || body.client || body.client_name;
  return {
    body: {
      ...body,
      clientId: conversion.client.id,
      client_id: conversion.client.id,
      client: name,
      client_name: name,
    },
    conversion: {
      ...conversion,
      client: clientToUi(conversion.client),
    },
  };
}
