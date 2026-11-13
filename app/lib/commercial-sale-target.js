import { projectRefFromUrl } from "./supabase-environment.js";

export const PRODUCTION_REF = "rzkwmwtjnwnmmcexwoov";
export const RECETTE_REF = "xqbjfytrssslnsxxdrou";

/** Reste false. Le passer à true ne suffit pas : la production exige aussi MKL_SIGNATURE_MODULE=actif. */
export const COMMERCIAL_SALE_PRODUCTION_WRITE = false;

/** local : aucun projet Supabase. production et inconnu n’autorisent aucune écriture. */
export function signatureProjectTarget(env = process.env) {
  const ref = projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) return "local";
  if (ref === PRODUCTION_REF) return "production";
  if (ref === RECETTE_REF) return "recette";
  return "inconnu";
}

/** off, lecture ou actif. Absent : la production reste off, la recette déjà validée reste ouverte. */
export function signatureModuleMode(env = process.env) {
  const raw = String(env.MKL_SIGNATURE_MODULE ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "lecture" || raw === "actif") return raw;
  return "";
}

/**
 * Interrupteur serveur. MKL_SIGNATURE_MODULE n’est pas une variable NEXT_PUBLIC.
 * off coupe les lectures et les écritures sans effacer les preuves.
 * lecture laisse relire les preuves déjà enregistrées.
 * actif autorise la recette. La production s’ouvre seulement si les deux
 * conditions sont réunies : COMMERCIAL_SALE_PRODUCTION_WRITE vaut true et
 * l’appel passe productionWrite. L’une sans l’autre laisse la production fermée.
 */
export function signatureAccess(env = process.env, options = {}) {
  const target = signatureProjectTarget(env);
  const mode = signatureModuleMode(env);
  const productionWrite = options.productionWrite === true;
  if (target === "local") {
    return { target, mode: mode || "local", reads: mode !== "off", writes: mode !== "off" && mode !== "lecture" };
  }
  if (target === "inconnu" || mode === "off") {
    return { target, mode: mode || "off", reads: false, writes: false };
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
  if (access.target === "recette" && (write ? access.writes : access.reads)) return true;
  if (access.target === "production" && COMMERCIAL_SALE_PRODUCTION_WRITE === true && (write ? access.writes : access.reads)) return true;
  return false;
}
