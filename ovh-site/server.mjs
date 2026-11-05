import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { buildAgenda, SLOT_HOURS, AGENDA_BUSINESS_DAYS } from "./data/slots.js";
import { CATEGORIES, REALISATIONS as BASE_REALISATIONS } from "./data/realisations.js";
import {
  assertAuthConfigured,
  buildSessionCookie,
  createSession,
  destroySession,
  getAdminPasswordHash,
  getSessionFromRequest,
  rateLimit,
  requireAdmin,
  verifyPassword,
} from "./lib/admin-auth.mjs";
import {
  appendComplianceProof,
  appendOppositionToProof,
  deriveCallbackCompliance,
  isComplianceEnabled,
  readProof,
  FORM_COPY_VERSION,
} from "./lib/compliance-proof.mjs";
import { readJsonArray as readStoredJsonArray } from "./lib/json-store.mjs";
import { crmSyncEnabled, listCrmJobs, processCrmOutbox, requeueCrmJob } from "./lib/crm-outbox.mjs";
import { crmSyncConfig, crmSyncConfigured, sendCrmJob } from "./lib/crm-sync.mjs";
import { appendAppointmentRecord, appendLeadRecord, updateJsonRecords } from "./lib/lead-records.mjs";
import { parseAttribution, parseFirstAttribution } from "./lib/lead-attribution.mjs";
import { servePublicFile } from "./lib/public-static.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Charge .env local s’il existe (jamais commité) — sans dépendance dotenv */
async function loadEnvFile() {
  try {
    const raw = await fs.readFile(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* pas de .env */
  }
}
await loadEnvFile();
assertAuthConfigured();

const PORT = Number(process.env.PORT) || 4317;
const ROOT = __dirname;
const COVERS_PATH = path.join(ROOT, "data", "covers.json");
const CATEGORY_COVERS_PATH = path.join(ROOT, "data", "category-covers.json");
const DATA_DIR = path.join(ROOT, "data");
const LEADS_PATH = path.join(DATA_DIR, "leads.json");
const APPTS_PATH = path.join(DATA_DIR, "appointments.json");
const OUTBOX_PATH = path.join(DATA_DIR, "crm-outbox.json");
const EXTRA_PATH = path.join(ROOT, "data", "realisations-extra.json");
const CLIM_GALLERY_PATH = path.join(ROOT, "data", "clim-gallery.json");
const GOOGLE_REVIEWS_PATH = path.join(ROOT, "data", "google-reviews.json");
const UPLOAD_DIR = path.join(ROOT, "assets", "realisations");
const CLIM_GALLERY_DIR = path.join(ROOT, "assets", "clim", "gallery");
const CATEGORY_COVER_DIR = path.join(ROOT, "assets", "realisations", "metiers");
const LOGO_MARK_PATH = path.join(ROOT, "assets", "logo-mkl-energies-mark.png");

/** Catégories galerie landing climatisation */
const CLIM_GALLERY_CATEGORIES = [
  { id: "monosplit", title: "Monosplit" },
  { id: "multisplit", title: "Multisplit" },
  { id: "exterieur", title: "Unités extérieures" },
];
const CLIM_GALLERY_CAT_IDS = new Set(CLIM_GALLERY_CATEGORIES.map((c) => c.id));

/** Places API (optionnel) — note + avis live, sinon cache JSON */
const GOOGLE_PLACES_API_KEY = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
const GOOGLE_PLACE_ID = String(process.env.GOOGLE_PLACE_ID || "").trim();
const GOOGLE_REVIEWS_TTL_MS = 6 * 60 * 60 * 1000;
let googleReviewsMemory = null;
let googleReviewsFetchedAt = 0;

/** Cache du logo transparent (mark) */
let logoMarkCache = null;

async function loadLogoMark() {
  if (logoMarkCache) return logoMarkCache;
  logoMarkCache = await fs.readFile(LOGO_MARK_PATH);
  return logoMarkCache;
}

/**
 * Ajoute le logo MKL Énergies en petit (coin bas-droit) sur toute photo injectée.
 * Mark transparent + ombre légère — pas de plaque blanche opaque.
 * Sortie JPEG pour un poids stable.
 */
async function watermarkPhoto(inputBuf) {
  const base = sharp(inputBuf, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const width = meta.width || 1200;
  const height = meta.height || 800;

  // ~8,8 % largeur, coin bas-droit — marge large (border-radius + object-fit)
  const logoWidth = Math.max(60, Math.min(128, Math.round(width * 0.088)));
  const padX = Math.max(56, Math.round(width * 0.085));
  const padY = Math.max(56, Math.round(height * 0.055));

  const logoResized = await sharp(await loadLogoMark())
    .resize({ width: logoWidth, withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer();

  const logoMeta = await sharp(logoResized).metadata();
  const lw = logoMeta.width || logoWidth;
  const lh = logoMeta.height || Math.round(logoWidth * 0.4);

  // Ombre douce (pas de fond blanc)
  const shadow = await sharp(logoResized)
    .ensureAlpha()
    .tint({ r: 20, g: 28, b: 40 })
    .composite([
      {
        input: Buffer.from([255, 255, 255, 90]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .blur(1.2)
    .png()
    .toBuffer();

  const logoSolid = await sharp(logoResized)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, 235]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const left = Math.max(0, width - lw - padX);
  const top = Math.max(0, height - lh - padY);

  return base
    .composite([
      { input: shadow, left: left + 2, top: top + 2 },
      { input: logoSolid, left, top },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

const HOUSING = new Set(["maison", "appartement", "pro"]);
const INTENTS = new Set(["devis", "rappel"]);
/** Champs PAC optionnels (landing) — ne pas confondre ownership avec status CRM */
const HEATING_CURRENT = new Set(["fioul", "gaz", "electrique", "autre"]);
const SURFACE_BAND = new Set(["lt100", "100_150", "150_200", "gt200"]);
/** Propriétaire élargi pour diagnostic PV (acquisition / non) */
const OWNERSHIP = new Set(["proprietaire", "locataire", "acquisition", "non"]);
const PROJECT_TIMELINE = new Set(["asap", "1_3m", "3_6m", "later"]);
const ROOF_TYPE = new Set(["tuile", "ardoise", "bac_acier", "autre"]);
const BATTERY_CHOICE = new Set(["with", "without", "advice"]);
/** Diagnostic climatisation (landing + RDV) — aucune estimation auto */
const CLIM_ROOMS_BAND = new Set(["1", "2_3", "4_plus"]);
const CLIM_SURFACE_BAND = new Set(["lt40", "40_80", "80_150", "gt150"]);
const CLIM_EXISTING = new Set(["aucune", "a_remplacer", "a_completer"]);
const CLIM_NEED = new Set(["rafraichir", "chauffer_rafraichir", "conseil"]);
const CLIM_SYSTEM_HINT = new Set(["monosplit", "multisplit"]);

function emptyClimGallery() {
  return { version: 1, publishToSite: false, updatedAt: null, items: [] };
}

async function readClimGallery() {
  try {
    const raw = await fs.readFile(CLIM_GALLERY_PATH, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      version: Number(data.version) || 1,
      publishToSite: Boolean(data.publishToSite),
      updatedAt: data.updatedAt || null,
      items,
    };
  } catch {
    return emptyClimGallery();
  }
}

async function writeClimGallery(gallery) {
  await fs.mkdir(path.dirname(CLIM_GALLERY_PATH), { recursive: true });
  const payload = {
    version: 1,
    publishToSite: Boolean(gallery.publishToSite),
    updatedAt: new Date().toISOString(),
    items: Array.isArray(gallery.items) ? gallery.items : [],
  };
  await fs.writeFile(CLIM_GALLERY_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

/**
 * Optimise une photo pour la galerie clim : max 1800px, JPEG web, logo MKL.
 * Redimensionne avant le filigrane pour un poids Web stable.
 */
async function optimizeClimGalleryPhoto(inputBuf) {
  const resized = await sharp(inputBuf, { failOn: "none" })
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const marked = await watermarkPhoto(resized);
  return sharp(marked, { failOn: "none" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

function publicClimGalleryPayload(gallery) {
  const selected = (gallery.items || [])
    .filter((it) => it && it.selected && it.src && CLIM_GALLERY_CAT_IDS.has(it.category))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return {
    ok: true,
    publishToSite: Boolean(gallery.publishToSite),
    categories: CLIM_GALLERY_CATEGORIES,
    items: gallery.publishToSite ? selected : [],
    countSelected: selected.length,
  };
}

async function handleGetClimGalleryPublic(_req, res) {
  try {
    const gallery = await readClimGallery();
    json(res, 200, publicClimGalleryPayload(gallery));
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleGetClimGalleryAdmin(_req, res) {
  try {
    const gallery = await readClimGallery();
    json(res, 200, {
      ok: true,
      gallery,
      categories: CLIM_GALLERY_CATEGORIES,
      publicPreview: publicClimGalleryPayload(gallery),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleSaveClimGallery(req, res) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const current = await readClimGallery();
    const byId = new Map(current.items.map((it) => [it.id, it]));
    const incoming = Array.isArray(data.items) ? data.items : null;

    let items = current.items;
    if (incoming) {
      items = incoming
        .map((it, index) => {
          const id = String(it.id || "").trim();
          if (!id || !byId.has(id)) return null;
          const prev = byId.get(id);
          const category = String(it.category || prev.category || "").trim();
          if (!CLIM_GALLERY_CAT_IDS.has(category)) return null;
          return {
            ...prev,
            category,
            alt: String(it.alt ?? prev.alt ?? "").trim().slice(0, 160),
            caption: String(it.caption ?? prev.caption ?? "").trim().slice(0, 120),
            selected: Boolean(it.selected),
            order: Number.isFinite(Number(it.order)) ? Number(it.order) : index,
          };
        })
        .filter(Boolean);
    }

    const publishToSite =
      typeof data.publishToSite === "boolean" ? data.publishToSite : current.publishToSite;

    const saved = await writeClimGallery({ publishToSite, items });
    json(res, 200, {
      ok: true,
      gallery: saved,
      categories: CLIM_GALLERY_CATEGORIES,
      publicPreview: publicClimGalleryPayload(saved),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleUploadClimGallery(req, res) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const category = String(data.category || "").trim();
    const files = Array.isArray(data.files) ? data.files.slice(0, 24) : [];
    const captionDefault = String(data.caption || "").trim().slice(0, 120);
    const altDefault = String(data.alt || "").trim().slice(0, 160);

    if (!CLIM_GALLERY_CAT_IDS.has(category)) {
      json(res, 400, { ok: false, error: "Catégorie invalide (monosplit, multisplit, exterieur)." });
      return;
    }
    if (!files.length) {
      json(res, 400, { ok: false, error: "Ajoutez au moins une photo." });
      return;
    }

    await fs.mkdir(CLIM_GALLERY_DIR, { recursive: true });
    const gallery = await readClimGallery();
    const added = [];
    let orderBase = gallery.items.reduce((m, it) => Math.max(m, Number(it.order) || 0), 0);

    for (const file of files) {
      const name = String(file.name || "photo.jpg");
      const b64 = String(file.data || "");
      const payload = b64.includes(",") ? b64.split(",").pop() : b64;
      if (!payload) continue;
      let buf;
      try {
        buf = Buffer.from(payload, "base64");
      } catch {
        continue;
      }
      if (buf.length < 100 || buf.length > 12 * 1024 * 1024) continue;

      const id = `clim-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
      const filename = `${id}.jpg`;
      const optimized = await optimizeClimGalleryPhoto(buf);
      await fs.writeFile(path.join(CLIM_GALLERY_DIR, filename), optimized);
      orderBase += 1;
      const item = {
        id,
        category,
        src: `assets/clim/gallery/${filename}`,
        alt:
          altDefault ||
          `${CLIM_GALLERY_CATEGORIES.find((c) => c.id === category)?.title || "Climatisation"} — MKL Énergies`,
        caption: captionDefault || CLIM_GALLERY_CATEGORIES.find((c) => c.id === category)?.title || "",
        selected: false,
        order: orderBase,
        createdAt: new Date().toISOString(),
        bytes: optimized.length,
        originalName: name.slice(0, 120),
      };
      gallery.items.push(item);
      added.push(item);
    }

    if (!added.length) {
      json(res, 400, { ok: false, error: "Aucune photo valide (jpg, png, webp, max 12 Mo)." });
      return;
    }

    const saved = await writeClimGallery(gallery);
    json(res, 201, {
      ok: true,
      added,
      gallery: saved,
      categories: CLIM_GALLERY_CATEGORIES,
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleDeleteClimGalleryItem(req, res, id) {
  try {
    const safeId = String(id || "").trim();
    if (!safeId) {
      json(res, 400, { ok: false, error: "Identifiant manquant." });
      return;
    }
    const gallery = await readClimGallery();
    const item = gallery.items.find((it) => it.id === safeId);
    if (!item) {
      json(res, 404, { ok: false, error: "Photo introuvable." });
      return;
    }
    gallery.items = gallery.items.filter((it) => it.id !== safeId);
    const saved = await writeClimGallery(gallery);
    // Supprime le fichier uniquement s’il est dans assets/clim/gallery/
    if (item.src && String(item.src).startsWith("assets/clim/gallery/")) {
      const abs = path.join(ROOT, item.src);
      if (abs.startsWith(CLIM_GALLERY_DIR)) {
        await fs.unlink(abs).catch(() => {});
      }
    }
    json(res, 200, { ok: true, gallery: saved, categories: CLIM_GALLERY_CATEGORIES });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function enrichLeadCompliance(lead) {
  if (!lead || typeof lead !== "object") return lead;
  if (lead.callbackCompliance === "opposition" || lead.opposition === true) {
    return { ...lead, callbackCompliance: "opposition" };
  }
  if (lead.source === "rdv" || lead.intent === "rdv") {
    return { ...lead, callbackCompliance: "rdv_context" };
  }
  // Historique sans preuve : ne jamais inventer une autorisation
  if (
    (lead.intent === "rappel" || lead.callbackChecked === true) &&
    !lead.proofId &&
    !lead.proofLevel
  ) {
    return {
      ...lead,
      proofLevel: "legacy_intent_only",
      callbackCompliance: "unjustified",
    };
  }
  return { ...lead, callbackCompliance: deriveCallbackCompliance(lead) };
}

/**
 * Parse / valide les champs PAC optionnels.
 * @returns {{ ok: true, fields: object } | { ok: false, error: string }}
 */
function parsePacQualifyFields(data, { requireForPac = false, project = "" } = {}) {
  const heatingCurrent = String(data.heatingCurrent || "").trim();
  const surfaceBand = String(data.surfaceBand || "").trim();
  const ownership = String(data.ownership || "").trim();
  const projectTimeline = String(data.projectTimeline || "").trim();

  if (heatingCurrent && !HEATING_CURRENT.has(heatingCurrent)) {
    return { ok: false, error: "Chauffage actuel invalide." };
  }
  if (surfaceBand && !SURFACE_BAND.has(surfaceBand)) {
    return { ok: false, error: "Surface invalide." };
  }
  if (ownership && !OWNERSHIP.has(ownership)) {
    return { ok: false, error: "Statut propriétaire/locataire invalide." };
  }
  if (projectTimeline && !PROJECT_TIMELINE.has(projectTimeline)) {
    return { ok: false, error: "Délai du projet invalide." };
  }

  if (requireForPac && project === "pac") {
    if (!heatingCurrent) return { ok: false, error: "Indiquez votre chauffage actuel." };
    if (!surfaceBand) return { ok: false, error: "Indiquez la surface du logement." };
    if (!ownership) return { ok: false, error: "Indiquez si vous êtes propriétaire ou locataire." };
    if (ownership !== "proprietaire" && ownership !== "locataire") {
      return { ok: false, error: "Statut propriétaire/locataire invalide." };
    }
  }

  const fields = {};
  if (heatingCurrent) fields.heatingCurrent = heatingCurrent;
  if (surfaceBand) fields.surfaceBand = surfaceBand;
  if (ownership) fields.ownership = ownership;
  if (projectTimeline) fields.projectTimeline = projectTimeline;
  return { ok: true, fields };
}

/**
 * Champs diagnostic PV (landing + RDV photovoltaïque).
 * Aucune estimation de puissance / prix / économies.
 */
function parsePvQualifyFields(data, { requireForPv = false, project = "" } = {}) {
  const roofType = String(data.roofType || "").trim();
  const batteryChoice = String(data.batteryChoice || "").trim();
  const ownership = String(data.ownership || "").trim();
  const projectTimeline = String(data.projectTimeline || "").trim();
  const billMonthlyEur = String(data.billMonthlyEur || "")
    .trim()
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .slice(0, 8);
  const annualKwh = String(data.annualKwh || "")
    .replace(/\D/g, "")
    .slice(0, 7);
  const consumptionUnknown = Boolean(data.consumptionUnknown);
  const sourceLabel = String(data.sourceLabel || "").trim().slice(0, 80);

  if (roofType && !ROOF_TYPE.has(roofType)) {
    return { ok: false, error: "Type de toiture invalide." };
  }
  if (batteryChoice && !BATTERY_CHOICE.has(batteryChoice)) {
    return { ok: false, error: "Choix batterie invalide." };
  }
  if (ownership && !OWNERSHIP.has(ownership)) {
    return { ok: false, error: "Statut propriétaire invalide." };
  }
  if (projectTimeline && !PROJECT_TIMELINE.has(projectTimeline)) {
    return { ok: false, error: "Délai du projet invalide." };
  }
  if (billMonthlyEur && !/^\d+(\.\d{1,2})?$/.test(billMonthlyEur)) {
    return { ok: false, error: "Facture mensuelle invalide." };
  }
  if (annualKwh && !/^\d+$/.test(annualKwh)) {
    return { ok: false, error: "Consommation annuelle invalide." };
  }

  if (requireForPv && project === "photovoltaique") {
    if (!roofType) return { ok: false, error: "Indiquez le type de toiture." };
    if (!ownership) return { ok: false, error: "Indiquez si vous êtes propriétaire." };
    if (!["proprietaire", "acquisition", "non"].includes(ownership)) {
      return { ok: false, error: "Statut propriétaire invalide." };
    }
    if (!batteryChoice) return { ok: false, error: "Indiquez l’orientation batterie souhaitée." };
  }

  const fields = {};
  if (roofType) fields.roofType = roofType;
  if (batteryChoice) fields.batteryChoice = batteryChoice;
  if (ownership) fields.ownership = ownership;
  if (projectTimeline) fields.projectTimeline = projectTimeline;
  if (consumptionUnknown) fields.consumptionUnknown = true;
  if (billMonthlyEur) fields.billMonthlyEur = billMonthlyEur;
  if (annualKwh) fields.annualKwh = annualKwh;
  if (sourceLabel) fields.sourceLabel = sourceLabel;
  return { ok: true, fields };
}

/**
 * Champs diagnostic climatisation (landing + RDV).
 * Aucune estimation de tarif / puissance / économies.
 */
function parseClimQualifyFields(data, { requireForClim = false, project = "" } = {}) {
  const roomsBand = String(data.roomsBand || "").trim();
  const climSurfaceBand = String(data.climSurfaceBand || "").trim();
  const climExisting = String(data.climExisting || "").trim();
  const climNeed = String(data.climNeed || "").trim();
  let climSystemHint = String(data.climSystemHint || "").trim();
  const projectTimeline = String(data.projectTimeline || "").trim();
  const sourceLabel = String(data.sourceLabel || "").trim().slice(0, 80);

  if (roomsBand && !CLIM_ROOMS_BAND.has(roomsBand)) {
    return { ok: false, error: "Nombre de pièces invalide." };
  }
  if (climSurfaceBand && !CLIM_SURFACE_BAND.has(climSurfaceBand)) {
    return { ok: false, error: "Surface climatisation invalide." };
  }
  if (climExisting && !CLIM_EXISTING.has(climExisting)) {
    return { ok: false, error: "Installation existante invalide." };
  }
  if (climNeed && !CLIM_NEED.has(climNeed)) {
    return { ok: false, error: "Besoin climatisation invalide." };
  }
  if (projectTimeline && !PROJECT_TIMELINE.has(projectTimeline)) {
    return { ok: false, error: "Délai du projet invalide." };
  }

  // Hint déduit côté serveur si pièces connues (ne jamais imposer un système)
  if (!climSystemHint && roomsBand) {
    if (roomsBand === "1") climSystemHint = "monosplit";
    else if (roomsBand === "2_3" || roomsBand === "4_plus") climSystemHint = "multisplit";
  }
  if (climSystemHint && !CLIM_SYSTEM_HINT.has(climSystemHint)) {
    return { ok: false, error: "Orientation système invalide." };
  }

  if (requireForClim && project === "climatisation") {
    if (!roomsBand) return { ok: false, error: "Indiquez le nombre de pièces à climatiser." };
    if (!climNeed) return { ok: false, error: "Indiquez votre besoin." };
  }

  const fields = {};
  if (roomsBand) fields.roomsBand = roomsBand;
  if (climSurfaceBand) fields.climSurfaceBand = climSurfaceBand;
  if (climExisting) fields.climExisting = climExisting;
  if (climNeed) fields.climNeed = climNeed;
  if (climSystemHint) fields.climSystemHint = climSystemHint;
  if (projectTimeline) fields.projectTimeline = projectTimeline;
  if (sourceLabel) fields.sourceLabel = sourceLabel;
  return { ok: true, fields };
}

function json(res, status, body, { cookies = [] } = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (cookies.length === 1) headers["Set-Cookie"] = cookies[0];
  else if (cookies.length > 1) headers["Set-Cookie"] = cookies;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function handleAdminLogin(req, res) {
  try {
    const limited = rateLimit(req, { key: "admin-login", limit: 20, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.writeHead(429, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(limited.retryAfterSec),
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok: false, error: "Trop de tentatives. Réessayez plus tard." }));
      return;
    }
    const hash = getAdminPasswordHash();
    if (!hash) {
      json(res, 503, { ok: false, error: "Authentification admin non configurée sur le serveur." });
      return;
    }
    if (!String(process.env.SESSION_SECRET || "").trim()) {
      json(res, 503, { ok: false, error: "SESSION_SECRET non configuré sur le serveur." });
      return;
    }
    const raw = await readBody(req);
    const data = JSON.parse(raw || "{}");
    const password = String(data.password || "");
    if (!password || !verifyPassword(password, hash)) {
      await new Promise((r) => setTimeout(r, 250));
      json(res, 401, { ok: false, error: "Identifiants incorrects." });
      return;
    }
    const token = createSession();
    json(res, 200, { ok: true, role: "admin" }, { cookies: [buildSessionCookie(token, req)] });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleAdminLogout(req, res) {
  const session = getSessionFromRequest(req);
  if (session?.token) destroySession(session.token);
  json(res, 200, { ok: true }, { cookies: [buildSessionCookie("", req, { clear: true })] });
}

async function handleAdminSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { ok: false, authenticated: false });
    return;
  }
  json(res, 200, { ok: true, authenticated: true, role: session.role });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeFrenchPhone(value) {
  let digits = String(value || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0033")) digits = digits.slice(4);
  else if (digits.startsWith("33") && digits.length >= 11) digits = digits.slice(2);
  if (digits.length === 9 && /^[1-9]/.test(digits)) digits = `0${digits}`;
  return /^0[1-9]\d{8}$/.test(digits) ? digits : "";
}

/** Prénom + nom requis ; conserve aussi `name` combiné pour l’admin / historiques. */
function parsePersonName(data) {
  let firstName = String(data.firstName || data.prenom || "").trim();
  let lastName = String(data.lastName || data.nom || "").trim();
  if ((firstName.length < 2 || lastName.length < 2) && data.name) {
    const raw = String(data.name || "").trim();
    if (raw) {
      const parts = raw.split(/\s+/).filter(Boolean);
      if (firstName.length < 2) firstName = parts[0] || "";
      if (lastName.length < 2) lastName = parts.slice(1).join(" ") || "";
    }
  }
  if (firstName.length < 2) {
    return { ok: false, error: "Indiquez votre prénom." };
  }
  if (lastName.length < 2) {
    return { ok: false, error: "Indiquez votre nom." };
  }
  return {
    ok: true,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
  };
}

async function readJsonArray(filePath) {
  return readStoredJsonArray(filePath);
}

async function handleSaveCovers(req, res) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      json(res, 400, { ok: false, error: "Payload invalide" });
      return;
    }
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof key === "string" && typeof value === "number" && Number.isFinite(value)) {
        clean[key] = Math.max(0, Math.floor(value));
      }
    }
    await fs.writeFile(COVERS_PATH, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
    json(res, 200, { ok: true, covers: clean });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function readCategoryCovers() {
  try {
    const raw = await fs.readFile(CATEGORY_COVERS_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

async function handleUploadCategoryCover(req, res) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const category = String(data.category || "").trim();
    const file = data.file;
    if (!category) {
      json(res, 400, { ok: false, error: "Métier manquant." });
      return;
    }
    if (!file?.data || typeof file.data !== "string") {
      json(res, 400, { ok: false, error: "Photo manquante." });
      return;
    }
    const match = String(file.data).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if (!match) {
      json(res, 400, { ok: false, error: "Format image invalide (jpg, png, webp)." });
      return;
    }
    const safeCat = category.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    await fs.mkdir(CATEGORY_COVER_DIR, { recursive: true });
    const filename = `${safeCat}-${Date.now()}.jpg`;
    const abs = path.join(CATEGORY_COVER_DIR, filename);
    const marked = await watermarkPhoto(Buffer.from(match[2], "base64"));
    await fs.writeFile(abs, marked);
    const src = `assets/realisations/metiers/${filename}`;
    const covers = await readCategoryCovers();
    covers[category] = src;
    await fs.writeFile(CATEGORY_COVERS_PATH, `${JSON.stringify(covers, null, 2)}\n`, "utf8");
    json(res, 200, { ok: true, covers, src });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleCreateLead(req, res) {
  try {
    const limited = rateLimit(req, { key: "leads", limit: 12, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.writeHead(429, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(limited.retryAfterSec),
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok: false, error: "Trop de demandes. Réessayez dans quelques minutes." }));
      return;
    }
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const person = parsePersonName(data);
    const phone = normalizeFrenchPhone(data.phone);
    const email = String(data.email || "").trim();
    const message = String(data.message || "").trim().slice(0, 2000);
    const postalCode = String(data.postalCode || "").replace(/\D/g, "").slice(0, 5);
    const housing = String(data.housing || "");
    const intent = String(data.intent || "devis");
    const projects = Array.isArray(data.projects)
      ? data.projects.map((p) => String(p)).filter(Boolean).slice(0, 12)
      : [];

    if (!person.ok) {
      json(res, 400, { ok: false, error: person.error });
      return;
    }
    if (!phone) {
      json(res, 400, { ok: false, error: "Indiquez un numéro de téléphone français valide." });
      return;
    }
    if (!/^\d{5}$/.test(postalCode)) {
      json(res, 400, { ok: false, error: "Indiquez un code postal à 5 chiffres." });
      return;
    }
    if (!HOUSING.has(housing)) {
      json(res, 400, { ok: false, error: "Précisez le type de logement." });
      return;
    }
    if (!INTENTS.has(intent)) {
      json(res, 400, { ok: false, error: "Type de demande invalide." });
      return;
    }
    if (projects.length === 0) {
      json(res, 400, { ok: false, error: "Sélectionnez au moins un corps de métier." });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(res, 400, { ok: false, error: "E-mail invalide." });
      return;
    }

    // Champs PAC / PV / clim : optionnels côté API. Si présents → whitelist stricte.
    const pacParse = parsePacQualifyFields(data);
    if (!pacParse.ok) {
      json(res, 400, { ok: false, error: pacParse.error });
      return;
    }
    const pvParse = parsePvQualifyFields(data);
    if (!pvParse.ok) {
      json(res, 400, { ok: false, error: pvParse.error });
      return;
    }
    const climParse = parseClimQualifyFields(data);
    if (!climParse.ok) {
      json(res, 400, { ok: false, error: climParse.error });
      return;
    }

    const callbackChecked = Boolean(data.callbackChecked);
    const pagePath = String(data.pagePath || "").trim().slice(0, 200);
    const uiActionLabel = String(data.uiActionLabel || "").trim().slice(0, 160);
    const attribution = parseAttribution(data.attribution || data, {
      headerReferer: req.headers.referer || "",
      pagePath,
      ownHost: req.headers.host || "",
    });
    const attributionFirst = parseFirstAttribution(data.attributionFirst, {
      ownHost: req.headers.host || "",
    });
    const complianceOn = isComplianceEnabled();

    if (complianceOn) {
      if (intent === "rappel" && !callbackChecked) {
        json(res, 400, {
          ok: false,
          error: "Cochez la case pour demander expressément un rappel téléphonique.",
        });
        return;
      }
      if ((intent === "rappel" || callbackChecked) && projects.length !== 1) {
        json(res, 400, {
          ok: false,
          error: "Pour un rappel, sélectionnez un seul projet identifiable.",
        });
        return;
      }
    }

    const leadId = randomUUID();
    const createdAt = new Date().toISOString();
    let proof = null;
    if (complianceOn) {
      const action = intent === "rappel" ? "request_callback" : "request_study";
      proof = await appendComplianceProof(ROOT, {
        leadId,
        channel: "formulaire",
        action,
        intent,
        projects,
        firstName: person.firstName,
        lastName: person.lastName,
        phone,
        email,
        postalCode,
        callbackChecked: intent === "rappel" ? true : callbackChecked,
        uiActionLabel,
        pagePath,
        ip: clientIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
      });
    }

    const lead = {
      id: leadId,
      createdAt,
      status: "nouveau",
      source: "formulaire",
      intent,
      projects,
      postalCode,
      housing,
      firstName: person.firstName,
      lastName: person.lastName,
      name: person.name,
      phone,
      email,
      message,
      ...pacParse.fields,
      ...pvParse.fields,
      ...climParse.fields,
      attribution,
      attributionFirst,
      ...(complianceOn
        ? {
            callbackChecked: intent === "rappel" ? true : callbackChecked,
            proofId: proof?.proofId || null,
            formCopyVersion: FORM_COPY_VERSION,
            callbackDeadline: proof?.callbackDeadline || null,
            callbackDeadlineLocal: proof?.callbackDeadlineLocal || null,
            callbackCompliance: deriveCallbackCompliance({
              intent,
              callbackChecked: intent === "rappel" ? true : callbackChecked,
              proofId: proof?.proofId,
              callbackDeadline: proof?.callbackDeadline,
            }),
          }
        : {}),
    };

    await appendLeadRecord(DATA_DIR, LEADS_PATH, OUTBOX_PATH, lead);

    console.log(`[lead] ${lead.intent} — ok`);
    // Transmission lancée sans attendre : la réponse au visiteur ne dépend
    // jamais de la disponibilité du CRM.
    runCrmOutbox().catch(() => {});
    json(res, 201, {
      ok: true,
      id: lead.id,
      ...(proof
        ? {
            proofId: proof.proofId,
            callbackDeadline: proof.callbackDeadline,
            callbackDeadlineLocal: proof.callbackDeadlineLocal,
          }
        : {}),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleListLeads(_req, res) {
  try {
    const leads = await readJsonArray(LEADS_PATH);
    const enriched = isComplianceEnabled() ? leads.map(enrichLeadCompliance) : leads;
    json(res, 200, { ok: true, leads: enriched, complianceEnabled: isComplianceEnabled() });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handlePatchLead(req, res, id) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    if (data.status != null && !["nouveau", "contacte", "traite"].includes(String(data.status || ""))) {
      json(res, 400, { ok: false, error: "Statut invalide" });
      return;
    }

    let missing = false;
    let saved = null;
    await updateJsonRecords(DATA_DIR, LEADS_PATH, async (leads) => {
      const idx = leads.findIndex((l) => l.id === id);
      if (idx < 0) {
        missing = true;
        return leads;
      }
      const patch = { updatedAt: new Date().toISOString() };
      if (data.status != null) patch.status = String(data.status);
      if (isComplianceEnabled() && data.opposition === true) {
        patch.opposition = true;
        patch.callbackCompliance = "opposition";
        patch.oppositionAt = new Date().toISOString();
        if (leads[idx].proofId) {
          await appendOppositionToProof(ROOT, leads[idx].proofId, String(data.oppositionNote || ""));
        }
      }
      leads[idx] = { ...leads[idx], ...patch };
      saved = leads[idx];
      return leads;
    });
    if (missing || !saved) {
      json(res, 404, { ok: false, error: "Lead introuvable" });
      return;
    }
    json(res, 200, { ok: true, lead: enrichLeadCompliance(saved) });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleListCrmOutbox(_req, res) {
  try {
    const jobs = await listCrmJobs(OUTBOX_PATH);
    const leads = await readJsonArray(LEADS_PATH);
    const appointments = await readJsonArray(APPTS_PATH);
    const leadById = new Map(leads.map((row) => [row.id, row]));
    const appointmentById = new Map(appointments.map((row) => [row.id, row]));
    json(res, 200, {
      ok: true,
      syncEnabled: syncActive(),
      syncConfigured: crmSyncConfigured(),
      jobs: jobs.map((job) => {
        const person = job.kind === "appointment" ? appointmentById.get(job.sourceId) : leadById.get(job.sourceId);
        return {
          ...job,
          label: person?.name || "",
          intent: job.kind === "appointment" ? "rdv" : person?.intent || "",
        };
      }),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

/**
 * La liaison CRM demande deux conditions : le drapeau d’activation et une
 * configuration complète. Un drapeau activé sans secret ne doit rien tenter.
 */
function syncActive() {
  return crmSyncEnabled() && crmSyncConfigured();
}

/** Retrouve la demande d’origine, seule source du contenu transmis. */
async function crmJobRecord(job) {
  const rows = await readJsonArray(job.kind === "appointment" ? APPTS_PATH : LEADS_PATH);
  return rows.find((row) => row.id === job.sourceId) || null;
}

let crmSyncRunning = false;

/**
 * Passage de la file. Jamais deux passages en parallèle : deux envois
 * simultanés de la même tâche produiraient deux tentatives inutiles.
 */
async function runCrmOutbox() {
  if (crmSyncRunning || !syncActive()) return { ran: false, sent: 0, failed: 0 };
  crmSyncRunning = true;
  try {
    // À l'intérieur du try : une erreur ici laisserait sinon le verrou fermé
    // et éteindrait la synchronisation jusqu'au redémarrage.
    const { endpoint, keyId, secret } = crmSyncConfig();
    const result = await processCrmOutbox(DATA_DIR, OUTBOX_PATH, {
      enabled: true,
      async send(job) {
        const record = await crmJobRecord(job);
        return sendCrmJob(job, { record, endpoint, keyId, secret });
      },
    });
    if (result.sent || result.failed) {
      console.log(`[crm-sync] transmis ${result.sent} — échecs ${result.failed}`);
    }
    return result;
  } catch (err) {
    // Le message peut citer une adresse technique, jamais le secret.
    console.error(`[crm-sync] passage interrompu : ${String(err.message || err)}`);
    return { ran: false, sent: 0, failed: 0 };
  } finally {
    crmSyncRunning = false;
  }
}

async function handleRequeueCrmJob(_req, res, jobId) {
  try {
    const job = await requeueCrmJob(DATA_DIR, OUTBOX_PATH, jobId);
    if (!job) {
      json(res, 404, { ok: false, error: "Tâche introuvable." });
      return;
    }
    runCrmOutbox().catch(() => {});
    json(res, 200, { ok: true, job });
  } catch (err) {
    json(res, 409, { ok: false, error: String(err.message || err) });
  }
}

async function handleAgenda(_req, res) {
  try {
    // Créneaux toujours proposés (plusieurs commerciaux peuvent partager un horaire)
    const days = buildAgenda([], AGENDA_BUSINESS_DAYS);
    json(res, 200, { ok: true, days, hours: SLOT_HOURS, businessDays: AGENDA_BUSINESS_DAYS });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleListAppointments(_req, res) {
  try {
    const appointments = await readJsonArray(APPTS_PATH);
    json(res, 200, { ok: true, appointments });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleCreateAppointment(req, res) {
  try {
    const limited = rateLimit(req, { key: "appointments", limit: 12, windowMs: 15 * 60 * 1000 });
    if (!limited.ok) {
      res.writeHead(429, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(limited.retryAfterSec),
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ ok: false, error: "Trop de demandes. Réessayez dans quelques minutes." }));
      return;
    }
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const person = parsePersonName(data);
    const phone = normalizeFrenchPhone(data.phone);
    const email = String(data.email || "").trim();
    const project = String(data.project || "").trim();
    const date = String(data.date || "");
    const time = String(data.time || "");
    const note = String(data.note || "").trim().slice(0, 1000);
    let meetingType = String(data.meetingType || "telephone").trim();
    if (!["telephone", "physique"].includes(meetingType)) meetingType = "telephone";
    const pagePath = String(data.pagePath || "/rdv.html").trim().slice(0, 200);
    const attribution = parseAttribution(data.attribution || data, {
      headerReferer: req.headers.referer || "",
      pagePath,
      ownHost: req.headers.host || "",
    });
    const attributionFirst = parseFirstAttribution(data.attributionFirst, {
      ownHost: req.headers.host || "",
    });
    const complianceOn = isComplianceEnabled();

    if (!person.ok) {
      json(res, 400, { ok: false, error: person.error });
      return;
    }
    if (!phone) {
      json(res, 400, { ok: false, error: "Indiquez un numéro de téléphone français valide." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !SLOT_HOURS.includes(time)) {
      json(res, 400, { ok: false, error: "Créneau invalide." });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(res, 400, { ok: false, error: "E-mail invalide." });
      return;
    }
    if (complianceOn && !project) {
      json(res, 400, { ok: false, error: "Sélectionnez le projet concerné par le rendez-vous." });
      return;
    }

    const pacParse = parsePacQualifyFields(data, { requireForPac: true, project });
    if (!pacParse.ok) {
      json(res, 400, { ok: false, error: pacParse.error });
      return;
    }
    const pvParse = parsePvQualifyFields(data, { requireForPv: true, project });
    if (!pvParse.ok) {
      json(res, 400, { ok: false, error: pvParse.error });
      return;
    }
    const climParse = parseClimQualifyFields(data, { requireForClim: true, project });
    if (!climParse.ok) {
      json(res, 400, { ok: false, error: climParse.error });
      return;
    }
    // PAC / PV / clim : fusionner sans écraser les champs déjà posés
    const qualifyFields = { ...pacParse.fields, ...pvParse.fields, ...climParse.fields };

    // Même créneau autorisé plusieurs fois (équipe commerciale)
    const agenda = buildAgenda([], AGENDA_BUSINESS_DAYS);
    const day = agenda.find((d) => d.date === date);
    const slot = day?.slots.find((s) => s.time === time);
    if (!day || !slot) {
      json(res, 400, { ok: false, error: "Ce créneau n’est pas proposé." });
      return;
    }

    const appointmentId = randomUUID();
    const leadMirrorId = randomUUID();
    const createdAt = new Date().toISOString();
    let proof = null;
    if (complianceOn) {
      proof = await appendComplianceProof(ROOT, {
        leadId: leadMirrorId,
        appointmentId,
        channel: "rdv",
        action: "book_appointment",
        intent: "rdv",
        projects: project ? [project] : [],
        firstName: person.firstName,
        lastName: person.lastName,
        phone,
        email,
        postalCode: "",
        callbackChecked: false,
        meetingType,
        uiActionLabel: "Confirmer mon rendez-vous",
        pagePath,
        ip: clientIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
      });
    }

    const appointment = {
      id: appointmentId,
      createdAt,
      status: "confirme",
      date,
      time,
      meetingType,
      firstName: person.firstName,
      lastName: person.lastName,
      name: person.name,
      phone,
      email,
      project,
      note,
      ...qualifyFields,
      attribution,
      attributionFirst,
      ...(proof
        ? { proofId: proof.proofId, formCopyVersion: FORM_COPY_VERSION }
        : {}),
    };

    const mirror = {
      id: leadMirrorId,
      createdAt,
      status: "nouveau",
      source: "rdv",
      intent: "rdv",
      projects: project ? [project] : [],
      postalCode: "",
      housing: "",
      firstName: person.firstName,
      lastName: person.lastName,
      name: person.name,
      phone,
      email,
      message: `RDV ${date} à ${time} (${meetingType})${note ? ` — ${note}` : ""}`,
      appointmentId: appointment.id,
      appointmentDate: date,
      appointmentTime: time,
      meetingType,
      ...qualifyFields,
      attribution,
      attributionFirst,
      ...(proof
        ? {
            proofId: proof.proofId,
            formCopyVersion: FORM_COPY_VERSION,
            callbackCompliance: "rdv_context",
            callbackChecked: false,
          }
        : {}),
    };
    await appendAppointmentRecord(
      DATA_DIR,
      { appointmentsPath: APPTS_PATH, leadsPath: LEADS_PATH, outboxPath: OUTBOX_PATH },
      appointment,
      mirror
    );

    console.log(`[rdv] ${date} ${time} — ok`);
    runCrmOutbox().catch(() => {});
    json(res, 201, {
      ok: true,
      id: appointment.id,
      date: appointment.date,
      time: appointment.time,
      meetingType,
      ...(proof ? { proofId: proof.proofId } : {}),
    });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handlePatchAppointment(req, res, id) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const status = String(data.status || "");
    if (!["confirme", "termine", "annule"].includes(status)) {
      json(res, 400, { ok: false, error: "Statut invalide" });
      return;
    }
    let missing = false;
    let saved = null;
    await updateJsonRecords(DATA_DIR, APPTS_PATH, (appointments) => {
      const idx = appointments.findIndex((a) => a.id === id);
      if (idx < 0) {
        missing = true;
        return appointments;
      }
      appointments[idx] = {
        ...appointments[idx],
        status,
        updatedAt: new Date().toISOString(),
      };
      saved = appointments[idx];
      return appointments;
    });
    if (missing || !saved) {
      json(res, 404, { ok: false, error: "RDV introuvable" });
      return;
    }
    json(res, 200, { ok: true, appointment: saved });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function readExtra() {
  try {
    const raw = await fs.readFile(EXTRA_PATH, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeExtra(rows) {
  await fs.mkdir(path.dirname(EXTRA_PATH), { recursive: true });
  await fs.writeFile(EXTRA_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

/** Chemin disque d’une photo chantier gérée (hors pastilles métiers). */
function realisationAssetAbs(src) {
  const rel = String(src || "")
    .split("?")[0]
    .replace(/^\/+/, "");
  if (!rel.startsWith("assets/realisations/")) return null;
  if (rel.startsWith("assets/realisations/metiers/")) return null;
  if (rel.includes("..") || path.isAbsolute(rel)) return null;
  return path.join(ROOT, rel);
}

async function unlinkRealisationAsset(src) {
  const abs = realisationAssetAbs(src);
  if (!abs) return;
  // Ne supprimer que les fichiers uploadés (jpg/png/webp), pas les démos SVG du dépôt.
  const ext = path.extname(abs).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return;
  await fs.unlink(abs).catch(() => {});
}

async function writeChantierOverride(chantier) {
  const extra = await readExtra();
  const next = extra.filter((r) => r?.id !== chantier.id);
  next.push({
    id: chantier.id,
    village: chantier.village,
    category: chantier.category,
    title: chantier.title,
    coverIndex: typeof chantier.coverIndex === "number" ? chantier.coverIndex : 0,
    photos: [...(chantier.photos || [])],
  });
  await writeExtra(next);
}

async function markChantierDeleted(id) {
  const extra = await readExtra();
  const next = extra.filter((r) => r?.id !== id);
  next.push({ id, deleted: true });
  await writeExtra(next);
}

async function readCoversMap() {
  try {
    const raw = await fs.readFile(COVERS_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function writeCoversMap(covers) {
  await fs.writeFile(COVERS_PATH, `${JSON.stringify(covers, null, 2)}\n`, "utf8");
}

async function decodeUploadImages(files, { id, startIndex = 0, limit = 12 } = {}) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const saved = [];
  for (const file of (Array.isArray(files) ? files : []).slice(0, limit)) {
    const name = String(file.name || "photo.jpg");
    const ext = path.extname(name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext) && !String(file.data || "").startsWith("data:image/")) {
      continue;
    }
    const b64 = String(file.data || "");
    const payload = b64.includes(",") ? b64.split(",").pop() : b64;
    if (!payload) continue;
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 100 || buf.length > 8 * 1024 * 1024) continue;
    const filename = `${id}-${String(startIndex + saved.length + 1).padStart(2, "0")}-${Date.now().toString(36)}.jpg`;
    const marked = await watermarkPhoto(buf);
    await fs.writeFile(path.join(UPLOAD_DIR, filename), marked);
    saved.push(`assets/realisations/${filename}`);
  }
  return saved;
}

/**
 * Catalogue public = base + overrides admin.
 * Un enregistrement extra avec `photos` remplace entièrement le chantier.
 * `{ id, deleted: true }` masque un chantier (y compris ceux du catalogue de base).
 */
async function mergedRealisations() {
  const extra = await readExtra();
  const byId = new Map(BASE_REALISATIONS.map((r) => [r.id, { ...r, photos: [...r.photos] }]));
  for (const item of extra) {
    if (!item?.id) continue;
    if (item.deleted) {
      byId.delete(item.id);
      continue;
    }
    if (!Array.isArray(item.photos)) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, {
      id: item.id,
      village: String(item.village || prev?.village || "").trim(),
      category: String(item.category || prev?.category || "").trim(),
      title: String(item.title || prev?.title || "").trim(),
      coverIndex: typeof item.coverIndex === "number" ? item.coverIndex : prev?.coverIndex || 0,
      photos: [...item.photos],
    });
  }
  return [...byId.values()];
}

async function handleListRealisations(_req, res) {
  try {
    const realisations = await mergedRealisations();
    json(res, 200, { ok: true, realisations, categories: CATEGORIES });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleUploadPhotos(req, res) {
  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw);
    const village = String(data.village || "").trim();
    const category = String(data.category || "").trim();
    const title =
      String(data.title || "").trim() ||
      CATEGORIES.find((c) => c.id === category)?.title ||
      "Réalisation";
    const files = Array.isArray(data.files) ? data.files.slice(0, 12) : [];

    if (village.length < 2) {
      json(res, 400, { ok: false, error: "Indiquez le village." });
      return;
    }
    if (!CATEGORIES.some((c) => c.id === category)) {
      json(res, 400, { ok: false, error: "Métier invalide." });
      return;
    }
    if (!files.length) {
      json(res, 400, { ok: false, error: "Ajoutez au moins une photo." });
      return;
    }

    const all = await mergedRealisations();
    const existingId = String(data.chantierId || "").trim();
    let existing =
      (existingId && all.find((r) => r.id === existingId)) ||
      all.find(
        (r) =>
          slugify(r.village) === slugify(village) &&
          r.category === category
      ) ||
      null;

    const id =
      existing?.id ||
      `${slugify(village)}-${slugify(category)}-${Date.now().toString(36)}`;

    const saved = await decodeUploadImages(files, {
      id,
      startIndex: existing?.photos?.length || 0,
    });
    if (!saved.length) {
      json(res, 400, { ok: false, error: "Aucune photo valide (jpg, png, webp)." });
      return;
    }

    const photos = [...(existing?.photos || []), ...saved];
    await writeChantierOverride({
      id,
      village: existing?.village || village,
      category: existing?.category || category,
      title: String(data.title || "").trim() || existing?.title || title,
      coverIndex: existing?.coverIndex || 0,
      photos,
    });

    const covers = await readCoversMap();
    if (typeof covers[id] !== "number") covers[id] = 0;
    await writeCoversMap(covers);

    const realisations = await mergedRealisations();
    json(res, 201, { ok: true, id, realisations });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleDeleteChantier(req, res, id) {
  try {
    const chantierId = String(id || "").trim();
    if (!chantierId) {
      json(res, 400, { ok: false, error: "Chantier manquant." });
      return;
    }
    const all = await mergedRealisations();
    const chantier = all.find((r) => r.id === chantierId);
    if (!chantier) {
      json(res, 404, { ok: false, error: "Chantier introuvable." });
      return;
    }
    for (const src of chantier.photos || []) {
      await unlinkRealisationAsset(src);
    }
    await markChantierDeleted(chantierId);
    const covers = await readCoversMap();
    if (Object.prototype.hasOwnProperty.call(covers, chantierId)) {
      delete covers[chantierId];
      await writeCoversMap(covers);
    }
    const realisations = await mergedRealisations();
    json(res, 200, { ok: true, realisations });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleDeleteChantierPhoto(req, res, id) {
  try {
    const chantierId = String(id || "").trim();
    const raw = await readBody(req);
    const data = JSON.parse(raw || "{}");
    const index = Number(data.index);
    const all = await mergedRealisations();
    const chantier = all.find((r) => r.id === chantierId);
    if (!chantier) {
      json(res, 404, { ok: false, error: "Chantier introuvable." });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= chantier.photos.length) {
      json(res, 400, { ok: false, error: "Index photo invalide." });
      return;
    }
    const removed = chantier.photos[index];
    const photos = chantier.photos.filter((_, i) => i !== index);
    await unlinkRealisationAsset(removed);

    if (!photos.length) {
      await markChantierDeleted(chantierId);
      const covers = await readCoversMap();
      delete covers[chantierId];
      await writeCoversMap(covers);
      const realisations = await mergedRealisations();
      json(res, 200, { ok: true, deletedChantier: true, realisations });
      return;
    }

    const covers = await readCoversMap();
    let coverIndex = typeof covers[chantierId] === "number" ? covers[chantierId] : chantier.coverIndex || 0;
    if (coverIndex === index) coverIndex = 0;
    else if (coverIndex > index) coverIndex -= 1;
    coverIndex = Math.min(Math.max(0, coverIndex), photos.length - 1);
    covers[chantierId] = coverIndex;
    await writeCoversMap(covers);

    await writeChantierOverride({
      ...chantier,
      photos,
      coverIndex,
    });

    const realisations = await mergedRealisations();
    json(res, 200, { ok: true, realisations, covers });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function handleReplaceChantierPhoto(req, res, id) {
  try {
    const chantierId = String(id || "").trim();
    const raw = await readBody(req);
    const data = JSON.parse(raw || "{}");
    const index = Number(data.index);
    const file = data.file;
    const all = await mergedRealisations();
    const chantier = all.find((r) => r.id === chantierId);
    if (!chantier) {
      json(res, 404, { ok: false, error: "Chantier introuvable." });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= chantier.photos.length) {
      json(res, 400, { ok: false, error: "Index photo invalide." });
      return;
    }
    if (!file) {
      json(res, 400, { ok: false, error: "Fichier manquant." });
      return;
    }
    const saved = await decodeUploadImages([file], {
      id: chantierId,
      startIndex: index,
      limit: 1,
    });
    if (!saved.length) {
      json(res, 400, { ok: false, error: "Photo invalide (jpg, png, webp)." });
      return;
    }
    const previous = chantier.photos[index];
    const photos = [...chantier.photos];
    photos[index] = saved[0];
    await unlinkRealisationAsset(previous);
    await writeChantierOverride({
      ...chantier,
      photos,
    });
    const realisations = await mergedRealisations();
    json(res, 200, { ok: true, realisations, src: saved[0] });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

function normalizeReviewText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\u2026/g, "…")
    .trim();
}

function pickFiveStarReviews(reviews, limit = 8) {
  const five = (Array.isArray(reviews) ? reviews : [])
    .map((r) => ({
      author: String(r.author || r.author_name || "").trim(),
      rating: Number(r.rating) || 0,
      relativeTime: String(r.relativeTime || r.relative_time_description || "").trim(),
      text: normalizeReviewText(r.text),
      photoUrl: String(r.photoUrl || r.profile_photo_url || "").trim(),
    }))
    .filter((r) => r.rating === 5 && r.author && r.text);
  return five.slice(0, limit);
}

async function readGoogleReviewsCache() {
  try {
    const raw = await fs.readFile(GOOGLE_REVIEWS_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

async function writeGoogleReviewsCache(payload) {
  await fs.mkdir(path.dirname(GOOGLE_REVIEWS_PATH), { recursive: true });
  await fs.writeFile(GOOGLE_REVIEWS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Résout un place_id ChIJ… via Find Place si GOOGLE_PLACE_ID n’est pas fourni.
 */
async function resolveGooglePlaceId(apiKey) {
  if (GOOGLE_PLACE_ID) return GOOGLE_PLACE_ID;
  const q = encodeURIComponent("MKL Energies Souffelweyersheim");
  const url =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${q}&inputtype=textquery&fields=place_id,name,rating&language=fr&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  return candidate?.place_id ? String(candidate.place_id) : "";
}

async function fetchGoogleReviewsLive() {
  if (!GOOGLE_PLACES_API_KEY) return null;
  const placeId = await resolveGooglePlaceId(GOOGLE_PLACES_API_KEY);
  if (!placeId) return null;

  const fields = [
    "name",
    "rating",
    "user_ratings_total",
    "url",
    "reviews",
  ].join(",");
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${fields}&reviews_sort=newest&language=fr&key=${GOOGLE_PLACES_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== "OK" || !data.result) return null;

  const result = data.result;
  const rating = Number(result.rating);
  if (!Number.isFinite(rating)) return null;

  const payload = {
    rating,
    userRatingCount: Number(result.user_ratings_total) || 0,
    mapsUrl: result.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    mapsCidUrl: "https://www.google.com/maps?cid=18245775962692442094",
    placeName: result.name || "MKL Énergies",
    placeId,
    fetchedAt: new Date().toISOString(),
    source: "places-api",
    reviews: pickFiveStarReviews(
      (result.reviews || []).map((r) => ({
        author: r.author_name,
        rating: r.rating,
        relativeTime: r.relative_time_description,
        text: r.text,
        photoUrl: r.profile_photo_url || "",
      })),
      8
    ),
  };

  // Si Places ne renvoie aucun 5★ (sélection limitée), garder le cache texte
  const cache = await readGoogleReviewsCache();
  if (!payload.reviews.length && cache?.reviews?.length) {
    payload.reviews = pickFiveStarReviews(cache.reviews, 8);
  } else if (payload.reviews.length < 6 && cache?.reviews?.length) {
    const ids = new Set(payload.reviews.map((r) => r.author + r.text.slice(0, 40)));
    for (const r of pickFiveStarReviews(cache.reviews, 12)) {
      const key = r.author + r.text.slice(0, 40);
      if (ids.has(key)) continue;
      payload.reviews.push(r);
      ids.add(key);
      if (payload.reviews.length >= 8) break;
    }
  }

  await writeGoogleReviewsCache(payload);
  return payload;
}

async function getGoogleReviewsPayload() {
  const now = Date.now();
  if (googleReviewsMemory && now - googleReviewsFetchedAt < GOOGLE_REVIEWS_TTL_MS) {
    return { ...googleReviewsMemory, live: googleReviewsMemory.source === "places-api" };
  }

  let payload = null;
  try {
    payload = await fetchGoogleReviewsLive();
  } catch {
    payload = null;
  }

  if (!payload) {
    payload = await readGoogleReviewsCache();
  }

  if (!payload || typeof payload.rating !== "number") {
    return null;
  }

  const response = {
    ok: true,
    rating: payload.rating,
    userRatingCount: Number(payload.userRatingCount) || 0,
    mapsUrl: payload.mapsUrl || payload.mapsCidUrl || "https://www.google.com/maps?cid=18245775962692442094",
    placeName: payload.placeName || "MKL Énergies",
    fetchedAt: payload.fetchedAt || null,
    source: payload.source || "cache",
    reviews: pickFiveStarReviews(payload.reviews, 8),
  };

  googleReviewsMemory = response;
  googleReviewsFetchedAt = now;
  return response;
}

async function handleGoogleReviews(_req, res) {
  try {
    const payload = await getGoogleReviewsPayload();
    if (!payload) {
      json(res, 503, { ok: false, error: "Avis Google indisponibles." });
      return;
    }
    json(res, 200, payload);
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) });
  }
}

async function serveStatic(req, res) {
  await servePublicFile(req, res, ROOT);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // —— Auth admin (public : login ; session/logout lisent le cookie) ——
  if (req.method === "POST" && pathname === "/api/admin/login") {
    await handleAdminLogin(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/admin/logout") {
    await handleAdminLogout(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/admin/session") {
    await handleAdminSession(req, res);
    return;
  }

  // —— Écritures / lectures admin (CRM) — 401 si non authentifié ——
  if (req.method === "POST" && pathname === "/api/covers") {
    if (!requireAdmin(req, res)) return;
    await handleSaveCovers(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/category-covers") {
    if (!requireAdmin(req, res)) return;
    await handleUploadCategoryCover(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/leads") {
    if (!requireAdmin(req, res)) return;
    await handleListLeads(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/crm-outbox") {
    if (!requireAdmin(req, res)) return;
    await handleListCrmOutbox(req, res);
    return;
  }
  if (req.method === "POST" && pathname.startsWith("/api/crm-outbox/") && pathname.endsWith("/retry")) {
    const id = decodeURIComponent(
      pathname.slice("/api/crm-outbox/".length, pathname.length - "/retry".length)
    );
    if (id && !id.includes("/")) {
      if (!requireAdmin(req, res)) return;
      await handleRequeueCrmJob(req, res, id);
      return;
    }
  }
  if (req.method === "PATCH" && pathname.startsWith("/api/leads/")) {
    const id = pathname.slice("/api/leads/".length);
    if (id) {
      if (!requireAdmin(req, res)) return;
      await handlePatchLead(req, res, id);
      return;
    }
  }
  if (req.method === "GET" && pathname === "/api/appointments") {
    if (!requireAdmin(req, res)) return;
    await handleListAppointments(req, res);
    return;
  }
  if (req.method === "PATCH" && pathname.startsWith("/api/appointments/")) {
    const id = pathname.slice("/api/appointments/".length);
    if (id) {
      if (!requireAdmin(req, res)) return;
      await handlePatchAppointment(req, res, id);
      return;
    }
  }
  if (req.method === "POST" && pathname === "/api/realisations") {
    if (!requireAdmin(req, res)) return;
    await handleUploadPhotos(req, res);
    return;
  }
  if (
    req.method === "POST" &&
    pathname.startsWith("/api/realisations/") &&
    pathname.endsWith("/photos/delete")
  ) {
    const id = decodeURIComponent(
      pathname.slice("/api/realisations/".length, pathname.length - "/photos/delete".length)
    );
    if (id) {
      if (!requireAdmin(req, res)) return;
      await handleDeleteChantierPhoto(req, res, id);
      return;
    }
  }
  if (
    req.method === "POST" &&
    pathname.startsWith("/api/realisations/") &&
    pathname.endsWith("/photos/replace")
  ) {
    const id = decodeURIComponent(
      pathname.slice("/api/realisations/".length, pathname.length - "/photos/replace".length)
    );
    if (id) {
      if (!requireAdmin(req, res)) return;
      await handleReplaceChantierPhoto(req, res, id);
      return;
    }
  }
  if (req.method === "POST" && pathname.startsWith("/api/realisations/") && pathname.endsWith("/delete")) {
    const id = decodeURIComponent(
      pathname.slice("/api/realisations/".length, pathname.length - "/delete".length)
    );
    if (id && !id.includes("/")) {
      if (!requireAdmin(req, res)) return;
      await handleDeleteChantier(req, res, id);
      return;
    }
  }
  if (req.method === "GET" && pathname === "/api/admin/clim-gallery") {
    if (!requireAdmin(req, res)) return;
    await handleGetClimGalleryAdmin(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/admin/clim-gallery") {
    if (!requireAdmin(req, res)) return;
    await handleSaveClimGallery(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/admin/clim-gallery/upload") {
    if (!requireAdmin(req, res)) return;
    await handleUploadClimGallery(req, res);
    return;
  }
  if (req.method === "POST" && pathname.startsWith("/api/admin/clim-gallery/delete/")) {
    const id = pathname.slice("/api/admin/clim-gallery/delete/".length);
    if (id) {
      if (!requireAdmin(req, res)) return;
      await handleDeleteClimGalleryItem(req, res, id);
      return;
    }
  }

  // —— Public config (feature flags non sensibles) ——
  if (req.method === "GET" && pathname === "/api/public-config") {
    json(res, 200, {
      ok: true,
      complianceEnabled: isComplianceEnabled(),
      formCopyVersion: FORM_COPY_VERSION,
    });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/proofs/")) {
    if (!requireAdmin(req, res)) return;
    const proofId = pathname.slice("/api/proofs/".length);
    const proof = await readProof(ROOT, proofId);
    if (!proof) {
      json(res, 404, { ok: false, error: "Preuve introuvable" });
      return;
    }
    json(res, 200, { ok: true, proof });
    return;
  }

  // —— Public : collecte commerciale + créneaux (sans PII) ——
  if (req.method === "POST" && pathname === "/api/leads") {
    await handleCreateLead(req, res);
    return;
  }
  if (req.method === "POST" && pathname === "/api/appointments") {
    await handleCreateAppointment(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/agenda") {
    await handleAgenda(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/realisations") {
    await handleListRealisations(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/google-reviews") {
    await handleGoogleReviews(req, res);
    return;
  }
  if (req.method === "GET" && pathname === "/api/clim-gallery") {
    await handleGetClimGalleryPublic(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  res.writeHead(405).end("Method not allowed");
});

/**
 * Passage périodique de la file. L’intervalle ne retient pas le processus à
 * l’arrêt, et reste inoffensif quand la liaison est éteinte : `runCrmOutbox`
 * sort immédiatement.
 */
const CRM_SYNC_INTERVAL_MS = 60_000;
const crmSyncTimer = setInterval(() => {
  runCrmOutbox().catch(() => {});
}, CRM_SYNC_INTERVAL_MS);
crmSyncTimer.unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MKL Énergies → http://localhost:${PORT}`);
  console.log(`CRM          → http://localhost:${PORT}/admin.html`);
  console.log(
    `Compliance   → ${isComplianceEnabled() ? "ON (ENABLE_CALLBACK_COMPLIANCE)" : "OFF (défaut)"}`
  );
  console.log(
    `Synchro CRM  → ${syncActive() ? "ON" : crmSyncEnabled() ? "OFF (configuration incomplète)" : "OFF (CRM_SYNC_ENABLED)"}`
  );
  if (syncActive()) runCrmOutbox().catch(() => {});
});
