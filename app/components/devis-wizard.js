"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileText,
  Library,
  Mail,
  PenLine,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import AddressCallNotice from "./address-call-notice";
import { missingAddressParts } from "../lib/address";
import ArticlePickerWizard from "./article-picker-wizard";
import ClientNumberField from "./client-number-field";
import CompleteAddressFields from "./complete-address-fields";
import DirectorySearch from "./directory-search";
import HousingFields from "./housing-fields";
import { housingFromPerson } from "../lib/housing";
import SignaturePad from "./signature-pad";
import { authFetch } from "../lib/supabase-rest";
import { visibleProspects } from "../lib/prospect-to-client";
import { formatClientNumber } from "../lib/client-number";
import { findProspectByNumber, formatProspectNumber, personFromProspectNumber, PROSPECT_NUMBER_PREFIX } from "../lib/prospect-number";
import { splitPersonName, canEditDevisPricing, cloneDocumentForCreate, isDevisCommercialId, isDevisOwnerRole, defaultQuoteDeliveryDate, defaultQuoteValidityDate, firstMonthlyDelayChoices, isQuoteBundleStart, quoteBundleHeading, setQuoteBundleHeading } from "../lib/devis";
import { foldRadiatorQuoteLines, isRadiatorFootOrWheel, isRadiatorMachineArticle, radiatorFootAndWheelChoices } from "../lib/radiator-bundle";
import { interpretDevisVoice, voiceChoiceResult } from "../lib/devis-voice";
import { isAdminVip } from "../lib/permissions";
import DevisVoiceBar from "./devis-voice-bar";
import QuoteBundleHeading from "./quote-bundle-heading";
import {
  DEVIS_FINANCIERS,
  ELECTRICITY_OPERATORS,
  FINANCE_MODES,
  FINANCE_STATUSES,
  PAYMENT_METHODS,
  WIZARD_STEPS,
  documentToWizardState,
  emptyWizardState,
  filledQuoteItems,
  findDraftsForRecipient,
  OPEN_QUOTE_STATUSES,
  financeConsistencyError,
  isPhotovoltaicItems,
  isPreparedFreeLine,
  stepErrors,
  withPreparedFreeLine,
  suggestInstallmentAmount,
  wizardAcompte,
  wizardToPayload,
  wizardTotals,
} from "../lib/devis-wizard";
import DevisAnnexPicker from "./devis-annex-picker";
import { buildCerfaTvaData, quoteHasVat55 } from "../lib/cerfa-tva";
import { buildAnahMandatData, quoteHasAirEauHeatPump } from "../lib/anah-mandat";
import { buildPvMandatData, quoteHasPhotovoltaic } from "../lib/pv-mandat";
import { downloadArticleCommercialDoc, quoteCommercialDocs } from "../lib/article-commercial-doc";

const euro = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(value || 0));

function prospectDirectoryItem(prospect) {
  const split = splitPersonName(prospect.name);
  return {
    ...prospect,
    id: `prospect:${prospect.id}`,
    realId: prospect.id,
    directoryKind: "prospect",
    badge: "Prospect",
    firstName: split.firstName,
    lastName: split.lastName,
    contact: prospect.name,
  };
}

