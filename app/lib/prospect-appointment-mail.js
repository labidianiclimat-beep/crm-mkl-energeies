import { readFileSync } from "node:fs";
import { formatFullAddress } from "./address.js";
import {
  companyAddressLine,
  companyContactLine,
  companyDisplayName,
  DEFAULT_COMPANY,
} from "./company.js";
import { sendMail } from "./send-mail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function prospectNotifyEmail(prospect) {
  const email = String(prospect?.email || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

export function formatProspectAppointmentWhen(value, timeZone = "Europe/Paris") {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone }).format(date);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
  return {
    weekday: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`,
    day,
    time,
    label: `${weekday} ${day} à ${time}`,
  };
}

export function formatDurationLabel(minutes) {
  const value = Number(minutes) || 0;
  if (value <= 0) return "";
  if (value < 60) return `${value} minutes`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!rest) return hours === 1 ? "1 heure" : `${hours} heures`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

export function mklLogoMailAttachment() {
  const content = readFileSync(new URL("../../public/mkl-energies.png", import.meta.url)).toString("base64");
  return {
    filename: "mkl-energies.png",
    content,
    contentType: "image/png",
    cid: "mkl-logo",
  };
}

export function isProspectVisitAppointment(appointment) {
  const kind = String(appointment?.kind || "").toLowerCase();
  if (kind === "busy") return false;
  return kind !== "rappel";
}

function greetingName(prospect) {
  return String(prospect?.firstName || prospect?.name || "").trim();
}

export function assignedCommercialName(appointment, prospect) {
  const name = String(appointment?.commercial || prospect?.owner || prospect?.commercial || "").trim();
  if (!name || /^(non affecté|moi)$/i.test(name)) return "";
  const commercialId = appointment?.commercialId || prospect?.commercialId;
  if (!commercialId) return "";
  return name;
}

function visitAddress(prospect, appointment) {
  return String(appointment?.address || "").trim()
    || formatFullAddress(prospect)
    || [prospect?.address, prospect?.postalCode, prospect?.city].filter(Boolean).join(" ");
}

export function buildProspectAppointmentEmail({
  prospect,
  appointment,
  company = DEFAULT_COMPANY,
  logoUrl = "cid:mkl-logo",
} = {}) {
  const to = prospectNotifyEmail(prospect);
  const when = formatProspectAppointmentWhen(appointment?.start);
  const commercial = assignedCommercialName(appointment, prospect);
  if (!to || !when || !commercial || String(appointment?.kind || "").toLowerCase() === "busy") return null;

  const companyName = companyDisplayName(company);
  const hello = greetingName(prospect);
  const isCall = String(appointment?.kind || "").toLowerCase() === "rappel"
    || /appel|téléphone/i.test(String(appointment?.appointmentType || appointment?.meetingMode || ""));
  const place = visitAddress(prospect, appointment);
  const duration = formatDurationLabel(appointment?.duration);
  const subject = isCall
    ? `Votre appel avec ${commercial} — ${when.day} à ${when.time}`
    : `Votre rendez-vous avec ${commercial} — ${when.day} à ${when.time}`;
  const title = isCall ? "Votre appel est confirmé" : "Votre rendez-vous est confirmé";
  const intro = isCall
    ? `Nous avons le plaisir de vous confirmer l’appel prévu avec ${commercial}, conseiller MKL Énergies.`
    : `Nous avons le plaisir de vous confirmer votre rendez-vous avec ${commercial}, conseiller MKL Énergies.`;
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="148" alt="${escapeHtml(companyName)}" style="display:block;border:0;background:#fff;border-radius:8px;padding:8px">`
    : `<div style="font:700 22px Manrope,'Segoe UI','Helvetica Neue',Arial,sans-serif;letter-spacing:-.4px;color:#ffcc00">${escapeHtml(companyName)}</div>`;
  const sans = "DM Sans,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
  const display = "Manrope,'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const rows = [
    ["Jour", when.weekday],
    ["Date", when.day],
    ["Heure", when.time],
    duration ? ["Durée", duration] : null,
    place ? [isCall ? "Mode" : "Lieu", isCall ? (appointment.meetingMode || "Téléphone") : place] : null,
    ["Conseiller", commercial],
    prospect?.type ? ["Projet", prospect.type] : null,
  ].filter(Boolean);

  const details = rows.map(([label, value], index) => `
    <tr>
      <td style="padding:${index === 0 ? "0" : "13px"} 0 0;width:32%;font:700 11px/1.3 ${sans};letter-spacing:1.1px;text-transform:uppercase;color:#405fae">${escapeHtml(label)}</td>
      <td style="padding:${index === 0 ? "0" : "13px"} 0 0;font:700 17px/1.35 ${display};letter-spacing:-.2px;color:#152347">${escapeHtml(value)}</td>
    </tr>`).join("");

  const contact = companyContactLine(company);
  const addressLine = companyAddressLine(company);
  const phone = company.phone || "";
  const mail = company.email || "contact@mkl-energies.fr";

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#e8edf6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf6;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(21,35,71,.12)">
          <tr>
            <td style="background:#314d93;padding:22px 28px">${logo}</td>
          </tr>
          <tr>
            <td style="height:7px;background:#ffcc00;font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 32px 20px;font-family:${sans};color:#233252">
              <p style="margin:0 0 10px;font:700 11px/1.3 ${sans};letter-spacing:2px;text-transform:uppercase;color:#405fae">Confirmation</p>
              <h1 style="margin:0 0 18px;font:700 30px/1.15 ${display};letter-spacing:-.7px;color:#152347">${escapeHtml(title)}</h1>
              <p style="margin:0 0 10px;font:600 16px/1.6 ${sans};color:#233252">Bonjour${hello ? ` ${escapeHtml(hello)}` : ""},</p>
              <p style="margin:0 0 24px;font:400 16px/1.65 ${sans};color:#3d4a66">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2fa;border:1px solid #d5deee;border-radius:14px">
                <tr>
                  <td style="padding:22px 24px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details}</table>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font:400 15px/1.65 ${sans};color:#3d4a66">Pour modifier ou annuler ce rendez-vous, répondez à cet e-mail${phone ? ` ou appelez-nous au <b style="font-family:${display}">${escapeHtml(phone)}</b>` : ""}.</p>
              <p style="margin:20px 0 0;font:400 15px/1.65 ${sans};color:#3d4a66">À très bientôt,<br><b style="font:700 16px/1.4 ${display};color:#152347">${escapeHtml(companyName)}</b></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f6fb;padding:18px 32px;font:400 12px/1.55 ${sans};color:#7d8799">
              ${escapeHtml(companyName)}${addressLine ? ` · ${escapeHtml(addressLine)}` : ""}${contact ? `<br>${escapeHtml(contact)}` : `<br>${escapeHtml(mail)}`}
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

