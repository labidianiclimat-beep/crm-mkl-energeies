/**
 * Métadonnées non personnelles pour dataLayer (GTM / Ads).
 * Aucune PII : pas de nom, téléphone, e-mail, message, adresse.
 */

/** Projets trackés (valeurs normalisées pour analyses futures). */
export const TRACKED_PROJECTS = Object.freeze([
  "climatisation",
  "photovoltaique",
  "pac",
  "radiateurs",
]);

const TRACKED_SET = new Set(TRACKED_PROJECTS);

/** Pages marketing dont le chemin peut servir de source_page (sans inventer). */
export const KNOWN_SOURCE_PATHS = Object.freeze([
  "/",
  "/index.html",
  "/climatisation.html",
  "/photovoltaique.html",
  "/pompe-a-chaleur.html",
  "/radiateurs.html",
  "/etude.html",
  "/rdv.html",
  "/qualifications.html",
]);

/**
 * @param {unknown} value
 * @returns {string|null} une des valeurs TRACKED_PROJECTS, sinon null
 */
export function normalizeProject(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase();
  return TRACKED_SET.has(id) ? id : null;
}

/**
 * @param {unknown} pathname
 * @returns {string|null}
 */
export function normalizePagePath(pathname) {
  if (pathname == null || pathname === "") return null;
  let path = String(pathname).split("?")[0].split("#")[0].trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || null;
}

/**
 * source_page uniquement si le chemin est une page connue du site.
 * @param {unknown} pathname
 * @returns {string|null}
 */
export function knownSourcePage(pathname) {
  const path = normalizePagePath(pathname);
  if (!path) return null;
  return KNOWN_SOURCE_PATHS.includes(path) ? path : null;
}

/**
 * Referrer same-origin → pathname connu, sinon null (ne jamais inventer).
 * @param {string|null|undefined} referrerHref
 * @param {string|null|undefined} currentOrigin
 */
export function sourcePageFromReferrer(referrerHref, currentOrigin) {
  if (!referrerHref || !currentOrigin) return null;
  try {
    const ref = new URL(referrerHref);
    const origin = String(currentOrigin).replace(/\/$/, "");
    if (ref.origin !== origin) return null;
    return knownSourcePage(ref.pathname);
  } catch {
    return null;
  }
}

/**
 * Projet pour generate_lead : landing mono-offre, sinon un seul projet tracké sélectionné.
 * @param {{ isClim?: boolean, isPv?: boolean, isPac?: boolean, isRadiateurs?: boolean, projects?: string[] }} ctx
 */
export function resolveLeadProject(ctx = {}) {
  if (ctx.isClim) return "climatisation";
  if (ctx.isPv) return "photovoltaique";
  if (ctx.isPac) return "pac";
  if (ctx.isRadiateurs) return "radiateurs";
  const tracked = (ctx.projects || []).map(normalizeProject).filter(Boolean);
  const unique = [...new Set(tracked)];
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Payload generate_lead (sans PII).
 * @returns {Record<string, string>}
 */
export function buildGenerateLeadPayload({
  leadType,
  pagePath,
  project,
  sourcePage,
}) {
  return compactPayload({
    form_id: "lead-form",
    form_name: "demande_etude",
    lead_type: leadType === "rappel" ? "rappel" : "devis",
    page_path: normalizePagePath(pagePath) || undefined,
    project: normalizeProject(project) || undefined,
    source_page: knownSourcePage(sourcePage) || undefined,
  });
}

/**
 * Payload book_appointment (sans PII).
 * project = sélection réelle du formulaire RDV (normalisée).
 * source_page = referrer same-origin connu uniquement.
 */
export function buildBookAppointmentPayload({ pagePath, project, sourcePage }) {
  return compactPayload({
    form_id: "rdv-form",
    form_name: "prise_rdv",
    page_path: normalizePagePath(pagePath) || undefined,
    project: normalizeProject(project) || undefined,
    source_page: knownSourcePage(sourcePage) || undefined,
  });
}

/** Retire clés vides ; n’accepte que des scalaires string/number/boolean simples. */
export function compactPayload(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    out[key] = String(value);
  }
  return out;
}

/** Clés autorisées dans un push conversion (garde-fou anti-PII). */
export const ALLOWED_CONVERSION_KEYS = Object.freeze([
  "event",
  "form_id",
  "form_name",
  "lead_type",
  "page_path",
  "project",
  "source_page",
]);

export function sanitizeConversionPush(eventName, payload) {
  const clean = { event: String(eventName) };
  for (const [key, value] of Object.entries(payload || {})) {
    if (!ALLOWED_CONVERSION_KEYS.includes(key) || key === "event") continue;
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    clean[key] = String(value);
  }
  return clean;
}
