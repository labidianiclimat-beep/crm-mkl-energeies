"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import { formatClientNumber } from "../lib/client-number";
import RecipientConnect from "./recipient-connect";
import { availableRequestActions, isArchivedRequest, requestConcernsUser, requestStatusesForList, rowForRules, TICKET_SUBJECTS, TICKET_SUBJECT_OTHER } from "../lib/internal-requests";

const ACTION_LABELS = {
  accept: "Prendre en charge",
  start: "Démarrer",
  wait: "Mettre en attente",
  block: "Bloquer",
  complete: "Marquer traité",
  respond: "Envoyer la réponse",
  close: "Valider et clôturer",
  reopen: "Rouvrir",
  cancel: "Annuler",
  reassign: "Réassigner",
  due: "Changer l’échéance",
};

const DIRECT_ACTIONS = new Set(["accept", "start", "respond", "close"]);

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultDueLocal() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyDraft() {
  return { reason: "", result: "", waitFor: "", waitUntil: "", assigneeIds: [], dueAt: defaultDueLocal() };
}

function emptyForm() {
  return { subject: "", otherTitle: "", description: "", assigneeIds: [], dueAt: defaultDueLocal(), priority: "normal", clientId: "", clientQuery: "" };
}

function togglePerson(list, id) {
  return list.includes(id) ? list.filter(item => item !== id) : [...list, id];
}

