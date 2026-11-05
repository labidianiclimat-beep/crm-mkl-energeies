"use client";

import { useState } from "react";
import CompleteAddressFields from "./complete-address-fields";
import HousingFields from "./housing-fields";
import ClientDocumentVault from "./client-document-vault";
import ProspectorPicker from "./prospector-picker";
import { CIVILITIES, CLIENT_STATUSES, CLIENT_TYPES, normalizeClientStatus, PHONE_PATTERN, PHONE_PLACEHOLDER, PHONE_TITLE } from "../lib/clients";

export default function ClientFields({
  client,
  commercials = [],
  team = [],
  canAssignCommercial = false,
  currentUserId = "",
  currentUserName = "",
  readOnly = false,
}) {
  const [customerType, setCustomerType] = useState(client?.customerType || "Particulier");
  const [phone, setPhone] = useState(client?.phone || "");
  const [mobile, setMobile] = useState(client?.mobile || "");
  const [email, setEmail] = useState(client?.email || "");
  const hasContact = Boolean(String(phone).trim() || String(mobile).trim() || String(email).trim());
  const statusValue = CLIENT_STATUSES.includes(client?.status)
    ? client.status
    : normalizeClientStatus(client?.status);
  return (
    <div className="client-fields">
      <fieldset disabled={readOnly} className="client-fields-lock">
      <label>Type de client
        <select name="customerType" value={customerType} onChange={event => setCustomerType(event.target.value)}>
          {CLIENT_TYPES.map(type => <option key={type}>{type}</option>)}
        </select>
      </label>
      <label>Civilité
        <select name="civilite" defaultValue={client?.civilite || ""}>
          <option value="">Non renseignée</option>
          {CIVILITIES.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      {customerType !== "Particulier" && (
        <label>Raison sociale / entreprise
          <input name="company" required placeholder="Nom de l’entreprise" defaultValue={client?.company} />
        </label>
      )}
      <div className="form-row">
        <label>Prénom
          <input name="firstName" required={customerType === "Particulier"} defaultValue={client?.firstName} />
        </label>
        <label>Nom
          <input name="lastName" required={customerType === "Particulier"} defaultValue={client?.lastName} />
        </label>
      </div>
      <p className="prospect-hint">Au moins un téléphone ou un email est obligatoire.</p>
      <div className="form-row">
        <label>Téléphone fixe
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={PHONE_PLACEHOLDER}
            title={PHONE_TITLE}
            pattern={PHONE_PATTERN}
            value={phone}
            onChange={event => setPhone(event.target.value)}
            required={!hasContact}
          />
        </label>
        <label>Téléphone mobile
          <input
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={PHONE_PLACEHOLDER}
            title={PHONE_TITLE}
            pattern={PHONE_PATTERN}
            value={mobile}
            onChange={event => setMobile(event.target.value)}
            required={!hasContact}
          />
        </label>
      </div>
      <label>Adresse email
        <input type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} required={!hasContact} />
      </label>
      <CompleteAddressFields
        address={client?.address}
        addressComplement={client?.addressComplement}
        postalCode={client?.postalCode}
        city={client?.city}
      />
      <HousingFields
        housingType={client?.housingType}
        constructionYear={client?.constructionYear}
        occupancy={client?.occupancy}
      />
      <div className="form-row">
        <label>Type de projet
          <select name="projectType" defaultValue={client?.projectType || "Pompe à chaleur"}>
            <option>Pompe à chaleur</option>
            <option>Climatisation</option>
            <option>Ballon thermodynamique</option>
            <option>Photovoltaïque</option>
            <option>Adoucisseur d’eau</option>
            <option>Contrat d’entretien</option>
            <option>Autre</option>
          </select>
        </label>
        <label>Statut
          <select name="status" defaultValue={statusValue}>
            {CLIENT_STATUSES.map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
      <label>Installation ou équipement existant
        <input name="install" placeholder="Ex. PAC 8 kW, photovoltaïque 9 kWc" defaultValue={client?.install} />
      </label>
      <div className="form-row">
        {canAssignCommercial ? (
          <label>Commercial responsable
            <select name="commercialId" defaultValue={client?.commercialId || ""}>
              <option value="">Non affecté</option>
              {commercials.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
        ) : (
          <input type="hidden" name="commercialId" value={client?.commercialId || ""} />
        )}
        <label>Origine du contact
          <select name="source" defaultValue={client?.source || "Appel entrant"}>
            <option>Recommandation</option>
            <option>Site internet</option>
            <option>Appel entrant</option>
            <option>Prospection</option>
            <option>Salon</option>
            <option>Partenaire</option>
            <option>Ancien client</option>
            <option>Autre</option>
          </select>
        </label>
      </div>
      <ProspectorPicker
        team={team}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        prospectorId={client?.prospectorId || ""}
        prospector={client?.prospector || ""}
        readOnly={readOnly}
      />
      <label>Notes et informations utiles
        <textarea name="notes" rows="4" placeholder="Accès chantier, disponibilités, besoins particuliers…" defaultValue={client?.notes} />
      </label>
      <label className="client-consent">
        <input type="checkbox" name="consent" defaultChecked={Boolean(client?.consent)} />
        Le client accepte d’être contacté dans le cadre de son projet.
      </label>
      </fieldset>
      <ClientDocumentVault client={client} />
    </div>
  );
}
