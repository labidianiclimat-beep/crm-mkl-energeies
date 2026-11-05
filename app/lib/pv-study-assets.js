import { serviceCreateSignedUrl, serviceDownloadObject, serviceUploadObject } from "./supabase-server.js";
import { CLIENT_DOCUMENTS_BUCKET } from "./client-documents.js";

export const PV_STUDY_ASSETS_BUCKET = "pv-study-assets";
export const PV_IMAGE_FIELDS = ["fluxPng", "rgbPng"];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const FALLBACK_PREFIX = "pv-study/";

export function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { contentType: match[1] || "image/png", bytes };
}

export function isTransientImageUrl(value) {
  const raw = String(value || "");
  return (
    raw.startsWith("data:") ||
    raw.includes("/api/pv/study-assets") ||
    raw.includes("/storage/v1/object/sign")
  );
}

export function isOwnedStoragePath(organizationId, path) {
  const normalized = String(path || "").replace(/^\/+/, "").replace(/^pv-study\//, "");
  return Boolean(organizationId) && normalized.startsWith(`${organizationId}/`) && !normalized.includes("..");
}

export function storagePathForPvImage(organizationId, projectId, field) {
  return `${organizationId}/${projectId || "draft"}/${field}.png`;
}

function pathCandidates(path) {
  const normalized = String(path || "").replace(/^\/+/, "");
  if (!normalized) return [];
  if (normalized.startsWith(FALLBACK_PREFIX)) {
    return [
      [CLIENT_DOCUMENTS_BUCKET, normalized],
      [PV_STUDY_ASSETS_BUCKET, normalized.slice(FALLBACK_PREFIX.length)],
    ];
  }
  return [
    [PV_STUDY_ASSETS_BUCKET, normalized],
    [CLIENT_DOCUMENTS_BUCKET, `${FALLBACK_PREFIX}${normalized}`],
  ];
}

async function uploadPvImage(path, bytes, contentType) {
  try {
    await serviceUploadObject(PV_STUDY_ASSETS_BUCKET, path, bytes, contentType);
    return path;
  } catch (error) {
    const fallbackPath = `${FALLBACK_PREFIX}${path}`;
    await serviceUploadObject(CLIENT_DOCUMENTS_BUCKET, fallbackPath, bytes, contentType);
    return fallbackPath;
  }
}

export async function downloadPvImage(organizationId, path) {
  if (!isOwnedStoragePath(organizationId, path)) {
    const error = new Error("IMAGE_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  let lastError = null;
  for (const [bucket, objectPath] of pathCandidates(path)) {
    try {
      return await serviceDownloadObject(bucket, objectPath);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("IMAGE_NOT_FOUND");
}

async function persistOneProject(organizationId, record) {
  const study = record?.completeStudy;
  if (!study) return record;
  const nextStudy = { ...study };
  for (const field of PV_IMAGE_FIELDS) {
    const parsed = parseDataUrl(nextStudy[field]);
    const pathField = `${field}Path`;
    if (parsed) {
      const path = storagePathForPvImage(organizationId, record.id, field);
      try {
        nextStudy[pathField] = await uploadPvImage(path, parsed.bytes, parsed.contentType);
      } catch (error) {
        console.error("PV image upload failed", error.message);
      }
    }
    if (isTransientImageUrl(nextStudy[field])) delete nextStudy[field];
  }
  return { ...record, completeStudy: nextStudy };
}

export async function persistPvProjectImages(organizationId, records) {
  const next = [];
  for (const record of Array.isArray(records) ? records : []) {
    next.push(await persistOneProject(organizationId, record));
  }
  return next;
}

export async function hydratePvProjectImages(organizationId, records) {
  return Promise.all((Array.isArray(records) ? records : []).map(async record => {
    const study = record?.completeStudy;
    if (!study) return record;
    const nextStudy = { ...study };
    for (const field of PV_IMAGE_FIELDS) {
      const path = nextStudy[`${field}Path`];
      if (!path || (nextStudy[field] && !isTransientImageUrl(nextStudy[field]))) continue;
      if (!isOwnedStoragePath(organizationId, path)) continue;
      let signed = "";
      for (const [bucket, objectPath] of pathCandidates(path)) {
        try {
          signed = await serviceCreateSignedUrl(bucket, objectPath, 60 * 60 * 6);
          break;
        } catch {}
      }
      nextStudy[field] = signed || `/api/pv/study-assets?path=${encodeURIComponent(path)}`;
    }
    return { ...record, completeStudy: nextStudy };
  }));
}
