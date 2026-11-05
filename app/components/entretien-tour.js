"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyBanAddress, BanSuggestionList, useBanSuggestions } from "./ban-address";
import AddressCallNotice, { dialPhone } from "./address-call-notice";
import { missingAddressParts } from "../lib/address";
import { authFetch } from "../lib/supabase-rest";
import { downloadHtmlAsPdf } from "../lib/html-to-pdf";
import { useCompany } from "../lib/use-company";
import { addDaysIso, startOfWeekMonday } from "../lib/entretien-agenda";
import { confirmedSite, entretienSearchMatches, pickTourTechnicians, TOUR_PRESTATIONS, TOUR_SLOTS, tourWeekDays } from "../lib/entretien-tour";
import { DEFAULT_WARRANTY_YEARS, WARRANTY_YEAR_CHOICES, warrantyDecision, warrantyWaiverLetterHtml } from "../lib/entretien-warranty";

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayTitle(iso) {
  const day = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function shortDay(iso) {
  const day = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function frDate(iso) {
  const day = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function locationOf(row) {
  return [row.address, row.postal, row.city].filter(Boolean).join(" ");
}

function StopForm({ draft, setDraft, working, busy, onSubmit, toast }) {
  const decision = warrantyDecision({
    installedOn: draft.installedOn,
    years: draft.years,
    today: todayIso(),
  });
  const note = !decision.ready
    ? "Indiquez la date d’installation. Le courrier n’est préparé que si la garantie court encore."
    : decision.covered
      ? `Encore sous garantie jusqu’au ${frDate(decision.endsOn)}. Le courrier de renonciation sera préparé.`
      : `Garantie terminée le ${frDate(decision.endsOn)}. On enregistre l’arrêt, sans courrier.`;
  return (
    <form className="entretien-tour-stop" onSubmit={event => {
      event.preventDefault();
      if (!draft.installedOn) return toast?.("Indiquez la date d’installation.");
      onSubmit();
    }}>
      <div className="prospect-chips">
        <button type="button" className={draft.reason === "annule" ? "selected" : ""} onClick={() => setDraft({ ...draft, reason: "annule" })}>Annule le contrat</button>
        <button type="button" className={draft.reason === "refus" ? "selected" : ""} onClick={() => setDraft({ ...draft, reason: "refus" })}>Ne veut plus</button>
      </div>
      <label>
        Date d’installation
        <input type="date" max={todayIso()} value={draft.installedOn} onChange={event => setDraft({ ...draft, installedOn: event.target.value })} required />
      </label>
      <div className="prospect-chips" aria-label="Durée de garantie">
        {WARRANTY_YEAR_CHOICES.map(years => (
          <button type="button" key={years} className={Number(draft.years) === years ? "selected" : ""} onClick={() => setDraft({ ...draft, years })}>{years} ans</button>
        ))}
      </div>
      <label>
        Matériel
        <input value={draft.equipment || ""} onChange={event => setDraft({ ...draft, equipment: event.target.value })} placeholder="Ex. pompe à chaleur Atlantic" />
      </label>
      <p className="entretien-tour-note">{note}</p>
      <button className="primary" type="submit" disabled={Boolean(busy) || working || !decision.ready}>
        {decision.covered ? "Enregistrer et préparer le courrier" : "Enregistrer l’arrêt"}
      </button>
    </form>
  );
}

function SiteConfirm({ draft, setDraft }) {
  const [editingAddress, setEditingAddress] = useState(false);
  const { suggestions, clearSuggestions } = useBanSuggestions(draft?.address || "", { paused: !editingAddress });
  function pick(item) {
    const next = applyBanAddress(item);
    setEditingAddress(false);
    clearSuggestions();
    setDraft({ ...draft, address: next.address, postal: next.postalCode, city: next.city });
  }
  return (
    <div className="entretien-tour-site">
      <p className="entretien-tour-note">Confirmez l’adresse et le code postal avec le client. L’adresse en historique peut être ancienne.</p>
      <label>
        Adresse
        <input
          value={draft?.address || ""}
          onFocus={() => setEditingAddress(true)}
          onBlur={() => window.setTimeout(() => setEditingAddress(false), 180)}
          onChange={event => setDraft({ ...draft, address: event.target.value })}
          required
          placeholder="Numéro et voie"
        />
      </label>
      {editingAddress && <BanSuggestionList suggestions={suggestions} onPick={pick} />}
      <div className="form-row">
        <label>
          Code postal
          <input inputMode="numeric" maxLength={5} value={draft?.postal || ""} onChange={event => setDraft({ ...draft, postal: event.target.value.replace(/\D/g, "").slice(0, 5) })} required />
        </label>
        <label>
          Ville
          <input value={draft?.city || ""} onChange={event => setDraft({ ...draft, city: event.target.value })} required />
        </label>
      </div>
    </div>
  );
}

function WeekColumns({ week, day, onPickDay }) {
  return (
    <div className="entretien-tour-week">
      {(week || []).map(column => (
        <article key={column.day} className={column.day === day ? "is-selected" : ""}>
          <button type="button" onClick={() => onPickDay(column.day)}>
            <b>{shortDay(column.day)}</b>
            <small>{column.filled || 0} rdv</small>
          </button>
          {column.anchor
            ? <small className="entretien-tour-base">Base · {column.anchor.name}{column.anchor.city ? ` · ${column.anchor.city}` : ""}</small>
            : <small className="entretien-tour-base">Pas encore de base</small>}
          <div className="entretien-tour-slots">
            {(column.slots || []).map(slot => (
              <p key={slot.time} className={tourSlotClass(slot)} title={slot.visit ? [prestationLabel(slot.visit.prestation), slot.visit.description].filter(Boolean).join(" — ") : "Libre"}>
                <b>{slot.time}</b>
                <span>{slot.visit ? slot.visit.clientName : "Libre"}</span>
              </p>
            ))}
          </div>
          {(column.extras || []).map(visit => (
            <small key={visit.id} className="entretien-tour-extra">{visit.time || "—"} · {visit.title || visit.clientName}</small>
          ))}
        </article>
      ))}
    </div>
  );
}

function appointmentsOf(column) {
  return [
    ...(column?.slots || []).filter(slot => slot.visit).map(slot => ({ ...slot.visit, time: slot.time, shifted: Boolean(slot.shifted) })),
    ...(column?.extras || []),
  ].filter(item => item?.id).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

function CallPhone({ phone, parts, onAsk }) {
  const clean = String(phone || "").replace(/\s/g, "");
  if (!parts.length) return <a className="entretien-tour-phone" href={`tel:${clean}`}>{phone}</a>;
  return <button type="button" className="entretien-tour-phone" onClick={onAsk}>{phone}</button>;
}

function DayPlan({ day, column, editVisit, setEditVisit, busy, toast, onMove, onCancel, callAsk, setCallAsk }) {
  const visits = appointmentsOf(column);
  if (!visits.length) return <p className="entretien-tour-hint">Aucun rendez-vous ce jour. Quand le client accepte, choisissez l’heure convenue.</p>;
  return (
    <div className="entretien-tour-dayplan">
      {visits.map(visit => {
        const editing = editVisit?.id === visit.id;
        return (
          <article key={visit.id} className={`is-${visit.prestation || "maintenance"}${visit.shifted ? " is-shifted" : ""}`}>
            <b>{visit.time}</b>
            <span>
              <strong>{visit.clientName || visit.title}</strong>
              <small>{visit.city || visit.location}</small>
            </span>
            {visit.description ? <small className="entretien-tour-task">{visit.description}</small> : null}
            {visit.phone && (
              <CallPhone
                phone={visit.phone}
                parts={missingAddressParts(visit)}
                onAsk={() => setCallAsk(`visit:${visit.id}`)}
              />
            )}
            {callAsk === `visit:${visit.id}` && (
              <AddressCallNotice
                parts={missingAddressParts(visit)}
                onComplete={() => {
                  setCallAsk("");
                  setEditVisit({ id: visit.id, day, time: visit.time || "", address: visit.address || "", postal: visit.postal || "", city: visit.city || "" });
                }}
                onCall={() => { setCallAsk(""); dialPhone(visit.phone); }}
              />
            )}
            <div className="entretien-tour-actions">
              <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setEditVisit(editing ? null : { id: visit.id, day, time: visit.time || "", address: visit.address || "", postal: visit.postal || "", city: visit.city || "" })}>Modifier</button>
              <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => onCancel(visit)}>Annuler</button>
            </div>
            {editing && (
              <form className="entretien-tour-book" onSubmit={event => {
                event.preventDefault();
                if (!editVisit.time) return toast?.("Indiquez l’heure convenue avec le client.");
                onMove(visit, editVisit);
              }}>
                <div className="entretien-tour-when">
                  <label>
                    Jour
                    <input type="date" value={editVisit.day || day} onChange={event => setEditVisit({ ...editVisit, day: event.target.value })} required />
                  </label>
                  <label>
                    Heure convenue
                    <input type="time" value={editVisit.time || ""} onChange={event => setEditVisit({ ...editVisit, time: event.target.value })} required />
                  </label>
                </div>
                <SiteConfirm draft={editVisit} setDraft={setEditVisit} />
                <div className="prospect-chips">
                  {TOUR_SLOTS.map(time => (
                    <button type="button" key={time} className={editVisit.time === time ? "selected" : ""} onClick={() => setEditVisit({ ...editVisit, time })}>{time}</button>
                  ))}
                </div>
                <button className="primary" type="submit" disabled={Boolean(busy)}>Enregistrer</button>
              </form>
            )}
          </article>
        );
      })}
    </div>
  );
}

function prestationLabel(id) {
  return TOUR_PRESTATIONS.find(item => item.id === id)?.label || "Maintenance";
}

function tourSlotClass(slot) {
  if (!slot?.visit) return "";
  const kind = slot.visit.prestation || "maintenance";
  return `is-filled is-${kind}${slot.shifted ? " is-shifted" : ""}`;
}

function clientDisplayName(client = {}) {
  return `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.name || client.company || "Client";
}

function ServiceBooking({ tech, prestation, day, clients, busy, onBook }) {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState(null);
  const [site, setSite] = useState({ address: "", postal: "", city: "" });
  const [when, setWhen] = useState(day);
  const [time, setTime] = useState("");
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const label = prestationLabel(prestation);
  const picks = !client && query.trim().length >= 2
    ? (clients || []).filter(item => entretienSearchMatches(
      `${item.civilite || ""} ${item.firstName || ""} ${item.lastName || ""} ${item.name || ""} ${item.company || ""} ${item.city || ""} ${item.postalCode || ""} ${item.address || ""}`,
      query
    )).slice(0, 8)
    : [];

  useEffect(() => {
    setWhen(day);
  }, [day]);

  return (
    <form className="entretien-tour-book" onSubmit={async event => {
      event.preventDefault();
      const confirmed = confirmedSite(site);
      if (!client) {
        setError("Choisissez le client.");
        return;
      }
      if (!confirmed.ok) {
        setError(confirmed.error);
        return;
      }
      if (!time) {
        setError("Indiquez l’heure.");
        return;
      }
      setError("");
      const message = await onBook(
        { clientId: client.id, name: clientDisplayName(client) },
        {
          day: when,
          time,
          technicianId: tech.id,
          nature: prestation,
          title: `${label} ${clientDisplayName(client)}`.trim(),
          address: confirmed.address,
          postal: confirmed.postal,
          city: confirmed.city,
          location: confirmed.location,
          description: task.trim(),
        }
      );
      if (message) setError(message);
      else {
        setClient(null);
        setQuery("");
        setSite({ address: "", postal: "", city: "" });
        setTime("");
        setTask("");
        setWhen(day);
        setError("");
      }
    }}>
      <p className="entretien-tour-note">{label} pour {tech.name}. Le créneau se pose sur son planning, sans créer de contrat d’entretien.</p>
      {error && <p className="wizard-form-error" role="alert">{error}</p>}
      <label>
        Client
        <input
          value={client ? clientDisplayName(client) : query}
          placeholder="Nom, prénom ou ville"
          onChange={event => {
            setClient(null);
            setQuery(event.target.value);
            setError("");
          }}
        />
      </label>
      {picks.length > 0 && (
        <div className="entretien-client-picks">
          {picks.map(item => (
            <button type="button" key={item.id} onClick={() => {
              setClient(item);
              setQuery("");
              setSite({ address: item.address || "", postal: item.postalCode || "", city: item.city || "" });
              setError("");
            }}>
              <b>{clientDisplayName(item)}</b>
              <small>{[item.postalCode, item.city].filter(Boolean).join(" ")}</small>
            </button>
          ))}
        </div>
      )}
      {!client && query.trim().length >= 2 && !picks.length && <p className="entretien-tour-note">Aucun client en base avec ce nom.</p>}
      <SiteConfirm draft={site} setDraft={setSite} />
      <div className="entretien-tour-when">
        <label>
          Jour
          <input type="date" value={when} onChange={event => setWhen(event.target.value)} required />
        </label>
        <label>
          Heure
          <input type="time" value={time} onChange={event => setTime(event.target.value)} required />
        </label>
      </div>
      <label>
        À faire
        <textarea
          value={task}
          rows={3}
          placeholder="Ce qu’il y a à faire sur place"
          onChange={event => setTask(event.target.value)}
        />
      </label>
      <div className="prospect-chips" aria-label="Créneaux de tournée">
        {TOUR_SLOTS.map(slot => (
          <button type="button" key={slot} className={time === slot ? "selected" : ""} onClick={() => setTime(slot)}>{slot}</button>
        ))}
      </div>
      <button className="primary" type="submit" disabled={Boolean(busy)}>Poser ce {label.toLowerCase()}</button>
    </form>
  );
}

export default function EntretienTour({ toast, onPlanned, team = [], clients = [] }) {
  const { company } = useCompany();
  const [day, setDay] = useState(tomorrowIso);
  const [technicianIds, setTechnicianIds] = useState([]);
  const [modes, setModes] = useState({});
  const [query, setQuery] = useState("");
  const [callAsk, setCallAsk] = useState("");
  const [addressDraft, setAddressDraft] = useState(null);
  const [board, setBoard] = useState(null);
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState(null);
  const [editVisit, setEditVisit] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    let ignore = false;
    setBusy("load");
    const params = new URLSearchParams({ day });
    if (technicianIds.length) params.set("technicianIds", technicianIds.join(","));
    authFetch(`/api/entretien/tour?${params}`)
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Tournée indisponible");
        if (!ignore) setBoard(payload);
      })
      .catch(error => {
        if (!ignore) toastRef.current?.(String(error?.message || "Tournée indisponible"));
      })
      .finally(() => {
        if (!ignore) setBusy("");
      });
    return () => {
      ignore = true;
    };
  }, [day, technicianIds, refresh]);

  const technicians = useMemo(() => {
    const fromApi = (board?.technicians || []).map(tech => ({
      id: tech.id,
      full_name: tech.name,
      role: tech.role,
      active: tech.active,
    }));
    const fromTeam = (team || []).map(user => ({
      id: user.supabaseId || user.id,
      full_name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    }));
    const seen = new Set();
    return pickTourTechnicians([...fromTeam, ...fromApi]).filter(tech => {
      const id = String(tech.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [board, team]);
  const boards = board?.boards || [];
  const week = board?.week?.length
    ? board.week
    : tourWeekDays(day).map(iso => ({
      day: iso,
      filled: 0,
      anchor: null,
      extras: [],
      slots: TOUR_SLOTS.map(time => ({ time })),
    }));
  const weekStart = week[0]?.day || startOfWeekMonday(day);
  const weekEnd = week[week.length - 1]?.day || weekStart;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return board?.suggestions || [];
    return (board?.directory || [])
      .filter(row => entretienSearchMatches(`${row.name} ${row.city} ${row.postal} ${row.phone}`, q))
      .slice(0, 20);
  }, [board, query]);

  function toggleTechnician(id) {
    setTechnicianIds(current => (
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    ));
  }

  function technicianForBooking(chosen) {
    if (technicianIds.length === 1) return technicianIds[0];
    return technicianIds.includes(chosen) ? chosen : "";
  }

  function modeOf(id) {
    const mode = modes[id];
    return TOUR_PRESTATIONS.some(item => item.id === mode) ? mode : "maintenance";
  }

  async function post(action, row, extra = {}) {
    const technicianId = action === "book"
      ? technicianForBooking(extra.technicianId)
      : action === "book-service"
        ? String(extra.technicianId || "")
        : "";
    if ((action === "book" || action === "book-service") && !technicianId) {
      const message = technicianIds.length ? "Choisissez le technicien pour ce rendez-vous." : "Choisissez au moins un technicien.";
      toast?.(message);
      return message;
    }
    if ((action === "book" || action === "move" || action === "book-service") && !extra.time) {
      const message = "Indiquez l’heure convenue avec le client.";
      toast?.(message);
      return message;
    }
    setBusy(row.clientId || action);
    try {
      const response = await authFetch("/api/entretien/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          clientId: row.clientId,
          contractId: row.contractId,
          title: `Entretien ${row.name || ""}`.trim(),
          location: locationOf(row),
          ...extra,
          technicianId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible");
      if (action === "stop") {
        if (payload.covered) {
          await downloadHtmlAsPdf(warrantyWaiverLetterHtml({
            company,
            clientName: row.name,
            clientAddress: locationOf(row),
            installedOn: payload.installedOn,
            endsOn: payload.endsOn,
            years: payload.years,
            equipment: payload.equipment,
            reason: payload.reason,
            today: extra.day,
          }), {
            filename: `Renonciation-garantie-${row.name || "client"}`,
            title: "Renonciation à la garantie",
            toast,
          });
          toast?.("Arrêt enregistré. Le courrier de renonciation est prêt.");
        } else {
          toast?.("Arrêt enregistré. La garantie est déjà terminée : pas de courrier.");
        }
      }
      if (action === "book" || action === "book-service") {
        toast?.(`Posé à ${payload.time || extra.time}.`);
        if (extra.day) setDay(extra.day);
      }
      if (action === "move") toast?.(`Heure modifiée : ${payload.time || extra.time}.`);
      if (action === "cancel") toast?.("Rendez-vous annulé.");
      setEditVisit(null);
      if (action === "last") toast?.("Dernier entretien enregistré.");
      if (action === "callback") toast?.(`Rappel le ${frDate(extra.day)}.`);
      if (action === "address") {
        toast?.("Adresse enregistrée.");
        setAddressDraft(null);
        setCallAsk("");
      }
      setDraft(null);
      if (action !== "address") setQuery("");
      setRefresh(value => value + 1);
      onPlanned?.();
      return "";
    } catch (error) {
      const message = String(error?.message || "Enregistrement impossible");
      toast?.(message);
      return message;
    } finally {
      setBusy("");
    }
  }

  const anchor = board?.anchor;
  const hint = query.trim().length >= 2
    ? "Tous les contrats qui correspondent. S’il a déjà été fait, indiquez la date. S’il faut rappeler plus tard, posez le jour."
    : anchor
      ? `La journée du ${dayTitle(day)} part de ${anchor.name}${anchor.city ? ` · ${anchor.city}` : ""}. Les prochains appels sont autour de ce rendez-vous, dans les ${board?.radiusKm || 30} km, les plus en retard d’abord.`
      : `Aucun rendez-vous le ${dayTitle(day)}. Les plus urgents d’abord. Le premier oui devient la base de cette journée.`;

  return (
    <div className="entretien-tour">
      <section className="prospect-section prospect-section-wide">
        <h3>1. Techniciens</h3>
        <p className="entretien-tour-hint">Choisissez un ou plusieurs techniciens. Le responsable technique n’est pas pris automatiquement.</p>
        <div className="prospect-chips" aria-label="Techniciens de la tournée">
          {technicians.map(tech => {
            const selected = technicianIds.includes(tech.id);
            return (
              <button
                type="button"
                key={tech.id}
                className={selected ? "selected" : ""}
                aria-pressed={selected}
                onClick={() => toggleTechnician(tech.id)}
              >
                {tech.name}{tech.role ? ` · ${tech.role}` : ""}
              </button>
            );
          })}
        </div>
        {!technicians.length && busy !== "load" && <p>Aucun compte avec le rôle Technicien dans Utilisateurs.</p>}
      </section>

      <section className="prospect-section prospect-section-wide">
        <div className="entretien-tour-weekbar">
          <button className="secondary" type="button" onClick={() => setDay(addDaysIso(startOfWeekMonday(day), -7))}>Semaine précédente</button>
          <b>Semaine du {frDate(weekStart)} au {frDate(weekEnd)}</b>
          <button className="secondary" type="button" onClick={() => setDay(addDaysIso(startOfWeekMonday(day), 7))}>Semaine suivante</button>
        </div>
        <p className="entretien-tour-hint">Chaque jour se remplit de la même façon. Le rendez-vous posé devient la base des appels de cette journée.</p>
        {(boards.length ? boards : [{ technicianId: "", name: "", week }]).map(item => (
          <div key={item.technicianId || "semaine"} className={item.name ? "entretien-tech-board" : undefined}>
            {item.name ? (
              <h3 className="entretien-tour-board-name">
                <select
                  aria-label={`Prestation pour ${item.name}`}
                  value={modeOf(item.technicianId)}
                  onChange={event => setModes(current => ({ ...current, [item.technicianId]: event.target.value }))}
                >
                  {TOUR_PRESTATIONS.map(choice => (
                    <option key={choice.id} value={choice.id}>{choice.label}</option>
                  ))}
                </select>
                <span>{item.name}</span>
              </h3>
            ) : null}
            <WeekColumns week={item.week} day={day} onPickDay={setDay} />
          </div>
        ))}
      </section>

      <section className="prospect-section prospect-section-wide">
        <h3>2. Rendez-vous · {dayTitle(day)}</h3>
        {(boards.length ? boards : [{ technicianId: "", name: "", week }]).map(item => (
          <div key={item.technicianId || "jour"}>
            {item.name ? <p className="entretien-tour-tech">{item.name}</p> : null}
            <DayPlan
              day={day}
              column={(item.week || []).find(column => column.day === day)}
              editVisit={editVisit}
              setEditVisit={setEditVisit}
              busy={busy}
              toast={toast}
              callAsk={callAsk}
              setCallAsk={setCallAsk}
              onMove={(visit, next) => {
                const site = confirmedSite(next);
                if (!site.ok) return toast?.(site.error);
                post("move", { id: visit.id, name: visit.clientName, clientId: visit.clientId }, {
                  visitId: visit.id,
                  day: next.day,
                  time: next.time,
                  address: site.address,
                  postal: site.postal,
                  city: site.city,
                  location: site.location,
                });
              }}
              onCancel={visit => {
                if (!window.confirm(`Annuler le rendez-vous de ${visit.clientName || "ce client"} à ${visit.time} ?`)) return;
                post("cancel", { id: visit.id, name: visit.clientName }, { visitId: visit.id });
              }}
            />
          </div>
        ))}
      </section>

      {technicians.filter(tech => technicianIds.includes(tech.id) && modeOf(tech.id) !== "maintenance").map(tech => (
        <section className="prospect-section prospect-section-wide" key={tech.id}>
          <h3>{prestationLabel(modeOf(tech.id))} · {tech.name}</h3>
          <ServiceBooking
            tech={tech}
            prestation={modeOf(tech.id)}
            day={day}
            clients={clients}
            busy={busy}
            onBook={(row, extra) => post("book-service", row, extra)}
          />
        </section>
      ))}

      {(!technicianIds.length || technicians.some(tech => technicianIds.includes(tech.id) && modeOf(tech.id) === "maintenance")) && (
      <section className="prospect-section prospect-section-wide">
        <h3>3. À appeler · {dayTitle(day)}</h3>
        <p className="entretien-tour-hint">{hint}</p>
        <input
          className="entretien-tour-search"
          type="search"
          placeholder="Nom, ville ou téléphone"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        {busy === "load" && !board && <p>Chargement des clients à appeler…</p>}
        <div className="entretien-tour-list">
          {shown.map(row => {
            const open = draft?.clientId === row.clientId ? draft.kind : "";
            const working = busy === row.clientId;
            return (
              <article key={row.clientId} className={`entretien-tour-card tone-${row.tone || "premier"}`}>
                <header>
                  <div>
                    <b>{row.name}</b>
                    <small>{[row.postal, row.city].filter(Boolean).join(" ")}{row.address ? ` · ${row.address}` : ""}</small>
                  </div>
                  <span>{row.label}</span>
                </header>
                {row.phone && (
                  <CallPhone
                    phone={row.phone}
                    parts={missingAddressParts(row)}
                    onAsk={() => setCallAsk(`row:${row.clientId}`)}
                  />
                )}
                {callAsk === `row:${row.clientId}` && (
                  <AddressCallNotice
                    parts={missingAddressParts(row)}
                    onComplete={() => {
                      setCallAsk("");
                      setAddressDraft({ clientId: row.clientId, address: row.address || "", postal: row.postal || "", city: row.city || "" });
                    }}
                    onCall={() => { setCallAsk(""); dialPhone(row.phone); }}
                  />
                )}
                {addressDraft?.clientId === row.clientId && (
                  <form className="entretien-tour-book" onSubmit={event => {
                    event.preventDefault();
                    const site = confirmedSite(addressDraft);
                    if (!site.ok) return toast?.(site.error);
                    post("address", row, { address: site.address, postal: site.postal, city: site.city });
                  }}>
                    <SiteConfirm draft={addressDraft} setDraft={setAddressDraft} />
                    <button className="primary" type="submit" disabled={busy === row.clientId}>Enregistrer l’adresse</button>
                  </form>
                )}
                {row.km != null && <small>{String(row.km).replace(".", ",")} km</small>}
                {!row.planned && row.tone !== "arret" && (
                  <div className="entretien-tour-actions">
                    <button className="primary" type="button" disabled={Boolean(busy)} onClick={() => setDraft({ clientId: row.clientId, kind: "book", time: "", day, technicianId: technicianIds.length === 1 ? technicianIds[0] : "", address: row.address || "", postal: row.postal || "", city: row.city || "" })}>Il accepte</button>
                    <button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setDraft({ clientId: row.clientId, kind: "last", date: "" })}>Dernier entretien</button>
                    <button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setDraft({ clientId: row.clientId, kind: "callback", date: "" })}>Rappeler le</button>
                    <button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => setDraft({ clientId: row.clientId, kind: "stop", reason: "refus", installedOn: "", years: DEFAULT_WARRANTY_YEARS, equipment: row.equipment || "" })}>N’en veut plus</button>
                  </div>
                )}
                {open === "book" && (
                  <form className="entretien-tour-book" onSubmit={event => {
                    event.preventDefault();
                    const site = confirmedSite(draft);
                    if (!site.ok) return toast?.(site.error);
                    if (!draft.time) return toast?.("Indiquez l’heure convenue avec le client.");
                    post("book", row, { day: draft.day || day, time: draft.time, technicianId: draft.technicianId, address: site.address, postal: site.postal, city: site.city, location: site.location });
                  }}>
                    <p className="entretien-tour-note">Heure convenue au téléphone pour le {dayTitle(draft.day || day)}. Rien n’est posé tant que vous n’enregistrez pas.</p>
                    <SiteConfirm draft={draft} setDraft={setDraft} />
                    <div className="entretien-tour-when">
                      <label>
                        Jour
                        <input type="date" value={draft.day || day} onChange={event => setDraft({ ...draft, day: event.target.value })} required />
                      </label>
                      <label>
                        Heure convenue
                        <input type="time" value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value })} required />
                      </label>
                    </div>
                    <div className="prospect-chips" aria-label="Créneaux de tournée">
                      {TOUR_SLOTS.map(time => (
                        <button type="button" key={time} className={draft.time === time ? "selected" : ""} onClick={() => setDraft({ ...draft, time })}>{time}</button>
                      ))}
                    </div>
                    {technicianIds.length > 1 && (
                      <>
                        <p className="entretien-tour-note">Technicien pour ce rendez-vous</p>
                        <div className="prospect-chips" aria-label="Technicien pour ce rendez-vous">
                          {technicians.filter(tech => technicianIds.includes(tech.id)).map(tech => (
                            <button type="button" key={tech.id} className={draft.technicianId === tech.id ? "selected" : ""} onClick={() => setDraft({ ...draft, technicianId: tech.id })}>{tech.name}</button>
                          ))}
                        </div>
                      </>
                    )}
                    <button className="primary" type="submit" disabled={working}>Poser cette heure</button>
                  </form>
                )}
                {open === "last" && (
                  <form className="entretien-tour-inline" onSubmit={event => {
                    event.preventDefault();
                    if (!draft.date) return toast?.("Indiquez la date de l’entretien déjà fait.");
                    post("last", row, { day: draft.date });
                  }}>
                    <label>
                      Date réelle
                      <input type="date" max={todayIso()} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} required />
                    </label>
                    <button className="primary" type="submit" disabled={working}>Enregistrer</button>
                  </form>
                )}
                {open === "stop" && (
                  <StopForm
                    draft={draft}
                    setDraft={setDraft}
                    working={working}
                    busy={busy}
                    onSubmit={() => post("stop", row, {
                      day: todayIso(),
                      reason: draft.reason,
                      installedOn: draft.installedOn,
                      warrantyYears: draft.years,
                      equipment: draft.equipment,
                    })}
                    toast={toast}
                  />
                )}
                {open === "callback" && (
                  <form className="entretien-tour-inline" onSubmit={event => {
                    event.preventDefault();
                    if (!draft.date) return toast?.("Indiquez le jour du rappel.");
                    post("callback", row, { day: draft.date });
                  }}>
                    <label>
                      Rappeler le
                      <input type="date" min={todayIso()} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} required />
                    </label>
                    <button className="primary" type="submit" disabled={working}>Enregistrer</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
        {board && !shown.length && <p>Aucun client à proposer pour l’instant. Cherchez un nom, ou changez de jour.</p>}
      </section>
      )}
    </div>
  );
}
