"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,CheckCircle2,Download,Eraser,Printer,Save,Signature} from "lucide-react";
import DocumentClosing from "../components/document-closing";
import { ExistingClientGate } from "../components/recipient-connect";
import DocumentParties, { frozenRecipient } from "../components/document-parties";
import PrevisitPhotosPanel from "../components/previsit-photos-panel";
import { companyDisplayName } from "../lib/company";
import { EXISTING_CLIENT_MESSAGE, findExistingClient, recipientLink } from "../lib/existing-client";
import { personSearchFields } from "../lib/directory-search";
import { openCurrentFormPreview } from "../lib/document-preview";
import { omitEmptyPrevisitFields } from "../lib/previsit-report-fields";
import { authFetch } from "../lib/supabase-rest";
import { useCompany } from "../lib/use-company";
import {loadSharedRecords,saveSharedRecords} from "../lib/use-record-table";
import "./previsite.css";

const materialSections={
  "Packs":["Pack PAC Yack tri","Pack PAC Yack mono","Pack PAC Zubadan tri","Pack PAC Zubadan mono","Pack PAC Panasonic tri","Pack PAC Panasonic mono","Pack PAC Zubadan tri 23 kW","Pack ballon ECS","PAC duo","Option 2 circuits"],
  "Hydraulique ECS":["Vase d’expansion sanitaire","Kit Vexbal","Vanne 1/2 M-F","Vanne 1/2 M-F","T 1/2 F","Coude 1/2 M-F","GCU 22-3/4 M","GCU 18-3/4 M","GCU 16-3/4 M","GCU 14-3/4 M","Mamelon 3/4","Flexible 1 M","Flexible 0,7 M","Flexible 0,5 M","Multicouche 26","Multicouche 16","Kit triphasé chauffe-eau","Contacteur H/C H/P","Horloge","Disjoncteur 2 A","Grille 200×200","Grille 250×250","Gaines 160","Tube PVC 32","Tube nature","T en Y PVC 32","Scelle 110","Scelle 100","Siphon PVC","Joint métalloplastique 32"],
  "Liaison frigorifique":["Cuivre 1/4–3/8","Cuivre 1/4–1/2","Cuivre 3/8–5/8","1/4–1/2 avec isolation"],
  "Groupe extérieur":["Rubber foot 600","Rubber foot 400","Dalles 40×40","Châssis 240 kg","Châssis 140 kg","Bac à condensats","Cordon chauffant","Silent bloc","Rubberfoot 1000","Console groupe silence"],
  "Hydraulique PAC":["Ballon tampon","Accessoire ballon tampon","Pompe de circulation","Pot à boue","Filtre magnétique","Disconnecteur","Vase d’expansion chauffage","Support vase chauff.","Vase d’expansion sanitaire","Support vase sanitaire","Potence","Vanne 1¼ M-F","Vanne 1 M-F","Vanne 3/4 M-F","Vanne 1/2 M-F","T 1¼ F","T 1 F","T 3/4 F","Coude 1¼ M-F","Coude 1 M-F","Coude 3/4 M-F","Réduction 1¼ F–1 M","Réduction 1 M–3/4 M","V3V 1","Servomoteur 230 V","Thermostat de sécurité","Manomètre 1/2","Mamelon 1¼","Mamelon 1","Mamelon 3/4","Flexible 1 M","Flexible 0,7 M","Flexible 0,5 M","Multicouche 32","Multicouche 25","Multicouche 16","Raccord GEBO","Bouchon CU gaz"],
  "Goulottes":["Goulotte 140","Goulotte 110","Goulotte 80","T 110","T 80","Angle plat 110","Angle plat 80","Passage mur droit 110","Passage mur droit 80","Passage mur angle col 110","Passage mur angle col 80","Passage mur angle 110","Passage mur angle 80","Angle externe 110","Angle externe 80","Angle interne 110","Angle interne 80","Jonction 110","Jonction 80"],
  "Électrique":["3G10 mm²","5G6 mm²","4G6 mm²","3G6 mm²","3G4 mm²","5G4 mm²","3G2,5 mm²","5G2,5 mm²","4G1,5 mm²","3G1,5 mm²","5G1,5 mm²","Câble BUS 2×0,75 mm²","Inter différentiel 63 A mono","Inter différentiel 40 A tri","Disjoncteur 32 A mono","Disjoncteur 25 A mono","Disjoncteur 20 A mono","Disjoncteur 16 A mono","Disjoncteur 10 A mono","Disjoncteur 25 A tri","Disjoncteur 20 A tri","Disjoncteur 16 A tri","Tableau 13 modules tri","Tableau 10 modules","Tableau 8 modules","Tableau 6 modules","Tableau 2 modules","Boîte dérivation 80×80","Domino 25 carré","Goulotte 40×25","Goulotte 20×16","ICTA 25","Tube IRL 25","Tube IRL 32"]
};

