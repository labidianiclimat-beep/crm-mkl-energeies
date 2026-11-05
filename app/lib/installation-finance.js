import { normalizeRoleLabel } from "./roles.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INSTALLATION_FINANCE_WRITE_ROLES = [
  "Secrétariat",
  "Responsable technique",
  "Superadmin",
  "Admin VIP",
];

export const INSTALLATION_FINANCE_READ_ROLES = ["Superadmin", "Admin VIP"];

export const INSTALLATION_SALES_ROLES = ["Commercial", "Responsable commercial"];

/** Chantier sans commercial : la secrétaire choisit « Autres ». */
export const INSTALLATION_OTHER_COMMERCIAL = "autres";
export const INSTALLATION_OTHER_COMMERCIAL_LABEL = "Autres";

export const INSTALLATION_CONFIDENTIAL_FIELDS = [
  "commercialId",
  "commercialName",
  "saleTtc",
  "saleTtcCents",
  "saleAmount",
  "poseAmount",
  "poseCents",
  "purchases",
  "purchaseTotal",
  "purchaseTotalCents",
  "finance",
  "installationFinance",
];

export const INSTALLATION_FINANCE_AUDIT_ACTION = "chantier.finance_save";

export function canWriteInstallationFinance(role) {
  return INSTALLATION_FINANCE_WRITE_ROLES.includes(normalizeRoleLabel(role));
}

export function canReadInstallationFinance(role) {
  return INSTALLATION_FINANCE_READ_ROLES.includes(normalizeRoleLabel(role));
}

export function isInstallationSalesRole(role) {
  return INSTALLATION_SALES_ROLES.includes(normalizeRoleLabel(role));
}

export function isInstallationId(value) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ""));
}

export function parseEuroToCents(value) {
  if (typeof value === "number") return { ok: false, error: "Montant invalide." };
  const raw = String(value ?? "")
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/€/g, "");
  if (!raw) return { ok: false, error: "Indiquez un montant." };
  if (raw.startsWith("-")) return { ok: false, error: "Le montant doit être positif ou nul." };
  const normalized = raw.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, error: "Montant invalide." };
  const [whole, frac = ""] = normalized.split(".");
  if (frac.length > 2) return { ok: false, error: "Le montant accepte au maximum deux décimales." };
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0) return { ok: false, error: "Montant invalide." };
  return { ok: true, cents };
}

export function centsToInput(cents) {
  const amount = Number(cents);
  if (!Number.isSafeInteger(amount) || amount < 0) return "";
  const whole = Math.floor(amount / 100);
  const frac = String(amount % 100).padStart(2, "0");
  return `${whole},${frac}`;
}

