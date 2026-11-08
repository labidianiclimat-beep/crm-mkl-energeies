"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import RecipientConnect from "./recipient-connect";
import { formatClientNumber } from "../lib/client-number";
import { formatProspectNumber } from "../lib/prospect-number";
import { findExistingClient } from "../lib/existing-client";
import { findThermalStudyByNumber, sizingClientForStudy } from "../lib/sizing-note";

function knownClient(clients, client) {
  if (!client?.id) return null;
  return findExistingClient(clients, client.id) || client;
}

export default function DocumentWindow({
  eyebrow = "DOCUMENT",
  title,
  hint = "Le numéro client, le numéro prospect, ou le nom et le prénom.",
  clients = [],
  prospects = null,
  initialClient = null,
  skipClient = false,
  onConfirm,
  onClose,
  pickerOnly = false,
  allowProspect = false,
  thermalStudies = null,
  children,
}) {
  const preset = knownClient(clients, initialClient);
  const [draft, setDraft] = useState(preset);
  const [chosen, setChosen] = useState(preset);
  const [ready, setReady] = useState(Boolean(skipClient || preset));
  const [studyQuery, setStudyQuery] = useState("");
  const [studyMiss, setStudyMiss] = useState("");
  const [pendingStudy, setPendingStudy] = useState(null);
  const shown = chosen || draft;
  const address = [shown?.address, shown?.postalCode, shown?.city].filter(Boolean).join(" ");

  function validate(person, study) {
    const chosenPerson = person?.id ? person : draft;
    const chosenStudy = study === undefined ? pendingStudy : study;
    if (!chosenPerson?.id) return;
    onConfirm?.(chosenPerson, chosenStudy || null);
    if (pickerOnly) return;
    setChosen(chosenPerson);
    setReady(true);
  }

  function commitStudy(raw = studyQuery, open = false) {
    const { study, ambiguous } = findThermalStudyByNumber(thermalStudies || [], raw);
    if (ambiguous) {
      setStudyMiss("Plusieurs études portent ces chiffres. Saisissez le numéro complet.");
      return;
    }
    if (!study) {
      setStudyMiss("Aucune étude thermique avec ce numéro.");
      return;
    }
    const { client, reason } = sizingClientForStudy(study, clients);
    if (!client) {
      setStudyMiss(reason === "prospect"
        ? "Cette étude est sur un prospect. La note se fait une fois le client créé."
        : "Cette étude n’est pas reliée à un client visible.");
      return;
    }
    const person = { ...client, directoryKind: client.directoryKind || "client" };
    setStudyMiss("");
    setDraft(person);
    setPendingStudy(study);
    if (open) validate(person, study);
  }

  return (
    <div
      className="document-window-backdrop"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <div className="document-window" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header className="document-window-head">
          <div className="document-window-brand">
            <img src="/mkl-energies.png" alt="MKL Énergies" />
            <div>
              <p>{eyebrow}</p>
              <h2>{title}</h2>
            </div>
          </div>
          <button type="button" className="document-window-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </header>
        {ready ? (
          <div className="document-window-body" key={chosen?.id || "document"}>
            {typeof children === "function" ? children(chosen) : children}
          </div>
        ) : (
          <div className="document-window-pick">
            <p>{hint}</p>
            <RecipientConnect clients={clients} prospects={prospects} allowCreate={false} allowProspect={allowProspect} showChoice={false} onSelect={item => { setPendingStudy(null); setDraft(item || null); }} />
            {Array.isArray(thermalStudies) ? (
              <>
                <p className="document-window-or">ou</p>
                <div className="document-window-study">
                  <label>Numéro d’étude thermique
                    <input
                      value={studyQuery}
                      placeholder="ETH-2026-000001"
                      autoComplete="off"
                      aria-label="Numéro d’étude thermique"
                      onChange={event => {
                        setStudyMiss("");
                        setStudyQuery(event.target.value);
                      }}
                      onBlur={() => { if (studyQuery.trim()) commitStudy(studyQuery, false); }}
                      onKeyDown={event => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        commitStudy(studyQuery, true);
                      }}
                    />
                  </label>
                  {studyMiss ? <p className="document-window-miss">{studyMiss}</p> : null}
                </div>
              </>
            ) : null}
            {draft ? (
              <article className="document-window-choice">
                <span>{draft.directoryKind === "prospect" ? "Prospect retenu" : "Client retenu"}</span>
                <b>{draft.name}</b>
                {formatClientNumber(draft.clientNumber) ? <small>{formatClientNumber(draft.clientNumber)}</small> : null}
                {formatProspectNumber(draft.prospectNumber) ? <small>{formatProspectNumber(draft.prospectNumber)}</small> : null}
                {address ? <p>{address}</p> : null}
              </article>
            ) : null}
            <div className="document-window-actions">
              <button type="button" className="primary" disabled={!draft?.id} onClick={() => validate()}>
                <CheckCircle2 size={17} /> Valider et continuer
              </button>
            </div>
            <p className="document-window-note">{allowProspect ? "Le formulaire s’ouvre dès que le prospect ou le client est trouvé." : "Choisissez une fiche déjà enregistrée. La création de client reste dans le module Clients."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
