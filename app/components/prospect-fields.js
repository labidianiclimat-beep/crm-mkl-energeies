"use client";

import { useState } from "react";
import CompleteAddressFields from "./complete-address-fields";
import HousingFields from "./housing-fields";
import ProspectNextActionFields, { ProspectCommercialField } from "./prospect-next-action";
import ClientDocumentVault from "./client-document-vault";
import RecordDocumentList from "./record-document-list";
import { documentsForRecord } from "../lib/record-documents";
import { commercialsForProspectAssign } from "../lib/prospect-dispatch";
import ProspectorPicker from "./prospector-picker";
import { displayRdvStatus } from "../lib/appointment-status";
import { CIVILITIES, PHONE_PATTERN, PHONE_PLACEHOLDER, PHONE_TITLE } from "../lib/clients";
import {
  parseProjectTypes,
  PROJECT_TYPES,
  PROSPECT_SOURCES,
  PROSPECT_STAGES,
} from "../lib/prospects";

function ChipGroup({ name, value, onChange, options, multiple = false, disabled = false }) {
  const selected = multiple ? (Array.isArray(value) ? value : [value].filter(Boolean)) : value;
  function toggle(option) {
    if (disabled) return;
    if (!multiple) {
      onChange(option);
      return;
    }
    const next = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    if (!next.length) return;
    onChange(next);
  }
  return (
    <div className={`prospect-chips${disabled ? " is-readonly" : ""}`}>
      {options.map(option => (
        <label key={option} className={(multiple ? selected.includes(option) : value === option) ? "selected" : ""}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={multiple ? undefined : name}
            value={option}
            checked={multiple ? selected.includes(option) : value === option}
            disabled={disabled}
            onChange={() => toggle(option)}
          />
          <span>{option}</span>
        </label>
      ))}
      {multiple && <input type="hidden" name={name} value={selected.join(" · ")} />}
    </div>
  );
}

