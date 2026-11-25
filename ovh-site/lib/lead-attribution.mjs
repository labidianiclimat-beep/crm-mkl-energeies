/**
 * Capture de la provenance d’une demande.
 *
 * Le serveur n’interprète rien : il enregistre les traces reçues, telles
 * quelles, en liste blanche stricte. C’est le CRM qui en déduit une catégorie,
 * pour qu’une seule règle de classement existe.
 *
 * Deux choix de discrétion :
 *   - du référent, seul le domaine est conservé. Une URL complète de moteur de
 *     recherche contient souvent la requête tapée par le visiteur.
 *   - du chemin d’arrivée, la chaîne de requête est retirée. Les identifiants
 *     utiles en sont déjà extraits, le reste n’apporte rien.
 *
 * Ces valeurs viennent du navigateur et ne sont donc pas des preuves
 * infalsifiables. Elles suffisent à mesurer des canaux, pas à fonder une
 * facturation.
 */

/** Identifiants de clic. La casse est significative, elle est conservée. */
const CLICK_IDS = ["gclid", "gbraid", "wbraid", "fbclid"];

const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

const CLICK_ID_PATTERN = /^[A-Za-z0-9_.-]{6,200}$/;
const UTM_MAX = 120;

/** Retire les caractères de contrôle, qui n’ont rien à faire dans un journal. */
function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/** Domaine du référent, sans schéma, sans chemin, sans requête. */
export function referrerHost(value) {
  const raw = cleanText(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.hostname.toLowerCase().slice(0, 120);
  } catch {
    return "";
  }
}

/** Normalise un domaine pour comparaison : sans port, sans préfixe www. */
function bareHost(value) {
  return cleanText(value, 160).toLowerCase().split(":")[0].replace(/^www\./, "");
}

/**
 * Vrai si le référent est le site lui-même.
 *
 * L’en-tête `Referer` d’une soumission de formulaire désigne la page qui
 * portait le formulaire, donc notre propre domaine. Sans ce filtre, toute
 * demande paraîtrait venir d’un site référent.
 */
export function isOwnHost(host, ownHost) {
  const left = bareHost(host);
  const right = bareHost(ownHost);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

/** Chemin d’arrivée, sans chaîne de requête ni ancre. */
export function landingPath(value) {
  const raw = cleanText(value, 300);
  if (!raw) return "";
  const path = raw.startsWith("/") ? raw : (() => {
    try {
      return new URL(raw).pathname;
    } catch {
      return "";
    }
  })();
  if (!path.startsWith("/")) return "";
  return path.split(/[?#]/)[0].slice(0, 200);
}

/**
 * Construit le bloc de provenance.
 *
 * `input` est la section `attribution` envoyée par la page, ou le corps
 * entier si la page envoie les champs à plat. `headerReferer` sert de recours
 * quand la page n’a rien transmis : il est disponible côté serveur sans
 * aucune modification du site.
 *
 * Ce que les pages publiques doivent envoyer pour que la mesure fonctionne :
 *
 *   - les paramètres `gclid`, `gbraid`, `wbraid`, `fbclid` et `utm_*` lus dans
 *     l’URL d’arrivée ;
 *   - ces valeurs mémorisées dès l’arrivée, et non à l’envoi du formulaire :
 *     le visiteur navigue souvent avant de remplir, et les paramètres ont
 *     alors disparu de l’URL ;
 *   - `referrer` relevé à l’arrivée, pas sur la page du formulaire, où il
 *     désigne presque toujours le site lui-même.
 *
 * Sans cet envoi, toute demande est classée « accès direct au site ». Aucun
 * recours côté serveur n’existe : les paramètres d’arrivée ne transitent pas
 * dans la requête de soumission.
 */
export function parseAttribution(
  input,
  { headerReferer = "", pagePath = "", ownHost = "", now = Date.now() } = {}
) {
  const source = input && typeof input === "object" ? input : {};
  const attribution = {};

  for (const key of CLICK_IDS) {
    // Pas de troncature : un identifiant de clic raccourci ne correspondrait à
    // aucun clic chez la régie tout en ayant l'air valide.
    const value = cleanText(source[key], 400);
    if (CLICK_ID_PATTERN.test(value)) attribution[key] = value;
  }

  for (const key of UTM_FIELDS) {
    const value = cleanText(source[key], UTM_MAX);
    if (value) attribution[key] = value;
  }

  const path = landingPath(source.landingPath || source.pagePath || pagePath);
  if (path) attribution.landingPath = path;

  const host = referrerHost(source.referrer) || referrerHost(headerReferer);
  if (host && !isOwnHost(host, ownHost)) attribution.referrerHost = host;

  if (Object.keys(attribution).length === 0) return {};

  // `capturedAt` annoncé par le navigateur est conservé quand il est plausible.
  // Sans cela, le premier contact porterait la même date que le dernier et la
  // lecture par chronologie ne pourrait plus les distinguer. Une date absente,
  // illisible ou future est remplacée par l'heure du serveur, qui est, elle,
  // constatée. La vraisemblance est revérifiée côté CRM.
  const claimed = Date.parse(cleanText(source.capturedAt, 40));
  attribution.capturedAt = new Date(
    Number.isNaN(claimed) || claimed > now ? now : claimed
  ).toISOString();
  return attribution;
}

/**
 * Premier contact transmis par le navigateur.
 *
 * Aucun recours serveur n'est appliqué ici, volontairement : l'en-tête
 * `Referer` désigne la page du formulaire et le chemin courant n'est pas celui
 * de la première visite. Les utiliser fabriquerait un premier contact faux,
 * plus trompeur qu'un premier contact absent.
 */
export function parseFirstAttribution(input, { ownHost = "", now = Date.now() } = {}) {
  if (!input || typeof input !== "object") return {};
  return parseAttribution(input, { headerReferer: "", pagePath: "", ownHost, now });
}

/** Vrai si la demande porte une trace de clic publicitaire. */
export function hasClickId(attribution) {
  const source = attribution && typeof attribution === "object" ? attribution : {};
  return CLICK_IDS.some(key => Boolean(source[key]));
}

export { CLICK_IDS, UTM_FIELDS };
