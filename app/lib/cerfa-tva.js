import { splitPersonName } from "./devis.js";

export const CERFA_TVA_RATE = 5.5;
export const CERFA_PAGE_WIDTH = 595.303937;
export const CERFA_PAGE_HEIGHT = 841.889764;
export const CERFA_FORM_ID = "1301-SD";
export const CERFA_PAGE_PATHS = [
  "/cerfa/page-1.jpg",
  "/cerfa/page-2.jpg",
  "/cerfa/page-3.jpg",
  "/cerfa/page-4.jpg",
];

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
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function lineTax(item, defaultTax = 20) {
  return Number(item?.tax ?? item?.taux_tva ?? defaultTax);
}

function isEmptyFreeLine(item) {
  return Boolean(item?.free) && !text(item?.name);
}

export function quoteHasVat55(doc = {}, items = doc.items) {
  const lines = Array.isArray(items) ? items : [];
  const defaultTax = Number(doc.tax ?? doc.tax_default ?? 20);
  return lines.some(item => !isEmptyFreeLine(item) && Math.abs(lineTax(item, defaultTax) - CERFA_TVA_RATE) < 0.05);
}

export function shouldPrintCerfaTva(doc = {}) {
  return String(doc.kind || "Devis") === "Devis" && doc.printCerfaTva === true && quoteHasVat55(doc);
}

export function formatCerfaDate(value) {
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR");
}

function mapHousing(housingType) {
  const key = normalize(housingType);
  if (key === "maison") return { housing: "maison", housingOther: "" };
  if (key === "appartement") return { housing: "appartement", housingOther: "" };
  if (key.includes("collectif") || key.includes("immeuble")) return { housing: "collectif", housingOther: "" };
  if (!key) return { housing: "", housingOther: "" };
  return { housing: "autre", housingOther: text(housingType) };
}

function mapOccupancy(occupancy) {
  const key = normalize(occupancy);
  if (key.includes("proprietaire")) return { occupancy: "proprietaire", occupancyOther: "" };
  if (key.includes("locataire")) return { occupancy: "locataire", occupancyOther: "" };
  if (!key) return { occupancy: "", occupancyOther: "" };
  return { occupancy: "autre", occupancyOther: text(occupancy) };
}

function personFromClient(client = {}, doc = {}) {
  const lastName = text(client.lastName);
  const firstName = text(client.firstName);
  if (lastName || firstName) {
    return { lastName: lastName || text(client.company) || text(doc.client), firstName };
  }
  const company = text(client.company);
  if (company && normalize(client.customerType) && normalize(client.customerType) !== "particulier") {
    return { lastName: company, firstName: "" };
  }
  if (company) return { lastName: company, firstName: "" };
  const split = splitPersonName(client.name || client.contact || doc.client);
  return {
    lastName: split.lastName || split.firstName,
    firstName: split.lastName ? split.firstName : "",
  };
}

function vat55Items(doc = {}) {
  const defaultTax = Number(doc.tax ?? 20);
  return (doc.items || []).filter(item => !isEmptyFreeLine(item) && Math.abs(lineTax(item, defaultTax) - CERFA_TVA_RATE) < 0.05);
}

function inducedWorks(items = []) {
  return items.some(item => /pose|main.?d.?oeuvre|accessoire|raccord|gaine|liaison|support/i.test(`${item.name || ""} ${item.description || ""}`));
}

export function buildCerfaTvaData(doc = {}, { client = {}, company = {} } = {}) {
  const person = personFromClient(client, doc);
  const housing = mapHousing(doc.housingType);
  const occupancy = mapOccupancy(doc.occupancy);
  const items = vat55Items(doc);
  const clientAddress = text(client.address);
  const clientPostalCode = text(client.postalCode);
  const clientCity = text(client.city);
  const siteDifferent = Boolean(doc.siteDifferent);
  const residential = housing.housing === "maison" || housing.housing === "appartement" || housing.housing === "collectif";
  return {
    applicable: quoteHasVat55(doc),
    lastName: person.lastName,
    firstName: person.firstName,
    address: clientAddress,
    postalCode: clientPostalCode,
    city: clientCity,
    housing: housing.housing,
    housingOther: housing.housingOther,
    worksPlace: residential ? "habitation" : "",
    milliemes: "",
    siteDifferent,
    siteAddress: siteDifferent ? [doc.siteAddress, doc.siteComplement].filter(Boolean).join(" ") : "",
    siteCity: siteDifferent ? text(doc.siteCity) : "",
    sitePostalCode: siteDifferent ? text(doc.sitePostalCode) : "",
    occupancy: occupancy.occupancy,
    occupancyOther: occupancy.occupancyOther,
    checks: {
      cac4: true,
      cac5: true,
      cac6: false,
      cac7: false,
      cac8: false,
      cac9: false,
      cac10: false,
      cac11: false,
      cac12: true,
      cac13: true,
      cac14: true,
      cac15: inducedWorks(items),
    },
    signedAt: clientCity,
    signedOn: formatCerfaDate(doc.date),
    items,
  };
}

