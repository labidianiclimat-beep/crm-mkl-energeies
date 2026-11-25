"use client";

import { useEffect } from "react";
import { authFetch } from "../lib/supabase-rest";

const HEARTBEAT_MS = 60_000;

export default function UsageTracker({ module }) {
  useEffect(() => {
    let stopped = false;

    async function ping({ keepalive = false } = {}) {
      if (stopped) return;
      if (!keepalive && typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        await authFetch("/api/usage/heartbeat", {
          method: "POST",
          keepalive,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module: module || "Applications" }),
        });
      } catch {
        /* présence optionnelle : ne jamais bloquer le CRM */
      }
    }

    ping();
    const interval = setInterval(() => ping(), HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    const onHide = () => ping({ keepalive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [module]);

  return null;
}
