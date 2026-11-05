/**
 * Démonstration locale : une demande Google Ads de bout en bout.
 *
 * Rejoue le parcours réel d'une demande déposée sur mkl-energies.fr après un
 * clic sur une annonce Google Ads, jusqu'à la fiche prospect visible au
 * dispatch. Aucune base n'est touchée : la couche PostgREST est simulée, avec
 * les mêmes index uniques que la migration.
 *
 *   node scripts/demo-web-lead-google-ads.mjs
 *
 * La démonstration inclut volontairement le cas défavorable : une coupure
 * après la création de la fiche, puis trois relances. C'est là que la version
 * précédente créait un doublon par tentative.
 */

import {
  ORG,
  SOUMISSION,
  demandeGoogleAds,
  faussebase,
} from "../tests/helpers/fausse-base-web-leads.mjs";
import { webLeadIntegrator } from "../app/lib/web-lead-queue-server.js";
import { buildProspectScopeFilter } from "../app/lib/scoping.js";
import { canDispatchProspects, isProspectDispatcher } from "../app/lib/prospect-dispatch.js";
import { canReviewWebLeads } from "../app/lib/web-lead-admin.js";
import { attributionOf } from "../app/lib/marketing-attribution.js";

const RESPONSABLE = "33333333-3333-4333-8333-333333333333";

function titre(texte) {
  console.log(`\n${texte}`);
  console.log("─".repeat(texte.length));
}

function ligne(cle, valeur) {
  console.log(`  ${String(cle).padEnd(34)} ${valeur}`);
}

const db = faussebase();
const integrateur = webLeadIntegrator({ request: db.request });
const demande = demandeGoogleAds();

titre("1. Ce que le navigateur a relevé à l'arrivée");
ligne("page d'arrivée", demande.attribution.landingPath);
ligne("identifiant de clic Google", demande.attribution.gclid);
ligne("campagne", demande.attribution.utm_campaign);
ligne("mot-clé", demande.attribution.utm_term);
ligne("support", `${demande.attribution.utm_source} / ${demande.attribution.utm_medium}`);

titre("2. Réception par le CRM");
const soumission = db.recevoir(demande);
ligne("identifiant de soumission", soumission.submission_id);
ligne("état", soumission.status);
ligne("contenu brut conservé", soumission.payload ? "oui" : "non");

titre("3. Première tentative, interrompue après la création de la fiche");
db.couperApres("POST /rest/v1/lead_attribution");
const essai1 = await integrateur.processQueue({ worker: "demo" });
ligne("résultat", JSON.stringify(essai1));
ligne("fiches prospect en base", db.state.opportunities.length);
ligne("contacts d'attribution", db.state.attribution.length);
ligne("état de la demande", db.state.submissions.get(soumission.id).status);
ligne("motif technique retenu", db.state.submissions.get(soumission.id).last_error_code);

titre("4. Trois relances supplémentaires, toutes interrompues");
for (let essai = 0; essai < 3; essai += 1) {
  db.state.submissions.get(soumission.id).status = "pending";
  db.couperApres("POST /rest/v1/lead_attribution");
  await integrateur.processQueue({ worker: "demo" });
}
ligne("fiches prospect en base", db.state.opportunities.length);
console.log(
  db.state.opportunities.length === 1
    ? "  → une seule fiche après quatre échecs. Avant correctif : quatre."
    : "  → ANOMALIE : plusieurs fiches ont été créées."
);

titre("5. Deux traitements simultanés de la même demande");
db.state.submissions.get(soumission.id).status = "pending";
const reserve = { ...db.state.submissions.get(soumission.id), attempts: 5 };
const porte = db.retenir("POST /rest/v1/lead_attribution");
const lent = integrateur.integrate(reserve);
await porte.arrive;
await integrateur.integrate({ ...reserve });
porte.liberer();
await lent;
ligne("fiches prospect en base", db.state.opportunities.length);
ligne("contacts d'attribution", db.state.attribution.length);
ligne("état de la demande", db.state.submissions.get(soumission.id).status);

titre("6. La fiche créée");
const fiche = db.state.opportunities[0];
ligne("origine enregistrée", `${fiche.origin_channel} / ${fiche.origin_category}`);
ligne("libellé affiché", fiche.source);
ligne("étape", fiche.stage);
ligne("commercial affecté", fiche.commercial_id === null ? "aucun — part au dispatch" : fiche.commercial_id);
ligne("identifiant de soumission porté", fiche.extra?.webLead?.submissionId);

titre("7. Attribution publicitaire conservée");
const contact = db.state.attribution[0];
ligne("canal", `${contact.origin_channel} / ${contact.origin_category}`);
ligne("preuve retenue", contact.evidence);
ligne("type de clic", contact.click_kind);
ligne("identifiant de clic", contact.click_id);
ligne("campagne", contact.campaign_name);
ligne("mot-clé", contact.keyword);
// Les deux modèles se lisent côte à côte. Avec un seul contact, ils disent la
// même chose : c'est attendu, et c'est ce qui doit se voir.
const modeles = attributionOf(fiche, db.state.attribution);
ligne("contacts enregistrés", modeles.touchCount);
ligne("modèle premier contact", `${modeles.premier_contact.category} (${modeles.premier_contact.evidence})`);
ligne("modèle dernier contact", `${modeles.dernier_contact.category} (${modeles.dernier_contact.evidence})`);

titre("8. Visibilité");
const profilResponsable = { id: RESPONSABLE, role: "Responsable prospection", organization_id: ORG };
ligne("responsable prospection : dispatch", canDispatchProspects(profilResponsable) ? "oui" : "non");
ligne("responsable prospection : file", isProspectDispatcher(profilResponsable) ? "oui" : "non");
ligne("responsable prospection : suivi", canReviewWebLeads(profilResponsable) ? "oui" : "non");
const filtre = buildProspectScopeFilter([RESPONSABLE]);
console.log(`  filtre de portée commerciale : ${filtre}`);
console.log(
  fiche.commercial_id === null
    ? "  → la fiche n'entre dans aucune portée commerciale : elle n'est visible\n    que par le dispatch, ce qui est l'intention."
    : "  → ANOMALIE : la fiche est affectée alors qu'elle devait partir au dispatch."
);

titre("Bilan");
const attendu = {
  "une seule fiche prospect": db.state.opportunities.length === 1,
  "origine « Prospect GG Ads »": fiche.source === "Prospect GG Ads",
  "un seul contact d'attribution": db.state.attribution.length === 1,
  "identifiant de clic conservé": contact.click_id === demande.attribution.gclid,
  "aucun commercial affecté": fiche.commercial_id === null,
  "demande clôturée": db.state.submissions.get(soumission.id).status === "done",
  "contenu brut toujours conservé": Boolean(db.state.submissions.get(soumission.id).payload),
};
for (const [quoi, ok] of Object.entries(attendu)) {
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}`);
}
const echecs = Object.values(attendu).filter(ok => !ok).length;
console.log(
  echecs === 0
    ? `\nLes ${Object.keys(attendu).length} conditions sont réunies, malgré quatre échecs et une course.`
    : `\n${echecs} condition(s) non réunie(s). Voir ci-dessus.`
);
process.exitCode = echecs === 0 ? 0 : 1;
