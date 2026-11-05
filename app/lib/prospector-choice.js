const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OTHER_PROSPECTOR = "__autre__";

export function resolveProspectorChoice(input = {}) {
  const raw = String(input.prospectorId || input.prospector_id || "").trim();
  const name = String(input.prospector || "").trim();
  if (raw === OTHER_PROSPECTOR) {
    return { prospectorId: "", prospector: name, other: true };
  }
  if (UUID_RE.test(raw)) {
    return { prospectorId: raw, prospector: "", other: false };
  }
  return { prospectorId: "", prospector: name, other: Boolean(name) };
}
