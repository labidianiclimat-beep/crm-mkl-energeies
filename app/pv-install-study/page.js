"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BatteryCharging, Download, Leaf, Printer, Sun, Zap } from "lucide-react";
import { companyContactLine, companyDisplayName, companyEmitterLines } from "../lib/company";
import { captureSheetsPdf } from "../lib/html-to-pdf";
import RoofPanelPreview from "../components/roof-panel-preview";
import { googleImageryYear } from "../lib/google-solar";
import {
  compassLabel,
  completeStudyFromProject,
  computeInstallStudyResults,
  consumptionProfileLabel,
  planeProduction,
} from "../lib/pv-install-study";
import { formatPvMoney, formatPvNumber, PV_MONTHS } from "../lib/pv-study";
import { authFetch } from "../lib/supabase-rest";
import { useCompany } from "../lib/use-company";
import { loadSharedRecords } from "../lib/use-record-table";
import "./install-study.css";

const money = formatPvMoney;
const number = formatPvNumber;
const euro = value => money(value).replace(/\s/g, " ");
const pct = value => `${Math.round(value)}%`;
const signedEuro = value => `${value >= 0 ? "+" : "−"}${euro(Math.abs(value))}`;
const signedPts = value => `${value >= 0 ? "+" : ""}${Math.round(value)} pts`;

function Sheet({ number: pageNumber, title, children, className = "" }) {
  return <section className={`isheet ${className}`}>
    {title ? <h1 className="isheet-title">{title}</h1> : null}
    {children}
    <footer><span>{pageNumber} / 18</span></footer>
  </section>;
}

function RoofPhoto({ project, complete, planes, variant = "photo" }) {
  return <RoofPanelPreview project={project} complete={complete} planes={planes} variant={variant} />;
}

