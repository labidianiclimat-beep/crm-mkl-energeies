"use client";

import { useEffect, useState } from "react";
import { CalendarDays, FileText, Plus, RefreshCw, Star, Upload, Wrench } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import { addDaysIso, clientForMaintenanceVisit, isFieldMaintenanceTechnician, maintenanceAgendaBoards, maintenanceReportBoards, maintenanceReportHref, maintenanceTtc, mapsSearchUrl, phoneCallHref, placedContractTotals, shiftMonthKey, startOfWeekMonday, visitsOnDay, weekRange } from "../lib/entretien-agenda";
import { maintenanceMachineLabel } from "../lib/maintenance-catalog";
import { loadSharedRecords } from "../lib/use-record-table";
import { entretienSearchMatches, visitPrestation } from "../lib/entretien-tour";
import EntretienTour from "./entretien-tour";
import { canConfirmEntretienImport, isAdminVip } from "../lib/permissions";

function localTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function agendaVisitClass(visit) {
  const kind = visitPrestation(visit);
  return kind === "maintenance" ? "entretien-week-visit" : `entretien-week-visit is-${kind}`;
}

function VisitReach({ visit }) {
  const phones = [visit?.client_phone, visit?.client_phone_alt].map(item => String(item || "").trim()).filter(Boolean);
  const address = String(visit?.client_address || visit?.location || "").trim();
  const maps = visit?.maps_url || mapsSearchUrl(address);
  return (
    <span className="entretien-tech-reach">
      {phones.length
        ? phones.map(phone => <a key={phone} href={phoneCallHref(phone)}>{phone}</a>)
        : <small>Téléphone non renseigné</small>}
      {address && maps
        ? <a href={maps} target="_blank" rel="noopener noreferrer">{address}</a>
        : <small>Adresse à confirmer</small>}
    </span>
  );
}

function TechVisitAction({ visit, technicianName, openReport, openPrevisit }) {
  const kind = visitPrestation(visit);
  if (kind === "maintenance") {
    return <button className="primary" type="button" onClick={() => openReport(maintenanceReportHref(visit, technicianName))}>Remplir le formulaire</button>;
  }
  if (kind === "visite" && visit.client_id) {
    return <button className="primary" type="button" onClick={() => openPrevisit?.(visit)}>Visite technique</button>;
  }
  const label = kind === "installation" ? "Installation" : kind === "visite" ? "Visite technique" : "Dépannage";
  return <small className="entretien-tech-kind">{label}</small>;
}

