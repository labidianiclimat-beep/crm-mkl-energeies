/**
 * Capture de la provenance dans le navigateur.
 *
 * Sans ce module, aucune demande du site ne peut être rattachée à Google Ads
 * ou à Meta : les paramètres d'arrivée ne figurent pas dans la requête de
 * soumission, et aucun recours ne existe côté serveur.
 *
 * Le point essentiel est le moment de la lecture. Le visiteur arrive sur
 * /pompe-a-chaleur.html?gclid=..., navigue, puis remplit le formulaire sur une
 * autre page où le paramètre a disparu. Les traces sont donc relevées à
 * l'arrivée et mémorisées, pas lues à l'envoi.
 *
 * Deux règles protègent la mesure :
 *
 *   - une visite sans aucune trace n'écrase jamais une trace mémorisée. Un
 *     retour direct sur le site ne doit pas effacer le clic publicitaire qui a
 *     fait découvrir MKL.
 *   - le premier contact est écrit une seule fois. Seul le dernier contact est
 *     remplacé par une visite plus récente.
 *
 * Durée de conservation : par défaut la visite en cours seulement, dans
 * `sessionStorage`. La mémorisation longue dans `localStorage` n'est activée
 * qu'avec un consentement explicite, parce qu'elle dépasse ce qui est
 * nécessaire au traitement de la demande.
 *
 * Ce module ne lit jamais ce que le visiteur saisit.
 */

/**
 * Listes dupliquées volontairement depuis lead-attribution.mjs : ce fichier
 * est servi au navigateur, et la surface publique du serveur doit rester
 * minimale. Un test croisé vérifie que les deux listes restent identiques.
 */
export const CLICK_IDS = ["gclid", "gbraid", "wbraid", "fbclid"];

export const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

export const LAST_TOUCH_KEY = "mkl.attribution.dernier";
export const FIRST_TOUCH_KEY = "mkl.attribution.premier";

/** Trente jours : la fenêtre de conversion usuelle des régies. */
export const LAST_TOUCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Quatre-vingt-dix jours : un projet énergétique se décide lentement. */
export const FIRST_TOUCH_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const CLICK_ID_PATTERN = /^[A-Za-z0-9_.-]{6,200}$/;
const UTM_MAX = 120;

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function bareHost(value) {
  return cleanText(value, 160).toLowerCase().split(":")[0].replace(/^www\./, "");
}

/** Vrai si le référent est le site lui-même : une navigation interne. */
export function isOwnHost(host, ownHost) {
  const left = bareHost(host);
  const right = bareHost(ownHost);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

/** Paramètres retenus dans l'URL d'arrivée, en liste blanche stricte. */
export function readParams(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const found = {};
  for (const key of CLICK_IDS) {
    // Pas de troncature : un identifiant de clic raccourci ne correspondrait à
    // aucun clic chez la régie tout en ayant l'air valide.
    const value = cleanText(params.get(key), 400);
    if (CLICK_ID_PATTERN.test(value)) found[key] = value;
  }
  for (const key of UTM_FIELDS) {
    const value = cleanText(params.get(key), UTM_MAX);
    if (value) found[key] = value;
  }
  return found;
}

/** Une trace exploitable : un clic, une campagne, ou un vrai site référent. */
export function hasSignal(touch) {
  if (!touch || typeof touch !== "object") return false;
  for (const key of [...CLICK_IDS, ...UTM_FIELDS]) {
    if (touch[key]) return true;
  }
  return Boolean(touch.referrerHost);
}

/**
 * Trace de la visite en cours. Le référent n'est retenu que s'il est externe :
 * sur une page de formulaire il désigne presque toujours le site lui-même.
 */
export function touchFromArrival({
  search = "",
  referrer = "",
  pathname = "",
  ownHost = "",
  now = Date.now(),
} = {}) {
  const touch = readParams(search);
  const path = cleanText(pathname, 300).split(/[?#]/)[0];
  if (path.startsWith("/")) touch.landingPath = path.slice(0, 200);
  const raw = cleanText(referrer, 500);
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const host = url.hostname.toLowerCase().slice(0, 120);
        if (host && !isOwnHost(host, ownHost)) {
          touch.referrerHost = host;
          // L'URL complète d'un moteur de recherche contient la requête tapée
          // par le visiteur : seul le domaine est conservé, reconstruit.
          touch.referrer = `${url.protocol}//${url.hostname}`;
        }
      }
    } catch {
      // Un référent illisible est simplement ignoré.
    }
  }
  if (!hasSignal(touch)) return null;
  touch.capturedAt = new Date(now).toISOString();
  return touch;
}

