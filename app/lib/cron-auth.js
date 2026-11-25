/** Contrôle d'accès des traitements planifiés. */

import { timingSafeEqual } from "node:crypto";

/**
 * Comparaison à durée constante.
 *
 * `timingSafeEqual` exige deux tampons de même longueur, sinon il lève. On
 * compare donc les longueurs à part, ce qui ne divulgue que la longueur du
 * secret, et non son contenu.
 */
function memeSecret(recu, attendu) {
  const a = Buffer.from(String(recu || ""), "utf8");
  const b = Buffer.from(String(attendu || ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Autorise un appel planifié.
 *
 * Vercel envoie `Authorization: Bearer $CRON_SECRET` sur ses crons, et c'est
 * la seule forme acceptée ici. Le secret passé en paramètre d'URL se
 * retrouverait dans les journaux d'accès de la plateforme, ce qui en ferait un
 * secret écrit en clair quelque part : c'est exactement ce que nous ne voulons
 * pas. Un déclencheur externe doit donc poser l'en-tête.
 */
export function cronAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const entete = String(request?.headers?.get?.("authorization") || "");
  if (!entete.startsWith("Bearer ")) return false;
  return memeSecret(entete.slice("Bearer ".length), secret);
}

export const CRON_UNAUTHORIZED = { error: "Non autorisé." };
