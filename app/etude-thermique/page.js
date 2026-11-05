"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Flame, Printer, Save } from "lucide-react";
import { ExistingClientGate } from "../components/recipient-connect";
import DocumentClosing from "../components/document-closing";
import DocumentParties, { frozenRecipient } from "../components/document-parties";
import SignaturePad from "../components/signature-pad";
import { personSearchFields } from "../lib/directory-search";
import { openThermalPrintWindow } from "../lib/thermal-print";
import { useCompany } from "../lib/use-company";
import { companyDisplayName } from "../lib/company";
import { authFetch } from "../lib/supabase-rest";
import { formatClientNumber } from "../lib/client-number";
import { EXISTING_CLIENT_MESSAGE, findExistingClient, recipientLink } from "../lib/existing-client";
import { loadSharedRecords, saveSharedRecords } from "../lib/use-record-table";
import {
  ALSACE_DJU,
  G_TABLE,
  SCORE_CRITERIA,
  THERMAL_STUDY_STORAGE_KEY,
  computeThermalStudy,
  createEmptyThermalStudy,
  formatThermalMoney,
  formatThermalNumber,
  nextStudyNumber,
} from "../lib/thermal-study";
import "../previsite/previsite.css";
import "./etude-thermique.css";

function readLocal(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function loadStudies() {
  return loadSharedRecords(THERMAL_STUDY_STORAGE_KEY);
}

async function persistStudies(records) {
  await saveSharedRecords(THERMAL_STUDY_STORAGE_KEY, records);
}

async function loadClients() {
  try {
    const response = await authFetch("/api/clients");
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.clients)) return data.clients;
  } catch {}
  return readLocal("mkl-clients");
}

function EuroField({ value, onChange }) {
  return (
    <label className="thermal-euro-field">
      <input type="number" min="0" step="0.001" value={value} onChange={onChange} />
      <span aria-hidden="true">€</span>
    </label>
  );
}

