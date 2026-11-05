import { requireApiSession } from "../../../lib/api-auth";
import { ACTIVITY_ACTIONS } from "../../../lib/activity-logs";
import { actorFromAuth, logActivity } from "../../../lib/log-activity";
import { serviceRoleConfigured } from "../../../lib/supabase-server";
import { buildCrmVisitRecord, isFieldMaintenanceTechnician } from "../../../lib/entretien-agenda";
import { searchFrenchAddresses } from "../../../lib/pv-geo";
import {
  deleteEntretienVisit,
  ensureEntretienContractForClient,
  insertCrmVisit,
  patchClientSite,
  listCrmMaintenanceContracts,
  listEntretienClientNames,
  listEntretienContracts,
  listEntretienPilotage,
  listEntretienTechnicians,
  listEntretienVisits,
  patchEntretienContract,
  patchEntretienContractNotes,
  patchEntretienVisit,
  readEntretienContract,
} from "../../../lib/entretien-store";
import { forgetOrgPayload } from "../../../lib/org-payload-cache";
import {
  TOUR_RADIUS_KM,
  TOUR_RADIUS_WIDE_KM,
  agreedClock,
  callCard,
  confirmedSite,
  buildServiceVisitRecord,
  indicatedEntretienRecord,
  isMaintenanceVisit,
  parisRange,
  pickTourAnchorVisit,
  parisToday,
  crmContractsAsTourContracts,
  pickGeocodeCandidates,
  parseTourTechnicianIds,
  pickTourTechnicians,
  placeDaySlots,
  tourWeekDays,
  plannedClientIds,
  rankCallList,
  readCallbackOn,
  visitClock,
  visitParisDay,
  visitPrestation,
  writeCallbackOn,
} from "../../../lib/entretien-tour";
import {
  equipmentHint,
  warrantyDecision,
  writeMaintenanceStop,
} from "../../../lib/entretien-warranty";

export const runtime = "nodejs";
export const maxDuration = 60;

const geoCache = new Map();

function sqlMissing(error) {
  return /entretien_|schema cache|does not exist/i.test(String(error?.message || error || ""));
}

function clientLabel(row) {
  return `${row?.prenom || ""} ${row?.nom || ""}`.trim() || row?.raison_sociale || "";
}

