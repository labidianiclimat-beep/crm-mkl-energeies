"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Euro } from "lucide-react";
import { quoteStatusLabel } from "../lib/devis";
import { authFetch } from "../lib/supabase-rest";

const euro = value => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));

function formatDay(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }).format(date);
}

function Metric({ icon: Icon, title, value, note }) {
  return <article className="kpi tone-sun"><i><Icon size={18}/></i><div><small>{title}</small><b>{value}</b><span>{note}</span></div></article>;
}

export default function CaControl({ query = "", toast }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [commercialId, setCommercialId] = useState("");
  const [manager, setManager] = useState("");
  const [deposit, setDeposit] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (commercialId) params.set("commercialId", commercialId);
      if (manager) params.set("manager", manager);
      if (deposit) params.set("deposit", deposit);
      if (query) params.set("q", query);
      const response = await authFetch(`/api/dashboard/ca-control?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Chargement impossible");
      setData(payload);
    } catch (caught) {
      setError(String(caught?.message || "Chargement impossible"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [from, to, commercialId, manager, deposit, query]);

  async function toggleDeposit(row) {
    if (!data?.canDeposit || busyId) return;
    setBusyId(row.id);
    setError("");
    try {
      const response = await authFetch(`/api/dashboard/ca-control/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposited: !row.deposited }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Dépôt impossible");
      toast?.(payload.deposited ? "Dossier déposé" : "Dossier non déposé");
      await load();
    } catch (caught) {
      const message = String(caught?.message || "Dépôt impossible");
      setError(message);
      toast?.(message);
    } finally {
      setBusyId("");
    }
  }

  const totals = data?.totals || {};
  const rows = data?.rows || [];
  const orgWide = data?.scope === "organization";

  return <div className="content commercial-dashboard ca-control">
    <div className="welcome">
      <div>
        <p>CONTRÔLE CA</p>
        <h1>Chiffre d’affaires des commandes signées</h1>
        <small className="dashboard-scope">Chaque devis de la commande signée compte une fois, avec son statut.</small>
      </div>
    </div>
    <div className="dashboard-filters">
      <label>Du<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label>
      <label>Au<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label>
      {orgWide && <label>Responsable
        <select value={manager} onChange={event => setManager(event.target.value)}>
          <option value="">Tous</option>
          {(data?.managers || []).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>}
      <label>Commercial
        <select value={commercialId} onChange={event => setCommercialId(event.target.value)}>
          <option value="">Tous</option>
          {(data?.commercials || []).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
      <label>Dossier
        <select value={deposit} onChange={event => setDeposit(event.target.value)}>
          <option value="">Tous</option>
          <option value="non">Dossier non déposé</option>
          <option value="depose">Dossier déposé</option>
        </select>
      </label>
    </div>
    {loading && <div className="dashboard-loading">Chargement du chiffre d’affaires…</div>}
    {error && <div className="quote-alerts"><AlertTriangle size={20}/><div><b>Contrôle CA</b><span>{error}</span></div></div>}
    {data && <>
      <div className="kpis commercial-kpis">
        <Metric icon={Euro} title="CA total" value={euro(totals.totalTTC)} note={`${euro(totals.totalHT)} HT`}/>
        <Metric icon={AlertTriangle} title="Non déposé" value={euro(totals.pendingTTC)} note={`${totals.pendingDossiers || 0} dossier${totals.pendingDossiers === 1 ? "" : "s"}`}/>
        <Metric icon={CheckCircle2} title="Déposé" value={euro(totals.depositedTTC)} note={`${totals.depositedDossiers || 0} dossier${totals.depositedDossiers === 1 ? "" : "s"}`}/>
      </div>
      <div className="data-panel ca-control-table">
        <div className="data-row data-head">
          <span>Signature</span>
          <span>Client</span>
          <span>Commercial</span>
          <span>Devis</span>
          <span>Statut</span>
          <span>HT</span>
          <span>TTC</span>
          <span>Dossier</span>
        </div>
        {rows.length === 0 && <div className="empty">Aucune commande signée pour ces filtres.</div>}
        {rows.map(row => {
          const label = row.deposited ? "Dossier déposé" : "Dossier non déposé";
          const className = `ca-pill ${row.deposited ? "is-done" : "is-open"}`;
          return <div className="data-row" key={row.id}>
            <span>{formatDay(row.signedAt)}</span>
            <b>{row.client}</b>
            <span>{row.commercial}</span>
            <span className="ca-quote-stack">{row.quotes?.length ? row.quotes.map(quote => <b key={quote.id}>{quote.number || "Devis"}</b>) : "—"}</span>
            <span className="ca-quote-stack">{row.quotes?.length ? row.quotes.map(quote => <em key={quote.id}>{quoteStatusLabel(quote.status) || "—"}</em>) : "—"}</span>
            <span className="ca-quote-stack">{row.quotes?.length ? row.quotes.map(quote => <b key={quote.id}>{euro(quote.totalHT)}</b>) : "—"}</span>
            <span className="ca-quote-stack">{row.quotes?.length ? row.quotes.map(quote => <b key={quote.id}>{euro(quote.totalTTC)}</b>) : "—"}</span>
            <span>
              {data.canDeposit
                ? <button type="button" className={`${className} is-button`} disabled={busyId === row.id} onClick={() => toggleDeposit(row)}>{label}</button>
                : <span className={className}>{label}</span>}
            </span>
          </div>;
        })}
      </div>
    </>}
  </div>;
}
