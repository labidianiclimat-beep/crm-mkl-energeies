"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Phone, Plus } from "lucide-react";
import AddressCallNotice, { ClientPhoneLink } from "./address-call-notice";
import RecipientConnect from "./recipient-connect";
import { missingAddressParts } from "../lib/address";
import { authFetch } from "../lib/supabase-rest";
import { formatClientNumber } from "../lib/client-number";
import { SAV_CATEGORIES, SAV_CHANNELS, SAV_PRIORITIES, availableSavActions, rowForRules } from "../lib/sav";

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

const ACTION_LABELS = {
  accept: "Prendre en charge",
  schedule: "Planifier",
  start: "Démarrer",
  wait: "Mettre en attente",
  block: "Bloquer",
  report: "Compte rendu",
  submit: "Envoyer au contrôle",
  control: "Contrôler",
  inform: "Client informé",
  resolve: "Résoudre",
  close: "Clôturer",
  reopen: "Rouvrir",
  cancel: "Annuler",
  reassign: "Réassigner",
  due: "Changer l’échéance",
};

const DIRECT_ACTIONS = new Set(["accept", "start", "control", "inform", "resolve", "close"]);

function emptyDraft() {
  return { reason: "", result: "", waitFor: "", waitUntil: "", side: "client", ownerId: "", scheduledAt: "", dueAt: defaultDueLocal() };
}