function PvFlowSchema({ batteryOn }) {
  return <div className="pv-flow-schema">
    <svg viewBox="0 0 1100 360" role="img" aria-label="Schéma de fonctionnement photovoltaïque">
      <rect x="0" y="0" width="1100" height="360" rx="18" fill="#f4f6fb"/>
      <circle cx="118" cy="72" r="36" fill="#ffcc00"/>
      <g fill="#ffdc66">
        <rect x="112" y="18" width="12" height="22" rx="3"/>
        <rect x="112" y="104" width="12" height="22" rx="3"/>
        <rect x="52" y="66" width="22" height="12" rx="3"/>
        <rect x="162" y="66" width="22" height="12" rx="3"/>
      </g>
      <polygon points="430,86 690,86 780,168 340,168" fill="#314d93"/>
      <polygon points="448,98 672,98 748,162 372,162" fill="#405fae"/>
      <g fill="#111">
        <rect x="462" y="108" width="46" height="26" rx="2"/>
        <rect x="514" y="108" width="46" height="26" rx="2"/>
        <rect x="566" y="108" width="46" height="26" rx="2"/>
        <rect x="618" y="108" width="46" height="26" rx="2"/>
        <rect x="478" y="138" width="46" height="20" rx="2"/>
        <rect x="530" y="138" width="46" height="20" rx="2"/>
        <rect x="582" y="138" width="46" height="20" rx="2"/>
      </g>
      <rect x="392" y="168" width="316" height="148" fill="#e8edf6" stroke="#314d93" strokeWidth="4"/>
      <rect x="508" y="236" width="52" height="80" fill="#314d93"/>
      <rect x="424" y="196" width="58" height="46" fill="#c5d0e8"/>
      <rect x="618" y="196" width="58" height="46" fill="#c5d0e8"/>
      <rect x="748" y="214" width="70" height="48" rx="6" fill="#152347"/>
      <text x="783" y="236" textAnchor="middle" fill="#ffcc00" fontFamily="Manrope, Arial" fontSize="11" fontWeight="800">ONDULEUR</text>
      <text x="783" y="252" textAnchor="middle" fill="#fff" fontFamily="DM Sans, Arial" fontSize="10">DC → AC</text>
      <g fill="none" stroke="#405fae" strokeWidth="4">
        <path d="M560 164 L560 196"/>
        <path d="M560 216 L748 238"/>
        <path d="M818 238 L910 238"/>
        <path d="M748 238 L748 300 L910 300"/>
      </g>
      <polygon points="556,196 564,196 560,208" fill="#405fae"/>
      <polygon points="748,234 748,242 762,238" fill="#405fae"/>
      <polygon points="910,234 910,242 924,238" fill="#405fae"/>
      <polygon points="910,296 910,304 924,300" fill="#405fae"/>
      <rect x="930" y="208" width="132" height="58" rx="10" fill="#fff" stroke="#405fae" strokeWidth="2"/>
      <text x="996" y="234" textAnchor="middle" fill="#152347" fontFamily="Manrope, Arial" fontSize="14" fontWeight="800">Maison</text>
      <text x="996" y="252" textAnchor="middle" fill="#5d6a80" fontFamily="DM Sans, Arial" fontSize="11">Conso. directe</text>
      <rect x="930" y="274" width="132" height="58" rx="10" fill="#fff" stroke="#ffcc00" strokeWidth="2"/>
      <text x="996" y="300" textAnchor="middle" fill="#152347" fontFamily="Manrope, Arial" fontSize="14" fontWeight="800">{batteryOn ? "Batterie virtuelle" : "Réseau"}</text>
      <text x="996" y="318" textAnchor="middle" fill="#5d6a80" fontFamily="DM Sans, Arial" fontSize="11">{batteryOn ? "Stockage 1 pour 1" : "Vente du surplus"}</text>
      <text x="560" y="78" textAnchor="middle" fill="#fff" fontFamily="Manrope, Arial" fontSize="13" fontWeight="800">Panneaux</text>
    </svg>
    <div className="pv-flow-legend">
      <article><b>1. Panneaux</b><span>Ils transforment l’ensoleillement de la toiture en courant continu.</span></article>
      <article><b>2. Onduleur</b><span>Il convertit ce courant pour alimenter la maison.</span></article>
      <article><b>3. Maison</b><span>Vous consommez d’abord votre propre production, en direct.</span></article>
      <article><b>4. {batteryOn ? "Batterie virtuelle" : "Surplus"}</b><span>{batteryOn ? "Le surplus est stocké sur le réseau, puis restitué à 1 pour 1." : "Le surplus est injecté et peut être revendu."}</span></article>
    </div>
  </div>;
}

function readLocal(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || "null"); }
  catch { return null; }
}

