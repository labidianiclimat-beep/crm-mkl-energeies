"use client";

import { useState } from "react";
import { CalendarDays, Car, FileText, Flame, Smartphone, Sun, Table2, X } from "lucide-react";
import {
  COMMERCIAL_HOME_APPS,
  commercialHomeFirstName,
} from "../lib/commercial-home";
import TicketTermWelcome from "./ticket-term-welcome";
import GoogleCalendarSettings from "./google-calendar-settings";
import InstallAppButton from "./install-app-button";

const APP_ICONS = {
  rdv: Table2,
  agenda: CalendarDays,
  devis: FileText,
  thermal: Flame,
  pv: Sun,
  fleet: Car,
};

function formatHomeClock(now = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now);
}

function formatHomeDate(now = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(now);
}

export function CommercialHomeScreen({ userName = "Commercial", onOpen, framed = false }) {
  const firstName = commercialHomeFirstName(userName);
  const screen = (
    <div className="iphone-wallpaper">
      <div className="iphone-status" aria-hidden="true">
        <b>{formatHomeClock()}</b>
        <i className="iphone-notch"/>
        <span className="iphone-status-pips"><em/><em/><em/></span>
      </div>
      <header className="iphone-hello">
        <p>MKL Énergies</p>
        <h2>Bonjour {firstName}</h2>
        <span>{formatHomeDate()}</span>
      </header>
      <div className="iphone-app-grid">
        {COMMERCIAL_HOME_APPS.map(app => {
          const Icon = APP_ICONS[app.id] || FileText;
          return (
            <button
              key={app.id}
              type="button"
              className="iphone-app"
              onClick={() => onOpen?.(app)}
            >
              <span className={`iphone-app-icon${app.color === "#ffcc00" ? " is-sun" : ""}`} style={{ "--app-color": app.color }}>
                <Icon size={28} strokeWidth={1.8}/>
              </span>
              <b>{app.label}</b>
            </button>
          );
        })}
      </div>
      <footer className="iphone-brand">
        <img className="iphone-logo" src="/mkl-energies.png" alt="MKL Énergies" />
      </footer>
      <div className="iphone-dock" aria-hidden="true">
        <i/>
      </div>
    </div>
  );

  if (!framed) return screen;
  return (
    <div className="iphone-frame" aria-label="Accueil commercial">
      <div className="iphone-bezel">{screen}</div>
    </div>
  );
}

export default function CommercialHome({
  userName = "Commercial",
  onOpen,
  appointments = [],
  onNavigate,
  onUpdateAppointment,
  toast,
  onGoogleSynced,
  canEditAppointments = true,
}) {
  return (
    <div className="content commercial-home">
      <div className="commercial-home-bar">
        <div>
          <p>APPLICATION COMMERCIALE</p>
          <h1>Mes applications</h1>
          <span>Agenda, devis et études</span>
        </div>
        <div className="commercial-home-actions">
          <TicketTermWelcome onNavigate={onNavigate} />
          <InstallAppButton/>
        </div>
      </div>
      <div className="commercial-home-connect">
        <GoogleCalendarSettings onSynced={onGoogleSynced}/>
      </div>
      <div className="commercial-home-stage">
        <CommercialHomeScreen userName={userName} onOpen={onOpen} framed/>
      </div>
    </div>
  );
}

export function CommercialHomePreviewButton({ userName = "Commercial", onOpen }) {
  const [open, setOpen] = useState(false);

  function openApp(app) {
    setOpen(false);
    onOpen?.(app);
  }

  return (
    <>
      <button type="button" className="commercial-home-preview-btn" onClick={() => setOpen(true)}>
        <Smartphone size={18}/>
        <span>
          <b>Accueil commercial</b>
          <small>Visuel iPhone à l’allumage</small>
        </span>
      </button>
      {open && (
        <div className="backdrop commercial-home-preview-backdrop">
          <div className="commercial-home-preview">
            <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fermer">
              <X/>
            </button>
            <p>APERÇU ADMIN VIP</p>
            <h2>Page commerciale à l’ouverture</h2>
            <span>Ce que voit un commercial quand il allume l’application.</span>
            <CommercialHomeScreen userName={userName} onOpen={openApp} framed/>
          </div>
        </div>
      )}
    </>
  );
}
