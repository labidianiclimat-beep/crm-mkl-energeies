import { CATEGORIES, REALISATIONS as BASE_REALISATIONS } from "./data/realisations.js";
import {
  FORM_COPY_VERSION,
  PRIVACY_HREF,
  RGPD_SHORT,
  callbackCheckboxLabel,
  studyInfoText,
  studyOptionalCallbackLabel,
  rdvContactText,
  projectPhrase,
} from "./lib/form-legal-copy.mjs";
import {
  buildBookAppointmentPayload,
  buildGenerateLeadPayload,
  resolveLeadProject,
  sanitizeConversionPush,
  sourcePageFromReferrer,
} from "./lib/conversion-datalayer.mjs";
import { install as installAttribution } from "./lib/attribution-capture.mjs";
import { t, onLangChange } from "./i18n.js";

/**
 * Provenance publicitaire de la visite.
 *
 * Relevée à l'arrivée sur la page, à partir des paramètres d'URL et du
 * référent. Conservée au-delà de la visite seulement si le consentement
 * publicitaire a été accordé dans la bannière ; sinon, limitée à la visite.
 *
 * Le raccordement aux envois est explicite, plus bas, aux deux seuls endroits
 * qui appellent /api/leads et /api/appointments. Le greffon global de secours
 * reste en place mais ne sert à rien tant que ces deux appels sont corrects :
 * les champs sont déjà renseignés quand il s'exécute.
 */
const attribution = installAttribution();

const TRADE_TITLE_KEYS = {
  pac: "trade.pac",
  photovoltaique: "trade.pv",
  climatisation: "trade.clim",
  radiateurs: "trade.rad",
  autre: "trade.autre",
};
const TRADE_BLURB_KEYS = {
  pac: "trade.pac.blurb",
  photovoltaique: "trade.pv.blurb",
  climatisation: "trade.clim.blurb",
  radiateurs: "trade.rad.blurb",
  autre: "trade.autre.blurb",
};

function tradeTitle(id) {
  const key = TRADE_TITLE_KEYS[id];
  return key ? t(key) : id;
}

function tradeBlurb(id) {
  const key = TRADE_BLURB_KEYS[id];
  return key ? t(key) : "";
}

function localizedEtudeTrades() {
  return ETUDE_TRADES.map((tr) => ({
    ...tr,
    title: tradeTitle(tr.id),
    blurb: tradeBlurb(tr.id),
  }));
}

/** Photos principales définies dans le back-office (data/covers.json) */
let coverMap = {};
/** Pastilles métiers (data/category-covers.json) */
let categoryCoverMap = {};
let REALISATIONS = BASE_REALISATIONS;

async function loadCovers() {
  try {
    const res = await fetch(`data/covers.json?v=${Date.now()}`);
    if (res.ok) coverMap = await res.json();
  } catch {
    coverMap = {};
  }
}

async function loadCategoryCovers() {
  try {
    const res = await fetch(`data/category-covers.json?v=${Date.now()}`, { cache: "no-store" });
    if (res.ok) categoryCoverMap = await res.json();
  } catch {
    categoryCoverMap = {};
  }
}

async function loadRealisations() {
  try {
    const res = await fetch(`/api/realisations?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data.ok && Array.isArray(data.realisations) && data.realisations.length) {
      REALISATIONS = data.realisations;
    }
  } catch {
    REALISATIONS = BASE_REALISATIONS;
  }
}

function getCoverIndex(chantier) {
  const saved = coverMap[chantier.id];
  const index = typeof saved === "number" ? saved : chantier.coverIndex || 0;
  return Math.min(Math.max(0, index), chantier.photos.length - 1);
}

function coverPhoto(chantier) {
  return chantier.photos[getCoverIndex(chantier)];
}

/** Ordre d’affichage : photo principale d’abord, puis les autres */
function photosInDisplayOrder(chantier) {
  const cover = getCoverIndex(chantier);
  return [
    chantier.photos[cover],
    ...chantier.photos.filter((_, i) => i !== cover),
  ];
}

const PROJECTS = [
  ...CATEGORIES,
  { id: "autre", title: "Autre projet" },
];

const STEPS = ["Projet", "Logement", "Coordonnées"];
const PV_STEPS = ["Maison", "Consommation", "Projet", "Coordonnées"];
const CLIM_STEPS = ["Logement", "Projet", "Coordonnées"];

/** Champs PAC (landing uniquement) — listes fermées, alignées API/CRM */
const PAC_HEATING = [
  ["fioul", "Fioul"],
  ["gaz", "Gaz"],
  ["electrique", "Électrique"],
  ["autre", "Autre"],
];
const PAC_SURFACE = [
  ["lt100", "Moins de 100 m²"],
  ["100_150", "100–150 m²"],
  ["150_200", "150–200 m²"],
  ["gt200", "Plus de 200 m²"],
];
const PAC_OWNERSHIP = [
  ["proprietaire", "Propriétaire"],
  ["locataire", "Locataire"],
];
const PAC_TIMELINE = [
  ["asap", "Dès que possible"],
  ["1_3m", "1–3 mois"],
  ["3_6m", "3–6 mois"],
  ["later", "Plus tard"],
];

/** Champs diagnostic PV (landing photovoltaique) — pas d’estimation auto */
const PV_ROOF = [
  ["tuile", "Tuiles"],
  ["ardoise", "Ardoise"],
  ["bac_acier", "Bac acier"],
  ["autre", "Autre"],
];
const PV_OWNERSHIP = [
  ["proprietaire", "Oui"],
  ["acquisition", "En cours d’acquisition"],
  ["non", "Non"],
];
const PV_BATTERY = [
  ["without", "Sans batterie"],
  ["with", "Avec batterie"],
  ["advice", "Je souhaite être conseillé"],
];

/** Diagnostic climatisation (landing) — aucune estimation auto */
const CLIM_HOUSING = [
  ["maison", "Maison"],
  ["appartement", "Appartement"],
];
const CLIM_ROOMS = [
  ["1", "1 pièce"],
  ["2_3", "2 à 3 pièces"],
  ["4_plus", "4 pièces et plus"],
];
const CLIM_SURFACE = [
  ["lt40", "Moins de 40 m²"],
  ["40_80", "40–80 m²"],
  ["80_150", "80–150 m²"],
  ["gt150", "Plus de 150 m²"],
];
const CLIM_EXISTING = [
  ["aucune", "Aucune"],
  ["a_remplacer", "À remplacer"],
  ["a_completer", "À compléter"],
];
const CLIM_NEED = [
  ["rafraichir", "Rafraîchir"],
  ["chauffer_rafraichir", "Chauffer et rafraîchir"],
  ["conseil", "Être conseillé"],
];
const CLIM_TIMELINE = [
  ["asap", "Dès que possible"],
  ["1_3m", "1 à 3 mois"],
  ["later", "Plus tard"],
];

/** Métiers proposés sur la page hub /etude.html (libellés via i18n) */
const ETUDE_TRADES = [
  { id: "pac" },
  { id: "photovoltaique" },
  { id: "climatisation" },
  { id: "radiateurs" },
  { id: "autre" },
];

const state = {
  step: 0,
  done: false,
  error: "",
  intent: "devis",
  /** Sur page étude : métier choisi (null = écran de sélection). */
  studyTrade: null,
  projects: [],
  postalCode: "",
  housing: "",
  heatingCurrent: "",
  surfaceBand: "",
  ownership: "",
  projectTimeline: "",
  roofType: "",
  billMonthlyEur: "",
  annualKwh: "",
  consumptionUnknown: false,
  batteryChoice: "",
  roomsBand: "",
  climSurfaceBand: "",
  climExisting: "",
  climNeed: "",
  climSystemHint: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  message: "",
  realisationsFilter: "all",
  realisationsView: "metiers", // metiers | chantiers
  lightbox: null,
  lightboxIndex: 0,
  submitting: false,
  callbackChecked: false,
  complianceEnabled: false,
  formCopyVersion: FORM_COPY_VERSION,
  lastCallbackDeadlineLocal: "",
};

async function loadPublicConfig() {
  try {
    const res = await fetch(`/api/public-config?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      state.complianceEnabled = !!data.complianceEnabled;
      if (data.formCopyVersion) state.formCopyVersion = data.formCopyVersion;
    }
  } catch {
    state.complianceEnabled = false;
  }
}

function activeProjectsForLegal() {
  if (isPvLandingPage()) return ["photovoltaique"];
  if (isClimLandingPage()) return ["climatisation"];
  if (isPacLandingPage()) return state.projects.length ? state.projects : ["pac"];
  if (isRadiateursLandingPage()) {
    return state.projects.length ? state.projects : ["radiateurs"];
  }
  return state.projects.length ? state.projects : [];
}

/** Mentions confidentialité toujours visibles (indépendant du flag rappel). */
function alwaysPrivacyHtml({ mode }) {
  const projects = activeProjectsForLegal();
  const ids = projects.length ? projects : ["autre"];
  const info =
    mode === "rappel"
      ? `Vous demandez explicitement un rappel téléphonique concernant ${projectPhrase(ids)}. Ce n’est pas une autorisation de prospection générale.`
      : `${studyInfoText(ids)} Une demande d’étude n’autorise pas automatiquement un appel de prospection.`;
  return `
    <p class="lead-form__legal lead-form__legal--info">${escapeHtml(info)}</p>
    <p class="lead-form__legal lead-form__legal--rgpd">
      ${escapeHtml(RGPD_SHORT)}
      <a href="${PRIVACY_HREF}" target="_blank" rel="noopener">Politique de confidentialité</a>.
    </p>`;
}

function complianceLegalHtml({ mode }) {
  if (!state.complianceEnabled) return "";
  const projects = activeProjectsForLegal();
  const rgpd = `
    <p class="lead-form__legal lead-form__legal--rgpd">
      ${escapeHtml(RGPD_SHORT)}
      <a href="${PRIVACY_HREF}" target="_blank" rel="noopener">Politique de confidentialité</a>.
    </p>`;

  if (mode === "rappel") {
    const label = callbackCheckboxLabel(projects.length ? projects : ["autre"]);
    return `
      <label class="lead-form__consent">
        <input type="checkbox" id="callbackChecked" ${state.callbackChecked ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
      ${rgpd}`;
  }

  const info = studyInfoText(projects.length ? projects : ["autre"]);
  const opt = studyOptionalCallbackLabel(projects.length ? projects : ["autre"]);
  return `
    <p class="lead-form__legal lead-form__legal--info">${escapeHtml(info)}</p>
    <label class="lead-form__consent lead-form__consent--optional">
      <input type="checkbox" id="callbackChecked" ${state.callbackChecked ? "checked" : ""} />
      <span>${escapeHtml(opt)}</span>
    </label>
    <p class="lead-form__legal lead-form__hint-inline lead-form__hint-inline--soft">
      Sans cette case, votre demande reste une étude : aucun rappel téléphonique n’est autorisé automatiquement.
    </p>
    ${rgpd}`;
}

/** Dernière étape : preuves flag-ON, sinon privacy toujours affichée (sans case rappel implicite). */
function lastStepLegalHtml() {
  const mode = state.intent === "rappel" ? "rappel" : "devis";
  if (state.complianceEnabled) return complianceLegalHtml({ mode });
  return alwaysPrivacyHtml({ mode });
}

function intentTabsHtml() {
  return `
    <div class="lead-form__intents">
      <button type="button" class="${state.intent === "devis" ? "is-active" : ""}" data-set-intent="devis">${t("form.intent.etude")}</button>
      <button type="button" class="${state.intent === "rappel" ? "is-active" : ""}" data-set-intent="rappel">${t("form.intent.rappel")}</button>
    </div>`;
}

function submitButtonLabel() {
  if (state.submitting) return t("form.sending");
  if (state.intent === "rappel") {
    return state.complianceEnabled ? t("form.intent.rappel") : t("form.submit.rappel");
  }
  return t("form.submit.etude");
}

function isEtudeHubPage() {
  return (
    document.body?.classList?.contains("page-etude") ||
    /\/etude\.html$/i.test(location.pathname)
  );
}

function isPacLandingPage() {
  if (isEtudeHubPage()) return state.studyTrade === "pac";
  return (
    document.body?.classList?.contains("page-pac") ||
    /\/pompe-a-chaleur\.html$/i.test(location.pathname)
  );
}

function isPvLandingPage() {
  if (isEtudeHubPage()) return state.studyTrade === "photovoltaique";
  return (
    document.body?.classList?.contains("page-pv") ||
    /\/photovoltaique\.html$/i.test(location.pathname)
  );
}

function isClimLandingPage() {
  if (isEtudeHubPage()) return state.studyTrade === "climatisation";
  return (
    document.body?.classList?.contains("page-clim") ||
    /\/climatisation\.html$/i.test(location.pathname)
  );
}

function isRadiateursLandingPage() {
  if (isEtudeHubPage()) return state.studyTrade === "radiateurs";
  return (
    document.body?.classList?.contains("page-radiateurs") ||
    /\/radiateurs\.html$/i.test(location.pathname)
  );
}

function clearStudyQualifyFields() {
  state.heatingCurrent = "";
  state.surfaceBand = "";
  state.ownership = "";
  state.projectTimeline = "";
  state.roofType = "";
  state.billMonthlyEur = "";
  state.annualKwh = "";
  state.consumptionUnknown = false;
  state.batteryChoice = "";
  state.roomsBand = "";
  state.climSurfaceBand = "";
  state.climExisting = "";
  state.climNeed = "";
  state.climSystemHint = "";
  state.housing = "";
  state.postalCode = "";
  state.message = "";
}

function applyStudyTrade(tradeId, { syncUrl = true } = {}) {
  const trade = ETUDE_TRADES.find((t) => t.id === tradeId);
  if (!trade) return false;
  state.studyTrade = trade.id;
  state.step = 0;
  state.done = false;
  state.error = "";
  state.callbackChecked = false;
  clearStudyQualifyFields();
  if (trade.id === "pac") {
    state.projects = ["pac"];
  } else if (trade.id === "photovoltaique") {
    state.projects = ["photovoltaique"];
    state.housing = "maison";
  } else if (trade.id === "climatisation") {
    state.projects = ["climatisation"];
  } else if (trade.id === "radiateurs") {
    state.projects = ["radiateurs"];
  } else {
    state.projects = [];
  }
  if (syncUrl) {
    try {
      const url = new URL(location.href);
      if (trade.id === "autre") url.searchParams.delete("project");
      else url.searchParams.set("project", trade.id);
      history.replaceState({}, "", url);
    } catch {
      /* ignore */
    }
  }
  return true;
}

