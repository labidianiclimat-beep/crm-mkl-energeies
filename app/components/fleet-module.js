"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, Camera, Car, Clock3, Download, FileSpreadsheet, Gauge, Plus, Upload,
} from "lucide-react";
import {
  CORE_VEHICLE_DOC_KINDS,
  DEADLINE_KINDS,
  DECLARATION_STATUSES,
  DOCUMENT_KINDS,
  ENERGY_TYPES,
  EXPENSE_CATEGORIES,
  HOLDING_MODES,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  PAYMENT_METHODS,
  URGENCY_LEVELS,
  VEHICLE_CATEGORIES,
  VEHICLE_STATUSES,
  FLEET_GARAGE_DRIVER_ID,
  FLEET_GARAGE_LABEL,
  groupVehiclesByCategory,
  vehicleCategoryLabel,
  displayPlate,
  expenseTotals,
  fleetLabel,
  controleTechniquePill,
  formatFrenchDate,
  VIDANGE_INTERVAL_KM,
  vidangeKmFromDeadline,
  vidangeMileageTone,
  openDeadline,
  officialExpenses,
  pendingExpenses,
  searchVehicles,
  todayIsoDate,
} from "../lib/fleet";
import { downloadHtmlAsPdf } from "../lib/html-to-pdf";
import { authFetch } from "../lib/supabase-rest";

const euro = value => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const km = value => `${Number(value || 0).toLocaleString("fr-FR")} km`;

function statusTone(status) {
  if (status === "immobilized") return "risk";
  if (status === "maintenance") return "wait";
  if (status === "assigned" || status === "validated" || status === "active") return "ok";
  if (status === "archived" || status === "rejected") return "muted";
  if (status === "pending") return "wait";
  return "wait";
}

async function jsonFetch(url, options) {
  const response = await authFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Action impossible.");
  return data;
}

async function uploadFleetFile(payload) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value != null && value !== "") form.append(key, value);
  });
  return jsonFetch("/api/fleet/documents", { method: "POST", body: form });
}

async function openFleetDocument(id, toast) {
  const response = await authFetch(`/api/fleet/documents?id=${id}`);
  if (!response.ok) return toast?.("Document protégé ou introuvable");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}

