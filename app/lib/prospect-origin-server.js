/**
 * Rattache l'origine affichable à chaque fiche, côté serveur.
 *
 * La table d'attribution a la sécurité au niveau ligne activée sans aucune
 * politique : aucune ligne n'en est lisible depuis un navigateur. La lecture se
 * fait donc ici, avec la clé de service, et le cloisonnement est appliqué par
 * le code — exactement comme pour les prospects eux-mêmes.
 *
 * Conséquence directe : on ne demande les contacts que des fiches déjà jugées
 * visibles. Charger ceux de toute l'organisation pour filtrer ensuite aurait
 * fait voyager l'attribution de prospects qu'un commercial n'a pas le droit de
 * voir, et il aurait suffi d'un oubli de filtre pour qu'elle atteigne l'écran.
 */
import { listAllRowsByIds } from "./supabase-list.js";
import { originViewOf } from "./prospect-origin-view.js";

/**
 * Ni `click_id`, ni `referrer_host`, ni les identifiants d'annonce. Le
 * commercial a besoin du canal, de la campagne et de la page d'arrivée ; le
 * reste est du marquage publicitaire qui n'a rien à faire dans un navigateur.
 */
const ATTRIBUTION_SELECT =
  "id,opportunity_id,touched_at,created_at,origin_channel,origin_category,origin_subtype,prospector_id,campaign_name,landing_path,touch_role,evidence";

export async function attachProspectOrigins(orgId, prospects) {
  const list = Array.isArray(prospects) ? prospects : [];
  if (!list.length) return list;
  const ids = list.map(item => item?.id).filter(Boolean);
  if (!ids.length) return list;

  let rows = [];
  try {
    rows = await listAllRowsByIds(
      `/rest/v1/lead_attribution?select=${ATTRIBUTION_SELECT}&organization_id=eq.${encodeURIComponent(orgId)}&order=touched_at.asc`,
      ids,
      { column: "opportunity_id" }
    );
  } catch (error) {
    // Une table absente ou un droit manquant ne doit pas vider la liste des
    // prospects. L'origine retombe alors sur ce que porte la fiche, c'est-à-dire
    // la lecture déduite de l'ancienne source — dégradée, mais jamais fausse.
    console.error("Attribution read error", error?.message);
    rows = [];
  }

  const parContact = new Map();
  for (const row of rows || []) {
    const id = String(row?.opportunity_id || "");
    if (!id) continue;
    if (!parContact.has(id)) parContact.set(id, []);
    parContact.get(id).push(row);
  }

  return list.map(prospect => ({
    ...prospect,
    origin: originViewOf(prospect, parContact.get(prospect?.id) || []),
  }));
}