export function cerfaBoxStyle(x1, y1, x2, y2) {
  const left = (x1 / CERFA_PAGE_WIDTH) * 100;
  const top = ((CERFA_PAGE_HEIGHT - y2) / CERFA_PAGE_HEIGHT) * 100;
  const width = ((x2 - x1) / CERFA_PAGE_WIDTH) * 100;
  const height = ((y2 - y1) / CERFA_PAGE_HEIGHT) * 100;
  return `left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${width.toFixed(3)}%;height:${height.toFixed(3)}%`;
}

function field(value, box) {
  const content = text(value);
  if (!content) return "";
  return `<span class="cerfa-val" style="${cerfaBoxStyle(...box)}">${safe(content)}</span>`;
}

function mark(on, box) {
  if (!on) return "";
  return `<span class="cerfa-x" style="${cerfaBoxStyle(...box)}">X</span>`;
}

function pageOneItems(data) {
  const c = data.checks || {};
  return [
    ["text", data.lastName, [77.8362, 664.187, 269.421, 677.285]],
    ["text", data.firstName, [310.774, 664.861, 519.944, 677.959]],
    ["text", data.address, [89.8721, 653.697, 269.283, 666.795]],
    ["text", data.postalCode, [324.742, 653.297, 361.724, 666.395]],
    ["text", data.city, [403.763, 653.288, 536.646, 666.386]],
    ["x", data.housing === "maison", [57.6131, 595.786, 64.0145, 602.29]],
    ["x", data.housing === "collectif", [242.035, 595.869, 248.436, 602.373]],
    ["x", data.housing === "appartement", [383.852, 595.934, 390.253, 602.437]],
    ["x", data.housing === "autre", [57.6131, 585.201, 64.0145, 591.705]],
    ["text", data.housingOther, [277.124, 581.475, 484.154, 595.042]],
    ["x", data.worksPlace === "habitation", [57.6131, 564.527, 64.0145, 571.031]],
    ["x", data.worksPlace === "pieces", [57.6131, 554.09, 64.0145, 560.594]],
    ["x", data.worksPlace === "communes", [57.6131, 543.909, 64.0145, 550.413]],
    ["text", data.milliemes, [485.215, 541.906, 532.773, 553.308]],
    ["x", data.worksPlace === "transformation", [57.6855, 523.125, 64.0869, 529.629]],
    ["text", data.siteAddress, [92.343, 509.314, 254.543, 523.279]],
    ["text", data.siteCity, [293.76, 509.314, 404.461, 522.881]],
    ["text", data.sitePostalCode, [454.421, 509.441, 488.506, 523.406]],
    ["x", data.occupancy === "proprietaire", [106.716, 502.517, 113.117, 509.021]],
    ["x", data.occupancy === "locataire", [171.18, 502.653, 177.499, 508.993]],
    ["x", data.occupancy === "autre", [242.134, 502.609, 248.535, 509.113]],
    ["text", data.occupancyOther, [360.897, 498.864, 476.948, 512.485]],
    ["x", c.cac4, [57.6577, 434.414, 64.1683, 440.973]],
    ["x", c.cac5, [57.6577, 411.896, 64.1683, 418.454]],
    ["x", c.cac6, [273.967, 398.644, 280.641, 405.257]],
    ["x", c.cac7, [96.6485, 387.886, 103.431, 394.772]],
    ["x", c.cac8, [191.422, 388.232, 197.986, 395.008]],
    ["x", c.cac9, [277.921, 388.35, 284.486, 394.909]],
    ["x", c.cac10, [438.713, 388.478, 445.496, 394.982]],
    ["x", c.cac11, [57.6577, 377.932, 64.3318, 384.49]],
    ["x", c.cac12, [57.6577, 352.135, 63.9228, 358.693]],
    ["x", c.cac13, [57.6577, 338.807, 64.0865, 345.365]],
    ["x", c.cac14, [57.6577, 325.347, 64.1683, 331.905]],
    ["x", c.cac15, [57.5446, 281.104, 63.946, 287.608]],
  ];
}

