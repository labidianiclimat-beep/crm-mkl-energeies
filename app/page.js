"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRecordTable } from "./lib/use-record-table";
import { INSTALLATION_CHECKS, canEditInstallation, installationAssigneeLabel, installationBoards, installationCheckLabel, installationCheckValue, installationChecksFromForm, isFinishedInstallation, isSubcontractor, SUBCONTRACTOR_DOCUMENTS, SUBCONTRACTOR_SPECIALTIES, contractorDocumentReady } from "./lib/installation-planning";
import { canReadInstallationFinance, canWriteInstallationFinance, emptyInstallationFinance, financeToDraft, installationSalespeople, stripInstallationFinance, validateInstallationFinance } from "./lib/installation-finance";
import InstallationFinanceFields, { InstallationFinanceSummary } from "./components/installation-finance-fields";
import SubcontractorDocuments from "./components/subcontractor-documents";
import { DEFAULT_ARTICLE_GROUPS } from "./lib/org-state";
import { canAccessNav, canAccessWorkspace, homeFamiliesForRole, isVipOnlyNav, resolveAllowedModules, workspaceTitle } from "./lib/access-control";
import { authFetch, getCloudState, getCurrentProfile } from "./lib/supabase-rest";
import {
  LEGACY_STATE_KEYS,
  buildLegacyReport,
  legacyArticleToPayload,
  legacyAppointmentToPayload,
  legacyClientToPayload,
  legacyProspectToPayload,
  prospectIdentity,
  readLocalLegacyState,
} from "./lib/legacy-state-recovery";
import { canApplyRdvStatus, displayRdvStatus, isAppointmentOutcomeOnlyPatch, rdvStatusDeniedMessage, rdvStatusTone } from "./lib/appointment-status";
import { APPOINTMENT_MOVE_ERROR, agendaScheduleIsChanging, canCorrectAppointmentPhone, isAgendaAssignOrCommentPatch, isAgendaPhonePatch } from "./lib/agenda";
import { canAccessModule, canEditExistingAppointment, canEditExistingClient, canPerformAction, isAdminRole, isAdminVip } from "./lib/permissions";
import { canAssignClientCommercial, normalizeClientStatus } from "./lib/clients";
import { canAssignProspectCommercial, canDispatchProspects, canEditExistingProspect, canReviseProspect, canSeeDispatchQueue, FIELD_PROSPECTOR_MANAGERS, formatProspectWhen, isFieldProspector, isProspectDispatcher, matchesDirectoryFilters, parseSpecialties, peopleOptions, prospectMoment } from "./lib/prospect-dispatch";
import { isContactSheetProspect, latestRdvStatusForProspect, PROJECT_TYPES } from "./lib/prospects";
import { mergeRdvProspects } from "./lib/commercial-rdv-table";
import {
  acceptFieldSync,
  browserIsOffline,
  fieldStoreForUser,
  isNetworkFailure,
  localAppointmentFromPayload,
  localProspectFromPayload,
  markFieldSyncFailed,
  offlineLocalId,
  pendingFieldCount,
  queueFieldChange,
  readFieldStore,
  rememberFieldLists,
  sortFieldQueue,
  upsertById,
  writeFieldStore,
} from "./lib/offline-field";
import { ARTICLE_UNITS, articleUsesVat55, canDeleteArticles, canManageArticles, catalogArticleBrands, catalogArticleCategories, filterCatalogArticles } from "./lib/articles";
import { resizeBrandLogoFile } from "./lib/brands";
import { canInvoiceQuote, cloneDocumentForCreate, computeDocumentTotals, defaultQuoteDeliveryDate, defaultQuoteValidityDate, DEVIS_FINANCIERS, ELECTRICITY_OPERATORS, findQuoteByNumber, firstMonthlyDelayChoices, isDevisOwnerRole, isUnassignedDevis, isQuoteBundleStart, mustAssignDevisCommercial, quoteArticleRefs, quoteBundleHeading, quoteMatchesClientQuery, quoteStatusLabel, setQuoteBundleHeading, splitPersonName, statusesForKind, statusTone, todayIsoDate } from "./lib/devis";
import { filledQuoteItems, isPreparedFreeLine, withPreparedFreeLine } from "./lib/devis-wizard";
import { visibleProspects } from "./lib/prospect-to-client";
import { ACCESS_MODULES, ACTION_PERMISSIONS, extractGrantedActions, normalizeRoleLabel, persistProfileAccess, roleDescriptions, roleModuleDefaults, sanitizeGrantedModules } from "./lib/roles";
import { canViewTeamCommercialData } from "./lib/scoping";
import { logoutCrm } from "./components/crm-access-gate";
import { clearRolePreview } from "./lib/role-preview";
import PvAddressLookup from "./components/pv-address-lookup";
import PvCompleteStudyForm from "./components/pv-complete-study-form";
import PvTownHallDossier from "./components/pv-town-hall-dossier";
import { canCreateCompletePvStudy, canOpenSolarDossier, isCompletePvStudy } from "./lib/pv-study-kinds";
import { applyTownHallStatus, emptyTownHall, GRID_STATUSES, TOWN_HALL_STATUSES, townHallFromProject, townHallPieceProgress } from "./lib/pv-town-hall";
import CompleteAddressFields from "./components/complete-address-fields";
import RecipientConnect from "./components/recipient-connect";
import DirectorySearch, { DirectoryListSearch } from "./components/directory-search";
import { formatClientNumber } from "./lib/client-number";
import { PV_INCLINATIONS, PV_ORIENTATIONS } from "./lib/pv-production-simulator";
import { formatProspectNumber } from "./lib/prospect-number";
import { matchesOriginFilter, originFilterOptions } from "./lib/prospect-origin-view";
import ProspectOriginCell from "./components/prospect-origin-cell";
import CopyNumber from "./components/copy-number";
import { EXISTING_CLIENT_MESSAGE, findExistingClient, studySubject } from "./lib/existing-client";
import { matchesPersonListQuery } from "./lib/directory-search";
import ClientFields from "./components/client-fields";
import ArticlePickerWizard from "./components/article-picker-wizard";
import HeatPumpSpecFields from "./components/heat-pump-spec-fields";
import ClimOutdoorSpecFields from "./components/clim-outdoor-spec-fields";
import ClimIndoorSpecFields from "./components/clim-indoor-spec-fields";
import MicroInverterSpecFields from "./components/micro-inverter-spec-fields";
import InverterSpecFields from "./components/inverter-spec-fields";
import PvPanelSpecFields from "./components/pv-panel-spec-fields";
import BatterySpecFields from "./components/battery-spec-fields";
import OptimizerSpecFields from "./components/optimizer-spec-fields";
import ArticleCommercialDocField from "./components/article-commercial-doc-field";
import ArticleSellPriceField from "./components/article-sell-price-field";
import { articleHasCommercialDoc, downloadArticleCommercialDoc } from "./lib/article-commercial-doc";
import { isHeatPumpPath } from "./lib/heat-pump-specs";
import { isClimOutdoorPath } from "./lib/clim-outdoor-specs";
import { isClimIndoorPath } from "./lib/clim-indoor-specs";
import { isMicroInverterPath } from "./lib/micro-inverter-specs";
import { isInverterPath } from "./lib/inverter-specs";
import { isPvPanelPath } from "./lib/pv-panel-specs";
import { isBatteryPath } from "./lib/battery-specs";
import { isOptimizerPath } from "./lib/optimizer-specs";
import { atlanticHeatPumpArticles, downloadAtlanticHeatPumpTariff } from "./lib/heat-pump-tariff";
import BundleBuilderWizard from "./components/bundle-builder-wizard";
import QuoteBundleHeading from "./components/quote-bundle-heading";
import QuoteLinePrices from "./components/quote-line-prices";
import PvBundleOptions from "./components/pv-bundle-options";
import { pvBundleNeedsOptions } from "./lib/pv-quote-options";
import TariffGridsView from "./components/tariff-grids";
import { articleFormSubcategories, bundleDisplayedTotalHt, bundleLineTotal, bundleUsesForfait, findPickerFamily, forfaitPriceLabel, isPersistedTaxonomyId, itemsByRole, normalizeBundle, resolveBundlePath } from "./lib/article-picker";
import { groupBundlesByBrand, matchesBundleSearch } from "./lib/article-bundles";
import CatalogTaxonomyAdmin from "./components/catalog-taxonomy-admin";
import ProspectFields from "./components/prospect-fields";
import SignaturePad from "./components/signature-pad";
import DevisWizard from "./components/devis-wizard";
import DocumentWindow from "./components/document-window";
import DocumentParties, { frozenRecipient } from "./components/document-parties";
import ThermalStudyPage from "./etude-thermique/page";
import SizingNotePage from "./note-dimensionnement/page";
import { isSizingNote } from "./lib/sizing-note";
import PvSimulatorPage from "./simulateur-pv/page";
import PrevisitForm from "./previsite/page";
import MaintenanceForm from "./maintenance-form/page";
import DevisAnnexPicker from "./components/devis-annex-picker";
import { openDevisPrintWindow } from "./lib/devis-print";
import { downloadHtmlAsPdf } from "./lib/html-to-pdf";
import CompanyView from "./components/company-form";
import ClientRecord from "./components/client-record";
import { withScheduledPrevisit } from "./lib/client-followup";
import { DEFAULT_COMPANY, DOCUMENT_PARTIES_CSS, documentPartiesHtml } from "./lib/company";
import { useCompany } from "./lib/use-company";
import ActiveToggle, { isItemActive } from "./components/active-toggle";
import CommercialAgendaView from "./components/commercial-agenda";
import { popWorkspacePlace, pushWorkspacePlace, sameWorkspacePlace, workspaceBackLabel } from "./lib/workspace-nav";
import ProspectDispatchBoard from "./components/prospect-dispatch-board";
import ProspectingDashboard from "./components/prospecting-dashboard";
import WebLeadBacklog from "./components/web-lead-backlog";
import { canReviewWebLeads } from "./lib/web-lead-admin";
import { workloadByCommercial } from "./components/agenda-home";
import TicketTermWelcome from "./components/ticket-term-welcome";
import RdvStatuerAlert from "./components/rdv-statuer-alert";
import NotificationBell from "./components/notification-bell";
import UsageTracker from "./components/usage-tracker";
import ActivityJournalView from "./components/activity-journal";
import FleetModule from "./components/fleet-module";
import InternalRequestsModule from "./components/internal-requests-module";
import SavModule from "./components/sav-module";
import EntretienModule from "./components/entretien-module";
import {
  LayoutDashboard, Users, Building2, HardHat, Wrench, CalendarCheck,
  Search, Plus, ChevronRight, ChevronLeft, MapPin, Clock3, Zap, Euro,
  TrendingUp, Phone, MoreHorizontal, Menu, X, CircleDashed,
  CalendarDays, UserRound, FileText, ShieldCheck, Landmark,
  Download, FileSpreadsheet, CheckCircle2, LockKeyhole, Mail,
  Trash2, RefreshCw, ReceiptText, Send, CircleDollarSign, Package, Car,
  Layers3, Upload, Pencil, ClipboardList, AlertTriangle, Truck, Inbox,
  Eye, ShoppingCart, Library, BadgeEuro, LogOut, ArrowLeft, Sun, Tag, Copy, PenLine, Flame, Camera, ScrollText, Table2, Ruler
} from "lucide-react";

const nav = [
  ["Applications", Package],
  ["Vue d’ensemble", LayoutDashboard], ["Prospects", Users],
  ["Suivi commerciaux", Table2],
  ["Agenda commercial", CalendarDays],
  ["Clients", Building2], ["Chantiers", HardHat],
  ["Équipes d’installation", Users],
  ["Maintenance", Wrench], ["Parc automobile", Car], ["SAV", Phone], ["Tickets internes", Inbox], ["Planning", CalendarCheck],
  ["Photovoltaïque administratif", Zap],
  ["Visites techniques", Eye], ["Devis", FileText], ["Études thermiques", Flame], ["Note de dimensionnement", Ruler], ["Simulateur photovoltaïque", Sun], ["Études photovoltaïques", Sun], ["Factures", ReceiptText],
  ["Factures pro forma", BadgeEuro],
  ["Demandes de chiffrage", ClipboardList],
  ["Fournisseurs", Truck],
  ["Gestion des articles", Package],
  ["Grilles tarifaires PDF", FileSpreadsheet],
  ["Utilisateurs", ShieldCheck],
  ["Entreprise", Landmark],
  ["Journal d’activités", ScrollText],
];

