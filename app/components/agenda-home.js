"use client";

import {
  agendaEventTone,
  agendaHomeMetrics,
  formatAgendaDay,
  formatAgendaTime,
  groupUpcomingAgenda,
  isOverdue,
  normalizeActionKind,
  parseAgendaDate,
} from "../lib/agenda";
import { Phone, CalendarDays, CheckCircle2, Clock3, Eye, AlertTriangle } from "lucide-react";
import { ClientPhoneLink } from "./address-call-notice";

function welcomeRows(appointments = []) {
  const now = new Date();
  const groups = groupUpcomingAgenda(appointments, now);
  const seen = new Set();
  const labeled = [];
  function push(item, bucket) {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    labeled.push({ ...item, bucket });
  }
  groups.overdue.forEach(item => push(item, "En retard"));
  groups.today.forEach(item => push(item, "Aujourd’hui"));
  groups.tomorrow.forEach(item => push(item, "Demain"));
  groups.week.forEach(item => push(item, "Cette semaine"));
  groups.upcoming.forEach(item => {
    const start = parseAgendaDate(item.start);
    push(item, start ? formatAgendaDay(item.start) : "À venir");
  });
  return labeled.slice(0, 20);
}

function AppointmentNoticeList({ rows, onNavigate, onUpdate, toast, onClose, canEdit = true }) {
  async function act(item, changes, message) {
    try {
      await onUpdate?.(item, changes);
      toast?.(message);
    } catch (error) {
      toast?.(String(error?.message || "Mise à jour impossible"));
    }
  }
  return <div className="agenda-home-list">
    {rows.map(item => {
      const phone = item.phone || "";
      const reminder = normalizeActionKind(item.kind) === "rappel";
      const doneStatus = reminder ? "Rappel effectué" : "Réalisé";
      return <article className={`agenda-home-row tone-${agendaEventTone(item)} ${isOverdue(item) ? "late" : ""}`} key={item.id}>
        <div className="agenda-home-when">
          <small>{item.bucket}</small>
          <b>{formatAgendaTime(item.start) || "—"}</b>
          <span>{formatAgendaDay(item.start)}</span>
        </div>
        <div className="agenda-home-who">
          <em className={reminder ? "kind-reminder" : "kind-visit"}>{reminder ? "Rappel" : "Rendez-vous"}</em>
          <b>{item.prospectName}</b>
          <span>{item.subject || item.appointmentType || (reminder ? "Rappel téléphonique" : "Visite commerciale")}</span>
          <small>{item.address || item.city || phone || "—"} · {item.status}</small>
        </div>
        <div className="agenda-home-actions">
          <button type="button" onClick={() => { onNavigate?.("Prospects"); onClose?.(); }} title="Voir la fiche"><Eye size={14}/>Fiche</button>
          {phone && (
            <ClientPhoneLink
              phone={phone}
              person={{ address: item.address || "", postalCode: item.postalCode || "", city: item.city || "" }}
              onComplete={() => { onNavigate?.("Prospects"); onClose?.(); }}
            ><Phone size={14}/>Appeler</ClientPhoneLink>
          )}
          {canEdit && <button type="button" onClick={() => act(item, { status: doneStatus }, "Action marquée comme effectuée")}><CheckCircle2 size={14}/>Terminé</button>}
        </div>
      </article>;
    })}
  </div>;
}

export default function AgendaHomeBlock({
  appointments = [],
  onNavigate,
  onUpdate,
  toast,
  canEdit = true,
}) {
  const rows = welcomeRows(appointments);
  const metrics = agendaHomeMetrics(appointments);
  return <section className="agenda-home">
    <header className="agenda-home-head">
      <div>
        <p>AGENDA COMMERCIAL</p>
        <h2>Mes prochains rendez-vous et rappels</h2>
      </div>
    </header>
    <AppointmentNoticeList rows={rows} onNavigate={onNavigate} onUpdate={onUpdate} toast={toast} canEdit={canEdit} />
    {metrics.overdueCount > 0 && <p className="agenda-home-late"><AlertTriangle size={14}/>{metrics.overdueCount} action{metrics.overdueCount > 1 ? "s" : ""} en retard — elles restent affichées.</p>}
  </section>;
}

export function workloadByCommercial(appointments = [], commercials = []) {
  return commercials.map(user => {
    const items = appointments.filter(item => String(item.commercialId) === String(user.id));
    const metrics = agendaHomeMetrics(items);
    return { ...user, ...metrics, total: items.length };
  });
}

export function CalendarBusyHint() {
  return <p className="calendar-busy-hint"><Clock3 size={14}/><CalendarDays size={14}/>Les événements Google s’affichent avec leur titre et leur détail, sans créer de prospect.</p>;
}
