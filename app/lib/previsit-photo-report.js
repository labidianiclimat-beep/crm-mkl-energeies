import { inspectJpeg, jpegPagesToPdf } from "./jpeg-pdf.js";
import { MAX_PREVISIT_PHOTOS, parseJpegBuffer } from "./previsit-photos.js";

const MAX_REPORT_BYTES = 15_000_000;

const A4 = { width: 1240, height: 1754 };

export function groupPhotosForReport(photos = []) {
  const pages = [];
  const list = [...(photos || [])];
  while (list.length) {
    const first = list.shift();
    const landscape = Number(first.width) > Number(first.height);
    const second = landscape && list[0] && Number(list[0].width) > Number(list[0].height) ? list.shift() : null;
    pages.push(second ? [first, second] : [first]);
  }
  return pages;
}

export function assertReportPhotos(photos = []) {
  if (!photos.length) throw new Error("Ajoutez au moins une photo avant de générer le PDF.");
  if (photos.length > MAX_PREVISIT_PHOTOS) {
    throw new Error(`${MAX_PREVISIT_PHOTOS} photos maximum par prévisite.`);
  }
  return photos;
}

export function parseReportJpegPages(buffers = []) {
  if (!buffers.length) throw new Error("Ajoutez au moins une photo avant de générer le PDF.");
  if (buffers.length > MAX_PREVISIT_PHOTOS) {
    throw new Error(`${MAX_PREVISIT_PHOTOS} pages maximum pour le rapport.`);
  }
  let total = 0;
  return buffers.map((raw, index) => {
    const bytes = parseJpegBuffer(raw, `La page ${index + 1}`);
    total += bytes.length;
    if (total > MAX_REPORT_BYTES) throw new Error("Le rapport dépasse la taille maximale.");
    return bytes;
  });
}

export async function composeReportPageJpegs({
  photos = [],
  meta = {},
  logo,
  loadImage,
} = {}) {
  const pages = groupPhotosForReport(assertReportPhotos(photos));
  const drawImage = loadImage || defaultLoadImage;
  const logoImage = logo ? await drawImage(logo) : null;
  const blobs = [];
  for (const group of pages) {
    const canvas = document.createElement("canvas");
    canvas.width = A4.width;
    canvas.height = A4.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawHeader(ctx, { meta, logoImage });
    const top = 210;
    const bottom = canvas.height - 70;
    const gap = 24;
    const slotH = group.length === 2 ? (bottom - top - gap) / 2 : bottom - top;
    for (const [index, photo] of group.entries()) {
      const image = await drawImage(photo.src);
      const box = { x: 48, y: top + index * (slotH + gap), w: canvas.width - 96, h: slotH - 48 };
      fitImage(ctx, image, box);
      ctx.fillStyle = "#233252";
      ctx.font = "22px Arial";
      const caption = [photo.caption, photo.comment].filter(Boolean).join(" — ") || "Photo technique";
      ctx.fillText(caption, box.x, box.y + box.h + 32);
    }
    drawFooter(ctx, meta);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => (result ? resolve(result) : reject(new Error("Page PDF illisible."))), "image/jpeg", 0.86);
    });
    blobs.push(blob);
  }
  return blobs;
}

function drawHeader(ctx, { meta, logoImage }) {
  ctx.fillStyle = "#405fae";
  ctx.fillRect(0, 0, A4.width, 168);
  ctx.fillStyle = "#ffdb62";
  ctx.fillRect(0, 168, A4.width, 8);
  if (logoImage) ctx.drawImage(logoImage, 36, 28, 210, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Rapport photos — prévisite technique", 270, 58);
  ctx.font = "20px Arial";
  const lines = [
    [meta.client, meta.address].filter(Boolean).join(" · "),
    [`N° ${meta.number || "—"}`, meta.date, meta.technician].filter(Boolean).join(" · "),
  ];
  lines.forEach((line, index) => ctx.fillText(line || " ", 270, 98 + index * 28));
}

function drawFooter(ctx, meta) {
  ctx.fillStyle = "#7d8798";
  ctx.font = "18px Arial";
  ctx.fillText(`Généré le ${meta.generatedAt || "—"} — MKL Énergies`, 48, A4.height - 28);
}

function fitImage(ctx, image, box) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(box.w / width, box.h / height);
  const w = width * scale;
  const h = height * scale;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.fillStyle = "#eef2fa";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.drawImage(image, x, y, w, h);
}

function defaultLoadImage(src) {
  if (typeof Image === "undefined") return Promise.reject(new Error("Image indisponible."));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible."));
    image.src = typeof src === "string" ? src : URL.createObjectURL(src);
  });
}

export function reportJpegsToPdf(jpegs) {
  if (!jpegs?.length) throw new Error("Ajoutez au moins une photo avant de générer le PDF.");
  jpegs.forEach((bytes, index) => inspectJpeg(bytes));
  return jpegPagesToPdf(jpegs);
}
