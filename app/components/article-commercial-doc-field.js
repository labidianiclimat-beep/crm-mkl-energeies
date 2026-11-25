"use client";

import { useRef, useState } from "react";
import { Download, FilePlus2, X } from "lucide-react";
import {
  COMMERCIAL_DOC_MAX_BYTES,
  articleHasCommercialDoc,
  downloadArticleCommercialDoc,
} from "../lib/article-commercial-doc";

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.readAsDataURL(file);
  });
}

export default function ArticleCommercialDocField({
  initialName = "",
  initialData = "",
}) {
  const inputRef = useRef(null);
  const [ficheName, setFicheName] = useState(initialName || "");
  const [ficheData, setFicheData] = useState(initialData || "");
  const [error, setError] = useState("");
  const canDownload = articleHasCommercialDoc({ ficheData });

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > COMMERCIAL_DOC_MAX_BYTES) {
      setError("PDF trop lourd (1,8 Mo max) pour rester lié à l’article.");
      return;
    }
    try {
      setFicheName(file.name);
      setFicheData(await readAsDataUrl(file));
    } catch (readError) {
      setError(readError.message || "Import impossible.");
    }
  }

  return (
    <div className="article-pdf-attach">
      <div>
        <b>PDF commercial</b>
        <span>Ajoutez un PDF : il pourra être coché sur le devis, puis imprimé après le devis dans l’ordre des articles.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        hidden
        onChange={onFileChange}
      />
      <div className="article-pdf-attach-actions">
        <button type="button" className="primary" onClick={() => inputRef.current?.click()}>
          <FilePlus2 size={16} />
          {ficheName ? "Remplacer le PDF" : "Ajouter un PDF"}
        </button>
        {canDownload ? (
          <button
            type="button"
            className="secondary"
            onClick={() => downloadArticleCommercialDoc({ ficheName, ficheData })}
          >
            <Download size={16} /> Télécharger
          </button>
        ) : null}
        {ficheName ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setFicheName("");
              setFicheData("");
              setError("");
            }}
          >
            <X size={16} /> Retirer
          </button>
        ) : null}
      </div>
      {ficheName ? <em>Document lié : {ficheName}</em> : <em>Aucun PDF pour le moment.</em>}
      {error ? <small className="field-error">{error}</small> : null}
      <input type="hidden" name="ficheName" value={ficheName} />
      <input type="hidden" name="ficheData" value={ficheData} />
    </div>
  );
}
