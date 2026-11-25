"use client";

import { X } from "lucide-react";
import { PREVISIT_EQUIPMENT } from "../lib/previsit-photos";

export default function PrevisitEquipmentLibrary({ open, onPick, onClose }) {
  if (!open) return null;
  return (
    <div className="previsit-lib-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <div className="previsit-lib" role="dialog" aria-modal="true" aria-label="Bibliothèque d’équipements">
        <header>
          <b>Choisir un équipement</b>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="previsit-lib-grid">
          {PREVISIT_EQUIPMENT.map(item => (
            <button type="button" key={item.id} onClick={() => onPick(item.id)}>
              <img src={item.src} alt="" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
