/** Identité entreprise affichée à gauche du client sur formulaires et PDF. */

export const COMPANY_STATE_KEY = "mkl-company";

export const DEFAULT_COMPANY = {
  legalName: "MKL Énergies",
  tradeName: "MKL Énergies",
  legalForm: "",
  siret: "",
  vatNumber: "",
  rcs: "",
  ape: "",
  capital: "",
  address: "",
  addressComplement: "",
  postalCode: "",
  city: "",
  phone: "",
  email: "contact@mkl-energies.fr",
  website: "",
  insurance: "",
  cgvName: "",
  cgvData: "",
};

const SIRET_RE = /^\d{14}$/;

function text(value) {
  return String(value || "").trim();
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function formatSiret(value) {
  const raw = digits(value).slice(0, 14);
  return raw.replace(/(\d{3})(\d{3})(\d{3})(\d{0,5})/, (_, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(" ")
  );
}

export function sanitizeCompany(input = {}) {
  const siret = digits(input.siret).slice(0, 14);
  return {
    legalName: text(input.legalName) || DEFAULT_COMPANY.legalName,
    tradeName: text(input.tradeName) || text(input.legalName) || DEFAULT_COMPANY.tradeName,
    legalForm: text(input.legalForm),
    siret,
    vatNumber: text(input.vatNumber).toUpperCase(),
    rcs: text(input.rcs),
    ape: text(input.ape).toUpperCase(),
    capital: text(input.capital),
    address: text(input.address),
    addressComplement: text(input.addressComplement),
    postalCode: text(input.postalCode).replace(/\D/g, "").slice(0, 5),
    city: text(input.city),
    phone: text(input.phone),
    email: text(input.email).toLowerCase(),
    website: text(input.website),
    insurance: text(input.insurance),
    cgvName: text(input.cgvName),
    cgvData: String(input.cgvData || "").startsWith("data:") ? String(input.cgvData) : "",
  };
}

export function companyHasCgv(company = {}) {
  return String(company?.cgvData || "").startsWith("data:");
}

export function validateCompanyPayload(company) {
  const errors = [];
  if (!company.legalName) errors.push("La raison sociale est obligatoire.");
  if (company.siret && !SIRET_RE.test(company.siret)) {
    errors.push("Le numéro SIRET doit contenir 14 chiffres.");
  }
  if (company.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) {
    errors.push("L’adresse email de l’entreprise est invalide.");
  }
  return errors;
}

export function companyDisplayName(company = DEFAULT_COMPANY) {
  return company.tradeName || company.legalName || DEFAULT_COMPANY.legalName;
}

export function companyAddressLine(company = {}) {
  return [company.address, company.addressComplement, [company.postalCode, company.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
}

export function formatCapital(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/[€a-zA-Z]/.test(raw)) return raw;
  const amount = Number(raw.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return raw;
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(amount)
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
  return `${formatted} €`;
}

export function companyLegalLines(company = {}) {
  const lines = [];
  if (company.siret) lines.push(`SIRET ${formatSiret(company.siret)}`);
  if (company.vatNumber) lines.push(`TVA ${company.vatNumber}`);
  const capital = formatCapital(company.capital);
  if (capital) lines.push(`Capital ${capital}`);
  return lines;
}

/** Lignes sous le nom, identiques sur le devis, les PDF et les formulaires. */
export function companyEmitterLines(company = {}) {
  return [...companyLegalLines(company), companyAddressLine(company)].filter(Boolean);
}

export function companyContactLine(company = {}) {
  return [company.phone, company.email, company.website].filter(Boolean).join(" · ");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function companyPartyHtml(company = DEFAULT_COMPANY) {
  const name = escapeHtml(companyDisplayName(company));
  const legal = companyEmitterLines(company).map(escapeHtml).join("<br>");
  return `<section class="document-party is-company"><span>Émetteur</span><b>${name}</b>${legal ? `<p>${legal}</p>` : ""}</section>`;
}

export function customerPartyHtml({
  title = "CLIENT / DESTINATAIRE",
  name,
  contact,
  address,
  phone,
  email,
  clientNumber,
} = {}) {
  const displayName = escapeHtml(name || "Client");
  const numberLine = clientNumber ? `<p><b>${escapeHtml(clientNumber)}</b></p>` : "";
  const contactLine = contact && contact !== name ? `<p>${escapeHtml(contact)}</p>` : "";
  const coords = [phone, email].filter(Boolean).map(escapeHtml).join(" • ");
  return `<section class="document-party is-client"><span>${escapeHtml(title)}</span>${numberLine}<b>${displayName}</b>${contactLine}<p>${escapeHtml(address || "Adresse à compléter")}</p>${coords ? `<p>${coords}</p>` : ""}</section>`;
}

export function documentPartiesHtml(company, customer) {
  return `<div class="document-parties">${companyPartyHtml(company)}${customerPartyHtml(customer)}</div>`;
}

export const DOCUMENT_HEAD_CSS = `.document-head{display:grid;grid-template-columns:64mm 1fr;align-items:center;border-bottom:5px solid #ffdb62;padding-bottom:7mm;margin:0 0 6mm}.document-head img{width:58mm;height:auto;display:block}.document-head>div{background:#405fae;color:#fff;padding:6mm}.document-head span{display:block;font-size:9px;letter-spacing:1.4px}.document-head h1{font-size:21px;margin:3px 0;color:#fff;line-height:1.15}.document-head p{font-size:9px;margin:0;color:#e1e8fb}.document-head.compact{grid-template-columns:52mm 1fr}.document-head.compact img{width:46mm}`;

export const DOCUMENT_PARTIES_CSS = `.document-parties{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:0 0 4mm}.document-party{border:1px solid #d8deea;border-radius:3mm;padding:3.5mm;background:#f8f9fc;min-height:26mm}.document-party>span{display:block;font-size:9px;letter-spacing:.8px;color:#405fae;margin-bottom:2mm;font-weight:700;text-transform:uppercase}.document-party>b{font-size:14px;color:#1f2d4f}.document-party p{margin:1.5mm 0;font-size:10px;line-height:1.35;color:#536077}.document-party.is-company{border-color:#405fae;background:#eef2fa}.document-party.is-company>b{color:#405fae}.document-party.is-client{border-color:#ffdb62;background:#fffdf4}@media print{.document-parties{display:grid!important;grid-template-columns:1fr 1fr!important}.document-parties,.document-party{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