function addressQuery(row) {
  return [row.client_address, row.client_postal, row.client_city].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function geocode(query) {
  const key = String(query || "").trim().toLowerCase();
  if (key.length < 3) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  const hits = await searchFrenchAddresses(query, { limit: 1 }).catch(() => []);
  const hit = hits[0]?.lat != null ? { lat: hits[0].lat, lon: hits[0].lon } : null;
  geoCache.set(key, hit);
  return hit;
}

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

function tourRows(contracts, clients, pilotage) {
  const byClient = Object.fromEntries((clients || []).map(row => [row.id, row]));
  const byPilot = Object.fromEntries((pilotage || []).map(row => [row.client_id, row]));
  const seen = new Set();
  const rows = [];
  for (const contract of contracts || []) {
    if (!contract?.client_id || seen.has(contract.client_id)) continue;
    seen.add(contract.client_id);
    const client = byClient[contract.client_id] || {};
    const pilot = byPilot[contract.client_id] || {};
    rows.push({
      contractId: contract.id,
      client_id: contract.client_id,
      frequency: contract.frequency || "Annuelle",
      notes: contract.notes || "",
      callback_on: readCallbackOn(contract.notes),
      client_name: clientLabel(client),
      phone: client.telephone || client.telephone_secondaire || "",
      client_address: client.adresse || "",
      client_postal: client.code_postal || "",
      client_city: client.ville || "",
      last_confirmed_entretien_on: pilot.last_confirmed_entretien_on || null,
      next_due_on: pilot.next_due_on || null,
    });
  }
  return rows;
}

function publicRow(row) {
  return {
    contractId: row.contractId,
    clientId: row.client_id,
    name: row.client_name || "Client",
    phone: row.phone || "",
    city: row.client_city || "",
    postal: row.client_postal || "",
    address: row.client_address || "",
    tone: row.tone,
    label: row.label,
    callable: Boolean(row.callable),
    planned: Boolean(row.planned),
    km: row.km ?? null,
    dueOn: row.dueOn || "",
    lastOn: row.lastOn || "",
    callbackOn: row.callbackOn || "",
    equipment: equipmentHint(row.notes),
  };
}

function slotVisit(visit, byClient) {
  if (!visit) return null;
  const client = byClient.get(visit.client_id) || {};
  return {
    id: visit.id,
    title: visit.title || "Entretien",
    location: visit.location || "",
    clientName: client.client_name || visit.title || "Entretien",
    phone: client.phone || "",
    city: client.client_city || "",
    address: client.client_address || "",
    postal: client.client_postal || "",
    clientId: visit.client_id || "",
    prestation: visitPrestation(visit),
    description: String(visit.description || "").trim(),
  };
}

async function saveConfirmedSite(auth, orgId, clientId, site) {
  const saved = await patchClientSite(orgId, clientId, site);
  if (saved?.changed) {
    await logActivity({
      actor: actorFromAuth(auth),
      action: ACTIVITY_ACTIONS.CLIENT_UPDATE,
      module: "Maintenance",
      entityType: "client",
      entityId: clientId,
      summary: `Adresse confirmée avec le client : ${site.location}.`,
      oldValue: {
        adresse: saved.previous?.adresse || "",
        code_postal: saved.previous?.code_postal || "",
        ville: saved.previous?.ville || "",
      },
      newValue: { adresse: site.address, code_postal: site.postal, ville: site.city },
    }).catch(() => null);
  }
  return saved;
}

function weekForVisits(techVisits, weekDays, byClient) {
  return weekDays.map(iso => {
    const dayVisits = techVisits.filter(visit => visitParisDay(visit) === iso);
    const placed = placeDaySlots(dayVisits, iso);
    const anchorVisit = pickTourAnchorVisit(placed.slots, dayVisits);
    const client = anchorVisit ? (byClient.get(anchorVisit.client_id) || {}) : {};
    return { iso, dayVisits, placed, anchorVisit, client };
  });
}

function publishWeek(weekBoards, byClient) {
  return weekBoards.map(item => ({
    day: item.iso,
    filled: item.dayVisits.length,
    anchor: item.anchorVisit
      ? { name: item.client.client_name || item.anchorVisit.title || "Rendez-vous", city: item.client.client_city || "" }
      : null,
    slots: item.placed.slots.map(slot => ({
      time: slot.time,
      shifted: Boolean(slot.shifted),
      visit: slotVisit(slot.visit, byClient),
    })),
    extras: item.placed.extras.map(visit => ({
      ...slotVisit(visit, byClient),
      time: visitClock(visit),
    })),
  }));
}

async function loadBoard(orgId, { day, technicianIds }) {
  const [contracts, paper, clients, pilotage, visits, profiles] = await Promise.all([
    listEntretienContracts(orgId),
    listCrmMaintenanceContracts(orgId),
    listEntretienClientNames(orgId),
    listEntretienPilotage(orgId),
    listEntretienVisits(orgId),
    listEntretienTechnicians(orgId),
  ]);
  const covered = (contracts || []).map(row => row.client_id).filter(Boolean);
  const tourContracts = [
    ...(contracts || []),
    ...crmContractsAsTourContracts(paper, clients, covered),
  ];
  const technicians = pickTourTechnicians(profiles);
  const techIds = parseTourTechnicianIds(technicianIds);
  const selected = new Set(techIds);
  const techVisits = selected.size
    ? (visits || []).filter(visit => selected.has(String(visit.technician_id || "")))
    : [];
  const rows = tourRows(tourContracts, clients, pilotage);
  const byClient = new Map(rows.map(row => [row.client_id, row]));
  const weekDays = tourWeekDays(day);
  const nameOf = id => technicians.find(tech => String(tech.id) === String(id))?.name || "Technicien";
  const boards = techIds.map(id => {
    const mine = techVisits.filter(visit => String(visit.technician_id || "") === id);
    return {
      technicianId: id,
      name: nameOf(id),
      week: publishWeek(weekForVisits(mine, weekDays, byClient), byClient),
    };
  });
  const weekBoards = weekForVisits(techVisits, weekDays, byClient);
  const focus = weekBoards.find(item => item.iso === day) || weekBoards[0];
  const dayVisits = focus?.dayVisits || [];
  const placed = focus?.placed || placeDaySlots([], day);
  const maintenanceVisits = (visits || []).filter(isMaintenanceVisit);
  const planned = new Set([
    ...plannedClientIds(maintenanceVisits, parisToday()),
    ...dayVisits.filter(isMaintenanceVisit).map(visit => visit.client_id).filter(Boolean),
  ]);
  const directory = rows.map(row => {
    const card = callCard(row, day);
    const plannedRow = planned.has(row.client_id);
    return publicRow({
      ...row,
      ...card,
      planned: plannedRow,
      callable: plannedRow ? false : card.callable,
      tone: plannedRow ? "planifie" : card.tone,
      label: plannedRow ? "Déjà dans un agenda" : card.label,
    });
  });
  const anchorVisit = focus?.anchorVisit && (focus.anchorVisit.location || focus.client?.client_address)
    ? focus.anchorVisit
    : [...placed.slots].reverse().find(slot => slot.visit?.location)?.visit
      || [...dayVisits].reverse().find(visit => visit.location);
  let anchor = null;
  let radiusKm = TOUR_RADIUS_KM;
  let suggestions = [];
  if (anchorVisit) {
    const client = byClient.get(anchorVisit.client_id) || {};
    const point = await geocode(anchorVisit.location || addressQuery(client));
    anchor = {
      name: client.client_name || anchorVisit.title || "Dernier oui",
      city: client.client_city || "",
      postal: client.client_postal || "",
      lat: point?.lat ?? null,
      lon: point?.lon ?? null,
    };
    if (anchor.lat != null) {
      const candidates = pickGeocodeCandidates(
        rows.filter(row => !planned.has(row.client_id)),
        anchor.postal
      );
      const located = await mapPool(candidates, 6, async row => {
        const pointRow = await geocode(addressQuery(row));
        return pointRow ? { ...row, ...pointRow } : row;
      });
      suggestions = rankCallList(located, { today: day, anchor, bookedClientIds: [...planned], radiusKm });
      if (suggestions.length < 5) {
        radiusKm = TOUR_RADIUS_WIDE_KM;
        suggestions = rankCallList(located, { today: day, anchor, bookedClientIds: [...planned], radiusKm });
      }
    } else {
      suggestions = rankCallList(
        rows.filter(row => String(row.client_postal || "").slice(0, 2) === String(anchor.postal || "").slice(0, 2)),
        { today: day, bookedClientIds: [...planned] }
      );
    }
  } else {
    suggestions = rankCallList(rows, { today: day, bookedClientIds: [...planned] });
  }
  const filled = dayVisits.length;
  return {
    ok: true,
    day,
    technicianIds: techIds,
    technicians,
    boards,
    filled,
    radiusKm,
    anchor: anchor ? { name: anchor.name, city: anchor.city } : null,
    week: boards[0]?.week || publishWeek(weekBoards, byClient),
    slots: placed.slots.map(slot => ({
      time: slot.time,
      shifted: Boolean(slot.shifted),
      visit: slotVisit(slot.visit, byClient),
    })),
    extras: placed.extras.map(visit => ({
      id: visit.id,
      time: visitClock(visit),
      title: visit.title || "Visite",
      location: visit.location || "",
    })),
    suggestions: suggestions.map(publicRow),
    directory,
  };
}

export async function GET(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (isFieldMaintenanceTechnician(auth.profile.role)) {
    return Response.json({ error: "La tournée reste au secrétariat. Le technicien voit son agenda." }, { status: 403 });
  }
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  const url = new URL(request.url);
  const day = String(url.searchParams.get("day") || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: "Jour invalide." }, { status: 400 });
  try {
    const board = await loadBoard(auth.profile.organization_id, {
      day,
      technicianIds: url.searchParams.get("technicianIds") || url.searchParams.get("technicianId") || "",
    });
    return Response.json(board);
  } catch (error) {
    if (sqlMissing(error)) {
      return Response.json({ error: "Collez d’abord 20260932_entretien.sql dans Supabase.", sqlRequired: true }, { status: 503 });
    }
    return Response.json({ error: String(error?.message || "Tournée indisponible.") }, { status: 502 });
  }
}

