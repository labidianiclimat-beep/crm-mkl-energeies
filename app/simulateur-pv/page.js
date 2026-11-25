"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Printer, Save, Sun } from "lucide-react";
import { ExistingClientGate } from "../components/recipient-connect";
import DocumentClosing from "../components/document-closing";
import DocumentParties, { frozenRecipient } from "../components/document-parties";
import SignaturePad from "../components/signature-pad";
import { personSearchFields } from "../lib/directory-search";
import { EXISTING_CLIENT_MESSAGE, findExistingClient, recipientLink } from "../lib/existing-client";
import { openPvSimulatorPrintWindow } from "../lib/pv-production-print";
import {
  PV_INCLINATIONS,
  PV_ORIENTATIONS,
  PV_SIMULATOR_STORAGE_KEY,
  computePvSimulation,
  createEmptyPvSimulation,
  formatPvSimKwh,
  formatPvSimNumber,
  irradiationForPostal,
  nextSimulationNumber,
  orientationCoefficient,
  inclinationSlopePoints,
} from "../lib/pv-production-simulator";
import { useCompany } from "../lib/use-company";
import { companyDisplayName } from "../lib/company";
import { authFetch } from "../lib/supabase-rest";
import { loadSharedRecords, saveSharedRecords } from "../lib/use-record-table";
import "../previsite/previsite.css";
import "../etude-thermique/etude-thermique.css";
import "./simulateur-pv.css";

function InclinationSlope({ degrees }) {
  const { x1, y1, x2, y2 } = inclinationSlopePoints(degrees);
  return (
    <svg className="pvsim-slope" viewBox="0 0 24 24" aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
    </svg>
  );
}

function readLocal(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function loadSimulations() {
  return loadSharedRecords(PV_SIMULATOR_STORAGE_KEY);
}

async function persistSimulations(records) {
  await saveSharedRecords(PV_SIMULATOR_STORAGE_KEY, records);
}

async function loadClients() {
  try {
    const response = await authFetch("/api/clients");
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.clients)) return data.clients;
  } catch {}
  return readLocal("mkl-clients");
}

function simulationFromClient(client) {
  const empty = createEmptyPvSimulation();
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
    postalCode: client.postalCode || "",
    city: client.city || "",
    mobile: client.mobile || client.phone || "",
    email: client.email || "",
    place: client.city || "",
    irradiation: irradiationForPostal(client.postalCode)?.kwh
      ? String(irradiationForPostal(client.postalCode).kwh)
      : empty.irradiation,
  };
}

