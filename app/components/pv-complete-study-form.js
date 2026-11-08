"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import RecipientConnect from "./recipient-connect";
import DocumentParties, { frozenRecipient } from "./document-parties";
import PvAddressLookup from "./pv-address-lookup";
import RoofPanelPreview from "./roof-panel-preview";
import { googleImageryYear, shouldTrustGoogleRoof } from "../lib/google-solar";
import {
  addPlaneModule,
  alignRoofModules,
  DEFAULT_VIRTUAL_BATTERY,
  emptyCompleteStudy,
  emptyPlaneLayout,
  movePlaneModule,
  normalizeRoofPlane,
  planePowerKwp,
  PV_CONSUMPTION_PROFILES,
  removePlaneModule,
  roofPanelAlignSize,
} from "../lib/pv-install-study";
import { EXISTING_CLIENT_MESSAGE, studySubject } from "../lib/existing-client";
import { authFetch } from "../lib/supabase-rest";
import { useCompany } from "../lib/use-company";

export default function PvCompleteStudyForm({
  project = null,
  initialClient = null,
  clients = [],
  commercials = [],
  canAssignCommercial = false,
  onClose,
  onSave,
  toast,
  embedded = false,
}) {
  const initial = emptyCompleteStudy(project?.completeStudy || {});
  const [geo, setGeo] = useState(project?.lat ? {
    lat: project.lat,
    lon: project.lon,
    city: project.city || "",
    address: project.address || "",
    postcode: project.postcode || "",
    label: project.siteLabel || "",
    yieldValue: project.yieldValue,
    yieldSource: project.yieldSource,
  } : initialClient ? {
    city: initialClient.city || "",
    address: initialClient.address || "",
    postcode: initialClient.postalCode || "",
    label: [initialClient.address, initialClient.postalCode, initialClient.city].filter(Boolean).join(" "),
  } : null);
  const [pickedClient, setPickedClient] = useState(initialClient || null);
  const linkedClient = studySubject(clients, pickedClient?.directoryKind === "prospect" ? pickedClient : { id: pickedClient?.id || project?.clientId, clientId: pickedClient?.id || project?.clientId, prospectId: pickedClient?.prospectId || project?.prospectId, directoryKind: (pickedClient?.directoryKind === "prospect" || (project?.prospectId && !project?.clientId && !pickedClient?.id)) ? "prospect" : "client", name: pickedClient?.name || project?.client });
  const clientReady = Boolean(linkedClient);
  const { company } = useCompany();
  const [planes, setPlanes] = useState(initial.planes);
  const [planeKey, setPlaneKey] = useState(0);
  const [solarLayers, setSolarLayers] = useState(() => (
    initial.fluxPng || initial.rgbPng || initial.google
      ? {
        google: initial.google || null,
        fluxPng: initial.fluxPng || "",
        rgbPng: initial.rgbPng || "",
        googleError: initial.googleError || "",
        suggestedPlanes: initial.planes || [],
      }
      : null
  ));
  const [layersBusy, setLayersBusy] = useState(false);
  const [layersNote, setLayersNote] = useState("");
  const [layoutManual, setLayoutManual] = useState(Boolean(initial.panelLayout?.manual));
  const [activePlane, setActivePlane] = useState(0);
  const [busy, setBusy] = useState(false);

  function patchPlane(index, patch) {
    setPlanes(current => current.map((plane, i) => (
      i === index ? normalizeRoofPlane({ ...plane, ...patch }, i) : plane
    )));
  }

  function patchPlaneLayout(index, layout) {
    setLayoutManual(true);
    patchPlane(index, { layout: emptyPlaneLayout({ ...planes[index]?.layout, ...layout }) });
  }

  function applySuggestedPlanes(suggested, note) {
    if (!Array.isArray(suggested) || !suggested.length) return false;
    setPlanes(suggested.map((plane, index) => normalizeRoofPlane({ ...plane, layout: emptyPlaneLayout() }, index)));
    setLayoutManual(false);
    setPlaneKey(key => key + 1);
    if (note) setLayersNote(note);
    return true;
  }

  async function loadSolarLayers(place) {
    if (!place?.lat || !place?.lon) return;
    setLayersBusy(true);
    setLayersNote("Lecture toiture Google Solar…");
    try {
      const response = await authFetch("/api/pv/install-yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: place.lat, lon: place.lon, layersOnly: true, planes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLayersNote(payload.error || "Toiture Google Solar indisponible");
        return;
      }
      setSolarLayers(payload);
      const year = googleImageryYear(payload.google);
      const trusted = shouldTrustGoogleRoof(payload.google, place);
      if (trusted && applySuggestedPlanes(
        payload.suggestedPlanes,
        payload.fluxPng
          ? "Pans, ombrages et carte de chaleur Google Solar appliqués. Vous pouvez les corriger."
          : "Pans et ombrages Google Solar appliqués. Vous pouvez les corriger."
      )) {
        toast?.("Pans et ombrages Google Solar appliqués");
      } else if (payload.google && !trusted) {
        setLayersNote(year
          ? `Imagerie Google Solar ${year} trop ancienne pour ce site. Photo IGN utilisée. Saisissez les pans de la maison actuelle.`
          : "Imagerie Google Solar trop ancienne pour ce site. Photo IGN utilisée. Saisissez les pans de la maison actuelle.");
      } else if (payload.googleError) {
        setLayersNote(payload.googleError);
      } else {
        setLayersNote("Bâtiment trouvé. Ajustez les pans manuellement.");
      }
    } catch {
      setLayersNote("Toiture Google Solar indisponible pour cette adresse");
    } finally {
      setLayersBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const selectedClient = studySubject(clients, pickedClient?.directoryKind === "prospect" ? pickedClient : { id: data.clientId || pickedClient?.id || project?.clientId, clientId: data.clientId || pickedClient?.id || project?.clientId, prospectId: pickedClient?.prospectId || project?.prospectId, directoryKind: pickedClient?.directoryKind || (project?.prospectId && !project?.clientId ? "prospect" : "client"), name: pickedClient?.name || project?.client || data.client });
    if (!selectedClient) {
      toast?.(EXISTING_CLIENT_MESSAGE);
      return;
    }
    if (!geo?.lat || !geo?.lon) {
      toast?.("Sélectionnez une adresse géolocalisée");
      return;
    }
    setBusy(true);
    let nextPlanes = planes.map((plane, index) => normalizeRoofPlane({
      ...plane,
      panels: data[`panels-${index}`],
      panelPower: data[`panelPower-${index}`],
      compass: data[`compass-${index}`],
      tilt: data[`tilt-${index}`],
      shadePercent: data[`shade-${index}`],
      name: data[`name-${index}`],
    }, index));
    let solar = { orthoUrl: "", solarProvider: "pvgis", googleError: "", planes: nextPlanes };
    try {
      const response = await authFetch("/api/pv/install-yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: geo.lat,
          lon: geo.lon,
          planes: nextPlanes,
          reuseLayers: solarLayers ? {
            google: solarLayers.google || null,
            fluxPng: solarLayers.fluxPng || "",
            rgbPng: solarLayers.rgbPng || "",
          } : {},
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        solar = payload;
        nextPlanes = (payload.planes || []).map((plane, index) => {
          const power = planePowerKwp(plane);
          return normalizeRoofPlane({
            ...nextPlanes[index],
            ...plane,
            monthly: Array.isArray(plane.monthly)
              ? plane.monthly.map(value => Math.round(Number(value || 0) * power))
              : null,
          }, index);
        });
      } else {
        toast?.(payload.error || "Productible PVGIS partiel");
      }
    } catch {
      toast?.("Productible PVGIS indisponible, valeurs locales conservées");
    }
    const panels = nextPlanes.reduce((sum, plane) => sum + Number(plane.panels || 0), 0);
    const panelPower = nextPlanes[0]?.panelPower || 500;
    const powerKwp = nextPlanes.reduce((sum, plane) => sum + planePowerKwp(plane), 0);
    const production = nextPlanes.reduce((sum, plane) => {
      const shade = 1 - Number(plane.shadePercent || 0) / 100;
      if (Array.isArray(plane.monthly)) return sum + Math.round(plane.monthly.reduce((a, b) => a + Number(b || 0), 0) * shade);
      return sum + Math.round(planePowerKwp(plane) * Number(plane.yieldValue || geo.yieldValue || 1100) * shade);
    }, 0);
    onSave?.({
      ...(project || {}),
      id: project?.id || Date.now(),
      studyKind: project?.studyKind || "soft",
      name: data.name,
      client: selectedClient.name || data.client,
      clientId: selectedClient.directoryKind === "prospect" ? "" : selectedClient.id,
      prospectId: selectedClient.directoryKind === "prospect" ? selectedClient.prospectId : (selectedClient.prospectId || project?.prospectId || ""),
      price: Number(data.price || 0),
      annualConsumption: Number(data.annualConsumption || 2300),
      electricityPrice: Number(data.electricityPrice || 0.2001),
      surplusPrice: Number(data.surplusPrice || 0.04),
      batteryCapacity: 0,
      panelPower,
      panels,
      powerKwp,
      estimatedProduction: production,
      yieldValue: nextPlanes[0]?.yieldValue || geo.yieldValue || 1100,
      yieldSource: solar.solarProvider || "pvgis",
      address: geo.address || data.address || "",
      postcode: geo.postcode || "",
      city: geo.city || data.city || "",
      lat: geo.lat,
      lon: geo.lon,
      siteLabel: geo.label || "",
      townHallStatus: project?.townHallStatus || "À préparer",
      gridStatus: project?.gridStatus || "À préparer",
      created: project?.created || new Date().toISOString().slice(0, 10),
      completeStudy: {
        consumptionProfile: data.consumptionProfile,
        virtualBattery: {
          ...DEFAULT_VIRTUAL_BATTERY,
          enabled: data.virtualBattery === "on",
          monthlyPerkWc: Number(data.monthlyPerkWc || DEFAULT_VIRTUAL_BATTERY.monthlyPerkWc),
          transportPerkWh: Number(data.transportPerkWh || DEFAULT_VIRTUAL_BATTERY.transportPerkWh),
          connectionCost: Number(data.connectionCost || DEFAULT_VIRTUAL_BATTERY.connectionCost),
          subscriptionMonth: Number(data.subscriptionMonth || DEFAULT_VIRTUAL_BATTERY.subscriptionMonth),
        },
        planes: nextPlanes,
        panelModel: data.panelModel,
        inverterModel: data.inverterModel,
        solarProvider: solar.solarProvider || "pvgis",
        orthoUrl: solar.orthoUrl || "",
        ortho: solar.ortho || null,
        googleError: solar.googleError || solarLayers?.googleError || "",
        google: solar.google || solarLayers?.google || null,
        fluxPng: solar.fluxPng || solarLayers?.fluxPng || "",
        rgbPng: solar.rgbPng || solarLayers?.rgbPng || "",
        panelLayout: { manual: layoutManual },
      },
    });
    setBusy(false);
  }

  const form = (
      <form className={embedded ? "document-window-sheet" : undefined} onSubmit={submit}>
        <div className="modal-form-body">
          {!embedded && !clientReady && <RecipientConnect clients={clients} allowCreate={false} allowProspect onSelect={item => {
            setPickedClient(item || null);
            if (!item) return;
            setGeo(current => ({
              ...(current || {}),
              city: item.city || current?.city || "",
              address: item.address || current?.address || "",
              postcode: item.postalCode || current?.postcode || "",
              label: [item.address, item.postalCode, item.city].filter(Boolean).join(" ") || current?.label || "",
            }));
          }} />}
          {clientReady && <DocumentParties company={company} clientTitle="Client / destinataire" {...frozenRecipient(linkedClient || pickedClient)} />}
          {project && clientReady && <input type="hidden" name="clientId" value={project.clientId || pickedClient?.id || ""} />}
          {project && clientReady && <input type="hidden" name="client" value={project.client || pickedClient?.name || ""} />}
          {clientReady && <><label>Ville<input name="city" required value={geo?.city || ""} onChange={event => setGeo(current => ({ ...(current || {}), city: event.target.value }))}/></label>
          <PvAddressLookup
            key={pickedClient?.id || project?.id || "complete-address"}
            defaultLabel={geo?.label || [project?.address, project?.postcode, project?.city].filter(Boolean).join(" ")}
            onResolved={place => {
              setGeo(place);
              loadSolarLayers(place);
            }}
          />
          <label>Nom du projet<input name="name" required defaultValue={project?.name || ""} placeholder="Ex. Étude d’installation 9 kWc"/></label>
          <div className="form-row">
            <label>Prix TTC (€)<input name="price" type="number" min="0" step="0.01" required defaultValue={project?.price || 0}/></label>
            <label>Consommation annuelle (kWh)<input name="annualConsumption" type="number" min="1" required defaultValue={project?.annualConsumption || 2300}/></label>
          </div>
          <label>Profil de consommation
            <select name="consumptionProfile" defaultValue={initial.consumptionProfile}>
              {PV_CONSUMPTION_PROFILES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>Prix réseau (€/kWh)<input name="electricityPrice" type="number" min="0" step="0.0001" defaultValue={project?.electricityPrice || 0.2001}/></label>
            <label>Prix surplus (€/kWh)<input name="surplusPrice" type="number" min="0" step="0.0001" defaultValue={project?.surplusPrice || 0.04}/></label>
          </div>
          <label className="dispatch-notify"><input type="checkbox" name="virtualBattery" defaultChecked={initial.virtualBattery.enabled}/>Batterie virtuelle</label>
          <div className="form-row">
            <label>Abo mensuel (€)<input name="subscriptionMonth" type="number" min="0" step="0.01" defaultValue={initial.virtualBattery.subscriptionMonth}/></label>
            <label>€ / kWc / mois<input name="monthlyPerkWc" type="number" min="0" step="0.01" defaultValue={initial.virtualBattery.monthlyPerkWc}/></label>
          </div>
          <div className="form-row">
            <label>Acheminement (€/kWh)<input name="transportPerkWh" type="number" min="0" step="0.0001" defaultValue={initial.virtualBattery.transportPerkWh}/></label>
            <label>Raccordement (€)<input name="connectionCost" type="number" min="0" step="1" defaultValue={initial.virtualBattery.connectionCost}/></label>
          </div>
          {layersNote ? <p className="pv-solar-note">{layersNote}</p> : null}
          {solarLayers?.suggestedPlanes?.length ? <button type="button" className="secondary" onClick={() => applySuggestedPlanes(solarLayers.suggestedPlanes, "Pans Google Solar réappliqués.")}>Réappliquer les pans Google Solar</button> : null}
          {planes.map((plane, index) => <fieldset key={`${planeKey}-${plane.id}-${index}`} className="pv-plane-fields">
            <legend>Pan de toiture {index + 1}</legend>
            <label>Nom<input name={`name-${index}`} defaultValue={plane.name} onChange={event => patchPlane(index, { name: event.target.value })}/></label>
            <div className="form-row">
              <label>Orientation (°)<input name={`compass-${index}`} type="number" min="0" max="360" defaultValue={plane.compass} onChange={event => patchPlane(index, { compass: event.target.value })}/></label>
              <label>Pente (°)<input name={`tilt-${index}`} type="number" min="0" max="60" defaultValue={plane.tilt} onChange={event => patchPlane(index, { tilt: event.target.value })}/></label>
            </div>
            <div className="form-row">
              <label>Panneaux<input name={`panels-${index}`} type="number" min="0" value={plane.layout?.modules?.length || plane.panels || 0} onChange={event => {
                if (plane.layout?.modules?.length) return;
                patchPlane(index, { panels: event.target.value });
              }}/></label>
              <label>Wc / module<input name={`panelPower-${index}`} type="number" min="100" defaultValue={plane.panelPower || 500} onChange={event => patchPlane(index, { panelPower: event.target.value })}/></label>
            </div>
            <label>Ombrage (%)<input name={`shade-${index}`} type="number" min="0" max="40" defaultValue={plane.shadePercent || 0} onChange={event => patchPlane(index, { shadePercent: event.target.value })}/></label>
            <label>Rotation pose (°)<input type="number" step="1" value={plane.layout?.rotate || 0} onChange={event => patchPlaneLayout(index, { rotate: event.target.value })}/></label>
          </fieldset>)}
          {planes.length < 4 && <button type="button" className="secondary" onClick={() => {
            setPlanes(current => [...current, normalizeRoofPlane({ name: "Nord", compass: 0, tilt: 30, panels: 0, panelPower: current[0]?.panelPower || 500, layout: emptyPlaneLayout() }, current.length)]);
            setActivePlane(planes.length);
          }}>Ajouter un pan</button>}
          <div className="pv-roof-editor">
            <p>Sélectionnez un pan, puis cliquez sur la toiture : chaque clic pose un petit rectangle noir. Alignez les panneaux, pas les pans : seuls les modules voisins du versant choisi se calent. Double-clic sur un module pour le retirer.</p>
            <div className="pv-roof-planes">
              {planes.map((plane, index) => <button
                key={`${plane.id}-${index}`}
                type="button"
                className={activePlane === index ? "primary" : "secondary"}
                onClick={() => setActivePlane(index)}
              >
                {plane.name || `Pan ${index + 1}`} · {plane.layout?.modules?.length || 0}
              </button>)}
            </div>
            <RoofPanelPreview
              project={{ lat: geo?.lat, lon: geo?.lon }}
              complete={{
                ortho: solarLayers?.ortho || initial.ortho || null,
                google: solarLayers?.google || initial.google || null,
                panelLayout: { manual: true },
                planes,
              }}
              planes={planes}
              placeMode
              activePlane={activePlane}
              onPlace={(index, point) => {
                setLayoutManual(true);
                setPlanes(current => current.map((plane, i) => (
                  i === index
                    ? normalizeRoofPlane({ ...plane, layout: addPlaneModule(plane.layout, point, i) }, i)
                    : plane
                )));
              }}
              onMoveModule={(index, moduleIndex, point) => {
                setLayoutManual(true);
                setPlanes(current => current.map((plane, i) => (
                  i === index
                    ? normalizeRoofPlane({ ...plane, layout: movePlaneModule(plane.layout, moduleIndex, point) }, i)
                    : plane
                )));
              }}
              onRemoveModule={(index, moduleIndex) => {
                setPlanes(current => current.map((plane, i) => (
                  i === index
                    ? normalizeRoofPlane({ ...plane, layout: removePlaneModule(plane.layout, moduleIndex) }, i)
                    : plane
                )));
              }}
            />
            <div className="pv-roof-editor-actions">
              <button type="button" className="primary" onClick={() => {
                const size = roofPanelAlignSize(
                  { lat: geo?.lat, lon: geo?.lon },
                  { ortho: solarLayers?.ortho || initial.ortho || null, google: solarLayers?.google || initial.google || null },
                );
                setPlanes(current => current.map((plane, index) => {
                  if (index !== activePlane) return plane;
                  const layout = emptyPlaneLayout(plane.layout);
                  return normalizeRoofPlane({
                    ...plane,
                    layout: emptyPlaneLayout({ ...layout, modules: alignRoofModules(layout.modules, size) }),
                  }, index);
                }));
                setLayoutManual(true);
                toast?.("Modules voisins alignés sur ce pan");
              }}>Aligner les panneaux</button>
              <button type="button" className="secondary" onClick={() => {
                const layout = emptyPlaneLayout(planes[activePlane]?.layout);
                if (!layout.modules.length) return;
                setPlanes(current => current.map((plane, index) => (
                  index === activePlane
                    ? normalizeRoofPlane({ ...plane, layout: removePlaneModule(layout, layout.modules.length - 1) }, index)
                    : plane
                )));
              }}>Annuler le dernier</button>
              {layoutManual ? <button type="button" className="secondary" onClick={() => {
                setLayoutManual(false);
                setPlanes(current => current.map((plane, index) => normalizeRoofPlane({ ...plane, panels: 0, layout: emptyPlaneLayout() }, index)));
              }}>Réinitialiser la pose</button> : null}
            </div>
          </div>
          <label>Module<input name="panelModel" defaultValue={initial.panelModel}/></label>
          <label>Onduleur<input name="inverterModel" defaultValue={initial.inverterModel}/></label>
          </>}
        </div>
        <div className="modal-form-actions">
          <button className="primary submit" type="submit" disabled={!clientReady || busy || layersBusy}>{busy ? "Calcul PVGIS horaire…" : layersBusy ? "Lecture toiture Google Solar…" : "Enregistrer l’étude d’installation"}</button>
        </div>
      </form>
  );
  if (embedded) return form;
  return <div className="backdrop">
    <div className="modal pv-modal">
      <button type="button" className="modal-close" onClick={onClose}><X size={18}/></button>
      <div className="modal-icon"><CheckCircle2 /></div>
      <h2>Étude d’installation photovoltaïque</h2>
      <p>Étude complète pour le responsable technique. L’adresse lit les pans, l’ombrage et la carte de chaleur Google Solar. Le productible horaire reste PVGIS. L’étude soft du commercial n’est pas écrasée.</p>
      {form}
    </div>
  </div>;
}
