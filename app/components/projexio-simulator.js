"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import {
  baremeLabel,
  clearProjexioResult,
  insuranceChoices,
  legalNotices,
  loanAmountEuros,
  normalizeBaremes,
  projexioFingerprint,
  projexioFirstMonthlyDays,
  projexioInputError,
  projexioIsCurrent,
  simulationOptions,
  suggestBaremeId,
} from "../lib/projexio";

const euro = value =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(value || 0));

async function callProjexio(body) {
  const response = await authFetch("/api/projexio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Simulation Projexio impossible.");
  return data.result;
}

export default function ProjexioSimulator({ state, patch, totalTTC }) {
  const [baremes, setBaremes] = useState([]);
  const [durations, setDurations] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const amount = loanAmountEuros(totalTTC, state.personalContribution);
  const selected = baremes.find(item => String(item.bareme) === String(state.projexioBareme));
  const insurances = insuranceChoices(selected);
  const inputError = projexioInputError(state, totalTTC);
  const current = projexioIsCurrent(state, totalTTC);
  const durationKey = [state.projexioBareme, amount, state.projexioInsuranceRate].join("|");

  useEffect(() => {
    let cancelled = false;
    callProjexio({ action: "baremes" })
      .then(result => {
        if (!cancelled) setBaremes(normalizeBaremes(result));
      })
      .catch(cause => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!baremes.length || state.projexioBareme) return;
    const id = suggestBaremeId(baremes, amount);
    const bareme = baremes.find(item => String(item.bareme) === String(id));
    if (bareme) selectBareme(bareme);
  }, [baremes]);

  useEffect(() => {
    requestRef.current += 1;
    setDurations([]);
  }, [durationKey]);

  function selectBareme(bareme) {
    const choices = insuranceChoices(bareme);
    const kept = choices.some(choice => Number(choice.rate) === Number(state.projexioInsuranceRate) && choice.rate !== "");
    setError("");
    patch(clearProjexioResult({
      projexioBareme: String(bareme.bareme),
      projexioMinAmount: bareme.montantMin,
      projexioMaxAmount: bareme.montantMax,
      projexioEcheanceMin: bareme.echeanceMin,
      projexioEcheanceMax: bareme.echeanceMax,
      projexioInsuranceRate: kept ? state.projexioInsuranceRate : "",
      firstMonthlyPayment: projexioFirstMonthlyDays(bareme.bareme),
    }));
  }

  function changeDrivers(partial) {
    setError("");
    patch(clearProjexioResult(partial));
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
      const result = await callProjexio({
        action: "simulations",
        bareme: state.projexioBareme,
        amount,
        insuranceRate: state.projexioInsuranceRate,
      });
      if (requestId !== requestRef.current) return;
      const options = simulationOptions(result);
      const legal = legalNotices(result);
      setDurations(options.map(option => ({ ...option, ...legal })));
      if (!options.length) setError("Projexio ne propose aucune durée pour ce dossier.");
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setDurations([]);
      setError(cause.message);
    } finally {
      if (requestId === requestRef.current) setBusy("");
    }
  }

  function chooseDuration(option) {
    const nextState = {
      ...state,
      financeMonths: option.financeMonths,
      projexioInsuranceRate: state.projexioInsuranceRate,
    };
    patch({
      financeMonths: option.financeMonths,
      monthlyPayment: option.monthlyPayment,
      financeNominalRate: option.financeNominalRate ?? "",
      financeTaeg: option.financeTaeg ?? "",
      financeTaea: option.financeTaea ?? "",
      firstMonthlyPayment: projexioFirstMonthlyDays(state.projexioBareme),
      financedAmount: amount,
      projexioMonthlyExInsurance: option.monthlyExInsurance ?? "",
      projexioReportMonths: option.reportMonths ?? "",
      projexioCreditCost: option.creditCost ?? "",
      projexioFileFees: option.fileFees ?? "",
      projexioLastMonthly: option.lastMonthly ?? "",
      projexioExample: option.example || "",
      projexioInsuranceInfo: option.insuranceInfo || "",
      projexioPedago: option.pedago || "",
      projexioMentions: option.mentions || "",
      projexioApplied: true,
      projexioFingerprint: projexioFingerprint(nextState, totalTTC),
    });
    setError("");
  }

  const withInsurance = state.projexioInsuranceRate !== "" && state.projexioInsuranceRate != null;

  return <div className="domofinance-simulator">
    <p className="devis-domo-note">Les chiffres viennent de Projexio. Pour les saisir à la main, choisissez un autre organisme.</p>
    <div className="form-row">
      <label>Barème
        <select
          value={state.projexioBareme || ""}
          onChange={event => {
            const bareme = baremes.find(item => String(item.bareme) === event.target.value);
            if (bareme) selectBareme(bareme);
          }}
        >
          <option value="">Choisir</option>
          {baremes.map(bareme => <option key={bareme.bareme} value={bareme.bareme}>{baremeLabel(bareme)}</option>)}
          {state.projexioBareme && !selected && <option value={state.projexioBareme}>Barème {state.projexioBareme}</option>}
        </select>
      </label>
      <label>Assurance
        <select
          value={insurances.some(choice => String(choice.rate) === String(state.projexioInsuranceRate ?? "")) ? String(state.projexioInsuranceRate ?? "") : ""}
          onChange={event => changeDrivers({ projexioInsuranceRate: event.target.value })}
        >
          {insurances.map(choice => <option key={choice.id} value={choice.rate}>{choice.label}</option>)}
        </select>
      </label>
    </div>
    <p className="devis-domo-note">Montant du prêt envoyé à Projexio : <b>{euro(amount)}</b>. C’est le total TTC moins l’apport.</p>
    <button type="button" className="secondary" disabled={Boolean(busy) || Boolean(inputError)} onClick={loadDurations}>
      {busy === "durees" ? "Calcul…" : "Voir les durées"}
    </button>
    {durations.length > 0 && (
      <div className="devis-domo-durations is-long">
        {durations.map(option => (
          <button
            type="button"
            key={option.financeMonths}
            className={current && Number(state.financeMonths) === option.financeMonths ? "is-selected" : ""}
            disabled={Boolean(busy)}
            onClick={() => chooseDuration(option)}
          >
            {option.financeMonths} mois
            <small>{euro(option.monthlyPayment)}{withInsurance ? " avec assurance" : " hors assurance"}</small>
          </button>
        ))}
      </div>
    )}
    {current && (
      <>
        <div className="devis-domo-result">
          <p><span>{withInsurance ? "Mensualité avec assurance" : "Mensualité"}</span><b>{euro(state.monthlyPayment)}</b></p>
          {withInsurance && <p><span>Hors assurance</span><b>{euro(state.projexioMonthlyExInsurance)}</b></p>}
          <p><span>Taux nominal</span><b>{state.financeNominalRate === "" || state.financeNominalRate == null ? "—" : `${state.financeNominalRate} %`}</b></p>
          <p><span>TAEG</span><b>{state.financeTaeg === "" || state.financeTaeg == null ? "—" : `${state.financeTaeg} %`}</b></p>
          <p><span>TAEA</span><b>{state.financeTaea === "" || state.financeTaea == null ? "—" : `${state.financeTaea} %`}</b></p>
          <p><span>Différé</span><b>{Number(state.projexioReportMonths) > 0 ? `${state.projexioReportMonths} mois` : "Aucun"}</b></p>
          <p><span>Première mensualité</span><b>{state.firstMonthlyPayment ? `${state.firstMonthlyPayment} jours` : "—"}</b></p>
          <p><span>Dernière mensualité</span><b>{euro(state.projexioLastMonthly)}</b></p>
          {state.projexioCreditCost !== "" && state.projexioCreditCost != null && <p><span>Coût du crédit</span><b>{euro(state.projexioCreditCost)}</b></p>}
          {state.projexioFileFees !== "" && state.projexioFileFees != null && <p><span>Frais de dossier</span><b>{euro(state.projexioFileFees)}</b></p>}
        </div>
        {state.projexioExample && <p className="devis-projexio-legal">{state.projexioExample}</p>}
        {state.projexioInsuranceInfo && <p className="devis-projexio-legal">{state.projexioInsuranceInfo}</p>}
        {state.projexioPedago && <p className="devis-projexio-legal"><b>{state.projexioPedago}</b></p>}
        {state.projexioMentions && <p className="devis-projexio-legal">{state.projexioMentions}</p>}
      </>
    )}
    {error && <p className="devis-wizard-alert"><AlertTriangle size={16} />{error}</p>}
  </div>;
}
