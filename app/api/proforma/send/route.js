export const runtime = "nodejs";

import { requireApiSession, canSendMail } from "../../../lib/api-auth";
import { sendMail } from "../../../lib/send-mail";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Factures pro forma", action: "send_mail" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canSendMail(auth.profile)) {
      return Response.json({ error: "Vous n’avez pas l’autorisation d’envoyer des emails." }, { status: 403 });
    }

    const { client, proforma } = await request.json();
    if (!client?.email || !proforma?.number) {
      return Response.json({ error: "Email client ou pro forma manquant." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(client.email))) {
      return Response.json({ error: "Adresse email client invalide." }, { status: 400 });
    }
    const total = Number(proforma.amount) * (1 + Number(proforma.tax) / 100);
    const recipient = escapeHtml(client.contact || client.name || "");
    const number = escapeHtml(proforma.number);
    const amount = escapeHtml(total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }));
    await sendMail({
      to: client.email,
      subject: `Facture pro forma ${proforma.number}`,
      html: `<p>Bonjour ${recipient},</p><p>Votre intervention d’entretien est terminée et réglée.</p><p>La facture pro forma <b>${number}</b>, d’un montant TTC de <b>${amount}</b>, a été générée.</p><p>Cordialement,<br><b>MKL Énergies</b></p>`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error.message === "MAIL_NOT_CONFIGURED") {
      return Response.json({ error: "Le service d’envoi d’emails n’est pas configuré." }, { status: 503 });
    }
    console.error("Pro forma email error", error);
    return Response.json({ error: "Impossible d’envoyer la pro forma au client." }, { status: 502 });
  }
}