function selectStudyTrade(tradeId) {
  if (applyStudyTrade(tradeId)) renderForm();
}

function clearStudyTrade() {
  state.studyTrade = null;
  state.projects = [];
  state.step = 0;
  state.done = false;
  state.error = "";
  clearStudyQualifyFields();
  try {
    const url = new URL(location.href);
    url.searchParams.delete("project");
    history.replaceState({}, "", url);
  } catch {
    /* ignore */
  }
  renderForm();
}

function studyTradeChromeHtml() {
  if (!isEtudeHubPage() || !state.studyTrade) return "";
  const trade = localizedEtudeTrades().find((tr) => tr.id === state.studyTrade);
  if (!trade) return "";
  return `
    <div class="etude-trade-chrome">
      <p class="etude-trade-chrome__label">
        ${escapeHtml(t("etude.formlabel"))} <strong>${escapeHtml(trade.title)}</strong>
      </p>
      <button type="button" class="btn btn--ghost etude-trade-chrome__switch" data-clear-study-trade>
        ${escapeHtml(t("etude.change"))}
      </button>
    </div>`;
}

function renderEtudeTradePicker() {
  if (!formRoot) return;
  const cards = localizedEtudeTrades()
    .map(
      (tr) => `
      <button type="button" class="etude-trade" data-select-study-trade="${tr.id}">
        <span class="etude-trade__title">${escapeHtml(tr.title)}</span>
        <span class="etude-trade__blurb">${escapeHtml(tr.blurb)}</span>
      </button>`
    )
    .join("");
  formRoot.innerHTML = `
    <div class="etude-picker" role="group" aria-label="${escapeHtml(t("etude.title"))}">
      <p class="etude-picker__intro">
        ${escapeHtml(t("etude.picker"))}
      </p>
      <div class="etude-picker__grid">${cards}</div>
    </div>`;
  // Délégation : clic sur titre/blurb enfants → même action
  formRoot.onclick = (e) => {
    const btn = e.target.closest("[data-select-study-trade]");
    if (!btn || !formRoot.contains(btn)) return;
    selectStudyTrade(btn.getAttribute("data-select-study-trade") || "");
  };
}

/** Landings mono-offre : pas d’étape « projet » (projet prérempli). */
const LANDING_PAC_RAD_STEPS = ["Logement", "Coordonnées"];

function formSteps() {
  if (isPvLandingPage()) return PV_STEPS;
  if (isClimLandingPage()) return CLIM_STEPS;
  if (isPacLandingPage() || isRadiateursLandingPage()) return LANDING_PAC_RAD_STEPS;
  return STEPS;
}

function isDedicatedTradeLanding() {
  return (
    isPacLandingPage() ||
    isRadiateursLandingPage() ||
    isPvLandingPage() ||
    isClimLandingPage()
  );
}

function deduceClimSystemHint(roomsBand) {
  if (roomsBand === "1") return "monosplit";
  if (roomsBand === "2_3" || roomsBand === "4_plus") return "multisplit";
  return "";
}

function climSystemHintLabel(hint) {
  if (hint === "monosplit") return "Orientation indicative : monosplit (1 pièce).";
  if (hint === "multisplit") return "Orientation indicative : multisplit (plusieurs pièces).";
  return "Orientation indicative à préciser avec un conseiller.";
}

function choiceButtons(options, stateKey, dataAttr) {
  return options
    .map(
      ([value, label]) => `
      <button type="button" class="${state[stateKey] === value ? "is-active" : ""}" data-${dataAttr}="${value}">
        ${label}
      </button>`
    )
    .join("");
}

const rdvState = {
  days: [],
  loading: true,
  error: "",
  selectedDay: "", // date key YYYY-MM-DD for book UI
  weekIndex: 0, // semaine visible dans le calendrier
  selected: null, // { date, time, label }
  modalOpen: false,
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  project: "",
  note: "",
  heatingCurrent: "",
  surfaceBand: "",
  ownership: "",
  projectTimeline: "",
  roofType: "",
  batteryChoice: "",
  roomsBand: "",
  climNeed: "",
  climSurfaceBand: "",
  climExisting: "",
  climSystemHint: "",
  meetingType: "telephone",
  submitting: false,
  done: false,
  doneInfo: null,
};

function projectTitle(id) {
  if (!id) return "";
  return PROJECTS.find((p) => p.id === id)?.title || "";
}

function parseDayParts(label) {
  const parts = String(label || "").trim().split(/\s+/);
  return { weekday: parts[0] || "", dateRest: parts.slice(1).join(" ") };
}

function mondayOfDateKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const dow = d.getDay(); // 0=dim
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Regroupe les jours ouvrés par semaine (lundi → vendredi). */
function groupAgendaWeeks(days) {
  const weeks = [];
  const indexByMonday = new Map();
  for (const day of days) {
    const monday = mondayOfDateKey(day.date);
    let idx = indexByMonday.get(monday);
    if (idx == null) {
      idx = weeks.length;
      indexByMonday.set(monday, idx);
      weeks.push({ monday, days: [] });
    }
    weeks[idx].days.push(day);
  }
  return weeks;
}

function weekRangeLabel(weekDays) {
  if (!weekDays?.length) return "";
  const first = parseDayParts(weekDays[0].label).dateRest;
  const last = parseDayParts(weekDays[weekDays.length - 1].label).dateRest;
  if (first === last) return first;
  return `${first} – ${last}`;
}

function ensureSelectedDay() {
  if (!rdvState.days.length) {
    rdvState.selectedDay = "";
    rdvState.weekIndex = 0;
    return;
  }
  if (!rdvState.days.some((d) => d.date === rdvState.selectedDay)) {
    rdvState.selectedDay = rdvState.days[0].date;
  }
  const weeks = groupAgendaWeeks(rdvState.days);
  const idx = weeks.findIndex((w) => w.days.some((d) => d.date === rdvState.selectedDay));
  if (idx >= 0) rdvState.weekIndex = idx;
  else rdvState.weekIndex = Math.min(rdvState.weekIndex, Math.max(0, weeks.length - 1));
}

function clearRdvQualifyFields() {
  rdvState.heatingCurrent = "";
  rdvState.surfaceBand = "";
  rdvState.ownership = "";
  rdvState.projectTimeline = "";
  rdvState.roofType = "";
  rdvState.batteryChoice = "";
  rdvState.roomsBand = "";
  rdvState.climNeed = "";
  rdvState.climSurfaceBand = "";
  rdvState.climExisting = "";
  rdvState.climSystemHint = "";
}

/** @deprecated alias — conserver les appels existants */
function clearRdvPacFields() {
  clearRdvQualifyFields();
}

