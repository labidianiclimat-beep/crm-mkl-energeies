import { projectRefFromUrl } from "./supabase-environment.js";

export const PRODUCTION_REF = "rzkwmwtjnwnmmcexwoov";
export const RECETTE_REF = "xqbjfytrssslnsxxdrou";

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
 * actif autorise la recette. La production reste fermée tant que
 * COMMERCIAL_SALE_PRODUCTION_WRITE vaut false.
 */
export function signatureAccess(env = process.env) {
  const target = signatureProjectTarget(env);
  const mode = signatureModuleMode(env);
  if (target === "local") {
    return { target, mode: mode || "local", reads: mode !== "off", writes: mode !== "off" && mode !== "lecture" };
  }
  if (target === "inconnu" || mode === "off") {
    return { target, mode: mode || "off", reads: false, writes: false };
  }
  if (target === "recette") {
    return { target, mode: mode || "actif", reads: true, writes: mode !== "lecture" };
  }
  return { target, mode: mode || "off", reads: false, writes: false };
}
