import { requireApiSession, canSendMail } from "../../../lib/api-auth";
import { sendMail } from "../../../lib/send-mail";

export const runtime = "nodejs";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

function requestDocument(request) {
  const rows = (request.items || []).map(item => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.qty)}</td><td></td><td></td></tr>`).join("");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${escapeHtml(request.number)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:12px Arial;color:#25345c}.sheet{width:210mm;min-height:297mm;padding:18mm;display:flex;flex-direction:column}header{border-bottom:4px solid #ffdb62;padding-bottom:8mm;display:flex;justify-content:space-between}h1{font-size:20px;color:#405fae;margin:0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:10mm 0}.box{border:1px solid #d7dce5;border-radius:3mm;padding:4mm}.box span{display:block;font-size:9px;color:#808b9b;margin-bottom:2mm}table{width:100%;border-collapse:collapse}th{background:#405fae;color:#fff}th,td{border:1px solid #d8dde5;padding:3mm;text-align:left}.note{margin-top:7mm;background:#f3f5f9;padding:4mm;border-radius:3mm}.spacer{flex:1}footer{border-top:1px solid #d8dde5;padding-top:4mm;display:flex;justify-content:space-between;font-size:9px;color:#7f8998}</style><body><main class="sheet"><header><b>MKL ÉNERGIES</b><div><h1>DEMANDE DE CHIFFRAGE</h1><p>${escapeHtml(request.number)}</p></div></header><section class="meta"><div class="box"><span>DEVIS ASSOCIÉ</span><b>${escapeHtml(request.quoteNumber)}</b></div><div class="box"><span>DATE</span><b>${new Date(request.created).toLocaleDateString("fr-FR")}</b></div><div class="box"><span>CLIENT / PROJET</span><b>${escapeHtml(request.client)}</b></div><div class="box"><span>DEMANDEUR</span><b>${escapeHtml(request.requester)}</b></div></section><table><tr><th>Référence</th><th>Grand matériel à chiffrer</th><th>Quantité</th><th>Prix fournisseur HT</th><th>Délai</th></tr>${rows}</table><div class="note">Merci d’indiquer le prix net HT, le délai de livraison, la durée de validité de l’offre et les conditions de transport.</div><div class="spacer"></div><footer><span>MKL Énergies</span><span>Demande générée automatiquement</span><span>Page 1/1</span></footer></main></body></html>`;
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Demandes de chiffrage", action: "send_mail" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canSendMail(auth.profile)) {
      return Response.json({ error: "Vous n’avez pas l’autorisation d’envoyer des emails." }, { status: 403 });
    }

    const { request: costRequest, suppliers } = await request.json();
    if (!costRequest?.number || !Array.isArray(suppliers) || !suppliers.length) {
      return Response.json({ error: "Demande ou fournisseurs manquants." }, { status: 400 });
    }
    const document = requestDocument(costRequest);
    await Promise.all(suppliers.map(supplier => sendMail({
      to: supplier.email,
      subject: `Demande de chiffrage ${costRequest.number} – ${costRequest.client}`,
      html: `<p>Bonjour ${escapeHtml(supplier.contact || supplier.name)},</p><p>Veuillez trouver ci-joint notre demande de chiffrage <b>${escapeHtml(costRequest.number)}</b>, associée au devis ${escapeHtml(costRequest.quoteNumber)}.</p><p>Merci de nous transmettre vos prix et délais.</p><p>Cordialement,<br><b>MKL Énergies</b></p>`,
      attachments: [{ filename: `${costRequest.number}.html`, content: base64Utf8(document) }],
    })));
    return Response.json({ ok: true, sent: suppliers.length });
  } catch (error) {
    if (error.message === "MAIL_NOT_CONFIGURED") {
      return Response.json({ error: "Le service d’envoi d’emails n’est pas configuré." }, { status: 503 });
    }
    console.error("Cost request email error", error);
    return Response.json({ error: "Impossible d’envoyer la demande de chiffrage." }, { status: 502 });
  }
}
