"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import {
  SUBCONTRACTOR_DOCUMENTS,
  SUBCONTRACTOR_DOC_MAX_BYTES,
  contractorDocumentReady,
} from "../lib/installation-planning";
import { authFetch } from "../lib/supabase-rest";

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.readAsDataURL(file);
  });
}

async function downloadDocument(doc, onError) {
  let href = doc?.data || "";
  let revoke = false;
  if (doc?.path) {
    const response = await authFetch(`/api/subcontractor-documents?path=${encodeURIComponent(doc.path)}&name=${encodeURIComponent(doc.name || "document")}`);
    if (!response.ok) {
      onError?.("Téléchargement impossible.");
      return;
    }
    href = URL.createObjectURL(await response.blob());
    revoke = true;
  }
  if (!href) return;
  const link = document.createElement("a");
  link.href = href;
  link.download = doc.name || "document";
  link.click();
  if (revoke) URL.revokeObjectURL(href);
}

export default function SubcontractorDocuments({ documents = {}, onChange, onError }) {
  const inputs = useRef({});

  async function pick(id, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > SUBCONTRACTOR_DOC_MAX_BYTES) {
      onError?.("Document trop lourd (1,8 Mo maximum).");
      return;
    }
    try {
      const data = await readAsDataUrl(file);
      onChange?.({ ...documents, [id]: { name: file.name, data } });
    } catch (error) {
      onError?.(error.message || "Import impossible.");
    }
  }

  return (
    <div className="contractor-docs">
      <b>Documents</b>
      <span>Le bouton est rouge tant que le fichier n’est pas déposé. Il passe au vert une fois le document enregistré.</span>
      {SUBCONTRACTOR_DOCUMENTS.map(item => {
        const doc = documents[item.id];
        const ready = contractorDocumentReady(doc);
        return (
          <div className="contractor-doc" key={item.id}>
            <input
              ref={node => { inputs.current[item.id] = node; }}
              type="file"
              accept="application/pdf,image/*"
              hidden
              onChange={event => pick(item.id, event)}
            />
            <button
              type="button"
              className={`doc-slot ${ready ? "is-ready" : "is-missing"}`}
              onClick={() => (ready ? downloadDocument(doc, onError) : inputs.current[item.id]?.click())}
            >
              {ready ? <Download size={14} /> : null}
              {item.label}
            </button>
            {ready ? (
              <button type="button" className="secondary" onClick={() => inputs.current[item.id]?.click()}>Remplacer</button>
            ) : null}
            {ready ? <small>{doc.name}</small> : null}
          </div>
        );
      })}
    </div>
  );
}
