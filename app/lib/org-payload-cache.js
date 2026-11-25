const stores = new Map();

function bucket(name) {
  if (!stores.has(name)) stores.set(name, { entries: new Map(), inflight: new Map() });
  return stores.get(name);
}

export async function rememberOrgPayload(name, orgId, loader, { ttlMs = 90_000, fresh = false } = {}) {
  const key = String(orgId || "");
  const { entries, inflight } = bucket(name);
  if (!fresh) {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return { payload: hit.payload, cached: true };
    const pending = inflight.get(key);
    if (pending) return { payload: await pending, cached: false };
  }
  const promise = Promise.resolve().then(loader);
  inflight.set(key, promise);
  try {
    const payload = await promise;
    entries.set(key, { at: Date.now(), payload });
    return { payload, cached: false };
  } finally {
    inflight.delete(key);
  }
}

export function forgetOrgPayload(name, orgId) {
  const store = stores.get(name);
  if (!store) return;
  if (orgId) store.entries.delete(String(orgId));
  else store.entries.clear();
}

export function forgetOrgUsers(orgId) {
  forgetOrgPayload("users", `${orgId}:manage`);
  forgetOrgPayload("users", `${orgId}:dir`);
}
