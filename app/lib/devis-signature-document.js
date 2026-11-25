/** Prépare le PDF du devis déjà enregistré, sans le faire télécharger par le commercial. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPdfBuffer } from "./client-documents.js";
import { devisToUi } from "./devis.js";
import { insertCgvAfterQuote, quotePrintsCgv } from "./devis-cgv.js";
import { buildDevisPdfBlob } from "./devis-pdf.js";
import { serviceRequest } from "./supabase-server.js";

const DEVIS_SELECT =
  "id,organization_id,kind,numero_devis,client_id,client_name,commercial_id,statut,date_creation,date_validite,date_livraison,total_ht,total_tva,total_ttc,remise_globale_type,remise_globale,acompte,reste_a_payer,conditions_reglement,observations,label,tax_default,financier,financed_amount,finance_months,monthly_payment,electricity_operator,pv_power_kwp,pv_study_id,extra,created_at,updated_at,created_by";

const LINE_SELECT =
  "id,devis_id,article_id,reference,designation,description,quantite,unite,prix_unitaire_ht,remise_type,remise,taux_tva,total_ht,total_tva,total_ttc,categorie,sous_categorie,bundle_id,bundle_name,forfait,forfait_montant_ht,ordre";

function imageDataUrl(name) {
  try {
    const bytes = readFileSync(join(process.cwd(), "public", name));
    const type = name.endsWith(".png") ? "png" : "jpeg";
    return `data:image/${type};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

function clientForPdf(row, fallbackName) {
  if (!row) return [];
  const firstName = row.prenom || "";
  const lastName = row.nom || "";
  return [{
    id: row.id,
    name: row.raison_sociale || `${firstName} ${lastName}`.trim() || fallbackName,
    company: row.raison_sociale || "",
    firstName,
    lastName,
    contact: `${firstName} ${lastName}`.trim(),
    address: row.adresse || "",
    postalCode: row.code_postal || "",
    city: row.ville || "",
    phone: row.telephone || "",
    mobile: row.telephone_secondaire || "",
    clientNumber: row.client_number || "",
  }];
}

function cgvFileBytes() {
  return readFileSync(join(process.cwd(), "public", "cgv", "cgv-mkl-energies.pdf"));
}

export async function devisPdfBytesFromDocument(doc, { clients = [] } = {}) {
  let blob = await buildDevisPdfBlob(doc, {
    clients,
    logoData: imageDataUrl("mkl-energies.png"),
    rgeLogoData: imageDataUrl("rge-qualifelec.png"),
    annexImages: [],
  });
  if (quotePrintsCgv(doc)) {
    blob = await insertCgvAfterQuote(blob, blob.quotePageCount, cgvFileBytes());
  }
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!isPdfBuffer(bytes)) throw new Error("Le PDF du devis est illisible.");
  return bytes;
}

export async function storedDevisPdfBytes(devisId) {
  const rows = await serviceRequest(
    `/rest/v1/devis?select=${DEVIS_SELECT}&id=eq.${encodeURIComponent(devisId)}&limit=1`
  );
  const row = rows?.[0];
  if (!row) throw new Error("Devis introuvable.");
  const lines = await serviceRequest(
    `/rest/v1/devis_lignes?select=${LINE_SELECT}&devis_id=eq.${encodeURIComponent(devisId)}&order=ordre.asc`
  );
  const doc = devisToUi(row, lines || []);
  let clients = [];
  if (doc.clientId) {
    try {
      const people = await serviceRequest(
        `/rest/v1/clients?select=id,nom,prenom,raison_sociale,telephone,telephone_secondaire,client_number,adresse,code_postal,ville&id=eq.${encodeURIComponent(doc.clientId)}&limit=1`
      );
      clients = clientForPdf(people?.[0], doc.client);
    } catch {
      clients = [];
    }
  }
  return devisPdfBytesFromDocument(doc, { clients });
}
