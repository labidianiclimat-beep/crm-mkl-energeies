"use client";

import { originViewOf } from "../lib/prospect-origin-view";

/**
 * Bloc « Provenance » de la fiche prospect, en lecture seule.
 *
 * Il se tient à côté des puces « Origine du contact », qui restent le seul
 * champ saisissable : l'une est ce que les équipes déclarent, l'autre ce que le
 * canal de création a constaté. Les deux peuvent différer, et c'est précisément
 * pour cela qu'on les montre ensemble au lieu d'en écraser une.
 */

/**
 * Ce sur quoi repose le classement. Dit en clair, parce qu'un commercial doit
 * pouvoir distinguer une origine prouvée par un identifiant de clic d'une
 * origine supposée faute de mieux.
 */
const PREUVES = {
  gclid: "identifiant de clic Google",
  gbraid: "identifiant de clic Google",
  wbraid: "identifiant de clic Google",
  fbclid: "identifiant de clic Meta",
  utm: "paramètres de campagne",
  referrer: "site référent",
  fiche: "origine portée par la fiche",
  paid_inconnu: "annonce payante, régie inconnue",
  inconnu: "aucun indice",
};

function preuveLabel(evidence) {
  const code = String(evidence || "").trim();
  // La chaîne vide est un cas légitime et non une donnée manquante : un accès
  // direct n'a aucun paramètre à citer. Annoncer une preuve ici serait faux.
  if (!code) return "accès direct, rien à citer";
  return PREUVES[code] || code;
}

function quand(valeur) {
  const date = new Date(valeur || "");
  if (!valeur || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

function Ligne({ intitule, valeur, detail }) {
  if (!valeur) return null;
  return (
    <div className="origin-trace-line">
      <dt>{intitule}</dt>
      <dd>
        {valeur}
        {detail && <em>{detail}</em>}
      </dd>
    </div>
  );
}

function contactLigne(intitule, contact) {
  if (!contact) return null;
  const valeur = [contact.label, contact.sublabel, contact.campaign].filter(Boolean).join(" · ");
  const detail = [quand(contact.touchedAt), `preuve : ${preuveLabel(contact.evidence)}`]
    .filter(Boolean)
    .join(" · ");
  return <Ligne key={intitule} intitule={intitule} valeur={valeur} detail={detail} />;
}

export function ProspectOriginTrace({ prospect }) {
  if (!prospect) return null;
  const origin = prospect.origin || originViewOf(prospect);
  if (!origin) return null;

  const page = origin.dernier?.landingPath || origin.premier?.landingPath || "";
  // Les deux contacts ne sont affichés que s'il y en a réellement deux. Avec un
  // seul, les répéter sous deux intitulés différents laisserait croire à un
  // parcours en deux temps qui n'a pas eu lieu.
  const contacts = origin.contacts > 1
    ? [contactLigne("Premier contact", origin.premier), contactLigne("Dernier contact", origin.dernier)]
    : [];

  return (
    <>
      <span className="prospect-chip-label">Provenance constatée</span>
      <dl className="origin-trace">
        <Ligne
          intitule="Origine retenue"
          valeur={origin.label}
          detail={[origin.sublabel, origin.campaign].filter(Boolean).join(" · ")}
        />
        {contacts}
        <Ligne intitule="Page d’arrivée" valeur={page} />
        {origin.deduiteDe && (
          <p className="origin-trace-note">
            Origine déduite de l’ancienne provenance « {origin.deduiteDe} ». Rien
            n’a été modifié sur la fiche : c’est une lecture, pas une mesure.
          </p>
        )}
        {origin.ecart && (
          <p className="origin-trace-note">
            Les deux contacts ne désignent pas le même canal. Aucun des deux
            n’est « le » bon : le premier a fait découvrir MKL, le dernier a
            déclenché la demande.
          </p>
        )}
        {!origin.deduiteDe && !origin.contacts && (
          <p className="origin-trace-note">
            Aucun contact détaillé n’a été enregistré : cette fiche a été saisie
            dans le CRM, elle ne vient pas du site.
          </p>
        )}
      </dl>
    </>
  );
}

export default ProspectOriginTrace;
