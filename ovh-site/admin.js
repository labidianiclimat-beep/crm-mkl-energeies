import { CATEGORIES, REALISATIONS as BASE_REALISATIONS } from "./data/realisations.js";

let REALISATIONS = BASE_REALISATIONS;

async function loadRealisationsList() {
  try {
    const res = await fetch(`/api/realisations?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.ok && Array.isArray(data.realisations)) {
      REALISATIONS = data.realisations;
    }
  } catch {
    REALISATIONS = BASE_REALISATIONS;
  }
}

/** Indicateur UI local — l’auth réelle est le cookie HttpOnly serveur */
const SESSION_KEY = "mkl-admin-session";

const root = document.getElementById("admin-app");

function isLoggedInUi() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
  if (res.status === 401 && !String(url).includes("/api/admin/login")) {
    const wasLoggedIn = isLoggedInUi();
    sessionStorage.removeItem(SESSION_KEY);
    if (wasLoggedIn) {
      state.loginError = "Session expirée. Reconnectez-vous.";
      render();
    }
  }
  return res;
}

const PROJECT_LABELS = {
  climatisation: "Climatisation",
  pac: "Pompe à chaleur",
  photovoltaique: "Panneaux photovoltaïques",
  "isolation-exterieure": "Isolation",
  radiateurs: "Radiateurs à brique réfractaire",
  cet: "Ballon thermodynamique",
  autre: "Autre",
};

const STATUS_LABELS = {
  nouveau: "Nouveau",
  contacte: "Contacté",
  traite: "Traité",
};

/** Libellés PAC (ne pas confondre ownership avec status CRM) */
const HEATING_LABELS = {
  fioul: "Fioul",
  gaz: "Gaz",
  electrique: "Électrique",
  autre: "Autre",
};
const SURFACE_LABELS = {
  lt100: "Moins de 100 m²",
  "100_150": "100–150 m²",
  "150_200": "150–200 m²",
  gt200: "Plus de 200 m²",
};
const OWNERSHIP_LABELS = {
  proprietaire: "Propriétaire",
  locataire: "Locataire",
  acquisition: "En cours d’acquisition",
  non: "Non propriétaire",
};
const TIMELINE_LABELS = {
  asap: "Dès que possible",
  "1_3m": "1–3 mois",
  "3_6m": "3–6 mois",
  later: "Plus tard",
};
const ROOF_LABELS = {
  tuile: "Tuiles",
  ardoise: "Ardoise",
  bac_acier: "Bac acier",
  autre: "Autre",
};
const BATTERY_LABELS = {
  with: "Avec batterie",
  without: "Sans batterie",
  advice: "Souhaite être conseillé",
};
const CLIM_ROOMS_LABELS = {
  1: "1 pièce",
  "2_3": "2 à 3 pièces",
  "4_plus": "4 pièces et plus",
};
const CLIM_SURFACE_LABELS = {
  lt40: "Moins de 40 m²",
  "40_80": "40–80 m²",
  "80_150": "80–150 m²",
  gt150: "Plus de 150 m²",
};
const CLIM_EXISTING_LABELS = {
  aucune: "Aucune",
  a_remplacer: "À remplacer",
  a_completer: "À compléter",
};
const CLIM_NEED_LABELS = {
  rafraichir: "Rafraîchir",
  chauffer_rafraichir: "Chauffer et rafraîchir",
  conseil: "Être conseillé",
};
const CLIM_SYSTEM_LABELS = {
  monosplit: "Monosplit (indicatif)",
  multisplit: "Multisplit (indicatif)",
};

const APPT_STATUS = {
  confirme: "Confirmé",
  termine: "Terminé",
  annule: "Annulé",
};

const COMPLIANCE_LABELS = {
  authorized: "Rappel justifié",
  unjustified: "Rappel non justifié",
  expired: "Rappel expiré",
  opposition: "Opposition enregistrée",
  rdv_context: "Cadre rendez-vous",
};

const CLIM_GALLERY_CAT_LABELS = {
  monosplit: "Monosplit",
  multisplit: "Multisplit",
  exterieur: "Unités extérieures",
};

const state = {
  view: "leads",
  covers: {},
  categoryCovers: {},
  dirty: false,
  saving: false,
  toast: "",
  toastOk: false,
  loginError: "",
  loginInfo: "",
  loginMode: "login", // login | forgot
  forgotBusy: false,
  passwordFormError: "",
  passwordFormOk: "",
  resetEmail: "labidianiclimat@gmail.com",
  mailConfigured: false,
  leads: [],
  leadsLoading: false,
  leadsFilter: "all",
  crmJobs: [],
  crmJobsLoading: false,
  crmSyncEnabled: false,
  crmSyncConfigured: false,
  complianceFilter: "all",
  complianceEnabled: false,
  appointments: [],
  appointmentsLoading: false,
  proofModal: null,
  climGallery: { version: 1, publishToSite: false, updatedAt: null, items: [] },
  climGalleryCategories: [
    { id: "monosplit", title: "Monosplit" },
    { id: "multisplit", title: "Multisplit" },
    { id: "exterieur", title: "Unités extérieures" },
  ],
  climGalleryLoading: false,
  climGalleryFilter: "all",
  climGalleryUploading: false,
};

function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.title || id;
}

function isLoggedIn() {
  return isLoggedInUi();
}

async function loadCovers() {
  const defaults = Object.fromEntries(REALISATIONS.map((r) => [r.id, r.coverIndex || 0]));
  try {
    const res = await fetch(`data/covers.json?v=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      state.covers = { ...defaults, ...data };
      return;
    }
  } catch {
    /* ignore */
  }
  state.covers = defaults;
}

