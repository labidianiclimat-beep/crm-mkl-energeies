"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Plus, Search, UserRound, X } from "lucide-react";
import {
  filledSearchFields,
  filterDirectory,
  hasDirectoryQuery,
  personSearchFields,
  queryMatchesSelected,
} from "../lib/directory-search";
import { EXISTING_CLIENT_MESSAGE } from "../lib/existing-client";
import { authFetch } from "../lib/supabase-rest";
import ClientFields from "./client-fields";

function payloadFromForm(data) {
  return {
    customerType: data.customerType,
    civilite: data.civilite,
    firstName: data.firstName,
    lastName: data.lastName,
    company: data.company,
    phone: data.phone,
    mobile: data.mobile,
    email: data.email,
    address: data.address,
    addressComplement: data.addressComplement,
    postalCode: data.postalCode,
    city: data.city,
    projectType: data.projectType,
    status: data.status,
    install: data.install,
    commercialId: data.commercialId || "",
    source: data.source,
    notes: data.notes,
    consent: data.consent === "on",
  };
}

export function DirectoryListSearch({
  value,
  onChange,
  placeholder = "Nom, prénom ou adresse",
  label = "Rechercher par nom, prénom ou adresse",
}) {
  return (
    <label className="directory-list-search">
      <Search size={16} />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </label>
  );
}