function rdvPacChoicesHtml() {
  if (rdvState.project !== "pac") return "";
  return `
    <div class="rdv__pac rdv__qualify" aria-label="Qualification pompe à chaleur">
      <p class="rdv__pac-label">Chauffage actuel <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PAC_HEATING.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.heatingCurrent === value ? "is-active" : ""}" data-rdv-heating="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Surface du logement <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PAC_SURFACE.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.surfaceBand === value ? "is-active" : ""}" data-rdv-surface="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Vous êtes <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PAC_OWNERSHIP.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.ownership === value ? "is-active" : ""}" data-rdv-ownership="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Délai du projet <span class="lead-form__opt">(facultatif)</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PAC_TIMELINE.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.projectTimeline === value ? "is-active" : ""}" data-rdv-timeline="${value}">${label}</button>`
        ).join("")}
      </div>
    </div>`;
}

function rdvPvChoicesHtml() {
  if (rdvState.project !== "photovoltaique") return "";
  return `
    <div class="rdv__pv rdv__qualify" aria-label="Qualification photovoltaïque">
      <p class="rdv__pac-label">Type de toiture <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PV_ROOF.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.roofType === value ? "is-active" : ""}" data-rdv-roof="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Êtes-vous propriétaire&nbsp;? <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PV_OWNERSHIP.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.ownership === value ? "is-active" : ""}" data-rdv-ownership="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Orientation souhaitée <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PV_BATTERY.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.batteryChoice === value ? "is-active" : ""}" data-rdv-battery="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Délai envisagé pour les travaux <span class="lead-form__opt">(facultatif)</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${PAC_TIMELINE.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.projectTimeline === value ? "is-active" : ""}" data-rdv-timeline="${value}">${label}</button>`
        ).join("")}
      </div>
    </div>`;
}

function rdvClimChoicesHtml() {
  if (rdvState.project !== "climatisation") return "";
  const hint = deduceClimSystemHint(rdvState.roomsBand);
  return `
    <div class="rdv__clim rdv__qualify" aria-label="Qualification climatisation">
      <p class="rdv__pac-label">Nombre de pièces à climatiser <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${CLIM_ROOMS.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.roomsBand === value ? "is-active" : ""}" data-rdv-rooms="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Votre besoin <span class="lead-form__req">*</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${CLIM_NEED.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.climNeed === value ? "is-active" : ""}" data-rdv-clim-need="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="rdv__pac-label">Délai souhaité <span class="lead-form__opt">(facultatif)</span></p>
      <div class="lead-form__choices rdv__pac-choices">
        ${CLIM_TIMELINE.map(
          ([value, label]) => `
          <button type="button" class="${rdvState.projectTimeline === value ? "is-active" : ""}" data-rdv-timeline="${value}">${label}</button>`
        ).join("")}
      </div>
      <p class="lead-form__hint-inline lead-form__hint-inline--soft">${escapeHtml(climSystemHintLabel(hint))} Indication non imposée.</p>
    </div>`;
}

const hoverTimers = new WeakMap();

/** Anti-doublon local (clés privées, jamais poussées dans dataLayer) */
const conversionFired = new Set();

/**
 * Événement GTM / Ads — uniquement métadonnées non personnelles.
 * Clés autorisées : event, form_*, lead_type, page_path, project, source_page.
 * @param {string} eventName
 * @param {Record<string, string>} payload
 * @param {string} [dedupeKey]
 */
function pushConversionEvent(eventName, payload, dedupeKey) {
  if (dedupeKey) {
    if (conversionFired.has(dedupeKey)) return;
    conversionFired.add(dedupeKey);
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(sanitizeConversionPush(eventName, payload));
}

const formRoot = document.getElementById("lead-form-root");
const rdvRoot = document.getElementById("rdv-root");
const realisationsGrid = document.getElementById("realisations-grid");
const realisationsFilters = document.getElementById("realisations-filters");

function categoryLabel(id) {
  return PROJECTS.find((c) => c.id === id)?.title || id;
}

function openLead(intent = "devis", project = "") {
  if (state.lightbox) closeLightbox();
  state.intent = intent;
  state.projects = project ? [project] : [];
  state.step = 0;
  state.done = false;
  state.error = "";
  state.callbackChecked = false;
  state.lastCallbackDeadlineLocal = "";
  renderForm();
  const lead = document.getElementById("lead");
  if (lead) {
    requestAnimationFrame(() => {
      lead.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function toggleProject(id) {
  if (state.projects.includes(id)) {
    state.projects = state.projects.filter((p) => p !== id);
  } else {
    state.projects = [...state.projects, id];
  }
  state.error = "";
  renderForm();
}

function bindOpenLeadButtons(root = document) {
  root.querySelectorAll("[data-open-lead]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openLead(el.dataset.openLead || "devis", el.dataset.project || "");
    });
  });
}

function metierCover(category) {
  if (categoryCoverMap[category.id]) return categoryCoverMap[category.id];
  // Photo métier dédiée (fallback) — pas les SVG démo des chantiers
  if (category.coverFallback) return category.coverFallback;
  const first = REALISATIONS.find((r) => r.category === category.id && r.photos?.length);
  if (first) return coverPhoto(first);
  return "assets/metiers/interieur.jpg";
}

function metierPhotoCount(categoryId) {
  return REALISATIONS.filter((r) => r.category === categoryId).reduce(
    (n, r) => n + (r.photos?.length || 0),
    0
  );
}

function renderRealisationsFilters() {
  if (!realisationsFilters) return;
  if (state.realisationsView === "metiers") {
    realisationsFilters.innerHTML = "";
    return;
  }
  const cat = CATEGORIES.find((c) => c.id === state.realisationsFilter);
  realisationsFilters.innerHTML = `
    <button type="button" class="metier-back" data-back-metiers>
      ← Tous les métiers
    </button>
    <p class="metier-current">${cat ? escapeHtml(cat.title) : ""}</p>
  `;
  realisationsFilters.querySelector("[data-back-metiers]")?.addEventListener("click", () => {
    state.realisationsView = "metiers";
    state.realisationsFilter = "all";
    renderRealisationsFilters();
    renderRealisations();
  });
}

function renderMetierPastilles() {
  realisationsGrid.classList.add("realisations__grid--metiers");
  realisationsGrid.innerHTML = CATEGORIES.map((cat) => {
    const count = metierPhotoCount(cat.id);
    const cover = metierCover(cat);
    return `
      <button type="button" class="metier-tile" data-open-metier="${cat.id}">
        <img src="${cover}" alt="" loading="lazy" width="640" height="480" />
        <span class="metier-tile__shade"></span>
        <span class="metier-tile__body">
          <span class="metier-tile__title">${escapeHtml(cat.title)}</span>
          <span class="metier-tile__count">${count ? `${count} photo${count > 1 ? "s" : ""}` : "À venir"}</span>
        </span>
      </button>`;
  }).join("");

  realisationsGrid.querySelectorAll("[data-open-metier]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.realisationsFilter = btn.dataset.openMetier;
      state.realisationsView = "chantiers";
      renderRealisationsFilters();
      renderRealisations();
      document.getElementById("realisations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderRealisations() {
  if (!realisationsGrid) return;

  if (state.realisationsView === "metiers") {
    renderMetierPastilles();
    return;
  }

  realisationsGrid.classList.remove("realisations__grid--metiers");
  const list = REALISATIONS.filter((r) => r.category === state.realisationsFilter);

  if (!list.length) {
    realisationsGrid.innerHTML = `
      <div class="metier-empty">
        <p>Aucune réalisation publiée pour ce métier pour le moment.</p>
        <button type="button" class="btn btn--ghost" data-back-metiers>← Retour aux métiers</button>
      </div>`;
    realisationsGrid.querySelector("[data-back-metiers]")?.addEventListener("click", () => {
      state.realisationsView = "metiers";
      state.realisationsFilter = "all";
      renderRealisationsFilters();
      renderRealisations();
    });
    return;
  }

  realisationsGrid.innerHTML = list
    .map((r) => {
      const count = r.photos.length;
      const main = coverPhoto(r);
      return `
    <article class="chantier" data-chantier-id="${r.id}">
      <button type="button" class="chantier__media" data-open-gallery="${r.id}" aria-label="Voir les photos — ${r.village}">
        <img class="chantier__img" src="${main}" alt="${r.title} à ${r.village}" loading="lazy" width="640" height="480" />
        <span class="chantier__village">${r.village}</span>
        ${count > 1 ? `<span class="chantier__count">${count} photos</span>` : ""}
      </button>
      <div class="chantier__body">
        <p class="chantier__cat">${categoryLabel(r.category)}</p>
        <h3 class="chantier__title">${r.title}</h3>
        <div class="chantier__actions">
          <button type="button" class="chantier__cta" data-open-gallery="${r.id}">Voir</button>
          <button type="button" class="chantier__devis" data-open-lead="devis" data-project="${r.category}">${t("cta.etude")}</button>
        </div>
      </div>
    </article>`;
    })
    .join("");

  bindOpenLeadButtons(realisationsGrid);
  bindChantierHover();
  bindGalleryOpeners();
}

function bindChantierHover() {
  realisationsGrid.querySelectorAll(".chantier").forEach((card) => {
    const chantier = REALISATIONS.find((r) => r.id === card.dataset.chantierId);
    if (!chantier || chantier.photos.length < 2) return;

    const img = card.querySelector(".chantier__img");
    const order = photosInDisplayOrder(chantier);
    let index = 0;

    const stop = () => {
      const t = hoverTimers.get(card);
      if (t) clearInterval(t);
      hoverTimers.delete(card);
      index = 0;
      if (img) img.src = coverPhoto(chantier);
    };

    const start = () => {
      stop();
      const t = setInterval(() => {
        index = (index + 1) % order.length;
        if (img) img.src = order[index];
      }, 900);
      hoverTimers.set(card, t);
    };

    card.addEventListener("mouseenter", start);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focusin", start);
    card.addEventListener("focusout", (e) => {
      if (!card.contains(e.relatedTarget)) stop();
    });
  });
}

function bindGalleryOpeners() {
  document.querySelectorAll("[data-open-gallery]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chantier = REALISATIONS.find((r) => r.id === btn.dataset.openGallery);
      openLightbox(btn.dataset.openGallery, chantier ? getCoverIndex(chantier) : 0);
    });
  });
}

function openLightbox(chantierId, index = 0) {
  const chantier = REALISATIONS.find((r) => r.id === chantierId);
  if (!chantier) return;
  state.lightbox = chantier;
  state.lightboxIndex = index;
  renderLightbox();
}

function closeLightbox() {
  state.lightbox = null;
  state.lightboxIndex = 0;
  renderLightbox();
}

function renderLightbox() {
  let root = document.getElementById("lightbox");
  if (!root) {
    root = document.createElement("div");
    root.id = "lightbox";
    document.body.appendChild(root);
  }

  if (!state.lightbox) {
    root.hidden = true;
    root.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }

  const chantier = state.lightbox;
  const photos = chantier.photos;
  const i = state.lightboxIndex;
  const photo = photos[i];

  root.hidden = false;
  document.body.style.overflow = "hidden";
  root.innerHTML = `
    <div class="lightbox__backdrop" data-close-lightbox></div>
    <div class="lightbox__dialog" role="dialog" aria-modal="true" aria-label="${chantier.village} — ${chantier.title}">
      <button type="button" class="lightbox__close" data-close-lightbox aria-label="Fermer">×</button>
      <div class="lightbox__head">
        <p class="lightbox__village">${chantier.village}</p>
        <p class="lightbox__meta">${categoryLabel(chantier.category)} · ${i + 1} / ${photos.length}</p>
      </div>
      <div class="lightbox__stage">
        ${photos.length > 1 ? `<button type="button" class="lightbox__nav lightbox__nav--prev" data-lightbox-prev aria-label="Photo précédente">‹</button>` : ""}
        <img src="${photo}" alt="${chantier.title} à ${chantier.village} — photo ${i + 1}" />
        ${photos.length > 1 ? `<button type="button" class="lightbox__nav lightbox__nav--next" data-lightbox-next aria-label="Photo suivante">›</button>` : ""}
      </div>
      <div class="lightbox__thumbs" role="list">
        ${photos
          .map(
            (src, idx) => `
          <button type="button" class="lightbox__thumb ${idx === i ? "is-active" : ""}" data-lightbox-goto="${idx}" aria-label="Photo ${idx + 1}">
            <img src="${src}" alt="" />
          </button>`
          )
          .join("")}
      </div>
      <div class="lightbox__toolbar">
        <button type="button" class="btn btn--primary lightbox__devis" data-open-lead="devis" data-project="${chantier.category}">
          ${t("cta.etude")}
        </button>
      </div>
    </div>`;

  root.querySelectorAll("[data-close-lightbox]").forEach((el) => {
    el.addEventListener("click", closeLightbox);
  });
  root.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => {
    state.lightboxIndex = (state.lightboxIndex - 1 + photos.length) % photos.length;
    renderLightbox();
  });
  root.querySelector("[data-lightbox-next]")?.addEventListener("click", () => {
    state.lightboxIndex = (state.lightboxIndex + 1) % photos.length;
    renderLightbox();
  });
  root.querySelectorAll("[data-lightbox-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lightboxIndex = Number(btn.dataset.lightboxGoto);
      renderLightbox();
    });
  });
  bindOpenLeadButtons(root);
}

document.addEventListener("keydown", (e) => {
  if (!state.lightbox) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") {
    state.lightboxIndex =
      (state.lightboxIndex - 1 + state.lightbox.photos.length) % state.lightbox.photos.length;
    renderLightbox();
  }
  if (e.key === "ArrowRight") {
    state.lightboxIndex = (state.lightboxIndex + 1) % state.lightbox.photos.length;
    renderLightbox();
  }
});

function renderForm() {
  if (!formRoot) return;
  if (isEtudeHubPage() && !state.studyTrade) {
    renderEtudeTradePicker();
    return;
  }
  if (state.done) {
    const projects = activeProjectsForLegal();
    const projectBit = projects.length ? projectPhrase(projects) : "votre projet";
    let successBody =
      state.intent === "rappel"
        ? t("form.success.rappel")
        : t("form.success.etude");
    if (state.complianceEnabled) {
      if (state.intent === "rappel" || state.callbackChecked) {
        successBody = state.lastCallbackDeadlineLocal
          ? `Rappel demandé pour ${escapeHtml(projectBit)}. Un conseiller vous appellera d’ici le <strong>${escapeHtml(state.lastCallbackDeadlineLocal)}</strong> (5 jours ouvrables).`
          : `Rappel demandé pour ${escapeHtml(projectBit)}.`;
      } else {
        successBody = `Demande d’étude bien reçue concernant ${escapeHtml(projectBit)}. Nous vous recontactons au sujet de cette étude.`;
      }
    }
    const rdvLink = isPvLandingPage()
      ? ` · <a href="rdv.html?project=photovoltaique">${t("cta.rdv")}</a>`
      : isClimLandingPage()
        ? ` · <a href="rdv.html?project=climatisation">${t("cta.rdv")}</a>`
        : isPacLandingPage()
          ? ` · <a href="rdv.html?project=pac">${t("cta.rdv")}</a>`
          : isRadiateursLandingPage()
            ? ` · <a href="rdv.html?project=radiateurs">${t("cta.rdv")}</a>`
            : ` · <a href="rdv.html">${t("cta.rdv")}</a>`;
    formRoot.innerHTML = `
      ${studyTradeChromeHtml()}
      <div class="lead-form lead-form--success">
        <div class="lead-form__check" aria-hidden="true">✓</div>
        <h3>${escapeHtml(t("form.success.title"))}</h3>
        <p>${successBody}</p>
        <p class="lead-form__hint">
          ${escapeHtml(t("form.urgent"))} <a href="tel:+33367971961">03 67 97 19 61</a>${rdvLink}
        </p>
      </div>`;
    formRoot.querySelector("[data-clear-study-trade]")?.addEventListener("click", () => {
      clearStudyTrade();
    });
    return;
  }

  if (isPvLandingPage()) {
    renderPvForm();
    return;
  }
  if (isClimLandingPage()) {
    renderClimForm();
    return;
  }

  const projectButtons = PROJECTS.map(
    (p) => `
      <button type="button" class="${state.projects.includes(p.id) ? "is-active" : ""}" data-toggle-project="${p.id}" aria-pressed="${state.projects.includes(p.id)}">
        ${escapeHtml(TRADE_TITLE_KEYS[p.id] ? tradeTitle(p.id) : p.title)}
      </button>`
  ).join("");

  const housingButtons = [
    ["maison", "Maison"],
    ["appartement", "Appartement"],
    ["pro", "Professionnel"],
  ]
    .map(
      ([value, label]) => `
      <button type="button" class="${state.housing === value ? "is-active" : ""}" data-set-housing="${value}">
        ${label}
      </button>`
    )
    .join("");

  const dedicatedTrade = isPacLandingPage() || isRadiateursLandingPage();
  const pacQualify = isPacLandingPage()
    ? `
        <div class="lead-form__pac" aria-label="Qualification pompe à chaleur">
          <p class="lead-form__choice-label">Chauffage actuel <span class="lead-form__req">*</span></p>
          <div class="lead-form__choices">${choiceButtons(PAC_HEATING, "heatingCurrent", "set-heating")}</div>
          <p class="lead-form__choice-label">Surface du logement <span class="lead-form__req">*</span></p>
          <div class="lead-form__choices">${choiceButtons(PAC_SURFACE, "surfaceBand", "set-surface")}</div>
          <p class="lead-form__choice-label">Vous êtes <span class="lead-form__req">*</span></p>
          <div class="lead-form__choices">${choiceButtons(PAC_OWNERSHIP, "ownership", "set-ownership")}</div>
          <p class="lead-form__choice-label">Délai du projet <span class="lead-form__opt">(facultatif)</span></p>
          <div class="lead-form__choices">${choiceButtons(PAC_TIMELINE, "projectTimeline", "set-timeline")}</div>
        </div>`
    : "";

  const logementPanel = `
      <fieldset class="lead-form__panel">
        <legend>Où se situe le logement ?</legend>
        ${
          dedicatedTrade
            ? `<p class="lead-form__hint-inline">Projet : <strong>${escapeHtml(
                isPacLandingPage() ? tradeTitle("pac") : tradeTitle("radiateurs")
              )}</strong></p>`
            : ""
        }
        <label class="lead-form__field">
          <span>Code postal</span>
          <input id="postalCode" inputmode="numeric" maxlength="5" placeholder="Ex. 68100" value="${state.postalCode}" autocomplete="postal-code" />
        </label>
        <div class="lead-form__housing">${housingButtons}</div>
        ${pacQualify}
      </fieldset>`;

  const coordsPanel = `
      <fieldset class="lead-form__panel">
        <legend>${state.intent === "rappel" ? "Coordonnées pour le rappel" : "Coordonnées pour l’étude"}</legend>
        <div class="lead-form__row lead-form__row--2">
          <label class="lead-form__field">
            <span>Prénom</span>
            <input id="firstName" value="${escapeAttr(state.firstName)}" autocomplete="given-name" placeholder="Jean" required />
          </label>
          <label class="lead-form__field">
            <span>Nom</span>
            <input id="lastName" value="${escapeAttr(state.lastName)}" autocomplete="family-name" placeholder="Dupont" required />
          </label>
        </div>
        <label class="lead-form__field">
          <span>Téléphone</span>
          <input id="phone" type="tel" value="${escapeAttr(state.phone)}" autocomplete="tel" placeholder="06 12 34 56 78" />
        </label>
        <label class="lead-form__field">
          <span>Email (optionnel)</span>
          <input id="email" type="email" value="${escapeAttr(state.email)}" autocomplete="email" placeholder="vous@email.fr" />
        </label>
        ${
          state.intent === "devis"
            ? `<label class="lead-form__field">
                <span>Précisions (optionnel)</span>
                <textarea id="message" rows="3" placeholder="Surface, équipement actuel…">${escapeHtml(state.message)}</textarea>
              </label>`
            : ""
        }
      </fieldset>`;

  let panel = "";
  if (dedicatedTrade) {
    panel = state.step === 0 ? logementPanel : coordsPanel;
  } else if (state.step === 0) {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Quels corps de métier ?</legend>
        <p class="lead-form__hint-inline">Vous pouvez en sélectionner plusieurs.</p>
        <div class="lead-form__projects">${projectButtons}</div>
      </fieldset>`;
  } else if (state.step === 1) {
    panel = logementPanel;
  } else {
    panel = coordsPanel;
  }

  const stepsList = formSteps();
  const steps = stepsList
    .map(
      (label, i) => `
      <li class="${i === state.step ? "is-current" : i < state.step ? "is-done" : ""}">
        <span>${i + 1}</span>${label}
      </li>`
    )
    .join("");

  formRoot.innerHTML = `
    ${studyTradeChromeHtml()}
    <form class="lead-form" id="lead-form" novalidate>
      <div class="lead-form__top">
        ${intentTabsHtml()}
        <ol class="lead-form__steps">${steps}</ol>
      </div>
      ${panel}
      ${state.step === stepsList.length - 1 ? lastStepLegalHtml() : ""}
      ${state.error ? `<p class="lead-form__error" role="alert">${state.error}</p>` : ""}
      <div class="lead-form__actions">
        ${state.step > 0 ? `<button type="button" class="btn btn--ghost" data-back>Retour</button>` : ""}
        ${
          state.step < stepsList.length - 1
            ? `<button type="button" class="btn btn--primary" data-next>${t("form.continue")}</button>`
            : `<button type="submit" class="btn btn--primary" ${state.submitting ? "disabled" : ""}>${submitButtonLabel()}</button>`
        }
      </div>
      <p class="lead-form__legal">Entreprise alsacienne RGE. Aucune estimation automatique de tarif.</p>
    </form>`;

  bindFormEvents();
}