export async function notifyProspectOfAppointment({
  orgId,
  prospect,
  appointment,
  company,
} = {}) {
  let resolvedCompany = company;
  if (!resolvedCompany && orgId) {
    try {
      const { loadCompany } = await import("./company-store.js");
      resolvedCompany = await loadCompany(orgId);
    } catch {
      resolvedCompany = { ...DEFAULT_COMPANY };
    }
  }
  resolvedCompany = resolvedCompany || { ...DEFAULT_COMPANY };
  let resolvedAppointment = appointment;
  if (appointment?.commercialId && !assignedCommercialName(appointment, prospect)) {
    try {
      const { loadProfileNames } = await import("./profile-names.js");
      const names = await loadProfileNames([appointment.commercialId]);
      resolvedAppointment = { ...appointment, commercial: names[appointment.commercialId] || appointment.commercial || "" };
    } catch {
      resolvedAppointment = appointment;
    }
  }
  const payload = buildProspectAppointmentEmail({
    prospect,
    appointment: resolvedAppointment,
    company: resolvedCompany,
    logoUrl: "cid:mkl-logo",
  });
  if (!payload) return { sent: false };
  try {
    await sendMail({ ...payload, attachments: [mklLogoMailAttachment()] });
    return { sent: true, to: payload.to };
  } catch {
    return { sent: false };
  }
}