function pageTwoItems(data) {
  return [
    ["text", data.signedAt, [261.469, 633.257, 374.595, 645.543]],
    ["text", data.signedOn, [397.613, 633.257, 452.677, 645.543]],
  ];
}

function overlaysHtml(items) {
  return items.map(([type, value, box]) => (type === "x" ? mark(value, box) : field(value, box))).join("");
}

function pageOneOverlays(data) {
  return overlaysHtml(pageOneItems(data));
}

function pageTwoOverlays(data) {
  return overlaysHtml(pageTwoItems(data));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image CERFA illisible"));
    image.src = src;
  });
}

function drawCerfaOverlays(ctx, items, width, height) {
  ctx.fillStyle = "#111";
  ctx.textBaseline = "middle";
  for (const [type, value, box] of items || []) {
    if (type === "text" && !text(value)) continue;
    if (type === "x" && !value) continue;
    const [x1, y1, x2, y2] = box;
    const left = (x1 / CERFA_PAGE_WIDTH) * width;
    const top = ((CERFA_PAGE_HEIGHT - y2) / CERFA_PAGE_HEIGHT) * height;
    const boxWidth = ((x2 - x1) / CERFA_PAGE_WIDTH) * width;
    const boxHeight = ((y2 - y1) / CERFA_PAGE_HEIGHT) * height;
    if (type === "x") {
      ctx.font = `700 ${Math.max(10, boxHeight * 0.9)}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("X", left + boxWidth / 2, top + boxHeight / 2);
      ctx.textAlign = "left";
      continue;
    }
    ctx.font = `400 ${Math.max(10, height * 0.011)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(String(value), left + 2, top + boxHeight / 2, Math.max(8, boxWidth - 4));
  }
}

export async function cerfaTvaToAnnexImages(doc, { client = {}, company = {} } = {}) {
  if (!shouldPrintCerfaTva(doc) || typeof document === "undefined") return [];
  const data = buildCerfaTvaData(doc, { client, company });
  const backgrounds = await loadCerfaPageImages();
  const pages = [pageOneItems(data), pageTwoItems(data), [], []];
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
      drawCerfaOverlays(ctx, pages[index], canvas.width, canvas.height);
      images.push({ data: canvas.toDataURL("image/jpeg", 0.86), format: "JPEG" });
    } catch {
      // page illisible : on ignore pour ne pas bloquer le devis
    }
  }
  return images;
}

const CERFA_PRINT_CSS = `.cerfa-sheet{width:210mm;height:297mm;min-height:297mm;padding:0!important;overflow:hidden;page-break-before:always;position:relative;background:#fff}.cerfa-sheet .cerfa-bg{width:210mm;height:297mm;display:block}.cerfa-val{position:absolute;margin:0;padding:0 0.4mm;font:8.2pt Arial,Helvetica,sans-serif;color:#111;display:flex;align-items:center;overflow:hidden;white-space:nowrap}.cerfa-x{position:absolute;margin:0;font:8.4pt Arial,Helvetica,sans-serif;font-weight:700;color:#111;display:flex;align-items:center;justify-content:center;line-height:1}@media print{.cerfa-sheet{margin:0;box-shadow:none}}`;

export function cerfaTvaPrintSheets(data, images = CERFA_PAGE_PATHS) {
  const pages = [
    { src: images[0], overlays: pageOneOverlays(data) },
    { src: images[1], overlays: pageTwoOverlays(data) },
    { src: images[2], overlays: "" },
    { src: images[3], overlays: "" },
  ];
  const sheets = pages
    .filter(page => page.src)
    .map((page, index) => `<main class="sheet cerfa-sheet" aria-label="CERFA ${CERFA_FORM_ID} page ${index + 1}"><img class="cerfa-bg" src="${page.src}" alt="CERFA ${CERFA_FORM_ID} page ${index + 1}">${page.overlays}</main>`)
    .join("");
  return `<style>${CERFA_PRINT_CSS}</style>${sheets}`;
}

export async function loadCerfaPageImages() {
  return Promise.all(CERFA_PAGE_PATHS.map(async path => {
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

export async function buildCerfaTvaAnnexHtml(doc, { client = {}, company = {} } = {}) {
  if (!shouldPrintCerfaTva(doc)) return "";
  const data = buildCerfaTvaData(doc, { client, company });
  const images = await loadCerfaPageImages();
  return cerfaTvaPrintSheets(data, images);
}
