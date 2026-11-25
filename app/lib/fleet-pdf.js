import { fleetLabel, HOLDING_MODES, displayPlate } from "./fleet.js";

function safe(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(value) {
  const day = String(value || "").slice(0, 10);
  if (!day) return "—";
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export function handoverSheetHtml({
  company = {},
  vehicle = {},
  assignment = {},
  handover = {},
  driver = {},
  actor = {},
} = {}) {
  const damages = Array.isArray(handover.damages) ? handover.damages : [];
  const accessories = Array.isArray(handover.accessories) ? handover.accessories : [];
  const kind = handover.kind === "return" ? "État des lieux de restitution" : "Fiche de remise de véhicule";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>${safe(kind)} ${safe(vehicle.plate || "")}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f4f6fb; color: #152347; font: 13px/1.45 "DM Sans", sans-serif; }
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 16mm 18mm; background: #fff; box-sizing: border-box; }
    .head { display: flex; justify-content: space-between; gap: 18px; border-bottom: 4px solid #ffcc00; padding-bottom: 14px; }
    .head p { margin: 0 0 4px; font-size: 10px; letter-spacing: 1.4px; color: #405fae; font-weight: 700; }
    h1 { margin: 0; font: 700 24px Manrope, sans-serif; letter-spacing: -0.6px; }
    .meta { text-align: right; color: #5d6b88; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #d9e0ef; border-radius: 10px; padding: 12px 14px; }
    .card b { display: block; font-size: 15px; margin-top: 2px; }
    .card small { color: #6b7690; }
    h2 { font: 700 14px Manrope, sans-serif; color: #314d93; margin: 20px 0 8px; }
    ul { margin: 0; padding-left: 18px; }
    .notes { min-height: 70px; border: 1px dashed #c5cee0; border-radius: 8px; padding: 10px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
    .sign i { display: block; height: 58px; border-bottom: 1px solid #c5cee0; margin-bottom: 6px; }
    .foot { margin-top: 28px; color: #84908d; font-size: 11px; }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="head">
      <div>
        <p>PARC AUTOMOBILE</p>
        <h1>${safe(kind)}</h1>
        <span>${safe(company.name || "MKL Énergies")}</span>
      </div>
      <div class="meta">
        <div>${formatDate(handover.date || assignment.startedOn)}</div>
        <div>${safe(actor.name || "")}</div>
      </div>
    </header>
    <div class="grid">
      <div class="card">
        <small>Véhicule</small>
        <b>${safe(displayPlate(vehicle.plate))} · ${safe(vehicle.internalCode)}</b>
        <span>${safe([vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" "))}</span><br/>
        <small>${safe(fleetLabel(HOLDING_MODES, vehicle.holdingMode))} · ${Number(handover.km || assignment.startKm || vehicle.currentKm || 0).toLocaleString("fr-FR")} km</small>
      </div>
      <div class="card">
        <small>Salarié</small>
        <b>${safe(driver.name || assignment.driverName || "—")}</b>
        <span>${safe(driver.role || "")}</span><br/>
        <small>Remise le ${formatDate(assignment.startedOn)} · ${assignment.endedOn ? `Restitution le ${formatDate(assignment.endedOn)}` : "Affectation en cours"}</small>
      </div>
    </div>
    <h2>Accessories et éléments remis</h2>
    <ul>${accessories.length ? accessories.map(item => `<li>${safe(item)}</li>`).join("") : "<li>Aucun accessoire déclaré</li>"}</ul>
    <h2>Dommages préexistants</h2>
    <ul>${damages.length ? damages.map(item => `<li>${safe(item)}</li>`).join("") : "<li>Aucun dommage déclaré</li>"}</ul>
    <h2>Observations</h2>
    <div class="notes">${safe(handover.observations || "—")}</div>
    <div class="sign">
      <div><i></i>Signature du salarié</div>
      <div><i></i>Signature MKL Énergies</div>
    </div>
    <p class="foot">Document interne MKL Énergies — à conserver dans la fiche véhicule. L’affectation précédente et les états des lieux restent dans l’historique.</p>
  </article>
</body>
</html>`;
}
