/**
 * Textes légaux provisoires — validation juridique requise avant publication.
 * Version bump obligatoire à chaque modification de texte.
 */

export const FORM_COPY_VERSION = "mkl-form-legal-2026-11-v1";

export const PROJECT_LABELS = {
  radiateurs: "radiateurs à brique réfractaire",
  climatisation: "climatisation",
  pac: "pompe à chaleur",
  photovoltaique: "photovoltaïque",
  cet: "ballon thermodynamique",
  "isolation-exterieure": "isolation",
  autre: "projet énergétique",
};

export function projectPhrase(projects) {
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (!list.length) return "votre projet énergétique";
  const labels = list.map((id) => PROJECT_LABELS[id] || id);
  if (labels.length === 1) return `votre projet de ${labels[0]}`;
  if (labels.length === 2) return `vos projets de ${labels[0]} et ${labels[1]}`;
  return `vos projets de ${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

export function callbackCheckboxLabel(projects) {
  return (
    `Je demande expressément à être rappelé(e) par MKL ÉNERGIES au numéro indiqué, ` +
    `afin d'obtenir des informations concernant ${projectPhrase(projects)}.`
  );
}

export function studyInfoText(projects) {
  return (
    `Les informations communiquées sont utilisées par MKL ÉNERGIES pour traiter votre demande ` +
    `concernant ${projectPhrase(projects)}.`
  );
}

export function studyOptionalCallbackLabel(projects) {
  return `Je souhaite également être rappelé(e) par MKL ÉNERGIES pour échanger sur ${projectPhrase(projects)}.`;
}

export function rdvContactText(projects) {
  return (
    `Je demande à MKL ÉNERGIES de me contacter dans le cadre du rendez-vous réservé concernant ` +
    `${projectPhrase(projects)}.`
  );
}

export const RGPD_SHORT =
  "Responsable du traitement : MKL ÉNERGIES. Finalité : traitement de votre demande. " +
  "Vous disposez de droits d’accès, de rectification et d’opposition.";

export const PRIVACY_HREF = "politique-de-confidentialite.html";

export function legalBundleForAction({ action, projects, callbackChecked, meetingType }) {
  const texts = {
    rgpdShort: RGPD_SHORT,
    privacyHref: PRIVACY_HREF,
  };
  if (action === "request_callback") {
    texts.callbackCheckbox = callbackCheckboxLabel(projects);
    texts.info = texts.callbackCheckbox;
  } else if (action === "request_study") {
    texts.studyInfo = studyInfoText(projects);
    texts.optionalCallback = studyOptionalCallbackLabel(projects);
    texts.info = texts.studyInfo;
    texts.callbackCheckboxState = !!callbackChecked;
  } else if (action === "book_appointment") {
    texts.rdvContact = rdvContactText(projects);
    texts.meetingType = meetingType || "telephone";
    texts.info = texts.rdvContact;
  }
  return texts;
}