function renderPvForm() {
  let panel = "";
  if (state.step === 0) {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Votre maison</legend>
        <label class="lead-form__field">
          <span>Code postal <span class="lead-form__req">*</span></span>
          <input id="postalCode" inputmode="numeric" maxlength="5" placeholder="Ex. 67460" value="${state.postalCode}" autocomplete="postal-code" />
        </label>
        <p class="lead-form__choice-label">Type de toiture <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(PV_ROOF, "roofType", "set-roof")}</div>
        <p class="lead-form__choice-label">Êtes-vous propriétaire&nbsp;? <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(PV_OWNERSHIP, "ownership", "set-ownership")}</div>
      </fieldset>`;
  } else if (state.step === 1) {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Votre consommation</legend>
        <p class="lead-form__hint-inline">Renseignez l’un des deux champs, les deux, ou indiquez que vous ne les connaissez pas.</p>
        <label class="lead-form__field">
          <span>Facture électrique moyenne (€ / mois)</span>
          <input id="billMonthlyEur" inputmode="decimal" placeholder="Ex. 120" value="${escapeAttr(state.billMonthlyEur)}" ${state.consumptionUnknown ? "disabled" : ""} />
        </label>
        <label class="lead-form__field">
          <span>Consommation annuelle (kWh)</span>
          <input id="annualKwh" inputmode="numeric" placeholder="Ex. 8500" value="${escapeAttr(state.annualKwh)}" ${state.consumptionUnknown ? "disabled" : ""} />
        </label>
        <button type="button" class="lead-form__opt-toggle ${state.consumptionUnknown ? "is-active" : ""}" data-toggle-consumption-unknown>
          Je ne connais pas ma consommation
        </button>
      </fieldset>`;
  } else if (state.step === 2) {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Votre projet</legend>
        <p class="lead-form__choice-label">Orientation souhaitée <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(PV_BATTERY, "batteryChoice", "set-battery")}</div>
        <p class="lead-form__choice-label">Délai envisagé pour les travaux <span class="lead-form__opt">(facultatif)</span></p>
        <div class="lead-form__choices">${choiceButtons(PAC_TIMELINE, "projectTimeline", "set-timeline")}</div>
      </fieldset>`;
  } else {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Vos coordonnées</legend>
        <div class="lead-form__row lead-form__row--2">
          <label class="lead-form__field">
            <span>Prénom</span>
            <input id="firstName" value="${escapeAttr(state.firstName)}" autocomplete="given-name" placeholder="Jean" required />
          </label>
          <label class="lead-form__field">
            <span>Nom</span>
            <input id="lastName" value="${escapeAttr(state.lastName)}" autocomplete="family-name" placeholder="Dupont" required />
          </label>
        </div>
        <label class="lead-form__field">
          <span>Téléphone</span>
          <input id="phone" type="tel" value="${escapeAttr(state.phone)}" autocomplete="tel" placeholder="06 12 34 56 78" />
        </label>
        <label class="lead-form__field">
          <span>E-mail (optionnel)</span>
          <input id="email" type="email" value="${escapeAttr(state.email)}" autocomplete="email" placeholder="vous@email.fr" />
        </label>
        <label class="lead-form__field">
          <span>Message (optionnel)</span>
          <textarea id="message" rows="2" placeholder="Précisions utiles…">${escapeHtml(state.message)}</textarea>
        </label>
        <p class="lead-form__hint-inline">
          Préférez un créneau&nbsp;?
          <a href="rdv.html?project=photovoltaique">${t("cta.rdv")}</a>
        </p>
      </fieldset>`;
  }

  const stepsList = PV_STEPS;
  const steps = stepsList
    .map(
      (label, i) => `
      <li class="${i === state.step ? "is-current" : i < state.step ? "is-done" : ""}">
        <span>${i + 1}</span>${label}
      </li>`
    )
    .join("");

  formRoot.innerHTML = `
    ${studyTradeChromeHtml()}
    <form class="lead-form lead-form--pv" id="lead-form" novalidate>
      <div class="lead-form__top">
        ${intentTabsHtml()}
        <ol class="lead-form__steps">${steps}</ol>
      </div>
      ${panel}
      ${state.step === stepsList.length - 1 ? lastStepLegalHtml() : ""}
      ${state.error ? `<p class="lead-form__error" role="alert">${state.error}</p>` : ""}
      <div class="lead-form__actions">
        ${state.step > 0 ? `<button type="button" class="btn btn--ghost" data-back>Retour</button>` : ""}
        ${
          state.step < stepsList.length - 1
            ? `<button type="button" class="btn btn--primary" data-next>${t("form.continue")}</button>`
            : `<button type="submit" class="btn btn--primary" ${state.submitting ? "disabled" : ""}>${submitButtonLabel()}</button>`
        }
      </div>
      <p class="lead-form__legal">Aucune estimation automatique de puissance, de prix ou d’économies. Entreprise RGE.</p>
    </form>`;

  bindFormEvents();
}

function renderClimForm() {
  state.climSystemHint = deduceClimSystemHint(state.roomsBand);
  let panel = "";
  if (state.step === 0) {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Mon logement</legend>
        <p class="lead-form__choice-label">Type de logement <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(CLIM_HOUSING, "housing", "set-housing")}</div>
        <p class="lead-form__choice-label">Nombre de pièces à climatiser <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(CLIM_ROOMS, "roomsBand", "set-rooms")}</div>
        <p class="lead-form__choice-label">Surface approximative <span class="lead-form__opt">(facultatif)</span></p>
        <div class="lead-form__choices">${choiceButtons(CLIM_SURFACE, "climSurfaceBand", "set-clim-surface")}</div>
        <p class="lead-form__choice-label">Installation existante <span class="lead-form__opt">(facultatif)</span></p>
        <div class="lead-form__choices">${choiceButtons(CLIM_EXISTING, "climExisting", "set-clim-existing")}</div>
      </fieldset>`;
  } else if (state.step === 1) {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>Mon projet</legend>
        <p class="lead-form__choice-label">Votre besoin <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(CLIM_NEED, "climNeed", "set-clim-need")}</div>
        <p class="lead-form__choice-label">Délai souhaité <span class="lead-form__req">*</span></p>
        <div class="lead-form__choices">${choiceButtons(CLIM_TIMELINE, "projectTimeline", "set-timeline")}</div>
        <p class="lead-form__hint-inline lead-form__hint-inline--soft">${escapeHtml(
          climSystemHintLabel(state.climSystemHint)
        )} Indication non imposée — confirmation en étude technique.</p>
      </fieldset>`;
  } else {
    panel = `
      <fieldset class="lead-form__panel">
        <legend>${state.intent === "rappel" ? "Coordonnées pour le rappel" : "Coordonnées pour l’étude"}</legend>
        <div class="lead-form__row lead-form__row--2">
          <label class="lead-form__field">
            <span>Prénom</span>
            <input id="firstName" value="${escapeAttr(state.firstName)}" autocomplete="given-name" placeholder="Jean" required />
          </label>
          <label class="lead-form__field">
            <span>Nom</span>
            <input id="lastName" value="${escapeAttr(state.lastName)}" autocomplete="family-name" placeholder="Dupont" required />
          </label>
        </div>
        <label class="lead-form__field">
          <span>Code postal <span class="lead-form__req">*</span></span>
          <input id="postalCode" inputmode="numeric" maxlength="5" placeholder="Ex. 67460" value="${escapeAttr(state.postalCode)}" autocomplete="postal-code" />
        </label>
        <label class="lead-form__field">
          <span>Téléphone</span>
          <input id="phone" type="tel" value="${escapeAttr(state.phone)}" autocomplete="tel" placeholder="06 12 34 56 78" />
        </label>
        <label class="lead-form__field">
          <span>Email</span>
          <input id="email" type="email" value="${escapeAttr(state.email)}" autocomplete="email" placeholder="vous@email.fr" />
        </label>
        <p class="lead-form__hint-inline">
          Préférez un créneau&nbsp;?
          <a href="rdv.html?project=climatisation">${t("cta.rdv")}</a>
        </p>
      </fieldset>`;
  }

  const stepsList = CLIM_STEPS;
  const steps = stepsList
    .map(
      (label, i) => `
      <li class="${i === state.step ? "is-current" : i < state.step ? "is-done" : ""}">
        <span>${i + 1}</span>${label}
      </li>`
    )
    .join("");

  formRoot.innerHTML = `
    ${studyTradeChromeHtml()}
    <form class="lead-form lead-form--clim" id="lead-form" novalidate>
      <div class="lead-form__top">
        ${intentTabsHtml()}
        <ol class="lead-form__steps">${steps}</ol>
      </div>
      ${panel}
      ${state.step === stepsList.length - 1 ? lastStepLegalHtml() : ""}
      ${state.error ? `<p class="lead-form__error" role="alert">${state.error}</p>` : ""}
      <div class="lead-form__actions">
        ${state.step > 0 ? `<button type="button" class="btn btn--ghost" data-back>Retour</button>` : ""}
        ${
          state.step < stepsList.length - 1
            ? `<button type="button" class="btn btn--primary" data-next>${t("form.continue")}</button>`
            : `<button type="submit" class="btn btn--primary" ${state.submitting ? "disabled" : ""}>${submitButtonLabel()}</button>`
        }
      </div>
      <p class="lead-form__legal">Aucune estimation automatique de tarif, de puissance ou d’économies. Entreprise alsacienne.</p>
    </form>`;

  bindFormEvents();
}

