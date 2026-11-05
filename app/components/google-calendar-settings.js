"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";

const GOOGLE_MESSAGES = {
  connected: "Compte Google connecté. Synchronisation de l’agenda…",
  denied: "Connexion Google annulée.",
  missing: "Google Calendar n’est pas encore configuré sur le serveur.",
  invalid: "Session Google invalide. Reconnectez-vous.",
  error: "Enregistrement Google impossible. Vérifiez la table google_calendar_accounts (migration SQL).",
};

function formatSyncMessage(data) {
  const imported = Number(data.imported || 0);
  const found = Number(data.found || 0);
  const synced = Number(data.synced || 0);
  const updated = Number(data.updated || 0);
  if (imported) {
    return `${imported} événement${imported > 1 ? "s" : ""} Google ${imported > 1 ? "sont apparus" : "est apparu"} dans l’agenda CRM.`;
  }
  if (updated) {
    return `${updated} événement${updated > 1 ? "s" : ""} Google ${updated > 1 ? "ont été mis à jour" : "a été mis à jour"} avec le titre et le détail.`;
  }
  if (found) {
    return `${found} événement${found > 1 ? "s" : ""} Google déjà présent${found > 1 ? "s" : ""} dans l’agenda CRM.`;
  }
  if (synced) {
    const agendas = Number(data.calendars || 0);
    return `${synced} rendez-vous CRM envoyé${synced > 1 ? "s" : ""} vers Google.${agendas ? ` ${agendas} agendas Google ont été lus.` : ""}`;
  }
  const agendas = Number(data.calendars || 0);
  return agendas
    ? `Aucun événement trouvé sur ${agendas} agenda${agendas > 1 ? "s" : ""} Google (30 derniers jours à 4 mois).`
    : "Aucun événement trouvé (30 derniers jours à 4 mois). Vérifiez les agendas cochés dans Google Agenda.";
}

export default function GoogleCalendarSettings({ onSynced, onCalendars }) {
  const [state, setState] = useState({ loading: true, configured: false, account: null, calendars: [], message: "" });

  async function load(message = "") {
    setState(current => ({ ...current, loading: true }));
    try {
      const response = await authFetch("/api/google/calendar/sync");
      const data = await response.json().catch(() => ({}));
      setState({
        loading: false,
        configured: Boolean(data.configured),
        account: data.account || null,
        calendars: data.calendars || [],
        message,
      });
      onCalendars?.(data.calendars || []);
      return data;
    } catch {
      setState({ loading: false, configured: false, account: null, calendars: [], message: "Agenda Google indisponible." });
      return null;
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google");
    (async () => {
      await load(GOOGLE_MESSAGES[status] || "");
      if (status === "connected") await syncNow();
      if (status) {
        params.delete("google");
        const query = params.toString();
        history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      }
    })();
  }, []);

  async function connect() {
    const response = await authFetch("/api/google/calendar/connect");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState(current => ({ ...current, message: data.error || "Connexion Google impossible." }));
      return;
    }
    window.location.href = data.url;
  }

  async function syncNow() {
    setState(current => ({ ...current, message: "Synchronisation des agendas cochés dans Google…" }));
    const response = await authFetch("/api/google/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    const message = response.ok ? formatSyncMessage(data) : (data.error || "Erreur de synchronisation");
    await load(message);
    if (response.ok) onSynced?.();
  }

  async function disconnect() {
    await authFetch("/api/google/calendar/sync", { method: "DELETE" });
    load("Compte Google déconnecté. L’agenda CRM reste actif.");
  }

  const connected = state.account?.status === "connected";

  return (
    <section className="google-calendar-card">
      <div className="google-calendar-head">
        <CalendarDays size={18} />
        <div>
          <h3>Google Calendar</h3>
          <p>Chaque utilisateur connecte son propre compte Google. La synchro importe les agendas déjà cochés dans son Google Agenda. Le menu Agendas Google sert à les afficher ou les masquer dans son agenda CRM. Les rendez-vous CRM partent vers l’agenda principal, sans créer de prospect.</p>
        </div>
      </div>
      {state.loading && <span>Chargement…</span>}
      {state.message && <b className="google-calendar-message">{state.message}</b>}
      {!state.configured && !state.loading && (
        <p className="google-calendar-missing">
          La connexion n’est pas encore active : il manque les identifiants OAuth Google sur le serveur
          (<code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REDIRECT_URI</code>).
        </p>
      )}
      {connected ? (
        <>
          <p>Compte connecté : <b>{state.account.email || "Google"}</b></p>
          <p>Dernière sync : {state.account.lastSyncedAt ? new Date(state.account.lastSyncedAt).toLocaleString("fr-FR") : "jamais"}</p>
          {state.account.lastError && <p className="google-calendar-error">Erreur : {state.account.lastError}</p>}
          <div className="google-calendar-actions">
            <button type="button" className="secondary" onClick={() => syncNow()}>Synchroniser les agendas cochés dans Google</button>
            <button type="button" onClick={disconnect}>Déconnecter mon compte</button>
          </div>
        </>
      ) : (
        <button type="button" className="primary" onClick={connect} disabled={!state.configured || state.loading}>
          Connecter mon compte Google
        </button>
      )}
    </section>
  );
}
