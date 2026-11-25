/**
 * Fausse base PostgREST pour les demandes du site.
 *
 * Partagée entre les tests et le script de démonstration. Elle applique les
 * mêmes index uniques que 20261105_web_lead_idempotence.sql : une fausse base
 * permissive validerait un code qui crée des doublons.
 */

export const ORG = "11111111-1111-1111-1111-111111111111";

/** Identifiant de soumission tel que le produit la file OVH. */
export const SOUMISSION = "lead-2026-11-05-abcdef01";

export function uuid(seed) {
  const base = String(seed).padStart(12, "0").slice(-12);
  return `22222222-2222-4222-8222-${base}`;
}

/** Chemin d'un contact dans la clé d'unicité : le rôle absent vaut la chaîne vide. */
export function toucheKey(row) {
  return `${row.organization_id}|${row.submission_id}|${row.touch_role || ""}`;
}

export function webLeadKey(row) {
  const value = row?.extra?.webLead?.submissionId;
  return value ? `${row.organization_id}|${value}` : null;
}

export function conflit() {
  const error = new Error("duplicate key value violates unique constraint");
  error.status = 409;
  error.code = "23505";
  return error;
}

/**
 * Fausse base PostgREST.
 *
 * Volontairement minimale sur la lecture, volontairement stricte sur
 * l'unicité : c'est le seul endroit où une erreur de conception se verrait.
 */
