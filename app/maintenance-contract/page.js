"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Download,Eraser,Printer,Save,Signature,Wrench} from "lucide-react";
import DocumentClosing from "../components/document-closing";
import DocumentParties, { frozenRecipient } from "../components/document-parties";
import { companyDisplayName } from "../lib/company";
import {authFetch} from "../lib/supabase-rest";
import { openCurrentFormPreview } from "../lib/document-preview";
import { useCompany } from "../lib/use-company";
import { loadSharedOrgState, saveSharedOrgState } from "../lib/use-org-state";
import "../previsite/previsite.css";
import "./contract.css";

function SignaturePad({storageKey,title}){
  const canvas=useRef(null),drawing=useRef(false);
  useEffect(()=>{const el=canvas.current,ratio=devicePixelRatio||1,rect=el.getBoundingClientRect();el.width=rect.width*ratio;el.height=rect.height*ratio;const ctx=el.getContext("2d");ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap="round";ctx.strokeStyle="#27427f";const saved=localStorage.getItem(storageKey);if(saved){const image=new Image();image.onload=()=>ctx.drawImage(image,0,0,rect.width,rect.height);image.src=saved;}},[storageKey]);
  const point=e=>{const r=canvas.current.getBoundingClientRect(),s=e.touches?.[0]||e;return{x:s.clientX-r.left,y:s.clientY-r.top};};
  const start=e=>{e.preventDefault();drawing.current=true;const p=point(e),ctx=canvas.current.getContext("2d");ctx.beginPath();ctx.moveTo(p.x,p.y);};
  const move=e=>{if(!drawing.current)return;e.preventDefault();const p=point(e),ctx=canvas.current.getContext("2d");ctx.lineTo(p.x,p.y);ctx.stroke();};
  const stop=()=>{if(drawing.current)localStorage.setItem(storageKey,canvas.current.toDataURL());drawing.current=false;};
  const clear=()=>{canvas.current.getContext("2d").clearRect(0,0,canvas.current.width,canvas.current.height);localStorage.removeItem(storageKey);};
  return <div className="signature-pad"><div><Signature size={17}/><b>{title}</b><button type="button" onClick={clear}><Eraser size={14}/>Effacer</button></div><canvas ref={canvas} onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={move} onTouchEnd={stop}/><small>Signer avec le doigt ou le stylet</small></div>;
}
const money=value=>Number(value||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});

