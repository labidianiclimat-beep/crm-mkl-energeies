"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,CheckCircle2,Download,Eraser,Printer,Save,Signature,Wrench} from "lucide-react";
import DocumentClosing from "../components/document-closing";
import DocumentParties, { frozenRecipient } from "../components/document-parties";
import { companyDisplayName } from "../lib/company";
import { openCurrentFormPreview } from "../lib/document-preview";
import { installationIdentityFromReports, modelsForMaintenanceBrand } from "../lib/maintenance-catalog";
import { prepareMaintenancePrint, restoreMaintenancePrint } from "../lib/maintenance-pdf";
import { authFetch } from "../lib/supabase-rest";
import { collectDeletedIds } from "../lib/org-state";
import { loadSharedRecords, saveSharedRecords } from "../lib/use-record-table";
import { useCompany } from "../lib/use-company";
import "../previsite/previsite.css";
import "./maintenance.css";

function applyReportToForm(data){
  for(const [name,value] of Object.entries(data||{})){
    document.querySelectorAll(`[name="${name}"]`).forEach(field=>{
      if(field.type==="radio"||field.type==="checkbox") field.checked=field.value===value||value==="on";
      else field.value=value??"";
    });
  }
}

const controls={
  "Sécurité et état général":["Absence de bruit ou vibration anormale","Fixations et supports en bon état","Capotages et protections présents","Dégagement autour des unités suffisant","Absence de corrosion importante","Étiquettes et références lisibles","État des liaisons et isolants","Absence de fuite d’eau visible"],
  "Contrôles électriques":["Serrage des connexions électriques","État des câbles et borniers","Protection différentielle contrôlée","Disjoncteur adapté à l’installation","Mise à la terre vérifiée","Intensité absorbée conforme","Tension d’alimentation conforme","Absence de traces d’échauffement"],
  "Unité extérieure":["Nettoyage de l’échangeur extérieur","État des ailettes","Ventilateur et hélice contrôlés","Évacuation des condensats contrôlée","Supports antivibratiles contrôlés","Bac à condensats propre","État du compresseur","Fonctionnement du dégivrage"],
  "Unité intérieure / climatisation":["Nettoyage et désinfection des filtres","Nettoyage de l’échangeur intérieur","Nettoyage de la turbine","Nettoyage du bac à condensats","Débouchage de l’évacuation","Contrôle de la pompe de relevage","Contrôle des volets et moteurs","Contrôle du débit d’air","Télécommande et affichage testés","Désinfection de l’unité intérieure"],
  "Circuit frigorifique":["Recherche visuelle de fuite","Contrôle des raccords flare","Contrôle des traces d’huile","État de l’isolation frigorifique","Pressions de fonctionnement relevées","Températures aspiration/refoulement relevées","Surchauffe contrôlée","Sous-refroidissement contrôlé","Charge de fluide cohérente","Détecteur de fuite utilisé si nécessaire"],
  "Hydraulique pompe à chaleur":["Pression du circuit chauffage","Purge de l’installation","Vase d’expansion contrôlé","Filtre ou pot à boue nettoyé","Circulateur contrôlé","Soupape de sécurité contrôlée","Débit d’eau vérifié","Températures départ/retour relevées","Absence de fuite hydraulique","Qualité de l’eau contrôlée","Appoint d’eau effectué si nécessaire"],
  "Régulation et essais":["Thermostat et consignes contrôlés","Programmation horaire vérifiée","Sondes de température contrôlées","Mode chauffage testé","Mode climatisation testé","Production ECS testée","Basculement appoint électrique testé","Communication Wi-Fi testée","Codes défauts consultés","Historique des défauts relevé","Essai complet après entretien"],
  "Obligations et environnement":["État d’étanchéité évalué","Quantité et type de fluide identifiés","Registre équipement renseigné si applicable","Déchets et consommables récupérés","Zone de travail nettoyée","Client informé des anomalies","Conseils d’utilisation donnés au client"]
};

