"use client";

import { useState } from "react";

export default function CopyNumber({ value }) {
  const text = String(value || "").trim();
  const [done, setDone] = useState(false);
  if (!text) return <span className="copy-number is-empty"><b>—</b></span>;

  async function copy(event) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1400);
  }

  return (
    <button
      type="button"
      className={`copy-number${done ? " is-copied" : ""}`}
      onClick={copy}
      onMouseDown={event => event.stopPropagation()}
      aria-label={done ? `${text} copié` : `Copier ${text}`}
    >
      <b>{text}</b>
      <em>{done ? "Copié" : "Copier"}</em>
    </button>
  );
}
