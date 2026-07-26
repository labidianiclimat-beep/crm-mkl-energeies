import { sendMail } from "../../proforma/send/route";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { name, email, role, inviteToken } = await request.json();
    if (!name || !email || !inviteToken || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Informations d’invitation invalides." }, { status: 400 });
    }

    const publicUrl = process.env.APP_PUBLIC_URL || new URL(request.url).origin;
    if (!publicUrl || /localhost|127\.0\.0\.1/i.test(publicUrl)) {
      return Response.json({ error: "L’adresse publique du CRM n’est pas configurée." }, { status: 503 });
    }
    const activationUrl = `${publicUrl.replace(/\/$/, "")}/activation?token=${encodeURIComponent(inviteToken)}`;

    await sendMail({
      to: email,
      subject: "Activez votre accès MKL Énergies CRM",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#26375f">
        <div style="border-bottom:5px solid #ffdb62;padding-bottom:18px">
          <h1 style="color:#405fae;margin:0">MKL ÉNERGIES</h1>
          <p style="color:#737b86">Invitation à votre espace CRM</p>
        </div>
        <h2>Bonjour ${escapeHtml(name)},</h2>
        <p>Votre compte MKL Énergies CRM a été créé.</p>
        <p><b>Identifiant :</b> ${escapeHtml(email)}<br><b>Catégorie :</b> ${escapeHtml(role || "")}</p>
        <p style="margin:28px 0"><a href="${escapeHtml(activationUrl)}" style="background:#405fae;color:white;text-decoration:none;padding:13px 20px;border-radius:8px">Activer mon compte</a></p>
        <p style="font-size:12px;color:#7e8795">Ce lien est personnel. Aucun mot de passe n’est envoyé par email.</p>
      </div>`,
    });

    return Response.json({ sent: true });
  } catch (error) {
    if (error.message === "MAIL_NOT_CONFIGURED") {
      return Response.json({ error: "Le service d’envoi d’emails n’est pas configuré." }, { status: 503 });
    }
    console.error("Invitation email error", error);
    return Response.json({ error: "L’email n’a pas pu être envoyé." }, { status: 502 });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}