export default function DirectorySearch({
  items = [],
  kind = "client",
  idName = "",
  nameName = "",
  required = false,
  value,
  defaultValue = "",
  onChange,
  showSelected = true,
  onClientCreated,
  createdItem,
  commercials = [],
  canAssignCommercial = false,
  allowCreate = true,
  variant = "default",
  lastName: lastNameValue,
  firstName: firstNameValue,
  address: addressValue,
  onFieldsChange,
  omitAddress = false,
  singleCreate = false,
}) {
  const inline = variant === "inline";
  const [internalId, setInternalId] = useState(String(defaultValue || ""));
  const [lastNameState, setLastNameState] = useState("");
  const [firstNameState, setFirstNameState] = useState("");
  const [addressState, setAddressState] = useState("");
  const [created, setCreated] = useState([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const selectedId = value !== undefined ? String(value || "") : internalId;
  const lastName = lastNameValue !== undefined ? lastNameValue : lastNameState;
  const firstName = firstNameValue !== undefined ? firstNameValue : firstNameState;
  const address = addressValue !== undefined ? addressValue : addressState;
  const query = { lastName, firstName, address };
  const searching = hasDirectoryQuery(query);
  const catalog = useMemo(() => [...created, ...(items || [])], [created, items]);
  const matches = useMemo(
    () => filterDirectory(catalog, query),
    [catalog, lastName, firstName, address]
  );
  const selected = catalog.find(item => String(item.id) === selectedId) || null;
  const fields = selected ? personSearchFields(selected) : null;
  const entity = kind === "prospect" ? "prospect" : kind === "recipient" ? "destinataire" : "client";
  const canCreate = allowCreate && kind !== "prospect";
  const showResults = searching && !(selected && queryMatchesSelected(selected, query));

  function applyFields(item) {
    const next = filledSearchFields(item);
    if (lastNameValue === undefined) setLastNameState(next.lastName);
    if (firstNameValue === undefined) setFirstNameState(next.firstName);
    if (addressValue === undefined) setAddressState(next.address);
    onFieldsChange?.(next);
  }

  useEffect(() => {
    if (!selected || lastNameValue !== undefined) return;
    if (lastNameState || firstNameState || addressState) return;
    applyFields(selected);
  }, [selectedId]);

  function setField(field, next) {
    const editingIdentity = field === "lastName" || field === "firstName";
    if (selected && editingIdentity && addressValue === undefined) setAddressState("");
    if (selected && editingIdentity) {
      if (value === undefined) setInternalId("");
      onChange?.(null);
    }
    if (field === "lastName" && lastNameValue === undefined) setLastNameState(next);
    if (field === "firstName" && firstNameValue === undefined) setFirstNameState(next);
    if (field === "address" && addressValue === undefined) setAddressState(next);
    onFieldsChange?.({
      lastName: field === "lastName" ? next : lastName,
      firstName: field === "firstName" ? next : firstName,
      address: editingIdentity && addressValue === undefined ? "" : (field === "address" ? next : address),
      [field]: next,
    });
  }

  function pick(item) {
    const nextId = item?.id ? String(item.id) : "";
    if (value === undefined) setInternalId(nextId);
    if (item) applyFields(item);
    onChange?.(item || null);
  }

  async function saveClient(event, { forceDuplicate = false } = {}) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreateError("");
    setSaving(true);
    const payload = {
      ...payloadFromForm(Object.fromEntries(new FormData(form))),
      forceDuplicate,
    };
    try {
      const response = await authFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.blocked) {
        setCreateError(data.error || "Un client avec le même nom et la même adresse existe déjà.");
        return;
      }
      if (response.status === 409 && data.duplicates?.length && !forceDuplicate) {
        const summary = data.duplicates
          .map(item => `${item.name || item.email} (${(item.reasons || []).join(", ")})`)
          .join("\n");
        if (window.confirm(`Doublon potentiel détecté :\n${summary}\n\nCréer quand même ?`)) {
          setSaving(false);
          return saveClient({ preventDefault() {}, currentTarget: form }, { forceDuplicate: true });
        }
        return;
      }
      if (!response.ok) throw new Error(data.error || "Création client impossible");
      const client = data.client;
      const item = createdItem ? createdItem(client) : client;
      setCreated(current => [item, ...current.filter(row => String(row.id) !== String(item.id))]);
      setCreating(false);
      pick(item);
      onClientCreated?.(client);
    } catch (error) {
      setCreateError(String(error?.message || "Création client impossible"));
    } finally {
      setSaving(false);
    }
  }

  function CreateButton() {
    if (!canCreate) return null;
    return (
      <button
        type="button"
        className="directory-search-create"
        onClick={() => { setCreateError(""); setCreating(true); }}
      >
        <Plus size={16} />
        Créer un client
      </button>
    );
  }

  return (
    <div className={`directory-search${inline ? " directory-search-inline" : ""}`}>
      {!inline && (
        <>
          {!singleCreate && (
            <div className="directory-search-head">
              <div className="form-section-title">RECHERCHER UN {entity.toUpperCase()}</div>
              <CreateButton />
            </div>
          )}
          {!singleCreate && (
            <p className="directory-search-help">
              Nom, prénom ou adresse : un seul champ cherche et pré-remplit la fiche.
            </p>
          )}
          <div className="form-row">
            <label>Nom
              <input
                value={lastName}
                onChange={event => setField("lastName", event.target.value)}
                placeholder="Dupont"
                autoComplete="off"
              />
            </label>
            <label>Prénom
              <input
                value={firstName}
                onChange={event => setField("firstName", event.target.value)}
                placeholder="Marie"
                autoComplete="off"
              />
            </label>
          </div>
          {!omitAddress && (
            <label>Adresse
              <div className="directory-search-address">
                <Search size={16} />
                <input
                  value={address}
                  onChange={event => setField("address", event.target.value)}
                  placeholder="Voie, code postal ou ville"
                  autoComplete="off"
                />
              </div>
            </label>
          )}
          {singleCreate && <div className="directory-search-single-create"><CreateButton /></div>}
        </>
      )}
      {inline && (
        <div className="directory-search-head">
          <p className="directory-search-help">Nom, prénom ou adresse : la saisie cherche aussi dans le fichier clients.</p>
          <CreateButton />
        </div>
      )}
      {idName && (
        <input
          className="directory-search-required"
          name={idName}
          value={selectedId}
          onChange={() => {}}
          required={required}
          tabIndex={-1}
          aria-label={`${entity} sélectionné`}
        />
      )}
      {nameName && (
        <input
          className="directory-search-required"
          name={nameName}
          value={selected?.name || ""}
          onChange={() => {}}
          required={required && !idName}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      {showResults && (
        <ul className="directory-search-results">
          {matches.length === 0 && (
            <li className="directory-search-empty">
              {canCreate && !singleCreate ? (
                <>
                  <span>Aucun {entity} ne correspond à cette recherche.</span>
                  <CreateButton />
                </>
              ) : canCreate ? (
                <span>Aucun {entity} ne correspond à cette recherche.</span>
              ) : (
                <span>{EXISTING_CLIENT_MESSAGE}</span>
              )}
            </li>
          )}
          {matches.map(item => {
            const row = personSearchFields(item);
            return (
              <li key={item.id}>
                <button type="button" onClick={() => pick(item)}>
                  <UserRound size={16} />
                  <span>
                    <b>{row.name || `${row.firstName} ${row.lastName}`.trim() || "Fiche sans nom"}</b>
                    <small>{item.badge ? `${item.badge} · ` : ""}{row.address || "Adresse à compléter"}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!inline && !searching && !selected && !singleCreate && (
        <div className="directory-search-hint">
          <p>
            {!canCreate && !catalog.length
              ? EXISTING_CLIENT_MESSAGE
              : catalog.length
                ? `Sélectionnez un ${entity} via le nom, le prénom ou l’adresse.`
                : `Aucun ${entity} enregistré pour le moment.`}
          </p>
          <CreateButton />
        </div>
      )}
      {!inline && showSelected && selected && (
        <div className="directory-search-selected">
          <UserRound size={18} />
          <div>
            <b>{fields.name || `${fields.firstName} ${fields.lastName}`.trim()}</b>
            <span>
              <MapPin size={13} />
              {fields.address || "Adresse à compléter"}
            </span>
          </div>
          <button type="button" onClick={() => pick(null)} aria-label={`Retirer ce ${entity}`}>
            <X size={16} />
          </button>
        </div>
      )}
      {creating && canCreate && typeof document !== "undefined" && createPortal(
        <div className="backdrop directory-create-overlay" onMouseDown={event => event.target === event.currentTarget && setCreating(false)}>
          <div className="modal client-create-modal" onMouseDown={event => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setCreating(false)}><X /></button>
            <div className="modal-icon"><UserRound /></div>
            <h2>Créer un client</h2>
            <p>La fiche sera disponible tout de suite dans ce formulaire.</p>
            <form onSubmit={event => saveClient(event)}>
              <div className="modal-form-body">
                <ClientFields
                  client={{ firstName, lastName, address }}
                  commercials={commercials}
                  canAssignCommercial={canAssignCommercial}
                />
                {createError && <p className="directory-create-error">{createError}</p>}
              </div>
              <div className="modal-form-actions">
                <button className="primary submit" type="submit" disabled={saving}>
                  <Plus size={18} />
                  {saving ? "Enregistrement…" : "Enregistrer le client"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

