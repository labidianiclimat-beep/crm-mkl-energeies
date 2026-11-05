"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Redo2, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { PREVISIT_EQUIPMENT, createMark, equipmentById } from "../lib/previsit-photos";
import PrevisitEquipmentLibrary from "./previsit-equipment-library";

export default function PrevisitPhotoEditor({
  imageSrc,
  initialMarks = [],
  caption = "",
  comment = "",
  onSave,
  onClose,
  busy = false,
}) {
  const stageRef = useRef(null);
  const [marks, setMarks] = useState(initialMarks);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [pendingPoint, setPendingPoint] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [text, setText] = useState({ caption, comment });
  const drag = useRef(null);

  const selected = useMemo(() => marks.find(item => item.id === selectedId) || null, [marks, selectedId]);

  useEffect(() => {
    setMarks(initialMarks);
    setText({ caption, comment });
  }, [imageSrc]);

  function commit(next) {
    setPast(current => [...current.slice(-19), marks]);
    setFuture([]);
    setMarks(next);
  }

  function undo() {
    setPast(current => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setFuture(next => [marks, ...next]);
      setMarks(previous);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setFuture(current => {
      if (!current.length) return current;
      const [next, ...rest] = current;
      setPast(pastMarks => [...pastMarks, marks]);
      setMarks(next);
      return rest;
    });
  }

  function pointFromEvent(event) {
    const rect = stageRef.current.getBoundingClientRect();
    const source = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: Math.min(1, Math.max(0, (source.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (source.clientY - rect.top) / rect.height)),
    };
  }

  function onStagePointerDown(event) {
    if (event.target !== stageRef.current && event.target.tagName !== "IMG") return;
    const point = pointFromEvent(event);
    setSelectedId("");
    setPendingPoint(point);
    setLibraryOpen(true);
  }

  function pickEquipment(type) {
    if (selected && !pendingPoint) {
      commit(marks.map(item => item.id === selected.id ? { ...item, equipmentType: type } : item));
    } else {
      const point = pendingPoint || { x: 0.5, y: 0.5 };
      const mark = createMark(type, point.x, point.y);
      commit([...marks, mark]);
      setSelectedId(mark.id);
    }
    setPendingPoint(null);
    setLibraryOpen(false);
  }

  function startDrag(event, mark, mode) {
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(mark.id);
    drag.current = { id: mark.id, mode, start: pointFromEvent(event), mark };
  }

  useEffect(() => {
    function move(event) {
      if (!drag.current) return;
      event.preventDefault();
      const point = pointFromEvent(event);
      const { id, mode, start, mark } = drag.current;
      setMarks(current => current.map(item => {
        if (item.id !== id) return item;
        if (mode === "move") {
          return { ...item, x: Math.min(1, Math.max(0, mark.x + (point.x - start.x))), y: Math.min(1, Math.max(0, mark.y + (point.y - start.y))) };
        }
        if (mode === "scale") {
          const from = Math.hypot(start.x - mark.x, start.y - mark.y);
          const to = Math.hypot(point.x - mark.x, point.y - mark.y);
          return { ...item, scale: Math.min(0.8, Math.max(0.06, mark.scale * (to / (from || 0.05)))) };
        }
        if (mode === "rotate") {
          const angle = (Math.atan2(point.y - mark.y, point.x - mark.x) * 180) / Math.PI;
          return { ...item, rotation: (angle + 90 + 360) % 360 };
        }
        return item;
      }));
    }
    function stop() {
      if (!drag.current) return;
      const snapshot = drag.current.mark;
      drag.current = null;
      setMarks(current => {
        setPast(pastMarks => [...pastMarks.slice(-19), current.map(item => item.id === snapshot.id ? snapshot : item)]);
        setFuture([]);
        return current;
      });
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  return (
    <div className="previsit-editor-backdrop">
      <div className="previsit-editor" role="dialog" aria-modal="true" aria-label="Annoter la photo">
        <header>
          <button type="button" onClick={onClose}><X size={18} />Fermer</button>
          <div className="previsit-editor-tools">
            <button type="button" disabled={!past.length} onClick={undo}><Undo2 size={18} />Annuler</button>
            <button type="button" disabled={!future.length} onClick={redo}><Redo2 size={18} />Rétablir</button>
            <button type="button" disabled={!selected} onClick={() => setLibraryOpen(true)}>Remplacer</button>
            <button type="button" disabled={!selected} onClick={() => { commit(marks.filter(item => item.id !== selectedId)); setSelectedId(""); }}><Trash2 size={18} />Supprimer</button>
          </div>
          <button type="button" className="primary" disabled={busy} onClick={() => onSave({ marks, caption: text.caption, comment: text.comment })}>
            <Check size={18} />Enregistrer
          </button>
        </header>
        <div className="previsit-editor-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
          <img src={imageSrc} alt="" draggable={false} />
          {marks.map(mark => {
            const item = equipmentById(mark.equipmentType);
            if (!item) return null;
            return (
              <div
                key={mark.id}
                className={`previsit-mark${selectedId === mark.id ? " is-selected" : ""}`}
                style={{
                  left: `${mark.x * 100}%`,
                  top: `${mark.y * 100}%`,
                  width: `${mark.scale * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${mark.rotation}deg)`,
                }}
                onPointerDown={event => startDrag(event, mark, "move")}
              >
                <img src={item.src} alt={item.label} draggable={false} />
                {selectedId === mark.id && (
                  <>
                    <button type="button" className="previsit-handle scale" onPointerDown={event => startDrag(event, mark, "scale")} aria-label="Taille" />
                    <button type="button" className="previsit-handle rotate" onPointerDown={event => startDrag(event, mark, "rotate")} aria-label="Rotation">
                      <RotateCcw size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <footer>
          <label>Légende<input value={text.caption} onChange={event => setText(current => ({ ...current, caption: event.target.value }))} placeholder="Unité extérieure façade sud" /></label>
          <label>Commentaire<input value={text.comment} onChange={event => setText(current => ({ ...current, comment: event.target.value }))} placeholder="Passage de liaisons à prévoir" /></label>
        </footer>
        <p className="previsit-editor-help">Appuyez sur la photo pour poser un équipement. {PREVISIT_EQUIPMENT.length} illustrations disponibles.</p>
      </div>
      <PrevisitEquipmentLibrary open={libraryOpen} onPick={pickEquipment} onClose={() => { setLibraryOpen(false); setPendingPoint(null); }} />
    </div>
  );
}
