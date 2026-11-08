"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BatteryCharging, Building2, CheckCircle2, Download, Euro, Leaf, Printer, Sun, Zap } from "lucide-react";
import DocumentParties, { frozenRecipient } from "../components/document-parties";
import { companyDisplayName, companyEmitterLines } from "../lib/company";
import { computePvStudyResults, formatPvMoney, formatPvNumber, PV_MONTHS } from "../lib/pv-study";
import { downloadPvStudyPdf } from "../lib/pv-study-pdf";
import { authFetch } from "../lib/supabase-rest";
import { useCompany } from "../lib/use-company";
import { loadSharedRecords } from "../lib/use-record-table";
import "./study.css";

const months = PV_MONTHS;
const money = formatPvMoney;
const number = formatPvNumber;

function Page({number:pageNumber,title,children,className="",companyName="MKL Énergies"}) {
  return <section className={`study-page ${className}`}><header className="study-head"><img src="/mkl-energies.png" alt={companyName}/><div><h1>{title || "Étude photovoltaïque"}</h1><p>{companyName}</p></div></header>{children}<footer><span>{companyName} · Étude photovoltaïque personnalisée</span><b>{pageNumber}</b></footer></section>;
}

function readLocal(key) {
  try { return JSON.parse(window.localStorage.getItem(key)||"null"); }
  catch { return null; }
}

async function loadProjects() {
  return loadSharedRecords("mkl-pv-projects");
}

async function loadClients() {
  try {
    const response=await authFetch("/api/clients");
    const data=await response.json().catch(()=>({}));
    if(response.ok&&Array.isArray(data.clients)) return data.clients;
  } catch {}
  const local=readLocal("mkl-clients");
  return Array.isArray(local)?local:[];
}

