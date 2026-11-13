/**
 * Écran local de recette. N’ouvre aucune connexion Supabase.
 * Les comptes et les devis sont fictifs, tenus en mémoire.
 */
import { createServer } from "node:http";
import { emptySaleBook } from "../../app/lib/commercial-sale.js";
import { proofAccess, runSaleRequest, saleView } from "../../app/lib/commercial-sale-flow.js";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
if (String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PRODUCTION)) {
  console.error("Écran arrêté : le processus porte l’URL de production.");
  process.exit(1);
}

const comptes = {
  commercial: { id: "commercial-fictif", role: "Commercial", full_name: "Camille Martin" },
  responsable: { id: "responsable-fictif", role: "Responsable commercial", full_name: "Rita Conseil" },
  direction: { id: "direction-fictive", role: "Direction", full_name: "Dana Direction" },
};
const devis = {
  id: "devis-fictif-1",
  organizationId: "org-fictive",
  kind: "Devis",
  totalTtc: 12000,
  commercialId: "commercial-fictif",
  sourceProspectId: "prospect-fictif",
  status: "Envoyé",
  label: "DEV-FICTIF-1",
};
let book = emptySaleBook();
const fichiers = new Map();

function envoyer(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

function page() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Recette locale — signature</title>
<style>
  body{margin:0;background:#eef1f6;color:#172851;font:16px/1.4 "DM Sans",sans-serif}
  main{max-width:760px;margin:32px auto;padding:0 16px}
  h1{font:700 28px/1.2 Manrope,sans-serif;margin:0 0 8px}
  .comptes{display:flex;gap:8px;margin:16px 0}
  .comptes button[aria-pressed="true"]{background:#314d93;color:#fff}
  .commercial-sale-panel{margin-top:14px;padding:14px;border:1px solid #d5dcea;border-radius:12px;background:#f8f9fc}
  .commercial-sale-panel h3{margin:0 0 6px;font:700 15px/1.3 Manrope,sans-serif}
  .commercial-sale-panel p,.commercial-sale-panel li{font:500 13px/1.4 "DM Sans",sans-serif}
  .sale-state{display:inline-block;margin:6px 0;padding:4px 10px;border-radius:999px;background:#fff6d8;color:#152347;font:700 12px "DM Sans",sans-serif}
  .sale-state.is-verified{background:#e7f6ec;color:#166534}
  .sale-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:10px}
  .sale-actions label{display:flex;flex-direction:column;gap:4px;font:700 12px "DM Sans",sans-serif}
  .sale-error{color:#9f1239}
  ul{margin:8px 0 0;padding:0;list-style:none}
  li{padding:6px 0;border-top:1px solid #e6ebf3}
  button{border:1px solid #d5dcea;background:#fff;border-radius:8px;padding:8px 12px;font:700 13px "DM Sans",sans-serif}
  button.primary{background:#314d93;color:#fff;border-color:#314d93}
  input{padding:6px 8px;border:1px solid #d5dcea;border-radius:8px}
</style></head>
<body><main>
  <h1>Signature du devis fictif</h1>
  <p>Recette locale, données inventées, aucune base distante.</p>
  <div class="comptes" id="comptes"></div>
  <section class="commercial-sale-panel" id="panneau"></section>
</main>
<script>
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
let role = "commercial";
const comptes = [
  ["commercial", "Commercial"],
  ["responsable", "Responsable"],
  ["direction", "Direction"],
];
document.getElementById("comptes").innerHTML = comptes.map(([id, label]) =>
  '<button type="button" data-role="' + id + '">' + label + "</button>").join("");
document.getElementById("comptes").onclick = (event) => {
  const bouton = event.target.closest("button");
  if (!bouton) return;
  role = bouton.dataset.role;
  charger();
};
async function charger() {
  for (const bouton of document.querySelectorAll("#comptes button")) {
    bouton.setAttribute("aria-pressed", String(bouton.dataset.role === role));
  }
  const reponse = await fetch("/api/signature?role=" + role);
  dessiner(await reponse.json());
}
function dessiner(etat) {
  const vente = etat.sale;
  const verdict = etat.verdict || "";
  const ton = verdict === "Signée vérifiée" ? "is-verified" : "";
  const erreur = etat.error ? '<p class="sale-error">' + etat.error + "</p>" : "";
  let actions = "";
  if (etat.canRequest && vente?.status !== "confirmee" && vente?.status !== "demande") {
    actions = '<div class="sale-actions"><label>Date de signature<input id="date" type="date" value="2026-11-13"></label><label>PDF signé fictif<input id="fichier" type="file" accept="application/pdf"></label><button class="primary" id="deposer" type="button">Déposer un devis signé</button><button id="pdf-fictif" type="button">Déposer le PDF fictif</button><button id="falsifier" type="button">Essayer un montant falsifié</button></div>';
  }
  if (etat.canConfirm && vente?.status === "demande") {
    actions += '<div class="sale-actions"><button class="primary" id="confirmer" type="button">Confirmer la vente</button></div>';
  }
  if (etat.canConfirm && vente?.status === "confirmee") {
    actions += '<div class="sale-actions"><label>Motif d’annulation<input id="motif" placeholder="Motif obligatoire"></label><button id="annuler" type="button">Annuler la confirmation</button></div>';
  }
  const lignes = (etat.journal || []).map(entree => "<li>" + entree.action + " — " + (entree.actorName || "") + (entree.reason ? " — " + entree.reason : "") + "</li>").join("");
  document.getElementById("panneau").innerHTML =
    "<h3>Signature du client</h3><p>Devis fictif DEV-FICTIF-1. Le montant contractuel relu est 12 000 €.</p>" +
    (verdict ? '<strong class="sale-state ' + ton + '">' + verdict + "</strong>" : "") +
    (vente?.status === "confirmee" ? "<ul><li>Date de signature : " + vente.declaredSignatureDate + "</li><li>Validateur : " + (vente.confirmedByName || "") + "</li><li>Montant contractuel TTC : " + euro.format(vente.amountTtc) + "</li></ul>" : "") +
    (vente?.proofDigest ? '<p><button type="button" id="voir">Voir le justificatif</button></p>' : "") +
    erreur + actions +
    (etat.totals ? "<p>CA signé vérifié : " + euro.format(etat.totals.net) + " net, " + euro.format(etat.totals.brut) + " brut.</p>" : "") +
    (lignes ? "<div><b>Historique</b><ul>" + lignes + "</ul></div>" : "");
  const deposer = document.getElementById("deposer");
  if (deposer) deposer.onclick = async () => {
    const fichier = document.getElementById("fichier").files[0];
    if (!fichier) return dessiner({ ...etat, error: "Choisissez le PDF signé et la date de signature." });
    const octets = await fichier.arrayBuffer();
    let binaire = "";
    const vue = new Uint8Array(octets);
    for (let i = 0; i < vue.length; i += 0x8000) binaire += String.fromCharCode(...vue.subarray(i, i + 0x8000));
    await envoyerAction("demande", { declaredSignatureDate: document.getElementById("date").value, pdfBase64: btoa(binaire), kind: "devis_signe" });
  };
  const pdfFictif = document.getElementById("pdf-fictif");
  if (pdfFictif) pdfFictif.onclick = () => envoyerAction("demande", { declaredSignatureDate: "2026-11-13", pdfBase64: btoa("%PDF-1.4\\npreuve fictive"), kind: "devis_signe" });
  const falsifier = document.getElementById("falsifier");
  if (falsifier) falsifier.onclick = () => envoyerAction("demande", { declaredSignatureDate: "2026-11-13", pdfBase64: btoa("%PDF-1.4 faux"), kind: "devis_signe", devis: { totalTtc: 1 } });
  const confirmer = document.getElementById("confirmer");
  if (confirmer) confirmer.onclick = () => envoyerAction("confirmer", {});
  const annuler = document.getElementById("annuler");
  if (annuler) annuler.onclick = () => envoyerAction("annuler", { reason: document.getElementById("motif").value });
  const voir = document.getElementById("voir");
  if (voir) voir.onclick = () => window.open("/api/signature?role=" + role + "&fichier=1", "_blank");
}
async function envoyerAction(action, extra) {
  const reponse = await fetch("/api/signature?role=" + role, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
  dessiner(await reponse.json());
}
charger();
</script></body></html>`;
}

const serveur = createServer(async (requete, reponse) => {
  const url = new URL(requete.url, "http://127.0.0.1");
  if (url.pathname === "/") return envoyer(reponse, 200, page(), "text/html; charset=utf-8");
  if (url.pathname !== "/api/signature") return envoyer(reponse, 404, "Introuvable", "text/plain");
  const profil = comptes[url.searchParams.get("role")] || comptes.direction;
  if (requete.method === "GET" && url.searchParams.get("fichier") === "1") {
    const acces = proofAccess({ profile: profil, userId: profil.id, sale: book.sales.find(item => item.devisId === devis.id && item.proofDigest) || null });
    if (acces.status !== 200) return envoyer(reponse, acces.status, JSON.stringify({ error: acces.error }));
    const octets = fichiers.get(book.sales.find(item => item.proofDigest)?.proofDigest);
    if (!octets) return envoyer(reponse, 404, JSON.stringify({ error: "Justificatif introuvable." }));
    reponse.writeHead(200, { "content-type": "application/pdf", "content-disposition": "inline; filename=\"devis-fictif.pdf\"" });
    return reponse.end(octets);
  }
  if (requete.method === "GET") {
    const vue = saleView({ profile: profil, book, devisId: devis.id, recorded: devis });
    if (url.searchParams.get("montant") === "1") vue.error = vue.error;
    return envoyer(reponse, 200, JSON.stringify(vue));
  }
  const chunks = [];
  for await (const chunk of requete) chunks.push(chunk);
  const corps = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const resultat = await runSaleRequest({
    profile: profil,
    user: { id: profil.id },
    action: corps.action,
    recorded: devis,
    body: corps,
    book,
  });
  if (resultat.persist) {
    book = resultat.book;
    if (resultat.pdf) fichiers.set(resultat.pdf.digest, resultat.pdf.bytes);
    if (resultat.sale?.status === "confirmee" && devis.sourceProspectId) devis.status = "Accepté";
  }
  const vue = saleView({ profile: profil, book, devisId: devis.id, recorded: devis });
  const charge = { ...vue, ...(resultat.body || {}), error: resultat.body?.ok ? "" : resultat.body?.error || "" };
  envoyer(reponse, resultat.status, JSON.stringify(charge));
});

serveur.listen(4317, "127.0.0.1", () => {
  console.log("Recette locale prête sur http://127.0.0.1:4317");
});