function Field({label,name,type="text",wide=false,children}) {
  return <label className={wide?"wide":""}><span>{label}</span>{children||<input name={name} type={type}/>}</label>;
}
function Choice({name,label}) {
  return <div className="choice"><span>{label}</span><label><input type="radio" name={name} value="Oui"/>Oui</label><label><input type="radio" name={name} value="Non"/>Non</label></div>;
}
function SignaturePad({name,title}) {
  const canvas=useRef(null); const drawing=useRef(false);
  useEffect(()=>{const element=canvas.current;const resize=()=>{const ratio=window.devicePixelRatio||1;const rect=element.getBoundingClientRect();element.width=rect.width*ratio;element.height=rect.height*ratio;const ctx=element.getContext("2d");ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap="round";ctx.strokeStyle="#183f79";const saved=localStorage.getItem(`mkl-${name}`);if(saved){const image=new Image();image.onload=()=>ctx.drawImage(image,0,0,rect.width,rect.height);image.src=saved;}};resize();},[name]);
  const point=e=>{const r=canvas.current.getBoundingClientRect();const source=e.touches?.[0]||e;return {x:source.clientX-r.left,y:source.clientY-r.top};};
  const start=e=>{e.preventDefault();drawing.current=true;const p=point(e);const c=canvas.current.getContext("2d");c.beginPath();c.moveTo(p.x,p.y);};
  const move=e=>{if(!drawing.current)return;e.preventDefault();const p=point(e);const c=canvas.current.getContext("2d");c.lineTo(p.x,p.y);c.stroke();};
  const stop=()=>{if(drawing.current)localStorage.setItem(`mkl-${name}`,canvas.current.toDataURL("image/png"));drawing.current=false;};
  const clear=()=>{canvas.current.getContext("2d").clearRect(0,0,canvas.current.width,canvas.current.height);localStorage.removeItem(`mkl-${name}`);};
  return <div className="signature-pad"><div><Signature size={17}/><b>{title}</b><button type="button" onClick={clear}><Eraser size={14}/>Effacer</button></div><canvas ref={canvas} data-name={name} onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={move} onTouchEnd={stop}/><small>Signer avec le doigt ou le stylet</small></div>;
}

function fillNamedFields(data) {
  for (const [key, value] of Object.entries(data || {})) {
    document.querySelectorAll(`[name="${key}"]`).forEach(field => {
      if (field.type === "radio") field.checked = field.value === value;
      else if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value ?? "";
    });
  }
}

async function loadClients() {
  try {
    const response = await authFetch("/api/clients");
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.clients)) return data.clients;
  } catch {}
  return [];
}

function PrevisitParties({ company, clients, clientId, presetClient }) {
  const selected = findExistingClient(clients, clientId) || (presetClient?.id ? presetClient : null);
  const party = frozenRecipient(selected);
  return <>
    <input type="hidden" name="client" value={party.clientName} />
    <input type="hidden" name="address" value={party.clientAddress} />
    <input type="hidden" name="phone" value={party.clientPhone} />
    <input type="hidden" name="email" value={party.clientEmail} />
    <DocumentParties company={company} clientTitle="Client / destinataire" {...party} />
  </>;
}

function agendaPreset(fields) {
  const source = fields || {};
  const next = {};
  if (source.date) next.date = source.date;
  if (source.technician) next.technician = source.technician;
  return next;
}

