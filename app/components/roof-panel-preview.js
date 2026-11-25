"use client";

import { useRef } from "react";
import { Home } from "lucide-react";
import { emptyPlaneLayout, layoutRoofPanels, studyOrtho } from "../lib/pv-install-study";

export function RoofModules({
  modules,
  editable = false,
  activePlane = 0,
  onModuleDrag,
  onModuleDragEnd,
  onModuleRemove,
}) {
  const drag = useRef(null);

  function startDrag(event, item) {
    if (!editable || item.moduleIndex == null || !onModuleDrag) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const photo = event.currentTarget.closest(".roof-photo");
    const rect = photo?.getBoundingClientRect();
    if (!rect?.width) return;
    drag.current = {
      planeIndex: item.planeIndex,
      moduleIndex: item.moduleIndex,
      moved: false,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
    };
  }

  function moveDrag(event) {
    if (!drag.current || !onModuleDrag) return;
    const { planeIndex, moduleIndex, x, y, width, height } = drag.current;
    const dx = ((event.clientX - x) / width) * 100;
    const dy = ((event.clientY - y) / height) * 100;
    if (Math.abs(dx) + Math.abs(dy) > 0.15) drag.current.moved = true;
    onModuleDrag(planeIndex, moduleIndex, { dx, dy });
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
  }

  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    onModuleDragEnd?.();
  }

  return modules.map(item => <i
    key={item.id}
    className={`roof-module${item.source === "google" ? " is-google" : ""}${item.source === "placed" ? " is-placed" : ""}${editable ? " is-editable" : ""}${item.planeIndex === activePlane ? " is-active-plane" : ""}`}
    onPointerDown={event => startDrag(event, item)}
    onPointerMove={moveDrag}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    onDoubleClick={event => {
      if (!onModuleRemove || item.moduleIndex == null) return;
      event.preventDefault();
      event.stopPropagation();
      onModuleRemove(item.planeIndex, item.moduleIndex);
    }}
    style={{
      left: `${item.x}%`,
      top: `${item.y}%`,
      width: `${item.w}%`,
      height: `${item.h}%`,
      transform: `translate(-50%, -50%) rotate(${item.rotate}deg)`,
    }}
  />);
}

export default function RoofPanelPreview({
  project,
  complete,
  planes,
  variant = "photo",
  editable = false,
  placeMode = false,
  activePlane = 0,
  onPlace,
  onMoveModule,
  onRemoveModule,
}) {
  const startModule = useRef({});
  const ortho = studyOrtho(project, complete);
  const src = variant === "flux"
    ? (complete.fluxPng || ortho?.url || "")
    : (ortho?.url || "");
  const modules = variant === "photo"
    ? layoutRoofPanels({
      project,
      complete,
      planes,
      preferPlaced: placeMode,
    })
    : [];

  function photoPoint(event) {
    const photo = event.currentTarget;
    const rect = photo.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function handlePlace(event) {
    if (!placeMode || !onPlace) return;
    if (event.target.closest(".roof-module")) return;
    const point = photoPoint(event);
    if (!point) return;
    onPlace(activePlane, point);
  }

  function handleDrag(planeIndex, moduleIndex, { dx, dy }) {
    if (!onMoveModule) return;
    const key = `${planeIndex}-${moduleIndex}`;
    if (startModule.current[key] == null) {
      const layout = emptyPlaneLayout(planes[planeIndex]?.layout);
      startModule.current[key] = layout.modules[moduleIndex] || null;
    }
    const origin = startModule.current[key];
    if (!origin) return;
    const next = { x: origin.x + dx, y: origin.y + dy };
    startModule.current[key] = next;
    onMoveModule(planeIndex, moduleIndex, next);
  }

  return <div
    className={`roof-photo${variant === "flux" ? " is-flux" : ""}${editable || placeMode ? " is-edit" : ""}${placeMode ? " is-place" : ""}`}
    onPointerDown={handlePlace}
  >
    {src ? <img src={src} alt={variant === "flux" ? "Carte de flux annuel" : "Toiture"} crossOrigin="anonymous" /> : <div className="roof-fallback"><Home /><span>{placeMode ? "Géolocalisez l’adresse, puis cliquez pour poser les panneaux" : editable ? "Géolocalisez l’adresse pour poser les modules" : "Photo de toiture après géolocalisation"}</span></div>}
    <RoofModules
      modules={modules}
      editable={editable || placeMode}
      activePlane={activePlane}
      onModuleDrag={handleDrag}
      onModuleDragEnd={() => { startModule.current = {}; }}
      onModuleRemove={onRemoveModule}
    />
    {variant === "flux" && complete.fluxPng ? <div className="flux-legend"><span>Faible</span><i /><span>Fort</span></div> : null}
  </div>;
}
