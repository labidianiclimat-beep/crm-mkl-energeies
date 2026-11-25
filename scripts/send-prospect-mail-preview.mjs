import { execSync } from "node:child_process";
import {
  buildProspectAppointmentEmail,
  mklLogoMailAttachment,
} from "../app/lib/prospect-appointment-mail.js";
import { sendMail } from "../app/lib/send-mail.js";

const MAIL_KEYS = [
  "MAIL_FROM",
  "MAIL_SMTP_HOST",
  "MAIL_SMTP_PORT",
  "MAIL_SMTP_USER",
  "MAIL_SMTP_PASSWORD",
  "MAIL_SMTP_PASS",
  "MAIL_SMTP_SECURE",
  "MAIL_API_TOKEN",
  "RESEND_API_KEY",
];

function loadMailEnvFromVercel() {
  if (process.env.MAIL_SMTP_PASSWORD || process.env.MAIL_SMTP_PASS || process.env.MAIL_API_TOKEN || process.env.RESEND_API_KEY) {
    return;
  }
  for (const key of MAIL_KEYS) {
    try {
      const value = execSync(`npx vercel env get ${key} production --scope mkl-crm --yes`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
      }).trim();
      if (value && !/not found|error|undefined/i.test(value)) process.env[key] = value;
    } catch {
      // Optional key.
    }
  }
}

loadMailEnvFromVercel();

const to = process.argv[2] || "labidianiclimat@gmail.com";
const mail = buildProspectAppointmentEmail({
  prospect: {
    firstName: "Climholia",
    name: "Climholia",
    email: to,
    address: "12 rue des Lilas",
    postalCode: "67000",
    city: "Strasbourg",
    type: "Pompe à chaleur",
  },
  appointment: {
    start: "2026-09-22T07:00:00.000Z",
    duration: 60,
    kind: "rendez-vous",
    commercialId: "22222222-2222-4222-8222-222222222222",
    commercial: "Karim Benali",
  },
  company: {
    legalName: "MKL Énergies",
    tradeName: "MKL Énergies",
    phone: "03 88 00 00 00",
    email: "contact@mkl-energies.fr",
  },
  logoUrl: "cid:mkl-logo",
});

if (!mail) {
  console.error("Mail non préparé.");
  process.exit(1);
}

await sendMail({
  ...mail,
  attachments: [mklLogoMailAttachment()],
});

console.log(`Envoyé à ${to}`);
console.log(`Objet : ${mail.subject}`);
