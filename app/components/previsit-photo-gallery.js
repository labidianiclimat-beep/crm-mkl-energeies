"use client";

import { Pencil, Trash2 } from "lucide-react";

export default function PrevisitPhotoGallery({ photos = [], onEdit, onRemove }) {
  if (!photos.length) {
    return <p className="previsit-photo-empty">Aucune photo pour cette prévisite. Prenez-en une depuis le chantier.</p>;
  }
  return (
    <div className="previsit-photo-grid">
      {photos.map(photo => (
        <article key={photo.id} className="previsit-photo-card">
          <button type="button" className="previsit-photo-thumb" onClick={() => onEdit(photo)}>
            {photo.previewUrl ? <img src={photo.previewUrl} alt={photo.caption || "Photo technique"} /> : <span>Chargement…</span>}
          </button>
          <b>{photo.caption || "Sans légende"}</b>
          <small>{photo.marks?.length || 0} équipement{(photo.marks?.length || 0) > 1 ? "s" : ""}</small>
          <div>
            <button type="button" onClick={() => onEdit(photo)}><Pencil size={16} />Annoter</button>
            <button type="button" onClick={() => onRemove(photo)}><Trash2 size={16} />Supprimer</button>
          </div>
        </article>
      ))}
    </div>
  );
}
