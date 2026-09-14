"use client";

import { useEffect, useMemo, useState } from "react";
import { useStored } from "./lib/use-stored";
import { canAccessNav, resolveAllowedModules } from "./lib/access-control";
import { authFetch, getCurrentProfile } from "./lib/supabase-rest";
import { canPerformAction, isAdminRole } from "./lib/permissions";
import { CLIENT_STATUSES, CLIENT_TYPES, canAssignClientCommercial } from "./lib/clients";
import { ARTICLE_CATEGORIES, ARTICLE_UNITS, canManageArticles, matchesArticleSearch } from "./lib/articles";
import { resizeBrandLogoFile } from "./lib/brands";
import { statusesForKind, statusTone } from "./lib/devis";
import { ACCESS_MODULES, roleDescriptions, roleModuleDefaults } from "./lib/roles";
import { canViewTeamCommercialData } from "./lib/scoping";
import { logoutCrm } from "./components/crm-access-gate";
import PvAddressLookup from "./components/pv-address-lookup";
import ArticlePickerWizard from "./components/article-picker-wizard";
import {
  LayoutDashboard, Users, Building2, HardHat, Wrench, CalendarCheck,
  Search, Bell, Plus, ChevronRight, ChevronLeft, MapPin, Clock3, Zap, Euro,
  TrendingUp, Phone, MoreHorizontal, Menu, X, CircleDashed,
  CalendarDays, UserRound, FileText, ChevronDown, ShieldCheck,
  Download, FileSpreadsheet, CheckCircle2, LockKeyhole, Mail,
  Trash2, RefreshCw, ReceiptText, Send, CircleDollarSign, Package,
  Layers3, Upload, Pencil, ClipboardList, AlertTriangle, Truck,
  Eye, ShoppingCart, Library, BadgeEuro, LogOut, ArrowLeft, Sun, Tag
} from "lucide-react";

const nav = [
  ["Applications", Package],
  ["Vue d’ensemble", LayoutDashboard], ["Prospects", Users],
  ["Agenda commercial", CalendarDays],
  ["Clients", Building2], ["Chantiers", HardHat],
  ["Équipes d’installation", Users],
  ["Maintenance", Wrench], ["Planning", CalendarCheck],
  ["Photovoltaïque administratif", Zap],
  ["Visites techniques", Eye], ["Devis", FileText], ["Factures", ReceiptText],
  ["Factures pro forma", BadgeEuro],
  ["Demandes de chiffrage", ClipboardList],
  ["Fournisseurs", Truck],
  ["Gestion des articles", Package],
  ["Utilisateurs", ShieldCheck],
];

const opportunities = [
  { id:101,name:"Boulangerie Le Sillon",city:"Nantes",type:"Photovoltaïque",value:38400,power:"36 kWc",stage:"Étude",owner:"Non affecté",phone:"",email:"",color:"#f2a900" },
  { id:102,name:"EARL des Chênes",city:"Ancenis",type:"Photovoltaïque",value:76200,power:"100 kWc",stage:"Devis envoyé",owner:"Sébastien Brun",phone:"",email:"",color:"#4769b2" },
  { id:103,name:"SCI Horizon",city:"La Baule",type:"PAC + solaire",value:24900,power:"12 kWc",stage:"Négociation",owner:"Non affecté",phone:"",email:"",color:"#de6a45" },
  { id:104,name:"Ateliers Brossard",city:"Cholet",type:"Ombrière",value:118000,power:"180 kWc",stage:"Signature",owner:"Non affecté",phone:"",email:"",color:"#238875" },
];
const initialCommercialAppointments = [];
const initialClients = [
  { id:1,name:"EARL Bellevue",contact:"Paul Martin",email:"paul@bellevue.fr",phone:"06 28 44 12 90",city:"Ancenis",install:"Photovoltaïque 100 kWc" },
  { id:2,name:"SCI Horizon",contact:"Sophie Richard",email:"s.richard@horizon.fr",phone:"06 71 30 42 18",city:"La Baule",install:"Solaire 12 kWc + PAC" },
  { id:3,name:"Ferme de la Prairie",contact:"Luc Moreau",email:"luc@laprairie.fr",phone:"06 16 82 51 07",city:"Clisson",install:"Photovoltaïque 72 kWc" },
];
const initialContracts = [
  { id:1,client:"EARL Bellevue",number:"ENT-2026-018",type:"Maintenance préventive",frequency:"Annuelle",next:"2026-08-14",amount:890,status:"Actif" },
  { id:2,client:"SCI Horizon",number:"ENT-2026-024",type:"Solaire + PAC",frequency:"Semestrielle",next:"2026-08-03",amount:1240,status:"À planifier" },
  { id:3,client:"Ferme de la Prairie",number:"ENT-2025-091",type:"Maintenance préventive",frequency:"Annuelle",next:"2026-09-22",amount:760,status:"Actif" },
];
const initialUsers = [
  { id:1,name:"Khaled",email:"contact@mkl-energies.fr",role:"Admin VIP",manager:"Direction",status:"Actif" },
  { id:2,name:"Sébastien Brun",email:"sebastien@mkl-energies.fr",role:"Responsable commercial",manager:"Khaled",status:"Actif" },
  { id:3,name:"Karim Aït",email:"karim@mkl-energies.fr",role:"Technicien",manager:"Responsable technique",status:"Actif" },
];
const initialBilling = [
  { id:1,kind:"Devis",number:"DEV-2026-042",client:"SCI Horizon",date:"2026-07-18",due:"2026-08-17",label:"Installation solaire 12 kWc",amount:24900,tax:20,status:"Envoyé" },
  { id:2,kind:"Facture",number:"FAC-2026-031",client:"EARL Bellevue",date:"2026-07-08",due:"2026-08-07",label:"Acompte installation 100 kWc",amount:22860,tax:20,status:"À payer" },
  { id:3,kind:"Facture",number:"FAC-2026-027",client:"Ferme de la Prairie",date:"2026-06-22",due:"2026-07-22",label:"Maintenance annuelle",amount:760,tax:20,status:"Payée" },
];
const initialGroups = [
  { id:1,code:"GM",name:"Grand matériel",parent:"",description:"Équipements nécessitant une consultation fournisseur",margin:22 },
  { id:2,code:"PF",name:"Petite fourniture",parent:"",description:"Consommables, accessoires et raccords",margin:35 },
  { id:3,code:"INS",name:"Installation",parent:"",description:"Prestations de pose et mise en service",margin:45 },
  { id:11,code:"CLIM",name:"Climatisation",parent:"Grand matériel",description:"Systèmes de climatisation",margin:25 },
  { id:12,code:"CHAUF",name:"Chauffage",parent:"Grand matériel",description:"Équipements de chauffage",margin:25 },
  { id:13,code:"BTD",name:"Ballon thermodynamique",parent:"Grand matériel",description:"Ballons et accessoires",margin:25 },
  { id:14,code:"ADO",name:"Adoucisseur d’eau",parent:"Grand matériel",description:"Adoucisseurs et traitement de l’eau",margin:25 },
  { id:15,code:"PV",name:"Panneaux photovoltaïques",parent:"Grand matériel",description:"Panneaux, onduleurs et équipements",margin:28 },
];
const initialArticles = [
  { id:1,code:"PV-450W",name:"Panneau monocristallin 450 W",category:"Grand matériel",subcategory:"Panneaux photovoltaïques",unit:"Unité",buy:128,sell:189,tax:20,status:"Actif" },
  { id:2,code:"OND-10K",name:"Onduleur triphasé 10 kW",category:"Grand matériel",subcategory:"Panneaux photovoltaïques",unit:"Unité",buy:1420,sell:1960,tax:20,status:"Actif" },
  { id:3,code:"MO-POSE",name:"Pose et mise en service",category:"Installation",subcategory:"",unit:"Heure",buy:38,sell:65,tax:20,status:"Actif" },
  { id:4,code:"GM-OND100",name:"Onduleur industriel 100 kW",category:"Grand matériel",subcategory:"Panneaux photovoltaïques",unit:"Unité",buy:8420,sell:10950,tax:20,status:"Actif" },
];
const initialCostRequests = [];
const initialSuppliers = [
  { id:1,name:"Solar Distribution Ouest",contact:"Élodie Garnier",email:"devis@solar-ouest.example",phone:"02 40 00 00 01",specialty:"Panneaux photovoltaïques",status:"Actif" },
  { id:2,name:"Thermo Pro Négoce",contact:"Marc Lenoir",email:"chiffrage@thermopro.example",phone:"02 40 00 00 02",specialty:"Chauffage et climatisation",status:"Actif" },
];
const initialVisits = [
  {id:1,client:"Maison Durand",date:"2026-08-01",technician:"Karim Aït",quoteNumber:"DEV-2026-042",status:"À réaliser"},
];
const initialInstallations = [
  {id:1,client:"SCI Horizon",project:"Installation PAC + solaire",address:"La Baule",start:"2026-08-03T08:00",end:"2026-08-03T17:00",installers:["Karim Aït"],status:"Planifié",notes:"Prévoir mise en service en fin de journée"},
];
const initialInstallationTeams = [
  {id:1,name:"Équipe installation 1",leader:"Karim Aït",members:["Karim Aït"],specialty:"PAC et climatisation",status:"Active"},
];
const initialPvProjects = [
  {id:1,client:"EARL Bellevue",name:"Centrale toiture 9 kWc",annualConsumption:11000,panelPower:450,panels:20,powerKwp:9,estimatedProduction:9900,city:"Ancenis",townHallStatus:"À préparer",gridStatus:"À préparer",created:"2026-07-24"},
];
const initialBundles = [
  {id:1,name:"Pack PAC résidentiel",family:"Pompe à chaleur",items:[{code:"PAC-8KW",name:"Pompe à chaleur 8 kW",category:"Grand matériel",price:6200},{code:"PF-PAC",name:"Petite fourniture PAC",category:"Petite fourniture",price:850},{code:"INST-PAC",name:"Installation et mise en service",category:"Installation",price:2200}]},
];
const financiers=["Sans financement","Sofinco","Domofinance","Franfinance","Crédit Agricole","Autre financeur"];
const electricityOperators=[
  {id:"reseda",name:"réséda",title:"Mandat spécial de représentation pour le raccordement au réseau public de distribution d’électricité géré par réséda"},
  {id:"ume",name:"SAEML UME",title:"Mandat de représentation pour le raccordement d’un site de consommation ou de production au réseau public géré par SAEML UME"},
  {id:"ser",name:"Strasbourg Électricité Réseaux",title:"Mandat de représentation pour le raccordement d’un site de consommation ou de production au réseau public géré par Strasbourg Électricité Réseaux"},
  {id:"enedis",name:"Enedis",title:"Mandat de représentation pour le raccordement d’une installation de production au réseau public de distribution géré par Enedis"},
];
const projects = [
  {name:"Ferme de la Prairie",city:"Clisson",step:"Pose des panneaux",progress:68,date:"26 juil.",team:"Équipe Lucas",tone:"green"},
  {name:"Groupe scolaire Jules Verne",city:"Rezé",step:"Raccordement Enedis",progress:84,date:"29 juil.",team:"Équipe Karim",tone:"blue"},
  {name:"Maison Durand",city:"Pornic",step:"Visite technique",progress:24,date:"1 août",team:"Équipe Nora",tone:"orange"},
];
const permissions = roleDescriptions();
const accessModules = ACCESS_MODULES;
const roleDefaults = roleModuleDefaults();
const euro = v => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(v);

function billingTotals(document) {
  const defaultTax=Number(document?.tax??20);
  const lines=(document?.items?.length?document.items:[{name:document?.label,qty:1,unit:document?.amount||0,tax:defaultTax}]).map(item=>{
    const tax=Number(item.tax??defaultTax);
    const grossHT=Number(item.qty||0)*Number(item.unit||0);
    const grossTTC=grossHT*(1+tax/100);
    const discountValue=Math.max(0,Number(item.discountValue||0));
    const discountTTC=item.discountType==="amount"?Math.min(grossTTC,discountValue):grossTTC*Math.min(100,discountValue)/100;
    const totalTTC=Math.max(0,grossTTC-discountTTC);
    const totalHT=totalTTC/(1+tax/100);
    return {...item,tax,grossHT,grossTTC,discountTTC,totalHT,totalTTC};
  });
  const beforeGlobalTTC=lines.reduce((sum,line)=>sum+line.totalTTC,0);
  const beforeGlobalHT=lines.reduce((sum,line)=>sum+line.totalHT,0);
  const globalValue=Math.max(0,Number(document?.globalDiscountValue||0));
  const globalDiscountTTC=document?.globalDiscountType==="amount"?Math.min(beforeGlobalTTC,globalValue):beforeGlobalTTC*Math.min(100,globalValue)/100;
  const totalTTC=Math.max(0,beforeGlobalTTC-globalDiscountTTC);
  const totalHT=Math.max(0,beforeGlobalHT-globalDiscountTTC/(1+defaultTax/100));
  return {lines,beforeGlobalHT,beforeGlobalTTC,globalDiscountTTC,totalHT,totalTTC,taxAmount:totalTTC-totalHT};
}

