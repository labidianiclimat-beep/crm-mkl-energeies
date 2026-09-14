/** Métriques tableau de bord commercial (ÉTAPE 11). */

export const DEVIS_EN_COURS_STATUSES = ["Brouillon", "À valider", "Envoyé", "À relancer"];

export function daysSince(dateValue, now = Date.now()) {
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.floor((now - time) / 86400000);
}

export function isDevisARelancer(document, now = Date.now()) {
  if (!document || document.kind !== "Devis") return false;
  if (document.status === "À relancer") return true;
  if (document.status === "Envoyé" && daysSince(document.date || document.date_creation, now) >= 15) return true;
  return false;
}

export function computeCommercialDashboard({
  devis = [],
  clients = [],
  prospects = [],
  appointments = [],
  now = Date.now(),
} = {}) {
  const quotes = (devis || []).filter(item => (item.kind || "Devis") === "Devis");
  const devisEnCours = quotes.filter(item => DEVIS_EN_COURS_STATUSES.includes(item.status));
  const devisARelancer = quotes.filter(item => isDevisARelancer(item, now));
  const devisAcceptes = quotes.filter(item => item.status === "Accepté");
  const devisRefuses = quotes.filter(item => item.status === "Refusé");
  const caSigne = devisAcceptes.reduce((sum, item) => sum + Number(item.totalTTC ?? item.total_ttc ?? 0), 0);
  const decided = devisAcceptes.length + devisRefuses.length;
  const tauxTransformation = decided > 0 ? Math.round((devisAcceptes.length / decided) * 1000) / 10 : 0;

  const clientProspects = (clients || []).filter(client =>
    ["Prospect", "À contacter", "Rendez-vous pris", "Devis en cours"].includes(client.status)
  );
  const prospectsCount = Math.max((prospects || []).length, clientProspects.length);

  const upcomingAppointments = (appointments || [])
    .filter(item => {
      if (!item?.start && !item?.starts_at) return false;
      const start = new Date(item.start || item.starts_at).getTime();
      if (Number.isNaN(start) || start < now) return false;
      return !["Annulé", "Réalisé"].includes(item.status);
    })
    .sort((a, b) => String(a.start || a.starts_at).localeCompare(String(b.start || b.starts_at)));

  const prochainesActions = [
    ...devisARelancer.slice(0, 5).map(item => ({
      type: "relance_devis",
      title: `Relancer ${item.number || "devis"}`,
      detail: `${item.client || item.client_name || "Client"} — ${item.status}`,
      href: "Devis",
      date: item.date || item.date_creation || null,
    })),
    ...upcomingAppointments.slice(0, 5).map(item => ({
      type: "rendez_vous",
      title: item.prospectName || item.prospect_name || "Rendez-vous",
      detail: item.city || item.status || "À venir",
      href: "Agenda commercial",
      date: item.start || item.starts_at || null,
    })),
  ].slice(0, 8);

  return {
    prospectsCount,
    upcomingAppointmentsCount: upcomingAppointments.length,
    devisEnCoursCount: devisEnCours.length,
    devisARelancerCount: devisARelancer.length,
    devisAcceptesCount: devisAcceptes.length,
    caSigne,
    tauxTransformation,
    pipelineValue: devisEnCours.reduce((sum, item) => sum + Number(item.totalTTC ?? item.total_ttc ?? 0), 0),
    clientsCount: (clients || []).length,
    prochainesActions,
    devisARelancer: devisARelancer.map(item => ({
      id: item.id,
      number: item.number || item.numero_devis,
      client: item.client || item.client_name,
      status: item.status,
      age: daysSince(item.date || item.date_creation, now),
      totalTTC: Number(item.totalTTC ?? item.total_ttc ?? 0),
    })),
    upcomingAppointments: upcomingAppointments.slice(0, 8).map(item => ({
      id: item.id,
      name: item.prospectName || item.prospect_name,
      start: item.start || item.starts_at,
      status: item.status,
      city: item.city || "",
    })),
  };
}

export function filterDevisByPeriod(devis, from, to) {
  if (!from && !to) return devis;
  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(to).getTime() + 86400000 - 1 : null;
  return (devis || []).filter(item => {
    const time = new Date(item.date || item.date_creation || item.created_at).getTime();
    if (Number.isNaN(time)) return false;
    if (fromTime != null && time < fromTime) return false;
    if (toTime != null && time > toTime) return false;
    return true;
  });
}

export function filterByActivity(rows, activity, fieldCandidates = ["projectType", "project_type", "label", "kind"]) {
  if (!activity) return rows;
  const needle = String(activity).toLowerCase();
  return (rows || []).filter(row =>
    fieldCandidates.some(field => String(row[field] || "").toLowerCase().includes(needle))
  );
}