async function loadCategoryCovers() {
  try {
    const res = await fetch(`data/category-covers.json?v=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      state.categoryCovers = await res.json();
      return;
    }
  } catch {
    /* ignore */
  }
  state.categoryCovers = {};
}

function categoryCoverSrc(cat) {
  if (state.categoryCovers[cat.id]) return state.categoryCovers[cat.id];
  if (cat.coverFallback) return cat.coverFallback;
  const first = REALISATIONS.find((r) => r.category === cat.id && r.photos?.length);
  if (first) {
    const idx = getCover(first.id);
    return first.photos[idx] || first.photos[0];
  }
  return "assets/metiers/interieur.jpg";
}

function getCover(chantierId) {
  const chantier = REALISATIONS.find((r) => r.id === chantierId);
  const max = Math.max(0, (chantier?.photos.length || 1) - 1);
  const value = state.covers[chantierId] ?? 0;
  return Math.min(Math.max(0, value), max);
}

function buildCoversPayload() {
  const payload = {};
  for (const r of REALISATIONS) {
    payload[r.id] = getCover(r.id);
  }
  return payload;
}

async function saveCoversToServer() {
  const payload = buildCoversPayload();
  state.saving = true;
  render();
  try {
    const res = await apiFetch("/api/covers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Enregistrement impossible");
    }
    state.covers = { ...state.covers, ...data.covers };
    state.dirty = false;
    showToast("Photos principales enregistrées sur le site", true);
  } catch (err) {
    state.dirty = true;
    showToast(
      "Serveur admin requis : lancez « npm start » puis réessayez",
      false
    );
    console.error(err);
  } finally {
    state.saving = false;
    render();
  }
}

function setCover(chantierId, index) {
  if (getCover(chantierId) === index) return;
  state.covers[chantierId] = index;
  state.dirty = true;
  render();
  // Enregistre dès le clic — plus besoin de remplacer un fichier à la main
  saveCoversToServer();
}

function showToast(message, ok = true) {
  state.toast = message;
  state.toastOk = ok;
  render();
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    state.toast = "";
    render();
  }, 4200);
}

async function login(password) {
  state.loginError = "";
  state.loginInfo = "";
  try {
    const res = await apiFetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      state.loginError = data.error || "Mot de passe incorrect.";
      render();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    state.loginError = "";
    state.loginMode = "login";
    await Promise.all([loadCovers(), loadCategoryCovers(), loadRealisationsList()]);
    render();
    loadLeads();
  } catch {
    state.loginError = "Connexion impossible. Vérifiez que le serveur tourne.";
    render();
  }
}

async function requestForgotPassword() {
  state.loginError = "";
  state.loginInfo = "";
  state.forgotBusy = true;
  render();
  try {
    const res = await apiFetch("/api/admin/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (data.resetEmail) state.resetEmail = data.resetEmail;
    if (!res.ok || !data.ok) {
      state.loginError = data.error || "Envoi impossible.";
      return;
    }
    state.loginInfo =
      data.message ||
      `Un nouveau mot de passe a été envoyé à ${state.resetEmail}.`;
    state.loginMode = "login";
  } catch {
    state.loginError = "Envoi impossible. Vérifiez que le serveur tourne.";
  } finally {
    state.forgotBusy = false;
    render();
  }
}

async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  state.passwordFormError = "";
  state.passwordFormOk = "";
  try {
    const res = await apiFetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      state.passwordFormError = data.error || "Modification impossible.";
      render();
      return false;
    }
    state.passwordFormOk = data.message || "Mot de passe mis à jour.";
    render();
    return true;
  } catch {
    state.passwordFormError = "Modification impossible. Réessayez.";
    render();
    return false;
  }
}

async function logout() {
  try {
    await apiFetch("/api/admin/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(SESSION_KEY);
  state.dirty = false;
  state.leads = [];
  state.appointments = [];
  render();
}

async function restoreSession() {
  try {
    const res = await apiFetch("/api/admin/session");
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.authenticated) {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (data.resetEmail) state.resetEmail = data.resetEmail;
      state.mailConfigured = !!data.mailConfigured;
      return true;
    }
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(SESSION_KEY);
  return false;
}

function renderLogin() {
  if (state.loginMode === "forgot") {
    root.innerHTML = `
      <div class="login">
        <form class="login__card" id="forgot-form">
          <img class="login__logo" src="assets/logo-mkl-energies.png?v=officiel" alt="MKL Énergies" />
          <h1>Mot de passe oublié</h1>
          <p>Un nouveau mot de passe sera envoyé à<br /><strong>${escapeHtml(state.resetEmail)}</strong></p>
          <p class="login__error" role="alert">${escapeHtml(state.loginError)}</p>
          ${state.loginInfo ? `<p class="login__info" role="status">${escapeHtml(state.loginInfo)}</p>` : ""}
          <button class="btn btn--primary btn--block" type="submit" ${state.forgotBusy ? "disabled" : ""}>
            ${state.forgotBusy ? "Envoi…" : "Envoyer le mot de passe"}
          </button>
          <button type="button" class="login__link" id="back-login">← Retour à la connexion</button>
        </form>
      </div>`;
    root.querySelector("#forgot-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (state.forgotBusy) return;
      requestForgotPassword();
    });
    root.querySelector("#back-login")?.addEventListener("click", () => {
      state.loginMode = "login";
      state.loginError = "";
      state.loginInfo = "";
      render();
    });
    return;
  }

  root.innerHTML = `
    <div class="login">
      <form class="login__card" id="login-form">
        <img class="login__logo" src="assets/logo-mkl-energies.png?v=officiel" alt="MKL Énergies" />
        <h1>CRM MKL Énergies</h1>
        <p>Leads, agenda &amp; réalisations</p>
        <label class="login__label" for="password">Mot de passe</label>
        <input class="login__input" id="password" name="password" type="password" autocomplete="current-password" required autofocus />
        <p class="login__error" role="alert">${escapeHtml(state.loginError)}</p>
        ${state.loginInfo ? `<p class="login__info" role="status">${escapeHtml(state.loginInfo)}</p>` : ""}
        <button class="btn btn--primary btn--block" type="submit">Se connecter</button>
        <button type="button" class="login__link" id="forgot-link">Mot de passe oublié ?</button>
      </form>
    </div>`;

  root.querySelector("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Connexion…";
    }
    const pwd = new FormData(e.target).get("password");
    login(String(pwd || "")).finally(() => {
      if (btn && !isLoggedIn()) {
        btn.disabled = false;
        btn.textContent = "Se connecter";
      }
    });
  });
  root.querySelector("#forgot-link")?.addEventListener("click", () => {
    state.loginMode = "forgot";
    state.loginError = "";
    state.loginInfo = "";
    render();
  });
}

function renderComptePanel(panel) {
  panel.innerHTML = `
    <div class="main__head">
      <div>
        <h1>Compte &amp; mot de passe</h1>
        <p>Modifiez le mot de passe du CRM. En cas d’oubli, un nouveau mot de passe peut être envoyé à <strong>${escapeHtml(state.resetEmail)}</strong>.</p>
      </div>
    </div>
    <section class="upload-card">
      <h2>Changer le mot de passe</h2>
      <form id="change-password-form" class="password-form">
        <label>Mot de passe actuel
          <input name="currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <label>Nouveau mot de passe
          <input name="newPassword" type="password" autocomplete="new-password" minlength="12" required />
        </label>
        <label>Confirmer le nouveau mot de passe
          <input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required />
        </label>
        <p class="upload-hint">Minimum 12 caractères. Les autres sessions admin seront déconnectées.</p>
        <p class="login__error" role="alert">${escapeHtml(state.passwordFormError)}</p>
        ${state.passwordFormOk ? `<p class="login__info" role="status">${escapeHtml(state.passwordFormOk)}</p>` : ""}
        <button type="submit" class="btn btn--primary" id="change-password-btn">Enregistrer le nouveau mot de passe</button>
      </form>
    </section>
    <section class="upload-card">
      <h2>Mot de passe oublié</h2>
      <p class="upload-hint">Sur l’écran de connexion, utilisez « Mot de passe oublié ? » pour recevoir un nouveau mot de passe sur <strong>${escapeHtml(state.resetEmail)}</strong>.</p>
    </section>
  `;

  panel.querySelector("#change-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const btn = panel.querySelector("#change-password-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Enregistrement…";
    }
    const ok = await changePassword({
      currentPassword: String(fd.get("currentPassword") || ""),
      newPassword: String(fd.get("newPassword") || ""),
      confirmPassword: String(fd.get("confirmPassword") || ""),
    });
    if (ok) e.currentTarget.reset();
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Enregistrer le nouveau mot de passe";
    }
  });
}

function comingSoon(panel, title, text) {
  panel.innerHTML = `
    <div class="main__head">
      <div>
        <h1>${title}</h1>
        <p>Module prévu pour les prochaines versions du back-office.</p>
      </div>
    </div>
    <div class="panel coming">
      <h2>Bientôt disponible</h2>
      <p>${text}</p>
    </div>`;
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPersonName(record) {
  const first = String(record?.firstName || "").trim();
  const last = String(record?.lastName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return String(record?.name || "").trim() || "—";
}

function formatPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length !== 10) return phone;
  return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

async function loadLeads() {
  state.leadsLoading = true;
  render();
  try {
    const res = await apiFetch("/api/leads");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Chargement impossible");
    state.leads = data.leads || [];
    state.complianceEnabled = !!data.complianceEnabled;
  } catch (err) {
    state.leads = [];
    if (isLoggedIn()) showToast(err.message || "Impossible de charger les leads", false);
  } finally {
    state.leadsLoading = false;
    render();
  }
}

async function setLeadStatus(id, status) {
  try {
    const res = await apiFetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Mise à jour impossible");
    const idx = state.leads.findIndex((l) => l.id === id);
    if (idx >= 0) state.leads[idx] = data.lead;
    render();
  } catch (err) {
    showToast(err.message || "Mise à jour impossible", false);
  }
}

function canOutboundCall(lead) {
  if (!state.complianceEnabled) return true;
  const status = lead?.callbackCompliance;
  if (status === "authorized") return true;
  if (status === "rdv_context") return true;
  return false;
}

function complianceBadgeHtml(lead) {
  if (!state.complianceEnabled) return "";
  const key = lead.callbackCompliance || "unjustified";
  const label = COMPLIANCE_LABELS[key] || key;
  const deadline =
    lead.callbackDeadlineLocal ||
    (lead.callbackDeadline ? String(lead.callbackDeadline).slice(0, 10) : "");
  return `
    <div class="lead-card__compliance lead-card__compliance--${escapeAttr(key)}">
      <span class="compliance-badge compliance-badge--${escapeAttr(key)}">${escapeHtml(label)}</span>
      ${
        deadline
          ? `<span class="compliance-deadline">Date limite de rappel : <strong>${escapeHtml(deadline)}</strong></span>`
          : ""
      }
      ${
        lead.proofLevel === "legacy_intent_only"
          ? `<span class="compliance-legacy">Preuve incomplète (historique) — ne pas traiter comme autorisation Bloctel.</span>`
          : ""
      }
      ${
        lead.meetingType
          ? `<span class="compliance-meeting">RDV ${escapeHtml(
              lead.meetingType === "physique" ? "physique" : "téléphonique"
            )}</span>`
          : ""
      }
    </div>`;
}

function callActionHtml(lead) {
  if (canOutboundCall(lead)) {
    return `<a class="btn btn--yellow" href="tel:${escapeAttr(lead.phone)}">Appeler</a>`;
  }
  const reason =
    lead.callbackCompliance === "opposition"
      ? "Opposition enregistrée — appel intégré bloqué"
      : lead.callbackCompliance === "expired"
        ? "Délai de rappel expiré — appel intégré bloqué"
        : "Rappel non justifié — appel intégré bloqué";
  return `<button type="button" class="btn btn--ghost" disabled title="${escapeAttr(reason)}">${escapeHtml(
    reason
  )}</button>`;
}

async function registerOpposition(id) {
  const note = window.prompt("Note d’opposition (optionnel) :", "") ?? null;
  if (note === null) return;
  try {
    const res = await apiFetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opposition: true, oppositionNote: note }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Opposition impossible");
    const idx = state.leads.findIndex((l) => l.id === id);
    if (idx >= 0) state.leads[idx] = data.lead;
    showToast("Opposition enregistrée", true);
    render();
  } catch (err) {
    showToast(err.message || "Opposition impossible", false);
  }
}

async function openProof(proofId) {
  if (!proofId) {
    showToast("Aucune preuve numérique liée", false);
    return;
  }
  try {
    const res = await apiFetch(`/api/proofs/${proofId}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Preuve introuvable");
    state.proofModal = data.proof;
    render();
  } catch (err) {
    showToast(err.message || "Preuve introuvable", false);
  }
}

function renderProofModal() {
  if (!state.proofModal) return "";
  const p = state.proofModal;
  return `
    <div class="proof-modal" role="dialog" aria-modal="true" aria-label="Preuve numérique">
      <div class="proof-modal__card">
        <header class="proof-modal__head">
          <h2>Preuve numérique</h2>
          <button type="button" class="btn btn--ghost" id="proof-close">Fermer</button>
        </header>
        <dl class="proof-modal__grid">
          <div><dt>Identifiant</dt><dd><code>${escapeHtml(p.proofId)}</code></dd></div>
          <div><dt>Horodatage</dt><dd>${escapeHtml(formatDate(p.createdAt))}</dd></div>
          <div><dt>Action</dt><dd>${escapeHtml(p.action)}</dd></div>
          <div><dt>Intent</dt><dd>${escapeHtml(p.intent)}</dd></div>
          <div><dt>Projets</dt><dd>${escapeHtml((p.projects || []).join(", ") || "—")}</dd></div>
          <div><dt>Case rappel</dt><dd>${p.callbackChecked ? "cochée" : "non cochée"}</dd></div>
          <div><dt>Type RDV</dt><dd>${escapeHtml(p.meetingType || "—")}</dd></div>
          <div><dt>Version texte</dt><dd><code>${escapeHtml(p.formCopyVersion || "")}</code></dd></div>
          <div><dt>Échéance rappel</dt><dd>${escapeHtml(p.callbackDeadlineLocal || p.callbackDeadline || "—")}</dd></div>
          <div><dt>Empreinte</dt><dd><code>${escapeHtml(p.integritySha256 || "")}</code></dd></div>
        </dl>
        <p class="proof-modal__legal"><strong>Texte affiché :</strong> ${escapeHtml(p.legalText || "")}</p>
        ${
          Array.isArray(p.oppositions) && p.oppositions.length
            ? `<div class="proof-modal__ops"><strong>Oppositions</strong><ul>${p.oppositions
                .map(
                  (o) =>
                    `<li>${escapeHtml(formatDate(o.at))} — ${escapeHtml(o.note || "sans note")}</li>`
                )
                .join("")}</ul></div>`
            : ""
        }
      </div>
    </div>`;
}

async function loadAppointments() {
  state.appointmentsLoading = true;
  render();
  try {
    const res = await apiFetch("/api/appointments");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Chargement impossible");
    state.appointments = data.appointments || [];
  } catch (err) {
    state.appointments = [];
    if (isLoggedIn()) showToast(err.message || "Impossible de charger l’agenda", false);
  } finally {
    state.appointmentsLoading = false;
    render();
  }
}

async function setAppointmentStatus(id, status) {
  try {
    const res = await apiFetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Mise à jour impossible");
    const idx = state.appointments.findIndex((a) => a.id === id);
    if (idx >= 0) state.appointments[idx] = data.appointment;
    render();
  } catch (err) {
    showToast(err.message || "Mise à jour impossible", false);
  }
}

function intentLabel(intent) {
  if (intent === "rappel") return "Rappel";
  if (intent === "rdv") return "RDV";
  return "Devis";
}

const CRM_JOB_STATUS = {
  pending: "En attente",
  error: "Échec",
  failed: "Abandonnée",
  sent: "Transmis",
};

async function loadCrmOutbox() {
  state.crmJobsLoading = true;
  render();
  try {
    const res = await apiFetch("/api/crm-outbox");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "File illisible");
    state.crmJobs = data.jobs || [];
    state.crmSyncEnabled = Boolean(data.syncEnabled);
    state.crmSyncConfigured = Boolean(data.syncConfigured);
  } catch (err) {
    state.crmJobs = [];
    // Le message n'est montré que si la session tient encore : après une
    // déconnexion, l'échec est normal et une alerte serait trompeuse.
    if (isLoggedIn()) showToast(err.message || "Impossible de charger la file", false);
  } finally {
    state.crmJobsLoading = false;
    render();
  }
}

