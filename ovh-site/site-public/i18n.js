/**
 * MKL Énergies — i18n FR / DE / EN
 * Persistance : localStorage mkl_lang — suit la navigation entre pages.
 */
const STORAGE_KEY = "mkl_lang";
const SUPPORTED = ["fr", "de", "en"];

/** @type {Record<string, Record<string, string>>} */
const DICT = {
  fr: {
    "lang.de": "Allemand",
    "lang.en": "English",
    "lang.fr": "Français",
    "lang.choose": "Langue",
    "nav.solutions": "Solutions",
    "nav.radiateurs": "Radiateurs à brique réfractaire",
    "nav.pv": "Panneaux photovoltaïques",
    "nav.pac": "Pompe à chaleur",
    "nav.clim": "Climatisation",
    "nav.autres": "Autres solutions",
    "nav.realisations": "Réalisations",
    "nav.etude": "Étude",
    "nav.rdv": "RDV",
    "nav.qualifications": "Nos qualifications",
    "nav.contact": "Contact",
    "nav.open": "Ouvrir le menu",
    "sticky.call": "Appeler",
    "sticky.rdv": "RDV",
    "sticky.etude": "Étude",
    "cta.etude": "Demander une étude",
    "cta.rdv": "Prendre rendez-vous",
    "cta.rappel": "Être rappelé(e)",
    "footer.tagline":
      "Transition énergétique en Alsace et dans tout le Grand Est — pompe à chaleur, climatisation, radiateurs et solaire.",
    "footer.hours": "Horaires",
    "footer.hours.val": "Lun.–Ven. 09:00 – 12:00 / 13:00 – 17:00",
    "footer.quick": "Liens rapides",
    "footer.services": "Services",
    "footer.home": "Accueil",
    "footer.cgv": "Conditions générales de vente",
    "footer.privacy": "Politique de confidentialité",
    "footer.cookies": "Gérer les cookies",
    "footer.legal": "Mentions légales",
    "footer.avis": "Avis Google",
    "footer.rad": "Radiateurs à brique",
    "footer.pv": "Panneaux photovoltaïques",
    "footer.pac": "Pompes à chaleur",
    "footer.clim": "Climatisation",
    "home.hero.title": "Le confort allemand.<br />L’exigence alsacienne.",
    "home.hero.sub": "Radiateurs réfractaires · Pompes à chaleur · Photovoltaïque",
    "etude.brand": "MKL Énergies",
    "etude.title": "Demander une étude",
    "etude.lead":
      "Un formulaire par type de projet — pompe à chaleur, photovoltaïque, climatisation, radiateurs ou autre demande. Aucune estimation automatique de tarif.",
    "etude.picker":
      "Sélectionnez votre projet pour afficher le formulaire adapté — pompe à chaleur, solaire, climatisation, radiateurs ou autre demande.",
    "etude.change": "Changer de projet",
    "etude.formlabel": "Formulaire :",
    "trade.pac": "Pompe à chaleur",
    "trade.pac.blurb": "Remplacement chaudière fioul ou gaz, confort thermique.",
    "trade.pv": "Photovoltaïque",
    "trade.pv.blurb": "Production solaire pour votre maison.",
    "trade.clim": "Climatisation",
    "trade.clim.blurb": "Mono ou multisplit réversible.",
    "trade.rad": "Radiateurs à brique",
    "trade.rad.blurb": "Inertie réfractaire, confort premium.",
    "trade.autre": "Autre projet",
    "trade.autre.blurb": "Ballon thermodynamique, isolation, ou plusieurs métiers.",
    "rdv.title": "Échangeons sur votre projet",
    "rdv.lead":
      "Indiquez un créneau qui vous convient. Un conseiller MKL vous rappelle pour faire le point sur votre projet.",
    "rdv.badge": "Créneaux en ligne · jours ouvrés · 9h00 – 19h00 · jusqu’à 3 semaines",
    "rdv.back": "← Retour",
    "avis.eyebrow": "Avis",
    "avis.title": "Ce qu’en disent nos clients",
    "form.intent.etude": "Demander une étude",
    "form.intent.rappel": "Être rappelé(e)",
    "form.continue": "Continuer",
    "form.back": "Retour",
    "form.submit.etude": "Demander une étude",
    "form.submit.rappel": "Être rappelé(e)",
    "form.success.title": "Demande bien reçue",
    "form.success.etude": "Nous préparons votre étude et vous recontactons rapidement.",
    "form.success.rappel": "Un conseiller MKL vous rappelle sous 24h (jours ouvrés).",
    "form.urgent": "Urgent ?",
    "legal.title": "Mentions légales",
    "legal.lead": "Informations légales sur l’éditeur du site mkl-energies.fr.",
    "orb.title": "Nos solutions",
    "orb.close": "Fermer",
    "orb.choose": "Choisir une solution",
    "orb.rad": "Radiateurs",
    "orb.rad.sub": "Brique réfractaire",
    "orb.pv": "Photovoltaïque",
    "orb.pv.sub": "Production",
    "orb.pac": "Pompe à chaleur",
    "orb.pac.sub": "Air / eau",
    "orb.clim": "Climatisation",
    "orb.clim.sub": "Confort d’été",
    "form.sending": "Envoi…",
    "home.services.title": "Quatre solutions.<br />Un seul interlocuteur.",
    "home.autres.title": "Autres solutions",
    "home.process.title": "Comment ça se passe",
    "home.relation.title": "Une relation simple et claire",
    "home.qualif.title": "Nos qualifications",
    "home.real.title": "Réalisations",
    "cookies.title": "Cookies & mesure d’audience",
    "cookies.text":
      "Nous utilisons Google Tag Manager pour mesurer l’audience et, le cas échéant, la publicité. Par défaut, les cookies analytiques et publicitaires sont refusés. Vous pouvez accepter ou refuser.",
    "cookies.accept": "Tout accepter",
    "cookies.deny": "Refuser",
  },
  de: {
    "lang.de": "Deutsch",
    "lang.en": "English",
    "lang.fr": "Französisch",
    "lang.choose": "Sprache",
    "nav.solutions": "Lösungen",
    "nav.radiateurs": "Speicherheizungen mit Schamottestein",
    "nav.pv": "Photovoltaik",
    "nav.pac": "Wärmepumpe",
    "nav.clim": "Klimaanlage",
    "nav.autres": "Weitere Lösungen",
    "nav.realisations": "Referenzen",
    "nav.etude": "Studie",
    "nav.rdv": "Termin",
    "nav.qualifications": "Unsere Qualifikationen",
    "nav.contact": "Kontakt",
    "nav.open": "Menü öffnen",
    "sticky.call": "Anrufen",
    "sticky.rdv": "Termin",
    "sticky.etude": "Studie",
    "cta.etude": "Studie anfragen",
    "cta.rdv": "Termin vereinbaren",
    "cta.rappel": "Rückruf anfordern",
    "footer.tagline":
      "Energiewende im Elsass und in der gesamten Region Grand Est — Wärmepumpe, Klima, Heizkörper und Solar.",
    "footer.hours": "Öffnungszeiten",
    "footer.hours.val": "Mo.–Fr. 09:00 – 12:00 / 13:00 – 17:00",
    "footer.quick": "Schnelllinks",
    "footer.services": "Leistungen",
    "footer.home": "Startseite",
    "footer.cgv": "Allgemeine Verkaufsbedingungen",
    "footer.privacy": "Datenschutz",
    "footer.cookies": "Cookies verwalten",
    "footer.legal": "Impressum",
    "footer.avis": "Google-Bewertungen",
    "footer.rad": "Schamotte-Heizkörper",
    "footer.pv": "Photovoltaik",
    "footer.pac": "Wärmepumpen",
    "footer.clim": "Klimaanlage",
    "home.hero.title": "Deutscher Komfort.<br />Elsässischer Anspruch.",
    "home.hero.sub": "Schamotte-Heizkörper · Wärmepumpen · Photovoltaik",
    "etude.brand": "MKL Énergies",
    "etude.title": "Studie anfragen",
    "etude.lead":
      "Ein Formular pro Projektart — Wärmepumpe, Photovoltaik, Klimaanlage, Heizkörper oder anderes Anliegen. Keine automatische Preisberechnung.",
    "etude.picker":
      "Wählen Sie Ihr Projekt, um das passende Formular anzuzeigen — Wärmepumpe, Solar, Klima, Heizkörper oder andere Anfrage.",
    "etude.change": "Projekt wechseln",
    "etude.formlabel": "Formular:",
    "trade.pac": "Wärmepumpe",
    "trade.pac.blurb": "Ersatz von Öl- oder Gasheizung, thermischer Komfort.",
    "trade.pv": "Photovoltaik",
    "trade.pv.blurb": "Solarstrom für Ihr Haus.",
    "trade.clim": "Klimaanlage",
    "trade.clim.blurb": "Mono- oder Multisplit, reversibel.",
    "trade.rad": "Schamotte-Heizkörper",
    "trade.rad.blurb": "Trägheitsspeicher, Premium-Komfort.",
    "trade.autre": "Anderes Projekt",
    "trade.autre.blurb": "Warmwasserspeicher, Dämmung oder mehrere Gewerke.",
    "rdv.title": "Sprechen wir über Ihr Projekt",
    "rdv.lead":
      "Wählen Sie einen Termin. Ein Berater von MKL ruft Sie zurück, um Ihr Projekt zu besprechen.",
    "rdv.badge": "Online-Termine · Werktage · 9:00 – 19:00 · bis zu 3 Wochen",
    "rdv.back": "← Zurück",
    "avis.eyebrow": "Bewertungen",
    "avis.title": "Das sagen unsere Kunden",
    "form.intent.etude": "Studie anfragen",
    "form.intent.rappel": "Rückruf anfordern",
    "form.continue": "Weiter",
    "form.back": "Zurück",
    "form.submit.etude": "Studie anfragen",
    "form.submit.rappel": "Rückruf anfordern",
    "form.success.title": "Anfrage erhalten",
    "form.success.etude": "Wir bereiten Ihre Studie vor und melden uns zeitnah.",
    "form.success.rappel": "Ein MKL-Berater ruft Sie innerhalb von 24 Std. (Werktage) zurück.",
    "form.urgent": "Dringend?",
    "legal.title": "Impressum",
    "legal.lead": "Rechtliche Angaben zum Betreiber von mkl-energies.fr.",
    "orb.title": "Unsere Lösungen",
    "orb.close": "Schließen",
    "orb.choose": "Lösung wählen",
    "orb.rad": "Heizkörper",
    "orb.rad.sub": "Schamottestein",
    "orb.pv": "Photovoltaik",
    "orb.pv.sub": "Erzeugung",
    "orb.pac": "Wärmepumpe",
    "orb.pac.sub": "Luft / Wasser",
    "orb.clim": "Klimaanlage",
    "orb.clim.sub": "Sommerkomfort",
    "form.sending": "Senden…",
    "home.services.title": "Vier Lösungen.<br />Ein Ansprechpartner.",
    "home.autres.title": "Weitere Lösungen",
    "home.process.title": "So läuft es ab",
    "home.relation.title": "Eine klare und einfache Beziehung",
    "home.qualif.title": "Unsere Qualifikationen",
    "home.real.title": "Referenzen",
    "cookies.title": "Cookies & Reichweitenmessung",
    "cookies.text":
      "Wir nutzen Google Tag Manager zur Reichweitenmessung und ggf. für Werbung. Analyse- und Werbe-Cookies sind standardmäßig abgelehnt. Sie können zustimmen oder ablehnen.",
    "cookies.accept": "Alle akzeptieren",
    "cookies.deny": "Ablehnen",
  },
  en: {
    "lang.de": "German",
    "lang.en": "English",
    "lang.fr": "French",
    "lang.choose": "Language",
    "nav.solutions": "Solutions",
    "nav.radiateurs": "Refractory brick radiators",
    "nav.pv": "Solar panels",
    "nav.pac": "Heat pump",
    "nav.clim": "Air conditioning",
    "nav.autres": "Other solutions",
    "nav.realisations": "Projects",
    "nav.etude": "Study",
    "nav.rdv": "Appointment",
    "nav.qualifications": "Our qualifications",
    "nav.contact": "Contact",
    "nav.open": "Open menu",
    "sticky.call": "Call",
    "sticky.rdv": "Book",
    "sticky.etude": "Study",
    "cta.etude": "Request a study",
    "cta.rdv": "Book an appointment",
    "cta.rappel": "Request a callback",
    "footer.tagline":
      "Energy transition in Alsace and across Grand Est — heat pumps, air conditioning, radiators and solar.",
    "footer.hours": "Opening hours",
    "footer.hours.val": "Mon–Fri 09:00 – 12:00 / 13:00 – 17:00",
    "footer.quick": "Quick links",
    "footer.services": "Services",
    "footer.home": "Home",
    "footer.cgv": "Terms of sale",
    "footer.privacy": "Privacy policy",
    "footer.cookies": "Manage cookies",
    "footer.legal": "Legal notice",
    "footer.avis": "Google reviews",
    "footer.rad": "Brick radiators",
    "footer.pv": "Solar panels",
    "footer.pac": "Heat pumps",
    "footer.clim": "Air conditioning",
    "home.hero.title": "German comfort.<br />Alsatian standards.",
    "home.hero.sub": "Refractory radiators · Heat pumps · Solar PV",
    "etude.brand": "MKL Énergies",
    "etude.title": "Request a study",
    "etude.lead":
      "One form per project type — heat pump, solar, air conditioning, radiators or another request. No automatic price estimate.",
    "etude.picker":
      "Select your project to open the matching form — heat pump, solar, AC, radiators or another request.",
    "etude.change": "Change project",
    "etude.formlabel": "Form:",
    "trade.pac": "Heat pump",
    "trade.pac.blurb": "Replace oil or gas boiler, thermal comfort.",
    "trade.pv": "Solar PV",
    "trade.pv.blurb": "Solar production for your home.",
    "trade.clim": "Air conditioning",
    "trade.clim.blurb": "Mono or multi-split, reversible.",
    "trade.rad": "Brick radiators",
    "trade.rad.blurb": "Thermal inertia, premium comfort.",
    "trade.autre": "Other project",
    "trade.autre.blurb": "Hot-water cylinder, insulation, or several trades.",
    "rdv.title": "Let’s talk about your project",
    "rdv.lead":
      "Pick a slot that suits you. An MKL adviser will call you back to discuss your project.",
    "rdv.badge": "Online booking · weekdays · 9:00 – 19:00 · up to 3 weeks ahead",
    "rdv.back": "← Back",
    "avis.eyebrow": "Reviews",
    "avis.title": "What our clients say",
    "form.intent.etude": "Request a study",
    "form.intent.rappel": "Request a callback",
    "form.continue": "Continue",
    "form.back": "Back",
    "form.submit.etude": "Request a study",
    "form.submit.rappel": "Request a callback",
    "form.success.title": "Request received",
    "form.success.etude": "We are preparing your study and will contact you shortly.",
    "form.success.rappel": "An MKL adviser will call you back within 24 hours (business days).",
    "form.urgent": "Urgent?",
    "legal.title": "Legal notice",
    "legal.lead": "Legal information about the publisher of mkl-energies.fr.",
    "orb.title": "Our solutions",
    "orb.close": "Close",
    "orb.choose": "Choose a solution",
    "orb.rad": "Radiators",
    "orb.rad.sub": "Refractory brick",
    "orb.pv": "Solar PV",
    "orb.pv.sub": "Production",
    "orb.pac": "Heat pump",
    "orb.pac.sub": "Air / water",
    "orb.clim": "Air conditioning",
    "orb.clim.sub": "Summer comfort",
    "form.sending": "Sending…",
    "home.services.title": "Four solutions.<br />One partner.",
    "home.autres.title": "Other solutions",
    "home.process.title": "How it works",
    "home.relation.title": "A simple, clear relationship",
    "home.qualif.title": "Our qualifications",
    "home.real.title": "Projects",
    "cookies.title": "Cookies & audience measurement",
    "cookies.text":
      "We use Google Tag Manager to measure audience and, where applicable, advertising. Analytics and ads cookies are refused by default. You can accept or refuse.",
    "cookies.accept": "Accept all",
    "cookies.deny": "Refuse",
  },
};