function WizardSection({ n, title, hint, className = "", actions = null, children }) {
  return (
    <section className={`quote-section ${className}`.trim()}>
      <header className="quote-section-head">
        <span>{n}</span>
        <div>
          <b>{title}</b>
          {hint ? <em>{hint}</em> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export default function DevisWizard({
  clients = [],
  prospects = [],
  documents = [],
  articles = [],
  brands = [],
  catalogCategories = [],
  catalogSubcategories = [],
  bundles = [],
  commercials = [],
  currentProfile = null,
  currentUserId = "",
  currentUserName = "",
  mustAssignCommercial = false,
  canAssignCommercial = false,
  canManageCatalog = false,
  canDeleteDraft = false,
  initialClient = null,
  initialProspect = null,
  resumeDocument = null,
  onClientCreated,
  onEnsureBundles,
  onSaved,
  onClose,
  onOpenDocument,
  onDuplicate,
  toast,
}) {
  const canPrice = canEditDevisPricing(currentProfile);
  const [state, setState] = useState(() =>
    resumeDocument
      ? documentToWizardState(resumeDocument, { clients, prospects })
      : emptyWizardState({
          currentUserId,
          currentUserName,
          mustAssignCommercial,
          client: initialClient,
          prospect: initialProspect,
        })
  );
  const [pickerMode, setPickerMode] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [voiceFeedback, setVoiceFeedback] = useState({ message: "", choices: [] });
  const applyVoiceRef = useRef(() => {});
  const [done, setDone] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [openQuotes, setOpenQuotes] = useState(() =>
    resumeDocument
      ? []
      : findDraftsForRecipient(documents, {
          clientId: initialClient?.id,
          prospectId: initialProspect?.id,
          statuses: OPEN_QUOTE_STATUSES,
        })
  );
  const [recipientReady, setRecipientReady] = useState(() => Boolean(
    resumeDocument || initialClient?.id || initialProspect?.id
  ));
  const stateRef = useRef(state);
  const dismissedDrafts = useRef(new Set());
  stateRef.current = state;

  useEffect(() => {
    setState(current => {
      const folded = foldRadiatorQuoteLines(current.items, articles);
      const key = line => [line?.id, line?.code, line?.articleId, Number(line?.qty) || 0, line?.radiatorFor || ""].join("|");
      const before = (current.items || []).filter(line => !isPreparedFreeLine(line)).map(key).join("\n");
      const after = (folded || []).filter(line => !isPreparedFreeLine(line)).map(key).join("\n");
      if (before === after) return current;
      return { ...current, items: withPreparedFreeLine(folded, current.tax) };
    });
  }, [articles]);
  const openProspects = useMemo(() => visibleProspects(prospects), [prospects]);
  const [convertedProspects, setConvertedProspects] = useState([]);
  useEffect(() => {
    let cancelled = false;
    authFetch("/api/prospects?includeConverted=1")
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setConvertedProspects(Array.isArray(data.prospects) ? data.prospects : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const prospectLookup = useMemo(() => {
    const map = new Map();
    for (const item of [...(prospects || []), ...convertedProspects]) {
      if (item?.id) map.set(String(item.id), item);
    }
    return [...map.values()];
  }, [prospects, convertedProspects]);
  const directoryItems = useMemo(() => [
    ...(clients || []).map(client => ({
      ...client,
      id: `client:${client.id}`,
      realId: client.id,
      directoryKind: "client",
      badge: "Client",
    })),
    ...openProspects.map(prospectDirectoryItem),
  ], [clients, openProspects]);

  const ownerCommercials = useMemo(
    () => (commercials || []).filter(user => isDevisOwnerRole(user.role)),
    [commercials]
  );
  const totals = wizardTotals(state);
  const acompte = wizardAcompte(state, totals.totalTTC);
  const photovoltaic = isPhotovoltaicItems(filledQuoteItems(state.items));
  const hasVat55 = quoteHasVat55(state);
  const commercialDocs = useMemo(
    () => quoteCommercialDocs(filledQuoteItems(state.items), articles),
    [state.items, articles]
  );
  const selectedCommercialIds = Array.isArray(state.printCommercialDocIds) ? state.printCommercialDocIds : [];
  const cerfaPreview = hasVat55
    ? buildCerfaTvaData(wizardToPayload(state), { client: state.clientSnapshot || {}, company: {} })
    : null;
  const anahPayload = wizardToPayload(state);
  const anahClient = (clients || []).find(item => String(item.id) === String(state.clientId)) || state.clientSnapshot || {};
  const anahMandate = quoteHasAirEauHeatPump(anahPayload);
  const anahPreview = anahMandate ? buildAnahMandatData(anahPayload, { client: anahClient }) : null;
  const pvMandate = quoteHasPhotovoltaic(anahPayload);
  const pvPreview = pvMandate ? buildPvMandatData(anahPayload, { client: anahClient }) : null;
  const summaryOffset = (commercialDocs.length ? 1 : 0) + (pvMandate ? 1 : 0);
  const currentStep = WIZARD_STEPS[state.step] || WIZARD_STEPS[0];
  const errors = stepErrors(currentStep.id, state, { mustAssignCommercial });
  const financeError = financeConsistencyError(state, totals.totalTTC);

  useEffect(() => {
    const recipientId = state.clientId || state.prospectId;
    if (!recipientId || resumeDocument) return;
    if (dismissedDrafts.current.has(String(recipientId))) return;
    const drafts = findDraftsForRecipient(documents, {
      clientId: state.clientId,
      prospectId: state.prospectId,
      statuses: OPEN_QUOTE_STATUSES,
    }).filter(item => item.id !== state.draftId);
    setOpenQuotes(drafts);
  }, [state.clientId, state.prospectId, documents]);

  function patch(partial) {
    setState(current => ({ ...current, ...partial }));
  }

  function goTo(stepIndex) {
    setState(current => ({ ...current, step: Math.max(0, Math.min(WIZARD_STEPS.length - 1, stepIndex)) }));
  }

  async function persist({ status = "Brouillon", statusComment = "Brouillon automatique", validate = false } = {}) {
    const snapshot = stateRef.current;
    const payload = wizardToPayload(snapshot, { status, statusComment });
    if (mustAssignCommercial && payload.commercialId) {
      const known = ownerCommercials.some(user => String(user.id) === String(payload.commercialId));
      if (!isDevisCommercialId(payload.commercialId) || (ownerCommercials.length && !known)) {
        payload.commercialId = "";
      }
    }
    if (!payload.clientId && !payload.prospectId) return null;
    if (validate) {
      const blocking = stepErrors("summary", snapshot, { mustAssignCommercial });
      if (blocking.length) {
        setNotice(blocking[0]);
        return null;
      }
    }
    const url = snapshot.draftId ? `/api/devis/${snapshot.draftId}` : "/api/devis";
    const method = snapshot.draftId ? "PATCH" : "POST";
    const response = await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
    if (data.client) onClientCreated?.(data.client);
    const document = data.document;
    setState(current => ({
      ...current,
      draftId: document.id,
      number: document.number || current.number,
      status: document.status || current.status,
      clientId: document.clientId || current.clientId,
      prospectId: "",
      clientSnapshot: data.client || current.clientSnapshot,
    }));
    onSaved?.(document, { convertedProspectId: data.convertedProspectId, client: data.client });
    return document;
  }

  function rejectRecipient() {
    setRecipientReady(false);
    pickRecipient(null);
  }

  function pickRecipient(item) {
    if (!item) {
      setRecipientReady(false);
      patch({ clientId: "", prospectId: "", clientSnapshot: null, ...housingFromPerson({}) });
      return;
    }
    const housing = housingFromPerson(item);
    if (item.directoryKind === "prospect") {
      patch({
        prospectId: item.realId,
        clientId: "",
        clientSnapshot: item,
        ...housing,
      });
      return;
    }
    patch({
      clientId: item.realId,
      prospectId: "",
      clientSnapshot: item,
      createdClientId: state.createdClientId || item.realId,
      ...housing,
    });
  }

  function moveLine(index, direction) {
    const next = [...state.items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ items: quoteItems(next) });
  }

  function quoteItems(lines) {
    return withPreparedFreeLine(foldRadiatorQuoteLines(lines, articles), state.tax);
  }

  function updateLine(id, key, value) {
    const next = state.items.map(item => item.id === id ? { ...item, [key]: value } : item);
    patch({ items: key === "qty" ? quoteItems(next) : withPreparedFreeLine(next, state.tax) });
  }

  function applyVoice(transcript, choice) {
    const snapshot = stateRef.current;
    const context = {
      articles,
      bundles,
      people: directoryItems,
      items: snapshot.items,
      tax: snapshot.tax,
      step: snapshot.step,
      clientId: snapshot.clientId,
      prospectId: snapshot.prospectId,
      totalTTC: wizardTotals(snapshot).totalTTC,
      pendingChoices: voiceFeedback.choices,
    };
    const result = choice ? voiceChoiceResult(choice, context) : interpretDevisVoice(transcript, context);
    setVoiceFeedback({ message: result.message || "", choices: result.choices || [] });
    let next = { ...snapshot, ...(result.patch || {}) };
    if (result.recipient) {
      const housing = housingFromPerson(result.recipient);
      next = result.recipient.directoryKind === "prospect"
        ? { ...next, prospectId: result.recipient.realId, clientId: "", clientSnapshot: result.recipient, ...housing }
        : {
          ...next,
          clientId: result.recipient.realId,
          prospectId: "",
          clientSnapshot: result.recipient,
          createdClientId: snapshot.createdClientId || result.recipient.realId,
          ...housing,
        };
      setRecipientReady(true);
    } else if (result.ready) {
      setRecipientReady(true);
    }
    if (result.recipient || result.patch) setState(next);
    if (result.preview) {
      preview({ ...wizardToPayload(next, { status: next.status || "Brouillon" }), number: next.number || "Aperçu" });
    }
    if (result.save) saveDraft();
  }
  applyVoiceRef.current = applyVoice;

  function chooseRadiatorAccessory(radiator, articleId) {
    const article = radiatorFootAndWheelChoices(articles).find(item => String(item.id || item.code) === String(articleId)) || null;
    patch({ items: quoteItems(foldRadiatorQuoteLines(state.items, articles, { assign: { radiatorId: radiator.id, article } })) });
  }

  async function saveDraft() {
    setBusy("draft");
    setNotice("");
    try {
      const document = await persist({ status: "Brouillon", statusComment: "Enregistré comme brouillon" });
      if (document) toast?.(`Brouillon enregistré — ${document.number || ""}`.trim());
    } catch (error) {
      setNotice(String(error.message || "Échec de sauvegarde"));
    } finally {
      setBusy("");
    }
  }

  async function validate() {
    setBusy("validate");
    setNotice("");
    try {
      const document = await persist({ status: "À valider", statusComment: "Création du devis", validate: true });
      if (document) {
        setDone(document);
        setPrintTarget(document);
      }
    } catch (error) {
      setNotice(String(error.message || "Validation impossible. Les informations sont conservées."));
    } finally {
      setBusy("");
    }
  }

  function preview(doc = null) {
    const payload = doc || { ...wizardToPayload(state, { status: state.status || "Brouillon" }), number: state.number || "Aperçu" };
    setPrintTarget(payload);
  }

  if (done) {
    return (
      <div className="devis-wizard-backdrop">
        <section className="devis-wizard devis-wizard-done" role="dialog" aria-modal="true" aria-label="Devis créé">
          <header className="devis-wizard-head">
            <div className="devis-wizard-brand">
              <img src="/mkl-energies.png" alt="MKL Énergies" />
              <div>
                <p>ASSISTANT DEVIS</p>
                <h2>Devis créé</h2>
              </div>
            </div>
          </header>
          <div className="devis-wizard-success">
            <CheckCircle2 size={36} />
            <h2>{done.number}</h2>
            <p>{done.client}</p>
            <b>{euro(done.totalTTC)}</b>
          </div>
          <div className="devis-wizard-done-actions">
            <button type="button" className="primary" onClick={() => { onOpenDocument?.(done); onClose?.(); }}><FileText size={16} />Ouvrir le devis</button>
            <button type="button" className="secondary" onClick={() => setPrintTarget(done)}><Download size={16} />Télécharger le PDF</button>
            <button type="button" className="secondary" onClick={() => toast?.("L’envoi e-mail du devis sera branché comme la pro forma.")}><Mail size={16} />Envoyer au client</button>
            <button type="button" className="secondary" onClick={() => setPrintTarget(done)}><PenLine size={16} />Faire signer</button>
            <button type="button" className="secondary" onClick={() => { onDuplicate?.(done); onClose?.(); }}><Copy size={16} />Dupliquer</button>
            <button type="button" onClick={() => { onOpenDocument?.(done); onClose?.(); }}>Revenir à la liste des devis</button>
          </div>
        </section>
        {printTarget && (
          <DevisAnnexPicker
            doc={printTarget}
            articles={articles}
            clients={clients}
            toast={toast}
            onClose={() => setPrintTarget(null)}
          />
        )}
      </div>
    );
  }

  function markRecipientSeen() {
    const recipientId = String(state.clientId || state.prospectId || openQuotes[0]?.clientId || "");
    if (recipientId) dismissedDrafts.current.add(recipientId);
  }

  function resumeQuote(quote) {
    markRecipientSeen();
    setState(documentToWizardState(quote, { clients, prospects }));
    setOpenQuotes([]);
  }

  function duplicateQuoteInWizard(quote) {
    markRecipientSeen();
    const copy = cloneDocumentForCreate(quote, { kind: "Devis", status: "Brouillon", labelSuffix: " (copie)" });
    setState(documentToWizardState({ ...copy, id: undefined, number: "" }, { clients, prospects }));
    setOpenQuotes([]);
  }

  async function deleteOpenQuote(quote) {
    const response = await authFetch(`/api/devis/${quote.id}`, { method: "DELETE" });
    if (!response.ok) return;
    onSaved?.(quote, { deleted: true });
    const next = openQuotes.filter(item => item.id !== quote.id);
    setOpenQuotes(next);
  }

  function dismissOpenQuotes() {
    markRecipientSeen();
    setOpenQuotes([]);
  }

  return (
    <div className="devis-wizard-backdrop">
      <section className={`devis-wizard${openQuotes.length ? " is-prompting" : ""}`} role="dialog" aria-modal="true" aria-label="Créer un devis">
        <header className="devis-wizard-head">
          <div className="devis-wizard-brand">
            <img src="/mkl-energies.png" alt="MKL Énergies" />
            <div>
              <p>ASSISTANT DEVIS</p>
              <h2>{state.number ? `Devis ${state.number}` : "Nouveau devis"}</h2>
            </div>
          </div>
          <button type="button" className="devis-wizard-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </header>
        <ol className="devis-wizard-steps">
          {WIZARD_STEPS.map((step, index) => {
            const doneStep = index < state.step;
            const current = index === state.step;
            return (
              <li key={step.id} className={`${doneStep ? "is-done" : ""} ${current ? "is-current" : ""}`}>
                <button type="button" onClick={() => index <= state.step && goTo(index)}>
                  <span>{doneStep ? <CheckCircle2 size={16} /> : index + 1}</span>
                  {step.label}
                </button>
              </li>
            );
          })}
        </ol>
        {isAdminVip(currentProfile?.role) && (
          <DevisVoiceBar
            message={voiceFeedback.message}
            choices={voiceFeedback.choices}
            onTranscript={text => applyVoiceRef.current(text)}
            onChoose={choice => applyVoiceRef.current("", choice)}
          />
        )}
        <div className="devis-wizard-body">
          {currentStep.id === "client" && (
            <div className="devis-wizard-pane">
              {state.clientSnapshot && (state.clientId || state.prospectId) ? (
                <div className="devis-recipient-pick">
                  <article className="document-window-choice">
                    <span>{state.prospectId ? "Prospect retenu" : "Client retenu"}</span>
                    <b>{state.clientSnapshot.name}</b>
                    <small>
                      {[
                        state.prospectId ? "" : formatClientNumber(state.clientSnapshot.clientNumber),
                        formatProspectNumber(state.clientSnapshot.prospectNumber) || (state.prospectId ? "Numéro prospect en attente" : ""),
                      ].filter(Boolean).join(" · ")}
                    </small>
                    {(state.clientSnapshot.mobile || state.clientSnapshot.phone) ? <p>{state.clientSnapshot.mobile || state.clientSnapshot.phone}</p> : null}
                    {state.clientSnapshot.email ? <p>{state.clientSnapshot.email}</p> : null}
                    {[state.clientSnapshot.address, state.clientSnapshot.postalCode, state.clientSnapshot.city].filter(Boolean).length ? (
                      <p>{[state.clientSnapshot.address, state.clientSnapshot.postalCode, state.clientSnapshot.city].filter(Boolean).join(" ")}</p>
                    ) : null}
                    <AddressCallNotice
                      parts={missingAddressParts(state.clientSnapshot)}
                      person={state.clientSnapshot}
                      clientId={state.clientId || ""}
                      phone={state.clientSnapshot.mobile || state.clientSnapshot.phone || ""}
                      onSaved={values => patch({ clientSnapshot: { ...state.clientSnapshot, ...values } })}
                    />
                  </article>
                  {recipientReady ? (
                    <button type="button" className="devis-recipient-change" onClick={rejectRecipient}>Changer de fiche</button>
                  ) : (
                    <div className="devis-recipient-actions">
                      <button type="button" className="secondary" onClick={rejectRecipient}>Ce n’est pas la bonne fiche</button>
                      <button type="button" className="primary" onClick={() => setRecipientReady(true)}>Valider et continuer</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="devis-recipient-pick">
                  <div className="document-window-hero">
                    <ClientNumberField
                      variant="hero"
                      clients={clients}
                      clientId=""
                      missMessage="Aucun client avec ce numéro."
                      onSelect={item => pickRecipient(item ? { ...item, realId: item.id, directoryKind: "client", badge: "Client" } : null)}
                    />
                  </div>
                  <p className="document-window-or">ou</p>
                  <div className="document-window-hero">
                    <ClientNumberField
                      variant="hero"
                      clients={prospectLookup}
                      clientId=""
                      prefix={PROSPECT_NUMBER_PREFIX}
                      label="Numéro prospect"
                      numberKey="prospectNumber"
                      formatNumber={formatProspectNumber}
                      findNumber={(list, input) => personFromProspectNumber(list, clients, input) || findProspectByNumber(list, input)}
                      missMessage="Aucun prospect avec ce numéro."
                      onSelect={item => {
                        if (!item) return pickRecipient(null);
                        const resolved = item.directoryKind === "client"
                          ? item
                          : (personFromProspectNumber([item], clients, item.prospectNumber) || item);
                        if (resolved.directoryKind === "client") {
                          pickRecipient({ ...resolved, realId: resolved.realId || resolved.id, directoryKind: "client", badge: "Client" });
                          return;
                        }
                        pickRecipient(prospectDirectoryItem(resolved));
                      }}
                    />
                  </div>
                  <p className="document-window-or">ou</p>
                  <div className="devis-recipient-name">
                    <DirectorySearch
                      items={directoryItems}
                      kind="recipient"
                      allowCreate
                      omitAddress
                      singleCreate
                      value=""
                      onChange={pickRecipient}
                      showSelected={false}
                      commercials={commercials}
                      canAssignCommercial={canAssignCommercial}
                      createdItem={client => ({
                        ...client,
                        id: `client:${client.id}`,
                        realId: client.id,
                        directoryKind: "client",
                        badge: "Client",
                      })}
                      onClientCreated={onClientCreated}
                    />
                  </div>
                </div>
              )}
              {recipientReady && state.clientSnapshot && (
                <WizardSection n="2" title="Adresse de chantier" hint="Uniquement si le chantier n’est pas au domicile du client">
                  <label className="client-consent">
                    <input type="checkbox" checked={state.siteDifferent} onChange={event => patch({ siteDifferent: event.target.checked })} />
                    L’adresse du chantier est différente de l’adresse du client
                  </label>
                  {state.siteDifferent && (
                    <div className="devis-wizard-site">
                      <CompleteAddressFields
                        namePrefix="site"
                        address={state.siteAddress}
                        addressComplement={state.siteComplement}
                        postalCode={state.sitePostalCode}
                        city={state.siteCity}
                        onChange={values => patch({
                          siteAddress: values.address,
                          siteComplement: values.addressComplement,
                          sitePostalCode: values.postalCode,
                          siteCity: values.city,
                        })}
                      />
                      <p className="directory-search-help">L’adresse chantier est enregistrée sur le devis, pas sur la fiche client.</p>
                    </div>
                  )}
                  <HousingFields
                    housingType={state.housingType}
                    constructionYear={state.constructionYear}
                    occupancy={state.occupancy}
                    onChange={patch}
                    hint="Si le client ou le prospect a déjà ces infos, elles sont préremplies. Elles servent aussi à l’attestation TVA 5,5 %."
                  />
                </WizardSection>
              )}
            </div>
          )}

          {currentStep.id === "products" && (
            <div className="devis-wizard-pane">
              <WizardSection
                n="2"
                className="quote-section-articles"
                title="Produits et prestations"
                hint="Catalogue MKL, groupe d’articles, ou la ligne libre déjà préparée"
              >
              <div className="quote-article-actions">
                <button type="button" className="primary add-quote-article wizard-open-btn" onClick={() => setPickerMode("bundle")}><Library size={16} />Ajouter un groupe d’articles</button>
                <button type="button" className="primary add-quote-article wizard-open-btn" onClick={() => setPickerMode("article")}><Plus size={16} />Ajouter un article</button>
              </div>
              {pickerMode && (
                <ArticlePickerWizard
                  articles={articles}
                  categories={catalogCategories}
                  subcategories={catalogSubcategories}
                  brandCatalog={brands}
                  bundles={bundles}
                  defaultTax={state.tax}
                  includeInactive={canManageCatalog}
                  initialTab={pickerMode === "bundle" ? "groups" : "articles"}
                  onAdd={line => patch({ items: quoteItems([...filledQuoteItems(state.items), line]) })}
                  onAddMany={lines => patch({ items: quoteItems([...filledQuoteItems(state.items), ...lines]) })}
                  onEnsureBundles={onEnsureBundles}
                  onClose={() => setPickerMode("")}
                />
              )}
              <div className="quote-lines">
                <div className="quote-line quote-head"><span>ARTICLE</span><span>QTÉ</span><span>PRIX HT</span><span>TVA</span><span>REMISE</span><span>TOTAL TTC</span><span></span></div>
                {filledQuoteItems(state.items).length === 0 && <div className="quote-empty">Ajoutez un article ou un groupe, ou renseignez la ligne libre.</div>}
                {withPreparedFreeLine(state.items, state.tax).map((item, index, lines) => {
                  const priced = totals.lines.find(line => String(line.id) === String(item.id));
                  const prepared = isPreparedFreeLine(item);
                  return [
                  isQuoteBundleStart(lines, index) && (
                    <QuoteBundleHeading
                      key={`bundle-${item.id || index}`}
                      title={quoteBundleHeading(item)}
                      onChange={title => patch({ items: setQuoteBundleHeading(state.items, index, title) })}
                    />
                  ),
                  <div className={`quote-line ${item.hiddenOnPrint ? "is-hidden" : ""}`} key={`${item.id || "line"}-${index}`}>
                    <span className="quote-line-article">
                      <input aria-label="Désignation" value={item.name || ""} onChange={event => updateLine(item.id, "name", event.target.value)} placeholder={prepared ? "Ligne libre (facultatif)" : "Désignation"} />
                      <input aria-label="Commentaire" value={item.lineComment || ""} onChange={event => updateLine(item.id, "lineComment", event.target.value)} placeholder="Commentaire" />
                      {isRadiatorMachineArticle(item) && (
                        <label className="quote-radiator-slot">
                          Pied ou roulette
                          <select
                            aria-label={`Pied ou roulette pour ${item.name}`}
                            value={(() => {
                              const next = lines[index + 1];
                              const chosen = next && (String(next.radiatorFor) === String(item.id) || isRadiatorFootOrWheel(next)) ? next : null;
                              return chosen ? String(chosen.articleId || chosen.code || "") : "";
                            })()}
                            onChange={event => chooseRadiatorAccessory(item, event.target.value)}
                          >
                            <option value="">Choisir un pied ou des roulettes</option>
                            {radiatorFootAndWheelChoices(articles).map(article => (
                              <option key={article.id || article.code} value={article.id || article.code}>
                                {article.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </span>
                    <input type="number" min="0.01" step="0.01" value={item.qty} onChange={event => updateLine(item.id, "qty", event.target.value)} />
                    <input type="number" min="0" step="0.01" value={item.unit} disabled={!canPrice} onChange={event => updateLine(item.id, "unit", event.target.value)} />
                    <select value={item.tax ?? state.tax} disabled={!canPrice} onChange={event => updateLine(item.id, "tax", Number(event.target.value))}>
                      <option value="0">0 %</option><option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option>
                    </select>
                    <input type="number" min="0" step="0.01" value={item.discountValue || 0} disabled={!canPrice} onChange={event => updateLine(item.id, "discountValue", event.target.value)} />
                    <b>{euro(priced?.totalTTC || 0)}</b>
                    <div className="devis-line-tools">
                      {!prepared && <button type="button" onClick={() => moveLine(index, -1)} aria-label="Monter">↑</button>}
                      {!prepared && <button type="button" onClick={() => moveLine(index, 1)} aria-label="Descendre">↓</button>}
                      {!prepared && <button type="button" onClick={() => updateLine(item.id, "hiddenOnPrint", !item.hiddenOnPrint)}>{item.hiddenOnPrint ? "Afficher" : "Masquer"}</button>}
                      {!prepared && <button type="button" onClick={() => patch({ items: quoteItems(state.items.filter(line => line.id !== item.id && String(line.radiatorFor) !== String(item.id))) })}><Trash2 size={15} /></button>}
                    </div>
                  </div>,
                  ];
                })}
              </div>
              <div className="quote-summary">
                <div className="global-discount">
                  <label>Remise globale
                    <select name="globalDiscountType" value={state.globalDiscountType} disabled={!canPrice} onChange={event => patch({ globalDiscountType: event.target.value })}>
                      <option value="percent">Pourcentage (%)</option>
                      <option value="amount">Montant TTC (€)</option>
                    </select>
                  </label>
                  <label>Valeur
                    <input type="number" min="0" step="0.01" value={state.globalDiscountValue} disabled={!canPrice} onChange={event => patch({ globalDiscountValue: event.target.value })} />
                  </label>
                </div>
                <div className="quote-totals">
                  <p><span>Total HT</span><b>{euro(totals.beforeGlobalHT)}</b></p>
                  {totals.globalDiscountTTC > 0 && <p className="discount"><span>Remise</span><b>− {euro(totals.globalDiscountTTC)}</b></p>}
                  <p><span>Total après remise</span><b>{euro(totals.totalHT)}</b></p>
                  <p><span>TVA</span><b>{euro(totals.taxAmount)}</b></p>
                  <p className="grand-total"><span>Total TTC</span><b>{euro(totals.totalTTC)}</b></p>
                </div>
              </div>
              </WizardSection>
            </div>
          )}

          {currentStep.id === "conditions" && (
            <div className="devis-wizard-pane">
              <WizardSection n="3" title="Document" hint="Numéro automatique, dates et objet de l’offre">
                <div className="form-row">
                  <label>Type de document<input value="Devis" readOnly /></label>
                  <label>Numéro du document
                    <input value={state.number} readOnly placeholder="Attribué à l’enregistrement" />
                    <small>Généré automatiquement — non modifiable</small>
                  </label>
                </div>
                <div className="form-row">
                  <label>Date d’émission
                    <input type="date" value={state.date} onChange={event => {
                      const next = event.target.value;
                      patch({ date: next, due: defaultQuoteValidityDate(next), deliveryDate: defaultQuoteDeliveryDate(next) });
                    }} />
                  </label>
                  <label>Date de validité<input type="date" value={state.due} onChange={event => patch({ due: event.target.value })} /></label>
                </div>
                <div className="form-row">
                  <label>Référence interne<input value={state.internalRef} onChange={event => patch({ internalRef: event.target.value })} /></label>
                  <label>Objet du devis<input value={state.label} onChange={event => patch({ label: event.target.value })} placeholder="Installation PAC 8 kW" /></label>
                </div>
                <div className="form-row">
                  <label>Délai estimatif de livraison<input type="date" value={state.deliveryDate} onChange={event => patch({ deliveryDate: event.target.value })} /></label>
                  <label>Délai estimatif d’installation<input value={state.installDelay} onChange={event => patch({ installDelay: event.target.value })} placeholder="3 à 5 jours" /></label>
                </div>
                <label>Durée de validité de l’offre<input value={state.offerValidityNote} onChange={event => patch({ offerValidityNote: event.target.value })} /></label>
              </WizardSection>
              <WizardSection n="4" title="Représentant MKL Énergies" hint="Nom, prénom et signature du commercial">
                {mustAssignCommercial ? (
                  <label>Représentant commercial
                    <select value={state.commercialId} onChange={event => assignCommercial(event.target.value, ownerCommercials, patch, commercials, currentUserId, state.commercialId)}>
                      <option value="">Sans commercial — à attribuer</option>
                      {ownerCommercials.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <label>Représentant commercial
                    <input value={commercials.find(user => String(user.id) === String(state.commercialId))?.name || currentUserName} readOnly />
                  </label>
                )}
                <div className="form-row">
                  <label>Nom<input value={state.representativeLastName} onChange={event => patch({ representativeLastName: event.target.value })} /></label>
                  <label>Prénom<input value={state.representativeFirstName} onChange={event => patch({ representativeFirstName: event.target.value })} /></label>
                </div>
                <SignaturePad title="Signature du représentant" value={state.representativeSignature} onChange={value => patch({ representativeSignature: value })} />
              </WizardSection>
              {photovoltaic && (
                <WizardSection n="5" title="Photovoltaïque" hint="Mandat de raccordement — champ historique (souvent appelé OKL)">
                  <div className="grid-operator-block">
                    <b>Gestionnaire du réseau électrique</b>
                    <span className="directory-search-help">Conservé tel quel : réséda, UME, SER ou Enedis.</span>
                    <div className="operator-options">
                      {ELECTRICITY_OPERATORS.map(operator => (
                        <label key={operator.id} className={state.electricityOperator === operator.id ? "selected" : ""}>
                          <input type="radio" name="electricityOperator" checked={state.electricityOperator === operator.id} onChange={() => patch({ electricityOperator: operator.id })} />
                          <CheckCircle2 size={17} />
                          <span><b>{operator.name}</b><small>Mandat de raccordement</small></span>
                        </label>
                      ))}
                    </div>
                    <label>Puissance à raccorder (kWc)
                      <input type="number" min="0.1" step="0.1" value={state.pvPowerKwp} onChange={event => patch({ pvPowerKwp: event.target.value })} />
                    </label>
                  </div>
                </WizardSection>
              )}
            </div>
          )}

          {currentStep.id === "finance" && (
            <div className="devis-wizard-pane">
              <WizardSection n="4" title="Mode de financement" hint="Comment le client souhaite-t-il financer son projet ?">
                <div className="devis-finance-choices">
                  {FINANCE_MODES.map(mode => (
                    <label key={mode.id} className={state.financeMode === mode.id ? "selected" : ""}>
                      <input type="radio" name="financeMode" checked={state.financeMode === mode.id} onChange={() => patch({
                        financeMode: mode.id,
                        financier: mode.id === "credit" && (!state.financier || state.financier === "Sans financement") ? "Sofinco" : mode.id === "credit" ? state.financier : "Sans financement",
                        financedAmount: mode.id === "credit" ? Number(totals.totalTTC.toFixed(2)) : state.financedAmount,
                      })} />
                      {mode.label}
                    </label>
                  ))}
                </div>
                <label>Conditions de règlement<textarea rows="2" value={state.conditionsReglement} onChange={event => patch({ conditionsReglement: event.target.value })} /></label>
              </WizardSection>
              {state.financeMode === "cash" && (
                <WizardSection n="5" title="Paiement comptant" hint="Acompte, solde et échéancier">
                  <div className="form-row">
                    <label>Montant TTC<input readOnly value={euro(totals.totalTTC)} /></label>
                    <label>Acompte demandé<input type="number" min="0" step="0.01" value={state.acompte} onChange={event => patch({ acompte: event.target.value })} /></label>
                    <label>Solde restant<input readOnly value={euro(Math.max(0, totals.totalTTC - acompte))} /></label>
                    <label>Échéancier<input value={state.cashSchedule} onChange={event => patch({ cashSchedule: event.target.value })} /></label>
                    <label>Mode de paiement
                      <select value={state.paymentMethod} onChange={event => patch({ paymentMethod: event.target.value })}>
                        {PAYMENT_METHODS.map(method => <option key={method}>{method}</option>)}
                      </select>
                    </label>
                  </div>
                </WizardSection>
              )}
              {state.financeMode === "installments" && (
                <WizardSection n="5" title="Paiement en plusieurs fois" hint="Échéances gérées par MKL Énergies">
                  <div className="form-row">
                    <label>Montant total<input readOnly value={euro(totals.totalTTC)} /></label>
                    <label>Montant de l’acompte<input type="number" min="0" step="0.01" value={state.acompte} onChange={event => patch({ acompte: event.target.value })} /></label>
                    <label>Nombre d’échéances
                      <input type="number" min="1" value={state.installmentCount} onChange={event => {
                        const count = Number(event.target.value || 1);
                        patch({ installmentCount: count, installmentAmount: suggestInstallmentAmount(totals.totalTTC, wizardAcompte({ ...state, installmentCount: count }, totals.totalTTC), count) });
                      }} />
                    </label>
                    <label>Montant de chaque échéance
                      <input type="number" min="0" step="0.01" value={state.installmentAmount || suggestInstallmentAmount(totals.totalTTC, acompte, state.installmentCount)} onChange={event => patch({ installmentAmount: event.target.value })} />
                    </label>
                    <label>Mode de paiement
                      <select value={state.paymentMethod} onChange={event => patch({ paymentMethod: event.target.value })}>
                        {PAYMENT_METHODS.map(method => <option key={method}>{method}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>Dates des échéances
                    <input value={(state.installmentDates || []).join(", ")} onChange={event => patch({ installmentDates: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} placeholder="2026-10-01, 2026-11-01" />
                  </label>
                </WizardSection>
              )}
              {state.financeMode === "credit" && (
                <WizardSection n="5" title="Crédit affecté" hint="Organisme partenaire, montant et dossier">
                  <div className="form-row">
                    <label>Organisme de financement
                      <select value={state.financier} onChange={event => patch({ financier: event.target.value })}>
                        {DEVIS_FINANCIERS.filter(name => name !== "Sans financement").map(name => <option key={name}>{name}</option>)}
                      </select>
                    </label>
                    <label>Montant de financement<input type="number" min="0" step="0.01" readOnly value={Number(totals.totalTTC.toFixed(2))} /></label>
                    <label>Apport personnel<input type="number" min="0" step="0.01" value={state.personalContribution} onChange={event => patch({ personalContribution: event.target.value })} /></label>
                    <label>Durée (mois)<input type="number" min="1" value={state.financeMonths} onChange={event => patch({ financeMonths: event.target.value })} /></label>
                    <label>Mensualité<input type="number" min="0" step="0.01" value={state.monthlyPayment} onChange={event => patch({ monthlyPayment: event.target.value })} /></label>
                    <label>Première mensualité JRS
                      <select value={state.firstMonthlyPayment == null || state.firstMonthlyPayment === "" ? "" : String(state.firstMonthlyPayment)} onChange={event => patch({ firstMonthlyPayment: event.target.value })}>
                        {firstMonthlyDelayChoices(state.firstMonthlyPayment).map(choice => <option key={choice || "none"} value={choice}>{choice || "—"}</option>)}
                      </select>
                    </label>
                    <label>TAEG (%)<input type="number" min="0" step="0.01" value={state.financeTaeg} onChange={event => patch({ financeTaeg: event.target.value })} /></label>
                    <label>TAEA (%)<input type="number" min="0" step="0.01" value={state.financeTaea} onChange={event => patch({ financeTaea: event.target.value })} /></label>
                    <label>Numéro du dossier<input value={state.financeFileNumber} onChange={event => patch({ financeFileNumber: event.target.value })} /></label>
                    <label>Statut du financement
                      <select value={state.financeStatus} onChange={event => patch({ financeStatus: event.target.value })}>
                        {FINANCE_STATUSES.map(status => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                  </div>
                </WizardSection>
              )}
              {financeError && <p className="devis-wizard-alert"><AlertTriangle size={16} />{financeError}</p>}
            </div>
          )}

          {currentStep.id === "summary" && (
            <div className="devis-wizard-pane devis-wizard-summary">
              <WizardSection n="1" title="Client" actions={<button type="button" className="wizard-link" onClick={() => goTo(0)}><Pencil size={14} />Modifier</button>}>
                <p>{state.clientSnapshot?.name}</p>
                <p>{state.clientSnapshot?.phone || state.clientSnapshot?.mobile} · {state.clientSnapshot?.email}</p>
                <p>{[state.clientSnapshot?.address, state.clientSnapshot?.postalCode, state.clientSnapshot?.city].filter(Boolean).join(" ")}</p>
                <AddressCallNotice
                  parts={missingAddressParts(state.clientSnapshot || {})}
                  person={state.clientSnapshot}
                  clientId={state.clientId || ""}
                  phone={state.clientSnapshot?.mobile || state.clientSnapshot?.phone || ""}
                  onSaved={values => patch({ clientSnapshot: { ...(state.clientSnapshot || {}), ...values } })}
                />
                {state.siteDifferent && <p>Chantier : {[state.siteAddress, state.sitePostalCode, state.siteCity].filter(Boolean).join(" ")}</p>}
              </WizardSection>
              <WizardSection n="2" title="Produits" actions={<button type="button" className="wizard-link" onClick={() => goTo(1)}><Pencil size={14} />Modifier</button>}>
                <ul>{filledQuoteItems(state.items).map(item => <li key={item.id}>{item.qty} × {item.name} — {euro(item.unit)}</li>)}</ul>
                <p className="devis-wizard-summary-total">Total HT {euro(totals.totalHT)} · TVA {euro(totals.taxAmount)} · <b>Total TTC {euro(totals.totalTTC)}</b></p>
              </WizardSection>
              <WizardSection n="3" title="Conditions" actions={<button type="button" className="wizard-link" onClick={() => goTo(2)}><Pencil size={14} />Modifier</button>}>
                <p>{state.number || "Numéro à l’enregistrement"} · {state.date} → {state.due}</p>
                {state.offerValidityNote && <p>Validité de l’offre : {state.offerValidityNote}</p>}
              </WizardSection>
              <WizardSection n="4" title="Financement" actions={<button type="button" className="wizard-link" onClick={() => goTo(3)}><Pencil size={14} />Modifier</button>}>
                <p>{FINANCE_MODES.find(mode => mode.id === state.financeMode)?.label}</p>
                {(acompte > 0 || state.conditionsReglement) && <p>Acompte {euro(acompte)}{state.conditionsReglement ? ` · ${state.conditionsReglement}` : ""}</p>}
                {state.financeMode === "credit" && <p>{state.financier} · financé {euro(state.financedAmount)} · apport {euro(state.personalContribution)} · {state.financeStatus}</p>}
              </WizardSection>
              {commercialDocs.length > 0 && (
                <WizardSection n="5" title="Documentation commerciale" hint="Cochez le PDF commercial à coller après le devis, dans l’ordre des articles.">
                  {commercialDocs.map(doc => (
                    <label className="client-consent" key={doc.key}>
                      <input
                        type="checkbox"
                        checked={selectedCommercialIds.includes(doc.key)}
                        onChange={event => {
                          const current = selectedCommercialIds;
                          patch({
                            printCommercialDocIds: event.target.checked
                              ? [...new Set([...current, doc.key])]
                              : current.filter(id => id !== doc.key),
                          });
                        }}
                      />
                      <span>
                        Joindre « {doc.name || doc.code} » après le devis{doc.ficheName ? ` — ${doc.ficheName}` : ""}
                        <button
                          type="button"
                          className="wizard-link"
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            downloadArticleCommercialDoc(doc);
                          }}
                        >
                          Aperçu / télécharger
                        </button>
                      </span>
                    </label>
                  ))}
                </WizardSection>
              )}
              {pvMandate && (
                <WizardSection n={String(5 + (commercialDocs.length ? 1 : 0))} title="Mandat photovoltaïque" hint="Proposé dans la fenêtre d’impression, coché par défaut">
                  <p>Le mandat de démarches photovoltaïques est ajouté au PDF du devis, prérempli avec le client. La signature reste à compléter sur le document.</p>
                  {pvPreview && (
                    <dl className="cerfa-wizard-preview">
                      <div><dt>Client</dt><dd>{pvPreview.name || "—"}</dd></div>
                      <div><dt>Adresse</dt><dd>{[pvPreview.address, pvPreview.postal].filter(Boolean).join(" ") || "—"}</dd></div>
                      <div><dt>Fait à</dt><dd>{[pvPreview.place, [pvPreview.day, pvPreview.month, pvPreview.year].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "—"}</dd></div>
                    </dl>
                  )}
                </WizardSection>
              )}
              {hasVat55 && (
                <WizardSection n={String(5 + summaryOffset)} title="Attestation TVA 5,5 %" hint="CERFA 1301-SD — proposé avant l’impression, décoché par défaut">
                  <p>L’attestation est proposée dans la fenêtre d’impression. Elle ne part avec le devis que si vous la cochez.</p>
                  {cerfaPreview && (
                    <dl className="cerfa-wizard-preview">
                      <div><dt>Client</dt><dd>{[cerfaPreview.lastName, cerfaPreview.firstName].filter(Boolean).join(" ") || "—"}</dd></div>
                      <div><dt>Adresse</dt><dd>{[cerfaPreview.address, cerfaPreview.postalCode, cerfaPreview.city].filter(Boolean).join(" ") || "—"}</dd></div>
                      <div><dt>Logement</dt><dd>{state.housingType || "—"}{state.occupancy ? ` · ${state.occupancy}` : ""}</dd></div>
                      <div><dt>Articles 5,5 %</dt><dd>{cerfaPreview.items.map(item => item.name).filter(Boolean).join(", ") || "—"}</dd></div>
                    </dl>
                  )}
                </WizardSection>
              )}
              {anahMandate && (
                <WizardSection n={String(5 + summaryOffset + (hasVat55 ? 1 : 0))} title="Mandat ANAH" hint="Proposé dans la fenêtre d’impression, coché par défaut">
                  <p>Le mandat MaPrimeRénov’ est ajouté à la fin du devis, prérempli avec les coordonnées du client.</p>
                  {anahPreview && (
                    <dl className="cerfa-wizard-preview">
                      <div><dt>Client</dt><dd>{[anahPreview.lastName, anahPreview.firstName].filter(Boolean).join(" ") || "—"}</dd></div>
                      <div><dt>Adresse</dt><dd>{[anahPreview.address, anahPreview.postal, anahPreview.city].filter(Boolean).join(" ") || "—"}</dd></div>
                      <div><dt>Contact</dt><dd>{[anahPreview.phone, anahPreview.email].filter(Boolean).join(" · ") || "—"}</dd></div>
                    </dl>
                  )}
                </WizardSection>
              )}
              <WizardSection n={String(5 + summaryOffset + (hasVat55 ? 1 : 0) + (anahMandate ? 1 : 0))} title="Notes" hint="Conditions particulières et commentaires — ils figurent en bas du devis">
                <label>Conditions particulières<textarea rows="4" value={state.specialConditions} onChange={event => patch({ specialConditions: event.target.value })} placeholder="Mentions propres à ce chantier…" /></label>
                <label>Commentaire interne<textarea rows="2" value={state.internalComment} onChange={event => patch({ internalComment: event.target.value })} /></label>
                <label>Commentaire visible par le client<textarea rows="2" value={state.freeNote} onChange={event => patch({ freeNote: event.target.value })} /></label>
              </WizardSection>
              <div className="devis-wizard-summary-actions">
                <button type="button" className="secondary" onClick={() => preview()}><Eye size={16} />Prévisualiser le PDF</button>
              </div>
            </div>
          )}
          {notice && <p className="devis-wizard-alert"><AlertTriangle size={16} />{notice}</p>}
        </div>
        <footer className="devis-wizard-foot">
          <button type="button" onClick={onClose}>Annuler</button>
          <button type="button" className="secondary" disabled={busy === "draft" || (!state.clientId && !state.prospectId)} onClick={saveDraft}>
            <Save size={16} />Enregistrer comme brouillon
          </button>
          {state.step > 0 && (
            <button type="button" className="secondary" onClick={() => goTo(state.step - 1)}>
              <ArrowLeft size={16} />Précédent
            </button>
          )}
          {state.step < WIZARD_STEPS.length - 1 ? (
            (state.step > 0 || recipientReady) && <button type="button" className="primary" disabled={errors.length > 0} onClick={() => goTo(state.step + 1)}>
              Suivant<ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="primary" disabled={busy === "validate" || errors.length > 0} onClick={validate}>
              <CheckCircle2 size={16} />Valider et créer le devis
            </button>
          )}
        </footer>
      {openQuotes.length > 0 && (
        <div className="devis-wizard-prompt">
          <div className="devis-wizard-prompt-card">
            <div className="devis-wizard-prompt-head">
              <AlertTriangle size={20} />
              <div>
                <b>{openQuotes.length > 1 ? "Ce client a des devis en cours" : "Ce client a un devis en cours"}</b>
                <span>Vous pouvez suivre le devis existant, ou poursuivre quand même un nouveau devis.</span>
              </div>
            </div>
            <ul className="devis-wizard-prompt-list">
              {openQuotes.map(quote => (
                <li key={quote.id}>
                  <div>
                    <b>{quote.number || "Sans numéro"}</b>
                    <span>{quote.status || "Brouillon"}{quote.label ? ` · ${quote.label}` : ""}</span>
                  </div>
                  <div>
                    <button type="button" className="primary" onClick={() => resumeQuote(quote)}>Suivre</button>
                    <button type="button" className="secondary" onClick={() => duplicateQuoteInWizard(quote)}>Dupliquer</button>
                    {canDeleteDraft && quote.status === "Brouillon" && (
                      <button type="button" className="trash" onClick={() => deleteOpenQuote(quote)}>Supprimer</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className="devis-wizard-prompt-new" onClick={dismissOpenQuotes}>
              Poursuivre quand même
            </button>
          </div>
        </div>
      )}
      </section>
      {printTarget && (
        <DevisAnnexPicker
          doc={printTarget}
          articles={articles}
          clients={clients}
          toast={toast}
          onClose={() => setPrintTarget(null)}
        />
      )}
    </div>
  );
}

function assignCommercial(id, ownerCommercials, patch, commercials, currentUserId, commercialId) {
  const previous = ownerCommercials.find(user => String(user.id) === String(commercialId));
  const next = ownerCommercials.find(user => String(user.id) === String(id));
  patch({ commercialId: id });
  if (!next) return;
  const nextName = splitPersonName(next.name);
  const prevName = previous
    ? splitPersonName(previous.name)
    : splitPersonName((commercials.find(user => String(user.id) === String(currentUserId)) || {}).name);
  patch({
    commercialId: id,
    representativeFirstName: nextName.firstName,
    representativeLastName: nextName.lastName,
  });
  void prevName;
}