async function retryCrmJob(jobId) {
  try {
    const res = await apiFetch(`/api/crm-outbox/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Reprise impossible");
    showToast("Tâche remise en file", true);
  } catch (err) {
    showToast(err.message || "Reprise impossible", false);
  }
  await loadCrmOutbox();
}

/**
 * La file vue par l'administration. Le texte d'en-tête distingue les trois
 * états possibles, parce qu'ils appellent trois gestes différents : liaison
 * active, liaison configurée mais coupée, liaison pas encore configurée. Dans
 * les trois cas la phrase dit la même chose sur le fond — aucune demande n'est
 * perdue — pour qu'une file qui s'allonge n'inquiète pas à tort.
 */
function renderCrmOutboxPanel(panel) {
  const retryable = state.crmJobs.filter((job) => job.status === "error" || job.status === "failed").length;
  const syncNotice = state.crmSyncEnabled
    ? "Les demandes sont transmises au CRM dès leur réception, et réessayées en cas de coupure."
    : state.crmSyncConfigured
      ? "Envoi vers le CRM désactivé. Les demandes restent en file, aucune n’est perdue."
      : "Aucun envoi vers le CRM : la liaison n’est pas encore configurée. Les demandes restent en file.";
  panel.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Synchronisation CRM</h1>
        <p>${escapeHtml(syncNotice)}</p>
      </div>
      <button type="button" class="btn btn--ghost" id="refresh-sync" ${state.crmJobsLoading ? "disabled" : ""}>
        ${state.crmJobsLoading ? "Chargement…" : "Actualiser"}
      </button>
    </header>
    <p class="compliance-disclaimer">${retryable ? `${retryable} tâche${retryable > 1 ? "s" : ""} à reprendre.` : "Les nouvelles demandes restent d’abord enregistrées sur le site."}</p>
    <div class="leads-list" id="sync-list"></div>
  `;
  const list = panel.querySelector("#sync-list");
  if (state.crmJobsLoading && state.crmJobs.length === 0) {
    list.innerHTML = `<div class="panel coming"><p>Chargement…</p></div>`;
  } else if (state.crmJobs.length === 0) {
    list.innerHTML = `<div class="panel coming"><h2>Aucune tâche</h2><p>Les prochaines demandes apparaîtront ici, sans quitter le site.</p></div>`;
  } else {
    list.innerHTML = state.crmJobs
      .map((job) => {
        const when = job.status === "error" && job.nextRetryAt ? ` · nouvel essai ${formatDate(job.nextRetryAt)}` : "";
        const detail = job.status === "sent"
          ? `Transmise le ${formatDate(job.sentAt)}`
          : job.lastError
            ? escapeHtml(job.lastError)
            : "Pas encore transmise.";
        const canRetry = job.status === "error" || job.status === "failed";
        return `
        <article class="lead-card">
          <div class="lead-card__top">
            <div>
              <h3>${escapeHtml(job.label || "Demande")}</h3>
              <p class="lead-card__meta">${escapeHtml(job.kind === "appointment" ? "Rendez-vous" : "Demande")} · ${escapeHtml(job.intent || "")}</p>
            </div>
            <span class="lead-status">${escapeHtml(CRM_JOB_STATUS[job.status] || job.status)}</span>
          </div>
          <p class="lead-card__msg">${detail}${escapeHtml(when)} · essais ${Number(job.attempts) || 0}</p>
          ${canRetry ? `<button type="button" class="btn btn--ghost" data-retry="${escapeHtml(job.id)}">Reprendre</button>` : ""}
        </article>`;
      })
      .join("");
  }
  panel.querySelector("#refresh-sync")?.addEventListener("click", loadCrmOutbox);
  for (const button of panel.querySelectorAll("[data-retry]")) {
    button.addEventListener("click", () => retryCrmJob(button.dataset.retry));
  }
}

function renderLeadsPanel(panel) {
  let filtered =
    state.leadsFilter === "all"
      ? state.leads
      : state.leads.filter((l) => l.status === state.leadsFilter);
  if (state.complianceEnabled && state.complianceFilter !== "all") {
    filtered = filtered.filter((l) => (l.callbackCompliance || "unjustified") === state.complianceFilter);
  }
  const newCount = state.leads.filter((l) => l.status === "nouveau").length;

  panel.innerHTML = `
    <div class="main__head">
      <div>
        <h1>Leads CRM</h1>
        <p>Devis, rappels et RDV issus du site.${newCount ? ` <strong>${newCount} nouveau${newCount > 1 ? "x" : ""}</strong>` : ""}${
          state.complianceEnabled
            ? ` · Conformité rappels <strong>active</strong> (flag local)`
            : ""
        }</p>
      </div>
      <div class="actions-bar">
        <button type="button" class="btn btn--ghost" id="refresh-leads" ${state.leadsLoading ? "disabled" : ""}>
          ${state.leadsLoading ? "Chargement…" : "Actualiser"}
        </button>
      </div>
    </div>
    <div class="leads-filters">
      ${["all", "nouveau", "contacte", "traite"]
        .map((f) => {
          const label = f === "all" ? "Tous" : STATUS_LABELS[f];
          return `<button type="button" class="leads-filter ${state.leadsFilter === f ? "is-active" : ""}" data-leads-filter="${f}">${label}</button>`;
        })
        .join("")}
    </div>
    ${
      state.complianceEnabled
        ? `<div class="leads-filters leads-filters--compliance">
            ${[
              ["all", "Tous statuts rappel"],
              ["authorized", "Rappel justifié"],
              ["unjustified", "Non justifié"],
              ["expired", "Expiré"],
              ["opposition", "Opposition"],
              ["rdv_context", "Cadre RDV"],
            ]
              .map(
                ([f, label]) =>
                  `<button type="button" class="leads-filter ${state.complianceFilter === f ? "is-active" : ""}" data-compliance-filter="${f}">${label}</button>`
              )
              .join("")}
          </div>
          <p class="compliance-disclaimer">Blocage logiciel des boutons d’appel uniquement — il ne garantit pas qu’aucun appel externe ne sera effectué.</p>`
        : ""
    }
    <div class="leads-list" id="leads-list"></div>
    ${renderProofModal()}
  `;

  const list = panel.querySelector("#leads-list");
  if (state.leadsLoading && state.leads.length === 0) {
    list.innerHTML = `<div class="panel coming"><p>Chargement des leads…</p></div>`;
  } else if (filtered.length === 0) {
    list.innerHTML = `<div class="panel coming"><h2>Aucun lead</h2><p>Les demandes du formulaire apparaîtront ici.</p></div>`;
  } else {
    list.innerHTML = filtered
      .map((lead) => {
        const projects = (lead.projects || [])
          .map((p) => PROJECT_LABELS[p] || p)
          .join(" · ");
        const phoneDisplay = canOutboundCall(lead)
          ? `<a href="tel:${escapeAttr(lead.phone)}">${formatPhone(lead.phone)}</a>`
          : `<span class="phone-blocked" title="Appel intégré bloqué">${formatPhone(lead.phone)}</span>`;
        return `
        <article class="lead-card lead-card--${lead.status}">
          <div class="lead-card__top">
            <div>
              <h3>${escapeHtml(formatPersonName(lead))}</h3>
              <p class="lead-card__meta">${formatDate(lead.createdAt)} · ${intentLabel(lead.intent)}${lead.source === "rdv" ? " · agenda" : ""}</p>
            </div>
            <span class="lead-status lead-status--${lead.status}">${STATUS_LABELS[lead.status] || lead.status}</span>
          </div>
          ${complianceBadgeHtml(lead)}
          <div class="lead-card__grid">
            ${phoneDisplay}
            ${lead.email ? `<a href="mailto:${escapeAttr(lead.email)}">${escapeHtml(lead.email)}</a>` : "<span>—</span>"}
            <span>${escapeHtml(lead.postalCode)} · ${escapeHtml(lead.housing)}</span>
            <span>${escapeHtml(projects)}</span>
          </div>
          ${
            lead.heatingCurrent ||
            lead.surfaceBand ||
            lead.ownership ||
            lead.projectTimeline ||
            lead.roofType ||
            lead.batteryChoice ||
            lead.billMonthlyEur ||
            lead.annualKwh ||
            lead.consumptionUnknown ||
            lead.sourceLabel ||
            lead.roomsBand ||
            lead.climNeed ||
            lead.climSurfaceBand ||
            lead.climExisting ||
            lead.climSystemHint
              ? `<div class="lead-card__pac">
                  ${lead.sourceLabel ? `<span>Source : <strong>${escapeHtml(lead.sourceLabel)}</strong></span>` : ""}
                  ${lead.heatingCurrent ? `<span>Chauffage : <strong>${escapeHtml(HEATING_LABELS[lead.heatingCurrent] || lead.heatingCurrent)}</strong></span>` : ""}
                  ${lead.surfaceBand ? `<span>Surface : <strong>${escapeHtml(SURFACE_LABELS[lead.surfaceBand] || lead.surfaceBand)}</strong></span>` : ""}
                  ${lead.ownership ? `<span>Occupant : <strong>${escapeHtml(OWNERSHIP_LABELS[lead.ownership] || lead.ownership)}</strong></span>` : ""}
                  ${lead.roofType ? `<span>Toiture : <strong>${escapeHtml(ROOF_LABELS[lead.roofType] || lead.roofType)}</strong></span>` : ""}
                  ${lead.batteryChoice ? `<span>Batterie : <strong>${escapeHtml(BATTERY_LABELS[lead.batteryChoice] || lead.batteryChoice)}</strong></span>` : ""}
                  ${lead.billMonthlyEur ? `<span>Facture : <strong>${escapeHtml(lead.billMonthlyEur)} €/mois</strong></span>` : ""}
                  ${lead.annualKwh ? `<span>Conso : <strong>${escapeHtml(lead.annualKwh)} kWh/an</strong></span>` : ""}
                  ${lead.consumptionUnknown ? `<span>Conso : <strong>Non connue</strong></span>` : ""}
                  ${lead.roomsBand ? `<span>Pièces : <strong>${escapeHtml(CLIM_ROOMS_LABELS[lead.roomsBand] || lead.roomsBand)}</strong></span>` : ""}
                  ${lead.climSurfaceBand ? `<span>Surface clim : <strong>${escapeHtml(CLIM_SURFACE_LABELS[lead.climSurfaceBand] || lead.climSurfaceBand)}</strong></span>` : ""}
                  ${lead.climExisting ? `<span>Existant : <strong>${escapeHtml(CLIM_EXISTING_LABELS[lead.climExisting] || lead.climExisting)}</strong></span>` : ""}
                  ${lead.climNeed ? `<span>Besoin : <strong>${escapeHtml(CLIM_NEED_LABELS[lead.climNeed] || lead.climNeed)}</strong></span>` : ""}
                  ${lead.climSystemHint ? `<span>Orientation : <strong>${escapeHtml(CLIM_SYSTEM_LABELS[lead.climSystemHint] || lead.climSystemHint)}</strong></span>` : ""}
                  ${lead.projectTimeline ? `<span>Délai : <strong>${escapeHtml(TIMELINE_LABELS[lead.projectTimeline] || lead.projectTimeline)}</strong></span>` : ""}
                </div>`
              : ""
          }
          ${lead.message ? `<p class="lead-card__msg">${escapeHtml(lead.message)}</p>` : ""}
          <div class="lead-card__actions">
            <label>
              Statut
              <select data-lead-status="${lead.id}">
                ${Object.entries(STATUS_LABELS)
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${lead.status === value ? "selected" : ""}>${label}</option>`
                  )
                  .join("")}
              </select>
            </label>
            ${callActionHtml(lead)}
            ${
              state.complianceEnabled && lead.proofId
                ? `<button type="button" class="btn btn--ghost" data-open-proof="${escapeAttr(lead.proofId)}">Preuve numérique</button>`
                : state.complianceEnabled
                  ? `<span class="compliance-no-proof">Sans preuve</span>`
                  : ""
            }
            ${
              state.complianceEnabled && lead.callbackCompliance !== "opposition"
                ? `<button type="button" class="btn btn--ghost" data-opposition="${escapeAttr(lead.id)}">Enregistrer opposition</button>`
                : ""
            }
          </div>
        </article>`;
      })
      .join("");
  }

  panel.querySelector("#refresh-leads")?.addEventListener("click", () => loadLeads());
  panel.querySelectorAll("[data-leads-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.leadsFilter = btn.dataset.leadsFilter;
      render();
    });
  });
  panel.querySelectorAll("[data-compliance-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.complianceFilter = btn.dataset.complianceFilter;
      render();
    });
  });
  panel.querySelectorAll("[data-lead-status]").forEach((sel) => {
    sel.addEventListener("change", () => {
      setLeadStatus(sel.dataset.leadStatus, sel.value);
    });
  });
  panel.querySelectorAll("[data-open-proof]").forEach((btn) => {
    btn.addEventListener("click", () => openProof(btn.dataset.openProof));
  });
  panel.querySelectorAll("[data-opposition]").forEach((btn) => {
    btn.addEventListener("click", () => registerOpposition(btn.dataset.opposition));
  });
  panel.querySelector("#proof-close")?.addEventListener("click", () => {
    state.proofModal = null;
    render();
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function renderRealisationsPanel(panel) {
  panel.innerHTML = `
    <div class="main__head">
      <div>
        <h1>Réalisations</h1>
        <p>1) Photo de pastille par métier · 2) Photos de chantiers par village. Le logo MKL est ajouté automatiquement en petit.</p>
      </div>
      <div class="actions-bar">
        <button type="button" class="btn btn--yellow" id="publish-covers" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Enregistrement…" : state.dirty ? "Enregistrer maintenant" : "À jour ✓"}
        </button>
      </div>
    </div>

    <section class="upload-card">
      <h2>Pastilles métiers (page d’accueil)</h2>
      <p class="upload-hint">Une belle photo par corps de métier. Au clic sur le site, on ouvre les réalisations de ce métier. Logo MKL ajouté en bas à droite.</p>
      <div class="metier-admin" id="metier-cover-list">
        ${CATEGORIES.map((cat) => {
          const src = categoryCoverSrc(cat);
          return `
            <article class="metier-admin__card" data-metier="${cat.id}">
              <img src="${src}" alt="" />
              <div>
                <h3>${escapeHtml(cat.title)}</h3>
                <label class="upload-file">
                  Changer la photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" data-metier-file="${cat.id}" />
                </label>
              </div>
            </article>`;
        }).join("")}
      </div>
    </section>

    <form class="upload-card" id="upload-form">
      <h2>Ajouter un chantier / des photos</h2>
      <div class="upload-grid">
        <label>Village
          <input name="village" required placeholder="Ex. Mulhouse" />
        </label>
        <label>Métier
          <select name="category" required>
            ${CATEGORIES.map((c) => `<option value="${c.id}">${c.title}</option>`).join("")}
          </select>
        </label>
        <label>Titre (optionnel)
          <input name="title" placeholder="Ex. Photovoltaïque" />
        </label>
        <label class="upload-file">Photos
          <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required />
        </label>
      </div>
      <p class="upload-hint">Si le village + métier existe déjà, les photos s’ajoutent au même chantier. Chaque photo reçoit le logo MKL Énergies en petit.</p>
      <button type="submit" class="btn btn--primary" id="upload-btn">Publier sur le site</button>
    </form>
    <div class="chantier-admin" id="chantier-list"></div>
    <p class="hint">
      Sur chaque chantier : photo principale, remplacer, supprimer une photo, ou supprimer tout le chantier.
      Rechargez le site public si besoin (<code>Ctrl+F5</code>).
    </p>
  `;

  async function readFilesAsDataUrls(fileList) {
    return Promise.all(
      [...fileList].map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, data: reader.result });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    );
  }

  async function applyRealisationsResponse(data, toastMsg) {
    REALISATIONS = data.realisations || REALISATIONS;
    if (data.covers && typeof data.covers === "object") {
      state.covers = { ...state.covers, ...data.covers };
    }
    await loadCovers();
    showToast(toastMsg, true);
  }

  panel.querySelectorAll("[data-metier-file]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      const category = input.dataset.metierFile;
      if (!file || !category) return;
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const res = await apiFetch("/api/category-covers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            file: { name: file.name, data: dataUrl },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Envoi impossible");
        state.categoryCovers = data.covers || {};
        showToast("Pastille métier mise à jour", true);
        render();
      } catch (err) {
        showToast(err.message || "Envoi impossible", false);
      } finally {
        input.value = "";
      }
    });
  });

  panel.querySelector("#upload-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = panel.querySelector("#upload-btn");
    const fd = new FormData(form);
    const files = [...(fd.getAll("photos") || [])].filter((f) => f && f.size);
    if (!files.length) return;
    btn.disabled = true;
    btn.textContent = "Envoi…";
    try {
      const encoded = await readFilesAsDataUrls(files);
      const res = await apiFetch("/api/realisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          village: fd.get("village"),
          category: fd.get("category"),
          title: fd.get("title"),
          files: encoded,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Envoi impossible");
      form.reset();
      await applyRealisationsResponse(data, "Photos publiées sur le site");
    } catch (err) {
      showToast(err.message || "Envoi impossible", false);
    } finally {
      btn.disabled = false;
      btn.textContent = "Publier sur le site";
    }
  });

  const list = panel.querySelector("#chantier-list");
  list.innerHTML = REALISATIONS.length
    ? REALISATIONS.map((r) => {
        const cover = getCover(r.id);
        return `
      <article class="chantier-admin__card" data-id="${escapeAttr(r.id)}">
        <div class="chantier-admin__top">
          <img class="chantier-admin__preview" src="${escapeAttr(r.photos[cover])}" alt="" />
          <div class="chantier-admin__meta">
            <h3>${escapeHtml(r.village)}</h3>
            <p>${escapeHtml(categoryLabel(r.category))} · ${escapeHtml(r.title)}</p>
            <span class="badge">Photo ${cover + 1} / ${r.photos.length}</span>
            <div class="chantier-admin__actions">
              <label class="btn btn--ghost chantier-admin__add">
                Ajouter des photos
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-add-photos="${escapeAttr(r.id)}" />
              </label>
              <button type="button" class="btn btn--danger-ghost" data-delete-chantier="${escapeAttr(r.id)}">
                Supprimer le chantier
              </button>
            </div>
          </div>
        </div>
        <div class="chantier-admin__photos">
          ${r.photos
            .map(
              (src, i) => `
            <div class="photo-pick ${i === cover ? "is-cover" : ""}" data-photo-wrap="${escapeAttr(r.id)}" data-index="${i}">
              <button type="button" class="photo-pick__main" data-set-cover="${escapeAttr(r.id)}" data-index="${i}" aria-label="Définir photo ${i + 1} comme principale">
                <img src="${escapeAttr(src)}?v=${encodeURIComponent(src)}" alt="" />
                ${i === cover ? `<span class="photo-pick__label">Principale</span>` : ""}
              </button>
              <div class="photo-pick__tools">
                <label class="photo-pick__tool" title="Remplacer">
                  Remplacer
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-replace-photo="${escapeAttr(r.id)}" data-index="${i}" />
                </label>
                <button type="button" class="photo-pick__tool photo-pick__tool--danger" data-delete-photo="${escapeAttr(r.id)}" data-index="${i}">
                  Supprimer
                </button>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </article>`;
      }).join("")
    : `<div class="panel coming"><h2>Aucun chantier</h2><p>Ajoutez un village, un métier et des photos ci-dessus.</p></div>`;

  list.querySelectorAll("[data-set-cover]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setCover(btn.dataset.setCover, Number(btn.dataset.index));
    });
  });

  list.querySelectorAll("[data-delete-chantier]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteChantier;
      const chantier = REALISATIONS.find((r) => r.id === id);
      if (!id || !chantier) return;
      if (
        !confirm(
          `Supprimer le chantier « ${chantier.village} — ${chantier.title} » et toutes ses photos ?`
        )
      ) {
        return;
      }
      try {
        const res = await apiFetch(`/api/realisations/${encodeURIComponent(id)}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Suppression impossible");
        delete state.covers[id];
        await applyRealisationsResponse(data, "Chantier supprimé");
      } catch (err) {
        showToast(err.message || "Suppression impossible", false);
      }
    });
  });

  list.querySelectorAll("[data-delete-photo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deletePhoto;
      const index = Number(btn.dataset.index);
      const chantier = REALISATIONS.find((r) => r.id === id);
      if (!id || !chantier) return;
      const last = chantier.photos.length <= 1;
      if (
        !confirm(
          last
            ? "Dernière photo : le chantier entier sera supprimé. Continuer ?"
            : `Supprimer la photo ${index + 1} de ce chantier ?`
        )
      ) {
        return;
      }
      try {
        const res = await apiFetch(`/api/realisations/${encodeURIComponent(id)}/photos/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Suppression impossible");
        if (data.deletedChantier) delete state.covers[id];
        await applyRealisationsResponse(
          data,
          data.deletedChantier ? "Chantier supprimé (plus de photos)" : "Photo supprimée"
        );
      } catch (err) {
        showToast(err.message || "Suppression impossible", false);
      }
    });
  });

  list.querySelectorAll("[data-replace-photo]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      const id = input.dataset.replacePhoto;
      const index = Number(input.dataset.index);
      if (!file || !id) return;
      try {
        const [encoded] = await readFilesAsDataUrls([file]);
        const res = await apiFetch(`/api/realisations/${encodeURIComponent(id)}/photos/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, file: encoded }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Remplacement impossible");
        await applyRealisationsResponse(data, "Photo remplacée");
      } catch (err) {
        showToast(err.message || "Remplacement impossible", false);
      } finally {
        input.value = "";
      }
    });
  });

  list.querySelectorAll("[data-add-photos]").forEach((input) => {
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      const id = input.dataset.addPhotos;
      const chantier = REALISATIONS.find((r) => r.id === id);
      if (!files.length || !chantier) return;
      try {
        const encoded = await readFilesAsDataUrls(files);
        const res = await apiFetch("/api/realisations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chantierId: id,
            village: chantier.village,
            category: chantier.category,
            title: chantier.title,
            files: encoded,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Ajout impossible");
        await applyRealisationsResponse(data, "Photos ajoutées au chantier");
      } catch (err) {
        showToast(err.message || "Ajout impossible", false);
      } finally {
        input.value = "";
      }
    });
  });

  panel.querySelector("#publish-covers")?.addEventListener("click", () => {
    saveCoversToServer();
  });
}

function renderAgendaPanel(panel) {
  const upcoming = [...state.appointments].sort((a, b) =>
    `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)
  );

  panel.innerHTML = `
    <div class="main__head">
      <div>
        <h1>Agenda RDV</h1>
        <p>Rendez-vous pris en ligne par les clients. Un même créneau peut être réservé plusieurs fois (plusieurs commerciaux).</p>
      </div>
      <div class="actions-bar">
        <button type="button" class="btn btn--ghost" id="refresh-appts" ${state.appointmentsLoading ? "disabled" : ""}>
          ${state.appointmentsLoading ? "Chargement…" : "Actualiser"}
        </button>
      </div>
    </div>
    <div class="leads-list" id="appts-list"></div>
    ${renderProofModal()}
  `;

  const list = panel.querySelector("#appts-list");
  if (state.appointmentsLoading && upcoming.length === 0) {
    list.innerHTML = `<div class="panel coming"><p>Chargement de l’agenda…</p></div>`;
  } else if (upcoming.length === 0) {
    list.innerHTML = `<div class="panel coming"><h2>Aucun RDV</h2><p>Les réservations du site apparaîtront ici.</p></div>`;
  } else {
    list.innerHTML = upcoming
      .map((appt) => {
        const day = formatDate(`${appt.date}T${appt.time}:00`);
        return `
        <article class="lead-card lead-card--${appt.status === "confirme" ? "nouveau" : appt.status === "annule" ? "traite" : "contacte"}">
          <div class="lead-card__top">
            <div>
              <h3>${escapeHtml(formatPersonName(appt))}</h3>
              <p class="lead-card__meta">${escapeHtml(appt.date)} à ${escapeHtml(appt.time)} · réservé ${formatDate(appt.createdAt)}</p>
            </div>
            <span class="lead-status lead-status--${appt.status === "confirme" ? "nouveau" : appt.status === "annule" ? "traite" : "contacte"}">${APPT_STATUS[appt.status] || appt.status}</span>
          </div>
          <div class="lead-card__grid">
            <a href="tel:${appt.phone}">${formatPhone(appt.phone)}</a>
            ${appt.email ? `<a href="mailto:${escapeAttr(appt.email)}">${escapeHtml(appt.email)}</a>` : "<span>—</span>"}
            <span>${escapeHtml(PROJECT_LABELS[appt.project] || appt.project || "Projet à préciser")}</span>
            <span>${escapeHtml(day)}${
              appt.meetingType
                ? ` · ${appt.meetingType === "physique" ? "Physique" : "Téléphonique"}`
                : ""
            }</span>
          </div>
          ${
            appt.proofId
              ? `<div class="lead-card__compliance lead-card__compliance--rdv_context">
                  <span class="compliance-badge compliance-badge--rdv_context">Cadre rendez-vous</span>
                  <button type="button" class="btn btn--ghost btn--small" data-appt-proof="${escapeAttr(appt.proofId)}">Preuve numérique</button>
                </div>`
              : ""
          }
          ${
            appt.heatingCurrent ||
            appt.surfaceBand ||
            appt.ownership ||
            appt.projectTimeline ||
            appt.roofType ||
            appt.batteryChoice ||
            appt.roomsBand ||
            appt.climNeed ||
            appt.climSystemHint ||
            appt.sourceLabel
              ? `<div class="lead-card__pac">
                  ${appt.sourceLabel ? `<span>Source : <strong>${escapeHtml(appt.sourceLabel)}</strong></span>` : ""}
                  ${appt.heatingCurrent ? `<span>Chauffage : <strong>${escapeHtml(HEATING_LABELS[appt.heatingCurrent] || appt.heatingCurrent)}</strong></span>` : ""}
                  ${appt.surfaceBand ? `<span>Surface : <strong>${escapeHtml(SURFACE_LABELS[appt.surfaceBand] || appt.surfaceBand)}</strong></span>` : ""}
                  ${appt.roofType ? `<span>Toiture : <strong>${escapeHtml(ROOF_LABELS[appt.roofType] || appt.roofType)}</strong></span>` : ""}
                  ${appt.batteryChoice ? `<span>Batterie : <strong>${escapeHtml(BATTERY_LABELS[appt.batteryChoice] || appt.batteryChoice)}</strong></span>` : ""}
                  ${appt.ownership ? `<span>Occupant : <strong>${escapeHtml(OWNERSHIP_LABELS[appt.ownership] || appt.ownership)}</strong></span>` : ""}
                  ${appt.roomsBand ? `<span>Pièces : <strong>${escapeHtml(CLIM_ROOMS_LABELS[appt.roomsBand] || appt.roomsBand)}</strong></span>` : ""}
                  ${appt.climNeed ? `<span>Besoin : <strong>${escapeHtml(CLIM_NEED_LABELS[appt.climNeed] || appt.climNeed)}</strong></span>` : ""}
                  ${appt.climSystemHint ? `<span>Orientation : <strong>${escapeHtml(CLIM_SYSTEM_LABELS[appt.climSystemHint] || appt.climSystemHint)}</strong></span>` : ""}
                  ${appt.projectTimeline ? `<span>Délai : <strong>${escapeHtml(TIMELINE_LABELS[appt.projectTimeline] || appt.projectTimeline)}</strong></span>` : ""}
                </div>`
              : ""
          }
          ${appt.note ? `<p class="lead-card__msg">${escapeHtml(appt.note)}</p>` : ""}
          <div class="lead-card__actions">
            <label>
              Statut
              <select data-appt-status="${appt.id}">
                ${Object.entries(APPT_STATUS)
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${appt.status === value ? "selected" : ""}>${label}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <a class="btn btn--yellow" href="tel:${appt.phone}">Appeler</a>
          </div>
        </article>`;
      })
      .join("");
  }

  panel.querySelector("#refresh-appts")?.addEventListener("click", () => loadAppointments());
  panel.querySelectorAll("[data-appt-status]").forEach((sel) => {
    sel.addEventListener("change", () => {
      setAppointmentStatus(sel.dataset.apptStatus, sel.value);
    });
  });
  panel.querySelectorAll("[data-appt-proof]").forEach((btn) => {
    btn.addEventListener("click", () => openProof(btn.dataset.apptProof));
  });
  panel.querySelector("#proof-close")?.addEventListener("click", () => {
    state.proofModal = null;
    render();
  });
}

