"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AGENDA_STATUSES,
  AGENDA_DURATIONS,
  AGENDA_CREATE_KINDS,
  agendaKindLabel,
  isPersonalAgendaKind,
  APPOINTMENT_TYPES,
  MEETING_MODES,
  AGENDA_DAY_HOUR_COUNT,
  AGENDA_DAY_START_HOUR,
  agendaDateKey,
  agendaEventColor,
  agendaEventTone,
  dedupeGoogleAgendaItems,
  formatAgendaTime,
  googleAgendaChoices,
  googleCalendarColor,
  googlePrimaryAliases,
  isGoogleAgendaCalendarShown,
  mergeAgendaLayout,
  readAgendaLayout,
  eventTimeLayout,
  packAgendaColumns,
  formatAgendaRange,
  parisDateTimeParts,
  isAllDayAgendaEvent,
  isOverdue,
  minutesFromCanvasPoint,
  normalizeActionKind,
  slotCreateDefaults,
  slotDraftLayout,
  statusMatchesFilter,
  canCorrectAppointmentPhone,
  canViewAppointmentHistory,
  canWriteAgendaComment,
} from "../lib/agenda";
import { allowedRdvStatusesFor, canStatuerAppointment, normalizeAgendaStatus, rdvStatuerHint } from "../lib/appointment-status";
import { ClientPhoneLink } from "./address-call-notice";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, Copy, FileText, Table2,
  MapPin, Phone, Plus, Trash2, X, CheckCircle2, Eye
} from "lucide-react";
import DirectorySearch from "./directory-search";
import GoogleCalendarSettings from "./google-calendar-settings";
import CommercialRdvTable from "./commercial-rdv-table";
import { mergeRdvProspects } from "../lib/commercial-rdv-table";
import { agendaOwnerColor, isAgendaOwnerShown, isProspectDispatcher } from "../lib/prospect-dispatch";
import { isAdminVipRole } from "../lib/roles";
import { canViewOrgWideCommercialData, visibleAgendaRowForViewer } from "../lib/scoping";

function todayIsoDate() {
  return agendaDateKey(new Date());
}

function appointmentDuplicateDefaults(item) {
  const start = item?.start ? new Date(item.start) : null;
  const valid = start && !Number.isNaN(start.getTime());
  return {
    duplicate: true,
    prospectId: item?.prospectId || "",
    actionKind: item?.kind || "rendez-vous",
    prospectName: item?.prospectName || "",
    appointmentDate: todayIsoDate(),
    appointmentStart: valid ? (parisDateTimeParts(item.start)?.time || "09:00") : "09:00",
    duration: String(item?.duration || 60),
    appointmentType: item?.appointmentType || item?.type || "",
    meetingMode: item?.meetingMode || "",
    subject: item?.subject || "",
    notes: item?.notes || "",
    commercialId: item?.commercialId || "",
    phone: item?.phone || "",
    duplicatedFromId: item?.id || "",
  };
}

