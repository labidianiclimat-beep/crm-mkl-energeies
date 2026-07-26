"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,CheckCircle2,Eraser,Printer,Save,Signature} from "lucide-react";
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

export default function PrevisitForm() {
  const [saved,setSaved]=useState(false);
  const [recordId,setRecordId]=useState(null);
  useEffect(()=>{const query=new URLSearchParams(location.search);const id=query.get("id");setRecordId(id);let data={};if(id){try{const records=JSON.parse(localStorage.getItem("mkl-technical-visits")||"[]");const record=records.find(item=>String(item.id)===String(id));if(record)data={...record,...record.formData};}catch{}}else{try{data=JSON.parse(localStorage.getItem("mkl-previsite-draft")||"{}");}catch{}}for(const [key,value] of Object.entries(data)){const fields=document.querySelectorAll(`[name="${key}"]`);fields.forEach(field=>{if(field.type==="radio")field.checked=field.value===value;else if(field.type==="checkbox")field.checked=Boolean(value);else field.value=value??"";});}for(const [key,value] of query){const field=document.querySelector(`[name="${key}"]`);if(field&&key!=="id"&&key!=="new")field.value=value;}},[]);
  function saveDraft(event) {
    const form=event.currentTarget.closest(".previsit-app").querySelector("form");const data=Object.fromEntries(new FormData(form));localStorage.setItem("mkl-previsite-draft",JSON.stringify(data));
    let records=[];try{records=JSON.parse(localStorage.getItem("mkl-technical-visits")||"[]");}catch{}
    let id=recordId;
    if(id) records=records.map(record=>String(record.id)===String(id)?{...record,client:data.client||record.client,date:data.date||record.date,technician:data.technician||record.technician,quoteNumber:data.quoteNumber||record.quoteNumber,formData:data,status:"Prévisite complétée",updated:new Date().toISOString()}:record);
    else {id=Date.now();records=[{id,client:data.client||"Client à renseigner",date:data.date||"",technician:data.technician||"Responsable technique",quoteNumber:data.quoteNumber||"",source:"Création sans devis",created:new Date().toISOString(),updated:new Date().toISOString(),status:"Prévisite complétée",formData:data},...records];setRecordId(id);history.replaceState({},"",`/previsite?id=${id}`);}
    localStorage.setItem("mkl-technical-visits",JSON.stringify(records));setSaved(true);setTimeout(()=>setSaved(false),2200);
  }
  return <main className="previsit-app">
    <header className="form-toolbar"><button onClick={()=>location.href="/"}><ArrowLeft/>Retour CRM</button><div><Save size={18}/><span><b>Rapport de prévisite</b><small>Formulaire MKL Énergies</small></span></div><div><button onClick={saveDraft}><Save/>Enregistrer</button><button className="print" onClick={()=>window.print()}><Printer/>Imprimer / PDF</button></div></header>
    {saved&&<div className="save-toast"><CheckCircle2/>Brouillon enregistré sur cette tablette</div>}
    <form>
      <section className="paper cover">
        <div className="document-head"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>RAPPORT DE PRÉVISITE</span><h1>Fiche d’installation</h1><p>Pompe à chaleur • Climatisation • Eau chaude sanitaire</p></div></div>
        <h2>Informations du dossier</h2>
        <div className="field-grid"><Field label="Date de prévisite" name="date" type="date"/><Field label="Technicien / Responsable technique" name="technician"/><Field label="Commercial" name="commercial"/><Field label="Nombre de jours d’installation" name="installationDays" type="number"/><Field label="Nom du client" name="client" wide/><Field label="Devis associé (vide si création libre)" name="quoteNumber"/><Field label="Adresse du chantier" name="address" wide/><Field label="Téléphone" name="phone"/><Field label="Email" name="email" type="email"/><Field label="Financement" name="financing"/><Field label="Comptant / acompte" name="deposit"/></div>
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
      <section className="paper materials">
        <div className="document-head compact"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>RAPPORT DE PRÉVISITE</span><h1>Liste du matériel</h1><p>Indiquer la quantité prévue pour chaque article.</p></div></div>
        <div className="materials-columns">{Object.entries(materialSections).map(([section,items])=><section className="material-section" key={section}><h2>{section}</h2>{items.map((item,index)=><label key={`${section}-${item}-${index}`}><span>{item}</span><input type="number" min="0" step="1" name={`qty_${section}_${index}`} placeholder="Qté"/></label>)}</section>)}</div>
      </section>
      <section className="paper signatures-page">
        <div className="document-head compact"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>VALIDATION</span><h1>Accord de prévisite</h1><p>Les implantations, travaux et besoins matériels ont été présentés au client.</p></div></div>
        <div className="field-grid"><Field label="Nom du client signataire" name="signerName"/><Field label="Date de signature" name="signatureDate" type="date"/><Field label="Réserves ou observations" name="signatureComments" wide><textarea name="signatureComments" rows="6"/></Field></div>
        <label className="consent"><input type="checkbox" required/>Je confirme l’exactitude des informations et valide les emplacements présentés lors de la prévisite.</label>
        <div className="signature-grid"><SignaturePad name={`${recordId||"new"}-technicianSignature`} title="Signature du technicien"/><SignaturePad name={`${recordId||"new"}-clientSignature`} title="Signature du client"/></div>
        <p className="legal">Document établi électroniquement par MKL Énergies. La signature manuscrite réalisée sur tablette matérialise l’accord du signataire. Une copie imprimée ou PDF peut être remise au client.</p>
      </section>
    </form>
  </main>;
}
