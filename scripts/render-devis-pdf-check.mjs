import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDevisPrintHtml } from "../app/lib/devis-print.js";
import { formatHeatPumpDescription } from "../app/lib/heat-pump-specs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp");
mkdirSync(outDir, { recursive: true });

const longPac = formatHeatPumpDescription({
  eprel: "123456",
  ademe: "PAC-88",
  refrigerant: "R32",
  energyClass: "A+++ / A++",
  seasonalEfficiency: "185 % / 145 %",
  scop: "4,6 / 3,8",
  maxFlowTemp: "60 °C",
  powerMinus7_35: "8,2 kW",
  copMinus7_35: "3,4",
  powerMinus7_55: "7,1 kW",
  copMinus7_55: "2,6",
  powerPlus7_35: "9,5 kW",
  copPlus7_35: "4,8",
  soundLevel: "35 dB(A)",
  dhwTank: "Oui — 190 L",
  bufferVolume: "40 L",
  expansionVessel: "12 L",
  operatingWeight: "148 kg",
  operatingRange: "-20 °C / +35 °C",
  powerSupply: "230 V monophasé",
  electricBackup: "6 kW / 32 A / 3G6",
  dhwBackup: "1,8 kW / 10 A / 3G1,5",
  warranty: "- 2 ans pièces\n- +1 an pièces et main d'œuvre sous conditions Atlantic\n- 5 ans corps de chauffe, compresseur, échangeur et ballon ECS",
}, { brand: "Atlantic", title: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE" });

const long = (text) => Array.from({ length: 10 }, () => text).join(" ");

const doc = {
  kind: "Devis",
  number: "DEV-2026-000024",
  date: "2026-09-20",
  due: "2026-10-20",
  deliveryDate: "2026-11-04",
  client: "Client Test",
  financier: "Sofinco",
  financedAmount: 18000,
  financeMonths: 84,
  monthlyPayment: 240,
  financeNominalRate: 4.9,
  financeTaeg: 5.21,
  specialConditions: "Acompte de 30 % à la commande. Solde à la réception des travaux.",
  items: [
    { name: "ATLANTIC ALFEA EXCELLIA S 9 KW MONOPHASE", code: "520-556", qty: 1, unit: 15000, tax: 5.5, description: longPac },
    { name: "FOURNITURES POUR INSTALLATION POMPE À CHALEUR AIR/EAU", code: "FOUR-PAC", qty: 1, unit: 1850, tax: 5.5, description: long("Kit hydraulique, liaisons frigorifiques, supports antivibratiles, vase d’expansion, vanne 3 voies, câblage et accessoires de pose.") },
    { name: "INSTALLATION ET MISE EN SERVICE PAC", code: "MO-PAC", qty: 1, unit: 3200, tax: 10, description: long("Dépose de l’existant, pose de l’unité extérieure, raccordements hydrauliques et électriques, mise en service et formation client.") },
    { name: "BALLON THERMODYNAMIQUE 200L", code: "BTD-200", qty: 1, unit: 2100, tax: 5.5, description: long("Ballon thermodynamique air/eau, appoint électrique, anode, groupe de sécurité, mitigeur et notice constructeur.") },
    { name: "PLANCHER CHAUFFANT RDC", code: "PC-RDC", qty: 85, unit: 62, tax: 5.5, description: long("Collecteurs, tubes PER, isolation, chape fluide et équilibrage des boucles du rez-de-chaussée.") },
  ],
};

const logoData = `data:image/png;base64,${readFileSync(join(root, "public/mkl-energies.png")).toString("base64")}`;
const html = await buildDevisPrintHtml(doc, {
  logoData,
  clients: [{ name: "Client Test", firstName: "Jean", lastName: "Martin", address: "12 rue des Énergies", postalCode: "67000", city: "Strasbourg", phone: "06 00 00 00 00", email: "jean@test.fr" }],
});
const paginateSrc = readFileSync(join(root, "app/lib/pdf-paginate.js"), "utf8").replace(/^export /gm, "");
const check = html.replace("</body>", `
<script>
${paginateSrc}
window.addEventListener("load", () => {
  paginateFlowSheets(document.body);
  const pages = [...document.querySelectorAll(".sheet-page")];
  const report = {
    pages: pages.length,
    articles: document.querySelectorAll(".article-block").length,
    continued: document.querySelectorAll(".article-continued").length,
    totalsOnLast: Boolean(pages.at(-1)?.querySelector(".closing-totals")),
    footerOnEveryPage: pages.every(page => page.querySelector("footer.note")),
    pricesInMain: [...document.querySelectorAll(".article-main .num")].every(cell => !/Marque|Réfrigérant/.test(cell.textContent)),
  };
  window.__DEVIS_PDF_CHECK__ = report;
  document.documentElement.dataset.pages = String(report.pages);
  const banner = document.createElement("pre");
  banner.id = "pdf-check-report";
  banner.className = "no-print";
  banner.textContent = JSON.stringify(report, null, 2);
  banner.style.cssText = "position:sticky;top:0;z-index:90;background:#152347;color:#fff;padding:12px;margin:0";
  document.body.prepend(banner);
});
</script>
</body>`);

const outFile = join(outDir, "devis-pdf-check.html");
writeFileSync(outFile, check);
console.log(outFile);
