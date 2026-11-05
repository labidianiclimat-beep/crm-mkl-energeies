/** Documents qui peuvent suivre un devis, choisis avant l’impression. */

import { quoteHasAirEauHeatPump, ANAH_PAGE_PATHS } from "./anah-mandat.js";
import { quoteCommercialDocs } from "./article-commercial-doc.js";
import { CERFA_PAGE_PATHS, quoteHasVat55 } from "./cerfa-tva.js";
import { companyHasCgv } from "./company.js";
import { PV_MANDAT_PAGE_PATH, quoteHasPhotovoltaic } from "./pv-mandat.js";

export function devisAnnexChoices(doc = {}, articles = [], company = {}) {
  if (String(doc.kind || "Devis") !== "Devis") return [];
  const choices = [];
  if (quoteHasVat55(doc)) {
    choices.push({
      id: "cerfa",
      title: "Attestation TVA 5,5 %",
      detail: "CERFA 1301-SD",
      thumb: CERFA_PAGE_PATHS[0],
      checked: false,
    });
  }
  for (const item of quoteCommercialDocs(doc.items, articles)) {
    const selected = (doc.printCommercialDocIds || []).map(String);
    choices.push({
      id: `commercial:${item.key}`,
      title: item.name || item.code || "Documentation commerciale",
      detail: item.ficheName || "PDF commercial",
      thumb: String(item.ficheData || "").startsWith("data:image/") ? item.ficheData : "",
      dataUrl: item.ficheData || "",
      checked: selected.includes(String(item.key)),
    });
  }
  if (quoteHasPhotovoltaic(doc)) {
    choices.push({
      id: "pv",
      title: "Mandat photovoltaïque",
      detail: "Démarches photovoltaïques",
      thumb: PV_MANDAT_PAGE_PATH,
      checked: doc.printPvMandat !== false,
    });
  }
  if (quoteHasAirEauHeatPump(doc)) {
    choices.push({
      id: "anah",
      title: "Mandat ANAH",
      detail: "MaPrimeRénov’",
      thumb: ANAH_PAGE_PATHS[0],
      checked: doc.printAnahMandat !== false,
    });
  }
  if (companyHasCgv(company)) {
    choices.push({
      id: "cgv",
      title: "Conditions générales de vente",
      detail: company.cgvName || "CGV",
      thumb: String(company.cgvData || "").startsWith("data:image/") ? company.cgvData : "",
      dataUrl: company.cgvData || "",
      checked: doc.printCgv !== false,
    });
  }
  return choices;
}

export function applyAnnexChoices(doc = {}, choices = []) {
  const on = id => choices.some(item => item.id === id && item.checked);
  return {
    ...doc,
    printCerfaTva: on("cerfa"),
    printCommercialDocIds: choices
      .filter(item => item.checked && String(item.id).startsWith("commercial:"))
      .map(item => String(item.id).slice("commercial:".length)),
    printHeatPumpFicheIds: doc.printHeatPumpFicheIds || [],
    printPvMandat: on("pv"),
    printAnahMandat: on("anah"),
    printCgv: on("cgv"),
  };
}
