"use client";

import { useEffect } from "react";

function isBlockedShortcut(event) {
  const key = String(event.key || "");
  if (key === "PrintScreen") return true;
  if (event.ctrlKey && event.shiftKey && key.toLowerCase() === "s") return true;
  if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "p") return true;
  return false;
}

export default function CaptureGuard({ enabled = false, label = "MKL Énergies" }) {
  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add("capture-locked");
    const blockKey = event => {
      if (!isBlockedShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const blockPrint = event => event.preventDefault();
    document.addEventListener("keydown", blockKey, true);
    document.addEventListener("keyup", blockKey, true);
    window.addEventListener("beforeprint", blockPrint);
    return () => {
      document.body.classList.remove("capture-locked");
      document.removeEventListener("keydown", blockKey, true);
      document.removeEventListener("keyup", blockKey, true);
      window.removeEventListener("beforeprint", blockPrint);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div className="capture-watermark" data-label={label} aria-hidden="true" />;
}