export default function PvStudyPage() {
  const [project,setProject]=useState(null);
  const [client,setClient]=useState(null);
  const [loadError,setLoadError]=useState("");
  const [loading,setLoading]=useState(true);
  const { company } = useCompany();
  const companyName = companyDisplayName(company);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const id=new URLSearchParams(window.location.search).get("id");
      if(!id) {
        if(!cancelled){setLoadError("Aucune étude sélectionnée.");setLoading(false);}
        return;
      }
      const [projects,clients]=await Promise.all([loadProjects(),loadClients()]);
      if(cancelled) return;
      const found=projects.find(item=>String(item.id)===String(id))||null;
      if(!found) {
        setLoadError("Étude introuvable. Rouvrez-la depuis le CRM (Études photovoltaïques).");
        setLoading(false);
        return;
      }
      const matched=clients.find(item=>
        (found.clientId&&String(item.id)===String(found.clientId))||
        item.name===found.client
      )||null;
      setProject(found);
      setClient(matched);
      setLoading(false);
    })();
    return ()=>{cancelled=true;};
  },[]);

  const results=useMemo(()=>project?computePvStudyResults(project):null,[project]);

  function printStudy() {
    window.print();
  }

  function downloadStudy() {
    return downloadPvStudyPdf({
      project,
      client,
      company,
      address: project?.address
        || [client?.address, client?.postalCode || client?.codePostal, client?.city].filter(Boolean).join(" ")
        || [project?.city, project?.postcode].filter(Boolean).join(" "),
    }).catch(error => window.alert(String(error?.message || "Téléchargement PDF impossible")));
  }

  if(loading) return <main className="study-loading">Chargement de l’étude photovoltaïque…</main>;
  if(loadError||!project||!results) {
    return <main className="study-loading study-error">
      <b>Étude indisponible</b>
      <p>{loadError||"Impossible d’afficher l’étude."}</p>
      <a href="/">Retour au CRM</a>
    </main>;
  }

  const hasBattery=Number(project.batteryCapacity||0)>0;
  const address=project.address
    ||[client?.address,client?.postalCode||client?.codePostal,client?.city].filter(Boolean).join(" ")
    ||[project.city,project.postcode].filter(Boolean).join(" ");

  return <main className="study-document">
    <div className="study-toolbar no-print">
      <a href="/" className="study-back"><ArrowLeft size={17}/>Retour CRM</a>
      <button type="button" className="secondary-tool" onClick={downloadStudy}><Download size={17}/>Télécharger</button>
      <button type="button" onClick={printStudy}><Printer size={17}/>Imprimer</button>
    </div>
    <Page number="1 / 8" className="cover" companyName={companyName}>
      <div className="cover-grid"><div><span className="cover-label">ÉTUDE PERSONNALISÉE</span><h1>Étude d’installation<br/>photovoltaïque</h1><p>Une simulation commerciale réalisée à partir des caractéristiques de votre projet et de votre consommation.</p><div className="cover-kpis"><b>{Number(project.powerKwp).toFixed(1)} <small>kWc installés</small></b><b>{number(results.production)} <small>kWh produits/an</small></b></div>{hasBattery&&<em><BatteryCharging size={17}/>Avec batterie {project.batteryCapacity} kWh</em>}</div><div className="roof-visual"><Sun size={90}/><div className="roof"><span>{Array.from({length:Math.min(18,Number(project.panels)||0)},(_,i)=><i key={i}/>)}</span></div></div></div>
      <DocumentParties
        company={company}
        clientTitle="Client / destinataire"
        {...frozenRecipient(client, {
          clientName: project.client,
          address: client?.address || "",
          postalCode: client?.postalCode || client?.codePostal || project.postcode || "",
          city: client?.city || project.city || "",
          clientAddress: address,
          clientPhone: client?.phone || client?.mobile || "",
          clientEmail: client?.email || "",
          addressChecked: Boolean(client),
        })}
      />
      <div className="identity-grid"><div><small>Projet</small><b>{project.name}</b><span>{project.city}</span><span>Étude du {project.created?new Date(project.created).toLocaleDateString("fr-FR"):"—"}</span>{project.yieldSource&&<span>Productible : {project.yieldValue||project.yield} kWh/kWc ({project.yieldSource==="pvgis"?"PVGIS":"estimation"})</span>}{project.lat&&project.lon&&<span>GPS {Number(project.lat).toFixed(5)}, {Number(project.lon).toFixed(5)}</span>}</div></div>
      <p className="disclaimer">Estimations indicatives basées sur les informations renseignées. La production réelle dépend notamment de l’orientation, de l’inclinaison, des ombrages, de la météo et des caractéristiques définitives du site.</p>
    </Page>
    <Page number="2 / 8" title="Votre offre" companyName={companyName}>
      <h2>Une installation pensée pour votre projet</h2><div className="offer-grid"><div className="offer-price"><span>Installation photovoltaïque de {Number(project.powerKwp).toFixed(1)} kWc</span><b>{money(project.price)} TTC</b><small>{money(Number(project.price)/1.2)} HT · TVA indicative 20 %</small></div><div className="offer-prime"><Sun/><span><b>Prime à l’autoconsommation</b><small>Montant à confirmer selon le barème applicable à la date de raccordement.</small></span></div></div>
      <h2>Les chiffres clés</h2><div className="metric-grid"><div><Zap/><b>{project.panels}</b><span>panneaux de {project.panelPower} W</span></div><div><Sun/><b>{number(results.production)}</b><span>kWh produits par an</span></div><div><Euro/><b>{money(results.yearlySaving)}</b><span>gain estimé la première année</span></div><div><BatteryCharging/><b>{Math.round(results.autonomy)} %</b><span>autonomie électrique estimée</span></div></div>
    </Page>
    <Page number="3 / 8" title="Fonctionnement" companyName={companyName}>
      <h2>Comment fonctionne votre installation ?</h2><div className="energy-flow"><div><Sun/><b>Panneaux solaires</b><span>Produisent du courant continu</span></div><i>→</i><div><Zap/><b>Onduleur</b><span>Transforme le courant en alternatif</span></div><i>→</i><div><Building2/><b>Votre habitation</b><span>Consomme en priorité l’énergie solaire</span></div><i>→</i><div><Euro/><b>Surplus</b><span>Injecté et vendu au réseau</span></div></div>
      <div className="explain-grid"><article><h3>Autoconsommation</h3><p>L’électricité produite alimente directement les appareils du logement. Cette énergie ne doit plus être achetée au réseau.</p></article><article><h3>Vente du surplus</h3><p>Lorsque la production dépasse les besoins instantanés, le surplus est injecté sur le réseau selon le contrat choisi.</p></article>{hasBattery&&<article><h3>Stockage batterie</h3><p>La batterie de {project.batteryCapacity} kWh conserve une partie du surplus pour une utilisation après le coucher du soleil.</p></article>}</div>
    </Page>
    <Page number="4 / 8" title="Production solaire" companyName={companyName}>
      <h2>Production mensuelle estimée</h2><div className="bar-chart">{results.monthly.map((value,index)=><div key={months[index]}><span style={{height:`${Math.max(8,value/Math.max(...results.monthly)*280)}px`}}><b>{number(value)}</b></span><small>{months[index]}</small></div>)}</div><div className="chart-total"><Sun/><span><small>Production annuelle moyenne</small><b>{number(results.production)} kWh</b></span></div>
      <p className="study-note">La répartition mensuelle est une estimation. Une simulation définitive devra intégrer l’orientation, l’inclinaison et les masques solaires.</p>
    </Page>
    <Page number="5 / 8" title="Impact sur votre consommation" companyName={companyName}>
      <h2>Répartition de l’énergie produite</h2><div className="split-visual"><div className="donut" style={{"--part":`${Math.round(project.selfConsumptionRate||65)*3.6}deg`}}><span><b>{project.selfConsumptionRate||65}%</b>autoconsommés</span></div><div className="split-details"><p><i className="self"/><span><b>{number(results.selfConsumed)} kWh</b> autoconsommés</span></p><p><i className="sold"/><span><b>{number(results.surplus)} kWh</b> vendus au réseau</span></p><p><i className="grid"/><span><b>{number(results.gridAfter)} kWh</b> restant à acheter</span></p></div></div>
      <div className="impact-kpis"><div><small>Autoconsommation</small><b>{project.selfConsumptionRate||65} %</b></div><div><small>Autonomie solaire</small><b>{Math.round(results.autonomy)} %</b></div><div><small>Prix réseau utilisé</small><b>{Number(project.electricityPrice||.194).toFixed(3)} €/kWh</b></div><div><small>Tarif surplus utilisé</small><b>{Number(project.surplusPrice||.04).toFixed(3)} €/kWh</b></div></div>
    </Page>
    <Page number="6 / 8" title="Rentabilité" companyName={companyName}>
      <h2>Économies estimées sur 25 ans</h2><div className="saving-hero"><Euro size={52}/><div><small>Économies cumulées sur la facture</small><b>{money(results.savings25)}</b><span>Hypothèse : augmentation annuelle du prix réseau de 4 %</span></div></div><div className="finance-equation"><div><small>Économies estimées</small><b>{money(results.savings25)}</b></div><i>−</i><div><small>Coût initial du projet</small><b>{money(project.price)}</b></div><i>=</i><div><small>Gain net estimé</small><b>{money(results.savings25-Number(project.price||0))}</b></div></div><div className="payback"><span>Retour sur investissement simple estimé</span><b>{results.payback.toFixed(1)} ans</b></div>
      <p className="study-note">Projection non contractuelle : elle ne tient pas compte des coûts éventuels de financement, maintenance, remplacement de matériel, fiscalité ou évolution réglementaire.</p>
    </Page>
    <Page number="7 / 8" title="Impact environnemental" companyName={companyName}>
      <h2>Une production locale et renouvelable</h2><div className="eco-hero"><Leaf size={70}/><div><b>{number(results.co2)} kg</b><span>de CO₂ évités chaque année, estimation indicative</span></div></div><div className="eco-grid"><div><b>{results.trees}</b><span>équivalent arbres contribuant à capter cette quantité de CO₂</span></div><div><b>&lt; 2 ans</b><span>temps de retour énergétique généralement constaté pour un panneau moderne</span></div><div><b>30 ans</b><span>durée de garantie produit couramment proposée selon le matériel retenu</span></div></div><article className="recycling"><Leaf/><div><h3>Recyclage des panneaux</h3><p>Les équipements photovoltaïques en fin de vie sont pris en charge par la filière agréée applicable.</p></div></article>
    </Page>
    <Page number="8 / 8" title={`Votre projet ${companyName}`} companyName={companyName}>
      <h2>Équipements et prochaines étapes</h2><div className="equipment"><div><Sun/><span><b>{project.panels} panneaux photovoltaïques</b><small>{project.panelPower} W par module · modèle définitif selon devis</small></span></div><div><Zap/><span><b>Onduleur ou micro-onduleurs</b><small>Dimensionnement confirmé après visite technique</small></span></div>{hasBattery&&<div><BatteryCharging/><span><b>Batterie {project.batteryCapacity} kWh</b><small>Capacité utile à confirmer selon le profil de consommation</small></span></div>}</div>
      <div className="steps"><div><b>1</b><span><strong>Visite technique</strong>Contrôle de la toiture, du tableau électrique, des accès et des ombrages.</span></div><div><b>2</b><span><strong>Démarches administratives</strong>Déclaration préalable en mairie et demande de raccordement.</span></div><div><b>3</b><span><strong>Installation</strong>Planification du chantier et pose par l’équipe {companyName}.</span></div><div><b>4</b><span><strong>Mise en service</strong>Contrôles, raccordement et accompagnement du client.</span></div></div>
      <div className="company-box"><img src="/mkl-energies.png" alt={companyName}/><div><b>{companyName}</b>{companyEmitterLines(company).map(line=><span key={line}>{line}</span>)}</div><CheckCircle2 size={34}/></div>
    </Page>
  </main>;
}