function storedAge(touch, now) {
  const at = Date.parse(String(touch?.capturedAt || ""));
  if (Number.isNaN(at)) return Infinity;
  return now - at;
}

/** Vrai si la trace mémorisée est encore dans sa fenêtre. */
export function isFresh(touch, now, maxAge) {
  if (!hasSignal(touch)) return false;
  const age = storedAge(touch, now);
  return age >= 0 && age <= maxAge;
}

/**
 * Dernier contact retenu. Une visite sans trace conserve la trace mémorisée
 * tant qu'elle est dans sa fenêtre : c'est la règle qui empêche un retour
 * direct d'effacer le clic publicitaire.
 */
export function mergeLastTouch(stored, incoming, now = Date.now()) {
  if (hasSignal(incoming)) return incoming;
  return isFresh(stored, now, LAST_TOUCH_MAX_AGE_MS) ? stored : null;
}

/** Premier contact : écrit une fois, jamais remplacé tant qu'il est valide. */
export function mergeFirstTouch(stored, incoming, now = Date.now()) {
  if (isFresh(stored, now, FIRST_TOUCH_MAX_AGE_MS)) return stored;
  return hasSignal(incoming) ? incoming : null;
}

/**
 * Bloc transmis avec le formulaire. Le dernier contact occupe le champ
 * `attribution`, seul lu par le serveur aujourd'hui. Le premier contact est
 * joint à côté : le serveur l'écarte pour l'instant par liste blanche, et il
 * sera exploité sans retoucher les pages publiques.
 */
export function attributionBody(last, first) {
  const body = {};
  if (hasSignal(last)) body.attribution = { ...last };
  if (hasSignal(first)) body.attributionFirst = { ...first };
  return body;
}

/**
 * Signaux de Google Consent Mode v2. Ils sont publiés dans `dataLayer` par
 * `gtag('consent', 'default' | 'update', { ... })`.
 */
export const CONSENT_SIGNALS = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"];

/**
 * État de consentement lu dans `dataLayer`.
 *
 * Les entrées poussées par gtag sont des objets `arguments`, pas des tableaux :
 * elles sont donc parcourues par index et non avec les méthodes de tableau.
 *
 * Une consigne `update` est toujours globale et prime sur les `default`. Un
 * `default` restreint à certaines régions est ignoré : nous ne savons pas où
 * se trouve le visiteur, et supposer le consentement serait le pire choix.
 */
/**
 * Clé du choix enregistré par la bannière du site, `consent-banner.js`.
 *
 * C'est la source d'autorisation réelle, et non `dataLayer`. La bannière écrit
 * `{ analytics: bool, ads: bool, updatedAt }` puis publie le choix à gtag ; le
 * script en tête de page le republie à chaque chargement. Lire `dataLayer`
 * revient donc à lire un écho de cette clé, dépendant de l'ordre des scripts.
 * Lire la clé est direct et ne dépend de rien.
 */
export const CONSENT_STORAGE_KEY = "mkl_consent_v1";

/**
 * État de consentement tel que la bannière du site l'a enregistré.
 *
 * Renvoie un état vide quand aucun choix n'a été fait : l'absence de choix
 * n'est pas un refus explicite, mais elle n'autorise rien non plus. Les
 * valeurs par défaut du site sont à « denied », et c'est ce que le vide
 * produit en aval.
 */