export default function PrevisitForm({
  embedded = false,
  presetClient = null,
  presetId = "",
  presetFields = null,
  onClose,
  onSaved,
} = {}) {
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveMessage,setSaveMessage]=useState("");
  const [recordId,setRecordId]=useState(null);
  const [clients,setClients]=useState([]);
  const opening = recipientLink(presetClient);
  const [clientId,setClientId]=useState(opening.clientId);
  const [prospectId,setProspectId]=useState(opening.prospectId);
  const [party,setParty]=useState(presetClient?.directoryKind==="prospect"?presetClient:null);
  const pendingDraft=useRef(null);
  const draftFilled=useRef(false);
  const {company}=useCompany();
  useEffect(()=>{
    const query=embedded ? new URLSearchParams() : new URLSearchParams(location.search);
    const id=embedded ? (presetId || "") : query.get("id");
    setRecordId(id || null);
    (async()=>{
      const directory=await loadClients();
      setClients(directory);
      let data={};
      let linked="";
      if(id){
        const records=await loadSharedRecords("mkl-technical-visits");
        const record=records.find(item=>String(item.id)===String(id));
        if(record) {
          data={...record,...record.formData};
          linked=record.clientId||record.formData?.clientId||"";
          if(!linked && (record.prospectId||record.formData?.prospectId)) setProspectId(String(record.prospectId||record.formData?.prospectId));
        } else {
          try { data=JSON.parse(localStorage.getItem("mkl-previsite-draft")||"{}"); } catch {}
          linked=data.clientId||"";
        }
      } else {
        try { data=JSON.parse(localStorage.getItem("mkl-previsite-draft")||"{}"); } catch {}
        linked=data.clientId||"";
      }
      for(const [key,value] of query){
        if(key==="id"||key==="new") continue;
        if(key==="clientId") { linked=value; continue; }
        data[key]=value;
      }
      if(!embedded && query.get("new")==="1"&&!query.get("clientId")) linked="";
      if(embedded && presetClient?.directoryKind==="prospect") linked="";
      else if(embedded && presetClient?.id) linked=String(presetClient.id);
      pendingDraft.current=data;
      setClientId(linked?String(linked):"");
    })();
  },[]);
  useEffect(()=>{
    if(draftFilled.current) return;
    if(!pendingDraft.current && !clientId && !prospectId) return;
    const presetMatch = presetClient?.id && String(presetClient.id) === String(clientId) ? presetClient : null;
    if (presetId && !pendingDraft.current) return;
    if (clientId && clients.length === 0 && !presetMatch) return;
    const named = { ...(pendingDraft.current || {}), ...agendaPreset(presetFields) };
    const client=findExistingClient(clients, clientId);
    if(client) {
      draftFilled.current=true;
      fillNamedFields(named);
      applyClientFields(client);
      return;
    }
    if(presetMatch) {
      draftFilled.current=true;
      fillNamedFields(named);
      applyClientFields(presetMatch);
      return;
    }
    if(prospectId && (party||presetClient) && !draftFilled.current) {
      draftFilled.current=true;
      fillNamedFields(named);
      applyClientFields(party||presetClient);
    }
  },[clientId,clients,prospectId,presetClient,presetFields,presetId]);
  useEffect(() => {
    const onBeforePrint = () => omitEmptyPrevisitFields(document.querySelector(".previsit-app"), { mark: true });
    const onAfterPrint = () => {
      document.querySelectorAll(".previsit-omit").forEach(node => node.classList.remove("previsit-omit"));
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      onAfterPrint();
    };
  }, []);
  function applyClientFields(item) {
    if(!item) return;
    const fields=personSearchFields(item);
    fillNamedFields({
      client:item.name||`${fields.lastName} ${fields.firstName}`.trim(),
      address:fields.address,
      phone:fields.phone,
      email:fields.email,
    });
  }
  function applyClient(item) {
    const link=recipientLink(item);
    setClientId(link.clientId);
    setProspectId(link.prospectId);
    setParty(item?.directoryKind==="prospect"?item:null);
    applyClientFields(item);
  }
  function hasParty() {
    if (findExistingClient(clients, clientId) || prospectId) return true;
    return Boolean(presetClient?.id && String(presetClient.id) === String(clientId));
  }
  function readForm() {
    const form=document.querySelector(".previsit-app form");
    const data={};
    if(form) {
      for (const [key, value] of new FormData(form).entries()) {
        if (typeof value === "string") data[key]=value;
      }
    }
    if(clientId) data.clientId=clientId;
    if(prospectId) data.prospectId=prospectId;
    return data;
  }
  async function saveDraft() {
    if(saving) return "";
    if(!hasParty()) {
      setSaveMessage(EXISTING_CLIENT_MESSAGE);
      setSaved(true);
      setTimeout(()=>setSaved(false), 4000);
      return "";
    }
    setSaving(true);
    setSaved(false);
    setSaveMessage("");
    try {
      const data=readForm();
      try { localStorage.setItem("mkl-previsite-draft",JSON.stringify(data)); } catch {}
      let records=await loadSharedRecords("mkl-technical-visits");
      if(!Array.isArray(records)) records=[];
      let id=recordId;
      const next={
        client:data.client||"Client à renseigner",
        clientId:data.clientId||"",
        prospectId:data.prospectId||prospectId||"",
        date:data.date||"",
        technician:data.technician||"Responsable technique",
        quoteNumber:data.quoteNumber||"",
        formData:data,
        status:"Prévisite complétée",
        updated:new Date().toISOString(),
      };
      if(id && records.some(record=>String(record.id)===String(id))) {
        records=records.map(record=>String(record.id)===String(id)?{...record,...next}:record);
      } else {
        id=id||Date.now();
        records=[{id,source:"Création sans devis",created:new Date().toISOString(),...next},...records];
        setRecordId(id);
        if(!embedded) history.replaceState({},"",`/previsite?id=${id}`);
      }
      await saveSharedRecords("mkl-technical-visits",records,{ deletedIds: [] });
      onSaved?.(records.find(record=>String(record.id)===String(id)));
      setSaveMessage("");
      setSaved(true);
      setTimeout(()=>setSaved(false),2200);
      return String(id);
    } catch (error) {
      setSaveMessage(String(error?.message||"Enregistrement impossible. Réessayez."));
      setSaved(true);
      return "";
    } finally {
      setSaving(false);
    }
  }
  async function ensureVisit() {
    if(recordId) {
      await saveDraft();
      return String(recordId);
    }
    return saveDraft();
  }
  return <main className={`previsit-app${embedded?" is-embedded":""}`}>
    <header className="form-toolbar"><button type="button" onClick={()=>{ if(embedded) onClose?.(); else location.href="/"; }}><ArrowLeft/>{embedded?"Fermer":"Retour CRM"}</button><div><Save size={18}/><span><b>Rapport de prévisite</b><small>Formulaire {companyDisplayName(company)}</small></span></div><div><button type="button" disabled={saving} onClick={()=>saveDraft()}><Save/>{saving?"Enregistrement…":"Enregistrer"}</button><button type="button" onClick={()=>{if(!hasParty()){setSaveMessage(EXISTING_CLIENT_MESSAGE);setSaved(true);return;}openCurrentFormPreview({title:"Rapport de prévisite",rootSelector:".previsit-app",omitEmpty:true}).catch(error=>setSaveMessage(String(error?.message||"Téléchargement PDF impossible")))}}><Download/>Télécharger</button><button type="button" className="print" onClick={()=>{if(!hasParty()){setSaveMessage(EXISTING_CLIENT_MESSAGE);setSaved(true);return;} if(embedded){openCurrentFormPreview({title:"Rapport de prévisite",rootSelector:".previsit-app",omitEmpty:true}).catch(error=>setSaveMessage(String(error?.message||"Impression impossible")));return;} window.print();}}><Printer/>Imprimer</button></div></header>
    {(saving||saved)&&(
      <div className={`save-toast${saveMessage?" is-error":""}`}>
        {saveMessage?saveMessage:<><CheckCircle2/>{saving?"Enregistrement…":"Prévisite enregistrée"}</>}
      </div>
    )}
    {embedded && presetId && !clientId && !prospectId ? <p className="document-window-empty">Chargement de la prévisite…</p> : !hasParty() ? (
      <ExistingClientGate clients={clients} title="Rapport de prévisite" allowCreate={false} allowProspect onSelect={applyClient} />
    ) : (
    <form onSubmit={event=>event.preventDefault()}>
      <section className="paper cover">
        <div className="document-head"><img src="/mkl-energies.png" alt={companyDisplayName(company)}/><div><span>RAPPORT DE PRÉVISITE</span><h1>Fiche d’installation</h1><p>Pompe à chaleur • Climatisation • Eau chaude sanitaire</p></div></div>
        <PrevisitParties company={company} clients={clients} clientId={clientId} presetClient={party||presetClient} />
        <h2>Informations du dossier</h2>
        <div className="field-grid"><Field label="Date de prévisite" name="date" type="date"/><Field label="Technicien / Responsable technique" name="technician"/><Field label="Commercial" name="commercial"/><Field label="Nombre de jours d’installation" name="installationDays" type="number"/><Field label="Devis associé (vide si création libre)" name="quoteNumber"/><Field label="Financement" name="financing"/><Field label="Comptant / acompte" name="deposit"/></div>
        <h2>Pompe à chaleur</h2>
        <div className="field-grid"><Field label="Marque" name="pacBrand"/><Field label="Unité extérieure" name="outsideUnit"/><Field label="Unité intérieure" name="insideUnit"/><Field label="Puissance PAC" name="pacPower"/><Field label="Surface maison (m²)" name="houseArea" type="number"/><Field label="Nombre de radiateurs" name="radiators" type="number"/><Field label="Circuits plancher" name="floorCircuits" type="number"/><Field label="Nature et diamètre chauffage" name="heatingDiameter" wide/><Field label="Nature et diamètre ECS" name="ecsDiameter" wide/><Field label="Alimentation mono / tri" name="electricPhase"/><Field label="Puissance compteur" name="meterPower"/><Field label="Puissance demandée" name="requestedPower"/></div>
        <div className="choice-grid"><Choice name="wirelessRemote" label="Télécommande sans fil"/><Choice name="twoCircuits" label="Deux circuits"/><Choice name="wifi" label="Carte Wi-Fi"/><Choice name="ecsOption" label="ECS"/></div>
        <h2>Ballon d’eau chaude sanitaire</h2>
        <div className="choice-grid"><Choice name="thermodynamicTank" label="Ballon thermodynamique"/><Choice name="electricTank" label="Ballon électrique"/><Choice name="tripod" label="Trépied"/><Choice name="fixingKit" label="Kit de fixation"/></div>
        <div className="field-grid"><Field label="Marque" name="tankBrand"/><Field label="Capacité (L)" name="tankCapacity" type="number"/><Field label="HSP (m)" name="ceilingHeight"/></div>
        <h2>Nature du chantier</h2>
        <div className="field-grid"><Field label="Chaudière à déposer" name="boilerRemoval"/><Field label="Énergie actuelle" name="currentEnergy"><select name="currentEnergy"><option></option><option>Fioul</option><option>Gaz</option><option>Bois</option><option>Électrique</option><option>Autre</option></select></Field><Field label="Poids estimé (kg)" name="estimatedWeight" type="number"/></div>
        <div className="choice-grid"><Choice name="rinse" label="Vidange et rinçage circuits chauffage"/><Choice name="slab" label="Dalle 100×80 réalisée par le client"/><Choice name="locationsApproved" label="Emplacements validés sur photos"/></div>
        <div className="field-grid"><Field label="Câble tableau principal → sous-tableau PAC (m)" name="powerCableLength" type="number"/><Field label="Liaisons frigorifiques et électriques (m)" name="linkLength" type="number"/><Field label="Commentaires" name="comments" wide><textarea name="comments" rows="4"/></Field></div>
      </section>
      <PrevisitPhotosPanel
        visitKey={recordId?String(recordId):""}
        clientId={clientId}
        ensureVisit={ensureVisit}
        companyName={companyDisplayName(company)}
        getMeta={()=>{
          const data=readForm();
          return {
            number:recordId?`PRE-${String(recordId).slice(-6)}`:"",
            client:data.client,
            address:data.address,
            date:data.date,
            technician:data.technician,
          };
        }}
      />
      <section className="paper materials">
        <div className="document-head compact"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>RAPPORT DE PRÉVISITE</span><h1>Liste du matériel</h1><p>Indiquer la quantité prévue pour chaque article.</p></div></div>
        <div className="materials-columns">{Object.entries(materialSections).map(([section,items])=><section className="material-section" key={section}><h2>{section}</h2>{items.map((item,index)=><label key={`${section}-${item}-${index}`}><span>{item}</span><input type="number" min="0" step="1" name={`qty_${section}_${index}`} placeholder="Qté"/></label>)}</section>)}</div>
      </section>
      <section className="paper signatures-page">
        <div className="document-head compact"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>VALIDATION</span><h1>Accord de prévisite</h1><p>Les implantations, travaux et besoins matériels ont été présentés au client.</p></div></div>
        <div className="field-grid"><Field label="Nom du client signataire" name="signerName"/><Field label="Réserves ou observations" name="signatureComments" wide><textarea name="signatureComments" rows="6"/></Field></div>
        <label className="consent"><input type="checkbox" name="clientConfirmed"/>Je confirme l’exactitude des informations et valide les emplacements présentés lors de la prévisite.</label>
        <DocumentClosing>
          <SignaturePad name={`${recordId||"new"}-technicianSignature`} title="Signature du technicien"/>
          <SignaturePad name={`${recordId||"new"}-clientSignature`} title="Signature du client"/>
        </DocumentClosing>
        <p className="legal">Document établi électroniquement par {companyDisplayName(company)}. La signature manuscrite réalisée sur tablette matérialise l’accord du signataire. Une copie imprimée ou PDF peut être remise au client.</p>
      </section>
    </form>
    )}
  </main>;
}
