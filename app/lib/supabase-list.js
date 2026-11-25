import { serviceRequest } from "./supabase-server.js";

export const POSTGREST_PAGE_SIZE = 1000;
export const POSTGREST_MAX_ROWS = 50000;

export async function listAllRows(path, { idKey = "id", request = serviceRequest, pageSize = POSTGREST_PAGE_SIZE } = {}) {
  const all = [];
  const seen = new Set();
  const joiner = path.includes("?") ? "&" : "?";
  for (let offset = 0; offset < POSTGREST_MAX_ROWS; offset += pageSize) {
    const rows = await request(`${path}${joiner}limit=${pageSize}&offset=${offset}`) || [];
    const list = Array.isArray(rows) ? rows : [];
    let added = 0;
    for (const row of list) {
      const key = row?.[idKey] || row?.id || row?.client_id || JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(row);
      added += 1;
    }
    if (list.length < pageSize || added === 0) break;
  }
  return all;
}

export async function listAllRowsByIds(path, ids, { column = "id", idKey = "id", request = serviceRequest, chunkSize = 80 } = {}) {
  const unique = [...new Set((ids || []).map(id => String(id || "").trim()).filter(Boolean))];
  const all = [];
  const joiner = path.includes("?") ? "&" : "?";
  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    const filter = `${column}=in.(${chunk.map(id => `"${id}"`).join(",")})`;
    const rows = await listAllRows(`${path}${joiner}${filter}`, { idKey, request });
    all.push(...rows);
  }
  return all;
}
