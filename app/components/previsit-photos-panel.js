"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import { compressPhotoFile, renderAnnotatedJpeg } from "../lib/previsit-photos";
import { composeReportPageJpegs } from "../lib/previsit-photo-report";
import { reservePdfTab, triggerBlobDownload } from "../lib/html-to-pdf";
import { documentPdfFilename } from "../lib/record-documents";
import PrevisitPhotoCapture from "./previsit-photo-capture";
import PrevisitPhotoEditor from "./previsit-photo-editor";
import PrevisitPhotoGallery from "./previsit-photo-gallery";

async function blobUrl(visitKey, photoId, kind) {
  const response = await authFetch(`/api/previsits/${visitKey}/photos/${photoId}/file?kind=${kind}`);
  if (!response.ok) return "";
  return URL.createObjectURL(await response.blob());
}

export default function PrevisitPhotosPanel({
  visitKey,
  clientId,
  meta = {},
  getMeta,
  ensureVisit,
  companyName = "MKL Énergies",
}) {
  const [photos, setPhotos] = useState([]);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const pendingFiles = useRef([]);

  useEffect(() => {
    if (!visitKey) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await authFetch(`/api/previsits/${visitKey}/photos`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Chargement impossible.");
        const next = await Promise.all((data.photos || []).map(async photo => ({
          ...photo,
          previewUrl: await blobUrl(visitKey, photo.id, "annotated"),
          originalUrl: await blobUrl(visitKey, photo.id, "original"),
        })));
        if (!cancelled) setPhotos(next);
        const report = await authFetch(`/api/previsits/${visitKey}/report`);
        const reportData = await report.json().catch(() => ({}));
        if (report.ok && reportData.report?.document_id) {
          setReportUrl(`/api/previsits/${visitKey}/report/file`);
        }
      } catch (err) {
        if (!cancelled) setError(String(err.message || "Photos indisponibles."));
      }
    })();
    return () => { cancelled = true; };
  }, [visitKey]);

  async function openNextFile(files, key) {
    const [file, ...rest] = files;
    pendingFiles.current = rest;
    if (!file) return;
    setProgress(rest.length ? `Préparation 1/${rest.length + 1}` : "Préparation de la photo…");
    try {
      const compressed = await compressPhotoFile(file);
      setEditor({
        visitKey: key,
        local: true,
        imageSrc: URL.createObjectURL(compressed.blob),
        blob: compressed.blob,
        width: compressed.width,
        height: compressed.height,
        marks: [],
        caption: "",
        comment: "",
        takenAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(String(err.message || "Lecture de la photo impossible."));
      if (rest.length) await openNextFile(rest, key);
    }
    setProgress("");
  }

  async function pickFiles(files) {
    setError("");
    const key = visitKey || await ensureVisit?.();
    if (!key) {
      setError("Enregistrez d’abord la prévisite.");
      return;
    }
    await openNextFile(files, key);
  }

  async function saveEditor(payload) {
    const current = editor;
    if (!current) return;
    setBusy("save");
    setError("");
    try {
      const annotated = await renderAnnotatedJpeg(current.imageSrc, payload.marks);
      const form = new FormData();
      form.set("caption", payload.caption || "");
      form.set("comment", payload.comment || "");
      form.set("marks", JSON.stringify(payload.marks));
      form.set("width", String(annotated.width));
      form.set("height", String(annotated.height));
      form.set("annotated", annotated.blob, "annotated.jpg");
      if (clientId) form.set("clientId", clientId);
      if (current.local) {
        form.set("original", current.blob, "original.jpg");
        form.set("takenAt", current.takenAt);
        setProgress("Envoi de la photo…");
        const response = await authFetch(`/api/previsits/${current.visitKey}/photos`, { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Envoi impossible.");
        const previewUrl = URL.createObjectURL(annotated.blob);
        setPhotos(list => [...list, { ...data.photo, previewUrl, originalUrl: current.imageSrc, marks: payload.marks }]);
      } else {
        const response = await authFetch(`/api/previsits/${current.visitKey}/photos/${current.id}`, { method: "PATCH", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Mise à jour impossible.");
        const previewUrl = URL.createObjectURL(annotated.blob);
        setPhotos(list => list.map(item => item.id === current.id ? { ...item, ...data.photo, previewUrl, marks: payload.marks } : item));
      }
      setEditor(null);
      if (pendingFiles.current.length) await openNextFile(pendingFiles.current, current.visitKey);
    } catch (err) {
      setError(String(err.message || "Enregistrement de la photo impossible."));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function removePhoto(photo) {
    if (!window.confirm("Supprimer cette photo et ses annotations ?")) return;
    setBusy(photo.id);
    setError("");
    try {
      const response = await authFetch(`/api/previsits/${visitKey}/photos/${photo.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Suppression impossible.");
      setPhotos(list => list.filter(item => item.id !== photo.id));
    } catch (err) {
      setError(String(err.message || "Suppression impossible."));
    } finally {
      setBusy("");
    }
  }

  async function previewReport(url) {
    const tab = reservePdfTab();
    const file = await authFetch(url || reportUrl);
    if (!file.ok) {
      try { tab?.close(); } catch { /* ignore */ }
      throw new Error("Lecture du PDF impossible.");
    }
    const blob = await file.blob();
    const info = typeof getMeta === "function" ? getMeta() : meta;
    triggerBlobDownload(blob, documentPdfFilename({
      kind: "Prévisite",
      title: info?.number,
      source: { client: info?.client, lastName: info?.lastName, firstName: info?.firstName },
    }), tab);
  }

  async function openReport() {
    setBusy("report");
    setError("");
    try {
      await previewReport(reportUrl);
    } catch (err) {
      setError(String(err.message || "Lecture du PDF impossible."));
    } finally {
      setBusy("");
    }
  }

  async function generateReport() {
    if (!photos.length) {
      setError("Ajoutez au moins une photo avant de générer le PDF.");
      return;
    }
    if (!clientId) {
      setError("Rattachez un client avant de générer le PDF.");
      return;
    }
    setBusy("report");
    setError("");
    setProgress("Composition du rapport…");
    try {
      const pages = await composeReportPageJpegs({
        photos: photos.map(photo => ({
          src: photo.previewUrl,
          caption: photo.caption,
          comment: photo.comment,
          width: photo.width,
          height: photo.height,
        })),
        meta: {
          ...meta,
          ...(getMeta?.() || {}),
          generatedAt: new Date().toLocaleString("fr-FR"),
        },
        logo: "/mkl-energies.png",
      });
      const form = new FormData();
      form.set("clientId", clientId);
      form.set("title", `Prévisite ${(getMeta?.() || meta).number || visitKey}`);
      pages.forEach((blob, index) => form.append("pages", blob, `page-${index + 1}.jpg`));
      setProgress("Enregistrement du PDF…");
      const response = await authFetch(`/api/previsits/${visitKey}/report`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Génération impossible.");
      const fileUrl = `/api/previsits/${visitKey}/report/file`;
      setReportUrl(fileUrl);
      await previewReport(fileUrl);
    } catch (err) {
      setError(String(err.message || "Génération du PDF impossible."));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  return (
    <section className="paper previsit-photos-paper">
      <div className="document-head compact">
        <img src="/mkl-energies.png" alt={companyName} />
        <div>
          <span>CHANTIER</span>
          <h1>Photos techniques</h1>
          <p>Prise de vue, implantation des équipements et rapport PDF.</p>
        </div>
      </div>
      <div className="previsit-photos-toolbar">
        <PrevisitPhotoCapture onPick={pickFiles} busy={Boolean(busy)} />
        <button type="button" className="previsit-report-btn" disabled={Boolean(busy)} onClick={generateReport}>
          <FileText size={18} />Générer le rapport PDF
        </button>
        {reportUrl && (
          <button type="button" className="previsit-report-link" disabled={Boolean(busy)} onClick={openReport}>
            Ouvrir le dernier PDF
          </button>
        )}
      </div>
      {progress && <p className="previsit-photo-progress"><LoaderCircle size={16} className="spin" />{progress}</p>}
      {error && <p className="previsit-photo-error">{error}</p>}
      <PrevisitPhotoGallery
        photos={photos}
        onEdit={photo => setEditor({
          ...photo,
          visitKey,
          imageSrc: photo.originalUrl || photo.previewUrl,
          marks: photo.marks || [],
        })}
        onRemove={removePhoto}
      />
      {editor && (
        <PrevisitPhotoEditor
          imageSrc={editor.imageSrc}
          initialMarks={editor.marks || []}
          caption={editor.caption || ""}
          comment={editor.comment || ""}
          busy={busy === "save"}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}
    </section>
  );
}
