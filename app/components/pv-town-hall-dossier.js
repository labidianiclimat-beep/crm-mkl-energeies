"use client";

import { useMemo, useState } from "react";
import { Download, Landmark, MapPin, X } from "lucide-react";
import { housingFromPerson } from "../lib/housing";
import {
  applyTownHallStatus,
  instructionDelayMonths,
  parcelLabel,
  requiredPieces,
  TOWN_HALL_PROCEDURES,
  TOWN_HALL_STATUSES,
  townHallFromProject,
  townHallPieceProgress,
} from "../lib/pv-town-hall";
import { downloadTownHallDossierPdf } from "../lib/pv-town-hall-pdf";
import { authFetch } from "../lib/supabase-rest";
import { useCompany } from "../lib/use-company";

function clientForProject(project, clients = []) {
  return clients.find(item =>
    (project?.clientId && String(item.id) === String(project.clientId))
    || item.name === project?.client
  ) || null;
}

export default function PvTownHallDossier({ project, clients = [], onClose, onChange, toast }) {
  const { company } = useCompany();
  const person = useMemo(() => clientForProject(project, clients), [project, clients]);
  const housing = housingFromPerson(person || {});
  const townHall = townHallFromProject(project, person || {});
  const pieces = requiredPieces(townHall, person || {});
  const progress = townHallPieceProgress(townHall, person || {});
  const [loadingCadastre, setLoadingCadastre] = useState(false);
  const urbanisme = townHall.urbanisme || {};

  function patchTownHall(partial) {
    onChange({
      ...project,
      townHall: { ...townHall, ...partial },
    });
  }

  function togglePiece(id) {
    patchTownHall({ pieces: { ...townHall.pieces, [id]: !townHall.pieces[id] } });
  }

  async function fetchCadastre() {
    if (!project.lat || !project.lon) {
      toast?.("Géolocalisez d’abord l’adresse de l’étude.");
      return;
    }
    setLoadingCadastre(true);
    try {
      const response = await authFetch(`/api/pv/urbanisme?lat=${encodeURIComponent(project.lat)}&lon=${encodeURIComponent(project.lon)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Cadastre introuvable.");
      patchTownHall({ urbanisme: data.urbanisme });
      toast?.(data.urbanisme?.section ? "Parcelle cadastrale récupérée" : "Carte cadastrale ouverte, parcelle à confirmer");
    } catch (error) {
      toast?.(error.message || "Consultation cadastre impossible.");
    } finally {
      setLoadingCadastre(false);
    }
  }

  async function downloadDossier() {
    await downloadTownHallDossierPdf({
      project: { ...project, townHall },
      client: person,
      company,
      toast,
    });
  }

  return (
    <div className="backdrop">
      <div className="modal pv-modal pv-mairie-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        <div className="modal-icon"><Landmark /></div>
        <h2>Dossier mairie</h2>
        <p>
          {project.name || "Installation photovoltaïque"}
          {project.client ? ` · ${project.client}` : ""}
          {" — "}
          {progress.done}/{progress.total} pièces prêtes. Le dépôt reste à faire en mairie.
        </p>
        <div className="modal-form-body">
          <div className="form-row">
            <label>Statut
              <select
                value={project.townHallStatus || "À préparer"}
                onChange={event => onChange(applyTownHallStatus(project, event.target.value, person || {}))}
              >
                {TOWN_HALL_STATUSES.map(status => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label>Procédure
              <select value={townHall.procedure} onChange={event => patchTownHall({ procedure: event.target.value })}>
                {TOWN_HALL_PROCEDURES.map(item => (
                  <option key={item.id} value={item.id}>{item.label}{item.cerfa ? ` · ${item.cerfa}` : ""}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>N° de dossier
              <input value={townHall.reference} onChange={event => patchTownHall({ reference: event.target.value })} placeholder="DP 044 109 26 N0001" />
            </label>
            <label>Date de dépôt
              <input type="date" value={townHall.depositedAt} onChange={event => patchTownHall({ depositedAt: event.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label>Fin d’instruction
              <input type="date" value={townHall.instructionUntil} onChange={event => patchTownHall({ instructionUntil: event.target.value })} />
              <span className="directory-search-help">{instructionDelayMonths(townHall)} mois à compter du dépôt.</span>
            </label>
            <label>Architecte des Bâtiments de France
              <select value={townHall.abf} onChange={event => patchTownHall({ abf: event.target.value })}>
                <option value="inconnu">À vérifier</option>
                <option value="non">Non</option>
                <option value="oui">Oui — zone protégée</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>Copropriété
              <select value={townHall.copro} onChange={event => patchTownHall({ copro: event.target.value })}>
                <option value="non">Non</option>
                <option value="oui">Oui</option>
              </select>
            </label>
            <label>Logement
              <input readOnly value={[housing.housingType, housing.constructionYear, housing.occupancy].filter(Boolean).join(" · ") || "Non renseigné sur la fiche"} />
            </label>
          </div>
          <div className="form-row">
            <label>Toiture
              <input value={townHall.roofKind} onChange={event => patchTownHall({ roofKind: event.target.value })} />
            </label>
            <label>Aspect des panneaux
              <input value={townHall.appearance} onChange={event => patchTownHall({ appearance: event.target.value })} />
            </label>
          </div>

          <div className="pv-mairie-cadastre">
            <div>
              <MapPin size={17} />
              <span>
                <b>{parcelLabel(urbanisme) ? `Parcelle ${parcelLabel(urbanisme)}` : "Parcelle cadastrale"}</b>
                <small>
                  {urbanisme.commune || project.city || "Adresse de l’étude"}
                  {urbanisme.zoneLabel ? ` · zone ${urbanisme.zoneLabel}` : ""}
                  {urbanisme.contenance ? ` · ${urbanisme.contenance} m²` : ""}
                </small>
              </span>
            </div>
            <div className="pv-mairie-cadastre-actions">
              <button type="button" className="secondary" onClick={fetchCadastre} disabled={loadingCadastre}>
                {loadingCadastre ? "Recherche…" : "Lire le cadastre"}
              </button>
              {urbanisme.geoportailUrl ? (
                <a className="secondary" href={urbanisme.geoportailUrl} target="_blank" rel="noreferrer">Carte IGN</a>
              ) : null}
            </div>
          </div>

          <span className="prospect-chip-label">Pièces à joindre</span>
          <div className="pv-mairie-pieces">
            {pieces.map(piece => (
              <label key={piece.id} className={townHall.pieces[piece.id] ? "selected" : ""}>
                <input type="checkbox" checked={Boolean(townHall.pieces[piece.id])} onChange={() => togglePiece(piece.id)} />
                <span>
                  <b>{piece.label}</b>
                  <small>{piece.hint}</small>
                </span>
              </label>
            ))}
          </div>

          <label>Notes internes
            <textarea rows="3" value={townHall.notes} onChange={event => patchTownHall({ notes: event.target.value })} placeholder="Ex. mairie de La Baule, dépôt en ligne, pièce manquante…" />
          </label>
        </div>
        <div className="modal-form-actions">
          <button type="button" className="secondary" onClick={onClose}>Fermer</button>
          <button type="button" className="primary" onClick={downloadDossier}>
            <Download size={17} />Télécharger le dossier
          </button>
        </div>
      </div>
    </div>
  );
}
