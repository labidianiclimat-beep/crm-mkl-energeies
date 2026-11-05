"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, CheckCircle2, Download, Printer, Save } from "lucide-react";
import { ExistingClientGate } from "../components/recipient-connect";
import { personSearchFields } from "../lib/directory-search";
import { openSizingPrintWindow } from "../lib/sizing-note-print";
import { useCompany } from "../lib/use-company";
import { companyDisplayName } from "../lib/company";
import { authFetch } from "../lib/supabase-rest";
import { formatClientNumber } from "../lib/client-number";
import { EXISTING_CLIENT_MESSAGE, findExistingClient, recipientLink } from "../lib/existing-client";
import { loadSharedRecords, saveSharedRecords } from "../lib/use-record-table";
import { THERMAL_STUDY_STORAGE_KEY, formatThermalNumber } from "../lib/thermal-study";
import {
  EQUIPMENT_TYPES,
  SIZING_ATTESTATION_INTRO,
  SIZING_ATTESTATIONS,
  SIZING_NOTE_KIND,
  SIZING_REMIT_SENTENCE,
  SIZING_ROOMS_SENTENCE,
  computeSizingNote,
  createEmptySizingNote,
  findThermalStudyByNumber,
  heatPumpMachineForClient,
  isSizingNote,
  nextSizingNumber,
  searchHeatPumpArticles,
  sizingClientForStudy,
  sizingFieldsFromThermalStudy,
} from "../lib/sizing-note";
import "../previsite/previsite.css";
import "./note-dimensionnement.css";

function readLocal(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function loadNotes() {
  return loadSharedRecords(THERMAL_STUDY_STORAGE_KEY);
}

async function persistNotes(records) {
  await saveSharedRecords(THERMAL_STUDY_STORAGE_KEY, records);
}

async function loadClients() {
  try {
    const response = await authFetch("/api/clients");
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.clients)) return data.clients;
  } catch {}
  return readLocal("mkl-clients");
}

async function loadQuotes() {
  try {
    const response = await authFetch("/api/devis");
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.documents)) return data.documents;
  } catch {}
  return [];
}

async function loadArticles() {
  try {
    const response = await authFetch("/api/articles");
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.articles)) return data.articles;
  } catch {}
  return [];
}

function noteFromClient(client) {
  const empty = createEmptySizingNote();
  if (!client) return empty;
  const link = recipientLink(client);
  const fields = personSearchFields(client);
  return {
    ...empty,
    clientId: link.clientId,
    prospectId: link.prospectId,
    clientNumber: link.clientId ? (client.clientNumber || "") : "",
    client: client.name || `${fields.lastName} ${fields.firstName}`.trim(),
    lastName: fields.lastName || "",
    firstName: fields.firstName || "",
    address: client.address || "",
    addressComplement: client.addressComplement || "",
    postalCode: client.postalCode || "",
    city: client.city || "",
    phone: client.mobile || client.phone || "",
    email: client.email || "",
  };
}

function Equation({ formula, result, on = true, children }) {
  return (
    <div className={`sizing-eq${on ? " on" : " off"}`}>
      <p>{formula}</p>
      {children}
      <strong>{result}</strong>
    </div>
  );
}

function formFromStudy(study, client, quotes, articles) {
  const machine = heatPumpMachineForClient(quotes, articles, client?.id);
  const next = {
    ...noteFromClient(client),
    ...sizingFieldsFromThermalStudy(study),
    ...(machine || {}),
  };
  next.client = `${next.lastName || ""} ${next.firstName || ""}`.trim() || next.client;
  return { form: next, brandFromDevis: Boolean(machine) };
}

