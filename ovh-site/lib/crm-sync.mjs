import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * Envoi signé des demandes vers le CRM.
 *
 * L’appel est strictement de serveur à serveur. Le secret ne doit jamais
 * atteindre un navigateur : aucune de ces fonctions n’est utilisée par les
 * pages publiques, et la route du CRM ne renvoie aucun en-tête CORS.
 *
 * La signature couvre la méthode, le chemin, l’horodatage, un aléa et une
 * empreinte du corps. Elle n’est donc rejouable ni sur une autre route ni avec
 * un autre contenu.
 */

export const SIGNATURE_VERSION = "v1";
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export const CRM_HEADERS = {
  keyId: "x-mkl-key-id",
  timestamp: "x-mkl-timestamp",
  nonce: "x-mkl-nonce",
  signature: "x-mkl-signature",
  // En-tête de Vercel, et non du CRM : il franchit « Vercel Authentication »
  // avant que la requête n'atteigne la route d'ingestion.
  bypass: "x-vercel-protection-bypass",
};

export function bodyDigest(rawBody) {
  return createHash("sha256").update(rawBody ?? "", "utf8").digest("hex");
}

/**
 * Chaîne canonique signée. Toute évolution impose un nouveau numéro de
 * version, sinon les deux côtés se désynchronisent silencieusement.
 */
export function canonicalString({ method, path, timestamp, nonce, rawBody }) {
  return [
    SIGNATURE_VERSION,
    String(method || "").toUpperCase(),
    String(path || ""),
    String(timestamp || ""),
    String(nonce || ""),
    bodyDigest(rawBody),
  ].join("\n");
}

export function signCanonical(secret, canonical) {
  if (!secret) throw new Error("Secret de synchronisation absent.");
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

/**
 * Construit le corps transmis. Seules les données utiles au CRM partent : ni
 * adresse IP, ni agent utilisateur, ni preuve de consentement, qui restent sur
 * le site et n’ont pas à circuler.
 */
export function buildCrmPayload(job, record) {
  if (!record) throw new Error("Demande introuvable sur le site.");
  return {
    submissionId: String(job.sourceId),
    kind: String(job.kind),
    receivedAt: record.createdAt || job.createdAt || null,
    intent: record.intent || "",
    projects: Array.isArray(record.projects) ? record.projects : [],
    postalCode: record.postalCode || "",
    housing: record.housing || "",
    firstName: record.firstName || "",
    lastName: record.lastName || "",
    name: record.name || "",
    phone: record.phone || "",
    email: record.email || "",
    message: record.message || "",
    ...(job.kind === "appointment"
      ? { date: record.date || "", time: record.time || "", appointmentStatus: record.status || "" }
      : {}),
    // Vide tant que le site ne capte pas gclid, fbclid et utm_*. Le CRM
    // classera alors la demande en « Prospect Site », jamais en publicitaire.
    attribution: record.attribution && typeof record.attribution === "object" ? record.attribution : {},
    // Premier contact, quand le navigateur l'a mémorisé. Absent pour un
    // visiteur dont la première visite est aussi celle de la demande : le CRM
    // considère alors que les deux modèles désignent le même canal.
    attributionFirst:
      record.attributionFirst && typeof record.attributionFirst === "object"
        ? record.attributionFirst
        : {},
  };
}

export function buildSignedRequest({
  job,
  record,
  secret,
  keyId,
  endpoint,
  nonce = randomUUID(),
  now = Date.now(),
  // Jeton de contournement de la protection Vercel, quand le CRM est protégé
  // par « Vercel Authentication ». Cette protection intercepte la requête
  // avant qu'elle n'atteigne la route, et rend 401 sans jamais lire la
  // signature : sans ce jeton, aucun prospect ne peut entrer.
  //
  // Il ne remplace pas la signature, il s'y ajoute. Deux secrets distincts
  // sont alors nécessaires pour déposer une demande : celui de Vercel, qui
  // ouvre la porte, et celui du CRM, qui authentifie l'émetteur. Un jeton
  // volé seul ne permet donc rien.
  bypassToken = "",
}) {
  if (!endpoint) throw new Error("Adresse du CRM absente.");
  if (!keyId) throw new Error("Identifiant de clé absent.");
  const url = new URL(endpoint);
  const rawBody = JSON.stringify(buildCrmPayload(job, record));
  const timestamp = String(now);
  const signature = signCanonical(
    secret,
    canonicalString({ method: "POST", path: url.pathname, timestamp, nonce, rawBody })
  );
  return {
    url: url.toString(),
    method: "POST",
    rawBody,
    headers: {
      "content-type": "application/json",
      [CRM_HEADERS.keyId]: keyId,
      [CRM_HEADERS.timestamp]: timestamp,
      [CRM_HEADERS.nonce]: nonce,
      [CRM_HEADERS.signature]: `${SIGNATURE_VERSION}=${signature}`,
      // Absent quand aucun jeton n'est configuré : l'en-tête ne doit pas
      // apparaître à vide, ce qui serait interprété comme une tentative.
      ...(bypassToken ? { [CRM_HEADERS.bypass]: bypassToken } : {}),
    },
  };
}

/** Erreur comportant l’information « faut-il réessayer ». */
function syncError(message, retryable) {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
}

/**
 * Envoie une tâche et renvoie l’accusé du CRM.
 *
 * Un refus 4xx autre que 408 et 429 n’est pas réessayable : insister ne ferait
 * que remplir les journaux. Le message d’erreur ne reprend jamais le corps de
 * la réponse, pour ne pas recopier de coordonnées dans la file.
 */
export async function sendCrmJob(job, {
  record,
  secret,
  keyId,
  endpoint,
  timeoutMs = 10_000,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  nonce,
  bypassToken = "",
} = {}) {
  const request = buildSignedRequest({ job, record, secret, keyId, endpoint, now, nonce, bypassToken });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.rawBody,
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    throw syncError(
      error?.name === "AbortError" ? "CRM injoignable : délai dépassé." : "CRM injoignable.",
      true
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
    throw syncError(`CRM a refusé la demande (${response.status}).`, retryable);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw syncError("Réponse du CRM illisible.", true);
  }
  if (!data?.ok || !data?.id) {
    throw syncError("Accusé de réception incomplet.", true);
  }
  return { id: data.id, duplicate: Boolean(data.duplicate), receivedAt: data.receivedAt || null };
}

/** Lecture de la configuration. Le secret n’est jamais journalisé. */
export function crmSyncConfig(env = process.env) {
  return {
    endpoint: String(env.CRM_SYNC_URL || "").trim(),
    keyId: String(env.CRM_SYNC_KEY_ID || "").trim(),
    secret: String(env.CRM_SYNC_SECRET || ""),
    // Facultatif : nécessaire seulement si le CRM est protégé par
    // « Vercel Authentication ». Son absence ne change rien à la
    // configuration réputée complète, puisqu'un CRM joignable n'en a pas
    // besoin.
    bypassToken: String(env.CRM_SYNC_BYPASS || "").trim(),
  };
}

export function crmSyncConfigured(env = process.env) {
  const { endpoint, keyId, secret } = crmSyncConfig(env);
  return Boolean(endpoint && keyId && secret.length >= 32);
}