async function loadClimGallery() {
  state.climGalleryLoading = true;
  render();
  try {
    const res = await apiFetch("/api/admin/clim-gallery");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "Chargement impossible");
    state.climGallery = data.gallery || emptyClimGalleryState();
    if (Array.isArray(data.categories) && data.categories.length) {
      state.climGalleryCategories = data.categories;
    }
  } catch (err) {
    state.toast = err.message || "Galerie clim indisponible";
    state.toastOk = false;
  } finally {
    state.climGalleryLoading = false;
    render();
  }
}

function emptyClimGalleryState() {
  return { version: 1, publishToSite: false, updatedAt: null, items: [] };
}

function renderClimGalleryPanel(panel) {
  const items = [...(state.climGallery.items || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );
  const filtered =
    state.climGalleryFilter === "all"
      ? items
      : state.climGalleryFilter === "selected"
        ? items.filter((it) => it.selected)
        : items.filter((it) => it.category === state.climGalleryFilter);
  const selectedCount = items.filter((it) => it.selected).length;

  panel.innerHTML = `
    <header class="panel-head">
      <div>
        <h1>Galerie climatisation</h1>
        <p class="panel-sub">Préparez monosplit, multisplit et unités extérieures. La page publique garde les photos actuelles tant que la publication n’est pas activée.</p>
      </div>
      <div class="panel-head__actions">
        <button type="button" class="btn btn--ghost" id="clim-gal-refresh" ${state.climGalleryLoading ? "disabled" : ""}>
          ${state.climGalleryLoading ? "Chargement…" : "Actualiser"}
        </button>
        <button type="button" class="btn btn--primary" id="clim-gal-save" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Enregistrement…" : "Enregistrer la sélection"}
        </button>
      </div>
    </header>

    <section class="upload-card">
      <h2>Publication sur climatisation.html</h2>
      <label class="clim-gal-publish">
        <input type="checkbox" id="clim-gal-publish" ${state.climGallery.publishToSite ? "checked" : ""} />
        <span>Remplacer la galerie du site par la sélection ci-dessous</span>
      </label>
      <p class="upload-hint">
        Décoché (recommandé pour l’instant) : le site conserve la galerie HTML actuelle.
        Coché : uniquement les photos <strong>sélectionnées</strong> apparaissent, filtrables par catégorie.
        ${selectedCount} photo(s) sélectionnée(s).
      </p>
    </section>

    <form class="upload-card" id="clim-gal-upload">
      <h2>Ajouter des réalisations MKL</h2>
      <div class="upload-grid">
        <label>Catégorie
          <select name="category" required>
            ${state.climGalleryCategories
              .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
              .join("")}
          </select>
        </label>
        <label>Légende (optionnel)
          <input name="caption" maxlength="120" placeholder="Ex. Multisplit — séjour" />
        </label>
        <label class="upload-file">Photos
          <input name="files" type="file" accept="image/jpeg,image/png,image/webp" multiple required />
        </label>
      </div>
      <p class="upload-hint">Optimisation auto Web (max 1800 px, JPEG, logo MKL). Pas d’images stock / IA — uniquement vos chantiers.</p>
      <button type="submit" class="btn btn--primary" ${state.climGalleryUploading ? "disabled" : ""}>
        ${state.climGalleryUploading ? "Optimisation…" : "Importer et optimiser"}
      </button>
    </form>

    <div class="leads-filters clim-gal-filters">
      <button type="button" class="${state.climGalleryFilter === "all" ? "is-active" : ""}" data-clim-filter="all">Toutes (${items.length})</button>
      <button type="button" class="${state.climGalleryFilter === "selected" ? "is-active" : ""}" data-clim-filter="selected">Sélection (${selectedCount})</button>
      ${state.climGalleryCategories
        .map(
          (c) =>
            `<button type="button" class="${state.climGalleryFilter === c.id ? "is-active" : ""}" data-clim-filter="${c.id}">${escapeHtml(c.title)} (${items.filter((it) => it.category === c.id).length})</button>`
        )
        .join("")}
    </div>

    <div class="clim-gal-grid" id="clim-gal-grid">
      ${
        state.climGalleryLoading && items.length === 0
          ? `<div class="panel coming"><p>Chargement…</p></div>`
          : filtered.length === 0
            ? `<div class="panel coming"><h2>Aucune photo</h2><p>Importez vos réalisations lorsqu’elles seront prêtes (dans quelques jours).</p></div>`
            : filtered
                .map((it) => {
                  const idx = state.climGallery.items.findIndex((x) => x.id === it.id);
                  return `
                <article class="clim-gal-card ${it.selected ? "is-selected" : ""}" data-clim-id="${escapeAttr(it.id)}">
                  <div class="clim-gal-card__media">
                    <img src="${escapeAttr(it.src)}?v=${encodeURIComponent(it.createdAt || "")}" alt="${escapeAttr(it.alt || "")}" loading="lazy" />
                  </div>
                  <div class="clim-gal-card__body">
                    <label class="clim-gal-card__select">
                      <input type="checkbox" data-clim-selected ${it.selected ? "checked" : ""} />
                      Afficher sur le site
                    </label>
                    <label>Catégorie
                      <select data-clim-category>
                        ${state.climGalleryCategories
                          .map(
                            (c) =>
                              `<option value="${c.id}" ${it.category === c.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`
                          )
                          .join("")}
                      </select>
                    </label>
                    <label>Légende
                      <input type="text" data-clim-caption maxlength="120" value="${escapeAttr(it.caption || "")}" />
                    </label>
                    <label>Texte alt
                      <input type="text" data-clim-alt maxlength="160" value="${escapeAttr(it.alt || "")}" />
                    </label>
                    <label>Ordre
                      <input type="number" data-clim-order value="${Number(it.order) || idx}" />
                    </label>
                    <button type="button" class="btn btn--ghost" data-clim-delete>Supprimer</button>
                  </div>
                </article>`;
                })
                .join("")
      }
    </div>
  `;

  panel.querySelector("#clim-gal-refresh")?.addEventListener("click", () => loadClimGallery());
  panel.querySelector("#clim-gal-publish")?.addEventListener("change", (e) => {
    state.climGallery.publishToSite = !!e.target.checked;
  });
  panel.querySelectorAll("[data-clim-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.climGalleryFilter = btn.dataset.climFilter;
      render();
    });
  });

  const syncCard = (card) => {
    const id = card.dataset.climId;
    const item = state.climGallery.items.find((it) => it.id === id);
    if (!item) return;
    item.selected = !!card.querySelector("[data-clim-selected]")?.checked;
    item.category = card.querySelector("[data-clim-category]")?.value || item.category;
    item.caption = String(card.querySelector("[data-clim-caption]")?.value || "").trim();
    item.alt = String(card.querySelector("[data-clim-alt]")?.value || "").trim();
    item.order = Number(card.querySelector("[data-clim-order]")?.value || 0);
  };

  panel.querySelectorAll(".clim-gal-card").forEach((card) => {
    card.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("change", () => syncCard(card));
      el.addEventListener("input", () => syncCard(card));
    });
    card.querySelector("[data-clim-delete]")?.addEventListener("click", async () => {
      const id = card.dataset.climId;
      if (!id || !confirm("Supprimer cette photo de la galerie clim ?")) return;
      try {
        const res = await apiFetch(`/api/admin/clim-gallery/delete/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Suppression impossible");
        state.climGallery = data.gallery;
        state.toast = "Photo supprimée";
        state.toastOk = true;
        render();
      } catch (err) {
        state.toast = err.message || "Suppression impossible";
        state.toastOk = false;
        render();
      }
    });
  });

  panel.querySelector("#clim-gal-save")?.addEventListener("click", async () => {
    panel.querySelectorAll(".clim-gal-card").forEach((card) => syncCard(card));
    state.saving = true;
    render();
    try {
      const res = await apiFetch("/api/admin/clim-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publishToSite: state.climGallery.publishToSite,
          items: state.climGallery.items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Enregistrement impossible");
      state.climGallery = data.gallery;
      state.toast = state.climGallery.publishToSite
        ? "Galerie enregistrée — publication site active"
        : "Galerie enregistrée — site inchangé (publication off)";
      state.toastOk = true;
    } catch (err) {
      state.toast = err.message || "Enregistrement impossible";
      state.toastOk = false;
    } finally {
      state.saving = false;
      render();
    }
  });

  panel.querySelector("#clim-gal-upload")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const category = String(fd.get("category") || "");
    const caption = String(fd.get("caption") || "");
    const fileList = form.querySelector('input[name="files"]')?.files;
    if (!fileList?.length) return;
    state.climGalleryUploading = true;
    render();
    try {
      const files = [];
      for (const file of [...fileList].slice(0, 24)) {
        const dataUrl = await readFileAsDataUrl(file);
        files.push({ name: file.name, data: dataUrl });
      }
      const res = await apiFetch("/api/admin/clim-gallery/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, caption, files }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Import impossible");
      state.climGallery = data.gallery;
      state.toast = `${(data.added || []).length} photo(s) optimisée(s) — non publiées tant que non sélectionnées`;
      state.toastOk = true;
    } catch (err) {
      state.toast = err.message || "Import impossible";
      state.toastOk = false;
    } finally {
      state.climGalleryUploading = false;
      render();
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });
}

function renderShell() {
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <img src="assets/logo-mkl-energies.png?v=officiel" alt="" />
          <span>CRM MKL</span>
        </div>
        <nav class="sidebar__nav" aria-label="Sections">
          <button type="button" class="nav-item ${state.view === "leads" ? "is-active" : ""}" data-view="leads">Leads</button>
          <button type="button" class="nav-item ${state.view === "agenda" ? "is-active" : ""}" data-view="agenda">Agenda RDV</button>
          <button type="button" class="nav-item ${state.view === "realisations" ? "is-active" : ""}" data-view="realisations">Réalisations</button>
          <button type="button" class="nav-item ${state.view === "clim-gallery" ? "is-active" : ""}" data-view="clim-gallery">Galerie clim</button>
          <button type="button" class="nav-item ${state.view === "sync" ? "is-active" : ""}" data-view="sync">Synchro CRM</button>
          <button type="button" class="nav-item ${state.view === "contenu" ? "is-active" : ""}" data-view="contenu">
            Contenu
            <span class="nav-item__soon">Bientôt</span>
          </button>
          <button type="button" class="nav-item ${state.view === "compte" ? "is-active" : ""}" data-view="compte">Compte</button>
        </nav>
        <div class="sidebar__foot">
          <a class="sidebar__link" href="index.html" target="_blank" rel="noopener">Voir le site →</a>
          <button type="button" class="btn btn--ghost" id="logout-btn" style="color:#fff;border-color:rgba(255,255,255,.35)">Déconnexion</button>
        </div>
      </aside>
      <main class="main" id="main-panel"></main>
    </div>
    ${state.toast ? `<div class="toast ${state.toastOk ? "toast--ok" : ""}" role="status">${state.toast}</div>` : ""}
  `;

  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.view;
      state.view = next;
      if (next === "leads" && state.leads.length === 0 && !state.leadsLoading) {
        loadLeads();
        return;
      }
      if (next === "agenda" && state.appointments.length === 0 && !state.appointmentsLoading) {
        loadAppointments();
        return;
      }
      if (next === "sync" && state.crmJobs.length === 0 && !state.crmJobsLoading) {
        loadCrmOutbox();
        return;
      }
      if (next === "clim-gallery" && state.climGallery.items.length === 0 && !state.climGalleryLoading) {
        loadClimGallery();
        return;
      }
      render();
    });
  });
  root.querySelector("#logout-btn")?.addEventListener("click", logout);

  const panel = root.querySelector("#main-panel");
  if (state.view === "realisations") renderRealisationsPanel(panel);
  else if (state.view === "leads") renderLeadsPanel(panel);
  else if (state.view === "agenda") renderAgendaPanel(panel);
  else if (state.view === "clim-gallery") renderClimGalleryPanel(panel);
  else if (state.view === "sync") renderCrmOutboxPanel(panel);
  else if (state.view === "contenu") {
    comingSoon(panel, "Contenu", "Textes, téléphone, horaires — bientôt modifiables ici.");
  } else if (state.view === "compte") {
    renderComptePanel(panel);
  } else {
    comingSoon(panel, "Paramètres", "Mot de passe, utilisateurs, intégrations.");
  }
}

function render() {
  if (!isLoggedIn()) {
    renderLogin();
    return;
  }
  renderShell();
}

(async () => {
  const ok = await restoreSession();
  await Promise.all([loadCovers(), loadCategoryCovers(), loadRealisationsList()]);
  render();
  if (ok) loadLeads();
})();