export function formatEuroFromCents(cents) {
  const amount = Number(cents);
  if (!Number.isSafeInteger(amount)) return "";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export function emptyInstallationFinance() {
  return {
    commercialId: "",
    saleTtc: "",
    poseAmount: "",
    purchases: [{ key: "achat-1", label: "", amount: "" }],
  };
}

export function addPurchaseLine(draft) {
  const purchases = [...(draft?.purchases || []), { key: `achat-${Date.now()}`, label: "", amount: "" }];
  return { ...(draft || emptyInstallationFinance()), purchases };
}

export function removePurchaseLine(draft, key) {
  const current = draft?.purchases || [];
  if (current.length <= 1) return draft;
  return { ...draft, purchases: current.filter(line => line.key !== key) };
}

export function financeToDraft(finance) {
  if (!finance) return emptyInstallationFinance();
  const purchases = (finance.purchases || []).map((line, index) => ({
    key: String(line.id || line.key || `achat-${index + 1}`),
    label: line.label || "",
    amount: centsToInput(line.amountCents),
  }));
  return {
    commercialId: finance.commercialId || INSTALLATION_OTHER_COMMERCIAL,
    saleTtc: centsToInput(finance.saleTtcCents),
    poseAmount: centsToInput(finance.poseCents),
    purchases: purchases.length ? purchases : emptyInstallationFinance().purchases,
  };
}

export function validateInstallationFinance(input = {}) {
  const rawCommercial = String(input.commercialId || "").trim();
  const otherCommercial = rawCommercial === INSTALLATION_OTHER_COMMERCIAL;
  if (!otherCommercial && !UUID_RE.test(rawCommercial)) {
    return { ok: false, error: "Choisissez le commercial du chantier." };
  }
  const commercialId = otherCommercial ? null : rawCommercial;
  if (!String(input.saleTtc ?? "").trim()) return { ok: false, error: "Indiquez le montant de la vente TTC." };
  const sale = parseEuroToCents(input.saleTtc);
  if (!sale.ok) return { ok: false, error: sale.error === "Indiquez un montant." ? "Indiquez le montant de la vente TTC." : sale.error };
  if (!String(input.poseAmount ?? "").trim()) return { ok: false, error: "Indiquez le montant alloué à la pose." };
  const pose = parseEuroToCents(input.poseAmount);
  if (!pose.ok) return { ok: false, error: pose.error === "Indiquez un montant." ? "Indiquez le montant alloué à la pose." : pose.error };
  const lines = Array.isArray(input.purchases) ? input.purchases : [];
  if (!lines.length) return { ok: false, error: "Ajoutez au moins un achat." };
  if (lines.length > 50) return { ok: false, error: "Trop de lignes d’achat." };
  const purchases = [];
  for (const line of lines) {
    const label = String(line?.label ?? line?.description ?? "").trim();
    if (!label) return { ok: false, error: "Chaque achat doit avoir un libellé." };
    if (label.length > 200) return { ok: false, error: "Le libellé d’un achat est trop long." };
    if (String(line?.amount ?? line?.montant ?? "").trim() === "") {
      return { ok: false, error: "Chaque achat doit avoir un montant." };
    }
    const amount = parseEuroToCents(line?.amount ?? line?.montant);
    if (!amount.ok) return { ok: false, error: amount.error || "Montant d’achat invalide." };
    purchases.push({ label, amountCents: amount.cents });
  }
  const purchaseTotalCents = purchases.reduce((sum, line) => sum + line.amountCents, 0);
  return {
    ok: true,
    commercialId,
    saleTtcCents: sale.cents,
    poseCents: pose.cents,
    purchases,
    purchaseTotalCents,
  };
}

export function installationSalespeople(team = []) {
  return (Array.isArray(team) ? team : [])
    .filter(user => isInstallationSalesRole(user?.role) && user?.active !== false && user?.status !== "Inactif")
    .map(user => ({
      id: String(user.supabaseId || user.id || ""),
      name: String(user.name || user.full_name || user.email || "Commercial"),
    }))
    .filter(user => UUID_RE.test(user.id));
}

export function stripInstallationFinance(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const next = { ...record };
  for (const key of INSTALLATION_CONFIDENTIAL_FIELDS) delete next[key];
  return next;
}

export function installationFinanceAudit(parsed) {
  return {
    action: INSTALLATION_FINANCE_AUDIT_ACTION,
    module: "Chantiers",
    entityType: "installation",
    oldValue: null,
    newValue: { purchaseCount: parsed?.purchases?.length || 0 },
  };
}

export function financeWriteResponse(canRead, finance = null) {
  if (!canRead) return { ok: true };
  return { ok: true, finance };
}

export function assembleInstallationFinances(rows = [], purchases = [], people = []) {
  const names = new Map((people || []).map(person => [person.id, person.full_name || person.email || ""]));
  const linesByFinance = new Map();
  for (const line of purchases || []) {
    const bucket = linesByFinance.get(line.finance_id) || [];
    bucket.push(line);
    linesByFinance.set(line.finance_id, bucket);
  }
  return (rows || []).map(row => {
    const lines = (linesByFinance.get(row.id) || [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position));
    const presented = lines.map(line => ({
      id: line.id,
      label: line.label,
      amountCents: Number(line.amount_cents),
    }));
    const purchaseTotalCents = presented.reduce((sum, line) => sum + line.amountCents, 0);
    return {
      installationId: String(row.installation_id),
      commercialId: row.commercial_id || "",
      commercialName: row.commercial_id
        ? (names.get(row.commercial_id) || "")
        : INSTALLATION_OTHER_COMMERCIAL_LABEL,
      saleTtcCents: Number(row.sale_ttc_cents),
      poseCents: Number(row.pose_cents),
      purchases: presented,
      purchaseTotalCents,
    };
  });
}
