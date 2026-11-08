import {
  companyAddressLine,
  companyContactLine,
  companyDisplayName,
  DEFAULT_COMPANY,
} from "./company.js";
import { normalizeRoleLabel } from "./roles.js";
import { sendMail } from "./send-mail.js";
import { serviceRequest } from "./supabase-server.js";
import { splitUserName } from "./users.js";
import { mklLogoMailAttachment } from "./prospect-appointment-mail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nameKey(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
}

function mailErrorText(error) {
  const message = String(error?.message || "");
  if (message === "MAIL_NOT_CONFIGURED") {
    return "Le service d’envoi d’emails n’est pas configuré sur le serveur.";
  }
  if (/MAIL_PROVIDER_ERROR|MAIL_SMTP_ERROR/i.test(message)) {
    return "L’email au responsable commercial n’a pas pu être envoyé.";
  }
  return "L’email au responsable commercial n’a pas pu être envoyé.";
}

export function shouldNotifyCommercialAssignment({
  role,
  manager,
  previousManager = "",
  previousRole = "",
} = {}) {
  if (normalizeRoleLabel(role) !== "Commercial") return false;
  const next = String(manager || "").trim();
  if (!next || /^direction/i.test(next)) return false;
  const hadRole = String(previousRole || "").trim();
  if (!hadRole) return true;
  if (normalizeRoleLabel(previousRole) !== "Commercial") return true;
  return nameKey(previousManager) !== nameKey(next);
}

export function buildCommercialAssignmentEmail({
  commercial = {},
  manager = {},
  company = DEFAULT_COMPANY,
  logoUrl = "cid:mkl-logo",
  sentAt = new Date(),
} = {}) {
  const to = String(manager.email || "").trim().toLowerCase();
  const commercialName = String(commercial.name || "").trim();
  const managerName = String(manager.name || "").trim();
  if (!EMAIL_RE.test(to) || !commercialName || !managerName) return null;

  const companyName = companyDisplayName(company);
  const managerFirst = splitUserName(managerName).firstName || managerName;
  const commercialFirst = splitUserName(commercialName).firstName || commercialName;
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(sentAt instanceof Date ? sentAt : new Date(sentAt));
  const place = String(company.city || "").trim();
  const dateline = place ? `${place}, le ${dateLabel}` : `Le ${dateLabel}`;
  const sector = [commercial.zone, commercial.city].map(part => String(part || "").trim()).filter(Boolean).join(" — ");
  const sans = "DM Sans,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
  const display = "Manrope,'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="148" alt="${escapeHtml(companyName)}" style="display:block;border:0;background:#fff;border-radius:8px;padding:8px">`
    : `<div style="font:700 22px ${display};color:#ffcc00">${escapeHtml(companyName)}</div>`;
  const rows = [
    ["Commercial", commercialName],
    ["Fonction", "Commercial"],
    commercial.email ? ["Adresse électronique", commercial.email] : null,
    sector ? ["Secteur", sector] : null,
    ["Responsable", managerName],
  ].filter(Boolean);
  const details = rows.map(([label, value], index) => `
    <tr>
      <td style="padding:${index === 0 ? "0" : "12px"} 0 0;width:38%;font:700 11px/1.3 ${sans};letter-spacing:1px;text-transform:uppercase;color:#405fae">${escapeHtml(label)}</td>
      <td style="padding:${index === 0 ? "0" : "12px"} 0 0;font:700 16px/1.4 ${display};color:#152347">${escapeHtml(value)}</td>
    </tr>`).join("");
  const addressLine = companyAddressLine(company);
  const contact = companyContactLine(company);

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
            <td style="padding:32px 32px 8px;font-family:${sans};color:#233252">
              <p style="margin:0 0 18px;text-align:right;font:400 13px/1.5 ${sans};color:#5c6b86">${escapeHtml(dateline)}</p>
              <p style="margin:0 0 4px;font:700 11px/1.3 ${sans};letter-spacing:1.4px;text-transform:uppercase;color:#405fae">Objet</p>
              <h1 style="margin:0 0 22px;font:700 24px/1.25 ${display};letter-spacing:-.4px;color:#152347">Affectation d’un commercial</h1>
              <p style="margin:0 0 14px;font:600 16px/1.6 ${sans}">Bonjour ${escapeHtml(managerFirst)},</p>
              <p style="margin:0 0 14px;font:400 16px/1.7 ${sans};color:#3d4a66">Nous avons l’honneur de porter à votre connaissance l’affectation d’un commercial à votre responsabilité hiérarchique.</p>
              <p style="margin:0 0 18px;font:400 16px/1.7 ${sans};color:#3d4a66">Par la présente, nous vous confirmons que <b style="color:#152347">${escapeHtml(commercialName)}</b> rejoint votre équipe et relève désormais de votre autorité.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2fa;border:1px solid #d5deee;border-radius:14px">
                <tr><td style="padding:20px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details}</table></td></tr>
              </table>
              <p style="margin:18px 0 0;font:400 16px/1.7 ${sans};color:#3d4a66">Cette affectation prend effet à compter de ce jour. Nous vous remercions de bien vouloir en prendre acte et d’accueillir ${escapeHtml(commercialFirst)} au sein de votre équipe.</p>
              <p style="margin:18px 0 0;font:400 16px/1.7 ${sans};color:#3d4a66">Nous restons à votre disposition pour tout complément d’information.</p>
              <p style="margin:22px 0 6px;font:400 16px/1.7 ${sans};color:#3d4a66">Nous vous prions d’agréer, ${escapeHtml(managerFirst)}, l’expression de nos salutations distinguées.</p>
              <p style="margin:18px 0 28px;font:700 16px/1.45 ${display};color:#152347">${escapeHtml(companyName)}<br><span style="font:600 14px/1.4 ${sans};color:#405fae">Direction</span></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f6fb;padding:18px 32px;font:400 12px/1.55 ${sans};color:#7d8799">
              ${escapeHtml(companyName)}${addressLine ? ` · ${escapeHtml(addressLine)}` : ""}${contact ? `<br>${escapeHtml(contact)}` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to,
    subject: `Affectation d’un commercial — ${commercialName}`,
    html,
  };
}

