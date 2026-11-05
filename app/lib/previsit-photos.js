export const PREVISIT_PHOTOS_BUCKET = "previsit-photos";
export const MAX_PREVISIT_PHOTOS = 20;
export const MAX_PREVISIT_PHOTO_BYTES = 4 * 1024 * 1024;
export const PREVISIT_VISIT_KEY_RE = /^[A-Za-z0-9._-]{1,80}$/;

export const PREVISIT_EQUIPMENT = [
  { id: "indoor_ac", label: "Unité intérieure de climatisation", src: "/equipment/indoor-ac.svg" },
  { id: "indoor_hp", label: "Unité intérieure de pompe à chaleur air/eau", src: "/equipment/indoor-hp.svg" },
  { id: "outdoor_ac", label: "Groupe extérieur de climatisation", src: "/equipment/outdoor-ac.svg" },
  { id: "outdoor_hp", label: "Groupe extérieur de pompe à chaleur air/eau", src: "/equipment/outdoor-hp.svg" },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedId(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function normalizeVisitKey(value) {
  const key = String(value || "").trim();
  if (!PREVISIT_VISIT_KEY_RE.test(key)) throw new Error("Prévisite introuvable.");
  return key;
}

export function equipmentById(id) {
  return PREVISIT_EQUIPMENT.find(item => item.id === id) || null;
}

export function normalizeCaption(value) {
  return String(value || "").trim().slice(0, 160);
}

export function normalizeComment(value) {
  return String(value || "").trim().slice(0, 500);
}

export function normalizeMarks(marks = []) {
  if (!Array.isArray(marks)) throw new Error("Annotations invalides.");
  if (marks.length > 30) throw new Error("30 équipements maximum par photo.");
  return marks.map((mark, index) => {
    const equipment = equipmentById(mark.equipmentType || mark.equipment_type);
    if (!equipment) throw new Error("Choisissez un équipement de la bibliothèque.");
    const x = Number(mark.x);
    const y = Number(mark.y);
    const scale = Number(mark.scale ?? 0.18);
    const rotation = Number(mark.rotation ?? 0);
    if (![x, y, scale, rotation].every(Number.isFinite)) throw new Error("Position d’équipement invalide.");
    return {
      id: isPersistedId(mark.id) ? mark.id : undefined,
      equipmentType: equipment.id,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      scale: Math.min(0.8, Math.max(0.06, scale)),
      rotation: ((rotation % 360) + 360) % 360,
      sortOrder: index,
    };
  });
}

export function storagePathForPhoto({ organizationId, visitKey, photoId, kind }) {
  const suffix = kind === "original" ? "original.jpg" : "annotated.jpg";
  return `${organizationId}/previsits/${visitKey}/${photoId}-${suffix}`;
}

export function parseJpegBuffer(raw, label = "photo") {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (bytes.length > MAX_PREVISIT_PHOTO_BYTES) throw new Error(`${label} trop lourde.`);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`${label} : envoyez une photo JPEG.`);
  }
  return bytes;
}

export function photoToUi(row, marks = [], visitKey) {
  if (!row) return null;
  return {
    id: row.id,
    visitKey: row.visit_key || visitKey,
    clientId: row.client_id || null,
    caption: row.caption || "",
    comment: row.comment || "",
    sortOrder: Number(row.sort_order || 0),
    takenAt: row.taken_at,
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    marks: (marks || []).map(mark => ({
      id: mark.id,
      equipmentType: mark.equipment_type,
      x: Number(mark.x),
      y: Number(mark.y),
      scale: Number(mark.scale),
      rotation: Number(mark.rotation),
    })),
  };
}

export function createMark(equipmentType, x, y) {
  const equipment = equipmentById(equipmentType);
  if (!equipment) throw new Error("Choisissez un équipement de la bibliothèque.");
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    equipmentType: equipment.id,
    x: Math.min(1, Math.max(0, Number(x) || 0.5)),
    y: Math.min(1, Math.max(0, Number(y) || 0.5)),
    scale: 0.18,
    rotation: 0,
  };
}

export async function compressPhotoFile(file, { maxEdge = 1920, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => (result ? resolve(result) : reject(new Error("Compression impossible."))), "image/jpeg", quality);
  });
  return { blob, width, height };
}

export async function renderAnnotatedJpeg(imageUrl, marks = [], { quality = 0.85 } = {}) {
  const image = await loadHtmlImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const icons = await Promise.all(PREVISIT_EQUIPMENT.map(async item => [item.id, await loadHtmlImage(item.src)]));
  const iconMap = Object.fromEntries(icons);
  for (const mark of marks) {
    const icon = iconMap[mark.equipmentType];
    if (!icon) continue;
    const size = Math.min(canvas.width, canvas.height) * Number(mark.scale || 0.18);
    const x = Number(mark.x) * canvas.width;
    const y = Number(mark.y) * canvas.height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Number(mark.rotation || 0) * Math.PI) / 180);
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => (result ? resolve(result) : reject(new Error("Annotation impossible."))), "image/jpeg", quality);
  });
  return { blob, width: canvas.width, height: canvas.height };
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible."));
    image.src = src;
  });
}