export async function POST(request) {
  const auth = await requireApiSession(request, { module: "Maintenance" });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (isFieldMaintenanceTechnician(auth.profile.role)) {
    return Response.json({ error: "La tournée reste au secrétariat. Le technicien voit son agenda." }, { status: 403 });
  }
  if (!serviceRoleConfigured()) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquant." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const orgId = auth.profile.organization_id;
  try {
    if (body.action === "address") {
      if (!body.clientId) return Response.json({ error: "Client manquant." }, { status: 400 });
      const site = confirmedSite(body);
      if (!site.ok) return Response.json({ error: site.error }, { status: 400 });
      await saveConfirmedSite(auth, orgId, body.clientId, site);
      forgetOrgPayload("entretien-pilotage", orgId);
      return Response.json({ ok: true, location: site.location, wroteToGoogle: false });
    }
    if (body.action === "book") {
      const day = String(body.day || "").slice(0, 10);
      const time = agreedClock(body.time);
      if (!body.technicianId) return Response.json({ error: "Choisissez le technicien." }, { status: 400 });
      if (!body.clientId) return Response.json({ error: "Client manquant." }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !time) {
        return Response.json({ error: "Indiquez l’heure convenue avec le client." }, { status: 400 });
      }
      const visits = (await listEntretienVisits(orgId, `&technician_id=eq.${encodeURIComponent(body.technicianId)}`) || [])
        .filter(visit => visitParisDay(visit) === day);
      if (visits.some(visit => visit.client_id === body.clientId)) {
        return Response.json({ error: "Ce client est déjà sur cette journée." }, { status: 409 });
      }
      if (visits.some(visit => visitClock(visit) === time)) {
        return Response.json({ error: "Cette heure est déjà prise pour ce technicien." }, { status: 409 });
      }
      const site = confirmedSite(body);
      if (!site.ok) return Response.json({ error: site.error }, { status: 400 });
      await saveConfirmedSite(auth, orgId, body.clientId, site);
      let contractId = String(body.contractId || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contractId)) {
        const ensured = await ensureEntretienContractForClient(orgId, body.clientId, {
          startOn: day,
          actorId: auth.user.id,
        });
        contractId = ensured.contract?.id || "";
      }
      const record = {
        ...buildCrmVisitRecord({
          organizationId: orgId,
          technicianId: body.technicianId,
          clientId: body.clientId,
          contractId,
          title: body.title,
          location: site.location,
          day,
          time,
          durationMinutes: 75,
          actorId: auth.user.id,
        }),
        ...parisRange(day, time, 75),
      };
      const visit = await insertCrmVisit(orgId, record);
      forgetOrgPayload("entretien-pilotage", orgId);
      await logActivity({
        actor: actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
        entityType: "entretien_visit",
        entityId: visit?.id,
        summary: `Créneau d’entretien posé à ${time}.`,
      }).catch(() => null);
      return Response.json({ ok: true, visit, time, wroteToGoogle: false });
    }
    if (body.action === "book-service") {
      const nature = body.nature === "installation"
        ? "installation"
        : body.nature === "depannage"
          ? "depannage"
          : body.nature === "visite"
            ? "visite"
            : "";
      const day = String(body.day || "").slice(0, 10);
      const time = agreedClock(body.time);
      if (!nature) return Response.json({ error: "Choisissez dépannage, installation ou visite technique." }, { status: 400 });
      if (!body.technicianId) return Response.json({ error: "Choisissez le technicien." }, { status: 400 });
      if (!body.clientId) return Response.json({ error: "Choisissez le client." }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !time) {
        return Response.json({ error: "Indiquez le jour et l’heure." }, { status: 400 });
      }
      const visits = (await listEntretienVisits(orgId, `&technician_id=eq.${encodeURIComponent(body.technicianId)}`) || [])
        .filter(visit => visitParisDay(visit) === day);
      if (visits.some(visit => visitClock(visit) === time)) {
        return Response.json({ error: "Cette heure est déjà prise pour ce technicien." }, { status: 409 });
      }
      const site = confirmedSite(body);
      if (!site.ok) return Response.json({ error: site.error }, { status: 400 });
      await saveConfirmedSite(auth, orgId, body.clientId, site);
      const label = nature === "installation" ? "Installation" : nature === "visite" ? "Visite technique" : "Dépannage";
      const record = {
        ...buildServiceVisitRecord({
          organizationId: orgId,
          technicianId: body.technicianId,
          clientId: body.clientId,
          title: body.title || label,
          location: site.location,
          day,
          time,
          nature,
          description: body.description,
          actorId: auth.user.id,
        }),
        ...parisRange(day, time, 75),
      };
      const visit = await insertCrmVisit(orgId, record);
      forgetOrgPayload("entretien-pilotage", orgId);
      await logActivity({
        actor: actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
        entityType: "entretien_visit",
        entityId: visit?.id,
        summary: `${label} posé à ${time}.`,
      }).catch(() => null);
      return Response.json({ ok: true, visit, time, wroteToGoogle: false });
    }
    if (body.action === "move" || body.action === "cancel") {
      const visitId = String(body.visitId || "");
      const rows = await listEntretienVisits(orgId, `&id=eq.${encodeURIComponent(visitId)}`);
      const visit = rows?.[0];
      if (!visit) return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });
      if (visit.realization_status === "confirme") {
        return Response.json({ error: "Cet entretien est déjà confirmé." }, { status: 409 });
      }
      if (body.action === "cancel") {
        await deleteEntretienVisit(orgId, visit.id);
        forgetOrgPayload("entretien-pilotage", orgId);
        await logActivity({
          actor: actorFromAuth(auth),
          action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
          entityType: "entretien_visit",
          entityId: visit.id,
          summary: "Rendez-vous d’entretien annulé.",
        }).catch(() => null);
        return Response.json({ ok: true, wroteToGoogle: false });
      }
      const day = String(body.day || visitParisDay(visit)).slice(0, 10);
      const time = agreedClock(body.time);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !time) {
        return Response.json({ error: "Indiquez l’heure convenue avec le client." }, { status: 400 });
      }
      const sameDay = (await listEntretienVisits(orgId, `&technician_id=eq.${encodeURIComponent(visit.technician_id || "")}`) || [])
        .filter(item => item.id !== visit.id && visitParisDay(item) === day);
      if (sameDay.some(item => visitClock(item) === time)) {
        return Response.json({ error: "Cette heure est déjà prise pour ce technicien." }, { status: 409 });
      }
      const site = confirmedSite({
        address: body.address,
        postal: body.postal,
        city: body.city,
      });
      if ((body.address || body.postal || body.city) && !site.ok) {
        return Response.json({ error: site.error }, { status: 400 });
      }
      if (site.ok && visit.client_id) await saveConfirmedSite(auth, orgId, visit.client_id, site);
      const range = parisRange(day, time, 75);
      const updated = await patchEntretienVisit(orgId, visit.id, {
        ...range,
        ...(site.ok ? { location: site.location } : {}),
      });
      forgetOrgPayload("entretien-pilotage", orgId);
      await logActivity({
        actor: actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
        entityType: "entretien_visit",
        entityId: visit.id,
        summary: `Rendez-vous d’entretien déplacé à ${time}.`,
      }).catch(() => null);
      return Response.json({ ok: true, visit: updated, time, wroteToGoogle: false });
    }
    if (body.action === "last") {
      const iso = String(body.day || "").slice(0, 10);
      const cap = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
      if (iso > cap) return Response.json({ error: "Indiquez la date déjà passée de l’entretien." }, { status: 400 });
      const record = indicatedEntretienRecord({
        organizationId: orgId,
        clientId: body.clientId,
        contractId: body.contractId,
        day: body.day,
        actorId: auth.user.id,
        title: body.title,
        location: body.location,
      });
      const visit = await insertCrmVisit(orgId, record);
      forgetOrgPayload("entretien-pilotage", orgId);
      await logActivity({
        actor: actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
        entityType: "entretien_visit",
        entityId: visit?.id,
        summary: "Dernier entretien indiqué à l’appel, hors agenda technicien.",
      }).catch(() => null);
      return Response.json({ ok: true, visit, wroteToGoogle: false });
    }
    if (body.action === "stop") {
      const contract = await readEntretienContract(orgId, body.contractId);
      if (!contract) return Response.json({ error: "Contrat introuvable." }, { status: 404 });
      const today = String(body.day || "").slice(0, 10);
      const decision = warrantyDecision({
        installedOn: body.installedOn,
        years: body.warrantyYears,
        today,
      });
      if (!decision.ready) return Response.json({ error: "Indiquez la date d’installation et la durée de garantie." }, { status: 400 });
      if (decision.installedOn > today) return Response.json({ error: "La date d’installation est déjà passée." }, { status: 400 });
      const reason = body.reason === "annule" ? "annule" : "refus";
      const notes = writeMaintenanceStop(contract.notes, {
        day: today,
        reason,
        installedOn: decision.installedOn,
        years: decision.years,
        covered: decision.covered,
      });
      await patchEntretienContract(orgId, contract.id, {
        notes,
        status: "arrete",
        end_on: today,
      });
      await logActivity({
        actor: actorFromAuth(auth),
        action: ACTIVITY_ACTIONS.ENTRETIEN_VISIT_REVIEW,
        entityType: "entretien_contract",
        entityId: contract.id,
        summary: decision.covered
          ? "Contrat d’entretien arrêté. Courrier de renonciation à la garantie."
          : "Contrat d’entretien arrêté. Garantie déjà terminée, pas de courrier.",
      }).catch(() => null);
      return Response.json({
        ok: true,
        covered: decision.covered,
        endsOn: decision.endsOn,
        installedOn: decision.installedOn,
        years: decision.years,
        reason,
        equipment: String(body.equipment || "").trim(),
      });
    }
    if (body.action === "callback") {
      const contract = await readEntretienContract(orgId, body.contractId);
      if (!contract) return Response.json({ error: "Contrat introuvable." }, { status: 404 });
      const notes = writeCallbackOn(contract.notes, body.day);
      await patchEntretienContractNotes(orgId, contract.id, notes);
      return Response.json({ ok: true, callbackOn: String(body.day || "").slice(0, 10) });
    }
    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    if (sqlMissing(error)) {
      return Response.json({ error: "Collez d’abord 20260932_entretien.sql dans Supabase.", sqlRequired: true }, { status: 503 });
    }
    if (/nature_validated|nature_proposed|check constraint/i.test(String(error?.message || error || ""))) {
      return Response.json({ error: "Collez 20261105_tour_visite_technique.sql dans Supabase. Il autorise la visite technique, le dépannage et l’installation.", sqlRequired: true }, { status: 503 });
    }
    return Response.json({ error: String(error?.message || "Enregistrement impossible.") }, { status: 502 });
  }
}