function bindFormEvents() {
  formRoot.onclick = (e) => {
    if (e.target.closest("[data-clear-study-trade]")) {
      e.preventDefault();
      clearStudyTrade();
      return;
    }
  };

  formRoot.querySelectorAll("[data-set-intent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.intent = btn.dataset.setIntent;
      state.callbackChecked = false;
      state.error = "";
      renderForm();
    });
  });

  formRoot.querySelector("#callbackChecked")?.addEventListener("change", (e) => {
    state.callbackChecked = !!e.target.checked;
    state.error = "";
  });

  formRoot.querySelectorAll("[data-toggle-project]").forEach((btn) => {
    btn.addEventListener("click", () => toggleProject(btn.dataset.toggleProject));
  });

  formRoot.querySelectorAll("[data-set-housing]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.housing = btn.dataset.setHousing;
      state.error = "";
      renderForm();
    });
  });

  const choiceBindings = [
    ["set-heating", "heatingCurrent"],
    ["set-surface", "surfaceBand"],
    ["set-ownership", "ownership"],
    ["set-timeline", "projectTimeline"],
    ["set-roof", "roofType"],
    ["set-battery", "batteryChoice"],
    ["set-rooms", "roomsBand"],
    ["set-clim-surface", "climSurfaceBand"],
    ["set-clim-existing", "climExisting"],
    ["set-clim-need", "climNeed"],
  ];
  choiceBindings.forEach(([attr, key]) => {
    formRoot.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.getAttribute(`data-${attr}`) || "";
        state[key] = state[key] === value ? "" : value;
        if (key === "roomsBand") {
          state.climSystemHint = deduceClimSystemHint(state.roomsBand);
        }
        state.error = "";
        renderForm();
      });
    });
  });

  formRoot.querySelector("[data-toggle-consumption-unknown]")?.addEventListener("click", () => {
    state.consumptionUnknown = !state.consumptionUnknown;
    if (state.consumptionUnknown) {
      state.billMonthlyEur = "";
      state.annualKwh = "";
    }
    state.error = "";
    renderForm();
  });

  const postal = formRoot.querySelector("#postalCode");
  if (postal) {
    postal.addEventListener("input", (e) => {
      state.postalCode = e.target.value.replace(/\D/g, "").slice(0, 5);
      e.target.value = state.postalCode;
    });
  }

  ["firstName", "lastName", "phone", "email", "message", "billMonthlyEur", "annualKwh"].forEach(
    (id) => {
      const el = formRoot.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener("input", (e) => {
        if (id === "billMonthlyEur") {
          state.billMonthlyEur = String(e.target.value || "").replace(/[^\d.,]/g, "").slice(0, 8);
          e.target.value = state.billMonthlyEur;
          return;
        }
        if (id === "annualKwh") {
          state.annualKwh = String(e.target.value || "").replace(/\D/g, "").slice(0, 7);
          e.target.value = state.annualKwh;
          return;
        }
        state[id] = e.target.value;
      });
    }
  );

  formRoot.querySelector("[data-back]")?.addEventListener("click", () => {
    state.step = Math.max(0, state.step - 1);
    state.error = "";
    renderForm();
  });

  formRoot.querySelector("[data-next]")?.addEventListener("click", () => {
    if (isPvLandingPage()) {
      if (state.step === 0) {
        if (!/^\d{5}$/.test(state.postalCode)) {
          state.error = "Indiquez un code postal à 5 chiffres.";
          renderForm();
          return;
        }
        if (!state.roofType) {
          state.error = "Indiquez le type de toiture.";
          renderForm();
          return;
        }
        if (!state.ownership) {
          state.error = "Indiquez si vous êtes propriétaire.";
          renderForm();
          return;
        }
      } else if (state.step === 1) {
        const hasBill = String(state.billMonthlyEur || "").trim().length > 0;
        const hasKwh = String(state.annualKwh || "").trim().length > 0;
        if (!state.consumptionUnknown && !hasBill && !hasKwh) {
          state.error =
            "Indiquez une facture ou une consommation, ou cochez « Je ne connais pas ma consommation ».";
          renderForm();
          return;
        }
      } else if (state.step === 2) {
        if (!state.batteryChoice) {
          state.error = "Indiquez votre préférence (avec / sans batterie, ou conseil).";
          renderForm();
          return;
        }
      }
      state.step += 1;
      state.error = "";
      renderForm();
      return;
    }

    if (isClimLandingPage()) {
      if (state.step === 0) {
        if (!state.housing) {
          state.error = "Précisez le type de logement.";
          renderForm();
          return;
        }
        if (!state.roomsBand) {
          state.error = "Indiquez le nombre de pièces à climatiser.";
          renderForm();
          return;
        }
      } else if (state.step === 1) {
        if (!state.climNeed) {
          state.error = "Indiquez votre besoin (rafraîchir, chauffer et rafraîchir, ou conseil).";
          renderForm();
          return;
        }
        if (!state.projectTimeline) {
          state.error = "Indiquez le délai souhaité.";
          renderForm();
          return;
        }
      }
      state.step += 1;
      state.error = "";
      renderForm();
      return;
    }

    if (isPacLandingPage() || isRadiateursLandingPage()) {
      if (isPacLandingPage() && state.projects.length === 0) state.projects = ["pac"];
      if (isRadiateursLandingPage() && state.projects.length === 0) {
        state.projects = ["radiateurs"];
      }
      if (state.step === 0) {
        if (!/^\d{5}$/.test(state.postalCode)) {
          state.error = "Indiquez un code postal à 5 chiffres.";
          renderForm();
          return;
        }
        if (!state.housing) {
          state.error = "Précisez le type de logement.";
          renderForm();
          return;
        }
        if (isPacLandingPage()) {
          if (!state.heatingCurrent) {
            state.error = "Indiquez votre chauffage actuel.";
            renderForm();
            return;
          }
          if (!state.surfaceBand) {
            state.error = "Indiquez la surface du logement.";
            renderForm();
            return;
          }
          if (!state.ownership) {
            state.error = "Indiquez si vous êtes propriétaire ou locataire.";
            renderForm();
            return;
          }
        }
      }
      state.step += 1;
      state.error = "";
      renderForm();
      return;
    }

    if (state.step === 0 && state.projects.length === 0) {
      state.error = "Sélectionnez au moins un corps de métier.";
      renderForm();
      return;
    }
    if (state.step === 1) {
      if (!/^\d{5}$/.test(state.postalCode)) {
        state.error = "Indiquez un code postal à 5 chiffres.";
        renderForm();
        return;
      }
      if (!state.housing) {
        state.error = "Précisez le type de logement.";
        renderForm();
        return;
      }
    }
    state.step += 1;
    state.error = "";
    renderForm();
  });

  formRoot.querySelector("#lead-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.submitting) return;
    const firstName = state.firstName.trim();
    const lastName = state.lastName.trim();
    if (firstName.length < 2) {
      state.error = "Indiquez votre prénom.";
      renderForm();
      return;
    }
    if (lastName.length < 2) {
      state.error = "Indiquez votre nom.";
      renderForm();
      return;
    }
    const phone = normalizeFrenchPhone(state.phone);
    if (!phone) {
      state.error = "Indiquez un numéro de téléphone français valide.";
      renderForm();
      return;
    }
    state.phone = phone;

    if (isClimLandingPage()) {
      if (!/^\d{5}$/.test(state.postalCode)) {
        state.error = "Indiquez un code postal à 5 chiffres.";
        renderForm();
        return;
      }
      if (!state.housing || !state.roomsBand || !state.climNeed || !state.projectTimeline) {
        state.error = "Complétez les étapes du diagnostic avant l’envoi.";
        renderForm();
        return;
      }
    }

    if (isPacLandingPage() || isRadiateursLandingPage()) {
      if (!/^\d{5}$/.test(state.postalCode)) {
        state.error = "Indiquez un code postal à 5 chiffres.";
        renderForm();
        return;
      }
      if (!state.housing) {
        state.error = "Précisez le type de logement.";
        renderForm();
        return;
      }
      if (isPacLandingPage()) {
        if (!state.heatingCurrent || !state.surfaceBand || !state.ownership) {
          state.error = "Complétez la qualification logement avant l’envoi.";
          renderForm();
          return;
        }
      }
    }

    // Étude ≠ autorisation d’appel : case rappel jamais forcée hors intent rappel / flag ON
    if (state.intent === "devis" && !state.complianceEnabled) {
      state.callbackChecked = false;
    }

    if (state.complianceEnabled) {
      const projects = activeProjectsForLegal();
      if (state.intent === "rappel" && !state.callbackChecked) {
        state.error = "Cochez la case pour demander expressément un rappel téléphonique.";
        renderForm();
        return;
      }
      if ((state.intent === "rappel" || state.callbackChecked) && projects.length !== 1) {
        state.error = "Pour un rappel, sélectionnez un seul projet identifiable.";
        renderForm();
        return;
      }
    }

    state.submitting = true;
    state.error = "";
    renderForm();

    try {
      const payload = {
        intent: state.intent,
        projects: state.projects,
        postalCode: state.postalCode,
        housing: state.housing,
        firstName,
        lastName,
        phone: state.phone,
        email: state.email.trim(),
        message: state.message.trim(),
        pagePath: location.pathname,
        callbackChecked: !!state.callbackChecked,
        uiActionLabel:
          state.intent === "rappel"
            ? "Oui, je demande à être rappelé(e)"
            : "Envoyer ma demande d’étude",
      };
      if (isPacLandingPage()) {
        payload.projects = ["pac"];
        payload.heatingCurrent = state.heatingCurrent;
        payload.surfaceBand = state.surfaceBand;
        payload.ownership = state.ownership;
        if (state.projectTimeline) payload.projectTimeline = state.projectTimeline;
        payload.sourceLabel = "Pompe à chaleur";
      }
      if (isRadiateursLandingPage()) {
        payload.projects = ["radiateurs"];
        payload.sourceLabel = "Radiateurs";
      }
      if (isPvLandingPage()) {
        payload.projects = ["photovoltaique"];
        payload.housing = "maison";
        payload.roofType = state.roofType;
        payload.ownership = state.ownership;
        payload.batteryChoice = state.batteryChoice;
        payload.consumptionUnknown = state.consumptionUnknown;
        if (state.billMonthlyEur) payload.billMonthlyEur = state.billMonthlyEur;
        if (state.annualKwh) payload.annualKwh = state.annualKwh;
        if (state.projectTimeline) payload.projectTimeline = state.projectTimeline;
        payload.sourceLabel = "Photovoltaïque";
      }
      if (isClimLandingPage()) {
        payload.projects = ["climatisation"];
        payload.roomsBand = state.roomsBand;
        payload.climNeed = state.climNeed;
        payload.climSystemHint = deduceClimSystemHint(state.roomsBand);
        if (state.climSurfaceBand) payload.climSurfaceBand = state.climSurfaceBand;
        if (state.climExisting) payload.climExisting = state.climExisting;
        if (state.projectTimeline) payload.projectTimeline = state.projectTimeline;
        payload.sourceLabel = "Climatisation";
      }
      // Provenance ajoutée juste avant l'envoi, et seulement ici : les champs
      // du formulaire gardent la main, `attribution.fields()` n'ajoute que
      // `attribution` et `attributionFirst`. Sans signal publicitaire, il
      // n'ajoute rien et la demande reste un accès direct.
      Object.assign(payload, attribution.fields());
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || res.status !== 201 || !data.ok) {
        throw new Error(data.error || "Envoi impossible. Réessayez ou appelez-nous.");
      }
      state.done = true;
      state.lastCallbackDeadlineLocal = data.callbackDeadlineLocal || "";
      const leadType =
        state.intent === "rappel" || state.callbackChecked ? "rappel" : "devis";
      const project = resolveLeadProject({
        isClim: isClimLandingPage(),
        isPv: isPvLandingPage(),
        isPac: isPacLandingPage(),
        isRadiateurs: isRadiateursLandingPage(),
        projects: payload.projects,
      });
      // source_page = page courante si connue — pas de provenance inventée
      pushConversionEvent(
        "generate_lead",
        buildGenerateLeadPayload({
          leadType,
          pagePath: location.pathname,
          project,
          sourcePage: location.pathname,
        }),
        data.id ? `generate_lead:${data.id}` : `generate_lead:${leadType}:${Date.now()}`
      );
    } catch (err) {
      state.error = err.message || "Envoi impossible. Réessayez ou appelez-nous.";
    } finally {
      state.submitting = false;
      renderForm();
    }
  });
}

/** Accepte 06…, 03…, +33…, 0033…, espaces / points / tirets */
function normalizeFrenchPhone(value) {
  let digits = String(value || "").replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("0033")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("33") && digits.length >= 11) {
    digits = digits.slice(2);
  }
  if (digits.length === 9 && /^[1-9]/.test(digits)) {
    digits = `0${digits}`;
  }

  return /^0[1-9]\d{8}$/.test(digits) ? digits : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

