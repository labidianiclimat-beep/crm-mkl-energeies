"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Download, Eye, FileText, Plus, Trash2 } from "lucide-react";
import { reservePdfTab, triggerBlobDownload } from "../lib/html-to-pdf";
import { documentPdfFilename } from "../lib/record-documents";
import { authFetch } from "../lib/supabase-rest";
import {
  CLIENT_DOCUMENT_KIND_GROUPS,
  CLIENT_DOCUMENT_KINDS,
  MAX_CLIENT_DOCUMENT_PAGES,
  isPersistedClientId,
  nextAvailableDocumentKind,
} from "../lib/client-documents";
import { CLIENT_PORTAL_FIELDS, emptyClientPortalAccess, normalizeClientPortalAccess } from "../lib/client-portal";

async function fileToJpegBlob(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Conversion JPEG impossible."))),
      "image/jpeg",
      quality
    );
  });
}

async function compressPages(files) {
  let blobs = await Promise.all(files.map(file => fileToJpegBlob(file, 1600, 0.72)));
  const total = blobs.reduce((sum, blob) => sum + blob.size, 0);
  if (total > 3_600_000) {
    blobs = await Promise.all(files.map(file => fileToJpegBlob(file, 1280, 0.58)));
  }
  return blobs;
}

export default function ClientDocumentVault({ client, prospect, captureOpen = false, onCaptureOpenChange }) {
  const owner = prospect || client;
  const ownerId = owner?.id;
  const apiBase = prospect ? `/api/prospects/${ownerId}/documents` : `/api/clients/${ownerId}/documents`;
  const persisted = isPersistedClientId(ownerId);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const panelRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [previews, setPreviews] = useState({});
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(persisted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(CLIENT_DOCUMENT_KINDS[0]);
  const [title, setTitle] = useState("");
  const [pages, setPages] = useState([]);
  const [access, setAccess] = useState(emptyClientPortalAccess);
  const [accessNote, setAccessNote] = useState("");
  const accessTimer = useRef(null);
  const pendingAccess = useRef(emptyClientPortalAccess());
  const showAccess = Boolean(client && !prospect && persisted);

  useEffect(() => {
    if (!persisted) {
      setDocuments([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    authFetch(`${apiBase}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Chargement impossible.");
        if (!cancelled) setDocuments(data.documents || []);
      })
      .catch(err => {
        if (!cancelled) setError(String(err.message || "Chargement impossible."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ownerId, persisted, apiBase]);

  useEffect(() => {
    if (!showAccess) {
      setAccess(emptyClientPortalAccess());
      return undefined;
    }
    let cancelled = false;
    authFetch(`/api/clients/${ownerId}/access`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Chargement des accès impossible.");
        if (!cancelled) setAccess(normalizeClientPortalAccess(data.access));
      })
      .catch(err => {
        if (!cancelled) setError(String(err.message || "Chargement des accès impossible."));
      });
    return () => { cancelled = true; };
  }, [ownerId, showAccess]);

  useEffect(() => () => clearTimeout(accessTimer.current), []);

  function updateAccess(patch) {
    setAccess(current => {
      const next = { ...current, ...patch };
      pendingAccess.current = next;
      return next;
    });
    setAccessNote("");
    clearTimeout(accessTimer.current);
    accessTimer.current = setTimeout(async () => {
      try {
        const response = await authFetch(`/api/clients/${ownerId}/access`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access: pendingAccess.current }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Enregistrement impossible.");
        setAccessNote("Accès enregistrés");
      } catch (err) {
        setError(String(err.message || "Enregistrement impossible."));
      }
    }, 400);
  }

  const accessFields = showAccess ? (
    <div className="client-vault-access">
      {CLIENT_PORTAL_FIELDS.map(field => (
        <label className="client-vault-access-row" key={field.id}>
          <input
            type="checkbox"
            checked={Boolean(access[`${field.id}On`])}
            onChange={event => updateAccess({ [`${field.id}On`]: event.target.checked })}
            aria-label={field.label}
          />
          <span>{field.label}</span>
          <input
            type="text"
            value={access[field.id] || ""}
            autoComplete="off"
            spellCheck={false}
            onChange={event => updateAccess({ [field.id]: event.target.value })}
          />
        </label>
      ))}
      {accessNote ? <p className="client-vault-hint">{accessNote}</p> : null}
    </div>
  ) : null;

  useEffect(() => {
    return () => pages.forEach(page => URL.revokeObjectURL(page.preview));
  }, [pages]);

  useEffect(() => {
    if (!persisted || !documents.length) {
      setPreviews({});
      return undefined;
    }
    let cancelled = false;
    const created = [];
    Promise.all(
      documents.map(async document => {
        const response = await authFetch(`${apiBase}/${document.id}?preview=1`);
        if (!response.ok) return [document.id, ""];
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [document.id, url];
      })
    ).then(entries => {
      if (cancelled) {
        created.forEach(url => URL.revokeObjectURL(url));
        return;
      }
      setPreviews(Object.fromEntries(entries));
    }).catch(() => {
      if (!cancelled) setPreviews({});
    });
    return () => {
      cancelled = true;
      created.forEach(url => URL.revokeObjectURL(url));
    };
  }, [apiBase, documents, persisted]);

  useEffect(() => {
    if (!captureOpen) return;
    setOpen(true);
    setError(persisted ? "" : "Enregistrez d’abord la fiche pour y ranger les photos.");
    onCaptureOpenChange?.(false);
    window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
  }, [captureOpen, persisted, onCaptureOpenChange]);

  function nextKind(afterKind) {
    const used = new Set(documents.map(document => document.kind));
    used.add(afterKind);
    return CLIENT_DOCUMENT_KINDS.find(item => !used.has(item)) || CLIENT_DOCUMENT_KINDS[0];
  }

  function isPdfFile(file) {
    return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
  }

  async function addFiles(fileList) {
    const incoming = [...fileList].filter(file => file.type.startsWith("image/") || isPdfFile(file));
    if (!incoming.length) {
      setError("Prenez une photo, ou choisissez une image ou un PDF.");
      return;
    }
    const pdfs = incoming.filter(isPdfFile);
    const images = incoming.filter(file => !isPdfFile(file));
    if (pdfs.length && (images.length || pdfs.length > 1 || pages.length)) {
      setError("Ajoutez des photos, ou un seul fichier PDF.");
      return;
    }
    if (pdfs.length === 1) {
      const file = pdfs[0];
      if (file.size > 3_800_000) {
        setError("Le PDF est trop lourd.");
        return;
      }
      setError("");
      setPages([{ blob: file, preview: "", name: file.name || "document.pdf", pdf: true }]);
      return;
    }
    if (pages.some(page => page.pdf)) {
      setError("Ajoutez des photos, ou un seul fichier PDF.");
      return;
    }
    if (pages.length + images.length > MAX_CLIENT_DOCUMENT_PAGES) {
      setError(`${MAX_CLIENT_DOCUMENT_PAGES} pages maximum par document.`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const blobs = await compressPages(images);
      setPages(current => [
        ...current,
        ...blobs.map((blob, index) => ({
          blob,
          preview: URL.createObjectURL(blob),
          name: images[index]?.name || `page-${current.length + index + 1}`,
          pdf: false,
        })),
      ]);
    } catch (err) {
      setError(String(err.message || "Photo illisible."));
    } finally {
      setBusy(false);
    }
  }

  function removePage(index) {
    setPages(current => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      URL.revokeObjectURL(current[index]?.preview);
      return next;
    });
  }

  async function saveDocument() {
    if (!pages.length) {
      setError("Prenez au moins une photo.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("title", title);
      pages.forEach((page, index) => {
        form.append("pages", page.blob, page.pdf ? (page.name || "document.pdf") : `page-${index + 1}.jpg`);
      });
      const response = await authFetch(`${apiBase}`, {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible.");
      setDocuments(current => [data.document, ...current]);
      pages.forEach(page => URL.revokeObjectURL(page.preview));
      setPages([]);
      setTitle("");
      setKind(nextKind(kind));
    } catch (err) {
      setError(String(err.message || "Enregistrement impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocument(document) {
    setError("");
    const tab = reservePdfTab();
    try {
      const response = await authFetch(`${apiBase}/${document.id}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Téléchargement impossible.");
      }
      triggerBlobDownload(await response.blob(), documentPdfFilename({ kind: document.kind || "Document", source: owner }), tab);
    } catch (err) {
      try { tab?.close(); } catch { /* ignore */ }
      setError(String(err.message || "Téléchargement impossible."));
    }
  }

  async function openDocument(document) {
    setError("");
    const tab = reservePdfTab();
    try {
      const response = await authFetch(`${apiBase}/${document.id}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ouverture impossible.");
      }
      triggerBlobDownload(await response.blob(), documentPdfFilename({ kind: document.kind || "Document", source: owner }), tab);
    } catch (err) {
      try { tab?.close(); } catch { /* ignore */ }
      setError(String(err.message || "Ouverture impossible."));
    }
  }

  async function deleteDocument(document) {
    if (!window.confirm(`Supprimer « ${document.kind} » ?`)) return;
    setError("");
    try {
      const response = await authFetch(`${apiBase}/${document.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Suppression impossible.");
      setDocuments(current => current.filter(item => item.id !== document.id));
      setSelected(current => current.filter(id => id !== document.id));
    } catch (err) {
      setError(String(err.message || "Suppression impossible."));
    }
  }

  function toggleSelected(id) {
    setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelected(current => (current.length === documents.length ? [] : documents.map(document => document.id)));
  }

  async function downloadSelected() {
    if (!selected.length) {
      setError("Cochez au moins un justificatif.");
      return;
    }
    setBusy(true);
    setError("");
    const tab = reservePdfTab();
    try {
      const response = await authFetch(`${apiBase}/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || type.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Téléchargement impossible.");
      }
      const blob = await response.blob();
      const count = selected.length;
      const picked = documents.find(doc => doc.id === selected[0]);
      triggerBlobDownload(blob, count === 1
        ? documentPdfFilename({ kind: picked?.kind || "Document", source: owner })
        : documentPdfFilename({ kind: "Justificatifs", source: owner }), tab);
    } catch (err) {
      try { tab?.close(); } catch { /* ignore */ }
      setError(String(err.message || "Téléchargement impossible."));
    } finally {
      setBusy(false);
    }
  }

  const allSelected = documents.length > 0 && selected.length === documents.length;

  return (
    <div className="client-vault" ref={panelRef}>
      <div className="client-vault-head">
        <div>
          <b>Justificatifs photographiés</b>
          <small>Choisissez le type, prenez la photo. Chaque document reste distinct, avec son nom sous l’image.</small>
        </div>
        <button type="button" className="client-photo-button" onClick={() => setOpen(current => !current)} disabled={busy}>
          <Camera size={16} />
          Photographier un document
        </button>
      </div>

      {!persisted && (
        <p className="client-vault-hint">Enregistrez d’abord la fiche pour y ranger les photos.</p>
      )}
      {!open && accessFields}

      {open && persisted && (
        <div className="client-vault-capture">
          <div className="client-vault-kind-groups">
            {CLIENT_DOCUMENT_KIND_GROUPS.map(group => (
              <div className="client-vault-kind-group" key={group.id}>
                <span>{group.label}</span>
                <div className="client-vault-kinds">
                  {group.kinds.map(item => (
                    <button
                      type="button"
                      key={item}
                      className={kind === item ? "active" : ""}
                      onClick={() => setKind(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {accessFields}
          <label>
            Libellé (optionnel)
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder={`Ex. ${kind} 2025…`}
            />
          </label>
          <p className="client-vault-step">2. Prenez la photo ou choisissez un PDF</p>
          <div className="client-vault-shots">
            {pages.map((page, index) => (
              <figure key={page.preview || page.name}>
                {page.preview
                  ? <img src={page.preview} alt={`${kind} page ${index + 1}`} />
                  : <span className="client-vault-pdf">{page.name}</span>}
                <figcaption>{kind}</figcaption>
                <button type="button" onClick={() => removePage(index)}>Retirer</button>
              </figure>
            ))}
          </div>
          <div className="client-vault-actions">
            <button type="button" className="client-photo-button" onClick={() => cameraRef.current?.click()} disabled={busy || pages.some(page => page.pdf) || pages.length >= MAX_CLIENT_DOCUMENT_PAGES}>
              <Camera size={16} />
              {pages.length ? "Ajouter une page" : "Ouvrir la caméra"}
            </button>
            <button type="button" className="secondary" onClick={() => galleryRef.current?.click()} disabled={busy || pages.length >= MAX_CLIENT_DOCUMENT_PAGES}>
              <Plus size={16} />
              Photo ou PDF
            </button>
            <button type="button" className="client-photo-button" onClick={saveDocument} disabled={busy || !pages.length}>
              <FileText size={16} />
              {busy ? "Enregistrement…" : `Enregistrer « ${kind} »`}
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={event => {
              addFiles(event.target.files || []);
              event.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            hidden
            onChange={event => {
              addFiles(event.target.files || []);
              event.target.value = "";
            }}
          />
        </div>
      )}

      {error && <p className="client-vault-error">{error}</p>}

      {documents.length > 0 && (
        <div className="client-vault-toolbar">
          <label>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Tout sélectionner
          </label>
          <button type="button" className="client-photo-button" onClick={downloadSelected} disabled={busy || !selected.length}>
            <Download size={16} />
            {selected.length <= 1
              ? "Télécharger le PDF"
              : `Télécharger ${selected.length} documents en un PDF`}
          </button>
        </div>
      )}

      <div className="client-vault-grid">
        {loading && <p className="client-vault-hint">Chargement des justificatifs…</p>}
        {!loading && persisted && documents.length === 0 && (
          <p className="client-vault-hint">Aucun justificatif photographié pour le moment.</p>
        )}
        {documents.map(document => {
          const checked = selected.includes(document.id);
          return (
            <article className={`client-vault-card${checked ? " selected" : ""}`} key={document.id}>
              <label className="client-vault-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelected(document.id)}
                  aria-label={`Sélectionner ${document.kind}`}
                />
              </label>
              <button type="button" className="client-vault-thumb" onClick={() => openDocument(document)}>
                {previews[document.id]
                  ? <img src={previews[document.id]} alt={document.kind} />
                  : <FileText size={28} />}
              </button>
              <figcaption>
                <b>{document.kind}</b>
                {document.title && document.title !== document.kind && <small>{document.title}</small>}
              </figcaption>
              <div className="client-vault-card-actions">
                <button type="button" onClick={() => openDocument(document)}>
                  <Eye size={14} />
                  Voir
                </button>
                <button type="button" onClick={() => downloadDocument(document)}>
                  <Download size={14} />
                  Télécharger
                </button>
                <button type="button" className="trash" onClick={() => deleteDocument(document)} aria-label="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
