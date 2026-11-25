import { after } from "next/server";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";
import { MAX_BODY_BYTES, verifyWebLeadSignature } from "../../lib/web-lead-hmac";
import { parseWebLeadPayload, webLeadConfig } from "../../lib/web-lead-ingest";
import { processWebLeadQueue } from "../../lib/web-lead-queue-server";

/**
 * Réception des demandes du site mkl-energies.fr.
 *
 * Appel de serveur à serveur uniquement, signé en HMAC. Volontairement aucun
 * en-tête CORS et aucun gestionnaire OPTIONS : le secret ne doit jamais se
 * trouver dans une page, donc aucun navigateur n'a à appeler cette route.
 *
 * La route ne crée pas de prospect. Elle valide, met en file et accuse
 * réception. Le classement de l'origine et l'arbitrage des doublons se font au
 * traitement, de sorte qu'une panne de ces étapes ne fasse jamais perdre une
 * demande déjà acceptée.
 *
 * Les refus ne renvoient qu'un motif générique : un attaquant ne doit pas
 * pouvoir distinguer une clé inconnue d'une signature fausse.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_PATH = "/api/web-leads";

export async function POST(request) {
  const { keyring, organizationId, retentionDays } = webLeadConfig();
  if (keyring.size === 0) {
    return Response.json({ ok: false, error: "Réception non configurée." }, { status: 503 });
  }
  if (!serviceRoleConfigured()) {
    return Response.json({ ok: false, error: "Réception indisponible." }, { status: 503 });
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Demande trop volumineuse." }, { status: 413 });
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ ok: false, error: "Demande illisible." }, { status: 400 });
  }

  const signature = verifyWebLeadSignature({
    method: "POST",
    path: INGEST_PATH,
    headers: request.headers,
    rawBody,
    keyring,
  });
  if (!signature.ok) {
    // Le motif précis reste dans les journaux, jamais dans la réponse.
    console.warn(`web-lead refusé : ${signature.reason}`);
    return Response.json({ ok: false, error: "Signature refusée." }, { status: 401 });
  }

  const parsed = parseWebLeadPayload(rawBody);
  if (!parsed.ok) {
    console.warn(`web-lead invalide : ${parsed.reason}`);
    return Response.json({ ok: false, error: "Demande invalide.", reason: parsed.reason }, { status: 400 });
  }

  try {
    const rows = await serviceRequest("/rest/v1/rpc/enqueue_web_lead", {
      method: "POST",
      body: {
        p_organization_id: organizationId,
        p_submission_id: parsed.value.submissionId,
        p_kind: parsed.value.kind,
        p_payload: parsed.value,
        p_signature_sent_at: signature.sentAt,
        p_retention_days: retentionDays,
      },
    });
    const receipt = Array.isArray(rows) ? rows[0] : rows;
    if (!receipt?.id) throw new Error("ENQUEUE_SANS_ACCUSE");

    // Traitement lancé après la réponse : le site reçoit son accusé sans
    // attendre, et le prospect n'attend pas le prochain passage du cron.
    if (!receipt.duplicate) {
      after(async () => {
        try {
          await processWebLeadQueue({ worker: "ingest" });
        } catch (error) {
          console.error(`web-lead traitement différé impossible : ${error.message}`);
        }
      });
    }

    return Response.json(
      {
        ok: true,
        id: receipt.id,
        receivedAt: receipt.received_at || null,
        duplicate: Boolean(receipt.duplicate),
      },
      { status: receipt.duplicate ? 200 : 201 }
    );
  } catch (error) {
    // Message court : le corps contient des coordonnées, il ne doit pas être
    // recopié dans les journaux.
    console.error(`web-lead mise en file impossible : ${error.message}`);
    return Response.json({ ok: false, error: "Mise en file impossible." }, { status: 502 });
  }
}