function TechVisitCards({ visits, machineReports, technicianName, openReport, openPrevisit, empty }) {
  if (!visits.length) return <p>{empty}</p>;
  return visits.map(visit => {
    const kind = visitPrestation(visit);
    return (
      <article key={visit.id} className={kind === "maintenance" ? "entretien-tech-card" : `entretien-tech-card is-${kind}`}>
        <b className="entretien-tech-time">{visit.scheduled_start ? new Date(visit.scheduled_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</b>
        <div>
          <b>{visit.title || "Visite"}</b>
          <VisitReach visit={visit} />
          {visit.description ? <small className="entretien-tech-task">{visit.description}</small> : null}
          {maintenanceMachineLabel(visit, machineReports) ? <small className="entretien-tech-machine">{maintenanceMachineLabel(visit, machineReports)}</small> : null}
        </div>
        {<TechVisitAction visit={visit} technicianName={technicianName} openReport={openReport} openPrevisit={openPrevisit} />}
      </article>
    );
  });
}

function ReportBoard({ title, range, rows, total, onPrevious, onNext, onToday, previousLabel, nextLabel, todayLabel, openReport }) {
  return (
    <section>
      <div className="entretien-agenda-toolbar">
        <button className="secondary" type="button" onClick={onPrevious}>{previousLabel}</button>
        <h3>{title}<small>{range}</small></h3>
        <button className="secondary" type="button" onClick={onNext}>{nextLabel}</button>
        <button className="secondary" type="button" onClick={onToday}>{todayLabel}</button>
      </div>
      <p className="entretien-report-total"><b>{euro(total)}</b> prix des contrats sur la période</p>
      <div className="data-panel entretien-report-table">
        <div className="data-row data-head"><span>DATE</span><span>CLIENT</span><span>TECHNICIEN</span><span>CONTRAT</span><span>PRIX DU CONTRAT</span><span></span></div>
        {rows.map((row, index) => (
          <div className="data-row" key={`${row.id || "rapport"}-${row.day}-${index}`}>
            <span>{dayLabel(row.day)}</span>
            <b>{row.client || "Client non indiqué"}</b>
            <span>{row.technician || "—"}</span>
            <span>{row.contract || "—"}</span>
            <b>{Number.isFinite(row.amount) ? euro(row.amount) : "—"}</b>
            <span>{row.id ? <button className="secondary" type="button" onClick={() => openReport(`/maintenance-form?id=${encodeURIComponent(row.id)}&client=${encodeURIComponent(row.client)}&contract=${encodeURIComponent(row.contract)}&date=${encodeURIComponent(row.day)}&technician=${encodeURIComponent(row.technician)}`)}>Ouvrir</button> : null}</span>
          </div>
        ))}
        {!rows.length && <p className="quote-empty">Aucun rapport enregistré sur cette période.</p>}
      </div>
    </section>
  );
}

function dayLabel(value) {
  const day = String(value || "").slice(0, 10);
  if (!day) return "—";
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR");
}

function EntretienStars({ count = 0, samples = [], loading = false, onToggle, open = false }) {
  const n = Number(count || 0);
  const filled = Math.min(10, n);
  return (
    <span className={`entretien-stars-wrap${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="entretien-stars"
        title={n ? `${n} entretien${n > 1 ? "s" : ""} — cliquer pour voir les titres` : "Aucun rendez-vous d’agenda avec ce nom"}
        onClick={onToggle}
      >
        <span className="entretien-stars-bar" style={{ "--star-fill": `${filled * 10}%` }} aria-hidden="true" />
        <small>{n}</small>
      </button>
      {open && (
        <div className="entretien-visit-samples">
          {loading ? <small>Chargement…</small> : samples.length ? samples.map((item, index) => (
            <small key={item.id || index}>
              {item.title || "Sans titre"}
              {item.location ? ` • ${item.location}` : ""}
              {item.scheduled_start ? ` • ${new Date(item.scheduled_start).toLocaleDateString("fr-FR")}` : ""}
            </small>
          )) : <small>Aucun rendez-vous d’agenda avec ce nom exact.</small>}
        </div>
      )}
    </span>
  );
}

const euro = value => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

export default function EntretienModule({
  contracts = [],
  setContracts,
  clients = [],
  setBilling,
  query = "",
  onAdd,
  onOpenReport,
  onOpenPrevisit,
  toast,
  currentProfile,
  team = [],
}) {
  function openReport(href) {
    if (!onOpenReport) {
      window.location.assign(href);
      return;
    }
    const params = new URLSearchParams(String(href).split("?")[1] || "");
    const preset = Object.fromEntries(params.entries());
    const client = clientForMaintenanceVisit({
      title: preset.client,
      client_id: preset.clientId,
      location: preset.address,
    }, clients);
    if (client?.id) preset.clientId = String(client.id);
    if (client?.name) preset.client = client.name;
    onOpenReport(preset, client);
  }
  const [tab, setTab] = useState("tournee");
  const [data, setData] = useState(null);
  const [sqlRequired, setSqlRequired] = useState(false);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);
  const [filesPayload, setFilesPayload] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [invoicePayload, setInvoicePayload] = useState(null);
  const [contractQuery, setContractQuery] = useState("");
  const [openStars, setOpenStars] = useState("");
  const [starSamples, setStarSamples] = useState({});
  const [starLoading, setStarLoading] = useState("");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekMonday());
  const [dayCursor, setDayCursor] = useState(() => localTodayIso());
  const [technicians, setTechnicians] = useState([]);
  const [agendaVisits, setAgendaVisits] = useState([]);
  const [techFilter, setTechFilter] = useState("");
  const [agendaDraft, setAgendaDraft] = useState(null);
  const canImport = canConfirmEntretienImport(currentProfile);
  const showPlacedTotals = isAdminVip(currentProfile?.role);
  const placed = placedContractTotals(data?.contracts || []);
  const fieldTech = isFieldMaintenanceTechnician(currentProfile?.role);
  const technicianName = currentProfile?.full_name || currentProfile?.name || currentProfile?.email || "";
  function openTechnicalVisit(visit) {
    onOpenPrevisit?.({ ...visit, technicianName });
  }
  const [machineReports, setMachineReports] = useState([]);
  const [officeReports, setOfficeReports] = useState([]);
  const [reportWeek, setReportWeek] = useState(() => startOfWeekMonday());
  const [reportMonth, setReportMonth] = useState(() => localTodayIso().slice(0, 7));

  useEffect(() => {
    if (fieldTech) return undefined;
    let cancelled = false;
    function loadReports() {
      loadSharedRecords("mkl-maintenance-reports")
        .then(rows => { if (!cancelled) setOfficeReports(Array.isArray(rows) ? rows : []); })
        .catch(() => {});
    }
    loadReports();
    window.addEventListener("mkl-maintenance-report-saved", loadReports);
    return () => {
      cancelled = true;
      window.removeEventListener("mkl-maintenance-report-saved", loadReports);
    };
  }, [fieldTech]);

  useEffect(() => {
    if (!fieldTech) return undefined;
    let cancelled = false;
    function loadMachines() {
      loadSharedRecords("mkl-maintenance-reports")
        .then(rows => { if (!cancelled) setMachineReports(Array.isArray(rows) ? rows : []); })
        .catch(() => {});
    }
    loadMachines();
    window.addEventListener("mkl-maintenance-report-saved", loadMachines);
    return () => {
      cancelled = true;
      window.removeEventListener("mkl-maintenance-report-saved", loadMachines);
    };
  }, [fieldTech]);

  async function loadAgenda(anchor = weekAnchor) {
    const range = weekRange(anchor);
    let from = range.start;
    let to = range.end;
    if (fieldTech) {
      const todayStart = startOfWeekMonday(localTodayIso());
      const todayEnd = addDaysIso(todayStart, 7);
      if (todayStart < from) from = todayStart;
      if (todayEnd > to) to = todayEnd;
    }
    try {
      const response = await authFetch(`/api/entretien/visits?from=${from}&to=${to}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Agenda CRM impossible");
      setAgendaVisits(payload.visits || []);
      setTechnicians(payload.technicians || []);
    } catch (error) {
      toast?.(String(error?.message || "Agenda CRM indisponible"));
    }
  }

  async function loadPilotage({ fresh = false } = {}) {
    setBusy("pilotage");
    try {
      const response = await authFetch(`/api/entretien/pilotage${fresh ? "?fresh=1" : ""}`, fresh ? { cache: "no-store" } : {});
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503 && payload.sqlRequired) {
        setSqlRequired(true);
        setData(null);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Chargement impossible");
      setSqlRequired(false);
      setData(payload);
      try { sessionStorage.setItem("mkl-entretien-pilotage", JSON.stringify(payload)); } catch { /* quota */ }
    } catch (error) {
      toast?.(String(error?.message || "Pilotage indisponible"));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (fieldTech) return;
    try {
      const cached = JSON.parse(sessionStorage.getItem("mkl-entretien-pilotage") || "null");
      if (cached?.ok && Array.isArray(cached.contracts)) setData(cached);
    } catch { /* ignore */ }
    loadPilotage();
  }, [fieldTech]);

  useEffect(() => {
    if (fieldTech || tab === "agenda") loadAgenda();
  }, [tab, weekAnchor, fieldTech]);

  function contractSearchHay(row) {
    return `${row.client_name || ""} ${row.number || ""} ${row.client_city || ""} ${row.client_postal || ""} ${row.contract_number || ""}`.toLowerCase();
  }

  const paper = contracts.filter(contract => {
    const hay = Object.values(contract).join(" ");
    return entretienSearchMatches(hay, query) && entretienSearchMatches(hay, contractQuery);
  });
  const contractFilter = String(contractQuery || query || "").toLowerCase().trim();
  const importedAll = (data?.contracts || [])
    .filter(row => !contractFilter || entretienSearchMatches(contractSearchHay(row), contractFilter))
    .sort((a, b) => String(a.client_name || "").localeCompare(String(b.client_name || ""), "fr"));
  const importedCap = contractFilter.length >= 2 ? 200 : 80;
  const imported = importedAll.slice(0, importedCap);

  async function toggleStars(contract) {
    const id = contract.import_key || contract.id;
    const clientId = contract.client_id;
    setOpenStars(current => current === id ? "" : id);
    if (openStars === id || !clientId || starSamples[clientId]) return;
    setStarLoading(clientId);
    try {
      const response = await authFetch(`/api/entretien/visits?clientId=${encodeURIComponent(clientId)}&samples=1`);
      const payload = await response.json().catch(() => ({}));
      setStarSamples(current => ({ ...current, [clientId]: payload.visits || [] }));
    } catch {
      setStarSamples(current => ({ ...current, [clientId]: [] }));
    } finally {
      setStarLoading("");
    }
  }

  async function complete(contract) {
    const client = clients.find(item => (contract.clientId && String(item.id) === String(contract.clientId)) || item.name === contract.client);
    if (!client?.email) return toast("Renseignez d’abord l’adresse email du client");
    if (!client?.id || !String(client.id).includes("-")) return toast("Le client doit être enregistré en base pour générer la pro forma.");
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    try {
      const response = await authFetch("/api/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "Pro forma",
          clientId: client.id,
          client: client.name || contract.client,
          status: "Envoyée",
          date: today,
          due,
          tax: 20,
          label: contract.type,
          items: [{ name: contract.type, qty: 1, unit: Number(contract.amount) }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Création de la pro forma impossible");
      setBilling?.(current => [payload.document, ...current.filter(item => item.id !== payload.document.id)]);
      setContracts?.(current => current.map(item => item.id === contract.id ? { ...item, status: "Entretien terminé — réglé" } : item));
      toast("Pro forma générée");
    } catch (error) {
      toast(String(error?.message || "Création de la pro forma impossible"));
    }
  }

  async function encodeFormFiles(form) {
    const yildiz = form?.yildiz?.files?.[0] ? await fileToBase64(form.yildiz.files[0]) : "";
    const rebecca = form?.rebecca?.files?.[0] ? await fileToBase64(form.rebecca.files[0]) : "";
    return { yildiz, rebecca };
  }

  async function encodeInvoiceFiles(form) {
    const selected = [...(form?.invoices?.files || [])];
    const invoices = [];
    for (const file of selected) invoices.push(await fileToBase64(file));
    return invoices;
  }

  async function runPreview(form) {
    setBusy("preview");
    try {
      const files = await encodeFormFiles(form);
      setFilesPayload(files);
      const response = await authFetch("/api/entretien/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(files),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Aperçu impossible");
      setPreview(payload);
      toast(`${payload.counts?.total || 0} fiches en aperçu — rien n’est écrit en base.`);
    } catch (error) {
      toast(String(error?.message || "Aperçu impossible"));
    } finally {
      setBusy("");
    }
  }

  async function confirmImport(form) {
    if (!preview) return toast("Lancez d’abord l’aperçu.");
    if (!canImport) return toast("Quittez la vue d’un autre rôle, ou connectez-vous en administrateur / direction.");
    if (data?.counts?.stockLocked) return toast("La base entretien est figée en Supabase. Pas de nouvel import.");
    if (!window.confirm("Valider l’import ? Les montants Excel restent des factures historiques, sans nouveau FAC-.")) return;
    setBusy("import");
    try {
      const files = filesPayload || await encodeFormFiles(form);
      const response = await authFetch("/api/entretien/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...files, confirm: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Import impossible");
      toast(`Import : ${payload.created || 0} créés, ${payload.linked || 0} liés, ${payload.review || 0} à relire.`);
      await loadPilotage({ fresh: true });
    } catch (error) {
      toast(String(error?.message || "Import impossible"));
    } finally {
      setBusy("");
    }
  }

  async function runInvoicePreview(form) {
    setBusy("preview");
    try {
      const invoices = await encodeInvoiceFiles(form);
      if (!invoices.length) return toast("Choisissez au moins un fichier de factures.");
      setInvoicePayload(invoices);
      const response = await authFetch("/api/entretien/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Aperçu impossible");
      setInvoicePreview(payload.invoices || null);
      const counts = payload.invoices?.counts || {};
      toast(`${counts.total || 0} factures d’entretien en aperçu — rien n’est écrit.`);
    } catch (error) {
      toast(String(error?.message || "Aperçu impossible"));
    } finally {
      setBusy("");
    }
  }

  async function confirmInvoiceImport() {
    if (!invoicePreview) return toast("Lancez d’abord l’aperçu des factures.");
    if (!canImport) return toast("Quittez la vue d’un autre rôle, ou connectez-vous en administrateur / direction.");
    const counts = invoicePreview.counts || {};
    if (!window.confirm(`Intégrer ${counts.total || 0} factures d’entretien ? Les clients absents sont créés, les fiches déjà là ne sont complétées que si un champ est vide, et la date de facture devient une intervention. Les contrats déjà travaillés ne sont pas réécrits.`)) return;
    setBusy("import");
    try {
      const response = await authFetch("/api/entretien/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: invoicePayload || [], confirmInvoices: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Import impossible");
      toast(`Factures : ${payload.created || 0} clients créés, ${payload.linked || 0} déjà présents, ${payload.interventions || 0} interventions, ${payload.review || 0} à relire.`);
      setInvoicePreview(null);
      await loadPilotage({ fresh: true });
    } catch (error) {
      toast(String(error?.message || "Import impossible"));
    } finally {
      setBusy("");
    }
  }

  async function reviewVisit(visit, patch) {
    const response = await authFetch("/api/entretien/visits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: visit.id, ...patch }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Revue impossible");
    await loadPilotage({ fresh: true });
    if (tab === "agenda") await loadAgenda();
  }

  function visitDay(visit) {
    return String(visit?.scheduled_start || "").slice(0, 10);
  }

  async function confirmVisitDone(visit) {
    const date = visitDay(visit);
    if (!date) return toast("Ce rendez-vous n’a pas de date dans l’agenda.");
    if (!visit.client_id) return toast("Le client n’est pas rapproché. Classez d’abord l’entretien.");
    try {
      await reviewVisit(visit, {
        natureValidated: "entretien",
        clientId: visit.client_id,
        realizationStatus: "confirme",
        realizationDate: date,
        realizationBasis: "revue_humaine",
        realizationNote: "Date confirmée dans l’agenda CRM.",
      });
    } catch (error) {
      toast(String(error?.message || "Confirmation impossible"));
    }
  }

  function planPaper(contract) {
    const client = clients.find(item => (
      (contract.clientId && String(item.id) === String(contract.clientId))
      || item.name === contract.client
    ));
    if (!client?.id || !String(client.id).includes("-")) {
      toast("Le client doit être enregistré en base pour placer l’entretien.");
      return;
    }
    planContract({
      client_id: client.id,
      id: "",
      client_name: client.name || contract.client,
      client_address: client.address,
      client_postal: client.postalCode,
      client_city: client.city,
      createContract: true,
    });
  }

  function planContract(contract) {
    setAgendaDraft({
      clientId: contract.client_id,
      contractId: contract.id,
      clientQuery: contract.client_name || "",
      createContract: Boolean(contract.createContract),
      title: `Entretien ${contract.client_name || ""}`.trim(),
      location: [contract.client_address, contract.client_postal, contract.client_city].filter(Boolean).join(" "),
      day: addDaysIso(new Date().toISOString().slice(0, 10), 1),
      time: "09:00",
      durationMinutes: 60,
      technicianId: techFilter || "",
    });
    setTab("agenda");
  }

  async function submitAgendaDraft(event) {
    event.preventDefault();
    if (!agendaDraft?.day || !agendaDraft?.time) return toast("Indiquez le jour et l’heure.");
    setBusy("agenda");
    try {
      const response = await authFetch("/api/entretien/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agendaDraft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Planification impossible");
      toast(payload.contractCreated ? "Visite créée et contrat d’entretien ouvert." : "Visite créée dans l’agenda CRM.");
      setAgendaDraft(null);
      setWeekAnchor(startOfWeekMonday(agendaDraft.day));
      await loadPilotage({ fresh: true });
    } catch (error) {
      toast(String(error?.message || "Planification impossible"));
    } finally {
      setBusy("");
    }
  }

  async function assignVisit(visit, technicianId) {
    try {
      await reviewVisit(visit, { technicianId });
      toast("Technicien assigné dans le CRM.");
    } catch (error) {
      toast(String(error?.message || "Assignation impossible"));
    }
  }

  const week = weekRange(weekAnchor);
  const agendaBoards = maintenanceAgendaBoards(technicians, techFilter);
  const reportBoards = maintenanceReportBoards(officeReports, [...(data?.contracts || []), ...contracts], {
    weekStart: reportWeek,
    month: reportMonth,
  });
  const unassignedVisits = techFilter ? [] : agendaVisits.filter(visit => !visit.technician_id);

  function openTechDay(day) {
    const next = String(day || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    setDayCursor(next);
    setWeekAnchor(startOfWeekMonday(next));
  }

  if (fieldTech) {
    const today = localTodayIso();
    const todayVisits = visitsOnDay(agendaVisits, today);
    const cursorVisits = visitsOnDay(agendaVisits, dayCursor);
    const cursorLabel = new Date(`${dayCursor}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return (
      <div className="fleet-module entretien-module entretien-tech">
        <div className="module-top">
          <div>
            <small>SERVICE APRÈS-VENTE</small>
            <h2>Mon agenda</h2>
            <p>Le programme du jour s’affiche tout de suite. Faites défiler les jours pour voir demain et les suivants.</p>
          </div>
        </div>
        <section className="entretien-tech-today">
          <h3>Aujourd’hui</h3>
          <TechVisitCards visits={todayVisits} machineReports={machineReports} technicianName={technicianName} openReport={openReport} openPrevisit={openTechnicalVisit} empty="Aucune visite aujourd’hui." />
        </section>
        <section className="entretien-tech-day" aria-label="Programme jour par jour">
          <div className="entretien-agenda-toolbar">
            <button className="secondary" type="button" onClick={() => openTechDay(addDaysIso(dayCursor, -1))}>Jour précédent</button>
            <b>{cursorLabel}</b>
            <button className="secondary" type="button" onClick={() => openTechDay(addDaysIso(dayCursor, 1))}>Jour suivant</button>
            {dayCursor !== today && (
              <button className="secondary" type="button" onClick={() => openTechDay(today)}>Aujourd’hui</button>
            )}
          </div>
          <div className="entretien-tech-daystrip">
            {week.days.map(day => (
              <button key={day} type="button" className={day === dayCursor ? "is-selected" : day === today ? "is-today" : ""} onClick={() => openTechDay(day)}>
                <small>{new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" })}</small>
                <b>{new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric" })}</b>
              </button>
            ))}
          </div>
          {dayCursor !== today && (
            <TechVisitCards visits={cursorVisits} machineReports={machineReports} technicianName={technicianName} openReport={openReport} openPrevisit={openTechnicalVisit} empty="Aucune visite ce jour." />
          )}
        </section>
        <div className="entretien-agenda-toolbar">
          <button className="secondary" type="button" onClick={() => openTechDay(addDaysIso(week.start, -7))}>Semaine précédente</button>
          <b>{new Date(`${week.start}T12:00:00`).toLocaleDateString("fr-FR")} → {new Date(`${addDaysIso(week.end, -1)}T12:00:00`).toLocaleDateString("fr-FR")}</b>
          <button className="secondary" type="button" onClick={() => openTechDay(addDaysIso(week.start, 7))}>Semaine suivante</button>
          {week.start !== startOfWeekMonday() && (
            <button className="secondary" type="button" onClick={() => openTechDay(today)}>Cette semaine</button>
          )}
        </div>
        <div className="entretien-week">
          {week.days.map(day => (
            <section key={day} className={[day === today ? "is-today" : "", day === dayCursor ? "is-focus" : ""].filter(Boolean).join(" ")}>
              <h3>
                <button type="button" onClick={() => openTechDay(day)}>
                  {new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                </button>
              </h3>
              {visitsOnDay(agendaVisits, day).map(visit => (
                <article key={visit.id} className={agendaVisitClass(visit)}>
                  <b className="entretien-tech-time">{visit.scheduled_start ? new Date(visit.scheduled_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</b>
                  <b>{visit.title || "Visite"}</b>
                  <VisitReach visit={visit} />
                  {visit.description ? <small className="entretien-tech-task">{visit.description}</small> : null}
                  {maintenanceMachineLabel(visit, machineReports) ? <small className="entretien-tech-machine">{maintenanceMachineLabel(visit, machineReports)}</small> : null}
                  <TechVisitAction visit={visit} technicianName={technicianName} openReport={openReport} openPrevisit={openTechnicalVisit} />
                </article>
              ))}
              {!visitsOnDay(agendaVisits, day).length && <small className="entretien-tech-free">Libre</small>}
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fleet-module entretien-module">
      <div className="module-top">
        <div>
          <small>SERVICE APRÈS-VENTE</small>
          <h2>Contrats d’entretien</h2>
          <p>{data?.counts?.contracts || 0} contrats en base • agendas techniciens dans le CRM • {data?.counts?.review || 0} RDV à classer • {contracts.length} contrats papier</p>
        </div>
        <div className="module-actions">
          <button className="secondary maintenance-form-action" type="button" onClick={() => openReport("/maintenance-form")}><Wrench size={17}/>Nouveau rapport de maintenance</button>
          <button className="primary" type="button" onClick={onAdd}><Plus size={17}/>Nouveau contrat</button>
        </div>
      </div>
      {sqlRequired && (
        <p className="quote-empty">Collez d’abord <code>20260932_entretien.sql</code> dans Supabase. L’écran papier ci-dessous reste utilisable.</p>
      )}
      <div className="fleet-tabs" role="tablist">
        {[["tournee", "Tournée"], ["contrats", "Contrats"], ["rapports", "Rapports"], ["agenda", "Agendas CRM"], ["pilotage", "Pilotage"], ["import", "Import"]].map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "rapports" && (
        <section className="entretien-report-boards" aria-label="Rapports de maintenance">
          <ReportBoard
            title="Rapports de la semaine"
            range={`Du ${dayLabel(reportBoards.week.start)} au ${dayLabel(reportBoards.week.end)}`}
            rows={reportBoards.week.rows}
            total={reportBoards.week.total}
            onPrevious={() => setReportWeek(addDaysIso(reportWeek, -7))}
            onNext={() => setReportWeek(addDaysIso(reportWeek, 7))}
            onToday={() => setReportWeek(startOfWeekMonday())}
            previousLabel="Semaine précédente"
            nextLabel="Semaine suivante"
            todayLabel="Cette semaine"
            openReport={openReport}
          />
          <ReportBoard
            title="Rapports du mois"
            range={new Date(`${reportBoards.month.key}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            rows={reportBoards.month.rows}
            total={reportBoards.month.total}
            onPrevious={() => setReportMonth(shiftMonthKey(reportMonth, -1))}
            onNext={() => setReportMonth(shiftMonthKey(reportMonth, 1))}
            onToday={() => setReportMonth(localTodayIso().slice(0, 7))}
            previousLabel="Mois précédent"
            nextLabel="Mois suivant"
            todayLabel="Ce mois"
            openReport={openReport}
          />
          <p>Chaque ligne est un rapport enregistré. Le prix est celui du contrat relié, compté une fois si plusieurs rapports portent le même contrat. Ce total n’est pas un encaissement.</p>
        </section>
      )}
      {tab === "tournee" && (
        <EntretienTour team={team} clients={clients} toast={toast} onPlanned={() => { loadAgenda(); loadPilotage({ fresh: true }); }} />
      )}
      {busy === "pilotage" && !data && <p>Chargement des contrats d’entretien…</p>}

      {tab === "pilotage" && showPlacedTotals && (
        <section className="entretien-placed" aria-label="Contrats placés">
          <h3>Contrats placés</h3>
          <div className="mini-kpis entretien-placed-kpis">
            <div><span><b>{euro(placed.day)} HT</b><em>{euro(maintenanceTtc(placed.day))} TTC</em>Aujourd’hui<small>{placed.dayCount} contrat{placed.dayCount === 1 ? "" : "s"}</small></span></div>
            <div><span><b>{euro(placed.week)} HT</b><em>{euro(maintenanceTtc(placed.week))} TTC</em>Cette semaine<small>{placed.weekCount} contrat{placed.weekCount === 1 ? "" : "s"}</small></span></div>
            <div><span><b>{euro(placed.month)} HT</b><em>{euro(maintenanceTtc(placed.month))} TTC</em>Ce mois<small>{placed.monthCount} contrat{placed.monthCount === 1 ? "" : "s"}</small></span></div>
          </div>
          <p>Total selon la date de souscription. HT enregistré, TTC avec TVA 10 %.</p>
        </section>
      )}

      {tab === "pilotage" && (
        <div className="entretien-queues">
          <section>
            <h3>Retard confirmé <b>{data?.counts?.overdue || 0}</b></h3>
            <small>Clients des fichiers dont un entretien a déjà été confirmé à la main, et dont la prochaine visite est dépassée. Reste à 0 tant que personne n’a cliqué « Fait ce jour ».</small>
            {(data?.overdue || []).map(row => (
              <p key={row.client_id}><b>{row.client_name || row.client_id}</b><small>Dernier : {row.last_confirmed_entretien_on || "—"} • dû {row.next_due_on || "—"}</small></p>
            ))}
            {!data?.overdue?.length && <small>Aucun retard confirmé pour l’instant.</small>}
          </section>
          <section>
            <h3>Dernier entretien inconnu <b>{data?.counts?.unknown || 0}</b></h3>
            <small>{data?.counts?.unknown || 0} <b>clients</b> des fichiers. Aucune date n’a encore été confirmée, donc presque tout le stock Excel est ici. {data?.unknown?.length || 0} noms affichés.</small>
            {(data?.unknown || []).map(row => (
              <p key={row.client_id}><small>{row.client_name || row.client_id}</small></p>
            ))}
            {(data?.counts?.unknown || 0) > (data?.unknown || []).length && <small>Le reste des {(data.counts.unknown - (data.unknown?.length || 0))} clients a le même statut : date inconnue. Cherchez-les dans Contrats.</small>}
            {!data?.unknown?.length && <small>Pas de file « inconnu » pour l’instant.</small>}
          </section>
          <section>
            <h3>À vérifier <b>{data?.counts?.review || 0}</b></h3>
            <small>
              {data?.counts?.review || 0} <b>clients</b> des fichiers, un rendez-vous à classer chacun (le plus récent déjà passé).
              {" "}Les {data?.counts?.reviewVisits || 0} rendez-vous d’agenda au total restent dans les étoiles des contrats (plusieurs années pour le même client).
              {" "}Contrôle : {data?.counts?.starClients || 0} clients ont des visites agenda dans Contrats
              {Number(data?.counts?.starClients || 0) === Number(data?.counts?.review || 0) ? " — les deux chiffres se recoupent." : "."}
              {" "}{(data?.review || []).length} RDV affichés ici.
            </small>
            {(data?.review || []).map(item => (
              <div key={`${item.kind}-${item.id}`} className="entretien-review">
                <b>{item.client_name || "Client importé"}</b>
                <small>
                  {item.from_import ? "Oui, client des fichiers importés" : "Pas dans les fichiers"}
                  {item.contract_number ? ` • contrat n° ${item.contract_number}` : " • contrat Excel sans n°"}
                  {item.client_postal || item.client_city ? ` • ${item.client_postal} ${item.client_city}`.trim() : ""}
                </small>
                <small>Agenda : {item.title || "Sans titre"}{item.location ? ` • ${item.location}` : ""} • {item.scheduled_start ? new Date(item.scheduled_start).toLocaleDateString("fr-FR") : "—"}</small>
                {item.kind === "visit" && (
                  <span>
                    <button type="button" disabled={Boolean(busy)} onClick={() => confirmVisitDone(item)}>Fait le {visitDay(item) ? new Date(`${visitDay(item)}T12:00:00`).toLocaleDateString("fr-FR") : "jour du RDV"}</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => reviewVisit(item, { natureValidated: "entretien", clientId: item.client_id }).catch(error => toast(String(error?.message || "Revue impossible")))}>Entretien / maintenance, date inconnue</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => reviewVisit(item, { natureStatus: "ecarte" }).catch(error => toast(String(error?.message || "Revue impossible")))}>Pas un entretien / maintenance</button>
                  </span>
                )}
              </div>
            ))}
            {!data?.review?.length && <small>Aucun RDV déjà lié à un client des fichiers.</small>}
            {(data?.counts?.review || 0) > (data?.review || []).length && <small>{data.review.length} premiers RDV affichés sur {data.counts.review}.</small>}
          </section>
          <section className="is-unlisted">
            <h3>Hors liste Excel <b>{data?.counts?.unlisted || 0}</b></h3>
            <small>Entretien / maintenance trouvé dans l’agenda, sans client correspondant aux fichiers importés.</small>
            {(data?.unlisted || []).map(item => (
              <div key={`unlisted-${item.id}`} className="entretien-review">
                <b>{item.title || "Sans titre"}</b>
                <small>{item.location || "sans lieu"} • {item.scheduled_start ? new Date(item.scheduled_start).toLocaleDateString("fr-FR") : "—"}</small>
                <span>
                  <button type="button" disabled={Boolean(busy)} onClick={() => reviewVisit(item, { natureStatus: "ecarte" }).catch(error => toast(String(error?.message || "Revue impossible")))}>Pas un entretien / maintenance</button>
                </span>
              </div>
            ))}
            {!data?.unlisted?.length && <small>Aucun entretien hors fichiers pour l’instant.</small>}
            {(data?.counts?.unlisted || 0) > (data?.unlisted || []).length && <small>{data.unlisted.length} premiers affichés sur {data.counts.unlisted}.</small>}
          </section>
        </div>
      )}

      {tab === "contrats" && (
        <>
          <div className="mini-kpis">
            <div><Wrench/><span><b>{data?.counts?.contracts || 0}</b>contrats importés</span></div>
            <div><Star/><span><b>{data?.counts?.starClients || imported.filter(row => Number(row.visit_count || 0) > 0).length}</b>avec entretiens agenda</span></div>
            <div><CalendarDays/><span><b>{data?.counts?.unlisted || 0}</b>hors liste Excel</span></div>
            <div><RefreshCw/><span><b>{paper.length}</b>contrats papier</span></div>
          </div>
          <label className="entretien-contract-search">
            Rechercher un contrat
            <input value={contractQuery} onChange={event => setContractQuery(event.target.value)} placeholder="Nom, ville, n° de contrat…" />
          </label>
          <p>
            Base figée en Supabase : {data?.counts?.contracts || imported.length} contrats
            {data?.counts?.visitEvents ? ` et ${data.counts.visitEvents} visites d’agenda déjà enregistrées` : ""}.
            {" "}Ouvrir Contrats ou Pilotage lit uniquement la base CRM. Les nouveaux entretiens se planifient dans Agendas CRM.
          </p>
          <div className="data-panel contracts-table entretien-contracts-list">
            <div className="data-row data-head entretien-imported-row"><span>CLIENT / CONTRAT</span><span>ENTRETIENS</span><span>DERNIER ENTRETIEN</span><span>DATE CONTRAT</span><span>MONTANT</span><span>ACTION</span></div>
            {imported.map(contract => (
              <div className="data-row entretien-imported-row" key={contract.import_key || contract.id}>
                <span><b>{contract.client_name}</b><small>{contract.number || "sans n° Excel"}{contract.client_city ? ` • ${contract.client_postal} ${contract.client_city}` : ""}</small></span>
                <EntretienStars
                  count={contract.visit_count}
                  samples={starSamples[contract.client_id] || []}
                  loading={starLoading === contract.client_id}
                  open={openStars === (contract.import_key || contract.id)}
                  onToggle={() => toggleStars(contract)}
                />
                <span><CalendarDays size={13}/>{dayLabel(contract.last_visit_on || contract.last_confirmed_entretien_on)}</span>
                <span>{dayLabel(contract.start_on)}</span>
                <b>{euro(contract.amount)}</b>
                <span>
                  <button className="maintenance-report-link" type="button" onClick={() => openReport(`/maintenance-form?contract=${encodeURIComponent(contract.number || "")}&client=${encodeURIComponent(contract.client_name || "")}&date=${new Date().toISOString().slice(0, 10)}`)}><Wrench size={13}/>Rapport</button>
                  <button className="secondary" type="button" onClick={() => planContract(contract)}>Planifier</button>
                </span>
              </div>
            ))}
            {paper.map(contract => (
              <div className="data-row entretien-imported-row" key={contract.id}>
                <span><b>{contract.client}</b><small>{contract.number}{contract.quoteNumber ? ` • ${contract.quoteNumber}` : ""} • papier</small></span>
                <span><small>—</small></span>
                <span><CalendarDays size={13}/>{contract.next ? new Date(contract.next).toLocaleDateString("fr-FR") : "À programmer"}</span>
                <span>{contract.startDate ? dayLabel(contract.startDate) : "—"}</span>
                <b>{euro(contract.amount)}</b>
                <span>
                  <a className="maintenance-report-link contract-view-link" href={`/maintenance-contract?id=${contract.id}`}><FileText size={13}/>Voir le contrat</a>
                  <button className="secondary" type="button" onClick={() => planPaper(contract)}>Planifier</button>
                  {contract.status !== "Entretien terminé — réglé" && <button className="validate-quote" onClick={() => complete(contract)}>Terminer et régler</button>}
                </span>
              </div>
            ))}
            {importedAll.length > imported.length && (
              <p className="quote-empty">Affichage de {imported.length} sur {importedAll.length} — affinez la recherche pour le reste.</p>
            )}
            {!importedAll.length && !paper.length && <p className="quote-empty">Aucun contrat à afficher.</p>}
          </div>
        </>
      )}

      {tab === "import" && (
        <form className="entretien-import" onSubmit={event => { event.preventDefault(); runPreview(event.currentTarget); }}>
          <p>La liste clients et les visites déjà rapprochées sont en base CRM. Plus aucun lien avec Google Agenda. L’aperçu Excel reste possible ; valider un nouvel import est bloqué tant que la base est figée.</p>
          <label>Excel YILDIZ<input name="yildiz" type="file" accept=".xlsx,.xls" /></label>
          <label>Excel Rebecca<input name="rebecca" type="file" accept=".xlsx,.xls" /></label>
          <div className="module-actions">
            <button className="secondary" type="submit" disabled={Boolean(busy)}><Upload size={16}/>Aperçu</button>
            <button className="primary" type="button" disabled={Boolean(busy) || Boolean(data?.counts?.stockLocked)} onClick={event => confirmImport(event.currentTarget.form)}>Valider l’import</button>
          </div>
          {busy === "import" && <p>Import en cours… environ {preview?.counts?.total || "…"} fiches, ne fermez pas la page.</p>}
          {busy === "preview" && <p>Aperçu en cours…</p>}
          {data?.counts?.stockLocked && <p>Base figée : {data.counts.stockClients} fiches importées. Pas de second import, pas de suppression de ces clients. Pour forcer, il faudrait DEBLOQUER — ce n’est pas un geste du quotidien.</p>}
          {preview && <p>{preview.counts.total} uniques • {preview.counts.created} à créer • {preview.counts.linked} déjà au CRM • {preview.counts.review} à relire • {preview.counts.signed} signés. Rien n’est écrit.</p>}
          {preview?.mappings?.yildiz && <p>YILDIZ ({preview.mappings.yildiz.sheet}) : {Object.keys(preview.mappings.yildiz.columnMap || {}).join(", ") || "colonnes par défaut"}</p>}
          {preview?.mappings?.rebecca && <p>Rebecca ({preview.mappings.rebecca.sheet}) : {Object.keys(preview.mappings.rebecca.columnMap || {}).join(", ") || "colonnes par défaut"}</p>}
          {preview?.items?.length > 0 && (
            <div className="entretien-preview-table">
              {preview.items.slice(0, 12).map(item => (
                <p key={`${item.matchKey}-${item.line}`}><b>{item.displayName}</b> <small>{item.adresse} {item.codePostal} {item.ville} • {item.contractNumber || "sans n°"} • {item.matchStatus}{item.signed === true ? " • signé" : item.signed === false ? " • non signé" : ""}</small></p>
              ))}
            </div>
          )}
        </form>
      )}
      {tab === "import" && (
        <form className="entretien-import" onSubmit={event => { event.preventDefault(); runInvoicePreview(event.currentTarget); }}>
          <p>Factures d’entretien, un ou plusieurs fichiers Excel. Seules les lignes d’entretien sont prises. Les installations, le SAV et les avoirs restent dehors. La date du document devient une intervention. Un client déjà en base n’est pas réécrit : on complète seulement un téléphone, un mail ou une adresse encore vides. Aucun nouveau FAC-.</p>
          <label>Fichiers de factures<input name="invoices" type="file" accept=".xlsx,.xls,.csv" multiple /></label>
          <div className="module-actions">
            <button className="secondary" type="submit" disabled={Boolean(busy)}><Upload size={16}/>Aperçu des factures</button>
            <button className="primary" type="button" disabled={Boolean(busy) || !invoicePreview} onClick={confirmInvoiceImport}>Intégrer les factures</button>
          </div>
          {invoicePreview && (
            <p>{invoicePreview.counts.total} factures d’entretien • {invoicePreview.counts.created} clients à créer • {invoicePreview.counts.linked} déjà au CRM • {invoicePreview.counts.filled} fiches à compléter • {invoicePreview.counts.review} à relire • {invoicePreview.counts.skipped || 0} lignes ignorées (hors entretien).</p>
          )}
          {invoicePreview?.items?.length > 0 && (
            <div className="entretien-preview-table">
              {invoicePreview.items.slice(0, 12).map(item => (
                <p key={`${item.externalNumber}-${item.line}`}><b>{item.displayName}</b> <small>{item.interventionOn} • {item.externalNumber} • {item.matchStatus}{item.fillFields?.length ? ` • complète ${item.fillFields.join(", ")}` : ""}</small></p>
              ))}
            </div>
          )}
        </form>
      )}

      {tab === "agenda" && (
        <div className="entretien-crm-agenda">
          <p>Agendas des techniciens dans le CRM. Planifier un contrat pose un rendez-vous ici.</p>
          <div className="entretien-agenda-toolbar">
            <button className="secondary" type="button" onClick={() => setWeekAnchor(addDaysIso(week.start, -7))}>Semaine précédente</button>
            <b>{new Date(`${week.start}T12:00:00`).toLocaleDateString("fr-FR")} → {new Date(`${addDaysIso(week.end, -1)}T12:00:00`).toLocaleDateString("fr-FR")}</b>
            <button className="secondary" type="button" onClick={() => setWeekAnchor(addDaysIso(week.start, 7))}>Semaine suivante</button>
            <label>
              Technicien
              <select value={techFilter} onChange={event => setTechFilter(event.target.value)}>
                <option value="">Tous les techniciens</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>{tech.name}{tech.role ? ` · ${tech.role}` : ""}</option>
                ))}
              </select>
            </label>
            <button className="primary" type="button" onClick={() => setAgendaDraft({
              clientId: "",
              contractId: "",
              clientQuery: "",
              createContract: false,
              title: "Entretien / maintenance",
              location: "",
              day: week.start,
              time: "09:00",
              durationMinutes: 60,
              technicianId: techFilter || "",
            })}><Plus size={16}/>Nouvelle visite CRM</button>
          </div>
          {!technicians.length && <p>Aucun compte Technicien pour l’instant. Créez-les dans Utilisateurs (rôle Technicien) : chaque personne aura son agenda CRM. En attendant, vous pouvez quand même planifier puis assigner.</p>}
          {agendaDraft && (
            <form className="entretien-agenda-draft" onSubmit={submitAgendaDraft}>
              <b>Planifier dans le CRM</b>
              <label>Titre<input value={agendaDraft.title} onChange={event => setAgendaDraft(current => ({ ...current, title: event.target.value }))} /></label>
              <label>Lieu<input value={agendaDraft.location} onChange={event => setAgendaDraft(current => ({ ...current, location: event.target.value }))} /></label>
              <label>Client en base
                <input
                  value={agendaDraft.clientQuery || ""}
                  placeholder="Nom, prénom ou ville"
                  onChange={event => setAgendaDraft(current => ({ ...current, clientQuery: event.target.value, clientId: "", contractId: "", createContract: false }))}
                />
              </label>
              {(() => {
                const needle = String(agendaDraft.clientQuery || "").trim().toLowerCase();
                const selected = clients.find(item => String(item.id) === String(agendaDraft.clientId));
                const picks = !agendaDraft.clientId && needle.length >= 2
                  ? clients.filter(item => entretienSearchMatches(`${item.civilite || ""} ${item.firstName || ""} ${item.lastName || ""} ${item.name || ""} ${item.company || ""} ${item.city || ""} ${item.postalCode || ""} ${item.address || ""}`, needle)).slice(0, 8)
                  : [];
                const known = (data?.contracts || []).find(row => String(row.client_id) === String(agendaDraft.clientId));
                return <>
                  {!agendaDraft.clientId && needle.length >= 2 && picks.length === 0 && <p className="entretien-client-held">Aucun client en base avec ce nom.</p>}
                  {picks.length > 0 && (
                    <div className="entretien-client-picks">
                      {picks.map(item => (
                        <button key={item.id} type="button" onClick={() => {
                          const contract = (data?.contracts || []).find(row => String(row.client_id) === String(item.id));
                          setAgendaDraft(current => ({
                            ...current,
                            clientId: item.id,
                            contractId: contract?.id || "",
                            clientQuery: item.name || "",
                            createContract: false,
                            title: `Entretien ${item.name || ""}`.trim(),
                            location: [item.address, item.postalCode, item.city].filter(Boolean).join(" "),
                          }));
                        }}>
                          <b>{item.name}</b>
                          <small>{[item.postalCode, item.city].filter(Boolean).join(" ")}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {agendaDraft.clientId && <p className="entretien-client-held">Client retenu : <b>{selected?.name || agendaDraft.clientQuery || "Client"}</b></p>}
                  {agendaDraft.clientId && known && <p className="entretien-client-held">Contrat d’entretien déjà ouvert{known.number ? ` · ${known.number}` : ""}.</p>}
                  {agendaDraft.clientId && !known && (
                    <label className="entretien-contract-ask">Créer un contrat d’entretien ?
                      <select value={agendaDraft.createContract ? "oui" : "non"} onChange={event => setAgendaDraft(current => ({ ...current, createContract: event.target.value === "oui" }))}>
                        <option value="oui">Oui</option>
                        <option value="non">Non</option>
                      </select>
                      <small>Oui : il entre dans la tournée téléphonique. Non : seule la visite est posée.</small>
                    </label>
                  )}
                </>;
              })()}
              <div className="form-row">
                <label>Jour<input type="date" value={agendaDraft.day} onChange={event => setAgendaDraft(current => ({ ...current, day: event.target.value }))} /></label>
                <label>Heure<input type="time" value={agendaDraft.time} onChange={event => setAgendaDraft(current => ({ ...current, time: event.target.value }))} /></label>
                <label>Durée (min)
                  <select value={agendaDraft.durationMinutes} onChange={event => setAgendaDraft(current => ({ ...current, durationMinutes: Number(event.target.value) }))}>
                    <option value={60}>60</option>
                    <option value={90}>90</option>
                    <option value={120}>120</option>
                  </select>
                </label>
                <label>Technicien
                  <select value={agendaDraft.technicianId} onChange={event => setAgendaDraft(current => ({ ...current, technicianId: event.target.value }))}>
                    <option value="">À assigner</option>
                    {technicians.map(tech => (
                      <option key={tech.id} value={tech.id}>{tech.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="module-actions">
                <button className="primary" type="submit" disabled={Boolean(busy)}>Enregistrer dans le CRM</button>
                <button className="secondary" type="button" onClick={() => setAgendaDraft(null)}>Annuler</button>
              </div>
            </form>
          )}
          {agendaBoards.map(tech => (
            <section key={tech.id} className="entretien-tech-board">
              <h3>{tech.name}</h3>
              <div className="entretien-week">
                {week.days.map(day => {
                  const dayVisits = visitsOnDay(agendaVisits.filter(visit => String(visit.technician_id || "") === String(tech.id)), day);
                  return (
                    <section key={day}>
                      <h3>{new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</h3>
                      {dayVisits.map(visit => (
                        <article key={visit.id} className={agendaVisitClass(visit)}>
                          <b>{visit.title || "Sans titre"}</b>
                          <small>{visit.scheduled_start ? new Date(visit.scheduled_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</small>
                          <VisitReach visit={visit} />
                          <select value={visit.technician_id || ""} onChange={event => assignVisit(visit, event.target.value)}>
                            <option value="">À assigner</option>
                            {technicians.map(person => (
                              <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                          </select>
                          {visit.client_id && visitPrestation(visit) === "maintenance" && <button type="button" disabled={Boolean(busy)} onClick={() => confirmVisitDone(visit)}>Fait ce jour</button>}
                        </article>
                      ))}
                      {!dayVisits.length && <small>Libre</small>}
                    </section>
                  );
                })}
              </div>
            </section>
          ))}
          {unassignedVisits.length > 0 && (
            <section className="entretien-tech-board">
              <h3>À assigner</h3>
              <div className="entretien-week">
                {week.days.map(day => {
                  const dayVisits = visitsOnDay(unassignedVisits, day);
                  return (
                    <section key={day}>
                      <h3>{new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</h3>
                      {dayVisits.map(visit => (
                        <article key={visit.id} className={agendaVisitClass(visit)}>
                          <b>{visit.title || "Sans titre"}</b>
                          <small>{visit.scheduled_start ? new Date(visit.scheduled_start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</small>
                          <VisitReach visit={visit} />
                          <select value="" onChange={event => assignVisit(visit, event.target.value)}>
                            <option value="">À assigner</option>
                            {technicians.map(person => (
                              <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                          </select>
                        </article>
                      ))}
                      {!dayVisits.length && <small>Libre</small>}
                    </section>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

