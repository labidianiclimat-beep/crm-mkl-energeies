"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Link2, RefreshCw, Trash2 } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";

/**
 * Suivi des demandes du site qui n'ont pas abouti.
 *
 * Une demande acceptée par le site est une personne qui attend un rappel.
 * L'écran existe pour qu'aucune ne se perde : les demandes en échec et celles
 * en vérification de doublon y restent visibles jusqu'à décision.
 *
 * Les coordonnées affichées sont volontairement masquées par le serveur.
 * Reconnaître une personne au téléphone suffit ; constituer une liste depuis
 * cet écran ne doit pas être possible.
 */

const KIND_LABELS = {
  lead: "Demande d’étude",
  appointment: "Rendez-vous",
};

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

export default function WebLeadBacklog() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ failed: 0, review: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("bloquees");
  const [history, setHistory] = useState({ id: "", events: [], loading: false });
  const [linking, setLinking] = useState({ id: "", opportunityId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/web-leads/backlog?inclureTraitees=1");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Suivi indisponible.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setCounts(data.counts || { failed: 0, review: 0, pending: 0 });
    } catch (err) {
      setError(err.message || "Suivi indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (tab === "toutes") return rows;
    if (tab === "doublons") return rows.filter(row => row.status === "review");
    if (tab === "echecs") return rows.filter(row => row.status === "failed");
    return rows.filter(row => row.status === "failed" || row.status === "review");
  }, [rows, tab]);

  async function act(row, action, extra = {}) {
    setBusy(`${row.id}:${action}`);
    setError("");
    try {
      const response = await authFetch("/api/web-leads/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Action refusée.");
      setLinking({ id: "", opportunityId: "" });
      await load();
    } catch (err) {
      setError(err.message || "Action refusée.");
    } finally {
      setBusy("");
    }
  }

  async function openHistory(row) {
    if (history.id === row.id) {
      setHistory({ id: "", events: [], loading: false });
      return;
    }
    setHistory({ id: row.id, events: [], loading: true });
    try {
      const response = await authFetch(`/api/web-leads/backlog/${row.id}/history`);
      const data = await response.json().catch(() => ({}));
      setHistory({ id: row.id, events: Array.isArray(data.events) ? data.events : [], loading: false });
    } catch {
      setHistory({ id: row.id, events: [], loading: false });
    }
  }

  return <div className="module-content weblead-backlog">
    <div className="module-top">
      <div>
        <h2>Demandes du site</h2>
        <p className="weblead-sub">
          {counts.failed} en échec, {counts.review} à vérifier, {counts.pending} en cours de traitement.
        </p>
      </div>
      <div className="module-actions">
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={15}/>Actualiser
        </button>
      </div>
    </div>

    {error && <p className="weblead-error" role="alert">{error}</p>}

    <div className="weblead-tabs">
      <button type="button" className={tab === "bloquees" ? "active" : ""} onClick={() => setTab("bloquees")}>À traiter</button>
      <button type="button" className={tab === "echecs" ? "active" : ""} onClick={() => setTab("echecs")}>En échec</button>
      <button type="button" className={tab === "doublons" ? "active" : ""} onClick={() => setTab("doublons")}>Doublons à vérifier</button>
      <button type="button" className={tab === "toutes" ? "active" : ""} onClick={() => setTab("toutes")}>Toutes</button>
    </div>

    {loading && <p className="weblead-note">Chargement des demandes…</p>}
    {!loading && visible.length === 0 && <p className="weblead-note">Aucune demande à traiter.</p>}

    {visible.map(row => <article key={row.id} className={`weblead-card weblead-card--${row.status}`}>
      <header className="weblead-card-top">
        <div>
          <span className="weblead-status">{row.statusLabel}</span>
          <span className="weblead-kind">{KIND_LABELS[row.kind] || row.kind}</span>
          <span className="weblead-when">Reçue le {formatWhen(row.receivedAt)}</span>
        </div>
        <span className="weblead-attempts">{row.attempts} tentative{row.attempts > 1 ? "s" : ""}</span>
      </header>

      {row.hint && <p className="weblead-hint">
        {row.hint.phone && <span>Téléphone {row.hint.phone}</span>}
        {row.hint.email && <span>E-mail {row.hint.email}</span>}
        {row.hint.postalCode && <span>Code postal {row.hint.postalCode}</span>}
        {row.hint.projects.length > 0 && <span>Projet {row.hint.projects.join(", ")}</span>}
      </p>}

      {row.payloadPurged && <p className="weblead-purged">
        <AlertTriangle size={15}/>
        Le contenu de cette demande a été effacé. Elle ne peut plus être relancée automatiquement.
      </p>}

      {row.errorCode && <p className="weblead-reason">
        <strong>Motif technique</strong>
        <code>{row.errorCode}</code>
        {row.errorLabel && <span>{row.errorLabel}</span>}
      </p>}

      {row.prospectCreated && <p className="weblead-note">
        La fiche prospect existe déjà. Une relance reprendra les étapes manquantes sans en créer une seconde.
      </p>}

      {row.status === "review" && <div className="weblead-candidates">
        <span className="weblead-field-label">
          {row.candidates.length > 0
            ? "Fiches existantes proches, à rapprocher si c’est la même personne"
            : "Aucune fiche proche n’a été retenue : la demande attend une décision."}
        </span>
        {row.candidates.map(candidate => <label key={candidate.id} className="weblead-candidate">
          <input
            type="radio"
            name={`rapprochement-${row.id}`}
            checked={linking.id === row.id && linking.opportunityId === candidate.id}
            onChange={() => setLinking({ id: row.id, opportunityId: candidate.id })}
          />
          <span>{candidate.name || "Sans nom"}</span>
          <span className="weblead-when">créée le {formatWhen(candidate.createdAt)}</span>
        </label>)}
      </div>}

      <footer className="weblead-card-actions">
        {row.canRequeue && <button
          type="button"
          className="primary"
          disabled={busy === `${row.id}:relancer`}
          onClick={() => act(row, "relancer")}
        ><RefreshCw size={15}/>Relancer le traitement</button>}

        {row.canLink && <button
          type="button"
          className="secondary"
          disabled={linking.id !== row.id || !linking.opportunityId || busy === `${row.id}:rattacher`}
          onClick={() => act(row, "rattacher", { opportunityId: linking.opportunityId })}
        ><Link2 size={15}/>Rattacher à la fiche choisie</button>}

        {row.canDiscard && <button
          type="button"
          className="danger"
          disabled={busy === `${row.id}:ecarter`}
          onClick={() => act(row, "ecarter", { reason: "ecartee_manuellement" })}
        ><Trash2 size={15}/>Écarter</button>}

        <button type="button" className="ghost" onClick={() => openHistory(row)}>
          {history.id === row.id ? "Masquer l’historique" : "Historique"}
        </button>
      </footer>

      {history.id === row.id && <div className="weblead-history">
        {history.loading && <p className="weblead-note">Chargement de l’historique…</p>}
        {!history.loading && history.events.length === 0 && <p className="weblead-note">Aucune intervention enregistrée.</p>}
        {history.events.map(event => <p key={event.id} className="weblead-event">
          <span className="weblead-when">{formatWhen(event.createdAt)}</span>
          <span>{event.label}</span>
          {event.errorCode && <code>{event.errorCode}</code>}
        </p>)}
      </div>}
    </article>)}
  </div>;
}
