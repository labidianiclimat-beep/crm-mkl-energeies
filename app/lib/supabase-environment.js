/**
 * Cloisonnement des environnements de déploiement.
 *
 * Le retrait des valeurs de repli a réglé un cas : un déploiement sans
 * variables ne retombe plus sur la production, il refuse de fonctionner. Il
 * reste le cas inverse, que ce retrait ne couvre pas.
 *
 * Une variable Vercel s'applique aux trois environnements si on ne restreint
 * pas sa portée. Et le contrôle de build exige désormais que les variables
 * publiques soient présentes partout, sinon la compilation échoue. La pente
 * naturelle est donc de les poser pour tous les environnements, ce qui donne
 * aux déploiements Preview les identifiants de la production — y compris la
 * clé service, qui contourne RLS.
 *
 * Deux contrôles ferment cela, sans rien changer au comportement en
 * production :
 *
 *   1. La clé service doit désigner le même projet que l'URL. Ce contrôle ne
 *      demande aucune configuration supplémentaire et attrape le mélange le
 *      plus dangereux : une clé de production avec une URL de test, ou
 *      l'inverse.
 *   2. Hors production, le projet visé ne doit pas être celui déclaré comme
 *      production. Ce contrôle demande `SUPABASE_PRODUCTION_REF`, qui n'est
 *      pas un secret puisqu'elle figure déjà dans l'URL publique : elle peut
 *      donc être posée pour tous les environnements, et c'est précisément ce
 *      qui rend la comparaison possible.
 *
 * Aucune valeur n'est journalisée ni renvoyée : les verdicts ne portent que
 * des références de projet, qui sont publiques, et jamais de clé.
 */

