const FIELD_STORE_KEY = "mkl-field-store-v1";

const QUEUE_RANK = {
  "prospect-create": 0,
  "prospect-patch": 1,
  "appointment-create": 2,
  "appointment-patch": 3,
};

export function isNetworkFailure(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  return name === "TypeError" || /failed to fetch|networkerror|load failed|connexion/i.test(message);
}

export function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function emptyFieldStore(userId = "") {
  return {
    userId: String(userId || ""),
    profile: null,
    prospects: [],
    appointments: [],
    queue: [],
    savedAt: "",
  };
}

export function readFieldStore(storage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(FIELD_STORE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      userId: String(parsed.userId || ""),
      profile: parsed.profile || null,
      prospects: Array.isArray(parsed.prospects) ? parsed.prospects : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      savedAt: parsed.savedAt || "",
    };
  } catch {
    return null;
  }
}

export function writeFieldStore(store, storage) {
  if (!storage) return store;
  storage.setItem(FIELD_STORE_KEY, JSON.stringify(store));
  return store;
}

export function clearFieldStore(storage) {
  storage?.removeItem(FIELD_STORE_KEY);
}

export function fieldStoreForUser(store, userId) {
  if (!store || !userId || String(store.userId) !== String(userId)) return null;
  return store;
}

export function rememberFieldProfile(store, userId, profile, savedAt = new Date().toISOString()) {
  const base = store?.userId === String(userId) ? store : emptyFieldStore(userId);
  return {
    ...base,
    userId: String(userId || ""),
    profile: profile || base.profile,
    savedAt,
  };
}

export function rememberFieldLists(store, { userId, profile, prospects, appointments, savedAt = new Date().toISOString() }) {
  const base = store?.userId === String(userId) ? store : emptyFieldStore(userId);
  const pendingProspects = (base.prospects || []).filter(item => item.offlinePending);
  const pendingAppointments = (base.appointments || []).filter(item => item.offlinePending);
  const serverProspects = Array.isArray(prospects) ? prospects : base.prospects;
  const serverAppointments = Array.isArray(appointments) ? appointments : base.appointments;
  return {
    ...base,
    userId: String(userId || ""),
    profile: profile || base.profile,
    prospects: [...pendingProspects.filter(item => !serverProspects.some(row => row.id === item.id)), ...serverProspects],
    appointments: [...pendingAppointments.filter(item => !serverAppointments.some(row => row.id === item.id)), ...serverAppointments],
    savedAt,
  };
}

export function offlineLocalId() {
  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function localProspectFromPayload(payload, { id, owner = "" } = {}) {
  return {
    id,
    name: payload.name || "",
    phone: payload.phone || "",
    email: payload.email || "",
    city: payload.city || "",
    address: payload.address || "",
    addressComplement: payload.addressComplement || "",
    postalCode: payload.postalCode || "",
    type: payload.type || "",
    source: payload.source || "",
    stage: payload.stage || "Nouveau",
    notes: payload.notes || "",
    commercialId: payload.commercialId || "",
    owner: owner || "Non affecté",
    prospectorId: payload.prospectorId || "",
    prospector: payload.prospector || "",
    rdvStatus: "",
    offlinePending: true,
  };
}

export function localAppointmentFromPayload(payload, { id } = {}) {
  return {
    id,
    prospectId: payload.prospectId || "",
    prospectName: payload.prospectName || payload.subject || "",
    city: payload.city || "",
    postalCode: payload.postalCode || "",
    type: payload.type || "",
    start: payload.start || "",
    duration: Number(payload.duration || 60),
    status: payload.status || "Non statué",
    notes: payload.notes || "",
    appointmentType: payload.appointmentType || "Visite commerciale",
    commercialId: payload.commercialId || "",
    address: payload.address || payload.appointmentAddress || "",
    phone: payload.phone || "",
    offlinePending: true,
  };
}

export function queueFieldChange(store, change) {
  const queue = (store.queue || []).filter(item => item.id !== change.id);
  return { ...store, queue: [...queue, change] };
}

export function sortFieldQueue(queue = []) {
  return [...queue].sort((left, right) => {
    const rank = (QUEUE_RANK[left.kind] ?? 9) - (QUEUE_RANK[right.kind] ?? 9);
    if (rank) return rank;
    return String(left.at || "").localeCompare(String(right.at || ""));
  });
}

export function upsertById(list, record) {
  const current = Array.isArray(list) ? list : [];
  const index = current.findIndex(item => String(item.id) === String(record.id));
  if (index < 0) return [record, ...current];
  const next = current.slice();
  next[index] = record;
  return next;
}

function replaceId(value, localId, serverId) {
  if (value == null) return value;
  if (typeof value === "string") return value.split(localId).join(serverId);
  if (Array.isArray(value)) return value.map(item => replaceId(item, localId, serverId));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceId(item, localId, serverId)]));
  }
  return value;
}

export function acceptFieldSync(store, change, serverRecord) {
  const localId = change.localId || "";
  const serverId = serverRecord?.id || localId;
  let prospects = store.prospects || [];
  let appointments = store.appointments || [];
  if (change.kind.startsWith("prospect") && serverRecord) {
    prospects = upsertById(prospects.filter(item => item.id !== localId), { ...serverRecord, offlinePending: false });
  }
  if (change.kind.startsWith("appointment") && serverRecord) {
    appointments = upsertById(appointments.filter(item => item.id !== localId), { ...serverRecord, offlinePending: false });
  }
  if (localId && serverId && localId !== serverId) {
    appointments = appointments.map(item => item.prospectId === localId ? { ...item, prospectId: serverId } : item);
  }
  const queue = (store.queue || [])
    .filter(item => item.id !== change.id)
    .map(item => localId && serverId && localId !== serverId ? {
      ...item,
      url: String(item.url || "").split(localId).join(serverId),
      body: replaceId(item.body, localId, serverId),
      localId: item.localId === localId ? serverId : item.localId,
    } : item);
  return { ...store, prospects, appointments, queue };
}

export function markFieldSyncFailed(store, change, message) {
  const note = message || "En attente de connexion";
  return {
    ...store,
    queue: (store.queue || []).map(item => item.id === change.id ? { ...item, syncError: note } : item),
    prospects: (store.prospects || []).map(item => item.id === change.localId ? { ...item, syncError: note } : item),
    appointments: (store.appointments || []).map(item => item.id === change.localId ? { ...item, syncError: note } : item),
  };
}

export function pendingFieldCount(store) {
  return (store?.queue || []).filter(item => !item.syncError).length;
}
