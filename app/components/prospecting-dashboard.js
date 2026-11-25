"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, Phone, RefreshCw, Users,
} from "lucide-react";
import { authFetch } from "../lib/supabase-rest";

function Metric({ icon: Icon, title, value, note }) {
  return <article className="kpi tone-blue"><i><Icon size={18}/></i><div><small>{title}</small><b>{value}</b><span>{note}</span></div></article>;
}

function CountList({ title, items }) {
  const entries = Object.entries(items || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return <section className="panel">
    <div className="panel-head"><b>{title}</b></div>
    <div className="dispatch-count-list">
      {entries.length === 0 && <div className="empty">Aucune donnée pour le moment.</div>}
      {entries.map(([label, count]) => <div key={label}><span>{label}</span><b>{count}</b></div>)}
    </div>
  </section>;
}

export default function ProspectingDashboard({ navigate, userName = "Utilisateur" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await authFetch("/api/dashboard/prospecting");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Chargement impossible");
        setData(payload);
      } catch (caught) {
        setError(String(caught?.message || "Chargement impossible"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const metrics = data?.metrics || {};
  return <div className="content commercial-dashboard">
    <div className="welcome">
      <div>
        <p>SUIVI PROSPECTION</p>
        <h1>Bonjour {userName.split(" ")[0]}, <span>voici la file d’attente et les rendez-vous.</span></h1>
        <small className="dashboard-scope">Sans devis, marges ni chiffre d’affaires</small>
      </div>
    </div>
    {loading && <div className="dashboard-loading">Chargement des indicateurs…</div>}
    {error && <div className="quote-alerts"><AlertTriangle size={20}/><div><b>Tableau de suivi</b><span>{error}</span></div></div>}
    {data && <>
      <div className="kpis commercial-kpis">
        <Metric icon={Users} title="Nouveaux" value={String(metrics.nouveaux || 0)} note="aujourd’hui"/>
        <Metric icon={Phone} title="À dispatcher" value={String(metrics.aDispatcher || 0)} note="sans commercial"/>
        <Metric icon={CheckCircle2} title="Attribués" value={String(metrics.attribuesAujourdhui || 0)} note="aujourd’hui"/>
        <Metric icon={CalendarDays} title="RDV programmés" value={String(metrics.rendezVousProgrammes || 0)} note="planifiés"/>
        <Metric icon={CheckCircle2} title="Confirmés" value={String(metrics.confirmes || 0)} note="agenda"/>
        <Metric icon={RefreshCw} title="À rappeler" value={String(metrics.aRappeler || 0)} note="relances"/>
      </div>
      <div className="grid-main">
        <CountList title="Par commercial" items={data.byCommercial}/>
        <CountList title="Par prospecteur" items={data.byProspector}/>
        <CountList title="Par origine" items={data.bySource}/>
        <CountList title="Par ville" items={data.byCity}/>
        <CountList title="Par type de projet" items={data.byType}/>
      </div>
      <div className="dashboard-quick-links">
        <button type="button" onClick={() => navigate("Prospects")}>File à dispatcher</button>
        <button type="button" onClick={() => navigate("Agenda commercial")}>Agendas commerciaux</button>
      </div>
    </>}
  </div>;
}
