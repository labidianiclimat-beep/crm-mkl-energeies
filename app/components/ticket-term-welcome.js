"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, X } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import {
  formatRequestNumber,
  isRequestOverdue,
  parisCalendarDay,
  requestConcernsUser,
  requestStatusMeta,
  rowForRules,
  ticketDueAt,
  ticketsAtTerm,
} from "../lib/internal-requests";

export const TICKET_TERM_SHOWN_KEY = "mkl-ticket-term-shown";

function formatDue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function termBucket(row, now) {
  const dueDay = parisCalendarDay(ticketDueAt(row));
  const today = parisCalendarDay(now);
  if (dueDay && today && dueDay < today) return "En retard";
  if (isRequestOverdue(rowForRules(row), now)) return "En retard";
  return "Aujourd’hui";
}

export default function TicketTermWelcome({ onNavigate, onOpenTicket }) {
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);
  const now = useMemo(() => new Date(), [tickets]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/internal-requests")
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (cancelled) return;
        const mine = (data?.requests || []).filter(item => requestConcernsUser(item, data?.me?.id));
        setTickets(ticketsAtTerm(mine));
      })
      .catch(() => {
        if (!cancelled) setTickets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tickets.length) return;
    try {
      if (sessionStorage.getItem(TICKET_TERM_SHOWN_KEY) === "1") return;
      sessionStorage.setItem(TICKET_TERM_SHOWN_KEY, "1");
    } catch {
      // Si le navigateur refuse sessionStorage, la fenêtre ne s’ouvre qu’au montage courant.
    }
    setOpen(true);
  }, [tickets]);

  const lateCount = tickets.filter(item => termBucket(item, now) === "En retard").length;
  const todayCount = tickets.length - lateCount;
  const urgentCount = tickets.filter(item => item.priority === "urgent").length;

  function close() {
    setOpen(false);
  }

  function openTickets(id) {
    close();
    if (id && onOpenTicket) {
      onOpenTicket(id);
      return;
    }
    onNavigate?.("Tickets internes");
  }

  const chip = tickets.length > 0 && (
    <button type="button" className={`agenda-notice-chip ${lateCount ? "late" : ""}`} onClick={() => setOpen(true)}>
      <span className="agenda-notice-chip-icon"><Inbox size={16}/></span>
      <span>
        <b>{tickets.length} ticket{tickets.length > 1 ? "s" : ""} à terme</b>
        <small>{lateCount ? `${lateCount} en retard` : "Échéance du jour"}</small>
      </span>
    </button>
  );

  return <>
    {chip}
    {open && tickets.length > 0 && (
      <div className="backdrop agenda-welcome-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
        <div className="modal agenda-welcome-modal ticket-term-modal" role="dialog" aria-labelledby="ticket-term-title" aria-modal="true">
          <header className="agenda-welcome-head">
            <div className="agenda-welcome-brand">
              <span className="agenda-welcome-mark"><Inbox size={18}/></span>
              <div>
                <p>Tickets internes · MKL Énergies</p>
                <h2 id="ticket-term-title">Tickets à terme</h2>
              </div>
            </div>
            <button className="agenda-welcome-close" type="button" aria-label="Fermer" onClick={close}><X size={16}/></button>
          </header>
          <p className="agenda-welcome-lead">
            {tickets.length === 1
              ? "Un ticket a atteint son échéance."
              : `${tickets.length} tickets ont atteint leur échéance.`}
          </p>
          <div className="agenda-welcome-kpis">
            <div className={lateCount ? "late" : ""}>
              <span>En retard</span>
              <b>{lateCount}</b>
            </div>
            <div>
              <span>Aujourd’hui</span>
              <b>{todayCount}</b>
            </div>
            <div className={urgentCount ? "late" : ""}>
              <span>Urgents</span>
              <b>{urgentCount}</b>
            </div>
          </div>
          <div className="agenda-welcome-body">
            <div className="ticket-term-list">
              {tickets.map(item => {
                const late = termBucket(item, now) === "En retard";
                const reference = item.reference || formatRequestNumber(item.number) || "Ticket";
                const status = item.statusLabel || requestStatusMeta(item.status).label;
                return (
                  <button
                    type="button"
                    className={`ticket-term-row${late ? " late" : ""}${item.priority === "urgent" ? " urgent" : ""}`}
                    key={item.id}
                    onClick={() => openTickets(item.id)}
                  >
                    <div className="ticket-term-when">
                      <small>{late ? "En retard" : "Aujourd’hui"}</small>
                      <b>{reference}</b>
                      <span>{formatDue(ticketDueAt(item))}</span>
                    </div>
                    <div className="ticket-term-who">
                      <em>{item.priority === "urgent" ? "Urgent" : status}</em>
                      <b>{item.title || "Ticket"}</b>
                      <span>{item.assigneeName ? `Destinataire · ${item.assigneeName}` : status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="agenda-welcome-footer">
            <button type="button" className="secondary" onClick={close}>Continuer</button>
            <button type="button" className="primary" onClick={() => openTickets()}><Inbox size={16}/>Ouvrir les tickets</button>
          </div>
        </div>
      </div>
    )}
  </>;
}
