"use client";

import { useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import DevisAnnexPicker from "./devis-annex-picker";
import { reservePdfTab, triggerBlobDownload } from "../lib/html-to-pdf";
import { authFetch } from "../lib/supabase-rest";
import { openDevisPrintWindow } from "../lib/devis-print";
import { documentDateLabel, documentPdfFilename } from "../lib/record-documents";
import { openThermalPrintWindow } from "../lib/thermal-print";
import { openSizingPrintWindow } from "../lib/sizing-note-print";
import { openPvSimulatorPrintWindow } from "../lib/pv-production-print";

export async function downloadRecordDocument(doc, { clients = [] } = {}) {
  if (doc.download === "devis" && doc.source) {
    return openDevisPrintWindow(doc.source, { clients, filename: doc.pdfFilename });
  }
  if (doc.download === "thermal" && doc.source) {
    return openThermalPrintWindow({
      form: doc.source,
      number: doc.source.number || doc.title,
      filename: doc.pdfFilename,
      autoPrint: false,
    });
  }
  if (doc.download === "sizing" && doc.source) {
    return openSizingPrintWindow({
      form: doc.source,
      number: doc.source.number || doc.title,
      filename: doc.pdfFilename,
      autoPrint: false,
    });
  }
  if (doc.download === "simulator" && doc.source) {
    return openPvSimulatorPrintWindow({
      form: doc.source,
      number: doc.source.number || doc.title,
      filename: doc.pdfFilename,
      autoPrint: false,
    });
  }
  if (doc.download === "previsit-report" && doc.visitKey) {
    const tab = reservePdfTab();
    const response = await authFetch(`/api/previsits/${doc.visitKey}/report/file`);
    if (response.ok) {
      triggerBlobDownload(await response.blob(), doc.pdfFilename || documentPdfFilename({
        kind: "Prévisite",
        title: doc.title,
        source: doc.source,
      }), tab);
      return;
    }
    try { tab?.close(); } catch { /* ignore */ }
    if (doc.href) {
      window.open(doc.href, "_blank", "noopener,noreferrer");
      return;
    }
    throw new Error("Aucun PDF de prévisite pour le moment.");
  }
  if (doc.href) {
    window.open(doc.href, "_blank", "noopener,noreferrer");
    return;
  }
  throw new Error("Ce document n’a pas encore de fichier à télécharger.");
}

export default function RecordDocumentList({
  documents = [],
  clients = [],
  articles = [],
  empty = "Aucun document associé pour le moment.",
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [printDoc, setPrintDoc] = useState(null);

  async function download(doc) {
    if (doc.download === "devis" && doc.source) {
      setPrintDoc(doc);
      return;
    }
    setBusyId(doc.id);
    setError("");
    try {
      await downloadRecordDocument(doc, { clients });
    } catch (err) {
      setError(String(err.message || "Téléchargement impossible."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="record-documents">
      {error && <p className="record-documents-error">{error}</p>}
      {documents.length === 0 && (
        <div className="quote-empty"><FileText size={20} /><span>{empty}</span></div>
      )}
      {documents.map(doc => (
        <article className="record-document" key={doc.id}>
          <FileText size={18} />
          <span>
            <small>{doc.kind}</small>
            <b>{doc.title || "Document sans numéro"}</b>
            <em>{doc.detail || "Document"}{doc.date ? ` • ${documentDateLabel(doc.date)}` : ""}</em>
          </span>
          <i className="status wait">{doc.status || "Disponible"}</i>
          <div className="record-document-actions">
            {doc.href && (
              <a href={doc.href} target="_blank" rel="noreferrer">
                <Eye size={15} />Ouvrir
              </a>
            )}
            {(doc.download || doc.href) && (
              <button type="button" disabled={busyId === doc.id} onClick={() => download(doc)}>
                <Download size={15} />{busyId === doc.id ? "…" : "Télécharger"}
              </button>
            )}
          </div>
        </article>
      ))}
      {printDoc && (
        <DevisAnnexPicker
          doc={printDoc.source}
          articles={articles}
          clients={clients}
          filename={printDoc.pdfFilename}
          onClose={() => setPrintDoc(null)}
        />
      )}
    </div>
  );
}
