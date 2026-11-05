"use client";

import { useState } from "react";
import { OTHER_PROSPECTOR } from "../lib/prospector-choice";
import { prospectorUsers } from "../lib/prospects";

export default function ProspectorPicker({
  team = [],
  currentUserId = "",
  currentUserName = "",
  fieldCapture = false,
  prospectorId = "",
  prospector = "",
  readOnly = false,
}) {
  const prospectors = (() => {
    const list = [...prospectorUsers(team)];
    if (currentUserId && fieldCapture && !list.some(user => String(user.id) === String(currentUserId))) {
      list.unshift({ id: currentUserId, name: currentUserName || "Moi", role: "Prospecteur terrain" });
    }
    if (prospectorId && !list.some(user => String(user.id) === String(prospectorId))) {
      list.push({ id: prospectorId, name: prospector || "Prospecteur actuel" });
    }
    return list;
  })();
  const namedOther = Boolean(prospector) && !prospectorId;
  const defaultChoice = namedOther
    ? OTHER_PROSPECTOR
    : (prospectorId || (prospectors.some(user => String(user.id) === String(currentUserId)) ? currentUserId : ""));
  const [choice, setChoice] = useState(defaultChoice);
  const [otherName, setOtherName] = useState(namedOther ? prospector : "");
  const isOther = choice === OTHER_PROSPECTOR;
  const displayName = prospector || (namedOther ? otherName : "") || "Non renseigné";

  return (
    <>
      <label>Prospecteur qui a pris le contact
        {readOnly
          ? <input value={displayName} readOnly />
          : (
            <select
              name="prospectorId"
              required
              value={choice}
              onChange={event => setChoice(event.target.value)}
            >
              <option value="">Choisir le prospecteur</option>
              {prospectors.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name}{user.role === "Responsable prospection" ? " — responsable" : ""}
                  {String(user.id) === String(currentUserId) ? " — moi" : ""}
                </option>
              ))}
              <option value={OTHER_PROSPECTOR}>Autre</option>
            </select>
          )}
      </label>
      {!readOnly && isOther && (
        <label>Nom du prospecteur
          <input
            name="prospector"
            required
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Prénom et nom"
            value={otherName}
            onChange={event => setOtherName(event.target.value)}
          />
        </label>
      )}
      {!readOnly && !isOther && <input type="hidden" name="prospector" value="" />}
      <p className="prospect-hint">
        {isOther
          ? "Indiquez la personne si elle n’a pas de compte CRM."
          : "Indiquez le prospecteur terrain, même si vous saisissez la fiche à sa place."}
      </p>
    </>
  );
}