async function loadAgenda() {
  rdvState.loading = true;
  rdvState.error = "";
  renderRdv();
  try {
    const res = await fetch(`/api/agenda?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Agenda indisponible");
    rdvState.days = data.days || [];
    ensureSelectedDay();
  } catch (err) {
    rdvState.error = err.message || "Agenda indisponible";
    rdvState.days = [];
  } finally {
    rdvState.loading = false;
    renderRdv();
  }
}

function formatRdvLabel(date, time, dayLabel) {
  return `${dayLabel} · ${time}`;
}

function isRdvPreview() {
  return rdvRoot?.dataset.mode === "preview";
}

/** Agenda page RDV : semaines navigables, puis heures (matin / après-midi / soir). */
function bookCalendarHtml(days) {
  ensureSelectedDay();
  const weeks = groupAgendaWeeks(days);
  if (!weeks.length) return "";
  const weekIndex = Math.min(Math.max(0, rdvState.weekIndex || 0), weeks.length - 1);
  rdvState.weekIndex = weekIndex;
  const week = weeks[weekIndex];
  const weekDays = week.days;
  let selected = weekDays.find((d) => d.date === rdvState.selectedDay);
  if (!selected) {
    selected = weekDays[0];
    rdvState.selectedDay = selected.date;
  }

  const morning = new Set(["09:00", "10:00", "11:00"]);
  const afternoon = new Set(["14:00", "15:00", "16:00"]);
  // 17:00 – 19:00 = soir

  const dayChips = weekDays
    .map((day) => {
      const { weekday, dateRest } = parseDayParts(day.label);
      const active = day.date === selected.date;
      return `
        <button
          type="button"
          class="cal-day ${active ? "is-selected" : ""}"
          data-rdv-select-day="${day.date}"
          aria-pressed="${active ? "true" : "false"}"
        >
          <span class="cal-day__weekday">${escapeHtml(weekday)}</span>
          <span class="cal-day__date">${escapeHtml(dateRest)}</span>
        </button>`;
    })
    .join("");

  const morningSlots = [];
  const afternoonSlots = [];
  const eveningSlots = [];
  selected.slots.forEach((slot) => {
    const status = slot.status === "busy" ? "is-busy" : "is-free";
    const disabled = status === "is-busy" ? "disabled aria-disabled=\"true\"" : "";
    const btn = `<button type="button" class="cal__slot ${status}" ${disabled} data-rdv-date="${selected.date}" data-rdv-time="${slot.time}" data-rdv-label="${escapeAttr(selected.label)}"><span class="cal__slot-time">${slot.time}</span></button>`;
    if (morning.has(slot.time)) morningSlots.push(btn);
    else if (afternoon.has(slot.time)) afternoonSlots.push(btn);
    else eveningSlots.push(btn);
  });

  const canPrev = weekIndex > 0;
  const canNext = weekIndex < weeks.length - 1;
  const range = weekRangeLabel(weekDays);

  return `
    <div class="rdv-book">
      <div class="rdv-book__step">
        <p class="rdv-book__step-label"><span>1</span> Choisir un jour</p>
        <div class="cal-week-nav">
          <button type="button" class="cal-week-nav__btn" data-rdv-week="-1" ${canPrev ? "" : "disabled"} aria-label="Semaine précédente">←</button>
          <p class="cal-week-nav__label">
            <span class="cal-week-nav__kicker">Semaine ${weekIndex + 1}/${weeks.length}</span>
            <strong>${escapeHtml(range)}</strong>
          </p>
          <button type="button" class="cal-week-nav__btn" data-rdv-week="1" ${canNext ? "" : "disabled"} aria-label="Semaine suivante">→</button>
        </div>
        <div class="cal-days cal-days--week" role="listbox" aria-label="Jours de la semaine">${dayChips}</div>
      </div>
      <div class="rdv-book__step">
        <p class="rdv-book__step-label">
          <span>2</span> Choisir une heure
          <em>${escapeHtml(selected.label)}</em>
        </p>
        <div class="cal-times">
          ${
            morningSlots.length
              ? `<div class="cal-times__group">
                  <p class="cal-times__label">Matin</p>
                  <div class="cal-times__grid">${morningSlots.join("")}</div>
                </div>`
              : ""
          }
          ${
            afternoonSlots.length
              ? `<div class="cal-times__group">
                  <p class="cal-times__label">Après-midi</p>
                  <div class="cal-times__grid">${afternoonSlots.join("")}</div>
                </div>`
              : ""
          }
          ${
            eveningSlots.length
              ? `<div class="cal-times__group">
                  <p class="cal-times__label">Soir</p>
                  <div class="cal-times__grid">${eveningSlots.join("")}</div>
                </div>`
              : ""
          }
        </div>
      </div>
      <p class="rdv-book__hours-note">
        Réservation en ligne : jours ouvrés, 9h00 – 19h00, jusqu’à 3 semaines à l’avance.
        Accueil téléphonique : Lun.–Ven. 9h–12h / 13h–17h.
      </p>
    </div>`;
}

/** Ancien rendu colonnes (preview éventuel) — dispo inchangée. */
function calendarHtml(days) {
  const morning = new Set(["09:00", "10:00", "11:00"]);
  return `
    <div class="cal" role="grid" aria-label="Créneaux disponibles">
      ${days
        .map((day, dayIndex) => {
          const { weekday, dateRest } = parseDayParts(day.label);
          let sawAfternoon = false;
          const slotsMarkup = day.slots
            .map((slot) => {
              let breakHtml = "";
              if (!morning.has(slot.time) && !sawAfternoon) {
                sawAfternoon = true;
                breakHtml = `<span class="cal__break" aria-hidden="true"><span>Après-midi</span></span>`;
              }
              return `${breakHtml}<button type="button" class="cal__slot is-free" data-rdv-date="${day.date}" data-rdv-time="${slot.time}" data-rdv-label="${escapeAttr(day.label)}"><span class="cal__slot-time">${slot.time}</span></button>`;
            })
            .join("");
          return `
        <div class="cal__col" role="row" style="--cal-i:${dayIndex}">
          <div class="cal__day">
            <span class="cal__weekday">${escapeHtml(weekday)}</span>
            <span class="cal__date">${escapeHtml(dateRest)}</span>
          </div>
          <span class="cal__break cal__break--first" aria-hidden="true"><span>Matin</span></span>
          ${slotsMarkup}
        </div>`;
        })
        .join("")}
    </div>`;
}

function closeRdvModal() {
  rdvState.modalOpen = false;
  if (!rdvState.done) {
    rdvState.selected = null;
    rdvState.error = "";
  }
  document.body.style.overflow = "";
  renderRdv();
}

function openRdvModal(slot) {
  rdvState.selected = slot;
  rdvState.modalOpen = true;
  rdvState.done = false;
  rdvState.doneInfo = null;
  rdvState.error = "";
  document.body.style.overflow = "hidden";
  renderRdv();
}

function rdvModalHtml() {
  const picked = rdvState.selected
    ? formatRdvLabel(rdvState.selected.date, rdvState.selected.time, rdvState.selected.label)
    : "";
  const projectOptions = PROJECTS.map(
    (p) =>
      `<option value="${p.id}" ${rdvState.project === p.id ? "selected" : ""}>${p.title}</option>`
  ).join("");
  const currentProjectTitle = projectTitle(rdvState.project);

  if (rdvState.done && rdvState.doneInfo) {
    return `
      <div class="rdv-modal" id="rdv-modal" role="dialog" aria-modal="true" aria-labelledby="rdv-modal-title">
        <div class="rdv-modal__backdrop" data-rdv-close></div>
        <div class="rdv-modal__panel rdv-modal__panel--success">
          <button type="button" class="rdv-modal__close" data-rdv-close aria-label="Fermer">×</button>
          <div class="rdv__success">
            <p class="rdv__success-eyebrow">C’est noté</p>
            <h3 id="rdv-modal-title">Rendez-vous confirmé</h3>
            <dl class="rdv__success-recap">
              <div>
                <dt>Date</dt>
                <dd>${escapeHtml(rdvState.doneInfo.dayLabel || rdvState.doneInfo.label)}</dd>
              </div>
              <div>
                <dt>Heure</dt>
                <dd>${escapeHtml(rdvState.doneInfo.time || "")}</dd>
              </div>
              <div>
                <dt>Projet</dt>
                <dd>${escapeHtml(rdvState.doneInfo.projectTitle || "À préciser")}</dd>
              </div>
            </dl>
            <p class="rdv__success-copy">
              Votre créneau est enregistré. Un conseiller MKL vous recontactera.
            </p>
            <p class="rdv__success-phone">
              ${t("form.urgent")} <a href="tel:+33367971961">03 67 97 19 61</a>
            </p>
            <button type="button" class="btn btn--primary rdv__success-close" data-rdv-close>
              Fermer
            </button>
            <button type="button" class="btn btn--ghost" id="rdv-another">
              Nouveau créneau
            </button>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="rdv-modal" id="rdv-modal" role="dialog" aria-modal="true" aria-labelledby="rdv-modal-title">
      <div class="rdv-modal__backdrop" data-rdv-close></div>
      <div class="rdv-modal__panel rdv-modal__panel--sheet">
        <button type="button" class="rdv-modal__close" data-rdv-close aria-label="Fermer">×</button>
        <h3 id="rdv-modal-title">Confirmer le rendez-vous</h3>
        <div class="rdv__recap" aria-label="Récapitulatif">
          <p class="rdv__recap-slot">
            <span class="rdv__recap-label">Créneau</span>
            <strong>${escapeHtml(picked)}</strong>
          </p>
          <p class="rdv__recap-project">
            <span class="rdv__recap-label">Projet</span>
            <strong>${escapeHtml(currentProjectTitle || "À préciser")}</strong>
          </p>
        </div>
        <form class="rdv__form rdv__form--modal" id="rdv-form">
          <div class="rdv__fields">
            <div class="rdv__fields-row">
              <label>
                Prénom
                <input name="firstName" required value="${escapeAttr(rdvState.firstName)}" autocomplete="given-name" placeholder="Jean" />
              </label>
              <label>
                Nom
                <input name="lastName" required value="${escapeAttr(rdvState.lastName)}" autocomplete="family-name" placeholder="Dupont" />
              </label>
            </div>
            <label>
              Téléphone
              <input name="phone" type="tel" required value="${escapeAttr(rdvState.phone)}" autocomplete="tel" placeholder="06 12 34 56 78" />
            </label>
            <label>
              E-mail (optionnel)
              <input name="email" type="email" value="${escapeAttr(rdvState.email)}" autocomplete="email" />
            </label>
            <label>
              Projet
              <select name="project" id="rdv-project">
                <option value="">À préciser</option>
                ${projectOptions}
              </select>
            </label>
            ${rdvPacChoicesHtml()}
            ${rdvPvChoicesHtml()}
            ${rdvClimChoicesHtml()}
            ${
              state.complianceEnabled
                ? `<fieldset class="rdv__meeting-type">
              <legend>Type de rendez-vous</legend>
              <label class="rdv__radio"><input type="radio" name="meetingType" value="telephone" ${rdvState.meetingType === "telephone" ? "checked" : ""} /> Téléphonique</label>
              <label class="rdv__radio"><input type="radio" name="meetingType" value="physique" ${rdvState.meetingType === "physique" ? "checked" : ""} /> Physique (sur site / agence)</label>
            </fieldset>
            <p class="rdv__legal-info">${escapeHtml(rdvContactText(rdvState.project ? [rdvState.project] : ["autre"]))}</p>
            <p class="rdv__legal-rgpd">${escapeHtml(RGPD_SHORT)} <a href="${PRIVACY_HREF}" target="_blank" rel="noopener">Politique de confidentialité</a>.</p>`
                : ""
            }
            <label>
              Message (optionnel)
              <textarea name="note" rows="2" placeholder="Adresse, disponibilité…">${escapeHtml(rdvState.note)}</textarea>
            </label>
          </div>
          ${rdvState.error ? `<p class="rdv__error" role="alert">${escapeHtml(rdvState.error)}</p>` : ""}
          <button type="submit" class="btn btn--primary rdv__submit" ${rdvState.submitting ? "disabled" : ""}>
            ${rdvState.submitting ? "Confirmation…" : state.complianceEnabled ? "Confirmer mon rendez-vous" : "Confirmer le rendez-vous"}
          </button>
        </form>
      </div>
    </div>`;
}

function bindRdvModal() {
  const modal = document.getElementById("rdv-modal");
  if (!modal) return;

  modal.querySelectorAll("[data-rdv-close]").forEach((el) => {
    el.addEventListener("click", () => {
      rdvState.done = false;
      rdvState.doneInfo = null;
      closeRdvModal();
    });
  });

  modal.querySelector("#rdv-another")?.addEventListener("click", () => {
    rdvState.done = false;
    rdvState.doneInfo = null;
    rdvState.selected = null;
    rdvState.modalOpen = false;
    document.body.style.overflow = "";
    loadAgenda();
  });

  const form = modal.querySelector("#rdv-form");
  const projectSelect = modal.querySelector("#rdv-project");
  projectSelect?.addEventListener("change", () => {
    const next = projectSelect.value || "";
    rdvState.firstName = String(form.querySelector('[name="firstName"]')?.value || "").trim();
    rdvState.lastName = String(form.querySelector('[name="lastName"]')?.value || "").trim();
    rdvState.phone = String(form.querySelector('[name="phone"]')?.value || "");
    rdvState.email = String(form.querySelector('[name="email"]')?.value || "").trim();
    rdvState.note = String(form.querySelector('[name="note"]')?.value || "").trim();
    rdvState.project = next;
    clearRdvQualifyFields();
    rdvState.error = "";
    renderRdv();
  });

  const qualifyBindings = [
    ["rdv-heating", "heatingCurrent"],
    ["rdv-surface", "surfaceBand"],
    ["rdv-ownership", "ownership"],
    ["rdv-timeline", "projectTimeline"],
    ["rdv-roof", "roofType"],
    ["rdv-battery", "batteryChoice"],
    ["rdv-rooms", "roomsBand"],
    ["rdv-clim-need", "climNeed"],
  ];
  qualifyBindings.forEach(([attr, key]) => {
    modal.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.getAttribute(`data-${attr}`) || "";
        rdvState[key] = rdvState[key] === value ? "" : value;
        if (key === "roomsBand") {
          rdvState.climSystemHint = deduceClimSystemHint(rdvState.roomsBand);
        }
        rdvState.error = "";
        // Preserve typed fields across re-render
        rdvState.firstName = String(form.querySelector('[name="firstName"]')?.value || "").trim();
        rdvState.lastName = String(form.querySelector('[name="lastName"]')?.value || "").trim();
        rdvState.phone = String(form.querySelector('[name="phone"]')?.value || "");
        rdvState.email = String(form.querySelector('[name="email"]')?.value || "").trim();
        rdvState.note = String(form.querySelector('[name="note"]')?.value || "").trim();
        renderRdv();
      });
    });
  });

  modal.querySelectorAll('input[name="meetingType"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      rdvState.meetingType = radio.value === "physique" ? "physique" : "telephone";
      rdvState.firstName = String(form.querySelector('[name="firstName"]')?.value || "").trim();
      rdvState.lastName = String(form.querySelector('[name="lastName"]')?.value || "").trim();
      rdvState.phone = String(form.querySelector('[name="phone"]')?.value || "");
      rdvState.email = String(form.querySelector('[name="email"]')?.value || "").trim();
      rdvState.note = String(form.querySelector('[name="note"]')?.value || "").trim();
      rdvState.project = String(form.querySelector('[name="project"]')?.value || rdvState.project || "");
      renderRdv();
    });
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!rdvState.selected || rdvState.submitting) return;
    const fd = new FormData(form);
    rdvState.firstName = String(fd.get("firstName") || "").trim();
    rdvState.lastName = String(fd.get("lastName") || "").trim();
    rdvState.phone = String(fd.get("phone") || "");
    rdvState.email = String(fd.get("email") || "").trim();
    rdvState.project = String(fd.get("project") || "");
    rdvState.note = String(fd.get("note") || "").trim();
    rdvState.meetingType = String(fd.get("meetingType") || rdvState.meetingType || "telephone");

    const phone = normalizeFrenchPhone(rdvState.phone);
    if (rdvState.firstName.length < 2) {
      rdvState.error = "Indiquez votre prénom.";
      renderRdv();
      return;
    }
    if (rdvState.lastName.length < 2) {
      rdvState.error = "Indiquez votre nom.";
      renderRdv();
      return;
    }
    if (!phone) {
      rdvState.error = "Indiquez un numéro de téléphone français valide.";
      renderRdv();
      return;
    }
    if (rdvState.project === "pac") {
      if (!rdvState.heatingCurrent) {
        rdvState.error = "Indiquez votre chauffage actuel.";
        renderRdv();
        return;
      }
      if (!rdvState.surfaceBand) {
        rdvState.error = "Indiquez la surface du logement.";
        renderRdv();
        return;
      }
      if (!rdvState.ownership) {
        rdvState.error = "Indiquez si vous êtes propriétaire ou locataire.";
        renderRdv();
        return;
      }
    } else if (rdvState.project === "photovoltaique") {
      if (!rdvState.roofType) {
        rdvState.error = "Indiquez le type de toiture.";
        renderRdv();
        return;
      }
      if (!rdvState.ownership) {
        rdvState.error = "Indiquez si vous êtes propriétaire.";
        renderRdv();
        return;
      }
      if (!rdvState.batteryChoice) {
        rdvState.error = "Indiquez l’orientation batterie souhaitée.";
        renderRdv();
        return;
      }
    } else if (rdvState.project === "climatisation") {
      if (!rdvState.roomsBand) {
        rdvState.error = "Indiquez le nombre de pièces à climatiser.";
        renderRdv();
        return;
      }
      if (!rdvState.climNeed) {
        rdvState.error = "Indiquez votre besoin.";
        renderRdv();
        return;
      }
    } else {
      clearRdvQualifyFields();
    }

    rdvState.submitting = true;
    rdvState.error = "";
    renderRdv();

    try {
      const payload = {
        firstName: rdvState.firstName,
        lastName: rdvState.lastName,
        phone,
        email: rdvState.email,
        project: rdvState.project,
        note: rdvState.note,
        date: rdvState.selected.date,
        time: rdvState.selected.time,
        meetingType: rdvState.meetingType || "telephone",
        pagePath: location.pathname,
        uiActionLabel: "Confirmer mon rendez-vous",
      };
      if (rdvState.project === "pac") {
        payload.heatingCurrent = rdvState.heatingCurrent;
        payload.surfaceBand = rdvState.surfaceBand;
        payload.ownership = rdvState.ownership;
        if (rdvState.projectTimeline) payload.projectTimeline = rdvState.projectTimeline;
      }
      if (rdvState.project === "photovoltaique") {
        payload.roofType = rdvState.roofType;
        payload.ownership = rdvState.ownership;
        payload.batteryChoice = rdvState.batteryChoice;
        if (rdvState.projectTimeline) payload.projectTimeline = rdvState.projectTimeline;
        payload.sourceLabel = "Photovoltaïque";
      }
      if (rdvState.project === "climatisation") {
        payload.roomsBand = rdvState.roomsBand;
        payload.climNeed = rdvState.climNeed;
        payload.climSystemHint = deduceClimSystemHint(rdvState.roomsBand);
        if (rdvState.projectTimeline) payload.projectTimeline = rdvState.projectTimeline;
        payload.sourceLabel = "Climatisation";
      }
      // Même raccordement que pour /api/leads. Les événements de conversion
      // Google Ads sont poussés plus bas, après la réponse 201 du serveur :
      // cette ligne est en amont et ne les touche pas.
      Object.assign(payload, attribution.fields());
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || res.status !== 201 || !data.ok) {
        throw new Error(data.error || "Réservation impossible");
      }
      rdvState.done = true;
      rdvState.doneInfo = {
        label: formatRdvLabel(
          rdvState.selected.date,
          rdvState.selected.time,
          rdvState.selected.label
        ),
        dayLabel: rdvState.selected.label,
        time: rdvState.selected.time,
        date: rdvState.selected.date,
        project: rdvState.project,
        projectTitle: projectTitle(rdvState.project) || "À préciser",
      };
      // Un seul book_appointment après succès serveur (201) —
      // le lead miroir CRM ne déclenche pas generate_lead.
      // project = sélection réelle du formulaire (pas inventée).
      // source_page = referrer same-origin connu uniquement (sinon omis).
      pushConversionEvent(
        "book_appointment",
        buildBookAppointmentPayload({
          pagePath: location.pathname,
          project: rdvState.project,
          sourcePage: sourcePageFromReferrer(document.referrer, location.origin),
        }),
        data.id ? `book_appointment:${data.id}` : `book_appointment:${Date.now()}`
      );
      rdvState.firstName = "";
      rdvState.lastName = "";
      rdvState.phone = "";
      rdvState.email = "";
      rdvState.note = "";
      clearRdvQualifyFields();
      // Conserver rdvState.project (présélection landing) pour un éventuel nouveau créneau
      rdvState.selected = null;
    } catch (err) {
      const msg = err.message || "Réservation impossible";
      rdvState.submitting = false;
      // Recharge les créneaux sans effacer l’erreur ni fermer la modale
      try {
        const agendaRes = await fetch(`/api/agenda?v=${Date.now()}`, { cache: "no-store" });
        const agendaData = await agendaRes.json();
        if (agendaRes.ok && agendaData.ok) rdvState.days = agendaData.days || [];
      } catch {
        /* ignore */
      }
      rdvState.error = msg;
      renderRdv();
      return;
    } finally {
      rdvState.submitting = false;
    }
    renderRdv();
  });
}

function renderRdv() {
  if (!rdvRoot) return;

  if (rdvState.loading && !rdvState.modalOpen) {
    rdvRoot.innerHTML = `
      <div class="rdv__loading rdv__loading--card" aria-busy="true">
        <div class="rdv__skeleton" aria-hidden="true"></div>
        <p>Chargement de l’agenda…</p>
      </div>`;
    return;
  }

  if (rdvState.error && rdvState.days.length === 0 && !rdvState.modalOpen) {
    rdvRoot.innerHTML = `
      <div class="rdv__loading rdv__loading--card rdv__loading--error">
        <p>${escapeHtml(rdvState.error)}</p>
        <button type="button" class="btn btn--primary" id="rdv-retry">Réessayer</button>
      </div>`;
    rdvRoot.querySelector("#rdv-retry")?.addEventListener("click", loadAgenda);
    return;
  }

  const days = isRdvPreview() ? rdvState.days.slice(0, 6) : rdvState.days;

  if (isRdvPreview()) {
    rdvRoot.innerHTML = `
      ${calendarHtml(days)}
      ${rdvState.modalOpen ? rdvModalHtml() : ""}`;
    rdvRoot.querySelectorAll("[data-rdv-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openRdvModal({
          date: btn.dataset.rdvDate,
          time: btn.dataset.rdvTime,
          label: btn.dataset.rdvLabel,
        });
      });
    });
    if (rdvState.modalOpen) bindRdvModal();
    return;
  }

  // Page RDV : jour puis créneaux
  rdvRoot.innerHTML = `
    <div class="rdv__agenda rdv__agenda--solo">
      ${bookCalendarHtml(days)}
    </div>
    ${rdvState.modalOpen ? rdvModalHtml() : ""}`;

  rdvRoot.querySelectorAll("[data-rdv-week]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.getAttribute("data-rdv-week") || 0);
      if (!delta) return;
      const weeks = groupAgendaWeeks(rdvState.days);
      const next = Math.min(Math.max(0, (rdvState.weekIndex || 0) + delta), weeks.length - 1);
      if (next === rdvState.weekIndex) return;
      rdvState.weekIndex = next;
      const first = weeks[next]?.days?.[0];
      if (first) rdvState.selectedDay = first.date;
      renderRdv();
    });
  });

  rdvRoot.querySelectorAll("[data-rdv-select-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-rdv-select-day") || "";
      if (!next || next === rdvState.selectedDay) return;
      rdvState.selectedDay = next;
      renderRdv();
    });
  });

  rdvRoot.querySelectorAll("[data-rdv-date]:not(:disabled)").forEach((btn) => {
    btn.addEventListener("click", () => {
      openRdvModal({
        date: btn.dataset.rdvDate,
        time: btn.dataset.rdvTime,
        label: btn.dataset.rdvLabel,
      });
    });
  });

  if (rdvState.modalOpen) bindRdvModal();
}

function bindMobileNav() {
  const header = document.querySelector(".header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!header || !toggle || !nav) return;

  const setOpen = (open) => {
    header.classList.toggle("is-nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    document.body.classList.toggle("has-nav-open", open);
  };

  toggle.addEventListener("click", () => {
    setOpen(!header.classList.contains("is-nav-open"));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && header.classList.contains("is-nav-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 720px)").matches) setOpen(false);
  });
}

let solutionsOrbOpen = false;

function closeSolutionsOrb() {
  const root = document.getElementById("solutions-orb");
  if (!root) return;
  root.classList.remove("is-open");
  root.setAttribute("aria-hidden", "true");
  solutionsOrbOpen = false;
  document.body.classList.remove("has-solutions-orb");
  if (!realisationsOrbOpen) document.body.style.overflow = "";
}

function openSolutionsOrb() {
  const root = document.getElementById("solutions-orb");
  if (!root) return;
  closeRealisationsOrb();
  closeNavMenus();
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  // reflow then open for corner → center animation
  void root.offsetWidth;
  root.classList.add("is-open");
  solutionsOrbOpen = true;
  document.body.classList.add("has-solutions-orb");
  document.body.style.overflow = "hidden";
  root.querySelector(".solutions-orb__bubble")?.focus();
}

function solutionsOrbItems() {
  return [
    {
      corner: "tl",
      href: "radiateurs.html",
      labelKey: "orb.rad",
      subKey: "orb.rad.sub",
      tone: "radiateurs",
    },
    {
      corner: "tr",
      href: "photovoltaique.html",
      labelKey: "orb.pv",
      subKey: "orb.pv.sub",
      tone: "pv",
    },
    {
      corner: "bl",
      href: "pompe-a-chaleur.html",
      labelKey: "orb.pac",
      subKey: "orb.pac.sub",
      tone: "pac",
    },
    {
      corner: "br",
      href: "climatisation.html",
      labelKey: "orb.clim",
      subKey: "orb.clim.sub",
      tone: "clim",
    },
  ];
}

function refreshSolutionsOrbLabels() {
  const root = document.getElementById("solutions-orb");
  if (!root) return;
  const stage = root.querySelector(".solutions-orb__stage");
  if (stage) stage.setAttribute("aria-label", t("orb.choose"));
  const title = root.querySelector(".solutions-orb__title");
  if (title) title.textContent = t("orb.title");
  const close = root.querySelector(".solutions-orb__close");
  if (close) close.setAttribute("aria-label", t("orb.close"));
  solutionsOrbItems().forEach((item) => {
    const bubble = root.querySelector(`.solutions-orb__bubble--${item.tone}`);
    if (!bubble) return;
    const label = bubble.querySelector(".solutions-orb__bubble-label");
    const sub = bubble.querySelector(".solutions-orb__bubble-sub");
    if (label) label.textContent = t(item.labelKey);
    if (sub) sub.textContent = t(item.subKey);
  });
}

function bindSolutionsOrb() {
  const triggers = document.querySelectorAll(".nav__trigger");
  if (!triggers.length) return;

  const items = solutionsOrbItems();

  let root = document.getElementById("solutions-orb");
  if (!root) {
    root = document.createElement("div");
    root.id = "solutions-orb";
    root.className = "solutions-orb";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="solutions-orb__backdrop" data-orb-close></div>
      <div class="solutions-orb__stage" role="dialog" aria-modal="true" aria-label="${t("orb.choose")}">
        <p class="solutions-orb__title">${t("orb.title")}</p>
        <button type="button" class="solutions-orb__close" data-orb-close aria-label="${t("orb.close")}">×</button>
        ${items
          .map(
            (item) => `
          <a
            class="solutions-orb__bubble solutions-orb__bubble--${item.corner} solutions-orb__bubble--${item.tone}"
            href="${item.href}"
          >
            <span class="solutions-orb__bubble-label">${t(item.labelKey)}</span>
            <span class="solutions-orb__bubble-sub">${t(item.subKey)}</span>
          </a>`
          )
          .join("")}
      </div>
    `;
    document.body.appendChild(root);
  } else {
    refreshSolutionsOrbLabels();
  }

  document.documentElement.classList.add("solutions-orb-ready");

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (solutionsOrbOpen) closeSolutionsOrb();
      else openSolutionsOrb();
    });
  });

  root.querySelectorAll("[data-orb-close]").forEach((el) => {
    el.addEventListener("click", closeSolutionsOrb);
  });

  root.querySelectorAll(".solutions-orb__bubble").forEach((bubble) => {
    bubble.addEventListener("click", (e) => {
      e.preventDefault();
      if (bubble.hasAttribute("data-open-lead")) {
        closeSolutionsOrb();
        openLead(bubble.dataset.openLead || "devis", bubble.dataset.project || "");
        return;
      }
      const href = bubble.getAttribute("href");
      closeSolutionsOrb();
      // Navigation explicite : fermer l’overlay annulait parfois le clic natif <a>.
      if (href) window.location.assign(href);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && solutionsOrbOpen) {
      closeSolutionsOrb();
    }
  });
}

