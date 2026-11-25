import {
  generateActivationPin,
  hashActivationPin,
  LOGIN_PIN_TTL_MS,
} from "./activation-pin.js";
import { sendMail } from "./send-mail.js";
import {
  createActivationPinRecord,
  invalidateActivePins,
} from "./supabase-server.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

export function mailErrorMessage(error) {
  const message = String(error?.message || "");
  if (message === "MAIL_NOT_CONFIGURED") {
    return "Le service d’envoi d’emails n’est pas configuré sur le serveur.";
  }
  if (message === "ACTIVATION_PIN_PEPPER_MISSING") {
    return "ACTIVATION_PIN_PEPPER doit être définie sur le serveur pour générer un PIN.";
  }
  if (/MAIL_PROVIDER_ERROR|MAIL_SMTP_ERROR/i.test(message)) {
    return "L’email n’a pas pu être envoyé. Vérifiez la configuration SMTP OVH sur Vercel.";
  }
  return message || "Le PIN n’a pas pu être envoyé.";
}

export async function issueAndSendLoginPin({
  userId,
  email,
  name = "",
  createdBy,
  publicUrl,
  reason = "reset",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  await invalidateActivePins(userId);
  const pin = generateActivationPin();
  const { pin_hash, pin_salt } = hashActivationPin(pin);
  await createActivationPinRecord({
    user_id: userId,
    pin_hash,
    pin_salt,
    expires_at: new Date(Date.now() + LOGIN_PIN_TTL_MS).toISOString(),
    created_by: createdBy || null,
  });

  const loginUrl = `${String(publicUrl || "").replace(/\/$/, "")}/`;
  const emailChanged = reason === "email-change";
  const invited = reason === "invite";
  const subject = emailChanged
    ? "Nouvel identifiant — MKL Énergies CRM"
    : invited
      ? "Votre accès — MKL Énergies CRM"
      : "Réinitialisation PIN — MKL Énergies CRM";
  const intro = emailChanged
    ? "Votre <b>identifiant de connexion</b> a été corrigé. Connectez-vous uniquement avec cette adresse."
    : invited
      ? "Votre accès au CRM MKL Énergies est prêt. Connectez-vous avec l’identifiant et le code PIN ci-dessous."
      : "Votre administrateur a réinitialisé votre <b>code PIN personnel</b>.";
  const footer = emailChanged
    ? "L’ancienne adresse email ne permet plus de se connecter. Conservez ce PIN en lieu sûr."
    : invited
      ? "Conservez ce PIN en lieu sûr. Il sert à ouvrir le CRM."
      : "L’ancien PIN n’est plus valide. Conservez ce nouveau code en lieu sûr.";
  await sendMail({
    to: normalizedEmail,
    subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#26375f">
      <h2>Bonjour ${escapeHtml(name)},</h2>
      <p>${intro}</p>
      <p><b>Identifiant :</b> ${escapeHtml(normalizedEmail)}<br>
      <b>Code PIN personnel :</b> <span style="font-size:22px;letter-spacing:6px">${escapeHtml(pin)}</span></p>
      <p style="margin:28px 0"><a href="${escapeHtml(loginUrl)}" style="background:#405fae;color:white;text-decoration:none;padding:13px 20px;border-radius:8px">Se connecter au CRM</a></p>
      <p style="font-size:12px;color:#7e8795">${footer}</p>
    </div>`,
  });

  return { sent: true, email: normalizedEmail };
}
