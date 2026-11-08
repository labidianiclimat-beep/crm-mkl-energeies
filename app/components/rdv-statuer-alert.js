"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { allowedRdvStatusesFor, normalizeAgendaStatus } from "../lib/appointment-status";
import {
  advanceStatuerAlert,
  dismissStatuerAlert,
  formatStatuerWhen,
  overdueUnstatuedAppointments,
  readSessionConnectionId,
  readStatuerAlert,
  receivesStatuerAlerts,
  statuerAlertCopy,
  statuerAlertShows,
  writeStatuerAlert,
} from "../lib/rdv-statuer-alert";

export default function RdvStatuerAlert({ profile, userId, appointments, onUpdate }) {
  const applies = receivesStatuerAlerts(profile);
  const overdue = useMemo(
    () => (applies ? overdueUnstatuedAppointments(appointments, userId) : []),
    [applies, appointments, userId]
  );
  const overdueKey = overdue.map(item => item.id).join(",");
  const [record, setRecord] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!applies || !userId || typeof localStorage === "undefined") return;
    const connectionId = readSessionConnectionId(localStorage);
    const previous = readStatuerAlert(localStorage, userId);
    const next = advanceStatuerAlert(previous, { connectionId, hasOverdue: overdue.length > 0 });
    const same = previous.step === next.step
      && previous.connectionId === next.connectionId
      && previous.dismissed === next.dismissed;
    if (!same) writeStatuerAlert(localStorage, userId, next);
    setRecord(next);
  }, [applies, userId, overdueKey, overdue.length]);

  if (!statuerAlertShows(record, overdue.length)) return null;

  const blocking = record.step >= 3;
  const sentence = statuerAlertCopy(record.step, overdue.length);

  function dismiss() {
    if (blocking) return;
    const next = dismissStatuerAlert(record);
    writeStatuerAlert(localStorage, userId, next);
    setRecord(next);
  }

  async function chooseStatus(item, status) {
    if (normalizeAgendaStatus(status) === "Non statué") return;
    setBusyId(item.id);
    setError("");
    try {
      await onUpdate(item, { status });
    } catch (updateError) {
      setError(String(updateError?.message || "Ce statut ne peut pas être posé."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div
      className={`backdrop rdv-statuer-backdrop${blocking ? " is-blocking" : ""}`}
      onMouseDown={event => {
        if (!blocking && event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="modal agenda-welcome-modal rdv-statuer-modal" role="dialog" aria-modal="true" aria-labelledby="rdv-statuer-title">
        <header className="agenda-welcome-head">
          <div className="agenda-welcome-brand">
            <span className="agenda-welcome-mark"><AlertTriangle size={18}/></span>
            <div>
              <p>{blocking ? "Espace CRM" : record.step === 2 ? "Deuxième alerte" : "Première alerte"}</p>
              <h2 id="rdv-statuer-title">{sentence}</h2>
            </div>
          </div>
        </header>
        <p className="agenda-welcome-lead">Rendez-vous à statuer. Le délai de cinq heures après l’heure prévue est passé.</p>
        <div className="agenda-welcome-body">
          <div className="rdv-statuer-list">
            {overdue.map(item => {
              const place = [item.city, item.address].filter(Boolean).join(" · ");
              return (
                <div className="rdv-statuer-row" key={item.id}>
                  <div>
                    <b>{item.prospectName || item.subject || "Rendez-vous"}</b>
                    <span className="rdv-statuer-when">{formatStatuerWhen(item.start)}{place ? ` · ${place}` : ""}</span>
                  </div>
                  <label>
                    <span className="rdv-statuer-label">Statut</span>
                    <select
                      value={normalizeAgendaStatus(item.status)}
                      disabled={busyId === item.id}
                      onChange={event => chooseStatus(item, event.target.value)}
                    >
                      {allowedRdvStatusesFor(profile, userId, item).map(status => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
        {error ? <p className="rdv-statuer-error" role="alert">{error}</p> : null}
        <div className="agenda-welcome-footer">
          {blocking
            ? <p className="rdv-statuer-lock">Choisissez un statut pour chaque rendez-vous. L’espace se rouvre ensuite.</p>
            : <button type="button" className="primary" onClick={dismiss}>Continuer</button>}
        </div>
      </div>
    </div>
  );
}