export function consentFromBanner(storage) {
  // Lecture directe, sans passer par `safeStorage` : celui-ci vérifie que le
  // stockage est inscriptible, et bascule sinon sur une mémoire vide. Un
  // navigateur qui refuse l'écriture mais autorise la lecture ferait alors
  // passer un consentement accordé pour un consentement absent.
  let choice;
  try {
    choice = JSON.parse(storage?.getItem?.(CONSENT_STORAGE_KEY) || "null");
  } catch {
    return {};
  }
  if (!choice || typeof choice !== "object") return {};
  if (typeof choice.analytics !== "boolean" || typeof choice.ads !== "boolean") return {};

  const ads = choice.ads ? "granted" : "denied";
  return {
    analytics_storage: choice.analytics ? "granted" : "denied",
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  };
}

export function consentFromDataLayer(dataLayer) {
  const state = {};
  const entries = dataLayer && typeof dataLayer.length === "number" ? dataLayer : [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || typeof entry.length !== "number" || entry.length < 3) continue;
    if (entry[0] !== "consent") continue;
    const mode = entry[1];
    if (mode !== "default" && mode !== "update") continue;
    const values = entry[2];
    if (!values || typeof values !== "object") continue;
    if (mode === "default" && values.region) continue;
    for (const signal of CONSENT_SIGNALS) {
      const value = values[signal];
      if (value === "granted" || value === "denied") state[signal] = value;
    }
  }
  return state;
}

/** Vrai si la trace contient un identifiant de clic publicitaire. */
function hasClickId(touch) {
  return CLICK_IDS.some(key => Boolean(touch?.[key]));
}

/**
 * Autorisation de mémoriser durablement une trace.
 *
 * Un identifiant de clic est une donnée publicitaire : sa conservation relève
 * de `ad_storage`. Une campagne ou un référent relèvent de la mesure, donc de
 * `analytics_storage`. En l'absence de signal, rien n'est conservé au-delà de
 * la visite : la mesure de la visite en cours reste nécessaire au traitement
 * de la demande, sa conservation ne l'est pas.
 */
export function durableAllowed(consent, touch) {
  const state = typeof consent === "function" ? consent() : consent;
  if (state === true) return true;
  if (!state || typeof state !== "object") return false;
  const signal = hasClickId(touch) ? "ad_storage" : "analytics_storage";
  return state[signal] === "granted";
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
}

/**
 * Un stockage indisponible ne doit jamais empêcher l'envoi d'un formulaire :
 * navigation privée, stockage désactivé, quota atteint. On retombe alors sur
 * une mémoire de page, qui mesure la visite en cours et rien de plus.
 */
export function safeStorage(candidate) {
  try {
    if (!candidate) return memoryStorage();
    const probe = "mkl.attribution.test";
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return memoryStorage();
  }
}

