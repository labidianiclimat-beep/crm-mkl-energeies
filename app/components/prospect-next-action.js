"use client";

import { useState } from "react";
import {
  ACTION_KINDS,
  APPOINTMENT_TYPES,
  MEETING_MODES,
  PRIORITIES,
  REMINDER_PRESETS,
  parisDateTimeParts,
} from "../lib/agenda";

export function ProspectCommercialField({
  commercials = [],
  canAssignCommercial = false,
  deferCommercial = false,
  currentUserId = "",
  defaultValue = "",
  label = "Commercial responsable",
  readOnlyName = "",
  hiddenValue = "",
}) {
  const selected = defaultValue || (deferCommercial ? "" : currentUserId);
  const lockedValue = hiddenValue || currentUserId;
  if (deferCommercial && !canAssignCommercial) {
    return (
      <label>{label}
        <input value="À attribuer plus tard" readOnly />
        <input type="hidden" name="commercialId" value="" />
      </label>
    );
  }
  return (
    <label>{label}
      {canAssignCommercial
        ? <select name="commercialId" defaultValue={selected} required={!deferCommercial}>
            {deferCommercial && <option value="">À dispatcher plus tard</option>}
            {commercials.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        : <>
            <input value={readOnlyName || commercials.find(user => String(user.id) === String(lockedValue))?.name || "Moi"} readOnly />
            <input type="hidden" name="commercialId" value={lockedValue} />
          </>}
    </label>
  );
}

function parisDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localDateTimeParts(value) {
  return parisDateTimeParts(value);
}

export default function ProspectNextActionFields({
  required = true,
  commercials = [],
  canAssignCommercial = false,
  deferCommercial = false,
  hideCommercial = false,
  currentUserId = "",
  defaultPhone = "",
  defaultCity = "",
  defaultKind = "",
  defaultWhen = "",
  defaultDuration = "60",
  defaultAppointmentType = "",
  defaultMeetingMode = "",
  defaultSubject = "",
  defaultNotes = "",
  defaultAddress = "",
  defaultPriority = "normale",
  defaultCommercialId = "",
}) {
  const seeded = localDateTimeParts(defaultWhen);
  const [kind, setKind] = useState(defaultKind);
  const [duration, setDuration] = useState(String(defaultDuration || 60));
  const [appointmentType, setAppointmentType] = useState(defaultAppointmentType || (defaultKind === "rappel" ? "Appel téléphonique" : "Visite commerciale"));
  const [meetingMode, setMeetingMode] = useState(defaultMeetingMode || (defaultKind === "rappel" ? "téléphone" : "domicile"));
  const defaultCommercial = defaultCommercialId || (deferCommercial ? "" : currentUserId);

  function chooseKind(next) {
    setKind(next);
    setAppointmentType(next === "rappel" ? "Appel téléphonique" : "Visite commerciale");
    setMeetingMode(next === "rappel" ? "téléphone" : "domicile");
  }
  return <div className="next-action-block">
    <div className="form-section-title">PROCHAINE ACTION {required ? "(OBLIGATOIRE)" : ""}</div>
    <p className="next-action-help">{deferCommercial
      ? "La date souhaitée est obligatoire. Le commercial peut être attribué plus tard depuis la file À dispatcher."
      : "Chaque fiche doit être liée à un rendez-vous ou à une fiche contact, visible dans l’agenda du commercial."}</p>
    <div className="next-action-kinds">
      {ACTION_KINDS.map(item => (
        <label key={item.id} className={kind === item.id ? "selected" : ""}>
          <input type="radio" name="actionKind" value={item.id} required={required} checked={kind === item.id} onChange={() => chooseKind(item.id)} />
          <span>{item.id === "rendez-vous" ? "Rendez-vous" : "Fiche contact"}</span>
        </label>
      ))}
    </div>
    {kind && <>
      <div className="form-row">
        <label>Date<input name="appointmentDate" type="date" required defaultValue={seeded?.date || parisDateInputValue()} /></label>
        <label>Heure de début<input name="appointmentStart" type="time" required defaultValue={seeded?.time || "09:00"} /></label>
      </div>
      <div className="form-row">
        <label>Heure de fin<input name="appointmentEnd" type="time" /></label>
        <label>Durée
          <select name="duration" value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="30">30 minutes</option>
            <option value="60">1 heure</option>
            <option value="90">1 h 30</option>
            <option value="120">2 heures</option>
          </select>
        </label>
      </div>
      {!hideCommercial && <ProspectCommercialField
        commercials={commercials}
        canAssignCommercial={canAssignCommercial}
        deferCommercial={deferCommercial}
        currentUserId={currentUserId}
        defaultValue={defaultCommercial}
      />}
      {kind === "rendez-vous" && <label>Adresse du rendez-vous<input name="appointmentAddress" autoComplete="off" defaultValue={defaultAddress} placeholder={defaultCity ? `Ex. ${defaultCity}` : "Si vide, l’adresse du prospect est utilisée"} /></label>}
      <div className="form-row">
        <label>Téléphone du prospect<input name="appointmentPhone" type="tel" autoComplete="off" defaultValue={defaultPhone} /></label>
        <label>Type de rendez-vous
          <select name="appointmentType" value={appointmentType} onChange={event => setAppointmentType(event.target.value)}>
            {APPOINTMENT_TYPES.map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
      </div>
      <label>Objet<input name="subject" placeholder="Ex. Présentation offre photovoltaïque" defaultValue={defaultSubject} /></label>
      <div className="form-row">
        <label>Priorité
          <select name="priority" defaultValue={defaultPriority || "normale"}>
            {PRIORITIES.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Mode
          <select name="meetingMode" value={meetingMode} onChange={event => setMeetingMode(event.target.value)}>
            {MEETING_MODES.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="reminder-checks">
        <b>Notifications</b>
        {REMINDER_PRESETS.map(item => (
          <label key={item.value}><input type="checkbox" name={`reminder_${item.value}`} defaultChecked />{item.label}</label>
        ))}
        <label>Délai personnalisé (minutes)<input name="reminderCustom" type="number" min="0" placeholder="Optionnel" /></label>
        <label><input type="checkbox" name="notifyCrm" defaultChecked />Dans le CRM</label>
        <label><input type="checkbox" name="notifyEmail" defaultChecked />Par e-mail</label>
        <label><input type="checkbox" name="notifyGoogle" defaultChecked />Dans Google Calendar s’il est connecté</label>
      </div>
      <label>Commentaire / note<textarea name="appointmentNotes" rows="3" placeholder="Consignes, accès, documents à prévoir…" defaultValue={defaultNotes} /></label>
    </>}
  </div>;
}