let realisationsOrbOpen = false;

function closeNavMenus() {
  const header = document.querySelector(".header");
  if (header?.classList.contains("is-nav-open")) {
    header.classList.remove("is-nav-open");
    document.body.classList.remove("has-nav-open");
    document.querySelector(".nav-toggle")?.setAttribute("aria-expanded", "false");
  }
}

function closeRealisationsOrb() {
  const root = document.getElementById("realisations-orb");
  if (!root) return;
  root.classList.remove("is-open");
  root.setAttribute("aria-hidden", "true");
  realisationsOrbOpen = false;
  document.body.classList.remove("has-realisations-orb");
  if (!solutionsOrbOpen) document.body.style.overflow = "";
}

function openRealisationsOrb() {
  const root = document.getElementById("realisations-orb");
  if (!root) return;
  closeSolutionsOrb();
  closeNavMenus();
  // Refresh covers / compteurs (données éventuellement chargées après)
  root.querySelectorAll("[data-metier-id]").forEach((tile) => {
    const cat = CATEGORIES.find((c) => c.id === tile.dataset.metierId);
    if (!cat) return;
    const img = tile.querySelector("img");
    if (img) img.src = metierCover(cat);
    const countEl = tile.querySelector(".realisations-orb__tile-count");
    if (countEl) {
      const count = metierPhotoCount(cat.id);
      countEl.textContent = count ? `${count} photo${count > 1 ? "s" : ""}` : "À venir";
    }
  });
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  void root.offsetWidth;
  root.classList.add("is-open");
  realisationsOrbOpen = true;
  document.body.classList.add("has-realisations-orb");
  document.body.style.overflow = "hidden";
  root.querySelector(".realisations-orb__tile")?.focus();
}

