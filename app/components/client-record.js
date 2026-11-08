"use client";

import { useState } from "react";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  Flame,
  HardHat,
  Ruler,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Sun,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import ClientDocumentVault from "./client-document-vault";
import RecordDocumentList, { downloadRecordDocument } from "./record-document-list";
import DevisAnnexPicker from "./devis-annex-picker";
import {
  FINANCE_DECISIONS,
  formatFrDate,
  hasQuoteFinancing,
  PREVISIT_SCHEDULED_STATUS,
  sameClientRecord,
  scheduledPrevisit,
} from "../lib/client-followup";
import { formatClientNumber } from "../lib/client-number";
import { formatProspectNumber } from "../lib/prospect-number";
import { documentDateLabel, documentsForRecord } from "../lib/record-documents";
import AddressCallNotice, { dialPhone } from "./address-call-notice";
import { missingAddressParts } from "../lib/address";
import { allowedRdvStatusesFor, canStatuerAppointment, displayRdvStatus, rdvStatuerHint, rdvStatusTone } from "../lib/appointment-status";
import { appointmentsForClient, formatRdvClock, formatRdvDate } from "../lib/commercial-rdv-table";

const euro = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value || 0));

function ClientPdfPanel({ documents, clients, articles = [] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [printDoc, setPrintDoc] = useState(null);
  const rows = documents.filter(doc => doc.download || doc.href);

  async function download(doc) {
    if (doc.download === "devis" && doc.source) {
      setPrintDoc(doc);
      return;
    }
    setBusyId(doc.id);
    setError("");
    try {
      await downloadRecordDocument(doc, { clients });
    } catch (err) {
      setError(String(err.message || "Téléchargement impossible."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="client-pdf-panel">
      <h3>PDF de la fiche</h3>
      <p>Devis, factures, études et notes rattachés à ce client.</p>
      {error ? <p className="client-pdf-error">{error}</p> : null}
      {rows.length === 0 ? (
        <p>Aucun PDF généré pour cette fiche.</p>
      ) : (
        <table className="client-pdf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Document</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(doc => (
              <tr key={doc.id}>
                <td>{documentDateLabel(doc.date) || "—"}</td>
                <td>{doc.kind}</td>
                <td>{doc.title || "—"}</td>
                <td>
                  <button type="button" disabled={busyId === doc.id} onClick={() => download(doc)}>
                    <Download size={13} />{busyId === doc.id ? "…" : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {printDoc && (
        <DevisAnnexPicker
          doc={printDoc.source}
          articles={articles}
          clients={clients}
          filename={printDoc.pdfFilename}
          onClose={() => setPrintDoc(null)}
        />
      )}
    </div>
  );
}

export default function ClientRecord({
  client,
  billing = [],
  contracts = [],
  visits = [],
  installations = [],
  pvProjects = [],
  thermalStudies = [],
  pvSimulations = [],
  clients = [],
  articles = [],
  canDelete = false,
  onEdit,
  onCreateQuote,
  onDelete,
  onClose,
  onFinanceDecision,
  onSchedulePrevisit,
  onStartDocument,
  appointments = [],
  prospects = [],
  currentProfile = null,
  currentUserId = "",
  onUpdateAppointment,
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [askAddress, setAskAddress] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [rdvError, setRdvError] = useState("");
  const [previsitDate, setPrevisitDate] = useState("");
  const clientAppointments = appointmentsForClient(client, appointments, prospects);

  const quotes = billing.filter(doc => sameClientRecord(doc, client) && (doc.kind || "Devis") === "Devis");
  const financedQuotes = quotes.filter(hasQuoteFinancing);
  const clientVisits = visits.filter(visit => sameClientRecord(visit, client));
  const visit = scheduledPrevisit(clientVisits);
  const visitDate = visit?.date || "";
  const visitLabel = visit?.status === PREVISIT_SCHEDULED_STATUS && visitDate
    ? `${PREVISIT_SCHEDULED_STATUS} — ${formatFrDate(visitDate)}`
    : visitDate
      ? `Prévisite le ${formatFrDate(visitDate)}`
      : visit?.status || "";

  const phone = client.mobile || client.phone || "";
  const phoneLabel = [client.mobile, client.phone].filter((value, index, list) => value && list.indexOf(value) === index).join(" · ");
  const addressGaps = missingAddressParts(client);
  const docs = documentsForRecord({
    person: client,
    kind: "client",
    billing,
    contracts,
    visits,
    installations,
    pvProjects,
    thermalStudies,
    pvSimulations,
  });

  async function decideFinance(quote, financeStatus) {
    if (!onFinanceDecision || busyId) return;
    setBusyId(quote.id);
    try {
      await onFinanceDecision(quote, financeStatus);
    } finally {
      setBusyId("");
    }
  }

  async function changeRdvStatus(item, status) {
    if (!onUpdateAppointment || busyId) return;
    setRdvError("");
    setBusyId(item.id);
    try {
      await onUpdateAppointment(item, { status });
    } catch (error) {
      setRdvError(String(error?.message || "Ce statut ne peut pas être posé."));
    } finally {
      setBusyId("");
    }
  }

  function submitPrevisit(event) {
    event.preventDefault();
    const date = previsitDate || event.currentTarget.date?.value;
    if (!date || !onSchedulePrevisit) return;
    onSchedulePrevisit(client, date);
    setPrevisitDate("");
  }

  return (
    <div className="client-record-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section className={`client-record${pdfOpen ? " is-pdf-open" : ""}`}>
        <div className="client-record-main">
        <header className="client-record-head">
          <div className="client-record-avatar">{client.name?.[0] || "C"}</div>
          <div>
            <small>FICHE CLIENT{formatClientNumber(client.clientNumber) ? ` · ${formatClientNumber(client.clientNumber)}` : ""}{formatProspectNumber(client.prospectNumber) ? ` · ${formatProspectNumber(client.prospectNumber)}` : ""}</small>
            <h2>{client.name}</h2>
            <span>{client.customerType || "Client"} • {client.status || "Prospect"}</span>
          </div>
          <div className="client-record-actions">
            <button type="button" className="client-record-btn is-secondary client-photo-button-head" onClick={() => setPhotoOpen(true)}>
              <Camera size={16} />Photographier
            </button>
            {onCreateQuote && (
              <button type="button" className="client-record-btn is-primary" onClick={onCreateQuote}>
                <FileText size={16} />Créer un devis
              </button>
            )}
            {onEdit && (
              <button type="button" className="client-record-btn is-secondary" onClick={onEdit}>
                <Pencil size={16} />Modifier
              </button>
            )}
            {canDelete && onDelete && (
              <button type="button" className="client-record-btn is-ghost" onClick={onDelete} aria-label="Supprimer">
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" className="client-record-btn is-ghost" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="client-record-body">
          <div className="client-record-info">
            <div><UserRound /><span><small>Contact</small><b>{client.civilite ? `${client.civilite} ` : ""}{client.contact || `${client.firstName || ""} ${client.lastName || ""}`.trim() || "À compléter"}</b></span></div>
            <div><Phone /><span><small>Téléphone</small>{phone ? addressGaps.length ? <button type="button" className="client-record-call" onClick={() => setAskAddress(true)}>{phoneLabel}</button> : <a className="client-record-call" href={`tel:${phone.replace(/\s/g, "")}`}>{phoneLabel}</a> : <b>À compléter</b>}</span></div>
            <div><Mail /><span><small>Email</small><b>{client.email || "À compléter"}</b></span></div>
            <div><MapPin /><span><small>Adresse</small><b>{client.address || "À compléter"}{client.addressComplement ? `, ${client.addressComplement}` : ""} {client.postalCode} {client.city}</b></span></div>
            <div><HardHat /><span><small>Projet</small><b>{client.projectType || client.install || "À définir"}</b></span></div>
            <div><UserRound /><span><small>Responsable</small><b>{client.owner || "Non affecté"}</b></span></div>
          </div>
          {askAddress && (
            <AddressCallNotice
              parts={addressGaps}
              onComplete={onEdit ? () => { setAskAddress(false); onEdit(); } : null}
              onCall={() => { setAskAddress(false); dialPhone(phone); }}
            />
          )}

          {onStartDocument && (
            <section className="client-document-launch">
              <h3>Créer un document</h3>
              <div>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("soft")}><FileText size={16} />Étude soft</button>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("install")}><Sun size={16} />Étude d’installation</button>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("contract")}><Wrench size={16} />Contrat de maintenance</button>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("thermal")}><Flame size={16} />Étude thermique</button>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("sizing")}><Ruler size={16} />Note de dimensionnement</button>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("simulator")}><Sun size={16} />Simulateur photovoltaïque</button>
                <button type="button" className="client-record-btn is-secondary" onClick={() => onStartDocument("previsit")}><HardHat size={16} />Prévisite</button>
              </div>
            </section>
          )}

          <section className="client-followup">
            <div className="client-followup-block">
              <b>Rendez-vous</b>
              <span>Le statut se pose ici. Le tableau de suivi ne fait que l’afficher.</span>
              {rdvError ? <p className="client-number-miss">{rdvError}</p> : null}
              {clientAppointments.length === 0 && <p className="client-followup-date">Aucun rendez-vous commercial sur cette fiche.</p>}
              {clientAppointments.map(item => {
                const options = allowedRdvStatusesFor(currentProfile, currentUserId, item);
                const canStatuer = canStatuerAppointment(currentProfile, currentUserId, item) && options.length > 0;
                const hint = rdvStatuerHint(currentProfile, currentUserId, item);
                return (
                  <article key={item.id} className="client-followup-card">
                    <div>
                      <small>{formatRdvDate(item.start)} · {formatRdvClock(item.start)}</small>
                      <strong>{item.appointmentType || "Rendez-vous"}</strong>
                      <em>{item.commercial || "Commercial non attribué"}</em>
                    </div>
                    {canStatuer ? (
                      <label className="client-followup-status">
                        Statut RDV
                        <select
                          className={`status-select ${rdvStatusTone(item.status)}`}
                          value={displayRdvStatus(item.status)}
                          disabled={busyId === item.id}
                          aria-label={`Statut du rendez-vous du ${formatRdvDate(item.start)}`}
                          onChange={event => changeRdvStatus(item, event.target.value)}
                        >
                          {options.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                        {hint ? <em>{hint}</em> : null}
                      </label>
                    ) : (
                      <span className={`status-select ${rdvStatusTone(item.status)}`}>{displayRdvStatus(item.status)}</span>
                    )}
                  </article>
                );
              })}
            </div>
            {financedQuotes.length > 0 && (
              <div className="client-followup-block">
                <b>Financement</b>
                <span>Accepter ou refuser le dossier sans ouvrir le devis.</span>
                {financedQuotes.map(quote => (
                  <article key={quote.id} className="client-followup-card">
                    <div>
                      <small>{quote.number || "Devis"} · {quote.financier}</small>
                      <strong>{euro(quote.financedAmount || quote.totalTTC)}</strong>
                      <em>Statut : {quote.financeStatus || "À constituer"}</em>
                    </div>
                    <div className="client-followup-actions">
                      {FINANCE_DECISIONS.map(decision => (
                        <button
                          key={decision}
                          type="button"
                          className={`client-record-btn ${quote.financeStatus === decision ? (decision === "Accepté" ? "is-primary" : "is-sun") : "is-secondary"}`}
                          disabled={busyId === quote.id}
                          onClick={() => decideFinance(quote, decision)}
                        >
                          <CheckCircle2 size={14} />{decision === "Accepté" ? "Accepter" : "Refuser"}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="client-followup-block">
              <b>Prévisite</b>
              <span>{visitLabel || "Programmez une date. Le statut devient « Prévisite programmée »."}</span>
              {visit?.status === PREVISIT_SCHEDULED_STATUS && visitDate && (
                <p className="client-followup-date">{PREVISIT_SCHEDULED_STATUS} — {formatFrDate(visitDate)}</p>
              )}
              <form className="client-followup-form" onSubmit={submitPrevisit}>
                <label>Date de prévisite
                  <input type="date" name="date" required value={previsitDate || visitDate.slice(0, 10)} onChange={e => setPrevisitDate(e.target.value)} />
                </label>
                <button type="submit" className="client-record-btn is-primary">
                  <CalendarDays size={15} />Programmer
                </button>
              </form>
            </div>
          </section>

          <div className="client-document-head">
            <FileText />
            <span>
              <b>Documents du client</b>
              <small>{docs.length} document{docs.length !== 1 ? "s" : ""} associé{docs.length !== 1 ? "s" : ""}</small>
            </span>
          </div>
          <div className="client-documents">
            <RecordDocumentList documents={docs} clients={clients.length ? clients : [client]} articles={articles} />
          </div>
          <ClientDocumentVault client={client} captureOpen={photoOpen} onCaptureOpenChange={setPhotoOpen} />
        </div>
        <div className="client-record-photo-bar">
          <button type="button" className="client-record-btn is-sun is-block" onClick={() => setPhotoOpen(true)}>
            <Camera size={18} />Photographier un document
          </button>
        </div>
        </div>
        <aside className="client-pdf-rail" aria-label="PDF">
          <button
            type="button"
            className={`client-pdf-tab${pdfOpen ? " is-open" : ""}`}
            aria-expanded={pdfOpen}
            onClick={() => setPdfOpen(open => !open)}
          >
            PDF
          </button>
          {pdfOpen ? <ClientPdfPanel documents={docs} clients={clients.length ? clients : [client]} articles={articles} /> : null}
        </aside>
      </section>
    </div>
  );
}