let currentLang = "fr";
const listeners = new Set();

function normalizeLang(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  return SUPPORTED.includes(v) ? v : "fr";
}

export function getLang() {
  return currentLang;
}

export function t(key, lang = currentLang) {
  const pack = DICT[lang] || DICT.fr;
  return pack[key] ?? DICT.fr[key] ?? key;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readStoredLang() {
  try {
    return normalizeLang(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "fr";
  }
}

function persistLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

function flagDe() {
  return `<svg class="lang-switch__flag" viewBox="0 0 5 3" width="22" height="14" aria-hidden="true"><rect width="5" height="1" y="0" fill="#000"/><rect width="5" height="1" y="1" fill="#D00"/><rect width="5" height="1" y="2" fill="#FFCE00"/></svg>`;
}
function flagGb() {
  return `<svg class="lang-switch__flag" viewBox="0 0 60 30" width="22" height="14" aria-hidden="true"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>`;
}
function flagFr() {
  return `<svg class="lang-switch__flag" viewBox="0 0 3 2" width="22" height="14" aria-hidden="true"><rect width="1" height="2" x="0" fill="#002395"/><rect width="1" height="2" x="1" fill="#fff"/><rect width="1" height="2" x="2" fill="#ED2939"/></svg>`;
}

function switcherHtml() {
  const label =
    currentLang === "de" ? t("lang.de") : currentLang === "en" ? t("lang.en") : t("lang.fr");
  const flag = currentLang === "de" ? flagDe() : currentLang === "en" ? flagGb() : flagFr();
  return `
    <div class="lang-switch" data-lang-switch>
      <button type="button" class="lang-switch__btn" data-lang-toggle aria-expanded="false" aria-haspopup="listbox" aria-label="${t("lang.choose")}">
        ${flag}
        <span class="lang-switch__label">${label}</span>
        <span class="lang-switch__caret" aria-hidden="true"></span>
      </button>
      <ul class="lang-switch__menu" role="listbox" hidden>
        <li role="option" data-set-lang="de" aria-selected="${currentLang === "de"}">
          ${flagDe()} <span>${t("lang.de")}</span>
        </li>
        <li role="option" data-set-lang="en" aria-selected="${currentLang === "en"}">
          ${flagGb()} <span>${t("lang.en")}</span>
        </li>
        <li role="option" data-set-lang="fr" aria-selected="${currentLang === "fr"}">
          ${flagFr()} <span>${t("lang.fr")}</span>
        </li>
      </ul>
    </div>`;
}

let switcherDocBound = false;

function closeLangMenus() {
  document.querySelectorAll("[data-lang-switch]").forEach((root) => {
    const menu = root.querySelector(".lang-switch__menu");
    const btn = root.querySelector("[data-lang-toggle]");
    menu?.setAttribute("hidden", "");
    btn?.setAttribute("aria-expanded", "false");
  });
}

function ensureSwitcher() {
  const inner = document.querySelector(".header__inner");
  if (!inner) return;
  let host = inner.querySelector("[data-lang-switch]");
  if (!host) {
    inner.insertAdjacentHTML("afterbegin", switcherHtml());
    host = inner.querySelector("[data-lang-switch]");
  } else {
    host.outerHTML = switcherHtml();
    host = inner.querySelector("[data-lang-switch]");
  }
  const root = host;
  const btn = root.querySelector("[data-lang-toggle]");
  const menu = root.querySelector(".lang-switch__menu");
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hasAttribute("hidden");
    closeLangMenus();
    if (open) {
      menu.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    }
  });
  root.querySelectorAll("[data-set-lang]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setLang(el.getAttribute("data-set-lang"));
    });
  });
  if (!switcherDocBound) {
    switcherDocBound = true;
    document.addEventListener("click", () => closeLangMenus());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLangMenus();
    });
  }
}

function applyDomI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const value = t(key);
    if (el.hasAttribute("data-i18n-html")) el.innerHTML = value;
    else el.textContent = value;
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  document.documentElement.lang = currentLang === "de" ? "de" : currentLang === "en" ? "en" : "fr";
}

export function setLang(lang) {
  currentLang = normalizeLang(lang);
  persistLang(currentLang);
  if (typeof document !== "undefined") {
    ensureSwitcher();
    applyDomI18n();
  }
  listeners.forEach((fn) => {
    try {
      fn(currentLang);
    } catch {
      /* ignore */
    }
  });
}

export function initI18n() {
  currentLang = readStoredLang();
  ensureSwitcher();
  applyDomI18n();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initI18n);
  } else {
    initI18n();
  }
}

// Expose for non-module scripts (consent banner)
if (typeof window !== "undefined") {
  window.MKL_I18N = { t, getLang, setLang, onLangChange };
}