export default function PvInstallStudyPage() {
  const [project, setProject] = useState(null);
  const [client, setClient] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const { company } = useCompany();
  const companyName = companyDisplayName(company);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) {
        if (!cancelled) { setLoadError("Aucune étude sélectionnée."); setLoading(false); }
        return;
      }
      let projects = [];
      try { projects = await loadSharedRecords("mkl-pv-projects"); } catch { projects = []; }
      if (cancelled) return;
      const found = (projects || []).find(item => String(item.id) === String(id)) || null;
      if (!found) {
        setLoadError("Étude introuvable. Rouvrez-la depuis le dossier solaire.");
        setLoading(false);
        return;
      }
      let clients = [];
      try {
        const response = await authFetch("/api/clients");
        const data = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(data.clients)) clients = data.clients;
      } catch {
        const local = readLocal("mkl-clients");
        clients = Array.isArray(local) ? local : [];
      }
      setProject(found);
      setClient(clients.find(item =>
        (found.clientId && String(item.id) === String(found.clientId)) || item.name === found.client
      ) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const complete = useMemo(() => project ? completeStudyFromProject(project) : null, [project]);
  const results = useMemo(() => project && complete ? computeInstallStudyResults(project, complete) : null, [project, complete]);

  if (loading) return <main className="install-loading">Chargement de l’étude d’installation…</main>;
  if (loadError || !project || !results || !complete) {
    return <main className="install-loading study-error">
      <b>Étude indisponible</b>
      <p>{loadError || "Impossible d’afficher l’étude d’installation."}</p>
      <a href="/">Retour au CRM</a>
    </main>;
  }

  const address = project.address
    || [client?.address, client?.postalCode || client?.codePostal, client?.city].filter(Boolean).join(" ")
    || [project.postcode, project.city].filter(Boolean).join(" ");
  const maxMonth = Math.max(...results.monthly, 1);
  const maxHour = Math.max(...results.hours.map(item => Math.max(item.production, item.consumption)), 1);
  const maxSplit = Math.max(...results.monthlySplit.map(item => item.direct + item.battery), 1);
  const maxBreak = Math.max(results.consumption, results.direct, results.fromBattery, results.gridAfter, results.surplus, 1);
  const waterfall = [
    { label: "Facture actuelle", value: results.billBefore, kind: "base" },
    { label: "Autoconsommation", value: -results.billSelf, kind: "down" },
    { label: "Cagnottage", value: -results.billCagnot, kind: "down" },
    { label: "Coût de l’acheminement du réseau", value: results.billTransport, kind: "up" },
    { label: "Coût par kWc installé", value: results.billStorage, kind: "up" },
    { label: "Facture estimée après installation", value: results.billAfter, kind: "end" },
  ];
  const maxBill = Math.max(...waterfall.map(item => Math.abs(item.value)), 1);
  const batteryOn = Boolean(complete.virtualBattery?.enabled);
  const ht = Number(project.price || 0) / 1.2;
  const companyLines = [
    ...companyEmitterLines(company),
    company.phone,
    company.email,
  ].filter(Boolean);

  async function download() {
    try {
      await captureSheetsPdf(".isheet", {
        orientation: "landscape",
        filename: `Etude-installation-photovoltaique-${project.client || project.name || "dossier"}`,
      });
    } catch (error) {
      window.alert(String(error?.message || "PDF impossible"));
    }
  }

  return <main className="install-study">
    <div className="study-toolbar no-print">
      <a href="/" className="study-back"><ArrowLeft size={17}/>Retour CRM</a>
      <button type="button" className="secondary-tool" onClick={download}><Download size={17}/>Télécharger</button>
      <button type="button" onClick={() => window.print()}><Printer size={17}/>Imprimer</button>
    </div>

    <Sheet number="1" className="is-cover" companyName={companyName}>
      <div className="cover-left">
        <img className="cover-logo" src="/mkl-energies.png" alt={companyName} />
        <h1>Étude d’installation<br/>photovoltaïque</h1>
        <p>Étude réalisée à partir de données personnalisées de votre maison et de sa situation d’ensoleillement</p>
        <div className="cover-power">
          <b>{results.powerKwp.toFixed(0)} <small>kWc</small></b>
          <span>Puissance installée</span>
          {batteryOn && <em><BatteryCharging size={15}/>Avec batterie virtuelle</em>}
        </div>
        <div className="cover-prod">
          <b>{number(results.production)} <small>kWh</small></b>
          <span>Production annuelle moyenne</span>
        </div>
      </div>
      <RoofPhoto project={project} complete={complete} planes={results.planes} />
      <div className="cover-cards">
        <article>
          <small>Préparé pour</small>
          <b>{project.client || "Client"}</b>
          <span>{client?.phone || client?.mobile || ""}</span>
          <span>{address}</span>
        </article>
        <article>
          <small>Préparé par</small>
          <b>{companyName}</b>
          {companyLines.map(line => <span key={line}>{line}</span>)}
        </article>
      </div>
      <p className="cover-note">Estimations basées sur votre consommation réelle et un prix de l’électricité à {results.electricityPrice.toFixed(4)} €/kWh et une hypothèse d’augmentation du prix de cette électricité à 4% par an. Le résultat réel peut varier en fonction des conditions météorologiques, de nouveaux équipements et des habitudes de consommations. Cette estimation n’est pas une garantie mais un moyen de vous projeter sur la rentabilité de ce projet.</p>
    </Sheet>

    <Sheet number="2" title="Votre offre" companyName={companyName}>
      <div className="two-cards">
        <article className="offer-card">
          <h2>Installation photovoltaïque de {results.powerKwp.toFixed(0)} kWc</h2>
          <div className="offer-price-row">
            <span>Prix TTC</span>
            <b>{euro(project.price)}</b>
          </div>
          <small>{euro(ht)} HT (20% TVA)</small>
        </article>
        <article className="offer-card">
          <h3>Comment marche une batterie virtuelle ?</h3>
          <p>Une batterie virtuelle permet de stocker l’excédent d’énergie solaire produit sans avoir de batterie physique.</p>
          <p>L’énergie excédentaire est injectée dans le réseau électrique, et vous pourrez « récupérer » cette énergie plus tard pour l’utiliser quand les panneaux ne produisent pas suffisamment.</p>
        </article>
      </div>
    </Sheet>

    <Sheet number="3" title="Fonctionnement du PV" companyName={companyName}>
      <p className="lead">Schéma de l’installation : les panneaux produisent, l’onduleur convertit, la maison consomme en priorité, le surplus part {batteryOn ? "en batterie virtuelle" : "sur le réseau"}.</p>
      <PvFlowSchema batteryOn={batteryOn} />
    </Sheet>

    <Sheet number="4" title="Production d’électricité" companyName={companyName}>
      <div className="prod-layout">
        <div className="prod-chart">
          <div className="bar-chart">{results.monthly.map((value, index) => <div key={PV_MONTHS[index]}><span style={{ height: `${Math.max(6, value / maxMonth * 100)}%` }}/><small>{PV_MONTHS[index]}</small></div>)}</div>
          <em>Production (kWh)</em>
        </div>
        <aside>
          <div className="stat-card">
            <b>{results.electricityPrice.toFixed(4)} € / kWh</b>
            <span>Prix de l’électricité payé depuis le réseau</span>
          </div>
          <div className="stat-card is-soft">
            <b>{producedKwh(results.producedKwhCost)} <small>{results.electricityPrice ? `${Math.round(results.producedKwhCost / results.electricityPrice * 100)}%` : ""}</small></b>
            <span>Coût de revient du kWh produit*</span>
          </div>
        </aside>
      </div>
      <p className="foot-note">*Le coût de revient du kWh produit est calculé en prenant en compte le coût total de l’installation rapporté au nombre total de kWh produits sur la durée de vie de l’installation (soit 25 ans, qui correspond à la garantie de rendement des panneaux).</p>
    </Sheet>

    <Sheet number="5" title="Impact du photovoltaïque" companyName={companyName}>
      <div className="day-head"><b>Septembre</b><span>Autoconso. {pct(results.daySelfRate)}</span></div>
      <div className="day-chart">
        {results.hours.map(item => <div key={item.hour}>
          <i className="prod" style={{ height: `${item.production / maxHour * 100}%` }} />
          <i className="self" style={{ height: `${item.self / maxHour * 100}%` }} />
          <i className="load" style={{ height: `${item.consumption / maxHour * 100}%` }} />
          <small>{String(item.hour).padStart(2, "0")}:00</small>
        </div>)}
      </div>
      <div className="legend">
        <span><i className="c-grid"/>Électricité soutirée · Facturée {results.electricityPrice.toFixed(4)}€/kWh</span>
        <span><i className="c-prod"/>Production d’électricité · Surplus</span>
        <span><i className="c-self"/>Production autoconsommée · Gratuite</span>
        <span><i className="c-bat"/>Charge/Décharge de la batterie · Gratuite</span>
      </div>
      <div className="impact-row">
        <article>
          <small>Autoconsommation retenue</small>
          <p>Utilisation directe de l’électricité produite</p>
          <b>{pct(results.selfRate)}</b>
          <span>{number(results.selfConsumed)} kWh autoconsommé / {number(results.production)} kWh produit par l’installation</span>
        </article>
        <article>
          <small>Autonomie retenue</small>
          <p>Couverture des besoins élec. du foyer grâce au solaire</p>
          <b>{pct(results.autonomy)}</b>
          <span>{number(results.selfConsumed)} kWh autoconsommé / {number(results.consumption)} kWh consommé par votre foyer</span>
        </article>
      </div>
      <div className="tip-card"><b>Astuce conso</b><p>Pour maximiser les économies avec un système photovoltaïque, utilisez vos appareils électriques (lave-linge, lave-vaisselle, etc.) pendant la journée lorsque les panneaux produisent de l’énergie.</p></div>
    </Sheet>

    <Sheet number="6" title="Répartition de la consommation" companyName={companyName}>
      <div className="legend">
        <span><i className="c-self"/>Autonomie directe ({pct(results.selfConsumed ? results.direct / results.selfConsumed * 100 : 0)})</span>
        <span><i className="c-bat"/>Autonomie liée à la batterie virtuelle ({pct(results.selfConsumed ? results.fromBattery / results.selfConsumed * 100 : 0)})</span>
      </div>
      <div className="stack-chart">
        {results.monthlySplit.map((item, index) => <div key={PV_MONTHS[index]}>
          <span>
            <i className="bat" style={{ height: `${item.battery / maxSplit * 100}%` }} />
            <i className="dir" style={{ height: `${item.direct / maxSplit * 100}%` }} />
          </span>
          <small>{PV_MONTHS[index]}</small>
        </div>)}
      </div>
    </Sheet>

    <Sheet number="7" title="Décomposition consommation" companyName={companyName}>
      <div className="break-list">
        {[
          ["Consommation", results.consumption, "", "c-grid"],
          ["Production photovoltaïque consommée", results.direct, `${pct(results.consumption ? results.direct / results.consumption * 100 : 0)}`, "c-self"],
          ["Production photovoltaïque consommée par décharge de la batterie virtuelle", results.fromBattery, `${pct(results.consumption ? results.fromBattery / results.consumption * 100 : 0)}`, "c-bat"],
          ["Électricité soutirée du réseau", results.gridAfter, `${pct(results.importRate)}`, "c-grid"],
          ["Production photovoltaïque en surplus · Stockée ou revendue", results.surplus, "", "c-prod"],
        ].map(([label, value, extra, tone]) => <div key={label}>
          <span><b>{label}</b><em>{number(value)} kWh {extra}</em></span>
          <i className={tone} style={{ width: `${Math.max(2, value / maxBreak * 100)}%` }} />
        </div>)}
      </div>
    </Sheet>

    <Sheet number="8" title="Pourquoi ajouter une batterie virtuelle ?" companyName={companyName}>
      <div className="why-grid">
        <article><h2>1 kWh produit = 1 kWh restitué</h2><p>Votre énergie est stockée virtuellement sans aucune perte. Résultat : vous consommez votre propre production quand vous en avez besoin, même la nuit ou en hiver.</p></article>
        <article><h2>Une facture allégée dès le premier mois</h2><p>Plutôt que de revendre votre surplus à bas prix ou de le perdre, vous le réutilisez pour vous : votre propre énergie vient directement réduire votre facture dès le premier mois.</p></article>
        <article><h2>Solution écologique et économique</h2><p>En stockant et en utilisant au maximum votre propre énergie verte, vous contribuez à réduire votre empreinte carbone tout en diminuant vos dépenses énergétiques.</p></article>
      </div>
    </Sheet>

    <Sheet number="9" title="Impact de la batterie virtuelle" companyName={companyName}>
      <div className="compare-row">
        <article>
          <b>Autoconsommation</b>
          <p>Stocker une partie de la production d’électricité solaire pour une utilisation ultérieure permet de maximiser l’autoconsommation, et donc vos économies.</p>
        </article>
        <div className="compare-nums">
          <span>{pct(results.withoutSelfRate)}</span>
          <span className="is-now">{pct(results.selfRate)} <small>{signedPts(results.selfRatePts)}</small></span>
        </div>
      </div>
      <div className="compare-row">
        <article>
          <b>Importation d’électricité non stockée</b>
          <p>L’ajout d’une batterie réduit mécaniquement la part d’électricité importée qui n’a pas été stockée virtuellement.</p>
        </article>
        <div className="compare-nums">
          <span>{pct(results.withoutImportRate)}</span>
          <span className="is-now">{pct(results.importRate)} <small>{signedPts(results.importPts)}</small></span>
        </div>
      </div>
      <div className="finance-box">
        <div>
          <small>Économies totales sur la facture</small>
          <b>{euro(results.savings25)}</b>
          <ul>
            <li>{euro(results.withoutBattery25)} (Économies sans batterie)</li>
            <li>+ {euro(results.extraSelf25)} (Autoconsommation additionnelle)</li>
            <li>+ {euro(results.cagnottage25)} (Cagnottage)</li>
            <li>− {euro(results.oaMissed25)} (Vente OA non perçue)</li>
            <li>− {euro(results.virtualCost25)} (Coûts batterie virtuelle*)</li>
          </ul>
          <em>*Coût de souscription et coûts d’acheminement</em>
        </div>
        <div>
          <small>Coût initial du projet</small>
          <b>{euro(results.projectCost)}</b>
          <p>{euro(project.price)} (Coût sans raccordement)<br/>+ {euro(results.connection)} (coût raccordement)</p>
        </div>
        <div>
          <small>Gains nets du projet</small>
          <b>{euro(results.netGain)}</b>
          <p>{signedEuro(results.extraBattery25 - results.connection)} VS sans batterie virtuelle</p>
        </div>
      </div>
    </Sheet>

    <Sheet number="10" title="Économies N+1" companyName={companyName}>
      <p className="lead">Évolution de votre facture moyenne mensuelle estimée (TTC) après installation de votre centrale photovoltaïque.</p>
      <div className="waterfall">
        {waterfall.map(item => <div key={item.label} className={item.kind}>
          <b>{item.kind === "base" || item.kind === "end" ? euro(Math.abs(item.value)) : signedEuro(item.value)}</b>
          <span style={{ height: `${Math.max(8, Math.abs(item.value) / maxBill * 86)}px` }} />
          <small>{item.label}</small>
        </div>)}
      </div>
      <p className="end-tag">{pct(results.billChangePct)}</p>
      <div className="contract-row">
        <article>
          <small>Contrat actuel estimé</small>
          <b>Abonnement Base</b>
          <span>Non renseigné</span>
          <b>Tarif Base</b>
          <span>{results.electricityPrice.toFixed(4)} € TTC / kWh</span>
        </article>
        <article>
          <small>{complete.virtualBattery?.name || "Batterie virtuelle"}</small>
          <b>Abonnement Base</b>
          <span>{euro(complete.virtualBattery?.subscriptionMonth || 0)} / mois</span>
          <b>Tarif Base</b>
          <span>{results.electricityPrice.toFixed(4)} € TTC / kWh</span>
        </article>
        <article>
          <b>L’acheminement du réseau</b>
          <p>Pour récupérer l’énergie stockée sur votre batterie virtuelle, des frais d’acheminement sont facturés au gestionnaire de réseau : {Number(complete.virtualBattery?.transportPerkWh || 0).toFixed(4)} € TTC / kWh.</p>
          <b>Prix additionnel par kWc installé</b>
          <p>{Number(complete.virtualBattery?.monthlyPerkWc || 0).toFixed(1)} € TTC / kWc / mois.</p>
        </article>
      </div>
    </Sheet>

    <Sheet number="11" title="Impact environnemental" companyName={companyName}>
      <div className="eco-layout">
        <article className="eco-hero">
          <b>{"< 2 ans"}</b>
          <span>Temps retour énergétique d’un panneau solaire</span>
          <p>Il s’agit du temps qu’il faut à un panneau solaire pour produire la même quantité d’énergie qui a été utilisée pour le fabriquer. Pour un panneau moderne, ce temps est de moins de 2 ans.</p>
        </article>
        <div className="eco-eq">
          <div><b>{number(results.carKm)}</b><span>Kilomètres en voiture</span></div>
          <div><b>{number(results.machines)}</b><span>Nombre de machines</span></div>
          <div><b>{results.trees}</b><span>Arbres plantés</span></div>
        </div>
      </div>
      <div className="tip-card"><b>Recycler ses panneaux solaires</b><p>SOREN, un éco-organisme de transition énergétique, récupère et recycle gratuitement les panneaux solaires.</p></div>
    </Sheet>

    <Sheet number="12" title="Analyse d’ensoleillement" companyName={companyName}>
      <p className="lead">Nous analysons l’ensoleillement de votre toiture pour vous proposer l’installation la plus efficace compte tenu de votre orientation et des ombrages avoisinants.</p>
      <div className="three-steps">
        <article><b>Pré-dimensionnement des pans de toits</b></article>
        <article><b>Analyse de l’ensoleillement</b></article>
        <article><b>Analyse des ombrages proches et lointains</b></article>
      </div>
      <RoofPhoto project={project} complete={complete} planes={results.planes} variant="flux" />
      <p className="flux-caption">Carte de flux annuel Google Solar (kWh/kWc){googleImageryYear(complete.google) ? `, imagerie ${googleImageryYear(complete.google)}` : ""}. Les toitures orange sont les plus ensoleillées sur cette prise de vue — pas une photo à jour. La photo de toiture des autres pages vient de l’IGN.</p>
    </Sheet>

    <Sheet number="13" title="Analyse de l’ombrage" companyName={companyName}>
      <p className="lead">Nous avons analysé les ombrages proches et lointains à partir de l’ensoleillement mesuré sur chaque pan. Cela permet d’estimer au mieux votre productible.</p>
      <div className="shade-layout">
        <RoofPhoto project={project} complete={complete} planes={results.planes} variant="shade" />
        <div className="plane-cards is-stack">
          {results.planes.map(plane => <article key={plane.id}>
            <b>{plane.name || compassLabel(plane.compass)}</b>
            <span>Orientation ({Math.round(plane.compass)}°)</span>
            <strong>{plane.panels}</strong>
            <em>Panneaux (Ombrage : {plane.shadePercent || 0}%)</em>
          </article>)}
        </div>
      </div>
    </Sheet>

    <Sheet number="14" title="Installation proposée" companyName={companyName}>
      <div className="install-layout">
        <RoofPhoto project={project} complete={complete} planes={results.planes} />
        <div className="plane-cards is-stack">
          {results.planes.map(plane => <article key={plane.id}>
            <b>{plane.name || compassLabel(plane.compass)}</b>
            <span>Orientation ({Math.round(plane.compass)}°)</span>
            <strong>{plane.panels} panneaux (Angle : {Math.round(plane.tilt)}°)</strong>
            <em>{number(planeProduction(plane))} kWh/an</em>
          </article>)}
        </div>
      </div>
    </Sheet>

    <Sheet number="15" title="Équipements installés" companyName={companyName}>
      <p className="lead">Nous choisissons les meilleurs équipements du marché, pour leurs performances et leurs garanties.</p>
      <div className="equip-list">
        <article><Sun /><div><b>{complete.panelModel}</b><span>Module (×{results.panels})</span><em>Garantie de rendement 25 ans</em></div></article>
        <article><Zap /><div><b>{complete.inverterModel}</b><span>Onduleur (×1)</span><em>Garantie 10 ans</em></div></article>
        {batteryOn && <article><BatteryCharging /><div><b>{complete.virtualBattery?.name || "Batterie virtuelle"}</b><span>Batterie virtuelle (×1)</span><em>{Number(complete.virtualBattery?.monthlyPerkWc || 0).toFixed(1)} € TTC / kWc / mois</em></div></article>}
      </div>
    </Sheet>

    <Sheet number="16" title="Prochaines étapes" companyName={companyName}>
      <p className="lead">L’ordre de ces étapes est fourni à titre indicatif afin de vous aider à comprendre l’avancement d’un projet avec {companyName}.</p>
      <div className="next-steps">
        <article><b>1</b><div><strong>Relevés terrain</strong><p>Après avoir analysé votre consommation et recommandé une puissance, nous nous assurons de vous proposer l’installation la plus efficace compte tenu de votre orientation et des ombrages avoisinants.</p></div></article>
        <article><b>2</b><div><strong>Démarches administratives</strong><p>Nous réalisons pour votre compte les démarches administratives : (1) l’accord de la mairie (2) le raccordement au réseau et (3) l’attestation du Consuel.</p></div></article>
        <article><b>3</b><div><strong>Installation</strong><p>Nous vous assurons la pose d’une installation fonctionnelle et sécurisée avec du matériel de qualité.</p></div></article>
        <article><b>4</b><div><strong>Mise en service</strong><p>Vous êtes désormais producteur d’une électricité durable et rentable !</p></div></article>
      </div>
    </Sheet>

    <Sheet number="17" title="Paramètres de l’étude" companyName={companyName}>
      <div className="params-layout">
        <div>
          <article>
            <h2>Consommation</h2>
            <p><span>Consommation réelle</span><b>{number(results.consumption)} kWh</b></p>
            <p><span>Profil de consommation journalier</span><b>{consumptionProfileLabel(complete.consumptionProfile)}</b></p>
            <p><span>Prix</span><b>{results.electricityPrice.toFixed(4)} € TTC / kWh</b></p>
            <p><span>Abonnement mensuel</span><b>{euro(complete.virtualBattery?.subscriptionMonth || 0)} TTC / mois</b></p>
            <p><span>Stockage virtuel</span><b>{Number(complete.virtualBattery?.monthlyPerkWc || 0).toFixed(1)} € TTC / kWc / mois</b></p>
            <p><span>Raccordement</span><b>{euro(complete.virtualBattery?.connectionCost || 0)}</b></p>
            <p><span>Acheminement</span><b>{Number(complete.virtualBattery?.transportPerkWh || 0).toFixed(4)} € TTC / kWh</b></p>
          </article>
          <article>
            <h2>Production solaire</h2>
            <p><span>Puissance installée</span><b>{results.powerKwp.toFixed(0)} kWc</b></p>
            <p><span>Nombre de panneaux installés</span><b>{results.panels}</b></p>
            <em>Estimation basée sur {complete.fluxPng ? "la carte de flux Google Solar et " : complete.solarProvider === "google" ? "Google Solar et " : ""}{results.hourlySource === "pvgis-hourly" ? "PVGIS horaire" : "PVGIS"}</em>
          </article>
        </div>
        <aside>
          <article>
            <small>Autoconsommation</small>
            <p>Utilisation directe de l’électricité produite</p>
            <b>{pct(results.selfRate)}</b>
          </article>
          <article>
            <small>Autonomie</small>
            <p>Couverture des besoins électriques du foyer grâce au solaire</p>
            <b>{pct(results.autonomy)}</b>
          </article>
        </aside>
      </div>
    </Sheet>

    <Sheet number="18" title="Qui sommes-nous ?" companyName={companyName}>
      <div className="who-card">
        <img src="/mkl-energies.png" alt={companyName} />
        <div>
          <b>{companyName}</b>
          {companyEmitterLines(company).map(line => <span key={line}>{line}</span>)}
          <span>{companyContactLine(company)}</span>
        </div>
        <Leaf />
      </div>
    </Sheet>
  </main>;
}

function producedKwh(value) {
  if (!Number(value)) return "— € / kWh";
  return `${Number(value).toFixed(4)} € / kWh`;
}