/** Référence du projet contenue dans une URL Supabase. */
export function projectRefFromUrl(value) {
  const texte = String(value || "").trim();
  if (!texte) return null;
  try {
    const hote = new URL(texte).hostname;
    // Forme attendue : <ref>.supabase.co, ou <ref>.supabase.in selon la région.
    const trouve = /^([a-z0-9]{16,})\.supabase\.(co|in|net)$/i.exec(hote);
    if (trouve) return trouve[1].toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/**
 * Référence du projet contenue dans une clé Supabase.
 *
 * Les clés historiques sont des JWT dont la charge porte `ref`. Les nouvelles,
 * préfixées `sb_secret_` ou `sb_publishable_`, n'en sont pas et ne permettent
 * pas cette lecture : la fonction renvoie alors `null`, et le contrôle de
 * cohérence est simplement inapplicable plutôt que faussement rassurant.
 */
export function projectRefFromKey(value) {
  const texte = String(value || "").trim();
  if (!texte || texte.startsWith("sb_")) return null;
  const parties = texte.split(".");
  if (parties.length !== 3) return null;
  try {
    const charge = JSON.parse(Buffer.from(parties[1], "base64url").toString("utf8"));
    const ref = String(charge?.ref || "").trim().toLowerCase();
    return ref || null;
  } catch {
    return null;
  }
}

export const ENVIRONMENT_REJECTIONS = {
  KEY_PROJECT_MISMATCH: "SUPABASE_KEY_PROJECT_MISMATCH",
  PRODUCTION_FROM_PREVIEW: "SUPABASE_PRODUCTION_FROM_PREVIEW",
  PRODUCTION_REF_MISMATCH: "SUPABASE_PRODUCTION_REF_MISMATCH",
};

/**
 * Verdict sur le couple environnement / projet visé.
 *
 * `deploymentEnv` vient de `VERCEL_ENV`, que la plateforme pose à
 * « production », « preview » ou « development ». Son absence signifie un
 * poste de développement : on n'y refuse rien, le fichier `.env.local` étant
 * le choix explicite de la personne qui travaille. Le cloisonnement visé ici
 * est celui des déploiements, pas celui des machines.
 *
 * La sévérité dépend de l'environnement, et ce n'est pas une faiblesse mais
 * le cœur du dispositif. En production, un refus couperait le CRM entier,
 * alors que les deux valeurs y sont de type Secret, donc illisibles même par
 * la ligne de commande : la condition ne peut pas être éprouvée avant le
 * déploiement. Une incohérence y est donc signalée dans les journaux sans
 * bloquer. Hors production, elle refuse, car un déploiement de prévisualisation
 * qui échoue ne dérange personne, tandis qu'un déploiement qui écrit dans la
 * base réelle dérange tout le monde.
 *
 * Le garde-fou qui protège vraiment la production reste bloquant, et il ne
 * s'applique qu'à Preview : viser le projet déclaré comme production y est
 * refusé sans condition.
 */
export function environmentVerdict({
  deploymentEnv = "",
  projectUrl = "",
  serviceRoleKey = "",
  productionRef = "",
} = {}) {
  const environnement = String(deploymentEnv || "").trim().toLowerCase();
  const refUrl = projectRefFromUrl(projectUrl);
  const refCle = projectRefFromKey(serviceRoleKey);
  const refProduction = String(productionRef || "").trim().toLowerCase() || null;

  const detail = {
    deploymentEnv: environnement || "local",
    projectRef: refUrl,
    productionRef: refProduction,
    warning: null,
  };

  // Rempart bloquant, et le seul à l'être partout : une prévisualisation ne
  // vise jamais le projet de production. C'est lui qui porte la protection.
  if (environnement === "preview" && refProduction && refUrl === refProduction) {
    return { ok: false, reason: ENVIRONMENT_REJECTIONS.PRODUCTION_FROM_PREVIEW, ...detail };
  }

  // Le symétrique, et il manquait. Next.js fige `NEXT_PUBLIC_SUPABASE_URL` au
  // moment du build : la valeur devient une constante du code livré. Promouvoir
  // un déploiement Preview en production ne reconstruit rien, donc le contrôle
  // de build ne se rejoue pas, et la production se mettrait à écrire dans la
  // base de recette avec la clé de production. Personne ne le verrait tout de
  // suite : l'application fonctionnerait, sur la mauvaise base.
  //
  // La condition est décidable sans aucun secret, puisque
  // `SUPABASE_PRODUCTION_REF` n'en est pas un et reste lue à l'exécution. Elle
  // est donc bloquante : en production, viser autre chose que le projet déclaré
  // comme production est toujours une erreur. Son absence laisse le contrôle
  // sans effet, ce qui ne peut pas couper un CRM déjà en ligne.
  if (environnement === "production" && refProduction && refUrl && refUrl !== refProduction) {
    return { ok: false, reason: ENVIRONMENT_REJECTIONS.PRODUCTION_REF_MISMATCH, ...detail };
  }

  const incoherent = Boolean(refUrl && refCle && refUrl !== refCle);
  if (incoherent) {
    if (environnement === "production") {
      return {
        ok: true,
        reason: null,
        ...detail,
        warning: ENVIRONMENT_REJECTIONS.KEY_PROJECT_MISMATCH,
      };
    }
    return { ok: false, reason: ENVIRONMENT_REJECTIONS.KEY_PROJECT_MISMATCH, ...detail };
  }

  return { ok: true, reason: null, ...detail };
}

/** Verdict pour l'environnement courant. */
export function currentEnvironmentVerdict(env = process.env) {
  return environmentVerdict({
    deploymentEnv: env.VERCEL_ENV,
    projectUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    productionRef: env.SUPABASE_PRODUCTION_REF,
  });
}

/**
 * Message destiné aux journaux. Ne contient aucune clé.
 *
 * Vaut aussi bien pour un refus que pour un simple signalement : c'est le
 * motif qui est traduit, pas la sévérité.
 */
export function environmentRejectionMessage(verdict) {
  const motif = verdict?.reason || verdict?.warning;
  if (!motif) return "";
  if (motif === ENVIRONMENT_REJECTIONS.KEY_PROJECT_MISMATCH) {
    return (
      "La clé service ne désigne pas le même projet Supabase que " +
      "NEXT_PUBLIC_SUPABASE_URL. Vérifiez la portée des deux variables."
    );
  }
  if (motif === ENVIRONMENT_REJECTIONS.PRODUCTION_REF_MISMATCH) {
    return (
      "Ce déploiement de production vise un autre projet Supabase que celui " +
      "déclaré par SUPABASE_PRODUCTION_REF. NEXT_PUBLIC_SUPABASE_URL étant " +
      "figée au build, il s'agit probablement d'un déploiement Preview promu " +
      "en production : recompilez au lieu de promouvoir."
    );
  }
  return (
    "Un déploiement Preview vise le projet de production. Restreignez " +
    "SUPABASE_SERVICE_ROLE_KEY et NEXT_PUBLIC_SUPABASE_URL à l'environnement " +
    "Production, ou donnez à Preview son propre projet Supabase."
  );
}