function openMetierFromOrb(metierId) {
  closeRealisationsOrb();
  if (realisationsGrid) {
    state.realisationsFilter = metierId;
    state.realisationsView = "chantiers";
    renderRealisationsFilters();
    renderRealisations();
    requestAnimationFrame(() => {
      document.getElementById("realisations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return;
  }
  location.href = `index.html?metier=${encodeURIComponent(metierId)}#realisations`;
}

function bindRealisationsOrb() {
  const triggers = [
    ...document.querySelectorAll('a[href="#realisations"]'),
    ...document.querySelectorAll('a[href="index.html#realisations"]'),
  ];
  if (!triggers.length) return;

  // 4 coins + milieu haut + milieu bas
  const slots = ["tl", "tm", "tr", "bl", "bm", "br"];

  let root = document.getElementById("realisations-orb");
  if (!root) {
    root = document.createElement("div");
    root.id = "realisations-orb";
    root.className = "realisations-orb";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="realisations-orb__backdrop" data-real-orb-close></div>
      <div class="realisations-orb__stage" role="dialog" aria-modal="true" aria-label="Nos réalisations par métier">
        <p class="realisations-orb__title">Nos réalisations</p>
        <button type="button" class="realisations-orb__close" data-real-orb-close aria-label="Fermer">×</button>
        ${CATEGORIES.map((cat, i) => {
          const slot = slots[i] || "bm";
          const cover = metierCover(cat);
          const count = metierPhotoCount(cat.id);
          return `
          <button
            type="button"
            class="realisations-orb__tile realisations-orb__tile--${slot}"
            data-metier-id="${cat.id}"
          >
            <img src="${cover}" alt="" width="640" height="480" draggable="false" />
            <span class="realisations-orb__shade"></span>
            <span class="realisations-orb__body">
              <span class="realisations-orb__tile-title">${escapeHtml(cat.title)}</span>
              <span class="realisations-orb__tile-count">${count ? `${count} photo${count > 1 ? "s" : ""}` : "À venir"}</span>
            </span>
          </button>`;
        }).join("")}
      </div>
    `;
    document.body.appendChild(root);
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (realisationsOrbOpen) closeRealisationsOrb();
      else openRealisationsOrb();
    });
  });

  root.querySelectorAll("[data-real-orb-close]").forEach((el) => {
    el.addEventListener("click", closeRealisationsOrb);
  });

  root.querySelectorAll("[data-metier-id]").forEach((tile) => {
    tile.addEventListener("click", () => openMetierFromOrb(tile.dataset.metierId));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && realisationsOrbOpen) closeRealisationsOrb();
  });
}

function bindDoorReveal() {
  const roots = document.querySelectorAll(".doors--stagger");
  if (!roots.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;
  roots.forEach((root) => {
    const doors = [...root.querySelectorAll(".door")].filter((d) => !d.classList.contains("is-in"));
    if (!doors.length) return;
    root.classList.add("doors--animate");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    doors.forEach((door) => io.observe(door));
  });
}

function bindBackToTop() {
  if (document.getElementById("back-to-top")) return;

  const btn = document.createElement("button");
  btn.id = "back-to-top";
  btn.type = "button";
  btn.className = "back-to-top";
  btn.setAttribute("aria-label", "Retour en haut de page");
  btn.setAttribute("title", "Retour en haut");
  btn.hidden = true;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 5.5 5.8 11.7a1 1 0 0 0 1.4 1.4L11 9.3V19a1 1 0 1 0 2 0V9.3l3.8 3.8a1 1 0 0 0 1.4-1.4L12 5.5z"/>
    </svg>`;
  document.body.appendChild(btn);

  const update = () => {
    const doc = document.documentElement;
    const scrollBottom = window.scrollY + window.innerHeight;
    // Apparait en bas de page (footer / derniers ~180 px), ou une fois bien descendu
    const nearBottom = scrollBottom >= doc.scrollHeight - 180;
    const deepScroll = window.scrollY > Math.min(900, doc.scrollHeight * 0.45);
    const show = nearBottom || deepScroll;
    btn.hidden = !show;
    btn.classList.toggle("is-visible", show);
  };

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

function formatGoogleRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

/** Mot « Google » aux couleurs officielles (bleu / rouge / jaune / bleu / vert / rouge). */
function googleWordHtml() {
  return `<span class="google-word" aria-label="Google"><span class="google-word__g">G</span><span class="google-word__o1">o</span><span class="google-word__o2">o</span><span class="google-word__g2">g</span><span class="google-word__l">l</span><span class="google-word__e">e</span></span>`;
}

function googleStarsRow(rating, { max = 5, className = "" } = {}) {
  const full = Math.max(0, Math.min(max, Math.round(Number(rating) || 0)));
  const stars = Array.from({ length: max }, (_, i) => (i < full ? "★" : "☆")).join("");
  return `<span class="${className}" aria-hidden="true">${stars}</span>`;
}

function reviewAuthorInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function reviewAvatarHtml(author, photoUrl) {
  const name = String(author || "").trim();
  const photo = String(photoUrl || "").trim();
  if (photo && /^https?:\/\//i.test(photo)) {
    return `<img class="g-review__avatar-img" src="${escapeAttr(photo)}" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" />`;
  }
  return `<span class="g-review__avatar-fallback" aria-hidden="true">${escapeHtml(
    reviewAuthorInitials(name)
  )}</span>`;
}

function renderGoogleReviews(root, data) {
  const ratingLabel = formatGoogleRating(data.rating);
  const count = Number(data.userRatingCount) || 0;
  const mapsUrl = data.mapsUrl || "https://www.google.com/maps?cid=18245775962692442094";
  const compact = root.hasAttribute("data-reviews-compact");
  const reviews = Array.isArray(data.reviews) ? data.reviews.slice(0, compact ? 4 : 8) : [];
  const google = googleWordHtml();

  const cardList = reviews
    .map((r) => {
      const author = String(r.author || "").trim();
      const text = String(r.text || "").trim();
      const relative = String(r.relativeTime || "").trim();
      const photoUrl = String(r.photoUrl || "").trim();
      if (!author || !text) return "";
      return `
        <blockquote class="g-review">
          <div class="g-review__head">
            <div class="g-review__avatar">${reviewAvatarHtml(author, photoUrl)}</div>
            <div class="g-review__head-meta">
              ${googleStarsRow(5, { className: "g-review__stars" })}
              <footer class="g-review__author">
                <cite>${escapeHtml(author)}</cite>
                ${relative ? `<span class="g-review__time"> · ${escapeHtml(relative)}</span>` : ""}
              </footer>
            </div>
          </div>
          <p class="g-review__text">“${escapeHtml(text)}”</p>
        </blockquote>`;
    })
    .filter(Boolean);

  const cards = cardList.join("");
  // Double la piste pour un défilement horizontal en boucle continue
  const track = cardList.length
    ? `${cards}${cards}`
    : `<p class="g-reviews__error">Aucun avis 5/5 à afficher pour le moment.</p>`;

  root.classList.toggle("g-reviews--compact", compact);
  root.innerHTML = `
    <div class="g-reviews__summary">
      <div class="g-reviews__score">
        <span class="g-reviews__score-value">${escapeHtml(ratingLabel)}</span>
        <span class="g-reviews__score-max">/ 5</span>
      </div>
      <div class="g-reviews__meta">
        ${googleStarsRow(data.rating, { className: "g-reviews__stars" })}
        <span class="g-reviews__count">${count ? `${count} avis ${google}` : `Avis ${google}`}</span>
      </div>
      <a class="g-reviews__link" href="${escapeAttr(mapsUrl)}" target="_blank" rel="noopener noreferrer">
        Voir tous les avis
      </a>
    </div>
    <div class="g-reviews__marquee" aria-label="Avis clients 5 étoiles">
      <div class="g-reviews__track" style="--g-reviews-count: ${Math.max(cardList.length, 1)}">
        ${track}
      </div>
    </div>
  `;
}

async function loadGoogleReviews() {
  const root = document.querySelector("[data-google-reviews]");
  if (!root) return;
  try {
    const res = await fetch(`/api/google-reviews?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data?.ok || typeof data.rating !== "number") throw new Error("payload");
    renderGoogleReviews(root, data);
  } catch {
    root.innerHTML = `<p class="g-reviews__error">Impossible de charger les avis Google pour le moment.</p>`;
  }
}

let certModalOpen = false;

function closeCertModal() {
  const root = document.getElementById("cert-modal");
  if (!root) return;
  root.hidden = true;
  root.innerHTML = "";
  certModalOpen = false;
  document.body.style.overflow = "";
}

function openCertModal({ src, title }) {
  if (!src) return;
  let root = document.getElementById("cert-modal");
  if (!root) {
    root = document.createElement("div");
    root.id = "cert-modal";
    root.className = "cert-modal";
    root.hidden = true;
    document.body.appendChild(root);
  }

  const safeTitle = escapeHtml(title || "Certificat MKL Énergies");
  const safeSrc = escapeAttr(src);

  root.hidden = false;
  certModalOpen = true;
  document.body.style.overflow = "hidden";
  root.innerHTML = `
    <div class="cert-modal__backdrop" data-cert-close></div>
    <div class="cert-modal__dialog" role="dialog" aria-modal="true" aria-label="${safeTitle}">
      <button type="button" class="cert-modal__close" data-cert-close aria-label="Fermer">×</button>
      <p class="cert-modal__title">${safeTitle}</p>
      <div class="cert-modal__frame">
        <img src="${safeSrc}" alt="${safeTitle}" draggable="false" />
      </div>
    </div>
  `;

  root.querySelectorAll("[data-cert-close]").forEach((el) => {
    el.addEventListener("click", closeCertModal);
  });
}

function bindCertViewers() {
  document.querySelectorAll("[data-cert-open]").forEach((el) => {
    if (el.dataset.certBound === "1") return;
    el.dataset.certBound = "1";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openCertModal({
        src: el.getAttribute("data-cert-src") || "",
        title: el.getAttribute("data-cert-title") || "Certificat MKL Énergies",
      });
    });
  });
}

const CLIM_GALLERY_CAT_LABELS = {
  monosplit: "Monosplit",
  multisplit: "Multisplit",
  exterieur: "Groupe extérieur",
};

/** Textes + CTA pour les 3 unités intérieures (qualité / propreté de pose). */
function climInteriorCopy() {
  return [
    {
      text: "Pose réalisée par MKL Énergies : nette en coin de séjour, liaisons discrètes, finitions propres, unité parfaitement intégrée dans le volume de vie.",
      cta: `<button type="button" class="btn btn--yellow door__cta" data-open-lead="rappel" data-project="climatisation">${t("cta.rappel")}</button>`,
    },
    {
      text: "Pose réalisée par MKL Énergies : installation murale soignée, perçages maîtrisés, télécommande bien placée, chantier rendu propre.",
      cta: `<a class="btn btn--primary door__cta" href="rdv.html?project=climatisation">${t("cta.rdv")}</a>`,
    },
    {
      text: "Pose réalisée par MKL Énergies : console sous fenêtre avec un travail de finition précis — aucun superflu, juste une pose propre et durable.",
      cta: `<a class="btn btn--primary door__cta" href="#lead">${t("cta.etude")}</a>`,
    },
  ];
}

/** Légendes groupes extérieurs (par id de photo publiée). */
const CLIM_EXTERIOR_COPY = {
  "clim-mvxspk0a-36bc96d3": {
    title: "Groupe sur console murale",
    text: "Pose réalisée par MKL Énergies : groupe installé sur une console murale, fixations soignées et finitions propres autour de l’unité.",
  },
  "clim-mvxspkfl-d1036ec0": {
    title: "Groupe multi-split",
    text: "Pose réalisée par MKL Énergies : groupe multi-split posé au sol sur des plots anti-vibration, pour limiter les transmissions de bruit et de vibrations.",
  },
};

/** Galerie clim au format « doors » (comme PAC / accueil). */
async function loadClimLandingGallery() {
  const root = document.querySelector("[data-clim-gallery]");
  if (!root || !isClimLandingPage()) return;
  try {
    const res = await fetch(`/api/clim-gallery?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.publishToSite || !Array.isArray(data.items) || !data.items.length) {
      return; // conserve le HTML doors déjà en place
    }
    root.parentElement?.querySelector("[data-clim-gallery-filters]")?.remove();
    root.className = "doors doors--stagger clim-realisations";
    let interiorIndex = 0;
    root.innerHTML = data.items
      .map((it) => {
        const cat = CLIM_GALLERY_CAT_LABELS[it.category] || "Chantier MKL";
        const title = it.caption || cat;
        const isOutdoorGroup =
          it.category === "exterieur" ||
          Boolean(CLIM_EXTERIOR_COPY[it.id]) ||
          /groupe\s+(extérieur|multi-?split)|console murale|plots anti-vibration/i.test(
            `${it.caption || ""} ${it.alt || ""}`
          );
        const exterieur = isOutdoorGroup ? " clim-real--exterieur" : "";
        // Intérieures (3 premières) : cadre vertical plus étroit, calé L/R — pas agrandi
        const isInteriorSlot = !isOutdoorGroup && interiorIndex < 3;
        const portrait = isInteriorSlot ? " clim-real--portrait" : "";
        const portraitDims = portrait ? 'width="1000" height="1600"' : 'width="1600" height="1000"';
        let heading = title;
        let bodyText = "Installation réalisée par MKL Énergies.";
        let ctaHtml = "";
        if (isInteriorSlot) {
          const copy = climInteriorCopy()[interiorIndex];
          bodyText = copy.text;
          ctaHtml = copy.cta;
          interiorIndex += 1;
        } else if (isOutdoorGroup) {
          const outdoor = CLIM_EXTERIOR_COPY[it.id];
          if (outdoor) {
            heading = outdoor.title;
            bodyText = outdoor.text;
          } else if (/multi/i.test(`${it.category || ""} ${it.caption || ""}`)) {
            heading = "Groupe multi-split";
            bodyText =
              "Pose réalisée par MKL Énergies : groupe multi-split posé au sol sur des plots anti-vibration, pour limiter les transmissions de bruit et de vibrations.";
          } else {
            heading = "Groupe sur console murale";
            bodyText =
              "Pose réalisée par MKL Énergies : groupe installé sur une console murale, fixations soignées et finitions propres autour de l’unité.";
          }
        }
        return `
        <article class="door clim-real${exterieur}${portrait}" data-clim-cat="${escapeAttr(it.category || "")}">
          <div class="door__media">
            <img
              src="${escapeAttr(it.src)}?v=${encodeURIComponent(it.createdAt || "")}"
              alt="${escapeAttr(it.alt || title)}"
              ${portraitDims}
              loading="lazy"
            />
          </div>
          <div class="door__body">
            <p class="section__eyebrow">${escapeHtml(cat)}</p>
            <h3>${escapeHtml(heading)}</h3>
            <p>${escapeHtml(bodyText)}</p>
            ${ctaHtml}
          </div>
        </article>`;
      })
      .join("");
    bindDoorReveal();
    bindOpenLeadButtons(root);
  } catch {
    /* fallback HTML inchangé */
  }
}

async function init() {
  // Bind conversion CTAs immediately so hero/sticky work before network fetches finish.
  bindOpenLeadButtons();
  bindMobileNav();
  bindSolutionsOrb();
  bindRealisationsOrb();
  bindBackToTop();
  bindDoorReveal();
  bindCertViewers();
  loadClimLandingGallery();
  if (isEtudeHubPage()) {
    state.intent = "devis";
    const projectParam = new URLSearchParams(location.search).get("project") || "";
    if (ETUDE_TRADES.some((t) => t.id === projectParam)) {
      applyStudyTrade(projectParam, { syncUrl: false });
    }
  } else if (isPvLandingPage()) {
    state.projects = ["photovoltaique"];
    state.housing = "maison";
    state.intent = "devis";
  } else if (isClimLandingPage()) {
    state.projects = ["climatisation"];
    state.intent = "devis";
  } else if (isPacLandingPage()) {
    state.projects = ["pac"];
    state.intent = "devis";
  } else if (isRadiateursLandingPage()) {
    state.projects = ["radiateurs"];
    state.intent = "devis";
  }
  if (formRoot) renderForm();

  await loadPublicConfig();
  // Re-render après config (privacy + libellés conformité) sans activer le flag côté client.
  if (formRoot) renderForm();

  await Promise.all([loadCovers(), loadCategoryCovers(), loadRealisations(), loadGoogleReviews()]);
  if (realisationsGrid) {
    const metierParam = new URLSearchParams(location.search).get("metier");
    if (metierParam && CATEGORIES.some((c) => c.id === metierParam)) {
      state.realisationsFilter = metierParam;
      state.realisationsView = "chantiers";
    }
    renderRealisationsFilters();
    renderRealisations();
  }
  if (rdvRoot) {
    const params = new URLSearchParams(location.search);
    const projectParam = params.get("project") || "";
    if (projectParam && PROJECTS.some((p) => p.id === projectParam)) {
      rdvState.project = projectParam;
      clearRdvQualifyFields();
    }
    const date = params.get("date");
    const time = params.get("time");
    if (date && time && !isRdvPreview()) {
      rdvState.selectedDay = date;
      openRdvModal({ date, time, label: params.get("label") || date });
    }
    loadAgenda();
  }

  onLangChange(() => {
    refreshSolutionsOrbLabels();
    if (formRoot) renderForm();
    if (realisationsGrid) {
      renderRealisationsFilters();
      renderRealisations();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && certModalOpen) {
    closeCertModal();
    return;
  }
  if (e.key === "Escape" && rdvState.modalOpen) {
    rdvState.done = false;
    rdvState.doneInfo = null;
    closeRdvModal();
  }
});

init();