export default function CommercialAgendaView({
  appointments,
  prospects,
  linkProspects = [],
  clients = [],
  commercials = [],
  query,
  currentUserId = "",
  canAssignCommercial = false,
  canReassignCommercial = false,
  canDelete = false,
  canEdit = true,
  currentProfile = null,
  initialView = "week",
  onAddProspect,
  onCreateEvent,
  onUpdate,
  onRemove,
  onOpenProspect,
  onOpenClient,
  onGoogleSynced,
  toast,
  focusAppointmentId = "",
  focusAppointmentStart = "",
  onFocusHandled,
}) {
  const [viewMode, setViewMode] = useState(initialView);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draftSlot, setDraftSlot] = useState(null);
  const [filters, setFilters] = useState({ commercialId: "", kind: "", status: "" });
  const [agendaPrefs, setAgendaPrefs] = useState({ hidden: {}, colors: {} });
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [googleHidden, setGoogleHidden] = useState({});
  const [googleColors, setGoogleColors] = useState({});
  const slotDrag = useRef(null);
  const layoutKey = `mkl-agenda-view:${currentUserId || "local"}`;

  function readStoredLayout() {
    try {
      return readAgendaLayout(JSON.parse(localStorage.getItem(layoutKey) || "{}"), { fallbackView: "week" });
    } catch {
      return readAgendaLayout({}, { fallbackView: "week" });
    }
  }

  function writeStoredLayout(patch) {
    let current = {};
    try {
      current = JSON.parse(localStorage.getItem(layoutKey) || "{}");
    } catch {
      current = {};
    }
    try {
      localStorage.setItem(layoutKey, JSON.stringify(mergeAgendaLayout(current, patch)));
    } catch {}
  }
  const viewerIsVip = isAdminVipRole(currentProfile?.role);
  const privateOwnerIds = useMemo(
    () => new Set((commercials || []).filter(user => isAdminVipRole(user.role)).map(user => String(user.id))),
    [commercials]
  );
  const dispatchable = commercials.filter(user => {
    if (!["Commercial", "Responsable commercial", "Admin VIP", "Superadmin", "Admin second", "Direction"].includes(user.role)) return false;
    if (!viewerIsVip && isAdminVipRole(user.role)) return false;
    return true;
  });
  const visibleAppointments = useMemo(() => {
    const rows = appointments || [];
    if (canViewOrgWideCommercialData(currentProfile) || isProspectDispatcher(currentProfile)) {
      return rows.filter(item => visibleAgendaRowForViewer(item, null, currentProfile, privateOwnerIds));
    }
    const allowed = (dispatchable.length ? dispatchable : commercials).map(user => user.id);
    if (currentUserId) allowed.push(currentUserId);
    return rows.filter(item => visibleAgendaRowForViewer(item, allowed, currentProfile, privateOwnerIds));
  }, [appointments, commercials, currentProfile, currentUserId, dispatchable, privateOwnerIds]);
  const agendaOwners = useMemo(() => {
    const names = new Map();
    for (const user of dispatchable) {
      if (user?.id) names.set(String(user.id), user.name || "Agenda");
    }
    for (const item of visibleAppointments || []) {
      const id = String(item.commercialId || "");
      if (id && !names.has(id) && (viewerIsVip || !privateOwnerIds.has(id))) names.set(id, item.commercial || "Agenda");
    }
    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [dispatchable, privateOwnerIds, viewerIsVip, visibleAppointments]);

  useLayoutEffect(() => {
    const layout = readStoredLayout();
    setAgendaPrefs({ hidden: layout.hidden, colors: layout.colors });
    setFilters(layout.filters);
    if (initialView !== "table") {
      setViewMode(layout.view);
      if (layout.anchor) setVisibleMonth(new Date(layout.anchor));
    }
    try {
      const raw = JSON.parse(localStorage.getItem(`mkl-google-agenda-show:${currentUserId || "local"}`) || "{}");
      setGoogleHidden(raw.hidden && typeof raw.hidden === "object" ? raw.hidden : {});
      setGoogleColors(raw.colors && typeof raw.colors === "object" ? raw.colors : {});
    } catch {
      setGoogleHidden({});
      setGoogleColors({});
    }
  }, [currentUserId, initialView]);

  useEffect(() => {
    if (!focusAppointmentId && !focusAppointmentStart) return;
    const item = (appointments || []).find(row => focusAppointmentId && String(row.id) === String(focusAppointmentId));
    if (item) {
      setCreating(false);
      setSelected(item);
      setViewMode(current => (current === "table" || current === "list" ? "week" : current));
    }
    const when = item?.start || focusAppointmentStart;
    if (when) {
      const date = new Date(when);
      if (!Number.isNaN(date.getTime())) setVisibleMonth(date);
    }
    onFocusHandled?.();
  }, [focusAppointmentId, focusAppointmentStart]);

  function saveAgendaPrefs(next) {
    setAgendaPrefs(next);
    writeStoredLayout({ hidden: next.hidden, colors: next.colors });
  }

  function chooseView(mode) {
    setViewMode(mode);
    writeStoredLayout({ view: mode });
  }

  function rememberDate(date) {
    const next = date instanceof Date ? date : new Date(date);
    setVisibleMonth(next);
    if (!Number.isNaN(next.getTime())) writeStoredLayout({ anchor: next.toISOString() });
  }

  function chooseFilter(key, value) {
    setFilters(current => {
      const next = { ...current, [key]: value };
      writeStoredLayout({ filters: next });
      return next;
    });
  }

  function toggleAgendaOwner(id) {
    const key = String(id);
    const hidden = { ...agendaPrefs.hidden };
    if (hidden[key]) delete hidden[key];
    else hidden[key] = true;
    saveAgendaPrefs({ ...agendaPrefs, hidden });
  }

  function colorAgendaOwner(id, color) {
    const key = String(id);
    saveAgendaPrefs({ ...agendaPrefs, colors: { ...agendaPrefs.colors, [key]: color } });
  }

  const googleMenu = useMemo(
    () => googleAgendaChoices(googleCalendars, visibleAppointments, currentUserId),
    [googleCalendars, visibleAppointments, currentUserId]
  );

  function writeGoogleShow(next) {
    setGoogleHidden(next.hidden);
    setGoogleColors(next.colors);
    try {
      localStorage.setItem(`mkl-google-agenda-show:${currentUserId || "local"}`, JSON.stringify(next));
    } catch {}
  }

  function toggleGoogleCalendar(calendar) {
    const key = String(calendar.id);
    const hidden = { ...googleHidden };
    const aliases = calendar.primary ? googlePrimaryAliases({ primaryId: key }) : [key];
    const shown = !aliases.some(id => hidden[id]);
    for (const id of aliases) {
      if (shown) hidden[id] = true;
      else delete hidden[id];
    }
    writeGoogleShow({ hidden, colors: googleColors });
  }

  function colorGoogleCalendar(calendar, color) {
    const colors = { ...googleColors, [calendar.id]: color };
    if (calendar.primary) {
      for (const id of googlePrimaryAliases({ primaryId: calendar.id })) colors[id] = color;
    }
    writeGoogleShow({ hidden: googleHidden, colors });
  }

  function fillForGoogleItem(item) {
    const stored = String(item.googleCalendarId || "primary");
    const calendar = googleMenu.find(entry => entry.id === stored)
      || googleMenu.find(entry => entry.primary && googlePrimaryAliases({ primaryId: entry.id }).includes(stored));
    return googleCalendarColor(calendar?.id || stored, googleColors, calendar?.color || "");
  }

  const shownAppointments = useMemo(() => (visibleAppointments || [])
    .filter(item => isAgendaOwnerShown(item.commercialId, agendaPrefs.hidden))
    .filter(item => isGoogleAgendaCalendarShown(item, googleHidden, googleMenu, currentUserId)),
  [visibleAppointments, agendaPrefs.hidden, googleHidden, googleMenu, currentUserId]);

  const list = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    return dedupeGoogleAgendaItems(shownAppointments)
      .filter(item => !needle || [item.prospectName, item.commercial, item.city, item.subject, item.notes, item.kind, item.address].join(" ").toLowerCase().includes(needle))
      .filter(item => !filters.commercialId || String(item.commercialId) === String(filters.commercialId))
      .filter(item => !filters.kind || item.kind === filters.kind)
      .filter(item => statusMatchesFilter(item.status, filters.status))
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }, [shownAppointments, query, filters]);
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const item of list) {
      const key = item.start ? agendaDateKey(item.start) : "";
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [list]);

  const update = async (item, changes, message) => {
    try {
      const saved = await onUpdate?.(item, changes);
      toast(message);
      if (selected?.id === item.id && saved) setSelected(saved);
    } catch (error) {
      toast(String(error?.message || "Mise à jour impossible"));
    }
  };

  const calendarStart = new Date(visibleMonth);
  calendarStart.setDate(1 - ((calendarStart.getDay() + 6) % 7));
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(visibleMonth);
  const todayKey = agendaDateKey(new Date());
  const weekStart = new Date(visibleMonth);
  weekStart.setDate(visibleMonth.getDate() - ((visibleMonth.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const hours = Array.from({ length: AGENDA_DAY_HOUR_COUNT }, (_, index) => index + AGENDA_DAY_START_HOUR);
  const periodLabel = viewMode === "month"
    ? monthLabel
    : viewMode === "week"
      ? `${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(weekDays[0])} — ${new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(weekDays[6])}`
      : new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(visibleMonth);
  const shiftPeriod = direction => setVisibleMonth(current => {
    const next = new Date(current);
    if (viewMode === "month") next.setMonth(next.getMonth() + direction);
    else if (viewMode === "week") next.setDate(next.getDate() + 7 * direction);
    else next.setDate(next.getDate() + direction);
    writeStoredLayout({ anchor: next.toISOString() });
    return next;
  });

  function openCreate(defaults = {}) {
    setSelected(null);
    setCreating({
      appointmentDate: todayIsoDate(),
      appointmentStart: "09:00",
      duration: "60",
      ...defaults,
    });
  }

  function eventButton(item) {
    const google = item.source === "google";
    const hiddenBusy = (item.private || item.kind === "busy") && !google;
    const tone = agendaEventTone(item);
    const unassigned = !google && !hiddenBusy && !item.commercialId;
    const personal = item.commercialId && tone === "visit";
    const fill = google
      ? fillForGoogleItem(item)
      : unassigned
        ? "#f6bf26"
        : personal
          ? agendaOwnerColor(item.commercialId, agendaPrefs.colors)
          : agendaEventColor(item);
    const title = hiddenBusy ? "Indisponible" : (item.prospectName || "Sans titre");
    const compact = isAllDayAgendaEvent(item) || Number(item.duration || 60) <= 30;
    const clock = formatAgendaTime(item.start);
    return <button
      type="button"
      className={`agenda-event tone-${tone}${compact ? " is-compact" : ""}${isOverdue(item) ? " late" : ""}`}
      style={{ "--event": fill }}
      key={item.id}
      onClick={event => { event.stopPropagation(); setCreating(false); setSelected(item); }}
      title={hiddenBusy ? "Indisponible" : `${unassigned ? "À dispatcher · " : ""}${title}${clock ? ` · ${formatAgendaRange(item)}` : ""}${item.notes ? ` — ${item.notes}` : ""}`}
    >
      <span className="agenda-event-title">{title}</span>
      {clock && <time>{clock}</time>}
    </button>;
  }

  function beginSlot(day, event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest(".agenda-event, .timed-event")) return;
    const canvas = event.currentTarget;
    const start = minutesFromCanvasPoint(event.clientY, canvas.getBoundingClientRect());
    slotDrag.current = { day, start, canvas };
    canvas.setPointerCapture?.(event.pointerId);
    setDraftSlot({ dayKey: agendaDateKey(day), ...slotDraftLayout(start, start + 60) });
    event.preventDefault();
  }

  function moveSlot(event) {
    const drag = slotDrag.current;
    if (!drag) return;
    const end = minutesFromCanvasPoint(event.clientY, drag.canvas.getBoundingClientRect());
    setDraftSlot({ dayKey: agendaDateKey(drag.day), ...slotDraftLayout(drag.start, end) });
  }

  function finishSlot(event) {
    const drag = slotDrag.current;
    if (!drag) return;
    slotDrag.current = null;
    const end = minutesFromCanvasPoint(event.clientY, drag.canvas.getBoundingClientRect());
    setDraftSlot(null);
    const span = Math.abs(end - drag.start);
    openCreate(slotCreateDefaults(drag.day, drag.start, span < 15 ? drag.start + 60 : end));
  }

  function timedCanvas(day, items) {
    const key = agendaDateKey(day);
    return <div
      className={`timed-canvas ${key === todayKey ? "today" : ""}`}
      key={key}
      onPointerDown={event => beginSlot(day, event)}
      onPointerMove={moveSlot}
      onPointerUp={finishSlot}
      onPointerCancel={() => { slotDrag.current = null; setDraftSlot(null); }}
    >
      {hours.map(hour => <div className="timed-line" key={hour} />)}
      {draftSlot?.dayKey === key && <div className="agenda-slot-draft" style={{ top: `${draftSlot.topPercent}%`, height: `${draftSlot.heightPercent}%` }} />}
      {(() => {
        const packed = packAgendaColumns(items);
        return items.map(item => {
          const layout = packed.get(String(item.id)) || eventTimeLayout(item);
          if (!layout) return null;
          const columns = layout.columns || 1;
          const column = layout.column || 0;
          const width = 100 / columns;
          return <div className="timed-event" key={item.id} style={{ top: `${layout.topPercent}%`, height: `${layout.heightPercent}%`, left: `calc(${column * width}% + 3px)`, width: `calc(${width}% - 6px)` }}>{eventButton(item)}</div>;
        });
      })()}
    </div>;
  }

  return <div className="module-content google-agenda">
    <div className="google-agenda-bar">
      <div className="google-agenda-bar-left">
        <button className="primary" type="button" onClick={() => openCreate()}><Plus size={17}/>Créer</button>
        {viewMode !== "table" && <>
          <button type="button" className="calendar-today" onClick={() => rememberDate(new Date())}>Aujourd’hui</button>
          <div className="calendar-navigation">
            <button type="button" onClick={() => shiftPeriod(-1)}><ChevronLeft size={17}/></button>
            <h2>{periodLabel}</h2>
            <button type="button" onClick={() => shiftPeriod(1)}><ChevronRight size={17}/></button>
          </div>
        </>}
        {viewMode === "table" && <h2 className="rdv-board-title">Suivi commerciaux</h2>}
      </div>
      <div className="google-agenda-bar-right">
        <div className="calendar-view-switch">
          <button type="button" className={viewMode === "day" ? "active" : ""} onClick={() => chooseView("day")}><Clock3 size={15}/>Jour</button>
          <button type="button" className={viewMode === "week" ? "active" : ""} onClick={() => chooseView("week")}><CalendarDays size={15}/>Semaine</button>
          <button type="button" className={viewMode === "month" ? "active" : ""} onClick={() => chooseView("month")}><CalendarDays size={15}/>Mois</button>
          <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => chooseView("list")}><FileText size={15}/>Agenda</button>
          <button type="button" className={`rdv-table-switch ${viewMode === "table" ? "active" : ""}`} onClick={() => chooseView("table")}><Table2 size={15}/>Rendez-vous</button>
        </div>
        <button className="secondary" type="button" onClick={onAddProspect}><Plus size={16}/>Nouveau prospect</button>
        {googleMenu.length > 0 && <details className="google-agenda-picker">
          <summary>Agendas Google</summary>
          <div className="google-agenda-picker-panel" aria-label="Agendas Google">
            {googleMenu.map(calendar => {
              const aliases = calendar.primary ? googlePrimaryAliases({ primaryId: calendar.id }) : [calendar.id];
              const shown = !aliases.some(id => googleHidden[id]);
              const color = googleCalendarColor(calendar.id, googleColors, calendar.color);
              return <div key={calendar.id} className={`google-agenda-row${shown ? " is-on" : ""}`}>
                <label>
                  <input type="checkbox" checked={shown} onChange={() => toggleGoogleCalendar(calendar)} />
                  <span>{calendar.summary}{calendar.primary ? " · principal" : ""}</span>
                </label>
                <input type="color" value={color} aria-label={`Couleur de ${calendar.summary}`} onClick={event => event.stopPropagation()} onChange={event => colorGoogleCalendar(calendar, event.target.value)} />
              </div>;
            })}
          </div>
        </details>}
        <details className="agenda-tools">
          <summary>Filtres</summary>
          <div className="agenda-tools-panel">
            <div className="agenda-filters">
              {canAssignCommercial && <label>Commercial<select value={filters.commercialId} onChange={e => chooseFilter("commercialId", e.target.value)}><option value="">Tous</option>{dispatchable.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
              <label>Type<select value={filters.kind} onChange={e => chooseFilter("kind", e.target.value)}><option value="">Tous</option>{AGENDA_CREATE_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="busy">Indisponible</option></select></label>
              <label>Statut<select value={filters.status} onChange={e => chooseFilter("status", e.target.value)}><option value="">Tous</option>{AGENDA_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
            </div>
            <GoogleCalendarSettings onSynced={onGoogleSynced} onCalendars={setGoogleCalendars}/>
          </div>
        </details>
      </div>
    </div>
    {viewMode === "table" && <CommercialRdvTable
      appointments={shownAppointments}
      prospects={mergeRdvProspects(prospects, linkProspects)}
      clients={clients}
      commercials={dispatchable}
      query={query}
      onOpen={item => { setCreating(false); setSelected(item); }}
      onOpenClient={onOpenClient}
    />}
    {agendaOwners.length > 0 && <div className="agenda-people" aria-label="Agendas affichés">
      {agendaOwners.map(user => {
        const shown = isAgendaOwnerShown(user.id, agendaPrefs.hidden);
        const color = agendaOwnerColor(user.id, agendaPrefs.colors);
        return <label className={`agenda-person${shown ? "" : " is-off"}`} key={user.id}>
          <input type="checkbox" checked={shown} onChange={() => toggleAgendaOwner(user.id)} aria-label={`Afficher l’agenda de ${user.name}`} />
          <input type="color" value={color} aria-label={`Couleur de ${user.name}`} onChange={event => colorAgendaOwner(user.id, event.target.value)} />
          <span>{user.name}</span>
        </label>;
      })}
    </div>}
    {viewMode !== "list" && viewMode !== "table" && <section className="commercial-calendar">
      <div className="agenda-color-legend">
        <span><i style={{ background: "#2563eb" }}/>RDV</span>
        <span><i style={{ background: "#f5b400" }}/>Rappel</span>
        <span><i style={{ background: "#0f766e" }}/>Formation</span>
        <span><i style={{ background: "#c2410c" }}/>Accompagnement</span>
        <span><i style={{ background: "#0369a1" }}/>Autre</span>
        <span><i style={{ background: "#059669" }}/>Confirmé</span>
        <span><i style={{ background: "#7c3aed" }}/>Google</span>
        <span><i style={{ background: "#0f172a" }}/>Indisponible</span>
        <span><i style={{ background: "#e11d48" }}/>Annulé / retard</span>
      </div>
      {viewMode === "month" && <div className="month-calendar"><div className="calendar-weekdays">{["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."].map(day => <b key={day}>{day}</b>)}</div><div className="calendar-month-grid">{calendarDays.map(day => {
        const key = agendaDateKey(day);
        const dayEvents = eventsByDay.get(key) || [];
        const shown = dayEvents.slice(0, 3);
        return <div
          className={`calendar-day ${day.getMonth() !== visibleMonth.getMonth() ? "outside" : ""} ${key === todayKey ? "today" : ""}`}
          key={key}
          onClick={event => {
            if (event.target.closest(".agenda-event")) return;
            openCreate({ appointmentDate: key, appointmentStart: "09:00", duration: "60" });
          }}
        ><span>{day.getDate()}</span><div>{shown.map(eventButton)}{dayEvents.length > shown.length && <small className="agenda-more-count">+{dayEvents.length - shown.length}</small>}</div></div>;
      })}</div></div>}
      {viewMode === "week" && <div className="week-calendar timed-week">
        <div className="timed-week-head">
          <span />
          {weekDays.map(day => {
            const key = agendaDateKey(day);
            return <header className={key === todayKey ? "today" : ""} key={key}>
              <button type="button" className="agenda-day-jump" onClick={() => { rememberDate(day); chooseView("day"); }}>
                <b>{new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(day)}</b>
                <span>{day.getDate()}</span>
              </button>
            </header>;
          })}
        </div>
        <div className="timed-week-allday">
          <small>Journée</small>
          {weekDays.map(day => {
            const key = agendaDateKey(day);
            const allDay = (eventsByDay.get(key) || []).filter(isAllDayAgendaEvent);
            return <div key={`all-${key}`} onClick={event => {
              if (event.target.closest(".agenda-event")) return;
              openCreate({ appointmentDate: key, appointmentStart: "09:00", duration: "60" });
            }}>{allDay.map(eventButton)}</div>;
          })}
        </div>
        <div className="timed-week-body">
          <div className="timed-hours">{hours.map(hour => <time key={hour}>{String(hour).padStart(2, "0")}:00</time>)}</div>
          {weekDays.map(day => {
            const key = agendaDateKey(day);
            const timed = (eventsByDay.get(key) || []).filter(item => !isAllDayAgendaEvent(item));
            return timedCanvas(day, timed);
          })}
        </div>
      </div>}
      {viewMode === "day" && <div className="day-calendar timed-day">
        {((eventsByDay.get(agendaDateKey(visibleMonth)) || []).filter(isAllDayAgendaEvent)).length > 0 && (
          <div className="timed-allday">{(eventsByDay.get(agendaDateKey(visibleMonth)) || []).filter(isAllDayAgendaEvent).map(eventButton)}</div>
        )}
        <div className="timed-grid">
          <div className="timed-hours">{hours.map(hour => <time key={hour}>{String(hour).padStart(2, "0")}:00</time>)}</div>
          {timedCanvas(visibleMonth, (eventsByDay.get(agendaDateKey(visibleMonth)) || []).filter(item => !isAllDayAgendaEvent(item)))}
        </div>
      </div>}
    </section>}
    {viewMode === "list" && <div className="commercial-agenda-list">
      {list.length === 0 && <div className="empty">Aucun événement planifié. Cliquez Créer ou un créneau dans Semaine.</div>}
      {list.map(item => {
        const prospect = prospects.find(p => p.id === item.prospectId);
        return <article className={`commercial-appointment tone-${agendaEventTone(item)}`} key={item.id}>
          <div className="commercial-appointment-date"><b>{new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(item.start))}</b><span>{formatAgendaRange(item)} · {item.duration || 60} min</span></div>
          <div className="commercial-appointment-prospect"><span className="appointment-state">{item.source === "google" ? "Google" : item.kind === "busy" ? "Occupé" : `${agendaKindLabel(item.kind)} · ${item.status}`}</span><h3>{item.prospectName}</h3><p><MapPin size={13}/>{item.address || item.city || prospect?.city} · {item.subject || item.type}</p>{item.notes ? <p className="event-notes">{item.notes}</p> : null}</div>
          <div className="commercial-dispatch">
            {canReassignCommercial && <label>Vendeur<select value={item.commercialId || ""} onChange={event => update(item, { commercialId: event.target.value, commercial: dispatchable.find(user => user.id === event.target.value)?.name || "" }, "Rendez-vous attribué")}><option value="">Non attribué</option>{dispatchable.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
            {canStatuerAppointment(currentProfile, currentUserId, item) && !isPersonalAgendaKind(item.kind) && <label>Statut<select value={normalizeAgendaStatus(item.status)} onChange={event => update(item, { status: event.target.value }, "Statut modifié")}>{allowedRdvStatusesFor(currentProfile, currentUserId, item).map(status => <option key={status}>{status}</option>)}</select></label>}
          </div>
          <div className="commercial-appointment-actions">
            <button type="button" onClick={() => setSelected(item)}>Détail</button>
            <button type="button" onClick={() => openCreate(appointmentDuplicateDefaults(item))}><Copy size={16}/>Dupliquer le rendez-vous</button>
            {canDelete && <button type="button" onClick={() => onRemove?.(item)}><Trash2 size={16}/></button>}
          </div>
        </article>;
      })}
    </div>}
    {selected && <EventDetail
      item={selected}
      prospect={prospects.find(p => p.id === selected.prospectId)}
      commercials={dispatchable}
      canReassignCommercial={canReassignCommercial}
      canDelete={canDelete}
      canEdit={canEdit}
      currentProfile={currentProfile}
      currentUserId={currentUserId}
      onClose={() => setSelected(null)}
      onUpdate={update}
      onRemove={onRemove}
      onOpenProspect={onOpenProspect}
      lockStatus={viewMode === "table"}
      onDuplicate={() => { openCreate(appointmentDuplicateDefaults(selected)); }}
      onFollowUp={() => { openCreate({ prospectId: selected.prospectId, prospectName: selected.prospectName }); }}
    />}
    {creating && <CreateEventModal
      key={`${creating.appointmentDate || ""}-${creating.appointmentStart || ""}-${creating.duration || ""}-${creating.prospectId || ""}`}
      prospects={prospects}
      commercials={dispatchable}
      canAssignCommercial={canAssignCommercial}
      currentUserId={currentUserId}
      defaults={typeof creating === "object" ? creating : {}}
      onClose={() => setCreating(false)}
      onCreate={async payload => {
        await onCreateEvent?.(payload);
        setCreating(false);
        toast("Événement ajouté à l’agenda");
      }}
    />}
  </div>;
}

function formatHistoryValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "object") {
    const source = value.sourceAppointmentId ? `origine ${value.sourceAppointmentId}` : "";
    const copy = value.appointmentId ? `copie ${value.appointmentId}` : "";
    const link = [source, copy].filter(Boolean).join(" · ");
    if (link) return link;
    return Object.entries(value).map(([key, item]) => `${key} : ${item ?? "—"}`).join(", ");
  }
  return String(value);
}

function EventDetail({ item, prospect, commercials, canReassignCommercial, canDelete, canEdit = true, currentProfile = null, currentUserId = "", lockStatus = false, onClose, onUpdate, onRemove, onOpenProspect, onDuplicate, onFollowUp }) {
  const [history, setHistory] = useState(null);
  const [comment, setComment] = useState(item.notes || "");
  const [phoneDraft, setPhoneDraft] = useState(item.phone || prospect?.phone || "");
  const phone = item.phone || prospect?.phone || "";
  const google = item.source === "google";
  const hiddenBusy = (item.private || item.kind === "busy") && !google;
  const canComment = !google && !hiddenBusy && canWriteAgendaComment(currentProfile, currentUserId, item);
  const canPhone = !google && !hiddenBusy && canCorrectAppointmentPhone(currentProfile, currentUserId, item);
  const canHistory = canViewAppointmentHistory(currentProfile);
  useLoadHistory(item.id, setHistory, canHistory);
  useEffect(() => { setComment(item.notes || ""); }, [item.id, item.notes]);
  useEffect(() => { setPhoneDraft(item.phone || prospect?.phone || ""); }, [item.id, item.phone, prospect?.phone]);
  const personal = isPersonalAgendaKind(item.kind);
  const done = normalizeActionKind(item.kind) === "rappel" ? "Rappel effectué" : "Réalisé";
  const title = google ? (item.prospectName || "Sans titre") : hiddenBusy ? "Indisponible" : item.prospectName;
  const subtitle = google
    ? (item.googleCalendarSummary || "Google Calendar")
    : hiddenBusy
      ? "Période occupée"
      : `${agendaKindLabel(item.kind)} · ${personal ? (item.commercial || "Non attribué") : item.status}`;
  async function saveSheet() {
    if (canComment) await onUpdate(item, { notes: comment }, "Commentaire enregistré");
    if (canPhone && phoneDraft.trim() !== phone) await onUpdate(item, { phone: phoneDraft.trim() }, "Numéro corrigé");
  }
  return <div className="agenda-popover-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="agenda-popover event-detail-modal" role="dialog" onMouseDown={e => e.stopPropagation()}>
      <div className="event-detail-top">
        {(canComment || canPhone) && <button type="button" className="primary event-detail-save" onClick={saveSheet}>Enregistrer</button>}
        <button type="button" className="modal-close" onClick={onClose}><X/></button>
      </div>
      <div className={`event-detail-flag tone-${hiddenBusy ? "busy" : agendaEventTone(item)}`}>{subtitle}</div>
      <h2>{title}</h2>
      {!hiddenBusy && !google && <p>{item.subject || item.appointmentType} — {item.commercial || "Non attribué"}</p>}
      {google && <p>{item.commercial || "Commercial"} — événement importé depuis Google, sans fiche prospect</p>}
      <div className="event-detail-grid">
        <div><Clock3 size={16}/><span>{formatAgendaRange(item)} · {item.duration || 60} min</span></div>
        {!hiddenBusy && <div><MapPin size={16}/><span>{item.address || item.city || "Lieu non renseigné"}</span></div>}
        {!hiddenBusy && !google && !canPhone && <div><Phone size={16}/><span>{phone || "Téléphone non renseigné"}</span></div>}
        {canPhone && <label className="event-status-field">Numéro de téléphone<input value={phoneDraft} onChange={event => setPhoneDraft(event.target.value)} placeholder="06 12 34 56 78" /></label>}
      </div>
      {!google && !hiddenBusy && <label className="event-status-field">Commentaire
        <textarea rows={3} value={comment} readOnly={!canComment} placeholder="Note visible sur le rendez-vous du vendeur" onChange={event => setComment(event.target.value)} />
      </label>}
      {canPhone && phoneDraft.trim() !== phone && <button type="button" className="secondary event-comment-save" onClick={() => onUpdate(item, { phone: phoneDraft.trim() }, "Numéro corrigé")}>Corriger le numéro</button>}
      {!google && !hiddenBusy && !canEdit && <p className="event-lock-note">L’horaire de ce rendez-vous est verrouillé. Dupliquez-le ou programmez un nouveau RDV ou rappel.</p>}
      {!google && !hiddenBusy && !personal && canStatuerAppointment(currentProfile, currentUserId, item) && <label className="event-status-field">Statut RDV<select value={normalizeAgendaStatus(item.status)} onChange={event => onUpdate(item, { status: event.target.value }, "Statut modifié")}>{allowedRdvStatusesFor(currentProfile, currentUserId, item).map(status => <option key={status}>{status}</option>)}</select></label>}
      {!google && !hiddenBusy && !personal && rdvStatuerHint(currentProfile, currentUserId, item) && <p className="event-lock-note">{rdvStatuerHint(currentProfile, currentUserId, item)}</p>}
      {lockStatus && !google && !hiddenBusy && !personal && !canStatuerAppointment(currentProfile, currentUserId, item) && <p className="event-lock-note">Le statut se statue dans la fiche client.</p>}
      <div className="event-detail-actions">
        {canEdit && !lockStatus && !google && !hiddenBusy && <>
          <button type="button" className="is-primary" onClick={() => onUpdate(item, { status: "Confirmé" }, "Rendez-vous confirmé")}><CheckCircle2 size={16}/>Confirmer</button>
          <button type="button" className="is-secondary" onClick={() => onUpdate(item, { status: done }, "Marqué comme effectué")}>Terminé</button>
          <button type="button" className="is-ghost" onClick={() => onUpdate(item, { status: "RDV annulé définitivement" }, "Événement annulé")}>Annuler</button>
        </>}
        {canReassignCommercial && !google && !hiddenBusy && <label className="event-status-field">Vendeur<select value={item.commercialId || ""} onChange={e => onUpdate(item, { commercialId: e.target.value, commercial: commercials.find(user => user.id === e.target.value)?.name || "" }, "Rendez-vous attribué")}>{!item.commercialId && <option value="">Non attribué</option>}{commercials.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
        {canEdit && !google && !hiddenBusy && canDelete && <button type="button" className="is-ghost" onClick={() => onRemove?.(item)}><Trash2 size={16}/>Supprimer</button>}
        {phone && (
          <ClientPhoneLink
            className="is-primary"
            phone={phone}
            person={{
              id: prospect?.clientId || "",
              address: prospect?.address || item.address || "",
              postalCode: prospect?.postalCode || "",
              city: prospect?.city || item.city || "",
            }}
            onComplete={() => onOpenProspect?.(prospect || { id: item.prospectId })}
          ><Phone size={16}/>Appeler</ClientPhoneLink>
        )}
        {!google && !hiddenBusy && !personal && <button type="button" className="is-secondary" onClick={() => onOpenProspect?.(prospect || { id: item.prospectId })}><Eye size={16}/>Fiche prospect</button>}
        {!google && !hiddenBusy && <button type="button" className="is-secondary" onClick={onDuplicate}><Copy size={16}/>Dupliquer le rendez-vous</button>}
        {!google && !hiddenBusy && <button type="button" className="is-sun" onClick={onFollowUp}>Nouveau RDV ou rappel</button>}
      </div>
      {canHistory && <div className="devis-history appointment-history"><b>Historique des modifications</b>{!history ? <span>Chargement…</span> : history.length === 0 ? <span>Aucune modification</span> : <ul>{history.map(entry => <li key={entry.id}><b>{entry.actionLabel || entry.field}</b><small>{entry.userName || entry.user_name} · {entry.at || entry.created_at ? new Date(entry.at || entry.created_at).toLocaleString("fr-FR") : ""}</small><span>{entry.fieldLabel || entry.field}</span><span>Avant : {formatHistoryValue(entry.oldValue ?? entry.old_value)}</span><span>Après : {formatHistoryValue(entry.newValue ?? entry.new_value)}</span></li>)}</ul>}</div>}
    </div>
  </div>;
}

function useLoadHistory(id, setHistory, enabled) {
  useEffect(() => {
    if (!enabled) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    setHistory(null);
    import("../lib/supabase-rest").then(({ authFetch }) => {
      authFetch(`/api/appointments/${id}/history`).then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setHistory(response.ok && Array.isArray(data.history) ? data.history : []);
      }).catch(() => { if (!cancelled) setHistory([]); });
    });
    return () => { cancelled = true; };
  }, [id, setHistory, enabled]);
}

function CreateEventModal({ prospects, commercials, canAssignCommercial, currentUserId, defaults = {}, onClose, onCreate }) {
  const [kind, setKind] = useState(defaults.actionKind || "rendez-vous");
  const [more, setMore] = useState(Boolean(defaults.duplicate));
  const personal = isPersonalAgendaKind(kind);
  return <div className="agenda-popover-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="agenda-popover" role="dialog" onMouseDown={e => e.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}><X/></button>
      <h2>{defaults.duplicate ? "Dupliquer le rendez-vous" : "Nouvel événement"}</h2>
      {defaults.appointmentDate && <p className="agenda-popover-when">{defaults.appointmentDate} · {defaults.appointmentStart || "09:00"} · {defaults.duration || 60} min</p>}
      <form className="agenda-create-form" onSubmit={async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        await onCreate({
          ...data,
          start: `${data.appointmentDate}T${data.appointmentStart}`,
          kind,
          actionKind: kind,
          prospectId: personal ? "" : data.prospectId,
          prospectName: personal ? data.title : "",
          subject: personal ? data.title : data.subject,
          commercialId: data.commercialId || currentUserId,
          phone: personal ? "" : (defaults.phone || ""),
          duplicatedFromId: defaults.duplicatedFromId || "",
        });
      }}>
        <div className="next-action-kinds compact">{AGENDA_CREATE_KINDS.map(item => <label key={item.id}><input type="radio" name="actionKind" value={item.id} required checked={item.id === kind} onChange={() => setKind(item.id)} /><span>{item.label}</span></label>)}</div>
        {personal
          ? <label>Intitulé<input name="title" required defaultValue={defaults.prospectName || defaults.subject || ""} placeholder="Ex. formation produits, accompagnement terrain" /></label>
          : <DirectorySearch items={prospects} kind="prospect" idName="prospectId" required defaultValue={defaults.prospectId || ""} />}
        <div className="form-row"><label>Date<input name="appointmentDate" type="date" required defaultValue={defaults.appointmentDate || ""} /></label><label>Heure<input name="appointmentStart" type="time" required defaultValue={defaults.appointmentStart || "09:00"} /></label></div>
        <label>Durée<select name="duration" defaultValue={defaults.duration || "60"}>{AGENDA_DURATIONS.map(value => <option key={value} value={value}>{value < 60 ? `${value} min` : value % 60 ? `${Math.floor(value / 60)} h ${value % 60}` : `${value / 60} h`}</option>)}</select></label>
        {canAssignCommercial && <label>Vendeur<select name="commercialId" defaultValue={defaults.commercialId || currentUserId}><option value="">Non attribué</option>{commercials.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>}
        <label>Commentaire<textarea name="notes" rows="3" defaultValue={defaults.notes || ""} placeholder={personal ? "Détail visible sur l’agenda" : "Visible sur le rendez-vous du vendeur"} /></label>
        {!personal && more && <>
          <label>Type<select name="appointmentType" defaultValue={defaults.appointmentType || APPOINTMENT_TYPES[0]}>{APPOINTMENT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          <label>Mode<select name="meetingMode" defaultValue={defaults.meetingMode || MEETING_MODES[0]}>{MEETING_MODES.map(mode => <option key={mode}>{mode}</option>)}</select></label>
          <label>Objet<input name="subject" defaultValue={defaults.subject || ""} /></label>
        </>}
        {!personal && <button type="button" className="agenda-more-toggle" onClick={() => setMore(current => !current)}>{more ? "Moins d’options" : "Plus d’options"}</button>}
        <button className="primary submit" type="submit"><Plus size={16}/>{defaults.duplicate ? "Créer la copie" : "Enregistrer"}</button>
      </form>
    </div>
  </div>;
}