const opportunities = [
  { id:101,name:"Boulangerie Le Sillon",city:"Nantes",type:"Photovoltaïque",value:38400,power:"36 kWc",stage:"Étude",owner:"Non affecté",phone:"",email:"",color:"#ffdb62" },
  { id:102,name:"EARL des Chênes",city:"Ancenis",type:"Photovoltaïque",value:76200,power:"100 kWc",stage:"Devis envoyé",owner:"Sébastien Brun",phone:"",email:"",color:"#4769b2" },
  { id:103,name:"SCI Horizon",city:"La Baule",type:"PAC + solaire",value:24900,power:"12 kWc",stage:"Négociation",owner:"Non affecté",phone:"",email:"",color:"#405fae" },
  { id:104,name:"Ateliers Brossard",city:"Cholet",type:"Ombrière",value:118000,power:"180 kWc",stage:"Signature",owner:"Non affecté",phone:"",email:"",color:"#405fae" },
];
const initialCommercialAppointments = [];
const initialClients = [
  { id:1,name:"EARL Bellevue",contact:"Paul Martin",email:"paul@bellevue.fr",phone:"06 28 44 12 90",city:"Ancenis",install:"Photovoltaïque 100 kWc" },
  { id:2,name:"SCI Horizon",contact:"Sophie Richard",email:"s.richard@horizon.fr",phone:"06 71 30 42 18",city:"La Baule",install:"Solaire 12 kWc + PAC" },
  { id:3,name:"Ferme de la Prairie",contact:"Luc Moreau",email:"luc@laprairie.fr",phone:"06 16 82 51 07",city:"Clisson",install:"Photovoltaïque 72 kWc" },
];
const initialBilling = [
  { id:1,kind:"Devis",number:"DEV-2026-042",client:"SCI Horizon",date:"2026-07-18",due:"2026-08-17",label:"Installation solaire 12 kWc",amount:24900,tax:20,status:"Envoyé" },
  { id:2,kind:"Facture",number:"FAC-2026-031",client:"EARL Bellevue",date:"2026-07-08",due:"2026-08-07",label:"Acompte installation 100 kWc",amount:22860,tax:20,status:"À payer" },
  { id:3,kind:"Facture",number:"FAC-2026-027",client:"Ferme de la Prairie",date:"2026-06-22",due:"2026-07-22",label:"Maintenance annuelle",amount:760,tax:20,status:"Payée" },
];
const initialArticles = [
  { id:1,code:"PV-450W",name:"Panneau monocristallin 450 W",category:"Grand matériel",subcategory:"Panneaux photovoltaïques",unit:"Unité",buy:128,sell:189,tax:20,status:"Actif" },
  { id:2,code:"OND-10K",name:"Onduleur triphasé 10 kW",category:"Grand matériel",subcategory:"Panneaux photovoltaïques",unit:"Unité",buy:1420,sell:1960,tax:20,status:"Actif" },
  { id:3,code:"MO-POSE",name:"Pose et mise en service",category:"Installation",subcategory:"",unit:"Heure",buy:38,sell:65,tax:20,status:"Actif" },
  { id:4,code:"GM-OND100",name:"Onduleur industriel 100 kW",category:"Grand matériel",subcategory:"Panneaux photovoltaïques",unit:"Unité",buy:8420,sell:10950,tax:20,status:"Actif" },
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
  return computeDocumentTotals(document);
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

function formatAgendaSlot(value) {
  const date = value instanceof Date ? value : new Date(value?.start || value?.starts_at || value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function confirmAgendaOverlap(data, { canForce = false } = {}) {
  const overlaps = (data?.overlaps || []).slice(0, 3).map(item => {
    const when = formatAgendaSlot(item.starts_at || item.start || item);
    const name = item.prospect_name || item.prospectName || "Rendez-vous";
    return `• ${name}${when ? ` — ${when}` : ""}`;
  }).filter(Boolean);
  const suggestions = (data?.suggestions || []).slice(0, 3).map(formatAgendaSlot).filter(Boolean);
  let message = data?.error || "Ce créneau est déjà occupé.";
  if (overlaps.length) message += `\n\nOccupé :\n${overlaps.join("\n")}`;
  if (suggestions.length) message += `\n\nCréneaux libres :\n${suggestions.join("\n")}`;
  if (!canForce) {
    window.alert(`${message}\n\nChoisissez un autre créneau.`);
    return false;
  }
  return window.confirm(`${message}\n\nEnregistrer quand même ?`);
}

export default function Home() {
  const [active,setActive]=useState("Applications");
  const [selectedFamily,setSelectedFamily]=useState(null);
  const [navStack,setNavStack]=useState([]);
  const [clientRecordOpen,setClientRecordOpen]=useState(false);
  const [closeClientRecordTick,setCloseClientRecordTick]=useState(0);
  const skipNavPush=useRef(false);
  const workspacePlace=useRef({active:"Applications",selectedFamily:null});
  const [menu,setMenu]=useState(false);
  const [modal,setModal]=useState("");
  const [documentClient,setDocumentClient]=useState(null);
  const [articleCreateOpen,setArticleCreateOpen]=useState(false);
  const [bundleWizard,setBundleWizard]=useState(null);
  const [toast,setToast]=useState("");
  const [editingBilling,setEditingBilling]=useState(null);
  const [editingProspect,setEditingProspect]=useState(null);
  const [newBillingKind,setNewBillingKind]=useState("Devis");
  const [quoteWizard,setQuoteWizard]=useState(null);
  const [pdfStudio,setPdfStudio]=useState(null);
  const [editingUser,setEditingUser]=useState(null);
  const [editingClient,setEditingClient]=useState(null);
  const [openClientId,setOpenClientId]=useState(null);
  const [boardClient,setBoardClient]=useState(null);
  const [rdvDirectory,setRdvDirectory]=useState([]);
  const [requestFocus,setRequestFocus]=useState("");
  const [editingArticle,setEditingArticle]=useState(null);
  const [editingBrand,setEditingBrand]=useState(null);
  const [brandLogoDraft,setBrandLogoDraft]=useState("");
  const [commercials,setCommercials]=useState([]);
  const [invitation,setInvitation]=useState(null);
  const [query,setQuery]=useState("");
  const [opps,setOpps]=useState([]);
  const [commercialAppointments,setCommercialAppointments]=useState([]);
  const [appointmentsReady,setAppointmentsReady]=useState(false);
  const [agendaFocusId,setAgendaFocusId]=useState("");
  const [agendaFocusStart,setAgendaFocusStart]=useState("");
  const [clients,setClients]=useState([]);
  const [contracts,setContracts]=useRecordTable("mkl-contracts");
  const [team,setTeam]=useState([]);
  const [teamReady,setTeamReady]=useState(false);
  const [entretienKeepAlive,setEntretienKeepAlive]=useState(false);
  const [billing,setBilling]=useState([]);
  const [groups]=useState(DEFAULT_ARTICLE_GROUPS);
  const [articles,setArticles]=useState([]);
  const [brands,setBrands]=useState([]);
  const [catalogCategories,setCatalogCategories]=useState([]);
  const [catalogSubcategories,setCatalogSubcategories]=useState([]);
  const [costRequests,setCostRequests]=useRecordTable("mkl-cost-requests");
  const [suppliers,setSuppliers]=useRecordTable("mkl-suppliers");
  const [visits,setVisits]=useRecordTable("mkl-technical-visits");
  const [installations,setInstallations]=useRecordTable("mkl-installations");
  const [installationTeams,setInstallationTeams]=useRecordTable("mkl-installation-teams");
  const [thermalStudies,setThermalStudies]=useRecordTable("mkl-thermal-studies");
  const [pvSimulations,setPvSimulations]=useRecordTable("mkl-pv-simulations");
  const [pvProjects,setPvProjects]=useRecordTable("mkl-pv-projects");
  const [bundles,setBundles]=useState([]);
  const [purchaseOrders,setPurchaseOrders]=useRecordTable("mkl-purchase-orders");
  const [currentProfile,setCurrentProfile]=useState(null);
  const [profileLoaded,setProfileLoaded]=useState(false);
  const [fleetDriver,setFleetDriver]=useState(false);
  const [legacySnapshot,setLegacySnapshot]=useState(null);
  const [legacyBusy,setLegacyBusy]=useState(false);
  const [apiSnapshot,setApiSnapshot]=useState(null);
  const [fieldOffline,setFieldOffline]=useState(false);
  const [fieldPending,setFieldPending]=useState(0);
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
        authFetch("/api/fleet/access").then(async response=>{
          const data=await response.json().catch(()=>({}));
          setFleetDriver(Boolean(data.isDriver));
        }).catch(()=>{});
        try {
          const cachedUsers=JSON.parse(sessionStorage.getItem("mkl-users")||"null");
          if(Array.isArray(cachedUsers)&&cachedUsers.length){
            setTeam(cachedUsers);
            setTeamReady(true);
          }
        } catch {}
        authFetch("/api/users").then(async usersRes=>{
          const usersData=await usersRes.json().catch(()=>({}));
          if(usersRes.ok&&Array.isArray(usersData.users)){
            setTeam(usersData.users);
            try { sessionStorage.setItem("mkl-users", JSON.stringify(usersData.users)); } catch {}
          }
          setTeamReady(true);
        }).catch(()=>setTeamReady(true));
        const [clientsRes, commercialsRes, articlesRes, devisRes, brandsRes, prospectsRes, rdvDirectoryRes, appointmentsRes, categoriesRes, subcategoriesRes, bundlesRes] = await Promise.all([
          authFetch("/api/clients"),
          authFetch("/api/clients/commercials"),
          authFetch("/api/articles"),
          authFetch("/api/devis"),
          authFetch("/api/brands"),
          authFetch("/api/prospects"),
          authFetch("/api/prospects?includeConverted=1"),
          authFetch("/api/appointments"),
          authFetch("/api/article-categories"),
          authFetch("/api/article-subcategories"),
          authFetch("/api/article-bundles"),
        ]);
        const clientsData = await clientsRes.json().catch(()=>({}));
        const commercialsData = await commercialsRes.json().catch(()=>({}));
        const articlesData = await articlesRes.json().catch(()=>({}));
        const devisData = await devisRes.json().catch(()=>({}));
        const brandsData = await brandsRes.json().catch(()=>({}));
        const prospectsData = await prospectsRes.json().catch(()=>({}));
        const rdvDirectoryData = await rdvDirectoryRes.json().catch(()=>({}));
        const appointmentsData = await appointmentsRes.json().catch(()=>({}));
        const categoriesData = await categoriesRes.json().catch(()=>({}));
        const subcategoriesData = await subcategoriesRes.json().catch(()=>({}));
        const bundlesData = await bundlesRes.json().catch(()=>({}));
        if(clientsRes.ok&&Array.isArray(clientsData.clients)) {
          setClients(clientsData.clients);
          const missingNumbers = Array.isArray(clientsData.schemaWarnings) ? clientsData.schemaWarnings : [];
          if(missingNumbers.length && isAdminVip(currentProfile?.role) && !sessionStorage.getItem("mkl-numbering-gap")) {
            sessionStorage.setItem("mkl-numbering-gap", "1");
            showToast("Les numéros client et prospect ne tiennent pas : le script SQL n’est pas dans Supabase.");
          }
        }
        if(commercialsRes.ok&&Array.isArray(commercialsData.commercials)) setCommercials(commercialsData.commercials);
        if(articlesRes.ok&&Array.isArray(articlesData.articles)) setArticles(articlesData.articles);
        if(devisRes.ok&&Array.isArray(devisData.documents)) setBilling(devisData.documents);
        if(brandsRes.ok&&Array.isArray(brandsData.brands)) setBrands(brandsData.brands);
        if(prospectsRes.ok&&Array.isArray(prospectsData.prospects)) setOpps(prospectsData.prospects);
        if(rdvDirectoryRes.ok&&Array.isArray(rdvDirectoryData.prospects)) setRdvDirectory(rdvDirectoryData.prospects);
        if(appointmentsRes.ok&&Array.isArray(appointmentsData.appointments)) {
          setCommercialAppointments(appointmentsData.appointments);
          setAppointmentsReady(true);
        }
        if(prospectsRes.ok&&appointmentsRes.ok&&currentProfile?.id){
          const next=rememberFieldLists(readFieldStore(localStorage),{
            userId:currentProfile.id,
            profile:currentProfile,
            prospects:Array.isArray(prospectsData.prospects)?prospectsData.prospects:[],
            appointments:Array.isArray(appointmentsData.appointments)?appointmentsData.appointments:[],
          });
          writeFieldStore(next, localStorage);
          setFieldOffline(false);
          setFieldPending(pendingFieldCount(next));
        }
        if(categoriesRes.ok&&Array.isArray(categoriesData.categories)) setCatalogCategories(categoriesData.categories);
        if(subcategoriesRes.ok&&Array.isArray(subcategoriesData.subcategories)) setCatalogSubcategories(subcategoriesData.subcategories);
        if(bundlesRes.ok&&Array.isArray(bundlesData.bundles)) setBundles(bundlesData.bundles);
        else if(!bundlesRes.ok&&bundlesData.error) showToast(bundlesData.error);

        if(clientsRes.ok&&articlesRes.ok&&devisRes.ok) setApiSnapshot({
          clients:Array.isArray(clientsData.clients)?clientsData.clients:[],
          articles:Array.isArray(articlesData.articles)?articlesData.articles:[],
          billing:Array.isArray(devisData.documents)?devisData.documents:[],
          prospects:Array.isArray(prospectsData.prospects)?prospectsData.prospects:[],
          appointments:Array.isArray(appointmentsData.appointments)?appointmentsData.appointments:[],
        });
      } catch (error) {
        if(!isNetworkFailure(error)||!currentProfile?.id) return;
        const cached=fieldStoreForUser(readFieldStore(localStorage), currentProfile.id);
        if(!cached) return;
        setOpps(cached.prospects);
        setCommercialAppointments(cached.appointments);
        setAppointmentsReady(true);
        setFieldOffline(true);
        setFieldPending(pendingFieldCount(cached));
      }
    })();
  },[profileLoaded,currentProfile?.id]);

  useEffect(()=>{
    if(!profileLoaded||!currentProfile?.id) return;
    if(active!=="Prospects"&&!quoteWizard) return;
    let cancelled=false;
    authFetch("/api/prospects").then(async response=>{
      const data=await response.json().catch(()=>({}));
      if(!cancelled&&response.ok&&Array.isArray(data.prospects)) setOpps(data.prospects);
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[active,quoteWizard,profileLoaded,currentProfile?.id]);

  // Instantané de l'ancien stockage pris au montage. useStored réécrit le blob
  // avec les données des API 450 ms après leur chargement : lire plus tard
  // reviendrait à comparer le blob à lui-même et à manquer ce qu'il faut
  // récupérer. Le stockage navigateur est lu de façon synchrone, donc sûr.
  useEffect(()=>{
    const local={};
    for(const [entity,key] of Object.entries(LEGACY_STATE_KEYS)) local[entity]=readLocalLegacyState(key);
    let cancelled=false;
    (async()=>{
      const cloud={};
      await Promise.all(Object.entries(LEGACY_STATE_KEYS).map(async([entity,key])=>{
        const result=await getCloudState(key).catch(()=>null);
        cloud[entity]=Array.isArray(result?.value)?result.value:null;
      }));
      if(!cancelled) setLegacySnapshot({local,cloud});
    })();
    return ()=>{cancelled=true;};
  },[]);

  // La comparaison porte sur la réponse des API, pas sur les listes affichées :
  // celles-ci contiennent les valeurs de démonstration avant le chargement, et
  // reçoivent des enregistrements injectés localement qui masqueraient ce qu'il
  // reste à récupérer.
  const legacyReport=useMemo(()=>{
    if(!legacySnapshot||!apiSnapshot) return null;
    const legacy={};
    for(const entity of Object.keys(LEGACY_STATE_KEYS)) {
      legacy[entity]=[legacySnapshot.local[entity],legacySnapshot.cloud[entity]];
    }
    return buildLegacyReport({legacy,current:apiSnapshot});
  },[legacySnapshot,apiSnapshot]);

  async function recoverLegacyState() {
    if(!legacyReport||legacyBusy) return;
    setLegacyBusy(true);
    const created={clients:0,articles:0,prospects:0,appointments:0};
    let refused=0;
    try {
      for(const record of legacyReport.clients) {
        try {
          const response=await authFetch("/api/clients",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(legacyClientToPayload(record))});
          if(response.ok) created.clients+=1; else refused+=1;
        } catch { refused+=1; }
      }
      for(const record of legacyReport.articles) {
        try {
          const response=await authFetch("/api/articles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(legacyArticleToPayload(record))});
          if(response.ok) created.articles+=1; else refused+=1;
        } catch { refused+=1; }
      }
      const recoveredProspects=[];
      for(const record of legacyReport.prospects||[]) {
        try {
          const response=await authFetch("/api/prospects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(legacyProspectToPayload(record))});
          const data=await response.json().catch(()=>({}));
          if(response.ok&&data.prospect) {
            created.prospects+=1;
            recoveredProspects.push({legacy:record,prospect:data.prospect});
          } else refused+=1;
        } catch { refused+=1; }
      }
      const [prospectsRes]=await Promise.all([authFetch("/api/prospects")]);
      const prospectsData=await prospectsRes.json().catch(()=>({}));
      const allProspects=prospectsRes.ok&&Array.isArray(prospectsData.prospects)?prospectsData.prospects:[];
      for(const record of legacyReport.appointments||[]) {
        const linked=recoveredProspects.find(item=>String(item.legacy.id)===String(record.prospectId))
          || recoveredProspects.find(item=>prospectIdentity(item.legacy)===prospectIdentity({name:record.prospectName,city:record.city}))
          || {prospect:allProspects.find(item=>item.name===record.prospectName)};
        try {
          const response=await authFetch("/api/appointments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(legacyAppointmentToPayload(record,linked?.prospect?.id||""))});
          if(response.ok) created.appointments+=1; else refused+=1;
        } catch { refused+=1; }
      }

      const [clientsRes,articlesRes,appointmentsRes]=await Promise.all([authFetch("/api/clients"),authFetch("/api/articles"),authFetch("/api/appointments")]);
      const clientsData=await clientsRes.json().catch(()=>({}));
      const articlesData=await articlesRes.json().catch(()=>({}));
      const appointmentsData=await appointmentsRes.json().catch(()=>({}));
      const freshClients=clientsRes.ok&&Array.isArray(clientsData.clients)?clientsData.clients:null;
      const freshArticles=articlesRes.ok&&Array.isArray(articlesData.articles)?articlesData.articles:null;
      const freshProspects=allProspects.length?allProspects:null;
      const freshAppointments=appointmentsRes.ok&&Array.isArray(appointmentsData.appointments)?appointmentsData.appointments:null;
      if(freshClients) setClients(freshClients);
      if(freshArticles) setArticles(freshArticles);
      if(freshProspects) setOpps(freshProspects);
      if(freshAppointments) setCommercialAppointments(freshAppointments);
      setApiSnapshot(current=>({
        clients:freshClients||current?.clients||[],
        articles:freshArticles||current?.articles||[],
        billing:current?.billing||[],
        prospects:freshProspects||current?.prospects||[],
        appointments:freshAppointments||current?.appointments||[],
      }));

      const parts=[
        created.clients&&`${created.clients} client(s)`,
        created.articles&&`${created.articles} article(s)`,
        created.prospects&&`${created.prospects} prospect(s)`,
        created.appointments&&`${created.appointments} rendez-vous`,
      ].filter(Boolean);
      showToast(parts.length
        ?`${parts.join(" et ")} enregistré(s) en base${refused?` — ${refused} refusé(s)`:""}`
        :"Aucun enregistrement récupéré");
    } finally {
      setLegacyBusy(false);
    }
  }

  function downloadLegacyArchive() {
    const archive={exportedAt:new Date().toISOString(),source:"ancien stockage local et blob crm_state",report:legacyReport};
    const anchor=document.createElement("a");
    anchor.href=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:"application/json"}));
    anchor.download="mkl-ancien-stockage.json";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    showToast("Archive téléchargée");
  }

  useEffect(()=>{
    setTeam(current=>{
      const migrated=current.map(user=>{
        if(user.name==="Marie Laurent") user={...user,name:"Khaled",email:user.email==="marie@mkl-energies.fr"?"contact@mkl-energies.fr":user.email};
        // « Lecture » n'est plus traduit en « Superadmin » : cette reprise de
        // libellés hérités promouvait en administration un rôle annoncé comme
        // consultation. Il reste tel quel, donc sans définition, et n'obtient
        // que le tableau de bord par le repli ci-dessous.
        const role=user.role==="Administrateur"?"Admin VIP":user.role==="Conducteur de travaux"?"Responsable technique":user.role;
        const manager=(user.manager==="Marie Laurent"?"Khaled":user.manager)||(role==="Commercial"?"Khaled":role==="Technicien"?"Responsable technique":"Direction");
        let modules=user.modules||roleDefaults[role]||["Tableau de bord"];
        if(modules.includes("Devis & Factures")) modules=[...modules.filter(m=>m!=="Devis & Factures"),"Devis",...(["Admin VIP","Superadmin"].includes(role)?["Factures"]:[])];
        const oldArticleModules=["Articles","Catégories d’articles","Groupes d’articles","Bibliothèque de groupes"];
        if(modules.some(module=>oldArticleModules.includes(module))) modules=[...modules.filter(module=>!oldArticleModules.includes(module)),"Gestion des articles"];
        return {...user,role,manager,identifier:user.identifier||user.email,modules:[...new Set(modules)],authStatus:user.authStatus||"Actif"};
      });
      return JSON.stringify(migrated)===JSON.stringify(current)?current:migrated;
    });
    setCostRequests(current=>{
      const next=current.map(request=>request.requester==="Marie Laurent"?{...request,requester:"Khaled"}:request);
      return next.every((item,index)=>item===current[index])?current:next;
    });
  },[]);
  useEffect(()=>{
    if(!canAccessModule(currentProfile,"Maintenance")) return;
    setContracts(current=>{
      const next=current.map(contract=>{
        if(contract.equipment||!contract.quoteId) return contract;
        const quote=billing.find(document=>document.id===contract.quoteId);
        if(!quote) return contract;
        const maintenance=maintenanceEquipment(quote.items,articles);
        return maintenance.eligible.length?{...contract,type:`Contrat d’entretien ${maintenance.family}`,equipmentFamily:maintenance.family,equipment:maintenance.equipment}:contract;
      });
      return next.every((item,index)=>item===current[index])?current:next;
    });
  },[articles,billing,currentProfile]);

  const showToast = text => { setToast(text); setTimeout(()=>setToast(""),2600); };
  function publishFieldStore(next) {
    writeFieldStore(next, localStorage);
    setOpps(next.prospects || []);
    setCommercialAppointments(next.appointments || []);
    setFieldPending(pendingFieldCount(next));
    setFieldOffline(browserIsOffline());
  }
  function currentFieldStore() {
    return fieldStoreForUser(readFieldStore(localStorage), currentProfile?.id) || rememberFieldLists(null, {
      userId: currentProfile?.id,
      profile: currentProfile,
      prospects: opps,
      appointments: commercialAppointments,
    });
  }
  function queueOfflineProspect(payload, existing) {
    const localId = String(existing?.id || "").startsWith("offline-") || !existing?.id ? (existing?.id || offlineLocalId()) : existing.id;
    const prospect = localProspectFromPayload(payload, { id: localId, owner: existing?.owner || userName });
    const persisted = existing?.id && !String(existing.id).startsWith("offline-");
    const change = {
      id: `prospect-${localId}`,
      kind: persisted ? "prospect-patch" : "prospect-create",
      localId,
      url: persisted ? `/api/prospects/${existing.id}` : "/api/prospects",
      method: persisted ? "PATCH" : "POST",
      body: payload,
      at: new Date().toISOString(),
    };
    const store = currentFieldStore();
    publishFieldStore(queueFieldChange({
      ...store,
      prospects: upsertById(store.prospects, prospect),
      appointments: store.appointments,
    }, change));
    return prospect;
  }
  function queueOfflineAppointment(payload, existing, requestBody) {
    const localId = existing?.id && !String(existing.id).startsWith("offline-") ? existing.id : (existing?.id || offlineLocalId());
    const appointment = { ...localAppointmentFromPayload(payload, { id: localId }), ...(existing || {}), ...localAppointmentFromPayload(payload, { id: localId }) };
    const persisted = existing?.id && !String(existing.id).startsWith("offline-");
    const change = {
      id: `appointment-${localId}`,
      kind: persisted ? "appointment-patch" : "appointment-create",
      localId,
      url: persisted ? `/api/appointments/${existing.id}` : "/api/appointments",
      method: persisted ? "PATCH" : "POST",
      body: requestBody || payload,
      at: new Date().toISOString(),
    };
    const store = currentFieldStore();
    publishFieldStore(queueFieldChange({
      ...store,
      prospects: store.prospects,
      appointments: upsertById(store.appointments, appointment),
    }, change));
    return appointment;
  }
  function blockOfflineDocument() {
    if (!browserIsOffline()) return false;
    showToast("Le devis reste en ligne : son numéro est attribué par la base.");
    return true;
  }
  async function flushFieldQueue() {
    if (!currentProfile?.id || browserIsOffline()) return;
    let store = fieldStoreForUser(readFieldStore(localStorage), currentProfile.id);
    if (!store?.queue?.length) {
      setFieldOffline(false);
      return;
    }
    for (const change of sortFieldQueue(store.queue.filter(item => !item.syncError))) {
      try {
        const response = await authFetch(change.url, { method: change.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(change.body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          store = markFieldSyncFailed(store, change, data.error || "La base n’a pas accepté cette saisie.");
          showToast(data.error || "Une saisie terrain n’a pas pu être envoyée.");
          continue;
        }
        store = acceptFieldSync(store, change, data.prospect || data.appointment);
      } catch (error) {
        if (isNetworkFailure(error)) break;
        store = markFieldSyncFailed(store, change, String(error?.message || "Envoi impossible"));
      }
    }
    writeFieldStore(store, localStorage);
    setOpps(store.prospects || []);
    setCommercialAppointments(store.appointments || []);
    setFieldPending(pendingFieldCount(store));
    setFieldOffline(browserIsOffline());
  }
  const flushFieldQueueRef=useRef(flushFieldQueue);
  flushFieldQueueRef.current=flushFieldQueue;
  useEffect(()=>{
    if(!profileLoaded||!currentProfile?.id) return;
    if(browserIsOffline()){
      const cached=fieldStoreForUser(readFieldStore(localStorage), currentProfile.id);
      if(cached){
        setOpps(cached.prospects);
        setCommercialAppointments(cached.appointments);
        setAppointmentsReady(true);
        setFieldOffline(true);
        setFieldPending(pendingFieldCount(cached));
      }
    }
    const onOnline=()=>flushFieldQueueRef.current();
    window.addEventListener("online", onOnline);
    if(!browserIsOffline()) flushFieldQueueRef.current();
    return ()=>window.removeEventListener("online", onOnline);
  },[profileLoaded,currentProfile?.id]);
  useEffect(()=>{
    function onOrgStateError(event){
      const message=String(event.detail?.message||"Enregistrement partagé impossible");
      setToast(message);
      window.setTimeout(()=>setToast(""),3200);
    }
    window.addEventListener("mkl-org-state-error", onOrgStateError);
    return ()=>window.removeEventListener("mkl-org-state-error", onOrgStateError);
  },[]);
  const filtered = useMemo(()=>opps.filter(o=>`${o.name} ${o.city} ${o.type}`.toLowerCase().includes(query.toLowerCase())),[opps,query]);

  useEffect(()=>{
    if(!profileLoaded) return;
    const params=new URLSearchParams(window.location.search);
    const google=params.get("google");
    if(!google) return;
    if(google==="connected") {
      setActive("Agenda commercial");
      showToast("Compte Google connecté");
    } else if(google==="denied") showToast("Connexion Google annulée");
    else if(google==="missing") showToast("Google Calendar n’est pas configuré sur le serveur");
    else showToast("Connexion Google impossible");
  },[profileLoaded]);

  useEffect(()=>{
    if(!profileLoaded||!allowedModules||active==="Applications") return;
    if(!canAccessWorkspace(allowedModules,active,currentProfile)&&!(active==="Parc automobile"&&fleetDriver)) {
      skipNavPush.current=true;
      setNavStack([]);
      setActive("Applications");
      setSelectedFamily(null);
      setQuery("");
      showToast("Accès refusé à cet espace.");
    }
  },[active,allowedModules,profileLoaded,currentProfile,fleetDriver]);

  useEffect(()=>{
    const next={active,selectedFamily};
    const previous=workspacePlace.current;
    if(!sameWorkspacePlace(previous,next)) {
      if(!skipNavPush.current) setNavStack(stack=>pushWorkspacePlace(stack,previous,next));
      workspacePlace.current=next;
    }
    skipNavPush.current=false;
  },[active,selectedFamily]);

  useEffect(()=>{
    if(active==="Maintenance") setEntretienKeepAlive(true);
  },[active]);

  useEffect(()=>{
    if(active!=="Clients") setClientRecordOpen(false);
  },[active]);

  async function refreshUsers() {
    const response=await authFetch("/api/users",{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&Array.isArray(data.users)){
      setTeam(data.users);
      try { sessionStorage.setItem("mkl-users", JSON.stringify(data.users)); } catch {}
    }
    setTeamReady(true);
    return data.users;
  }

  async function sendUserInvitation(user) {
    const response=await authFetch("/api/users/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName:user.firstName,lastName:user.lastName,name:user.name,email:user.email,role:user.role,modules:user.modules||[],actions:user.actions||extractGrantedActions(user.modules),manager:user.manager||"",zone:user.zone||"",postalCode:user.postalCode||"",city:user.city||"",dispatchAvailable:user.dispatchAvailable!==false})});
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
      await refreshUsers().catch(()=>{
        setTeam(team.map(item=>item.id===user.id?{...item,supabaseId:data.userId||item.supabaseId,authStatus:"Mail envoyé",inviteAt:new Date().toISOString()}:item));
      });
      showToast(`Mail de connexion envoyé à ${user.email}`);
    } catch(error) {
      showToast(String(error?.message||"Le PIN n’a pas pu être renvoyé."));
    }
  }

  async function submit(e,type) {
    e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget)); let resultMessage="";
    if(type==="prospect") {
      if(editingProspect&&!canReviseProspect(currentProfile,editingProspect)) {
        setModal("");
        setEditingProspect(null);
        return;
      }
      const payload={
        name:d.name,
        phone:d.phone,
        landline:d.landline,
        email:d.email,
        city:d.city,
        address:d.address,
        addressComplement:d.addressComplement,
        postalCode:d.postalCode,
        type:d.type,
        value:editingProspect?.value||0,
        source:d.source,
        stage:d.stage||editingProspect?.stage||"Nouveau",
        notes:d.notes,
        appointmentAt:d.appointmentAt||(d.appointmentDate&&d.appointmentStart?`${d.appointmentDate}T${d.appointmentStart}`:""),
        duration:d.duration,
        kind:d.actionKind,
        actionKind:d.actionKind,
        commercialId:d.commercialId,
        prospectorId:d.prospectorId,
        prospector:d.prospector,
        subject:d.subject,
        appointmentAddress:d.appointmentAddress,
        appointmentPhone:d.appointmentPhone||d.phone,
        appointmentType:d.appointmentType,
        appointmentNotes:d.appointmentNotes,
        priority:d.priority,
        meetingMode:d.meetingMode,
        reminder_1440:d.reminder_1440,
        reminder_120:d.reminder_120,
        reminder_30:d.reminder_30,
        reminderCustom:d.reminderCustom,
        notifyCrm:d.notifyCrm!==undefined,
        notifyEmail:d.notifyEmail!==undefined,
        notifyGoogle:d.notifyGoogle!==undefined,
        appointmentDate:d.appointmentDate,
        appointmentStart:d.appointmentStart,
        appointmentEnd:d.appointmentEnd,
        power:editingProspect?.power||"À définir",
        color:editingProspect?.color||"#405fae",
        housingType:d.housingType,
        constructionYear:d.constructionYear,
        occupancy:d.occupancy,
        civilite:d.civilite||"",
      };
      try {
        if(browserIsOffline()){
          const saved=queueOfflineProspect(payload, editingProspect);
          setEditingProspect(saved);
          showToast("Prospect enregistré sur cet appareil. Il partira à la reconnexion.");
          if(editingProspect){ setModal(""); setEditingProspect(null); }
          return;
        }
        const url=editingProspect?`/api/prospects/${editingProspect.id}`:"/api/prospects";
        const method=editingProspect?"PATCH":"POST";
        const canForceOverlap=canAssignClientCommercial(currentProfile);
        let response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        let data=await response.json().catch(()=>({}));
        if(response.status===409){
          if(confirmAgendaOverlap(data,{canForce:canForceOverlap})){
            response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,forceOverlap:true})});
            data=await response.json().catch(()=>({}));
          } else {
            showToast(data.error||"Créneau déjà occupé");
            return;
          }
        }
        if(!response.ok) throw new Error(data.error||"Enregistrement prospect impossible");
        const saved=data.prospect;
        setOpps(current=>editingProspect
          ?current.map(item=>item.id===editingProspect.id?saved:item)
          :[saved,...current.filter(item=>item.id!==saved.id)]);
        if(data.appointment) {
          setCommercialAppointments(current=>[data.appointment,...current.filter(item=>item.id!==data.appointment.id)]);
        } else if(editingProspect) {
          setCommercialAppointments(current=>current.map(item=>String(item.prospectId)===String(saved.id)
            ?{...item,prospectName:saved.name,city:saved.city,type:saved.type}
            :item));
        }
        resultMessage=editingProspect?"Fiche prospect modifiée":"Prospect créé — photographiez les justificatifs en bas de fiche";
        if(!editingProspect && saved?.id) {
          setEditingProspect(saved);
          showToast(resultMessage);
          return;
        }
      } catch(error) {
        if(isNetworkFailure(error)){
          const saved=queueOfflineProspect(payload, editingProspect);
          setEditingProspect(saved);
          showToast("Prospect enregistré sur cet appareil. Il partira à la reconnexion.");
          if(editingProspect){ setModal(""); setEditingProspect(null); }
          return;
        }
        showToast(String(error?.message||"Enregistrement prospect impossible"));
        return;
      }
    }
    if(type==="client") {
      if(editingClient&&!canEditExistingClient(currentProfile)) {
        setModal("");
        setEditingClient(null);
        return;
      }
      if(!String(d.phone||"").trim()&&!String(d.mobile||"").trim()&&!String(d.email||"").trim()){
        showToast("Renseignez au moins un téléphone ou un email.");
        return;
      }
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
        prospectorId:d.prospectorId||"",
        prospector:d.prospector||"",
        notes:d.notes,
        consent:d.consent==="on",
        housingType:d.housingType,
        constructionYear:d.constructionYear,
        occupancy:d.occupancy,
      };
      try {
        const url=editingClient?`/api/clients/${editingClient.id}`:"/api/clients";
        const method=editingClient?"PATCH":"POST";
        let response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        let data=await response.json().catch(()=>({}));
        if(response.status===409&&data.blocked){
          showToast(data.error||"Un client avec le même nom et la même adresse existe déjà.");
          return;
        }
        if(response.status===409&&data.duplicates?.length){
          const summary=data.duplicates.map(item=>`${item.name||item.email} (${(item.reasons||[]).join(", ")})`).join("\n");
          if(window.confirm(`Doublon potentiel détecté :\n${summary}\n\nCréer / enregistrer quand même ?`)){
            response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,forceDuplicate:true})});
            data=await response.json().catch(()=>({}));
          } else {
            showToast("Création annulée (doublon)");
            return;
          }
        }
        if(!response.ok) throw new Error(data.error||"Enregistrement client impossible");
        if(editingClient) setClients(clients.map(item=>item.id===editingClient.id?data.client:item));
        else {
          setClients([data.client,...clients.filter(item=>item.id!==data.client.id)]);
          setActive("Clients");
          setOpenClientId(data.client.id);
        }
        resultMessage=editingClient?"Fiche client modifiée":"Client créé — photographiez les justificatifs en bas de fiche";
      } catch(error) {
        showToast(String(error?.message||"Enregistrement client impossible"));
        return;
      }
    }
    if(type==="contract"||type==="visit") {
      const selectedClient=findExistingClient(clients,d.clientId);
      if(!selectedClient) {
        showToast(EXISTING_CLIENT_MESSAGE);
        return;
      }
      const linked={...d,clientId:selectedClient.id,client:selectedClient.name||d.client};
      if(type==="contract") setContracts([{...linked,id:Date.now(),amount:Number(d.amount)},...contracts]);
      if(type==="visit") setVisits([{...linked,id:Date.now(),status:"À réaliser"},...visits]);
    }
    if(type==="user") {
      const firstName=String(d.firstName||"").trim();
      const lastName=String(d.lastName||"").trim();
      const name=[firstName,lastName].filter(Boolean).join(" ");
      if(!firstName||!lastName){
        showToast("Renseignez le nom et le prénom.");
        return;
      }
      const parsedModules=JSON.parse(d.modules||"[]");
      const parsedActions=JSON.parse(d.actions||"[]");
      const storedAccess=persistProfileAccess({modules:parsedModules,actions:parsedActions,role:d.role,existingModules:editingUser?.modules,actorRole:currentRole});
      let user={...d,id:editingUser?.id||Date.now(),name,firstName,lastName,identifier:d.email,modules:storedAccess,actions:parsedActions,status:editingUser?.status||"Actif",active:editingUser?isItemActive(editingUser):true,authStatus:editingUser?.authStatus||"En attente d’envoi",inviteAt:editingUser?.inviteAt||new Date().toISOString(),manager:d.manager||editingUser?.manager||"",zone:d.zone||"",specialties:editingUser?parseSpecialties(editingUser.specialties):[],postalCode:d.postalCode||"",city:d.city||"",dispatchAvailable:d.dispatchAvailable!==undefined,supabaseId:editingUser?.supabaseId||null};
      if(!editingUser) {
        try {
          const created=await sendUserInvitation(user);
          user={...user,id:created.userId||user.id,supabaseId:created.userId||user.supabaseId,authStatus:"En attente d’envoi"};
          resultMessage=created.sent
            ?`Mail d’activation envoyé à ${user.email}.`
            :(created.mailError||"Compte créé, mais le mail d’activation n’est pas parti. Utilisez Envoyer.");
          if(created.managerNotified) resultMessage+=` Le responsable commercial a été informé par e-mail.`;
          else if(created.managerMailError) resultMessage+=` ${created.managerMailError}`;
        } catch(error) {
          showToast(String(error?.message||"Création utilisateur impossible"));
          return;
        }
      } else {
        if(editingUser.supabaseId) {
          try {
            const response=await authFetch(`/api/users/${editingUser.supabaseId}`,{
              method:"PATCH",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({firstName,lastName,name,email:user.email,role:user.role,modules:user.modules,actions:user.actions||[],manager:user.manager||"",zone:user.zone||"",postalCode:user.postalCode||"",city:user.city||"",dispatchAvailable:user.dispatchAvailable!==false}),
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error||"Mise à jour utilisateur impossible");
            user={...user,email:data.user?.email||user.email,identifier:data.user?.email||user.email,role:data.user?.role||user.role,modules:data.user?.modules||user.modules,name:data.user?.name||name,firstName:data.user?.firstName||firstName,lastName:data.user?.lastName||lastName};
            resultMessage=data.emailChanged
              ?(data.pinSent
                ?`Identifiant mis à jour. Mail envoyé à ${user.email}.`
                :`Identifiant mis à jour (${user.email}). ${data.mailError||"Le mail n’est pas parti : utilisez Envoyer."}`)
              :"Utilisateur modifié (droits synchronisés)";
            if(data.managerNotified) resultMessage+=` Le responsable commercial a été informé par e-mail.`;
            else if(data.managerMailError) resultMessage+=` ${data.managerMailError}`;
          } catch(error) {
            resultMessage=String(error?.message||"Utilisateur modifié localement — sync serveur échouée");
          }
        } else {
          resultMessage="Utilisateur modifié";
        }
      }
      const refreshed=await refreshUsers().catch(()=>null);
      if(!refreshed) setTeam(editingUser?team.map(item=>item.id===editingUser.id?user:item):[user,...team]);
    }
    if(type==="billing") {
      if(blockOfflineDocument()) return;
      const isEditingExisting=Boolean(editingBilling?.id&&String(editingBilling.id).includes("-"));
      const selected=clients.find(client=>String(client.id)===String(d.clientId))||{};
      const selectedProspect=opps.find(item=>String(item.id)===String(d.prospectId))||{};
      const draft={
        ...d,
        kind:d.kind||editingBilling?.kind||newBillingKind||"Devis",
        clientId:selected.id||d.clientId||null,
        prospectId:selectedProspect.id||d.prospectId||null,
        client:selected.name||selectedProspect.name||d.client,
        tax:Number(d.tax),
        globalDiscountValue:Number(d.globalDiscountValue||0),
        items:JSON.parse(d.items||"[]"),
        pvStudyId:editingBilling?.pvStudyId||null,
      };
      if(!draft.clientId&&!draft.prospectId) {
        showToast("Sélectionnez un client ou un prospect pour créer le document.");
        return;
      }
      const totals=billingTotals(draft);
      let document={...draft,amount:totals.totalHT,totalTTC:totals.totalTTC};
      const photovoltaicItems=document.items.filter(item=>`${item.name||""} ${item.category||""} ${item.subcategory||""} ${item.code||""}`.toLowerCase().includes("photovolta"));
      if(document.kind==="Devis"&&photovoltaicItems.length&&!document.pvStudyId) {
        const customer=selected.id?selected:selectedProspect;
        const powerKwp=Number(document.pvPowerKwp||photovoltaicItems.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.powerW||0)/1000,0)||3);
        const panelPower=Number(articles.find(article=>photovoltaicItems.some(item=>item.code===article.code))?.powerW||450);
        const panels=Math.max(1,Math.round(powerKwp*1000/panelPower));
        const studyId=Date.now()+7;
        document={...document,pvStudyId:studyId,pvStudyAuto:true,pvPowerKwp:powerKwp};
        const study={id:studyId,studyKind:"soft",quoteId:null,quoteNumber:document.number||"",client:document.client,clientId:document.clientId,commercialId:d.commercialId||currentProfile?.id||"",createdBy:currentProfile?.id||"",name:`Étude solaire`,annualConsumption:Number(customer.annualConsumption||8000),panelPower,panels,powerKwp,estimatedProduction:Math.round(powerKwp*1100),roofArea:panels*2,yieldValue:1100,address:customer.address||"",postcode:customer.postalCode||"",city:customer.city||"",price:totals.totalTTC,batteryCapacity:0,electricityPrice:.194,surplusPrice:.04,selfConsumptionRate:65,townHallStatus:"À préparer",gridStatus:"À préparer",townHall:emptyTownHall({person:customer}),created:new Date().toISOString().slice(0,10),source:"Générée automatiquement depuis le devis"};
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
          deliveryDate:document.kind==="Devis"?document.deliveryDate||defaultQuoteDeliveryDate(document.date):document.deliveryDate||"",
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
          financeNominalRate:document.financeNominalRate||"",
          financeTaeg:document.financeTaeg||"",
          financeTaea:document.financeTaea||"",
          firstMonthlyPayment:document.firstMonthlyPayment||"",
          electricityOperator:document.electricityOperator||"",
          pvPowerKwp:document.pvPowerKwp||"",
          pvStudyId:document.pvStudyId||null,
          pvStudyAuto:Boolean(document.pvStudyAuto),
          sourceQuoteId:d.sourceQuoteId||editingBilling?.sourceQuoteId||null,
          sourceQuoteNumber:d.sourceQuoteNumber||editingBilling?.sourceQuoteNumber||"",
          prospectId:document.prospectId||"",
          commercialId:d.commercialId||document.commercialId||"",
          representativeLastName:document.representativeLastName||"",
          representativeFirstName:document.representativeFirstName||"",
          representativeSignature:document.representativeSignature||"",
        };
        const url=isEditingExisting?`/api/devis/${editingBilling.id}`:"/api/devis";
        const method=isEditingExisting?"PATCH":"POST";
        const response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Enregistrement du document impossible");
        document=data.document;
        if(data.client) {
          setClients(current=>[data.client,...current.filter(item=>String(item.id)!==String(data.client.id))]);
        }
        if(data.convertedProspectId) {
          setOpps(current=>current.filter(item=>String(item.id)!==String(data.convertedProspectId)));
        }
        if(document.pvStudyId) {
          setPvProjects(current=>current.map(study=>study.id===document.pvStudyId?{...study,quoteId:document.id,quoteNumber:document.number,commercialId:study.commercialId||document.commercialId||currentProfile?.id||"",name:`Étude solaire — ${document.number}`,price:document.totalTTC}:study));
        }
        setBilling(current=>{
          if(isEditingExisting) return current.map(item=>item.id===editingBilling.id?document:item);
          return [document,...current.filter(item=>item.id!==document.id)];
        });
        setActive(document.kind==="Facture"?"Factures":document.kind==="Pro forma"?"Factures pro forma":"Devis");
        resultMessage=resultMessage||(data.convertedProspectId
          ?(isEditingExisting?"Document modifié — le prospect est devenu client":`Document créé — ${document.number||""}`.trim()+" — le prospect est devenu client")
          :(isEditingExisting?"Document modifié":`Document créé — ${document.number||""}`.trim()));
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
    if(type==="group") {
      const category=catalogCategories.find(item=>item.name===d.parent);
      if(!category){
        showToast("Catégorie principale introuvable dans le catalogue.");
        return;
      }
      try {
        const response=await authFetch("/api/article-subcategories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:d.name,description:d.description||"",categoryId:category.id})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Création de sous-catégorie impossible");
        if(data.subcategory) setCatalogSubcategories(current=>[data.subcategory,...current.filter(item=>item.id!==data.subcategory.id)]);
      } catch(error) {
        showToast(String(error?.message||"Création de sous-catégorie impossible"));
        return;
      }
    }
    if(type==="article") {
      const selectedBrand=brands.find(item=>String(item.id)===String(d.brandId||""));
      const payload={
        code:d.code,
        name:d.name,
        category:d.category,
        subcategory:d.subcategory||"",
        categoryId:d.categoryId||"",
        subcategoryId:d.subcategoryId||"",
        brandId:d.brandId||"",
        brand:selectedBrand?.name||d.brand||"",
        description:d.description||"",
        technicalDescription:d.technicalDescription||"",
        ...(d.ficheName !== undefined || d.ficheData !== undefined
          ? { ficheName: d.ficheName || "", ficheData: d.ficheData || "" }
          : {}),
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
        if(!data.article?.id) throw new Error("L’article n’a pas été enregistré.");
        if(editingArticle) setArticles(articles.map(item=>item.id===editingArticle.id?data.article:item));
        else setArticles([data.article,...articles.filter(item=>item.id!==data.article.id)]);
        if(editingArticle&&Array.isArray(data.bundles)&&data.bundles.length){
          setBundles(current=>{
            const next=[...current];
            for(const bundle of data.bundles){
              const index=next.findIndex(item=>String(item.id)===String(bundle.id));
              if(index>=0) next[index]=bundle;
              else next.unshift(bundle);
            }
            return next;
          });
          resultMessage=data.bundles.length>1
            ?`Article modifié · prix mis à jour dans ${data.bundles.length} groupes`
            :"Article modifié · prix du groupe mis à jour";
        } else {
          resultMessage=editingArticle?"Article modifié":"Article créé";
        }
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
            status:normalizeClientStatus(r.statut||r.status),
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
      } else {
        let imported=0,rejected=0;
        for(const row of rows){
          const name=String(row.nom||row.categorie||"").trim();
          if(!name){rejected+=1;continue;}
          const parent=String(row.categorie_parent||row.parent||"").trim();
          const isRoot=["Grand matériel","Petite fourniture","Installation"].includes(name)||!parent;
          try {
            if(isRoot){
              const response=await authFetch("/api/article-categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description:row.description||""})});
              const data=await response.json().catch(()=>({}));
              if(response.ok&&data.category){
                imported+=1;
                setCatalogCategories(current=>[data.category,...current.filter(item=>item.id!==data.category.id)]);
              } else rejected+=1;
            } else {
              const category=catalogCategories.find(item=>item.name===parent);
              if(!category){rejected+=1;continue;}
              const response=await authFetch("/api/article-subcategories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description:row.description||"",categoryId:category.id})});
              const data=await response.json().catch(()=>({}));
              if(response.ok&&data.subcategory){
                imported+=1;
                setCatalogSubcategories(current=>[data.subcategory,...current.filter(item=>item.id!==data.subcategory.id)]);
              } else rejected+=1;
            }
          } catch { rejected+=1; }
        }
        showToast(imported?`${imported} catégorie(s) importée(s)`:"Aucune catégorie importée");
        return;
      }
      showToast(`${rows.length} ligne${rows.length>1?"s":""} importée${rows.length>1?"s":""}`);
    };
    reader.readAsText(file,"UTF-8");
  }

  function exportExcel() {
    if(!canPerformAction(currentProfile,"export_clients")) {
      showToast("L’export de la liste clients n’est pas autorisé.");
      return;
    }
    const rows=clients.map(c=>[formatClientNumber(c.clientNumber),c.name,c.contact,c.email,c.phone,c.address,c.postalCode,c.city,c.install]);
    const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;");
    const table=[["N° client","Client","Contact","Email","Téléphone","Adresse","Code postal","Ville","Installation"],...rows]
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
    if(!String(document.id).includes("-")) {
      showToast("Ce document n’est pas encore enregistré en base.");
      return;
    }
    try {
      const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:nextStatus,statusOnly:true,statusComment:comment||`Passage à « ${nextStatus} »`})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Changement de statut impossible");
      setBilling(current=>current.map(item=>item.id===document.id?data.document:item));
      showToast(`Statut : ${nextStatus}`);
    } catch(error) {
      showToast(String(error?.message||"Changement de statut impossible"));
    }
  }
  async function validateQuote(document) {
    if(!document?.id||!String(document.id).includes("-")) {
      showToast("Ce devis n’est pas encore enregistré en base.");
      return;
    }
    try {
      const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Accepté",statusOnly:true,statusComment:"Validation commerciale"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Validation impossible");
      setBilling(current=>current.map(item=>item.id===document.id?data.document:item));
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
    if(!document?.id||!String(document.id).includes("-")) {
      showToast("Ce devis n’est pas encore enregistré en base.");
      return;
    }
    try {
      const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Envoyé",statusOnly:true,statusComment:"Dévalidation — retour à Envoyé"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Dévalidation impossible");
      setBilling(current=>current.map(item=>item.id===document.id?data.document:item));
      setVisits(visits.filter(visit=>visit.quoteId!==document.id));
      showToast("Devis dévalidé — prévisite technique associée supprimée");
    } catch(error) {
      showToast(String(error?.message||"Dévalidation impossible"));
    }
  }

  async function decideQuoteFinance(document, financeStatus) {
    if(!document?.id||!String(document.id).includes("-")) {
      showToast("Ce devis n’est pas encore enregistré en base.");
      return;
    }
    try {
      const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({financeStatus,statusOnly:true})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Décision de financement impossible");
      setBilling(current=>current.map(item=>item.id===document.id?data.document:item));
      showToast(`Financement ${financeStatus.toLowerCase()}. Commercial et responsable avisés.`);
    } catch(error) {
      showToast(String(error?.message||"Décision de financement impossible"));
    }
  }

  async function scheduleClientPrevisit(client, date) {
    if(!date) {
      showToast("Indiquez la date de prévisite.");
      return;
    }
    setVisits(current=>withScheduledPrevisit(current,client,date));
    if(client?.id&&String(client.id).includes("-")) {
      const response=await authFetch(`/api/clients/${client.id}/followup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) {
        showToast(data.error||`Prévisite programmée le ${new Date(date).toLocaleDateString("fr-FR")}`);
        return;
      }
    }
    showToast(`Prévisite programmée le ${new Date(date).toLocaleDateString("fr-FR")}. Commercial et responsable avisés.`);
  }

  async function assignQuoteCommercial(document, commercialId) {
    if(!document?.id||!String(document.id).includes("-")) {
      showToast("Ce document n’est pas encore enregistré en base.");
      return;
    }
    if(!commercialId) {
      showToast("Choisissez un commercial.");
      return;
    }
    try {
      const response=await authFetch(`/api/devis/${document.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({commercialId})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Attribution impossible");
      setBilling(current=>current.map(item=>item.id===document.id?data.document:item));
      showToast(`Devis attribué`);
    } catch(error) {
      showToast(String(error?.message||"Attribution impossible"));
    }
  }

  async function postBillingDocument(payload, { successMessage, nextActive } = {}) {
    const response=await authFetch("/api/devis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,number:""})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"Enregistrement du document impossible");
    setBilling(current=>[data.document,...current.filter(item=>item.id!==data.document.id)]);
    if(nextActive) setActive(nextActive);
    showToast(successMessage||`Document créé — ${data.document.number||""}`.trim());
    return data.document;
  }
  async function duplicateQuote(document) {
    const draft=cloneDocumentForCreate(document,{kind:"Devis",status:"Brouillon",labelSuffix:" (copie)"});
    setNewBillingKind("Devis");
    setEditingBilling({
      ...draft,
      items:(draft.items||[]).map((item,index)=>({...item,id:Date.now()+index})),
    });
    setModal("billing");
  }
  async function invoiceQuote(document) {
    if(!canInvoiceQuote(currentProfile)) return;
    if(!document?.id||!String(document.id).includes("-")) {
      showToast("Ce devis n’est pas encore enregistré en base.");
      return;
    }
    if(["Annulé","Refusé"].includes(document.status)) {
      showToast("Ce devis ne peut pas être facturé.");
      return;
    }
    if(document.status!=="Accepté"&&!window.confirm("Ce devis n’est pas validé. Créer la facture quand même ?")) return;
    if(billing.some(item=>item.kind==="Facture"&&item.sourceQuoteId===document.id)&&!window.confirm("Une facture existe déjà pour ce devis. En créer une autre ?")) return;
    try {
      const payload=cloneDocumentForCreate(document,{kind:"Facture",status:document.status==="Accepté"?"À payer":"Brouillon"});
      await postBillingDocument({
        ...payload,
        statusComment:`Facturation du devis ${document.number||""}`.trim(),
      },{nextActive:"Factures"});
    } catch(error) {
      showToast(String(error?.message||"Création de la facture impossible"));
    }
  }
  async function deleteQuote(document) {
    if(!document?.id||!String(document.id).includes("-")) {
      showToast("Ce document n’est pas encore enregistré en base.");
      return;
    }
    if(!window.confirm(`Supprimer ${document.kind==="Devis"?"le devis":document.kind==="Facture"?"la facture":"la pro forma"} ${document.number||""} ?`)) return;
    try {
      const response=await authFetch(`/api/devis/${document.id}`,{method:"DELETE"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Suppression impossible");
      setBilling(current=>current.filter(item=>item.id!==document.id));
      showToast("Document supprimé");
    } catch(error) {
      showToast(String(error?.message||"Suppression impossible"));
    }
  }

  async function createCatalogArticle(payload) {
    const selectedBrand=brands.find(item=>String(item.id)===String(payload.brandId||""))||brands.find(item=>item.name===payload.brand);
    const body={
      code:payload.code,
      name:payload.name,
      category:payload.category,
      subcategory:payload.subcategory||"",
      categoryId:payload.categoryId||"",
      subcategoryId:payload.subcategoryId||"",
      brandId:selectedBrand?.id||payload.brandId||"",
      brand:selectedBrand?.name||payload.brand||"",
      description:payload.description||"",
      technicalDescription:payload.technicalDescription||"",
      ficheName:payload.ficheName||"",
      ficheData:payload.ficheData||"",
      unit:payload.unit,
      tax:Number(payload.tax),
      buy:Number(payload.buy),
      sell:Number(payload.sell),
      status:payload.status||"Actif",
      powerW:payload.powerW?Number(payload.powerW):undefined,
      sourceReference:payload.sourceReference||"",
    };
    const response=await authFetch("/api/articles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"Enregistrement article impossible");
    if(!data.article?.id) throw new Error("L’article n’a pas été enregistré.");
    setArticles(current=>[data.article,...current.filter(item=>item.id!==data.article.id)]);
    setArticleCreateOpen(false);
    showToast("Article créé");
  }

  function isPersistedBundleId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
  }

  async function saveCatalogBundle(payload, { duplicate = false } = {}) {
    const existingId = !duplicate && isPersistedBundleId(payload.id) ? payload.id : "";
    const body = duplicate
      ? { ...payload, id: undefined, name: payload.name, status: "Actif", active: true }
      : payload;
    const response = await authFetch(existingId ? `/api/article-bundles/${existingId}` : "/api/article-bundles", {
      method: existingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Enregistrement du groupe impossible");
    setBundles(current => [data.bundle, ...current.filter(item => item.id !== data.bundle.id)]);
    return data.bundle;
  }

  async function ensureOutdoorBundles() {
    const response = await authFetch("/api/article-bundles/generate-outdoor", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 403) return [];
    if (!response.ok) throw new Error(data.error || "Création des groupes impossible");
    const created = Array.isArray(data.created) ? data.created : [];
    const updated = Array.isArray(data.updated) ? data.updated : [];
    const next = [...created, ...updated];
    if (next.length) {
      setBundles(current => [...next, ...current.filter(item => !next.some(row => row.id === item.id))]);
    }
    return created;
  }

  async function renameCatalogBundle(bundle, name) {
    const next = String(name || "").trim();
    if (!next || next === String(bundle?.name || "").trim()) return;
    await saveCatalogBundle({ ...normalizeBundle(bundle), name: next });
    showToast("Surtitre enregistré");
  }

  async function duplicateCatalogBundle(bundle) {
    const copy = normalizeBundle({ ...bundle, id: undefined, name: `${bundle.name} (copie)`, active: true, status: "Actif" });
    await saveCatalogBundle(copy, { duplicate: true });
    showToast("Groupe dupliqué");
  }

  async function deleteCatalogArticle(article) {
    if (!canDeleteCatalogArticles) return showToast("Suppression d’article réservée à la fonction cochée.");
    if (!window.confirm(`Supprimer définitivement l’article « ${article.code || article.name} » ?`)) return;
    if (!String(article?.id || "").includes("-")) {
      setArticles(current => current.filter(item => String(item.id) !== String(article.id)));
      showToast("Article supprimé");
      return;
    }
    const response = await authFetch(`/api/articles/${article.id}?hard=1`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Suppression impossible");
    setArticles(current => current.filter(item => item.id !== article.id));
    showToast("Article supprimé");
  }

  async function deleteCatalogBundle(bundle) {
    if (!window.confirm(`Supprimer le groupe « ${bundle.name} » ?`)) return;
    if (!isPersistedBundleId(bundle.id)) {
      setBundles(current => current.filter(item => String(item.id) !== String(bundle.id)));
      showToast("Groupe supprimé");
      return;
    }
    const response = await authFetch(`/api/article-bundles/${bundle.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Suppression impossible");
    setBundles(current => current.filter(item => item.id !== bundle.id));
    showToast("Groupe supprimé");
  }

  async function toggleCatalogBundle(bundle, nextActive) {
    if (isItemActive(bundle) === nextActive) return;
    if (!isPersistedBundleId(bundle.id)) {
      showToast("Ce groupe n’est pas encore enregistré en base.");
      return;
    }
    const response = await authFetch(`/api/article-bundles/${bundle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextActive ? "Actif" : "Inactif" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Mise à jour impossible");
    setBundles(current => current.map(item => item.id === bundle.id ? data.bundle : item));
    showToast(nextActive ? "Groupe activé" : "Groupe désactivé");
  }

  const mainAction = active==="Clients" ? ["Nouveau client","client"] : active==="Maintenance" ? ["Nouveau contrat","contract"] : active==="Devis" ? ["Nouveau devis","billing"] : active==="Factures" ? ["Nouvelle facture","billing"] : active==="Factures pro forma" ? ["Nouvelle pro forma","billing"] : active==="Fournisseurs" ? ["Nouveau fournisseur","supplier"] : active==="Articles" ? ["Nouvel article","article"] : active==="Catégories d’articles" ? ["Nouvelle sous-catégorie","group"] : active==="Bibliothèque de groupes" ? ["Nouveau groupe","bundle"] : active==="Visites techniques" ? ["Nouvelle visite","visit"] : active==="Utilisateurs" ? ["Nouvel utilisateur","user"] : ["Nouveau prospect","prospect"];
  const canViewActive=canAccessWorkspace(allowedModules,active,currentProfile)||(active==="Parc automobile"&&fleetDriver);
  const canBackup=canPerformAction(currentProfile,"backup");
  const canExport=canPerformAction(currentProfile,"export_clients");
  const canDelete=canPerformAction(currentProfile,"delete_appointment");
  const canEditAppointments=canEditExistingAppointment(currentProfile);
  async function requestWithOverlap(url, method, body, fallbackError) {
    const canForce=canAssignClientCommercial(currentProfile);
    let response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    let payload=await response.json().catch(()=>({}));
    if(response.status===409){
      if(confirmAgendaOverlap(payload,{canForce})){
        response=await authFetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,forceOverlap:true})});
        payload=await response.json().catch(()=>({}));
      } else {
        throw new Error(payload.error||"Créneau déjà occupé");
      }
    }
    if(!response.ok) throw new Error(payload.error||fallbackError);
    return payload;
  }
  async function scheduleProspectAppointment(prospect,data) {
    const body={
      prospectId:prospect.id,
      prospectName:prospect.name,
      city:prospect.city,
      type:prospect.type,
      start:data.start,
      duration:data.duration,
      notes:data.notes,
      appointmentType:data.appointmentType,
      kind:data.actionKind||data.kind,
      commercialId:data.commercialId,
      subject:data.subject,
      appointmentAddress:data.appointmentAddress||data.address,
      address:prospect.address,
      addressComplement:prospect.addressComplement,
      postalCode:prospect.postalCode,
      phone:data.appointmentPhone||prospect.phone,
      meetingMode:data.meetingMode,
    };
    if(browserIsOffline()) return queueOfflineAppointment(body);
    try {
      const payload=await requestWithOverlap("/api/appointments","POST",body,"Planification impossible");
      setCommercialAppointments(current=>[payload.appointment,...current.filter(item=>item.id!==payload.appointment.id)]);
      return payload.appointment;
    } catch(error) {
      if(!isNetworkFailure(error)) throw error;
      return queueOfflineAppointment(body);
    }
  }
  async function createAppointment(data) {
    if(browserIsOffline()) return queueOfflineAppointment(data);
    try {
      const payload=await requestWithOverlap("/api/appointments","POST",data,"Création impossible");
      setCommercialAppointments(current=>[payload.appointment,...current.filter(item=>item.id!==payload.appointment.id)]);
      return payload.appointment;
    } catch(error) {
      if(!isNetworkFailure(error)) throw error;
      return queueOfflineAppointment(data);
    }
  }
  function stampProspectRdv(prospect, appointments) {
    if(!prospect?.id) return prospect;
    const live = latestRdvStatusForProspect(prospect.id, appointments);
    if(!live || live === prospect.rdvStatus) return prospect;
    return { ...prospect, rdvStatus: live };
  }
  async function updateAppointment(item,changes) {
    if(agendaScheduleIsChanging(item, changes)) {
      throw new Error(APPOINTMENT_MOVE_ERROR);
    }
    if(isAppointmentOutcomeOnlyPatch(changes) && !canApplyRdvStatus(currentProfile, currentProfile?.id, item, changes.status)) {
      throw new Error(rdvStatusDeniedMessage(currentProfile, currentProfile?.id, item, changes.status));
    }
    if(isAgendaPhonePatch(changes) && !canCorrectAppointmentPhone(currentProfile, currentProfile?.id, item) && !canEditExistingAppointment(currentProfile)) {
      throw new Error("Seul le commercial assigné à ce rendez-vous peut corriger le numéro.");
    }
    if(!canEditExistingAppointment(currentProfile) && !isAppointmentOutcomeOnlyPatch(changes) && !isAgendaAssignOrCommentPatch(changes) && !isAgendaPhonePatch(changes)) {
      throw new Error("Un rendez-vous existant ne peut pas être modifié. Dupliquez-le pour en créer un nouveau.");
    }
    if(browserIsOffline()) return queueOfflineAppointment({ ...item, ...changes }, item, changes);
    try {
      const payload=await requestWithOverlap(`/api/appointments/${item.id}`,"PATCH",changes,"Mise à jour impossible");
      const saved=payload.appointment;
      let nextAppointments=[];
      setCommercialAppointments(current=>{
        nextAppointments=current.map(row=>row.id===item.id?saved:row);
        return nextAppointments;
      });
      const prospectId=saved?.prospectId||item.prospectId;
      const live=prospectId?latestRdvStatusForProspect(prospectId, nextAppointments):"";
      if(prospectId&&live) {
        setOpps(rows=>rows.map(row=>String(row.id)===String(prospectId)?{...row, rdvStatus:live}:row));
        setEditingProspect(current=>current&&String(current.id)===String(prospectId)?{...current, rdvStatus:live}:current);
      }
      return saved;
    } catch(error) {
      if(!isNetworkFailure(error)) throw error;
      return queueOfflineAppointment({ ...item, ...changes }, item, changes);
    }
  }
  async function removeAppointment(item) {
    const response=await authFetch(`/api/appointments/${item.id}`,{method:"DELETE"});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||"Suppression impossible");
    setCommercialAppointments(current=>current.filter(row=>row.id!==item.id));
  }
  async function refreshCommercialAppointments() {
    const response=await authFetch("/api/appointments");
    const data=await response.json().catch(()=>({}));
    if(response.ok&&Array.isArray(data.appointments)) {
      setCommercialAppointments(data.appointments);
      setApiSnapshot(current=>current?{...current,appointments:data.appointments}:current);
    }
  }
  const canDeleteClients=canPerformAction(currentProfile,"delete_clients");
  const canDeleteProspects=canPerformAction(currentProfile,"delete_prospects");
  const canEditDirectory=canEditExistingProspect(currentProfile)&&canEditExistingClient(currentProfile);
  const editingAppointment=(commercialAppointments||[]).filter(item=>editingProspect&&String(item.prospectId)===String(editingProspect.id)&&item.kind!=="busy").sort((a,b)=>String(b.start||"").localeCompare(String(a.start||"")))[0]||null;
  async function deleteProspect(prospect){
    if(!prospect?.id) return;
    if(!window.confirm(`Supprimer le prospect ${prospect.name||""} ? Les rendez-vous liés seront aussi effacés.`)) return;
    try{
      const response=await authFetch(`/api/prospects/${prospect.id}`,{method:"DELETE"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Suppression impossible");
      setOpps(current=>current.filter(item=>String(item.id)!==String(prospect.id)));
      setCommercialAppointments(current=>current.filter(item=>String(item.prospectId||"")!==String(prospect.id)));
      setEditingProspect(null);
      setModal("");
      showToast("Prospect supprimé");
    }catch(error){
      showToast(String(error?.message||"Suppression impossible"));
    }
  }
  const canDeleteCatalogArticles=canDeleteArticles(currentProfile);
  const canAssignCommercial=canAssignClientCommercial(currentProfile)||canPerformAction(currentProfile,"view_all_clients");
  const canAssignProspect=canAssignProspectCommercial(currentProfile);
  const canDispatch=canDispatchProspects(currentProfile);
  const canSeeQueue=canSeeDispatchQueue(currentProfile);
  function openDispatchOnAgenda(prospect, appointment) {
    setAgendaFocusId(appointment?.id || "");
    setAgendaFocusStart(appointment?.start || prospect?.desiredAt || "");
    setActive("Agenda commercial");
  }
  const dispatcher=isProspectDispatcher(currentProfile);
  const fieldProspector=isFieldProspector(currentProfile);
  async function assignProspect(prospect,data) {
    const payload=await requestWithOverlap(`/api/prospects/${prospect.id}/assign`,"POST",{
      commercialId:data.commercialId,
      appointmentDate:data.appointmentDate,
      appointmentStart:data.appointmentStart,
      duration:data.duration,
      kind:data.kind||data.actionKind,
      notes:data.notes,
      reason:data.reason,
      notifyEmail:data.notifyEmail!==false,
    },"Attribution impossible");
    if(payload.prospect){
      setOpps(current=>current.map(item=>item.id===payload.prospect.id?payload.prospect:item));
    }
    if(payload.appointment){
      setCommercialAppointments(current=>[payload.appointment,...current.filter(item=>item.id!==payload.appointment.id)]);
    }
    return payload;
  }
  function openApplicationsHome() {
    skipNavPush.current=true;
    setNavStack([]);
    setActive("Applications");
    setSelectedFamily(null);
    setMenu(false);
    setQuery("");
  }
  function closeWorkspaceOverlays() {
    if(pdfStudio){ setPdfStudio(null); return true; }
    if(quoteWizard){ setQuoteWizard(null); return true; }
    if(bundleWizard!=null){ setBundleWizard(null); return true; }
    if(articleCreateOpen){ setArticleCreateOpen(false); return true; }
    if(modal){
      setModal("");
      setEditingBilling(null);
      setEditingProspect(null);
      setEditingUser(null);
      setEditingClient(null);
      setEditingArticle(null);
      setEditingBrand(null);
      setBrandLogoDraft("");
      return true;
    }
    if(clientRecordOpen){ setCloseClientRecordTick(tick=>tick+1); return true; }
    return false;
  }
  function goBack() {
    if(closeWorkspaceOverlays()) return;
    skipNavPush.current=true;
    const {stack,previous}=popWorkspacePlace(navStack);
    setNavStack(stack);
    setActive(previous.active||"Applications");
    setSelectedFamily(previous.selectedFamily||null);
    setMenu(false);
    setQuery("");
  }
  function rememberClient(client) {
    if(!client?.id) return;
    setClients(current=>[client,...current.filter(item=>String(item.id)!==String(client.id))]);
  }
  function startClientDocument(client, kind) {
    if(!findExistingClient(clients, client?.id)) {
      showToast(EXISTING_CLIENT_MESSAGE);
      return false;
    }
    if(kind==="thermal"||kind==="simulator"||kind==="previsit"||kind==="sizing") {
      setPdfStudio({ kind, client, id: "", preset: null, token: Date.now() });
      return;
    }
    if(kind==="install"&&!canCreateCompletePvStudy(currentProfile)) {
      showToast("L’étude d’installation photovoltaïque est réservée au responsable technique.");
      return false;
    }
    setDocumentClient({...client, launch:kind, token:Date.now()});
    if(kind==="contract") {
      setModal("contract");
      return;
    }
    if(kind==="soft"||kind==="install") {
      setActive("Études photovoltaïques");
      setQuery("");
    }
    return true;
  }
  function openDevisWizard({ client=null, prospect=null, resume=null } = {}) {
    if(blockOfflineDocument()) return;
    setActive("Devis");
    setQuoteWizard({ client, prospect, resume });
  }
  const overlayOpen=Boolean(pdfStudio||quoteWizard||bundleWizard!=null||articleCreateOpen||modal||clientRecordOpen);
  const canGoBack=overlayOpen||navStack.length>0||active!=="Applications"||Boolean(selectedFamily);
  const backLabel=workspaceBackLabel({overlay:overlayOpen,previous:navStack[navStack.length-1]});

  return <main className="app-shell">
    {profileLoaded && currentProfile ? <UsageTracker module={active} /> : null}
    {appointmentsReady && currentProfile ? <RdvStatuerAlert profile={currentProfile} userId={currentProfile.id} appointments={commercialAppointments} onUpdate={updateAppointment} /> : null}
    <aside className={`sidebar ${menu?"open":""}`}>
      <button className="brand" type="button" onClick={openApplicationsHome} title="Retour aux applications"><img src="/mkl-energies.png" alt="MKL Énergies"/><span>ESPACE CRM</span></button>
      <button className="close-mobile" onClick={()=>setMenu(false)}><X/></button>
      <nav><p className="nav-label">ESPACE DE TRAVAIL</p>{nav.filter(([label])=>canAccessWorkspace(allowedModules,label,currentProfile)||(label==="Parc automobile"&&fleetDriver)).map(([label,Icon])=>
        <button className={active===label&&(label!=="Applications"||!selectedFamily)?"active":""} key={label} onClick={()=>{if(["Devis","Factures","Factures pro forma"].includes(label)&&blockOfflineDocument())return;if(label==="Applications"){openApplicationsHome();return;}setActive(label);setMenu(false);setQuery("");}}><Icon size={19}/><span>{workspaceTitle(label, currentRole)}</span></button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="user"><div className="avatar">{(userName[0]||"U").toUpperCase()}</div><div><b>{userName}</b><span>{currentProfile?.previewUserId?`${currentRole} · vue`:(currentRole||"Profil en cours de chargement")}</span></div><MoreHorizontal size={18}/></div>
      </div>
    </aside>
    <section className="workspace">
      {currentProfile?.previewUserId?<div className="role-preview-banner" role="status"><span>Vue <b>{currentProfile.previewUserName||currentProfile.previewRole}</b> — vous restez Admin VIP</span><button type="button" onClick={()=>{clearRolePreview();window.location.reload();}}>Revenir à Admin VIP</button></div>:null}
      {(fieldOffline||fieldPending>0)&&<div className="field-offline-banner" role="status"><b>{fieldOffline?"Hors connexion":"En attente d’envoi"}</b><span>{fieldOffline?"Prospects et agenda de cet appareil. ":" "}{fieldPending>0?`${fieldPending} saisie${fieldPending>1?"s":""} ${fieldPending>1?"partiront":"partira"} à la reconnexion. `:""}Le devis reste en ligne.</span></div>}
      <header>
        <button className="menu-mobile" onClick={()=>setMenu(true)}><Menu/></button>
        <div className="header-navigation">{canGoBack&&<button className="workspace-back" onClick={goBack}><ArrowLeft size={17}/><span>{backLabel}</span></button>}<div className="search"><Search size={18}/><input placeholder={active==="Clients"?"Nom, prénom, adresse ou n° client":active==="Prospects"?"Nom, prénom ou adresse":`Rechercher dans ${workspaceTitle(active, currentRole).toLowerCase()}…`} value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div></div>
        <div className="header-actions"><SyncStatus/><NotificationBell onOpenAgenda={()=>{setActive("Agenda commercial");setQuery("");}} onOpenRequest={id=>{setRequestFocus(id);setActive("Tickets internes");setQuery("");}}/><button className="logout-button" onClick={()=>logoutCrm()}><LogOut size={17}/>Déconnexion</button></div>
      </header>
      {canViewActive&&(active==="Maintenance"||entretienKeepAlive)?<div hidden={active!=="Maintenance"} className="entretien-keep-alive"><EntretienModule contracts={contracts} setContracts={setContracts} clients={clients} setBilling={setBilling} query={query} onAdd={()=>{setDocumentClient(null);setModal("contract");}} onOpenReport={(preset,client)=>setPdfStudio({kind:"report",client:client||null,id:"",preset:preset||null,token:Date.now()})} onOpenPrevisit={visit=>{const start=visit?.scheduled_start?new Date(visit.scheduled_start):null;const date=start&&!Number.isNaN(start.getTime())?new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(start):"";setPdfStudio({kind:"previsit",client:{id:visit.client_id,name:visit.title||"Client",address:visit.client_address||visit.location||"",phone:visit.client_phone||"",directoryKind:"client"},id:"",preset:{date,technician:visit.technicianName||""},token:Date.now()});}} toast={showToast} currentProfile={currentProfile} team={team}/></div>:null}
      {canViewActive&&active==="Applications" ? <Dashboard filtered={filtered} contracts={contracts} quotes={billing.filter(d=>d.kind==="Devis")} navigate={setActive} selectedFamily={selectedFamily} onSelectFamily={setSelectedFamily} applicationsOnly allowedModules={allowedModules} adminVip={isAdminVip(currentRole)} currentProfile={currentProfile} fleetDriver={fleetDriver} canBackup={canBackup} userName={userName} onBackup={exportFullBackup} legacyReport={legacyReport} legacyBusy={legacyBusy} onRecoverLegacy={recoverLegacyState} onDownloadLegacy={downloadLegacyArchive} appointments={commercialAppointments} currentUserId={currentProfile?.id} commercials={commercials} canFilter={canAssignCommercial} onUpdateAppointment={updateAppointment} toast={showToast} canEditAppointments={canEditAppointments} onOpenRequest={id=>{setRequestFocus(id);setActive("Tickets internes");setQuery("");}}/> :
       canViewActive&&active==="Vue d’ensemble" ? (dispatcher ? <ProspectingDashboard navigate={setActive} userName={userName}/> : <CommercialOverview navigate={setActive} allowedModules={allowedModules} userName={userName} canFilter={canAssignCommercial||["Direction","Admin VIP","Superadmin","Secrétariat","Responsable commercial"].includes(currentRole)} appointments={commercialAppointments} commercials={commercials} currentUserId={currentProfile?.id} viewerIsVip={isAdminVip(currentRole)}/>) :
       canViewActive&&active==="Prospects" ? <>
         <ProspectsView prospects={opps} appointments={commercialAppointments} query={query} canDispatch={canSeeQueue} canCreateQuote={canAccessModule(currentProfile,"Devis")} canDelete={canDeleteProspects} consultOnly={!canEditExistingProspect(currentProfile)&&!fieldProspector} canReviseRow={prospect=>canReviseProspect(currentProfile,prospect)} canPlan={!fieldProspector&&canEditExistingProspect(currentProfile)} fieldWindow={fieldProspector} includeConverted={fieldProspector||dispatcher} onAdd={()=>{setEditingProspect(null);setModal("prospect");}} onEdit={prospect=>{setEditingProspect(stampProspectRdv(prospect, commercialAppointments));setModal("prospect");}} onCreateQuote={prospect=>{openDevisWizard({ prospect });}} onSchedule={scheduleProspectAppointment} onAssign={assignProspect} onDelete={deleteProspect} onOpenAgenda={openDispatchOnAgenda} toast={showToast}/>
         {/* Demandes du site restées en échec ou en vérification de doublon.
             Placées sous la liste des prospects, là où le responsable
             prospection travaille déjà. Même autorisation que la route. */}
         {canReviewWebLeads(currentProfile) && <WebLeadBacklog/>}
       </> :
       canViewActive&&(active==="Agenda commercial"||active==="Suivi commerciaux"||active==="Rendez-vous commerciaux") ? <CommercialAgendaView key={active} appointments={commercialAppointments} prospects={visibleProspects(opps)} linkProspects={rdvDirectory} clients={clients} commercials={commercials} query={query} currentUserId={currentProfile?.id} currentProfile={currentProfile} canAssignCommercial={canAssignCommercial||canDispatch} canReassignCommercial={canAssignCommercial||dispatcher} focusAppointmentId={agendaFocusId} focusAppointmentStart={agendaFocusStart} onFocusHandled={()=>{setAgendaFocusId("");setAgendaFocusStart("");}} onAddProspect={()=>setModal("prospect")} onCreateEvent={createAppointment} onUpdate={updateAppointment} onRemove={removeAppointment} onOpenProspect={prospect=>{if(prospect){setEditingProspect(stampProspectRdv(prospect, commercialAppointments));setModal("prospect");setActive("Prospects");}} } onOpenClient={row=>{const client=clients.find(item=>String(item.id)===String(row?.clientId));if(client) setBoardClient(client);}} onGoogleSynced={refreshCommercialAppointments} toast={showToast} canDelete={canDelete} canEdit={canEditAppointments} initialView={active==="Suivi commerciaux"||active==="Rendez-vous commerciaux"?"table":"week"}/> :
       canViewActive&&active==="Clients" ? <ClientsView clients={clients} articles={articles} billing={billing} closeRecordTick={closeClientRecordTick} onRecordOpen={setClientRecordOpen} contracts={contracts} visits={visits} installations={installations} pvProjects={pvProjects} thermalStudies={thermalStudies} pvSimulations={pvSimulations} query={query} canExport={canExport} canDelete={canDeleteClients} openClientId={openClientId} onOpenedClient={()=>setOpenClientId(null)} onExport={exportExcel} onImport={f=>importCsv(f,"client")} onAdd={()=>{setEditingClient(null);setModal("client");}} onEdit={canEditDirectory?client=>{setEditingClient(client);setModal("client");}:undefined} onCreateQuote={client=>{openDevisWizard({ client });}} onFinanceDecision={decideQuoteFinance} onSchedulePrevisit={scheduleClientPrevisit} onStartDocument={startClientDocument} appointments={commercialAppointments} prospects={mergeRdvProspects(opps, rdvDirectory)} currentProfile={currentProfile} currentUserId={currentProfile?.id} onUpdateAppointment={updateAppointment} onDelete={async client=>{if(!window.confirm(`Supprimer ${client.name} ?`))return;try{const response=await authFetch(`/api/clients/${client.id}`,{method:"DELETE"});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Suppression impossible");setClients(clients.filter(item=>item.id!==client.id));showToast("Client supprimé");}catch(error){showToast(String(error?.message||"Suppression impossible"));}}}/> :
       canViewActive&&active==="Maintenance" ? null :
       canViewActive&&active==="Parc automobile" ? <FleetModule query={query} toast={showToast} currentProfile={currentProfile}/> :
       canViewActive&&active==="Tickets internes" ? <InternalRequestsModule query={query} toast={showToast} focusId={requestFocus} onFocusConsumed={()=>setRequestFocus("")} onOpenClient={clientId=>{setOpenClientId(clientId);setActive("Clients");}}/> :
       canViewActive&&active==="SAV" ? <SavModule query={query} toast={showToast} onOpenClient={clientId=>{setOpenClientId(clientId);setActive("Clients");}}/> :
       canViewActive&&active==="Planning" ? <InstallationPlanningView installations={installations} setInstallations={setInstallations} installationTeams={installationTeams} clients={clients} team={team} query={query} toast={showToast} mode="agenda" role={currentRole} commercials={commercials} canAssignCommercial={canAssignCommercial} onClientCreated={rememberClient}/> :
       canViewActive&&active==="Chantiers" ? <InstallationPlanningView installations={installations} setInstallations={setInstallations} installationTeams={installationTeams} clients={clients} team={team} query={query} toast={showToast} mode="chantiers" role={currentRole} commercials={commercials} canAssignCommercial={canAssignCommercial} onClientCreated={rememberClient}/> :
       canViewActive&&active==="Équipes d’installation" ? <InstallationTeamsView teams={installationTeams} setTeams={setInstallationTeams} users={team} setUsers={setTeam} query={query} toast={showToast}/> :
       canViewActive&&active==="Études thermiques" ? <ThermalStudiesView studies={thermalStudies} setStudies={setThermalStudies} query={query} toast={showToast} onCreate={()=>setPdfStudio({kind:"thermal",client:null,id:"",preset:null,token:Date.now()})} onOpen={study=>setPdfStudio({kind:"thermal",client:null,id:study.id,preset:null,token:Date.now()})}/> :
       canViewActive&&active==="Note de dimensionnement" ? <SizingNotesView studies={thermalStudies} setStudies={setThermalStudies} query={query} toast={showToast} onCreate={()=>setPdfStudio({kind:"sizing",client:null,id:"",preset:null,token:Date.now()})} onOpen={study=>setPdfStudio({kind:"sizing",client:null,id:study.id,preset:null,token:Date.now()})}/> :
       canViewActive&&active==="Simulateur photovoltaïque" ? <PvSimulationsView simulations={pvSimulations} setSimulations={setPvSimulations} query={query} toast={showToast} onCreate={()=>setPdfStudio({kind:"simulator",client:null,id:"",preset:null,token:Date.now()})} onOpen={study=>setPdfStudio({kind:"simulator",client:null,id:study.id,preset:null,token:Date.now()})}/> :
       canViewActive&&(active==="Photovoltaïque administratif"||active==="Études photovoltaïques") ? <PhotovoltaicAdminView projects={pvProjects} setProjects={setPvProjects} clients={clients} query={query} toast={showToast} commercials={commercials} canAssignCommercial={canAssignCommercial} presetClient={documentClient&&(documentClient.launch==="soft"||documentClient.launch==="install")?documentClient:null} onPresetConsumed={()=>setDocumentClient(null)} mode={active==="Études photovoltaïques"?"soft":"dossier"} currentProfile={currentProfile}/> :
       canViewActive&&active==="Visites techniques" ? <TechnicalVisitsView visits={visits} setVisits={setVisits} suppliers={suppliers} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} query={query} toast={showToast} onCreate={()=>setPdfStudio({kind:"previsit",client:null,id:"",preset:null,token:Date.now()})} onOpen={visit=>setPdfStudio({kind:"previsit",client:null,id:visit.id,preset:null,token:Date.now()})}/> :
       canViewActive&&active==="Devis" ? <BillingView kind="Devis" documents={billing.filter(d=>d.kind==="Devis")} clients={clients} articles={articles} commercials={commercials} people={team} query={query} canAssignCommercial={mustAssignDevisCommercial(currentProfile)} onAdd={()=>openDevisWizard()} onEdit={doc=>{setEditingBilling(doc);setModal("billing");}} onValidate={validateQuote} onUnvalidate={unvalidateQuote} onDuplicate={duplicateQuote} onInvoice={canInvoiceQuote(currentProfile)?invoiceQuote:undefined} onDelete={isAdminRole(currentRole)?deleteQuote:undefined} onStatusChange={changeQuoteStatus} onAssignCommercial={assignQuoteCommercial} toast={showToast}/> :
       canViewActive&&active==="Factures" ? <BillingView kind="Facture" documents={billing.filter(d=>d.kind==="Facture")} clients={clients} articles={articles} commercials={commercials} query={query} canAssignCommercial={mustAssignDevisCommercial(currentProfile)} onAdd={()=>{setEditingBilling(null);setNewBillingKind("Facture");setModal("billing");}} onEdit={doc=>{setEditingBilling(doc);setModal("billing");}} onDelete={isAdminRole(currentRole)?deleteQuote:undefined} onStatusChange={changeQuoteStatus} onAssignCommercial={assignQuoteCommercial} toast={showToast}/> :
       canViewActive&&active==="Factures pro forma" ? <BillingView kind="Pro forma" documents={billing.filter(d=>d.kind==="Pro forma")} clients={clients} articles={articles} commercials={commercials} query={query} canAssignCommercial={mustAssignDevisCommercial(currentProfile)} onAdd={()=>{setEditingBilling(null);setNewBillingKind("Pro forma");setModal("billing");}} onEdit={doc=>{setEditingBilling(doc);setModal("billing");}} onDelete={isAdminRole(currentRole)?deleteQuote:undefined} onStatusChange={changeQuoteStatus} onAssignCommercial={assignQuoteCommercial} toast={showToast}/> :
       canViewActive&&active==="Demandes de chiffrage" ? <CostRequestsView requests={costRequests} setRequests={setCostRequests} suppliers={suppliers} query={query} toast={showToast}/> :
       canViewActive&&active==="Fournisseurs" ? <SuppliersView suppliers={suppliers} query={query} onAdd={()=>setModal("supplier")}/> :
       canViewActive&&active==="Gestion des articles" ? <ArticleManagementView articles={articles} setArticles={setArticles} brands={brands} setBrands={setBrands} catalogCategories={catalogCategories} setCatalogCategories={setCatalogCategories} catalogSubcategories={catalogSubcategories} setCatalogSubcategories={setCatalogSubcategories} bundles={bundles} query={query} canDeleteArticles={canDeleteCatalogArticles} onAddArticle={()=>{setEditingArticle(null);setArticleCreateOpen(true);}} onEditArticle={article=>{setEditingArticle(article);setModal("article");}} onDeleteArticle={article=>deleteCatalogArticle(article).catch(error=>showToast(String(error?.message||"Suppression impossible")))} onAddBrand={()=>{setEditingBrand(null);setBrandLogoDraft("");setModal("brand");}} onEditBrand={brand=>{setEditingBrand(brand);setBrandLogoDraft(brand.logoUrl||"");setModal("brand");}} onImportArticle={f=>importCsv(f,"article")} onAddGroup={()=>setBundleWizard("new")} onEditGroup={bundle=>setBundleWizard(bundle)} onRenameGroup={(bundle,name)=>renameCatalogBundle(bundle,name).catch(error=>showToast(String(error?.message||"Surtitre impossible")))} onDuplicateGroup={bundle=>duplicateCatalogBundle(bundle).catch(error=>showToast(String(error?.message||"Duplication impossible")))} onDeleteGroup={bundle=>deleteCatalogBundle(bundle).catch(error=>showToast(String(error?.message||"Suppression impossible")))} onToggleGroup={(bundle,nextActive)=>toggleCatalogBundle(bundle,nextActive).catch(error=>showToast(String(error?.message||"Mise à jour impossible")))} onEnsureOutdoor={ensureOutdoorBundles} toast={showToast}/> :
       canViewActive&&active==="Grilles tarifaires PDF" ? <TariffGridsView articles={articles} query={query} toast={showToast} canPrint={isAdminRole(currentRole)}/> :
       canViewActive&&active==="Utilisateurs" && isAdminRole(currentRole) ? <UsersView users={team} teamReady={teamReady} setUsers={setTeam} query={query} currentUserId={currentProfile?.id} onAdd={()=>{setEditingUser(null);setModal("user");}} onEdit={user=>{setEditingUser(user);setModal("user");}} onInvite={resendInvitation} toast={showToast}/> :
       canViewActive&&active==="Entreprise" && isAdminVip(currentRole) ? <CompanyView toast={showToast}/> :
       canViewActive&&active==="Journal d’activités" && isAdminVip(currentRole) ? <ActivityJournalView query={query}/> :
       !canViewActive&&profileLoaded ? <AccessDenied role={currentRole}/> :
       <Placeholder title={active}/>}
    </section>
    {menu&&<div className="backdrop nav-backdrop" onClick={()=>setMenu(false)}/>}
    {articleCreateOpen&&<ArticlePickerWizard mode="create" articles={articles} categories={catalogCategories} subcategories={catalogSubcategories} brandCatalog={brands} includeInactive={false} onCreate={createCatalogArticle} onClose={()=>setArticleCreateOpen(false)}/>}
    {bundleWizard!=null&&<BundleBuilderWizard bundle={bundleWizard==="new"?null:bundleWizard} articles={articles} categories={catalogCategories} subcategories={catalogSubcategories} brandCatalog={brands} bundles={bundles} includeInactive={canManageArticles(currentProfile)} onSave={async payload=>{const saved=await saveCatalogBundle(payload);setBundleWizard(null);showToast(payload.id?"Groupe modifié":"Groupe créé");return saved;}} onClose={()=>setBundleWizard(null)}/>}
    {boardClient&&<ClientRecord articles={articles} client={clients.find(item=>String(item.id)===String(boardClient.id))||boardClient} clients={clients} billing={billing} contracts={contracts} visits={visits} installations={installations} pvProjects={pvProjects} thermalStudies={thermalStudies} pvSimulations={pvSimulations} canDelete={canDeleteClients} onEdit={canEditDirectory?()=>{const client=clients.find(item=>String(item.id)===String(boardClient.id))||boardClient;setEditingClient(client);setModal("client");setBoardClient(null);}:undefined} onCreateQuote={()=>{const client=clients.find(item=>String(item.id)===String(boardClient.id))||boardClient;openDevisWizard({ client });setBoardClient(null);}} onDelete={async()=>{const client=clients.find(item=>String(item.id)===String(boardClient.id))||boardClient;if(!window.confirm(`Supprimer ${client.name} ?`))return;try{const response=await authFetch(`/api/clients/${client.id}`,{method:"DELETE"});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Suppression impossible");setClients(clients.filter(item=>item.id!==client.id));setBoardClient(null);showToast("Client supprimé");}catch(error){showToast(String(error?.message||"Suppression impossible"));}}} onClose={()=>setBoardClient(null)} onFinanceDecision={decideQuoteFinance} onSchedulePrevisit={scheduleClientPrevisit} onStartDocument={kind=>{const person=clients.find(item=>String(item.id)===String(boardClient.id))||boardClient;if(startClientDocument(person,kind)!==false) setBoardClient(null);}} appointments={commercialAppointments} prospects={mergeRdvProspects(opps, rdvDirectory)} currentProfile={currentProfile} currentUserId={currentProfile?.id} onUpdateAppointment={updateAppointment}/>}
    {modal&&<Modal type={modal} presetClient={modal==="contract"&&documentClient?.launch==="contract"?documentClient:null} close={()=>{setModal("");setDocumentClient(current=>current?.launch==="contract"?null:current);setEditingBilling(null);setEditingProspect(null);setEditingUser(null);setEditingClient(null);setEditingArticle(null);setEditingBrand(null);setBrandLogoDraft("");}} submit={submit} clients={clients} prospects={opps} billing={billing} contracts={contracts} visits={visits} pvProjects={pvProjects} thermalStudies={thermalStudies} pvSimulations={pvSimulations} groups={groups} articles={articles} brands={brands} catalogCategories={catalogCategories} catalogSubcategories={catalogSubcategories} bundles={bundles} team={team} commercials={commercials} canAssignCommercial={canAssignCommercial} canAssignProspectCommercial={canAssignProspect} deferCommercial={dispatcher} fieldCapture={fieldProspector} prospectReadOnly={Boolean(editingProspect)&&!canReviseProspect(currentProfile,editingProspect)} editingAppointment={editingAppointment} clientReadOnly={!canEditDirectory&&Boolean(editingClient)} mustAssignCommercial={mustAssignDevisCommercial(currentProfile)} canManageCatalog={canManageArticles(currentProfile)} canDeleteProspect={canDeleteProspects} onDeleteProspect={deleteProspect} editingBilling={editingBilling} editingProspect={editingProspect} editingUser={editingUser} editingClient={editingClient} editingArticle={editingArticle} editingBrand={editingBrand} brandLogoDraft={brandLogoDraft} onBrandLogoDraft={setBrandLogoDraft} defaultBillingKind={newBillingKind} currentUserId={currentProfile?.id} currentUserName={userName} currentProfile={currentProfile} onClientCreated={rememberClient} onEnsureBundles={ensureOutdoorBundles}/>}
    {pdfStudio&&<PdfStudio key={pdfStudio.token} studio={pdfStudio} clients={clients} studies={thermalStudies} onClose={()=>setPdfStudio(null)} onThermalSaved={record=>setThermalStudies(current=>[record,...current.filter(item=>String(item.id)!==String(record.id))])} onSizingSaved={record=>setThermalStudies(current=>[record,...current.filter(item=>String(item.id)!==String(record.id))])} onSimulationSaved={record=>setPvSimulations(current=>[record,...current.filter(item=>String(item.id)!==String(record.id))])} onVisitSaved={record=>setVisits(current=>[record,...current.filter(item=>String(item.id)!==String(record.id))])}/>}
    {quoteWizard&&<DevisWizard clients={clients} prospects={opps} documents={billing} articles={articles} brands={brands} catalogCategories={catalogCategories} catalogSubcategories={catalogSubcategories} bundles={bundles} commercials={commercials} currentProfile={currentProfile} currentUserId={currentProfile?.id} currentUserName={userName} mustAssignCommercial={mustAssignDevisCommercial(currentProfile)} canAssignCommercial={canAssignCommercial} canManageCatalog={canManageArticles(currentProfile)} canDeleteDraft={isAdminRole(currentRole)} onEnsureBundles={ensureOutdoorBundles} initialClient={quoteWizard.client} initialProspect={quoteWizard.prospect} resumeDocument={quoteWizard.resume} onClientCreated={rememberClient} onSaved={(document,meta)=>{if(meta?.deleted){setBilling(current=>current.filter(item=>item.id!==document.id));return;}if(meta?.client) rememberClient(meta.client);if(meta?.convertedProspectId) setOpps(current=>current.filter(item=>String(item.id)!==String(meta.convertedProspectId)));setBilling(current=>[document,...current.filter(item=>item.id!==document.id)]);}} onOpenDocument={()=>{setActive("Devis");setQuoteWizard(null);}} onDuplicate={duplicateQuote} onClose={()=>setQuoteWizard(null)} toast={showToast}/>}
    {invitation&&<InvitationModal user={invitation} close={()=>setInvitation(null)} toast={showToast}/>}
    {toast&&<div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
  </main>;
}

function SyncStatus() {
  const [sync,setSync]=useState(null);
  useEffect(()=>{
    let hide;
    function onSync(event){
      const next=event.detail||{};
      setSync({status:next.status||"saved",message:next.message||"",key:next.key||""});
      window.clearTimeout(hide);
      if(next.status==="saved") hide=window.setTimeout(()=>setSync(current=>current?.status==="saved"?null:current),2800);
    }
    function onError(event){
      setSync({status:"error",message:event.detail?.message||"Enregistrement impossible",key:event.detail?.key||""});
    }
    window.addEventListener("mkl-org-state-sync",onSync);
    window.addEventListener("mkl-org-state-error",onError);
    return ()=>{
      window.removeEventListener("mkl-org-state-sync",onSync);
      window.removeEventListener("mkl-org-state-error",onError);
      window.clearTimeout(hide);
    };
  },[]);
  if(!sync) return null;
  const label=sync.status==="saving"?"Enregistrement…":sync.status==="error"?(sync.message||"Échec d’enregistrement"):"Enregistré pour l’équipe";
  return <div className={`sync-status is-${sync.status}`} role="status" aria-live="polite">
    {sync.status==="saving"?<RefreshCw size={14} className="sync-spin"/>:sync.status==="error"?<AlertTriangle size={14}/>:<CheckCircle2 size={14}/>}
    <span>{label}</span>
  </div>;
}

function CommercialOverview({navigate,allowedModules=null,userName="Utilisateur",canFilter=false,appointments=[],commercials:teamCommercials=[],currentUserId="",viewerIsVip=false}) {
  const [metrics,setMetrics]=useState(null);
  const [ranking,setRanking]=useState([]);
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
      setMetrics(data.metrics||null);
      setRanking(Array.isArray(data.ranking)?data.ranking:[]);
      setCommercials((data.commercials||[]).filter(user=>viewerIsVip||!isAdminVip(user.role)));
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

  useEffect(()=>{ loadDashboard(); },[]);

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
        <Kpi icon={Euro} title={filters.activity==="Maintenance"?"Contrats d’entretien":"CA signé"} value={filters.activity==="Maintenance"?<span className="kpi-amounts"><span>{euro(metrics.caSigne||0)} <small>HT</small></span><span>{euro(metrics.caSigneTtc||0)} <small>TTC</small></span></span>:euro(metrics.caSigne||0)} note={filters.activity==="Maintenance"?`${metrics.maintenanceContractCount||0} contrats`:"acceptés"} sub={filters.activity==="Maintenance"?"TVA 10 %":"période filtrée"} tone="sun"/>
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
      {canFilter&&ranking.length>0&&<section className="panel ranking-panel">
        <PanelHead title="Rendement de l’équipe" sub="CA signé et transformation, commercial par commercial" link="Devis"/>
        <div className="data-panel ranking-table">
          <div className="data-row data-head">
            <span>COMMERCIAL</span>
            <span>PROSPECTS</span>
            <span>RDV</span>
            <span>DEVIS EN COURS</span>
            <span>À RELANCER</span>
            <span>ACCEPTÉS</span>
            <span>TAUX</span>
            <span>PIPELINE</span>
            <span>CA SIGNÉ</span>
          </div>
          {ranking.map((row,index)=>(
            <button
              type="button"
              className={`data-row${filters.commercialId&&String(filters.commercialId)===String(row.id)?" is-selected":""}`}
              key={row.id||`unassigned-${index}`}
              onClick={()=>updateFilter("commercialId", String(filters.commercialId)===String(row.id)?"":row.id)}
            >
              <span><b>{index+1}. {row.name}</b><small>{row.role||"Commercial"}</small></span>
              <span>{row.prospectsCount}</span>
              <span>{row.upcomingAppointmentsCount}</span>
              <span>{row.devisEnCoursCount}</span>
              <span>{row.devisARelancerCount}</span>
              <span>{row.devisAcceptesCount}</span>
              <span><b>{row.tauxTransformation} %</b></span>
              <span>{euro(row.pipelineValue||0)}</span>
              <span>{filters.activity==="Maintenance"?<><b>{euro(row.caSigne||0)} HT</b><small>{euro(row.caSigneTtc||0)} TTC</small></>:<b>{euro(row.caSigne||0)}</b>}</span>
            </button>
          ))}
        </div>
      </section>}
      {canFilter&&<section className="panel workload-panel">
        <PanelHead title="Charge de l’équipe" sub="Rendez-vous et rappels par commercial" link="Agenda commercial"/>
        <div className="workload-grid">
          {workloadByCommercial(appointments, commercials.length?commercials:teamCommercials).map(user=>(
            <article key={user.id}><b>{user.name}</b><span>{user.todayVisits} RDV aujourd’hui</span><span>{user.overdueCount} en retard</span><span>{user.weekCount} cette semaine</span></article>
          ))}
        </div>
      </section>}
    </>}
  </div>;
}

function LegacyStateNotice({report,busy,onRecover,onDownload}) {
  if(!report||!report.total) return null;
  const counts=[
    report.clients.length&&`${report.clients.length} client${report.clients.length>1?"s":""}`,
    report.articles.length&&`${report.articles.length} article${report.articles.length>1?"s":""}`,
    report.billing.length&&`${report.billing.length} devis`,
    report.prospects.length&&`${report.prospects.length} prospect${report.prospects.length>1?"s":""}`,
    report.appointments.length&&`${report.appointments.length} rendez-vous`,
  ].filter(Boolean);
  return <div className="legacy-notice">
    <div className="legacy-notice-head"><AlertTriangle size={18}/><b>Données présentes uniquement dans l’ancien stockage</b></div>
    <p>{counts.join(", ")} {report.total>1?"existent":"existe"} dans le stockage du navigateur ou l’ancien blob partagé, sans être enregistré{report.total>1?"s":""} en base. Ces données ne sont visibles que sur ce poste et disparaîtraient en changeant de navigateur.</p>
    {report.billing.length>0&&<p className="legacy-notice-warning">Les devis ne peuvent pas être recréés automatiquement : leur numéro est attribué par la base et leur historique de statuts ne serait pas reconstitué. Télécharge l’archive et ressaisis-les, ou demande-moi de les traiter au cas par cas.</p>}
    <div className="legacy-notice-actions">
      {report.recoverable>0&&<button className="primary" onClick={onRecover} disabled={busy}>{busy?<><RefreshCw size={16} className="spin"/>Récupération…</>:<><Upload size={16}/>Enregistrer en base ({report.recoverable})</>}</button>}
      <button className="secondary" onClick={onDownload}><Download size={16}/>Télécharger l’archive</button>
    </div>
  </div>;
}

function Dashboard({filtered,contracts,quotes,navigate,selectedFamily=null,onSelectFamily,applicationsOnly=false,onBackup,allowedModules=null,adminVip=false,currentProfile=null,fleetDriver=false,userName="Utilisateur",canBackup=false,legacyReport=null,legacyBusy=false,onRecoverLegacy,onDownloadLegacy,appointments=[],currentUserId="",commercials=[],canFilter=false,onUpdateAppointment,toast,canEditAppointments=true,onOpenRequest}) {
  const activityTargets={Devis:"Devis",Client:"Clients",Maintenance:"Maintenance",Chiffrage:"Demandes de chiffrage",Planning:"Planning"};
  const families=[
    {name:"Relations clients",icon:Users,color:"#2f9ed2",sub:"Prospects, clients et documents",apps:[["Prospects",Users,"Pipeline commercial"],["Suivi commerciaux",Table2,"Liste et statuts des RDV"],["Agenda commercial",CalendarDays,"Calendrier et répartition"],["Clients",Building2,"Fiches et coordonnées"]]},
    {name:"Commercial",icon:FileText,color:"#ef8e24",sub:"Devis et chiffrage",apps:[["Devis",FileText,"Offres commerciales"],["Études thermiques",Flame,"Déperditions, G et comparatif PAC"],["Note de dimensionnement",Ruler,"Dossier prime : déperditions et taux de couverture"],["Simulateur photovoltaïque",Sun,"Production photovoltaïque A × B × C × D"],["Études photovoltaïques",Sun,"Première étude chez le client"],["Demandes de chiffrage",ClipboardList,"Consultations fournisseurs"],["Factures pro forma",BadgeEuro,"Documents préparatoires"],["Tickets internes",Inbox,"Tickets entre collègues"]]},
    {name:"Administration",icon:ReceiptText,color:"#79a214",sub:"Facturation et démarches",apps:[["Factures",ReceiptText,"Factures clients"],["Factures pro forma",BadgeEuro,"Pro forma"],["Photovoltaïque administratif",Zap,"Dossier solaire et étude d’installation"],["Maintenance",Wrench,"Contrats d’entretien"],["SAV",Phone,"Appels et dossiers SAV"],["Tickets internes",Inbox,"Tickets entre collègues"]]},
    {name:"Opérations",icon:HardHat,color:"#d84b3d",sub:"Terrain, équipes et planning",apps:[["Chantiers",HardHat,"Suivi des travaux"],["Planning",CalendarCheck,"Agenda des équipes"],["Équipes d’installation",Users,"Sous-traitants et équipes"],["Visites techniques",Eye,"Prévisites et validations"],["Maintenance",Wrench,"Rapports d’intervention"],["Parc automobile",Car,"Véhicules, conducteurs et coûts"],["SAV",Phone,"Appels et dossiers SAV"],["Tickets internes",Inbox,"Tickets entre collègues"]]},
    {name:"Catalogue",icon:Package,color:"#8d623b",sub:"Articles, groupes et fournisseurs",apps:[["Gestion des articles",Package,"Articles, tarifs et groupes"],["Grilles tarifaires PDF",FileSpreadsheet,"PDF PAC, fournitures et installation"],["Fournisseurs",Truck,"Annuaire fournisseurs"]]},
    {name:"Pilotage",icon:TrendingUp,color:"#8f9395",sub:"Activité et indicateurs",apps:[["Vue d’ensemble",LayoutDashboard,"Tableau de bord"],["Prospects",TrendingUp,"Analyse du pipeline"],["Chantiers",HardHat,"Activité opérationnelle"]]},
    {name:"Configuration",icon:ShieldCheck,color:"#4b5d84",sub:"Équipe et droits d’accès",apps:[["Utilisateurs",ShieldCheck,"Comptes et autorisations"],["Entreprise",Landmark,"SIRET, téléphone et mentions légales"],["Journal d’activités",ScrollText,"Traçabilité réservée à l’Admin VIP"]]},
  ].map(family=>({...family,apps:family.apps.filter(([label])=>isVipOnlyNav(label)?adminVip:canAccessWorkspace(allowedModules,label,currentProfile)||(label==="Parc automobile"&&fleetDriver))})).filter(family=>family.apps.length>0);
  const visibleFamilies=homeFamiliesForRole(families, currentProfile?.role);
  const currentFamily=visibleFamilies.find(family=>family.name===selectedFamily);
  const recentActivity=[["Devis","DEV-2026-042 modifié","Il y a 10 min",FileText],["Client","SCI Horizon consulté","Aujourd’hui",Building2],["Maintenance","Rapport EARL Bellevue","Aujourd’hui",Wrench],["Chiffrage","Demande fournisseur créée","Hier",ClipboardList],["Planning","Visite technique programmée","Hier",CalendarCheck]].filter(([type])=>canAccessNav(allowedModules,activityTargets[type]||type));
  const launcher=<section className="workspace-launcher">
    <div className={`workspace-launcher-main${currentFamily?"":" is-home"}`}>
      {currentFamily?<div className="workspace-launcher-head"><div><p>ESPACE DE TRAVAIL</p><h2>{currentFamily.name}</h2><span>{currentFamily.sub}</span></div><button onClick={()=>onSelectFamily?.(null)}><ChevronRight size={15}/>Retour aux espaces</button></div>:null}
      {!currentFamily?<div className="family-grid">{visibleFamilies.map(({name,icon:Icon,color,sub,apps})=><button className="family-tile" key={name} onClick={()=>onSelectFamily?.(name)} style={{"--family-color":color}}><span className="family-icon"><Icon size={38}/></span><b>{name}</b><small>{sub}</small><em>{apps.length} application{apps.length>1?"s":""}</em></button>)}</div>:
      <div className="family-app-grid">{currentFamily.apps.map(([label,Icon,sub],index)=><button key={`${label}-${index}`} className="family-app" onClick={()=>navigate(label)} style={{"--family-color":currentFamily.color}}><span><Icon size={31}/></span><b>{workspaceTitle(label, currentProfile?.role)}</b><small>{sub}</small></button>)}</div>}
    </div>
    <aside className="recent-activity"><div><Clock3 size={16}/><h3>Dernières actions</h3></div>{recentActivity.map(([type,label,time,Icon])=><button key={label} onClick={()=>navigate(activityTargets[type]||type)}><i><Icon size={13}/></i><span><b>{label}</b><small>{time}</small></span></button>)}</aside>
  </section>;
  if(applicationsOnly) {
    return <div className="content applications-home"><div className="applications-home-head"><div><p>BIENVENUE DANS MKL ÉNERGIES</p><h1>Mes applications</h1><span>Choisissez votre espace de travail</span></div><div className="applications-home-actions"><TicketTermWelcome onNavigate={navigate} onOpenTicket={onOpenRequest}/>{canBackup&&<button className="backup-button" onClick={onBackup}><Download size={18}/><span><b>Sauvegarde complète</b><small>Clients, utilisateurs et essais</small></span></button>}{canAccessNav(allowedModules,"Vue d’ensemble")&&<button onClick={()=>navigate("Vue d’ensemble")}><LayoutDashboard size={18}/><span><b>Vue d’ensemble</b><small>Indicateurs commerciaux réels</small></span><ChevronRight size={16}/></button>}</div></div>{launcher}<LegacyStateNotice report={legacyReport} busy={legacyBusy} onRecover={onRecoverLegacy} onDownload={onDownloadLegacy}/></div>;
  }
  return <CommercialOverview navigate={navigate} allowedModules={allowedModules} userName={userName}/>;
}

function ModuleTop({eyebrow,title,sub,children}) { return <div className="module-content"><div className="module-top"><div><p>{eyebrow}</p><h1>{title}</h1><span>{sub}</span></div><div className="module-actions">{children}</div></div></div>; }
function ProspectsView({prospects,appointments,query,onAdd,onEdit,onCreateQuote,onSchedule,toast,canDispatch=false,canCreateQuote=true,canDelete=false,consultOnly=false,includeConverted=false,onAssign,onDelete,onOpenAgenda,canReviseRow,canPlan=false,fieldWindow=false}) {
  const [planning,setPlanning]=useState(null);
  const [textQuery,setTextQuery]=useState("");
  const [commercialFilter,setCommercialFilter]=useState("");
  const [prospectorFilter,setProspectorFilter]=useState("");
  const [dateFilter,setDateFilter]=useState("");
  const [originFilter,setOriginFilter]=useState("");
  const [sheetTab,setSheetTab]=useState("prospects");
  if (canDispatch) {
    return <ProspectDispatchBoard prospects={prospects} appointments={appointments} query={[query,textQuery].filter(Boolean).join(" ")} canDelete={canDelete} consultOnly={consultOnly} canReviseRow={canReviseRow} onAdd={onAdd} onEdit={onEdit} onAssign={onAssign} onDelete={onDelete} onOpenAgenda={onOpenAgenda} toast={toast}/>;
  }
  const base=visibleProspects(prospects,{includeConverted}).filter(p=>matchesPersonListQuery(p,query)&&matchesPersonListQuery(p,textQuery));
  const appointmentFor=prospect=>appointments.find(item=>item.prospectId===prospect.id&&item.kind!=="busy");
  const filtered=base.filter(p=>matchesDirectoryFilters(p,{commercialId:commercialFilter,prospectorId:prospectorFilter,date:dateFilter},prospectMoment(p,appointmentFor(p)))&&matchesOriginFilter(p,originFilter));
  const list=filtered.filter(p=>sheetTab==="contacts"?isContactSheetProspect(p,appointmentFor(p)):!isContactSheetProspect(p,appointmentFor(p)));
  const contactCount=filtered.filter(p=>isContactSheetProspect(p,appointmentFor(p))).length;
  const prospectCount=filtered.length-contactCount;
  const sheetLabel=sheetTab==="contacts"?`${list.length} fiche${list.length!==1?"s":""} contact`:`${list.length} prospect${list.length!==1?"s":""}`;
  const commercialChoices=peopleOptions(base,"commercialId","owner");
  const prospectorChoices=peopleOptions(base,"prospectorId","prospector");
  // Seules les origines réellement présentes sont proposées : un filtre qui ne
  // renvoie jamais rien est un piège, pas une fonctionnalité.
  const originChoices=originFilterOptions(base);
  async function schedule(event) {
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    try {
      await onSchedule?.(planning,data);
      setPlanning(null);
      toast("Rendez-vous ajouté à l’agenda commercial");
    } catch(error) {
      toast(String(error?.message||"Planification impossible"));
    }
  }
  return <><ModuleTop eyebrow="CONFIDENTIEL" title="Prospects" sub={fieldWindow?`${sheetLabel} — modifiable pendant 30 minutes après la création`:consultOnly?`${sheetLabel} — consultation du statut, sans modification`:sheetTab==="contacts"?`${sheetLabel} — elles rejoignent les prospects dès que le statut avance`:`${sheetLabel} — un devis ou une facture les fait passer clients`}><button className="primary" onClick={onAdd}><Plus size={17}/>Créer un prospect</button><div className="data-panel secure-list prospect-table is-rdv-status" onContextMenu={e=>e.preventDefault()}><div className="requests-tabs prospect-sheet-tabs" role="tablist"><button type="button" className={sheetTab==="prospects"?"active":""} onClick={()=>setSheetTab("prospects")}>Prospects ({prospectCount})</button><button type="button" className={sheetTab==="contacts"?"active":""} onClick={()=>setSheetTab("contacts")}>Contacts ({contactCount})</button></div><div className="directory-filters"><DirectoryListSearch value={textQuery} onChange={setTextQuery}/><label>Commercial<select value={commercialFilter} onChange={e=>setCommercialFilter(e.target.value)}><option value="">Tous</option><option value="unassigned">Non affecté</option>{commercialChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Prospecteur<select value={prospectorFilter} onChange={e=>setProspectorFilter(e.target.value)}><option value="">Tous</option><option value="unassigned">Non renseigné</option>{prospectorChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Origine<select value={originFilter} onChange={e=>setOriginFilter(e.target.value)}><option value="">Toutes</option>{originChoices.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Date<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label></div>{!list.length&&<div className="quote-empty">{sheetTab==="contacts"?"Aucune fiche contact pour cette recherche.":"Aucun prospect pour cette recherche."}</div>}<div className="data-row data-head"><span>N° prospect</span><span>PROSPECT</span><span>COORDONNÉES</span><span>ADRESSE / PROJET</span><span>ORIGINE</span><span>ÉTAPE</span><span>STATUT RDV</span><span>QUAND</span><span>COMMERCIAL</span><span>PROSPECTEUR</span><span>ACTIONS</span></div>{list.map((p,i)=>{const planned=appointments.find(item=>item.prospectId===p.id);const rdvStatus=latestRdvStatusForProspect(p.id,appointments)||p.rdvStatus;return <div className="data-row" key={p.id||`${p.name}-${i}`}><span className="client-number-cell"><CopyNumber value={formatProspectNumber(p.prospectNumber)}/></span><b>{p.name}</b><span><b>{p.phone||"Téléphone à compléter"}</b><small>{p.email}</small></span><span><b>{p.address||p.city||"Adresse à compléter"}</b><small>{[p.postalCode,p.city].filter(Boolean).join(" ")}{p.type?` · ${p.type}`:""}</small></span><ProspectOriginCell prospect={p}/><span className="status wait">{p.stage}</span><span className={`status ${rdvStatusTone(rdvStatus)}`}>{displayRdvStatus(rdvStatus)}</span><span><b>{formatProspectWhen(planned?.start||p.desiredAt)}</b><small>{(planned?.kind||p.desiredKind)==="rappel"?"Fiche contact":(planned?.start||p.desiredAt)?"Rendez-vous":""}</small></span><span><b>{p.owner||"Non affecté"}</b></span><span><b>{p.prospector||"Non renseigné"}</b></span><div className="prospect-actions">{!consultOnly&&canCreateQuote&&onCreateQuote&&<button className="edit-user" onClick={()=>onCreateQuote(p)} title="Créer un devis"><FileText size={15}/></button>}<button className="edit-user" onClick={()=>onEdit(p)} title={(canReviseRow?!canReviseRow(p):consultOnly)?"Consulter la fiche":"Modifier la fiche prospect"}>{(canReviseRow?!canReviseRow(p):consultOnly)?<Eye size={15}/>:<Pencil size={15}/>}</button>{canPlan&&<button className={planned?"agenda-planned":"agenda-add"} onClick={()=>setPlanning(p)}><CalendarDays size={15}/>{planned?"Replanifier":"Planifier"}</button>}{canDelete&&<button type="button" className="trash" onClick={()=>onDelete?.(p)} title="Supprimer le prospect"><Trash2 size={15}/></button>}</div></div>})}</div></ModuleTop>{planning&&<div className="backdrop"><div className="modal commercial-planning-modal"><button className="modal-close" onClick={()=>setPlanning(null)}><X/></button><div className="modal-icon"><CalendarDays/></div><h2>Planifier le rendez-vous</h2><p>{planning.name} — {[planning.address,planning.postalCode,planning.city].filter(Boolean).join(" ")||planning.city}</p><form onSubmit={schedule}><label>Date et heure<input name="start" type="datetime-local" required/></label><div className="form-row"><label>Durée<select name="duration"><option value="30">30 minutes</option><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Type de rendez-vous<select name="appointmentType"><option>Visite commerciale</option><option>Appel téléphonique</option><option>Visioconférence</option><option>Relance</option></select></label></div><label>Consignes<textarea name="notes" rows="3" placeholder="Besoins du prospect, documents à prévoir…"/></label><button className="primary submit" type="submit"><CalendarDays size={17}/>Ajouter à l’agenda</button></form></div></div>}</>;
}

function sameClient(doc,client) {
  if(!doc||!client) return false;
  if(doc.clientId!=null&&client.id!=null&&String(doc.clientId)===String(client.id)) return true;
  return Boolean(doc.client&&client.name&&doc.client===client.name);
}
function ClientsView({clients,billing=[],contracts=[],visits=[],installations=[],pvProjects=[],thermalStudies=[],pvSimulations=[],articles=[],query,canExport,canDelete=false,openClientId,onOpenedClient,onExport,onImport,onAdd,onEdit,onCreateQuote,onDelete,onFinanceDecision,onSchedulePrevisit,onStartDocument,closeRecordTick=0,onRecordOpen,appointments=[],prospects=[],currentProfile=null,currentUserId="",onUpdateAppointment}) {
  const [selectedClient,setSelectedClient]=useState(null);
  const [textQuery,setTextQuery]=useState("");
  const [commercialFilter,setCommercialFilter]=useState("");
  const [prospectorFilter,setProspectorFilter]=useState("");
  const [dateFilter,setDateFilter]=useState("");
  useEffect(()=>{
    if(!openClientId) return;
    const found=clients.find(c=>String(c.id)===String(openClientId));
    if(found){ setSelectedClient(found); onOpenedClient?.(); }
  },[openClientId,clients,onOpenedClient]);
  useEffect(()=>{ onRecordOpen?.(Boolean(selectedClient)); },[selectedClient,onRecordOpen]);
  useEffect(()=>{ if(closeRecordTick) setSelectedClient(null); },[closeRecordTick]);
  const base=clients.filter(c=>matchesPersonListQuery(c,query)&&matchesPersonListQuery(c,textQuery));
  const list=base.filter(c=>matchesDirectoryFilters(c,{commercialId:commercialFilter,prospectorId:prospectorFilter,date:dateFilter},c.createdAt));
  const commercialChoices=peopleOptions(base,"commercialId","owner");
  const prospectorChoices=peopleOptions(base,"prospectorId","prospector");
  return <><ModuleTop eyebrow="BASE CLIENTS CONFIDENTIELLE" title="Clients" sub={`${list.length} fiche${list.length!==1?"s":""} — ouvrez une fiche, le bouton Photographier est collé en bas`}>{canExport&&<><ImportButton onImport={onImport}/><button className="secondary" onClick={onExport}><FileSpreadsheet size={17}/>Exporter Excel</button></>}<button className="primary" onClick={onAdd}><Plus size={17}/>Nouveau client</button><div className="data-panel secure-list clients-table" onContextMenu={e=>e.preventDefault()}><div className="directory-filters"><DirectoryListSearch value={textQuery} onChange={setTextQuery}/><label>Commercial<select value={commercialFilter} onChange={e=>setCommercialFilter(e.target.value)}><option value="">Tous</option><option value="unassigned">Non affecté</option>{commercialChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Prospecteur<select value={prospectorFilter} onChange={e=>setProspectorFilter(e.target.value)}><option value="">Tous</option><option value="unassigned">Non renseigné</option>{prospectorChoices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Date de création<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label></div>{!list.length&&<div className="quote-empty">Aucun client pour cette recherche.</div>}<div className="data-row data-head"><span>N° client</span><span>Client</span><span>Contact</span><span>Coordonnées</span><span>Adresse</span><span>Projet</span><span>Commercial</span><span>Prospecteur</span><span>Statut</span></div>{list.map(c=><div role="button" tabIndex={0} className="data-row client-row-button" key={c.id} onClick={()=>setSelectedClient(c)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedClient(c);}}}><span className="client-number-cell"><CopyNumber value={formatClientNumber(c.clientNumber)}/>{formatProspectNumber(c.prospectNumber)?<small>{formatProspectNumber(c.prospectNumber)}</small>:null}</span><div className="entity"><i>{c.name?.[0]||"C"}</i><span><b>{c.name||"—"}</b><small>{c.customerType||"Client"}</small></span></div><span><b>{c.contact||`${c.firstName||""} ${c.lastName||""}`.trim()||"—"}</b>{c.civilite?<small>{c.civilite}</small>:null}</span><span><b>{c.email||"—"}</b><small>{c.mobile||c.phone||"—"}</small></span><span><b>{c.address||"Adresse à compléter"}</b><small>{[c.postalCode,c.city].filter(Boolean).join(" ")||"—"}</small></span><span><b>{c.projectType||c.install||"À définir"}</b></span><span><b>{c.owner||"Non affecté"}</b></span><span><b>{c.prospector||"Non renseigné"}</b></span><span className={`status ${c.status==="Client"?"ok":"wait"}`}>{c.status||"Prospect"}</span></div>)}</div>{canExport&&<div className="import-help"><ShieldCheck size={18}/><div><b>Accès Admin VIP</b><span>Import et export réservés au super administrateur.</span></div></div>}</ModuleTop>{selectedClient&&<ClientRecord articles={articles} client={selectedClient} clients={clients} billing={billing} contracts={contracts} visits={visits} installations={installations} pvProjects={pvProjects} thermalStudies={thermalStudies} pvSimulations={pvSimulations} canDelete={canDelete} onEdit={onEdit?()=>{onEdit(selectedClient);setSelectedClient(null);}:undefined} onCreateQuote={()=>{onCreateQuote?.(selectedClient);setSelectedClient(null);}} onDelete={()=>{onDelete?.(selectedClient);setSelectedClient(null);}} onClose={()=>setSelectedClient(null)} onFinanceDecision={onFinanceDecision} onSchedulePrevisit={onSchedulePrevisit} onStartDocument={onStartDocument?kind=>{if(onStartDocument(selectedClient,kind)!==false) setSelectedClient(null);}:undefined} appointments={appointments} prospects={prospects} currentProfile={currentProfile} currentUserId={currentUserId} onUpdateAppointment={onUpdateAppointment}/>}</>;
}
function ContractsView({contracts,setContracts,clients,setBilling,query,onAdd,toast}) {
  const list=contracts.filter(c=>Object.values(c).join(" ").toLowerCase().includes(query.toLowerCase()));
  async function complete(contract) {
    const client=clients.find(c=>(contract.clientId&&String(c.id)===String(contract.clientId))||c.name===contract.client);
    if(!client?.email) return toast("Renseignez d’abord l’adresse email du client");
    if(!client?.id||!String(client.id).includes("-")) return toast("Le client doit être enregistré en base pour générer la pro forma.");
    const today=new Date().toISOString().slice(0,10);
    const due=new Date(Date.now()+15*86400000).toISOString().slice(0,10);
    try {
      const response=await authFetch("/api/devis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        kind:"Pro forma",
        clientId:client.id,
        client:client.name||contract.client,
        status:"Envoyée",
        date:today,
        due,
        tax:20,
        label:contract.type,
        items:[{name:contract.type,qty:1,unit:Number(contract.amount)}],
      })});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Création de la pro forma impossible");
      const proforma=data.document;
      setBilling(current=>[proforma,...current.filter(item=>item.id!==proforma.id)]);
      setContracts(current=>current.map(c=>c.id===contract.id?{...c,status:"Entretien terminé — réglé"}:c));
      try {
        const mail=await authFetch("/api/proforma/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client,proforma})});
        const payload=await mail.json().catch(()=>({}));
        toast(mail.ok?"Pro forma générée et envoyée au client":`Pro forma générée — ${payload.error||"email non envoyé"}`);
      } catch { toast("Pro forma générée — service email indisponible"); }
    } catch(error) {
      toast(String(error?.message||"Création de la pro forma impossible"));
    }
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
function BillingView({kind,documents,clients,articles=[],commercials=[],people=[],query,canAssignCommercial=false,onAdd,onEdit,onValidate,onUnvalidate,onDuplicate,onInvoice,onDelete,onStatusChange,onAssignCommercial,toast}) {
  const [busyId,setBusyId]=useState("");
  const [printDoc,setPrintDoc]=useState(null);
  const [ownerFilter,setOwnerFilter]=useState("all");
  const [clientQuery,setClientQuery]=useState("");
  const [commercialFilter,setCommercialFilter]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [assigning,setAssigning]=useState(null);
  const [assignId,setAssignId]=useState("");
  const ownerCommercials=commercials.filter(user=>isDevisOwnerRole(user.role));
  const unassignedCount=documents.filter(isUnassignedDevis).length;
  const list=documents.filter(d=>{
    if(ownerFilter==="unassigned"&&!isUnassignedDevis(d)) return false;
    if(kind==="Devis"){
      if(commercialFilter==="unassigned"&&!isUnassignedDevis(d)) return false;
      if(commercialFilter&&commercialFilter!=="unassigned"&&String(d.commercialId||"")!==commercialFilter) return false;
      if(statusFilter&&d.status!==statusFilter) return false;
      if(!quoteMatchesClientQuery(d,clients,clientQuery)) return false;
    }
    return `${Object.values(d).join(" ")} ${creatorName(d)}`.toLowerCase().includes(query.toLowerCase());
  });
  const turnover=documents.reduce((s,d)=>s+billingTotals(d).totalTTC,0);
  const pending=documents.filter(d=>kind==="Facture"?d.status!=="Payée":!["Accepté","Refusé","Annulé","Expiré"].includes(d.status)).reduce((s,d)=>s+billingTotals(d).totalTTC,0);
  const showCreator=kind==="Devis";
  function personName(id) {
    const key=String(id||"");
    if(!key) return "";
    return people.find(user=>String(user.supabaseId||user.id)===key||String(user.id)===key)?.name||"";
  }
  function creatorName(doc) {
    return personName(doc.createdBy)||"—";
  }
  function commercialName(doc) {
    if(isUnassignedDevis(doc)) return "À attribuer";
    return personName(doc.commercialId)||commercials.find(user=>String(user.id)===String(doc.commercialId))?.name||"Commercial";
  }
  function commercialChoices() {
    const seen=new Map();
    documents.forEach(doc=>{
      if(isUnassignedDevis(doc)) return;
      const id=String(doc.commercialId||"");
      if(!id||seen.has(id)) return;
      seen.set(id,commercialName(doc));
    });
    return [...seen.entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  }
  function statusLabel(status) {
    return kind==="Devis"?quoteStatusLabel(status):status;
  }
  const statusOptions=statusesForKind(kind);
  async function download(doc) {
    if ((doc.kind || "Devis") === "Devis") {
      setPrintDoc(doc);
      return;
    }
    try {
      await openDevisPrintWindow(doc, { clients, articles, toast });
    } catch (error) {
      toast?.(String(error?.message || "Téléchargement PDF impossible"));
    }
  }
  async function runAction(action,doc) {
    if(!action||busyId) return;
    setBusyId(doc.id);
    try { await action(doc); }
    finally { setBusyId(""); }
  }
  const title=kind==="Facture"?"Factures":kind==="Pro forma"?"Factures pro forma":"Devis";
  return <ModuleTop eyebrow={kind==="Devis"?"GESTION COMMERCIALE":"ESPACE ADMINISTRATION"} title={title} sub={`${documents.length} ${title.toLowerCase()} enregistrés`}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Créer {kind==="Facture"?"une facture":kind==="Pro forma"?"une pro forma":"un devis"}</button>
    <div className="mini-kpis billing-kpis"><div><FileText/><span><b>{documents.length}</b>{kind==="Facture"?"factures":"devis"}</span></div><div><CircleDollarSign/><span><b>{euro(turnover)}</b>{kind==="Facture"?"facturé TTC":"proposé TTC"}</span></div><div><Clock3/><span><b>{euro(pending)}</b>{kind==="Facture"?"à encaisser":"en attente"}</span></div>{canAssignCommercial&&<div className={ownerFilter==="unassigned"?"is-active":""} role="button" tabIndex={0} onClick={()=>setOwnerFilter(current=>current==="unassigned"?"all":"unassigned")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOwnerFilter(current=>current==="unassigned"?"all":"unassigned");}}}><UserRound/><span><b>{unassignedCount}</b>à attribuer</span></div>}</div>
    {canAssignCommercial&&<div className="billing-assign-filters">
      <button type="button" className={ownerFilter==="all"?"active":""} onClick={()=>setOwnerFilter("all")}>Tous</button>
      <button type="button" className={ownerFilter==="unassigned"?"active":""} onClick={()=>setOwnerFilter("unassigned")}>Sans commercial ({unassignedCount})</button>
    </div>}
    {kind==="Devis"&&<div className="billing-toolbar"><DirectoryListSearch value={clientQuery} onChange={setClientQuery} placeholder="Nom ou prénom du client" label="Rechercher un devis par le nom ou le prénom du client"/><label>Commercial<select value={commercialFilter} onChange={e=>setCommercialFilter(e.target.value)}><option value="">Tous</option><option value="unassigned">Non affecté</option>{commercialChoices().map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Statut<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Tous</option>{statusOptions.map(status=><option key={status} value={status}>{quoteStatusLabel(status)}</option>)}</select></label></div>}
    <div className={`data-panel billing-table${showCreator?" has-creator":""}${kind==="Devis"?" has-toolbar":""}`}><div className="data-row data-head"><span>DOCUMENT</span><span>CLIENT</span><span>OBJET</span><span>DATE</span><span>TOTAL TTC</span><span>STATUT</span>{showCreator&&<span>COMMERCIAL</span>}{showCreator&&<span>CRÉÉ PAR</span>}<span></span></div>
      {kind==="Devis"&&!list.length&&<div className="quote-empty">Aucun devis pour cette recherche.</div>}
      {list.map(d=><div className="data-row" key={d.id}><span><b>{d.kind}{kind==="Devis"&&!d.deliveryDate?" — PROJET":""}</b><small>{d.number}</small></span><b>{d.client}</b><span className="billing-objet">{quoteArticleRefs(d)}</span><span>{d.date?new Date(d.date).toLocaleDateString("fr-FR"):"—"}</span><b>{euro(billingTotals(d).totalTTC)}</b><span className="billing-status-cell"><select className={`status-select ${statusTone(d.status)}`} value={statusOptions.includes(d.status)?d.status:d.status} onChange={e=>onStatusChange?.(d,e.target.value)} aria-label="Statut du document">{statusOptions.includes(d.status)?null:<option value={d.status}>{statusLabel(d.status)}</option>}{statusOptions.map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></span>{showCreator&&<span className={isUnassignedDevis(d)?"devis-unassigned":"devis-owner"}>{commercialName(d)}</span>}{showCreator&&<span>{creatorName(d)}</span>}<div className="document-actions">{canAssignCommercial&&isUnassignedDevis(d)&&onAssignCommercial&&<button className="assign-quote" disabled={busyId===d.id} onClick={()=>{setAssigning(d);setAssignId("");}} title="Attribuer au commercial"><UserRound size={15}/></button>}{kind==="Devis"&&d.status!=="Accepté"&&onValidate&&<button className="validate-quote" onClick={()=>runAction(onValidate,d)} title="Valider le devis"><CheckCircle2 size={15}/></button>}{kind==="Devis"&&d.status==="Accepté"&&onUnvalidate&&<button className="unvalidate-quote" onClick={()=>runAction(onUnvalidate,d)} title="Dévalider le devis"><X size={15}/></button>}{kind==="Devis"&&onDuplicate&&<button className="duplicate-quote" disabled={busyId===d.id} onClick={()=>runAction(onDuplicate,d)} title="Dupliquer le devis"><Copy size={15}/></button>}{kind==="Devis"&&onInvoice&&!["Annulé","Refusé"].includes(d.status)&&<button className="invoice-quote" disabled={busyId===d.id} onClick={()=>runAction(onInvoice,d)} title="Créer une facture"><ReceiptText size={15}/></button>}{d.pvStudyId&&<a className="download-doc pv-study-link" href={`/pv-study?id=${d.pvStudyId}`} target="_blank" title="Ouvrir l’étude solaire MKL"><Sun size={15}/></a>}{!["Accepté","Payée","Annulé"].includes(d.status)&&<button type="button" className="download-doc" onClick={()=>onEdit(d)} title="Modifier"><Pencil size={15}/></button>}<button type="button" className="download-doc" onClick={()=>download(d)} title="Télécharger le PDF"><Download size={16}/></button>{onDelete&&<button type="button" className="delete-quote" disabled={busyId===d.id} onClick={()=>runAction(onDelete,d)} title="Supprimer"><Trash2 size={15}/></button>}</div></div>)}
    </div>
    {assigning&&<div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget) setAssigning(null);}}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button type="button" className="modal-close" onClick={()=>setAssigning(null)}><X/></button><div className="modal-icon"><UserRound/></div><h2>Attribuer le devis</h2><p>{assigning.number} — {assigning.client}. Le chiffre d’affaires sera rattaché à ce commercial.</p><form onSubmit={async e=>{e.preventDefault();if(!assignId) return;await runAction(async()=>onAssignCommercial?.(assigning,assignId),assigning);setAssigning(null);}}><label>Commercial responsable<select required value={assignId} onChange={e=>setAssignId(e.target.value)}><option value="">Choisir un commercial</option>{ownerCommercials.map(user=><option key={user.id} value={user.id}>{user.name}{user.role==="Responsable commercial"?" — responsable":""}</option>)}</select></label><div className="modal-form-actions"><button className="primary submit" type="submit" disabled={busyId===assigning.id}><UserRound size={17}/>Attribuer</button></div></form></div></div>}
    {printDoc&&<DevisAnnexPicker doc={printDoc} articles={articles} clients={clients} toast={toast} onClose={()=>setPrintDoc(null)}/>}
  </ModuleTop>;
}
function ImportButton({onImport}) {
  return <label className="secondary import-button"><Upload size={17}/>Importer CSV<input type="file" accept=".csv,text/csv" onChange={e=>{onImport(e.target.files?.[0]);e.target.value="";}}/></label>;
}
function ArticleManagementView({articles,setArticles,brands=[],setBrands,catalogCategories=[],setCatalogCategories,catalogSubcategories=[],setCatalogSubcategories,bundles,query,canDeleteArticles=false,onAddArticle,onEditArticle,onDeleteArticle,onAddBrand,onEditBrand,onImportArticle,onAddGroup,onEditGroup,onRenameGroup,onDuplicateGroup,onDeleteGroup,onToggleGroup,onEnsureOutdoor,toast}) {
  const [tab,setTab]=useState("articles");
  const tabs=[
    ["articles","Articles",Package,articles.length],
    ["brands","Marques",Tag,brands.length],
    ["bundles","Groupes d’articles",Library,bundles.length],
    ["categories","Catégories",Layers3,catalogCategories.length],
  ];
  return <div className="article-management">
    <div className="article-management-tabs" role="tablist" aria-label="Gestion des articles">
      {tabs.map(([id,label,Icon,count])=><button type="button" role="tab" aria-selected={tab===id} className={tab===id?"active":""} key={id} onClick={()=>setTab(id)}><Icon size={17}/><span>{label}</span><b>{count}</b></button>)}
    </div>
    {tab==="articles"&&<ArticlesView articles={articles} setArticles={setArticles} query={query} canDelete={canDeleteArticles} onAdd={onAddArticle} onEdit={onEditArticle} onDelete={onDeleteArticle} onImport={onImportArticle} toast={toast}/>}
    {tab==="brands"&&<BrandsView brands={brands} setBrands={setBrands} query={query} onAdd={onAddBrand} onEdit={onEditBrand} toast={toast}/>}
    {tab==="bundles"&&<BundlesView bundles={bundles} articles={articles} query={query} onAdd={onAddGroup} onEdit={onEditGroup} onRename={onRenameGroup} onDuplicate={onDuplicateGroup} onDelete={onDeleteGroup} onToggleActive={onToggleGroup} onEnsureOutdoor={onEnsureOutdoor} toast={toast}/>}
    {tab==="categories"&&<CatalogTaxonomyAdmin categories={catalogCategories} setCategories={setCatalogCategories} subcategories={catalogSubcategories} setSubcategories={setCatalogSubcategories} articles={articles} query={query} toast={toast}/>}
  </div>;
}
function BrandsView({brands,setBrands,query,onAdd,onEdit,toast}) {
  const [localQuery,setLocalQuery]=useState("");
  const [busyId,setBusyId]=useState("");
  const search=`${query||""} ${localQuery||""}`.trim().toLowerCase();
  const list=brands.filter(brand=>!search||`${brand.name} ${brand.status}`.toLowerCase().includes(search));
  async function setBrandActive(brand,nextActive) {
    if(isItemActive(brand)===nextActive) return;
    setBusyId(brand.id);
    try {
      const response=await authFetch(`/api/brands/${brand.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:nextActive?"Actif":"Inactif"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Mise à jour impossible");
      setBrands(current=>current.map(item=>item.id===brand.id?(data.brand||{...item,status:nextActive?"Actif":"Inactif",active:nextActive}):item));
      toast(nextActive?"Marque activée":"Marque désactivée");
    } catch(error) {
      toast(String(error?.message||"Mise à jour impossible"));
    } finally {
      setBusyId("");
    }
  }
  return <ModuleTop eyebrow="CATALOGUE" title="Marques" sub={`${brands.length} marques — logos utilisés dans le parcours devis`}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Nouvelle marque</button>
    <div className="module-body">
      <div className="catalogue-search"><Search size={17}/><input value={localQuery} onChange={e=>setLocalQuery(e.target.value)} placeholder="Rechercher une marque…"/><span>{list.length}</span></div>
      <div className="data-panel brand-table"><div className="data-row data-head"><span>LOGO</span><span>MARQUE</span><span>ACTIVATION</span><span></span></div>
        {list.length===0&&<div className="quote-empty"><Tag size={20}/><span>Aucune marque — créez Dualsun, Daikin… avec leur logo</span></div>}
        {list.map(brand=>{
          const enabled=isItemActive(brand);
          return <div className={`data-row${enabled?"":" is-inactive"}`} key={brand.id}>
            <span className="brand-logo-cell">{brand.logoUrl?<img src={brand.logoUrl} alt=""/>:<i>{(brand.name||"?").slice(0,1).toUpperCase()}</i>}</span>
            <b>{brand.name}</b>
            <ActiveToggle active={enabled} busy={busyId===brand.id} onChange={next=>setBrandActive(brand,next)}/>
            <div className="document-actions">
              <button type="button" className="download-doc" onClick={()=>onEdit?.(brand)} title="Modifier"><Pencil size={15}/></button>
            </div>
          </div>;
        })}
      </div>
    </div>
  </ModuleTop>;
}
function ArticlesView({articles,setArticles,query,canDelete=false,onAdd,onEdit,onDelete,onImport,toast}) {
  const [localQuery,setLocalQuery]=useState("");
  const [categoryFilter,setCategoryFilter]=useState("");
  const [brandFilter,setBrandFilter]=useState("");
  const [busyId,setBusyId]=useState("");
  const [tariffBusy,setTariffBusy]=useState(false);
  const search=`${query||""} ${localQuery||""}`.trim();
  const categories=catalogArticleCategories(articles);
  const brandOptions=catalogArticleBrands(articles);
  const list=filterCatalogArticles(articles,{query:search,category:categoryFilter,brand:brandFilter});
  const stockValue=articles.reduce((s,a)=>s+Number(a.buy||0),0);
  const atlanticCount=atlanticHeatPumpArticles(articles).length;
  async function downloadTariff() {
    if(tariffBusy) return;
    setTariffBusy(true);
    try {
      let company=DEFAULT_COMPANY;
      try {
        const response=await authFetch("/api/company");
        const data=await response.json().catch(()=>({}));
        if(response.ok&&data.company) company=data.company;
      } catch {}
      await downloadAtlanticHeatPumpTariff(articles,{toast,company});
    } catch(error) {
      toast(String(error?.message||"Téléchargement de la grille impossible"));
    } finally {
      setTariffBusy(false);
    }
  }
  async function setArticleActive(article,nextActive) {
    if(!String(article?.id||"").includes("-")) return toast("Cet article n’est pas encore enregistré en base.");
    if(isItemActive(article)===nextActive) return;
    setBusyId(article.id);
    try {
      const response=await authFetch(`/api/articles/${article.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:nextActive?"Actif":"Inactif"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Mise à jour impossible");
      setArticles(current=>current.map(item=>item.id===article.id?(data.article||{...item,status:nextActive?"Actif":"Inactif",active:nextActive}):item));
      toast(nextActive?"Article activé":"Article désactivé");
    } catch(error) {
      toast(String(error?.message||"Mise à jour impossible"));
    } finally {
      setBusyId("");
    }
  }
  return <ModuleTop eyebrow="CATALOGUE" title="Articles" sub={`${articles.length} articles — référence unique · utilisés dans les devis`}>
    <button type="button" className="secondary" onClick={downloadTariff} disabled={tariffBusy} title="PDF des pompes à chaleur Atlantic enregistrées"><FileText size={17}/>{tariffBusy?"Grille…":`Grille tarifaire PAC Atlantic${atlanticCount?` (${atlanticCount})`:""}`}</button>
    <ImportButton onImport={onImport}/><button className="primary" onClick={onAdd}><Plus size={17}/>Nouvel article</button>
    <div className="article-toolbar">
      <div className="article-search catalogue-search"><Search size={17}/><input type="search" value={localQuery} onChange={e=>setLocalQuery(e.target.value)} placeholder="Rechercher référence, désignation, marque, catégorie…"/><span>{list.length}</span></div>
      <label className="article-filter"><span>Catégorie</span><select aria-label="Filtrer par catégorie" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Toutes les catégories</option>{categories.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
      <label className="article-filter"><span>Marque</span><select aria-label="Filtrer par marque" value={brandFilter} onChange={e=>setBrandFilter(e.target.value)}><option value="">Toutes les marques</option>{brandOptions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    </div>
    <div className="mini-kpis"><div><Package/><span><b>{articles.filter(a=>isItemActive(a)).length}</b>articles actifs</span></div><div><Layers3/><span><b>{new Set(articles.map(a=>a.category)).size}</b>catégories utilisées</span></div><div><Euro/><span><b>{euro(stockValue)}</b>valeur d’achat catalogue</span></div></div>
    <div className="data-panel articles-table"><div className="data-row data-head"><span>RÉFÉRENCE</span><span>DÉSIGNATION</span><span>CATÉGORIE</span><span>MARQUE</span><span>UNITÉ</span><span>PRIX D’ACHAT</span><span>PRIX DE VENTE</span><span>TVA</span><span>ACTIVATION</span><span></span></div>
      {list.length===0&&<div className="quote-empty"><Package size={20}/><span>Aucun article pour ce filtre.</span></div>}
      {list.map(a=>{const enabled=isItemActive(a);return <div className={`data-row${enabled?"":" is-inactive"}`} key={a.id}><span className="article-code">{a.code}</span><span className="article-name"><b>{a.name}</b>{a.subcategory&&<small>{a.subcategory}</small>}</span><span>{a.category}</span><span>{a.brand||"—"}</span><span>{a.unit}</span><span className="is-price">{euro(a.buy)}</span><span className="is-price">{euro(a.sell)}</span><span className="is-tax">{a.tax}%</span><ActiveToggle active={enabled} busy={busyId===a.id} onChange={next=>setArticleActive(a,next)}/><div className="document-actions">{articleHasCommercialDoc(a)&&<button type="button" className="download-doc" onClick={()=>downloadArticleCommercialDoc(a)} title="Télécharger la documentation commerciale"><Download size={15}/></button>}<button type="button" className="download-doc" onClick={()=>onEdit?.(a)} title="Modifier"><Pencil size={15}/></button>{canDelete&&<button type="button" className="trash" onClick={()=>onDelete?.(a)} title="Supprimer"><Trash2 size={15}/></button>}</div></div>;})}
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
    let company=DEFAULT_COMPANY;
    try {
      const response=await authFetch("/api/company");
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.company) company=data.company;
    } catch {}
    const rows=request.items.map(item=>`<tr><td>${item.code}</td><td>${item.name}</td><td>${item.qty}</td><td></td><td></td></tr>`).join("");
    const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><title>${request.number}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font:12px Arial;color:#25345c}.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:16mm;display:flex;flex-direction:column}.logo{width:62mm}header{display:flex;justify-content:space-between;border-bottom:4px solid #ffdb62;padding-bottom:8mm}.title{text-align:right}.title h1{font-size:20px;color:#405fae;margin:0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:10mm 0}.box{border:1px solid #d7dce5;border-radius:3mm;padding:4mm}.box span{display:block;font-size:9px;color:#808b9b;margin-bottom:2mm}.box b{font-size:12px}table{width:100%;border-collapse:collapse}th{background:#405fae;color:#fff}th,td{border:1px solid #d8dde5;padding:3mm;text-align:left}td:nth-child(3){text-align:center}.instructions{margin-top:7mm;background:#f3f5f9;padding:4mm;border-radius:3mm;font-size:10px}.spacer{flex:1}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:10mm}.signature{border-top:1px solid #aeb6c2;padding-top:3mm;color:#737e8e}.footer{border-top:1px solid #d8dde5;padding-top:4mm;margin-top:8mm;display:flex;justify-content:space-between;font-size:9px;color:#7f8998}${DOCUMENT_PARTIES_CSS}@media print{body{background:#fff}.sheet{margin:0}}</style><body><main class="sheet"><header><img class="logo" src="${logoData}"><div class="title"><h1>DEMANDE DE CHIFFRAGE</h1><p>${request.number}</p></div></header>${documentPartiesHtml(company,{name:request.client,title:"CLIENT / PROJET"})}<section class="meta"><div class="box"><span>DEVIS ASSOCIÉ</span><b>${request.quoteNumber}</b></div><div class="box"><span>DATE DE LA DEMANDE</span><b>${new Date(request.created).toLocaleDateString("fr-FR")}</b></div><div class="box"><span>DEMANDEUR</span><b>${request.requester}</b></div></section><table><tr><th>Référence</th><th>Grand matériel à chiffrer</th><th>Quantité</th><th>Prix fournisseur HT</th><th>Délai</th></tr>${rows}</table><div class="instructions"><b>Consignes :</b> merci d’indiquer pour chaque équipement le prix net HT, le délai de livraison, la durée de validité de l’offre et les conditions de transport.</div><div class="spacer"></div><section class="signatures"><div class="signature">Visa du responsable technique</div><div class="signature">Réponse fournisseur / date</div></section><footer class="footer"><span>${company.tradeName||company.legalName||"MKL Énergies"}</span><span>Demande générée automatiquement après validation du devis</span><span>Page 1/1</span></footer></main></body></html>`;
    const brandedHtml=html.replace("<title>",`<link rel="icon" type="image/png" href="${logoData}"><title>`);
    try {
      await downloadHtmlAsPdf(brandedHtml, { title: request.number, filename: request.number, toast });
    } catch (error) {
      toast(String(error?.message || "Téléchargement PDF impossible"));
    }
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
function TechnicalVisitsView({visits,setVisits,suppliers,purchaseOrders,setPurchaseOrders,query,toast,onCreate,onOpen}) {
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
  return <ModuleTop eyebrow="SERVICE TECHNIQUE" title="Prévisites techniques" sub={`${visits.length} prévisites • automatiques après validation du devis ou créées librement`}><button className="primary previsit-main-action" type="button" onClick={onCreate}><Plus size={17}/>Créer une prévisite sans devis</button><div className="technical-note"><ShieldCheck size={18}/><span>Consultation et modification autorisées au Responsable technique. La prévisite ne modifie jamais le devis.</span></div><div className="data-panel visits-table"><div className="data-row data-head"><span>PRÉVISITE</span><span>CLIENT</span><span>DEVIS / ORIGINE</span><span>DATE</span><span>RESPONSABLE</span><span>STATUT</span><span>ACTIONS</span></div>{list.map(visit=><div className="visit-list-item" key={visit.id}><div className="data-row"><span><b>PRE-{String(visit.id).slice(-6)}</b><small>{visit.created?new Date(visit.created).toLocaleDateString("fr-FR"):"Création manuelle"}</small></span><b>{visit.client||"Client à renseigner"}</b><span><b>{visit.quoteNumber||"Sans devis"}</b><small>{visit.source||"Création libre"}</small></span><span>{visit.date?new Date(visit.date).toLocaleDateString("fr-FR"):"À planifier"}</span><span>{visit.technician||"Responsable technique"}</span><span className={`status ${visit.status?.includes("Complétée")||visit.status?.includes("Validée")?"ok":"wait"}`}>{visit.status||"Brouillon"}</span><div className="document-actions"><button className="download-doc" type="button" onClick={()=>onOpen(visit)} title="Consulter ou modifier"><Pencil size={15}/></button><button className="download-doc" onClick={()=>setOrdering(ordering===visit.id?null:visit.id)} title="Préparer le bon de commande"><ShoppingCart size={15}/></button></div></div>{ordering===visit.id&&<div className="order-panel"><h4>Comparer les réponses et sélectionner le fournisseur le moins cher</h4><div>{suppliers.map(s=><label className="supplier-price" key={s.id}><input type="radio" name={`supplier-${visit.id}`} checked={Number(selected[visit.id])===s.id} onChange={()=>setSelected({...selected,[visit.id]:s.id})}/><span><b>{s.name}</b><small>{s.email}</small></span><input type="number" min="0" step="0.01" placeholder="Prix HT €" value={prices[`${visit.id}-${s.id}`]||""} onChange={e=>setPrices({...prices,[`${visit.id}-${s.id}`]:e.target.value})}/></label>)}</div><button className="primary" onClick={()=>validate(visit)}><ShoppingCart size={16}/>Valider et envoyer le bon de commande</button></div>}</div>)}</div></ModuleTop>;
}


function ThermalStudiesView({studies,setStudies,query,toast,onCreate,onOpen}) {
  const thermal=studies.filter(study=>!isSizingNote(study));
  const list=thermal.filter(study=>Object.values(study).join(" ").toLowerCase().includes(query.toLowerCase()));
  function remove(study) {
    if(!window.confirm(`Supprimer l’étude thermique ${study.number||""} ?`)) return;
    setStudies(studies.filter(item=>String(item.id)!==String(study.id)));
    toast("Étude thermique supprimée");
  }
  function clientLabel(study) {
    return study.client||`${study.lastName||""} ${study.firstName||""}`.trim()||"Client à renseigner";
  }
  function addressLabel(study) {
    return [study.address, study.postalCode, study.city].filter(Boolean).join(" ")||study.city||"Adresse à compléter";
  }
  return <ModuleTop eyebrow="SERVICE COMMERCIAL" title="Études thermiques" sub={`${thermal.length} étude${thermal.length!==1?"s":""} de déperditions`}>
    <button className="primary" type="button" onClick={onCreate}><Plus size={17}/>Nouvelle étude thermique</button>
    <div className="pv-summary thermal-summary">
      <div><Flame/><span><b>{thermal.length}</b>études enregistrées</span></div>
      <div><HardHat/><span><b>{thermal.reduce((sum,item)=>sum+Number(item.powerDynamicKw||0),0).toFixed(1)} kW</b>puissance étudiée</span></div>
      <div><Zap/><span><b>{Math.round(thermal.reduce((sum,item)=>sum+Number(item.energyKwh||0),0)).toLocaleString("fr-FR")} kWh</b>besoin annuel</span></div>
    </div>
    <div className="data-panel thermal-table">
      <div className="data-row data-head"><span>Étude</span><span>Client</span><span>Adresse</span><span>Volume</span><span>Puissance</span><span>Énergie</span><span></span></div>
      {list.map(study=><div className="data-row" key={study.id}>
        <span><b>{study.number||"Étude thermique"}</b><small>{study.signatureDate?new Date(study.signatureDate).toLocaleDateString("fr-FR"):""}</small></span>
        <span><b>{clientLabel(study)}</b>{formatClientNumber(study.clientNumber)?<small>{formatClientNumber(study.clientNumber)}</small>:null}</span>
        <span>{addressLabel(study)}</span>
        <span><b>{Number(study.volume||0).toLocaleString("fr-FR")} m³</b></span>
        <span><b>{Number(study.powerDynamicKw||0).toFixed(2)} kW</b></span>
        <span><b>{Number(study.energyKwh||0).toLocaleString("fr-FR")} kWh</b></span>
        <div className="thermal-row-actions">
          <button type="button" className="edit-user" onClick={()=>onOpen(study)} title="Ouvrir l’étude"><FileText size={15}/></button>
          <button type="button" className="delete-quote" onClick={()=>remove(study)} title="Supprimer"><Trash2 size={15}/></button>
        </div>
      </div>)}
    </div>
    {list.length===0&&<div className="quote-empty"><Flame size={20}/><span>Aucune étude thermique pour le moment. Créez-en une pour calculer les déperditions et générer le PDF.</span></div>}
  </ModuleTop>;
}

function SizingNotesView({studies,setStudies,query,toast,onCreate,onOpen}) {
  const notes=studies.filter(isSizingNote);
  const list=notes.filter(study=>Object.values(study).join(" ").toLowerCase().includes(query.toLowerCase()));
  function remove(study) {
    if(!window.confirm(`Supprimer la note de dimensionnement ${study.number||""} ?`)) return;
    setStudies(studies.filter(item=>String(item.id)!==String(study.id)));
    toast("Note de dimensionnement supprimée");
  }
  function clientLabel(study) {
    return study.client||`${study.lastName||""} ${study.firstName||""}`.trim()||"Client à renseigner";
  }
  function rateLabel(study) {
    if(study.family==="hybrid") {
      const energy=study.energyCoverage==null?"—":`${Number(study.energyCoverage).toLocaleString("fr-FR")} %`;
      const power=study.coverage==null?"—":`${Number(study.coverage).toLocaleString("fr-FR")} %`;
      return `${energy} hors appoint · ${power} puissance`;
    }
    if(study.family==="biomass") return "Déperditions";
    return study.coverage==null?"—":`${Number(study.coverage).toLocaleString("fr-FR")} %`;
  }
  return <ModuleTop eyebrow="DOSSIER PRIME" title="Notes de dimensionnement" sub={`${notes.length} note${notes.length!==1?"s":""}`}>
    <button className="primary" type="button" onClick={onCreate}><Plus size={17}/>Nouvelle note</button>
    <div className="data-panel thermal-table">
      <div className="data-row data-head"><span>Note</span><span>Client</span><span>Équipement</span><span>Déperditions</span><span>Couverture</span><span>Statut</span><span></span></div>
      {list.map(study=><div className="data-row" key={study.id}>
        <span><b>{study.number||"Note de dimensionnement"}</b><small>{study.noteDate?new Date(`${study.noteDate}T12:00:00`).toLocaleDateString("fr-FR"):""}</small></span>
        <span><b>{clientLabel(study)}</b></span>
        <span>{study.equipmentLabel||"—"}</span>
        <span><b>{Number(study.lossesKw||0).toLocaleString("fr-FR")} kW</b></span>
        <span>{rateLabel(study)}</span>
        <span className={`status ${study.verdictOk?"ok":"wait"}`}>{study.status||"À compléter"}</span>
        <div className="thermal-row-actions">
          <button type="button" className="edit-user" onClick={()=>onOpen(study)} title="Ouvrir la note"><FileText size={15}/></button>
          <button type="button" className="delete-quote" onClick={()=>remove(study)} title="Supprimer"><Trash2 size={15}/></button>
        </div>
      </div>)}
    </div>
    {list.length===0&&<div className="quote-empty"><Ruler size={20}/><span>Aucune note de dimensionnement. Créez-en une pour le dossier prime du client.</span></div>}
  </ModuleTop>;
}

function PvSimulationsView({simulations,setSimulations,query,toast,onCreate,onOpen}) {
  const list=simulations.filter(study=>Object.values(study).join(" ").toLowerCase().includes(query.toLowerCase()));
  const production=simulations.reduce((sum,item)=>sum+Number(item.production||0),0);
  function remove(study) {
    if(!window.confirm(`Supprimer le simulateur ${study.number||""} ?`)) return;
    setSimulations(simulations.filter(item=>String(item.id)!==String(study.id)));
    toast("Simulation photovoltaïque supprimée");
  }
  function clientLabel(study) {
    return study.client||`${study.lastName||""} ${study.firstName||""}`.trim()||"Client à renseigner";
  }
  function addressLabel(study) {
    return [study.address, study.postalCode, study.city].filter(Boolean).join(" ")||study.city||"Adresse à compléter";
  }
  function roofLabel(study) {
    const orientation=PV_ORIENTATIONS.find(item=>item.id===study.orientation)?.label;
    const inclination=PV_INCLINATIONS.find(item=>item.id===study.inclination)?.label;
    return [orientation, inclination].filter(Boolean).join(" · ")||"—";
  }
  return <ModuleTop eyebrow="SERVICE COMMERCIAL" title="Simulateur photovoltaïque" sub={`${simulations.length} estimation${simulations.length!==1?"s":""} de production`}>
    <button className="primary" type="button" onClick={onCreate}><Plus size={17}/>Nouveau simulateur</button>
    <div className="pv-summary thermal-summary">
      <div><Sun/><span><b>{simulations.length}</b>simulations enregistrées</span></div>
      <div><Zap/><span><b>{Math.round(production).toLocaleString("fr-FR")} kWh</b>production estimée</span></div>
    </div>
    <div className="data-panel pvsim-table">
      <div className="data-row data-head"><span>Simulation</span><span>Client</span><span>Adresse</span><span>Toiture</span><span>Puissance</span><span>Production</span><span></span></div>
      {list.map(study=><div className="data-row" key={study.id}>
        <span><b>{study.number||"Simulateur photovoltaïque"}</b><small>{study.created?new Date(study.created).toLocaleDateString("fr-FR"):""}</small></span>
        <span><b>{clientLabel(study)}</b>{formatClientNumber(study.clientNumber)?<small>{formatClientNumber(study.clientNumber)}</small>:null}</span>
        <span>{addressLabel(study)}</span>
        <span>{roofLabel(study)}</span>
        <span><b>{Number(study.powerKwc||0).toLocaleString("fr-FR")} kWc</b></span>
        <span><b>{Number(study.production||0).toLocaleString("fr-FR")} kWh</b></span>
        <div className="thermal-row-actions">
          <button type="button" className="edit-user" onClick={()=>onOpen(study)} title="Ouvrir le simulateur"><FileText size={15}/></button>
          <button type="button" className="delete-quote" onClick={()=>remove(study)} title="Supprimer"><Trash2 size={15}/></button>
        </div>
      </div>)}
    </div>
    {list.length===0&&<div className="quote-empty"><Sun size={20}/><span>Aucune simulation pour le moment. Le calcul A × B × C × D se fait dans le formulaire.</span></div>}
  </ModuleTop>;
}

function PhotovoltaicAdminView({projects,setProjects,clients,query,toast,commercials=[],canAssignCommercial=false,presetClient=null,onPresetConsumed,mode="dossier",currentProfile=null}) {
  const [showForm,setShowForm]=useState(false);
  const [showCompleteForm,setShowCompleteForm]=useState(false);
  const [completeTarget,setCompleteTarget]=useState(null);
  const [installPreset,setInstallPreset]=useState(null);
  const [dossierProject,setDossierProject]=useState(null);
  const { company } = useCompany();
  const softMode=mode==="soft";
  const canComplete=canCreateCompletePvStudy(currentProfile);
  const canDossier=canOpenSolarDossier(currentProfile);
  const [consumption,setConsumption]=useState(8000);
  const [panelPower,setPanelPower]=useState(450);
  const [roofArea,setRoofArea]=useState(50);
  const [yieldValue,setYieldValue]=useState(1100);
  const [geo,setGeo]=useState(null);
  const [pickedClient,setPickedClient]=useState(null);
  const theoreticalPanels=Math.max(1,Math.ceil(Number(consumption)/(Number(yieldValue)*Number(panelPower)/1000)));
  const roofCapacity=Math.max(1,Math.floor(Number(roofArea)/2));
  const panels=Math.min(theoreticalPanels,roofCapacity);
  const powerKwp=panels*Number(panelPower)/1000;
  const production=Math.round(powerKwp*Number(yieldValue));
  const coverage=Number(consumption)>0?Math.round(production/Number(consumption)*100):0;
  const list=projects.filter(project=>Object.values(project).join(" ").toLowerCase().includes(query.toLowerCase()));
  useEffect(()=>{
    if(!presetClient?.id||!presetClient.token) return;
    if(presetClient.launch==="install") {
      if(!canCreateCompletePvStudy(currentProfile)) toast("L’étude d’installation photovoltaïque est réservée au responsable technique.");
      else {
        setCompleteTarget(null);
        setInstallPreset(presetClient);
        setShowCompleteForm(true);
      }
    } else {
      setPickedClient(presetClient);
      setGeo({
        city:presetClient.city||"",
        address:presetClient.address||"",
        postcode:presetClient.postalCode||"",
        label:[presetClient.address,presetClient.postalCode,presetClient.city].filter(Boolean).join(" "),
      });
      setShowForm(true);
    }
    onPresetConsumed?.();
  },[presetClient?.token]);
  function create(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    const selectedClient=studySubject(clients, pickedClient?.directoryKind==="prospect"?pickedClient:{id:d.clientId||pickedClient?.id,clientId:d.clientId||pickedClient?.id,prospectId:pickedClient?.prospectId,directoryKind:pickedClient?.directoryKind||"client",name:pickedClient?.name||d.client});
    if(!selectedClient) {
      toast(EXISTING_CLIENT_MESSAGE);
      return;
    }
    if(!geo?.lat||!geo?.lon) {
      toast("Sélectionnez une adresse géolocalisée dans la liste");
      return;
    }
    setProjects([{
      ...d,
      id:Date.now(),
      studyKind:"soft",
      commercialId:currentProfile?.id||"",
      createdBy:currentProfile?.id||"",
      client:selectedClient.name||d.client,
      clientId:selectedClient.directoryKind==="prospect"?"":selectedClient.id,
      prospectId:selectedClient.directoryKind==="prospect"?selectedClient.prospectId:(selectedClient.prospectId||""),
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
      townHall:emptyTownHall({person:selectedClient}),
      created:new Date().toISOString().slice(0,10),
    },...projects]);
    setShowForm(false);
    setGeo(null);
    setPickedClient(null);
    toast(softMode?"Première étude chez le client enregistrée":"Étude photovoltaïque créée avec adresse géolocalisée");
  }
  function pickSoftClient(item) {
    setPickedClient(item||null);
    if(!item) return;
    const city=item.city||"";
    const address=item.address||"";
    const postcode=item.postalCode||"";
    setGeo(current=>({
      ...(current||{}),
      city:city||current?.city||"",
      address:address||current?.address||"",
      postcode:postcode||current?.postcode||"",
      label:[address,postcode,city].filter(Boolean).join(" ")||current?.label||"",
    }));
  }
  function saveComplete(next) {
    setProjects(current=>{
      const exists=current.some(item=>String(item.id)===String(next.id));
      return exists?current.map(item=>String(item.id)===String(next.id)?next:item):[next,...current];
    });
    setShowCompleteForm(false);
    setCompleteTarget(null);
    toast("Étude d’installation photovoltaïque enregistrée");
  }
  function update(project,key,value) {
    const person=clients.find(client=> (project.clientId&&String(client.id)===String(project.clientId))||client.name===project.client);
    setProjects(projects.map(item=>{
      if(item.id!==project.id) return item;
      if(key==="townHallStatus") return applyTownHallStatus(item,value,person||{});
      return {...item,[key]:value};
    }));
    toast("Démarche administrative mise à jour");
  }
  function saveDossier(next) {
    setProjects(projects.map(item=>item.id===next.id?next:item));
    setDossierProject(next);
  }
  function remove(project) {
    if(!window.confirm(`Supprimer le dossier photovoltaïque « ${project.name} » ?`)) return;
    setProjects(projects.filter(item=>item.id!==project.id));
    toast("Dossier photovoltaïque supprimé");
  }
  const plural=projects.length>1?"s":"";
  const pvSub=softMode
    ?`${projects.length} première${plural} étude${plural} — version soft pour le commercial`
    :`${projects.length} dossier${plural} — l’étude d’installation complète est réservée au responsable technique`;
  return <ModuleTop eyebrow={softMode?"SERVICE COMMERCIAL":"DOSSIER SOLAIRE"} title={softMode?"Étude PV chez le client":"Études et démarches photovoltaïques"} sub={pvSub}>
    <button className="primary" onClick={()=>{setShowForm(true);setGeo(null);setPickedClient(null);}}><Plus size={17}/>{softMode?"Nouvelle étude chez le client":"Nouvelle étude soft"}</button>
    {canComplete&&<button className="secondary" onClick={()=>{setCompleteTarget(null);setInstallPreset(null);setShowCompleteForm(true);}}><Sun size={17}/>Étude d’installation photovoltaïque</button>}
    <div className="pv-summary"><div><Zap/><span><b>{projects.reduce((sum,item)=>sum+Number(item.powerKwp||0),0).toFixed(1)} kWc</b>puissance étudiée</span></div><div><Building2/><span><b>{projects.filter(item=>item.townHallStatus==="Acceptée").length}</b>accords mairie</span></div><div><Truck/><span><b>{projects.filter(item=>item.gridStatus==="Raccordement validé").length}</b>raccordements validés</span></div></div>
    <div className={`data-panel pv-table${softMode?" is-soft":""}`}>
      <div className="data-row data-head"><span>PROJET</span><span>ADRESSE</span><span>DIMENSIONNEMENT</span>{!softMode&&<span>MAIRIE</span>}{!softMode&&<span>RACCORDEMENT</span>}<span>ACTIONS</span></div>
      {list.length===0&&<div className="data-row pv-table-empty">Aucune étude pour le moment.</div>}
      {list.map(project=>{
        const person=clients.find(client=>(project.clientId&&String(client.id)===String(project.clientId))||client.name===project.client);
        const progress=townHallPieceProgress(townHallFromProject(project,person),person||{});
        return <div className="data-row" key={project.id}>
          <span><b>{project.name}</b><small>{project.client||"Client à renseigner"}{project.quoteNumber?` · ${project.quoteNumber}`:""}</small></span>
          <span><b>{project.address||project.city||"Adresse à compléter"}</b><small>{[project.postcode,project.city].filter(Boolean).join(" ")}</small></span>
          <span><b>{Number(project.powerKwp||0).toFixed(1)} kWc</b><small>{project.panels||"—"} panneaux · {Number(project.estimatedProduction||0).toLocaleString("fr-FR")} kWh/an</small></span>
          {!softMode&&<span className="pv-table-status">
            <select value={project.townHallStatus||"À préparer"} onChange={event=>update(project,"townHallStatus",event.target.value)}>
              {TOWN_HALL_STATUSES.map(status=><option key={status}>{status}</option>)}
            </select>
            <small>{progress.done}/{progress.total} pièces</small>
          </span>}
          {!softMode&&<span className="pv-table-status">
            <select value={project.gridStatus||"À préparer"} onChange={event=>update(project,"gridStatus",event.target.value)}>
              {GRID_STATUSES.map(status=><option key={status}>{status}</option>)}
            </select>
          </span>}
          <div className="pv-table-actions">
            <a className="edit-user" href={`/pv-study?id=${project.id}`} target="_blank" title="Étude soft"><FileText size={15}/></a>
            {isCompletePvStudy(project)&&<a className="edit-user" href={`/pv-install-study?id=${project.id}`} target="_blank" title="Étude d’installation photovoltaïque"><Sun size={15}/></a>}
            {canComplete&&<button type="button" className="pv-table-dossier" onClick={()=>{setCompleteTarget(project);setShowCompleteForm(true);}}>{isCompletePvStudy(project)?"Compléter l’installation":"Étude d’installation"}</button>}
            {canDossier&&!softMode&&<button type="button" className="pv-table-dossier" onClick={()=>setDossierProject(project)}>Dossier</button>}
            <button type="button" className="delete-quote" onClick={()=>remove(project)} title="Supprimer"><Trash2 size={15}/></button>
          </div>
        </div>;
      })}
    </div>
    {dossierProject&&<PvTownHallDossier project={dossierProject} clients={clients} onClose={()=>setDossierProject(null)} onChange={saveDossier} toast={toast}/>}
    {showCompleteForm&&!studySubject(clients, installPreset)&&!studySubject(clients, completeTarget?{id:completeTarget.clientId||completeTarget.prospectId,clientId:completeTarget.clientId,prospectId:completeTarget.prospectId,directoryKind:completeTarget.prospectId&&!completeTarget.clientId?"prospect":"client",name:completeTarget.client}:null)&&<DocumentWindow eyebrow={softMode?"SERVICE COMMERCIAL":"DOSSIER SOLAIRE"} title="Étude d’installation photovoltaïque" clients={clients} allowProspect pickerOnly onConfirm={item=>setInstallPreset(item)} onClose={()=>{setShowCompleteForm(false);setCompleteTarget(null);setInstallPreset(null);}}/>}
    {showCompleteForm&&(studySubject(clients, installPreset)||studySubject(clients, completeTarget?{id:completeTarget.clientId||completeTarget.prospectId,clientId:completeTarget.clientId,prospectId:completeTarget.prospectId,directoryKind:completeTarget.prospectId&&!completeTarget.clientId?"prospect":"client",name:completeTarget.client}:null))&&<PvCompleteStudyForm project={completeTarget} initialClient={installPreset||clients.find(item=>completeTarget&&String(item.id)===String(completeTarget.clientId))||(completeTarget?.prospectId?{id:completeTarget.prospectId,prospectId:completeTarget.prospectId,directoryKind:"prospect",name:completeTarget.client}:null)} clients={clients} commercials={commercials} canAssignCommercial={canAssignCommercial} onClose={()=>{setShowCompleteForm(false);setCompleteTarget(null);setInstallPreset(null);}} onSave={saveComplete} toast={toast}/>}
    {showForm&&!pickedClient&&<DocumentWindow eyebrow={softMode?"SERVICE COMMERCIAL":"DOSSIER SOLAIRE"} title={softMode?"Nouvelle étude chez le client":"Nouvelle étude photovoltaïque soft"} clients={clients} allowProspect pickerOnly onConfirm={pickSoftClient} onClose={()=>{setShowForm(false);setGeo(null);setPickedClient(null);}}/>}
    {showForm&&pickedClient&&<div className="backdrop"><div className="modal pv-modal"><button type="button" className="modal-close" onClick={()=>{setShowForm(false);setGeo(null);setPickedClient(null);}}><X size={18}/></button><div className="modal-icon"><Sun/></div><h2>{softMode?"Nouvelle étude chez le client":"Nouvelle étude photovoltaïque soft"}</h2><form onSubmit={create}>
        <DocumentParties company={company} clientTitle="Client / destinataire" {...frozenRecipient(pickedClient)} />
        <input type="hidden" name="clientId" value={pickedClient.directoryKind==="prospect"?"":(pickedClient.id||"")} />
        <input type="hidden" name="prospectId" value={pickedClient.directoryKind==="prospect"?(pickedClient.prospectId||pickedClient.id||""):""} />
        <input type="hidden" name="client" value={pickedClient.name||""} />
        <div className="modal-form-body">
          <label>Ville du projet<input name="city" required placeholder="Remplie via l’adresse" value={geo?.city||pickedClient?.city||""} onChange={event=>setGeo(current=>({...(current||{}),city:event.target.value}))}/></label>
          <PvAddressLookup
            key={pickedClient?.id||"no-client"}
            defaultLabel={[pickedClient?.address,pickedClient?.postalCode,pickedClient?.city].filter(Boolean).join(" ")}
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
        </div>
        <div className="modal-form-actions"><button className="primary submit" type="submit"><CheckCircle2 size={17}/>Créer l’étude et les démarches</button></div>
      </form></div></div>}
  </ModuleTop>;
}

function InstallationTeamsView({teams,setTeams,users,setUsers,query,toast}) {
  const [showForm,setShowForm]=useState(false);
  const [showContractor,setShowContractor]=useState(false);
  const [showTechnicianForm,setShowTechnicianForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [editingContractor,setEditingContractor]=useState(null);
  const [contractorDocs,setContractorDocs]=useState({});
  const [members,setMembers]=useState([]);
  const technicians=users.filter(user=>user.role==="Technicien"||user.role==="Responsable technique");
  const needle=query.toLowerCase();
  const matches=team=>Object.values(team).flat().join(" ").toLowerCase().includes(needle);
  const contractors=teams.filter(team=>isSubcontractor(team)&&matches(team));
  const crews=teams.filter(team=>!isSubcontractor(team)&&matches(team));
  function open(team=null) {
    setEditing(team);
    setMembers(team?.members||[]);
    setShowForm(true);
  }
  function openContractor(team=null) {
    setEditingContractor(team);
    setContractorDocs(team?.documents||{});
    setShowContractor(true);
  }
  function save(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    if(!members.length) return toast("Sélectionnez au moins un membre");
    if(!members.includes(d.leader)) return toast("Le chef d’équipe doit faire partie des membres");
    const installationTeam={...d,id:editing?.id||Date.now(),members,kind:""};
    setTeams(editing?teams.map(team=>team.id===editing.id?installationTeam:team):[...teams,installationTeam]);
    setShowForm(false); setEditing(null); setMembers([]);
    toast(editing?"Équipe modifiée":"Équipe d’installation créée");
  }
  function saveContractor(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    const row={...editingContractor,...d,id:editingContractor?.id||Date.now(),kind:"sous-traitant",members:editingContractor?.members||[],leader:editingContractor?.leader||"",documents:contractorDocs};
    setTeams(editingContractor?teams.map(team=>team.id===editingContractor.id?row:team):[...teams,row]);
    setShowContractor(false);
    setEditingContractor(null);
    toast(editingContractor?"Sous-traitant modifié":"Sous-traitant créé");
  }
  function remove(team) {
    if(!window.confirm(`Supprimer « ${team.name} » ? Les chantiers déjà programmés seront conservés.`)) return;
    setTeams(teams.filter(item=>item.id!==team.id));
    toast(isSubcontractor(team)?"Sous-traitant supprimé":"Équipe supprimée");
  }
  async function createTechnician(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    const firstName=String(d.firstName||"").trim();
    const lastName=String(d.lastName||"").trim();
    const name=[firstName,lastName].filter(Boolean).join(" ");
    if(!firstName||!lastName) return toast("Renseignez le nom et le prénom.");
    if(users.some(user=>user.email?.toLowerCase()===d.email.toLowerCase())) return toast("Cette adresse email appartient déjà à un utilisateur");
    const technician={id:Date.now(),name,firstName,lastName,email:d.email,identifier:d.email,phone:d.phone,role:"Technicien",manager:d.manager,modules:roleDefaults.Technicien,status:"Actif",authStatus:"Actif"};
    try {
      const response=await authFetch("/api/users/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName,lastName,name,email:technician.email,role:technician.role,modules:roleDefaults.Technicien,manager:technician.manager})});
      const data=await response.json().catch(()=>({}));
      if(response.ok) {
        technician.authStatus="En attente d’envoi";
        const list=await authFetch("/api/users").then(item=>item.json()).catch(()=>({}));
        if(Array.isArray(list.users)) {
          setUsers(list.users);
          setShowTechnicianForm(false);
          toast(data.sent?`Mail d’activation envoyé à ${technician.email}.`:(data.mailError||"Technicien créé, mais le mail n’est pas parti. Utilisez Envoyer dans Utilisateurs."));
          return;
        }
      }
    } catch {}
    setUsers([...users,technician]);
    setShowTechnicianForm(false);
    toast("Technicien créé. Envoyez le mail depuis Utilisateurs.");
  }
  return <ModuleTop eyebrow="ORGANISATION TERRAIN" title="Équipes d’installation" sub={`${contractors.length} sous-traitant${contractors.length>1?"s":""} · ${crews.length} équipe${crews.length>1?"s":""}`}>
    <button className="primary" onClick={()=>openContractor()}><Plus size={17}/>Nouveau sous-traitant</button>
    <button className="secondary" onClick={()=>setShowTechnicianForm(true)}><UserRound size={17}/>Créer un technicien</button>
    <button className="secondary" onClick={()=>technicians.length?open():toast("Créez d’abord au moins un technicien")}><Plus size={17}/>Nouvelle équipe</button>
    <section className="install-planning">
      <h3>Sous-traitants</h3>
      <p>Créez ici les entreprises. Vous les attribuez ensuite à chaque installation, dans le planning.</p>
      {!contractors.length&&<div className="empty">Aucun sous-traitant. Ajoutez une entreprise pour pouvoir la poser sur un chantier.</div>}
      {contractors.length>0&&<div className="contractor-table">
        <div className="data-row data-head"><span>Entreprise</span><span>Personne à contacter</span><span>Téléphone</span><span>Ville</span><span>Spécialité</span><span>Documents</span><span>Statut</span><span></span></div>
        {contractors.map(team=><div className="data-row" key={team.id}>
          <span><b>{team.name}</b></span>
          <span>{team.contact||"—"}</span>
          <span>{team.phone||"—"}</span>
          <span>{team.city||"—"}</span>
          <span>{team.specialty||"—"}</span>
          <span className="contractor-pills" aria-label="Documents">{SUBCONTRACTOR_DOCUMENTS.map(item=><span key={item.id} title={item.label}><i className={contractorDocumentReady(team.documents?.[item.id])?"is-ready":""}/>{item.short}</span>)}</span>
          <span>{team.status||"Active"}</span>
          <span className="team-card-actions"><button type="button" onClick={()=>openContractor(team)}><Pencil size={15}/>Modifier</button><button type="button" className="delete" onClick={()=>remove(team)}><Trash2 size={15}/>Supprimer</button></span>
        </div>)}
      </div>}
    </section>
    {technicians.length===0&&<div className="team-prerequisite"><AlertTriangle size={18}/><div><b>Créez d’abord un technicien</b><span>Une équipe interne doit contenir au moins un utilisateur ayant le rôle Technicien. Les sous-traitants, eux, se créent sans compte.</span></div><button onClick={()=>setShowTechnicianForm(true)}>Créer maintenant</button></div>}
    <div className="team-cards">{crews.map(team=><article className="installation-team-card" key={team.id}><div className="team-card-head"><span><Users size={22}/></span><div><h3>{team.name}</h3><p>{team.specialty}</p></div><em>{team.status}</em></div><div className="team-leader"><b>CHEF D’ÉQUIPE</b><span><i>{team.leader?.[0]}</i>{team.leader}</span></div><div className="team-members"><b>MEMBRES ({team.members?.length||0})</b>{(team.members||[]).map(name=><span key={name}><i>{name[0]}</i>{name}</span>)}</div><div className="team-card-actions"><button onClick={()=>open(team)}><Pencil size={15}/>Modifier</button><button className="delete" onClick={()=>remove(team)}><Trash2 size={15}/>Supprimer</button></div></article>)}</div>
    {showContractor&&<div className="backdrop"><div className="modal installation-team-modal"><button className="modal-close" onClick={()=>setShowContractor(false)}><X size={18}/></button><div className="modal-icon"><Building2/></div><h2>{editingContractor?"Modifier le sous-traitant":"Nouveau sous-traitant"}</h2><p>L’entreprise pourra être choisie ensuite sur chaque installation.</p><form onSubmit={saveContractor}>
      <label>Entreprise<input name="name" required defaultValue={editingContractor?.name||""} placeholder="Ex. Pose Atlantique"/></label>
      <label>Personne à contacter<input name="contact" required defaultValue={editingContractor?.contact||""} placeholder="Nom et prénom"/></label>
      <div className="form-row"><label>Téléphone<input name="phone" defaultValue={editingContractor?.phone||""} placeholder="06 00 00 00 00"/></label><label>Ville<input name="city" defaultValue={editingContractor?.city||""} placeholder="Nantes"/></label></div>
      <div className="form-row"><label>Spécialité<select name="specialty" defaultValue={editingContractor?.specialty||"Installation polyvalente"}>{editingContractor?.specialty&&!SUBCONTRACTOR_SPECIALTIES.includes(editingContractor.specialty)&&<option>{editingContractor.specialty}</option>}{SUBCONTRACTOR_SPECIALTIES.map(item=><option key={item}>{item}</option>)}</select></label><label>Statut<select name="status" defaultValue={editingContractor?.status||"Active"}><option>Active</option><option>Inactive</option></select></label></div>
      <SubcontractorDocuments documents={contractorDocs} onChange={setContractorDocs} onError={toast}/>
      <button className="primary submit" type="submit"><CheckCircle2 size={17}/>{editingContractor?"Enregistrer":"Créer le sous-traitant"}</button>
    </form></div></div>}
    {showForm&&<div className="backdrop"><div className="modal installation-team-modal"><button className="modal-close" onClick={()=>setShowForm(false)}><X size={18}/></button><div className="modal-icon"><Users/></div><h2>{editing?"Modifier l’équipe":"Créer une équipe"}</h2><p>Équipe interne, à part des entreprises sous-traitantes.</p><form onSubmit={save}>
      <label>Nom de l’équipe<input name="name" required defaultValue={editing?.name||""} placeholder="Ex. Équipe PAC 1"/></label>
      <div className="form-row"><label>Spécialité<select name="specialty" defaultValue={editing?.specialty||"PAC et climatisation"}><option>PAC et climatisation</option><option>Photovoltaïque</option><option>Ballons thermodynamiques</option><option>Installation polyvalente</option><option>Autre</option></select></label><label>Statut<select name="status" defaultValue={editing?.status||"Active"}><option>Active</option><option>Inactive</option></select></label></div>
      <div className="installer-picker"><b>Membres de l’équipe</b><span>Sélectionnez les techniciens concernés</span>{technicians.map(user=><label key={user.id} className={members.includes(user.name)?"selected":""}><input type="checkbox" checked={members.includes(user.name)} onChange={()=>setMembers(members.includes(user.name)?members.filter(name=>name!==user.name):[...members,user.name])}/><i>{user.name[0]}</i><span><b>{user.name}</b><small>{user.role}</small></span><CheckCircle2 size={16}/></label>)}</div>
      <label>Chef d’équipe<select name="leader" required defaultValue={editing?.leader||""}><option value="">Choisir le chef d’équipe</option>{members.map(name=><option key={name}>{name}</option>)}</select></label>
      <button className="primary submit" type="submit"><CheckCircle2 size={17}/>{editing?"Enregistrer les modifications":"Créer l’équipe"}</button>
    </form></div></div>}
    {showTechnicianForm&&<div className="backdrop"><div className="modal installation-team-modal"><button className="modal-close" onClick={()=>setShowTechnicianForm(false)}><X size={18}/></button><div className="modal-icon"><UserRound/></div><h2>Créer un technicien</h2><p>Le technicien sera ajouté aux utilisateurs et pourra ensuite être affecté à une équipe d’installation.</p>    <form onSubmit={createTechnician}>
      <div className="form-row"><label>Nom<input name="lastName" required placeholder="Dupont"/></label><label>Prénom<input name="firstName" required placeholder="Jean"/></label></div>
      <div className="form-row"><label>Adresse email / identifiant<input name="email" type="email" required placeholder="technicien@mkl-energies.fr"/></label><label>Téléphone<input name="phone" type="tel"/></label></div>
      <label>Responsable hiérarchique<select name="manager" required>{users.filter(user=>user.role==="Responsable technique"||user.role==="Admin VIP").map(user=><option key={user.id}>{user.name}</option>)}</select></label>
      <button className="primary submit" type="submit"><Plus size={17}/>Créer le technicien</button>
    </form></div></div>}
  </ModuleTop>;
}

function InstallCheckSwitch({ id, label, value = "non" }) {
  const [state, setState] = useState(value === "oui" || value === "pb" ? value : "non");
  function cycle() {
    setState(current => (current === "non" ? "pb" : current === "pb" ? "oui" : "non"));
  }
  return <label className="install-switch-row"><span>{label}</span><input type="hidden" name={`check_${id}`} value={state} /><span className="install-switch-side"><em className={`is-${state}`}>{installationCheckLabel(state)}</em><button type="button" className={`install-switch is-${state}`} aria-label={`${label} : ${installationCheckLabel(state)}`} onClick={cycle}><i /></button></span></label>;
}

function installationLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = part => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function InstallationPlanningView({installations,setInstallations,installationTeams,clients,team,query,toast,mode,role,commercials=[],canAssignCommercial=false,onClientCreated}) {
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const canEdit=canEditInstallation(role);
  const canWriteFinance=canWriteInstallationFinance(role);
  const canReadFinance=canReadInstallationFinance(role);
  const salespeople=installationSalespeople(team);
  const [financeDraft,setFinanceDraft]=useState(emptyInstallationFinance);
  const [financeLoaded,setFinanceLoaded]=useState(true);
  const [financeById,setFinanceById]=useState({});
  const [financeTarget,setFinanceTarget]=useState(null);
  const [viewing,setViewing]=useState(null);
  const [viewFinance,setViewFinance]=useState(null);
  const [selectedInstallers,setSelectedInstallers]=useState([]);
  const [assigneeIds,setAssigneeIds]=useState([]);
  const [weekAnchor,setWeekAnchor]=useState(()=>new Date().toISOString().slice(0,10));
  const [pickedClient,setPickedClient]=useState(null);
  const [installPane,setInstallPane]=useState("actifs");
  const installers=team.filter(user=>user.role==="Technicien"||user.role==="Responsable technique");
  const contractors=installationTeams.filter(item=>isSubcontractor(item)&&item.status!=="Inactive");
  const crews=installationTeams.filter(item=>!isSubcontractor(item)&&item.status!=="Inactive");
  const assignable=[...crews,...contractors];
  const list=installations.filter(item=>Object.values(item).flat().join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>new Date(a.start)-new Date(b.start));
  const {week,boards,shiftWeek}=installationBoards(list,installationTeams,weekAnchor);
  const dayLabel=value=>new Date(value).toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"short"});
  const timeLabel=value=>new Date(value).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  const weekLabel=iso=>new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  const columnLabel=iso=>new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"});
  const today=new Date();
  const todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const financeInForm=canWriteFinance&&(!editing||canReadFinance);
  useEffect(()=>{
    if(mode==="agenda"||!canReadFinance) return undefined;
    let cancelled=false;
    authFetch("/api/installation-finances").then(async response=>{
      if(!response.ok||cancelled) return;
      const data=await response.json().catch(()=>({}));
      if(!cancelled&&Array.isArray(data.finances)) setFinanceById(Object.fromEntries(data.finances.map(row=>[String(row.installationId),row])));
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[mode,canReadFinance]);
  async function saveFinance(installationId,draft) {
    const parsed=validateInstallationFinance(draft);
    if(!parsed.ok) return parsed.error;
    const response=await authFetch(`/api/installations/${encodeURIComponent(installationId)}/finance`,{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        commercialId:draft.commercialId,
        saleTtc:draft.saleTtc,
        poseAmount:draft.poseAmount,
        purchases:(draft.purchases||[]).map(line=>({label:line.label,amount:line.amount})),
      }),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) return data.error||"Enregistrement des montants impossible";
    if(canReadFinance&&data.finance) setFinanceById(current=>({...current,[String(installationId)]:data.finance}));
    return "";
  }
  async function create(event) {
    event.preventDefault();
    const d=Object.fromEntries(new FormData(event.currentTarget));
    const chosen=assignable.filter(item=>assigneeIds.includes(String(item.id)));
    if(!chosen.length) return toast("Choisissez au moins une équipe ou un sous-traitant");
    if(financeInForm&&editing&&canReadFinance&&!financeLoaded) return toast("Les montants sont encore en cours de chargement.");
    const assignees=chosen.map(item=>({id:item.id,name:item.name,kind:isSubcontractor(item)?"sous-traitant":"equipe",specialty:item.specialty||""}));
    const installation=stripInstallationFinance({...(editing||{}),...d,id:editing?.id||Date.now(),installers:selectedInstallers,assignees,checks:installationChecksFromForm(d),contractorId:assignees[0].id,contractorName:assignees.map(item=>item.name).join(" · "),teamId:assignees[0].id,status:editing?.status||"Planifié",created:editing?.created||new Date().toISOString()});
    if(financeInForm) {
      const financeError=await saveFinance(installation.id,financeDraft);
      if(financeError) return toast(financeError);
    }
    setInstallations(editing?installations.map(item=>item.id===editing.id?installation:item):[...installations,installation]);
    setSelectedInstallers([]);
    setAssigneeIds([]);
    setPickedClient(null);
    setFinanceDraft(emptyInstallationFinance());
    setEditing(null);
    setWeekAnchor(String(d.start||"").slice(0,10)||weekAnchor);
    setShowForm(false);
    toast(editing?"Chantier modifié":assignees.length>1?"Installation créée dans les tableaux des équipes choisies":"Installation créée dans le tableau de l’équipe");
  }
  async function openEdit(item) {
    const ids=(item.assignees||[]).map(assignee=>String(assignee.id)).filter(Boolean);
    setEditing(item);
    setAssigneeIds(ids.length?ids:[item.contractorId,item.teamId].filter(Boolean).map(String));
    setSelectedInstallers(item.installers||[]);
    setPickedClient(clients.find(client=>String(client.id)===String(item.clientId)||client.name===item.client)||null);
    setFinanceDraft(emptyInstallationFinance());
    setFinanceLoaded(!canReadFinance);
    setShowForm(true);
    if(!canReadFinance) return;
    const response=await authFetch(`/api/installations/${encodeURIComponent(item.id)}/finance`);
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data.finance) setFinanceDraft(financeToDraft(data.finance));
    else if(!response.ok&&response.status!==404) toast(data.error||"Montants indisponibles");
    setFinanceLoaded(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setAssigneeIds([]);
    setSelectedInstallers([]);
    setPickedClient(null);
    setFinanceDraft(emptyInstallationFinance());
    setFinanceLoaded(true);
  }
  async function saveConfidential(event) {
    event.preventDefault();
    if(!financeTarget) return;
    const financeError=await saveFinance(financeTarget.id,financeDraft);
    if(financeError) return toast(financeError);
    setFinanceTarget(null);
    setFinanceDraft(emptyInstallationFinance());
    toast("Montants enregistrés");
  }
  function remove(item) {
    if(!window.confirm(`Supprimer le chantier « ${item.project} » de tous les agendas ?`)) return;
    if(canWriteFinance||canReadFinance) {
      authFetch(`/api/installations/${encodeURIComponent(item.id)}/finance`,{method:"DELETE"}).catch(()=>{});
      setFinanceById(current=>{const next={...current};delete next[String(item.id)];return next;});
    }
    setInstallations(installations.filter(installation=>installation.id!==item.id));
    toast("Chantier supprimé des agendas");
  }
  function updateStatus(item,status) {
    setInstallations(installations.map(installation=>installation.id===item.id?stripInstallationFinance({...installation,status}):installation));
    toast(`Chantier marqué « ${status} »`);
  }
  async function openView(item) {
    setViewing(item);
    setViewFinance(null);
    if(!canReadFinance) return;
    const response=await authFetch(`/api/installations/${encodeURIComponent(item.id)}/finance`);
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data.finance) setViewFinance(data.finance);
  }
  function CheckDots({item}) {
    return <span className="contractor-pills install-checks" aria-label="Préparation du chantier">{INSTALLATION_CHECKS.map(check=>{const state=installationCheckValue(item,check.id);const mark=state==="oui"?"is-ready":state==="pb"?"is-pb":"";return <span key={check.id} title={`${check.label} : ${installationCheckLabel(state)}`} aria-label={`${check.label} : ${installationCheckLabel(state)}`}><i className={mark}/></span>;})}</span>;
  }
  const openList=list.filter(item=>!isFinishedInstallation(item));
  const doneList=list.filter(item=>isFinishedInstallation(item));
  const visibleList=installPane==="termines"?doneList:openList;
  return <ModuleTop eyebrow="INSTALLATIONS & ÉQUIPES" title={mode==="agenda"?"Planning des installations":"Chantiers d’installation"} sub={mode==="agenda"?`${boards.length} tableau${boards.length>1?"x":""} cette semaine`:`${openList.length} chantier${openList.length>1?"s":""} en cours`}>
    <button className="primary" onClick={()=>{if(!assignable.length)return toast("Créez d’abord une équipe ou un sous-traitant dans Équipes d’installation");setEditing(null);setAssigneeIds([]);setSelectedInstallers([]);setPickedClient(null);setFinanceDraft(emptyInstallationFinance());setFinanceLoaded(true);setShowForm(true);}}><Plus size={17}/>Programmer une installation</button>
    <div className="install-planning">
    <div className={`planning-summary${mode==="agenda"?" is-present":""}`}>
      <div><CalendarCheck/><span><b>{list.filter(item=>item.status==="Planifié").length}</b>à venir</span></div>
      <div><HardHat/><span><b>{list.filter(item=>item.status==="En cours").length}</b>en cours</span></div>
      <div><Building2/><span><b>{contractors.length}</b>sous-traitants</span></div>
    </div>
    {mode==="agenda"&&<div className="install-stage">
      <div className="install-week-bar">
        <button className="secondary" type="button" onClick={()=>setWeekAnchor(shiftWeek(-7))}>Semaine précédente</button>
        <div>
          <small>Semaine d’installation</small>
          <strong>{weekLabel(week.start)} — {weekLabel(week.days[6]||week.start)}</strong>
        </div>
        <button className="secondary" type="button" onClick={()=>setWeekAnchor(shiftWeek(7))}>Semaine suivante</button>
      </div>
      {!boards.length&&<div className="install-empty">Aucune installation cette semaine. Chaque équipe qui a un chantier apparaît dans son propre tableau, jour par jour.</div>}
      {boards.map(board=>{
        const jobCount=board.columns.reduce((sum,column)=>sum+column.items.length,0);
        return <section className="install-board" key={board.id}>
          <header className="install-board-head">
            <span><Building2 size={18}/></span>
            <div>
              <small>Équipe</small>
              <h3>{board.name}</h3>
            </div>
            <em>{jobCount} chantier{jobCount>1?"s":""}</em>
          </header>
          <div className="install-week">
            {board.columns.map(column=><section key={column.day} className={column.day===todayIso?"is-today":""}>
              <h3>{columnLabel(column.day)}</h3>
              {column.items.map(item=><button type="button" className={`install-job is-${String(item.status||"Planifié").toLowerCase().replace("é","e").replace(" ","-")}`} key={item.id} onClick={()=>openView(item)} aria-label={`Consulter ${item.project}`}>
                <strong>{item.project}</strong>
                <span>{timeLabel(item.start)} – {timeLabel(item.end)}</span>
                <span>{item.client}</span>
                <span>{item.address||"Adresse à compléter"}</span>
                <CheckDots item={item}/>
              </button>)}
              {!column.items.length&&<p>Libre</p>}
            </section>)}
          </div>
        </section>;
      })}
    </div>}
    {mode!=="agenda"&&<div className="install-archive-tabs" role="tablist" aria-label="Classement des chantiers">
      <button type="button" role="tab" aria-selected={installPane==="actifs"} className={installPane==="actifs"?"active":""} onClick={()=>setInstallPane("actifs")}>Chantiers <span>{openList.length}</span></button>
      <button type="button" role="tab" aria-selected={installPane==="termines"} className={installPane==="termines"?"active":""} onClick={()=>setInstallPane("termines")}>Chantiers terminés <span>{doneList.length}</span></button>
    </div>}
    {mode!=="agenda"&&<div className={`installation-list ${mode}`}>
      {visibleList.length===0&&<div className="empty">{installPane==="termines"?"Aucun chantier terminé.":"Aucun chantier en cours."}</div>}
      {visibleList.map(item=><article className="installation-card" key={item.id}>
        <div className="installation-date"><b>{dayLabel(item.start)}</b><span>{timeLabel(item.start)} — {timeLabel(item.end)}</span></div>
        <div className="installation-detail"><span className="installation-status">{item.status}</span><h3>{item.project}</h3><p><Building2 size={13}/>{item.client}</p><p><MapPin size={13}/>{item.address||"Adresse à compléter"}</p><p>{installationAssigneeLabel(item)||"Équipe à choisir"}</p><CheckDots item={item}/>{canReadFinance&&<InstallationFinanceSummary finance={financeById[String(item.id)]}/>}{item.notes&&<small>{item.notes}</small>}</div>
        <div className="installation-team"><b>{installationAssigneeLabel(item)||"ÉQUIPES"}</b>{(item.installers||[]).map(name=><span key={name}><i>{name[0]}</i>{name}</span>)}</div>
        <div className="installation-actions"><select value={item.status} onChange={event=>updateStatus(item,event.target.value)}><option>Planifié</option><option>En cours</option><option>Terminé</option><option>Reporté</option></select>{canWriteFinance&&!canReadFinance&&<button type="button" className="install-edit" onClick={()=>{setFinanceTarget(item);setFinanceDraft(emptyInstallationFinance());}}>Saisir les montants</button>}{canEdit&&<button type="button" className="install-edit" onClick={()=>openEdit(item)}><Pencil size={14}/>Modifier</button>}<button onClick={()=>remove(item)} title="Supprimer du chantier et des agendas"><Trash2 size={16}/></button></div>
      </article>)}
    </div>}
    </div>
    {viewing&&<div className="backdrop"><div className="modal installation-modal installation-view" role="dialog" aria-modal="true" aria-labelledby="install-view-title"><button className="modal-close" onClick={()=>setViewing(null)}><X size={18}/></button><div className="modal-icon"><CalendarCheck/></div><h2 id="install-view-title">{viewing.project}</h2><p>Consultation de la fiche. Les modifications se font dans Chantiers.</p>
      <dl className="install-view">
        <div><dt>Statut</dt><dd>{viewing.status||"Planifié"}</dd></div>
        <div><dt>Client</dt><dd>{viewing.client||"—"}</dd></div>
        <div><dt>Adresse</dt><dd>{viewing.address||"Adresse à compléter"}</dd></div>
        <div><dt>Horaires</dt><dd>{dayLabel(viewing.start)} · {timeLabel(viewing.start)} – {timeLabel(viewing.end)}</dd></div>
        <div><dt>Équipes</dt><dd>{installationAssigneeLabel(viewing)||"Équipe à choisir"}</dd></div>
        {(viewing.installers||[]).length>0&&<div><dt>Techniciens</dt><dd>{viewing.installers.join(", ")}</dd></div>}
        {viewing.notes&&<div><dt>Consignes</dt><dd>{viewing.notes}</dd></div>}
      </dl>
      <div className="install-checks-form install-view-checks"><b>Préparation du chantier</b>{INSTALLATION_CHECKS.map(check=>{const state=installationCheckValue(viewing,check.id);return <p key={check.id}><span>{check.label}</span><i className={state==="oui"?"is-ready":state==="pb"?"is-pb":""} aria-hidden="true"/><em className={`is-${state}`}>{installationCheckLabel(state)}</em></p>;})}</div>
      {canReadFinance&&<InstallationFinanceSummary finance={viewFinance}/>}
      <button className="secondary submit" type="button" onClick={()=>setViewing(null)}>Fermer</button>
    </div></div>}
    {showForm&&<div className="backdrop"><div className="modal installation-modal"><button className="modal-close" onClick={closeForm}><X size={18}/></button><div className="modal-icon"><CalendarCheck/></div><h2>{editing?"Modifier le chantier":"Programmer une installation"}</h2><p>{editing?"La fiche du chantier se met à jour dans le planning.":"Le chantier apparaît dans le tableau de chaque équipe ou sous-traitant choisi."}</p><form key={editing?.id||"new"} onSubmit={create}>
      <div className="install-checks-form"><b>Préparation du chantier</b>{INSTALLATION_CHECKS.map(check=><InstallCheckSwitch key={check.id} id={check.id} label={check.label} value={editing?installationCheckValue(editing,check.id):"non"}/>)}</div>
      <DirectorySearch items={clients} kind="client" idName="clientId" nameName="client" required defaultValue={editing?.clientId||pickedClient?.id||""} onChange={setPickedClient} commercials={commercials} canAssignCommercial={canAssignCommercial} onClientCreated={onClientCreated} />
      <label>Installation / chantier<input name="project" required placeholder="Ex. Installation pompe à chaleur 12 kW" defaultValue={editing?.project||""}/></label>
      <label>Adresse du chantier<input name="address" required placeholder="Adresse complète" key={`${editing?.id||"new"}-${pickedClient?.id||"client"}`} defaultValue={pickedClient&&String(pickedClient.id)!==String(editing?.clientId||"")?[pickedClient.address,pickedClient.postalCode,pickedClient.city].filter(Boolean).join(" "):(editing?.address||[pickedClient?.address,pickedClient?.postalCode,pickedClient?.city].filter(Boolean).join(" "))}/></label>
      <div className="form-row"><label>Début<input name="start" type="datetime-local" required defaultValue={installationLocalInput(editing?.start)}/></label><label>Fin<input name="end" type="datetime-local" required defaultValue={installationLocalInput(editing?.end)}/></label></div>
      <div className="installer-picker"><b>Équipes et sous-traitants</b><span>Plusieurs choix possibles : climatisation, pompe à chaleur, isolation…</span>{crews.map(item=><label key={item.id} className={assigneeIds.includes(String(item.id))?"selected":""}><input type="checkbox" checked={assigneeIds.includes(String(item.id))} onChange={()=>setAssigneeIds(current=>current.includes(String(item.id))?current.filter(id=>id!==String(item.id)):[...current,String(item.id)])}/><i>{item.name?.[0]||"É"}</i><span><b>{item.name}</b><small>Équipe interne</small></span><CheckCircle2 size={16}/></label>)}{contractors.map(item=><label key={item.id} className={assigneeIds.includes(String(item.id))?"selected":""}><input type="checkbox" checked={assigneeIds.includes(String(item.id))} onChange={()=>setAssigneeIds(current=>current.includes(String(item.id))?current.filter(id=>id!==String(item.id)):[...current,String(item.id)])}/><i>{item.name?.[0]||"S"}</i><span><b>{item.name}</b><small>{item.specialty||"Sous-traitant"}</small></span><CheckCircle2 size={16}/></label>)}</div>
      <div className="installer-picker"><b>Techniciens internes</b><span>Facultatif, en plus du sous-traitant</span>{installers.map(installer=><label key={installer.id} className={selectedInstallers.includes(installer.name)?"selected":""}><input type="checkbox" checked={selectedInstallers.includes(installer.name)} onChange={()=>setSelectedInstallers(selectedInstallers.includes(installer.name)?selectedInstallers.filter(name=>name!==installer.name):[...selectedInstallers,installer.name])}/><i>{installer.name[0]}</i><span><b>{installer.name}</b><small>{installer.role}</small></span><CheckCircle2 size={16}/></label>)}</div>
      <label>Consignes pour l’équipe<textarea name="notes" rows="3" placeholder="Matériel, accès, contact sur place…" defaultValue={editing?.notes||""}/></label>
      {financeInForm&&<InstallationFinanceFields salespeople={salespeople} value={financeDraft} onChange={setFinanceDraft} hint={canReadFinance&&editing?"Ces montants sont réservés à l’admin VIP et au superadmin.":"Ces montants sont confidentiels. Après l’enregistrement, ils ne restent visibles que pour l’admin VIP et le superadmin."}/>}
      <button className="primary submit" type="submit"><Plus size={17}/>{editing?"Enregistrer le chantier":"Créer le chantier et les agendas"}</button>
    </form></div></div>}
    {financeTarget&&<div className="backdrop"><div className="modal installation-modal"><button className="modal-close" onClick={()=>{setFinanceTarget(null);setFinanceDraft(emptyInstallationFinance());}}><X size={18}/></button><div className="modal-icon"><CalendarCheck/></div><h2>Montants du chantier</h2><p>Le formulaire n’affiche pas les montants déjà enregistrés. Enregistrer les remplace.</p><form onSubmit={saveConfidential}>
      <InstallationFinanceFields salespeople={salespeople} value={financeDraft} onChange={setFinanceDraft} hint="Saisie confidentielle. Les valeurs déjà enregistrées ne sont pas renvoyées."/>
      <button className="primary submit" type="submit">Enregistrer les montants</button>
    </form></div></div>}
  </ModuleTop>;
}

function BundlesView({bundles,query,onAdd,onEdit,onRename,onDuplicate,onDelete,onToggleActive,onEnsureOutdoor,toast}) {
  const [brand,setBrand]=useState("");
  const [localQuery,setLocalQuery]=useState("");
  const [generating,setGenerating]=useState(false);
  const generated=useRef(false);
  const search=`${query||""} ${localQuery||""}`.trim();
  const list=bundles.filter(bundle=>matchesBundleSearch(bundle,search));
  const groupedBrands=groupBundlesByBrand(list);
  const visible=brand&&groupedBrands.some(group=>group.brand===brand)?groupedBrands.filter(group=>group.brand===brand):groupedBrands;
  const visibleCount=visible.reduce((sum,group)=>sum+group.bundles.length,0);

  useEffect(()=>{
    if(generated.current||!onEnsureOutdoor) return;
    generated.current=true;
    setGenerating(true);
    onEnsureOutdoor().then(created=>{
      if(created?.length) toast?.(`${created.length} groupe${created.length>1?"s":""} créé${created.length>1?"s":""}`);
    }).catch(error=>{
      toast?.(String(error?.message||"Création des groupes impossible"));
    }).finally(()=>setGenerating(false));
  },[onEnsureOutdoor,toast]);

  function bundleCard(bundle) {
    const path=resolveBundlePath(bundle);
    const normalized=normalizeBundle(bundle);
    const grouped=itemsByRole(normalized.items);
    const top=normalized.items[0];
    const enabled=isItemActive(bundle);
    const forfait=bundleUsesForfait(bundle);
    return <section className={`bundle-card${enabled?"":" is-inactive"}`} key={bundle.id}>
      <QuoteBundleHeading title={bundle.name} onChange={title=>onRename?.(bundle,title)}/>
      <div>
        <Library size={19}/>
        <span><small>{[path.category,path.subcategory,path.brand].filter(Boolean).join(" · ")||bundle.family}</small></span>
        {!forfait && <strong>{euro(bundleDisplayedTotalHt(bundle))}</strong>}
      </div>
      {[["principal","Matériel"],["supply","Fournitures"],["labor","Main-d’œuvre"]].map(([role,label])=>grouped[role].map((item,i)=><p key={`${role}-${item.code}-${i}`}><span><b>{item.name}</b><small>{label} · × {item.qty||1}</small></span>{forfait ? (item===top ? <strong>{forfaitPriceLabel(bundleDisplayedTotalHt(bundle), bundle.forfaitTax)}</strong> : null) : <strong>{euro(bundleLineTotal(item))}</strong>}</p>))}
      <div className="bundle-card-actions">
        <ActiveToggle active={enabled} onChange={next=>onToggleActive?.(bundle,next)}/>
        <button type="button" onClick={()=>onEdit?.(bundle)}><Pencil size={14}/>Modifier</button>
        <button type="button" onClick={()=>onDuplicate?.(bundle)}><Copy size={14}/>Dupliquer</button>
        <button type="button" className="danger" onClick={()=>onDelete?.(bundle)}><Trash2 size={14}/>Supprimer</button>
      </div>
    </section>;
  }

  return <ModuleTop eyebrow="BIBLIOTHÈQUE COMMERCIALE" title="Groupes d’articles" sub={generating?"Création des groupes climatisation et pompes à chaleur…":`${visibleCount} groupe${visibleCount!==1?"s":""} — recherchez un pack, une référence ou une marque`}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Créer un groupe</button>
    <div className="article-toolbar bundle-toolbar">
      <div className="article-search catalogue-search">
        <Search size={17}/>
        <input type="search" value={localQuery} onChange={e=>setLocalQuery(e.target.value)} placeholder="Rechercher un groupe, une référence, une marque…" aria-label="Rechercher un groupe d’articles"/>
        <span>{visibleCount}</span>
      </div>
    </div>
    {groupedBrands.length>1&&<nav className="bundle-brand-nav" aria-label="Filtrer par marque">
      <button type="button" className={brand===""?"active":""} onClick={()=>setBrand("")}>Toutes les marques</button>
      {groupedBrands.map(group=><button type="button" className={brand===group.brand?"active":""} key={group.brand} onClick={()=>setBrand(group.brand)}>{group.brand}<b>{group.bundles.length}</b></button>)}
    </nav>}
    {!list.length?<div className="quote-empty"><Library size={20}/><span>{generating?"Préparation des groupes…":search?`Aucun groupe pour « ${search} ».`:"Aucun groupe. Créez un pack PAC, clim ou photovoltaïque à partir du catalogue."}</span></div>:
    visible.map(group=><section className="bundle-brand-section" key={group.brand}>
      <h3>{group.brand}<small>{group.bundles.length} groupe{group.bundles.length>1?"s":""}</small></h3>
      <div className="bundle-grid">{group.bundles.map(bundleCard)}</div>
    </section>)}
  </ModuleTop>;
}
function UsersView({users,teamReady=false,setUsers,query,currentUserId="",onAdd,onEdit,onInvite,toast}) {
  const [busyId,setBusyId]=useState("");
  const list=users.filter(u=>Object.values(u).join(" ").toLowerCase().includes(query.toLowerCase()));
  const remove=id=>{ if(users.length>1){setUsers(users.filter(u=>u.id!==id));toast("Utilisateur supprimé");}};
  async function setUserActive(user,nextActive) {
    const userKey=String(user.supabaseId||user.id);
    if(userKey===String(currentUserId)&&!nextActive) return toast("Vous ne pouvez pas désactiver votre propre compte.");
    if(isItemActive(user)===nextActive) return;
    const remoteId=user.supabaseId||(String(user.id).includes("-")?user.id:null);
    const next={...user,status:nextActive?"Actif":"Inactif",active:nextActive};
    if(!remoteId) {
      setUsers(current=>current.map(item=>item.id===user.id?next:item));
      toast(nextActive?"Utilisateur activé":"Utilisateur désactivé");
      return;
    }
    setBusyId(user.id);
    try {
      const response=await authFetch(`/api/users/${remoteId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:user.name,email:user.email,role:user.role,modules:user.modules||[],manager:user.manager||"",active:nextActive})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Mise à jour impossible");
      setUsers(current=>current.map(item=>item.id===user.id?{...next,...(data.user||{}),id:user.id,supabaseId:user.supabaseId||data.user?.id,identifier:data.user?.email||user.identifier||user.email,authStatus:user.authStatus}:item));
      toast(nextActive?"Utilisateur activé":"Utilisateur désactivé");
    } catch(error) {
      toast(String(error?.message||"Mise à jour impossible"));
    } finally {
      setBusyId("");
    }
  }
  return <ModuleTop eyebrow="ADMINISTRATION" title="Utilisateurs" sub={teamReady?`${users.length} comptes dans votre organisation`:"Chargement des comptes…"}>
    <button className="primary" onClick={onAdd}><Plus size={17}/>Créer un utilisateur</button>
    <div className="data-panel user-table"><div className="data-row data-head"><span>UTILISATEUR</span><span>IDENTIFIANT</span><span>RÔLE ET DROITS</span><span>RESPONSABLE</span><span>INVITATION</span><span>ACTIVATION</span><span></span></div>{list.map(u=>{const enabled=isItemActive(u);const isSelf=String(u.supabaseId||u.id)===String(currentUserId);return <div className={`data-row${enabled?"":" is-inactive"}`} key={u.id}><div className="entity"><i>{u.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</i><b>{u.name}</b></div><span><Mail size={13}/>{u.identifier||u.email}</span><span><b>{u.role}</b><small>{u.modules?.length||0} module(s) autorisé(s)</small></span><span><UserRound size={13}/>{u.manager||"Non affecté"}</span><span className={`status ${u.authStatus==="Actif"?"ok":"wait"}`}>{u.authStatus||"Actif"}</span><ActiveToggle active={enabled} busy={busyId===u.id} disabled={isSelf&&enabled} onChange={next=>setUserActive(u,next)}/><div className="user-actions"><button className="send-invite" onClick={()=>onInvite(u)} title="Envoyer le mail de connexion"><Send size={15}/>Envoyer</button><button className="edit-user" onClick={()=>onEdit(u)} title="Modifier"><Pencil size={15}/></button><button className="trash" onClick={()=>remove(u.id)} title="Supprimer"><Trash2 size={16}/></button></div></div>;})}</div>
  </ModuleTop>;
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

function PdfStudio({studio,clients,studies=[],onClose,onThermalSaved,onSizingSaved,onSimulationSaved,onVisitSaved}) {
  const titles={
    thermal:["SERVICE COMMERCIAL","Étude thermique"],
    sizing:["DOSSIER PRIME","Note de dimensionnement"],
    simulator:["SERVICE COMMERCIAL","Simulateur photovoltaïque"],
    previsit:["SERVICE TECHNIQUE","Rapport de prévisite"],
    report:["SERVICE APRÈS-VENTE","Rapport de maintenance"],
  };
  const [eyebrow,title]=titles[studio.kind]||["DOCUMENT","Document"];
  const [client,setClient]=useState(studio.client||null);
  const [linkedStudy,setLinkedStudy]=useState(null);
  const reportReady=studio.kind==="report"&&String(studio.preset?.client||"").trim();
  const formReady=Boolean(studio.id||client?.id||reportReady);
  if(!formReady) {
    return <DocumentWindow eyebrow={eyebrow} title={title} clients={clients} allowProspect={studio.kind==="thermal"||studio.kind==="simulator"||studio.kind==="previsit"} thermalStudies={studio.kind==="sizing"?studies:null} hint={studio.kind==="sizing"?"Le numéro client, le numéro prospect, le nom et le prénom, ou le numéro d’étude thermique.":undefined} pickerOnly onConfirm={(person,study)=>{setLinkedStudy(study||null);setClient(person);}} onClose={onClose}/>;
  }
  const preset={
    ...(studio.preset||{}),
    client:client?.name||studio.preset?.client||"",
    clientId:client?.id||studio.preset?.clientId||"",
    street:client?.address||studio.preset?.street||"",
    postalCode:client?.postalCode||studio.preset?.postalCode||"",
    city:client?.city||studio.preset?.city||"",
    addressChecked:Boolean(client?.id),
    address:[client?.address,client?.postalCode,client?.city].filter(Boolean).join(" ")||studio.preset?.address||"",
    phone:client?.phone||client?.mobile||studio.preset?.phone||"",
    email:client?.email||studio.preset?.email||"",
  };
  return <div className="document-form-screen">
    {studio.kind==="thermal"&&<ThermalStudyPage embedded presetClient={client} presetId={studio.id} onClose={onClose} onSaved={onThermalSaved}/>}
    {studio.kind==="sizing"&&<SizingNotePage embedded presetClient={client} presetId={studio.id} presetStudy={linkedStudy} onClose={onClose} onSaved={onSizingSaved}/>}
    {studio.kind==="simulator"&&<PvSimulatorPage embedded presetClient={client} presetId={studio.id} onClose={onClose} onSaved={onSimulationSaved}/>}
    {studio.kind==="previsit"&&<PrevisitForm embedded presetClient={client} presetId={studio.id} presetFields={studio.preset} onClose={onClose} onSaved={onVisitSaved}/>}
    {studio.kind==="report"&&<MaintenanceForm embedded onClose={onClose} preset={preset}/>}
  </div>;
}

function Modal({type,close,submit,clients,prospects=[],billing,contracts=[],visits=[],pvProjects=[],thermalStudies=[],pvSimulations=[],groups,articles,brands=[],catalogCategories=[],catalogSubcategories=[],bundles,team,commercials=[],canAssignCommercial=false,canAssignProspectCommercial=false,deferCommercial=false,fieldCapture=false,prospectReadOnly=false,clientReadOnly=false,mustAssignCommercial=false,canManageCatalog=false,canDeleteProspect=false,onDeleteProspect,editingBilling,editingProspect,editingAppointment=null,editingUser,editingClient,editingArticle,editingBrand,brandLogoDraft="",onBrandLogoDraft,defaultBillingKind,currentUserId="",currentUserName="",currentProfile=null,presetClient=null,onClientCreated,onEnsureBundles}) {
  const [linkedClient,setLinkedClient]=useState(presetClient||null);
  const needsExistingClient=type==="contract"||type==="visit";
  const clientReady=!needsExistingClient||Boolean(findExistingClient(clients,linkedClient?.id));
  if(type==="contract"){
    return <DocumentWindow eyebrow="MAINTENANCE" title="Nouveau contrat" clients={clients} initialClient={presetClient||linkedClient} onClose={close}>
      {client=><form className="document-window-sheet" onSubmit={event=>submit(event,"contract")}>
        <input type="hidden" name="clientId" value={client?.id||""}/>
        <input type="hidden" name="client" value={client?.name||""}/>
        <div className="document-window-card">
          <label>N° de contrat<input name="number" required placeholder="ENT-2026-…"/></label>
          <label>Prestation<select name="type"><option>Maintenance préventive</option><option>Solaire + PAC</option><option>Supervision et dépannage</option></select></label>
          <div className="form-row"><label>Périodicité<select name="frequency"><option>Annuelle</option><option>Semestrielle</option><option>Trimestrielle</option></select></label><label>Prochaine visite<input name="next" type="date" required/></label></div>
          <div className="form-row"><label>Montant annuel (€)<input name="amount" type="number" min="0" step="any" required/></label><label>Statut<select name="status"><option>Actif</option><option>À planifier</option><option>Suspendu</option></select></label></div>
        </div>
        <div className="document-window-actions"><button className="primary" type="submit"><Plus size={18}/>Créer le contrat</button></div>
      </form>}
    </DocumentWindow>;
  }
  const nextNumber = kind => `${kind==="Devis"?"DEV":kind==="Pro forma"?"PRO":"FAC"}-2026-${String(billing.filter(d=>d.kind===kind).length+43).padStart(3,"0")}`;
  const isPersistedBilling=Boolean(editingBilling?.id&&String(editingBilling.id).includes("-"));
  const cfg={prospect:[prospectReadOnly?"Fiche prospect":editingProspect?"Modifier le prospect":"Nouveau prospect",prospectReadOnly?"Consultation — au-delà de 30 minutes, seule la responsable prospection peut modifier ou supprimer.":editingProspect?"Mettez à jour la fiche, et passez du rendez-vous à la fiche contact, ou l’inverse.":fieldCapture?"Saisie terrain : contact, adresse, projet, puis le rendez-vous. Vous pourrez corriger la fiche pendant 30 minutes.":"Saisie terrain : contact, adresse, projet, puis prochaine action.",Users],client:[clientReadOnly?"Fiche client":editingClient?"Modifier le client":"Nouveau client",clientReadOnly?"Consultation — modification et suppression réservées à l’Admin VIP et au Superadmin.":editingClient?"Mettez à jour la fiche client centralisée.":"Créez une fiche client complète et sécurisée.",Building2],contract:["Nouveau contrat","Planifiez le suivi d’une installation.",Wrench],billing:[isPersistedBilling?"Modifier le document":defaultBillingKind==="Facture"?"Nouvelle facture":defaultBillingKind==="Pro forma"?"Nouvelle pro forma":"Nouveau devis",isPersistedBilling?"Ajustez le client, les lignes et les conditions.":"Choisissez le client, ajoutez les articles, puis les conditions.",ReceiptText],article:[editingArticle?"Modifier l’article":"Nouvel article",editingArticle?"Mettez à jour la fiche catalogue.":"Ajoutez un article unique pour les devis.",Package],brand:[editingBrand?"Modifier la marque":"Nouvelle marque",editingBrand?"Mettez à jour le nom ou le logo.":"Enregistrez une marque avec son logo pour le catalogue.",Tag],group:["Nouvelle sous-catégorie","Rattachez-la à l’une des trois catégories principales.",Layers3],bundle:["Nouveau groupe d’articles","Rattachez le pack au chemin catalogue, puis choisissez les articles.",Library],visit:["Nouvelle visite technique","Planifiez la visite sans modifier le devis.",Eye],supplier:["Nouveau fournisseur","Ajoutez ses coordonnées pour l’envoi des demandes de chiffrage.",Truck],user:[editingUser?"Modifier l’utilisateur":"Nouvel utilisateur",editingUser?"Mettez à jour sa fiche, son rôle et ses accès.":"Créez le compte. Le mail de connexion s’envoie ensuite depuis le listing.",ShieldCheck]}[type];
  const [title,sub,Icon]=cfg;
  return <div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget) close();}}><div className={`modal${type==="prospect"?" prospect-modal":""}`} onMouseDown={e=>e.stopPropagation()}><button type="button" className="modal-close" onClick={close}><X/></button><div className="modal-icon"><Icon/></div><h2>{title}</h2><p>{sub}</p><form onSubmit={e=>submit(e,type)}>
    <div className="modal-form-body">
    {type==="prospect"&&<ProspectFields prospect={editingProspect} commercials={commercials} team={team} canAssignCommercial={canAssignProspectCommercial} deferCommercial={deferCommercial} currentUserId={currentUserId} currentUserName={currentUserName} currentProfile={currentProfile} readOnly={prospectReadOnly} fieldCapture={fieldCapture} billing={billing} contracts={contracts} visits={visits} pvProjects={pvProjects} thermalStudies={thermalStudies} pvSimulations={pvSimulations} articles={articles} appointment={editingAppointment}/>}
    {type==="client"&&<ClientFields client={editingClient} commercials={commercials} team={team} canAssignCommercial={canAssignCommercial} currentUserId={currentUserId} currentUserName={currentUserName} readOnly={clientReadOnly}/>}
    {type==="contract"&&<><RecipientConnect clients={clients} prospects={prospects} allowCreate={false} onSelect={item=>setLinkedClient(item||null)} />{clientReady&&<><label>N° de contrat<input name="number" required placeholder="ENT-2026-…"/></label><label>Prestation<select name="type"><option>Maintenance préventive</option><option>Solaire + PAC</option><option>Supervision et dépannage</option></select></label><div className="form-row"><label>Périodicité<select name="frequency"><option>Annuelle</option><option>Semestrielle</option><option>Trimestrielle</option></select></label><label>Prochaine visite<input name="next" type="date" required/></label></div><div className="form-row"><label>Montant annuel (€)<input name="amount" type="number" min="0" step="any" required/></label><label>Statut<select name="status"><option>Actif</option><option>À planifier</option><option>Suspendu</option></select></label></div></>}</>}
    {type==="billing"&&<BillingFields clients={clients} prospects={prospects} documents={billing} articles={articles} brands={brands} catalogCategories={catalogCategories} catalogSubcategories={catalogSubcategories} bundles={bundles} nextNumber={nextNumber(defaultBillingKind)} document={editingBilling} defaultKind={defaultBillingKind} canManageCatalog={canManageCatalog} commercials={commercials} canAssignCommercial={canAssignCommercial} mustAssignCommercial={mustAssignCommercial} currentUserId={currentUserId} onClientCreated={onClientCreated} onEnsureBundles={onEnsureBundles}/>}
    {type==="article"&&<ArticleFields key={editingArticle?.id||"new-article"} article={editingArticle} brands={brands} categories={catalogCategories} subcategories={catalogSubcategories}/>}
    {type==="brand"&&<BrandFields key={editingBrand?.id||"new-brand"} brand={editingBrand} logoUrl={brandLogoDraft} onLogoUrlChange={onBrandLogoDraft}/>}
    {type==="group"&&<CategoryFields groups={groups}/>}
    {type==="supplier"&&<><label>Raison sociale<input name="name" required/></label><div className="form-row"><label>Nom du contact<input name="contact" required/></label><label>Adresse email<input name="email" type="email" required/></label></div><div className="form-row"><label>Téléphone<input name="phone"/></label><label>Spécialité<input name="specialty" placeholder="Photovoltaïque, chauffage…"/></label></div></>}
    {type==="visit"&&<><RecipientConnect clients={clients} prospects={prospects} allowCreate={false} onSelect={item=>setLinkedClient(item||null)} />{clientReady&&<><div className="form-row"><label>Date de visite<input name="date" type="date" required/></label><label>Technicien<select name="technician">{team.filter(u=>u.role==="Technicien"||u.role==="Responsable technique").map(u=><option key={u.id}>{u.name}</option>)}</select></label></div><label>Devis associé<select name="quoteNumber">{billing.filter(d=>d.kind==="Devis").map(d=><option key={d.id}>{d.number}</option>)}</select></label></>}</>}
    {type==="user"&&<UserFields team={team} user={editingUser} actorRole={currentProfile?.role}/>}
    </div>
    <div className="modal-form-actions">{(prospectReadOnly&&type==="prospect")||(clientReadOnly&&type==="client")?<button className="primary submit" type="button" onClick={close}>Fermer</button>:<><button className="primary submit" type="submit" disabled={!clientReady}>{isPersistedBilling||editingProspect||editingUser||editingClient||editingArticle||editingBrand?<Pencil size={18}/>:<Plus size={18}/>} {isPersistedBilling||editingProspect||editingUser||editingClient||editingArticle||editingBrand?"Enregistrer les modifications":type==="prospect"?"Enregistrer le prospect":"Créer"}</button>{type==="prospect"&&canDeleteProspect&&editingProspect&&<button type="button" className="trash prospect-delete" onClick={()=>onDeleteProspect?.(editingProspect)}><Trash2 size={16}/>Supprimer</button>}</>}</div></form></div></div>;
}
function ArticleFields({article,brands=[],categories=[],subcategories=[]}) {
  const activeCategories=categories.filter(item=>item.active!==false&&item.status!=="Inactif");
  const family=findPickerFamily(article?.category);
  const defaultCategoryId=article?.categoryId
    || activeCategories.find(item=>item.name===article?.category)?.id
    || activeCategories.find(item=>family&&item.name===family.name)?.id
    || categories.find(item=>item.name===article?.category)?.id
    || "";
  const [categoryId,setCategoryId]=useState(defaultCategoryId);
  const selectedCategory=activeCategories.find(item=>String(item.id)===String(categoryId))||categories.find(item=>String(item.id)===String(categoryId));
  const categoryForSubs=selectedCategory||(categoryId?{id:categoryId,name:article?.category||""}:null);
  const formSubs=articleFormSubcategories(categoryForSubs,subcategories,article);
  const defaultSubId=formSubs.find(item=>article?.subcategoryId&&String(item.id)===String(article.subcategoryId))?.id
    || formSubs.find(item=>item.name===article?.subcategory)?.id
    || "";
  const [subcategoryId,setSubcategoryId]=useState(defaultSubId);
  const selectedSub=formSubs.find(item=>String(item.id)===String(subcategoryId));
  const activeBrands=brands.filter(brand=>brand.active!==false&&brand.status!=="Inactif");
  const defaultBrandId=article?.brandId
    || activeBrands.find(brand=>brand.name===article?.brand)?.id
    || brands.find(brand=>brand.name===article?.brand)?.id
    || "";
  const [brandId,setBrandId]=useState(defaultBrandId);
  const [articleName,setArticleName]=useState(article?.name||"");
  const [tax,setTax]=useState(String(article?.tax??20));
  const [typedCategory,setTypedCategory]=useState(article?.category||"");
  const [typedSubcategory,setTypedSubcategory]=useState(article?.subcategory||"");
  const selectedBrandName=activeBrands.find(brand=>String(brand.id)===String(brandId))?.name
    || brands.find(brand=>String(brand.id)===String(brandId))?.name
    || article?.brand
    || "";
  const categoryName=selectedCategory?.name||typedCategory||article?.category||"";
  const subcategoryName=selectedSub?.name||typedSubcategory||article?.subcategory||"";
  const vat55=articleUsesVat55({name:articleName,code:article?.code,category:categoryName,subcategory:subcategoryName});
  useEffect(()=>{ if(vat55) setTax("5.5"); },[vat55]);
  const heatPump=isHeatPumpPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const climOutdoor=isClimOutdoorPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const climIndoor=isClimIndoorPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const microInverter=isMicroInverterPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const inverter=isInverterPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const pvPanel=isPvPanelPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const battery=isBatteryPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const optimizer=isOptimizerPath({category:categoryName,subcategory:subcategoryName,sourceReference:article?.sourceReference});
  const specTitle=heatPump||climOutdoor||climIndoor||microInverter||inverter||pvPanel||battery||optimizer;
  return <div className="article-fields">
    <div className="form-row"><label>Référence<input name="code" required placeholder="Ex. PV-450W" defaultValue={article?.code}/></label>
      <label>Marque<select name="brandId" required={!/^picker:(fourniture|installation)$/i.test(article?.sourceReference||"")} value={brandId} onChange={e=>setBrandId(e.target.value)}>
        <option value="">Choisir une marque…</option>
        {activeBrands.map(brand=><option key={brand.id} value={brand.id}>{brand.name}</option>)}
        {brandId&&!activeBrands.some(brand=>String(brand.id)===String(brandId))&&article?.brand&&<option value={brandId}>{article.brand} (inactive)</option>}
      </select>
      {!activeBrands.length&&<small>Créez d’abord une marque dans l’onglet Marques.</small>}
      </label>
    </div>
    <label>{specTitle?"Titre":"Désignation"}<input name="name" required placeholder={specTitle?"Nom du modèle affiché sur le devis":"Nom du produit ou service"} value={articleName} onChange={e=>setArticleName(e.target.value)}/></label>
    <ArticleCommercialDocField initialName={article?.ficheName||""} initialData={article?.ficheData||""}/>
    <div className="form-row">
      <label>Catégorie
        {activeCategories.length
          ? <select name="categoryId" required value={categoryId} onChange={e=>{setCategoryId(e.target.value);setSubcategoryId("");}}>
              <option value="">Choisir une catégorie…</option>
              {activeCategories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          : <input name="category" required placeholder="Ex. Climatisation" value={typedCategory} onChange={e=>setTypedCategory(e.target.value)}/>}
        {!activeCategories.length&&<small>Créez d’abord une catégorie dans l’onglet Catégories.</small>}
      </label>
      <label>Sous-catégorie
        {activeCategories.length
          ? <select name="subcategoryChoice" value={subcategoryId} onChange={e=>setSubcategoryId(e.target.value)}>
              <option value="">Aucune</option>
              {formSubs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          : <input name="subcategory" placeholder="Ex. Mono-split" value={typedSubcategory} onChange={e=>setTypedSubcategory(e.target.value)}/>}
      </label>
    </div>
    {activeCategories.length>0&&<>
      <input type="hidden" name="category" value={selectedCategory?.name||article?.category||""}/>
      <input type="hidden" name="subcategory" value={subcategoryName}/>
      <input type="hidden" name="subcategoryId" value={isPersistedTaxonomyId(subcategoryId)?subcategoryId:""}/>
    </>}
    {heatPump
      ? <HeatPumpSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} brandName={selectedBrandName} title={articleName} initialDescription={article?.description||""} persistFiche={false}/>
      : climOutdoor
        ? <ClimOutdoorSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} brandName={selectedBrandName} title={articleName} initialDescription={article?.description||""}/>
      : climIndoor
        ? <ClimIndoorSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} brandName={selectedBrandName} title={articleName} subcategory={subcategoryName} initialDescription={article?.description||""}/>
      : microInverter
        ? <MicroInverterSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} brandName={selectedBrandName} title={articleName} initialDescription={article?.description||""}/>
      : inverter
        ? <InverterSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} title={articleName} initialDescription={article?.description||""}/>
      : pvPanel
        ? <PvPanelSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} title={articleName} initialDescription={article?.description||""}/>
      : battery
        ? <BatterySpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} title={articleName} initialDescription={article?.description||""}/>
      : optimizer
        ? <OptimizerSpecFields key={`${categoryName}-${subcategoryName}-${article?.id||"new"}`} brandName={selectedBrandName} title={articleName} initialDescription={article?.description||""}/>
      : <label>Description commerciale<textarea name="description" rows="2" placeholder="Texte visible sur le devis" defaultValue={article?.description}/></label>}
    <label>Description technique<textarea name="technicalDescription" rows="2" placeholder="Caractéristiques techniques internes" defaultValue={article?.technicalDescription}/></label>
    <div className="form-row"><label>Unité<select name="unit" defaultValue={article?.unit||"Unité"}>{ARTICLE_UNITS.map(unit=><option key={unit}>{unit}</option>)}</select></label><label>TVA<select name={vat55?undefined:"tax"} value={vat55?"5.5":tax} onChange={e=>setTax(e.target.value)} disabled={vat55}><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 %</option></select>{vat55&&<input type="hidden" name="tax" value="5.5"/>}</label></div>
    <div className="form-row"><label>Prix d’achat HT (€)<input name="buy" type="number" min="0" step="0.01" required defaultValue={article?.buy??""}/></label><ArticleSellPriceField defaultSell={article?.sell??""} tax={tax}/></div>
    <div className="form-row"><label>Statut<select name="status" defaultValue={article?.status||"Actif"}><option>Actif</option><option>Inactif</option></select></label><label>Puissance (W)<input name="powerW" type="number" min="0" step="1" placeholder="Optionnel" defaultValue={article?.powerW??""}/></label></div>
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
function CategoryFields({groups}) {
  const categories=groups.filter(group=>!group.parent);
  return <div className="category-fields"><div className="fixed-categories"><LockKeyhole size={16}/><span>Les catégories principales sont fixes : Grand matériel, Petite fourniture et Installation.</span></div><label>Catégorie principale<select name="parent">{categories.map(category=><option key={`parent-category-${category.name}`}>{category.name}</option>)}</select></label><div className="form-row"><label>Code de la sous-catégorie<input name="code" required placeholder="Ex. CLIM"/></label><label>Marge par défaut (%)<input name="margin" type="number" min="0" step="0.1" required/></label></div><label>Nom de la sous-catégorie<input name="name" required placeholder="Ex. Climatisation"/></label><label>Description<input name="description" placeholder="Produits et services inclus"/></label></div>;
}
function UserFields({team,user,actorRole}) {
  const actorIsVip=isAdminVip(actorRole);
  const [role,setRole]=useState(()=>normalizeRoleLabel(user?.role||"Commercial"));
  const [allowed,setAllowed]=useState(()=>sanitizeGrantedModules(user?.modules||roleDefaults[user?.role]||roleDefaults.Commercial,{role:user?.role}));
  const exclusiveFunctions=ACTION_PERMISSIONS.filter(item=>item.exclusive);
  const [allowedActions,setAllowedActions]=useState(()=>extractGrantedActions(user?.actions||user?.modules));
  const roleOptions=Object.keys(permissions).filter(item=>actorIsVip||item!=="Admin VIP");
  const commercialManagers=team.filter(u=>u.role==="Responsable commercial"||u.role==="Admin VIP");
  const technicalManagers=team.filter(u=>u.role==="Responsable technique"||u.role==="Admin VIP");
  const needsCommercial=role==="Commercial";
  const needsTechnical=role==="Technicien";
  const needsFieldProspector=role==="Prospecteur terrain";
  const needsDispatchProfile=["Commercial","Responsable commercial","Admin VIP","Superadmin","Direction"].includes(role);
  const isAdminUser=["Admin VIP","Superadmin"].includes(role);
  const selectableModules=isAdminUser?accessModules:accessModules.filter(module=>module!=="Utilisateurs");
  const fieldManagers=team.filter(u=>FIELD_PROSPECTOR_MANAGERS.includes(u.role));
  const managers=needsFieldProspector?fieldManagers:needsCommercial?commercialManagers:needsTechnical?technicalManagers:team.filter(u=>u.role==="Admin VIP");
  const isVipUser=role==="Admin VIP";
  function applyRole(nextRole) {
    setRole(nextRole);
    const next=nextRole==="Admin VIP"?accessModules:(roleDefaults[nextRole]||[]);
    setAllowed(["Admin VIP","Superadmin"].includes(nextRole)?next:next.filter(module=>module!=="Utilisateurs"));
    setAllowedActions(nextRole==="Admin VIP"?exclusiveFunctions.map(item=>item.code):[]);
  }
  function toggleModule(module) {
    if(isVipUser|| (module==="Utilisateurs"&&!isAdminUser)) return;
    setAllowed(allowed.includes(module)?allowed.filter(item=>item!==module):[...allowed,module]);
  }
  const split=user?.firstName||user?.lastName?{firstName:user.firstName||"",lastName:user.lastName||""}:splitPersonName(user?.name);
  return <div className="user-fields">
    <div className="form-row"><label>Nom<input name="lastName" required defaultValue={split.lastName||""} placeholder="Dupont"/></label><label>Prénom<input name="firstName" required defaultValue={split.firstName||""} placeholder="Jean"/></label></div>
    <label>Adresse email (identifiant de connexion)<input type="email" name="email" required defaultValue={user?.email||""}/></label>
    {user&&<p className="user-email-hint">Si vous corrigez l’email, l’identifiant de connexion change. Envoyez ensuite le mail depuis le listing.</p>}
    <label>Catégorie d’utilisateur<select name="role" value={role} onChange={e=>applyRole(e.target.value)}>{roleOptions.map(r=><option key={r}>{r}</option>)}</select></label>
    <div className="module-access"><div className="module-access-head"><div><b>Accès aux modules</b><span>{isVipUser?"L’Admin VIP a tous les droits, sur toutes les applications.":"Le rôle préremplit les cases. Seules les cases cochées donnent réellement accès."}</span></div>{!isVipUser&&<button type="button" onClick={()=>setAllowed(allowed.length===selectableModules.length?[]:selectableModules)}>{allowed.length===selectableModules.length?"Tout retirer":"Tout sélectionner"}</button>}</div><div className="module-checks">{accessModules.map(module=>{const locked=isVipUser||(module==="Utilisateurs"&&!isAdminUser);return <label key={module} className={`${(isVipUser||allowed.includes(module))?"checked":""}${locked?" is-locked":""}`}><input type="checkbox" checked={isVipUser||allowed.includes(module)} disabled={locked} onChange={()=>toggleModule(module)}/><CheckCircle2 size={15}/><span>{module}</span></label>;})}</div></div>
    {actorIsVip&&<div className="module-access"><div className="module-access-head"><div><b>Fonctions spéciales</b><span>{isVipUser?"Incluses automatiquement pour l’Admin VIP.":"Cases exclusives, indépendantes du rôle et des modules. Sans case cochée, le bouton n’apparaît pas."}</span></div></div><div className="module-checks">{exclusiveFunctions.map(item=>{const checked=isVipUser||allowedActions.includes(item.code);return <label key={item.code} className={checked?"checked":""}><input type="checkbox" checked={checked} disabled={isVipUser} onChange={()=>setAllowedActions(current=>current.includes(item.code)?current.filter(code=>code!==item.code):[...current,item.code])}/><CheckCircle2 size={15}/><span>{item.label}</span></label>;})}</div></div>}
    <input type="hidden" name="modules" value={JSON.stringify(isVipUser?accessModules:allowed)}/>
    <input type="hidden" name="actions" value={JSON.stringify(isVipUser?exclusiveFunctions.map(item=>item.code):actorIsVip?allowedActions:extractGrantedActions(user?.actions||user?.modules))}/>
    <label>Responsable hiérarchique<select name="manager" required={needsCommercial||needsTechnical||needsFieldProspector} defaultValue={user?.manager||undefined}>{!needsCommercial&&!needsTechnical&&!needsFieldProspector&&<option value="Direction">Direction / non applicable</option>}{managers.filter(u=>u.id!==user?.id).map(u=><option value={u.name} key={u.id}>{u.name} — {u.role}</option>)}</select></label>
    {needsCommercial&&commercialManagers.length===0&&<div className="access-warning">Créez d’abord un Responsable commercial ou un Admin VIP.</div>}
    {needsFieldProspector&&fieldManagers.length===0&&<div className="access-warning">Créez d’abord un Responsable prospection ou un Admin VIP.</div>}
    {needsCommercial&&<div className="permission-note"><UserRound size={16}/>Le commercial sera obligatoirement rattaché à ce responsable.</div>}
    {needsFieldProspector&&<div className="permission-note"><UserRound size={16}/>Le prospecteur terrain est rattaché uniquement à un responsable prospection ou à un super admin.</div>}
    {needsDispatchProfile&&<div className="dispatch-profile-fields">
      <p className="prospect-hint">Zone utilisée pour recommander un commercial à la responsable de la prospection.</p>
      <label>Zone géographique<input name="zone" defaultValue={user?.zone||""} placeholder="Ex. Nantes, 44, Loire-Atlantique"/></label>
      <div className="form-row">
        <label>Code postal<input name="postalCode" defaultValue={user?.postalCode||""} placeholder="44000"/></label>
        <label>Ville<input name="city" defaultValue={user?.city||""} placeholder="Nantes"/></label>
      </div>
      <label className="dispatch-notify"><input type="checkbox" name="dispatchAvailable" defaultChecked={user?.dispatchAvailable!==false}/>Disponible pour de nouveaux rendez-vous</label>
    </div>}
  </div>;
}
function BillingFields({clients,prospects=[],documents=[],articles,brands=[],catalogCategories=[],catalogSubcategories=[],bundles,nextNumber,document,defaultKind,canManageCatalog=false,commercials=[],canAssignCommercial=false,mustAssignCommercial=false,currentUserId="",onClientCreated,onEnsureBundles}) {
  const kind=document?.kind||defaultKind||"Devis";
  const statusOptions=statusesForKind(kind);
  const persisted=Boolean(document?.id&&String(document.id).includes("-"));
  const canLoadQuote=(kind==="Facture"||kind==="Pro forma")&&!persisted;
  const quotes=documents.filter(item=>item.kind==="Devis"&&item.number);
  const [pickerMode,setPickerMode]=useState("");
  const [statusHistory,setStatusHistory]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [quoteQuery,setQuoteQuery]=useState(document?.sourceQuoteNumber||"");
  const [sourceQuoteId,setSourceQuoteId]=useState(document?.sourceQuoteId||"");
  const [sourceQuoteNumber,setSourceQuoteNumber]=useState(document?.sourceQuoteNumber||"");
  const [quoteMessage,setQuoteMessage]=useState("");
  const directoryItems=useMemo(()=>[
    ...(clients||[]).map(client=>({
      ...client,
      id:`client:${client.id}`,
      realId:client.id,
      directoryKind:"client",
      badge:"Client",
    })),
    ...visibleProspects(prospects).map(prospect=>{
      const split=splitPersonName(prospect.name);
      return {
        ...prospect,
        id:`prospect:${prospect.id}`,
        realId:prospect.id,
        directoryKind:"prospect",
        badge:"Prospect",
        firstName:split.firstName,
        lastName:split.lastName,
        contact:prospect.name,
      };
    }),
  ],[clients,prospects]);
  const resolveClientId=(list,doc)=>{
    if(!list?.length) return "";
    if(doc?.clientId!=null&&list.some(item=>item.directoryKind==="client"&&String(item.realId)===String(doc.clientId))) return `client:${doc.clientId}`;
    if(doc?.prospectId&&list.some(item=>item.directoryKind==="prospect"&&String(item.realId)===String(doc.prospectId))) return `prospect:${doc.prospectId}`;
    return "";
  };
  const [selectedClientId,setSelectedClientId]=useState(()=>resolveClientId(directoryItems,document));
  const existingItems=document?.items?.length?document.items:document?[{id:Date.now(),code:"",name:document.label,qty:1,unit:document.amount,tax:document.tax??20,discountType:"percent",discountValue:0}]:[];
  const [items,setItems]=useState(()=>withPreparedFreeLine(existingItems,Number(document?.tax??20)));
  const [tax,setTax]=useState(Number(document?.tax??20));
  const [globalDiscountType,setGlobalDiscountType]=useState(document?.globalDiscountType||"percent");
  const [globalDiscountValue,setGlobalDiscountValue]=useState(Number(document?.globalDiscountValue||0));
  const [electricityOperator,setElectricityOperator]=useState(document?.electricityOperator||"");
  const defaultIssueDate=document?.date||todayIsoDate();
  const [issueDate,setIssueDate]=useState(defaultIssueDate);
  const [dueDate,setDueDate]=useState(document?.due||(kind==="Devis"?defaultQuoteValidityDate(defaultIssueDate):""));
  const [freeNote,setFreeNote]=useState(document?.freeNote||"");
  const [status,setStatus]=useState(statusOptions.includes(document?.status)?document.status:(document?.status||(kind==="Facture"?"Brouillon":"Brouillon")));
  const [statusComment,setStatusComment]=useState("");
  const [deliveryDate,setDeliveryDate]=useState(
    document?.deliveryDate||(kind==="Devis"?defaultQuoteDeliveryDate(defaultIssueDate):"")
  );
  const defaultRep=document?.representativeLastName||document?.representativeFirstName
    ?{firstName:document.representativeFirstName||"",lastName:document.representativeLastName||""}
    :splitPersonName((commercials.find(user=>String(user.id)===String(mustAssignCommercial?"":currentUserId))||{}).name);
  const [representativeFirstName,setRepresentativeFirstName]=useState(defaultRep.firstName);
  const [representativeLastName,setRepresentativeLastName]=useState(defaultRep.lastName);
  const [representativeSignature,setRepresentativeSignature]=useState(document?.representativeSignature||"");
  const quoteItems=filledQuoteItems(items);
  const totals=billingTotals({items:quoteItems,tax,globalDiscountType,globalDiscountValue});
  const isPhotovoltaic=quoteItems.some(item=>`${item.name||""} ${item.category||""} ${item.subcategory||""} ${item.code||""}`.toLowerCase().includes("photovolta"));
  const selectedRecipient=directoryItems.find(item=>String(item.id)===String(selectedClientId))||{};
  const selectedClient=selectedRecipient.directoryKind==="prospect"?selectedRecipient:clients.find(client=>String(client.id)===String(selectedRecipient.realId||selectedClientId))||selectedRecipient;
  const ownerCommercials=useMemo(
    ()=>(commercials||[]).filter(user=>isDevisOwnerRole(user.role)),
    [commercials]
  );
  const [commercialId,setCommercialId]=useState(()=>{
    const owners=(commercials||[]).filter(user=>isDevisOwnerRole(user.role));
    const isOwner=id=>owners.some(user=>String(user.id)===String(id));
    const existing=document?.commercialId;
    if(mustAssignCommercial) {
      if(existing&&String(existing)!==String(currentUserId)&&isOwner(existing)) return String(existing);
      return "";
    }
    return existing||currentUserId||"";
  });
  useEffect(()=>{
    if(!mustAssignCommercial) return;
    const fromRecipient=selectedRecipient.commercialId||selectedRecipient.commercial_id||"";
    if(!fromRecipient) return;
    if(!ownerCommercials.some(user=>String(user.id)===String(fromRecipient))) return;
    setCommercialId(current=>current||fromRecipient);
  },[mustAssignCommercial,ownerCommercials,selectedRecipient.realId,selectedRecipient.commercialId,selectedRecipient.commercial_id]);
  useEffect(()=>{
    if(!directoryItems.length) {
      if(selectedClientId) setSelectedClientId("");
      return;
    }
    const stillValid=directoryItems.some(item=>String(item.id)===String(selectedClientId));
    if(stillValid) return;
    setSelectedClientId(resolveClientId(directoryItems,document));
  },[directoryItems,document?.id,document?.clientId,document?.prospectId,document?.client]);
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
  const quoteSuggestions=quoteQuery.trim().length>=2
    ?quotes.filter(item=>String(item.number||"").toUpperCase().includes(quoteQuery.trim().toUpperCase())).slice(0,6)
    :[];
  function applyQuote(quoteOrNumber) {
    const quote=quoteOrNumber&&typeof quoteOrNumber==="object"
      ?quoteOrNumber
      :findQuoteByNumber(quotes,quoteOrNumber||quoteQuery);
    if(!quote) {
      setQuoteMessage("Aucun devis trouvé pour ce numéro.");
      return;
    }
    if(["Annulé","Refusé"].includes(quote.status)&&!window.confirm(`Ce devis est « ${quote.status} ». Le reprendre quand même ?`)) return;
    if(documents.some(item=>item.kind===kind&&item.sourceQuoteId===quote.id)&&!window.confirm(`Une ${kind.toLowerCase()} existe déjà pour ce devis. Le reprendre quand même ?`)) return;
    const draft=cloneDocumentForCreate(quote,{kind,status:kind==="Facture"&&quote.status==="Accepté"?"À payer":"Brouillon"});
    const now=Date.now();
    setQuoteQuery(quote.number||"");
    setSourceQuoteId(draft.sourceQuoteId||quote.id||"");
    setSourceQuoteNumber(draft.sourceQuoteNumber||quote.number||"");
    setSelectedClientId(resolveClientId(clients,draft));
    setItems(withPreparedFreeLine((draft.items||[]).map((item,index)=>({...item,id:now+index})),Number(draft.tax??20)));
    setTax(Number(draft.tax??20));
    setGlobalDiscountType(draft.globalDiscountType||"percent");
    setGlobalDiscountValue(Number(draft.globalDiscountValue||0));
    setElectricityOperator(draft.electricityOperator||"");
    setIssueDate(draft.date||todayIsoDate());
    setDueDate(draft.due||"");
    setFreeNote(draft.freeNote||"");
    setStatus(draft.status||"Brouillon");
    setStatusComment(`${kind} issue du devis ${quote.number||""}`.trim());
    setRepresentativeFirstName(draft.representativeFirstName||"");
    setRepresentativeLastName(draft.representativeLastName||"");
    setRepresentativeSignature(draft.representativeSignature||"");
    setCommercialId(quote.commercialId||draft.commercialId||"");
    setQuoteMessage(`Devis ${quote.number} repris : client, lignes et conditions copiés.`);
  }
  function assignCommercial(id) {
    const previous=ownerCommercials.find(user=>String(user.id)===String(commercialId));
    const next=ownerCommercials.find(user=>String(user.id)===String(id));
    setCommercialId(id);
    if(!next) return;
    const nextName=splitPersonName(next.name);
    const prevName=previous
      ?splitPersonName(previous.name)
      :splitPersonName((commercials.find(user=>String(user.id)===String(currentUserId))||{}).name);
    setRepresentativeFirstName(current=>!current||current===prevName.firstName?nextName.firstName:current);
    setRepresentativeLastName(current=>!current||current===prevName.lastName?nextName.lastName:current);
  }
  function update(id,key,value) { setItems(withPreparedFreeLine(items.map(item=>item.id===id?{...item,[key]:value}:item),tax)); }
  return <div className="billing-fields">
    <input type="hidden" name="kind" value={kind}/>
    <input type="hidden" name="sourceQuoteId" value={sourceQuoteId||""}/>
    <input type="hidden" name="sourceQuoteNumber" value={sourceQuoteNumber||""}/>
    {canLoadQuote&&<section className="quote-section quote-from-devis">
      <header className="quote-section-head"><span>N°</span><div><b>Devis d’origine</b><em>Saisissez le numéro pour préremplir la {kind.toLowerCase()}</em></div></header>
      <div className="quote-from-devis-row">
        <label>N° de devis
          <input
            value={quoteQuery}
            onChange={e=>{setQuoteQuery(e.target.value);setQuoteMessage("");}}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();applyQuote();}}}
            placeholder="DEV-2026-000042"
            autoComplete="off"
          />
        </label>
        <button type="button" className="primary" onClick={()=>applyQuote()}><FileText size={16}/>Reprendre le devis</button>
      </div>
      {quoteSuggestions.length>0&&quoteQuery.trim().toUpperCase()!==String(sourceQuoteNumber||"").toUpperCase()&&<ul className="quote-from-devis-suggestions">
        {quoteSuggestions.map(item=><li key={item.id}><button type="button" onClick={()=>applyQuote(item)}><b>{item.number}</b><small>{item.client} · {item.status}</small></button></li>)}
      </ul>}
      {quoteMessage&&<p className={`quote-from-devis-message ${quoteMessage.startsWith("Aucun")?"error":""}`}>{quoteMessage}</p>}
    </section>}
    <section className="quote-section">
      <header className="quote-section-head"><span>1</span><div><b>Destinataire</b><em>Client ou prospect — un document fait passer le prospect en client</em></div></header>
      <DirectorySearch items={directoryItems} kind="recipient" idName="recipientId" required value={selectedClientId} onChange={item=>setSelectedClientId(item?.id?String(item.id):"")} showSelected={false} commercials={commercials} canAssignCommercial={canAssignCommercial} createdItem={client=>({...client,id:`client:${client.id}`,realId:client.id,directoryKind:"client",badge:"Client"})} onClientCreated={onClientCreated} />
      <input type="hidden" name="clientId" value={selectedRecipient.directoryKind==="client"?selectedRecipient.realId||"":""}/>
      <input type="hidden" name="prospectId" value={selectedRecipient.directoryKind==="prospect"?selectedRecipient.realId||"":""}/>
      <input type="hidden" name="client" value={selectedClient.company||selectedClient.name||""}/>
      {!directoryItems.length?<div className="quote-client-preview empty"><Building2 size={18}/><span><b>Aucun destinataire disponible</b><em>Créez un client depuis le bouton ci-dessus, ou une fiche prospect.</em></span></div>:!selectedClientId?<div className="quote-client-preview empty"><Building2 size={18}/><span><b>Aucun destinataire sélectionné</b><em>Recherchez une fiche par nom, prénom ou adresse, ou créez un client.</em></span></div>:null}
    </section>
    {mustAssignCommercial&&<section className="quote-section quote-assign-commercial">
      <header className="quote-section-head"><span><UserRound size={14}/></span><div><b>Attribuer au commercial</b><em>Choisissez un commercial, ou laissez l’affaire sans commercial pour l’attribuer plus tard</em></div></header>
      <label>Commercial responsable
        <select name="commercialId" value={commercialId} onChange={e=>assignCommercial(e.target.value)}>
          <option value="">Sans commercial — à attribuer</option>
          {ownerCommercials.map(user=><option key={user.id} value={user.id}>{user.name}{user.role==="Responsable commercial"?" — responsable":""}</option>)}
        </select>
      </label>
      {!commercialId&&<p className="quote-assign-empty">Cette affaire restera dans la file « à attribuer ». Aucun chiffre d’affaires commercial tant qu’un commercial n’est pas choisi.</p>}
      {!ownerCommercials.length&&<p className="quote-assign-empty">Aucun commercial actif. Créez un compte Commercial dans Utilisateurs.</p>}
    </section>}

    <section className="quote-section quote-section-articles">
      <header className="quote-section-head">
        <span>2</span>
        <div><b>Prestations</b><em>{quoteItems.length?`${quoteItems.length} ligne${quoteItems.length>1?"s":""}`:"Catalogue, groupe, ou la ligne libre déjà préparée"}</em></div>
      </header>
      <div className="quote-article-actions">
        <button type="button" className="primary add-quote-article wizard-open-btn" onClick={()=>setPickerMode("bundle")}><Library size={16}/>Ajouter un groupe d’articles</button>
        <button type="button" className="primary add-quote-article wizard-open-btn" onClick={()=>setPickerMode("article")}><Plus size={16}/>Ajouter un article</button>
      </div>
      {pickerMode&&<ArticlePickerWizard articles={articles} categories={catalogCategories} subcategories={catalogSubcategories} brandCatalog={brands} bundles={bundles} defaultTax={tax} includeInactive={canManageCatalog} initialTab={pickerMode==="bundle"?"groups":"articles"} onEnsureBundles={onEnsureBundles} onAdd={line=>setItems(current=>withPreparedFreeLine([...filledQuoteItems(current),line],tax))} onAddMany={lines=>setItems(current=>withPreparedFreeLine([...filledQuoteItems(current),...lines],tax))} onClose={()=>setPickerMode("")}/>}
      <div className="quote-lines">
        <div className="quote-line quote-head"><span>ARTICLE</span><span>QTÉ</span><span>PRIX HT</span><span>TVA</span><span>REMISE</span><span>VALEUR</span><span>TOTAL TTC</span><span></span></div>
        {quoteItems.length===0&&<div className="quote-empty"><Package size={20}/><span>Ajoutez un article ou un groupe, ou renseignez la ligne libre.</span></div>}
        {withPreparedFreeLine(items,tax).map((item,index,lines)=>{const priced=totals.lines.find(line=>String(line.id)===String(item.id));const prepared=isPreparedFreeLine(item);return [isQuoteBundleStart(lines,index)&&<QuoteBundleHeading key={`bundle-${item.id||index}`} title={quoteBundleHeading(item)} onChange={title=>setItems(setQuoteBundleHeading(items,index,title))}/>,<div className="quote-line" key={`${item.id||"line"}-${index}`}><span className="quote-line-article"><input aria-label="Désignation" required={!prepared} placeholder={prepared?"Ligne libre (facultatif)":"Désignation de l’article"} value={item.name||""} onChange={e=>update(item.id,"name",e.target.value)}/><input aria-label="Référence" placeholder="Référence (optionnel)" value={item.code||""} onChange={e=>update(item.id,"code",e.target.value)}/></span><input aria-label="Quantité" type="number" min="0.01" step="0.01" value={item.qty} onChange={e=>update(item.id,"qty",e.target.value)}/><QuoteLinePrices item={item} tax={tax} priced={priced} discountType onChange={(field,value)=>update(item.id,field,value)}/>{!prepared&&<button type="button" onClick={()=>setItems(withPreparedFreeLine(items.filter(line=>line.id!==item.id),tax))}><Trash2 size={15}/></button>}</div>,pvBundleNeedsOptions(lines,index)&&<PvBundleOptions key={`pv-options-${item.bundleId||item.bundleName||index}`} items={lines} index={index} articles={articles} onChange={next=>setItems(withPreparedFreeLine(next,tax))}/>];})}
      </div>
      <div className="quote-summary">
        <div className="global-discount"><label>Remise globale<select name="globalDiscountType" value={globalDiscountType} onChange={e=>setGlobalDiscountType(e.target.value)}><option value="percent">Pourcentage (%)</option><option value="amount">Montant TTC (€)</option></select></label><label>Valeur<input name="globalDiscountValue" type="number" min="0" step="0.01" value={globalDiscountValue} onChange={e=>setGlobalDiscountValue(e.target.value)}/></label></div>
        <div className="quote-totals"><p><span>Sous-total TTC</span><b>{euro(totals.beforeGlobalTTC)}</b></p>{totals.globalDiscountTTC>0&&<p className="discount"><span>Remise globale</span><b>− {euro(totals.globalDiscountTTC)}</b></p>}<p className="grand-total"><span>Total TTC</span><b>{euro(totals.totalTTC)}</b></p></div>
      </div>
    </section>
    <input type="hidden" name="items" value={JSON.stringify(quoteItems)}/><input type="hidden" name="amount" value={totals.totalHT}/><input type="hidden" name="label" value={quoteItems.map(i=>i.name).join(", ")||"Devis sans article"}/>

    <section className="quote-section">
      <header className="quote-section-head"><span>3</span><div><b>Conditions</b><em>{kind==="Devis"?"Représentant MKL Énergies, validité de l’offre et dates":"Dates, TVA et statut du document"}</em></div></header>
      <div className="form-row"><label>Type de document<input value={kind} readOnly/></label><label>Numéro{document?.number?<input name="number" readOnly defaultValue={document.number}/>:<><input name="number" readOnly defaultValue="" placeholder="Attribué automatiquement"/><small>Généré à l’enregistrement</small></>}</label></div>
      <div className="form-row"><label>Date d’émission<input name="date" type="date" required value={issueDate} onChange={e=>{const next=e.target.value;setIssueDate(next);if(kind==="Devis"){setDeliveryDate(defaultQuoteDeliveryDate(next));setDueDate(defaultQuoteValidityDate(next));}}}/></label>{kind!=="Devis"&&<label>Date d’échéance<input name="due" type="date" required value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>}</div>
      {kind==="Devis"&&<div className="quote-representative">
        <b>Représentant MKL Énergies</b>
        <div className="form-row"><label>Nom<input name="representativeLastName" autoComplete="family-name" value={representativeLastName} onChange={e=>setRepresentativeLastName(e.target.value)} placeholder="Nom"/></label><label>Prénom<input name="representativeFirstName" autoComplete="given-name" value={representativeFirstName} onChange={e=>setRepresentativeFirstName(e.target.value)} placeholder="Prénom"/></label></div>
        <SignaturePad name="representativeSignature" title="Signature du représentant" value={representativeSignature} onChange={setRepresentativeSignature} />
      </div>}
      {kind==="Devis"&&<div className="form-row"><label>Validité de l’offre<input name="due" type="date" required value={dueDate} onChange={e=>setDueDate(e.target.value)}/><small>Date d’échéance de l’offre, à côté de la livraison prévue.</small></label><label>Date prévisionnelle de livraison<input name="deliveryDate" type="date" required value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)}/><small>Remplie automatiquement 45 jours après l’édition. Vous pouvez la modifier.</small></label></div>}
      <div className="form-row"><label>TVA par défaut<select name="tax" value={tax} onChange={e=>setTax(Number(e.target.value))}><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 %</option></select></label><label>Statut<select name="status" value={status} onChange={e=>setStatus(e.target.value)}>{!statusOptions.includes(status)&&<option value={status}>{kind==="Devis"?quoteStatusLabel(status):status}</option>}{statusOptions.map(statusOption=><option key={statusOption} value={statusOption}>{kind==="Devis"?quoteStatusLabel(statusOption):statusOption}</option>)}</select></label></div>
      <label>Commentaire de statut<input name="statusComment" value={statusComment} onChange={e=>setStatusComment(e.target.value)} placeholder="Optionnel — ex. client relancé par téléphone"/></label>
    </section>

    {kind==="Devis"&&isPhotovoltaic&&<section className="quote-section quote-section-pv">
      <header className="quote-section-head"><span>4</span><div><b>Photovoltaïque</b><em>Étude solaire et gestionnaire de réseau</em></div></header>
      <div className="auto-pv-study"><CheckCircle2 size={18}/><div><b>Étude solaire MKL jointe automatiquement</b><span>Préremplie avec le client, le prix et la puissance, sans mention Climholia.</span></div></div>
      <div className="grid-operator-block">
        <div className="financing-block"><Zap size={18}/><div><b>Gestionnaire du réseau électrique</b><span>Le mandat sera rempli avec la fiche client.</span></div></div>
        <div className="operator-options">{ELECTRICITY_OPERATORS.map(operator=><label key={operator.id} className={electricityOperator===operator.id?"selected":""}><input type="radio" name="electricityOperator" value={operator.id} checked={electricityOperator===operator.id} onChange={()=>setElectricityOperator(operator.id)}/><CheckCircle2 size={17}/><span><b>{operator.name}</b><small>Mandat de raccordement</small></span></label>)}</div>
        <label>Puissance à raccorder (kWc)<input name="pvPowerKwp" type="number" min="0.1" step="0.1" required defaultValue={document?.pvPowerKwp||""}/></label>
      </div>
    </section>}

    {kind==="Devis"&&<section className="quote-section">
      <header className="quote-section-head"><span>{isPhotovoltaic?"5":"4"}</span><div><b>Financement</b><em>Pavé repris sur le devis imprimé</em></div></header>
      <div className="form-row"><label>Financeur<select name="financier" defaultValue={document?.financier||"Sans financement"}>{DEVIS_FINANCIERS.map(name=><option key={name}>{name}</option>)}</select></label><label>Montant de financement (€)<input name="financedAmount" type="number" min="0" step="0.01" readOnly value={Number(totals.totalTTC.toFixed(2))}/></label></div>
      <div className="form-row"><label>Nombre de mensualités<input name="financeMonths" type="number" min="1" defaultValue={document?.financeMonths||""}/></label><label>Montant de la mensualité (€)<input name="monthlyPayment" type="number" min="0" step="0.01" defaultValue={document?.monthlyPayment||""}/></label></div>
      <div className="form-row"><label>Première mensualité JRS<select name="firstMonthlyPayment" defaultValue={document?.firstMonthlyPayment==null||document?.firstMonthlyPayment===""?"":String(document.firstMonthlyPayment)}>{firstMonthlyDelayChoices(document?.firstMonthlyPayment).map(choice=><option key={choice||"none"} value={choice}>{choice||"—"}</option>)}</select></label><label>TAEG (%)<input name="financeTaeg" type="number" min="0" step="0.01" defaultValue={document?.financeTaeg||""}/></label></div>
      <div className="form-row"><label>TAEA (%)<input name="financeTaea" type="number" min="0" step="0.01" defaultValue={document?.financeTaea||""}/></label></div>
    </section>}

    <section className="quote-section">
      <header className="quote-section-head"><span>{kind==="Devis"?(isPhotovoltaic?"6":"5"):"4"}</span><div><b>Notes</b><em>Mention libre et suivi interne</em></div></header>
      <label>Mention en bas du document<textarea name="freeNote" rows="3" value={freeNote} onChange={e=>setFreeNote(e.target.value)} placeholder="Conditions particulières, délai d’intervention…"/></label>
      {document?.id&&String(document.id).includes("-")&&<div className="devis-history"><div className="devis-history-head"><ClipboardList size={16}/><b>Historique des statuts</b></div>{historyLoading?<span className="devis-history-empty">Chargement…</span>:statusHistory.length===0?<span className="devis-history-empty">Aucun changement enregistré pour l’instant.</span>:<ul>{statusHistory.map(entry=><li key={entry.id}><span className={`status ${statusTone(entry.to)}`}>{entry.from?`${entry.from} → ${entry.to}`:entry.to}</span><small>{entry.date?new Date(entry.date).toLocaleString("fr-FR"):""}{entry.comment?` — ${entry.comment}`:""}</small></li>)}</ul>}</div>}
    </section>
  </div>;
}
function Kpi({icon:Icon,title,value,note,sub,tone}) { return <div className="kpi"><div className={`kpi-icon ${tone}`}><Icon size={20}/></div><div className="kpi-title">{title}<MoreHorizontal size={17}/></div><strong>{value}</strong><div className="kpi-foot"><em className={tone}>{note}</em><span>{sub}</span></div></div>; }
function PanelHead({title,sub,link}) { return <div className="panel-head"><div><h2>{title}</h2><p>{sub}</p></div><button>{link}<ChevronRight size={16}/></button></div>; }