export default function PvSimulatorPage({
  embedded = false,
  presetClient = null,
  presetId = "",
  onClose,
  onSaved,
} = {}) {
  const [form, setForm] = useState(() => simulationFromClient(presetClient));
  const [recordId, setRecordId] = useState(null);
  const [number, setNumber] = useState("");
  const [clients, setClients] = useState([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const { company } = useCompany();
  const computed = useMemo(() => computePvSimulation(form), [form]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = embedded ? new URLSearchParams() : new URLSearchParams(window.location.search);
      const id = embedded ? (presetId || "") : params.get("id");
      const clientId = embedded ? (presetClient?.id || "") : params.get("clientId");
      const [records, directory] = await Promise.all([loadSimulations(), loadClients()]);
      if (cancelled) return;
      setClients(directory);
      if (id) {
        const found = records.find(item => String(item.id) === String(id));
        if (found) {
          setRecordId(found.id);
          setNumber(found.number || "");
          setForm({ ...createEmptyPvSimulation(), ...found });
        }
      } else if (clientId && presetClient?.directoryKind !== "prospect") {
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

  function applyPostal(postalCode, current) {
    const next = { ...current, postalCode };
    if (current.irradiationManual) return next;
    const known = irradiationForPostal(postalCode);
    if (!known) return next;
    return { ...next, irradiation: String(known.kwh) };
  }

  function applyClient(client) {
    if (!client) {
      setForm(current => ({ ...current, clientId: "", prospectId: "", client: "" }));
      return;
    }
    const link = recipientLink(client);
    const fields = personSearchFields(client);
    setForm(current => applyPostal(client.postalCode || current.postalCode, {
      ...current,
      clientId: link.clientId,
      prospectId: link.prospectId,
      clientNumber: link.clientId ? (client.clientNumber || "") : "",
      client: client.name || `${fields.lastName} ${fields.firstName}`.trim(),
      lastName: fields.lastName || current.lastName,
      firstName: fields.firstName || current.firstName,
      address: client.address || current.address,
      postalCode: client.postalCode || current.postalCode,
      city: client.city || current.city,
      mobile: client.mobile || client.phone || current.mobile,
      email: client.email || current.email,
      place: current.place || client.city || "",
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
      phone: form.mobile,
      email: form.email,
      directoryKind: "prospect",
    } : null);
  }

  function selectRoof(orientation, inclination) {
    setForm(current => ({ ...current, orientation, inclination }));
  }

  async function saveSimulation() {
    if (!studyParty()) {
      setSaveError(EXISTING_CLIENT_MESSAGE);
      setSaved(false);
      return null;
    }
    setSaveError("");
    const records = await loadSimulations();
    const id = recordId || Date.now();
    const assigned = number || nextSimulationNumber(records);
    const record = {
      ...form,
      ...computed,
      id,
      number: assigned,
      client: form.client || `${form.lastName} ${form.firstName}`.trim(),
      status: "Simulation complétée",
      created: form.created || new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    const next = records.some(item => String(item.id) === String(id))
      ? records.map(item => String(item.id) === String(id) ? record : item)
      : [record, ...records];
    await persistSimulations(next);
    setRecordId(id);
    setNumber(assigned);
    setForm(current => ({ ...current, created: record.created }));
    if (!recordId && !embedded) history.replaceState({}, "", `/simulateur-pv?id=${id}`);
    onSaved?.(record);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    return record;
  }

  async function printSimulation(autoPrint) {
    try {
      const record = await saveSimulation();
      if (!record) return;
      await openPvSimulatorPrintWindow({
        form: { ...form, ...computed, ...(record || {}) },
        company,
        number: record?.number || number,
        autoPrint,
      });
    } catch (error) {
      setSaveError(String(error?.message || (autoPrint ? "Impression impossible" : "Téléchargement PDF impossible")));
    }
  }

  if (loading) {
    return <main className={`previsit-app thermal-loading${embedded ? " is-embedded" : ""}`}>Chargement du simulateur…</main>;
  }

  return (
    <main className={`previsit-app thermal-app${embedded ? " is-embedded" : ""}`}>
      <header className="form-toolbar">
        <button type="button" onClick={() => { if (embedded) onClose?.(); else window.location.href = "/"; }}>
          <ArrowLeft />Retour CRM
        </button>
        <div>
          <Sun size={18} />
          <span>
            <b>Simulateur photovoltaïque</b>
            <small>{number || "Nouvelle estimation de production"}</small>
          </span>
        </div>
        <div>
          <button type="button" onClick={saveSimulation}><Save />Enregistrer</button>
          <button type="button" onClick={() => printSimulation(false)}><Download />Télécharger</button>
          <button type="button" className="print" onClick={() => printSimulation(true)}><Printer />Imprimer</button>
        </div>
      </header>
      {saved && <div className="save-toast"><CheckCircle2 />Simulation enregistrée</div>}
      {saveError && <div className="save-toast is-error">{saveError}</div>}

      {!studyParty() ? (
        <ExistingClientGate clients={clients} title="Simulateur photovoltaïque" allowCreate={false} allowProspect onSelect={applyClient} />
      ) : (
      <section className="paper thermal-paper">
        <div className="document-head">
          <img src="/mkl-energies.png" alt="MKL Énergies" />
          <div>
            <span>SERVICE COMMERCIAL</span>
            <h1>Simulateur de production photovoltaïque</h1>
            <p>Estimation de première année • A × B × C × D</p>
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
            postalCode: form.postalCode,
            city: form.city,
            phone: form.mobile,
            email: form.email,
            clientNumberRaw: form.clientNumber,
          })}
        />

        <div className="pvsim-banner"><span>ENSOLEILLEMENT</span></div>
        <div className="pvsim-line">
          <label>Ensoleillement annuel à l’horizontale A (kWh/m²/an)
            <input
              type="number"
              min="0"
              step="1"
              value={form.irradiation}
              onChange={event => setForm(current => ({
                ...current,
                irradiation: event.target.value,
                irradiationManual: true,
              }))}
            />
          </label>
          {computed.departmentName && (
            <p className="pvsim-note">Moyenne de référence {computed.departmentName} : {formatPvSimKwh(computed.suggestedIrradiation)} kWh/m²/an. Le champ reste modifiable.</p>
          )}
        </div>
        <p className="pvsim-note">Cette donnée d’ensoleillement est une moyenne départementale issue d’une base de référence utilisée pour l’estimation de la production photovoltaïque.</p>

        <div className="pvsim-banner"><span>INCLINAISON, ORIENTATION DE LA TOITURE ET MASQUE SOLAIRE</span></div>
        <table className="pvsim-grid">
          <thead>
            <tr>
              <th>Orientation</th>
              {PV_INCLINATIONS.map(item => (
                <th key={item.id}>
                  <span>{item.label}</span>
                  <InclinationSlope degrees={item.degrees} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PV_ORIENTATIONS.map(orientation => (
              <tr key={orientation.id}>
                <th>{orientation.label}</th>
                {PV_INCLINATIONS.map(inclination => {
                  const selected = form.orientation === orientation.id && form.inclination === inclination.id;
                  const coefficient = orientationCoefficient(orientation.id, inclination.id);
                  return (
                    <td className={selected ? "on" : ""} key={inclination.id}>
                      <button type="button" onClick={() => selectRoof(orientation.id, inclination.id)}>
                        {formatPvSimNumber(coefficient)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pvsim-note">Choisissez la case de la toiture. Coefficient B = {computed.coefficient == null ? "—" : formatPvSimNumber(computed.coefficient)}.</p>

        <div className="pvsim-banner"><span>CARACTÉRISTIQUES DE L’INSTALLATION</span></div>
        <div className="pvsim-line">
          <label>Puissance préconisée C (kWc)
            <input type="number" min="0" step="0.1" value={form.powerKwc} onChange={event => patch("powerKwc", event.target.value)} />
          </label>
          <label>Efficacité de l’installation D
            <input type="number" min="0" step="0.01" value={form.efficiency} onChange={event => patch("efficiency", event.target.value)} />
          </label>
        </div>
        <p className="pvsim-note">D est un coefficient. 0,80 et 80 % donnent le même résultat.</p>

        <div className="pvsim-banner"><span>RÉSULTAT DE LA SIMULATION</span></div>
        <p className="pvsim-note">Le résultat ci-dessous prend en compte les paramètres renseignés ci-dessus. Cette estimation est fournie à titre indicatif et ne revêt aucun caractère contractuel.</p>
        <div className="pvsim-result">
          <span>Production escomptée en première année<small>A × B × C × D = E</small></span>
          <b>{formatPvSimKwh(computed.production)} kWh</b>
        </div>
        <div className="pvsim-line">
          <label>Tarif de référence du surplus (€/kWh, première année)
            <input type="number" min="0" step="0.0001" value={form.surplusTariff} onChange={event => patch("surplusTariff", event.target.value)} />
          </label>
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
        <p className="legal">Document établi par {companyDisplayName(company)}. Production de première année : E = A × B × C × D. A en kWh/m²/an, B coefficient d’orientation et d’inclinaison, C en kWc, D efficacité de l’installation. {number ? `Référence ${number}.` : ""}</p>
      </section>
      )}
    </main>
  );
}
