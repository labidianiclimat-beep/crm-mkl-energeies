import { projectRefFromUrl } from "./supabase-environment.js";

export const PRODUCTION_REF = "rzkwmwtjnwnmmcexwoov";
export const RECETTE_REF = "xqbjfytrssslnsxxdrou";

/** Reste false. Le pilote ne dépend pas d’elle. Seuls les modes actif et lecture de production en dépendent. */
export const COMMERCIAL_SALE_PRODUCTION_WRITE = false;

const SIGNATURE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSignatureUuid(value) {
  return SIGNATURE_UUID.test(String(value || "").trim());
}

/** local : aucun projet Supabase. Un projet inconnu n’autorise aucune écriture. */
export function signatureProjectTarget(env = process.env) {
  const ref = projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) return "local";
  if (ref === PRODUCTION_REF) return "production";
  if (ref === RECETTE_REF) return "recette";
  return "inconnu";
}

/** off, lecture, pilote ou actif. Absent : la production reste off, la recette déjà validée reste ouverte. */
export function signatureModuleMode(env = process.env) {
  const raw = String(env.MKL_SIGNATURE_MODULE ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "lecture" || raw === "pilote" || raw === "actif") return raw;
  return "";
}

/**
 * Identifiants lus uniquement dans l’environnement serveur.
 * Deux UUID distincts sont exigés. Une valeur envoyée par le navigateur n’est pas lue ici.
 */
export function signaturePilotIds(env = process.env) {
  const commercialId = String(env.MKL_SIGNATURE_PILOT_COMMERCIAL_ID || "").trim().toLowerCase();
  const managerId = String(env.MKL_SIGNATURE_PILOT_MANAGER_ID || "").trim().toLowerCase();
  const valid = isSignatureUuid(commercialId) && isSignatureUuid(managerId) && commercialId !== managerId;
  return {
    commercialId: valid ? commercialId : "",
    managerId: valid ? managerId : "",
    valid,
  };
}

/**
 * Interrupteur serveur. MKL_SIGNATURE_MODULE n’est pas une variable NEXT_PUBLIC.
 * off coupe les lectures et les écritures sans effacer les preuves.
 * lecture laisse relire les preuves déjà enregistrées.
 * actif conserve le fonctionnement par rôle. pilote n’ouvre que deux
 * identifiants serveur, et seulement s’ils sont valides et distincts.
 * En production, ce pilote s’ouvre même si COMMERCIAL_SALE_PRODUCTION_WRITE
 * reste false. Les modes actif et lecture y restent fermés tant que la
 * constante n’est pas true.
 */
export function signatureAccess(env = process.env, options = {}) {
  const target = signatureProjectTarget(env);
  const mode = signatureModuleMode(env);
  const productionWrite = options.productionWrite === true;
  if (target === "inconnu" || mode === "off") {
    return { target, mode: mode || "off", reads: false, writes: false };
  }
  if (mode === "pilote") {
    if (!signaturePilotIds(env).valid) return { target, mode: "pilote", reads: false, writes: false };
    if (target === "local" || target === "recette" || target === "production") {
      return { target, mode: "pilote", reads: true, writes: true };
    }
    return { target, mode: "pilote", reads: false, writes: false };
  }
  if (target === "local") {
    return { target, mode: mode || "local", reads: true, writes: mode !== "lecture" };
  }
  if (target === "recette") {
    return { target, mode: mode || "actif", reads: true, writes: mode !== "lecture" };
  }
  if (target === "production" && productionWrite && mode === "lecture") {
    return { target, mode: "lecture", reads: true, writes: false };
  }
  if (target === "production" && productionWrite && mode === "actif") {
    return { target, mode: "actif", reads: true, writes: true };
  }
  return { target, mode: mode || "off", reads: false, writes: false };
}

export function signatureRemoteAllowed(env = process.env, { write = false } = {}) {
  const access = signatureAccess(env, { productionWrite: COMMERCIAL_SALE_PRODUCTION_WRITE === true });
  const allowed = write ? access.writes : access.reads;
  if (access.target === "production" && access.mode === "pilote" && allowed) return true;
  if (access.target === "recette" && allowed) return true;
  if (access.target === "production" && COMMERCIAL_SALE_PRODUCTION_WRITE === true && allowed) return true;
  return false;
}
