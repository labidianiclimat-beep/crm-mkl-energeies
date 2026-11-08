"use client";

import { useEffect, useRef, useState } from "react";

export default function QuoteBundleHeading({
  title = "",
  placeholder = "Ajouter un surtitre",
  onChange,
  editable = true,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(title || "");
  }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = String(draft || "").trim();
    setEditing(false);
    setDraft(next);
    if (next !== String(title || "").trim()) onChange?.(next);
  }

  if (!editable && !title) return null;

  return (
    <div className={`quote-bundle-heading${title ? "" : " is-empty"}`}>
      {editable && editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(title || "");
              setEditing(false);
            }
          }}
          placeholder={placeholder}
          aria-label="Surtitre du groupe"
        />
      ) : (
        <button type="button" onClick={() => editable && setEditing(true)} disabled={!editable}>
          <b>{title || placeholder}</b>
        </button>
      )}
    </div>
  );
}
