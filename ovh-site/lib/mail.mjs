/**
 * Envoi d’e-mails admin (SMTP via variables d’environnement).
 * Requis pour « mot de passe oublié » : SMTP_HOST / SMTP_USER / SMTP_PASS.
 */
import nodemailer from "nodemailer";

export function getAdminResetEmail() {
  return String(process.env.ADMIN_RESET_EMAIL || "labidianiclimat@gmail.com")
    .trim()
    .toLowerCase();
}

export function isMailConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || "").trim() &&
      String(process.env.SMTP_USER || "").trim() &&
      String(process.env.SMTP_PASS || "").trim()
  );
}

function buildTransport() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const secure =
    String(process.env.SMTP_SECURE || "").trim() === "1" || port === 465;
  if (!host || !user || !pass) {
    throw new Error(
      "E-mail non configuré : renseignez SMTP_HOST, SMTP_USER et SMTP_PASS dans le .env serveur."
    );
  }
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendAdminMail({ to, subject, text, html }) {
  const from =
    String(process.env.SMTP_FROM || "").trim() ||
    `"MKL Énergies CRM" <${String(process.env.SMTP_USER || "").trim()}>`;
  const transport = buildTransport();
  const info = await transport.sendMail({
    from,
    to,
    subject,
    text,
    html: html || undefined,
  });
  return { messageId: info.messageId || "", accepted: info.accepted || [] };
}

export async function sendAdminPasswordEmail(password) {
  const to = getAdminResetEmail();
  const subject = "MKL Énergies — nouveau mot de passe CRM";
  const text = [
    "Bonjour,",
    "",
    "Voici votre nouveau mot de passe pour le CRM MKL Énergies :",
    "",
    password,
    "",
    "Connexion : https://mkl-energies.fr/admin.html",
    "",
    "Si vous n’êtes pas à l’origine de cette demande, changez immédiatement le mot de passe une fois connecté.",
    "",
    "— MKL Énergies",
  ].join("\n");
  const html = `
    <p>Bonjour,</p>
    <p>Voici votre nouveau mot de passe pour le CRM MKL Énergies :</p>
    <p style="font-size:18px;font-weight:700;letter-spacing:0.02em"><code>${escapeHtml(password)}</code></p>
    <p><a href="https://mkl-energies.fr/admin.html">Se connecter au CRM</a></p>
    <p style="color:#555;font-size:13px">Si vous n’êtes pas à l’origine de cette demande, changez immédiatement le mot de passe une fois connecté.</p>
    <p>— MKL Énergies</p>
  `;
  return sendAdminMail({ to, subject, text, html });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