export default function SizingNotePage({
  embedded = false,
  presetClient = null,
  presetId = "",
  presetStudy = null,
  onClose,
  onSaved,
} = {}) {
  const [form, setForm] = useState(() => noteFromClient(presetClient));
  const [recordId, setRecordId] = useState(null);
  const [number, setNumber] = useState("");
  const [clients, setClients] = useState([]);
  const [records, setRecords] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [articles, setArticles] = useState([]);
  const [thermalQuery, setThermalQuery] = useState("");
  const [thermalMiss, setThermalMiss] = useState("");
  const [articleQuery, setArticleQuery] = useState("");
  const [brandFromDevis, setBrandFromDevis] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const { company } = useCompany();
  const computed = useMemo(() => computeSizingNote(form), [form]);
  const articlePicks = useMemo(() => searchHeatPumpArticles(articles, articleQuery), [articles, articleQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = embedded ? new URLSearchParams() : new URLSearchParams(window.location.search);
      const id = embedded ? (presetId || "") : params.get("id");
      const [loaded, directory, quoteRows, articleRows] = await Promise.all([
        loadNotes(),
        loadClients(),
        loadQuotes(),
        loadArticles(),
      ]);
      if (cancelled) return;
      setRecords(loaded);
      setClients(directory);
      setQuotes(quoteRows);
      setArticles(articleRows);
      if (id) {
        const found = loaded.find(item => String(item.id) === String(id) && isSizingNote(item));
        if (found) {
          setRecordId(found.id);
          setNumber(found.number || "");
          setForm({ ...createEmptySizingNote(), ...found });
          setLoading(false);
          return;
        }
      }
      if (presetStudy) {
        const linked = sizingClientForStudy(presetStudy, directory).client || presetClient;
        if (linked) {
          const opened = formFromStudy(presetStudy, linked, quoteRows, articleRows);
          setBrandFromDevis(opened.brandFromDevis);
          setForm(opened.form);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [embedded, presetId, presetStudy, presetClient]);

  function patch(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function openThermalNumber(raw = thermalQuery) {
    const { study, ambiguous } = findThermalStudyByNumber(records, raw);
    if (ambiguous) {
      setThermalMiss("Plusieurs études portent ces chiffres. Saisissez le numéro complet.");
      return;
    }
    if (!study) {
      setThermalMiss("Aucune étude thermique avec ce numéro.");
      return;
    }
    const { client, reason } = sizingClientForStudy(study, clients);
    if (!client) {
      setThermalMiss(reason === "prospect"
        ? "Cette étude est sur un prospect. La note se fait une fois le client créé."
        : "Cette étude n’est pas reliée à un client visible.");
      return;
    }
    const opened = formFromStudy(study, client, quotes, articles);
    setBrandFromDevis(opened.brandFromDevis);
    setArticleQuery("");
    setThermalMiss("");
    setForm(opened.form);
  }

  function chooseArticle(article) {
    if (!article) return;
    setBrandFromDevis(false);
    setArticleQuery("");
    setForm(current => ({
      ...current,
      articleId: article.id || "",
      brand: article.brand || article.marque || "",
      model: article.name || article.designation || "",
    }));
  }

  function applyClient(client) {
    if (!client) return;
    const link = recipientLink(client);
    const fields = personSearchFields(client);
    setForm(current => ({
      ...current,
      clientId: link.clientId,
      prospectId: link.prospectId,
      clientNumber: link.clientId ? (client.clientNumber || "") : "",
      client: client.name || `${fields.lastName} ${fields.firstName}`.trim(),
      lastName: fields.lastName || current.lastName,
      firstName: fields.firstName || current.firstName,
      address: client.address || current.address,
      addressComplement: client.addressComplement || current.addressComplement,
      postalCode: client.postalCode || current.postalCode,
      city: client.city || current.city,
      phone: client.mobile || client.phone || current.phone || "",
      email: client.email || current.email || "",
    }));
  }

  function noteParty() {
    return findExistingClient(clients, form.clientId);
  }

  function printForm(record) {
    const linked = noteParty() || {};
    return {
      ...form,
      ...computed,
      ...(record || {}),
      phone: linked.mobile || linked.phone || form.phone || "",
      email: linked.email || form.email || "",
      clientNumberLabel: formatClientNumber(form.clientNumber || linked.clientNumber),
    };
  }

  async function saveNote() {
    if (!noteParty()) {
      setSaveError(EXISTING_CLIENT_MESSAGE);
      setSaved(false);
      return null;
    }
    setSaveError("");
    const records = await loadNotes();
    const id = recordId || Date.now();
    const assigned = number || nextSizingNumber(records);
    const record = {
      ...form,
      kind: SIZING_NOTE_KIND,
      id,
      number: assigned,
      client: form.client || `${form.lastName} ${form.firstName}`.trim(),
      volume: computed.volume,
      deltaT: computed.deltaT,
      usesStop: computed.usesStop,
      lossesW: computed.lossesW,
      lossesKw: computed.lossesKw,
      coverage: computed.coverage,
      energyCoverage: computed.energyCoverage,
      family: computed.family,
      equipmentLabel: computed.equipmentLabel,
      equipmentCode: computed.equipmentCode,
      verdictOk: computed.verdict.ok,
      verdictLabel: computed.verdict.label,
      status: computed.verdict.ok ? "Note complétée" : "À compléter",
      created: form.created || new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    const exists = records.some(item => String(item.id) === String(id) && isSizingNote(item));
    const next = exists
      ? records.map(item => String(item.id) === String(id) ? record : item)
      : [record, ...records];
    await persistNotes(next);
    setRecordId(id);
    setNumber(assigned);
    setForm(current => ({ ...current, created: record.created }));
    if (!recordId && !embedded) history.replaceState({}, "", `/note-dimensionnement?id=${id}`);
    onSaved?.(record);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    return record;
  }

  async function printNote() {
    try {
      const record = await saveNote();
      if (!record) return;
      await openSizingPrintWindow({
        form: printForm(record),
        company,
        number: record.number || number,
        autoPrint: true,
      });
    } catch (error) {
      setSaveError(String(error?.message || "Impression impossible"));
    }
  }

  async function downloadNote() {
    try {
      const record = await saveNote();
      if (!record) return;
      await openSizingPrintWindow({
        form: printForm(record),
        company,
        number: record.number || number,
        autoPrint: false,
      });
    } catch (error) {
      setSaveError(String(error?.message || "Téléchargement PDF impossible"));
    }
  }

  if (loading) {
    return <main className={`previsit-app sizing-app sizing-loading${embedded ? " is-embedded" : ""}`}>Chargement de la note de dimensionnement…</main>;
  }

  const companyName = companyDisplayName(company);

  return (
    <main className={`previsit-app sizing-app${embedded ? " is-embedded" : ""}`}>
      <header className="form-toolbar">
        <button type="button" onClick={() => { if (embedded) onClose?.(); else window.location.href = "/"; }}>
          <ArrowLeft />Retour CRM
        </button>
        <div>
          <Calculator size={18} />
          <span>
            <b>Note de dimensionnement</b>
            <small>{number || "Dossier prime"}</small>
          </span>
        </div>
        <div>
          <button type="button" onClick={saveNote}><Save />Enregistrer</button>
          <button type="button" onClick={downloadNote}><Download />Télécharger</button>
          <button type="button" className="print" onClick={printNote}><Printer />Imprimer</button>
        </div>
      </header>
      {saved && <div className="save-toast"><CheckCircle2 />Note enregistrée</div>}
      {saveError && <div className="save-toast is-error">{saveError}</div>}

      {!noteParty() ? (
        <>
          <ExistingClientGate clients={clients} title="Note de dimensionnement" allowCreate={false} onSelect={applyClient} />
          <section className="paper thermal-paper sizing-study-gate">
            <p className="sizing-or">ou</p>
            <label className="sizing-field">Numéro d’étude thermique
              <input
                value={thermalQuery}
                placeholder="ETH-2026-000001"
                autoComplete="off"
                aria-label="Numéro d’étude thermique"
                onChange={event => {
                  setThermalMiss("");
                  setThermalQuery(event.target.value);
                }}
                onBlur={() => { if (thermalQuery.trim()) openThermalNumber(); }}
                onKeyDown={event => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  openThermalNumber();
                }}
              />
            </label>
            {thermalMiss && <p className="sizing-miss">{thermalMiss}</p>}
          </section>
        </>
      ) : (
        <section className="paper sizing-sheet">
          <div className="document-head">
            <img src="/mkl-energies.png" alt={companyName} />
            <div>
              <span>{companyName}</span>
              <h1>Note de dimensionnement</h1>
              <p>{number || "Nouvelle note"}</p>
            </div>
          </div>
          {form.thermalStudyNumber ? (
            <p className="sizing-note">Valeurs reprises de l’étude {form.thermalStudyNumber}.</p>
          ) : null}
          <p className="sizing-remit">{SIZING_REMIT_SENTENCE}</p>
          <label className="sizing-field">Date
            <input type="date" value={form.noteDate || ""} onChange={event => patch("noteDate", event.target.value)} />
          </label>

          <h2>Equipement installé</h2>
          <p className="sizing-label">Type de matériel</p>
          <div className="sizing-types">
            {EQUIPMENT_TYPES.map(item => (
              <button
                type="button"
                key={item.id}
                className={form.equipmentType === item.id ? "on" : ""}
                onClick={() => patch("equipmentType", item.id)}
              >
                <i />
                <span>{item.label} – {item.code}</span>
              </button>
            ))}
          </div>
          <div className="sizing-pair">
            <label className="sizing-field">Marque
              <input value={form.brand} onChange={event => { setBrandFromDevis(false); patch("brand", event.target.value); }} />
            </label>
            <label className="sizing-field">Modèle / réf. produit
              <input value={form.model} onChange={event => { setBrandFromDevis(false); patch("model", event.target.value); }} />
            </label>
          </div>
          <label className="sizing-field">Article pompe à chaleur
            <input
              value={articleQuery}
              placeholder="Marque, modèle ou référence"
              autoComplete="off"
              aria-label="Article pompe à chaleur"
              onChange={event => setArticleQuery(event.target.value)}
            />
          </label>
          {articlePicks.length > 0 && (
            <div className="sizing-article-picks">
              {articlePicks.map(article => (
                <button type="button" key={article.id || article.code} onClick={() => chooseArticle(article)}>
                  <b>{[article.brand, article.name].filter(Boolean).join(" ")}</b>
                  {article.code ? <small>{article.code}</small> : null}
                </button>
              ))}
            </div>
          )}
          {brandFromDevis ? (
            <p className="sizing-note">Marque et modèle repris du devis de ce client.</p>
          ) : null}
          {form.thermalStudyNumber && !form.brand && !form.model ? (
            <p className="sizing-note">Aucune pompe à chaleur sur un devis de ce client. Choisissez l’article dans le catalogue.</p>
          ) : null}
          {computed.family !== "biomass" && (
            <label className="sizing-field">Température d’arrêt de la pompe à chaleur (PAC)
              <input type="number" step="0.1" value={form.stopTemp} onChange={event => patch("stopTemp", event.target.value)} />
            </label>
          )}

          <h2>Coordonnées du bénéficiaire</h2>
          <div className="sizing-pair">
            <label className="sizing-field">Nom
              <input value={form.lastName} onChange={event => patch("lastName", event.target.value)} />
            </label>
            <label className="sizing-field">Prénom
              <input value={form.firstName} onChange={event => patch("firstName", event.target.value)} />
            </label>
          </div>
          <label className="sizing-field">Adresse des travaux
            <input value={form.address} onChange={event => patch("address", event.target.value)} />
          </label>
          <div className="sizing-pair">
            <label className="sizing-field">Code postal
              <input value={form.postalCode} onChange={event => patch("postalCode", event.target.value)} />
            </label>
            <label className="sizing-field">Ville
              <input value={form.city} onChange={event => patch("city", event.target.value)} />
            </label>
          </div>

          <h2>Calcul des déperditions du logement</h2>
          <Equation
            formula="Surface chauffée × hauteur sous plafond = volume à chauffer"
            result={`${formatThermalNumber(computed.volume)} m³`}
          >
            <div className="inputs">
              <label className="sizing-field">Surface chauffée (m²)
                <input type="number" min="0" step="0.1" value={form.surface} onChange={event => patch("surface", event.target.value)} />
              </label>
              <label className="sizing-field">Hauteur sous plafond (m)
                <input type="number" min="0" step="0.01" value={form.height} onChange={event => patch("height", event.target.value)} />
              </label>
            </div>
          </Equation>
          <div className="sizing-pair">
            <label className="sizing-field">Température de consigne intérieure (°C)
              <input type="number" step="0.1" value={form.tIndoor} onChange={event => patch("tIndoor", event.target.value)} />
            </label>
            <label className="sizing-field">Température extérieure de base (°C)
              <input type="number" step="0.1" value={form.tOutdoor} onChange={event => patch("tOutdoor", event.target.value)} />
            </label>
          </div>
          <label className="sizing-field">Coefficient de déperdition du bâtiment (W/m³.°C)
            <input type="number" min="0" step="0.01" value={form.coefficient} onChange={event => patch("coefficient", event.target.value)} />
          </label>
          <Equation
            formula="Delta T = T° de consigne intérieur – T° extérieure de base"
            result={computed.deltaT == null ? "—" : (computed.usesStop ? "non retenu" : `${formatThermalNumber(computed.deltaT)} °C`)}
            on={!computed.usesStop}
          />
          <p className="sizing-or">Ou :</p>
          <Equation
            formula="Delta T = T° de consigne intérieur – T° arrêt de la PAC (si arrêt de la PAC > T° extérieure de base)"
            result={computed.usesStop ? `${formatThermalNumber(computed.deltaT)} °C` : "—"}
            on={computed.usesStop}
          />
          <Equation
            formula="Déperditions = volume à chauffer × coefficient de déperdition × Delta T"
            result={computed.lossesW == null ? "—" : `${formatThermalNumber(computed.lossesW, 0)} W, soit ${formatThermalNumber(computed.lossesKw)} kW`}
          />
          <p className="sizing-note">{SIZING_ROOMS_SENTENCE}</p>

          {computed.family === "pac" && (
            <>
              <h2>Pour les PAC air/eau, eau/eau ou sol/eau</h2>
              <p className="sizing-rule">La pompe à chaleur (PAC) doit couvrir entre 60% et 130% des déperditions thermiques du logement.</p>
              <label className="sizing-field">Puissance de la PAC installée à T° base (W){computed.usesStop ? " — ou à T° arrêt si T° arrêt > T° base" : ""}
                <input type="number" min="0" step="1" value={form.pacPowerW} onChange={event => patch("pacPowerW", event.target.value)} />
              </label>
              <label className="sizing-field">Température d’eau pour la puissance de la PAC installée à T° base (°C){computed.usesStop ? " — ou à T° arrêt si T° arrêt > T° base" : ""}
                <input type="number" step="0.1" value={form.waterTemp} onChange={event => patch("waterTemp", event.target.value)} />
              </label>
              <div className="sizing-flag">La PAC est configurée en mode bi-zone
                <span className="sizing-choice">
                  <button type="button" className={form.biZone ? "on" : ""} onClick={() => patch("biZone", true)}>OUI</button>
                  <button type="button" className={!form.biZone ? "on" : ""} onClick={() => patch("biZone", false)}>NON</button>
                </span>
              </div>
              {form.biZone && (
                <label className="sizing-field">Si PAC bi-zone, précisez la 2ème température d’eau (°C)
                  <input type="number" step="0.1" value={form.waterTemp2} onChange={event => patch("waterTemp2", event.target.value)} />
                </label>
              )}
              <Equation
                formula="Taux de couverture par rapport aux besoins de chauffage à T° base = (puissance définie du produit × 100) / déperditions du logement"
                result={computed.coverage == null ? "—" : `${formatThermalNumber(computed.coverage, 1)} %`}
              />
            </>
          )}

          {computed.family === "hybrid" && (
            <>
              <h2>Pour les PAC hybrides</h2>
              <p className="sizing-rule">Le taux de couverture de la pompe à chaleur hors dispositif d’appoint, rapport entre la quantité d’énergie fournie par la PAC hors appoint et les besoins annuels de chaleur, doit représenter au moins 70%. La chaudière gaz se met en fonctionnement seulement quand la demande est supérieure à 70%. La pompe à chaleur doit couvrir entre 40% et 80% des déperditions thermiques du logement.</p>
              <div className="sizing-pair">
                <label className="sizing-field">Quantité d’énergie fournie par la PAC hors appoint (kWh)
                  <input type="number" min="0" step="0.1" value={form.pacEnergyKwh} onChange={event => patch("pacEnergyKwh", event.target.value)} />
                </label>
                <label className="sizing-field">Besoins annuels de chaleur pour le chauffage du logement (kWh)
                  <input type="number" min="0" step="0.1" value={form.annualNeedsKwh} onChange={event => patch("annualNeedsKwh", event.target.value)} />
                </label>
              </div>
              <Equation
                formula="Taux de couverture de la PAC hors dispositif d’appoint = (énergie fournie hors appoint × 100) / besoins annuels de chaleur"
                result={computed.energyCoverage == null ? "—" : `${formatThermalNumber(computed.energyCoverage, 1)} %`}
              />
              <label className="sizing-field">Puissance de la PAC installée sans l’appoint à 0°C extérieur et 50°C départ chauffage (W)
                <input type="number" min="0" step="1" value={form.pacPowerW} onChange={event => patch("pacPowerW", event.target.value)} />
              </label>
              <Equation
                formula="Taux de couverture en puissance = (puissance sans appoint × 100) / déperditions du logement"
                result={computed.coverage == null ? "—" : `${formatThermalNumber(computed.coverage, 1)} %`}
              />
              <label className="sizing-field">Module régulation choisi
                <input value={form.regulationModule} onChange={event => patch("regulationModule", event.target.value)} />
              </label>
            </>
          )}

          {computed.family === "biomass" && (
            <>
              <h2>Chaudière Biomasse – BAR TH 113</h2>
              <p className="sizing-rule">Les déperditions estimées du logement servent au dimensionnement de la chaudière.</p>
            </>
          )}

          <p className={`sizing-verdict is-${computed.verdict.tone}`}>{computed.verdict.label}</p>
          <section className="sizing-attest">
            <b>{SIZING_ATTESTATION_INTRO}</b>
            {SIZING_ATTESTATIONS.map(line => <p key={line}>{line}</p>)}
          </section>
        </section>
      )}
    </main>
  );
}