function emptyForm() {
  return {
    clientId: "",
    clientQuery: "",
    clientPhone: "",
    clientAddress: "",
    clientPostal: "",
    clientCity: "",
    callerName: "",
    callerPhone: "",
    subject: "",
    description: "",
    category: "",
    priority: "normal",
    ownerId: "",
    dueAt: defaultDueLocal(),
    channel: "telephone",
  };
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

function StatusMarks({ item }) {
  return <>
    <span className={`request-status ${item.tone}`}>{item.statusLabel}</span>
    {item.unopened && <span className="request-status gray">Non ouvert</span>}
    {item.overdue && <span className="request-status overdue"><AlertTriangle size={12}/> En retard</span>}
  </>;
}

export default function SavModule({ query = "", toast, onOpenClient }) {
  const [cases, setCases] = useState([]);
  const [people, setPeople] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState("all");
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [directory, setDirectory] = useState([]);
  const [action, setAction] = useState("");
  const [draft, setDraft] = useState(emptyDraft);

  async function loadList() {
    setLoading(true);
    try {
      const data = await jsonFetch("/api/sav");
      setCases(Array.isArray(data.cases) ? data.cases : []);
      setPeople(Array.isArray(data.people) ? data.people : []);
      setMe(data.me || null);
      setError("");
      setMissing(false);
    } catch (err) {
      setError(err.message || "Impossible de charger les dossiers SAV.");
      setMissing(Boolean(err.missing));
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const data = await jsonFetch(`/api/sav/${id}`);
      setDetail(data.case || null);
      setCreating(false);
      if (data.case) {
        setCases(current => current.map(item => item.id === data.case.id ? { ...item, ...data.case } : item));
      }
    } catch (err) {
      setError(err.message || "Dossier introuvable.");
      setMissing(Boolean(err.missing));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (!creating) return undefined;
    let cancelled = false;
    authFetch("/api/clients")
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setDirectory(Array.isArray(data.clients) ? data.clients : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [creating]);

  const visible = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    return cases.filter(item => {
      if (tab === "mine" && item.ownerId !== me?.id) return false;
      if (tab === "unopened" && !item.unopened) return false;
      if (tab === "late" && !item.overdue) return false;
      if (tab === "waiting" && item.status !== "waiting_client" && item.status !== "waiting_internal") return false;
      if (tab === "review" && item.status !== "to_review") return false;
      if (tab === "closed" && item.status !== "closed" && item.status !== "cancelled") return false;
      if (!needle) return true;
      return [item.reference, item.subject, item.clientName, item.clientNumber, item.ownerName].join(" ").toLowerCase().includes(needle);
    });
  }, [cases, tab, me, query]);

  async function submitCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await jsonFetch("/api/sav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: form.clientId,
          callerName: form.callerName,
          callerPhone: form.clientPhone ? "" : form.callerPhone,
          subject: form.subject,
          description: form.description,
          category: form.category,
          priority: form.priority,
          ownerId: form.ownerId,
          dueAt: new Date(form.dueAt).toISOString(),
          channel: form.channel,
        }),
      });
      setCreating(false);
      setForm(emptyForm());
      await loadList();
      toast?.("Appel enregistré");
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
      const data = await jsonFetch(`/api/sav/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction, ...payload }),
      });
      setDetail(data.case || null);
      setAction("");
      setDraft(emptyDraft());
      if (data.case) {
        setCases(current => current.map(item => item.id === data.case.id ? { ...item, ...data.case } : item));
      }
    } catch (err) {
      setError(err.message || "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  const actions = detail ? availableSavActions(rowForRules(detail), { userId: me?.id, canManage: Boolean(me?.canSeeAll) }) : [];

  function chooseAction(next) {
    const needsResult = next === "submit" && !detail?.resultComment;
    if (DIRECT_ACTIONS.has(next) || (next === "submit" && !needsResult)) {
      runAction(next, next === "submit" ? { result: detail.resultComment } : {});
      return;
    }
    setAction(next);
    setDraft({ ...emptyDraft(), result: detail?.resultComment || "", ownerId: "" });
  }

  function submitAction(event) {
    event.preventDefault();
    const payload = { reason: draft.reason, result: draft.result, waitFor: draft.waitFor, side: draft.side, ownerId: draft.ownerId };
    if (draft.waitUntil) payload.waitUntil = draft.waitUntil;
    if (draft.scheduledAt) payload.scheduledAt = new Date(draft.scheduledAt).toISOString();
    if (draft.dueAt && action === "due") payload.dueAt = new Date(draft.dueAt).toISOString();
    runAction(action, payload);
  }

  return <div className="module-content requests-module sav-module">
    <div className="module-top">
      <div>
        <p>SAV</p>
        <h1>{detail ? detail.reference || "Dossier SAV" : "Suivi SAV"}</h1>
        <span>{detail ? detail.subject : "De l’appel jusqu’à la clôture."}</span>
      </div>
      <div className="module-actions">
        {detail && <button type="button" className="secondary" onClick={() => { setDetail(null); setError(""); }}><ArrowLeft size={15}/>Retour à la liste</button>}
        {!detail && <button type="button" className="primary" onClick={() => { setCreating(current => !current); setError(""); }}><Plus size={15}/>Nouvel appel</button>}
      </div>
    </div>

    {error && <p className="requests-error" role="alert">{error}</p>}
    {missing && <p className="requests-note">Le module s’affichera dès que le script SQL aura été collé dans Supabase.</p>}

    {!detail && creating && <form className="requests-create" onSubmit={submitCreate}>
      <div className="requests-span">
        <span className="requests-field-label">Client</span>
        <RecipientConnect clients={directory} allowCreate={false} onSelect={client => setForm(current => ({
          ...current,
          clientId: client?.id || "",
          clientQuery: client?.name || "",
          clientPhone: client?.phone || client?.mobile || "",
          clientAddress: client?.address || "",
          clientPostal: client?.postalCode || "",
          clientCity: client?.city || "",
        }))}/>
        <input type="hidden" value={form.clientId} required/>
      </div>
      {form.clientId && (
        <div className="requests-span">
          {form.clientPhone && <p className="requests-note">Téléphone déjà sur la fiche : {form.clientPhone}</p>}
          <AddressCallNotice
            parts={missingAddressParts({ address: form.clientAddress, postalCode: form.clientPostal, city: form.clientCity })}
            person={{ address: form.clientAddress, postalCode: form.clientPostal, city: form.clientCity }}
            clientId={form.clientId}
            phone={form.clientPhone}
            onSaved={values => setForm(current => ({ ...current, clientAddress: values.address, clientPostal: values.postalCode, clientCity: values.city }))}
          />
        </div>
      )}
      {!form.clientPhone && form.clientId && <label>Téléphone de l’appel<input value={form.callerPhone} onChange={event => setForm(current => ({ ...current, callerPhone: event.target.value }))} placeholder="Facultatif"/></label>}
      <label>Appelant<input value={form.callerName} onChange={event => setForm(current => ({ ...current, callerName: event.target.value }))} placeholder="Si différent du client"/></label>
      <label className="requests-span">Motif<input value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} required maxLength={180}/></label>
      <label className="requests-span">Description<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} required rows={3}/></label>
      <label>Catégorie
        <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} required>
          <option value="">Choisir</option>
          {SAV_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Urgence
        <select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value }))}>
          {SAV_PRIORITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Responsable
        <select value={form.ownerId} onChange={event => setForm(current => ({ ...current, ownerId: event.target.value }))} required>
          <option value="">Choisir</option>
          {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label>Échéance<input type="datetime-local" value={form.dueAt} onChange={event => setForm(current => ({ ...current, dueAt: event.target.value }))} required/></label>
      <label>Canal
        <select value={form.channel} onChange={event => setForm(current => ({ ...current, channel: event.target.value }))}>
          {SAV_CHANNELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="requests-span requests-form-actions">
        <button type="submit" className="primary" disabled={busy}>Enregistrer l’appel</button>
      </div>
    </form>}

    {!detail && <>
      <div className="requests-tabs">
        {[["all", "Tous"], ["mine", "Les miens"], ["unopened", "Non ouverts"], ["late", "En retard"], ["waiting", "En attente"], ["review", "À contrôler"], ["closed", "Clôturés"]].map(([id, label]) =>
          <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {loading ? <p className="requests-note">Chargement…</p> : <>
        <div className="requests-table-wrap">
          <table className="requests-table">
            <thead><tr><th>N° SAV</th><th>Client</th><th>Motif</th><th>Responsable</th><th>Échéance</th><th>Statut</th><th>Prochaine action</th><th>Dernière activité</th></tr></thead>
            <tbody>
              {visible.map(item => <tr key={item.id} onClick={() => openDetail(item.id)}>
                <td><b>{item.reference || "—"}</b></td>
                <td>{item.clientNumber ? `${item.clientNumber} · ` : ""}{item.clientName}</td>
                <td>{item.subject}</td>
                <td>{item.ownerName}</td>
                <td>{formatWhen(item.dueAt)}</td>
                <td><StatusMarks item={item}/></td>
                <td>{item.nextAction || "—"}</td>
                <td>{formatWhen(item.updatedAt)}</td>
              </tr>)}
              {!visible.length && <tr><td colSpan={8}>Aucun dossier.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sav-cards">
          {visible.map(item => <button type="button" key={item.id} className="sav-card" onClick={() => openDetail(item.id)}>
            <b>{item.reference || "SAV"} · {item.clientName}</b>
            <span>{item.subject}</span>
            <span>{item.ownerName} · {formatWhen(item.dueAt)}</span>
            <StatusMarks item={item}/>
          </button>)}
          {!visible.length && <p className="requests-note">Aucun dossier.</p>}
        </div>
      </>}
    </>}

    {detail && <div className="requests-detail">
      <div className="requests-detail-main">
        <StatusMarks item={detail}/>
        <p className="requests-description">{detail.description}</p>
        {detail.resultComment && <p className="requests-description"><b>Compte rendu. </b>{detail.resultComment}</p>}
        <div className="requests-actions">
          {actions.map(item => <button type="button" key={item} className={action === item ? "primary" : "secondary"} disabled={busy} onClick={() => chooseAction(item)}>{ACTION_LABELS[item] || item}</button>)}
        </div>
        {action && <form className="requests-action-form" onSubmit={submitAction}>
          {action === "wait" && <label>Attente
            <select value={draft.side} onChange={event => setDraft(current => ({ ...current, side: event.target.value }))}>
              <option value="client">Client</option>
              <option value="internal">Interne</option>
            </select>
          </label>}
          {(action === "wait" || action === "block" || action === "cancel" || action === "reopen" || action === "reassign" || action === "due") && <label>Motif<textarea value={draft.reason} onChange={event => setDraft(current => ({ ...current, reason: event.target.value }))} required rows={3}/></label>}
          {action === "wait" && <label>Qui ou quoi est attendu<input value={draft.waitFor} onChange={event => setDraft(current => ({ ...current, waitFor: event.target.value }))} required/></label>}
          {action === "wait" && <label>Relance<input type="date" value={draft.waitUntil} onChange={event => setDraft(current => ({ ...current, waitUntil: event.target.value }))} required/></label>}
          {(action === "report" || action === "submit") && <label>Compte rendu<textarea value={draft.result} onChange={event => setDraft(current => ({ ...current, result: event.target.value }))} required rows={4}/></label>}
          {action === "schedule" && <label>Date d’intervention<input type="datetime-local" value={draft.scheduledAt} onChange={event => setDraft(current => ({ ...current, scheduledAt: event.target.value }))} required/></label>}
          {action === "due" && <label>Nouvelle échéance<input type="datetime-local" value={draft.dueAt} onChange={event => setDraft(current => ({ ...current, dueAt: event.target.value }))} required/></label>}
          {action === "reassign" && <label>Nouveau responsable
            <select value={draft.ownerId} onChange={event => setDraft(current => ({ ...current, ownerId: event.target.value }))} required>
              <option value="">Choisir</option>
              {people.filter(person => person.id !== detail.ownerId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>}
          <div className="requests-form-actions"><button type="submit" className="primary" disabled={busy}>Valider</button></div>
        </form>}
        <dl className="requests-facts">
          <div><dt>Client</dt><dd>{detail.clientId ? <button type="button" onClick={() => onOpenClient?.(detail.clientId)}>{detail.clientNumber ? `${detail.clientNumber} · ` : ""}{detail.clientName}</button> : detail.clientName}</dd></div>
          <div><dt>Catégorie</dt><dd>{detail.categoryLabel}</dd></div>
          <div><dt>Urgence</dt><dd>{detail.priorityLabel}</dd></div>
          <div><dt>Canal</dt><dd><Phone size={13}/> {detail.channelLabel}</dd></div>
          {detail.callerName && <div><dt>Appelant</dt><dd>{detail.callerName}</dd></div>}
          {(detail.callerPhone || detail.clientPhone) && <div><dt>Téléphone</dt><dd><ClientPhoneLink phone={detail.callerPhone || detail.clientPhone} person={{ id: detail.clientId, address: detail.clientAddress, postalCode: detail.clientPostal, city: detail.clientCity }} onComplete={() => onOpenClient?.(detail.clientId)}>{detail.callerPhone || detail.clientPhone}</ClientPhoneLink></dd></div>}
        </dl>
      </div>
      <aside>
        <h2>Suivi</h2>
        <dl className="requests-facts">
          <div><dt>Responsable</dt><dd>{detail.ownerName}</dd></div>
          <div><dt>Échéance</dt><dd>{formatWhen(detail.dueAt)}</dd></div>
          <div><dt>Prochaine action</dt><dd>{detail.nextAction || "—"}</dd></div>
          <div><dt>Première ouverture</dt><dd>{detail.openedAt ? `${formatWhen(detail.openedAt)}${detail.openedByName ? ` · ${detail.openedByName}` : ""}` : "Pas encore ouvert"}</dd></div>
          <div><dt>Contrôle</dt><dd>{detail.reviewedAt ? formatWhen(detail.reviewedAt) : "Pas encore fait"}</dd></div>
          <div><dt>Client informé</dt><dd>{detail.clientInformedAt ? formatWhen(detail.clientInformedAt) : "Non"}</dd></div>
        </dl>
        <h2>Journal</h2>
        <ol>
          {(detail.events || []).map(item => <li key={item.id}><span>{item.label}</span>{item.reason && <p>{item.reason}</p>}<small>{item.authorName} · {formatWhen(item.createdAt)}</small></li>)}
        </ol>
      </aside>
    </div>}
    {busy && !detail && <p className="requests-note">Enregistrement…</p>}
  </div>;
}
