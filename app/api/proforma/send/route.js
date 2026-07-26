export const runtime = "nodejs";

export async function sendMail({ to, subject, html, attachments = [] }) {
  const apiUrl = process.env.MAIL_API_URL || "https://api.resend.com/emails";
  const apiToken = process.env.MAIL_API_TOKEN || process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "MKL Énergies <contact@mkl-energies.fr>";
  if (!apiToken) throw new Error("MAIL_NOT_CONFIGURED");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, attachments }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MAIL_PROVIDER_ERROR:${response.status}:${detail.slice(0, 200)}`);
  }
}

export async function POST(request) {
  try {
    const { client, proforma } = await request.json();
    if (!client?.email || !proforma?.number) {
      return Response.json({ error: "Email client ou pro forma manquant." }, { status: 400 });
    }
    const total = Number(proforma.amount) * (1 + Number(proforma.tax) / 100);
    await sendMail({
      to: client.email,
      subject: `Facture pro forma ${proforma.number}`,
      html: `<p>Bonjour ${client.contact || client.name},</p><p>Votre intervention d’entretien est terminée et réglée.</p><p>La facture pro forma <b>${proforma.number}</b>, d’un montant TTC de <b>${total.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</b>, a été générée.</p><p>Cordialement,<br><b>MKL Énergies</b></p>`,
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
