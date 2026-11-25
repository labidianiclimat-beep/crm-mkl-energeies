import { SUBCONTRACTOR_DOCUMENTS } from "./installation-planning";
import { authFetch } from "./supabase-rest";

const DOC_IDS = new Set(SUBCONTRACTOR_DOCUMENTS.map(item => item.id));

export async function offloadSubcontractorDocuments(teams) {
  const next = [];
  for (const team of Array.isArray(teams) ? teams : []) {
    if (team?.kind !== "sous-traitant" || !team.documents || typeof team.documents !== "object") {
      next.push(team);
      continue;
    }
    const documents = {};
    for (const [id, doc] of Object.entries(team.documents)) {
      if (!DOC_IDS.has(id) || !doc || typeof doc !== "object") continue;
      const name = String(doc.name || "").trim();
      if (!name) continue;
      if (String(doc.data || "").startsWith("data:")) {
        const response = await authFetch("/api/subcontractor-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: team.id, docId: id, name, data: doc.data }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.path) {
          throw new Error(payload.error || "Le document du sous-traitant n’a pas pu être envoyé.");
        }
        documents[id] = { name: payload.name || name, path: payload.path };
      } else if (doc.path) {
        documents[id] = { name, path: doc.path };
      }
    }
    next.push({ ...team, documents });
  }
  return next;
}
