"use client";

import { originViewOf } from "../lib/prospect-origin-view";

/**
 * Cellule « Origine », partagée par la liste des commerciaux et le tableau de
 * dispatch. Les deux listes sont exclusives — personne ne voit les deux — donc
 * rien ne signalerait qu'elles se mettent à afficher l'origine différemment.
 * Un seul composant rend cette divergence impossible.
 *
 * `prospect.origin` est calculé par le serveur. Le recours local couvre les
 * écrans qui reçoivent une fiche par un autre chemin, afin que la colonne ne
 * reste jamais vide sans raison visible.
 */
export function ProspectOriginCell({ prospect }) {
  const origin = prospect?.origin || originViewOf(prospect || {});
  if (!origin) return <span />;
  const secondaire = [origin.sublabel, origin.ecart].filter(Boolean).join(" · ");
  return (
    <span className="origin-cell">
      <b>
        {origin.label}
        {/* Une origine déduite de l'ancienne source libre n'est pas une mesure.
            Les confondre ferait entrer des « Stand Carrefour » interprétés dans
            un futur coût par vente publicitaire. */}
        {!origin.mesuree && <em className="origin-deduced">déduit</em>}
      </b>
      {origin.campaign && <small className="origin-campaign">{origin.campaign}</small>}
      {secondaire && <small>{secondaire}</small>}
      {origin.deduiteDe && <small>d’après « {origin.deduiteDe} »</small>}
    </span>
  );
}

export default ProspectOriginCell;