function partyFromPreset(preset){
  return frozenRecipient(preset?.clientId ? { id: preset.clientId, address: preset.street || "", postalCode: preset.postalCode || "", city: preset.city || "", phone: preset.phone || "", email: preset.email || "", name: preset.client || "" } : null, {
    clientName: preset?.client || "",
    clientAddress: preset?.address || "",
    address: preset?.street || preset?.address || "",
    postalCode: preset?.postalCode || "",
    city: preset?.city || "",
    clientId: preset?.clientId || "",
    clientPhone: preset?.phone || "",
    clientEmail: preset?.email || "",
    addressChecked: Boolean(preset?.addressChecked),
  });
}
function Field({label,name,type="text",wide=false,children}){return <label className={wide?"wide":""}><span>{label}</span>{children||<input name={name} type={type}/>}</label>;}
function BrandModelFields({ catalog, brand, model, manual, onBrand, onModel, onManual }) {
  const models = modelsForMaintenanceBrand(catalog, brand);
  const brandNames = catalog.map(item => item.name);
  const brandOptions = brand && !brandNames.some(name => name.toLocaleLowerCase("fr-FR") === brand.toLocaleLowerCase("fr-FR"))
    ? [brand, ...brandNames]
    : brandNames;
  const typed = Boolean(manual || (model && models.length && !models.includes(model)));
  return <>
    <Field label="Marque">
      <select name="brand" value={brand} onChange={event => onBrand(event.target.value)}>
        <option value="">Choisir une marque</option>
        {brandOptions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </Field>
    <Field label="Modèle">
      <select value={typed ? "__manual__" : model} disabled={!brand} onChange={event => {
        if (event.target.value === "__manual__") {
          onManual(true);
          onModel("");
          return;
        }
        onManual(false);
        onModel(event.target.value);
      }}>
        <option value="">{brand ? (models.length ? "Choisir un modèle" : "Aucun modèle pour cette marque") : "Choisissez d’abord une marque"}</option>
        {brand ? models.map(name => <option key={name} value={name}>{name}</option>) : null}
        {brand ? <option value="__manual__">Saisir un autre modèle</option> : null}
      </select>
      {typed
        ? <input name="model" value={model} onChange={event => onModel(event.target.value)} placeholder="Modèle installé" />
        : <input type="hidden" name="model" value={model} />}
    </Field>
  </>;
}
function CheckRow({section,index,label}){return <div className="control-row"><span>{label}</span><label><input type="radio" name={`control_${section}_${index}`} value="Conforme"/>Conforme</label><label><input type="radio" name={`control_${section}_${index}`} value="À corriger"/>À corriger</label><label><input type="radio" name={`control_${section}_${index}`} value="Non applicable"/>N/A</label><input name={`note_${section}_${index}`} placeholder="Observation"/></div>;}
function SignaturePad({storageKey,title}) {
  const canvas=useRef(null),drawing=useRef(false);
  useEffect(()=>{const el=canvas.current,ratio=devicePixelRatio||1,rect=el.getBoundingClientRect();el.width=rect.width*ratio;el.height=rect.height*ratio;const ctx=el.getContext("2d");ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap="round";ctx.strokeStyle="#27427f";const saved=localStorage.getItem(storageKey);if(saved){const image=new Image();image.onload=()=>ctx.drawImage(image,0,0,rect.width,rect.height);image.src=saved;}},[storageKey]);
  const point=e=>{const r=canvas.current.getBoundingClientRect(),s=e.touches?.[0]||e;return{x:s.clientX-r.left,y:s.clientY-r.top};};
  const start=e=>{e.preventDefault();drawing.current=true;const p=point(e),ctx=canvas.current.getContext("2d");ctx.beginPath();ctx.moveTo(p.x,p.y);};
  const move=e=>{if(!drawing.current)return;e.preventDefault();const p=point(e),ctx=canvas.current.getContext("2d");ctx.lineTo(p.x,p.y);ctx.stroke();};
  const stop=()=>{if(drawing.current)localStorage.setItem(storageKey,canvas.current.toDataURL());drawing.current=false;};
  const clear=()=>{canvas.current.getContext("2d").clearRect(0,0,canvas.current.width,canvas.current.height);localStorage.removeItem(storageKey);};
  return <div className="signature-pad"><div><Signature size={17}/><b>{title}</b><button type="button" onClick={clear}><Eraser size={14}/>Effacer</button></div><canvas ref={canvas} onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={move} onTouchEnd={stop}/><small>Signer avec le doigt ou le stylet</small></div>;
}

export default function MaintenanceForm({ embedded = false, onClose, preset = null } = {}){
  const [saved,setSaved]=useState(false);
  const [saveError,setSaveError]=useState("");
  const [recordKey,setRecordKey]=useState("new");
  const [party,setParty]=useState(()=>partyFromPreset(preset));
  const [catalog,setCatalog]=useState([]);
  const [brand,setBrand]=useState(preset?.brand||"");
  const [model,setModel]=useState(preset?.model||"");
  const [modelManual,setModelManual]=useState(false);
  const [refrigerant,setRefrigerant]=useState(preset?.refrigerant||"");
  const {company}=useCompany();
  function chooseBrand(next){
    setBrand(next);
    const known = modelsForMaintenanceBrand(catalog, next);
    setModel(current => {
      if (known.includes(current)) {
        setModelManual(false);
        return current;
      }
      if (modelManual && current) return current;
      setModelManual(false);
      return "";
    });
  }
  function rememberInstallation(base, key){
    return loadSharedRecords("mkl-maintenance-reports").then(reports => {
      const current = (reports || []).find(item => String(item?.id) === String(key));
      const prior = installationIdentityFromReports(reports, {
        clientId: base.clientId || current?.clientId || "",
        client: base.client || current?.client || "",
        exceptId: key,
      });
      return {
        ...(current || {}),
        ...base,
        brand: base.brand || current?.brand || prior.brand || "",
        model: base.model || current?.model || prior.model || "",
        refrigerant: base.refrigerant || current?.refrigerant || prior.refrigerant || "",
      };
    }).catch(() => base);
  }
  useEffect(()=>{
    let cancelled=false;
    authFetch("/api/maintenance/catalog")
      .then(response=>response.json().catch(()=>({})))
      .then(data=>{ if(!cancelled && Array.isArray(data.brands)) setCatalog(data.brands); })
      .catch(()=>{});
    return ()=>{ cancelled=true; };
  },[]);
  useEffect(()=>{
    const root=()=>document.querySelector(".maintenance-app");
    const hide=()=>prepareMaintenancePrint(root());
    const show=()=>restoreMaintenancePrint(root());
    window.addEventListener("beforeprint", hide);
    window.addEventListener("afterprint", show);
    return ()=>{
      window.removeEventListener("beforeprint", hide);
      window.removeEventListener("afterprint", show);
      show();
    };
  },[]);
  useEffect(()=>{
    const known=modelsForMaintenanceBrand(catalog, brand);
    if(model && known.length && !known.includes(model)) setModelManual(true);
  },[catalog, brand, model]);
  useEffect(()=>{
    let cancelled=false;
    if(embedded){
      const key=preset?.contract||preset?.id||"new";
      setRecordKey(key);
      setParty(partyFromPreset(preset));
      rememberInstallation(preset||{}, key).then(data => {
        if(cancelled) return;
        setBrand(data.brand||"");
        setModel(data.model||"");
        setRefrigerant(data.refrigerant||"");
        applyReportToForm(data);
      });
      return ()=>{ cancelled=true; };
    }
    const query=new URLSearchParams(location.search);
    const key=query.get("contract")||query.get("id")||"new";
    setRecordKey(key);
    (async()=>{
      let data={};
      try { data=JSON.parse(localStorage.getItem(`mkl-maintenance-report-${key}`)||"{}"); } catch {}
      try {
        const reports=await loadSharedRecords("mkl-maintenance-reports");
        const remote=reports.find(item=>String(item.id)===String(key));
        if(remote) data={...data,...remote};
      } catch {}
      if(cancelled) return;
      setParty(partyFromPreset({
        client:data.client||"",
        address:data.address||"",
        street:data.street||"",
        postalCode:data.postalCode||"",
        city:data.city||"",
        clientId:data.clientId||"",
        phone:data.phone||"",
        email:data.email||"",
        addressChecked:Boolean(data.clientId||data.street||data.postalCode||data.city),
      }));
      const filled=await rememberInstallation({ ...data, clientId: data.clientId||query.get("clientId")||"", client: data.client||query.get("client")||"" }, key);
      applyReportToForm(filled);
      setBrand(filled.brand||query.get("brand")||"");
      setModel(filled.model||query.get("model")||"");
      setRefrigerant(filled.refrigerant||query.get("refrigerant")||"");
      for(const [name,value] of query){
        const field=document.querySelector(`[name="${name}"]`);
        if(field) field.value=value;
      }
    })();
    return ()=>{ cancelled=true; };
  },[]);
  async function save(event){
    const form=event.currentTarget.closest(".maintenance-app").querySelector("form");
    const data=Object.fromEntries(new FormData(form));
    const id=recordKey==="new"?Date.now():recordKey;
    const record={
      ...data,
      id,
      technicianSignature:localStorage.getItem(`mkl-maintenance-${recordKey}-technician`)||"",
      clientSignature:localStorage.getItem(`mkl-maintenance-${recordKey}-client`)||"",
      updatedAt:new Date().toISOString(),
    };
    try { localStorage.setItem(`mkl-maintenance-report-${recordKey}`,JSON.stringify(record)); } catch {}
    try {
      const reports=await loadSharedRecords("mkl-maintenance-reports");
      const next=[record,...reports.filter(item=>String(item.id)!==String(id))];
      await saveSharedRecords("mkl-maintenance-reports", next, { deletedIds: collectDeletedIds(reports, next) });
      window.dispatchEvent(new Event("mkl-maintenance-report-saved"));
      setSaveError("");
      setSaved(true);
    } catch (error) {
      setSaveError(String(error?.message||"Enregistrement partagé impossible — conservé sur cet appareil"));
      setSaved(true);
    }
    setTimeout(()=>{ setSaved(false); setSaveError(""); }, 2800);
  }
  return <main className={`previsit-app maintenance-app${embedded?" is-embedded":""}`}><header className="form-toolbar"><button type="button" onClick={()=>{ if(embedded) onClose?.(); else location.href="/"; }}><ArrowLeft/>{embedded?"Fermer":"Retour CRM"}</button><div><Wrench size={18}/><span><b>Rapport de maintenance</b><small>Climatisation & pompe à chaleur</small></span></div><div><button className="is-save" onClick={save}><Save/>Enregistrer</button><button type="button" onClick={()=>openCurrentFormPreview({title:"Rapport de maintenance",rootSelector:".maintenance-app"}).catch(error=>window.alert(String(error?.message||"Téléchargement PDF impossible")))}><Download/>Télécharger</button><button type="button" className="print" onClick={()=>{ if(embedded){ openCurrentFormPreview({title:"Rapport de maintenance",rootSelector:".maintenance-app"}).catch(error=>setSaveError(String(error?.message||"Impression impossible"))); return; } window.print(); }}><Printer/>Imprimer</button></div></header>{saved&&<div className="save-toast"><CheckCircle2/>{saveError||"Rapport enregistré pour toute l’équipe"}</div>}
    <nav className="maintenance-steps" aria-label="Étapes du rapport">
      <a href="#intervention">1 · Intervention</a>
      <a href="#controles">2 · Contrôles</a>
      <a href="#compte-rendu">3 · Compte rendu</a>
    </nav>
    <form>
      <section className="paper" id="intervention">
        <div className="document-head"><img src="/mkl-energies.png" alt={companyDisplayName(company)}/><div><span>CONTRAT D’ENTRETIEN</span><h1>Rapport de maintenance</h1><p>Climatisation • Pompe à chaleur • Eau chaude sanitaire</p></div></div>
        <input type="hidden" name="client" value={party.clientName} />
        <input type="hidden" name="clientId" value={party.clientId||""} />
        <input type="hidden" name="address" value={party.clientAddress} />
        <input type="hidden" name="phone" value={party.clientPhone} />
        <input type="hidden" name="email" value={party.clientEmail} />
        <DocumentParties company={company} clientTitle="Client / destinataire" {...party} />
        <h2>Identification de l’installation</h2>
        <div className="field-grid"><Field label="N° de contrat" name="contract"/><Field label="Date d’intervention" name="date" type="date"/><Field label="Heure d’arrivée" name="startTime" type="time"/><Field label="Heure de départ" name="endTime" type="time"/><Field label="Technicien" name="technician"/><Field label="Type d’équipement" name="equipmentType"><select name="equipmentType"><option>Pompe à chaleur air/eau</option><option>Climatisation monosplit</option><option>Climatisation multisplit</option><option>Pompe à chaleur air/air</option><option>Ballon thermodynamique</option><option>Système hybride</option><option>Autre</option></select></Field><BrandModelFields catalog={catalog} brand={brand} model={model} manual={modelManual} onBrand={chooseBrand} onModel={setModel} onManual={setModelManual}/><Field label="N° de série" name="serial"/><Field label="Date de mise en service" name="commissioningDate" type="date"/><Field label="Fluide frigorigène"><select name="refrigerant" value={refrigerant} onChange={event=>setRefrigerant(event.target.value)}><option value="">Choisir un fluide</option><option>R410A</option><option>R32</option><option>R290</option>{refrigerant&&!["","R410A","R32","R290"].includes(refrigerant)&&<option value={refrigerant}>{refrigerant}</option>}</select></Field><Field label="Charge indiquée (kg)" name="refrigerantCharge" type="number"/></div>
        <h2>État à l’arrivée</h2>
        <div className="field-grid"><Field label="Demande ou plainte du client" name="customerRequest" wide><textarea name="customerRequest" rows="4"/></Field><Field label="Code défaut affiché" name="faultCode"/><Field label="État de fonctionnement" name="initialState"><select name="initialState"><option>Fonctionnement normal</option><option>Fonctionnement dégradé</option><option>À l’arrêt</option><option>Panne intermittente</option></select></Field></div>
        <h2>Mesures de fonctionnement</h2>
        <div className="measure-grid"><Field label="Température extérieure (°C)" name="outsideTemp" type="number"/><Field label="Température intérieure (°C)" name="insideTemp" type="number"/><Field label="Soufflage (°C)" name="supplyAirTemp" type="number"/><Field label="Reprise (°C)" name="returnAirTemp" type="number"/><Field label="Départ chauffage (°C)" name="flowTemp" type="number"/><Field label="Retour chauffage (°C)" name="returnWaterTemp" type="number"/><Field label="Pression eau (bar)" name="waterPressure" type="number"/><Field label="Basse pression (bar)" name="lowPressure" type="number"/><Field label="Haute pression (bar)" name="highPressure" type="number"/><Field label="Intensité compresseur (A)" name="compressorCurrent" type="number"/><Field label="Tension (V)" name="voltage" type="number"/><Field label="Débit / delta T" name="flowDelta"/></div>
      </section>
      <section className="paper maintenance-controls" id="controles"><div className="document-head compact"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>POINTS DE CONTRÔLE</span><h1>Maintenance préventive</h1><p>Cocher chaque point et préciser toute anomalie.</p></div></div>{Object.entries(controls).map(([section,items])=><section className="control-section" key={section}><h2>{section}</h2><div className="control-head"><span>Point contrôlé</span><span>Conforme</span><span>À corriger</span><span>N/A</span><span>Observation</span></div>{items.map((item,index)=><CheckRow section={section} index={index} label={item} key={item}/>)}</section>)}</section>
      <section className="paper" id="compte-rendu"><div className="document-head compact"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>CONCLUSION</span><h1>Compte rendu d’intervention</h1><p>Résultat, recommandations et validation du client.</p></div></div>
        <h2>Travaux réalisés et consommables</h2><div className="field-grid"><Field label="Opérations effectuées" name="workDone" wide><textarea name="workDone" rows="6"/></Field><Field label="Pièces / consommables utilisés" name="partsUsed" wide><textarea name="partsUsed" rows="6"/></Field></div>
        <h2>Anomalies et recommandations</h2><div className="field-grid"><Field label="Anomalies constatées" name="anomalies" wide><textarea name="anomalies" rows="5"/></Field><Field label="Travaux ou devis recommandés" name="recommendations" wide><textarea name="recommendations" rows="5"/></Field></div>
        <div className="field-grid"><Field label="État final de l’installation" name="finalState"><select name="finalState"><option>Fonctionnelle et conforme</option><option>Fonctionnelle avec réserves</option><option>Arrêt conseillé</option><option>Mise hors service</option><option>Devis complémentaire nécessaire</option></select></Field><Field label="Prochaine maintenance conseillée" name="nextMaintenance" type="date"/><Field label="Temps passé (heures)" name="duration" type="number"/><Field label="Intervention facturable" name="billable"><select name="billable"><option>Incluse au contrat</option><option>Facturable</option><option>Sous garantie</option></select></Field></div>
        <label className="consent"><input type="checkbox" name="customerValidation" required/>Le client reconnaît que l’intervention a été réalisée, que les constats lui ont été présentés et qu’une copie du rapport peut lui être remise.</label>
        <DocumentClosing>
          <SignaturePad storageKey={`mkl-maintenance-${recordKey}-technician`} title="Signature du technicien"/>
          <SignaturePad storageKey={`mkl-maintenance-${recordKey}-client`} title="Signature du client"/>
        </DocumentClosing>
        <p className="legal">Rapport électronique {companyDisplayName(company)}. Les mesures sont relevées dans les conditions présentes le jour de l’intervention. Toute manipulation de fluide frigorigène doit être réalisée par un opérateur habilité conformément à la réglementation applicable.</p>
      </section>
    </form>
  </main>;
}