function personChoices(people = [], requests = []) {
  const map = new Map();
  for (const person of people) {
    if (person?.id) map.set(String(person.id), person.name || "Sans nom");
  }
  for (const item of requests) {
    if (item?.requesterId && !map.has(String(item.requesterId))) {
      map.set(String(item.requesterId), item.requesterName || "Sans nom");
    }
    const ids = item?.assigneeIds?.length ? item.assigneeIds : [item?.assigneeId];
    const names = String(item?.assigneeName || "").split(",").map(part => part.trim()).filter(Boolean);
    ids.forEach((id, index) => {
      if (!id || map.has(String(id))) return;
      map.set(String(id), names[index] || item.assigneeName || "Sans nom");
    });
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function RecipientChecks({ people, selected, onChange }) {
  return <div className="requests-people">
    {people.map(person => <label key={person.id}>
      <input type="checkbox" checked={selected.includes(person.id)} onChange={() => onChange(togglePerson(selected, person.id))}/>
      <span>{person.name}</span>
    </label>)}
    {!people.length && <span>Aucun destinataire disponible.</span>}
  </div>;
}

async function jsonFetch(url, options) {
  const response = await authFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Action impossible.");
    error.missing = Boolean(data.missing);
    throw error;
  }
  return data;
}

export default function InternalRequestsModule({ query = "", toast, focusId = "", onFocusConsumed, onOpenClient }) {
  const [requests, setRequests] = useState([]);
  const [people, setPeople] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState("inbox");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [clients, setClients] = useState([]);
  const [action, setAction] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");

  async function loadList() {
    setLoading(true);
    try {
      const data = await jsonFetch("/api/internal-requests");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setPeople(Array.isArray(data.people) ? data.people : []);
      setMe(data.me || null);
      setError("");
      setMissing(false);
    } catch (err) {
      setError(err.message || "Impossible de charger les tickets.");
      setMissing(Boolean(err.missing));
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id) {
    if (!id) return;
    setBusy(true);
    setError("");
    setAction("");
    try {
      const data = await jsonFetch(`/api/internal-requests/${id}`);
      setDetail(data.request || null);
      setCreating(false);
      if (data.request) {
        setRequests(current => current.map(item => item.id === data.request.id ? { ...item, ...data.request } : item));
      }
    } catch (err) {
      setError(err.message || "Ticket introuvable.");
      setMissing(Boolean(err.missing));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (!focusId) return;
    openDetail(focusId);
    onFocusConsumed?.();
  }, [focusId]);

  useEffect(() => {
    if (!creating) return;
    authFetch("/api/clients")
      .then(response => response.ok ? response.json() : { clients: [] })
      .then(data => setClients(Array.isArray(data.clients) ? data.clients : []))
      .catch(() => setClients([]));
  }, [creating]);

  const visible = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    return requests.filter(item => {
      if (!requestConcernsUser(item, me?.id)) return false;
      const recipients = item.assigneeIds?.length ? item.assigneeIds : [item.assigneeId];
      const archived = isArchivedRequest(item.status);
      if (tab === "archive") {
        if (!archived) return false;
      } else if (archived) {
        return false;
      }
      if (tab === "inbox" && !recipients.includes(me?.id)) return false;
      if (tab === "mine" && item.requesterId !== me?.id) return false;
      if (assigneeFilter && !recipients.map(id => String(id)).includes(assigneeFilter)) return false;
      if (requesterFilter && String(item.requesterId || "") !== requesterFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [item.reference, item.title, item.assigneeName, item.requesterName].join(" ").toLowerCase().includes(needle);
    });
  }, [requests, tab, me, query, assigneeFilter, requesterFilter, statusFilter]);

  const choices = useMemo(() => personChoices([], requests.filter(item => requestConcernsUser(item, me?.id))), [requests, me]);

  function chooseTab(next) {
    setTab(next);
    setStatusFilter("");
  }

  async function submitCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await jsonFetch("/api/internal-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject,
          otherTitle: form.otherTitle,
          description: form.description,
          assigneeIds: form.assigneeIds,
          dueAt: new Date(form.dueAt).toISOString(),
          priority: form.priority,
          clientId: form.clientId || null,
        }),
      });
      setCreating(false);
      setForm(emptyForm());
      await loadList();
      if (data.request?.id) setDetail(data.request);
      toast?.("Ticket envoyé");
    } catch (err) {
      setError(err.message || "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(nextAction, payload = {}) {
    if (!detail?.id) return;
    setBusy(true);
    setError("");
    try {
      const data = await jsonFetch(`/api/internal-requests/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction, ...payload }),
      });
      setDetail(data.request || null);
      setAction("");
      setDraft(emptyDraft());
      setMessage("");
      if (data.request) {
        setRequests(current => current.map(item => item.id === data.request.id ? { ...item, ...data.request } : item));
      }
    } catch (err) {
      setError(err.message || "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  const actions = detail ? availableRequestActions(rowForRules(detail), { userId: me?.id, canManage: Boolean(me?.canSeeAll), canParticipate: true }) : [];

  function chooseAction(next) {
    if (DIRECT_ACTIONS.has(next)) {
      runAction(next);
      return;
    }
    setAction(next);
    setDraft({ ...emptyDraft(), assigneeIds: next === "reassign" ? (detail?.assigneeIds || []) : [] });
  }

  return <div className="module-content requests-module">
    <div className="module-top">
      <div>
        <p>TICKETS INTERNES</p>
        <h1>{detail ? detail.reference || "Ticket" : "Tickets internes"}</h1>
        <span>{detail ? detail.title : "Créer, assigner, suivre et clôturer un ticket."}</span>
      </div>
      <div className="module-actions">
        {detail && <button type="button" className="secondary" onClick={() => { setDetail(null); setError(""); }}><ArrowLeft size={15}/>Retour à la liste</button>}
        {!detail && <button type="button" className="primary" onClick={() => { setCreating(current => !current); setError(""); }}><Plus size={15}/>Nouveau ticket</button>}
      </div>
    </div>

    {error && <p className="requests-error" role="alert">{error}</p>}
    {missing && <p className="requests-note">Le module s’affichera dès que le script SQL aura été collé dans Supabase.</p>}

    {!detail && creating && <form className="requests-create" onSubmit={submitCreate}>
      <label>Objet
        <select value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value, otherTitle: event.target.value === TICKET_SUBJECT_OTHER ? current.otherTitle : "" }))} required>
          <option value="">Choisir</option>
          {TICKET_SUBJECTS.map(subject => <option key={subject} value={subject}>{subject}</option>)}
          <option value={TICKET_SUBJECT_OTHER}>Autre</option>
        </select>
      </label>
      {form.subject === TICKET_SUBJECT_OTHER && <label className="requests-span">Précisez l’objet<input value={form.otherTitle} onChange={event => setForm(current => ({ ...current, otherTitle: event.target.value }))} required maxLength={180}/></label>}
      <label className="requests-span">Description<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} required rows={4}/></label>
      <div className="requests-span">
        <span className="requests-field-label">Destinataires</span>
        <RecipientChecks people={people} selected={form.assigneeIds} onChange={assigneeIds => setForm(current => ({ ...current, assigneeIds }))}/>
      </div>
      <label>Échéance<input type="datetime-local" value={form.dueAt} onChange={event => setForm(current => ({ ...current, dueAt: event.target.value }))} required/></label>
      <label>Priorité
        <select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value }))}>
          <option value="normal">Normale</option>
          <option value="urgent">Urgente</option>
        </select>
      </label>
      <div className="requests-span">
        <span className="requests-field-label">Client lié, facultatif</span>
        <RecipientConnect clients={clients} allowCreate={false} onSelect={item => setForm(current => ({ ...current, clientId: item?.id || "", clientQuery: item?.name || "" }))}/>
      </div>
      <div className="requests-span requests-form-actions">
        <button type="submit" className="primary" disabled={busy}>Envoyer</button>
      </div>
    </form>}

    {!detail && <>
      <div className="requests-tabs">
        <button type="button" className={tab === "inbox" ? "active" : ""} onClick={() => chooseTab("inbox")}>À traiter</button>
        <button type="button" className={tab === "mine" ? "active" : ""} onClick={() => chooseTab("mine")}>Mes tickets</button>
        <button type="button" className={tab === "archive" ? "active" : ""} onClick={() => chooseTab("archive")}>Archives</button>
      </div>
      <div className="requests-filters">
        <label>Destinataire
          <select aria-label="Filtrer par destinataire" value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)}>
            <option value="">Tous</option>
            {choices.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label>Demandeur
          <select aria-label="Filtrer par demandeur" value={requesterFilter} onChange={event => setRequesterFilter(event.target.value)}>
            <option value="">Tous</option>
            {choices.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label>Statut
          <select aria-label="Filtrer par statut" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="">Tous</option>
            {requestStatusesForList(tab === "archive").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {loading && <p className="requests-note">Chargement des tickets…</p>}
      {!loading && !missing && visible.length === 0 && <p className="requests-note">{tab === "inbox" ? "Aucun ticket à traiter." : tab === "archive" ? "Aucune archive pour le moment." : "Aucun ticket pour le moment."}</p>}
      {visible.length > 0 && <div className="requests-table-wrap"><table className="requests-table">
        <thead><tr><th>N°</th><th>Objet</th><th>Statut</th><th>Destinataires</th><th>Demandeur</th><th>Échéance</th></tr></thead>
        <tbody>
          {visible.map(item => <tr key={item.id} onClick={() => openDetail(item.id)}>
            <td>{item.reference || "—"}</td>
            <td><b>{item.title}</b>{item.priority === "urgent" && <em>Urgent</em>}</td>
            <td><span className={`request-status ${item.tone}`}>{item.statusLabel}</span>{item.overdue && <span className="request-status overdue">En retard</span>}</td>
            <td>{item.assigneeName}</td>
            <td>{item.requesterName}</td>
            <td>{formatWhen(item.dueAt)}</td>
          </tr>)}
        </tbody>
      </table></div>}
    </>}

    {detail && <div className="requests-detail">
      <div className="requests-detail-main">
        <div className="requests-status-row">
          <span className={`request-status ${detail.tone}`}>{detail.statusLabel}</span>
          {detail.overdue && <span className="request-status overdue">En retard</span>}
          {detail.priority === "urgent" && <span className="request-status urgent">Urgent</span>}
        </div>
        <p className="requests-description">{detail.description}</p>
        <dl className="requests-facts">
          <div><dt>Demandeur</dt><dd>{detail.requesterName}</dd></div>
          <div><dt>Destinataires</dt><dd>{detail.assigneeName}</dd></div>
          <div><dt>Échéance</dt><dd>{formatWhen(detail.dueAt)}</dd></div>
          {detail.client && <div><dt>Client</dt><dd><button type="button" onClick={() => onOpenClient?.(detail.client.id)}>{detail.client.number ? `${formatClientNumber(detail.client.number)} · ` : ""}{detail.client.name}</button></dd></div>}
          {detail.waitReason && <div><dt>Attente</dt><dd>{detail.waitReason} · {detail.waitFor}{detail.waitUntil ? ` · relance ${detail.waitUntil}` : ""}</dd></div>}
          {detail.blockReason && <div><dt>Blocage</dt><dd>{detail.blockReason}</dd></div>}
          {detail.resultComment && <div><dt>Résultat</dt><dd>{detail.resultComment}</dd></div>}
          {detail.cancelReason && <div><dt>Annulation</dt><dd>{detail.cancelReason}</dd></div>}
        </dl>
        <div className="requests-actions">
          {actions.filter(item => item !== "comment").map(item => <button key={item} type="button" className={item === "cancel" ? "secondary" : "primary"} disabled={busy} onClick={() => chooseAction(item)}>{ACTION_LABELS[item]}</button>)}
        </div>
        {action && <form className="requests-action-form" onSubmit={event => {
          event.preventDefault();
          const payload = { reason: draft.reason, result: draft.result, waitFor: draft.waitFor, waitUntil: draft.waitUntil, assigneeIds: draft.assigneeIds, dueAt: action === "due" ? new Date(draft.dueAt).toISOString() : undefined };
          runAction(action, payload);
        }}>
          {(action === "wait" || action === "block" || action === "cancel" || action === "reopen" || action === "reassign" || action === "due") && <label>Motif<textarea value={draft.reason} onChange={event => setDraft(current => ({ ...current, reason: event.target.value }))} required rows={3}/></label>}
          {action === "wait" && <label>En attente de<input value={draft.waitFor} onChange={event => setDraft(current => ({ ...current, waitFor: event.target.value }))} required/></label>}
          {action === "wait" && <label>Relance<input type="date" value={draft.waitUntil} onChange={event => setDraft(current => ({ ...current, waitUntil: event.target.value }))} required/></label>}
          {action === "complete" && <label>Résultat<textarea value={draft.result} onChange={event => setDraft(current => ({ ...current, result: event.target.value }))} required rows={3}/></label>}
          {action === "reassign" && <div>
            <span className="requests-field-label">Destinataires</span>
            <RecipientChecks people={people} selected={draft.assigneeIds} onChange={assigneeIds => setDraft(current => ({ ...current, assigneeIds }))}/>
          </div>}
          {action === "due" && <label>Nouvelle échéance<input type="datetime-local" value={draft.dueAt} onChange={event => setDraft(current => ({ ...current, dueAt: event.target.value }))} required/></label>}
          <button type="submit" className="primary" disabled={busy}>Confirmer</button>
        </form>}
        {actions.includes("comment") && <form className="requests-thread" onSubmit={event => { event.preventDefault(); runAction("comment", { body: message }); }}>
          <h2>Fil interne</h2>
          {!detail.messages?.length && <p>Aucun message pour le moment.</p>}
          <ul>
            {(detail.messages || []).map(item => <li key={item.id} className={item.mine ? "mine" : ""}><b>{item.authorName}</b><span>{item.body}</span><small>{formatWhen(item.createdAt)}</small></li>)}
          </ul>
          <label>Message<textarea value={message} onChange={event => setMessage(event.target.value)} rows={3} required/></label>
          <button type="submit" className="secondary" disabled={busy}>Envoyer le message</button>
        </form>}
      </div>
      <aside>
        <h2>Historique</h2>
        <ol>
          {(detail.events || []).filter(item => item.kind !== "commented").map(item => <li key={item.id}>
            <b>{item.label}</b>
            <span>{item.authorName} · {formatWhen(item.createdAt)}</span>
            {item.reason && <p>{item.reason}</p>}
          </li>)}
        </ol>
      </aside>
    </div>}
  </div>;
}
