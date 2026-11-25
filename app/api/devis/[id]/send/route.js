import { requireApiSession } from "../../../../lib/api-auth";
import { loadCompany } from "../../../../lib/company-store";
import { clientToUi } from "../../../../lib/clients";
import { devisStatusAfterClientSend } from "../../../../lib/dossier-step";
import { canManageDevis, devisToUi } from "../../../../lib/devis";
import { buildDevisEmail, clientNotifyEmail } from "../../../../lib/devis-mail";
import { buildStoredDevisPdf, mklLogoAttachment } from "../../../../lib/devis-mail-pdf";
import { loadProfileNames } from "../../../../lib/profile-names";
import { documentPdfFilename } from "../../../../lib/record-documents";
import { canAccessScopedRow } from "../../../../lib/scoping";
import { sendMail } from "../../../../lib/send-mail";
import { serviceRequest } from "../../../../lib/supabase-server";
import { loadTeamMemberIds } from "../../../../lib/team-scope";

export const runtime = "nodejs";

const DEVIS_SELECT =
  "id,organization_id,kind,numero_devis,client_id,client_name,commercial_id,statut,date_creation,date_validite,date_livraison,total_ht,total_tva,total_ttc,remise_globale_type,remise_globale,acompte,reste_a_payer,conditions_reglement,observations,label,tax_default,financier,financed_amount,finance_months,monthly_payment,electricity_operator,pv_power_kwp,pv_study_id,extra,created_at,updated_at,created_by";

const LINE_SELECT =
  "id,devis_id,article_id,reference,designation,description,quantite,unite,prix_unitaire_ht,remise_type,remise,taux_tva,total_ht,total_tva,total_ttc,categorie,sous_categorie,bundle_id,bundle_name,forfait,forfait_montant_ht,ordre";

const CLIENT_SELECT =
  "id,organization_id,type_client,civilite,nom,prenom,raison_sociale,adresse,complement_adresse,code_postal,ville,telephone,telephone_secondaire,email,notes,commercial_id";

export async function POST(request, { params }) {
  try {
    const auth = await requireApiSession(request, { module: "Devis" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canManageDevis(auth.profile)) {
      return Response.json({ error: "Vous n’avez pas l’autorisation d’envoyer ce devis." }, { status: 403 });
    }

    const { id } = await params;
    const orgId = auth.profile.organization_id;
    const rows = await serviceRequest(
      `/rest/v1/devis?select=${DEVIS_SELECT}&id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
    );
    const row = rows?.[0];
    const teamIds = await loadTeamMemberIds(auth.profile, auth.user.id);
    if (!row || !canAccessScopedRow(auth.profile, auth.user.id, row, teamIds || [])) {
      return Response.json({ error: "Ce devis est introuvable." }, { status: 404 });
    }
    if (String(row.kind || "Devis") !== "Devis") {
      return Response.json({ error: "Seuls les devis sont envoyés par cet e-mail." }, { status: 400 });
    }
    if (String(row.statut || "") === "Brouillon") {
      return Response.json({ error: "Enregistrez le devis avant de l’envoyer." }, { status: 400 });
    }
    if (!row.client_id) {
      return Response.json({ error: "Ce devis n’a pas de client." }, { status: 400 });
    }

    const clients = await serviceRequest(
      `/rest/v1/clients?select=${CLIENT_SELECT}&id=eq.${encodeURIComponent(row.client_id)}&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
    );
    const client = clientToUi(clients?.[0]);
    if (!clientNotifyEmail(client)) {
      return Response.json({ error: "Ce client n’a pas d’adresse e-mail." }, { status: 400 });
    }

    const lines = await serviceRequest(
      `/rest/v1/devis_lignes?select=${LINE_SELECT}&devis_id=eq.${encodeURIComponent(row.id)}&order=ordre.asc`
    );
    const devis = devisToUi(row, lines || []);
    const names = await loadProfileNames([row.commercial_id]);
    const commercialName = names[row.commercial_id] || "";
    const company = await loadCompany(orgId);
    const filename = documentPdfFilename({ kind: "Devis", title: devis.number, source: devis }, client);
    const payload = buildDevisEmail({
      client,
      devis,
      commercialName,
      company,
      filename,
      logoUrl: "cid:mkl-logo",
    });
    if (!payload) {
      return Response.json({ error: "Ce client n’a pas d’adresse e-mail." }, { status: 400 });
    }

    const pdf = await buildStoredDevisPdf(devis, { clients: [client], company });
    await sendMail({
      ...payload,
      attachments: [
        mklLogoAttachment(),
        {
          filename,
          content: pdf.toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });

    let status = String(row.statut || "");
    const nextStatus = devisStatusAfterClientSend(status);
    if (nextStatus === "Envoyé" && status !== "Envoyé") {
      try {
        await serviceRequest(
          `/rest/v1/devis?id=eq.${encodeURIComponent(row.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: { statut: "Envoyé", updated_at: new Date().toISOString() },
          }
        );
        await serviceRequest("/rest/v1/devis_historique", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: {
            devis_id: row.id,
            ancien_statut: status,
            nouveau_statut: "Envoyé",
            utilisateur_id: auth.user.id || null,
            commentaire: "Envoyé par e-mail au client.",
          },
        });
        status = "Envoyé";
      } catch (statusError) {
        console.error("Devis sent status", statusError?.message || statusError);
      }
    }
    return Response.json({ ok: true, to: payload.to, status });
  } catch (error) {
    if (error.message === "MAIL_NOT_CONFIGURED") {
      return Response.json({ error: "Le service d’envoi d’emails n’est pas configuré." }, { status: 503 });
    }
    console.error("Devis email error", error);
    return Response.json({ error: "Impossible d’envoyer le devis." }, { status: 502 });
  }
}
