/** Mail qui accompagne un devis enregistré. */

import {
  companyAddressLine,
  companyContactLine,
  companyDisplayName,
  DEFAULT_COMPANY,
} from "./company.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function clientNotifyEmail(person) {
  const email = String(person?.email || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

export function formatDevisValidity(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function buildDevisEmail({
  client = {},
  devis = {},
  commercialName = "",
  company = DEFAULT_COMPANY,
  filename = "Devis.pdf",
  logoUrl = "cid:mkl-logo",
} = {}) {
  const to = clientNotifyEmail(client);
  const number = String(devis?.number || "").trim();
  if (!to || !number) return null;

  const companyName = companyDisplayName(company);
  const hello = String(client.firstName || "").trim();
  const commercial = String(commercialName || "").trim();
  const validUntil = formatDevisValidity(devis.due);
  const subject = `Votre devis ${companyName} n° ${number}`;
  const sans = "DM Sans,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
  const display = "Manrope,'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="168" alt="${escapeHtml(companyName)}" style="display:block;border:0;background:#fff;border-radius:8px;padding:8px 10px">`
    : "";
  const prepared = commercial
    ? `Il a été préparé par ${commercial}. Vous y trouverez le détail des équipements, des travaux et des montants, ainsi que les conditions de la proposition.`
    : "Vous y trouverez le détail des équipements, des travaux et des montants, ainsi que les conditions de la proposition.";
  const validity = validUntil ? ` Il reste valable jusqu’au ${validUntil}.` : "";
  const rows = [
    ["Devis", number],
    commercial ? ["Préparé par", commercial] : null,
    validUntil ? ["Valable jusqu’au", validUntil] : null,
    ["Pièce jointe", filename],
  ].filter(Boolean);
  const details = rows.map(([label, value], index) => `
    <tr>
      <td style="padding:${index === 0 ? "12px" : "12px"} 16px;width:38%;font:700 13px/1.35 ${sans};color:#405fae;border-top:${index === 0 ? "0" : "1px solid #d5deee"}">${escapeHtml(label)}</td>
      <td style="padding:12px 16px;font:700 16px/1.35 ${display};color:#152347;border-top:${index === 0 ? "0" : "1px solid #d5deee"}">${escapeHtml(value)}</td>
    </tr>`).join("");
  const addressLine = companyAddressLine(company);
  const contact = companyContactLine(company);
  const mail = company.email || "contact@mkl-energies.fr";

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#e8edf6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf6;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">
          <tr>
            <td style="background:#314d93;padding:22px 28px">${logo}</td>
          </tr>
          <tr>
            <td style="height:7px;background:#ffcc00;font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;font-family:${sans};color:#2c3a56">
              <p style="margin:0 0 8px;font:700 13px/1.3 ${sans};color:#405fae">Votre proposition</p>
              <h1 style="margin:0 0 16px;font:700 28px/1.15 ${display};letter-spacing:-.5px;color:#152347">Votre devis est prêt</h1>
              <p style="margin:0 0 8px;font:650 16px/1.6 ${sans};color:#152347">Bonjour${hello ? ` ${escapeHtml(hello)}` : ""},</p>
              <p style="margin:0 0 14px;font:400 16px/1.6 ${sans}">Merci de nous avoir accordé votre confiance. Votre devis n° ${escapeHtml(number)} est joint à ce message, au format PDF.</p>
              <p style="margin:0 0 14px;font:400 16px/1.6 ${sans}">${escapeHtml(prepared)}${escapeHtml(validity)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2fa;border:1px solid #d5deee;border-radius:14px;margin:6px 0 18px">${details}</table>
              <p style="margin:0 0 14px;font:400 16px/1.6 ${sans}">Si vous souhaitez le parcourir ensemble, préciser un point ou convenir de la suite, répondez simplement à cet e-mail.</p>
              <p style="margin:4px 0 18px;font:400 16px/1.6 ${sans}">À très bientôt,<br><b style="font:700 16px/1.4 ${display};color:#152347">${escapeHtml(companyName)}</b></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f6fb;padding:16px 28px 18px;font:400 13px/1.55 ${sans};color:#3d4d6b">
              ${escapeHtml(companyName)}${addressLine ? ` · ${escapeHtml(addressLine)}` : ""}<br>${escapeHtml(contact || mail)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to, subject, html };
}