async function findCommercialManager(orgId, managerName) {
  const wanted = nameKey(managerName);
  if (!orgId || !wanted) return null;
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email,role,active&organization_id=eq.${encodeURIComponent(orgId)}&role=eq.${encodeURIComponent("Responsable commercial")}`
  );
  const matches = (Array.isArray(rows) ? rows : []).filter(row => nameKey(row.full_name) === wanted);
  return matches.find(row => row.active !== false) || matches[0] || null;
}

export async function notifyCommercialManager({
  orgId,
  commercial,
  managerName,
  previousManager = "",
  previousRole = "",
  company,
} = {}) {
  if (!shouldNotifyCommercialAssignment({
    role: commercial?.role,
    manager: managerName,
    previousManager,
    previousRole,
  })) {
    return { sent: false, skipped: true };
  }

  let resolvedCompany = company;
  if (!resolvedCompany && orgId) {
    try {
      const { loadCompany } = await import("./company-store.js");
      resolvedCompany = await loadCompany(orgId);
    } catch {
      resolvedCompany = { ...DEFAULT_COMPANY };
    }
  }

  let manager;
  try {
    manager = await findCommercialManager(orgId, managerName);
  } catch {
    return { sent: false, error: "Le responsable commercial n’a pas pu être retrouvé." };
  }
  if (!manager) {
    return { sent: false, error: "Aucun responsable commercial ne correspond à cette affectation." };
  }

  const payload = buildCommercialAssignmentEmail({
    commercial,
    manager: { name: manager.full_name, email: manager.email },
    company: resolvedCompany || { ...DEFAULT_COMPANY },
  });
  if (!payload) {
    return { sent: false, error: "Le responsable commercial n’a pas d’adresse e-mail." };
  }

  try {
    await sendMail({ ...payload, attachments: [mklLogoMailAttachment()] });
    return { sent: true, to: payload.to, managerName: manager.full_name };
  } catch (error) {
    return { sent: false, error: mailErrorText(error) };
  }
}