function maintenanceEquipment(items,articles) {
  const eligible=(items||[]).map(item=>{
    const catalogue=articles.find(article=>article.code===item.code)||{};
    return {...catalogue,...item,category:item.category||catalogue.category,subcategory:item.subcategory||catalogue.subcategory,description:item.description||catalogue.description||""};
  }).filter(item=>{
    const family=String(item.subcategory||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return item.category==="Grand matériel"&&(family.includes("chauffage")||family.includes("climatisation"));
  });
  const hasHeating=eligible.some(item=>String(item.subcategory).toLowerCase().includes("chauffage"));
  const hasCooling=eligible.some(item=>String(item.subcategory).toLowerCase().includes("climatisation"));
  const family=hasHeating&&hasCooling?"Chauffage et climatisation":hasCooling?"Climatisation":hasHeating?"Chauffage":"";
  const equipment=eligible.map(item=>[
    `${item.name}${item.code?` — Réf. ${item.code}`:""}`,
    item.brand?`Marque : ${item.brand}`:"",
    item.qty?`Quantité : ${item.qty}`:"",
    item.description||""
  ].filter(Boolean).join("\n")).join("\n\n");
  return {eligible,family,equipment};
}

export default function Home() {
  const [active,setActive]=useState("Applications");
  const [menu,setMenu]=useState(false);
  const [modal,setModal]=useState("");
  const [toast,setToast]=useState("");
  const [editingBilling,setEditingBilling]=useState(null);
  const [editingProspect,setEditingProspect]=useState(null);
  const [newBillingKind,setNewBillingKind]=useState("Devis");
  const [editingUser,setEditingUser]=useState(null);
  const [editingClient,setEditingClient]=useState(null);
  const [editingArticle,setEditingArticle]=useState(null);
  const [editingBrand,setEditingBrand]=useState(null);
  const [brandLogoDraft,setBrandLogoDraft]=useState("");
  const [commercials,setCommercials]=useState([]);
  const [invitation,setInvitation]=useState(null);
  const [query,setQuery]=useState("");
  const [opps,setOpps]=useStored("mkl-prospects",opportunities);
  const [commercialAppointments,setCommercialAppointments]=useStored("mkl-commercial-appointments",initialCommercialAppointments);
  const [clients,setClients]=useStored("mkl-clients",initialClients);
  const [contracts,setContracts]=useStored("mkl-contracts",initialContracts);
  const [team,setTeam]=useStored("mkl-users",initialUsers);
  const [billing,setBilling]=useStored("mkl-billing",initialBilling);
  const [groups,setGroups]=useStored("mkl-article-groups",initialGroups);
  const [articles,setArticles]=useStored("mkl-articles",initialArticles);
  const [brands,setBrands]=useState([]);
  const [costRequests,setCostRequests]=useStored("mkl-cost-requests",initialCostRequests);
  const [suppliers,setSuppliers]=useStored("mkl-suppliers",initialSuppliers);
  const [visits,setVisits]=useStored("mkl-technical-visits",initialVisits);
  const [installations,setInstallations]=useStored("mkl-installations",initialInstallations);
  const [installationTeams,setInstallationTeams]=useStored("mkl-installation-teams",initialInstallationTeams);
  const [pvProjects,setPvProjects]=useStored("mkl-pv-projects",initialPvProjects);
  const [bundles,setBundles]=useStored("mkl-article-bundles",initialBundles);
  const [purchaseOrders,setPurchaseOrders]=useStored("mkl-purchase-orders",[]);
  const [currentProfile,setCurrentProfile]=useState(null);
  const [profileLoaded,setProfileLoaded]=useState(false);
  const currentRole=currentProfile?.role||"";
  const userName=currentProfile?.full_name||currentProfile?.email||"Utilisateur";
  const allowedModules=useMemo(
    ()=>resolveAllowedModules(currentProfile,roleDefaults),
    [currentProfile]
  );

  useEffect(()=>{
    (async () => {
      try {
        const profile = await getCurrentProfile();
        if (profile) setCurrentProfile(profile);
      } catch {}
      finally {
        setProfileLoaded(true);
      }
    })();
  },[]);

  useEffect(()=>{
    if(!profileLoaded||!currentProfile) return;
    (async()=>{
      try {
        const [clientsRes, commercialsRes, articlesRes, devisRes, brandsRes] = await Promise.all([
          authFetch("/api/clients"),
          authFetch("/api/clients/commercials"),
          authFetch("/api/articles"),
          authFetch("/api/devis"),
          authFetch("/api/brands"),
        ]);
        const clientsData = await clientsRes.json().catch(()=>({}));
        const commercialsData = await commercialsRes.json().catch(()=>({}));
        const articlesData = await articlesRes.json().catch(()=>({}));
        const devisData = await devisRes.json().catch(()=>({}));
        const brandsData = await brandsRes.json().catch(()=>({}));
        if(clientsRes.ok&&Array.isArray(clientsData.clients)) setClients(clientsData.clients);
        if(commercialsRes.ok&&Array.isArray(commercialsData.commercials)) setCommercials(commercialsData.commercials);
        if(articlesRes.ok&&Array.isArray(articlesData.articles)) setArticles(articlesData.articles);
        if(devisRes.ok&&Array.isArray(devisData.documents)) setBilling(devisData.documents);
        if(brandsRes.ok&&Array.isArray(brandsData.brands)) setBrands(brandsData.brands);
      } catch {}
    })();
  },[profileLoaded,currentProfile?.id]);

  useEffect(()=>{
    setTeam(current=>{
      const migrated=current.map(user=>{
        if(user.name==="Marie Laurent") user={...user,name:"Khaled",email:user.email==="marie@mkl-energies.fr"?"contact@mkl-energies.fr":user.email};
        const role=user.role==="Administrateur"?"Admin VIP":user.role==="Conducteur de travaux"?"Responsable technique":user.role==="Lecture"?"Admin second":user.role;
        const manager=(user.manager==="Marie Laurent"?"Khaled":user.manager)||(role==="Commercial"?"Khaled":role==="Technicien"?"Responsable technique":"Direction");
        let modules=user.modules||roleDefaults[role]||["Tableau de bord"];
        if(modules.includes("Devis & Factures")) modules=[...modules.filter(m=>m!=="Devis & Factures"),"Devis",...(["Admin VIP","Admin second"].includes(role)?["Factures"]:[])];
        const oldArticleModules=["Articles","Catégories d’articles","Groupes d’articles","Bibliothèque de groupes"];
        if(modules.some(module=>oldArticleModules.includes(module))) modules=[...modules.filter(module=>!oldArticleModules.includes(module)),"Gestion des articles"];
        return {...user,role,manager,identifier:user.identifier||user.email,modules:[...new Set(modules)],authStatus:user.authStatus||"Actif"};
      });
      return JSON.stringify(migrated)===JSON.stringify(current)?current:migrated;
    });
    setCostRequests(current=>current.map(request=>request.requester==="Marie Laurent"?{...request,requester:"Khaled"}:request));
  },[]);
  useEffect(()=>{
    setGroups(current=>{
      const mainCategories=["Grand matériel","Petite fourniture","Installation"];
      const legacyParents={"Photovoltaïque":"Grand matériel","Pompes à chaleur":"Grand matériel","Main-d’œuvre":"Installation"};
      const normalized=current.map(group=>({...group,parent:mainCategories.includes(group.name)?"":group.parent||legacyParents[group.name]||"Grand matériel"}));
      const missing=initialGroups.filter(required=>!normalized.some(group=>group.name===required.name));
      const unique=new Map([...normalized,...missing].map(group=>[group.name,group]));
      return [...unique.values()];
    });
    setArticles(current=>current.map(article=>{
      if(article.category) return article;
      const oldGroup=article.group||"";
      if(oldGroup==="Main-d’œuvre") return {...article,category:"Installation",subcategory:""};
      if(oldGroup==="Photovoltaïque") return {...article,category:"Grand matériel",subcategory:"Panneaux photovoltaïques"};
      return {...article,category:oldGroup||"Petite fourniture",subcategory:""};
    }));
  },[]);
  useEffect(()=>{
    setContracts(current=>current.map(contract=>{
      if(contract.equipment||!contract.quoteId) return contract;
      const quote=billing.find(document=>document.id===contract.quoteId);
      if(!quote) return contract;
      const maintenance=maintenanceEquipment(quote.items,articles);
      return maintenance.eligible.length?{...contract,type:`Contrat d’entretien ${maintenance.family}`,equipmentFamily:maintenance.family,equipment:maintenance.equipment}:contract;
    }));
  },[articles,billing]);
  useEffect(()=>{
    const importKey="mkl-clients-export-2026-07-24";
    if(localStorage.getItem(importKey)==="done") return;
    fetch("/clients-export.json").then(response=>{
      if(!response.ok) throw new Error("Import indisponible");
      return response.json();
    }).then(imported=>{
      setClients(current=>{
        const knownNumbers=new Set(current.map(client=>String(client.externalId||"").trim()).filter(Boolean));
        const knownEmails=new Set(current.map(client=>String(client.email||"").trim().toLowerCase()).filter(Boolean));
        const knownNames=new Set(current.map(client=>String(client.name||"").trim().toLowerCase()).filter(Boolean));
        const additions=imported.filter(client=>{
          const number=String(client.externalId||"").trim();
          const email=String(client.email||"").trim().toLowerCase();
          const name=String(client.name||"").trim().toLowerCase();
          if((number&&knownNumbers.has(number))||(email&&knownEmails.has(email))||(name&&knownNames.has(name))) return false;
          if(number) knownNumbers.add(number);
          if(email) knownEmails.add(email);
          if(name) knownNames.add(name);
          return true;
        });
        return additions.length?[...additions,...current]:current;
      });
      localStorage.setItem(importKey,"done");
    }).catch(()=>{});
  },[]);
  useEffect(()=>{
    const importKey="mkl-products-import-2026-07-24";
    if(localStorage.getItem(importKey)==="done") return;
    fetch("/products-import.json").then(response=>{
      if(!response.ok) throw new Error("Catalogue indisponible");
      return response.json();
    }).then(imported=>{
      setArticles(current=>{
        const knownCodes=new Set(current.map(article=>String(article.code||"").trim().toLowerCase()).filter(Boolean));
        const knownNames=new Set(current.map(article=>String(article.name||"").trim().toLowerCase()).filter(Boolean));
        const additions=imported.filter(article=>{
          const code=String(article.code||"").trim().toLowerCase();
          const name=String(article.name||"").trim().toLowerCase();
          if((code&&knownCodes.has(code))||(name&&knownNames.has(name))) return false;
          if(code) knownCodes.add(code);
          if(name) knownNames.add(name);
          return true;
        });
        return additions.length?[...additions,...current]:current;
      });
      localStorage.setItem(importKey,"done");
    }).catch(()=>{});
  },[]);

  const showToast = text => { setToast(text); setTimeout(()=>setToast(""),2600); };
  const filtered = useMemo(()=>opps.filter(o=>`${o.name} ${o.city} ${o.type}`.toLowerCase().includes(query.toLowerCase())),[opps,query]);

  useEffect(()=>{
    if(!profileLoaded||!allowedModules||active==="Applications") return;
    if(!canAccessNav(allowedModules,active)) {
      setActive("Applications");
      setQuery("");
      showToast("Accès refusé à cet espace.");
    }
  },[active,allowedModules,profileLoaded]);

  async function sendUserInvitation(user) {
    const response=await authFetch("/api/users/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:user.name,email:user.email,role:user.role,modules:user.modules||[],manager:user.manager||""})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"send_failed");
    return data;
  }

  async function resendInvitation(user) {
    try {
      const response=await authFetch("/api/users/resend-pin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.supabaseId||null,email:user.email,name:user.name,role:user.role,modules:user.modules||[],manager:user.manager||""})});
      const text=await response.text();
      const data=text?JSON.parse(text):{};
      if(!response.ok) throw new Error(data.error||"Le PIN n’a pas pu être renvoyé.");
      setTeam(team.map(item=>item.id===user.id?{...item,supabaseId:data.userId||item.supabaseId,authStatus:"Invitation envoyée",inviteAt:new Date().toISOString()}:item));
      showToast(`Nouveau PIN envoyé à ${user.email}`);
    } catch(error) {
      showToast(String(error?.message||"Le PIN n’a pas pu être renvoyé."));
    }
  }

  async function submit(e,type) {
    e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget)); let resultMessage="";
    if(type==="prospect") {
      const prospectId=editingProspect?.id||Date.now();
      const prospect={...editingProspect,...d,id:prospectId,value:Number(d.value||0),power:editingProspect?.power||"À définir",stage:d.stage||editingProspect?.stage||"Nouveau",owner:editingProspect?.owner||"Non affecté",color:editingProspect?.color||"#d5aa43",created:editingProspect?.created||new Date().toISOString(),updated:new Date().toISOString()};
      setOpps(editingProspect?opps.map(item=>item.id===editingProspect.id?prospect:item):[prospect,...opps]);
      setCommercialAppointments(commercialAppointments.map(item=>item.prospectId===prospectId?{...item,prospectName:d.name,city:d.city,type:d.type}:item));
      if(d.appointmentAt&&!commercialAppointments.some(item=>item.prospectId===prospectId)) setCommercialAppointments([{id:prospectId+1,prospectId,prospectName:d.name,city:d.city,type:d.type,start:d.appointmentAt,duration:Number(d.duration||60),commercial:"",manager:"",status:"À dispatcher",notes:d.notes||"",created:new Date().toISOString()},...commercialAppointments]);
      resultMessage=editingProspect?"Fiche prospect modifiée":"Prospect créé";
    }
    if(type==="client") {
      const payload={
        customerType:d.customerType,
        civilite:d.civilite,
        firstName:d.firstName,
        lastName:d.lastName,
        company:d.company,
        phone:d.phone,
        mobile:d.mobile,
        email:d.email,
        address:d.address,
        addressComplement:d.addressComplement,
        postalCode:d.postalCode,
        city:d.city,
        projectType:d.projectType,
        status:d.status,
        install:d.install,
        commercialId:d.commercialId||"",
        source:d.source,
        notes:d.notes,
        consent:d.consent==="on",
      };
      try {
        const url=editingClient?`/api/clients/${editingClient.id}`:"/api/clients";
        const method=editingClient?"PATCH":"POST";
        let response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        let data=await response.json().catch(()=>({}));
        if(response.status===409&&data.duplicates?.length){
          const summary=data.duplicates.map(item=>`${item.name||item.email} (${(item.reasons||[]).join(", ")})`).join("\n");
          if(window.confirm(`Doublon potentiel détecté :\n${summary}\n\nCréer / enregistrer quand même ?`)){
            response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,forceDuplicate:true})});
            data=await response.json().catch(()=>({}));
          } else {
            resultMessage="Création annulée (doublon)";
            setModal(""); setEditingClient(null);
            if(resultMessage) showToast(resultMessage);
            return;
          }
        }
        if(!response.ok) throw new Error(data.error||"Enregistrement client impossible");
        if(editingClient) setClients(clients.map(item=>item.id===editingClient.id?data.client:item));
        else setClients([data.client,...clients.filter(item=>item.id!==data.client.id)]);
        resultMessage=editingClient?"Fiche client modifiée":"Client créé";
      } catch(error) {
        resultMessage=String(error?.message||"Enregistrement client impossible");
        setModal(""); setEditingClient(null);
        if(resultMessage) showToast(resultMessage);
        return;
      }
    }
    if(type==="contract") setContracts([{...d,id:Date.now(),amount:Number(d.amount)},...contracts]);
    if(type==="user") {
      let user={...d,id:editingUser?.id||Date.now(),identifier:d.email,modules:JSON.parse(d.modules||"[]"),status:editingUser?.status||"Actif",authStatus:editingUser?.authStatus||"Invitation en attente",inviteAt:editingUser?.inviteAt||new Date().toISOString(),manager:d.manager||editingUser?.manager||"",supabaseId:editingUser?.supabaseId||null};
      if(!editingUser) {
        try {
          const invite=await sendUserInvitation(user);
          user={...user,id:invite.userId||user.id,supabaseId:invite.userId||user.supabaseId,authStatus:"Invitation envoyée"};
          resultMessage=`Utilisateur créé — email envoyé à ${user.email}`;
        } catch(error) {
          user={...user,authStatus:"Invitation à configurer"};
          resultMessage=String(error?.message||"Utilisateur créé — invitation non envoyée");
        }
      } else {
        if(editingUser.supabaseId) {
          try {
            const response=await authFetch(`/api/users/${editingUser.supabaseId}`,{
              method:"PATCH",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({name:user.name,role:user.role,modules:user.modules,manager:user.manager||""}),
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error||"Mise à jour utilisateur impossible");
            user={...user,role:data.user?.role||user.role,modules:data.user?.modules||user.modules};
            resultMessage="Utilisateur modifié (droits synchronisés)";
          } catch(error) {
            resultMessage=String(error?.message||"Utilisateur modifié localement — sync serveur échouée");
          }
        } else {
          resultMessage="Utilisateur modifié";
        }
      }
      setTeam(editingUser?team.map(item=>item.id===editingUser.id?user:item):[user,...team]);
    }
    if(type==="billing") {
      const isEditingExisting=Boolean(editingBilling?.id&&String(editingBilling.id).includes("-"));
      const selected=clients.find(client=>String(client.id)===String(d.clientId))||clients.find(client=>client.name===d.client)||{};
      const draft={
        ...d,
        kind:d.kind||editingBilling?.kind||newBillingKind||"Devis",
        clientId:selected.id||d.clientId||null,
        client:selected.name||d.client,
        tax:Number(d.tax),
        globalDiscountValue:Number(d.globalDiscountValue||0),
        items:JSON.parse(d.items||"[]"),
        pvStudyId:editingBilling?.pvStudyId||null,
      };
      if(!draft.clientId&&!draft.client) {
        showToast("Sélectionnez un client existant pour créer le devis.");
        return;
      }
      const totals=billingTotals(draft);
      let document={...draft,amount:totals.totalHT,totalTTC:totals.totalTTC};
      const photovoltaicItems=document.items.filter(item=>`${item.name||""} ${item.category||""} ${item.subcategory||""} ${item.code||""}`.toLowerCase().includes("photovolta"));
      if(document.kind==="Devis"&&photovoltaicItems.length&&!document.pvStudyId) {
        const customer=selected;
        const powerKwp=Number(document.pvPowerKwp||photovoltaicItems.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.powerW||0)/1000,0)||3);
        const panelPower=Number(articles.find(article=>photovoltaicItems.some(item=>item.code===article.code))?.powerW||450);
        const panels=Math.max(1,Math.round(powerKwp*1000/panelPower));
        const studyId=Date.now()+7;
        document={...document,pvStudyId:studyId,pvStudyAuto:true,pvPowerKwp:powerKwp};
        const study={id:studyId,quoteId:null,quoteNumber:document.number||"",client:document.client,clientId:document.clientId,name:`Étude solaire`,annualConsumption:Number(customer.annualConsumption||8000),panelPower,panels,powerKwp,estimatedProduction:Math.round(powerKwp*1100),roofArea:panels*2,yieldValue:1100,address:customer.address||"",postcode:customer.postalCode||"",city:customer.city||"",price:totals.totalTTC,batteryCapacity:0,electricityPrice:.194,surplusPrice:.04,selfConsumptionRate:65,townHallStatus:"À préparer",gridStatus:"À préparer",created:new Date().toISOString().slice(0,10),source:"Générée automatiquement depuis le devis"};
        setPvProjects([study,...pvProjects]);
        resultMessage="Devis photovoltaïque créé avec étude solaire MKL préremplie";
      } else if(document.kind==="Devis"&&document.pvStudyId) {
        setPvProjects(pvProjects.map(study=>study.id===document.pvStudyId?{...study,client:document.client,clientId:document.clientId,quoteNumber:document.number,powerKwp:Number(document.pvPowerKwp||study.powerKwp),price:totals.totalTTC,name:`Étude solaire — ${document.number||study.name}`} : study));
      }
      try {
        const payload={
          kind:document.kind,
          number:isEditingExisting?editingBilling.number:"",
          clientId:document.clientId,
          client:document.client,
          status:document.status,
          statusComment:document.statusComment||"",
          date:document.date,
          due:document.due,
          deliveryDate:document.deliveryDate||"",
          tax:document.tax,
          globalDiscountType:document.globalDiscountType||"percent",
          globalDiscountValue:document.globalDiscountValue||0,
          freeNote:document.freeNote||"",
          label:document.label,
          items:document.items,
          financier:document.financier||"",
          financedAmount:document.financedAmount||"",
          financeMonths:document.financeMonths||"",
          monthlyPayment:document.monthlyPayment||"",
          electricityOperator:document.electricityOperator||"",
          pvPowerKwp:document.pvPowerKwp||"",
          pvStudyId:document.pvStudyId||null,
          pvStudyAuto:Boolean(document.pvStudyAuto),
        };
        const url=isEditingExisting?`/api/devis/${editingBilling.id}`:"/api/devis";
        const method=isEditingExisting?"PATCH":"POST";
        const response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Enregistrement du document impossible");
        document=data.document;
        if(document.pvStudyId) {
          setPvProjects(current=>current.map(study=>study.id===document.pvStudyId?{...study,quoteId:document.id,quoteNumber:document.number,name:`Étude solaire — ${document.number}`,price:document.totalTTC}:study));
        }
        setBilling(current=>{
          if(isEditingExisting) return current.map(item=>item.id===editingBilling.id?document:item);
          return [document,...current.filter(item=>item.id!==document.id)];
        });
        setActive("Devis");
        resultMessage=resultMessage||(isEditingExisting?"Document modifié":`Document créé — ${document.number||""}`.trim());
      } catch(error) {
        showToast(String(error?.message||"Enregistrement du document impossible"));
        return;
      }
      if(document.kind==="Devis"&&document.status==="Accepté") {
        if(!visits.some(visit=>visit.quoteId===document.id)) setVisits([{id:Date.now()+2,quoteId:document.id,quoteNumber:document.number,client:document.client,date:"",technician:"Responsable technique",status:"Prévisite à compléter",created:new Date().toISOString(),source:"Devis validé"},...visits]);
        const majorItems=document.items.filter(item=>item.category==="Grand matériel"||articles.find(article=>article.code===item.code)?.category==="Grand matériel");
        if(majorItems.length) {
          if(!contracts.some(contract=>contract.quoteId===document.id)) {
            const maintenance=maintenanceEquipment(document.items,articles);
            if(maintenance.eligible.length) {
              const annualAmount=maintenance.eligible.reduce((sum,item)=>sum+Number(item.qty||1)*Number(item.unit||0),0);
              setContracts([{id:Date.now()+1,quoteId:document.id,quoteNumber:document.number,client:document.client,number:`ENT-${new Date().getFullYear()}-${String(contracts.length+1).padStart(3,"0")}`,type:`Contrat d’entretien ${maintenance.family}`,equipmentFamily:maintenance.family,equipment:maintenance.equipment,frequency:"Annuelle",next:"",amount:annualAmount,status:"À programmer"},...contracts]);
            }
          }
          if(!costRequests.some(request=>request.quoteId===document.id)) setCostRequests([{id:Date.now(),number:`DCF-${new Date().getFullYear()}-${String(costRequests.length+1).padStart(3,"0")}`,quoteId:document.id,quoteNumber:document.number,client:document.client,created:new Date().toISOString(),requester:"Khaled",status:"À envoyer",items:majorItems},...costRequests]);
          resultMessage="Devis validé : prévisite, chiffrage et contrat d’entretien présents";
        } else resultMessage="Devis validé — aucun article Grand matériel";
      }
    }
    if(type==="group") setGroups([{...d,id:Date.now(),margin:Number(d.margin),parent:d.parent||""},...groups]);
    if(type==="article") {
      const selectedBrand=brands.find(item=>String(item.id)===String(d.brandId||""));
      const payload={
        code:d.code,
        name:d.name,
        category:d.category,
        subcategory:d.subcategory||"",
        brandId:d.brandId||"",
        brand:selectedBrand?.name||d.brand||"",
        description:d.description||"",
        technicalDescription:d.technicalDescription||"",
        unit:d.unit,
        tax:Number(d.tax),
        buy:Number(d.buy),
        sell:Number(d.sell),
        status:d.status||"Actif",
        powerW:d.powerW?Number(d.powerW):undefined,
      };
      try {
        const url=editingArticle?`/api/articles/${editingArticle.id}`:"/api/articles";
        const method=editingArticle?"PATCH":"POST";
        const response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Enregistrement article impossible");
        if(editingArticle) setArticles(articles.map(item=>item.id===editingArticle.id?data.article:item));
        else setArticles([data.article,...articles.filter(item=>item.id!==data.article.id)]);
        resultMessage=editingArticle?"Article modifié":"Article créé";
      } catch(error) {
        resultMessage=String(error?.message||"Enregistrement article impossible");
        setModal(""); setEditingArticle(null);
        if(resultMessage) showToast(resultMessage);
        return;
      }
    }
    if(type==="brand") {
      const payload={
        name:d.name,
        logoUrl:brandLogoDraft||d.logoUrl||"",
        status:d.status||"Actif",
      };
      try {
        const url=editingBrand?`/api/brands/${editingBrand.id}`:"/api/brands";
        const method=editingBrand?"PATCH":"POST";
        const response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Enregistrement marque impossible");
        if(editingBrand) {
          setBrands(current=>current.map(item=>item.id===editingBrand.id?data.brand:item).sort((a,b)=>a.name.localeCompare(b.name,"fr")));
          if(data.brand?.name&&data.brand.name!==editingBrand.name) {
            setArticles(current=>current.map(article=>String(article.brandId)===String(editingBrand.id)?{...article,brand:data.brand.name}:article));
          }
        } else {
          setBrands(current=>[data.brand,...current.filter(item=>item.id!==data.brand.id)].sort((a,b)=>a.name.localeCompare(b.name,"fr")));
        }
        resultMessage=editingBrand?"Marque modifiée":"Marque créée";
        setBrandLogoDraft("");
      } catch(error) {
        const message=String(error?.message||"Enregistrement marque impossible");
        resultMessage=/session|SESSION_REQUIRED|reconnect/i.test(message)
          ?"Session expirée. Reconnectez-vous avec votre email et votre PIN, puis réessayez."
          :message;
        setModal(""); setEditingBrand(null);
        if(resultMessage) showToast(resultMessage);
        return;
      }
    }
    if(type==="supplier") setSuppliers([{...d,id:Date.now(),status:"Actif"},...suppliers]);
    if(type==="visit") setVisits([{...d,id:Date.now(),status:"À réaliser"},...visits]);
    if(type==="bundle") setBundles([{...d,id:Date.now(),items:JSON.parse(d.items||"[]")},...bundles]);
    setModal(""); setEditingBilling(null); setEditingProspect(null); setEditingUser(null); setEditingClient(null); setEditingArticle(null); setEditingBrand(null); showToast(resultMessage||(type==="billing"&&editingBilling?"Document modifié":type==="user"&&editingUser?"Utilisateur modifié":type==="client"&&editingClient?"Fiche client modifiée":type==="article"&&editingArticle?"Article modifié":type==="brand"&&editingBrand?"Marque modifiée":({prospect:"Prospect ajouté",client:"Client créé",contract:"Contrat créé",user:"Utilisateur invité",billing:"Document créé",group:"Groupe créé",article:"Article créé",brand:"Marque créée"}[type])));
  }

  function importCsv(file,type) {
    if(!file) return;
    const reader=new FileReader();
    reader.onload=async()=>{
      const lines=String(reader.result).replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
      if(lines.length<2) return showToast("Le fichier ne contient aucune ligne");
      const separator=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";
      const cells=line=>line.split(separator).map(v=>v.trim().replace(/^"|"$/g,""));
      const headers=cells(lines[0]).map(v=>v.toLowerCase());
      const rows=lines.slice(1).map(line=>Object.fromEntries(cells(line).map((v,i)=>[headers[i],v])));
      if(type==="article") {
        const imported=[];
        for(const [i,r] of rows.entries()){
          const payload={
            code:r.code||r.reference||`ART-${i+1}`,
            name:r.designation||r.nom||r.article||"Article importé",
            category:r.categorie||r.category||"Autre",
            subcategory:r.sous_categorie||r.subcategory||"",
            brand:r.marque||r.brand||"",
            description:r.description||"",
            unit:r.unite||r.unit||"Unité",
            buy:Number(String(r.prix_achat||r.achat||0).replace(",",".")||0),
            sell:Number(String(r.prix_vente||r.vente||0).replace(",",".")||0),
            tax:Number(String(r.tva||20).replace(",",".")||20),
            status:"Actif",
          };
          try {
            const response=await authFetch("/api/articles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
            const data=await response.json().catch(()=>({}));
            if(response.ok&&data.article) imported.push(data.article);
          } catch {}
        }
        if(imported.length) setArticles(current=>[...imported,...current.filter(item=>!imported.some(row=>row.id===item.id||row.code===item.code))]);
        showToast(imported.length?`${imported.length} article(s) importé(s)`:"Aucun article importé");
        return;
      } else if(type==="client") {
        const imported=[];
        let rejected=0;
        let duplicates=0;
        for(const [i,r] of rows.entries()){
          const firstName=r.prenom||"";
          const lastName=r.nom||"";
          const payload={
            customerType:r.type_client||r.type||"Particulier",
            firstName,
            lastName,
            company:r.entreprise||"",
            name:r.client||r.entreprise||`${firstName} ${lastName}`.trim()||`Client importé ${i+1}`,
            contact:r.contact||r.contact_principal||`${firstName} ${lastName}`.trim(),
            email:r.email||r.mail||"",
            phone:r.telephone||r.tel||"",
            mobile:r.mobile||"",
            address:r.adresse||"",
            postalCode:r.code_postal||r.cp||"",
            city:r.ville||r.commune||"",
            projectType:r.type_projet||r.projet||"",
            install:r.installation||r.projet||"",
            source:r.origine||"",
            status:r.statut||"Actif",
            notes:r.notes||r.commentaires||"",
          };
          try {
            const response=await authFetch("/api/clients",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
            const data=await response.json().catch(()=>({}));
            if(response.ok&&data.client) imported.push(data.client);
            else if(response.status===409) duplicates+=1;
            else rejected+=1;
          } catch { rejected+=1; }
        }
        if(imported.length) setClients(current=>[...imported,...current.filter(item=>!imported.some(row=>String(row.id)===String(item.id)))]);
        const details=[duplicates&&`${duplicates} doublon(s) ignoré(s)`,rejected&&`${rejected} ligne(s) refusée(s)`].filter(Boolean).join(" — ");
        showToast(imported.length
          ?`${imported.length} client(s) importé(s)${details?` — ${details}`:""}`
          :`Aucun client importé${details?` — ${details}`:""}`);
        return;
      } else setGroups([...rows.map((r,i)=>{const name=r.nom||r.categorie||"Sous-catégorie importée";return {id:Date.now()+i,code:r.code||`SCAT-${i+1}`,name,parent:["Grand matériel","Petite fourniture","Installation"].includes(name)?"":r.categorie_parent||r.parent||"Grand matériel",description:r.description||"",margin:Number((r.marge||0).replace?.(",",".")||0)}}),...groups]);
      showToast(`${rows.length} ligne${rows.length>1?"s":""} importée${rows.length>1?"s":""}`);
    };
    reader.readAsText(file,"UTF-8");
  }

  function exportExcel() {
    const rows=clients.map(c=>[c.name,c.contact,c.email,c.phone,c.city,c.install]);
    const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;");
    const table=[["Client","Contact","Email","Téléphone","Ville","Installation"],...rows]
      .map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`).join("")}</Row>`).join("");
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Clients"><Table>${table}</Table></Worksheet></Workbook>`;
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([xml],{type:"application/vnd.ms-excel"})); a.download="clients-mkl-energies.xls"; a.click(); URL.revokeObjectURL(a.href);
    showToast("Fichier clients téléchargé");
  }

  function exportFullBackup() {
    const excludedKeys=new Set(["mkl-crm-access"]);
    const data={};
    Object.keys(localStorage).filter(key=>key.startsWith("mkl-")&&!excludedKeys.has(key)).sort().forEach(key=>{
      const value=localStorage.getItem(key);
      try { data[key]=JSON.parse(value); } catch { data[key]=value; }
    });
    const backup={
      format:"MKL_CRM_BACKUP",
      version:1,
      exportedAt:new Date().toISOString(),
      data
    };
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}));
    const link=document.createElement("a");
    link.href=url;
    link.download=`sauvegarde-mkl-crm-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Sauvegarde complète téléchargée");
  }

  async function changeQuoteStatus(document, nextStatus, comment="") {
    if(!document?.id||!nextStatus||document.status===nextStatus) return;
    try {
      if(String(document.id).includes("-")) {
        const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:nextStatus,statusOnly:true,statusComment:comment||`Passage à « ${nextStatus} »`})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Changement de statut impossible");
        setBilling(current=>current.map(item=>item.id===document.id?data.document:item));
      } else {
        setBilling(current=>current.map(item=>item.id===document.id?{...item,status:nextStatus}:item));
      }
      showToast(`Statut : ${nextStatus}`);
    } catch(error) {
      showToast(String(error?.message||"Changement de statut impossible"));
    }
  }
  async function validateQuote(document) {
    const accepted={...document,status:"Accepté"};
    try {
      if(document.id&&String(document.id).includes("-")) {
        const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Accepté",statusOnly:true,statusComment:"Validation commerciale"})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Validation impossible");
        setBilling(billing.map(item=>item.id===document.id?data.document:item));
      } else {
        setBilling(billing.map(item=>item.id===document.id?accepted:item));
      }
    } catch(error) {
      showToast(String(error?.message||"Validation impossible"));
      return;
    }
    if(!visits.some(visit=>visit.quoteId===document.id)) setVisits([{id:Date.now()+2,quoteId:document.id,quoteNumber:document.number,client:document.client,date:"",technician:"Responsable technique",status:"Prévisite à compléter",created:new Date().toISOString(),source:"Devis validé"},...visits]);
    const majorItems=(document.items||[]).filter(item=>item.category==="Grand matériel"||articles.find(article=>article.code===item.code)?.category==="Grand matériel");
    if(!majorItems.length) {
      showToast("Devis validé — aucun article Grand matériel");
      return;
    }
    if(!contracts.some(contract=>contract.quoteId===document.id)) {
      const maintenance=maintenanceEquipment(document.items,articles);
      if(maintenance.eligible.length) {
        const annualAmount=maintenance.eligible.reduce((sum,item)=>sum+Number(item.qty||1)*Number(item.unit||0),0);
        setContracts([{id:Date.now()+1,quoteId:document.id,quoteNumber:document.number,client:document.client,number:`ENT-${new Date().getFullYear()}-${String(contracts.length+1).padStart(3,"0")}`,type:`Contrat d’entretien ${maintenance.family}`,equipmentFamily:maintenance.family,equipment:maintenance.equipment,frequency:"Annuelle",next:"",amount:annualAmount,status:"À programmer"},...contracts]);
      }
    }
    if(costRequests.some(request=>request.quoteId===document.id)) return showToast("Devis validé — contrat d’entretien présent et chiffrage déjà existant");
    const request={id:Date.now(),number:`DCF-${new Date().getFullYear()}-${String(costRequests.length+1).padStart(3,"0")}`,quoteId:document.id,quoteNumber:document.number,client:document.client,created:new Date().toISOString(),requester:"Khaled",status:"À envoyer",items:majorItems};
    setCostRequests([request,...costRequests]);
    showToast("Devis validé : chiffrage et contrat d’entretien générés");
  }
  async function unvalidateQuote(document) {
    try {
      if(document.id&&String(document.id).includes("-")) {
        const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Envoyé",statusOnly:true,statusComment:"Dévalidation — retour à Envoyé"})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Dévalidation impossible");
        setBilling(billing.map(item=>item.id===document.id?data.document:item));
      } else {
        setBilling(billing.map(item=>item.id===document.id?{...item,status:"Envoyé"}:item));
      }
      setVisits(visits.filter(visit=>visit.quoteId!==document.id));
      showToast("Devis dévalidé — prévisite technique associée supprimée");
    } catch(error) {
      showToast(String(error?.message||"Dévalidation impossible"));
    }
  }

  const mainAction = active==="Clients" ? ["Nouveau client","client"] : active==="Maintenance" ? ["Nouveau contrat","contract"] : active==="Devis" ? ["Nouveau devis","billing"] : active==="Factures" ? ["Nouvelle facture","billing"] : active==="Factures pro forma" ? ["Nouvelle pro forma","billing"] : active==="Fournisseurs" ? ["Nouveau fournisseur","supplier"] : active==="Articles" ? ["Nouvel article","article"] : active==="Catégories d’articles" ? ["Nouvelle sous-catégorie","group"] : active==="Bibliothèque de groupes" ? ["Nouveau groupe","bundle"] : active==="Visites techniques" ? ["Nouvelle visite","visit"] : active==="Utilisateurs" ? ["Nouvel utilisateur","user"] : ["Nouveau prospect","prospect"];
  const canViewActive=canAccessNav(allowedModules,active);
  const canBackup=canPerformAction(currentProfile,"backup");
  const canExport=canPerformAction(currentProfile,"export_clients");
  const canDelete=canPerformAction(currentProfile,"delete_appointment");
  const canDeleteClients=canPerformAction(currentProfile,"delete_clients");
  const canAssignCommercial=canAssignClientCommercial(currentProfile)||canPerformAction(currentProfile,"view_all_clients");

  return <main className="app-shell">
    <aside className={`sidebar ${menu?"open":""}`}>
      <button className="brand" type="button" onClick={()=>{setActive("Applications");setMenu(false);}} title="Retour aux applications"><img src="/mkl-energies.png" alt="MKL Énergies"/><span>ESPACE CRM</span></button>
      <button className="close-mobile" onClick={()=>setMenu(false)}><X/></button>
      <nav><p className="nav-label">ESPACE DE TRAVAIL</p>{nav.filter(([label])=>canAccessNav(allowedModules,label)).map(([label,Icon])=>
        <button className={active===label?"active":""} key={label} onClick={()=>{setActive(label);setMenu(false);setQuery("");}}><Icon size={19}/><span>{label}</span>{label==="Prospects"&&<em>34</em>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="energy-card"><Zap size={18}/><div><b>Puissance installée</b><strong>1,84 MWc</strong><span>+ 214 kWc ce mois</span></div></div>
        <div className="user"><div className="avatar">{(userName[0]||"U").toUpperCase()}</div><div><b>{userName}</b><span>{currentRole||"Profil en cours de chargement"}</span></div><MoreHorizontal size={18}/></div>
      </div>
    </aside>
    <section className="workspace">
      <header>
        <button className="menu-mobile" onClick={()=>setMenu(true)}><Menu/></button>
        <div className="header-navigation">{active!=="Applications"&&<button className="workspace-back" onClick={()=>{setActive("Applications");setQuery("");}}><ArrowLeft size={17}/><span>Applications</span></button>}<div className="search"><Search size={18}/><input placeholder={`Rechercher dans ${active.toLowerCase()}…`} value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div></div>
        <div className="header-actions"><button className="icon-btn"><Bell size={19}/><i/></button><button className="logout-button" onClick={()=>logoutCrm()}><LogOut size={17}/>Déconnexion</button></div>
      </header>
      {canViewActive&&active==="Applications" ? <Dashboard filtered={filtered} contracts={contracts} quotes={billing.filter(d=>d.kind==="Devis")} navigate={setActive} applicationsOnly allowedModules={allowedModules} canBackup={canBackup} userName={userName} onBackup={exportFullBackup}/> :
       canViewActive&&active==="Vue d’ensemble" ? <CommercialOverview navigate={setActive} allowedModules={allowedModules} userName={userName} localProspects={opps} localAppointments={commercialAppointments} canFilter={canAssignCommercial||["Direction","Admin VIP","Admin second","Secrétariat","Responsable commercial"].includes(currentRole)}/> :
       canViewActive&&active==="Prospects" ? <ProspectsView prospects={opps} appointments={commercialAppointments} setAppointments={setCommercialAppointments} query={query} onAdd={()=>{setEditingProspect(null);setModal("prospect");}} onEdit={prospect=>{setEditingProspect(prospect);setModal("prospect");}} toast={showToast}/> :
       canViewActive&&active==="Agenda commercial" ? <CommercialAgendaView appointments={commercialAppointments} setAppointments={setCommercialAppointments} prospects={opps} team={team} query={query} onAdd={()=>setModal("prospect")} toast={showToast} canDelete={canDelete}/> :
       canViewActive&&active==="Clients" ? <ClientsView clients={clients} billing={billing} contracts={contracts} visits={visits} installations={installations} pvProjects={pvProjects} query={query} canExport={canExport} canDelete={canDeleteClients} onExport={exportExcel} onImport={f=>importCsv(f,"client")} onAdd={()=>{setEditingClient(null);setModal("client");}} onEdit={client=>{setEditingClient(client);setModal("client");}} onCreateQuote={client=>{setActive("Devis");setEditingBilling({kind:"Devis",client:client.name,clientId:client.id,status:"Brouillon"});setNewBillingKind("Devis");setModal("billing");}} onDelete={async client=>{if(!window.confirm(`Supprimer ${client.name} ?`))return;try{const response=await authFetch(`/api/clients/${client.id}`,{method:"DELETE"});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Suppression impossible");setClients(clients.filter(item=>item.id!==client.id));showToast("Client supprimé");}catch(error){showToast(String(error?.message||"Suppression impossible"));}}}/> :
       canViewActive&&active==="Maintenance" ? <ContractsView contracts={contracts} setContracts={setContracts} clients={clients} setBilling={setBilling} billing={billing} query={query} onAdd={()=>setModal("contract")} toast={showToast}/> :
       canViewActive&&active==="Planning" ? <InstallationPlanningView installations={installations} setInstallations={setInstallations} installationTeams={installationTeams} clients={clients} team={team} query={query} toast={showToast} mode="agenda"/> :
       canViewActive&&active==="Chantiers" ? <InstallationPlanningView installations={installations} setInstallations={setInstallations} installationTeams={installationTeams} clients={clients} team={team} query={query} toast={showToast} mode="chantiers"/> :
       canViewActive&&active==="Équipes d’installation" ? <InstallationTeamsView teams={installationTeams} setTeams={setInstallationTeams} users={team} setUsers={setTeam} query={query} toast={showToast}/> :
       canViewActive&&active==="Photovoltaïque administratif" ? <PhotovoltaicAdminView projects={pvProjects} setProjects={setPvProjects} clients={clients} query={query} toast={showToast}/> :
       canViewActive&&active==="Visites techniques" ? <TechnicalVisitsView visits={visits} setVisits={setVisits} suppliers={suppliers} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} query={query} toast={showToast}/> :
       canViewActive&&active==="Devis" ? <BillingView kind="Devis" documents={billing.filter(d=>d.kind==="Devis")} clients={clients} query={query} onAdd={()=>{setEditingBilling(null);setNewBillingKind("Devis");setModal("billing");}} onEdit={doc=>{setEditingBilling(doc);setModal("billing");}} onValidate={validateQuote} onUnvalidate={unvalidateQuote} onStatusChange={changeQuoteStatus} toast={showToast}/> :
       canViewActive&&active==="Factures" ? <BillingView kind="Facture" documents={billing.filter(d=>d.kind==="Facture")} clients={clients} query={query} onAdd={()=>{setEditingBilling(null);setNewBillingKind("Facture");setModal("billing");}} onEdit={doc=>{setEditingBilling(doc);setModal("billing");}} onStatusChange={changeQuoteStatus} toast={showToast}/> :
       canViewActive&&active==="Factures pro forma" ? <BillingView kind="Pro forma" documents={billing.filter(d=>d.kind==="Pro forma")} clients={clients} query={query} onAdd={()=>{setEditingBilling(null);setNewBillingKind("Pro forma");setModal("billing");}} onEdit={doc=>{setEditingBilling(doc);setModal("billing");}} onStatusChange={changeQuoteStatus} toast={showToast}/> :
       canViewActive&&active==="Demandes de chiffrage" ? <CostRequestsView requests={costRequests} setRequests={setCostRequests} suppliers={suppliers} query={query} toast={showToast}/> :
       canViewActive&&active==="Fournisseurs" ? <SuppliersView suppliers={suppliers} query={query} onAdd={()=>setModal("supplier")}/> :
       canViewActive&&active==="Gestion des articles" ? <ArticleManagementView articles={articles} setArticles={setArticles} brands={brands} setBrands={setBrands} groups={groups} bundles={bundles} query={query} onAddArticle={()=>{setEditingArticle(null);setModal("article");}} onEditArticle={article=>{setEditingArticle(article);setModal("article");}} onAddBrand={()=>{setEditingBrand(null);setBrandLogoDraft("");setModal("brand");}} onEditBrand={brand=>{setEditingBrand(brand);setBrandLogoDraft(brand.logoUrl||"");setModal("brand");}} onImportArticle={f=>importCsv(f,"article")} onAddGroup={()=>setModal("bundle")} onAddCategory={()=>setModal("group")} onImportCategory={f=>importCsv(f,"group")} toast={showToast}/> :
       canViewActive&&active==="Utilisateurs" && isAdminRole(currentRole) ? <UsersView users={team} setUsers={setTeam} query={query} onAdd={()=>{setEditingUser(null);setModal("user");}} onEdit={user=>{setEditingUser(user);setModal("user");}} onInvite={resendInvitation} toast={showToast}/> :
       !canViewActive&&profileLoaded ? <AccessDenied role={currentRole}/> :
       <Placeholder title={active}/>}
    </section>
    {menu&&<div className="backdrop nav-backdrop" onClick={()=>setMenu(false)}/>}
    {modal&&<Modal type={modal} close={()=>{setModal("");setEditingBilling(null);setEditingProspect(null);setEditingUser(null);setEditingClient(null);setEditingArticle(null);setEditingBrand(null);setBrandLogoDraft("");}} submit={submit} clients={clients} billing={billing} groups={groups} articles={articles} brands={brands} bundles={bundles} team={team} commercials={commercials} canAssignCommercial={canAssignCommercial} canManageCatalog={canManageArticles(currentProfile)} editingBilling={editingBilling} editingProspect={editingProspect} editingUser={editingUser} editingClient={editingClient} editingArticle={editingArticle} editingBrand={editingBrand} brandLogoDraft={brandLogoDraft} onBrandLogoDraft={setBrandLogoDraft} defaultBillingKind={newBillingKind}/>}
    {invitation&&<InvitationModal user={invitation} close={()=>setInvitation(null)} toast={showToast}/>}
    {toast&&<div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </main>;
}

function CommercialOverview({navigate,allowedModules=null,userName="Utilisateur",localProspects=[],localAppointments=[],canFilter=false}) {
  const [metrics,setMetrics]=useState(null);
  const [commercials,setCommercials]=useState([]);
  const [filters,setFilters]=useState({from:"",to:"",commercialId:"",activity:"",agency:"MKL Énergies"});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [scope,setScope]=useState("self");

  async function loadDashboard(nextFilters=filters) {
    setLoading(true);
    setError("");
    try {
      const params=new URLSearchParams();
      if(nextFilters.from) params.set("from",nextFilters.from);
      if(nextFilters.to) params.set("to",nextFilters.to);
      if(nextFilters.commercialId) params.set("commercialId",nextFilters.commercialId);
      if(nextFilters.activity) params.set("activity",nextFilters.activity);
      if(nextFilters.agency) params.set("agency",nextFilters.agency);
      const response=await authFetch(`/api/dashboard/commercial?${params.toString()}`);
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Chargement impossible");
      const localOverlay={
        prospectsCount:Math.max(Number(data.metrics?.prospectsCount||0),localProspects.length),
        upcomingAppointmentsCount:Math.max(
          Number(data.metrics?.upcomingAppointmentsCount||0),
          localAppointments.filter(item=>{
            const start=item.start?new Date(item.start).getTime():0;
            return start>Date.now()&&!["Annulé","Réalisé"].includes(item.status);
          }).length
        ),
      };
      setMetrics({...data.metrics,...localOverlay});
      setCommercials(data.commercials||[]);
      setScope(data.scope||"self");
      if(data.filters) {
        setFilters(current=>({
          ...current,
          from:data.filters.from||current.from,
          to:data.filters.to||current.to,
          commercialId:data.filters.commercialId||"",
          activity:data.filters.activity||"",
          agency:data.filters.agency||"MKL Énergies",
        }));
      }
    } catch(caught) {
      setError(String(caught?.message||"Chargement impossible"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ loadDashboard(); },[localProspects.length,localAppointments.length]);

  function updateFilter(key,value) {
    const next={...filters,[key]:value};
    setFilters(next);
    loadDashboard(next);
  }

  const scopeLabel=scope==="organization"?"Organisation":scope==="team"?"Équipe":"Mes résultats";

  return <div className="content commercial-dashboard">
    <div className="welcome">
      <div>
        <p>TABLEAU DE BORD COMMERCIAL</p>
        <h1>Bonjour {userName.split(" ")[0]}, <span>voici vos indicateurs.</span></h1>
        <small className="dashboard-scope">{scopeLabel}</small>
      </div>
    </div>
    {canFilter&&<div className="dashboard-filters">
      <label>Commercial
        <select value={filters.commercialId} onChange={e=>updateFilter("commercialId",e.target.value)}>
          <option value="">Tous (périmètre)</option>
          {commercials.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
      <label>Du<input type="date" value={filters.from} onChange={e=>updateFilter("from",e.target.value)}/></label>
      <label>Au<input type="date" value={filters.to} onChange={e=>updateFilter("to",e.target.value)}/></label>
      <label>Activité
        <select value={filters.activity} onChange={e=>updateFilter("activity",e.target.value)}>
          <option value="">Toutes</option>
          <option>Photovoltaïque</option>
          <option>Pompe à chaleur</option>
          <option>Climatisation</option>
          <option>Maintenance</option>
        </select>
      </label>
      <label>Agence
        <select value={filters.agency} onChange={e=>updateFilter("agency",e.target.value)}>
          <option>MKL Énergies</option>
          <option value="Toutes">Toutes</option>
        </select>
      </label>
    </div>}
    {loading&&<div className="dashboard-loading">Chargement des indicateurs…</div>}
    {error&&<div className="quote-alerts"><AlertTriangle size={20}/><div><b>Tableau de bord</b><span>{error}</span></div></div>}
    {metrics&&<>
      {metrics.devisARelancerCount>0&&canAccessNav(allowedModules,"Devis")&&<section className="quote-alerts"><AlertTriangle size={20}/><div><b>{metrics.devisARelancerCount} devis à relancer</b><span>{(metrics.devisARelancer||[]).slice(0,3).map(q=>`${q.number} — ${q.client}`).join(" • ")}</span></div><button onClick={()=>navigate("Devis")}>Voir les devis</button></section>}
      <div className="kpis commercial-kpis">
        <Kpi icon={Users} title="Prospects" value={String(metrics.prospectsCount)} note="pipeline" sub="actifs / suivis" tone="blue"/>
        <Kpi icon={CalendarDays} title="RDV à venir" value={String(metrics.upcomingAppointmentsCount)} note="agenda" sub="prochains" tone="green"/>
        <Kpi icon={FileText} title="Devis en cours" value={String(metrics.devisEnCoursCount)} note={euro(metrics.pipelineValue||0)} sub="pipeline devis" tone="sun"/>
        <Kpi icon={AlertTriangle} title="À relancer" value={String(metrics.devisARelancerCount)} note="suivi" sub="actions urgentes" tone="clay"/>
        <Kpi icon={CheckCircle2} title="Devis acceptés" value={String(metrics.devisAcceptesCount)} note={`${metrics.tauxTransformation}%`} sub="taux transformation" tone="green"/>
        <Kpi icon={Euro} title="CA signé" value={euro(metrics.caSigne||0)} note="acceptés" sub="période filtrée" tone="sun"/>
      </div>
      <div className="grid-main">
        <section className="panel reminders">
          <PanelHead title="Prochaines actions" sub={`${(metrics.prochainesActions||[]).length} priorités`} link="Agenda"/>
          <div className="reminder-list">
            {(metrics.prochainesActions||[]).length===0&&<div className="empty">Aucune action prioritaire pour le moment.</div>}
            {(metrics.prochainesActions||[]).map((action,index)=><button type="button" className="reminder action-row" key={`${action.type}-${index}`} onClick={()=>navigate(action.href||"Devis")}>
              <CircleDashed size={20}/>
              <div className="rem-icon">{action.type==="rendez_vous"?<CalendarDays size={17}/>:<FileText size={17}/>}</div>
              <div><b>{action.title}</b><span>{action.detail}</span></div>
              <time>{action.date?new Date(action.date).toLocaleDateString("fr-FR"):"—"}</time>
            </button>)}
          </div>
        </section>
        <section className="panel">
          <PanelHead title="Conversion" sub="Acceptés vs refusés" link="Devis"/>
          <div className="conversion-block">
            <div><small>Taux de transformation</small><b>{metrics.tauxTransformation} %</b></div>
            <div><small>Devis acceptés</small><b>{metrics.devisAcceptesCount}</b></div>
            <div><small>Clients suivis</small><b>{metrics.clientsCount}</b></div>
            <div><small>Pipeline devis TTC</small><b>{euro(metrics.pipelineValue||0)}</b></div>
          </div>
          <div className="dashboard-quick-links">
            {canAccessNav(allowedModules,"Prospects")&&<button type="button" onClick={()=>navigate("Prospects")}>Prospects</button>}
            {canAccessNav(allowedModules,"Agenda commercial")&&<button type="button" onClick={()=>navigate("Agenda commercial")}>Agenda</button>}
            {canAccessNav(allowedModules,"Devis")&&<button type="button" onClick={()=>navigate("Devis")}>Devis</button>}
            {canAccessNav(allowedModules,"Clients")&&<button type="button" onClick={()=>navigate("Clients")}>Clients</button>}
          </div>
        </section>
      </div>
    </>}
  </div>;
}

function Dashboard({filtered,contracts,quotes,navigate,applicationsOnly=false,onBackup,allowedModules=null,userName="Utilisateur",canBackup=false}) {
  const [selectedFamily,setSelectedFamily]=useState(null);
  const activityTargets={Devis:"Devis",Client:"Clients",Maintenance:"Maintenance",Chiffrage:"Demandes de chiffrage",Planning:"Planning"};
  const families=[
    {name:"Relations clients",icon:Users,color:"#2f9ed2",sub:"Prospects, clients et documents",apps:[["Prospects",Users,"Pipeline commercial"],["Agenda commercial",CalendarDays,"Rendez-vous et répartition"],["Clients",Building2,"Fiches et coordonnées"]]},
    {name:"Commercial",icon:FileText,color:"#ef8e24",sub:"Devis et chiffrage",apps:[["Devis",FileText,"Offres commerciales"],["Demandes de chiffrage",ClipboardList,"Consultations fournisseurs"],["Factures pro forma",BadgeEuro,"Documents préparatoires"]]},
    {name:"Administration",icon:ReceiptText,color:"#79a214",sub:"Facturation et démarches",apps:[["Factures",ReceiptText,"Factures clients"],["Factures pro forma",BadgeEuro,"Pro forma"],["Photovoltaïque administratif",Zap,"Dimensionnement, mairie et raccordement"],["Maintenance",Wrench,"Contrats d’entretien"]]},
    {name:"Opérations",icon:HardHat,color:"#d84b3d",sub:"Terrain, équipes et planning",apps:[["Chantiers",HardHat,"Suivi des travaux"],["Planning",CalendarCheck,"Agenda des équipes"],["Équipes d’installation",Users,"Créer et organiser les équipes"],["Visites techniques",Eye,"Prévisites et validations"],["Maintenance",Wrench,"Rapports d’intervention"]]},
    {name:"Catalogue",icon:Package,color:"#8d623b",sub:"Articles, groupes et fournisseurs",apps:[["Gestion des articles",Package,"Articles, tarifs et groupes"],["Fournisseurs",Truck,"Annuaire fournisseurs"]]},
    {name:"Pilotage",icon:TrendingUp,color:"#8f9395",sub:"Activité et indicateurs",apps:[["Vue d’ensemble",LayoutDashboard,"Tableau de bord"],["Prospects",TrendingUp,"Analyse du pipeline"],["Chantiers",HardHat,"Activité opérationnelle"]]},
    {name:"Configuration",icon:ShieldCheck,color:"#4b5d84",sub:"Équipe et droits d’accès",apps:[["Utilisateurs",ShieldCheck,"Comptes et autorisations"]]},
  ].map(family=>({...family,apps:family.apps.filter(([label])=>canAccessNav(allowedModules,label))})).filter(family=>family.apps.length>0);
  const currentFamily=families.find(family=>family.name===selectedFamily);
  const recentActivity=[["Devis","DEV-2026-042 modifié","Il y a 10 min",FileText],["Client","SCI Horizon consulté","Aujourd’hui",Building2],["Maintenance","Rapport EARL Bellevue","Aujourd’hui",Wrench],["Chiffrage","Demande fournisseur créée","Hier",ClipboardList],["Planning","Visite technique programmée","Hier",CalendarCheck]].filter(([type])=>canAccessNav(allowedModules,activityTargets[type]||type));
  const launcher=<section className="workspace-launcher">
    <div className="workspace-launcher-main">
      <div className="workspace-launcher-head"><div><p>ESPACE DE TRAVAIL</p><h2>{currentFamily?.name||"Mes applications"}</h2><span>{currentFamily?.sub||"Choisissez un espace pour commencer"}</span></div>{currentFamily&&<button onClick={()=>setSelectedFamily(null)}><ChevronRight size={15}/>Retour aux espaces</button>}</div>
      {!currentFamily?<div className="family-grid">{families.map(({name,icon:Icon,color,sub,apps})=><button className="family-tile" key={name} onClick={()=>setSelectedFamily(name)} style={{"--family-color":color}}><span className="family-icon"><Icon size={38}/></span><b>{name}</b><small>{sub}</small><em>{apps.length} application{apps.length>1?"s":""}</em></button>)}</div>:
      <div className="family-app-grid">{currentFamily.apps.map(([label,Icon,sub],index)=><button key={`${label}-${index}`} className="family-app" onClick={()=>navigate(label)} style={{"--family-color":currentFamily.color}}><span><Icon size={31}/></span><b>{label}</b><small>{sub}</small></button>)}</div>}
    </div>
    <aside className="recent-activity"><div><Clock3 size={16}/><h3>Dernières actions</h3></div>{recentActivity.map(([type,label,time,Icon])=><button key={label} onClick={()=>navigate(activityTargets[type]||type)}><i><Icon size={13}/></i><span><b>{label}</b><small>{time}</small></span></button>)}</aside>
  </section>;
  if(applicationsOnly) return <div className="content applications-home"><div className="applications-home-head"><div><p>BIENVENUE DANS MKL ÉNERGIES</p><h1>Mes applications</h1><span>Choisissez votre espace de travail</span></div><div className="applications-home-actions">{canBackup&&<button className="backup-button" onClick={onBackup}><Download size={18}/><span><b>Sauvegarde complète</b><small>Clients, utilisateurs et essais</small></span></button>}{canAccessNav(allowedModules,"Vue d’ensemble")&&<button onClick={()=>navigate("Vue d’ensemble")}><LayoutDashboard size={18}/><span><b>Vue d’ensemble</b><small>Indicateurs commerciaux réels</small></span><ChevronRight size={16}/></button>}</div></div>{launcher}</div>;
  return <CommercialOverview navigate={navigate} allowedModules={allowedModules} userName={userName}/>;
}

function ModuleTop({eyebrow,title,sub,children}) { return <div className="module-content"><div className="module-top"><div><p>{eyebrow}</p><h1>{title}</h1><span>{sub}</span></div><div className="module-actions">{children}</div></div></div>; }
function ProspectsView({prospects,appointments,setAppointments,query,onAdd,onEdit,toast}) {
  const [planning,setPlanning]=useState(null);
  const list=prospects.filter(p=>Object.values(p).join(" ").toLowerCase().includes(query.toLowerCase()));
  function schedule(event) {
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    setAppointments([{...data,id:Date.now(),prospectId:planning.id,prospectName:planning.name,city:planning.city,type:planning.type,duration:Number(data.duration||60),commercial:"",manager:"",status:"À dispatcher",created:new Date().toISOString()},...appointments]);
    setPlanning(null);
    toast("Rendez-vous ajouté à l’agenda commercial");
  }
  return <><ModuleTop eyebrow="CONFIDENTIEL" title="Prospects" sub={`${list.length} prospects — cliquez sur le crayon pour modifier la fiche`}><button className="primary" onClick={onAdd}><Plus size={17}/>Créer un prospect</button><div className="data-panel secure-list prospect-table" onContextMenu={e=>e.preventDefault()}><div className="data-row data-head"><span>PROSPECT</span><span>COORDONNÉES</span><span>VILLE / PROJET</span><span>ÉTAPE</span><span>COMMERCIAL</span><span>ACTIONS</span></div>{list.map((p,i)=>{const planned=appointments.find(item=>item.prospectId===p.id);return <div className="data-row" key={p.id||`${p.name}-${i}`}><b>{p.name}</b><span><b>{p.phone||"Téléphone à compléter"}</b><small>{p.email}</small></span><span><b>{p.city}</b><small>{p.type}</small></span><span className="status wait">{p.stage}</span><span>{p.owner||"Non affecté"}</span><div className="prospect-actions"><button className="edit-user" onClick={()=>onEdit(p)} title="Modifier la fiche prospect"><Pencil size={15}/></button><button className={planned?"agenda-planned":"agenda-add"} onClick={()=>setPlanning(p)}><CalendarDays size={15}/>{planned?"Replanifier":"Planifier"}</button></div></div>})}</div></ModuleTop>{planning&&<div className="backdrop"><div className="modal commercial-planning-modal"><button className="modal-close" onClick={()=>setPlanning(null)}><X/></button><div className="modal-icon"><CalendarDays/></div><h2>Planifier le rendez-vous</h2><p>{planning.name} — {planning.city}</p><form onSubmit={schedule}><label>Date et heure<input name="start" type="datetime-local" required/></label><div className="form-row"><label>Durée<select name="duration"><option value="30">30 minutes</option><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Type de rendez-vous<select name="appointmentType"><option>Visite commerciale</option><option>Appel téléphonique</option><option>Visioconférence</option><option>Relance</option></select></label></div><label>Consignes<textarea name="notes" rows="3" placeholder="Besoins du prospect, documents à prévoir…"/></label><button className="primary submit" type="submit"><CalendarDays size={17}/>Ajouter à l’agenda</button></form></div></div>}</>;
}

function CommercialAgendaView({appointments,setAppointments,prospects,team,query,onAdd,toast,canDelete}) {
  const [viewMode,setViewMode]=useState("month");
  const [visibleMonth,setVisibleMonth]=useState(()=>new Date());
  const commercials=team.filter(user=>user.role==="Commercial"&&user.status!=="Inactif");
  const managers=team.filter(user=>["Responsable commercial","Admin VIP"].includes(user.role)&&user.status!=="Inactif");
  const list=appointments.filter(item=>Object.values(item).join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  const update=(item,changes,message)=>{setAppointments(appointments.map(current=>current.id===item.id?{...current,...changes,updated:new Date().toISOString()}:current));toast(message);};
  const remove=item=>{if(!canDelete)return toast("Suppression réservée à l’Admin VIP");if(window.confirm(`Supprimer le rendez-vous de ${item.prospectName} ?`)){setAppointments(appointments.filter(current=>current.id!==item.id));toast("Rendez-vous supprimé");}};
  const dateLabel=value=>value?new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(new Date(value)):"À planifier";
  const timeLabel=value=>value?new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"";
  const calendarStart=new Date(visibleMonth);calendarStart.setDate(1-((calendarStart.getDay()+6)%7));
  const calendarDays=Array.from({length:42},(_,index)=>{const date=new Date(calendarStart);date.setDate(calendarStart.getDate()+index);return date;});
  const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const monthLabel=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(visibleMonth);
  const todayKey=dateKey(new Date());
  const weekStart=new Date(visibleMonth);weekStart.setDate(visibleMonth.getDate()-((visibleMonth.getDay()+6)%7));
  const weekDays=Array.from({length:7},(_,index)=>{const date=new Date(weekStart);date.setDate(weekStart.getDate()+index);return date;});
  const hours=Array.from({length:13},(_,index)=>index+7);
  const periodLabel=viewMode==="month"?monthLabel:viewMode==="week"?`${new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short"}).format(weekDays[0])} — ${new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",year:"numeric"}).format(weekDays[6])}`:new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(visibleMonth);
  const shiftPeriod=direction=>setVisibleMonth(current=>{const next=new Date(current);if(viewMode==="month")next.setMonth(next.getMonth()+direction);else if(viewMode==="week")next.setDate(next.getDate()+7*direction);else next.setDate(next.getDate()+direction);return next;});
  const eventButton=item=><button className={!item.commercial?"needs-dispatch":item.status==="Réalisé"?"done":""} key={item.id} title={`${item.prospectName} — ${item.commercial||"À dispatcher"}`} onClick={()=>setViewMode("list")}><time>{timeLabel(item.start)}</time><b>{item.prospectName}</b><small>{item.commercial||"À dispatcher"}</small></button>;
  return <ModuleTop eyebrow="PILOTAGE COMMERCIAL" title="Agenda commercial" sub={`${list.length} rendez-vous — dispatch par le responsable commercial`}><button className="primary agenda-create" onClick={onAdd}><Plus size={17}/>Nouveau prospect</button><div className="commercial-agenda-kpis"><div><CalendarDays/><span><b>{list.length}</b>rendez-vous</span></div><div><CircleDashed/><span><b>{list.filter(item=>!item.commercial).length}</b>à dispatcher</span></div><div><Users/><span><b>{commercials.length}</b>commerciaux disponibles</span></div></div><section className="commercial-calendar"><header><div className="calendar-navigation"><button onClick={()=>shiftPeriod(-1)}><ChevronLeft size={17}/></button><h2>{periodLabel}</h2><button onClick={()=>shiftPeriod(1)}><ChevronRight size={17}/></button><button className="calendar-today" onClick={()=>setVisibleMonth(new Date())}>Aujourd’hui</button></div><div className="calendar-view-switch"><button className={viewMode==="month"?"active":""} onClick={()=>setViewMode("month")}><CalendarDays size={15}/>Mois</button><button className={viewMode==="week"?"active":""} onClick={()=>setViewMode("week")}><CalendarDays size={15}/>Semaine</button><button className={viewMode==="day"?"active":""} onClick={()=>setViewMode("day")}><Clock3 size={15}/>Jour</button><button className={viewMode==="list"?"active":""} onClick={()=>setViewMode("list")}><FileText size={15}/>Dispatch</button></div></header>{viewMode==="month"&&<div className="month-calendar"><div className="calendar-weekdays">{["Lun.","Mar.","Mer.","Jeu.","Ven.","Sam.","Dim."].map(day=><b key={day}>{day}</b>)}</div><div className="calendar-month-grid">{calendarDays.map(day=>{const key=dateKey(day);const dayEvents=list.filter(item=>item.start&&dateKey(new Date(item.start))===key);return <div className={`calendar-day ${day.getMonth()!==visibleMonth.getMonth()?"outside":""} ${key===todayKey?"today":""}`} key={key}><span>{day.getDate()}</span><div>{dayEvents.map(eventButton)}</div></div>})}</div></div>}{viewMode==="week"&&<div className="week-calendar"><div className="week-calendar-grid">{weekDays.map(day=>{const key=dateKey(day);const events=list.filter(item=>item.start&&dateKey(new Date(item.start))===key);return <section className={key===todayKey?"today":""} key={key}><header><b>{new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(day)}</b><span>{day.getDate()}</span></header><div>{events.length?events.map(eventButton):<small>Aucun rendez-vous</small>}</div></section>})}</div></div>}{viewMode==="day"&&<div className="day-calendar"><header><b>{new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(visibleMonth)}</b></header>{hours.map(hour=>{const events=list.filter(item=>{const date=new Date(item.start);return item.start&&dateKey(date)===dateKey(visibleMonth)&&date.getHours()===hour;});return <div className="day-hour" key={hour}><time>{String(hour).padStart(2,"0")}:00</time><section>{events.map(eventButton)}</section></div>})}</div>}</section>{viewMode==="list"&&<div className="commercial-agenda-list">{list.length===0&&<div className="empty">Aucun rendez-vous commercial planifié.</div>}{list.map(item=>{const prospect=prospects.find(p=>p.id===item.prospectId);return <article className={`commercial-appointment ${!item.commercial?"unassigned":""}`} key={item.id}><div className="commercial-appointment-date"><b>{dateLabel(item.start)}</b><span>{timeLabel(item.start)} · {item.duration||60} min</span></div><div className="commercial-appointment-prospect"><span className="appointment-state">{item.status}</span><h3>{item.prospectName}</h3><p><MapPin size={13}/>{item.city||prospect?.city} · {item.type||prospect?.type}</p>{item.notes&&<small>{item.notes}</small>}</div><div className="commercial-dispatch"><label>Responsable<select value={item.manager||""} onChange={event=>update(item,{manager:event.target.value},"Responsable commercial enregistré")}><option value="">Non renseigné</option>{managers.map(user=><option key={user.id}>{user.name}</option>)}</select></label><label>Dispatcher au commercial<select value={item.commercial||""} onChange={event=>update(item,{commercial:event.target.value,status:event.target.value?"Affecté":"À dispatcher"},"Rendez-vous affecté au commercial")}><option value="">À dispatcher</option>{commercials.map(user=><option key={user.id}>{user.name}</option>)}</select></label></div><div className="commercial-appointment-actions"><select value={item.status} onChange={event=>update(item,{status:event.target.value},"Statut du rendez-vous modifié")}><option>À dispatcher</option><option>Affecté</option><option>Confirmé</option><option>Réalisé</option><option>Reporté</option><option>Annulé</option></select>{canDelete&&<button onClick={()=>remove(item)} title="Supprimer — Admin VIP uniquement"><Trash2 size={16}/></button>}</div></article>})}</div>}</ModuleTop>;
}
function sameClient(doc,client) {
  if(!doc||!client) return false;
  if(doc.clientId!=null&&client.id!=null&&String(doc.clientId)===String(client.id)) return true;
  return Boolean(doc.client&&client.name&&doc.client===client.name);
}
function ClientsView({clients,billing=[],contracts=[],visits=[],installations=[],pvProjects=[],query,canExport,canDelete=false,onExport,onImport,onAdd,onEdit,onCreateQuote,onDelete}) {
  const [selectedClient,setSelectedClient]=useState(null);
  const list=clients.filter(c=>Object.values(c).join(" ").toLowerCase().includes(query.toLowerCase()));
  return <><ModuleTop eyebrow="BASE CLIENTS CONFIDENTIELLE" title="Clients" sub={`${clients.length} fiche${clients.length!==1?"s":""} — scoping commercial actif`}>{canExport&&<><ImportButton onImport={onImport}/><button className="secondary" onClick={onExport}><FileSpreadsheet size={17}/>Exporter Excel</button></>}<button className="primary" onClick={onAdd}><Plus size={17}/>Nouveau client</button><div className="data-panel secure-list clients-table" onContextMenu={e=>e.preventDefault()}><div className="data-row data-head"><span>CLIENT</span><span>CONTACT</span><span>COORDONNÉES</span><span>ADRESSE</span><span>PROJET</span><span>STATUT</span></div>{list.map(c=><button type="button" className="data-row client-row-button" key={c.id} onClick={()=>setSelectedClient(c)}><div className="entity"><i>{c.name?.[0]||"C"}</i><span><b>{c.name}</b><small>{c.customerType||"Client"}</small></span></div><span>{c.contact||`${c.firstName||""} ${c.lastName||""}`.trim()}</span><span><b>{c.email||"—"}</b><small>{c.mobile||c.phone||"—"}</small></span><span><b>{c.address||"Adresse à compléter"}</b><small>{c.postalCode} {c.city}</small></span><span><b>{c.projectType||c.install||"À définir"}</b><small>{c.owner||"Non affecté"}</small></span><span className={`status ${c.status==="Client"?"ok":"wait"}`}>{c.status||"Prospect"}</span></button>)}</div>{canExport&&<div className="import-help"><ShieldCheck size={18}/><div><b>Accès Admin VIP</b><span>Import et export réservés au super administrateur.</span></div></div>}</ModuleTop>{selectedClient&&<ClientRecord client={selectedClient} billing={billing} contracts={contracts} visits={visits} installations={installations} pvProjects={pvProjects} canDelete={canDelete} onEdit={()=>{onEdit?.(selectedClient);setSelectedClient(null);}} onCreateQuote={()=>{onCreateQuote?.(selectedClient);setSelectedClient(null);}} onDelete={()=>{onDelete?.(selectedClient);setSelectedClient(null);}} onClose={()=>setSelectedClient(null)}/>}</>;
}
function ClientRecord({client,billing,contracts,visits,installations,pvProjects,canDelete=false,onEdit,onCreateQuote,onDelete,onClose}) {
  const docs=[
    ...billing.filter(d=>sameClient(d,client)).map(d=>({id:`b-${d.id}`,kind:d.kind||"Document",title:d.number,detail:d.label,date:d.date,status:d.status,href:d.pvStudyId?`/pv-study?id=${d.pvStudyId}`:null})),
    ...pvProjects.filter(d=>sameClient(d,client)).map(d=>({id:`pv-${d.id}`,kind:"Étude photovoltaïque",title:d.number||`ETUDE-PV-${d.id}`,detail:d.project||d.power,date:d.createdAt||d.date,status:d.status,href:`/pv-study?id=${d.id}`})),
    ...visits.filter(d=>sameClient(d,client)).map(d=>({id:`v-${d.id}`,kind:"Prévisite technique",title:d.number||`PRE-${d.id}`,detail:d.project||d.quoteNumber,date:d.date,status:d.status,href:`/previsite?id=${d.id}`})),
    ...contracts.filter(d=>sameClient(d,client)).map(d=>({id:`c-${d.id}`,kind:"Contrat d’entretien",title:d.number,detail:d.type,date:d.createdAt||d.next,status:d.status,href:`/maintenance-contract?id=${d.id}`})),
    ...installations.filter(d=>sameClient(d,client)).map(d=>({id:`i-${d.id}`,kind:"Chantier / installation",title:d.number||`CHANTIER-${d.id}`,detail:d.type||d.project,date:d.date||d.start,status:d.status}))
  ].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  return <div className="client-record-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="client-record"><header className="client-record-head"><div className="client-record-avatar">{client.name?.[0]||"C"}</div><div><small>FICHE CLIENT</small><h2>{client.name}</h2><span>{client.customerType||"Client"} • {client.status||"Prospect"}</span></div><div className="client-record-actions">{onCreateQuote&&<button type="button" className="primary" onClick={onCreateQuote}><FileText size={16}/>Créer un devis</button>}{onEdit&&<button type="button" className="secondary" onClick={onEdit}><Pencil size={16}/>Modifier</button>}{canDelete&&onDelete&&<button type="button" className="trash" onClick={onDelete}><Trash2 size={16}/></button>}<button type="button" aria-label="Fermer" onClick={onClose}><X size={20}/></button></div></header><div className="client-record-info"><div><UserRound/><span><small>Contact</small><b>{client.civilite?`${client.civilite} `:""}{client.contact||`${client.firstName||""} ${client.lastName||""}`.trim()||"À compléter"}</b></span></div><div><Phone/><span><small>Téléphone</small><b>{client.mobile||client.phone||"À compléter"}</b></span></div><div><Mail/><span><small>Email</small><b>{client.email||"À compléter"}</b></span></div><div><MapPin/><span><small>Adresse</small><b>{client.address||"À compléter"}{client.addressComplement?`, ${client.addressComplement}`:""} {client.postalCode} {client.city}</b></span></div><div><HardHat/><span><small>Projet</small><b>{client.projectType||client.install||"À définir"}</b></span></div><div><UserRound/><span><small>Responsable</small><b>{client.owner||"Non affecté"}</b></span></div></div><div className="client-document-head"><FileText/><span><b>Documents du client</b><small>{docs.length} document{docs.length!==1?"s":""} associé{docs.length!==1?"s":""}</small></span></div><div className="client-documents">{docs.length===0&&<div className="quote-empty"><FileText size={20}/><span>Aucun document associé pour le moment.</span></div>}{docs.map(d=>{const body=<><FileText size={18}/><span><small>{d.kind}</small><b>{d.title||"Document sans numéro"}</b><em>{d.detail||"Document client"}{d.date?` • ${new Date(d.date).toLocaleDateString("fr-FR")}`:""}</em></span><i className="status wait">{d.status||"Disponible"}</i>{d.href&&<Eye size={17}/>}</>;return d.href?<a key={d.id} href={d.href} target="_blank" rel="noreferrer">{body}</a>:<div className="client-doc-no-link" key={d.id}>{body}</div>;})}</div></section></div>;
}
function ContractsView({contracts,setContracts,clients,billing,setBilling,query,onAdd,toast}) {
  const list=contracts.filter(c=>Object.values(c).join(" ").toLowerCase().includes(query.toLowerCase()));
  async function complete(contract) {
    const client=clients.find(c=>c.name===contract.client);
    if(!client?.email) return toast("Renseignez d’abord l’adresse email du client");
    const proforma={id:Date.now(),kind:"Pro forma",number:`PRO-${new Date().getFullYear()}-${String(billing.filter(d=>d.kind==="Pro forma").length+1).padStart(3,"0")}`,client:contract.client,clientEmail:client.email,date:new Date().toISOString().slice(0,10),due:new Date(Date.now()+15*86400000).toISOString().slice(0,10),label:contract.type,amount:Number(contract.amount),tax:20,status:"Envoyée",items:[{name:contract.type,qty:1,unit:Number(contract.amount)}]};
    setBilling([proforma,...billing]); setContracts(contracts.map(c=>c.id===contract.id?{...c,status:"Entretien terminé — réglé"}:c));
    try {
      const response=await authFetch("/api/proforma/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client,proforma})});
      const payload=await response.json();
      toast(response.ok?"Pro forma générée et envoyée au client":`Pro forma générée — ${payload.error}`);
    } catch { toast("Pro forma générée — service email indisponible"); }
  }
  return <ModuleTop eyebrow="SERVICE APRÈS-VENTE" title="Contrats d’entretien" sub={`${contracts.length} contrats • ${contracts.filter(c=>c.status==="Actif").length} actifs`}>
    <a className="secondary maintenance-form-action" href="/maintenance-form"><Wrench size={17}/>Nouveau rapport de maintenance</a>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Nouveau contrat</button>
    <div className="mini-kpis"><div><Wrench/><span><b>{contracts.length}</b>contrats</span></div><div><CalendarCheck/><span><b>2</b>échéances proches</span></div><div><RefreshCw/><span><b>{euro(contracts.reduce((s,c)=>s+c.amount,0))}</b>revenu annuel</span></div></div>
    <div className="data-panel contracts-table"><div className="data-row data-head"><span>CLIENT / CONTRAT</span><span>PRESTATION</span><span>PÉRIODICITÉ</span><span>PROCHAINE VISITE</span><span>MONTANT</span><span>STATUT / ACTION</span></div>
      {list.map(c=><div className="data-row" key={c.id}><span><b>{c.client}</b><small>{c.number}{c.quoteNumber?` • ${c.quoteNumber}`:""}</small></span><span>{c.type}</span><span>{c.frequency}</span><span><CalendarDays size={13}/>{c.next?new Date(c.next).toLocaleDateString("fr-FR"):"À programmer"}</span><b>{euro(c.amount)}</b><span><a className="maintenance-report-link contract-view-link" href={`/maintenance-contract?id=${c.id}`}><FileText size={13}/>Voir le contrat</a><a className="maintenance-report-link" href={`/maintenance-form?contract=${encodeURIComponent(c.number)}&client=${encodeURIComponent(c.client)}&date=${new Date().toISOString().slice(0,10)}`}><Wrench size={13}/>Rapport</a>{c.status!=="Entretien terminé — réglé"&&<button className="validate-quote" onClick={()=>complete(c)}>Terminer et régler</button>}<small>{c.status}</small></span></div>)}
    </div>
  </ModuleTop>;
}
function BillingView({kind,documents,clients,query,onAdd,onEdit,onValidate,onUnvalidate,onStatusChange,toast}) {
  const list=documents.filter(d=>Object.values(d).join(" ").toLowerCase().includes(query.toLowerCase()));
  const turnover=documents.reduce((s,d)=>s+billingTotals(d).totalTTC,0);
  const pending=documents.filter(d=>kind==="Facture"?d.status!=="Payée":!["Accepté","Refusé","Annulé","Expiré"].includes(d.status)).reduce((s,d)=>s+billingTotals(d).totalTTC,0);
  const statusOptions=statusesForKind(kind);
  async function download(doc) {
    const totals=billingTotals(doc);
    const customer=clients.find(item=>String(item.id)===String(doc.clientId))||clients.find(item=>item.name===doc.client)||{};
    const safe=value=>String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const customerName=safe(customer.company||customer.name||doc.client);
    const customerContact=safe(`${customer.firstName||""} ${customer.lastName||""}`.trim()||customer.contact||customer.name);
    const siteAddress=safe([customer.address,customer.postalCode,customer.city].filter(Boolean).join(" "));
    const customerDetails=`<section class="customer"><span>CLIENT / DESTINATAIRE</span><b>${customerName}</b>${customerContact&&customerContact!==customerName?`<p>${customerContact}</p>`:""}<p>${siteAddress||"Adresse à compléter"}</p><p>${safe(customer.mobile||customer.phone)}${customer.email?` • ${safe(customer.email)}`:""}</p></section>`;
    const lineRows=totals.lines.map(item=>`<tr><td><b>${item.name}</b>${item.code?`<br><small>Réf. ${item.code}</small>`:""}${item.description?`<div style="margin-top:2mm;white-space:pre-line;font-size:9px;line-height:1.35;color:#374151">${safe(item.description)}</div>`:""}</td><td>${item.qty}</td><td>${euro(Number(item.unit))}</td><td>${euro(Number(item.unit)*(1+Number(item.tax||0)/100))}</td><td>${item.tax}%</td><td><b>${euro(item.totalHT)}</b></td><td><b>${euro(item.totalTTC)}</b></td></tr>`).join("");
    const logoBlob=await fetch("/mkl-energies.png").then(r=>r.blob());
    const logoData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(logoBlob);});
    const freeNote=doc.freeNote?`<section class="free-note"><b>MENTION</b><p>${String(doc.freeNote).replace(/</g,"&lt;").replace(/\n/g,"<br>")}</p></section>`:"";
    const globalDiscount=totals.globalDiscountTTC?`<p><span>Remise globale TTC</span><b>− ${euro(totals.globalDiscountTTC)}</b></p>`:"";
    const acceptance=doc.kind==="Devis"?`<section style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:6mm"><div style="min-height:34mm;border:1px solid #aeb7c7;background:#f7f8fc;padding:4mm"><b>Signature précédée de la mention « Bon pour accord »</b><p style="margin:2mm 0">Date :</p></div><div style="min-height:34mm;border:1px solid #aeb7c7;background:#f7f8fc;padding:4mm"><b style="color:#405fae">DATE PRÉVISIONNELLE DE LIVRAISON</b><p style="margin:5mm 0 0;font-size:14px"><b>${doc.deliveryDate?new Date(doc.deliveryDate).toLocaleDateString("fr-FR"):"Non renseignée"}</b></p>${!doc.deliveryDate?'<small>Le document conserve la mention PROJET.</small>':""}</div></section>`:"";
    const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><title>${doc.number}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font:12px Arial;color:#25345c}.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:18mm 17mm 14mm;display:flex;flex-direction:column;box-shadow:0 4px 25px #0002}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #ffdb62;padding-bottom:8mm}.logo{width:65mm;height:auto}.doc-info{text-align:right}.doc-info b{font-size:18px;color:#405fae}.doc-info p{margin:5px 0}.customer{margin:9mm 0 2mm auto;width:82mm;border:1px solid #d8deea;border-radius:3mm;padding:4mm;background:#f8f9fc}.customer span{display:block;font-size:9px;letter-spacing:.8px;color:#405fae;margin-bottom:2mm}.customer>b{font-size:14px}.customer p{margin:1.5mm 0;font-size:10px}h2{margin-top:12mm;color:#405fae}table{width:100%;border-collapse:collapse;margin-top:7mm}th{background:#405fae;color:#fff}th,td{padding:9px 7px;border-bottom:1px solid #ddd;text-align:left}small{color:#777}.summary{margin:8mm 0 0 auto;width:82mm}.summary p{display:flex;justify-content:space-between}.total{font-size:18px;border-top:2px solid #405fae;padding-top:10px}.spacer{flex:1;min-height:15mm}.free-note{margin-top:8mm;border-left:4px solid #ffdb62;background:#f7f8fb;padding:4mm}.free-note b{color:#405fae;font-size:10px}.free-note p{margin:2mm 0 0;white-space:normal}.note{color:#777;border-top:1px solid #ddd;padding-top:5mm;display:flex;justify-content:space-between;font-size:10px}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;width:210mm;min-height:297mm}}</style><body><main class="sheet"><header><img class="logo" src="${logoData}" alt="MKL Énergies"><div class="doc-info"><b>${doc.kind.toUpperCase()} ${doc.number}</b><p>Date : ${new Date(doc.date).toLocaleDateString("fr-FR")}</p><p>Échéance : ${new Date(doc.due).toLocaleDateString("fr-FR")}</p></div></header>${customerDetails}<table><tr><th>Désignation</th><th>Qté</th><th>Prix unitaire HT</th><th>TVA</th><th>Remise</th><th>Total TTC</th></tr>${lineRows}</table><div class="summary"><p><span>Total HT</span><b>${euro(totals.totalHT)}</b></p>${globalDiscount}<p><span>TVA</span><b>${euro(totals.taxAmount)}</b></p><p class="total"><span>Total TTC</span><b>${euro(totals.totalTTC)}</b></p></div><div class="spacer"></div>${freeNote}<footer class="note"><span>MKL Énergies</span><span>Document généré par MKL Énergies CRM</span><span>Page 1/1</span></footer></main></body></html>`;
    const financing=doc.kind==="Devis"&&doc.financier&&doc.financier!=="Sans financement"?`<div style="display:grid;grid-template-columns:78mm 82mm;justify-content:space-between;align-items:end;gap:10mm;width:100%"><section style="width:78mm;min-height:55mm;border:2px solid #405fae;border-radius:3mm;padding:5mm;display:flex;flex-direction:column;justify-content:center"><b style="display:block;color:#405fae;font-size:12px;margin-bottom:4mm">FINANCEMENT DU PROJET</b><p style="margin:1.5mm 0"><span style="display:block;color:#7b8798;font-size:9px">FINANCEUR</span><b>${doc.financier}</b></p><p style="margin:1.5mm 0"><span style="display:block;color:#7b8798;font-size:9px">MONTANT FINANCÉ</span><b>${euro(Number(doc.financedAmount||0))}</b></p><p style="margin:1.5mm 0"><span style="display:block;color:#7b8798;font-size:9px">DURÉE / MENSUALITÉ</span><b>${doc.financeMonths||"—"} mois • ${euro(Number(doc.monthlyPayment||0))}</b></p></section>`:"";
    const projectMark=doc.kind==="Devis"&&!doc.deliveryDate?`<div style="position:absolute;top:42mm;right:17mm;border:2px solid #c96455;color:#c96455;font:bold 14px Arial;padding:5px 10px;transform:rotate(-7deg)">PROJET</div>`:"";
    const operator=electricityOperators.find(item=>item.id===doc.electricityOperator);
    const isPhotovoltaicQuote=doc.kind==="Devis"&&(doc.pvStudyId||(doc.items||[]).some(item=>`${item.name||""} ${item.subcategory||""} ${item.code||""}`.toLowerCase().includes("photovolta")));
    const townHallMandate=isPhotovoltaicQuote?`<main class="sheet mandate-sheet town-hall-mandate" style="page-break-before:always"><header><img class="logo" src="${logoData}" alt="MKL Énergies"><div class="doc-info"><b>MANDAT ADMINISTRATIF</b><p>Annexe au devis ${safe(doc.number)}</p></div></header><div style="margin-top:12mm;text-align:center;padding:6mm;border:2px solid #405fae"><b style="font-size:19px;color:#405fae">MANDAT — DÉMARCHES EN MAIRIE</b></div><section style="margin-top:12mm;line-height:1.7;font-size:13px"><p>Je soussigné(e), <b>${customerContact||customerName}</b>,</p><p>demeurant à l’adresse suivante : <b>${siteAddress}</b>,</p><p>donne pouvoir à la société :</p><div style="margin:8mm auto;padding:6mm;width:110mm;text-align:center;background:#eef2fa;border-radius:3mm"><img src="${logoData}" alt="MKL Énergies" style="width:55mm"><p style="margin:4mm 0 0"><b style="font-size:17px">MKL Énergies</b><br>contact@mkl-energies.fr</p></div><p>afin d’accomplir en mon nom et pour mon compte les démarches administratives concernant l’installation photovoltaïque et les menuiseries ou équipements extérieurs éventuellement liés au projet réalisé à mon domicile.</p><div style="margin:7mm 0;padding:5mm;border-left:4px solid #ffdb62;background:#f8f9fb"><b>Objet du mandat</b><p style="margin-bottom:0">Préparation, dépôt et suivi de la déclaration préalable de travaux auprès de la mairie compétente, transmission des pièces nécessaires et réponse aux demandes de compléments relatives au projet.</p></div><p>À cet effet, MKL Énergies pourra compléter, signer lorsque la réglementation et l’administration l’autorisent, déposer et suivre les formulaires et documents nécessaires à l’instruction du dossier, et me demander toute pièce complémentaire utile.</p></section><div style="margin-top:13mm;height:58mm;border:1px solid #bfc8d6;border-radius:3mm;padding:6mm;text-align:center"><b style="color:#405fae">BON POUR MANDAT</b><p>Date et signature du client précédées des mentions<br><b>« Lu et approuvé — Bon pour mandat »</b></p></div><div class="spacer"></div><footer class="note"><span>MKL Énergies</span><span>Mandat pour déclaration préalable de travaux</span><span>Annexe mairie</span></footer></main>`:"";
    const mandate=doc.kind==="Devis"&&operator?`<main class="sheet mandate-sheet" style="page-break-before:always"><header><img class="logo" src="${logoData}" alt="MKL Énergies"><div class="doc-info"><b>MANDAT DE RACCORDEMENT</b><p>Annexe au devis ${safe(doc.number)}</p></div></header><div style="margin-top:12mm;padding:5mm;background:#eef2fa;border-left:4px solid #405fae"><b style="font-size:16px;color:#405fae">${safe(operator.name)}</b><p style="margin-bottom:0">${safe(operator.title)}</p></div><h2>1. Mandant — client producteur</h2><table><tr><td><b>Nom / raison sociale</b></td><td>${customerName}</td></tr><tr><td><b>Représenté par</b></td><td>${customerContact}</td></tr><tr><td><b>Adresse</b></td><td>${siteAddress}</td></tr><tr><td><b>Téléphone</b></td><td>${safe(customer.mobile||customer.phone)}</td></tr><tr><td><b>Email</b></td><td>${safe(customer.email)}</td></tr></table><h2>2. Site de production à raccorder</h2><table><tr><td><b>Adresse du site</b></td><td>${siteAddress}</td></tr><tr><td><b>Nature</b></td><td>Installation de production photovoltaïque</td></tr><tr><td><b>Puissance de raccordement</b></td><td>${safe(doc.pvPowerKwp||"À confirmer")} kWc</td></tr><tr><td><b>Référence commerciale</b></td><td>${safe(doc.number)}</td></tr></table><h2>3. Mandataire</h2><table><tr><td><b>Raison sociale</b></td><td>MKL Énergies</td></tr><tr><td><b>Représentant</b></td><td>Khaled</td></tr><tr><td><b>Email</b></td><td>contact@mkl-energies.fr</td></tr></table><section style="margin-top:10mm;line-height:1.55"><b>Étendue du mandat</b><p>Le mandant autorise MKL Énergies à effectuer, en son nom et pour son compte, les démarches nécessaires à la demande de raccordement du site désigné ci-dessus auprès de ${safe(operator.name)}, à transmettre et recevoir les pièces relatives au dossier, et à assurer le suivi administratif de la demande. Les engagements financiers et contractuels définitifs restent soumis à l’accord du mandant lorsque le gestionnaire de réseau l’exige.</p></section><div style="display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:12mm"><div style="height:45mm;border:1px solid #ccd3df;border-radius:3mm;padding:5mm"><b>Le mandant</b><p>Date et signature précédée de la mention « Bon pour mandat »</p></div><div style="height:45mm;border:1px solid #ccd3df;border-radius:3mm;padding:5mm"><b>Le mandataire — MKL Énergies</b><p>Date, cachet et signature</p></div></div><div class="spacer"></div><footer class="note"><span>MKL Énergies</span><span>${safe(operator.name)} — mandat de représentation</span><span>Annexe 1</span></footer></main>`:"";
    const brandedHtml=html
      .replace('<table><tr><th>Désignation</th><th>Qté</th><th>Prix unitaire HT</th><th>TVA</th><th>Remise</th><th>Total TTC</th></tr>','<table><thead><tr><th>Détail</th><th>Qté</th><th>P.U HT</th><th>P.U TTC</th><th>TVA</th><th>Total HT</th><th>Total TTC</th></tr></thead><tbody>')
      .replace("</table><div class=\"summary\">","</tbody></table><div class=\"spacer\"></div><div class=\"summary\">")
      .replace(`<div class="spacer"></div>${freeNote}<footer`,`${financing?"</div>":""}${freeNote}${acceptance}<footer`)
      .replace("<title>",`<link rel="icon" type="image/png" href="${logoData}"><title>`)
      .replace('<main class="sheet">',`<main class="sheet" style="position:relative">${projectMark}`)
      .replace('<div class="summary">',`${financing}<div class="summary"${financing?' style="margin:0;width:82mm"':""}>`)
      .replace("</body>",`${townHallMandate}${mandate}</body>`);
    const printWindow=window.open("","_blank");
    if(printWindow){
      printWindow.document.open();
      printWindow.document.write(brandedHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(()=>{
        try{printWindow.print();}catch{}
      },400);
      toast(`${doc.kind} prêt — utilisez « Enregistrer au format PDF » dans l’impression`);
    }else{
      const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([brandedHtml],{type:"text/html"})); a.download=`${doc.number}.html`; a.click(); URL.revokeObjectURL(a.href); toast(`${doc.kind} téléchargé (autorise les pop-ups pour l’impression PDF)`);
    }
  }
  const title=kind==="Facture"?"Factures":kind==="Pro forma"?"Factures pro forma":"Devis";
  return <ModuleTop eyebrow={kind==="Devis"?"GESTION COMMERCIALE":"ESPACE ADMINISTRATION"} title={title} sub={`${documents.length} ${title.toLowerCase()} enregistrés`}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Créer {kind==="Facture"?"une facture":kind==="Pro forma"?"une pro forma":"un devis"}</button>
    <div className="mini-kpis billing-kpis"><div><FileText/><span><b>{documents.length}</b>{kind==="Facture"?"factures":"devis"}</span></div><div><CircleDollarSign/><span><b>{euro(turnover)}</b>{kind==="Facture"?"facturé TTC":"proposé TTC"}</span></div><div><Clock3/><span><b>{euro(pending)}</b>{kind==="Facture"?"à encaisser":"en attente"}</span></div></div>
    <div className="data-panel billing-table"><div className="data-row data-head"><span>DOCUMENT</span><span>CLIENT</span><span>OBJET</span><span>DATE / ÉCHÉANCE</span><span>TOTAL TTC</span><span>STATUT</span><span></span></div>
      {list.map(d=><div className="data-row" key={d.id}><span><b>{d.kind}{kind==="Devis"&&!d.deliveryDate?" — PROJET":""}</b><small>{d.number}</small></span><b>{d.client}</b><span>{d.label}<small>{d.pvStudyId?"Étude solaire MKL jointe":d.financier&&d.financier!=="Sans financement"?`Financement : ${d.financier}`:""}</small></span><span><b>{new Date(d.date).toLocaleDateString("fr-FR")}</b><small>{d.deliveryDate?`Livraison ${new Date(d.deliveryDate).toLocaleDateString("fr-FR")}`:`Échéance ${new Date(d.due).toLocaleDateString("fr-FR")}`}</small></span><b>{euro(billingTotals(d).totalTTC)}</b><span className="billing-status-cell"><select className={`status-select ${statusTone(d.status)}`} value={statusOptions.includes(d.status)?d.status:d.status} onChange={e=>onStatusChange?.(d,e.target.value)} aria-label="Statut du document">{statusOptions.includes(d.status)?null:<option value={d.status}>{d.status}</option>}{statusOptions.map(status=><option key={status} value={status}>{status}</option>)}</select></span><div className="document-actions">{kind==="Devis"&&d.status!=="Accepté"&&onValidate&&<button className="validate-quote" onClick={()=>onValidate(d)} title="Valider le devis"><CheckCircle2 size={15}/><span>Valider</span></button>}{kind==="Devis"&&d.status==="Accepté"&&onUnvalidate&&<button className="unvalidate-quote" onClick={()=>onUnvalidate(d)} title="Dévalider le devis"><X size={15}/><span>Dévalider</span></button>}{d.pvStudyId&&<a className="download-doc pv-study-link" href={`/pv-study?id=${d.pvStudyId}`} target="_blank" title="Ouvrir l’étude solaire MKL"><Sun size={15}/></a>}{!["Accepté","Payée","Annulé"].includes(d.status)&&<button className="download-doc" onClick={()=>onEdit(d)} title="Modifier"><Pencil size={15}/></button>}<button className="download-doc" onClick={()=>download(d)} title="Imprimer / PDF"><Download size={16}/></button></div></div>)}
    </div>
  </ModuleTop>;
}
function ImportButton({onImport}) {
  return <label className="secondary import-button"><Upload size={17}/>Importer CSV<input type="file" accept=".csv,text/csv" onChange={e=>{onImport(e.target.files?.[0]);e.target.value="";}}/></label>;
}
function ArticleManagementView({articles,setArticles,brands=[],setBrands,groups,bundles,query,onAddArticle,onEditArticle,onAddBrand,onEditBrand,onImportArticle,onAddGroup,onAddCategory,onImportCategory,toast}) {
  const [tab,setTab]=useState("articles");
  const tabs=[
    ["articles","Articles",Package,articles.length],
    ["brands","Marques",Tag,brands.length],
    ["bundles","Groupes d’articles",Library,bundles.length],
    ["categories","Catégories",Layers3,groups.length],
  ];
  return <div className="article-management">
    <div className="article-management-tabs" role="tablist" aria-label="Gestion des articles">
      {tabs.map(([id,label,Icon,count])=><button type="button" role="tab" aria-selected={tab===id} className={tab===id?"active":""} key={id} onClick={()=>setTab(id)}><Icon size={17}/><span>{label}</span><b>{count}</b></button>)}
    </div>
    {tab==="articles"&&<ArticlesView articles={articles} setArticles={setArticles} query={query} onAdd={onAddArticle} onEdit={onEditArticle} onImport={onImportArticle} toast={toast}/>}
    {tab==="brands"&&<BrandsView brands={brands} setBrands={setBrands} query={query} onAdd={onAddBrand} onEdit={onEditBrand} toast={toast}/>}
    {tab==="bundles"&&<BundlesView bundles={bundles} articles={articles} query={query} onAdd={onAddGroup}/>}
    {tab==="categories"&&<GroupsView groups={groups} articles={articles} query={query} onAdd={onAddCategory} onImport={onImportCategory}/>}
  </div>;
}
function BrandsView({brands,setBrands,query,onAdd,onEdit,toast}) {
  const [localQuery,setLocalQuery]=useState("");
  const search=`${query||""} ${localQuery||""}`.trim().toLowerCase();
  const list=brands.filter(brand=>!search||`${brand.name} ${brand.status}`.toLowerCase().includes(search));
  async function deactivateBrand(brand) {
    if(!window.confirm(`Désactiver la marque « ${brand.name} » ?`)) return;
    try {
      const response=await authFetch(`/api/brands/${brand.id}`,{method:"DELETE"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Désactivation impossible");
      setBrands(current=>current.map(item=>item.id===brand.id?(data.brand||{...item,status:"Inactif",active:false}):item));
      toast("Marque désactivée");
    } catch(error) {
      toast(String(error?.message||"Désactivation impossible"));
    }
  }
  async function reactivateBrand(brand) {
    try {
      const response=await authFetch(`/api/brands/${brand.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Actif"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Réactivation impossible");
      setBrands(current=>current.map(item=>item.id===brand.id?data.brand:item));
      toast("Marque réactivée");
    } catch(error) {
      toast(String(error?.message||"Réactivation impossible"));
    }
  }
  return <ModuleTop eyebrow="CATALOGUE" title="Marques" sub={`${brands.length} marques — logos utilisés dans le parcours devis`}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Nouvelle marque</button>
    <div className="module-body">
      <div className="catalogue-search"><Search size={17}/><input value={localQuery} onChange={e=>setLocalQuery(e.target.value)} placeholder="Rechercher une marque…"/><span>{list.length}</span></div>
      <div className="data-panel brand-table"><div className="data-row data-head"><span>LOGO</span><span>MARQUE</span><span>STATUT</span><span></span></div>
        {list.length===0&&<div className="quote-empty"><Tag size={20}/><span>Aucune marque — créez Dualsun, Daikin… avec leur logo</span></div>}
        {list.map(brand=><div className="data-row" key={brand.id}>
          <span className="brand-logo-cell">{brand.logoUrl?<img src={brand.logoUrl} alt=""/>:<i>{(brand.name||"?").slice(0,1).toUpperCase()}</i>}</span>
          <b>{brand.name}</b>
          <span className={`status ${brand.status==="Inactif"?"wait":"ok"}`}>{brand.status||"Actif"}</span>
          <div className="document-actions">
            <button type="button" className="download-doc" onClick={()=>onEdit?.(brand)} title="Modifier"><Pencil size={15}/></button>
            {brand.status==="Inactif"
              ? <button type="button" className="validate-quote" onClick={()=>reactivateBrand(brand)} title="Réactiver">Réactiver</button>
              : <button type="button" className="delete-article" onClick={()=>deactivateBrand(brand)} title="Désactiver"><Trash2 size={15}/></button>}
          </div>
        </div>)}
      </div>
    </div>
  </ModuleTop>;
}
function ArticlesView({articles,setArticles,query,onAdd,onEdit,onImport,toast}) {
  const [localQuery,setLocalQuery]=useState("");
  const search=`${query||""} ${localQuery||""}`.trim();
  const list=articles.filter(a=>matchesArticleSearch(a,search));
  const stockValue=articles.reduce((s,a)=>s+Number(a.buy||0),0);
  async function deactivateArticle(article) {
    if(!window.confirm(`Désactiver l’article « ${article.name} » ? Il restera visible sur les anciens devis.`)) return;
    try {
      const response=await authFetch(`/api/articles/${article.id}`,{method:"DELETE"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Désactivation impossible");
      setArticles(current=>current.map(item=>item.id===article.id?(data.article||{...item,status:"Inactif",active:false}):item));
      toast("Article désactivé");
    } catch(error) {
      toast(String(error?.message||"Désactivation impossible"));
    }
  }
  async function reactivateArticle(article) {
    try {
      const response=await authFetch(`/api/articles/${article.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Actif"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Réactivation impossible");
      setArticles(current=>current.map(item=>item.id===article.id?data.article:item));
      toast("Article réactivé");
    } catch(error) {
      toast(String(error?.message||"Réactivation impossible"));
    }
  }
  return <ModuleTop eyebrow="CATALOGUE" title="Articles" sub={`${articles.length} articles — référence unique · utilisés dans les devis`}>
    <ImportButton onImport={onImport}/><button className="primary" onClick={onAdd}><Plus size={17}/>Nouvel article</button>
    <div className="article-search catalogue-search"><Search size={17}/><input type="search" value={localQuery} onChange={e=>setLocalQuery(e.target.value)} placeholder="Rechercher référence, désignation, marque, catégorie…"/><span>{list.length}</span></div>
    <div className="mini-kpis"><div><Package/><span><b>{articles.filter(a=>a.status!=="Inactif").length}</b>articles actifs</span></div><div><Layers3/><span><b>{new Set(articles.map(a=>a.category)).size}</b>catégories utilisées</span></div><div><Euro/><span><b>{euro(stockValue)}</b>valeur d’achat catalogue</span></div></div>
    <div className="data-panel articles-table"><div className="data-row data-head"><span>RÉFÉRENCE</span><span>DÉSIGNATION</span><span>CATÉGORIE</span><span>MARQUE</span><span>UNITÉ</span><span>PRIX D’ACHAT</span><span>PRIX DE VENTE</span><span>TVA</span><span>STATUT</span><span></span></div>
      {list.map(a=><div className="data-row" key={a.id}><b>{a.code}</b><div className="entity"><i><Package size={15}/></i><span><b>{a.name}</b>{a.subcategory&&<small>{a.subcategory}</small>}</span></div><span>{a.category}</span><span>{a.brand||"—"}</span><span>{a.unit}</span><b>{euro(a.buy)}</b><b>{euro(a.sell)}</b><span>{a.tax}%</span><span className={`status ${a.status==="Inactif"?"wait":"ok"}`}>{a.status||"Actif"}</span><div className="document-actions"><button type="button" className="download-doc" onClick={()=>onEdit?.(a)} title="Modifier"><Pencil size={15}/></button>{a.status==="Inactif"?<button type="button" className="validate-quote" onClick={()=>reactivateArticle(a)} title="Réactiver">Réactiver</button>:<button type="button" className="delete-article" onClick={()=>deactivateArticle(a)} title="Désactiver l’article"><Trash2 size={15}/></button>}</div></div>)}
    </div>
    <div className="import-help"><FileSpreadsheet size={18}/><div><b>Format d’import Excel</b><span>Colonnes CSV : code, designation, categorie, sous_categorie, marque, unite, prix_achat, prix_vente, tva.</span></div></div>
  </ModuleTop>;
}
function GroupsView({groups,articles,query,onAdd,onImport}) {
  const list=groups.filter(g=>Object.values(g).join(" ").toLowerCase().includes(query.toLowerCase()));
  const categories=list.filter(group=>!group.parent);
  return <ModuleTop eyebrow="ORGANISATION DU CATALOGUE" title="Catégories & sous-catégories" sub={`${categories.length} catégories principales • ${groups.filter(g=>g.parent).length} sous-catégories`}>
    <ImportButton onImport={onImport}/><button className="primary" onClick={onAdd}><Plus size={17}/>Nouvelle sous-catégorie</button>
    <div className="category-tree">{categories.map(category=><div className="category-block" key={`category-${category.name}`}><div className="category-main"><div className="group-icon"><Layers3 size={20}/></div><div><span>{category.code}</span><h3>{category.name}</h3><p>{category.description}</p></div><b>{articles.filter(a=>a.category===category.name).length} article(s)</b></div><div className="subcategory-list">{groups.filter(sub=>sub.parent===category.name).map(sub=><div key={`subcategory-${category.name}-${sub.name}`}><span>{sub.code}</span><b>{sub.name}</b><small>{articles.filter(a=>a.subcategory===sub.name).length} article(s)</small></div>)}{!groups.some(sub=>sub.parent===category.name)&&<p>Aucune sous-catégorie</p>}</div></div>)}</div>
    <div className="import-help"><FileSpreadsheet size={18}/><div><b>Format d’import Excel</b><span>Colonnes CSV : code, nom, categorie_parent, description, marge.</span></div></div>
  </ModuleTop>;
}
function CostRequestsView({requests,setRequests,suppliers,query,toast}) {
  const list=requests.filter(request=>Object.values(request).join(" ").toLowerCase().includes(query.toLowerCase()));
  async function download(request) {
    const logoBlob=await fetch("/mkl-energies.png").then(r=>r.blob());
    const logoData=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(logoBlob);});
    const rows=request.items.map(item=>`<tr><td>${item.code}</td><td>${item.name}</td><td>${item.qty}</td><td></td><td></td></tr>`).join("");
    const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><title>${request.number}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font:12px Arial;color:#25345c}.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:16mm;display:flex;flex-direction:column}.logo{width:62mm}header{display:flex;justify-content:space-between;border-bottom:4px solid #ffdb62;padding-bottom:8mm}.title{text-align:right}.title h1{font-size:20px;color:#405fae;margin:0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:10mm 0}.box{border:1px solid #d7dce5;border-radius:3mm;padding:4mm}.box span{display:block;font-size:9px;color:#808b9b;margin-bottom:2mm}.box b{font-size:12px}table{width:100%;border-collapse:collapse}th{background:#405fae;color:#fff}th,td{border:1px solid #d8dde5;padding:3mm;text-align:left}td:nth-child(3){text-align:center}.instructions{margin-top:7mm;background:#f3f5f9;padding:4mm;border-radius:3mm;font-size:10px}.spacer{flex:1}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:10mm}.signature{border-top:1px solid #aeb6c2;padding-top:3mm;color:#737e8e}.footer{border-top:1px solid #d8dde5;padding-top:4mm;margin-top:8mm;display:flex;justify-content:space-between;font-size:9px;color:#7f8998}@media print{body{background:#fff}.sheet{margin:0}}</style><body><main class="sheet"><header><img class="logo" src="${logoData}"><div class="title"><h1>DEMANDE DE CHIFFRAGE</h1><p>${request.number}</p></div></header><section class="meta"><div class="box"><span>DEVIS ASSOCIÉ</span><b>${request.quoteNumber}</b></div><div class="box"><span>DATE DE LA DEMANDE</span><b>${new Date(request.created).toLocaleDateString("fr-FR")}</b></div><div class="box"><span>CLIENT / PROJET</span><b>${request.client}</b></div><div class="box"><span>DEMANDEUR</span><b>${request.requester}</b></div></section><table><tr><th>Référence</th><th>Grand matériel à chiffrer</th><th>Quantité</th><th>Prix fournisseur HT</th><th>Délai</th></tr>${rows}</table><div class="instructions"><b>Consignes :</b> merci d’indiquer pour chaque équipement le prix net HT, le délai de livraison, la durée de validité de l’offre et les conditions de transport.</div><div class="spacer"></div><section class="signatures"><div class="signature">Visa du responsable technique</div><div class="signature">Réponse fournisseur / date</div></section><footer class="footer"><span>MKL Énergies</span><span>Demande générée automatiquement après validation du devis</span><span>Page 1/1</span></footer></main></body></html>`;
    const brandedHtml=html.replace("<title>",`<link rel="icon" type="image/png" href="${logoData}"><title>`);
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([brandedHtml],{type:"text/html"}));a.download=`${request.number}.html`;a.click();URL.revokeObjectURL(a.href);toast("Demande de chiffrage téléchargée avec le logo MKL");
  }
  return <ModuleTop eyebrow="ACHATS & FOURNISSEURS" title="Demandes de chiffrage" sub="Générées automatiquement depuis les devis acceptés"><div className="cost-rule"><Layers3 size={19}/><div><b>Règle automatique active</b><span>Seuls les articles de la catégorie « Grand matériel » sont repris dans ce formulaire.</span></div></div><div className="data-panel cost-table"><div className="data-row data-head"><span>DEMANDE</span><span>DEVIS / CLIENT</span><span>CRÉATION</span><span>MATÉRIEL</span><span>DEMANDEUR</span><span>STATUT</span><span></span></div>{list.map(request=><div className="cost-request-item" key={request.id}><div className="data-row"><span><b>{request.number}</b><small>Automatique</small></span><span><b>{request.quoteNumber}</b><small>{request.client}</small></span><span>{new Date(request.created).toLocaleDateString("fr-FR")}</span><span><b>{request.items.length} article(s)</b><small>Grand matériel</small></span><span>{request.requester}</span><span className={`status ${request.status==="Envoyée"?"ok":"wait"}`}>{request.status}</span><button className="download-doc" onClick={()=>download(request)} title="Télécharger"><Download size={16}/></button></div><CostRequestSuppliers request={request} requests={requests} setRequests={setRequests} suppliers={suppliers} toast={toast}/></div>)}
  {list.length===0&&<div className="empty"><ClipboardList size={26}/><p>Aucune demande pour le moment.</p><span>Validez un devis contenant un article de la catégorie Grand matériel.</span></div>}</div></ModuleTop>;
}
function CostRequestSuppliers({request,requests,setRequests,suppliers,toast}) {
  const [selected,setSelected]=useState(request.supplierIds||[]);
  const [sending,setSending]=useState(false);
  const available=suppliers.filter(s=>s.status!=="Inactif"&&s.email);
  const toggle=id=>setSelected(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  async function sendRequest() {
    const recipients=available.filter(s=>selected.includes(s.id));
    if(!recipients.length) return toast("Sélectionnez au moins un fournisseur");
    setSending(true);
    const previousStatus=request.status;
    setRequests(current=>current.map(item=>item.id===request.id?{...item,status:"Envoi en cours…",supplierIds:selected}:item));
    try {
      const response=await authFetch("/api/cost-requests/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request,suppliers:recipients})});
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error||"L’envoi a échoué");
      setRequests(current=>current.map(item=>item.id===request.id?{...item,status:"Envoyée",supplierIds:selected,sentAt:new Date().toISOString()}:item));
      toast(`Demande envoyée à ${recipients.length} fournisseur(s)`);
    } catch(error) {
      setRequests(current=>current.map(item=>item.id===request.id?{...item,status:previousStatus||"À envoyer"}:item));
      toast(error.message);
    }
    finally { setSending(false); }
  }
  return <div className="supplier-send-panel"><div className="supplier-send-title"><Truck size={17}/><div><b>Fournisseurs destinataires</b><span>Cochez les fournisseurs qui doivent recevoir cette demande.</span></div></div><div className="supplier-checks">{available.map(s=><label className={selected.includes(s.id)?"checked":""} key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/><span><b>{s.name}</b><small>{s.email}</small></span></label>)}{available.length===0&&<span className="no-supplier">Ajoutez d’abord un fournisseur avec une adresse email.</span>}</div><button className="primary send-cost" type="button" disabled={sending||!available.length} onClick={sendRequest}><Send size={16}/>{sending?"Envoi en cours…":"Envoyer"}</button></div>;
}
function SuppliersView({suppliers,query,onAdd}) {
  const list=suppliers.filter(s=>Object.values(s).join(" ").toLowerCase().includes(query.toLowerCase()));
  return <ModuleTop eyebrow="ACHATS" title="Fournisseurs" sub={`${suppliers.length} fournisseurs enregistrés`}><button className="primary" onClick={onAdd}><Plus size={17}/>Nouveau fournisseur</button><div className="mini-kpis"><div><Truck/><span><b>{suppliers.length}</b>fournisseurs</span></div><div><Mail/><span><b>{suppliers.filter(s=>s.email).length}</b>emails disponibles</span></div><div><CheckCircle2/><span><b>{suppliers.filter(s=>s.status==="Actif").length}</b>actifs</span></div></div><div className="data-panel suppliers-table"><div className="data-row data-head"><span>FOURNISSEUR</span><span>CONTACT</span><span>EMAIL</span><span>TÉLÉPHONE</span><span>SPÉCIALITÉ</span><span>STATUT</span></div>{list.map(s=><div className="data-row" key={s.id}><div className="entity"><i><Truck size={15}/></i><b>{s.name}</b></div><span>{s.contact}</span><span><Mail size={13}/>{s.email}</span><span>{s.phone||"—"}</span><span>{s.specialty||"—"}</span><span className="status ok">{s.status}</span></div>)}</div></ModuleTop>;
}
function TechnicalVisitsView({visits,setVisits,suppliers,purchaseOrders,setPurchaseOrders,query,toast}) {
  const list=visits.filter(v=>Object.values(v).join(" ").toLowerCase().includes(query.toLowerCase()));
  const [prices,setPrices]=useState({});
  const [selected,setSelected]=useState({});
  const [ordering,setOrdering]=useState(null);
  function validate(visit) {
    const supplier=suppliers.find(s=>s.id===Number(selected[visit.id]));
    if(!supplier) return toast("Cochez le fournisseur retenu");
    const entered=suppliers.filter(s=>Number(prices[`${visit.id}-${s.id}`])>0);
    const cheapest=entered.sort((a,b)=>Number(prices[`${visit.id}-${a.id}`])-Number(prices[`${visit.id}-${b.id}`]))[0];
    if(cheapest&&cheapest.id!==supplier.id) return toast(`Le moins cher est ${cheapest.name}. Cochez ce fournisseur.`);
    const order={id:Date.now(),number:`BC-${new Date().getFullYear()}-${String(purchaseOrders.length+1).padStart(3,"0")}`,visitId:visit.id,client:visit.client,supplier:supplier.name,email:supplier.email,amount:Number(prices[`${visit.id}-${supplier.id}`]||0),created:new Date().toISOString(),status:"Envoyé"};
    setPurchaseOrders([order,...purchaseOrders]); setVisits(visits.map(v=>v.id===visit.id?{...v,status:"Validée — bon de commande envoyé",orderNumber:order.number}:v));
    window.location.href=`mailto:${supplier.email}?subject=${encodeURIComponent(`Bon de commande ${order.number}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver notre bon de commande ${order.number} pour le dossier ${visit.client}, montant ${euro(order.amount)} HT.\n\nCordialement,\nMKL Énergies`)}`;
    toast("Visite validée sans modifier le devis — bon de commande généré");
  }
  return <ModuleTop eyebrow="SERVICE TECHNIQUE" title="Prévisites techniques" sub={`${visits.length} prévisites • automatiques après validation du devis ou créées librement`}><a className="primary previsit-main-action" href="/previsite?new=1"><Plus size={17}/>Créer une prévisite sans devis</a><div className="technical-note"><ShieldCheck size={18}/><span>Consultation et modification autorisées au Responsable technique. La prévisite ne modifie jamais le devis.</span></div><div className="data-panel visits-table"><div className="data-row data-head"><span>PRÉVISITE</span><span>CLIENT</span><span>DEVIS / ORIGINE</span><span>DATE</span><span>RESPONSABLE</span><span>STATUT</span><span>ACTIONS</span></div>{list.map(visit=><div className="visit-list-item" key={visit.id}><div className="data-row"><span><b>PRE-{String(visit.id).slice(-6)}</b><small>{visit.created?new Date(visit.created).toLocaleDateString("fr-FR"):"Création manuelle"}</small></span><b>{visit.client||"Client à renseigner"}</b><span><b>{visit.quoteNumber||"Sans devis"}</b><small>{visit.source||"Création libre"}</small></span><span>{visit.date?new Date(visit.date).toLocaleDateString("fr-FR"):"À planifier"}</span><span>{visit.technician||"Responsable technique"}</span><span className={`status ${visit.status?.includes("Complétée")||visit.status?.includes("Validée")?"ok":"wait"}`}>{visit.status||"Brouillon"}</span><div className="document-actions"><a className="download-doc" href={`/previsite?id=${visit.id}`} title="Consulter ou modifier"><Pencil size={15}/></a><button className="download-doc" onClick={()=>setOrdering(ordering===visit.id?null:visit.id)} title="Préparer le bon de commande"><ShoppingCart size={15}/></button></div></div>{ordering===visit.id&&<div className="order-panel"><h4>Comparer les réponses et sélectionner le fournisseur le moins cher</h4><div>{suppliers.map(s=><label className="supplier-price" key={s.id}><input type="radio" name={`supplier-${visit.id}`} checked={Number(selected[visit.id])===s.id} onChange={()=>setSelected({...selected,[visit.id]:s.id})}/><span><b>{s.name}</b><small>{s.email}</small></span><input type="number" min="0" step="0.01" placeholder="Prix HT €" value={prices[`${visit.id}-${s.id}`]||""} onChange={e=>setPrices({...prices,[`${visit.id}-${s.id}`]:e.target.value})}/></label>)}</div><button className="primary" onClick={()=>validate(visit)}><ShoppingCart size={16}/>Valider et envoyer le bon de commande</button></div>}</div>)}</div></ModuleTop>;
}

function PhotovoltaicAdminView({projects,setProjects,clients,query,toast}) {
  const [showForm,setShowForm]=useState(false);
  const [consumption,setConsumption]=useState(8000);
  const [panelPower,setPanelPower]=useState(450);
  const [roofArea,setRoofArea]=useState(50);
  const [yieldValue,setYieldValue]=useState(1100);
  const [geo,setGeo]=useState(null);
  const theoreticalPanels=Math.max(1,Math.ceil(Number(consumption)/(Number(yieldValue)*Number(panelPower)/1000)));
  const roofCapacity=Math.max(1,Math.floor(Number(roofArea)/2));
  const panels=Math.min(theoreticalPanels,roofCapacity);
  const powerKwp=panels*Number(panelPower)/1000;
  const production=Math.round(powerKwp*Number(yieldValue));
  const coverage=Number(consumption)>0?Math.round(production/Number(consumption)*100):0;
  const list=projects.filter(project=>Object.values(project).join(" ").toLowerCase().includes(query.toLowerCase()));
  function create(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    if(!geo?.lat||!geo?.lon) {
      toast("Sélectionnez une adresse géolocalisée dans la liste");
      return;
    }
    const selectedClient=clients.find(client=>client.name===d.client);
    setProjects([{
      ...d,
      id:Date.now(),
      clientId:selectedClient?.id||null,
      price:Number(d.price||0),
      batteryCapacity:Number(d.batteryCapacity||0),
      electricityPrice:Number(d.electricityPrice||0.194),
      surplusPrice:Number(d.surplusPrice||0.04),
      selfConsumptionRate:Number(d.selfConsumptionRate||65),
      annualConsumption:Number(consumption),
      panelPower:Number(panelPower),
      roofArea:Number(roofArea),
      yieldValue:Number(yieldValue),
      yieldSource:geo.yieldSource||"manual",
      address:geo.address||d.address||"",
      postcode:geo.postcode||d.postcode||"",
      city:geo.city||d.city||"",
      lat:geo.lat,
      lon:geo.lon,
      siteLabel:geo.label||"",
      panels,
      powerKwp,
      estimatedProduction:production,
      townHallStatus:"À préparer",
      gridStatus:"À préparer",
      created:new Date().toISOString().slice(0,10),
    },...projects]);
    setShowForm(false);
    setGeo(null);
    toast("Étude photovoltaïque créée avec adresse géolocalisée");
  }
  function update(project,key,value) {
    setProjects(projects.map(item=>item.id===project.id?{...item,[key]:value}:item));
    toast("Démarche administrative mise à jour");
  }
  function remove(project) {
    if(!window.confirm(`Supprimer le dossier photovoltaïque « ${project.name} » ?`)) return;
    setProjects(projects.filter(item=>item.id!==project.id));
    toast("Dossier photovoltaïque supprimé");
  }
  return <ModuleTop eyebrow="ADMINISTRATION PHOTOVOLTAÏQUE" title="Études et démarches photovoltaïques" sub={`${projects.length} dossier${projects.length>1?"s":""} enregistré${projects.length>1?"s":""}`}>
    <button className="primary" onClick={()=>{setShowForm(true);setGeo(null);}}><Plus size={17}/>Nouvelle étude</button>
    <div className="pv-summary"><div><Zap/><span><b>{projects.reduce((sum,item)=>sum+Number(item.powerKwp||0),0).toFixed(1)} kWc</b>puissance étudiée</span></div><div><Building2/><span><b>{projects.filter(item=>item.townHallStatus==="Acceptée").length}</b>accords mairie</span></div><div><Truck/><span><b>{projects.filter(item=>item.gridStatus==="Raccordement validé").length}</b>raccordements validés</span></div></div>
    <div className="pv-projects">{list.map(project=><article className="pv-project-card" key={project.id}><div className="pv-project-title"><span><Zap size={20}/></span><div><h3>{project.name}</h3><p>{project.client} · {project.city}{project.address?` · ${project.address}`:""}</p></div><a href={`/pv-study?id=${project.id}`} target="_blank" title="Ouvrir l’étude"><Download size={15}/></a><button onClick={()=>remove(project)}><Trash2 size={15}/></button></div><div className="pv-sizing-results"><div><small>Puissance</small><b>{Number(project.powerKwp).toFixed(1)} kWc</b></div><div><small>Panneaux</small><b>{project.panels}</b></div><div><small>Production estimée</small><b>{Number(project.estimatedProduction).toLocaleString("fr-FR")} kWh/an</b></div></div><a className="pv-report-button" href={`/pv-study?id=${project.id}`} target="_blank"><FileText size={15}/>Ouvrir / imprimer l’étude PDF</a><div className="pv-admin-step"><div><Building2 size={17}/><span><b>Déclaration préalable en mairie</b><small>Urbanisme et autorisation des travaux</small></span></div><select value={project.townHallStatus} onChange={event=>update(project,"townHallStatus",event.target.value)}><option>À préparer</option><option>Déposée</option><option>En instruction</option><option>Pièce complémentaire demandée</option><option>Acceptée</option><option>Refusée</option></select></div><div className="pv-admin-step"><div><Zap size={17}/><span><b>Demande de raccordement</b><small>Gestionnaire de réseau et mise en service</small></span></div><select value={project.gridStatus} onChange={event=>update(project,"gridStatus",event.target.value)}><option>À préparer</option><option>Demande transmise</option><option>Proposition reçue</option><option>Convention signée</option><option>Travaux programmés</option><option>Raccordement validé</option></select></div></article>)}</div>
    {showForm&&<div className="backdrop"><div className="modal pv-modal"><button className="modal-close" onClick={()=>setShowForm(false)}><X size={18}/></button><div className="modal-icon"><Zap/></div><h2>Nouvelle étude photovoltaïque</h2><p>Adresse géolocalisée (BAN) + productible local (PVGIS). Une visite technique confirmera orientation, ombrages et structure.</p><form onSubmit={create}>
      <div className="form-row"><label>Client<select name="client" required>{clients.map(client=><option key={client.id}>{client.name}</option>)}</select></label><label>Ville du projet<input name="city" required placeholder="Remplie via l’adresse" value={geo?.city||""} onChange={event=>setGeo(current=>({...(current||{}),city:event.target.value}))}/></label></div>
      <PvAddressLookup
        onResolved={place=>{
          setGeo(place);
          if(place.yieldValue) setYieldValue(place.yieldValue);
        }}
      />
      <label>Nom du projet<input name="name" required placeholder="Ex. Installation toiture 9 kWc"/></label>
      <div className="form-row"><label>Prix de l’installation TTC (€)<input name="price" type="number" min="0" step="0.01" required/></label><label>Capacité batterie (kWh)<input name="batteryCapacity" type="number" min="0" step="0.1" defaultValue="0"/></label></div>
      <div className="form-row"><label>Prix électricité réseau (€/kWh)<input name="electricityPrice" type="number" min="0" step="0.001" defaultValue="0.194"/></label><label>Prix vente surplus (€/kWh)<input name="surplusPrice" type="number" min="0" step="0.001" defaultValue="0.04"/></label></div>
      <label>Taux d’autoconsommation estimé (%)<input name="selfConsumptionRate" type="number" min="0" max="100" defaultValue="65"/></label>
      <div className="pv-input-grid"><label>Consommation annuelle (kWh)<input type="number" min="1" value={consumption} onChange={event=>setConsumption(event.target.value)}/></label><label>Surface disponible (m²)<input type="number" min="2" value={roofArea} onChange={event=>setRoofArea(event.target.value)}/></label><label>Puissance d’un panneau (W)<input type="number" min="100" value={panelPower} onChange={event=>setPanelPower(event.target.value)}/></label><label>Productible local (kWh/kWc)<input type="number" min="600" value={yieldValue} onChange={event=>setYieldValue(event.target.value)}/></label></div>
      <div className="pv-calculation"><div><small>Nombre proposé</small><b>{panels} panneaux</b></div><div><small>Puissance proposée</small><b>{powerKwp.toFixed(2)} kWc</b></div><div><small>Production estimée</small><b>{production.toLocaleString("fr-FR")} kWh/an</b></div><div><small>Couverture théorique</small><b>{coverage} %</b></div></div>
      {theoreticalPanels>roofCapacity&&<div className="pv-warning"><AlertTriangle size={16}/>La surface disponible limite le nombre de panneaux à {roofCapacity}.</div>}
      <button className="primary submit" type="submit"><CheckCircle2 size={17}/>Créer l’étude et les démarches</button>
    </form></div></div>}
  </ModuleTop>;
}

function InstallationTeamsView({teams,setTeams,users,setUsers,query,toast}) {
  const [showForm,setShowForm]=useState(false);
  const [showTechnicianForm,setShowTechnicianForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [members,setMembers]=useState([]);
  const technicians=users.filter(user=>user.role==="Technicien"||user.role==="Responsable technique");
  const list=teams.filter(team=>Object.values(team).flat().join(" ").toLowerCase().includes(query.toLowerCase()));
  function open(team=null) {
    setEditing(team);
    setMembers(team?.members||[]);
    setShowForm(true);
  }
  function save(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    if(!members.length) return toast("Sélectionnez au moins un membre");
    if(!members.includes(d.leader)) return toast("Le chef d’équipe doit faire partie des membres");
    const installationTeam={...d,id:editing?.id||Date.now(),members};
    setTeams(editing?teams.map(team=>team.id===editing.id?installationTeam:team):[...teams,installationTeam]);
    setShowForm(false); setEditing(null); setMembers([]);
    toast(editing?"Équipe modifiée":"Équipe d’installation créée");
  }
  function remove(team) {
    if(!window.confirm(`Supprimer l’équipe « ${team.name} » ? Les chantiers déjà programmés seront conservés.`)) return;
    setTeams(teams.filter(item=>item.id!==team.id));
    toast("Équipe supprimée");
  }
  async function createTechnician(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    if(users.some(user=>user.email?.toLowerCase()===d.email.toLowerCase())) return toast("Cette adresse email appartient déjà à un utilisateur");
    const technician={id:Date.now(),name:d.name,email:d.email,identifier:d.email,phone:d.phone,role:"Technicien",manager:d.manager,modules:roleDefaults.Technicien,status:"Actif",authStatus:"Actif"};
    try {
      const response=await authFetch("/api/users/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:technician.name,email:technician.email,role:technician.role,modules:roleDefaults.Technicien,manager:technician.manager})});
      if(response.ok) technician.authStatus="Invitation envoyée";
    } catch {}
    setUsers([...users,technician]);
    setShowTechnicianForm(false);
    toast(technician.authStatus==="Invitation envoyée"?"Technicien créé et invitation envoyée":"Technicien créé — email à configurer");
  }
  return <ModuleTop eyebrow="ORGANISATION TERRAIN" title="Équipes d’installation" sub={`${teams.length} équipe${teams.length>1?"s":""} enregistrée${teams.length>1?"s":""}`}>
    <button className="secondary" onClick={()=>setShowTechnicianForm(true)}><UserRound size={17}/>Créer un technicien</button>
    <button className="primary" onClick={()=>technicians.length?open():toast("Créez d’abord au moins un technicien")}><Plus size={17}/>Nouvelle équipe</button>
    {technicians.length===0&&<div className="team-prerequisite"><AlertTriangle size={18}/><div><b>Créez d’abord un technicien</b><span>Une équipe d’installation doit contenir au moins un utilisateur ayant le rôle Technicien.</span></div><button onClick={()=>setShowTechnicianForm(true)}>Créer maintenant</button></div>}
    <div className="team-cards">{list.map(team=><article className="installation-team-card" key={team.id}><div className="team-card-head"><span><Users size={22}/></span><div><h3>{team.name}</h3><p>{team.specialty}</p></div><em>{team.status}</em></div><div className="team-leader"><b>CHEF D’ÉQUIPE</b><span><i>{team.leader?.[0]}</i>{team.leader}</span></div><div className="team-members"><b>MEMBRES ({team.members?.length||0})</b>{(team.members||[]).map(name=><span key={name}><i>{name[0]}</i>{name}</span>)}</div><div className="team-card-actions"><button onClick={()=>open(team)}><Pencil size={15}/>Modifier</button><button className="delete" onClick={()=>remove(team)}><Trash2 size={15}/>Supprimer</button></div></article>)}</div>
    {showForm&&<div className="backdrop"><div className="modal installation-team-modal"><button className="modal-close" onClick={()=>setShowForm(false)}><X size={18}/></button><div className="modal-icon"><Users/></div><h2>{editing?"Modifier l’équipe":"Créer une équipe"}</h2><p>Les équipes créées pourront être sélectionnées directement dans l’agenda des installations.</p><form onSubmit={save}>
      <label>Nom de l’équipe<input name="name" required defaultValue={editing?.name||""} placeholder="Ex. Équipe PAC 1"/></label>
      <div className="form-row"><label>Spécialité<select name="specialty" defaultValue={editing?.specialty||"PAC et climatisation"}><option>PAC et climatisation</option><option>Photovoltaïque</option><option>Ballons thermodynamiques</option><option>Installation polyvalente</option><option>Autre</option></select></label><label>Statut<select name="status" defaultValue={editing?.status||"Active"}><option>Active</option><option>Inactive</option></select></label></div>
      <div className="installer-picker"><b>Membres de l’équipe</b><span>Sélectionnez les techniciens concernés</span>{technicians.map(user=><label key={user.id} className={members.includes(user.name)?"selected":""}><input type="checkbox" checked={members.includes(user.name)} onChange={()=>setMembers(members.includes(user.name)?members.filter(name=>name!==user.name):[...members,user.name])}/><i>{user.name[0]}</i><span><b>{user.name}</b><small>{user.role}</small></span><CheckCircle2 size={16}/></label>)}</div>
      <label>Chef d’équipe<select name="leader" required defaultValue={editing?.leader||""}><option value="">Choisir le chef d’équipe</option>{members.map(name=><option key={name}>{name}</option>)}</select></label>
      <button className="primary submit" type="submit"><CheckCircle2 size={17}/>{editing?"Enregistrer les modifications":"Créer l’équipe"}</button>
    </form></div></div>}
    {showTechnicianForm&&<div className="backdrop"><div className="modal installation-team-modal"><button className="modal-close" onClick={()=>setShowTechnicianForm(false)}><X size={18}/></button><div className="modal-icon"><UserRound/></div><h2>Créer un technicien</h2><p>Le technicien sera ajouté aux utilisateurs et pourra ensuite être affecté à une équipe d’installation.</p><form onSubmit={createTechnician}>
      <label>Nom complet<input name="name" required placeholder="Prénom et nom"/></label>
      <div className="form-row"><label>Adresse email / identifiant<input name="email" type="email" required placeholder="technicien@mkl-energies.fr"/></label><label>Téléphone<input name="phone" type="tel"/></label></div>
      <label>Responsable hiérarchique<select name="manager" required>{users.filter(user=>user.role==="Responsable technique"||user.role==="Admin VIP").map(user=><option key={user.id}>{user.name}</option>)}</select></label>
      <div className="permission-detail"><LockKeyhole size={17}/><div><b>Droits Technicien</b><span>Planning, chantiers, maintenance et interventions assignées.</span></div></div>
      <button className="primary submit" type="submit"><Plus size={17}/>Créer le technicien</button>
    </form></div></div>}
  </ModuleTop>;
}

function InstallationPlanningView({installations,setInstallations,installationTeams,clients,team,query,toast,mode}) {
  const [showForm,setShowForm]=useState(false);
  const [selectedInstallers,setSelectedInstallers]=useState([]);
  const installers=team.filter(user=>user.role==="Technicien"||user.role==="Responsable technique");
  const list=installations.filter(item=>Object.values(item).flat().join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>new Date(a.start)-new Date(b.start));
  const dayLabel=value=>new Date(value).toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"short"});
  const timeLabel=value=>new Date(value).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  function create(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    if(!selectedInstallers.length) return toast("Sélectionnez au moins un installateur");
    const installation={...d,id:Date.now(),installers:selectedInstallers,status:"Planifié",created:new Date().toISOString()};
    setInstallations([...installations,installation]);
    setSelectedInstallers([]);
    setShowForm(false);
    toast("Installation créée : chantier ajouté aux agendas de l’équipe");
  }
  function remove(item) {
    if(!window.confirm(`Supprimer le chantier « ${item.project} » de tous les agendas ?`)) return;
    setInstallations(installations.filter(installation=>installation.id!==item.id));
    toast("Chantier supprimé des agendas");
  }
  function updateStatus(item,status) {
    setInstallations(installations.map(installation=>installation.id===item.id?{...installation,status}:installation));
    toast(`Chantier marqué « ${status} »`);
  }
  return <ModuleTop eyebrow="INSTALLATIONS & ÉQUIPES" title={mode==="agenda"?"Agenda des installateurs":"Chantiers d’installation"} sub={`${list.length} installation${list.length>1?"s":""} programmée${list.length>1?"s":""}`}>
    <button className="primary" onClick={()=>setShowForm(true)}><Plus size={17}/>Programmer une installation</button>
    <div className="planning-summary">
      <div><CalendarCheck/><span><b>{list.filter(item=>item.status==="Planifié").length}</b>à venir</span></div>
      <div><HardHat/><span><b>{list.filter(item=>item.status==="En cours").length}</b>en cours</span></div>
      <div><Users/><span><b>{new Set(list.flatMap(item=>item.installers||[])).size}</b>installateurs mobilisés</span></div>
    </div>
    <div className={`installation-list ${mode}`}>
      {list.length===0&&<div className="empty">Aucune installation programmée.</div>}
      {list.map(item=><article className="installation-card" key={item.id}>
        <div className="installation-date"><b>{dayLabel(item.start)}</b><span>{timeLabel(item.start)} — {timeLabel(item.end)}</span></div>
        <div className="installation-detail"><span className="installation-status">{item.status}</span><h3>{item.project}</h3><p><Building2 size={13}/>{item.client}</p><p><MapPin size={13}/>{item.address||"Adresse à compléter"}</p>{item.notes&&<small>{item.notes}</small>}</div>
        <div className="installation-team"><b>ÉQUIPE D’INSTALLATION</b>{(item.installers||[]).map(name=><span key={name}><i>{name[0]}</i>{name}</span>)}</div>
        <div className="installation-actions"><select value={item.status} onChange={event=>updateStatus(item,event.target.value)}><option>Planifié</option><option>En cours</option><option>Terminé</option><option>Reporté</option></select><button onClick={()=>remove(item)} title="Supprimer du chantier et des agendas"><Trash2 size={16}/></button></div>
      </article>)}
    </div>
    {showForm&&<div className="backdrop"><div className="modal installation-modal"><button className="modal-close" onClick={()=>setShowForm(false)}><X size={18}/></button><div className="modal-icon"><CalendarCheck/></div><h2>Programmer une installation</h2><p>Cette programmation créera un chantier visible dans l’agenda de chaque installateur sélectionné.</p><form onSubmit={create}>
      <label>Client<select name="client" required>{clients.map(client=><option key={client.id}>{client.name}</option>)}</select></label>
      <label>Installation / chantier<input name="project" required placeholder="Ex. Installation pompe à chaleur 12 kW"/></label>
      <label>Adresse du chantier<input name="address" required placeholder="Adresse complète"/></label>
      <div className="form-row"><label>Début<input name="start" type="datetime-local" required/></label><label>Fin<input name="end" type="datetime-local" required/></label></div>
      <label>Équipe enregistrée<select defaultValue="" onChange={event=>{const selectedTeam=installationTeams.find(item=>String(item.id)===event.target.value);setSelectedInstallers(selectedTeam?.members||[]);}}><option value="">Sélection manuelle</option>{installationTeams.filter(item=>item.status!=="Inactive").map(item=><option value={item.id} key={item.id}>{item.name} — {item.specialty}</option>)}</select></label>
      <div className="installer-picker"><b>Équipe d’installation</b><span>Sélectionnez un ou plusieurs techniciens</span>{installers.map(installer=><label key={installer.id} className={selectedInstallers.includes(installer.name)?"selected":""}><input type="checkbox" checked={selectedInstallers.includes(installer.name)} onChange={()=>setSelectedInstallers(selectedInstallers.includes(installer.name)?selectedInstallers.filter(name=>name!==installer.name):[...selectedInstallers,installer.name])}/><i>{installer.name[0]}</i><span><b>{installer.name}</b><small>{installer.role}</small></span><CheckCircle2 size={16}/></label>)}</div>
      <label>Consignes pour l’équipe<textarea name="notes" rows="3" placeholder="Matériel, accès, contact sur place…"/></label>
      <button className="primary submit" type="submit"><Plus size={17}/>Créer le chantier et les agendas</button>
    </form></div></div>}
  </ModuleTop>;
}

function BundlesView({bundles,articles,query,onAdd}) {
  const list=bundles.filter(b=>Object.values(b).join(" ").toLowerCase().includes(query.toLowerCase()));
  return <ModuleTop eyebrow="BIBLIOTHÈQUE COMMERCIALE" title="Groupes d’articles" sub="Climatisation, PAC, ballons, photovoltaïque et autres packs"><button className="primary" onClick={onAdd}><Plus size={17}/>Nouveau groupe</button><div className="bundle-grid">{list.map(bundle=><section className="bundle-card" key={bundle.id}><div><Library size={19}/><span><b>{bundle.name}</b><small>{bundle.family}</small></span><strong>{euro(bundle.items.reduce((sum,item)=>sum+Number(item.price),0))}</strong></div>{bundle.items.map((item,i)=><p key={`${item.code}-${i}`}><span><b>{item.name}</b><small>{item.category}</small></span><strong>{euro(item.price)}</strong></p>)}</section>)}</div></ModuleTop>;
}
function UsersView({users,setUsers,query,onAdd,onEdit,onInvite,toast}) {
  const list=users.filter(u=>Object.values(u).join(" ").toLowerCase().includes(query.toLowerCase()));
  const remove=id=>{ if(users.length>1){setUsers(users.filter(u=>u.id!==id));toast("Utilisateur supprimé");}};
  return <ModuleTop eyebrow="ADMINISTRATION" title="Utilisateurs & accès" sub={`${users.length} comptes dans votre organisation`}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Inviter un utilisateur</button>
    <div className="role-cards">{Object.entries(permissions).map(([r,d])=><div key={r}><LockKeyhole size={17}/><b>{r}</b><span>{d}</span></div>)}</div>
    <div className="data-panel user-table"><div className="data-row data-head"><span>UTILISATEUR</span><span>IDENTIFIANT</span><span>RÔLE ET DROITS</span><span>RESPONSABLE</span><span>ACTIVATION</span><span></span></div>{list.map(u=><div className="data-row" key={u.id}><div className="entity"><i>{u.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</i><b>{u.name}</b></div><span><Mail size={13}/>{u.identifier||u.email}</span><span><b>{u.role}</b><small>{u.modules?.length||0} module(s) autorisé(s)</small></span><span><UserRound size={13}/>{u.manager||"Non affecté"}</span><span className={`status ${u.authStatus==="Actif"?"ok":"wait"}`}>{u.authStatus||"Actif"}</span><div className="user-actions"><button className="edit-user" onClick={()=>onInvite(u)} title="Envoyer ou renvoyer l’invitation"><Send size={15}/></button><button className="edit-user" onClick={()=>onEdit(u)} title="Modifier"><Pencil size={15}/></button><button className="trash" onClick={()=>remove(u.id)} title="Supprimer"><Trash2 size={16}/></button></div></div>)}</div>
    <ActivityJournal/>
  </ModuleTop>;
}

function ActivityJournal() {
  const [logs,setLogs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        const response=await authFetch("/api/activity-logs?limit=40");
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Journal indisponible");
        if(!cancelled) setLogs(data.logs||[]);
      } catch(err) {
        if(!cancelled) setError(String(err?.message||"Journal indisponible"));
      } finally {
        if(!cancelled) setLoading(false);
      }
    })();
    return ()=>{cancelled=true;};
  },[]);
  const actionLabel=action=>({
    "client.create":"Création client",
    "client.update":"Modification client",
    "client.delete":"Suppression client",
    "devis.create":"Création devis",
    "devis.update":"Modification devis",
    "devis.price_change":"Modification prix",
    "devis.discount_change":"Modification remise",
    "devis.validate":"Validation devis",
    "devis.delete":"Suppression devis",
    "user.invite":"Invitation utilisateur",
    "user.role_change":"Changement de rôle",
    "user.permissions_change":"Changement de permissions",
  }[action]||action);
  return <section className="activity-journal">
    <div className="activity-journal-head"><b>Journal d’activité</b><span>Traçabilité des actions sensibles</span></div>
    {loading&&<p className="dashboard-loading">Chargement du journal…</p>}
    {error&&<p className="access-info">{error}</p>}
    {!loading&&!error&&!logs.length&&<p className="access-info">Aucune action journalisée pour le moment.</p>}
    <div className="activity-journal-list">
      {logs.map(log=><article key={log.id} className="activity-journal-item">
        <div><b>{actionLabel(log.action)}</b><span>{log.entityLabel||log.entityType||"—"}</span></div>
        <small>{log.userName||"Système"} · {log.createdAt?new Date(log.createdAt).toLocaleString("fr-FR"):""}</small>
      </article>)}
    </div>
  </section>;
}
function AccessDenied({role}) {
  return <div className="placeholder"><div><LockKeyhole size={30}/></div><p>ACCÈS RESTREINT</p><h1>Espace non autorisé</h1><span>{role?`Votre rôle (${role}) ne permet pas d’accéder à cet espace.`:"Connectez-vous avec un compte autorisé pour continuer."}</span></div>;
}
function Placeholder({title}) { return <div className="placeholder"><div><HardHat size={30}/></div><p>MODULE MKL ÉNERGIES</p><h1>{title}</h1><span>Ce module sera connecté dans le prochain lot fonctionnel.</span></div>; }

