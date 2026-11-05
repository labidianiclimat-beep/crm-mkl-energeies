"use client";

import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";

export default function PrevisitPhotoCapture({ onPick, busy = false }) {
  const cameraRef = useRef(null);
  const filesRef = useRef(null);

  function change(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (files.length) onPick?.(files);
  }

  return (
    <>
      <button type="button" className="previsit-photo-capture" disabled={busy} onClick={() => cameraRef.current?.click()}>
        <Camera size={20} />Prendre une photo
      </button>
      <button type="button" className="previsit-photo-import" disabled={busy} onClick={() => filesRef.current?.click()}>
        <ImagePlus size={20} />Importer
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={change} />
      <input ref={filesRef} type="file" accept="image/*" multiple hidden onChange={change} />
    </>
  );
}