function ScoreGrid({ scores, onChange }) {
  return (
    <div className="thermal-score-grid">
      {SCORE_CRITERIA.map(criterion => (
        <div className="thermal-score-col" key={criterion.key}>
          <b>{criterion.label}</b>
          {criterion.options.map(option => {
            const selected = Number(scores[criterion.key]) === option.points;
            return (
              <button
                type="button"
                key={`${criterion.key}-${option.points}`}
                className={selected ? "selected" : ""}
                onClick={() => onChange(criterion.key, option.points)}
              >
                <i>{option.points}</i>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function studyFromClient(client) {
  const empty = createEmptyThermalStudy();
  if (!client) return empty;
  const link = recipientLink(client);
  const fields = personSearchFields(client);
  return {
    ...empty,
    clientId: link.clientId,
    prospectId: link.prospectId,
    clientNumber: link.clientId ? (client.clientNumber || "") : "",
    client: client.name || `${fields.lastName} ${fields.firstName}`.trim(),
    lastName: fields.lastName || "",
    firstName: fields.firstName || "",
    address: client.address || "",
    addressComplement: client.addressComplement || "",
    postalCode: client.postalCode || "",
    city: client.city || "",
    place: client.city || "",
  };
}

export default function ThermalStudyPage({
  embedded = false,
  presetClient = null,
  presetId = "",
  onClose,
  onSaved,
} = {}) {
  const [form, setForm] = useState(() => studyFromClient(presetClient));
  const [recordId, setRecordId] = useState(null);
  const [number, setNumber] = useState("");
  const [clients, setClients] = useState([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const { company } = useCompany();

  const computed = useMemo(() => computeThermalStudy(form), [form]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = embedded ? new URLSearchParams() : new URLSearchParams(window.location.search);
      const id = embedded ? (presetId || "") : params.get("id");
      const clientId = embedded ? (presetClient?.id || "") : params.get("clientId");
      const [studies, directory] = await Promise.all([loadStudies(), loadClients()]);
      if (cancelled) return;
      setClients(directory);
      if (id) {
        const found = studies.find(item => String(item.id) === String(id) && item.kind !== "dimensionnement");
        if (found) {
          setRecordId(found.id);
          setNumber(found.number || "");
          setForm({ ...createEmptyThermalStudy(), ...found });
          setLoading(false);
          return;
        }
      }
      if (clientId && presetClient?.directoryKind !== "prospect") {
        const client = directory.find(item => String(item.id) === String(clientId));
        if (client) applyClient(client);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function patch(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function applyClient(client) {
    if (!client) {
      setForm(current => ({
        ...current,
        clientId: "",
        prospectId: "",
        client: "",
      }));
      return;
    }
    const link = recipientLink(client);
    const fields = personSearchFields(client);
    setForm(current => ({
      ...current,
      clientId: link.clientId,
      prospectId: link.prospectId,
      clientNumber: link.clientId ? (client.clientNumber || "") : "",
      client: client.name || `${fields.lastName} ${fields.firstName}`.trim(),
      lastName: fields.lastName || current.lastName,
      firstName: fields.firstName || current.firstName,
      address: client.address || current.address,
      addressComplement: client.addressComplement || current.addressComplement,
      postalCode: client.postalCode || current.postalCode,
      city: client.city || current.city,
      place: current.place || client.city || "",
      phone: client.mobile || client.phone || current.phone || "",
      email: client.email || current.email || "",
    }));
  }

  function studyParty() {
    return findExistingClient(clients, form.clientId) || (form.prospectId ? {
      id: form.prospectId,
      name: form.client,
      firstName: form.firstName,
      lastName: form.lastName,
      address: form.address,
      postalCode: form.postalCode,
      city: form.city,
      phone: form.phone,
      email: form.email,
      directoryKind: "prospect",
    } : null);
  }

  function printForm(record) {
    const linked = studyParty() || {};
    return {
      ...form,
      ...computed,
      ...(record || {}),
      phone: linked.mobile || linked.phone || form.phone || "",
      email: linked.email || form.email || "",
      clientNumberLabel: formatClientNumber(form.clientNumber || linked.clientNumber),
    };
  }

  async function saveStudy() {
    if (!studyParty()) {
      setSaveError(EXISTING_CLIENT_MESSAGE);
      setSaved(false);
      return null;
    }
    setSaveError("");
    const studies = await loadStudies();
    const id = recordId || Date.now();
    const assigned = number || nextStudyNumber(studies);
    const record = {
      ...form,
      ...computed,
      id,
      number: assigned,
      client: form.client || `${form.lastName} ${form.firstName}`.trim(),
      status: "Étude complétée",
      created: form.created || new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    const next = studies.some(item => String(item.id) === String(id))
      ? studies.map(item => String(item.id) === String(id) ? record : item)
      : [record, ...studies];
    await persistStudies(next);
    setRecordId(id);
    setNumber(assigned);
    setForm(current => ({ ...current, created: record.created }));
    if (!recordId && !embedded) history.replaceState({}, "", `/etude-thermique?id=${id}`);
    onSaved?.(record);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    return record;
  }

  async function printStudy() {
    try {
      const record = await saveStudy();
      if (!record) return;
      await openThermalPrintWindow({
        form: printForm(record),
        company,
        number: record?.number || number,
        autoPrint: true,
      });
    } catch (error) {
      setSaveError(String(error?.message || "Impression impossible"));
    }
  }

  async function downloadStudy() {
    try {
      const record = await saveStudy();
      if (!record) return;
      await openThermalPrintWindow({
        form: printForm(record),
        company,
        number: record?.number || number,
        autoPrint: false,
      });
    } catch (error) {
      setSaveError(String(error?.message || "Téléchargement PDF impossible"));
    }
  }

  if (loading) {
    return <main className={`previsit-app thermal-loading${embedded ? " is-embedded" : ""}`}>Chargement de l’étude thermique…</main>;
  }

  return (
    <main className={`previsit-app thermal-app${embedded ? " is-embedded" : ""}`}>
      <header className="form-toolbar">
        <button type="button" onClick={() => { if (embedded) onClose?.(); else window.location.href = "/"; }}>
          <ArrowLeft />Retour CRM
        </button>
        <div>
          <Flame size={18} />
          <span>
            <b>Étude thermique</b>
            <small>{number || "Nouveau calcul des déperditions"}</small>
          </span>
        </div>
        <div>
          <button type="button" onClick={saveStudy}><Save />Enregistrer</button>
          <button type="button" onClick={downloadStudy}><Download />Télécharger</button>
          <button type="button" className="print" onClick={printStudy}><Printer />Imprimer</button>
        </div>
      </header>
      {saved && <div className="save-toast"><CheckCircle2 />Étude enregistrée</div>}
      {saveError && <div className="save-toast is-error">{saveError}</div>}

      {!studyParty() ? (
        <ExistingClientGate clients={clients} title="Étude thermique" allowCreate={false} allowProspect onSelect={applyClient} />
      ) : (
      <section className="paper thermal-paper">
        <div className="document-head">
          <img src="/mkl-energies.png" alt="MKL Énergies" />
          <div>
            <span>SERVICE COMMERCIAL</span>
            <h1>Étude thermique</h1>
            <p>Calcul des déperditions • Température de confort • Hiver de référence Alsace</p>
          </div>
        </div>

        <DocumentParties
          company={company}
          clientTitle="Client / destinataire"
          {...frozenRecipient(studyParty(), {
            clientName: form.client,
            firstName: form.firstName,
            lastName: form.lastName,
            address: form.address,
            addressComplement: form.addressComplement,
            postalCode: form.postalCode,
            city: form.city,
            phone: form.phone,
            email: form.email,
            clientNumberRaw: form.clientNumber,
          })}
        />
        <div className="thermal-metrics">
          <label>Surface chauffée (m²)
            <input type="number" min="0" step="0.1" value={form.surface} onChange={event => patch("surface", event.target.value)} />
          </label>
          <label>Hauteur (m)
            <input type="number" min="0" step="0.01" value={form.height} onChange={event => patch("height", event.target.value)} />
          </label>
          <div><small>Volume</small><b>{formatThermalNumber(computed.volume)} m³</b></div>
          <label>T° intérieure de confort
            <input type="number" step="0.1" value={form.tIndoor} onChange={event => patch("tIndoor", event.target.value)} />
          </label>
          <label>T° extérieure de base
            <input type="number" step="0.1" value={form.tOutdoor} onChange={event => patch("tOutdoor", event.target.value)} />
          </label>
          <div><small>Delta T</small><b>{formatThermalNumber(computed.deltaT)} °C</b></div>
          <div><small>Total points</small><b>{computed.points}</b></div>
          <div><small>Coefficient G</small><b>{formatThermalNumber(computed.g)}</b></div>
          <div className="thermal-power">
            <small>Puissance</small>
            <b>{formatThermalNumber(computed.powerDynamicKw)} kW</b>
            <span>Dynamique {formatThermalNumber(computed.powerDynamicKw)} kW · Maximale {formatThermalNumber(computed.powerMaxKw)} kW</span>
          </div>
        </div>

        <h2>Coefficient G d’isolation de la maison</h2>
        <ScoreGrid scores={form} onChange={patch} />

        <div className="thermal-g-table">
          {G_TABLE.slice().reverse().map(row => {
            const active = computed.g === row.g;
            const label = row.min >= 17.5 ? "≥ 17,5" : row.min < 6.5 ? "< 6,5" : `${String(row.min).replace(".", ",")} à ${String(row.min + 1).replace(".", ",")}`;
            return (
              <span className={active ? "active" : ""} key={row.min}>
                {label} · G = {formatThermalNumber(row.g)}
              </span>
            );
          })}
        </div>

        <h2>Calcul de la quantité d’énergie pour un hiver de référence</h2>
        <div className="thermal-formula">
          <span>VOLUME</span><b>{formatThermalNumber(computed.volume)}</b>
          <i>×</i>
          <span>G</span><b>{formatThermalNumber(computed.g)}</b>
          <i>×</i>
          <span>D.J.U. (Alsace = {ALSACE_DJU})</span><b>{formatThermalNumber(computed.dju, 0)}</b>
          <i>×</i>
          <span>0,018</span>
          <i>=</i>
          <strong>{formatThermalNumber(computed.energyKwh, 1)} kWh</strong>
        </div>

        <div className="thermal-columns">
          <section>
            <h3>Avec la pompe à chaleur · énergie de référence</h3>
            <div className="thermal-formula compact">
              <b>{formatThermalNumber(computed.energyKwh, 1)}</b>
              <i>/</i>
              <label>
                COP
                <input type="number" min="0.1" step="0.01" value={form.cop} onChange={event => patch("cop", event.target.value)} />
              </label>
              <i>=</i>
              <strong>{formatThermalNumber(computed.heatPumpKwh, 1)} kWh</strong>
            </div>
            <table>
              <thead><tr><th></th><th>Tarif</th><th>Quantité</th><th>Total annuel</th></tr></thead>
              <tbody>
                <tr>
                  <td>Air / Air</td>
                  <td><EuroField value={form.airAirTariff} onChange={event => patch("airAirTariff", event.target.value)} /></td>
                  <td>{formatThermalNumber(computed.pacQty, 1)}</td>
                  <td><b>{formatThermalMoney(computed.costs.airAir)}</b></td>
                </tr>
                <tr>
                  <td>Air / Eau</td>
                  <td><EuroField value={form.airEauTariff} onChange={event => patch("airEauTariff", event.target.value)} /></td>
                  <td>{formatThermalNumber(computed.pacQty, 1)}</td>
                  <td><b>{formatThermalMoney(computed.costs.airEau)}</b></td>
                </tr>
              </tbody>
            </table>
          </section>
          <section>
            <h3>Situation actuelle</h3>
            <table>
              <thead><tr><th></th><th>Tarif</th><th>Quantité</th><th>Total annuel €</th></tr></thead>
              <tbody>
                {[
                  ["EDF option de base", "edfTariff", "edfQty", computed.edfQty, computed.costs.edf],
                  ["Abonnement annuel 9 kVA", "subscriptionTariff", "subscriptionQty", computed.subscriptionQty, computed.costs.subscription],
                  ["Pellets", "pelletsTariff", "pelletsQty", computed.pelletsQty, computed.costs.pellets],
                  ["Propane · 1 kg = 13,8 kWh", "propaneTariff", "propaneQty", computed.propaneQty, computed.costs.propane],
                  ["Fuel · 1 L = 10 kWh", "fuelTariff", "fuelQty", computed.fuelQty, computed.costs.fuel],
                  ["Gaz de ville · 1 m³ = 10,5 kWh", "gasTariff", "gasQty", computed.gasQty, computed.costs.gas],
                ].map(([label, tariffKey, qtyKey, qty, total]) => (
                  <tr key={tariffKey}>
                    <td>{label}</td>
                    <td><EuroField value={form[tariffKey]} onChange={event => patch(tariffKey, event.target.value)} /></td>
                    <td><input type="number" min="0" step="0.1" value={form[qtyKey] === "" || form[qtyKey] == null ? qty : form[qtyKey]} onChange={event => patch(qtyKey, event.target.value)} /></td>
                    <td><b>{formatThermalMoney(total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="thermal-current-total">
              <span>Total situation actuelle</span>
              <b>{formatThermalMoney(computed.currentTotal)}</b>
            </div>
          </section>
        </div>

        <DocumentClosing
          single
          place={form.place || ""}
          onPlace={value => patch("place", value)}
          date={form.signatureDate}
          onDate={value => patch("signatureDate", value)}
        >
          <SignaturePad
            name="clientSignature"
            title="Signature du client"
            value={form.signature}
            onChange={value => patch("signature", value)}
          />
        </DocumentClosing>
        <p className="legal">Document établi par {companyDisplayName(company)}. Formules du calcul des déperditions : P (kW) = Volume × G × ΔT / 1000 · Q (kWh) = Volume × G × DJU × 0,018. DJU Alsace = {ALSACE_DJU}. {number ? `Référence ${number}.` : ""}</p>
      </section>
      )}
    </main>
  );
}