function ModuleTop({ title, sub, children }) {
  return (
    <div className="module-top">
      <div>
        <p>PARC AUTOMOBILE</p>
        <h1>{title}</h1>
        <span>{sub}</span>
      </div>
      <div className="module-actions">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="fleet-field"><span>{label}</span>{children}</label>;
}

export default function FleetModule({ query = "", toast, currentProfile }) {
  const [access, setAccess] = useState(null);
  const [tab, setTab] = useState("parc");
  const [vehicles, setVehicles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const caps = access?.caps || { canEnter: false };

  async function refreshList() {
    const data = await jsonFetch("/api/fleet/vehicles");
    setVehicles(data.vehicles || []);
    setAlerts(data.alerts || []);
    setAccess(current => ({ ...(current || {}), caps: data.caps || current?.caps }));
  }

  async function refreshDetail(id) {
    if (!id) return;
    const data = await jsonFetch(`/api/fleet/vehicles/${id}`);
    setDetail(data);
  }

  useEffect(() => {
    (async () => {
      try {
        const info = await jsonFetch("/api/fleet/access");
        setAccess(info);
        if (!info.canEnter) return;
        await refreshList();
        if (info.caps?.canViewAll) {
          const dash = await jsonFetch("/api/fleet/dashboard").catch(() => null);
          setDashboard(dash);
        }
        if (info.isDriver && !info.caps?.canViewAll) {
          setTab("conducteur");
          const home = await jsonFetch("/api/fleet/me");
          setDetail(home);
          setSelectedId(home.vehicle?.id || null);
        }
      } catch (error) {
        toast?.(error.message);
      }
    })();
  }, [currentProfile?.id]);

  const list = useMemo(() => searchVehicles(vehicles, query), [vehicles, query]);

  async function openVehicle(id) {
    setSelectedId(id);
    setBusy(true);
    try {
      await refreshDetail(id);
    } catch (error) {
      toast?.(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!access) return <div className="module-content fleet-module"><ModuleTop title="Parc automobile" sub="Chargement du parc…" /></div>;
  if (!caps.canEnter) return <div className="module-content fleet-module"><ModuleTop title="Parc automobile" sub="Aucun véhicule n’est actuellement affecté à votre compte." /></div>;

  return (
    <div className="module-content fleet-module">
      <ModuleTop
        title={caps.canViewAll ? "Parc automobile" : "Mon véhicule"}
        sub={caps.canViewAll ? `${vehicles.length} véhicule${vehicles.length !== 1 ? "s" : ""} — affectations, coûts et échéances` : "Votre véhicule affecté, relevés et déclarations"}
      >
        {caps.canViewAll && (
          <div className="fleet-tabs" role="tablist">
            {[["parc", "Parc"], ["dashboard", "Tableaux de bord"], ["validation", "À valider"]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        )}
        {caps.canCreateVehicle && <button className="secondary" type="button" onClick={() => setImportOpen(true)}><Upload size={17}/>Importer</button>}
        {caps.canCreateVehicle && <button className="primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={17}/>Nouveau véhicule</button>}
      </ModuleTop>

      {tab === "parc" && caps.canViewAll && (
        <div className="data-panel fleet-list secure-list">
          <div className="data-row data-head">
            <span>Véhicule</span><span>Conducteur</span><span>Statut</span><span>Contrôle technique</span><span>Kilométrage</span><span>Alerte</span>
          </div>
          {list.length ? groupVehiclesByCategory(list).filter(group => group.vehicles.length).map(group => (
            <div key={group.id} className="fleet-group">
              <div className="fleet-group-head"><b>{group.label}</b><small>{group.vehicles.length}</small></div>
              {group.vehicles.map(vehicle => {
                const openAlerts = alerts.filter(item => item.vehicleId === vehicle.id && item.status === "open");
                const alert = openAlerts.find(item => String(item.kind || "").startsWith("deadline") || String(item.kind || "").startsWith("document")) || openAlerts[0];
                const controle = controleTechniquePill(vehicle.controleOn);
                const mileageTone = vidangeMileageTone(vehicle.currentKm, vehicle.vidangeKm);
                return (
                  <button type="button" className={`data-row fleet-row ${vehicle.status === "immobilized" ? "is-immobilized" : ""}`} key={vehicle.id} onClick={() => openVehicle(vehicle.id)}>
                    <div className="entity">
                      <i>{(vehicle.plate || "V")[0]}</i>
                      <span><b>{vehicle.plate}</b><small>{vehicle.internalCode} · {[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}</small></span>
                    </div>
                    <span><b>{vehicle.driverName || "Disponible"}</b><small>{vehicle.assignedSince || "—"}</small></span>
                    <span className={`status ${vehicle.status === "available" ? "is-available" : statusTone(vehicle.status)}`}>{fleetLabel(VEHICLE_STATUSES, vehicle.status)}</span>
                    <span>{controle.label ? <span className={`fleet-ct-pill is-${controle.tone}`}>{controle.label}</span> : <small>—</small>}</span>
                    <span><b className={mileageTone ? `fleet-km is-${mileageTone}` : ""}>{km(vehicle.currentKm)}</b><small>{vehicle.lastValidatedReadingAt || "Aucun relevé validé"}</small></span>
                    <span>{alert ? <b className="fleet-alert-dot">{alert.title}</b> : <small>RAS</small>}</span>
                  </button>
                );
              })}
            </div>
          )) : <div className="empty">Aucun véhicule pour cette recherche.</div>}
        </div>
      )}

      {tab === "dashboard" && caps.canViewAll && (
        <FleetDashboard dashboard={dashboard} vehicles={vehicles} toast={toast} onOpen={id => { setTab("parc"); openVehicle(id); }} onRefresh={async () => setDashboard(await jsonFetch("/api/fleet/dashboard"))} />
      )}
      {tab === "validation" && caps.canValidate && (
        <FleetValidation vehicles={vehicles} toast={toast} onRefresh={refreshList} />
      )}
      {tab === "conducteur" && (
        <FleetDriver detail={detail} toast={toast} onRefresh={() => refreshDetail(selectedId || detail?.vehicle?.id)} />
      )}
      {selectedId && detail && tab === "parc" && (
        <FleetDetail
          detail={detail}
          caps={caps}
          busy={busy}
          toast={toast}
          users={detail.users || []}
          onClose={() => { setSelectedId(null); setDetail(null); }}
          onRefresh={async () => { await refreshList(); await refreshDetail(selectedId); }}
        />
      )}
      {createOpen && <VehicleForm onClose={() => setCreateOpen(false)} toast={toast} onCreated={async vehicle => { setCreateOpen(false); await refreshList(); openVehicle(vehicle.id); }} />}
      {importOpen && <ImportWizard onClose={() => setImportOpen(false)} toast={toast} onDone={refreshList} />}
    </div>
  );
}

function FleetDashboard({ dashboard, vehicles, toast, onOpen, onRefresh }) {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayIsoDate());
  if (!dashboard) return <p className="fleet-hint">Chargement des indicateurs…</p>;
  const monthly = dashboard.monthly || {};
  return (
    <div className="fleet-dash">
      <div className="fleet-filters">
        <Field label="Du"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="Au"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        <button className="secondary" type="button" onClick={async () => { try { onRefresh(); } catch (error) { toast?.(error.message); } }}>Actualiser</button>
        <button className="secondary" type="button" onClick={async () => { const response = await authFetch(`/api/fleet/expenses?export=1&from=${from}&to=${to}`); if (!response.ok) return toast?.("Export impossible"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "parc-depenses.csv"; link.click(); }}><FileSpreadsheet size={17}/>Exporter les dépenses</button>
      </div>
      <section className="mini-kpis">
        <article><b>{dashboard.daily?.immobilized?.length || 0}</b><span>Immobilisés aujourd’hui</span></article>
        <article><b>{dashboard.daily?.pendingDeclarations?.length || 0}</b><span>Déclarations à valider</span></article>
        <article><b>{euro(monthly.fleetTotal)}</b><span>Coût validé sur la période</span></article>
        <article><b>{euro(monthly.pendingTotal)}</b><span>En attente (hors totaux)</span></article>
      </section>
      <div className="fleet-dash-grid">
        <article className="panel">
          <h3>Vue quotidienne</h3>
          <DashList title="Véhicules immobilisés" items={dashboard.daily?.immobilized} render={item => `${item.plate} · ${item.driverName || "sans conducteur"}`} onOpen={item => onOpen(item.id)} />
          <DashList title="Incidents urgents ou sans responsable" items={dashboard.daily?.urgentIncidents} render={item => item.description} />
          <DashList title="Échéances dépassées" items={dashboard.daily?.overdue} render={item => item.title} />
        </article>
        <article className="panel">
          <h3>Vue hebdomadaire</h3>
          <DashList title="Contrôles et échéances" items={dashboard.weekly?.maintenance} render={item => item.title} />
          <DashList title="Incidents ouverts" items={dashboard.weekly?.openIncidents} render={item => item.description} />
          <DashList title="Relevés manquants" items={dashboard.weekly?.missingMileage} render={item => item.title} />
        </article>
        <article className="panel">
          <h3>Vue mensuelle / annuelle</h3>
          <ul>{(monthly.byVehicle || []).sort((a, b) => b.total - a.total).map(item => (
            <li key={item.vehicleId}><button type="button" onClick={() => onOpen(item.vehicleId)}><b>{item.plate}</b> {euro(item.total)}{item.costPerKm ? ` · ${euro(item.costPerKm.amount)}/km` : ""}</button></li>
          ))}</ul>
        </article>
      </div>
      <p className="fleet-hint">{vehicles.filter(item => item.status === "immobilized").length} véhicule(s) immobilisé(s) — ligne rouge dans l’onglet Parc.</p>
    </div>
  );
}

function DashList({ title, items, render, onOpen }) {
  return (
    <div className="fleet-dash-list">
      <b>{title}</b>
      {!(items || []).length && <small>RAS</small>}
      <ul>{(items || []).slice(0, 8).map(item => (
        <li key={item.id || item.vehicleId || render(item)}>
          {onOpen ? <button type="button" onClick={() => onOpen(item)}>{render(item)}</button> : render(item)}
        </li>
      ))}</ul>
    </div>
  );
}

function FleetValidation({ vehicles, toast, onRefresh }) {
  const [items, setItems] = useState({ mileage: [], expenses: [], assignments: [] });
  useEffect(() => {
    (async () => {
      try {
        const dash = await jsonFetch("/api/fleet/dashboard");
        const pending = dash.daily?.pendingDeclarations || [];
        setItems({
          mileage: pending.filter(item => item.readingDate && item.km != null && item.amountTtc == null),
          expenses: pending.filter(item => item.amountTtc != null && !item.readingDate),
          assignments: pending.filter(item => item.driverId && item.startedOn && item.amountTtc == null && !item.readingDate),
        });
      } catch (error) {
        toast?.(error.message);
      }
    })();
  }, [vehicles.length]);

  async function review(kind, id, decision) {
    const reason = decision === "reject" ? window.prompt("Motif du rejet") : "";
    if (decision === "reject" && !reason) return;
    const url = kind === "mileage" ? "/api/fleet/mileage" : kind === "expense" ? "/api/fleet/expenses" : "/api/fleet/assignments";
    const body = kind === "assignment"
      ? { action: "review", id, decision, reason }
      : { action: "review", id, decision, reason };
    try {
      await jsonFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      toast?.(decision === "reject" ? "Déclaration rejetée" : "Déclaration validée");
      onRefresh?.();
    } catch (error) {
      toast?.(error.message);
    }
  }

  const groups = [
    { key: "mileage", title: "Kilométrages à valider", rows: items.mileage, kind: "mileage", detail: item => `${km(item.km)} · ${item.readingDate}`, check: item => item.flagLow ? "Inférieur au dernier relevé" : item.flagIncoherent ? "Saut inhabituel" : "Contrôle OK" },
    { key: "expenses", title: "Dépenses à valider", rows: items.expenses, kind: "expense", detail: item => `${euro(item.amountTtc)} · ${fleetLabel(EXPENSE_CATEGORIES, item.category)}`, check: item => fleetLabel(DECLARATION_STATUSES, item.status) },
    { key: "assignments", title: "Affectations à valider", rows: items.assignments, kind: "assignment", detail: item => `${item.driverName || item.driverId} · ${item.startedOn}`, check: () => "En attente Super Admin" },
  ];
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="fleet-validation">
      <p className="fleet-hint">{total ? `${total} déclaration${total > 1 ? "s" : ""} en attente de contrôle.` : "Aucune déclaration en attente."}</p>
      {groups.filter(group => group.rows.length).map(group => (
        <section key={group.key} className="data-panel fleet-validate-table">
          <div className="data-row data-head">
            <span>{group.title}</span><span>Véhicule</span><span>Détail</span><span>Contrôle</span><span>Actions</span>
          </div>
          {group.rows.map(item => (
            <div className="data-row" key={item.id}>
              <span><b>{group.title.replace(" à valider", "")}</b></span>
              <span>{vehicles.find(vehicle => vehicle.id === item.vehicleId)?.plate || "—"}</span>
              <span>{group.detail(item)}</span>
              <span>{group.check(item)}</span>
              <span className="fleet-inline-actions">
                <button type="button" className="secondary" onClick={() => review(group.kind, item.id, "validate")}>Valider</button>
                <button type="button" className="secondary fleet-reject" onClick={() => review(group.kind, item.id, "reject")}>Rejeter</button>
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function FleetDetail({ detail, caps, toast, users, onClose, onRefresh }) {
  const { vehicle } = detail;
  const [panel, setPanel] = useState("fiche");
  const totals = expenseTotals(detail.expenses || []);
  return (
    <div className="backdrop">
      <div className="modal fleet-sheet">
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        <div className="fleet-sheet-head">
          <div className="modal-icon"><Car /></div>
          <div>
            <p>{vehicle.internalCode}</p>
            <h2>{vehicle.plate}</h2>
            <span>{[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ")} · {km(vehicle.currentKm)}</span>
          </div>
          <span className={`status ${statusTone(vehicle.status)}`}>{fleetLabel(VEHICLE_STATUSES, vehicle.status)}</span>
        </div>
        <div className="fleet-tabs">
          {[["fiche", "Fiche"], ["affectation", "Affectation"], ["incidents", "Incidents"], ["depenses", "Dépenses"], ["documents", "Documents"], ["historique", "Historique"]].map(([id, label]) => (
            <button key={id} type="button" className={panel === id ? "active" : ""} onClick={() => setPanel(id)}>{label}</button>
          ))}
        </div>
        {panel === "fiche" && <VehicleIdentity key={`${vehicle.id}-${(detail.deadlines || []).map(item => item.id).join(",")}`} vehicle={vehicle} caps={caps} toast={toast} detail={detail} onRefresh={onRefresh} />}
        {panel === "affectation" && <AssignmentPanel detail={detail} caps={caps} users={users} toast={toast} onRefresh={onRefresh} />}
        {panel === "incidents" && <IncidentPanel detail={detail} caps={caps} users={users} toast={toast} onRefresh={onRefresh} />}
        {panel === "depenses" && <ExpensePanel detail={detail} caps={caps} toast={toast} onRefresh={onRefresh} totals={totals} />}
        {panel === "documents" && <DocumentPanel detail={detail} caps={caps} toast={toast} onRefresh={onRefresh} />}
        {panel === "historique" && <HistoryPanel detail={detail} />}
      </div>
    </div>
  );
}

function identityForm(vehicle, deadlines) {
  const controle = openDeadline(deadlines, "controle");
  return {
    brand: vehicle.brand || "",
    model: vehicle.model || "",
    year: vehicle.year ?? "",
    energy: vehicle.energy || "diesel",
    category: vehicle.category || "direction",
    holdingMode: vehicle.holdingMode || "propriete",
    notes: vehicle.notes || "",
    status: vehicle.status || "available",
    currentKm: vehicle.currentKm ?? "",
    controleOn: String(controle?.dueOn || "").slice(0, 10),
    controleDeadlineId: controle?.id || "",
    vidangeKm: (() => {
      const saved = vidangeKmFromDeadline((deadlines || []).find(item => item.kind === "vidange" && (item.status || "open") === "open"));
      return saved == null ? "" : saved;
    })(),
    vidangeDeadlineId: (deadlines || []).find(item => item.kind === "vidange" && (item.status || "open") === "open")?.id || "",
  };
}

function VehicleIdentity({ vehicle, caps, toast, detail, onRefresh }) {
  const [form, setForm] = useState(() => identityForm(vehicle, detail.deadlines));
  const [saving, setSaving] = useState(false);
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const { controleOn, controleDeadlineId, vidangeKm, vidangeDeadlineId, ...vehicleFields } = form;
      const activeAssignment = (detail.assignments || []).find(item => item.status === "active");
      const garageAssignment = activeAssignment && (activeAssignment.holderLabel === FLEET_GARAGE_LABEL || activeAssignment.driverName === FLEET_GARAGE_LABEL);
      if (vehicleFields.status === "available" && activeAssignment && !garageAssignment && caps.canAssign) {
        const km = vehicleFields.currentKm === "" || vehicleFields.currentKm == null ? vehicle.currentKm : vehicleFields.currentKm;
        await jsonFetch("/api/fleet/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "release",
            vehicleId: vehicle.id,
            returnDate: todayIsoDate(),
            returnKm: km,
          }),
        });
      }
      await jsonFetch(`/api/fleet/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vehicleFields, year: vehicleFields.year === "" ? null : Number(vehicleFields.year) }),
      });
      if (controleOn) {
        await jsonFetch("/api/fleet/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preventive", vehicleId: vehicle.id, kind: "controle", title: "Contrôle technique", dueOn: controleOn }),
        });
      } else if (controleDeadlineId) {
        await jsonFetch("/api/fleet/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deadlineId: controleDeadlineId, status: "done" }),
        });
      }
      if (vidangeKm !== "" && vidangeKm != null) {
        const last = Number(vidangeKm);
        await jsonFetch("/api/fleet/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preventive",
            vehicleId: vehicle.id,
            kind: "vidange",
            title: "Vidange",
            dueKm: last + VIDANGE_INTERVAL_KM,
            notes: String(last),
          }),
        });
      } else if (vidangeDeadlineId) {
        await jsonFetch("/api/fleet/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deadlineId: vidangeDeadlineId, status: "done" }),
        });
      }
      toast?.("Fiche enregistrée");
      onRefresh();
    } catch (error) {
      toast?.(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
    <VehicleDocumentsBlock detail={detail} caps={caps} toast={toast} onRefresh={onRefresh} />
    <form className="fleet-form" onSubmit={save}>
      <div className="form-row">
        <Field label="Marque"><input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} disabled={!caps.canOperate} /></Field>
        <Field label="Modèle"><input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} disabled={!caps.canOperate} /></Field>
      </div>
      <div className="form-row">
        <Field label="Catégorie">
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} disabled={!caps.canOperate}>
            {!VEHICLE_CATEGORIES.some(item => item.id === form.category) && <option value={form.category}>{vehicleCategoryLabel(form.category)}</option>}
            {VEHICLE_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Énergie"><select value={form.energy} onChange={e => setForm({ ...form, energy: e.target.value })} disabled={!caps.canOperate}>{ENERGY_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      </div>
      <div className="form-row">
        <Field label="Année"><input type="number" min="1980" max="2100" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} disabled={!caps.canOperate} /></Field>
        <Field label="Détention"><select value={form.holdingMode} onChange={e => setForm({ ...form, holdingMode: e.target.value })} disabled={!caps.canOperate}>{HOLDING_MODES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      </div>
      <Field label="Kilométrage">
        <input type="number" min="0" required value={form.currentKm} onChange={e => setForm({ ...form, currentKm: e.target.value })} disabled={!caps.canOperate} />
      </Field>
      <Field label="Prochain contrôle technique">
        <input type="date" value={form.controleOn} onChange={e => setForm({ ...form, controleOn: e.target.value })} disabled={!caps.canOperate} />
      </Field>
      <Field label="Kilométrage de la dernière vidange">
        <input type="number" min="0" value={form.vidangeKm} onChange={e => setForm({ ...form, vidangeKm: e.target.value })} disabled={!caps.canOperate} />
      </Field>
      <p className="fleet-hint">Le kilométrage du tableau passe au rouge à moins de 10 000 km des 30 000 km qui suivent cette vidange.</p>
      <p className="fleet-hint">La date reste sur la fiche et dans la liste du parc. Une alerte s’affiche 30 jours avant, ou tout de suite si la date est déjà dépassée.</p>
      <Field label="Statut opérationnel">
        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} disabled={!caps.canOperate}>
          {VEHICLE_STATUSES.filter(item => item.id !== "archived" || form.status === "archived").map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </Field>
      <Field label="Commentaire interne"><textarea rows="3" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} disabled={!caps.canOperate} /></Field>
      <DeadlineForm vehicleId={vehicle.id} caps={caps} toast={toast} onRefresh={onRefresh} deadlines={detail.deadlines} />
      {caps.canOperate && <button className="primary submit" type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>}
      {caps.canArchive && vehicle.status !== "archived" && (
        <button type="button" className="secondary" onClick={async () => {
          if (!window.confirm("Archiver ce véhicule ? L’historique est conservé.")) return;
          await jsonFetch(`/api/fleet/vehicles/${vehicle.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
          toast?.("Véhicule archivé");
          onRefresh();
        }}><Archive size={16}/>Archiver</button>
      )}
    </form>
    </>
  );
}

function DeadlineForm({ vehicleId, caps, toast, onRefresh, deadlines }) {
  const [form, setForm] = useState({ kind: "entretien", title: "", dueOn: "", dueKm: "" });
  return (
    <div className="fleet-subcard">
      <h3>Échéances</h3>
      <ul>{(deadlines || []).map(item => (
        <li key={item.id}><b>{item.title || fleetLabel(DEADLINE_KINDS, item.kind)}</b> {formatFrenchDate(item.dueOn) || (item.dueKm ? `${item.dueKm} km` : "—")} · {item.status === "open" ? "à venir" : item.status}</li>
      ))}</ul>
      {caps.canOperate && (
        <div className="form-row">
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{DEADLINE_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <input placeholder="Libellé" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input type="date" value={form.dueOn} onChange={e => setForm({ ...form, dueOn: e.target.value })} />
          <input placeholder="Seuil km" value={form.dueKm} onChange={e => setForm({ ...form, dueKm: e.target.value })} />
          <button type="button" className="secondary" onClick={async () => {
            if (!form.dueOn && !form.dueKm) return toast?.("Indiquez une date ou un seuil kilométrique.");
            try {
              await jsonFetch("/api/fleet/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preventive", vehicleId, ...form }) });
              setForm({ kind: form.kind, title: "", dueOn: "", dueKm: "" });
              toast?.("Échéance enregistrée");
              onRefresh();
            } catch (error) {
              toast?.(error.message);
            }
          }}>Ajouter</button>
        </div>
      )}
    </div>
  );
}

function AssignmentPanel({ detail, caps, users, toast, onRefresh }) {
  const { vehicle, assignments } = detail;
  const active = assignments.find(item => item.status === "active");
  const pending = assignments.find(item => item.status === "pending");
  const people = users.filter(item => item.active !== false);
  const [form, setForm] = useState({ driverId: "", startedOn: todayIsoDate(), startKm: vehicle.currentKm ?? "", damages: "", accessories: "", observations: "" });
  const [saving, setSaving] = useState(false);

  async function downloadSheet(assignment) {
    const data = await jsonFetch(`/api/fleet/vehicles/${vehicle.id}?handover=${assignment.id}`);
    await downloadHtmlAsPdf(data.html, { filename: `remise-${vehicle.plate}.pdf`, title: `Remise ${vehicle.plate}` });
  }

  const garageChoice = form.driverId === FLEET_GARAGE_DRIVER_ID;
  const activeIsGarage = active?.holderLabel === FLEET_GARAGE_LABEL || active?.driverName === FLEET_GARAGE_LABEL;
  const pendingIsGarage = pending?.holderLabel === FLEET_GARAGE_LABEL || pending?.driverName === FLEET_GARAGE_LABEL;

  async function assign(event) {
    event.preventDefault();
    if (!form.driverId) return toast?.("Choisissez le conducteur.");
    setSaving(true);
    try {
      const damages = form.damages.split("\n").map(item => item.trim()).filter(Boolean);
      const samePending = pending && (pending.driverId === form.driverId || (garageChoice && pendingIsGarage));
      if (active) {
        await jsonFetch("/api/fleet/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "change",
            vehicleId: vehicle.id,
            driverId: form.driverId,
            returnDate: form.startedOn,
            returnKm: form.startKm,
            startedOn: form.startedOn,
            startKm: form.startKm,
            returnDamages: damages,
            returnObservations: form.observations,
          }),
        });
      } else if (samePending) {
        await jsonFetch("/api/fleet/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "review", id: pending.id, decision: "validate" }),
        });
      } else {
        if (pending) {
          await jsonFetch("/api/fleet/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "review", id: pending.id, decision: "reject", reason: "Remplacée par une autre affectation" }),
          });
        }
        await jsonFetch("/api/fleet/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicleId: vehicle.id,
            ...form,
            damages,
            accessories: form.accessories.split("\n").map(item => item.trim()).filter(Boolean),
          }),
        });
      }
      toast?.(garageChoice
        ? "Affectation enregistrée. Le véhicule reste disponible."
        : active
          ? "Voiture affectée au nouveau conducteur"
          : "Voiture affectée");
      setForm(current => ({ ...current, driverId: "" }));
      onRefresh();
    } catch (error) {
      toast?.(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function release() {
    if (!form.startedOn || form.startKm === "" || form.startKm == null) {
      return toast?.("Indiquez la date et le kilométrage pour rendre le véhicule disponible.");
    }
    setSaving(true);
    try {
      await jsonFetch("/api/fleet/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "release",
          vehicleId: vehicle.id,
          returnDate: form.startedOn,
          returnKm: form.startKm,
          returnDamages: form.damages.split("\n").map(item => item.trim()).filter(Boolean),
          returnObservations: form.observations,
        }),
      });
      toast?.("Voiture rendue disponible");
      onRefresh();
    } catch (error) {
      toast?.(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fleet-form">
      <p className="fleet-hint">{active
        ? activeIsGarage
          ? <>Cette voiture est au <b>{FLEET_GARAGE_LABEL}</b> depuis le {active.startedOn}. Elle reste disponible. Vous pouvez renseigner une nouvelle remise.</>
          : <>Cette voiture est chez <b>{active.driverName || "un salarié"}</b> depuis le {active.startedOn}. Choisissez quelqu’un d’autre pour la lui passer, ou rendez-la disponible.</>
        : pending
          ? <>Une affectation pour <b>{pending.driverName || "un salarié"}</b> attend encore d’être enregistrée. Choisissez la même personne, ou une autre.</>
          : "Ce véhicule est disponible. Vous pouvez quand même renseigner l’affectation : un conducteur, ou Garage automobile."}</p>
      {caps.canAssign ? (
        <form onSubmit={assign}>
          <h3>{active && !activeIsGarage ? "Changer le conducteur" : "Renseigner l’affectation"}</h3>
          <Field label="Conducteur">
            <select required value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Choisir</option>
              <option value={FLEET_GARAGE_DRIVER_ID}>{FLEET_GARAGE_LABEL}</option>
              {people.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
            </select>
          </Field>
          {!people.length && <p className="fleet-hint">Aucun salarié actif. Garage automobile reste disponible.</p>}
          <div className="form-row">
            <Field label="Date"><input type="date" required value={form.startedOn} onChange={e => setForm({ ...form, startedOn: e.target.value })} /></Field>
            <Field label="Kilométrage"><input type="number" required value={form.startKm} onChange={e => setForm({ ...form, startKm: e.target.value })} /></Field>
          </div>
          <Field label="Dommages"><textarea rows="2" value={form.damages} onChange={e => setForm({ ...form, damages: e.target.value })} placeholder="Un dommage par ligne" /></Field>
          {!active && <Field label="Accessoires"><textarea rows="2" value={form.accessories} onChange={e => setForm({ ...form, accessories: e.target.value })} /></Field>}
          <Field label="Observations"><textarea rows="2" value={form.observations} onChange={e => setForm({ ...form, observations: e.target.value })} /></Field>
          <div className="fleet-inline-actions">
            <button className="primary submit" type="submit" disabled={saving}>{saving ? "Enregistrement…" : garageChoice ? "Enregistrer" : "Affecter"}</button>
            {active && !activeIsGarage && <button className="secondary" type="button" disabled={saving} onClick={release}>Rendre disponible</button>}
          </div>
        </form>
      ) : <p className="fleet-hint">L’affectation se fait par l’Admin VIP, le Superadmin ou la responsable prospection.</p>}
      <ul className="fleet-history">
        {assignments.map(item => (
          <li key={item.id}>
            <b>{fleetLabel([{ id: "active", label: "Active" }, { id: "closed", label: "Clôturée" }, { id: "pending", label: "En attente" }, { id: "rejected", label: "Rejetée" }], item.status)}</b>
            <span>{item.driverName || item.holderLabel || "—"} · {item.startedOn}{item.endedOn ? ` → ${item.endedOn}` : ""}</span>
            {item.handovers?.map(handover => <small key={handover.id}>{handover.kind === "return" ? "Restitution" : "Remise"} · {handover.date} · {km(handover.km)}</small>)}
            <button type="button" className="edit-user" onClick={() => downloadSheet(item)}><Download size={14}/>Fiche</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IncidentPanel({ detail, caps, users, toast, onRefresh }) {
  const [form, setForm] = useState({ kind: "panne", urgency: "normale", description: "", occurredOn: todayIsoDate(), ownerId: "", immobilize: false });
  return (
    <div className="fleet-form">
      {(detail.incidents || []).map(item => (
        <article className="fleet-subcard" key={item.id}>
          <header><b>{fleetLabel(INCIDENT_KINDS, item.kind)}</b><span className={`status ${statusTone(item.urgency)}`}>{fleetLabel(URGENCY_LEVELS, item.urgency)}</span><span className={`status ${statusTone(item.status)}`}>{fleetLabel(INCIDENT_STATUSES, item.status)}</span></header>
          <p>{item.description}</p>
          <small>{item.reporterName || "Déclarant"} · {item.occurredOn} · {item.ownerName || "Sans responsable"}</small>
          <ul>{(item.events || []).map(event => <li key={event.id}>{event.action} · {event.note || ""} · {event.createdAt}</li>)}</ul>
          {caps.canOperate && item.status !== "cloture" && (
            <div className="fleet-inline-actions">
              <select defaultValue={item.status} onChange={async event => {
                await jsonFetch("/api/fleet/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: item.id, status: event.target.value }) });
                onRefresh();
              }}>{INCIDENT_STATUSES.filter(status => status.id !== "cloture").map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
              <select defaultValue={item.ownerId || ""} onChange={async event => {
                await jsonFetch("/api/fleet/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: item.id, ownerId: event.target.value || null }) });
                onRefresh();
              }}><option value="">Responsable…</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
              <button type="button" className="secondary" onClick={async () => {
                if (!window.confirm("Clôturer cet incident ? Cette action est manuelle et définitive.")) return;
                await jsonFetch("/api/fleet/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: item.id, status: "cloture", explicitClose: true }) });
                toast?.("Incident clôturé");
                onRefresh();
              }}>Clôturer</button>
            </div>
          )}
        </article>
      ))}
      {(caps.canOperate || caps.isDriver) && (
        <form onSubmit={async event => {
          event.preventDefault();
          try {
            await jsonFetch("/api/fleet/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: detail.vehicle.id, ...form }) });
            toast?.("Incident déclaré");
            onRefresh();
          } catch (error) {
            toast?.(error.message);
          }
        }}>
          <h3>Signaler un incident</h3>
          <div className="form-row">
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{INCIDENT_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <select value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })}>{URGENCY_LEVELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </div>
          <textarea required rows="3" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          {caps.canOperate && <label className="fleet-check"><input type="checkbox" checked={form.immobilize} onChange={e => setForm({ ...form, immobilize: e.target.checked })} />Immobiliser le véhicule</label>}
          <button className="primary submit" type="submit">Déclarer</button>
        </form>
      )}
    </div>
  );
}

function ExpensePanel({ detail, caps, toast, onRefresh, totals }) {
  const [form, setForm] = useState({ category: "carburant", amountTtc: "", occurredOn: todayIsoDate(), supplier: "", otherLabel: "", paymentMethod: "", km: "" });
  const validated = officialExpenses(detail.expenses);
  const pending = pendingExpenses(detail.expenses);
  return (
    <div className="fleet-form">
      <p className="fleet-hint">Validé : <b>{euro(totals.total)}</b> · En attente (hors totaux officiels) : <b>{euro(totals.pendingTotal)}</b></p>
      <div className="data-panel fleet-expense-table">
        <div className="data-row data-head"><span>Catégorie</span><span>Date</span><span>Montant</span><span>Statut</span></div>
        {(detail.expenses || []).map(item => (
          <div className="data-row" key={item.id}>
            <span><b>{fleetLabel(EXPENSE_CATEGORIES, item.category)}</b></span>
            <span>{item.occurredOn}</span>
            <span>{euro(item.amountTtc)}</span>
            <span className={`status ${statusTone(item.status)}`}>{fleetLabel(DECLARATION_STATUSES, item.status)}</span>
          </div>
        ))}
      </div>
      {(caps.canOperate || caps.isDriver) && (
        <form onSubmit={async event => {
          event.preventDefault();
          try {
            const result = await jsonFetch("/api/fleet/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: detail.vehicle.id, ...form, asDriver: caps.isDriver && !caps.canOperate }) });
            if (result.duplicate) toast?.("Attention : une dépense identique existe déjà (même date, montant et fournisseur).");
            else toast?.(result.expense.status === "pending" ? "Dépense envoyée pour validation" : "Dépense enregistrée");
            onRefresh();
          } catch (error) {
            toast?.(error.message);
          }
        }}>
          <h3>Nouvelle dépense</h3>
          <div className="form-row">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <input required type="number" step="0.01" placeholder="Montant TTC" value={form.amountTtc} onChange={e => setForm({ ...form, amountTtc: e.target.value })} />
            <input type="date" value={form.occurredOn} onChange={e => setForm({ ...form, occurredOn: e.target.value })} />
          </div>
          <div className="form-row">
            <input placeholder="Fournisseur" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
            <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}><option value="">Paiement…</option>{PAYMENT_METHODS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </div>
          {form.category === "autre" && <input placeholder="Libellé libre" value={form.otherLabel} onChange={e => setForm({ ...form, otherLabel: e.target.value })} />}
          <button className="primary submit" type="submit">Déclarer</button>
        </form>
      )}
      <p className="fleet-hint">{validated.length} dépense(s) officielle(s) · {pending.length} en attente</p>
    </div>
  );
}

function pendingDocTitle(file, fromCamera, kind) {
  const kindLabel = fleetLabel(DOCUMENT_KINDS, kind);
  return fromCamera ? `${kindLabel} (photo)` : (file.name || kindLabel);
}

function VehicleDocCapture({ kind, setKind, expiresOn, setExpiresOn, busy, disabled, onPick }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  function takeFile(event, fromCamera) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onPick(file, fromCamera);
  }
  return (
    <>
      <div className="form-row">
        <Field label="Type de document">
          <select value={kind} onChange={e => setKind(e.target.value)} disabled={disabled}>{DOCUMENT_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        </Field>
        <Field label="Date d’échéance">
          <input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} disabled={disabled} />
        </Field>
      </div>
      <input
        ref={cameraRef}
        className="fleet-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        onChange={event => takeFile(event, true)}
      />
      <input
        ref={fileRef}
        className="fleet-file-input"
        type="file"
        accept="image/*,.pdf,.heic"
        tabIndex={-1}
        onChange={event => takeFile(event, false)}
      />
      <div className="fleet-doc-actions">
        <button type="button" className="primary" disabled={disabled || !!busy} onClick={() => cameraRef.current?.click()}>
          <Camera size={16}/>{busy === "photo" ? "Envoi…" : "Prendre une photo"}
        </button>
        <button type="button" className="secondary" disabled={disabled || !!busy} onClick={() => fileRef.current?.click()}>
          <Upload size={16}/>{busy === "file" ? "Envoi…" : "Télécharger un document"}
        </button>
      </div>
    </>
  );
}

function VehicleDocChips({ presentKinds, onSelect }) {
  return (
    <div className="fleet-doc-chips">
      {CORE_VEHICLE_DOC_KINDS.map(id => {
        const ok = presentKinds.has(id);
        return (
          <button
            key={id}
            type="button"
            className={`fleet-doc-chip ${ok ? "is-ok" : "is-missing"}`}
            onClick={() => onSelect(id)}
          >
            {ok ? "Présent" : "Manquant"} · {fleetLabel(DOCUMENT_KINDS, id)}
          </button>
        );
      })}
    </div>
  );
}

function VehicleDocumentsBlock({ detail, caps, toast, onRefresh }) {
  const [kind, setKind] = useState("carte_grise");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState("");
  const documents = detail.documents || [];
  const presentKinds = new Set(documents.map(item => item.kind));
  const canUpload = caps.canOperate || caps.isDriver;

  async function sendFile(file, fromCamera) {
    if (!file) return toast?.("Aucun fichier");
    setBusy(fromCamera ? "photo" : "file");
    try {
      await uploadFleetFile({
        vehicleId: detail.vehicle.id,
        kind,
        expiresOn,
        file,
        title: pendingDocTitle(file, fromCamera, kind),
      });
      toast?.(fromCamera ? "Photo enregistrée" : "Document déposé");
      onRefresh();
    } catch (error) {
      toast?.(error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fleet-subcard fleet-docs-block">
      <h3>Documents du véhicule</h3>
      <p className="fleet-hint">Carte grise, assurance, contrôle technique, Crit’Air, facture d’achat, contrat de location / LOA, mandat… Photo du téléphone ou fichier PDF.</p>
      <VehicleDocChips presentKinds={presentKinds} onSelect={setKind} />
      {documents.length ? (
        <div className="fleet-docs-list">
          {documents.map(item => (
            <div className="data-row" key={item.id}>
              <b>{item.title}</b>
              <span>{fleetLabel(DOCUMENT_KINDS, item.kind)}</span>
              <span>{formatFrenchDate(item.expiresOn || item.docDate) || "—"}</span>
              <button type="button" className="edit-user" onClick={() => openFleetDocument(item.id, toast)}>Ouvrir</button>
            </div>
          ))}
        </div>
      ) : <p className="fleet-hint">Aucun document pour l’instant.</p>}
      {canUpload && (
        <VehicleDocCapture
          kind={kind}
          setKind={setKind}
          expiresOn={expiresOn}
          setExpiresOn={setExpiresOn}
          busy={busy}
          onPick={sendFile}
        />
      )}
    </div>
  );
}

function DocumentPanel({ detail, caps, toast, onRefresh }) {
  return (
    <div className="fleet-form">
      <VehicleDocumentsBlock detail={detail} caps={caps} toast={toast} onRefresh={onRefresh} />
    </div>
  );
}

function HistoryPanel({ detail }) {
  return (
    <ul className="fleet-history">
      {(detail.assignments || []).map(item => (
        <li key={item.id}><b>Affectation</b> {item.driverName} · {item.startedOn}{item.endedOn ? ` → ${item.endedOn}` : " (en cours)"} · {item.status}</li>
      ))}
      {(detail.mileage || []).map(item => (
        <li key={item.id}><b>Kilométrage</b> {km(item.km)} · {item.readingDate} · {fleetLabel(DECLARATION_STATUSES, item.status)}</li>
      ))}
      {(detail.incidents || []).map(item => (
        <li key={item.id}><b>Incident</b> {item.description} · {item.status}</li>
      ))}
      {(detail.comments || []).map(item => (
        <li key={item.id}><b>Note</b> {item.authorName} · {item.body}</li>
      ))}
    </ul>
  );
}

function FleetDriver({ detail, toast, onRefresh }) {
  const vehicle = detail?.vehicle;
  const [kmValue, setKmValue] = useState(vehicle?.currentKm || "");
  const [kmDate, setKmDate] = useState(todayIsoDate());
  const [photo, setPhoto] = useState(null);
  if (!vehicle) return <div className="fleet-driver"><p>Aucun véhicule ne vous est affecté pour le moment.</p></div>;
  return (
    <div className="fleet-driver">
      <article className="fleet-driver-card">
        <Car size={28} />
        <div>
          <p>Votre véhicule</p>
          <h2>{displayPlate(vehicle.plate)}</h2>
          <span>{[vehicle.brand, vehicle.model].filter(Boolean).join(" ")} · {km(vehicle.currentKm)}</span>
        </div>
      </article>
      <VehicleDocumentsBlock detail={detail} caps={{ isDriver: true, canOperate: false }} toast={toast} onRefresh={onRefresh} />
      <section>
        <h3><Clock3 size={16}/>Prochaines échéances</h3>
        <ul>{(detail.upcoming || detail.deadlines || []).filter(item => item.status === "open").map(item => (
          <li key={item.id}>{item.title || fleetLabel(DEADLINE_KINDS, item.kind)} · {formatFrenchDate(item.dueOn) || (item.dueKm ? km(item.dueKm) : "")}</li>
        ))}</ul>
      </section>
      <form className="fleet-driver-form" onSubmit={async event => {
        event.preventDefault();
        try {
          let photoDocumentId = null;
          if (photo) {
            const uploaded = await uploadFleetFile({ vehicleId: vehicle.id, kind: "compteur", file: photo, title: "Photo compteur" });
            photoDocumentId = uploaded.document?.id;
          }
          const result = await jsonFetch("/api/fleet/mileage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: vehicle.id, km: kmValue, readingDate: kmDate, photoDocumentId }) });
          toast?.(result.flags?.low || result.flags?.incoherent ? "Relevé transmis — un contrôle humain est demandé" : "Relevé transmis, en attente de validation");
          onRefresh();
        } catch (error) {
          toast?.(error.message);
        }
      }}>
        <h3><Gauge size={16}/>Transmettre le kilométrage</h3>
        <input type="number" required value={kmValue} onChange={e => setKmValue(e.target.value)} />
        <input type="date" value={kmDate} onChange={e => setKmDate(e.target.value)} />
        <input type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0] || null)} />
        <button className="primary submit" type="submit">Envoyer</button>
      </form>
      <IncidentPanel detail={detail} caps={{ isDriver: true, canOperate: false }} users={[]} toast={toast} onRefresh={onRefresh} />
      <ExpensePanel detail={detail} caps={{ isDriver: true, canOperate: false }} toast={toast} onRefresh={onRefresh} totals={expenseTotals(detail.expenses || [])} />
      <section>
        <h3>Mes déclarations</h3>
        <ul className="fleet-history">
          {(detail.declarations || []).map(item => (
            <li key={`${item.type}-${item.id}`}><b>{item.type}</b> {item.description || km(item.km) || euro(item.amountTtc)} · {fleetLabel(DECLARATION_STATUSES, item.status || item.status)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function VehicleForm({ onClose, toast, onCreated }) {
  const [form, setForm] = useState({
    internalCode: "", plate: "", brand: "", model: "", category: "direction", year: "", energy: "diesel",
    entryDate: todayIsoDate(), holdingMode: "propriete", currentKm: "", notes: "",
  });
  const [kind, setKind] = useState("carte_grise");
  const [expiresOn, setExpiresOn] = useState("");
  const [pending, setPending] = useState([]);
  const [saving, setSaving] = useState(false);
  const presentKinds = new Set(pending.map(item => item.kind));

  function queueFile(file, fromCamera) {
    if (!file) return toast?.("Aucun fichier");
    setPending(current => [...current, {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      expiresOn,
      file,
      title: pendingDocTitle(file, fromCamera, kind),
    }]);
  }

  return (
    <div className="backdrop">
      <div className="modal fleet-sheet">
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        <div className="modal-icon"><Car /></div>
        <h2>Nouveau véhicule</h2>
        <form onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          try {
            const data = await jsonFetch("/api/fleet/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
            const failed = [];
            for (const item of pending) {
              try {
                await uploadFleetFile({
                  vehicleId: data.vehicle.id,
                  kind: item.kind,
                  expiresOn: item.expiresOn,
                  file: item.file,
                  title: item.title,
                });
              } catch {
                failed.push(item.title);
              }
            }
            if (failed.length) toast?.(`Véhicule créé. ${failed.length} document(s) à redéposer sur la fiche.`);
            else toast?.(pending.length ? `Véhicule créé avec ${pending.length} document(s)` : "Véhicule créé");
            onCreated(data.vehicle);
          } catch (error) {
            toast?.(error.message);
          } finally {
            setSaving(false);
          }
        }}>
          <Field label="Immatriculation"><input required value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} /></Field>
          <div className="form-row">
            <Field label="Identifiant interne"><input value={form.internalCode} onChange={e => setForm({ ...form, internalCode: e.target.value })} placeholder="VH-001" /></Field>
            <Field label="Année"><input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="Marque"><input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Modèle"><input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="Catégorie"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{VEHICLE_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field label="Énergie"><select value={form.energy} onChange={e => setForm({ ...form, energy: e.target.value })}>{ENERGY_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          </div>
          <Field label="Mode de détention"><select value={form.holdingMode} onChange={e => setForm({ ...form, holdingMode: e.target.value })}>{HOLDING_MODES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          <Field label="Kilométrage"><input type="number" min="0" value={form.currentKm} onChange={e => setForm({ ...form, currentKm: e.target.value })} placeholder="Compteur actuel" /></Field>
          <div className="fleet-subcard fleet-docs-block">
            <h3>Documents du véhicule</h3>
            <p className="fleet-hint">Photo ou fichier maintenant : carte grise, assurance, contrôle technique, Crit’Air… Ils sont enregistrés en même temps que le véhicule.</p>
            <VehicleDocChips presentKinds={presentKinds} onSelect={setKind} />
            {pending.length ? (
              <div className="fleet-docs-list">
                {pending.map(item => (
                  <div className="data-row" key={item.key}>
                    <b>{item.title}</b>
                    <span>{fleetLabel(DOCUMENT_KINDS, item.kind)}</span>
                    <span>{item.expiresOn || "—"}</span>
                    <button type="button" className="edit-user" onClick={() => setPending(current => current.filter(doc => doc.key !== item.key))}>Retirer</button>
                  </div>
                ))}
              </div>
            ) : <p className="fleet-hint">Aucun document ajouté pour l’instant.</p>}
            <VehicleDocCapture
              kind={kind}
              setKind={setKind}
              expiresOn={expiresOn}
              setExpiresOn={setExpiresOn}
              disabled={saving}
              onPick={queueFile}
            />
          </div>
          <button className="primary submit" type="submit" disabled={saving}>{saving ? "Création…" : "Créer"}</button>
        </form>
      </div>
    </div>
  );
}

function ImportWizard({ onClose, toast, onDone }) {
  const [preview, setPreview] = useState(null);
  const [csv, setCsv] = useState("");
  return (
    <div className="backdrop">
      <div className="modal fleet-sheet">
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        <div className="modal-icon"><FileSpreadsheet /></div>
        <h2>Import du parc</h2>
        <p>CSV ou fichier Excel enregistré en CSV (séparateur ;). Les doublons d’immatriculation sont ignorés.</p>
        <a className="secondary" href="/api/fleet/import">Télécharger le modèle</a>
        <input type="file" accept=".csv,text/csv,.txt" onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setCsv(await file.text());
        }} />
        <button className="secondary" type="button" onClick={async () => {
          const data = await jsonFetch("/api/fleet/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }) });
          setPreview(data.preview);
        }}>Aperçu</button>
        {preview && (
          <>
            <p>{preview.okCount} à créer · {preview.duplicateCount} déjà présents · {preview.errorCount} erreur(s)</p>
            <div className="data-panel">
              {preview.items.map(item => (
                <div className="data-row" key={item.index}>
                  <b>Ligne {item.index}</b>
                  <span>{item.mapped.plate || "—"}</span>
                  <span>{item.duplicate ? "Doublon" : item.ok ? "OK" : item.errors.join(" ")}</span>
                </div>
              ))}
            </div>
            <button className="primary submit" type="button" onClick={async () => {
              const data = await jsonFetch("/api/fleet/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, confirm: true }) });
              toast?.(`${data.created.length} véhicule(s) importé(s)`);
              onDone();
              onClose();
            }}>Valider l’import</button>
          </>
        )}
      </div>
    </div>
  );
}