function InvitationModal({user,close,toast}) {
  const crmUrl=window.location.origin;
  const prepareEmail=()=>{
    const subject=encodeURIComponent("Accès MKL Énergies CRM");
    const body=encodeURIComponent(`Bonjour ${user.name},\n\nVotre accès MKL Énergies CRM est prêt.\n\nIdentifiant : ${user.email}\nLien : ${crmUrl}\n\nCordialement,\nMKL Énergies`);
    window.location.href=`mailto:${user.email}?subject=${subject}&body=${body}`;
  };
  return <div className="backdrop"><div className="modal invitation-modal"><button className="modal-close" onClick={close}><X/></button><div className="modal-icon"><Mail/></div><h2>Utilisateur créé</h2><p>Le compte a été enregistré dans le CRM.</p><div className="invite-summary"><span>UTILISATEUR</span><b>{user.name}</b><span>IDENTIFIANT</span><b>{user.email}</b><span>STATUT</span><b className="pending">Actif</b></div><div className="invite-actions"><button className="primary" onClick={prepareEmail}><Send size={16}/>Préparer l’email</button></div></div></div>;
}

function Modal({type,close,submit,clients,billing,groups,articles,brands=[],bundles,team,commercials=[],canAssignCommercial=false,canManageCatalog=false,editingBilling,editingProspect,editingUser,editingClient,editingArticle,editingBrand,brandLogoDraft="",onBrandLogoDraft,defaultBillingKind}) {
  const nextNumber = kind => `${kind==="Devis"?"DEV":kind==="Pro forma"?"PRO":"FAC"}-2026-${String(billing.filter(d=>d.kind===kind).length+43).padStart(3,"0")}`;
  const cfg={prospect:[editingProspect?"Modifier le prospect":"Nouveau prospect",editingProspect?"Mettez à jour sa fiche commerciale et son étape.":"Ajoutez une opportunité au pipeline.",Users],client:[editingClient?"Modifier le client":"Nouveau client",editingClient?"Mettez à jour la fiche client centralisée.":"Créez une fiche client complète et sécurisée.",Building2],contract:["Nouveau contrat","Planifiez le suivi d’une installation.",Wrench],billing:[editingBilling?"Modifier le document":"Nouveau devis ou facture",editingBilling?"Modifiez les informations et enregistrez les changements.":"Créez un document commercial avec calcul automatique.",ReceiptText],article:[editingArticle?"Modifier l’article":"Nouvel article",editingArticle?"Mettez à jour la fiche catalogue.":"Ajoutez un article unique pour les devis.",Package],brand:[editingBrand?"Modifier la marque":"Nouvelle marque",editingBrand?"Mettez à jour le nom ou le logo.":"Enregistrez une marque avec son logo pour le catalogue.",Tag],group:["Nouvelle sous-catégorie","Rattachez-la à l’une des trois catégories principales.",Layers3],bundle:["Nouveau groupe d’articles","Réunissez plusieurs articles distincts avec leur tarif.",Library],visit:["Nouvelle visite technique","Planifiez la visite sans modifier le devis.",Eye],supplier:["Nouveau fournisseur","Ajoutez ses coordonnées pour l’envoi des demandes de chiffrage.",Truck],user:[editingUser?"Modifier l’utilisateur":"Nouvel utilisateur",editingUser?"Modifiez sa fiche, son rôle et ses accès.":"Invitez un collaborateur et attribuez ses droits.",ShieldCheck]}[type];
  const [title,sub,Icon]=cfg;
  return <div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget) close();}}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button type="button" className="modal-close" onClick={close}><X/></button><div className="modal-icon"><Icon/></div><h2>{title}</h2><p>{sub}</p><form onSubmit={e=>submit(e,type)}>
    {type==="prospect"&&<><label>Entreprise ou nom du prospect<input name="name" required placeholder="Nom et prénom ou raison sociale" defaultValue={editingProspect?.name}/></label><div className="form-row"><label>Téléphone<input name="phone" type="tel" required defaultValue={editingProspect?.phone}/></label><label>Adresse email<input name="email" type="email" defaultValue={editingProspect?.email}/></label></div><div className="form-row"><label>Ville<input name="city" required defaultValue={editingProspect?.city}/></label><label>Projet<select name="type" defaultValue={editingProspect?.type||"Photovoltaïque"}><option>Photovoltaïque</option><option>Pompe à chaleur</option><option>Climatisation</option><option>Ballon thermodynamique</option><option>Adoucisseur d’eau</option><option>Ombrière</option><option>Autre</option></select></label></div><div className="form-row"><label>Montant estimé (€)<input name="value" type="number" min="0" defaultValue={editingProspect?.value||0}/></label><label>Origine<select name="source" defaultValue={editingProspect?.source||"Appel entrant"}><option>Appel entrant</option><option>Site internet</option><option>Prospection</option><option>Recommandation</option><option>Partenaire</option><option>Salon</option><option>Autre</option></select></label></div>{editingProspect&&<div className="form-row"><label>Étape<select name="stage" defaultValue={editingProspect.stage||"Nouveau"}><option>Nouveau</option><option>À contacter</option><option>Qualifié</option><option>Rendez-vous planifié</option><option>Étude</option><option>Devis envoyé</option><option>Négociation</option><option>Gagné</option><option>Perdu</option></select></label><label>Commercial actuel<input value={editingProspect.owner||"Non affecté"} readOnly/></label></div>}<div className="form-section-title">RENDEZ-VOUS FACULTATIF</div><div className="form-row"><label>Date et heure<input name="appointmentAt" type="datetime-local"/></label><label>Durée<select name="duration"><option value="60">1 heure</option><option value="30">30 minutes</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label></div><label>Notes commerciales<textarea name="notes" rows="3" placeholder="Besoin, disponibilité, informations utiles…" defaultValue={editingProspect?.notes}/></label></>}
    {type==="client"&&<ClientFields client={editingClient} commercials={commercials} canAssignCommercial={canAssignCommercial}/>}
    {type==="contract"&&<><div className="form-row"><label>Client<select name="client">{clients.map(c=><option key={c.id}>{c.name}</option>)}</select></label><label>N° de contrat<input name="number" required placeholder="ENT-2026-…"/></label></div><label>Prestation<select name="type"><option>Maintenance préventive</option><option>Solaire + PAC</option><option>Supervision et dépannage</option></select></label><div className="form-row"><label>Périodicité<select name="frequency"><option>Annuelle</option><option>Semestrielle</option><option>Trimestrielle</option></select></label><label>Prochaine visite<input name="next" type="date" required/></label></div><div className="form-row"><label>Montant annuel (€)<input name="amount" type="number" required/></label><label>Statut<select name="status"><option>Actif</option><option>À planifier</option><option>Suspendu</option></select></label></div></>}
    {type==="billing"&&<BillingFields clients={clients} articles={articles} brands={brands} bundles={bundles} nextNumber={nextNumber(defaultBillingKind)} document={editingBilling} defaultKind={defaultBillingKind} canManageCatalog={canManageCatalog}/>}
    {type==="article"&&<ArticleFields key={editingArticle?.id||"new-article"} article={editingArticle} brands={brands}/>}
    {type==="brand"&&<BrandFields key={editingBrand?.id||"new-brand"} brand={editingBrand} logoUrl={brandLogoDraft} onLogoUrlChange={onBrandLogoDraft}/>}
    {type==="group"&&<CategoryFields groups={groups}/>}
    {type==="supplier"&&<><label>Raison sociale<input name="name" required/></label><div className="form-row"><label>Nom du contact<input name="contact" required/></label><label>Adresse email<input name="email" type="email" required/></label></div><div className="form-row"><label>Téléphone<input name="phone"/></label><label>Spécialité<input name="specialty" placeholder="Photovoltaïque, chauffage…"/></label></div></>}
    {type==="visit"&&<><label>Client<select name="client">{clients.map(c=><option key={c.id}>{c.name}</option>)}</select></label><div className="form-row"><label>Date de visite<input name="date" type="date" required/></label><label>Technicien<select name="technician">{team.filter(u=>u.role==="Technicien"||u.role==="Responsable technique").map(u=><option key={u.id}>{u.name}</option>)}</select></label></div><label>Devis associé<select name="quoteNumber">{billing.filter(d=>d.kind==="Devis").map(d=><option key={d.id}>{d.number}</option>)}</select></label></>}
    {type==="bundle"&&<BundleFields articles={articles}/>}
    {type==="user"&&<UserFields team={team} user={editingUser}/>}
    <button className="primary submit" type="submit">{editingBilling||editingProspect||editingUser||editingClient||editingArticle||editingBrand?<Pencil size={18}/>:<Plus size={18}/>} {editingBilling||editingProspect||editingUser||editingClient||editingArticle||editingBrand?"Enregistrer les modifications":"Créer"}</button></form></div></div>;
}
function ClientFields({client,commercials=[],canAssignCommercial=false}) {
  const [customerType,setCustomerType]=useState(client?.customerType||"Particulier");
  return <div className="client-fields">
    <label>Type de client<select name="customerType" value={customerType} onChange={e=>setCustomerType(e.target.value)}>{CLIENT_TYPES.map(type=><option key={type}>{type}</option>)}</select></label>
    <label>Civilité<select name="civilite" defaultValue={client?.civilite||""}><option value="">Non renseignée</option><option>M.</option><option>Mme</option><option>Mlle</option></select></label>
    {customerType!=="Particulier"&&<label>Raison sociale / entreprise<input name="company" required placeholder="Nom de l’entreprise" defaultValue={client?.company}/></label>}
    <div className="form-row"><label>Prénom<input name="firstName" required={customerType==="Particulier"} defaultValue={client?.firstName}/></label><label>Nom<input name="lastName" required={customerType==="Particulier"} defaultValue={client?.lastName}/></label></div>
    <div className="form-row"><label>Téléphone fixe<input name="phone" type="tel" placeholder="06 12 34 56 78" defaultValue={client?.phone}/></label><label>Téléphone mobile<input name="mobile" type="tel" placeholder="06 12 34 56 78" defaultValue={client?.mobile}/></label></div>
    <label>Adresse email<input type="email" name="email" defaultValue={client?.email}/></label>
    <label>Adresse<input name="address" required placeholder="Numéro et nom de voie" defaultValue={client?.address}/></label>
    <label>Complément d’adresse<input name="addressComplement" placeholder="Bâtiment, étage, résidence…" defaultValue={client?.addressComplement}/></label>
    <div className="form-row"><label>Code postal<input name="postalCode" required inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="44000" defaultValue={client?.postalCode} onInput={e=>{e.currentTarget.value=e.currentTarget.value.replace(/\D/g,"").slice(0,5);}}/></label><label>Ville<input name="city" required defaultValue={client?.city}/></label></div>
    <div className="form-row"><label>Type de projet<select name="projectType" defaultValue={client?.projectType||"Pompe à chaleur"}><option>Pompe à chaleur</option><option>Climatisation</option><option>Ballon thermodynamique</option><option>Photovoltaïque</option><option>Adoucisseur d’eau</option><option>Contrat d’entretien</option><option>Autre</option></select></label><label>Statut<select name="status" defaultValue={client?.status||"Prospect"}>{CLIENT_STATUSES.map(status=><option key={status}>{status}</option>)}</select></label></div>
    <label>Installation ou équipement existant<input name="install" placeholder="Ex. PAC 8 kW, photovoltaïque 9 kWc" defaultValue={client?.install}/></label>
    <div className="form-row">{canAssignCommercial?<label>Commercial responsable<select name="commercialId" defaultValue={client?.commercialId||""}><option value="">Non affecté</option>{commercials.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>:<input type="hidden" name="commercialId" value={client?.commercialId||""}/>}<label>Origine du contact<select name="source" defaultValue={client?.source||"Appel entrant"}><option>Recommandation</option><option>Site internet</option><option>Appel entrant</option><option>Prospection</option><option>Salon</option><option>Partenaire</option><option>Ancien client</option><option>Autre</option></select></label></div>
    <label>Notes et informations utiles<textarea name="notes" rows="4" placeholder="Accès chantier, disponibilités, besoins particuliers…" defaultValue={client?.notes}/></label>
    <label className="client-consent"><input type="checkbox" name="consent" defaultChecked={Boolean(client?.consent)}/>Le client accepte d’être contacté dans le cadre de son projet.</label>
  </div>;
}
function ArticleFields({article,brands=[]}) {
  const defaultCategory=ARTICLE_CATEGORIES.includes(article?.category)?article.category:(article?.category?"Autre":"Photovoltaïque");
  const activeBrands=brands.filter(brand=>brand.active!==false&&brand.status!=="Inactif");
  const defaultBrandId=article?.brandId
    || activeBrands.find(brand=>brand.name===article?.brand)?.id
    || brands.find(brand=>brand.name===article?.brand)?.id
    || "";
  return <div className="article-fields">
    <div className="form-row"><label>Référence<input name="code" required placeholder="Ex. PV-450W" defaultValue={article?.code}/></label>
      <label>Marque<select name="brandId" required defaultValue={defaultBrandId}>
        <option value="">Choisir une marque…</option>
        {activeBrands.map(brand=><option key={brand.id} value={brand.id}>{brand.name}</option>)}
        {defaultBrandId&&!activeBrands.some(brand=>String(brand.id)===String(defaultBrandId))&&article?.brand&&<option value={defaultBrandId}>{article.brand} (inactive)</option>}
      </select>
      {!activeBrands.length&&<small>Créez d’abord une marque dans l’onglet Marques.</small>}
      </label>
    </div>
    <label>Désignation<input name="name" required placeholder="Nom du produit ou service" defaultValue={article?.name}/></label>
    <div className="form-row"><label>Catégorie<select name="category" defaultValue={defaultCategory}>{ARTICLE_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label><label>Sous-catégorie<input name="subcategory" placeholder="Optionnel" defaultValue={article?.subcategory}/></label></div>
    <label>Description commerciale<textarea name="description" rows="2" placeholder="Texte visible sur le devis" defaultValue={article?.description}/></label>
    <label>Description technique<textarea name="technicalDescription" rows="2" placeholder="Caractéristiques techniques internes" defaultValue={article?.technicalDescription}/></label>
    <div className="form-row"><label>Unité<select name="unit" defaultValue={article?.unit||"Unité"}>{ARTICLE_UNITS.map(unit=><option key={unit}>{unit}</option>)}</select></label><label>TVA<select name="tax" defaultValue={String(article?.tax??20)}><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 %</option></select></label></div>
    <div className="form-row"><label>Prix d’achat HT (€)<input name="buy" type="number" min="0" step="0.01" required defaultValue={article?.buy??""}/></label><label>Prix de vente HT (€)<input name="sell" type="number" min="0" step="0.01" required defaultValue={article?.sell??""}/></label></div>
    <div className="form-row"><label>Statut<select name="status" defaultValue={article?.status||"Actif"}><option>Actif</option><option>Inactif</option></select></label><label>Puissance (W)<input name="powerW" type="number" min="0" step="1" placeholder="Optionnel — PV" defaultValue={article?.powerW??""}/></label></div>
  </div>;
}
function BrandFields({brand,logoUrl="",onLogoUrlChange}) {
  const [logoError,setLogoError]=useState("");
  async function onLogoChange(event) {
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file) return;
    setLogoError("");
    try {
      const dataUrl=await resizeBrandLogoFile(file);
      onLogoUrlChange?.(dataUrl);
    } catch(error) {
      setLogoError(String(error?.message||"Import logo impossible"));
    }
  }
  return <div className="brand-fields">
    <label>Nom de la marque<input name="name" required placeholder="Ex. Dualsun, Daikin, Atlantic…" defaultValue={brand?.name}/></label>
    <div className="brand-logo-editor">
      <div className="brand-logo-preview">{logoUrl?<img src={logoUrl} alt=""/>:<span><Tag size={22}/>Sans logo</span>}</div>
      <div>
        <label className="secondary import-button"><Upload size={16}/>Importer un logo<input type="file" accept="image/*" onChange={onLogoChange}/></label>
        {logoUrl&&<button type="button" className="wizard-link" onClick={()=>onLogoUrlChange?.("")}>Retirer le logo</button>}
        <small>PNG ou JPG — compressé automatiquement pour l’enregistrement.</small>
        {logoError&&<small className="field-error">{logoError}</small>}
      </div>
    </div>
    <label>Statut<select name="status" defaultValue={brand?.status||"Actif"}><option>Actif</option><option>Inactif</option></select></label>
  </div>;
}
function BundleFields({articles}) {
  const [selected,setSelected]=useState([]);
  const toggle=article=>setSelected(selected.some(item=>item.id===article.id)?selected.filter(item=>item.id!==article.id):[...selected,{...article,price:article.sell}]);
  const update=(id,field,value)=>setSelected(selected.map(item=>item.id===id?{...item,[field]:field==="price"?Number(value):value}:item));
  const total=selected.reduce((sum,item)=>sum+Number(item.price||0),0);
  return <div className="bundle-fields"><label>Nom du groupe<input name="name" required placeholder="Ex. Pack pompe à chaleur complet"/></label><label>Famille<select name="family"><option>Climatisation</option><option>Pompe à chaleur</option><option>Ballon d’eau chaude</option><option>Panneaux photovoltaïques</option><option>Adoucisseur d’eau</option><option>Autre</option></select></label><div className="bundle-picker"><div className="bundle-picker-title"><b>Composition du groupe</b><span>Sélectionnez les articles puis adaptez leur libellé et leur tarif.</span></div>{articles.filter(article=>article.status!=="Inactif").map(article=>{const item=selected.find(selectedItem=>selectedItem.id===article.id);return <div className={item?"selected":""} key={article.id}><label><input type="checkbox" checked={Boolean(item)} onChange={()=>toggle(article)}/><span>{article.code} — {article.name}<small>{article.category}</small></span></label>{item&&<div className="bundle-line-fields"><label>Libellé dans le groupe<input type="text" value={item.name} onChange={e=>update(article.id,"name",e.target.value)} required/></label><label>Tarif HT (€)<input type="number" min="0" step="0.01" value={item.price} onChange={e=>update(article.id,"price",e.target.value)} required/></label></div>}</div>})}{selected.length>0&&<div className="bundle-total"><span>{selected.length} article(s) dans ce groupe</span><b>Total HT : {euro(total)}</b></div>}</div><input type="hidden" name="items" value={JSON.stringify(selected.map(({code,name,category,price})=>({code,name,category,price})))}/></div>;
}
function CategoryFields({groups}) {
  const categories=groups.filter(group=>!group.parent);
  return <div className="category-fields"><div className="fixed-categories"><LockKeyhole size={16}/><span>Les catégories principales sont fixes : Grand matériel, Petite fourniture et Installation.</span></div><label>Catégorie principale<select name="parent">{categories.map(category=><option key={`parent-category-${category.name}`}>{category.name}</option>)}</select></label><div className="form-row"><label>Code de la sous-catégorie<input name="code" required placeholder="Ex. CLIM"/></label><label>Marge par défaut (%)<input name="margin" type="number" min="0" step="0.1" required/></label></div><label>Nom de la sous-catégorie<input name="name" required placeholder="Ex. Climatisation"/></label><label>Description<input name="description" placeholder="Produits et services inclus"/></label></div>;
}
function UserFields({team,user}) {
  const [role,setRole]=useState(user?.role||"Commercial");
  const [allowed,setAllowed]=useState(user?.modules||roleDefaults[user?.role]||roleDefaults.Commercial);
  const commercialManagers=team.filter(u=>u.role==="Responsable commercial"||u.role==="Admin VIP");
  const technicalManagers=team.filter(u=>u.role==="Responsable technique"||u.role==="Admin VIP");
  const needsCommercial=role==="Commercial";
  const needsTechnical=role==="Technicien";
  const managers=needsCommercial?commercialManagers:needsTechnical?technicalManagers:team.filter(u=>u.role==="Admin VIP");
  return <div className="user-fields">
    <label>Nom complet<input name="name" required defaultValue={user?.name||""}/></label>
    <label>Adresse email<input type="email" name="email" required defaultValue={user?.email||""}/></label>
    <label>Catégorie d’utilisateur<select name="role" value={role} onChange={e=>{setRole(e.target.value);setAllowed(roleDefaults[e.target.value]);}}>{Object.keys(permissions).map(r=><option key={r}>{r}</option>)}</select></label>
    <div className="permission-detail"><LockKeyhole size={17}/><div><b>Droits accordés</b><span>{permissions[role]}</span></div></div>
    <div className="module-access"><div className="module-access-head"><div><b>Accès aux modules</b><span>Cochez uniquement les espaces autorisés</span></div><button type="button" onClick={()=>setAllowed(allowed.length===accessModules.length?[]:accessModules)}>{allowed.length===accessModules.length?"Tout retirer":"Tout sélectionner"}</button></div><div className="module-checks">{accessModules.map(module=><label key={module} className={allowed.includes(module)?"checked":""}><input type="checkbox" checked={allowed.includes(module)} onChange={()=>setAllowed(allowed.includes(module)?allowed.filter(x=>x!==module):[...allowed,module])}/><CheckCircle2 size={15}/><span>{module}</span></label>)}</div></div>
    <input type="hidden" name="modules" value={JSON.stringify(allowed)}/>
    <label>Responsable hiérarchique<select name="manager" required={needsCommercial||needsTechnical} defaultValue={user?.manager||undefined}>{!needsCommercial&&!needsTechnical&&<option value="Direction">Direction / non applicable</option>}{managers.filter(u=>u.id!==user?.id).map(u=><option value={u.name} key={u.id}>{u.name} — {u.role}</option>)}</select></label>
    {needsCommercial&&commercialManagers.length===0&&<div className="access-warning">Créez d’abord un Responsable commercial ou un Admin VIP.</div>}
    {needsCommercial&&<div className="permission-note"><UserRound size={16}/>Le commercial sera obligatoirement rattaché à ce responsable.</div>}
  </div>;
}
function BillingFields({clients,articles,brands=[],bundles,nextNumber,document,defaultKind,canManageCatalog=false}) {
  const kind=document?.kind||defaultKind||"Devis";
  const statusOptions=statusesForKind(kind);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [selectedBundle,setSelectedBundle]=useState(bundles[0]?.id||"");
  const [bundleSearch,setBundleSearch]=useState("");
  const [statusHistory,setStatusHistory]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const resolveClientId=(list,doc)=>{
    if(!list?.length) return "";
    if(doc?.clientId!=null&&list.some(client=>String(client.id)===String(doc.clientId))) return String(doc.clientId);
    if(doc?.client) {
      const byName=list.find(client=>client.name===doc.client);
      if(byName) return String(byName.id);
    }
    return String(list[0].id);
  };
  const [selectedClientId,setSelectedClientId]=useState(()=>resolveClientId(clients,document));
  const existingItems=document?.items?.length?document.items:document?[{id:Date.now(),code:"",name:document.label,qty:1,unit:document.amount,tax:document.tax??20,discountType:"percent",discountValue:0}]:[];
  const [items,setItems]=useState(existingItems);
  const [tax,setTax]=useState(Number(document?.tax??20));
  const [globalDiscountType,setGlobalDiscountType]=useState(document?.globalDiscountType||"percent");
  const [globalDiscountValue,setGlobalDiscountValue]=useState(Number(document?.globalDiscountValue||0));
  const [electricityOperator,setElectricityOperator]=useState(document?.electricityOperator||"");
  const totals=billingTotals({items,tax,globalDiscountType,globalDiscountValue});
  const isPhotovoltaic=items.some(item=>`${item.name||""} ${item.category||""} ${item.subcategory||""} ${item.code||""}`.toLowerCase().includes("photovolta"));
  const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const bundleSearchWords=normalize(bundleSearch).split(/\s+/).filter(Boolean);
  const filteredBundles=bundles.filter(bundle=>bundleSearchWords.every(word=>normalize(`${bundle.name} ${bundle.family} ${(bundle.items||[]).map(item=>`${item.code} ${item.name} ${item.category}`).join(" ")}`).includes(word)));
  const selectedClient=clients.find(client=>String(client.id)===String(selectedClientId))||{};
  useEffect(()=>{
    if(!clients.length) {
      if(selectedClientId) setSelectedClientId("");
      return;
    }
    const stillValid=clients.some(client=>String(client.id)===String(selectedClientId));
    if(stillValid) return;
    setSelectedClientId(resolveClientId(clients,document));
  },[clients,document?.id,document?.clientId,document?.client]);
  useEffect(()=>{
    if(!filteredBundles.some(bundle=>String(bundle.id)===String(selectedBundle))) setSelectedBundle(filteredBundles[0]?.id||"");
  },[bundleSearch,bundles]);
  useEffect(()=>{
    const id=document?.id;
    if(!id||!String(id).includes("-")) {
      setStatusHistory([]);
      return;
    }
    let cancelled=false;
    setHistoryLoading(true);
    authFetch(`/api/devis/${id}/historique`)
      .then(async response=>{
        const data=await response.json().catch(()=>({}));
        if(!cancelled&&response.ok) setStatusHistory(Array.isArray(data.history)?data.history:[]);
      })
      .catch(()=>{ if(!cancelled) setStatusHistory([]); })
      .finally(()=>{ if(!cancelled) setHistoryLoading(false); });
    return ()=>{ cancelled=true; };
  },[document?.id]);
  function addBundle() {
    const bundle=bundles.find(item=>String(item.id)===String(selectedBundle));
    if(!bundle) return;
    const now=Date.now();
    const bundleItems=(bundle.items||[]).map((item,index)=>{
      const article=articles.find(articleItem=>articleItem.code===item.code);
      return {id:now+index,code:item.code,name:item.name,description:article?.description||"",category:item.category||article?.category||"",subcategory:article?.subcategory||"",qty:1,unit:Number(item.price||article?.sell||0),tax:article?.tax??tax,discountType:"percent",discountValue:0,bundleId:bundle.id,bundleName:bundle.name};
    });
    setItems([...items,...bundleItems]);
  }
  function update(id,key,value) { setItems(items.map(item=>item.id===id?{...item,[key]:value}:item)); }
  const currentStatus=statusOptions.includes(document?.status)?document.status:(document?.status||"Brouillon");
  return <div className="billing-fields">
    <input type="hidden" name="kind" value={kind}/><div className="form-row"><label>Type de document<input value={kind} readOnly/></label><label>Numéro{document?.number?<input name="number" readOnly defaultValue={document.number}/>:<><input name="number" readOnly defaultValue="" placeholder="Attribué automatiquement"/><small>Le numéro DEV/FAC/PRO est généré à l’enregistrement.</small></>}</label></div>
    <label>Client CRM<select name="clientId" required value={selectedClientId} onChange={e=>setSelectedClientId(e.target.value)}>{!clients.length&&<option value="">Aucun client — créez-en un d’abord</option>}{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` — ${c.city}`:""}</option>)}</select></label>
    <input type="hidden" name="client" value={selectedClient.name||""}/>
    {!clients.length?<div className="quote-client-preview empty"><Building2 size={18}/><span><b>Aucun client disponible</b><em>Créez d’abord une fiche dans Clients, puis revenez créer le devis.</em></span></div>:<div className="quote-client-preview"><div><UserRound size={18}/><span><small>CLIENT / DESTINATAIRE (fiche CRM)</small><b>{selectedClient.company||selectedClient.name||"Client à sélectionner"}</b>{selectedClient.contact&&selectedClient.contact!==selectedClient.name&&<em>{selectedClient.contact}</em>}</span></div><p><MapPin size={15}/><span>{[selectedClient.address,selectedClient.postalCode,selectedClient.city].filter(Boolean).join(" ")||"Adresse complète à renseigner dans la fiche client"}</span></p><p><Phone size={15}/><span>{selectedClient.mobile||selectedClient.phone||"Téléphone à renseigner"}</span></p><p><Mail size={15}/><span>{selectedClient.email||"Email à renseigner"}</span></p></div>}
    <div className="quote-catalog-pickers">
      <section className="quote-catalog-card quote-catalog-main">
        <div className="quote-catalog-title"><Package size={18}/><div><b>Catalogue par famille</b><span>Catégorie → Marque → Matériel (PV, clim, chauffage…)</span></div></div>
        <button type="button" className="primary add-quote-article wizard-open-btn" onClick={()=>setPickerOpen(true)}><Plus size={16}/>Ajouter un article</button>
        <small className="quote-catalog-hint">La main-d’œuvre se choisit dans chaque famille (ex. pose photovoltaïque), pas comme catégorie à part.</small>
      </section>
      <section className="quote-catalog-card bundle"><div className="quote-catalog-title"><Library size={18}/><div><b>Ajouter un groupe d’articles</b><span>Pack multi-lignes (panneaux + onduleur + pose…)</span></div></div><div className="article-search"><Search size={17}/><input type="search" value={bundleSearch} onChange={e=>setBundleSearch(e.target.value)} placeholder="Rechercher un groupe…"/><span>{filteredBundles.length}</span></div><div className="article-picker"><label>Groupe trouvé<select value={selectedBundle} onChange={e=>setSelectedBundle(e.target.value)}>{filteredBundles.length?<>{filteredBundles.map(bundle=><option value={bundle.id} key={bundle.id}>{bundle.name} — {bundle.items?.length||0} article(s) ({euro((bundle.items||[]).reduce((sum,item)=>sum+Number(item.price||0),0))})</option>)}</>:<option value="">Aucun groupe trouvé</option>}</select></label><button type="button" className="primary add-quote-article" disabled={!selectedBundle} onClick={addBundle}><Plus size={16}/>Ajouter le groupe</button></div></section>
    </div>
    {pickerOpen&&<ArticlePickerWizard articles={articles} brandCatalog={brands} defaultTax={tax} includeInactive={canManageCatalog} onAdd={line=>setItems(current=>[...current,line])} onClose={()=>setPickerOpen(false)}/>}
    <div className="quote-lines">
      <div className="quote-line quote-head"><span>ARTICLE</span><span>QTÉ</span><span>PRIX HT</span><span>TVA</span><span>REMISE</span><span>VALEUR</span><span>TOTAL TTC</span><span></span></div>
      {items.length===0&&<div className="quote-empty"><Package size={20}/><span>Ajoutez un article via le catalogue, ou un groupe d’articles</span></div>}
      {totals.lines.map((item,index)=><div className="quote-line" key={`${item.id||"line"}-${item.code||"article"}-${index}`}><span><b>{item.name}</b><small>{item.code}{item.bundleName?` • ${item.bundleName}`:""}</small></span><input aria-label="Quantité" type="number" min="0.01" step="0.01" value={item.qty} onChange={e=>update(item.id,"qty",e.target.value)}/><input aria-label="Prix unitaire HT" type="number" min="0" step="0.01" value={item.unit} onChange={e=>update(item.id,"unit",e.target.value)}/><select aria-label="Taux de TVA" value={item.tax??tax} onChange={e=>update(item.id,"tax",Number(e.target.value))}><option value="0">0 %</option><option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option></select><select aria-label="Type de remise" value={item.discountType||"percent"} onChange={e=>update(item.id,"discountType",e.target.value)}><option value="percent">%</option><option value="amount">€ TTC</option></select><input aria-label="Valeur de remise" type="number" min="0" step="0.01" value={item.discountValue||0} onChange={e=>update(item.id,"discountValue",e.target.value)}/><b>{euro(item.totalTTC)}</b><button type="button" onClick={()=>setItems(items.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button></div>)}
    </div>
    <div className="global-discount"><label>Remise globale<select name="globalDiscountType" value={globalDiscountType} onChange={e=>setGlobalDiscountType(e.target.value)}><option value="percent">Pourcentage (%)</option><option value="amount">Montant TTC (€)</option></select></label><label>Valeur<input name="globalDiscountValue" type="number" min="0" step="0.01" value={globalDiscountValue} onChange={e=>setGlobalDiscountValue(e.target.value)}/></label></div>
    <div className="quote-totals"><p><span>Sous-total TTC</span><b>{euro(totals.beforeGlobalTTC)}</b></p>{totals.globalDiscountTTC>0&&<p className="discount"><span>Remise globale</span><b>− {euro(totals.globalDiscountTTC)}</b></p>}<p className="grand-total"><span>Total TTC</span><b>{euro(totals.totalTTC)}</b></p></div>
    <input type="hidden" name="items" value={JSON.stringify(items)}/><input type="hidden" name="amount" value={totals.totalHT}/><input type="hidden" name="label" value={items.map(i=>i.name).join(", ")||"Devis sans article"}/>
    <div className="form-row"><label>Date d’émission<input name="date" type="date" required defaultValue={document?.date||new Date().toISOString().slice(0,10)}/></label><label>Date d’échéance<input name="due" type="date" required defaultValue={document?.due||""}/></label></div>
    {kind==="Devis"&&isPhotovoltaic&&<><div className="auto-pv-study"><CheckCircle2 size={18}/><div><b>Étude solaire MKL sélectionnée automatiquement</b><span>Elle sera préremplie avec le client, le prix, la puissance et les données du projet, sans aucune mention Climholia.</span></div></div><div className="grid-operator-block"><div className="financing-block"><Zap size={18}/><div><b>Gestionnaire du réseau électrique</b><span>Le mandat choisi sera rempli avec la fiche client et ajouté après le devis.</span></div></div><div className="operator-options">{electricityOperators.map(operator=><label key={operator.id} className={electricityOperator===operator.id?"selected":""}><input type="radio" name="electricityOperator" value={operator.id} checked={electricityOperator===operator.id} onChange={()=>setElectricityOperator(operator.id)}/><CheckCircle2 size={17}/><span><b>{operator.name}</b><small>Mandat de raccordement automatique</small></span></label>)}</div><label>Puissance photovoltaïque à raccorder (kWc)<input name="pvPowerKwp" type="number" min="0.1" step="0.1" required defaultValue={document?.pvPowerKwp||""}/></label></div></>}
    {kind==="Devis"&&<><div className="financing-block"><BadgeEuro size={18}/><div><b>Financement du projet</b><span>Ce pavé apparaîtra dans le devis.</span></div></div><div className="form-row"><label>Financeur<select name="financier" defaultValue={document?.financier||"Sans financement"}>{financiers.map(name=><option key={name}>{name}</option>)}</select></label><label>Montant financé (€)<input name="financedAmount" type="number" min="0" step="0.01" defaultValue={document?.financedAmount||""}/></label></div><div className="form-row"><label>Durée (mois)<input name="financeMonths" type="number" min="1" defaultValue={document?.financeMonths||""}/></label><label>Mensualité (€)<input name="monthlyPayment" type="number" min="0" step="0.01" defaultValue={document?.monthlyPayment||""}/></label></div><label>Date prévisionnelle de livraison<input name="deliveryDate" type="date" defaultValue={document?.deliveryDate||""}/><small>Sans cette date, le devis portera automatiquement la mention « PROJET ».</small></label></>}
    <div className="form-row"><label>TVA par défaut<select name="tax" value={tax} onChange={e=>setTax(Number(e.target.value))}><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 %</option></select></label><label>Statut<select name="status" defaultValue={currentStatus}>{!statusOptions.includes(currentStatus)&&<option value={currentStatus}>{currentStatus}</option>}{statusOptions.map(status=><option key={status}>{status}</option>)}</select></label></div>
    <label>Commentaire de changement de statut<input name="statusComment" placeholder="Optionnel — ex. client relancé par téléphone"/></label>
    {document?.id&&String(document.id).includes("-")&&<div className="devis-history"><div className="devis-history-head"><ClipboardList size={16}/><b>Historique des statuts</b></div>{historyLoading?<span className="devis-history-empty">Chargement…</span>:statusHistory.length===0?<span className="devis-history-empty">Aucun changement enregistré pour l’instant.</span>:<ul>{statusHistory.map(entry=><li key={entry.id}><span className={`status ${statusTone(entry.to)}`}>{entry.from?`${entry.from} → ${entry.to}`:entry.to}</span><small>{entry.date?new Date(entry.date).toLocaleString("fr-FR"):""}{entry.comment?` — ${entry.comment}`:""}</small></li>)}</ul>}</div>}
    <label>Mention libre en bas du document<textarea name="freeNote" rows="4" defaultValue={document?.freeNote||""} placeholder="Ex. Conditions particulières, délai d’intervention, informations complémentaires…"/></label>
  </div>;
}
function Kpi({icon:Icon,title,value,note,sub,tone}) { return <div className="kpi"><div className={`kpi-icon ${tone}`}><Icon size={20}/></div><div className="kpi-title">{title}<MoreHorizontal size={17}/></div><strong>{value}</strong><div className="kpi-foot"><em className={tone}>{note}</em><span>{sub}</span></div></div>; }
function PanelHead({title,sub,link}) { return <div className="panel-head"><div><h2>{title}</h2><p>{sub}</p></div><button>{link}<ChevronRight size={16}/></button></div>; }