export function faussebase() {
  const state = {
    opportunities: [],
    attribution: [],
    appointments: [],
    submissions: new Map(),
    events: [],
    calls: [],
  };

  let sequence = 0;
  /** Écriture qui doit échouer, pour simuler une coupure. */
  let panneSur = null;
  /** Retenue d'une écriture, pour faire se croiser deux traitements. */
  let retenue = null;

  function param(path, name) {
    const match = path.match(new RegExp(`[?&]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=eq\\.([^&]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function insertOpportunity(row) {
    const key = webLeadKey(row);
    if (key && state.opportunities.some(item => webLeadKey(item) === key)) throw conflit();
    const created = { ...row, id: uuid(`o${++sequence}`), created_at: new Date().toISOString() };
    state.opportunities.push(created);
    return [created];
  }

  function insertAppointment(row) {
    const key = webLeadKey(row);
    if (key && state.appointments.some(item => webLeadKey(item) === key)) throw conflit();
    const created = { ...row, id: uuid(`a${++sequence}`) };
    state.appointments.push(created);
    return null;
  }

  function insertAttribution(rows) {
    const batch = Array.isArray(rows) ? rows : [rows];
    const keys = batch.filter(row => row.submission_id).map(toucheKey);
    const known = new Set(state.attribution.filter(row => row.submission_id).map(toucheKey));
    // Une insertion multiple est une seule transaction : un conflit sur une
    // ligne annule tout le lot, comme en base.
    if (keys.some(key => known.has(key)) || new Set(keys).size !== keys.length) throw conflit();
    for (const row of batch) state.attribution.push({ ...row, id: uuid(`t${++sequence}`) });
    return null;
  }

  function settle(body) {
    const sub = state.submissions.get(body.p_id);
    if (!sub) throw new Error("WEB_LEAD_NOT_FOUND");

    if (body.p_outcome === "succeeded") sub.status = "done";
    else if (body.p_outcome === "review") sub.status = "review";
    else if (body.p_outcome === "retry") sub.status = sub.attempts >= 7 ? "failed" : "pending";
    else throw new Error("WEB_LEAD_UNKNOWN_OUTCOME");

    sub.opportunity_id = sub.opportunity_id || body.p_opportunity_id || null;
    sub.dedup_decision = body.p_dedup_decision || sub.dedup_decision;
    sub.last_error_code = body.p_error_code || null;
    sub.locked_at = null;
    state.events.push({ submission: sub.id, kind: body.p_outcome, attempt: sub.attempts });
    return sub;
  }

  function attach(body) {
    const sub = state.submissions.get(body.p_id);
    if (!sub) throw new Error("WEB_LEAD_NOT_FOUND");
    if (!body.p_opportunity_id) throw new Error("WEB_LEAD_OPPORTUNITY_REQUISE");
    // Le déclencheur de la migration précédente : une fiche déjà rattachée ne
    // peut pas être remplacée par une autre.
    if (sub.opportunity_id && sub.opportunity_id !== body.p_opportunity_id) {
      throw new Error("WEB_LEAD_ALREADY_INTEGRATED");
    }
    sub.opportunity_id = body.p_opportunity_id;
    state.events.push({ submission: sub.id, kind: "opportunity_attached", attempt: sub.attempts });
    return sub;
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const label = `${method} ${path.split("?")[0]}`;
    state.calls.push(label);

    // Point d'attente demandé par le test : le traitement est suspendu ici le
    // temps qu'un second traitement le dépasse.
    if (retenue && retenue.label === label) {
      const attente = retenue;
      retenue = null;
      attente.atteint();
      await attente.liberee;
    }

    if (panneSur && panneSur === label) {
      panneSur = null;
      const error = new Error("COUPURE_SIMULEE");
      error.status = 500;
      throw error;
    }

    if (method === "GET") {
      if (path.startsWith("/rest/v1/commercial_opportunities")) {
        const soumission = param(path, "extra->webLead->>submissionId");
        if (soumission) {
          const found = state.opportunities.filter(
            row => row.extra?.webLead?.submissionId === soumission
          );
          return found.map(row => ({ id: row.id }));
        }
        // Recherche de doublons par téléphone ou e-mail.
        const inner = path.match(/[?&]or=\(([^)]*)\)/);
        if (!inner) return [];
        const wanted = inner[1].split(",").map(item => {
          const [field, , raw] = [item.slice(0, item.indexOf(".")), null, item.slice(item.indexOf("eq.") + 3)];
          return { field, value: decodeURIComponent(raw) };
        });
        return state.opportunities.filter(row =>
          wanted.some(({ field, value }) => String(row[field] || "") === value)
        );
      }
      if (path.startsWith("/rest/v1/lead_attribution")) {
        const soumission = param(path, "submission_id");
        return state.attribution
          .filter(row => row.submission_id === soumission)
          .map(row => ({ touch_role: row.touch_role }));
      }
      if (path.startsWith("/rest/v1/commercial_appointments")) {
        const soumission = param(path, "extra->webLead->>submissionId");
        return state.appointments
          .filter(row => row.extra?.webLead?.submissionId === soumission)
          .map(row => ({ id: row.id }));
      }
      throw new Error(`lecture non simulée : ${path}`);
    }

    if (path === "/rest/v1/commercial_opportunities") return insertOpportunity(options.body);
    if (path === "/rest/v1/commercial_appointments") return insertAppointment(options.body);
    if (path === "/rest/v1/lead_attribution") return insertAttribution(options.body);
    if (path === "/rest/v1/rpc/settle_web_lead") return settle(options.body);
    if (path === "/rest/v1/rpc/attach_web_lead_opportunity") return attach(options.body);
    if (path === "/rest/v1/rpc/reserve_web_leads") {
      const prises = [];
      for (const sub of state.submissions.values()) {
        if (sub.status !== "pending") continue;
        sub.status = "processing";
        sub.attempts += 1;
        sub.locked_at = new Date().toISOString();
        prises.push({ ...sub });
      }
      return prises;
    }
    throw new Error(`écriture non simulée : ${path}`);
  }

  return {
    state,
    request,
    /** Enregistre une demande comme le ferait `enqueue_web_lead`. */
    recevoir(payload, { kind = "lead" } = {}) {
      const id = uuid(`s${++sequence}`);
      const sub = {
        id,
        organization_id: ORG,
        submission_id: payload.submissionId,
        kind,
        payload,
        status: "pending",
        attempts: 0,
        opportunity_id: null,
        dedup_decision: null,
        last_error_code: null,
        locked_at: null,
      };
      state.submissions.set(id, sub);
      return sub;
    },
    /** La prochaine écriture correspondante échoue. */
    couperApres(label) {
      panneSur = label;
    },
    /** Suspend la prochaine écriture correspondante jusqu'à libération. */
    retenir(label) {
      let atteint;
      let liberer;
      const arrive = new Promise(resolve => {
        atteint = resolve;
      });
      const liberee = new Promise(resolve => {
        liberer = resolve;
      });
      retenue = { label, atteint, liberee };
      return { arrive, liberer };
    },
  };
}

/** Demande d'étude arrivée depuis Google Ads. */
export function demandeGoogleAds({ submissionId = SOUMISSION, kind = "lead" } = {}) {
  return {
    submissionId,
    kind,
    receivedAt: "2026-11-05T09:30:00.000Z",
    intent: "devis",
    projects: ["pac"],
    postalCode: "13100",
    housing: "maison",
    firstName: "Camille",
    lastName: "Durand",
    name: "Camille Durand",
    phone: "0612345678",
    email: "camille.durand@example.test",
    message: "Demande d'étude pompe à chaleur.",
    date: kind === "appointment" ? "2026-11-20" : "",
    time: kind === "appointment" ? "10:00" : "",
    attribution: {
      gclid: "Cj0KCQexempleGclid",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "pac-hiver-2026",
      utm_term: "pompe a chaleur prix",
      landingPath: "/pompe-a-chaleur.html",
      capturedAt: "2026-11-05T09:28:00.000Z",
    },
    attributionFirst: {},
  };
}

/** Visiteur venu du site puis revenu par Google Ads : deux contacts. */
export function demandeDeuxContacts() {
  const base = demandeGoogleAds();
  return {
    ...base,
    attributionFirst: {
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "automne-2026",
      landingPath: "/",
      capturedAt: "2026-10-28T08:00:00.000Z",
    },
  };
}