export default function MaintenanceContract(){
  const [contract,setContract]=useState(null),[client,setClient]=useState(null),[saved,setSaved]=useState(false);
  const {company}=useCompany();
  useEffect(()=>{
    const id=new URLSearchParams(location.search).get("id");
    (async()=>{
      const contracts=await loadSharedOrgState("mkl-contracts");
      const found=contracts.find(item=>String(item.id)===String(id));
      setContract(found||null);
      if(!found) return;
      const match=client=> (found.clientId&&String(client.id)===String(found.clientId))||client.name===found.client;
      try {
        const localClients=JSON.parse(localStorage.getItem("mkl-clients")||"[]");
        setClient(localClients.find(match)||null);
      } catch {}
      authFetch("/api/clients").then(async response=>{
        const data=await response.json().catch(()=>({}));
        if(response.ok&&Array.isArray(data.clients)) setClient(data.clients.find(match)||null);
      }).catch(()=>{});
    })();
  },[]);
  async function save(){
    if(!contract) return;
    const data=Object.fromEntries(new FormData(document.querySelector(".contract-form")));
    const next={...contract,...data,amount:Number(data.amount),status:data.status||contract.status};
    const contracts=(await loadSharedOrgState("mkl-contracts")).map(item=>String(item.id)===String(contract.id)?next:item);
    await saveSharedOrgState("mkl-contracts",contracts);
    setContract(next);
    setSaved(true);
    setTimeout(()=>setSaved(false),1800);
  }
  if(!contract)return <main className="contract-missing"><Wrench/><h1>Contrat introuvable</h1><button onClick={()=>location.href="/"}>Retour au CRM</button></main>;
  return <main className="previsit-app contract-app"><header className="form-toolbar"><button onClick={()=>location.href="/"}><ArrowLeft/>Retour CRM</button><div><Wrench size={18}/><span><b>Contrat d’entretien</b><small>{contract.number}</small></span></div><div><button onClick={save}><Save/>Enregistrer</button><button type="button" onClick={()=>openCurrentFormPreview({title:contract.number||"Contrat d’entretien",rootSelector:".contract-app"}).catch(error=>window.alert(String(error?.message||"Téléchargement PDF impossible")))}><Download/>Télécharger</button><button className="print" onClick={()=>window.print()}><Printer/>Imprimer</button></div></header>{saved&&<div className="save-toast">Contrat enregistré</div>}
    <form className="contract-form">
      <section className="paper contract-paper contract-page"><div className="document-head"><img src="/mkl-energies.png" alt="MKL Énergies"/><div><span>CONTRAT D’ENTRETIEN</span><h1>{contract.number}</h1><p>Climatisation • Pompe à chaleur • Équipements énergétiques</p></div></div>
        <DocumentParties
          company={company}
          clientTitle="Client / site d’intervention"
          {...frozenRecipient(client, {
            clientName: contract.client,
            clientPhone: client?.mobile || client?.phone,
            clientEmail: client?.email,
          })}
        />
        <div className="contract-grid"><label>Devis d’origine<input name="quoteNumber" defaultValue={contract.quoteNumber||""}/></label><label>Périodicité<select name="frequency" defaultValue={contract.frequency}><option>Annuelle</option><option>Semestrielle</option><option>Trimestrielle</option></select></label><label>Prochaine visite<input name="next" type="date" defaultValue={contract.next||""}/></label><label>Date de début<input name="startDate" type="date" defaultValue={contract.startDate||new Date().toISOString().slice(0,10)}/></label><label>Durée<select name="duration" defaultValue={contract.duration||"12 mois renouvelable"}><option>12 mois renouvelable</option><option>12 mois non renouvelable</option><option>24 mois</option><option>36 mois</option><option>10 ans</option></select></label><label>Statut<select name="status" defaultValue={contract.status}><option>À programmer</option><option>Actif</option><option>Suspendu</option><option>Résilié</option></select></label></div>
        <h2>Objet du contrat</h2><textarea name="type" defaultValue={contract.type} rows="3"/>
        <h2>Définition du matériel couvert</h2><textarea name="equipment" defaultValue={contract.equipment||contract.type||""} rows="5" placeholder="Marque, modèle, référence, numéro de série, unité intérieure, unité extérieure…"/>
        <h2>Périodicité des visites d’entretien</h2><p className="contract-copy">L’entretien courant comprend les visites prévues au présent contrat afin de contrôler le fonctionnement de l’installation, son étanchéité lorsque cela est applicable, sa sécurité et son état général.</p>
        <h2>Clauses techniques</h2><p className="contract-copy">MKL Énergies assure l’entretien du matériel désigné ci-dessus. Toute modification de l’installation ou tout équipement supplémentaire doit être signalé et pourra faire l’objet d’un avenant.</p>
      </section>
      <section className="paper contract-paper contract-page"><ContractPageTitle number={contract.number} page="2"/><h2>Programme d’entretien</h2><p className="contract-intro">À chaque visite, les opérations adaptées au matériel seront consignées dans le rapport d’intervention :</p><div className="included-grid">{["Vérification et nettoyage des filtres et reprises d’air","Contrôle des butées, arbres, silentblocs et raccords","Contrôle d’absence de fuite et de l’étanchéité du circuit","Contrôle des pressions haute et basse","Vérification du niveau d’huile du compresseur","Contrôle des températures de surchauffe et sous-refroidissement","Contrôle et réglage des sécurités frigorifiques","Vérification de la charge de fluide frigorigène","Contrôle des intensités absorbées et sécurités électriques","Resserrage des bornes électriques","Nettoyage des batteries, condensats et évacuations","Contrôle de la régulation et essai de fonctionnement"].map(item=><label key={item}><input type="checkbox" defaultChecked/>{item}</label>)}</div><h2>Dépannages</h2><p className="contract-copy">Les interventions en dehors des visites périodiques sont réalisées sur demande et facturées selon les tarifs en vigueur. Les déplacements, la main-d’œuvre et les pièces feront, lorsque nécessaire, l’objet d’un devis préalable.</p><h2>Accès aux locaux et obligations du client</h2><ul className="contract-terms"><li>Faciliter l’accès aux équipements et maintenir les zones d’intervention dégagées.</li><li>Fournir l’eau et l’électricité nécessaires au fonctionnement et aux essais.</li><li>Communiquer les notices, plans et documents techniques disponibles.</li><li>Signaler toute modification, anomalie ou intervention réalisée par un tiers.</li></ul></section>
      <section className="paper contract-paper contract-page"><ContractPageTitle number={contract.number} page="3"/><h2>Exclusions</h2><p className="contract-copy">Sauf mention contraire, ne sont pas compris : consommables, filtres, fluides, détartrage, traitement d’eau, pièces détachées, remplacement ou réparation de composants, dommages dus à un sinistre, à un tiers, à une mauvaise utilisation, à une modification non déclarée ou à un cas de force majeure.</p><h2>Facturation et échéances</h2><p className="contract-copy">La redevance est facturée selon les conditions particulières ci-dessous. Les prestations supplémentaires et travaux correctifs sont facturés séparément après accord du client.</p><h2>Révision du prix</h2><p className="contract-copy">Le prix peut être actualisé lors du renouvellement en fonction de l’évolution des coûts, taxes et indices applicables. Le client est informé avant l’entrée en vigueur du nouveau tarif.</p><h2>Conditions de règlement</h2><p className="contract-copy">Les factures sont payables à l’échéance indiquée. Tout retard peut entraîner l’application des intérêts, indemnités et mesures prévues par la réglementation applicable, après mise en demeure lorsque celle-ci est requise.</p><label className="contract-notes">Conditions particulières<textarea name="specialTerms" defaultValue={contract.specialTerms||""} rows="10" placeholder="Accès, horaires, équipements supplémentaires, exclusions, modalités de paiement…"/></label></section>
      <section className="paper contract-paper contract-page"><ContractPageTitle number={contract.number} page="4"/><h2>Durée, renouvellement et résiliation</h2><p className="contract-copy">Le contrat est conclu pour la durée indiquée dans les conditions particulières. Lorsqu’il est renouvelable, chaque partie peut s’opposer au renouvellement selon le préavis et les modalités prévus par la réglementation et les conditions contractuelles applicables. Tout manquement grave peut entraîner la résiliation après mise en demeure restée sans effet.</p><h2>Responsabilité et assurances</h2><p className="contract-copy">MKL Énergies déclare être assurée pour les activités couvertes par le contrat. Sa responsabilité ne peut être engagée pour les défaillances résultant d’une cause extérieure, d’une intervention d’un tiers, du non-respect des consignes, d’un vice de l’installation ou d’un événement de force majeure.</p><h2>Litiges et médiation</h2><p className="contract-copy">En cas de difficulté, les parties recherchent d’abord une solution amiable. Le consommateur peut recourir au dispositif de médiation compétent après réclamation écrite. À défaut d’accord, le litige relève des juridictions compétentes selon les règles légales applicables.</p><h2>Protection des données</h2><p className="contract-copy">Les données sont utilisées pour la gestion du contrat, la planification des interventions, la facturation et le respect des obligations légales. Le client peut exercer ses droits auprès de MKL Énergies.</p></section>
      <section className="paper contract-paper contract-page contract-final"><ContractPageTitle number={contract.number} page="5"/><h2>Détail du contrat et remarques</h2><textarea name="details" defaultValue={contract.details||""} rows="13" placeholder="Équipements, accès, opérations spécifiques, observations…"/><h2>Instructions et remarques</h2><textarea name="instructions" defaultValue={contract.instructions||""} rows="5"/><div className="contract-pricing"><label>Montant annuel HT<input name="amount" type="number" step="0.01" defaultValue={contract.amount}/></label><div><p><span>Total HT</span><b>{money(contract.amount)}</b></p><p><span>TVA indicative 20 %</span><b>{money(Number(contract.amount)*.2)}</b></p><p><span>Total TTC</span><b>{money(Number(contract.amount)*1.2)}</b></p></div></div><label className="consent"><input type="checkbox" required/>Le client reconnaît avoir pris connaissance du contrat et accepte les prestations et conditions indiquées.</label><DocumentClosing key={`${contract.id}-${client?.id||""}`} place={contract.place||client?.city||""} date={contract.signatureDate||""}><SignaturePad storageKey={`mkl-contract-${contract.id}-company`} title="Signature du responsable MKL Énergies"/><SignaturePad storageKey={`mkl-contract-${contract.id}-client`} title="Signature du client — Bon pour accord"/></DocumentClosing><p className="legal">Modèle contractuel MKL Énergies à faire valider par le conseil juridique et l’assureur de l’entreprise avant mise en production définitive.</p></section>
    </form>
  </main>;
}

function ContractPageTitle({number,page}){return <div className="contract-page-title"><b>CONTRAT D’ENTRETIEN N° {number}</b><span>Page n° {page}</span></div>;}
