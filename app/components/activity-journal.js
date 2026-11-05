"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { actionLabel } from "../lib/activity-logs";
import { defaultUsageRange } from "../lib/usage";
import { authFetch } from "../lib/supabase-rest";

function formatWhen(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatClock(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function ActivityJournalView({ query = "" }) {
  const defaults = defaultUsageRange();
  const [tab, setTab] = useState("temps");
  const [fromDay, setFromDay] = useState(defaults.fromDay);
  const [toDay, setToDay] = useState(defaults.toDay);
  const [report, setReport] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openUser, setOpenUser] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [usageResponse, logsResponse] = await Promise.all([
          authFetch(`/api/usage/report?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`),
          authFetch("/api/activity-logs?limit=200"),
        ]);
        const usageData = await usageResponse.json().catch(() => ({}));
        const logsData = await logsResponse.json().catch(() => ({}));
        if (!logsResponse.ok) throw new Error(logsData.error || "Journal indisponible");
        if (cancelled) return;
        setLogs(logsData.logs || []);
        if (!usageResponse.ok) {
          setReport(null);
          setError(usageData.error || "Temps passé indisponible");
        } else {
          setReport(usageData);
        }
      } catch (err) {
        if (!cancelled) setError(String(err?.message || "Journal indisponible"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromDay, toDay]);

  const needle = query.trim().toLowerCase();
  const users = useMemo(() => {
    const list = report?.users || [];
    if (!needle) return list;
    return list.filter(user => {
      const haystack = [
        user.userName,
        user.role,
        user.email,
        ...(user.days || []).flatMap(day => [
          day.label,
          ...(day.modules || []),
          ...(day.actions || []).map(action => `${action.label} ${action.entityLabel}`),
        ]),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [needle, report]);

  const filteredLogs = useMemo(() => {
    if (!needle) return logs;
    return logs.filter(log =>
      [actionLabel(log.action), log.entityLabel, log.entityType, log.userName, log.module]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [logs, needle]);

  return (
    <div className="module-content">
      <div className="module-top">
        <div>
          <p>ADMINISTRATION</p>
          <h1>Journal d’activités</h1>
          <span>Temps passé et actions de chaque utilisateur — Admin VIP uniquement</span>
        </div>
        <div className="module-actions">
          <section className="activity-journal">
            <div className="usage-toolbar">
              <div className="usage-tabs">
                <button type="button" className={tab === "temps" ? "active" : ""} onClick={() => setTab("temps")}>Temps passé</button>
                <button type="button" className={tab === "actions" ? "active" : ""} onClick={() => setTab("actions")}>Actions</button>
              </div>
              {tab === "temps" && (
                <div className="usage-range">
                  <label>Du
                    <input type="date" value={fromDay} max={toDay} onChange={event => setFromDay(event.target.value)} />
                  </label>
                  <label>Au
                    <input type="date" value={toDay} min={fromDay} onChange={event => setToDay(event.target.value)} />
                  </label>
                </div>
              )}
            </div>
            <p className="usage-hint">Le temps est compté tant que l’onglet CRM reste visible. Un onglet en arrière-plan ou un écran verrouillé arrête le compteur.</p>
            {loading && <p className="dashboard-loading">Chargement du journal…</p>}
            {error && tab === "temps" && <p className="access-info">{error}</p>}

            {!loading && !error && tab === "temps" && !users.length && (
              <p className="access-info">{(report?.users || []).length ? "Aucun résultat pour cette recherche." : "Aucun utilisateur à afficher."}</p>
            )}
            {!loading && !error && tab === "temps" && (
              <div className="usage-user-list">
                {users.map(user => {
                  const expanded = openUser === user.userId;
                  return (
                    <article key={user.userId} className={`usage-user-card ${expanded ? "open" : ""}`}>
                      <button type="button" className="usage-user-head" onClick={() => setOpenUser(expanded ? "" : user.userId)}>
                        <div className="usage-avatar">{(user.userName || "?")[0].toUpperCase()}</div>
                        <div>
                          <b>{user.userName}</b>
                          <span>{user.role || "Profil"}{user.active ? "" : " · inactif"}</span>
                        </div>
                        <strong>{user.durationLabel}</strong>
                        <ChevronRight size={16} />
                      </button>
                      {expanded && (
                        <div className="usage-user-body">
                          {!user.days.length && <p className="access-info">Pas de connexion sur cette période.</p>}
                          {user.days.map(day => (
                            <div key={day.day} className="usage-day">
                              <div className="usage-day-head">
                                <div>
                                  <b>{day.label}</b>
                                  <span>{day.modules.join(" · ") || "Navigation"}</span>
                                </div>
                                <em>{day.durationLabel}</em>
                              </div>
                              {day.sessions.map(session => (
                                <small key={`${session.startedAt}-${session.lastSeenAt}`} className="usage-session">
                                  {formatClock(session.startedAt)} – {formatClock(session.lastSeenAt)} · {session.durationLabel}
                                  {session.modules.length ? ` · ${session.modules.join(", ")}` : ""}
                                </small>
                              ))}
                              <div className="usage-day-actions">
                                {!day.actions.length && <p className="access-info">Aucune action enregistrée ce jour-là.</p>}
                                {day.actions.map(action => (
                                  <article key={action.id} className="activity-journal-item">
                                    <div>
                                      <b>{action.label}</b>
                                      <span>{action.entityLabel || action.module || "—"}</span>
                                    </div>
                                    <small>{formatWhen(action.at)}</small>
                                  </article>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {!loading && tab === "actions" && !filteredLogs.length && (
              <p className="access-info">{logs.length ? "Aucun résultat pour cette recherche." : "Aucune action journalisée pour le moment."}</p>
            )}
            {!loading && tab === "actions" && (
              <div className="activity-journal-list">
                {filteredLogs.map(log => (
                  <article key={log.id} className="activity-journal-item">
                    <div>
                      <b>{actionLabel(log.action)}</b>
                      <span>{log.entityLabel || log.entityType || "—"}</span>
                    </div>
                    <small>{log.userName || "Système"} · {log.module || ""}{log.module ? " · " : ""}{formatWhen(log.createdAt)}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