function readTouch(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeTouch(storage, key, touch) {
  try {
    if (touch) storage.setItem(key, JSON.stringify(touch));
    else storage.removeItem(key);
  } catch {
    // Quota ou stockage refusé : la mesure est perdue, le formulaire marche.
  }
}

/**
 * Capture réutilisable, sans dépendance au navigateur : tout est injecté, ce
 * qui permet de la vérifier par des tests.
 *
 * `consent` à vrai autorise la mémorisation longue. Faux ou absent limite la
 * mémorisation à la visite en cours.
 */
export function createCapture({
  storage,
  sessionStorage: session,
  location = {},
  referrer = "",
  ownHost = "",
  consent = false,
  now = () => Date.now(),
} = {}) {
  const durable = safeStorage(storage);
  const visit = safeStorage(session || storage);
  const host = ownHost || location.hostname || "";

  /**
   * Trace retenue entre les deux stockages. Le dernier contact est le plus
   * récent, le premier contact le plus ancien : un consentement accordé ou
   * retiré en cours de parcours laisse des traces des deux côtés.
   */
  function readBest(key, maxAge, keepNewest) {
    const at = now();
    const candidates = [readTouch(durable, key), readTouch(visit, key)]
      .filter(touch => isFresh(touch, at, maxAge));
    if (!candidates.length) return null;
    return candidates.reduce((kept, touch) => {
      const a = Date.parse(kept.capturedAt);
      const b = Date.parse(touch.capturedAt);
      return (keepNewest ? b > a : b < a) ? touch : kept;
    });
  }

  /**
   * Écrit la trace dans le stockage autorisé et l'efface de l'autre. Un
   * consentement retiré purge donc ce qui avait été conservé, sans attendre
   * l'expiration.
   */
  function store(key, touch) {
    const allowed = touch ? durableAllowed(consent, touch) : false;
    const target = allowed ? durable : visit;
    const other = allowed ? visit : durable;
    writeTouch(target, key, touch);
    // Les deux stockages peuvent être le même objet, notamment quand aucun
    // stockage durable n'est disponible : purger l'autre effacerait l'écriture
    // qui vient d'être faite.
    if (other !== target) writeTouch(other, key, null);
  }

  function capture() {
    const at = now();
    const incoming = touchFromArrival({
      search: location.search || "",
      referrer,
      pathname: location.pathname || "",
      ownHost: host,
      now: at,
    });
    const last = mergeLastTouch(readBest(LAST_TOUCH_KEY, LAST_TOUCH_MAX_AGE_MS, true), incoming, at);
    const first = mergeFirstTouch(readBest(FIRST_TOUCH_KEY, FIRST_TOUCH_MAX_AGE_MS, false), incoming, at);
    store(LAST_TOUCH_KEY, last);
    store(FIRST_TOUCH_KEY, first);
    return { last, first };
  }

  function fields() {
    return attributionBody(
      readBest(LAST_TOUCH_KEY, LAST_TOUCH_MAX_AGE_MS, true),
      readBest(FIRST_TOUCH_KEY, FIRST_TOUCH_MAX_AGE_MS, false)
    );
  }

  /**
   * Réapplique le consentement courant aux traces déjà mémorisées.
   *
   * Le visiteur accepte après le chargement de la page : sans cet appel, une
   * trace relevée à l'arrivée resterait cantonnée à la visite alors que la
   * conservation vient d'être autorisée. À l'inverse, un refus purge la
   * conservation durable.
   */
  function refresh() {
    const last = readBest(LAST_TOUCH_KEY, LAST_TOUCH_MAX_AGE_MS, true);
    const first = readBest(FIRST_TOUCH_KEY, FIRST_TOUCH_MAX_AGE_MS, false);
    store(LAST_TOUCH_KEY, last);
    store(FIRST_TOUCH_KEY, first);
    return { last, first };
  }

  return { capture, fields, refresh };
}

/** Routes auxquelles la provenance est jointe automatiquement. */
export const ATTACH_PATHS = ["/api/leads", "/api/appointments"];

/** Vrai si l'URL visée est l'une des deux routes de demande. */
export function isAttachTarget(url) {
  const raw = String(url || "");
  const path = raw.startsWith("/") ? raw.split(/[?#]/)[0] : (() => {
    try {
      return new URL(raw, "http://local").pathname;
    } catch {
      return "";
    }
  })();
  return ATTACH_PATHS.includes(path);
}

/**
 * Ajoute la provenance à un corps JSON sans rien écraser.
 *
 * Un corps qui n'est pas du JSON d'objet est rendu tel quel : les formulaires
 * en `FormData` ou en `multipart` ne sont pas touchés, et aucune requête n'est
 * cassée par la tentative.
 */
export function mergeAttributionIntoBody(body, fields) {
  if (typeof body !== "string" || !body) return body;
  if (!fields || !Object.keys(fields).length) return body;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body;
  const next = { ...parsed };
  let changed = false;
  for (const [key, value] of Object.entries(fields)) {
    // La page garde la main : si elle a déjà renseigné le champ, il est
    // conservé tel quel.
    if (next[key] === undefined) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? JSON.stringify(next) : body;
}

/**
 * Raccordement automatique aux envois existants.
 *
 * Les pages publiques envoient leurs demandes vers /api/leads et
 * /api/appointments. Plutôt que de modifier chaque formulaire, la provenance
 * est jointe au passage de la requête. Aucun formulaire n'est créé, aucun
 * événement de conversion n'est touché, et une page qui envoie déjà le champ
 * garde sa valeur.
 *
 * `fetch` et `XMLHttpRequest` sont tous deux couverts, car le site peut
 * utiliser l'un ou l'autre selon les pages.
 */
export function installAutoAttach(target, capture) {
  if (!target || typeof capture?.fields !== "function") return () => {};
  if (target.__mklAttributionAttached) return target.__mklAttributionAttached;

  const restores = [];

  if (typeof target.fetch === "function") {
    const original = target.fetch;
    target.fetch = function patched(input, init) {
      try {
        const url = typeof input === "string" ? input : input?.url;
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        if (method === "POST" && isAttachTarget(url) && typeof init?.body === "string") {
          const body = mergeAttributionIntoBody(init.body, capture.fields());
          if (body !== init.body) return original.call(this, input, { ...init, body });
        }
      } catch {
        // Une erreur de capture ne doit jamais empêcher l'envoi.
      }
      return original.call(this, input, init);
    };
    restores.push(() => { target.fetch = original; });
  }

  const xhr = target.XMLHttpRequest;
  if (typeof xhr === "function" && xhr.prototype) {
    const open = xhr.prototype.open;
    const send = xhr.prototype.send;
    xhr.prototype.open = function patchedOpen(method, url, ...rest) {
      try {
        this.__mklMethod = String(method || "").toUpperCase();
        this.__mklUrl = url;
      } catch {
        // Objet figé : on renonce à la capture, pas à la requête.
      }
      return open.call(this, method, url, ...rest);
    };
    xhr.prototype.send = function patchedSend(body) {
      try {
        if (this.__mklMethod === "POST" && isAttachTarget(this.__mklUrl)) {
          return send.call(this, mergeAttributionIntoBody(body, capture.fields()));
        }
      } catch {
        // Idem : l'envoi passe avant la mesure.
      }
      return send.call(this, body);
    };
    restores.push(() => {
      xhr.prototype.open = open;
      xhr.prototype.send = send;
    });
  }

  const restore = () => {
    for (const undo of restores) undo();
    delete target.__mklAttributionAttached;
  };
  target.__mklAttributionAttached = restore;
  return restore;
}

/**
 * Point d'entrée des pages publiques.
 *
 * À placer dans chaque page, avant les scripts de formulaire :
 *
 *   <script type="module">
 *     import { install } from "/lib/attribution-capture.mjs";
 *     window.mklAttribution = install();
 *   </script>
 *
 * Rien d'autre n'est nécessaire : la provenance est jointe automatiquement aux
 * envois vers /api/leads et /api/appointments, sans modifier les formulaires.
 *
 * L'appel doit avoir lieu sur la page d'arrivée, donc sur toutes les pages du
 * site, et pas seulement sur celles qui portent un formulaire.
 *
 * Après l'acceptation du bandeau de consentement, une ligne à ajouter dans le
 * rappel du bandeau, pour que la trace déjà relevée bénéficie du nouvel état :
 *
 *   window.mklAttribution?.refresh();
 */
export function install(options = {}) {
  if (typeof window === "undefined") return createCapture(options);
  const capture = createCapture({
    storage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    referrer: typeof document === "undefined" ? "" : document.referrer,
    ownHost: window.location.hostname,
    // Le consentement est lu à chaque écriture, pas une seule fois : le
    // visiteur accepte après le chargement de la page.
    //
    // Ordre des sources, du plus fiable au moins fiable :
    //   1. la clé écrite par la bannière du site, qui est le choix lui-même ;
    //   2. `dataLayer`, qui n'en est qu'un écho republié par gtag et dépend de
    //      l'ordre de chargement des scripts ;
    //   3. le drapeau explicite, pour un site qui n'aurait ni l'une ni l'autre.
    consent: () => {
      if (window.mklAttributionConsent === true) return true;
      const banner = consentFromBanner(window.localStorage);
      if (Object.keys(banner).length) return banner;
      return consentFromDataLayer(window.dataLayer);
    },
    ...options,
  });
  capture.capture();
  // Filet de sécurité, jamais la garantie : le raccordement explicite dans
  // `app.js` renseigne déjà les champs avant l'envoi, et
  // `mergeAttributionIntoBody` ne remplace jamais un champ déjà présent. Ce
  // greffon ne sert donc qu'à un envoi qui aurait échappé au raccordement,
  // par exemple un formulaire ajouté plus tard.
  if (options.autoAttach !== false) installAutoAttach(window, capture);
  return capture;
}
