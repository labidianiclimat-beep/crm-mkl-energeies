import { splitPersonName } from "./devis.js";

/** Mandat de démarches photovoltaïques — joint à un devis qui contient une vente photovoltaïque. */
export const PV_MANDAT_PAGE_WIDTH = 595.28;
export const PV_MANDAT_PAGE_HEIGHT = 841.89;
export const PV_MANDAT_PAGE_PATH = "/pv-mandat/page-1.jpg";

const FIELDS = {
  name: [54, 590, 540, 604],
  address: [54, 540, 540, 554],
  postal: [54, 490, 540, 504],
  place: [97, 150, 244, 166],
  day: [276, 150, 312, 166],
  month: [317, 150, 354, 166],
  year: [358, 150, 414, 166],
};

function text(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function safe(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isEmptyLine(item) {
  return Boolean(item?.free) && !text(item?.name || item?.designation);
}

function isPhotovoltaicLine(item) {
  const hay = normalize([
    item?.name,
    item?.designation,
    item?.category,
    item?.categorie,
    item?.subcategory,
    item?.sous_categorie,
    item?.code,
    item?.reference,
    item?.family,
  ].filter(Boolean).join(" "));
  return hay.includes("photovolta");
}

/** Devis qui contient au moins une vente photovoltaïque. */
export function quoteHasPhotovoltaic(doc = {}) {
  if (text(doc.kind || "Devis") !== "Devis") return false;
  return (doc.items || []).some(item => !isEmptyLine(item) && isPhotovoltaicLine(item));
}

export function shouldPrintPvMandat(doc = {}) {
  if (doc.printPvMandat === false) return false;
  return quoteHasPhotovoltaic(doc);
}

function personFromClient(client = {}, doc = {}) {
  const lastName = text(client.lastName);
  const firstName = text(client.firstName);
  if (lastName || firstName) return { lastName, firstName };
  const split = splitPersonName(client.name || client.contact || doc.client);
  if (split.lastName) return split;
  return { firstName: "", lastName: split.firstName };
}

function quoteDateParts(value) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: iso[3], month: iso[2], year: iso[1] };
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return { day: "", month: "", year: "" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
  };
}

export function buildPvMandatData(doc = {}, { client = {} } = {}) {
  const person = personFromClient(client, doc);
  const site = doc.siteDifferent
    ? {
        address: [doc.siteAddress, doc.siteComplement].filter(Boolean).join(" "),
        postal: text(doc.sitePostalCode),
        city: text(doc.siteCity),
      }
    : {
        address: [client.address, client.addressComplement].filter(Boolean).join(" "),
        postal: text(client.postalCode || client.codePostal),
        city: text(client.city),
      };
  const when = quoteDateParts(doc.date);
  return {
    name: [person.lastName, person.firstName].filter(Boolean).join(" "),
    address: site.address,
    postal: [site.postal, site.city].filter(Boolean).join(" "),
    place: site.city,
    ...when,
  };
}

export function pvMandatBoxStyle(x1, y1, x2, y2) {
  const left = (x1 / PV_MANDAT_PAGE_WIDTH) * 100;
  const top = ((PV_MANDAT_PAGE_HEIGHT - y2) / PV_MANDAT_PAGE_HEIGHT) * 100;
  const width = ((x2 - x1) / PV_MANDAT_PAGE_WIDTH) * 100;
  const height = ((y2 - y1) / PV_MANDAT_PAGE_HEIGHT) * 100;
  return `left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${width.toFixed(3)}%;height:${height.toFixed(3)}%`;
}

function field(value, box, date = false) {
  const content = text(value);
  if (!content) return "";
  return `<span class="pv-mandat-val${date ? " is-date" : ""}" style="${pvMandatBoxStyle(...box)}">${safe(content)}</span>`;
}

function pageItems(data) {
  return [
    ["text", data.name, FIELDS.name],
    ["text", data.address, FIELDS.address],
    ["text", data.postal, FIELDS.postal],
    ["date", data.place, FIELDS.place],
    ["date", data.day, FIELDS.day],
    ["date", data.month, FIELDS.month],
    ["date", data.year, FIELDS.year],
  ];
}

const PV_MANDAT_PRINT_CSS = `.pv-mandat-sheet{width:210mm;height:297mm;min-height:297mm;padding:0!important;overflow:hidden;page-break-before:always;position:relative;background:#fff}.pv-mandat-sheet .pv-mandat-bg{width:210mm;height:297mm;display:block}.pv-mandat-val{position:absolute;margin:0;padding:0 0.6mm;font:11pt Arial,Helvetica,sans-serif;color:#1a2438;display:flex;align-items:flex-end;overflow:hidden;white-space:nowrap;background:#fff}.pv-mandat-val.is-date{font-size:10pt;align-items:center}@media print{.pv-mandat-sheet{margin:0;box-shadow:none}}`;

export function pvMandatPrintSheet(data, image = PV_MANDAT_PAGE_PATH) {
  const overlays = pageItems(data).map(([type, value, box]) => field(value, box, type === "date")).join("");
  return `<style>${PV_MANDAT_PRINT_CSS}</style><main class="sheet pv-mandat-sheet" aria-label="Mandat photovoltaïque"><img class="pv-mandat-bg" src="${image}" alt="Mandat photovoltaïque">${overlays}</main>`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Mandat photovoltaïque illisible"));
    image.src = src;
  });
}

function drawOverlays(ctx, items, width, height) {
  ctx.fillStyle = "#1a2438";
  ctx.textBaseline = "middle";
  for (const [type, value, box] of items || []) {
    if (!text(value)) continue;
    const [x1, y1, x2, y2] = box;
    const left = (x1 / PV_MANDAT_PAGE_WIDTH) * width;
    const top = ((PV_MANDAT_PAGE_HEIGHT - y2) / PV_MANDAT_PAGE_HEIGHT) * height;
    const boxWidth = ((x2 - x1) / PV_MANDAT_PAGE_WIDTH) * width;
    const boxHeight = ((y2 - y1) / PV_MANDAT_PAGE_HEIGHT) * height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, top, boxWidth, boxHeight);
    ctx.fillStyle = "#1a2438";
    ctx.font = `400 ${Math.max(12, boxHeight * 0.72)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(String(value), left + 3, top + boxHeight / 2, Math.max(8, boxWidth - 6));
  }
}

async function loadPvMandatPage() {
  try {
    const response = await fetch(PV_MANDAT_PAGE_PATH);
    if (!response.ok) return PV_MANDAT_PAGE_PATH;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return PV_MANDAT_PAGE_PATH;
  }
}

export async function pvMandatToAnnexImages(doc, { client = {} } = {}) {
  if (!shouldPrintPvMandat(doc) || typeof document === "undefined") return [];
  const data = buildPvMandatData(doc, { client });
  const src = await loadPvMandatPage();
  try {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1414;
    canvas.height = image.naturalHeight || 2000;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    drawOverlays(ctx, pageItems(data), canvas.width, canvas.height);
    return [{ data: canvas.toDataURL("image/jpeg", 0.86), format: "JPEG" }];
  } catch {
    return [];
  }
}

export async function buildPvMandatAnnexHtml(doc, { client = {} } = {}) {
  if (!shouldPrintPvMandat(doc)) return "";
  const data = buildPvMandatData(doc, { client });
  const image = typeof fetch === "function" ? await loadPvMandatPage() : PV_MANDAT_PAGE_PATH;
  return pvMandatPrintSheet(data, image);
}
