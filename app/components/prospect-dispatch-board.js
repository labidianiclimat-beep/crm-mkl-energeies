"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays, Eye, MapPin, Pencil, Phone, Plus, Trash2, UserRound, X,
} from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import {
  desiredStartOf,
  dispatchOutcome,
  isAssignedProspect,
  isUnassignedProspect,
  matchesDirectoryFilters,
  peopleOptions,
  prospectMoment,
  REASSIGN_REASONS,
} from "../lib/prospect-dispatch";
import { normalizeRoleLabel } from "../lib/roles";
import { isConvertedProspect } from "../lib/prospect-to-client";
import { formatProspectNumber } from "../lib/prospect-number";
import { ClientPhoneLink } from "./address-call-notice";
import CopyNumber from "./copy-number";
import { parisDateTimeParts } from "../lib/agenda";
import { matchesPersonListQuery } from "../lib/directory-search";
import { DirectoryListSearch } from "./directory-search";

function formatWhen(value) {
  if (!value) return "Date à préciser";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function datePart(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timePart(value) {
  return parisDateTimeParts(value)?.time || "09:00";
}

function ModuleTop({ title, sub, children }) {
  return <div className="module-content"><div className="module-top"><div><p>RÉPARTITION</p><h1>{title}</h1><span>{sub}</span></div><div className="module-actions">{children}</div></div></div>;
}

export default function ProspectDispatchBoard({
  prospects = [],
  appointments = [],
  query = "",
  canDelete = false,
  consultOnly = false,
  canReviseRow,
  onAdd,
  onEdit,
  onAssign,
  onDelete,
  onOpenAgenda,
  toast,
}) {
  const [tab, setTab] = useState("queue");
  const [assigning, setAssigning] = useState(null);
  const [ranked, setRanked] = useState([]);
  const [loadingRank, setLoadingRank] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedCommercial, setSelectedCommercial] = useState("");
  const [reason, setReason] = useState("");
  const [commercialFilter, setCommercialFilter] = useState("");
  const [prospectorFilter, setProspectorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [textQuery, setTextQuery] = useState("");
  const appointmentByProspect = useMemo(
    () => Object.fromEntries((appointments || []).filter(item => item.prospectId && item.kind !== "busy").map(item => [item.prospectId, item])),
    [appointments]
  );

  const searched = (prospects || []).filter(item => matchesPersonListQuery(item, query) && matchesPersonListQuery(item, textQuery));
  const commercialChoices = peopleOptions(searched, "commercialId", "owner");
  const prospectorChoices = peopleOptions(searched, "prospectorId", "prospector");
  const filtered = searched.filter(item => matchesDirectoryFilters(
    item,
    { commercialId: commercialFilter, prospectorId: prospectorFilter, date: dateFilter },
    prospectMoment(item, appointmentByProspect[item.id])
  ));
  const queue = filtered.filter(isUnassignedProspect);
  const assigned = filtered.filter(item => isAssignedProspect(item) && !isConvertedProspect(item));
  const converted = filtered.filter(isConvertedProspect);
  const rows = tab === "assigned" ? assigned : tab === "converted" ? converted : queue;
  const managers = ranked.filter(item => normalizeRoleLabel(item.role) === "Responsable commercial");
  const teamCommercials = ranked.filter(item => normalizeRoleLabel(item.role) !== "Responsable commercial");

  function commercialOption(item) {
    const role = normalizeRoleLabel(item.role);
    const prefix = item.rank ? `${item.rank} — ` : "";
    return `${prefix}${item.name} · ${role} · ${item.distance} · ${item.weekCount} RDV / sem.`;
  }

  async function openAssign(prospect) {
    setAssigning(prospect);
    setSelectedCommercial("");
    setReason("");
    setRanked([]);
    setHistory([]);
    setLoadingRank(true);
    try {
      const desiredAt = desiredStartOf(prospect);
      const [boardRes, historyRes] = await Promise.all([
        authFetch(`/api/prospects/dispatch-board?prospectId=${encodeURIComponent(prospect.id)}&desiredAt=${encodeURIComponent(desiredAt)}&duration=${encodeURIComponent(prospect.desiredDuration || 60)}`),
        authFetch(`/api/prospects/${prospect.id}/history`),
      ]);
      const board = await boardRes.json().catch(() => ({}));
      const hist = await historyRes.json().catch(() => ({}));
      if (!boardRes.ok) throw new Error(board.error || "Recommandations indisponibles");
      const commercials = board.commercials || [];
      setRanked(commercials);
      setSelectedCommercial(commercials[0]?.id || "");
      setHistory(hist.history || []);
    } catch (error) {
      toast?.(String(error?.message || "Impossible de charger les commerciaux"));
    } finally {
      setLoadingRank(false);
    }
  }

  async function submitAssign(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await onAssign?.(assigning, {
        commercialId: data.commercialId,
        appointmentDate: data.appointmentDate,
        appointmentStart: data.appointmentStart,
        duration: data.duration,
        kind: data.actionKind || assigning.desiredKind || "rendez-vous",
        notes: data.notes,
        reason: data.reason,
        notifyEmail: data.notifyEmail !== undefined,
      });
      if (result?.appointment) {
        toast?.(result.reassigned ? "Prospect réattribué" : "Prospect attribué");
      }
      setAssigning(null);
    } catch (error) {
      toast?.(String(error?.message || "Attribution impossible"));
    }
  }

  return <>
    <ModuleTop title="Prospects" sub={`${queue.length} à dispatcher · ${assigned.length} attribués`}>
      <div className="dispatch-toolbar">
        <button className="primary" onClick={onAdd}><Plus size={17}/>Créer un prospect</button>
        <div className="dispatch-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "queue"} className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>À dispatcher ({queue.length})</button>
          <button type="button" role="tab" aria-selected={tab === "assigned"} className={tab === "assigned" ? "active" : ""} onClick={() => setTab("assigned")}>Attribués ({assigned.length})</button>
          <button type="button" role="tab" aria-selected={tab === "converted"} className={tab === "converted" ? "active" : ""} onClick={() => setTab("converted")}>Transformés ({converted.length})</button>
        </div>
      </div>
      <div className="directory-filters">
        <DirectoryListSearch value={textQuery} onChange={setTextQuery} />
        <label>Commercial
          <select value={commercialFilter} onChange={event => setCommercialFilter(event.target.value)}>
            <option value="">Tous</option>
            <option value="unassigned">Non affecté</option>
            {commercialChoices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Prospecteur
          <select value={prospectorFilter} onChange={event => setProspectorFilter(event.target.value)}>
            <option value="">Tous</option>
            <option value="unassigned">Non renseigné</option>
            {prospectorChoices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Date
          <input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} />
        </label>
      </div>
      <div className="data-panel secure-list prospect-table dispatch-table" onContextMenu={e => e.preventDefault()}>
        <div className="data-row data-head">
          <span>N° prospect</span>
          <span>PROSPECT</span>
          <span>CONTACT / ADRESSE</span>
          <span>PROJET</span>
          <span>DATE SOUHAITÉE</span>
          <span>PROSPECTEUR</span>
          <span>COMMERCIAL</span>
          <span>ACTIONS</span>
        </div>
        {rows.length === 0 && <div className="empty dispatch-empty">Aucun prospect dans cette liste.</div>}
        {rows.map((prospect, index) => {
          const planned = appointmentByProspect[prospect.id];
          const outcome = dispatchOutcome(prospect, planned);
          return <div className="data-row" key={prospect.id || `${prospect.name}-${index}`}>
            <span className="client-number-cell"><CopyNumber value={formatProspectNumber(prospect.prospectNumber)} /></span>
            <span><b>{prospect.name}</b></span>
            <span>
              {(prospect.phone || prospect.landline)
                ? <ClientPhoneLink phone={prospect.phone || prospect.landline} person={{ ...prospect, id: prospect.clientId || "" }} onComplete={() => onEdit?.(prospect)}><b>{[prospect.phone, prospect.landline].filter(Boolean).join(" · ")}</b></ClientPhoneLink>
                : <b>Téléphone à compléter</b>}
              <small>{[prospect.address, prospect.postalCode, prospect.city].filter(Boolean).join(" ") || prospect.city}</small>
            </span>
            <span><b>{prospect.type}</b><small>{[prospect.source, outcome].filter(Boolean).join(" · ")}</small></span>
            <span>{formatWhen(desiredStartOf(prospect) || planned?.start)}</span>
            <span>{prospect.prospector || prospect.creator || "Non renseigné"}</span>
            <span>{prospect.owner || "Non affecté"}</span>
            <div className="prospect-actions">
              <button className="edit-user" onClick={() => onEdit(prospect)} title={(canReviseRow ? !canReviseRow(prospect) : consultOnly) ? "Consulter la fiche" : "Modifier la fiche"}>{(canReviseRow ? !canReviseRow(prospect) : consultOnly) ? <Eye size={15}/> : <Pencil size={15}/>}</button>
              {tab !== "converted" && (planned || desiredStartOf(prospect)) && <button type="button" className="agenda-add" onClick={() => onOpenAgenda?.(prospect, planned || { start: desiredStartOf(prospect) })}>
                <CalendarDays size={15}/>Agenda
              </button>}
              {tab !== "converted" && <button className="agenda-add" onClick={() => openAssign(prospect)}>
                <UserRound size={15}/>{isAssignedProspect(prospect) ? "Réattribuer" : "Attribuer"}
              </button>}
              {canDelete && <button type="button" className="trash" onClick={() => onDelete?.(prospect)} title="Supprimer le prospect"><Trash2 size={15}/></button>}
            </div>
          </div>;
        })}
      </div>
    </ModuleTop>
    {assigning && <div className="backdrop"><div className="modal dispatch-assign-modal">
      <button className="modal-close" type="button" onClick={() => setAssigning(null)}><X/></button>
      <div className="modal-icon"><CalendarDays/></div>
      <h2>{isAssignedProspect(assigning) ? "Réattribuer le prospect" : "Attribuer le prospect"}</h2>
      <p>{assigning.name} — {[assigning.address, assigning.postalCode, assigning.city].filter(Boolean).join(" ")}</p>
      <p className="dispatch-contact"><Phone size={14}/>{(assigning.phone || assigning.landline) ? <ClientPhoneLink phone={assigning.phone || assigning.landline} person={{ ...assigning, id: assigning.clientId || "" }} onComplete={() => onEdit?.(assigning)}>{[assigning.phone, assigning.landline].filter(Boolean).join(" · ")}</ClientPhoneLink> : "Téléphone à compléter"} · <MapPin size={14}/>{assigning.city}</p>
      <form onSubmit={submitAssign}>
        <div className="modal-form-body">
          <div className="form-row">
            <label>Date<input name="appointmentDate" type="date" required defaultValue={datePart(desiredStartOf(assigning))}/></label>
            <label>Heure<input name="appointmentStart" type="time" required defaultValue={timePart(desiredStartOf(assigning))}/></label>
          </div>
          <div className="form-row">
            <label>Durée
              <select name="duration" defaultValue={String(assigning.desiredDuration || 60)}>
                <option value="30">30 minutes</option>
                <option value="60">1 heure</option>
                <option value="90">1 h 30</option>
                <option value="120">2 heures</option>
              </select>
            </label>
            <label>Action
              <select name="actionKind" defaultValue={assigning.desiredKind || "rendez-vous"}>
                <option value="rendez-vous">Rendez-vous</option>
                <option value="rappel">Fiche contact</option>
              </select>
            </label>
          </div>
          <label>Commercial
            <select name="commercialId" required value={selectedCommercial} onChange={e => setSelectedCommercial(e.target.value)}>
              {loadingRank && <option value="">Chargement…</option>}
              {!loadingRank && ranked.length === 0 && <option value="">Aucun commercial disponible</option>}
              {managers.length > 0 && <optgroup label="Responsable commercial">
                {managers.map(item => (
                  <option key={item.id} value={item.id}>{commercialOption(item)}</option>
                ))}
              </optgroup>}
              {teamCommercials.length > 0 && <optgroup label="Commerciaux">
                {teamCommercials.map(item => (
                  <option key={item.id} value={item.id}>{commercialOption(item)}</option>
                ))}
              </optgroup>}
            </select>
          </label>
          {ranked[0]?.recommendation && <p className="dispatch-reco">{ranked.find(item => item.id === selectedCommercial)?.recommendation || ranked[0].recommendation}</p>}
          {isAssignedProspect(assigning) && (
            <label>Motif de réattribution
              <select name="reason" required value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Choisir un motif</option>
                {REASSIGN_REASONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}
          <label>Consignes pour le commercial<textarea name="notes" rows="2" defaultValue={assigning.notes}/></label>
          <label className="dispatch-notify"><input type="checkbox" name="notifyEmail" defaultChecked/>Prévenir le commercial par e-mail</label>
          {history.length > 0 && <div className="dispatch-history"><b>Historique</b>{history.slice(0, 3).map(item => (
            <span key={item.id}>{formatWhen(item.created_at)} — {item.actor_name || "Système"} {item.reason ? `· ${item.reason}` : ""}</span>
          ))}</div>}
        </div>
        <div className="modal-form-actions">
          <button className="primary submit" type="submit"><UserRound size={17}/>{isAssignedProspect(assigning) ? "Réattribuer" : "Attribuer et planifier"}</button>
        </div>
      </form>
    </div></div>}
  </>;
}
