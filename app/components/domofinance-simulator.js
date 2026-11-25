"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import {
  clearDomofinanceResult,
  domofinanceFingerprint,
  domofinanceInputError,
  domofinanceIsCurrent,
  durationOptions,
  insuranceChoices,
  insuranceLabel,
  loanAmountEuros,
  mapSimulationResult,
  modalityLabel,
  normalizeModalities,
  suggestMaterialId,
} from "../lib/domofinance";

const euro = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(value || 0));

async function callDomofinance(body) {
  const response = await authFetch("/api/domofinance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Simulation Domofinance impossible.");
  return data.result;
}

export default function DomofinanceSimulator({ state, patch, totalTTC, items = [], articles = [] }) {
  const [materials, setMaterials] = useState([]);
  const [durations, setDurations] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const amount = loanAmountEuros(totalTTC, state.personalContribution);
  const selected = materials.find(item => String(item.id) === String(state.domofinanceMaterialId));
  const modalities = selected ? normalizeModalities(selected) : [state.domofinanceModality || "normal"].filter(Boolean);
  const postponeAvailable = selected ? Boolean(selected.availablePostpone) : Boolean(state.domofinancePostponeAvailable);
  const borrowerInsurances = insuranceChoices({ birthDate: state.borrowerBirthDate, inActivity: state.borrowerInActivity });
  const coborrowerInsurances = ["none", ...insuranceChoices({ birthDate: state.coborrowerBirthDate, inActivity: state.coborrowerInActivity })];
  const inputError = domofinanceInputError(state, totalTTC);
  const current = domofinanceIsCurrent(state, totalTTC);
  const durationKey = [
    state.domofinanceMaterialId,
    amount,
    state.domofinanceModality,
    state.domofinancePostpone,
    state.borrowerBirthDate,
    state.hasCoborrower,
    state.coborrowerBirthDate,
  ].join("|");

  useEffect(() => {
    let cancelled = false;
    callDomofinance({ action: "materiels" })
      .then(result => {
        if (!cancelled) setMaterials(Array.isArray(result) ? result : []);
      })
      .catch(cause => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!materials.length || state.domofinanceMaterialId) return;
    const suggested = suggestMaterialId(items, materials, articles);
    const material = materials.find(item => String(item.id) === String(suggested));
    if (material) selectMaterial(material);
  }, [materials]);

  useEffect(() => {
    requestRef.current += 1;
    setDurations([]);
  }, [durationKey]);

  useEffect(() => {
    if (state.borrowerInsurance && !borrowerInsurances.includes(state.borrowerInsurance)) {
      patch(clearDomofinanceResult({ borrowerInsurance: borrowerInsurances[0] || "D" }));
    }
  }, [state.borrowerBirthDate, state.borrowerInActivity, state.borrowerInsurance]);

  useEffect(() => {
    if (!state.hasCoborrower) return;
    if (state.coborrowerInsurance && !coborrowerInsurances.includes(state.coborrowerInsurance)) {
      const fallback = coborrowerInsurances.find(insurance => insurance !== "none") || "none";
      patch(clearDomofinanceResult({ coborrowerInsurance: fallback }));
    }
  }, [state.hasCoborrower, state.coborrowerBirthDate, state.coborrowerInActivity, state.coborrowerInsurance]);

  function selectMaterial(material) {
    const nextModalities = normalizeModalities(material);
    const modality = nextModalities.includes(state.domofinanceModality) ? state.domofinanceModality : (nextModalities[0] || "normal");
    setError("");
    patch(clearDomofinanceResult({
      domofinanceMaterialId: String(material.id),
      domofinanceMaterialName: String(material.equipmentName || "").trim(),
      domofinanceMinAmount: material.minAmount,
      domofinanceMaxAmount: material.maxAmount,
      domofinancePostponeAvailable: Boolean(material.availablePostpone),
      domofinanceModality: modality,
      domofinancePostpone: material.availablePostpone ? Boolean(state.domofinancePostpone) : false,
    }));
  }

  function changeDrivers(partial) {
    setError("");
    patch(clearDomofinanceResult(partial));
  }

  function requestBody(extra = {}) {
    return {
      materialId: state.domofinanceMaterialId,
      amount,
      modality: state.domofinanceModality,
      postpone: postponeAvailable && state.domofinancePostpone,
      birthDate: state.borrowerBirthDate,
      inActivity: Boolean(state.borrowerInActivity),
      insurance: state.borrowerInsurance,
      hasCoborrower: Boolean(state.hasCoborrower),
      coborrowerBirthDate: state.coborrowerBirthDate,
      coborrowerInActivity: Boolean(state.coborrowerInActivity),
      coborrowerInsurance: state.coborrowerInsurance || "none",
      ...extra,
    };
  }

  async function loadDurations() {
    if (inputError) {
      setError(inputError);
      return;
    }
    const requestId = requestRef.current;
    setBusy("durees");
    setError("");
    try {
      const result = await callDomofinance({ action: "durees", ...requestBody() });
      if (requestId !== requestRef.current) return;
      const options = durationOptions(result);
      setDurations(options);
      if (!options.length) setError("Domofinance ne propose aucune durée pour ce dossier.");
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setDurations([]);
      setError(cause.message);
    } finally {
      if (requestId === requestRef.current) setBusy("");
    }
  }

  async function chooseDuration(months) {
    const requestId = requestRef.current;
    setBusy("resultat");
    setError("");
    try {
      const result = await callDomofinance({ action: "resultat", ...requestBody({ months }) });
      if (requestId !== requestRef.current) return;
      const mapped = mapSimulationResult(result);
      if (!mapped) throw new Error("Réponse Domofinance incomplète.");
      const nextState = { ...state, financeMonths: mapped.financeMonths };
      patch({
        financeMonths: mapped.financeMonths,
        monthlyPayment: mapped.monthlyPayment,
        financeNominalRate: mapped.financeNominalRate ?? "",
        financeTaeg: mapped.financeTaeg ?? "",
        financeTaea: mapped.financeTaea ?? "",
        firstMonthlyPayment: mapped.firstMonthlyPayment,
        financedAmount: mapped.financedAmount,
        domofinanceMaterialName: mapped.equipmentName || state.domofinanceMaterialName,
        domofinanceMonthlyExInsurance: mapped.monthlyExInsurance ?? "",
        domofinanceCreditCost: mapped.creditCost ?? "",
        domofinanceSellerRetention: mapped.sellerRetention ?? "",
        domofinanceSellerRetentionRate: mapped.sellerRetentionRate ?? "",
        domofinanceApplied: true,
        domofinanceFingerprint: domofinanceFingerprint(nextState, totalTTC),
      });
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      patch(clearDomofinanceResult());
      setError(cause.message);
    } finally {
      if (requestId === requestRef.current) setBusy("");
    }
  }

  return <div className="domofinance-simulator">
    <p className="devis-domo-note">Les chiffres viennent de Domofinance. Pour les saisir à la main, choisissez un autre organisme.</p>
    <div className="form-row">
      <label>Produit
        <select
          value={state.domofinanceMaterialId || ""}
          onChange={event => {
            const material = materials.find(item => String(item.id) === event.target.value);
            if (material) selectMaterial(material);
          }}
        >
          <option value="">Choisir</option>
          {materials.map(material => (
            <option key={material.id} value={material.id}>
              {String(material.equipmentName || "").trim()} · {material.minAmount} à {material.maxAmount} €
            </option>
          ))}
          {state.domofinanceMaterialId && !selected && (
            <option value={state.domofinanceMaterialId}>{state.domofinanceMaterialName || "Produit enregistré"}</option>
          )}
        </select>
      </label>
      <label>Modalité
        <select value={state.domofinanceModality || "normal"} onChange={event => changeDrivers({ domofinanceModality: event.target.value })}>
          {modalities.map(modality => <option key={modality} value={modality}>{modalityLabel(modality)}</option>)}
        </select>
      </label>
      {postponeAvailable && (
        <label className="client-consent">
          <input
            type="checkbox"
            checked={Boolean(state.domofinancePostpone)}
            onChange={event => changeDrivers({ domofinancePostpone: event.target.checked })}
          />
          <span>Report de la première échéance à 180 jours</span>
        </label>
      )}
    </div>
    <div className="form-row">
      <label>Date de naissance de l’emprunteur
        <input type="date" value={state.borrowerBirthDate || ""} onChange={event => changeDrivers({ borrowerBirthDate: event.target.value })} />
      </label>
      <label>Situation
        <select value={state.borrowerInActivity ? "true" : "false"} onChange={event => changeDrivers({ borrowerInActivity: event.target.value === "true" })}>
          <option value="true">En activité</option>
          <option value="false">Retraité ou sans emploi</option>
        </select>
      </label>
      <label>Assurance
        <select value={borrowerInsurances.includes(state.borrowerInsurance) ? state.borrowerInsurance : borrowerInsurances[0]} onChange={event => changeDrivers({ borrowerInsurance: event.target.value })}>
          {borrowerInsurances.map(insurance => <option key={insurance} value={insurance}>{insuranceLabel(insurance)}</option>)}
        </select>
      </label>
    </div>
    <label className="client-consent">
      <input
        type="checkbox"
        checked={Boolean(state.hasCoborrower)}
        onChange={event => changeDrivers({ hasCoborrower: event.target.checked })}
      />
      <span>Ajouter un co-emprunteur</span>
    </label>
    {state.hasCoborrower && (
      <div className="form-row">
        <label>Date de naissance du co-emprunteur
          <input type="date" value={state.coborrowerBirthDate || ""} onChange={event => changeDrivers({ coborrowerBirthDate: event.target.value })} />
        </label>
        <label>Situation du co-emprunteur
          <select value={state.coborrowerInActivity ? "true" : "false"} onChange={event => changeDrivers({ coborrowerInActivity: event.target.value === "true" })}>
            <option value="true">En activité</option>
            <option value="false">Retraité ou sans emploi</option>
          </select>
        </label>
        <label>Assurance du co-emprunteur
          <select value={coborrowerInsurances.includes(state.coborrowerInsurance) ? state.coborrowerInsurance : "none"} onChange={event => changeDrivers({ coborrowerInsurance: event.target.value })}>
            {coborrowerInsurances.map(insurance => <option key={insurance} value={insurance}>{insuranceLabel(insurance)}</option>)}
          </select>
        </label>
      </div>
    )}
    <p className="devis-domo-note">Montant du prêt envoyé à Domofinance : <b>{euro(amount)}</b>. C’est le total TTC moins l’apport, arrondi à l’euro.</p>
    <button type="button" className="secondary" disabled={Boolean(busy) || Boolean(inputError)} onClick={loadDurations}>
      {busy === "durees" ? "Calcul…" : "Voir les durées"}
    </button>
    {durations.length > 0 && (
      <div className="devis-domo-durations">
        {durations.map(option => (
          <button
            type="button"
            key={option.months}
            className={current && Number(state.financeMonths) === option.months ? "is-selected" : ""}
            disabled={Boolean(busy)}
            onClick={() => chooseDuration(option.months)}
          >
            {option.months} mois
            <small>{euro(option.monthlyExInsurance)} hors assurance</small>
          </button>
        ))}
      </div>
    )}
    {current && (
      <div className="devis-domo-result">
        <p><span>Mensualité avec assurance</span><b>{euro(state.monthlyPayment)}</b></p>
        <p><span>Hors assurance</span><b>{euro(state.domofinanceMonthlyExInsurance)}</b></p>
        <p><span>Taux nominal</span><b>{state.financeNominalRate === "" || state.financeNominalRate == null ? "—" : `${state.financeNominalRate} %`}</b></p>
        <p><span>TAEG</span><b>{state.financeTaeg === "" || state.financeTaeg == null ? "—" : `${state.financeTaeg} %`}</b></p>
        <p><span>TAEA</span><b>{state.financeTaea === "" || state.financeTaea == null ? "—" : `${state.financeTaea} %`}</b></p>
        <p><span>Première échéance</span><b>{state.firstMonthlyPayment} jours</b></p>
        {state.domofinanceCreditCost !== "" && state.domofinanceCreditCost != null && <p><span>Coût du crédit</span><b>{euro(state.domofinanceCreditCost)}</b></p>}
        {state.domofinanceSellerRetention !== "" && state.domofinanceSellerRetention != null && (
          <p><span>Retenue vendeur, interne</span><b>{euro(state.domofinanceSellerRetention)}</b></p>
        )}
      </div>
    )}
    {error && <p className="devis-wizard-alert"><AlertTriangle size={16} />{error}</p>}
  </div>;
}