export default function ProspectFields({
  prospect,
  commercials = [],
  team = [],
  canAssignCommercial = false,
  deferCommercial = false,
  currentUserId = "",
  currentUserName = "",
  currentProfile = null,
  readOnly = false,
  fieldCapture = false,
  billing = [],
  contracts = [],
  visits = [],
  pvProjects = [],
  thermalStudies = [],
  pvSimulations = [],
  articles = [],
  appointment = null,
}) {
  const [phone, setPhone] = useState(prospect?.phone || "");
  const [landline, setLandline] = useState(prospect?.landline || "");
  const hasPhone = Boolean(String(phone).trim() || String(landline).trim());
  const [projectTypes, setProjectTypes] = useState(() => parseProjectTypes(prospect?.types || prospect?.type || "Photovoltaïque"));
  const [source, setSource] = useState(prospect?.source || "Prospection");
  const [stage, setStage] = useState(prospect?.stage || "Nouveau");
  const sourceOptions = PROSPECT_SOURCES.includes(source) || !source ? PROSPECT_SOURCES : [...PROSPECT_SOURCES, source];
  const assignableCommercials = (() => {
    const list = commercialsForProspectAssign(currentProfile, commercials, {
      team,
      currentUserId,
      currentUserName,
    });
    const currentId = prospect?.commercialId || prospect?.commercial_id || "";
    if (currentId && !list.some(user => String(user.id) === String(currentId))) {
      const current = commercials.find(user => String(user.id) === String(currentId));
      if (current) return [current, ...list];
      if (prospect?.owner) return [{ id: currentId, name: prospect.owner, role: "Commercial" }, ...list];
    }
    return list;
  })();

  return (
    <div className="prospect-fields">
      <section className="prospect-section">
        <h3>1. Contact</h3>
        <p className="prospect-hint">{readOnly
          ? "Consultation uniquement — le statut évolue ensuite avec l’équipe."
          : "Nom, téléphone et adresse suffisent pour enregistrer la fiche sur le terrain."}</p>
        <label>Civilité
          <select name="civilite" defaultValue={prospect?.civilite || ""} disabled={readOnly}>
            <option value="">Choisir</option>
            {CIVILITIES.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Nom du prospect
          <input
            name="name"
            required
            autoFocus={!prospect && !readOnly}
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Prénom et nom, ou raison sociale"
            defaultValue={prospect?.name}
            readOnly={readOnly}
          />
        </label>
        <div className="form-row">
          <label>Téléphone mobile
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required={!hasPhone}
              placeholder={PHONE_PLACEHOLDER}
              title={PHONE_TITLE}
              pattern={PHONE_PATTERN}
              value={phone}
              onChange={event => setPhone(event.target.value)}
              readOnly={readOnly}
            />
          </label>
          <label>Téléphone fixe
            <input
              name="landline"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required={!hasPhone}
              placeholder={PHONE_PLACEHOLDER}
              title={PHONE_TITLE}
              pattern={PHONE_PATTERN}
              value={landline}
              onChange={event => setLandline(event.target.value)}
              readOnly={readOnly}
            />
          </label>
        </div>
        <div className="form-row">
          <label>Email (optionnel)
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="facultatif"
              defaultValue={prospect?.email}
              readOnly={readOnly}
            />
          </label>
        </div>
      </section>

      <section className="prospect-section prospect-section-address">
        <h3>2. Adresse du site</h3>
        <p className="prospect-hint">Saisissez le numéro et la voie : les suggestions remplissent le code postal et la ville.</p>
        <CompleteAddressFields
          address={prospect?.address}
          addressComplement={prospect?.addressComplement}
          postalCode={prospect?.postalCode}
          city={prospect?.city}
          readOnly={readOnly}
        />
      </section>

      <section className="prospect-section prospect-section-wide">
        <h3>3. Logement</h3>
        <p className="prospect-hint">Type de maison, année de construction et occupant — les mêmes listes que sur le devis.</p>
        <HousingFields
          housingType={prospect?.housingType}
          constructionYear={prospect?.constructionYear}
          occupancy={prospect?.occupancy}
          readOnly={readOnly}
        />
      </section>

      <section className="prospect-section prospect-section-wide">
        <h3>4. Projet</h3>
        <p className="prospect-hint">Touchez un ou plusieurs types de projet, puis l’origine du contact.</p>
        <span className="prospect-chip-label">Type de projet</span>
        <ChipGroup name="type" value={projectTypes} onChange={setProjectTypes} options={PROJECT_TYPES} multiple disabled={readOnly} />
        <span className="prospect-chip-label">Origine du contact</span>
        <ChipGroup name="source" value={source} onChange={setSource} options={sourceOptions} disabled={readOnly} />
        <ProspectorPicker
          team={team}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          fieldCapture={fieldCapture}
          prospectorId={prospect?.prospectorId || ""}
          prospector={prospect?.prospector || ""}
          readOnly={readOnly}
        />
        {prospect && (
          <>
            <span className="prospect-chip-label">Étape commerciale</span>
            {readOnly
              ? <p className="prospect-status-readout">{prospect.stage || stage}</p>
              : <ChipGroup name="stage" value={stage} onChange={setStage} options={PROSPECT_STAGES} />}
            <span className="prospect-chip-label">Qualification du rendez-vous</span>
            <p className="prospect-status-readout">{displayRdvStatus(prospect.rdvStatus)}</p>
            <ProspectCommercialField
              label="Commercial actuel"
              commercials={assignableCommercials}
              canAssignCommercial={canAssignCommercial && !readOnly}
              deferCommercial={deferCommercial}
              currentUserId={currentUserId}
              defaultValue={prospect.commercialId || ""}
              readOnlyName={prospect.owner || "Non affecté"}
              hiddenValue={prospect.commercialId || currentUserId}
            />
          </>
        )}
        <label>Notes (accès, créneau, besoin)
          <textarea name="notes" rows="3" placeholder="Ex. présent le soir, toiture sud, déjà un devis concurrent…" defaultValue={prospect?.notes} readOnly={readOnly} />
        </label>
      </section>

      {!readOnly && (
        <section className="prospect-section prospect-section-wide">
          <h3>5. Prochaine action</h3>
          <ProspectNextActionFields
            required
            commercials={assignableCommercials}
            canAssignCommercial={canAssignCommercial}
            deferCommercial={deferCommercial || fieldCapture}
            hideCommercial={Boolean(prospect)}
            currentUserId={currentUserId}
            defaultPhone={appointment?.phone || phone}
            defaultCity={prospect?.city || ""}
            defaultKind={appointment?.kind || prospect?.desiredKind || "rendez-vous"}
            defaultWhen={appointment?.start || prospect?.desiredAt || ""}
            defaultDuration={appointment?.duration || prospect?.desiredDuration || 60}
            defaultAppointmentType={appointment?.appointmentType || ""}
            defaultMeetingMode={appointment?.meetingMode || ""}
            defaultSubject={appointment?.subject || ""}
            defaultNotes={appointment?.notes || ""}
            defaultAddress={appointment?.address || ""}
            defaultPriority={appointment?.priority || "normale"}
            defaultCommercialId={prospect?.commercialId || appointment?.commercialId || ""}
          />
        </section>
      )}

      {prospect && (
        <section className="prospect-section prospect-section-wide">
          <h3>{readOnly ? "5" : "6"}. Documents</h3>
          <p className="prospect-hint">Devis, études et prévisites rattachés à cette fiche, avec téléchargement.</p>
          <RecordDocumentList
            documents={documentsForRecord({
              person: prospect,
              kind: "prospect",
              billing,
              contracts,
              visits,
              pvProjects,
              thermalStudies,
              pvSimulations,
            })}
            empty="Aucun devis ni étude rattaché pour le moment."
            articles={articles}
          />
        </section>
      )}

      <section className="prospect-section prospect-section-wide">
        <h3>{prospect && !readOnly ? "7" : "6"}. Justificatifs</h3>
        <ClientDocumentVault prospect={prospect} />
      </section>
    </div>
  );
}
