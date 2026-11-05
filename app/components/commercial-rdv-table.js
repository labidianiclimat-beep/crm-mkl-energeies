"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { ClientPhoneLink } from "./address-call-notice";
import {
  AGENDA_STATUSES,
  rdvStatusTone,
} from "../lib/appointment-status";
import {
  RDV_TABLE_PAGE_SIZES,
  RDV_TABLE_PERIODS,
  buildCommercialRdvTable,
} from "../lib/commercial-rdv-table";

export default function CommercialRdvTable({
  appointments = [],
  prospects = [],
  commercials = [],
  query = "",
  clients = [],
  onOpen,
  onOpenClient,
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [commercialId, setCommercialId] = useState("");
  const [prospectorId, setProspectorId] = useState("");
  const [onDate, setOnDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const table = useMemo(() => buildCommercialRdvTable(appointments, prospects, {
    query: [query, search].filter(Boolean).join(" "),
    period,
    status,
    commercialId,
    prospectorId,
    onDate,
    commercials,
    clients,
    page,
    pageSize,
  }), [appointments, prospects, commercials, clients, query, search, period, status, commercialId, prospectorId, onDate, page, pageSize]);

  const from = table.total ? (table.page - 1) * table.pageSize + 1 : 0;
  const to = Math.min(table.total, table.page * table.pageSize);

  function patchFilter(next) {
    setPage(1);
    next();
  }

  return <section className="rdv-board">
    <p className="rdv-board-rule">Le statut se statue dans la fiche client. Ce tableau le montre, il ne le change pas.</p>
    <header className="rdv-board-filters">
      <label>Recherche
        <input
          value={search}
          onChange={event => patchFilter(() => setSearch(event.target.value))}
          placeholder="Rechercher…"
        />
      </label>
      <label>Période
        <select value={period} onChange={event => patchFilter(() => setPeriod(event.target.value))}>
          {RDV_TABLE_PERIODS.map(item => <option key={item.id || "all"} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Statut
        <select value={status} onChange={event => patchFilter(() => setStatus(event.target.value))}>
          <option value="">Tous les statuts</option>
          {AGENDA_STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>Commercial
        <select value={commercialId} onChange={event => patchFilter(() => setCommercialId(event.target.value))}>
          <option value="">Tous les commerciaux</option>
          <option value="unassigned">Non attribué</option>
          {table.commercials.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
      <label>Prospecteur
        <select value={prospectorId} onChange={event => patchFilter(() => setProspectorId(event.target.value))}>
          <option value="">Tous les prospecteurs</option>
          <option value="unassigned">Non renseigné</option>
          {(table.prospectors || []).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
      <label>Date
        <input type="date" value={onDate} onChange={event => patchFilter(() => setOnDate(event.target.value))} />
      </label>
    </header>
    <div className="rdv-board-pager">
      <div>
        {Array.from({ length: table.pages }, (_, index) => index + 1).slice(0, 12).map(number => (
          <button type="button" key={number} className={number === table.page ? "active" : ""} onClick={() => setPage(number)}>{number}</button>
        ))}
        {table.page > 1 && <button type="button" onClick={() => setPage(table.page - 1)}><ChevronLeft size={14}/></button>}
        {table.page < table.pages && <button type="button" onClick={() => setPage(table.page + 1)}><ChevronRight size={14}/></button>}
      </div>
      <label>
        <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {RDV_TABLE_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
        articles par page
      </label>
      <small>Afficher les éléments {from} - {to} de {table.total}</small>
    </div>
    <div className="data-panel rdv-board-table">
      <div className="data-row data-head">
        <span />
        <span>{"Client / Prospect"}</span>
        <span>Date</span>
        <span>Début</span>
        <span>Fin</span>
        <span>Type</span>
        <span>Statut RDV</span>
        <span>Calendrier</span>
        <span>Prospecteur</span>
        <span>Code postal</span>
        <span>Ville</span>
        <span>Tél.</span>
      </div>
      {table.rows.length === 0 && <div className="empty">Aucun rendez-vous commercial pour ces filtres.</div>}
      {table.rows.map(row => (
        <div className="data-row" key={row.id}>
          <span>
            <button type="button" className="rdv-board-edit" onClick={() => onOpen?.(row)} title="Ouvrir le rendez-vous">
              <Pencil size={14}/>
            </button>
          </span>
          <b>
            {row.clientId
              ? <button type="button" className="rdv-board-client" onClick={() => onOpenClient?.(row)}>{row.clientName || row.prospectName || "Fiche client"}</button>
              : (row.prospectName || "—")}
          </b>
          <span>{row.dateLabel}</span>
          <span>{row.startLabel}</span>
          <span>{row.endLabel}</span>
          <span>{row.partyType}</span>
          <span><span className={`status-select is-readonly ${rdvStatusTone(row.status)}`}>{row.status}</span></span>
          <span>{row.calendar}</span>
          <span>{row.prospector || "—"}</span>
          <span>{row.postalCode || "—"}</span>
          <span>{row.city || "—"}</span>
          <span>{row.phone ? <ClientPhoneLink phone={row.phone} person={{ id: row.clientId || "", address: row.address || "", postalCode: row.postalCode, city: row.city }}>{row.phone}</ClientPhoneLink> : "—"}</span>
        </div>
      ))}
    </div>
  </section>;
}
