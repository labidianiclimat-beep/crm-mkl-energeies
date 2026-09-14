import nodemailer from "nodemailer";

function mailFrom() {
  return process.env.MAIL_FROM || "MKL Énergies <contact@mkl-energies.fr>";
}

function smtpConfigured() {
  return Boolean(process.env.MAIL_SMTP_PASSWORD || process.env.MAIL_SMTP_PASS);
}

function resendConfigured() {
  return Boolean(process.env.MAIL_API_TOKEN || process.env.RESEND_API_KEY);
}

function smtpTransport() {
  const password = process.env.MAIL_SMTP_PASSWORD || process.env.MAIL_SMTP_PASS;
  const port = Number(process.env.MAIL_SMTP_PORT || 587);
  const secure = process.env.MAIL_SMTP_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST || "ssl0.ovh.net",
    port,
    secure,
    auth: {
      user: process.env.MAIL_SMTP_USER || "contact@mkl-energies.fr",
      pass: password,
    },
  });
}

function normalizeAttachments(attachments = []) {
  return attachments.map(attachment => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content, "base64"),
    contentType: attachment.contentType || "application/octet-stream",
  }));
}

async function sendViaSmtp({ to, subject, html, attachments }) {
  const transport = smtpTransport();
  try {
    await transport.sendMail({
      from: mailFrom(),
      to,
      subject,
      html,
      attachments: normalizeAttachments(attachments),
    });
  } catch (error) {
    throw new Error(`MAIL_SMTP_ERROR:${error.message}`);
  }
}

async function sendViaResend({ to, subject, html, attachments }) {
  const apiUrl = process.env.MAIL_API_URL || "https://api.resend.com/emails";
  const apiToken = process.env.MAIL_API_TOKEN || process.env.RESEND_API_KEY;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, attachments }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MAIL_PROVIDER_ERROR:${response.status}:${detail.slice(0, 200)}`);
  }
}

export async function sendMail({ to, subject, html, attachments = [] }) {
  if (smtpConfigured()) {
    await sendViaSmtp({ to, subject, html, attachments });
    return;
  }

  if (resendConfigured()) {
    await sendViaResend({ to, subject, html, attachments });
    return;
  }

  throw new Error("MAIL_NOT_CONFIGURED");
}
