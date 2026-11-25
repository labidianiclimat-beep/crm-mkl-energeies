import { splitPersonName } from "./devis.js";

/** Mandat MaPrimeRénov’ — joint à un devis qui contient une pompe à chaleur air/eau. */
export const ANAH_PAGE_WIDTH = 595.276;
export const ANAH_PAGE_HEIGHT = 841.89001;
export const ANAH_PAGE_PATHS = ["/anah/page-1.jpg", "/anah/page-2.jpg"];

const PAGE_ONE = {
  monsieur: [69.12, 471.6, 76.08, 478.56],
  madame: [111, 471.6, 117.96, 478.56],
  lastName: [79.32, 455.64, 339.72, 469.32],
  firstName: [375.36, 455.64, 538.44, 469.56],
  address: [56.88, 414.12, 541.56, 428.04],
  postal: [101.4, 399.12, 155.76, 413.04],
  city: [201.36, 399.12, 538.44, 413.04],
  email: [107.76, 382.92, 538.44, 396.6],
  phone: [147.96, 366.6, 256.56, 380.52],
};

const PAGE_TWO = {
  place: [62.76, 227.04, 439.68, 240.96],
  day: [50.64, 215.16, 72.12, 226.68],
  month: [78, 215.16, 99.6, 226.68],
  year: [105.6, 215.16, 148.8, 226.68],
  clientName: [42.3, 138.91, 284.32, 151.84],
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

function identityHay(item = {}) {
  return normalize([
    item.name,
    item.designation,
    item.category,
    item.categorie,
    item.subcategory,
    item.sous_categorie,
    item.code,
    item.reference,
    item.family,
  ].filter(Boolean).join(" "));
}

function isEmptyLine(item) {
  return Boolean(item?.free) && !text(item?.name || item?.designation);
}

function isAirEauHeatPump(item) {
  const hay = identityHay(item);
  if (/air\s*\/\s*air|climatis|monosplit|multisplit/.test(hay)) return false;
  if (/ballon|thermodynamique/.test(hay) && !/pompe a chaleur|\bpac\b/.test(hay)) return false;
  if (/air\s*\/?\s*eau/.test(hay)) return true;
  if (/pompe a chaleur/.test(hay)) return true;
  return false;
}

/** Devis qui contient au moins une pompe à chaleur air/eau, même mélangée à d’autres produits. */
export function quoteHasAirEauHeatPump(doc = {}) {
  if (text(doc.kind || "Devis") !== "Devis") return false;
  const lines = (doc.items || []).filter(item => !isEmptyLine(item) && text(item?.name || item?.designation || item?.description));
  return lines.some(isAirEauHeatPump);
}

export function shouldPrintAnahMandat(doc = {}) {
  if (doc.printAnahMandat === false) return false;
  return quoteHasAirEauHeatPump(doc);
}

function personFromClient(client = {}, doc = {}) {
  const lastName = text(client.lastName);
  const firstName = text(client.firstName);
  if (lastName || firstName) return { lastName, firstName };
  const split = splitPersonName(client.name || client.contact || doc.client);
  if (split.lastName) return split;
  return { firstName: "", lastName: split.firstName };
}

function civilityMarks(civilite) {
  const key = normalize(civilite);
  if (!key) return { monsieur: false, madame: false };
  if (key.includes("mr") && key.includes("mme")) return { monsieur: true, madame: true };
  if (key === "m." || key === "monsieur" || key === "mr") return { monsieur: true, madame: false };
  if (key === "mme" || key === "madame" || key === "mlle") return { monsieur: false, madame: true };
  return { monsieur: false, madame: false };
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

function upper(value) {
  return text(value).toLocaleUpperCase("fr-FR");
}

export function buildAnahMandatData(doc = {}, { client = {} } = {}) {
  const person = personFromClient(client, doc);
  const site = doc.siteDifferent
    ? {
        address: [doc.siteAddress, doc.siteComplement].filter(Boolean).join(" "),
        postal: text(doc.sitePostalCode),
        city: text(doc.siteCity),
      }
    : {
        address: [client.address, client.addressComplement].filter(Boolean).join(" "),
        postal: text(client.postalCode),
        city: text(client.city),
      };
  const marks = civilityMarks(client.civilite);
  const when = quoteDateParts(doc.date);
  return {
    monsieur: marks.monsieur,
    madame: marks.madame,
    lastName: upper(person.lastName),
    firstName: upper(person.firstName),
    address: upper(site.address),
    postal: site.postal,
    city: upper(site.city),
    email: text(client.email),
    phone: text(client.mobile || client.phone),
    place: upper(site.city),
    ...when,
    clientName: upper([person.lastName, person.firstName].filter(Boolean).join(" ")),
  };
}

export function anahBoxStyle(x1, y1, x2, y2) {
  const left = (x1 / ANAH_PAGE_WIDTH) * 100;
  const top = ((ANAH_PAGE_HEIGHT - y2) / ANAH_PAGE_HEIGHT) * 100;
  const width = ((x2 - x1) / ANAH_PAGE_WIDTH) * 100;
  const height = ((y2 - y1) / ANAH_PAGE_HEIGHT) * 100;
  return `left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${width.toFixed(3)}%;height:${height.toFixed(3)}%`;
}

function field(value, box) {
  const content = text(value);
  if (!content) return "";
  return `<span class="anah-val" style="${anahBoxStyle(...box)}">${safe(content)}</span>`;
}

function mark(on, box) {
  if (!on) return "";
  return `<span class="anah-x" style="${anahBoxStyle(...box)}">X</span>`;
}

function pageOneItems(data) {
  return [
    ["x", data.monsieur, PAGE_ONE.monsieur],
    ["x", data.madame, PAGE_ONE.madame],
    ["text", data.lastName, PAGE_ONE.lastName],
    ["text", data.firstName, PAGE_ONE.firstName],
    ["text", data.address, PAGE_ONE.address],
    ["text", data.postal, PAGE_ONE.postal],
    ["text", data.city, PAGE_ONE.city],
    ["text", data.email, PAGE_ONE.email],
    ["text", data.phone, PAGE_ONE.phone],
  ];
}

function pageTwoItems(data) {
  return [
    ["text", data.place, PAGE_TWO.place],
    ["text", data.day, PAGE_TWO.day],
    ["text", data.month, PAGE_TWO.month],
    ["text", data.year, PAGE_TWO.year],
    ["text", data.clientName, PAGE_TWO.clientName],
  ];
}

function overlaysHtml(items) {
  return items.map(([type, value, box]) => (type === "x" ? mark(value, box) : field(value, box))).join("");
}

const ANAH_PRINT_CSS = `.anah-sheet{width:210mm;height:297mm;min-height:297mm;padding:0!important;overflow:hidden;page-break-before:always;position:relative;background:#fff}.anah-sheet .anah-bg{width:210mm;height:297mm;display:block}.anah-val{position:absolute;margin:0;padding:0 0.4mm;font:8.5pt Arial,Helvetica,sans-serif;color:#111;display:flex;align-items:center;overflow:hidden;white-space:nowrap}.anah-x{position:absolute;margin:0;font:8pt Arial,Helvetica,sans-serif;font-weight:700;color:#111;display:flex;align-items:center;justify-content:center;line-height:1}@media print{.anah-sheet{margin:0;box-shadow:none}}`;

export function anahMandatPrintSheets(data, images = ANAH_PAGE_PATHS) {
  const pages = [
    { src: images[0], overlays: overlaysHtml(pageOneItems(data)) },
    { src: images[1], overlays: overlaysHtml(pageTwoItems(data)) },
  ];
  const sheets = pages
    .filter(page => page.src)
    .map((page, index) => `<main class="sheet anah-sheet" aria-label="Mandat ANAH page ${index + 1}"><img class="anah-bg" src="${page.src}" alt="Mandat ANAH page ${index + 1}">${page.overlays}</main>`)
    .join("");
  return `<style>${ANAH_PRINT_CSS}</style>${sheets}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Mandat ANAH illisible"));
    image.src = src;
  });
}

function drawOverlays(ctx, items, width, height) {
  ctx.fillStyle = "#111";
  ctx.textBaseline = "middle";
  for (const [type, value, box] of items || []) {
    if (type === "text" && !text(value)) continue;
    if (type === "x" && !value) continue;
    const [x1, y1, x2, y2] = box;
    const left = (x1 / ANAH_PAGE_WIDTH) * width;
    const top = ((ANAH_PAGE_HEIGHT - y2) / ANAH_PAGE_HEIGHT) * height;
    const boxWidth = ((x2 - x1) / ANAH_PAGE_WIDTH) * width;
    const boxHeight = ((y2 - y1) / ANAH_PAGE_HEIGHT) * height;
    if (type === "x") {
      ctx.font = `700 ${Math.max(9, boxHeight * 0.85)}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("X", left + boxWidth / 2, top + boxHeight / 2);
      ctx.textAlign = "left";
      continue;
    }
    ctx.font = `400 ${Math.max(11, height * 0.012)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(String(value), left + 2, top + boxHeight / 2, Math.max(8, boxWidth - 4));
  }
}

async function loadAnahPageImages() {
  return Promise.all(ANAH_PAGE_PATHS.map(async path => {
    try {
      const response = await fetch(path);
      if (!response.ok) return path;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      return path;
    }
  }));
}

export async function anahMandatToAnnexImages(doc, { client = {} } = {}) {
  if (!shouldPrintAnahMandat(doc) || typeof document === "undefined") return [];
  const data = buildAnahMandatData(doc, { client });
  const backgrounds = await loadAnahPageImages();
  const pages = [pageOneItems(data), pageTwoItems(data)];
  const images = [];
  for (let index = 0; index < backgrounds.length; index += 1) {
    const src = backgrounds[index];
    if (!src) continue;
    try {
      const image = await loadImage(src);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1240;
      canvas.height = image.naturalHeight || 1754;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawOverlays(ctx, pages[index], canvas.width, canvas.height);
      images.push({ data: canvas.toDataURL("image/jpeg", 0.86), format: "JPEG" });
    } catch {
      // page illisible : on ignore pour ne pas bloquer le devis
    }
  }
  return images;
}

export async function buildAnahMandatAnnexHtml(doc, { client = {} } = {}) {
  if (!shouldPrintAnahMandat(doc)) return "";
  const data = buildAnahMandatData(doc, { client });
  const images = typeof fetch === "function" ? await loadAnahPageImages() : ANAH_PAGE_PATHS;
  return anahMandatPrintSheets(data, images);
}
